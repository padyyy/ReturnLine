// The six steps of the emergency rehearsal (docs/demo-script.md), told as in Alex's navigation sketch.
// Every sentence is built from facts the rehearsal measured on the data (rehearsal.js collectFacts):
// station and zone names, times, "fits" or "too long". Nothing here is a typed-in number.
import { hm, R } from './format.js';

export function storySteps(F) {
  const Z = F.zone ?? 'the protected zone';
  const zones = F.nZones === 1 ? 'the protected zone' : `all ${F.nZones} protected zones`;
  const noZones = !F.nZones;   // no protected zone polygons yet: the boxwork protection mask speaks for itself
  // planetary protection on the planned route: zone polygons when there are any, else the protection mask
  const pp = !noZones ? (F.zonesAvoided ? `The route avoids ${zones}` : 'The route crosses a protected zone')
    : F.protM > 0 ? `The route runs ${R(F.protM)} m inside the boxwork protection zone, because the station lies inside it; the entry is logged`
    : 'The route stays outside the protected zones';
  const rules = F.rulesPass === 4 && !F.rulesWarn?.length ? 'all four safety rules pass'
    : `${F.rulesPass} of 4 safety rules pass${F.rulesWarn?.length ? ` (${F.rulesWarn.join(', ')} warns)` : ''}${F.rulesOpen ? `, ${F.rulesOpen} still open` : ''}`;
  const tight = F.spare3 < F.caution;
  return [
    { n: 1, nav: 'Plan', title: 'The plan', view: 'data',
      text: `Habitat control plans the Marswalk to ${F.station} and back. ${pp}. ${rules[0].toUpperCase()}${rules.slice(1)}.`,
      watch: 'On the map: the dark line is the planned route; the band along it shows the return stages (green: home in time).',
      crew: 'The plan in numbers, as the crew walks out.' },
    { n: 2, nav: 'Time jump', title: `Time jump to EVA hour ${hm(F.jump)}`, view: 'hud',
      text: `The quiet hours are skipped. The crew works at ${F.station}. Life support still lasts more than an hour, so the 60-minute rule sets the return limit and the band along the route stays green.`,
      watch: 'On the map: the crew marker at the station. The dashed line on the time bar shows the skipped hours.',
      crew: 'The helmet HUD at the station. The ring is green: home in time.' },
    { n: 3, nav: 'Life support sets the limit', title: 'Life support sets the limit', view: 'nav',
      text: `The crew heads home at ${F.lmstTurn}. Less than an hour of life support is left, so life support now sets the return limit: ${R(F.L3)} min. The rest of the way home takes ${R(F.back3)} min, so ${R(Math.max(0, F.spare3))} min are to spare${tight ? ' and the band turns yellow' : ' and the band stays green'}.`,
      watch: 'On the map: the band along the way home turns yellow under 15 minutes to spare and red where the crew could not get home in time.',
      crew: 'The navigator on the Plain map shows the same band from where the crew stands.' },
    { n: 4, nav: F.drift ? 'Deviation' : 'Way home', title: F.drift ? 'Deviation caught' : 'On the way home', view: 'hud',
      text: F.drift ? `The crew drifts toward ${Z}, a protected zone. The console warns ${F.warnM} m before it, and habitat control sends the engine's way around: +${R(F.detour)} min.`
        : `The crew walks home on the planned route. No protected zone lies beside the way home, so there is nothing to steer around. Life support left: ${hm(F.ls4)}.`,
      watch: F.drift ? 'On the map: red dashes show the drift, the red ring marks the finding, then the new route appears.' : 'On the map: the crew on its way home.',
      crew: F.drift ? 'The helmet HUD warns before the protected zone.' : 'The helmet HUD counts down life support.' },
    { n: 5, nav: 'Injury', title: 'Crew member injured', view: 'hud',
      text: `A crew member is injured, so walking speed halves. An injury means ABORT: return to shelter now. ${F.protFits == null ? 'The ways home need the time-to-base grid.'
        : noZones ? `At half speed the way home takes ${R(F.prot)} min, ${F.protFits ? `well within the ${R(F.lsInj)} min of life support left` : 'longer than the return limit allows'}.`
        : `The protected route home ${F.protFits ? 'still fits' : 'is now too long'} (${R(F.prot)} min). ${F.abrtFits ? `The way through ${F.abortZone ?? 'the zones'} fits (${R(F.abrt)} min).` : `The way through the zones is too long as well (${R(F.abrt)} min).`}`}`,
      watch: noZones ? 'On the map: the dashed way home at injured walking speed.' : 'On the map: dark dashes are the protected route, red dashes the way through the zone.',
      crew: 'The helmet HUD turns red: ABORT, stand by for the route.' },
    { n: 6, nav: F.zoneM > 0 ? 'Override' : 'Home', title: F.zoneM > 0 ? 'Override, logged' : 'Home', view: 'nav',
      text: F.zoneM > 0 ? `Crew safety comes before planetary protection: habitat control sends the crew through ${F.abortZone} on purpose. The zone entry is logged with its reason.`
        : 'Habitat control confirms the ABORT and the crew walks home on the engine\'s fastest way. It touches no protected zone, so no override is needed.',
      watch: 'On the map: the red ABORT route home.',
      crew: 'The navigator leads the crew home on the ABORT route.' },
  ];
}
