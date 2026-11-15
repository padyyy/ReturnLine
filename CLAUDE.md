# ReturnLine

Team "Houston, we have a map" at the NASA Space Apps Challenge 2026, challenge "Interplanetary Survival Guide: Martian Map". Hackathon 2026-11-14 to 2026-11-15, judging from 2026-11-16. This is the build repo of the team.

## Start here

- **Team rules for every AI agent are in `AGENTS.md`** (and the module `AGENTS.md` files). Read them first. Git workflow: `docs/git-workflow.md`; sprints: `docs/SCRUM.md`; roles: `docs/roles.md`.
- Working docs for the build: `docs/architecture.md`, `docs/mission-scenario.md` (demo script, rules, operating area), `docs/data-sources.md`.
- Product truth lives in `PRODUCT.md`. The design brief lives in `docs/preparation/design-brief.md`.
- The full preparation record (plan, data catalog, demo script, roles, weekend schedule, the review of 2026-11-12 and the council verdict of 2026-11-13) lives in `docs/preparation/preparations.md`.
- The kickoff checklist of 2026-11-14 is `docs/preparation/checkliste-kickoff.md` (German), also as `docs/preparation/Checkliste_Kickoff.pdf`.
- The team's German decision papers: `docs/preparation/konzeptabgleich-returnline.md` (concept merge) and `docs/preparation/council-urteil-prototyp.md` (council verdict on the prototype), each also as PDF. The Markdown versions carry notes on what has been decided since.
- **Language:** the team works in German. Planning docs stay in English. Anything handed to the team (decision papers, checklists) is written in German, kept as Markdown in `docs/preparation/` and, where it was handed out, also as PDF: `Konzeptabgleich_ReturnLine.pdf`, `Council-Urteil_Prototyp.pdf`, `Checkliste_Kickoff.pdf`.

## Origin of this repo and the pre-kickoff rule

- The 2026 Participant FAQs say: "Teams are not allowed to begin working on the challenges prior to the hackathon." The Team Formation Guide says work may begin on 2026-11-14 at 9:00 local time. Verified on 2026-11-12.
- Before kickoff both halves of the team only prepared: the original ReturnLine team in this repo (roles, Scrum, Git workflow, agent rules), Patrick in the private repo `TheMartians` (research, data catalog, safety rules, design brief). On 2026-11-14 the combined preparation docs were moved into this repo under `docs/preparation/`. They are a record of pre-kickoff research, not product work.
- Still in force: no code, design or number from before kickoff goes into the product. Every number shown is recomputed at the event in committed code. The planning-view sketch and the `.impeccable` mocks from `TheMartians` were deliberately not copied; screens are built fresh from the design brief.
- The project page must say that the challenge, site and data sources were researched before kickoff, and how AI was used.

## Event

- The Heilbronn local event at OpenSpace Heilbronn. Since 2026-11-13 the team page is "Houston, we have a map": https://www.spaceappschallenge.org/2026/find-a-team/houston-we-have-a-map/?tab=details. It still needs a browser check that it names our challenge, Heilbronn and all five members. The old team page "TheMartians" no longer applies.
- Heilbronn hacking runs from Saturday 10:30 to the final submission deadline on Sunday at 15:45, about 19–20 hours. There is a submission checkpoint at 14:30 and live pitches from 16:00. The full schedule is in `docs/preparation/preparations.md`.
- The 2026 submission and judging guides and the challenge resources appear on 2026-11-13.

## Decisions

Made on 2026-11-08 and 2026-11-09:
- Site: Gale crater, Mount Sharp boxwork region.
- Architecture: offline Python pipeline producing image overlays and GeoJSON, static web app with Vite and Leaflet 1.9.4 (language: JavaScript, decided on 2026-11-14), no backend, no 3D globe, no ML.
- Team skills: web frontend, Python, design and pitch. Nobody knows GIS, so keep the GIS side simple.

Corrected after the review of 2026-11-12 (details and sources in `docs/preparation/preparations.md`):
- The main user is the intravehicular crew member who directs the EVA. A field display is optional and, if built, is a forearm cuff display with hardware keys, because touch screens fail with suit gloves.
- The verdict rests on four rules: time to shelter ≤ 60 min, 10 m slope ≤ 20° plus a 1 m ridge mask, longest radio gap ≤ 5 min, daylight. Since 2026-11-15 (team decision) a radio gap over 5 min is a warning, not a NO-GO; the other three can say NO-GO.
- Dropped: the THEMIS sand rule, the per-EVA dose limit, the CME storm cut-off, the hand-written A\* (reversed on 2026-11-13: an offline C# Dijkstra, see below), the claim that the route is "validated" against Curiosity.
- Resolved on 2026-11-13: one page (the habitat console with a crew display inside), and the pitch opens on the shrinking return area.

Made on 2026-11-13, after Patrick switched teams (details in `docs/preparation/konzeptabgleich-returnline.md`, German):
- **New team:** five people, working entirely in German: Paul, Magnus, Alex, Michael and Patrick. The challenge stays the same. The new team brought its own concept, "ReturnLine × PRISTINE", which adds planetary protection. The two concepts are combined.
- **Priority order instead of weighted optimization:** crew safety (the four hard rules, can say NO-GO) → planetary protection (protected zones are avoided while safety allows; every entry is shown and logged) → science (the 4–5 stops are the goal).
- **Site:** Gale crater, boxwork region, confirmed.
- **Name and slogan:** product name "ReturnLine", slogan "Explore Mars. Return Safely. Preserve the Evidence."
- **Views (revised by the council the same day):** one page, the habitat console. It contains a read-only crew display with five values. A forearm cuff skin of the same component comes after feature freeze (changed on 2026-11-14, see below). No HUD over rover photos.
- **Roles:**
  - Team coordinator: Paul. Schedule, milestones, short meetings, Kanban board, blockers.
  - Tech lead: Magnus. Architecture, interfaces, technical decisions.
  - Integration and QA: Magnus and Paul.
  - Developers (GitHub issues, branches, pull requests, Kanban status): Magnus, Paul, Alex, Michael.
  - Alex: frontend (JavaScript), presentation.
  - Michael: A\* pathfinding (C#), data analysis and preparation (Python).
  - Paul: A\* pathfinding (C#), flexible support.
  - Magnus: frontend (JavaScript), data analysis and preparation (Python).
  - Patrick: flexible frontend and backend where needed.
- **Roles reconciled with the architecture:** the C# work is an offline routing engine (Dijkstra from the habitat, return pointers, two variants, routes, leave-one-out comparison), not a backend. Fallback at Saturday 18:00: scikit-image `MCP_Geometric` in Python. No backend. Frontend language: JavaScript, decided by the tech lead on 2026-11-14.

Council verdict of 2026-11-13, accepted by the team (full German text in `docs/preparation/council-urteil-prototyp.md`, summary in `docs/preparation/preparations.md`):
- The demo is a scripted EVA rehearsal run by habitat control, not a game. No free steering of the astronaut, no score. A demo button plays six beats with English subtitles. The script is built first; what is not in it is not built.
- The climax is the injured-crew ABORT through a protected zone, logged as an override. Not the solar storm, which a rival already has.
- The return area is the hero: the tightest of 60 minutes to shelter, life support and sunset. It only moves late in the EVA, so the demo jumps to EVA hour 4:45 and the injury halves walking speed.
- On screen: "Habitat control" instead of "IV", plain words like "Head home now". Never "validated", always "compared with Curiosity".
- Radio check along the route only, by sampling the DEM profile. No full viewshed.
- Checkpoints: Sat 14:00 dot on the real orthophoto; Sat 18:00 deployed on GitHub Pages and grid or fallback; Sat 22:30 feature freeze with all six beats on real data; Sun 11:00 hard freeze; Sun 13:00 video recorded; Sun 14:30 everything submitted.

Made on 2026-11-14 by the team (details in `docs/mission-scenario.md`):
- Frontend language: JavaScript.
- Every action is controlled from the habitat only; the crew displays stay read-only.
- The forearm cuff skin is a fixed feature. A navigation view (forearm tablet, heading-up map, hardware keys) and a helmet HUD (not over photos) are built as well. Draft: `docs/design/navigation-hud-sketch.html` (Alex).
- The amber return stage (`#D9A300`) stays for now against DESIGN.md's "no yellow for status"; revisit if time allows.

## Learnings from the 2026-11-13 council

- With a 6-hour life-support budget, the 60-minute safe-haven rule binds for most of the EVA. Any "shrinking" visual based on life support stays still until the last hour. Check such mechanics against the actual numbers before building a demo around them.
- Curiosity Mastcam photos are taken from the rover mast at its position. They cannot stand in for an astronaut's view.
- Slope-dependent walking speed has no sourced function yet; base speed (2 km/h lunar, 1.5 km/h Mars) and Apollo distance factors are sourced.
- The "no ridge crossing" rule may make stops among the boxwork ridges unreachable. Check reachability before planning stops.
- Global judges see only the project page, the video and the demo link, so all three must work without narration.

## Findings not in the docs

- **Gale DEM file:** classic TIFF, 32980 × 57440 px, float32, LZW, one row per strip.
- **Gale orthophoto file:** BigTIFF, 180000 × 280000 px, 8 bit palette, PackBits, 128 × 128 tiles. `.tif.ovr` sidecars hold a 4 m DEM level and a 1 m orthophoto level.
- **Grid:** both files are equirectangular, center longitude 0, Mars 2000 sphere R = 3396190 m, so lon° = x / 59274.70.
- **USGS download links:** `planetarymaps.usgs.gov` answers with a 302 redirect to `asc-pds-services.s3.us-west-2.amazonaws.com`. Use `curl -L` or the S3 URL. HTTP range requests work.
- **`MSL_waypoints.json`:** properties include `sol`, `lon`, `lat`, `elev_geoid`, `dist_km`. Longitude is east-positive. `easting` and `northing` are equirectangular on a sphere with R = 3396190 m, so easting = R × lon in radians. Data ran up to sol 5045 on 2026-11-08.
- **Raw image API:** filter by sol with `condition_1=msl:mission&condition_2=<from>:sol:gte&condition_3=<to>:sol:lte`. Each item has `sol`, `instrument` and `https_url`.
- **REMS weather feed:** the JSON key is `soles`, newest entry first. The last entry was 2026-08-25, sol 4995. Each sol has `sunrise`, `sunset` and `atmo_opacity`.
- **Radiation figure:** Hassler et al. 2014 give 0.64 ± 0.12 mSv/day; 0.67 mSv/day is the SwRI press release. Measured 2012–13, about 13 km from the boxwork.
- **Leaflet with a Mars CRS:** only `map.distance()` and the scale bar use the Mars radius. `latlng.distanceTo()` and `L.circle` still use Earth's radius, about 1.88× too large.
- **Pre-kickoff scouting numbers** (slope errors, THEMIS range, RAD campaign dose) are analysis results. They must be recomputed at the event before anyone shows them.

## Environment quirks on Patrick's Windows machine

- TLS to `spaceappschallenge.org`, `api.nasa.gov/DONKI` and `kauai.ccmc.gsfc.nasa.gov` fails with an untrusted root certificate, in both WebFetch and curl. A proxy or antivirus is probably intercepting. Do not bypass certificate checks. Ask the user to open these pages in a browser. The Firecrawl scrape tool fetches server-side and works.
- `py` starts Python 3.14; Python 3.11 is also installed (`py -3.11`). rasterio, numpy and scikit-image are not installed yet. The GDAL command-line tools are absent.
- For Python 3.11, reportlab, pypdf and pypdfium2 are installed in the user site (2026-11-13), for building and checking the team PDFs. `py -3.11 -I` hides user-site packages, so run those scripts without `-I`. The PDFs use the Windows fonts Segoe UI from `C:/Windows/Fonts`.
- Git Bash and PowerShell are available. The `gh` CLI is not installed.
