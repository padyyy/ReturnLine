"""Regression für Voll-Layer-Anzeige bei unverändertem festen Mapping-Bereich."""
from pathlib import Path
import numpy as np
from PIL import Image

from mars_mapper.fixed_grid import FixedGrid
from mars_mapper.core import GeoRaster, CsvPointLayer
from mars_mapper.rendering import (geo_tiff_layer_bounds,
    geo_tiff_preview_window, csv_point_preview_window)

ROOT=Path(__file__).resolve().parents[1]
G=FixedGrid.load(ROOT/'fixed_grid.json')


def test_map_extends_beyond_grid_and_is_rendered_there():
    layer=GeoRaster(ROOT/'demo/gale_map.tif')
    try:
        left,top,right,bottom=geo_tiff_layer_bounds(layer,G)
        assert left < 0 and top < 0 and right > G.columns and bottom > G.rows
        # Das Pixel bei (-30, 250) liegt außerhalb des festen Rasters,
        # aber innerhalb der geladenen Bildkarte.
        img=geo_tiff_preview_window(layer,G,(-100,-100,700,700),800,800)
        assert img.mode=='RGBA'
        assert img.getpixel((70,350))[3]==255
        assert img.getpixel((10,10))[3]==0
        # Das Mapping selbst bleibt unabhängig von diesem Bildausschnitt.
        lon,lat=G._from_local(-30*G.cell_size_m,250*G.cell_size_m)
        assert G.xy(lon,lat) is None
    finally:
        layer.close()


def test_alternative_projection_full_layer():
    layer=GeoRaster(ROOT/'demo/gale_map_alternative.tif')
    try:
        bounds=geo_tiff_layer_bounds(layer,G)
        assert bounds[0]<0 and bounds[2]>G.columns
        preview=geo_tiff_preview_window(layer,G,(-100,-100,700,700),640,640)
        assert preview.getpixel((60,280))[3]==255
    finally:
        layer.close()


def test_csv_points_render_outside_but_not_queryable_by_fixed_grid():
    layer=CsvPointLayer(ROOT/'demo/gale_thermal.csv',nearest_radius_m=2500)
    # CSV deckt nur einen Teil der Rasterregion ab; viewport darf trotzdem
    # größer sein und muss die Punktdarstellung korrekt skalieren.
    img=csv_point_preview_window(layer,G,(-100,-100,700,700),400,400)
    assert img.mode=='RGBA' and img.getbbox() is not None
