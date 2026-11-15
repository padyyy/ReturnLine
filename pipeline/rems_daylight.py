"""Daylight for the EVA from Curiosity's REMS weather station (task 4 of docs/auftraege/datenteam.md).

Writes sunrise_lmst, sunset_lmst and daylight_source_sol into frontend/public/data/scenario.json.

How it works
- Source: the REMS weather feed of NASA JPL (docs/data-sources.md). JSON key "soles", newest first;
  each sol has "sunrise" and "sunset" in local mean solar time (LMST).
- Which sol: by default the sol Curiosity stood at the scenario station (scenario.json
  scenario_station, its "sol" in stations.geojson). If REMS has no times for it, the nearest sol
  that has them. --sol overrides.
- The EVA itself is on a future sol ("sol" in scenario.json stays as it is; any sol shown for the
  crewed EVA must lie in the future, docs/mission-scenario.md). Using a measured day's sunrise and
  sunset for the EVA is an assumption, and sources.sunset_lmst says so. Sunset shifts with the Mars
  season by tens of minutes (17:20 to 17:55 LMST over the boxwork campaign, sols 4591-4839).
- scenario.json: if it does not exist yet, it starts as a copy of the placeholder file (rule 10 of
  the brief); only the daylight fields change, every other field is kept.

Usage (from the repo root):
  py -3.11 pipeline/rems_daylight.py                  # fetch the feed, cache it in data/raw/
  py -3.11 pipeline/rems_daylight.py --feed FILE      # use a downloaded copy of the feed
  py -3.11 pipeline/rems_daylight.py --sol 4633       # pick the sol by hand
Standard library only.
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "public" / "data"
CACHE = ROOT / "data" / "raw" / "rems_weather.json"
FEED_URL = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def load(name: str) -> tuple[dict, bool]:
    """Real file from frontend/public/data/, else the placeholder. Returns (json, is_placeholder)."""
    for path, ph in ((DATA / name, False), (DATA / "placeholder" / name, True)):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8")), ph
    raise FileNotFoundError(name)


def read_feed(feed: str | None) -> list[dict]:
    if feed:
        raw = Path(feed).read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(FEED_URL, timeout=60) as r:  # default TLS verification
            raw = r.read().decode("utf-8")
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(raw, encoding="utf-8")
    soles = json.loads(raw)["soles"]
    return [s for s in soles if str(s.get("sol", "")).isdigit()
            and HHMM.match(str(s.get("sunrise", ""))) and HHMM.match(str(s.get("sunset", "")))]


def scenario_sol(sc: dict) -> int:
    stations, _ = load("stations.geojson")
    n = sc.get("scenario_station")
    for f in stations["features"]:
        if f["properties"].get("n") == n and f["properties"].get("sol") is not None:
            return int(f["properties"]["sol"])
    raise SystemExit(f"scenario station {n} has no sol in stations.geojson; pass --sol")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--feed", help="path to a downloaded copy of the REMS feed")
    ap.add_argument("--sol", type=int, help="REMS sol to take sunrise and sunset from")
    args = ap.parse_args()

    sc, sc_ph = load("scenario.json")
    want = args.sol if args.sol is not None else scenario_sol(sc)
    soles = read_feed(args.feed)
    if not soles:
        raise SystemExit("REMS feed has no sol with sunrise and sunset")
    pick = min(soles, key=lambda s: (abs(int(s["sol"]) - want), int(s["sol"])))
    sol = int(pick["sol"])

    out = dict(sc)
    out["sunrise_lmst"], out["sunset_lmst"] = pick["sunrise"], pick["sunset"]
    out["daylight_source_sol"] = sol
    out["placeholder_fields"] = [f for f in sc.get("placeholder_fields", []) if f not in ("sunrise_lmst", "sunset_lmst")]
    src = dict(sc.get("sources", {}))
    why = f"REMS, sol {sol} ({pick.get('terrestrial_date', 'date unknown')}), measured by Curiosity; used for the EVA sol (assumption)"
    src["sunset_lmst"] = src["sunrise_lmst"] = why
    out["sources"] = src
    if sc_ph:
        out["note"] = "Partly placeholder: the fields listed in placeholder_fields are still placeholder values."
    updaters = [u for u in sc.get("updated_by", []) if u != "pipeline/rems_daylight.py"]
    out["updated_by"] = updaters + ["pipeline/rems_daylight.py"]

    (DATA / "scenario.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"REMS sol {sol} ({pick.get('terrestrial_date')}, asked for {want}): "
          f"sunrise {pick['sunrise']}, sunset {pick['sunset']} LMST, sky {pick.get('atmo_opacity', '?')}")
    print(f"wrote {DATA / 'scenario.json'}" + (" (started from the placeholder)" if sc_ph else ""))
    print("still placeholder:", ", ".join(out["placeholder_fields"]) or "none")


if __name__ == "__main__":
    main()
