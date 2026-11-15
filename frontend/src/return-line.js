// Track evaluation for the console / navigation HUD. No DOM, clock or route search.
import { estimateDuration } from './route-duration.js';
import { cellIndex, zoneDistance } from './model.js';

export const RETURN_LINE_ASSUMPTIONS = Object.freeze({
  walk_speed_kmh: 1.5, injury_factor: 0.1, slope_block_deg: 20,
  life_support_min: 360, backup_min: 60, caution_margin_min: 15,
  sunset_lmst: '17:41', eva_start_lmst: '09:00',
  zone_buffer_m: 80, zone_clearance_m: 30, zone_warn_m: 10,
  dose_rate_msv_per_day: 0.64,
});
const finite = Number.isFinite;
// A speed factor of zero means no movement. Zero remaining distance still costs zero.
const walkingMinutes = (minutes, factor) => minutes > 1e-10 ? minutes * factor : 0;
export const RETURN_LINE_COLORS = Object.freeze({ green: '#1F6B45', yellow: '#D9A300', red: '#C8361F', unknown: '#8A8F92' });
const memo = new WeakMap();
const clockMinute = value => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [h, m] = value.split(':').map(Number);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
};

function assumptions(model = {}) {
  const sc = { ...RETURN_LINE_ASSUMPTIONS, ...model.sc };
  return { ...sc, life_support_min: model.ls ?? sc.life_support_min,
    sunsetEva: model.sunsetEva ?? clockMinute(sc.sunset_lmst) - clockMinute(sc.eva_start_lmst) };
}
function gridValue(model, name, vertex) {
  if (!model.grid?.[name] || !finite(vertex.lon) || !finite(vertex.lat)) return null;
  const i = cellIndex(model.grid, vertex);
  const v = i < 0 ? null : model.grid[name][i];
  return finite(v) ? v : null;
}
function invalid(reason) { return { error: reason }; }

// Use the existing Track format, including pointer tracks with duplicate end vertices.
// Heights permit directed Tobler times; otherwise valid engine times are retained.
function profile(input, model = {}, reverse = false) {
  if (!input || !Array.isArray(input.vertices)) return invalid('MISSING_TRACK');
  const a = assumptions(model);
  const old = memo.get(input);
  if (old?.model === model && old.speed === a.walk_speed_kmh && old.reverse === reverse) return old.value;
  if (input.minutes === Infinity) return invalid('UNREACHABLE');
  if (!(a.walk_speed_kmh > 0) || !finite(a.walk_speed_kmh)) return invalid('WALKING_SPEED');
  const vertices = [];
  for (const raw of input.vertices) {
    if (!finite(raw.d_m) || raw.d_m < 0 || !finite(raw.lon) || !finite(raw.lat)) return invalid('TRACK_GEOMETRY');
    const previous = vertices.at(-1);
    if (previous && raw.d_m < previous.d_m) return invalid('TRACK_DISTANCE');
    if (previous && raw.d_m === previous.d_m) {
      if (raw.lon !== previous.lon || raw.lat !== previous.lat) return invalid('ZERO_LENGTH_EDGE');
      continue;
    }
    vertices.push({ ...raw, elev_m: finite(raw.elev_m) ? raw.elev_m : gridValue(model, 'elev', raw),
      slope_deg: finite(raw.slope_deg) ? raw.slope_deg : gridValue(model, 'slope', raw) });
  }
  if (!vertices.length || vertices[0].d_m !== 0) return invalid('TRACK_ORIGIN');
  const total = vertices.at(-1).d_m;
  if (reverse) vertices.reverse().forEach(v => { v.d_m = total - v.d_m; });
  const heights = vertices.every(v => finite(v.elev_m));
  if (reverse && !heights && vertices.length > 1) return invalid('MISSING_REVERSE_HEIGHTS');
  const sections = vertices.slice(1).map((v, i) => ({ distanceM: v.d_m - vertices[i].d_m,
    slopeDeg: heights ? Math.atan2(v.elev_m - vertices[i].elev_m, v.d_m - vertices[i].d_m) * 180 / Math.PI : 0,
    roughnessM: 0 }));
  let times, source;
  if (heights) {
    try {
      // Extreme grades are blocked below; keep numeric timing inside the model's domain.
      const duration = estimateDuration(sections.map(s => ({ ...s, slopeDeg: Math.max(-89, Math.min(89, s.slopeDeg)) })),
        { model: { baseSpeedMps: a.walk_speed_kmh / 3.6 } });
      times = [0, ...duration.segments.map(s => s.endMinute)];
    } catch { return invalid('WALKING_MODEL'); }
    source = 'tobler';
  } else {
    // Contract: exported engine times refer to 1.5 km/h level-ground speed.
    const scale = (input.base_speed_kmh ?? 1.5) / a.walk_speed_kmh;
    if (!(scale > 0) || !finite(scale)) return invalid('WALKING_SPEED');
    times = vertices.map(v => v.t_min * scale);
    if (times[0] !== 0 || times.some((t, i) => !finite(t) || (i > 0 && t <= times[i - 1]))) {
      return invalid('MISSING_TRACK_TIMES');
    }
    source = 'engine';
  }
  const edges = sections.map((s, i) => {
    const slopes = [vertices[i].slope_deg, vertices[i + 1].slope_deg];
    const measured = slopes.every(x => finite(x) && x >= 0 && x <= 90);
    const maximum = input.max_slope_deg;
    const gradeBlocked = heights && Math.abs(s.slopeDeg) > a.slope_block_deg + 1e-10;
    const blocked = input.blocked === true || gradeBlocked
      || slopes.some(x => finite(x) && x > a.slope_block_deg)
      || (finite(maximum) && maximum > a.slope_block_deg);
    return blocked ? 'blocked' : measured || (finite(maximum) && maximum >= 0) ? 'known' : 'unknown';
  });
  const track = { ...input, vertices: vertices.map((v, i) => ({ ...v, t_min: times[i] })),
    length_m: total, minutes: times.at(-1) };
  const value = { track, times, edges, source };
  memo.set(input, { model, speed: a.walk_speed_kmh, reverse, value });
  return value;
}

function sample(p, distanceM) {
  const vs = p.track.vertices;
  const d = Math.max(0, Math.min(p.track.length_m, distanceM));
  let i = 1;
  while (i < vs.length && vs[i].d_m < d) i++;
  if (i === vs.length) return { ...vs.at(-1) };
  if (i === 1 && d === 0) return { ...vs[0] };
  const x = vs[i - 1], y = vs[i], u = (d - x.d_m) / (y.d_m - x.d_m);
  const lerp = key => finite(x[key]) && finite(y[key]) ? x[key] + u * (y[key] - x[key]) : null;
  return { lon: lerp('lon'), lat: lerp('lat'), d_m: d, t_min: lerp('t_min'), elev_m: lerp('elev_m'),
    slope_deg: finite(x.slope_deg) && finite(y.slope_deg) ? Math.max(x.slope_deg, y.slope_deg) : null };
}
function atMinute(p, tt) {
  const vs = p.track.vertices;
  if (tt <= 0) return { ...vs[0] };
  let i = 1;
  while (i < vs.length && vs[i].t_min < tt) i++;
  if (i === vs.length) return { ...vs.at(-1) };
  const x = vs[i - 1], y = vs[i], u = (tt - x.t_min) / (y.t_min - x.t_min);
  return sample(p, x.d_m + u * (y.d_m - x.d_m));
}
function terrain(p, lo = 0, hi = p.track.length_m) {
  const states = p.edges.filter((_, i) => p.track.vertices[i + 1].d_m > lo && p.track.vertices[i].d_m < hi);
  return states.includes('blocked') ? 'blocked' : states.includes('unknown') ? 'unknown' : 'known';
}
function slice(p, fromM, toM) {
  const lo = Math.min(fromM, toM), hi = Math.max(fromM, toM);
  let vs = [sample(p, lo), ...p.track.vertices.filter(v => v.d_m > lo && v.d_m < hi), sample(p, hi)];
  if (toM < fromM) vs.reverse();
  vs = vs.map(v => ({ ...v, d_m: Math.abs(v.d_m - fromM), t_min: 0 }));
  // Engine fallback is directional: retained only for an unchanged forward suffix.
  if (toM >= fromM) vs.forEach(v => { v.t_min = sample(p, v.d_m + fromM).t_min - sample(p, fromM).t_min; });
  return { ...p.track, vertices: vs, length_m: hi - lo, minutes: toM >= fromM
    ? sample(p, hi).t_min - sample(p, lo).t_min : null };
}
const protectedTrack = track => (track?.protected_m ?? track?.zone_m ?? 0) > 0;

function context(input) {
  const model = input.model ?? {}, plan = input.plan ?? {}, a = assumptions(model);
  const t = input.t ?? input.nowMinute ?? plan.t0 ?? 0;
  const phase = input.phase ?? (t < plan.tArr ? 'out' : t < plan.tLeave ? 'at' : t < plan.tHome ? 'ret' : 'home');
  const f = input.f ?? input.walkingFactor ?? (input.injured ? 1 / a.injury_factor : 1);
  const delay = input.remainingDelayMinutes ?? 0;
  const track = input.track ?? (phase === 'ret' || phase === 'home' ? plan.ret : plan.out);
  const p = profile(track, model);
  const tt = input.tt ?? input.trackMinute ?? (phase === 'at' || phase === 'home' ? p.track?.minutes ?? 0 : 0);
  const pos = p.error ? null : finite(input.distanceM) ? sample(p, input.distanceM) : atMinute(p, tt);
  const record = model.routes?.get(plan.n ?? plan.station?.n) ?? plan.route ?? {};
  return { ...input, model, plan, a, t, phase, f, delay, p, pos, record,
    error: !finite(t) || t < 0 || !(finite(f) || f === Infinity) || f <= 0 || !finite(delay) || delay < 0
      || !finite(a.life_support_min) || !finite(a.sunsetEva) ? 'CONTEXT' : null };
}
function limits(c) {
  const B = Math.min(c.a.life_support_min - c.t, c.a.sunsetEva - c.t);
  return { B, L: Math.min(60, B), by: B >= 60 ? '60-minute rule'
    : c.a.life_support_min <= c.a.sunsetEva ? 'life support' : 'sunset' };
}
function check(c, returnMinutes, travelMinutes = 0, known = 'known') {
  const arrival = c.t + travelMinutes + returnMinutes;
  const margins = { mission: c.a.life_support_min - arrival,
    sunset: c.a.sunsetEva - arrival, shelter: 60 - returnMinutes };
  if (c.f === Infinity && (returnMinutes === Infinity || travelMinutes === Infinity)) {
    return { ttb: null, returnMinutes, returnArrivalMinute: null, arrivalMinute: null,
      travelMinutes, margins, spare: null, stage: 'red',
      violations: ['SPEED_ZERO', ...(known === 'blocked' ? ['SLOPE_BLOCKED'] : [])], status: 'NO_GO' };
  }
  const violations = [];
  if (margins.mission < -1e-9) violations.push('MISSION_END');
  if (margins.sunset <= 1e-9) violations.push('SUNSET');
  if (margins.shelter < -1e-9) violations.push('SHELTER_LIMIT');
  if (known === 'blocked') violations.push('SLOPE_BLOCKED');
  const noData = known === 'unknown' || !finite(returnMinutes) || !finite(travelMinutes);
  const spare = noData ? null : Math.min(...Object.values(margins));
  const stage = violations.length ? 'red' : noData ? null
    : spare < c.a.caution_margin_min ? 'yellow' : 'green';
  return { ttb: finite(returnMinutes) ? returnMinutes : null, returnMinutes,
    returnArrivalMinute: finite(arrival) ? arrival : null, arrivalMinute: finite(arrival) ? arrival : null,
    travelMinutes, margins, spare, stage, violations,
    status: violations.length ? 'NO_GO' : noData ? 'NO_DATA' : 'GO' };
}
function optionsAtTarget(c, travelMinutes = 0) {
  const candidates = [{ track: c.record.ret ?? c.plan.ret, variant: 'safe' }];
  if (c.record.fastest?.ret && !c.record.fastest.same_as_safe) {
    candidates.push({ track: c.record.fastest.ret, variant: 'fastest' });
  }
  return candidates.map(option => {
    const p = profile(option.track, c.model);
    const result = p.error ? check(c, NaN, travelMinutes, 'unknown')
      : check(c, walkingMinutes(p.track.minutes, c.f) + (travelMinutes === 0 ? c.delay : 0), travelMinutes, terrain(p));
    return { ...result, ...option, track: p.track ?? option.track,
      requiresOverride: protectedTrack(option.track) && !c.overrideApproved, source: p.source ?? p.error };
  });
}
function choose(options) {
  return options.find(o => o.status === 'GO' && o.variant === 'safe')
    ?? options.filter(o => o.status === 'GO').sort((a, b) => a.returnMinutes - b.returnMinutes)[0]
    ?? options[0];
}
function immediate(c) {
  if (c.phase === 'home') return { ...check(c, 0), track: c.p.track, variant: 'safe' };
  if (c.phase === 'at') return choose(optionsAtTarget(c));
  if (c.p.error || !c.pos) return { ...check(c, c.p.error === 'UNREACHABLE' ? Infinity : NaN, 0, 'unknown'), source: c.p.error };
  if (c.phase === 'out' && c.pos.d_m === 0) return { ...check(c, c.delay),
    track: { ...c.p.track, vertices: [c.p.track.vertices[0]], length_m: 0, minutes: 0 }, variant: 'safe' };
  const raw = slice(c.p, c.pos.d_m, c.phase === 'out' ? 0 : c.p.track.length_m);
  const p = profile(raw, c.model);
  // Reversed geometry needs directed heights; zero t_min is not an engine-time fallback.
  const missingReverse = c.phase === 'out' && !raw.vertices.every(v => finite(v.elev_m));
  if (p.error || missingReverse) return { ...check(c, NaN, 0, 'unknown'), source: 'MISSING_RETURN_PROFILE' };
  return { ...check(c, c.delay + walkingMinutes(p.track.minutes, c.f), 0, terrain(p)),
    track: p.track, source: p.source, requiresOverride: false, protectedZone: protectedTrack(p.track),
    variant: c.which === 'allowed' || c.plan.variant === 'fastest' ? 'fastest' : 'safe' };
}

export function evaluateReturn(input) {
  const c = context(input), lim = limits(c);
  const result = c.error ? check(c, NaN, 0, 'unknown') : immediate(c);
  const outLeft = c.p.error || !c.pos ? NaN : walkingMinutes(c.p.track.minutes - c.pos.t_min, c.f);
  const ret = profile(c.plan.ret, c.model);
  const back = ret.error ? NaN : walkingMinutes(ret.track.minutes, c.f);
  const stay = c.phase === 'out' ? c.plan.stay ?? 0
    : c.stayRemainingMinutes ?? (finite(c.plan.tLeave) ? Math.max(0, c.plan.tLeave - c.t) : 0);
  const planned = c.phase === 'out' ? c.t + c.delay + outLeft + stay + back
    : c.phase === 'at' ? c.t + c.delay + stay + back : result.returnArrivalMinute;
  const near = c.pos && c.model.zones?.length ? zoneDistance(c.model, c.pos) : null;
  return { ...result, t: c.t, pos: c.pos, track: c.p.track ?? null, tt: c.pos?.t_min ?? 0,
    phase: c.phase, homeward: c.phase === 'ret' || c.phase === 'home', home: c.phase === 'home', at: c.phase === 'at',
    homeAt: finite(planned) ? planned : null, plannedHomeMinute: finite(planned) ? planned : null,
    L: lim.L, f: c.f, speedFactor: 1 / c.f, stopped: c.f === Infinity && result.ttb !== 0,
    which: c.which ?? (c.plan.variant === 'fastest' ? 'allowed' : 'penalized'), lim,
    ls: c.a.life_support_min - c.t, sun: c.a.sunsetEva - c.t,
    caution: c.a.caution_margin_min, dose: c.a.dose_rate_msv_per_day * Math.max(0, c.t - (c.plan.t0 ?? 0)) / 1440,
    zone: near ? { d: near.d, name: near.zone.name } : null,
    warning: near && near.d <= c.a.zone_warn_m ? 'ZONE_PROXIMITY' : null,
    rem: { m: c.p.error || !c.pos ? null : c.p.track.length_m - c.pos.d_m, min: finite(outLeft) ? outLeft : null },
    options: c.phase === 'at' ? optionsAtTarget(c) : [],
    action: result.status === 'NO_DATA' ? 'no-data' : result.stage === 'red' ? 'abort'
      : result.stage === 'yellow' ? 'return-now' : 'continue' };
}

// Returns a new motion leg; caller keeps its clock and passes state to the existing crew views.
export function returnCommand(input, type, { approveProtected = false, reason = '', preferredVariant = null } = {}) {
  if (!['return-now', 'abort'].includes(type)) throw new RangeError('Unknown return command');
  if (preferredVariant != null && !['safe', 'fastest'].includes(preferredVariant)) throw new RangeError('Unknown return variant');
  const c = context(input);
  if (c.error) return { accepted: false, reason: c.error };
  if (c.phase === 'home') return { accepted: true, state: { ...input, homeward: true }, track: c.p.track };
  if (c.phase === 'ret' && input.returnMode) {
    const escalate = type === 'abort' && input.returnMode !== 'abort';
    return { accepted: true, track: input.track,
      state: escalate ? { ...input, returnMode: 'abort' } : input, unchanged: !escalate,
      logEntry: escalate ? { type, t: c.t, reason, protected: protectedTrack(input.track) } : null };
  }
  let candidate;
  if (c.phase === 'at') {
    const options = optionsAtTarget(c);
    const available = options.filter(o => o.status !== 'NO_DATA' && !o.violations.includes('SLOPE_BLOCKED'))
      .sort((a, b) => a.track.minutes - b.track.minutes);
    candidate = type === 'abort'
      ? available.find(o => o.variant === preferredVariant) ?? available[0] : options[0];
  } else candidate = immediate(c);
  if (!candidate?.track || candidate.status === 'NO_DATA') return { accepted: false, reason: candidate?.source ?? 'NO_DATA' };
  if (candidate.violations.includes('SLOPE_BLOCKED')) return { accepted: false, reason: 'SLOPE_BLOCKED' };
  if (candidate.requiresOverride && !(approveProtected && typeof reason === 'string' && reason.trim())) {
    return { accepted: false, requiresOverride: true, candidate, reason: 'PROTECTED_OVERRIDE_REQUIRED' };
  }
  return { accepted: true, track: candidate.track, requiresOverride: false,
    state: { ...input, t: c.t, phase: candidate.track.minutes === 0 ? 'home' : 'ret', track: candidate.track, tt: 0, distanceM: 0,
      f: c.f, homeward: true, skipStay: true, returnMode: type,
      returnStartedAt: c.t, which: candidate.variant === 'fastest' ? 'allowed' : 'penalized',
      overrideApproved: c.overrideApproved || approveProtected },
    logEntry: { type, t: c.t, reason, protected: protectedTrack(candidate.track),
      variant: candidate.variant, requestedVariant: preferredVariant } };
}

// Both directions forecast travel from the crew to each future point plus its
// permitted way home, splitting edges at time-rule and caution boundaries.
export function returnLineSegments(input) {
  const c = context(input);
  const current = evaluateReturn(input);
  if (c.error || c.p.error || !c.pos) return { segments: [], endpoint: null, current, destinationReachable: false, status: current.status };
  if (c.phase === 'at' || c.phase === 'home') return { segments: [], endpoint: current, current,
    destinationReachable: current.status === 'GO', status: current.status };
  const p = c.p, length = p.track.length_m;
  const reverse = c.phase === 'out' ? profile(p.track, c.model, true) : null;
  const point = distanceM => {
    const v = sample(p, distanceM), travel = c.delay + walkingMinutes(v.t_min - c.pos.t_min, c.f);
    const back = c.phase === 'out' ? reverse.error ? NaN
      : walkingMinutes(reverse.track.minutes - sample(reverse, length - distanceM).t_min, c.f)
      : walkingMinutes(p.track.minutes - v.t_min, c.f);
    const known = c.phase === 'out' ? terrain(p, 0, distanceM) : terrain(p, c.pos.d_m, length);
    return { ...check(c, back, travel, known), pos: v, canSwitch: false };
  };
  const segments = [];
  for (let i = 1; i < p.track.vertices.length; i++) {
    const lo = Math.max(c.pos.d_m, p.track.vertices[i - 1].d_m), hi = p.track.vertices[i].d_m;
    if (hi <= lo) continue;
    const x = point(lo), y = point(hi), cuts = [0, 1];
    for (const key of ['mission', 'sunset', 'shelter']) for (const threshold of [0, c.a.caution_margin_min]) {
      const a = x.margins[key], b = y.margins[key];
      const u = (threshold - a) / (b - a);
      if (finite(u) && u > 1e-10 && u < 1 - 1e-10) cuts.push(u);
    }
    const sorted = [...new Set(cuts)].sort((a, b) => a - b);
    for (let k = 1; k < sorted.length; k++) {
      const from = lo + (hi - lo) * sorted[k - 1], to = lo + (hi - lo) * sorted[k];
      const at = point((from + to) / 2);
      segments.push({ from: sample(p, from), to: sample(p, to),
        kind: c.phase === 'out' ? 'outward' : 'homeward', stage: at.stage,
        color: RETURN_LINE_COLORS[at.stage ?? 'unknown'],
        spare: at.spare, margins: at.margins, violations: at.violations, status: at.status,
        travelMinutes: at.travelMinutes, returnMinutes: at.returnMinutes,
        arrivalMinute: at.arrivalMinute, requiresOverride: protectedTrack(p.track), source: reverse?.error ?? p.source });
    }
  }
  // Endpoint alternatives are discrete: never interpolate a shortcut into the approach edge.
  const end = point(length);
  const endpoint = c.phase === 'out' ? { ...choose(optionsAtTarget(c, end.travelMinutes)), canSwitch: true } : end;
  const destinationReachable = current.status === 'GO'
    && segments.every(s => s.stage === 'green' || s.stage === 'yellow') && endpoint.status === 'GO';
  // Also show the actual way home behind an outward-walking crew. Both colored
  // directions start at the current position; the habitat is not the color origin.
  const back = c.phase === 'out' ? immediate(c) : null;
  const homeward = back?.track && back.track.length_m > 0 ? returnLineSegments({ ...input,
    phase: 'ret', track: back.track, tt: 0, distanceM: 0 }).segments : [];
  return { track: p.track, segments: [...homeward, ...segments], endpoint, current, destinationReachable,
    status: segments.some(s => s.stage === 'red') ? 'NO_GO'
      : segments.some(s => s.stage == null) ? 'NO_DATA' : endpoint.status,
    unsafeApproach: !destinationReachable };
}

export function createReturnLine(model, plan) {
  return Object.freeze({
    evaluate: state => evaluateReturn({ model, plan, ...state }),
    segments: state => returnLineSegments({ model, plan, ...state }),
    command: (state, type, options) => returnCommand({ model, plan, ...state }, type, options),
  });
}
