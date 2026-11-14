"""Read-only adapter for the deployed Mars eqc grid; no routing or new grid definition."""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import json
import math
import re

import numpy as np

MARS_RADIUS_M = 3396190.0
M_PER_DEG = MARS_RADIUS_M * math.pi / 180
MAX_CELLS = 8_000_000


@dataclass(frozen=True)
class MappingGrid:
    header: dict
    directory: Path

    def __post_init__(self):
        h = self.header
        for name in ('nx', 'ny'):
            if type(h.get(name)) is not int or h[name] < 1:
                raise ValueError(f'{name} must be a positive integer')
        if h['nx'] * h['ny'] > MAX_CELLS:
            raise ValueError('Grid exceeds 8 million cells')
        for value in (h['cell_m'], h['origin_m']['x'], h['origin_m']['y']):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError('Grid origin and cell size must be finite numbers')
        if h['cell_m'] <= 0:
            raise ValueError('cell_m must be positive')
        # The deployed header includes explanatory prose, so do not feed it to PROJ.
        params = dict(re.findall(r'\+(\w+)=([^\s]+)', h.get('crs', '')))
        required = {'proj': 'eqc', 'lat_ts': '0', 'lon_0': '0', 'R': '3396190', 'units': 'm'}
        if any(params.get(k) != v for k, v in required.items()):
            raise ValueError('Only the deployed Mars eqc / lat_ts=0 / lon_0=0 / R=3396190 grid is supported')
        for name in ('lat_0', 'x_0', 'y_0'):
            if float(params.get(name, 0)) != 0:
                raise ValueError(f'Unsupported non-zero projection parameter: {name}')
        if not (-90 <= self.south < self.north <= 90 and -360 <= self.west < self.east <= 360):
            raise ValueError('Grid extends outside supported geographic bounds')
        bbox = h.get('bbox_deg')
        if bbox is not None and (len(bbox) != 4 or not np.allclose(
                bbox, [self.west, self.south, self.east, self.north], rtol=0, atol=1e-6)):
            raise ValueError('bbox_deg conflicts with the projected grid geometry')

    @classmethod
    def load(cls, path: str | Path) -> 'MappingGrid':
        path = Path(path).resolve()
        return cls(json.loads(path.read_text(encoding='utf-8')), path.parent)

    @property
    def columns(self): return self.header['nx']
    @property
    def rows(self): return self.header['ny']
    @property
    def cell_size_m(self): return self.header['cell_m']
    @property
    def x0(self): return self.header['origin_m']['x']
    @property
    def y0(self): return self.header['origin_m']['y']
    @property
    def west(self): return self.x0 / M_PER_DEG
    @property
    def east(self): return (self.x0 + self.columns * self.cell_size_m) / M_PER_DEG
    @property
    def north(self): return self.y0 / M_PER_DEG
    @property
    def south(self): return (self.y0 - self.rows * self.cell_size_m) / M_PER_DEG
    @property
    def bounds(self): return [[self.south, self.west], [self.north, self.east]]

    @property
    def geometry(self):
        return dict(projection='mars_eqc', mars_radius_m=MARS_RADIUS_M, lat_ts=0, lon_0=0,
                    origin_m=dict(x=self.x0, y=self.y0), cell_m=self.cell_size_m,
                    nx=self.columns, ny=self.rows, row_order='north_to_south')

    @property
    def grid_id(self):
        encoded = json.dumps(self.geometry, sort_keys=True, separators=(',', ':')).encode()
        return 'mars-eqc-' + sha256(encoded).hexdigest()[:20]

    def require_cell(self, column, row):
        if type(column) is not int or type(row) is not int:
            raise ValueError('column and row must be integers')
        if not (0 <= column < self.columns and 0 <= row < self.rows):
            raise ValueError('Cell outside grid')

    def xy(self, lon, lat):
        if any(isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v)
               for v in (lon, lat)):
            raise ValueError('lon and lat must be finite numbers')
        if not (self.west <= lon < self.east and self.south < lat <= self.north):
            return None
        column = math.floor((lon * M_PER_DEG - self.x0) / self.cell_size_m)
        row = math.floor((self.y0 - lat * M_PER_DEG) / self.cell_size_m)
        # Multiplication may drift across an outer boundary by a few ulps.
        return min(self.columns - 1, max(0, column)), min(self.rows - 1, max(0, row))

    def lonlat_center(self, column, row):
        self.require_cell(column, row)
        return ((self.x0 + (column + .5) * self.cell_size_m) / M_PER_DEG,
                (self.y0 - (row + .5) * self.cell_size_m) / M_PER_DEG)

    def cell(self, column, row):
        lon, lat = self.lonlat_center(column, row)
        west = (self.x0 + column * self.cell_size_m) / M_PER_DEG
        north = (self.y0 - row * self.cell_size_m) / M_PER_DEG
        east = (self.x0 + (column + 1) * self.cell_size_m) / M_PER_DEG
        south = (self.y0 - (row + 1) * self.cell_size_m) / M_PER_DEG
        return dict(column=column, row=row, index=row * self.columns + column,
                    lon=lon, lat=lat, bounds=[[south, west], [north, east]],
                    image_uv=[(column + .5) / self.columns, (row + .5) / self.rows])

    def lonlat_mesh(self):
        lon = (self.x0 + (np.arange(self.columns) + .5) * self.cell_size_m) / M_PER_DEG
        lat = (self.y0 - (np.arange(self.rows) + .5) * self.cell_size_m) / M_PER_DEG
        return np.broadcast_to(lon, (self.rows, self.columns)), np.broadcast_to(lat[:, None], (self.rows, self.columns))

    def read_float(self, key):
        name = self.header.get('files', {}).get(key)
        if not isinstance(name, str):
            raise ValueError(f'No file declared for {key}')
        path = (self.directory / name).resolve()
        if not path.is_relative_to(self.directory.resolve()):
            raise ValueError('Grid file must stay inside its data directory')
        expected = self.rows * self.columns * 4
        if path.stat().st_size != expected:
            raise ValueError(f'{name}: expected {expected} bytes')
        return np.fromfile(path, dtype='<f4').reshape(self.rows, self.columns)

    def describe(self):
        return dict(grid_id=self.grid_id, **self.geometry, bounds=self.bounds,
                    coordinate_order='lon,lat', bounds_order='[[south,west],[north,east]]',
                    index_formula='row * nx + column', sample_position='cell_center',
                    binary_order='row-major', byte_order='little-endian',
                    nodata_json=None, files=self.header.get('files', {}),
                    source=self.header.get('source'), placeholder=self.header.get('placeholder'),
                    placeholder_inputs=self.header.get('placeholder_inputs', []))
