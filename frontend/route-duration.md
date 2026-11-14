# Offline walking-time comparison

The pure core `src/route-duration.js` computes duration with no imports, file
access, UI or route search. It is an **offline comparison model**. Do not import
it into `main.js`: the console continues using engine `t_min`, route `minutes`
and time-to-base grids as its single time source. Changing the engine's walking
model is a team decision and is outside this module.

## Shared Track input

`sectionsFromTrack(track)` from `src/route-duration-input.js` accepts one `out`
or `ret` track from `public/data/routes.json`:

```js
const sections = sectionsFromTrack({ vertices: [
  { d_m: 0, elev_m: -3600 },
  { d_m: 10, elev_m: -3599 },
  { d_m: 32.36, elev_m: -3600 },
] });
const result = estimateDuration(sections, {
  model: { baseSpeedMps: scenario.walk_speed_kmh / 3.6 },
});
```

`d_m` is cumulative ground distance in metres on the Mars sphere, supplied by
the route producer. The adapter never infers distances from cell size, longitude
or latitude. It supports the shared 10 m grid's 16-neighbour moves, including
knight moves, without needing grid geometry. Paul's A* paths use this same Track
format. The previous 1 m `nodes` interface and `parseRoute` were removed.

For every adjacent pair, in the given walking order:

    distanceM = next.d_m - current.d_m
    slopeDeg = atan2(next.elev_m - current.elev_m, distanceM) × 180 / π
    roughnessM = 0

Nonpositive distance differences are skipped. All vertices still require finite
`elev_m` and finite nonnegative `d_m`, including skipped and final vertices.
Missing/null heights raise an explicit error; they never become zero/flat.
Empty/single-point tracks have no sections. Supported directed slopes are
−89..89 degrees. Core section index follows retained positive-length edges.
`lon`/`lat` are not needed by this adapter. `slope_deg` is directionless terrain
inclination used for blocking, not the directed travel slope. `t_min` and
`minutes` are engine reference values only, never model inputs.

No roughness data currently exist: zero is an explicit assumption, not a
measurement. Future integration requires a calibrated `roughness_10m.f32`
(standard deviation of 1 m DEM pixels per 10 m cell), registered in `grid.json`.
That data generation is outside this task. No public data files are modified.

## Model

Tobler (1993): `v(g) = 6 * exp(-3.5 * abs(g + 0.05))` km/h,
where g is height difference divided by horizontal distance.
[Source: NCGIA Technical Report 93-1](https://escholarship.org/uc/item/05r820mz).

The core normalizes by v(0) to preserve configured level-ground speed in m/s:

    g = tan(slopeDeg × π / 180)
    slopeFactor = exp(-3.5 × (abs(g + 0.05) - 0.05))
    terrainSpeed = baseSpeedMps × slopeFactor
                   / (1 + roughnessPenaltyPerM × roughnessM)

Active event speed factors multiply terrain speed, then speed is clamped to
[minSpeedMps, maxSpeedMps]. Walking minutes = distanceM / speedMps / 60.
Delays add minutes. No extra slope-length correction is applied.
Peak speed is at −5% grade (about −2.8624°), 1.191 times flat-ground speed.

Core defaults remain 1.5/3.6 m/s, roughness coefficient 1 per metre and speed
bounds 0.01..3 m/s. The checker and example **override base speed from scenario**;
injury uses `scenario.injury_factor`. They never hardcode these scenario values.
The function was developed for terrestrial pedestrians. Its transfer to Mars
and spacesuits, base speed and roughness penalty are assumptions, not validation.
Numerical bounds do not establish walkability and may limit extreme slowdowns.

## Events and output

`estimateDuration(sections, { model, events, nowMinute })` accepts events
`{ atMinute, speedFactor?, delayMinutes? }`. Times are minutes since departure.
Speed factors in (0,1] persist and multiply. Nonnegative delays add, including
when another delay is running. Events at/after final arrival are ignored.
Keep the complete event history when recomputing; do not insert duplicate events.
Replay preserves time before a newly appended event. Recovery is not implemented.

Returns `totalMinutes`, `elapsedMinutes` (capped at arrival), `remainingMinutes`
and `segments` with start/end, walking/delay duration and average/min/max walking
speed in m/s. Average excludes delays; zero-distance core sections have null
speeds. Invalid/nonfinite inputs fail rather than silently becoming flat terrain.

## Run the offline comparison

From `frontend/` with Node 22.12+:

```sh
node scripts/check-route-times.mjs
node scripts/check-route-times.mjs --json
node examples/route-duration.mjs
npm test
```

The checker resolves data paths relative to its script, independent of cwd:
- Reads **only real** `public/data/routes.json`, never placeholder routes.
- Reads `public/data/scenario.json`; only if missing, falls back to
  `public/data/placeholder/scenario.json`. Invalid JSON does not trigger fallback.
- Compares every station's out/ret, and adds a ret-with-injury row.
- Injury occurs halfway through **return distance**, at nominal model time there;
  a midpoint inside an edge is interpolated. Prior travel is preserved.
- Reports engine/model minutes, signed difference and percent, and maximum
  absolute cumulative-time difference against all vertex `t_min` values,
  including endpoints. A zero engine total yields null percentage.
- Injury rows are explicitly compared against the **uninjured engine reference**;
  they do not claim to compare with an injured engine simulation.
- Prints only stdout (or stderr on failure); success exits 0, invalid/missing
  inputs exit 1. Writes no data files.

The engine currently uses a different symmetric slope model. Differences are
reported, not corrected or hidden. Actual route comparison output belongs in
the PR; the engine and console remain unchanged by this module.

## Shared reference vectors

`../shared/walking-model-vectors.json` contains 18 vectors for 10 m and 22.36 m:
−20°, −10°, −5°, −2.86°, 0°, +5°, +10°, +20° plus the exact −5% maximum for each
length. Each records distance_m, dz_m, slope_deg and model minutes, base speed,
speed bounds and comparison tolerance. These are model regression references,
not a claim that the team has adopted this model in the engine.
