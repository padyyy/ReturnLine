// Navigation mode, as in Alex's navigation sketch: after "Start route" the page becomes the forearm
// tablet (left, about 3/4: navigation map, heading up, four hardware keys), the helmet HUD (top right)
// and the data sheet (bottom right; key 1 swaps it with the map). The crew keeps the plan: walk out on
// the engine's route, stay the planned time, then walk home on the engine's way back. Nothing is searched.
import { onTrack, ttbAt, elevAt, slopeAt, zoneDistance, doseAt } from './model.js';
import { renderViews } from './crew.js';
import { trackBearing, angNorm, angDiff, ZOOMS } from './crewviz.js';
import { icon } from './format.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const bases = (model) => ['ortho', ...model.layers.map((l) => l.id), 'plain']; // key 4 cycles through them

export const NAV = { on: false, model: null, P: null, t: 0, phase: 'out', playing: true, speedX: 60, zoomI: 2, base: 'ortho', swapped: false, hd: null, onEnd: null };

// Return limit, rule B (shared/data-contract.md): 60-minute rule, life support and daylight
export function limitsAt(model, t) {
  const B = Math.min(model.ls - t, model.sunsetEva - t);
  return { B, L: Math.max(0, Math.min(60, B)), by: B >= 60 ? '60-minute rule' : (model.ls <= model.sunsetEva ? 'life support' : 'sunset') };
}
export const stageOf = (spare, caution) => (!(spare >= 0) ? 'red' : spare < caution ? 'yellow' : 'green');
const finite = (x) => (x != null && Number.isFinite(x) ? x : null);

// The values every crew view needs at the crew's place, from the grids and the track being walked
export function placeValues(model, pos, track, tt) {
  const tv = track ? onTrack(track, 0, tt) : null, vs = track?.vertices;
  let vSlope = null, vElev = null;
  if (vs && vs.length > 1) { // nearest vertex values as a fallback when the grids are not loaded
    let k = 0; while (k < vs.length - 1 && vs[k + 1].t_min <= tt) k++;
    vSlope = vs[k].slope_deg ?? null; vElev = vs[k].elev_m ?? null;
  }
  const zd = zoneDistance(model, pos);
  return {
    slope: slopeAt(model, pos) ?? vSlope, z: elevAt(model, pos) ?? vElev,
    zone: zd ? { d: zd.d, name: zd.zone.name } : null,
    rem: tv ? { m: tv.leftM, min: tv.leftMin } : { m: 0, min: 0 },
    ahead: track ? onTrack(track, 0, Math.min(track.minutes, tt + 2)) : null,
  };
}

function phaseAt(t) {
  const P = NAV.P;
  return t < P.tArr ? 'out' : t < P.tLeave ? 'at' : t < P.tHome ? 'ret' : 'home';
}
function where() {
  const P = NAV.P, t = NAV.t, ph = NAV.phase;
  if (ph === 'out') return { track: P.out, tt: t - P.t0 };
  if (ph === 'at') return { track: P.out, tt: P.out.minutes };
  if (ph === 'ret') return { track: P.ret, tt: t - P.tLeave };
  return { track: P.ret, tt: P.ret.minutes };
}

function navView() {
  const model = NAV.model, P = NAV.P, t = NAV.t, ph = NAV.phase, home = ph === 'home', at = ph === 'at';
  const { track, tt } = where();
  const pos = home ? model.habitat : onTrack(track, 0, tt);
  const lim = limitsAt(model, t), caution = model.sc.caution_margin_min;
  const T = home ? 0 : finite(ttbAt(model, pos, 'penalized'));
  const pv = placeValues(model, pos, track, tt);
  const back = home ? 0 : T ?? (ph === 'ret' ? pv.rem.min : P.ret.minutes);
  const spare = lim.L - back;
  const s = P.station;
  return {
    t, pos, hd: NAV.hd, track, tt, homeward: ph === 'ret' || home, home, at,
    outFaded: ph === 'ret' ? P.out : null,
    target: ph === 'ret' || home ? { kind: 'base', n: 'H', name: 'Habitat', ...model.habitat } : { kind: 'stn', n: s.n, name: s.name, lon: s.lon, lat: s.lat },
    targetN: s.n, stage: home ? 'green' : stageOf(spare, caution), spare, caution,
    L: lim.L, f: 1, which: 'penalized', lim, ttb: T,
    ls: model.ls - t, sun: model.sunsetEva - t, dose: doseAt(model, t - P.t0),
    homeAt: P.tHome, reserve: model.ls - P.tHome, stay: P.stay, max: P.max, tLeave: P.tLeave, back: P.ret.minutes,
    stayLeft: at ? P.tLeave - t : P.stay, onStation: at ? t - P.tArr : 0,
    ...pv, rem: at || home ? { m: 0, min: 0 } : pv.rem,
  };
}

function pose(dt) {
  const { track, tt } = where();
  const b = NAV.phase === 'at' || NAV.phase === 'home' ? null : trackBearing(track, tt);
  if (b != null) NAV.hd = NAV.hd == null ? b : angNorm(NAV.hd + angDiff(b, NAV.hd) * Math.min(1, dt * 3));
  if (NAV.hd == null) NAV.hd = trackBearing(NAV.P.out, 1) ?? 0;
}

let raf = 0, last = 0, uiT = 0;
function frame(dt, forceUi) {
  pose(dt);
  const v = navView(), now = performance.now(), ui = forceUi || now - uiT > 200;
  if (ui) uiT = now;
  renderViews(NAV.model, v, { map: true, hud: true, ui, zoomI: NAV.zoomI, base: NAV.base, small: NAV.swapped, onReady: () => frame(0, true) });
  $('#nd-end').hidden = !v.home;
  $('#hdr-clock').textContent = `${hhmm(NAV.model, v.t)} LMST`;
}
const hhmm = (model, t) => { const m = Math.round(model.startMin + t); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
function loop(now) {
  if (!NAV.on) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (NAV.playing) {
    const was = NAV.phase;
    NAV.t = Math.min(NAV.P.tHome, NAV.t + dt * NAV.speedX / 60);
    NAV.phase = phaseAt(NAV.t);
    if (NAV.phase === 'home' && was !== 'home') { NAV.playing = false; syncPause(); }
  }
  frame(dt);
  raf = requestAnimationFrame(loop);
}

export function placeViews() {
  const map = $('#nav-map'), data = $('#nav-data');
  if (NAV.swapped) { $('#nav-screen').appendChild(data); $('#nav-mini').appendChild(map); }
  else { $('#nav-screen').appendChild(map); $('#nav-mini').appendChild(data); }
  $('#hud-panel').appendChild($('#hud-wrap'));
  $('#mini-h').innerHTML = `${NAV.swapped ? 'Navigation, small' : 'Data sheet'}<span class="cap">key 1 swaps</span>`;
  $('#k-data').setAttribute('aria-pressed', String(NAV.swapped));
}
function syncPause() {
  $('#nav-pause').innerHTML = NAV.playing ? `${icon('pause')}<span>Pause</span>` : `${icon('play')}<span>${NAV.phase === 'home' ? 'Done' : 'Resume'}</span>`;
  $('#nav-pause').disabled = NAV.phase === 'home';
}

// P: the plan from the planning panel (ui.js planOf): station, out, ret, t0, tArr, stay, max, tLeave, tHome
export function navStart(model, P, onEnd) {
  if (!P || !P.ok) return;
  Object.assign(NAV, { on: true, model, P, t: P.t0, phase: 'out', playing: true, hd: null, swapped: false, onEnd });
  document.body.classList.add('nav');
  $('#navmode').hidden = false; $('#nav-controls').hidden = false;
  placeViews(); syncPause();
  $('#nv-legend').hidden = true; $('#nv-key').setAttribute('aria-expanded', 'false');
  $$('#nav-controls .seg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.nx === NAV.speedX)));
  cancelAnimationFrame(raf);
  requestAnimationFrame(() => { last = performance.now(); frame(1, true); raf = requestAnimationFrame(loop); });
}
export function navEnd() {
  if (!NAV.on) return;
  NAV.on = false; cancelAnimationFrame(raf);
  document.body.classList.remove('nav');
  $('#navmode').hidden = true; $('#nav-controls').hidden = true;
  if (NAV.onEnd) NAV.onEnd();
}
function key(id) {
  const el = $(`#${id}`); el.classList.add('is-pressed'); setTimeout(() => el.classList.remove('is-pressed'), 140);
  if (id === 'k-data') { NAV.swapped = !NAV.swapped; placeViews(); }
  if (id === 'k-zin') NAV.zoomI = Math.min(ZOOMS.length - 1, NAV.zoomI + 1);
  if (id === 'k-zout') NAV.zoomI = Math.max(0, NAV.zoomI - 1);
  if (id === 'k-map') {
    const list = bases(NAV.model).filter((b) => b !== 'ortho' || NAV.model.ortho);
    NAV.base = list[(list.indexOf(NAV.base) + 1) % list.length];
  }
  frame(0, true);
}

export function navWire() {
  ['k-data', 'k-zin', 'k-zout', 'k-map'].forEach((id) => $(`#${id}`).addEventListener('click', () => { if (NAV.on) key(id); }));
  $('#nav-pause').addEventListener('click', () => { if (NAV.phase === 'home') return; NAV.playing = !NAV.playing; syncPause(); });
  $('#nav-end').addEventListener('click', navEnd);
  $('#nd-end').addEventListener('click', () => { if (NAV.on) navEnd(); });
  $$('#nav-controls .seg button').forEach((b) => b.addEventListener('click', () => {
    NAV.speedX = +b.dataset.nx;
    $$('#nav-controls .seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  document.addEventListener('keydown', (e) => { // hardware keys 1-4 on the tablet, space pauses
    if (!NAV.on || (e.target.closest && e.target.closest('input, select, textarea'))) return;
    const map = { 1: 'k-data', 2: 'k-zin', 3: 'k-zout', 4: 'k-map' };
    if (map[e.key]) { e.preventDefault(); key(map[e.key]); }
    if (e.key === ' ' && NAV.phase !== 'home') { e.preventDefault(); NAV.playing = !NAV.playing; syncPause(); }
  });
  addEventListener('resize', () => { if (NAV.on) frame(0, true); });
}
