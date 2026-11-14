// Data checks for the six-beat story (docs/demo-script.md) on the real time-to-base grid.
// Searches habitat positions, the scenario station, the drift zone (beat 4) and the ABORT zone (beat 5-6)
// among Curiosity's waypoints and reports combinations where the story holds:
//   plan: home before EVA 6:00, time to shelter <= 60 min on the route (zones penalized);
//   beat 4: the crew can drift to 10 m from the drift zone on the way home;
//   beat 5: after the injury (speed x0.5) the protected way home is too long and the way through the
//           ABORT zone fits, and that way really enters the zone.
// Same walking model as pipeline/time_grid.py (edge time d / (v * exp(-3.5 |dz/d|)), 16 neighbours,
// no corner cutting, slope > 20 deg blocked, zones x20, clearance ring x3). Inputs: frontend/public/data/
// grid.json, elev_10m.f32, slope_10m.f32 (from pipeline/time_grid.py). A design tool: it picks
// placeholder positions; the grid the console shows is still written by pipeline/time_grid.py.
// Run: node scripts/find-scenario.mjs (from frontend/)
import { readFileSync } from 'node:fs';
import { BOXWORK_PATH } from '../src/boxwork-path.js';

const D = new URL('../public/data/', import.meta.url);
const g = JSON.parse(readFileSync(new URL('grid.json', D), 'utf8'));
const f32 = (n) => { const b = readFileSync(new URL(n, D)); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
const elevAll = f32('elev_10m.f32'), slopeAll = f32('slope_10m.f32');
const M = 3396190 * Math.PI / 180, CELL = g.cell_m;
const SPEED = 25, BLOCK = 20, BUFFER = +(process.env.BUFFER ?? 40), CLEAR = 30, WARN = 10, INJ = 2;

// work on a window around the waypoints (faster than the full grid)
const wp = BOXWORK_PATH.map(([lat, lon, sol]) => ({ lon, lat, sol }));
const toRC = (lon, lat) => [(g.origin_m.y - lat * M) / CELL, (lon * M - g.origin_m.x) / CELL];
const cr = wp.reduce((a, p) => a + toRC(p.lon, p.lat)[0], 0) / wp.length;
const cc = wp.reduce((a, p) => a + toRC(p.lon, p.lat)[1], 0) / wp.length;
const HALF = 140;
const R0 = Math.max(0, Math.round(cr - HALF)), C0 = Math.max(0, Math.round(cc - HALF));
const NY = Math.min(g.ny - R0, 2 * HALF), NX = Math.min(g.nx - C0, 2 * HALF), N = NX * NY;
const z = new Float64Array(N), blocked = new Uint8Array(N);
for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++) {
  const i = (R0 + r) * g.nx + (C0 + c), j = r * NX + c;
  z[j] = elevAll[i];
  blocked[j] = !(slopeAll[i] <= BLOCK) || Number.isNaN(elevAll[i]) ? 1 : 0;
}
const cosLat = Math.cos((g.origin_m.y / M - g.ny * CELL / 2 / M) * Math.PI / 180);
const lonOf = (c) => (g.origin_m.x + (C0 + c + 0.5) * CELL) / M, latOf = (r) => (g.origin_m.y - (R0 + r + 0.5) * CELL) / M;
const cellOf = (lon, lat) => { const [r, c] = toRC(lon, lat); const rr = Math.floor(r) - R0, ccc = Math.floor(c) - C0; return rr < 0 || ccc < 0 || rr >= NY || ccc >= NX ? -1 : rr * NX + ccc; };
const xy = (lon, lat) => [lon * M * cosLat, lat * M];
const dist = (a, b) => { const [ax, ay] = xy(a.lon, a.lat), [bx, by] = xy(b.lon, b.lat); return Math.hypot(ax - bx, ay - by); };

const MOVES = [];
for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
  const sr = Math.sign(dr), sc = Math.sign(dc);
  const via = Math.abs(dr) === 1 && Math.abs(dc) === 1 ? [[sr, 0], [0, sc]] : Math.abs(dc) === 2 ? [[0, sc], [sr, sc]] : Math.abs(dr) === 2 ? [[sr, 0], [sr, sc]] : [];
  MOVES.push({ dr, dc, via, d: Math.hypot(dc * CELL * cosLat, dr * CELL) });
}
// binary heap Dijkstra; mult = per-cell cost factor (zones), null for "allowed"
function search(start, mult) {
  const cost = new Float64Array(N).fill(Infinity), tim = new Float64Array(N).fill(Infinity), ptr = new Int32Array(N).fill(-1);
  const hk = [], hv = [];
  const push = (k, v) => { let i = hk.length; hk.push(k); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const t = [hk[0], hv[0]], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hk[l] < hk[m]) m = l; if (r < hk.length && hk[r] < hk[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return t; };
  cost[start] = 0; tim[start] = 0; push(0, start);
  while (hk.length) {
    const [c, i] = pop();
    if (c > cost[i]) continue;
    const r = (i / NX) | 0, col = i % NX;
    for (const mv of MOVES) {
      const rr = r + mv.dr, cc2 = col + mv.dc;
      if (rr < 0 || cc2 < 0 || rr >= NY || cc2 >= NX) continue;
      const j = rr * NX + cc2;
      if (blocked[j]) continue;
      let ok = true;
      for (const [vr, vc] of mv.via) if (blocked[(r + vr) * NX + (col + vc)]) { ok = false; break; }
      if (!ok) continue;
      const t = mv.d / (SPEED * Math.exp(-3.5 * Math.abs(z[j] - z[i]) / mv.d));
      const nc = c + t * (mult ? Math.max(mult[i], mult[j]) : 1);
      if (nc < cost[j]) { cost[j] = nc; ptr[j] = i; tim[j] = tim[i] + t; push(nc, j); }
    }
  }
  return { tim, ptr };
}
const centre = (i) => ({ lon: lonOf(i % NX), lat: latOf((i / NX) | 0) });
function pathFrom(field, i) { const out = [i]; while (field.ptr[out[out.length - 1]] !== -1 && out.length < N) out.push(field.ptr[out[out.length - 1]]); return out; }
function zoneMult(zones) {
  const m = new Float64Array(N).fill(1);
  for (let i = 0; i < N; i++) {
    const p = centre(i);
    for (const zn of zones) { const d = dist(p, zn) - BUFFER; if (d <= 0) { m[i] = 20; break; } if (d <= CLEAR) m[i] = Math.max(m[i], 3); }
  }
  return m;
}
const inZone = (p, zones) => zones.some((zn) => dist(p, zn) <= BUFFER);

// candidate places: waypoints deduplicated to 25 m
const sites = [];
for (const p of wp) if (cellOf(p.lon, p.lat) >= 0 && !blocked[cellOf(p.lon, p.lat)] && sites.every((q) => dist(p, q) > 25)) sites.push(p);
// optional: only these sols may be protected zones (real drill sites), e.g. ZONE_SOLS=4633,4818
const ZONE_SOLS = process.env.ZONE_SOLS ? process.env.ZONE_SOLS.split(',').map(Number) : null;
const zoneSites = ZONE_SOLS ? ZONE_SOLS.map((s) => wp.find((p) => p.sol === s)).filter(Boolean) : sites;
if (ZONE_SOLS && zoneSites.length !== ZONE_SOLS.length) console.log(`warning: not every ZONE_SOLS entry is a waypoint sol in src/boxwork-path.js`);
// habitat candidates: open, gentle cells 350-1200 m from the waypoint centre, every 60 m
const ctr = { lon: lonOf(cc - C0), lat: latOf(cr - R0) };
const habs = [];
for (let r = 3; r < NY - 3; r += 6) for (let c = 3; c < NX - 3; c += 6) {
  const i = r * NX + c, p = centre(i), d = dist(p, ctr);
  if (d < 350 || d > 1200 || blocked[i] || slopeAll[(R0 + r) * g.nx + C0 + c] > 6) continue;
  habs.push(i);
}
console.log(`window ${NX} x ${NY}, ${sites.length} waypoint sites, ${habs.length} habitat candidates, buffer ${BUFFER} m`);

const t0 = Date.now();
const results = [];
const cnt = { station: 0, pairs: 0, plan: 0, clean: 0, drift: 0, timing: 0, gap: 0, injury: 0 };
let bestGap = null; // largest protected-minus-through difference seen at the injury point
for (const h of habs) {
  const all = search(h, null);
  const penCache = new Map(); // penalized field per zone pair, shared by all stations
  for (const S of sites) {
    const sc = cellOf(S.lon, S.lat);
    const Tall = all.tim[sc];
    if (!(Tall <= 52)) continue;                       // plan: home by 6:00 with turnaround at 5:00, some reserve
    const r0 = pathFrom(all, sc).map(centre);           // direct way home, zones ignored
    if (r0.length < 8) continue;
    cnt.station++;
    // ABORT zone B: a site on the later part of the direct way; drift zone A: a site beside its early part
    const late = r0.slice(Math.floor(r0.length * 0.35));
    const early = r0.slice(1, Math.floor(r0.length * 0.45));
    const Bs = zoneSites.filter((q) => q !== S && dist(q, S) > BUFFER + 25 && late.some((p) => dist(p, q) < 15));
    const As = zoneSites.filter((q) => q !== S && dist(q, S) > BUFFER + 25 && early.some((p) => { const d = dist(p, q) - BUFFER; return d > WARN + 8 && d < 70; }));
    for (const B of Bs.slice(0, 3)) for (const A of As.slice(0, 3)) {
      if (A === B || dist(A, B) < 2 * BUFFER + 20) continue;
      const zones = [A, B];
      const key = `${A.sol}|${B.sol}`;
      if (!penCache.has(key)) penCache.set(key, search(h, zoneMult(zones)));
      const pen = penCache.get(key);
      cnt.pairs++;
      const Tp0 = pen.tim[sc];
      if (!(Tp0 <= 55)) continue;
      cnt.plan++;
      const ret = pathFrom(pen, sc);                    // planned way home (zones penalized)
      if (ret.some((i) => inZone(centre(i), zones))) continue;
      cnt.clean++;
      // beat 4: nearest point of the way home to zone A, drift to WARN m from its edge
      let qk = -1, qd = Infinity;
      ret.forEach((i, k) => { const d = dist(centre(i), A) - BUFFER; if (d < qd) { qd = d; qk = k; } });
      if (!(qd > WARN) || qd > 80 || qk < 2) continue;
      cnt.drift++;
      const tq = Tp0 - pen.tim[ret[qk]], tQ = 300 + tq;
      if (tQ - 2 < 301) continue;
      cnt.timing++;
      const q = centre(ret[qk]), k = (BUFFER + WARN) / dist(q, A);
      const Dp = { lon: A.lon + (q.lon - A.lon) * k, lat: A.lat + (q.lat - A.lat) * k };
      const dc = cellOf(Dp.lon, Dp.lat);
      if (dc < 0 || !Number.isFinite(pen.tim[dc])) continue;
      // reroute from D, injury 1.5 min after the reroute starts (console: reroute at tD + 0.5, injury at tQ + 3)
      const rer = pathFrom(pen, dc);
      const TD = pen.tim[dc];
      let P = rer[rer.length - 1];
      for (const i of rer) if (TD - pen.tim[i] >= 1.5) { P = i; break; }
      const tP = tQ + 3, L = Math.min(60, 360 - tP);
      const Tp = pen.tim[P], Ta = all.tim[P];
      if (!bestGap || Tp - Ta > bestGap.gap) bestGap = { gap: Tp - Ta, Tp, Ta, L, S: S.sol, A: A.sol, B: B.sol };
      if (Tp - Ta > 0.5) cnt.gap++;
      if (!(INJ * Tp > L && INJ * Ta <= L - 1)) continue;
      cnt.injury++;
      const ab = pathFrom(all, P);
      const zm = ab.filter((i) => inZone(centre(i), [B])).length * CELL;
      if (zm < 20) continue;
      results.push({ score: Tp - Ta, h: centre(h), S, A, B, Tplan: Tp0, tQ, tP, L, prot: INJ * Tp, thru: INJ * Ta, zm, home: tP + INJ * Ta });
    }
  }
}
results.sort((a, b) => b.score - a.score);
console.log(`${results.length} combinations hold the story, searched in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const r of results.slice(0, 8)) {
  console.log(`habitat ${r.h.lon.toFixed(6)}, ${r.h.lat.toFixed(6)} | station sol ${r.S.sol} | drift zone sol ${r.A.sol} | ABORT zone sol ${r.B.sol}` +
    ` | plan home ${r.Tplan.toFixed(0)} min | injury at EVA ${Math.floor(r.tP / 60)}:${String(Math.round(r.tP % 60)).padStart(2, '0')}` +
    ` | limit ${r.L.toFixed(0)} | protected ${r.prot.toFixed(0)} vs through zone ${r.thru.toFixed(0)} min | ${r.zm} m in zone | home EVA ${(r.home / 60 | 0)}:${String(Math.round(r.home % 60)).padStart(2, '0')}`);
}
console.log('passed each stage:', JSON.stringify(cnt));
if (bestGap) console.log(`largest protected-minus-through gap at the injury point: ${bestGap.gap.toFixed(1)} min (protected ${bestGap.Tp.toFixed(1)}, through ${bestGap.Ta.toFixed(1)}, limit/2 ${(bestGap.L / 2).toFixed(1)}; station ${bestGap.S}, drift ${bestGap.A}, ABORT zone ${bestGap.B})`);
