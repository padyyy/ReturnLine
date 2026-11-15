// Pure computations on the loaded data. No route search: everything is a lookup or an
// interpolation along precomputed tracks (shared/data-contract.md).

export function buildModel(d) {
  const sc = d.scenario;
  const stations = d.stations.features.map((f) => ({
    ...f.properties,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
  const routes = new Map(d.routes.stations.map((r) => [r.station, r]));
  const [startH, startM] = sc.eva_start_lmst.split(':').map(Number);
  const [sunH, sunM] = sc.sunset_lmst.split(':').map(Number);
  const zones = (d.zones?.features || []).map((f) => ({ ...f.properties, ring: f.geometry.coordinates[0] }));
  return {
    sc,
    stations,
    routes,
    zones,
    habitat: { lon: sc.habitat[0], lat: sc.habitat[1] },
    startMin: startH * 60 + startM,
    sunsetEva: sunH * 60 + sunM - (startH * 60 + startM), // EVA minutes at sunset
    ls: sc.life_support_min,
    placeholders: d.placeholders,
    missing: d.missing,
    grid: d.grid,
    radio: d.radio,
    ortho: d.ortho,
    hasSlopeLayer: !!d.slopeLayer,
    slopeLayer: d.slopeLayer || null,
    layers: d.layers || [],
    // the elevation map placed on the grid by GeoMapper (layer role "elevation"); the crew views read
    // elevation and slope from it where it covers the ground, else from the pipeline's 10 m grid
    dem: (d.layers || []).find((l) => l.role === 'elevation' && (l.detail || l.values)) || null,
    comparison: d.comparison,
    // local place names of the Curiosity mission (labels only, approximate positions, not IAU names)
    // Curiosity pictures, by station number (images/curiosity/bilder.json, "kartenpunkt"); paths made absolute
    pictures: (d.pictures?.bilder || []).map((b) => ({
      ...b, n: b.kartenpunkt,
      src: `${import.meta.env.BASE_URL}images/curiosity/${b.bilddatei}`,
      big: `${import.meta.env.BASE_URL}images/curiosity/${b.bilddatei_gross || b.bilddatei}`,
    })),
    names: (d.names?.features || []).map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })),
  };
}

export function lmst(model, t) {
  const m = Math.round(model.startMin + t);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Position on a timed track, started at EVA time t0, walking factor f (2 for an injured crew member).
export function onTrack(track, t0, t, f = 1) {
  const v = track.vertices;
  const tt = (t - t0) / f;
  if (tt <= 0) return { lat: v[0].lat, lon: v[0].lon, doneM: 0, leftM: track.length_m, leftMin: track.minutes * f, end: false };
  for (let i = 1; i < v.length; i++) {
    if (v[i].t_min >= tt) {
      const span = v[i].t_min - v[i - 1].t_min || 1;
      const u = (tt - v[i - 1].t_min) / span;
      const d = v[i - 1].d_m + (v[i].d_m - v[i - 1].d_m) * u;
      return {
        lat: v[i - 1].lat + (v[i].lat - v[i - 1].lat) * u,
        lon: v[i - 1].lon + (v[i].lon - v[i - 1].lon) * u,
        doneM: d, leftM: track.length_m - d, leftMin: (track.minutes - tt) * f, end: false,
      };
    }
  }
  const e = v[v.length - 1];
  return { lat: e.lat, lon: e.lon, doneM: track.length_m, leftM: 0, leftMin: 0, end: true };
}

// Longest stay at a station that is `back` minutes from base, arriving at EVA time `arrive`.
// No safe stay where the station is more than 60 minutes from base.
export function maxStay(model, back, arrive) {
  if (back == null) return null;
  if (back > 60) return -1;
  return Math.min(model.ls, model.sunsetEva) - arrive - back;
}

export function pickerRows(model, t0 = 0) {
  return model.stations.map((s) => {
    const r = model.routes.get(s.n);
    const walk = r ? r.out.minutes : null;
    const back = r ? r.ret.minutes : null;
    return { ...s, km: r ? (r.out.length_m_astar ?? r.out.length_m) / 1000 : null, walk, back, stay: walk == null ? null : maxStay(model, back, t0 + walk) };
  });
}

export function doseAt(model, t) { return model.sc.dose_rate_msv_per_day * t / 1440; }

// ---------- distances and protected zones ----------
export const M_PER_DEG = 3396190 * Math.PI / 180;
export function distM(a, b) { // ground metres between {lon, lat} points (small area, Mars sphere)
  const lat = ((a.lat + b.lat) / 2) * Math.PI / 180;
  return Math.hypot((b.lon - a.lon) * M_PER_DEG * Math.cos(lat), (b.lat - a.lat) * M_PER_DEG);
}
function inRing(p, ring) { // ray casting on lon/lat, fine for zones a few hundred metres wide
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const zoneAt = (model, p) => model.zones.find((z) => inRing(p, z.ring)) || null;

// Nearest protected zone: { zone, d, edge } with d = metres to its edge (0 inside) and edge = the
// nearest point on the edge. Local metric plane around p; zones are a few hundred metres at most.
export function zoneDistance(model, p, only = null) {
  if (!p || !model.zones.length) return null;
  const kx = M_PER_DEG * Math.cos(p.lat * Math.PI / 180), ky = M_PER_DEG;
  let best = null;
  for (const z of (only ? [only] : model.zones)) {
    const inside = inRing(p, z.ring);
    for (let i = 1; i < z.ring.length; i++) {
      const ax = (z.ring[i - 1][0] - p.lon) * kx, ay = (z.ring[i - 1][1] - p.lat) * ky;
      const bx = (z.ring[i][0] - p.lon) * kx, by = (z.ring[i][1] - p.lat) * ky;
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const u = Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / len2));
      const ex = ax + (bx - ax) * u, ey = ay + (by - ay) * u, d = Math.hypot(ex, ey);
      if (!best || (inside ? 0 : d) < best.d || ((inside ? 0 : d) === best.d && d < best.raw)) {
        best = { zone: z, d: inside ? 0 : d, raw: d, edge: { lon: p.lon + ex / kx, lat: p.lat + ey / ky } };
      }
    }
  }
  return best;
}

// Where a timed track runs through protected zones: [{ zone, dIn, dOut, tIn, m }], sampled every 5 m.
const hitCache = new WeakMap();
export function zoneHits(model, track) {
  if (!track || !model.zones.length) return [];
  if (hitCache.has(track)) return hitCache.get(track);
  const v = track.vertices, hits = [];
  let cur = null;
  for (let i = 1; i < v.length; i++) {
    const seg = v[i].d_m - v[i - 1].d_m, n = Math.max(1, Math.ceil(seg / 5));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const p = { lon: v[i - 1].lon + (v[i].lon - v[i - 1].lon) * u, lat: v[i - 1].lat + (v[i].lat - v[i - 1].lat) * u };
      const z = zoneAt(model, p);
      const d = v[i - 1].d_m + seg * u, t = v[i - 1].t_min + (v[i].t_min - v[i - 1].t_min) * u;
      if (z && (!cur || cur.zone !== z)) { if (cur) hits.push(cur); cur = { zone: z, dIn: d, dOut: d, tIn: t, m: 0 }; }
      else if (!z && cur) { hits.push(cur); cur = null; }
      if (cur) { cur.dOut = d; cur.m = cur.dOut - cur.dIn + seg / n; }
    }
  }
  if (cur) hits.push(cur);
  hitCache.set(track, hits);
  return hits;
}

// ---------- time-to-base grids from the routing engine (lookups only, no search) ----------
function geo(g) { const h = g.header; return { nx: h.nx, ny: h.ny, cell: h.cell_m, x0: h.origin_m.x, y0: h.origin_m.y }; }
export function cellIndex(g, p) {
  const { nx, ny, cell, x0, y0 } = geo(g);
  const c = Math.floor((p.lon * M_PER_DEG - x0) / cell), r = Math.floor((y0 - p.lat * M_PER_DEG) / cell);
  return c < 0 || r < 0 || c >= nx || r >= ny ? -1 : r * nx + c;
}
export function cellCenter(g, i) {
  const { nx, cell, x0, y0 } = geo(g);
  return { lon: (x0 + ((i % nx) + 0.5) * cell) / M_PER_DEG, lat: (y0 - (Math.floor(i / nx) + 0.5) * cell) / M_PER_DEG };
}
export function gridBounds(g) {
  const { nx, ny, cell, x0, y0 } = geo(g);
  return [[(y0 - ny * cell) / M_PER_DEG, x0 / M_PER_DEG], [y0 / M_PER_DEG, (x0 + nx * cell) / M_PER_DEG]]; // [[s, w], [n, e]]
}
// The habitat's footprint, fixed at 10 x 10 m: its cell of the console grid (the cell the time to base
// counts from). Without the grid a 10 m square around it. { w, e, n, s } in degrees.
export function habitatBox(model) {
  const g = model.grid, h = model.habitat;
  const i = g ? cellIndex(g, h) : -1;
  if (i >= 0) {
    const { nx, cell, x0, y0 } = geo(g), r = Math.floor(i / nx), c = i % nx;
    return { w: (x0 + c * cell) / M_PER_DEG, e: (x0 + (c + 1) * cell) / M_PER_DEG, n: (y0 - r * cell) / M_PER_DEG, s: (y0 - (r + 1) * cell) / M_PER_DEG };
  }
  const dlat = 5 / M_PER_DEG, dlon = 5 / (M_PER_DEG * Math.cos(h.lat * Math.PI / 180));
  return { w: h.lon - dlon, e: h.lon + dlon, n: h.lat + dlat, s: h.lat - dlat };
}
// Minutes to the habitat from p; which = 'penalized' (zones avoided) or 'allowed' (ABORT). null without grid.
export function ttbAt(model, p, which = 'penalized') {
  const g = model.grid;
  if (!g || !p) return null;
  const i = cellIndex(g, p);
  if (i < 0) return Infinity;
  return (which === 'allowed' ? g.ttbAllowed : g.ttbPenalized)[i];
}
// Elevation (m) and 10 m slope (°) at p from the pipeline's grids; null when they are not loaded
function gridValue(g, arr, p) {
  if (!g || !arr || !p) return null;
  const i = cellIndex(g, p);
  const v = i < 0 ? NaN : arr[i];
  return Number.isFinite(v) ? v : null;
}
export const elevAt = (model, p) => gridValue(model.grid, model.grid?.elev, p);
export const slopeAt = (model, p) => gridValue(model.grid, model.grid?.slope, p);
// Value of a map layer at p (pipeline/map_layers.py value grid); the slope layer reads the slope grid
export const layerValueAt = (model, layer, p) => gridValue(model.grid, layer.values ?? (layer.id === 'slope' ? model.grid?.slope : null), p);
// Elevation (m) and slope (°, 10 m baseline) at p, from the GeoMapper elevation map (model.dem) where it
// covers p, else from the pipeline's 10 m grid. Between the map's 1 m samples the elevation is bilinear;
// the slope comes from the elevations 5 m east, west, north and south, the same 10 m baseline as rule 2.
// { z, slope, src: 'geomapper' | 'grid' }; z and slope are null where nothing covers p.
function detailZ(d, p) {
  const [[s, w], [n, e]] = d.bounds;
  const fx = (p.lon - w) / (e - w) * d.cols - 0.5, fy = (n - p.lat) / (n - s) * d.rows - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  if (!(x0 >= 0 && y0 >= 0 && x0 < d.cols - 1 && y0 < d.rows - 1)) return null;
  const u = fx - x0, v = fy - y0, a = d.values, i = y0 * d.cols + x0;
  const q00 = a[i], q01 = a[i + 1], q10 = a[i + d.cols], q11 = a[i + d.cols + 1];
  if (!(Number.isFinite(q00) && Number.isFinite(q01) && Number.isFinite(q10) && Number.isFinite(q11))) return null;
  return q00 * (1 - u) * (1 - v) + q01 * u * (1 - v) + q10 * (1 - u) * v + q11 * u * v;
}
export function demZ(model, p) {
  const dem = model.dem;
  if (!dem || !p) return null;
  return dem.detail ? detailZ(dem.detail, p) : gridValue(model.grid, dem.values, p);
}
export function terrainAt(model, p) {
  const z = demZ(model, p);
  if (z == null) return { z: elevAt(model, p), slope: slopeAt(model, p), src: 'grid' };
  const h = 5, kx = M_PER_DEG * Math.cos(p.lat * Math.PI / 180);
  const e = demZ(model, { lon: p.lon + h / kx, lat: p.lat }), w = demZ(model, { lon: p.lon - h / kx, lat: p.lat });
  const nn = demZ(model, { lon: p.lon, lat: p.lat + h / M_PER_DEG }), ss = demZ(model, { lon: p.lon, lat: p.lat - h / M_PER_DEG });
  const slope = e != null && w != null && nn != null && ss != null ? Math.atan(Math.hypot((e - w) / (2 * h), (nn - ss) / (2 * h))) * 180 / Math.PI : slopeAt(model, p);
  return { z, slope, src: 'geomapper' };
}
// The engine's way home from p: follow the return pointers to the habitat. Times are differences of
// the stored walking times, so slope and detours come from the engine, not from this code.
export function pointerTrack(model, p, which = 'allowed') {
  const g = model.grid;
  if (!g || !p) return null;
  const ptr = which === 'allowed' ? g.ptrAllowed : g.ptrPenalized;
  const ttb = which === 'allowed' ? g.ttbAllowed : g.ttbPenalized;
  let i = cellIndex(g, p);
  if (i < 0 || !Number.isFinite(ttb[i])) return null;
  const T0 = ttb[i];
  const pts = [{ ...p, t: 0 }];
  for (let guard = 0; ptr[i] !== -1 && guard < g.header.nx * g.header.ny; guard++) { i = ptr[i]; pts.push({ ...cellCenter(g, i), t: T0 - ttb[i] }); }
  pts.push({ ...model.habitat, t: T0 });
  let d = 0;
  const vertices = pts.map((q, k) => {
    if (k) d += distM(pts[k - 1], q);
    return { lon: q.lon, lat: q.lat, d_m: d, t_min: q.t, elev_m: null, slope_deg: null };
  });
  return { vertices, length_m: d, minutes: T0 };
}
