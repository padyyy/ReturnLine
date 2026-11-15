// "Add data" panel (Layers menu): new targets and new maps.
// - With the local data tools (`npm run dev`, frontend/tools/data-tools.js) a target or a GeoTIFF is
//   saved in data/ and processed offline: GeoMapper places it on the console grid, a target gets an
//   A* route (backend/astar.py) and Tobler times, a map becomes a layer (pipeline/map_layers.py).
// - Without them (the static app on GitHub Pages) a target is added for this session only: its cell
//   on the console grid (the formula of GeoMapper's MappingGrid.xy, model.cellIndex), its way home by
//   following the engine's return pointers (a lookup, no search), and walking times from Michael's
//   route-duration model (Tobler, src/route-duration.js) on the DEM elevation. Maps need GeoMapper and
//   therefore the local tools.
import { esc, R } from './format.js';
import { cellIndex, ttbAt, elevAt, slopeAt, terrainAt, zoneAt, distM, pointerTrack, zoneHits } from './model.js';
import { estimateDuration } from './route-duration.js';
import { sectionsFromTrack } from './route-duration-input.js';

const $ = (s) => document.querySelector(s);
// preview of the colour scales of pipeline/map_layers.py (RAMPS), low values left
const RAMP_PREVIEW = {
  blues: ['#3fa9f5', '#3891d6', '#3179b8', '#2a6199', '#22487a', '#1b305b', '#14183d'],
  viridis: ['#440154', '#3B528B', '#21918C', '#5EC962', '#FDE725'],
  magma: ['#000004', '#3B0F70', '#8C2981', '#DE4968', '#FE9F6D', '#FCFDBF'],
  greys: ['#EDF0E6', '#80878B', '#2B2D2F'],
};
const HDR = { 'X-RL-Tools': '1' };
let tools = null;            // status from the local data tools, or null
let picking = false;
let picked = null;           // { lon, lat }
const session = [];          // targets added in this session (no tools)

// Where a point lands on the console grid and what the grids say about it
export function pointPreview(model, p) {
  const g = model.grid;
  if (!g) return { ok: false, why: 'return-time data unavailable' };
  const i = cellIndex(g, p);
  if (i < 0) return { ok: false, why: 'outside the mapped area' };
  const col = i % g.header.nx, row = Math.floor(i / g.header.nx);
  // the 10 m grid decides (the same grid the routes are made on); the GeoMapper elevation map is shown beside it
  const slope = slopeAt(model, p), z = elevAt(model, p), T = ttbAt(model, p, 'penalized'), zone = zoneAt(model, p), ter = terrainAt(model, p);
  const blocked = slope != null && slope > model.sc.slope_block_deg;
  const reach = Number.isFinite(T);
  return { ok: reach && !blocked && !zone, col, row, i, slope, z, T, zone, blocked, reach, dem: ter.src === 'geomapper' ? ter : null,
    why: zone ? `inside ${zone.name}, a protected zone` : blocked ? `slope ${slope.toFixed(1)}° over the ${model.sc.slope_block_deg}° limit` : !reach ? 'no way home from here' : '' };
}

// Time a track with the route-duration model (Tobler, directed); t_min per vertex, minutes in total
function timed(model, vertices) {
  let d = 0;
  const vs = vertices.map((v, k) => { if (k) d += distM(vertices[k - 1], v); return { ...v, d_m: d }; });
  const res = estimateDuration(sectionsFromTrack({ vertices: vs }), { model: { baseSpeedMps: model.sc.walk_speed_kmh / 3.6 } });
  let s = 0;
  for (let k = 1; k < vs.length; k++) { if (vs[k].d_m > vs[k - 1].d_m) s++; vs[k].t_min = res.segments[s - 1]?.endMinute ?? vs[k - 1].t_min; }
  vs[0].t_min = 0;
  const slopes = vs.map((v) => v.slope_deg ?? 0);
  const tt = vs.map((v) => ttbAt(model, v, 'penalized')).filter(Number.isFinite);
  const track = { vertices: vs, length_m: d, minutes: res.totalMinutes, max_slope_deg: Math.max(...slopes), max_ttb_min: tt.length ? Math.max(...tt) : null };
  track.zone_m = zoneHits(model, track).reduce((a, h) => a + h.m, 0);
  return track;
}
// A session target: the way home follows the engine's pointers; out is the same way walked outbound
export function sessionTarget(model, p, name) {
  const pv = pointPreview(model, p);
  if (!pv.ok) throw new Error(pv.why);
  const home = pointerTrack(model, p, 'penalized');
  if (!home) throw new Error('no way home from here');
  const pts = home.vertices.map((v) => ({ lon: v.lon, lat: v.lat, elev_m: elevAt(model, v), slope_deg: slopeAt(model, v) }));
  if (pts.some((v) => v.elev_m == null)) throw new Error('no elevation along the way');
  const n = Math.max(0, ...model.stations.map((s) => s.n)) + 1;
  const station = { n, name, lon: p.lon, lat: p.lat, reason: 'Added for this session; route and walking times estimated from terrain.', sol: null, image: null, elev_m: pv.z, session: true };
  return { station, route: { station: n, ret: timed(model, pts), out: timed(model, pts.slice().reverse()) } };
}

function row(l, v) { return `<div class="dt-row"><span>${l}</span><b>${v}</b></div>`; }
function renderPreview(model) {
  const box = $('#ad-preview');
  if (!box) return null;   // the "New target" form is switched off (index.html)
  const lon = parseFloat($('#ad-lon').value), lat = parseFloat($('#ad-lat').value);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) { box.innerHTML = '<p class="cap">Enter a position or pick it on the map.</p>'; $('#ad-add').disabled = true; return null; }
  const p = { lon, lat }, pv = pointPreview(model, p);
  box.innerHTML = (pv.col != null ? row('Terrain cell', `col ${pv.col} · row ${pv.row}`) + row('Elevation', pv.z != null ? `${R(pv.z)} m` : '–') +
    row('Slope, 10 m', pv.slope != null ? `${pv.slope.toFixed(1)}°` : '–') +
    (pv.dem ? row('Terrain detail, 1 m', `${R(pv.dem.z)} m · ${pv.dem.slope != null ? `${pv.dem.slope.toFixed(1)}°` : '–'}`) : '') +
    row('Time to base', pv.reach ? `${R(pv.T)} min` : '–') : '') +
    `<p class="ad-verdict ${pv.ok ? 'ok' : 'bad'}">${pv.ok ? 'Can become a target' : esc(pv.why)}</p>`;
  $('#ad-add').disabled = !pv.ok || !$('#ad-name').value.trim();
  return p;
}
function renderLists() {
  const pts = tools ? tools.points : session.map((t) => ({ id: String(t.station.n), name: t.station.name, lon: t.station.lon, lat: t.station.lat }));
  if ($('#ad-points')) $('#ad-points').innerHTML = pts.length ? pts.map((q) => `<li><span><b>${esc(q.name)}</b><small>${(+q.lon).toFixed(5)}°E ${Math.abs(+q.lat).toFixed(5)}°S</small></span><button type="button" class="btn" data-rm-point="${esc(q.id)}">Remove</button></li>`).join('')
    : '<li class="cap">No added targets yet.</li>';
  $('#ad-layers').innerHTML = tools ? (tools.layers.length ? tools.layers.map((l) => `<li><span><b>${esc(l.name)}</b><small>${esc(l.file.split(/[\\/]/).pop())}${l.units ? ` · ${esc(l.units)}` : ''}</small></span>${l.removable ? `<button type="button" class="btn" data-rm-layer="${esc(l.id)}">Remove</button>` : '<small>Included map</small>'}</li>`).join('') : '<li class="cap">No maps available.</li>')
    : '';
}
function setMode() {
  const note = $('#ad-mode');
  note.className = `ad-mode ${tools ? 'on' : ''}`;
  note.innerHTML = tools
    ? '<b>Map import ready.</b> Imported maps are saved and aligned with the terrain.'
    : '<b>Map import unavailable.</b> To import a GeoTIFF or CSV, start the console locally with <code>npm run dev</code>.';
  $('#ad-map-form').hidden = !tools;
  $('#ad-map-off').hidden = !!tools;
}
function busy(on, msg = '') {
  $('#tools').classList.toggle('is-busy', on);
  $('#ad-status').textContent = msg;
}

// An added target can be removed: a saved one (data/points/points.json) while the local tools run,
// a session one always. The four A* targets of the routing engine cannot.
export const canRemove = (s) => !!s && (!!s.session || (!!tools && !!s.point_id));

export function initDataTools(model, mapApi, { onStationsChanged, reloadData, onToolsChanged }) {
  const panel = $('#tools');
  const open = () => { panel.hidden = false; $('#btn-add-data').setAttribute('aria-expanded', 'true'); refresh(); ($('#ad-name') || $('#ad-file'))?.focus(); };
  const close = () => { panel.hidden = true; $('#btn-add-data').setAttribute('aria-expanded', 'false'); stopPick(); mapApi.setPick(null); };
  async function refresh() {
    try {
      const r = await fetch('/__tools/status', { headers: HDR });
      tools = r.ok ? await r.json() : null;
    } catch { tools = null; }
    setMode(); renderLists();
    if (onToolsChanged) onToolsChanged();
  }
  // remove an added target by its id in points.json (tools) or its station number (session)
  async function removePoint(id) {
    if (tools) {
      busy(true, 'Removing and rebuilding the plan…');
      const out = await (await fetch(`/__tools/points?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: HDR })).json().catch(() => ({ ok: false }));
      busy(false, out.ok ? 'Removed. Loading the plan…' : `Not removed: ${out.error ?? 'could not update the plan'}`);
      if (out.ok) reloadData();
      return out;
    }
    const k = session.findIndex((t) => String(t.station.n) === String(id));
    if (k < 0) return { ok: false, error: 'not an added target' };
    const [t] = session.splice(k, 1);
    model.stations.splice(model.stations.indexOf(t.station), 1); model.routes.delete(t.station.n); mapApi.removeStation(t.station.n);
    renderLists(); onStationsChanged(null);
    return { ok: true };
  }
  function stopPick() { picking = false; $('#ad-pick')?.setAttribute('aria-pressed', 'false'); $('#map').classList.remove('is-picking'); }
  $('#btn-add-data').addEventListener('click', (e) => { e.stopPropagation(); $('#layers').hidden = true; $('#btn-layers').setAttribute('aria-expanded', 'false'); open(); });
  $('#tools-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
  if ($('#ad-add')) {   // the "New target" form, when it is switched on in index.html
    $('#ad-pick').addEventListener('click', () => {
      picking = !picking;
      $('#ad-pick').setAttribute('aria-pressed', String(picking));
      $('#map').classList.toggle('is-picking', picking);
    });
    mapApi.map.on('click', (e) => {
      if (!picking || panel.hidden) return;
      picked = { lon: e.latlng.lng, lat: e.latlng.lat };
      $('#ad-lon').value = picked.lon.toFixed(6); $('#ad-lat').value = picked.lat.toFixed(6);
      mapApi.setPick(picked); stopPick(); renderPreview(model);
    });
    for (const id of ['#ad-lon', '#ad-lat', '#ad-name']) $(id).addEventListener('input', () => { const p = renderPreview(model); mapApi.setPick(p); });
    $('#ad-add').addEventListener('click', async () => {
      const p = renderPreview(model), name = $('#ad-name').value.trim(), reason = $('#ad-reason').value.trim();
      if (!p || !name) return;
      if (tools) {
        busy(true, 'Calculating the route and walking times…');
        try {
          const r = await fetch('/__tools/points', { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, reason, lon: p.lon, lat: p.lat }) });
          const out = await r.json();
          if (!out.ok) throw new Error(out.error || out.log?.split('\n').filter(Boolean).pop() || 'could not calculate the route');
          const line = (out.log || '').split('\n').find((l) => l.includes('(added)') && l.includes(name)) || '';
          busy(false, line.includes('NO ROUTE') ? line.trim() : 'Saved. Loading the new plan…');
          if (!line.includes('NO ROUTE')) reloadData();
        } catch (err) { busy(false, `Not added: ${err.message}`); }
        return;
      }
      try {
        const t = sessionTarget(model, p, name);
        if (reason) t.station.reason = reason;
        model.stations.push(t.station); model.routes.set(t.station.n, t.route);
        session.push(t); mapApi.addStation(t.station); mapApi.setPick(null);
        busy(false, `Added as station ${t.station.n} for this session: ${R(t.route.out.minutes)} min out, ${R(t.route.ret.minutes)} min back.`);
        renderLists(); onStationsChanged(t.station.n);
      } catch (err) { busy(false, `Not added: ${err.message}`); }
    });
    $('#ad-points').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm-point]'); if (b) removePoint(b.dataset.rmPoint);
    });
  }
  const rampPrev = () => { $('#ad-ramp-prev').style.background = `linear-gradient(90deg, ${RAMP_PREVIEW[$('#ad-map-ramp').value].join(', ')})`; };
  $('#ad-map-ramp').addEventListener('change', rampPrev);
  rampPrev();
  $('#ad-file').addEventListener('change', () => { $('#ad-radius-row').hidden = !/\.csv$/i.test($('#ad-file').files[0]?.name ?? ''); });
  $('#ad-map-add').addEventListener('click', async () => {
    const f = $('#ad-file').files[0];
    if (!f) { busy(false, 'Choose a GeoTIFF or a CSV first.'); return; }
    busy(true, `Importing ${f.name} and aligning it with the terrain…`);
    try {
      const q = new URLSearchParams({ file: f.name, name: $('#ad-map-name').value.trim() || f.name.replace(/\.(tiff?|csv)$/i, ''), units: $('#ad-map-units').value.trim(), radius: $('#ad-radius').value.trim(), ramp: $('#ad-map-ramp').value });
      const r = await fetch(`/__tools/layers?${q}`, { method: 'POST', headers: { ...HDR, 'Content-Type': 'application/octet-stream' }, body: f });
      const out = await r.json();
      if (!out.ok) throw new Error(out.error || 'could not import the map');
      busy(false, 'Map imported. Loading…'); reloadData();
    } catch (err) { busy(false, `Not added: ${err.message}`); }
  });
  $('#ad-layers').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rm-layer]'); if (!b) return;
    busy(true, 'Removing the map…');
    const out = await (await fetch(`/__tools/layers?id=${encodeURIComponent(b.dataset.rmLayer)}`, { method: 'DELETE', headers: HDR })).json().catch(() => ({ ok: false }));
    busy(false, out.ok ? 'Removed. Loading…' : `Not removed: ${out.error ?? 'could not remove the map'}`);
    if (out.ok) reloadData();
  });
  renderPreview(model);
  refresh();
  // for the station list and the station details: remove an added target (station s)
  return { removeStation: (s) => (canRemove(s) ? removePoint(s.session ? s.n : s.point_id) : Promise.resolve({ ok: false, error: 'not an added target' })) };
}
