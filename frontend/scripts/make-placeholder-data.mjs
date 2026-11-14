// Writes placeholder data files in the shape of shared/data-contract.md into public/data/placeholder/.
// They let the console run before the pipeline and the routing engine deliver real files.
// Real: station, zone centre and traverse positions (Curiosity waypoints, MMGIS).
// Placeholder: habitat position, station names, which waypoints are stations and drill sites, zone
// buffer, sunset, sol, and the grid: flat ground at 1.5 km/h, no slope, no ridges. The grid search
// below stands in for the routing engine (C#) and is NOT the product's routing; real files replace it.
// Run: npm run data:placeholder (from frontend/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { BOXWORK_PATH } from '../src/boxwork-path.js';

const OUT = new URL('../public/data/placeholder/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const M_PER_DEG = 3396190 * Math.PI / 180; // 59274.70 m; eqc: x = lon° × M_PER_DEG, y = lat° × M_PER_DEG
const SPEED = 1500 / 60;                   // m per minute, 1.5 km/h on level ground
const CELL = 10;                            // m, projected
const HALF = 1700;                          // m around the habitat, so the 60-minute line (1.5 km) fits
const ZONE_PENALTY = 20;                    // cost factor inside protected zones (penalized variant)
const BUFFER = 40;                          // m, zone buffer (placeholder value)
const CLEARANCE = 30;                       // m outside the buffer where routes are mildly penalized, so they keep distance (assumption)
const CLEARANCE_PENALTY = 3;                // cost factor in that ring (soft: a route may still pass when the detour is long)
const WARN = 10;                            // m to the buffer edge below which the console warns (assumption, as in the design sketch)
const GENERATOR = 'frontend/scripts/make-placeholder-data.mjs';
const NOTE = 'PLACEHOLDER until the pipeline and the routing engine deliver real files';

const at = (sol) => {
  const p = BOXWORK_PATH.find((q) => q[2] === sol);
  if (!p) throw new Error(`no waypoint for sol ${sol}`);
  return [p[1], p[0]];                     // [lon, lat]
};
const distM = (a, b) => {                  // [lon, lat] -> ground metres (small area)
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * M_PER_DEG * Math.cos(lat), (b[1] - a[1]) * M_PER_DEG);
};
const write = (name, obj) => writeFileSync(new URL(name, OUT), JSON.stringify(obj, null, 1) + '\n');
const writeBin = (name, arr) => writeFileSync(new URL(name, OUT), Buffer.from(arr.buffer)); // little-endian on x86/ARM

// ---------- layout (placeholder choices on real waypoints) ----------
// Station 1 is the scenario station: its way home passes drill site B, so the ABORT in beat 5-6 has a zone to cross.
const stationSols = [4591, 4647, 4673, 4820];
const zoneSols = [4623, 4839];
const S1 = at(stationSols[0]);
const ZB = at(zoneSols[1]);
// habitat 300 m beyond drill site B, on the line from station 1 through the zone
const lat0 = Math.cos(S1[1] * Math.PI / 180);
const vx = (ZB[0] - S1[0]) * M_PER_DEG * lat0, vy = (ZB[1] - S1[1]) * M_PER_DEG, vl = Math.hypot(vx, vy);
const k = (vl + 300) / vl;
const habitat = [+(S1[0] + (ZB[0] - S1[0]) * k).toFixed(6), +(S1[1] + (ZB[1] - S1[1]) * k).toFixed(6)];

const ring = (c, r) => {                   // polygon around [lon, lat], r metres, 32 vertices
  const la = c[1] * Math.PI / 180, pts = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    pts.push([+(c[0] + (r * Math.cos(a)) / (M_PER_DEG * Math.cos(la))).toFixed(7), +(c[1] + (r * Math.sin(a)) / M_PER_DEG).toFixed(7)]);
  }
  return pts;
};
const zones = zoneSols.map((sol, i) => ({ id: String.fromCharCode(65 + i), name: `Drill site ${String.fromCharCode(65 + i)}`, sol, c: at(sol), ring: ring(at(sol), BUFFER) }));
const inRing = (p, rg) => {                // ray casting on lon/lat, fine for small polygons
  let inside = false;
  for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) {
    const [xi, yi] = rg[i], [xj, yj] = rg[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
for (const sol of stationSols) {           // a station inside a protected zone breaks the story
  for (const z of zones) if (distM(at(sol), z.c) < BUFFER + 20) throw new Error(`station at sol ${sol} is within ${BUFFER + 20} m of ${z.name}`);
}

// ---------- scenario ----------
write('scenario.json', {
  note: NOTE, generator: GENERATOR,
  placeholder_fields: ['habitat', 'scenario_station', 'drift_zone', 'eva_start_lmst', 'sol', 'sunset_lmst', 'sunrise_lmst', 'zone_buffer_m', 'zone_clearance_m', 'zone_warn_m'],
  habitat,
  scenario_station: 1,                     // the six beats play for this station; pick the real one by the data checks in docs/demo-script.md
  drift_zone: 'A',                         // beat 4 drifts toward this zone; the ABORT in beat 5-6 then still crosses drill site B
  eva_number: 7,
  sol: 5120,
  eva_start_lmst: '09:00',
  sunrise_lmst: '05:50', sunset_lmst: '17:41',
  life_support_min: 360, backup_min: 60,
  walk_speed_kmh: 1.5, injury_factor: 0.5, caution_margin_min: 15,
  dose_rate_msv_per_day: 0.64,
  zone_buffer_m: BUFFER,
  zone_clearance_m: CLEARANCE,
  zone_warn_m: WARN,
  slope_comfort_deg: 10, slope_block_deg: 20,
  sources: {
    life_support_min: 'assumption (6 h EVA, xEVA)', walk_speed_kmh: 'assumption (1.5 km/h, after NASA TP-2009-214796)',
    injury_factor: 'assumption', caution_margin_min: 'assumption', dose_rate_msv_per_day: 'Hassler et al. 2014, Science 343',
    sunset_lmst: 'REMS (placeholder value)', slope_block_deg: 'xEVA suit requirement', zone_buffer_m: 'assumption (placeholder value)',
    zone_clearance_m: 'assumption (placeholder value)', zone_warn_m: 'assumption (design sketch value)',
  },
});

const stations = stationSols.map((sol, i) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: at(sol) },
  properties: { n: i + 1, name: `Station ${i + 1}`, reason: 'Placeholder: reason from the NASA boxwork blog posts', sol, image: null, elev_m: null },
}));
write('stations.geojson', { type: 'FeatureCollection', note: NOTE, generator: GENERATOR, features: stations });
write('zones.geojson', {
  type: 'FeatureCollection', note: NOTE + ' (centres are real Curiosity waypoints; which ones are drill sites is a placeholder)', generator: GENERATOR,
  features: zones.map((z) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [z.ring] }, properties: { id: z.id, name: z.name, drill_sol: z.sol, buffer_m: BUFFER } })),
});

// ---------- grid (stand-in for the routing engine) ----------
const hx = habitat[0] * M_PER_DEG, hy = habitat[1] * M_PER_DEG;
const x0 = Math.floor((hx - HALF) / CELL) * CELL, y0 = Math.ceil((hy + HALF) / CELL) * CELL;
const nx = Math.ceil((2 * HALF) / CELL) + 1, ny = nx, N = nx * ny;
const center = (i) => [(x0 + ((i % nx) + 0.5) * CELL) / M_PER_DEG, (y0 - (Math.floor(i / nx) + 0.5) * CELL) / M_PER_DEG];
const cellOf = (p) => {
  const c = Math.floor((p[0] * M_PER_DEG - x0) / CELL), r = Math.floor((y0 - p[1] * M_PER_DEG) / CELL);
  return c < 0 || r < 0 || c >= nx || r >= ny ? -1 : r * nx + c;
};
const inZone = new Uint8Array(N), nearZone = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const p = center(i);
  if (zones.some((z) => inRing(p, z.ring))) inZone[i] = 1;
  else if (zones.some((z) => distM(p, z.c) - BUFFER <= CLEARANCE)) nearZone[i] = 1;
}

const cosLat = Math.cos(habitat[1] * Math.PI / 180);
const OFF = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]; // 16 neighbours [dr, dc]
const STEP = OFF.map(([dr, dc]) => Math.hypot(dc * CELL * cosLat, dr * CELL) / SPEED); // minutes

function search(penalized) {               // Dijkstra from the habitat; time = real walking time along the chosen way
  const cost = new Float64Array(N).fill(Infinity), time = new Float32Array(N).fill(Infinity), ptr = new Int32Array(N).fill(-1);
  const hk = [], hv = [];                  // binary heap of (cost, index)
  const push = (key, v) => {
    let i = hk.length; hk.push(key); hv.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; }
  };
  const pop = () => {
    const top = [hk[0], hv[0]], lk = hk.pop(), lv = hv.pop();
    if (hk.length) {
      hk[0] = lk; hv[0] = lv; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < hk.length && hk[l] < hk[m]) m = l;
        if (r < hk.length && hk[r] < hk[m]) m = r;
        if (m === i) break;
        [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m;
      }
    }
    return top;
  };
  const s = cellOf(habitat);
  cost[s] = 0; time[s] = 0; push(0, s);
  while (hk.length) {
    const [c, i] = pop();
    if (c > cost[i]) continue;
    const r = Math.floor(i / nx), col = i % nx;
    for (let kk = 0; kk < 16; kk++) {
      const rr = r + OFF[kk][0], cc = col + OFF[kk][1];
      if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue;
      const j = rr * nx + cc;
      const mult = !penalized ? 1 : (inZone[i] || inZone[j]) ? ZONE_PENALTY : (nearZone[i] || nearZone[j]) ? CLEARANCE_PENALTY : 1;
      const nc = c + STEP[kk] * mult;
      if (nc < cost[j]) { cost[j] = nc; ptr[j] = i; time[j] = time[i] + STEP[kk]; push(nc, j); }
    }
  }
  return { time, ptr };
}
const pen = search(true), alw = search(false);
writeBin('ttb_penalized.f32', pen.time); writeBin('ptr_penalized.i32', pen.ptr);
writeBin('ttb_allowed.f32', alw.time); writeBin('ptr_allowed.i32', alw.ptr);
const w = x0 / M_PER_DEG, e = (x0 + nx * CELL) / M_PER_DEG, n = y0 / M_PER_DEG, s = (y0 - ny * CELL) / M_PER_DEG;
write('grid.json', {
  note: NOTE + ' (flat ground, no slope, no ridges; the grid search stands in for the routing engine)', generator: GENERATOR, placeholder: true,
  crs: '+proj=eqc +lat_ts=0 +lon_0=0 +R=3396190 +units=m (Mars 2000 sphere, as the USGS Gale DEM)',
  cell_m: CELL, nx, ny,
  origin_m: { x: x0, y: y0 }, origin_is: 'north-west corner of cell (row 0, col 0), projected metres',
  order: 'row 0 = north, columns west to east, index = row * nx + col',
  bbox_deg: [w, s, e, n].map((v) => +v.toFixed(7)),
  files: { ttb_penalized: 'ttb_penalized.f32', ttb_allowed: 'ttb_allowed.f32', ptr_penalized: 'ptr_penalized.i32', ptr_allowed: 'ptr_allowed.i32' },
  dtype: { ttb: 'float32 little-endian, minutes to the habitat, +Infinity where unreachable', ptr: 'int32 little-endian, index of the next cell towards the habitat, -1 at the habitat and where unreachable' },
  habitat_cell: cellOf(habitat),
  walk_speed_kmh: 1.5, slope_penalty: 'none (placeholder: flat ground)', zone_penalty_factor: ZONE_PENALTY,
  zone_clearance_m: CLEARANCE, zone_clearance_factor: CLEARANCE_PENALTY, neighbours: 16,
  source: 'placeholder', date: new Date().toISOString().slice(0, 10),
});

// ---------- routes from the pointers (zones penalized) ----------
function track(points) {
  let d = 0;
  const v = points.map((p, i) => {
    if (i) d += distM(points[i - 1], p);
    return { lon: +p[0].toFixed(7), lat: +p[1].toFixed(7), d_m: +d.toFixed(1), t_min: +(d / SPEED).toFixed(2), elev_m: null, slope_deg: null };
  });
  let zoneM = 0, maxT = 0;
  for (let i = 1; i < points.length; i++) {
    const mid = [(points[i - 1][0] + points[i][0]) / 2, (points[i - 1][1] + points[i][1]) / 2];
    if (zones.some((z) => inRing(mid, z.ring))) zoneM += distM(points[i - 1], points[i]);
  }
  for (const p of points) maxT = Math.max(maxT, pen.time[cellOf(p)]);
  return { vertices: v, length_m: +d.toFixed(1), minutes: +(d / SPEED).toFixed(2), zone_m: +zoneM.toFixed(1), max_slope_deg: null, max_ttb_min: +maxT.toFixed(1) };
}
function homeward(from) {                  // station -> habitat along ptr_penalized
  const pts = [from];
  let i = cellOf(from);
  while (pen.ptr[i] !== -1) { i = pen.ptr[i]; pts.push(center(i)); }
  pts[pts.length - 1] = habitat;
  return pts.length > 1 ? pts : [from, habitat];
}
write('routes.json', {
  note: NOTE + ' (from the placeholder grid: flat ground, zones penalized)', generator: GENERATOR,
  stations: stations.map((st, i) => {
    const back = homeward(st.geometry.coordinates);
    return { station: i + 1, out: track([...back].reverse()), ret: track(back) };
  }),
});

write('curiosity_traverse.geojson', {
  type: 'FeatureCollection', generator: GENERATOR,
  source: 'Curiosity waypoints, sols 4591-4839, MMGIS MSL_waypoints.json (real positions)',
  features: [{ type: 'Feature', properties: { name: 'Curiosity traverse (boxwork campaign)' },
    geometry: { type: 'LineString', coordinates: BOXWORK_PATH.map(([lat, lon]) => [lon, lat]) } }],
});

console.log(`habitat ${habitat.join(', ')}; grid ${nx} x ${ny} cells of ${CELL} m`);
stations.forEach((st, i) => {
  const b = homeward(st.geometry.coordinates);
  const len = b.reduce((a, p, j) => a + (j ? distM(b[j - 1], p) : 0), 0);
  console.log(`station ${i + 1}: ${distM(habitat, st.geometry.coordinates).toFixed(0)} m straight, route ${len.toFixed(0)} m, ${(len / SPEED).toFixed(1)} min`);
});
console.log('wrote placeholder data to public/data/placeholder/');
