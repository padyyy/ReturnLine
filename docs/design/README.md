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

## Navigation and HUD sketch (work in progress)

`navigation-hud-sketch.html` is a copy of the console sketch with a navigation mode added (branch `navigation-view-/-hud`). The console sketch above stays unchanged.

- **Planning:** the right column gets a "Navigate" list of the four stations with walk time and the time back to base. Picking one previews the route on the map; "Start route" switches the page to navigation and starts the EVA clock at 09:00 LMST.
- **Navigation, left (about 3/4):** the forearm tablet. The map is heading-up with the crew arrow fixed. Four hardware keys sit in the corners, also on keys `1` to `4`: 1 data (data and map swap places), 2 zoom in, 3 zoom out, 4 base map (orthophoto, slope, plain).
- **Return stages:** for every cell the sketch asks: can the crew walk there from where they are now and still get home inside the 60-minute rule and before life support (or daylight) runs out? Green: yes, with 15+ min to spare. Yellow: under 15 min to spare. Red: no, so ABORT if the crew is there. The area shrinks as life support runs down and as the crew walks further out. The fixed 60-minute line is drawn dashed. The 15 min margin is a sketch assumption.
- **Why it stays large at first:** with 6 h of life support, the 60-minute rule is the tighter limit for most of the EVA. For testing, the picker can start the EVA clock at hour 3:00 or 4:30, which leaves less life support.
- **Navigation, top right:** helmet HUD. The compass rose turns with the heading (heading = walking direction, as agreed). Base and target sit on the rim at their bearing and move inside once within 250 m. The ring takes the stage colour and word. Corners show EVA time, time to sunset, radiation dose and life support; up to three warnings sit below.
- **Navigation, bottom right:** the data sheet with the elevation profile of the current leg, or the small map after key 1.
- **At the target:** the crew decides how long to stay. The map and the data sheet show the max stay (life support or daylight left, minus the way home) and a **Start return** button, also on key `R`. Under 15 min it turns red; at 0 it reads "Start return now". The picker already shows the max stay per station before the start.
- **Test terrain:** the navigation sketch has stronger relief than the console sketch (about 100 m range, routes up to about 7°), so slope and the elevation profile mean something. Its six console beats run on that terrain too.

URL parameters: `?pick=2` preselects a station; `?nav=2` starts navigation to it, with `&t0=<EVA minutes at start>`, `&t=<EVA minutes>`, `&ret=1&t2=<EVA minutes>` (start the return, then run on), `&pause=1`, `&swap=1`, `&zoom=0`…`4` and `&navbase=slope|plain`.

The yellow stage breaks DESIGN.md's rule that yellow is never a status colour. It is a separate amber (`#D9A300`), and every stage also carries its words.
