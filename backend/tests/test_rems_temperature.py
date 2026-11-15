import unittest
import math
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from backend.rems.rems_temperature import celsius, reduce_rows
from backend.rems.fill_temperature_gaps import add_estimates, fit, predict


COLUMNS = {name: i for i, name in enumerate(("LMST", "AMBIENT_TEMP", "AMBIENT_TEMP_CONFIDENCE_LEVEL", "BRIGHTNESS_TEMP", "GTS_CONFIDENCE_LEVEL"))}


class TemperatureTests(unittest.TestCase):
    def test_fit_module_cli_reproduces_prepared_export(self):
        root = Path(__file__).resolve().parents[2]
        source = root / 'backend/rems/data/temperature.json'
        expected = json.loads(source.read_text())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'temperature.json'
            subprocess.run([sys.executable, '-m', 'backend.rems.fill_temperature_gaps', '--input', str(source),
                            '--out', str(output)], cwd=root, check=True, capture_output=True, text=True)
            self.assertEqual(json.loads(output.read_text()), expected)

    def test_missing_values_and_kelvin_conversion(self):
        self.assertAlmostEqual(celsius("273.15"), 0)
        for value in ("-999.00", "NaN", "NULL", "0", None):
            self.assertIsNone(celsius(value))

    def test_quality_filter_and_aggregation_leave_gaps(self):
        rows = [
            ["04839M09:00:00.000", "250", "101XX1111", "270", "1111"],
            ["04839M09:01:00.000", "252", "101XX1111", "280", "0111"],
            ["04839M09:05:00.000", "260", "101XX1101", "-999", "1111"],
        ]
        bins, count = reduce_rows(rows, COLUMNS, 4839)
        self.assertEqual(count, 3)
        self.assertEqual(bins[108]["air_c"], -22.1)
        self.assertEqual(bins[108]["air_n"], 2)
        self.assertEqual(bins[108]["ground_c"], -3.1)
        self.assertEqual(bins[108]["ground_n"], 1)
        self.assertIsNone(bins[109]["air_c"])
        self.assertIsNone(bins[109]["ground_c"])

    def test_different_sol_is_rejected(self):
        with self.assertRaises(ValueError):
            reduce_rows([["04838M09:00:00.000", "250", "101XX1111", "270", "1111"]], COLUMNS, 4839)

    def test_periodic_regression_recovers_known_daily_curve(self):
        points = [(t, -40 + 12 * math.sin(2 * math.pi * t / 1440) - 8 * math.cos(2 * math.pi * t / 1440))
                  for t in range(0, 1440, 60)]
        coefficients = fit(points)
        for t, value in points:
            self.assertAlmostEqual(predict(t, coefficients), value)
        self.assertAlmostEqual(predict(0, coefficients), predict(1440, coefficients))

    def test_estimates_do_not_overwrite_observations_or_invent_ground_data(self):
        samples = [{"lmst_min": t, "air_c": -40 + 10 * math.sin(t / 1440 * 2 * math.pi) if t % 60 == 0 else None,
                    "air_n": 3 if t % 60 == 0 else 0, "ground_c": None, "ground_n": 0}
                   for t in range(0, 1440, 5)]
        data = {"time_scale": "LMST", "bin_min": 5, "units": "degC", "samples": samples}
        result = add_estimates(data)
        for original, updated in zip(samples, result["samples"]):
            for key in original:
                self.assertEqual(updated[key], original[key])
            self.assertIsNotNone(updated["air_model_c"])
            self.assertIsNone(updated["ground_model_c"])
            self.assertNotIn("air_model_c", original)
        self.assertEqual(result["gap_fill"]["channels"]["air"]["validation"]["tested_bins"], 24)
        self.assertEqual(result["gap_fill"]["channels"]["ground"]["status"], "insufficient_observations")
        self.assertEqual(add_estimates(result), result)

    def test_too_few_or_short_span_observations_do_not_fit(self):
        self.assertIsNone(fit([]))
        self.assertIsNone(fit([(t, -30) for t in range(20)]))
        self.assertIsNone(fit([(0, -30), (1400, -50)]))


if __name__ == "__main__":
    unittest.main()
