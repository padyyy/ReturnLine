import './styles/console.css';
import './styles/app.css';
import './styles/theme.css';   // mission-control look (design only)
import './styles/return-line.css';
import { loadData } from './data.js';
import { buildModel, ttbAt, slopeAt, layerValueAt } from './model.js';
import { createMap } from './map.js';
import { R, esc, icon } from './format.js';
import * as ui from './ui.js';
import { PLAN, planOf } from './ui.js';
import { navStart, navWire, limitsAt, NAV } from './nav.js';
import { simStart, simWire, simJump, SIM } from './rehearsal.js';
import { initDataTools, canRemove } from './datatools.js';
import { NAMES } from './crewviz.js';
import { returnLineSegments } from './return-line.js';
import { LS, initLayers, saveLayers, moveLayer, layerById, navChoices, navViews } from './layerstate.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const st = { side: true, bar: true };   // map only: side panel and time bar folded away or not

let model;
let mapApi;

// ---------- planning: the base map and the panels ----------
function renderPlanMap() {
  const P = PLAN.n == null ? null : planOf(model, PLAN.n);
  const has = P && !P.noRoute;
  mapApi.setArea({ L: limitsAt(model, PLAN.t0).L, f: 1, which: 'penalized', tracks: has ? [P.out, P.ret] : [] });
  const alt = has ? P.other : null;   // the other route variant, faded, for comparison
  mapApi.showRoutes(has ? P.route : null, {
    preview: true, label: has ? `${P.variantName} · ${R(P.walk)} min out, ${R(P.back)} back` : null,
    alt: alt?.out ?? null, altLabel: alt ? `${alt.name} · ${R(alt.out.minutes)} min out` : null,
    returnSegments: has && $('#ly-area').checked
      ? returnLineSegments({model,plan:P,phase:'out',t:P.t0,tt:0}).segments : [],
  });
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
      // the story talks about the return stages along the route: show them during the rehearsal, then restore
      const areaBox = $('#ly-area'); st.areaBeforeSim = areaBox.checked;
      areaBox.checked = true; mapApi.setLayer('area', true);
      simStart(model, mapApi, () => {
        areaBox.checked = st.areaBeforeSim; mapApi.setLayer('area', st.areaBeforeSim);
        applyPanel('side', st.sideBeforeSim ?? true); applyPanel('bar', st.savedBar); relayout(); renderPlan(); requestAnimationFrame(() => { mapApi.invalidate(); mapApi.fitPlan(); });
      });
      st.sideBeforeSim = st.side;
      applyPanel('side', true);                        // the crew view lives in the side panel
      // the story strip takes room under the map; on a short window fold the time bar away
      if (st.bar && $('#mapwrap').getBoundingClientRect().height < 430) applyPanel('bar', false);
      relayout();
      requestAnimationFrame(() => { mapApi.invalidate(); mapApi.fitPlan(); });
    } finally { $('#btn-sim').disabled = false; }
  });
}
// ---------- Layers menu: map layers in their order (top lies on top), opacity, and the tablet maps ----------
function applyLayers() {
  const n = LS.order.length;
  LS.order.forEach((id, k) => {
    mapApi.setLayerStyle(id, { zIndex: 100 + n - k, opacity: LS.opacity[id] });
    mapApi.setLayer(`layer:${id}`, LS.on.has(id));
  });
}
function renderLayerMenu() {
  const lm = $('#ly-maps'), n = LS.order.length;
  lm.innerHTML = n ? LS.order.map((id, k) => {
    const ly = layerById(model, id), on = LS.on.has(id), op = Math.round((LS.opacity[id] ?? 0.6) * 100), nm = esc(ly.name);
    const key = (ly.meta.legend || []).map((x) => `<span><i class="sw" style="background:rgba(${x.rgba.join(',')})"></i>${esc(x.label)}</span>`).join('');
    return `<li class="ly-row${on ? ' is-on' : ''}" data-row="${esc(id)}">` +
      `<div class="ly-top"><label><input type="checkbox" data-layer="${esc(id)}"${on ? ' checked' : ''}><span class="ly-name">${nm}${ly.units ? `, ${esc(ly.units)}` : ''}</span></label>` +
      `<span class="ly-mv"><button type="button" class="ly-b" data-mv="-1" data-id="${esc(id)}" aria-label="Move ${nm} up, over the others" title="Up: drawn over the layers below"${k === 0 ? ' disabled' : ''}>${icon('chev', 'up')}</button>` +
      `<button type="button" class="ly-b" data-mv="1" data-id="${esc(id)}" aria-label="Move ${nm} down" title="Down: drawn under the layers above"${k === n - 1 ? ' disabled' : ''}>${icon('chev', 'down')}</button></span></div>` +
      `<div class="ly-sub"${on ? '' : ' hidden'}><label class="ly-op"><span>Opacity</span><input type="range" min="10" max="100" step="5" value="${op}" data-op="${esc(id)}" aria-label="Opacity of ${nm}"><output>${op} %</output></label>` +
      `${key ? `<div class="ly-key">${key}</div>` : ''}</div></li>`;
  }).join('') : '<li class="cap">No map layers yet. Run pipeline/map_layers.py.</li>';
  renderNavMenu();
}
function renderNavMenu() {
  const ids = navViews(model).map((c) => c.id);
  $('#ly-nav').innerHTML = navChoices(model).map((c) => {
    const k = ids.indexOf(c.id), on = !LS.navOff.has(c.id);
    return `<li><label${c.empty ? ' class="is-off"' : ''}><input type="checkbox" data-nav="${esc(c.id)}"${on ? ' checked' : ''}${c.empty ? ' disabled' : ''}>` +
      `<span class="ly-n${k >= 0 ? '' : ' is-out'}">${k >= 0 ? k + 1 : '–'}</span><span class="ly-name">${esc(c.label)}<small>${esc(c.detail)}</small></span></label></li>`;
  }).join('');
}
function wireLayerMenu() {
  const lm = $('#ly-maps'), refocus = (sel) => requestAnimationFrame(() => { const el = lm.querySelector(sel); if (el && !el.disabled) el.focus(); });
  lm.addEventListener('change', (e) => {
    const id = e.target.dataset.layer; if (!id) return;
    if (e.target.checked) LS.on.add(id); else LS.on.delete(id);
    saveLayers(); applyLayers(); renderLayerMenu(); refocus(`input[data-layer="${CSS.escape(id)}"]`);
  });
  lm.addEventListener('input', (e) => {
    const id = e.target.dataset.op; if (!id) return;
    LS.opacity[id] = +e.target.value / 100;
    e.target.nextElementSibling.textContent = `${e.target.value} %`;
    mapApi.setLayerStyle(id, { opacity: LS.opacity[id] }); saveLayers();
  });
  lm.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mv]'); if (!b) return;
    if (moveLayer(b.dataset.id, +b.dataset.mv)) { saveLayers(); applyLayers(); renderLayerMenu(); refocus(`[data-mv="${b.dataset.mv}"][data-id="${CSS.escape(b.dataset.id)}"]`); }
  });
  $('#ly-nav').addEventListener('change', (e) => {
    const id = e.target.dataset.nav; if (!id) return;
    if (e.target.checked) LS.navOff.delete(id); else LS.navOff.add(id);
    saveLayers(); renderNavMenu();
    requestAnimationFrame(() => $(`#ly-nav input[data-nav="${CSS.escape(id)}"]`)?.focus());
  });
}

// Remove an added target from the station list or the station details: the first press asks, a
// second one within 4 s removes it; with the local tools the plan is rebuilt and the page reloads
function wireRemove(dt) {
  let armed = null, timer = 0;
  const label = (b, txt) => { b.querySelector('span').textContent = txt; };
  const disarm = () => { if (armed) { armed.classList.remove('is-armed'); label(armed, armed.dataset.txt); } armed = null; clearTimeout(timer); };
  const onClick = async (e) => {
    const b = e.target.closest('[data-rm-n]'); if (!b) return;
    e.stopPropagation();
    const s = model.stations.find((x) => x.n === +b.dataset.rmN); if (!s) return;
    if (armed !== b) {
      disarm(); armed = b; b.classList.add('is-armed'); label(b, 'Remove? Press again');
      timer = setTimeout(disarm, 4000);
      return;
    }
    clearTimeout(timer); armed = null;
    b.disabled = true; label(b, s.session ? 'Removing…' : 'Rebuilding the plan…');
    const out = await dt.removeStation(s);
    if (!out.ok) { b.disabled = false; b.classList.remove('is-armed'); label(b, `Not removed: ${out.error ?? 'pipeline failed'}`); }
  };
  $('#navpick-list').addEventListener('click', onClick, true);
  $('#target').addEventListener('click', onClick);
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
  $('#np-variant').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; PLAN.variant = b.dataset.variant; renderPlan(); });
  $('#btn-start').addEventListener('click', startRoute);
  $('#btn-sim').addEventListener('click', startSim);
  $('#tg-side').addEventListener('click', () => { applyPanel('side', !st.side); relayout(); });
  $('#tg-bar').addEventListener('click', () => { applyPanel('bar', !st.bar); relayout(); });
  // Curiosity pictures in the station details: click opens the big view
  $('#target').addEventListener('click', (e) => { const b = e.target.closest('.pic-btn'); if (b) ui.openPicture(model, +b.dataset.n, +b.dataset.pic); });
  const pb = $('#pic-box'), step = (d) => { const n = +pb.dataset.n, all = model.pictures.filter((x) => x.n === n); ui.openPicture(model, n, (+pb.dataset.k + d + all.length) % all.length); };
  $('#pic-close').addEventListener('click', () => pb.close());
  $('#pic-prev').addEventListener('click', () => step(-1));
  $('#pic-next').addEventListener('click', () => step(1));
  pb.addEventListener('click', (e) => { if (e.target === pb) pb.close(); });   // click on the backdrop
  infoBox('#btn-key', '#legend');
  infoBox('#nv-key', '#nv-legend');
  const lb = $('#btn-layers'), lp = $('#layers');
  lb.addEventListener('click', (e) => { e.stopPropagation(); lp.hidden = !lp.hidden; lb.setAttribute('aria-expanded', String(!lp.hidden)); });
  // composedPath: a click on a menu row that re-renders itself still counts as inside the menu
  document.addEventListener('click', (e) => { if (!lp.hidden && !e.composedPath().includes(lp)) { lp.hidden = true; lb.setAttribute('aria-expanded', 'false'); } });
  $('#ly-area').addEventListener('change', (e) => {
    mapApi.setLayer('area', e.target.checked);
    if (!SIM.on && !NAV.on) renderPlanMap();
  });
  $('#ly-zones').addEventListener('change', (e) => mapApi.setLayer('zones', e.target.checked));
  $('#ly-trav').addEventListener('change', (e) => mapApi.setLayer('traverse', e.target.checked));
  $('#ly-names').addEventListener('change', (e) => { NAMES.on = e.target.checked; mapApi.setLayer('names', e.target.checked); });
  if (!model.names.length) { const z = $('#ly-names').parentElement; z.classList.add('is-off'); $('#ly-names').disabled = true; }
  // map layers: one row per layer in layers/index.json (order, opacity, legend) and the tablet maps
  initLayers(model); applyLayers(); renderLayerMenu(); wireLayerMenu();
  if (!model.zones.length) { const z = $('#ly-zones').parentElement; z.classList.add('is-off'); z.lastChild.textContent = ' Protected zones · none yet'; }
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
  // source cards: the chip label in the accent colour, then why the value was chosen
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
    const shown = LS.order.filter((id) => id !== 'slope' && LS.on.has(id)).map((id) => layerById(model, id));
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
    // the story strip fills after the rehearsal fitted the map and makes it shorter: refit on every size change
    // during the rehearsal, so the habitat and the scenario station stay in view
    if (window.ResizeObserver) {
      let rz = 0;
      new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { mapApi.invalidate(); if (document.body.classList.contains('sim')) mapApi.fitPlan(); }); }).observe($('#map'));
    }
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
    const dt = initDataTools(model, mapApi, {
      onStationsChanged: (n) => { if (n != null) PLAN.n = n; else if (!model.routes.has(PLAN.n)) PLAN.n = null; renderPlan(); },
      reloadData: () => location.reload(),
      onToolsChanged: () => { if (!SIM.on && !NAV.on) renderPlan(); },
    });
    ui.HOOKS.canRemove = canRemove;
    wireRemove(dt);
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
