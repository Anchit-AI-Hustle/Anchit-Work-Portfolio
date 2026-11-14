/*
 * Midnight Apex: the garage, the career ladder, the save file and the words
 * on the radio. Pure data and HTML strings, no three.js: game3d.js imports it.
 *
 * Everything here is original: car names, crews, bosses, call signs and lines.
 */

/* ------------------------------------------------------------ cars you can own */
export const PLAYER_CARS = ['kestrel', 'rook', 'vanta', 'sable', 'halcyon', 'aurora'];
export const CAR_META = {
  kestrel: { price: 0, tier: 'Street', rep: 0 },
  rook: { price: 9000, tier: 'Street', rep: 0 },
  vanta: { price: 16000, tier: 'Sport', rep: 300 },
  sable: { price: 24000, tier: 'Sport', rep: 900 },
  halcyon: { price: 34000, tier: 'Muscle', rep: 2000 },
  aurora: { price: 0, tier: 'Apex', rep: 0, unlock: 'c6b', note: 'Won by beating Midnight of the Apex Council' }
};
export const DEFAULT_PAINT = { kestrel: 'ember', rook: 'solar', vanta: 'cobalt', sable: 'mint', halcyon: 'graphite', aurora: 'pearl' };

/* ------------------------------------------------------------ performance parts */
export const UPGRADES = [
  { id: 'engine', name: 'Engine', text: 'Top speed and pull', cost: [2500, 5000, 9000] },
  { id: 'turbo', name: 'Turbo', text: 'Shove out of the bends', cost: [2000, 4500, 8000] },
  { id: 'tyres', name: 'Tyres', text: 'Grip in fast corners', cost: [1500, 3500, 6500] },
  { id: 'brakes', name: 'Brakes', text: 'Stop later, turn in harder', cost: [1200, 2800, 5000] },
  { id: 'nitro', name: 'Nitro', text: 'Bigger bottle, harder kick', cost: [1800, 4000, 7500] }
];
// The car's stats with its parts fitted. K is the car's base entry from KINDS.
export function statsFor(K, up) {
  up = up || {};
  const e = up.engine | 0, t = up.turbo | 0, y = up.tyres | 0, b = up.brakes | 0, n = up.nitro | 0;
  return {
    top: (K.top || 1) * (1 + 0.024 * e + 0.01 * t),
    acc: (K.acc || 1) * (1 + 0.04 * e + 0.065 * t),
    grip: (K.grip || 1) * (1 + 0.05 * y),
    brk: (K.brk || 1) * (1 + 0.12 * b),
    nmax: 100 * (1 + 0.15 * n),
    npow: 1 + 0.06 * n,
    drift: K.drift || 1
  };
}
// One number for how quick a build is, 100 to 999, so two cars read at a glance.
export function ratingOf(s) { return Math.round(100 + (s.top - 0.85) * 1400 + (s.acc - 0.8) * 520 + (s.grip - 0.8) * 420 + (s.brk - 1) * 120 + (s.nmax - 100) * 0.9); }

/* ------------------------------------------------------------ the look */
export const PAINTS = [
  { id: 'ember', name: 'Ember', hex: '#e8452c' }, { id: 'cobalt', name: 'Cobalt', hex: '#2f6fe0' }, { id: 'solar', name: 'Solar', hex: '#ffc22e' },
  { id: 'mint', name: 'Mint', hex: '#2fd5a0' }, { id: 'violet', name: 'Violet', hex: '#8a4bff' }, { id: 'pearl', name: 'Pearl', hex: '#e9e7e2' },
  { id: 'graphite', name: 'Graphite', hex: '#3b3f47' }, { id: 'lime', name: 'Lime', hex: '#9be22d' }, { id: 'rose', name: 'Rose', hex: '#ff5d9e' }, { id: 'copper', name: 'Copper', hex: '#c4733b' }
];
export const RIMS = [{ id: 'five', name: 'Five spoke' }, { id: 'mesh', name: 'Mesh' }, { id: 'dish', name: 'Deep dish' }, { id: 'blade', name: 'Turbine' }];
export const RIM_COLS = [{ id: 'silver', name: 'Silver', hex: '#c4c9d2' }, { id: 'black', name: 'Black', hex: '#25272c' }, { id: 'gold', name: 'Gold', hex: '#d9a640' }, { id: 'bronze', name: 'Bronze', hex: '#9a6a3a' }, { id: 'white', name: 'White', hex: '#f2f2ee' }];
export const DECALS = [{ id: 'none', name: 'Clean' }, { id: 'stripes', name: 'Twin stripes' }, { id: 'flash', name: 'Side flash' }, { id: 'number', name: 'Race number' }, { id: 'split', name: 'Two tone' }];
export const DECAL_COLS = [{ id: 'white', name: 'White', hex: '#f4f1ea' }, { id: 'black', name: 'Black', hex: '#141518' }, { id: 'gold', name: 'Gold', hex: '#ffb736' }, { id: 'ember', name: 'Ember', hex: '#ff5a2c' }, { id: 'cyan', name: 'Cyan', hex: '#38e1ff' }];
export const GLOWS = [{ id: 'off', name: 'Off', hex: '' }, { id: 'cyan', name: 'Cyan', hex: '#38e1ff' }, { id: 'magenta', name: 'Magenta', hex: '#ff3dc4' }, { id: 'amber', name: 'Amber', hex: '#ffaa2e' }, { id: 'lime', name: 'Lime', hex: '#86ff4a' }, { id: 'violet', name: 'Violet', hex: '#9b6bff' }];
export const pick = (list, id) => { for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; };

/* ------------------------------------------------------------ the career ladder */
// Six crews, each with three events and a boss race. Beat the boss and have the rep to be taken
// seriously, and the next crew will race you.
export const CREWS = [
  {
    id: 'c1', name: 'Dockside Kids', turf: 'Harbour Run', rep: 0, boss: { name: 'Pike', kind: 'rook', hex: '#ffc22e', skill: 0.82, line: 'Harbour belongs to us. Try to keep my tail lights in sight.' },
    events: [
      { id: 'c1e1', name: 'Pier Loop', mode: 'race', track: 'harbour', diff: 'rookie', laps: 2, reward: 2500, rep: 120 },
      { id: 'c1e2', name: 'Container Dash', mode: 'sprint', track: 'harbour', diff: 'rookie', reward: 3000, rep: 140 },
      { id: 'c1e3', name: 'Quarter at the Quay', mode: 'drag', track: 'strip', diff: 'rookie', reward: 2600, rep: 120 },
      { id: 'c1b', name: 'Pike, one on one', mode: 'sprint', track: 'harbour', diff: 'pro', boss: true, rivals: 3, reward: 6000, rep: 320 }
    ]
  },
  {
    id: 'c2', name: 'Neon Saints', turf: 'Neon Mile', rep: 500, boss: { name: 'Vesper', kind: 'vanta', hex: '#ff3dc4', skill: 0.95, line: 'The Mile is wet tonight. Saints do not lift.' },
    events: [
      { id: 'c2e1', name: 'Rain Dance', mode: 'drift', track: 'neon', diff: 'rookie', target: 16000, reward: 3600, rep: 160 },
      { id: 'c2e2', name: 'Downtown Ring', mode: 'race', track: 'neon', diff: 'pro', laps: 3, reward: 4200, rep: 170 },
      { id: 'c2e3', name: 'Lap of Lights', mode: 'time', track: 'neon', diff: 'pro', laps: 2, pace: 0.8, reward: 3800, rep: 160 },
      { id: 'c2b', name: 'Vesper, Saint of the Mile', mode: 'race', track: 'neon', diff: 'pro', laps: 2, boss: true, rivals: 3, reward: 9000, rep: 420 }
    ]
  },
  {
    id: 'c3', name: 'Ghat Wolves', turf: 'Ghat Pass', rep: 1200, boss: { name: 'Rana', kind: 'sable', hex: '#2fd5a0', skill: 1.0, line: 'Every hairpin up here knows my name. They will not learn yours.' },
    events: [
      { id: 'c3e1', name: 'Switchback Run', mode: 'sprint', track: 'ghat', diff: 'pro', reward: 5000, rep: 190 },
      { id: 'c3e2', name: 'Hairpin Ballet', mode: 'drift', track: 'ghat', diff: 'pro', target: 21000, reward: 5000, rep: 190 },
      { id: 'c3e3', name: 'First Heat', mode: 'pursuit', track: 'city', diff: 'rookie', heat: 1, reward: 6000, rep: 220 },
      { id: 'c3b', name: 'Rana of the Wolves', mode: 'sprint', track: 'ghat', diff: 'legend', boss: true, rivals: 3, reward: 12000, rep: 520 }
    ]
  },
  {
    id: 'c4', name: 'Lantern Syndicate', turf: 'Lantern District', rep: 2200, boss: { name: 'Kade', kind: 'halcyon', hex: '#c4733b', skill: 1.02, line: 'The district has a hundred alleys. I know all of them.' },
    events: [
      { id: 'c4e1', name: 'Lantern Circuit', mode: 'race', track: 'city', diff: 'pro', laps: 2, reward: 6000, rep: 220 },
      { id: 'c4e2', name: 'Hot Delivery', mode: 'sprint', track: 'city', diff: 'pro', heat: 2, reward: 7200, rep: 240 },
      { id: 'c4e3', name: 'Dockside Duel', mode: 'drag', track: 'strip', diff: 'pro', reward: 6200, rep: 220 },
      { id: 'c4b', name: 'Kade, Lantern King', mode: 'sprint', track: 'city', diff: 'legend', boss: true, rivals: 3, heat: 2, reward: 15000, rep: 620 }
    ]
  },
  {
    id: 'c5', name: 'Chrome Halo', turf: 'Every street', rep: 3400, boss: { name: 'Sol', kind: 'vanta', hex: '#e9e7e2', skill: 1.05, line: 'You made it this far on luck. Luck runs out at the Halo.' },
    events: [
      { id: 'c5e1', name: 'Blue Lights', mode: 'pursuit', track: 'city', diff: 'pro', heat: 3, reward: 9000, rep: 260 },
      { id: 'c5e2', name: 'Lantern Smoke', mode: 'drift', track: 'city', diff: 'pro', target: 24000, reward: 8000, rep: 260 },
      { id: 'c5e3', name: 'Harbour Endurance', mode: 'race', track: 'harbour', diff: 'legend', laps: 3, reward: 9000, rep: 270 },
      { id: 'c5b', name: 'Sol of the Halo', mode: 'race', track: 'neon', diff: 'legend', laps: 2, boss: true, rivals: 4, reward: 18000, rep: 720 }
    ]
  },
  {
    id: 'c6', name: 'Apex Council', turf: 'The whole night', rep: 5000, boss: { name: 'Midnight', kind: 'aurora', hex: '#8a4bff', skill: 1.1, line: 'Nobody has taken the crown off me. Nobody ever will.' },
    events: [
      { id: 'c6e1', name: 'Mountain Clock', mode: 'time', track: 'ghat', diff: 'legend', laps: 2, pace: 0.86, reward: 11000, rep: 300 },
      { id: 'c6e2', name: 'Every Unit Out', mode: 'pursuit', track: 'city', diff: 'legend', heat: 4, reward: 14000, rep: 320 },
      { id: 'c6e3', name: 'Strip Royale', mode: 'drag', track: 'strip', diff: 'legend', reward: 11000, rep: 300 },
      { id: 'c6b', name: 'Midnight, for the crown', mode: 'sprint', track: 'city', diff: 'legend', boss: true, rivals: 4, heat: 3, reward: 30000, rep: 1000, unlock: 'aurora' }
    ]
  }
];
export const EVENT_BY_ID = {};
CREWS.forEach((c, ci) => c.events.forEach((e, ei) => { e.crew = c; e.ci = ci; e.ei = ei; EVENT_BY_ID[e.id] = e; }));

export function crewOpen(S, ci) {
  if (ci === 0) return true;
  const prev = CREWS[ci - 1];
  return !!S.done[prev.events[3].id] && S.rep >= CREWS[ci].rep;
}
export function eventOpen(S, ev) {
  if (!crewOpen(S, ev.ci)) return false;
  if (!ev.boss) return true;
  const evs = ev.crew.events;
  return !!(S.done[evs[0].id] && S.done[evs[1].id] && S.done[evs[2].id]);
}
// The next thing to race in the career: an open event not yet won, or the boss, or the last thing played.
export function nextEvent(S) {
  for (let ci = CREWS.length - 1; ci >= 0; ci--) {
    if (!crewOpen(S, ci)) continue;
    const evs = CREWS[ci].events;
    for (let i = 0; i < evs.length; i++) if (!S.done[evs[i].id] && eventOpen(S, evs[i])) return evs[i];
  }
  if (S.last && EVENT_BY_ID[S.last]) return EVENT_BY_ID[S.last];
  return CREWS[0].events[0];
}
export function crewProgress(S) {
  let crew = 0, done = 0, total = 0;
  CREWS.forEach((c, ci) => { if (crewOpen(S, ci)) crew = ci; c.events.forEach((e) => { total++; if (S.done[e.id]) done++; }); });
  return { crew, done, total };
}

/* ------------------------------------------------------------ the save */
export const SAVE_KEY = 'midnight-apex.save';
export function newSave() {
  return { v: 1, cash: 4000, rep: 0, owned: ['kestrel'], cur: 'kestrel', cars: {}, done: {}, best: {}, cam: 0, last: null, stats: { races: 0, wins: 0, escapes: 0, busts: 0, wrecked: 0, drift: 0 } };
}
export function loadSave(store) {
  const s = store.get(SAVE_KEY, null);
  const base = newSave();
  if (!s || typeof s !== 'object') return base;
  const out = Object.assign(base, s);
  if (!Array.isArray(out.owned) || !out.owned.length) out.owned = ['kestrel'];
  out.owned = out.owned.filter((k) => PLAYER_CARS.indexOf(k) >= 0);
  if (!out.owned.length) out.owned = ['kestrel'];
  if (out.owned.indexOf(out.cur) < 0) out.cur = out.owned[0];
  out.cars = out.cars && typeof out.cars === 'object' ? out.cars : {};
  out.done = out.done && typeof out.done === 'object' ? out.done : {};
  out.best = out.best && typeof out.best === 'object' ? out.best : {};
  out.stats = Object.assign(base.stats, out.stats || {});
  out.cash = Math.max(0, +out.cash || 0); out.rep = Math.max(0, +out.rep || 0);
  return out;
}
export function carSave(S, kind) {
  let c = S.cars[kind];
  if (!c) c = S.cars[kind] = {};
  c.up = Object.assign({ engine: 0, turbo: 0, tyres: 0, brakes: 0, nitro: 0 }, c.up || {});
  if (!c.paint) c.paint = DEFAULT_PAINT[kind] || 'ember';
  if (!c.rim) c.rim = 'five';
  if (!c.rimCol) c.rimCol = 'silver';
  if (!c.decal) c.decal = 'none';
  if (!c.decalCol) c.decalCol = 'white';
  if (!c.glow) c.glow = 'off';
  return c;
}
export function canBuy(S, kind) {
  const m = CAR_META[kind];
  if (!m || S.owned.indexOf(kind) >= 0) return { ok: false, why: 'Owned' };
  if (m.unlock) return { ok: false, why: m.note };
  if (S.rep < m.rep) return { ok: false, why: 'Needs ' + m.rep + ' rep' };
  if (S.cash < m.price) return { ok: false, why: 'Needs $' + money(m.price) };
  return { ok: true, why: '' };
}
export const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* ------------------------------------------------------------ police radio and crew talk */
// {u} a unit call sign, {h} the heat level, {z} a place, {c} the suspect's car.
export const RADIO = {
  start: ['Dispatch: all units, street racer heading through {z}.', 'Dispatch: a {c} running hot near {z}. Units respond.', 'Dispatch: reports of reckless driving, {z}. Respond with lights.'],
  chase: ['{u}: in pursuit, lights and siren.', '{u}: I have eyes on the {c}.', '{u}: suspect is not stopping, request backup.', '{u}: joining the chase from behind.'],
  heat: ['Dispatch: raising response to level {h}.', 'Dispatch: level {h}. Every free unit, converge.', 'Dispatch: this one is serious. Level {h}.'],
  spikes: ['{u}: spike strip is down ahead. Keep your lane.', 'Dispatch: spikes authorised. Leave them a gap and watch.', '{u}: strip deployed, one lane open.'],
  block: ['{u}: roadblock set ahead. They are not getting through.', 'Dispatch: block the road, two cars across.', '{u}: we are parked across the lanes.'],
  rammed: ['{u}: they hit me! Still rolling.', '{u}: contact, contact. Car is holding.', '{u}: took a shot to the door.'],
  wreck: ['{u}: I am out, car is done.', '{u}: spun out, cannot continue.', 'Dispatch: {u} is disabled. Send a tow truck.'],
  lost: ['{u}: lost visual.', 'Dispatch: all units, sweep the district.', '{u}: no sign of the {c}. Checking side streets.'],
  seen: ['{u}: there they are, back in sight!', '{u}: visual reacquired.', '{u}: got them again, heading through {z}.'],
  breaker: ['{u}: the whole thing came down on the road!', 'Dispatch: debris across the lanes, units held up.', '{u}: I cannot get through, road is blocked.'],
  flat: ['{u}: they hit the strip! Tyres are going.', '{u}: suspect on the rims, close in.'],
  hide: ['Dispatch: units hold positions, check {z}.', '{u}: nothing in {z}. Keep looking.'],
  busted: ['{u}: suspect stopped. It is over.', 'Dispatch: suspect in custody. Good work.'],
  escaped: ['Dispatch: call off the search. They are gone.', 'Dispatch: suspect lost. All units resume patrol.']
};
export const UNITS = ['Unit 12', 'Unit 7', 'Unit 31', 'Unit 4', 'Unit 19', 'Unit 26', 'Unit 9', 'Unit 15', 'Air 3'];

/* ------------------------------------------------------------ menu words */
export const MODES = [
  { v: 'career', label: 'Career', blurb: 'Take on six street crews, one race at a time. Win cash and rep, beat each crew boss, and earn the crown.' },
  { v: 'race', label: 'Circuit', blurb: 'Laps against five rivals. Draft, brush past traffic for nitro, take the shortcuts the district offers.' },
  { v: 'sprint', label: 'Sprint', blurb: 'Point to point. One run from the start arch to the finish arch, first one there wins.' },
  { v: 'drift', label: 'Drift', blurb: 'Two laps alone. Throw the car sideways with the handbrake and hold it. Long slides build a multiplier; a wall or a car wipes the chain.' },
  { v: 'drag', label: 'Drag', blurb: 'A quarter mile on the dockside strip. Rev on the lights, launch, then shift in the green. Steer only to stay in your lane.' },
  { v: 'time', label: 'Time trial', blurb: 'Three laps against the clock and your own ghost from your best lap. Light traffic.' },
  { v: 'pursuit', label: 'Pursuit', blurb: 'The police already want you. Lose them: break line of sight, hide in cool-down spots, drop pursuit breakers on them. Stop moving with a cop beside you and it is over.' }
];

export function helpHtml(esc) {
  const row = (k, v) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>';
  return '<div class="mx-help">' +
    '<h3>How each mode works</h3>' +
    MODES.map((m) => '<p><b>' + esc(m.label) + '.</b> ' + esc(m.blurb) + '</p>').join('') +
    '<h3>Racing rules</h3>' +
    '<p>Circuit races are three laps unless the event says otherwise. Positions count by distance; the first car over the line wins. Rivals are people: they brake, misjudge, defend and get rattled. Drafting a car fills nitro, so does a near miss past traffic and clean driving.</p>' +
    '<p>Shortcuts: some streets fork. Keep to the side the arrow shows before the fork and you take the alley. It is shorter and narrower, with things to knock over.</p>' +
    '<h3>Police</h3>' +
    '<p>Heat runs from one to five stars and climbs the longer a chase lasts and with every cop you put out of action. At three stars the police lay spike strips with one lane left open; at four they block the road with parked cars and a gap. Pursuit breakers are tall structures by the road, marked on your screen: brush past one with police behind you and it falls on them.</p>' +
    '<p>Break line of sight and the blue bar fills: that is the search. Cool-down spots (underpasses, tunnels, alleys) fill it faster. If you stop with a patrol car beside you the red bar fills and you are busted, which costs a fine.</p>' +
    '<h3>Drift scoring</h3><p>Points come from the slide angle times your speed, every second you hold it. Keep chaining slides within a second and a half of each other to grow the multiplier up to five. Touch a wall, a car or a prop and the chain is lost.</p>' +
    '<h3>Drag</h3><p>Hold the gas on the lights to bring the revs into the green, then launch. Shift in the green part of the bar for a perfect shift and a small boost. Too early bogs the engine, sitting on the limiter overheats it.</p>' +
    '<h3>Keyboard and mouse</h3><table class="mx-keys">' + row('Up / W, or hold click', 'Gas (shift up in drag)') + row('Down / S', 'Brake') + row('Left Right / A D, or the mouse', 'Steer') + row('Space', 'Handbrake (shift up in drag)') + row('Shift / N', 'Nitro') + row('C', 'Change camera') + row('Esc', 'Pause') + '</table>' +
    '<h3>Touch</h3><table class="mx-keys">' + row('Drag left or right', 'Steer') + row('Swipe up', 'Nitro') + row('Tap', 'Handbrake flick (shift in drag)') + row('Hold a downward drag', 'Brake') + row('Camera button by the map', 'Change camera') + row('Or Stick and buttons', 'Gas, Brake, Nitro, Drift pads') + '</table>' +
    '<h3>Controller</h3><table class="mx-keys">' + row('Left stick or d-pad', 'Steer') + row('Right trigger or A', 'Gas') + row('Left trigger or B', 'Brake') + row('X', 'Nitro') + row('Y or left bumper', 'Handbrake (shift in drag)') + row('Right bumper', 'Change camera') + row('Start', 'Pause') + '</table>' +
    '</div>';
}
