import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { compareRouteTimes, loadInputs } from '../scripts/check-route-times.mjs';
const scenario = { walk_speed_kmh: 3.6, injury_factor: 0.5 };
const track = {
  minutes: 10,
  vertices: [
    { d_m: 0, elev_m: 0, t_min: 0 },
    { d_m: 120, elev_m: 0, t_min: 2 },
    { d_m: 600, elev_m: 0, t_min: 10 },
  ],
};
const routes = { stations: [{ station: 1, out: structuredClone(track), ret: structuredClone(track) }] };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9);

test('comparison reports all legs and injury halfway through return distance', () => {
  const [out, ret, injured] = compareRouteTimes(routes, scenario);
  close(out.modelMinutes, 10);
  close(ret.deviationMinutes, 0);
  close(out.maxVertexDeviationMinutes, 0);
  close(injured.injuryAtMinute, 5);
  close(injured.modelMinutes, 15);
  close(injured.deviationPercent, 50);
  close(injured.maxVertexDeviationMinutes, 5);
  assert.equal(injured.injured, true);
});
test('intermediate deviation is reported even when totals agree', () => {
  const changed = structuredClone(routes);
  changed.stations[0].out.vertices[1].t_min = 4;
  close(compareRouteTimes(changed, scenario)[0].maxVertexDeviationMinutes, 2);
});
test('missing heights and invalid scenario or engine times fail with context', () => {
  const changed = structuredClone(routes);
  changed.stations[0].out.vertices[0].elev_m = null;
  assert.throws(() => compareRouteTimes(changed, scenario), /Station 1 out.*elev_m/);
  for (const bad of [{}, { ...scenario, injury_factor: 0 }, { ...scenario, walk_speed_kmh: 0 }]) {
    assert.throws(() => compareRouteTimes(routes, bad), /scenario/);
  }
  const missingTime = structuredClone(routes);
  missingTime.stations[0].ret.vertices[1].t_min = null;
  assert.throws(() => compareRouteTimes(missingTime, scenario), /Station 1 ret.*t_min/);
});
test('zero duration references have undefined percentage, not infinity', () => {
  const empty = { minutes: 0, vertices: [] };
  const rows = compareRouteTimes({ stations: [{ station: 0, out: empty, ret: empty }] }, scenario);
  assert.ok(rows.every((r) => r.deviationPercent === null && r.modelMinutes === 0));
});
test('loader only falls back for missing scenario, never routes or invalid JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'route-time-check-'));
  try {
    await mkdir(join(dir, 'placeholder'));
    await writeFile(join(dir, 'placeholder/scenario.json'), JSON.stringify(scenario));
    await writeFile(join(dir, 'placeholder/routes.json'), JSON.stringify(routes));
    await assert.rejects(loadInputs(dir), /routes.json/);
    await writeFile(join(dir, 'routes.json'), JSON.stringify(routes));
    assert.deepEqual((await loadInputs(dir)).scenario, scenario);
    await writeFile(join(dir, 'scenario.json'), JSON.stringify({ ...scenario, walk_speed_kmh: 1.5 }));
    assert.equal((await loadInputs(dir)).scenario.walk_speed_kmh, 1.5);
    await writeFile(join(dir, 'scenario.json'), '{');
    await assert.rejects(loadInputs(dir), SyntaxError);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('offline CLI produces valid JSON on real routes, and rejects unknown flags', () => {
  const script = new URL('../scripts/check-route-times.mjs', import.meta.url);
  const output = execFileSync(process.execPath, [script.pathname, '--json'], { encoding: 'utf8' });
  const rows = JSON.parse(output);
  assert.ok(rows.length > 0 && rows.length % 3 === 0);
  assert.ok(rows.every((r) => Number.isFinite(r.modelMinutes)));
  assert.throws(() => execFileSync(process.execPath, [script.pathname, '--invalid'], { stdio: 'pipe' }));
});

test('injury midpoint is measured by distance, not half of travel time', () => {
  const varying = {
    minutes: 1,
    vertices: [
      { d_m: 0, elev_m: 0, t_min: 0 },
      { d_m: 10, elev_m: 0, t_min: 0.4 },
      { d_m: 20, elev_m: 2, t_min: 1 },
    ],
  };
  const rows = compareRouteTimes({ stations: [{ station: 2, out: varying, ret: varying }] }, scenario);
  close(rows[2].injuryAtMinute, 10 / 60);
  assert.ok(Math.abs(rows[2].injuryAtMinute - rows[1].modelMinutes / 2) > 0.01);
});
