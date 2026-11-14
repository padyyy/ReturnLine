import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { BOXWORK_PATH, PATH_SOURCE } from './boxwork-path.js';

const MARS_RADIUS_M = 3396190;
const WALK_SPEED_MPS = 1500 / 3600; // 1.5 km/h on level ground (labeled assumption)
const TIME_COMPRESSION = 60;
const OVERLAY_META = `${import.meta.env.BASE_URL}maps/ortho_gale_1m.json`;

// Leaflet's plate carrée CRS with the Mars radius. This fixes map.distance() and the
// scale bar only: latlng.distanceTo() and L.circle still use Earth's radius, so never use them.
const MarsCRS = L.extend({}, L.CRS.EPSG4326, { R: MARS_RADIUS_M });

const map = L.map('map', { crs: MarsCRS, zoomSnap: 0.25, zoomDelta: 0.5, maxZoom: 18 });
L.control.scale({ metric: true, imperial: false, maxWidth: 160 }).addTo(map);

const statusEl = document.getElementById('status');
const playBtn = document.getElementById('play');

// ---- orthophoto overlay (made by pipeline/ortho_overlay.py) ----
async function loadOverlay() {
  try {
    const res = await fetch(OVERLAY_META);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();
    L.imageOverlay(`${import.meta.env.BASE_URL}maps/${meta.image}`, meta.bounds, {
      attribution: 'Orthophoto: USGS Astrogeology, MSL Gale Merged Orthophoto Mosaic 25 cm v3',
    }).addTo(map);
    map.setMaxBounds(L.latLngBounds(meta.bounds).pad(0.15));
    return true;
  } catch (err) {
    const box = L.control({ position: 'topleft' });
    box.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-message');
      div.textContent = 'Orthophoto not found. Run pipeline/ortho_overlay.py (see pipeline/README.md).';
      return div;
    };
    box.addTo(map);
    console.warn('Orthophoto overlay missing:', err);
    return false;
  }
}

// ---- demo path and moving dot ----
const latlngs = BOXWORK_PATH.map(([lat, lon]) => L.latLng(lat, lon));
const cumulative = [0];
for (let i = 1; i < latlngs.length; i++) {
  cumulative.push(cumulative[i - 1] + map.distance(latlngs[i - 1], latlngs[i]));
}
const totalM = cumulative[cumulative.length - 1];

L.polyline(latlngs, { color: '#EDF0E6', weight: 6, opacity: 0.7 }).addTo(map);
L.polyline(latlngs, { color: '#2B2D2F', weight: 2.5 }).addTo(map);
const dot = L.circleMarker(latlngs[0], {
  radius: 8, color: '#EDF0E6', weight: 2.5, fillColor: '#C8361F', fillOpacity: 1,
}).addTo(map);
map.fitBounds(L.latLngBounds(latlngs).pad(0.8));

function pointAt(distM) {
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < distM) i++;
  const seg = cumulative[i] - cumulative[i - 1] || 1;
  const f = Math.min(1, Math.max(0, (distM - cumulative[i - 1]) / seg));
  const a = latlngs[i - 1], b = latlngs[i];
  return L.latLng(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f);
}

let walkedM = 0;
let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = null;

function render() {
  dot.setLatLng(pointAt(walkedM));
  const simMin = walkedM / WALK_SPEED_MPS / 60;
  statusEl.textContent = `${PATH_SOURCE} · ${(walkedM / 1000).toFixed(2)} of ${(totalM / 1000).toFixed(2)} km · ` +
    `${Math.floor(simMin / 60)}:${String(Math.floor(simMin % 60)).padStart(2, '0')} walking at 1.5 km/h · ×${TIME_COMPRESSION}`;
  playBtn.textContent = playing ? 'Pause' : 'Play';
}

function tick(now) {
  if (last !== null && playing) {
    const dt = Math.min(0.1, (now - last) / 1000);
    walkedM += dt * WALK_SPEED_MPS * TIME_COMPRESSION;
    if (walkedM > totalM) walkedM = 0;
    render();
  }
  last = now;
  requestAnimationFrame(tick);
}

playBtn.addEventListener('click', () => { playing = !playing; render(); });

loadOverlay().then(() => { render(); requestAnimationFrame(tick); });
