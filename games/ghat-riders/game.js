(function () {
  'use strict';

/*
 * Ghat Riders, the 2D edition of a 3D motorbike road race with shoulder barging.
 *
 * Point-to-point runs down winding mountain highways: a cliff wall on one side,
 * the valley drop and its painted guard stones on the other, hairpins, chai
 * stalls, waterfalls, tunnels, villages, trucks, buses and the odd cow.
 *
 * The rules run on a flat model: every rider has a distance along the course
 * (s, metres) and a lateral position from the centre line (x, metres). The 3D
 * world is placed from those two numbers. Barging is a shoulder shove; a rider
 * shoved hard enough slides off onto the shoulder, tumbles harmlessly and
 * remounts a few seconds later.
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
function hash(i) {
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fmtTime(s) {
  if (s == null || !isFinite(s)) return '-:--.--';
  const cs = Math.max(0, Math.round(s * 100));
  return Math.floor(cs / 6000) + ':' + pad2(Math.floor((cs % 6000) / 100)) + '.' + pad2(cs % 100);
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

/* ------------------------------------------------------------ constants */
const SEGM = 4;          // metres per course row
const HALF = 5.5;        // half width of the tarmac
const XW = 6.75;         // where the barrier (guard stones, rock wall, hedge) begins
const SHOULDER = 7.2;
const KMH = 3.6;
const START_S = 72;      // start line
const RUNOUT = 260;      // straight past the finish line
const CENT = 0.21;       // how hard a bend throws a bike to the outside
const N_RIVALS = 7;

const BIKES = {
  scout: { id: 'scout', name: 'Scout', price: 0, spd: 0.80, hdl: 0.88, str: 0.55, paint: '#e8452c', trim: '#f5efe3', blurb: 'A light roadster that turns on a coin. Easy to ride, easy to shove.' },
  thunder: { id: 'thunder', name: 'Thunder', price: 2500, spd: 0.88, hdl: 0.70, str: 0.95, paint: '#1f5fbf', trim: '#d9a441', blurb: 'A heavy cruiser. Wide bars, big tank, and a shoulder like a wall.' },
  phantom: { id: 'phantom', name: 'Phantom', price: 6000, spd: 1.00, hdl: 0.93, str: 0.72, paint: '#15161b', trim: '#ffb736', blurb: 'A faired sport bike. The fastest thing on the mountain.' }
};
const BIKE_ORDER = ['scout', 'thunder', 'phantom'];
const bikeTop = (b) => 38 + 16 * b.spd;          // m/s
const bikeAcc = (b) => 6.4 + 5 * b.spd;
const bikeSteer = (b) => 5.6 + 4.2 * b.hdl;       // lateral m/s at full lock
const bikeGrip = (b) => 1.18 - 0.32 * b.hdl;      // multiplies the bend push

const RIVALS = [
  { name: 'Rocky Bhau', kind: 'thunder', paint: '#c2272d', jacket: '#2b2f3a', helmet: '#f2c230', aggr: 1.0, pace: 0.99 },
  { name: 'Zoya Wheels', kind: 'phantom', paint: '#7b3fe4', jacket: '#f4f1ea', helmet: '#7b3fe4', aggr: 0.55, pace: 1.0 },
  { name: 'Captain Kesar', kind: 'thunder', paint: '#e8892c', jacket: '#3d5a3a', helmet: '#e8892c', aggr: 0.8, pace: 0.97 },
  { name: 'Bunty Turbo', kind: 'scout', paint: '#19a3a0', jacket: '#ffd23f', helmet: '#19a3a0', aggr: 0.9, pace: 0.96 },
  { name: 'Meera Mach', kind: 'phantom', paint: '#e94f8a', jacket: '#1d2440', helmet: '#ffffff', aggr: 0.45, pace: 1.01 },
  { name: 'Tenzin Gale', kind: 'scout', paint: '#3a8f3a', jacket: '#b3242a', helmet: '#3a8f3a', aggr: 0.6, pace: 0.98 },
  { name: 'Lalit Lightning', kind: 'thunder', paint: '#f2d24b', jacket: '#4a2f22', helmet: '#222222', aggr: 0.75, pace: 0.95 }
];
const PLAYER_LOOK = { jacket: '#e7672e', helmet: '#f5efe3' };

const DIFF = {
  easy: { name: 'Easy', pace: 0.86, aggr: 0.35, band: 0.08, shoveRes: -0.12 },
  normal: { name: 'Normal', pace: 0.94, aggr: 0.7, band: 0.05, shoveRes: 0 },
  hard: { name: 'Hard', pace: 1.0, aggr: 1.0, band: 0.03, shoveRes: 0.1 }
};

// [length m, total turn in degrees (+ right), climb m, options]
// c: which side the rock wall is on (+1 right, -1 left, 0 open banks). The valley drop is the other side.
const COURSES = [
  {
    id: 'misty', name: 'Misty Pass', when: 'Dawn mist', patrol: false, prize: 1,
    blurb: 'A climb through dawn mist: waterfalls, prayer flags and two tight hairpins.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [220, 30, 8, { c: 1, flags: 1 }], [200, -55, 10, { c: -1, chai: 1 }], [240, 0, 14, { c: 1, falls: 1 }],
      [110, 150, 12, { c: 1 }], [200, 0, 12, { c: -1, temple: 1 }], [110, -150, 12, { c: -1 }], [260, 20, 16, { c: 1, falls: 1, flags: 1 }],
      [300, 0, 6, { tun: 1 }], [200, -70, 10, { c: -1, flags: 1 }], [220, 60, 8, { c: 1, chai: 1 }], [240, 0, 4, { c: 0, village: 1 }],
      [120, -130, 12, { c: -1 }], [240, 40, 12, { c: 1, falls: 1 }], [120, 135, 10, { c: 1 }], [260, -40, 8, { c: -1, temple: 1, flags: 1 }],
      [220, -60, 10, { c: -1, chai: 1 }], [200, 70, 6, { c: 1 }], [300, 0, 2, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  },
  {
    id: 'tea', name: 'Tea Estate Climb', when: 'Golden afternoon', patrol: true, prize: 1.5,
    blurb: 'Rolling tea gardens in golden light. Patrol riders work this road.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [260, -25, 10, { c: 0, tea: 1 }], [220, 45, 14, { c: 1, tea: 1 }], [260, 0, 18, { c: 0, tea: 1, chai: 1 }],
      [120, -140, 14, { c: -1 }], [240, 20, 16, { c: 0, tea: 1, temple: 1 }], [120, 145, 14, { c: 1 }], [280, -30, 14, { c: -1, falls: 1 }],
      [260, 0, 6, { c: 0, village: 1 }], [220, 70, 12, { c: 1, tea: 1 }], [200, -80, 12, { c: -1, chai: 1 }], [260, 0, 10, { c: 0, tea: 1 }],
      [130, 150, 12, { c: 1 }], [240, -30, 10, { c: 0, tea: 1, flags: 1 }], [130, -150, 10, { c: -1 }], [300, 40, 10, { c: 0, tea: 1 }],
      [220, 0, 4, { tun: 1 }], [240, -45, 6, { c: -1, temple: 1 }], [300, 0, 2, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  },
  {
    id: 'coast', name: 'Coastal Ghat', when: 'Dusk', patrol: true, prize: 2,
    blurb: 'Down to the sea at dusk. Palms, tunnels, headlights and heavy traffic.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [240, 40, -6, { c: 1, palm: 1 }], [220, -60, -8, { c: -1, chai: 1 }], [300, 0, -4, { c: 1, falls: 1 }],
      [120, -130, -10, { c: -1 }], [220, 0, -8, { tun: 1 }], [300, 30, 0, { c: 1, palm: 1, temple: 1 }], [200, 60, -6, { c: 1 }],
      [120, 130, -8, { c: 1 }], [260, -30, -6, { c: 0, village: 1 }], [220, -50, -6, { c: -1, palm: 1 }], [300, 0, 0, { tun: 1 }],
      [200, 60, -4, { c: 1, chai: 1 }], [120, -140, -6, { c: -1 }], [260, 30, -4, { c: 1, falls: 1 }], [240, 40, -4, { c: 1, palm: 1, temple: 1 }],
      [300, 0, 0, { c: 0, village: 1 }], [220, -40, -2, { c: -1, palm: 1 }], [300, 0, 0, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  }
];
const COURSE_IDX = { misty: 0, tea: 1, coast: 2 };

// The light of each course: dawn mist, golden afternoon, dusk.
const LOOK = {
  misty: {
    skyTop: '#5b7fb3', skyMid: '#c9b8c4', skyHor: '#f3c9a1', sun: '#ffd6a8', sunI: 2.0, sunEl: 0.12, sunAz: -0.6,
    fog: '#c6c4cc', fogD: 0.0058, hemiSky: '#c4d2ec', hemiGnd: '#4a4636', hemiI: 1.05, exposure: 1.05,
    grass: '#55703f', grass2: '#3f5a33', rock: '#7d7569', dirt: '#8a7457', floor: '#3f5638', tree: 'pine', mist: 0.75, night: 0, sea: false, cloud: 0.55
  },
  tea: {
    skyTop: '#3b6fb8', skyMid: '#8fb5d9', skyHor: '#f2d39b', sun: '#ffd28a', sunI: 3.0, sunEl: 0.42, sunAz: 0.9,
    fog: '#d9cfae', fogD: 0.0026, hemiSky: '#bfd3ea', hemiGnd: '#5d5532', hemiI: 0.9, exposure: 1.0,
    grass: '#6f8a3c', grass2: '#4e7a2f', rock: '#8c7b63', dirt: '#9b7a50', floor: '#4f6a32', tree: 'oak', mist: 0.25, night: 0, sea: false, cloud: 0.35
  },
  coast: {
    skyTop: '#26306a', skyMid: '#b45c84', skyHor: '#ff9a4a', sun: '#ff9a5a', sunI: 2.2, sunEl: 0.035, sunAz: 2.4,
    fog: '#9a6478', fogD: 0.0032, hemiSky: '#b39ad0', hemiGnd: '#5a4038', hemiI: 1.35, exposure: 1.3,
    grass: '#4f6b38', grass2: '#3c5a2f', rock: '#6f5f58', dirt: '#7c6048', floor: '#1d3a52', tree: 'palm', mist: 0.35, night: 1, sea: true, cloud: 0.5
  }
};

/* ------------------------------------------------------------ the course: rows, frames, safe speeds */
// Cross section offsets from the centre line, metres, for the banks on each side.
const OFF = [5.5, 7.2, 7.7, 10, 15, 23, 34, 48];
const P_CLIFF = [0, 0.02, 1.0, 5.5, 13, 23, 33, 44];
const P_VALLEY = [0, -0.02, -0.5, -5, -15, -30, -50, -74];
const P_GENTLE = [0, 0.02, 0.18, 0.9, 2.4, 4.6, 8, 13];

const courseCache = {};
function getCourse(id) {
  if (courseCache[id]) return courseCache[id];
  const C = COURSES[COURSE_IDX[id]], r = rng(17 + COURSE_IDX[id] * 101);
  const rows = [];
  let h = 0, x = 0, z = 0, y = 0;
  C.secs.forEach((sec, si) => {
    const len = sec[0], turn = sec[1] * Math.PI / 180, climb = sec[2], o = sec[3] || {};
    const n = Math.round(len / SEGM);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, w = 2 * Math.pow(Math.sin(Math.PI * t), 2), dh = turn / n * w;
      rows.push({ h0: h, dh, x, z, y, sec: si, o, hair: Math.abs(sec[1]) >= 120 });
      h += dh / 2; x += Math.sin(h) * SEGM; z -= Math.cos(h) * SEGM; h += dh / 2; y += climb / n;
    }
  });
  rows.push({ h0: h, dh: 0, x, z, y, sec: C.secs.length - 1, o: C.secs[C.secs.length - 1][3], hair: false });
  const N = rows.length;
  const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N), HD = new Float32Array(N), CV = new Float32Array(N);
  const KL = new Float32Array(N), KR = new Float32Array(N), TUN = new Float32Array(N), VS = new Float32Array(N), LIM = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { PX[i] = rows[i].x; PZ[i] = rows[i].z; HD[i] = rows[i].h0; }
  // heights smoothed so slopes ease between sections
  for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let k = -14; k <= 14; k++) { const j = clamp(i + k, 0, N - 1); a += rows[j].y; c++; } PY[i] = a / c; }
  for (let i = 0; i < N; i++) CV[i] = rows[i].dh / SEGM;
  // the bank on each side, eased across about 50 m
  const kl = new Float32Array(N), kr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const o = rows[i].o || {};
    if (o.tun) { kl[i] = 1; kr[i] = 1; TUN[i] = 1; }
    else if (o.village) { kl[i] = 0.05; kr[i] = 0.05; }
    else if (o.c === 1) { kl[i] = -1; kr[i] = 1; }
    else if (o.c === -1) { kl[i] = 1; kr[i] = -1; }
    else { kl[i] = 0.22; kr[i] = 0.22; }
    if (o.tea) { kl[i] = Math.min(kl[i], 0.3); kr[i] = Math.min(kr[i], 0.3); }
  }
  for (let i = 0; i < N; i++) {
    let a = 0, b = 0, c = 0;
    for (let k = -12; k <= 12; k++) { const j = clamp(i + k, 0, N - 1); a += kl[j]; b += kr[j]; c++; }
    KL[i] = a / c; KR[i] = b / c;
  }
  // tunnel blend for lighting, eased so the light drops at the portal
  const tb = new Float32Array(N);
  for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let k = -4; k <= 4; k++) { const j = clamp(i + k, 0, N - 1); a += TUN[j]; c++; } tb[i] = a / c; }
  // how far the banks may reach on the inside of a bend before they fold over
  for (let i = 0; i < N; i++) {
    let cv = 0; for (let k = -6; k <= 6; k++) cv += CV[clamp(i + k, 0, N - 1)]; cv /= 13;
    const rad = Math.abs(cv) > 1e-4 ? 1 / Math.abs(cv) : 1e4;
    const inner = clamp(rad * 0.72, 12, 48);
    LIM[i * 2] = cv < 0 ? inner : 48; LIM[i * 2 + 1] = cv > 0 ? inner : 48;
  }
  // safe speed for the AI and the bend warnings: v^2 * curvature within the push a rider can hold
  for (let i = 0; i < N; i++) { let c = 0; for (let k = -3; k <= 3; k++) c = Math.max(c, Math.abs(CV[clamp(i + k, 0, N - 1)])); VS[i] = Math.min(60, Math.sqrt(5.4 / CENT / Math.max(c, 1e-4))); }
  for (let i = N - 2; i >= 0; i--) VS[i] = Math.min(VS[i], Math.sqrt(VS[i + 1] * VS[i + 1] + 2 * 13 * SEGM));
  const L = (N - 1) * SEGM;
  const T = {
    id, def: C, look: LOOK[id], N, L, PX, PY, PZ, HD, CV, KL, KR, TUN: tb, VS, LIM, rows,
    finishS: L - RUNOUT, startS: START_S, minY: 0, maxY: 0, decor: null, r
  };
  let mn = 1e9, mx = -1e9; for (let i = 0; i < N; i++) { mn = Math.min(mn, PY[i]); mx = Math.max(mx, PY[i]); }
  T.minY = mn; T.maxY = mx;
  // the bounding box of the whole run, for the minimap
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, PX[i]); x1 = Math.max(x1, PX[i]); z0 = Math.min(z0, PZ[i]); z1 = Math.max(z1, PZ[i]); }
  T.box = { x0, x1, z0, z1 };
  courseCache[id] = T;
  return T;
}

// Position on the course: s metres along, x metres right of the centre line, up metres above the road.
const FR = { x: 0, y: 0, z: 0, h: 0, fx: 0, fz: -1, rx: 1, rz: 0, pitch: 0, i: 0, t: 0 };
function frameAt(T, s) {
  const u = clamp(s / SEGM, 0, T.N - 1.001), i = Math.floor(u), t = u - i, j = i + 1;
  FR.x = T.PX[i] + (T.PX[j] - T.PX[i]) * t; FR.y = T.PY[i] + (T.PY[j] - T.PY[i]) * t; FR.z = T.PZ[i] + (T.PZ[j] - T.PZ[i]) * t;
  FR.h = T.HD[i] + (T.HD[j] - T.HD[i]) * t;
  FR.fx = Math.sin(FR.h); FR.fz = -Math.cos(FR.h); FR.rx = Math.cos(FR.h); FR.rz = Math.sin(FR.h);
  FR.pitch = Math.atan2(T.PY[j] - T.PY[i], SEGM);
  FR.i = i; FR.t = t;
  // past the end of the run the road carries straight on
  if (s > T.L) { const d = s - T.L; FR.x += FR.fx * d; FR.z += FR.fz * d; }
  else if (s < 0) { FR.x += FR.fx * s; FR.z += FR.fz * s; }
  return FR;
}
function posAt(T, s, x, up, out) {
  frameAt(T, s);
  out.x = FR.x + FR.rx * x; out.y = FR.y + up; out.z = FR.z + FR.rz * x;
  return out;
}
const rowOf = (T, s) => clamp(Math.floor(s / SEGM), 0, T.N - 1);
const curvAt = (T, s) => T.CV[rowOf(T, s)];

// The bank height at lateral offset `off` (metres, signed) at row i.
function profileH(k, j) {
  return k >= 0 ? lerp(P_GENTLE[j], P_CLIFF[j], k) : lerp(P_GENTLE[j], P_VALLEY[j], -k);
}
function bankH(T, i, off) {
  const side = off < 0 ? 0 : 1, a = Math.abs(off), k = side ? T.KR[i] : T.KL[i];
  if (a <= OFF[0]) return 0;
  let j = 0; while (j < OFF.length - 2 && OFF[j + 1] < a) j++;
  const t = clamp((a - OFF[j]) / (OFF[j + 1] - OFF[j]), 0, 1);
  return lerp(profileH(k, j), profileH(k, j + 1), t) + bankNoise(i, side, a);
}
function bankNoise(i, side, a) {
  const amp = clamp((a - 7.5) / 20, 0, 1) * 2.4;
  if (amp <= 0) return 0;
  const f = i * 0.21 + side * 37, g = a * 0.17;
  return amp * (Math.sin(f) * 0.6 + Math.sin(f * 2.3 + g * 3.1) * 0.3 + Math.sin(f * 0.37 + g * 1.7) * 0.5);
}
// world position of a point on the banks, for scenery
function groundPos(T, s, off, out) {
  const i = rowOf(T, s);
  posAt(T, s, off, bankH(T, i, off), out);
  return out;
}

/* ------------------------------------------------------------ save game */
let ARC = null, Wd = null, SAVE = null;
const SAVE_KEY = 'ghat-riders.save';
function loadSave() {
  const d = ARC.store.get(SAVE_KEY, null) || {};
  SAVE = {
    cash: typeof d.cash === 'number' ? d.cash : 0,
    owned: Array.isArray(d.owned) && d.owned.length ? d.owned.filter((b) => BIKES[b]) : ['scout'],
    unlocked: clamp(d.unlocked | 0 || 1, 1, 3),
    best: d.best && typeof d.best === 'object' ? d.best : {}
  };
  if (SAVE.owned.indexOf('scout') < 0) SAVE.owned.unshift('scout');
}
const saveGame = () => ARC.store.set(SAVE_KEY, SAVE);

/* ------------------------------------------------------------ the world and its rules */
const TRAFFIC_KINDS = {
  truck: { hl: 3.7, hw: 1.25, h: 3.1 },
  bus: { hl: 5.4, hw: 1.3, h: 3.2 },
  car: { hl: 2.0, hw: 0.88, h: 1.5 },
  tempo: { hl: 1.5, hw: 0.72, h: 1.8 }
};
const TRAFFIC_MIX = ['truck', 'bus', 'car', 'truck', 'tempo', 'car', 'bus', 'truck'];
const TRAFFIC_COL = ['#e0a020', '#2d7fc1', '#d8452f', '#3f9a5a', '#e7e1d2', '#9a4fb5', '#f0c419', '#c9672e', '#e8e8e8', '#5b6670'];
const LEFT_LANE = -2.75, RIGHT_LANE = 2.75;   // traffic keeps left; oncoming uses the right lane

function mkRider(o) {
  const b = BIKES[o.kind];
  return Object.assign({
    s: 0, x: 0, v: 0, vx: 0, lean: 0, steer: 0, thr: 0, wob: 0, wobPh: 0, crash: 0, crashT: 0, crashDur: 0, crashDir: 1, crashSpin: 0,
    shoveT: 0, shoveSide: 0, shoveCd: 0, shoveDone: false, nitro: 20, nitroOn: false, nLatch: 0, brLatch: 0, draft: 0, finished: false, finT: 0, place: 0,
    invuln: 0, oil: 0, gravel: 0, scrape: 0, onShoulder: false, peg: 0, wheel: 0, tumble: 0, react: 0, lastHit: -9, pass: {},
    ai: { tx: 0, bias: 0, cd: 1 + Math.random() * 2, barge: 0, bargeT: null, nitroT: 0, mood: Math.random() },
    stats: { shoves: 0, knocks: 0, taken: 0, crashes: 0, passes: 0, near: 0 }
  }, o, { b, top: bikeTop(b), acc: bikeAcc(b), steerMax: bikeSteer(b), grip: bikeGrip(b) });
}

function newWorld(cfg) {
  const T = getCourse(cfg.course), d = DIFF[cfg.diff] || DIFF.normal;
  const W = {
    T, cfg, d, attract: !!cfg.attract, phase: 'grid', t: 0, cd: cfg.attract ? 0.01 : 3.4, riders: [], traffic: [], cows: [], patrols: [], hazards: [],
    pops: [], timeScale: 1, slowT: 0, finWait: 0, results: null, busted: false, bustT: 0, fov: 0, shove: 0, evt: [], seed: (Math.random() * 1e9) | 0,
    falls: [], hornT: 0, overTimer: 0, banner: null, bannerT: 0, msgT: 0
  };
  const tt = cfg.mode === 'time';
  const P = mkRider({ name: 'You', kind: cfg.bike, isPlayer: true, paint: BIKES[cfg.bike].paint, jacket: PLAYER_LOOK.jacket, helmet: PLAYER_LOOK.helmet, idx: 0, aggr: 0, pace: 1 });
  W.P = P; W.riders.push(P);
  if (!tt) RIVALS.forEach((rv, i) => W.riders.push(mkRider(Object.assign({}, rv, { idx: i + 1, isPlayer: false }))));
  // grid: rows of two behind the start line, the player starts mid-pack
  const slots = [];
  for (let k = 0; k < 8; k++) slots.push({ s: START_S - 7 - Math.floor(k / 2) * 6, x: k % 2 ? 1.9 : -1.9 });
  const order = W.riders.slice();
  if (!tt) { order.splice(0, 1); order.splice(cfg.attract ? 2 : 5, 0, P); }
  order.forEach((r, k) => { r.s = slots[k].s; r.x = slots[k].x; r.ai.tx = r.x; r.react = r.isPlayer ? 0 : 0.05 + Math.random() * 0.3; });
  if (tt) { P.s = START_S - 8; P.x = 0; }
  // traffic pool
  const dens = { misty: [4, 2], tea: [5, 3], coast: [6, 3] }[T.id];
  const scale = cfg.diff === 'easy' ? 0.7 : cfg.diff === 'hard' ? 1.2 : 1;
  const nSame = Math.round(dens[0] * scale * (tt ? 0.6 : 1)), nOn = Math.round(dens[1] * scale * (tt ? 0.6 : 1));
  for (let i = 0; i < nSame + nOn; i++) {
    const kind = TRAFFIC_MIX[i % TRAFFIC_MIX.length];
    W.traffic.push({ kind, k: TRAFFIC_KINDS[kind], dir: i < nSame ? 1 : -1, s: 0, x: 0, v: 0, col: TRAFFIC_COL[(i * 3 + 1) % TRAFFIC_COL.length], live: false, horn: 0, idx: i, swayP: Math.random() * 6 });
  }
  W.traffic.forEach((v, i) => spawnTraffic(W, v, 200 + i * (3200 / W.traffic.length), true));
  const r = rng(W.seed);
  // oil and gravel on the tarmac
  const nOil = { misty: 5, tea: 6, coast: 9 }[T.id], nGrav = { misty: 10, tea: 7, coast: 6 }[T.id];
  for (let i = 0; i < nOil + nGrav; i++) {
    const s = 260 + r() * (T.finishS - 400);
    W.hazards.push({ kind: i < nOil ? 'oil' : 'gravel', s, x: (r() * 2 - 1) * 4.2, rs: 2.6 + r() * 1.6, rx: 1.2 + r() * 0.6 });
  }
  // cows by the road, some wander across
  const nCow = { misty: 5, tea: 6, coast: 6 }[T.id];
  for (let i = 0; i < nCow; i++) {
    const s = 330 + (i + r() * 0.6) * (T.finishS - 500) / nCow, side = r() < 0.5 ? -1 : 1;
    W.cows.push({ s, x: side * (6.3 + r() * 0.3), home: side * 6.4, walk: r() < 0.45 ? -side : 0, wT: 0, hd: r() * 6, moo: 0, look: r() * 6, col: r() < 0.6 ? '#ece6da' : '#b8ada0' });
  }
  // patrol riders: parked at the roadside, and one cruising
  if (T.def.patrol && !tt) {
    const ps = [0.33, 0.68];
    ps.forEach((f, i) => W.patrols.push({ s: T.finishS * f, x: (i % 2 ? 1 : -1) * 6.2, v: 0, parked: true, beacon: 0, warned: false }));
    W.patrols.push({ s: 950, x: LEFT_LANE - 0.6, v: 20.5, parked: false, beacon: 0, warned: false });
  }
  if (cfg.attract) { W.phase = 'racing'; W.riders.forEach((rr) => { rr.react = 0; }); P.bot = true; }
  // positions of waterfalls, for the spray
  W.falls = (decorFor(T).falls || []).slice();
  return W;
}

function spawnTraffic(W, v, s, init) {
  const T = W.T;
  v.s = clamp(s, 120, T.finishS + 120);
  v.x = (v.dir > 0 ? LEFT_LANE : RIGHT_LANE) + (Math.random() - 0.5) * 0.6;
  v.v = v.dir > 0 ? 10 + Math.random() * 8 : -(12 + Math.random() * 6);
  if (v.kind === 'tempo') v.v *= 0.8;
  v.live = true; v.horn = 0;
  if (init && Math.abs(v.s - START_S) < 140) v.s = START_S + 150 + Math.random() * 60;
}

function updateTraffic(W, dt) {
  const T = W.T, focus = W.P.finished ? W.P.s : Math.max(W.P.s, START_S);
  for (let i = 0; i < W.traffic.length; i++) {
    const v = W.traffic[i];
    if (W.phase !== 'grid' || v.s > START_S + 120) v.s += v.v * dt;
    // ease off on hairpins
    const c = Math.abs(curvAt(T, v.s));
    if (c > 0.01) v.s -= v.v * dt * clamp((c - 0.01) * 18, 0, 0.35);
    v.x += ((v.dir > 0 ? LEFT_LANE : RIGHT_LANE) - v.x) * dt * 0.5;
    if (v.s < focus - 140 || v.s > focus + 900 || v.s > T.finishS + 140) {
      const ahead = v.dir > 0 ? 380 + Math.random() * 380 : 520 + Math.random() * 320;
      spawnTraffic(W, v, focus + ahead, false);
    }
    if (v.horn > 0) v.horn -= dt;
  }
}

function updateCows(W, dt) {
  for (let i = 0; i < W.cows.length; i++) {
    const c = W.cows[i];
    c.hd += dt; c.look += dt;
    if (c.moo > 0) c.moo -= dt;
    if (!c.walk) continue;
    const near = Math.abs(c.s - W.P.s) < 220;
    if (!near && c.wT === 0) continue;
    c.wT += dt;
    c.x += c.walk * 0.9 * dt;
    if (Math.abs(c.x) > 6.4) { c.x = clamp(c.x, -6.4, 6.4); c.walk = -c.walk; c.wT = 0; if (Math.random() < 0.5) c.walk = 0; }
  }
}

function updatePatrols(W, dt) {
  for (let i = 0; i < W.patrols.length; i++) {
    const p = W.patrols[i];
    p.beacon += dt;
    if (!p.parked && W.phase !== 'grid') {
      p.s += p.v * dt;
      const c = Math.abs(curvAt(W.T, p.s)); if (c > 0.012) p.s -= p.v * dt * 0.3;
      if (p.s > W.T.finishS - 40) { p.s = W.T.finishS - 40; p.v = 0; p.parked = true; }
    }
  }
}

/* ------------------------------------------------------------ sound */
const SND = { e1: null, e2: null };
function engineStop() { if (SND.e1) { SND.e1.stop(); SND.e2.stop(); } SND.e1 = SND.e2 = null; }
function engineStart() { engineStop(); SND.e1 = ARC.sfx.hum('sawtooth'); SND.e2 = ARC.sfx.hum('square'); }
function engineSet(P) {
  if (!SND.e1) return;
  const sp = clamp(P.v / P.top, 0, 1.3), gear = Math.min(5, Math.floor(sp * 5.2)), inG = sp * 5.2 - gear;
  const rpm = 0.3 + inG * 0.7;
  const f = 62 + rpm * 120 + gear * 6;
  const vol = P.crash > 0 ? 0.02 : 0.05 + P.thr * 0.07 + (P.nitroOn ? 0.03 : 0);
  SND.e1.set(f, vol); SND.e2.set(f * 0.5, vol * 0.6);
}
const tone = (f, d, o) => ARC.sfx.tone(f, d, o);
const noise = (d, o) => ARC.sfx.noise(d, o);

function pop(W, text, sub, col, big) {
  W.pops.push({ text, sub: sub || '', col: col || '#ffb736', t: 0, big: !!big });
  if (W.pops.length > 4) W.pops.shift();
}

/* ------------------------------------------------------------ steering input */
function readInput(W, P, dt) {
  const inp = ARC.input, a = ARC;
  const gest = a.touchMode && a.touchStyle !== 'pads';
  let sx = inp.axis().x;
  if (inp.stick.active) { sx = clamp(inp.stick.x * 1.3, -1, 1); if (Math.abs(sx) < 0.07) sx = 0; }
  else if (a.touchMode && a.touchStyle === 'tilt') sx = clamp(sx * 1.25, -1, 1);
  else if (sx === 0 && !a.touchMode && inp.pointer.seen && inp.pointer.type === 'mouse' && !inp.gesture.active) {
    // mouse: steer toward the pointer
    sx = clamp((inp.pointer.nx - 0.5) * 2.4, -1, 1);
    if (Math.abs(sx) < 0.06) sx = 0;
  }
  const g = inp.gesture;
  const dragBrake = gest && g.active && g.type !== 'mouse' && g.dy > 46 && g.dy > Math.abs(g.dx) * 0.5;
  const brake = inp.down('ArrowDown', 'KeyS') || P.brLatch > 0 || dragBrake;
  const autoGas = a.touchMode || W.cfg.gas === 'auto';
  const gas = !brake && (inp.down('ArrowUp', 'KeyW') || (inp.pointer.down && inp.pointer.type === 'mouse') || autoGas);
  const nit = inp.down('ShiftLeft', 'ShiftRight', 'KeyN') || P.nLatch > 0;
  // a downward drag that brakes should not also steer
  if (dragBrake) sx *= 0.4;
  P.steerIn = (P.steerIn || 0) + (sx - (P.steerIn || 0)) * Math.min(1, dt * (Math.abs(sx) > 0.01 ? 10 : 14));
  // shoves: Z / J left, X / K right, Space toward the nearest rival; gestures handled in update()
  let shove = 0;
  if (inp.hit('KeyZ', 'KeyJ')) shove = -1;
  else if (inp.hit('KeyX', 'KeyK')) shove = 1;
  else if (inp.hit('Space')) shove = nearestSide(W, P) || 0;
  if (W.queuedShove) { shove = W.queuedShove; W.queuedShove = 0; }
  return { steer: P.steerIn, gas, brake, nit, shove };
}

// Which side the nearest rider in barging range is on (or 0).
function nearestSide(W, P) {
  let best = 99, side = 0;
  for (let i = 0; i < W.riders.length; i++) {
    const o = W.riders[i]; if (o === P || o.crash > 0 || o.finished) continue;
    const ds = Math.abs(o.s - P.s), dx = o.x - P.x;
    if (ds < 4.5 && Math.abs(dx) < 4) { const d = ds + Math.abs(dx); if (d < best) { best = d; side = dx < 0 ? -1 : 1; } }
  }
  return side;
}
function inRange(W, P, side) {
  let best = null, bd = 99;
  for (let i = 0; i < W.riders.length; i++) {
    const o = W.riders[i]; if (o === P || o.crash > 0 || o.finished || o.invuln > 0) continue;
    const ds = Math.abs(o.s - P.s), dx = (o.x - P.x) * side;
    if (ds < 2.4 && dx > 0.25 && dx < 2.9) { const d = ds * 0.6 + dx; if (d < bd) { bd = d; best = o; } }
  }
  return best;
}

/* ------------------------------------------------------------ AI */
function aiControl(W, R, dt) {
  const T = W.T, d = W.d, P = W.P;
  const ai = R.ai;
  const look = R.s + 10 + R.v * 0.55;
  let cAhead = 0; for (let k = 0; k < 4; k++) cAhead += curvAt(T, look + k * 6); cAhead /= 4;
  ai.bias += ((Math.sin(W.t * 0.13 + R.idx * 1.7) * 1.4) - ai.bias) * dt * 0.5;
  let tx = clamp(cAhead * 160, -3.6, 3.6) + ai.bias;
  // things to ride around: traffic, cows, oil, other riders
  let avoid = null, aDist = 1e9;
  const consider = (s, x, hw, hl, rel) => {
    const ds = s - R.s - hl;
    if (ds < -1 || ds > 26 + Math.max(0, rel) * 1.4) return;
    if (Math.abs(x - tx) < hw + 1.3 || Math.abs(x - R.x) < hw + 1.0) { if (ds < aDist) { aDist = ds; avoid = { x, hw }; } }
  };
  for (let i = 0; i < W.traffic.length; i++) { const v = W.traffic[i]; consider(v.s, v.x, v.k.hw, v.k.hl, R.v - v.v); }
  for (let i = 0; i < W.cows.length; i++) { const c = W.cows[i]; if (Math.abs(c.x) < 6) consider(c.s, c.x, 0.9, 1.2, R.v); }
  for (let i = 0; i < W.hazards.length; i++) { const h = W.hazards[i]; if (h.kind === 'oil') consider(h.s, h.x, h.rx, h.rs, R.v); }
  for (let i = 0; i < W.patrols.length; i++) { const p = W.patrols[i]; consider(p.s, p.x, 0.6, 1.2, R.v - p.v); }
  for (let i = 0; i < W.riders.length; i++) { const o = W.riders[i]; if (o !== R && (o.crash > 0 || o.v < R.v - 6)) consider(o.s, o.x, 0.6, 1.1, R.v - o.v); }
  if (avoid) {
    const l = avoid.x - avoid.hw - 1.5, rr = avoid.x + avoid.hw + 1.5;
    const lOk = l > -XW + 0.9, rOk = rr < XW - 0.9;
    tx = (lOk && (!rOk || Math.abs(l - R.x) < Math.abs(rr - R.x))) ? l : rOk ? rr : tx;
  }
  // barging: line up beside a rider, then shove
  if (!W.attract || true) {
    ai.cd -= dt;
    if (ai.barge && ai.bargeT) {
      const o = ai.bargeT;
      if (o.crash > 0 || Math.abs(o.s - R.s) > 6) { ai.barge = 0; ai.bargeT = null; }
      else {
        ai.barge -= dt; tx = o.x - Math.sign(o.x - R.x || 1) * 1.15;
        const side = o.x > R.x ? 1 : -1;
        if (ai.barge <= 0.25 && inRange(W, R, side) === o && R.shoveCd <= 0) { startShove(W, R, side); ai.barge = 0; ai.bargeT = null; ai.cd = 1.6 + Math.random() * 2.2 / (0.4 + d.aggr); }
        if (ai.barge <= 0) { ai.barge = 0; ai.bargeT = null; }
      }
    } else if (ai.cd <= 0 && W.phase === 'racing' && R.crash <= 0) {
      let tgt = null;
      for (let i = 0; i < W.riders.length; i++) {
        const o = W.riders[i]; if (o === R || o.crash > 0 || o.finished || o.invuln > 0) continue;
        if (Math.abs(o.s - R.s) < 3.2 && Math.abs(o.x - R.x) < 3.6) { if (!tgt || o.isPlayer) tgt = o; }
      }
      if (tgt) {
        const want = (tgt.isPlayer ? 1.2 : 0.35) * d.aggr * R.aggr;
        if (Math.random() < want * 0.9) { ai.barge = 0.7; ai.bargeT = tgt; }
        ai.cd = 0.7 + Math.random() * 0.8;
      }
    }
  }
  tx = clamp(tx, -XW + 1.0, XW - 1.0);
  ai.tx += (tx - ai.tx) * Math.min(1, dt * 3);
  // speed: the bend ahead, pace and a gentle rubber band
  let vSafe = 1e9;
  const brakeLook = R.v * R.v / 26 + 8;
  for (let k = 0; k <= 5; k++) vSafe = Math.min(vSafe, T.VS[rowOf(T, R.s + brakeLook * k / 5)]);
  let pace = (R.pace || 1) * d.pace;
  if (!R.isPlayer && !W.attract) {
    const gap = R.s - P.s;
    if (gap < -70) pace += d.band; else if (gap > 110) pace -= d.band * 0.8;
  }
  if (R.bot) pace = 0.97;
  const vt = Math.min(R.top * pace, vSafe * (0.93 + 0.06 * (R.pace || 1)));
  const push = R.v * R.v * curvAt(T, R.s) * CENT * R.grip;
  const steer = clamp(((ai.tx - R.x) * 1.4 + push - R.vx * 0.2) / R.steerMax, -1, 1);
  let nit = false;
  if (R.nitro > 40 && W.phase === 'racing' && vSafe > R.v + 10 && Math.abs(cAhead) < 0.004) ai.nitroT = 1.8;
  if (ai.nitroT > 0) { ai.nitroT -= dt; nit = true; }
  return { steer, gas: R.v < vt, brake: R.v > vt + 2.5, nit, shove: 0 };
}

/* ------------------------------------------------------------ barging */
function startShove(W, R, side) {
  if (R.shoveCd > 0 || R.crash > 0 || R.shoveT > 0) return false;
  R.shoveT = 0.42; R.shoveSide = side; R.shoveCd = R.isPlayer ? 0.55 : 0.9; R.shoveDone = false;
  if (R.isPlayer) tone(180, 0.08, { type: 'triangle', vol: 0.07 });
  return true;
}

function resolveShove(W, R) {
  const side = R.shoveSide, o = inRange(W, R, side);
  R.shoveDone = true;
  if (!o) { R.vx += side * 1.6; if (R.isPlayer) { pop(W, 'Missed', 'Nobody there', '#a39e94'); } return; }
  const rel = clamp((R.vx - o.vx) * side, -4, 6);
  // a rider shoving back at the same moment: a clash, both wobble, nobody falls
  if (o.shoveT > 0 && o.shoveSide === -side) {
    R.wob = Math.max(R.wob, 0.6); o.wob = Math.max(o.wob, 0.6); R.vx -= side * 2.5; o.vx += side * 2.5; o.shoveT = 0; o.shoveDone = true;
    clashFx(W, R, o, 0.6);
    if (R.isPlayer || o.isPlayer) { pop(W, 'Clash!', 'Shoulders bounced', '#38e1ff'); noise(0.18, { freq: 900, vol: 0.2 }); }
    return;
  }
  const res = W.d.shoveRes || 0;
  const force = 0.5 + 0.85 * R.b.str + 0.12 * rel + (R.nitroOn ? 0.15 : 0) + Math.random() * 0.25 + (R.isPlayer ? 0.08 : 0);
  const resist = 0.45 + 0.75 * o.b.str + (o.isPlayer ? 0 : res) + (o.wob > 0 ? -0.15 : 0) + (o.brakeIn ? -0.1 : 0) + Math.random() * 0.2;
  const margin = force - resist;
  o.vx += side * (3.8 + Math.max(0, margin) * 5);
  o.wob = Math.max(o.wob, 0.8 + Math.max(0, margin));
  o.lastHit = W.t; R.lastHit = W.t;
  R.stats.shoves++; o.stats.taken++;
  const big = margin > 0.42 || (margin > 0.2 && Math.abs(o.x) > HALF - 0.4);
  clashFx(W, R, o, big ? 1 : 0.55);
  if (big) {
    R.stats.knocks++;
    crash(W, o, side, 'shove');
    o.vx = side * (6 + margin * 3);
    if (R.isPlayer) {
      addNitro(R, 26);
      pop(W, 'Barged off!', o.name + ' takes a tumble', '#ff6940', true);
      if (!ARC.reducedMotion) { W.slowT = 0.75; }
      ARC.shake = Math.max(ARC.shake, 9); ARC.buzz(40);
    } else if (o.isPlayer) {
      pop(W, 'Knocked off!', R.name + ' got you', '#ff6940', true);
    }
  } else {
    if (R.isPlayer) { addNitro(R, 14); pop(W, 'Shove!', o.name + ' wobbles', '#ffb736'); ARC.shake = Math.max(ARC.shake, 4); ARC.buzz(18); }
    if (o.isPlayer) { pop(W, 'Shoved!', 'by ' + R.name, '#e8452c'); ARC.shake = Math.max(ARC.shake, 6); ARC.buzz(25); }
  }
  if (R.isPlayer || o.isPlayer) { noise(0.16, { freq: 700, vol: 0.28 }); tone(120, 0.14, { type: 'square', vol: 0.12, slide: 70 }); }
}

const addNitro = (R, n) => { R.nitro = Math.min(100, R.nitro + n); };

function crash(W, R, dir, kind) {
  if (R.crash > 0 || R.finished) return;
  R.crash = 1; R.crashT = 0; R.crashDur = (kind === 'shove' ? 2.9 : 2.5) + Math.random() * 0.5; R.crashDir = dir || (R.x < 0 ? -1 : 1);
  R.crashKind = kind; R.crashSpin = (Math.random() - 0.5) * 2.5; R.nitroOn = false; R.shoveT = 0; R.wob = 0; R.stats.crashes++;
  R.crashV = R.v;
  if (R.isPlayer) {
    ARC.shake = Math.max(ARC.shake, 12); ARC.buzz(70);
    noise(0.7, { freq: 500, vol: 0.32 }); tone(160, 0.5, { type: 'sawtooth', slide: 40, vol: 0.12 });
    if (!W.attract && W.phase === 'racing') {
      // a wipeout in sight of a patrol ends the race
      for (let i = 0; i < W.patrols.length; i++) {
        const p = W.patrols[i];
        if (Math.abs(p.s - R.s) < 65) { W.busted = true; W.phase = 'busted'; W.bustT = 0; pop(W, 'Busted!', 'The patrol saw that', '#38e1ff', true); tone(660, 0.25, { type: 'square', vol: 0.12 }); tone(520, 0.25, { type: 'square', vol: 0.12, delay: 0.27 }); break; }
      }
      if (!W.busted && kind !== 'shove') pop(W, 'Wipeout!', 'Remounting...', '#ff6940');
    }
  }
  crashFx(W, R);
}

/* ------------------------------------------------------------ one rider, one step */
function stepRider(W, R, dt) {
  const T = W.T, live = W.phase === 'racing' || W.phase === 'finished' || W.phase === 'busted';
  R.wheel += R.v * dt / 0.32;
  if (R.invuln > 0) R.invuln -= dt;
  if (R.shoveCd > 0) R.shoveCd -= dt;
  if (R.shoveT > 0) {
    R.shoveT -= dt;
    if (!R.shoveDone && R.shoveT < 0.24) resolveShove(W, R);
    if (R.shoveT <= 0) { R.shoveT = 0; }
  }
  // crashed: slide, tumble, then remount
  if (R.crash > 0) {
    R.crashT += dt;
    R.v *= Math.exp(-2.4 * dt);
    R.vx *= Math.exp(-1.6 * dt);
    R.s += R.v * dt; R.x += R.vx * dt;
    if (Math.abs(R.x) > XW + 0.2) { R.x = Math.sign(R.x) * (XW + 0.2); R.vx = -R.vx * 0.2; }
    R.lean += ((R.crashDir > 0 ? 1.45 : -1.45) - R.lean) * Math.min(1, dt * 8);
    if (R.crashT >= R.crashDur * 0.82) {
      R.x += (clamp(R.x, -HALF + 1.2, HALF - 1.2) - R.x) * Math.min(1, dt * 5);
      R.lean += (0 - R.lean) * Math.min(1, dt * 10);
    }
    if (R.crashT >= R.crashDur) {
      R.crash = 0; R.crashT = 0; R.v = 5; R.vx = 0; R.lean = 0; R.invuln = 1.6; R.x = clamp(R.x, -HALF + 1.2, HALF - 1.2);
      if (R.isPlayer && !W.attract) pop(W, 'Back on!', '', '#44ffa8');
    }
    return;
  }
  const inp = !live || R.react > 0 || (W.phase === 'finished' && !R.isPlayer && R.finished) ? null
    : (R.isPlayer && !R.bot && !W.attract && W.phase === 'racing') ? readInput(W, R, dt) : aiControl(W, R, dt);
  if (R.react > 0 && live) R.react -= dt;
  let steer = 0, gas = false, brake = false, nit = false;
  if (inp) { steer = inp.steer; gas = inp.gas; brake = inp.brake; nit = inp.nit; if (inp.shove) startShove(W, R, inp.shove); }
  if (R.finished) { gas = false; brake = R.v > 12; steer = clamp(-R.x * 0.3 - R.vx * 0.2, -1, 1); }
  if (W.phase === 'grid' && R.isPlayer && !W.attract) { const ii = ARC.input; R.thr += ((ii.down('ArrowUp', 'KeyW') || ARC.touchMode || W.cfg.gas === 'auto' ? 1 : 0) - R.thr) * Math.min(1, dt * 6); }
  R.brakeIn = brake;
  if (R.brLatch > 0) R.brLatch -= dt;
  if (R.nLatch > 0) R.nLatch -= dt;
  if (W.phase !== 'grid') R.thr += ((gas ? 1 : 0) - R.thr) * Math.min(1, dt * 7);
  // nitro
  if (live && W.phase === 'racing' && nit && R.nitro > 0 && R.v > 8 && !R.finished) {
    if (!R.nitroOn && R.isPlayer) { noise(0.7, { filter: 'highpass', freq: 900, vol: 0.24 }); tone(240, 0.5, { type: 'sawtooth', slide: 900, vol: 0.09 }); }
    R.nitroOn = true;
  } else R.nitroOn = false;
  if (R.nitroOn) { R.nitro = Math.max(0, R.nitro - 30 * dt); if (R.nitro <= 0) { R.nitroOn = false; R.nLatch = 0; } }
  // slipstream: tucked in behind a rider or a truck
  let draft = 0;
  if (W.phase === 'racing' && R.v > 18) {
    for (let i = 0; i < W.riders.length; i++) { const o = W.riders[i]; if (o === R || o.crash > 0) continue; const ds = o.s - R.s; if (ds > 2.5 && ds < 16 && Math.abs(o.x - R.x) < 1.2) draft = Math.max(draft, 1 - ds / 18); }
    for (let i = 0; i < W.traffic.length; i++) { const o = W.traffic[i]; if (o.dir < 0) continue; const ds = o.s - o.k.hl - R.s; if (ds > 1 && ds < 20 && Math.abs(o.x - R.x) < o.k.hw + 0.3) draft = Math.max(draft, 1 - ds / 22); }
  }
  R.draft += (draft - R.draft) * Math.min(1, dt * 3);
  if (R.draft > 0.3) addNitro(R, 5 * R.draft * dt);
  // speed
  const top = R.top * (1 + 0.07 * R.draft) * (R.nitroOn ? 1.24 : 1) * (R.gravel > 0 ? 0.78 : 1);
  if (W.phase === 'grid') { R.v = 0; }
  else {
    let a = 0;
    if (gas) a += R.acc * (R.nitroOn ? 1.6 : 1) * Math.max(0.08, 1 - Math.pow(R.v / top, 2));
    if (brake) a -= 17;
    a -= 0.02 * R.v + (gas ? 0 : 1.2);
    if (R.v > top) a -= (R.v - top) * 1.5;
    R.v = Math.max(0, R.v + a * dt);
  }
  // shoulder and patches
  const onShoulder = Math.abs(R.x) > HALF + 0.2;
  if (onShoulder && R.v > 14) { R.v -= R.v * 0.5 * dt; if (Math.random() < dt * 25) dustAt(W, R, 1); }
  R.onShoulder = onShoulder;
  if (R.gravel > 0) R.gravel -= dt;
  if (R.oil > 0) R.oil -= dt;
  for (let i = 0; i < W.hazards.length; i++) {
    const h = W.hazards[i], ds = (R.s - h.s) / h.rs, dx = (R.x - h.x) / h.rx;
    if (ds * ds + dx * dx < 1) {
      if (h.kind === 'oil') { if (R.oil <= 0) { R.oil = 0.9; R.wob = Math.max(R.wob, 0.5 + Math.abs(R.lean)); if (R.isPlayer) { pop(W, 'Oil!', 'Keep it straight', '#a39e94'); noise(0.3, { filter: 'highpass', freq: 2000, vol: 0.1 }); } } }
      else { R.gravel = 0.5; if (Math.random() < dt * 30) gravelAt(W, R); if (R.isPlayer && R.wob < 0.2 && R.v > 25) { R.wob = 0.35; ARC.shake = Math.max(ARC.shake, 2.5); } }
    }
  }
  // lateral
  const grip = R.oil > 0 ? 0.25 : 1;
  const lowSp = clamp(R.v / 13, 0.3, 1);
  const sTarget = steer * R.steerMax * lowSp;
  R.vx += (sTarget - R.vx) * Math.min(1, dt * 6 * grip);
  const curv = curvAt(T, R.s);
  const push = R.v * R.v * curv * CENT * R.grip * (R.oil > 0 ? 1.5 : 1);
  if (R.wob > 0) { R.wob = Math.max(0, R.wob - dt); R.wobPh += dt * 17; R.vx += Math.sin(R.wobPh) * R.wob * 9 * dt; }
  R.s += R.v * dt;
  R.x += (R.vx - push) * dt;
  // footpeg scrape in hard corners
  const leanT = clamp(Math.atan2(R.v * R.v * curv, 9.8) * 0.95 + steer * 0.2 + R.vx * 0.015, -0.86, 0.86);
  R.lean += (leanT - R.lean) * Math.min(1, dt * 7);
  R.peg = Math.abs(R.lean) > 0.6 && R.v > 15 ? Math.abs(R.lean) - 0.56 : 0;
  if (R.peg > 0 && Math.random() < dt * 40 * R.peg) pegSparks(W, R);
  // the barrier: guard stones, rock wall or hedge
  if (Math.abs(R.x) > XW) {
    const side = Math.sign(R.x), out = (R.vx - push) * side;
    const k = side > 0 ? T.KR[rowOf(T, R.s)] : T.KL[rowOf(T, R.s)];
    if ((out > 6.2 || (out > 4 && R.v > 36)) && R.invuln <= 0) { crash(W, R, side, 'wall'); R.vx = -side * 1; R.x = side * XW; }
    else {
      R.x = side * XW; R.vx = -side * Math.max(1.2, Math.abs(R.vx) * 0.3); R.v *= Math.exp(-1.1 * dt);
      R.scrape = 0.2; R.wob = Math.max(R.wob, 0.2);
      scrapeFx(W, R, side, k);
      if (R.isPlayer) { ARC.shake = Math.max(ARC.shake, 2.2); if (Math.random() < dt * 12) noise(0.08, { filter: 'highpass', freq: 2400, vol: 0.12 }); }
    }
  }
  if (R.scrape > 0) R.scrape -= dt;
  // big wobble at speed can throw a rider
  if (R.wob > 1.25 && R.v > 22 && Math.random() < dt * 1.5) crash(W, R, Math.sign(R.vx) || 1, 'wobble');
}

/* ------------------------------------------------------------ contact between everything */
function contacts(W, dt) {
  const rs = W.riders, T = W.T;
  for (let i = 0; i < rs.length; i++) {
    const A = rs[i]; if (A.crash > 0) continue;
    for (let j = i + 1; j < rs.length; j++) {
      const B = rs[j]; if (B.crash > 0) continue;
      const ds = B.s - A.s, dx = B.x - A.x;
      if (Math.abs(ds) < 1.9 && Math.abs(dx) < 0.78) {
        const back = ds > 0 ? A : B, front = ds > 0 ? B : A;
        const sd = dx >= 0 ? 1 : -1;
        A.vx -= sd * 3; B.vx += sd * 3; A.x -= sd * 0.25 * dt * 10; B.x += sd * 0.25 * dt * 10;
        if (back.v > front.v + 3 && Math.abs(ds) > 1.1) { back.v = front.v - 1; back.wob = Math.max(back.wob, 0.6); front.wob = Math.max(front.wob, 0.3); }
        else { A.wob = Math.max(A.wob, 0.25); B.wob = Math.max(B.wob, 0.25); }
        A.lastHit = B.lastHit = W.t;
        if ((A.isPlayer || B.isPlayer) && W.t - (W.bumpSnd || 0) > 0.3) { W.bumpSnd = W.t; noise(0.1, { freq: 600, vol: 0.18 }); ARC.shake = Math.max(ARC.shake, 2); }
      }
    }
  }
  for (let i = 0; i < rs.length; i++) {
    const R = rs[i]; if (R.crash > 0 || R.invuln > 0) continue;
    for (let j = 0; j < W.traffic.length; j++) {
      const v = W.traffic[j], ds = v.s - R.s, dx = v.x - R.x;
      if (Math.abs(ds) < v.k.hl + 0.9 && Math.abs(dx) < v.k.hw + 0.32) {
        const rel = R.v - v.v;
        if (rel > 5) { crash(W, R, dx > 0 ? -1 : 1, 'traffic'); R.v = Math.max(v.v, 0) * 0.6; if (R.isPlayer) honk(v); }
        else { R.v = Math.min(R.v, Math.max(0, v.v) - 0.5); R.vx -= Math.sign(dx || 1) * 2; R.wob = Math.max(R.wob, 0.4); }
      }
      // horns at riders tucked in behind or racing head-on
      if (R.isPlayer && v.horn <= 0 && ((v.dir < 0 && ds > 0 && ds < 70 && Math.abs(dx) < 2.4) || (v.dir > 0 && ds > 0 && ds < 14 && Math.abs(dx) < 1.6))) honk(v);
    }
    for (let j = 0; j < W.cows.length; j++) {
      const c = W.cows[j], ds = c.s - R.s, dx = c.x - R.x;
      if (Math.abs(ds) < 1.5 && Math.abs(dx) < 0.95 && R.v > 6) {
        crash(W, R, dx > 0 ? -1 : 1, 'cow'); R.v *= 0.4;
        if (c.moo <= 0) { c.moo = 2; if (R.isPlayer || Math.abs(c.s - W.P.s) < 60) moo(); if (R.isPlayer) pop(W, 'Moo!', 'The cow is fine. You are not.', '#f5efe3'); }
      }
    }
    for (let j = 0; j < W.patrols.length; j++) {
      const p = W.patrols[j], ds = p.s - R.s, dx = p.x - R.x;
      if (Math.abs(ds) < 1.8 && Math.abs(dx) < 0.85) {
        if (R.v - p.v > 6) { crash(W, R, dx > 0 ? -1 : 1, 'patrol'); }
        else { R.v = Math.min(R.v, p.v); R.vx -= Math.sign(dx || 1) * 2; }
      }
    }
  }
}
function honk(v) { v.horn = 3; tone(392, 0.32, { type: 'square', vol: 0.06 }); tone(330, 0.32, { type: 'square', vol: 0.05 }); }
function moo() { tone(150, 0.7, { type: 'sawtooth', slide: 115, vol: 0.12 }); tone(110, 0.7, { type: 'triangle', slide: 95, vol: 0.1 }); }

/* ------------------------------------------------------------ passes, positions, the finish */
function passes(W) {
  const P = W.P;
  if (W.phase !== 'racing' || P.crash > 0) return;
  for (let i = 0; i < W.riders.length; i++) {
    const o = W.riders[i]; if (o === P) continue;
    const ahead = o.s > P.s, was = P.pass[o.idx];
    if (was === true && !ahead && o.crash <= 0) {
      if (Math.abs(o.x - P.x) < 3.6 && W.t - P.lastHit > 1.2) { P.stats.passes++; addNitro(P, 10); pop(W, 'Clean pass', o.name, '#44ffa8'); tone(880, 0.07, { type: 'triangle', vol: 0.08 }); }
    }
    P.pass[o.idx] = ahead;
  }
  for (let i = 0; i < W.traffic.length; i++) {
    const v = W.traffic[i], k = 't' + i;
    const ahead = v.s > P.s, was = P.pass[k];
    if (was === true && !ahead && Math.abs(v.x - P.x) < v.k.hw + 1.4 && P.v > 18) { P.stats.near++; addNitro(P, 6); pop(W, 'Close call', v.dir < 0 ? 'Oncoming ' + v.kind : 'Past the ' + v.kind, '#ffb736'); }
    P.pass[k] = ahead;
  }
}

function order(W) {
  return W.riders.slice().sort((a, b) => (a.finished && b.finished ? a.finT - b.finT : a.finished ? -1 : b.finished ? 1 : b.s - a.s));
}
const positionOf = (W, R) => order(W).indexOf(R) + 1;

function stepWorld(W, dtReal) {
  let dt = dtReal;
  if (W.slowT > 0) { W.slowT -= dtReal; dt *= ARC.reducedMotion ? 1 : 0.35; }
  if (W.phase === 'grid') {
    const before = Math.ceil(W.cd);
    W.cd -= dt;
    const after = Math.ceil(W.cd);
    if (after !== before && after > 0 && after <= 3 && !W.attract) tone(440, 0.16, { type: 'square', vol: 0.12 });
    if (W.cd <= 0) { W.phase = 'racing'; W.t = 0; if (!W.attract) { tone(880, 0.4, { type: 'square', vol: 0.14 }); W.banner = 'GO!'; W.bannerT = 1; } }
  } else if (W.phase === 'racing' || W.phase === 'finished' || W.phase === 'busted') {
    W.t += dt;
  }
  if (W.bannerT > 0) W.bannerT -= dtReal;
  for (let i = 0; i < W.riders.length; i++) stepRider(W, W.riders[i], dt);
  updateTraffic(W, dt); updateCows(W, dt); updatePatrols(W, dt);
  contacts(W, dt);
  passes(W);
  // finishing
  const T = W.T;
  for (let i = 0; i < W.riders.length; i++) {
    const R = W.riders[i];
    if (!R.finished && R.s >= T.finishS && W.phase !== 'grid') {
      R.finished = true; R.finT = W.t; R.crash = 0;
      if (R.isPlayer && !W.attract && W.phase === 'racing') {
        W.phase = 'finished'; W.finWait = 0; P_finish(W);
      }
    }
  }
  if (W.phase === 'finished') { W.finWait += dtReal; if (W.finWait > 3.6 && !W.attract) endRace(W); }
  if (W.phase === 'busted') { W.bustT += dtReal; if (W.bustT > 2.2) endRace(W); }
  for (let i = W.pops.length - 1; i >= 0; i--) { W.pops[i].t += dtReal; if (W.pops[i].t > 1.6) W.pops.splice(i, 1); }
  if (W.attract && W.P.s > T.finishS - 30) {
    // the menu backdrop loops: start again
    const k = W.attractKey; Wd = newWorld(W.cfg); Wd.attractKey = k;
  }
  if (W.P.isPlayer && !W.attract) engineSet(W.P);
}

function P_finish(W) {
  const P = W.P, pos = positionOf(W, P);
  P.place = pos;
  W.banner = W.cfg.mode === 'time' ? 'FINISH' : ordinal(pos).toUpperCase(); W.bannerT = 3;
  tone(660, 0.18, { type: 'triangle', vol: 0.14 }); tone(880, 0.18, { type: 'triangle', vol: 0.14, delay: 0.18 }); tone(1320, 0.4, { type: 'triangle', vol: 0.14, delay: 0.36 });
  confetti(W, 160);
  if (pos <= 3 && W.cfg.mode !== 'time') ARC.toast(pos === 1 ? 'Winner!' : 'Podium!', W.T.def.name, 1800);
}

const PRIZE = [1200, 800, 520, 320, 200, 140, 100, 80];
const PTS = [1000, 750, 560, 420, 320, 240, 180, 140];

function endRace(W) {
  if (W.over) return; W.over = true;
  const T = W.T, P = W.P, mode = W.cfg.mode, d = W.d;
  engineStop();
  // riders still out on the road finish by their pace
  const rest = W.riders.filter((r) => !r.finished).map((r) => ({ r, eta: W.t + Math.max(0, T.finishS - r.s) / Math.max(12, r.v * 0.8 + 8) + (r.crash > 0 ? 2 : 0) }));
  rest.sort((a, b) => a.eta - b.eta);
  rest.forEach((x) => { if (!(W.busted && x.r === P)) { x.r.finT = x.eta; x.r.finished = true; } });
  const ord = W.riders.slice().filter((r) => r.finished).sort((a, b) => a.finT - b.finT);
  const pos = W.busted ? 0 : ord.indexOf(P) + 1;
  const st = P.stats;
  let score = 0, cash = 0, unlockMsg = '';
  if (mode === 'time') score = W.busted ? 0 : Math.round(200000 / Math.max(30, P.finT));
  else score = W.busted ? Math.max(0, st.shoves * 40 + st.knocks * 80) : PTS[pos - 1] + st.shoves * 40 + st.knocks * 80 + st.passes * 25 + st.near * 10 - st.crashes * 40;
  score = Math.max(0, Math.round(score * (d === DIFF.hard ? 1.25 : d === DIFF.easy ? 0.8 : 1)));
  if (!W.busted && mode !== 'time') {
    const mult = T.def.prize * (mode === 'career' ? 1 : 0.5) * (d === DIFF.hard ? 1.3 : d === DIFF.easy ? 0.75 : 1);
    cash = Math.round((PRIZE[pos - 1] + st.shoves * 30 + st.knocks * 60) * mult);
    SAVE.cash += cash;
    if (mode === 'career' && pos <= 3) {
      const ci = COURSE_IDX[T.id];
      if (SAVE.unlocked < ci + 2 && ci + 1 < COURSES.length) { SAVE.unlocked = ci + 2; unlockMsg = COURSES[ci + 1].name + ' unlocked'; }
    }
  }
  if (!W.busted) {
    const b = SAVE.best[T.id] || (SAVE.best[T.id] = {});
    if (P.finT && (b.time == null || P.finT < b.time)) b.time = +P.finT.toFixed(2);
    if (mode !== 'time' && (b.place == null || pos < b.place)) b.place = pos;
  }
  saveGame();
  W.results = { pos, score, cash, time: P.finT, busted: W.busted };
  W.phase = 'over';
  const rows = (W.busted ? ord.concat([P]) : ord).map((r, i) => '<tr class="' + (r === P ? 'me' : '') + '"><td>' + (r === P && W.busted ? '-' : i + 1) + '</td><td>' + ARC.esc(r.name) + '<small>' + ARC.esc(r.b.name) + '</small></td><td>' + (r === P && W.busted ? 'Busted' : fmtTime(r.finT)) + '</td></tr>').join('');
  const table = mode === 'time' ? '' : '<table class="gr-res">' + rows + '</table>';
  const line = '<div class="gr-line"><span>Shoves<b>' + st.shoves + '</b></span><span>Knock-offs<b>' + st.knocks + '</b></span><span>Clean passes<b>' + st.passes + '</b></span><span>Wipeouts<b>' + st.crashes + '</b></span></div>';
  const money1 = cash ? '<p class="gr-cash">Prize money <b>' + money(cash) + '</b>. Wallet <b>' + money(SAVE.cash) + '</b>.' + (unlockMsg ? ' <b>' + ARC.esc(unlockMsg) + '!</b>' : '') + '</p>' : '';
  let title, eyebrow;
  if (W.busted) { title = 'Busted, <em>race over</em>'; eyebrow = 'Patrol'; }
  else if (mode === 'time') { title = fmtTime(P.finT); eyebrow = 'Time trial, ' + T.def.name; }
  else { title = ordinal(pos) + ' <em>place</em>'; eyebrow = T.def.name; }
  const html = (W.busted ? '<p>You wiped out right in front of a patrol rider. They flagged you off the road. Ride clean when the blue lights are near.</p>' : '') + table + line + money1;
  ARC.over({ eyebrow, title, html, score, scoreLabel: 'Ride score', again: 'Race again' });
}

/* ------------------------------------------------------------ the 2D fallback: a pseudo-3D road on a canvas */
// Same courses, riders and rules as the 3D game; the road is projected segment by segment.
function decorFor() { return { falls: [] }; }
const PARTS = [];
function part(W, s, x, h, vs, vx, vh, life, size, col, grav) { if (PARTS.length > 260) PARTS.shift(); PARTS.push({ s, x, h, vs, vx, vh, life, max: life, size, col, grav: grav == null ? 9 : grav }); }
function dustAt(W, R) { part(W, R.s - 0.5, R.x, 0.2, R.v * 0.6, (Math.random() - 0.5) * 2, 1 + Math.random(), 0.9, 0.7, W.T.look.dirt, -0.2); }
function gravelAt(W, R) { part(W, R.s - 0.5, R.x, 0.1, R.v * 0.7, (Math.random() - 0.5) * 4, 2 + Math.random() * 2, 0.5, 0.12, '#5a4a3a'); }
function pegSparks(W, R) { part(W, R.s, R.x + (R.lean > 0 ? 0.4 : -0.4), 0.05, R.v * 0.8, (Math.random() - 0.5) * 2, Math.random() * 2, 0.3, 0.08, '#ffd27a'); }
function scrapeFx(W, R, side) { for (let i = 0; i < 2; i++) part(W, R.s, side * XW, 0.4, R.v * 0.8, -side * Math.random() * 2, Math.random() * 3, 0.3, 0.09, '#ffd27a'); }
function clashFx(W, A, B, k) { for (let i = 0; i < 14 * k + 6; i++) part(W, (A.s + B.s) / 2, (A.x + B.x) / 2, 1, A.v * 0.9 + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6, Math.random() * 4, 0.4, 0.1, '#ffe9b0'); }
function crashFx(W, R) { for (let i = 0; i < 16; i++) part(W, R.s, R.x, 0.3, R.v * 0.6, (Math.random() - 0.5) * 6, Math.random() * 4, 0.6, 0.12, i % 2 ? '#ffd27a' : W.T.look.dirt); }
function confetti(W, n) { const c = ['#ff6940', '#ffb736', '#44ffa8', '#38e1ff', '#e94f8a', '#f5efe3']; for (let i = 0; i < n; i++) part(W, W.P.s + 4 + Math.random() * 10, (Math.random() - 0.5) * 12, 4 + Math.random() * 4, W.P.v * 0.7, (Math.random() - 0.5) * 4, Math.random() * 3, 3, 0.18, c[i % c.length], 2); }

const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif';
const INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736', ORANGE = '#ff6940', TEAL = '#38e1ff';
function txt(ctx, s, x, y, size, color, align, weight, fam) { ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function plate(ctx, x, y, w, h) { rr(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(12,10,8,0.58)'; ctx.fill(); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255, t = f < 0 ? 0 : 255, k = Math.abs(f);
  return 'rgb(' + Math.round(r + (t - r) * k) + ',' + Math.round(g + (t - g) * k) + ',' + Math.round(b + (t - b) * k) + ')';
}

// camera and projection
const CAM = { wx: 0, wy: 0, wz: 0, fx: 0, fz: -1, rx: 1, rz: 0, d: 1, hz: 0.45 };
function project(T, s, x, h, a) {
  frameAt(T, s);
  const dx = FR.x + FR.rx * x - CAM.wx, dz = FR.z + FR.rz * x - CAM.wz;
  const z = dx * CAM.fx + dz * CAM.fz; if (z < 0.6) return null;
  const lat = dx * CAM.rx + dz * CAM.rz, wy = FR.y + h - CAM.wy, sc = CAM.d / z * a.w / 2;
  return { x: a.w / 2 + lat * sc, y: a.h * CAM.hz - wy * sc, sc, z };
}
function drawRiderSprite(ctx, p, R, a) {
  const k = p.sc, w = 0.9 * k, base = p.y;
  if (w < 1.5) return;
  ctx.save(); ctx.translate(p.x, base);
  const crash = R.crash > 0;
  ctx.rotate(crash ? (R.crashDir > 0 ? 1.3 : -1.3) : R.lean * 0.9);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, w * 0.12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#121214'; rr(ctx, -w * 0.09, -w * 0.62, w * 0.18, w * 0.62, w * 0.06); ctx.fill();
  ctx.fillStyle = R.paint; rr(ctx, -w * 0.22, -w * 1.02, w * 0.44, w * 0.42, w * 0.1); ctx.fill();
  ctx.fillStyle = '#ff2a1a'; ctx.fillRect(-w * 0.08, -w * 0.72, w * 0.16, w * 0.06);
  ctx.fillStyle = '#f2c230'; ctx.fillRect(-w * 0.09, -w * 0.64, w * 0.18, w * 0.08);
  if (!crash) {
    const sh = R.shoveT > 0 ? Math.sin(clamp((0.42 - R.shoveT) / 0.42, 0, 1) * Math.PI) * R.shoveSide : 0;
    ctx.fillStyle = R.jacket; rr(ctx, -w * 0.24 + sh * w * 0.2, -w * 1.58, w * 0.48, w * 0.62, w * 0.18); ctx.fill();
    if (sh) { ctx.fillRect(sh > 0 ? w * 0.2 : -w * 0.62, -w * 1.42, w * 0.42, w * 0.12); }
    ctx.fillStyle = R.helmet; ctx.beginPath(); ctx.arc(sh * w * 0.2, -w * 1.72, w * 0.19, 0, TAU); ctx.fill();
  }
  ctx.restore();
  if (crash) { ctx.fillStyle = R.jacket; ctx.beginPath(); ctx.arc(p.x + (R.crashDir || 1) * w * 1.2, base - w * 0.3, w * 0.25, 0, TAU); ctx.fill(); ctx.fillStyle = R.helmet; ctx.beginPath(); ctx.arc(p.x + (R.crashDir || 1) * w * 1.45, base - w * 0.45, w * 0.17, 0, TAU); ctx.fill(); }
}
function drawVehicle(ctx, p, v) {
  const k = p.sc, w = v.k.hw * 2 * k, h = v.k.h * k;
  if (w < 2) return;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(p.x - w * 0.55, p.y - h * 0.05, w * 1.1, h * 0.08);
  ctx.fillStyle = shade(v.col, -0.15); ctx.fillRect(p.x - w / 2, p.y - h, w, h * 0.92);
  if (v.dir > 0 && v.kind === 'truck') { ctx.fillStyle = '#f2c230'; ctx.fillRect(p.x - w * 0.4, p.y - h * 0.85, w * 0.8, h * 0.5); ctx.fillStyle = '#c2272d'; ctx.fillRect(p.x - w * 0.35, p.y - h * 0.78, w * 0.7, h * 0.15); }
  else { ctx.fillStyle = '#1a2633'; ctx.fillRect(p.x - w * 0.4, p.y - h * 0.86, w * 0.8, h * 0.3); }
  ctx.fillStyle = v.dir > 0 ? '#ff2a1a' : '#fff2c8'; ctx.fillRect(p.x - w * 0.45, p.y - h * 0.32, w * 0.12, h * 0.06); ctx.fillRect(p.x + w * 0.33, p.y - h * 0.32, w * 0.12, h * 0.06);
  ctx.fillStyle = '#151517'; ctx.fillRect(p.x - w * 0.45, p.y - h * 0.1, w * 0.2, h * 0.1); ctx.fillRect(p.x + w * 0.25, p.y - h * 0.1, w * 0.2, h * 0.1);
}

function drawWorld2D(ctx, a, W) {
  const T = W.T, L = T.look, P = W.P, w = a.w, h = a.h, port = w / h < 0.9;
  const cs = P.s - 6.2;
  frameAt(T, cs);
  CAM.wx = FR.x + FR.rx * P.x * 0.85; CAM.wz = FR.z + FR.rz * P.x * 0.85; CAM.wy = FR.y + 1.9;
  frameAt(T, P.s + 6);
  CAM.fx = FR.fx; CAM.fz = FR.fz; CAM.rx = FR.rx; CAM.rz = FR.rz;
  CAM.d = 1 / Math.tan((port ? 48 : 36) * Math.PI / 180); CAM.hz = port ? 0.5 : 0.44;
  const hy = h * CAM.hz;
  // sky and far hills
  const sg = ctx.createLinearGradient(0, 0, 0, hy);
  sg.addColorStop(0, L.skyTop); sg.addColorStop(0.6, L.skyMid); sg.addColorStop(1, L.skyHor);
  ctx.fillStyle = sg; ctx.fillRect(0, 0, w, hy + 2);
  const head = Math.atan2(CAM.fx, -CAM.fz), par = ((head * 600) % w + w) % w;
  ctx.fillStyle = shade(L.fog, -0.28);
  ctx.beginPath(); ctx.moveTo(0, hy);
  for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, hy - 30 - Math.abs(Math.sin((x + par) * 0.006)) * 60 - Math.sin((x + par) * 0.021) * 12);
  ctx.lineTo(w, hy); ctx.fill();
  ctx.fillStyle = L.fog; ctx.fillRect(0, hy, w, h - hy);
  // road segments, gathered near to far, painted far to near
  const n0 = rowOf(T, cs), DRAW = 150, S = [];
  for (let n = 1; n < DRAW; n++) {
    const i = n0 + n; if (i >= T.N) break;
    const s = i * SEGM, pc = project(T, s, 0, 0, a); if (!pc) continue;
    const pl = project(T, s, -HALF, 0, a), pr = project(T, s, HALF, 0, a);
    const gl = project(T, s, -7.0, 0, a), gr = project(T, s, 7.0, 0, a);
    if (!pl || !pr || !gl || !gr) continue;
    S.push({ i, s, n, pc, pl, pr, gl, gr });
  }
  {
    const s = cs + 0.9, pc = project(T, s, 0, 0, a), pl = project(T, s, -HALF, 0, a), pr = project(T, s, HALF, 0, a), gl = project(T, s, -7.0, 0, a), gr = project(T, s, 7.0, 0, a);
    if (pc && pl && pr && gl && gr) S.unshift({ i: rowOf(T, s), s, n: 0, pc, pl, pr, gl, gr });
  }
  const quad = (x0, x1, y0, x2, x3, y1, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x3, y1); ctx.lineTo(x2, y1); ctx.closePath(); ctx.fill(); };
  for (let k = S.length - 1; k >= 1; k--) {
    const A = S[k], B = S[k - 1], i = A.i, alt = Math.floor(i / 3) % 2;
    if (A.pc.y >= B.pc.y + 0.01 && B.pc.y < h) { /* behind a crest */ }
    const kl = T.KL[i], kr = T.KR[i];
    const bank = (kk) => (kk > 0.4 ? shade(L.rock, -0.15 + alt * 0.05) : kk < -0.4 ? shade(L.grass2, -0.3 + alt * 0.05) : (alt ? L.grass : L.grass2));
    ctx.fillStyle = bank(kl); ctx.fillRect(0, A.pc.y, (A.pc.x + B.pc.x) / 2, B.pc.y - A.pc.y + 1);
    ctx.fillStyle = bank(kr); ctx.fillRect((A.pc.x + B.pc.x) / 2, A.pc.y, w, B.pc.y - A.pc.y + 1);
    [[-1, kl, A.gl, B.gl], [1, kr, A.gr, B.gr]].forEach((g) => {
      if (g[1] <= 0.4) return;
      ctx.fillStyle = shade(L.rock, -0.08 - alt * 0.08);
      const e = g[0] < 0 ? 0 : w;
      ctx.beginPath(); ctx.moveTo(g[2].x, g[2].y); ctx.lineTo(g[3].x, g[3].y); ctx.lineTo(g[3].x + g[0] * 12 * g[3].sc, g[3].y - 22 * g[3].sc); ctx.lineTo(g[2].x + g[0] * 12 * g[2].sc, g[2].y - 22 * g[2].sc); ctx.closePath(); ctx.fill();
      void e;
    });
    quad(A.gl.x, A.gr.x, A.pc.y, B.gl.x, B.gr.x, B.pc.y, shade(L.dirt, alt ? -0.12 : 0));
    quad(A.pl.x, A.pr.x, A.pc.y, B.pl.x, B.pr.x, B.pc.y, alt ? '#55545a' : '#5d5c62');
    quad(A.pl.x, A.pl.x + 0.16 * A.pc.sc, A.pc.y, B.pl.x, B.pl.x + 0.16 * B.pc.sc, B.pc.y, '#e8e6dc');
    quad(A.pr.x - 0.16 * A.pc.sc, A.pr.x, A.pc.y, B.pr.x - 0.16 * B.pc.sc, B.pr.x, B.pc.y, '#e8e6dc');
    if (Math.floor(i / 2) % 3 === 0) quad(A.pc.x - 0.08 * A.pc.sc, A.pc.x + 0.08 * A.pc.sc, A.pc.y, B.pc.x - 0.08 * B.pc.sc, B.pc.x + 0.08 * B.pc.sc, B.pc.y, '#e8e6dc');
    [[-1, kl, A.gl], [1, kr, A.gr]].forEach((g) => { if (g[1] < -0.35 && i % 2 === 0) { const gw = 0.42 * g[2].sc; ctx.fillStyle = i % 4 ? '#f4f1ea' : '#202124'; ctx.fillRect(g[2].x - gw / 2, g[2].y - 0.55 * g[2].sc, gw, 0.55 * g[2].sc); } });
    const fogK = A.n / DRAW;
    if (fogK > 0.3) { ctx.globalAlpha = clamp((fogK - 0.3) * 1.3, 0, 0.85); ctx.fillStyle = L.fog; ctx.fillRect(0, A.pc.y - 24 * A.pc.sc, w, B.pc.y - A.pc.y + 24 * A.pc.sc + 1); ctx.globalAlpha = 1; }
  }
  // sprites far to near: riders, traffic, cows, patrol, patches
  const list = [];
  W.riders.forEach((R) => list.push({ s: R.s, x: R.x, R }));
  W.traffic.forEach((v) => list.push({ s: v.s, x: v.x, v }));
  W.cows.forEach((c) => list.push({ s: c.s, x: c.x, c }));
  W.patrols.forEach((p) => list.push({ s: p.s, x: p.x, pt: p }));
  W.hazards.forEach((hz) => list.push({ s: hz.s, x: hz.x, hz, flat: true }));
  list.sort((A2, B2) => (A2.flat === B2.flat ? B2.s - A2.s : A2.flat ? -1 : 1));
  for (let k = 0; k < list.length; k++) {
    const o = list[k]; if (o.s < cs + 1 || o.s > cs + DRAW * SEGM) continue;
    const p = project(T, o.s, o.x, 0, a); if (!p) continue;
    if (o.R) drawRiderSprite(ctx, p, o.R, a);
    else if (o.v) drawVehicle(ctx, p, o.v);
    else if (o.c) { const s2 = p.sc; ctx.fillStyle = o.c.col; ctx.fillRect(p.x - 0.5 * s2, p.y - 1.4 * s2, 1.0 * s2, 0.7 * s2); ctx.fillRect(p.x - 0.45 * s2, p.y - 0.8 * s2, 0.12 * s2, 0.8 * s2); ctx.fillRect(p.x + 0.33 * s2, p.y - 0.8 * s2, 0.12 * s2, 0.8 * s2); }
    else if (o.pt) { drawRiderSprite(ctx, p, { paint: '#f4f4f4', jacket: '#eef1f4', helmet: '#f4f4f4', lean: 0, crash: 0, shoveT: 0 }, a); const on = a.reducedMotion || Math.floor(o.pt.beacon * 6) % 2; ctx.fillStyle = on ? '#2a6bff' : '#ff2a2a'; ctx.fillRect(p.x - 0.1 * p.sc, p.y - 2.05 * p.sc, 0.2 * p.sc, 0.12 * p.sc); }
    else if (o.hz) { ctx.fillStyle = o.hz.kind === 'oil' ? 'rgba(10,10,14,.7)' : 'rgba(110,90,70,.75)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, o.hz.rx * p.sc, Math.max(1, o.hz.rs * p.sc * 0.12), 0, 0, TAU); ctx.fill(); }
  }
  for (let k = PARTS.length - 1; k >= 0; k--) {
    const q = PARTS[k], p = project(T, q.s, q.x, q.h, a);
    if (p) { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); ctx.fillStyle = q.col; const sz = Math.max(1.5, q.size * p.sc); ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz); }
  }
  ctx.globalAlpha = 1;
}
function stepParts(dt) {
  for (let k = PARTS.length - 1; k >= 0; k--) { const q = PARTS[k]; q.life -= dt; if (q.life <= 0) { PARTS.splice(k, 1); continue; } q.s += q.vs * dt; q.x += q.vx * dt; q.h = Math.max(0, q.h + q.vh * dt); q.vh -= q.grav * dt; }
}

function drawHUD2D(ctx, a, W) {
  const P = W.P, T = W.T, pad = a.hudPad(), w = a.w, h = a.h;
  plate(ctx, pad.left, pad.top, 124, 60);
  if (W.cfg.mode === 'time') txt(ctx, 'TIME TRIAL', pad.left + 12, pad.top + 18, 10, GOLD); else { const pos = positionOf(W, P); txt(ctx, ordinal(pos) + ' / ' + W.riders.length, pad.left + 12, pad.top + 22, 22, INK, 'left', '600', F_DISP); }
  txt(ctx, fmtTime(W.phase === 'grid' ? 0 : P.finished ? P.finT : W.t), pad.left + 12, pad.top + 46, 13, INK);
  plate(ctx, w - pad.right - 124, pad.top, 124, 60);
  txt(ctx, Math.round(P.v * KMH) + ' km/h', w - pad.right - 12, pad.top + 22, 20, INK, 'right', '600', F_DISP);
  ctx.fillStyle = 'rgba(251,245,236,.15)'; ctx.fillRect(w - pad.right - 112, pad.top + 42, 100, 6);
  ctx.fillStyle = '#5aa8ff'; ctx.fillRect(w - pad.right - 112, pad.top + 42, P.nitro, 6);
  const sw = Math.min(w - 300, 420);
  if (sw > 80) {
    const sx = (w - sw) / 2, sy = pad.top + 16, at = (s) => sx + clamp((s - T.startS) / (T.finishS - T.startS), 0, 1) * sw;
    ctx.fillStyle = 'rgba(251,245,236,.2)'; ctx.fillRect(sx, sy, sw, 3);
    W.patrols.forEach((p) => { ctx.fillStyle = TEAL; ctx.fillRect(at(p.s) - 2, sy - 8, 4, 5); });
    for (let i = W.riders.length - 1; i >= 0; i--) { const R = W.riders[i]; ctx.fillStyle = R.isPlayer ? ORANGE : R.paint; ctx.beginPath(); ctx.arc(at(R.s), sy + 1.5, R.isPlayer ? 5 : 3, 0, TAU); ctx.fill(); }
  }
  const cy = h * 0.32;
  if (W.phase === 'grid') { const n = Math.ceil(W.cd); txt(ctx, n <= 3 ? String(n) : T.def.name.toUpperCase(), w / 2, cy, n <= 3 ? 80 : 18, GOLD, 'center', '600', F_DISP); }
  if (W.bannerT > 0 && W.banner) { ctx.globalAlpha = clamp(W.bannerT, 0, 1); txt(ctx, W.banner, w / 2, cy, 60, GOLD, 'center', '600', F_DISP); ctx.globalAlpha = 1; }
  if (W.phase === 'racing' && P.crash <= 0) {
    [-1, 1].forEach((sd) => { const o = inRange(W, P, sd); if (!o) return; const bw = 140, bx = sd < 0 ? pad.left : w - pad.right - bw, by = h - pad.bottom - 54; rr(ctx, bx, by, bw, 42, 10); ctx.fillStyle = 'rgba(255,105,64,.8)'; ctx.fill(); txt(ctx, (sd < 0 ? '◀ ' : '') + 'SHOVE ' + o.name.split(' ')[0].toUpperCase() + (sd > 0 ? ' ▶' : ''), bx + bw / 2, by + 21, 11, '#fff7ee', 'center', '700'); });
    let near = 1e9; W.patrols.forEach((p) => { const d = p.s - P.s; if (d > -40 && d < 160) near = Math.min(near, Math.abs(d)); });
    if (near < 1e9) txt(ctx, 'PATROL ' + Math.round(near) + ' m, RIDE CLEAN', w / 2, pad.top + 62, 11, '#cfe0ff', 'center', '700');
  }
  if (P.crash > 0 && W.phase === 'racing') txt(ctx, a.touchMode ? 'Tap to remount faster' : 'Press Up or Space to remount faster', w / 2, h * 0.62, 12, INK, 'center');
  W.pops.forEach((p, i) => { ctx.globalAlpha = clamp(1.6 - p.t, 0, 1); txt(ctx, p.text, w / 2, h * 0.42 - (W.pops.length - 1 - i) * 40, p.big ? 28 : 20, p.col, 'center', '600', F_DISP); if (p.sub) txt(ctx, p.sub, w / 2, h * 0.42 - (W.pops.length - 1 - i) * 40 + 20, 11, INK, 'center'); ctx.globalAlpha = 1; });
}

function menuProps2D() {
  return {
    eyebrow: 'Mountain road racing', title: 'Ghat <em>Riders</em>', noBest: true,
    html: '<p>Race seven rivals down winding mountain highways. Barge riders alongside with a shoulder shove, weave through trucks and buses, and brake for the hairpins. This browser has no 3D support, so this is the lighter 2D edition of the same race.</p><p style="font-family:var(--font-mono);font-size:12px;color:var(--ink-dim)">Wallet ' + money(SAVE.cash) + ' · ' + SAVE.unlocked + ' of 3 courses unlocked</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'career', choices: [{ v: 'career', label: 'Career' }, { v: 'quick', label: 'Quick race' }, { v: 'time', label: 'Time trial' }] },
      { id: 'course', label: 'Course', value: 'misty', choices: COURSES.map((c, i) => ({ v: c.id, label: c.name + (i >= SAVE.unlocked ? ' (locked in Career)' : '') })) },
      { id: 'bike', label: 'Bike', value: 'scout', choices: BIKE_ORDER.map((id) => ({ v: id, label: BIKES[id].name + (SAVE.owned.indexOf(id) < 0 ? ' (' + money(BIKES[id].price) + ')' : '') })) },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] }
    ]
  };
}
function debugState2D() {
  const W = Wd, a = ARC;
  if (!W) return { phase: 'none', state: a.state };
  const P = W.P, st = P.stats;
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, mode: W.cfg.mode, course: W.T.id, diff: W.cfg.diff, bike: W.cfg.bike, renderer: '2d',
    position: positionOf(W, P), riders: W.riders.length, speed: Math.round(P.v * KMH), distance: Math.round(Math.max(0, P.s - W.T.startS)), progress: +clamp((P.s - W.T.startS) / (W.T.finishS - W.T.startS), 0, 1).toFixed(3),
    x: +P.x.toFixed(2), lean: +P.lean.toFixed(2), steer: +(P.steerIn || 0).toFixed(2), nitro: Math.round(P.nitro), nitroOn: P.nitroOn,
    shoves: st.shoves, knockoffs: st.knocks, shovesTaken: st.taken, crashes: st.crashes, passes: st.passes, closeCalls: st.near, crashed: P.crash > 0,
    time: +W.t.toFixed(2), busted: W.busted, alive: !W.busted, finished: P.finished, cash: SAVE.cash, unlocked: SAVE.unlocked
  };
}

Arcade.create({
  slug: 'ghat-riders', title: 'Ghat Riders', genre: 'Mountain road racing',
  hint: 'Arrows or WASD to ride. Z / X to shove left or right, Space shoves the nearest rider. Shift or N for nitro.',
  touchHint: 'Stick steers. Shove L and Shove R barge, Nitro boosts, Brake slows.',
  keys: [['Left Right / A D', 'Steer'], ['Up / W', 'Throttle'], ['Down / S', 'Brake'], ['Z or J', 'Shove left'], ['X or K', 'Shove right'], ['Space', 'Shove the nearest rider'], ['Shift / N', 'Nitro']],
  gameKeys: ['ShiftLeft', 'ShiftRight'],
  mouse: { steer: false, cursor: 'crosshair', keys: [['Move mouse', 'Steer toward the pointer'], ['Click / hold', 'Throttle']] },
  gamepad: { buttons: ['KeyN', 'KeyZ', 'KeyX', 'Space'], rt: 'ArrowUp', lt: 'ArrowDown' },
  touch: { stick: true, pads: [{ label: 'Shove L', key: 'KeyZ', hot: true }, { label: 'Shove R', key: 'KeyX', hot: true }, { label: 'Nitro', key: 'KeyN' }, { label: 'Brake', key: 'ArrowDown' }] },
  touchKeys: [['On-screen stick', 'Steer'], ['Shove L / Shove R', 'Barge a rider'], ['Nitro', 'Boost'], ['Brake', 'Slow down'], ['Throttle', 'Always on']],
  gestures: {
    drag: 'x', tilt: true,
    hint: 'Drag to steer. Swipe left or right to shove, up for nitro. Hold a downward drag to brake.',
    keys: [['Drag left or right', 'Steer'], ['Swipe left / right', 'Shove that way'], ['Tap', 'Shove the nearest rider'], ['Swipe up', 'Nitro'], ['Hold a downward drag', 'Brake'], ['Throttle', 'Always on']]
  },
  formatScore: (v) => Math.round(v).toLocaleString('en-IN') + ' pts',
  init(a) {
    ARC = a; loadSave();
    const origMenu = a.menu;
    a.menu = function (p) { engineStop(); return origMenu(Object.assign(menuProps2D(), p || {})); };
    a.debug = debugState2D;
    a.dev = { world: () => Wd, bot: (on) => { if (Wd) Wd.P.bot = on !== false; }, shove: (sd) => { if (Wd) Wd.queuedShove = sd; }, ff: (sec) => { const n = Math.round(sec * 50); for (let i = 0; i < n && Wd && ARC.state === 'play' && !Wd.over; i++) stepWorld(Wd, 0.02); } };
    a.menu();
  },
  start(a, ch) {
    let course = ch.course, bike = ch.bike;
    const mode = ch.mode || 'career';
    if (mode === 'career' && COURSE_IDX[course] >= SAVE.unlocked) course = COURSES[SAVE.unlocked - 1].id;
    if (SAVE.owned.indexOf(bike) < 0) bike = 'scout';
    PARTS.length = 0;
    Wd = newWorld({ course, mode, bike, diff: ch.diff || 'normal', gas: a.touchMode ? 'auto' : 'manual', attract: false });
    engineStart();
  },
  update(dt, a) {
    if (!Wd) return;
    const W = Wd, P = W.P, inp = a.input, gest = a.touchMode && a.touchStyle !== 'pads';
    const sw = inp.swipe(), tap = inp.tap();
    if (W.phase === 'racing') {
      if (P.crash > 0) { if (tap || sw || inp.hit('ArrowUp', 'KeyW', 'Space')) P.crashT = Math.min(P.crashDur * 0.8, P.crashT + 0.3); }
      else {
        if (sw && gest) { if (sw.dir === 'left') W.queuedShove = -1; else if (sw.dir === 'right') W.queuedShove = 1; else if (sw.dir === 'up') P.nLatch = 1.2 + 0.9 * sw.power; else if (sw.dir === 'down') P.brLatch = 0.5; }
        if (tap && a.touchMode) { const sd = nearestSide(W, P); if (sd) W.queuedShove = sd; }
      }
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(W, dt / n);
    stepParts(dt);
  },
  idle(dt, a) {
    if (a.state !== 'menu') return;
    const c = a.choices;
    if (!Wd || !Wd.attract || Wd.attractKey !== c.course) { Wd = newWorld({ course: c.course || 'misty', mode: 'quick', bike: 'scout', diff: 'normal', gas: 'auto', attract: true }); Wd.attractKey = c.course; Wd.P.s = 260; Wd.riders.forEach((r, i) => { if (i) r.s = 250 + i * 7; }); }
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(Wd, dt / n);
    stepParts(dt);
  },
  render(ctx, a) {
    const W = Wd;
    if (!W) { ctx.fillStyle = '#060503'; ctx.fillRect(0, 0, a.w, a.h); return; }
    drawWorld2D(ctx, a, W);
    if (a.state !== 'menu') drawHUD2D(ctx, a, W);
  },
  onPause() { engineStop(); },
  onResume() { if (Wd && !Wd.over) engineStart(); },
  onOver() { engineStop(); }
});
})();
