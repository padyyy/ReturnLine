import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateDuration } from '../src/route-duration.js';
import { sectionsFromTrack } from '../src/route-duration-input.js';
const fixture = JSON.parse(readFileSync(new URL('../../shared/walking-model-vectors.json', import.meta.url), 'utf8'));
test('shared walking vectors match the track adapter and duration core', () => {
  assert.equal(fixture.vectors.length, 18);
  for (const v of fixture.vectors) {
    const sections = sectionsFromTrack({ vertices: [
      { d_m: 0, elev_m: 0 }, { d_m: v.distance_m, elev_m: v.dz_m },
    ] });
    const result = estimateDuration(sections, { model: {
      baseSpeedMps: fixture.base_speed_kmh / 3.6,
      minSpeedMps: fixture.min_speed_mps, maxSpeedMps: fixture.max_speed_mps,
    } });
    assert.ok(Math.abs(result.totalMinutes - v.minutes) <= fixture.tolerance_minutes,
      `${v.distance_m}m, ${v.slope_deg} degrees`);
  }
});
