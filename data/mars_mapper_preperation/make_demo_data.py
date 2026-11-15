"""Erstellt synthetische (NICHT NASA-) Karten/Daten rund um Gale für GUI-Tests."""
from pathlib import Path
import csv
import numpy as np
import rasterio
from rasterio.transform import from_bounds

OUT=Path(__file__).resolve().parent/'demo'
OUT.mkdir(parents=True,exist_ok=True)
R=3396190
LAT=-5.44
LON=137.70
EQC=f'+proj=eqc +lon_0={LON} +lat_0={LAT} +lat_ts={LAT} +R={R} +units=m +no_defs +type=crs'
GEO=f'+proj=longlat +R={R} +no_defs +type=crs'

# Jede Karte überdeckt einen anderen Bereich / benutzt ein anderes CRS.
for name,mode,size in [('gale_map.tif','metric',640),('gale_map_alternative.tif','degrees',570)]:
    if mode=='metric':
        transform=from_bounds(-110000,-110000,110000,110000,size,size)
        crs=EQC
        yy,xx=np.mgrid[0:size,0:size]
        east=(xx+.5-size/2)*220000/size
        north=(size/2-yy-.5)*220000/size
    else:
        transform=from_bounds(LON-2,LAT-1.85,LON+2,LAT+1.85,size,size)
        crs=GEO
        yy,xx=np.mgrid[0:size,0:size]
        east=(xx+.5-size/2)*4/size*np.pi/180*R*np.cos(np.radians(LAT))
        north=(size/2-yy-.5)*3.7/size*np.pi/180*R
    r=np.hypot(east,north)
    crater=np.exp(-((r-71000)/12000)**2)
    ridges=np.sin(east/6400+np.cos(north/5300))*np.cos(north/6900)
    if mode=='metric':
        red=np.clip(118 + 51*crater + 34*ridges + east/10000,0,255)
        green=np.clip(85 + 34*crater + 23*ridges,0,255)
        blue=np.clip(61 + 27*crater + 15*ridges,0,255)
    else:
        red=np.clip(122 + 30*crater + 18*ridges + 8*np.sin(north/4500),0,255)
        green=np.clip(97 + 42*crater + 16*ridges + 3*np.cos(east/4200),0,255)
        blue=np.clip(75 + 19*crater + 13*ridges,0,255)
    img=np.stack((red,green,blue)).astype(np.uint8)
    with rasterio.open(OUT/name,'w',driver='GTiff',height=size,width=size,count=3,
        dtype='uint8',crs=crs,transform=transform,compress='deflate') as dst:
        dst.write(img)

n=420
transform=from_bounds(-95000,-95000,95000,95000,n,n)
yy,xx=np.mgrid[0:n,0:n]
east=(xx+.5-n/2)*190000/n
north=(n/2-yy-.5)*190000/n
r=np.hypot(east,north)
elev=(-3500-2100*np.exp(-((r-66000)/16000)**2)+1000*np.exp(-(r/21000)**2)
      +90*np.sin(east/5000)*np.cos(north/7000)).astype('float32')
with rasterio.open(OUT/'gale_elevation.tif','w',driver='GTiff',height=n,width=n,count=1,
                    dtype='float32',crs=EQC,transform=transform,nodata=-99999,compress='deflate') as dst:
    dst.write(elev,1)
    dst.set_band_description(1,'Synthetic elevation (m)')
    dst.set_band_unit(1,'m')

with (OUT/'gale_thermal.csv').open('w',encoding='utf-8',newline='') as f:
    writer=csv.writer(f)
    writer.writerow(['OID','Latitude (N)','Longitude (E)','Thermal_Demo_K'])
    for i in range(70):
        for j in range(70):
            lat=LAT+(i-34.5)*0.034
            lon=LON+(j-34.5)*0.034
            val=210+14*np.sin(i/13)+9*np.cos(j/10)
            writer.writerow([i*70+j+1,round(lat,6),round(lon,6),round(val,2)])
print('Synthetische Gale-Demodaten gespeichert:',OUT)
