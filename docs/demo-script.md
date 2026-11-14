# Demo script: six beats, one rehearsed EVA

Draft of 2026-11-14 for Alex and Patrick to check; Paul derives the Kanban issues from it. Story and rules: `mission-scenario.md`. Look, wording and every state on screen: `design/habitat-console-sketch.html` (synthetic numbers, so none of them may be reused here).

**Team decisions of 2026-11-14:** every action is a click of habitat control; the crew displays (console skin, cuff skin, navigation view, helmet HUD) are read-only and are built. Where navigation view and HUD appear in the beats is still to place (see Open).

**Rule:** what is not in this script is not built. Every number on screen comes from a committed data file or is labeled as an assumption. Until the real files exist, the numbers below stay "from data".

## Beats

| # | Habitat control does | On screen | Number shown | Comes from | Sim time | Subtitle (English, one line) |
|---|---|---|---|---|---|---|
| 1 Plan | clicks **Confirm GO** | route around all protected zones; return area equals the 60-minute line; verdict **GO**, four rules pass; Curiosity traverse with one comparison number | max time to shelter on the route; max 10 m slope; longest radio gap; home time vs. sunset; mean deviation (leave-one-out) and straight-line baseline | `routes.geojson`, time-to-base grid (zones penalized), slope grid, `radio_check.json`, `rems_sunset.json`, `curiosity_comparison.json` | EVA 0:00 | Habitat control plans the Marswalk. The route avoids every protected drill site, and all four safety rules pass. |
| 2 Time jump | nothing (autopilot) | banner "Time jump → EVA hour 4:45"; stations 1–3 done; crew at the last station; return area still on the 60-minute line | life support left 1:15; time to base from the station | schedule (`routes.geojson` leg times plus dwell times), grid | jump to 4:45 | Time jump to EVA hour 4:45 at the last station. The return area still matches the fixed 60-minute line. |
| 3 The area pulls away | nothing | crew heads home; from EVA 5:00 the return area shrinks step by step along the terrain, the band to the 60-minute line turns pale; verdict **GO – 1 constraint** | life support left (60 → about 45 min); return-area limit in minutes | grid (zones penalized) × walking factor, life-support assumption | 4:45 → about 5:15, ×60 (about 30 s) | Life support now sets the limit. The return area shrinks along the terrain and pulls away from the 60-minute line. |
| 4 Deviation caught | clicks **Reroute** | crew drifts toward a drill-site zone; red ring on map and log ("Crew N m from Drill site X"); reroute drawn | distance to the zone edge; detour in minutes | drift path (scripted), grid return pointers for the reroute | about 5:15 | The crew drifts toward a protected drill site. The console warns, and habitat control reroutes: N minutes extra. |
| 5 Crew member injured | — (planner recommends) | banner "Crew member injured · walking speed ×0.5 (assumption)"; area collapses in one frame; two candidate routes; verdict **ABORT** with "Confirm ABORT through Drill site X" | protected route home, injured (must break the 60-minute rule or run past life support); route through the zone, injured (must fit) | both grid variants × 0.5, return pointers from the injury point | injury time (see data checks) | A crew member is injured and walking speed halves. Only the way through the protected zone gets them home in time. |
| 6 Override, logged | clicks **Confirm ABORT** | crew walks the ABORT route home (autopilot ×240); log "Zone entered · Drill site X · N m · reason: ABORT" with red ring; summary card; slogan | metres inside the zone; life support left at arrival; rules fired; stations completed | zones-allowed grid and pointers, `zones.geojson` | injury → arrival | Habitat control overrides on purpose. The zone entry is logged: safety first, and the record shows it. |

File names marked in code font are proposals until the grid spec in `../shared/` fixes them.

## Demo button timeline

About 80 seconds, one click, subtitles on every beat. Each beat waits for its last state change before the next one starts.

| Beat | Duration | Inside the beat |
|---|---|---|
| 1 | 8 s | plan visible 3 s, button press, GO confirmed |
| 2 | 6 s | jump banner, clock jumps |
| 3 | 30 s | clock runs ×60; area steps once per sim minute, no easing |
| 4 | 12 s | drift 3 s, warning and ring, Reroute press after 2 s, reroute drawn |
| 5 | 8 s | injury banner, collapse in one frame, recommendation |
| 6 | 15 s | Confirm press after 2 s, walk home ×240, summary and slogan |

**30-second video:** beats 3, 5 and 6 (`mission-scenario.md`). Suggested cut: beat 3 at ×120 (about 12 s), beat 5 (6 s), beat 6 (12 s).

## Data checks the real grid must pass

The story is only true if the real data allow it. The sketch showed that a random layout usually does not; positions had to be tuned. Check these on the real grid before building beats 3 to 6.

1. **Beat 1:** every point of the planned route is at most 60 min from the habitat (zones penalized); 10 m slope at most 20°; no ridge crossing; home before sunset with reserve.
2. **Beat 2:** the crew is at the last station at EVA 4:45, and its time to base is below 60 min.
3. **Beat 3:** life support binds after 5:00 (6:00 EVA assumption), and the crew stays inside the shrinking area until the injury.
4. **Beat 4:** the return leg passes close to a drill-site zone, so a drift toward it is plausible.
5. **Beat 5, the key condition:** at the injury point P and time t, with life support left L = 360 − t minutes:
   - protected route, injured: 2 × T_penalized(P) > min(60, L), so it fails;
   - route through the zone, injured: 2 × T_allowed(P) ≤ min(60, L), so it fits.
   This needs a zone that blocks a real shortcut home, for example a gap in a ridge. Search the return leg for the point with the largest T_penalized − T_allowed and set t there.
6. **Beat 6:** metres inside the zone come from the zones-allowed path, not from a guess.

If check 5 fails on the real terrain, the options in order: move the habitat, move the injury time, pick another drill site as the zone. Say on the project page which one was set by hand.

## Open

- Place the navigation view and the helmet HUD in the beats, for example as a "Crew view" panel mirroring what the crew sees while habitat control acts in the console. Starting the route (beat 1) and the return (beat 3) become habitat-control clicks.
- Navigation sketch: the return area does not shrink yet (Alex).
- Habitat coordinate (needed for all grids).
- EVA start time in local solar time, and the sol shown (must lie in the future).
- Zone buffer radius and slope penalty: labeled assumptions, values set by the team.
- Which file names the grid spec fixes.
