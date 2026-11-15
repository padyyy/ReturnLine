// Loads the files listed in shared/data-contract.md. Real files live in public/data/; while the
// pipeline and the routing engine have not delivered them, placeholder files from
// public/data/placeholder/ (made by scripts/make-placeholder-data.mjs) stand in and are reported.
const BASE = import.meta.env.BASE_URL;

async function fetchJson(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // throws on HTML fallbacks of the dev server, which counts as missing
}

export async function loadData() {
  const placeholders = new Set();
  const missing = new Set();

  async function load(name, { placeholder = true } = {}) {
    try { return await fetchJson(`data/${name}`); } catch { /* not delivered yet */ }
    if (placeholder) {
      try { const v = await fetchJson(`data/placeholder/${name}`); placeholders.add(name); return v; } catch { /* none */ }
    }
    missing.add(name);
    return null;
  }

  const [scenario, stations, zones, routes, traverse, radio, comparison, temperature, drillHoles, ortho] = await Promise.all([
    load('scenario.json'), load('stations.geojson'), load('zones.geojson'), load('routes.json'),
    load('curiosity_traverse.geojson'), load('radio_check.json', { placeholder: false }),
    load('curiosity_comparison.json', { placeholder: false }),
    load('temperature.json', { placeholder: false }),   // REMS air temperature, information only
    load('drill_holes.geojson', { placeholder: false }), // Curiosity's real drill holes, information only
    fetchJson('maps/ortho_gale_1m.json').catch(() => null),
  ]);
  // slope display layer (pipeline/mapping_bridge.py); optional, display only
  let slopeLayer = await fetchJson('data/slope_10m.json').catch(() => null);
  if (!scenario || !stations || !routes) throw new Error('scenario, stations and routes are required');
  const grid = await loadGrid(missing, placeholders);
  // the slope image must cover exactly the grid it was made from (pixels_per_cell pixels per cell edge)
  const ppc = slopeLayer?.pixels_per_cell || 1;
  if (slopeLayer && grid && (slopeLayer.width_px !== grid.header.nx * ppc || slopeLayer.height_px !== grid.header.ny * ppc)) {
    console.warn('slope layer does not match grid.json; not drawn');
    slopeLayer = null;
  }
  const mapLayers = await loadMapLayers(grid);
  return { scenario, stations, zones, routes, traverse, radio, comparison, temperature, drillHoles, ortho, grid, slopeLayer, mapLayers, placeholders, missing };
}

// Map layers anchored on the console grid by GeoMapper (pipeline/map_layers.py, idea and layers from
// Alex's branch). layers/index.json lists them; the slope layer keeps its own switch and is skipped here.
// A layer is drawn only when it was made for exactly this grid (same origin, cell size and size).
// Display only: the values in the .f32 files are not used by the console.
async function loadMapLayers(grid) {
  const index = await fetchJson('data/layers/index.json').catch(() => null);
  if (!index?.layers || !grid) return [];
  const h = grid.header;
  const same = (g) => g && g.cell_m === h.cell_m && g.nx === h.nx && g.ny === h.ny
    && Math.abs(g.origin_m.x - h.origin_m.x) < 1e-3 && Math.abs(g.origin_m.y - h.origin_m.y) < 1e-3;
  const out = [];
  for (const path of index.layers) {
    if (path === 'data/slope_10m.json') continue;
    const meta = await fetchJson(path).catch(() => null);
    if (!meta?.image_path || !meta.bounds) continue;
    if (!same(meta.grid)) { console.warn(`map layer ${meta.layer?.id ?? path} does not match grid.json; not drawn`); continue; }
    out.push({
      id: meta.layer?.id ?? path, name: meta.layer?.name ?? path, units: meta.units ?? null,
      image: meta.image_path, bounds: meta.bounds, opacity: meta.layer?.opacity ?? 0.6, priority: meta.layer?.priority ?? 20,
      visible: !!meta.layer?.visible, legend: meta.legend ?? [], note: meta.source?.note ?? '',
    });
  }
  return out.sort((a, b) => a.priority - b.priority);
}

// Time-to-base grids and return pointers from the routing engine (grid spec in shared/).
async function loadGrid(missing, placeholders) {
  let header;
  let dir = 'data/';
  try { header = await fetchJson('data/grid.json'); } catch {
    try { header = await fetchJson('data/placeholder/grid.json'); dir = 'data/placeholder/'; placeholders.add('grid.json'); } catch { missing.add('grid.json'); return null; }
  }
  const bin = async (file, Type) => {
    const res = await fetch(BASE + dir + file);
    if (!res.ok) throw new Error(`missing ${file}`);
    return new Type(await res.arrayBuffer());
  };
  try {
    const f = header.files || {};
    return {
      header,
      placeholder: dir !== 'data/',
      ttbPenalized: await bin(f.ttb_penalized || 'ttb_penalized.f32', Float32Array),
      ttbAllowed: await bin(f.ttb_allowed || 'ttb_allowed.f32', Float32Array),
      ptrPenalized: await bin(f.ptr_penalized || 'ptr_penalized.i32', Int32Array),
      ptrAllowed: await bin(f.ptr_allowed || 'ptr_allowed.i32', Int32Array),
    };
  } catch (err) {
    console.warn('grid files incomplete:', err);
    missing.add('grid files');
    return null;
  }
}
