// Crew view: one read-only component with three skins (values, cuff, HUD).
// The cuff tablet and the helmet HUD follow Alex's navigation sketch
// (docs/design/navigation-hud-sketch.html); these are simple stand-ins until his components land.
import { hm, R, icon, numCell } from './format.js';
import { st, crewState, limits, stage, station } from './sim.js';

const cdNum = (v) => {
  const m = String(v).match(/^(\S+) (min|m)$/);
  return m ? numCell(m[1], m[2]) : numCell(v);
};

function data(model) {
  const c = crewState(model);
  const s = station(model);
  const t = st.t;
  const lim = limits(model, t);
  const d = { ls: hm(model.ls - t), sun: hm(model.sunsetEva - t), sunCap: `${model.sc.sunset_lmst} LMST`, state: 'ON PLAN', stateNum: '±0 min', cls: 'ok', fill: null };
  if (c.where === 'habitat' || !s) {
    Object.assign(d, { next: s ? s.name : 'No target', nextCap: s ? 'picked' : 'pick a target', nextV: '–', ttb: '0 min', ttbCap: 'at the habitat', res: '–', resCap: 'after Start' });
    return d;
  }
  if (c.where === 'out') {
    Object.assign(d, { next: s.name, nextCap: `${R(c.pos.leftM)} m`, nextV: `${R(c.pos.leftMin)} min` });
  } else if (c.where === 'station') {
    Object.assign(d, { next: 'Habitat', nextCap: 'after the return starts', nextV: `${R(c.backMin)} min` });
  } else {
    Object.assign(d, { next: 'Habitat', nextCap: `${R(c.leftM ?? 0)} m`, nextV: `${R(c.backMin)} min` });
  }
  d.ttb = `${R(c.backMin)} min`;
  d.ttbCap = c.where === 'ret' || c.where === 'home' ? 'along the way home' : 'back along the route';
  d.res = `${R(lim.B - c.backMin)} min`;
  d.resCap = 'at arrival';
  if (st.done || c.where === 'home') Object.assign(d, { state: 'HOME', stateNum: '', cls: 'home', ttb: '0 min', ttbCap: 'inside' });
  else if (st.injuredAt != null) d.fill = { instr: 'ABORT: return to shelter now', route: st.abort ? 'Route from habitat control · override logged' : 'Stand by: route from habitat control' };
  else if (st.retStart == null && c.where === 'station' && t >= 290) Object.assign(d, { state: 'TURNAROUND DUE', stateNum: 'EVA 5:00', cls: 'due' });
  d.stage = stage(model, c.backMin);
  return d;
}

function valuesSkin(d) {
  if (d.fill) {
    return `<div class="cd-fill"><div class="instr">${d.fill.instr}</div><div class="route">${d.fill.route}</div></div>` +
      `<div class="cd-compact"><div>Next target<b>${d.nextV}</b>${d.next}</div><div>Time to base<b>${d.ttb}</b>${d.ttbCap}</div>` +
      `<div>Reserve<b>${d.res}</b>${d.resCap}</div><div>Life support<b>${d.ls}</b>assumption</div><div>Time to sunset<b>${d.sun}</b>sunset</div></div>`;
  }
  return `<div class="cd-state ${d.cls}">${d.cls === 'ok' ? icon('check') : ''}${d.state}<span class="num">${d.stateNum}</span></div>` +
    '<dl class="cd-vals">' +
    `<div><dt>Next target<span class="cap">${d.next} · ${d.nextCap}</span></dt><dd>${cdNum(d.nextV)}</dd></div>` +
    `<div><dt>Time to base<span class="cap">${d.ttbCap}</span></dt><dd>${cdNum(d.ttb)}</dd></div>` +
    `<div><dt>Reserve<span class="cap">${d.resCap}</span></dt><dd>${cdNum(d.res)}</dd></div>` +
    `<div><dt>Life support<span class="cap">assumption: 6:00 EVA</span></dt><dd>${cdNum(d.ls)}</dd></div>` +
    `<div><dt>Time to sunset<span class="cap">sunset ${d.sunCap}</span></dt><dd>${cdNum(d.sun)}</dd></div></dl>`;
}

function cuffSkin(d) {
  const head = d.fill
    ? '<div class="cuff-state abort"><span>ABORT</span><span class="sub">RETURN TO SHELTER NOW</span></div>'
    : `<div class="cuff-state"><span>${d.state}</span><span>${d.stateNum}</span></div>`;
  return '<div class="cuff"><div class="cuff-strap top"></div><div class="cuff-body">' +
    '<div class="cuff-keys l"><div class="cuff-key"><span>DATA</span></div><div class="cuff-key"><span>ZOOM+</span></div></div>' +
    `<div class="cuff-screen">${head}` +
    `<div class="cuff-row"><span>NEXT ${d.next.toUpperCase()}</span><b>${d.nextV}</b></div>` +
    `<div class="cuff-row"><span>TO BASE</span><b>${d.ttb}</b></div>` +
    `<div class="cuff-row"><span>RESERVE</span><b>${d.res}</b></div>` +
    `<div class="cuff-row"><span>LIFE SUPP*</span><b>${d.ls}</b></div>` +
    `<div class="cuff-row"><span>SUNSET IN</span><b>${d.sun}</b></div></div>` +
    '<div class="cuff-keys r"><div class="cuff-key"><span>ZOOM−</span></div><div class="cuff-key"><span>MAP</span></div></div>' +
    '</div><div class="cuff-strap bottom"></div>' +
    '<div class="cuff-note">Stand-in. The cuff tablet with the heading-up map comes from Alex\'s navigation sketch. Keys change only the view. *assumption</div></div>';
}

function hudSkin(d) {
  const sg = d.stage ? d.stage.name : 'green';
  const word = d.fill ? 'ABORT · RETURN NOW' : sg === 'red' ? 'ABORT · RETURN NOW' : sg === 'amber' ? 'HEAD HOME SOON' : 'HOME IN TIME';
  const col = d.fill || sg === 'red' ? '#C8361F' : sg === 'amber' ? '#D9A300' : '#1F6B45';
  return `<div class="hud"><svg viewBox="0 0 240 240" role="img" aria-label="Helmet HUD: ${word}">` +
    `<circle cx="120" cy="120" r="96" fill="#E3E7DA" stroke="${col}" stroke-width="10"/>` +
    '<text x="120" y="38" text-anchor="middle" class="hud-n">N</text>' +
    `<text x="120" y="116" text-anchor="middle" class="hud-big">${d.ttb}</text>` +
    '<text x="120" y="136" text-anchor="middle" class="hud-cap">TO BASE</text>' +
    `<text x="120" y="164" text-anchor="middle" class="hud-word" fill="${col}">${word}</text>` +
    '</svg><div class="hud-corners">' +
    `<span>EVA ${hm(st.t)}</span><span>SUNSET ${d.sun}</span><span>LIFE SUPP* ${d.ls}</span><span>RESERVE ${d.res}</span></div>` +
    '<div class="cuff-note">Stand-in. Compass, radar and warnings come from Alex\'s navigation sketch. Stage colours use rule B. *assumption</div></div>';
}

export function renderCrew(model) {
  const el = document.getElementById('crew');
  el.setAttribute('data-skin', st.skin);
  el.querySelectorAll('.crew-head .seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.skin === st.skin)));
  const d = data(model);
  document.getElementById('crew-body').innerHTML = st.skin === 'cuff' ? cuffSkin(d) : st.skin === 'hud' ? hudSkin(d) : valuesSkin(d);
}
