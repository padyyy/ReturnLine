// Crew view: what the two crew members on the surface see, read-only, in three tabs:
// - Values: the five values as the console shows them.
// - Cuff: the forearm display in its hardware frame, with two modes: the values (default) and the
//   navigation map, heading up. Its keys only change the crew's view (DATA, MAP, ZOOM +/-).
// - HUD: the helmet HUD, a compass ring with a minimap, the return stage and up to three warnings.
// Cuff map and HUD follow Alex's navigation sketch (docs/design/navigation-hud-sketch.html).
import { hm, R, icon, numCell, esc, setHTML } from './format.js';
import { lmst, doseAt, maxStay, zoneDistance, zoneAt } from './model.js';
import { st, crewState, limits, stage, station, route, proximity, detourMin, activeLeg, walkFactor, homeTime } from './sim.js';
import { drawNavMap, hudSvg, heading, ZOOMS, STAGE } from './crewviz.js';

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
  else if (proximity(model) && !st.rerouted) Object.assign(d, { state: 'ZONE CLOSE', stateNum: `${R(proximity(model).d)} m`, cls: 'due' });
  else if (st.rerouted && detourMin(model) != null) d.stateNum = `−${Math.max(0, R(detourMin(model)))} min`;
  d.stage = stage(model, c.backMin, c.pos);
  return d;
}

// What the drawn views need: position, heading, the leg being walked, target, stage, warnings
function navState(model) {
  const c = crewState(model);
  const s = station(model);
  const r = route(model);
  const leg = activeLeg(model);
  const homeward = leg && leg.kind !== 'out';
  const t = st.t, lim = limits(model, t), f = st.phase === 'plan' ? 1 : walkFactor();
  const stg = stage(model, c.backMin, c.pos);
  const home = st.done || c.where === 'home';
  const at = c.where === 'station';
  const target = homeward || home || !s ? { kind: 'base', n: 'H', name: 'Habitat', ...model.habitat } : { kind: 'stn', n: s.n, name: s.name, lon: s.lon, lat: s.lat };
  const remM = c.where === 'out' ? c.pos.leftM : c.leftM ?? 0;
  const remMin = c.where === 'out' ? c.pos.leftMin : c.backMin ?? 0;
  const stay = at && r ? maxStay(model, r.ret.minutes, t) : null;
  return {
    pos: c.pos, hd: heading(leg?.track, leg?.tt ?? 0), active: leg?.track, tt: leg?.tt ?? 0, abort: leg?.kind === 'abort',
    outFaded: homeward && r ? r.out : null, target, home, at, stay, where: c.where,
    stations: model.stations, habitat: model.habitat, zones: model.zones,
    L: lim.L, f, which: st.abortAt != null ? 'allowed' : 'penalized', stage: home ? 'green' : stg?.name ?? 'green', spare: stg?.spare,
    zoomI: st.navZoom, base: st.navBase, red: st.injuredAt != null && !home,
    remM, remMin, ttb: c.backMin ?? 0, homeAt: homeTime(model),
    tEva: hm(t), lmst: lmst(model, t), sun: hm(model.sunsetEva - t), ls: hm(model.ls - t), dose: doseAt(model, t).toFixed(2),
    lsMin: model.ls - t, sunMin: model.sunsetEva - t,
  };
}

// Up to three warnings for the HUD, most urgent first (after Alex's sketch)
function warnings(model, n) {
  const w = [];
  const caution = model.sc.caution_margin_min;
  if (st.phase === 'plan') return [['ok', 'check', 'Waiting for Start']];
  if (n.home) return [['ok', 'check', `Crew home · ${n.lmst} LMST`]];
  if (n.at && n.stay != null && n.stay <= 0) w.push(['red', 'warn', 'Max stay reached · start the return now']);
  else if (n.at && n.stay != null && n.stay < caution) w.push(['amber', 'warn', `Start the return within ${hm(n.stay)}`]);
  else if (n.stage === 'red') w.push(['red', 'warn', 'Cannot get home in time · return to shelter now']);
  else if (n.stage === 'amber') w.push(['amber', 'warn', `Under ${caution} min to spare · head home soon`]);
  if (st.injuredAt != null) w.push(['red', 'warn', `Crew member injured · speed ×${model.sc.injury_factor}`]);
  const inside = zoneAt(model, n.pos), zd = zoneDistance(model, n.pos);
  if (inside) w.push(['blue', 'warn', `Inside ${inside.name}${st.abortAt != null ? ' · override' : ''}`]);
  else if (zd && zd.d < 60) w.push([zd.d <= (model.sc.zone_warn_m ?? 10) ? 'red' : 'blue', 'warn', `Protected zone ${R(zd.d)} m · ${zd.zone.name}`]);
  if (n.sunMin < 90) w.push(['red', 'warn', `Sunset in ${hm(n.sunMin)}`]);
  if (n.lsMin < 75) w.push(['red', 'warn', `Life support ${hm(n.lsMin)} left`]);
  if (!w.length) w.push(['ok', 'check', 'No warnings']);
  return w.slice(0, 3);
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

// Forearm display: the same hardware frame for both modes; the keys are real buttons that only change this view
function key(id, label, pressed) {
  return `<button type="button" class="cuff-key" data-key="${id}" aria-pressed="${pressed}" aria-label="Cuff key ${label}"><span>${label}</span></button>`;
}
function cuffSkin(d) {
  const mapMode = st.cuffMode === 'map';
  let screen;
  if (mapMode) {
    screen = '<div class="cuff-screen map"><canvas class="nav-cv" aria-label="Navigation map, heading up" role="img"></canvas>' +
      '<div class="nv-top"></div><svg class="nv-north" viewBox="0 0 34 34" aria-hidden="true"></svg>' +
      '<div class="nv-stage"></div><div class="nv-scale"><div class="bar"></div><span></span></div></div>';
  } else {
    const head = d.fill
      ? '<div class="cuff-state abort"><span>ABORT</span><span class="sub">RETURN TO SHELTER NOW</span></div>'
      : `<div class="cuff-state"><span>${d.state}</span><span>${d.stateNum}</span></div>`;
    screen = `<div class="cuff-screen">${head}` +
      `<div class="cuff-row"><span>NEXT ${esc(d.next.toUpperCase())}</span><b>${d.nextV}</b></div>` +
      `<div class="cuff-row"><span>TO BASE</span><b>${d.ttb}</b></div>` +
      `<div class="cuff-row"><span>RESERVE</span><b>${d.res}</b></div>` +
      `<div class="cuff-row"><span>LIFE SUPP*</span><b>${d.ls}</b></div>` +
      `<div class="cuff-row"><span>SUNSET IN</span><b>${d.sun}</b></div></div>`;
  }
  return '<div class="cuff"><div class="cuff-strap top"></div><div class="cuff-body">' +
    `<div class="cuff-keys l">${key('data', 'DATA', !mapMode)}${key('zoomin', 'ZOOM+', false)}</div>` +
    screen +
    `<div class="cuff-keys r">${key('zoomout', 'ZOOM−', false)}${key('map', 'MAP', mapMode)}</div>` +
    '</div><div class="cuff-strap bottom"></div>' +
    `<div class="cuff-note">Forearm display, read-only. ${mapMode ? `Navigation map, heading up · ${st.navBase === 'ortho' ? 'orthophoto' : 'plain'} · MAP again switches the base, ZOOM changes the scale.` : 'DATA shows these values, MAP the navigation map.'} *assumption</div></div>`;
}

function hudSkin() {
  return '<div class="hud"><div class="hud-face"></div><div class="hud-line"></div><ul class="hud-warn"></ul>' +
    '<div class="cuff-note">Helmet HUD, read-only. Heading = walking direction; ring colour = return stage (rule B). *assumption</div></div>';
}

export function renderCrew(model) {
  const el = document.getElementById('crew');
  el.setAttribute('data-skin', st.skin);
  el.querySelectorAll('.crew-head .seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.skin === st.skin)));
  const d = data(model);
  // only rebuild when the markup changes: keeps the map canvas and the HUD elements between clock ticks
  setHTML(document.getElementById('crew-body'), st.skin === 'cuff' ? cuffSkin(d) : st.skin === 'hud' ? hudSkin() : valuesSkin(d));
  crewFrame(model, true);
}

// Redraw the moving parts (map canvas, HUD) on every animation frame, at most ~30 times a second
let lastFrame = 0;
export function crewFrame(model, force = false) {
  const now = performance.now();
  if (!force && now - lastFrame < 33) return;
  lastFrame = now;
  if (st.skin === 'cuff' && st.cuffMode === 'map') {
    const cv = document.querySelector('#crew-body .nav-cv');
    if (!cv) return;
    const n = navState(model);
    const out = drawNavMap(cv, model, n, () => crewFrame(model, true));
    const box = cv.parentElement;
    box.querySelector('.nv-north').innerHTML = `<g transform="translate(17 17) rotate(${out.northDeg.toFixed(1)})"><path d="M0 -7L4.5 3.5H-4.5z" fill="#2B2D2F"/><text y="-8" text-anchor="middle" font-size="9.5" font-weight="800" fill="#2B2D2F">N</text></g>`;
    box.querySelector('.nv-scale .bar').style.width = `${out.scalePx.toFixed(1)}px`;
    box.querySelector('.nv-scale span').textContent = `${out.scaleM} m`;
    const top = box.querySelector('.nv-top');
    top.innerHTML = st.phase === 'plan' ? 'Waiting for Start'
      : n.home ? `Crew home · ${n.lmst}`
      : n.at ? `Stn ${n.target.n}${n.stay != null ? ` · stay <b>${hm(Math.max(0, n.stay))}</b>` : ''}`
      : `To ${n.target.kind === 'base' ? 'Habitat' : `Stn ${n.target.n}`} <b>${R(n.remM)} m</b> · ${R(n.remMin)} min`;
    const sg = STAGE[n.stage];
    const stEl = box.querySelector('.nv-stage');
    stEl.textContent = n.home ? 'HOME' : sg.hud;
    stEl.className = `nv-stage ${n.home ? 'green' : n.stage}`;
  } else if (st.skin === 'hud') {
    const face = document.querySelector('#crew-body .hud-face');
    if (!face) return;
    const n = navState(model);
    face.innerHTML = hudSvg(n);
    const left = st.phase === 'plan' ? 'At the habitat'
      : n.home ? 'Habitat · arrived'
      : n.at ? `Stn ${n.target.n} · max stay ${hm(Math.max(0, n.stay ?? 0))}`
      : `${n.target.kind === 'base' ? 'Base' : `Stn ${n.target.n}`} ${R(n.remM)} m · ${R(n.remMin)} min`;
    const right = st.phase === 'plan' || n.home ? '' : `Home ${lmst(model, n.homeAt)}`;
    setHTML(face.parentElement.querySelector('.hud-line'), `<span>${left}</span>${right ? `<span>${right}</span>` : ''}`);
    // the warning list is a live region: write it only when the warnings change
    setHTML(face.parentElement.querySelector('.hud-warn'), warnings(model, n).map(([cls, ic, txt]) => `<li class="${cls}">${icon(ic)}${esc(txt)}</li>`).join(''));
  }
}

// Cuff keys: view changes only (team decision of 2026-11-14)
export function cuffKey(model, id) {
  if (id === 'data') st.cuffMode = 'values';
  else if (id === 'map') { if (st.cuffMode === 'map') st.navBase = st.navBase === 'ortho' ? 'plain' : 'ortho'; else st.cuffMode = 'map'; }
  else if (id === 'zoomin') { st.cuffMode = 'map'; st.navZoom = Math.min(ZOOMS.length - 1, st.navZoom + 1); }
  else if (id === 'zoomout') { st.cuffMode = 'map'; st.navZoom = Math.max(0, st.navZoom - 1); }
  renderCrew(model);
}
