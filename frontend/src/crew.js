// Crew views, read-only, as in Alex's navigation sketch (docs/design/navigation-hud-sketch.html):
// the helmet HUD (compass ring, two info chips, up to three warnings), the forearm tablet's map overlays
// (turn card, compass, return stage, key, scale) and the data sheet that fits its box without scrolling.
// Navigation (nav.js) and the emergency rehearsal (rehearsal.js) build a view object v and call
// renderViews(); the DOM elements are moved between the two places, so the ids are unique.
import { hm, R, icon, esc, setHTML } from './format.js';
import { lmst, elevAt, demZ } from './model.js';
import { navViews, navView } from './layerstate.js';
import { src } from './sources.js';
import { drawNavMap, hudSvg, STAGE, bearing } from './crewviz.js';

const $ = (s) => document.querySelector(s);

// Up to three warnings for the HUD, most urgent first; a view may bring its own (v.warn)
export function warnings(model, v) {
  const w = v.warn ? v.warn.slice() : [];
  const caution = v.caution;
  if (v.home) return [['ok', 'check', `Crew home · ${lmst(model, v.t)} LMST`]];
  if (v.at && v.stayLeft != null && v.stayLeft <= 10) w.push(['amber', 'warn', `Return starts in ${hm(Math.max(0, v.stayLeft))}`]);
  if (v.stage === 'red' && !v.abortVerdict) w.push(['red', 'warn', 'Cannot get home in time · return to shelter now']);
  else if (v.stage === 'yellow' && !v.abortVerdict) w.push(['amber', 'warn', `Under ${caution} min to spare · head home soon`]);
  if (v.zone) {
    if (v.zone.d <= 0) w.push(['blue', 'warn', `Inside ${v.zone.name}${v.abortRoute ? ' · override' : ''}`]);
    else if (v.zone.d < 60) w.push(['blue', 'warn', `Protected zone ${R(v.zone.d)} m · ${v.zone.name}`]);
  }
  if (v.slope != null && v.slope > 15) w.push(['red', 'warn', `Steep ground ${R(v.slope)}° · limit 20°`]);
  if (v.sun < 90) w.push(['red', 'warn', `Sunset in ${hm(v.sun)}`]);
  if (v.ls < 75) w.push(['red', 'warn', `Life support ${hm(v.ls)} left`]);
  if (!w.length) w.push(['ok', 'check', 'No warnings']);
  return w.slice(0, 3);
}

function words(model, v) {
  return { lmst: lmst(model, v.t), eva: hm(v.t), sun: hm(v.sun), ls: hm(Math.max(0, v.ls)), dose: v.dose.toFixed(2) };
}
const spareText = (v) => v.spareTxt || (v.spare == null ? 'needs grid' : v.spare >= 0 ? `${R(v.spare)} min spare` : 'no way home');

export function tile(l, val, u, s, sk) {
  return `<div class="dt"><div class="dt-l"><span>${l}</span>${sk ? src(sk) : ''}</div>` +
    `<div class="dt-v">${val}${u ? `<span class="u">${u}</span>` : ''}</div>${s ? `<div class="dt-s">${s}</div>` : ''}</div>`;
}

// ---------- helmet HUD ----------
function renderHud(model, v) {
  $('#hud').innerHTML = hudSvg(model, v, words(model, v));
  const t = v.target;
  setHTML($('#hud-line'), v.hudLine ? v.hudLine
    : v.home ? '<span>Habitat</span><span>arrived</span>'
    : v.at ? `<span>Stn ${t.n} · return in ${hm(Math.max(0, v.stayLeft ?? 0))}</span><span>Home ${lmst(model, v.homeAt)}</span>`
    : `<span>${t.kind === 'base' ? 'Base' : `Stn ${t.n}`} ${R(v.rem.m)} m · ${R(v.rem.min)} min</span><span>Home ${lmst(model, v.homeAt)}</span>`);
  setHTML($('#hud-warn'), warnings(model, v).map(([cls, ic, txt]) => `<li class="${cls}">${icon(ic)}${esc(txt)}</li>`).join(''));
}

// ---------- elevation profile of the way being walked ----------
function profileSVG(model, v, W, H) {
  const out = { svg: '', up: 0, dn: 0, ok: false };
  const tr = v.track;
  if (!tr || tr.vertices.length < 2) return out;
  const vs = tr.vertices, n = vs.length, dist = vs.map((q) => q.d_m);
  // the GeoMapper elevation map where it covers the whole way, else the route's own elevations
  let zs = model.dem ? vs.map((q) => demZ(model, q)) : null;
  out.src = 'geomapper';
  if (!zs || zs.some((z) => z == null)) { zs = vs.map((q) => (q.elev_m != null ? q.elev_m : elevAt(model, q))); out.src = 'grid'; }
  if (zs.some((z) => z == null || !Number.isFinite(z))) return out;
  out.ok = true;
  for (let i = 1; i < n; i++) { const dz = zs[i] - zs[i - 1]; if (dz > 0) out.up += dz; else out.dn -= dz; }
  if (W < 60 || H < 18) return out;
  const small = H < 64;
  const tot = Math.max(1, dist[n - 1]), zmin = Math.min(...zs), zmax = Math.max(...zs);
  const span = Math.max(10, zmax - zmin), l = small ? 2 : 58, r = small ? 8 : 6, t = small ? 7 : 8, bt = small ? 3 : 18;
  const PX = (m) => l + (W - l - r) * m / tot, PY = (z) => t + (H - t - bt) * (1 - (z - zmin) / span);
  let k = 0; while (k < n - 1 && vs[k + 1].t_min <= v.tt) k++;
  const f = k < n - 1 ? Math.max(0, Math.min(1, (v.tt - vs[k].t_min) / Math.max(1e-6, vs[k + 1].t_min - vs[k].t_min))) : 0;
  const cur = v.home ? tot : dist[k] + (k < n - 1 ? (dist[k + 1] - dist[k]) * f : 0);
  const zc = v.home ? zs[n - 1] : zs[k] + (k < n - 1 ? (zs[k + 1] - zs[k]) * f : 0);
  const line = zs.map((z, j) => `${j ? 'L' : 'M'}${PX(dist[j]).toFixed(1)} ${PY(z).toFixed(1)}`).join('');
  const cx = PX(cur).toFixed(1), base = H - bt;
  const area = `${line}L${PX(tot).toFixed(1)} ${base}L${l} ${base}Z`;
  out.svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile of the way being walked">` +
    `<defs><clipPath id="dv-walked"><rect x="0" y="0" width="${cx}" height="${H}"/></clipPath></defs>` +
    `<path d="${area}" fill="rgba(43,45,47,.10)"/><path d="${area}" fill="rgba(43,45,47,.14)" clip-path="url(#dv-walked)"/>` +
    `<path d="${line}" fill="none" stroke="#2B2D2F" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M${l} ${base}H${W - r}" stroke="rgba(43,45,47,.4)" stroke-width="1"/>` +
    (small ? '' : `<text x="${l - 8}" y="${(PY(zmax) + 4).toFixed(1)}" text-anchor="end">${R(zmax)} m</text>` +
      `<text x="${l - 8}" y="${(PY(zmin) + 4).toFixed(1)}" text-anchor="end">${R(zmin)} m</text>` +
      `<text x="${l}" y="${H - 3}">0 m</text><text x="${W - r}" y="${H - 3}" text-anchor="end">${R(tot)} m</text>`) +
    `<path d="M${cx} ${t}V${base}" stroke="#2B2D2F" stroke-width="1.2" stroke-dasharray="3 3"/>` +
    `<circle cx="${cx}" cy="${PY(zc).toFixed(1)}" r="${small ? 4.5 : 6}" fill="#2B2D2F" stroke="#EDF0E6" stroke-width="2.5"/></svg>`;
  return out;
}
let lastProf = null;
function renderProf(model, v) {
  lastProf = [model, v];
  const box = $('#dv-prof-box'), pr = profileSVG(model, v, R(box.clientWidth), R(box.clientHeight));
  box.innerHTML = pr.ok ? pr.svg : '<p class="cap dv-none">No elevation data for this way</p>';
  $('#dv-prof-h').innerHTML = `<span>Elevation, ${v.homeward ? 'way home' : 'way out'}${pr.ok ? src(pr.src === 'geomapper' ? 'GEOM' : 'DEM') : ''}</span>${pr.ok ? `<span class="num">+${R(pr.up)} m · −${R(pr.dn)} m</span>` : ''}`;
}
if (window.ResizeObserver) new ResizeObserver(() => { if (lastProf && document.querySelector('#dv-prof-box').clientWidth) renderProf(...lastProf); }).observe(document.querySelector('#dv-prof-box'));

// ---------- tablet map chrome and the data sheet ----------
function renderUi(model, v, o) {
  const stg = STAGE[v.stage] || STAGE.green, t = v.target, sp = spareText(v);
  let turn;
  if (v.turn) turn = v.turn;
  else if (v.home) turn = `${icon('check')}<div><div class="to">Crew home</div><div class="big">${lmst(model, v.t)}<small>LMST</small></div></div>`;
  else if (v.at) turn = `${icon('check')}<div><div class="to">At Stn ${t.n} · ${esc(t.name)}</div><div class="big">Return in ${hm(Math.max(0, v.stayLeft ?? 0))}<small>leave ${lmst(model, v.tLeave)}</small></div></div>`;
  else {
    const ah = v.ahead, ra = ah ? bearing(v.pos, ah) - v.hd : 0;
    turn = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#3A3D40"/><g transform="translate(20 20) rotate(${(ra * 180 / Math.PI).toFixed(0)})"><path d="M0 -12L8 7L0 2L-8 7Z" fill="#E8622C"/></g></svg>` +
      `<div><div class="to">To ${t.kind === 'base' ? 'Habitat' : `Stn ${t.n} · ${esc(t.name)}`}</div><div class="big">${R(v.rem.m)} m<small>${R(v.rem.min)} min · ETA ${lmst(model, v.t + v.rem.min)}</small></div></div>`;
  }
  $('#nv-turn').innerHTML = turn;
  const se = $('#nv-stage');
  se.style.background = stg.bg; se.style.color = stg.fg;
  se.innerHTML = `${icon(v.stage === 'green' || v.home ? 'check' : 'warn')}${v.home ? 'Crew home' : stg.word}<span class="num">${sp}</span>`;
  const views = navViews(model), nv = navView(model, o.base), k = views.findIndex((c) => c.id === nv.id);
  $('#nv-mapname').innerHTML = `<b>Map ${k + 1}/${views.length} · ${esc(nv.label)}</b>${nv.parts.length > 1 ? `<small>${esc(nv.detail)}</small>` : ''}`;
  $('#nv-mapname').title = `${nv.label} · ${nv.detail}. Key 4 switches the map; the Layers menu sets which maps and their order.`;
  $('#nv-legend').innerHTML = '<b>Home in time from there, now?</b><span class="cap">Along the route, fading away from it; on the Plain map (key 4)</span>' +
    `<div><i style="background:${STAGE.green.tint};border-color:${STAGE.green.c}"></i>Yes, ${v.caution}+ min to spare</div>` +
    `<div><i style="background:${STAGE.yellow.tint};border-color:${STAGE.yellow.c}"></i>Yes, under ${v.caution} min to spare</div>` +
    `<div><i style="background:${STAGE.red.tint};border-color:${STAGE.red.c}"></i>No: ABORT if the crew is here</div>` +
    '<div><i style="border:0;border-top:2px dashed #2B2D2F;height:0;border-radius:0"></i>60 min from base, fixed</div>' +
    `<span class="cap">Return limit now ${R(v.lim.L)} min, set by ${v.lim.by === "life support" ? "" : "the "}${v.lim.by}${v.f > 1 ? ' · injured: times doubled' : ''} · time-to-base grid (rule B)</span>`;
  // data sheet: stage, two key tiles, elevation, nine values
  const ds = $('#dv-stage');
  ds.style.background = stg.bg; ds.style.color = stg.fg;
  ds.innerHTML = `${icon(v.stage === 'green' || v.home ? 'check' : 'warn')}<span>${v.home ? 'Crew home' : stg.word}</span><span class="num">${sp}</span>`;
  let A, B;
  if (v.home) {
    A = tile('Crew home', lmst(model, v.t), '', `arrived at the habitat · EVA ${hm(v.t)}`, '');
    B = tile('Reserve', hm(v.reserve), '', 'life support left at arrival', 'ASSUME');
  } else if (v.at) {
    A = tile('Return starts in', hm(Math.max(0, v.stayLeft ?? 0)), '', `at Stn ${t.n} · ${hm(v.onStation ?? 0)} of ${hm(v.stay ?? 0)} on station`, 'ASSUME');
    B = tile('Leave station', lmst(model, v.tLeave), '', `then ${R(v.back ?? 0)} min home · home ${lmst(model, v.homeAt)}`, 'ROUTE');
  } else if (!v.homeward) {
    A = tile(`To Stn ${t.n} · ${esc(t.name)}`, R(v.rem.m), 'm', `${R(v.rem.min)} min · ETA ${lmst(model, v.t + v.rem.min)} LMST`, 'ROUTE');
    B = tile('Planned stay', hm(v.stay ?? 0), '', `max ${hm(v.max ?? 0)} · leave ${lmst(model, v.tLeave)}`, 'ASSUME');
  } else {
    A = tile('To Habitat', R(v.rem.m), 'm', `${R(v.rem.min)} min · ETA ${lmst(model, v.t + v.rem.min)} LMST`, 'ROUTE');
    B = tile('Home at', lmst(model, v.homeAt), '', `planned · EVA ${hm(v.homeAt)}`, 'ROUTE');
  }
  if (v.tileA) A = v.tileA;
  if (v.tileB) B = v.tileB;
  $('#dv-hero').innerHTML = A + B;
  renderProf(model, v);
  const fx = (x, d = 0) => (x == null || !Number.isFinite(x) ? '–' : d ? x.toFixed(d) : R(x));
  const geo = v.zSrc === 'geomapper', demLabel = model.dem ? model.dem.name.replace(/^Elevation,\s*/i, '') : '';
  $('#dv-grid').innerHTML =
    tile('Life support', hm(Math.max(0, v.ls)), '', `assumption: ${hm(model.ls)} EVA`, 'ASSUME') +
    tile('Sunset in', hm(v.sun), '', `sunset ${model.sc.sunset_lmst} LMST`, 'REMS') +
    tile('Reserve', hm(v.reserve), '', 'at the planned arrival', 'ASSUME') +
    tile('Return limit', R(v.lim.L), 'min', `set by ${v.lim.by === "life support" ? "" : "the "}${v.lim.by}`, 'xEVA') +
    tile('Time to base', fx(v.ttb), v.ttb == null ? '' : 'min', v.ttb == null ? 'needs the grid' : 'from here, engine grid', 'GRID') +
    tile('Radiation', v.dose.toFixed(2), 'mSv', 'information only', 'RAD') +
    tile('Slope here', fx(v.slope, 1), v.slope == null ? '' : '°', `limit 20° · ${geo ? '10 m baseline' : '10 m grid'}`, geo ? 'GEOM' : 'DEM') +
    tile('Protected zone', v.zone ? Math.max(0, R(v.zone.d)) : '–', v.zone ? 'm' : '', v.zone ? esc(v.zone.name) : 'no zones', 'PP') +
    tile('Elevation', fx(v.z), v.z == null ? '' : 'm', geo ? esc(demLabel) : 'from the DEM, 10 m grid', geo ? 'GEOM' : 'DEM');
}

// o: { map, hud, ui, zoomI, base, small, onReady }
export function renderViews(model, v, o) {
  if (o.map) {
    const out = drawNavMap($('#nav-cv'), model, v, o, o.onReady);
    $('#nv-scale .bar').style.width = `${out.scalePx.toFixed(1)}px`;
    $('#nv-scale span').textContent = `${out.scaleM} m`;
    // compass: upright N in the middle, a pointer on the rim (accent colour, theme.css) shows where north is
    $('#nv-north').innerHTML = '<text x="22" y="26.5" text-anchor="middle" font-size="13" font-weight="800" fill="#2B2D2F" font-family="Atkinson Hyperlegible Next, sans-serif">N</text>' +
      `<g transform="rotate(${(out.north * 180 / Math.PI).toFixed(1)} 22 22)"><path d="M22 2.5L26.5 9.5H17.5Z" fill="#E8622C"/></g>`;
  }
  if (o.hud) renderHud(model, v);
  if (o.ui) renderUi(model, v, o);
}
