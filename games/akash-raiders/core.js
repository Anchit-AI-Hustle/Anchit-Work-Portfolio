/*
 * Akash Raiders, the shared core: rules, waves, input, HUD, sound and the
 * arcade shell glue. game3d.js (WebGL) and game.js (the 2D edition for
 * browsers without WebGL2) each add a renderer, a "view", and call
 * boot(view). Both play exactly the same game.
 *
 * The play field is a flat sheet of night sky, x from -10 to 10 and y from
 * the city rooftops (0) up to 30. Your rocket slides along y = PY. Alien
 * kites, lantern-bugs and moon moths swoop in on curved paths, settle into a
 * formation, then peel off to dive. A moon moth can lower a tractor beam and
 * tow your rocket away; shoot that moth while it dives and the rocket comes
 * back to fly beside you as a double ship.
 *
 * Physics runs at a fixed 120 steps a second with every entity's previous
 * position kept, so a view draws smooth motion at any frame rate by blending
 * between the last two steps (G.alpha). Nothing in a step allocates: every
 * enemy, bullet, pickup and score pop comes from a pool made at load.
 */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/* ------------------------------------------------------------ the field, in world units */
export const XW = 10;          // half width of the sky the rocket defends
export const PY = 2.4;         // the rocket's flight line
export const FTOP = 30.5;      // top of the field
export const SPX = 1.74, SPY = 1.7, Y0 = 25.6; // formation spacing and top row
export const KITE = 0, BUG = 1, MOTH = 2;
export const ENEMY_R = [0.72, 0.78, 0.98];
export const DUAL_DX = 0.86;
// Crumbling shields: four arches of paper tiles above the rocket.
export const BAR = { n: 4, cols: 7, rows: 3, cs: 0.46, y: 5.6, xs: [-7.2, -2.4, 2.4, 7.2] };
export const barX = (b, c) => BAR.xs[b] + (c - 3) * BAR.cs;
export const barY = (r) => BAR.y + r * BAR.cs;
// The arch: the middle three bottom tiles are open.
const ARCH = (r, c) => !(r === 0 && c >= 2 && c <= 4);

const STEP = 1 / 120;
// enemy states
export const S_OFF = 0, S_WAIT = 1, S_PATH = 2, S_HOME = 3, S_FORM = 4, S_BEAM = 5;
// what an enemy does at the end of its path
const A_HOME = 0, A_EXIT = 1, A_BEAM = 2, A_WRAP = 3;

/* ------------------------------------------------------------ paths (Catmull-Rom through points) */
const ENTRY = [
  [[0.8, 34], [0.6, 27], [-1.4, 19.4], [-4.8, 13.4], [-7.6, 13.8], [-7.6, 17.6], [-5, 19], [-3.4, 17.2]],
  [[-12.5, 3], [-7.4, 6.2], [-2.6, 10.6], [1.8, 15], [3.6, 18.8], [1.8, 21], [-0.8, 19.8], [-1.6, 17.4]],
  [[-12.5, 29], [-6.6, 24.6], [-0.4, 21], [4.8, 21.6], [6.8, 24.8], [4.8, 27.6], [1.8, 26.4], [0.8, 24]],
  [[12.5, 4], [7.6, 6.8], [3, 10.4], [-1.6, 13.8], [-3.6, 17.4], [-1.8, 20.2], [0.8, 19.4], [1.4, 17]],
  [[-0.8, 34], [-0.6, 27], [1.4, 19.4], [4.8, 13.4], [7.6, 13.8], [7.6, 17.6], [5, 19], [3.4, 17.2]]
];
const BONUS = [
  [[-12.5, 22], [-4, 18.4], [2, 12.6], [6.2, 10.4], [7.4, 14.2], [4.4, 17.4], [0, 14.6], [-4.2, 8.6], [-8.4, 5], [-13, 3]],
  [[0, 34], [0, 23], [-3, 15.6], [-6.4, 14.4], [-6.6, 18.4], [-2.4, 20.4], [3, 16], [6.4, 10.4], [13, 8.4]],
  [[12.5, 28], [5, 24.4], [0, 20.4], [-5, 22.2], [-7.2, 26], [-4, 29], [0, 26.2], [3, 18.4], [2.2, 10.6], [-1, 4.6], [-5, -3]],
  [[-12.5, 12], [-6, 14], [-2, 18], [0, 23], [3, 25.4], [6, 23], [5, 18.4], [1, 16.4], [-3, 19], [-6, 24], [-12, 30]],
  [[0, 34], [2.6, 26], [6, 20], [6.4, 14.4], [3, 12], [-1, 14], [-3.6, 18.6], [-6.6, 22], [-13, 23]]
];
const GROUPS = [
  [[1, 3], [1, 4], [1, 5], [1, 6], [3, 3], [3, 4], [3, 5], [3, 6]],
  [[0, 3], [0, 4], [0, 5], [0, 6], [1, 2], [1, 7], [2, 2], [2, 7]],
  [[2, 3], [2, 4], [2, 5], [2, 6], [1, 1], [1, 8], [2, 1], [2, 8]],
  [[3, 1], [3, 2], [3, 7], [3, 8], [4, 3], [4, 4], [4, 5], [4, 6]],
  [[3, 0], [3, 9], [4, 0], [4, 1], [4, 2], [4, 7], [4, 8], [4, 9]]
];
const ENTRY_OF = [0, 1, 2, 3, 4];
const rowType = (r) => (r === 0 ? MOTH : r <= 2 ? BUG : KITE);
const CR = { x: 0, y: 0 };
function crEval(p, n, s, t, o) {
  const i0 = Math.max(0, s - 1) * 2, i1 = s * 2, i2 = Math.min(n - 1, s + 1) * 2, i3 = Math.min(n - 1, s + 2) * 2;
  const t2 = t * t, t3 = t2 * t;
  o.x = 0.5 * ((2 * p[i1]) + (-p[i0] + p[i2]) * t + (2 * p[i0] - 5 * p[i1] + 4 * p[i2] - p[i3]) * t2 + (-p[i0] + 3 * p[i1] - 3 * p[i2] + p[i3]) * t3);
  o.y = 0.5 * ((2 * p[i1 + 1]) + (-p[i0 + 1] + p[i2 + 1]) * t + (2 * p[i0 + 1] - 5 * p[i1 + 1] + 4 * p[i2 + 1] - p[i3 + 1]) * t2 + (-p[i0 + 1] + 3 * p[i1 + 1] - 3 * p[i2 + 1] + p[i3 + 1]) * t3);
}

/* ------------------------------------------------------------ pools, made once */
const NE = 56, NPB = 48, NEB = 180, NPU = 6, NPOP = 24;
function mkEnemy(i) {
  return { id: i, on: false, type: KITE, hp: 1, maxHp: 1, row: 0, col: 0, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, ang: 0, pang: 0, st: S_OFF, t: 0,
    path: new Float32Array(28), np: 0, seg: 0, u: 0, after: A_HOME, spd: 12, delay: 0, fireT: 0, flash: 0, captive: 0, gift: false, wob: 0, beamT: 0, nova: -1, dive: false, bonus: false, seed: Math.random() * 100, hx: 0, hy: -1, turn: 0 };
}
const mkB = () => ({ on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, k: 0, t: 0 });
export const DIFF = {
  easy: { fire: 0.55, bspd: 0.8, dive: 0.7, lives: 4, aim: 0.7 },
  normal: { fire: 1, bspd: 1, dive: 1, lives: 3, aim: 1 },
  hard: { fire: 1.45, bspd: 1.16, dive: 1.35, lives: 3, aim: 1.2 }
};
export const POWER = ['spread', 'shield', 'slow', 'nova'];

let ARC = null, VIEW = null, G = null;
function newGame(cfg) {
  const g = {
    cfg, D: DIFF[cfg.diff] || DIFF.normal,
    phase: 'launch', pt: 0, kind: 'normal', stage: 1, cycle: 0, time: 0, acc: 0, alpha: 1, ts: 1, slowmo: 0,
    score: 0, lives: 3, kills: 0, shots: 0, hits: 0, chain: 0, chainT: 0, bestChain: 0, mult: 1, rescues: 0, captures: 0, perfects: 0, nextLife: 20000,
    E: [], PB: [], EB: [], PU: [], POP: [],
    cells: new Uint8Array(BAR.n * BAR.cols * BAR.rows),
    P: { x: 0, px: 0, y: -7, py: -7, vx: 0, tx: 0, alive: true, state: 'launch', inv: 0, dual: false, fireT: 0, lean: 0, spin: 0, shield: 0, spread: 0, slow: 0, nova: 1, capT: 0, capE: -1, cx: 0, cy: 0, hitT: 9, fireFlash: 0, rise: 1 },
    beam: { on: false, e: -1, t: 0, open: 0, w: 0 },
    nova: { on: false, x: 0, y: 0, r: 0, pr: 0, id: 0 },
    rescue: { on: false, x: 0, y: 0, px: 0, py: 0, t: 0, spin: 0, wait: false },
    lost: { on: false, x: 0, y: 0, px: 0, py: 0, t: 0, spin: 0 },
    boss: { on: false, x: 0, y: 40, px: 0, py: 40, hp: 0, max: 0, rot: 0, t: 0, flash: 0, shield: 1, dying: 0, pods: [0, 1, 2, 3].map(() => ({ hp: 0, max: 0, x: 0, y: 0, px: 0, py: 0, flash: 0 })), atkT: 2, ringT: 4, minT: 6, spiral: 0, dead: false },
    form: { t: 0, sway: 0, breath: 1, allIn: false },
    spawn: { t: 0, groups: 0, total: 0, done: true },
    dive: { t: 2, max: 2 },
    respawnT: 0, overT: 0, overSent: false, calm: false,
    banner: { text: '', sub: '', t: 9, dur: 0, big: false },
    bonusHits: 0, bonusTotal: 0, clock: cfg.mode === 'blitz' ? 180 : 0,
    flash: 0, novaId: 0, gifts: 0, pickT: 0, scoreStr: '0', stageStr: '1', chainStr: '', clockStr: '3:00', clockS: -1, best: null, hint: cfg.attract ? 0 : 7
  };
  for (let i = 0; i < NE; i++) g.E.push(mkEnemy(i));
  for (let i = 0; i < NPB; i++) g.PB.push(mkB());
  for (let i = 0; i < NEB; i++) g.EB.push(mkB());
  for (let i = 0; i < NPU; i++) g.PU.push({ on: false, x: 0, y: 0, px: 0, py: 0, k: 0, t: 0 });
  for (let i = 0; i < NPOP; i++) g.POP.push({ on: false, x: 0, y: 0, t: 0, v: 0, m: 1, s: '' });
  g.lives = cfg.attract ? 99 : cfg.mode === 'blitz' ? 99 : g.D.lives;
  fillCells(g);
  return g;
}
function fillCells(g) {
  for (let b = 0; b < BAR.n; b++) for (let r = 0; r < BAR.rows; r++) for (let c = 0; c < BAR.cols; c++) g.cells[(b * BAR.rows + r) * BAR.cols + c] = ARCH(r, c) ? 2 : 0;
}

/* ------------------------------------------------------------ formation */
export const slotX = (g, col) => (col - 4.5) * SPX * g.form.breath + g.form.sway;
export const slotY = (g, row) => Y0 - row * SPY * (0.92 + 0.08 * g.form.breath);

/* ------------------------------------------------------------ helpers */
const rnd = (a, b) => a + Math.random() * (b - a);
function fx(type, x, y, p1, p2) { if (VIEW && VIEW.fx) { try { VIEW.fx(type, x, y, p1 || 0, p2 || 0); } catch (e) { /* a view's effect must never stop play */ } } }
function hap(kind, s) { if (!G || G.cfg.attract || !ARC || typeof ARC.haptic !== 'function') return; ARC.haptic(kind, s); }
let lastTapHap = 0;
function shake(n) { if (ARC && G && !G.cfg.attract) ARC.shake = Math.min(14, (ARC.shake || 0) + n); }
const POPSTR = new Map();
function popStr(v) { let s = POPSTR.get(v); if (!s) { s = String(v); POPSTR.set(v, s); } return s; }
function addPop(x, y, v, m) {
  if (G.cfg.attract) return;
  let best = null;
  for (let i = 0; i < NPOP; i++) { const p = G.POP[i]; if (!p.on) { best = p; break; } if (!best || p.t > best.t) best = p; }
  best.on = true; best.x = x; best.y = y; best.t = 0; best.v = v; best.m = m; best.s = v < 0 ? v + 's' : popStr(v);
}
function banner(text, sub, dur, big) { const b = G.banner; b.text = text; b.sub = sub || ''; b.t = 0; b.dur = dur || 1.8; b.big = !!big; }
function addScore(v, x, y) {
  if (G.cfg.attract) return;
  G.score += v; G.scoreStr = String(G.score);
  if (x != null) addPop(x, y, v, G.mult);
  if (G.cfg.mode === 'arcade' && G.score >= G.nextLife) {
    G.lives++; G.nextLife = G.nextLife < 60000 ? 60000 : G.nextLife + 60000;
    banner('Extra rocket', 'One more ship in the hangar', 1.6); au('life'); hap('success', 0.6);
  }
}
function freeB(pool) { for (let i = 0; i < pool.length; i++) if (!pool[i].on) return pool[i]; return null; }

/* ------------------------------------------------------------ stages */
function stageKind(n) { if (n % 5 === 0) return 'boss'; if (n % 5 === 3) return 'bonus'; return 'normal'; }
function clearEnemies() {
  for (let i = 0; i < NE; i++) G.E[i].on = false;
  for (let i = 0; i < NEB; i++) G.EB[i].on = false;
  G.beam.on = false; G.lost.on = false;
}
function beginStage(n) {
  G.stage = n; G.stageStr = String(n); G.kind = G.cfg.attract ? 'normal' : stageKind(n); G.cycle = Math.floor((n - 1) / 5);
  clearEnemies();
  G.form.t = 0; G.form.sway = 0; G.form.breath = 1; G.form.allIn = false;
  G.spawn.t = 0; G.spawn.groups = 0; G.spawn.done = false; G.spawn.total = 0;
  G.dive.t = 3; G.calm = false; G.gifts = 0; G.bonusHits = 0; G.bonusTotal = 0;
  if (n % 3 === 1 || G.kind === 'boss') fillCells(G);
  if (G.kind === 'boss') { G.phase = 'bossIntro'; G.pt = 0; setupBoss(); au('boss'); musicSong('boss'); if (ARC && typeof ARC.fade === 'function' && !G.cfg.attract) ARC.fade(260); fx('bossin', G.boss.x, G.boss.y); return; }
  G.phase = 'ready'; G.pt = 0;
  if (!G.cfg.attract) {
    if (G.kind === 'bonus') { banner('Challenge stage', 'They will not fire. Pop all 40 for a perfect.', 2.2, true); musicSong('bonus'); }
    else { banner('Stage ' + n, n === 1 ? 'Defend the night sky' : (G.cfg.mode === 'blitz' ? 'Keep the chain alive' : 'Here they come'), 1.8, true); musicSong('main'); }
    au('stage');
  }
}
function spawnGroup(gi) {
  const tpl = G.kind === 'bonus' ? BONUS[gi % BONUS.length] : ENTRY[ENTRY_OF[gi % 5]];
  const lvl = G.stage + G.cycle * 2;
  for (let k = 0; k < 8; k++) {
    const e = freeEnemy(); if (!e) return;
    const mirror = k >= 4 ? -1 : 1;
    e.on = true; e.st = S_WAIT; e.delay = (k % 4) * (G.kind === 'bonus' ? 0.17 : 0.14) + (mirror < 0 && G.kind !== 'bonus' ? 0.05 : 0);
    e.np = tpl.length; e.seg = 0; e.u = 0;
    for (let i = 0; i < tpl.length; i++) { e.path[i * 2] = tpl[i][0] * mirror; e.path[i * 2 + 1] = tpl[i][1]; }
    e.x = e.px = e.path[0]; e.y = e.py = e.path[1];
    e.t = 0; e.flash = 0; e.captive = 0; e.wob = 0; e.nova = -1; e.dive = false; e.turn = 0;
    e.ang = e.pang = Math.atan2(e.path[2] - e.path[0], -(e.path[3] - e.path[1]));
    if (G.kind === 'bonus') {
      e.type = (Math.floor(G.stage / 5) + gi) % 2 === 0 ? KITE : BUG; e.hp = e.maxHp = 1; e.after = A_EXIT; e.bonus = true; e.gift = false;
      e.spd = 14 + Math.min(4, lvl * 0.3);
    } else {
      const sl = GROUPS[gi][k]; e.row = sl[0]; e.col = sl[1]; e.type = rowType(e.row);
      e.hp = e.maxHp = e.type === MOTH ? 2 : 1; e.after = A_HOME; e.bonus = false;
      e.spd = 13 + Math.min(5, lvl * 0.35);
      e.gift = false;
    }
    e.fireT = rnd(0.6, 2.2);
    G.spawn.total++;
  }
}
function freeEnemy() { for (let i = 0; i < NE; i++) if (!G.E[i].on) return G.E[i]; return null; }
function pickGifts() {
  // two glowing raiders per normal stage drop a power-up
  let n = 0, guard = 0;
  while (n < 2 && guard++ < 50) {
    const e = G.E[(Math.random() * NE) | 0];
    if (e.on && !e.gift && e.type !== MOTH) { e.gift = true; n++; }
  }
}

/* ------------------------------------------------------------ the boss: Rani Kandil, a lantern mothership */
function setupBoss() {
  const B = G.boss, c = G.cycle;
  B.on = true; B.dead = false; B.dying = 0; B.x = B.px = 0; B.y = B.py = 42; B.t = 0; B.rot = 0; B.flash = 0; B.shield = 1;
  B.max = 46 + c * 18; B.hp = B.max; B.atkT = 2.4; B.ringT = 4.5; B.minT = 5; B.spiral = 0;
  for (let i = 0; i < 4; i++) { const p = B.pods[i]; p.max = 11 + c * 4; p.hp = p.max; p.flash = 0; }
  podPos(B);
  for (let i = 0; i < 4; i++) { B.pods[i].px = B.pods[i].x; B.pods[i].py = B.pods[i].y; }
}
function podPos(B) {
  for (let i = 0; i < 4; i++) {
    const p = B.pods[i], a = B.rot + i * TAU / 4;
    p.x = B.x + Math.cos(a) * 4.1; p.y = B.y + Math.sin(a) * 2.3;
  }
}
function podsAlive() { let n = 0; for (let i = 0; i < 4; i++) if (G.boss.pods[i].hp > 0) n++; return n; }
function bossStep(dt, sdt) {
  const B = G.boss; if (!B.on) return;
  B.px = B.x; B.py = B.y;
  for (let i = 0; i < 4; i++) { B.pods[i].px = B.pods[i].x; B.pods[i].py = B.pods[i].y; }
  B.t += sdt; B.flash = Math.max(0, B.flash - dt * 5);
  for (let i = 0; i < 4; i++) B.pods[i].flash = Math.max(0, B.pods[i].flash - dt * 5);
  if (B.dying > 0) {
    B.dying += dt;
    B.y += Math.sin(B.dying * 30) * 0.02; B.rot += dt * (1 + B.dying * 2);
    if (Math.random() < 0.35) fx('bosshit', B.x + rnd(-3, 3), B.y + rnd(-2, 2), 1);
    if (B.dying > 2.2) { B.on = false; B.dead = true; fx('bossdie', B.x, B.y); shake(12); hap('heavy', 1); setTimeout(() => hap('success', 1), 320); au('bossdie'); }
    podPos(B);
    return;
  }
  if (G.phase === 'bossIntro') {
    B.y = lerp(42, 21.5, easeOut(G.pt / 3.1)); B.x = Math.sin(G.pt * 0.6) * 0.6; B.rot += dt * 0.8; podPos(B); return;
  }
  const pods = podsAlive();
  const anger = pods === 0 ? 1.45 : 1;
  B.x = Math.sin(B.t * 0.42) * 5.2 + Math.sin(B.t * 1.1) * 0.6;
  B.y = 21.5 + Math.sin(B.t * 0.7) * 1.1;
  B.rot += sdt * (0.6 + (4 - pods) * 0.18);
  B.shield = lerp(B.shield, pods > 0 ? 1 : 0, Math.min(1, dt * 3));
  podPos(B);
  if (G.calm) return;
  const D = G.D, bs = (10 + Math.min(5, G.stage * 0.25)) * D.bspd;
  B.atkT -= sdt * D.fire * anger;
  if (B.atkT <= 0) {
    B.atkT = rnd(1.3, 2.0);
    for (let i = 0; i < 4; i++) { const p = B.pods[i]; if (p.hp > 0) aimShot(p.x, p.y - 0.6, bs, 0.08, 0); }
    if (pods === 0) { for (let k = -2; k <= 2; k++) aimShot(B.x, B.y - 1.4, bs * 1.05, k * 0.14, 1); }
    au('ebig');
  }
  B.ringT -= sdt * anger;
  if (B.ringT <= 0) {
    B.ringT = pods === 0 ? 2.6 : 4.2;
    const n = 14 + G.cycle * 2, gap = Math.floor(Math.random() * n), off = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      if (i === gap || i === (gap + 1) % n) continue;
      const a = off + i * TAU / n, b = freeB(G.EB); if (!b) break;
      b.on = true; b.k = 1; b.t = 0; b.x = b.px = B.x; b.y = b.py = B.y; b.vx = Math.cos(a) * bs * 0.62; b.vy = Math.sin(a) * bs * 0.62;
    }
    fx('ring', B.x, B.y); au('ring');
  }
  if (pods === 0) {
    B.spiral += sdt;
    if (B.spiral > 0.16) {
      B.spiral = 0;
      const a = B.t * 2.6, b = freeB(G.EB);
      if (b) { b.on = true; b.k = 1; b.t = 0; b.x = b.px = B.x; b.y = b.py = B.y - 0.6; b.vx = Math.cos(a) * bs * 0.5; b.vy = -Math.abs(Math.sin(a)) * bs * 0.5 - 2; }
    }
  }
  B.minT -= sdt;
  if (B.minT <= 0) {
    B.minT = rnd(5.5, 7.5);
    for (let k = 0; k < 2; k++) {
      const e = freeEnemy(); if (!e) break;
      e.on = true; e.type = KITE; e.hp = e.maxHp = 1; e.bonus = false; e.gift = Math.random() < 0.18; e.captive = 0; e.nova = -1;
      e.x = e.px = B.x + (k ? 1.6 : -1.6); e.y = e.py = B.y - 0.5; e.row = 3; e.col = k ? 6 : 3; e.t = 0; e.flash = 0; e.ang = e.pang = 0; e.spd = 13;
      buildDive(e, false, k ? 1 : -1); e.after = A_EXIT; e.fireT = rnd(0.4, 1.2);
    }
  }
}
function hitBoss(b) {
  const B = G.boss; if (!B.on || B.dying > 0) return false;
  for (let i = 0; i < 4; i++) {
    const p = B.pods[i]; if (p.hp <= 0) continue;
    if (Math.abs(b.x - p.x) < 1.05 && Math.abs(b.y - p.y) < 1.05) {
      p.hp--; p.flash = 1; fx('hit', b.x, b.y, 2); au('tick');
      if (p.hp <= 0) { fx('pod', p.x, p.y); addScore(1000 * G.mult, p.x, p.y); chainHit(); shake(5); hap('hit', 0.8); au('pod'); }
      return true;
    }
  }
  const dx = b.x - B.x, dy = (b.y - B.y) * 1.25;
  if (dx * dx + dy * dy < 2.6 * 2.6) {
    if (podsAlive() > 0) { fx('shield', b.x, b.y); au('clink'); return true; }
    B.hp--; B.flash = 1; fx('hit', b.x, b.y, 3); au('tick');
    if (B.hp <= 0) killBoss();
    return true;
  }
  return false;
}
function killBoss() {
  const B = G.boss; B.dying = 0.001; G.slowmo = 1.6;
  addScore((6000 + 2000 * G.cycle) * G.mult, B.x, B.y); chainHit();
  for (let i = 0; i < NEB; i++) if (G.EB[i].on) { G.EB[i].on = false; fx('fizz', G.EB[i].x, G.EB[i].y); }
  fx('bosscrack', B.x, B.y); shake(8); hap('heavy', 1); au('bosshit');
  banner('Rani Kandil falls', 'The lantern queen bursts into fireworks', 2.4, true);
}

/* ------------------------------------------------------------ dives and the tractor beam */
function buildDive(e, beam, side) {
  const s = side || (e.x > 0 ? 1 : -1);
  const P = G.P, tx = clamp(P.alive ? P.x : rnd(-6, 6), -8.5, 8.5);
  const wob = e.type === KITE ? 1.4 : e.type === BUG ? 0.7 : 1;
  const p = e.path; let n = 0;
  const put = (x, y) => { p[n * 2] = x; p[n * 2 + 1] = y; n++; };
  put(e.x, e.y);
  put(e.x + s * 0.6, e.y + 1.3);
  put(e.x + s * 2, e.y + 1.7);
  put(e.x + s * 2.8, e.y + 0.1);
  put(e.x + s * 1.4, e.y - 2.6);
  if (beam) {
    put(lerp(e.x, tx, 0.6), 16); put(tx, 12.8); e.after = A_BEAM;
  } else {
    put(lerp(e.x, tx, 0.5) + s * 2.4 * wob, 15);
    put(tx + s * wob, 7.4);
    put(tx - s * 2.2 * wob, 0.6);
    put(tx - s * 4.5, -5.5);
    e.after = A_WRAP;
  }
  e.np = n; e.seg = 0; e.u = 0; e.st = S_PATH; e.dive = true; e.t = 0;
  e.wob = e.type === KITE ? 0.85 : 0;
}
function diveScheduler(dt) {
  if (G.calm || G.kind !== 'normal' || G.phase !== 'play') return;
  const P = G.P; if (!P.alive) return;
  let inForm = 0, diving = 0;
  for (let i = 0; i < NE; i++) { const e = G.E[i]; if (!e.on) continue; if (e.st === S_FORM) inForm++; else if (e.dive) diving++; }
  if (!G.spawn.done && G.stage < 4) return;
  const total = inForm + diving;
  const lvl = G.stage + G.cycle * 3;
  const few = total <= 6;
  G.dive.max = few ? 6 : Math.min(7, 2 + Math.floor(lvl / 2));
  G.dive.t -= dt * G.D.dive * (few ? 2.2 : 1);
  if (G.dive.t > 0 || diving >= G.dive.max || inForm === 0) return;
  G.dive.t = Math.max(0.55, lerp(2.3, 0.9, clamp((lvl - 1) / 12, 0, 1)) * rnd(0.7, 1.3));
  // pick from the formation: edges and lower rows dive more
  let pick = null, best = -1;
  for (let i = 0; i < NE; i++) {
    const e = G.E[i]; if (!e.on || e.st !== S_FORM) continue;
    const w = Math.random() * (1 + Math.abs(e.col - 4.5) * 0.25 + e.row * 0.2) + (e.type === MOTH ? 0.15 : 0);
    if (w > best) { best = w; pick = e; }
  }
  if (!pick) return;
  if (pick.type === MOTH) {
    const canBeam = !P.dual && !G.beam.on && !G.rescue.on && !anyCaptive() && Math.random() < 0.45 && G.P.inv <= 0;
    if (canBeam) { buildDive(pick, true); au('mothdive'); return; }
    // a moth dives with up to two bug escorts
    buildDive(pick, false); let esc = 0;
    for (let i = 0; i < NE && esc < 2; i++) {
      const e = G.E[i]; if (!e.on || e.st !== S_FORM || e.type !== BUG || Math.abs(e.col - pick.col) > 1.6 || e.row !== 1) continue;
      const off = esc === 0 ? -1.5 : 1.5;
      e.np = pick.np; for (let k = 0; k < pick.np * 2; k++) e.path[k] = pick.path[k] + (k % 2 === 0 ? off : -0.3);
      e.path[0] = e.x; e.path[1] = e.y; e.seg = 0; e.u = 0; e.st = S_PATH; e.after = A_WRAP; e.dive = true; e.t = 0; e.wob = 0; e.spd = pick.spd;
      esc++;
    }
    au('mothdive');
    return;
  }
  buildDive(pick, false); au('dive');
}
function anyCaptive() { for (let i = 0; i < NE; i++) if (G.E[i].on && G.E[i].captive) return true; return false; }

/* ------------------------------------------------------------ enemies */
function enemyStep(e, dt, sdt) {
  e.px = e.x; e.py = e.y; e.pang = e.ang;
  e.flash = Math.max(0, e.flash - dt * 6);
  if (e.st === S_WAIT) { e.delay -= sdt; if (e.delay <= 0) { e.st = S_PATH; } else return; }
  e.t += sdt;
  const ox = e.x, oy = e.y;
  if (e.st === S_PATH) {
    let d = e.spd * sdt;
    while (d > 0 && e.seg < e.np - 1) {
      const i = e.seg * 2, L = Math.max(0.05, Math.hypot(e.path[i + 2] - e.path[i], e.path[i + 3] - e.path[i + 1]));
      const du = d / L;
      if (e.u + du < 1) { e.u += du; d = 0; } else { d -= (1 - e.u) * L; e.u = 0; e.seg++; }
    }
    if (e.seg >= e.np - 1) {
      const last = (e.np - 1) * 2; e.x = e.path[last]; e.y = e.path[last + 1];
      pathDone(e);
    } else {
      crEval(e.path, e.np, e.seg, e.u, CR); e.x = CR.x; e.y = CR.y;
      if (e.wob && e.seg >= 4) e.x += Math.sin(e.t * 5.2 + e.seed) * e.wob * smooth((e.seg - 4 + e.u) * 0.8);
    }
    if (e.dive) enemyFire(e, sdt);
    else if (G.stage >= 3 && !e.bonus && e.y < 24 && e.y > 9) enemyFire(e, sdt * 0.35);
  } else if (e.st === S_HOME) {
    const tx = slotX(G, e.col), ty = slotY(G, e.row);
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    const spd = e.spd * 0.95;
    if (d < Math.max(0.25, spd * sdt * 1.2)) { e.x = tx; e.y = ty; e.st = S_FORM; e.dive = false; }
    else {
      // steer with a limited turn so the arrival curves in
      const want = Math.atan2(dx, dy), cur = Math.atan2(e.hx, e.hy);
      let df = want - cur; while (df > Math.PI) df -= TAU; while (df < -Math.PI) df += TAU;
      const turn = (4 + 26 / (d + 0.4)) * sdt;
      const na = cur + clamp(df, -turn, turn);
      e.hx = Math.sin(na); e.hy = Math.cos(na);
      const step = Math.min(d, spd * sdt);
      e.x += e.hx * step; e.y += e.hy * step;
    }
  } else if (e.st === S_FORM) {
    e.x = slotX(G, e.col); e.y = slotY(G, e.row);
  } else if (e.st === S_BEAM) {
    e.beamT += sdt;
    e.y += Math.sin(e.t * 3) * 0.004;
    const B = G.beam;
    if (!B.on && e.beamT < 0.2) { B.on = true; B.e = e.id; B.t = 0; B.open = 0; au('beam'); }
    if (B.on && B.e === e.id) {
      B.t += sdt;
      B.open = B.t < 0.7 ? smooth(B.t / 0.7) : B.t > 3.2 ? 1 - smooth((B.t - 3.2) / 0.5) : 1;
      B.w = 0.35 + B.open * 1.9;
      const P = G.P;
      if (P.alive && !P.dual && P.inv <= 0 && B.open > 0.9 && Math.abs(P.x - e.x) < B.w * 0.62 && G.P.state === 'alive') capture(e);
      if (B.t > 3.7 && G.P.state !== 'captured') { B.on = false; beamDone(e); }
    } else if (e.beamT > 0.4 && !(B.on && B.e === e.id)) beamDone(e);
  }
  // heading follows motion; in formation they face the city
  const vx = (e.x - ox) / Math.max(1e-4, sdt), vy = (e.y - oy) / Math.max(1e-4, sdt);
  e.vx = vx; e.vy = vy;
  if (e.st === S_PATH || e.st === S_HOME) {
    const sp = Math.hypot(vx, vy);
    if (sp > 0.5) {
      let a = Math.atan2(vx, -vy), df = a - e.ang; while (df > Math.PI) df -= TAU; while (df < -Math.PI) df += TAU;
      e.ang += df * Math.min(1, dt * 12);
      if (e.st === S_PATH) { e.hx = vx / sp; e.hy = vy / sp; }
    }
  } else {
    let df = -e.ang; while (df > Math.PI) df -= TAU; while (df < -Math.PI) df += TAU;
    e.ang += df * Math.min(1, dt * 8);
  }
  while (e.ang > Math.PI) { e.ang -= TAU; e.pang -= TAU; }
  while (e.ang < -Math.PI) { e.ang += TAU; e.pang += TAU; }
}
function pathDone(e) {
  if (e.after === A_EXIT) { e.on = false; return; }
  if (e.after === A_BEAM) { e.st = S_BEAM; e.beamT = 0; e.dive = true; return; }
  if (e.after === A_WRAP) {
    // out of the bottom, back in from the top and home to the slot
    e.x = e.px = slotX(G, e.col) + rnd(-2, 2); e.y = e.py = 34; e.hx = 0; e.hy = -1; e.st = S_HOME; e.dive = false; return;
  }
  e.st = S_HOME; e.dive = false;
}
function beamDone(e) { e.st = S_HOME; e.dive = false; e.hx = 0; e.hy = 1; if (G.beam.e === e.id) G.beam.on = false; }
function enemyFire(e, dt) {
  if (G.calm || e.bonus || G.kind === 'bonus' || G.cfg.attract && Math.random() < 0.5) return;
  const P = G.P;
  if (!P.alive || e.y < PY + 5 || e.y > 27) return;
  e.fireT -= dt * G.D.fire * (G.stage <= 1 ? 0.55 : 1);
  if (e.fireT > 0) return;
  const lvl = G.stage + G.cycle * 3;
  e.fireT = rnd(1.1, 2.4) * lerp(1, 0.55, clamp(lvl / 14, 0, 1));
  const bs = (10.5 + Math.min(6, lvl * 0.35)) * G.D.bspd;
  aimShot(e.x, e.y - 0.5, bs, 0, 0);
  au('eshot');
}
function aimShot(x, y, spd, spread, k) {
  const b = freeB(G.EB); if (!b) return;
  const P = G.P;
  const tx = P.x + P.vx * 0.25 * G.D.aim + rnd(-0.6, 0.6), ty = PY;
  let dx = tx - x, dy = ty - y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  if (dy > -0.55) { dy = -0.55; dx = Math.sign(dx) * Math.sqrt(1 - dy * dy); }
  const c = Math.cos(spread), s = Math.sin(spread);
  b.on = true; b.k = k || 0; b.t = 0; b.x = b.px = x; b.y = b.py = y;
  b.vx = (dx * c - dy * s) * spd; b.vy = (dx * s + dy * c) * spd;
}

/* ------------------------------------------------------------ killing things */
function chainHit() {
  G.chain++; G.chainT = 1.5; G.bestChain = Math.max(G.bestChain, G.chain);
  const m = Math.min(5, 1 + Math.floor(G.chain / 5));
  if (m > G.mult && !G.cfg.attract) { banner('Chain x' + m, '', 0.9); au('mult'); }
  G.mult = m;
  G.chainStr = 'x' + m + '  CHAIN ' + G.chain;
}
function damage(e, n) {
  e.hp -= n; e.flash = 1;
  if (e.hp > 0) { fx('hit', e.x, e.y, e.type); au('tick'); return; }
  killEnemy(e);
}
function killEnemy(e) {
  const diving = e.st !== S_FORM;
  let pts;
  if (e.bonus) { pts = 100; G.bonusHits++; }
  else if (e.type === KITE) pts = diving ? 100 : 50;
  else if (e.type === BUG) pts = diving ? 160 : 80;
  else pts = diving ? (e.captive ? 1000 : 400) : 150;
  chainHit();
  addScore(pts * G.mult, e.x, e.y);
  G.kills++;
  fx('pop', e.x, e.y, e.type, e.gift ? 1 : 0);
  au(e.type === MOTH ? 'popbig' : 'pop');
  if (!G.cfg.attract) {
    const now = performance.now();
    if (now - lastTapHap > 110) { lastTapHap = now; hap(e.type === MOTH ? 'hit' : 'tap', e.type === MOTH ? 0.7 : 0.35); }
  }
  shake(e.type === MOTH ? 3 : 1.2);
  if (e.captive) {
    if (diving) {
      const R = G.rescue; R.on = true; R.x = R.px = e.x; R.y = R.py = e.y + 1.3; R.t = 0; R.spin = 0; R.wait = false;
      banner('Rocket freed', 'It is coming back to fly beside you', 1.8); au('rescue'); hap('success', 0.8);
    } else {
      const L = G.lost; L.on = true; L.x = L.px = e.x; L.y = L.py = e.y + 1.3; L.t = 0; L.spin = 0;
      if (!G.cfg.attract) ARC.toast('Rocket lost to the sky', 'Free a towed rocket while its moth dives', 1800);
    }
    e.captive = 0;
  }
  if (G.beam.on && G.beam.e === e.id) G.beam.on = false;
  if (e.gift || (!e.bonus && G.kills % 18 === 0)) dropPickup(e.x, e.y);
  e.on = false;
}
function dropPickup(x, y) {
  const p = freeB(G.PU); if (!p) return;
  const r = Math.random();
  p.on = true; p.x = p.px = x; p.y = p.py = y; p.t = 0;
  p.k = r < 0.32 ? 0 : r < 0.56 ? 1 : r < 0.76 ? 2 : 3;
  if (p.k === 3 && G.P.nova >= 3) p.k = 0;
}
function capture(e) {
  const P = G.P;
  P.state = 'captured'; P.alive = false; P.capT = 0; P.capE = e.id; P.cx = P.x; P.cy = PY;
  G.captures++; G.calm = true; G.chain = 0; G.mult = 1;
  fx('capture', P.x, PY); au('captured'); hap('fail', 0.8);
  banner('Rocket captured', 'Shoot that moth while it dives to win it back', 2.2);
}
function playerDown(which) {
  const P = G.P;
  if (P.shield > 0) { P.shield = 0; P.inv = 0.9; fx('shieldpop', P.x, PY); au('shieldpop'); hap('hit', 0.7); shake(3); return; }
  if (P.dual) {
    const x = which > 0 ? P.x + DUAL_DX : which < 0 ? P.x - DUAL_DX : P.x + DUAL_DX;
    fx('player', x, PY); P.dual = false; P.x += which < 0 ? DUAL_DX : -DUAL_DX; P.x = clamp(P.x, -9.2, 9.2); P.px = P.x; P.tx = P.x; P.inv = 1.2;
    au('down'); hap('heavy', 0.7); shake(6); G.chain = 0; G.mult = 1;
    return;
  }
  P.alive = false; P.state = 'dead'; P.hitT = 0;
  fx('player', P.x, PY); au('down'); hap('heavy', 1); shake(10);
  G.flash = 1; G.chain = 0; G.mult = 1; G.calm = true;
  loseLife();
}
function loseLife() {
  const P = G.P;
  P.spread = 0; P.slow = 0;
  if (G.cfg.mode === 'blitz' && !G.cfg.attract) { G.clock = Math.max(0, G.clock - 8); addPop(P.x, PY + 2, -8, 0); }
  else if (!G.cfg.attract) G.lives--;
  G.respawnT = 2.3;
  if (G.lives <= 0 && G.cfg.mode !== 'blitz') { G.overT = 2.6; G.phase = 'gameover'; G.pt = 0; banner('Raid over', 'The city lights stay on, for now', 2.4, true); musicSong(null); au('over'); }
}
function respawn() {
  const P = G.P;
  P.alive = true; P.state = 'alive'; P.x = P.px = P.tx = 0; P.vx = 0; P.inv = 2.2; P.y = P.py = -3; P.rise = 0; G.calm = false;
  fx('launch', 0, -2); au('launch');
}

/* ------------------------------------------------------------ the player */
const INP = { move: 0, target: null, fire: false, tapFire: false, nova: false, touchTarget: 0, touching: false };
function playerStep(dt) {
  const P = G.P;
  P.px = P.x; P.py = P.y;
  P.inv = Math.max(0, P.inv - dt); P.fireFlash = Math.max(0, P.fireFlash - dt * 10);
  if (P.shield > 0) P.shield = Math.max(0, P.shield - dt);
  if (P.spread > 0) P.spread = Math.max(0, P.spread - dt);
  if (P.slow > 0) P.slow = Math.max(0, P.slow - dt);
  if (P.state === 'captured') {
    P.capT += dt;
    const e = G.E[P.capE];
    const k = smooth(P.capT / 1.8);
    if (e && e.on) { P.cx = lerp(P.cx, e.x, k * 0.2); P.cy = lerp(PY, e.y + 1.3, k); P.x = lerp(P.x, e.x, Math.min(1, dt * 2 * k)); }
    P.spin += dt * (6 + 8 * k);
    if (P.capT >= 1.8) {
      if (e && e.on) e.captive = 1;
      P.state = 'dead'; G.beam.on = false; if (e && e.on) beamDone(e);
      loseLife();
    }
    return;
  }
  if (!P.alive || P.state === 'launch') return;
  if (P.rise < 1) { P.rise = Math.min(1, P.rise + dt * 1.7); P.y = lerp(-3, PY, easeOut(P.rise)); }
  else P.y = PY;
  const half = P.dual ? 9.2 - DUAL_DX : 9.2;
  // movement: a target (mouse, finger) or an axis (keys, stick, tilt)
  const maxV = 15.5;
  if (INP.target != null) {
    const tx = clamp(INP.target, -half, half);
    const want = clamp((tx - P.x) * 14, -34, 34);
    P.vx = lerp(P.vx, want, Math.min(1, dt * 22));
  } else {
    const want = INP.move * maxV;
    P.vx += clamp(want - P.vx, -150 * dt, 150 * dt);
  }
  P.x += P.vx * dt;
  if (P.x < -half) { P.x = -half; P.vx = 0; } if (P.x > half) { P.x = half; P.vx = 0; }
  P.lean = lerp(P.lean, clamp(-P.vx / 20, -0.6, 0.6), Math.min(1, dt * 10));
  // fire
  P.fireT -= dt;
  const wantFire = INP.fire || INP.tapFire;
  if (wantFire && P.fireT <= 0 && G.phase !== 'gameover') {
    if (shoot()) { P.fireT = P.spread > 0 ? 0.15 : 0.13; INP.tapFire = false; }
  }
  if (INP.nova) { INP.nova = false; useNova(); }
}
function shoot() {
  const P = G.P;
  let live = 0; for (let i = 0; i < NPB; i++) if (G.PB[i].on) live++;
  const per = P.spread > 0 ? 3 : 1, ships = P.dual ? 2 : 1;
  const cap = (P.spread > 0 ? 14 : 7) * ships;
  if (live + per * ships > cap) return false;
  for (let s = 0; s < ships; s++) {
    const x = P.dual ? P.x + (s ? DUAL_DX : -DUAL_DX) : P.x;
    for (let k = 0; k < per; k++) {
      const b = freeB(G.PB); if (!b) break;
      const a = per === 3 ? (k - 1) * 0.15 : 0;
      b.on = true; b.t = 0; b.x = b.px = x + (per === 3 ? (k - 1) * 0.2 : 0); b.y = b.py = P.y + 1.0; b.vx = Math.sin(a) * 34; b.vy = Math.cos(a) * 34; b.k = s;
    }
  }
  if (!G.cfg.attract) G.shots += per * ships;
  P.fireFlash = 1; fx('muzzle', P.x, P.y + 1, ships);
  au('shot');
  return true;
}
function useNova() {
  const P = G.P;
  if (!P.alive || P.nova <= 0 || G.nova.on) { if (P.alive && P.nova <= 0 && !G.cfg.attract) au('empty'); return; }
  P.nova--; G.novaId++;
  const N = G.nova; N.on = true; N.x = P.x; N.y = P.y + 0.6; N.r = 0; N.pr = 0; N.id = G.novaId;
  P.inv = Math.max(P.inv, 0.6);
  fx('nova', N.x, N.y); au('nova'); hap('boost', 1); shake(4);
  syncPads();
}
function novaStep(dt) {
  const N = G.nova; if (!N.on) return;
  N.pr = N.r; N.r += dt * 24;
  for (let i = 0; i < NEB; i++) {
    const b = G.EB[i]; if (!b.on) continue;
    const d = Math.hypot(b.x - N.x, b.y - N.y);
    if (d < N.r + 0.4) { b.on = false; fx('fizz', b.x, b.y); }
  }
  for (let i = 0; i < NE; i++) {
    const e = G.E[i]; if (!e.on || e.st === S_WAIT || e.nova === N.id) continue;
    if (Math.hypot(e.x - N.x, e.y - N.y) < N.r) { e.nova = N.id; damage(e, 2); }
  }
  const B = G.boss;
  if (B.on && B.dying <= 0) {
    for (let i = 0; i < 4; i++) { const p = B.pods[i]; if (p.hp > 0 && p.nova !== N.id && Math.hypot(p.x - N.x, p.y - N.y) < N.r) { p.nova = N.id; p.hp -= 5; p.flash = 1; if (p.hp <= 0) { fx('pod', p.x, p.y); addScore(1000 * G.mult, p.x, p.y); chainHit(); au('pod'); } } }
    if (B.novaHit !== N.id && Math.hypot(B.x - N.x, B.y - N.y) < N.r && podsAlive() === 0) { B.novaHit = N.id; B.hp -= 6; B.flash = 1; if (B.hp <= 0) killBoss(); }
  }
  if (N.r > 15) N.on = false;
}
function applyPickup(k) {
  const P = G.P;
  if (k === 0) { P.spread = Math.max(P.spread, 0) + 12; banner('Spread shot', '12 seconds of triple fire', 1.1); }
  else if (k === 1) { P.shield = 14; banner('Shield', 'Takes one hit for you', 1.1); }
  else if (k === 2) { P.slow = 7; banner('Slow time', 'The raiders crawl for 7 seconds', 1.1); }
  else { P.nova = Math.min(3, P.nova + 1); banner('Nova charge', 'X or a second finger', 1.1); syncPads(); }
  fx('pickup', P.x, PY + 0.5, k); au('power'); hap('boost', 0.6);
}

/* ------------------------------------------------------------ one fixed step */
function save() {
  for (let i = 0; i < NPB; i++) { const b = G.PB[i]; if (b.on) { b.px = b.x; b.py = b.y; } }
  for (let i = 0; i < NEB; i++) { const b = G.EB[i]; if (b.on) { b.px = b.x; b.py = b.y; } }
  for (let i = 0; i < NPU; i++) { const p = G.PU[i]; if (p.on) { p.px = p.x; p.py = p.y; } }
  const R = G.rescue; R.px = R.x; R.py = R.y; const L = G.lost; L.px = L.x; L.py = L.y;
}
function cellAt(x, y) {
  if (y < BAR.y - BAR.cs * 0.5 || y > barY(BAR.rows - 1) + BAR.cs * 0.5) return -1;
  for (let b = 0; b < BAR.n; b++) {
    const c = Math.round((x - BAR.xs[b]) / BAR.cs + 3);
    if (c < 0 || c >= BAR.cols) continue;
    const r = Math.round((y - BAR.y) / BAR.cs);
    if (r < 0 || r >= BAR.rows) continue;
    const i = (b * BAR.rows + r) * BAR.cols + c;
    if (G.cells[i]) return i;
  }
  return -1;
}
function chip(i) {
  G.cells[i]--;
  const b = Math.floor(i / (BAR.rows * BAR.cols)), r = Math.floor(i / BAR.cols) % BAR.rows, c = i % BAR.cols;
  fx('cell', barX(b, c), barY(r), G.cells[i]);
}
function step(dt) {
  save();
  const P = G.P;
  G.time += dt; G.pt += dt;
  const slow = P.slow > 0 ? 0.45 : 1;
  const sdt = dt * slow;
  G.chainT -= dt; if (G.chainT <= 0 && G.chain) { G.chain = 0; G.mult = 1; }
  G.flash = Math.max(0, G.flash - dt * 3);
  G.banner.t += dt;
  if (G.hint > 0 && G.phase === 'play') G.hint -= dt;
  // formation sway, then breathing once everyone is home
  const F = G.form; F.t += sdt;
  let entering = 0, alive = 0;
  for (let i = 0; i < NE; i++) { const e = G.E[i]; if (!e.on) continue; alive++; if (e.st === S_WAIT || (e.st === S_PATH && !e.dive) || (e.st === S_HOME && !e.dive && e.t < 8)) entering++; }
  if (!F.allIn && G.spawn.done && entering === 0 && G.kind === 'normal') F.allIn = true;
  const sw = F.allIn ? 0 : Math.sin(F.t * 0.8) * 0.9;
  F.sway = lerp(F.sway, sw, Math.min(1, dt * 2));
  F.breath = F.allIn ? 1 + 0.085 * (1 - Math.cos(F.t * 1.7)) : lerp(F.breath, 1, Math.min(1, dt * 2));

  // phases
  if (G.phase === 'launch') {
    const k = G.pt / 2.6;
    P.y = lerp(-8, PY, easeOut(k)); P.x = 0; P.px = 0;
    if (G.pt > 0.45 && G.pt - dt <= 0.45) { fx('launch', 0, -6.5); au('launch'); }
    if (G.pt >= 2.6) { P.y = PY; P.state = 'alive'; P.alive = true; beginStage(G.stage); }
  } else if (G.phase === 'ready') {
    if (G.pt >= (G.cfg.attract ? 0.4 : 1.4)) { G.phase = 'play'; G.pt = 0; G.spawn.t = 0; }
  } else if (G.phase === 'bossIntro') {
    if (G.pt >= 3.3) { G.phase = 'play'; G.pt = 0; G.spawn.done = true; if (!G.cfg.attract) banner('Rani Kandil', 'Pop her four lanterns, then the heart', 1.6); }
  } else if (G.phase === 'play') {
    // groups fly in
    if (!G.spawn.done && G.kind !== 'boss') {
      G.spawn.t -= sdt;
      if (G.spawn.t <= 0) {
        spawnGroup(G.spawn.groups); G.spawn.groups++;
        G.spawn.t = G.kind === 'bonus' ? 3.0 : Math.max(1.5, 2.5 - G.stage * 0.06);
        if (G.spawn.groups >= 5) { G.spawn.done = true; if (G.kind === 'normal') pickGifts(); }
      }
    }
    diveScheduler(sdt);
    // stage clear
    if (G.spawn.done && !G.rescue.on) {
      if (G.kind === 'boss') { if (G.boss.dead && alive === 0) stageClear(); }
      else if (alive === 0) stageClear();
    }
  } else if (G.phase === 'clear') {
    if (G.pt >= 2.4) beginStage(G.stage + 1);
  } else if (G.phase === 'gameover') {
    G.overT -= dt;
    if (G.overT <= 0 && !G.overSent) endGame();
  }
  // blitz clock
  if (G.cfg.mode === 'blitz' && !G.cfg.attract && (G.phase === 'play' || G.phase === 'ready' || G.phase === 'clear' || G.phase === 'bossIntro')) {
    G.clock -= dt;
    if (G.clock <= 0 && !G.overSent && G.phase !== 'gameover') { G.clock = 0; G.phase = 'gameover'; G.overT = 2.2; G.pt = 0; banner('Time', 'The festival sky is yours', 2.2, true); musicSong(null); au('over'); }
  }
  // respawn
  if (!P.alive && P.state === 'dead' && G.phase !== 'gameover') {
    G.respawnT -= dt;
    let busy = false;
    for (let i = 0; i < NE; i++) { const e = G.E[i]; if (e.on && e.dive && e.st === S_PATH && e.after === A_WRAP) { busy = true; break; } }
    if (G.respawnT <= 0 && (!busy || G.respawnT < -4)) respawn();
  }

  playerStep(dt);
  for (let i = 0; i < NE; i++) { const e = G.E[i]; if (e.on) enemyStep(e, dt, sdt); }
  if (G.boss.on) bossStep(dt, sdt);
  novaStep(dt);

  // rescued rocket glides down to dock beside you
  const R = G.rescue;
  if (R.on) {
    R.t += dt; R.spin += dt * 7;
    if (P.alive && P.state === 'alive') {
      const tx = clamp(P.x + DUAL_DX, -9.2, 9.2), ty = PY;
      const k = Math.min(1, dt * (1.4 + R.t));
      R.x = lerp(R.x, tx, k); R.y = lerp(R.y, ty, k * 0.8);
      if (Math.abs(R.x - tx) < 0.15 && Math.abs(R.y - ty) < 0.15 && R.t > 1) {
        R.on = false;
        if (!P.dual) { P.dual = true; P.x = clamp(P.x, -9.2 + DUAL_DX, 9.2 - DUAL_DX); G.rescues++; banner('Double rocket', 'Twice the fire, twice the target', 1.6); au('dock'); hap('success', 1); fx('dock', P.x + DUAL_DX, PY); addScore(1000, P.x, PY + 1.5); }
      }
    } else { R.x = lerp(R.x, 0, dt); R.y = lerp(R.y, PY + 4, dt); }
  }
  const L = G.lost;
  if (L.on) { L.t += dt; L.spin += dt * 5; L.y += dt * (3 + L.t * 6); L.x += Math.sin(L.t * 3) * dt; if (L.y > 36) L.on = false; }

  // player bullets
  for (let i = 0; i < NPB; i++) {
    const b = G.PB[i]; if (!b.on) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
    if (b.y > FTOP + 2 || b.x < -12 || b.x > 12) { b.on = false; continue; }
    let hit = false;
    for (let j = 0; j < NE; j++) {
      const e = G.E[j]; if (!e.on || e.st === S_WAIT) continue;
      const r = ENEMY_R[e.type] + 0.16, dx = b.x - e.x, dy = b.y - e.y;
      if (dx * dx + dy * dy < r * r) { hit = true; if (!G.cfg.attract) G.hits++; damage(e, 1); break; }
    }
    if (!hit && G.boss.on && hitBoss(b)) { hit = true; if (!G.cfg.attract) G.hits++; }
    if (hit) b.on = false;
  }
  // enemy bullets
  for (let i = 0; i < NEB; i++) {
    const b = G.EB[i]; if (!b.on) continue;
    b.x += b.vx * sdt; b.y += b.vy * sdt; b.t += sdt;
    if (b.y < -3 || b.y > FTOP + 6 || b.x < -13 || b.x > 13) { b.on = false; continue; }
    const ci = cellAt(b.x, b.y);
    if (ci >= 0) { chip(ci); b.on = false; continue; }
    if (P.alive && P.inv <= 0 && Math.abs(b.y - P.y) < 0.75) {
      const rr = b.k ? 0.62 : 0.5;
      if (Math.abs(b.x - (P.dual ? P.x - DUAL_DX : P.x)) < rr) { b.on = false; playerDown(-1); continue; }
      if (P.dual && Math.abs(b.x - (P.x + DUAL_DX)) < rr) { b.on = false; playerDown(1); continue; }
    }
  }
  // divers: through the shields, and into the rocket
  for (let i = 0; i < NE; i++) {
    const e = G.E[i]; if (!e.on || !e.dive) continue;
    if (e.y < BAR.y + 1.6 && e.y > BAR.y - 0.6) {
      for (let k = 0; k < 3; k++) { const ci = cellAt(e.x + (k - 1) * 0.45, e.y); if (ci >= 0) { G.cells[ci] = 1; chip(ci); } }
    }
    if (P.alive && P.inv <= 0 && Math.abs(e.y - P.y) < 1.1) {
      const r = ENEMY_R[e.type] + 0.45;
      const hitL = Math.abs(e.x - (P.dual ? P.x - DUAL_DX : P.x)) < r, hitR = P.dual && Math.abs(e.x - (P.x + DUAL_DX)) < r;
      if (hitL || hitR) { e.hp = 1; damage(e, 9); playerDown(hitR && !hitL ? 1 : -1); }
    }
  }
  // pickups
  for (let i = 0; i < NPU; i++) {
    const p = G.PU[i]; if (!p.on) continue;
    p.t += dt; p.y -= dt * 5.2; p.x += Math.sin(p.t * 2.4) * dt * 0.8;
    if (p.y < -2) { p.on = false; continue; }
    if (P.alive && Math.abs(p.y - P.y) < 1.15 && (Math.abs(p.x - P.x) < 1.2 || (P.dual && Math.abs(p.x - (P.x + DUAL_DX)) < 1.2) || (P.dual && Math.abs(p.x - (P.x - DUAL_DX)) < 1.2))) { p.on = false; applyPickup(p.k); }
  }
  for (let i = 0; i < NPOP; i++) { const p = G.POP[i]; if (p.on) { p.t += dt; if (p.t > 1.1) p.on = false; } }
}
function stageClear() {
  G.phase = 'clear'; G.pt = 0;
  if (G.cfg.attract) return;
  if (G.kind === 'bonus') {
    const perfect = G.bonusHits >= 40;
    if (perfect) { addScore(10000); G.perfects++; banner('Perfect', 'All 40 popped. 10000 bonus', 2.2, true); hap('success', 1); fx('fireworks', 0, 18); au('perfect'); }
    else banner('Challenge over', G.bonusHits + ' of 40 popped', 2.2, true);
  } else {
    banner('Stage ' + G.stage + ' clear', G.kind === 'boss' ? 'The sky is quiet for a moment' : 'Accuracy ' + acc() + '%', 1.9, true);
    fx('fireworks', 0, 20); au('clear');
  }
}
const acc = () => (G.shots ? Math.round(G.hits / G.shots * 100) : 0);
function endGame() {
  G.overSent = true;
  const blitz = G.cfg.mode === 'blitz';
  ARC.over({
    score: G.score,
    eyebrow: blitz ? 'Blitz over' : 'Rockets spent',
    title: blitz ? 'Time <em>up</em>' : 'Raid <em>over</em>',
    html: '<div class="ar-res"><div><span>Stage</span><b>' + G.stage + '</b></div><div><span>Accuracy</span><b>' + acc() + '%</b></div><div><span>Best chain</span><b>' + G.bestChain + '</b></div><div><span>Rockets freed</span><b>' + G.rescues + '</b></div></div>'
  });
}

/* ------------------------------------------------------------ the attract-mode pilot (and the poster bot) */
function botStep(dt) {
  const P = G.P;
  // behind the menu the pilot holds fire most of the time, so the formation stays on show
  INP.fire = !G.cfg.attract || (G.time % 7) < 1.6; INP.target = null;
  let tx = 0, best = 99;
  for (let i = 0; i < NE; i++) { const e = G.E[i]; if (!e.on || e.st === S_WAIT) continue; const s = e.dive ? e.y - 6 : e.y; if (s < best) { best = s; tx = e.x; } }
  if (G.boss.on) tx = G.boss.x;
  for (let i = 0; i < NEB; i++) { const b = G.EB[i]; if (!b.on || b.y > PY + 7 || b.y < PY - 1) continue; const dx = P.x - b.x; if (Math.abs(dx) < 1.6) tx = P.x + (dx >= 0 ? 3 : -3); }
  for (let i = 0; i < NPU; i++) { const p = G.PU[i]; if (p.on && p.y < 12) tx = p.x; }
  INP.move = clamp((tx - P.x) * 0.6, -1, 1);
  if (Math.random() < dt * 0.05 && P.nova > 0) INP.nova = true;
}

/* ------------------------------------------------------------ input: keys, mouse, touch, controller */
const MOUSE = { x: 0, active: false, down: false, t: 0 };
const TT = { id: null, x0: 0, sx0: 0, t0: 0, moved: false, x: 0, left: 0 };
let fireOpt = 'touch';
function readInput(a, dt) {
  const inp = a.input, P = G.P;
  const kx = (inp.down('ArrowRight', 'KeyD') ? 1 : 0) - (inp.down('ArrowLeft', 'KeyA') ? 1 : 0);
  if (kx) MOUSE.active = false;
  const ax = inp.axis().x;
  INP.target = null; INP.move = 0;
  const touchy = a.touchMode;
  const gest = touchy && a.touchStyle === 'gesture';
  if (gest && TT.id != null) {
    const ppu = VIEW.pxPerUnit || 20;
    INP.target = TT.sx0 + (TT.x - TT.x0) / ppu * 1.25;
  } else if (kx) INP.move = kx;
  else if (Math.abs(ax) > 0.05) INP.move = ax;
  else if (MOUSE.active && !touchy) {
    const ppu = VIEW.pxPerUnit || 20;
    INP.target = (MOUSE.x - (VIEW.fieldCx != null ? VIEW.fieldCx : a.w / 2)) / ppu;
  }
  const held = inp.down('Space', 'KeyZ', 'KeyJ') || MOUSE.down;
  const auto = fireOpt === 'on' || (fireOpt === 'touch' && touchy && a.touchStyle !== 'pads');
  INP.fire = held || (auto && P.alive && G.phase !== 'clear');
  if (inp.hit('KeyX', 'KeyC', 'ShiftLeft', 'ShiftRight')) INP.nova = true;
}
function syncPads() {
  if (!ARC || !G || G.cfg.attract || !ARC.setPads) return;
  const n = G.P.nova;
  if (syncPads.last === n) return;
  syncPads.last = n;
  ARC.setPads([{ label: 'Fire', key: 'Space', big: true, hot: true }, { label: n > 0 ? 'Nova ' + n : 'Nova', key: 'KeyX', keep: true }]);
}
syncPads.last = -1;

/* ------------------------------------------------------------ sound: own WebAudio graph, gated by the shell's mute */
const AU = { ctx: null, master: null, sfx: null, mus: null, noise: null, muted: false, song: null, next: 0, step: 0, timer: 0, beam: null, ok: false };
function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try {
    const c = new AC(); AU.ctx = c;
    AU.master = c.createGain(); AU.master.gain.value = 0; AU.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(AU.master);
    AU.sfx = c.createGain(); AU.sfx.gain.value = 0.9; AU.sfx.connect(comp);
    AU.mus = c.createGain(); AU.mus.gain.value = 0.32; AU.mus.connect(comp);
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = buf; AU.ok = true;
    AU.timer = setInterval(musicTick, 60);
  } catch (e) { AU.ok = false; }
}
function audioFrame(a) {
  if (!AU.ok) return;
  const want = a.sfx.muted || a.state === 'pause' || (G && G.cfg.attract) ? 0 : 0.75;
  if (want !== AU.vol) { AU.vol = want; try { AU.master.gain.setTargetAtTime(want, AU.ctx.currentTime, 0.06); } catch (e) { /* closed */ } }
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function tone(f, dur, o) {
  if (!AU.ok || AU.vol === 0) return;
  o = o || {};
  const c = AU.ctx, t = c.currentTime + (o.at || 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'square'; osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.slide), t + dur);
  const v = o.vol || 0.08;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.012, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(o.bus || AU.sfx); osc.start(t); osc.stop(t + dur + 0.03);
}
function noise(dur, o) {
  if (!AU.ok || AU.vol === 0) return;
  o = o || {};
  const c = AU.ctx, t = c.currentTime + (o.at || 0);
  const src = c.createBufferSource(); src.buffer = AU.noise;
  const f = c.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.setValueAtTime(o.freq || 1500, t);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
  f.Q.value = o.q || 0.8;
  const g = c.createGain(); g.gain.setValueAtTime(o.vol || 0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(o.bus || AU.sfx); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.03);
}
let shotN = 0;
function au(k) {
  if (!AU.ok || !G || G.cfg.attract) return;
  switch (k) {
    case 'shot': shotN++; tone(shotN % 2 ? 1180 : 1080, 0.07, { type: 'square', slide: 520, vol: 0.028 }); break;
    case 'eshot': tone(520, 0.12, { type: 'triangle', slide: 300, vol: 0.03 }); break;
    case 'ebig': tone(260, 0.2, { type: 'sawtooth', slide: 140, vol: 0.035 }); break;
    case 'ring': noise(0.4, { filter: 'bandpass', freq: 900, sweep: 300, vol: 0.08, q: 2 }); break;
    case 'tick': tone(1600, 0.04, { type: 'triangle', vol: 0.04 }); break;
    case 'clink': tone(2400, 0.05, { type: 'sine', vol: 0.04 }); break;
    case 'pop': noise(0.18, { filter: 'bandpass', freq: 2200, sweep: 600, vol: 0.12, q: 1.2 }); tone(620 + Math.random() * 260, 0.12, { type: 'triangle', slide: 1500, vol: 0.06 }); break;
    case 'popbig': noise(0.35, { filter: 'lowpass', freq: 2600, sweep: 200, vol: 0.18 }); tone(300, 0.3, { type: 'triangle', slide: 900, vol: 0.08 }); [880, 1320].forEach((f, i) => tone(f, 0.1, { type: 'sine', vol: 0.04, at: 0.05 + i * 0.06 })); break;
    case 'pod': noise(0.5, { filter: 'lowpass', freq: 1800, sweep: 120, vol: 0.2 }); tone(180, 0.5, { type: 'sine', slide: 60, vol: 0.14 }); break;
    case 'bosshit': noise(0.9, { filter: 'lowpass', freq: 1200, sweep: 90, vol: 0.25 }); break;
    case 'bossdie': noise(1.8, { filter: 'lowpass', freq: 2400, sweep: 60, vol: 0.32 }); tone(110, 1.4, { type: 'sine', slide: 40, vol: 0.2 }); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.07, at: 0.6 + i * 0.12 })); break;
    case 'down': noise(0.7, { filter: 'lowpass', freq: 1400, sweep: 100, vol: 0.22 }); tone(420, 0.6, { type: 'sawtooth', slide: 70, vol: 0.06 }); break;
    case 'shieldpop': tone(900, 0.25, { type: 'sine', slide: 300, vol: 0.08 }); noise(0.25, { filter: 'highpass', freq: 2000, vol: 0.06 }); break;
    case 'dive': tone(900, 0.35, { type: 'sine', slide: 420, vol: 0.025 }); break;
    case 'mothdive': tone(700, 0.5, { type: 'triangle', slide: 300, vol: 0.035 }); tone(1050, 0.5, { type: 'sine', slide: 450, vol: 0.02 }); break;
    case 'beam': beamHum(true); break;
    case 'captured': beamHum(false); [660, 520, 400, 300].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.07, at: i * 0.13 })); break;
    case 'rescue': [523, 659, 784].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.05, at: i * 0.09 })); break;
    case 'dock': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.07, at: i * 0.08 })); break;
    case 'power': [660, 880, 1320].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.045, at: i * 0.06 })); break;
    case 'nova': noise(0.9, { filter: 'bandpass', freq: 400, sweep: 5000, vol: 0.16, q: 1.4 }); tone(220, 0.8, { type: 'sine', slide: 880, vol: 0.1 }); break;
    case 'empty': tone(200, 0.08, { type: 'square', vol: 0.03 }); break;
    case 'launch': noise(1.6, { filter: 'lowpass', freq: 300, sweep: 2400, vol: 0.16 }); break;
    case 'stage': [587, 740, 880, 1175].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.06, at: i * 0.11 })); break;
    case 'boss': [146, 138, 146, 196].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.06, at: i * 0.42 })); break;
    case 'clear': [784, 988, 1175].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.06, at: i * 0.1 })); break;
    case 'perfect': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.22, { type: 'square', vol: 0.05, at: i * 0.09 })); break;
    case 'mult': tone(1320, 0.1, { type: 'sine', vol: 0.04 }); tone(1760, 0.12, { type: 'sine', vol: 0.04, at: 0.06 }); break;
    case 'life': [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.06, at: i * 0.08 })); break;
    case 'over': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.36, { type: 'triangle', vol: 0.07, at: i * 0.22 })); break;
  }
}
function beamHum(on) {
  if (!AU.ok) return;
  if (AU.beam) { try { AU.beam.g.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.1); AU.beam.o.stop(AU.ctx.currentTime + 0.5); AU.beam.l.stop(AU.ctx.currentTime + 0.5); } catch (e) { /* stopped */ } AU.beam = null; }
  if (!on || AU.vol === 0) return;
  const c = AU.ctx, o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain();
  o.type = 'triangle'; o.frequency.value = 330; l.frequency.value = 7; lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency);
  g.gain.value = 0; g.gain.setTargetAtTime(0.05, c.currentTime, 0.2); g.gain.setTargetAtTime(0, c.currentTime + 3.6, 0.2);
  o.connect(g); g.connect(AU.sfx); o.start(); l.start(); o.stop(c.currentTime + 4.6); l.stop(c.currentTime + 4.6);
  AU.beam = { o, l, g };
}
// The score: a small festival band of synths. Bass, an arpeggio from a Kafi flavoured scale, kick, tabla-ish taps.
const SONGS = {
  main: { bpm: 112, roots: [38, 34, 36, 33], q: [[0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 9], [0, 3, 7, 10]], arp: [0, 1, 2, 3, 2, 1, 0, 2, 1, 2, 3, 4, 3, 2, 1, 2], lead: 0.03 },
  boss: { bpm: 132, roots: [38, 39, 38, 36], q: [[0, 3, 7, 12], [0, 4, 7, 12], [0, 3, 7, 12], [0, 3, 6, 12]], arp: [0, 2, 1, 3, 0, 2, 1, 4, 0, 2, 1, 3, 4, 3, 2, 1], lead: 0.035 },
  bonus: { bpm: 124, roots: [41, 43, 45, 43], q: [[0, 4, 7, 11], [0, 4, 7, 9], [0, 3, 7, 10], [0, 4, 7, 12]], arp: [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 2, 3, 1, 2, 1], lead: 0.03 }
};
function musicSong(name) { AU.song = name; AU.step = 0; if (AU.ok) AU.next = AU.ctx.currentTime + 0.1; }
function musicTick() {
  if (!AU.ok || !AU.song || AU.vol === 0) return;
  const c = AU.ctx, S = SONGS[AU.song], sp = 60 / S.bpm / 4;
  if (AU.next < c.currentTime) AU.next = c.currentTime + 0.05;
  while (AU.next < c.currentTime + 0.25) {
    const st = AU.step % 64, bar = Math.floor(st / 16), s = st % 16, root = S.roots[bar], ch = S.q[bar], at = AU.next - c.currentTime;
    if (s % 4 === 0) tone(mtof(root), sp * 3.2, { type: 'triangle', vol: 0.14, at, bus: AU.mus });
    if (s === 6 || s === 14) tone(mtof(root + 12), sp * 1.4, { type: 'triangle', vol: 0.08, at, bus: AU.mus });
    const ai = S.arp[s], deg = ch[ai % 4] + (ai >= 4 ? 12 : 0);
    tone(mtof(root + 24 + deg), sp * 0.9, { type: 'square', vol: S.lead, at, bus: AU.mus });
    if (s === 0 || s === 8 || (AU.song === 'boss' && s === 10)) tone(110, 0.16, { type: 'sine', slide: 40, vol: 0.2, at, bus: AU.mus });
    if (s === 4 || s === 12) noise(0.12, { filter: 'bandpass', freq: 1800, vol: 0.06, at, bus: AU.mus, q: 3 });
    if (s % 2 === 1) noise(0.04, { filter: 'highpass', freq: 7000, vol: 0.025, at, bus: AU.mus });
    if (s === 3 || s === 11) tone(mtof(root + 36 + ch[2]), sp * 0.5, { type: 'sine', vol: 0.02, at, bus: AU.mus });
    AU.step++; AU.next += sp;
  }
}

/* ------------------------------------------------------------ HUD */
const PJ = { x: 0, y: 0, on: false };
const PU_NAME = ['S', '', '', 'N'];
const FONT_M = '"JetBrains Mono", ui-monospace, monospace', FONT_B = 'Inter, -apple-system, sans-serif';
const FT0 = '700 20px ' + FONT_M, FT1 = '700 24px ' + FONT_M, FT2 = '700 18px ' + FONT_M, FT3 = '700 22px ' + FONT_M, FT4 = '700 14px ' + FONT_M, FT5 = '700 16px ' + FONT_M, FT6 = '500 12px ' + FONT_B, FT7 = '500 14px ' + FONT_B, FT8 = '600 10px ' + FONT_M, FT9 = '700 13px ' + FONT_M, FT10 = '800 11px ' + FONT_B, FT11 = '600 12px ' + FONT_B, FT12 = '700 11px ' + FONT_M, FT13 = '700 12px ' + FONT_M;
const FB0 = '600 30px Fraunces, Georgia, serif', FB1 = '600 44px Fraunces, Georgia, serif', FB2 = '600 18px Fraunces, Georgia, serif', FB3 = '600 24px Fraunces, Georgia, serif';
function drawHUD(ctx, a, g) {
  const pad = a.hudPad(), W = a.w, H = a.h, small = W < 520;
  if (g.cfg.attract) return;
  ctx.textBaseline = 'top';
  // score, best, stage
  ctx.fillStyle = 'rgba(251,245,236,0.6)'; ctx.font = FT8; ctx.textAlign = 'left';
  ctx.fillText('SCORE', pad.left + 2, pad.top);
  ctx.fillStyle = '#fbf5ec'; ctx.font = (small ? FT0 : FT1);
  ctx.fillText(g.scoreStr, pad.left + 2, pad.top + 13);
  ctx.textAlign = 'right'; ctx.font = FT8; ctx.fillStyle = 'rgba(251,245,236,0.6)';
  ctx.fillText(g.kind === 'bonus' ? 'CHALLENGE' : g.kind === 'boss' ? 'BOSS' : 'STAGE', W - pad.right - 2, pad.top);
  ctx.fillStyle = '#ffb736'; ctx.font = (small ? FT0 : FT1);
  ctx.fillText(g.stageStr, W - pad.right - 2, pad.top + 13);
  ctx.textAlign = 'center';
  const best = g.best;
  if (g.cfg.mode === 'blitz') {
    ctx.fillStyle = g.clock < 20 ? '#ff6a6a' : '#fbf5ec'; ctx.font = (small ? FT2 : FT3);
    const s = Math.ceil(g.clock);
    if (s !== g.clockS) { const m = Math.floor(s / 60), r = s % 60; g.clockS = s; g.clockStr = m + ':' + (r < 10 ? '0' : '') + r; }
    ctx.fillText(g.clockStr, W / 2, pad.top + 12);
    ctx.font = FT8; ctx.fillStyle = 'rgba(251,245,236,0.6)'; ctx.fillText('TIME', W / 2, pad.top);
  } else if (best != null) {
    ctx.font = FT8; ctx.fillStyle = 'rgba(251,245,236,0.6)'; ctx.fillText('BEST', W / 2, pad.top);
    ctx.font = (small ? FT4 : FT5); ctx.fillStyle = 'rgba(251,245,236,0.85)'; ctx.fillText(g.score > best ? g.scoreStr : g.bestStr, W / 2, pad.top + 14);
  }
  // chain meter
  if (g.chain >= 2) {
    const x = pad.left + 2, y = pad.top + (small ? 40 : 46);
    ctx.textAlign = 'left'; ctx.font = FT9; ctx.fillStyle = g.mult > 1 ? '#ffb736' : 'rgba(251,245,236,0.8)';
    ctx.fillText(g.chainStr, x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y + 17, 90, 3);
    ctx.fillStyle = '#ffb736'; ctx.fillRect(x, y + 17, 90 * clamp(g.chainT / 1.5, 0, 1), 3);
  }
  // boss health
  const B = g.boss;
  if (B.on && g.phase !== 'bossIntro' && B.dying <= 0) {
    const bw = Math.min(W - 140, 340), x = W / 2 - bw / 2, y = pad.top + (small ? 42 : 48);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 2, y - 2, bw + 4, 10);
    let podHp = 0, podMax = 0; for (let i = 0; i < 4; i++) { podHp += Math.max(0, B.pods[i].hp); podMax += B.pods[i].max; }
    const k = podHp > 0 ? 0.5 + 0.5 * podHp / podMax : 0.5 * B.hp / B.max;
    if (!HC.bar || HC.bx !== x || HC.bw !== bw) { HC.bar = ctx.createLinearGradient(x, 0, x + bw, 0); HC.bar.addColorStop(0, '#ff5a7a'); HC.bar.addColorStop(1, '#ffb736'); HC.bx = x; HC.bw = bw; }
    ctx.fillStyle = HC.bar; ctx.fillRect(x, y, bw * k, 6);
    ctx.textAlign = 'center'; ctx.font = FT8; ctx.fillStyle = 'rgba(251,245,236,0.75)';
    ctx.fillText(podHp > 0 ? BOSS_LBL[podsAlive()] : BOSS_LBL[0], W / 2, y + 10);
  }
  // lives, nova, power-ups at the bottom
  const by = H - pad.bottom - 30;
  ctx.textAlign = 'left';
  // a soft dark backing so the icons read over the lit city
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#0a0614'; ctx.fillRect(pad.left - 4, by - 4, (g.cfg.mode !== 'blitz' ? Math.min(6, Math.max(0, g.lives - (g.P.alive ? 1 : 0))) * 18 + 12 : 0) + (!a.touchMode || a.touchStyle === 'pads' ? 112 : 0), 32); ctx.globalAlpha = 1;
  if (g.cfg.mode !== 'blitz') {
    for (let i = 0; i < Math.min(6, g.lives - (g.P.alive ? 1 : 0)); i++) rocketIcon(ctx, pad.left + 10 + i * 18, by + 12, 1);
  }
  let nx = pad.left + 8 + (g.cfg.mode !== 'blitz' ? Math.min(6, Math.max(0, g.lives - (g.P.alive ? 1 : 0))) * 18 + 10 : 0);
  if (!a.touchMode || a.touchStyle === 'pads') {
    for (let i = 0; i < 3; i++) starIcon(ctx, nx + 8 + i * 17, by + 12, i < g.P.nova);
    ctx.font = FT8; ctx.fillStyle = 'rgba(251,245,236,0.55)'; ctx.fillText(a.gamepad ? 'X NOVA' : 'X NOVA', nx + 58, by + 7);
  }
  const P = g.P; let px = W - pad.right - 4; ctx.textAlign = 'right';
  if (a.touchMode && a.touchStyle !== 'pads') px = W - pad.right - 120;
  if (P.spread > 0) px = pill(ctx, px, by, 'SPREAD', '#ffb736', P.spread, 12);
  if (P.shield > 0) px = pill(ctx, px, by, 'SHIELD', '#6ee7ff', P.shield, 14);
  if (P.slow > 0) pill(ctx, px, by, 'SLOW', '#b69cff', P.slow, 7);
  // score pops and pickup labels, placed by the view's projection
  ctx.textAlign = 'center';
  for (let i = 0; i < NPOP; i++) {
    const p = g.POP[i]; if (!p.on) continue;
    if (!VIEW.project(p.x, p.y + 0.6 + p.t * 1.4, 0.5, PJ)) continue;
    const al = 1 - smooth((p.t - 0.6) / 0.5);
    ctx.globalAlpha = al; ctx.font = p.v >= 1000 ? FT5 : FT13;
    ctx.fillStyle = p.v < 0 ? '#ff6a6a' : p.v >= 1000 ? '#ffd36a' : '#fbf5ec';
    ctx.fillText(p.s, PJ.x, PJ.y);
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < NPU; i++) {
    const p = g.PU[i]; if (!p.on) continue;
    if (!VIEW.project(p.x, p.y, 0.9, PJ)) continue;
    if (p.k === 0 || p.k === 3) { ctx.font = FT10; ctx.fillStyle = '#1a1020'; ctx.textBaseline = 'middle'; ctx.fillText(PU_NAME[p.k], PJ.x, PJ.y + 0.5); ctx.textBaseline = 'top'; }
  }
  // banners
  const bn = g.banner;
  if (bn.t < bn.dur && bn.text) {
    const k = bn.t / bn.dur, inA = smooth(bn.t / 0.25), outA = 1 - smooth((k - 0.8) / 0.2), al = Math.min(inA, outA);
    const sc = a.reducedMotion ? 1 : 0.85 + 0.15 * easeOut(bn.t / 0.35);
    const cy = H * (bn.big ? 0.42 : 0.5);
    ctx.save(); ctx.globalAlpha = al; ctx.translate(W / 2, cy); ctx.scale(sc, sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = bn.big ? (small ? 30 : 44) : (small ? 18 : 24);
    ctx.font = bn.big ? (small ? FB0 : FB1) : (small ? FB2 : FB3);
    ctx.lineJoin = 'round'; ctx.lineWidth = bn.big ? 6 : 4; ctx.strokeStyle = 'rgba(40,10,40,0.55)'; ctx.strokeText(bn.text, 0, 0);
    ctx.fillStyle = '#fff4e2'; ctx.fillText(bn.text, 0, 0);
    if (bn.sub) { ctx.font = (small ? FT6 : FT7); ctx.fillStyle = 'rgba(251,245,236,0.8)'; ctx.fillText(bn.sub, 0, fs * 0.5 + 14); }
    ctx.restore();
  }
  // a gentle reminder of the touch controls in the first seconds
  if (a.touchMode && a.touchStyle === 'gesture' && g.hint > 0 && g.phase === 'play' && !(bn.t < bn.dur && bn.text)) {
    ctx.globalAlpha = Math.min(1, g.hint / 1.5) * 0.9; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = FT11; ctx.fillStyle = '#fbf5ec';
    ctx.fillText('Drag anywhere to fly. Autofire is on.', W / 2, H * 0.56);
    ctx.fillText('Tap with a second finger for a Nova.', W / 2, H * 0.56 + 18);
    ctx.globalAlpha = 1;
  }
  // slow time tint and a hit flash
  if (P.slow > 0) { ctx.globalAlpha = 0.07 * Math.min(1, P.slow); ctx.fillStyle = '#785aff'; ctx.fillRect(0, 0, W, H); }
  if (g.flash > 0 && !a.reducedMotion) { ctx.globalAlpha = g.flash * 0.18; ctx.fillStyle = '#ff785a'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}
const HC = { bar: null, bx: 0, bw: 0, widths: new Map() };
const BOSS_LBL = ['RANI KANDIL  ·  HEART OPEN', 'RANI KANDIL  ·  LANTERNS 1', 'RANI KANDIL  ·  LANTERNS 2', 'RANI KANDIL  ·  LANTERNS 3', 'RANI KANDIL  ·  LANTERNS 4'];
function pill(ctx, px, by, txt, col, t, max) {
  ctx.font = FT12;
  let w = HC.widths.get(txt); if (w == null) { w = ctx.measureText(txt).width + 18; HC.widths.set(txt, w); }
  ctx.fillStyle = 'rgba(10,8,20,0.6)'; ctx.fillRect(px - w, by, w, 22);
  ctx.fillStyle = col; ctx.fillRect(px - w, by + 20, w * clamp(t / max, 0, 1), 2);
  ctx.fillText(txt, px - 9, by + 5);
  return px - w - 6;
}
function rocketIcon(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#fbf5ec'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(4, -3, 3.2, 4); ctx.lineTo(-3.2, 4); ctx.quadraticCurveTo(-4, -3, 0, -8); ctx.fill();
  ctx.fillStyle = '#2fd3c8'; ctx.beginPath(); ctx.moveTo(-3.2, 1); ctx.lineTo(-6, 6); ctx.lineTo(-2.4, 4); ctx.fill(); ctx.beginPath(); ctx.moveTo(3.2, 1); ctx.lineTo(6, 6); ctx.lineTo(2.4, 4); ctx.fill();
  ctx.fillStyle = '#ffb736'; ctx.fillRect(-1.6, 4, 3.2, 2.4);
  ctx.restore();
}
function starIcon(ctx, x, y, on) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7, a = -Math.PI / 2 + i * Math.PI / 5; if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath();
  if (on) { ctx.fillStyle = '#ff7ad9'; ctx.fill(); }
  else { ctx.strokeStyle = 'rgba(251,245,236,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}

/* ------------------------------------------------------------ menu and debug */
const MENU_CSS = '.ar-res{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:10px 0 4px}.ar-res div{background:rgba(255,255,255,.04);border:1px solid rgba(251,245,236,.12);border-radius:10px;padding:8px 10px}.ar-res span{display:block;font:500 11px/1.2 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-dim)}.ar-res b{display:block;font:600 22px/1.2 var(--font-display);color:var(--ink)}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }
function menuProps() {
  return {
    eyebrow: 'Arcade space shooter', title: 'Akash <em>Raiders</em>',
    html: '<p>Night falls on the city and a festival of alien kites, lantern-bugs and moon moths swoops in to raid the sky. Break their formations, chain your hits, and if a moth tows your rocket away, shoot it mid-dive to fly double.</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'arcade', choices: [{ v: 'arcade', label: 'Arcade' }, { v: 'blitz', label: 'Blitz, 3 minutes' }] },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      { id: 'fire', label: 'Autofire', value: 'touch', choices: [{ v: 'touch', label: 'On touch' }, { v: 'on', label: 'Always' }, { v: 'off', label: 'Off' }] }
    ]
  };
}
function debugState() {
  const g = G, a = ARC;
  if (!g) return { state: a.state, phase: 'none' };
  let en = 0, form = 0, div = 0; for (let i = 0; i < NE; i++) { const e = g.E[i]; if (e.on) { en++; if (e.st === S_FORM) form++; if (e.dive) div++; } }
  let eb = 0; for (let i = 0; i < NEB; i++) if (g.EB[i].on) eb++;
  return {
    state: a.state, phase: g.cfg.attract ? 'attract' : g.phase, mode: g.cfg.mode, diff: g.cfg.diff, kind: g.kind, stage: g.stage,
    score: g.score, lives: g.lives, alive: g.cfg.attract ? true : (g.phase !== 'gameover' && (g.P.alive || g.P.state === 'launch')), x: +g.P.x.toFixed(2), vx: +g.P.vx.toFixed(2), dual: g.P.dual,
    enemies: en, formation: form, diving: div, enemyShots: eb, kills: g.kills, shots: g.shots, hits: g.hits, chain: g.chain, mult: g.mult, bestChain: g.bestChain,
    nova: g.P.nova, novas: g.novaId, spread: +g.P.spread.toFixed(1), shield: +g.P.shield.toFixed(1), slow: +g.P.slow.toFixed(1),
    captures: g.captures, rescues: g.rescues, beam: g.beam.on, boss: g.boss.on ? { hp: g.boss.hp, pods: podsAlive() } : null,
    cells: g.cells.reduce((s, v) => s + (v ? 1 : 0), 0), clock: +g.clock.toFixed(1), time: +g.time.toFixed(2), touch: a.touchStyle, input: a.inputMode,
    renderer: VIEW ? VIEW.name : 'none', ready: VIEW ? !!VIEW.ready : false, gfx: VIEW && VIEW.debug ? VIEW.debug() : null
  };
}

/* ------------------------------------------------------------ boot */
export function getGame() { return G; }
export function boot(view) {
  VIEW = view;
  const A = window.Arcade;
  A.create({
    three: !!view.three,
    slug: 'akash-raiders', title: 'Akash Raiders', genre: 'Space shooter',
    graphics(level) { if (view.graphics) view.graphics(level); },
    hint: 'Arrows or A D move, Space or Z fires, X sets off a Nova. The mouse works too: move to steer, hold click to fire.',
    touchHint: 'Stick moves the rocket. Fire and Nova on the right.',
    keys: [['Left Right / A D', 'Move'], ['Space / Z (hold)', 'Fire'], ['X', 'Nova blast'], ['Esc / P', 'Pause']],
    mouse: { steer: false, cursor: 'crosshair', keys: [['Move mouse', 'Steer the rocket'], ['Hold click', 'Fire'], ['Right click', 'Nova']] },
    gamepad: { buttons: ['Space', 'KeyX'], rt: 'Space', lt: 'KeyX' },
    touch: { stick: true, pads: [{ label: 'Fire', key: 'Space', big: true, hot: true }, { label: 'Nova', key: 'KeyX', keep: true }] },
    touchKeys: [['Stick', 'Move the rocket'], ['Fire', 'Hold to fire'], ['Nova', 'A blast that clears shots']],
    gestures: {
      drag: false, tilt: 'x',
      hint: 'Drag anywhere to fly. Autofire is on. Second finger: Nova.',
      keys: [['Drag anywhere', 'The rocket follows your finger'], ['Autofire', 'On while you touch the screen'], ['Second finger tap', 'Nova blast'], ['Nova button', 'Nova blast too']]
    },
    gameKeys: ['KeyZ', 'KeyX'],
    formatScore: (v) => String(v),
    resize: (a) => { if (view.resize) view.resize(a); },
    init(a) {
      ARC = a;
      if (!view.init(a)) return;
      const origMenu = a.menu;
      a.menu = function (p) { return origMenu(Object.assign(menuProps(), p || {})); };
      a.debug = debugState;
      a.dev = Object.assign({
        game: () => G,
        bot: (on) => { if (G) G.bot = on !== false; },
        level: (n) => { if (G) { G.stage = n - 1; G.phase = 'clear'; G.pt = 9; clearEnemies(); G.boss.on = false; G.P.state = 'alive'; G.P.alive = true; G.P.y = G.P.py = PY; } },
        skip: () => { if (G && G.phase === 'launch') G.pt = 2.59; },
        rescue: () => { if (!G) return false; for (let i = 0; i < NE; i++) { const e = G.E[i]; if (e.on && e.captive) { buildDive(e, false); e.t = 0.5; killEnemy(e); return true; } } return false; },
        beam: () => { if (!G) return false; for (let i = 0; i < NE; i++) { const e = G.E[i]; if (e.on && e.type === MOTH && e.st === S_FORM) { buildDive(e, true); return true; } } return false; },
        // fast forward the simulation (tests and posters on slow machines): the bot flies meanwhile
        ff: (sec, still) => { if (!G) return; const n = Math.round(sec / STEP); if (still) { INP.fire = false; INP.move = 0; INP.target = null; } for (let i = 0; i < n; i++) { if (!still) botStep(STEP); step(STEP); } }
      }, view.dev || {});
      const c = a.canvas;
      c.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') {
          if (TT.id == null) { TT.id = e.pointerId; TT.x0 = TT.x = e.clientX - (TT.left = c.getBoundingClientRect().left); TT.sx0 = G ? G.P.x : 0; TT.t0 = e.timeStamp; TT.moved = false; }
          else if (e.pointerId !== TT.id && G && G.phase !== 'gameover') INP.nova = true;
        } else if (e.pointerType === 'mouse') {
          MOUSE.x = e.clientX - c.getBoundingClientRect().left; MOUSE.active = true;
          if (e.button === 2) INP.nova = true; else MOUSE.down = true;
        }
      });
      c.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' && e.pointerId === TT.id) { TT.x = e.clientX - TT.left; if (Math.abs(TT.x - TT.x0) > 10) TT.moved = true; }
        else if (e.pointerType === 'mouse') { MOUSE.x = e.clientX - c.getBoundingClientRect().left; if (e.movementX || e.movementY) MOUSE.active = true; }
      });
      const up = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 2) MOUSE.down = false;
        if (e.pointerType === 'touch' && e.pointerId === TT.id) {
          TT.id = null;
          if (e.type !== 'pointercancel' && !TT.moved && e.timeStamp - TT.t0 < 320) INP.tapFire = true;
        }
      };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
      window.addEventListener('blur', () => { MOUSE.down = false; TT.id = null; });
      G = newGame({ mode: 'arcade', diff: 'normal', attract: true });
      G.phase = 'ready'; G.pt = 0; G.P.y = PY; G.P.state = 'alive'; beginStage(2);
      a.menu();
    },
    onMenu() { injectCss(); syncPads.last = -1; },
    start(a, ch) {
      injectCss();
      fireOpt = ch.fire === 'on' || ch.fire === 'off' ? ch.fire : 'touch';
      G = newGame({ mode: ch.mode === 'blitz' ? 'blitz' : 'arcade', diff: DIFF[ch.diff] ? ch.diff : 'normal', attract: false });
      G.best = a.best(); G.bestStr = G.best == null ? '' : String(G.best);
      INP.nova = false; INP.tapFire = false; TT.id = null; MOUSE.down = false;
      syncPads.last = -1; syncPads();
      audioInit(); musicSong('main');
      if (view.newGame) view.newGame(G, a);
    },
    update(dt, a) {
      if (!G || G.cfg.attract) return;
      readInput(a, dt);
      if (G.bot) botStep(dt);
      advance(dt, a);
      audioFrame(a);
    },
    idle(dt, a) {
      if (a.state === 'menu') {
        if (!G || !G.cfg.attract) { G = newGame({ mode: 'arcade', diff: 'normal', attract: true }); G.phase = 'ready'; G.pt = 0; G.P.y = PY; G.P.state = 'alive'; beginStage(2); if (view.newGame) view.newGame(G, a); }
        botStep(dt); advance(dt, a);
        if (G.phase === 'clear' && G.pt > 1) beginStage(2);
      } else if (a.state === 'over' && G) {
        INP.fire = false; INP.move = 0; INP.target = null;
        advance(dt, a);
      }
      audioFrame(a);
    },
    render(ctx, a) {
      if (!G) { ctx.fillStyle = '#05040c'; ctx.fillRect(0, 0, a.w, a.h); return; }
      let ok;
      try { ok = view.render(a, G, ctx) !== false; } catch (e) { ok = false; console.warn(e); }
      if (!ok) return;
      drawHUD(ctx, a, G);
    },
    onPause() { beamHum(false); },
    onOver() { beamHum(false); musicSong(null); }
  });
}
// Fixed steps with the remainder kept for interpolation; slow motion stretches time for a big moment.
function advance(dt, a) {
  if (!view_ready()) { G.alpha = 1; return; }
  let ts = 1;
  if (G.slowmo > 0) { G.slowmo -= dt; ts = a.reducedMotion ? 0.7 : 0.3 + 0.7 * smooth(1 - G.slowmo / 1.6); }
  G.acc += Math.min(dt, 0.05) * ts;
  let n = 0;
  while (G.acc >= STEP && n < 12) { step(STEP); G.acc -= STEP; n++; }
  if (n >= 12) G.acc = 0;
  G.alpha = G.acc / STEP;
}
function view_ready() { return !VIEW || VIEW.ready !== false; }
