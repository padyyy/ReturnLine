# Data contract: what the frontend reads

Draft of 2026-11-14, derived from what the console sketch (`docs/design/habitat-console-sketch.html`) and Alex's navigation and HUD sketch (`docs/design/navigation-hud-sketch.html`, branch `navigation-view-/-hud`) actually use. Proposal for Paul, Michael, Magnus and Alex; nothing here is decided until the grid spec fixes it. The grid layout itself (bbox, cell size, row order) belongs to Paul's grid spec in this folder.

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
| `scenario.json` | constants and assumptions, each with source or "assumption": habitat `[lon, lat]`, EVA start (LMST), sol shown, life support 360 min, backup 60 min, sunset and sunrise (REMS, last reading sol 4995), walking speed, injury factor 0.5, caution margin 15 min, dose rate 0.64 mSv/day, zone buffer, slope limits 10° and 20° | team, pipeline for REMS | everything |
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
| Return stages: a Dijkstra **from the crew position**, every sim minute (`spareField`) | no | see decision 1 below |
| Return area and 60-minute line as contours of the time grid | yes | contours of `ttb_*` × walking factor |
| Terrain and slope rendered from a synthetic grid | no (synthetic) | orthophoto and slope images |
| Heading, remaining distance and time, elevation profile, max stay | yes | interpolation along `routes.json` |

## Decisions needed

1. **Return stages.** Alex's rule is spare(X) = min(60 − home(X), B − walk(here → X) − home(X)); it needs the walking time from the crew's current position to every cell.
   - **A (exact):** the engine also writes "time from" grids at sample points along each leg, for example every 5 minutes of walking (about 80 grids; as 1-byte minutes on a 20 m grid about 4–5 MB). The browser uses the nearest sample.
   - **B (simple):** drop the walk-there term: spare(X) = min(60, B) − home(X), "if the crew were here now". Needs only `ttb_penalized`, and matches the console's return area plus the 15-minute caution band.
   - Proposal: B for the feature freeze at 22:30, A afterwards if time allows. Alex decides with the engine team.
2. **Demo target.** The team decided that the demo starts after habitat control picks a target and presses Start. The scripted story (beats 4–6) only works for a station whose return leg passes a protected zone that blocks a real shortcut home (`docs/demo-script.md`, data check 5). Proposal: the picker lists all stations with walk time, back-to-base and max stay; the six beats play for the scenario station; other stations navigate without scripted events.
3. **File names and grid layout:** fixed by the grid spec; the names above are placeholders.
