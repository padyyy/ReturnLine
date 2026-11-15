// Map layers as habitat control arranges them in the Layers menu: which are on, their order (the top
// of the list is drawn on top) and their opacity; and the maps key 4 switches through on the tablet.
// The layers themselves come from the pipeline (GeoMapper, layers/index.json); this file only keeps
// the arrangement, in this browser (localStorage), merged with whatever layers are delivered.
const KEY = 'rl.layers.v1';

// order: layer ids, top first; on: shown on the base map; opacity per id; navOff: tablet maps left out
export const LS = { order: [], on: new Set(), opacity: {}, navOff: new Set() };

export function initLayers(model) {
  const ids = model.layers.map((l) => l.id);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* storage blocked */ }
  const byPriority = model.layers.slice().sort((a, b) => (b.meta.layer?.priority ?? 10) - (a.meta.layer?.priority ?? 10)).map((l) => l.id);
  const keep = (saved?.order ?? []).filter((id) => ids.includes(id));
  LS.order = [...keep, ...byPriority.filter((id) => !keep.includes(id))];      // new layers go in by priority
  LS.on = new Set(saved?.on ? saved.on.filter((id) => ids.includes(id))
    : model.layers.filter((l) => l.meta.layer?.visible).map((l) => l.id));
  LS.opacity = {};
  for (const l of model.layers) LS.opacity[l.id] = saved?.opacity?.[l.id] ?? l.meta.layer?.opacity ?? 0.6;
  LS.navOff = new Set(saved?.navOff ?? []);
}
export function saveLayers() {
  try { localStorage.setItem(KEY, JSON.stringify({ order: LS.order, on: [...LS.on], opacity: LS.opacity, navOff: [...LS.navOff] })); } catch { /* storage blocked */ }
}
export function moveLayer(id, by) {
  const i = LS.order.indexOf(id), j = i + by;
  if (i < 0 || j < 0 || j >= LS.order.length) return false;
  [LS.order[i], LS.order[j]] = [LS.order[j], LS.order[i]];
  return true;
}
export const layerById = (model, id) => model.layers.find((l) => l.id === id) || null;
export const shortName = (ly) => ly.name.split(/[,(]/)[0].trim();
// the switched-on layers, bottom first (the order they are drawn in)
export const stackedOn = (model) => LS.order.filter((id) => LS.on.has(id)).reverse().map((id) => layerById(model, id)).filter(Boolean);

// Every map the tablet can show: { id, label, detail, parts } with parts drawn bottom first
// ('ortho' or a layer); an empty parts list is the plain map with the return stages only.
export function navChoices(model) {
  const out = [];
  if (model.ortho) out.push({ id: 'ortho', label: 'Orthophoto', detail: 'grey, 1 m', parts: ['ortho'] });
  const on = stackedOn(model);
  out.push({ id: 'stack', label: 'Like the base map', detail: on.length ? `${model.ortho ? 'Orthophoto + ' : ''}${on.map(shortName).join(' + ')}` : 'Select a map layer above',
    parts: [...(model.ortho ? ['ortho'] : []), ...on], empty: !on.length });
  for (const id of LS.order) { const ly = layerById(model, id); if (ly) out.push({ id: `layer:${id}`, label: shortName(ly), detail: 'on paper', parts: [ly] }); }
  out.push({ id: 'plain', label: 'Plain', detail: 'return stages only', parts: [] });
  return out;
}
// The maps key 4 switches through, in order; never empty
export function navViews(model) {
  const all = navChoices(model);
  const list = all.filter((c) => !LS.navOff.has(c.id) && !c.empty);
  return list.length ? list : [all[all.length - 1]];
}
// A tablet map by id ('ortho', 'stack', 'layer:<id>', 'plain', or a bare layer id); the first one when unknown
export function navView(model, id) {
  const all = navChoices(model);
  return all.find((c) => c.id === id || c.id === `layer:${id}`) || navViews(model)[0];
}
