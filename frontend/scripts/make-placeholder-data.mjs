// Writes placeholder data files in the shape of shared/data-contract.md into public/data/placeholder/.
// They let the console run before the pipeline and the routing engine deliver real files.
// Real: station and traverse positions (Curiosity waypoints, MMGIS). Placeholder: habitat position,
// station names, zone positions and buffer, routes (straight lines, no slope), sunset, sol.
// Run: node scripts/make-placeholder-data.mjs (from frontend/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { BOXWORK_PATH } from '../src/boxwork-path.js';

const OUT = new URL('../public/data/placeholder/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const M_PER_DEG = 3396190 * Math.PI / 180; // 59274.70 m
const WALK_M_PER_MIN = 1500 / 60;          // 1.5 km/h, level ground
const GENERATOR = 'frontend/scripts/make-placeholder-data.mjs';
const NOTE = 'PLACEHOLDER until the pipeline and the routing engine deliver real files';

const dist = (a, b) => {                   // [lon, lat] -> metres on the Mars sphere (equirectangular, small area)
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * M_PER_DEG * Math.cos(lat), (b[1] - a[1]) * M_PER_DEG);
};
const at = (sol) => {
  const p = BOXWORK_PATH.find((q) => q[2] === sol);
  if (!p) throw new Error(`no waypoint for sol ${sol}`);
  return [p[1], p[0]];                     // [lon, lat]
};
const write = (name, obj) => writeFileSync(new URL(name, OUT), JSON.stringify(obj, null, 1) + '\n');

const habitat = [137.3915, -4.7935];
write('scenario.json', {
  note: NOTE, generator: GENERATOR,
  placeholder_fields: ['habitat', 'scenario_station', 'eva_start_lmst', 'sol', 'sunset_lmst', 'sunrise_lmst', 'zone_buffer_m'],
  habitat,
  scenario_station: 1,       // the six beats play for this station; pick the real one by the data checks in docs/demo-script.md
  eva_number: 7,
  sol: 5120,
  eva_start_lmst: '09:00',
  sunrise_lmst: '05:50', sunset_lmst: '17:41',
  life_support_min: 360, backup_min: 60,
  walk_speed_kmh: 1.5, injury_factor: 0.5, caution_margin_min: 15,
  dose_rate_msv_per_day: 0.64,
  zone_buffer_m: 40,
  slope_comfort_deg: 10, slope_block_deg: 20,
  sources: {
    life_support_min: 'assumption (6 h EVA, xEVA)', walk_speed_kmh: 'assumption (1.5 km/h, after NASA TP-2009-214796)',
    injury_factor: 'assumption', caution_margin_min: 'assumption', dose_rate_msv_per_day: 'Hassler et al. 2014, Science 343',
    sunset_lmst: 'REMS (placeholder value)', slope_block_deg: 'xEVA suit requirement', zone_buffer_m: 'assumption (placeholder value)',
  },
});

const stationSols = [4600, 4650, 4711, 4823];
const stations = stationSols.map((sol, i) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: at(sol) },
  properties: { n: i + 1, name: `Station ${i + 1}`, reason: 'Placeholder: reason from the NASA boxwork blog posts', sol, image: null, elev_m: null },
}));
write('stations.geojson', { type: 'FeatureCollection', note: NOTE, generator: GENERATOR, features: stations });

const ring = (c, r) => {                   // polygon around [lon, lat], r metres, 32 vertices
  const lat = c[1] * Math.PI / 180, pts = [];
  for (let k = 0; k <= 32; k++) {
    const a = (k / 32) * 2 * Math.PI;
    pts.push([c[0] + (r * Math.cos(a)) / (M_PER_DEG * Math.cos(lat)), c[1] + (r * Math.sin(a)) / M_PER_DEG]);
  }
  return pts;
};
const zoneSols = [4621, 4752];
write('zones.geojson', {
  type: 'FeatureCollection', note: NOTE, generator: GENERATOR,
  features: zoneSols.map((sol, i) => ({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(at(sol), 40)] },
    properties: { id: String.fromCharCode(65 + i), name: `Drill site ${String.fromCharCode(65 + i)}`, drill_sol: sol, buffer_m: 40 },
  })),
});

const track = (a, b) => {                  // straight placeholder track, one vertex every 25 m
  const L = dist(a, b), n = Math.max(1, Math.ceil(L / 25)), v = [];
  for (let k = 0; k <= n; k++) {
    const f = k / n, p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], d = L * f;
    v.push({ lon: +p[0].toFixed(7), lat: +p[1].toFixed(7), d_m: +d.toFixed(1), t_min: +(d / WALK_M_PER_MIN).toFixed(2), elev_m: null, slope_deg: null });
  }
  return { vertices: v, length_m: +L.toFixed(1), minutes: +(L / WALK_M_PER_MIN).toFixed(2), zone_m: null, max_slope_deg: null, max_ttb_min: null };
};
write('routes.json', {
  note: NOTE + ' (straight lines, no slope, no zone avoidance)', generator: GENERATOR,
  stations: stations.map((s, i) => ({ station: i + 1, out: track(habitat, s.geometry.coordinates), ret: track(s.geometry.coordinates, habitat) })),
});

write('curiosity_traverse.geojson', {
  type: 'FeatureCollection', generator: GENERATOR,
  source: 'Curiosity waypoints, sols 4591-4839, MMGIS MSL_waypoints.json (real positions)',
  features: [{ type: 'Feature', properties: { name: 'Curiosity traverse (boxwork campaign)' },
    geometry: { type: 'LineString', coordinates: BOXWORK_PATH.map(([lat, lon]) => [lon, lat]) } }],
});
console.log('wrote placeholder data to public/data/placeholder/');
