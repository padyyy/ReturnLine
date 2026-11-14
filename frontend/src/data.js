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
  return { scenario, stations, zones, routes, traverse, radio, comparison, ortho, grid, placeholders, missing };
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
