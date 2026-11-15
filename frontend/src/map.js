import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { gridBounds, habitatBox, M_PER_DEG } from './model.js';
import { corridorCanvas } from './corridor.js';
import { contour } from './contour.js';

const MARS_RADIUS_M = 3396190;
// Leaflet's plate carrée CRS with the Mars radius. This fixes map.distance() and the scale bar
// only: latlng.distanceTo() and L.circle still use Earth's radius, so never use them.
const MarsCRS = L.extend({}, L.CRS.EPSG4326, { R: MARS_RADIUS_M });
const BASE = import.meta.env.BASE_URL;

const ll = (p) => L.latLng(p.lat, p.lon);

// Map credits behind a small © button next to the scale bar: hover or keyboard focus shows them,
// a click pins them open (touch). Replaces Leaflet's always-visible attribution line.
function creditsControl(data) {
  const Credits = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const box = L.DomUtil.create('div', 'credits');
      const lines = [
        data.ortho ? 'Orthophoto: USGS Astrogeology, MSL Gale Merged Orthophoto Mosaic 25 cm v3' : null,
        data.grid ? 'Elevation and slope: USGS Astrogeology, MSL Gale Merged DEM 1 m v3' : null,
        data.traverse ? 'Curiosity traverse: NASA/JPL-Caltech, MMGIS waypoints' : null,
        'Map: <a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>',
      ].filter(Boolean);
      box.innerHTML = '<button type="button" class="credits-btn" aria-expanded="false" aria-controls="map-credits" aria-label="Map credits">©</button>' +
        `<div class="credits-text" id="map-credits" role="note">${lines.join('<br>')}</div>`;
      const btn = box.querySelector('button');
      const setOpen = (open) => { box.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); };
      btn.addEventListener('click', () => setOpen(!box.classList.contains('is-open')));
      document.addEventListener('click', (e) => { if (!box.contains(e.target)) setOpen(false); });
      box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      return box;
    },
  });
  return new Credits();
}
const trackLatLngs = (track) => track.vertices.map((v) => L.latLng(v.lat, v.lon));

export function createMap(el, data, model, { onStation } = {}) {
  const map = L.map(el, { crs: MarsCRS, zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 19, attributionControl: false });
  L.control.scale({ position: 'bottomright', metric: true, imperial: false, maxWidth: 140 }).addTo(map);
  creditsControl(data).addTo(map);
  // panes: orthophoto, return area, vectors (overlayPane 400), crew dot above the routes
  map.createPane('base').style.zIndex = 250;
  map.createPane('slope').style.zIndex = 300;
  map.getPane('slope').style.pointerEvents = 'none';
  map.createPane('area').style.zIndex = 350;
  map.createPane('grid').style.zIndex = 360;
  map.getPane('grid').style.pointerEvents = 'none';
  map.createPane('crew').style.zIndex = 450;
  map.getPane('area').style.pointerEvents = 'none';

  // a view first: Leaflet adds layers (and creates the SVG container) only once the map has one
  const planBounds = () => L.latLngBounds([ll(model.habitat), ...model.stations.map(ll)]).pad(0.06);
  map.fitBounds(planBounds());
  // the view never leaves the map: no zooming out past its edge and no panning beyond it. The edge is the
  // orthophoto, which covers exactly the console grid; the smallest zoom keeps the whole view inside it.
  const edge = data.ortho ? L.latLngBounds(data.ortho.bounds) : model.grid ? L.latLngBounds(gridBounds(model.grid)) : null;
  if (edge) {
    map.options.maxBoundsViscosity = 1;
    map.setMaxBounds(edge);
    const fitMin = () => {
      const z = Math.ceil(map.getBoundsZoom(edge, true) / map.options.zoomSnap) * map.options.zoomSnap;
      map.setMinZoom(z);
      if (map.getZoom() < z) map.setZoom(z);
    };
    fitMin();
    map.on('resize', fitMin);
  }

  // SVG renderer with the blue-pencil hatch for protected zones
  const svg = L.svg({ padding: 0.5 }).addTo(map);
  const svgCrew = L.svg({ padding: 0.5, pane: 'crew' }).addTo(map);
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = '<pattern id="zone-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="7" height="7" fill="rgba(237,240,230,.30)"/><path d="M0 0v7" stroke="#2459A8" stroke-width="1.7"/></pattern>';
  svg._container.prepend(defs);

  if (data.ortho) {
    L.imageOverlay(`${BASE}maps/${data.ortho.image}`, data.ortho.bounds, { pane: 'base', className: 'ortho' }).addTo(map);
  }

  const layers = {
    area: L.layerGroup().addTo(map),
    traverse: L.layerGroup().addTo(map),
    zones: L.layerGroup().addTo(map),
    routes: L.layerGroup().addTo(map),
    markers: L.layerGroup().addTo(map),
    crew: L.layerGroup().addTo(map),
    slope: L.layerGroup(), // off by default; switched on in the Layers menu
    names: L.layerGroup(),  // place names (backend/config/place_names.json); switched in the Layers menu
  };
  // map layers on the console grid (pipeline/map_layers.py, GeoMapper); display only. Order, opacity and
  // which are on are set in the Layers menu (layerstate.js, main.js: setLayerStyle and setLayer).
  const overlays = {};
  for (const ly of data.layers || []) {
    const m = ly.meta;
    const g = L.layerGroup();
    overlays[ly.id] = L.imageOverlay(`${BASE}${m.image_path}`, m.bounds, { pane: 'slope', opacity: m.layer?.opacity ?? 0.6, className: 'slope-img', interactive: false, zIndex: m.layer?.priority ?? 10 }).addTo(g);
    layers[`layer:${ly.id}`] = g;
  }

  if (data.traverse) {
    data.traverse.features.forEach((f) => {
      const pts = f.geometry.coordinates.map(([lon, lat]) => L.latLng(lat, lon));
      L.polyline(pts, { color: '#EDF0E6', weight: 3.6, opacity: 0.7, renderer: svg, interactive: false }).addTo(layers.traverse);
      L.polyline(pts, { color: '#2B2D2F', weight: 1.7, dashArray: '1.5 4.5', lineCap: 'round', renderer: svg, interactive: false }).addTo(layers.traverse);
    });
  }

  // labels go to the side away from the middle of the station group, so neighbours do not collide
  const midLon = model.stations.reduce((a, s) => a + s.lon, 0) / Math.max(1, model.stations.length);
  model.zones.forEach((z) => {
    const pts = z.ring.map(([lon, lat]) => L.latLng(lat, lon));
    const poly = L.polygon(pts, { color: '#2459A8', weight: 1.8, fillOpacity: 1, className: 'zone', renderer: svg }).addTo(layers.zones);
    const cLon = z.ring.reduce((a, p) => a + p[0], 0) / z.ring.length;
    const left = cLon < midLon;
    poly.bindTooltip(`${z.name} · protected`, { permanent: true, direction: left ? 'left' : 'right', className: 'map-lbl zone-lbl', offset: [left ? -10 : 10, 0] });
  });

  // the habitat: a fixed 10 x 10 m footprint (its grid cell), drawn to scale, with its name beside it
  const hb = habitatBox(model);
  L.rectangle([[hb.s, hb.w], [hb.n, hb.e]], { color: '#EDF0E6', weight: 1.6, fillColor: '#2B2D2F', fillOpacity: 1, renderer: svg, interactive: false, className: 'hab-box' }).addTo(layers.markers);
  L.tooltip({ permanent: true, direction: 'right', className: 'map-lbl hab-lbl', offset: [6, 0], interactive: false }).setLatLng([(hb.s + hb.n) / 2, hb.e]).setContent('Habitat').addTo(layers.markers);

  // place names: a small ring at the rover-visit position, the name beside it in graphite italics
  for (const q of model.names) {
    const left = q.label === 'left';
    L.marker(ll(q), { interactive: false, keyboard: false, icon: L.divIcon({ className: 'mk', iconSize: [10, 10], iconAnchor: [5, 5],
      html: `<span class="mk-name"></span><span class="mk-lbl name${left ? ' left' : ''}">${q.name.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)}</span>` }) }).addTo(layers.names);
  }
  layers.names.addTo(map);

  const stationMarkers = new Map();
  function stationIcon(s, state) {
    const side = s.lon < midLon ? ' left' : '';
    return L.divIcon({
      className: 'mk',
      html: `<span class="mk-stn${state ? ` is-${state}` : ''}">${s.n}</span><span class="mk-lbl stn${side}">${s.name}</span>`,
      iconSize: [24, 24], iconAnchor: [12, 12],
    });
  }
  function addStationMarker(s) {
    const m = L.marker(ll(s), { icon: stationIcon(s, ''), keyboard: true, title: `Pick ${s.name}` }).addTo(layers.markers);
    if (onStation) m.on('click keypress', () => onStation(s.n)); // pick the target on the map, as in the planning list
    stationMarkers.set(s.n, { marker: m, s, state: '' });
  }
  model.stations.forEach(addStationMarker);
  // the point a new target is being picked at (Add data panel)
  let pickMarker = null;

  // ---------- return stages along the route (rule B), fading away from it (corridor.js) ----------
  const g = model.grid;
  let areaImg = null, areaKey = '';
  const toLatLng = ([r, c]) => {
    const h = g.header;
    return L.latLng((h.origin_m.y - (r + 0.5) * h.cell_m) / M_PER_DEG, (h.origin_m.x + (c + 0.5) * h.cell_m) / M_PER_DEG);
  };
  const lineLayer = (lines, style) => L.polyline(lines.map((ln) => ln.map(toLatLng)), { renderer: svg, interactive: false, ...style });
  const eastmost = (lines) => { let best = null; for (const ln of lines) if (ln.length > 20) for (const q of ln) if (!best || q[1] > best[1]) best = q; return best; };
  let sixtyLbl = null;
  if (g) { // the fixed 60-minute line (normal walking speed, zones avoided)
    const sixty = contour(g.ttbPenalized, g.header.nx, g.header.ny, 60, 1, { reachableOnly: true });
    L.layerGroup([
      lineLayer(sixty, { color: '#EDF0E6', weight: 5, opacity: 0.85 }),
      lineLayer(sixty, { color: '#2B2D2F', weight: 2, dashArray: '7 5' }),
    ]).addTo(layers.area);
    const e = eastmost(sixty);
    if (e) sixtyLbl = L.tooltip({ permanent: true, direction: 'right', className: 'map-lbl', offset: [8, 0], interactive: false }).setLatLng(toLatLng(e)).setContent('60-minute line').addTo(layers.area);
  }
  // tracks: the ways shown (out, back, ABORT, reroute); no tracks, no stages
  function setArea({ L: lim, f = 1, which = 'penalized', tracks = [] }) {
    if (!g) return;
    const o = { L: lim, f, which, caution: model.sc.caution_margin_min ?? 15 };
    const cv = corridorCanvas(model, tracks, o);
    const key = cv ? canvasKey(tracks, o) : '';
    if (key === areaKey) return;
    areaKey = key;
    if (!cv) { if (areaImg) { layers.area.removeLayer(areaImg); areaImg = null; } return; }
    const url = cv.toDataURL();
    if (areaImg) areaImg.setUrl(url);
    else areaImg = L.imageOverlay(url, gridBounds(g), { pane: 'area', interactive: false, className: 'area-img' }).addTo(layers.area);
  }
  const canvasKey = (tracks, o) => `${tracks.filter(Boolean).map((t) => `${t.vertices.length}:${t.minutes.toFixed(2)}:${t.vertices[0].lat.toFixed(6)}`).join('|')}|${o.L.toFixed(1)}|${o.f}|${o.which}`;

  // ---------- 100 m survey grid (switch in the header) ----------
  // Lines at whole 100 m of the projected Mars grid (eqc, as the DEM), so they fall on the edges of
  // every tenth 10 m engine cell; heavier every 500 m. Redrawn for the visible part on every move.
  const svgGrid = L.svg({ padding: 0.2, pane: 'grid' }).addTo(map);
  const gridLayer = L.layerGroup();
  function drawGrid() {
    gridLayer.clearLayers();
    const b = map.getBounds().pad(0.2);
    const step = 100 / M_PER_DEG;
    const k0x = Math.ceil(b.getWest() / step), k1x = Math.floor(b.getEast() / step);
    const k0y = Math.ceil(b.getSouth() / step), k1y = Math.floor(b.getNorth() / step);
    if ((k1x - k0x) + (k1y - k0y) > 400) return; // zoomed far out: the grid would only be noise
    const line = (pts, k) => L.polyline(pts, { renderer: svgGrid, interactive: false, color: '#2B2D2F', weight: 1, opacity: k % 5 ? 0.22 : 0.42 }).addTo(gridLayer);
    for (let k = k0x; k <= k1x; k++) line([[b.getSouth(), k * step], [b.getNorth(), k * step]], k);
    for (let k = k0y; k <= k1y; k++) line([[k * step, b.getWest()], [k * step, b.getEast()]], k);
  }
  function setGrid(on) {
    if (on) { drawGrid(); gridLayer.addTo(map); map.on('moveend zoomend', drawGrid); }
    else { map.off('moveend zoomend', drawGrid); map.removeLayer(gridLayer); }
  }

  // ---------- routes and crew ----------
  let crewMarker = null;
  let crewHalo = null;
  let routeKey = '';

  const pill = (latlng, text, tone = 'ink', dir = 'right') => L.tooltip({ permanent: true, direction: dir, className: `map-pill ${tone}`, offset: [dir === 'left' ? -12 : 12, 0], interactive: false }).setLatLng(latlng).setContent(text).addTo(layers.routes);
  function drawTrack(track, kind) {
    const pts = trackLatLngs(track);
    if (kind === 'cand-prot' || kind === 'cand-abort') { // the two ways home weighed after the injury
      L.polyline(pts, { color: '#EDF0E6', weight: 6.5, opacity: 0.9, renderer: svg, interactive: false }).addTo(layers.routes);
      L.polyline(pts, { color: kind === 'cand-abort' ? '#C8361F' : '#2B2D2F', weight: kind === 'cand-abort' ? 3.6 : 2.6, dashArray: kind === 'cand-abort' ? '10 5' : '8 5', renderer: svg, interactive: false }).addTo(layers.routes);
      return;
    }
    if (kind === 'dim') { // the plan once the injury changed everything
      L.polyline(pts, { color: '#EDF0E6', weight: 6.5, opacity: 0.38, renderer: svg, interactive: false }).addTo(layers.routes);
      L.polyline(pts, { color: '#2B2D2F', weight: 3, opacity: 0.42, renderer: svg, interactive: false }).addTo(layers.routes);
      return;
    }
    const color = kind === 'abort' ? '#C8361F' : '#2B2D2F';
    if (kind === 'drift') { // the crew off its route: red pencil, dashed
      L.polyline(pts, { color: '#EDF0E6', weight: 6, opacity: 0.85, renderer: svg, interactive: false }).addTo(layers.routes);
      L.polyline(pts, { color: '#C8361F', weight: 2.6, dashArray: '5 4', renderer: svg, interactive: false }).addTo(layers.routes);
      return;
    }
    if (kind === 'faded') { // the planned way home after a reroute replaced it
      L.polyline(pts, { color: '#2B2D2F', weight: 2, opacity: 0.45, dashArray: '3 5', renderer: svg, interactive: false }).addTo(layers.routes);
      return;
    }
    const w = kind === 'abort' ? 3.8 : kind === 'preview' ? 4.5 : 3;
    L.polyline(pts, { color: '#EDF0E6', weight: w + 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', renderer: svg, interactive: false }).addTo(layers.routes);
    L.polyline(pts, { color, weight: w, lineCap: 'round', lineJoin: 'round', renderer: svg, interactive: false }).addTo(layers.routes);
  }

  // room for the map key button and the scale, so the plan is fitted into the free part of the map
  const overlayPad = () => ({ tl: [48, 64], br: [48, 48] });

  return {
    map,
    fitPlan() { const p = overlayPad(); map.fitBounds(planBounds(), { paddingTopLeft: p.tl, paddingBottomRight: p.br, maxZoom: 18 }); },
    setArea,
    setGrid,
    invalidate() { map.invalidateSize({ pan: false }); },
    showRoutes(route, { ret = false, preview = false, faded = false, abort = null, drift = null, reroute = null, rerouteLabel = null, ring = null, rings = [], candidates = [], callouts = [], label = null, alt = null, altLabel = null } = {}) {
      const all = ring ? [ring, ...rings] : rings;
      const key = route ? [route.station, route.out.minutes.toFixed(3), ret, preview, faded, abort?.minutes.toFixed(3), drift?.vertices.length, reroute?.minutes.toFixed(3), rerouteLabel, all.map((q) => q.lat.toFixed(6)).join(','), candidates.map((c) => c.label).join(','), callouts.map((c) => c.text).join(','), label, altLabel].join('|') : '';
      if (key === routeKey) return;
      routeKey = key;
      layers.routes.clearLayers();
      if (!route) return;
      if (alt) { drawTrack(alt, 'faded'); if (altLabel) { const v = alt.vertices; pill(ll(v[Math.round(v.length * 0.35)]), altLabel, 'ink', 'left'); } }
      drawTrack(route.out, preview ? 'preview' : faded ? 'dim' : 'plan');
      if (label) { const v = route.out.vertices; pill(ll(v[Math.round(v.length * 0.55)]), label, 'ink'); }
      if (ret) drawTrack(route.ret, faded ? 'dim' : reroute ? 'faded' : 'plan');
      if (drift) drawTrack(drift, 'drift');
      if (reroute) {
        drawTrack(reroute, 'plan');
        if (rerouteLabel) pill(ll(reroute.vertices[Math.round(reroute.vertices.length * 0.55)]), rerouteLabel, 'ink');
      }
      for (const c of candidates) { drawTrack(c.track, c.kind); const v = c.track.vertices; pill(ll(v[Math.round((v.length - 1) * (c.at ?? 0.5))]), c.label, c.tone, c.tone === 'red' ? 'right' : 'left'); }
      // finding rings (DESIGN.md signature): red pencil around the place of a finding, pixel-sized
      all.forEach((q, i) => L.circleMarker(ll(q), { radius: 17, color: '#C8361F', weight: 2.4, opacity: i < all.length - 1 ? 0.45 : 1, fill: false, renderer: svg, interactive: false }).addTo(layers.routes));
      if (abort) drawTrack(abort, 'abort');
      for (const c of callouts) pill(ll(c.pos), c.text, c.tone, 'left');
    },
    addStation(s) { if (!stationMarkers.has(s.n)) addStationMarker(s); },
    removeStation(n) { const e = stationMarkers.get(n); if (e) { layers.markers.removeLayer(e.marker); stationMarkers.delete(n); } },
    setPick(p) {
      if (pickMarker) { layers.markers.removeLayer(pickMarker); pickMarker = null; }
      if (p) pickMarker = L.circleMarker(ll(p), { radius: 9, color: '#E8622C', weight: 3, fillColor: '#FCF9F5', fillOpacity: 1, renderer: svgCrew, interactive: false })
        .bindTooltip('New target', { permanent: true, direction: 'right', className: 'map-pill ink', offset: [12, 0] }).addTo(layers.markers);
    },
    setStation(n, state) {
      const e = stationMarkers.get(n);
      if (e && e.state !== state) { e.state = state; e.marker.setIcon(stationIcon(e.s, state)); }
    },
    setCrew(pos, { red = false, label = 'Crew' } = {}) {
      if (!pos) { layers.crew.clearLayers(); crewMarker = crewHalo = null; return; }
      const p = ll(pos);
      const color = red ? '#C8361F' : '#2B2D2F';
      if (!crewMarker) {
        crewHalo = L.circleMarker(p, { radius: 14, color, weight: 1.2, opacity: 0.55, fill: false, renderer: svgCrew, interactive: false }).addTo(layers.crew);
        crewMarker = L.circleMarker(p, { radius: 7.5, color: '#EDF0E6', weight: 2.2, fillColor: color, fillOpacity: 1, renderer: svgCrew }).addTo(layers.crew);
        crewMarker.bindTooltip(label, { permanent: true, direction: 'right', className: 'map-pill ink', offset: [16, -10] });
      }
      crewMarker.getTooltip()?.getElement()?.classList.toggle('red', red);
      crewMarker.setLatLng(p).setStyle({ fillColor: color });
      crewHalo.setLatLng(p).setStyle({ color });
      crewMarker.setTooltipContent(label);
    },
    // a map layer's place in the stack (higher zIndex lies on top) and its opacity
    setLayerStyle(id, { zIndex, opacity }) {
      const ov = overlays[id];
      if (!ov) return;
      if (zIndex != null) ov.setZIndex(zIndex);
      if (opacity != null) ov.setOpacity(opacity);
    },
    setLayer(name, on) {
      const lg = layers[name];
      if (!lg) return;
      if (on && !map.hasLayer(lg)) lg.addTo(map);
      if (!on && map.hasLayer(lg)) map.removeLayer(lg);
    },
  };
}
