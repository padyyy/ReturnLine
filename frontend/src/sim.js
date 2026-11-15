// Simulation state and derived values for one EVA: habitat -> target station -> habitat.
// Every action is habitat control's; the crew follows precomputed tracks (engine routes and pointers).
// The only scripted movement is the drift in beat 4, as in docs/demo-script.md.
import { onTrack, ttbAt, pointerTrack, zoneHits, zoneAt, zoneDistance, distM } from './model.js';

export const st = {
  phase: 'plan',       // plan | run | done
  target: null,        // picked station number
  beat: 0,             // 0 = planning, 1..6
  t: 0,                // EVA minutes
  speedX: 60,
  retStart: null,      // EVA minute when habitat control started the return
  drift: false,        // beat 4: the scripted drift toward a protected zone has begun
  driftAt: null,       // EVA minute of the proximity warning
  rerouted: false,
  rerouteAt: null,     // EVA minute when habitat control sent the reroute
  injuredAt: null,     // EVA minute of the injury
  slow: 1,             // times home are multiplied by this after the injury (1 / injury_factor)
  abort: false,
  abortAt: null,       // EVA minute when habitat control confirmed the ABORT
  done: false,
  skin: 'values',
  cuffMode: 'values',  // forearm display: 'values' (default) or 'map' (navigation map)
  navZoom: 2,          // index into the navigation map's zoom levels
  navBase: 'ortho',    // navigation map base: 'ortho' or 'plain'
  playing: false,
};

export function resetRun(target) {
  Object.assign(st, { phase: 'plan', target, beat: 0, t: 0, retStart: null, drift: false, driftAt: null, rerouted: false, rerouteAt: null, injuredAt: null, slow: 1, abort: false, abortAt: null, done: false, skin: 'values', cuffMode: 'values' });
}

// The six scripted beats belong to the scenario station; other targets navigate without events.
export const scenarioStation = (model) => model.sc.scenario_station ?? model.stations[0]?.n ?? null;
export const isScripted = (model) => st.target != null && st.target === scenarioStation(model);

export const route = (model) => (st.target == null ? null : model.routes.get(st.target));
export const station = (model) => model.stations.find((s) => s.n === st.target) || null;
export const walkFactor = (t = st.t) => (st.injuredAt != null && t >= st.injuredAt ? st.slow : 1);
export const warnM = (model) => model.sc.zone_warn_m ?? 10;

// The injury (beat 5): from now on the crew walks at injury_factor of its speed (scenario.json, a
// labeled assumption), so every time home grows by 1 / injury_factor.
export function injure(model, t = st.t) {
  const k = Number(model.sc.injury_factor);
  st.injuredAt = t;
  st.slow = k > 0 && k <= 1 ? 1 / k : 2;
}

// Track time on a leg started at EVA minute t0; after the injury the crew covers less track per minute
function legTime(t0, t) {
  if (st.injuredAt != null && t > st.injuredAt) return Math.max(0, st.injuredAt - t0) + (t - Math.max(st.injuredAt, t0)) / st.slow;
  return t - t0;
}
function legTimeInv(t0, tt) { // track minutes -> EVA minute
  if (st.injuredAt == null || t0 + tt <= st.injuredAt) return t0 + tt;
  const base = Math.max(st.injuredAt, t0);
  return base + (tt - (base - t0)) * st.slow;
}

// ---------- beat 4: the scripted drift, as in the design sketch ----------
// On the way home, the point nearest a protected zone; two minutes before it the crew starts to drift
// and, a minute after it, stands warn metres from the zone edge (D). The reroute comes from the engine.
let scriptMemo = { key: '', v: null };
export function script(model) {
  const r = route(model);
  if (!r || !model.grid || !isScripted(model) || st.retStart == null || !model.zones.length) return null;
  const key = `${st.target}|${st.retStart}`;
  if (scriptMemo.key === key) return scriptMemo.v;
  const warn = warnM(model);
  const v = r.ret.vertices;
  // the zone the crew drifts toward is scenario data (drift_zone); without it, the zone nearest the way home
  const only = model.zones.find((z) => z.id === model.sc.drift_zone) || null;
  let best = null;
  for (let i = 1; i < v.length - 1; i++) {
    const zd = zoneDistance(model, v[i], only);
    if (zd && (!best || zd.d < best.d)) best = { ...zd, i };
  }
  let out = null;
  if (best && best.d > warn) {
    const q = v[best.i];
    const tQ = st.retStart + q.t_min;
    const tQa = Math.max(st.retStart + 1, tQ - 2), tD = tQ + 1;
    const qa = onTrack(r.ret, st.retStart, tQa);
    const k = warn / best.d;
    const D = { lon: best.edge.lon + (q.lon - best.edge.lon) * k, lat: best.edge.lat + (q.lat - best.edge.lat) * k };
    const pts = [];
    for (let s = 0; s <= 16; s++) { // quadratic curve qa -> q -> D
      const u = s / 16, a = 1 - u;
      pts.push({ lon: a * a * qa.lon + 2 * a * u * q.lon + u * u * D.lon, lat: a * a * qa.lat + 2 * a * u * q.lat + u * u * D.lat, t: (tD - tQa) * u });
    }
    let d = 0;
    const vertices = pts.map((p, i) => { if (i) d += distM(pts[i - 1], p); return { lon: p.lon, lat: p.lat, d_m: d, t_min: p.t, elev_m: null, slope_deg: null }; });
    out = { zone: best.zone, tQa, tD, D, drift: { vertices, length_m: d, minutes: tD - tQa } };
  }
  scriptMemo = { key, v: out };
  return out;
}

let rerouteMemo = { key: '', track: null };
export function rerouteTrack(model) {
  const sp = st.drift ? script(model) : null;
  if (!sp || st.rerouteAt == null) return null;
  const key = scriptMemo.key;
  if (rerouteMemo.key !== key) rerouteMemo = { key, track: pointerTrack(model, sp.D, 'penalized') };
  return rerouteMemo.track;
}

// Extra minutes of the reroute against the planned way home (both at normal speed)
export function detourMin(model) {
  const rt = rerouteTrack(model), r = route(model);
  return rt && r ? st.rerouteAt + rt.minutes - (st.retStart + r.ret.minutes) : null;
}

// ---------- the legs actually walked, in order ----------
function chain(model, withAbort = true) {
  const r = route(model);
  const legs = [{ kind: 'out', track: r.out, t0: 0 }];
  if (st.retStart == null) return legs;
  legs.push({ kind: 'ret', track: r.ret, t0: st.retStart });
  const sp = st.drift ? script(model) : null;
  if (sp) {
    legs.push({ kind: 'drift', track: sp.drift, t0: sp.tQa, plain: true });
    const rt = rerouteTrack(model);
    if (rt) legs.push({ kind: 'reroute', track: rt, t0: st.rerouteAt });
  }
  if (withAbort && st.abortAt != null) {
    const at = abortTrack(model);
    if (at) legs.push({ kind: 'abort', track: at, t0: st.abortAt });
  }
  return legs;
}
function positionAt(model, t, withAbort = true) {
  const legs = chain(model, withAbort);
  let k = legs.length - 1;
  while (k > 0 && t < legs[k].t0) k--;
  const leg = legs[k];
  return { leg, p: onTrack(leg.track, 0, leg.plain ? t - leg.t0 : legTime(leg.t0, t)) };
}

// The leg being walked now, with the track time on it (for the crew views: heading, walked part)
export function activeLeg(model, t = st.t) {
  if (!route(model) || st.phase === 'plan') return null;
  const legs = chain(model);
  let k = legs.length - 1;
  while (k > 0 && t < legs[k].t0) k--;
  const leg = legs[k];
  return { kind: leg.kind, track: leg.track, tt: leg.plain ? t - leg.t0 : legTime(leg.t0, t) };
}

// The ABORT way home: the engine's zones-allowed pointers from where the crew stood at the ABORT
let abortMemo = { key: '', track: null };
export function abortTrack(model) {
  if (st.abortAt == null || !model.grid) return null;
  const key = `${st.target}|${st.abortAt}|${st.retStart}|${st.injuredAt}|${st.drift}|${st.rerouteAt}`;
  if (abortMemo.key !== key) abortMemo = { key, track: pointerTrack(model, positionAt(model, st.abortAt, false).p, 'allowed') };
  return abortMemo.track;
}

// Beat 5: the two ways home from where the crew stood when the injury happened, at injured speed,
// against the return limit at that moment. Both follow the engine's pointers (zones penalized, zones
// allowed); the browser computes no route. null without the grid or before the injury.
let optMemo = { key: '', v: null };
export function injuryOptions(model) {
  if (st.injuredAt == null || !model.grid || !route(model)) return null;
  const key = `${st.target}|${st.injuredAt}|${st.slow}|${st.retStart}|${st.drift}|${st.rerouteAt}`;
  if (optMemo.key === key) return optMemo.v;
  const p = positionAt(model, st.injuredAt, false).p;
  const lim = limits(model, st.injuredAt);
  const way = (which) => {
    const T = ttbAt(model, p, which);
    const track = Number.isFinite(T) ? pointerTrack(model, p, which) : null;
    if (!track) return null;
    const min = T * st.slow;
    return { which, track, min, ok: min <= lim.L, zones: zoneHits(model, track).map((h) => h.zone), lsLeft: model.ls - st.injuredAt - min };
  };
  optMemo = { key, v: { lim, protectedWay: way('penalized'), throughWay: way('allowed') } };
  return optMemo.v;
}

// Where the crew is and what it is doing at EVA time t
export function crewState(model, t = st.t) {
  const r = route(model);
  if (!r || st.phase === 'plan') return { where: 'habitat', pos: model.habitat, leg: 'habitat' };
  const { leg, p } = positionAt(model, t);
  const f = walkFactor(t);
  if (leg.kind === 'out') {
    return p.end ? { where: 'station', pos: p, backMin: r.ret.minutes * f, leg: 'station' }
      : { where: 'out', pos: p, backMin: p.doneM / (r.out.length_m / r.out.minutes), leg: 'out' };
  }
  if (leg.kind === 'drift') { // off the route: time home from the engine grid at the crew's cell
    const T = ttbAt(model, p, 'penalized');
    return { where: 'ret', pos: p, backMin: Number.isFinite(T) ? T * f : null, leftM: null, leg: 'drift' };
  }
  return { where: p.end ? 'home' : 'ret', pos: p, backMin: p.leftMin * f, leftM: p.leftM, leg: leg.kind };
}

// Return limit: 60-minute rule, life support and daylight (rule B, shared/data-contract.md)
export function limits(model, t = st.t) {
  const B = Math.min(model.ls - t, model.sunsetEva - t);
  return { B, L: Math.min(60, B), by: B >= 60 ? '60-minute rule' : (model.ls <= model.sunsetEva ? 'life support' : 'sunset') };
}

// Return stage at the crew (rule B): spare = L - f x T(crew cell). With the grid, T is the engine's
// time to base at the crew's own cell (zones-allowed after an ABORT); without it, the route's time back.
export function stage(model, backMin, pos) {
  let T = null;
  if (model.grid && pos) {
    const v = ttbAt(model, pos, st.abortAt != null ? 'allowed' : 'penalized');
    if (Number.isFinite(v)) T = v * walkFactor();
  }
  if (T == null) T = backMin;
  if (T == null) return null;
  const spare = limits(model).L - T;
  return { spare, name: spare < 0 ? 'red' : spare < model.sc.caution_margin_min ? 'amber' : 'green' };
}

// Planned home time for the budget and the daylight rule
export function homeTime(model) {
  const r = route(model);
  if (!r) return null;
  if (st.retStart == null) return Math.max(300, r.out.minutes) + r.ret.minutes; // planned turnaround at EVA 5:00
  const c = crewState(model);
  return st.t + (c.backMin ?? 0);
}

// Zone entries on the way actually walked, up to EVA time t: [{ t, zone, m, override }]
export function zoneEvents(model, t = st.t) {
  if (!route(model) || st.phase === 'plan') return [];
  const legs = chain(model);
  const ev = [];
  legs.forEach((leg, k) => {
    const end = k + 1 < legs.length ? legs[k + 1].t0 : Infinity;
    for (const h of zoneHits(model, leg.track)) {
      const te = leg.plain ? leg.t0 + h.tIn : legTimeInv(leg.t0, h.tIn);
      if (te < end && te <= t) ev.push({ t: te, zone: h.zone, m: h.m, override: leg.kind === 'abort' });
    }
  });
  return ev.sort((a, b) => a.t - b.t);
}

// The zone the crew is standing in right now, or null
export function zoneNow(model) {
  const c = crewState(model);
  return c.where === 'habitat' ? null : zoneAt(model, c.pos);
}

// Proximity warning: the crew is within warn metres of a protected zone's edge (not on the ABORT
// way, where entering is the decision). { zone, d } or null.
export function proximity(model) {
  const c = crewState(model);
  if (c.where === 'habitat' || c.where === 'home' || c.leg === 'abort') return null;
  const zd = zoneDistance(model, c.pos);
  return zd && zd.d > 0 && zd.d <= warnM(model) + 0.5 ? zd : null;
}
