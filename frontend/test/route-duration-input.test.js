import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionsFromTrack } from '../src/route-duration-input.js';
const track = (...vertices) => ({ vertices });
const v = (d_m, elev_m) => ({ d_m, elev_m, slope_deg: 70, t_min: 999 });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9);

test('track adapter uses cumulative ground distance including knight moves, not coordinates', () => {
  const input = track(v(0, -3600), v(10, -3599), v(32.36, -3600));
  const before = JSON.stringify(input);
  const sections = sectionsFromTrack(input);
  close(sections[0].distanceM, 10);
  close(sections[1].distanceM, 22.36);
  close(sections[0].slopeDeg, Math.atan(0.1) * 180 / Math.PI);
  close(sections[1].slopeDeg, Math.atan(-1 / 22.36) * 180 / Math.PI);
  assert.ok(sections.every((s) => s.roughnessM === 0));
  assert.equal(JSON.stringify(input), before);
});
test('zero or decreasing cumulative distance is skipped as specified', () => {
  const sections = sectionsFromTrack(track(v(0, 0), v(10, 1), v(10, 2), v(9, 2), v(20, 2)));
  assert.deepEqual(sections.map((s) => s.distanceM), [10, 11]);
  close(sections[1].slopeDeg, 0);
});
test('missing heights fail even on skipped edges or a single point', () => {
  for (const elev_m of [null, undefined, NaN, Infinity, '10']) {
    assert.throws(() => sectionsFromTrack(track(v(0, elev_m))), /elev_m.*real DEM heights/);
    assert.throws(() => sectionsFromTrack(track(v(0, 0), v(0, elev_m))), /elev_m/);
  }
});
test('invalid tracks and distances fail, empty and singleton tracks are valid', () => {
  for (const input of [null, {}, { vertices: [null] }, track(v(-1, 0)), track(v(Infinity, 0))]) {
    assert.throws(() => sectionsFromTrack(input));
  }
  assert.deepEqual(sectionsFromTrack(track()), []);
  assert.deepEqual(sectionsFromTrack(track(v(0, 0))), []);
  assert.throws(() => sectionsFromTrack(track(v(0, 0), v(1, 1e300))), /slope range/);
});
test('reversing elevations changes the slope direction, slope_deg is ignored', () => {
  const up = sectionsFromTrack(track(v(0, 0), v(10, 1)));
  const down = sectionsFromTrack(track(v(0, 1), v(10, 0)));
  close(up[0].slopeDeg, -down[0].slopeDeg);
  close(sectionsFromTrack(track(v(0, 0), v(10, 0)))[0].slopeDeg, 0);
});
