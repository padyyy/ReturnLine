// The six beats from docs/demo-script.md, with their English subtitles.
export const BEATS = [
  { n: 1, title: 'Plan', sub: 'Habitat control picks the target and plans the Marswalk. The route avoids every protected drill site, and all four safety rules pass.' },
  { n: 2, title: 'Time jump', sub: 'Time jump to EVA hour 4:45 at the station. The return area still matches the fixed 60-minute line.' },
  { n: 3, title: 'The area pulls away', sub: 'Life support now sets the limit. The return area shrinks along the terrain and pulls away from the 60-minute line.' },
  { n: 4, title: 'Deviation caught', sub: 'The crew drifts toward a protected drill site. The console warns, and habitat control reroutes.' },
  { n: 5, title: 'Crew member injured', sub: 'A crew member is injured and walking speed halves. Only the way through the protected zone gets them home in time.' },
  { n: 6, title: 'Override, logged', sub: 'Habitat control overrides on purpose. The zone entry is logged: safety first, and the record shows it.' },
];

// Crew view skin per beat (docs/demo-script.md, "Crew view")
export const SKIN_FOR_BEAT = { 1: 'values', 2: 'cuff', 3: 'hud', 4: 'hud', 5: 'hud', 6: 'cuff' };
