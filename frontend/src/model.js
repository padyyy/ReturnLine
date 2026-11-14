// Pure computations on the loaded data. No route search: everything is a lookup or an
// interpolation along precomputed tracks (shared/data-contract.md).

export function buildModel(d) {
  const sc = d.scenario;
  const stations = d.stations.features.map((f) => ({
    ...f.properties,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
  const routes = new Map(d.routes.stations.map((r) => [r.station, r]));
  const [startH, startM] = sc.eva_start_lmst.split(':').map(Number);
  const [sunH, sunM] = sc.sunset_lmst.split(':').map(Number);
  return {
    sc,
    stations,
    routes,
    habitat: { lon: sc.habitat[0], lat: sc.habitat[1] },
    startMin: startH * 60 + startM,
    sunsetEva: sunH * 60 + sunM - (startH * 60 + startM), // EVA minutes at sunset
    ls: sc.life_support_min,
    placeholders: d.placeholders,
    missing: d.missing,
    grid: d.grid,
    radio: d.radio,
    comparison: d.comparison,
  };
}

export function lmst(model, t) {
  const m = Math.round(model.startMin + t);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Position on a timed track, started at EVA time t0, walking factor f (2 for an injured crew member).
export function onTrack(track, t0, t, f = 1) {
  const v = track.vertices;
  const tt = (t - t0) / f;
  if (tt <= 0) return { lat: v[0].lat, lon: v[0].lon, doneM: 0, leftM: track.length_m, leftMin: track.minutes * f, end: false };
  for (let i = 1; i < v.length; i++) {
    if (v[i].t_min >= tt) {
      const span = v[i].t_min - v[i - 1].t_min || 1;
      const u = (tt - v[i - 1].t_min) / span;
      const d = v[i - 1].d_m + (v[i].d_m - v[i - 1].d_m) * u;
      return {
        lat: v[i - 1].lat + (v[i].lat - v[i - 1].lat) * u,
        lon: v[i - 1].lon + (v[i].lon - v[i - 1].lon) * u,
        doneM: d, leftM: track.length_m - d, leftMin: (track.minutes - tt) * f, end: false,
      };
    }
  }
  const e = v[v.length - 1];
  return { lat: e.lat, lon: e.lon, doneM: track.length_m, leftM: 0, leftMin: 0, end: true };
}

// Longest stay at a station that is `back` minutes from base, arriving at EVA time `arrive`.
// No safe stay where the station is more than 60 minutes from base.
export function maxStay(model, back, arrive) {
  if (back == null) return null;
  if (back > 60) return -1;
  return Math.min(model.ls, model.sunsetEva) - arrive - back;
}

export function pickerRows(model, t0 = 0) {
  return model.stations.map((s) => {
    const r = model.routes.get(s.n);
    const walk = r ? r.out.minutes : null;
    const back = r ? r.ret.minutes : null;
    return { ...s, km: r ? r.out.length_m / 1000 : null, walk, back, stay: walk == null ? null : maxStay(model, back, t0 + walk) };
  });
}

export function doseAt(model, t) { return model.sc.dose_rate_msv_per_day * t / 1440; }
