// The six steps of the emergency rehearsal (docs/demo-script.md), told as in Alex's navigation sketch.
// Every sentence is built from facts the rehearsal measured on the data (rehearsal.js collectFacts):
// station and zone names, times, "fits" or "too long". Nothing here is a typed-in number.
import { hm, R } from './format.js';

export function storySteps(F) {
  const Z = F.zone ?? 'the protected zone';
  const zones = F.nZones === 1 ? 'the protected zone' : `all ${F.nZones} protected zones`;
  return [
    { n: 1, nav: 'Plan', title: 'The plan', view: 'data',
      text: `Habitat control plans the Marswalk to ${F.station} and back. ${F.zonesAvoided ? `The route avoids ${zones}` : 'The route crosses a protected zone'}, and ${F.rulesPass === 4 ? 'all four safety rules pass' : `${F.rulesPass} of 4 safety rules pass${F.rulesOpen ? `, ${F.rulesOpen} still open` : ''}`}.`,
      watch: 'On the map: the dark line is the planned route. The green area is where the crew can still get home in time.',
      crew: 'The plan in numbers, as the crew walks out.' },
    { n: 2, nav: 'Time jump', title: `Time jump to EVA hour ${hm(F.jump)}`, view: 'hud',
      text: `The quiet hours are skipped. The crew works at ${F.station}. The return area still equals the fixed 60-minute line.`,
      watch: 'On the map: the crew marker at the station. The orange line on the time bar shows the skipped hours.',
      crew: 'The helmet HUD at the station. The ring is green: home in time.' },
    { n: 3, nav: 'The area shrinks', title: 'The return area pulls away', view: 'nav',
      text: 'The crew heads home. Less than an hour of life support is left, so life support now sets the limit: the green area shrinks.',
      watch: 'On the map: the green area pulls away from the dashed 60-minute line.',
      crew: 'The navigator shows the same shrinking area from where the crew stands.' },
    { n: 4, nav: 'Deviation', title: 'Deviation caught', view: 'hud',
      text: F.drift ? `The crew drifts toward ${Z}, a protected zone. The console warns ${F.warnM} m before it, and habitat control sends the engine's way around: +${R(F.detour)} min.`
        : 'This data has no protected zone near the way home, so there is no drift to catch. The crew walks on.',
      watch: F.drift ? 'On the map: red dashes show the drift, the red ring marks the finding, then the new route appears.' : 'On the map: the crew on its way home.',
      crew: 'The helmet HUD warns before the protected zone.' },
    { n: 5, nav: 'Injury', title: 'Crew member injured', view: 'hud',
      text: `A crew member is injured, so walking speed halves. ${F.protFits == null ? 'The ways home need the time-to-base grid.' : `The protected route home ${F.protFits ? 'still fits' : 'is now too long'} (${R(F.prot)} min). ${F.abrtFits ? `The way through ${F.abortZone ?? 'the zones'} fits (${R(F.abrt)} min).` : `The way through the zones is too long as well (${R(F.abrt)} min).`}`}`,
      watch: 'On the map: dark dashes are the protected route, red dashes the way through the zone.',
      crew: 'The helmet HUD turns red: ABORT, stand by for the route.' },
    { n: 6, nav: 'Override', title: 'Override, logged', view: 'nav',
      text: F.zoneM > 0 ? `Crew safety comes before planetary protection: habitat control sends the crew through ${F.abortZone} on purpose. The zone entry is logged with its reason.`
        : 'Habitat control confirms the ABORT. The engine\'s fastest way home touches no protected zone, so nothing needs an override.',
      watch: 'On the map: the red ABORT route home.',
      crew: 'The navigator leads the crew home on the ABORT route.' },
  ];
}
