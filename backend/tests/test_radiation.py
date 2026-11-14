import json
import math
from pathlib import Path
import tempfile
import unittest

import numpy as np
from pyproj import CRS

from backend.geoMapper.mars_mapping import GeoRaster, LocalMetricGrid, raster_to_matrix, convert_xy
from backend.geoMapper.mars_mapping import MARS_SPHERE_GEO_CRS
from backend.mapper_route import load_layer_specs, read_layers
from backend.radiation import (
    DoseConfig, add_radiation_costs, integrate_route_dose, write_background_map, dose_for_exported_routes,
)


class DoseTests(unittest.TestCase):
    def test_hour_and_destination_rate_integration(self):
        dose = integrate_route_dose([[0, 0], [1, 0]], np.array([[0.1, 0.64]]), 3600)
        self.assertAlmostEqual(dose['total_dose_msv'], 0.64 / 24)
        self.assertEqual(dose['duration_seconds'], 3600)
        self.assertEqual(dose['profile'][0]['cumulative_dose_msv'], 0)
        self.assertEqual(dose['profile'][-1]['cumulative_dose_msv'], dose['total_dose_msv'])

    def test_varying_rates_speed_and_dwell(self):
        dose = integrate_route_dose([[0, 0], [1, 0], [2, 0]], np.array([[1, 864, 1728]]),
                                    10, DoseConfig(walking_speed_m_s=2, goal_dwell_seconds=10))
        self.assertAlmostEqual(dose['moving_dose_msv'], .15)
        self.assertAlmostEqual(dose['goal_dwell_dose_msv'], .2)
        self.assertAlmostEqual(dose['total_dose_msv'], .35)
        self.assertEqual(dose['duration_seconds'], 20)
        self.assertEqual(len(dose['profile']), 3)
        self.assertAlmostEqual(dose['profile'][1]['cumulative_dose_msv'], .05)

    def test_missing_rate_keeps_total_unknown(self):
        dose = integrate_route_dose([[0, 0], [1, 0], [2, 0]], np.array([[1, np.nan, 864]]),
                                    10, DoseConfig(goal_dwell_seconds=5))
        self.assertEqual(dose['status'], 'incomplete')
        self.assertIsNone(dose['total_dose_msv'])
        self.assertIsNone(dose['moving_dose_msv'])
        self.assertAlmostEqual(dose['known_dose_msv'], .15)
        self.assertEqual(dose['unknown_duration_seconds'], 10)
        self.assertIsNone(dose['profile'][-1]['cumulative_dose_msv'])
        json.dumps(dose, allow_nan=False)

    def test_zero_length_dwell_unreachable_and_diagonal(self):
        rates = np.full((2, 2), .64)
        zero = integrate_route_dose([[0, 0]], np.array([[np.nan]]), 1)
        self.assertEqual(zero['total_dose_msv'], 0)
        dwell = integrate_route_dose([[0, 0]], rates, 1, DoseConfig(goal_dwell_seconds=3600))
        self.assertAlmostEqual(dwell['total_dose_msv'], .64 / 24)
        self.assertEqual(dwell['moving_dose_msv'], 0)
        diagonal = integrate_route_dose([[0, 0], [1, 1]], rates, 10)
        self.assertAlmostEqual(diagonal['duration_seconds'], math.sqrt(2) * 10)
        unreachable = integrate_route_dose(None, rates, 1)
        self.assertIsNone(unreachable['total_dose_msv'])
        self.assertEqual(unreachable['profile'], [])

    def test_radiation_costs_unknown_policy_and_no_input_mutation(self):
        costs = [[1., 2., None]]
        rates = np.array([[864., np.nan, 10.]])
        result = add_radiation_costs(costs, rates, DoseConfig(walking_speed_m_s=2, radiation_weight=10))
        self.assertAlmostEqual(result[0][0], 1.05)
        self.assertEqual(result[0][1:], [None, None])
        self.assertEqual(costs, [[1., 2., None]])
        self.assertEqual(add_radiation_costs(costs, rates, DoseConfig()), costs)

    def test_invalid_inputs(self):
        for args in ({'walking_speed_m_s': 0}, {'walking_speed_m_s': -1},
                     {'goal_dwell_seconds': -1}, {'radiation_weight': -1},
                     {'walking_speed_m_s': float('nan')}, {'radiation_weight': float('inf')}):
            with self.subTest(args=args), self.assertRaises(ValueError):
                DoseConfig(**args)
        for rates in (np.array([[-1]]), np.array([[np.inf]]), np.array([1]), np.empty((0, 0))):
            with self.subTest(rates=rates), self.assertRaises(ValueError):
                integrate_route_dose([[0, 0]], rates, 1)
        for path in ([], [[1, 0]], [[0.5, 0]], [[0, 0], [2, 0]]):
            with self.subTest(path=path), self.assertRaises(ValueError):
                integrate_route_dose(path, np.array([[1]]), 1)
        with self.assertRaises(ValueError):
            integrate_route_dose([[0, 0]], np.array([[1]]), 0)


class BackgroundMapTests(unittest.TestCase):
    def test_mars_georeference_and_geomapper_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            for position in ('center', 'northwest_corner'):
                grid = LocalMetricGrid(-4.8106, 137.3807, 1, 9, 7, reference_position=position)
                out = Path(tmp) / position
                path = write_background_map(grid, out)
                layer = GeoRaster(path)
                try:
                    mapped = raster_to_matrix(layer, grid)
                    np.testing.assert_allclose(mapped, .64)
                    for x, y in ((0, 0), (8, 6), (4, 3)):
                        lon, lat = grid.lonlat_center(x, y)
                        xx, yy = convert_xy(lon, lat, CRS.from_user_input(MARS_SPHERE_GEO_CRS), layer.crs)
                        col, row = ~layer.ds.transform @ (xx, yy)
                        self.assertAlmostEqual(col, x + .5, places=6)
                        self.assertAlmostEqual(row, y + .5, places=6)
                    self.assertEqual(layer.ds.units, ('mSv/day',))
                    self.assertEqual(layer.ds.tags()['quantity'], 'dose_equivalent_rate')
                finally:
                    layer.close()
                specs = load_layer_specs(out / 'layers.json')
                self.assertEqual(Path(specs['radiation_msv_per_day']['path']), path.resolve())
                np.testing.assert_allclose(read_layers(grid, specs)['radiation_msv_per_day'], .64)
                meta = json.loads(path.with_suffix('.metadata.json').read_text())
                self.assertEqual(meta['grid']['rows'], 7)
                self.assertIn('uniform', meta['scenario'])
                self.assertEqual(meta['source_reference_uncertainty_msv_per_day'], .12)

    def test_existing_routes_use_tiff_and_preserve_unreachable(self):
        with tempfile.TemporaryDirectory() as tmp:
            grid = LocalMetricGrid(-4.8106, 137.3807, 10, 3, 2)
            layer = write_background_map(grid, tmp)
            paths = Path(tmp) / 'paths_xy.json'
            paths.write_text(json.dumps({'walk': [[0, 0], [1, 0], [1, 1]], 'blocked': None}))
            result = dose_for_exported_routes(paths, grid, layer, DoseConfig(walking_speed_m_s=.5))
            self.assertEqual(result['routes']['blocked']['status'], 'unreachable')
            self.assertAlmostEqual(result['routes']['walk']['total_dose_msv'], .64 * 40 / 86400)
            self.assertEqual(result['routes']['walk']['duration_seconds'], 40)


if __name__ == '__main__':
    unittest.main()
