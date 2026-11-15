"""Regressionstests der unabhängigen Zuschnitt-Engine."""
import csv
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import Affine
from pyproj import CRS

from mars_mapper.local_grid import LocalMetricGrid
from mars_mapper.core import GeoRaster, CsvPointLayer
from mars_mapper.analysis_export import (
    ExportLayer, export_region, output_crs, output_transform
)


def test_geographic_target_anchor_and_pixels():
    g=LocalMetricGrid(-5.44,137.7,300,600,600,reference_position='center')
    assert g.xy(137.7,-5.44)==(300,300)
    a=output_transform(g)
    assert a*(300,300)==(0,0)
    assert np.allclose(a*(300.5,300.5),(150,-150))
    assert output_crs(g).is_projected


def test_two_rasters_share_exact_georeference(tmp_path):
    g=LocalMetricGrid(-5.44,137.7,300,12,12)
    crs=output_crs(g).to_wkt()
    aff=output_transform(g)
    arr=np.arange(12*12,dtype='float32').reshape(12,12)
    sources=[]
    for n in (1,2):
        fp=tmp_path/f'in{n}.tif'
        with rasterio.open(fp,'w',driver='GTiff',width=12,height=12,
                           count=1,dtype='float32',transform=aff,crs=crs,
                           nodata=-9999.0) as ds:
            ds.write(arr*n,1)
        sources.append(GeoRaster(fp))
    try:
        report=export_region(g,[ExportLayer('a','raster',sources[0]),
                                ExportLayer('b','raster',sources[1])],
                                tmp_path/'out')
        assert not report['errors']
        names=[tmp_path/'out'/e['files']['geotiff'] for e in report['layers']]
        with rasterio.open(names[0]) as x, rasterio.open(names[1]) as y:
            assert x.crs==y.crs and x.transform==y.transform
            assert (x.width,x.height)==(12,12)
            assert np.array_equal(x.read(1),arr)
            assert np.array_equal(y.read(1),arr*2)
        with (tmp_path/'out'/'01_a_grid.csv').open() as f:
            values=list(csv.DictReader(f))
        assert len(values)==144
        assert (values[0]['X'],values[0]['Y'])==('0','0')
        assert (values[-1]['X'],values[-1]['Y'])==('11','11')
    finally:
        for src in sources: src.close()


def test_no_overlap_returns_nodata(tmp_path):
    g=LocalMetricGrid(-5.44,137.7,300,10,10)
    original=tmp_path/'other.tif'
    far_g=LocalMetricGrid(15,50,300,10,10)
    with rasterio.open(original,'w',driver='GTiff',width=10,height=10,
                       count=1,dtype='uint8',transform=output_transform(far_g),
                       crs=output_crs(far_g).to_wkt()) as ds:
        ds.write(np.ones((10,10),dtype='uint8')*7,1)
    src=GeoRaster(original)
    try:
        r=export_region(g,[ExportLayer('other','map',src)],tmp_path/'out')
        assert not r['errors']
        assert r['layers'][0]['valid_cells']==0
        from PIL import Image
        img=Image.open(tmp_path/'out'/'01_other.png')
        assert np.array(img)[:,:,3].max()==0
    finally: src.close()


def test_csv_outside_points_do_not_bleed_into_target(tmp_path):
    # Original CSV hat einen Punkt exakt am Zentrum und einen weit außerhalb.
    csv_path=tmp_path/'points.csv'
    csv_path.write_text('Latitude (N),Longitude (E),Elevation (m)\n'
                        '-5.44,137.7,-3500\n'
                        '-8.0,140.0,-4000\n',encoding='utf-8')
    g=LocalMetricGrid(-5.44,137.7,300,10,10)
    layer=CsvPointLayer(csv_path,nearest_radius_m=300)
    result=export_region(g,[ExportLayer('points','csv',layer)],tmp_path/'out')
    assert not result['errors']
    info=result['layers'][0]
    assert info['points_in_region']==1
    with (tmp_path/'out'/'01_points_points.csv').open() as f:
        lines=list(csv.DictReader(f))
    assert len(lines)==1
    with rasterio.open(tmp_path/'out'/'01_points_grid.tif') as ds:
        arr=ds.read(1)
        assert np.isfinite(arr).sum()>0
        assert np.nanmin(arr)==-3500 and np.nanmax(arr)==-3500
        assert np.isnan(arr[0,0])


def test_clipping_subregion_with_real_dem_file(tmp_path):
    f=Path('/mnt/data/gale_dem_1000x1000.tif')
    if not f.exists():
        return
    src=GeoRaster(f)
    try:
        g=LocalMetricGrid(-4.81343,137.37991,10,100,100)
        report=export_region(g,[ExportLayer('Gale DEM','raster',src)],tmp_path/'out',export_grid_csv=False)
        assert not report['errors']
        assert report['layers'][0]['valid_cells']>=9000
        with rasterio.open(tmp_path/'out'/'01_Gale_DEM.tif') as tif:
            assert tif.shape==(100,100)
            assert np.all(np.isfinite(tif.read(1)))
    finally: src.close()
