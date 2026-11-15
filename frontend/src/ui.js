// Planning panels of the habitat console, as in Alex's navigation sketch: header, target picker with
// planned stay, verdict, the four safety rules, info rows, station details, the plan bar and the
// assumptions panel. They read the model (engine routes, grid, scenario) and the plan; nothing is searched.
import { hm, R, icon, numCell, esc, setHTML } from './format.js';
import { lmst, maxStay, doseAt, zoneAt, zoneHits, ttbAt, terrainAt, zoneDistance, M_PER_DEG } from './model.js';
import { src } from './sources.js';
import { orthoImage } from './crewviz.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// The plan habitat control is making: picked station, planned stay (-1 = as long as possible), test start
export const PLAN = { n: null, stay: 30, t0: 0, variant: 'safe' };
// The two A* routes per station (routes.json): "safe" avoids the protected zones (out/ret), "fastest"
// may cross them (fastest.out/ret). Stations without the second variant have the safe route only.
export const VARIANT_NAME = { safe: 'Protected zones avoided', fastest: 'Fastest route' };
// The route's length as the A* backend gives it (summary.json length_m), else the length along the track
export const routeLen = (leg) => leg.length_m_astar ?? leg.length_m;
const VARIANT_PHRASE = { safe: 'route that avoids the protected zones', fastest: 'fastest route' };
function legsOf(r, variant) {
  const fast = r.fastest && !r.fastest.same_as_safe ? r.fastest : null;
  const use = variant === 'fastest' && fast ? 'fastest' : 'safe';
  const pick = use === 'fastest' ? fast : r;
  const other = !fast ? null : use === 'fastest' ? { out: r.out, ret: r.ret, name: VARIANT_NAME.safe } : { out: fast.out, ret: fast.ret, name: VARIANT_NAME.fastest };
  return { variant: use, out: pick.out, ret: pick.ret, other, hasFast: !!fast, same: !!r.fastest?.same_as_safe };
}
// set by main.js: whether station s is an added target that can be removed (datatools.js canRemove)
export const HOOKS = { canRemove: () => false };
const rmBtn = (s, cls, txt) => `<button type="button" class="${cls}" data-rm-n="${s.n}" data-txt="${txt}" aria-label="Remove target ${s.n}, ${esc(s.name)}" title="Remove this added target">${icon('close')}<span>${txt}</span></button>`;

// The plan for station n: walk out and back on the engine's routes, stay, home time, max stay
export function planOf(model, n) {
  const s = model.stations.find((x) => x.n === n), r = model.routes.get(n);
  if (!s) return null;
  if (!r) return { n, station: s, ok: false, noRoute: true, t0: PLAN.t0 };
  const lg = legsOf(r, PLAN.variant), route = { ...r, out: lg.out, ret: lg.ret };
  const t0 = PLAN.t0, walk = lg.out.minutes, back = lg.ret.minutes, tArr = t0 + walk;
  const m = maxStay(model, back, tArr), max = m == null ? -1 : Math.floor(m);
  const inside = zoneAt(model, s);
  const crossed = [...new Set([...zoneHits(model, lg.out), ...zoneHits(model, lg.ret)].map((h) => h.zone.name))];
  const ok = max > 0 && !inside;
  const stay = !ok ? 0 : PLAN.stay < 0 ? max : Math.min(PLAN.stay, max);
  const tLeave = tArr + stay, tHome = tLeave + back;
  // metres inside the boxwork protection mask, from the A* summary (planetary protection: shown and logged)
  const protM = Math.max(lg.out.protected_m ?? 0, lg.ret.protected_m ?? 0);
  return { n, station: s, route, out: lg.out, ret: lg.ret, ok, t0, walk, back, tArr, max, stay, tLeave, tHome,
    capped: ok && PLAN.stay > max, reserve: model.ls - tHome, inside, crossed, protM,
    variant: lg.variant, variantName: VARIANT_NAME[lg.variant], other: lg.other, hasFast: lg.hasFast, sameRoute: lg.same };
}
export function rulesOf(model, P) {
  const r = P.route, early = P.tArr + P.back, home = P.ok ? P.tHome : early;
  const ttb = Math.max(r.out.max_ttb_min ?? 0, r.ret.max_ttb_min ?? 0);
  const slope = Math.max(r.out.max_slope_deg ?? 0, r.ret.max_slope_deg ?? 0);
  // longest radio gap of this station's route (radio_check.json, per variant), else the overall worst
  const rs = model.radio?.stations?.find((x) => x.station === P.n), rv = P.variant === 'fastest' ? rs?.fastest : rs;
  const radio = rv?.out || rv?.ret ? Math.max(rv.out?.longest_gap_min ?? 0, rv.ret?.longest_gap_min ?? 0) : model.radio?.longest_gap_min ?? null;
  const radioMax = model.sc.radio_gap_max_min ?? 5;
  return [
    { st: ttb <= 60 ? 'pass' : 'fail', l: 'Time to shelter', c: 'longest on the route · limit 60 min', v: R(ttb), u: 'min', vc: 'max', s: 'xEVA' },
    { st: slope <= model.sc.slope_block_deg ? 'pass' : 'fail', l: 'Slope, 10 m baseline', c: model.grid?.header?.files?.ridge ? `limit ${model.sc.slope_block_deg}° · ridge crossings: 0` : `limit ${model.sc.slope_block_deg}° · ridge mask pending`, v: slope.toFixed(1), u: '°', vc: 'max', s: 'DEM' },
    // one of the four rules that can say NO-GO (CLAUDE.md, PRODUCT.md, project page)
    { st: radio == null ? 'open' : radio <= radioMax ? 'pass' : 'fail', l: 'Radio gap', c: `longest on the route · limit ${radioMax} min`, v: radio == null ? null : radio.toFixed(1), u: 'min', vc: radio == null ? 'from data' : 'max', s: 'RADIO' },
    { st: home <= model.sunsetEva ? 'pass' : 'fail', l: 'Daylight', c: `home before sunset ${model.sc.sunset_lmst}`, v: lmst(model, home), u: '', vc: 'home', s: 'REMS' },
  ];
}

export function renderHeader(model, t) {
  $('#hdr-eva').textContent = `EVA ${String(model.sc.eva_number ?? '').padStart(2, '0')}`;
  $('#hdr-sol').textContent = `Sol ${model.sc.sol}`;
  $('#hdr-clock').textContent = `${lmst(model, t)} LMST`;
  // honesty: say so while any input is still a placeholder (files from public/data/placeholder/ or placeholder fields)
  const tag = $('#tag-data');
  if (tag) {
    const ph = model.placeholders?.size || model.sc.placeholder_fields?.length;
    tag.textContent = 'Placeholder data';
    tag.hidden = !ph;
    tag.title = ph ? `Placeholder inputs: ${[...(model.placeholders ?? []), ...(model.sc.placeholder_fields ?? [])].join(', ')}` : '';
  }
}

export function renderVerdict(model) {
  let o = '<div class="v-label">Planner recommendation · decision: <b>Habitat control</b></div>';
  const word = (w, cls) => `<div class="v-line"><span class="v-word ${cls}">${w}</span></div>`;
  const el = $('#verdict');
  if (PLAN.n == null) {
    o += '<p class="v-sub v-empty">Pick a station to plan the Marswalk. The verdict appears here.</p>';
    el.className = 'verdict';
  } else {
    const P = planOf(model, PLAN.n), s = P.station;
    const fail = P.noRoute ? [] : rulesOf(model, P).filter((r) => r.st === 'fail');
    const open = P.noRoute ? [] : rulesOf(model, P).filter((r) => r.st === 'open');
    const warn = P.noRoute ? [] : rulesOf(model, P).filter((r) => r.st === 'warn');
    const zoneM = P.noRoute ? 0 : P.protM, zoneNames = P.noRoute ? [] : P.crossed;
    if (P.ok && !fail.length) {
      const constrained = zoneM > 0 || zoneNames.length || warn.length;
      o += word('GO', 'go') + (constrained ? '<div class="v-cons">with constraints</div>' : '') +
        `<p class="v-sub">${esc(s.name)} on the ${VARIANT_PHRASE[P.variant]}: ${R(P.walk)} min out, ${hm(P.stay)} on station, home at ${lmst(model, P.tHome)} LMST with ${hm(P.reserve)} of life support left. ${open.length || warn.length ? `${4 - open.length - warn.length} of 4 rules pass${warn.length ? `; ${warn.map((r) => r.l.toLowerCase()).join(', ')} warns` : ''}${open.length ? `; ${open.map((r) => r.l.toLowerCase()).join(', ')} still open` : ''}.` : 'All four rules pass.'}</p>` +
        warn.map((r) => `<div class="v-status amber">${icon('warn')}Warning: ${r.l.toLowerCase()} ${r.v} ${r.u} on the ${VARIANT_PHRASE[P.variant]}, over the ${model.sc.radio_gap_max_min ?? 5}-minute planning limit · keep line of sight in mind</div>`).join('') +
        (zoneM > 0 || zoneNames.length ? `<div class="v-status blue">${icon('warn')}Constraint: the route runs ${zoneM > 0 ? `${R(zoneM)} m inside the boxwork protection zone` : `through ${esc(zoneNames.join(', '))}`}${P.variant === 'safe' && zoneM > 0 ? ' (the station lies inside it)' : ''} · every entry is logged</div>` : '');
      el.className = 'verdict is-go';
    } else {
      const why = P.noRoute ? `No route to ${esc(s.name)} from the routing engine.`
        : P.inside ? `${esc(s.name)} lies inside ${esc(P.inside.name)}, a protected zone.`
        : P.back > 60 ? `The way home from ${esc(s.name)} takes ${R(P.back)} min, over the 60-minute rule.`
        : !P.ok ? `Starting at EVA hour ${hm(PLAN.t0)}, the crew could not get back from ${esc(s.name)} before ${model.ls <= model.sunsetEva ? 'life support' : 'daylight'} runs out.`
        : `${fail[0].l} fails on the ${VARIANT_PHRASE[P.variant]}: ${fail[0].v}${fail[0].u ? ` ${fail[0].u}` : ''}, ${fail[0].c.split(' · ').pop()}.`;
      o += word('NO-GO', 'nogo') + `<p class="v-sub">${why}</p>`;
      el.className = 'verdict is-nogo';
    }
  }
  setHTML(el, o);
}

export function renderPicker(model) {
  $('#navpick-list').innerHTML = model.stations.map((s) => {
    const P = planOf(model, s.n), on = PLAN.n === s.n;
    let cap;
    if (P.noRoute) cap = '<b class="red">no route from the engine</b>';
    else {
      cap = `${R(P.walk)} min out · ${R(P.back)} back · ${P.ok ? `max stay ${hm(P.max)}` : P.inside ? `<b class="red">inside ${esc(P.inside.name)}</b>` : '<b class="red">cannot get home in time</b>'}`;
      const nogo = rulesOf(model, P).find((x) => x.st === 'fail');
      if (nogo) cap += ` · <b class="red">NO-GO: ${esc(nogo.l.toLowerCase())}</b>`;
      const radioWarn = rulesOf(model, P).find((x) => x.st === 'warn');
      if (radioWarn) cap += ` · <b class="amber-t">${esc(radioWarn.l.toLowerCase())} ${radioWarn.v} ${radioWarn.u}</b>`;
      if (P.protM > 0) cap += ` · <b class="blue">${R(P.protM)} m in protected zone</b>`;
      else if (P.crossed.length) cap += ` · <b class="blue">route enters ${esc(P.crossed.join(', '))}</b>`;
    }
    return `<li class="np-item"><button type="button" class="np-row${on ? ' is-on' : ''}" data-n="${s.n}" aria-pressed="${on}">` +
      `<span class="badge${on ? ' done' : ''}">${s.n}</span>` +
      `<span class="np-l">${esc(s.name)}<span class="cap">${cap}</span></span>` +
      `<span class="np-v">${P.noRoute ? '–' : `${(routeLen(P.out) / 1000).toFixed(2)} km`}<small>route</small></span></button>` +
      `${HOOKS.canRemove(s) ? rmBtn(s, 'np-rm', '') : ''}</li>`;
  }).join('');
  $$('#np-t0 button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.t0 === PLAN.t0)));
  // route variant: both buttons always shown; the fastest one only where it differs from the safe one
  const Pv = PLAN.n == null ? null : planOf(model, PLAN.n);
  $$('#np-variant button').forEach((b) => {
    const isFast = b.dataset.variant === 'fastest', can = !isFast || !Pv || Pv.hasFast;
    b.disabled = !can;
    b.setAttribute('aria-pressed', String(Pv ? Pv.variant === b.dataset.variant : PLAN.variant === b.dataset.variant));
  });
  $('#np-variant-cap').textContent = !Pv || Pv.noRoute ? 'two A* routes per station'
    : Pv.sameRoute ? 'both are the same route here'
    : !Pv.hasFast ? 'one route only'
    : `${R(routeLen(Pv.out))} m · ${R(Pv.walk)} min out · ${R(Pv.protM)} m in protected zone`;
  $$('#np-stay button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.stay === PLAN.stay)));
  const P = PLAN.n == null ? null : planOf(model, PLAN.n);
  $('#btn-start').disabled = !P || !P.ok;
  $('#np-note').innerHTML = !P ? 'Choose a station first'
    : !P.ok ? `<span class="red">${esc(P.station.name)}: no safe stay${P.noRoute ? ' (no route)' : ''}</span>`
    : `Stay ${hm(P.stay)}${P.capped ? ' (capped at the max stay)' : ''} · home ${lmst(model, P.tHome)} LMST`;
}

export function renderRules(model) {
  if (PLAN.n == null || planOf(model, PLAN.n).noRoute) {
    $('#rules-count').textContent = '';
    $('#rules').innerHTML = '<li class="rows-empty cap">Pick a station to check the route against the four rules.</li>';
  } else {
    const rows = rulesOf(model, planOf(model, PLAN.n));
    const fails = rows.filter((r) => r.st === 'fail').length, open = rows.filter((r) => r.st === 'open').length, warns = rows.filter((r) => r.st === 'warn').length;
    $('#rules-count').textContent = fails ? `${fails} of 4 fail` : `${4 - open - warns} of 4 pass${warns ? `, ${warns} warning` : ''}${open ? `, ${open} open` : ''}`;
    $('#rules').innerHTML = rows.map((r) => {
      const ic = r.st === 'pass' ? 'check' : r.st === 'fail' ? 'cross' : r.st === 'warn' ? 'warn' : 'info', w = r.st === 'pass' ? 'pass' : r.st === 'fail' ? 'fails' : r.st === 'warn' ? 'warning' : 'open';
      return `<li class="row4${r.st === 'fail' ? ' fail' : ''}"><span class="a"><span class="stat ${r.st === 'open' ? 'info' : r.st}">${icon(ic)}<span class="w">${w}</span></span></span>` +
        `<span class="l">${r.l}<span class="cap">${r.c}</span></span><span class="v">${numCell(r.v, r.u, r.vc)}</span><span class="s">${src(r.s)}</span></li>`;
    }).join('');
  }
  const P = PLAN.n == null ? null : planOf(model, PLAN.n), cmp = model.comparison;
  const dose = P && P.ok ? doseAt(model, P.tHome - P.t0).toFixed(2) : null;
  $('#info').innerHTML =
    `<li class="row4"><span class="a"><span class="stat info">${icon('info')}<span class="w">info</span></span></span><span class="l">Radiation dose, planned EVA<span class="cap">information only, never a gate · ${model.sc.dose_rate_msv_per_day} mSv per day</span></span><span class="v">${numCell(dose, 'mSv', dose ? 'planned' : 'pick a station')}</span><span class="s">${src('RAD')}</span></li>` +
    `<li class="row4"><span class="a"><span class="stat info">${icon('info')}<span class="w">info</span></span></span><span class="l">Compared with Curiosity<span class="cap">mean deviation of our routes from its drives${cmp ? ` · straight line ${R(cmp.straight_line_m)} m` : ''}</span></span><span class="v">${numCell(cmp ? R(cmp.mean_deviation_m) : null, 'm', cmp ? 'leave-one-out' : 'from engine')}</span><span class="s">${src('LOO')}</span></li>`;
}

// Station details with a ground image: the station's own picture when the data has one, else an orbital crop
export function renderTarget(model, onImage) {
  const el = $('#target');
  if (PLAN.n == null) { $('#target-cap').textContent = ''; el.innerHTML = '<p class="cap tg-empty">Pick a station in the list or on the map.</p>'; return; }
  const P = planOf(model, PLAN.n), s = P.station;
  $('#target-cap').textContent = `Stn ${s.n}`;
  const row = (l, cap, v, u, k) => `<li class="row4"><span class="a"></span><span class="l">${l}<span class="cap">${cap}</span></span><span class="v">${numCell(v, u)}</span><span class="s">${k ? src(k) : ''}</span></li>`;
  const pics = model.pictures.filter((b) => b.n === s.n);
  const img = pics.length ? `<div class="pic-strip${pics.length > 1 ? ' is-multi' : ''}">${pics.map((b, k) => `<button type="button" class="pic-btn" data-pic="${k}" data-n="${s.n}" aria-label="Open the Curiosity picture ${esc(b.titel_en || b.titel)}"><img src="${esc(b.src)}" alt="${esc(b.titel_en || b.titel)}, ${esc(b.kamera_en || b.kamera)}" loading="lazy"><span>${esc(b.titel_en || b.titel)}</span></button>`).join('')}</div>`
    : '<canvas width="168" height="108" id="tg-thumb" aria-hidden="true"></canvas>';
  const imgCap = pics.length ? `Curiosity, ${pics.map((b) => `${esc(b.kamera_en || b.kamera)}${b.sol ? ` sol ${b.sol}` : ` ${esc(b.aufnahme_von)}`}`).join(' · ')} · ${esc(pics[0].bildnachweis)}${pics.some((b) => b.hinweis_en) ? ` · <b class="amber-t">${esc(pics.find((b) => b.hinweis_en).hinweis_en)}</b>` : ''} · click to enlarge`
    : 'No Curiosity picture for this station yet: orbital crop';
  let rows = '';
  if (P.noRoute) rows = row('Route', 'not delivered by the routing engine', null, '', 'ROUTE');
  else {
    const vs = P.out.vertices;
    let up = 0, dn = 0, haveZ = vs.every((q) => q.elev_m != null);
    if (haveZ) for (let i = 1; i < vs.length; i++) { const dz = vs[i].elev_m - vs[i - 1].elev_m; if (dz > 0) up += dz; else dn -= dz; }
    const T = ttbAt(model, s, 'penalized'), zd = zoneDistance(model, s);
    const ter = terrainAt(model, s), z = s.elev_m ?? ter.z ?? vs[vs.length - 1].elev_m;
    const geo = s.elev_m == null && ter.z != null && ter.src === 'geomapper';
    rows = row('Route length', `habitat to the station · ${VARIANT_PHRASE[P.variant]} · A* backend`, (routeLen(P.out) / 1000).toFixed(2), 'km', 'ROUTE') +
      row('Inside the protected zone', P.variant === 'fastest' ? 'fastest route: may cross the boxwork protection mask' : 'route that avoids it where it can (A*)', R(P.protM), 'm', 'PP') +
      row('Walk out · back', `at ${model.sc.walk_speed_kmh} km/h, Tobler slope penalty; uphill and downhill differ`, `${R(P.walk)}·${R(P.back)}`, 'min', 'TOBLER') +
      row('Climb on the way out', haveZ ? `descent ${R(dn)} m` : 'needs elevation on the route', haveZ ? `+${R(up)}` : null, 'm', 'DEM') +
      row('Steepest on the route', `10 m baseline · limit ${model.sc.slope_block_deg}°`, (P.out.max_slope_deg ?? 0).toFixed(1), '°', 'DEM') +
      row('Max stay', P.max > 0 ? 'life support or daylight left, minus the way home' : 'cannot get home in time', P.max > 0 ? hm(P.max) : null, '', 'ASSUME') +
      row('Time to base from here', 'engine grid, zones avoided', Number.isFinite(T) ? R(T) : null, 'min', 'GRID') +
      row('Elevation', geo ? esc(model.dem.name.replace(/^Elevation,\s*/i, '')) : 'from the DEM, 10 m grid', z != null ? R(z) : null, 'm', geo ? 'GEOM' : 'DEM');
  }
  el.innerHTML = `<div class="tg-head"><span class="badge done">${s.n}</span><div><b>${esc(s.name)}</b><div class="cap">${esc(s.reason ?? '')}</div></div>${HOOKS.canRemove(s) ? rmBtn(s, 'btn tg-rm', 'Remove target') : ''}</div>` +
    `<div class="lg-media${pics.length ? ' has-pics' : ''}">${img}<div class="cap">${imgCap}</div></div><ul class="rows">${rows}</ul>`;
  const c = $('#tg-thumb');
  const im = c && orthoImage(model, onImage);
  if (c && im) { // 120 m wide crop of the orthophoto around the station
    const [[bs, bw], [bn, be]] = model.ortho.bounds;
    const px = (s.lon - bw) / (be - bw) * im.naturalWidth, py = (bn - s.lat) / (bn - bs) * im.naturalHeight;
    const mPerPx = (be - bw) * M_PER_DEG * Math.cos(s.lat * Math.PI / 180) / im.naturalWidth, sw = 120 / mPerPx, sh = sw * 108 / 168;
    const ctx = c.getContext('2d');
    ctx.filter = 'grayscale(1) contrast(.85)';
    ctx.drawImage(im, px - sw / 2, py - sh / 2, sw, sh, 0, 0, 168, 108);
    ctx.filter = 'none'; ctx.strokeStyle = 'rgba(36,89,168,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(84, 54, 9, 0, Math.PI * 2); ctx.stroke();
  }
}

// Big view of a Curiosity picture: title, camera, date, description, note and the source link
export function openPicture(model, n, k) {
  const pics = model.pictures.filter((b) => b.n === n), b = pics[k];
  if (!b) return;
  const box = $('#pic-box'), when = b.aufnahme_von === b.aufnahme_bis || !b.aufnahme_bis ? b.aufnahme_von : `${b.aufnahme_von} to ${b.aufnahme_bis}`;
  $('#pic-title').textContent = b.titel_en || b.titel;
  $('#pic-meta').textContent = `Station ${n} · Curiosity, ${b.kamera_en || b.kamera} · ${b.sol ? `sol ${b.sol}, ` : ''}${when} · ${b.bildnachweis}`;
  const im = $('#pic-img');
  im.src = b.big; im.alt = `${b.titel_en || b.titel}, ${b.kamera_en || b.kamera}`;
  $('#pic-fig').classList.toggle('is-wide', (b.breite_px || 1) / (b.hoehe_px || 1) > 2);
  $('#pic-desc').textContent = b.beschreibung_en || b.beschreibung;
  const note = $('#pic-note'); note.hidden = !(b.hinweis_en || b.hinweis); note.textContent = b.hinweis_en || b.hinweis || '';
  const a = $('#pic-src'); a.href = b.quelle_url; a.hidden = !b.quelle_url;
  $('#pic-prev').hidden = $('#pic-next').hidden = pics.length < 2;
  box.dataset.n = n; box.dataset.k = k;
  if (!box.open) box.showModal();
}

export function renderPlanBar(model) {
  const el = $('#bbar'), W = Math.max(200, el.clientWidth), H = 90, max = model.ls + model.sc.backup_min, LS = model.ls;
  const sx = (m) => 2 + (W - 4) * m / max;
  const o = [], y = 20, bh = 24, P = PLAN.n == null ? null : planOf(model, PLAN.n), T0 = PLAN.t0;
  for (let hr = 0; hr * 60 <= max; hr++) o.push(`<path d="M${sx(hr * 60).toFixed(1)} 14v4" stroke="#2B2D2F"/><text x="${sx(hr * 60).toFixed(1)}" y="10" text-anchor="${hr === 0 ? 'start' : hr * 60 === max ? 'end' : 'middle'}">${hr}:00</text>`);
  o.push(`<rect x="${sx(LS) + 1}" y="${y}" width="${sx(max) - sx(LS) - 1}" height="${bh}" rx="6" fill="rgba(43,45,47,.08)"/>`);
  if (W > 520) o.push(`<text x="${(sx(LS) + sx(max)) / 2}" y="${y + 16}" text-anchor="middle">backup ${hm(model.sc.backup_min)}</text>`);
  if (T0 > 0) o.push(`<rect x="${sx(0)}" y="${y}" width="${(sx(T0) - sx(0) - 2).toFixed(1)}" height="${bh}" rx="6" fill="rgba(43,45,47,.12)"/><text x="${((sx(0) + sx(T0)) / 2).toFixed(1)}" y="${y + 16}" text-anchor="middle">used (test start)</text>`);
  const seg = (a, b, fill, txt, txtFill) => {
    if (b <= a) return;
    o.push(`<rect x="${(sx(a) + 1).toFixed(1)}" y="${y}" width="${Math.max(1, sx(b) - sx(a) - 2).toFixed(1)}" height="${bh}" rx="6" fill="${fill}"/>`);
    if (txt && sx(b) - sx(a) > txt.length * 7 + 8) o.push(`<text x="${((sx(a) + sx(b)) / 2).toFixed(1)}" y="${y + 16}" text-anchor="middle" font-weight="700" style="fill:${txtFill}">${txt}</text>`);
  };
  if (P && P.ok) {
    seg(P.t0, P.tArr, '#2B2D2F', 'out', '#EDF0E6');
    seg(P.tArr, P.tLeave, '#2459A8', `Stn ${P.n}`, '#EDF0E6');
    seg(P.tLeave, P.tHome, '#8A8F92', 'home', '#2B2D2F');
    if (sx(LS) - sx(P.tHome) > 2) o.push(`<rect x="${sx(P.tHome).toFixed(1)}" y="${y + 0.75}" width="${(sx(LS) - sx(P.tHome) - 0.75).toFixed(1)}" height="${bh - 1.5}" rx="6" fill="none" stroke="#2B2D2F" stroke-width="1.2" stroke-dasharray="3 3"/>`);
  } else {
    o.push(`<text class="t-lbl" x="${sx(T0).toFixed(1)}" y="${y + bh + 16}" text-anchor="${T0 > 180 ? 'end' : 'start'}" style="fill:${P ? '#C8361F' : '#51575B'}">${P ? `No safe stay at ${esc(P.station.name)} from this start hour` : 'Pick a station to see the plan'}</text>`);
  }
  o.push(`<path d="M${sx(LS)} 12V${y + bh + 16}" stroke="#2B2D2F" stroke-width="2.5"/><text class="t-lbl" x="${sx(LS) + 4}" y="${y + bh + 30}">EVA limit</text>`);
  o.push(`<path d="M${sx(T0).toFixed(1)} 13V${y + bh + 6}" stroke="#C8361F" stroke-width="2"/><path d="M${(sx(T0) - 5).toFixed(1)} 12h10l-5 6z" fill="#C8361F"/>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="EVA plan: way out, stay and way home against the ${hm(LS)} limit">${o.join('')}</svg>`;
  const row = (k, v, cls = '') => `<div class="row${cls ? ` ${cls}` : ''}"><span class="k">${k}</span><span>${v}</span></div>`;
  $('#bsum').innerHTML = P && P.ok
    ? row('Way out', hm(P.walk)) + row(`Stay at Stn ${P.n}`, hm(P.stay)) + row('Way home', hm(P.back)) + row('Home at', `${lmst(model, P.tHome)} LMST`, 'total') + row('Reserve', hm(P.reserve))
    : row('Life support', hm(LS - T0)) + row('Sunset', `${model.sc.sunset_lmst} LMST`);
  $('#clk-lbl').textContent = 'EVA start';
  $('#clk-eva').textContent = hm(T0);
  $('#clk-cap').textContent = `${lmst(model, T0)} LMST · life support ${hm(LS - T0)}`;
}

// Each value with its source chip (hover or focus shows why it was chosen). Fixed for the rehearsal.
export function renderAssume(model) {
  const sc = model.sc;
  const ph = new Set(sc.placeholder_fields || []);
  const slope = sc.slope_penalty ?? (model.grid?.placeholder ? 'none (flat placeholder)' : model.grid ? 'Tobler 1993' : 'open');
  const rows = [
    { l: 'Walking speed, level ground', v: `${sc.walk_speed_kmh} km/h`, s: ['EWT'], note: 'Sets the return area and the 60-minute line (routing engine).', f: 'walk_speed_kmh' },
    { l: 'Slope penalty on walking speed', v: slope, s: ['TOBLER', 'ASSUME'], note: 'Tobler hiking function, normalised to the level-ground speed; fastest slightly downhill. Applying it to suited crews is an assumption (team decision 2026-11-14).', f: 'slope_penalty' },
    { l: 'Slope blocked above', v: `${sc.slope_block_deg}°`, s: ['xEVA'], note: `Suit design limit. Comfortable walking up to ${sc.slope_comfort_deg ?? 10}°.`, f: 'slope_block_deg' },
    { l: 'Walking speed when injured', v: `×${Number(sc.injury_factor).toFixed(2)}`, s: ['ASSUME'], note: 'Halves the speed in the rehearsal and doubles every time home.', f: 'injury_factor' },
    { l: 'Protected-zone buffer radius', v: `${sc.zone_buffer_m} m`, s: ['ASSUME', 'PP'], note: 'Zones follow planetary protection policy; the radius itself is ours.', f: 'zone_buffer_m' },
    { l: 'Planning clearance around zones', v: sc.zone_clearance_m != null ? `${sc.zone_clearance_m} m` : 'open', s: ['ASSUME'], note: 'Routes keep this distance outside the buffer where they can (soft penalty in the routing engine).', f: 'zone_clearance_m' },
    { l: 'Warning distance to a zone', v: `${sc.zone_warn_m ?? 10} m`, s: ['ASSUME'], note: 'Closer than this, the console warns and habitat control can reroute.', f: 'zone_warn_m' },
    { l: 'EVA duration', v: `${hm(sc.life_support_min)} + ${hm(sc.backup_min)} backup`, s: ['xEVA'], note: 'Life support; the backup hour is never planned with.', f: 'life_support_min' },
    { l: 'Caution margin, return stages', v: `${sc.caution_margin_min} min`, s: ['ASSUME'], note: 'Yellow when less spare time than this is left (rule B).', f: 'caution_margin_min' },
    { l: 'Sunset', v: `${sc.sunset_lmst} LMST`, s: ['REMS'], note: 'Daylight rule: home before sunset.', f: 'sunset_lmst' },
    { l: 'Radiation dose rate', v: `${sc.dose_rate_msv_per_day} mSv/day`, s: ['RAD'], note: 'Information only, never a gate.', f: 'dose_rate_msv_per_day' },
  ];
  $('#assume-body').innerHTML = rows.map((a) => {
    const kind = a.s[0] === 'ASSUME' ? 'Labeled assumption' : 'Sourced value';
    const cap = `${kind}${ph.has(a.f) ? ' · placeholder value for now' : ''} · ${a.note}`;
    return `<div class="as"><div class="as-top"><span class="as-l">${a.l}</span><output>${esc(a.v)}</output></div>` +
      `<div class="as-src">${a.s.map(src).join('')}<span class="cap">${esc(cap)}</span></div></div>`;
  }).join('') + '<p class="as-note">Fixed for the rehearsal. Every value carries its source or the label “assumption”; hover or focus a chip for the reason.</p>';
}
