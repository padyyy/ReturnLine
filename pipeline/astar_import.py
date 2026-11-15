"""Bring the A* routes (backend/, GeoMapper grid) into the console's data files.

The A* routing (backend/science_routes.py) plans from one base to four Curiosity science sites on
GeoMapper's local metric grid (backend/routes/science_routes/grid.json: 1 m cells, x = column,
y = row, origin top left). This script makes that the console's plan:

1. Base and targets from the A* run become the habitat (scenario.json) and the stations
   (stations.geojson) in frontend/public/data/. All other constants are copied from the scenario
   file in use (frontend/public/data/, else the placeholder).
2. The time-to-base grid is recomputed for the new habitat with pipeline/time_grid.py --reuse-grid
   (same 10 m cells and elevation, Tobler walking model, zones penalized and allowed).
3. routes.json is written from the A* paths: every cell converted to lon/lat with GeoMapper's own
   LocalMetricGrid, thinned to about every 5 m, elevation and slope from the 10 m grid, walking time
   with the same Tobler function as time_grid.py, timed in walking direction (out: base -> target,
   ret: the same path reversed). A* costs are demo units; the times here come from the walking model.

0. With --place-zones the placeholder drill sites are moved, because there are no real ones yet:
   each zone goes where it keeps every target, the habitat and every A* path out of its buffer
   (Curiosity waypoints first, else a 5 m lattice around the habitat); the drift zone sits beside the
   scenario station's way home, close enough for the rehearsal's drift. Written to the placeholder folder.

4. Added targets (data/points/points.json, written by hand or by the console's "Add data" panel in
   `npm run dev`): GeoMapper's MappingGrid places each point on a cell of the console grid
   (frontend/public/data/grid.json); Paul's A* (backend/astar.py) routes habitat -> point on that grid
   (8 neighbours, cost = seconds per metre from the Tobler speed at the cell's slope, slope over 20 deg
   or no elevation blocked, zones x20 and the clearance ring x3 as in time_grid.py); the path is timed
   in walking direction with the same Tobler model. Points become stations after the A* targets.

Inputs:  backend/routes/science_routes/{grid.json, routes_summary.json, <id>/path_xy.json}, data/points/points.json
Outputs: frontend/public/data/{scenario.json, stations.geojson, routes.json} plus time_grid.py's grids
Run (repo root):  py pipeline/astar_import.py [--scenario-station N] [--drift-zone ID] [--place-zones]
Needs numpy only (GeoMapper's local_grid.py is loaded on its own, without the rasterio parts).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
ROUTES = ROOT / "backend" / "routes" / "science_routes"
# Michael's two A* variants per target (backend/protected_routes.py): the best route that avoids the
# protected zones (boxwork protection mask) and the fastest one that may cross them
VARIANTS = ROOT / "backend" / "routes" / "protected_comparison"
VARIANT_DIRS = {"safe": "avoid_protected", "fastest": "allow_protected"}
POINTS = ROOT / "data" / "points" / "points.json"
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT))
import time_grid as tg  # noqa: E402  same walking model and grid search as the console's time grid
from mapping_grid import MappingGrid  # noqa: E402  the console grid as a GeoMapper grid


def load_points() -> list[dict]:
    """Added targets: [{id, name, lon, lat, reason?}], ids unique and file-safe."""
    if not POINTS.exists():
        return []
    pts = json.loads(POINTS.read_text(encoding="utf-8")).get("points", [])
    seen = set()
    for q in pts:
        if not isinstance(q.get("id"), str) or q["id"] in seen or not all(math.isfinite(float(q[k])) for k in ("lon", "lat")):
            raise SystemExit(f"data/points/points.json: bad or duplicate point {q!r}")
        seen.add(q["id"])
    return pts


def astar_on_console_grid(grid: MappingGrid, start: tuple, goal: tuple, slope_block: float, speed_mpm: float,
                          pen_mult: np.ndarray):
    """Paul's A* (backend/astar.py) on the console grid; returns lon/lat points or a reason string."""
    from backend.astar import astar
    z, sl = grid.read_float("elev"), grid.read_float("slope")
    g = np.tan(np.radians(np.nan_to_num(sl, nan=90.0)))
    sec_per_m = 60.0 / (speed_mpm * np.exp(-3.5 * g))     # Tobler uphill speed at the cell's slope: never optimistic
    ok = np.isfinite(z) & (sl <= slope_block)
    cost = np.where(ok, sec_per_m * pen_mult, np.nan)
    costs = [[None if not math.isfinite(v) else float(v) for v in row] for row in cost.tolist()]
    sxy, gxy = grid.xy(*start), grid.xy(*goal)
    if gxy is None:
        return "outside the grid"
    if not ok[gxy[1], gxy[0]]:
        return "on blocked ground (slope over the limit or no elevation)"
    res = astar(costs, (sxy[1], sxy[0]), (gxy[1], gxy[0]), cell_size_m=grid.cell_size_m, allow_diagonal=True)
    if res is None:
        return "not reachable from the habitat"
    pts = [grid.lonlat_center(c, r) for r, c in res.path]
    pts[0], pts[-1] = tuple(start), tuple(goal)                    # exactly the habitat and the point
    return pts


def local_grid_class():
    """GeoMapper's LocalMetricGrid, loaded from its file (the package __init__ needs rasterio)."""
    path = ROOT / "backend" / "geoMapper" / "mars_mapping" / "local_grid.py"
    spec = importlib.util.spec_from_file_location("gm_local_grid", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod  # dataclasses look the module up while the class is built
    spec.loader.exec_module(mod)
    return mod.LocalMetricGrid


def place_zones(base: dict, routes: list, paths: dict, scen_id: str, drift_id: str) -> None:
    """Move the placeholder drill sites onto Curiosity waypoints that keep the plan clear (see step 0)."""
    import re
    zpath = DATA / "placeholder" / "zones.geojson"
    zfc = json.loads(zpath.read_text(encoding="utf-8"))
    buf = max(f["properties"].get("buffer_m", 80) for f in zfc["features"])
    js = (ROOT / "frontend" / "src" / "boxwork-path.js").read_text(encoding="utf-8")
    wps = [(float(lo), float(la), int(sol)) for la, lo, sol in re.findall(r"\[(-?[\d.]+), (-?[\d.]+), (\d+)\]", js)]
    cos_lat = math.cos(math.radians(base["lat"]))
    d = lambda p, q: math.hypot((q[0] - p[0]) * tg.M_PER_DEG * cos_lat, (q[1] - p[1]) * tg.M_PER_DEG)
    def to_path(c, pts):  # distance from c to a polyline
        best = math.inf
        for p0, p1 in zip(pts, pts[1:]):
            ax, ay = (p0[0] - c[0]) * tg.M_PER_DEG * cos_lat, (p0[1] - c[1]) * tg.M_PER_DEG
            bx, by = (p1[0] - c[0]) * tg.M_PER_DEG * cos_lat, (p1[1] - c[1]) * tg.M_PER_DEG
            l2 = (bx - ax) ** 2 + (by - ay) ** 2 or 1.0
            u = max(0.0, min(1.0, -(ax * (bx - ax) + ay * (by - ay)) / l2))
            best = min(best, math.hypot(ax + (bx - ax) * u, ay + (by - ay) * u))
        return best
    targets = [tuple(r["summary"]["goal_lonlat"]) for r in routes]
    hab = (base["lon"], base["lat"])
    def clear(c):  # edge distances: targets 40 m, habitat 60 m, every path 15 m
        return (all(d(c, t) - buf >= 40 for t in targets) and d(c, hab) - buf >= 60
                and all(to_path(c, pts) - buf >= 15 for pts in paths.values()))
    # candidates: a 5 m lattice within 700 m of the habitat (the Curiosity waypoints lie on the same track
    # as the targets, so too few of them keep the plan clear); waypoint_sol is kept when a centre is one
    step_lon, step_lat = 5.0 / (tg.M_PER_DEG * cos_lat), 5.0 / tg.M_PER_DEG
    lattice = [(hab[0] + i * step_lon, hab[1] + j * step_lat, None) for i in range(-140, 141) for j in range(-140, 141)
               if math.hypot(i, j) * 5.0 <= 700]
    cands = [c for c in wps + lattice if clear((c[0], c[1]))]
    if not cands:
        raise SystemExit("no position keeps targets and paths clear; widen the search")
    # the drift zone: beside the scenario station's way home, edge 15..45 m from it (closest first)
    scen = paths[scen_id]
    near = sorted((to_path((c[0], c[1]), scen) - buf, c) for c in cands)
    drift = next((c for e, c in near if 15 <= e <= 45), near[0][1])
    # the other zone: clear of the drift zone, close to another route (so the map shows why zones matter)
    others = [pts for rid, pts in paths.items() if rid != scen_id] or list(paths.values())
    rest = [c for c in cands if d((c[0], c[1]), (drift[0], drift[1])) >= 2 * buf + 40]
    second = min(rest, key=lambda c: min(to_path((c[0], c[1]), pts) for pts in others)) if rest else None
    chosen = {drift_id: drift}
    other_id = "A" if drift_id != "A" else "B"
    if second:
        chosen[other_id] = second
    def ring(c):
        return [[round(c[0] + buf * math.sin(2 * math.pi * k / 48) / (tg.M_PER_DEG * cos_lat), 7),
                 round(c[1] + buf * math.cos(2 * math.pi * k / 48) / tg.M_PER_DEG, 7)] for k in range(49)]
    feats = [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring(c)]},
              "properties": {"id": zid, "name": f"Drill site {zid}", "drill_sol": None, "buffer_m": buf,
                             **({"waypoint_sol": c[2]} if c[2] else {"position": "invented placeholder"})}}
             for zid, c in sorted(chosen.items())]
    write_json(zpath, {"type": "FeatureCollection",
                       "note": "PLACEHOLDER drill sites: no real drill-site data yet. Positions chosen by pipeline/astar_import.py "
                               "--place-zones so that no target, the habitat and no A* path lies in a buffer; the drift zone "
                               "sits beside the scenario station's way home",
                       "generator": "pipeline/astar_import.py", "features": feats})
    for zid, c in sorted(chosen.items()):
        print(f"zone {zid}: {'waypoint sol ' + str(c[2]) if c[2] else 'invented'} at {c[0]:.6f}, {c[1]:.6f}; edge to the nearest target "
              f"{min(d((c[0], c[1]), t) for t in targets) - buf:.0f} m, to the scenario way home {to_path((c[0], c[1]), scen) - buf:.0f} m")


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--scenario-station", type=int, help="station n the six-step rehearsal plays for")
    p.add_argument("--drift-zone", help="zone id the crew drifts toward in step 4")
    p.add_argument("--place-zones", action="store_true", help="move the placeholder drill sites clear of targets and paths")
    a = p.parse_args(argv)

    summary = json.loads((ROUTES / "routes_summary.json").read_text(encoding="utf-8"))
    gdef = json.loads((ROUTES / summary.get("grid_file", "grid.json")).read_text(encoding="utf-8"))
    LocalMetricGrid = local_grid_class()
    grid = LocalMetricGrid(reference_latitude=gdef["reference_latitude"], reference_longitude=gdef["reference_longitude"],
                           cell_size_m=gdef["cell_size_m"], columns=gdef["columns"], rows=gdef["rows"],
                           reference_position=gdef.get("reference_position", "center"), mars_radius_m=gdef["mars_radius_m"])
    lon360 = lambda v: v - 360.0 if v > 180.0 else v  # GeoMapper returns 0..360; the console uses east-positive -180..180
    base = summary["base"]
    routes = [r for r in summary["routes"] if r["summary"].get("status") == "found"]
    skipped = [r["id"] for r in summary["routes"] if r["summary"].get("status") != "found"]

    def to_lonlat(xy, r):
        pts = [(lon360(lo), la) for lo, la in (grid.lonlat_center(int(x), int(y)) for x, y in xy)]
        pts[0] = (base["lon"], base["lat"])                               # exactly the base and the target
        pts[-1] = tuple(r["summary"]["goal_lonlat"])
        return pts

    paths, variants = {}, {}
    for r in routes:
        paths[r["id"]] = to_lonlat(json.loads((ROUTES / r["id"] / "path_xy.json").read_text(encoding="utf-8")), r)
        vdir = VARIANTS / r["id"]
        if not all((vdir / d / "path_xy.json").exists() for d in VARIANT_DIRS.values()):
            continue
        vg = json.loads((vdir / "grid.json").read_text(encoding="utf-8"))
        if any(abs(vg[k] - gdef[k]) > 1e-9 for k in ("reference_latitude", "reference_longitude", "cell_size_m")) or \
                (vg["columns"], vg["rows"]) != (gdef["columns"], gdef["rows"]):
            print(f"{r['id']}: protected_comparison uses another grid; variants skipped", file=sys.stderr)
            continue
        variants[r["id"]] = {}
        for key, d in VARIANT_DIRS.items():
            s = json.loads((vdir / d / "summary.json").read_text(encoding="utf-8"))
            if s.get("status") != "found":
                continue
            variants[r["id"]][key] = {"pts": to_lonlat(json.loads((vdir / d / "path_xy.json").read_text(encoding="utf-8")), r),
                                      "protected_m": s.get("protected_distance_m"), "a_star_m": s.get("length_m"),
                                      "xy": json.loads((vdir / d / "path_xy.json").read_text(encoding="utf-8"))}
        if "safe" in variants[r["id"]]:
            paths[r["id"]] = variants[r["id"]]["safe"]["pts"]               # the plan's route: zones avoided

    # 0. placeholder drill sites clear of the plan
    if a.place_zones:
        scen_n = a.scenario_station or 1
        scen_id = next((r["id"] for k, r in enumerate(routes) if k + 1 == scen_n), routes[0]["id"])
        place_zones(base, routes, paths, scen_id, a.drift_zone or "B")

    # 1. habitat and stations
    sc, sc_ph = tg.load("scenario.json")
    sc = dict(sc)
    sc["habitat"] = [base["lon"], base["lat"]]
    sc["note"] = "Habitat from the A* routing base (backend/routes/science_routes); other values as before"
    sc["generator"] = "pipeline/astar_import.py"
    sc["placeholder_fields"] = [f for f in sc.get("placeholder_fields", []) if f != "habitat"]
    sc.setdefault("sources", {})["habitat"] = "A* routing base (backend/config/base.json), team choice"
    n_of = {r["id"]: k + 1 for k, r in enumerate(routes)}
    if a.scenario_station:
        sc["scenario_station"] = a.scenario_station
    elif sc.get("scenario_station") not in n_of.values():
        sc["scenario_station"] = 1
    if a.drift_zone:
        sc["drift_zone"] = a.drift_zone
    zone_ids = {f["properties"].get("id") for f in tg.load("zones.geojson")[0]["features"]}
    if sc.get("drift_zone") not in zone_ids:   # no such protected zone (none at all yet): no scripted drift
        sc.pop("drift_zone", None)
        sc["placeholder_fields"] = [f for f in sc.get("placeholder_fields", []) if f != "drift_zone"]
    write_json(DATA / "scenario.json", sc)
    stations = {"type": "FeatureCollection", "note": "Science sites of the A* routing (backend/config/science_targets.json)",
                "generator": "pipeline/astar_import.py", "features": []}
    for r in routes:
        g = r["summary"]["goal_lonlat"]
        stations["features"].append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [g[0], g[1]]},
                                     "properties": {"n": n_of[r["id"]], "name": r["name"], "sol": r.get("sol"),
                                                    "reason": f"Curiosity site, sol {r.get('sol')} · A* target {r['id']}",
                                                    "image": None, "elev_m": None, "astar_id": r["id"]}})
    points = load_points()
    for k, q in enumerate(points):
        stations["features"].append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [float(q["lon"]), float(q["lat"])]},
                                     "properties": {"n": len(routes) + k + 1, "name": q.get("name") or q["id"],
                                                    "reason": q.get("reason") or "Added target (data/points/points.json)",
                                                    "sol": q.get("sol"), "image": None, "elev_m": None, "point_id": q["id"]}})
    if points:
        stations["note"] += " and added targets (data/points/points.json)"
    write_json(DATA / "stations.geojson", stations)

    # 2. time-to-base grid for the new habitat (same cells and elevation)
    rc = tg.main(["--reuse-grid", "--out", str(DATA)])
    if rc:
        return rc

    # 3. routes.json from the A* paths
    gj = json.loads((DATA / "grid.json").read_text(encoding="utf-8"))
    nx, ny, cell, x0, y0 = gj["nx"], gj["ny"], gj["cell_m"], gj["origin_m"]["x"], gj["origin_m"]["y"]
    z = np.fromfile(DATA / gj["files"]["elev"], dtype="<f4").reshape(ny, nx).astype(np.float64)
    slope = np.fromfile(DATA / gj["files"]["slope"], dtype="<f4").reshape(ny, nx)
    ttb = np.fromfile(DATA / gj["files"]["ttb_penalized"], dtype="<f4")
    cos_lat = math.cos(math.radians((y0 - ny * cell / 2) / tg.M_PER_DEG))
    speed = sc.get("walk_speed_kmh", 1.5) * 1000 / 60
    zones_fc, _ = tg.load("zones.geojson")
    rings = [f["geometry"]["coordinates"][0] for f in zones_fc["features"]]

    def rc_of(lon, lat):
        return (y0 - lat * tg.M_PER_DEG) / cell - 0.5, (lon * tg.M_PER_DEG - x0) / cell - 0.5

    def elev(lon, lat):  # bilinear on the 10 m cell centres
        r, c = rc_of(lon, lat)
        r0, c0 = int(math.floor(r)), int(math.floor(c))
        if not (0 <= r0 < ny - 1 and 0 <= c0 < nx - 1):
            return math.nan
        fr, fc = r - r0, c - c0
        q = z[r0:r0 + 2, c0:c0 + 2]
        return float(q[0, 0] * (1 - fr) * (1 - fc) + q[0, 1] * (1 - fr) * fc + q[1, 0] * fr * (1 - fc) + q[1, 1] * fr * fc)

    def cell_i(lon, lat):
        r, c = rc_of(lon, lat)
        r, c = int(round(r)), int(round(c))
        return r * nx + c if 0 <= r < ny and 0 <= c < nx else -1

    def dist_m(p, q):
        return math.hypot((q[0] - p[0]) * tg.M_PER_DEG * cos_lat, (q[1] - p[1]) * tg.M_PER_DEG)

    def track(pts):
        verts, d, t, zone_m = [], 0.0, 0.0, 0.0
        zs = [elev(*q) for q in pts]
        for k, q in enumerate(pts):
            if k:
                seg = dist_m(pts[k - 1], q)
                dz = zs[k] - zs[k - 1] if math.isfinite(zs[k]) and math.isfinite(zs[k - 1]) else 0.0
                t += seg / (speed * tg.tobler_factor(dz, seg)) if seg > 0 else 0.0
                d += seg
                mid = ((pts[k - 1][0] + q[0]) / 2, (pts[k - 1][1] + q[1]) / 2)
                if any(tg.in_ring(mid[0], mid[1], ring) for ring in rings):
                    zone_m += seg
            ci = cell_i(*q)
            verts.append({"lon": round(q[0], 7), "lat": round(q[1], 7), "d_m": round(d, 1), "t_min": round(t, 2),
                          "elev_m": None if not math.isfinite(zs[k]) else round(zs[k], 1),
                          "slope_deg": None if ci < 0 else round(float(slope.ravel()[ci]), 1)})
        tt = [float(ttb[cell_i(*q)]) for q in pts if cell_i(*q) >= 0]
        return {"vertices": verts, "length_m": round(d, 1), "minutes": round(t, 2), "zone_m": round(zone_m, 1),
                "max_slope_deg": round(max((v["slope_deg"] or 0) for v in verts), 1),
                "max_ttb_min": round(max((x for x in tt if math.isfinite(x)), default=math.nan), 1)}

    out_routes, report = [], []
    # added targets: GeoMapper cell, A* on the console grid, Tobler times (step 4)
    mgrid = MappingGrid.load(DATA / "grid.json")
    if points:
        lon_c, lat_c = mgrid.lonlat_mesh()
        pen = np.ones((ny, nx))
        for f in zones_fc["features"]:
            ring = f["geometry"]["coordinates"][0]
            cx = sum(q[0] for q in ring[:-1]) / (len(ring) - 1)
            cy = sum(q[1] for q in ring[:-1]) / (len(ring) - 1)
            r_m = f["properties"].get("buffer_m", sc.get("zone_buffer_m", 80))
            dist = np.hypot((lon_c - cx) * tg.M_PER_DEG * cos_lat, (lat_c - cy) * tg.M_PER_DEG)
            pen = np.where(dist <= r_m, np.maximum(pen, tg.ZONE_PENALTY),
                           np.where(dist - r_m <= sc.get("zone_clearance_m", 30), np.maximum(pen, tg.CLEARANCE_PENALTY), pen))
    for k, q in enumerate(points):
        n = len(routes) + k + 1
        goal = (float(q["lon"]), float(q["lat"]))
        cxy = mgrid.xy(*goal)
        pts = astar_on_console_grid(mgrid, tuple(sc["habitat"]), goal, sc.get("slope_block_deg", 20), speed, pen)
        if isinstance(pts, str):
            report.append(f"station {n} {q.get('name', q['id'])} (added): NO ROUTE, {pts} (GeoMapper cell {cxy})")
            continue
        out_t, ret_t = track(pts), track(pts[::-1])
        out_routes.append({"station": n, "point_id": q["id"], "router": "backend/astar.py on the console grid", "out": out_t, "ret": ret_t})
        report.append(f"station {n} {q.get('name', q['id'])} (added): GeoMapper cell {cxy}, {out_t['length_m']:.0f} m, "
                      f"out {out_t['minutes']:.1f} min, back {ret_t['minutes']:.1f} min, in zones {out_t['zone_m']:.0f} m")
    def thin(pts):
        keep, acc = [pts[0]], 0.0                                          # about every 5 m, ends kept
        for k in range(1, len(pts) - 1):
            acc += dist_m(pts[k - 1], pts[k])
            if acc >= 5.0:
                keep.append(pts[k]); acc = 0.0
        keep.append(pts[-1])
        return keep

    def legs(pts, protected_m):
        keep = thin(pts)
        o, b = track(keep), track(keep[::-1])
        for leg in (o, b):
            leg["protected_m"] = None if protected_m is None else round(float(protected_m), 1)
        return o, b

    for r in routes:
        v = variants.get(r["id"], {})
        out_t, ret_t = legs(paths[r["id"]], v.get("safe", {}).get("protected_m"))
        entry = {"station": n_of[r["id"]], "astar_id": r["id"], "variant": "safe" if v else "single", "out": out_t, "ret": ret_t}
        if "fastest" in v:
            fo, fr = legs(v["fastest"]["pts"], v["fastest"]["protected_m"])
            entry["fastest"] = {"out": fo, "ret": fr, "same_as_safe": v["fastest"]["xy"] == v.get("safe", {}).get("xy")}
        out_routes.append(entry)
        report.append(f"station {n_of[r['id']]} {r['name']}: {out_t['length_m']:.0f} m (A* {r['summary']['length_m']:.0f} m), "
                      f"out {out_t['minutes']:.1f} min, back {ret_t['minutes']:.1f} min, max slope {out_t['max_slope_deg']} deg, "
                      f"max time to base {out_t['max_ttb_min']} min, protected {out_t['protected_m']} m")
        if "fastest" in entry:
            f = entry["fastest"]
            report.append(f"   fastest{' (same path)' if f['same_as_safe'] else ''}: {f['out']['length_m']:.0f} m, out {f['out']['minutes']:.1f} min, "
                          f"back {f['ret']['minutes']:.1f} min, max slope {f['out']['max_slope_deg']} deg, protected {f['out']['protected_m']} m")
    write_json(DATA / "routes.json", {
        "note": "Routes of the A* routing on GeoMapper's local metric grid, converted to lon/lat with LocalMetricGrid; walking "
                "times from the Tobler model on the 10 m grid (A* costs are demo units). out/ret: the route that avoids the "
                "protected zones (backend/protected_routes.py, avoid_protected); fastest: the one that may cross them "
                "(allow_protected). protected_m: metres inside the boxwork protection mask, from the A* summary.",
        "generator": "pipeline/astar_import.py", "source": "backend/routes/protected_comparison (else backend/routes/science_routes)",
        "date": date.today().isoformat(),
        "stations": sorted(out_routes, key=lambda x: x["station"])})
    print("\n".join(report))
    if skipped:
        print("not imported (no path found):", ", ".join(skipped))
    print(f"wrote scenario.json, stations.geojson and routes.json to {DATA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
