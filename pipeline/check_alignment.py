"""Check that every map and every position the console shows sits on the console grid via GeoMapper.

The console grid is frontend/public/data/grid.json, read as a GeoMapper grid by pipeline/mapping_grid.py.
Checked:
- grid: GeoMapper validation of the header (projection, size, origin, file lengths)
- habitat: the time grid's habitat_cell is GeoMapper's cell of the habitat
- stations and zones: inside the grid; no station and not the habitat inside a protected zone;
  every station reachable in the time grid
- routes.json: every vertex inside the grid; each route starts in the habitat's cell and ends in its
  station's cell; out and back run through no zone
- A* paths (backend/routes/science_routes): GeoMapper's LocalMetricGrid cells of start and goal land in
  the habitat's and the station's console cells; the A* grid lies inside the console grid
- map layers (layers/index.json): same grid_id, bounds = grid bounds, picture and value grid sized for it
- elevation: elev_10m.f32 is what GeoMapper places from the elevation maps (time_grid.map_elevation,
  run again here and compared cell by cell)
- orthophoto: made by GeoMapper on the console grid (pipeline/ortho_overlay.py); it must cover the grid
Run (repo root):  .venv/Scripts/python pipeline/check_alignment.py     exit code 1 when a check fails
"""
from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from mapping_grid import MappingGrid  # noqa: E402
import time_grid as tg  # noqa: E402

DATA = ROOT / "frontend" / "public" / "data"
ROUTES = ROOT / "backend" / "routes" / "science_routes"
results: list[tuple[bool, str]] = []


def check(ok: bool, text: str) -> None:
    results.append((bool(ok), text))


def load(name: str):
    for p in (DATA / name, DATA / "placeholder" / name):
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8")), p.parent.name == "placeholder"
    return None, None


def main() -> int:
    grid = MappingGrid.load(DATA / "grid.json")   # raises when the header or the binaries do not fit
    check(True, f"grid {grid.grid_id}: {grid.columns} x {grid.rows} cells of {grid.cell_size_m:g} m, GeoMapper validation passed")
    gj = json.loads((DATA / "grid.json").read_text(encoding="utf-8"))
    ttb = np.fromfile(DATA / gj["files"]["ttb_penalized"], dtype="<f4")
    cell = lambda lon, lat: grid.xy(lon, lat)
    idx = lambda xy: None if xy is None else xy[1] * grid.columns + xy[0]

    sc, _ = load("scenario.json")
    hab = sc["habitat"]
    h_xy = cell(*hab)
    check(h_xy is not None and idx(h_xy) == gj.get("habitat_cell"),
          f"habitat {hab[0]:.6f}, {hab[1]:.6f} -> cell {h_xy}; time grid habitat_cell {gj.get('habitat_cell')}")

    zones_fc, zones_ph = load("zones.geojson")
    rings = {f["properties"]["id"]: f["geometry"]["coordinates"][0] for f in zones_fc["features"]}
    in_zone = lambda lon, lat: [zid for zid, r in rings.items() if tg.in_ring(lon, lat, r)]
    for zid, r in rings.items():
        check(all(cell(*q) is not None for q in r), f"zone {zid}{' (placeholder)' if zones_ph else ''}: all {len(r)} edge points on the grid")
    check(not in_zone(*hab), f"habitat outside every zone{'' if not in_zone(*hab) else ': inside ' + ', '.join(in_zone(*hab))}")

    st_fc, _ = load("stations.geojson")
    stations = {f["properties"]["n"]: f for f in st_fc["features"]}
    for n, f in stations.items():
        lon, lat = f["geometry"]["coordinates"]
        xy = cell(lon, lat)
        z = in_zone(lon, lat)
        check(xy is not None and math.isfinite(float(ttb[idx(xy)])) and not z,
              f"station {n} {f['properties']['name']}: cell {xy}, {float(ttb[idx(xy)]) if xy else float('nan'):.1f} min to base"
              + (f", INSIDE {', '.join(z)}" if z else ", outside every zone"))

    routes, _ = load("routes.json")
    for r in routes["stations"]:
        n = r["station"]
        for leg in ("out", "ret"):
            v = r[leg]["vertices"]
            cells = [cell(q["lon"], q["lat"]) for q in v]
            first, last = (cells[0], cells[-1]) if leg == "out" else (cells[-1], cells[0])
            s_xy = cell(*stations[n]["geometry"]["coordinates"])
            check(all(c is not None for c in cells) and first == h_xy and last == s_xy and r[leg]["zone_m"] == 0,
                  f"route {n} {leg}: {len(v)} vertices on the grid, habitat cell {first == h_xy}, station cell {last == s_xy}, in zones {r[leg]['zone_m']} m")

    if (ROUTES / "grid.json").exists():
        spec = importlib.util.spec_from_file_location("gm_local_grid", ROOT / "backend/geoMapper/mars_mapping/local_grid.py")
        mod = importlib.util.module_from_spec(spec); sys.modules[spec.name] = mod; spec.loader.exec_module(mod)
        g = json.loads((ROUTES / "grid.json").read_text(encoding="utf-8"))
        lg = mod.LocalMetricGrid(reference_latitude=g["reference_latitude"], reference_longitude=g["reference_longitude"],
                                 cell_size_m=g["cell_size_m"], columns=g["columns"], rows=g["rows"],
                                 reference_position=g.get("reference_position", "center"), mars_radius_m=g["mars_radius_m"])
        lon180 = lambda v: v - 360 if v > 180 else v
        corners = [lg.lonlat_center(x, y) for x, y in ((0, 0), (lg.columns - 1, 0), (0, lg.rows - 1), (lg.columns - 1, lg.rows - 1))]
        check(all(cell(lon180(lo), la) is not None for lo, la in corners), f"A* grid ({lg.columns} x {lg.rows} m cells) lies inside the console grid")
        summ = json.loads((ROUTES / "routes_summary.json").read_text(encoding="utf-8"))
        by_id = {f["properties"].get("astar_id"): n for n, f in stations.items()}
        for r in summ["routes"]:
            s = r["summary"]
            if s.get("status") != "found":
                continue
            st_xy = cell(*[lon180(c) if k == 0 else c for k, c in enumerate(lg.lonlat_center(*s["start_xy"]))])
            gl = lg.lonlat_center(*s["goal_xy"])
            go_xy = cell(lon180(gl[0]), gl[1])
            n = by_id.get(r["id"])
            want = cell(*stations[n]["geometry"]["coordinates"]) if n else None
            check(st_xy == h_xy and go_xy == want, f"A* {r['id']}: start xy {s['start_xy']} -> console cell {st_xy} (habitat {h_xy}), "
                  f"goal xy {s['goal_xy']} -> {go_xy} (station {n}: {want})")

    index = DATA / "layers" / "index.json"
    if index.exists():
        ix = json.loads(index.read_text(encoding="utf-8"))
        check(ix["grid_id"] == grid.grid_id, f"layers/index.json on grid {ix['grid_id']}")
        for path in ix["layers"]:
            m = json.loads((DATA.parent / path).read_text(encoding="utf-8"))
            ppc = m.get("pixels_per_cell", 1)
            w = m.get("window")
            if w:  # a detail picture: its bounds must be the edges of its window of console cells
                cs = grid.cell_size_m
                want = [[(grid.y0 - (w["row0"] + w["rows"]) * cs) / tg.M_PER_DEG, (grid.x0 + w["col0"] * cs) / tg.M_PER_DEG],
                        [(grid.y0 - w["row0"] * cs) / tg.M_PER_DEG, (grid.x0 + (w["col0"] + w["cols"]) * cs) / tg.M_PER_DEG]]
                cells_x, cells_y = w["cols"], w["rows"]
            else:
                want, cells_x, cells_y = grid.bounds, grid.columns, grid.rows
            b_ok = all(abs(a - b) < 1e-9 for pa, pb in zip(m["bounds"], want) for a, b in zip(pa, pb))
            num = m.get("numeric_file")
            n_ok = True if not num else (DATA / num).stat().st_size == grid.columns * grid.rows * 4
            check(m["grid_id"] == grid.grid_id and b_ok and m["width_px"] == cells_x * ppc and m["height_px"] == cells_y * ppc and n_ok,
                  f"layer {m['layer']['id']}: grid_id, bounds{' (window ' + str(w['cols']) + ' x ' + str(w['rows']) + ' cells)' if w else ''}, "
                  f"{m['width_px']} x {m['height_px']} px and value grid fit the console grid")
    else:
        check(False, "layers/index.json missing; run pipeline/map_layers.py")

    ortho = DATA.parent / "maps" / "ortho_gale_1m.json"
    if ortho.exists():
        o = json.loads(ortho.read_text(encoding="utf-8"))
        (os_, ow), (on, oe) = o["bounds"]
        (gs, gw), (gn, ge) = grid.bounds
        tol = grid.cell_size_m / tg.M_PER_DEG
        check(ow <= gw + tol and oe >= ge - tol and os_ <= gs + tol and on >= gn - tol,
              f"orthophoto covers the grid (own bounds; offset west {(gw - ow) * tg.M_PER_DEG:+.1f} m, north {(on - gn) * tg.M_PER_DEG:+.1f} m)")
        check(o.get("grid_id") == grid.grid_id and "GeoMapper" in o.get("sampling", ""),
              f"orthophoto made by GeoMapper on grid {o.get('grid_id')} ({o.get('width_px')} x {o.get('height_px')} px, {o.get('pixel_size_m')} m)")
    else:
        check(False, "orthophoto missing; run pipeline/ortho_overlay.py")

    # the elevation grid is GeoMapper's: place the elevation maps again and compare
    if all(s["path"].exists() for s in tg.ELEVATION_SOURCES):
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()):
            zg, info = tg.map_elevation(grid.x0, grid.y0, grid.columns, grid.rows)
        ze = np.fromfile(DATA / gj["files"]["elev"], dtype="<f4").reshape(grid.rows, grid.columns)
        same = np.allclose(ze, zg.astype(np.float32), equal_nan=True)
        check(same and "GeoMapper" in json.dumps(gj.get("source", {})),
              f"elevation grid = GeoMapper placement of {', '.join(f'{u['label']} ({u['cells']} cells)' for u in info['sources'])}")
    else:
        check(False, "elevation sources missing; run pipeline/fetch_sources.py")

    for ok, text in results:
        print(("PASS  " if ok else "FAIL  ") + text)
    bad = sum(not ok for ok, _ in results)
    print(f"{len(results) - bad} of {len(results)} checks pass")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
