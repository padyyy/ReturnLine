// Small formatting helpers shared by the console and the crew view.
export const R = Math.round;

export function hm(min) {
  if (min == null || !Number.isFinite(min)) return '–';
  let m = R(min);
  const neg = m < 0;
  m = Math.abs(m);
  return `${neg ? '−' : ''}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function icon(id, cls = '') {
  return `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
}

// One number column with aligned decimals: integer right-aligned, fraction and unit after it.
export function numCell(v, unit = '', cap = '') {
  if (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) {
    return `<span class="na">not available</span>${cap ? `<small>${cap}</small>` : ''}`;
  }
  const s = String(v);
  const m = s.match(/^([^0-9]*[0-9]+)([.:][0-9]+)?$/);
  const ip = m ? m[1] : s;
  const fp = m && m[2] ? m[2] : '';
  const u = unit ? (unit === '°' ? '<span class="nu tight">°</span>' : `<span class="nu">${unit}</span>`) : '';
  return `<span class="nc"><span class="ni">${ip}</span><span class="nf">${fp}${u}</span></span>${cap ? `<small>${cap}</small>` : ''}`;
}

export function srcChip(label, text, assumption = false) {
  return `<button type="button" class="src${assumption ? ' is-assume' : ''}" data-tip-label="${esc(label)}" data-tip="${esc(text)}" aria-label="${esc(`${label}: ${text}`)}">${esc(label)}</button>`;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
