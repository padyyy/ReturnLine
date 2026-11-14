import unittest
import numpy as np
from backend.terrain_features import derive_features


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

