// Contour lines through a grid at one level (marching squares), joined into polylines.
// Display only: it draws lines through times the routing engine computed; it searches nothing.
// Samples sit at cell centres; points come back as [row, col] in fractional cell units.

// segments per case; corners above the level: top-left 8, top-right 4, bottom-right 2, bottom-left 1
const CASES = {
  1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['T', 'R']], 6: [['T', 'B']], 7: [['L', 'T']],
  8: [['L', 'T']], 9: [['T', 'B']], 11: [['T', 'R']], 12: [['L', 'R']], 13: [['B', 'R']], 14: [['L', 'B']],
};

// reachableOnly: squares touching a cell without a finite value (blocked ground) get no line, so the
// line marks the real limit instead of outlining every blocked patch
export function contour(values, nx, ny, level, scale = 1, { reachableOnly = false } = {}) {
  const val = (r, c) => { const v = values[r * nx + c] * scale; return Number.isFinite(v) ? v : reachableOnly ? NaN : 1e9; };
  const t = (p, q) => (q === p ? 0.5 : (level - p) / (q - p));
  const segs = [];
  for (let r = 0; r < ny - 1; r++) {
    for (let c = 0; c < nx - 1; c++) {
      const a = val(r, c), b = val(r, c + 1), cc = val(r + 1, c + 1), d = val(r + 1, c);
      if (reachableOnly && !(a === a && b === b && cc === cc && d === d)) continue;   // NaN: blocked corner
      const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (cc > level ? 2 : 0) | (d > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const P = {
        T: [r, c + t(a, b)], R: [r + t(b, cc), c + 1], B: [r + 1, c + t(d, cc)], L: [r + t(a, d), c],
      };
      let list = CASES[idx];
      if (idx === 5 || idx === 10) { // saddles: decide by the centre value
        const above = (a + b + cc + d) / 4 > level;
        list = idx === 5 ? (above ? [['L', 'T'], ['B', 'R']] : [['T', 'R'], ['L', 'B']])
          : (above ? [['T', 'R'], ['L', 'B']] : [['L', 'T'], ['B', 'R']]);
      }
      for (const [e1, e2] of list) segs.push([P[e1], P[e2]]);
    }
  }
  return join(segs);
}

// Join segments that share end points (shared edges give identical floats) into polylines
function join(segs) {
  const key = (p) => `${p[0]},${p[1]}`;
  const at = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!at.has(k)) at.set(k, []); at.get(k).push(i); } });
  const used = new Uint8Array(segs.length);
  const next = (p) => { for (const i of at.get(key(p)) || []) if (!used[i]) return i; return -1; };
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    for (let j = next(line[line.length - 1]); j >= 0; j = next(line[line.length - 1])) {
      used[j] = 1;
      const s = segs[j];
      line.push(key(s[0]) === key(line[line.length - 1]) ? s[1] : s[0]);
    }
    for (let j = next(line[0]); j >= 0; j = next(line[0])) {
      used[j] = 1;
      const s = segs[j];
      line.unshift(key(s[0]) === key(line[0]) ? s[1] : s[0]);
    }
    lines.push(line);
  }
  return lines;
}
