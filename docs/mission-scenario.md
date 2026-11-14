# Mission scenario

What ReturnLine shows and how the demo runs. Agreed by the team on 2026-11-13 (concept merge and council verdict). Full background: `docs/preparation/preparations.md` and the German decision papers `docs/preparation/konzeptabgleich-returnline.md` and `docs/preparation/council-urteil-prototyp.md` (also as PDFs).

**ReturnLine** – "Explore Mars. Return Safely. Preserve the Evidence."

## The mission

A crew of a first human Mars mission walks one EVA (Marswalk) from the habitat to the boxwork ridges at Mount Sharp in Gale crater. Two astronauts are on the surface. **Habitat control** (the intravehicular crew member) directs them from a large screen and decides GO, TERMINATE or ABORT. Every action in the demo is a decision of this person.

## Priority order, not weights

1. **Crew safety:** four hard rules, each can say NO-GO.
2. **Planetary protection:** protected zones around Curiosity's drill sites are avoided while safety allows. Every entry is shown and logged.
3. **Science:** 4–5 stops along Curiosity's traverse that tell the story of Mars' groundwater.

## The four safety rules

1. Time to shelter at most 60 minutes from every point of the route (NASA safe-haven rule).
2. Slope at a 10 m baseline at most 20° (suit design limit), and no crossing of the 1 m ridge mask.
3. Longest radio gap at most 5 minutes, checked along the route by sampling the DEM profile to the habitat.
4. Daylight: the return is finished before sunset (REMS sunrise and sunset).

Verdict: "Planner recommendation · decision: Habitat control" with GO, GO with constraints, NO-GO with the first violated rule, or NO DATA.

Radiation is shown as information (0.64 mSv/day, Hassler et al. 2014), never as a gate.

## The return area

For every 10 m cell: the walking time back to the habitat. The return area is the tightest of three limits: 60 minutes to shelter, remaining life support, sunset. The fixed 60-minute line stays visible beside it. With 6 ± 2 h life support the area only moves late in the EVA, so the demo jumps to EVA hour 4:45.

## Demo script (six beats)

A demo button plays these beats from precomputed data, each with a one-line English subtitle. No free steering, no score. **Anything not in the script is not built.**

1. **Plan.** "Plan route" shows a route around the protected zones, all four rules green: GO. Curiosity's traverse is shown with one number, the deviation in the leave-one-out comparison.
2. **Time jump.** Autopilot at x60, labeled jump to EVA hour 4:45 at stop 4. The return area still sits on the 60-minute line.
3. **The area pulls away.** Life support binds. The area shrinks along the terrain, about 30 seconds at x60. Alternative: sunset binds.
4. **Deviation caught.** The crew drifts toward a drill-site zone. The console warns, habitat control reroutes and sees the detour in minutes.
5. **Crew member injured.** Walking speed halves (labeled assumption, one factor on the grid). The area collapses. Only the route through the zone fits. Verdict: ABORT.
6. **Deliberate override, logged.** Habitat control confirms. Log: "Zone entered · Drill site X · 140 m · reason: ABORT". The crew gets home; summary with meters inside zones and rules fired; slogan.

The 30-second video uses beats 3, 5 and 6.

**Per-beat script (to write first, Alex and Patrick):** one page; for each beat what is on screen, which number is shown, which file it comes from, which simulation time applies, and the English subtitle. Paul derives the Kanban issues from it. Draft of 2026-11-14: `demo-script.md` (next to this file), including the data checks the real grid must pass.

## Pitch

- The story belongs to the crew, the decisions to habitat control.
- Open on the crew and the shrinking return area: "This team can tell, for every 10 m of Gale, whether two astronauts can still get home, and what they give up when they can't."
- Second sentence: "Whoever sees this sits in the habitat and decides."
- Protected zones in one sentence: "Astronauts carry Earth microbes. A step over a drill site can contaminate it or fake a discovery." Gale hook: Curiosity measured organic molecules and methane here.
- On screen and in the pitch: plain words ("Head home now", "Return to shelter now"), "Habitat control" instead of "IV", "compared with Curiosity", never "validated".

## Crew display

Read-only inset in the console, five values: next target, time to base, reserve to the turnaround point, life support remaining (labeled assumption), time to sunset. The accumulated radiation dose is shown in the console, not in the crew display. No touch input, no HUD over rover photos.

**Team decisions of 2026-11-14:**
- Every action is controlled from the habitat only. Starting a route, rerouting, starting the return and every GO, TERMINATE or ABORT is a click of habitat control; the crew displays stay read-only.
- The forearm cuff skin is a fixed feature, no longer after feature freeze.
- Built as well: a navigation view (the forearm tablet: heading-up map, data sheet with the elevation profile, four hardware keys) and a helmet HUD (compass with base and target at their bearing, return-stage colour and word, EVA time, time to sunset, dose, life support, up to three warnings). Draft: `design/navigation-hud-sketch.html` (Alex, branch `navigation-view-/-hud`).
- The amber return stage (`#D9A300`, under 15 min to spare) stays for now, although DESIGN.md keeps yellow out of status colours. Revisit if time allows.
- The cuff's hardware keys (data, zoom, base map) only change the crew's own view.
- The demo starts only after habitat control picks a target in the picker and presses Start (as in the navigation sketch); the EVA goes habitat → target station → habitat. Where navigation view and HUD appear per beat: `demo-script.md`.
- Open: in the navigation draft the return area does not shrink yet.

## Operating area

| | Value |
|---|---|
| Boxwork campaign | Sol 4590 to 4840 (July 2025 to March 2026) |
| Longitude | 137.379° to 137.383° East |
| Latitude | 4.810° to 4.802° South |
| Elevation | −3645 m to −3598 m |
| Map extent | 137.34° to 137.42° East, 4.77° to 4.85° South, about 4.7 × 4.7 km |

Any sol shown for the crewed EVA must lie in the future (Curiosity was past sol 5045 on 2026-11-08).

## Labeled assumptions (set at kickoff)

- Walking speed 1.5 km/h on level ground.
- Slope penalty: Tobler-type function scaled to 1.5 km/h, with one ±30 % sensitivity check.
- Injury factor 0.5 on walking speed.
- Buffer radius of the protected zones (slider).
- EVA duration 6 ± 2 h plus 1 h backup.

## Must-have, after freeze, cut

**Must-have:** map with orthophoto, zones and stops; time-to-base grid with return pointers in two variants; return area; autopilot with labeled time jump; crew display with console and cuff skins, navigation view and helmet HUD (decided 2026-11-14), verdict panel, station log; injury event with logged ABORT override; demo button with subtitles; Curiosity comparison and radio check along the route.

**After feature freeze, in order:** "what if" click; solar storm event (SEP WATCH, SEP ALERT); footprint trail; rover photo preview in the log; one spoken warning.

**Cut:** HUD over rover photos (the photo shows the rover's position, not the crew's), free steering, route computation in the browser, full viewshed, the word "validated" (always "compared with Curiosity"), debrief export and replay (the end summary is the debrief). From the original ReturnLine × PRISTINE concept: weighted "smart" optimization, dynamic replanning, radiation models, a computed "science value" score.

## Open checks

- **Stops vs. ridge rule (first data check on Saturday, Magnus and Michael):** stops among the ridges may be unreachable under "no ridge crossing". If so, place the stop at the foot of the ridge and say so. If the ridge mask costs more than an hour, fold it into the 20° rule and say that too.
- **Habitat and rover position:** fixed as a coordinate at kickoff; the Dijkstra starts there.
- **Planetary protection sources:** COSPAR guidelines for human missions and NASA NID 8715.129 come from general knowledge so far. Check against the primary texts before the pitch. The same applies to any mention of Jezero's "Cheyava Falls".
- **Scouting numbers** (slope errors, THEMIS range, RAD campaign dose) are recomputed in committed code before anyone shows them.

## Milestones (Heilbronn)

| When | Milestone |
|---|---|
| Sat 14:00 | The dot moves across the real orthophoto. |
| Sat 18:00 | Deployed on GitHub Pages; grid there, or switch to the `MCP_Geometric` fallback. |
| Sat 22:30 | Feature freeze: all six beats on real data. |
| Sun 11:00 | Hard freeze, bug fixes only. |
| Sun 13:00 | Video recorded. |
| Sun 14:30 | Everything submitted (checkpoint). |
| Sun 15:45 | Final deadline. Live pitch from 16:00. |
