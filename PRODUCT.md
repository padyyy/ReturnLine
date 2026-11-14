# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Static web app with Vite and Leaflet 1.9.4, no UI framework, pinned and bundled. JavaScript or TypeScript is the tech lead's call at kickoff.
- Static build hosted on GitHub Pages. No backend.
- Map data is produced ahead of time and shipped as static files:
  - an offline Python pipeline (numpy, scikit-image, tifffile or rasterio) crops the data and computes slope, the ridge mask and the overlays,
  - an offline C# routing engine (Dijkstra from the habitat) computes the time-to-base grid with return pointers, the routes between the stops and the comparison with Curiosity. Fallback: scikit-image's `MCP_Geometric` in Python.
- Images are for display only. Numbers the app computes with come as GeoJSON, JSON or a raw binary grid. The grid layout is fixed in a one-page grid spec at kickoff.
- The browser never computes a route. It looks up precomputed values.
- The map runs in plain longitude and latitude using Leaflet's EPSG:4326 CRS with the Mars radius of 3,396,190 m. Only `map.distance()` and the scale bar use the Mars radius. `latlng.distanceTo()` and `L.circle` still use Earth's radius and must not be used.

## Users

- **Primary: the crew of a first human Mars mission**, planning and carrying out one Marswalk (EVA). NASA's concept for Mars EVAs has a pair of astronauts on the surface, directed by an intravehicular (IV) crew member in the habitat.
  - **Habitat control (the IV crew member):** at a large screen before and during the EVA. Checks the route against the safety rules, watches the timeline and decides GO, TERMINATE or ABORT. Every action in the demo is a decision of this person. This is the main user. On screen the role is called "Habitat control", not "IV".
  - **The two crew members on the surface:** they wear pressurized suits with thick gloves. NASA found touch screens poorly suited to suit gloves and plans cuff displays, head-up displays and voice. The product shows what they see as a read-only crew display inside the console. A forearm cuff skin of the same display comes after feature freeze.
- **Secondary: the NASA Space Apps 2026 judges.** At Heilbronn they see a live pitch, the project page, a 30-second video and a public demo link. Global judges never see us live, so page, video and demo must work without anyone narrating. They score on Impact, Creativity, Validity, Relevance and Presentation.

## Product Purpose

ReturnLine plans one EVA to the boxwork ridges at Mount Sharp in Gale crater and rehearses it. It answers, for every 10 m of the site, whether the crew can still get home in time, and what they give up when they cannot.

It weighs three goals in a fixed order, not with weights:
1. **Crew safety:** four hard rules that can each say NO-GO.
2. **Planetary protection:** protected zones around sensitive science sites are avoided while safety allows. Every entry is shown and logged.
3. **Science:** 4–5 stops along Curiosity's traverse that tell the story of Mars' groundwater.

Success for the hackathon: a submitted demo, video and project page by the Heilbronn deadline, Sunday 2026-11-15 at 15:45.

## Positioning

- **The return area is the hero.** A terrain-shaped area that shows where the crew can still get home from, and visibly shrinks as time runs out. Rivals show a route and a GO/NO-GO verdict; at least one already has rover photos per stop and solar storm data.
- **Planetary protection as a real constraint.** Astronauts carry Earth microbes. A step over a drill site can contaminate it or fake a discovery. No rival we found plans around this.
- **The priority order in one moment.** When a crew member is injured, the only way home in time crosses a protected zone. Habitat control overrides, and the entry is logged. Safety beats protection, and the record shows it.
- **Safety that follows NASA's own EVA rules.** An incapacitated crew member must reach a safe haven within 60 minutes. Slope against the suit's 20° design limit, radio gaps and daylight complete the four rules.
- **Honest about Curiosity.** The route is *compared with* Curiosity's drives with a leave-one-out test, never called "validated".
- **Every number carries its source.** Assumptions are labeled and adjustable.

## Operating Context

- Built during the NASA Space Apps Challenge, from 2026-11-14 at 09:00 local time. The 2026 FAQ forbids working on the challenge before that. Research, documentation and data scouting before kickoff are fine.
- The product is built in this repo, ReturnLine, from kickoff on. The pre-kickoff research of both halves of the team sits in `docs/preparation/` as a record. No code, design or number from before kickoff goes into the product; every number shown is recomputed at the event.
- The full plan, data catalog and schedule live in `docs/preparation/preparations.md`. The team's German decision papers are `docs/preparation/konzeptabgleich-returnline.md` and `docs/preparation/council-urteil-prototyp.md`, the German kickoff checklist is `docs/preparation/checkliste-kickoff.md`.
- Event: the Heilbronn local event. Hacking runs from Saturday 10:30 to the final submission deadline on Sunday at 15:45, about 19–20 hours.
- Submission: a video of at most 30 seconds with English subtitles, a public demo link, the repo and a project page that states our prior research and our AI use.
- The team (since 2026-11-13): five people, roles in `CLAUDE.md`. The concept combines TheMartians with the new team's "ReturnLine × PRISTINE".
- **The demo is a scripted EVA rehearsal, not a game.** A demo button plays a fixed six-beat scenario from precomputed data, with subtitles per beat. There is no free steering of the astronaut and no score.
- The demo runs offline from static files: no CDN, no web fonts from Google, no hotlinked images.

## Capabilities and Constraints

**Must-have:**
- Map with the orthophoto, the protected zones and the stops.
- Time-to-base grid with return pointers, in two variants: zones penalized and zones allowed.
- Return area = the tightest of three limits: 60 minutes to shelter, remaining life support, sunset. Walking speed enters as a factor.
- Autopilot along the route with time compression and a labeled time jump.
- Crew display with five values, verdict panel and station log.
- Event "crew member injured" with a logged ABORT override.
- Demo button with subtitles per beat.
- Comparison with Curiosity (leave-one-out) and a radio check along the route.

**After feature freeze, in this order:** cuff skin of the crew display; a "what if" click for habitat control; solar storm event (SEP WATCH and SEP ALERT); footprint trail; rover photo as a preview in the log; one spoken warning.

**Cut:** HUD over a rover photo (the photo shows the rover's position, not the crew's); free steering of the astronaut; route computation in the browser; a full viewshed; the word "validated". Also out of scope: 3D globe, backend, machine learning, login, a per-EVA dose limit, sand detection from THEMIS.

**The four rules:** time to shelter at most 60 minutes, 10 m slope at most 20° and no ridge crossing, longest radio gap at most 5 minutes, return before sunset. Verdict states: GO, GO with constraints, NO-GO with the first violated rule, NO DATA.

**Labeled assumptions:** walking speed 1.5 km/h on level ground; a named slope penalty (Tobler-type, scaled to 1.5 km/h) with one ±30 % sensitivity check; walking speed halved for an injured crew member; buffer radius of the protected zones; EVA duration 6 ± 2 h plus 1 h backup.

**Terminology:** EVA, Marswalk, sol, habitat control, crew display, science stop, time to base, safe haven, return area, turnaround point, protected zone, override, constraint, TERMINATE ("Head home now"), ABORT ("Return to shelter now"), boxwork.

**Decided on 2026-11-13** (details in `docs/preparation/council-urteil-prototyp.md`):
- Name "ReturnLine", slogan "Explore Mars. Return Safely. Preserve the Evidence."
- Priority order: crew safety → planetary protection → science.
- Site: Gale crater, boxwork region.
- One crew display component with two skins, no HUD over photos.
- The six-beat demo script in `docs/preparation/preparations.md`, built first; anything not in the script is not built.

**Undecided:** JavaScript or TypeScript; the exact slope penalty function and the zone buffer radius (both labeled assumptions, set at kickoff).

## Brand Commitments

- **Product name:** ReturnLine. Slogan: "Explore Mars. Return Safely. Preserve the Evidence."
- **Team name:** Houston, we have a map. **Repo:** ReturnLine. Patrick's former prep repo was called TheMartians.
- **Interface language:** English, in plain words: "Solar storm warning", "Head home now".
- **No NASA insignia:** The product must not use NASA logos or imply NASA endorsement. This is an external rule.

## Evidence on Hand

- **Real data sources:** listed with links and status in `docs/preparation/preparations.md`.
  - USGS Gale DEM at 1 m, orthophoto at 25 cm, colour HiRISE mosaic
  - THEMIS thermal inertia tile 30S120E
  - CRISM footprints FRT000058A3 and FRT0000B6F1 at 18 m, HRL0000BABA at 36 m
  - Curiosity traverse and waypoints up to sol 5045
  - Curiosity raw images by sol
  - REMS weather with sunrise and sunset up to 2026-08-25
  - RAD data for the boxwork campaign at PDS PPI
- **Radiation:** Hassler et al. 2014 report 0.64 ± 0.12 mSv per day dose equivalent at the surface in Gale, measured 2012–13 about 13 km from the boxwork. Use 0.64. The SwRI press release says 0.67. Dose is information only.
- **EVA rules and parameters:** NASA's xEVA concept of operations, Apollo planning documents and suited walking tests give the 60-minute safe-haven rule, the 20° slope limit, walking speed, EVA duration and the 5-minute radio-gap rule. Citations are in `docs/preparation/preparations.md`.
- **Planetary protection:** COSPAR guidelines for human missions to Mars and NASA NID 8715.129 (2020). Not yet checked against the primary texts.
- **Absences:** There is no user testing with astronauts and no endorsement by NASA or anyone else. Future work must not invent either.

## Product Principles

1. **Safety reasons out loud.** Every warning, blocked area, override and turnaround point shows why it exists and where the number comes from.
2. **The verdict must be able to say no.** A rule that can never fire does not belong in the verdict.
3. **A fixed order, not weights.** Safety, then planetary protection, then science. No score trades one against another.
4. **One walk, done deeply.** Hyperlocal detail beats planetary coverage.
5. **Measured data and assumptions stay apart.** Measured values carry their source. Assumptions are labeled and adjustable.
6. **Works without a network.** Everything the demo needs ships as static files.

## Accessibility & Inclusion

- **Suit gloves:** nothing for the surface crew depends on touch, hover, dragging or small gestures. The crew display is read-only.
- **Readable at a glance:** the console must show the verdict and the first violated rule from across a room.
- **Color is never the only signal:** hazard, slope and zone markings must be readable without telling colors apart. Warnings also carry text or shape.
- **Language:** English throughout, matching the international judges and the subtitled video. Plain words instead of jargon.
