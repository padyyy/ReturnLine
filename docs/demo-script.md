# Demo script: six beats, one rehearsed EVA

Draft of 2026-11-14 for Alex and Patrick to check; Paul derives the Kanban issues from it. Story and rules: `mission-scenario.md`. Look, wording and every state on screen: `design/habitat-console-sketch.html` (console) and `design/navigation-hud-sketch.html` (target picker, cuff tablet, helmet HUD). Both use synthetic numbers, so none of them may be reused here. What the frontend reads: `../shared/data-contract.md`.

**Team decisions of 2026-11-14:**
- Every action is a click of habitat control. The crew displays (console skin, cuff skin, navigation view, helmet HUD) are read-only; the cuff's hardware keys (data, zoom, base map) only change the crew's own view.
- The demo starts only after habitat control has picked a target in the picker and pressed **Start**, as in the navigation sketch. The EVA goes habitat → target station → habitat.
- Where the navigation view and the HUD appear in the beats was left to this script (see "Crew view").

**Rule:** what is not in this script is not built. Every number on screen comes from a committed data file or is labeled as an assumption. Until the real files exist, the numbers below stay "from data".

## Before beat 1: picking the target

The console opens in planning. The right column shows the target picker: every station with walk time, distance, time back to base and max stay (life support or daylight left minus the way home; "cannot get home in time" when the station is more than 60 min from base). Picking one previews its route on the map. **Start** stays disabled until a station is picked. The scripted beats belong to the scenario station (data check 5); picking another station runs the navigation without scripted events.

## Beats

| # | Habitat control does | On screen | Crew view | Number shown | Comes from | Sim time | Subtitle (English, one line) |
|---|---|---|---|---|---|---|---|
| 1 Plan | picks the target, clicks **Start** | route to the target around all protected zones; return area equals the 60-minute line; verdict **GO**, four rules pass; Curiosity traverse with one comparison number | console skin: the five values | max time to shelter on the route; max 10 m slope; longest radio gap; home time vs. sunset; mean deviation (leave-one-out) and straight-line baseline | `routes.json`, `ttb_penalized`, `radio_check.json`, `scenario.json` (sunset), `curiosity_comparison.json` | EVA 0:00 | Habitat control picks the target and plans the Marswalk. The route avoids every protected drill site, and all four safety rules pass. |
| 2 Time jump | nothing (autopilot) | banner "Time jump → EVA hour 4:45"; crew at the target station; return area still on the 60-minute line | cuff tablet: heading-up map, target reached, max stay | life support left 1:15; time back to base; max stay | `routes.json`, `ttb_penalized`, `scenario.json` | jump to 4:45 | Time jump to EVA hour 4:45 at the station. The return area still matches the fixed 60-minute line. |
| 3 The area pulls away | clicks **Start return** when the max stay runs low | from EVA 5:00 the return area shrinks step by step along the terrain, the band to the 60-minute line turns pale; verdict **GO – 1 constraint** | helmet HUD: stage ring from green to amber, "Head home soon" | life support left (60 → about 45 min); return-area limit; max stay counting down | `ttb_penalized` × walking factor, life-support assumption | 4:45 → about 5:15, ×60 (about 30 s) | Life support now sets the limit. The return area shrinks along the terrain and pulls away from the 60-minute line. |
| 4 Deviation caught | clicks **Reroute** | crew drifts toward a drill-site zone; red ring on map and log ("Crew N m from Drill site X"); reroute drawn | helmet HUD: zone on the radar, warning "Protected zone N m" | distance to the zone edge; detour in minutes | drift path (scripted), `ptr_penalized` for the reroute | about 5:15 | The crew drifts toward a protected drill site. The console warns, and habitat control reroutes: N minutes extra. |
| 5 Crew member injured | — (planner recommends) | banner "Crew member injured · walking speed ×0.5 (assumption)"; area collapses in one frame; two candidate routes; verdict **ABORT** with "Confirm ABORT through Drill site X" | helmet HUD: red ring, "ABORT · return now" | protected route home, injured (must break the 60-minute rule or run past life support); route through the zone, injured (must fit) | `ttb_*` × 0.5, `ptr_*` from the injury point | injury time (see data checks) | A crew member is injured and walking speed halves. Only the way through the protected zone gets them home in time. |
| 6 Override, logged | clicks **Confirm ABORT** | crew walks the ABORT route home (autopilot ×240); log "Zone entered · Drill site X · N m · reason: ABORT" with red ring; summary card; slogan | cuff tablet: the ABORT route, "Return to shelter now", then "Home" | metres inside the zone; life support left at arrival; rules fired | `ttb_allowed`, `ptr_allowed`, `zones.geojson` | injury → arrival | Habitat control overrides on purpose. The zone entry is logged: safety first, and the record shows it. |

File names marked in code font are proposals until the grid spec in `../shared/` fixes them.

## Crew view

The console stays the main view, because every decision is habitat control's. The crew display panel (bottom left of the map) becomes the **crew view** with three read-only skins of the same data: console skin (five values), cuff tablet (heading-up map, data sheet with the elevation profile, four hardware keys) and helmet HUD (compass with base and target, stage ring, EVA time, sunset, dose, life support, warnings). During the demo the skin switches by itself as listed in the table, so each beat shows what the crew sees at that moment. A control above the panel lets the viewer pick a skin by hand or open the crew view full size in the navigation sketch's layout (tablet left, HUD and data sheet right); it changes only the view, never the EVA.

## Demo button timeline

About 85 seconds after Start, subtitles on every beat. Each beat waits for its last state change before the next one starts.

| Beat | Duration | Inside the beat |
|---|---|---|
| 1 | 8 s | picked route visible, Start press, GO confirmed |
| 2 | 6 s | jump banner, clock jumps, crew view switches to the cuff |
| 3 | 32 s | clock runs ×60; area steps once per sim minute, no easing; HUD turns amber; Start return press |
| 4 | 12 s | drift 3 s, warning and ring, Reroute press after 2 s, reroute drawn |
| 5 | 8 s | injury banner, collapse in one frame, recommendation, HUD red |
| 6 | 15 s | Confirm press after 2 s, walk home ×240, summary and slogan |

**30-second video:** beats 3, 5 and 6 (`mission-scenario.md`). Suggested cut: beat 3 at ×120 (about 12 s), beat 5 (6 s), beat 6 (12 s).

## Data checks the real grid must pass

The story is only true if the real data allow it. The sketch showed that a random layout usually does not; positions had to be tuned. Check these on the real grid before building beats 3 to 6, and pick the scenario station by them.

1. **Beat 1:** every point of the route to and from the target is at most 60 min from the habitat (zones penalized); 10 m slope at most 20°; no ridge crossing; home before sunset with reserve.
2. **Beat 2:** a stay until EVA 4:45 at the target fits (max stay at least until then); its time to base is below 60 min.
3. **Beat 3:** life support binds after 5:00 (6:00 EVA assumption), and the crew stays inside the shrinking area until the injury.
4. **Beat 4:** the return leg passes close to a drill-site zone, so a drift toward it is plausible.
5. **Beat 5, the key condition:** at the injury point P and time t, with life support left L = 360 − t minutes:
   - protected route, injured: 2 × T_penalized(P) > min(60, L), so it fails;
   - route through the zone, injured: 2 × T_allowed(P) ≤ min(60, L), so it fits.
   This needs a zone that blocks a real shortcut home, for example a gap in a ridge. Search the return leg for the point with the largest T_penalized − T_allowed and set t there.
6. **Beat 6:** metres inside the zone come from the zones-allowed path, not from a guess.

If check 5 fails for every station, the options in order: move the habitat, move the injury time, pick another drill site as the zone. Say on the project page which one was set by hand.

## Open

- Return stages in the HUD and on the cuff: exact rule (needs time-from grids) or the simple rule; see `../shared/data-contract.md`, decision 1.
- Navigation sketch: the return area does not shrink yet (Alex).
- Habitat coordinate (needed for all grids).
- EVA start time in local solar time, and the sol shown (must lie in the future).
- Zone buffer radius and slope penalty: labeled assumptions, values set by the team.
- Which file names the grid spec fixes.
