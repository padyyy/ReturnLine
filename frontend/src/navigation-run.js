// Motion state for nav.js; the existing RAF owns the clock. No route search or DOM.
import { evaluateReturn, returnLineSegments, returnCommand } from './return-line.js';

export function createNavigationRun(model, originalPlan) {
  const initial = { model, plan: originalPlan, t: originalPlan.t0, phase: 'out', tt: 0 };
  const out = evaluateReturn(initial).track;
  const ret = evaluateReturn({ ...initial, phase: 'ret', track: originalPlan.ret }).track;
  if (!out || !ret) throw new Error('Prepared route data unavailable');
  const plan = { ...originalPlan, out, ret, tArr: originalPlan.t0 + out.minutes,
    tLeave: originalPlan.t0 + out.minutes + originalPlan.stay,
    tHome: originalPlan.t0 + out.minutes + originalPlan.stay + ret.minutes };
  let state = { t: plan.t0, phase: 'out', track: out, tt: 0, f: 1,
    remainingDelayMinutes: 0, stayRemainingMinutes: plan.stay,
    which: plan.variant === 'fastest' ? 'allowed' : 'penalized',
    overrideApproved: plan.variant === 'fastest' || (plan.protM ?? 0) > 0 };
  const log = [];
  let injured = false, speedFactor = 1, injuryReturn = null;
  const canTriggerInjury = () => state.phase !== 'home'
    && (!injured || (state.phase === 'at' && injuryReturn == null));
  const context = () => ({ model, plan, ...state });
  const snapshot = () => ({ ...state, injured, speedFactor,
    canTriggerInjury: canTriggerInjury(),
    injuryReturn: injuryReturn ? { ...injuryReturn } : null, log: log.map(e => ({ ...e })) });
  function transition() {
    if (state.phase === 'out' && state.tt >= out.minutes - 1e-10) {
      state.tt = out.minutes;
      state.phase = 'at';
      log.push({ t: state.t, type: 'station-arrived' });
    }
    if (state.phase === 'at' && state.stayRemainingMinutes <= 1e-10) {
      state = { ...state, phase: 'ret', track: ret, tt: 0, stayRemainingMinutes: 0 };
      log.push({ t: state.t, type: 'planned-return-started' });
    }
    if (state.phase === 'ret' && state.tt >= state.track.minutes - 1e-10) {
      state.tt = state.track.minutes;
      state.phase = 'home';
      log.push({ t: state.t, type: 'home-arrived' });
    }
  }
  function advance(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) throw new RangeError('Invalid clock delta');
    let left = minutes;
    transition();
    while (left > 1e-10 && state.phase !== 'home') {
      const delay = Math.min(left, state.remainingDelayMinutes);
      state.remainingDelayMinutes -= delay; state.t += delay; left -= delay;
      if (left <= 1e-10) break;
      const waiting = state.phase === 'at';
      const needed = waiting ? state.stayRemainingMinutes : (state.track.minutes - state.tt) * state.f;
      const dt = Math.min(left, Math.max(0, needed));
      if (waiting) state.stayRemainingMinutes -= dt;
      else state.tt += dt / state.f;
      state.t += dt; left -= dt;
      transition();
      if (dt === 0 && needed > 1e-10) throw new Error('Cannot advance navigation');
    }
    return snapshot();
  }
  function setSpeedFactor(factor) {
    if (!Number.isFinite(factor) || factor < 0 || factor > 1) throw new RangeError('Invalid speed factor');
    if (factor === speedFactor || state.phase === 'home') return snapshot();
    speedFactor = factor;
    state.f = factor === 0 ? Infinity : 1 / factor;
    log.push({ t: state.t, type: 'speed-changed', speedFactor: factor });
    return snapshot();
  }
  function injury() {
    if (!canTriggerInjury()) return snapshot();
    injured = true;
    log.push({ t: state.t, type: 'injury', speedFactor, phase: state.phase });
    if (state.phase === 'at') {
      // The user explicitly authorizes the prepared protected shortcut for an
      // injury at the station. No search and no change of geometry mid-leg.
      const result = command('abort', { preferredVariant: 'fastest',
        approveProtected: true, reason: 'Crew injury at station' });
      if (!result.accepted) {
        injuryReturn = { accepted: false, reason: result.reason };
        log.push({ t: state.t, type: 'auto-return-blocked', reason: result.reason });
      } else {
        const sameGeometry = ret.vertices.length === result.track.vertices.length
          && ret.vertices.every((v, i) => v.lon === result.track.vertices[i].lon && v.lat === result.track.vertices[i].lat);
        injuryReturn = { accepted: true, variant: result.state.which === 'allowed' ? 'fastest' : 'safe',
          protected: result.logEntry?.protected ?? false, switched: !sameGeometry,
          previousNominalMinutes: ret.minutes, selectedNominalMinutes: result.track.minutes };
      }
    }
    return snapshot();
  }
  function command(type, options) {
    const ctx = context();
    if (state.phase === 'at' && type === 'abort' && plan.variant !== 'fastest') ctx.overrideApproved = false;
    const result = returnCommand(ctx, type, options);
    if (!result.accepted) return result;
    state = { ...state, ...result.state, stayRemainingMinutes: 0 };
    // Never keep a stale distance anchor: progress is owned by nominal track time.
    delete state.distanceM;
    if (result.logEntry) log.push({ ...result.logEntry });
    transition();
    return result;
  }
  function view() {
    return { ...evaluateReturn({ ...context(), stayRemainingMinutes: state.stayRemainingMinutes }),
      injured, canTriggerInjury: canTriggerInjury(), injuryReturn: injuryReturn ? { ...injuryReturn } : null };
  }
  function colors() {
    // At a station the outward track is finished. Preview the chosen homeward
    // geometry instead of returning an empty list of colored route sections.
    const ctx = context();
    return returnLineSegments(state.phase === 'at'
      ? { ...ctx, phase: 'ret', track: ret, tt: 0, stayRemainingMinutes: 0 }
      : ctx);
  }
  return { plan, snapshot, advance, injury, setSpeedFactor, command, view, colors };
}
