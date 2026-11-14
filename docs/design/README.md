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

`navigation-hud-sketch.html` starts from the console sketch and adds a navigation mode (branch `navigation-view-/-hud`). The console sketch above stays unchanged. The six-beat demo is not in this file.

- **Start screen (planning):** base map with the stations, protected zones and the return area. Pick a station in the "Plan the route" list or on the map. The map shows the route; the right column shows GO or NO-GO, the four safety rules and the station details; the bar under the map shows the plan: way out, stay, way home and reserve against the 6-hour limit.
- **Planned stay:** the crew stays 0:15, 0:30, 1:00, 1:30 or as long as possible ("Max"). A stay longer than the max stay is capped. The max stay is life support (or daylight) left at arrival, minus the way home. The sketch assumes the crew keeps the plan: after the stay, the return starts on its own. There is no "Start return" button.
- **Start:** nothing moves until a station is picked and "Start route" is pressed. A station with no safe stay cannot be started.
- **Navigation, left (about 3/4):** the forearm tablet. The map is heading-up with the crew arrow fixed. Four hardware keys sit in the corners, also on keys `1` to `4`: 1 data (data and map swap places), 2 zoom in, 3 zoom out, 4 base map (orthophoto, slope, plain). Space pauses.
- **Return stages:** for every point the sketch asks: can the crew walk there from where they are now and still get home inside the 60-minute rule and before life support (or daylight) runs out? Green: yes, with 15+ min to spare. Yellow: under 15 min to spare. Red: no, so ABORT if the crew is there. The area shrinks as life support runs down and as the crew walks further out. The 15 min margin is a sketch assumption.
- **No Dijkstra in the return area:** the time-to-base grid comes from the routing engine the team is still building. Until then the sketch uses straight lines at walking speed: the area is a circle round the habitat cut by an ellipse through the crew position. "Time to base, straight line" in the data sheet is the same placeholder. The routes to the stations are still sketch routes from a Dijkstra on the synthetic grid; walk times, the max stay and the planned arrival follow those routes, so the straight-line stage can look more relaxed than the route.
- **Why the area stays large at first:** with 6 h of life support, the 60-minute rule is the tighter limit for most of the EVA. For testing, the planner can start the EVA clock at hour 3:00 or 4:30.
- **Navigation, top right:** helmet HUD. The compass rose turns with the heading (heading = walking direction). Base and target sit on the rim at their bearing and move inside once within 250 m. The ring takes the stage colour and word. Corners show EVA time, time to sunset, radiation dose and life support; up to three warnings sit below, including the countdown to the return.
- **Navigation, bottom right:** the data sheet, or the small map after key 1.
- **Data sheet:** one component for the tablet screen and the small panel. It never scrolls: the stage bar, two key tiles (target and the stay or the way home), the elevation profile of the current leg and nine values in a 3 × 3 grid. Type sizes follow the size of the panel (CSS container query units). On a small panel the source chips and captions go first, the End navigation button keeps only its icon, the profile shrinks to a strip and then goes, and only then the least important values (elevation, zone, slope, then the middle row).
- **Test terrain:** stronger relief than the console sketch (about 100 m range, routes up to about 7°), so slope and the elevation profile mean something.

URL parameters change the view only: `?grid=1`, `?base=slope`, `?ridges=1`, `?assume=1`, `?layers=1`. Navigation always starts from the button.

The yellow stage breaks DESIGN.md's rule that yellow is never a status colour. It is a separate amber (`#D9A300`), and every stage also carries its words.

**Colours and logo (navigation sketch only):** the page around the map takes its colours from the team logo: warm light paper (`#FCF9F5`, ground `#F2EBE3`) and Mars orange `#E8622C` for the brand (logo, switch, turn arrow, compass pointer; never a status). The map and the helmet HUD keep the field-book colours of the console sketch so they stay as readable as before. The logo is redrawn as a vector mark in the header (and as the favicon), so it stays sharp at any size.

**Info boxes and compass:** the map key on the planning map and the return-stage key on the tablet map are closed by default and open from an info button (click again, Escape or a click elsewhere closes them). The tablet compass shows an upright N with an orange pointer on the rim that points north.

The navigation sketch also breaks DESIGN.md's "square by default" rule on purpose: the team asked for a rounder look. Cards have a 14 to 18 px radius, buttons and tiles 10 to 12 px, the tablet bezel 34 px. Everything else in DESIGN.md still holds: no shadows, hairline borders, the pencil colours with one meaning each. The crew marker in the elevation profile is graphite now, because red stays for findings and ABORT.
