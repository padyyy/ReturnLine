---
version: 1
slug: "docs-design-habitat-console-sketch-html"
primary_target: "docs/design/habitat-console-sketch.html"
related_targets: ["frontend/index.html"]
---

# Surface brief: habitat console (design sketch)

- **Scope:** one page, the habitat console with the read-only crew display inside. This sketch (`docs/design/habitat-console-sketch.html`) is the design reference for the real build in `frontend/`. Mode: **Operate**. Code-led.
- **Audience and job:** habitat control decides GO, TERMINATE or ABORT at a large screen; judges watch the scripted six-beat rehearsal without narration (pitch projector, 30 s video, public link).
- **Proof and content:** terrain, routes and all numbers in the sketch are synthetic and labeled so. Product truth: `PRODUCT.md`; visual direction: `docs/preparation/design-brief.md`; script: `docs/mission-scenario.md`.
- **Constraints:** offline, self-hosted fonts, English plain words, colour never the only signal, no NASA insignia, never "validated".
- **Confirmed 2026-11-14:** all six beats steppable via the demo button; crew display with a cuff-skin toggle; synthetic terrain, marked as placeholder.
- **Unresolved:** real habitat coordinate, stop names, zone buffer radius and slope penalty (set at kickoff); whether Leaflet's default controls get restyled or replaced.
- **Seed record:** on 2026-11-14 `concept-seed --check-seed` no longer finds seed:6791a440c24cc0ca on this machine (rolled 2026-11-09 in the TheMartians shaping session). The reference is corroborated only by `docs/preparation/design-brief.md`. Asked on 2026-11-14, the user decided that the design brief stays the authority for the direction; no re-roll.

## Direction contract

**THESIS:** The console owns one question, "can the crew still get home from here?", answered by a terrain-shaped return area that visibly pulls away from a fixed 60-minute line, with every finding ringed in red pencil on the map and in the log at once. It refuses the category default: a dark mission-control dashboard of KPI tiles with a route and a GO badge.

**OWN-WORLD:** Field Book. Cover-yellow #E3B21B header band, green-tinted survey paper #EDF0E6 ground, graphite #2B2D2F text and route, red pencil #C8361F findings and ABORT, blue pencil #2459A8 stations and hatched protected zones, dark green #1F6B45 GO and the return area. Atkinson Hyperlegible Next for text; Atkinson Hyperlegible Mono for every measurement, right-aligned in one number column. Graphite hairlines, square corners, no shadows, no paper texture, no handwriting.

**STORY:** Habitat control sees the plan pass all four rules, jumps to EVA hour 4:45, watches life support pull the area off the 60-minute line, catches a drift toward a drill site, and after the injury confirms an ABORT through the zone. The entry is logged and ringed; the summary counts metres inside zones. A judge follows it from six subtitles alone.

**FIRST VIEWPORT (1920×1080):** yellow header band, 56 px: ReturnLine, EVA, site, sol, LMST clock, grid toggle, layers, assumptions, Play demo. Left two thirds: the map (orthophoto, return area, dashed 60-minute line, hatched zones, graphite route, Curiosity traverse), crew display inset bottom left, subtitle strip across the map foot. Right third: verdict at poster scale under "Planner recommendation · decision: Habitat control" with the decision button, then the four rules (value, limit, source), then the station log. Under the map: the time budget, outbound plus return against the 6:00 EVA limit, with sim clock and ×60.

**FORM:** Field Book, pinned by the design brief (confirmed 2026-11-09), first on the original ordered list. Signature interaction: the red ring draws itself around a finding on map and log together; selecting either highlights both; instant under reduced motion. The return area steps with the sim clock, no easing. seed:6791a440c24cc0ca

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
