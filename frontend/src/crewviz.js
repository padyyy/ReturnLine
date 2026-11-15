// Drawn crew views, ported 1:1 from Alex's navigation sketch (docs/design/navigation-hud-sketch.html):
// the forearm tablet's navigation map (canvas, heading up, crew arrow fixed) and the helmet HUD (SVG,
// compass ring with a minimap). Everything comes from the engine's grid and tracks and from a view
// object built by nav.js or rehearsal.js; nothing is searched here.
import { M_PER_DEG, onTrack, distM } from './model.js';
import { contour } from './contour.js';

const BASE = import.meta.env.BASE_URL;
export const ZOOMS = [0.45, 0.75, 1.2, 1.9, 3];   // screen px per metre on the navigation map
const HUD_RANGE = 250;                             // metres from the HUD centre to its rim
export const STAGE = {
  green: { c: '#1F6B45', bg: '#1F6B45', fg: '#EDF0E6', tint: 'rgba(31,107,69,.22)', px: [31, 107, 69, 56], word: 'Home in time', hud: 'HOME IN TIME' },
  yellow: { c: '#D9A300', bg: '#D9A300', fg: '#2B2D2F', tint: 'rgba(217,163,0,.30)', px: [217, 163, 0, 77], word: 'Head home soon', hud: 'HEAD HOME SOON' },
  red: { c: '#C8361F', bg: '#C8361F', fg: '#EDF0E6', tint: 'rgba(200,54,31,.24)', px: [200, 54, 31, 61], word: 'ABORT: return to shelter now', hud: 'ABORT · RETURN NOW' },
};

// ---------- geometry in a local metric frame around p (x east, y south) ----------
export const frame = (p) => {
  const kx = M_PER_DEG * Math.cos(p.lat * Math.PI / 180), ky = M_PER_DEG;
  return { kx, ky, xy: (q) => [(q.lon - p.lon) * kx, -(q.lat - p.lat) * ky] };
};
export const angNorm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export const angDiff = (a, b) => angNorm(a - b + Math.PI) - Math.PI;
export const bearing = (a, b) => { const [x, y] = frame(a).xy(b); return Math.atan2(x, -y); }; // 0 = north, clockwise
export const compass8 = (a) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(angNorm(a) / (Math.PI / 4)) % 8];

// Walking direction on a timed track at track time tt: from one minute behind to one minute ahead; null when standing
export function trackBearing(track, tt) {
  if (!track) return null;
  const a = onTrack(track, 0, Math.max(0, tt - 1)), b = onTrack(track, 0, Math.min(track.minutes, tt + 1));
  return distM(a, b) >= 1 ? bearing(a, b) : null;
}

// ---------- grid helpers: return stages (rule B) and contour lines, cached ----------
const cellLL = (g, r, c) => ({ lon: (g.header.origin_m.x + (c + 0.5) * g.header.cell_m) / M_PER_DEG, lat: (g.header.origin_m.y - (r + 0.5) * g.header.cell_m) / M_PER_DEG });
const gridBox = (g) => { const h = g.header; return { w: h.origin_m.x / M_PER_DEG, n: h.origin_m.y / M_PER_DEG, e: (h.origin_m.x + h.nx * h.cell_m) / M_PER_DEG, s: (h.origin_m.y - h.ny * h.cell_m) / M_PER_DEG }; };
let stageMemo = { key: '', cv: null };
function stageCanvas(model, L, f, which, caution) {
  const g = model.grid;
  const key = `${L.toFixed(1)}|${f}|${which}`;
  if (stageMemo.key === key) return stageMemo.cv;
  const { nx, ny } = g.header;
  const T = which === 'allowed' ? g.ttbAllowed : g.ttbPenalized;
  const cv = stageMemo.cv || document.createElement('canvas');
  cv.width = nx; cv.height = ny;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(nx, ny);
  for (let i = 0; i < nx * ny; i++) {
    const spare = L - T[i] * f;
    img.data.set(!(spare >= 0) ? STAGE.red.px : spare < caution ? STAGE.yellow.px : STAGE.green.px, i * 4);
  }
  ctx.putImageData(img, 0, 0);
  stageMemo = { key, cv };
  return cv;
}
const lineMemo = new Map();
export function gridLines(model, which, level, f = 1) {   // contour lines of a time grid, in lon/lat
  const g = model.grid;
  if (!g || !(level > 0)) return [];
  const key = `${which}|${level.toFixed(2)}|${f}`;
  if (!lineMemo.has(key)) {
    const T = which === 'allowed' ? g.ttbAllowed : g.ttbPenalized;
    lineMemo.set(key, contour(T, g.header.nx, g.header.ny, level, f).map((ln) => ln.map(([r, c]) => cellLL(g, r, c))));
    if (lineMemo.size > 40) lineMemo.delete(lineMemo.keys().next().value);
  }
  return lineMemo.get(key);
}

// ---------- images: orthophoto and slope picture from the pipeline ----------
const images = {};
function image(url, onReady) {
  if (!images[url]) { const im = new Image(); im.onload = () => onReady && onReady(); im.src = url; images[url] = im; }
  const im = images[url];
  return im.complete && im.naturalWidth ? im : null;
}
export const orthoImage = (model, onReady) => (model.ortho ? image(`${BASE}maps/${model.ortho.image}`, onReady) : null);
export const layerImage = (ly, onReady) => image(`${BASE}${ly.meta.image_path}`, onReady);
let hatchCv = null;
function hatch(ctx) {
  if (!hatchCv) {
    hatchCv = document.createElement('canvas'); hatchCv.width = hatchCv.height = 8;
    const h = hatchCv.getContext('2d');
    h.fillStyle = 'rgba(237,240,230,.30)'; h.fillRect(0, 0, 8, 8);
    h.strokeStyle = '#2459A8'; h.lineWidth = 1.6;
    h.beginPath(); h.moveTo(0, 8); h.lineTo(8, 0); h.moveTo(-2, 2); h.lineTo(2, -2); h.moveTo(6, 10); h.lineTo(10, 6); h.stroke();
  }
  return ctx.createPattern(hatchCv, 'repeat');
}

// ---------- the tablet's navigation map (heading up, crew arrow fixed) ----------
// v: view object (see nav.js); o: { zoomI, base: 'ortho' | 'plain' | a map layer id, small }
export function drawNavMap(canvas, model, v, o, onReady) {
  const host = canvas.parentNode.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1, w = Math.max(1, host.width), h = Math.max(1, host.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  const s = ZOOMS[o.zoomI] * (o.small ? 0.55 : 1), p = v.pos, b = v.hd;
  const cx = w / 2, cy = h * (o.small ? 0.55 : 0.64), co = Math.cos(-b), si = Math.sin(-b);
  const F = frame(p);
  const scr = (q) => { const [x, y] = F.xy(q); return [cx + (x * co - y * si) * s, cy + (x * si + y * co) * s]; };
  const rect = (bx) => { const [x0, y0] = F.xy({ lon: bx.w, lat: bx.n }), [x1, y1] = F.xy({ lon: bx.e, lat: bx.s }); return [x0, y0, x1 - x0, y1 - y0]; };
  const path = (pts, close) => { const P = new Path2D(); pts.forEach((q, i) => { const [x, y] = F.xy(q); if (i) P.lineTo(x, y); else P.moveTo(x, y); }); if (close) P.closePath(); return P; };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#8E918B'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-b); ctx.scale(s, s);
  // base map: orthophoto, a map layer on the console grid, or plain paper
  let base = null;
  const lyr = model.layers.find((l) => l.id === o.base);
  if (o.base === 'ortho') base = orthoImage(model, onReady) && { im: orthoImage(model), bx: { w: model.ortho.bounds[0][1], s: model.ortho.bounds[0][0], e: model.ortho.bounds[1][1], n: model.ortho.bounds[1][0] }, filter: 'grayscale(1) contrast(.78) brightness(1.07)' };
  if (lyr) base = layerImage(lyr, onReady) && { im: layerImage(lyr), bx: { w: lyr.meta.bounds[0][1], s: lyr.meta.bounds[0][0], e: lyr.meta.bounds[1][1], n: lyr.meta.bounds[1][0] } };
  if (base && base.im) {
    if (lyr) { ctx.fillStyle = '#EDF0E6'; ctx.fillRect(-1e4, -1e4, 2e4, 2e4); }
    ctx.filter = base.filter || 'none'; ctx.globalAlpha = lyr ? (lyr.meta.layer?.opacity ?? 0.6) : 1;
    ctx.drawImage(base.im, ...rect(base.bx)); ctx.filter = 'none'; ctx.globalAlpha = 1;
  } else { ctx.fillStyle = '#EDF0E6'; ctx.fillRect(-1e4, -1e4, 2e4, 2e4); }
  // return stages (rule B): green = 15+ min spare, yellow = under 15 min, red = cannot get home in time
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const g = model.grid;
  if (g && !v.home) {
    if (v.allRed) { ctx.fillStyle = STAGE.red.tint; ctx.fillRect(-1e4, -1e4, 2e4, 2e4); }
    else {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(stageCanvas(model, v.L, v.f, v.which, v.caution), ...rect(gridBox(g)));
      const stroke = (lines, wpx, col, halo) => lines.forEach((ln) => { const P = path(ln); if (halo) { ctx.lineWidth = (wpx + 3) / s; ctx.strokeStyle = 'rgba(237,240,230,.85)'; ctx.stroke(P); } ctx.lineWidth = wpx / s; ctx.strokeStyle = col; ctx.stroke(P); });
      ctx.setLineDash([7 / s, 5 / s]); stroke(gridLines(model, 'penalized', 60, 1), 1.6, 'rgba(43,45,47,.7)'); ctx.setLineDash([]);
      stroke(gridLines(model, v.which, v.L, v.f), 3, STAGE.red.c, true);
      if (v.L > v.caution) stroke(gridLines(model, v.which, v.L - v.caution, v.f), 2.4, STAGE.green.c, true);
    }
  }
  // protected zones
  const pat = hatch(ctx);
  if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / s));
  for (const z of model.zones) {
    const P = path(z.ring.map(([lon, lat]) => ({ lon, lat })), true);
    ctx.fillStyle = pat; ctx.fill(P); ctx.lineWidth = 1.8 / s; ctx.strokeStyle = '#2459A8'; ctx.stroke(P);
  }
  // routes: outbound faint once heading home; walked part grey
  const line = (pts, col, wpx, halo, dash) => {
    if (!pts || pts.length < 2) return;
    const P = path(pts);
    ctx.setLineDash(dash ? dash.map((d) => d / s) : []);
    if (halo) { ctx.lineWidth = (wpx + 4) / s; ctx.strokeStyle = 'rgba(237,240,230,.92)'; ctx.stroke(P); }
    ctx.lineWidth = wpx / s; ctx.strokeStyle = col; ctx.stroke(P);
    ctx.setLineDash([]);
  };
  if (v.outFaded) line(v.outFaded.vertices, 'rgba(43,45,47,.45)', 2.5, false, [6, 5]);
  if (v.track && !v.home) {
    const vs = v.track.vertices;
    if (v.pending) line(vs, 'rgba(43,45,47,.5)', 3, false, [6, 5]);
    else {
      line(vs, v.abort ? '#C8361F' : '#2B2D2F', 5, true);
      line([...vs.filter((q) => q.t_min <= v.tt), p], '#80878B', 5, false);
    }
  }
  ctx.restore();
  // markers and labels, upright in screen space
  ctx.font = '700 13px "Atkinson Hyperlegible Next", sans-serif'; ctx.lineJoin = 'round';
  const text = (str, x, y, col, align = 'left') => { ctx.textAlign = align; ctx.lineWidth = 4; ctx.strokeStyle = '#EDF0E6'; ctx.strokeText(str, x, y); ctx.fillStyle = col; ctx.fillText(str, x, y); };
  for (const z of model.zones) {
    const c = z.ring.reduce((a, q) => [a[0] + q[0] / z.ring.length, a[1] + q[1] / z.ring.length], [0, 0]);
    const rM = Math.max(...z.ring.map(([lon, lat]) => distM({ lon: c[0], lat: c[1] }, { lon, lat })));
    const q = scr({ lon: c[0], lat: c[1] }), ly = q[1] + rM * s + 16, half = (z.name.length + 12) * 3.6;
    const clash = model.stations.some((sn) => { const t = scr(sn); return Math.abs(t[1] - ly + 4) < 18 && t[0] > q[0] - half - 16 && t[0] < q[0] + half + (v.targetN === sn.n ? 220 : 16); });
    if (!clash) text(`${z.name} · protected`, q[0], ly, '#2459A8', 'center');
  }
  const hq = scr(model.habitat);
  ctx.fillStyle = '#2B2D2F'; ctx.strokeStyle = '#EDF0E6'; ctx.lineWidth = 2;
  ctx.fillRect(hq[0] - 9, hq[1] - 9, 18, 18); ctx.strokeRect(hq[0] - 9, hq[1] - 9, 18, 18);
  text('Habitat', hq[0] + 15, hq[1] + 5, '#2B2D2F');
  for (const sn of model.stations) {
    const q = scr(sn), on = v.targetN === sn.n, r = on ? 14 : 10;
    ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#2459A8' : '#EDF0E6'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#2459A8'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = `700 ${on ? 14 : 11}px "Atkinson Hyperlegible Mono", monospace`;
    ctx.fillStyle = on ? '#EDF0E6' : '#2459A8'; ctx.fillText(String(sn.n), q[0], q[1] + (on ? 5 : 4));
    ctx.font = '700 13px "Atkinson Hyperlegible Next", sans-serif';
    if (on && !o.small) text(`Stn ${sn.n} · ${sn.name}`, q[0] + 20, q[1] + 5, '#2459A8');
  }
  // crew arrow
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fillStyle = 'rgba(237,240,230,.5)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(13, 13); ctx.lineTo(0, 6); ctx.lineTo(-13, 13); ctx.closePath();
  ctx.fillStyle = v.red ? '#C8361F' : '#2B2D2F'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#EDF0E6'; ctx.stroke();
  ctx.restore();
  let Ls = 10;
  for (const x of [10, 20, 50, 100, 200, 500, 1000]) if (x * s <= (o.small ? 90 : 140)) Ls = x;
  return { scaleM: Ls, scalePx: Ls * s, north: -b };
}

// ---------- the helmet HUD ----------
export function hudSvg(model, v, words) {
  const S = 420, c = 210, r = 146, k = r / HUD_RANGE, b = v.hd, p = v.pos, stg = STAGE[v.stage] || STAGE.green;
  const F = frame(p), co = Math.cos(-b), si = Math.sin(-b);
  const rel = (q) => { const [x, y] = F.xy(q); return [(x * co - y * si) * k, (x * si + y * co) * k]; };
  const polar = (a, rad) => [c + Math.sin(a) * rad, c - Math.cos(a) * rad];
  const f1 = (x) => x.toFixed(1);
  const o = [];
  o.push(`<defs><clipPath id="hud-clip"><circle cx="${c}" cy="${c}" r="${r - 6}"/></clipPath>` +
    '<pattern id="hud-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v6" stroke="#2459A8" stroke-width="1.5"/></pattern></defs>');
  o.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="#E3E7DA"/>`);
  // radar content, heading up, clipped to the face
  let g = `<circle r="${r / 2}" fill="none" stroke="rgba(43,45,47,.25)" stroke-dasharray="2 4"/>`;
  for (const z of model.zones) {
    const pts = z.ring.map(([lon, lat]) => rel({ lon, lat }));
    if (pts.some(([x, y]) => Math.hypot(x, y) < r + 20)) g += `<path d="M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z" fill="url(#hud-hatch)" stroke="#2459A8" stroke-width="1.4"/>`;
  }
  if (!v.home && v.track) {
    const rp = v.track.vertices.map(rel).map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L');
    g += `<g${v.pending ? ' opacity=".35"' : ''}><path d="M${rp}" fill="none" stroke="#EDF0E6" stroke-width="7" stroke-linejoin="round"/><path d="M${rp}" fill="none" stroke="${v.abort ? '#C8361F' : '#2B2D2F'}" stroke-width="3.5" stroke-linejoin="round"/></g>`;
  }
  o.push(`<g clip-path="url(#hud-clip)"><g transform="translate(${c} ${c})">${g}</g></g>`);
  // stage ring and the compass rose turning with the heading
  o.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${stg.c}" stroke-width="10"/>`);
  for (let deg = 0; deg < 360; deg += 15) {
    const a = deg * Math.PI / 180 - b, card = deg % 90 === 0;
    const p1 = polar(a, r + 7), p2 = polar(a, r + (card ? 17 : deg % 45 === 0 ? 13 : 10));
    o.push(`<path d="M${f1(p1[0])} ${f1(p1[1])}L${f1(p2[0])} ${f1(p2[1])}" stroke="#2B2D2F" stroke-width="${card ? 2.2 : 1.2}"/>`);
  }
  for (const [L, d] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const q = polar(d * Math.PI / 180 - b, r + 31);
    o.push(`<text x="${f1(q[0])}" y="${f1(q[1] + 6)}" text-anchor="middle" font-size="${L === 'N' ? 19 : 16}" font-weight="800" fill="${L === 'N' ? '#2B2D2F' : '#51575B'}">${L}</text>`);
  }
  // base and target: inside the face when in range, else pinned to the rim at their bearing
  const marker = (q, kind, lbl) => {
    const vv = rel(q), inside = Math.hypot(vv[0], vv[1]) < r - 16;
    const pt = inside ? [c + vv[0], c + vv[1]] : polar(bearing(p, q) - b, r);
    const [x, y] = pt.map(f1);
    if (kind === 'base') return `<rect x="${f1(pt[0] - 9)}" y="${f1(pt[1] - 9)}" width="18" height="18" fill="#2B2D2F" stroke="#EDF0E6" stroke-width="2"/><text x="${x}" y="${f1(pt[1] + 4.5)}" text-anchor="middle" font-size="11" font-weight="800" fill="#EDF0E6">H</text>`;
    return `<circle cx="${x}" cy="${y}" r="11" fill="#2459A8" stroke="#EDF0E6" stroke-width="2"/><text x="${x}" y="${f1(pt[1] + 4.5)}" text-anchor="middle" font-size="12" font-weight="800" fill="#EDF0E6">${lbl}</text>`;
  };
  if (!v.home && v.target.kind === 'stn') o.push(marker(v.target, 'stn', v.target.n));
  if (!v.home) o.push(marker(model.habitat, 'base'));
  o.push(`<g transform="translate(${c} ${c})"><path d="M0 -20L14 14L0 6L-14 14Z" fill="${v.red ? '#C8361F' : '#2B2D2F'}" stroke="#EDF0E6" stroke-width="2.5" stroke-linejoin="round"/></g>`);
  const hdg = Math.round(angNorm(b) * 180 / Math.PI) % 360;
  o.push(`<text x="${c}" y="${c - r + 34}" text-anchor="middle" font-size="16" font-weight="700" fill="#2B2D2F" stroke="#E3E7DA" stroke-width="5" paint-order="stroke">${String(hdg).padStart(3, '0')}° ${compass8(b)}</text>`);
  o.push(`<text x="${c}" y="${c + r - 24}" text-anchor="middle" font-size="14" font-weight="800" stroke="#E3E7DA" stroke-width="5" paint-order="stroke" fill="${v.stage === 'yellow' ? '#5E4700' : stg.c}">${v.home ? 'HOME' : stg.hud}</text>`);
  const corner = (x, y, anchor, lbl, val) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="12" fill="#51575B">${lbl}</text><text x="${x}" y="${y + 22}" text-anchor="${anchor}" font-size="21" font-weight="700" fill="#2B2D2F">${val}</text>`;
  o.push(corner(8, 18, 'start', `EVA · ${words.lmst}`, words.eva));
  o.push(corner(S - 8, 18, 'end', 'Sunset in', words.sun));
  o.push(corner(8, S - 30, 'start', 'Radiation', `${words.dose} mSv`));
  o.push(corner(S - 8, S - 30, 'end', 'Life support*', words.ls));
  return `<svg viewBox="0 0 ${S} ${S}" role="img" aria-label="Helmet HUD: heading ${hdg} degrees, ${v.home ? 'home' : stg.word}">${o.join('')}</svg>`;
}
