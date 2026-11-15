import './styles/console.css';
import './styles/app.css';
import { loadData } from './data.js';
import { buildModel } from './model.js';
import { createMap } from './map.js';
import { st, route, crewState, resetRun, scenarioStation, isScripted, limits, walkFactor, abortTrack, script, rerouteTrack, detourMin, injure, injuryOptions } from './sim.js';
import { renderCrew, crewFrame, cuffKey } from './crew.js';
import { BEATS, SKIN_FOR_BEAT, CUFF_MODE_FOR_BEAT } from './beats.js';
import * as ui from './ui.js';
import { esc } from './format.js';

// Map layers in the Layers menu (pipeline/map_layers.py; idea and layers from Alex's branch): a switch and
// an opacity slider per layer, its legend and source. "Add a map" works only with the local data tools of
// `npm run dev` (frontend/tools/data-tools.js); the published static app says so instead.
function wireMapLayers() {
  const list = $('#ly-maps');
  $('#ly-maps-h').hidden = !model.mapLayers.length;
  list.innerHTML = model.mapLayers.map((ly) => {
    // a legend of bare numbers without units (the orthophoto's 0 and 255) says nothing, so it is left out
    const plain = !ly.units && ly.legend.every((g) => /^-?[\d.]+$/.test(String(g.label)));
    const key = plain ? '' : ly.legend.map((g) => `<span><i class="sw" style="background:rgba(${g.rgba.join(',')})"></i>${esc(g.label)}${ly.units ? ` ${esc(ly.units)}` : ''}</span>`).join('');
    return `<div class="ly-map"><label><input type="checkbox" data-map="${esc(ly.id)}"${ly.visible ? ' checked' : ''}> ${esc(ly.name)}</label>` +
      `<div class="ly-map-more"${ly.visible ? '' : ' hidden'}><div class="ly-key">${key}</div>` +
      `<label class="ly-op">Opacity <input type="range" min="0" max="100" value="${Math.round(ly.opacity * 100)}" data-map-op="${esc(ly.id)}" aria-label="Opacity of ${esc(ly.name)}"></label>` +
      `${ly.note ? `<span class="cap">${esc(ly.note)}</span>` : ''}</div></div>`;
  }).join('');
  list.addEventListener('change', (e) => {
    const id = e.target.dataset.map;
    if (!id) return;
    mapApi.setLayer(`map:${id}`, e.target.checked);
    e.target.closest('.ly-map').querySelector('.ly-map-more').hidden = !e.target.checked;
  });
  list.addEventListener('input', (e) => { const id = e.target.dataset.mapOp; if (id) mapApi.setMapLayerOpacity(id, e.target.value / 100); });

  const note = $('#ly-add-note'), btn = $('#ly-add-btn'), status = $('#ly-add-status');
  const tools = (path, opts = {}) => fetch(path, { ...opts, headers: { 'X-RL-Tools': '1', ...(opts.headers || {}) } });
  tools('/__tools/status').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((s) => {
    if (!s?.ok) throw new Error('no tools');
    note.textContent = 'Local data tools found. GeoMapper places a georeferenced GeoTIFF or a CSV with latitude and longitude on the console grid (pipeline/map_layers.py).';
    btn.disabled = false;
  }).catch(() => {
    note.textContent = 'Adding a map needs the local console (npm run dev) with Python and GeoMapper. The published demo is static.';
    $('#ly-add-form').querySelectorAll('input').forEach((i) => { i.disabled = true; });
  });
  $('#ly-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = $('#ly-add-file').files[0];
    if (!file) return;
    btn.disabled = true;
    status.textContent = `Placing ${file.name} on the grid …`;
    const q = new URLSearchParams({ file: file.name, name: $('#ly-add-name').value.trim(), units: $('#ly-add-units').value.trim() });
    try {
      const r = await tools(`/__tools/layers?${q}`, { method: 'POST', body: file });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) throw new Error(res.error || `HTTP ${r.status}`);
      status.textContent = `Added: ${(res.layers || [res.id]).join(', ')}. Reloading …`;
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      status.textContent = `Not added: ${err.message}`;
      btn.disabled = false;
    }
  });
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let model;
let mapApi;

function renderMap() {
  const r = route(model);
  const c = crewState(model);
  // return area, rule B: home in time from here, now (abort: zones allowed, injured: half speed)
  mapApi.setArea({ L: limits(model).L, f: st.phase === 'plan' ? 1 : walkFactor(), which: st.abortAt != null ? 'allowed' : 'penalized' });
  if (st.phase === 'plan') {
    mapApi.showRoutes(r, { preview: true, ret: false });
    mapApi.setCrew(null);
  } else {
    // beat 4: the drift drawn as far as the crew has walked it, the reroute and the finding ring at its end
    const sp = st.drift ? script(model) : null;
    const det = detourMin(model);
    mapApi.showRoutes(r, {
      ret: st.retStart != null,
      abort: abortTrack(model),
      drift: sp ? walked(sp.drift, st.t - sp.tQa) : null,
      reroute: rerouteTrack(model),
      rerouteLabel: det != null ? `Reroute · +${Math.max(0, Math.round(det))} min` : null,
      ring: sp && st.driftAt != null && st.t >= st.driftAt ? sp.D : null,
      // beat 5 until habitat control confirms: both ways home, labeled with injured minutes
      options: st.injuredAt != null && st.abortAt == null ? injuryOptions(model) : null,
    });
    // once home, the crew is inside: the habitat marker stands for it
    if (st.done) mapApi.setCrew(null);
    else mapApi.setCrew(c.pos, { red: st.injuredAt != null, label: st.injuredAt != null ? 'Crew · injured' : 'Crew' });
  }
  crewFrame(model); // moving parts of the crew view (navigation map, HUD)
  model.stations.forEach((s) => {
    const arrived = st.phase !== 'plan' && s.n === st.target && st.t >= (r?.out.minutes ?? Infinity);
    mapApi.setStation(s.n, arrived ? 'done' : s.n === st.target ? 'target' : '');
  });
}

// The part of a timed track walked after tt track minutes
function walked(track, tt) {
  if (tt >= track.minutes) return track;
  const v = track.vertices.filter((x) => x.t_min <= tt);
  return { vertices: v.length > 1 ? v : track.vertices.slice(0, 2), minutes: tt, length_m: 0 };
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
function beat(n) { st.beat = n; st.skin = SKIN_FOR_BEAT[n]; st.cuffMode = CUFF_MODE_FOR_BEAT[n] ?? 'values'; renderAll(); }

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
    const sp = script(model); // drift toward the protected zone nearest the way home (needs the grid)
    await runClock(sp ? sp.tQa : 312, tok);
    await sleep(1000, tok);
    beat(4);
    if (sp) {
      st.drift = true; renderAll();
      await runClock(sp.tD, tok);                 // the crew drifts until warn metres from the zone
      st.driftAt = sp.tD; renderAll();            // the console warns
      await sleep(2500, tok);
      press('#act-reroute'); await sleep(400, tok);
      st.rerouted = true; st.rerouteAt = st.t; renderAll();
      await runClock(st.t + 1.5, tok);            // on the engine's way around the zone
    } else {
      st.driftAt = st.t;
      await runClock(st.t + 2, tok);
    }
    await sleep(1000, tok);
    injure(model);
    beat(5);
    await sleep(5000, tok);
    beat(6);
    await sleep(1500, tok);
    press('#act-abort'); await sleep(400, tok);
    st.abort = true; st.abortAt = st.t; renderAll();
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
    st.phase = 'run'; st.t = 0; st.skin = 'cuff'; st.cuffMode = 'map'; renderAll(); // navigation run: the cuff's map
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
  const sp = n >= 3 ? (st.retStart = 300, script(model)) : null;
  if (n >= 3) st.t = sp ? sp.tQa : 312;
  if (n >= 4) {
    if (sp) { st.drift = true; st.driftAt = sp.tD; st.rerouted = true; st.rerouteAt = sp.tD + 0.5; st.t = st.rerouteAt; }
    else { st.driftAt = st.t + 1; st.t += 2; }
  }
  if (n >= 5) { st.t += 1.5; injure(model); }
  if (n >= 6) { st.abort = true; st.abortAt = st.t; st.t += crewState(model).backMin; st.done = true; st.phase = 'done'; }
  st.beat = n;
  st.skin = SKIN_FOR_BEAT[n];
  st.cuffMode = CUFF_MODE_FOR_BEAT[n] ?? 'values';
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
    if (b.id === 'act-reroute') { st.rerouted = true; st.rerouteAt = st.t; if (st.driftAt == null) st.driftAt = st.t; }
    if (b.id === 'act-abort') { st.abort = true; st.abortAt = st.t; }
    renderAll();
  });
  $('#tp-dots').innerHTML = BEATS.map((b) => `<button type="button" data-b="${b.n}" aria-label="Beat ${b.n}: ${b.title}">${b.n}</button>`).join('');
  $('#tp-dots').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goBeat(+b.dataset.b); });
  $('#tp-prev').addEventListener('click', () => (st.beat > 1 ? goBeat(st.beat - 1) : (stop(), resetRun(st.target ?? scenarioStation(model)), renderAll())));
  $('#tp-next').addEventListener('click', () => goBeat(Math.min(6, st.beat + 1)));
  $$('.clock .seg button').forEach((b) => b.addEventListener('click', () => { st.speedX = +b.dataset.x; ui.renderBudget(model); }));
  $$('.crew-head .seg button').forEach((b) => b.addEventListener('click', () => { st.skin = b.dataset.skin; renderCrew(model); }));
  // cuff hardware keys: they change only the crew's own view
  $('#crew-body').addEventListener('click', (e) => {
    const k = e.target.closest('[data-key]');
    if (!k) return;
    const id = k.dataset.key;
    cuffKey(model, id);
    const again = document.querySelector(`#crew-body [data-key="${id}"]`);
    if (again) { again.classList.add('is-pressed'); again.focus(); setTimeout(() => again.classList.remove('is-pressed'), 140); }
  });
  const lb = $('#btn-layers'), lp = $('#layers');
  lb.addEventListener('click', (e) => { e.stopPropagation(); lp.hidden = !lp.hidden; lb.setAttribute('aria-expanded', String(!lp.hidden)); });
  document.addEventListener('click', (e) => { if (!lp.hidden && !lp.contains(e.target)) { lp.hidden = true; lb.setAttribute('aria-expanded', 'false'); } });
  $('#ly-area').addEventListener('change', (e) => mapApi.setLayer('area', e.target.checked));
  $('#ly-zones').addEventListener('change', (e) => mapApi.setLayer('zones', e.target.checked));
  $('#ly-trav').addEventListener('change', (e) => mapApi.setLayer('traverse', e.target.checked));
  // slope layer from the pipeline: only offered when its file is there
  $('#ly-slope-row').hidden = !model.hasSlopeLayer;
  $('#ly-slope').addEventListener('change', (e) => { mapApi.setLayer('slope', e.target.checked); $('#ly-slope-key').hidden = !e.target.checked; });
  wireMapLayers();
  // collapsible map key; the choice is a per-viewer convenience, so browser storage is fine
  const lgd = $('#legend'), lgt = $('#legend-toggle');
  const setLegend = (open) => { lgd.classList.toggle('is-collapsed', !open); lgt.setAttribute('aria-expanded', String(open)); };
  try { if (localStorage.getItem('rl.legend') === 'collapsed') setLegend(false); } catch { /* storage blocked */ }
  lgt.addEventListener('click', () => {
    const open = lgd.classList.contains('is-collapsed');
    setLegend(open);
    try { localStorage.setItem('rl.legend', open ? 'open' : 'collapsed'); } catch { /* storage blocked */ }
  });
  // 100 m survey grid: off by default, on with ?grid=1 or the remembered choice of this viewer
  const tg = $('#tgl-grid');
  let gridOn = new URLSearchParams(location.search).get('grid') === '1';
  try { if (localStorage.getItem('rl.grid') === 'on') gridOn = true; } catch { /* storage blocked */ }
  tg.checked = gridOn;
  mapApi.setGrid(gridOn);
  tg.addEventListener('change', () => {
    mapApi.setGrid(tg.checked);
    try { localStorage.setItem('rl.grid', tg.checked ? 'on' : 'off'); } catch { /* storage blocked */ }
  });
  const ap = $('#assume');
  $('#btn-assume').addEventListener('click', () => { ap.hidden = !ap.hidden; $('#btn-assume').setAttribute('aria-expanded', String(!ap.hidden)); });
  $('#assume-close').addEventListener('click', () => { ap.hidden = true; $('#btn-assume').setAttribute('aria-expanded', 'false'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { lp.hidden = true; ap.hidden = true; } });
  const tip = $('#tip');
  const show = (b) => {
    // source cards as in the sketch: the chip label in yellow, then why the value was chosen
    tip.replaceChildren();
    if (b.dataset.tipLabel) { const k = document.createElement('b'); k.textContent = b.dataset.tipLabel; tip.append(k, ' · '); }
    tip.append(b.dataset.tip);
    tip.hidden = false;
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
    ui.renderAssume(model);
    wire();
    mapApi.fitPlan(); // after wire(): the padding depends on whether the map key is collapsed
    const q = new URLSearchParams(location.search);
    if (q.get('beat')) goBeat(+q.get('beat')); else renderAll();
  } catch (err) {
    console.error(err);
    $('#map').innerHTML = `<div class="map-message">Data could not be loaded: ${err.message}</div>`;
  }
}

boot();
