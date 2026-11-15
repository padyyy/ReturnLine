import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { gridBounds, M_PER_DEG } from './model.js';
import { contour } from './contour.js';
import { icon, R, esc } from './format.js';

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

export function createMap(el, data, model) {
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

  // SVG renderer with the blue-pencil hatch for protected zones
  const svg = L.svg({ padding: 0.5 }).addTo(map);
  const svgCrew = L.svg({ padding: 0.5, pane: 'crew' }).addTo(map);
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = '<pattern id="zone-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="7" height="7" fill="rgba(237,240,230,.30)"/><path d="M0 0v7" stroke="#2459A8" stroke-width="1.7"/></pattern>';
  svg._container.prepend(defs);

  if (data.ortho) {
    L.imageOverlay(`${BASE}maps/${data.ortho.image}`, data.ortho.bounds, { pane: 'base', className: 'ortho' }).addTo(map);
    map.setMaxBounds(L.latLngBounds(data.ortho.bounds).pad(0.1));
  }

  const layers = {
    area: L.layerGroup().addTo(map),
    traverse: L.layerGroup().addTo(map),
    zones: L.layerGroup().addTo(map),
    routes: L.layerGroup().addTo(map),
    markers: L.layerGroup().addTo(map),
    crew: L.layerGroup().addTo(map),
    slope: L.layerGroup(), // off by default; switched on in the Layers menu
  };
  // slope display layer from the pipeline (one pixel per grid cell, its own bounds); display only
  if (data.slopeLayer) {
    const s = data.slopeLayer;
    L.imageOverlay(`${BASE}${s.image_path}`, s.bounds, { pane: 'slope', opacity: s.layer?.opacity ?? 0.6, className: 'slope-img', interactive: false })
      .addTo(layers.slope);
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
    poly.bindTooltip(/protect/i.test(z.name) ? z.name : `${z.name} · protected`, { permanent: true, direction: left ? 'left' : 'right', className: 'map-lbl zone-lbl', offset: [left ? -10 : 10, 0] });
  });

  const habIcon = L.divIcon({ className: 'mk', html: '<span class="mk-hab"></span><span class="mk-lbl">Habitat</span>', iconSize: [16, 16], iconAnchor: [8, 8] });
  L.marker(ll(model.habitat), { icon: habIcon, keyboard: false }).addTo(layers.markers);

  const stationMarkers = new Map();
  function stationIcon(s, state) {
    const side = s.lon < midLon ? ' left' : '';
    return L.divIcon({
      className: 'mk',
      html: `<span class="mk-stn ${state}">${s.n}</span><span class="mk-lbl stn${side}">${s.name}</span>`,
      iconSize: [24, 24], iconAnchor: [12, 12],
    });
  }
  model.stations.forEach((s) => {
    const m = L.marker(ll(s), { icon: stationIcon(s, ''), keyboard: false, title: s.name }).addTo(layers.markers);
    stationMarkers.set(s.n, { marker: m, s, state: '' });
  });

  // Curiosity's real drill holes (information only; not protected zones of the rehearsal). They lie within
  // about 10 m of each other, so one label names the group and each hole has its own hover tooltip.
  const holeIcon = L.divIcon({ className: 'mk', html: '<span class="mk-drill"></span>', iconSize: [11, 11], iconAnchor: [5.5, 5.5] });
  model.drillHoles.forEach((h, i) => {
    const m = L.marker(ll(h), { icon: holeIcon, keyboard: false, title: `${h.name}: Curiosity drill hole, ${h.drilled} (${h.setting})` }).addTo(layers.markers);
    if (i === 0) m.bindTooltip(model.drillHoles.length > 1 ? 'Curiosity drill holes' : `${h.name} drill hole`, { permanent: true, direction: 'top', className: 'map-lbl drill-lbl', offset: [0, -8] });
  });

  // ---------- return area from the time-to-base grid (rule B) ----------
  const g = model.grid;
  let areaImg = null, areaKey = '', areaLines = null;
  const canvas = g ? Object.assign(document.createElement('canvas'), { width: g.header.nx, height: g.header.ny }) : null;
  const toLatLng = ([r, c]) => {
    const h = g.header;
    return L.latLng((h.origin_m.y - (r + 0.5) * h.cell_m) / M_PER_DEG, (h.origin_m.x + (c + 0.5) * h.cell_m) / M_PER_DEG);
  };
  const lineLayer = (lines, style) => L.polyline(lines.map((ln) => ln.map(toLatLng)), { renderer: svg, interactive: false, ...style });
  if (g) { // the fixed 60-minute line (normal walking speed, zones avoided)
    const sixty = contour(g.ttbPenalized, g.header.nx, g.header.ny, 60);
    L.layerGroup([
      lineLayer(sixty, { color: '#EDF0E6', weight: 5, opacity: 0.85 }),
      lineLayer(sixty, { color: '#2B2D2F', weight: 2, dashArray: '7 5' }),
    ]).addTo(layers.area);
  }
  function setArea({ L: lim, f = 1, which = 'penalized' }) {
    if (!g) return;
    const key = `${lim.toFixed(1)}|${f}|${which}`;
    if (key === areaKey) return;
    areaKey = key;
    const { nx, ny } = g.header;
    const T = which === 'allowed' ? g.ttbAllowed : g.ttbPenalized;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(nx, ny);
    for (let i = 0; i < nx * ny; i++) {
      const v = T[i] * f, o = i * 4;
      if (v <= lim) { img.data[o] = 31; img.data[o + 1] = 107; img.data[o + 2] = 69; img.data[o + 3] = 46; }   // green: home in time
      else if (T[i] <= 60) { img.data[o] = 237; img.data[o + 1] = 240; img.data[o + 2] = 230; img.data[o + 3] = 105; } // pale: lost to life support or injury
    }
    ctx.putImageData(img, 0, 0);
    const url = canvas.toDataURL();
    if (areaImg) areaImg.setUrl(url);
    else areaImg = L.imageOverlay(url, gridBounds(g), { pane: 'area', interactive: false, className: 'area-img' }).addTo(layers.area);
    if (areaLines) layers.area.removeLayer(areaLines);
    const edge = contour(T, nx, ny, lim, f);
    const halo = lineLayer(edge, { color: '#EDF0E6', weight: 5.5, opacity: 0.85 });
    const line = lineLayer(edge, { color: '#1F6B45', weight: 2.6 });
    areaLines = L.layerGroup([halo, line]).addTo(layers.area);
    if (map.hasLayer(line)) { line.bringToBack(); halo.bringToBack(); } // under routes, zones and the 60-minute line
  }

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

  function drawTrack(track, kind) {
    const pts = trackLatLngs(track);
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
    const w = kind === 'abort' ? 3.8 : 3;
    L.polyline(pts, { color: '#EDF0E6', weight: w + 3.5, opacity: 0.9, renderer: svg, interactive: false }).addTo(layers.routes);
    L.polyline(pts, { color, weight: w, dashArray: kind === 'preview' ? '8 5' : null, renderer: svg, interactive: false }).addTo(layers.routes);
  }

  // Beat 5: the two ways home after the injury, dashed because neither is chosen yet (design sketch).
  // Red pencil for the way through the zone, graphite for the protected one; the label carries the
  // injured minutes and the fit as a word and a mark, so colour is never the only signal.
  function drawOptions(options) {
    const ways = [options.protectedWay, options.throughWay].filter((w) => w && (w.which === 'penalized' || w.zones.length));
    const along = (track, f) => track.vertices.find((q) => q.d_m >= track.length_m * f) || track.vertices[track.vertices.length - 1];
    const marks = ways.map((w) => ({ w, at: along(w.track, w.which === 'penalized' ? 0.62 : 0.78) }));
    const east = marks.length > 1 ? Math.max(...marks.map((m) => m.at.lon)) : null;
    for (const { w, at } of marks) {
      const zone = w.which === 'allowed';
      const pts = trackLatLngs(w.track);
      L.polyline(pts, { color: '#EDF0E6', weight: zone ? 7 : 6, opacity: 0.9, renderer: svg, interactive: false }).addTo(layers.routes);
      L.polyline(pts, { color: zone ? '#C8361F' : '#2B2D2F', weight: zone ? 3.6 : 2.6, dashArray: zone ? '10 5' : '8 5', renderer: svg, interactive: false }).addTo(layers.routes);
      const name = zone ? `Through ${esc(w.zones[0].name)}` : 'Protected route';
      const right = east == null || at.lon === east;
      L.tooltip({ permanent: true, direction: right ? 'right' : 'left', className: `map-lbl opt${zone ? ' opt-zone' : ''}`, offset: [right ? 12 : -12, 0] })
        .setLatLng(ll(at))
        .setContent(`${icon(w.ok ? 'check' : 'cross')}${name} · ${R(w.min)} min · ${w.ok ? 'fits' : 'too long'}`)
        .addTo(layers.routes);
    }
  }

  // room the floating panels take, so the plan is fitted into the free part of the map
  function overlayPad() {
    const wrap = el.parentElement;
    const floating = (n) => n && n.offsetParent !== null && getComputedStyle(n).position === 'absolute';
    const crew = wrap.querySelector('.crew'), lg = wrap.querySelector('.legend');
    return { tl: [floating(crew) ? crew.offsetWidth + 40 : 32, 40], br: [floating(lg) ? lg.offsetWidth + 40 : 32, 40] };
  }

  return {
    map,
    fitPlan() { const p = overlayPad(); map.fitBounds(planBounds(), { paddingTopLeft: p.tl, paddingBottomRight: p.br, maxZoom: 18 }); },
    setArea,
    setGrid,
    showRoutes(route, { ret = false, preview = false, abort = null, drift = null, reroute = null, rerouteLabel = null, ring = null, options = null } = {}) {
      const opt = options ? [options.protectedWay?.min, options.throughWay?.min].map((m) => m?.toFixed(2)).join('/') : '';
      const key = route ? [route.station, ret, preview, abort?.minutes.toFixed(3), drift?.vertices.length, reroute?.minutes.toFixed(3), rerouteLabel, ring?.lat, opt].join('|') : '';
      if (key === routeKey) return;
      routeKey = key;
      layers.routes.clearLayers();
      if (!route) return;
      // while habitat control decides between the two ways home (beat 5), the walked history steps
      // back so the protected way does not hide under the reroute it shares
      const deciding = !!options;
      drawTrack(route.out, preview ? 'preview' : deciding ? 'faded' : 'plan');
      if (ret) drawTrack(route.ret, reroute || deciding ? 'faded' : 'plan');
      if (drift) drawTrack(drift, deciding ? 'faded' : 'drift');
      if (reroute) {
        drawTrack(reroute, deciding ? 'faded' : 'plan');
        if (rerouteLabel && !deciding) L.tooltip({ permanent: true, direction: 'right', className: 'map-lbl', offset: [14, 10] }).setLatLng(ll(reroute.vertices[0])).setContent(rerouteLabel).addTo(layers.routes);
      }
      // finding ring (DESIGN.md signature): red pencil around the place of the warning, pixel-sized
      if (ring) L.circleMarker(ll(ring), { radius: 17, color: '#C8361F', weight: 2.4, fill: false, renderer: svg, interactive: false }).addTo(layers.routes);
      if (options) drawOptions(options);
      if (abort) drawTrack(abort, 'abort');
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
        crewMarker.bindTooltip(label, { permanent: true, direction: 'top', className: 'map-lbl', offset: [0, -14] });
      }
      crewMarker.setLatLng(p).setStyle({ fillColor: color });
      crewHalo.setLatLng(p).setStyle({ color });
      crewMarker.setTooltipContent(label);
    },
    setLayer(name, on) {
      const lg = layers[name];
      if (!lg) return;
      if (on && !map.hasLayer(lg)) lg.addTo(map);
      if (!on && map.hasLayer(lg)) map.removeLayer(lg);
    },
  };
}
