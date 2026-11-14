# Preparation: NASA Space Apps 2026, "Interplanetary Survival Guide: Martian Map"

As of: 2026-11-13. Data links were checked on 2026-11-08, rules and event details on 2026-11-12. A review on 2026-11-12 corrected several wrong claims of the first version (section "Review of 2026-11-12"). On 2026-11-13 Patrick joined a new team of five, the concept was merged with the new team's "ReturnLine × PRISTINE", and an LLM council revised the prototype presentation (section "Council verdict of 2026-11-13"). The team accepted all of it on 2026-11-13.

## At a glance

- **Dates:** The hackathon runs November 14 and 15, 2026. Judging starts on November 16.
- **Our event:** the Heilbronn local event (see "Event: Heilbronn"). There the final submission deadline is **Sunday 15:45**, not 23:59. That leaves about **19–20 hours** of work on site, not 36.
- **Team:** five people since 2026-11-13: Paul, Magnus, Alex, Michael and Patrick. The team works in German. Roles in "Roles".
- **Product:** **ReturnLine**, "Explore Mars. Return Safely. Preserve the Evidence."
- **Location on Mars:** Gale crater at Mount Sharp, boxwork region. Curiosity studied it in 2025/26, and the challenge itself names it as an example.
- **Format:** a static web app, the habitat console. It contains a read-only crew display. The demo is a scripted EVA rehearsal, played by a demo button.
- **Strategy:** About 7 public repos already target the boxwork. At least one has a GO/NO-GO verdict, Curiosity photos per stop and DONKI. What sets us apart:
  - the terrain-shaped return area that visibly shrinks as time runs out,
  - planetary protection as a real constraint, with a logged override when safety requires it,
  - safety rules from NASA's own EVA documents,
  - an honest comparison with Curiosity's drives,
  - every number tied to its source.

## Rules and disclosure

**Verified on 2026-11-12:**
- [Participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/): "Teams are not allowed to begin working on the challenges prior to the hackathon."
- [Team Formation Guide](https://www.spaceappschallenge.org/resources/team-formation-guide/): participants "should NOT begin working on their project until the hackathon begins on November 14, 2026 (9:00 a.m. local time)".
- AI tools are allowed. The submission must describe how we used them.
- A team has at most 6 members.

**Our line:**
- Before kickoff we only research, scout and download data, set up our machines and learn. We write no solution code.
- Patrick's prep repo `TheMartians` was private from 2026-11-12 and held only preparation notes.
- From kickoff on we build in the team repo **ReturnLine**. We rebuild from what we know. On 2026-11-14 the preparation docs were moved into `docs/preparation/` there as a record. The planning-view sketch was not copied, and no number computed before kickoff goes into the product without being recomputed.
- Some numbers in this doc come from scouting analysis before kickoff: the slope errors, the THEMIS range and the RAD campaign dose. We recompute them at the event in committed code before we show them anywhere.
- Learning experiments stay in throwaway folders outside any repo.
- The project page gets one honest line: "Before kickoff we chose the challenge and site and researched NASA data sources. All code, designs and results were made during the hackathon." It also says how we used AI.

**Still to read, before kickoff on Saturday morning** (on the checklist). Published on Nov 13:
- The 2026 Project Submission Guide and Judging & Awards Guide. The 2025 links return 404, so find the new ones on spaceappschallenge.org under Resources.
- The Resources tab on the [challenge page](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/). Copy it into our notes. If something new appears, change the cut list, not the concept.

**Submission according to the 2025 guide, check against 2026:**
- a video of up to 30 seconds or up to 7 slides, publicly linked, for example on YouTube
- English subtitles if the video is not in English
- a project page with demo link and repo. Judges mostly read this page.
- every data source cited. Uncited sources can cost awards.
- **Judging criteria:** Impact, Creativity, Validity, Relevance and Presentation

## Event: Heilbronn

Since 2026-11-13 our team page is ["Houston, we have a map"](https://www.spaceappschallenge.org/2026/find-a-team/houston-we-have-a-map/?tab=details), at the [Heilbronn local event](https://www.spaceappschallenge.org/2026/local-events/heilbronn/). Patrick switched to this team from "TheMartians"; challenge and event stay the same. Still to confirm in a browser (checklist): the page names our challenge and Heilbronn, and all five members are on it.

- **Venue:** OpenSpace Heilbronn.
- **Judging:** live pitches on site. The local judges choose the global nominees.

| Day | Time | What |
|---|---|---|
| Sat | 08:30 | Registration |
| Sat | 09:00 | Kickoff |
| Sat | 10:30 | Hacking begins |
| Sat | 18:00 | 60-second stand-ups |
| Sat | 22:30 | Day-1 wrap-up |
| Sun | 07:30 | Doors open |
| Sun | 10:30 | Mentor round 2 |
| Sun | 12:00 | Submission and pitch workshop |
| Sun | 14:30 | Submission checkpoint |
| Sun | 15:45 | **Final submission deadline** |
| Sun | 16:00 | Final pitches and live judging |
| Sun | 18:00 | Awards |

## Product idea

**ReturnLine** plans and rehearses **one extravehicular activity (EVA) to the boxwork ridges at Mount Sharp**. Its user is habitat control: the crew member inside the habitat who directs a pair of astronauts on the surface. NASA's EVA concept for Mars has exactly this role: "EVA operations will be directed by an IV crewmember in-situ" [xEVA]. On screen the role is called "Habitat control".

**A fixed priority order, not weights:**
1. **Crew safety:** four hard rules, each can say NO-GO.
2. **Planetary protection:** protected zones are avoided while safety allows. Every entry is shown and logged.
3. **Science:** the 4–5 stops are the goal. Which of them are reachable follows from 1 and 2.

- **Science goal:** the history of groundwater. The ridges contain clay minerals, the hollows between them carbonates, and the sulfate layer surrounds them. This result comes from Curiosity's drill samples, for example "Altadena", not from orbit. We pick 4–5 stops along Curiosity's route and justify them with the NASA blog posts.
- **The return area is the hero of the map.** For every 10 m cell it shows the walking time back to the habitat or rover. NASA requires that an incapacitated crew member reaches a safe haven within 60 minutes [xEVA]. The return area is the tightest of three limits: 60 minutes to shelter, remaining life support, and sunset. The fixed 60-minute line stays visible beside it.
  - **Why it must move in the demo:** with 6 ± 2 hours of life support, the 60-minute rule binds for the first five hours, so the area sits still. It only shrinks late in the EVA, when life support or sunset bind. The demo therefore jumps to EVA hour 4:45, and the injury event halves the walking speed.
- **Planetary protection:** astronauts carry Earth microbes. A step over a drill site can contaminate it or fake a discovery. Protected zones sit around Curiosity's drill sites in the boxwork campaign, located from the waypoints at the drilling sols. The buffer radius is a labeled assumption with a slider. Sources: COSPAR guidelines for human missions to Mars and NASA NID 8715.129 (2020), still to be checked against the primary texts. Gale hook: Curiosity measured organic molecules and methane here, exactly the kind of evidence contamination could fake.
- **The verdict** reads "Planner recommendation · decision: Habitat control" and has four states: GO, GO with constraints, NO-GO with the first violated rule, or NO DATA. Four rules feed it, and each of them can fire:
  1. time to shelter at most 60 minutes from every point of the route
  2. slope at a 10 m baseline at most 20°, and no crossing of the 1 m ridge mask
  3. longest radio gap at most 5 minutes, from line of sight to the habitat, checked along the route
  4. daylight, with the return finished before sunset
- **Radiation is information, not a gate.** The console shows the accumulated EVA dose with its source. It cannot decide the verdict, see "Radiation and space weather".
- **Station log:** every stop has the same fields: number, name, one-line reason, measurement and a Curiosity ground image.
- **Crew display:** what the two astronauts would see, read-only, as an inset in the console. Five values: next target, time to base, reserve to the turnaround point, life support remaining (labeled assumption), time to sunset. Not a touch tablet: NASA found that "touch screen displays are poorly adapted for use by a hand confined with a space suit glove" [GECO]. NASA's concepts use a cuff display on the forearm, a head-up display and voice [xEVA]. A cuff skin of the same component comes after feature freeze. No HUD over rover photos: a Mastcam photo shows the rover's position and height, not the crew's.

### Demo script

The demo is a scripted EVA rehearsal, not a game. A demo button plays these six beats from precomputed data, each with a one-line English subtitle. Every action is a click of habitat control. There is no free steering of the astronaut and no score. The script is written first; anything not in it is not built.

1. **Plan.** "Plan route" shows a route around the protected zones, all four rules green: GO. Curiosity's traverse is shown with one number, the deviation in the leave-one-out comparison.
2. **Time jump.** The autopilot runs at x60 and jumps, clearly labeled, to EVA hour 4:45 at stop 4. The return area still sits on the 60-minute line.
3. **The area pulls away.** Life support now binds. The area shrinks along the terrain and pulls away from the fixed line, about 30 seconds at x60. Alternative: let sunset from the REMS times bind.
4. **Deviation caught.** The crew drifts toward a drill-site zone. The console warns, habitat control reroutes and sees the detour in minutes.
5. **Crew member injured.** Walking speed halves (labeled assumption). This is one factor on the grid, no recomputation. The area collapses in one frame. The route around the zone no longer fits the reserve; only the route through it does. Verdict: ABORT.
6. **Deliberate override, logged.** Habitat control confirms. The log reads, for example, "Zone entered · Drill site X · 140 m · reason: ABORT". The crew gets home, the summary shows meters inside zones and which rules fired, then the slogan.

The 30-second video uses beats 3, 5 and 6.

**Pitch opening:** start with the crew and the shrinking area. Second sentence: "Whoever sees this sits in the habitat and decides." Explain the zones in one sentence (see "Planetary protection" above).

### The operating area

The coordinates come from Curiosity's waypoints.

| | Value |
|---|---|
| Boxwork campaign | Sol 4590 to 4840, i.e. July 2025 to March 2026 |
| Longitude | 137.379° to 137.383° East |
| Latitude | 4.810° to 4.802° South |
| Elevation | −3645 m to −3598 m |
| Suggested map extent | 137.34° to 137.42° East and 4.77° to 4.85° South, about 4.7 × 4.7 km |

The extent covers the boxwork area, room for a habitat, and Curiosity's further drive up to sol 5045.

Any future sol we show for the crewed EVA must lie after today's sol. Curiosity was past sol 5045 on 2026-11-08.

## Data catalog

The challenge asks for at least 3 data types. We have sources for 8.

| Data type | Dataset | Details | Status |
|---|---|---|---|
| Optical | [MSL Gale Merged Orthophoto Mosaic 25cm v3](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm), USGS, from HiRISE images | 25 cm per pixel, 8 bit, about 23 GB | Reachable. Stored in 128-pixel tiles, so a subset loads efficiently. |
| Optical, colour | `MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif` in the [same USGS bucket](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif) | Colour HiRISE mosaic, uploaded 2025-07-25, fused to the orthophoto. JPEG-compressed cloud-optimized GeoTIFF, 25 cm, with overviews | Reachable on 2026-11-12. Covers our extent. |
| Topography | [MSL Gale Merged DEM 1m v3](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m), USGS | 1 m per pixel, 32-bit float, about 3.6 GB | Reachable. Stored row by row, so a subset loads full rows, a few hundred MB. |
| Alternative basemap | [Multi-Resolution Basemap of Northwest Aeolis Mons](https://zenodo.org/record/5808381), Zenodo | Combination of several resolutions | Reachable, content not reviewed |
| Thermal | [THEMIS Thermal Inertia Mosaic Quantitative 30S120E](https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_30s120e_100mpp), USGS | 100 m per pixel, absolute accuracy about 20 % | Reachable. Scouting found values of about 256–578 (median 381) across the whole extent. Context layer only, see "Route and safety logic". |
| Spectral | CRISM in the [Orbital Data Explorer](https://ode.rsl.wustl.edu/mars/) | Three footprints contain the boxwork: FRT000058A3 and FRT0000B6F1 at 18 m, HRL0000BABA at 36 m. Use the 60-parameter summary cube (133 MB), not the 489-band cube (about 1.1 GB). | Coverage confirmed. At 18 m it cannot tell ridge from hollow. |
| Chemical | Curiosity APXS, ChemCam and CheMin results via the [PDS Geosciences Node](https://pds-geosciences.wustl.edu/missions/msl/index.htm) | Measured chemistry and mineralogy at the campaign stops | Public. Adds the "chemical" data type the challenge names. |
| Radiation | Hassler et al. 2014, *Science* 343, [DOI 10.1126/science.1244797](https://doi.org/10.1126/science.1244797); [SwRI release](https://swri.org/node/9079); RAD data at [PDS PPI](https://pds-ppi.igpp.ucla.edu/) | Paper: 0.64 ± 0.12 mSv per day and 0.21 ± 0.04 mGy per day [SWSC16]. The SwRI release says 0.67 mSv per day. Measured 2012–13, about 13 km away and 900 m lower than the boxwork. Over the solar cycle the surface dose ranges from 0.3 to 0.9 mSv per day [Guo21]. | Campaign data are public in the PDS PPI folder `SOL_04710_04843`. A quick look gave about 0.46 mSv per day, calibration unverified. Recompute at the event. |
| Space weather | DONKI via [api.nasa.gov](https://api.nasa.gov/), endpoints `notifications`, `CMEAnalysis` and `SEP` | Solar events with predicted arrival at Mars. Preliminary research products. | Not tested: certificate validation fails on Patrick's machine. Test in a browser. |
| Atmosphere | [Curiosity REMS weather feed](https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json), JSON | Temperature, pressure, UV, plus `sunrise`, `sunset` and `atmo_opacity` per sol | Returns data, last entry 2026-08-25, sol 4995. Historical data, meant for outreach. Sunrise and sunset give the daylight rule without Mars24. |
| Rover route | MMGIS files [MSL_traverse.json](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json) and [MSL_waypoints.json](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json) | GeoJSON with longitude, latitude, elevation, sol and driven distance | Returns data, waypoints up to sol 5045 |
| Ground images | Raw image API, for example [sol 4700 to 4710](https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc&per_page=50&page=0&condition_1=msl:mission&condition_2=4700:sol:gte&condition_3=4710:sol:lte) | All camera images per sol, located via the waypoints | Returns data, 1872 images for these 11 sols. Download the ones we use, so the demo needs no network. |

**Other useful sources:**
- [Mars Trek](https://trek.nasa.gov/mars/) with its [WMTS tile service](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars): a geographic grid with 2 × 1 tiles at level 0, levels 0 to 7, URL order `{z}/{y}/{x}`. A background map for the regional view.
- NASA's [Mars24 algorithm](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html): local time and sun position, if REMS sunrise and sunset are not enough.
- [Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/): official place names.
- [NASA blog on the final boxwork phase](https://science.nasa.gov/blog/curiosity-blog-sols-4804-4811-kicking-off-the-final-phase-of-boxwork-exploration) and [HiRISE image of the boxwork](https://science.nasa.gov/resource/hirise-views-mount-sharps-boxwork): entry points into the science story.

### Loading a subset without downloading the whole file

- The DEM and the orthophoto use the same grid: equirectangular, center longitude 0, Mars 2000 sphere with R = 3,396,190 m. Nothing needs reprojecting.
- The GDAL command-line tools are **not installed** on our machines. The rasterio wheels bundle GDAL, so rasterio can read a window straight from the `/vsicurl/` URL. Writing that script is event work.
- Before kickoff we may download raw files or windows with HTTP range requests. That counts as data scouting. Processing waits for Saturday.
- The orthophoto subset is about 19,000 × 19,000 pixels at 25 cm. Without the GDAL tools there is no `gdal2tiles`. Decided: one image overlay downsampled to 1 m, about 4,700 pixels square. No tile pyramid.
- Large files go on a shared drive, not into Git.

## Route and safety logic

### Terrain

- **Slope at a 10 m baseline.** At 1 m, DEM slope is dominated by noise and the small ridges. Scouting found that 1 m slope overstates Curiosity's measured tilt by about 8.5° on average, and 10 m slope by about 1.9°. In one boxwork patch, 40 % of the 1 m cells exceeded 15° and 13 % exceeded 25°.
- **A separate 1 m ridge and roughness mask.** The ridges are 1–2 m tall and about as wide as the rover. 10 m smoothing erases exactly the "large rock formations" the challenge asks routes to avoid, so they need their own layer.
- **Slope limits, as sliders with sources:** comfortable up to 10°, blocked above 20°. NASA's xEVA suit requirement covers "slope of up to 20°". Apollo crews walked on slopes under 15°, and that was at 1/6 g [xEVA, Iqbal24, TP-216125].
- **Walking speed** drops on slopes [MSC §4.3.3]. Apollo traverse planning multiplied map distances by 1.16–1.31 depending on terrain [MSC Table 4.4-3]. The exact slope penalty has no source yet. We use a named assumption, a Tobler-type function scaled to 1.5 km/h on level ground, and show once how much the return area changes at ±30 % speed.
- **Ridge crossing versus boxwork stops:** stops among the ridges may be unreachable under our own "no ridge crossing" rule. Check this first on Saturday. If a stop is unreachable, place it at the foot of the ridge and say so. If a ridge mask costs more than an hour, fold the rule into the 20° rule and say that too.
- **Radio check along the route only:** a full viewshed is real GIS work. Instead, sample the DEM profile from each route point to the habitat, about 30 lines without a GIS library. A radio gap is a stretch of walking time without line of sight.
- **Thermal inertia is not a sand detector here.** The lowest value in the whole extent is about 256, so a "below 250 means loose sand" rule never fires. 100 m pixels also cannot place sand on a 1 m route. THEMIS stays as a context layer.

### Route

Decided on 2026-11-13, replacing the earlier "no hand-written A\*":
- **Routing engine in C# (Paul and Michael), offline.** Dijkstra from the habitat, which is their A\* without the heuristic. It writes:
  - the time-to-base grid for every 10 m cell, with **return pointers** (the parent of each cell). The way home from any cell is then a few lines of JavaScript following the pointers.
  - two variants: zones penalized (normal) and zones allowed (ABORT),
  - the routes between the stops as GeoJSON,
  - the leave-one-out comparison with Curiosity's drives.
- **Grid spec first.** In hour 1, Paul writes one page: bounding box, 10 m cells, about 470 × 470, row order, float32 little-endian binary, encoding of the return pointers, file names. Nobody integrates without it.
- **Fallback at Saturday 18:00:** if no grid exists by then, Michael computes it with scikit-image's `MCP_Geometric` (cumulative cost plus traceback in one call), and Paul takes over QA of the demo script.
- **The browser never computes a route.** It looks up the grid. The injury event multiplies the walking times by a factor; no recomputation is needed.

### Radiation and space weather

- **Dose is not a gate.** For galactic cosmic rays, "Shielding is NOT effective" [OCHMO], so the dose outside is almost the same as in a lightly shielded habitat. A 7-hour EVA adds at most about 0.2 mSv. NASA-STD-3001 has no per-EVA limit. It sets a career limit of 600 mSv, a design limit of 250 mSv for solar particle events, and ALARA [OCHMO].
- **Solar storms as two states:**
  - **SEP WATCH**, from the DONKI forecast. It adds the constraint "at most 60 minutes to shielding from every point of the route". The IV crew member watches the dosimeter.
  - **SEP ALERT**, when the local dose rate is at least 25 % above background. In RAD data that gave at least 30 minutes before the peak [Löwe25]. Response: TERMINATE and return to the nearest shelter.
- **Timing:** after a flare, solar energetic particles reach Mars within tens of minutes [JPL24]. A CME shock arrives days later and at Mars mostly causes a Forbush decrease, which means a *lower* dose [Guo18]. CME arrival forecasts miss by about 13 hours on average, and that is at Earth [Riley18]. So there is no "storm cut-off at 14:00". If we show a CME at all, we show its arrival as a time window.
- **A real anchor for the pitch:** in May 2024, RAD at Gale measured 8,100 µGy, the largest surge since landing [JPL24].

### Operations wording

Following [xEVA] and the Apollo flight rules [TN D-7822]:
- **Verdict:** GO, GO – n CONSTRAINTS, NO-GO – first violated rule, NO DATA – missing input.
- **Constraints** read as trigger → action, for example "Leave Stn 5 by 13:00" or "SEP alert → TERMINATE".
- **Field states:** ON PLAN ± minutes, TURNAROUND DUE, TERMINATE for an orderly return after a timeline overrun or an SEP alert, ABORT to the nearest shelter now after a suit fault, an injury or consumables below the contingency return.
- **Pairs:** the two EV crew members stay within sight of each other [MSC §2.2]. After a radio loss: regain line of sight, switch radios, otherwise terminate [xEVA §9.5].

### EVA parameters with sources

- **Walking speed:** about 2 km/h on level ground in NASA's lunar planning [xEVA]. 1.5 km/h on Mars is a defensible, labeled slowdown based on Mars-weight trials [EWT].
- **EVA duration:** 6 ± 2 hours plus 1 hour of backup oxygen [xEVA]. Apollo J-missions planned up to 7 hours plus 30 minutes of reserve [MSC].
- **Walking radius:** about 1.5 to 2 km, under 1 hour of walking during a rescue [xEVA].

### Comparison with Curiosity, not validation

- Our stops lie on Curiosity's path, and the waypoint elevations come from the same DEM. "Our route matches Curiosity's" therefore proves nothing.
- **Honest test:** leave one out. For each Curiosity drive longer than 50 m, route between its endpoints without forced stops. Report the mean deviation from the actual drive and compare it with a straight line.
- **Slope against Curiosity's measured tilt** is a real check, with a caveat. The rover only drove terrain its planners judged safe, and its tilt spans a wheelbase of about 3 m, not a boot.
- We say "compared with", never "validated".

## Architecture

- **Offline pipeline in Python** with numpy, scikit-image and tifffile (rasterio optional). It crops the DEM and the orthophoto, computes 10 m slope, the ridge mask and hillshade, and exports one orthophoto image overlay. No tile pyramid.
- **Offline routing engine in C#:** time-to-base grid with return pointers, routes, comparison with Curiosity (see "Route").
- **Static web app** with Vite and Leaflet 1.9.4, no UI framework, hosted on GitHub Pages. JavaScript or TypeScript is the tech lead's call at kickoff. There is no backend. Deploy early, by Saturday 18:00.
- **Offline demo:** Leaflet is pinned to 1.9.4 (a 2.0 beta exists) and bundled. Fonts are self-hosted, not loaded from Google Fonts. Ground images are downloaded, not hotlinked.
- **Data contract:** images are for display only: orthophoto, hillshade and slope colours. Any number the app computes with comes as GeoJSON, JSON or a raw binary grid. Never read numbers back from a PNG through a canvas, because the browser does not guarantee exact pixel values.
- **Mars coordinates:** the map runs in plain longitude and latitude, using a copy of Leaflet's EPSG:4326 CRS with the Mars radius of 3396.19 km. That fixes the scale bar and `map.distance()`, nothing more. See the caveat below.

### Decision: Leaflet instead of MapLibre GL JS

Decided on 2026-11-09 by the frontend lead.

- **Mars Trek tiles are not Web Mercator.** They use a geographic grid with 2 × 1 tiles at the top level and zoom levels 0 to 7. MapLibre can only display Web Mercator tiles. Leaflet supports this geographic grid out of the box.
- **Everything stays in degrees.** Our equirectangular image overlays and the GeoJSON from Curiosity's waypoints fit on the map without reprojection. That keeps things simple for a team without GIS experience.
- **Mars distances with one line:**

  ```js
  const MarsCRS = L.extend({}, L.CRS.EPSG4326, { R: 3396190 });
  ```

- **Caveat, found on 2026-11-12:** this fixes only `map.distance()` and the scale bar. `latlng.distanceTo()` and the radius of `L.circle` still use Earth's radius, which makes them about 1.88 times too large on Mars. Use only `map.distance()`, and draw range rings as polygons.
- **Small and proven.** Image overlays, GeoJSON and touch input are built in, and no WebGL is needed.
- **The trade-off:** MapLibre could render 3D terrain and hillshade directly from elevation tiles. We do not need that: 3D is out of scope, and the pipeline delivers hillshade as a finished image.
- **Deliberately left out:** 3D globe, backend, machine learning, login, route computation in the browser.

## Roles

Agreed by the team on 2026-11-13.

| Role | Who | Owns |
|---|---|---|
| Team coordinator | Paul | Schedule, milestones, short meetings, Kanban board, blockers, priorities |
| Tech lead | Magnus | Architecture, interfaces, technical decisions, clean integration |
| Integration and QA | Magnus, Paul | Regular integration, testing, bug priority, demo stability |
| Developers | Magnus, Paul, Alex, Michael | GitHub issues, branches and pull requests, Kanban status |

| Person | Work |
|---|---|
| Paul | Routing engine in C# (grid spec, Dijkstra, return pointers), flexible support |
| Michael | Routing engine in C#, data analysis and preparation in Python; owns the `MCP_Geometric` fallback |
| Magnus | Frontend, data analysis and preparation in Python |
| Alex | Frontend, presentation (pitch, video) |
| Patrick | Flexible frontend and data work where needed |

**First hour (10:30–11:30):**
- **Paul:** the one-page grid spec (see "Route").
- **Magnus and Michael:** crop the DEM, compute 10 m slope, export one orthophoto overlay. Then check that the stops are reachable under the ridge rule.
- **Alex:** console layout against fake JSON, with a dot moving along a hardcoded line.
- **Patrick:** subtitles for the six demo beats, project page skeleton and source list, then the demo-button timeline.

## Checklist for Saturday morning

The checklist for the morning of 2026-11-14 is in German, for the team: `docs/preparation/checkliste-kickoff.md`, also as `docs/preparation/Checkliste_Kickoff.pdf`. It replaces the earlier checklist until Friday.

## Weekend schedule (Heilbronn)

| When | Goal |
|---|---|
| Sat before 09:00 | Checklist part A: only preparation, no solution code. |
| Sat 09:00–10:30 | Kickoff. Checklist part B: confirm scope against the council verdict in 15 minutes, new repo, Kanban board from the demo script, grid spec, open assumptions. |
| Sat 10:30–14:00 | First-hour plan, then pipeline and engine. **14:00: the dot moves across the real orthophoto.** |
| Sat 14:00–18:00 | Time-to-base grid, return area, the four rules, crew display, demo-button timeline. **18:00 stand-up: app deployed on GitHub Pages; grid there, or switch to the `MCP_Geometric` fallback.** |
| Sat 18:00–22:30 | Real routes end to end, injury event and override log, radio check along the route, comparison with Curiosity, recomputed scouting numbers. **22:30 feature freeze: the six beats run end to end on real data.** |
| Sun 07:30–11:00 | Bug fixes, subtitles, assumption sliders. Then the after-freeze list, in order, only if the demo stays stable. Use the 10:30 mentor round. **11:00 hard freeze: bug fixes only.** |
| Sun 11:00–13:00 | **Video recorded by 13:00** (beats 3, 5, 6). Project page finished. |
| Sun 13:00–14:30 | Pitch rehearsal with the demo button. **Everything submitted by the 14:30 checkpoint.** |
| Sun 14:30–15:45 | Buffer only. Final deadline 15:45, live pitch from 16:00. |

**Must-have:**
- map with the orthophoto, the protected zones and the stops
- time-to-base grid with return pointers, in two variants: zones penalized and zones allowed
- return area as the tightest of 60 minutes, life support and sunset, with the walking-speed factor
- autopilot with time compression and a labeled time jump
- crew display, verdict panel and station log
- event "crew member injured" with a logged ABORT override
- demo button with subtitles per beat
- comparison with Curiosity and the radio check along the route

**After feature freeze, in this order:**
1. cuff skin of the crew display
2. a "what if" click for habitat control
3. solar storm event (SEP WATCH, SEP ALERT)
4. footprint trail
5. rover photo as a preview in the log
6. one spoken warning

**Cut:** HUD over a rover photo, free steering of the astronaut, route computation in the browser, a full viewshed, the word "validated", hillshade and CRISM layers unless they come for free.

## Done when …

**Preparation:** every item of the German checklist is ticked.

**Hackathon:**
- The demo button plays all six beats offline, three times in a row without errors.
- The return area visibly shrinks in beat 3 and collapses in beat 5.
- No point of the planned route is more than 60 minutes from shelter, and no 10 m slope on it exceeds 20°.
- The override is logged with zone, meters and reason.
- Every number on screen has a source or is labeled as an assumption. The word "validated" appears nowhere.
- The static build runs offline and is deployed on GitHub Pages.
- The video is at most 30 seconds long and has English subtitles.
- Someone who has never seen the project understands the project page, the video and the demo link without narration.
- The project page states our prior research and our AI use.

## Other teams for orientation

About 7 public repos for this challenge target the boxwork. At least one has a GO/NO-GO verdict, Curiosity photos per stop and DONKI. Another has a walk for two astronauts that it checks against Curiosity's path. "Most rivals do Jezero" is no longer true.

- [Team Protikriti](https://github.com/AhsanulHoque22/Nasa-Space-Apps-Challenge-2026-Team-Protikriti): Jezero Marswalk planner with 3D globe, rover street view and route planner. Very broad.
- [MarsPath](https://github.com/25243060-creator/martian-map-route-planner): Jezero with A\* on a slope map and a 5 km return radius. Uses image coordinates instead of longitude and latitude.
- [NeuroNexus](https://github.com/kmmohaimenulhaque-code/neuronexus-mars-survival): risk assessment from MOLA elevation data with a 3D view.
- [MarsNav](https://github.com/Aryan221224/MarsNav): landing-site selection and EVA navigation on NASA and USGS data.

## Review of 2026-11-12

A multi-angle review checked this plan against the official rules, NASA EVA documents and the real data. These claims of the first version were wrong and are corrected above:

| First version said | Correction |
|---|---|
| The 2026 rules are unverified. | Verified: no work on the project before Nov 14, 09:00 local time. |
| About 36 working hours, until Sunday 23:59. | Heilbronn: about 19–20 hours, final deadline Sunday 15:45. |
| Low thermal inertia flags loose sand. | The rule never fires in our extent, and 100 m pixels cannot place sand on a route. |
| Slope from the 1 m DEM; blocked above 25°. | 10 m slope plus a 1 m ridge mask; blocked above 20°, the suit design limit. |
| A per-EVA dose limit as a routing rule. | No NASA basis, and it can never fail. Dose is shown, not gated. |
| A storm cut-off from the CME arrival. | SEPs arrive in minutes; a CME lowers the dose. SEP WATCH and SEP ALERT instead. |
| Return reserve only. | NASA's 60-minute safe-haven rule, checked at every point. |
| Tablet with touch buttons in suit gloves. | NASA: touch screens fail with suit gloves. Since 2026-11-13: a read-only crew display, cuff skin after feature freeze. |
| "Validated against Curiosity's route." | Circular. Leave-one-out comparison, and "compared with". |
| 0.67 mSv/day from Hassler et al. 2014, "measured at the site itself". | The paper says 0.64 ± 0.12; 0.67 is the press release; measured 13 km away. |
| The Mars CRS makes all distances right. | Only `map.distance()`. `distanceTo()` and `L.circle` are off by about 1.88×. |
| CRISM coverage unknown. | Three footprints cover the boxwork. |
| Most rivals do Jezero. | About 7 public repos target the boxwork. |

### Decisions of 2026-11-12, resolved on 2026-11-13

1. **One view or two?** One page, the habitat console, with a read-only crew display inside. A cuff skin comes after feature freeze.
2. **The pitch claim.** Neither option as worded. The pitch opens on the crew and the shrinking return area: "This team can tell, for every 10 m of Gale, whether two astronauts can still get home, and what they give up when they can't."
3. **Asking the organizers.** Only needed if we want to reuse a preparation artifact. Otherwise the line on the project page is enough.

## Council verdict of 2026-11-13

After the concept merge with "ReturnLine × PRISTINE", an LLM council reviewed the planned presentation: five advisors with opposing angles, anonymous peer review, a chairman's synthesis. The full German verdict is `docs/preparation/council-urteil-prototyp.md`. The team accepted it on 2026-11-13. Changes to the team's first idea:

| Team idea | Council verdict |
|---|---|
| An interactive game with a freely steered astronaut | A scripted EVA rehearsal run by habitat control. A "what if" click comes after feature freeze. |
| HUD as the astronaut view, optionally over a rover photo | One read-only crew display with five values; cuff skin later; no HUD over photos, because the photo shows the rover's position. |
| The return radius shrinks over time | It only shrinks once life support or sunset binds, after about five hours. Hence the time jump to EVA hour 4:45 and the injury factor. |
| Solar storm as the climax | The injured-crew ABORT through a protected zone, logged, is the climax. A rival already has solar storms. |
| A\* in C# for live route planning | C# Dijkstra offline, with return pointers, two variants and the Curiosity comparison. Fallback `MCP_Geometric` at Sat 18:00. |
| Radio line of sight as a map layer | Checked along the route only, by sampling the DEM profile. |

**Gaps the council found, and their status:**
- The slope penalty on walking speed has no source: named assumption plus a ±30 % check. Base speed and Apollo factors are sourced.
- Stops among the ridges may be unreachable under the ridge rule: first data check on Saturday.
- Global judges see no live pitch: subtitles per beat, plain words, a visible demo button.
- Radiation 0.64 versus 0.67: already settled, use 0.64.

### Sources for the safety rules

- [xEVA] NASA, Exploration EVA System Concept of Operations, Rev B, 2020: [PDF](https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf)
- [MSC] MSC-03652, Apollo lunar surface EVA planning, 1970: [PDF](https://www.lpi.usra.edu/lunar/ALSEP/pdf/31111000673366.pdf)
- [OCHMO] NASA OCHMO, radiation protection technical brief: [PDF](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf)
- [JPL24] NASA JPL, "NASA Watches Mars Light Up During Epic Solar Storm", 2024: [article](https://www.jpl.nasa.gov/news/nasa-watches-mars-light-up-during-epic-solar-storm/)
- [Löwe25] [arXiv 2502.02469](https://arxiv.org/abs/2502.02469)
- [Guo18] [arXiv 1803.00461](https://arxiv.org/abs/1803.00461)
- [Guo21] Guo et al. 2021, *Astronomy and Astrophysics Review*, radiation environment on Mars
- [Riley18] [arXiv 1810.07289](https://arxiv.org/abs/1810.07289)
- [SWSC16] *Space Weather and Space Climate* 2016, model comparison: [Table 2](https://www.swsc-journal.org/articles/swsc/full_html/2016/01/swsc150074/T2.html)
- [GECO] NASA NTRS 20130014736: [PDF](https://ntrs.nasa.gov/api/citations/20130014736/downloads/20130014736.pdf)
- [ISRO25] IAC 2025, GLEX paper 92958: [abstract](https://iafastro.directory/iac/paper/id/92958/abstract-pdf/GLEX-2025,12,1,6,x92958.brief.pdf)
- [Elston25] NASA NTRS 20250011652, EVA informatics literature review: [PDF](https://ntrs.nasa.gov/api/citations/20250011652/downloads/IEEE-aero-lit-review-EVA-informatics_final.pdf)
- [TP-216125] NASA Technical Publication 216125, suited incline tests: [NTRS](https://ntrs.nasa.gov/citations/20110003409)
- [EWT] Norcross et al., NASA TP-2009-214796, EVA Walkback Test: [PDF](https://www.lpi.usra.edu/lunar/artemis/NorcrossEtAl_NASA-TP-2009-214796_EVA%20Walkback%20Test.pdf)
- [Iqbal24] EPSC 2024-196: [abstract](https://meetingorganizer.copernicus.org/EPSC2024/EPSC2024-196.html)
- [TN D-7822] Apollo mission rules: [PDF](https://www.nasa.gov/wp-content/uploads/static/history/alsj/tnD7822MissionRules.pdf)
- [SP-350] Apollo Expeditions to the Moon, chapter 12.6: [page](https://www.nasa.gov/wp-content/uploads/static/history/SP-350/ch-12-6.html)

**Planetary protection, not yet checked against the primary texts:**
- COSPAR Policy on Planetary Protection, including its principles and guidelines for human missions to Mars
- NASA Interim Directive NID 8715.129, "Biological Planetary Protection for Human Missions to Mars", 2020
- Gale hook: Curiosity's organic molecule detections (including the 2025 long-chain alkanes in the "Cumberland" sample) and its methane measurements with SAM/TLS
