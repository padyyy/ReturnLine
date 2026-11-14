---
name: ReturnLine
description: Habitat console for a rehearsed Mars EVA. Explore Mars. Return Safely. Preserve the Evidence.
colors:
  cover-yellow: "#E3B21B"
  survey-paper: "#EDF0E6"
  survey-paper-2: "#E3E7DA"
  survey-paper-3: "#D6DCCB"
  graphite: "#2B2D2F"
  graphite-2: "#51575B"
  graphite-3: "#80878B"
  graphite-deep: "#1B1D1E"
  rule: "rgba(43, 45, 47, .15)"
  rule-2: "rgba(43, 45, 47, .32)"
  red-pencil: "#C8361F"
  red-pencil-deep: "#A92C18"
  red-tint: "rgba(200, 54, 31, .09)"
  blue-pencil: "#2459A8"
  blue-tint: "rgba(36, 89, 168, .09)"
  survey-green: "#1F6B45"
  survey-green-deep: "#18573A"
  green-tint: "rgba(31, 107, 69, .10)"
  map-ground: "#8E918B"
  spent-grey: "#8A8F92"
  cuff-key: "#C9CDC2"
typography:
  verdict:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(96px, 8.4vw, 164px)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.2
  subtitle:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  row-label:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1.3
  caption:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.35
  number-large:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.1
    fontFeature: "\"tnum\" 1"
  number:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
    fontFeature: "\"tnum\" 1"
  number-small:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.02em"
rounded:
  none: "0px"
  hairline: "2px"
  segment: "3px"
  station: "50%"
spacing:
  xxs: "2px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  pad: "20px"
  pad-compact: "16px"
  band-height: "56px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    rounded: "{rounded.hairline}"
    padding: "0 14px"
    height: "38px"
  button-dark:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.survey-paper}"
    rounded: "{rounded.hairline}"
    padding: "0 14px"
    height: "38px"
  button-dark-hover:
    backgroundColor: "{colors.graphite-deep}"
  button-go:
    backgroundColor: "{colors.survey-green}"
    textColor: "{colors.survey-paper}"
    rounded: "{rounded.hairline}"
    padding: "0 14px"
    height: "38px"
  button-go-hover:
    backgroundColor: "{colors.survey-green-deep}"
  button-abort:
    backgroundColor: "{colors.red-pencil}"
    textColor: "{colors.survey-paper}"
    rounded: "{rounded.hairline}"
    padding: "0 14px"
    height: "38px"
  button-abort-hover:
    backgroundColor: "{colors.red-pencil-deep}"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "24px"
  segmented-option-pressed:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.survey-paper}"
  source-chip:
    backgroundColor: "transparent"
    textColor: "{colors.blue-pencil}"
    typography: "{typography.number-small}"
    rounded: "{rounded.hairline}"
    padding: "3px 5px"
  source-chip-assumption:
    textColor: "{colors.graphite-2}"
  header-band:
    backgroundColor: "{colors.cover-yellow}"
    textColor: "{colors.graphite}"
    height: "56px"
    padding: "0 20px"
  subtitle-band:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.survey-paper}"
    typography: "{typography.subtitle}"
    padding: "10px 20px"
  crew-display:
    backgroundColor: "{colors.survey-paper}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.none}"
    width: "318px"
  station-badge:
    backgroundColor: "{colors.survey-paper}"
    textColor: "{colors.blue-pencil}"
    rounded: "{rounded.station}"
    size: "21px"
---

# Design System: ReturnLine

> **Source and status.** Recorded from the shipped design sketch `docs/design/habitat-console-sketch.html` (2026-11-14), which is the reference for the real build in `frontend/` (Vite, Leaflet 1.9.4, no UI framework). The direction comes from `docs/preparation/design-brief.md` ("Field Book"). **All terrain, routes, stop and zone names and every number in the sketch are synthetic.** The tokens and components below are the system; none of the sketch's values may be shown as results.

## Overview

**Creative North Star: "The Field Book"**

The console is a geologist's field book laid open at the habitat: a cover-yellow band, green-tinted survey paper, graphite for what is planned, red pencil for what went wrong, blue pencil for stations and protected ground, survey green for "home in time". It answers one question at poster scale, "can the crew still get home from here?", and every finding is ringed in red pencil on the map and in the log at once.

The material is the field book's colour code and ruling, not its costume. Surfaces are flat, square-cornered and edged with graphite hairlines; there is no paper texture, no ruled lines, no handwriting and no shadow. Density is high but legible at projector distance: one hero word, four rule rows, a log, and every measurement in one right-aligned Mono column with its source beside it.

It rejects the category default, the dark mission-control dashboard of KPI tiles with a route and a GO badge.

**Key Characteristics:**
- Light survey-paper ground, cover-yellow header band, graphite text and route.
- Colour is a role code: red = finding, failure, ABORT; blue = station, protected zone, source; green = GO, return area, home.
- One verdict word at poster scale; everything else is quiet.
- Every number in Atkinson Hyperlegible Mono, right-aligned, with a source chip or "assumption".
- Flat, hairline-edged, square; depth only from tint and graphite fills.
- The red-pencil ring is the signature: it draws itself around a finding on the map and in the log together.

## Colors

A field-book colour code on survey paper: one warm cover colour, one graphite neutral family, and three pencil colours that each own a meaning.

### Primary
- **Cover Yellow** (cover-yellow): the header band only, plus the current-beat dot, the time-jump marker on the budget bar, the switch thumb when on, text selection, and highlighted numbers on dark banners. Never a status colour.

### Secondary
- **Red Pencil** (red-pencil): findings, failed rules, NO-GO and ABORT verdicts, the ABORT route, the finding ring, "over" overruns. Darker red (red-pencil-deep) only for hover and for text on red tint. Red tint fills a highlighted finding row and warning strips.
- **Blue Pencil** (blue-pencil): science stations (numbered circles), protected-zone hatching and labels, source chips, focus outlines, station blocks on the budget bar.

### Tertiary
- **Survey Green** (survey-green): GO verdict, the return area outline and fill, passed rules, "home" states, the debrief summary header. Darker green only for hover.

### Neutral
- **Survey Paper** (survey-paper): page ground, panels, crew display, legend, popovers; also the halo stroke under every map line and label.
- **Paper 2 / Paper 3** (survey-paper-2, survey-paper-3): panel heads (assumptions) and empty image wells.
- **Graphite** (graphite): text, planned route, hairline borders, dark buttons, subtitle band, banners, tooltips, the habitat square.
- **Graphite 2 / 3** (graphite-2, graphite-3): captions, planned-but-not-done log rows, "no data" verdict, assumption chips.
- **Rule / Rule 2** (rule, rule-2): row dividers inside lists; rule-2 for heavier inner dividers and image frames.
- **Map Ground** (map-ground): neutral behind the map before tiles load.
- **Spent Grey** (spent-grey): time already used on the return leg of the budget bar.
- **Cuff Key** (cuff-key): key outlines and labels on the dark cuff body only.

### Named Rules
**The Pencil Code Rule.** Red, blue and green each own one meaning and never trade. A blue warning or a green zone is a bug.

**The Never Colour Alone Rule.** Every state carries a word or shape as well: "pass / fails / fired / info" with a check, cross, warning or info icon; hatching plus a text label for zones; a dashed line plus "60-minute line, fixed"; line weight and dash pattern differ between planned, ABORT, reroute and traverse.

**The Yellow Is The Cover Rule.** Cover yellow marks the book, the current beat and the clock jump. It never means caution or status.

*Exception, team decision of 2026-11-14:* the navigation view and the helmet HUD use a separate amber (`#D9A300`) for the "under 15 min to spare" return stage, always with its word. Kept for now; revisit if time allows.

## Typography

**Display Font:** Atkinson Hyperlegible Next (with Segoe UI, system-ui)
**Body Font:** Atkinson Hyperlegible Next
**Label/Mono Font:** Atkinson Hyperlegible Mono (with ui-monospace, Cascadia Mono)

**Character:** One hyperlegible family in two voices: Next for words, Mono for every measurement. Both are self-hosted variable fonts (weights 200 to 800, SIL OFL) in `docs/design/fonts/`; the page works offline.

### Hierarchy
- **Verdict** (800, clamp 96 to 164px, line-height 0.86, -0.035em): the one poster word: GO, NO-GO, ABORT, HOME, NO DATA. One per screen.
- **Headline** (800, 22px): summary header, verdict count ("– 1 of 4"), large crew-display values use the Mono variant at the same size.
- **Subtitle** (600, 20px, balanced wrap; 18px under 1500px, 17px at 700px): the beat sentence in the subtitle band.
- **Title** (800, 15px): section heads ("Safety rules", "Station log") with a caption on the right.
- **Body** (400, 15px, 1.4): default text; verdict sentence at 17px/600.
- **Row label** (600, 14.5px): rule and log row titles, with a caption line underneath.
- **Caption** (400, 12.5px, graphite-2): explanations, limits, "read-only", the verdict authority line.
- **Numbers** (Mono 600): 22px in the crew display, 17px in rule and log rows, 30px for the EVA clock, 11px in source chips; units drop to 0.76em.

### Named Rules
**The One Number Column Rule.** Every measurement is Mono with tabular figures, right-aligned in the value column; integer and unit sit in a fixed number cell (fraction-and-unit track 6.4ch) so values line up down the list.

**The Sentence Case Rule.** Labels are sentence case and plain words ("Head home now", "Habitat control"). No tracked uppercase labels above headings. The cuff skin is the one place uppercase Mono labels appear, because it imitates a hardware display.

**The Draw-The-Arrow Rule.** Atkinson Hyperlegible Next has no arrow glyph; arrows and icons are inline SVG (16px, 1.8 stroke, round caps).

## Layout

- **Desktop 1920 × 1080 (reference):** a 56px header band across the top. Below, two columns: map column (fluid) and log column (clamp 400 to 600px, about 31vw), split by a 1.5px graphite rule. The map column stacks map (fills), subtitle band (min 62px), and time budget (three tracks: 230px clock, fluid bar, 270px sum). The log column stacks verdict, safety rules, info rows, then the station log, which takes the remaining height and scrolls. Map overlays: crew display bottom-left (318px), map key top-right (236px), scale and attribution along the map foot, banners top-centre, debrief summary top-right.
- **Up to 1500px (covers 1440):** padding 16px, narrower row columns, crew display 282px, map key 214px, site name hidden in the band, subtitle 18px.
- **Up to 1180px:** button labels in the band collapse to icons; the sketch tag hides.
- **Under 1100px:** everything stacks into one column and the page scrolls; the band wraps with meta on its own line; map 72vh (min 420px); the log no longer scrolls on its own; the assumptions panel goes full screen.
- **At 700px (mobile order):** map, subtitle band, verdict, crew display, time budget, safety rules, info rows, map key (two-column list), station log. Crew display and map key leave the map and sit in flow; attribution hides; rule status words collapse to their icons.
- **Rhythm:** a page pad of 20px (16px compact); list rows 7px vertical with a 1px rule on top; gaps step 2, 6, 8, 10, 14px. Rule and log rows share one four-track grid: status or time (54px), label (fluid), value (104px), source (66px).

## Elevation & Depth

Flat. No drop shadows anywhere. Depth comes from three things only: a graphite fill (subtitle band, banners, tooltip, dark button), a pencil tint (red tint on a highlighted finding row, green tint inside the return area), and a 1.5px graphite outline around anything that floats over the map. The map key and readouts may sit on survey paper at 94 to 95% opacity so the terrain shows through.

### Named Rules
**The Hairline Not Shadow Rule.** A floating panel is separated by a 1.5px graphite border, never by a shadow or blur.

## Shapes

Square by default. Panels, crew display, legend, popovers, banners, subtitle band and cuff have 0 radius. Controls get a hairline 2px softening (segmented group 3px) so they read as pressable, not rounded. The only circles are science-station badges and the station markers on the map. Borders: 1.5px graphite for structure and controls, 1px rule for dividers inside lists. Source chips are 1px outlines in their own colour; an assumption chip is dashed.

## Components

### Header band
The book's cover. Cover-yellow, 56px, 1.5px graphite rule beneath. Left: house-and-return mark (26px, graphite SVG) and the wordmark (800, 21px). Then a meta group behind a divider: EVA number, site, sol, LMST clock in Mono, and a boxed "Sketch · synthetic data" tag. Right: grid switch, Layers and Assumptions (outline buttons), Play demo (dark button).

### Buttons
- **Shape:** near-square (2px), 1.5px graphite border, 38px high, 600 14px, icon plus label with 8px gap.
- **Outline (default):** transparent on paper; hover adds a 7% graphite wash; active moves down 1px.
- **Dark:** graphite fill, paper text; the demo control.
- **GO / ABORT:** green or red fill with matching border and paper text; used only for the decision ("Confirm ABORT through Drill site B"), next to an outline alternative ("Keep protected route").
- **Disabled:** 45% opacity, no movement.
- **Transport (on the subtitle band):** 34px square outline in paper at 55%; beat dots 24px Mono numerals, current beat filled cover yellow.

### Segmented control
A 1.5px graphite frame with 2px inset gap; 24px options, 600 12.5px. Pressed option is a graphite fill with paper text (`aria-pressed`). Used for crew-display skin (Console / Cuff) and time compression (×1, ×60, ×240).

### Switch
A square 34 × 20px track with a 1.5px graphite border and a 13px square thumb. On: graphite track, cover-yellow thumb slid 14px. Label beside it in 600 14px.

### Source chips
Mono 600 11px in a 1px outline, blue pencil, 2px radius ("NASA EVA", "USGS", "REMS", "COSPAR"). An assumption is graphite-2 with a dashed outline ("assum."). Hover adds blue tint and shows a tooltip. Every value in a rule or log row carries one.

### Verdict
Top of the log column. A caption authority line ("Planner recommendation · decision: Habitat control"), then the verdict word at poster scale in green, red or graphite-2, with an optional count. Below: a one-sentence explanation (17px/600), up to two fact rows with check or cross icons and Mono values, an optional red-outlined constraint strip, and the decision buttons. After a decision a status line confirms it ("Override logged · 150 m inside Drill site B · reason: ABORT").

### Rule rows and info rows
Four-track row grid: status (icon plus "pass", "fails", "fired" or "info"), label with caption (value context and limit), value in the aligned number cell with a small caption below ("max", "sketch", "so far"), source chip. A failed row turns label and value red. Info rows (radiation, Curiosity comparison) use the info icon and are never a gate.

### Station log rows
Same four-track grid; the first track holds the LMST time in Mono. Stations show a numbered blue badge (filled when done) and an image well (84 × 54px). Planned rows are graphite-2. Findings have a red title and carry the red-pencil ring around their time. A new row arrives with a half-second cover-yellow wash that fades. Newest at the bottom.

### Crew display (console and cuff skins)
Read-only. One component, two skins.
- **Console:** a 318px square paper panel with a 1.5px graphite border. Head: "Crew display" plus "read-only" caption and the skin segmented control. A state strip (800 15px plus Mono time): "ok" in green text, "due" as graphite fill with cover-yellow text, "home" as green fill. An optional red-tint warning strip. Then five values in a definition list: label with caption on the left, Mono 22px value on the right. ABORT replaces the list with a red fill block carrying the instruction at 26px/800 ("Return to shelter now").
- **Cuff:** the same values on a graphite forearm body between two outlined strap stubs, with four hardware keys (PAGE, MARK, LIGHT, ACK) in vertical Mono labels, and a paper screen of uppercase Mono rows (label 11px, value 25px). ABORT turns the screen head red. A note below states that the keys page through the values and nothing needs touch.

### Time budget
Under the subtitle band. Left: the EVA clock (Mono 30px) with LMST caption and time-compression control. Centre: an SVG bar against the 6:00 EVA limit: outbound in graphite with blue station blocks, return in spent grey, ABORT in red (tinted with dashed outline while it is an option, solid once confirmed), overruns in red with "over", backup hour as a dashed outline past the limit, the limit as a heavy graphite rule, a cover-yellow underline marking the time jump, and a red pointer for now. Right: a Mono sum table with a ruled total row; overrun rows red.

### Subtitle band
A graphite strip across the map foot, min 62px: beat label ("Beat 5/6 · Crew member injured", beat number in cover yellow), the sentence (20px/600, balanced), and the transport controls. It carries the story without narration.

### Map styling
Every line and label sits on a survey-paper halo (a wider paper stroke beneath; labels use a 3.5px paper paint-order stroke) so it reads on any terrain.
- **Return area:** survey-green 2.6px outline over a green fill at 24% opacity.
- **Pale band (ground lost to life support):** paper wash at 52% between the return area and the 60-minute line.
- **60-minute line:** graphite 2px, dashed 7/5, fixed; it never moves.
- **Protected zones:** blue-pencil 1.8px outline with 45° blue hatching (1.7px every 7px) over a light paper wash, always labelled "<name> · protected".
- **Routes:** planned route graphite 3px solid; protected alternative graphite dashed 8/5; ABORT option red dashed 10/5; ABORT route red 3.8px solid; drift track red dashed 4/3; Curiosity traverse graphite dotted 1.5/4.5. Route labels name the time ("Through Drill site B · 35 min").
- **Points:** habitat a 16px graphite square with paper edge; stations 11.5px-radius blue circles with Mono numerals; crew a filled dot with a faint outer ring, red when injured.
- **Survey grid (optional):** 100m graphite lines at 18%, every 500m at 34%; edge ticks in Mono.
- **Slope layer:** pale up to 10°, grey 10 to 20°, red over 20° (blocked).

### Signature: the red-pencil ring
A hand-drawn-looking red ellipse (2.4px, round caps) is the mark for a finding. It appears on the map around the place and in the log around the time, together. Hovering or selecting either highlights both: the ring thickens to 3.4px and the log row takes the red tint. Older findings fade to 40% until highlighted. A fresh ring draws itself once (stroke-dash reveal, 0.55s, cubic-bezier(.16, 1, .3, 1)); under reduced motion it appears instantly.

### Motion
State changes are short and functional: buttons 0.15s colour, switch thumb 0.2s, ring draw 0.55s, new log row 0.5s. The return area steps with the simulation clock with no easing. `prefers-reduced-motion` removes the ring draw, the row wash and control transitions.

## Do's and Don'ts

### Do:
- **Do** keep the pencil code: red for findings and ABORT, blue for stations, zones and sources, green for GO and the return area.
- **Do** pair every colour with a word, icon, hatching or dash pattern; colour is never the only signal.
- **Do** set every number in Atkinson Hyperlegible Mono, right-aligned in the number cell, with a source chip or "assumption".
- **Do** put a survey-paper halo under every map line and label.
- **Do** ring a finding in red pencil on the map and in the log at the same time, and link the highlight both ways.
- **Do** separate floating panels with a 1.5px graphite border on survey paper.
- **Do** write plain words in sentence case: "Habitat control", "Head home now", "compared with Curiosity".
- **Do** label synthetic or placeholder data on screen until it is replaced by recomputed values.
- **Do** self-host both fonts so the console runs offline.

### Don't:
- **Don't** use ruled-paper lines, paper textures or any other paper costume; the field book is a colour code, not a skin.
- **Don't** use handwriting or script fonts; the ring is the only hand-drawn mark.
- **Don't** use soft or drop shadows, blur or glow.
- **Don't** put kickers or eyebrows (small tracked uppercase labels) above headings.
- **Don't** use cover yellow as a warning or status colour.
- **Don't** round panels or cards; controls stop at 2px.
- **Don't** write "validated"; the route is "compared with Curiosity".
- **Don't** use NASA insignia (meatball, worm) or imply NASA endorsement; agency names appear only as source chips.
- **Don't** build the dark mission-control dashboard of KPI tiles and GO badges.
