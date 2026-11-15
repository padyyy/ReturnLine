"""Radio check along the routes (task 3 of docs/auftraege/datenteam.md).

Writes frontend/public/data/radio_check.json: for every station, on the way out and the way back,
the stretches of walking time without line of sight between the habitat antenna and the crew.

How it works
- Terrain: elev_10m.f32 from grid.json (the 10 m grid of pipeline/time_grid.py, USGS Gale DEM),
  sampled bilinearly between cell centres. Projection as in grid.json: equirectangular on the
  Mars sphere, R = 3,396,190 m, so x = R * lon and y = R * lat (radians).
- Route points: the vertices of routes.json, densified to at most 5 m apart; time (t_min) and
  distance (d_m) are interpolated linearly between vertices.
- Line of sight from the habitat antenna to the crew antenna: the terrain is sampled every 5 m along
  the straight line. A sample blocks the view if terrain + curvature bulge rises above the line.
  The bulge of the sphere between the two ends is d1 * d2 / (2R) (under 4 cm at 1 km).
- Antenna heights are assumptions: habitat 3 m, crew 2 m above the ground (proposal of the brief).
- A gap is a stretch of consecutive route points without sight. It is measured from the midpoint
  before its first blocked point to the midpoint after its last one, in walking minutes (t_min).
- Only along the routes, no viewshed (council decision of 2026-11-13). No relays, no reflection.
- Limits: the 10 m terrain is an average of the 4 m DEM level, so ridges of 1-2 m are smoothed
  away and the check can be optimistic; the scripted drift and the ABORT way are not checked.

Usage (from the repo root):  py -3.11 pipeline/radio_check.py [--habitat-antenna 3] [--crew-antenna 2]
Standard library only. Run it again whenever routes.json changes (new positions, ridge mask).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
R_MARS = 3396190.0
M_PER_DEG = R_MARS * math.pi / 180.0
STEP_M = 5.0


def load(name: str) -> tuple[dict, bool]:
    """Real file from frontend/public/data/, else the placeholder. Returns (json, is_placeholder)."""
    for path, ph in ((DATA / name, False), (DATA / "placeholder" / name, True)):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8")), ph
    raise FileNotFoundError(name)


class Terrain:
    """Bilinear elevation on the 10 m grid; NaN where there is no data."""

    def __init__(self, grid: dict):
        self.nx, self.ny, self.cell = grid["nx"], grid["ny"], grid["cell_m"]
        self.x0, self.y0 = grid["origin_m"]["x"], grid["origin_m"]["y"]
        z = array("f")
        z.frombytes((DATA / grid["files"]["elev"]).read_bytes())
        if sys.byteorder != "little":
            z.byteswap()
        if len(z) != self.nx * self.ny:
            raise SystemExit(f"elev grid has {len(z)} cells, grid.json says {self.nx * self.ny}")
        self.z = z

    def at(self, lon: float, lat: float) -> float:
        fc = (lon * M_PER_DEG - self.x0) / self.cell - 0.5
        fr = (self.y0 - lat * M_PER_DEG) / self.cell - 0.5
        c0 = min(max(int(math.floor(fc)), 0), self.nx - 2)
        r0 = min(max(int(math.floor(fr)), 0), self.ny - 2)
        u, v = min(max(fc - c0, 0.0), 1.0), min(max(fr - r0, 0.0), 1.0)
        i = r0 * self.nx + c0
        a, b, c, d = self.z[i], self.z[i + 1], self.z[i + self.nx], self.z[i + self.nx + 1]
        if any(math.isnan(q) for q in (a, b, c, d)):
            return math.nan
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def ground_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat = math.radians((a[1] + b[1]) / 2)
    return math.hypot((b[0] - a[0]) * M_PER_DEG * math.cos(lat), (b[1] - a[1]) * M_PER_DEG)


def visible(ter: Terrain, hab: tuple[float, float], crew: tuple[float, float], h_hab: float, h_crew: float) -> bool | None:
    """True if the crew antenna sees the habitat antenna; None if terrain data is missing."""
    L = ground_m(hab, crew)
    za, zb = ter.at(*hab), ter.at(*crew)
    if math.isnan(za) or math.isnan(zb):
        return None
    if L < STEP_M:
        return True
    za, zb = za + h_hab, zb + h_crew
    n = math.ceil(L / STEP_M)
    for k in range(1, n):
        u = k / n
        zt = ter.at(hab[0] + u * (crew[0] - hab[0]), hab[1] + u * (crew[1] - hab[1]))
        if math.isnan(zt):
            return None
        d1 = u * L
        if zt + d1 * (L - d1) / (2 * R_MARS) > za + u * (zb - za):
            return False
    return True


def densify(vertices: list[dict]) -> list[dict]:
    out = [vertices[0]]
    for p, q in zip(vertices, vertices[1:]):
        n = max(1, math.ceil((q["d_m"] - p["d_m"]) / STEP_M))
        for k in range(1, n + 1):
            u = k / n
            out.append({key: p[key] + u * (q[key] - p[key]) for key in ("lon", "lat", "d_m", "t_min")})
    return out


def check_leg(ter: Terrain, hab, leg: dict, h_hab: float, h_crew: float) -> dict:
    pts = densify(leg["vertices"])
    vis = [visible(ter, hab, (p["lon"], p["lat"]), h_hab, h_crew) for p in pts]
    unknown = sum(v is None for v in vis)
    seen = [v is True for v in vis]  # missing terrain counts as no sight
    gaps, i = [], 0
    while i < len(pts):
        if seen[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(pts) and not seen[j + 1]:
            j += 1
        mid = lambda a, b, k: (pts[a][k] + pts[b][k]) / 2
        t0 = pts[0]["t_min"] if i == 0 else mid(i - 1, i, "t_min")
        t1 = pts[-1]["t_min"] if j == len(pts) - 1 else mid(j, j + 1, "t_min")
        d0 = pts[0]["d_m"] if i == 0 else mid(i - 1, i, "d_m")
        d1 = pts[-1]["d_m"] if j == len(pts) - 1 else mid(j, j + 1, "d_m")
        gaps.append({"from_t_min": round(t0, 2), "to_t_min": round(t1, 2), "from_d_m": round(d0, 1), "to_d_m": round(d1, 1)})
        i = j + 1
    longest = max((g["to_t_min"] - g["from_t_min"] for g in gaps), default=0.0)
    return {"longest_gap_min": round(longest, 2), "gaps": gaps,
            "points": len(pts), "share_with_sight": round(sum(seen) / len(pts), 3), "points_without_terrain": unknown}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--habitat-antenna", type=float, default=3.0, help="habitat antenna height above ground, m (assumption)")
    ap.add_argument("--crew-antenna", type=float, default=2.0, help="crew antenna height above ground, m (assumption)")
    args = ap.parse_args()

    grid, _ = load("grid.json")
    routes, routes_ph = load("routes.json")
    sc, _ = load("scenario.json")
    if routes_ph:
        raise SystemExit("routes.json is still the placeholder; run pipeline/time_grid.py first")
    ter = Terrain(grid)
    hab = (float(sc["habitat"][0]), float(sc["habitat"][1]))
    limit = sc.get("radio_gap_max_min", 5)

    stations, overall = [], 0.0
    for s in routes["stations"]:
        entry = {"station": s["station"]}
        for leg in ("out", "ret"):
            entry[leg] = check_leg(ter, hab, s[leg], args.habitat_antenna, args.crew_antenna)
            overall = max(overall, entry[leg]["longest_gap_min"])
        stations.append(entry)

    out = {
        "generator": "pipeline/radio_check.py",
        "method": "line of sight from the habitat antenna to the crew antenna over the 10 m DEM grid (bilinear) along each route, "
                  "route points every 5 m or less, terrain sampled every 5 m along the sight line, Mars curvature included; "
                  "a gap runs from the midpoint before its first blocked point to the midpoint after its last",
        "habitat": list(hab),
        "habitat_antenna_m": args.habitat_antenna, "crew_antenna_m": args.crew_antenna,
        "assumptions": ["habitat_antenna_m", "crew_antenna_m"],
        "limits": "10 m terrain averaged from the 4 m DEM level smooths 1-2 m ridges away, so the check can be optimistic; "
                  "only the planned routes are checked, not the scripted drift or the ABORT way; no relays",
        "longest_gap_min": round(overall, 2),
        "stations": stations,
    }
    (DATA / "radio_check.json").write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")

    print(f"habitat {hab}, antennas {args.habitat_antenna} m / {args.crew_antenna} m, limit {limit} min")
    for e in stations:
        for leg in ("out", "ret"):
            r = e[leg]
            flag = "  OVER LIMIT" if r["longest_gap_min"] > limit else ""
            print(f"station {e['station']} {leg}: longest gap {r['longest_gap_min']:5.2f} min, {len(r['gaps'])} gaps, "
                  f"sight on {r['share_with_sight'] * 100:5.1f} % of {r['points']} points"
                  + (f", {r['points_without_terrain']} without terrain" if r["points_without_terrain"] else "") + flag)
    print(f"longest gap overall: {overall:.2f} min -> wrote {DATA / 'radio_check.json'}")


if __name__ == "__main__":
    main()
