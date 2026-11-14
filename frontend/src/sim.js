// Simulation state and derived values for one EVA: habitat -> target station -> habitat.
// Every action is habitat control's; the crew follows the precomputed tracks.
import { onTrack } from './model.js';

export const st = {
  phase: 'plan',       // plan | run | done
  target: null,        // picked station number
  beat: 0,             // 0 = planning, 1..6
  t: 0,                // EVA minutes
  speedX: 60,
  retStart: null,      // EVA minute when habitat control started the return
  rerouted: false,
  driftAt: null,       // EVA minute of the drift warning
  rerouteAt: null,
  injuredAt: null,     // EVA minute of the injury
  abort: false,
  done: false,
  skin: 'values',
  playing: false,
};

export function resetRun(target) {
  Object.assign(st, { phase: 'plan', target, beat: 0, t: 0, retStart: null, rerouted: false, driftAt: null, rerouteAt: null, injuredAt: null, abort: false, done: false, skin: 'values' });
}

// The six scripted beats belong to the scenario station; other targets navigate without events.
export const scenarioStation = (model) => model.sc.scenario_station ?? model.stations[0]?.n ?? null;
export const isScripted = (model) => st.target != null && st.target === scenarioStation(model);

export const route = (model) => (st.target == null ? null : model.routes.get(st.target));
export const station = (model) => model.stations.find((s) => s.n === st.target) || null;
export const walkFactor = () => (st.injuredAt != null ? 2 : 1);

// Where the crew is and what it is doing at EVA time st.t
export function crewState(model) {
  const r = route(model);
  if (!r || st.phase === 'plan') return { where: 'habitat', pos: model.habitat };
  const t = st.t;
  if (st.retStart == null || t < st.retStart) {
    const p = onTrack(r.out, 0, t);
    return p.end ? { where: 'station', pos: p, backMin: r.ret.minutes } : { where: 'out', pos: p, backMin: p.doneM / (r.out.length_m / r.out.minutes) };
  }
  // on the way home; after an injury the rest of the track takes twice as long
  let tt = t - st.retStart;
  if (st.injuredAt != null && t > st.injuredAt) tt = (st.injuredAt - st.retStart) + (t - st.injuredAt) / 2;
  const p = onTrack(r.ret, 0, tt);
  const f = walkFactor();
  return { where: p.end ? 'home' : 'ret', pos: p, backMin: p.leftMin * f, leftM: p.leftM };
}

// Return limit: 60-minute rule, life support and daylight (rule B, shared/data-contract.md)
export function limits(model, t = st.t) {
  const B = Math.min(model.ls - t, model.sunsetEva - t);
  return { B, L: Math.min(60, B), by: B >= 60 ? '60-minute rule' : (model.ls <= model.sunsetEva ? 'life support' : 'sunset') };
}

export function stage(model, backMin) {
  if (backMin == null) return null;
  const spare = limits(model).L - backMin;
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
