# Design sketch: habitat console

`habitat-console-sketch.html` is the design reference for the one page we build in `frontend/`: the habitat console with the read-only crew display inside. It was made at the event on 2026-11-14 from `docs/preparation/design-brief.md` ("Field Book") and `docs/mission-scenario.md`. No code from it has to go into the app. Take the layout, tokens, states and wording from it.

## Open it

Double-click the file. It runs offline. The fonts load from `fonts/`. "Play demo" plays the six beats; the beat buttons under the map jump to the end state of each beat.

URL parameters, useful for screenshots and for checking one state:

| Parameter | Effect |
|---|---|
| `?beat=1` … `?beat=6` | End state of that beat (`&at=start` for its start) |
| `&skin=cuff` | Crew display in the forearm cuff skin |
| `&base=slope` | Slope layer instead of the orthophoto |
| `&grid=1`, `&ridges=1` | 100 m survey grid, ridge mask |
| `&assume=1` | Assumptions panel open |
| `&play=1` | Start the demo on load |

## What is synthetic

Everything on the map and every number. The sketch builds a made-up boxwork terrain, runs a Dijkstra on it in the browser and derives all six beats from that one grid, so the numbers agree with each other (plan 5:48 of 6:00, injury at EVA 5:17, protected route 67 min against 35 min through Drill site B, 150 m inside the zone). The real app does none of this in the browser: it loads the C# engine's grid and the pipeline's overlays. Stop names, zone names, sol 5120, the sunset time, the radio gap (1.6 min) and the Curiosity comparison (21 m vs 58 m) are placeholders.

Replace before anyone shows a screenshot as a result: orthophoto overlay, time-to-base grid in both variants, routes, stations with real names and Curiosity ground images, zone centres from the drill sols, REMS sunset, radio check, leave-one-out numbers.

## What carries over to the build

- **Palette:** cover yellow `#E3B21B` (header band), survey paper `#EDF0E6` (ground), graphite `#2B2D2F` (text, route), red pencil `#C8361F` (findings, ABORT), blue pencil `#2459A8` (stations, protected zones), dark green `#1F6B45` (GO, return area).
- **Type:** Atkinson Hyperlegible Next for text, Atkinson Hyperlegible Mono for every number. Both are in `fonts/` (SIL Open Font License, see the `OFL-*.txt` files). The Next font has no arrow glyph (→), so arrows are drawn as SVG.
- **Layout at 1920 × 1080:** header band; map on the left with the crew display top left and the map key top right; subtitle band and time budget under the map; verdict, safety rules, info rows and station log on the right. Below 1100 px everything stacks.
- **Signature:** a red-pencil ring marks each finding on the map and in the log; hovering or selecting one highlights the other.
- **Map styling:** return area dark green outline with a light tint; the fixed 60-minute line graphite dashed; protected zones blue hatching plus a text label; planned route graphite; ABORT route red.
- **Numbers:** all values sit right-aligned in one Mono column; every value has a source chip or the label "assumption".
- **Mars distances:** the sketch draws in metres on a flat grid. In Leaflet use only `map.distance()`; `latlng.distanceTo()` and `L.circle` use Earth's radius.

The direction contract for this surface is in `.impeccable/surfaces/docs-design-habitat-console-sketch-html.md`.
