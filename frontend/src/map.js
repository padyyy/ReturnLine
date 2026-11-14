import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const MARS_RADIUS_M = 3396190;
// Leaflet's plate carrée CRS with the Mars radius. This fixes map.distance() and the scale bar
// only: latlng.distanceTo() and L.circle still use Earth's radius, so never use them.
const MarsCRS = L.extend({}, L.CRS.EPSG4326, { R: MARS_RADIUS_M });
const BASE = import.meta.env.BASE_URL;

const ll = (p) => L.latLng(p.lat, p.lon);
const trackLatLngs = (track) => track.vertices.map((v) => L.latLng(v.lat, v.lon));

export function createMap(el, data, model) {
  const map = L.map(el, { crs: MarsCRS, zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 19, attributionControl: true });
  L.control.scale({ position: 'bottomright', metric: true, imperial: false, maxWidth: 140 }).addTo(map);
  // a view first: Leaflet adds layers (and creates the SVG container) only once the map has one
  const planBounds = () => L.latLngBounds([ll(model.habitat), ...model.stations.map(ll)]).pad(0.9);
  map.fitBounds(planBounds());

  // SVG renderer with the blue-pencil hatch for protected zones
  const svg = L.svg({ padding: 0.5 }).addTo(map);
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = '<pattern id="zone-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="7" height="7" fill="rgba(237,240,230,.30)"/><path d="M0 0v7" stroke="#2459A8" stroke-width="1.7"/></pattern>';
  svg._container.prepend(defs);

  if (data.ortho) {
    L.imageOverlay(`${BASE}maps/${data.ortho.image}`, data.ortho.bounds, {
      attribution: 'Orthophoto: USGS Astrogeology, MSL Gale Merged Orthophoto Mosaic 25 cm v3',
    }).addTo(map);
    map.setMaxBounds(L.latLngBounds(data.ortho.bounds).pad(0.1));
  }

  const layers = {
    traverse: L.layerGroup().addTo(map),
    zones: L.layerGroup().addTo(map),
    area: L.layerGroup().addTo(map),
    routes: L.layerGroup().addTo(map),
    markers: L.layerGroup().addTo(map),
    crew: L.layerGroup().addTo(map),
  };

  if (data.traverse) {
    data.traverse.features.forEach((f) => {
      const pts = f.geometry.coordinates.map(([lon, lat]) => L.latLng(lat, lon));
      L.polyline(pts, { color: '#EDF0E6', weight: 3.6, opacity: 0.7, renderer: svg, interactive: false }).addTo(layers.traverse);
      L.polyline(pts, { color: '#2B2D2F', weight: 1.7, dashArray: '1.5 4.5', lineCap: 'round', renderer: svg, interactive: false }).addTo(layers.traverse);
    });
  }

  if (data.zones) {
    data.zones.features.forEach((f) => {
      const pts = f.geometry.coordinates[0].map(([lon, lat]) => L.latLng(lat, lon));
      const poly = L.polygon(pts, { color: '#2459A8', weight: 1.8, fillOpacity: 1, className: 'zone', renderer: svg }).addTo(layers.zones);
      poly.bindTooltip(`${f.properties.name} · protected`, { permanent: true, direction: 'left', className: 'map-lbl zone-lbl', offset: [-10, 0] });
    });
  }

  const habIcon = L.divIcon({ className: 'mk', html: '<span class="mk-hab"></span><span class="mk-lbl">Habitat</span>', iconSize: [16, 16], iconAnchor: [8, 8] });
  L.marker(ll(model.habitat), { icon: habIcon, keyboard: false }).addTo(layers.markers);

  const stationMarkers = new Map();
  function stationIcon(s, state) {
    return L.divIcon({
      className: 'mk',
      html: `<span class="mk-stn ${state}">${s.n}</span><span class="mk-lbl stn">${s.name}</span>`,
      iconSize: [24, 24], iconAnchor: [12, 12],
    });
  }
  model.stations.forEach((s) => {
    const m = L.marker(ll(s), { icon: stationIcon(s, ''), keyboard: false, title: s.name }).addTo(layers.markers);
    stationMarkers.set(s.n, { marker: m, s });
  });

  let crewMarker = null;
  let crewHalo = null;

  function drawTrack(track, kind) {
    const pts = trackLatLngs(track);
    const color = kind === 'abort' ? '#C8361F' : '#2B2D2F';
    const w = kind === 'abort' ? 3.8 : 3;
    L.polyline(pts, { color: '#EDF0E6', weight: w + 3.5, opacity: 0.9, renderer: svg, interactive: false }).addTo(layers.routes);
    L.polyline(pts, { color, weight: w, dashArray: kind === 'preview' ? '8 5' : null, renderer: svg, interactive: false }).addTo(layers.routes);
  }

  return {
    map,
    fitPlan() { map.fitBounds(planBounds()); },
    showRoutes(route, { ret = false, preview = false } = {}) {
      layers.routes.clearLayers();
      if (!route) return;
      drawTrack(route.out, preview ? 'preview' : 'plan');
      if (ret) drawTrack(route.ret, 'plan');
    },
    showAbort(track) { if (track) drawTrack(track, 'abort'); },
    setStation(n, state) {
      const e = stationMarkers.get(n);
      if (e) e.marker.setIcon(stationIcon(e.s, state));
    },
    setCrew(pos, { red = false, label = 'Crew' } = {}) {
      if (!pos) { layers.crew.clearLayers(); crewMarker = crewHalo = null; return; }
      const p = ll(pos);
      const color = red ? '#C8361F' : '#2B2D2F';
      if (!crewMarker) {
        crewHalo = L.circleMarker(p, { radius: 14, color, weight: 1.2, opacity: 0.55, fill: false, renderer: svg, interactive: false }).addTo(layers.crew);
        crewMarker = L.circleMarker(p, { radius: 7.5, color: '#EDF0E6', weight: 2.2, fillColor: color, fillOpacity: 1, renderer: svg }).addTo(layers.crew);
        crewMarker.bindTooltip(label, { permanent: true, direction: 'right', className: 'map-lbl', offset: [12, -8] });
      }
      crewMarker.setLatLng(p).setStyle({ fillColor: color });
      crewHalo.setLatLng(p).setStyle({ color });
      crewMarker.setTooltipContent(label);
    },
    setLayer(name, on) {
      const g = layers[name];
      if (!g) return;
      if (on && !map.hasLayer(g)) g.addTo(map);
      if (!on && map.hasLayer(g)) map.removeLayer(g);
    },
  };
}
