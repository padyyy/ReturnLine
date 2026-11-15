"""Mars-Geodaten georeferenziert auf beliebige Ansichtsfenster zeichnen.

Die Vorschau kann über das feste Raster hinausreichen. Geografische
Werte werden ausschließlich im separaten Mapping-Kern und nur im
festgelegten Raster abgefragt. Keine Tkinter-Abhängigkeiten.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from pyproj import CRS
from rasterio.windows import Window
from rasterio.enums import Resampling
from scipy.ndimage import map_coordinates

from .core import (
    GeoRaster, CsvPointLayer, GeoMappingError, MARS_SPHERE_GEO_CRS,
    _transformer, _mars_compatible_proj_transformer,
)
from .local_grid import LocalMetricGrid


def preview_dimensions(grid: LocalMetricGrid, longest_side: int = 850) -> tuple[int, int]:
    fraction = min(1.0, longest_side / max(grid.columns, grid.rows))
    return max(1, round(grid.columns*fraction)), max(1, round(grid.rows*fraction))


def geographic_mesh(grid: LocalMetricGrid, width: int, height: int,
                    bounds: tuple[float, float, float, float] | None = None
                    ) -> tuple[np.ndarray, np.ndarray]:
    """Geo-Koordinaten der Bildpixel; bounds=(left, top, right, bottom)
    in *unbegrenzten* Rasterkoordinaten. Es darf auch außerhalb 0..W/H gerendert
    werden. Das feste Koordinatensystem wird dabei NICHT verändert.
    """
    if bounds is None:
        bounds = (0.0, 0.0, float(grid.columns), float(grid.rows))
    left, top, right, bottom = bounds
    if width < 1 or height < 1 or right <= left or bottom <= top:
        raise ValueError('Ungültige Bildabmessungen oder Kartenausdehnung.')
    xx = (left + (np.arange(width, dtype=np.float64) + .5) * (right-left)/width) * grid.cell_size_m
    yy = (top + (np.arange(height, dtype=np.float64) + .5) * (bottom-top)/height) * grid.cell_size_m
    lon = (grid.reference_longitude + np.degrees((grid._left_x + xx) /
          (grid.mars_radius_m * math.cos(math.radians(grid.reference_latitude))))) % 360.
    lat = grid.reference_latitude + np.degrees((grid._top_y - yy) / grid.mars_radius_m)
    return np.broadcast_to(lon, (height, width)), np.broadcast_to(lat[:, None], (height, width))


def geo_tiff_layer_bounds(layer: GeoRaster, grid: LocalMetricGrid,
                          samples_per_edge: int = 13) -> tuple[float, float, float, float]:
    """Unbegrenzte Bounding-Box des GeoTIFF in Koordinaten des festen Rasters.

    Randabtastung statt ausschließlicher Ecken berücksichtigt gekrümmte
    GeoTIFF-Kanten nach der Projektion. Bei globalen/polnahen Projektionen
    ist die Bounding-Box nur eine lokale Näherung; die Pixelzuordnung erfolgt
    weiterhin aus dem echten CRS pro sichtbarem Ausgabepixel.
    """
    from .core import convert_xy
    geo = CRS.from_user_input(MARS_SPHERE_GEO_CRS)
    _check_mars_crs(layer.crs)
    positions = np.linspace(0, 1, samples_per_edge)
    edges = ([(a*layer.ds.width,0.) for a in positions] +
             [(a*layer.ds.width,float(layer.ds.height)) for a in positions] +
             [(0.,a*layer.ds.height) for a in positions] +
             [(float(layer.ds.width),a*layer.ds.height) for a in positions])
    coords=[]
    for c,r in edges:
        try:
            native_x,native_y=layer.ds.transform * (c,r)
            lon,lat=convert_xy(native_x,native_y,layer.crs,geo)
            if not (-90<=lat<=90): continue
            delta_lon=((lon-grid.reference_longitude+180)%360)-180
            east=grid.mars_radius_m * math.cos(math.radians(grid.reference_latitude)) * math.radians(delta_lon)
            north=grid.mars_radius_m * math.radians(lat-grid.reference_latitude)
            col=(east-grid._left_x)/grid.cell_size_m
            row=(grid._top_y-north)/grid.cell_size_m
            if math.isfinite(col) and math.isfinite(row):coords.append((col,row))
        except Exception:
            continue
    if len(coords)<2:
        raise GeoMappingError('GeoTIFF-Ausdehnung lässt sich nicht ins lokale Marsraster umrechnen.')
    array=np.asarray(coords)
    return (float(array[:,0].min()), float(array[:,1].min()),
            float(array[:,0].max()), float(array[:,1].max()))


def _check_mars_crs(crs: CRS) -> None:
    geodetic = crs if crs.is_geographic else crs.geodetic_crs
    if geodetic is None:
        raise GeoMappingError('GeoTIFF benötigt ein geografisches oder projiziertes Mars-CRS.')
    a = float(geodetic.ellipsoid.semi_major_metre)
    if not 3_350_000 <= a <= 3_430_000:
        raise GeoMappingError(
            f'Datensatz scheint keinen Mars-Referenzkörper zu haben (Halbachse {a:g} m). '
            'Bitte eine Mars-georeferenzierte GeoTIFF-Datei laden; WGS84 ist ein Erd-CRS.'
        )


def _transform_arrays(lons: np.ndarray, lats: np.ndarray, target_crs: CRS):
    source = CRS.from_user_input(MARS_SPHERE_GEO_CRS)
    _check_mars_crs(target_crs)
    if source.equals(target_crs):
        return lons, lats
    try:
        t = _transformer(source.to_wkt(), target_crs.to_wkt())
        x, y = t.transform(lons, lats, errcheck=True)
    except Exception as err:
        try:
            t = _mars_compatible_proj_transformer(source.to_wkt(), target_crs.to_wkt())
            x, y = t.transform(lons, lats, errcheck=True)
        except Exception as other:
            raise GeoMappingError(f'Mars-CRS konnte nicht transformiert werden: {other}') from err
    return np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64)


def _band_to_uint8(band: np.ndarray, valid: np.ndarray, keep_8bit: bool) -> np.ndarray:
    vals = band[valid & np.isfinite(band)]
    if vals.size == 0:
        return np.zeros_like(band, dtype=np.uint8)
    if keep_8bit:
        return np.uint8(np.clip(np.nan_to_num(band, nan=0), 0, 255))
    low, high = np.percentile(vals, [2, 98])
    if high <= low:
        # Konstante Werte sollen als sichtbarer Mittelton erscheinen.
        return np.where(valid, 150, 0).astype(np.uint8)
    return np.uint8(np.clip(np.nan_to_num((band-low)*255/(high-low), nan=0), 0, 255))


def geo_tiff_preview(layer: GeoRaster, grid: LocalMetricGrid, *, heatmap: bool = False,
                     longest_side: int = 850) -> Image.Image:
    """GeoTIFF für DIESES feste Marsraster samplen, originalen Layer nie ändern.

    Liest nur ein begrenztes Quellfenster, ggf. mit Downsampling; nie ganze 21GB.
    """
    w, h = preview_dimensions(grid, longest_side)
    return geo_tiff_preview_window(layer, grid, (0, 0, grid.columns, grid.rows),
                                   w, h, heatmap=heatmap)


def geo_tiff_preview_window(layer: GeoRaster, grid: LocalMetricGrid,
                            bounds: tuple[float, float, float, float], width: int,
                            height: int, *, heatmap: bool = False) -> Image.Image:
    """Nur den aktuell sichtbaren Ausschnitt rendern – auch außerhalb des Rasters.

    Georeferenziert und speicherschonend; selbst ein großes GeoTIFF wird aus
    begrenzten Quellfenstern und mit herunterskalierter Auflösung gelesen.
    """
    w,h=int(width),int(height)
    lon, lat = geographic_mesh(grid, w, h, bounds)
    # Polüberschreitungen aus der lokalen Näherung dürfen nicht an PROJ gehen.
    geo_valid = (lat >= -90) & (lat <= 90)
    lat = np.where(geo_valid, lat, 0.0)
    sx, sy = _transform_arrays(lon, lat, layer.crs)
    inv = ~layer.ds.transform
    col, row = inv * (sx, sy)
    col = np.asarray(col, dtype=np.float64) - .5
    row = np.asarray(row, dtype=np.float64) - .5
    inside = (geo_valid & np.isfinite(col) & np.isfinite(row) & (col >= 0) & (col < layer.ds.width)
              & (row >= 0) & (row < layer.ds.height))
    if not inside.any():
        return Image.new('RGBA', (w, h), (0, 0, 0, 0))

    cmin = max(0, math.floor(float(np.min(col[inside])))-2)
    cmax = min(layer.ds.width, math.ceil(float(np.max(col[inside])))+3)
    rmin = max(0, math.floor(float(np.min(row[inside])))-2)
    rmax = min(layer.ds.height, math.ceil(float(np.max(row[inside])))+3)
    win_w, win_h = max(1, cmax-cmin), max(1, rmax-rmin)
    # Maximal etwa 1400 x 1400 Pixel des Quellfensters einlesen.
    shrink = max(1.0, win_w/1400, win_h/1400)
    read_w, read_h = max(1, math.ceil(win_w/shrink)), max(1, math.ceil(win_h/shrink))
    channels = 1 if heatmap or layer.ds.count == 1 else min(3, layer.ds.count)
    indices = list(range(1, channels+1))
    raw = layer.ds.read(indexes=indices, window=Window(cmin, rmin, win_w, win_h),
                        out_shape=(channels, read_h, read_w),
                        resampling=Resampling.bilinear, masked=True)
    # Positionsabbildung in das heruntergesampelte Fenster
    xx = (np.nan_to_num(col, nan=-1e8) - cmin) * read_w/win_w
    yy = (np.nan_to_num(row, nan=-1e8) - rmin) * read_h/win_h
    valid_window = inside & (xx >= 0) & (xx <= read_w-1) & (yy >= 0) & (yy <= read_h-1)
    coordinates = [np.clip(yy, 0, read_h-1), np.clip(xx, 0, read_w-1)]
    sampled = []
    masks = []
    for b in range(channels):
        # Rasterio liefert bei RGB/Grayscale-GeoTIFFs oft uint8 oder uint16.
        # Ein Integer-MaskedArray kann NaN nicht als fill_value aufnehmen.
        # ZUERST nach Float konvertieren, DANN maskierte Pixel mit NaN fuellen.
        arr = raw[b].astype(np.float32).filled(np.nan)
        channel = map_coordinates(np.nan_to_num(arr, nan=0), coordinates, order=1,
                                  mode='nearest').astype(np.float32)
        good = map_coordinates((np.isfinite(arr) & ~np.ma.getmaskarray(raw[b])).astype(np.uint8),
                               coordinates, order=0, mode='nearest') > 0
        sampled.append(channel)
        masks.append(good)
    valid = valid_window & np.logical_and.reduce(masks)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    if heatmap:
        arr = sampled[0]
        vals = arr[valid]
        if vals.size:
            low, high = np.percentile(vals, [2, 98])
            t = np.clip((arr-low)/(high-low) if high > low else np.full_like(arr, .5), 0, 1)
            out[:, :, 0] = np.uint8(50 + 205*t)
            out[:, :, 1] = np.uint8(95 + 55*(1-np.abs(2*t-1)))
            out[:, :, 2] = np.uint8(185*(1-t) + 25)
    elif channels == 1:
        g = _band_to_uint8(sampled[0], valid, False)
        out[:, :, :3] = g[:, :, None]
    else:
        keep_8bit = np.issubdtype(layer.ds.dtypes[0], np.integer) if isinstance(layer.ds.dtypes[0], np.dtype) else np.issubdtype(np.dtype(layer.ds.dtypes[0]), np.integer)
        # Gewöhnliche 8-Bit RGB-Karten in Originalfarbwerten belassen.
        keep_8bit = keep_8bit and np.dtype(layer.ds.dtypes[0]).itemsize == 1
        for b in range(3):
            out[:, :, b] = _band_to_uint8(sampled[min(b,channels-1)], valid, keep_8bit)
    out[:, :, 3] = np.uint8(valid)* (160 if heatmap else 255)
    return Image.fromarray(out, 'RGBA')


def csv_point_preview(layer: CsvPointLayer, grid: LocalMetricGrid,
                      *, longest_side: int = 850, max_points: int = 18000) -> Image.Image:
    w,h=preview_dimensions(grid,longest_side)
    return csv_point_preview_window(layer,grid,(0,0,grid.columns,grid.rows),
                                    w,h,max_points=max_points)


def csv_point_preview_window(layer: CsvPointLayer, grid: LocalMetricGrid,
                             bounds: tuple[float,float,float,float], width: int,
                             height: int, *, max_points: int = 18000) -> Image.Image:
    """Geo-Punkte in der aktiven Ansicht, unabhängig von den Grenzen des festen Rasters."""
    w,h=int(width),int(height)
    img=Image.new('RGBA',(w,h),(0,0,0,0))
    left,top,right,bottom=bounds
    points=layer.tree.data
    idx=np.linspace(0,len(points)-1,min(max_points,len(points)),dtype=np.int64)
    xyz=points[idx]
    lat=np.degrees(np.arcsin(np.clip(xyz[:,2],-1,1)))
    lon=np.degrees(np.arctan2(xyz[:,1],xyz[:,0]))%360.
    dlon=((lon-grid.reference_longitude+180)%360)-180
    east=grid.mars_radius_m*np.cos(np.radians(grid.reference_latitude))*np.radians(dlon)
    north=grid.mars_radius_m*np.radians(lat-grid.reference_latitude)
    col=(east-grid._left_x)/grid.cell_size_m
    row=(grid._top_y-north)/grid.cell_size_m
    x=((col-left)/(right-left)*w).astype(int)
    y=((row-top)/(bottom-top)*h).astype(int)
    good=(x>=0)&(y>=0)&(x<w)&(y<h)
    draw=ImageDraw.Draw(img)
    for a,b in zip(x[good],y[good]):
        draw.ellipse((int(a)-1,int(b)-1,int(a)+1,int(b)+1),fill=(65,231,187,195))
    return img


def csv_layer_bounds(layer: CsvPointLayer, grid: LocalMetricGrid,
                     max_points: int = 100_000) -> tuple[float,float,float,float]:
    points=layer.tree.data
    idx=np.linspace(0,len(points)-1,min(max_points,len(points)),dtype=np.int64)
    xyz=points[idx]
    lat=np.degrees(np.arcsin(np.clip(xyz[:,2],-1,1)))
    lon=np.degrees(np.arctan2(xyz[:,1],xyz[:,0]))%360.
    dlon=((lon-grid.reference_longitude+180)%360)-180
    east=grid.mars_radius_m*np.cos(np.radians(grid.reference_latitude))*np.radians(dlon)
    north=grid.mars_radius_m*np.radians(lat-grid.reference_latitude)
    col=(east-grid._left_x)/grid.cell_size_m
    row=(grid._top_y-north)/grid.cell_size_m
    return float(col.min()),float(row.min()),float(col.max()),float(row.max())
