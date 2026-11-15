import './styles/console.css';
import './styles/app.css';
import { loadData } from './data.js';
import { buildModel, ttbAt, slopeAt, layerValueAt } from './model.js';
import { createMap } from './map.js';
import { R, esc } from './format.js';
import * as ui from './ui.js';
import { PLAN, planOf } from './ui.js';
import { navStart, navWire, limitsAt, NAV } from './nav.js';
import { simStart, simWire, simJump, SIM } from './rehearsal.js';
import { initDataTools } from './datatools.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const st = { side: true, bar: true };   // map only: side panel and time bar folded away or not

let model;
let mapApi;

// ---------- planning: the base map and the panels ----------
function renderPlanMap() {
  mapApi.setArea({ L: limitsAt(model, PLAN.t0).L, f: 1, which: 'penalized' });
  const P = PLAN.n == null ? null : planOf(model, PLAN.n);
  const has = P && !P.noRoute;
  mapApi.showRoutes(has ? P.route : null, { preview: true, label: has ? `Route to ${P.station.name} · ${R(P.walk)} min out, ${R(P.back)} back` : null });
  mapApi.setCrew(null);
  model.stations.forEach((s) => mapApi.setStation(s.n, s.n === PLAN.n ? 'target' : ''));
}
function renderPlan() {
  ui.renderHeader(model, PLAN.t0);
  ui.renderVerdict(model);
  ui.renderPicker(model);
  ui.renderRules(model);
  ui.renderTarget(model, () => ui.renderTarget(model));
  ui.renderPlanBar(model);
  renderPlanMap();
}
function pick(n) { if (SIM.on || NAV.on) return; PLAN.n = n; renderPlan(); }

// ---------- map only: fold the side panel and the time bar away ----------
function applyPanel(which, open) {
  st[which] = open;
  if (which === 'side') $('.console').classList.toggle('no-side', !open);
  else $('.mapcol').classList.toggle('no-bar', !open);
  const b = $(`#tg-${which}`), txt = `${open ? 'Hide' : 'Show'} the ${which === 'side' ? 'side panel' : 'time bar'}`;
  b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-label', txt); b.title = txt;
}
function relayout() {
  mapApi.invalidate();
  if (!SIM.on && !NAV.on) ui.renderPlanBar(model);
}

// info boxes: a button opens the key; a second press, Escape or a click elsewhere closes it
function infoBox(btnSel, boxSel) {
  const btn = $(btnSel), box = $(boxSel);
  const set = (open) => { box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); set(box.hidden); });
  document.addEventListener('click', (e) => { if (!box.hidden && !box.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

function startRoute() {
  const P = PLAN.n == null ? null : planOf(model, PLAN.n);
  if (!P || !P.ok) return;
  navStart(model, P, () => { requestAnimationFrame(() => { relayout(); renderPlan(); }); });
}
function startSim() {
  if (NAV.on || SIM.on) return;
  closeMenus();
  $('#btn-sim').disabled = true;
  st.savedBar = st.bar;
  requestAnimationFrame(() => {
    try {
      simStart(model, mapApi, () => { applyPanel('side', st.sideBeforeSim ?? true); applyPanel('bar', st.savedBar); relayout(); renderPlan(); requestAnimationFrame(() => { mapApi.invalidate(); mapApi.fitPlan(); }); });
      st.sideBeforeSim = st.side;
      applyPanel('side', true);                        // the crew view lives in the side panel
      // the story strip takes room under the map; on a short window fold the time bar away
      if (st.bar && $('#mapwrap').getBoundingClientRect().height < 430) applyPanel('bar', false);
      relayout();
      requestAnimationFrame(() => { mapApi.invalidate(); mapApi.fitPlan(); });
    } finally { $('#btn-sim').disabled = false; }
  });
}
function closeMenus() {
  $('#layers').hidden = true; $('#btn-layers').setAttribute('aria-expanded', 'false');
  $('#assume').hidden = true; $('#btn-assume').setAttribute('aria-expanded', 'false');
  $('#legend').hidden = true; $('#btn-key').setAttribute('aria-expanded', 'false');
}

function wire() {
  $('#navpick-list').addEventListener('click', (e) => { const b = e.target.closest('.np-row'); if (b) pick(+b.dataset.n); });
  $('#np-stay').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; PLAN.stay = +b.dataset.stay; renderPlan(); });
  $('#np-t0').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; PLAN.t0 = +b.dataset.t0; renderPlan(); });
  $('#btn-start').addEventListener('click', startRoute);
  $('#btn-sim').addEventListener('click', startSim);
  $('#tg-side').addEventListener('click', () => { applyPanel('side', !st.side); relayout(); });
  $('#tg-bar').addEventListener('click', () => { applyPanel('bar', !st.bar); relayout(); });
  infoBox('#btn-key', '#legend');
  infoBox('#nv-key', '#nv-legend');
  const lb = $('#btn-layers'), lp = $('#layers');
  lb.addEventListener('click', (e) => { e.stopPropagation(); lp.hidden = !lp.hidden; lb.setAttribute('aria-expanded', String(!lp.hidden)); });
  document.addEventListener('click', (e) => { if (!lp.hidden && !lp.contains(e.target)) { lp.hidden = true; lb.setAttribute('aria-expanded', 'false'); } });
  $('#ly-area').addEventListener('change', (e) => mapApi.setLayer('area', e.target.checked));
  $('#ly-zones').addEventListener('change', (e) => mapApi.setLayer('zones', e.target.checked));
  $('#ly-trav').addEventListener('change', (e) => mapApi.setLayer('traverse', e.target.checked));
  // map layers: one switch per layer in layers/index.json, with its legend while it is shown
  const lm = $('#ly-maps');
  lm.innerHTML = model.layers.length ? model.layers.map((ly) => `<label><input type="checkbox" data-layer="${esc(ly.id)}"${ly.meta.layer?.visible ? ' checked' : ''}> ${esc(ly.name)}${ly.meta.units ? `, ${esc(ly.meta.units)}` : ''}</label>` +
    `<div class="ly-key" data-key="${esc(ly.id)}"${ly.meta.layer?.visible ? '' : ' hidden'}>${(ly.meta.legend || []).map((k) => `<span><i class="sw" style="background:rgba(${k.rgba.join(',')})"></i>${esc(k.label)}</span>`).join('')}</div>`).join('')
    : '<span class="cap">No map layers yet. Run pipeline/map_layers.py.</span>';
  lm.addEventListener('change', (e) => {
    const id = e.target.dataset.layer; if (!id) return;
    mapApi.setLayer(`layer:${id}`, e.target.checked);
    lm.querySelector(`[data-key="${CSS.escape(id)}"]`).hidden = !e.target.checked;
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
  // source cards: the chip label in orange, then why the value was chosen
  const tip = $('#tip');
  const show = (b) => {
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
  // readout under the pointer: position, slope and the engine's time to the habitat
  const ro = $('#readout');
  mapApi.map.on('mousemove', (e) => {
    const p = { lon: e.latlng.lng, lat: e.latlng.lat }, T = ttbAt(model, p, 'penalized'), sl = slopeAt(model, p);
    // values of the switched-on map layers, read from their value grids
    const shown = model.layers.filter((ly) => ly.id !== 'slope' && $(`#ly-maps input[data-layer="${CSS.escape(ly.id)}"]`)?.checked);
    const extra = shown.map((ly) => { const v = layerValueAt(model, ly, p); return v == null ? '' : ` · ${ly.name.split(/[,(]/)[0].trim().toLowerCase()} ${+v.toPrecision(3)}${ly.units ? ` ${ly.units}` : ''}`; }).join('');
    ro.textContent = `${p.lon.toFixed(4)}°E  ${Math.abs(p.lat).toFixed(4)}°${p.lat < 0 ? 'S' : 'N'}` + (sl != null ? ` · slope ${sl.toFixed(1)}°` : '') +
      (T == null ? '' : Number.isFinite(T) ? ` · ${R(T)} min to habitat` : ' · no way home') + extra;
  });
  mapApi.map.on('mouseout', () => { ro.textContent = ''; });
  // the map box changes size with the panels, the story strip and the window
  let rt = 0;
  const soon = () => { clearTimeout(rt); rt = setTimeout(relayout, 120); };
  addEventListener('resize', soon);
  if (window.ResizeObserver) new ResizeObserver(soon).observe($('#mapwrap'));
}

async function boot() {
  try {
    const data = await loadData();
    model = buildModel(data);
    mapApi = createMap($('#map'), data, model, { onStation: pick });
    ui.renderAssume(model);
    wire();
    navWire();
    simWire();
    const note = $('#legend-note');
    note.hidden = !!model.grid && !model.grid.placeholder;
    note.textContent = model.grid ? 'Placeholder grid: flat ground, no slope, no ridges. The routing engine replaces it.' : 'Return area and 60-minute line appear with the time-to-base grid from the routing engine.';
    mapApi.fitPlan();
    renderPlan();
    // Add data: new targets and maps (datatools.js); a saved change reloads the page with the new files
    initDataTools(model, mapApi, {
      onStationsChanged: (n) => { if (n != null) PLAN.n = n; else if (!model.routes.has(PLAN.n)) PLAN.n = null; renderPlan(); },
      reloadData: () => location.reload(),
    });
    $('#btn-sim').disabled = !model.routes.size;
    // ?beat=1..6 opens the emergency rehearsal at the end of that step (for checking the screens)
    const q = new URLSearchParams(location.search), b = +(q.get('beat') || 0);
    if (b >= 1 && b <= 6) { startSim(); requestAnimationFrame(() => requestAnimationFrame(() => simJump(b))); }
  } catch (err) {
    console.error(err);
    $('#map').innerHTML = `<div class="map-message">Data could not be loaded: ${err.message}</div>`;
  }
}

boot();
