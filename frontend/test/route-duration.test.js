import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDuration } from '../src/route-duration.js';
import { parseRoute } from '../src/route-duration-input.js';
const segment = (distanceM = 600, slopeDeg = 0, roughnessM = 0) => ({ distanceM, slopeDeg, roughnessM });
const route = (...segments) => segments;
const calc = (r, options = {}) => estimateDuration(r, { ...options, model: { baseSpeedMps: 1, ...options.model } });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('flat route has distance / speed duration, in minutes', () => {
  const r = calc(route(segment()));
  close(r.totalMinutes, 10);
  close(r.segments[0].averageSpeedMps, 1);
  close(estimateDuration(route(segment())).totalMinutes, 24);
});
test('Tobler matches reference durations at +/-10 degrees and roughness stays separate', () => {
  close(calc(route(segment(600, 10))).totalMinutes, 18.536273191950126);
  close(calc(route(segment(600, -10))).totalMinutes, 13.062290946139536);
  close(calc(route(segment(600, 0, 1))).totalMinutes, 20);
});
test('multiple sections sum their individual durations', () => {
  const r = calc(route(segment(), segment(300, 0, 1)));
  close(r.totalMinutes, 20);
  close(r.segments[1].startMinute, 10);
});
test('injury at departure halves speed', () => {
  close(calc(route(segment()), { events: [{ atMinute: 0, speedFactor: 0.5 }] }).totalMinutes, 20);
});
test('delay adds minutes once; snapshots do not add it again', () => {
  const options = { events: [{ atMinute: 2, delayMinutes: 3 }], nowMinute: 3 };
  const r = calc(route(segment()), options);
  close(r.totalMinutes, 13);
  close(r.remainingMinutes, 10);
  close(r.segments[0].delayMinutes, 3);
  assert.deepEqual(calc(route(segment()), options), r);
});
test('mid-section injury preserves elapsed travel and applies only to the remainder', () => {
  const r = calc(route(segment()), { events: [{ atMinute: 4, speedFactor: 0.5 }], nowMinute: 4 });
  close(r.elapsedMinutes, 4);
  close(r.remainingMinutes, 12);
  close(r.totalMinutes, 16);
  close(r.segments[0].minSpeedMps, 0.5);
  close(r.segments[0].maxSpeedMps, 1);
});
test('events during delays, simultaneous events and unsorted events compose', () => {
  const r = calc(route(segment()), { events: [
    { atMinute: 3, speedFactor: 0.5, delayMinutes: 1 },
    { atMinute: 2, delayMinutes: 3 },
    { atMinute: 3, delayMinutes: 2 },
  ] });
  close(r.totalMinutes, 24); // 2 walking + 6 waiting + 16 walking
});
test('section boundary events affect the next section; events after arrival are ignored', () => {
  const r = calc(route(segment(), segment()), { events: [
    { atMinute: 10, speedFactor: 0.5 }, { atMinute: 100, delayMinutes: 8 },
  ], nowMinute: 40 });
  close(r.totalMinutes, 30);
  close(r.remainingMinutes, 0);
  close(r.segments[0].durationMinutes, 10);
});
test('empty and zero-length routes take no time, even with departure events', () => {
  for (const r of [route(), route(segment(0)), route(segment(0), segment(0))]) {
    close(calc(r, { events: [{ atMinute: 0, delayMinutes: 5 }] }).totalMinutes, 0);
  }
  close(calc(route(segment(0), segment())).totalMinutes, 10);
});
test('node adapter creates copied sections without mutating the input', () => {
  const nodes = [
    { x: 0, y: 0, elevation_m: 0, roughness_m: 0.2 },
    { x: 1, y: 0, elevation_m: Math.tan(10 * Math.PI / 180), roughness_m: 0.1 },
    { x: 2, y: 1, elevation_m: Math.tan(10 * Math.PI / 180) + Math.SQRT2 * Math.tan(-5 * Math.PI / 180), roughness_m: 0 },
  ];
  const before = JSON.stringify({ nodes });
  const sections = parseRoute(before);
  close(sections[0].distanceM, 1);
  close(sections[0].slopeDeg, 10);
  close(sections[1].distanceM, Math.SQRT2);
  close(sections[1].slopeDeg, -5);
  close(sections[0].roughnessM, 0.2);
  close(sections[1].roughnessM, 0.1);
  calc(sections);
  assert.equal(JSON.stringify({ nodes }), before);
});
test('invalid input and configuration fail explicitly', () => {
  for (const value of [-1, NaN, Infinity, '600', null]) {
    assert.throws(() => calc(route(segment(value))), RangeError);
  }
  for (const r of [{}, null, { segments: [null] }, route(segment(1, 90)), route(segment(1, 0, -1))]) {
    assert.throws(() => calc(r));
  }
  for (const model of [{ baseSpeedMps: 0 }, { minSpeedMps: 2 }, { maxSpeedMps: 0.5 }, { roughnessPenaltyPerM: -1 }]) {
    assert.throws(() => calc(route(segment()), { model }));
  }
  for (const e of [null, { atMinute: -1 }, { atMinute: 0, speedFactor: 0 },
    { atMinute: 0, speedFactor: 2 }, { atMinute: 0, delayMinutes: -1 }]) {
    assert.throws(() => calc(route(segment()), { events: [e] }));
  }
  assert.throws(() => calc(route(segment()), { nowMinute: -1 }));
  assert.throws(() => parseRoute('{'));
});
test('extreme terrain is bounded; unrepresentable durations fail', () => {
  close(calc(route(segment(6, 89, 1e300))).totalMinutes, 10);
  assert.throws(() => calc(route(segment(Number.MAX_VALUE))), RangeError);
});

test('one metre grid sums edge times rather than average terrain', () => {
  const sections = parseRoute({ nodes: [
    { x: 0, y: 0, elevation_m: 0, roughness_m: 0 },
    { x: 1, y: 0, elevation_m: Math.tan(10 * Math.PI / 180), roughness_m: 0.5 },
    { x: 2, y: 0, elevation_m: 0, roughness_m: 0 },
  ] });
  close(calc(sections).totalMinutes, (18.536273191950126 + 13.062290946139536 * 1.5) / 600);
  close(sections.reduce((sum, s) => sum + s.distanceM, 0), 2);
});
test('empty and single-node paths contain no transitions', () => {
  assert.deepEqual(parseRoute({ nodes: [] }), []);
  const sections = parseRoute({ nodes: [{ x: 0, y: 0, elevation_m: -3600, roughness_m: 0.2 }] });
  close(calc(sections).totalMinutes, 0);
});
test('node adapter rejects missing terrain, invalid coordinates, duplicates and jumps', () => {
  const n = { x: 0, y: 0, elevation_m: 0, roughness_m: 0 };
  for (const bad of [null, {}, { ...n, x: 0.5 }, { ...n, x: Infinity },
    { ...n, elevation_m: NaN }, { ...n, elevation_m: null },
    { ...n, roughness_m: -1 }, { ...n, roughness_m: undefined }]) {
    assert.throws(() => parseRoute({ nodes: [bad] }));
  }
  assert.throws(() => parseRoute({ segments: [] }));
  assert.throws(() => parseRoute({ nodes: [n, n] }));
  assert.throws(() => parseRoute({ nodes: [n, { ...n, x: 2 }] }));
});

test('Tobler has its maximum at -5 percent grade and slows steeper descent', () => {
  const optimum = Math.atan(-0.05) * 180 / Math.PI;
  const fast = calc(route(segment(600, optimum)));
  close(fast.segments[0].averageSpeedMps, 1.191246216612358);
  assert.ok(fast.totalMinutes < calc(route(segment())).totalMinutes);
  assert.ok(calc(route(segment(600, -15))).totalMinutes > fast.totalMinutes);
});
test('normalized Tobler reproduces the original when flat speed is 6 exp(-0.175) km/h', () => {
  const r = calc(route(segment(600, Math.atan(-0.05) * 180 / Math.PI)), {
    model: { baseSpeedMps: 5.036742124615244 / 3.6 },
  });
  close(r.segments[0].averageSpeedMps, 6 / 3.6);
});
test('base speed sensitivity scales duration inversely without clamping', () => {
  const sections = route(segment(600, 10, 0.2));
  const baseline = calc(sections).totalMinutes;
  close(calc(sections, { model: { baseSpeedMps: 0.7 } }).totalMinutes, baseline / 0.7);
  close(calc(sections, { model: { baseSpeedMps: 1.3 } }).totalMinutes, baseline / 1.3);
});

test('directionless slope_deg is not reused as uphill slope', () => {
  const nodes = [
    { x: 0, y: 0, elevation_m: -3600, slope_deg: 30, roughness_m: 0 },
    { x: 1, y: 0, elevation_m: -3600, slope_deg: 30, roughness_m: 0 },
  ];
  close(parseRoute({ nodes })[0].slopeDeg, 0);
  close(calc(parseRoute({ nodes })).totalMinutes, 1 / 60);
});
test('reversing the path reverses the elevation slope sign', () => {
  const nodes = [
    { x: 0, y: 0, elevation_m: 0, roughness_m: 0 },
    { x: 1, y: 0, elevation_m: 0.1, roughness_m: 0 },
  ];
  const uphill = parseRoute({ nodes });
  const downhill = parseRoute({ nodes: nodes.toReversed() });
  close(uphill[0].slopeDeg, -downhill[0].slopeDeg);
  assert.ok(calc(uphill).totalMinutes > calc(downhill).totalMinutes);
});
test('extreme elevation differences are rejected rather than silently clamped', () => {
  assert.throws(() => parseRoute({ nodes: [
    { x: 0, y: 0, elevation_m: 0, roughness_m: 0 },
    { x: 1, y: 0, elevation_m: 1e300, roughness_m: 0 },
  ] }), RangeError);
});
