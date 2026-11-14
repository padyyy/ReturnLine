"""Kartenunabhängige Rasterzuordnung für feste Marsraster.

Nur Datenverarbeitung: keinerlei Tkinter, Pillow, Frontend oder A*.
- Zielraster definiert dauerhaft geographische Ausdehnung und Zellen.
- Quell-GeoTIFFs bleiben unangetastet; nur gültige Pixelwerte werden übernommen.
- CSV-Punkte werden mit einem expliziten Maximalabstand zugeordnet.
- Fehlende Daten sind np.nan, NICHT Null oder ein künstlicher Messwert.
"""
from __future__ import annotations

from pathlib import Path
from typing import Mapping
import json
import math

import numpy as np
from pyproj import CRS
from rasterio.windows import Window

from .core import (
    CsvPointLayer, GeoRaster, GeoMappingError, MARS_SPHERE_GEO_CRS,
    _transformer, _mars_compatible_proj_transformer,
)
from .fixed_grid import FixedGrid
from .local_grid import LocalMetricGrid

Grid = FixedGrid | LocalMetricGrid


def _transform_mars_coordinates(lon: np.ndarray, lat: np.ndarray, crs: CRS):
    """WGS84/Erde als stilles Ziel ausschließen und Mars-Projektionen umrechnen."""
    g = crs if crs.is_geographic else crs.geodetic_crs
    if g is None:
        raise GeoMappingError('Quellraster hat kein geografisches Mars-Bezugssystem.')
    a = float(g.ellipsoid.semi_major_metre)
    b = float(g.ellipsoid.semi_minor_metre)
    if not (3_350_000 <= a <= 3_430_000 and 3_350_000 <= b <= 3_430_000):
        raise GeoMappingError('Quellraster verwendet offenbar kein Mars-CRS (z. B. Erde/WGS84).')
    source = CRS.from_user_input(MARS_SPHERE_GEO_CRS)
    if source.equals(crs):
        return lon, lat
    try:
        transformer = _transformer(source.to_wkt(), crs.to_wkt())
        xx, yy = transformer.transform(lon, lat, errcheck=True)
    except Exception:
        try:
            transformer = _mars_compatible_proj_transformer(source.to_wkt(), crs.to_wkt())
            xx, yy = transformer.transform(lon, lat, errcheck=True)
        except Exception as exc:
            raise GeoMappingError(f'Mars-CRS-Transformation gescheitert: {exc}') from exc
    return np.asarray(xx, dtype=np.float64), np.asarray(yy, dtype=np.float64)


def raster_to_matrix(layer: GeoRaster, grid: Grid, *, band: int = 1,
                     chunk_rows: int = 32, max_window_pixels: int = 3_000_000) -> np.ndarray:
    """Abtastung des GeoTIFFs an den Mittelpunkten der FESTEN Rasterzellen.

    Ergebnis: float32 [Zeile=y, Spalte=x], NoData=np.nan. Nearest Neighbor;
    keine künstliche Verfeinerung der physikalischen Messauflösung.
    RAM-schonend durch Quellfenster je Zeilenchunk und punktweisen Fallback.
    """
    ds = layer.ds
    if not (1 <= band <= ds.count):
        raise ValueError(f'Band {band} existiert nicht. Das Raster hat {ds.count} Bänder.')
    if chunk_rows < 1 or max_window_pixels < 1:
        raise ValueError('chunk_rows und max_window_pixels müssen positiv sein.')
    output = np.full((grid.rows, grid.columns), np.nan, dtype=np.float32)
    src_lon, src_lat = grid.lonlat_mesh()
    inv = ~ds.transform
    for top in range(0, grid.rows, chunk_rows):
        bottom = min(top + chunk_rows, grid.rows)
        lon, lat = src_lon[top:bottom], src_lat[top:bottom]
        xx, yy = _transform_mars_coordinates(lon, lat, layer.crs)
        col_float, row_float = inv @ (xx, yy)
        col_float = np.asarray(col_float)
        row_float = np.asarray(row_float)
        finite = np.isfinite(col_float) & np.isfinite(row_float)
        cols = np.floor(np.where(finite, col_float, -1)).astype(np.int64)
        rows = np.floor(np.where(finite, row_float, -1)).astype(np.int64)
        inside = finite & (cols >= 0) & (rows >= 0) & (cols < ds.width) & (rows < ds.height)
        if not inside.any():
            continue
        dst = output[top:bottom]
        rr, cc = np.nonzero(inside)
        src_cols, src_rows = cols[inside], rows[inside]
        min_c, max_c = int(src_cols.min()), int(src_cols.max()) + 1
        min_r, max_r = int(src_rows.min()), int(src_rows.max()) + 1
        if (max_c-min_c) * (max_r-min_r) <= max_window_pixels:
            win = Window(min_c, min_r, max_c-min_c, max_r-min_r)
            src = ds.read(band, window=win, masked=True)
            values = np.ma.array(src[src_rows - min_r, src_cols - min_c], dtype=np.float32).filled(np.nan)
            dst[rr, cc] = values
        else:
            # Großflächige hochauflösende TIFFs: nicht riesige Fenster einlesen.
            sx, sy = ds.transform * (src_cols + 0.5, src_rows + 0.5)
            coords = zip(np.asarray(sx).tolist(), np.asarray(sy).tolist())
            vals = []
            for a in ds.sample(coords, indexes=band, masked=True):
                v = np.ma.array(a, dtype=np.float32).filled(np.nan)
                vals.append(float(v[0]))
            dst[rr, cc] = np.asarray(vals, dtype=np.float32)
    return output


def csv_to_matrices(layer: CsvPointLayer, grid: Grid, *, chunk_rows: int = 128) -> dict[str, np.ndarray]:
    """JMARS-Punkte via KD-Tree auf ein gleichbleibendes Raster übertragen.

    Für jede Rasterzelle wird nur der NÄCHSTE Punkt im konfigurierten Radius
    verwendet. Das ist eine Zuordnung, keine räumliche Interpolation.
    """
    if chunk_rows <= 0:
        raise ValueError('chunk_rows muss positiv sein.')
    result = {column: np.full((grid.rows, grid.columns), np.nan, dtype=np.float32)
              for column in layer.columns}
    lonmesh, latmesh = grid.lonlat_mesh()
    radius = 2 * math.sin(min(layer.radius_m/layer.radius_sphere, math.pi)/2)
    for top in range(0, grid.rows, chunk_rows):
        bottom = min(top+chunk_rows, grid.rows)
        lon = np.deg2rad(lonmesh[top:bottom].reshape(-1))
        lat = np.deg2rad(latmesh[top:bottom].reshape(-1))
        xyz = np.stack((np.cos(lat)*np.cos(lon), np.cos(lat)*np.sin(lon), np.sin(lat)), axis=-1)
        distance, idx = layer.tree.query(xyz, distance_upper_bound=radius)
        valid = np.isfinite(distance) & (idx < len(layer.rows))
        for k, column in enumerate(layer.columns):
            flat = np.full(idx.shape, np.nan, dtype=np.float32)
            flat[valid] = layer.rows[idx[valid], k]
            result[column][top:bottom] = flat.reshape((bottom-top, grid.columns))
    return result


def save_npz(path: str | Path, grid: Grid, data: Mapping[str, np.ndarray]) -> None:
    """Gespeicherte Matrizen haben alle das gleiche, feste (rows, columns)-Format."""
    arrays: dict[str, np.ndarray] = {}
    for name, values in data.items():
        arr = np.asarray(values, dtype=np.float32)
        if arr.shape != (grid.rows, grid.columns):
            raise ValueError(f'{name!r}: Matrixform {arr.shape}, erwartet {(grid.rows, grid.columns)}')
        arrays[name] = arr
    if not arrays:
        raise ValueError('Keine Datenmatrizen zum Speichern übergeben.')
    path = Path(path)
    np.savez_compressed(path, **arrays)
    path.with_suffix('.metadata.json').write_text(
        json.dumps({'grid':grid.to_dict(), 'layers':list(arrays),
                    'shape':{'rows':grid.rows,'columns':grid.columns},
                    'nodata':'NaN', 'sample_position':'cell_center',
                    'sampling':'nearest_neighbour',
                    'units':'Nicht vereinheitlicht; Metadaten der Quellprodukte prüfen'},
                   ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
