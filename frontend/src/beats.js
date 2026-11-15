// The six beats from docs/demo-script.md, with their English subtitles. "watch" tells a viewer without a
// narrator where to look on the map (idea from Alex's navigation sketch).
export const BEATS = [
  { n: 1, title: 'Plan', sub: 'Habitat control picks the target and plans the Marswalk. The route avoids every protected site, and all four safety rules pass.',
    watch: 'On the map: the dark line is the route; the green area is where the crew can still get home in time.' },
  { n: 2, title: 'Time jump', sub: 'Time jump to EVA hour 4:45 at the station. The return area still matches the fixed 60-minute line.',
    watch: 'On the map: the crew at the station. The green area still reaches the dashed 60-minute line.' },
  { n: 3, title: 'The area pulls away', sub: 'Life support now sets the limit. The return area shrinks along the terrain and pulls away from the 60-minute line.',
    watch: 'On the map: the green area pulls back from the dashed 60-minute line; pale ground is now out of reach.' },
  { n: 4, title: 'Deviation caught', sub: 'The crew drifts toward a protected site. The console warns, and habitat control reroutes.',
    watch: 'On the map: red dashes show the drift, the red ring the warning, then the new route around the site.' },
  { n: 5, title: 'Crew member injured', sub: 'A crew member is injured and walking speed halves. Only the way through the protected zone gets them home in time.',
    watch: 'On the map: two dashed ways home. Dark: protected route, too long. Red: through the protected site, fits.' },
  { n: 6, title: 'Override, logged', sub: 'Habitat control overrides on purpose. The zone entry is logged: safety first, and the record shows it.',
    watch: 'On the map: the solid red line is the ABORT route home; the log records the metres inside the site.' },
];

// Crew view skin per beat (docs/demo-script.md, "Crew view")
export const SKIN_FOR_BEAT = { 1: 'values', 2: 'cuff', 3: 'hud', 4: 'hud', 5: 'hud', 6: 'cuff' };

// Forearm display mode per beat: the navigation map at the station (2) and on the ABORT way home (6)
export const CUFF_MODE_FOR_BEAT = { 2: 'map', 6: 'map' };
