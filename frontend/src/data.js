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

  const [scenario, stations, zones, routes, traverse, radio, comparison, ortho] = await Promise.all([
    load('scenario.json'), load('stations.geojson'), load('zones.geojson'), load('routes.json'),
    load('curiosity_traverse.geojson'), load('radio_check.json', { placeholder: false }),
    load('curiosity_comparison.json', { placeholder: false }),
    fetchJson('maps/ortho_gale_1m.json').catch(() => null),
  ]);
  if (!scenario || !stations || !routes) throw new Error('scenario, stations and routes are required');
  const grid = await loadGrid(missing, placeholders);
  const layers = await loadLayers(grid);
  const slopeLayer = layers.find((l) => l.id === 'slope')?.meta || null;
  return { scenario, stations, zones, routes, traverse, radio, comparison, ortho, grid, layers, slopeLayer, placeholders, missing };
}

// Map layers anchored on the console grid by GeoMapper (pipeline/map_layers.py): layers/index.json lists
// them; without the index the slope picture of mapping_bridge.py alone. A layer is drawn only when it was
// made for this grid: its pictures cover exactly nx x ny cells and its bounds are the grid's bounds.
async function loadLayers(grid) {
  const index = await fetchJson('data/layers/index.json').catch(() => null);
  const paths = index?.layers ?? ['data/slope_10m.json'];
  const out = [];
  for (const path of paths) {
    const meta = await fetchJson(path).catch(() => null);
    if (!meta) continue;
    const ppc = meta.pixels_per_cell || 1;
    const cells = meta.window ? [meta.window.cols, meta.window.rows] : [grid?.header.nx, grid?.header.ny]; // detail pictures cover a window of cells
    if (grid && (meta.width_px !== cells[0] * ppc || meta.height_px !== cells[1] * ppc || (index && meta.grid_id !== index.grid_id))) {
      console.warn(`layer ${meta.layer?.id ?? path} does not match grid.json; not drawn`);
      continue;
    }
    let values = null; // the sampled values, for the readout (never read from the picture)
    if (meta.numeric_file && grid) {
      try {
        const res = await fetch(BASE + 'data/' + meta.numeric_file);
        const buf = res.ok ? await res.arrayBuffer() : null;
        if (buf && buf.byteLength === grid.header.nx * grid.header.ny * 4) values = new Float32Array(buf);
      } catch { /* picture only */ }
    }
    out.push({ id: meta.layer?.id ?? path, name: meta.layer?.id === 'slope' ? 'Slope, 10 m baseline' : meta.layer?.name ?? path, units: meta.units ?? (meta.layer?.id === 'slope' ? '°' : null), meta, values });
  }
  return out;
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
      // elevation and slope per cell (pipeline); optional, for the values at the crew and the profile
      elev: f.elev ? await bin(f.elev, Float32Array).catch(() => null) : null,
      slope: f.slope ? await bin(f.slope, Float32Array).catch(() => null) : null,
    };
  } catch (err) {
    console.warn('grid files incomplete:', err);
    missing.add('grid files');
    return null;
  }
}
