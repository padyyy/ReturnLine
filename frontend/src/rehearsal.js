// Emergency rehearsal, as in Alex's navigation sketch: "Simulate emergency" tells the six steps of
// docs/demo-script.md on the base map, from habitat control's view. One story strip under the map says
// where the story is and what it means; "Next step" plays one step. The right column shows what the crew
// sees at that step (helmet HUD, navigator, data sheet), plus the log and, at the end, the summary.
// The movement and the decisions come from sim.js (engine routes and return pointers); nothing is searched.
import { hm, R, icon, esc, setHTML } from './format.js';
import { lmst, doseAt, ttbAt, zoneHits } from './model.js';
import { st, route, station, crewState, resetRun, scenarioStation, limits, walkFactor, injure, injuryOptions, abortTrack, script, rerouteTrack, detourMin, activeLeg, stage, homeTime, zoneEvents, proximity, warnM } from './sim.js';
import { storySteps } from './beats.js';
import { renderViews, tile } from './crew.js';
import { placeValues } from './nav.js';
import { navViews, navView } from './layerstate.js';
import { ZOOMS } from './crewviz.js';
import { trackBearing, angNorm, angDiff } from './crewviz.js';
import { rulesOf, planOf, PLAN } from './ui.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const JUMP = 285, TURN = 300;                // time jump to EVA 4:45; planned turnaround at EVA 5:00 (docs/demo-script.md)
const PAUSE_MS = 4500;                       // reading time between steps with auto-play

export const SIM = { on: false, model: null, mapApi: null, F: null, steps: [], playing: false, autoplay: false, speedX: 60, view: 'data', follow: true, hd: null, onEnd: null,
  base: 'plain', zoomI: 1 };   // the navigator's map and zoom, switched like the tablet's keys 4, 2 and 3

// Without a drift the story times follow the way home, so a short route does not end before the injury
const noDrift = (r) => ({ t3: TURN + Math.min(12, r.ret.minutes * 0.4), d4: Math.min(2, r.ret.minutes * 0.1), d5: Math.min(1.5, r.ret.minutes * 0.1) });

// ---------- end state of each step (as main's goBeat) ----------
function endState(model, n) {
  resetRun(scenarioStation(model));
  const r = route(model);
  st.phase = 'run';
  if (n >= 1) st.t = r.out.minutes;
  if (n >= 2) st.t = Math.max(st.t, JUMP);
  const sp = n >= 3 ? (st.retStart = TURN, script(model)) : null;
  if (n >= 3) st.t = sp ? sp.tQa : noDrift(r).t3;
  if (n >= 4) {
    if (sp) { st.drift = true; st.driftAt = sp.tD; st.rerouted = true; st.rerouteAt = sp.tD + 0.5; st.t = st.rerouteAt; }
    else st.t += noDrift(r).d4;
  }
  if (n >= 5) { st.t += sp ? 1.5 : noDrift(r).d5; injure(model); }
  if (n >= 6) { st.abort = true; st.abortAt = st.t; st.t += crewState(model).backMin ?? 0; st.done = true; st.phase = 'done'; }
  st.beat = n;
}

// ---------- facts for the story, measured once on the data ----------
function collectFacts(model) {
  const s = station(model) || model.stations.find((x) => x.n === scenarioStation(model));
  const saved = PLAN.t0; PLAN.t0 = 0;
  const P = planOf(model, s.n);
  PLAN.t0 = saved;
  const rules = P && !P.noRoute ? rulesOf(model, { ...P, ok: true, tHome: Math.max(TURN, P.tArr) + P.back }) : [];
  const F = { station: s.name, n: s.n, nZones: model.zones.length, jump: JUMP, warnM: warnM(model),
    rulesPass: rules.filter((x) => x.st === 'pass' || x.st === 'warn').length, rulesOpen: rules.filter((x) => x.st === 'open').length,
    rulesWarn: rules.filter((x) => x.st === 'warn').map((x) => x.l.toLowerCase()),
    zonesAvoided: P && !P.noRoute && !P.crossed.length && !P.inside };
  // the planned route through the boxwork protection mask (A* summary), as the planning panel says it
  const rt = model.routes.get(s.n);
  F.protM = rt?.out?.protected_m ?? 0;
  F.lmstTurn = lmst(model, TURN); F.caution = model.sc.caution_margin_min ?? 15;
  endState(model, 3);   // on the way home: life support sets the limit
  F.L3 = limits(model).L; F.back3 = crewState(model).backMin ?? 0; F.spare3 = F.L3 - F.back3;
  endState(model, 4);
  F.ls4 = model.ls - st.t;
  const sp = script(model);
  F.drift = !!sp; F.zone = sp?.zone.name ?? null; F.detour = detourMin(model) ?? 0;
  endState(model, 5);
  const c = crewState(model), opt = injuryOptions(model);
  const pw = opt?.protectedWay, tw = opt?.throughWay;
  F.tInj = st.t; F.limInj = opt?.lim.L ?? limits(model).L; F.lsInj = model.ls - st.t;
  F.prot = pw ? pw.min : null; F.abrt = tw ? tw.min : null;
  F.protFits = pw ? pw.ok : null; F.abrtFits = tw ? tw.ok : null;
  F.protTrack = pw?.track ?? null; F.abrtTrack = tw?.track ?? null;
  F.injPos = c.pos;
  endState(model, 6);
  const over = zoneEvents(model).filter((e) => e.override);
  F.zoneM = R(over.reduce((a, e) => a + e.m, 0));
  F.abortZone = over[0]?.zone.name ?? (abortTrack(model) ? zoneHits(model, abortTrack(model))[0]?.zone.name : null) ?? F.zone;
  F.home = st.t; F.lsLeft = model.ls - st.t;
  resetRun(s.n);
  return F;
}

// ---------- base map ----------
function walked(track, tt) {
  if (tt >= track.minutes) return track;
  const v = track.vertices.filter((x) => x.t_min <= tt);
  return { vertices: v.length > 1 ? v : track.vertices.slice(0, 2), minutes: tt, length_m: 0 };
}
function renderMap() {
  const model = SIM.model, api = SIM.mapApi, r = route(model), F = SIM.F, b = st.beat;
  api.setArea({ L: limits(model).L, f: walkFactor(), which: st.abortAt != null ? 'allowed' : 'penalized',
    tracks: [r?.out, r?.ret, abortTrack(model), st.rerouted ? rerouteTrack(model) : null] });
  const sp = st.drift ? script(model) : null, det = detourMin(model);
  const cand = [], callouts = [], rings = [];
  if (b >= 5 && !st.abort && F.protTrack) {   // the two ways home after the injury, as habitat control weighs them
    cand.push({ track: F.protTrack, kind: 'cand-prot', label: `${F.nZones ? 'Protected route' : 'Way home'} · ${R(F.prot)} min · ${F.protFits ? 'fits' : 'too long'}`, tone: 'ink', at: 0.6 });
    const at = F.nZones ? F.abrtTrack : null;   // without zones both ways are the same
    if (at) cand.push({ track: at, kind: 'cand-abort', label: `Through the zone · ${R(F.abrt)} min · ${F.abrtFits ? 'fits' : 'too long'}`, tone: 'red', at: 0.4 });
  }
  if (sp && st.driftAt != null && st.t >= st.driftAt) rings.push(sp.D);
  if (b >= 5) rings.push(F.injPos);
  const ab = abortTrack(model);
  if (ab && st.abort) callouts.push({ pos: ab.vertices[Math.round(ab.vertices.length * 0.4)], text: F.zoneM > 0 ? `ABORT route · ${F.zoneM} m in the zone, logged` : 'ABORT route', tone: 'red' });
  api.showRoutes(r, {
    ret: st.retStart != null, faded: b >= 5,
    abort: ab, drift: sp ? walked(sp.drift, st.t - sp.tQa) : null,
    reroute: b === 4 ? rerouteTrack(model) : null,
    rerouteLabel: det != null && b === 4 ? `New route · +${Math.max(0, R(det))} min` : null,
    rings, candidates: cand, callouts,
  });
  const c = crewState(model);
  if (st.done || b < 1) api.setCrew(null);
  else api.setCrew(c.pos, { red: st.injuredAt != null, label: st.injuredAt != null ? 'Crew · EV2 injured' : 'Crew' });
  model.stations.forEach((s) => api.setStation(s.n, s.n === st.target ? (st.t >= r.out.minutes ? 'done' : 'target') : ''));
}

// ---------- what the crew sees: the view object for crew.js ----------
function simView() {
  const model = SIM.model, F = SIM.F, b = st.beat, t = st.t, r = route(model), s = station(model);
  const c = crewState(model), leg = activeLeg(model) || { kind: 'out', track: r.out, tt: 0 };
  const home = st.done || c.where === 'home', at = c.where === 'station';
  const homeward = leg.kind !== 'out' || home;
  const lim = limits(model), f = walkFactor(), which = st.abortAt != null ? 'allowed' : 'penalized', caution = model.sc.caution_margin_min;
  const sg = stage(model, c.backMin, c.pos);
  const T = ttbAt(model, c.pos, which);
  const hb = at || home ? null : trackBearing(leg.track, leg.tt);
  if (hb != null) SIM.hd = SIM.hd == null ? hb : angNorm(SIM.hd + angDiff(hb, SIM.hd) * 0.35);
  if (SIM.hd == null) SIM.hd = trackBearing(r.out, r.out.minutes - 1) ?? 0;
  const pv = placeValues(model, c.pos, leg.track, leg.tt);
  const homeAt = homeTime(model) ?? t;
  const v = {
    t, pos: c.pos, hd: SIM.hd, track: leg.track, tt: leg.tt, homeward, home, at,
    outFaded: homeward && leg.kind !== 'out' ? r.out : null,
    corridor: [r.out, r.ret, abortTrack(model), st.rerouted ? rerouteTrack(model) : null].filter(Boolean),
    target: homeward ? { kind: 'base', n: 'H', name: 'Habitat', ...model.habitat } : { kind: 'stn', n: s.n, name: s.name, lon: s.lon, lat: s.lat },
    targetN: s.n, stage: home ? 'green' : !sg ? 'green' : sg.name === 'amber' ? 'yellow' : sg.name, spare: sg?.spare ?? null, caution,
    L: lim.L, f, which, lim, ttb: Number.isFinite(T) ? T * f : null, abort: leg.kind === 'abort', abortRoute: st.abortAt != null,
    ls: model.ls - t, sun: model.sunsetEva - t, dose: doseAt(model, t),
    homeAt, reserve: model.ls - homeAt, red: st.injuredAt != null && !home,
    stay: TURN - r.out.minutes, max: TURN - r.out.minutes, tLeave: st.retStart ?? TURN, back: r.ret.minutes,
    stayLeft: (st.retStart ?? TURN) - t, onStation: Math.max(0, t - r.out.minutes),
    ...pv, rem: at || home ? { m: 0, min: 0 } : (c.where === 'out' ? { m: c.pos.leftM, min: c.pos.leftMin } : { m: c.leftM ?? pv.rem.m, min: c.backMin ?? pv.rem.min }),
  };
  if (home) return v;
  if (b >= 5) {                                  // ABORT is habitat control's verdict; the crew display follows it
    v.stage = 'red'; v.abortVerdict = true; v.allRed = !st.abort;
    if (!st.abort) {
      v.pending = true; v.spareTxt = 'route pending';
      v.turn = `${icon('warn')}<div><div class="to">ABORT · EV2 injured</div><div class="big">Stand by<small>route from habitat control</small></div></div>`;
      v.tileA = tile('ABORT · return to shelter now', 'Stand by', '', 'route from habitat control', '');
      v.tileB = tile('Walking speed', `×${model.sc.injury_factor}`, '', 'EV2 injured', 'ASSUME');
      v.hudLine = '<span>ABORT · stand by</span><span>route pending</span>';
      v.warn = [['red', 'warn', `EV2 injured · walking speed ×${model.sc.injury_factor}`], ['red', 'warn', 'Stand by: route from habitat control']];
    } else {
      v.spareTxt = `${R(model.ls - homeAt)} min spare`;
      v.tileB = tile('ABORT route', lmst(model, homeAt), '', `${F.zoneM > 0 ? `through ${esc(F.abortZone)} · ` : ''}override logged`, 'ROUTE');
      v.warn = [['red', 'warn', 'ABORT · return to shelter now']];
    }
  } else if (b === 4 && proximity(model) && !st.rerouted) {
    v.warn = [['red', 'warn', `Stop · protected zone ${R(proximity(model).d)} m ahead`]];
  }
  return v;
}
let uiT = 0;
function astro(forceUi) {
  const v = simView(), now = performance.now(), ui = forceUi || now - uiT > 200;
  if (ui) uiT = now;
  renderViews(SIM.model, v, { map: SIM.view === 'nav', hud: SIM.view === 'hud', ui, zoomI: SIM.zoomI, base: SIM.base, small: false, onReady: () => astro(true) });
}

// ---------- story strip, habitat control's decision, time budget, log, summary ----------
function renderHc() {
  const model = SIM.model, F = SIM.F, b = st.beat, t = st.t, Z = F.zone ?? 'the zone';
  let o = '<div class="hc-label">Habitat control decides</div>';
  const word = (w, cls, count) => `<div class="v-line"><span class="v-word ${cls}">${w}</span>${count ? `<span class="v-count">${count}</span>` : ''}</div>`;
  const note = (txt) => `<p class="hc-note">${txt}</p>`;
  const constraint = (trig, act, warn) => `<div class="constraint${warn ? ' warn' : ''}"><span class="trig">${trig}</span>${icon('arrow')}<span class="act">${act}</span></div>`;
  const action = (id, cls, ic, txt) => `<div class="v-actions"><span class="btn ${cls} hc-act" id="${id}">${icon(ic)}${txt}</span></div>`;
  const status = (cls, ic, txt) => `<div class="v-status${cls ? ` ${cls}` : ''}">${icon(ic)}<span>${txt}</span></div>`;
  const fact = (ok, txt, num) => `<li class="${ok ? 'good' : 'bad'}">${icon(ok ? 'check' : 'cross')}<span>${txt}</span><span class="num">${num}</span></li>`;
  const logged = F.zoneM > 0 ? `Override logged · ${F.zoneM} m in ${esc(F.abortZone)} · reason: ABORT` : 'ABORT logged · no override needed';
  if (b === 1) {
    const ok = F.rulesPass + F.rulesOpen === 4 && F.zonesAvoided;
    o += word(ok ? 'GO' : 'NO-GO', ok ? 'go' : 'nogo') + note(`${F.rulesPass} of 4 rules pass${F.rulesOpen ? `, ${F.rulesOpen} open` : ''} · turnaround ${lmst(model, TURN)}`);
    if (!ok) o += status('red', 'warn', `Rehearsed anyway: ${F.zonesAvoided ? 'a rule is open or fails' : 'the route enters a protected zone'}`);
    else o += st.t > 0 ? status('ok', 'check', `GO confirmed · ${lmst(model, 0)} LMST`) : action('act-go', 'btn-go', 'check', 'Confirm GO');
  } else if (b === 2 || (b === 3 && st.retStart == null)) {
    o += word('GO', 'go') + note(t < TURN ? `On plan at ${esc(F.station)}. Turnaround at ${lmst(model, TURN)}.` : 'Turnaround now.');
    o += st.retStart == null && b === 3 ? action('act-return', 'btn-dark', 'arrow', 'Start return') : status('ok', 'check', `GO confirmed ${lmst(model, 0)} LMST`);
  } else if (b <= 4) {
    o += word('GO', 'go', '1 constraint');
    if (b === 4 && st.driftAt != null && t >= st.driftAt - 0.01) {
      o += constraint(`Crew ${F.warnM} m from ${esc(Z)}`, st.rerouted ? `Rerouted, +${R(Math.max(0, F.detour))} min` : 'Reroute', true);
      o += st.rerouted ? status('', 'check', `New route sent ${lmst(model, st.rerouteAt)} · home ${lmst(model, homeTime(model))} LMST`) : action('act-reroute', 'btn-dark', 'arrow', `Reroute around ${esc(Z)}`);
    } else {
      const lim = limits(model), spare = lim.L - (crewState(model).backMin ?? 0);
      o += note(`Return started ${lmst(model, st.retStart ?? TURN)}. Limit now ${R(lim.L)} min, set by ${lim.by === "life support" ? "" : "the "}${lim.by} · ${R(Math.max(0, spare))} min to spare.`);
      o += constraint('If the spare time runs out', 'ABORT: return to shelter now');
    }
  } else if (b === 5 || !st.abort) {
    o += word('ABORT', 'abort', `life support ${R(F.lsInj)} min`) + note('Injury on the EVA: return to shelter now.');
    if (F.prot != null) o += `<ul class="v-facts">${F.nZones ? `${fact(F.protFits, `Protected route: ${F.protFits ? 'fits' : 'too long'}`, `${R(F.prot)} min`)}${fact(F.abrtFits, `Through the zone: ${F.abrtFits ? 'fits' : 'too long'}`, `${R(F.abrt)} min`)}` : fact(F.protFits, `Way home: ${F.protFits ? 'fits' : 'too long'}`, `${R(F.prot)} min`)}</ul>`;
    o += action('act-abort', 'btn-abort', 'check', 'Confirm ABORT');
  } else if (st.done) {
    o += word('HOME', 'go') + note(`Inside at ${lmst(model, st.t)} LMST · ${R(model.ls - st.t)} min of life support left`);
    o += status('red', 'check', logged);
  } else {
    o += word('ABORT', 'abort') + note(`ABORT confirmed ${lmst(model, st.abortAt)}. The crew walks home on the ABORT route.`);
    o += status('red', 'check', logged);
  }
  setHTML($('#hc'), o);
}
function renderStory() {
  const b = st.beat, be = SIM.steps[b - 1], done = st.done, nxt = SIM.steps[b];
  $$('#st-steps li').forEach((li, i) => {
    li.className = (done || i + 1 < b) ? 'is-done' : i + 1 === b ? 'is-now' : '';
    if (i + 1 === b && !done) li.firstChild.setAttribute('aria-current', 'step'); else li.firstChild.removeAttribute('aria-current');
  });
  $('#st-count').textContent = done ? 'Rehearsal complete' : `Step ${b} of ${SIM.steps.length}`;
  const ti = $('#st-title');
  ti.textContent = done ? 'Crew home' : be.title;
  ti.className = `st-title${!done && b >= 5 ? ' is-alert' : ''}`;
  const F = SIM.F, model = SIM.model;
  const stText = done ? `Both crew members are inside at ${lmst(model, st.t)} LMST with ${R(model.ls - st.t)} min of life support left.${F.zoneM > 0 ? ` ${F.zoneM} m inside ${F.abortZone}, logged with the reason ABORT.` : ''}` : be.text;
  if ($('#st-text').textContent !== stText) $('#st-text').textContent = stText;
  $('#st-watch').textContent = done ? 'On the right: the summary for the debrief.' : be.watch;
  let k, tt;
  if (SIM.playing) { k = 'Playing'; tt = 'Skip to the end of this step'; }
  else if (done || !nxt) { k = 'Finished'; tt = 'Play again'; }
  else { k = 'Next step'; tt = nxt.nav; }
  const nx = $('#st-next');
  nx.className = `btn st-next${SIM.playing ? '' : ' btn-dark'}`;
  nx.innerHTML = `<span class="st-nx"><span class="st-k">${k}</span><span class="st-t">${tt}</span></span>${icon(done && !SIM.playing ? 'play' : 'arrow')}`;
  $('#st-back').disabled = b === 1 && !done;
  $('#sv-tab-sum').hidden = !done;
  $('#sv-hint').textContent = !SIM.follow ? 'View pinned. Switch on “Follow the story” to let it change with the steps.' : SIM.view === 'log' ? 'Habitat control’s station log.' : done ? 'The summary for the debrief.' : be.crew;
}
function renderSummary() {
  const model = SIM.model, F = SIM.F;
  $('#summary').innerHTML = !st.done ? '' :
    `<header><h2>Crew home at ${lmst(model, st.t)} LMST</h2><p>EVA rehearsal complete. Summary for the debrief.</p></header><dl>` +
    `<div><dt>Life support left<span class="cap">${hm(model.sc.backup_min)} backup untouched</span></dt><dd>${R(model.ls - st.t)} min</dd></div>` +
    (F.zoneM > 0
      ? `<div><dt>Inside protected zones<span class="cap">ABORT override, logged with its reason</span></dt><dd class="red">${F.zoneM} m</dd></div>`
      : `<div><dt>Inside the boxwork protection zone<span class="cap">${F.protM > 0 ? 'planned route; the station lies inside it · logged' : 'the route stays outside'}</span></dt><dd>${R(F.protM)} m</dd></div>`) +
    `<div><dt>Decision<span class="cap">${F.protFits === false ? 'the time-to-shelter rule fired' : 'no safety rule fired; the injury alone means ABORT'}</span></dt><dd class="txt">ABORT, ${lmst(model, F.tInj)}</dd></div>` +
    `<div><dt>Science station<span class="cap">reached before the injury</span></dt><dd class="txt">${esc(F.station)}</dd></div>` +
    `<div><dt>Radiation dose<span class="cap">information only</span></dt><dd>${doseAt(model, st.t).toFixed(2)} mSv</dd></div></dl>` +
    `<p class="slogan">Explore Mars. Return Safely. Preserve the Evidence.<span>Rehearsal on the console's data. Every number carries its source.</span></p>`;
}
function renderLog() {
  const model = SIM.model, s = station(model), r = route(model), E = [];
  const add = (t, title, text, cls = '') => E.push({ t, title, text, cls });
  if (s && r && st.beat >= 1) {
    add(0, `Target: ${s.name}`, `GO · ${((r.out.length_m_astar ?? r.out.length_m) / 1000).toFixed(2)} km · ${R(r.out.minutes)} min walk`, 'decision');
    if (SIM.F?.protM > 0) add(0.01, 'Planned entry: boxwork protection zone', `${R(SIM.F.protM)} m on the way out · the station lies inside it · logged`, 'finding');
    if (st.t >= r.out.minutes) add(r.out.minutes, `Arrived at ${s.name}`, s.reason ?? '');
    if (st.beat >= 2) add(JUMP, `Time jump to EVA hour ${hm(JUMP)}`, 'Rehearsal skips the quiet hours; the clock shows it');
    if (st.retStart != null) add(st.retStart, 'Return started', 'Habitat control', 'decision');
    const sp = st.drift ? script(model) : null;
    if (st.driftAt != null && st.t >= st.driftAt) add(st.driftAt, sp ? `Crew ${warnM(model)} m from ${sp.zone.name}` : 'Drift toward a protected zone', 'Drifting off the route toward a protected zone', 'finding');
    for (const e of zoneEvents(model)) add(e.t, `Entered ${e.zone.name}`, e.override ? `ABORT override · ${R(e.m)} m inside · logged` : `Protected zone · ${R(e.m)} m inside · logged`, 'finding');
    if (st.rerouted && st.rerouteAt != null && st.t >= st.rerouteAt) add(st.rerouteAt, `Reroute around ${sp ? sp.zone.name : 'the zone'}`, `Habitat control · +${Math.max(0, R(detourMin(model) ?? 0))} min detour`, 'decision');
    if (st.injuredAt != null) add(st.injuredAt, 'Crew member injured', `Walking speed ×${model.sc.injury_factor} (assumption)`, 'finding');
    if (st.abort) add(st.abortAt, SIM.F?.zoneM > 0 ? 'ABORT confirmed · override' : 'ABORT confirmed', 'Habitat control · return to shelter now', 'decision');
    if (st.done) add(st.t, 'Crew home', 'Both crew members inside the habitat');
  }
  $('#sv-log').innerHTML = E.length ? E.sort((a, b) => a.t - b.t).map((e) => `<li class="row4 lg ${e.cls}"><span class="a">${lmst(model, e.t)}</span><span class="l">${esc(e.title)}<span class="cap">${esc(e.text)}</span></span><span class="v"></span><span class="s"></span></li>`).join('')
    : '<li class="row4 lg"><span class="a">–</span><span class="l">Nothing logged yet<span class="cap">The log starts with GO</span></span><span class="v"></span><span class="s"></span></li>';
}
function renderBar() {
  const model = SIM.model, el = $('#bbar'), W = Math.max(200, el.clientWidth), H = 90, LS = model.ls, max = LS + model.sc.backup_min;
  const sx = (m) => 2 + (W - 4) * m / max, r = route(model), b = st.beat, t = st.t, o = [], y = 20, bh = 24;
  const rect = (a, c, fill, extra = '') => o.push(`<rect x="${sx(a).toFixed(1)}" y="${y}" width="${Math.max(0, sx(c) - sx(a)).toFixed(1)}" height="${bh}" rx="6" fill="${fill}"${extra}/>`);
  for (let hr = 0; hr * 60 <= max; hr++) o.push(`<path d="M${sx(hr * 60).toFixed(1)} 14v4" stroke="#2B2D2F"/><text x="${sx(hr * 60).toFixed(1)}" y="10" text-anchor="${hr === 0 ? 'start' : hr * 60 === max ? 'end' : 'middle'}">${hr}:00</text>`);
  rect(LS, max, 'rgba(43,45,47,.08)');
  if (W > 520) o.push(`<text x="${(sx(LS) + sx(max)) / 2}" y="${y + 16}" text-anchor="middle">backup ${hm(model.sc.backup_min)}</text>`);
  const turn = st.retStart ?? TURN, home = homeTime(model);
  rect(0, turn, '#2B2D2F');
  o.push(`<rect x="${sx(r.out.minutes).toFixed(1)}" y="${y + 4}" width="${(sx(turn) - sx(r.out.minutes)).toFixed(1)}" height="${bh - 8}" rx="4" fill="#2459A8"/>`);
  if (sx(turn) - sx(r.out.minutes) > 40) o.push(`<text x="${((sx(r.out.minutes) + sx(turn)) / 2).toFixed(1)}" y="${y + 16}" text-anchor="middle" font-weight="700" style="fill:#EDF0E6">Stn ${route(model).station}</text>`);
  if (st.abort) { rect(turn, st.abortAt, '#8A8F92'); rect(st.abortAt, home, '#C8361F'); o.push(`<text x="${((sx(st.abortAt) + sx(home)) / 2).toFixed(1)}" y="${y + 16}" text-anchor="middle" font-weight="700" style="fill:#EDF0E6">ABORT</text>`); }
  else rect(turn, home, b >= 5 ? 'rgba(200,54,31,.25)' : '#8A8F92', b >= 5 ? ' stroke="#C8361F" stroke-width="1.5" stroke-dasharray="4 3"' : '');
  if (sx(LS) - sx(home) > 2) o.push(`<rect x="${sx(home).toFixed(1)}" y="${y + 0.75}" width="${(sx(LS) - sx(home) - 0.75).toFixed(1)}" height="${bh - 1.5}" rx="6" fill="none" stroke="#2B2D2F" stroke-width="1.2" stroke-dasharray="3 3"/>`);
  else if (home > LS) o.push(`<rect x="${sx(LS).toFixed(1)}" y="${y + bh + 4}" width="${(sx(Math.min(home, max)) - sx(LS)).toFixed(1)}" height="9" fill="#C8361F"/>`);
  o.push(`<path d="M${sx(LS)} 12V${y + bh + 16}" stroke="#2B2D2F" stroke-width="2.5"/><text class="t-lbl" x="${sx(LS) + 4}" y="${y + bh + 30}">EVA limit</text>`);
  o.push(`<text class="t-lbl" x="${(sx(0) + sx(turn)) / 2}" y="${y + bh + 30}" text-anchor="middle">Outbound ${hm(turn)}</text>`);
  if (b >= 2) o.push(`<path d="M${sx(0)} ${y + bh + 3}H${sx(JUMP)}" stroke="#E8622C" stroke-width="3" stroke-dasharray="5 4"/><path d="M${sx(JUMP)} ${y + bh + 3}H${sx(Math.max(JUMP, t)).toFixed(1)}" stroke="#E8622C" stroke-width="3"/>`);
  o.push(`<path d="M${sx(t).toFixed(1)} 13V${y + bh + 6}" stroke="#C8361F" stroke-width="2"/><path d="M${(sx(t) - 5).toFixed(1)} 12h10l-5 6z" fill="#C8361F"/>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Time budget against the ${hm(LS)} EVA limit">${o.join('')}</svg>`;
  const row = (k, v, cls = '') => `<div class="row${cls ? ` ${cls}` : ''}"><span class="k">${k}</span><span>${v}</span></div>`;
  $('#bsum').innerHTML = row('Outbound', hm(turn)) + row(st.abort ? 'Return incl. ABORT' : st.rerouted ? 'Return incl. detour' : 'Return', hm(home - turn)) +
    row(`Total of ${hm(LS)}`, hm(home), 'total') + (home <= LS ? row('Reserve', hm(LS - home)) : row('Over by', hm(home - LS), 'over'));
  $('#clk-lbl').textContent = 'EVA';
  $('#clk-eva').textContent = hm(t);
  $('#clk-cap').textContent = `${lmst(model, t)} LMST · ${b >= 2 ? 'after time jump' : 'rehearsal clock'}`;
  $('#hdr-clock').textContent = `${lmst(model, t)} LMST`;
}

function autoView() {
  const want = st.done ? 'sum' : SIM.steps[st.beat - 1].view;
  if (SIM.follow ? SIM.view !== want : (SIM.view === 'sum' && !st.done)) setView(want, true);
}
function setView(v, quiet) {
  SIM.view = v;
  $$('#simview .sv-slot').forEach((el) => { el.hidden = el.dataset.v !== v; });
  $$('#sv-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  if (!quiet && SIM.on) { astro(true); renderStory(); }
}
let lastMin = -1;
function renderAll() {
  autoView();
  renderMap(); renderHc(); renderStory(); renderBar(); renderLog(); renderSummary();
  lastMin = Math.floor(st.t);
  astro(true);
}
function frame() {
  if (Math.floor(st.t) !== lastMin) { renderAll(); return; }
  renderMap(); astro(false);
  $('#clk-eva').textContent = hm(st.t);
}

// ---------- step player ----------
let tok = 0, raf = 0;
const sleep = (ms, k) => new Promise((res, rej) => setTimeout(() => (k === tok ? res() : rej(new Error('stop'))), ms));
function clock(t1, k, speed) {
  return new Promise((res, rej) => {
    let last = performance.now();
    const tick = (now) => {
      if (k !== tok) return rej(new Error('stop'));
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      st.t = Math.min(t1, st.t + dt * (speed ?? SIM.speedX) / 60);
      if (st.t >= t1) { renderAll(); return res(); }
      frame();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
function press(sel) { const b = $(sel); if (b) b.classList.add('is-pressed'); }
async function beatScript(n, k) {             // what moves in a step; habitat control's decisions are pressed by the script
  const model = SIM.model, r = route(model);
  if (n === 1) { await sleep(1200, k); press('#act-go'); await sleep(380, k); await clock(r.out.minutes, k, 240); await sleep(300, k); }
  if (n === 2) { await sleep(500, k); st.t = Math.max(st.t, JUMP); renderAll(); await sleep(400, k); }
  if (n === 3) {
    await clock(TURN, k); press('#act-return'); await sleep(400, k); st.retStart = st.t; renderAll();
    const sp = script(model); await clock(sp ? sp.tQa : noDrift(r).t3, k); await sleep(200, k);
  }
  if (n === 4) {
    const sp = script(model);
    if (sp) {
      st.drift = true; renderAll();
      await clock(sp.tD, k); st.driftAt = sp.tD; renderAll();
      await sleep(1800, k); press('#act-reroute'); await sleep(380, k);
      st.rerouted = true; st.rerouteAt = st.t; renderAll(); await sleep(800, k);
    } else await clock(st.t + noDrift(r).d4, k);
    await sleep(200, k);
  }
  if (n === 5) { await clock(st.t + (script(model) ? 1.5 : noDrift(r).d5), k); injure(model); renderAll(); await sleep(500, k); }
  if (n === 6) {
    await sleep(1400, k); press('#act-abort'); await sleep(380, k);
    st.abort = true; st.abortAt = st.t; renderAll();
    await clock(st.t + (crewState(model).backMin ?? 0), k, Math.max(SIM.speedX, 240));
    st.done = true; st.phase = 'done'; renderAll();
  }
}
async function playStep(n) {
  stop();
  const k = ++tok;
  SIM.playing = true;
  try {
    if (n === 1) { endState(SIM.model, 0); resetRun(scenarioStation(SIM.model)); st.phase = 'run'; }
    else endState(SIM.model, n - 1);
    st.beat = n; SIM.hd = null; renderAll();
    await beatScript(n, k);
  } catch (e) { if (e.message !== 'stop') throw e; return; }
  if (k !== tok) return;
  SIM.playing = false; renderStory();
  afterStep(k);
}
function afterStep(k) {
  if (!SIM.autoplay || st.done) return;
  sleep(PAUSE_MS, k).then(() => { if (SIM.on && SIM.autoplay && !SIM.playing && !st.done) playStep(st.beat + 1); }, () => {});
}
function stop() { tok++; cancelAnimationFrame(raf); SIM.playing = false; }
function goStep(n) { stop(); endState(SIM.model, Math.max(1, Math.min(6, n))); SIM.hd = null; renderAll(); afterStep(tok); }
function next() {
  if (SIM.playing) goStep(st.beat);
  else if (st.done || st.beat >= 6) playStep(1);
  else playStep(st.beat + 1);
}

// ---------- start, end, wiring ----------
export function simStart(model, mapApi, onEnd) {
  if (SIM.on) return;
  Object.assign(SIM, { on: true, model, mapApi, onEnd, follow: true, autoplay: false, hd: null });
  SIM.F = collectFacts(model);
  SIM.steps = storySteps(SIM.F);
  $('#st-steps').innerHTML = SIM.steps.map((b) => `<li><button type="button" data-b="${b.n}" title="${b.nav}" aria-label="Step ${b.n}: ${b.nav}">${b.n}</button></li>`).join('');
  $('#sv-auto').checked = true; $('#st-auto').checked = false;
  document.body.classList.add('sim');
  ['#sim-controls', '#simview', '#story'].forEach((q) => { $(q).hidden = false; });
  $('#simview .sv-slot[data-v="hud"]').appendChild($('#hud-wrap'));
  $('#simview .sv-slot[data-v="nav"]').appendChild($('#nav-map'));
  $('#simview .sv-slot[data-v="data"]').appendChild($('#nav-data'));
  $('#nd-end').hidden = true;
  $$('#sim-controls .seg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.sx === SIM.speedX)));
  setView(SIM.steps[0].view, true);
  playStep(1);
  refit();
}
// frame habitat and scenario station once the story strip and the crew view have taken their room
function refit() { requestAnimationFrame(() => requestAnimationFrame(() => { if (SIM.on) { SIM.mapApi.invalidate(); SIM.mapApi.fitPlan(); } })); }
export function simJump(n) { if (SIM.on) { goStep(n); refit(); } }
export function simEnd() {
  if (!SIM.on) return;
  stop();
  SIM.on = false; document.body.classList.remove('sim');
  ['#sim-controls', '#simview', '#story'].forEach((q) => { $(q).hidden = true; });
  resetRun(null);
  SIM.mapApi.setCrew(null);
  SIM.mapApi.showRoutes(null);
  if (SIM.onEnd) SIM.onEnd();
}
export function simWire() {
  $('#sim-end').addEventListener('click', simEnd);
  $$('#sim-controls .seg button').forEach((b) => b.addEventListener('click', () => {
    SIM.speedX = +b.dataset.sx;
    $$('#sim-controls .seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('#st-next').addEventListener('click', next);
  $('#st-back').addEventListener('click', () => goStep(st.done ? 5 : st.beat - 1));
  $('#st-steps').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goStep(+b.dataset.b); });
  $('#st-auto').addEventListener('change', (e) => { SIM.autoplay = e.target.checked; if (SIM.autoplay && !SIM.playing) afterStep(tok); });
  $('#sv-tabs').addEventListener('click', (e) => {   // picking a view by hand pins it
    const b = e.target.closest('button'); if (!b) return;
    SIM.follow = false; $('#sv-auto').checked = false; setView(b.dataset.v);
  });
  $('#sv-auto').addEventListener('change', (e) => { SIM.follow = e.target.checked; autoView(); astro(true); renderStory(); });
  // the navigator's own keys: next map (as key 4 on the tablet), zoom in and out (keys 2 and 3)
  const navKey = (k) => {
    if (k === 'map') { const ids = navViews(SIM.model).map((c) => c.id); SIM.base = ids[(ids.indexOf(navView(SIM.model, SIM.base).id) + 1) % ids.length]; }
    if (k === 'zin') SIM.zoomI = Math.min(ZOOMS.length - 1, SIM.zoomI + 1);
    if (k === 'zout') SIM.zoomI = Math.max(0, SIM.zoomI - 1);
    const b = $(`#sv-nav-${k}`); b.classList.add('is-pressed'); setTimeout(() => b.classList.remove('is-pressed'), 140);
    astro(true);
  };
  $('#sv-navkeys').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b && SIM.on) navKey(b.dataset.k); });
  document.addEventListener('keydown', (e) => {
    if (!SIM.on || SIM.view !== 'nav' || (e.target.closest && e.target.closest('input, select, textarea'))) return;
    const k = { 4: 'map', 2: 'zin', 3: 'zout' }[e.key];
    if (k) { e.preventDefault(); navKey(k); }
  });
  addEventListener('resize', () => { if (SIM.on) { renderBar(); astro(true); } });
}
