"""GIS-Zuschnitt ohne GUI. Beispiel: python3 export_cli.py --raster demo/gale_elevation.tif --csv demo/gale_thermal.csv --out output"""
import argparse
from pathlib import Path
from mars_mapper.core import GeoRaster, CsvPointLayer
from mars_mapper.fixed_grid import FixedGrid
from mars_mapper.analysis_export import ExportLayer, export_region


def main():
    p = argparse.ArgumentParser(description='Mars-Geodaten auf festen Bereich zuschneiden')
    p.add_argument('--config', default='fixed_grid.json')
    p.add_argument('--out', required=True)
    p.add_argument('--map', dest='maps', action='append', default=[])
    p.add_argument('--raster', dest='rasters', action='append', default=[])
    p.add_argument('--csv', dest='csvs', action='append', default=[])
    p.add_argument('--csv-radius', type=float, default=1200.0, help='Suchradius in Metern für Rasterzuordnung')
    p.add_argument('--resampling', choices=['nearest','bilinear'], default='nearest')
    p.add_argument('--no-grid-csv', action='store_true')
    args = p.parse_args()
    grid = FixedGrid.load(args.config)
    layers=[]
    opened=[]
    try:
        for kind, items in [('map',args.maps),('raster',args.rasters),('csv',args.csvs)]:
            for item in items:
                src = (CsvPointLayer(item, nearest_radius_m=args.csv_radius) if kind == 'csv'
                       else GeoRaster(item))
                opened.append(src)
                layers.append(ExportLayer(Path(item).stem,kind,src))
        if not layers:
            p.error('Bitte mindestens --map, --raster oder --csv angeben.')
        report=export_region(grid,layers,args.out,resampling=args.resampling,
                             export_grid_csv=not args.no_grid_csv,progress=print)
        if report['errors']:
            for error in report['errors']:
                print('FEHLER:',error)
            raise SystemExit(1)
        print('Fertig:',Path(args.out).resolve())
    finally:
        for src in opened:
            if isinstance(src,GeoRaster): src.close()

if __name__ == '__main__':
    main()
