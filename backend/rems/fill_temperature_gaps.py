"""Add a separate periodic regression estimate; never overwrite REMS observations."""
import argparse
import copy
import json
import math
from pathlib import Path

DEFAULT = Path(__file__).resolve().parent / "data/temperature.json"
PERIOD = 1440


def features(minute):
    phase = 2 * math.pi * minute / PERIOD
    return [1.0, math.sin(phase), math.cos(phase)]


def fit(points):
    """Ordinary least squares, equal weight per observed bin, one daily harmonic."""
    if len(points) < 12 or max(t for t, _ in points) - min(t for t, _ in points) < 720:
        return None
    rows = [(features(t), value) for t, value in points]
    matrix = [[sum(x[i] * x[j] for x, _ in rows) for j in range(3)] +
              [sum(x[i] * value for x, value in rows)] for i in range(3)]
    for col in range(3):
        pivot = max(range(col, 3), key=lambda row: abs(matrix[row][col]))
        matrix[col], matrix[pivot] = matrix[pivot], matrix[col]
        divisor = matrix[col][col]
        if abs(divisor) < 1e-10:
            return None
        matrix[col] = [v / divisor for v in matrix[col]]
        for row in range(3):
            if row != col:
                factor = matrix[row][col]
                matrix[row] = [v - factor * p for v, p in zip(matrix[row], matrix[col])]
    return [row[-1] for row in matrix]


def predict(minute, coefficients):
    return sum(a * b for a, b in zip(features(minute), coefficients))


def validate(points):
    """Hold out each observed LMST hour together, then refit on the other hours."""
    errors = []
    for hour in sorted({int(t // 60) for t, _ in points}):
        train = [(t, v) for t, v in points if int(t // 60) != hour]
        coefficients = fit(train)
        if coefficients is not None:
            errors.extend(predict(t, coefficients) - v for t, v in points if int(t // 60) == hour)
    return {
        "method": "leave_one_observed_hour_out; refit for every held-out hour",
        "tested_bins": len(errors),
        "mae_c": round(sum(abs(v) for v in errors) / len(errors), 2) if errors else None,
        "rmse_c": round(math.sqrt(sum(v * v for v in errors) / len(errors)), 2) if errors else None,
        "max_abs_error_c": round(max(abs(v) for v in errors), 2) if errors else None,
        "limitation": "Same-sol reconstruction check, not accuracy at unobserved times or a confidence interval",
    }


def add_estimates(data):
    if data.get("time_scale") != "LMST" or data.get("bin_min") != 5 or data.get("units") != "degC":
        raise ValueError("Expected five-minute REMS LMST bins in degrees Celsius")
    result = copy.deepcopy(data)
    models = {}
    for channel in ("air", "ground"):
        points = [(s["lmst_min"] + 2.5, s[f"{channel}_c"]) for s in data["samples"]
                  if isinstance(s.get(f"{channel}_c"), (int, float)) and math.isfinite(s[f"{channel}_c"])]
        coefficients = fit(points)
        for sample in result["samples"]:
            estimate = predict(sample["lmst_min"] + 2.5, coefficients) if coefficients is not None else None
            sample[f"{channel}_model_c"] = round(estimate, 1) if estimate is not None and estimate > -273.15 else None
        models[channel] = {
            "status": "fitted" if coefficients is not None else "insufficient_observations",
            "observed_bins": len(points),
            "model_bins": sum(s[f"{channel}_model_c"] is not None for s in result["samples"]),
            # Beyond the display precision; suppress Python-version summation noise in exports.
            "coefficients_c": [round(value, 10) for value in coefficients] if coefficients is not None else None,
            "observed_range_min": [points[0][0], points[-1][0]] if points else None,
            "validation": validate(points) if coefficients is not None else None,
        }
    result["gap_fill"] = {
        "generator": "backend/rems/fill_temperature_gaps.py",
        "method": "ordinary least squares, one daily harmonic, equal weight per observed five-minute bin",
        "formula": "T(t) = a + b*sin(2*pi*t/1440) + c*cos(2*pi*t/1440)",
        "period_min": PERIOD, "evaluation": "bin midpoint (lmst_min + 2.5)",
        "assumption": "A smooth repeating daily cycle approximates local air/ground temperature on this historical sol",
        "minimum_support": "12 observed bins spanning at least 720 minutes; each channel fitted separately",
        "outside_observed_range": "Periodic model estimate, with no direct measurement support there",
        "observations_preserved": True, "channels": models,
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT)
    parser.add_argument("--out", type=Path, default=DEFAULT)
    args = parser.parse_args()
    result = add_estimates(json.loads(args.input.read_text(encoding="utf-8")))
    args.out.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    for channel, model in result["gap_fill"]["channels"].items():
        print(f"{channel}: observed {model['observed_bins']}, estimated {model['model_bins']}; {model['validation']}")


if __name__ == "__main__":
    main()
