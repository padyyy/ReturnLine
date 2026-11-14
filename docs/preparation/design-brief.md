# Design brief: habitat console and crew display

Confirmed by Patrick on 2026-11-09 via `/impeccable shape`. Updated on 2026-11-12 after the review in `docs/preparation/preparations.md`, and on 2026-11-13 after the concept merge with "ReturnLine × PRISTINE" and the council verdict in `docs/preparation/council-urteil-prototyp.md`. The visual direction did not change. Product truth lives in `PRODUCT.md`.

The sketch `docs/design/planning-view-sketch.html` (in `TheMartians`) shows the chosen arrangement, palette, type and density of the planning view. Its content is synthetic and partly wrong, and it is superseded by this brief:
- The verdict "GO with 2 conditions" lists only one condition.
- The return at 14:33 comes after the 14:00 storm cut-off, yet the reserve is ticked.
- The storm cut-off is derived from a CME arrival, which is physically wrong (see `docs/preparation/preparations.md`).
- The dose row checks a limit with no NASA basis that can never fail.
- The slope legend blocks only above 25°; the suit design limit is 20°.
- The EVA is dated Sol 5052, which is already in the past.
- It has no protected zones, no return area and no crew display.

The sketch stays in Patrick's private prep repo `TheMartians` and is not part of this repo. At the event, the screens are built fresh from this brief; the sketch's HTML is not copied.

The direction contract is not written yet. It goes into the surface brief at kickoff on 2026-11-14, before any code. It needs the seed reference `seed:6791a440c24cc0ca`.

## 1. Job and audience

- **Habitat control:** the IV crew member directs a pair of astronauts on the surface. At a large screen they read the planner's recommendation and decide GO, TERMINATE or ABORT. This is the main view. Every action in the demo is a click of this person.
- **The crew on the surface:** shown as a read-only crew display inside the console, with the five values they would see. A forearm cuff skin of the same display comes after feature freeze. No HUD over rover photos, and no touch input for gloved hands.
- **Mode:** a working tool and a rehearsal of one EVA. The judges see it in the live pitch, the video and the demo link. Global judges see it without narration, so the screen has to explain itself.

## 2. Outcome and proof

- **Primary task:** Can the crew still get home from here, under which constraints, and what would make us turn back?
- **Success:** one look shows the verdict, the first violated rule or the constraints, the return area and where each finding sits on the map. Every number leads to its source.
- **Proof:** real data on slope, ridges, time to shelter, sunset and radiation. Protected zones sit on real Curiosity drill sites. Curiosity's drives serve as an honest comparison, never as "validation". Assumptions and synthetic values are labeled as such.

## 3. Direction: Field Book

The visual world comes from geologists' all-weather field books and their station logs. It lends type, palette, density and one signature move. Layout and controls stay standard web components.

- **Palette:**
  - field-book cover yellow `#E3B21B` for the header band
  - green-tinted survey paper `#EDF0E6` as the ground, which reduces glare
  - graphite `#2B2D2F` for text
  - red pencil `#C8361F` for findings
  - blue pencil `#2459A8` for science stations
  - dark green `#1F6B45` for Go
- **Type:** Atkinson Hyperlegible Next for text. Atkinson Hyperlegible Mono with tabular figures for measurements. Both self-hosted, so the demo works offline.
- **Signature move:** a red-pencil ring marks each finding in the station log and at the same spot on the map. Selecting one highlights the other. A logged zone entry is a finding and gets the ring.
- **New map elements, to confirm in the direction contract:**
  - **Return area:** dark green outline with a light tint. The fixed 60-minute line stays as a graphite dashed line, so the shrinking area can be seen pulling away from it.
  - **Protected zones:** blue-pencil hatching with a text label ("Drill site · protected"). Hatching plus label, so color is not the only signal.
  - **Route:** graphite line; the ABORT route through a zone in red pencil.
- **Raises from the declined challengers:**
  - All measurements sit in one tabular number column with aligned decimals and no decoration.
  - Every station carries the same fixed furniture: number, name, one-line reason, measurement, ground image.
  - The verdict is set at poster scale. The type scale runs from caption to poster with no middle step.
  - The 100 m survey grid is a real toggle, and the 10 m terrain cells align to it.
  - Outbound and return are two timed halves summed against the EVA limit, so an overflow cannot be missed.
- **Banned:** ruled paper, handwriting fonts, any paper look worn as a costume.

## 4. Scope and boundaries

- **Views:** one page, the habitat console. It contains the crew display. The cuff skin is the first item after feature freeze.
- **Fidelity:** finished screens at MVP scope.
- **Anti-goals:** sci-fi costume, game look (no score, no free steering), generic dashboard, hiking app, data graveyard.
- **Untouchable:** the product facts in `PRODUCT.md`. No NASA insignia.

## 5. States and ranges

- **Verdict,** labeled "Planner recommendation · decision: Habitat control":
  - GO
  - GO – n CONSTRAINTS, each written as trigger → action, for example "Leave Stn 5 by 13:00"
  - NO-GO – the first violated rule first
  - NO DATA – the missing input named
- **The four rules** shown in the log, each with value, limit and source: time to shelter ≤ 60 min, 10 m slope ≤ 20° with no ridge crossing, longest radio gap ≤ 5 min, return before sunset.
- **Override:** "Zone entered · Drill site X · 140 m · reason: ABORT". Logged with time and reason, ringed in red pencil, and repeated in the end summary.
- **Radiation** is a plain information row in the console: the accumulated EVA dose with its source. It never decides the verdict and does not take a slot in the crew display.
- **Solar storms (after feature freeze):** SEP WATCH adds a constraint; SEP ALERT triggers TERMINATE.
- **Missing data:** a gap shows as "not available" and is never hidden.
- **Ranges:** 3–8 findings, 4–5 stations, a route of 2–6 km, all points inside the 60-minute return area.
- **Crew display states:** ON PLAN ± minutes, TURNAROUND DUE, TERMINATE ("Head home now"), ABORT ("Return to shelter now"). TERMINATE and ABORT fill the display with a clear turn-back instruction.
- **Data age:** the weather shows its last reading, sol 4995.

## 6. Interaction and layout

- **Habitat console:**
  - header band with EVA, site, sol and local time, the grid toggle, the layers menu and the demo button
  - the map on the left, with the return area, the 60-minute line, the protected zones, the route and Curiosity's traverse
  - the station log on the right, with the verdict on top
  - the crew display as an inset on the map
  - the time budget below the map, with the simulation clock and time compression
- **Crew display, five values:** next target (distance and minutes), time to base, reserve to the turnaround point, life support remaining (labeled assumption), time to sunset.
- **Layers:** base and 10 m slope plus at most one science layer at a time. The ridge mask, the return area and the protected zones are always available.
- **Assumptions:** slope limits, walking speed, slope penalty, injury factor, zone buffer and EVA duration sit as sliders in a side panel, each with its source or the label "assumption".
- **Demo button:** plays the six-beat script from `docs/preparation/preparations.md`. Each beat shows a one-line English subtitle, so the demo explains itself in the video and on the public link. A time jump is always labeled ("EVA hour 4:45").
- **Comparison with Curiosity:** Curiosity's traverse as a thin line with one number, the mean deviation of our routes in the leave-one-out test, next to the straight-line baseline.
- **Motion:** the red ring draws itself on selection. The return area changes with the simulation clock, step by step, without decorative easing. With reduced motion the ring appears instantly.

## 7. Constraints and open decisions

- **Constraints:** Leaflet in degrees with the Mars radius, distances only through `map.distance()`, static, offline, English interface in plain words. Color is never the only signal: tick, ring and hatching always come with text.
- **Open:**
  - whether the Mono face loads; otherwise tabular figures
  - the exact look of the return area and the zones, fixed in the direction contract at kickoff
