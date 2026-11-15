"""Reduce one PDS REMS MODRDR sol to quality-filtered five-minute temperature bins."""
import argparse
import csv
import hashlib
import json
import math
import re
import statistics
import xml.etree.ElementTree as ET
from pathlib import Path
from .fill_temperature_gaps import add_estimates

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).resolve().parent / "data"
NS = {"p": "http://pds.nasa.gov/pds4/pds/v1"}
PDS = "https://atmos.nmsu.edu/PDS/data/PDS4/msl_rems_bundle/"


def celsius(value):
    try:
        kelvin = float(value)
    except (ValueError, TypeError):
        return None
    return kelvin - 273.15 if math.isfinite(kelvin) and kelvin > 0 else None


def reduce_rows(rows, columns, sol):
    bins = [{"lmst_min": minute, "air": [], "ground": []} for minute in range(0, 1440, 5)]
    count = 0
    for row in rows:
        count += 1
        get = lambda name: row[columns[name]].strip()
        match = re.fullmatch(r"(\d{5})M(\d{2}):(\d{2}):(\d{2}\.\d+)", get("LMST"))
        if not match or int(match[1]) != sol:
            raise ValueError("Unexpected sol or LMST format in PDS table")
        minute = int(match[2]) * 60 + int(match[3]) + float(match[4]) / 60
        if not 0 <= minute < 1440:
            raise ValueError("LMST outside one sol")
        bucket = bins[int(minute // 5)]
        air = celsius(get("AMBIENT_TEMP"))
        flags = get("AMBIENT_TEMP_CONFIDENCE_LEVEL")
        # PDS XML: supply in range, operational error <5 K, observation reliable.
        if air is not None and len(flags) == 9 and all(flags[i] == "1" for i in (2, 7, 8)):
            bucket["air"].append(air)
        ground = celsius(get("BRIGHTNESS_TEMP"))
        # All four GTS flags good: supply, recalibration, rover still, no FOV shadow.
        if ground is not None and get("GTS_CONFIDENCE_LEVEL") == "1111":
            bucket["ground"].append(ground)
    return [{"lmst_min": b["lmst_min"], **{
        f"{key}_{suffix}": (round(statistics.median(b[key]), 1) if b[key] else None)
        if suffix == "c" else len(b[key])
        for key in ("air", "ground") for suffix in ("c", "n")
    }} for b in bins], count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--table", type=Path, required=True, help="Downloaded MODRDR .TAB")
    parser.add_argument("--label", type=Path, required=True, help="Corresponding PDS4 .xml")
    parser.add_argument("--source-url", required=True, help="Original PDS .TAB URL")
    parser.add_argument("--scenario", type=Path, default=DATA / "scenario.json")
    parser.add_argument("--out", type=Path, default=DATA / "temperature.json")
    args = parser.parse_args()
    if not args.source_url.startswith(PDS) or not args.source_url.endswith(".TAB"):
        parser.error("Source must be a NASA PDS REMS bundle table")
    sc = json.loads(args.scenario.read_text(encoding="utf-8"))
    sol = sc["sol"]
    label = ET.parse(args.label)
    fields = label.findall(".//p:Field_Character", NS)
    columns = {f.findtext("p:name", namespaces=NS): int(f.findtext("p:field_number", namespaces=NS)) - 1 for f in fields}
    with args.table.open(newline="", encoding="ascii") as stream:
        samples, count = reduce_rows(csv.reader(stream), columns, sol)
    expected = int(label.findtext(".//p:records", namespaces=NS))
    label_name = label.findtext(".//p:file_name", namespaces=NS)
    if count != expected or args.source_url.rsplit("/", 1)[-1] != label_name:
        raise ValueError("Incomplete table or mismatched PDS label/source URL")
    waypoints = (ROOT / "frontend/src/boxwork-path.js").read_text()
    position = next(([float(lon), float(lat)] for lat, lon, s in
                     re.findall(r"\[(-?[\d.]+),\s*(-?[\d.]+),\s*(\d+)\]", waypoints) if int(s) == sol), None)
    result = {
        "sol": sol, "time_scale": "LMST", "bin_min": 5, "units": "degC",
        "generator": "backend/rems/rems_temperature.py",
        "source_url": args.source_url, "label_url": args.source_url[:-4] + ".xml",
        "source_sha256": hashlib.sha256(args.table.read_bytes()).hexdigest(),
        "source_records": count,
        "position": {"coordinates": position, "source": "frontend/src/boxwork-path.js (MMGIS waypoints)",
                     "note": "Representative sol waypoint, not the sensor footprint or a temperature field"},
        "aggregation": "Median of accepted samples within each five-minute LMST bin; empty bins null; no gap filling",
        "quality": {"air": "AMBIENT_TEMP: supply flag 2, operational-range flag 7 and reliability flag 8 must be 1",
                    "ground": "BRIGHTNESS_TEMP: GTS_CONFIDENCE_LEVEL must be 1111; all other samples excluded"},
        "samples": samples,
    }
    result = add_estimates(result)
    args.out.write_text(json.dumps(result, indent=1) + "\n")
    print(f"Sol {sol}: {count} records; accepted air {sum(b['air_n'] for b in samples)}, ground {sum(b['ground_n'] for b in samples)}")
    print(f"Wrote {args.out}; local rover context only, no spatial temperature interpolation.")


if __name__ == "__main__":
    main()
