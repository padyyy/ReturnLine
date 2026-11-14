import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDuration } from '../src/route-duration.js';
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
});
test('extreme terrain is bounded; unrepresentable durations fail', () => {
  close(calc(route(segment(6, 89, 1e300))).totalMinutes, 10);
  assert.throws(() => calc(route(segment(Number.MAX_VALUE))), RangeError);
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
