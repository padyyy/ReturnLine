# ReturnLine in the current HUD frontend

The ReturnLine algorithm is integrated into the native navigation UI, using
the mission-control theme and precomputed tracks from `navigation-view-/-hud`.

## UI and behavior

Choose a station and **Start route**. The native header retains pause, end and
the ×1/×30/×60 clock controls. The ReturnLine panel uses the existing palette,
square panel borders and heading typography; it contains Walking speed,
Injury, Return now and Abort, plus live return duration, immediate arrival,
planned arrival and return margin. Mission end and sunset are shown explicitly.
Narrow views keep the controls visible with the tablet/HUD/data sheet below.

Walking speed is an absolute factor from 0 to 1, initially 1, step 0.01. It
updates future movement, ETA and route stages without moving the crew, setting
injury or changing routes. At 0 movement stops while the playing mission clock
continues; the UI shows stopped rather than a fabricated ETA.

Injury is an independent event. At a station it ends work and explicitly
activates the valid prepared emergency alternative, including protected passage
with the logged reason `Crew injury at station`. It retains walking speed.
A previous outward injury does not disable the target trigger. If the prepared
alternative is missing, identical or blocked, the normal return is the fallback.
The old return is shown grey/dashed after a geometry change. Signed time
differences are displayed: the data name `fastest` does not guarantee the
alternative is faster after directed runtime timing. No route is invented.

Return now retraces only the walked outbound prefix. While returning, commands
retain the active geometry/progress; Abort can escalate the mode. Repeated
commands do not restart the return clock. Manual protected Abort still needs
its existing approval/reason. No route changes occur mid-leg.

## Calculation and native tracks

`return-line.js` accepts the existing native Tracks:

```js
{ vertices: [{lon, lat, d_m, t_min, elev_m, slope_deg}], length_m, minutes }
```

With heights, normalized Tobler times are computed in the walking direction;
roughness remains zero as an explicit missing-data assumption. Valid engine
times are a fallback when heights are absent. Reversing an outbound prefix
requires directional height data. Unknown or blocked terrain is never green.
The existing duration module, exports, grid format and datasets are unchanged.
The native planning verdict keeps its engine estimates; live navigation uses
the directed runtime profile, so its initial ETA can differ slightly.

Mission end, strictly-before-sunset, at most 60 minutes to shelter, the 15-minute
caution margin and known slopes above 20° are checked. The backup is unplanned.
Values come from the loaded model/scenario: this base currently has 360 usable
minutes and sunset **17:55 LMST**. The scripted rehearsal retains its scenario
injury factor 0.5. The navigation injury event does not apply that factor.

For each future point, the color includes travel from the current crew to the
point plus its permitted way home. Outward and homeward edges use the same
prognosis, split inside an edge at all deadline/caution crossings:

- Green: at least 15 minutes of tightest margin.
- Yellow: feasible, less than 15 minutes of margin.
- Red: a known limit is violated or walking is blocked.
- Grey: required data unavailable.

Walked homeward sections remain neutral. During the outward walk, its currently
retraceable homeward prefix is also colored from the crew. A target-only
shortcut is a discrete endpoint choice, never interpolated into its approach.
An unsafe approach cannot be hidden by a green target endpoint.

## API and adapters

```js
import { createNavigationRun } from './src/navigation-run.js';
const run = createNavigationRun(model, plan); // ui.js native plan
run.setSpeedFactor(0.5);
run.advance(deltaMinutes);                   // existing RAF is the only clock
run.injury();                               // independent event
run.command('return-now');
const view = run.view();
const { segments } = run.colors();
```

Pure equivalents: `evaluateReturn(context)`, `returnLineSegments(context)` and
`returnCommand(context, type, options)`. Context includes model, plan, t, phase,
track, tt (nominal time), f (time multiplier), optional distanceM and event delay.
Explicit f wins over the pure core's backward-compatible injured fallback.
`preferredVariant:'fastest'` requests a target alternative without bypassing
data/terrain/approval checks. It has no routing effect mid-leg.

View fields include `ttb`, `returnArrivalMinute`, `homeAt`, `spare`, `margins`,
`violations`, `stage`, `status`, `speedFactor`, `stopped`, `injured`,
`canTriggerInjury` and `injuryReturn`. The latter records actual selection,
geometry change, protection and nominal comparison times. Segments supply
native `from/to`, `kind` (outward/homeward), stage/color, margins and arrival.

`nav.js` feeds the controller to the existing crew renderers. `crewviz.js`
draws colored sections in Canvas and SVG; `map.js` can draw them on the planning
map when its existing Return stages toggle is enabled. The scripted rehearsal
retains its separate grid-based legend and original timeline. Radio warnings,
gallery and native layers are unchanged. No search or additional dependency.

## Verification

Run `npm test` and `npm run build` from `frontend`. Tests cover speed/stop/resume,
separate injury, target alternatives on loaded stations 1/3, earlier injury,
mid-leg route lock, repeat commands, precise red/yellow/green cuts, mission/
sunset boundaries, backup exclusion, missing data and current scenario daylight.
The legacy console simulation adapter from the old working tree was not copied
over the new branch's scripted rehearsal.
