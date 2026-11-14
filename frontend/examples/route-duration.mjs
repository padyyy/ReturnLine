import { estimateDuration } from '../src/route-duration.js';
import { parseRoute } from '../src/route-duration-input.js';

const pathJson = JSON.stringify({
  nodes: [
    { x: 0, y: 0, elevation_m: -3600, roughness_m: 0 },
    { x: 1, y: 0, elevation_m: -3600, roughness_m: 0.2 },
    { x: 2, y: 1, elevation_m: -3599.8, roughness_m: 0.1 },
    { x: 3, y: 1, elevation_m: -3599.85, roughness_m: 0 },
  ],
});
console.log(estimateDuration(parseRoute(pathJson), {
  model: { baseSpeedMps: 1.5 / 3.6 },
  nowMinute: 0.05,
  events: [{ atMinute: 0.05, speedFactor: 0.5, delayMinutes: 1 }],
}));
