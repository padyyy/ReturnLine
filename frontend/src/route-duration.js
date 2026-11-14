// Pure duration calculation: metres, degrees, m/s and minutes. No imports or I/O.
function number(value, name, min = 0, max = Number.MAX_VALUE) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and in [${min}, ${max}]`);
  }
  return value;
}

// Tobler slope curve, normalized to base speed on level ground.
// Roughness and astronaut scaling remain uncalibrated model assumptions.
export const DEFAULT_MODEL = Object.freeze({
  baseSpeedMps: 1.5 / 3.6,
  roughnessPenaltyPerM: 1,
  minSpeedMps: 0.01,
  maxSpeedMps: 3,
});

/** Events: { atMinute, speedFactor?: (0,1], delayMinutes?: >=0 }.
 * Speed factors persist and multiply; delays add, including during another delay.
 * nowMinute and event times are relative to departure, not wall-clock time.
 */
export function estimateDuration(segments, { model = {}, events = [], nowMinute = 0 } = {}) {
  if (!Array.isArray(segments)) throw new TypeError('segments must be an array');
  segments.forEach((s, i) => {
    if (!s || typeof s !== 'object') throw new TypeError(`segments[${i}] must be an object`);
    number(s.distanceM, `segments[${i}].distanceM`);
    number(s.slopeDeg, `segments[${i}].slopeDeg`, -89, 89);
    number(s.roughnessM, `segments[${i}].roughnessM`);
  });
  const cfg = { ...DEFAULT_MODEL, ...model };
  for (const key of Object.keys(DEFAULT_MODEL)) number(cfg[key], key);
  if (cfg.minSpeedMps <= 0 || cfg.maxSpeedMps < cfg.minSpeedMps ||
      cfg.baseSpeedMps < cfg.minSpeedMps || cfg.baseSpeedMps > cfg.maxSpeedMps) {
    throw new RangeError('Invalid speed bounds or base speed');
  }
  number(nowMinute, 'nowMinute');
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  const queue = events.map((e) => {
    if (!e || typeof e !== 'object') throw new TypeError('event must be an object');
    const speedFactor = number(e.speedFactor ?? 1, 'speedFactor', 0, 1);
    if (speedFactor === 0) throw new RangeError('speedFactor must be positive');
    return {
      atMinute: number(e.atMinute, 'atMinute'), speedFactor,
      delayMinutes: number(e.delayMinutes ?? 0, 'delayMinutes'),
    };
  }).sort((a, b) => a.atMinute - b.atMinute);
  let time = 0;
  let eventIndex = 0;
  let factor = 1;
  let pendingDelay = 0;
  const results = segments.map((s, index) => {
    const grade = Math.tan(s.slopeDeg * Math.PI / 180);
    // v(g) / v(0), with v(g) = 6 * exp(-3.5 * abs(g + 0.05)) km/h.
    const slopeFactor = Math.exp(-3.5 * (Math.abs(grade + 0.05) - 0.05));
    const terrainSpeed = cfg.baseSpeedMps * slopeFactor
      / (1 + cfg.roughnessPenaltyPerM * s.roughnessM);
    let distance = s.distanceM;
    let walkingMinutes = 0;
    let minSpeed = Infinity;
    let maxSpeed = 0;
    const startMinute = time;
    while (distance > 0) {
      while (eventIndex < queue.length && queue[eventIndex].atMinute <= time) {
        const e = queue[eventIndex++];
        factor *= e.speedFactor;
        pendingDelay += e.delayMinutes;
      }
      const nextEvent = queue[eventIndex]?.atMinute ?? Infinity;
      const speed = Math.max(cfg.minSpeedMps, Math.min(cfg.maxSpeedMps, terrainSpeed * factor));
      const waiting = pendingDelay > 0;
      const needed = waiting ? pendingDelay : distance / speed / 60;
      const dt = Math.min(needed, nextEvent - time);
      if (!Number.isFinite(dt) || time + dt > Number.MAX_SAFE_INTEGER || time + dt === time) {
        throw new RangeError('Duration exceeds numeric precision or range');
      }
      time += dt;
      if (waiting) pendingDelay = Math.max(0, pendingDelay - dt);
      else {
        minSpeed = Math.min(minSpeed, speed);
        maxSpeed = Math.max(maxSpeed, speed);
        walkingMinutes += dt;
        distance = dt === needed ? 0 : Math.max(0, distance - dt * speed * 60);
      }
    }
    return {
      index, ...s, startMinute, endMinute: time,
      durationMinutes: time - startMinute,
      walkingMinutes, delayMinutes: time - startMinute - walkingMinutes,
      averageSpeedMps: walkingMinutes > 0 ? s.distanceM / (walkingMinutes * 60) : null,
      minSpeedMps: minSpeed === Infinity ? null : minSpeed,
      maxSpeedMps: maxSpeed || null,
      remainingMinutes: Math.max(0, time - Math.max(startMinute, nowMinute)),
    };
  });
  return {
    totalMinutes: time,
    elapsedMinutes: Math.min(nowMinute, time),
    remainingMinutes: Math.max(0, time - nowMinute),
    segments: results,
  };
}
