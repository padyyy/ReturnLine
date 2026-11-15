import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNavigationRun } from '../src/navigation-run.js';

function fixture({ mission = 360, stay = 15, length = 600, injuryFactor = .5 } = {}) {
  const track = (length, reverse = false) => ({ length_m: length, minutes: length / 25,
    max_slope_deg: 0, vertices: [0, .5, 1].map(u => ({ lon: 137 + (reverse ? 1-u : u) / 100,
      lat: -4, d_m: u * length, t_min: u * length / 25, elev_m: -3600, slope_deg: 0 })) });
  const out = track(length), ret = track(length, true);
  const fastest = { ret: { ...track(length * 2 / 3, true), protected_m: 100 } };
  const model = { ls: mission, sunsetEva: 521, sc: { injury_factor: injuryFactor, walk_speed_kmh: 1.5 },
    routes: new Map([[1, { out, ret, fastest }]]) };
  const plan = { n: 1, station: { n: 1, name: 'Test' }, out, ret, t0: 0, stay, variant: 'safe' };
  return createNavigationRun(model, plan);
}
const close = (x,y) => assert.ok(Math.abs(x-y)<1e-8, `${x} != ${y}`);
function loadedModel() {
  const data=JSON.parse(readFileSync(new URL('../public/data/routes.json',import.meta.url)));
  const sc=JSON.parse(readFileSync(new URL('../public/data/scenario.json',import.meta.url)));
  const minute=s=>s.split(':').reduce((h,m)=>h*60+Number(m),0);
  return {sc,ls:sc.life_support_min,sunsetEva:minute(sc.sunset_lmst)-minute(sc.eva_start_lmst),
    routes:new Map(data.stations.map(r=>[r.station,r]))};
}

test('walking speed 0.1 changes timing without setting injury or moving the crew', () => {
  const run = fixture({ injuryFactor: .1 }); run.advance(10);
  const before = run.view(); run.setSpeedFactor(.1);
  close(run.view().ttb, before.ttb * 10);
  close(run.view().pos.lon, before.pos.lon);
  close(run.snapshot().f, 10);
  assert.equal(run.snapshot().injured, false);
  assert.equal(run.view().stage, 'red');
  run.advance(1); close(run.snapshot().tt, 10.1);
});

test('walking speed preserves current position and changes future ETA/motion', () => {
  const run = fixture(); run.advance(5);
  const before = run.view(); run.setSpeedFactor(.5);
  close(run.view().pos.lon, before.pos.lon);
  close(run.view().homeAt, 106);
  run.advance(5); close(run.snapshot().tt, 7.5);
  const returnStart = run.view().pos.lon;
  assert.equal(run.command('return-now').accepted, true);
  close(run.view().pos.lon, returnStart);
  close(run.view().returnArrivalMinute, 25);
  run.advance(1000);
  assert.equal(run.snapshot().phase, 'home'); close(run.snapshot().t,25);
});

test('planned navigation handles outward/stay/return boundaries even in one tick', () => {
  const run = fixture(); run.advance(24);
  assert.equal(run.snapshot().phase,'at');
  run.advance(15); assert.equal(run.snapshot().phase,'ret');
  run.advance(24); assert.equal(run.snapshot().phase,'home');
  close(run.snapshot().t,63);
  const other=fixture();other.advance(1000);close(other.snapshot().t,63);
});

test('repeat Return now and escalation to Abort never restart or reverse an active return', () => {
  const run=fixture();run.advance(10);run.command('return-now');run.advance(2);
  const before=run.snapshot(), pos=run.view().pos;
  assert.equal(run.command('return-now').unchanged,true);
  run.command('abort');
  close(run.snapshot().tt,before.tt);close(run.snapshot().returnStartedAt,before.returnStartedAt);
  close(run.view().pos.lon,pos.lon);
  run.advance(100);close(run.snapshot().t,20);
  assert.equal(run.snapshot().log.filter(x=>x.type==='return-now').length,1);
});

test('protected alternative requires explicit approval at a target, never switches midwalk', () => {
  const run=fixture({mission:100,stay:60});run.advance(54);
  assert.equal(run.command('abort').requiresOverride,true);
  assert.equal(run.command('abort',{approveProtected:true,reason:'Crew injury'}).accepted,true);
  close(run.view().returnArrivalMinute,70);
  run.advance(100);close(run.snapshot().t,70);
  const walking=fixture();walking.advance(5);walking.setSpeedFactor(.5);walking.injury();walking.command('abort');
  close(walking.view().returnArrivalMinute,15); // retrace 125 m, not a target shortcut
});

test('a repeated injury is idempotent and return colors are supplied to real views', () => {
  const run=fixture();run.advance(2);run.setSpeedFactor(.5);run.injury();run.advance(1);
  const before=run.snapshot();run.injury();
  close(run.snapshot().f,2);close(run.snapshot().tt,before.tt);
  assert.equal(run.snapshot().log.filter(e => e.type === 'injury').length,1);
  run.setSpeedFactor(1); assert.equal(run.snapshot().injured, true);
  const line=run.colors();assert.ok(line.segments.length);
  assert.ok(line.segments.every(s=>s.color&&s.from.lon&&s.to.lon));
});

test('short routes stay green with ample headroom while the same speed turns a tight run red', () => {
  const early = fixture({ length: 300, stay: 0 });
  early.advance(6); const before = early.view(); early.setSpeedFactor(.5);
  close(early.view().ttb, before.ttb * 2);
  assert.ok(early.colors().segments.every(s => s.stage === 'green'));
  const tight = fixture({ length: 300, stay: 0, mission: 30 });
  tight.advance(6);
  assert.ok(tight.colors().segments.every(s => s.stage !== 'red'));
  tight.setSpeedFactor(.5);
  assert.ok(tight.colors().segments.some(s => s.stage === 'red'));
  assert.equal(tight.colors().destinationReachable, false);
});

test('injury at a station ends work and immediately takes the prepared protected shortcut', () => {
  const run = fixture({ stay: 60 }); run.advance(24);
  assert.equal(run.snapshot().phase, 'at');
  assert.ok(run.colors().segments.length);
  assert.ok(run.colors().segments.every(s => s.stage === 'green'));
  const position = run.view().pos, time = run.snapshot().t;
  const normal = run.snapshot().track;
  run.setSpeedFactor(.5);
  assert.equal(run.snapshot().phase, 'at'); // speed alone never aborts work
  assert.equal(run.snapshot().track, normal);
  assert.equal(run.snapshot().injured, false);
  run.injury();
  assert.ok(run.colors().segments.every(s => s.stage === 'green'));
  close(run.view().ttb, 32); close(run.view().pos.lon, position.lon);
  assert.equal(run.snapshot().phase, 'ret'); close(run.snapshot().t, time);
  assert.equal(run.snapshot().stayRemainingMinutes, 0);
  close(run.snapshot().speedFactor,.5);
  assert.equal(run.snapshot().injured, true);
  assert.equal(run.view().injuryReturn.variant,'fastest');
  const entry = run.snapshot().log.at(-1);
  assert.equal(entry.type, 'abort'); assert.equal(entry.protected, true);
  assert.equal(entry.reason, 'Crew injury at station');
  run.advance(1); const active = run.snapshot().track;
  run.setSpeedFactor(.25);
  assert.equal(run.snapshot().track, active); // no second route switch after departure
});

test('Return now splits homeward red, yellow and green stages from the moving crew position', () => {
  const run = fixture({ injuryFactor: .1 });
  run.advance(10); run.setSpeedFactor(.1); run.command('return-now');
  const arrival = run.view().returnArrivalMinute;
  close(run.view().ttb, 100); assert.equal(run.view().stage, 'red');
  const initialLine = run.colors();
  assert.deepEqual([...new Set(initialLine.segments.map(s=>s.stage))],['red','yellow','green']);
  assert.ok(initialLine.segments.some(s=>Math.abs(s.to.d_m-100)<1e-8)); // 60 min remain
  assert.ok(initialLine.segments.some(s=>Math.abs(s.to.d_m-137.5)<1e-8)); // 45 min remain
  assert.ok(initialLine.segments.every(s=>s.kind==='homeward'));
  initialLine.segments.forEach(s=>close(s.arrivalMinute,arrival));
  run.advance(41);
  close(run.view().ttb, 59); assert.equal(run.view().stage, 'yellow');
  const movingLine=run.colors();
  assert.deepEqual([...new Set(movingLine.segments.map(s=>s.stage))],['yellow','green']);
  close(movingLine.segments[0].from.d_m,run.view().pos.d_m);
  close(movingLine.segments[0].from.lon,run.view().pos.lon);
  run.advance(15);
  close(run.view().ttb, 44); assert.equal(run.view().stage, 'green');
  assert.ok(run.colors().segments.every(s => s.stage === 'green'));
  close(run.view().returnArrivalMinute, arrival);
});

test('outward colors include a homeward preview starting at the actual crew position', () => {
  const run = fixture(); run.advance(8);
  const pos = run.view().pos, before = run.snapshot();
  const home = run.colors().segments.filter(s => s.kind === 'homeward');
  assert.ok(home.length); close(home[0].from.lon, pos.lon);
  close(home.at(-1).to.lon, 137);
  assert.ok(home.every(s => s.stage === 'green'));
  const forward = run.colors().segments.filter(s => s.kind === 'outward');
  close(forward[0].from.lon, pos.lon);
  close(run.snapshot().tt, before.tt); assert.equal(run.snapshot().track, before.track);
});

test('speed adjustments are absolute, preserve position, and zero stops motion while time continues', () => {
  const run = fixture(); run.advance(8);
  const pos = run.view().pos;
  run.setSpeedFactor(.5); close(run.view().ttb, 16);
  run.setSpeedFactor(.25); close(run.view().ttb, 32);
  close(run.view().pos.lon, pos.lon);
  run.setSpeedFactor(0);
  assert.equal(run.view().stopped, true);
  assert.equal(run.view().status, 'NO_GO');
  assert.deepEqual(run.view().violations, ['SPEED_ZERO']);
  assert.equal(run.view().returnArrivalMinute, null);
  assert.ok(run.colors().segments.every(s => s.stage === 'red'));
  run.advance(10); close(run.view().t, 18); close(run.view().pos.lon, pos.lon);
  assert.equal(run.command('return-now').accepted, true);
  run.advance(5); close(run.view().pos.lon, pos.lon);
  run.setSpeedFactor(.5);
  close(run.view().ttb, 16); close(run.view().returnArrivalMinute, 39);
  assert.ok(run.colors().segments.every(s => s.stage === 'green'));
  run.setSpeedFactor(1); close(run.view().ttb, 8);
  for (const factor of [-.1, 1.1, NaN, Infinity]) assert.throws(() => run.setSpeedFactor(factor), RangeError);
});

test('speed zero at the station only stops motion; a separate injury selects the fastest return', () => {
  const run = fixture({stay:60}); run.advance(30);
  const pos = run.view().pos;
  run.setSpeedFactor(0);
  assert.equal(run.snapshot().phase, 'at');
  assert.equal(run.snapshot().injured, false);
  run.injury();
  assert.equal(run.snapshot().phase, 'ret');
  close(run.snapshot().track.length_m, 400);
  assert.equal(run.snapshot().which, 'allowed');
  run.advance(5); close(run.view().pos.lon, pos.lon);
  run.setSpeedFactor(.5); close(run.view().ttb,32);
});

test('loaded station 3 uses its actual prepared fastest return after injury at the target', () => {
  const model=loadedModel();
  const r = model.routes.get(3);
  const run = createNavigationRun(model, { n: 3, station: {n:3}, out:r.out, ret:r.ret,
    t0:0, stay:30, variant:'safe' });
  run.advance(run.plan.out.minutes + 5);
  const before = run.view(), pos = before.pos;
  const fastest = before.options.find(o => o.variant === 'fastest');
  run.setSpeedFactor(.5);
  assert.equal(run.snapshot().phase, 'at');
  run.injury();
  assert.equal(run.snapshot().phase, 'ret'); assert.equal(run.snapshot().which, 'allowed');
  close(run.view().ttb, fastest.returnMinutes * 2);
  close(run.view().pos.lon,pos.lon); close(run.view().pos.lat,pos.lat);
  assert.ok(run.colors().segments.every(s => s.stage === 'green'));
  assert.equal(run.snapshot().log.at(-1).protected, true);
  const coords = track => track.vertices.map(v => [v.lon,v.lat]);
  assert.deepEqual(coords(run.snapshot().track), coords(r.fastest.ret));
  assert.notDeepEqual(coords(run.snapshot().track), coords(r.ret));
  assert.equal(run.view().injuryReturn.switched, true);
  const chosen = run.snapshot().track;
  run.setSpeedFactor(1);
  assert.equal(run.snapshot().track, chosen);
  assert.equal(run.snapshot().injured, true);
});

test('reaching shelter eventually does not erase a missed mission deadline', () => {
  const run = fixture({ mission: 60, injuryFactor: .1 });
  run.advance(10); run.setSpeedFactor(.1); run.command('return-now');
  close(run.view().margins.mission, -50);
  run.advance(61);
  close(run.view().ttb, 39);
  assert.ok(run.view().margins.shelter > 15);
  close(run.view().margins.mission, -50);
  assert.equal(run.view().stage, 'red');
  assert.deepEqual(run.view().violations, ['MISSION_END']);
  assert.ok(run.colors().segments.every(s => s.stage === 'red'));
});

test('injury at normal walking speed is independent and still starts the faster return', () => {
  const run = fixture({stay:60}); run.advance(30);
  const before = run.view(); run.injury();
  assert.equal(run.snapshot().injured, true);
  assert.equal(run.snapshot().phase, 'ret');
  close(run.snapshot().speedFactor,1); close(run.snapshot().f,1);
  close(run.view().ttb,16); close(run.view().pos.lon,before.pos.lon);
  close(run.view().injuryReturn.previousNominalMinutes,24);
  close(run.view().injuryReturn.selectedNominalMinutes,16);
});

test('injury while already walking home preserves the chosen geometry and speed', () => {
  const run=fixture(); run.advance(10); run.command('return-now'); run.advance(2);
  const before = run.snapshot(), pos=run.view().pos;
  run.injury();
  assert.equal(run.snapshot().track,before.track);
  close(run.snapshot().tt,before.tt); close(run.snapshot().f,before.f);
  close(run.view().pos.lon,pos.lon);
  assert.equal(run.snapshot().injuryReturn,null);
});

test('an earlier injury does not prevent the Injury trigger at the target from selecting the alternative', () => {
  const run=fixture({stay:60});
  run.advance(5); run.injury();
  assert.equal(run.snapshot().canTriggerInjury,false);
  run.advance(19);
  assert.equal(run.snapshot().phase,'at');
  assert.equal(run.snapshot().canTriggerInjury,true);
  run.injury();
  assert.equal(run.snapshot().phase,'ret');
  assert.equal(run.snapshot().which,'allowed');
  assert.equal(run.snapshot().injuryReturn.variant,'fastest');
  run.advance(1);
  const before=run.snapshot(); run.injury();
  close(run.snapshot().tt,before.tt);
  assert.equal(run.snapshot().track,before.track);
  assert.equal(run.snapshot().log.filter(e=>e.type==='abort').length,1);
});

test('station 1 target Injury selects its distinct prepared alternative instead of generic ABORT normal route', () => {
  const model=loadedModel();
  const r=model.routes.get(1);
  const run=createNavigationRun(model,{n:1,station:{n:1},out:r.out,ret:r.ret,t0:0,stay:90,variant:'safe'});
  run.advance(run.plan.out.minutes+5);
  const pos=run.view().pos;
  run.injury();
  const coords=t=>t.vertices.map(v=>[v.lon,v.lat]);
  assert.deepEqual(coords(run.snapshot().track),coords(r.fastest.ret));
  assert.notDeepEqual(coords(run.snapshot().track),coords(r.ret));
  assert.equal(run.snapshot().phase,'ret');
  assert.equal(run.snapshot().which,'allowed');
  assert.equal(run.snapshot().injuryReturn.switched,true);
  assert.equal(run.snapshot().log.at(-1).requestedVariant,'fastest');
  close(run.view().pos.lon,pos.lon); close(run.view().pos.lat,pos.lat);
  close(run.snapshot().speedFactor,1);
});

test('current HUD scenario sunset controls a loaded route independently of the mission deadline', () => {
  const model={...loadedModel(),ls:600}; // isolate daylight from the separate mission limit
  const r=model.routes.get(2);
  const make=t0=>createNavigationRun(model,{n:2,station:{n:2},out:r.out,ret:r.ret,t0,stay:0,variant:'safe'});
  const early=make(model.sunsetEva-60); early.advance(early.plan.out.minutes);
  assert.equal(early.view().status,'GO');
  const late=make(model.sunsetEva-15); late.advance(late.plan.out.minutes);
  assert.equal(late.view().status,'NO_GO');
  assert.ok(late.view().violations.includes('SUNSET'));
  assert.ok(late.view().returnArrivalMinute>model.sunsetEva);
});
