"""JSON stdin/stdout wrapper for offline mapping. Never runs a route search.

python3 pipeline/mapping_bridge.py --request '{"action":"describe"}'
"""
from __future__ import annotations

import argparse
import contextlib
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

from mapping_grid import MappingGrid

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'frontend/public/data'
GENERATOR = 'pipeline/mapping_bridge.py'
# Field Book colours (DESIGN.md): survey paper, graphite, red pencil. Not green/amber, because those
# are the return stages in the console; red is kept for ground the routing blocks (over 20 degrees).
COLORS = [(237, 240, 230, 255), (81, 87, 91, 255), (200, 54, 31, 255)]


def json_value(value):
    value = float(value)
    return value if np.isfinite(value) else None


def query(grid, request):
    if request.get('grid_id', grid.grid_id) != grid.grid_id:
        raise ValueError('grid_id does not match the loaded grid')
    points = request.get('points')
    if not isinstance(points, list) or len(points) > 10000:
        raise ValueError('points must be an array of at most 10000 cells or coordinates')
    terrain = {key: grid.read_float(key) for key in ('elev', 'slope')}
    results = []
    for point in points:
        if not isinstance(point, dict):
            raise ValueError('Each point must be an object')
        cell_fields = 'column' in point or 'row' in point
        geo_fields = 'lon' in point or 'lat' in point
        if cell_fields == geo_fields:
            raise ValueError('Use either column/row or lon/lat per point')
        if cell_fields:
            column, row = point['column'], point['row']
            grid.require_cell(column, row)
        else:
            pos = grid.xy(point['lon'], point['lat'])
            if pos is None:
                results.append(dict(status='outside_grid', cell=None, elev_m=None, slope_deg=None))
                continue
            column, row = pos
        elev, slope = (json_value(terrain[k][row, column]) for k in ('elev', 'slope'))
        results.append(dict(status='ok' if elev is not None and slope is not None else 'no_data',
                            cell=grid.cell(column, row), elev_m=elev, slope_deg=slope))
    return dict(grid_id=grid.grid_id, points=results)


def export_slope(grid, output):
    """Export a display image only, leaving grid and all numeric/routing files intact."""
    slope, elev = grid.read_float('slope'), grid.read_float('elev')
    valid = np.isfinite(slope) & np.isfinite(elev) & (slope >= 0) & (slope <= 90)
    rgba = np.zeros((grid.rows, grid.columns, 4), dtype=np.uint8)
    masks = [valid & (slope <= 10), valid & (slope > 10) & (slope <= 20), valid & (slope > 20)]
    for mask, color in zip(masks, COLORS):
        rgba[mask] = color
    output.mkdir(parents=True, exist_ok=True)
    image = output / 'slope_10m.png'
    Image.fromarray(rgba).save(image)
    metadata = dict(
        schema_version=1, generator=GENERATOR, created_utc=datetime.now(timezone.utc).isoformat(),
        image=image.name, image_path='data/' + image.name, grid_file='grid.json',
        grid_id=grid.grid_id, grid=grid.describe(), bounds=grid.bounds,
        width_px=grid.columns, height_px=grid.rows, pixels_per_cell=1,
        pixel_origin='northwest', sample_position='cell_center',
        nodata='transparent where elevation or slope is missing or slope is outside 0..90 degrees',
        source=grid.header.get('source'), numeric_file=grid.header['files']['slope'],
        terrain_sha256={
            'elev': sha256(elev.tobytes(order='C')).hexdigest(),
            'slope': sha256(slope.tobytes(order='C')).hexdigest(),
        },
        placeholder=grid.header.get('placeholder'),
        placeholder_inputs=grid.header.get('placeholder_inputs', []),
        thresholds_deg=[10, 20], thresholds_role='assumption: display classes from shared/data-contract.md',
        legend=[dict(label=label, rgba=color) for label, color in zip(
            ['up to 10 degrees, comfortable', 'over 10 to 20 degrees, slow', 'over 20 degrees, blocked'], COLORS)],
        layer=dict(id='slope', name='Slope', priority=10, opacity=0.6, visible=False),
        use='display only; read numeric slope from the binary grid, never from this image',
        valid_cells=int(valid.sum()), missing_cells=int((~valid).sum()),
    )
    (output / 'slope_10m.json').write_text(json.dumps(metadata, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    return dict(grid_id=grid.grid_id, image=str(image), metadata=str(output / 'slope_10m.json'),
                valid_cells=metadata['valid_cells'], missing_cells=metadata['missing_cells'])


def sample_raster(grid, request):
    """Use the existing mapper on the deployed grid, not its former demo/local grid."""
    if request.get('grid_id', grid.grid_id) != grid.grid_id:
        raise ValueError('grid_id does not match the loaded grid')
    path = Path(request['path']).expanduser().resolve()
    if not path.is_file():
        raise ValueError('path must identify a local georeferenced GeoTIFF')
    band = request.get('band', 1)
    if type(band) is not int or band < 1:
        raise ValueError('band must be a positive integer')
    sys.path.insert(0, str(ROOT / 'backend/geoMapper'))
    from mars_mapping import GeoRaster, raster_to_matrix
    layer = GeoRaster(path)
    try:
        values = raster_to_matrix(layer, grid, band=band)
        unit = layer.ds.units[band - 1] or layer.ds.tags(band).get('units') or None
        # Object conversion is bounded by MappingGrid.MAX_CELLS.
        flat = [json_value(v) for v in values.reshape(-1)]
        return dict(grid_id=grid.grid_id, nx=grid.columns, ny=grid.rows,
                    source=str(path), band=band, units=unit, sampling='nearest_neighbour',
                    sample_position='cell_center', nodata=None, values=flat)
    finally:
        layer.close()


def execute(request, data_dir, output):
    if not isinstance(request, dict):
        raise ValueError('Request must be a JSON object')
    grid = MappingGrid.load(data_dir / 'grid.json')
    action = request.get('action', 'describe')
    if action == 'describe':
        return grid.describe()
    if action == 'query':
        return query(grid, request)
    if action == 'export_slope':
        return export_slope(grid, output)
    if action == 'sample_raster':
        return sample_raster(grid, request)
    raise ValueError(f'Unknown action: {action}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=DATA)
    parser.add_argument('--out-dir', type=Path, help='Only slope PNG/JSON are written here; defaults to data directory')
    parser.add_argument('--request', help='JSON request; otherwise read a single JSON object from stdin')
    args = parser.parse_args()
    try:
        request = json.loads(args.request if args.request is not None else sys.stdin.read())
        with contextlib.redirect_stdout(sys.stderr):
            result = execute(request, args.data_dir.resolve(), (args.out_dir or args.data_dir).resolve())
        response, code = dict(ok=True, result=result), 0
    except (ValueError, KeyError, TypeError, OSError, ImportError) as exc:
        response, code = dict(ok=False, error=dict(code='MAPPING_ERROR', message=str(exc))), 1
    print(json.dumps(response, allow_nan=False))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
