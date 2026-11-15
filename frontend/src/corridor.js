// Return stages along the route (rule B, shared/data-contract.md), fading with distance from it.
// One picture on the console grid: every cell within REACH_M metres of the given tracks gets the
// colour of its stage (green: home in time with the caution margin to spare; yellow: under the margin;
// red: cannot get home in time from there) and an opacity that fades to nothing at REACH_M.
// Lookups only: the engine's time-to-base grid and the tracks being shown; nothing is searched.
import { M_PER_DEG } from './model.js';

export const REACH_M = 70;            // how far the stages reach out from the route
const CORE_M = 8;                     // full strength right on the route
const MAX_ALPHA = 0.62;
const RGB = { green: [31, 107, 69], yellow: [217, 163, 0], red: [200, 54, 31] };

const fieldMemo = new Map();
const keyOf = (tracks) => tracks.map((t) => { const v = t.vertices; return `${v.length}:${v[0].lon.toFixed(6)},${v[0].lat.toFixed(6)}>${v[v.length - 1].lon.toFixed(6)},${v[v.length - 1].lat.toFixed(6)}:${t.minutes.toFixed(2)}`; }).join('|');

// Distance from every nearby cell centre to the tracks: { idx: cell indices, w: weight 0..1 }
function field(g, tracks) {
  const key = keyOf(tracks);
  if (fieldMemo.has(key)) return fieldMemo.get(key);
  const { nx, ny, cell_m: cell, origin_m: o } = g.header;
  const lat0 = (o.y - ny * cell / 2) / M_PER_DEG, kx = Math.cos(lat0 * Math.PI / 180);
  // true metres east (x) and north (y) of the grid's north-west corner
  const X = (lon) => (lon * M_PER_DEG - o.x) * kx, Y = (lat) => o.y - lat * M_PER_DEG;
  const cx = (c) => (c + 0.5) * cell * kx, cy = (r) => (r + 0.5) * cell;
  const best = new Map();
  for (const t of tracks) {
    const v = t.vertices;
    for (let k = 0; k < v.length; k++) {
      const ax = X(v[k].lon), ay = Y(v[k].lat), b = v[Math.min(k + 1, v.length - 1)], bx = X(b.lon), by = Y(b.lat);
      const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - REACH_M) / (cell * kx))), c1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + REACH_M) / (cell * kx)));
      const r0 = Math.max(0, Math.floor((Math.min(ay, by) - REACH_M) / cell)), r1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by) + REACH_M) / cell));
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const px = cx(c), py = cy(r);
        const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
        const d = Math.hypot(px - ax - u * dx, py - ay - u * dy);
        if (d > REACH_M) continue;
        const i = r * nx + c, was = best.get(i);
        if (was === undefined || d < was) best.set(i, d);
      }
    }
  }
  const idx = new Int32Array(best.size), w = new Float32Array(best.size);
  let n = 0;
  for (const [i, d] of best) { idx[n] = i; w[n] = d <= CORE_M ? 1 : (1 - (d - CORE_M) / (REACH_M - CORE_M)) ** 1.6; n++; }
  const out = { idx, w };
  fieldMemo.set(key, out);
  if (fieldMemo.size > 12) fieldMemo.delete(fieldMemo.keys().next().value);
  return out;
}

export const stageAt = (spare, caution) => (!(spare >= 0) ? 'red' : spare < caution ? 'yellow' : 'green');

// The picture as a canvas of nx x ny pixels (one per cell), cached per tracks and limit.
// o: { L: return limit now (min), f: walking factor, which: 'penalized' | 'allowed', caution: min }
let canvasMemo = { key: '', cv: null };
export function corridorCanvas(model, tracks, o) {
  const g = model.grid;
  const ts = (tracks || []).filter((t) => t && t.vertices?.length > 1);
  if (!g || !ts.length) return null;
  const key = `${keyOf(ts)}|${o.L.toFixed(1)}|${o.f}|${o.which}|${o.caution}`;
  if (canvasMemo.key === key) return canvasMemo.cv;
  const { nx, ny } = g.header;
  const T = o.which === 'allowed' ? g.ttbAllowed : g.ttbPenalized;
  const { idx, w } = field(g, ts);
  const cv = canvasMemo.cv && canvasMemo.cv.width === nx ? canvasMemo.cv : Object.assign(document.createElement('canvas'), { width: nx, height: ny });
  const ctx = cv.getContext('2d'), img = ctx.createImageData(nx, ny);
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k], rgb = RGB[stageAt(o.L - T[i] * o.f, o.caution)], p = i * 4;
    img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = Math.round(255 * MAX_ALPHA * w[k]);
  }
  ctx.putImageData(img, 0, 0);
  canvasMemo = { key, cv };
  return cv;
}
