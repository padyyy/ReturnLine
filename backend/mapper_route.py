"""GeoMapper -> per-cell features -> A* -> ordered [x, y] path.

uv run python -m backend.mapper_route 'dem.tif' --start LON LAT --goal LON LAT
"""
import argparse
from dataclasses import asdict, dataclass
import json
import math
from pathlib import Path

import numpy as np
from pyproj import CRS

from backend.geoMapper.mars_mapping import (
    GeoRaster, CsvPointLayer, FixedGrid, LocalMetricGrid, MARS_SPHERE_GEO_CRS,
    convert_xy, raster_to_matrix, csv_to_matrices, save_npz,
)
from backend.astar import astar
from backend.terrain_features import derive_features
from backend.terrain_costs import TerrainCell, CostConfig, build_cost_grid
from backend.radiation import DoseConfig, add_radiation_costs, integrate_route_dose

FIELDS = ('slope_deg', 'roughness_m', 'blocked', 'protected_zone',
          'radiation_msv_per_day', 'scientifically_relevant')
FLAGS = {'blocked', 'protected_zone', 'scientifically_relevant'}
DEFAULT_CONFIG = CostConfig(20, 0.5, 0.8, 1, 2, 2, 1)


def load_layer_specs(filename):
    """Resolve paths relative to a layer-binding JSON for both routing CLIs."""
    if filename is None:
        return {}
    filename = Path(filename).resolve()
    specs = json.loads(filename.read_text(encoding='utf-8'))
    for spec in specs.values():
        if spec and not Path(spec['path']).is_absolute():
            spec['path'] = str((filename.parent / spec['path']).resolve())
    return specs


def add_map_arguments(parser):
    parser.add_argument('--grid', type=Path, help='Optional agreed local-metric grid JSON')
    parser.add_argument('--layers', type=Path, help='JSON bindings for optional raster/CSV maps')
    parser.add_argument('--protected-penalty', type=float, default=0)
    parser.add_argument('--no-derive', action='store_true', help='Use only provided feature maps')
    parser.add_argument('--walking-speed-m-s', type=float, default=1.0,
                        help='Constant assumed walking speed for dose, default 1 m/s')
    parser.add_argument('--goal-dwell-seconds', type=float, default=0,
                        help='Stationary exposure at each route goal')
    parser.add_argument('--radiation-weight', type=float, default=0,
                        help='Movement dose penalty in demo cost units per mSv; default 0')


def prepare_maps_from_args(args):
    return prepare_maps(
        args.dem, grid=FixedGrid.load(args.grid) if args.grid else None,
        layer_specs=load_layer_specs(args.layers), protected_penalty=args.protected_penalty,
        derive=not args.no_derive,
        dose_config=DoseConfig(args.walking_speed_m_s, args.goal_dwell_seconds, args.radiation_weight))


def grid_for_dem(dem):
    """Default test grid, centered on DEM; not the production frontend grid."""
    ds = dem.ds
    if ds.transform.b != 0 or ds.transform.d != 0 or ds.transform.a <= 0 or ds.transform.e >= 0:
        raise ValueError('Default grid requires north-up pixels; supply --grid otherwise')
    x, y = ds.transform * (ds.width/2, ds.height/2)
    lon, lat = convert_xy(x, y, dem.crs, CRS.from_user_input(MARS_SPHERE_GEO_CRS))
    if dem.crs.is_geographic:
        size = abs(ds.transform.e) * math.pi/180 * 3396190
    elif dem.crs.axis_info and dem.crs.axis_info[0].unit_name == 'metre':
        size = abs(ds.transform.e)
    else:
        raise ValueError('Unsupported reference DEM units')
    return LocalMetricGrid(lat, lon, size, ds.width, ds.height)


def read_layers(grid, specs):
    """Explicit semantic bindings; missing files are errors, absent layers unknown.

    TIFF: {path, band?}. CSV: {path, column, radius_m, coordinate_crs?}.
    Features must already use the units in their names; flags must be 0 or 1.
    """
    unknown = set(specs) - set(FIELDS)
    if unknown:
        raise ValueError(f'Unknown feature names: {sorted(unknown)}')
    layers = {}
    for field, spec in specs.items():
        if spec is None:
            continue
        path = Path(spec['path'])
        if path.suffix.lower() == '.csv':
            layer = CsvPointLayer(path, nearest_radius_m=spec['radius_m'],
                                  coordinate_crs=spec.get('coordinate_crs', MARS_SPHERE_GEO_CRS))
            layers[field] = csv_to_matrices(layer, grid)[spec['column']]
        else:
            layer = GeoRaster(path)
            try:
                layers[field] = raster_to_matrix(layer, grid, band=spec.get('band', 1))
            finally:
                layer.close()
        values = layers[field]
        finite = values[np.isfinite(values)]
        if field in FLAGS and not np.isin(finite, [0, 1]).all():
            raise ValueError(f'{field} must contain only 0, 1, or NoData')
        if field == 'radiation_msv_per_day' and np.any(finite < 0):
            raise ValueError('Radiation rates must not be negative')
    return layers


def cell_grid(elevation, layers):
    """Materialize grid[row][column]; all unavailable optional fields are None."""
    shape = elevation.shape
    if any(v.shape != shape for v in layers.values()):
        raise ValueError('All layers must have the same grid shape')
    def value(field, row, col):
        layer = layers.get(field)
        if layer is None or not np.isfinite(layer[row, col]):
            return None
        number = float(layer[row, col])
        return bool(number) if field in FLAGS else number
    return [[TerrainCell(
        elevation_m=float(elevation[r, c]) if np.isfinite(elevation[r, c]) else None,
        slope_deg=value('slope_deg', r, c), roughness_m=value('roughness_m', r, c),
        valid_fraction=value('valid_fraction', r, c), blocked=value('blocked', r, c),
        protected_zone=value('protected_zone', r, c),
        radiation_msv_per_day=value('radiation_msv_per_day', r, c),
        scientifically_relevant=value('scientifically_relevant', r, c),
    ) for c in range(shape[1])] for r in range(shape[0])]


@dataclass
class PreparedMaps:
    grid: LocalMetricGrid
    costs: list
    arrays: dict
    provenance: dict
    config: CostConfig
    layer_specs: dict
    protected_penalty: float
    dose_config: DoseConfig = DoseConfig()


def prepare_maps(dem_path, *, grid=None, layer_specs=None, config=DEFAULT_CONFIG,
                 protected_penalty=0.0, derive=True, dose_config=DoseConfig()):
    """Map and normalize terrain once for any number of independent routes."""
    if not math.isfinite(protected_penalty) or protected_penalty < 0:
        raise ValueError('protected_penalty must be finite and nonnegative')
    dem = GeoRaster(dem_path)
    try:
        grid = grid if grid is not None else grid_for_dem(dem)
        if not isinstance(grid, LocalMetricGrid):
            raise ValueError('Routing currently requires a LocalMetricGrid with square metre cells')
        elevation = raster_to_matrix(dem, grid)
    finally:
        dem.close()
    layers = read_layers(grid, layer_specs or {})
    provenance = {key: 'mapped' for key in layers}
    if derive and min(elevation.shape) >= 11:
        slope, roughness, quality = derive_features(elevation, grid.cell_size_m)
        for key, array in [('slope_deg', slope), ('roughness_m', roughness)]:
            # An explicitly supplied map is authoritative, including its NoData.
            if key not in layers:
                layers[key] = array
                provenance[key] = 'derived from mapped DEM: local 11x11 plane'
        layers['valid_fraction'] = quality
    terrain = cell_grid(elevation, layers)
    costs = build_cost_grid(terrain, config, ignore_missing=True)
    del terrain
    if protected_penalty and 'protected_zone' in layers:
        for r, row in enumerate(costs):
            for c, value in enumerate(row):
                if value is not None and layers['protected_zone'][r, c] == 1:
                    row[c] *= 1 + protected_penalty
    arrays = {'elevation_m': elevation, **{key: layers.get(key, np.full(elevation.shape, np.nan)) for key in FIELDS}}
    costs = add_radiation_costs(costs, arrays['radiation_msv_per_day'], dose_config)
    arrays['costs'] = np.array([[np.nan if v is None else v for v in row] for row in costs], dtype=np.float32)
    return PreparedMaps(grid, costs, arrays, provenance, config, layer_specs or {}, protected_penalty, dose_config)


def route_prepared(prepared, start_lonlat, goal_lonlat):
    """Route on prepared maps; never relocate endpoints. Export order is [x,y]."""
    grid, costs = prepared.grid, prepared.costs
    config, layer_specs = prepared.config, prepared.layer_specs
    protected_penalty, provenance = prepared.protected_penalty, prepared.provenance
    endpoints = [grid.xy(*point) for point in (start_lonlat, goal_lonlat)]
    if any(point is None for point in endpoints):
        raise ValueError('Start or goal is outside the mapping grid; coordinates were not moved')
    expanded = np.zeros(prepared.arrays['elevation_m'].shape, dtype=bool)
    def observe(point):
        expanded[point] = True
    start, goal = endpoints
    result = astar(costs, (start[1], start[0]), (goal[1], goal[0]),
                   cell_size_m=grid.cell_size_m, on_expand=observe)
    path_xy = [[c, r] for r, c in result.path] if result else None
    dose = integrate_route_dose(path_xy, prepared.arrays['radiation_msv_per_day'],
                                grid.cell_size_m, prepared.dose_config)
    return path_xy, grid, prepared.arrays, expanded, {
        'status': 'found' if result else 'unreachable', 'start_lonlat': list(start_lonlat),
        'goal_lonlat': list(goal_lonlat), 'start_xy': start, 'goal_xy': goal,
        'node_count': len(path_xy) if path_xy else 0,
        'length_m': (len(path_xy)-1)*grid.cell_size_m if path_xy else None,
        'total_cost': result.total_cost if result else None, 'cost_units': 'demo units, not seconds',
        'grid': grid.to_dict(), 'config': asdict(config), 'layer_specs': layer_specs or {},
        'provenance': provenance, 'missing_policy': 'unknown -> None, no penalty or restriction; known constraints still apply',
        'protected_penalty': protected_penalty,
        'dose_config': asdict(prepared.dose_config), 'radiation': dose,
        'radiation_weight_units': 'demo cost units per mSv; movement only, excludes goal dwell',
        'radiation_missing_policy': 'blocked when radiation_weight > 0; incomplete dose otherwise',
        'radiation_and_science': 'radiation dose integrated; science information only',
    }



def route_from_maps(dem_path, start_lonlat, goal_lonlat, *, grid=None, layer_specs=None,
                    config=DEFAULT_CONFIG, protected_penalty=0.0, derive=True,
                    dose_config=DoseConfig()):
    """Convenience API: prepare maps, then find a single ordered XY route."""
    prepared = prepare_maps(dem_path, grid=grid, layer_specs=layer_specs, config=config,
                            protected_penalty=protected_penalty, derive=derive, dose_config=dose_config)
    return route_prepared(prepared, start_lonlat, goal_lonlat)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dem', type=Path)
    parser.add_argument('--start', nargs=2, type=float, required=True, metavar=('LON', 'LAT'))
    parser.add_argument('--goal', nargs=2, type=float, required=True, metavar=('LON', 'LAT'))
    add_map_arguments(parser)
    parser.add_argument('--plot', action='store_true')
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parent / 'routes/mapper_route')
    args = parser.parse_args()
    prepared = prepare_maps_from_args(args)
    path, grid, arrays, expanded, summary = route_prepared(prepared, args.start, args.goal)
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    (out/'path_xy.json').write_text(json.dumps(path, indent=2, allow_nan=False))
    (out/'summary.json').write_text(json.dumps(summary, indent=2, allow_nan=False))
    save_npz(out/'mapped_layers.npz', grid, arrays)
    # NPZ NaN is the compact numeric representation; accessor cell_grid exposes None.
    if args.plot:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(11, 9), layout='constrained')
        cmap = plt.get_cmap('YlOrRd').copy(); cmap.set_bad('#293545')
        im = ax.imshow(np.ma.masked_invalid(arrays['costs']), cmap=cmap, interpolation='nearest')
        fig.colorbar(im, ax=ax, label='Demo-Kosten pro Meter')
        if path:
            x, y = zip(*path); ax.plot(x, y, color='#00e5ff', lw=2, label='A*-Pfad')
        for point, label, color, marker in [(summary['start_xy'], 'Start', '#00bf70', 'o'),
                                            (summary['goal_xy'], 'Ziel', '#ef0080', '*')]:
            ax.scatter(*point, label=label, color=color, marker=marker, s=100, edgecolors='black', zorder=5)
        ax.set(title='GeoMapper → Geländekosten → A*', xlabel='x (nach rechts)', ylabel='y (nach unten)')
        ax.legend(); fig.savefig(out/'route.png', dpi=160); plt.close(fig)
    print(json.dumps({key: summary[key] for key in ['status', 'start_xy', 'goal_xy', 'node_count', 'length_m']}, indent=2))
    print(f"Dose equivalent: {summary['radiation']['total_dose_msv']} mSv "
          f"({summary['radiation']['status']})")
    print(f'Path array: {(out/"path_xy.json").resolve()}')


if __name__ == '__main__':
    main()
