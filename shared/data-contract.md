# Data contract: what the frontend reads

Draft of 2026-11-14, with the team decisions of the same day; derived from what the console sketch (`docs/design/habitat-console-sketch.html`) and Alex's navigation and HUD sketch (`docs/design/navigation-hud-sketch.html`, branch `navigation-view-/-hud`) actually use. Proposal for Paul, Michael, Magnus and Alex; file names and grid layout are open until the grid spec fixes them. The grid layout itself (bbox, cell size, row order) belongs to Paul's grid spec in this folder.

**Ground rule:** the browser reads and interpolates. It never searches for a route. Following return pointers, drawing contours of a loaded grid and interpolating along a precomputed track are fine.

## Conventions

- Positions in files: `[lon, lat]` in degrees, east-positive (GeoJSON order). Leaflet takes `[lat, lon]`; convert in the loader.
- Mars sphere, R = 3,396,190 m. Distances come precomputed in metres or from `map.distance()`, never from `latlng.distanceTo()` or `L.circle`.
- Times in minutes (float). Route times are at level walking speed 1.5 km/h with the slope penalty already applied; the browser multiplies by the walking factor (1.0, or 2.0 for the injured crew member).
- Grids: one header file plus raw little-endian binaries, row 0 = north, as fixed by the grid spec.
- Every file names its source and generator, like `ortho_gale_1m.json` does.

## Files

Folder `frontend/public/data/` unless noted.

| File | Content | Producer | Used by |
|---|---|---|---|
| `../maps/ortho_gale_1m.jpg` + `.json` | orthophoto overlay and bounds | pipeline (exists) | console map, cuff map |
| `slope_10m.png` + `.json` | slope picture for display: up to 10°, 10–20°, over 20° | pipeline | console layer, cuff base map "slope" |
| `scenario.json` | constants and assumptions, each with source or "assumption": habitat `[lon, lat]`, `scenario_station` (station `n` the six beats play for, chosen by the data checks in `docs/demo-script.md`), `drift_zone` (zone `id` the crew drifts toward in beat 4; pick one on the way home so that another zone still lies between the injury point and the habitat for the ABORT), `zone_warn_m` (warning distance to a zone edge, assumption, 10 m as in the design sketch), `zone_clearance_m` (planning clearance outside the buffer, assumption), EVA start (LMST), sol shown, life support 360 min, backup 60 min, sunset and sunrise (REMS, last reading sol 4995), walking speed, injury factor 0.5, caution margin 15 min, dose rate 0.64 mSv/day, zone buffer, slope limits 10° and 20° | team, pipeline for REMS | everything |
| `stations.geojson` | points: `n`, `name`, `reason`, Curiosity `sol`, ground image `{path, instrument, sol}`, `elev_m` | pipeline | console log, target picker, maps, HUD |
| `zones.geojson` | **polygons** (buffer drawn as polygon, not `L.circle`): `id`, `name`, `drill_sol`, `buffer_m` | pipeline | maps, HUD, warnings, zone metres |
| `curiosity_traverse.geojson` | Curiosity's line, clipped to the map extent | pipeline (MMGIS) | console map |
| `grid.json` | header for all grids (grid spec) | engine | loaders |
| `ttb_penalized.f32`, `ttb_allowed.f32` | minutes to the habitat per cell; zones penalized (normal) or allowed (ABORT); unreachable = +Inf | engine | return area, 60-minute line, time to base at the crew, back-to-base per station, max stay, return stage, readout |
| `ptr_penalized.i32`, `ptr_allowed.i32` | index of the next cell towards the habitat; −1 at the habitat and where unreachable | engine | reroute (beat 4), protected and ABORT routes home (beat 5–6) |
| `elev_10m.f32`, `slope_10m.f32` | elevation (m) and 10 m slope (°) per cell | pipeline | elevation and slope at the crew, readout, warnings |
| `routes.json` | per station `i`: `out` (habitat → station) and `ret` (station → habitat), zones penalized. Each a track of vertices `{lon, lat, d_m, t_min, elev_m, slope_deg}` plus totals `length_m`, `minutes`, `zone_m` (must be 0), `max_slope_deg`, `max_ttb_min` | engine (elevation and slope sampled by pipeline) | target picker, crew position over time, heading, remaining distance and time, elevation profile, rules panel |
| `radio_check.json` | per leg: longest gap (min) and the gap segments, from the DEM line-of-sight sampling | pipeline | rules panel |
| `curiosity_comparison.json` | mean deviation (leave-one-out), straight-line baseline, number of drives | engine | info row |

## What the sketches compute in the browser, and the replacement

| Sketch does | Allowed? | In the build |
|---|---|---|
| Route habitat → station by Dijkstra (`navLeg`) | no | `routes.json` `out` |
| Route station → habitat by following pointers (`navReturn`) | yes | `routes.json` `ret`, or follow `ptr_penalized` |
| Return stages: a Dijkstra **from the crew position**, every sim minute (`spareField`) | no | rule B from `ttb_penalized` (decided, see below); rule A later from precomputed grids |
| Return area and 60-minute line as contours of the time grid | yes | contours of `ttb_*` × walking factor |
| Terrain and slope rendered from a synthetic grid | no (synthetic) | orthophoto and slope images |
| Heading, remaining distance and time, elevation profile, max stay | yes | interpolation along `routes.json` |

## Decided on 2026-11-14

1. **No route search in the browser.** Routes to and from each station come from the engine (`routes.json`). The sketches' in-browser Dijkstra (`navLeg`, `spareField`) does not go into the build.
2. **Return stages: the simple rule (B) until the feature freeze; the exact rule (A) afterwards if time allows.** Rule B, needing only `ttb_penalized` and `scenario.json`:
   - B(t) = min(life support left, time to sunset) at EVA time t; L(t) = min(60, B(t)).
   - For every cell X: spare(X) = L(t) − f × T(X), with T from `ttb_penalized` and f the walking factor (1, or 2 for the injured crew member).
   - Stage: green if spare ≥ 15 min (caution margin, assumption), amber if 0 ≤ spare < 15, red if spare < 0 or the cell cannot reach home. The HUD ring and the warnings use spare at the crew's own cell.
   - Rule B leaves out the walk from the crew to X, so the map label says what it shows: "home in time from here, now". Rule A adds that walk from precomputed "time from" grids along each leg (engine), still without any search in the browser.
   - Max stay at a station s, arriving at EVA time a: none if T(s) > 60, otherwise min(life support, sunset) − a − T(s).
3. **Demo target:** the picker lists all stations with walk time, back-to-base and max stay; the six beats play for the scenario station (`docs/demo-script.md`, data check 5); other stations navigate without scripted events.

## Grid spec checklist (Paul)

The grid spec is the one page that lets engine, pipeline and frontend read the same grids. Proposed defaults, to confirm or change:

| Item | Proposal |
|---|---|
| Extent | the map extent 137.34–137.42° E, 4.77–4.85° S, snapped outward to whole cells |
| Cell | 10 m in the source projection (Mars equirectangular, `+proj=eqc +R=3396190`), about 474 × 474 cells |
| Alignment | on the DEM's 1 m pixels, so each cell is exactly 10 × 10 DEM pixels (the orthophoto grid is offset by about 0.49 m; see `../pipeline/README.md`) |
| Order | row 0 = north, columns west to east, index = row × nx + col |
| Types | times float32 little-endian in minutes, unreachable +Inf; elevation and slope float32 |
| Pointers | int32 index of the next cell towards the habitat, −1 at the habitat and where unreachable (alternative: uint8 direction code, 4× smaller) |
| Meaning of time | walking time from the cell to the habitat at 1.5 km/h with the named slope penalty. In the zones-penalized variant the route avoids zones, but the stored value is the real walking time along that route, not the penalized cost |
| Moves | 16 neighbours (8 give octagonal areas on open ground), no corner cutting past blocked cells |
| Blocked | 1 m ridge mask aggregated to 10 m, and 10 m slope over 20° |
| Zone clearance | in the zones-penalized variant, cells within `zone_clearance_m` outside the buffer cost a small extra factor (the placeholder uses 3, zones themselves 20), so planned routes keep distance and the 10 m warning fires only on a real deviation |
| Header | `grid.json`: bbox in degrees, origin in metres, cell size, nx, ny, CRS, file names, dtype, nodata, source, generator, date |
| Folder | `frontend/public/data/` |

Team inputs the spec needs: the habitat coordinate, the slope penalty and the zone buffer radius (both labeled assumptions).

Example header: `frontend/public/data/placeholder/grid.json`, written by `frontend/scripts/make-placeholder-data.mjs` together with the four binary grids in this format (flat ground, no slope, zones penalized by a factor of 20, 341 × 341 cells around the placeholder habitat). The console reads exactly these fields: `cell_m`, `nx`, `ny`, `origin_m.x` and `origin_m.y` (north-west corner of cell 0 in projected metres; lon° = x / 59274.70), `files`. Real files in `frontend/public/data/` replace the placeholder without code changes. The placeholder's grid search stands in for the engine only until then.
