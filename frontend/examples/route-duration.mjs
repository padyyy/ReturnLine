// Uses real routes and scenario parameters, falling back only for scenario.json.
import { loadInputs } from '../scripts/check-route-times.mjs';
import { sectionsFromTrack } from '../src/route-duration-input.js';
import { estimateDuration } from '../src/route-duration.js';

const { routes, scenario } = await loadInputs();
const track = routes.stations[0].ret;
const sections = sectionsFromTrack(track);
console.log(estimateDuration(sections, {
  model: { baseSpeedMps: scenario.walk_speed_kmh / 3.6 },
}));
