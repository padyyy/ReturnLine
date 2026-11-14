# Route duration simulation

Standalone JavaScript calculation with no imports, file access, UI, location,
map or project-data dependencies. Only supplied sections and options are used.

## Input and use

Import `estimateDuration` from `src/route-duration.js` and pass an array:

```js
const result = estimateDuration([
  { distanceM: 100, slopeDeg: 0, roughnessM: 0 },
], { model: { baseSpeedMps: 1 } });
```

The core validates numerical values. `parseRoute` from
`src/route-duration-input.js` converts an ordered A* path (JSON string or object)
into sections. Example:

```js
const sections = parseRoute({ nodes: [
  { x: 0, y: 0, elevation_m: -3600, roughness_m: 0.2 },
  { x: 1, y: 0, elevation_m: -3599.9, roughness_m: 0.1 },
  { x: 2, y: 1, elevation_m: -3600, roughness_m: 0 },
] });
const result = estimateDuration(sections);
```

Each node represents a 1 m × 1 m grid cell. `x` and `y` are safe integer column
and row indices in that grid, not geographic coordinates. Node order comes from
A*; this module does not search or reorder. Only distinct neighbours in the
8-connected grid are accepted. Centre-to-centre distance is 1 m for an axial
move and sqrt(2) m for a diagonal move. These are horizontal grid distances,
with no additional slope-length conversion. The supplied route is assumed
traversable; obstacle/corner-cutting checks belong to A*.

N nodes create N−1 sections. Roughness comes from the departure node's
`roughness_m`; directional slope comes from both endpoint elevations. The final node contributes no outgoing distance;
empty and single-node paths take zero time. Values are not averaged over the
path: compute the speed and time for each section and sum **times**, not slopes
or roughness. Per-section result index i corresponds to node i → node i+1.

The input field names `elevation_m` and `roughness_m` match the supplied Python
`TerrainCell` fields. Each node requires finite elevation (negative is allowed)
and nonnegative roughness. Directional slope is derived per transition:

    slopeDeg = atan2(next.elevation_m - current.elevation_m, distanceM) × 180 / π

The resulting angle is positive uphill and negative downhill; angles outside
−89..89 degrees are rejected to match the core's supported range.
Python's `slope_deg` is a directionless terrain inclination (0..90 degrees),
used by the A* cost builder for penalties and blocking. It is not used as Tobler's
travel-direction slope and may remain present as extra data in the JSON.
A* costs also include uncertainty and are not calibrated travel minutes.
Do not add those costs or their slope penalty to the duration calculation.

The A* result must retain or be joined to the original cell elevations and
roughness. `build_cost_grid` returns only scalar costs/None; that output alone
is insufficient to calculate directional walking times. The duration adapter
assumes the supplied path has already passed blocking/quality checks in A*;
it does not repeat `CostConfig` or interpret `valid_fraction`/`blocked`.

`roughness_m` is interpreted as the population standard deviation of neighbouring
elevations in metres. Its exact neighbourhood remains an integration decision.
Every node must contain elevation and roughness, including the final node.
Missing values are rejected rather than treated as flat terrain.

`examples/route-duration.mjs` contains JSON and a complete call. Run it using
`node examples/route-duration.mjs` from `frontend/`. Run tests with `npm test`
(Node's built-in test runner; no new dependencies).

## Model assumptions

Tobler's Hiking Function (1993) gives speed in km/h:

    v(g) = 6 × exp(-3.5 × abs(g + 0.05))
    g = tan(slopeDeg × π / 180) = elevation change / horizontal distance

Source: [Waldo Tobler, NCGIA Technical Report 93-1](https://escholarship.org/uc/item/05r820mz).
Formula and implementation also documented by [Universität Tübingen, Technical Note 3](https://uni-tuebingen.de/forschung/forschungsschwerpunkte/sonderforschungsbereiche/sfb-1070/archiv/zweite-foerderphase/organisation/serviceprojekt-s/technical-notes/technical-note-3/).

We normalize v(g) by v(0), so the configured base speed remains the speed on
level, smooth terrain. This adaptation yields terrain speed in m/s:

    slopeFactor = exp(-3.5 × (abs(g + 0.05) - 0.05))
    terrainSpeed = baseSpeedMps × slopeFactor
                   / (1 + roughnessPenaltyPerM × roughnessM)

Tobler's constants 3.5 and 0.05 are fixed; `uphillPenalty` and `downhillPenalty`
are no longer used. Peak speed occurs at grade −0.05 (−5%, about −2.86°),
approximately 1.191 times flat speed. Steeper descent and ascent slow travel.
To reproduce original, unscaled Tobler speeds use
`baseSpeedMps: 6 * Math.exp(-0.175) / 3.6` (about 1.399 m/s).

Multiply terrain speed by active event speed factors, then clamp to
[minSpeedMps, maxSpeedMps]. Walking minutes = distanceM / speedMps / 60.
Delays add minutes. The node adapter supplies horizontal grid distances; the
core uses distanceM as supplied. Do not supply slope percent as degrees.

Configurable defaults: base speed 1.5/3.6 m/s, roughness coefficient 1 per metre,
minimum speed 0.01 m/s, maximum speed 3 m/s. Scaling for astronauts and the
roughness extension are uncalibrated assumptions, not part of Tobler's original
function. The terrestrial function is not validated for suited walking on Mars.
Bounds are numerical/model bounds, not evidence of walkability. Clamping may
limit an injury's slowdown on already very slow terrain. Safety rules, terrain
blocking, fatigue, life support and route selection remain outside this module.
Tests include an inverse-duration check for base speed varied by ±30%.

## Events and live estimates

Options: `{ model, events, nowMinute }`. Events have `atMinute` relative to route
departure, optional `speedFactor` in (0,1] (default 1), and `delayMinutes` ≥ 0
(default 0). Injury example: `{ atMinute: 2, speedFactor: 0.5 }`.
Factors persist to arrival and multiply. Delays add, including when triggered
while already waiting. Events are sorted without changing caller data. At an
edge boundary, the event applies to the following nonempty edge. Events at or
after final arrival have no effect. Empty/zero-distance paths take zero minutes.

Keep the full event history and append a newly triggered event at `nowMinute`;
recompute with the same route/model. Replay preserves travel before the event,
including part of an edge. Do not resend an old event with a new timestamp or
insert duplicates. Rewriting past events/model changes intentionally changes
history. Recovery and temporary speed changes are not supported yet.

Returns `totalMinutes`, `elapsedMinutes` (capped at arrival), `remainingMinutes`,
and `segments`. Each section reports start/end, duration, walking/delay minutes,
remaining minutes and min/max/average walking speed in m/s. Average speed excludes
waiting; zero-distance sections have null speeds. A section spanning an injury
has multiple speeds, represented by its average and range.

Invalid types, nonfinite/negative values and inconsistent speed bounds throw
TypeError/RangeError (malformed JSON: SyntaxError). Unrepresentable arithmetic or
total durations over Number.MAX_SAFE_INTEGER minutes throw RangeError. This is
a deterministic forecast, not a physically validated mission safety model.
