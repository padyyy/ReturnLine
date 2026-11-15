"""Geografischer Zuschnitt sämtlicher geladenen Layer auf das feste Marsraster.

Dieses Modul hat keine GUI-Abhängigkeiten und enthält keine A*-Funktionalität.
Ausgabe-GeoTIFFs nutzen alle dieselbe lokale Marsprojektion, Rastergröße,
Affine-Transformation und Zeilen/Spalten-Indizierung. CSV-Punkte werden zudem
als Originalmessungen geografisch gefiltert, OHNE sie zu interpolieren.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
from typing import Callable, Iterable

import numpy as np
from pyproj import CRS
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import Affine
from rasterio.warp import reproject
from PIL import Image
from scipy.spatial import cKDTree

from .core import (
    GeoMappingError, GeoRaster, CsvPointLayer, MARS_SPHERE_GEO_CRS,
    _transformer, _mars_compatible_proj_transformer, _match_column,
    _as_number, convert_xy,
)
from .local_grid import LocalMetricGrid


@dataclass(frozen=True)
class ExportLayer:
    name: str
    kind: str  # 'map', 'raster', 'csv'
    source: GeoRaster | CsvPointLayer


def _check_mars_crs(crs: CRS) -> None:
    """Explizit Erdprojektionen ablehnen; keine stille Erdkugel-Transformation."""
    g = crs if crs.is_geographic else crs.geodetic_crs
    if g is None:
        raise GeoMappingError('GeoTIFF braucht ein geografisches/projiziertes Mars-CRS.')
    major = float(g.ellipsoid.semi_major_metre)
    minor = float(g.ellipsoid.semi_minor_metre)
    if not all(3_350_000 <= a <= 3_430_000 for a in (major,minor)):
        raise GeoMappingError(f'Kein Mars-Referenzkörper: {major:g} x {minor:g} m.')


def output_crs(grid: LocalMetricGrid) -> CRS:
    """Projektion passend zur Meter-/Nord-/Ost-Definition von LocalMetricGrid."""
    return CRS.from_proj4(
        f'+proj=eqc +lat_0={grid.reference_latitude} '
        f'+lon_0={grid.reference_longitude} '
        f'+lat_ts={grid.reference_latitude} +R={grid.mars_radius_m} '
        '+units=m +no_defs +type=crs'
    )


def output_transform(grid: LocalMetricGrid) -> Affine:
    return Affine(grid.cell_size_m, 0.0, grid._left_x,
                  0.0, -grid.cell_size_m, grid._top_y)


def _safe_filename(value: str) -> str:
    name = re.sub(r'[^a-zA-Z0-9_-]+', '_', value.strip()).strip('_')
    return name[:75] or 'layer'


def _source_to_mars(lon: np.ndarray, lat: np.ndarray, source_crs: CRS):
    target = CRS.from_user_input(MARS_SPHERE_GEO_CRS)
    if source_crs.equals(target):
        return np.asarray(lon), np.asarray(lat)
    try:
        transform = _transformer(source_crs.to_wkt(), target.to_wkt())
        xx, yy = transform.transform(lon, lat, errcheck=True)
    except Exception:
        transform = _mars_compatible_proj_transformer(source_crs.to_wkt(), target.to_wkt())
        xx, yy = transform.transform(lon, lat, errcheck=True)
    return np.asarray(xx), np.asarray(yy)


def _selected_csv_indices(layer: CsvPointLayer, grid: LocalMetricGrid) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Indizes, Mars-Longitude/Latitude aller *tatsächlich im Zielgebiet* liegenden Punkte."""
    xyz = layer.tree.data
    lat = np.rad2deg(np.arcsin(np.clip(xyz[:, 2], -1.0, 1.0)))
    lon = np.rad2deg(np.arctan2(xyz[:, 1], xyz[:, 0])) % 360.0
    lon, lat = _source_to_mars(lon, lat, layer.crs)
    dlon = ((lon - grid.reference_longitude + 180.0) % 360.0) - 180.0
    east = grid.mars_radius_m * math.cos(math.radians(grid.reference_latitude)) * np.deg2rad(dlon)
    north = grid.mars_radius_m * np.deg2rad(lat - grid.reference_latitude)
    x = east - grid._left_x
    y = grid._top_y - north
    chosen = (np.isfinite(x) & np.isfinite(y) & (x >= 0) & (y >= 0) &
              (x < grid.width_m) & (y < grid.height_m))
    return np.flatnonzero(chosen), lon[chosen], lat[chosen]


def _raster_warp(layer: GeoRaster, grid: LocalMetricGrid,
                 *, resampling: str) -> tuple[np.ndarray, np.ndarray]:
    """Georeferenzierte Quellbänder -> gemeinsames Zielraster, NaN außerhalb."""
    h, w = grid.rows, grid.columns
    dst = np.full((layer.ds.count, h, w), np.nan, dtype=np.float32)
    src = layer.ds
    _check_mars_crs(layer.crs)
    for i in range(src.count):
        reproject(
            source=rasterio.band(src, i+1), destination=dst[i],
            src_transform=src.transform, src_crs=src.crs,
            src_nodata=src.nodatavals[i], dst_transform=output_transform(grid),
            dst_crs=output_crs(grid).to_wkt(), dst_nodata=np.nan,
            init_dest_nodata=True,
            resampling=Resampling.bilinear if resampling == 'bilinear' else Resampling.nearest,
            num_threads=2,
        )
    # Nur das Zielraster auswerten: KEINE globale Quellmaske einlesen.
    # So bleiben selbst sehr große (mehrere GB) Eingangsdaten verwendbar.
    valid = np.any(np.isfinite(dst), axis=0)
    dst[:, ~valid] = np.nan
    return dst, valid


def _csv_raster(layer: CsvPointLayer, grid: LocalMetricGrid, chosen: np.ndarray,
                *, batch: int = 65536) -> tuple[np.ndarray, np.ndarray]:
    """Nächster Punkt NUR innerhalb des Zuschnitts und NUR im Suchradius.

    Das ist eine diskrete Punktzuordnung, KEINE flächenhafte Messung und keine
    räumliche Interpolation. Ungemessene Zellen bleiben NaN.
    """
    h, w = grid.rows, grid.columns
    out = np.full((len(layer.columns), h*w), np.nan, dtype=np.float32)
    if not len(chosen):
        return out.reshape((-1, h, w)), np.zeros((h,w), bool)
    tree = cKDTree(layer.tree.data[chosen])
    chord_limit = 2*math.sin(min(layer.radius_m/layer.radius_sphere, math.pi)/2)
    for start in range(0, h*w, batch):
        ends = min(start+batch, h*w)
        flat = np.arange(start, ends)
        y = flat // w
        x = flat % w
        # Zellmittelpunkte statt ganzes riesiges Koordinatennetz.
        east = grid._left_x + (x+0.5)*grid.cell_size_m
        north = grid._top_y - (y+0.5)*grid.cell_size_m
        lons = grid.reference_longitude + np.rad2deg(east / (
            grid.mars_radius_m*math.cos(math.radians(grid.reference_latitude))))
        lats = grid.reference_latitude + np.rad2deg(north/grid.mars_radius_m)
        # Query-Punkte im ursprünglichen CSV-CRS, analog zum GeoTIFF-Import.
        mars_source = CRS.from_user_input(MARS_SPHERE_GEO_CRS)
        if not mars_source.equals(layer.crs):
            try:
                trans = _transformer(mars_source.to_wkt(), layer.crs.to_wkt())
                lons, lats = trans.transform(lons, lats, errcheck=True)
            except Exception:
                trans = _mars_compatible_proj_transformer(mars_source.to_wkt(), layer.crs.to_wkt())
                lons, lats = trans.transform(lons, lats, errcheck=True)
        phi, lam = np.deg2rad(lats), np.deg2rad(lons)
        xyz = np.column_stack((np.cos(phi)*np.cos(lam),
                               np.cos(phi)*np.sin(lam), np.sin(phi)))
        dist, idx = tree.query(xyz, distance_upper_bound=chord_limit)
        ok = np.isfinite(dist) & (idx < len(chosen))
        if np.any(ok):
            vals = layer.rows[chosen[idx[ok]]].T
            out[:, start:ends][:, ok] = vals
    out = out.reshape((len(layer.columns), h, w))
    return out, np.any(np.isfinite(out), axis=0)


def _write_raster(path: Path, data: np.ndarray, grid: LocalMetricGrid,
                  descriptions: list[str], *, units: tuple[str,...] = ()) -> None:
    kwargs = dict(driver='GTiff', width=grid.columns, height=grid.rows,
                  count=data.shape[0], dtype='float32', crs=output_crs(grid).to_wkt(),
                  transform=output_transform(grid), nodata=np.nan,
                  tiled=True, compress='deflate', predictor=3,
                  BIGTIFF='IF_SAFER')
    with rasterio.open(path, 'w', **kwargs) as ds:
        ds.write(data)
        for i, desc in enumerate(descriptions, 1):
            ds.set_band_description(i, desc)
            if i <= len(units) and units[i-1]:
                ds.set_band_unit(i, units[i-1])
        ds.update_tags(reference_latitude=str(grid.reference_latitude),
                       reference_longitude=str(grid.reference_longitude),
                       sampling_note='Cell centre; target fixed grid; NoData=NaN')



def _write_image_png(path: Path, data: np.ndarray) -> None:
    """Sichtbares Kartenbild mit Transparenz, exakt in Zielraster-Pixeln."""
    height, width = data.shape[1:]
    valid = np.any(np.isfinite(data), axis=0)
    if data.shape[0] >= 3:
        rgb = np.clip(np.nan_to_num(data[:3], nan=0.0), 0, 255).astype(np.uint8)
        rgb = np.moveaxis(rgb, 0, -1)
    else:
        band = data[0]
        present = band[valid & np.isfinite(band)]
        if present.size:
            lo, hi = np.percentile(present, [2, 98])
            scaled = np.clip((band-lo) * 255 / (hi-lo), 0, 255) if hi > lo else np.full((height,width), 150)
            grey = np.nan_to_num(scaled, nan=0).astype(np.uint8)
        else:
            grey = np.zeros((height,width), np.uint8)
        rgb = np.repeat(grey[..., None], 3, axis=-1)
    alpha = (valid*255).astype(np.uint8)
    Image.fromarray(np.dstack((rgb,alpha)), mode='RGBA').save(path)


def _band_statistics(data: np.ndarray, labels: list[str]) -> list[dict]:
    statistics=[]
    for band, label in zip(data,labels):
        values = band[np.isfinite(band)]
        if values.size:
            statistics.append({'name':label,'valid_cells':int(values.size),
                'min':float(values.min()),'max':float(values.max()),
                'mean':float(values.mean())})
        else:
            statistics.append({'name':label,'valid_cells':0,
                               'min':None,'max':None,'mean':None})
    return statistics


def _write_grid_csv(path: Path, grid: LocalMetricGrid, data: np.ndarray,
                    descriptions: list[str]) -> int:
    """Nur gültige Rasterzellen exportieren, inkl. stabiler 0-basierter Indizes."""
    total = 0
    with path.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['X','Y','Latitude (N)','Longitude (E)',*descriptions])
        for y in range(grid.rows):
            for x in range(grid.columns):
                values = data[:, y, x]
                if not np.isfinite(values).any():
                    continue
                lon, lat = grid.lonlat_center(x, y)
                writer.writerow([x, y, f'{lat:.10f}', f'{lon:.10f}',
                                 *[f'{float(v):.7g}' if np.isfinite(v) else '' for v in values]])
                total += 1
    return total


def _write_raw_csv(path: Path, layer: CsvPointLayer, grid: LocalMetricGrid) -> int:
    """Originale CSV-Spalten/Textwerte behalten; nur Punkte im Gebiet.

    Output: Originalspalten, dazu lokale Grid_X/Grid_Y-Indizes.
    Keine nearest-neighbor-Ergänzung und keine Rundung der Originalmesswerte.
    """
    count=0
    source_path=layer.path
    source_crs=layer.crs
    mars_crs=CRS.from_user_input(MARS_SPHERE_GEO_CRS)
    with source_path.open('r',encoding='utf-8-sig',newline='') as source:
        preview=source.read(4096)
        source.seek(0)
        try:
            delim=csv.Sniffer().sniff(preview,delimiters=',;\t').delimiter
        except csv.Error:
            delim=','
        reader=csv.DictReader(source,delimiter=delim)
        columns=list(reader.fieldnames or [])
        lat_col=_match_column(columns,('Latitude (N)','Latitude','Lat','N'))
        lon_col=_match_column(columns,('Longitude (E)','Longitude','Lon','Long','E'))
        if lat_col is None or lon_col is None:
            raise GeoMappingError('CSV hat keine gültigen Latitude-/Longitude-Spalten.')
        with path.open('w',encoding='utf-8',newline='') as target:
            writer=csv.writer(target)
            writer.writerow([*columns,'Grid_X','Grid_Y'])
            for row in reader:
                lat=_as_number(row.get(lat_col))
                lon=_as_number(row.get(lon_col))
                if lat is None or lon is None or not -90<=lat<=90:
                    continue
                if not source_crs.equals(mars_crs):
                    lon,lat=convert_xy(lon,lat,source_crs,mars_crs)
                xy=grid.xy(lon,lat)
                if xy is None:
                    continue
                writer.writerow([row.get(col,'') for col in columns]+[xy[0],xy[1]])
                count+=1
    return count


def export_region(grid: LocalMetricGrid, layers: Iterable[ExportLayer],
                  output_directory: str | Path, *, resampling: str = 'nearest',
                  export_grid_csv: bool = True,
                  progress: Callable[[str], None] | None = None) -> dict:
    """Export aller übergebenen Layer in DIESELBE feste Rasterregion.

    Raster + Karten -> aligned GeoTIFF; Messwerte optional zusätzlich als CSV.
    JMARS-CSV -> exakte Messpunkte zugeschnitten + optional nearest-with-radius-
    Grid, ohne Messwerte außerhalb des Gebiets zu berücksichtigen.
    """
    if not isinstance(grid, LocalMetricGrid) or grid.reference_position != 'center':
        raise ValueError('Dieses Exportwerkzeug benötigt ein zentriertes local_metric Raster.')
    if resampling not in ('nearest','bilinear'):
        raise ValueError('resampling muss nearest oder bilinear sein.')
    out = Path(output_directory)
    out.mkdir(parents=True, exist_ok=True)
    layers = list(layers)
    result = {
        'tool': 'Mars Geo Data Analyzer', 'created_utc': datetime.now(timezone.utc).isoformat(),
        'grid': grid.to_dict(),
        'grid_crs_wkt': output_crs(grid).to_wkt(),
        'affine_transform': list(output_transform(grid))[:6],
        'cell_index_order': 'matrix[y, x]',
        'sampling': {'raster': resampling,
                     'csv': 'Nearest observed point only within configured radius; no interpolation'},
        'layers': [], 'errors': [],
    }
    for number, layer in enumerate(layers, 1):
        name = f'{number:02d}_{_safe_filename(layer.name)}'
        def msg(message):
            if progress: progress(message)
        try:
            msg(f'Exportiere {number}/{len(layers)}: {layer.name}')
            entry = {'name': layer.name, 'type': layer.kind,
                     'source_file': str(layer.source.path), 'files': {}}
            if isinstance(layer.source, GeoRaster):
                data, valid = _raster_warp(layer.source, grid,
                                           resampling='nearest' if layer.kind == 'map' else resampling)
                entry['bands'] = [layer.source.ds.descriptions[i] or f'Band {i+1}'
                                  for i in range(layer.source.ds.count)]
                entry['band_units'] = list(layer.source.ds.units or [])
                if 'colorized' in layer.name.lower() or 'colorized' in str(layer.source.path).lower():
                    entry['warning'] = 'Colorized Relief ist ein Bild-/Farbwert und kein numerisches DEM.'
                entry['source_crs_wkt'] = layer.source.crs.to_wkt()
                entry['valid_cells'] = int(np.count_nonzero(valid))
                tif_path = out / f'{name}.tif'
                _write_raster(tif_path, data, grid, entry['bands'],
                              units=tuple(layer.source.ds.units or ()))
                entry['files']['geotiff'] = tif_path.name
                entry['statistics'] = _band_statistics(data,entry['bands'])
                if layer.kind == 'map':
                    png_path = out / f'{name}.png'
                    _write_image_png(png_path, data)
                    entry['files']['image_png'] = png_path.name
                if export_grid_csv and layer.kind != 'map':
                    csv_path = out / f'{name}_grid.csv'
                    entry['csv_cells'] = _write_grid_csv(csv_path, grid, data, entry['bands'])
                    entry['files']['grid_csv'] = csv_path.name
                if layer.kind == 'map':
                    # Ein numerisches GeoTIFF ist georeferenziert, erhält Kanäle;
                    # Farbdarstellung erfolgt im Viewer; Nicht-Abdeckung = NaN.
                    entry['note'] = 'Bildkanäle; keine Höhen-/Temperaturwerte.'
            elif isinstance(layer.source, CsvPointLayer):
                src = layer.source
                chosen, lons, lats = _selected_csv_indices(src, grid)
                entry['bands'] = list(src.columns)
                entry['source_crs_wkt'] = src.crs.to_wkt()
                entry['points_in_region'] = len(chosen)
                entry['nearest_radius_m'] = src.radius_m
                entry['warning'] = src.semantic_warning
                raw_path = out / f'{name}_points.csv'
                entry['raw_csv_rows'] = _write_raw_csv(raw_path, src, grid)
                entry['files']['cropped_points_csv'] = raw_path.name
                data, valid = _csv_raster(src, grid, chosen)
                entry['valid_cells'] = int(valid.sum())
                entry['statistics'] = _band_statistics(data,entry['bands'])
                tif_path = out / f'{name}_grid.tif'
                _write_raster(tif_path, data, grid, entry['bands'])
                entry['files']['geotiff'] = tif_path.name
                if export_grid_csv:
                    csv_path = out / f'{name}_grid.csv'
                    entry['csv_cells'] = _write_grid_csv(csv_path, grid, data, entry['bands'])
                    entry['files']['grid_csv'] = csv_path.name
            else:
                raise TypeError(f'Unbekannter Layertyp: {type(layer.source)}')
            result['layers'].append(entry)
        except Exception as exc:
            msg(f'Fehler bei {layer.name}: {exc}')
            result['errors'].append({'name': layer.name, 'error': str(exc)})
    with (out/'analysis_summary.csv').open('w', encoding='utf-8', newline='') as sf:
        writer=csv.writer(sf)
        writer.writerow(['layer','type','band','valid_cells','min','max','mean'])
        for entry in result['layers']:
            for stat in entry.get('statistics',[]):
                writer.writerow([entry['name'],entry['type'],stat['name'],stat['valid_cells'],
                                 stat['min'],stat['max'],stat['mean']])
    grid.save(out/'fixed_grid.json')
    (out/'manifest.json').write_text(json.dumps(result, ensure_ascii=False,
                                  indent=2) + '\n', encoding='utf-8')
    msg(f'Export abgeschlossen: {len(result["layers"])} Layer; {len(result["errors"])} Fehler.')
    return result
