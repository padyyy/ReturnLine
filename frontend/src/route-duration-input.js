// Adapter for the shared routes.json track format. No grid geometry or route search.
export function sectionsFromTrack(track) {
  if (!track || !Array.isArray(track.vertices)) throw new TypeError('track.vertices must be an array');
  const vertices = track.vertices;
  vertices.forEach((v, i) => {
    if (!v || !Number.isFinite(v.elev_m)) {
      throw new RangeError(`vertices[${i}].elev_m is missing or nonfinite; real DEM heights are required`);
    }
    if (!Number.isFinite(v.d_m) || v.d_m < 0) {
      throw new RangeError(`vertices[${i}].d_m must be finite and nonnegative`);
    }
  });
  const sections = [];
  for (let i = 1; i < vertices.length; i++) {
    const distanceM = vertices[i].d_m - vertices[i - 1].d_m;
    if (distanceM <= 0) continue;
    const slopeDeg = Math.atan2(vertices[i].elev_m - vertices[i - 1].elev_m, distanceM) * 180 / Math.PI;
    if (!Number.isFinite(slopeDeg) || Math.abs(slopeDeg) > 89) {
      throw new RangeError(`edge ${i - 1} exceeds the supported slope range [-89,89]`);
    }
    // Assumption: no roughness grid is available. Do not invent measurements.
    sections.push({ distanceM, slopeDeg, roughnessM: 0 });
  }
  return sections;
}
