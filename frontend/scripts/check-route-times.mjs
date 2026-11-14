import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateDuration } from '../src/route-duration.js';
import { sectionsFromTrack } from '../src/route-duration-input.js';

const defaultDataDir = fileURLToPath(new URL('../public/data/', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

export async function loadInputs(dataDir = defaultDataDir) {
  // Never fall back to placeholder routes: they have no usable DEM heights.
  const routes = await readJson(resolve(dataDir, 'routes.json'));
  let scenario;
  try {
    scenario = await readJson(resolve(dataDir, 'scenario.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    scenario = await readJson(resolve(dataDir, 'placeholder/scenario.json'));
  }
  return { routes, scenario };
}

// Injury is triggered halfway through return distance, using the nominal model's
// arrival time at that point. This also handles a midpoint within a section.
function midpointTime(sections) {
  let left = sections.reduce((sum, s) => sum + s.distanceM, 0) / 2;
  for (const s of sections) {
    if (left <= s.distanceM) return s.startMinute + s.durationMinutes * left / s.distanceM;
    left -= s.distanceM;
  }
  return 0;
}

export function compareRouteTimes(routes, scenario) {
  if (!routes || !Array.isArray(routes.stations)) throw new TypeError('routes.stations must be an array');
  if (!scenario || !Number.isFinite(scenario.walk_speed_kmh) || scenario.walk_speed_kmh <= 0 ||
      !Number.isFinite(scenario.injury_factor) || scenario.injury_factor <= 0 || scenario.injury_factor > 1) {
    throw new RangeError('scenario requires positive walk_speed_kmh and injury_factor in (0,1]');
  }
  const model = { baseSpeedMps: scenario.walk_speed_kmh / 3.6 };
  const rows = [];
  for (const station of routes.stations) {
    for (const leg of ['out', 'ret']) {
      const label = `Station ${station.station} ${leg}`;
      try {
        const track = station[leg];
        const sections = sectionsFromTrack(track);
        if (!Number.isFinite(track.minutes) || track.minutes < 0 ||
            track.vertices.some((v) => !Number.isFinite(v.t_min) || v.t_min < 0)) {
          throw new RangeError('track.minutes and every t_min must be finite and nonnegative');
        }
        const nominal = estimateDuration(sections, { model });
        const injuryAtMinute = midpointTime(nominal.segments);
        for (const injured of leg === 'ret' ? [false, true] : [false]) {
          const result = injured ? estimateDuration(sections, {
            model, events: [{ atMinute: injuryAtMinute, speedFactor: scenario.injury_factor }],
          }) : nominal;
          let sectionIndex = 0;
          let modelTime = 0;
          let maxVertexDeviationMinutes = 0;
          track.vertices.forEach((v, i) => {
            if (i > 0 && v.d_m > track.vertices[i - 1].d_m) {
              modelTime = result.segments[sectionIndex++].endMinute;
            }
            maxVertexDeviationMinutes = Math.max(maxVertexDeviationMinutes, Math.abs(modelTime - v.t_min));
          });
          const deviationMinutes = result.totalMinutes - track.minutes;
          rows.push({
            route: label, injured, engineMinutes: track.minutes,
            modelMinutes: result.totalMinutes, deviationMinutes,
            deviationPercent: track.minutes === 0 ? null : deviationMinutes / track.minutes * 100,
            maxVertexDeviationMinutes,
            ...(injured ? { injuryAtMinute } : {}),
          });
        }
      } catch (error) {
        throw new Error(`${label}: ${error.message}`, { cause: error });
      }
    }
  }
  return rows;
}

export async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--json')) throw new Error('Usage: node scripts/check-route-times.mjs [--json]');
  const { routes, scenario } = await loadInputs();
  const rows = compareRouteTimes(routes, scenario);
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else {
    console.log('Tobler comparison; roughness = 0 (assumption). Engine reference is uninjured for all rows.');
    console.log('Injury begins halfway through return distance; elapsed time before injury is preserved.');
    console.table(rows.map((r) => ({
      Route: r.route + (r.injured ? ' injured' : ''),
      'Engine min': r.engineMinutes.toFixed(3),
      'Model min': r.modelMinutes.toFixed(3),
      'Delta min': r.deviationMinutes.toFixed(3),
      'Delta %': r.deviationPercent?.toFixed(2) ?? 'n/a',
      'Max vertex delta min': r.maxVertexDeviationMinutes.toFixed(3),
    })));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Route-time check failed: ${error.message}`); process.exitCode = 1; });
}
