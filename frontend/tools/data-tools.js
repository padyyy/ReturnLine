// Local data tools for `npm run dev` only: the console's "Add data" panel calls these endpoints to add
// targets and maps. They write the catalogs in ../data/ and run the offline pipeline (GeoMapper, A*),
// exactly as a person would on the command line. Vite registers this plugin for the dev server only
// (apply: 'serve'), so the built app on GitHub Pages has no such endpoints and stays static.
//
//   GET    /__tools/status                         python, catalogs
//   POST   /__tools/points  {name, lon, lat, reason?}   add a target, rebuild the plan
//   DELETE /__tools/points?id=...                  remove a target, rebuild the plan
//   POST   /__tools/layers?name=&units=&file=&radius=  body: GeoTIFF or CSV bytes; anchor it with GeoMapper
//   DELETE /__tools/layers?id=...                  remove a map, re-export the layers
//
// Every request must carry the header X-RL-Tools: 1. A custom header makes browsers ask before a
// cross-site request, which this server never allows, so other web pages cannot use the tools.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const POINTS = join(ROOT, 'data', 'points', 'points.json');
const LAYERS = join(ROOT, 'data', 'layers');
const OUT_LAYERS = join(ROOT, 'frontend', 'public', 'data', 'layers');
const MAX_TIFF = 400 * 1024 * 1024;
const MAP_EXT = /\.(tiff?|csv)$/i;   // GeoTIFF raster or CSV point table (latitude, longitude, values)
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'item';

function python() {
  for (const p of [join(ROOT, '.venv', 'Scripts', 'python.exe'), join(ROOT, '.venv', 'bin', 'python')]) if (existsSync(p)) return p;
  return process.platform === 'win32' ? 'py' : 'python3';
}
// one pipeline run at a time; each run gets its output back
let queue = Promise.resolve();
function run(script, args = []) {
  const job = queue.then(() => new Promise((res) => {
    const child = spawn(python(), [join(ROOT, 'pipeline', script), ...args], { cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    child.on('error', (e) => res({ code: -1, log: `${log}\n${e.message}` }));
    child.on('close', (code) => res({ code, log }));
  }));
  queue = job.catch(() => {});
  return job;
}
const readPoints = () => (existsSync(POINTS) ? JSON.parse(readFileSync(POINTS, 'utf8')) : { points: [] });
function writePoints(doc) {
  mkdirSync(dirname(POINTS), { recursive: true });
  doc.note ??= 'Added targets for the console. Each point becomes a station with a route (pipeline/astar_import.py: GeoMapper cell, backend/astar.py route, Tobler times).';
  writeFileSync(POINTS, `${JSON.stringify(doc, null, 2)}\n`);
}
const catalogFile = () => join(LAYERS, 'layers.json');
function layerList() {
  const listed = existsSync(catalogFile()) ? JSON.parse(readFileSync(catalogFile(), 'utf8')).layers ?? [] : [];
  const dropped = existsSync(LAYERS) ? readdirSync(LAYERS).filter((f) => MAP_EXT.test(f)).map((f) => {
    const side = join(LAYERS, f.replace(MAP_EXT, '.layer.json'));
    const extra = existsSync(side) ? JSON.parse(readFileSync(side, 'utf8')) : {};
    return { id: f.replace(MAP_EXT, ''), name: extra.name ?? f, units: extra.units ?? null, file: f, removable: true };
  }) : [];
  return [...listed.map((l) => ({ id: l.id, name: l.name, units: l.units ?? null, file: l.source, removable: false })), ...dropped];
}

function send(res, status, obj) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); }
function readJson(req, limit = 64 * 1024) {
  return new Promise((ok, bad) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > limit) { bad(new Error('request too large')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { bad(new Error('body is not JSON')); } });
  });
}

async function handle(req, res, url) {
  if (url.pathname === '/__tools/status' && req.method === 'GET') {
    return send(res, 200, { ok: true, python: python(), points: readPoints().points ?? [], layers: layerList() });
  }
  if (url.pathname === '/__tools/points' && req.method === 'POST') {
    const b = await readJson(req);
    const lon = Number(b.lon), lat = Number(b.lat), name = String(b.name ?? '').trim().slice(0, 80);
    if (!name || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return send(res, 400, { ok: false, error: 'name, lon and lat are required' });
    const doc = readPoints();
    doc.points ??= [];
    let id = slug(name), k = 2;
    while (doc.points.some((p) => p.id === id)) id = `${slug(name)}_${k++}`;
    doc.points.push({ id, name, lon: +lon.toFixed(7), lat: +lat.toFixed(7), reason: String(b.reason ?? '').trim().slice(0, 200) || undefined, added: new Date().toISOString() });
    writePoints(doc);
    const r = await run('astar_import.py');
    return send(res, r.code === 0 ? 200 : 500, { ok: r.code === 0, id, log: r.log });
  }
  if (url.pathname === '/__tools/points' && req.method === 'DELETE') {
    const doc = readPoints(), id = url.searchParams.get('id');
    const before = doc.points?.length ?? 0;
    doc.points = (doc.points ?? []).filter((p) => p.id !== id);
    if (doc.points.length === before) return send(res, 404, { ok: false, error: `no target ${id}` });
    writePoints(doc);
    const r = await run('astar_import.py');
    return send(res, r.code === 0 ? 200 : 500, { ok: r.code === 0, log: r.log });
  }
  if (url.pathname === '/__tools/layers' && req.method === 'POST') {
    const file = String(url.searchParams.get('file') ?? ''), name = String(url.searchParams.get('name') ?? '').trim().slice(0, 80);
    if (!MAP_EXT.test(file)) return send(res, 400, { ok: false, error: 'a GeoTIFF (.tif) or a CSV with latitude and longitude is required' });
    const ext = file.match(MAP_EXT)[0].toLowerCase();
    const id = slug(name || file.replace(MAP_EXT, ''));
    if (layerList().some((l) => l.id === id)) return send(res, 409, { ok: false, error: `a map with the id ${id} exists; pick another name` });
    mkdirSync(LAYERS, { recursive: true });
    const tif = join(LAYERS, `${id}${ext === '.csv' ? '.csv' : '.tif'}`);
    let size = 0, tooBig = false;
    await new Promise((ok, bad) => {
      const out = createWriteStream(tif);
      req.on('data', (d) => { size += d.length; if (size > MAX_TIFF) { tooBig = true; req.destroy(); out.destroy(); ok(); } });
      req.pipe(out);
      out.on('finish', ok); out.on('error', bad); req.on('error', bad);
    });
    if (tooBig || size === 0) { rmSync(tif, { force: true }); return send(res, 400, { ok: false, error: tooBig ? 'file over 400 MB' : 'empty file' }); }
    const units = String(url.searchParams.get('units') ?? '').trim().slice(0, 20);
    const radius = Number(url.searchParams.get('radius'));   // CSV search radius in metres; empty = twice the point spacing
    writeFileSync(join(LAYERS, `${id}.layer.json`), `${JSON.stringify({ name: name || id, ...(units ? { units } : {}), ...(radius > 0 ? { radius_m: radius } : {}), source_note: `added in the console (${file})` }, null, 2)}\n`);
    const r = await run('map_layers.py');
    const made = existsSync(OUT_LAYERS) ? readdirSync(OUT_LAYERS).filter((f) => f === `${id}.json` || (f.startsWith(`${id}_`) && f.endsWith('.json'))) : [];
    if (!made.length) { // GeoMapper could not anchor it: do not keep a broken map
      rmSync(tif, { force: true }); rmSync(join(LAYERS, `${id}.layer.json`), { force: true });
      await run('map_layers.py');
      return send(res, 422, { ok: false, error: 'GeoMapper could not place this map on the grid (no Mars CRS, no latitude/longitude columns, or it does not cover the grid)', log: r.log });
    }
    return send(res, 200, { ok: true, id, layers: made.map((f) => f.replace(/\.json$/, '')), log: r.log });
  }
  if (url.pathname === '/__tools/layers' && req.method === 'DELETE') {
    const id = slug(url.searchParams.get('id') ?? '');
    const l = layerList().find((x) => x.id === id);
    if (!l || !l.removable) return send(res, 404, { ok: false, error: 'only maps added in data/layers/ can be removed here' });
    const outs = existsSync(OUT_LAYERS) ? readdirSync(OUT_LAYERS).filter((f) => /\.(png|f32|json)$/.test(f) && (f.replace(/\.(png|f32|json)$/, '') === id || f.startsWith(`${id}_`))) : [];
    for (const f of [join(LAYERS, l.file), join(LAYERS, `${id}.layer.json`), ...outs.map((f) => join(OUT_LAYERS, f))]) rmSync(f, { force: true });
    const r = await run('map_layers.py');
    return send(res, r.code === 0 ? 200 : 500, { ok: r.code === 0, log: r.log });
  }
  return send(res, 404, { ok: false, error: 'unknown tool' });
}

export default function dataTools() {
  return {
    name: 'returnline-data-tools',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/__tools/')) return next();
        if (req.headers['x-rl-tools'] !== '1') return send(res, 403, { ok: false, error: 'missing X-RL-Tools header' });
        handle(req, res, url).catch((e) => send(res, 500, { ok: false, error: e.message }));
      });
    },
  };
}
