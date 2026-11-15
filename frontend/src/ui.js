// Console renderers: header, target picker, verdict, rules, info rows, station log, time budget,
// subtitles, banner, summary and the assumptions panel. They read the model and the sim state only.
import { hm, R, icon, numCell, srcChip, esc, setHTML } from './format.js';
import { lmst, pickerRows, doseAt, zoneAt, zoneHits, ttbAt } from './model.js';
import { st, route, station, crewState, limits, homeTime, scenarioStation, isScripted, zoneEvents, zoneNow, proximity, script, detourMin, rerouteTrack, warnM } from './sim.js';
import { BEATS } from './beats.js';

const $ = (s) => document.querySelector(s);
const SRC = {
  xEVA: ['NASA EVA', 'NASA, Exploration EVA System Concept of Operations, Rev B, 2020: 60-minute safe-haven rule, suit slope requirement up to 20°, radio-loss procedure.'],
  REMS: ['REMS', 'Curiosity REMS weather feed: sunrise and sunset per sol (last reading sol 4995).'],
  RAD: ['Hassler', 'Hassler et al. 2014, Science 343: 0.64 ± 0.12 mSv per day at Gale. Information only, never a gate.'],
  LOO: ['LOO', 'Leave-one-out comparison with Curiosity\'s drives (routing engine).'],
  ROUTE: ['routes', 'Precomputed routes from the routing engine (shared/data-contract.md).'],
  ASSUME: ['assum.', 'Labeled assumption, set by the team and listed in the Assumptions panel.'],
  TOBLER: ['Tobler', 'Tobler 1993, NCGIA Technical Report 93-1: hiking speed against slope, normalised so level ground gives the base speed; uphill and downhill differ. A terrestrial function, not validated for suited crews on Mars.'],
  EWT: ['EWT', 'About 2 km/h in NASA lunar planning (xEVA); 1.5 km/h on Mars is a labeled slowdown after Norcross et al., NASA TP-2009-214796.'],
  PP: ['COSPAR', 'COSPAR policy for human missions to Mars and NASA NID 8715.129 (2020): the reason for protected zones. Still to be checked against the primary texts.'],
};
const src = (k) => srcChip(SRC[k][0], SRC[k][1], k === 'ASSUME');

export function renderHeader(model) {
  $('#hdr-eva').textContent = `EVA ${String(model.sc.eva_number ?? '').padStart(2, '0')}`;
  $('#hdr-sol').textContent = `Sol ${model.sc.sol}`;
  $('#hdr-clock').textContent = `${lmst(model, st.t)} LMST`;
  const ph = model.placeholders.size > 0;
  const tag = $('#tag-data');
  tag.hidden = !ph;
  if (ph) tag.title = `Placeholder files: ${[...model.placeholders].join(', ')}. Missing: ${[...model.missing].join(', ') || 'none'}.`;
}

export function renderPicker(model) {
  const box = $('#picker');
  box.hidden = st.phase !== 'plan';
  if (box.hidden) return;
  const scen = scenarioStation(model);
  $('#pick-list').innerHTML = pickerRows(model).map((r) => {
    const on = st.target === r.n;
    let stay = r.stay == null ? 'max stay not available' : r.stay < 0 ? '<b class="red">cannot get home in time</b>' : `max stay ${hm(r.stay)}`;
    // planetary protection: a station inside a zone, or a route through one, is shown before Start
    const inside = zoneAt(model, r);
    const rt = model.routes.get(r.n);
    const crossed = rt ? [...zoneHits(model, rt.out), ...zoneHits(model, rt.ret)].map((h) => h.zone.name) : [];
    if (inside) stay += ` · <b class="red">inside ${esc(inside.name)}</b>`;
    else if (crossed.length) stay += ` · <b class="red">route enters ${esc([...new Set(crossed)].join(', '))}</b>`;
    return `<li><button type="button" class="pick-row${on ? ' is-on' : ''}" data-n="${r.n}" aria-pressed="${on}">` +
      `<span class="badge${on ? ' done' : ''}">${r.n}</span>` +
      `<span class="pick-l">${esc(r.name)}${r.n === scen ? ' <span class="pick-tag">six-beat scenario</span>' : ''}<span class="cap">back to base ${R(r.back)} min · ${stay}</span></span>` +
      `<span class="pick-v">${numCell(r.km?.toFixed(2), 'km', `${R(r.walk)} min walk`)}</span></button></li>`;
  }).join('');
  $('#btn-start').disabled = st.target == null;
  $('#pick-note').textContent = st.target == null ? 'Choose a station first'
    : isScripted(model) ? `Plays the six beats · EVA clock starts at ${model.sc.eva_start_lmst} LMST`
    : 'Navigation only: out and back, no scripted events';
}

function word(w, cls, count) {
  return `<div class="v-line"><span class="v-word ${cls}">${w}</span>${count ? `<span class="v-count">– ${count}</span>` : ''}</div>`;
}

export function renderVerdict(model) {
  const el = $('#verdict');
  el.hidden = st.phase === 'plan';
  if (el.hidden) return;
  const s = station(model);
  let o = '<div class="v-label">Planner recommendation · decision: <b>Habitat control</b></div>';
  const inZone = zoneNow(model);
  const zoneLine = inZone && !st.done
    ? `<div class="v-status red">${icon('warn')}Crew inside ${esc(inZone.name)} · ${st.abortAt != null ? 'override, logged' : 'entry logged'}</div>` : '';
  if (st.done) {
    o = `<div class="v-label">EVA closed · decisions: <b>Habitat control</b></div>${word('HOME', 'go')}` +
      `<p class="v-sub">Both crew members inside at ${lmst(model, st.t)} LMST.</p>`;
    if (st.abort) {
      const over = zoneEvents(model).filter((e) => e.override);
      const what = over.length ? over.map((e) => `${R(e.m)} m inside ${esc(e.zone.name)}`).join(', ') : (model.grid ? 'no protected zone entered' : 'zone metres need the grid');
      o += `<div class="v-status red">${icon('check')}Override logged · ${what} · reason: ABORT</div>`;
    }
  } else if (st.injuredAt != null && !st.abort) {
    // the two ways home from the crew's cell, at injured speed, against the return limit
    const lim = limits(model).L, c = crewState(model);
    const tp = ttbAt(model, c.pos, 'penalized'), ta = ttbAt(model, c.pos, 'allowed');
    const fact = (label, T) => {
      if (T == null) return `<li class="bad">${icon('cross')}<span>${label}</span><span class="num">needs grid</span></li>`;
      const ok = T * 2 <= lim;
      return `<li class="${ok ? 'good' : 'bad'}">${icon(ok ? 'check' : 'cross')}<span>${label}</span><span class="num">${R(T * 2)} min</span></li>`;
    };
    o += word('ABORT', 'abort') + `<p class="v-sub">Return to shelter now. A crew member is injured; walking speed is halved. Limit now ${R(lim)} min.</p>` +
      `<ul class="v-facts">${fact('Protected route home, injured', tp)}${fact('Route through the protected zone, injured', ta)}</ul>` +
      `<div class="v-actions"><button class="btn btn-abort" id="act-abort">${icon('check')}Confirm ABORT</button></div>`;
  } else if (st.abort) {
    o += word('ABORT', 'abort') + '<p class="v-sub">Override confirmed. The crew returns to the habitat.</p>' +
      `<div class="v-status red">${icon('check')}Override logged · reason: ABORT</div>`;
  } else {
    const lim = limits(model);
    const c = crewState(model);
    // proximity warning (design sketch, beat 4): live while the crew is within warn metres of a zone;
    // after the reroute the strip stays as the record until the next event
    const near = proximity(model);
    const sp = st.drift ? script(model) : null;
    const det = detourMin(model);
    const warnZone = near?.zone ?? (st.driftAt != null && st.injuredAt == null ? sp?.zone : null);
    const strips = [];
    if (lim.B < 60) strips.push(`<div class="constraint"><span class="trig">Crew leaves the return area</span>${icon('arrow')}<span class="act">ABORT: return to shelter now</span></div>`);
    if (warnZone) {
      const dTxt = near ? R(near.d) : R(warnM(model));
      strips.push(`<div class="constraint warn"><span class="trig">Crew ${dTxt} m from ${esc(warnZone.name)}</span>${icon('arrow')}<span class="act">${st.rerouted ? `Rerouted: +${Math.max(0, R(det ?? 0))} min` : 'Reroute around the zone'}</span></div>`);
    }
    o += word('GO', 'go', strips.length ? `${strips.length} constraint${strips.length > 1 ? 's' : ''}` : '') +
      `<p class="v-sub">${st.retStart == null ? `Target: ${esc(s?.name ?? '–')}. The route avoids every protected zone.` : near && !st.rerouted ? 'The crew is drifting toward a protected zone.' : 'Heading home.'}</p>` +
      strips.join('');
    if (st.retStart == null && c.where === 'station') o += `<div class="v-actions"><button class="btn btn-dark" id="act-return">${icon('arrow')}Start return</button></div>`;
    if (near && !st.rerouted) o += `<div class="v-actions"><button class="btn btn-dark" id="act-reroute">${icon('arrow')}Reroute around the zone</button></div>`;
    if (st.rerouted && st.injuredAt == null) {
      const rt = rerouteTrack(model);
      o += `<div class="v-status ok">${icon('check')}Reroute sent ${lmst(model, st.rerouteAt)}${rt ? ` · home ${lmst(model, st.rerouteAt + rt.minutes)}` : ''}</div>`;
    } else {
      o += `<div class="v-status ok">${icon('check')}GO confirmed at Start · ${model.sc.eva_start_lmst} LMST</div>`;
    }
  }
  setHTML(el, o + zoneLine);
}

export function renderRules(model) {
  const r = route(model) || model.routes.get(model.stations[0]?.n);
  const home = homeTime(model);
  const rows = [
    { l: 'Time to shelter', c: 'max on the route · limit 60 min', v: r?.out.max_ttb_min, u: 'min', s: 'xEVA' },
    // "ridge crossings: 0" is only true once the routing blocks ridges (ridge mask from the 1 m DEM)
    { l: 'Slope, 10 m baseline', c: model.grid?.header?.files?.ridge ? 'limit 20° · ridge crossings: 0' : 'limit 20° · ridge mask pending', v: r?.out.max_slope_deg, u: '°', s: 'xEVA' },
    { l: 'Radio gap', c: 'longest on the route · limit 5 min', v: model.radio?.longest_gap_min, u: 'min', s: 'xEVA' },
    { l: 'Daylight', c: `home before sunset ${model.sc.sunset_lmst}`, v: home == null ? null : lmst(model, home), u: '', s: 'REMS', ok: home == null ? null : home <= model.sunsetEva },
  ];
  let known = 0;
  $('#rules').innerHTML = rows.map((x) => {
    const has = x.v != null;
    if (has) known++;
    const stat = has ? `<span class="stat pass">${icon('check')}<span class="w">pass</span></span>` : `<span class="stat info">${icon('info')}<span class="w">open</span></span>`;
    return `<li class="row4"><span class="a">${stat}</span><span class="l">${x.l}<span class="cap">${x.c}</span></span>` +
      `<span class="v">${numCell(has ? (typeof x.v === 'number' ? x.v.toFixed(x.u === 'min' ? 0 : 1) : x.v) : null, x.u, has ? '' : 'from data')}</span><span class="s">${src(x.s)}</span></li>`;
  }).join('');
  $('#rules-count').textContent = `${known} of 4 with data`;
}

export function renderInfo(model) {
  const cmp = model.comparison;
  $('#info').innerHTML =
    `<li class="row4"><span class="a"><span class="stat info">${icon('info')}<span class="w">info</span></span></span><span class="l">Radiation dose this EVA<span class="cap">information only, never a gate · ${model.sc.dose_rate_msv_per_day} mSv per day</span></span><span class="v">${numCell(doseAt(model, st.t).toFixed(2), 'mSv', 'so far')}</span><span class="s">${src('RAD')}</span></li>` +
    `<li class="row4"><span class="a"><span class="stat info">${icon('info')}<span class="w">info</span></span></span><span class="l">Compared with Curiosity<span class="cap">mean deviation of our routes from its drives${cmp ? ` · straight line ${R(cmp.straight_line_m)} m` : ''}</span></span><span class="v">${numCell(cmp ? R(cmp.mean_deviation_m) : null, 'm', cmp ? 'leave-one-out' : 'from engine')}</span><span class="s">${src('LOO')}</span></li>`;
}

export function renderLog(model) {
  const s = station(model);
  const r = route(model);
  const E = [];
  const add = (t, title, text, cls = '') => E.push({ t, title, text, cls });
  if (st.phase !== 'plan' && s && r) {
    add(0, `Target: ${s.name}`, `Start · ${(r.out.length_m / 1000).toFixed(2)} km · ${R(r.out.minutes)} min walk`, 'decision');
    if (st.t >= r.out.minutes) add(r.out.minutes, `Arrived at ${s.name}`, s.reason);
    if (st.beat >= 2) add(285, 'Time jump to EVA hour 4:45', 'Rehearsal skips the quiet hours; the clock shows it');
    if (st.retStart != null) add(st.retStart, 'Return started', 'Habitat control', 'decision');
    if (st.t >= 300) add(300, 'Life support now sets the return area', 'Less than 60 min left');
    const sp = st.drift ? script(model) : null;
    if (st.driftAt != null) {
      add(st.driftAt, sp ? `Crew ${warnM(model)} m from ${sp.zone.name}` : 'Drift toward a protected zone',
        sp ? 'Drifting off the route toward a protected zone' : 'The drift needs the scenario station and the grid', 'finding');
    }
    for (const e of zoneEvents(model)) {
      add(e.t, `Entered ${e.zone.name}`, e.override ? `ABORT override · ${R(e.m)} m inside · logged` : `Protected zone · ${R(e.m)} m inside · logged`, 'finding');
    }
    if (st.rerouted) {
      const det = detourMin(model);
      add(st.rerouteAt ?? st.t, `Reroute around ${sp ? sp.zone.name : 'the zone'}`, `Habitat control${det != null ? ` · +${Math.max(0, R(det))} min detour` : ''}`, 'decision');
    }
    if (st.injuredAt != null) add(st.injuredAt, 'Crew member injured', 'Walking speed ×0.5 (assumption)', 'finding');
    if (st.abort) add(st.abortAt ?? st.injuredAt, 'ABORT confirmed · override', 'Habitat control', 'decision');
    if (st.done) add(st.t, 'Crew home', 'Both crew members inside the habitat');
  }
  const ol = $('#log');
  ol.innerHTML = E.length
    ? E.sort((a, b) => a.t - b.t).map((e) => `<li class="row4 lg ${e.cls}"><span class="a">${lmst(model, e.t)}</span><span class="l">${esc(e.title)}<span class="cap">${esc(e.text)}</span></span><span class="v"></span><span class="s"></span></li>`).join('')
    : '<li class="row4 lg"><span class="a">–</span><span class="l">Nothing logged yet<span class="cap">Pick a target and press Start</span></span><span class="v"></span><span class="s"></span></li>';
  ol.scrollTop = ol.scrollHeight;
}

export function renderBudget(model) {
  const el = $('#bbar');
  const W = Math.max(200, el.clientWidth), H = 90, max = 420;
  const sx = (m) => 2 + (W - 4) * m / max;
  const r = route(model);
  const o = [];
  for (let h = 0; h <= 7; h++) o.push(`<path d="M${sx(h * 60).toFixed(1)} 14v4" stroke="#2B2D2F"/><text x="${sx(h * 60).toFixed(1)}" y="10" text-anchor="${h === 0 ? 'start' : h === 7 ? 'end' : 'middle'}">${h}:00</text>`);
  const y = 20, bh = 24;
  o.push(`<rect x="${sx(360)}" y="${y}" width="${sx(420) - sx(360)}" height="${bh}" fill="rgba(43,45,47,.08)"/>`);
  if (W > 520) o.push(`<text x="${(sx(360) + sx(420)) / 2}" y="${y + 16}" text-anchor="middle">backup 1:00</text>`);
  let rows = '';
  if (r) {
    const arrive = r.out.minutes, turn = st.retStart ?? 300, home = homeTime(model);
    o.push(`<rect x="${sx(0)}" y="${y}" width="${sx(turn) - sx(0)}" height="${bh}" fill="#2B2D2F"/>`);
    o.push(`<rect x="${sx(arrive).toFixed(1)}" y="${y + 4}" width="${(sx(turn) - sx(arrive)).toFixed(1)}" height="${bh - 8}" fill="#2459A8"/>`);
    o.push(`<rect x="${sx(turn).toFixed(1)}" y="${y}" width="${(sx(home) - sx(turn)).toFixed(1)}" height="${bh}" fill="${st.abort ? '#C8361F' : '#8A8F92'}"/>`);
    const homeR = Math.round(home);
    if (homeR < 360) o.push(`<rect x="${sx(home).toFixed(1)}" y="${y + 0.75}" width="${(sx(360) - sx(home) - 0.75).toFixed(1)}" height="${bh - 1.5}" fill="none" stroke="#2B2D2F" stroke-width="1.2" stroke-dasharray="3 3"/>`);
    else o.push(`<rect x="${sx(360).toFixed(1)}" y="${y + bh + 4}" width="${(sx(Math.min(home, 420)) - sx(360)).toFixed(1)}" height="9" fill="#C8361F"/>`);
    // bar labels only where the segments are wide enough; the rows beside the bar always carry both values
    if (sx(turn) - sx(0) >= 130) o.push(`<text class="t-lbl" x="${(sx(0) + sx(turn)) / 2}" y="${y + bh + 30}" text-anchor="middle">Outbound ${hm(turn)}</text>`);
    if (sx(home) - sx(turn) >= 60 || sx(turn) - sx(0) >= 130) o.push(`<text class="t-lbl" x="${sx(turn) + 2}" y="${y + bh + 30}">Return ${hm(home - turn)}</text>`);
    const row = (k, v, cls = '') => `<div class="row ${cls}"><span class="k">${k}</span><span>${v}</span></div>`;
    rows = row('Outbound', hm(turn)) + row(st.rerouted ? 'Return incl. detour' : 'Return', hm(home - turn)) + row('Total of 6:00', hm(home), 'total') +
      (homeR <= 360 ? row('Reserve', hm(360 - home)) : row('Over by', hm(home - 360), 'over'));
  }
  o.push(`<path d="M${sx(360)} 12V${y + bh + 16}" stroke="#2B2D2F" stroke-width="2.5"/><text class="t-lbl" x="${sx(360) + 4}" y="${y + bh + 45}">EVA limit</text>`);
  if (st.beat >= 2) o.push(`<path d="M${sx(0)} ${y + bh + 3}H${sx(285)}" stroke="#E3B21B" stroke-width="3" stroke-dasharray="5 4"/>`);
  o.push(`<path d="M${sx(st.t).toFixed(1)} 13V${y + bh + 6}" stroke="#C8361F" stroke-width="2"/><path d="M${(sx(st.t) - 5).toFixed(1)} 12h10l-5 6z" fill="#C8361F"/>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Time budget against the 6-hour EVA limit">${o.join('')}</svg>`;
  $('#bsum').innerHTML = rows || '<div class="row"><span class="k">Pick a target to see the budget</span></div>';
  $('#clk-eva').textContent = hm(st.t);
  $('#clk-cap').textContent = `${lmst(model, st.t)} LMST · ${st.beat >= 2 ? 'after time jump' : 'simulation clock'}`;
  document.querySelectorAll('.clock .seg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.x === st.speedX)));
}

export function renderSubs(model) {
  const b = BEATS[st.beat - 1];
  const nav = !b && st.phase !== 'plan' && !isScripted(model);
  setHTML($('#subs-beat'), b ? `<span>Beat ${b.n}/6</span> · ${b.title}` : nav ? `<span>Navigation</span> · ${esc(station(model)?.name ?? '')}` : '<span>Planning</span>');
  const subText = b ? b.sub
    : nav ? 'The crew walks out and back along the planned route. The scripted beats belong to the scenario station.'
    : 'Habitat control picks a target. Start begins the rehearsed Marswalk.';
  if ($('#subs-text').textContent !== subText) $('#subs-text').textContent = subText;
  document.querySelectorAll('#tp-dots button').forEach((x, i) => (i + 1 === st.beat ? x.setAttribute('aria-current', 'step') : x.removeAttribute('aria-current')));
}

export function renderBanner(model) {
  const el = $('#banner');
  if (st.beat === 2) { el.className = 'banner'; el.innerHTML = `Time jump ${icon('arrow')} EVA hour <span class="num">4:45</span>`; el.hidden = false; }
  else if (st.beat === 5 && st.injuredAt != null) { el.className = 'banner event'; el.innerHTML = `${icon('warn')}Crew member injured · walking speed <span class="num">×${model.sc.injury_factor}</span> (assumption)`; el.hidden = false; }
  else el.hidden = true;
  const sm = $('#summary');
  if (st.done) {
    sm.innerHTML = `<header><h2>Crew home at ${lmst(model, st.t)} LMST</h2><p>EVA rehearsal complete. Summary for the debrief.</p></header><dl>` +
      `<div><dt>Life support left<span class="cap">1:00 backup untouched</span></dt><dd>${hm(model.ls - st.t)}</dd></div>` +
      `<div><dt>Inside protected zones<span class="cap">every entry logged</span></dt><dd>${R(zoneEvents(model).reduce((a, e) => a + e.m, 0))} m</dd></div>` +
      `<div><dt>Radiation dose<span class="cap">information only</span></dt><dd>${doseAt(model, st.t).toFixed(2)} mSv</dd></div></dl>` +
      '<p class="slogan">Explore Mars. Return Safely. Preserve the Evidence.</p>';
    sm.hidden = false;
  } else sm.hidden = true;
}

export function renderLegendNote(model) {
  const n = $('#legend-note');
  n.hidden = !!model.grid && !model.grid.placeholder;
  n.textContent = model.grid
    ? 'Placeholder grid: flat ground, no slope, no ridges. The routing engine replaces it; then the area follows the terrain.'
    : 'Return area and 60-minute line appear with the time-to-base grid from the routing engine.';
}

// Each value with its source chip (hover or focus shows why it was chosen), as in the design sketch.
// Fixed for the rehearsal, so no sliders.
export function renderAssume(model) {
  const sc = model.sc;
  const ph = new Set(sc.placeholder_fields || []);
  const slope = sc.slope_penalty ?? (model.grid?.placeholder ? 'none (flat placeholder)' : model.grid ? 'Tobler 1993' : 'open');
  const rows = [
    { l: 'Walking speed, level ground', v: `${sc.walk_speed_kmh} km/h`, s: ['EWT'], note: 'Sets the return area and the 60-minute line (routing engine).', f: 'walk_speed_kmh' },
    { l: 'Slope penalty on walking speed', v: slope, s: ['TOBLER', 'ASSUME'], note: 'Tobler hiking function, normalised to the level-ground speed; fastest slightly downhill. Applying it to suited crews is an assumption (team decision 2026-11-14).', f: 'slope_penalty' },
    { l: 'Slope blocked above', v: `${sc.slope_block_deg}°`, s: ['xEVA'], note: `Suit design limit. Comfortable walking up to ${sc.slope_comfort_deg ?? 10}°.`, f: 'slope_block_deg' },
    { l: 'Walking speed when injured', v: `×${Number(sc.injury_factor).toFixed(2)}`, s: ['ASSUME'], note: 'Halves the speed in beat 5 and doubles every time home.', f: 'injury_factor' },
    { l: 'Protected-zone buffer radius', v: `${sc.zone_buffer_m} m`, s: ['ASSUME', 'PP'], note: 'Zones follow planetary protection policy; the radius itself is ours.', f: 'zone_buffer_m' },
    { l: 'Planning clearance around zones', v: sc.zone_clearance_m != null ? `${sc.zone_clearance_m} m` : 'open', s: ['ASSUME'], note: 'Routes keep this distance outside the buffer where they can (soft penalty in the routing engine).', f: 'zone_clearance_m' },
    { l: 'Warning distance to a zone', v: `${warnM(model)} m`, s: ['ASSUME'], note: 'Closer than this, the console warns and habitat control can reroute (beat 4).', f: 'zone_warn_m' },
    { l: 'EVA duration', v: `${hm(sc.life_support_min)} + ${hm(sc.backup_min)} backup`, s: ['xEVA'], note: 'Life support; the backup hour is never planned with.', f: 'life_support_min' },
    { l: 'Caution margin, return stages', v: `${sc.caution_margin_min} min`, s: ['ASSUME'], note: 'Amber when less spare time than this is left (rule B).', f: 'caution_margin_min' },
    { l: 'Sunset', v: `${sc.sunset_lmst} LMST`, s: ['REMS'], note: 'Daylight rule: home before sunset.', f: 'sunset_lmst' },
    { l: 'Radiation dose rate', v: `${sc.dose_rate_msv_per_day} mSv/day`, s: ['RAD'], note: 'Information only, never a gate.', f: 'dose_rate_msv_per_day' },
  ];
  $('#assume-body').innerHTML = rows.map((a) => {
    const kind = a.s[0] === 'ASSUME' ? 'Labeled assumption' : 'Sourced value';
    const cap = `${kind}${ph.has(a.f) ? ' · placeholder value for now' : ''} · ${a.note}`;
    return `<div class="as"><div class="as-top"><span class="as-l">${a.l}</span><output>${esc(a.v)}</output></div>` +
      `<div class="as-src">${a.s.map(src).join('')}<span class="cap">${esc(cap)}</span></div></div>`;
  }).join('') +
    '<p class="as-note">Fixed for the rehearsal. Every value carries its source or the label “assumption”; hover or focus a chip for the reason.</p>';
}
