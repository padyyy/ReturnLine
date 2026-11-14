import tempfile
import unittest
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

from backend.geoMapper.mars_mapping import GeoRaster
from backend.mapper_route import cell_grid, grid_for_dem, read_layers, route_from_maps, prepare_maps
from backend.science_routes import calculate_routes, export_routes
import json
from backend.terrain_costs import CostConfig, build_cost_grid
from backend.radiation import DoseConfig, write_background_map
from backend.mapper_route import load_layer_specs
import subprocess
import sys


class MapperRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.dem = self.root/'dem.tif'
        self.write(self.dem, np.full((7, 7), -3600., dtype='float32'))
        layer = GeoRaster(self.dem)
        try:
            self.grid = grid_for_dem(layer)
        finally:
            layer.close()

    def tearDown(self):
        self.temp.cleanup()

    def write(self, path, data):
        with rasterio.open(path, 'w', driver='GTiff', width=data.shape[1], height=data.shape[0],
                           count=1, dtype='float32', nodata=-9999,
                           crs='+proj=eqc +R=3396190 +lat_ts=0 +units=m',
                           transform=from_origin(8143000, -285000, 1, 1)) as ds:
            ds.write(data.astype('float32'), 1)

    def test_missing_features_are_none_and_ignored(self):
        cells = cell_grid(np.array([[-3600., np.nan]]), {})
        cell = cells[0][0]
        for field in ('slope_deg', 'roughness_m', 'blocked', 'protected_zone',
                      'radiation_msv_per_day', 'scientifically_relevant'):
            self.assertIsNone(getattr(cell, field))
        self.assertEqual(build_cost_grid(cells, CostConfig(20,.5,.8,1), ignore_missing=True), [[1, 1]])

    def test_tiff_mask_and_xy_route(self):
        mask = np.zeros((7, 7)); mask[1:6, 3] = 1
        mask_path = self.root/'blocked.tif'; self.write(mask_path, mask)
        path, grid, arrays, _, _ = route_from_maps(
            self.dem, self.grid.lonlat_center(1, 3), self.grid.lonlat_center(5, 3),
            grid=self.grid, layer_specs={'blocked': {'path': str(mask_path)}}, derive=False)
        self.assertEqual(path[0], [1, 3]); self.assertEqual(path[-1], [5, 3])
        self.assertTrue(all(not (x == 3 and 1 <= y < 6) for x, y in path))
        self.assertTrue(np.isnan(arrays['radiation_msv_per_day']).all())
        self.assertTrue(all(abs(x-nx)+abs(y-ny) == 1 for (x,y),(nx,ny) in zip(path,path[1:])))
        self.assertEqual(arrays['blocked'][3, 3], 1)

    def test_csv_radius_and_semantic_binding(self):
        lon, lat = self.grid.lonlat_center(2, 2)
        csv = self.root/'rad.csv'; csv.write_text(f'Latitude,Longitude,RAD\n{lat},{lon},0.5\n')
        layers = read_layers(self.grid, {'radiation_msv_per_day':
            {'path': str(csv), 'column': 'RAD', 'radius_m': .2}})
        values = layers['radiation_msv_per_day']
        self.assertEqual(values[2, 2], .5)
        self.assertTrue(np.isnan(values[0, 0]))

    def test_explicit_outside_endpoint_fails(self):
        with self.assertRaises(ValueError):
            route_from_maps(self.dem, (0, 0), self.grid.lonlat_center(2, 2), derive=False)

    def test_protection_penalty_changes_route(self):
        protection = np.zeros((7, 7)); protection[3, 3] = 1
        zone = self.root/'zone.tif'; self.write(zone, protection)
        path, _, _, _, _ = route_from_maps(
            self.dem, self.grid.lonlat_center(1, 3), self.grid.lonlat_center(5, 3),
            grid=self.grid, layer_specs={'protected_zone': {'path': str(zone)}},
            protected_penalty=10, derive=False)
        self.assertNotIn([3, 3], path)

    def test_multiple_routes_and_ordered_xy_export(self):
        base = self.grid.lonlat_center(1, 3)
        targets = [self.grid.lonlat_center(5, 3), self.grid.lonlat_center(2, 1)]
        mission = {'base': {'lon': base[0], 'lat': base[1]}, 'targets': [
            {'id': str(i), 'name': str(i), 'lon': lon, 'lat': lat}
            for i, (lon, lat) in enumerate(targets)]}
        prepared = prepare_maps(self.dem, grid=self.grid, derive=False)
        routes = calculate_routes(prepared, mission)
        export_routes(self.root/'output', prepared, mission, routes)
        paths = json.loads((self.root/'output/paths_xy.json').read_text())
        for route, expected in zip(routes, ([5, 3], [2, 1])):
            path = paths[route['id']]
            self.assertEqual(path[0], [1, 3])
            self.assertEqual(path[-1], expected)
            self.assertEqual(path, json.loads((self.root/'output'/route['id']/'path_xy.json').read_text()))

    def test_radiation_weight_changes_route_and_matches_objective(self):
        radiation = np.full((7, 7), .64); radiation[3, 3] = 1000
        source = self.root / 'radiation.tif'; self.write(source, radiation)
        specs = {'radiation_msv_per_day': {'path': str(source)}}
        start, goal = self.grid.lonlat_center(1, 3), self.grid.lonlat_center(5, 3)
        direct, *_ = route_from_maps(self.dem, start, goal, grid=self.grid, layer_specs=specs, derive=False)
        self.assertIn([3, 3], direct)
        path, _, _, _, summary = route_from_maps(
            self.dem, start, goal, grid=self.grid, layer_specs=specs, derive=False,
            dose_config=DoseConfig(radiation_weight=1000, goal_dwell_seconds=60))
        self.assertNotIn([3, 3], path)
        dose = summary['radiation']
        self.assertAlmostEqual(summary['total_cost'], summary['length_m'] + 1000 * dose['moving_dose_msv'])
        self.assertAlmostEqual(dose['duration_seconds'], summary['length_m'] + 60)
        self.assertGreater(dose['total_dose_msv'], dose['moving_dose_msv'])

    def test_missing_radiation_and_unreachable_dose(self):
        start, goal = self.grid.lonlat_center(1, 3), self.grid.lonlat_center(5, 3)
        path, _, _, _, summary = route_from_maps(self.dem, start, goal, grid=self.grid, derive=False)
        self.assertTrue(path)
        self.assertEqual(summary['radiation']['status'], 'incomplete')
        self.assertIsNone(summary['radiation']['total_dose_msv'])
        path, _, _, _, summary = route_from_maps(
            self.dem, start, goal, grid=self.grid, derive=False, dose_config=DoseConfig(radiation_weight=1))
        self.assertIsNone(path)
        self.assertEqual(summary['radiation']['status'], 'unreachable')

    def test_single_and_batch_cli_with_generated_tiff(self):
        background = self.root / 'background'
        write_background_map(self.grid, background)
        start, goal = self.grid.lonlat_center(1, 3), self.grid.lonlat_center(5, 3)
        common = [str(self.dem), '--grid', str(background / 'grid.json'),
                  '--layers', str(background / 'layers.json'), '--walking-speed-m-s', '.5',
                  '--goal-dwell-seconds', '60', '--radiation-weight', '100', '--no-derive']
        out = self.root / 'single'
        result = subprocess.run([
            sys.executable, '-m', 'backend.mapper_route', *common,
            '--start', *map(str, start), '--goal', *map(str, goal), '--output-dir', str(out)],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads((out / 'summary.json').read_text())
        self.assertEqual(summary['radiation']['status'], 'complete')
        self.assertAlmostEqual(summary['radiation']['total_dose_msv'], .64 * 68 / 86400)
        mission = self.root / 'targets.json'
        mission.write_text(json.dumps({'base': {'lon': start[0], 'lat': start[1]},
            'targets': [{'id': 'test', 'name': 'Test', 'lon': goal[0], 'lat': goal[1]}]}))
        batch = self.root / 'batch'
        result = subprocess.run([
            sys.executable, '-m', 'backend.science_routes', *common,
            '--targets', str(mission), '--output-dir', str(batch)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        saved = json.loads((batch / 'test/summary.json').read_text())['summary']
        self.assertEqual(saved['radiation'], summary['radiation'])
