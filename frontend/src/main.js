import './styles/console.css';
import './styles/app.css';
import { loadData } from './data.js';
import { buildModel } from './model.js';
import { createMap } from './map.js';
import { st, route, crewState, resetRun, scenarioStation, isScripted } from './sim.js';
import { renderCrew } from './crew.js';
import { BEATS, SKIN_FOR_BEAT } from './beats.js';
import * as ui from './ui.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let model;
let mapApi;

function renderMap() {
  const r = route(model);
  const c = crewState(model);
  if (st.phase === 'plan') {
    mapApi.showRoutes(r, { preview: true, ret: false });
    mapApi.setCrew(null);
  } else {
    mapApi.showRoutes(r, { ret: st.retStart != null });
    // once home, the crew is inside: the habitat marker stands for it
    if (st.done) mapApi.setCrew(null);
    else mapApi.setCrew(c.pos, { red: st.injuredAt != null, label: st.injuredAt != null ? 'Crew · crew member injured' : 'Crew' });
  }
  model.stations.forEach((s) => {
    const arrived = st.phase !== 'plan' && s.n === st.target && st.t >= (r?.out.minutes ?? Infinity);
    mapApi.setStation(s.n, arrived ? 'done' : s.n === st.target ? 'target' : '');
  });
}

function renderAll() {
  ui.renderHeader(model);
  ui.renderPicker(model);
  ui.renderVerdict(model);
  ui.renderRules(model);
  ui.renderInfo(model);
  ui.renderLog(model);
  ui.renderBudget(model);
  ui.renderSubs(model);
  ui.renderBanner(model);
  ui.renderLegendNote(model);
  renderCrew(model);
  renderMap();
}

// ---------- demo runner: every action is a click of habitat control ----------
let token = 0;
let raf = 0;
const sleep = (ms, tok) => new Promise((res, rej) => setTimeout(() => (tok === token ? res() : rej(new Error('stopped'))), ms));
function runClock(t1, tok, speed) {
  return new Promise((res, rej) => {
    let last = performance.now();
    let lastMinute = Math.floor(st.t);
    const tick = (now) => {
      if (tok !== token) return rej(new Error('stopped'));
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      st.t = Math.min(t1, st.t + dt * (speed ?? st.speedX) / 60);
      if (Math.floor(st.t) !== lastMinute) { lastMinute = Math.floor(st.t); renderAll(); } else renderMap();
      if (st.t >= t1) { renderAll(); return res(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
function press(sel) { const b = $(sel); if (b) b.classList.add('is-pressed'); }
function beat(n) { st.beat = n; st.skin = SKIN_FOR_BEAT[n]; renderAll(); }

async function playDemo() {
  const tok = ++token;
  const r = route(model);
  st.playing = true;
  try {
    st.phase = 'run'; st.t = 0;
    beat(1);
    await runClock(r.out.minutes, tok, 240);
    await sleep(1500, tok);
    beat(2);
    st.t = Math.max(st.t, 285); renderAll();
    await sleep(5000, tok);
    beat(3);
    await runClock(300, tok);
    press('#act-return'); await sleep(400, tok);
    st.retStart = st.t; renderAll();
    await runClock(312, tok);
    await sleep(1000, tok);
    beat(4);
    st.driftAt = st.t;
    await runClock(314, tok);
    await sleep(1500, tok);
    press('#act-reroute'); await sleep(400, tok);
    st.rerouted = true; st.rerouteAt = st.t; renderAll();
    await sleep(2000, tok);
    st.injuredAt = st.t;
    beat(5);
    await sleep(5000, tok);
    beat(6);
    await sleep(1500, tok);
    press('#act-abort'); await sleep(400, tok);
    st.abort = true; renderAll();
    await runClock(st.t + crewState(model).backMin, tok, 240);
    st.done = true; st.phase = 'done'; renderAll();
  } catch { /* stopped by the user */ }
  st.playing = false;
}

// Any other station: out and back along the engine's tracks, no scripted events
async function playNav() {
  const tok = ++token;
  const r = route(model);
  st.playing = true;
  try {
    st.phase = 'run'; st.t = 0; st.skin = 'cuff'; renderAll();
    await runClock(r.out.minutes, tok, 240);
    await sleep(1500, tok);
    press('#act-return'); await sleep(400, tok);
    st.retStart = st.t; renderAll();
    await runClock(st.t + r.ret.minutes, tok, 240);
    st.done = true; st.phase = 'done'; renderAll();
  } catch { /* stopped by the user */ }
  st.playing = false;
}

function stop() { token++; cancelAnimationFrame(raf); st.playing = false; }

// Jump to the end state of a beat (for checking the screens; the demo itself starts with Start).
// The beats belong to the scenario station, so a jump always selects it.
function goBeat(n) {
  stop();
  resetRun(scenarioStation(model));
  const r = route(model);
  st.phase = 'run';
  if (n >= 1) st.t = r.out.minutes;
  if (n >= 2) st.t = Math.max(st.t, 285);
  if (n >= 3) { st.retStart = 300; st.t = 312; }
  if (n >= 4) { st.driftAt = 313; st.t = 314; st.rerouted = true; st.rerouteAt = 314; }
  if (n >= 5) { st.injuredAt = 315; st.t = 315; }
  if (n >= 6) { st.abort = true; st.t += crewState(model).backMin; st.done = true; st.phase = 'done'; }
  st.beat = n;
  st.skin = SKIN_FOR_BEAT[n];
  renderAll();
}

function wire() {
  $('#pick-list').addEventListener('click', (e) => {
    const b = e.target.closest('.pick-row');
    if (!b) return;
    resetRun(+b.dataset.n);
    renderAll();
  });
  $('#btn-start').addEventListener('click', () => { if (st.target != null && !st.playing) (isScripted(model) ? playDemo : playNav)(); });
  $('#verdict').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || st.playing) return;
    if (b.id === 'act-return') st.retStart = st.t;
    if (b.id === 'act-reroute') { st.rerouted = true; st.rerouteAt = st.t; }
    if (b.id === 'act-abort') st.abort = true;
    renderAll();
  });
  $('#tp-dots').innerHTML = BEATS.map((b) => `<button type="button" data-b="${b.n}" aria-label="Beat ${b.n}: ${b.title}">${b.n}</button>`).join('');
  $('#tp-dots').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goBeat(+b.dataset.b); });
  $('#tp-prev').addEventListener('click', () => (st.beat > 1 ? goBeat(st.beat - 1) : (stop(), resetRun(st.target ?? scenarioStation(model)), renderAll())));
  $('#tp-next').addEventListener('click', () => goBeat(Math.min(6, st.beat + 1)));
  $$('.clock .seg button').forEach((b) => b.addEventListener('click', () => { st.speedX = +b.dataset.x; ui.renderBudget(model); }));
  $$('.crew-head .seg button').forEach((b) => b.addEventListener('click', () => { st.skin = b.dataset.skin; renderCrew(model); }));
  const lb = $('#btn-layers'), lp = $('#layers');
  lb.addEventListener('click', (e) => { e.stopPropagation(); lp.hidden = !lp.hidden; lb.setAttribute('aria-expanded', String(!lp.hidden)); });
  document.addEventListener('click', (e) => { if (!lp.hidden && !lp.contains(e.target)) { lp.hidden = true; lb.setAttribute('aria-expanded', 'false'); } });
  $('#ly-area').addEventListener('change', (e) => mapApi.setLayer('area', e.target.checked));
  $('#ly-zones').addEventListener('change', (e) => mapApi.setLayer('zones', e.target.checked));
  $('#ly-trav').addEventListener('change', (e) => mapApi.setLayer('traverse', e.target.checked));
  const ap = $('#assume');
  $('#btn-assume').addEventListener('click', () => { ap.hidden = !ap.hidden; $('#btn-assume').setAttribute('aria-expanded', String(!ap.hidden)); });
  $('#assume-close').addEventListener('click', () => { ap.hidden = true; $('#btn-assume').setAttribute('aria-expanded', 'false'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { lp.hidden = true; ap.hidden = true; } });
  const tip = $('#tip');
  const show = (b) => {
    tip.textContent = b.dataset.tip; tip.hidden = false;
    const r = b.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.right - tip.offsetWidth))}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 8 < 8 ? r.bottom + 8 : r.top - tip.offsetHeight - 8}px`;
  };
  document.addEventListener('mouseover', (e) => { const b = e.target.closest('[data-tip]'); if (b) show(b); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]')) tip.hidden = true; });
  document.addEventListener('focusin', (e) => { const b = e.target.closest('[data-tip]'); if (b) show(b); });
  document.addEventListener('focusout', (e) => { if (e.target.closest('[data-tip]')) tip.hidden = true; });
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => ui.renderBudget(model), 150); });
}

async function boot() {
  try {
    const data = await loadData();
    model = buildModel(data);
    mapApi = createMap($('#map'), data, model);
    mapApi.fitPlan();
    ui.renderAssume(model);
    wire();
    const q = new URLSearchParams(location.search);
    if (q.get('beat')) goBeat(+q.get('beat')); else renderAll();
  } catch (err) {
    console.error(err);
    $('#map').innerHTML = `<div class="map-message">Data could not be loaded: ${err.message}</div>`;
  }
}

boot();
