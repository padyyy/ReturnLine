import unittest
from dataclasses import replace

from backend.astar import astar
from backend.terrain_costs import CostConfig, TerrainCell, build_cost_grid


class TerrainCostTests(unittest.TestCase):
    def setUp(self):
        # Synthetic test limits, not operational terrain limits.
        self.config = CostConfig(20, 0.5, 0.8, 2, 2, 3, 4)
        self.flat = TerrainCell(-4400, 0, 0, 1)

    def test_normalization_and_units(self):
        cell = TerrainCell(-4400, 10, 0.25, 0.9)
        self.assertAlmostEqual(build_cost_grid([[cell]], self.config)[0][0], 7.8)
        self.assertEqual(build_cost_grid([[self.flat]], self.config), [[2]])

    def test_limits_and_missing_data(self):
        for change in ({'blocked': True}, {'slope_deg': 21}, {'roughness_m': 0.6},
                       {'valid_fraction': 0.79}, {'elevation_m': None},
                       {'slope_deg': float('nan')}, {'roughness_m': float('inf')}):
            with self.subTest(change=change):
                self.assertEqual(build_cost_grid([[replace(self.flat, **change)]], self.config), [[None]])
        boundary = TerrainCell(-4400, 20, 0.5, 0.8)
        self.assertIsNotNone(build_cost_grid([[boundary]], self.config)[0][0])

    def test_absolute_elevation_does_not_change_cost(self):
        self.assertEqual(build_cost_grid([[self.flat]], self.config),
                         build_cost_grid([[replace(self.flat, elevation_m=1000)]], self.config))

    def test_reference_is_independent_of_grid_extent(self):
        cell = TerrainCell(-4400, 10, 0.25, 0.9)
        self.assertEqual(build_cost_grid([[cell]], self.config)[0][0],
                         build_cost_grid([[cell, self.flat]], self.config)[0][0])

    def test_invalid_configuration_and_features(self):
        for change in ({'max_slope_deg': 0}, {'max_roughness_m': 0},
                       {'base_cost_per_m': 0}, {'slope_weight': -1},
                       {'min_valid_fraction': 2}, {'roughness_weight': float('nan')}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                replace(self.config, **change)
        for terrain in ([], [[]], [[self.flat], []],
                        [[replace(self.flat, roughness_m=-1)]],
                        [[replace(self.flat, valid_fraction=1.1)]]):
            with self.subTest(terrain=terrain), self.assertRaises(ValueError):
                build_cost_grid(terrain, self.config)

    def test_integration_routes_around_expensive_terrain(self):
        steep = replace(self.flat, slope_deg=20)
        terrain = [[self.flat, steep, self.flat], [self.flat] * 3]
        costs = build_cost_grid(terrain, replace(self.config, slope_weight=10))
        result = astar(costs, (0, 0), (0, 2), cell_size_m=10)
        self.assertNotIn((0, 1), result.path)
        self.assertEqual(result.total_cost, 80)
        self.assertEqual(terrain[0][1], steep)


if __name__ == '__main__':
    unittest.main()
