// Ordered A* nodes on a 1 m grid; x/y are integer cell indices, not GPS positions.
// Directional slope comes from elevations; roughness comes from the departure cell.
export function parseRoute(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || !Array.isArray(data.nodes)) throw new TypeError('nodes must be an array');
  const nodes = data.nodes;
  nodes.forEach((n, i) => {
    if (!n || !Number.isSafeInteger(n.x) || !Number.isSafeInteger(n.y)) {
      throw new TypeError(`nodes[${i}] must have safe integer x/y cell indices`);
    }
    if (!Number.isFinite(n.elevation_m) ||
        !Number.isFinite(n.roughness_m) || n.roughness_m < 0) {
      throw new RangeError(`nodes[${i}] requires finite elevation_m and roughness_m >= 0`);
    }
  });
  return nodes.slice(0, -1).map((node, i) => {
    const dx = Math.abs(nodes[i + 1].x - node.x);
    const dy = Math.abs(nodes[i + 1].y - node.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) {
      throw new RangeError(`nodes[${i}] and nodes[${i + 1}] must be distinct neighbouring cells`);
    }
    const distanceM = Math.hypot(dx, dy);
    const slopeDeg = Math.atan2(nodes[i + 1].elevation_m - node.elevation_m, distanceM) * 180 / Math.PI;
    if (!Number.isFinite(slopeDeg) || Math.abs(slopeDeg) > 89) {
      throw new RangeError(`edge ${i} exceeds the supported directional slope range [-89,89]`);
    }
    return { distanceM, slopeDeg, roughnessM: node.roughness_m };
  });
}
