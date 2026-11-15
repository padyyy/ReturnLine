// Navigation mode, as in Alex's navigation sketch: after "Start route" the page becomes the forearm
// tablet (left, about 3/4: navigation map, heading up, four hardware keys), the helmet HUD (top right)
// and the data sheet (bottom right; key 1 swaps it with the map). The crew keeps the plan: walk out on
// the engine's route, stay the planned time, then walk home on the engine's way back. Nothing is searched.
import { onTrack, terrainAt, zoneDistance } from './model.js';
import { renderViews } from './crew.js';
import { trackBearing, angNorm, angDiff, ZOOMS } from './crewviz.js';
import { icon } from './format.js';
import { navViews, navView as navMap } from './layerstate.js';
import { createNavigationRun } from './navigation-run.js';
import { returnLimitMessages } from './return-status.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

export const NAV = { on: false, model: null, P: null, t: 0, phase: 'out', playing: true, speedX: 60, zoomI: 2, base: 'ortho', swapped: false, hd: null, onEnd: null };

// Return limit, rule B (shared/data-contract.md): 60-minute rule, life support and daylight
export function limitsAt(model, t) {
  const B = Math.min(model.ls - t, model.sunsetEva - t);
  return { B, L: Math.max(0, Math.min(60, B)), by: B >= 60 ? '60-minute rule' : (model.ls <= model.sunsetEva ? 'life support' : 'sunset') };
}
export const stageOf = (spare, caution) => (!(spare >= 0) ? 'red' : spare < caution ? 'yellow' : 'green');

// The values every crew view needs at the crew's place, from the grids and the track being walked
export function placeValues(model, pos, track, tt) {
  const tv = track ? onTrack(track, 0, tt) : null, vs = track?.vertices;
  let vSlope = null, vElev = null;
  if (vs && vs.length > 1) { // nearest vertex values as a fallback when the grids are not loaded
    let k = 0; while (k < vs.length - 1 && vs[k + 1].t_min <= tt) k++;
    vSlope = vs[k].slope_deg ?? null; vElev = vs[k].elev_m ?? null;
  }
  const zd = zoneDistance(model, pos), ter = terrainAt(model, pos);   // GeoMapper elevation map, else the 10 m grid
  return {
    slope: ter.slope ?? vSlope, z: ter.z ?? vElev, zSrc: ter.z != null ? ter.src : 'route',
    zone: zd ? { d: zd.d, name: zd.zone.name } : null,
    rem: tv ? { m: tv.leftM, min: tv.leftMin } : { m: 0, min: 0 },
    ahead: track ? onTrack(track, 0, Math.min(track.minutes, tt + 2)) : null,
  };
}

function where() {
  const s = NAV.run.snapshot();
  return { track: s.track, tt: s.tt };
}

export function navView() {
  const model = NAV.model, P = NAV.P, state = NAV.run.snapshot();
  const v = NAV.run.view(), home = state.phase === 'home', at = state.phase === 'at';
  const pos = home ? model.habitat : v.pos;
  const pv = placeValues(model, pos, v.track, v.tt), s = P.station;
  return {
    ...v, pos, hd: NAV.hd, home, at, injured: state.injured,
    outFaded: v.homeward ? P.out : null, corridor: [P.out, P.ret],
    previousReturnTrack: v.injuryReturn?.switched ? P.ret : null,
    returnSegments: home ? [] : NAV.run.colors().segments,
    target: v.homeward ? { kind: 'base', n: 'H', name: 'Habitat', ...model.habitat }
      : { kind: 'stn', n: s.n, name: s.name, lon: s.lon, lat: s.lat },
    targetN: s.n, stage: home ? 'green' : v.stage ?? 'unknown',
    reserve: v.homeAt == null ? null : model.ls - v.homeAt,
    stay: P.stay, max: P.max, tLeave: at ? v.t + state.stayRemainingMinutes
      : state.phase==='out' && v.rem.min!=null ? v.t + state.remainingDelayMinutes + v.rem.min + state.stayRemainingMinutes : null,
    back: v.ttb, stayLeft: state.stayRemainingMinutes, onStation: at ? P.stay - state.stayRemainingMinutes : 0,
    abort: state.returnMode === 'abort', abortRoute: state.returnMode === 'abort',
    warn: v.status === 'NO_GO' ? returnLimitMessages(v).map(message => ['red', 'warn', message])
      : !v.homeward && v.homeAt != null && (v.homeAt > model.ls || v.homeAt >= model.sunsetEva)
        ? [['red', 'warn', 'Planned mission exceeds the remaining window · return now']] : [],
    ...pv, rem: at || home ? { m: 0, min: 0 } : v.rem,
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
  $('#nav-return-status').textContent = v.home ? 'Crew home' : v.stopped ? 'Crew stopped'
    : ({green:'Within limits',yellow:'Low return margin',red:'Return limit exceeded'})[v.stage] ?? 'Data unavailable';
  $('#nav-return-time').textContent = v.stopped ? 'Stopped' : v.ttb == null ? '—' : v.ttb.toFixed(1) + ' min';
  $('#nav-return-eta').textContent = v.returnArrivalMinute == null ? '—' : hhmm(NAV.model,v.returnArrivalMinute);
  $('#nav-planned-eta').textContent = v.homeAt == null ? '—' : hhmm(NAV.model,v.homeAt);
  $('#nav-return-margin').textContent = v.spare == null ? '—' : v.spare.toFixed(1) + ' min';
  $('#nav-return-margin').title = v.spare < 0 ? 'Minutes over the tightest return limit' : 'Minutes remaining under the tightest return limit';
  $('#nav-budget-note').textContent = `Mission ends ${hhmm(NAV.model,NAV.model.ls)} · Sunset ${hhmm(NAV.model,NAV.model.sunsetEva)} LMST`;
  $('.rl-status').dataset.stage = v.stage;
  const reasons = returnLimitMessages(v);
  $('#nav-return-reason').textContent = (v.violations?.includes('MISSION_END') ? `Mission ends ${hhmm(NAV.model, NAV.model.ls)} LMST · ` : '') + reasons.join(' · ');
  $('#nav-return-reason').hidden = reasons.length === 0;
  $('#nav-return-status').dataset.stage = v.stage;
  ['nav-return', 'nav-abort', 'nav-speed'].forEach(id => { $('#' + id).disabled = v.home; });
  $('#nav-injury').disabled = !v.canTriggerInjury;
  $('#nav-injury').textContent = v.canTriggerInjury || !v.injured ? 'Injury' : 'Injury logged';
  const choice = v.injuryReturn;
  $('#nav-route-selection').hidden = !choice;
  if (choice) {
    const savedSeconds = !choice.accepted || v.stopped ? null : (choice.previousNominalMinutes - choice.selectedNominalMinutes) * v.f * 60;
    $('#nav-route-selection').textContent = !choice.accepted ? 'Injury at station · no permitted prepared return is available.'
      : `Selected return: ${choice.variant === 'fastest' ? 'prepared emergency alternative' : 'normal return (alternative unavailable)'}${choice.protected ? ' · protected passage logged' : ''} · ${choice.switched ? 'route changed · previous return shown grey' : 'same geometry already selected'}${savedSeconds == null ? '' : savedSeconds >= 0 ? ' · ' + savedSeconds.toFixed(1) + ' s saved' : ' · ' + (-savedSeconds).toFixed(1) + ' s longer in the loaded data'}.`;
  }
}
const hhmm = (model, t) => { const m = Math.round(model.startMin + t); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
function loop(now) {
  if (!NAV.on) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (NAV.playing) {
    const state = NAV.run.advance(dt * NAV.speedX / 60);
    NAV.t = state.t; NAV.phase = state.phase;
    if (state.phase === 'home') { NAV.playing = false; syncPause(); }
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
  const run = createNavigationRun(model, P);
  Object.assign(NAV, { on: true, model, P: run.plan, run, t: P.t0, phase: 'out', playing: true, hd: null, swapped: false, onEnd });
  $('#nav-return-message').textContent = '';
  $('#nav-injury').textContent = 'Injury';
  $('#nav-speed').value = '1';
  $('#nav-speed-value').textContent = '×1.00';
  $('#nav-speed').setAttribute('aria-valuetext', '100% of normal walking speed');
  $('#nav-override').hidden = true;
  $('#nav-approve').checked = false;
  if (!navViews(model).some((c) => c.id === NAV.base)) NAV.base = navViews(model)[0].id;   // the first ticked map
  document.body.classList.add('nav');
  $('#navmode').hidden = false; $('#nav-controls').hidden = false;
  $('#navmode').scrollTop = 0;
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
  if (id === 'k-map') { // the maps ticked under "Tablet map" in the Layers menu, in that order
    const list = navViews(NAV.model).map((c) => c.id);
    NAV.base = list[(list.indexOf(navMap(NAV.model, NAV.base).id) + 1) % list.length];
  }
  frame(0, true);
}

function sendReturn(type) {
  if (!NAV.on || NAV.phase === 'home') return;
  const result = NAV.run.command(type, { approveProtected: $('#nav-approve').checked, reason: 'Habitat control: ' + type });
  if (!result.accepted) {
    $('#nav-override').hidden = !result.requiresOverride;
    $('#nav-return-message').textContent = result.requiresOverride
      ? 'At station: approve the protected return, then press Abort again.'
      : 'Return cannot be confirmed: ' + (result.reason ?? 'missing data');
  } else {
    const state = NAV.run.snapshot(); NAV.phase = state.phase; NAV.t = state.t;
    NAV.playing = state.phase !== 'home'; syncPause();
    $('#nav-override').hidden = true;
    $('#nav-return-message').textContent = state.phase === 'home' ? 'Crew at habitat.'
      : type === 'abort' ? 'ABORT logged · returning on the permitted route.' : 'Return now · same route, homeward.';
  }
  frame(0, true);
}

export function navWire() {
  $('#nav-return').addEventListener('click', () => sendReturn('return-now'));
  $('#nav-abort').addEventListener('click', () => sendReturn('abort'));
  $('#nav-injury').addEventListener('click', () => {
    if (!NAV.on || NAV.phase === 'home') return;
    const state = NAV.run.injury();
    NAV.phase = state.phase; NAV.t = state.t;
    $('#nav-return-message').textContent = state.injuryReturn?.accepted
      ? 'Injury at station · work ended · immediate return. Walking speed unchanged.'
      : state.injuryReturn ? 'Injury logged · automatic return unavailable.'
        : 'Injury logged · walking speed and active route unchanged.';
    if (state.injuryReturn?.accepted) $('#nav-override').hidden = true;
    frame(0, true);
  });
  $('#nav-speed').addEventListener('input', () => {
    if (!NAV.on || NAV.phase === 'home') return;
    const before = NAV.run.view();
    const factor = Number($('#nav-speed').value);
    const state = NAV.run.setSpeedFactor(factor);
    NAV.phase = state.phase; NAV.t = state.t;
    $('#nav-speed-value').textContent = `×${factor.toFixed(2)}`;
    $('#nav-speed').setAttribute('aria-valuetext', factor === 0 ? 'Stopped' : `${Math.round(factor * 100)}% of normal walking speed`);
    const after = NAV.run.view(), a = before.ttb, b = after.ttb;
    $('#nav-return-message').textContent = factor === 0 ? 'Crew stopped · mission clock continues. Increase speed to resume walking.'
      : `Walking speed ×${factor.toFixed(2)} · return ${a == null ? '—' : a.toFixed(1)} → ${b == null ? '—' : b.toFixed(1)} min. Injury status and route unchanged.`;
    frame(0, true);
  });
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
