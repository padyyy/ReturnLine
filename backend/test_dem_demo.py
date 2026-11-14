import unittest
import numpy as np
from backend.dem_demo import derive_features, nearest_open, largest_component


class DemFeatureTests(unittest.TestCase):
    def test_plane_slope_and_zero_roughness(self):
        row, col = np.indices((21, 21))
        # z increases 0.1 m per pixel east, 0.2 m per pixel south; 1 m pixels.
        z = -3600 + col * 0.1 + row * 0.2
        slope, roughness, quality = derive_features(z, 1)
        self.assertAlmostEqual(slope[10, 10], np.degrees(np.arctan(np.hypot(.1, .2))), places=7)
        self.assertLess(roughness[10, 10], 1e-6)
        self.assertEqual(quality[10, 10], 1)
        self.assertTrue(np.isnan(slope[0, 0]))
        self.assertLess(quality[0, 0], 1)
        slope2, _, _ = derive_features(z, 2)
        self.assertAlmostEqual(slope2[10, 10], np.degrees(np.arctan(np.hypot(.1, .2)/2)))

    def test_roughness_and_missing_data(self):
        z = np.full((21, 21), -3600.)
        z[10, 10] += 1
        _, roughness, _ = derive_features(z, 1)
        self.assertAlmostEqual(roughness[10, 10], np.sqrt(120/121**2))
        z[10, 10] = np.nan
        slope, roughness, quality = derive_features(z, 1)
        self.assertTrue(np.isnan(slope[10, 10]))
        self.assertTrue(np.isnan(roughness[10, 10]))
        self.assertAlmostEqual(quality[10, 10], 120/121)

    def test_endpoint_selection(self):
        self.assertEqual(nearest_open(np.array([[np.nan, 1.], [np.nan, np.nan]]), (0, 0)), (0, 1))
        with self.assertRaises(ValueError):
            nearest_open(np.full((2, 2), np.nan), (0, 0))

    def test_largest_component_does_not_bridge_obstacles(self):
        costs = np.array([[1., np.nan, 1.], [np.nan, np.nan, 1.]])
        np.testing.assert_array_equal(largest_component(costs),
                                      [[False, False, True], [False, False, True]])
