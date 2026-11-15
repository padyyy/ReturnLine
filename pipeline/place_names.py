"""Place names of the backend (backend/config/place_names.json) onto the console grid.

GeoMapper's grid (pipeline/mapping_grid.py, MappingGrid.xy) gives each name its cell of the console
grid; names outside the grid are left out and reported. Writes frontend/public/data/place_names.geojson,
which the console shows as labels (Layers menu: "Place names") on the base map and the tablet.

Run (repo root):  .venv/Scripts/python pipeline/place_names.py
"""
from __future__ import annotations

from datetime import date
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from mapping_grid import MappingGrid  # noqa: E402  the console grid as a GeoMapper grid

SOURCE = ROOT / "backend" / "config" / "place_names.json"
DATA = ROOT / "frontend" / "public" / "data"


def main() -> int:
    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    grid = MappingGrid.load(DATA / "grid.json")
    feats, outside = [], []
    for q in src["names"]:
        cell = grid.xy(float(q["lon"]), float(q["lat"]))
        if cell is None:
            outside.append(q["name"])
            continue
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [q["lon"], q["lat"]]},
                      "properties": {"id": q["id"], "name": q["name"], "label": q.get("label", "right"), "cell": list(cell)}})
        print(f"{q['name']}: GeoMapper cell {tuple(cell)}")
    out = {"type": "FeatureCollection", "generator": "pipeline/place_names.py", "date": date.today().isoformat(),
           "source": "backend/config/place_names.json", "grid_id": grid.grid_id,
           "note": src["note"], "position_accuracy": src["position_accuracy"], "provenance": src["source"], "features": feats}
    (DATA / "place_names.geojson").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    if outside:
        print("outside the console grid, left out:", ", ".join(outside))
    print(f"wrote {len(feats)} place names to frontend/public/data/place_names.geojson")
    return 0


if __name__ == "__main__":
    sys.exit(main())
