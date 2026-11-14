// Drawn crew views after Alex's navigation sketch (docs/design/navigation-hud-sketch.html, branch
// navigation-view-/-hud): the cuff's navigation map (heading up) and the helmet HUD (compass ring with
// a minimap). Everything comes from the engine's grid and tracks and the console state; nothing is searched.
import { M_PER_DEG, onTrack, distM, gridBounds } from './model.js';

const BASE = import.meta.env.BASE_URL;
export const ZOOMS = [0.45, 0.75, 1.2, 1.9, 3]; // screen px per metre on the navigation map
const HUD_RANGE = 250;                          // metres from the HUD centre to its rim
export const STAGE = {
  green: { c: '#1F6B45', tint: [31, 107, 69, 56], hud: 'HOME IN TIME', word: 'Home in time', text: '#1F6B45' },
  amber: { c: '#D9A300', tint: [217, 163, 0, 77], hud: 'HEAD HOME SOON', word: 'Head home soon', text: '#5E4700' },
  red: { c: '#C8361F', tint: [200, 54, 31, 61], hud: 'ABORT · RETURN NOW', word: 'Return to shelter now', text: '#C8361F' },
};

// ---------- geometry in a local metric frame around p (x east, y south) ----------
const frame = (p) => {
  const kx = M_PER_DEG * Math.cos(p.lat * Math.PI / 180), ky = M_PER_DEG;
  return { kx, ky, xy: (q) => [(q.lon - p.lon) * kx, -(q.lat - p.lat) * ky] };
};
const angNorm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export const bearing = (a, b) => { const f = frame(a), [x, y] = f.xy(b); return Math.atan2(x, -y); }; // 0 = north, clockwise
export const compass8 = (a) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(angNorm(a) / (Math.PI / 4)) % 8];

// Walking direction on a track at track time tt: from one minute behind to one minute ahead
let lastHeading = 0;
export function heading(track, tt) {
  if (track) {
    const a = onTrack(track, 0, Math.max(0, tt - 1)), b = onTrack(track, 0, Math.min(track.minutes, tt + 1));
    if (distM(a, b) >= 1) lastHeading = bearing(a, b);
  }
  return lastHeading;
}

// ---------- return stages from the grid (rule B), as a small image: one pixel per cell ----------
let stageMemo = { key: '', cv: null };
function stageCanvas(model, L, f, which) {
  const g = model.grid;
  if (!g) return null;
  const key = `${L.toFixed(1)}|${f}|${which}`;
  if (stageMemo.key === key) return stageMemo.cv;
  const { nx, ny } = g.header;
  const T = which === 'allowed' ? g.ttbAllowed : g.ttbPenalized;
  const cv = stageMemo.cv || document.createElement('canvas');
  cv.width = nx; cv.height = ny;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(nx, ny), caution = model.sc.caution_margin_min;
  for (let i = 0; i < nx * ny; i++) {
    const spare = L - T[i] * f;
    const t = !(spare >= 0) ? STAGE.red.tint : spare < caution ? STAGE.amber.tint : STAGE.green.tint;
    img.data.set(t, i * 4);
  }
  ctx.putImageData(img, 0, 0);
  stageMemo = { key, cv };
  return cv;
}

let ortho = null;
function orthoImage(model, onReady) {
  if (!model.ortho) return null;
  if (!ortho) {
    ortho = new Image();
    ortho.onload = () => onReady && onReady(); // the first frames are drawn before the image arrives
    ortho.src = `${BASE}maps/${model.ortho.image}`;
  }
  return ortho.complete && ortho.naturalWidth ? ortho : null;
}
let hatchCv = null;
function hatch(ctx) {
  if (!hatchCv) {
    hatchCv = document.createElement('canvas'); hatchCv.width = hatchCv.height = 8;
    const h = hatchCv.getContext('2d');
    h.fillStyle = 'rgba(237,240,230,.35)'; h.fillRect(0, 0, 8, 8);
    h.strokeStyle = '#2459A8'; h.lineWidth = 1.6; h.beginPath(); h.moveTo(0, 8); h.lineTo(8, 0); h.moveTo(-2, 2); h.lineTo(2, -2); h.moveTo(6, 10); h.lineTo(10, 6); h.stroke();
  }
  return ctx.createPattern(hatchCv, 'repeat');
}

// ---------- the cuff's navigation map ----------
// nav: { pos, hd, active, tt, outFaded, abort, target, stations, habitat, zones, L, f, which, zoomI, base }
export function drawNavMap(canvas, model, nav, onReady) {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight), dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  const s = ZOOMS[nav.zoomI], b = nav.hd, p = nav.pos, cx = w / 2, cy = h * 0.64;
  const F = frame(p);
  const co = Math.cos(-b), si = Math.sin(-b);
  const scr = (q) => { const [x, y] = F.xy(q); return [cx + (x * co - y * si) * s, cy + (x * si + y * co) * s]; };
  const box = (bounds) => { // [[s, w], [n, e]] -> metric rect
    const [[bs, bw], [bn, be]] = bounds;
    return [(bw - p.lon) * F.kx, -(bn - p.lat) * F.ky, (be - bw) * F.kx, (bn - bs) * F.ky];
  };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#8E918B'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-b); ctx.scale(s, s);
  const img = nav.base === 'ortho' ? orthoImage(model, onReady) : null;
  if (img) {
    ctx.filter = 'grayscale(1) contrast(.78) brightness(1.07)';
    ctx.drawImage(img, ...box(model.ortho.bounds));
    ctx.filter = 'none';
  } else { ctx.fillStyle = '#EDF0E6'; ctx.fillRect(-5000, -5000, 10000, 10000); }
  const sc = nav.home ? null : stageCanvas(model, nav.L, nav.f, nav.which); // inside the habitat, no stages
  if (sc) { ctx.imageSmoothingEnabled = true; ctx.drawImage(sc, ...box(gridBounds(model.grid))); }
  // protected zones
  const pat = hatch(ctx);
  if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / s));
  for (const z of nav.zones) {
    ctx.beginPath();
    z.ring.forEach(([lon, lat], i) => { const [x, y] = F.xy({ lon, lat }); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fillStyle = pat; ctx.fill(); ctx.lineWidth = 1.8 / s; ctx.strokeStyle = '#2459A8'; ctx.stroke();
  }
  // routes
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const line = (vs, col, wpx, halo, dash) => {
    if (!vs || vs.length < 2) return;
    ctx.beginPath(); vs.forEach((q, i) => { const [x, y] = F.xy(q); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.setLineDash(dash ? dash.map((v) => v / s) : []);
    if (halo) { ctx.lineWidth = (wpx + 4) / s; ctx.strokeStyle = 'rgba(237,240,230,.92)'; ctx.stroke(); }
    ctx.lineWidth = wpx / s; ctx.strokeStyle = col; ctx.stroke();
    ctx.setLineDash([]);
  };
  if (nav.outFaded) line(nav.outFaded.vertices, 'rgba(43,45,47,.45)', 2.5, false, [6, 5]);
  if (nav.active) {
    const v = nav.active.vertices;
    line(v, nav.abort ? '#C8361F' : '#2B2D2F', 5, true);
    const walked = v.filter((q) => q.t_min <= nav.tt);
    line([...walked, p], '#80878B', 5, false);
  }
  ctx.restore();
  // markers and labels, upright
  ctx.font = '700 12px "Atkinson Hyperlegible Next", sans-serif'; ctx.lineJoin = 'round';
  const text = (str, x, y, col, align = 'left') => { ctx.textAlign = align; ctx.lineWidth = 4; ctx.strokeStyle = '#EDF0E6'; ctx.strokeText(str, x, y); ctx.fillStyle = col; ctx.fillText(str, x, y); };
  const hq = scr(nav.habitat);
  ctx.fillStyle = '#2B2D2F'; ctx.strokeStyle = '#EDF0E6'; ctx.lineWidth = 2;
  ctx.fillRect(hq[0] - 8, hq[1] - 8, 16, 16); ctx.strokeRect(hq[0] - 8, hq[1] - 8, 16, 16);
  text('Habitat', hq[0] + 13, hq[1] + 4, '#2B2D2F');
  for (const sn of nav.stations) {
    const q = scr(sn), on = nav.target?.n === sn.n, r = on ? 12 : 9;
    ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#2459A8' : '#EDF0E6'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#2459A8'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = `700 ${on ? 12 : 10}px "Atkinson Hyperlegible Mono", monospace`;
    ctx.fillStyle = on ? '#EDF0E6' : '#2459A8'; ctx.fillText(String(sn.n), q[0], q[1] + 4);
    ctx.font = '700 12px "Atkinson Hyperlegible Next", sans-serif';
  }
  // crew arrow
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fillStyle = 'rgba(237,240,230,.5)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(11, 11); ctx.lineTo(0, 5); ctx.lineTo(-11, 11); ctx.closePath();
  ctx.fillStyle = nav.red ? '#C8361F' : '#2B2D2F'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = '#EDF0E6'; ctx.stroke();
  ctx.restore();
  // scale bar length for the overlay
  let Ls = 10;
  for (const o of [10, 20, 50, 100, 200, 500]) if (o * s <= 80) Ls = o;
  return { scaleM: Ls, scalePx: Ls * s, northDeg: -b * 180 / Math.PI };
}

// ---------- the helmet HUD ----------
// hud: { pos, hd, active, zones, habitat, target, stage, ttb, home, tEva, lmst, sun, dose, ls }
export function hudSvg(hud) {
  const S = 420, c = 210, r = 146, k = r / HUD_RANGE, b = hud.hd, p = hud.pos, stg = STAGE[hud.stage] || STAGE.green;
  const F = frame(p), co = Math.cos(-b), si = Math.sin(-b);
  const rel = (q) => { const [x, y] = F.xy(q); return [(x * co - y * si) * k, (x * si + y * co) * k]; };
  const polar = (a, rad) => [c + Math.sin(a) * rad, c - Math.cos(a) * rad];
  const f1 = (v) => v.toFixed(1);
  const o = [];
  o.push(`<defs><clipPath id="hud-clip"><circle cx="${c}" cy="${c}" r="${r - 6}"/></clipPath>` +
    '<pattern id="hud-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v6" stroke="#2459A8" stroke-width="1.5"/></pattern></defs>');
  o.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="#E3E7DA"/>`);
  // minimap, heading up, clipped to the face
  let g = `<circle r="${r / 2}" fill="none" stroke="rgba(43,45,47,.25)" stroke-dasharray="2 4"/>`;
  for (const z of hud.zones) {
    const pts = z.ring.map(([lon, lat]) => rel({ lon, lat }));
    if (pts.some(([x, y]) => Math.hypot(x, y) < r + 20)) g += `<path d="M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z" fill="url(#hud-hatch)" stroke="#2459A8" stroke-width="1.4"/>`;
  }
  if (!hud.home && hud.active) {
    const rp = hud.active.vertices.map(rel).map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L');
    const col = hud.abort ? '#C8361F' : '#2B2D2F';
    g += `<path d="M${rp}" fill="none" stroke="#EDF0E6" stroke-width="7" stroke-linejoin="round"/><path d="M${rp}" fill="none" stroke="${col}" stroke-width="3.5" stroke-linejoin="round"/>`;
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
    o.push(`<text x="${f1(q[0])}" y="${f1(q[1] + 6)}" text-anchor="middle" class="hud-card${L === 'N' ? ' n' : ''}">${L}</text>`);
  }
  // base and target: inside the face when in range, else pinned to the rim at their bearing
  const marker = (q, kind, lbl) => {
    const v = rel(q), inside = Math.hypot(v[0], v[1]) < r - 16;
    const pt = inside ? [c + v[0], c + v[1]] : polar(bearing(p, q) - b, r);
    const [x, y] = pt.map(f1);
    if (kind === 'base') return `<rect x="${f1(pt[0] - 9)}" y="${f1(pt[1] - 9)}" width="18" height="18" fill="#2B2D2F" stroke="#EDF0E6" stroke-width="2"/><text x="${x}" y="${f1(pt[1] + 4.5)}" text-anchor="middle" class="hud-mk">H</text>`;
    return `<circle cx="${x}" cy="${y}" r="11" fill="#2459A8" stroke="#EDF0E6" stroke-width="2"/><text x="${x}" y="${f1(pt[1] + 4.5)}" text-anchor="middle" class="hud-mk">${lbl}</text>`;
  };
  if (!hud.home && hud.target && hud.target.kind === 'stn') o.push(marker(hud.target, 'stn', hud.target.n));
  if (!hud.home) o.push(marker(hud.habitat, 'base'));
  o.push(`<g transform="translate(${c} ${c})"><path d="M0 -20L14 14L0 6L-14 14Z" fill="${hud.red ? '#C8361F' : '#2B2D2F'}" stroke="#EDF0E6" stroke-width="2.5" stroke-linejoin="round"/></g>`);
  const hdg = Math.round(angNorm(b) * 180 / Math.PI) % 360;
  o.push(`<text x="${c}" y="${c - r + 34}" text-anchor="middle" class="hud-hdg">${String(hdg).padStart(3, '0')}° ${compass8(b)}</text>`);
  o.push(`<text x="${c}" y="${c + r - 24}" text-anchor="middle" class="hud-word" fill="${stg.text}">${hud.home ? 'HOME' : stg.hud}</text>`);
  const corner = (x, y, anchor, lbl, val) => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="hud-lbl">${lbl}</text><text x="${x}" y="${y + 22}" text-anchor="${anchor}" class="hud-val">${val}</text>`;
  o.push(corner(8, 18, 'start', `EVA · ${hud.lmst}`, hud.tEva));
  o.push(corner(S - 8, 18, 'end', 'Sunset in', hud.sun));
  o.push(corner(8, S - 30, 'start', 'Radiation', `${hud.dose} mSv`));
  o.push(corner(S - 8, S - 30, 'end', 'Life support*', hud.ls));
  return `<svg viewBox="0 0 ${S} ${S}" role="img" aria-label="Helmet HUD: heading ${hdg} degrees, ${hud.home ? 'home' : stg.word}">${o.join('')}</svg>`;
}
