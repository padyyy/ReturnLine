import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReturn, returnLineSegments, returnCommand, createReturnLine } from '../src/return-line.js';

const close = (actual, expected, epsilon = 1e-7) => assert.ok(
  Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

// Deliberately different outbound/return geometry and engine times: a consumer
// must not infer the return track by reversing the outbound track.
function track({ reverse = false, minutes = 24, length = 600, lat = -4.81, slope = 0 } = {}) {
  return {
    length_m: length, minutes, max_slope_deg: slope, max_ttb_min: minutes,
    vertices: [0, 0.5, 1].map(u => ({
      lon: 137.38 + (reverse ? 1 - u : u) * 0.01,
      lat: u === 0 || u === 1 ? -4.81 : lat,
      d_m: u * length, t_min: u * minutes,
      elev_m: -3600, slope_deg: slope,
    })),
  };
}

function fixture({ ls = 360, sunset = 521, out, ret, stay = 30 } = {}) {
  out ??= track();
  ret ??= { ...track({ reverse: true, minutes: 30, lat: -4.805 }),
    vertices: track({ reverse: true, minutes: 30, lat: -4.805 }).vertices.map(v => ({ ...v, elev_m: null })) };
  const station = { n: 1, name: 'Science stop', ...out.vertices.at(-1) };
  const plan = { n: 1, station, out, ret, t0: 0, stay,
    tLeave: out.minutes + stay, tHome: out.minutes + stay + ret.minutes };
  const model = { sc: { walk_speed_kmh: 1.5, life_support_min: ls, backup_min: 60,
    injury_factor: 0.5, caution_margin_min: 15, slope_block_deg: 20,
    eva_start_lmst: '09:00', sunset_lmst: '17:41' },
    ls, sunsetEva: sunset, habitat: out.vertices[0],
    routes: new Map([[1, { station: 1, out, ret }]]) };
  return { model, plan, t: 100, phase: 'at', tt: out.minutes };
}

test('compat: station uses its distinct native return geometry and engine minutes', () => {
  const c = { ...fixture(), t: 40 };
  const before = structuredClone(c.plan);
  const v = evaluateReturn(c);
  close(v.ttb, 30);
  close(v.returnArrivalMinute, 70);
  close(v.homeAt, c.plan.tHome);
  assert.equal(v.stage, 'green');
  assert.equal(v.status, 'GO');
  assert.deepEqual(c.plan, before);
});

test('compat: remaining native return time updates the forecast arrival', () => {
  const c = fixture();
  const v = evaluateReturn({ ...c, phase: 'ret', track: c.plan.ret, tt: 10, t: 110 });
  close(v.ttb, 20);
  close(v.returnArrivalMinute, 130);
  close(v.homeAt, 130);
});

test('compat: injury doubles future return time and delay counts once', () => {
  const c = fixture();
  const v = evaluateReturn({ ...c, injured: true, remainingDelayMinutes: 3 });
  close(v.f, 2);
  close(v.ttb, 63);
  close(v.returnArrivalMinute, 163);
  assert.equal(v.stage, 'red');
  const explicit = evaluateReturn({ ...c, f: 2, remainingDelayMinutes: 3 });
  close(explicit.ttb, v.ttb);
});

test('compat: backup is separate from usable life support, not subtracted twice', () => {
  const c = fixture();
  const v = evaluateReturn({ ...c, t: 320 });
  close(v.L, 40);
  close(v.spare, 10);
  assert.equal(v.stage, 'yellow');
  assert.equal(v.status, 'GO');
});

test('compat: exact shelter boundary remains feasible and exceeding it is red', () => {
  const c = fixture({ ret: track({ reverse: true, minutes: 60, length: 1500 }) });
  const exact = evaluateReturn(c);
  close(exact.spare, 0);
  assert.equal(exact.stage, 'yellow');
  const late = evaluateReturn({ ...c, remainingDelayMinutes: 0.01 });
  assert.equal(late.stage, 'red');
  assert.equal(late.status, 'NO_GO');
});

test('compat: the tighter life-support or sunset window controls the margin', () => {
  const life = evaluateReturn({ ...fixture(), t: 331 });
  close(life.spare, -1);
  assert.equal(life.stage, 'red');
  const c = fixture({ sunset: 120 });
  const sunset = evaluateReturn(c);
  close(sunset.L, 20);
  close(sunset.spare, -10);
  assert.equal(sunset.stage, 'red');
});

test('compat: return-now at a station starts the native homeward track', () => {
  const c = fixture();
  const command = returnCommand(c, 'return-now');
  assert.equal(command.accepted, true);
  assert.equal(command.state.phase, 'ret');
  assert.equal(command.state.homeward, true);
  close(command.state.t, c.t);
  close(command.state.tt, 0);
  close(command.state.distanceM, 0);
  assert.deepEqual(command.track.vertices.map(v => [v.lon, v.lat]),
    c.plan.ret.vertices.map(v => [v.lon, v.lat]));
});

test('compat: mid-edge return command turns back on the occupied geometry', () => {
  const c = fixture();
  const command = returnCommand({ ...c, phase: 'out', t: 6, tt: 6,
    track: c.plan.out }, 'return-now');
  assert.equal(command.accepted, true);
  const vs = command.track.vertices;
  close(vs[0].lon, 137.3825);
  close(vs.at(-1).lon, c.model.habitat.lon);
  assert.ok(vs.every(v => v.lon <= 137.3825 + 1e-10));
  assert.ok(vs.every(v => v.lat === -4.81));
});

test('compat: repeated return commands retain remaining geometry and current position', () => {
  const c = fixture();
  const first = returnCommand({ ...c, phase: 'out', t: 6, tt: 6,
    track: c.plan.out }, 'return-now');
  const again = returnCommand({ ...c, ...first.state }, 'return-now');
  assert.equal(again.accepted, true);
  assert.deepEqual(again.track.vertices, first.track.vertices);
  close(again.state.t, first.state.t);
});

test('compat: wrapper delegates without introducing another simulation clock', () => {
  const c = fixture();
  const api = createReturnLine(c.model, c.plan);
  const state = { t: c.t, phase: c.phase, tt: c.tt };
  assert.deepEqual(api.evaluate(state), evaluateReturn(c));
  assert.deepEqual(api.segments(state), returnLineSegments(c));
  assert.deepEqual(api.command(state, 'return-now'), returnCommand(c, 'return-now'));
  assert.equal(state.t, 100);
});

test('compat: slope limit allows exactly 20 degrees and blocks greater values', () => {
  const exact = fixture({ ret: track({ reverse: true, slope: 20 }) });
  assert.equal(evaluateReturn(exact).status, 'GO');
  const steep = fixture({ ret: track({ reverse: true, slope: 20.01 }) });
  const result = evaluateReturn(steep);
  assert.equal(result.status, 'NO_GO');
  assert.equal(result.stage, 'red');
});

test('compat: route forecast splits mission deadline inside an edge', () => {
  const c = fixture({ ls: 80, out: track({ length: 1500, minutes: 60 }),
    ret: track({ reverse: true, length: 1500, minutes: 60 }) });
  const result = returnLineSegments({ ...c, t: 0, phase: 'out', tt: 0 });
  assert.ok(result.segments.some(s => Math.abs(s.to.d_m - 1000) < 1e-7),
    '40 minutes out plus 40 home reaches the mission deadline at 1000 metres');
  assert.ok(result.segments.some(s => s.stage === 'red'));
  assert.equal(result.destinationReachable, false);
});

test('compat: shelter caution crossing is split inside an edge', () => {
  const c = fixture({ out: track({ length: 1500, minutes: 60 }),
    ret: track({ reverse: true, length: 1500, minutes: 60 }) });
  const result = returnLineSegments({ ...c, t: 0, phase: 'out', tt: 0 });
  assert.ok(result.segments.some(s => Math.abs(s.to.d_m - 1125) < 1e-7),
    '45 minutes home leaves exactly 15 minutes under the shelter limit');
  assert.ok(result.segments.some(s => s.stage === 'green'));
  assert.ok(result.segments.some(s => s.stage === 'yellow'));
});

test('compat: homeward point colors include travel to the point, keeping the same tight sunset margin', () => {
  const c=fixture({sunset:80,ret:track({reverse:true,length:1500,minutes:60})});
  const line=returnLineSegments({...c,t:19,phase:'ret',track:c.plan.ret,tt:0});
  assert.equal(line.current.stage,'yellow');
  assert.ok(line.segments.length);
  assert.ok(line.segments.every(s=>s.stage==='yellow'));
  for(const s of line.segments){close(s.arrivalMinute,79);close(s.margins.sunset,1);}
  const expired=returnLineSegments({...c,t:20,phase:'ret',track:c.plan.ret,tt:0});
  assert.ok(expired.segments.every(s=>s.stage==='red'));
});

test('compat: protected ABORT at a target needs approval and an explicit reason', () => {
  const c = fixture();
  const fastest = { ...track({ reverse: true, minutes: 16, length: 400, lat: -4.807 }),
    protected_m: 100 };
  c.model.routes.get(1).fastest = { ret: fastest, same_as_safe: false };
  const unapproved = returnCommand(c, 'abort');
  assert.equal(unapproved.accepted, false);
  assert.equal(unapproved.requiresOverride, true);
  assert.equal(returnCommand(c, 'abort', { approveProtected: true }).accepted, false);
  const approved = returnCommand(c, 'abort', { approveProtected: true, reason: 'Crew injury' });
  assert.equal(approved.accepted, true);
  assert.equal(approved.state.returnMode, 'abort');
  assert.equal(approved.state.which, 'allowed');
  assert.equal(approved.state.overrideApproved, true);
  assert.deepEqual(approved.track.vertices.map(v => [v.lon, v.lat]),
    fastest.vertices.map(v => [v.lon, v.lat]));
});

test('compat: Injury can explicitly choose the prepared alternative instead of reselecting the normal return', () => {
  const c = fixture();
  const alternative = { ...track({reverse:true,minutes:40,length:1000,lat:-4.809}), protected_m:100 };
  c.model.routes.get(1).fastest = {ret:alternative,same_as_safe:false};
  const generic = returnCommand(c,'abort');
  assert.equal(generic.state.which,'penalized'); // default ABORT reselects normal 30-minute route
  assert.equal(returnCommand(c,'abort',{preferredVariant:'fastest'}).requiresOverride,true);
  const injury = returnCommand(c,'abort',{preferredVariant:'fastest',approveProtected:true,reason:'Crew injury at station'});
  assert.equal(injury.accepted,true);
  assert.equal(injury.state.which,'allowed'); close(injury.track.minutes,40);
  assert.equal(injury.logEntry.requestedVariant,'fastest');
  assert.deepEqual(injury.track.vertices.map(v=>[v.lon,v.lat]),alternative.vertices.map(v=>[v.lon,v.lat]));
});

test('compat: requesting the target alternative cannot change geometry during walking', () => {
  const c = fixture();
  c.model.routes.get(1).fastest = {ret:track({reverse:true,length:100,minutes:4}),same_as_safe:false};
  const command = returnCommand({...c,t:6,phase:'out',track:c.plan.out,tt:6},'abort',
    {preferredVariant:'fastest',approveProtected:true,reason:'Crew injury'});
  assert.equal(command.accepted,true);
  close(command.track.vertices[0].lon,137.3825);
  close(command.track.vertices.at(-1).lon,c.model.habitat.lon);
  close(command.track.minutes,6);
});

test('compat: ABORT underway cannot teleport to a faster return prepared at the target', () => {
  const c = fixture();
  c.model.routes.get(1).fastest = {
    ret: { ...track({ reverse: true, minutes: 4, length: 100, lat: -4.807 }), protected_m: 100 },
    same_as_safe: false,
  };
  const command = returnCommand({ ...c, t: 6, phase: 'out', tt: 6,
    track: c.plan.out }, 'abort', { approveProtected: true, reason: 'Crew injury' });
  assert.equal(command.accepted, true);
  close(command.track.vertices[0].lon, 137.3825);
  close(command.track.vertices.at(-1).lon, c.model.habitat.lon);
  assert.ok(command.track.vertices.every(v => v.lat === -4.81));
  assert.ok(command.track.vertices.every(v => v.lon <= 137.3825 + 1e-10));
});

test('compat: repeated commands do not reset a moving return clock or log twice', () => {
  const c = fixture();
  const first = returnCommand({ ...c, phase: 'out', t: 12, tt: 12, track: c.plan.out }, 'return-now');
  const moving = { ...first.state, t: 14, tt: 2, distanceM: 50 };
  const again = returnCommand(moving, 'return-now');
  assert.equal(again.state, moving);
  assert.equal(again.logEntry, null);
  close(again.state.returnStartedAt, 12);
  const abort = returnCommand(moving, 'abort');
  assert.equal(abort.state.track, moving.track);
  close(abort.state.tt, 2);
  close(abort.state.returnStartedAt, 12);
  assert.equal(abort.state.returnMode, 'abort');
});

test('compat: return at the outbound origin stays at habitat', () => {
  const c = fixture();
  const result = returnCommand({ ...c, phase: 'out', t: 0, tt: 0 }, 'return-now');
  assert.equal(result.accepted, true);
  assert.equal(result.state.phase, 'home');
  close(result.track.minutes, 0);
  close(result.track.length_m, 0);
});

test('compat: current accident delay has its own consistent safety status', () => {
  const c = fixture({ ret: track({ reverse: true, length: 1250, minutes: 50 }) });
  const context = { ...c, phase: 'ret', track: c.plan.ret, tt: 0, remainingDelayMinutes: 15 };
  const v = evaluateReturn(context), line = returnLineSegments(context);
  assert.equal(v.stage, 'red');
  assert.equal(line.current.stage, v.stage);
  assert.equal(line.destinationReachable, false);
});

test('compat: a green target shortcut cannot hide its unsafe approach', () => {
  const c = fixture({ ls: 80, out: track({ length: 1500, minutes: 60 }),
    ret: track({ reverse: true, length: 1500, minutes: 60 }) });
  c.model.routes.get(1).fastest = { ret: { ...track({ reverse: true, length: 100, minutes: 4 }), protected_m: 50 } };
  const line = returnLineSegments({ ...c, t: 0, phase: 'out', tt: 0 });
  assert.equal(line.endpoint.stage, 'green');
  assert.equal(line.endpoint.requiresOverride, true);
  assert.equal(line.destinationReachable, false);
  assert.equal(line.segments.at(-1).stage, 'red');
});

test('compat: missing terrain is NO_DATA, while engine pointer duplicates are accepted', () => {
  const c = fixture();
  const missing = { ...c.plan.ret, max_slope_deg: undefined,
    vertices: c.plan.ret.vertices.map(v => ({ ...v, slope_deg: null })) };
  assert.equal(evaluateReturn({ ...c, plan: { ...c.plan, ret: missing }, model: { ...c.model, routes: new Map() } }).status, 'NO_DATA');
  const pointer = { ...c.plan.ret, vertices: [...c.plan.ret.vertices, { ...c.plan.ret.vertices.at(-1) }] };
  const v = evaluateReturn({ ...c, phase: 'ret', track: pointer, tt: 10 });
  close(v.ttb, 20);
  assert.equal(v.stage, 'green');
});

test('compat: fallback assumptions use 17:41 LMST and never plan the backup hour', () => {
  const c = fixture();
  const model = { routes: c.model.routes, sc: {} };
  const result = evaluateReturn({ ...c, model, t: 330 });
  close(result.ls, 30);
  close(result.sun, 191); // 17:41 - 09:00 = 521 minutes
  close(result.L, 30);
});
