"""Historical GCR background GeoTIFF and static-rate route dose equivalent.

This is a declared uniform scenario, not a spatial radiation measurement or
a terrain-shielding model. A day is 86400 SI seconds, not one Martian sol.
"""
import argparse
from dataclasses import dataclass
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

from backend.geoMapper.mars_mapping import FixedGrid, LocalMetricGrid, GeoRaster, raster_to_matrix

SECONDS_PER_DAY = 86400.0
REFERENCE_RATE = 0.64
SOURCE = 'https://doi.org/10.1126/science.1244797'
DEFAULT_GRID = Path(__file__).parent / 'config/radiation_grid.json'


@dataclass(frozen=True)
class DoseConfig:
    walking_speed_m_s: float = 1.0
    goal_dwell_seconds: float = 0.0
    radiation_weight: float = 0.0  # routing demo cost units per mSv

    def __post_init__(self):
        if any(not math.isfinite(v) for v in vars(self).values()):
            raise ValueError('Dose configuration must be finite')
        if self.walking_speed_m_s <= 0:
            raise ValueError('walking_speed_m_s must be positive')
        if self.goal_dwell_seconds < 0 or self.radiation_weight < 0:
            raise ValueError('Dwell time and radiation weight must be nonnegative')


def add_radiation_costs(costs, rates, config):
    """Add movement dose costs, using the same destination-cell rule as A*.

    Unknown radiation blocks a cell only when radiation optimization is enabled.
    The input terrain costs are never modified. Goal dwell is path-independent
    for a fixed goal and is reported separately, not added to search costs.
    """
    rates = np.asarray(rates, dtype=float)
    if rates.shape != (len(costs), len(costs[0])):
        raise ValueError('Radiation and cost grids must have the same shape')
    if np.isinf(rates).any() or np.any(rates[np.isfinite(rates)] < 0):
        raise ValueError('Radiation rates must be nonnegative or NaN')
    if config.radiation_weight == 0:
        return costs
    scale = config.radiation_weight / (config.walking_speed_m_s * SECONDS_PER_DAY)
    result = []
    for r, row in enumerate(costs):
        result.append([])
        for c, value in enumerate(row):
            rate = rates[r, c]
            updated = None if value is None or not math.isfinite(rate) else value + scale * rate
            if updated is not None and not math.isfinite(updated):
                raise ValueError('Radiation-weighted cost overflowed')
            result[-1].append(updated)
    return result


def integrate_route_dose(path_xy, rates, cell_size_m, config=DoseConfig()):
    """Dose equivalent in mSv, with a cumulative profile aligned to path_xy.

    Each movement interval uses the destination cell's rate, consistent with
    A*'s destination-cell cost quadrature. There is no initial entry time/dose.
    The final profile point includes goal dwell. After an unknown-rate interval
    the cumulative and total dose remain unknown; known dose is a partial sum.
    """
    if not math.isfinite(cell_size_m) or cell_size_m <= 0:
        raise ValueError('cell_size_m must be finite and positive')
    rates = np.asarray(rates, dtype=float)
    if rates.ndim != 2 or not rates.size:
        raise ValueError('Radiation rates must be a nonempty matrix')
    if np.isinf(rates).any() or np.any(rates[np.isfinite(rates)] < 0):
        raise ValueError('Radiation rates must be nonnegative or NaN')
    result = {
        'status': 'unreachable', 'quantity': 'dose_equivalent', 'dose_unit': 'mSv',
        'rate_unit': 'mSv/day', 'seconds_per_day': SECONDS_PER_DAY,
        'time_model': 'constant walking speed assumption; no terrain calibration',
        'walking_speed_m_s': config.walking_speed_m_s,
        'goal_dwell_seconds': config.goal_dwell_seconds,
        'integration': 'destination cell per movement interval; goal cell during dwell',
        'duration_seconds': None, 'moving_dose_msv': None,
        'goal_dwell_dose_msv': None, 'total_dose_msv': None,
        'known_dose_msv': None, 'unknown_duration_seconds': None, 'profile': [],
    }
    if path_xy is None:
        return result
    if not path_xy:
        raise ValueError('A reachable path must contain at least one cell')
    for point in path_xy:
        if (len(point) != 2 or not all(isinstance(v, (int, np.integer)) for v in point)
                or not (0 <= point[0] < rates.shape[1] and 0 <= point[1] < rates.shape[0])):
            raise ValueError('Path coordinates must be in-grid integer [x, y] cells')
    elapsed = known_dose = unknown_seconds = 0.0

    def accumulate(seconds, rate):
        nonlocal elapsed, known_dose, unknown_seconds
        elapsed += seconds
        if seconds == 0:
            return 0.0
        if not math.isfinite(rate):
            unknown_seconds += seconds
            return None
        dose = rate * seconds / SECONDS_PER_DAY
        known_dose += dose
        return dose

    def sample(point):
        x, y = point
        rate = float(rates[y, x])
        return {'x': int(x), 'y': int(y), 'elapsed_seconds': elapsed,
                'rate_msv_per_day': rate if math.isfinite(rate) else None,
                'cumulative_dose_msv': known_dose if unknown_seconds == 0 else None}

    profile = [sample(path_xy[0])]
    for previous, point in zip(path_xy, path_xy[1:]):
        dx, dy = point[0] - previous[0], point[1] - previous[1]
        if max(abs(dx), abs(dy)) != 1:
            raise ValueError('Path must consist of adjacent cells')
        seconds = math.hypot(dx, dy) * cell_size_m / config.walking_speed_m_s
        accumulate(seconds, float(rates[point[1], point[0]]))
        profile.append(sample(point))
    moving_dose = known_dose if unknown_seconds == 0 else None
    x, y = path_xy[-1]
    dwell_dose = accumulate(config.goal_dwell_seconds, float(rates[y, x]))
    profile[-1] = sample(path_xy[-1])
    if not all(math.isfinite(v) for v in (elapsed, known_dose, unknown_seconds)):
        raise ValueError('Exposure calculation overflowed')
    result.update(
        status='complete' if unknown_seconds == 0 else 'incomplete',
        duration_seconds=elapsed, moving_dose_msv=moving_dose,
        goal_dwell_dose_msv=dwell_dose,
        total_dose_msv=known_dose if unknown_seconds == 0 else None,
        known_dose_msv=known_dose, unknown_duration_seconds=unknown_seconds, profile=profile)
    return result


def write_background_map(grid, output_dir, rate_msv_per_day=REFERENCE_RATE):
    """Write a reproducible, compressed one-band float32 layer on this grid."""
    if not isinstance(grid, LocalMetricGrid):
        raise ValueError('Background export requires a LocalMetricGrid')
    if (not math.isfinite(rate_msv_per_day) or rate_msv_per_day < 0
            or rate_msv_per_day > np.finfo(np.float32).max):
        raise ValueError('Background rate must be nonnegative and representable as float32')
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    path = out / 'radiation_background_msv_per_day.tif'
    centered = grid.reference_position == 'center'
    west = -grid.width_m / 2 if centered else 0.0
    north = grid.height_m / 2 if centered else 0.0
    crs = (f'+proj=eqc +lat_ts={grid.reference_latitude} +lat_0={grid.reference_latitude} '
           f'+lon_0={grid.reference_longitude} +R={grid.mars_radius_m} +units=m +type=crs')
    metadata = {
        'scenario': 'spatially_uniform_historical_gcr_background',
        'quantity': 'dose_equivalent_rate', 'unit': 'mSv/day',
        'seconds_per_day': SECONDS_PER_DAY, 'rate_msv_per_day': rate_msv_per_day,
        'source': SOURCE, 'source_measurement_period': '2012-08-07 to 2013-06-01',
        'source_reference_rate_msv_per_day': REFERENCE_RATE,
        'source_reference_uncertainty_msv_per_day': 0.12,
        'spatial_information': 'uniform scenario; output pixel spacing is not measurement resolution',
        'limitations': 'No local shielding, suit shielding, current space weather or SEP events modeled',
        'grid': grid.to_dict(), 'nodata': -9999.0,
    }
    with rasterio.open(
            path, 'w', driver='GTiff', count=1, width=grid.columns, height=grid.rows,
            dtype='float32', crs=crs,
            transform=from_origin(west, north, grid.cell_size_m, grid.cell_size_m),
            nodata=-9999.0, compress='deflate', predictor=3, tiled=True) as ds:
        ds.write(np.full((grid.rows, grid.columns), rate_msv_per_day, dtype='float32'), 1)
        ds.set_band_description(1, 'radiation_msv_per_day')
        ds.set_band_unit(1, 'mSv/day')
        ds.update_tags(**{k: str(v) for k, v in metadata.items() if k != 'grid'})
    path.with_suffix('.metadata.json').write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')
    grid.save(out / 'grid.json')
    (out / 'layers.json').write_text(json.dumps({
        'radiation_msv_per_day': {
            'path': path.name, 'band': 1, 'quantity': metadata['quantity'],
            'unit': metadata['unit'], 'scenario': metadata['scenario'], 'source': SOURCE}}, indent=2) + '\n')
    return path


def dose_for_exported_routes(paths_file, grid, radiation_path, config=DoseConfig()):
    """Evaluate existing id -> XY-path exports without recomputing their routes."""
    paths_file = Path(paths_file)
    paths = json.loads(paths_file.read_text(encoding='utf-8'))
    if not isinstance(paths, dict):
        raise ValueError('Expected a JSON object mapping route IDs to XY paths')
    layer = GeoRaster(radiation_path)
    try:
        rates = raster_to_matrix(layer, grid)
    finally:
        layer.close()
    return {
        'source_paths': str(paths_file.resolve()), 'radiation_layer': str(Path(radiation_path).resolve()),
        'grid': grid.to_dict(), 'routes': {
            key: integrate_route_dose(path, rates, grid.cell_size_m, config)
            for key, path in paths.items()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--grid', type=Path, default=DEFAULT_GRID)
    parser.add_argument('--rate-msv-per-day', type=float, default=REFERENCE_RATE,
                        help='Uniform scenario rate; default historical reference 0.64')
    parser.add_argument('--output-dir', type=Path,
                        default=Path(__file__).parent / 'routes/radiation')
    parser.add_argument('--paths', type=Path, help='Optional existing paths_xy.json (route ID -> path)')
    parser.add_argument('--walking-speed-m-s', type=float, default=1.0)
    parser.add_argument('--goal-dwell-seconds', type=float, default=0.0)
    args = parser.parse_args()
    grid = FixedGrid.load(args.grid)
    config = DoseConfig(args.walking_speed_m_s, args.goal_dwell_seconds)
    path = write_background_map(grid, args.output_dir, args.rate_msv_per_day)
    print(f'Radiation scenario: {path.resolve()}')
    if args.paths:
        doses = dose_for_exported_routes(args.paths, grid, path, config)
        output = args.output_dir / 'routes_dose.json'
        output.write_text(json.dumps(doses, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        for key, dose in doses['routes'].items():
            print(f"{key}: {dose['total_dose_msv']} mSv ({dose['status']})")
        print(f'Route doses: {output.resolve()}')


if __name__ == '__main__':
    main()
