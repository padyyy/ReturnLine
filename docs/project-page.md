# Project page draft: Space Apps 2026 submission form

One section per field of the form on the "Project" tab of our team page, in the form's order (Project Submission Guide of 2026-11-13). Everything in the form must be in English. `⟨…⟩` marks a value still to fill from the final data or to confirm. Notes for the team (German) and the checklist before "Submit for Judging" are at the end.

---

## Project Name

ReturnLine

## High-Level Project Summary

ReturnLine is a planning and rehearsal console for one Marswalk to the boxwork ridges of Mount Sharp in Gale crater, where NASA's Curiosity rover worked in 2025 and 2026. It is built for habitat control: the crew member inside the habitat who directs two suited astronauts outside. For every 10 m of a 4.75 km × 4.76 km area it knows the walking time back to the habitat, computed from NASA orbital elevation data with a walking speed that depends on the slope. From that it draws the return area: the ground from which the crew can still get home in time. Three limits shape it: NASA's rule that an injured crew member must reach shelter within 60 minutes, the life support left, and sunset. Three safety rules can each say NO-GO; a long radio gap is a warning. A protected zone around sensitive science ground keeps Earth microbes away from the evidence, but only while safety allows: every entry is shown and logged. Habitat control follows the walk on the same read-only views the crew sees, a forearm tablet and a helmet head-up display. A step-by-step rehearsal plays an injured crew member's ABORT on the real elevation data.

Explore Mars. Return Safely. Preserve the Evidence.

## Link to Project Demo

⟨Public YouTube link to the video: at most 30 seconds, English subtitles. Open it in a private browser window before submitting.⟩

## Link to Final Project

- Live demo, runs in the browser without installing anything: https://padyyy.github.io/ReturnLine/
- Source code, data pipeline and documentation: https://github.com/padyyy/ReturnLine
- Alternative GUI, not deployed: the earlier console in the branch `alternative-gui` (https://github.com/padyyy/ReturnLine/tree/alternative-gui). It plays the full override story on a placeholder layout of stations and zones.

## Detailed Project Description

### The problem

Today's Mars maps are built for regional and global views. An astronaut on foot needs a narrower answer: from this slope, at this hour, can we still get home? Walking in a pressure suit is slow. The suit carries a fixed supply of oxygen and power, and help is only as close as the habitat. NASA's concept for exploration spacewalks requires that an incapacitated crew member can reach a safe haven within 60 minutes [xEVA].

There is a second, quieter risk. Astronauts carry Earth microbes. A boot print on a drill site can contaminate a sample or fake a discovery. Gale crater is where Curiosity found organic molecules in 3-billion-year-old rock [Eigenbrode], so this risk is real here.

### What ReturnLine does

The user is **habitat control**. Every action in ReturnLine is a decision of this person; the displays for the crew outside are read-only.

1. **Plan.** Habitat control picks a science stop. ReturnLine draws the route there and back around every protected zone and checks four safety rules:
   - time to shelter at most 60 minutes from every point of the route [xEVA];
   - slope at most 20° over 10 m, the suit design requirement [xEVA];
   - longest radio gap at most 5 minutes, from line of sight to the habitat along the route. The 5 minutes are our own planning threshold, not a NASA number. The reason behind them is NASA's procedure: after a radio loss, the crew first walks back into line of sight of the habitat's antennas [xEVA §9.5], so no part of the route should be far from it. A longer gap gives a warning, not a NO-GO: habitat control decides;
   - back before sunset.

   The verdict is GO, GO with constraints, NO-GO with the first rule that failed, or NO DATA. It is a recommendation; the decision stays with habitat control.
2. **Watch the return stages.** A band along the route shows, for every 10 m, whether the crew could still get home in time from there: green with 15 minutes or more to spare, yellow with less, red no longer in time. For the first five hours of a 6-hour spacewalk, the 60-minute rule is the tightest limit. Late in the walk, life support takes over and the band changes colour.
3. **Rehearse what goes wrong.** A demo plays six steps with subtitles:
   1. Plan the walk to Valle de la Luna / Nevado Sajama, where Curiosity drilled: GO with constraints. The station lies inside the boxwork protection zone, so the route runs 54 m inside it, and that entry is logged.
   2. Jump to EVA hour 4:45 at the stop.
   3. The crew heads home at 14:00 LMST. Less than an hour of life support is left, so life support now sets the return limit.
   4. On the way home, the helmet display counts down life support.
   5. A crew member is injured and walking speed halves. An injury means ABORT: return to shelter now. At half speed the way home takes 6 minutes, well within the 54 minutes of life support left.
   6. The crew is home at 14:12 LMST with 48 minutes of life support left. The log keeps the record: "ABORT logged · no override needed", because the way home stays outside the protected zone.

   Each step can be played on its own, stepped back, or auto-played; the right column shows what the crew sees at that moment.
4. **Show what the crew sees.** Touch screens work poorly in pressurized suit gloves [GECO], so the crew displays have no touch input. There are two:
   - a forearm tablet with four hardware keys: a heading-up navigation map, zoom, a switch between base maps and a data sheet with the key values and the elevation profile;
   - a helmet head-up display: a compass with home and target, the return stage and up to three warnings.

   "Start route" runs any planned walk in this navigation view: way out, the planned stay, and the way home.

### A fixed order, not a score

Crew safety comes first, then planetary protection, then science. Nothing is weighted against anything else:
- The planner avoids protected zones by making them expensive in the route search, but a zone never blocks the way home.
- When the only way home in time crosses a zone, safety wins, and the record shows it.

### How it works

- **Data, prepared offline.** A Python pipeline reads windows of the USGS Gale orthophoto and the USGS Gale elevation model straight from the public archive [USGS-Ortho, USGS-DEM]:
  - the orthophoto (25 cm) becomes the 1 m base map;
  - the elevation model (1 m) is averaged to a 10 m grid, and slope is computed from it.
- **Time to base.** A shortest-path search (Dijkstra) runs backwards from the habitat over the 10 m grid:
  - It uses 16 neighbours per cell and never cuts corners. Cells steeper than 20° are blocked.
  - The walking speed of each step follows Tobler's hiking function [Tobler], scaled so that level ground gives 1.5 km/h. Uphill and downhill differ.
  - There are two variants: one avoids protected zones, the other allows them.
  - Every cell stores the minutes to home and a pointer to the next cell on the way home. The browser can follow the way home from any cell without computing a route.
- **In the browser.** The app is a static web page (JavaScript, Vite, Leaflet).
  - It never computes a route. It looks up the precomputed grids, follows the pointers, draws the outline of the return area and checks positions against the zones.
  - The injury is a single factor on the stored walking times.
  - Everything ships as static files, so the demo also runs offline.
- **Every number carries its source.** Each value on the console has a source chip. An assumptions panel lists every assumption with its value.

### Honest limits, and what we set by hand

- **Walking model.** Tobler's function describes hikers on Earth. Applying it to suited astronauts on Mars is our assumption, not a tested model. The same holds for these values:
  - 1.5 km/h on level ground (NASA's lunar planning uses about 2 km/h [xEVA]; our slowdown for Mars is informed by suited walking tests [EWT]);
  - walking speed halved for an injured crew member;
  - 6 hours of life support.
- **Hand-picked layout.** We chose these ourselves: the habitat site, the four stations at named places of Curiosity's boxwork campaign, and the stop the rehearsal uses. The protected zone is a boxwork protection mask ⟨team: name its source and how it was made⟩. It is small (about 0.9 ha), so on this layout the way home never has to cross it, and the rehearsal needs no override. With other choices, the same tool gives other verdicts: station 1 gets a warning for a 10.3-minute radio gap.
- **Ridge mask.** The 1–2 m boxwork ridges need a 1 m ridge mask. It is not in the data yet; the console says "ridge mask pending".
- **Daylight.** Sunrise and sunset come from Curiosity's REMS weather station for sol 4839 and are used for the EVA sol. The EVA sol number itself is a placeholder; the header says "Placeholder data".
- **Radio.** The radio check samples line of sight along the route only. There is no full viewshed and no relays.
- **Radiation.** The dose is shown as information: 0.64 mSv per day, measured by Curiosity's RAD instrument [Hassler]. It is not a rule.
- **Curiosity.** We do not compare our routes with Curiosity's drives yet; the console says "not available". A rover's drives are not an astronaut's route. Curiosity's pictures appear in the station details as Curiosity's own view, never as the crew's.
- **Protected zones.** The idea of protected zones comes from planetary protection guidance for human missions to Mars [COSPAR, NID]. Our zone is a simple mask, not an implementation of those policies.
- **No outside testing.** Astronauts have not tested ReturnLine, and nobody, including NASA, endorses it.

### Why it matters

- **For a crew:** one question answered for every 10 m of ground: can we still get home, and what do we give up if we can't? The safety rules give their reasons out loud.
- **For planners:** the pipeline works for any site with an elevation model. Change the data window and the habitat, run it again, and the same console works for a new site.
- **Next steps:** live crew positions, life support from suit telemetry, walking speeds measured in suited tests on slopes, and real sunrise and sunset for the planned sol.

### Tools

- **Web app:** JavaScript with Vite 7 and Leaflet 1.9.4, hosted on GitHub Pages.
- **Data pipeline:** Python 3.11 with rasterio (GDAL), NumPy, SciPy, pyproj and Pillow.
- **Data checks:** Node.js scripts.
- **Fonts:** Atkinson Hyperlegible Next and Mono.

### Prior research and AI use

**Prior research.** Before kickoff we chose the challenge and the site and researched NASA data sources and EVA rules. All code, designs and results were made during the hackathon, from 14 November 2026 at 9:00.

**AI use.** AI coding assistants wrote a large part of the code and documentation, directed and reviewed by the team: OpenAI Codex, and Anthropic Claude Code with Claude Opus 5.5. Every AI contribution is logged in the repository in `docs/ai-log/` (192 entries on 15 November 2026, 14:45). Commits made with Claude Code carry a co-author line. All map data come from the sources below. No image, video or audio in this project was generated by AI. ⟨Confirm for the video.⟩

## Use of Super Intelligence (SI)

(Not shown to the judges; NASA collects it for data purposes. It must still match what the project page says.)

Yes. We used AI tools as follows:
- **Research before the event:** AI assistants helped find and summarize NASA data sources and EVA documents. We checked links and numbers ourselves.
- **Plan review before the event:** an "LLM council" stress-tested our prototype plan: several AI reviewers with different viewpoints. The team decided what to accept.
- **Code and documentation during the event:** OpenAI Codex and Anthropic Claude Code (Claude Opus 5.5) wrote and reviewed much of the web app, the data pipeline and the documentation. The team directed this work, reviewed it and merged it through pull requests.
- **Design review:** an AI design-critique skill helped review and polish the console layout.
- **Not used:** no AI-generated images, video, audio or data values, and no machine learning in the product. Every number shown is computed by committed code from the cited data, or is a labeled assumption.
- **Where to see it:** `docs/ai-log/` in the repository (one file per AI contribution) and the co-author lines on commits made with Claude Code.

**The idea:** it came from our team members: an EVA planner built around getting the crew home, and protected zones for planetary protection. AI tools helped us research it, stress-test it and build it; every decision was made by the team.

## NASA Data

- **[USGS-Ortho] MSL Gale Merged Orthophoto Mosaic 25cm, version 3.** Calef III, F. J. and Parker, T., 2016. PDS Annex, U.S. Geological Survey. https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm
  - Built from NASA MRO HiRISE and CTX images and ESA Mars Express HRSC images, tied to NASA MOLA.
  - Used for the base map, resampled to 1 m.
- **[USGS-DEM] MSL Gale Merged DEM 1m, version 3.** Parker, T. and Calef III, F. J., 2016. PDS Annex, U.S. Geological Survey. https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
  - Built from HiRISE, CTX and HRSC elevation models, tied to MOLA.
  - Used for elevation, slope, walking times and the radio line-of-sight check.
- **[MMGIS] Curiosity traverse and waypoints**, NASA JPL MMGIS: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json and https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json
  - Used for Curiosity's route through the boxwork campaign (sols 4591–4839) and the positions of the stops.
- **[Curiosity pictures] NASA Curiosity mission blog and JPL**, for the station names and the Curiosity pictures in the station details:
  - PIA26559, Curiosity's first 360-degree view of boxwork patterns: https://www.jpl.nasa.gov/images/pia26559-curiositys-first-360-degree-view-of-boxwork-patterns/
  - Sols 4668–4674, Laguna Escondida and Laguna Socompa: https://science.nasa.gov/blog/curiosity-blog-sols-4668-4674-winding-our-way-along/
  - Sols 4695–4701, Valle de la Luna: https://science.nasa.gov/blog/curiosity-blog-sols-4695-4701-searching-for-answers-at-monte-grande/
  - Sols 4716–4722, Nevado Sajama: https://science.nasa.gov/blog/curiosity-blog-sols-4716-4722-drilling-success-at-nevado-sajama/
- **[Drill holes] NASA Curiosity mission blog**, for Curiosity's drill campaign at the rehearsal station:
  - Sols 4689–4694, Valle de la Luna: https://science.nasa.gov/blog/curiosity-blog-sols-4689-4694-drill-in-the-boxwork-unit-is-go/
  - Sols 4709–4715, Nevado Sajama: https://science.nasa.gov/blog/curiosity-blog-sols-4709-4715-drilling-high-and-low-in-the-boxwork-unit
  - Sols 4804–4811, Nevado Sajama 2: https://science.nasa.gov/blog/curiosity-blog-sols-4804-4811-kicking-off-the-final-phase-of-boxwork-exploration
- **[REMS] Curiosity REMS weather feed**, NASA JPL: https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json. Used for sunrise and sunset (sol 4839).
- **[Hassler] Curiosity RAD measurement.** Hassler, D. M. et al., 2014, "Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover", *Science* 343, 1244797. https://doi.org/10.1126/science.1244797. Used for the dose rate, 0.64 mSv per day.
- **[xEVA] NASA, Exploration EVA System Concept of Operations**, EVA-EXP-0042 Rev B, 2020: https://www.nasa.gov/wp-content/uploads/2017/02/eva-exp-0042_xeva_system_con_ops_rev_b_final_dtd_10192020_ref_doc.pdf
  - Used for the 60-minute safe-haven rule, the 20° slope requirement, EVA duration, the radio-loss procedure (§9.5) and the role of habitat control.
- **[EWT] Norcross, J. et al., 2009, "Feasibility of Performing a Suited 10-km Ambulation on the Moon: Final Report of the EVA Walkback Test (EWT)"**, NASA TP-2009-214796. Used for suited walking speed.
- **[GECO] Adams, R. J. et al., 2013, "Glove-Enabled Computer Operations (GECO): Design and Testing of an Extravehicular Activity Glove Adapted for Human-Computer Interface"**, NASA NTRS 20130014736: https://ntrs.nasa.gov/citations/20130014736. Used as the reason for the crew displays without touch input.
- **NASA Space Apps 2026 challenge** "Interplanetary Survival Guide: Martian Map": https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/

## Space Agency Partner Data and Other References

**Space Agency Partner data**
- **ESA Mars Express HRSC:** HRSC images and elevation models are part of both USGS Gale mosaics we use (orthophoto and DEM, see NASA Data).

**Literature**
- [Tobler] Tobler, W., 1993, "Three Presentations on Geographical Analysis and Modeling", NCGIA Technical Report 93-1. The hiking function behind our walking speed.
- [Eigenbrode] Eigenbrode, J. L. et al., 2018, "Organic matter preserved in 3-billion-year-old mudstones at Gale crater, Mars", *Science* 360, 1096–1101. https://doi.org/10.1126/science.aas9185
- [COSPAR] COSPAR Policy on Planetary Protection, including its guidelines for human missions to Mars.
- [NID] NASA Interim Directive NID 8715.129, "Biological Planetary Protection for Human Missions to Mars", 2020.

**Open-source software**
- Leaflet 1.9.4 (BSD-2-Clause)
- Vite 7 (MIT)
- rasterio (BSD-3-Clause) with GDAL (MIT)
- NumPy (BSD-3-Clause)
- SciPy (BSD-3-Clause)
- pyproj (MIT)
- Pillow (MIT-CMU)
- Node.js

**Fonts**
- Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono, version 2.001, © 2020–2024 The Atkinson Hyperlegible Next Project Authors and The Atkinson Hyperlegible Mono Project Authors, SIL Open Font License 1.1 (license file in the repository: `frontend/src/assets/fonts/OFL.txt`).

**AI tools**
- OpenAI Codex and Anthropic Claude Code (Claude Opus 5.5), see "Prior research and AI use".

**Own work**
- The icons, the map styling and the product code in the repository were made by the team during the hackathon, with the AI assistance described above.

---

## Für das Team (Deutsch)

**Herkunft der Feldnamen.** Sie stammen aus dem Project Submission Guide 2026 (Stand 13.11.2026). Die Antwort zu „Use of Super Intelligence (SI)“ sehen die Juroren nicht. KI-Hinweise im Projekt selbst sehen sie, also in der Beschreibung, im Repo und in den Commits. Darum steht der KI-Absatz auch in der „Detailed Project Description“.

**Wichtige Regel im Guide:** „SI should not be used to come up with your idea of how to solve the challenge.“
- **Teamentscheidung 15.11.2026:** Die Idee stammt von den Teammitgliedern. So steht es jetzt am Ende von „Use of Super Intelligence“.
- **Der Punkt „Plan review before the event“ (LLM-Council) bleibt drin.** Das Council-Urteil liegt öffentlich im Repo (`docs/preparation/council-urteil-prototyp.md`, `docs/preparation/preparations.md`), und die Antwort muss dazu passen.

**Zahlen.** Nur aus den committeten Dateien in `frontend/public/data/` übernehmen.
- Stand 15.11.2026, 14:50: Seite auf Alex' Konsole umgestellt (damals Branch `navigation-view-/-hud`, seit dem Abend `main`; die alte Konsole liegt in `alternative-gui`). Die Demo-Zahlen stammen aus deren Daten: Station 3 Valle de la Luna / Nevado Sajama, 54 m in der Schutzmaske (geplant, geloggt), Rückweg ab 14:00, Verletzung 5:06 (14:06), Heimweg 6 min bei halbem Tempo, 54 min Lebenserhaltung übrig, zu Hause 14:12 mit 48 min. Kein Override: Auf diesem Raster sind `ttb_penalized` und `ttb_allowed` in jeder Zelle gleich.
- Das Video liegt im Repo unter `video/ReturnLine-Demo.mp4`. Für das Formular braucht es einen öffentlichen Link (z. B. YouTube), höchstens 30 s.
- Offen: wie die Boxwork-Schutzmaske entstanden ist (Quelle eintragen).

**Checkliste vor „Submit for Judging“** (Heilbronn: Checkpoint So 14:30, Abgabe So 15:45):
- [ ] Alle `⟨…⟩` gefüllt oder gestrichen. Kein „validated“ im Text.
- [ ] Video höchstens 30 s, englische Untertitel, öffentlich. Link im privaten Fenster geprüft.
- [ ] Demo-Link und Repo im privaten Fenster geprüft, ohne Login.
- [x] Das Repo ist öffentlich (bestätigt am 15.11.2026).
- [ ] Alle externen Quellen, Bibliotheken und Schriften unter „References“. Das verlangt die Bestätigung beim Absenden.
- [ ] Keine NASA-Logos in Seite, Video oder App.
- [ ] Teamseite: Challenge, Heilbronn und alle fünf Mitglieder eingetragen. Alle bestätigt beim Local Event Heilbronn.
- [ ] Haken bei „Terms and Conditions“ und „Confirm All Work is Original“, dann „Submit for Judging“. Danach erscheint ein Bestätigungsbanner.
