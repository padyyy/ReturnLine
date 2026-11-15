"""Time-to-base grid from the real Gale DEM: the planned Python fallback for the routing engine.

Writes the grid files of shared/data-contract.md ("Grid spec checklist") into frontend/public/data/:
grid.json, ttb_penalized.f32, ttb_allowed.f32, ptr_penalized.i32, ptr_allowed.i32, elev_10m.f32,
slope_10m.f32, and routes.json (habitat <-> each station, along the zones-penalized pointers).

How it works
- Elevation: the USGS Gale DEM (1 m, read over HTTP range requests from its 4 m overview level),
  averaged onto 10 m cells that sit on the DEM's 1 m pixel grid. Slope in degrees from that grid
  (central differences). The 1 m ridge mask cannot be built from the 4 m level; that is a known gap.
- Blocked: no data, or slope above the suit limit (scenario.json slope_block_deg, 20 degrees).
- Walking time: Tobler's hiking function (Tobler 1993, NCGIA Technical Report 93-1), normalised so
  that level ground gives the base speed (scenario.json walk_speed_kmh, 1.5 km/h):
  speed = base * exp(-3.5 * (|g + 0.05| - 0.05)), g = dz / horizontal distance in walking direction.
  Uphill and downhill differ (fastest at -5 %). Same formula and reference values as
  shared/walking-model-vectors.json and frontend/src/route-duration.js (team decision 2026-11-14).
  Applying a terrestrial walking function to suited crews on Mars is an assumption, not validated.
  The search runs from the habitat over reversed edges: the time home from cell j is the time of
  walking j -> i plus the time home from i, so the stored values are times *towards* the habitat.
- Search: Dijkstra from the habitat over 16 neighbours, no corner cutting past blocked cells. Two
  variants: "penalized" (zone cells cost x20 and a clearance ring of zone_clearance_m costs x3, so
  routes keep away from zones while they can) and "allowed" (zones are ordinary ground, for ABORT).
  The stored time is always the real walking time along the chosen way, never the penalized cost.
- Inputs: habitat, stations, zones and constants from frontend/public/data/, else from
  frontend/public/data/placeholder/ (the marked placeholders), the same rule the console uses.

Run (repo root, Windows Git Bash):  .venv/Scripts/python pipeline/time_grid.py
"""
from __future__ import annotations

import argparse
import heapq
import json
import math
import sys
import time
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
DEM_URL = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/"
           "MSL_Gale_DEM_Mosaic_1m_v3.tif")
M_PER_DEG = 3396190.0 * math.pi / 180.0          # 59274.70 m; eqc: x = lon * M_PER_DEG, y = lat * M_PER_DEG
CELL = 10.0                                       # m, projected
DEFAULT_EXTENT = dict(west=137.34, east=137.42, north=-4.77, south=-4.85)  # docs/mission-scenario.md
ZONE_PENALTY = 20.0
CLEARANCE_PENALTY = 3.0
GDAL_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="YES", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.ovr",
                GDAL_HTTP_MULTIRANGE="YES", GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
                CPL_VSIL_CURL_USE_HEAD="NO", VSI_CACHE="TRUE", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2")
# 16 neighbours (dr, dc) and the cells a move passes, which must not be blocked (no corner cutting)
MOVES = []
for dr, dc in [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1),
               (1, 2), (2, 1), (-1, 2), (-2, 1), (1, -2), (2, -1), (-1, -2), (-2, -1)]:
    sr, sc = (dr > 0) - (dr < 0), (dc > 0) - (dc < 0)
    if abs(dr) == 1 and abs(dc) == 1:
        via = [(sr, 0), (0, sc)]
    elif abs(dc) == 2:
        via = [(0, sc), (sr, sc)]
    elif abs(dr) == 2:
        via = [(sr, 0), (sr, sc)]
    else:
        via = []
    MOVES.append((dr, dc, via))


def load(name: str) -> tuple[dict, bool]:
    """Real file from frontend/public/data/, else the placeholder. Returns (json, is_placeholder)."""
    for path, ph in ((DATA / name, False), (DATA / "placeholder" / name, True)):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8")), ph
    raise FileNotFoundError(name)


def in_ring(lon: float, lat: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def read_elevation(src_url: str, x0: float, y0: float, nx: int, ny: int) -> tuple[np.ndarray, dict]:
    """Mean elevation per 10 m cell from the DEM's 4 m overview level (NaN where no data)."""
    path = "/vsicurl/" + src_url if src_url.startswith("http") else src_url
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(path) as base:
            nodata = base.nodata
            res = abs(base.transform.a)
            bx0, by0 = base.transform.c, base.transform.f
            factors = base.overviews(1)
        level = 0 if factors and factors[0] * res <= CELL else None
        factor = factors[0] if level == 0 else 1
        kw = {} if level is None else {"overview_level": level}
        with rasterio.open(path, **kw) as src:
            pix = res * factor
            win = Window((x0 - bx0) / pix, (by0 - y0) / pix, nx * CELL / pix, ny * CELL / pix)
            arr = src.read(1, window=win, out_shape=(ny, nx), resampling=Resampling.average, masked=True)
    z = np.asarray(arr.filled(np.nan), dtype=np.float64)
    if nodata is not None:
        z[np.isclose(z, nodata)] = np.nan
    return z, {"source": src_url, "level_m": pix, "nodata": nodata}


def tobler_factor(dz: float, d: float) -> float:
    """Speed relative to level ground for a step of horizontal length d (m) and rise dz (m)."""
    g = dz / d
    return math.exp(-3.5 * (abs(g + 0.05) - 0.05))


def search(z, blocked, cost_mult, start, cos_lat, speed_mpm):
    """Dijkstra from the habitat cell. Returns (time to habitat in minutes, pointer to the next cell)."""
    ny, nx = z.shape
    n = nx * ny
    zf = z.ravel().tolist()
    bl = blocked.ravel().tolist()
    cm = cost_mult.ravel().tolist()
    cost = [math.inf] * n
    tim = [math.inf] * n
    ptr = [-1] * n
    steps = []
    for dr, dc, via in MOVES:
        d = math.hypot(dc * CELL * cos_lat, dr * CELL)
        steps.append((dr, dc, via, d))
    cost[start] = 0.0
    tim[start] = 0.0
    heap = [(0.0, start)]
    while heap:
        c, i = heapq.heappop(heap)
        if c > cost[i]:
            continue
        r, col = divmod(i, nx)
        zi = zf[i]
        for dr, dc, via, d in steps:
            rr, cc = r + dr, col + dc
            if rr < 0 or cc < 0 or rr >= ny or cc >= nx:
                continue
            j = rr * nx + cc
            if bl[j]:
                continue
            if via and any(bl[(r + vr) * nx + (col + vc)] for vr, vc in via):
                continue
            # walking from j towards i (home): grade in that direction, Tobler factor
            t = d / (speed_mpm * tobler_factor(zi - zf[j], d))
            nc = c + t * max(cm[i], cm[j])
            if nc < cost[j]:
                cost[j] = nc
                ptr[j] = i
                tim[j] = tim[i] + t
                heapq.heappush(heap, (nc, j))
    return np.array(tim, dtype=np.float32), np.array(ptr, dtype=np.int32)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--source", default=DEM_URL, help="DEM GeoTIFF URL or local path")
    p.add_argument("--out", default=str(DATA), help="output folder (default frontend/public/data)")
    a = p.parse_args(argv)
    t0 = time.time()
    sc, sc_ph = load("scenario.json")
    stations, st_ph = load("stations.geojson")
    zones_fc, zn_ph = load("zones.geojson")
    hab = sc["habitat"]
    speed = sc.get("walk_speed_kmh", 1.5) * 1000 / 60
    slope_block = sc.get("slope_block_deg", 20)
    clearance = sc.get("zone_clearance_m", 30)
    buffer_m = sc.get("zone_buffer_m", 40)

    # 10 m grid on the DEM's 1 m pixel grid, covering the map extent
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open("/vsicurl/" + a.source if a.source.startswith("http") else a.source) as base:
            bx0, by0 = base.transform.c, base.transform.f
    e = DEFAULT_EXTENT
    x0 = bx0 + CELL * math.floor((e["west"] * M_PER_DEG - bx0) / CELL)
    y0 = by0 - CELL * math.floor((by0 - e["north"] * M_PER_DEG) / CELL)
    nx = math.ceil((e["east"] * M_PER_DEG - x0) / CELL)
    ny = math.ceil((y0 - e["south"] * M_PER_DEG) / CELL)
    lat_c = (y0 - ny * CELL / 2) / M_PER_DEG
    cos_lat = math.cos(math.radians(lat_c))
    print(f"grid {nx} x {ny} cells of {CELL:g} m, origin x {x0:.4f} y {y0:.4f}")

    z, src_info = read_elevation(a.source, x0, y0, nx, ny)
    print(f"elevation read from the {src_info['level_m']:g} m level in {time.time() - t0:.1f}s, "
          f"{np.isnan(z).sum()} cells without data, range {np.nanmin(z):.1f} .. {np.nanmax(z):.1f} m")
    gy, gx = np.gradient(z, CELL, CELL * cos_lat)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    blocked = np.isnan(z) | ~(slope <= slope_block)

    # cell centres, zones and the clearance ring
    cols = np.arange(nx)
    rows = np.arange(ny)
    lon_c = (x0 + (cols + 0.5) * CELL) / M_PER_DEG
    lat_r = (y0 - (rows + 0.5) * CELL) / M_PER_DEG
    zone_cell = np.zeros((ny, nx), dtype=bool)
    near = np.zeros((ny, nx), dtype=bool)
    for f in zones_fc["features"]:
        ring = f["geometry"]["coordinates"][0]
        cx = sum(q[0] for q in ring[:-1]) / (len(ring) - 1)
        cy = sum(q[1] for q in ring[:-1]) / (len(ring) - 1)
        r_m = f["properties"].get("buffer_m", buffer_m)
        dx = (lon_c[None, :] - cx) * M_PER_DEG * cos_lat
        dy = (lat_r[:, None] - cy) * M_PER_DEG
        dist = np.hypot(dx, dy)
        box = dist <= r_m + 15
        for r, c in zip(*np.nonzero(box)):
            if in_ring(lon_c[c], lat_r[r], ring):
                zone_cell[r, c] = True
        near |= (dist - r_m <= clearance) & ~zone_cell
    pen_mult = np.where(zone_cell, ZONE_PENALTY, np.where(near, CLEARANCE_PENALTY, 1.0))

    def cell_of(lon: float, lat: float) -> int:
        c = math.floor((lon * M_PER_DEG - x0) / CELL)
        r = math.floor((y0 - lat * M_PER_DEG) / CELL)
        return r * nx + c if 0 <= c < nx and 0 <= r < ny else -1

    hc = cell_of(*hab)
    if hc < 0 or blocked.ravel()[hc]:
        print("The habitat lies outside the grid or on blocked ground; pick another habitat.", file=sys.stderr)
        return 2
    t1 = time.time()
    ttb_pen, ptr_pen = search(z, blocked, pen_mult, hc, cos_lat, speed)
    ttb_all, ptr_all = search(z, blocked, np.ones_like(pen_mult), hc, cos_lat, speed)
    print(f"two searches in {time.time() - t1:.1f}s; reachable cells {np.isfinite(ttb_pen).sum()} of {nx * ny}")

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, arr in (("ttb_penalized.f32", ttb_pen), ("ttb_allowed.f32", ttb_all), ("ptr_penalized.i32", ptr_pen),
                      ("ptr_allowed.i32", ptr_all), ("elev_10m.f32", z.astype(np.float32)),
                      ("slope_10m.f32", slope.astype(np.float32))):
        arr.astype(arr.dtype.newbyteorder("<")).tofile(out / name)
    placeholders = [n for n, ph in (("habitat and constants (scenario.json)", sc_ph), ("stations", st_ph), ("zones", zn_ph)) if ph]
    grid = {
        "note": "Time-to-base grid from the real Gale DEM (4 m level averaged to 10 m), Python fallback for the routing engine"
                + (f"; placeholder inputs: {', '.join(placeholders)}" if placeholders else ""),
        "generator": "pipeline/time_grid.py", "placeholder": False, "placeholder_inputs": placeholders,
        "crs": "+proj=eqc +lat_ts=0 +lon_0=0 +R=3396190 +units=m (Mars 2000 sphere, as the USGS Gale DEM)",
        "cell_m": CELL, "nx": nx, "ny": ny,
        "origin_m": {"x": x0, "y": y0}, "origin_is": "north-west corner of cell (row 0, col 0), projected metres, on the DEM's 1 m pixel grid",
        "order": "row 0 = north, columns west to east, index = row * nx + col",
        "bbox_deg": [round(v, 7) for v in (x0 / M_PER_DEG, (y0 - ny * CELL) / M_PER_DEG, (x0 + nx * CELL) / M_PER_DEG, y0 / M_PER_DEG)],
        "files": {"ttb_penalized": "ttb_penalized.f32", "ttb_allowed": "ttb_allowed.f32", "ptr_penalized": "ptr_penalized.i32",
                  "ptr_allowed": "ptr_allowed.i32", "elev": "elev_10m.f32", "slope": "slope_10m.f32"},
        "dtype": {"ttb": "float32 little-endian, minutes to the habitat, +Infinity where unreachable",
                  "ptr": "int32 little-endian, index of the next cell towards the habitat, -1 at the habitat and where unreachable",
                  "elev": "float32 little-endian, metres, NaN without data", "slope": "float32 little-endian, degrees"},
        "habitat_cell": hc, "walk_speed_kmh": sc.get("walk_speed_kmh", 1.5),
        "slope_penalty": "Tobler 1993, normalised to the base speed on level ground: speed = base * exp(-3.5 * (|g + 0.05| - 0.05)), g = dz/d in walking direction; not validated for suited crews on Mars",
        "blocked": f"no data or slope above {slope_block} degrees; 1 m ridge mask not included (needs the 1 m DEM)",
        "zone_penalty_factor": ZONE_PENALTY, "zone_clearance_m": clearance, "zone_clearance_factor": CLEARANCE_PENALTY,
        "neighbours": 16, "source": src_info, "date": date.today().isoformat(),
    }
    (out / "grid.json").write_text(json.dumps(grid, indent=1) + "\n", encoding="utf-8")

    # routes along the zones-penalized pointers; times are differences of the stored walking times
    def centre(i: int) -> tuple[float, float]:
        r, c = divmod(i, nx)
        return float(lon_c[c]), float(lat_r[r])

    def dist_m(a: tuple, b: tuple) -> float:
        return math.hypot((b[0] - a[0]) * M_PER_DEG * cos_lat, (b[1] - a[1]) * M_PER_DEG)

    zflat, sflat, tflat = z.ravel(), slope.ravel(), ttb_pen
    route_list, report = [], []
    for f in stations["features"]:
        n = f["properties"]["n"]
        s_lonlat = tuple(f["geometry"]["coordinates"])
        sc_i = cell_of(*s_lonlat)
        if sc_i < 0 or not math.isfinite(float(tflat[sc_i])):
            report.append(f"station {n}: NOT REACHABLE (blocked ground or outside the grid)")
            continue
        cells = [sc_i]
        while ptr_pen[cells[-1]] != -1:
            cells.append(int(ptr_pen[cells[-1]]))
        pts = [s_lonlat] + [centre(i) for i in cells[1:-1]] + [tuple(hab)]
        cell_seq = [sc_i] + cells[1:-1] + [hc]

        # walking minutes along a point sequence in its own direction (Tobler is not symmetric,
        # so the way out is timed outbound, not as the reversed way home)
        def walk_times(points, cs):
            ts = [0.0]
            for k in range(1, len(points)):
                seg = dist_m(points[k - 1], points[k])
                dz = float(zflat[cs[k]]) - float(zflat[cs[k - 1]])
                ts.append(ts[-1] + (seg / (speed * tobler_factor(dz, seg)) if seg > 0 else 0.0))
            return ts

        def track(points, ts, cs):
            d, verts, zone_m = 0.0, [], 0.0
            for k, (q, tk, ci) in enumerate(zip(points, ts, cs)):
                if k:
                    seg = dist_m(points[k - 1], q)
                    d += seg
                    mid = ((points[k - 1][0] + q[0]) / 2, (points[k - 1][1] + q[1]) / 2)
                    mc = cell_of(*mid)
                    if mc >= 0 and zone_cell.ravel()[mc]:
                        zone_m += seg
                ev = float(zflat[ci])
                verts.append({"lon": round(q[0], 7), "lat": round(q[1], 7), "d_m": round(d, 1), "t_min": round(tk, 2),
                              "elev_m": None if math.isnan(ev) else round(ev, 1), "slope_deg": round(float(sflat[ci]), 1)})
            return {"vertices": verts, "length_m": round(d, 1), "minutes": round(ts[-1], 2), "zone_m": round(zone_m, 1),
                    "max_slope_deg": round(max(v["slope_deg"] for v in verts), 1),
                    "max_ttb_min": round(max(float(tflat[c]) for c in cs), 1)}

        ret = track(pts, walk_times(pts, cell_seq), cell_seq)
        rpts, rcs = pts[::-1], cell_seq[::-1]
        out_t = track(rpts, walk_times(rpts, rcs), rcs)
        route_list.append({"station": n, "out": out_t, "ret": ret})
        a_all = float(ttb_all[sc_i])
        report.append(f"station {n}: {ret['length_m']:.0f} m, {ret['minutes']:.1f} min (zones allowed {a_all:.1f} min), "
                      f"max slope {ret['max_slope_deg']:.1f} deg, max time to base {ret['max_ttb_min']:.1f} min, zone metres {ret['zone_m']:.0f}")
    (out / "routes.json").write_text(json.dumps({
        "note": "Routes along the zones-penalized pointers of the time-to-base grid (pipeline/time_grid.py)"
                + (f"; placeholder inputs: {', '.join(placeholders)}" if placeholders else ""),
        "generator": "pipeline/time_grid.py", "stations": route_list}, indent=1) + "\n", encoding="utf-8")
    print("\n".join(report))
    print(f"wrote grid.json, 6 grids and routes.json to {out} in {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
