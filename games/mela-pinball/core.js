/*
 * Mela Pinball, the game itself: the table, the ball physics, the rules, the
 * dot matrix display, sound, controls and the arcade shell wiring. It is
 * shared by both editions: game3d.js draws it with WebGL, game.js draws it in
 * 2D for browsers without WebGL2. A view gives boot() the drawing; everything
 * that decides what happens lives here.
 *
 * Units are centimetres on the playfield: x runs across (-22.2 to 25.3 with
 * the shooter lane on the right), y runs up the table (0 at the flippers'
 * drain, about 100 at the top), z is height above the playfield. The table
 * leans at a little under seven degrees, so the ball feels about 118 cm/s2 of
 * gravity down the glass.
 *
 * Physics runs at a fixed 240 ticks a second, and every tick is cut into as
 * many sub-steps as it takes to keep the ball, and the flipper tip sweeping
 * toward it, from moving more than 0.55 cm in one step. That is continuous
 * collision by conservative advancement: no wall is thinner than that step,
 * so a fast ball can never pass through a flipper, a post or a target. The
 * view draws an interpolation between the last two ticks.
 */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const BR = 1.35;
export const TICK = 1 / 240;
const STEP_MAX = 0.55;

/* ------------------------------------------------------------ the table */
// Every surface the ball can touch, every lamp, sensor and toy anchor.
function buildTable() {
  const T = { segs: [], circs: [], sensors: [], lamps: [], bumpers: [], slings: [], targets: [], flippers: [] };
  // mat: what it is made of, for the look and the bounce. h: how tall it stands, for the 3D walls.
  const seg = (ax, ay, bx, by, o) => {
    o = o || {};
    const s = { ax, ay, bx, by, r: o.r == null ? 0.18 : o.r, e: o.e == null ? 0.42 : o.e, mu: o.mu == null ? 0.08 : o.mu, kind: o.kind || 'wall', id: o.id == null ? -1 : o.id, mat: o.mat || 'wall', h: o.h == null ? 2.6 : o.h, oneway: o.oneway || null, on: true, draw: o.draw !== false };
    T.segs.push(s); return s;
  };
  const poly = (pts, o) => { for (let i = 0; i < pts.length - 1; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], o); };
  const circ = (x, y, r, o) => { o = o || {}; const c = { x, y, r, e: o.e == null ? 0.6 : o.e, mu: o.mu == null ? 0.05 : o.mu, kind: o.kind || 'post', id: o.id == null ? -1 : o.id, mat: o.mat || 'rubber', h: o.h == null ? 2.4 : o.h, on: true }; T.circs.push(c); return c; };
  const arcPts = (cx, cy, r, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };

  T.W = 22.2; T.LANE = [22.0, 25.3]; T.TOPY = 100;
  // Outer cabinet wall: left side, the left corner, the flat top rail, the right corner, the shooter lane's outer wall.
  const outline = [[-22.2, -4]].concat(arcPts(-14.2, 92, 8, Math.PI, Math.PI / 2, 22), arcPts(17.3, 92, 8, Math.PI / 2, 0, 22), [[25.3, -4]]);
  outline.splice(1, 0, [-22.2, 92]);
  T.outline = outline;
  poly(outline, { mat: 'wood', e: 0.38, mu: 0.05, h: 3.2 });
  // shooter lane inner wall and its one way exit gate
  seg(22.0, 3.0, 22.0, 81.4, { mat: 'metal', e: 0.3, h: 2.8 });
  circ(22.0, 81.4, 0.25, { mat: 'metal', e: 0.3, kind: 'post' });
  // gate: the ball may pass it going up; from above it is a slope down to the left
  const gn = norm(-(84.8 - 82.0), 25.3 - 22.0);
  T.gates = [seg(22.0, 82.0, 25.3, 84.8, { mat: 'gate', e: 0.25, kind: 'gate', id: 0, oneway: { nx: gn[0] * Math.sign(gn[1] || 1), ny: Math.abs(gn[1]) }, h: 1.2 })];
  // the left orbit's gate: balls go up through it; a ball falling from the top rolls off it to the right
  const g2 = norm(84.6 - 82.0, -18.4 + 22.2);
  T.gates.push(seg(-22.2, 84.6, -18.4, 82.0, { mat: 'gate', e: 0.25, kind: 'gate', id: 1, oneway: { nx: g2[0], ny: g2[1] }, h: 1.2 }));

  // Lower playfield, mirrored about x = 0.
  [-1, 1].forEach((s) => {
    const side = s < 0 ? 0 : 1;
    // outlane / inlane separator, rubber post on top
    seg(s * 18.5, -4, s * 18.5, 27, { mat: 'metal', e: 0.3, h: 2.4 });
    circ(s * 18.5, 27, 0.45, { mat: 'rubber', e: 0.7 });
    // inlane guide down to the flipper
    seg(s * 18.5, 20, s * 10.75, 13.9, { mat: 'metal', e: 0.25, mu: 0.03, h: 2.0 });
    // slingshot
    const A = [s * 14.65, 28.5], B = [s * 14.65, 22.2], C = [s * 11.2, 19.2];
    seg(A[0], A[1], B[0], B[1], { mat: 'plastic', e: 0.35, h: 2.6 });
    seg(B[0], B[1], C[0], C[1], { mat: 'plastic', e: 0.35, h: 2.6 });
    const face = seg(A[0], A[1], C[0], C[1], { mat: 'sling', e: 0.62, kind: 'sling', id: side, r: 0.45, h: 2.6 });
    circ(A[0], A[1], 0.6, { e: 0.7 }); circ(B[0], B[1], 0.6, { e: 0.5 }); circ(C[0], C[1], 0.6, { e: 0.7 });
    T.slings.push({ a: A, b: B, c: C, face, side });
    // flipper
    T.flippers.push({ side: s < 0 ? 1 : -1, px: s * 9.5, py: 12.1, len: 7.6, rb: 1.15, rt: 0.62, rest: -30 * Math.PI / 180, up: 27 * Math.PI / 180 });
    // inlane and outlane switches
    T.sensors.push({ ax: s * 18.5, ay: 25, bx: s * 14.65, by: 25, kind: 'inlane', id: side });
    T.sensors.push({ ax: s * 22.2, ay: 16, bx: s * 18.5, by: 16, kind: 'outlane', id: side });
  });
  // Left orbit lane, with the spinner across it
  poly([[-9.8, 46.5], [-15.6, 55], [-18.4, 61], [-18.4, 80]], { mat: 'metal', e: 0.3, mu: 0.02, h: 2.6 });
  circ(-9.8, 46.5, 0.6, { e: 0.6 });
  circ(-18.4, 80, 0.45, { mat: 'metal', e: 0.35 });
  T.spinner = { x0: -22.2, x1: -18.4, y: 64 };
  T.sensors.push({ ax: -22.2, ay: 64, bx: -18.4, by: 64, kind: 'spinner', id: 0 });
  T.sensors.push({ ax: -22.2, ay: 78, bx: -18.4, by: 78, kind: 'orbit', id: 0 });
  // Lantern drop targets on the left, with a backstop behind them
  seg(-14.9, 29.4, -14.9, 40.0, { mat: 'metal', e: 0.3, h: 2.6 });
  circ(-14.9, 40.0, 0.4, { mat: 'metal', e: 0.4 });
  for (let i = 0; i < 3; i++) {
    const y0 = 29.8 + i * 3.2, y1 = y0 + 2.6;
    const sgm = seg(-14.45, y0, -14.45, y1, { mat: 'target', kind: 'target', id: i, e: 0.3, r: 0.3, h: 2.6 });
    T.targets.push({ x: -14.45, y0, y1, seg: sgm });
  }
  // Juggler ramp mouth: two short flaps and the solid ramp body behind them
  poly([[4.2, 45], [4.2, 60], [6.75, 62.2], [9.3, 60], [9.3, 45]], { mat: 'ramp', e: 0.35, h: 3.0 });
  circ(4.2, 45, 0.45, { mat: 'metal', e: 0.4 }); circ(9.3, 45, 0.45, { mat: 'metal', e: 0.4 });
  T.rampMouth = { x0: 4.65, x1: 8.85, y: 45.2 };
  // Carousel scoop in the right corner, under a sloped roof
  seg(16.0, 61.0, 22.0, 63.6, { mat: 'plastic', e: 0.3, h: 2.4, r: 0.3 });
  T.scoop = { x: 19.7, y: 58.3, r: 1.7 };
  // Pop bumpers
  [[-4.0, 68.5], [6.5, 70.2], [0.8, 60.2]].forEach((p, i) => {
    circ(p[0], p[1], 2.55, { kind: 'bumper', id: i, e: 0.4, mat: 'bumper', h: 3.2 });
    T.bumpers.push({ x: p[0], y: p[1], r: 2.55 });
  });
  // Top lanes M E L A
  [-13, -5, 3, 11, 18.5].forEach((x) => {
    seg(x, 77, x, 83, { mat: 'metal', e: 0.35, h: 2.0, r: 0.22 });
    circ(x, 83, 0.45, { mat: 'metal', e: 0.4 }); circ(x, 77, 0.45, { mat: 'rubber', e: 0.6 });
  });
  T.laneX = [-9, -1, 7, 14.75];
  T.laneX.forEach((x, i) => T.sensors.push({ ax: x - 3.5, ay: 80, bx: x + 3.5, by: 80, kind: 'lane', id: i }));

  // Lamps (inserts). shape: 0 round, 1 arrow (rot = direction), 2 small round, 3 star. col: lamp colour.
  const lamp = (name, x, y, shape, col, rot, size) => { T.lamps.push({ name, x, y, shape, col, rot: rot || 0, size: size || 1 }); return T.lamps.length - 1; };
  const L = {};
  L.lane = T.laneX.map((x, i) => lamp('lane' + i, x, 79.2, 0, ['#ff4fa0', '#ffb02e', '#2fe0c8', '#8a6bff'][i], 0, 0.95));
  L.target = [0, 1, 2].map((i) => lamp('tg' + i, -12.3, 31.1 + i * 3.2, 2, '#ffcf4a', 0, 0.8));
  L.ramp = lamp('ramp', 6.75, 39.8, 1, '#ff6a2a', Math.PI / 2, 1.25);
  L.jug = [0, 1, 2].map((i) => lamp('jug' + i, 4.7 + i * 2.05, 35.0 + (i === 1 ? 0.8 : 0), 2, '#ffd36a', 0, 0.75));
  L.orbit = lamp('orbit', -9.5, 41.5, 1, '#33d6ff', 2.2, 1.15);
  L.scoop = lamp('scoop', 15.8, 51.5, 1, '#b46bff', 0.9, 1.2);
  L.mode = [0, 1, 2, 3].map((i) => lamp('mode' + i, -4.8 + i * 3.2, 30.5 + (i === 1 || i === 2 ? 1.2 : 0), 3, ['#ff6a2a', '#33d6ff', '#ffcf4a', '#ff4fa0'][i], 0, 0.9));
  L.bonus = [2, 3, 4, 5, 6].map((n, i) => lamp('bx' + n, -5.2 + i * 2.6, 24.2, 2, '#f7f0e0', 0, 0.62));
  L.again = lamp('again', 0, 17.2, 0, '#ff3d4f', 0, 1.15);
  L.save = lamp('save', 0, 21.0, 2, '#4dff9a', 0, 0.62);
  L.inlane = [lamp('inL', -16.6, 23.0, 2, '#33d6ff', 0, 0.7), lamp('inR', 16.6, 23.0, 2, '#33d6ff', 0, 0.7)];
  L.outlane = [lamp('outL', -20.35, 21.0, 2, '#ff3d4f', 0, 0.7), lamp('outR', 20.35, 21.0, 2, '#ff3d4f', 0, 0.7)];
  L.spin = lamp('spin', -20.3, 58.0, 2, '#33d6ff', 0, 0.75);
  L.jackpot = lamp('jackpot', 6.75, 30.0, 3, '#ffe066', 0, 1.25);
  T.L = L;

  // The ramp: a path the ball rides in one dimension, from its mouth to the left inlane.
  const ctrl = [[6.75, 45, 0], [6.75, 51, 1.2], [6.9, 58, 3.0], [8.0, 66, 4.8], [8.2, 74, 6.4], [5.8, 83.5, 7.8], [0.5, 89.5, 8.5], [-5.8, 91.2, 8.7], [-11.8, 89.0, 8.5], [-17.0, 83.5, 8.0], [-20.3, 74.5, 7.1], [-20.4, 62.0, 5.8], [-20.2, 52.0, 4.6], [-19.6, 43.5, 3.1], [-17.0, 36.0, 1.5], [-16.6, 31.0, 0.3]];
  T.ramp = pathFrom(ctrl, 6);
  return T;
}
function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
// Catmull-Rom through the control points, sampled evenly by length.
function pathFrom(ctrl, per) {
  const raw = [];
  const P = (i) => ctrl[clamp(i, 0, ctrl.length - 1)];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  raw.push(ctrl[ctrl.length - 1].slice());
  const n = raw.length, x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = raw[i][0]; y[i] = raw[i][1]; z[i] = raw[i][2]; if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1], z[i] - z[i - 1]); }
  return { x, y, z, s, n, L: s[n - 1] };
}
// Position and tangent on the ramp at distance d (no allocation: writes into out).
export function rampAt(R, d, out) {
  d = clamp(d, 0, R.L);
  let lo = 0, hi = R.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.s[m] <= d) lo = m; else hi = m; }
  const seg = R.s[hi] - R.s[lo] || 1, t = (d - R.s[lo]) / seg;
  out.x = R.x[lo] + (R.x[hi] - R.x[lo]) * t; out.y = R.y[lo] + (R.y[hi] - R.y[lo]) * t; out.z = R.z[lo] + (R.z[hi] - R.z[lo]) * t;
  out.tx = (R.x[hi] - R.x[lo]) / seg; out.ty = (R.y[hi] - R.y[lo]) / seg; out.tz = (R.z[hi] - R.z[lo]) / seg;
  return out;
}
export const TABLE = buildTable();
const LANE_X = TABLE.LANE[0];

/* ------------------------------------------------------------ broadphase */
// A uniform grid: each collider is listed in every cell its box (grown by a ball radius) touches.
const GRID = (() => {
  const x0 = -24, y0 = -6, cs = 4, nx = 13, ny = 28;
  const cells = []; for (let i = 0; i < nx * ny; i++) cells.push([]);
  const add = (minx, miny, maxx, maxy, ref) => {
    const m = BR + 0.4;
    const i0 = clamp(Math.floor((minx - m - x0) / cs), 0, nx - 1), i1 = clamp(Math.floor((maxx + m - x0) / cs), 0, nx - 1);
    const j0 = clamp(Math.floor((miny - m - y0) / cs), 0, ny - 1), j1 = clamp(Math.floor((maxy + m - y0) / cs), 0, ny - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i].push(ref);
  };
  TABLE.segs.forEach((s, k) => add(Math.min(s.ax, s.bx) - s.r, Math.min(s.ay, s.by) - s.r, Math.max(s.ax, s.bx) + s.r, Math.max(s.ay, s.by) + s.r, k));
  TABLE.circs.forEach((c, k) => add(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r, 10000 + k));
  const packed = cells.map((c) => Int16Array.from(c));
  return { x0, y0, cs, nx, ny, cells: packed, at(x, y) { const i = clamp(Math.floor((x - x0) / cs), 0, nx - 1), j = clamp(Math.floor((y - y0) / cs), 0, ny - 1); return packed[j * nx + i]; } };
})();

/* ------------------------------------------------------------ settings */
export const DIFF = {
  easy: { g: 104, save: 15, tilt: 3.4, warn: 3, kick: 1.0, label: 'Easy' },
  normal: { g: 118, save: 10, tilt: 2.6, warn: 3, kick: 1.0, label: 'Normal' },
  hard: { g: 134, save: 6, tilt: 2.1, warn: 2, kick: 1.08, label: 'Hard' },
};
export const MODES = {
  classic: { label: 'Classic', balls: 3, note: 'Three balls, best score' },
  rush: { label: 'Mela Rush', balls: 99, time: 180, note: 'Three minutes, every drain saved' },
  free: { label: 'Free play', balls: 99, note: 'Endless balls, no score saved' },
};
const MODE_NAMES = ['JUGGLER FRENZY', 'WHEEL OF LIGHTS', 'LANTERN HUNT', 'BUMPER MELA'];
const MODE_SHORT = ['FRENZY', 'WHEEL', 'LANTERNS', 'BUMPERS'];
const HS_DEFAULT = {
  classic: [[2500000, 'RANI'], [2000000, 'MOTU'], [1500000, 'GUDDU'], [1000000, 'CHOTU'], [500000, 'BUNTY']],
  rush: [[3000000, 'PINKY'], [2200000, 'LALLU'], [1600000, 'DOLLY'], [1000000, 'TINKU'], [600000, 'BABLU']],
};

/* ------------------------------------------------------------ the world */
function newBall(id) {
  return { id, on: false, st: 'free', x: 0, y: 0, z: 0, vx: 0, vy: 0, px: 0, py: 0, pz: 0, rs: 0, rv: 0, hold: 0, age: 0, sx: 0, sy: 0, still: 0, rx: 0, ry: 0, lastBump: 0, speed: 0 };
}
export function newWorld(cfg) {
  const T = TABLE;
  const W = {
    cfg, d: DIFF[cfg.diff] || DIFF.normal, attract: !!cfg.attract,
    balls: [newBall(0), newBall(1), newBall(2), newBall(3)],
    fl: T.flippers.map((f) => ({ def: f, th: f.rest, pth: f.rest, w: 0, held: false, flips: 0, hitT: 0 })),
    bump: T.bumpers.map(() => ({ flash: 0, ring: 0, hits: 0 })),
    sling: T.slings.map(() => ({ flash: 0, kick: 0 })),
    tgt: T.targets.map(() => ({ down: false, t: 0, flash: 0 })),
    spin: { a: 0, pa: 0, w: 0, count: 0 },
    gates: [{ a: 0, w: 0, pa: 0 }, { a: 0, w: 0, pa: 0 }],
    plunger: { pull: 0, ppull: 0, held: false, fireT: 0, power: 0 },
    lampV: new Float32Array(T.lamps.length), lampFlash: new Float32Array(T.lamps.length),
    lane: [false, false, false, false], skillLane: 0, skillT: 0, skillOpen: false,
    t: 0, acc: 0, alpha: 0, timeScale: 1, slowT: 0,
    score: 0, ballNo: 1, ballsLeft: 0, extra: 0, phase: 'plunge', phaseT: 0, ended: false,
    saveT: 0, saveArmed: false, bonusX: 1, tiltMeter: 0, warnings: 0, tilted: false,
    ramps: 0, rampsTotal: 0, jugglers: 0, mbLit: false, mb: false, jackpots: 0, jackpotV: 250000, superLit: false,
    modeLit: false, modeIdx: 0, modeOn: -1, modeT: 0, modeTotal: 0, modesDone: [false, false, false, false],
    combo: 0, comboT: 0, lastShot: '', bonus: { lanes: 0, targets: 0, ramps: 0, spins: 0, bumpers: 0 },
    replay: 3000000, replayDone: false, rushT: cfg.mode === 'rush' ? MODES.rush.time : 0,
    stats: { flipsL: 0, flipsR: 0, launches: 0, bumpers: 0, slings: 0, targets: 0, spins: 0, ramps: 0, orbits: 0, scoops: 0, lanes: 0, jackpots: 0, nudges: 0, saves: 0, drains: 0, combos: 0, skill: 0, modes: 0, multiballs: 0 },
    q: [], // balls waiting to be served to the shooter lane
    pops: [], ev: [], // score pops and effects for the views (bounded)
    serveT: 0, autoT: 0,
    over: false, bonusRun: null,
  };
  W.ballsLeft = (MODES[cfg.mode] || MODES.classic).balls;
  return W;
}

/* ------------------------------------------------------------ events for the view */
let VIEW = null, ARC = null;
const EV_MAX = 48;
function emit(W, type, x, y, a, b) {
  if (W.ev.length >= EV_MAX) W.ev.shift();
  W.ev.push({ type, x, y, a: a || 0, b: b || 0 });
}
function pop(W, x, y, v, col) {
  if (W.attract) return;
  if (W.pops.length > 10) W.pops.shift();
  W.pops.push({ x, y, v, t: 0, col: col || '#ffd36a', s: fmt(v) });
}

/* ------------------------------------------------------------ physics */
const _o = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
function closestOnSeg(s, x, y) {
  const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1;
  let t = ((x - s.ax) * dx + (y - s.ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  _o.x = s.ax + dx * t; _o.y = s.ay + dy * t; return t;
}
// Bounce off a surface with normal (nx, ny) and restitution e; friction mu on the slide.
function bounce(b, nx, ny, e, mu, svx, svy) {
  const rvx = b.vx - (svx || 0), rvy = b.vy - (svy || 0);
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty;
  const jn = -(1 + e) * vn;
  let ft = mu * jn; if (ft > Math.abs(vt)) ft = Math.abs(vt);
  const fdir = vt > 0 ? -1 : 1;
  b.vx += nx * jn + tx * ft * fdir; b.vy += ny * jn + ty * ft * fdir;
  return -vn;
}
function rubberE(vn) { return clamp(0.66 - vn * 0.00075, 0.28, 0.66); }

let FLIP_ACC = 3000, FLIP_MAX = 38, FLIP_KICK = 36;
export function setFlip(a, m, k) { FLIP_ACC = a; FLIP_MAX = m; FLIP_KICK = k; }
function flipperPhys(W, f, h) {
  const d = f.def;
  const live = f.held && !W.tilted;
  // the coil snaps the flipper to full speed within a few degrees; the return spring is softer
  if (live) { if (!f.was && f.th < d.up - 0.05) f.w = Math.max(f.w, FLIP_KICK); f.w += FLIP_ACC * h; if (f.w > FLIP_MAX) f.w = FLIP_MAX; }
  else { f.w -= 2600 * h; if (f.w < -28) f.w = -28; }
  f.was = live;
  f.th += f.w * h;
  if (f.th >= d.up) { f.th = d.up; f.w = live ? 0 : Math.min(f.w, 0); }
  if (f.th <= d.rest) { if (f.w < -4) emit(W, 'flipdown', d.px, d.py, d.side); f.th = d.rest; f.w = f.w < -4 ? -f.w * 0.12 : 0; }
}
function collideFlipper(W, b, f) {
  const d = f.def, c = Math.cos(f.th), s = Math.sin(f.th);
  const dx = d.side * c, dy = s;
  let t = ((b.x - d.px) * dx + (b.y - d.py) * dy) / d.len; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = d.px + dx * d.len * t, cy = d.py + dy * d.len * t;
  const rad = d.rb + (d.rt - d.rb) * t;
  let nx = b.x - cx, ny = b.y - cy;
  const dist = Math.hypot(nx, ny), lim = rad + BR;
  if (dist >= lim || dist < 1e-6) return;
  nx /= dist; ny /= dist;
  b.x = cx + nx * (lim + 0.002); b.y = cy + ny * (lim + 0.002);
  // surface velocity of the flipper where it touches the ball
  const qx = cx + nx * rad - d.px, qy = cy + ny * rad - d.py;
  const svx = -qy * f.w * d.side, svy = qx * f.w * d.side;
  const rvn = (b.vx - svx) * nx + (b.vy - svy) * ny;
  if (rvn < 0) {
    const hit = bounce(b, nx, ny, rubberE(-rvn), 0.12, svx, svy);
    if (hit > 60 && f.hitT <= 0) { f.hitT = 0.08; emit(W, 'flipball', b.x, b.y, hit); snd('flipball', hit); }
  }
}
function collideStatic(W, b) {
  const list = GRID.at(b.x, b.y);
  for (let k = 0; k < list.length; k++) {
    const ref = list[k];
    if (ref < 10000) {
      const s = TABLE.segs[ref];
      if (!s.on) continue;
      closestOnSeg(s, b.x, b.y);
      let nx = b.x - _o.x, ny = b.y - _o.y;
      const dist = Math.hypot(nx, ny), lim = s.r + BR;
      if (dist >= lim || dist < 1e-6) continue;
      nx /= dist; ny /= dist;
      if (s.oneway && (b.x - s.ax) * s.oneway.nx + (b.y - s.ay) * s.oneway.ny <= 0) continue;
      b.x = _o.x + nx * (lim + 0.002); b.y = _o.y + ny * (lim + 0.002);
      const hit = bounce(b, nx, ny, s.mat === 'rubber' || s.mat === 'sling' ? rubberE(-(b.vx * nx + b.vy * ny)) : s.e, s.mu);
      if (hit > 0) touchSeg(W, b, s, nx, ny, hit);
    } else {
      const c = TABLE.circs[ref - 10000];
      if (!c.on) continue;
      let nx = b.x - c.x, ny = b.y - c.y;
      const dist = Math.hypot(nx, ny), lim = c.r + BR;
      if (dist >= lim || dist < 1e-6) continue;
      nx /= dist; ny /= dist;
      b.x = c.x + nx * (lim + 0.002); b.y = c.y + ny * (lim + 0.002);
      const vn = -(b.vx * nx + b.vy * ny);
      if (c.kind === 'bumper') { bumperHit(W, b, c.id, nx, ny, vn); continue; }
      const hit = bounce(b, nx, ny, c.mat === 'rubber' ? rubberE(vn) : c.e, c.mu);
      if (hit > 70) { emit(W, 'post', b.x - nx * BR, b.y - ny * BR, hit); snd(c.mat === 'metal' ? 'metal' : 'rubber', hit); }
    }
  }
}
function touchSeg(W, b, s, nx, ny, hit) {
  if (s.kind === 'sling') {
    if (hit > 22) {
      // the slingshot coil fires: a kick along the face normal
      const k = 205 * W.d.kick;
      b.vx += nx * k; b.vy += ny * k;
      W.sling[s.id].flash = 1; W.sling[s.id].kick = 1;
      award(W, 110, b.x, b.y, 'sling');
      W.stats.slings++; emit(W, 'sling', b.x - nx * BR, b.y - ny * BR, s.id, nx); snd('sling', hit); hap('hit', 0.5);
    }
    return;
  }
  if (s.kind === 'target') {
    if (hit > 14 && !W.tgt[s.id].down) targetDown(W, s.id, b);
    return;
  }
  if (hit > 80) { emit(W, 'wall', b.x - nx * BR, b.y - ny * BR, hit); snd(s.mat === 'wood' ? 'wood' : 'metal', hit); }
}
function collideBalls(W, a, b) {
  let nx = b.x - a.x, ny = b.y - a.y;
  const d = Math.hypot(nx, ny), lim = BR * 2;
  if (d >= lim || d < 1e-6) return;
  nx /= d; ny /= d;
  const pen = (lim - d) * 0.5 + 0.001;
  a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return;
  const j = -(1 + 0.9) * rv * 0.5;
  a.vx -= nx * j; a.vy -= ny * j; b.vx += nx * j; b.vy += ny * j;
  if (-rv > 60) { snd('clack', -rv); emit(W, 'post', (a.x + b.x) / 2, (a.y + b.y) / 2, -rv); }
}
// Did the ball's last step cross a switch line? Returns the side it came from (+1/-1) or 0.
function crossed(sn, x0, y0, x1, y1) {
  const ex = sn.bx - sn.ax, ey = sn.by - sn.ay;
  const d0 = (x0 - sn.ax) * ey - (y0 - sn.ay) * ex, d1 = (x1 - sn.ax) * ey - (y1 - sn.ay) * ex;
  if ((d0 > 0) === (d1 > 0)) return 0;
  const L2 = ex * ex + ey * ey, t = ((x1 - sn.ax) * ex + (y1 - sn.ay) * ey) / L2;
  if (t < -0.05 || t > 1.05) return 0;
  return d0 > 0 ? 1 : -1;
}

function stepBall(W, b, h) {
  const g = W.d.g;
  if (b.st === 'ramp') { stepRamp(W, b, h); return; }
  if (b.st !== 'free') return;
  const x0 = b.x, y0 = b.y;
  b.vy -= g * h;
  const damp = 1 - 0.05 * h; b.vx *= damp; b.vy *= damp;
  b.x += b.vx * h; b.y += b.vy * h;
  // the plunger is the floor of the shooter lane
  if (b.x > TABLE.LANE[0] - 0.4 && b.y < 12) {
    const top = 4.25 - W.plunger.pull * 2.8;
    if (b.y - BR < top) { b.y = top + BR; if (b.vy < 0) b.vy = -b.vy * 0.18; if (Math.abs(b.vy) < 4) b.vy = 0; }
    if (b.x - BR < TABLE.LANE[0]) { b.x = TABLE.LANE[0] + BR; b.vx = Math.abs(b.vx) * 0.3; }
    if (b.x + BR > TABLE.LANE[1]) { b.x = TABLE.LANE[1] - BR; b.vx = -Math.abs(b.vx) * 0.3; }
  }
  collideStatic(W, b);
  for (let i = 0; i < W.fl.length; i++) collideFlipper(W, b, W.fl[i]);
  // switches
  const S = TABLE.sensors;
  for (let i = 0; i < S.length; i++) { const c = crossed(S[i], x0, y0, b.x, b.y); if (c) sensor(W, b, S[i], c); }
  // ramp mouth: the ball goes up onto the ramp when it crosses the mouth heading up the table
  const M = TABLE.rampMouth;
  if (y0 < M.y && b.y >= M.y && b.vy > 0 && b.x > M.x0 && b.x < M.x1) { b.st = 'ramp'; b.rs = 0.2; b.rv = Math.max(10, b.vy * 0.97); b.rentry = b.rv; snd('rampin', b.rv); }
  // scoop
  const sc = TABLE.scoop, sdx = b.x - sc.x, sdy = b.y - sc.y;
  if (sdx * sdx + sdy * sdy < sc.r * sc.r && W.scoopBall == null) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 430) { b.st = 'scoop'; b.hold = 0; b.vx = b.vy = 0; W.scoopBall = b.id; scoopIn(W, b); }
  }
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 620) { b.vx *= 620 / sp; b.vy *= 620 / sp; }
  b.speed = sp;
  if (b.y < -3.5) drain(W, b);
}
function stepRamp(W, b, h) {
  const R = TABLE.ramp;
  rampAt(R, b.rs, _o);
  // gravity along the path: the table's lean on the y part, full weight on the climb
  const a = -W.d.g * _o.ty - 981 * _o.tz;
  b.rv += a * h; b.rv -= b.rv * 0.22 * h;
  b.rs += b.rv * h;
  if (b.rs <= 0) {
    // rolled back down: off the lip, heading back toward the flippers
    rampAt(R, 0, _o);
    b.st = 'free'; b.x = _o.x; b.y = _o.y - 0.8; b.z = 0; b.vx = (Math.random() - 0.5) * 12; b.vy = -Math.max(20, Math.abs(b.rv) * 0.9);
    emit(W, 'rampfail', b.x, b.y); snd('rampfail', 1);
    return;
  }
  if (b.rs >= R.L) {
    rampAt(R, R.L, _o);
    const l = Math.hypot(_o.tx, _o.ty) || 1, v = Math.max(40, b.rv * 0.85);
    b.st = 'free'; b.x = _o.x; b.y = _o.y; b.z = 0; b.vx = _o.tx / l * v; b.vy = _o.ty / l * v;
    rampMade(W, b);
    return;
  }
  rampAt(R, b.rs, _o);
  b.x = _o.x; b.y = _o.y; b.z = _o.z;
  b.speed = Math.abs(b.rv);
}

function tick(W, input) {
  const h0 = TICK * W.timeScale;
  const live = !W.tilted && (W.phase === 'play' || W.phase === 'plunge');
  // flippers follow the buttons
  W.fl[0].held = live && input.left; W.fl[1].held = live && input.right;
  for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; b.px = b.x; b.py = b.y; b.pz = b.z; }
  W.spin.pa = W.spin.a; W.plunger.ppull = W.plunger.pull; W.gates[0].pa = W.gates[0].a; W.gates[1].pa = W.gates[1].a;
  for (let i = 0; i < W.fl.length; i++) W.fl[i].pth = W.fl[i].th;
  // how many sub-steps keep every move under STEP_MAX
  let vmax = 0;
  for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; if (b.on && b.st === 'free') { const v = Math.hypot(b.vx, b.vy) + 30; if (v > vmax) vmax = v; } }
  // a held flipper may be at full coil speed within this tick: budget for it before it moves
  for (let i = 0; i < W.fl.length; i++) { const f = W.fl[i]; const w = Math.max(Math.abs(f.w), f.held ? FLIP_MAX : 0) * f.def.len; if (w > 0) vmax += w; }
  const n = clamp(Math.ceil(vmax * h0 / STEP_MAX), 1, 16), h = h0 / n;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < W.fl.length; i++) flipperPhys(W, W.fl[i], h);
    for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; if (b.on) stepBall(W, b, h); }
    for (let i = 0; i < W.balls.length; i++) {
      const a = W.balls[i]; if (!a.on || a.st !== 'free') continue;
      for (let j = i + 1; j < W.balls.length; j++) { const c = W.balls[j]; if (c.on && c.st === 'free') collideBalls(W, a, c); }
    }
  }
  for (let i = 0; i < W.fl.length; i++) if (W.fl[i].hitT > 0) W.fl[i].hitT -= h0;
  // ball search: a ball that has stopped dead somewhere it should not be gets a nudge from the coils
  for (let i = 0; i < W.balls.length; i++) {
    const b = W.balls[i]; if (!b.on) continue;
    b.age += h0;
    if (b.st !== 'free' || (b.x > LANE_X && b.y < 12)) { b.still = 0; continue; }
    const mv = Math.abs(b.x - b.sx) + Math.abs(b.y - b.sy);
    if (mv > 0.4) { b.sx = b.x; b.sy = b.y; b.still = 0; }
    else if ((b.still = (b.still || 0) + h0) > 3.5 && !W.fl[0].held && !W.fl[1].held) { b.still = 0; b.vx += (Math.random() - 0.5) * 120; b.vy += 90 + Math.random() * 60; emit(W, 'search', b.x, b.y); snd('kick'); }
  }
  // spinner: spins with friction, scores each half turn
  const sp = W.spin;
  if (Math.abs(sp.w) > 0.01) {
    const before = Math.floor(sp.a / Math.PI);
    sp.a += sp.w * h0; sp.w *= Math.exp(-h0 * 1.15); if (Math.abs(sp.w) < 1.2) sp.w *= Math.exp(-h0 * 4);
    const after = Math.floor(sp.a / Math.PI);
    if (after !== before) spinScore(W);
  }
  // plunger
  const P = W.plunger;
  if (P.held && W.phase !== 'over') P.pull = Math.min(1, P.pull + h0 / 0.85);
  else if (P.pull > 0 && !P.held) { P.pull = Math.max(0, P.pull - h0 * 30); }
  if (P.fireT > 0) P.fireT -= h0;
  // the gate flap swings when the ball goes through
  for (let k = 0; k < 2; k++) { const G = W.gates[k]; G.a += G.w * h0; G.w -= G.a * 260 * h0; G.w *= Math.exp(-h0 * 5); if (G.a < 0) { G.a = 0; G.w = Math.abs(G.w) * 0.3; } }
  for (let i = 0; i < W.balls.length; i++) {
    const b = W.balls[i];
    if (!b.on || b.st !== 'free' || b.y < 81.5 || b.y > 85.5 || b.vy < 30) continue;
    if (b.x > LANE_X) { if (W.gates[0].w < 2) W.gates[0].w = 7 + b.vy * 0.02; if (!b.passedGate) { b.passedGate = true; gatePassed(W, b); } }
    else if (b.x < -18.4 && W.gates[1].w < 2) W.gates[1].w = 7 + b.vy * 0.02;
  }
  // scoop holds then kicks out
  if (W.scoopBall != null) {
    const b = W.balls[W.scoopBall];
    b.hold += h0;
    if (b.hold >= (W.scoopHold || 1.0)) scoopKick(W, b);
  }
  W.t += h0;
}

/* ------------------------------------------------------------ rules */
export function fmt(v) {
  v = Math.round(v); const s = String(v); let o = '';
  for (let i = 0; i < s.length; i++) { if (i && (s.length - i) % 3 === 0) o += ','; o += s[i]; }
  return o;
}
function award(W, pts, x, y, tag) {
  if (W.tilted) return;
  W.score += pts;
  if (x != null && pts >= 1000) pop(W, x, y, pts);
  if (!W.replayDone && W.score >= W.replay && W.cfg.mode === 'classic' && !W.attract) { W.replayDone = true; W.extra++; dmdShow('EXTRA BALL', 'REPLAY AT ' + fmtShort(W.replay), 2.2, 'flash'); snd('extra'); hap('success', 0.8); }
}
function fmtShort(v) { return v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M' : Math.round(v / 1000) + 'K'; }
function shot(W, name, x, y) {
  // combos: any two major shots inside three seconds chain
  if (W.comboT > 0 && W.lastShot) {
    W.combo++;
    if (W.combo >= 2) {
      W.bestCombo = Math.max(W.bestCombo || 0, W.combo);
      const v = W.combo * 25000;
      award(W, v, x, y);
      W.stats.combos++;
      dmdShow(W.combo + ' WAY COMBO', '+' + fmt(v), 1.4, 'zoom'); snd('combo', W.combo); hap('boost', 0.6);
      emit(W, 'combo', x, y, W.combo);
    }
  } else W.combo = 1;
  W.comboT = 3.0; W.lastShot = name;
}
function sensor(W, b, sn, side) {
  switch (sn.kind) {
    case 'lane': {
      if (side < 0 && b.vy < 0) {
        // rolling down through a top lane
        const i = sn.id;
        award(W, 2500, b.x, b.y);
        W.stats.lanes++; W.bonus.lanes++;
        if (W.skillOpen) {
          W.skillOpen = false;
          if (i === W.skillLane) { award(W, 150000, b.x, b.y); W.stats.skill++; dmdShow('SKILL SHOT', '150,000', 2.0, 'flash'); snd('jackpot'); hap('success', 0.9); emit(W, 'skill', b.x, b.y); if (VIEW && VIEW.moment) VIEW.moment('skill'); }
        }
        if (!W.lane[i]) { W.lane[i] = true; W.lampFlash[TABLE.L.lane[i]] = 1; snd('lane', i); }
        else snd('roll', 1);
        if (W.lane.every((v) => v)) {
          W.lane.fill(false);
          W.bonusX = Math.min(6, W.bonusX + 1);
          award(W, 15000, 0, 82);
          dmdShow('MELA COMPLETE', 'BONUS ' + W.bonusX + 'X', 1.6, 'zoom'); snd('lanes'); hap('boost', 0.6);
          for (let k = 0; k < 4; k++) W.lampFlash[TABLE.L.lane[k]] = 1.5;
        }
      }
      break;
    }
    case 'spinner': {
      const v = Math.abs(b.vy) + Math.abs(b.vx) * 0.3;
      W.spin.w += (b.vy > 0 ? 1 : -1) * clamp(v * 0.12, 4, 70);
      emit(W, 'spinner', b.x, b.y, v); snd('spinin', v);
      break;
    }
    case 'orbit':
      if (b.vy > 0) {
        W.stats.orbits++;
        let v = 10000;
        if (W.modeOn === 1) v = 50000;
        award(W, v, b.x, b.y);
        if (W.mb) jackpot(W, b, 'orbit');
        shot(W, 'orbit', b.x, b.y);
        snd('orbit'); emit(W, 'orbit', b.x, b.y);
        W.lampFlash[TABLE.L.orbit] = 1;
      }
      break;
    case 'inlane':
      award(W, 1000, b.x, b.y); W.lampFlash[TABLE.L.inlane[sn.id]] = 1; snd('roll', 0.6);
      break;
    case 'outlane':
      if (b.vy < 0) { award(W, 2500, b.x, b.y); W.lampFlash[TABLE.L.outlane[sn.id]] = 1; snd('outlane'); if (W.saveT <= 0 && !W.mb && !W.attract) dmdShow('OUTLANE', W.saveT > 0 ? 'BALL SAVE IS ON' : 'HOLD ON...', 0.9, 'flash'); }
      break;
    default: break;
  }
}
function spinScore(W) {
  const v = W.modeOn === 1 ? 1500 : 120;
  award(W, v); W.stats.spins++; W.bonus.spins++;
  W.spin.count++;
  W.lampFlash[TABLE.L.spin] = 0.8;
  snd('spin', Math.abs(W.spin.w));
  if (W.modeOn === 1) W.modeTotal += v;
}
function bumperHit(W, b, id, nx, ny, vn) {
  const B = W.bump[id];
  // the pop bumper's ring slams down: reflect, then kick out hard
  bounce(b, nx, ny, 0.4, 0.02);
  const out = b.vx * nx + b.vy * ny, want = 175 * W.d.kick;
  if (out < want) { b.vx += nx * (want - out); b.vy += ny * (want - out); }
  if (W.t - b.lastBump < 0.04) return;
  b.lastBump = W.t;
  B.flash = 1; B.ring = 1; B.hits++;
  const v = W.modeOn === 3 ? 7500 : 1000;
  award(W, v, b.x, b.y);
  if (W.modeOn === 3) W.modeTotal += v;
  W.stats.bumpers++; W.bonus.bumpers++;
  emit(W, 'bumper', TABLE.bumpers[id].x, TABLE.bumpers[id].y, id, vn);
  snd('bumper', id); hap('hit', 0.45);
  if (ARC) ARC.shake = Math.max(ARC.shake, 1.2);
}
function targetDown(W, id, b) {
  const t = W.tgt[id];
  t.down = true; t.t = 0; t.flash = 1;
  TABLE.targets[id].seg.on = false;
  const v = W.modeOn === 2 ? 25000 : 2500;
  award(W, v, b.x, b.y);
  if (W.modeOn === 2) W.modeTotal += v;
  W.stats.targets++; W.bonus.targets++;
  W.lampFlash[TABLE.L.target[id]] = 1;
  emit(W, 'target', TABLE.targets[id].x, (TABLE.targets[id].y0 + TABLE.targets[id].y1) / 2, id);
  snd('target', id); hap('hit', 0.5);
  if (W.tgt.every((x) => x.down)) {
    award(W, 25000, -12, 36);
    if (W.modeOn === 2) { setTimeout0(W, () => resetTargets(W), 0.15); }
    else {
      W.modeLit = true;
      dmdShow('LANTERNS LIT', 'SHOOT THE SCOOP', 1.8, 'zoom'); snd('lit'); hap('boost', 0.5);
      W.tgtResetT = 1.4;
    }
  } else if (W.modeOn === 2) dmdShow('LANTERN ' + (W.tgt.filter((x) => x.down).length) + ' OF 3', '+' + fmt(v), 0.9, 'flash');
}
function resetTargets(W) {
  for (let i = 0; i < W.tgt.length; i++) { W.tgt[i].down = false; TABLE.targets[i].seg.on = true; W.tgt[i].t = 0; }
  // a target popping up under a ball pushes it clear
  for (let k = 0; k < W.balls.length; k++) { const b = W.balls[k]; if (b.on && b.st === 'free' && b.x < -12.9 && b.x > -16.2 && b.y > 29 && b.y < 39.5) { b.x = -12.9; b.vx = Math.abs(b.vx) + 20; } }
  emit(W, 'targetsup', -14.9, 35); snd('reset');
}
function setTimeout0(W, fn, t) { W.timers = W.timers || []; W.timers.push({ t, fn }); }
function rampMade(W, b) {
  W.stats.ramps++; W.bonus.ramps++; W.ramps++; W.rampsTotal++;
  let v = 15000;
  if (W.modeOn === 0) { v = 75000; W.modeTotal += v; }
  award(W, v, -17.5, 32);
  shot(W, 'ramp', -17.5, 32);
  emit(W, 'ramp', b.x, b.y); snd('ramp'); hap('boost', 0.45);
  W.lampFlash[TABLE.L.ramp] = 1;
  if (W.mb) { jackpot(W, b, 'ramp'); return; }
  if (!W.mbLit) {
    W.jugglers = Math.min(3, W.jugglers + 1);
    if (W.jugglers >= 3) { W.mbLit = true; dmdShow('MULTIBALL LIT', 'SHOOT THE SCOOP', 2.0, 'zoom'); snd('lit'); }
    else dmdShow('JUGGLER RAMP', W.jugglers + ' OF 3 FOR MULTIBALL', 1.2, 'slide');
  } else dmdShow('JUGGLER RAMP', 'MULTIBALL IS LIT', 1.0, 'slide');
}
function jackpot(W, b, where) {
  if (!W.mb) return;
  const v = W.jackpotV;
  award(W, v, b.x, b.y);
  W.jackpots++; W.stats.jackpots++;
  W.jackpotV += 50000;
  dmdShow('JACKPOT', fmt(v), 2.2, 'jackpot'); snd('jackpot'); hap('success', 1);
  emit(W, 'jackpot', b.x, b.y, v);
  if (VIEW && VIEW.moment) VIEW.moment('jackpot', b);
  slowMo(W, 0.32, 0.7);
  if (W.jackpots % 3 === 0) { W.superLit = true; setTimeout0(W, () => dmdShow('SUPER JACKPOT LIT', 'SHOOT THE SCOOP', 1.8, 'zoom'), 2.3); }
}
function slowMo(W, k, t) { if (W.attract || (ARC && ARC.reducedMotion)) return; W.timeScale = k; W.slowT = t; }
function scoopIn(W, b) {
  W.stats.scoops++;
  award(W, 8000, TABLE.scoop.x, TABLE.scoop.y);
  shot(W, 'scoop', TABLE.scoop.x, TABLE.scoop.y);
  emit(W, 'scoop', TABLE.scoop.x, TABLE.scoop.y); snd('scoop');
  W.scoopHold = 1.0;
  if (W.tilted || W.attract && W.mb) return;
  if (W.mb && W.superLit) {
    W.superLit = false;
    const v = 1000000 + W.jackpots * 100000;
    award(W, v, TABLE.scoop.x, TABLE.scoop.y); W.stats.jackpots++;
    dmdShow('SUPER JACKPOT', fmt(v), 3.0, 'jackpot'); snd('super'); hap('heavy', 1);
    emit(W, 'super', b.x, b.y, v); if (VIEW && VIEW.moment) VIEW.moment('super', b);
    slowMo(W, 0.25, 1.0); W.scoopHold = 2.2;
    return;
  }
  if (W.mbLit && !W.mb) { startMultiball(W); W.scoopHold = 2.6; return; }
  if (W.modeLit && W.modeOn < 0) {
    W.modeLit = false; W.modeOn = W.modeIdx; W.modeT = 30; W.modeTotal = 0;
    W.stats.modes++;
    dmdShow(MODE_NAMES[W.modeOn], ['RAMPS 75,000', 'SPINNER 1,500', 'TARGETS 25,000', 'BUMPERS 7,500'][W.modeOn], 2.4, 'mode');
    snd('mode'); hap('boost', 0.8); emit(W, 'mode', b.x, b.y, W.modeOn); if (VIEW && VIEW.moment) VIEW.moment('mode', b);
    W.scoopHold = 2.2;
    resetTargets(W);
    return;
  }
  dmdShow('CAROUSEL', W.modeOn >= 0 ? MODE_SHORT[W.modeOn] + ' RUNNING' : 'LIGHT THE LANTERNS', 1.0, 'slide');
}
function scoopKick(W, b) {
  W.scoopBall = null;
  b.st = 'free'; b.x = TABLE.scoop.x - 2.1; b.y = TABLE.scoop.y - 1.6; b.z = 0;
  b.vx = -175 - Math.random() * 30; b.vy = -205 - Math.random() * 40;
  emit(W, 'kick', b.x, b.y); snd('kick'); hap('hit', 0.6);
  if (ARC) ARC.shake = Math.max(ARC.shake, 2);
}
function startMultiball(W) {
  W.mbLit = false; W.mb = true; W.jugglers = 0; W.jackpots = 0; W.stats.multiballs++;
  W.saveT = Math.max(W.saveT, 12); W.saveArmed = false;
  dmdShow('JUGGLER MULTIBALL', 'JACKPOTS ON RAMP AND ORBIT', 3.0, 'multiball');
  snd('multiball'); hap('heavy', 1);
  emit(W, 'multiball', TABLE.scoop.x, TABLE.scoop.y);
  if (VIEW && VIEW.moment) VIEW.moment('multiball');
  W.q.push(1, 1);
}
function gatePassed(W, b) {
  // a fresh plunge: arm the ball save and the skill shot
  if (W.attract) return;
  if (W.saveArmed && !W.mb) { W.saveT = W.d.save; W.saveArmed = false; }
}
function drain(W, b) {
  b.on = false; b.st = 'free';
  W.stats.drains++;
  const live = activeBalls(W);
  emit(W, 'drain', b.x, -2);
  if (W.attract) { if (live === 0) serve(W, true); return; }
  if (W.saveT > 0 && !W.tilted) {
    W.stats.saves++;
    dmdShow('BALL SAVED', '', 1.6, 'flash'); snd('save'); hap('tap', 0.6);
    W.q.push(1);
    return;
  }
  if (W.cfg.mode === 'rush' && W.rushT > 0 && !W.tilted) {
    if (live === 0) { W.rushT = Math.max(0, W.rushT - 3); dmdShow('BALL SAVED', 'MINUS 3 SECONDS', 1.4, 'flash'); snd('save'); W.q.push(1); }
    return;
  }
  if (W.cfg.mode === 'free') { if (live === 0) { dmdShow('BALL SAVED', 'FREE PLAY', 1.2, 'flash'); snd('save'); W.q.push(1); } return; }
  if (W.mb) {
    if (live <= 1) { W.mb = false; W.superLit = false; dmdShow('MULTIBALL OVER', 'JACKPOTS ' + W.jackpots, 1.6, 'slide'); snd('mbend'); }
    if (live > 0) return;
  }
  if (live > 0 || W.q.length) return;
  // the last ball is gone: end of ball bonus
  snd('drain'); hap('fail', 0.8);
  if (VIEW && VIEW.moment) VIEW.moment('drain');
  endBall(W);
}
function activeBalls(W) { let n = 0; for (let i = 0; i < W.balls.length; i++) if (W.balls[i].on) n++; return n; }
function endBall(W) {
  W.phase = 'bonus'; W.phaseT = 0;
  W.modeOn = -1; W.mb = false; W.mbLit = W.mbLit && false;
  const B = W.bonus;
  const items = W.tilted ? [] : [['LANES', B.lanes * 1000], ['TARGETS', B.targets * 1500], ['RAMPS', B.ramps * 5000], ['BUMPERS', B.bumpers * 200], ['SPINS', B.spins * 20]].filter((x) => x[1] > 0);
  let total = 0; items.forEach((x) => { total += x[1]; });
  W.bonusRun = { items, i: 0, t: 0, total, x: W.bonusX, done: false };
}
function serve(W, auto) {
  // put a ball on the plunger
  for (let i = 0; i < W.balls.length; i++) {
    const b = W.balls[i];
    if (b.on) continue;
    b.on = true; b.st = 'free'; b.x = 23.65; b.y = 4.25 + BR + 0.4; b.z = 0; b.vx = 0; b.vy = 0; b.px = b.x; b.py = b.y; b.pz = 0; b.passedGate = false; b.age = 0;
    if (auto) { W.autoT = 0.55; }
    emit(W, 'serve', b.x, b.y);
    snd('serve');
    return b;
  }
  return null;
}
function newBallInPlay(W) {
  W.phase = 'plunge'; W.phaseT = 0;
  W.tilted = false; W.tiltMeter = 0; W.warnings = 0;
  W.bonusX = 1; W.bonus = { lanes: 0, targets: 0, ramps: 0, spins: 0, bumpers: 0 };
  W.saveArmed = true; W.saveT = 0;
  W.skillLane = Math.floor(Math.random() * 4); W.skillOpen = true;
  W.combo = 0; W.comboT = 0;
  serve(W, false);
}
function launch(W, power, auto) {
  // release the plunger: a ball resting on it flies up the shooter lane
  const P = W.plunger;
  P.fireT = 0.12; P.power = power;
  for (let i = 0; i < W.balls.length; i++) {
    const b = W.balls[i];
    if (!b.on || b.st !== 'free' || b.x < LANE_X || b.y > 9.5) continue;
    // speed at the top of the lane grows evenly with the pull, so a pull picks a lane
    const vc = launchTop(power) + (W.attract ? 0 : (Math.random() - 0.5) * 1.6);
    const v0 = Math.sqrt(2 * W.d.g * (92 - b.y) + vc * vc);
    b.vy = v0; b.vx = 0;
    if (!auto) W.stats.launches++;
    emit(W, 'launch', b.x, b.y, power);
    snd('launch', power); hap(power > 0.6 ? 'heavy' : 'hit', 0.4 + power * 0.6);
    if (W.phase === 'plunge') { W.phase = 'play'; W.phaseT = 0; W.skillT = 4.5; }
    if (VIEW && VIEW.moment && !auto && !W.attract) VIEW.moment('launch', b);
  }
  P.pull = 0;
}
// speed the ball should have along the top rail for a given pull, and the energy the corner takes
// (speed entering the top right corner; below about 53 cm/s the ball leaves the corner early and drops short)
export function launchTop(p) { return 33 + 42 * p; }
function nudge(W, dirx) {
  if (W.tilted || W.phase === 'over') return;
  W.stats.nudges++;
  const k = 46;
  for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; if (b.on && b.st === 'free' && b.x < LANE_X) { b.vx += (dirx || (Math.random() - 0.5)) * 22; b.vy += k * (0.7 + Math.random() * 0.3); } }
  W.tiltMeter += 1;
  emit(W, 'nudge', 0, 0, dirx || 0);
  snd('nudge'); hap('heavy', 0.7);
  if (ARC) ARC.shake = Math.max(ARC.shake, 5);
  if (W.attract) return;
  if (W.tiltMeter > W.d.tilt) {
    W.warnings++; W.tiltMeter = W.d.tilt * 0.55;
    if (W.warnings >= W.d.warn) {
      W.tilted = true; W.saveT = 0;
      dmdShow('TILT', 'FLIPPERS ARE DEAD', 99, 'tilt'); snd('tilt'); hap('fail', 1);
    } else { dmdShow('DANGER', 'TILT WARNING ' + W.warnings + ' OF ' + (W.d.warn - 1), 1.6, 'flash'); snd('warn'); }
  }
}

/* ------------------------------------------------------------ lamps */
let LV = null;
function setLamp(i, v) { LV[i] = v; }
let BT = 0;
function blink(r) { return Math.sin(BT * TAU * r) > 0 ? 1 : 0.08; }
function lamps(W, dt) {
  const T = TABLE, L = T.L, V = W.lampV, t = W.t;
  BT = t;
  const set = setLamp; LV = V;
  if (W.attract) {
    // a chase that runs round the whole table
    for (let i = 0; i < V.length; i++) { const lp = T.lamps[i]; V[i] = 0.15 + 0.85 * Math.max(0, Math.sin(t * 3 - lp.y * 0.12 + Math.sin(lp.x * 0.3) * 0.6)) ** 3; }
  } else {
    for (let i = 0; i < 4; i++) set(L.lane[i], W.lane[i] ? 1 : (W.skillOpen && i === W.skillLane && W.phase === 'plunge' ? blink(4) : 0.06));
    if (W.skillOpen && W.phase === 'play') for (let i = 0; i < 4; i++) if (i === W.skillLane) set(L.lane[i], blink(6));
    for (let i = 0; i < 3; i++) set(L.target[i], W.tgt[i].down ? 1 : (W.modeOn === 2 ? blink(3) : 0.18));
    set(L.ramp, W.mb ? blink(5) : W.modeOn === 0 ? blink(3) : W.mbLit ? 0.5 : 0.12);
    for (let i = 0; i < 3; i++) set(L.jug[i], W.mbLit || W.mb ? blink(2) : i < W.jugglers ? 1 : 0.08);
    set(L.orbit, W.mb ? blink(5) : W.modeOn === 1 ? blink(3) : 0.12);
    set(L.scoop, W.superLit || W.mbLit || W.modeLit ? blink(4) : 0.1);
    for (let i = 0; i < 4; i++) set(L.mode[i], W.modeOn === i ? blink(3) : W.modesDone[i] ? 1 : (W.modeIdx === i && W.modeLit ? blink(1.5) : 0.08));
    for (let i = 0; i < 5; i++) set(L.bonus[i], W.bonusX >= i + 2 ? 1 : 0.06);
    set(L.again, W.extra > 0 ? 1 : W.saveT > 0 ? (W.saveT < 3 ? blink(6) : blink(1.5)) : 0.06);
    set(L.save, W.saveT > 0 ? 1 : 0.06);
    set(L.inlane[0], 0.1); set(L.inlane[1], 0.1);
    set(L.outlane[0], 0.08); set(L.outlane[1], 0.08);
    set(L.spin, W.modeOn === 1 ? blink(3) : Math.min(1, 0.12 + Math.abs(W.spin.w) * 0.03));
    set(L.jackpot, W.mb ? blink(4) : W.superLit ? blink(8) : 0.06);
    if (W.tilted) for (let i = 0; i < V.length; i++) V[i] = 0.02;
  }
  for (let i = 0; i < V.length; i++) { if (W.lampFlash[i] > 0) { V[i] = Math.max(V[i], Math.min(1, W.lampFlash[i])); W.lampFlash[i] = Math.max(0, W.lampFlash[i] - dt * 1.6); } }
}

/* ------------------------------------------------------------ the dot matrix display */
// 128 x 32 dots, one byte of brightness each. Our own 5 x 7 pixel font.
export const DMD = { w: 128, h: 32, buf: new Uint8Array(128 * 32), ver: 0, q: [], cur: null, t: 0, acc: 0 };
const FONT = (() => {
  const raw = {
    '0': '0E11131519110E', '1': '040C040404040E', '2': '0E11010204081F', '3': '1F02040201110E', '4': '02060A121F0202', '5': '1F101E0101110E', '6': '0608101E11110E', '7': '1F010204080808', '8': '0E11110E11110E', '9': '0E11110F01020C',
    A: '0E1111111F1111', B: '1E11111E11111E', C: '0E11101010110E', D: '1C12111111121C', E: '1F10101E10101F', F: '1F10101E101010', G: '0E11101711110F', H: '1111111F111111', I: '0E04040404040E', J: '0702020202120C', K: '11121418141211', L: '1010101010101F', M: '111B1515111111', N: '11111915131111', O: '0E11111111110E', P: '1E11111E101010', Q: '0E11111115120D', R: '1E11111E141211', S: '0F10100E01011E', T: '1F040404040404', U: '1111111111110E', V: '11111111110A04', W: '1111111515150A', X: '11110A040A1111', Y: '1111110A040404', Z: '1F01020408101F',
    ' ': '00000000000000', '.': '0000000000000C', ',': '00000000000C04', '!': '04040404040004', ':': '000C0C000C0C00', '-': '0000001F000000', '+': '0004041F040400', '/': '01010204081010', "'": '0C040800000000', '?': '0E110102040004', '*': '0004150E150400', 'x': '0000110A040A11', '%': '18190204081303', '#': '0A0A1F0A1F0A0A',
  };
  const F = {};
  Object.keys(raw).forEach((k) => {
    const rows = []; for (let i = 0; i < 7; i++) rows.push(parseInt(raw[k].substr(i * 2, 2), 16) || 0);
    let l = 5, r = -1; rows.forEach((v) => { for (let c = 0; c < 5; c++) if (v & (16 >> c)) { if (c < l) l = c; if (c > r) r = c; } });
    const fixed = /[0-9]/.test(k);
    F[k] = { rows, l: fixed || r < 0 ? 0 : l, w: fixed ? 5 : r < 0 ? 3 : r - l + 1 };
  });
  return F;
})();
function dClear() { DMD.buf.fill(0); }
function dDot(x, y, v) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= 128 || y >= 32) return; const i = y * 128 + x; if (v > DMD.buf[i]) DMD.buf[i] = v; }
function textW(s, sc) { let w = 0; for (let i = 0; i < s.length; i++) { const g = FONT[s[i]] || FONT['?']; w += (g.w + 1) * sc; } return w - sc; }
function dText(s, x, y, sc, v) {
  sc = sc || 1; v = v == null ? 255 : v;
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]] || FONT['?'];
    for (let r = 0; r < 7; r++) { const row = g.rows[r]; if (!row) continue; for (let c = 0; c < 5; c++) if (row & (16 >> c)) { const cx = x + (c - g.l) * sc, cy = y + r * sc; for (let a = 0; a < sc; a++) for (let b2 = 0; b2 < sc; b2++) dDot(cx + a, cy + b2, v); } }
    x += (g.w + 1) * sc;
  }
}
function dCenter(s, y, sc, v) { sc = sc || 1; let w = textW(s, sc); if (w > 126 && sc > 1) { sc = 1; w = textW(s, 1); y += 3; } dText(s, Math.round(64 - w / 2), y, sc, v); }
function dmdShow(a, b, dur, fx) {
  if (DMD.q.length > 4) DMD.q.shift();
  DMD.q.push({ a, b: b || '', dur: dur || 1.5, fx: fx || 'flash', t: 0 });
  DMD.cur = null;
}
function dmdUpdate(W, dt, arc) {
  DMD.t += dt; DMD.acc += dt;
  if (DMD.acc < 1 / 30) return;
  const step = DMD.acc; DMD.acc = 0;
  // the queue: an event takes the screen for its time, then the score comes back
  if (!DMD.cur && DMD.q.length) DMD.cur = DMD.q.shift();
  const c = DMD.cur;
  dClear();
  const t = DMD.t;
  if (c) {
    c.t += step;
    const k = c.t / c.dur;
    if (c.fx === 'jackpot' || c.fx === 'multiball' || c.fx === 'mode') {
      // radiating rays and a ferris wheel of dots behind the words
      const n = c.fx === 'multiball' ? 16 : 12, r0 = 6 + (c.t * 40) % 30;
      for (let i = 0; i < n; i++) { const a = i / n * TAU + c.t * (c.fx === 'mode' ? 1.2 : 2.4); for (let rr = r0; rr < r0 + 30; rr += 2) dDot(64 + Math.cos(a) * rr * 1.6, 16 + Math.sin(a) * rr * 0.55, 60); }
      if (c.fx === 'multiball') { for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + c.t * 1.5; dDot(64 + Math.cos(a) * 15, 16 + Math.sin(a) * 15 * 0.9, 120); } }
      const on = c.fx !== 'jackpot' || Math.floor(c.t * 8) % 2 === 0 || c.t > 0.8;
      if (on) dCenter(c.a, 3, 2, 255);
      dCenter(c.b, 23, 1, 210);
    } else if (c.fx === 'zoom') {
      const s = c.t < 0.25 ? 1 : 2;
      dCenter(c.a, s === 2 ? 4 : 8, s, 255); dCenter(c.b, 23, 1, c.t > 0.3 ? 200 : 0);
    } else if (c.fx === 'slide') {
      const off = Math.max(0, 1 - c.t * 5) * 128;
      dText(c.a, Math.round(64 - textW(c.a, 1) / 2 + off), 7, 1, 255);
      dText(c.b, Math.round(64 - textW(c.b, 1) / 2 - off), 18, 1, 190);
    } else if (c.fx === 'tilt') {
      if (Math.floor(c.t * 3) % 2 === 0) dCenter(c.a, 4, 2, 255);
      dCenter(c.b, 23, 1, 160);
    } else if (c.fx === 'bonus') {
      dCenter(c.a, 3, 1, 230); dCenter(c.b, 13, 2, 255);
    } else {
      const on = Math.floor(c.t * 7) % 2 === 0 || c.t > 0.7;
      if (on) dCenter(c.a, c.b ? 4 : 9, 2, 255);
      if (c.b) dCenter(c.b, 23, 1, 200);
    }
    if (k >= 1) DMD.cur = null;
  } else if (W && !W.attract && arc && (arc.state === 'play' || arc.state === 'pause')) {
    // the score screen
    const left = W.cfg.mode === 'rush' ? 'TIME ' + Math.ceil(W.rushT) : W.cfg.mode === 'free' ? 'FREE PLAY' : 'BALL ' + W.ballNo;
    dText(left, 1, 1, 1, 170);
    let right = W.mb ? 'MULTIBALL' : W.modeOn >= 0 ? MODE_SHORT[W.modeOn] + ' ' + Math.ceil(W.modeT) : W.bonusX > 1 ? W.bonusX + 'x' : '';
    if (W.tilted) right = 'TILT';
    if (right) dText(right, 127 - textW(right, 1), 1, 1, W.mb || W.modeOn >= 0 ? (Math.floor(t * 3) % 2 ? 255 : 150) : 170);
    const sc = fmt(W.score);
    const big = textW(sc, 2) <= 126 ? 2 : 1;
    dCenter(sc, big === 2 ? 10 : 13, big, 255);
    let low;
    if (W.phase === 'plunge') low = W.skillOpen ? 'SKILL SHOT: LANE ' + 'MELA'[W.skillLane] : 'PULL AND LAUNCH';
    else if (W.mb) low = 'JACKPOT ' + fmtShort(W.jackpotV) + (W.superLit ? ' SUPER LIT' : '');
    else if (W.modeOn >= 0) low = 'MODE ' + fmt(W.modeTotal);
    else if (W.mbLit) low = 'MULTIBALL IS LIT';
    else if (W.modeLit) low = MODE_SHORT[W.modeIdx] + ' IS LIT';
    else low = 'RAMPS ' + W.jugglers + ' OF 3';
    dCenter(low, 25, 1, 150);
  } else {
    // attract: title, high scores, last score
    const cyc = t % 16;
    if (cyc < 5) {
      for (let i = 0; i < 40; i++) { const a = i / 40 * TAU + t * 0.7; dDot(18 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, 70); if (i % 5 === 0) for (let rr = 0; rr < 13; rr += 2) dDot(18 + Math.cos(a) * rr, 16 + Math.sin(a) * rr, 45); }
      dText('MELA', 40, 3, 2, 255); dText('PINBALL', 40, 20, 1, 220);
      if (Math.floor(t * 2) % 2) dText('PLAY', 96, 20, 1, 160);
    } else if (cyc < 11) {
      const m = (W && W.cfg && HS_DEFAULT[W.cfg.mode]) ? W.cfg.mode : 'classic';
      const list = highScores(m);
      dCenter('HIGH SCORES', 1, 1, 230);
      for (let i = 0; i < 3; i++) { const e = list[i]; if (!e) break; const s1 = (i + 1) + ' ' + e.n; dText(s1, 6, 10 + i * 7, 1, 200); const s2 = fmt(e.s); dText(s2, 122 - textW(s2, 1), 10 + i * 7, 1, 200); }
    } else {
      dCenter('A NIGHT AT', 2, 1, 200); dCenter('THE MELA', 11, 2, 255);
      if (LAST.score != null) dCenter('LAST ' + fmt(LAST.score), 25, 1, 160);
    }
  }
  DMD.ver++;
}
const LAST = { score: null };

/* ------------------------------------------------------------ high scores */
const HS_CACHE = {};
function highScores(mode) {
  if (HS_CACHE[mode]) return HS_CACHE[mode];
  const store = ARC ? ARC.store : null;
  const raw = store ? store.get('arcade.mela-pinball.hs.' + mode, null) : null;
  HS_CACHE[mode] = Array.isArray(raw) && raw.length ? raw : (HS_DEFAULT[mode] || HS_DEFAULT.classic).map((x) => ({ s: x[0], n: x[1] }));
  return HS_CACHE[mode];
}
function addHighScore(mode, score) {
  if (!HS_DEFAULT[mode]) return -1;
  const list = highScores(mode).slice();
  let rank = list.findIndex((e) => score > e.s);
  if (rank < 0 && list.length < 5) rank = list.length;
  if (rank < 0) return -1;
  list.splice(rank, 0, { s: score, n: 'YOU', d: Date.now() });
  list.length = Math.min(list.length, 5);
  if (ARC) ARC.store.set('arcade.mela-pinball.hs.' + mode, list);
  HS_CACHE[mode] = list;
  return rank;
}

/* ------------------------------------------------------------ sound */
// Synthesised on the shell's own tiny synth; nothing is loaded.
let rollHum = null, lastSnd = {};
function snd(kind, v) {
  if (!ARC || !ARC.sfx || !W0 || W0.attract) return;
  const s = ARC.sfx, now = W0.t;
  if (lastSnd[kind] != null && now - lastSnd[kind] < 0.03) return;
  lastSnd[kind] = now;
  v = v || 0;
  const k = clamp(v / 400, 0.15, 1);
  switch (kind) {
    case 'flip': s.noise(0.06, { freq: 900, vol: 0.12, filter: 'bandpass' }); s.tone(120, 0.06, { type: 'square', vol: 0.05, slide: 60 }); break;
    case 'flipball': s.tone(210, 0.05, { type: 'triangle', vol: 0.08 * k }); break;
    case 'bumper': s.tone([392, 440, 523][v | 0] || 440, 0.12, { type: 'square', vol: 0.08 }); s.noise(0.08, { freq: 2600, vol: 0.12, filter: 'highpass' }); s.tone(70, 0.1, { type: 'sine', vol: 0.18, slide: 40 }); break;
    case 'sling': s.noise(0.07, { freq: 1800, vol: 0.16, filter: 'bandpass' }); s.tone(95, 0.08, { type: 'sine', vol: 0.15, slide: 50 }); break;
    case 'target': s.tone(660 + (v | 0) * 120, 0.08, { type: 'square', vol: 0.06 }); s.noise(0.05, { freq: 1200, vol: 0.12 }); break;
    case 'reset': s.noise(0.12, { freq: 500, vol: 0.12 }); s.tone(140, 0.12, { type: 'square', vol: 0.05 }); break;
    case 'spin': s.tone(1400 + Math.random() * 200, 0.025, { type: 'square', vol: 0.025 }); break;
    case 'spinin': s.noise(0.04, { freq: 3000, vol: 0.06, filter: 'highpass' }); break;
    case 'lane': s.tone([523, 659, 784, 988][v | 0] || 600, 0.14, { type: 'triangle', vol: 0.09 }); break;
    case 'lanes': [523, 659, 784, 1047].forEach((f, i) => s.tone(f, 0.16, { type: 'triangle', vol: 0.08, delay: i * 0.07 })); break;
    case 'roll': s.tone(880, 0.05, { type: 'sine', vol: 0.04 }); break;
    case 'orbit': s.tone(440, 0.25, { type: 'sawtooth', vol: 0.05, slide: 880 }); break;
    case 'rampin': s.noise(0.3, { freq: 600, vol: 0.06 }); break;
    case 'ramp': [392, 523, 659].forEach((f, i) => s.tone(f, 0.14, { type: 'square', vol: 0.06, delay: i * 0.06 })); break;
    case 'rampfail': s.tone(300, 0.25, { type: 'triangle', vol: 0.05, slide: 150 }); break;
    case 'scoop': s.tone(110, 0.18, { type: 'sine', vol: 0.2, slide: 55 }); s.noise(0.12, { freq: 400, vol: 0.12 }); break;
    case 'kick': s.noise(0.1, { freq: 900, vol: 0.18 }); s.tone(80, 0.1, { type: 'sine', vol: 0.2, slide: 45 }); break;
    case 'launch': s.noise(0.18, { freq: 500 + v * 900, vol: 0.18 }); s.tone(60 + v * 50, 0.15, { type: 'sine', vol: 0.2, slide: 40 }); break;
    case 'serve': s.tone(180, 0.08, { type: 'sine', vol: 0.1 }); s.noise(0.08, { freq: 700, vol: 0.06 }); break;
    case 'combo': for (let i = 0; i < Math.min(5, v); i++) s.tone(660 + i * 110, 0.08, { type: 'square', vol: 0.06, delay: i * 0.05 }); break;
    case 'lit': [784, 988, 1175].forEach((f, i) => s.tone(f, 0.12, { type: 'triangle', vol: 0.08, delay: i * 0.08 })); break;
    case 'jackpot': [523, 659, 784, 1047, 1319].forEach((f, i) => s.tone(f, 0.18, { type: 'square', vol: 0.07, delay: i * 0.08 })); s.noise(0.9, { freq: 2400, vol: 0.06, filter: 'bandpass' }); break;
    case 'super': [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => s.tone(f, 0.22, { type: 'square', vol: 0.07, delay: i * 0.09 })); s.noise(1.6, { freq: 1800, vol: 0.08, filter: 'bandpass' }); break;
    case 'multiball': [262, 330, 392, 523, 392, 523, 659, 784].forEach((f, i) => s.tone(f, 0.16, { type: 'sawtooth', vol: 0.05, delay: i * 0.1 })); break;
    case 'mbend': s.tone(392, 0.3, { type: 'triangle', vol: 0.06, slide: 196 }); break;
    case 'mode': [440, 554, 659, 880].forEach((f, i) => s.tone(f, 0.2, { type: 'sawtooth', vol: 0.05, delay: i * 0.1 })); break;
    case 'extra': [784, 988, 1175, 1568].forEach((f, i) => s.tone(f, 0.2, { type: 'triangle', vol: 0.09, delay: i * 0.1 })); break;
    case 'save': s.tone(880, 0.1, { type: 'triangle', vol: 0.08 }); s.tone(1175, 0.16, { type: 'triangle', vol: 0.08, delay: 0.1 }); break;
    case 'drain': s.tone(330, 0.5, { type: 'triangle', vol: 0.08, slide: 110 }); break;
    case 'outlane': s.tone(220, 0.2, { type: 'square', vol: 0.05, slide: 160 }); break;
    case 'nudge': s.noise(0.14, { freq: 160, vol: 0.3 }); break;
    case 'warn': s.tone(180, 0.3, { type: 'square', vol: 0.1 }); s.tone(180, 0.3, { type: 'square', vol: 0.1, delay: 0.35 }); break;
    case 'tilt': s.tone(110, 1.0, { type: 'sawtooth', vol: 0.12, slide: 50 }); break;
    case 'metal': s.tone(2200 + Math.random() * 600, 0.04, { type: 'sine', vol: 0.05 * k }); break;
    case 'wood': s.noise(0.04, { freq: 700, vol: 0.12 * k }); break;
    case 'rubber': s.tone(150, 0.05, { type: 'sine', vol: 0.12 * k }); break;
    case 'clack': s.tone(3200, 0.03, { type: 'square', vol: 0.05 }); break;
    case 'tick': s.tone(1800, 0.03, { type: 'square', vol: 0.05 }); break;
    case 'bonus': s.tone(600 + v * 40, 0.06, { type: 'square', vol: 0.05 }); break;
    case 'over': [392, 330, 262, 196].forEach((f, i) => s.tone(f, 0.3, { type: 'triangle', vol: 0.08, delay: i * 0.18 })); break;
    default: break;
  }
}
// a quiet fair-ground loop: drone, a tabla-ish pulse and a pentatonic melody, faster in multiball
const MUSIC = { t: 0, step: 0 };
const MEL = [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 12, 9, 7, 4, 2];
function musicTick(W, dt) {
  if (!ARC || ARC.sfx.muted || W.attract || W.phase === 'over') return;
  const bpm = W.mb ? 132 : 108, spb = 60 / bpm / 2;
  MUSIC.t += dt;
  if (MUSIC.t < spb) return;
  MUSIC.t -= spb;
  const s = ARC.sfx, i = MUSIC.step++ % 16;
  const root = W.mb ? 294 : 262;
  if (i % 4 === 0) s.noise(0.08, { freq: 180, vol: 0.05 });
  if (i % 4 === 2) s.noise(0.04, { freq: 2600, vol: 0.02, filter: 'bandpass' });
  if (i % 2 === 0 || W.mb) s.tone(root * Math.pow(2, MEL[(i + (MUSIC.step >> 4) * 3) % 16] / 12), 0.12, { type: 'triangle', vol: 0.022 });
}
function rollSound(W) {
  if (!ARC || W.attract) { if (rollHum) rollHum.set(40, 0); return; }
  if (!rollHum) rollHum = ARC.sfx.hum('triangle');
  let v = 0;
  for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; if (b.on && b.st !== 'scoop') v = Math.max(v, b.speed); }
  const playing = ARC.state === 'play';
  rollHum.set(45 + v * 0.18, playing ? clamp(v / 2500, 0, 0.05) : 0);
}
function hap(kind, s) { if (!ARC || !W0 || W0.attract || typeof ARC.haptic !== 'function') return; try { ARC.haptic(kind, s); } catch (e) { /* no haptics */ } }

/* ------------------------------------------------------------ frame update */
let W0 = null; // the world being played (or the attract demo)
export function world() { return W0; }
function advanceRules(W, dt, IN) {
  // timers that run on game time
  if (W.timers && W.timers.length) for (let i = W.timers.length - 1; i >= 0; i--) { const tm = W.timers[i]; tm.t -= dt; if (tm.t <= 0) { W.timers.splice(i, 1); tm.fn(); } }
  if (W.slowT > 0) { W.slowT -= dt / Math.max(0.2, W.timeScale); if (W.slowT <= 0) W.timeScale = 1; }
  else W.timeScale = Math.min(1, W.timeScale + dt * 3);
  if (W.comboT > 0) { W.comboT -= dt; if (W.comboT <= 0) { W.combo = 0; W.lastShot = ''; } }
  if (W.skillOpen && W.phase === 'play') { W.skillT -= dt; if (W.skillT <= 0) W.skillOpen = false; }
  if (W.saveT > 0 && W.phase === 'play' && W.scoopBall == null) W.saveT = Math.max(0, W.saveT - dt);
  W.tiltMeter = Math.max(0, W.tiltMeter - dt * 0.45);
  if (W.tgtResetT > 0) { W.tgtResetT -= dt; if (W.tgtResetT <= 0) resetTargets(W); }
  for (let i = 0; i < W.tgt.length; i++) { W.tgt[i].t += dt; W.tgt[i].flash = Math.max(0, W.tgt[i].flash - dt * 2); }
  for (let i = 0; i < W.bump.length; i++) { W.bump[i].flash = Math.max(0, W.bump[i].flash - dt * 4); W.bump[i].ring = Math.max(0, W.bump[i].ring - dt * 9); }
  for (let i = 0; i < W.sling.length; i++) { W.sling[i].flash = Math.max(0, W.sling[i].flash - dt * 4); W.sling[i].kick = Math.max(0, W.sling[i].kick - dt * 10); }
  if (W.modeOn >= 0 && W.phase === 'play' && W.scoopBall == null) {
    W.modeT -= dt;
    if (W.modeT <= 0) {
      const m = W.modeOn, tot = W.modeTotal;
      W.modesDone[m] = true; W.modeOn = -1; W.modeIdx = (m + 1) % 4;
      const bonus = tot > 300000 ? 500000 : 0;
      if (bonus) award(W, bonus);
      dmdShow(MODE_SHORT[m] + ' TOTAL', fmt(tot + bonus), 2.0, 'bonus'); snd('lanes');
    }
  }
  if (W.cfg.mode === 'rush' && (W.phase === 'play' || W.phase === 'plunge') && !W.attract) {
    W.rushT -= dt;
    if (W.rushT <= 0) { W.rushT = 0; W.tilted = true; dmdShow('TIME UP', fmt(W.score), 2.0, 'flash'); snd('over'); for (let i = 0; i < W.balls.length; i++) if (W.balls[i].on && W.balls[i].st === 'free') W.balls[i].vy = Math.min(W.balls[i].vy, -40); }
  }
  // queue of balls waiting for the shooter lane (multiball, ball save)
  if (W.q.length) {
    W.serveT -= dt;
    let laneFree = true;
    for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; if (b.on && b.x > LANE_X && b.y < 30) laneFree = false; }
    if (W.serveT <= 0 && laneFree) { W.q.shift(); const b = serve(W, true); if (b) { W.serveT = 0.9; W.autoT = 0.5; } }
  }
  if (W.autoT > 0) { W.autoT -= dt; if (W.autoT <= 0) launch(W, 0.42 + Math.random() * 0.2, true); }
  // the ball sitting on the plunger at the start of play
  if (W.phase === 'plunge') {
    W.phaseT += dt;
    const P = W.plunger;
    if (IN.plunge && !P.held) { P.held = true; }
    if (!IN.plunge && P.held) { P.held = false; launch(W, P.pull, false); }
    if (IN.launchNow != null) { launch(W, IN.launchNow, false); IN.launchNow = null; }
    if (W.attract && W.phaseT > 0.8) launch(W, 0.3 + Math.random() * 0.6, true);
  } else if (W.phase === 'play') {
    W.phaseT += dt;
    const P = W.plunger;
    // a ball can sit in the lane after a ball save: the plunger still works
    if (IN.plunge && !P.held) P.held = true;
    if (!IN.plunge && P.held) { P.held = false; launch(W, P.pull, false); }
    if (IN.launchNow != null) { launch(W, IN.launchNow, false); IN.launchNow = null; }
  } else if (W.phase === 'bonus') {
    const R = W.bonusRun;
    R.t += dt;
    if (!R.done) {
      if (R.i < R.items.length) {
        if (R.t > 0.55) { const it = R.items[R.i]; dmdShow(it[0], fmt(it[1]), 0.55, 'bonus'); snd('bonus', R.i); R.i++; R.t = 0; }
      } else if (R.t > 0.6) {
        const total = R.total * R.x;
        award(W, total);
        dmdShow('BONUS ' + R.x + 'x', fmt(total), 1.2, 'bonus'); snd('lanes');
        R.done = true; R.t = 0;
      }
    } else if (R.t > 1.3) {
      W.bonusRun = null;
      if (W.extra > 0) { W.extra--; dmdShow('SHOOT AGAIN', '', 1.4, 'flash'); snd('extra'); newBallInPlay(W); }
      else if (W.ballNo < W.ballsLeft && W.cfg.mode === 'classic') { W.ballNo++; dmdShow('BALL ' + W.ballNo, '', 1.2, 'zoom'); newBallInPlay(W); }
      else if (W.cfg.mode !== 'classic' && !(W.cfg.mode === 'rush' && W.rushT <= 0)) { newBallInPlay(W); }
      else { gameOver(W); }
    }
  } else if (W.phase === 'over') {
    W.phaseT += dt;
  }
  if (IN.nudge) { IN.nudge = false; if (W.phase === 'play' || W.phase === 'plunge') nudge(W, IN.nudgeX || 0); }
  // rush: when time runs out, wait for the balls to drain
  if (W.cfg.mode === 'rush' && W.rushT <= 0 && W.phase === 'play' && activeBalls(W) === 0 && !W.q.length) endBall(W);
}
function gameOver(W) {
  W.phase = 'over'; W.phaseT = 0; W.over = true;
  W.rank = W.cfg.mode === 'free' ? -1 : addHighScore(W.cfg.mode, W.score);
  LAST.score = W.score;
  dmdShow('GAME OVER', fmt(W.score), 2.6, 'flash');
  if (W.rank >= 0) dmdShow('HIGH SCORE ' + (W.rank + 1), 'WELL PLAYED', 2.0, 'jackpot');
  snd('over'); hap('fail', 0.6);
  if (VIEW && VIEW.moment) VIEW.moment('over');
}

/* ------------------------------------------------------------ input */
const IN = { pulseL: 0, pulseR: 0, left: false, right: false, plunge: false, nudge: false, nudgeX: 0, launchNow: null, tl: false, tr: false, ml: false, mr: false, tPlunge: false };
const TOUCH = new Map(); // pointerId -> { side, x, y, t, sx, sy }
const TT = { downs: [], twoAt: 0, lastFlipL: false, lastFlipR: false, swipeHint: 0 };
function readInput(arc, W) {
  const inp = arc.input;
  const pad = inp.pad;
  const gl = padSide(true), gr = padSide(false);
  if (TOUCH.size) touchFlips();
  // a key pressed and let go inside one frame still flips for a moment
  if (inp.hit('KeyZ', 'ShiftLeft', 'ArrowLeft', 'KeyA')) IN.pulseL = 0.07;
  if (inp.hit('Slash', 'ShiftRight', 'ArrowRight', 'KeyD', 'KeyM')) IN.pulseR = 0.07;
  IN.left = inp.down('KeyZ', 'ShiftLeft', 'ArrowLeft', 'KeyA') || IN.tl || IN.ml || (pad.active && pad.x < -0.45) || gl || IN.pulseL > 0;
  IN.right = inp.down('Slash', 'ShiftRight', 'ArrowRight', 'KeyD', 'KeyM') || IN.tr || IN.mr || (pad.active && pad.x > 0.45) || gr || IN.pulseR > 0;
  const pk = inp.down('Space', 'ArrowDown', 'Enter', 'NumpadEnter', 'KeyS');
  if (!pk && inp.hit('Space', 'ArrowDown', 'Enter', 'NumpadEnter', 'KeyS') && IN.launchNow == null && ballInLane()) IN.launchNow = 0.05;
  IN.plunge = pk || IN.tPlunge;
  if (inp.hit('KeyX')) { IN.nudge = true; IN.nudgeX = inp.down('ArrowLeft', 'KeyZ') ? 0.6 : inp.down('ArrowRight', 'Slash') ? -0.6 : 0; }
  // flipper buttons also move the lit top lane (lane change)
  if (IN.left && !TT.lastFlipL) { flipPressed(W, 0); }
  if (IN.right && !TT.lastFlipR) { flipPressed(W, 1); }
  TT.lastFlipL = IN.left; TT.lastFlipR = IN.right;
}
// LB / RB on a controller are not mapped by the shell; read them here.
function padSide(left) {
  if (!ARC || !ARC.gamepad || !navigator.getGamepads) return false;
  try {
    const all = navigator.getGamepads();
    for (let i = 0; i < all.length; i++) { const g = all[i]; if (g && g.connected) { const b = g.buttons[left ? 4 : 5]; return !!(b && (b.pressed || b.value > 0.5)); } }
  } catch (e) { /* none */ }
  return false;
}
function flipPressed(W, side) {
  if (W.tilted || W.attract || !(W.phase === 'play' || W.phase === 'plunge')) return;
  if (side === 0) W.stats.flipsL++; else W.stats.flipsR++;
  snd('flip');
  hap('tap', 0.35);
  // lane change: lit lanes rotate the way the flipper points
  const L = W.lane;
  if (side === 0) { const f = L[0]; L[0] = L[1]; L[1] = L[2]; L[2] = L[3]; L[3] = f; }
  else { const l = L[3]; L[3] = L[2]; L[2] = L[1]; L[1] = L[0]; L[0] = l; }
  if (W.phase === 'plunge' && W.skillOpen) W.skillLane = (W.skillLane + (side === 0 ? 3 : 1)) % 4;
  W.fl[side].flips++;
}
function wireTouch(a) {
  const cv = a.canvas;
  const sideOf = (x) => { const r = cv.getBoundingClientRect(); return (x - r.left) < r.width / 2 ? 0 : 1; };
  const recompute = touchFlips;
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 2) IN.mr = true;
      else if (e.button === 0) { if (sideOf(e.clientX) === 0) IN.ml = true; else IN.mr = true; }
      return;
    }
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    if (a.touchStyle === 'pads' && a.state === 'play') return;
    const r = cv.getBoundingClientRect();
    const low = (e.clientY - r.top) > r.height * 0.55, side = sideOf(e.clientX);
    // while the only ball waits on the plunger, a low touch on the right may be the launch swipe: hold the flip a moment
    const p = { side, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp, t0: performance.now(), swipe: false, low, defer: low && side === 1 && !!W0 && W0.phase === 'plunge' };
    TOUCH.set(e.pointerId, p);
    // two fingers down together: a nudge when they lift quickly
    const now = e.timeStamp;
    TT.downs.push(now); if (TT.downs.length > 4) TT.downs.shift();
    if (TOUCH.size === 2 && TT.downs.length >= 2 && now - TT.downs[TT.downs.length - 2] < 260) TT.twoAt = now;
    recompute();
  });
  cv.addEventListener('pointermove', (e) => {
    const p = TOUCH.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    // a finger that starts low and travels up is the launch swipe, not a flipper press
    const dy = p.sy - p.y, dx = p.x - p.sx;
    if (!p.swipe && p.low && dy > 26 && dy > Math.abs(dx) * 1.2 && ballInLane()) { p.swipe = true; recompute(); }
  });
  const up = (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 2) IN.mr = false; if (e.button === 0) { IN.ml = false; IN.mr = false; } return; }
    const p = TOUCH.get(e.pointerId); if (!p) return;
    TOUCH.delete(e.pointerId);
    const dy = p.sy - e.clientY, dx = e.clientX - p.sx, ms = Math.max(1, e.timeStamp - p.t);
    if (e.type !== 'pointercancel' && p.low && dy > 40 && dy > Math.abs(dx) * 1.1 && ms < 900) {
      // swipe up from the bottom: launch, harder the longer and faster the swipe
      const r = cv.getBoundingClientRect();
      const power = clamp(dy / (r.height * 0.45) * 0.75 + (dy / ms) * 0.12, 0.05, 1);
      IN.launchNow = power;
    }
    if (TT.twoAt && e.timeStamp - TT.twoAt < 500 && TOUCH.size <= 1 && Math.hypot(dx, dy) < 30) { IN.nudge = true; IN.nudgeX = 0; TT.twoAt = 0; }
    recompute();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => { TOUCH.clear(); IN.tl = IN.tr = IN.ml = IN.mr = false; });
}
function touchFlips() {
  let l = false, r = false;
  const now = performance.now();
  TOUCH.forEach((p) => { if (p.swipe || (p.defer && now - p.t0 < 160)) return; if (p.side === 0) l = true; else r = true; });
  IN.tl = l; IN.tr = r;
}
function ballInLane() { const W = W0; if (!W) return false; for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; if (b.on && b.x > LANE_X && b.y < 12) return true; } return false; }
// The attract demo plays itself: flip when a ball comes down onto a flipper.
function autoPlay(W) {
  IN.left = IN.right = false;
  if (!W.attract && ballInLane() && W.autoT <= 0 && IN.launchNow == null && W.phase !== 'bonus') IN.launchNow = 0.25 + Math.random() * 0.65;
  for (let i = 0; i < W.balls.length; i++) {
    const b = W.balls[i]; if (!b.on || b.st !== 'free' || b.y > 24 || b.vy > 60) continue;
    for (let k = 0; k < 2; k++) {
      const f = W.fl[k].def;
      const tipx = f.px + f.side * Math.cos(f.rest) * f.len;
      if (Math.abs(b.x - (f.px + tipx) / 2) < 5.2 && b.y < 17 && b.y > 7) { if (k === 0) IN.left = true; else IN.right = true; }
    }
  }
}

/* ------------------------------------------------------------ HUD */
const INK = '#fbf5ec', GOLD = '#ffb736';
function txt(ctx, s, x, y, size, col, align, weight) {
  ctx.font = (weight || '600') + ' ' + size + 'px Inter, system-ui, sans-serif';
  ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(s, x + 1, y + 1.5);
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
const _pp = { x: 0, y: 0, on: false };
function drawHUD(ctx, a, W) {
  const pad = a.hudPad();
  // score pops float up from where they were earned
  for (let i = 0; i < W.pops.length; i++) {
    const p = W.pops[i];
    if (!VIEW.project(p.x, p.y, 3 + p.t * 6, _pp)) continue;
    const k = p.t / 1.1, al = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
    ctx.globalAlpha = clamp(al, 0, 1);
    txt(ctx, p.s, _pp.x, _pp.y - p.t * 26, a.w < 500 ? 12 : 15, p.col, 'center', '800');
    ctx.globalAlpha = 1;
  }
  // corner readout: ball, ball save, nudge danger
  const small = a.w < 520;
  const top = pad.top + 4 + (VIEW.hudTop || 0);
  if (!W.attract && a.state !== 'menu') {
    const label = W.cfg.mode === 'rush' ? 'Time ' + Math.ceil(W.rushT) + 's' : W.cfg.mode === 'free' ? 'Free play' : 'Ball ' + W.ballNo + ' of ' + W.ballsLeft;
    txt(ctx, label, pad.left + 2, top + 6, small ? 11 : 13, INK, 'left', '700');
    if (W.saveT > 0) txt(ctx, 'Ball save ' + Math.ceil(W.saveT), pad.left + 2, top + 24, small ? 11 : 12, '#4dff9a', 'left', '700');
    if (W.extra > 0) txt(ctx, 'Extra ball', pad.left + 2, top + 42, small ? 11 : 12, '#ff6a7a', 'left', '700');
    if (VIEW.hudScore) txt(ctx, fmt(W.score), a.w - pad.right - 2, top + 6, small ? 13 : 16, GOLD, 'right', '800');
    if (W.warnings > 0 && !W.tilted) txt(ctx, 'Tilt warning ' + W.warnings, a.w - pad.right - 2, top + (VIEW.hudScore ? 26 : 6), small ? 11 : 12, '#ff6a7a', 'right', '700');
    if (W.tilted && W.cfg.mode !== 'rush') { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(W.t * 8); txt(ctx, 'TILT', a.w / 2, a.h * 0.42, small ? 30 : 44, '#ff4a5a', 'center', '900'); ctx.globalAlpha = 1; }
    // plunger power meter with marks for the four lanes
    const P = W.plunger;
    if ((W.phase === 'plunge' || P.pull > 0.01) && ballInLane()) {
      const bw = small ? 12 : 14, bh = small ? 120 : 160;
      const x = a.w - pad.right - bw - (small ? 6 : 16), y = a.h - pad.bottom - bh - (small ? 70 : 40);
      ctx.fillStyle = 'rgba(10,8,18,0.55)'; ctx.fillRect(x - 3, y - 3, bw + 6, bh + 6);
      const k = P.pull;
      const g = ctx.createLinearGradient(0, y + bh, 0, y); g.addColorStop(0, '#2fe0c8'); g.addColorStop(0.6, '#ffb02e'); g.addColorStop(1, '#ff4fa0');
      ctx.fillStyle = g; ctx.fillRect(x, y + bh * (1 - k), bw, bh * k);
      for (let i = 0; i < 4; i++) {
        const lp = laneMark(i), yy = y + bh * (1 - lp);
        ctx.fillStyle = i === W.skillLane && W.skillOpen ? '#fff' : 'rgba(255,255,255,0.35)';
        ctx.fillRect(x - 5, yy - 1, bw + 10, 2);
        if (!small || i === W.skillLane) txt(ctx, 'MELA'[i], x - 9, yy, 10, i === W.skillLane && W.skillOpen ? '#fff' : 'rgba(255,255,255,0.6)', 'right', '800');
      }
      txt(ctx, a.touchMode ? 'Swipe up' : 'Hold Space', x + bw / 2, y + bh + 14, 10, 'rgba(255,255,255,0.75)', 'center', '700');
    }
  }
  // touch reminder: the two halves of the screen are the flippers
  if (a.touchMode && a.touchStyle !== 'pads' && a.state === 'play' && W.t < 5 && !W.attract) {
    const al = clamp(1 - (W.t - 3.2) / 1.8, 0, 1);
    const y0 = a.h * 0.8, hh = a.h - y0 - pad.bottom * 0.4;
    ctx.globalAlpha = al * 0.55;
    const g1 = ctx.createLinearGradient(0, y0, 0, y0 + hh); g1.addColorStop(0, 'rgba(255,79,160,0)'); g1.addColorStop(1, 'rgba(255,79,160,0.35)');
    ctx.fillStyle = g1; ctx.fillRect(0, y0, a.w / 2 - 1, hh);
    const g2 = ctx.createLinearGradient(0, y0, 0, y0 + hh); g2.addColorStop(0, 'rgba(47,224,200,0)'); g2.addColorStop(1, 'rgba(47,224,200,0.35)');
    ctx.fillStyle = g2; ctx.fillRect(a.w / 2 + 1, y0, a.w / 2, hh);
    ctx.globalAlpha = al;
    txt(ctx, 'Hold left', a.w * 0.25, y0 + hh * 0.62, 13, INK, 'center', '700');
    txt(ctx, 'Hold right', a.w * 0.75, y0 + hh * 0.62, 13, INK, 'center', '700');
    if (ballInLane()) txt(ctx, 'Swipe up to launch', a.w * 0.75, y0 + hh * 0.62 - 20, 12, GOLD, 'center', '700');
    ctx.globalAlpha = 1;
  }
}
// where on the power meter each lane's skill shot sits (from the launch speed the lane wants)
const LANE_PULL = [0.93, 0.74, 0.5, 0.24];
function laneMark(i) { return LANE_PULL[i]; }

/* ------------------------------------------------------------ debug */
function debugState() {
  const W = W0, a = ARC;
  if (!W) return { state: a ? a.state : 'none', alive: true };
  let bx = null, by = null, bz = 0, n = 0;
  for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; if (b.on) { n++; if (bx == null) { bx = +b.x.toFixed(2); by = +b.y.toFixed(2); bz = +b.z.toFixed(2); } } }
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, mode: W.cfg.mode, diff: W.cfg.diff, renderer: VIEW && VIEW.three ? '3d' : '2d',
    score: W.score, ball: W.ballNo, balls: n, queued: W.q.length, ballX: bx, ballY: by, ballZ: bz,
    left: +W.fl[0].th.toFixed(3), right: +W.fl[1].th.toFixed(3), flipsL: W.stats.flipsL, flipsR: W.stats.flipsR,
    plunger: +W.plunger.pull.toFixed(2), launches: W.stats.launches, nudges: W.stats.nudges, tiltWarnings: W.warnings, tilted: W.tilted,
    ballSave: +W.saveT.toFixed(1), multiball: W.mb, jackpots: W.stats.jackpots, tableMode: W.modeOn >= 0 ? MODE_SHORT[W.modeOn] : null, modeLit: W.modeLit, mbLit: W.mbLit,
    combo: W.combo, bonusX: W.bonusX, skillLane: W.skillLane, stats: W.stats, time: +W.t.toFixed(2),
    alive: !W.over, touchStyle: a.touchStyle, input: a.inputMode, gfx: VIEW && VIEW.info ? VIEW.info() : null,
  };
}
// Gameplay mode keys for the hub and menu
function menuProps() {
  return {
    eyebrow: 'Night fair table', title: 'Mela <em>Pinball</em>',
    html: '<p>Pop bumpers, a juggler ramp, lantern targets and a ferris wheel spinner under the lights of a night mela. Three ramps light multiball.</p>',
    options: [
      { id: 'mode', label: 'Mode', choices: Object.keys(MODES).map((k) => ({ v: k, label: MODES[k].label })), note: 'Rush: three minutes, drains saved.' },
      { id: 'diff', label: 'Table', choices: [{ v: 'easy', label: 'Gentle' }, { v: 'normal', label: 'Standard' }, { v: 'hard', label: 'Steep' }], value: 'normal' },
      { id: 'cam', label: 'Camera', choices: [{ v: 'auto', label: 'Auto' }, { v: 'full', label: 'Full table' }, { v: 'follow', label: 'Follow ball' }], value: 'auto' },
    ],
    showKeys: true,
  };
}

/* ------------------------------------------------------------ boot */
let ACC = 0;
export function boot(view) {
  VIEW = view;
  const A = window.Arcade;
  if (!A) return;
  A.create({
    three: !!view.three,
    slug: 'mela-pinball', title: 'Mela Pinball', genre: 'Night fair pinball',
    graphics(level) { if (view.graphics) view.graphics(level); },
    hint: 'Z or Left Shift: left flipper. / or Right Shift: right flipper. Hold Space or Down and release to launch. X nudges.',
    touchHint: 'Left and Right flip. Hold Launch and let go to fire. Nudge shakes the table.',
    keys: [['Z / Left Shift / Left', 'Left flipper'], ['/ / Right Shift / Right', 'Right flipper'], ['Space / Down (hold, release)', 'Plunger'], ['X', 'Nudge (careful, it can tilt)']],
    gameKeys: ['ShiftLeft', 'ShiftRight', 'Slash', 'KeyZ', 'KeyX', 'Enter', 'KeyM'],
    mouse: { steer: false, cursor: 'default', keys: [['Left click, left half', 'Left flipper'], ['Left click, right half / right click', 'Right flipper']] },
    // Controller: LB / LT left flipper, RB / RT right flipper, A plunger, Y nudge, X and B flip too, d-pad left and right flip.
    gamepad: { buttons: ['Space', 'KeyZ', 'Slash', 'KeyX'], rt: 'Slash', lt: 'KeyZ' },
    touch: { stick: false, pads: [{ label: 'Left', key: 'KeyZ', big: true }, { label: 'Launch', key: 'Space', hot: true }, { label: 'Nudge', key: 'KeyX' }, { label: 'Right', key: 'Slash', big: true }] },
    touchKeys: [['Left / Right', 'Flippers'], ['Launch', 'Hold, then let go'], ['Nudge', 'Shake the table']],
    gestures: {
      drag: false, tilt: false,
      hint: 'Hold the left or right half to flip. Swipe up from the bottom to launch. Two finger tap to nudge.',
      keys: [['Hold left half', 'Left flipper'], ['Hold right half', 'Right flipper'], ['Swipe up from the bottom', 'Launch (longer is harder)'], ['Two finger tap', 'Nudge']],
    },
    formatScore: (v) => fmt(v),
    resize: (a) => { if (view.resize) view.resize(a); },
    init(a) {
      ARC = a;
      if (!view.init(a)) return;
      a.debug = debugState;
      a.dev = Object.assign({
        world: () => W0, table: () => TABLE, input: () => ({ IN, touches: TOUCH.size, TT }),
        launch: (p) => { if (W0) launch(W0, p == null ? 0.5 : p, false); },
        place: (x, y, vx, vy) => { if (!W0) return; const b = W0.balls.find((q) => q.on) || serve(W0, false); b.st = 'free'; b.x = x; b.y = y; b.vx = vx || 0; b.vy = vy || 0; if (W0.phase === 'plunge') W0.phase = 'play'; },
        multiball: () => { if (W0 && !W0.mb) startMultiball(W0); },
        lightMode: () => { if (W0) W0.modeLit = true; },
        jackpot: () => { if (W0) { W0.mb = true; const b = W0.balls.find((q) => q.on); if (b) jackpot(W0, b, 'ramp'); } },
        bot: (on) => { if (W0) W0.bot = on !== false; },
        drain: () => { if (!W0) return; W0.saveT = 0; W0.scoopBall = null; for (let i = 0; i < W0.balls.length; i++) { const b = W0.balls[i]; if (b.on) { b.st = 'free'; b.x = 0; b.y = -6; b.vx = 0; b.vy = -50; } } W0.q.length = 0; },
      }, view.dev || {});
      wireTouch(a);
      const origMenu = a.menu;
      a.menu = function (p) { return origMenu(Object.assign(menuProps(), p || {})); };
      startAttract(a);
      a.menu();
    },
    onMenu() { if (!W0 || !W0.attract) startAttract(ARC); },
    start(a, ch) {
      const cfg = { mode: MODES[ch.mode] ? ch.mode : 'classic', diff: DIFF[ch.diff] ? ch.diff : 'normal', cam: ch.cam || 'auto', attract: false };
      resetTable();
      W0 = newWorld(cfg); ACC = 0;
      TOUCH.clear(); IN.tl = IN.tr = IN.ml = IN.mr = false; IN.launchNow = null; IN.nudge = false; TT.lastFlipL = TT.lastFlipR = true;
      DMD.q.length = 0; DMD.cur = null;
      dmdShow('BALL 1', MODES[cfg.mode].label.toUpperCase(), 1.4, 'zoom');
      newBallInPlay(W0);
      if (view.newGame) view.newGame(W0, a);
    },
    update(dt, a) {
      const W = W0; if (!W || W.attract) return;
      if (W.bot) autoPlay(W); else readInput(a, W);
      step(W, dt, a);
      musicTick(W, dt);
      if (W.phase === 'over' && W.phaseT > 3.0 && !W.reported) {
        W.reported = true;
        const rows = highScores(W.cfg.mode).map((e, i) => '<tr' + (i === W.rank ? ' class="mp-you"' : '') + '><td>' + (i + 1) + '</td><td>' + a.esc(e.n) + '</td><td>' + fmt(e.s) + '</td></tr>').join('');
        const html = '<p>' + (W.rank === 0 ? 'A new table record at the mela.' : W.rank > 0 ? 'You made the high score table.' : 'The lights dim on the mela. One more game?') + '</p>' +
          (W.cfg.mode === 'free' ? '' : '<table class="mp-hs">' + rows + '</table>') +
          '<p class="mp-sm">Ramps ' + W.stats.ramps + ' &middot; Jackpots ' + W.stats.jackpots + ' &middot; Modes ' + W.stats.modes + ' &middot; Best combo ' + (W.bestCombo || 0) + '</p>';
        injectCss();
        a.over({ eyebrow: MODES[W.cfg.mode].label, title: W.rank === 0 ? 'Grand <em>champion</em>' : 'Game <em>over</em>', score: W.cfg.mode === 'free' ? undefined : W.score, html });
      }
    },
    idle(dt, a) {
      if (W0 && !W0.attract && a.state === 'over' && W0.phaseT < 9) { step(W0, dt, a); return; }
      if (!W0 || !W0.attract) startAttract(a);
      autoPlay(W0);
      step(W0, dt, a);
    },
    render(ctx, a) {
      const W = W0; if (!W) return;
      if (!view.render(a, W, ctx)) return;
      if (a.state === 'play' || a.state === 'pause') drawHUD(ctx, a, W);
    },
    onPause() { if (rollHum) rollHum.set(40, 0); },
    onOver() { if (rollHum) rollHum.set(40, 0); },
  });
}
function injectCss() {
  if (document.getElementById('mp-css')) return;
  const st = document.createElement('style'); st.id = 'mp-css';
  st.textContent = '.mp-hs{width:100%;border-collapse:collapse;margin:8px 0 4px;font:600 13px/1.5 "JetBrains Mono",monospace}.mp-hs td{padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.08)}.mp-hs td:last-child{text-align:right}.mp-hs tr.mp-you td{color:#ffb736}.mp-sm{font-size:12px;opacity:.75}';
  document.head.appendChild(st);
}
function resetTable() { for (let i = 0; i < TABLE.targets.length; i++) TABLE.targets[i].seg.on = true; }
function startAttract(a) {
  resetTable();
  W0 = newWorld({ mode: (a && a.choices && a.choices.mode) || 'classic', diff: 'normal', attract: true });
  W0.phase = 'plunge';
  serve(W0, false);
  if (VIEW && VIEW.newGame) VIEW.newGame(W0, a);
}
// Fixed 240 Hz ticks with the remainder kept for interpolation.
function step(W, dt, a) {
  dt = Math.min(dt, 0.05);
  IN.pulseL = Math.max(0, IN.pulseL - dt); IN.pulseR = Math.max(0, IN.pulseR - dt);
  advanceRules(W, dt, IN);
  ACC += dt;
  let n = 0;
  while (ACC >= TICK && n < 14) { tick(W, IN); ACC -= TICK; n++; }
  if (n >= 14) ACC = 0;
  W.alpha = ACC / TICK;
  lamps(W, dt);
  dmdUpdate(W, dt, a);
  rollSound(W);
  for (let i = W.pops.length - 1; i >= 0; i--) { W.pops[i].t += dt; if (W.pops[i].t > 1.1) W.pops.splice(i, 1); }
}
// for headless tuning: run the physics without the shell
export const HEADLESS = { newWorld, tick, launch, serve, IN, setWorld: (W) => { W0 = W; }, advanceRules, step: (W, dt) => { W0 = W; step(W, dt, null); } };
