/*
 * Nitro Goal, the shared core: rules, physics, AI, controls, HUD, sound and
 * the arcade shell glue. game3d.js (WebGL) and game.js (the 2D fallback) each
 * add a renderer, a "view", and call boot(view). Both play the same match.
 *
 * The arena is a rounded box: a flat pitch whose edges curve up into walls a
 * car can drive on, with a goal cut into each end wall. Everything that
 * touches the arena asks one function, surf(), how far it is from the nearest
 * surface and which way is inward.
 */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------ the arena, in metres */
export const HW = 40;      // half width (x)
export const HL = 58;      // half length (z), goal line to goal line
export const HC = 26;      // ceiling
export const RC = 9;       // radius of every curved edge
export const GW = 12;      // half width of a goal mouth
export const GH = 8.2;     // goal height
export const GD = 8;       // goal depth
export const BR = 2.0;     // ball radius
export const PR = 0.32;    // post radius
export const GRAV = 13;
export const H0 = 0.72;    // car centre above the surface it drives on
export const SONIC = 23.5; // supersonic: a bump at this speed knocks a rival out
const VDRIVE = 17, VBOOST = 28, VMAX = 30, VREV = 9;
const ACC = 26, ACCREV = 14, BRAKE = 40, COAST = 4, BOOSTA = 19, STICK = 6;
const JUMPV = 6.2, JUMPHOLD = 15, DJUMPV = 5.6, FLIPT = 0.62;
const PITCHR = 5.4, YAWR = 4.4, ROLLR = 5.6;
const STEP = 1 / 120;

export const TEAM = [
  { name: 'Saffron', col: '#ff7a1a', glow: '#ffb15c', dark: '#5a2200', soft: 'rgba(255,122,26,' },
  { name: 'Monsoon', col: '#2ab8ff', glow: '#8be3ff', dark: '#00304f', soft: 'rgba(42,184,255,' }
];
const NAMES = [['You', 'Kabir', 'Meera'], ['Zoya', 'Arjun', 'Ishaan']];
const MODES = { '3v3': 3, '2v2': 2, '1v1': 1 };
export const DIFF = {
  easy: { react: 0.42, vmul: 0.84, boost: 0.4, jump: 0.5, flip: 0.25, aerial: 0, aim: 0.55, keep: 30, hes: 0.25, save: 0.45 },
  normal: { react: 0.2, vmul: 0.95, boost: 0.85, jump: 0.9, flip: 0.7, aerial: 0.2, aim: 0.24, keep: 12, hes: 0.06, save: 0.8 },
  hard: { react: 0.09, vmul: 1.0, boost: 1, jump: 1, flip: 1, aerial: 0.75, aim: 0.08, keep: 0, hes: 0, save: 1 }
};

/* ------------------------------------------------------------ vectors */
export class V {
  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addS(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lenSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  len() { return Math.sqrt(this.lenSq()); }
  norm() { const l = this.len(); if (l > 1e-9) { this.x /= l; this.y /= l; this.z /= l; } return this; }
  crossOf(a, b) { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; this.x = x; this.y = y; this.z = z; return this; }
  rot(ax, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), d = ax.x * this.x + ax.y * this.y + ax.z * this.z;
    const cx = ax.y * this.z - ax.z * this.y, cy = ax.z * this.x - ax.x * this.z, cz = ax.x * this.y - ax.y * this.x;
    this.x = this.x * c + cx * s + ax.x * d * (1 - c);
    this.y = this.y * c + cy * s + ax.y * d * (1 - c);
    this.z = this.z * c + cz * s + ax.z * d * (1 - c);
    return this;
  }
}
const UP = new V(0, 1, 0);
const T1 = new V(), T2 = new V(), T3 = new V(), N = new V();

/* ------------------------------------------------------------ the surface: distance and inward normal */
const SQ = { nx: 0, ny: 1, nz: 0, curv: 0 }, SQ2 = { nx: 0, ny: 1, nz: 0, curv: 0 };
function arenaSD(x, y, z, o) {
  const cy = HC * 0.5;
  const dx = Math.abs(x) - (HW - RC), dy = Math.abs(y - cy) - (cy - RC), dz = Math.abs(z) - (HL - RC);
  const qx = dx > 0 ? dx : 0, qy = dy > 0 ? dy : 0, qz = dz > 0 ? dz : 0;
  const l = Math.sqrt(qx * qx + qy * qy + qz * qz);
  if (l > 1e-6) {
    o.nx = -(x < 0 ? -qx : qx) / l; o.ny = -(y < cy ? -qy : qy) / l; o.nz = -(z < 0 ? -qz : qz) / l;
    o.curv = ((qx > 0) + (qy > 0) + (qz > 0)) > 1 ? 1 / RC : 0;
    return RC - l;
  }
  o.curv = 0;
  if (dx >= dy && dx >= dz) { o.nx = x < 0 ? 1 : -1; o.ny = 0; o.nz = 0; return RC - dx; }
  if (dy >= dz) { o.nx = 0; o.ny = y < cy ? 1 : -1; o.nz = 0; return RC - dy; }
  o.nx = 0; o.ny = 0; o.nz = z < 0 ? 1 : -1; return RC - dz;
}
// Distance from a point to the nearest solid surface (positive inside the play space) and the inward normal.
export function surf(x, y, z, o) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax < GW && y < GH && az > HL - RC - 1) {
    // In front of or inside a goal: the floor, the cut sides of the ramp, and the goal's own walls past the line.
    const sx = x < 0 ? -1 : 1, sz = z < 0 ? -1 : 1;
    let d = y; o.nx = 0; o.ny = 1; o.nz = 0; o.curv = 0;
    if (az > HL) {
      const ds = GW - ax; if (ds < d) { d = ds; o.nx = -sx; o.ny = 0; o.nz = 0; }
      const dr = GH - y; if (dr < d) { d = dr; o.nx = 0; o.ny = -1; o.nz = 0; }
      const db = HL + GD - az; if (db < d) { d = db; o.nx = 0; o.ny = 0; o.nz = -sz; }
    } else {
      const da = arenaSD(sx * GW, y, z, SQ2), gx = GW - ax;
      if (da < 0) { if (gx < d) { d = gx; o.nx = -sx; o.ny = 0; o.nz = 0; } }
      else {
        const ds = Math.sqrt(gx * gx + da * da);
        if (ds < d && ds > 1e-6) { d = ds; o.nx = (-sx * gx + SQ2.nx * da) / ds; o.ny = SQ2.ny * da / ds; o.nz = SQ2.nz * da / ds; }
      }
    }
    return d;
  }
  return arenaSD(x, y, z, o);
}
// The goal frames: two posts and a crossbar at each end.
const SEGS = [];
[-1, 1].forEach((sz) => {
  SEGS.push([-GW, GH, sz * HL, GW, GH, sz * HL], [-GW, 0, sz * HL, -GW, GH, sz * HL], [GW, 0, sz * HL, GW, GH, sz * HL]);
});
// Push a sphere out of the world. Returns the depth of the deepest contact; its normal in o.
const CQ = { nx: 0, ny: 1, nz: 0, curv: 0 };
export function collideSphere(p, r, o) {
  let best = 0;
  const d = surf(p.x, p.y, p.z, CQ);
  if (r - d > best) { best = r - d; o.nx = CQ.nx; o.ny = CQ.ny; o.nz = CQ.nz; o.post = false; }
  if (Math.abs(Math.abs(p.z) - HL) < r + 1 && Math.abs(p.x) < GW + r + 1 && p.y < GH + r + 1) {
    for (let i = 0; i < SEGS.length; i++) {
      const s = SEGS[i], ex = s[3] - s[0], ey = s[4] - s[1], ez = s[5] - s[2];
      let t = ((p.x - s[0]) * ex + (p.y - s[1]) * ey + (p.z - s[2]) * ez) / (ex * ex + ey * ey + ez * ez);
      t = clamp(t, 0, 1);
      const cx = p.x - (s[0] + ex * t), cy = p.y - (s[1] + ey * t), cz = p.z - (s[2] + ez * t);
      const dl = Math.sqrt(cx * cx + cy * cy + cz * cz), pen = r + PR - dl;
      if (pen > best && dl > 1e-6) { best = pen; o.nx = cx / dl; o.ny = cy / dl; o.nz = cz / dl; o.post = true; }
    }
  }
  return best;
}

/* ------------------------------------------------------------ cars and the ball */
function mkCar(id, team, slot, name, isPlayer, level) {
  return {
    id, team, slot, name, isPlayer, level,
    p: new V(), v: new V(), f: new V(0, 0, 1), u: new V(0, 1, 0), r: new V(-1, 0, 0), n: new V(0, 1, 0), w: new V(),
    ground: true, boost: 33, boosting: false, holdT: 0, jumped: false, canSecond: false, secondT: 0, flipT: 0, flipAx: new V(),
    turtle: 0, rightT: 0, demoT: 0, hitCD: 0, steer: 0, spin: 0, airT: 0, sonic: false, vmul: 1, fellJump: false, lastShotT: -9,
    susp: 0, suspV: 0, jumps: 0, flips: 0,
    stats: { goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, touches: 0, points: 0 },
    ai: { think: 0, mode: 'attack', tx: 0, ty: 0, tz: 0, bx: 0, by: 0, bz: 0, plan: null, pt: 0, p1: false, p2: false, flipX: 1, flipY: 0, stuck: 0, rev: 0, hes: 0, aerial: false, boostOK: true, form: isPlayer ? 1 : 0.88 + Math.random() * 0.24, mood: 0, D: null, cheer: 0 },
    ctl: { thr: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, boost: false, jumpPress: false, jumpHeld: false, flipX: 0, flipY: 0, slide: false }
  };
}
function mkBall() { return { p: new V(0, BR, 0), v: new V(), w: new V(), q: [0, 0, 0, 1], vis: true, hitT: 0 }; }

// Kickoff spots for the team defending -z; the other team is the mirror image.
const KICK = [[-20, -30], [20, -30], [-3, -44], [3, -44], [0, -50]];
const KICK_SETS = { 1: [[0], [1], [4]], 2: [[0, 1], [2, 3], [0, 4]], 3: [[0, 1, 4], [2, 3, 4], [0, 1, 4]] };

export function newMatch(cfg) {
  const per = MODES[cfg.mode] || 3;
  const G = {
    cfg, per, phase: cfg.attract ? 'live' : 'intro', pt: 0, time: 0, realT: 0, acc: 0, tick: 0,
    clock: cfg.len || 300, ot: false, otT: 0, zeroT: 0, score: [0, 0], frozen: !cfg.attract, kickT: 0, kickActive: !!cfg.attract,
    ball: mkBall(), cars: [], pads: [], player: null, cam: cfg.cam || 'ball', touches: [], feed: [], pops: [], goalInfo: null,
    pred: { pts: [], n: 0, goalSide: 0, goalT: 9 }, role: {}, ts: 1, rp: null, finished: false, decided: false, firstKick: true,
    fade: cfg.attract ? 0 : 1, lb: cfg.attract ? 0 : 1, crowd: 0.2, shake: 0, cd: 3, events: 0, firstLive: -1, kickoffs: 0
  };
  for (let i = 0; i <= 30; i++) G.pred.pts.push({ t: i * 0.1, x: 0, y: 0, z: 0 });
  const mateLevel = cfg.diff === 'hard' ? 'hard' : 'normal';
  let id = 0;
  for (let t = 0; t < 2; t++) {
    for (let s = 0; s < per; s++) {
      const isPlayer = !cfg.attract && t === 0 && s === 0;
      const lvl = t === 0 ? (isPlayer ? 'normal' : mateLevel) : (cfg.attract ? 'normal' : cfg.diff);
      const c = mkCar(id++, t, s, isPlayer ? 'You' : NAMES[t][s] || ('Bot ' + id), isPlayer, lvl);
      c.vmul = isPlayer ? 1 : DIFF[lvl].vmul;
      G.cars.push(c);
      if (isPlayer) G.player = c;
    }
  }
  if (!G.player) G.player = G.cars[0];
  // Boost pads: six big ones (refill) and small ones that top up.
  const big = [[HW - 5, HL - 9], [HW - 5, 0], [HW - 5, -(HL - 9)], [-(HW - 5), HL - 9], [-(HW - 5), 0], [-(HW - 5), -(HL - 9)]];
  big.forEach((b) => G.pads.push({ x: b[0], z: b[1], big: true, t: 0 }));
  const small = [[0, 44], [24, 38], [10, 30], [0, 18], [34, 20], [18, 8], [10, 0]];
  small.forEach((s) => {
    const seen = {};
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach((m) => {
      const x = s[0] * m[0], z = s[1] * m[1], k = x + ',' + z;
      if (seen[k]) return; seen[k] = 1; G.pads.push({ x, z, big: false, t: 0 });
    });
  });
  kickoffReset(G);
  return G;
}
export function kickoffReset(G) {
  const B = G.ball; B.p.set(0, BR, 0); B.v.set(0, 0, 0); B.w.set(0, 0, 0); B.q = [0, 0, 0, 1]; B.vis = true;
  const set = KICK_SETS[G.per][Math.floor(Math.random() * 3)].slice();
  // the player takes a random spot of the set; teammates the rest
  for (let i = set.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = set[i]; set[i] = set[j]; set[j] = t; }
  [0, 1].forEach((team) => {
    const s = team === 0 ? 1 : -1, mates = G.cars.filter((c) => c.team === team);
    mates.forEach((c, i) => {
      const k = KICK[set[i % set.length]];
      c.p.set(k[0] * s, H0, k[1] * s); c.v.set(0, 0, 0);
      T1.set(-c.p.x, 0, -c.p.z).norm(); c.f.copy(T1); c.u.set(0, 1, 0); c.r.crossOf(c.f, c.u); c.n.set(0, 1, 0);
      c.ground = true; c.boost = 33; c.demoT = 0; c.flipT = 0; c.holdT = 0; c.turtle = 0; c.rightT = 0; c.w.set(0, 0, 0);
      c.jumped = false; c.canSecond = false; c.fellJump = false; c.ai.plan = null; c.ai.think = 0; c.ai.stuck = 0; c.ai.rev = 0;
    });
  });
  G.touches.length = 0; G.kickT = 0; G.kickActive = false;
  computePred(G);
}
function respawn(G, c) {
  const s = c.team === 0 ? -1 : 1;
  c.p.set((c.slot - 1) * 9, H0, s * (HL - 10)); c.v.set(0, 0, 0);
  c.f.set(0, 0, -s); c.u.set(0, 1, 0); c.r.crossOf(c.f, c.u); c.n.set(0, 1, 0);
  c.ground = true; c.boost = 33; c.flipT = 0; c.turtle = 0; c.w.set(0, 0, 0); c.jumped = false; c.canSecond = false;
  emit('respawn', { car: c });
}

/* ------------------------------------------------------------ events out to the view, the sound and the HUD */
let VIEW = null, ARC = null, MG = null, AU = null;
function emit(type, d) {
  if (ARC && ARC.state === 'play' && MG && !MG.cfg.attract) { try { sound(type, d); } catch (e) { /* sound never stops a match */ } }
  if (VIEW && VIEW.fx) { try { VIEW.fx(type, d, MG); } catch (e) { /* effects never stop a match */ } }
}
// One-shot sounds for what happens on the pitch, scaled by how hard it happened.
function sound(type, d) {
  const S = ARC.sfx;
  if (type === 'hit') { const k = d.k; S.tone(90 + k * 70, 0.16, { type: 'triangle', vol: 0.06 + k * 0.12, slide: 60 }); S.noise(0.08 + k * 0.1, { freq: 600 + k * 1800, vol: 0.05 + k * 0.12 }); }
  else if (type === 'post') S.tone(1200, 0.4, { type: 'sine', vol: 0.08, slide: 900 });
  else if (type === 'bounce') { if (d.k > 0.25) S.noise(0.06 + d.k * 0.08, { freq: 300 + d.k * 500, vol: 0.04 + d.k * 0.08 }); }
  else if (type === 'demo') { S.noise(0.5, { freq: 500, vol: 0.2 }); S.tone(160, 0.5, { type: 'sawtooth', vol: 0.1, slide: 50 }); }
  else if (type === 'jump') { if (d.car.isPlayer) S.tone(d.double ? 330 : 240, 0.09, { type: 'triangle', vol: 0.06, slide: d.double ? 520 : 380 }); }
  else if (type === 'flip') { if (d.car.isPlayer) S.noise(0.18, { freq: 1800, vol: 0.05, filter: 'bandpass' }); }
  else if (type === 'land') { if (d.car.isPlayer) S.noise(0.1, { freq: 300, vol: 0.06 + d.k * 0.1 }); }
  else if (type === 'bump') S.noise(0.12, { freq: 700, vol: 0.06 + d.k * 0.1 });
  else if (type === 'pad' && d.car.isPlayer) S.tone(d.pad.big ? 523 : 784, d.pad.big ? 0.12 : 0.05, { type: 'triangle', vol: d.pad.big ? 0.1 : 0.05 });
}
function pop(G, text, sub, col, big) { G.pops.push({ text, sub: sub || '', col: col || '#fbf5ec', t: 0, big: !!big }); if (G.pops.length > 4) G.pops.shift(); }
function feed(G, text, col) { G.feed.push({ text, col: col || '#fbf5ec', t: 0 }); if (G.feed.length > 4) G.feed.shift(); }
function points(G, c, n, label) { c.stats.points += n; if (c.isPlayer && !G.cfg.attract) pop(G, '+' + n + ' ' + label, '', TEAM[c.team].glow); }

/* ------------------------------------------------------------ one car, one step */
function alignTo(c, n, k) {
  T1.crossOf(c.u, n); const s = T1.len(), co = c.u.dot(n);
  let ang = Math.atan2(s, co); if (ang < 1e-4) return;
  if (s < 1e-5) T1.copy(c.f); else T1.scale(1 / s);
  ang *= k; c.u.rot(T1, ang); c.f.rot(T1, ang); ortho(c);
}
function ortho(c) {
  c.u.norm(); c.f.addS(c.u, -c.f.dot(c.u)).norm(); c.r.crossOf(c.f, c.u);
}
function jumpPress(G, c) {
  const k = c.ctl;
  if (c.ground) {
    c.v.addS(c.u, JUMPV); c.p.addS(c.u, 0.06); c.ground = false; c.holdT = 0.2; c.jumped = true; c.canSecond = true; c.secondT = 1.35; c.airT = 0;
    c.w.set(0, 0, 0); c.jumps++;
    emit('jump', { car: c });
    return;
  }
  if (c.turtle > 0.1) { c.rightT = 0.5; c.v.y += 5.5; c.turtle = 0; return; }
  const second = (c.canSecond && c.secondT > 0) || (!c.jumped && !c.fellJump && c.airT < 1.4);
  if (!second) return;
  c.canSecond = false; c.fellJump = true;
  const m = Math.hypot(k.flipX, k.flipY);
  if (m > 0.3) {
    const fx = k.flipX / m, fy = k.flipY / m;
    T1.set(c.f.x, 0, c.f.z); if (T1.lenSq() < 0.01) T1.set(c.v.x, 0, c.v.z); if (T1.lenSq() < 0.01) T1.set(0, 0, 1); T1.norm();
    T2.crossOf(T1, UP); // right, on the ground plane
    T3.set(0, 0, 0).addS(T1, fx).addS(T2, fy).norm();
    c.v.addS(T3, fx > 0.5 ? 9.5 : fx < -0.5 ? 8 : 8.6);
    if (c.v.y < 0) c.v.y *= 0.35;
    c.flipT = FLIPT; c.flipAx.set(0, 0, 0).addS(c.r, -fx).addS(c.f, fy).norm(); c.holdT = 0; c.flips++;
    emit('flip', { car: c });
  } else {
    c.v.addS(c.u, DJUMPV); c.holdT = 0; emit('jump', { car: c, double: true });
  }
}
function driveStep(G, c, dt) {
  const k = c.ctl;
  ortho(c);
  let vF = c.v.dot(c.f), vR = c.v.dot(c.r);
  const vn = c.v.dot(c.u), vmax = VDRIVE * c.vmul;
  let acc;
  if (k.thr > 0.05) acc = vF < -0.5 ? BRAKE * k.thr : (vF < vmax ? k.thr * (ACC * (1 - Math.max(0, vF) / vmax) + 2) : 0);
  else if (k.thr < -0.05) acc = vF > 0.5 ? BRAKE * k.thr : (vF > -VREV ? k.thr * ACCREV : 0);
  else acc = -Math.sign(vF) * Math.min(Math.abs(vF) / dt, COAST);
  if (c.boosting && vF < VBOOST * (c.isPlayer ? 1 : 0.5 + 0.5 * c.vmul)) acc += BOOSTA;
  vF += acc * dt;
  const sp = Math.abs(vF), rad = (3.2 + sp * 0.5) * (k.slide ? 0.6 : 1);
  const yaw = -clamp(k.steer, -1, 1) * vF / rad * dt;
  c.f.rot(c.u, yaw); c.r.crossOf(c.f, c.u);
  vR *= Math.exp(-dt * (k.slide ? 2.2 : 11));
  c.v.set(0, 0, 0).addS(c.f, vF).addS(c.r, vR).addS(c.u, vn);
  c.v.y -= GRAV * dt;
  c.spin += vF * dt / 0.42;
  c.steer += (k.steer - c.steer) * Math.min(1, dt * 12);
}
function airStep(G, c, dt) {
  const k = c.ctl;
  c.v.y -= GRAV * dt;
  if (c.holdT > 0) { if (k.jumpHeld) c.v.addS(c.u, JUMPHOLD * dt); c.holdT -= dt; }
  if (c.boosting) c.v.addS(c.f, BOOSTA * dt);
  if (c.flipT > 0) {
    c.flipT -= dt;
    const ang = TAU / FLIPT * dt;
    c.f.rot(c.flipAx, ang); c.u.rot(c.flipAx, ang); ortho(c);
    c.w.copy(c.flipAx).scale(c.flipT > 0 ? TAU / FLIPT : 0);
    if (c.v.y < -2) c.v.y += (GRAV * 0.6) * dt;
  } else if (c.rightT > 0) {
    c.rightT -= dt; alignTo(c, UP, 1 - Math.exp(-dt * 9)); c.w.set(0, 0, 0);
  } else {
    let wr = c.w.dot(c.r), wu = c.w.dot(c.u), wf = c.w.dot(c.f);
    const a = 1 - Math.exp(-dt * 8);
    wr += (-clamp(k.pitch, -1, 1) * PITCHR - wr) * a;
    wu += (-clamp(k.yaw, -1, 1) * YAWR - wu) * a;
    wf += (clamp(k.roll, -1, 1) * ROLLR - wf) * a;
    c.w.set(0, 0, 0).addS(c.r, wr).addS(c.u, wu).addS(c.f, wf);
    const wl = c.w.len();
    if (wl > 1e-5) { T1.copy(c.w).scale(1 / wl); c.f.rot(T1, wl * dt); c.u.rot(T1, wl * dt); ortho(c); }
  }
  c.spin += c.v.dot(c.f) * dt / 0.42 * 0.3;
  c.steer += (k.steer - c.steer) * Math.min(1, dt * 12);
}
function surfaceStep(G, c, dt) {
  const d = surf(c.p.x, c.p.y, c.p.z, SQ);
  N.set(SQ.nx, SQ.ny, SQ.nz);
  if (c.ground) {
    const vn = c.v.dot(N), tang2 = Math.max(0, c.v.lenSq() - vn * vn);
    const press = GRAV * N.y + STICK + tang2 * SQ.curv;
    const slowWall = N.y < 0.2 && tang2 < 9;
    if (press < 0 || slowWall || d > H0 + 0.7 || vn > 3) { c.ground = false; c.airT = 0; c.jumped = false; c.fellJump = false; return; }
    c.p.addS(N, H0 - d);
    if (vn < 0) c.v.addS(N, -vn);
    c.n.copy(N);
    alignTo(c, N, 1 - Math.exp(-dt * 18));
    return;
  }
  c.airT += dt;
  if (d < H0 + 0.05) {
    const vn = c.v.dot(N);
    if (vn < 1.5) {
      const up = c.u.dot(N);
      if (up > 0.25 && c.flipT <= 0.12) {
        c.ground = true; c.n.copy(N); c.p.addS(N, H0 - d);
        if (vn < 0) { c.v.addS(N, -vn); c.suspV += vn * 0.08; }
        c.jumped = false; c.canSecond = false; c.fellJump = false; c.flipT = 0; c.w.set(0, 0, 0); c.turtle = 0; c.rightT = 0;
        if (vn < -5) emit('land', { car: c, k: clamp(-vn / 14, 0, 1) });
      } else {
        c.p.addS(N, H0 - d);
        if (vn < 0) c.v.addS(N, -vn * 1.25);
        c.v.scale(Math.exp(-dt * 3));
        if (up < -0.2 && N.y > 0.6) { c.turtle += dt; if (c.turtle > (c.isPlayer ? 1.6 : 1.1)) { c.rightT = 0.5; c.v.y += 5.5; c.turtle = 0; } }
        else if (N.y > 0.6) { c.rightT = 0.35; }
      }
    }
  }
}
function stepCar(G, c, dt) {
  if (c.demoT > 0) { c.demoT -= dt; if (c.demoT <= 0 && !G.frozen) respawn(G, c); return; }
  const k = c.ctl;
  c.hitCD -= dt;
  if (G.frozen) { c.v.set(0, 0, 0); c.boosting = false; return; }
  c.boosting = k.boost && c.boost > 0;
  if (c.boosting && !G.cfg.attract) c.boost = Math.max(0, c.boost - 33.3 * dt);
  else if (c.boosting) c.boost = Math.max(0, c.boost - 20 * dt);
  if (k.jumpPress) { jumpPress(G, c); k.jumpPress = false; }
  if (!k.jumpHeld) c.holdT = 0;
  if (c.secondT > 0) c.secondT -= dt;
  if (c.ground) driveStep(G, c, dt); else airStep(G, c, dt);
  const sp = c.v.len(); if (sp > VMAX) c.v.scale(VMAX / sp);
  c.p.addS(c.v, dt);
  surfaceStep(G, c, dt);
  // posts and crossbars
  const pen = collideSphere(c.p, 1.1, CN);
  if (pen > 0 && CN.post) { N.set(CN.nx, CN.ny, CN.nz); c.p.addS(N, pen); const vn = c.v.dot(N); if (vn < 0) c.v.addS(N, -vn * 1.4); }
  // keep a car that ended up outside the play space (a deep wedge) inside it
  const d2 = surf(c.p.x, c.p.y, c.p.z, SQ);
  if (d2 < 0.3) { c.p.addS(T1.set(SQ.nx, SQ.ny, SQ.nz), 0.3 - d2); }
  c.sonic = c.v.len() >= SONIC;
  // suspension: a damped spring the renderer can read
  c.suspV += (-c.susp * 140 - c.suspV * 12) * dt; c.susp += c.suspV * dt;
}

/* ------------------------------------------------------------ the ball */
const CN = { nx: 0, ny: 1, nz: 0, post: false };
function ballStep(G, B, dt, pred) {
  B.v.y -= GRAV * dt;
  const dr = Math.exp(-0.03 * dt); B.v.scale(dr);
  B.p.addS(B.v, dt);
  for (let it = 0; it < 3; it++) {
    const pen = collideSphere(B.p, BR, CN);
    if (pen <= 0) break;
    N.set(CN.nx, CN.ny, CN.nz);
    B.p.addS(N, pen);
    const vn = B.v.dot(N);
    if (vn < 0) {
      const e = vn < -2.5 ? 0.62 : 0;
      B.v.addS(N, -vn * (1 + e));
      if (pred) continue;
      // friction and spin where it touches
      T1.copy(B.v).addS(N, -B.v.dot(N));                  // tangential velocity
      T2.crossOf(N, T1).scale(1 / BR);                     // the spin that would roll
      B.w.addS(T2.sub(B.w), clamp(-vn * 0.06 + 0.04, 0, 0.6));
      B.v.addS(T1, -clamp(-vn * 0.01, 0, 0.08));
      if (vn < -6) emit(CN.post ? 'post' : 'bounce', { x: B.p.x - N.x * BR, y: B.p.y - N.y * BR, z: B.p.z - N.z * BR, nx: N.x, ny: N.y, nz: N.z, k: clamp(-vn / 30, 0, 1) });
    }
  }
  if (pred) return;
  // rolling resistance on the floor
  if (B.p.y < BR + 0.05 && Math.abs(B.v.y) < 0.5) {
    T1.set(B.v.x, 0, B.v.z); const s = T1.len();
    if (s > 0) { const ns = Math.max(0, s - 0.6 * dt); B.v.x *= ns / s; B.v.z *= ns / s; }
    T2.crossOf(UP, B.v).scale(1 / BR); B.w.addS(T2.sub(B.w), Math.min(1, dt * 6));
  }
  B.w.scale(Math.exp(-0.25 * dt));
  const sp = B.v.len(); if (sp > 55) B.v.scale(55 / sp);
  // integrate the orientation
  const wl = B.w.len();
  if (wl > 1e-5) {
    const h = wl * dt * 0.5, s = Math.sin(h) / wl, qx = B.w.x * s, qy = B.w.y * s, qz = B.w.z * s, qw = Math.cos(h);
    const q = B.q, ax = q[0], ay = q[1], az = q[2], aw = q[3];
    q[0] = qw * ax + qx * aw + qy * az - qz * ay;
    q[1] = qw * ay - qx * az + qy * aw + qz * ax;
    q[2] = qw * az + qx * ay - qy * ax + qz * aw;
    q[3] = qw * aw - qx * ax - qy * ay - qz * az;
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  }
}
// Where the ball is going, three seconds ahead, ignoring the cars.
const PB = { p: new V(), v: new V(), w: new V(), q: [0, 0, 0, 1] };
export function computePred(G) {
  const B = G.ball, P = G.pred;
  PB.p.copy(B.p); PB.v.copy(B.v);
  P.goalSide = 0; P.goalT = 9;
  P.pts[0].x = B.p.x; P.pts[0].y = B.p.y; P.pts[0].z = B.p.z;
  let n = 1;
  for (let i = 1; i <= 90; i++) {
    ballStep(G, PB, 1 / 30, true);
    if (!P.goalSide && Math.abs(PB.p.z) > HL + BR * 0.5 && Math.abs(PB.p.x) < GW && PB.p.y < GH) { P.goalSide = PB.p.z > 0 ? 1 : -1; P.goalT = i / 30; }
    if (i % 3 === 0) { const q = P.pts[n++]; q.x = PB.p.x; q.y = PB.p.y; q.z = PB.p.z; }
  }
  P.n = n;
}

/* ------------------------------------------------------------ contacts */
function carBall(G, c) {
  const B = G.ball;
  if (!B.vis || c.demoT > 0) return;
  T1.copy(c.p).addS(c.u, 0.1);                         // box centre
  T2.copy(B.p).sub(T1);
  if (T2.lenSq() > 30) return;
  const lr = clamp(T2.dot(c.r), -1.08, 1.08), lu = clamp(T2.dot(c.u), -0.6, 0.6), lf = clamp(T2.dot(c.f), -2.05, 2.05);
  T3.copy(T1).addS(c.r, lr).addS(c.u, lu).addS(c.f, lf);  // closest point on the car
  N.copy(B.p).sub(T3);
  let dist = N.len();
  if (dist >= BR) return;
  if (dist < 1e-4) { N.copy(T2).norm(); dist = 0; } else N.scale(1 / dist);
  const pen = BR - dist;
  B.p.addS(N, pen * 0.85); c.p.addS(N, -pen * 0.15);
  // contact velocity of the car, including the whip of a flip
  const vcx = c.v.x + (c.flipT > 0 ? c.f.x * 6 : 0), vcy = c.v.y + (c.flipT > 0 ? c.f.y * 6 : 0), vcz = c.v.z + (c.flipT > 0 ? c.f.z * 6 : 0);
  const rx = B.v.x - vcx, ry = B.v.y - vcy, rz = B.v.z - vcz;
  const vn = rx * N.x + ry * N.y + rz * N.z;
  const rel = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (vn < 0) {
    const J = -(1.4) * vn / (1 + 1 / 3);
    B.v.addS(N, J); c.v.addS(N, -J / 3);
  }
  if (c.hitCD <= 0 && vn < 0.5) {
    c.hitCD = 0.12;
    // the car-football push: aimed from the car's centre, flattened, scaled by the closing speed
    T2.copy(B.p).sub(T1); T2.y *= 0.35; T2.norm();
    const s = lerp(0.65, 0.55, clamp(rel / 45, 0, 1)) * 0.52;
    B.v.addS(T2, rel * s);
    // spin from a glancing hit
    T3.set(rx, ry, rz).addS(N, -vn); T1.crossOf(N, T3).scale(-0.25 / BR); B.w.add(T1);
    const sp = B.v.len(); if (sp > 55) B.v.scale(55 / sp);
    touch(G, c, rel);
  }
}
function touch(G, c, rel) {
  const B = G.ball, s = c.team === 0 ? 1 : -1;
  B.hitT = 0;
  c.stats.touches++;
  G.touches.push({ id: c.id, team: c.team, t: G.time }); if (G.touches.length > 10) G.touches.shift();
  const before = G.pred.goalSide, beforeT = G.pred.goalT;
  computePred(G);
  if (G.cfg.attract || G.phase !== 'live') { emit('hit', { car: c, k: clamp(rel / 40, 0, 1), x: B.p.x, y: B.p.y, z: B.p.z }); return; }
  const P = G.pred;
  if (P.goalSide === s && P.goalT < 3 && G.time - c.lastShotT > 1.2) { c.lastShotT = G.time; c.stats.shots++; points(G, c, 20, 'Shot on goal'); }
  if (before === -s && beforeT < 2.2 && P.goalSide !== -s) {
    c.stats.saves++; points(G, c, 50, 'Save');
    feed(G, c.name + ' saves', TEAM[c.team].glow);
    if (c.isPlayer) haptic(0.6, 0.4, 120);
  }
  if (!c.ground && B.p.y > 6 && c.isPlayer) points(G, c, 10, 'Aerial hit');
  emit('hit', { car: c, k: clamp(rel / 40, 0, 1), x: B.p.x, y: B.p.y, z: B.p.z });
  if (c.isPlayer) haptic(clamp(rel / 40, 0.2, 1), clamp(rel / 50, 0.15, 0.8), Math.round(18 + rel * 1.2));
  else if (Math.abs(B.p.x - G.player.p.x) + Math.abs(B.p.z - G.player.p.z) < 14) haptic(0.15, 0.1, 25);
}
function carCar(G, A, Bc) {
  if (A.demoT > 0 || Bc.demoT > 0) return;
  N.copy(Bc.p).sub(A.p); const d = N.len();
  if (d >= 3.4 || d < 1e-4) return;
  N.scale(1 / d);
  const pen = 3.4 - d; A.p.addS(N, -pen * 0.5); Bc.p.addS(N, pen * 0.5);
  const va = A.v.dot(N), vb = Bc.v.dot(N), vrel = va - vb;
  if (vrel <= 0.5) return;
  const aHit = va > -vb;
  const att = aHit ? A : Bc, vic = aHit ? Bc : A, dir = aHit ? 1 : -1;
  T1.copy(N).scale(dir);
  if (att.team !== vic.team && att.v.len() >= SONIC * 0.98 && att.f.dot(T1) > 0.65 && vrel > 12 && !G.frozen && (G.cfg.attract || G.kickT > 3)) { knockout(G, att, vic); return; }
  vic.v.addS(T1, vrel * 0.7 + 3); vic.v.y += Math.min(6, vrel * 0.15); if (vrel > 7) vic.ground = false;
  att.v.addS(T1, -vrel * 0.3);
  emit('bump', { a: att, b: vic, k: clamp(vrel / 25, 0, 1), x: (A.p.x + Bc.p.x) / 2, y: (A.p.y + Bc.p.y) / 2, z: (A.p.z + Bc.p.z) / 2 });
  if (att.isPlayer || vic.isPlayer) haptic(clamp(vrel / 25, 0.2, 0.8), 0.3, 40 + vrel * 2);
}
function knockout(G, att, vic) {
  vic.demoT = 3;
  emit('demo', { car: vic, by: att, x: vic.p.x, y: vic.p.y, z: vic.p.z, vx: att.v.x, vy: att.v.y, vz: att.v.z });
  att.stats.demos++;
  if (!G.cfg.attract) { points(G, att, 25, 'Knockout'); feed(G, att.name + ' bumped out ' + vic.name, TEAM[att.team].glow); }
  if (vic.isPlayer) { haptic(1, 1, 220); if (ARC) ARC.shake = Math.max(ARC.shake || 0, 10); }
  if (att.isPlayer) haptic(0.7, 0.5, 90);
  vic.v.set(0, 0, 0);
}
function pads(G, dt) {
  for (let i = 0; i < G.pads.length; i++) {
    const p = G.pads[i];
    if (p.t > 0) { p.t -= dt; continue; }
    for (let j = 0; j < G.cars.length; j++) {
      const c = G.cars[j];
      if (c.demoT > 0 || c.p.y > 3 || c.boost >= 100) continue;
      const dx = c.p.x - p.x, dz = c.p.z - p.z, r = p.big ? 2.7 : 2.1;
      if (dx * dx + dz * dz < r * r) {
        c.boost = Math.min(100, c.boost + (p.big ? 100 : 12)); p.t = p.big ? 10 : 4;
        emit('pad', { pad: p, car: c });
        if (c.isPlayer && !G.cfg.attract) haptic(p.big ? 0.4 : 0.1, p.big ? 0.3 : 0.15, p.big ? 50 : 15);
        break;
      }
    }
  }
}

/* ------------------------------------------------------------ the AI */
function roles(G) {
  const B = G.ball;
  [0, 1].forEach((team) => {
    const s = team === 0 ? 1 : -1;
    const list = G.cars.filter((c) => c.team === team && c.demoT <= 0);
    list.forEach((c) => {
      const dx = B.p.x - c.p.x, dz = B.p.z - c.p.z, dist = Math.hypot(dx, dz);
      const behind = (B.p.z - c.p.z) * s > -4 ? 0 : 1.4;
      const facing = (dx * c.f.x + dz * c.f.z) / (dist || 1);
      c._eta = dist / Math.max(10, c.v.len() + 6) + behind + (1 - facing) * 0.35 + (c.isPlayer ? -0.25 : 0);
    });
    list.sort((a, b) => a._eta - b._eta);
    list.forEach((c, i) => { G.role[c.id] = i; });
    G.cars.forEach((c) => { if (c.team === team && c.demoT > 0) G.role[c.id] = 2; });
  });
}
function aiPlan(c, type, fx, fy) { const A = c.ai; if (A.plan) return; A.plan = type; A.pt = 0; A.p1 = false; A.p2 = false; A.flipX = fx || 1; A.flipY = fy || 0; }
function aiDecide(G, c, D) {
  const A = c.ai, B = G.ball, s = c.team === 0 ? 1 : -1, P = G.pred;
  const role = G.role[c.id] == null ? 0 : G.role[c.id];
  const danger = P.goalSide === -s && P.goalT < 2.6;
  A.boostOK = Math.random() < D.boost;
  A.hes = Math.random() < D.hes ? 0.35 + Math.random() * 0.4 : 0;
  A.aerial = false;
  if (G.kickT < 2.4 && !G.kickActiveDone && role === 0) {
    A.mode = 'kickoff'; A.tx = 0; A.ty = BR; A.tz = 0; A.bx = 0; A.by = BR; A.bz = 0; return;
  }
  if (role === 0 || (danger && role === 2) || G.per === 1) { intercept(G, c, D, danger || (B.p.z * s < -HL * 0.55)); return; }
  if (role === 1) {
    // support: hang back behind the play, on the far side from the attacker, and top up boost
    if (c.boost < 30) {
      let best = null, bd = 1e9;
      G.pads.forEach((p) => { if (p.t > 0) return; if (p.z * s > 10) return; const d = Math.hypot(p.x - c.p.x, p.z - c.p.z) - (p.big ? 12 : 0); if (d < bd) { bd = d; best = p; } });
      if (best && bd < 45) { A.mode = 'boost'; A.tx = best.x; A.ty = 0; A.tz = best.z; return; }
    }
    const att = G.cars.find((o) => o.team === c.team && G.role[o.id] === 0);
    const side = att && att.p.x > B.p.x ? -1 : 1;
    A.mode = 'support'; A.tx = clamp(B.p.x * 0.5 + side * 13, -HW + 6, HW - 6); A.ty = 0; A.tz = clamp(B.p.z - s * 26, -HL + 8, HL - 8);
    return;
  }
  // defend: sit in front of our own goal, shading toward the ball
  const gz = -s * HL;
  A.mode = 'post'; A.tx = clamp(B.p.x * 0.35, -GW * 0.6, GW * 0.6); A.ty = 0; A.tz = gz + s * 4;
  if (c.boost < 25 && Math.abs(B.p.z - gz) > 70) {
    const pd = G.pads.filter((p) => p.big && p.t <= 0 && p.z * s < 0).sort((a, b) => Math.hypot(a.x - c.p.x, a.z - c.p.z) - Math.hypot(b.x - c.p.x, b.z - c.p.z))[0];
    if (pd) { A.mode = 'boost'; A.tx = pd.x; A.tz = pd.z; }
  }
}
function intercept(G, c, D, clear) {
  const A = c.ai, P = G.pred, s = c.team === 0 ? 1 : -1;
  const canAerial = D.aerial > 0 && Math.random() < D.aerial && c.boost > 30 && c.ground;
  const reachY = c.ground ? (D.jump > 0.6 ? 6.4 : 3.8) : 30;
  const spd = Math.max(c.v.len(), 8), top = VDRIVE * c.vmul + (c.boost > 15 && A.boostOK ? 8 : 0);
  let best = null;
  for (let i = 1; i < P.n; i++) {
    const q = P.pts[i];
    const okY = q.y < reachY || (canAerial && q.y < 17);
    if (!okY) continue;
    const dist = Math.max(0, Math.hypot(q.x - c.p.x, q.z - c.p.z) - 3);
    const tt = dist / ((spd + top) * 0.5) + D.react * 0.5 + (q.y > reachY ? 0.6 : 0);
    if (tt <= q.t) { best = q; break; }
  }
  if (!best) best = P.pts[Math.min(P.n - 1, 12)];
  let gx = clamp(best.x * 0.3, -GW * 0.55, GW * 0.55), gz = s * (HL + 4);
  if (clear) { gx = best.x < 0 ? -HW : HW; gz = best.z + s * 40; }
  let dx = gx - best.x, dz = gz - best.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const err = (Math.random() - 0.5) * D.aim; const ce = Math.cos(err), se = Math.sin(err);
  const ddx = dx * ce - dz * se, ddz = dx * se + dz * ce; dx = ddx; dz = ddz;
  A.bx = best.x; A.by = best.y; A.bz = best.z; A.dx = dx; A.dz = dz;
  const behind = (best.x - c.p.x) * dx + (best.z - c.p.z) * dz > -1;
  if (!behind) {
    // swing round behind the ball, on the side the car is already on
    const px = -dz, pz = dx, side = ((c.p.x - best.x) * px + (c.p.z - best.z) * pz) > 0 ? 1 : -1;
    A.mode = 'swing';
    A.tx = clamp(best.x - dx * 12 + px * side * 7, -HW + 3, HW - 3); A.ty = 0; A.tz = clamp(best.z - dz * 12 + pz * side * 7, -HL + 3, HL - 3);
  } else {
    A.mode = 'hit';
    A.tx = best.x - dx * (BR + 2.2); A.ty = best.y; A.tz = best.z - dz * (BR + 2.2);
  }
  A.aerial = canAerial && best.y > 7.5;
}
// Steer a car's air controls so its nose points along t (and/or its roof along up).
function orientCtl(c, t, up, k, gain) {
  if (t) {
    T2.crossOf(c.f, t);
    if (c.f.dot(t) < 0) T2.norm();
    k.pitch = clamp(-T2.dot(c.r) * gain, -1, 1); k.yaw = clamp(-T2.dot(c.u) * gain, -1, 1);
  }
  if (up) {
    T2.crossOf(c.u, up);
    if (c.u.dot(up) < 0) T2.norm();
    k.roll = clamp(T2.dot(c.f) * gain, -1, 1);
    if (!t) k.pitch = clamp(-T2.dot(c.r) * gain, -1, 1);
  }
}
// A bot is a person at the wheel: it has a better or worse day (form, fixed for the match) and a mood
// that swings with goals. Confident after scoring it reacts a touch quicker; rattled after conceding it
// hurries, hesitates and misjudges a little more. Small enough that every difficulty stays fair.
function botDiff(c) {
  const A = c.ai, base = DIFF[c.level] || DIFF.normal;
  if (!A.D) A.D = Object.assign({}, base);
  const E = A.D, f = A.form || 1, m = A.mood || 0, up = Math.max(0, m), down = Math.max(0, -m);
  E.react = base.react * f * (1 - 0.1 * up - 0.05 * down);
  E.aim = base.aim * (0.7 + 0.3 * f) * (1 - 0.15 * up + 0.3 * down);
  E.hes = Math.min(0.5, base.hes * f + 0.05 * down);
  E.save = Math.min(1, base.save * (1.06 - 0.06 * f) * (1 - 0.08 * down));
  return E;
}
function aiStep(G, c, dt) {
  const A = c.ai, k = c.ctl, B = G.ball;
  if (A.mood) { A.mood *= Math.exp(-dt / 9); if (Math.abs(A.mood) < 0.01) A.mood = 0; }
  const D = botDiff(c);
  k.thr = 0; k.steer = 0; k.pitch = 0; k.yaw = 0; k.roll = 0; k.boost = false; k.slide = false; k.jumpHeld = false; k.flipX = 0; k.flipY = 0;
  if (c.demoT > 0 || G.frozen) return;
  A.think -= dt;
  if (A.think <= 0) { A.think = D.react * (0.6 + Math.random() * 0.8); aiDecide(G, c, D); }
  if (A.hes > 0) { A.hes -= dt; k.thr = 0.2; }
  // the scorers let off a little celebratory hop once the ball is in
  if (G.phase === 'goal' && A.cheer > 0) { A.cheer -= dt; if (A.cheer <= 0 && c.ground && !A.plan && A.mood > 0.4) aiPlan(c, 'single'); }
  // jump plans run on their own clock
  if (A.plan) {
    A.pt += dt;
    const t = A.pt;
    if (!A.p1) { k.jumpPress = true; A.p1 = true; }
    if (A.plan === 'single') { k.jumpHeld = t < 0.18; if (t > 0.5) A.plan = null; }
    else if (A.plan === 'double') { k.jumpHeld = t < 0.18; if (t > 0.24 && !A.p2) { k.jumpPress = true; A.p2 = true; } if (t > 0.8) A.plan = null; }
    else if (A.plan === 'flip') { k.jumpHeld = t < 0.05; if (t > 0.1 && !A.p2) { k.jumpPress = true; k.flipX = A.flipX; k.flipY = A.flipY; A.p2 = true; } if (t > 0.9) A.plan = null; }
    else if (A.plan === 'aerial') {
      k.jumpHeld = t < 0.2;
      if (t > 0.26 && !A.p2) { k.jumpPress = true; A.p2 = true; }
      if (t > 0.1) {
        T1.set(B.p.x - c.p.x, B.p.y - c.p.y, B.p.z - c.p.z); const dl = T1.len(); T1.scale(1 / (dl || 1));
        T1.y += 0.08;
        orientCtl(c, T1, null, k, 3);
        k.boost = c.f.dot(T1) > 0.6;
      }
      if (t > 2.2 || (c.ground && t > 0.5)) A.plan = null;
    }
    if (A.plan === 'flip' && A.p2) return;
  }
  const sp = c.v.len();
  // where to drive
  let tx = A.tx, tz = A.tz, ty = 0;
  if (A.mode === 'hit' || A.mode === 'kickoff') {
    const dxb = A.bx - c.p.x, dzb = A.bz - c.p.z;
    if (Math.hypot(dxb, dzb) < 7 || A.mode === 'kickoff') { tx = A.bx; tz = A.bz; }
  }
  if (A.mode === 'post' && Math.hypot(tx - c.p.x, tz - c.p.z) < 3.5) { tx = B.p.x; tz = B.p.z; }
  T1.set(tx - c.p.x, ty, tz - c.p.z);
  if (c.ground) {
    T1.y = H0 - c.p.y;
    T1.addS(c.u, -T1.dot(c.u));
    const fwd = T1.dot(c.f), rt = T1.dot(c.r), dist = T1.len(), ang = Math.atan2(rt, fwd);
    k.steer = clamp(ang * 2.6, -1, 1);
    k.thr = 1;
    if (Math.abs(ang) > 1.35 && sp > 7) k.slide = true;
    if (A.mode === 'post' || A.mode === 'support') {
      // arrive, do not overshoot: brake down to a speed that suits the distance left
      const dl = Math.hypot(A.tx - c.p.x, A.tz - c.p.z), want = clamp(dl * 1.1 + 1, 0, 18);
      if (dl < 3.5) k.thr = Math.abs(ang) > 0.5 ? 0.45 : 0;
      else if (sp > want + 3) { k.thr = -0.7; k.slide = false; } else if (sp > want) k.thr = 0;
    }
    if (A.hes > 0) k.thr = 0.2;
    const far = dist > 20 || A.mode === 'kickoff';
    if (A.boostOK && Math.abs(ang) < 0.28 && far && c.boost > D.keep && sp < 27 && A.mode !== 'support' && A.mode !== 'post') k.boost = true;
    if (A.mode === 'kickoff' && (Math.random() < D.boost || c.level !== 'easy') && Math.abs(ang) < 0.4) k.boost = true;
    // arriving early: ease off so the ball comes to the car
    if (A.mode === 'hit' && !A.plan) {
      const db = Math.hypot(A.bx - c.p.x, A.bz - c.p.z);
      const tArr = db / Math.max(sp, 6);
      // jump for a ball in the air
      if (A.aerial && A.by > 7.5 && db < A.by * 2.4 && c.boost > 25 && Math.abs(ang) < 0.3) aiPlan(c, 'aerial');
      else if (A.by > 3.6 && Math.random() < D.jump && db < 10) {
        const h = A.by, tRise = h > 4.6 ? 0.6 : 0.36;
        if (tArr < tRise + 0.05) aiPlan(c, h > 4.6 ? 'double' : 'single');
      } else if (A.by < 3.4 && db < 6.5 && db > 3 && Math.abs(ang) < 0.3 && sp > 9 && Math.random() < D.flip * 0.5) {
        aiPlan(c, 'flip', Math.cos(ang), Math.sin(ang));
      }
    }
    if (A.mode === 'kickoff' && !A.plan && Math.hypot(c.p.x, c.p.z) < 8.5 && D.flip > 0.3) aiPlan(c, 'flip', 1, 0);
    // stuck against something: back out
    if (sp < 1.2 && k.thr > 0.5 && !A.plan) { A.stuck += dt; if (A.stuck > 1) { A.rev = 0.8; A.stuck = 0; } } else A.stuck = 0;
    if (A.rev > 0) { A.rev -= dt; k.thr = -1; k.steer = -k.steer; k.boost = false; }
  } else if (!A.plan || A.plan === 'single' || A.plan === 'double') {
    // in the air: land on the wheels
    const d = surf(c.p.x, c.p.y, c.p.z, SQ);
    T2.set(SQ.nx, SQ.ny, SQ.nz); if (d > 6) T2.set(0, 1, 0);
    orientCtl(c, null, T2, k, 2.2);
    T1.y = 0; T1.addS(T2, -T1.dot(T2)); T1.norm(); T3.copy(T1);
    if (T3.lenSq() > 0.5) { T2.crossOf(c.f, T3); k.yaw = clamp(-T2.dot(c.u) * 1.5, -1, 1); }
  }
}

/* ------------------------------------------------------------ the player's controls */
const TOUCH = { dirX: 0, dirZ: 1, dirT: -9, boostT: 0, brakeT: 0, jump: false, holdJ: 0 };
const MOUSE = { click: false, right: false, left: false };
const TT = { id: null, x: 0, y: 0, t: 0 };
function playerCtl(G, c, a, dt) {
  const inp = a.input, k = c.ctl;
  k.thr = 0; k.steer = 0; k.pitch = 0; k.yaw = 0; k.roll = 0; k.boost = false; k.slide = false; k.flipX = 0; k.flipY = 0;
  if (c.bot) { aiStep(G, c, dt); return; }
  const touchy = a.touchMode && a.touchStyle !== 'pads';
  const gest = a.touchMode && a.touchStyle === 'gesture', tilt = a.touchMode && a.touchStyle === 'tilt';
  const ax = inp.axis(), st = inp.stick, pd = inp.pad;
  const keyThr = (inp.down('KeyW', 'ArrowUp', 'KeyI') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown', 'KeyK') ? 1 : 0);
  const keyPitch = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
  k.thr = clamp(keyThr + (st.active ? -st.y : 0), -1, 1);
  k.steer = gest ? 0 : ax.x;
  k.pitch = clamp(keyPitch - (st.active ? st.y : 0) - (pd.active ? pd.y : 0), -1, 1);
  k.yaw = gest ? 0 : ax.x;
  k.roll = (inp.down('KeyE') ? 1 : 0) - (inp.down('KeyQ') ? 1 : 0);
  k.slide = inp.down('KeyX');
  if (TOUCH.boostT > 0) TOUCH.boostT -= dt;
  if (TOUCH.brakeT > 0) TOUCH.brakeT -= dt;
  k.boost = inp.down('ShiftLeft', 'ShiftRight') || MOUSE.right || TOUCH.boostT > 0;
  k.jumpHeld = inp.down('Space') || MOUSE.left || TOUCH.holdJ > 0;
  if (TOUCH.holdJ > 0) TOUCH.holdJ -= dt;
  if (tilt) k.thr = 1;
  let airInput = Math.abs(k.pitch) + Math.abs(k.yaw) + Math.abs(k.roll) > 0.05;
  if (gest) {
    const gz = inp.gesture;
    if (gz.active && gz.type !== 'mouse') {
      const len = Math.hypot(gz.dx, gz.dy);
      if (len > 8) {
        const cb = VIEW.camBasis(), sx = gz.dx / len, sy = -gz.dy / len;
        let wx = cb.rx * sx + cb.fx * sy, wz = cb.rz * sx + cb.fz * sy; const wl = Math.hypot(wx, wz) || 1; wx /= wl; wz /= wl;
        TOUCH.dirX = wx; TOUCH.dirZ = wz; TOUCH.dirT = G.realT;
        k.thr = clamp(len / inp.dragRadius, 0.35, 1);
        if (c.ground) {
          T1.set(wx, 0, wz); T1.addS(c.u, -T1.dot(c.u));
          const ang = Math.atan2(T1.dot(c.r), T1.dot(c.f));
          k.steer = clamp(ang * 2.4, -1, 1);
          if (Math.abs(ang) > 1.5 && c.v.len() > 6) k.slide = true;
        } else {
          T1.set(cb.r3x * sx + cb.u3x * sy + cb.f3x * 1.1, cb.r3y * sx + cb.u3y * sy + cb.f3y * 1.1, cb.r3z * sx + cb.u3z * sy + cb.f3z * 1.1).norm();
          orientCtl(c, T1, null, k, 2.6); airInput = true;
        }
      }
    }
  }
  if (TOUCH.brakeT > 0) k.thr = -1;
  // a second jump: flip toward the stick, the keys, or (on touch) the last drag
  if (touchy) {
    if (G.realT - TOUCH.dirT < 1.6) {
      T1.set(c.f.x, 0, c.f.z).norm(); T2.crossOf(T1, UP);
      k.flipX = TOUCH.dirX * T1.x + TOUCH.dirZ * T1.z; k.flipY = TOUCH.dirX * T2.x + TOUCH.dirZ * T2.z;
    } else { k.flipX = 1; k.flipY = 0; }
  } else {
    k.flipX = keyPitch - (st.active ? st.y : 0) - (pd.active ? pd.y : 0);
    k.flipY = ax.x;
  }
  // help: land on the wheels, and on touch (or Easy) aim a boosting car at the ball
  if (!c.ground && !airInput && c.flipT <= 0) {
    const assist = touchy || G.cfg.diff === 'easy';
    if (assist && k.boost && c.airT > 0.15) {
      const B = G.ball; T1.set(B.p.x + B.v.x * 0.2 - c.p.x, B.p.y + B.v.y * 0.2 - c.p.y, B.p.z + B.v.z * 0.2 - c.p.z).norm();
      orientCtl(c, T1, null, k, 2.4);
    } else if (c.airT > 0.3 && c.v.y < 0) {
      const d = surf(c.p.x, c.p.y, c.p.z, SQ);
      if (d < 7) { T2.set(SQ.nx, SQ.ny, SQ.nz); orientCtl(c, null, T2, k, 1.2); }
    }
  }
}

/* ------------------------------------------------------------ sound */
function audioInit() {
  if (AU) return;
  AU = { ok: false };
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC(), master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 2; }
    const loop = (freq, q, type) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.6; const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); return { g, f }; };
    const crowd = loop(620, 0.55), roar = loop(1300, 0.7), boost = loop(2600, 0.9, 'bandpass'), wind = loop(400, 0.4, 'lowpass');
    const eng = ctx.createOscillator(), eng2 = ctx.createOscillator(), ef = ctx.createBiquadFilter(), eg = ctx.createGain();
    eng.type = 'sawtooth'; eng2.type = 'square'; ef.type = 'lowpass'; ef.frequency.value = 700; eg.gain.value = 0;
    eng.connect(ef); eng2.connect(ef); ef.connect(eg); eg.connect(master); eng.start(); eng2.start();
    Object.assign(AU, { ok: true, ctx, master, crowd, roar, boost, wind, eng, eng2, ef, eg, roarK: 0 });
  } catch (e) { AU.ok = false; }
}
function audioFrame(G, a, dt) {
  if (!AU || !AU.ok) return;
  try {
    const t = AU.ctx.currentTime, on = !a.sfx.muted && a.state === 'play' && G && !G.cfg.attract;
    if (AU.ctx.state === 'suspended' && on) AU.ctx.resume().catch(() => {});
    AU.master.gain.setTargetAtTime(on ? 0.75 : 0, t, 0.08);
    if (!on || !G) return;
    const P = G.player, sp = P.v.len(), live = G.phase === 'live' || G.phase === 'goal' || G.phase === 'countdown';
    const rp = G.phase === 'replay';
    AU.eng.frequency.setTargetAtTime(46 + sp * 4.2 + (P.boosting ? 18 : 0), t, 0.06);
    AU.eng2.frequency.setTargetAtTime(23 + sp * 2.1, t, 0.06);
    AU.ef.frequency.setTargetAtTime(450 + sp * 40 + (P.boosting ? 900 : 0), t, 0.08);
    AU.eg.gain.setTargetAtTime(live && P.demoT <= 0 ? 0.035 + Math.abs(P.ctl.thr) * 0.03 + (P.boosting ? 0.02 : 0) : 0, t, 0.1);
    AU.boost.g.gain.setTargetAtTime(live && P.boosting ? 0.06 : 0, t, 0.05);
    AU.wind.g.gain.setTargetAtTime(live ? clamp((sp - 12) / 40, 0, 0.12) : 0, t, 0.2);
    AU.roarK = Math.max(0, AU.roarK - dt * 0.25);
    const B = G.ball, near = clamp(1 - (HL - Math.abs(B.p.z)) / 30, 0, 1);
    AU.crowd.g.gain.setTargetAtTime(0.05 + near * 0.05 + G.crowd * 0.05 + (rp ? 0.03 : 0), t, 0.3);
    AU.roar.g.gain.setTargetAtTime(AU.roarK * 0.22 + near * near * 0.04, t, 0.15);
  } catch (e) { /* sound never stops play */ }
}
function sfx(f, d, o) { if (ARC) ARC.sfx.tone(f, d, o); }
function noise(d, o) { if (ARC) ARC.sfx.noise(d, o); }
export function haptic(strong, weak, ms) {
  if (!ARC) return;
  ARC.buzz(Math.round(clamp(ms, 8, 300)));
  if (!ARC.gamepad || (ARC.prefs && ARC.prefs.haptics === 'off')) return;
  try {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p && p.connected && p.vibrationActuator && p.vibrationActuator.playEffect) {
        const r = p.vibrationActuator.playEffect('dual-rumble', { duration: Math.round(ms), strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) });
        if (r && r.catch) r.catch(() => {});
        break;
      }
    }
  } catch (e) { /* no rumble here */ }
}

/* ------------------------------------------------------------ the match: phases, goals, the clock */
const REC_HZ = 30, REC_N = 30 * 9;
function recInit(G) {
  const stride = 7 + G.cars.length * 13;
  G.rec = { stride, data: new Float32Array(stride * REC_N), times: new Float64Array(REC_N), head: 0, count: 0 };
}
function record(G) {
  const R = G.rec, o = R.head * R.stride, d = R.data, B = G.ball;
  R.times[R.head] = G.time;
  d[o] = B.p.x; d[o + 1] = B.p.y; d[o + 2] = B.p.z; d[o + 3] = B.q[0]; d[o + 4] = B.q[1]; d[o + 5] = B.q[2]; d[o + 6] = B.q[3];
  for (let i = 0; i < G.cars.length; i++) {
    const c = G.cars[i], j = o + 7 + i * 13;
    d[j] = c.p.x; d[j + 1] = c.p.y; d[j + 2] = c.p.z; d[j + 3] = c.f.x; d[j + 4] = c.f.y; d[j + 5] = c.f.z; d[j + 6] = c.u.x; d[j + 7] = c.u.y; d[j + 8] = c.u.z;
    d[j + 9] = c.boosting ? 1 : 0; d[j + 10] = c.steer; d[j + 11] = c.spin; d[j + 12] = (c.demoT > 0 ? 0 : 1) + (c.sonic ? 2 : 0) + (c.ground ? 4 : 0);
  }
  R.head = (R.head + 1) % REC_N; R.count = Math.min(REC_N, R.count + 1);
}
// The pose renderers draw: from the live match, or from the replay buffer.
export function makePose(n) {
  const P = { ball: { x: 0, y: BR, z: 0, q: [0, 0, 0, 1], vis: true, vx: 0, vy: 0, vz: 0 }, cars: [] };
  for (let i = 0; i < n; i++) P.cars.push({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, boost: false, steer: 0, spin: 0, vis: true, sonic: false, ground: true, susp: 0, team: 0, vx: 0, vy: 0, vz: 0 });
  return P;
}
function poseLive(G) {
  const P = G.pose, B = G.ball;
  P.ball.x = B.p.x; P.ball.y = B.p.y; P.ball.z = B.p.z; P.ball.q[0] = B.q[0]; P.ball.q[1] = B.q[1]; P.ball.q[2] = B.q[2]; P.ball.q[3] = B.q[3]; P.ball.vis = B.vis;
  P.ball.vx = B.v.x; P.ball.vy = B.v.y; P.ball.vz = B.v.z;
  G.cars.forEach((c, i) => {
    const o = P.cars[i];
    o.x = c.p.x; o.y = c.p.y; o.z = c.p.z; o.fx = c.f.x; o.fy = c.f.y; o.fz = c.f.z; o.ux = c.u.x; o.uy = c.u.y; o.uz = c.u.z;
    o.boost = c.boosting; o.steer = c.steer; o.spin = c.spin; o.vis = c.demoT <= 0; o.sonic = c.sonic; o.ground = c.ground; o.susp = c.susp; o.team = c.team;
    o.vx = c.v.x; o.vy = c.v.y; o.vz = c.v.z;
  });
}
function poseReplay(G, t) {
  const R = G.rec, P = G.pose; if (!R.count) return;
  // find the two frames around t
  let i1 = -1;
  for (let k = 0; k < R.count; k++) { const idx = (R.head - 1 - k + REC_N) % REC_N; if (R.times[idx] <= t) { i1 = idx; break; } }
  if (i1 < 0) i1 = (R.head - R.count + REC_N) % REC_N;
  const i2 = (i1 + 1) % REC_N === R.head ? i1 : (i1 + 1) % REC_N;
  const t1 = R.times[i1], t2 = R.times[i2], f = t2 > t1 ? clamp((t - t1) / (t2 - t1), 0, 1) : 0;
  const d = R.data, a = i1 * R.stride, b = i2 * R.stride, L = (j) => d[a + j] + (d[b + j] - d[a + j]) * f;
  const pb = P.ball; pb.x = L(0); pb.y = L(1); pb.z = L(2);
  pb.vx = (d[b] - d[a]) * REC_HZ; pb.vy = (d[b + 1] - d[a + 1]) * REC_HZ; pb.vz = (d[b + 2] - d[a + 2]) * REC_HZ;
  let qx = L(3), qy = L(4), qz = L(5), qw = L(6); const ql = Math.hypot(qx, qy, qz, qw) || 1; pb.q[0] = qx / ql; pb.q[1] = qy / ql; pb.q[2] = qz / ql; pb.q[3] = qw / ql;
  pb.vis = !G.goalInfo || t <= G.goalInfo.t + 0.02;
  G.cars.forEach((c, i) => {
    const o = P.cars[i], j = 7 + i * 13;
    o.x = L(j); o.y = L(j + 1); o.z = L(j + 2);
    o.fx = L(j + 3); o.fy = L(j + 4); o.fz = L(j + 5); o.ux = L(j + 6); o.uy = L(j + 7); o.uz = L(j + 8);
    const fl = Math.hypot(o.fx, o.fy, o.fz) || 1; o.fx /= fl; o.fy /= fl; o.fz /= fl; const ul = Math.hypot(o.ux, o.uy, o.uz) || 1; o.ux /= ul; o.uy /= ul; o.uz /= ul;
    o.boost = d[a + j + 9] > 0.5; o.steer = L(j + 10); o.spin = L(j + 11);
    const fg = d[a + j + 12]; o.vis = (fg & 1) === 1; o.sonic = (fg & 2) === 2; o.ground = (fg & 4) === 4; o.susp = 0;
    o.vx = (d[b + j] - d[a + j]) * REC_HZ; o.vy = (d[b + j + 1] - d[a + j + 1]) * REC_HZ; o.vz = (d[b + j + 2] - d[a + j + 2]) * REC_HZ;
  });
}
function tick(G, h) {
  G.time += h; G.tick++;
  if ((G.tick & 3) === 0) computePred(G);
  if (G.tick % 12 === 0) roles(G);
  if (G.phase === 'live') { G.kickT += h; if (G.kickT > 2.4) G.kickActiveDone = true; }
  for (let i = 0; i < G.cars.length; i++) {
    const c = G.cars[i];
    if (!c.isPlayer || c.bot) aiStep(G, c, h);
    stepCar(G, c, h);
  }
  const B = G.ball;
  if (B.vis && G.phase !== 'goal') {
    ballStep(G, B, h, false); B.hitT += h;
    for (let i = 0; i < G.cars.length; i++) carBall(G, G.cars[i]);
  } else if (G.phase === 'goal') { B.v.scale(0.9); }
  for (let i = 0; i < G.cars.length; i++) for (let j = i + 1; j < G.cars.length; j++) carCar(G, G.cars[i], G.cars[j]);
  pads(G, h);
  if ((G.tick & 3) === 0 && !G.cfg.attract) record(G);
  // a goal: the whole ball over the line, between the posts, under the bar
  if (G.phase === 'live' && B.vis && Math.abs(B.p.z) > HL + BR && Math.abs(B.p.x) < GW + 0.5 && B.p.y < GH + 0.5) scored(G, B.p.z > 0 ? 0 : 1);
}
function scored(G, team) {
  const B = G.ball;
  G.score[team]++;
  let scorer = null, assist = null;
  for (let i = G.touches.length - 1; i >= 0; i--) { const t = G.touches[i]; if (t.team === team) { scorer = G.cars[t.id]; for (let j = i - 1; j >= 0; j--) { const u = G.touches[j]; if (u.team === team && u.id !== t.id && t.t - u.t < 6) { assist = G.cars[u.id]; break; } } break; } }
  const kmh = Math.round(B.v.len() * 3.6);
  G.goalInfo = { team, scorer, assist, kmh, t: G.time, x: B.p.x, y: B.p.y, z: B.p.z, side: B.p.z > 0 ? 1 : -1, own: !scorer };
  if (scorer) { scorer.stats.goals++; points(G, scorer, 100, 'Goal'); }
  if (assist) { assist.stats.assists++; points(G, assist, 50, 'Assist'); }
  feed(G, (scorer ? scorer.name : 'Own goal') + (assist ? ', assist ' + assist.name : '') + ', ' + kmh + ' km/h', TEAM[team].glow);
  G.phase = 'goal'; G.pt = 0; G.ts = 0.25; G.crowd = 1;
  G.cars.forEach((c) => { if (c.isPlayer && !c.bot) return; c.ai.mood = c.team === team ? 0.9 : -0.8; c.ai.cheer = c.team === team ? 0.6 + Math.random() * 0.9 : 0; });
  emit('goal', G.goalInfo);
  if (AU) AU.roarK = 1;
  if (!G.cfg.attract) {
    const mine = team === G.player.team;
    haptic(mine ? 1 : 0.5, mine ? 0.8 : 0.3, mine ? 400 : 160);
    if (ARC) ARC.shake = Math.max(ARC.shake || 0, mine ? 14 : 8);
    const base = mine ? 196 : 147;
    [0, 0.18, 0.36].forEach((dl, i) => sfx(base * [1, 1.26, 1.5][i], 0.5, { type: 'sawtooth', vol: 0.1, delay: dl }));
    noise(0.9, { freq: 900, vol: 0.18 });
  }
  B.vis = false;
  if (G.ot) G.decided = true;
}
function toCountdown(G) {
  kickoffReset(G); G.phase = 'countdown'; G.pt = 0; G.frozen = true; G.cd = 3; G.lastBeep = 4; G.ts = 1;
  G.kickoffs++;
}
function goLive(G) { G.phase = 'live'; G.pt = 0; G.frozen = false; G.kickT = 0; G.kickActive = true; G.kickActiveDone = false; if (G.firstLive < 0) G.firstLive = G.realT; G.cars.forEach((c) => { c.ai.think = 0; }); computePred(G); roles(G); }
function startReplay(G) {
  const gi = G.goalInfo;
  if (!gi || G.cfg.attract || !G.rec.count) { afterGoal(G); return; }
  const oldest = G.rec.times[(G.rec.head - G.rec.count + REC_N) % REC_N];
  const t0 = Math.max(oldest, gi.t - 3.4), t1 = Math.min(G.time - 0.05, gi.t + 0.9);
  G.rp = { t: t0, t0, t1, tg: gi.t, shot: 0 };
  G.phase = 'replay'; G.pt = 0;
}
function afterGoal(G) {
  G.rp = null;
  if (G.decided || (G.clock <= 0 && !G.ot && G.score[0] !== G.score[1])) { endMatch(G); return; }
  if (G.clock <= 0 && !G.ot) { G.ot = true; pop(G, 'Overtime', 'Next goal wins', '#ffb736', true); }
  toCountdown(G);
}
function endMatch(G) {
  G.phase = 'over'; G.pt = 0; G.frozen = true;
  const P = G.player, wt = G.score[0] === G.score[1] ? P.team : (G.score[0] > G.score[1] ? 0 : 1);
  G.winner = wt;
  // the winners line up at centre field for the podium
  const W = G.cars.filter((c) => c.team === wt);
  W.forEach((c, i) => {
    const x = (i - (W.length - 1) / 2) * 6.5;
    c.p.set(x, H0, 0); c.v.set(0, 0, 0); c.f.set(0, 0, -1); c.u.set(0, 1, 0); c.r.crossOf(c.f, c.u); c.ground = true; c.demoT = 0; c.flipT = 0; c.boosting = false;
  });
  G.cars.filter((c) => c.team !== wt).forEach((c, i) => {
    c.p.set((i - 1) * 7, H0, wt === 0 ? -34 : 34); c.v.set(0, 0, 0); c.f.set(0, 0, wt === 0 ? 1 : -1); c.u.set(0, 1, 0); c.r.crossOf(c.f, c.u); c.ground = true; c.demoT = 0; c.boosting = false;
  });
  G.ball.vis = false;
  emit('end', { team: wt });
  if (AU) AU.roarK = 1;
  if (!G.cfg.attract && ARC) { const win = G.score[P.team] > G.score[1 - P.team]; [0, 0.15, 0.3, 0.5].forEach((dl, i) => sfx((win ? [262, 330, 392, 523] : [262, 247, 220, 196])[i], 0.35, { type: 'triangle', vol: 0.12, delay: dl })); haptic(win ? 0.8 : 0.4, 0.5, 300); }
}
function finish(G, a) {
  if (G.finished) return;
  G.finished = true;
  const P = G.player, my = G.score[P.team], their = G.score[1 - P.team], win = my > their;
  const pts = P.stats.points + (win ? 100 : 0);
  const rows = G.cars.slice().sort((x, y) => x.team - y.team || y.stats.points - x.stats.points).map((c) =>
    '<tr class="' + (c.isPlayer ? 'me' : '') + '"><td><i style="background:' + TEAM[c.team].col + '"></i>' + a.esc(c.name) + '</td><td>' + c.stats.goals + '</td><td>' + c.stats.assists + '</td><td>' + c.stats.saves + '</td><td>' + c.stats.shots + '</td><td>' + c.stats.points + '</td></tr>').join('');
  const html = '<p class="ng-final"><b style="color:' + TEAM[0].col + '">' + TEAM[0].name + ' ' + G.score[0] + '</b> <span>-</span> <b style="color:' + TEAM[1].col + '">' + G.score[1] + ' ' + TEAM[1].name + '</b>' + (G.ot ? ' <small>after overtime</small>' : '') + '</p>' +
    '<table class="ng-res"><tr><th>Player</th><th>G</th><th>A</th><th>Sv</th><th>Sh</th><th>Pts</th></tr>' + rows + '</table>' +
    (win ? '<p class="ng-note">Win bonus +100 points.</p>' : '');
  a.over({ eyebrow: win ? 'Full time' : 'Full time', title: win ? 'You <em>win</em>' : my === their ? 'All <em>square</em>' : 'Close, <em>not quite</em>', html, score: pts, scoreLabel: 'Your points', again: 'Play again' });
}
export function stepMatch(G, dt, a, skip) {
  G.realT += dt;
  for (let i = G.pops.length - 1; i >= 0; i--) { G.pops[i].t += dt; if (G.pops[i].t > 2.2) G.pops.splice(i, 1); }
  for (let i = G.feed.length - 1; i >= 0; i--) { G.feed[i].t += dt; if (G.feed[i].t > 6) G.feed.splice(i, 1); }
  G.crowd = Math.max(0.15, G.crowd - dt * 0.12);
  const lbWant = G.phase === 'intro' || G.phase === 'replay' || G.phase === 'over' ? 1 : 0;
  G.lb += (lbWant - G.lb) * Math.min(1, dt * 3.5);
  const ph = G.phase;
  if (ph === 'intro') {
    G.pt += dt; G.fade = Math.max(0, G.fade - dt * 1.4);
    if (G.pt > 4.2 || (skip && G.pt > 0.12)) { G.fadeOut = 0.35; G.phase = 'introOut'; }
  } else if (ph === 'introOut') {
    G.fade = Math.min(1, G.fade + dt / 0.3);
    if (G.fade >= 1) { toCountdown(G); }
  } else if (ph === 'countdown') {
    G.pt += dt; G.fade = Math.max(0, G.fade - dt * 2.2);
    G.cd = 3 - G.pt;
    const n = Math.ceil(G.cd);
    if (n < G.lastBeep && n > 0) { G.lastBeep = n; sfx(440, 0.14, { type: 'triangle', vol: 0.13 }); haptic(0.15, 0.1, 25); }
    if (G.pt >= 3) { goLive(G); sfx(880, 0.3, { type: 'triangle', vol: 0.15 }); sfx(1320, 0.3, { type: 'sine', vol: 0.08 }); haptic(0.4, 0.3, 60); }
    sim(G, dt);
  } else if (ph === 'live') {
    sim(G, dt);
    if (G.phase === 'live' && !G.cfg.attract) {
      if (G.ot) G.otT += dt;
      else if (G.clock > 0) {
        const before = G.clock; G.clock = Math.max(0, G.clock - dt);
        if (before > 30 && G.clock <= 30) pop(G, '30 seconds left', '', '#ffb736');
        if (Math.ceil(before) !== Math.ceil(G.clock) && G.clock <= 10 && G.clock > 0) sfx(660, 0.06, { type: 'square', vol: 0.05 });
      } else {
        // time is up: the match ends when the ball next touches the ground
        G.zeroT += dt;
        if (G.ball.p.y < BR + 0.3 || G.zeroT > 4) {
          if (G.score[0] !== G.score[1]) { G.phase = 'cut'; G.after = 'end'; G.pt = 0; }
          else { G.ot = true; G.otT = 0; pop(G, 'Overtime', 'Next goal wins', '#ffb736', true); sfx(330, 0.5, { type: 'sawtooth', vol: 0.1 }); G.phase = 'cut'; G.after = 'kick'; G.pt = 0; }
        }
      }
    }
  } else if (ph === 'goal') {
    G.pt += dt;
    G.ts = G.pt < 0.9 && !a.reducedMotion ? 0.28 : Math.min(1, (G.ts || 0.3) + dt * 1.5);
    sim(G, dt * G.ts);
    if (G.pt > 2.8 || (skip && G.pt > 1.2)) {
      if (G.cfg.attract) { toCountdown(G); G.phase = 'live'; G.frozen = false; goLive(G); }
      else startReplay(G);
    }
  } else if (ph === 'replay') {
    G.pt += dt;
    const R = G.rp, near = Math.abs(R.t - R.tg);
    const sp = a.reducedMotion ? 0.8 : (near < 0.9 ? 0.32 : R.t < R.tg ? 0.8 : 0.6);
    R.t += dt * sp;
    if (R.t >= R.t1 || (skip && G.pt > 0.3)) { G.phase = 'replayOut'; G.pt = 0; }
  } else if (ph === 'replayOut') {
    G.pt += dt; G.fade = Math.min(1, G.fade + dt / 0.3);
    if (G.fade >= 1) afterGoal(G);
  } else if (ph === 'cut') {
    G.pt += dt; G.fade = Math.min(1, G.fade + dt / 0.35);
    sim(G, dt * 0.5);
    if (G.fade >= 1) { if (G.after === 'end') endMatch(G); else toCountdown(G); }
  } else if (ph === 'over') {
    G.pt += dt; G.fade = Math.max(0, G.fade - dt * 2);
    if (G.pt > 5 && !G.finished && !G.cfg.attract) finish(G, a);
  }
  if (G.phase === 'replay' || G.phase === 'replayOut') poseReplay(G, G.rp.t); else poseLive(G);
}
function sim(G, dt) {
  G.acc += dt;
  let n = 0;
  while (G.acc >= STEP && n < 10) { G.acc -= STEP; n++; tick(G, STEP); }
  if (n >= 10) G.acc = 0;
}

/* ------------------------------------------------------------ HUD */
export const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
export const INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736';
function txt(ctx, s, x, y, size, color, align, weight, fam) {
  ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function plate(ctx, x, y, w, h, r, a) { rr(ctx, x, y, w, h, r || 10); ctx.fillStyle = 'rgba(10,9,12,' + (a == null ? 0.6 : a) + ')'; ctx.fill(); ctx.strokeStyle = 'rgba(251,245,236,0.10)'; ctx.lineWidth = 1; ctx.stroke(); }
const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const PJ = { x: 0, y: 0, on: false };
function drawHUD(ctx, a, G) {
  const W = a.w, H = a.h, pad = a.hudPad(), small = W < 520, P = G.player;
  const ph = G.phase, inPlay = ph === 'countdown' || ph === 'live' || ph === 'goal';
  // letterbox bars for cutaways
  if (G.lb > 0.01) {
    const bh = Math.round(H * 0.085 * G.lb);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
  }
  if (G.cfg.attract) { fadeOver(ctx, a, G); return; }
  const cine = ph === 'intro' || ph === 'introOut' || ph === 'over';
  // name tags
  if (inPlay) {
    for (let i = 0; i < G.cars.length; i++) {
      const c = G.cars[i]; if (c.demoT > 0) continue;
      if (!VIEW.project(c.p.x, c.p.y + 1.7, c.p.z, PJ) || !PJ.on) continue;
      const dist = Math.hypot(c.p.x - VIEW.camPos.x, c.p.y - VIEW.camPos.y, c.p.z - VIEW.camPos.z);
      if (c.isPlayer && dist < 24) continue;
      const al = clamp(1.3 - dist / 90, 0.35, 1);
      ctx.globalAlpha = al;
      const label = c.isPlayer ? 'YOU' : c.name.toUpperCase();
      ctx.font = '700 ' + (small ? 9 : 10) + 'px ' + F_MONO;
      const tw = ctx.measureText(label).width + 12;
      rr(ctx, PJ.x - tw / 2, PJ.y - 9, tw, 16, 5); ctx.fillStyle = c.isPlayer ? TEAM[c.team].col : 'rgba(10,9,12,0.55)'; ctx.fill();
      txt(ctx, label, PJ.x, PJ.y - 1, small ? 9 : 10, c.isPlayer ? '#1a0d02' : TEAM[c.team].glow, 'center', '700');
      if (c.boost > 0 && !c.isPlayer && dist < 50) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(PJ.x - tw / 2 + 3, PJ.y + 8, tw - 6, 2); ctx.fillStyle = GOLD; ctx.fillRect(PJ.x - tw / 2 + 3, PJ.y + 8, (tw - 6) * c.boost / 100, 2); }
      ctx.globalAlpha = 1;
    }
    // where the ball is when it is off screen
    const B = G.ball;
    if (B.vis && VIEW.project(B.p.x, B.p.y, B.p.z, PJ) && !PJ.on) {
      const cx = W / 2, cy = H / 2; let dx = PJ.x - cx, dy = PJ.y - cy; if (PJ.behind) { dx = -dx; dy = -dy; }
      const m = Math.max(Math.abs(dx) / (W / 2 - 40), Math.abs(dy) / (H / 2 - 70)) || 1; const ex = cx + dx / m, ey = cy + dy / m, an = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(an); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
  // scoreboard
  if (cine) { drawCine(ctx, a, G, small, pad); fadeOver(ctx, a, G); return; }
  const sbW = small ? 210 : 280, sbH = small ? 40 : 46, sbX = W / 2 - sbW / 2, sbY = pad.top + 2;
  plate(ctx, sbX, sbY, sbW, sbH, 12, 0.66);
  const bw = small ? 62 : 82;
  [0, 1].forEach((t) => {
    const x = t === 0 ? sbX : sbX + sbW - bw;
    rr(ctx, x + 3, sbY + 3, bw - 6, sbH - 6, 9); ctx.fillStyle = TEAM[t].col; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
    txt(ctx, String(G.score[t]), x + bw / 2, sbY + sbH / 2 + 1, small ? 22 : 26, '#140a04', 'center', '700', F_DISP);
    if (!small) txt(ctx, TEAM[t].name.toUpperCase(), t === 0 ? x - 8 : x + bw + 8, sbY + sbH + 10, 9, TEAM[t].glow, t === 0 ? 'right' : 'left', '700');
  });
  const clk = G.ot ? '+' + fmtClock(G.otT) : fmtClock(G.clock);
  const low = !G.ot && G.clock <= 30 && G.clock > 0;
  txt(ctx, clk, W / 2, sbY + sbH / 2 - (G.ot ? 5 : 0), small ? 17 : 20, low && Math.floor(G.realT * 2) % 2 ? GOLD : INK, 'center', '700');
  if (G.ot) txt(ctx, 'OVERTIME', W / 2, sbY + sbH / 2 + 11, 8, GOLD, 'center', '700');
  // camera badge (tap to switch on touch)
  const cw = small ? 76 : 86, ch = 24, cx0 = W - pad.right - cw, cy0 = sbY + (sbH - ch) / 2;
  plate(ctx, cx0, cy0, cw, ch, 8, 0.55);
  txt(ctx, (G.cam === 'ball' ? 'BALL' : 'CAR') + ' CAM', cx0 + cw / 2, cy0 + ch / 2 + 1, 10, G.cam === 'ball' ? GOLD : INK, 'center', '700');
  G.ui = { cam: { x: cx0 - 6, y: cy0 - 8, w: cw + 12, h: ch + 16 } };
  // boost gauge
  if (inPlay || ph === 'intro') {
    const R = small ? 34 : 42;
    const gx = a.touchMode ? pad.left + R + 8 : W - pad.right - R - 6, gy = H - pad.bottom - R - (a.touchMode ? 10 : 6);
    ctx.beginPath(); ctx.arc(gx, gy, R + 4, 0, TAU); ctx.fillStyle = 'rgba(10,9,12,0.58)'; ctx.fill();
    ctx.lineWidth = small ? 6 : 7; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(gx, gy, R - 3, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    const b = P.boost / 100;
    if (b > 0.005) {
      const gr = ctx.createLinearGradient(gx - R, gy, gx + R, gy); gr.addColorStop(0, '#ff6a1a'); gr.addColorStop(1, '#ffd36a');
      ctx.strokeStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, R - 3, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * b)); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    txt(ctx, String(Math.round(P.boost)), gx, gy - 2, small ? 20 : 24, P.boosting ? GOLD : INK, 'center', '700', F_DISP);
    txt(ctx, 'BOOST', gx, gy + R * 0.48, 8, DIM, 'center', '700');
    const kmh = Math.round(P.v.len() * 3.6);
    txt(ctx, kmh + ' km/h', gx, gy - R - 12, 10, P.sonic ? GOLD : DIM, 'center', '600');
    if (P.sonic) txt(ctx, 'SUPERSONIC', gx, gy - R - 25, 9, GOLD, 'center', '700');
  }
  // minimap
  if (inPlay && !small) drawMini(ctx, a, G, pad.left + 4, a.touchMode ? sbY + sbH + 26 : H - pad.bottom - 112, 72, 104);
  else if (inPlay && small) drawMini(ctx, a, G, pad.left, sbY, 34, 50);
  // feed
  let fy = sbY + sbH + (small ? 18 : 30);
  G.feed.forEach((f) => {
    const al = clamp(1.5 - f.t / 4, 0, 1); if (al <= 0) return;
    ctx.globalAlpha = al; txt(ctx, f.text, W - pad.right, fy, small ? 10 : 11, f.col, 'right', '600'); fy += 16; ctx.globalAlpha = 1;
  });
  // the player knocked out
  if (P.demoT > 0 && inPlay) {
    plate(ctx, W / 2 - 110, H * 0.62, 220, 46, 12);
    txt(ctx, 'KNOCKED OUT', W / 2, H * 0.62 + 16, 13, TEAM[1 - P.team].glow, 'center', '700');
    txt(ctx, 'Back in ' + P.demoT.toFixed(1) + 's', W / 2, H * 0.62 + 33, 11, DIM, 'center', '600');
  }
  // score pops
  let py = H * (small ? 0.66 : 0.7);
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i], al = clamp(2.2 - p.t, 0, 1) * clamp(p.t * 6, 0, 1), rise = p.t * 14;
    ctx.globalAlpha = al;
    if (p.big) { txt(ctx, p.text, W / 2, H * 0.36 - rise, small ? 30 : 42, p.col, 'center', '600', F_DISP); if (p.sub) txt(ctx, p.sub, W / 2, H * 0.36 + (small ? 26 : 34) - rise, 12, INK, 'center', '600'); }
    else { txt(ctx, p.text, W / 2, py - rise, small ? 13 : 15, p.col, 'center', '700'); py -= 22; }
    ctx.globalAlpha = 1;
  }
  // kickoff countdown
  if (ph === 'countdown') {
    const n = Math.ceil(G.cd), f = G.cd - Math.floor(G.cd), sc = 1 + (1 - f) * 0.5;
    if (n > 0 && n <= 3) {
      ctx.save(); ctx.translate(W / 2, H * 0.38); ctx.scale(sc, sc); ctx.globalAlpha = clamp(f * 2, 0, 1);
      ctx.font = '600 ' + (small ? 80 : 110) + 'px ' + F_DISP; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(String(n), 0, 0); ctx.fillStyle = INK; ctx.fillText(String(n), 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (G.kickoffs === 1 && G.firstKick) txt(ctx, G.ot ? 'Overtime: next goal wins' : 'Kickoff', W / 2, H * 0.38 + (small ? 62 : 80), 12, DIM, 'center', '700');
  }
  if (ph === 'live' && G.kickT < 0.7) {
    const f = G.kickT / 0.7; ctx.globalAlpha = 1 - f;
    txt(ctx, 'GO', W / 2, H * 0.38, (small ? 70 : 96) * (1 + f * 0.4), GOLD, 'center', '600', F_DISP); ctx.globalAlpha = 1;
  }
  // goal banner
  if (ph === 'goal' && G.goalInfo) {
    const gi = G.goalInfo, t = G.pt, s = Math.min(1, t * 3), mine = gi.team === P.team;
    ctx.save(); ctx.translate(W / 2, H * 0.34); const sc = (small ? 0.62 : 1) * (0.6 + 0.4 * smooth01(s)) * (1 + Math.max(0, 0.15 - Math.abs(t - 0.25)) * 2);
    ctx.scale(sc, sc); ctx.globalAlpha = clamp(3 - t, 0, 1);
    ctx.font = 'italic 600 120px ' + F_DISP; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.strokeText('GOAL', 0, 0);
    const gr = ctx.createLinearGradient(0, -60, 0, 60); gr.addColorStop(0, '#fff'); gr.addColorStop(0.55, TEAM[gi.team].glow); gr.addColorStop(1, TEAM[gi.team].col);
    ctx.fillStyle = gr; ctx.fillText('GOAL', 0, 0); ctx.restore();
    ctx.globalAlpha = clamp((t - 0.3) * 3, 0, 1) * clamp(3 - t, 0, 1);
    const who = gi.scorer ? (gi.scorer.isPlayer ? 'You scored' : gi.scorer.name) : 'Own goal';
    txt(ctx, who + (gi.assist ? '  ·  assist ' + gi.assist.name : ''), W / 2, H * 0.34 + (small ? 52 : 82), small ? 13 : 16, INK, 'center', '700');
    txt(ctx, gi.kmh + ' km/h' + (mine ? '' : ''), W / 2, H * 0.34 + (small ? 72 : 106), 12, GOLD, 'center', '600');
    ctx.globalAlpha = 1;
  }
  // replay
  if (ph === 'replay' || ph === 'replayOut') {
    const bh = Math.round(H * 0.085 * G.lb);
    ctx.fillStyle = '#e8352b'; ctx.beginPath(); ctx.arc(pad.left + 10, bh + 22, 5, 0, TAU); ctx.globalAlpha = Math.floor(G.realT * 2) % 2 ? 1 : 0.4; ctx.fill(); ctx.globalAlpha = 1;
    txt(ctx, 'REPLAY', pad.left + 22, bh + 22, 13, INK, 'left', '700');
    if (G.goalInfo) txt(ctx, (G.goalInfo.scorer ? G.goalInfo.scorer.name : 'Own goal') + '  ' + G.goalInfo.kmh + ' km/h', pad.left + 22, bh + 40, 10, TEAM[G.goalInfo.team].glow, 'left', '600');
    txt(ctx, a.touchMode ? 'Tap to skip' : 'Space to skip', W / 2, H - bh - 14, 11, DIM, 'center', '600');
  }
  // touch reminder at the start
  if (a.touchMode && a.touchStyle !== 'pads' && ph === 'live' && G.firstLive >= 0 && G.realT - G.firstLive < 7) {
    const al = clamp(7 - (G.realT - G.firstLive), 0, 1);
    ctx.globalAlpha = al * 0.95;
    const lines = a.touchStyle === 'tilt' ? ['Tilt to steer, gas is automatic', 'Tap to jump, tap again to flip', 'Swipe up or hold Boost to boost'] : ['Drag where you want to drive', 'Tap to jump, tap again to flip', 'Swipe up or hold Boost to boost'];
    const by = sbY + sbH + (small ? 70 : 90);
    plate(ctx, W / 2 - 128, by - 14, 256, lines.length * 18 + 12, 10, 0.5);
    lines.forEach((l, i) => txt(ctx, l, W / 2, by + i * 18 + 2, 11, INK, 'center', '600', F_BODY));
    ctx.globalAlpha = 1;
  }
  fadeOver(ctx, a, G);
}
// The intro title card and the podium: no scoreboard, just the moment.
function drawCine(ctx, a, G, small, pad) {
  const W = a.w, H = a.h, ph = G.phase, bh = Math.round(H * 0.085 * G.lb);
  if (ph === 'intro' || ph === 'introOut') {
    const t = G.pt, al = clamp((t - 0.5) * 2, 0, 1) * clamp((4.2 - t) * 2, 0, 1);
    ctx.globalAlpha = al;
    txt(ctx, 'NITRO GOAL', W / 2, H - bh - (small ? 74 : 92), small ? 34 : 52, INK, 'center', '600', F_DISP);
    txt(ctx, TEAM[0].name + '  vs  ' + TEAM[1].name + '   ·   ' + G.cfg.mode + '   ·   ' + fmtClock(G.cfg.len), W / 2, H - bh - (small ? 44 : 54), small ? 10 : 12, GOLD, 'center', '700');
    ctx.globalAlpha = al * 0.8;
    txt(ctx, a.touchMode ? 'Tap to skip' : 'Space to skip', W / 2, H - bh - 18, 10, DIM, 'center', '600');
    ctx.globalAlpha = 1;
  } else if (ph === 'over' && G.winner != null) {
    const al = clamp(G.pt - 0.3, 0, 1), P = G.player;
    ctx.globalAlpha = al;
    const mine = G.winner === P.team && G.score[0] !== G.score[1];
    const gy = ctx.createLinearGradient(0, bh, 0, bh + (small ? 170 : 220)); gy.addColorStop(0, 'rgba(0,0,0,0.6)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gy; ctx.fillRect(0, bh, W, small ? 170 : 220);
    txt(ctx, G.score[0] === G.score[1] ? 'FULL TIME' : (mine ? 'VICTORY' : TEAM[G.winner].name.toUpperCase() + ' WIN'), W / 2, bh + (small ? 60 : 84), small ? 34 : 52, mine ? GOLD : TEAM[G.winner].glow, 'center', '600', F_DISP);
    txt(ctx, TEAM[0].name + '  ' + G.score[0] + '  -  ' + G.score[1] + '  ' + TEAM[1].name, W / 2, bh + (small ? 100 : 136), small ? 14 : 18, INK, 'center', '700');
    ctx.globalAlpha = 1;
  }
}
function fadeOver(ctx, a, G) { if (G.fade > 0.005) { ctx.fillStyle = 'rgba(0,0,0,' + clamp(G.fade, 0, 1) + ')'; ctx.fillRect(0, 0, a.w, a.h); } }
function drawMini(ctx, a, G, x, y, w, h) {
  plate(ctx, x, y, w, h, 8, 0.5);
  const sx = (w - 8) / (HW * 2), sz = (h - 8) / (HL * 2);
  const mx = (wx) => x + 4 + (wx + HW) * sx, mz = (wz) => y + 4 + (HL - wz) * sz;
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4, y + h / 2); ctx.lineTo(x + w - 4, y + h / 2); ctx.stroke();
  ctx.fillStyle = TEAM[1].col; ctx.fillRect(mx(-GW), y + 1, GW * 2 * sx, 3);
  ctx.fillStyle = TEAM[0].col; ctx.fillRect(mx(-GW), y + h - 4, GW * 2 * sx, 3);
  G.cars.forEach((c) => {
    if (c.demoT > 0) return;
    ctx.fillStyle = c.isPlayer ? '#fff' : TEAM[c.team].col;
    ctx.beginPath(); ctx.arc(mx(c.p.x), mz(c.p.z), c.isPlayer ? 3 : 2.3, 0, TAU); ctx.fill();
  });
  if (G.ball.vis) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(mx(G.ball.p.x), mz(G.ball.p.z), 3.2, 0, TAU); ctx.fill(); ctx.stroke(); }
}

/* ------------------------------------------------------------ menu, debug and the shell */
const MENU_CSS =
  '.ng-final{font-family:var(--font-mono);font-size:15px;margin:0 0 10px}.ng-final b{font-weight:600}.ng-final span{color:var(--ink-mute);margin:0 6px}.ng-final small{color:var(--ink-mute);font-size:11px}' +
  '.ng-res{width:100%;border-collapse:collapse;margin:2px 0 10px;font-size:13px}.ng-res th{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute);font-weight:500;text-align:right;padding:4px 6px}' +
  '.ng-res th:first-child,.ng-res td:first-child{text-align:left}.ng-res td{padding:6px;border-top:1px solid var(--rule);color:var(--ink-dim);text-align:right;font-family:var(--font-mono)}' +
  '.ng-res tr.me td{background:var(--primary-soft);color:var(--ink)}.ng-res td i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:7px;vertical-align:0}' +
  '.ng-note{font-size:13px;color:var(--ink-mute);margin:0 0 6px}.arc-card:has(.ng-intro) p{font-size:14px}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }
function menuProps() {
  return {
    eyebrow: 'Rocket car football', title: 'Nitro <em>Goal</em>',
    html: '<p class="ng-intro">Drive, boost, jump and flip a rocket car to smash a giant ball into the net. Play three a side with two AI teammates, two a side, or a one on one duel. Drive up the curved walls, fly with boost, and bump a rival out at supersonic speed.</p>',
    options: [
      { id: 'mode', label: 'Mode', value: '3v3', choices: [{ v: '3v3', label: 'Standard 3v3' }, { v: '2v2', label: 'Doubles 2v2' }, { v: '1v1', label: 'Duel 1v1' }] },
      { id: 'len', label: 'Match length', value: '300', choices: [{ v: '300', label: '5 minutes' }, { v: '180', label: '3 minutes' }] },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      { id: 'sky', label: 'Kickoff time', value: 'dusk', choices: [{ v: 'dusk', label: 'Dusk' }, { v: 'night', label: 'Night' }] },
      { id: 'cam', label: 'Camera', value: 'ball', choices: [{ v: 'ball', label: 'Ball cam' }, { v: 'car', label: 'Car cam' }], note: 'Switch any time with C, Y on a controller, or by tapping the camera badge.' }
    ]
  };
}
function debugState() {
  const G = MG, a = ARC;
  if (!G) return { state: a.state, phase: 'none' };
  const P = G.player, B = G.ball;
  return {
    state: a.state, phase: G.cfg.attract ? 'attract' : G.phase, mode: G.cfg.mode, diff: G.cfg.diff, len: G.cfg.len, sky: G.cfg.sky, renderer: VIEW ? VIEW.name : 'none',
    clock: +G.clock.toFixed(2), ot: G.ot, score: G.score.slice(), alive: G.phase !== 'over',
    ball: { x: +B.p.x.toFixed(2), y: +B.p.y.toFixed(2), z: +B.p.z.toFixed(2), speed: +B.v.len().toFixed(2), vis: B.vis },
    x: +P.p.x.toFixed(2), y: +P.p.y.toFixed(2), z: +P.p.z.toFixed(2), speed: Math.round(P.v.len() * 3.6), boost: Math.round(P.boost), boosting: P.boosting,
    onGround: P.ground, onWall: P.ground && P.n.y < 0.5, jumps: P.jumps, flips: P.flips, knockedOut: P.demoT > 0, steer: +P.ctl.steer.toFixed(2), throttle: +P.ctl.thr.toFixed(2),
    touches: P.stats.touches, goals: P.stats.goals, shots: P.stats.shots, saves: P.stats.saves, demos: P.stats.demos, points: P.stats.points,
    cam: G.cam, cars: G.cars.length, pads: G.pads.filter((p) => p.t <= 0).length, kickoffs: G.kickoffs, time: +G.time.toFixed(2),
    gfx: VIEW && VIEW.debug ? VIEW.debug() : null
  };
}
export function boot(view) {
  VIEW = view;
  const A = window.Arcade;
  A.create({
    three: !!view.three,
    slug: 'nitro-goal', title: 'Nitro Goal', genre: 'Rocket car football',
    graphics(level) { if (view.graphics) view.graphics(level); },
    hint: 'W S drive, A D steer. Space jumps (again in the air to flip), Shift boosts, C switches ball cam.',
    touchHint: 'Stick drives (push up for gas). Jump, tap Jump again to flip. Hold Boost. Cam switches the camera.',
    keys: [['W / Up / I', 'Gas'], ['S / Down / K', 'Brake and reverse'], ['A D / Left Right', 'Steer, and turn in the air'], ['Space', 'Jump, again in the air to flip'], ['Shift', 'Boost (fly with it in the air)'], ['Q / E', 'Air roll'], ['X', 'Powerslide'], ['C', 'Ball cam on or off']],
    gameKeys: ['ShiftLeft', 'ShiftRight'],
    mouse: { steer: false, cursor: 'default', keys: [['Left click', 'Jump'], ['Hold right click', 'Boost']] },
    // Controller: RT gas, LT reverse, A jump, B boost, Y ball cam, X powerslide, left stick steers.
    gamepad: { buttons: ['Space', 'KeyX', 'ShiftLeft', 'KeyC'], rt: 'KeyI', lt: 'KeyK' },
    touch: { stick: true, pads: [{ label: 'Jump', key: 'Space', big: true, hot: true }, { label: 'Boost', key: 'ShiftLeft', keep: true }, { label: 'Cam', key: 'KeyC' }] },
    touchKeys: [['Stick', 'Steer, push up for gas'], ['Jump', 'Jump, again in the air to flip'], ['Boost', 'Hold to boost'], ['Cam', 'Ball cam on or off']],
    gestures: {
      drag: 'xy', tilt: true,
      hint: 'Drag to drive. Tap to jump, tap again to flip. Swipe up to boost.',
      keys: [['Drag', 'Drive that way'], ['Tap', 'Jump'], ['Tap again in the air', 'Flip toward your drag'], ['Swipe up / hold Boost', 'Boost'], ['Second finger tap', 'Jump while you drive'], ['Tap the camera badge', 'Ball cam on or off']]
    },
    formatScore: (v) => Math.round(v) + ' pts',
    resize: (a) => { if (view.resize) view.resize(a); },
    init(a) {
      ARC = a;
      if (!view.init(a)) return;
      const origMenu = a.menu;
      a.menu = function (p) { return origMenu(Object.assign(menuProps(), p || {})); };
      a.debug = debugState;
      a.dev = Object.assign({ match: () => MG, bot: (on) => { if (MG) MG.player.bot = on !== false; }, skip: () => { if (MG && MG.phase === 'intro') MG.pt = 9; } }, view.dev || {});
      // a second finger tapping while the first drags is a jump; right mouse boosts; left click jumps
      // Taps and swipes are judged on the events' own timestamps, so a phone that drops a frame mid-swipe still boosts.
      a.canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') {
          if (TT.id == null) { TT.id = e.pointerId; TT.x = e.clientX; TT.y = e.clientY; TT.t = e.timeStamp; }
          else if (e.pointerId !== TT.id) TOUCH.jump = true;
        }
        if (e.pointerType === 'mouse') { if (e.button === 2) MOUSE.right = true; else if (e.button === 0) { MOUSE.click = true; MOUSE.left = true; } }
      });
      const up = (e) => {
        if (e.pointerType === 'mouse') { if (e.button === 2) MOUSE.right = false; if (e.button === 0) MOUSE.left = false; }
        if (e.pointerType === 'touch' && e.pointerId === TT.id) {
          TT.id = null;
          if (e.type === 'pointercancel') return;
          const dx = e.clientX - TT.x, dy = e.clientY - TT.y, d = Math.hypot(dx, dy), ms = Math.max(1, e.timeStamp - TT.t);
          const r = a.canvas.getBoundingClientRect();
          if (d < 16 && ms < 350) TOUCH.tap = { x: e.clientX - r.left, y: e.clientY - r.top };
          else if (d >= 40 && ms < 450 && Math.abs(dy) > Math.abs(dx) * 1.1) TOUCH.swipe = { dir: dy < 0 ? 'up' : 'down', power: clamp(d / ms / 2.2, 0.2, 1) };
        }
      };
      a.canvas.addEventListener('pointerup', up);
      a.canvas.addEventListener('pointercancel', (e) => { MOUSE.right = false; MOUSE.left = false; up(e); });
      window.addEventListener('blur', () => { MOUSE.right = false; MOUSE.left = false; });
      a.menu();
    },
    onMenu() { injectCss(); },
    start(a, ch) {
      injectCss();
      const cfg = { mode: MODES[ch.mode] ? ch.mode : '3v3', len: +(ch.len || 300) || 300, diff: DIFF[ch.diff] ? ch.diff : 'normal', sky: ch.sky === 'night' ? 'night' : 'dusk', cam: ch.cam === 'car' ? 'car' : 'ball', attract: false };
      MG = newMatch(cfg); recInit(MG); MG.pose = makePose(MG.cars.length); poseLive(MG);
      TOUCH.dirT = -9; TOUCH.boostT = 0; TOUCH.brakeT = 0; TOUCH.jump = false; TOUCH.tap = null; TOUCH.swipe = null; MOUSE.click = false;
      audioInit();
      if (view.newMatch) view.newMatch(MG, a);
    },
    update(dt, a) {
      const G = MG; if (!G || G.cfg.attract) return;
      const inp = a.input;
      const tap = TOUCH.tap || inp.tap(), sw = TOUCH.swipe || inp.swipe();
      TOUCH.tap = null; TOUCH.swipe = null;
      let skip = inp.hit('Space', 'Enter', 'KeyJ', 'NumpadEnter') || MOUSE.click;
      if (inp.hit('KeyC')) toggleCam(G, a);
      if (tap) {
        const u = G.ui && G.ui.cam;
        if (u && tap.x >= u.x && tap.x <= u.x + u.w && tap.y >= u.y && tap.y <= u.y + u.h) { toggleCam(G, a); MOUSE.click = false; }
        else { skip = true; if (G.phase === 'live' || G.phase === 'goal') { TOUCH.jump = true; TOUCH.holdJ = 0.18; } }
      }
      if (sw && (G.phase === 'live' || G.phase === 'goal')) {
        if (sw.dir === 'up') { TOUCH.boostT = 0.9 + 0.9 * sw.power; if (G.player.boost <= 0) a.toast('Out of boost', 'Drive over the glowing pads', 1000); }
        else if (sw.dir === 'down') TOUCH.brakeT = 0.45;
      } else if (sw) skip = true;
      const P = G.player;
      if (G.phase === 'live' || G.phase === 'goal' || G.phase === 'countdown') {
        playerCtl(G, P, a, dt);
        if (inp.hit('Space') || MOUSE.click || TOUCH.jump) P.ctl.jumpPress = G.phase !== 'countdown';
      }
      MOUSE.click = false; TOUCH.jump = false;
      stepMatch(G, dt, a, skip);
      audioFrame(G, a, dt);
    },
    idle(dt, a) {
      if (a.state === 'menu') {
        if (!MG || !MG.cfg.attract) { MG = newMatch({ mode: '3v3', len: 300, diff: 'normal', sky: a.choices.sky === 'night' ? 'night' : 'dusk', cam: 'ball', attract: true }); MG.pose = makePose(MG.cars.length); poseLive(MG); if (view.newMatch) view.newMatch(MG, a); }
        const want = a.choices.sky === 'night' ? 'night' : 'dusk';
        if (MG.cfg.sky !== want) { MG.cfg.sky = want; if (view.newMatch) view.newMatch(MG, a); }
        stepMatch(MG, dt, a, false);
      } else if (a.state === 'over' && MG) {
        stepMatch(MG, dt, a, false);
      }
      audioFrame(MG, a, dt);
    },
    render(ctx, a) {
      if (!MG || !MG.pose) { ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, a.w, a.h); return; }
      let ok = true;
      try { ok = view.render(a, MG, ctx) !== false; } catch (e) { ok = false; console.warn(e); }
      if (!ok) return;
      drawHUD(ctx, a, MG);
    },
    onPause() { if (AU && AU.ok) try { AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.05); } catch (e) { /* ignore */ } },
    onOver() { if (AU && AU.ok) try { AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.2); } catch (e) { /* ignore */ } }
  });
}
function toggleCam(G, a) {
  G.cam = G.cam === 'ball' ? 'car' : 'ball';
  a.choices.cam = G.cam; a.store.set('arcade.nitro-goal.cam', G.cam);
  a.toast(G.cam === 'ball' ? 'Ball cam' : 'Car cam', G.cam === 'ball' ? 'The camera keeps the ball in view' : 'The camera looks where you drive', 900);
  sfx(G.cam === 'ball' ? 660 : 520, 0.06, { type: 'triangle', vol: 0.06 });
}
