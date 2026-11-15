from pathlib import Path
import numpy as np
from pyproj import CRS

from mars_mapper.fixed_grid import FixedGrid
from mars_mapper.local_grid import LocalMetricGrid
from mars_mapper.core import GeoRaster, CsvPointLayer, MarsMapper, MARS_SPHERE_GEO_CRS
from mars_mapper.rendering import geo_tiff_preview, csv_point_preview

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / 'demo'


def grid():
    return FixedGrid.load(ROOT/'fixed_grid.json')


def test_reference_in_grid_center():
    g=grid()
    assert g.xy(g.reference_longitude,g.reference_latitude)==(g.columns//2,g.rows//2)
    assert g.xy(*g.lonlat_center(0,0))==(0,0)
    assert g.xy(*g.lonlat_center(g.columns-1,g.rows-1))==(g.columns-1,g.rows-1)
    assert g.xy(g.reference_longitude+5,g.reference_latitude) is None


def test_config_roundtrip(tmp_path):
    g=grid()
    p=tmp_path/'fixed_grid.json'
    g.save(p)
    h=FixedGrid.load(p)
    assert h==g


def test_same_geography_on_different_maps():
    g=grid()
    a=GeoRaster(DEMO/'gale_map.tif')
    b=GeoRaster(DEMO/'gale_map_alternative.tif')
    source=CRS.from_user_input(MARS_SPHERE_GEO_CRS)
    try:
        lon,lat=g.lonlat_center(123,211)
        assert a.sample(source,lon,lat).status=='ok'
        assert b.sample(source,lon,lat).status=='ok'
        assert g.xy(lon,lat)==(123,211)
    finally:
        a.close();b.close()


def test_previews_cover_fixed_grid():
    g=grid()
    for name in ['gale_map.tif','gale_map_alternative.tif']:
        t=GeoRaster(DEMO/name)
        try:
            im=geo_tiff_preview(t,g)
            assert im.size==(600,600)
            assert im.getpixel((300,300))[3]==255
        finally:t.close()


def test_numeric_tiff_and_csv():
    g=grid()
    t=GeoRaster(DEMO/'gale_elevation.tif')
    c=CsvPointLayer(DEMO/'gale_thermal.csv',nearest_radius_m=2000)
    try:
        source=CRS.from_user_input(MARS_SPHERE_GEO_CRS)
        a=t.sample(source,g.reference_longitude,g.reference_latitude)
        b=c.sample(source,g.reference_longitude,g.reference_latitude)
        assert a.status=='ok'
        assert b.status=='ok'
        assert len(a.values)==1 and len(b.values)==1
        assert csv_point_preview(c,g).getbbox() is not None
    finally:t.close()


def test_empty_preview_for_unrelated_region():
    g=LocalMetricGrid(reference_latitude=20,reference_longitude=20,
                      cell_size_m=300,rows=50,columns=50)
    t=GeoRaster(DEMO/'gale_map.tif')
    try:
        image=geo_tiff_preview(t,g)
        assert image.getbbox() is None
    finally:t.close()


def test_mapper_independent_of_map():
    g=grid()
    mapper=MarsMapper(g)
    mapper.add_tiff(DEMO/'gale_elevation.tif')
    try:
        data=mapper.inspect_grid_cell(300,300)
        assert len(data)==1 and data[0].status=='ok'
        mapper.load_map(DEMO/'gale_map.tif')
        data2=mapper.inspect_grid_cell(300,300)
        mapper.load_map(DEMO/'gale_map_alternative.tif')
        data3=mapper.inspect_grid_cell(300,300)
        assert data[0].values==data2[0].values==data3[0].values
    finally:
        mapper.close()



def test_masked_uint8_geotiff_preview(tmp_path):
    """Regression: RGB-Geotiff mit uint8 + maskierten Pixeln darf NaN-Fill nicht crashen."""
    import rasterio
    from rasterio.transform import from_bounds
    g = grid()
    demo_map = DEMO/'gale_map.tif'
    with rasterio.open(demo_map) as original:
        # GeoTIFF durchgehend fuer das feste Raster referenziert.
        profile = original.profile.copy()
        profile.update(height=128, width=128, count=3, dtype='uint8', nodata=0,
                       transform=from_bounds(*original.bounds, 128, 128))
    path = tmp_path/'uint8_masked_rgb.tif'
    data = np.full((3,128,128), 90, dtype=np.uint8)
    data[:, 10:30, 10:30] = 0  # explizites NoData im uint8-Bild
    with rasterio.open(path,'w',**profile) as ds:
        ds.write(data)
    lyr = GeoRaster(path)
    try:
        img = geo_tiff_preview(lyr,g)
        assert img.mode == 'RGBA'
        assert img.size == (600,600)
        assert img.getpixel((300,300))[3] == 255
    finally:
        lyr.close()


def test_masked_uint16_numeric_preview(tmp_path):
    """Regression fuer numerische Integer-GeoTIFFs mit NoData."""
    import rasterio
    from rasterio.transform import from_bounds
    g = grid()
    with rasterio.open(DEMO/'gale_map.tif') as original:
        original_bounds = original.bounds
        original_crs = original.crs
    path = tmp_path/'uint16_nodata.tif'
    arr = np.full((128,128), 200, dtype=np.uint16)
    arr[40:80,40:80] = 0
    with rasterio.open(path, 'w', driver='GTiff', height=128, width=128,
                       count=1, dtype='uint16', crs=original_crs,
                       transform=from_bounds(*original_bounds,128,128),
                       nodata=0) as dst:
        dst.write(arr,1)
    lyr=GeoRaster(path)
    try:
        img=geo_tiff_preview(lyr,g,heatmap=True)
        assert img.mode=='RGBA'
        assert img.size==(600,600)
        assert img.getpixel((300,300))[3] in (0,160)
    finally:
        lyr.close()
