import * as THREE from '/games/vendor/three/three.module.min.js';

/*
 * Ghat Riders, a 3D motorbike road race with shoulder barging.
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
  else if (sx === 0 && !a.touchMode && inp.pointer.seen && inp.pointer.type === 'mouse') {
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
  if (!R.finished) {
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

/* ------------------------------------------------------------ geometry helpers */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _c = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const V = { x: 0, y: 0, z: 0 }, V2 = { x: 0, y: 0, z: 0 };

// Bake a primitive: place it, give it one vertex colour, drop its uvs so a whole model merges into one mesh.
function prep(geo, hex, pos, rot, scl) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  if (scl == null) _s3.set(1, 1, 1); else if (typeof scl === 'number') _s3.set(scl, scl, scl); else _s3.set(scl[0], scl[1], scl[2]);
  _p3.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _m4.compose(_p3, _q, _s3); g.applyMatrix4(_m4);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function mergeG(list) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const boxG = (w, h, d, hex, pos, rot) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot);
const cylG = (rt, rb, h, seg, hex, pos, rot, scl) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, scl);
const sphG = (r, hex, pos, scl, ws, hs) => prep(new THREE.SphereGeometry(r, ws || 10, hs || 7), hex, pos, null, scl);
// a cylinder (or capsule) from point a to point b
function limbG(a, b, r, hex, cap, r2, seg) {
  _v1.set(a[0], a[1], a[2]); _v2.set(b[0], b[1], b[2]);
  const len = _v1.distanceTo(_v2);
  const g = cap ? new THREE.CapsuleGeometry(r, Math.max(0.01, len), 3, seg || 8) : new THREE.CylinderGeometry(r2 == null ? r : r2, r, len, seg || 7, 1, !!r2 && false);
  const gg = g.index ? g.toNonIndexed() : g; if (gg !== g) g.dispose();
  if (gg.attributes.uv) gg.deleteAttribute('uv');
  _v3.subVectors(_v2, _v1).normalize();
  _q.setFromUnitVectors(_up, _v3);
  _p3.addVectors(_v1, _v2).multiplyScalar(0.5);
  _m4.compose(_p3, _q, _s3.set(1, 1, 1)); gg.applyMatrix4(_m4);
  return prep(gg, hex);
}

/* ------------------------------------------------------------ textures */
let RENDERER = null;
let TEX_ANISO = 4;
const ALL_TEX = [];
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = TEX_ANISO; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  ALL_TEX.push(t);
  return t;
}
function noiseFill(g, w, h, base, amp, n, seed, size) {
  const r = rng(seed || 7);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amp, s = (size || 2) * (0.5 + r());
    g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')';
    g.fillRect(r() * w, r() * h, s, s);
  }
}
function softBlob(g, x, y, r, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
// a normal map from a height function, for rock and tarmac relief
function normalTex(size, hf, strength, rep) {
  return canvasTex(size, size, (g) => {
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = hf(x / size, y / size);
    const im = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)], u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
      const o = (y * size + x) * 4; im.data[o] = (nx * 0.5 + 0.5) * 255; im.data[o + 1] = (ny * 0.5 + 0.5) * 255; im.data[o + 2] = (nz * 0.5 + 0.5) * 255; im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, { data: true, repeat: rep });
}
// tileable value noise
function vnoise(seed, cells) {
  const r = rng(seed), G = new Float32Array(cells * cells); for (let i = 0; i < G.length; i++) G[i] = r();
  return (u, v) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const g = (i, j) => G[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
  };
}

let TX = null;
function textures() {
  if (TX) return TX;
  TX = {};
  // tarmac: grain, a worn centre dash, faded edge lines, tar patches
  TX.road = canvasTex(512, 1024, (g, w, h) => {
    noiseFill(g, w, h, '#57565a', 0.22, 26000, 3, 2);
    const r = rng(11);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(20,20,22,' + (0.05 + r() * 0.07) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 30, 20 + r() * 50, r() * 3, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(25,25,28,.22)'; g.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 22; y += r() * 16; g.lineTo(x, y); } g.stroke(); }
    // tyre lines
    [0.27, 0.73].forEach((u) => { const gr = g.createLinearGradient(u * w - 40, 0, u * w + 40, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u * w - 40, 0, 80, h); });
    g.fillStyle = 'rgba(238,236,226,.88)';
    g.fillRect(10, 0, 9, h); g.fillRect(w - 19, 0, 9, h);
    for (let y = 0; y < h; y += 256) g.fillRect(w / 2 - 5, y + 30, 10, 140);
    g.fillStyle = 'rgba(80,72,60,.5)'; g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
  }, { repeat: [1, 1] });
  const nh = vnoise(5, 64), nh2 = vnoise(9, 16);
  TX.roadN = normalTex(256, (u, v) => nh(u, v) * 0.7 + nh2(u, v) * 0.3, 2, [5, 3]);
  // the banks: one grey detail texture, the hue comes from vertex colours
  TX.ground = canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#bdbdbd', 0.32, 20000, 21, 3);
    const r = rng(4);
    for (let i = 0; i < 380; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.05 + r() * 0.1) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 14, 2 + r() * 8, r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 260; i++) { g.strokeStyle = 'rgba(255,255,255,' + (0.06 + r() * 0.1) + ')'; g.lineWidth = 1; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 8); g.stroke(); }
  });
  const rk = vnoise(13, 24), rk2 = vnoise(31, 8);
  TX.groundN = normalTex(256, (u, v) => rk(u, v) * 0.6 + Math.abs(Math.sin((u * 2 + rk2(u, v) * 0.8) * TAU * 3)) * 0.12 + rk2(u, v) * 0.35, 3, [1, 1]);
  // soft blobs for mist, glow and particles
  TX.mist = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); const r = rng(8);
    for (let i = 0; i < 40; i++) softBlob(g, 50 + r() * 156, 60 + r() * 136, 30 + r() * 60, 'rgba(255,255,255,A)', 0.12 + r() * 0.1);
  }, { clamp: true });
  TX.glow = canvasTex(128, 128, (g, w) => { softBlob(g, w / 2, w / 2, w / 2, 'rgba(255,255,255,A)', 1); }, { clamp: true });
  // a waterfall: falling streaks
  TX.falls = canvasTex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); const r = rng(19);
    for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, l = 30 + r() * 120; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(235,245,255,' + (0.3 + r() * 0.5) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, 1 + r() * 3, l); g.fillRect(x, y - h, 1 + r() * 3, l); }
  });
  // the back of a goods truck: hand-painted panel
  TX.truckBack = canvasTex(256, 256, (g, w, h) => {
    const cols = ['#e8452c', '#f2c230', '#2f9e5a', '#2d6fd1', '#e94f8a'];
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 5]; g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 8, 18); g.lineTo(i * 16 + 16, 0); g.fill(); g.beginPath(); g.moveTo(i * 16, h); g.lineTo(i * 16 + 8, h - 18); g.lineTo(i * 16 + 16, h); g.fill(); }
    g.fillStyle = '#c2272d'; g.fillRect(14, 30, w - 28, 66);
    g.fillStyle = '#fff6d6'; g.font = 'bold 34px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HORN', w / 2, 52); g.font = 'bold 26px Inter, Arial, sans-serif'; g.fillText('OK PLEASE', w / 2, 82);
    for (let i = 0; i < 3; i++) { g.fillStyle = cols[(i + 2) % 5]; g.beginPath(); g.arc(50 + i * 78, 150, 26, 0, TAU); g.fill(); g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(50 + i * 78, 150, 11, 0, TAU); g.fill(); }
    g.fillStyle = '#1d2440'; g.font = 'bold 22px Inter, Arial, sans-serif'; g.fillText('USE DIPPER AT NIGHT', w / 2, 210);
  }, { clamp: true });
  // house walls with a window and a door, painted white so instance colours tint them
  TX.house = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#f2efe8', 0.14, 6000, 41, 3);
    g.fillStyle = '#5a3a28'; g.fillRect(96, 130, 64, 126);
    g.fillStyle = '#2b3442'; g.fillRect(20, 70, 52, 52); g.fillRect(184, 70, 52, 52);
    g.strokeStyle = '#8a6a48'; g.lineWidth = 6; g.strokeRect(20, 70, 52, 52); g.strokeRect(184, 70, 52, 52);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 236, w, 20);
  }, { clamp: true });
  TX.houseLit = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcf7a'; g.fillRect(24, 74, 44, 44); g.fillRect(188, 74, 44, 44);
  }, { clamp: true });
  // tunnel concrete
  TX.tunnel = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#9a968e', 0.25, 9000, 51, 3);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
    g.fillStyle = 'rgba(40,30,20,.15)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * w, 0, 2, h * Math.random());
  });
  // start and finish banners
  TX.banner = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#c2272d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f5efe3'; g.fillRect(i * 32, j * 16, 32, 16); g.fillRect(i * 32, h - 32 + j * 16, 32, 16); }
    g.fillStyle = '#ffd23f'; g.font = 'bold 54px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('GHAT RIDERS  ·  START', w / 2, h / 2 + 2);
  }, { clamp: true });
  TX.finish = canvasTex(1024, 128, (g, w, h) => {
    for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f5efe3'; g.fillRect(i * 32, j * 32, 32, 32); }
    g.fillStyle = 'rgba(17,17,17,.82)'; g.fillRect(w / 2 - 230, 14, 460, 100);
    g.fillStyle = '#ffd23f'; g.font = 'bold 64px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', w / 2, h / 2 + 2);
  }, { clamp: true });
  // a milestone face
  TX.mile = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2a516'; g.fillRect(0, 0, w, 44);
    g.fillStyle = '#222'; g.font = 'bold 20px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('GHAT', w / 2, 76); g.font = 'bold 16px Inter, Arial, sans-serif'; g.fillText('KM', w / 2, 102);
  }, { clamp: true });
  // sea ripples
  const wn = vnoise(77, 32), wn2 = vnoise(78, 8);
  TX.seaN = normalTex(256, (u, v) => wn(u, v) * 0.6 + wn2(u, v) * 0.4 + Math.sin((u + v * 0.3) * TAU * 8) * 0.05, 2.2, [40, 40]);
  // chevron board on hairpins
  TX.chev = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h); g.fillStyle = '#111';
    for (let i = 0; i < 4; i++) { const x = 20 + i * 60; g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 26, h / 2); g.lineTo(x, h - 8); g.lineTo(x + 14, h - 8); g.lineTo(x + 40, h / 2); g.lineTo(x + 14, 8); g.closePath(); g.fill(); }
  }, { clamp: true });
  return TX;
}

/* ------------------------------------------------------------ particles */
let FX = null;
function makePool(n, additive, square) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;' +
      'void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; ' +
      (square ? 'if (abs(p.x) > 0.42 || abs(p.y) > 0.26) discard; float a = vA;' : 'float d = length(p); if (d > 0.5) discard; float a = vA * ' + (additive ? 'pow(1.0 - d * 2.0, 1.6)' : 'smoothstep(0.5, 0.15, d)') + ';') +
      ' gl_FragColor = vec4(vC, a); }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  const P = { n, pos, col, size, alpha, geo, mat, pts, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s0: new Float32Array(n), grow: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), a0: new Float32Array(n), spin: new Float32Array(n), head: 0, live: 0 };
  return P;
}
function createFX(scene) {
  const F = { add: makePool(700, true), soft: makePool(600, false), conf: makePool(360, false, true), density: 1 };
  scene.add(F.add.pts, F.soft.pts, F.conf.pts);
  F.emit = (pool, x, y, z, vx, vy, vz, life, size, hex, alpha, grav, drag, grow) => {
    const P = F[pool]; const i = P.head; P.head = (P.head + 1) % P.n;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    _c.set(hex); P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b;
    P.life[i] = life; P.max[i] = life; P.s0[i] = size; P.size[i] = size; P.a0[i] = alpha; P.alpha[i] = alpha;
    P.grav[i] = grav || 0; P.drag[i] = drag || 0; P.grow[i] = grow || 0; P.spin[i] = Math.random() * 6;
  };
  F.update = (dt, scale) => {
    ['add', 'soft', 'conf'].forEach((k) => {
      const P = F[k]; P.mat.uniforms.uScale.value = scale;
      let any = false;
      for (let i = 0; i < P.n; i++) {
        if (P.life[i] <= 0) { if (P.alpha[i] !== 0) { P.alpha[i] = 0; any = true; } continue; }
        any = true;
        P.life[i] -= dt;
        const f = Math.max(0, P.life[i] / P.max[i]), dr = Math.exp(-P.drag[i] * dt);
        P.vel[i * 3] *= dr; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * dr - P.grav[i] * dt; P.vel[i * 3 + 2] *= dr;
        if (k === 'conf') { P.spin[i] += dt * 9; P.vel[i * 3] += Math.sin(P.spin[i]) * dt * 2; }
        P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
        P.size[i] = P.s0[i] * (1 + P.grow[i] * (1 - f)) * (k === 'conf' ? 0.6 + 0.4 * Math.abs(Math.sin(P.spin[i])) : 1);
        P.alpha[i] = P.a0[i] * (k === 'add' ? f : Math.min(1, f * 2.5));
      }
      if (any) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aColor.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aAlpha.needsUpdate = true; }
    });
  };
  F.clear = () => { ['add', 'soft', 'conf'].forEach((k) => { F[k].life.fill(0); }); };
  return F;
}
// effect helpers called by the rules (no-ops before the 3D stage exists)
const fxOK = () => FX && R3 && !R3.lost;
const chance = (p) => Math.random() < p * (FX ? FX.density : 1);
function dustAt(W, R, k) {
  if (!fxOK() || !chance(1)) return;
  posAt(W.T, R.s - 0.6, R.x + (Math.random() - 0.5) * 0.4, 0.15, V);
  FX.emit('soft', V.x, V.y, V.z, (Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 2, 1.0 + Math.random() * 0.6, 0.9 * (k || 1), W.T.look.dirt, 0.5, -0.3, 1.2, 2.2);
}
function gravelAt(W, R) {
  if (!fxOK()) return;
  for (let i = 0; i < 2; i++) {
    posAt(W.T, R.s - 0.7, R.x + (Math.random() - 0.5) * 0.5, 0.1, V);
    FX.emit('soft', V.x, V.y, V.z, (Math.random() - 0.5) * 5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 5, 0.6, 0.14, '#5a4a3a', 1, 9, 0.5, 0);
  }
  dustAt(W, R, 0.8);
}
function sparkBurst(x, y, z, n, spread, up, hex) {
  if (!fxOK()) return;
  for (let i = 0; i < n * FX.density; i++) FX.emit('add', x, y, z, (Math.random() - 0.5) * spread, Math.random() * up, (Math.random() - 0.5) * spread, 0.25 + Math.random() * 0.35, 0.09 + Math.random() * 0.07, hex || (Math.random() < 0.5 ? '#ffd27a' : '#ff8a3a'), 1, 9, 1.2, 0);
}
function pegSparks(W, R) {
  if (!fxOK()) return;
  const side = R.lean > 0 ? 1 : -1;
  posAt(W.T, R.s + 0.05, R.x + side * 0.42, 0.05, V);
  for (let i = 0; i < 3; i++) FX.emit('add', V.x, V.y, V.z, (Math.random() - 0.5) * 2 - FR.fx * 3, Math.random() * 2, (Math.random() - 0.5) * 2 - FR.fz * 3, 0.3, 0.07, '#ffd27a', 1, 7, 1, 0);
}
function scrapeFx(W, R, side, k) {
  if (!fxOK() || !chance(0.7)) return;
  posAt(W.T, R.s, side * (XW + 0.1), 0.35, V);
  if (k > 0.2) sparkBurst(V.x, V.y, V.z, 4, 3, 3);
  else FX.emit('soft', V.x, V.y, V.z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.8, 0.7, W.T.look.dirt, 0.6, -0.2, 1, 2);
}
function clashFx(W, A, B, k) {
  if (!fxOK()) return;
  posAt(W.T, (A.s + B.s) / 2, (A.x + B.x) / 2, 1.0, V);
  sparkBurst(V.x, V.y, V.z, 10 + 16 * k, 5, 3.5, '#ffe9b0');
  FX.emit('add', V.x, V.y, V.z, 0, 0, 0, 0.18, 1.6 * k + 0.4, '#fff3d6', 0.9, 0, 0, 1.5);
}
function crashFx(W, R) {
  if (!fxOK()) return;
  posAt(W.T, R.s, R.x, 0.3, V);
  sparkBurst(V.x, V.y, V.z, 18, 5, 4);
  for (let i = 0; i < 10 * FX.density; i++) FX.emit('soft', V.x, V.y, V.z, (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4, 1.4, 1.1, W.T.look.dirt, 0.55, -0.2, 1.4, 2.4);
}
function confetti(W, n) {
  if (!fxOK()) return;
  const cols = ['#ff6940', '#ffb736', '#44ffa8', '#38e1ff', '#e94f8a', '#f5efe3', '#9b6bff'];
  for (let i = 0; i < n * FX.density; i++) {
    posAt(W.T, W.P.s + 6 + Math.random() * 10, (Math.random() - 0.5) * 12, 5 + Math.random() * 4, V);
    FX.emit('conf', V.x, V.y, V.z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 3 + Math.random() * 1.5, 0.22, cols[i % cols.length], 1, 2.2, 0.9, 0);
  }
}

/* ------------------------------------------------------------ motorbikes and riders */
// Local frame: forward is -z, origin on the ground halfway between the axles.
const POSE = {
  sport: { pelvis: [0, 0.98, 0.2], sh: [0, 1.31, -0.2], head: [0, 1.46, -0.33], grip: [0.27, 1.0, -0.5], peg: [0.21, 0.44, 0.12], knee: [0.25, 0.86, -0.22], lean: 0.95 },
  roadster: { pelvis: [0, 0.93, 0.18], sh: [0, 1.38, -0.04], head: [0, 1.57, -0.12], grip: [0.32, 1.07, -0.5], peg: [0.22, 0.42, 0.06], knee: [0.25, 0.78, -0.24], lean: 0.6 },
  cruiser: { pelvis: [0, 0.85, 0.27], sh: [0, 1.36, 0.14], head: [0, 1.58, 0.1], grip: [0.42, 1.13, -0.42], peg: [0.27, 0.44, -0.36], knee: [0.27, 0.86, -0.28], lean: 0.35 }
};
const KIND_POSE = { scout: 'roadster', thunder: 'cruiser', phantom: 'sport' };
const GEO = {};
function bikeBodyGeo(kind, paint, trim, patrol) {
  const key = kind + paint + trim + (patrol ? 'p' : '');
  if (GEO[key]) return GEO[key];
  const L = [], dark = '#1d1e22', metal = '#8a8e96', chrome = '#d0d3d9', black = '#101114', seatC = '#26201c';
  // frame
  L.push(limbG([0, 0.96, -0.5], [0, 0.5, 0.3], 0.045, dark));
  L.push(limbG([0, 0.96, -0.5], [0, 0.36, -0.22], 0.04, dark));
  L.push(limbG([0, 0.36, -0.22], [0, 0.4, 0.3], 0.035, dark));
  // engine and cylinder fins
  L.push(boxG(0.3, 0.3, 0.4, metal, [0, 0.46, -0.05]));
  for (let i = 0; i < 4; i++) L.push(boxG(0.36, 0.025, 0.3, i % 2 ? metal : '#a3a7ae', [0, 0.62 + i * 0.04, -0.14], [0.35, 0, 0]));
  L.push(cylG(0.13, 0.13, 0.08, 14, chrome, [0.17, 0.42, 0.02], [0, 0, Math.PI / 2]));
  // swingarm and shock
  [-1, 1].forEach((sd) => {
    L.push(limbG([sd * 0.12, 0.45, 0.28], [sd * 0.12, 0.32, 0.71], 0.032, dark));
    L.push(limbG([sd * 0.11, 0.38, 0.6], [sd * 0.13, 0.82, 0.38], 0.025, '#c84b2a'));
    // fork
    L.push(limbG([sd * 0.09, 1.0, -0.53], [sd * 0.09, 0.33, -0.72], 0.032, chrome));
  });
  // handlebar
  const pose = POSE[KIND_POSE[kind]];
  const gw = pose.grip[0], gy = pose.grip[1], gz = pose.grip[2];
  L.push(limbG([-gw, gy, gz], [gw, gy, gz], 0.018, black));
  L.push(limbG([0, 0.98, -0.53], [0, gy, gz], 0.02, black));
  [-1, 1].forEach((sd) => { L.push(cylG(0.026, 0.026, 0.12, 8, black, [sd * (gw + 0.02), gy, gz], [0, 0, Math.PI / 2])); L.push(boxG(0.1, 0.03, 0.05, black, [sd * (gw - 0.1), gy + 0.03, gz - 0.03])); });
  // fenders
  L.push(prep(new THREE.CylinderGeometry(0.36, 0.36, 0.13, 14, 1, true, -0.4, 1.9), patrol ? '#f2f2f2' : paint, [0, 0.33, -0.72], [0, 0, Math.PI / 2]));
  L.push(prep(new THREE.CylinderGeometry(0.37, 0.37, 0.16, 14, 1, true, 1.2, 1.7), dark, [0, 0.33, 0.71], [0, 0, Math.PI / 2]));
  // number plate (a plain yellow plate) and tail light housing
  L.push(boxG(0.2, 0.12, 0.015, '#f2c230', [0, 0.58, 0.97], [-0.3, 0, 0]));
  if (kind === 'phantom') {
    // faired sport bike
    L.push(sphG(0.3, paint, [0, 0.92, -0.6], [0.95, 0.85, 1.55], 12, 8));
    L.push(boxG(0.5, 0.28, 0.9, paint, [0, 0.62, -0.22]));
    L.push(boxG(0.46, 0.08, 0.95, trim, [0, 0.72, -0.24]));
    L.push(boxG(0.28, 0.16, 0.42, '#203448', [0, 1.13, -0.62], [-0.85, 0, 0]));
    L.push(sphG(0.22, paint, [0, 0.95, -0.12], [1.05, 0.7, 1.5], 14, 9));
    L.push(boxG(0.22, 0.07, 0.42, seatC, [0, 0.93, 0.24], [0.08, 0, 0]));
    L.push(prep(new THREE.ConeGeometry(0.17, 0.62, 4), paint, [0, 0.98, 0.58], [Math.PI / 2 - 0.25, Math.PI / 4, 0], [1.1, 1, 0.7]));
    L.push(boxG(0.36, 0.1, 0.5, black, [0, 0.33, -0.08]));
    L.push(limbG([0.13, 0.45, 0.25], [0.18, 0.72, 0.78], 0.05, chrome));
    L.push(cylG(0.075, 0.075, 0.28, 10, '#3a3d44', [0.18, 0.74, 0.86], [Math.PI / 2 - 0.35, 0, 0]));
  } else if (kind === 'thunder') {
    // heavy cruiser
    L.push(sphG(0.27, paint, [0, 0.95, -0.22], [1.05, 0.8, 1.8], 12, 8));
    L.push(boxG(0.3, 0.04, 0.32, trim, [0, 1.13, -0.2]));
    L.push(boxG(0.36, 0.1, 0.48, seatC, [0, 0.84, 0.28], [0.06, 0, 0]));
    L.push(boxG(0.3, 0.14, 0.3, seatC, [0, 0.92, 0.5], [-0.25, 0, 0]));
    L.push(sphG(0.15, chrome, [0, 0.96, -0.74], [1, 1, 0.65]));
    L.push(prep(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 14, 1, true, 1.0, 2.2), paint, [0, 0.33, 0.71], [0, 0, Math.PI / 2]));
    [-1, 1].forEach((sd) => { L.push(limbG([sd * 0.17, 0.4, -0.06], [sd * 0.2, 0.34, 0.95], 0.045, chrome)); L.push(boxG(0.16, 0.2, 0.32, paint, [sd * 0.28, 0.6, 0.62])); });
    L.push(boxG(0.7, 0.05, 0.12, chrome, [0, 0.47, -0.36]));
    if (patrol) { L.push(boxG(0.56, 0.42, 0.06, '#d8e4f0', [0, 1.14, -0.72], [-0.3, 0, 0])); L.push(boxG(0.52, 0.12, 0.66, '#f4f4f4', [0, 1.02, 0.66])); }
  } else {
    // light roadster
    L.push(sphG(0.24, paint, [0, 0.95, -0.24], [1, 0.82, 1.6], 12, 8));
    L.push(boxG(0.06, 0.2, 0.5, trim, [0.2, 0.95, -0.24]));
    L.push(boxG(0.06, 0.2, 0.5, trim, [-0.2, 0.95, -0.24]));
    L.push(boxG(0.26, 0.08, 0.56, seatC, [0, 0.9, 0.24]));
    L.push(boxG(0.24, 0.1, 0.32, paint, [0, 0.92, 0.6], [-0.15, 0, 0]));
    L.push(sphG(0.13, chrome, [0, 1.0, -0.72], [1, 1, 0.7]));
    L.push(limbG([0.14, 0.42, -0.02], [0.2, 0.62, 0.72], 0.04, chrome));
    L.push(cylG(0.06, 0.07, 0.36, 10, '#3a3d44', [0.2, 0.66, 0.78], [Math.PI / 2 - 0.5, 0, 0]));
  }
  if (patrol) { L.push(boxG(0.6, 0.06, 0.05, '#1f5fbf', [0, 0.78, -0.2])); L.push(limbG([0, 1.05, 0.7], [0, 1.6, 0.74], 0.012, '#888')); }
  const g = mergeG(L);
  GEO[key] = g;
  return g;
}
function wheelGeo(fat) {
  const key = 'wheel' + (fat ? 'f' : '');
  if (GEO[key]) return GEO[key];
  const L = [], tube = fat ? 0.085 : 0.066;
  L.push(prep(new THREE.TorusGeometry(0.32 - tube, tube, 6, 18), '#151517', null, [0, Math.PI / 2, 0]));
  L.push(prep(new THREE.TorusGeometry(0.21, 0.018, 4, 16), '#b9bec7', null, [0, Math.PI / 2, 0]));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; L.push(boxG(0.02, 0.2, 0.03, '#9aa0a8', [0, Math.cos(a) * 0.1, Math.sin(a) * 0.1], [a, 0, 0])); }
  L.push(cylG(0.05, 0.05, 0.12, 10, '#6b6f77', null, [0, 0, Math.PI / 2]));
  L.push(cylG(0.15, 0.15, 0.012, 16, '#c0c4ca', [0.06, 0, 0], [0, 0, Math.PI / 2]));
  const g = mergeG(L); GEO[key] = g; return g;
}
function lightsGeo() {
  if (GEO.lights) return GEO.lights;
  const L = [];
  L.push(prep(new THREE.CircleGeometry(0.09, 14), '#fff6dc', [0, 0.97, -0.84], [Math.PI, 0, 0]));
  L.push(boxG(0.14, 0.05, 0.02, '#ff2a1a', [0, 0.82, 0.98]));
  const g = mergeG(L); GEO.lights = g; return g;
}
function riderGeo(kind, jacket, helmet, trousers, patrol) {
  const key = 'rider' + kind + jacket + helmet + (patrol ? 'p' : '');
  if (GEO[key]) return GEO[key];
  const p = POSE[KIND_POSE[kind]], L = [], skin = '#a8714f', boot = '#1a1716', glove = '#222';
  const o = (a) => [a[0] - p.pelvis[0], a[1] - p.pelvis[1], a[2] - p.pelvis[2]];
  // torso from pelvis to shoulders, a little broader at the chest
  L.push(limbG(o(p.pelvis), o(p.sh), 0.17, jacket, true));
  L.push(sphG(0.2, jacket, o([p.sh[0], p.sh[1] - 0.06, p.sh[2] + 0.03]), [1.25, 0.75, 0.9]));
  // a stripe across the back
  L.push(limbG(o([-0.19, lerp(p.pelvis[1], p.sh[1], 0.55), lerp(p.pelvis[2], p.sh[2], 0.55) + 0.11]), o([0.19, lerp(p.pelvis[1], p.sh[1], 0.55), lerp(p.pelvis[2], p.sh[2], 0.55) + 0.11]), 0.035, patrol ? '#c8ff3a' : '#f5efe3'));
  // neck and helmet with a dark visor
  L.push(limbG(o(p.sh), o(p.head), 0.06, skin));
  L.push(sphG(0.16, helmet, o(p.head), [1, 1.02, 1.12], 12, 9));
  L.push(sphG(0.15, '#121620', o([p.head[0], p.head[1] - 0.005, p.head[2] - 0.07]), [0.93, 0.62, 0.95], 14, 9));
  if (patrol) L.push(boxG(0.035, 0.06, 0.3, '#1f5fbf', o([0, p.head[1] + 0.16, p.head[2]])));
  else L.push(boxG(0.04, 0.03, 0.26, '#ffffff', o([0, p.head[1] + 0.165, p.head[2] + 0.02])));
  // legs: thigh to knee to the peg, boots
  [-1, 1].forEach((sd) => {
    const hip = [sd * 0.13, p.pelvis[1], p.pelvis[2]], knee = [sd * p.knee[0], p.knee[1], p.knee[2]], peg = [sd * p.peg[0], p.peg[1] + 0.06, p.peg[2]];
    L.push(limbG(o(hip), o(knee), 0.085, trousers, true));
    L.push(limbG(o(knee), o(peg), 0.07, trousers, true));
    L.push(boxG(0.11, 0.12, 0.26, boot, o([peg[0], peg[1] - 0.02, peg[2] - 0.06])));
  });
  const g = mergeG(L); GEO[key] = g; return g;
}
function armGeo(kind, jacket, side) {
  const key = 'arm' + kind + jacket + side;
  if (GEO[key]) return GEO[key];
  const p = POSE[KIND_POSE[kind]], sh = [side * 0.2, p.sh[1] - 0.04, p.sh[2] + 0.02], gr = [side * p.grip[0], p.grip[1] + 0.02, p.grip[2]];
  const el = [lerp(sh[0], gr[0], 0.5) + side * 0.09, lerp(sh[1], gr[1], 0.5) - 0.05, lerp(sh[2], gr[2], 0.5)];
  const o = (a) => [a[0] - sh[0], a[1] - sh[1], a[2] - sh[2]];
  const L = [limbG(o(sh), o(el), 0.07, jacket, true), limbG(o(el), o(gr), 0.06, jacket, true), sphG(0.055, '#1d1d1f', o(gr))];
  const g = mergeG(L); g.userData.shoulder = sh; GEO[key] = g; return g;
}

let BMAT = null;
function bikeMats() {
  if (BMAT) return BMAT;
  BMAT = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 }),
    wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }),
    rider: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 }),
    lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glow: new THREE.SpriteMaterial({ map: textures().glow, color: '#ffe8b8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }),
    tailGlow: new THREE.SpriteMaterial({ map: textures().glow, color: '#ff3020', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }),
    beaconR: new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false }),
    beaconB: new THREE.MeshBasicMaterial({ color: '#2a6bff', toneMapped: false })
  };
  return BMAT;
}

// A bike and its rider. The rider has its own root so it can tumble away from the bike.
function makeBike(R, o) {
  o = o || {};
  const M = bikeMats(), kind = R.kind, b = BIKES[kind];
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const body = new THREE.Mesh(bikeBodyGeo(kind, R.paint, b.trim, o.patrol), M.body); body.castShadow = true;
  const wf = new THREE.Mesh(wheelGeo(kind === 'thunder'), M.wheel); wf.position.set(0, 0.32, -0.71); wf.castShadow = true;
  const wr = new THREE.Mesh(wheelGeo(kind === 'thunder'), M.wheel); wr.position.set(0, 0.32, 0.71); wr.castShadow = true;
  const lights = new THREE.Mesh(lightsGeo(), M.lights);
  root.add(body, wf, wr, lights);
  let glow = null, tail = null;
  if (o.night) {
    tail = new THREE.Sprite(M.tailGlow); tail.position.set(0, 0.82, 1.02); tail.scale.set(0.6, 0.6, 1); root.add(tail);
  }
  let beacon = null;
  if (o.patrol) {
    beacon = { r: new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), M.beaconR), b: new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), M.beaconB) };
    beacon.r.position.set(-0.07, 1.64, 0.74); beacon.b.position.set(0.07, 1.64, 0.74); root.add(beacon.r, beacon.b);
  }
  const p = POSE[KIND_POSE[kind]];
  const rroot = new THREE.Group(); rroot.rotation.order = 'YXZ';
  const lean = new THREE.Group(); rroot.add(lean);
  const torso = new THREE.Group(); torso.position.set(p.pelvis[0], p.pelvis[1], p.pelvis[2]); lean.add(torso);
  const rb = new THREE.Mesh(riderGeo(kind, R.jacket, R.helmet, o.patrol ? '#2a3550' : '#23262d', o.patrol), M.rider); rb.castShadow = true; torso.add(rb);
  const arms = [-1, 1].map((sd) => {
    const g = armGeo(kind, R.jacket, sd), piv = new THREE.Group(), sh = g.userData.shoulder;
    piv.position.set(sh[0] - p.pelvis[0], sh[1] - p.pelvis[1], sh[2] - p.pelvis[2]);
    const m = new THREE.Mesh(g, M.rider); m.castShadow = true; piv.add(m); torso.add(piv); return piv;
  });
  return { root, body, wf, wr, lights, glow, tail, beacon, rroot, lean, torso, arms, pose: p, kind, R, tum: { x: 0, y: 0, z: 0, rx: 0, rz: 0 } };
}

const _pp = { x: 0, y: 0, z: 0 };
// Place a bike and rider from the rider's (s, x) and its animation state.
function poseBike(B, W, R, dt) {
  const T = W.T;
  posAt(T, R.s, R.x, 0, _pp);
  const yaw = -FR.h + Math.atan2(R.vx * 0.6, Math.max(6, R.v)) * -1;
  const root = B.root;
  root.position.set(_pp.x, _pp.y, _pp.z);
  let lean = R.lean;
  const wob = R.wob > 0 ? Math.sin(R.wobPh) * R.wob * 0.16 : 0;
  root.rotation.set(-FR.pitch, yaw + wob * 0.6, -(lean + wob));
  // the bike lies on its side in a crash and skids around
  const crashing = R.crash > 0;
  if (crashing) {
    const t = R.crashT, e = Math.min(1, t * 4);
    root.rotation.y = yaw + R.crashSpin * Math.min(t, 1.2);
    root.position.y = _pp.y + 0.12 * e;
    root.rotation.z = -lean;
  }
  B.wf.rotation.x = -R.wheel; B.wr.rotation.x = -R.wheel;
  // a flicker on the patrol beacon, steady under reduced motion
  if (B.beacon) {
    const on = ARC.reducedMotion ? 1 : (Math.floor(R.beacon * 6) % 2);
    B.beacon.r.material.color.setScalar(1); B.beacon.r.visible = ARC.reducedMotion || on === 1; B.beacon.b.visible = ARC.reducedMotion || on === 0;
  }
  // the rider
  const rr = B.rroot;
  if (!crashing) {
    rr.position.copy(root.position); rr.rotation.copy(root.rotation);
    const tuck = clamp((R.v - 25) / 25, 0, 1) * B.pose.lean;
    B.lean.rotation.set(0, 0, 0); B.lean.position.set(0, 0, 0);
    // lean the body further into the bend than the bike
    B.torso.rotation.set(tuck * 0.18, 0, -R.lean * 0.35);
    B.torso.position.set(B.pose.pelvis[0] + clamp(R.lean, -1, 1) * 0.12, B.pose.pelvis[1] - tuck * 0.04, B.pose.pelvis[2]);
    const sh = R.shoveT > 0 ? Math.sin(clamp((0.42 - R.shoveT) / 0.42, 0, 1) * Math.PI) : 0, sd = R.shoveSide;
    B.arms[0].rotation.set(0, 0, 0); B.arms[1].rotation.set(0, 0, 0);
    if (sh > 0) {
      B.torso.rotation.z += -sd * 0.55 * sh;
      B.torso.position.x += sd * 0.22 * sh;
      const arm = B.arms[sd > 0 ? 1 : 0];
      arm.rotation.set(0.25 * sh, -sd * 1.15 * sh, -sd * 0.5 * sh);
    }
    B.tum.x = 0; B.tum.y = 0; B.tum.z = 0;
  } else {
    // the rider rolls away, sits up dazed, then climbs back on
    const t = R.crashT, D = R.crashDur, k = clamp(t / 0.9, 0, 1), sd = R.crashDir;
    const back = D * 0.8;
    rr.rotation.order = 'YXZ';
    if (t < back) {
      const off = sd * (0.8 + 1.4 * smooth01(k));
      posAt(T, R.s - 0.6 + Math.min(t, 1) * 0.6, clamp(R.x + off, -XW - 0.4, XW + 0.4), 0, _pp);
      const hop = Math.max(0, Math.sin(Math.min(1, t / 0.9) * Math.PI) * 0.7);
      rr.position.set(_pp.x, _pp.y + hop, _pp.z);
      const roll = t < 0.9 ? -sd * k * TAU * 1.25 : -sd * TAU * 1.25;
      rr.rotation.set(t < 0.9 ? 0.3 : 0.15, yaw + R.crashSpin * 0.3, roll);
      B.torso.rotation.set(t < 0.9 ? 0.9 : 0.35 + Math.sin(t * 4) * 0.08, 0, 0);
      B.torso.position.set(0, t < 0.9 ? 0.45 : 0.32, 0.1);
      B.arms[0].rotation.set(-0.6, 0.4, 0.5); B.arms[1].rotation.set(-0.6, -0.4, -0.5);
    } else {
      const u = smooth01((t - back) / (D - back));
      posAt(T, R.s, clamp(R.x + sd * 2.2 * (1 - u), -XW - 0.4, XW + 0.4), 0, _pp);
      rr.position.set(_pp.x, _pp.y + 0.4 * Math.sin(u * Math.PI), _pp.z);
      rr.rotation.set(-FR.pitch, yaw, -sd * 0.3 * (1 - u));
      B.torso.rotation.set(0.2 * (1 - u), 0, 0);
      B.torso.position.set(B.pose.pelvis[0], lerp(0.5, B.pose.pelvis[1], u), B.pose.pelvis[2]);
      B.arms[0].rotation.set(0, 0, 0); B.arms[1].rotation.set(0, 0, 0);
    }
  }
  // blink while invulnerable after a remount (never under reduced motion)
  const vis = !(R.invuln > 0 && !ARC.reducedMotion && Math.floor(R.invuln * 10) % 2 === 0);
  rr.visible = vis; root.visible = vis || R.invuln <= 0;
}

/* ------------------------------------------------------------ traffic, cows */
function truckGeo() {
  const L = [], w = '#ffffff', dk = '#24252a', gl = '#1a2a38', ch = '#cfd2d8';
  L.push(boxG(2.3, 1.6, 1.7, w, [0, 1.75, -2.75]));             // cab
  L.push(boxG(2.2, 0.9, 0.08, gl, [0, 2.05, -3.61]));            // windscreen
  L.push(boxG(2.4, 0.5, 0.5, w, [0, 0.95, -3.4]));               // bonnet
  L.push(boxG(2.5, 0.2, 0.2, ch, [0, 0.7, -3.72]));              // bumper
  L.push(boxG(2.3, 0.25, 0.12, '#e8452c', [0, 2.7, -3.55]));      // painted crown
  for (let i = 0; i < 5; i++) L.push(boxG(0.3, 0.3, 0.1, ['#f2c230', '#2f9e5a', '#e94f8a', '#2d6fd1', '#f2c230'][i], [-0.9 + i * 0.45, 2.95, -3.5], [0, 0, Math.PI / 4]));
  L.push(boxG(2.5, 1.7, 5.2, '#c9b38a', [0, 1.85, 0.95]));       // wooden cargo body
  for (let i = 0; i < 4; i++) L.push(boxG(2.54, 0.06, 5.22, '#8a6a48', [0, 1.2 + i * 0.42, 0.95]));
  L.push(prep(new THREE.CylinderGeometry(1.25, 1.25, 5.1, 12, 1, false, -Math.PI / 2, Math.PI), w, [0, 2.7, 0.95], [Math.PI / 2, 0, 0], [1, 1, 0.55]));
  L.push(boxG(2.4, 0.3, 7.2, dk, [0, 0.62, -0.1]));               // chassis
  [-2.9, 0.5, 2.2].forEach((z) => [-1, 1].forEach((sd) => L.push(cylG(0.5, 0.5, 0.36, 14, dk, [sd * 1.05, 0.5, z], [0, 0, Math.PI / 2]))));
  return mergeG(L);
}
function busGeo() {
  const L = [], w = '#ffffff', dk = '#24252a', gl = '#18242e';
  L.push(boxG(2.55, 2.5, 10.6, w, [0, 1.85, 0]));
  L.push(boxG(2.58, 0.9, 9.2, gl, [0, 2.35, 0.3]));
  L.push(boxG(2.4, 1.2, 0.06, gl, [0, 2.2, -5.31]));
  L.push(boxG(2.6, 0.32, 10.62, '#d8d2c4', [0, 1.22, 0]));
  L.push(boxG(2.3, 0.3, 6, '#3a3d44', [0, 3.25, 0.5]));
  L.push(boxG(2.6, 0.2, 0.2, '#cfd2d8', [0, 0.65, -5.35]));
  L.push(boxG(2.3, 0.9, 0.06, gl, [0, 2.4, 5.31]));
  L.push(boxG(2.62, 0.18, 0.08, '#c2272d', [0, 1.55, 5.31]));
  L.push(boxG(2.62, 0.18, 0.08, '#f2c230', [0, 1.3, 5.31]));
  L.push(boxG(2.6, 0.2, 0.2, '#2a2b30', [0, 0.65, 5.35]));
  L.push(boxG(0.5, 0.18, 0.04, '#f2c230', [0, 0.95, 5.33]));
  [-3.6, 3.4].forEach((z) => [-1, 1].forEach((sd) => L.push(cylG(0.52, 0.52, 0.34, 14, dk, [sd * 1.1, 0.52, z], [0, 0, Math.PI / 2]))));
  return mergeG(L);
}
function carGeo() {
  const L = [], w = '#ffffff', dk = '#202126', gl = '#1a2633';
  L.push(boxG(1.72, 0.66, 3.9, w, [0, 0.62, 0]));
  L.push(boxG(1.5, 0.56, 2.2, w, [0, 1.2, 0.25]));
  L.push(boxG(1.52, 0.44, 2.22, gl, [0, 1.22, 0.25]));
  L.push(boxG(1.4, 0.46, 0.06, gl, [0, 1.17, -0.88], [-0.5, 0, 0]));
  [-1.25, 1.25].forEach((z) => [-1, 1].forEach((sd) => L.push(cylG(0.33, 0.33, 0.22, 12, dk, [sd * 0.8, 0.33, z], [0, 0, Math.PI / 2]))));
  return mergeG(L);
}
function tempoGeo() {
  const L = [], w = '#ffffff', dk = '#202126', gl = '#1a2633';
  L.push(boxG(1.3, 1.25, 1.0, w, [0, 1.15, -0.95]));
  L.push(boxG(1.2, 0.5, 0.05, gl, [0, 1.45, -1.46]));
  L.push(boxG(1.4, 0.55, 1.9, '#3a5a3a', [0, 0.95, 0.55]));
  L.push(boxG(1.4, 0.06, 1.9, w, [0, 1.25, 0.55]));
  L.push(boxG(1.36, 0.7, 0.06, w, [0, 1.6, 1.5]));
  L.push(cylG(0.28, 0.28, 0.18, 12, dk, [0, 0.28, -1.2], [0, 0, Math.PI / 2]));
  [-1, 1].forEach((sd) => L.push(cylG(0.28, 0.28, 0.18, 12, dk, [sd * 0.62, 0.28, 0.75], [0, 0, Math.PI / 2])));
  return mergeG(L);
}
function vLightsGeo() {
  // unit-sized: scaled per vehicle by its half width, height and half length
  const L = [];
  [-1, 1].forEach((sd) => {
    L.push(boxG(0.16, 0.05, 0.02, '#ff2a1a', [sd * 0.78, 0.3, 1.005]));
    L.push(boxG(0.14, 0.06, 0.02, '#fff2c8', [sd * 0.72, 0.28, -1.005]));
  });
  return mergeG(L);
}
function cowGeo() {
  const L = [], w = '#ffffff', hoof = '#2a2522', horn = '#4a443c';
  L.push(sphG(0.5, w, [0, 1.05, 0.05], [0.8, 0.82, 1.55], 14, 10));
  L.push(sphG(0.24, w, [0, 1.42, -0.45], [0.9, 1, 1.1]));      // hump
  L.push(boxG(0.3, 0.32, 0.48, w, [0, 1.18, -0.98], [0.5, 0, 0]));
  L.push(sphG(0.13, '#d9cfc2', [0, 1.03, -1.22], [1.1, 0.8, 1]));
  [-1, 1].forEach((sd) => {
    L.push(limbG([sd * 0.12, 1.38, -0.96], [sd * 0.26, 1.62, -0.88], 0.035, horn));
    L.push(boxG(0.2, 0.06, 0.1, w, [sd * 0.22, 1.26, -0.92], [0, 0, sd * 0.4]));
    [-0.5, 0.55].forEach((z) => { L.push(limbG([sd * 0.2, 0.9, z], [sd * 0.2, 0.08, z], 0.07, w)); L.push(cylG(0.08, 0.09, 0.1, 8, hoof, [sd * 0.2, 0.05, z])); });
  });
  L.push(sphG(0.3, '#e9d9cf', [0, 1.62, -0.2], [1.2, 0.2, 0.9]));
  L.push(limbG([0, 1.15, 0.8], [0, 0.45, 0.95], 0.025, w));
  return mergeG(L);
}

/* ------------------------------------------------------------ scenery placement (pure data, seeded) */
const decorCache = {};
function decorFor(T) {
  if (decorCache[T.id]) return decorCache[T.id];
  const r = rng(900 + COURSE_IDX[T.id] * 77), D = { guard: [], mile: [], chev: [], trees: [], far: [], rocks: [], tea: [], houses: [], chai: [], temple: [], flags: [], falls: [], lamps: [], mtn: [], mist: [], poles: [] };
  const look = T.look, N = T.N;
  const sideK = (i, sd) => (sd < 0 ? T.KL[i] : T.KR[i]);
  const lastSec = {};
  for (let i = 2; i < N - 2; i++) {
    const s = i * SEGM, row = T.rows[i], o = row.o || {}, tun = T.TUN[i] > 0.2;
    if (tun) continue;
    for (let sd = -1; sd <= 1; sd += 2) {
      const k = sideK(i, sd), lim = T.LIM[i * 2 + (sd > 0 ? 1 : 0)];
      // painted guard stones along the drop
      if (k < -0.35 && i % 1 === 0) D.guard.push({ s, x: sd * 7.0, n: i });
      // hedges and fences on open ground
      if (k >= -0.35 && k < 0.5 && !o.village && i % 3 === 0) D.guard.push({ s, x: sd * 7.05, n: i, low: true });
      // trees: on the valley slope and on top of banks
      const treeEvery = look.tree === 'palm' ? 5 : look.tree === 'oak' ? 6 : 3;
      if (i % treeEvery === (sd < 0 ? 0 : 1) && r() < 0.85) {
        let off;
        if (k < -0.3) off = 10 + r() * Math.min(28, lim - 10);
        else if (k > 0.5) off = 15 + r() * Math.min(25, lim - 15);
        else off = 9 + r() * Math.min(26, lim - 9);
        if (!(o.tea && off < 30) && !(o.village && off < 24)) D.trees.push({ s: s + r() * 3, x: sd * off, sc: 0.75 + r() * 0.6, yaw: r() * TAU });
      }
      if (i % 9 === (sd < 0 ? 4 : 0) && r() < 0.7) D.far.push({ s: s + r() * 30, x: sd * (40 + r() * 6), sc: 0.9 + r() * 0.8, yaw: r() * TAU });
      // rocks on cliff sides
      if (k > 0.5 && r() < 0.06) D.rocks.push({ s, x: sd * (8.2 + r() * 2), sc: 0.5 + r() * 1.2, yaw: r() * TAU });
      // tea hedges in rows across the open banks
      if (o.tea && k > -0.3 && i % 2 === 0) for (let j = 0; j < 6; j++) { const off = 9 + j * 2.7; if (off < lim - 2) D.tea.push({ s: s + (j % 2) * 2, x: sd * off, sc: 0.85 + r() * 0.3, yaw: 0 }); }
    }
    // milestones every 400 m
    if (i % 100 === 10) D.mile.push({ s, x: (T.KL[i] < -0.3 ? 1 : -1) * 6.9 });
    // chevron boards on the outside of hairpins
    if (row.hair && i % 4 === 0 && Math.abs(T.CV[i]) > 0.012) { const out = T.CV[i] > 0 ? -1 : 1; D.chev.push({ s, x: out * 7.3, flip: out }); }
    // set pieces, once per section, a third of the way in
    const sec = row.sec, firstRow = !lastSec[sec];
    if (firstRow) lastSec[sec] = { i, used: {} };
    const L = lastSec[sec], at = (frac) => i === L.i + Math.round(frac * (T.def.secs[sec][0] / SEGM));
    if (o.village && at(0.15)) {
      for (let h = 0; h < 7; h++) { const sd = h % 2 ? 1 : -1, ss = s + h * 14 + r() * 6; D.houses.push({ s: ss, x: sd * (11 + r() * 6), sc: 0.9 + r() * 0.35, yaw: r() < 0.5 ? 0 : Math.PI / 2, col: ['#f2a7b8', '#9cc7e8', '#f5d66b', '#f4f1ea', '#a8d8a0', '#f0b27a'][(h + sec) % 6] }); }
      for (let l = 0; l < 3; l++) D.lamps.push({ s: s + l * 34, x: (l % 2 ? 1 : -1) * 6.95 });
      D.poles.push({ s: s + 50, x: -7.2 }, { s: s + 90, x: 7.2 });
    }
    if (o.chai && at(0.45)) D.chai.push({ s, x: (T.KL[i] > 0.4 ? -1 : T.KR[i] > 0.4 ? 1 : (r() < 0.5 ? -1 : 1)) * 9.6 });
    if (o.temple && at(0.6)) D.temple.push({ s, x: (T.KL[i] > 0.3 ? -1 : 1) * 12.5 });
    if (o.flags && at(0.3)) { D.flags.push({ s }); D.flags.push({ s: s + 26 }); }
    if (o.falls && at(0.55)) { const sd = T.KR[i] > 0.4 ? 1 : -1; D.falls.push({ s, x: sd * 11, sd }); }
  }
  // far mountains
  for (let s = -200; s < T.L + 400; s += 210) {
    for (let sd = -1; sd <= 1; sd += 2) {
      const i = clamp(Math.floor(s / SEGM), 0, N - 1), k = sideK(i, sd);
      if (look.sea && k < 0.4) continue;
      // keep peaks clear of every other stretch of road
      const off = k > 0.4 ? 260 + r() * 220 : 440 + r() * 380;
      posAt(T, s, sd * off, 0, V);
      let ok = true;
      for (let j = 0; j < N && ok; j += 10) { const dx = T.PX[j] - V.x, dz = T.PZ[j] - V.z; if (dx * dx + dz * dz < 260 * 260) ok = false; }
      if (ok) D.mtn.push({ s, x: sd * off, sc: 0.8 + r() * 0.9, yaw: r() * TAU, v: (r() * 3) | 0 });
    }
  }
  // mist banks drifting in the valley
  for (let i = 4; i < N; i += 9) {
    for (let sd = -1; sd <= 1; sd += 2) if (sideK(i, sd) < -0.4 && r() < 0.7) D.mist.push({ s: i * SEGM, x: sd * (22 + r() * 40), y: -14 - r() * 34, sc: 30 + r() * 30 });
  }
  decorCache[T.id] = D;
  return D;
}

/* ------------------------------------------------------------ scenery models */
function pineGeo() {
  const L = [cylG(0.12, 0.2, 2.4, 5, '#5a3e2b', [0, 1.2, 0])];
  for (let k = 0; k < 4; k++) L.push(prep(new THREE.ConeGeometry(1.7 - k * 0.32, 2.6, 7), k % 2 ? '#2f4f33' : '#294a2f', [0, 2.6 + k * 1.45, 0]));
  return mergeG(L);
}
function oakGeo() {
  const L = [limbG([0, 0, 0], [0.2, 7, 0.1], 0.18, '#6b5442', false, null, 5), limbG([0.1, 4, 0], [1.4, 6.5, 0.4], 0.08, '#6b5442', false, null, 4)];
  L.push(sphG(1.6, '#4f6e33', [0.3, 7.8, 0.1], [1.2, 0.85, 1.1], 7, 5), sphG(1.2, '#5c7c3a', [1.6, 6.8, 0.4], [1.1, 0.8, 1], 6, 4), sphG(1.1, '#466a30', [-0.8, 6.6, -0.4], [1.1, 0.8, 1], 6, 4));
  return mergeG(L);
}
function palmGeo() {
  const L = [];
  let x = 0, y = 0;
  for (let k = 0; k < 3; k++) { const nx = x + 0.3 + k * 0.12, ny = y + 2.6; L.push(limbG([x, y, 0], [nx, ny, 0], 0.17 - k * 0.025, k % 2 ? '#7a6248' : '#6b553f', false, null, 5)); x = nx; y = ny; }
  for (let f = 0; f < 7; f++) {
    const a = f / 7 * TAU, dx = Math.cos(a), dz = Math.sin(a);
    L.push(boxG(0.7, 0.03, 1.8, '#3f6e2f', [x + dx * 0.9, y + 0.25, dz * 0.9], [0.35, -a + Math.PI / 2, 0]));
    L.push(boxG(0.55, 0.03, 1.6, '#4a7a34', [x + dx * 2.3, y - 0.35, dz * 2.3], [-0.55, -a + Math.PI / 2, 0]));
  }
  L.push(sphG(0.28, '#5a4a2a', [x, y - 0.2, 0], [1, 0.8, 1], 6, 4));
  return mergeG(L);
}
function farTreeGeo(palm) {
  if (palm) return mergeG([cylG(0.12, 0.18, 6.5, 4, '#6b553f', [0.3, 3.2, 0]), prep(new THREE.ConeGeometry(2.6, 1.2, 6), '#3f6e2f', [0.5, 6.6, 0])]);
  return mergeG([cylG(0.12, 0.18, 1.6, 4, '#5a3e2b', [0, 0.8, 0]), prep(new THREE.ConeGeometry(1.6, 4.2, 6), '#2f4f33', [0, 3.4, 0]), prep(new THREE.ConeGeometry(1.15, 3, 6), '#294a2f', [0, 5.4, 0])]);
}
function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, r = rng(seed);
  for (let i = 0; i < p.count; i++) { const f = 0.75 + r() * 0.5; p.setXYZ(i, p.getX(i) * f * 1.3, p.getY(i) * f * 0.8 + 0.3, p.getZ(i) * f); }
  g.computeVertexNormals();
  return prep(g, '#8a8278');
}
function mountainGeo(seed) {
  const g = new THREE.ConeGeometry(160, 240, 22, 9), p = g.attributes.position, nz = vnoise(seed, 10), nz2 = vnoise(seed + 5, 24);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x) / TAU + 0.5, h = (y + 120) / 240;
    const f = 0.62 + nz(a, h * 0.6) * 0.55 + nz2(a, h) * 0.18;
    const ridge = Math.pow(Math.abs(Math.sin(a * TAU * 3 + nz(a, 0.3) * 4)), 3) * 0.12;
    p.setXYZ(i, x * (f - ridge), y + nz2(a * 1.7, h) * 26 * h - (h > 0.97 ? 18 * nz(a, 0.9) : 0), z * (f - ridge));
  }
  g.computeVertexNormals();
  const gg = prep(g, '#ffffff', [0, 108, 0]);
  const col = gg.attributes.color, pp = gg.attributes.position, nn = gg.attributes.normal;
  for (let i = 0; i < pp.count; i++) {
    const h = clamp(pp.getY(i) / 240, 0, 1), steep = 1 - Math.abs(nn.getY(i));
    _c.set('#41603f').lerp(_c2.set('#6f7a6a'), clamp(h * 1.4 + steep * 0.4, 0, 1));
    if (h > 0.82) _c.lerp(_c2.set('#e8ecef'), clamp((h - 0.82) * 5, 0, 0.9));
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return gg;
}
const _c2 = new THREE.Color();
function teaGeo() { return mergeG([sphG(1, '#ffffff', [0, 0.45, 0], [0.8, 0.55, 2.9], 7, 4)]); }
function guardGeo() { return mergeG([boxG(0.42, 0.55, 0.3, '#ffffff', [0, 0.27, 0])]); }
function hedgeGeo() { return mergeG([boxG(0.14, 0.75, 3.8, '#ffffff', [0, 0.37, 0]), boxG(0.1, 0.06, 3.8, '#ffffff', [0, 0.62, 0])]); }
function houseGeo() {
  const g = new THREE.BoxGeometry(6, 3.6, 5); g.translate(0, 1.8, 0); return g;
}
function roofGeo() {
  const L = [prep(new THREE.CylinderGeometry(3.6, 3.6, 5.6, 3, 1), '#ffffff', [0, 3.6 + 0.85, 0], [Math.PI / 2, 0, Math.PI / 2], [1, 1, 0.28]), boxG(6.6, 0.18, 5.8, '#ffffff', [0, 3.62, 0])];
  return mergeG(L);
}
function chaiGeo() {
  const L = [], post = '#6b4a2e';
  [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.4], [1.8, 1.4]].forEach((p) => L.push(cylG(0.07, 0.07, 2.6, 6, post, [p[0], 1.3, p[1]])));
  L.push(boxG(4.2, 0.12, 3.2, '#8a8f96', [0, 2.65, 0.1], [0.12, 0, 0]));
  for (let i = 0; i < 7; i++) L.push(boxG(0.6, 0.04, 1.2, i % 2 ? '#f5efe3' : '#d8452f', [-1.8 + i * 0.6, 2.4, -1.75], [-0.45, 0, 0]));
  L.push(boxG(3.4, 1.0, 0.8, '#3a6e9c', [0, 0.5, -0.9]));
  L.push(boxG(3.5, 0.08, 0.9, '#d9c49a', [0, 1.04, -0.9]));
  L.push(cylG(0.16, 0.2, 0.32, 10, '#c9ccd2', [-0.8, 1.24, -0.9]));
  L.push(cylG(0.18, 0.18, 0.08, 10, '#2a2a2a', [-0.8, 1.1, -0.9]));
  for (let i = 0; i < 5; i++) L.push(cylG(0.035, 0.03, 0.09, 6, '#f4ecd8', [0.2 + i * 0.16, 1.13, -0.95]));
  L.push(boxG(3.0, 0.08, 0.45, '#7a5232', [0, 0.45, -2.6]));
  [-1.3, 1.3].forEach((x) => L.push(boxG(0.08, 0.45, 0.4, '#7a5232', [x, 0.22, -2.6])));
  L.push(boxG(2.4, 0.6, 0.06, '#f2c230', [0, 2.95, -1.55]));
  L.push(boxG(2.5, 1.8, 0.1, '#7b5b3c', [0, 0.95, 1.4]));
  return mergeG(L);
}
function templeGeo() {
  const L = [], w = '#f4efe6', sf = '#ff8c1a';
  L.push(boxG(5, 0.6, 5, '#d6cbb8', [0, 0.3, 0]));
  L.push(boxG(3.4, 2.8, 3.4, w, [0, 2.0, 0]));
  L.push(boxG(1.2, 1.9, 0.1, '#3a2a20', [0, 1.55, -1.71]));
  for (let k = 0; k < 5; k++) L.push(boxG(3.0 - k * 0.5, 0.9, 3.0 - k * 0.5, k % 2 ? '#f0e4d0' : w, [0, 3.85 + k * 0.82, 0], [0, k * 0.1, 0]));
  L.push(prep(new THREE.ConeGeometry(0.5, 1.4, 8), '#e8b13a', [0, 8.6, 0]));
  L.push(limbG([0, 9.2, 0], [0, 10.8, 0], 0.03, '#555'));
  L.push(prep(new THREE.ConeGeometry(0.45, 1.3, 3), sf, [0.62, 10.4, 0], [0, 0, -Math.PI / 2], [1, 1, 0.1]));
  L.push(boxG(3.6, 0.25, 3.6, '#c2272d', [0, 3.45, 0]));
  return mergeG(L);
}
function lampGeo() { return mergeG([cylG(0.06, 0.09, 6, 6, '#3a3d44', [0, 3, 0]), limbG([0, 5.9, 0], [0, 6.1, -1.4], 0.04, '#3a3d44'), boxG(0.4, 0.14, 0.6, '#3a3d44', [0, 6.0, -1.5])]); }
function lampHeadGeo() { return mergeG([boxG(0.32, 0.05, 0.5, '#ffd28a', [0, 5.92, -1.5])]); }
function poleGeo() { return mergeG([cylG(0.09, 0.13, 8, 6, '#8a8178', [0, 4, 0]), boxG(1.8, 0.1, 0.1, '#6b6157', [0, 7.4, 0])]); }
function chevGeo() { const g = new THREE.BoxGeometry(1.4, 0.45, 0.06); g.translate(0, 1.05, 0); return g; }
function chevPostGeo() { return mergeG([cylG(0.04, 0.04, 1.2, 5, '#3a3d44', [-0.5, 0.6, 0.05]), cylG(0.04, 0.04, 1.2, 5, '#3a3d44', [0.5, 0.6, 0.05])]); }
function mileGeo() { const g = new THREE.BoxGeometry(0.42, 0.75, 0.2); g.translate(0, 0.37, 0); return g; }

/* ------------------------------------------------------------ building a course in 3D */
const CULL = [];         // instanced chunks and terrain pieces, hidden when far from the camera
const QUAL = [];         // meshes that only cast shadows on the top tier
const _mtx = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _sc = new THREE.Vector3(), _ps = new THREE.Vector3(), _ax = new THREE.Vector3(0, 1, 0);
function itemMatrix(T, it, m, upY) {
  groundPos(T, it.s, it.x, V);
  const yaw = -FR.h + (it.yaw || 0);
  _qt.setFromAxisAngle(_ax, yaw);
  const sc = it.sc || 1;
  _sc.set(sc, sc, sc);
  _ps.set(V.x, V.y + (upY || 0) + (it.y || 0), V.z);
  m.compose(_ps, _qt, _sc);
  return m;
}
function addInstanced(T, group, geo, mat, items, o) {
  o = o || {};
  const chunk = o.chunk || 400, buckets = new Map();
  items.forEach((it) => { const k = Math.floor(it.s / chunk); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(it); });
  buckets.forEach((list) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, j) => {
      if (o.matrix) o.matrix(it, _mtx); else itemMatrix(T, it, _mtx, o.up);
      im.setMatrixAt(j, _mtx);
      if (o.color) { _c.set(o.color(it, j)); im.setColorAt(j, _c); }
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = !!o.shadow; im.receiveShadow = o.receive !== false;
    if (o.shadow === 'q') { im.castShadow = false; QUAL.push(im); }
    im.userData.ov = !!o.ov;
    group.add(im);
    const bs = im.boundingSphere;
    CULL.push({ im, x: bs.center.x, y: bs.center.y, z: bs.center.z, r: bs.radius, far: !!o.far });
  });
}

const SCN = {};   // built course scenes by id
function buildCourseScene(T) {
  if (SCN[T.id]) return SCN[T.id];
  const tx = textures(), look = T.look, D = decorFor(T), group = new THREE.Group(), S = { group, T, falls: [], flagMat: null, waterMats: [], lit: [] };
  const N = T.N, CH = 40;
  // terrain: one grid per side, normals from the whole grid so chunks join without seams
  const NC = OFF.length;
  const sides = [-1, 1].map((sd) => {
    const P = new Float32Array(N * NC * 3), C = new Float32Array(N * NC * 3), U = new Float32Array(N * NC * 2);
    const cG = new THREE.Color(look.grass), cG2 = new THREE.Color(look.grass2), cR = new THREE.Color(look.rock), cD = new THREE.Color(look.dirt), tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const lim = T.LIM[i * 2 + (sd > 0 ? 1 : 0)], k = sd < 0 ? T.KL[i] : T.KR[i];
      frameAt(T, i * SEGM);
      let prev = 0;
      for (let j = 0; j < NC; j++) {
        const off = j < 3 ? OFF[j] : Math.min(OFF[j], Math.max(prev + 0.4, lim));
        prev = off;
        const h = bankH(T, i, sd * off);
        const q = (i * NC + j) * 3;
        P[q] = FR.x + FR.rx * sd * off; P[q + 1] = FR.y + h; P[q + 2] = FR.z + FR.rz * sd * off;
        U[(i * NC + j) * 2] = off / 4; U[(i * NC + j) * 2 + 1] = i * SEGM / 4;
        // colour: shoulder dirt, rock on walls and drops, grass on top
        const nz = hash(i * 13 + j * 7 + (sd > 0 ? 999 : 0));
        if (j <= 1) tmp.copy(cD).lerp(cR, 0.2 + nz * 0.15);
        else {
          const steep = j >= 2 && j <= 5 ? Math.abs(k) : Math.abs(k) * 0.4;
          tmp.copy(nz > 0.5 ? cG : cG2).lerp(cR, clamp(steep * 1.05 - 0.1 + (nz - 0.5) * 0.3, 0, 1));
          if (k < -0.3 && j >= 5) tmp.lerp(cG2, 0.5);
        }
        C[q] = tmp.r; C[q + 1] = tmp.g; C[q + 2] = tmp.b;
      }
    }
    // normals by central differences over the grid
    const Nn = new Float32Array(N * NC * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
    const pv = (i, j, out) => { i = clamp(i, 0, N - 1); j = clamp(j, 0, NC - 1); const q = (i * NC + j) * 3; return out.set(P[q], P[q + 1], P[q + 2]); };
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    for (let i = 0; i < N; i++) for (let j = 0; j < NC; j++) {
      pv(i + 1, j, p1); pv(i - 1, j, p0); a.subVectors(p1, p0);
      pv(i, j + 1, p1); pv(i, j - 1, p0); b.subVectors(p1, p0);
      n.crossVectors(a, b).normalize(); if (sd > 0) n.negate(); if (n.y < 0) n.negate();
      const q = (i * NC + j) * 3; Nn[q] = n.x; Nn[q + 1] = n.y; Nn[q + 2] = n.z;
    }
    return { P, C, U, Nn };
  });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tx.ground, normalMap: tx.groundN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, metalness: 0 });
  const roadMat = new THREE.MeshStandardMaterial({ map: tx.road, normalMap: tx.roadN, normalScale: new THREE.Vector2(0.35, 0.35), roughness: look.night ? 0.72 : 0.86, metalness: 0.02, color: look.night ? '#d8d4dc' : '#ffffff' });
  for (let c0 = 0; c0 < N - 1; c0 += CH) {
    const c1 = Math.min(N - 1, c0 + CH), rowsN = c1 - c0 + 1;
    // banks
    const pos = [], nor = [], col = [], uv = [], idx = [];
    let base = 0;
    sides.forEach((sdD, si) => {
      for (let i = c0; i <= c1; i++) for (let j = 0; j < NC; j++) {
        const q = (i * NC + j) * 3, u = (i * NC + j) * 2;
        pos.push(sdD.P[q], sdD.P[q + 1], sdD.P[q + 2]); nor.push(sdD.Nn[q], sdD.Nn[q + 1], sdD.Nn[q + 2]); col.push(sdD.C[q], sdD.C[q + 1], sdD.C[q + 2]); uv.push(sdD.U[u], sdD.U[u + 1]);
      }
      for (let i = 0; i < rowsN - 1; i++) for (let j = 0; j < NC - 1; j++) {
        const a = base + i * NC + j, b = a + NC, c = a + 1, d = b + 1;
        if (si === 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
      }
      base += rowsN * NC;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; group.add(m);
    CULL.push({ im: m, x: g.boundingSphere.center.x, y: g.boundingSphere.center.y, z: g.boundingSphere.center.z, r: g.boundingSphere.radius, terrain: true });
    // tarmac
    const rp = [], rn = [], ru = [], ri = [];
    for (let i = c0; i <= c1; i++) {
      frameAt(T, i * SEGM);
      [-1, 1].forEach((sd) => { rp.push(FR.x + FR.rx * sd * 5.62, FR.y + 0.012, FR.z + FR.rz * sd * 5.62); rn.push(0, 1, 0); ru.push(sd < 0 ? 0 : 1, i * SEGM / 16); });
    }
    for (let i = 0; i < rowsN - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; ri.push(a, b, c, b, d, c); }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2)); rg.setIndex(ri);
    rg.computeBoundingSphere();
    const rm = new THREE.Mesh(rg, roadMat); rm.receiveShadow = true; group.add(rm);
    CULL.push({ im: rm, x: rg.boundingSphere.center.x, y: rg.boundingSphere.center.y, z: rg.boundingSphere.center.z, r: rg.boundingSphere.radius, terrain: true });
  }
  // tunnels: an arched shell, a stone portal at each end and lamps along the roof
  const tunMat = new THREE.MeshStandardMaterial({ map: tx.tunnel, color: '#bdb6aa', roughness: 0.9, side: THREE.DoubleSide });
  const portalMat = new THREE.MeshStandardMaterial({ color: '#8f877b', map: tx.ground, roughness: 0.95 });
  const tLamps = [];
  let inT = false, t0 = 0;
  for (let i = 0; i <= N; i++) {
    const on = i < N && T.TUN[i] > 0.5;
    if (on && !inT) { inT = true; t0 = i; }
    if (!on && inT) {
      inT = false; const t1 = i - 1, A = 12;
      const pos = [], uv = [], idx = [];
      for (let r0 = t0; r0 <= t1; r0++) {
        frameAt(T, r0 * SEGM);
        for (let a = 0; a <= A; a++) { const an = a / A * Math.PI, x = Math.cos(an) * 7.7, y = Math.sin(an) * 6.6; pos.push(FR.x + FR.rx * x, FR.y + y, FR.z + FR.rz * x); uv.push(a / A * 4, r0 * SEGM / 6); }
        if (r0 % 3 === 0) { tLamps.push({ s: r0 * SEGM, x: -2.6, y: 6.1 }); tLamps.push({ s: r0 * SEGM, x: 2.6, y: 6.1 }); }
      }
      for (let r0 = 0; r0 < t1 - t0; r0++) for (let a = 0; a < A; a++) { const p = r0 * (A + 1) + a, q = p + A + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, tunMat); m.castShadow = true; m.receiveShadow = true; group.add(m);
      CULL.push({ im: m, x: g.boundingSphere.center.x, y: g.boundingSphere.center.y, z: g.boundingSphere.center.z, r: g.boundingSphere.radius, terrain: true });
      // portals: a stone face with the arch cut out
      [t0, t1].forEach((rr) => {
        frameAt(T, rr * SEGM);
        const pp = [], ii = [], A2 = 16;
        for (let a = 0; a <= A2; a++) {
          const an = a / A2 * Math.PI, ix = Math.cos(an) * 7.7, iy = Math.sin(an) * 6.6;
          const ox = Math.cos(an) * 17, oy = Math.max(0, Math.sin(an) * 15) + (a === 0 || a === A2 ? 0 : 1);
          pp.push(FR.x + FR.rx * ix, FR.y + iy, FR.z + FR.rz * ix, FR.x + FR.rx * ox, FR.y + oy, FR.z + FR.rz * ox);
        }
        for (let a = 0; a < A2; a++) { const p = a * 2; ii.push(p, p + 1, p + 2, p + 2, p + 1, p + 3); }
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
        const uvs = []; for (let a = 0; a <= A2; a++) uvs.push(a / A2 * 6, 0, a / A2 * 6, 3);
        pg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); pg.setIndex(ii); pg.computeVertexNormals();
        const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: '#8f877b', map: tx.ground, roughness: 0.95, side: THREE.DoubleSide })); pm.castShadow = true; pm.receiveShadow = true; group.add(pm);
      });
    }
  }
  void portalMat;
  if (tLamps.length) {
    const lm = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false });
    addInstanced(T, group, new THREE.BoxGeometry(0.5, 0.12, 1.4), lm, tLamps, { matrix: (it, m) => { posAt(T, it.s, it.x, it.y, V); _qt.setFromAxisAngle(_ax, -FR.h); m.compose(_ps.set(V.x, V.y, V.z), _qt, _sc.set(1, 1, 1)); return m; } });
  }
  // scenery
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0 }, o || {}));
  const guards = D.guard.filter((g) => !g.low), hedges = D.guard.filter((g) => g.low);
  addInstanced(T, group, guardGeo(), std({ roughness: 0.7 }), guards, { shadow: 'q', color: (it) => (it.n % 2 ? '#f4f1ea' : (T.id === 'tea' ? '#f2c230' : '#202124')) });
  addInstanced(T, group, hedgeGeo(), std({ roughness: 0.9 }), hedges, { color: (it) => (T.id === 'tea' ? '#3f6b2f' : T.id === 'coast' ? '#8a6a48' : '#4b6a3a') });
  const treeG = look.tree === 'palm' ? palmGeo() : look.tree === 'oak' ? oakGeo() : pineGeo();
  addInstanced(T, group, treeG, std({ roughness: 0.9 }), D.trees, { shadow: 'q' });
  addInstanced(T, group, farTreeGeo(look.tree === 'palm'), std({ roughness: 0.95 }), D.far, { far: true, ov: true });
  addInstanced(T, group, rockGeo(4), std({ map: tx.ground, roughness: 0.95 }), D.rocks, { shadow: 'q' });
  if (D.tea.length) addInstanced(T, group, teaGeo(), std({ roughness: 0.95, map: tx.ground }), D.tea, { color: (it, j) => (hash(j * 3) > 0.5 ? '#4d8a2f' : '#3f7a2a'), chunk: 300 });
  addInstanced(T, group, mileGeo(), new THREE.MeshStandardMaterial({ map: tx.mile, roughness: 0.6 }), D.mile, { yaw: 0 });
  const houseMat = new THREE.MeshStandardMaterial({ map: tx.house, roughness: 0.85, emissiveMap: look.night ? tx.houseLit : null, emissive: look.night ? '#ffffff' : '#000000', emissiveIntensity: look.night ? 1.2 : 0 });
  addInstanced(T, group, houseGeo(), houseMat, D.houses, { shadow: true, color: (it) => it.col });
  addInstanced(T, group, roofGeo(), std({ roughness: 0.6, metalness: 0.3 }), D.houses, { shadow: true, color: (it, j) => ['#9a4a32', '#8d9399', '#b05a3a', '#6f7a84'][j % 4] });
  addInstanced(T, group, chaiGeo(), std({ roughness: 0.75 }), D.chai.map((c) => Object.assign({ yaw: c.x < 0 ? Math.PI / 2 : -Math.PI / 2 }, c)), { shadow: true });
  addInstanced(T, group, templeGeo(), std({ roughness: 0.7 }), D.temple.map((c) => Object.assign({ yaw: c.x < 0 ? Math.PI / 2 : -Math.PI / 2 }, c)), { shadow: true });
  addInstanced(T, group, lampGeo(), std({ roughness: 0.5, metalness: 0.4 }), D.lamps.map((l) => Object.assign({ yaw: l.x < 0 ? -Math.PI / 2 : Math.PI / 2 }, l)), { shadow: 'q' });
  const headMat = new THREE.MeshBasicMaterial({ color: look.night ? '#ffd28a' : '#cfcac0', toneMapped: !look.night });
  addInstanced(T, group, lampHeadGeo(), headMat, D.lamps.map((l) => Object.assign({ yaw: l.x < 0 ? -Math.PI / 2 : Math.PI / 2 }, l)));
  addInstanced(T, group, poleGeo(), std({ roughness: 0.8 }), D.poles, { shadow: 'q' });
  const chevMat = new THREE.MeshStandardMaterial({ map: tx.chev, roughness: 0.6, emissive: look.night ? '#ffffff' : '#000000', emissiveMap: tx.chev, emissiveIntensity: look.night ? 0.35 : 0 });
  const chevItems = D.chev.map((c) => Object.assign({ yaw: c.flip > 0 ? Math.PI : 0 }, c));
  addInstanced(T, group, chevGeo(), chevMat, chevItems, {});
  addInstanced(T, group, chevPostGeo(), std({}), chevItems, {});
  // prayer flags strung across the road, swaying in the wind
  const flagItems = [], flagCols = ['#2d5fd1', '#f4f1ea', '#d8352f', '#2f9e5a', '#f2c230'];
  const poleItems = [];
  D.flags.forEach((f) => {
    const n = 22;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1), x = lerp(-7.4, 7.4, u), sag = 1.6 * (1 - Math.pow(2 * u - 1, 2));
      flagItems.push({ s: f.s + u * 3, x, y: 6.4 - sag, k });
    }
    poleItems.push({ s: f.s, x: -7.5 }, { s: f.s + 3, x: 7.5 });
  });
  if (flagItems.length) {
    const fg = new THREE.PlaneGeometry(0.42, 0.34); fg.translate(0, -0.17, 0);
    const fm = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 }; S.flagShader = sh;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5; transformed.z += sin(uTime * 5.0 + ph) * 0.12 * (-position.y + 0.05) * 3.0; transformed.x += cos(uTime * 3.7 + ph) * 0.03;');
    };
    addInstanced(T, group, fg, fm, flagItems, { matrix: (it, m) => { posAt(T, it.s, it.x, it.y, V); _qt.setFromAxisAngle(_ax, -FR.h); return m.compose(_ps.set(V.x, V.y, V.z), _qt, _sc.set(1, 1, 1)); }, color: (it) => flagCols[it.k % 5] });
    addInstanced(T, group, mergeG([cylG(0.06, 0.08, 7, 6, '#7a6248', [0, 3.5, 0])]), std({}), poleItems, { shadow: 'q' });
  }
  // waterfalls down the rock wall, with a pool at the foot
  if (D.falls.length) {
    const fallTex = tx.falls.clone(); fallTex.needsUpdate = true; ALL_TEX.push(fallTex);
    const fm = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.9, depthWrite: false, color: '#e6f2ff', side: THREE.DoubleSide, fog: true });
    S.fallTex = fallTex;
    D.falls.forEach((f) => {
      // a strip laid on the rock face itself, from the pool up the wall
      const fp = [], fu = [], fi = [], OF = [8.2, 9.5, 11, 13, 15.5, 18, 21, 24, 27];
      for (let a = 0; a < 2; a++) {
        const s = f.s + (a ? 2.4 : -2.4), i = rowOf(T, s);
        for (let j = 0; j < OF.length; j++) {
          posAt(T, s, f.sd * OF[j], bankH(T, i, f.sd * OF[j]) + 0.35 + j * 0.05, V);
          fp.push(V.x, V.y, V.z); fu.push(a, j / (OF.length - 1) * 3);
        }
      }
      for (let j = 0; j < OF.length - 1; j++) { const p0 = j, p1 = j + 1, q0 = j + OF.length, q1 = q0 + 1; fi.push(p0, q0, p1, p1, q0, q1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); g.setIndex(fi);
      const m = new THREE.Mesh(g, fm); m.renderOrder = 2;
      group.add(m);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), new THREE.MeshStandardMaterial({ color: '#6f95a8', roughness: 0.1, metalness: 0.4 }));
      groundPos(T, f.s, f.sd * 8.0, V2); pool.position.set(V2.x, V2.y + 0.06, V2.z); pool.rotation.x = -Math.PI / 2; group.add(pool);
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.mist, color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false }));
      mist.position.set(V2.x, V2.y + 1.6, V2.z); mist.scale.set(6, 3.5, 1); group.add(mist);
      S.falls.push({ s: f.s, sd: f.sd, x: V2.x, y: V2.y, z: V2.z });
    });
  }
  // mist banks hanging in the valley
  if (D.mist.length && look.mist > 0) {
    const mm = new THREE.MeshBasicMaterial({ map: tx.mist, transparent: true, depthWrite: false, opacity: 0.55 * look.mist + 0.15, color: look.fog, fog: true, side: THREE.DoubleSide });
    const mg = new THREE.PlaneGeometry(1, 1); mg.rotateX(-Math.PI / 2);
    addInstanced(T, group, mg, mm, D.mist, { matrix: (it, m) => { posAt(T, it.s, it.x, it.y, V); _qt.setFromAxisAngle(_ax, hash(it.s | 0) * 6); return m.compose(_ps.set(V.x, V.y, V.z), _qt, _sc.set(it.sc, 1, it.sc * 0.7)); }, ov: true, far: true });
  }
  // far mountains
  const mgs = [mountainGeo(3), mountainGeo(7), mountainGeo(11)];
  const mmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: tx.ground });
  for (let v = 0; v < 3; v++) {
    const items = D.mtn.filter((m) => m.v === v);
    addInstanced(T, group, mgs[v], mmat, items, { chunk: 1200, far: true, matrix: (it, m) => { posAt(T, it.s, it.x, 0, V); V.y = T.minY - 120; _qt.setFromAxisAngle(_ax, it.yaw); return m.compose(_ps.set(V.x, V.y, V.z), _qt, _sc.set(it.sc * 1.3, it.sc * (0.9 + 0.4 * hash(it.s | 0)), it.sc * 1.3)); } });
  }
  // start and finish gantries
  [[T.startS, tx.banner], [T.finishS, tx.finish]].forEach((gd) => {
    posAt(T, gd[0], 0, 0, V);
    const gg = new THREE.Group(); gg.position.set(V.x, V.y, V.z); gg.rotation.y = -FR.h;
    const post = new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.5, metalness: 0.6 });
    [-1, 1].forEach((sd) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 7.2, 10), post); p.position.set(sd * 7.4, 3.6, 0); p.castShadow = true; gg.add(p); });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 1.8), new THREE.MeshStandardMaterial({ map: gd[1], side: THREE.DoubleSide, roughness: 0.7, emissive: '#ffffff', emissiveMap: gd[1], emissiveIntensity: look.night ? 0.5 : 0.1 }));
    ban.position.set(0, 6.4, 0); ban.castShadow = true; gg.add(ban);
    group.add(gg);
  });
  // the valley floor (or the sea) is a broad plane that follows the camera
  const floorY = T.minY - (look.sea ? 34 : 90);
  let far;
  if (look.sea) {
    const sm = new THREE.MeshStandardMaterial({ color: '#2b4a68', roughness: 0.18, metalness: 0.65, normalMap: tx.seaN, normalScale: new THREE.Vector2(0.6, 0.6) });
    far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), sm); S.seaTex = tx.seaN;
  } else {
    const ft = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, '#ffffff', 0.4, 4000, 66, 6); const r = rng(3); for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.08 + r() * 0.12) + ')'; g.fillRect(r() * w, r() * h, 20 + r() * 50, 14 + r() * 40); } }, { repeat: [90, 90] });
    far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: look.floor, map: ft, roughness: 1 }));
  }
  far.rotation.x = -Math.PI / 2; far.receiveShadow = false; group.add(far);
  S.far = far; S.floorY = floorY;
  S.cullFrom = CULL.length;
  SCN[T.id] = S;
  // every culled piece knows which course it belongs to
  CULL.forEach((c) => { if (!c.course) c.course = T.id; });
  return S;
}

/* ------------------------------------------------------------ the 3D stage */
let R3 = null;
let NO3D = false;
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uFog; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uCloud; uniform float uTime;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }',
  'void main(){',
  '  vec3 d = normalize(vDir); float y = d.y;',
  '  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, y));',
  '  c = mix(c, uTop, smoothstep(0.18, 0.85, y));',
  '  float sd = max(dot(d, normalize(uSunDir)), 0.0);',
  '  c += uSun * (pow(sd, 900.0) * 6.0 + pow(sd, 22.0) * 0.35 + pow(sd, 4.0) * 0.12);',
  '  if (y > 0.0) {',
  '    vec2 uv = d.xz / (y + 0.14) * 0.8 + vec2(uTime * 0.006, uTime * 0.002);',
  '    float n = fbm(uv * 1.6);',
  '    float cl = smoothstep(0.62 - uCloud * 0.28, 0.95, n) * smoothstep(0.0, 0.18, y);',
  '    vec3 cc = mix(vec3(1.0, 0.98, 0.95), uSun, 0.45) * (0.65 + 0.7 * pow(sd, 5.0)) + uHor * 0.15;',
  '    c = mix(c, cc, cl * 0.75);',
  '  }',
  '  c = mix(c, uFog, (1.0 - smoothstep(-0.02, 0.1, y)) * 0.85);',
  '  if (y < 0.0) c = mix(uFog, uFog * 0.8, smoothstep(0.0, -0.4, y));',
  '  gl_FragColor = vec4(c, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}'
].join('\n');

function setup3D(arc) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  RENDERER = renderer;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c6c4cc', 0.004);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 2600);
  const hemi = new THREE.HemisphereLight('#c4d2ec', '#4a4636', 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe0b8', 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 2; sc.far = 240;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const head = new THREE.SpotLight('#ffe9c4', 0, 70, 0.42, 0.55, 1.6); scene.add(head, head.target);
  const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.2, -1) }, uSun: { value: new THREE.Color() }, uCloud: { value: 0.5 }, uTime: { value: 0 } };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  R3 = {
    renderer, scene, camera, hemi, sun, head, sky, skyMat, skyU, pmrem, cur: null, bikes: null, worldRef: null, lost: false,
    quality: -1, qT: 0, qN: 0, fps: 60, soft: false, lastNow: 0, camPos: new THREE.Vector3(), camTgt: new THREE.Vector3(), camInit: false, time: 0, sunDir: new THREE.Vector3(), envs: {}, tunK: 0, lockQ: false
  };
  FX = createFX(scene);
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R3.gpu = name;
    R3.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R3.soft = false; }
  arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
  arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
  return true;
}

// Four looks, from everything on to a slow or software renderer.
const TIERS = [
  { px: 0.5, budget: 160000, shadow: false, map: 1024, cheap: true, cull: 320, fx: 0.4, aniso: 1, ov: false },
  { px: 0.72, budget: 520000, shadow: false, map: 1024, cheap: false, cull: 480, fx: 0.7, aniso: 2, ov: true },
  { px: 0.9, budget: 1.05e6, shadow: true, map: 1024, cheap: false, cull: 640, fx: 1, aniso: 4, ov: true },
  { px: 1, budget: 1.9e6, shadow: true, map: 2048, cheap: false, cull: 900, fx: 1, aniso: 8, ov: true }
];
function resize3D(arc) {
  if (!R3) return;
  const t = TIERS[Math.max(0, R3.quality)];
  const pr = Math.min(arc.dpr * t.px, Math.sqrt(t.budget / Math.max(1, arc.w * arc.h)));
  R3.renderer.setPixelRatio(Math.max(0.3, pr));
  R3.renderer.setSize(arc.w, arc.h, false);
  R3.camera.aspect = arc.w / arc.h; R3.camera.updateProjectionMatrix();
}
const cheapCache = new Map();
function fullOf(m) { return m.userData && m.userData.full ? m.userData.full : m; }
function cheapOf(m) {
  if (!m.isMeshStandardMaterial) return m;
  let c = cheapCache.get(m);
  if (!c) {
    c = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map, vertexColors: m.vertexColors, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity });
    c.userData.full = m; cheapCache.set(m, c);
  }
  return c;
}
function applyTier() {
  const r = R3, t = TIERS[r.quality];
  r.scene.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material)) {
      const full = fullOf(o.material), want = t.cheap ? cheapOf(full) : full;
      if (o.material !== want) o.material = want;
    }
  });
  const an = Math.min(t.aniso, r.renderer.capabilities.getMaxAnisotropy()); TEX_ANISO = an;
  ALL_TEX.forEach((tx) => { if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; } });
  QUAL.forEach((m) => { m.castShadow = t.shadow && r.quality >= 3; });
  r.renderer.shadowMap.enabled = t.shadow; r.sun.castShadow = t.shadow;
  if (r.sun.shadow.mapSize.x !== t.map) { r.sun.shadow.mapSize.set(t.map, t.map); if (r.sun.shadow.map) { r.sun.shadow.map.dispose(); r.sun.shadow.map = null; } }
  if (FX) FX.density = t.fx;
  r.scene.environment = t.cheap ? null : (r.cur ? r.envs[r.cur.T.id] : null);
  lightLevels();
}
function setQuality(q) {
  if (!R3) return;
  q = clamp(q | 0, 0, 3);
  if (q === R3.quality) return;
  R3.quality = q;
  applyTier(); resize3D(ARC);
}
function lightLevels() {
  const r = R3; if (!r.cur) return;
  const L = r.cur.T.look, t = TIERS[Math.max(0, r.quality)], dark = 1 - 0.62 * r.tunK;
  r.hemi.intensity = L.hemiI * (t.cheap ? 1.6 : 1) * dark;
  r.sun.intensity = L.sunI * (t.cheap ? 1.2 : 1) * (1 - 0.85 * r.tunK);
}

function lookFor(T, S) {
  const r = R3, L = T.look;
  r.scene.fog.color.set(L.fog); r.scene.fog.density = L.fogD;
  r.hemi.color.set(L.hemiSky); r.hemi.groundColor.set(L.hemiGnd);
  r.sun.color.set(L.sun);
  r.sunDir.set(Math.sin(L.sunAz) * Math.cos(L.sunEl), Math.sin(L.sunEl), -Math.cos(L.sunAz) * Math.cos(L.sunEl)).normalize();
  const u = r.skyU;
  u.uTop.value.set(L.skyTop); u.uMid.value.set(L.skyMid); u.uHor.value.set(L.skyHor); u.uFog.value.set(L.fog); u.uSun.value.set(L.sun); u.uCloud.value = L.cloud;
  u.uSunDir.value.copy(r.sunDir);
  r.renderer.toneMappingExposure = L.exposure;
  r.renderer.setClearColor(L.fog);
  if (!r.envs[T.id]) {
    // image-based light from this course's own sky, so paint and chrome pick up dawn, gold or dusk
    const es = new THREE.Scene(), em = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), r.skyMat); es.add(em);
    const keepFog = r.scene.fog;
    r.envs[T.id] = r.pmrem.fromScene(es, 0.02, 0.1, 100).texture;
    em.geometry.dispose(); r.scene.fog = keepFog;
  }
  const t = TIERS[Math.max(0, r.quality)];
  r.scene.environment = t.cheap ? null : r.envs[T.id];
  r.scene.environmentIntensity = L.night ? 0.55 : 0.75;
  r.head.intensity = 0;
  lightLevels();
}

/* ------------------------------------------------------------ the world in 3D: bikes, traffic, cows */
function disposeWorld3D() {
  const r = R3; if (!r.bikes) return;
  r.bikes.forEach((B) => { r.scene.remove(B.root, B.rroot); });
  r.patrolBikes.forEach((B) => { r.scene.remove(B.root, B.rroot); });
  r.cows.forEach((c) => r.scene.remove(c));
  Object.keys(r.traffic).forEach((k) => { const t = r.traffic[k]; r.scene.remove(t.im); t.im.dispose(); });
  if (r.tLights) { r.scene.remove(r.tLights); r.tLights.dispose(); }
  if (r.tBack) { r.scene.remove(r.tBack); r.tBack.dispose(); }
  if (r.hazMesh) { r.hazMesh.forEach((m) => { r.scene.remove(m); m.geometry.dispose(); }); }
  r.bikes = null;
}
let TRAF_GEO = null, COW_GEO = null, HAZ_MAT = null;
function activateWorld(W) {
  const r = R3, T = W.T, S = buildCourseScene(T);
  if (r.cur !== S) {
    if (r.cur) r.scene.remove(r.cur.group);
    r.scene.add(S.group); r.cur = S; lookFor(T, S);
  }
  disposeWorld3D();
  const night = !!T.look.night;
  r.bikes = W.riders.map((R) => makeBike(R, { night }));
  r.bikes.forEach((B) => r.scene.add(B.root, B.rroot));
  r.patrolBikes = W.patrols.map((p) => {
    const pr = { kind: 'thunder', paint: '#f4f4f4', jacket: '#eef1f4', helmet: '#f4f4f4', beacon: 0 };
    const B = makeBike(pr, { patrol: true, night }); B.p = p; r.scene.add(B.root, B.rroot); return B;
  });
  // traffic: one instanced mesh per kind
  if (!TRAF_GEO) TRAF_GEO = { truck: truckGeo(), bus: busGeo(), car: carGeo(), tempo: tempoGeo(), lights: vLightsGeo() };
  const vm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
  r.traffic = {};
  ['truck', 'bus', 'car', 'tempo'].forEach((k) => {
    const list = W.traffic.filter((v) => v.kind === k); if (!list.length) return;
    const im = new THREE.InstancedMesh(TRAF_GEO[k], vm, list.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    list.forEach((v, j) => { _c.set(v.col); im.setColorAt(j, _c); });
    im.instanceColor.needsUpdate = true;
    r.scene.add(im); r.traffic[k] = { im, list };
  });
  r.tLights = new THREE.InstancedMesh(TRAF_GEO.lights, bikeMats().lights, W.traffic.length); r.tLights.frustumCulled = false; r.scene.add(r.tLights);
  const trucks = W.traffic.filter((v) => v.kind === 'truck');
  r.tBackList = trucks;
  r.tBack = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 1.9), new THREE.MeshStandardMaterial({ map: textures().truckBack, roughness: 0.7 }), Math.max(1, trucks.length)); r.tBack.frustumCulled = false; r.scene.add(r.tBack);
  // cows
  if (!COW_GEO) COW_GEO = cowGeo();
  r.cows = W.cows.map((c) => { const m = new THREE.Mesh(COW_GEO, new THREE.MeshStandardMaterial({ vertexColors: true, color: c.col, roughness: 0.85 })); m.castShadow = true; m.userData.cow = c; r.scene.add(m); return m; });
  // oil and gravel patches
  if (!HAZ_MAT) {
    const tx = textures();
    HAZ_MAT = {
      oil: new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w) => { g.clearRect(0, 0, w, w); softBlob(g, w / 2, w / 2, w / 2, 'rgba(8,8,12,A)', 0.95); const gr = g.createLinearGradient(20, 30, 100, 100); gr.addColorStop(0, 'rgba(120,60,200,.0)'); gr.addColorStop(0.5, 'rgba(60,160,200,.25)'); gr.addColorStop(1, 'rgba(200,120,60,0)'); g.fillStyle = gr; g.beginPath(); g.arc(w / 2, w / 2, w / 2.6, 0, TAU); g.fill(); }, { clamp: true }), transparent: true, depthWrite: false, roughness: 0.05, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
      gravel: new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w) => { g.clearRect(0, 0, w, w); const r = rng(5); for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * w, d = Math.hypot(x - w / 2, y - w / 2) / (w / 2); if (d > 1 || r() < d * d) continue; g.fillStyle = ['#8a7a64', '#6b5d4c', '#a8977c', '#4e443a'][i % 4]; g.fillRect(x, y, 2 + r() * 3, 2 + r() * 3); } }, { clamp: true }), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })
    };
    void tx;
  }
  r.hazMesh = W.hazards.map((h) => {
    const g = new THREE.PlaneGeometry(h.rx * 2.2, h.rs * 2.2); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, HAZ_MAT[h.kind]); posAt(T, h.s, h.x, 0.03, V); m.position.set(V.x, V.y, V.z); m.rotation.y = -FR.h; m.receiveShadow = true; m.renderOrder = 1; r.scene.add(m); return m;
  });
  FX.clear();
  applyTier();
  r.camInit = false; r.worldRef = W;
}

const _tq = new THREE.Quaternion(), _te = new THREE.Euler(0, 0, 0, 'YXZ');
function poseWorld(W, dt) {
  const r = R3, T = W.T;
  for (let i = 0; i < W.riders.length; i++) poseBike(r.bikes[i], W, W.riders[i], dt);
  for (let i = 0; i < r.patrolBikes.length; i++) {
    const B = r.patrolBikes[i], p = B.p, fake = B.R;
    fake.s = p.s; fake.x = p.x; fake.v = p.v; fake.vx = 0; fake.lean = 0; fake.wob = 0; fake.crash = 0; fake.shoveT = 0; fake.invuln = 0; fake.beacon = p.beacon; fake.wheel = (fake.wheel || 0) + p.v * dt / 0.32;
    poseBike(B, W, fake, dt);
    if (p.parked) { B.root.rotation.z = 0.12 * Math.sign(p.x); B.rroot.rotation.z = 0.12 * Math.sign(p.x); }
  }
  // traffic
  let li = 0, bi = 0;
  Object.keys(r.traffic).forEach((k) => {
    const t = r.traffic[k];
    t.list.forEach((v, j) => {
      posAt(T, v.s, v.x, 0, V);
      _te.set(FR.pitch * v.dir, -FR.h + (v.dir < 0 ? Math.PI : 0), Math.sin(W.t * 2 + v.swayP) * 0.012);
      _tq.setFromEuler(_te);
      _mtx.compose(_ps.set(V.x, V.y, V.z), _tq, _sc.set(1, 1, 1));
      t.im.setMatrixAt(j, _mtx);
      _mtx.compose(_ps.set(V.x, V.y, V.z), _tq, _sc.set(v.k.hw, v.k.h * 0.9, v.k.hl * 0.995));
      r.tLights.setMatrixAt(li++, _mtx);
      if (k === 'truck') {
        _v1.set(0, 1.85, 3.56).applyQuaternion(_tq);
        _mtx.compose(_ps.set(V.x + _v1.x, V.y + _v1.y, V.z + _v1.z), _tq, _sc.set(1, 1, 1));
        r.tBack.setMatrixAt(bi++, _mtx);
      }
    });
    t.im.instanceMatrix.needsUpdate = true;
  });
  r.tLights.instanceMatrix.needsUpdate = true; r.tBack.instanceMatrix.needsUpdate = true;
  // cows: graze, flick their heads, walk across
  for (let i = 0; i < r.cows.length; i++) {
    const m = r.cows[i], c = m.userData.cow;
    posAt(T, c.s, c.x, 0, V);
    m.position.set(V.x, V.y, V.z);
    const face = c.walk ? (c.walk > 0 ? -Math.PI / 2 : Math.PI / 2) : Math.sin(c.look * 0.3) * 0.6 + (c.home > 0 ? 0.4 : -0.4);
    m.rotation.set(0, -FR.h + face, c.walk ? Math.sin(c.hd * 5) * 0.03 : 0);
    m.visible = Math.abs(c.s - W.P.s) < 500;
  }
}

/* ------------------------------------------------------------ camera */
const _cp = new THREE.Vector3(), _ct = new THREE.Vector3();
function updateCamera(W, dt, a) {
  const r = R3, P = W.P, T = W.T, cam = r.camera, aspect = a.w / a.h, port = aspect < 0.9;
  const sp = clamp(P.v / 50, 0, 1.5), rm = a.reducedMotion;
  let back = (port ? 4.3 : 4.5) + sp * 1.0 + (P.nitroOn && !rm ? 0.8 : 0);
  let up = (port ? 2.25 : 1.8) + sp * 0.2;
  let side = P.x * 0.82, look = port ? 8 : 12, lookUp = port ? 0.75 : 1.15;
  let orbit = 0;
  if (P.crash > 0) { back += 3.2; up += 2.2; orbit = Math.min(1, P.crashT) * 0.6 * (P.crashDir || 1); look = 2; lookUp = 0.6; }
  if (W.phase === 'finished' || W.phase === 'busted' || W.phase === 'over') { r.orb = (r.orb || 0) + dt * 0.35; orbit = Math.sin(r.orb) * 0.9 + 0.6; back += 2; up += 1.2; look = 1; }
  else r.orb = 0;
  if (W.attract) { orbit = 0.75 + Math.sin(r.time * 0.12) * 0.35; back += 2.2; up += 0.6; look = 4; lookUp = 1.0; }
  if (W.phase === 'grid' && !W.attract) { back += W.cd * 1.6; up += W.cd * 0.7; }
  posAt(T, P.s - back * Math.cos(orbit), side + back * Math.sin(orbit) * 1.4, 0, _pp);
  // keep the camera above the ground it passes over
  const gi = rowOf(T, P.s - back);
  const gl = Math.max(0, bankH(T, gi, clamp(side + back * Math.sin(orbit) * 1.4, -20, 20)));
  _cp.set(_pp.x, _pp.y + up + gl * 0.6, _pp.z);
  posAt(T, P.s + look, P.x * 0.55, lookUp, _pp);
  _ct.set(_pp.x, _pp.y, _pp.z);
  if (!r.camInit) { r.camPos.copy(_cp); r.camTgt.copy(_ct); r.camInit = true; }
  const k = 1 - Math.exp(-dt * (rm ? 6 : 9)), kt = 1 - Math.exp(-dt * 12);
  r.camPos.lerp(_cp, k); r.camTgt.lerp(_ct, kt);
  cam.position.copy(r.camPos);
  const sx = a.shakeX || 0, sy = a.shakeY || 0;
  if (sx || sy) { frameAt(T, P.s); cam.position.x += FR.rx * sx * 0.02; cam.position.z += FR.rz * sx * 0.02; cam.position.y += sy * 0.02; }
  cam.up.set(0, 1, 0);
  cam.lookAt(r.camTgt);
  // lean-heavy: the camera rolls a little with the bike
  const roll = P.crash > 0 ? 0 : P.lean * (rm ? 0.06 : 0.22);
  r.roll = (r.roll || 0) + (roll - (r.roll || 0)) * Math.min(1, dt * 6);
  cam.rotateZ(-r.roll);
  const base = port ? 70 : clamp(2 * Math.atan(Math.tan(33 * Math.PI / 180) / Math.max(0.5, aspect / 1.6)) * 180 / Math.PI, 50, 68);
  const kick = rm ? 0 : sp * 7 + (P.nitroOn ? 7 : 0) + P.draft * 2;
  W.fov += (base + kick - (W.fov || base)) * Math.min(1, dt * 4);
  if (Math.abs(cam.fov - W.fov) > 0.01 || cam.aspect !== aspect) { cam.fov = W.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}

/* ------------------------------------------------------------ per-frame visuals */
function renderScene(W, dt, a) {
  const r = R3, T = W.T, S = r.cur, P = W.P;
  r.time += dt;
  poseWorld(W, dt);
  updateCamera(W, dt, a);
  // sun and its shadow box follow the player
  posAt(T, P.s + 6, P.x, 0, V);
  r.sun.target.position.set(V.x, V.y, V.z);
  r.sun.position.set(V.x + r.sunDir.x * 120, V.y + Math.max(25, r.sunDir.y * 120), V.z + r.sunDir.z * 120);
  r.sun.target.updateMatrixWorld(); r.sun.updateMatrixWorld();
  // darker inside tunnels
  const tk = T.TUN[rowOf(T, Math.max(0, P.s - 3))];
  if (Math.abs(tk - r.tunK) > 0.004) { r.tunK += (tk - r.tunK) * Math.min(1, dt * 5); lightLevels(); }
  // headlight at dusk
  if (T.look.night && P.crash <= 0) {
    const B = r.bikes[0];
    r.head.position.set(0, 0.95, -1.5).applyMatrix4(B.root.matrixWorld);
    r.head.target.position.set(0, -0.6, -24).applyMatrix4(B.root.matrixWorld); r.head.target.updateMatrixWorld();
    r.head.intensity = 140;
  } else r.head.intensity = 0;
  // nitro flames, exhaust, rain of spray near waterfalls
  if (FX) {
    for (let i = 0; i < W.riders.length; i++) {
      const R = W.riders[i]; if (Math.abs(R.s - P.s) > 70) continue;
      if (R.nitroOn && R.crash <= 0) {
        const B = r.bikes[i];
        for (let k = 0; k < 2; k++) {
          _v1.set(0.19, 0.66, 0.95).applyMatrix4(B.root.matrixWorld);
          FX.emit('add', _v1.x, _v1.y, _v1.z, (Math.random() - 0.5) * 1.5, Math.random() * 0.8, (Math.random() - 0.5) * 1.5, 0.22 + Math.random() * 0.12, 0.34, k ? '#5aa8ff' : '#ff9a3a', 0.9, -1, 2, -0.5);
        }
      } else if (R.thr > 0.5 && Math.random() < dt * 6 * FX.density) {
        const B = r.bikes[i];
        _v1.set(0.19, 0.6, 1.0).applyMatrix4(B.root.matrixWorld);
        FX.emit('soft', _v1.x, _v1.y, _v1.z, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, 0.9, 0.3, '#9a9590', 0.22, -0.3, 1, 3);
      }
      if (R.draft > 0.45 && R.isPlayer && Math.random() < dt * 30 * FX.density && !a.reducedMotion) {
        posAt(T, R.s + 3 + Math.random() * 4, R.x + (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.2, V);
        FX.emit('add', V.x, V.y, V.z, -FR.fx * 30, 0, -FR.fz * 30, 0.18, 0.05, '#dfe8ff', 0.5, 0, 0, 0);
      }
    }
    for (let i = 0; i < S.falls.length; i++) {
      const f = S.falls[i]; if (Math.abs(f.s - P.s) > 90) continue;
      if (Math.random() < dt * 22 * FX.density) FX.emit('soft', f.x + (Math.random() - 0.5) * 3, f.y + 0.4, f.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 1.6, 1.5, '#ffffff', 0.35, -0.2, 1, 2.2);
      if (Math.abs(f.s - P.s) < 8 && Math.random() < dt * 30 * FX.density) { posAt(T, P.s + 4, P.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 2, V); FX.emit('add', V.x, V.y, V.z, f.sd * -2, -1, 0, 0.5, 0.12, '#dff2ff', 0.6, 3, 0.5, 0); }
    }
    FX.update(dt, a.h * r.renderer.getPixelRatio() * 0.5 / Math.tan(r.camera.fov * Math.PI / 360));
  }
  if (S.fallTex) S.fallTex.offset.y += dt * 1.7;
  if (S.seaTex) S.seaTex.offset.set(r.time * 0.004, r.time * 0.003);
  if (S.flagShader) S.flagShader.uniforms.uTime.value = r.time;
  r.skyU.uTime.value = r.time;
  const cp = r.camera.position;
  r.sky.position.copy(cp);
  S.far.position.set(cp.x, S.floorY, cp.z);
  // hide what is far away
  const t = TIERS[Math.max(0, r.quality)];
  for (let i = 0; i < CULL.length; i++) {
    const c = CULL[i]; if (c.course !== T.id) continue;
    const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) - c.r;
    c.im.visible = (c.im.userData.ov ? t.ov : true) && d < (c.far ? t.cull * 2.6 : c.terrain ? t.cull * 1.15 : t.cull);
  }
  r.renderer.render(r.scene, r.camera);
}

/* ------------------------------------------------------------ HUD */
const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
const INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736', ORANGE = '#ff6940', TEAL = '#38e1ff';
function txt(ctx, s, x, y, size, color, align, weight, fam) {
  ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function plate(ctx, x, y, w, h, r) { rr(ctx, x, y, w, h, r || 10); ctx.fillStyle = 'rgba(12,10,8,0.58)'; ctx.fill(); ctx.strokeStyle = 'rgba(251,245,236,0.10)'; ctx.lineWidth = 1; ctx.stroke(); }
const _proj = new THREE.Vector3();

function mapPts(T) {
  if (T.mapPts) return T.mapPts;
  const pts = [], b = T.box, w = b.x1 - b.x0, h = b.z1 - b.z0;
  for (let i = 0; i < T.N; i += 6) pts.push([(T.PX[i] - b.x0) / Math.max(w, h), (T.PZ[i] - b.z0) / Math.max(w, h)]);
  T.mapPts = { pts, w: w / Math.max(w, h), h: h / Math.max(w, h) };
  return T.mapPts;
}
function riderColor(R) { return R.isPlayer ? ORANGE : R.paint; }

function drawHUD(ctx, a, W) {
  const P = W.P, T = W.T, pad = a.hudPad(), w = a.w, h = a.h, small = w < 560, rm = a.reducedMotion;
  const sc = small ? 0.86 : 1;
  // speed lines at pace and on nitro
  const spd = P.v / P.top;
  if (!rm && (spd > 0.82 || P.nitroOn) && P.crash <= 0 && W.phase === 'racing') {
    const k = P.nitroOn ? 1 : clamp((spd - 0.82) / 0.2, 0, 1) * 0.6, cx = w / 2, cy = h * 0.45;
    ctx.save(); ctx.strokeStyle = 'rgba(255,248,235,' + (0.18 * k) + ')'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 26; i++) {
      const an = hash(i * 7 + (a.frame >> 1)) * TAU, r0 = Math.max(w, h) * (0.32 + hash(i * 13 + (a.frame >> 2)) * 0.2), len = 40 + 90 * k;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an) * (r0 + len), cy + Math.sin(an) * (r0 + len)); ctx.stroke();
    }
    ctx.restore();
  }
  // edge glow on nitro, a blue tint when busted
  if (P.nitroOn && !rm) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); g.addColorStop(0, 'rgba(90,168,255,0)'); g.addColorStop(1, 'rgba(90,168,255,0.22)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  if (W.phase === 'busted') { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7); g.addColorStop(0, 'rgba(40,90,255,0)'); g.addColorStop(1, 'rgba(40,90,255,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  // rival name tags
  const cam = R3.camera, tags = [];
  for (let i = 1; i < W.riders.length; i++) {
    const R = W.riders[i], ds = R.s - P.s;
    if (ds < -6 || ds > 55) continue;
    posAt(T, R.s, R.x, 2.15, V); _proj.set(V.x, V.y, V.z).project(cam);
    if (_proj.z > 1 || _proj.z < -1) continue;
    const x = (_proj.x * 0.5 + 0.5) * w;
    let y = (-_proj.y * 0.5 + 0.5) * h;
    if (x < -40 || x > w + 40 || y < 50) continue;
    const al = clamp(1 - ds / 55, 0.35, 1), fs = clamp(14 - ds * 0.12, 9, 13) * sc;
    ctx.globalAlpha = al;
    const label = positionOf(W, R) + ' ' + R.name;
    ctx.font = '600 ' + fs + 'px ' + F_MONO; const tw = ctx.measureText(label).width + 14;
    // nudge labels up so they never sit on each other
    for (let k = 0; k < tags.length; k++) { const t = tags[k]; if (Math.abs(t.x - x) < (t.w + tw) / 2 + 2 && Math.abs(t.y - y) < fs * 1.8) { y = t.y - fs * 1.9; k = -1; } }
    tags.push({ x, y, w: tw });
    rr(ctx, x - tw / 2, y - fs, tw, fs * 1.75, 6); ctx.fillStyle = 'rgba(12,10,8,0.62)'; ctx.fill();
    ctx.fillStyle = R.paint; ctx.fillRect(x - tw / 2 + 4, y - fs * 0.4, 3, fs * 0.8);
    txt(ctx, label, x + 3, y - fs * 0.12, fs, R.crash > 0 ? DIM : INK, 'center', '600');
    ctx.globalAlpha = 1;
  }
  // top left: position and time
  const tt = W.cfg.mode === 'time';
  plate(ctx, pad.left, pad.top, 132 * sc, 66 * sc, 12);
  if (tt) { txt(ctx, 'TIME TRIAL', pad.left + 12, pad.top + 18 * sc, 10 * sc, GOLD, 'left', '700'); }
  else {
    const pos = positionOf(W, P);
    txt(ctx, String(pos), pad.left + 12, pad.top + 30 * sc, 34 * sc, INK, 'left', '600', F_DISP);
    ctx.font = '600 ' + 34 * sc + 'px ' + F_DISP; const pw = ctx.measureText(String(pos)).width;
    txt(ctx, ordinal(pos).replace(/^\d+/, '') + ' / ' + W.riders.length, pad.left + 14 + pw, pad.top + 24 * sc, 12 * sc, DIM, 'left', '600');
  }
  txt(ctx, fmtTime(W.phase === 'grid' ? 0 : (P.finished ? P.finT : W.t)), pad.left + 12, pad.top + 52 * sc, 13 * sc, INK, 'left', '500');
  // top right: speed and nitro
  const sw = 132 * sc, sx = w - pad.right - sw;
  plate(ctx, sx, pad.top, sw, 66 * sc, 12);
  txt(ctx, String(Math.round(P.v * KMH)), sx + sw - 44 * sc, pad.top + 24 * sc, 30 * sc, INK, 'right', '600', F_DISP);
  txt(ctx, 'km/h', sx + sw - 12 * sc, pad.top + 28 * sc, 10 * sc, DIM, 'right', '600');
  const nx = sx + 12 * sc, ny = pad.top + 50 * sc, nw = sw - 24 * sc;
  rr(ctx, nx, ny, nw, 7 * sc, 3.5 * sc); ctx.fillStyle = 'rgba(251,245,236,0.12)'; ctx.fill();
  const nf = P.nitro / 100;
  if (nf > 0) { rr(ctx, nx, ny, Math.max(7 * sc, nw * nf), 7 * sc, 3.5 * sc); const g = ctx.createLinearGradient(nx, 0, nx + nw, 0); g.addColorStop(0, '#5aa8ff'); g.addColorStop(1, P.nitroOn ? '#ffffff' : '#9fd0ff'); ctx.fillStyle = g; ctx.fill(); }
  txt(ctx, 'NITRO', nx, ny - 7 * sc, 8 * sc, P.nitro > 30 ? '#9fd0ff' : DIM, 'left', '700');
  if (P.draft > 0.4) txt(ctx, 'SLIPSTREAM', nx + nw, ny - 8 * sc, 9 * sc, '#dfe8ff', 'right', '700');
  // the course strip: everyone's progress from start to finish
  const stripW = Math.min(w - pad.left - pad.right - (132 * sc + 10) * 2, 460), stripX = (w - stripW) / 2, stripY = pad.top + 14;
  if (stripW > 90) {
    const span = T.finishS - T.startS, at = (s) => stripX + clamp((s - T.startS) / span, 0, 1) * stripW;
    rr(ctx, stripX - 8, stripY - 10, stripW + 16, 34, 10); ctx.fillStyle = 'rgba(12,10,8,0.5)'; ctx.fill();
    ctx.fillStyle = 'rgba(251,245,236,0.18)'; ctx.fillRect(stripX, stripY + 3, stripW, 3);
    // hairpins marked on the strip
    ctx.fillStyle = 'rgba(255,183,54,0.55)';
    for (let i = 0; i < T.N; i += 3) if (Math.abs(T.CV[i]) > 0.016) ctx.fillRect(at(i * SEGM) - 0.5, stripY + 1, 1.5, 7);
    for (let i = 0; i < W.patrols.length; i++) { const px = at(W.patrols[i].s); ctx.fillStyle = TEAL; ctx.beginPath(); ctx.moveTo(px, stripY - 3); ctx.lineTo(px + 4, stripY - 8); ctx.lineTo(px - 4, stripY - 8); ctx.fill(); }
    for (let i = W.riders.length - 1; i >= 0; i--) {
      const R = W.riders[i], px = at(R.s);
      ctx.beginPath(); ctx.arc(px, stripY + 4.5, R.isPlayer ? 5 : 3.3, 0, TAU); ctx.fillStyle = riderColor(R); ctx.fill();
      if (R.isPlayer) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    txt(ctx, Math.max(0, (T.finishS - P.s) / 1000).toFixed(1) + ' km to go', stripX + stripW / 2, stripY + 16, 10, DIM, 'center', '600');
    // finish flag
    ctx.fillStyle = INK; ctx.fillRect(stripX + stripW + 1, stripY - 4, 2, 12); ctx.fillRect(stripX + stripW + 3, stripY - 4, 6, 5);
  }
  // a top-down outline of the course on bigger screens
  if (w >= 700 && h >= 560) {
    const M = mapPts(T), S = 118, mx = w - pad.right - S * M.w - 10, my = h - pad.bottom - S * M.h - 90;
    plate(ctx, mx - 10, my - 10, S * M.w + 20, S * M.h + 20, 12);
    ctx.strokeStyle = 'rgba(251,245,236,0.55)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
    M.pts.forEach((p, i) => { const X = mx + p[0] * S, Y = my + p[1] * S; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.stroke();
    const dot = (s, col, r) => { const i = rowOf(T, s), b = T.box, mm = Math.max(b.x1 - b.x0, b.z1 - b.z0); ctx.beginPath(); ctx.arc(mx + (T.PX[i] - b.x0) / mm * S, my + (T.PZ[i] - b.z0) / mm * S, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); };
    dot(T.finishS, INK, 3);
    for (let i = 0; i < W.patrols.length; i++) dot(W.patrols[i].s, TEAL, 2.5);
    for (let i = W.riders.length - 1; i >= 0; i--) dot(W.riders[i].s, riderColor(W.riders[i]), W.riders[i].isPlayer ? 4.5 : 2.6);
  }
  const cy = h * 0.32;
  // countdown
  if (W.phase === 'grid' && !W.attract) {
    const n = Math.ceil(W.cd);
    if (n <= 3 && n >= 1) { const f = W.cd - Math.floor(W.cd); txt(ctx, String(n), w / 2, cy, (rm ? 86 : 86 + 40 * f) * sc, GOLD, 'center', '600', F_DISP); }
    else txt(ctx, T.def.name.toUpperCase(), w / 2, cy, 18 * sc, INK, 'center', '700');
    txt(ctx, a.touchMode ? 'Throttle is automatic' : (W.cfg.gas === 'auto' ? 'Throttle is automatic' : 'Hold Up or click to ride'), w / 2, cy + 64 * sc, 12 * sc, DIM, 'center', '600');
  }
  if (W.bannerT > 0 && W.banner) {
    const f = clamp(W.bannerT, 0, 1);
    ctx.globalAlpha = f; txt(ctx, W.banner, w / 2, cy, 64 * sc, W.banner === 'GO!' ? '#44ffa8' : GOLD, 'center', '600', F_DISP); ctx.globalAlpha = 1;
  }
  // bend warning
  if (W.phase === 'racing' && P.crash <= 0) {
    let vs = 1e9, at = 0;
    for (let k = 1; k <= 12; k++) { const v = T.VS[rowOf(T, P.s + k * 8)]; if (v < vs) { vs = v; at = k * 8; } }
    if (vs < P.v - 3 && vs < 30) {
      const on = rm || Math.floor(a.time * 4) % 2 === 0, c = T.CV[rowOf(T, P.s + at)], dir = c > 0 ? 1 : -1;
      if (on) {
        const bx = w / 2, by = cy - 70 * sc;
        ctx.fillStyle = 'rgba(255,183,54,0.92)';
        for (let i = 0; i < 3; i++) { const x = bx + dir * (i - 1) * 22 * sc; ctx.beginPath(); ctx.moveTo(x - dir * 8 * sc, by - 12 * sc); ctx.lineTo(x + dir * 6 * sc, by); ctx.lineTo(x - dir * 8 * sc, by + 12 * sc); ctx.lineTo(x - dir * 2 * sc, by); ctx.closePath(); ctx.fill(); }
        txt(ctx, Math.abs(c) > 0.018 ? 'HAIRPIN, BRAKE' : 'SHARP BEND', bx, by + 26 * sc, 11 * sc, GOLD, 'center', '700');
      }
    }
  }
  // patrol nearby
  if (W.phase === 'racing') {
    let near = 1e9;
    for (let i = 0; i < W.patrols.length; i++) { const d = W.patrols[i].s - P.s; if (d > -40 && d < 160) near = Math.min(near, Math.abs(d)); }
    if (near < 1e9) {
      const on = rm || Math.floor(a.time * 3) % 2 === 0;
      const bw = 210 * sc, bx = (w - bw) / 2, by = pad.top + 56;
      plate(ctx, bx, by, bw, 30 * sc, 8);
      ctx.fillStyle = on ? '#2a6bff' : '#ff2a2a'; ctx.beginPath(); ctx.arc(bx + 16 * sc, by + 15 * sc, 5 * sc, 0, TAU); ctx.fill();
      txt(ctx, 'PATROL ' + Math.round(near) + ' m, RIDE CLEAN', bx + 28 * sc, by + 15 * sc, 11 * sc, '#cfe0ff', 'left', '700');
    }
  }
  // shove prompts
  if (W.phase === 'racing' && P.crash <= 0) {
    const gp = a.gamepad && !a.touchMode, gest = a.touchMode && a.touchStyle !== 'pads';
    [-1, 1].forEach((sd) => {
      const o = inRange(W, P, sd);
      if (!o) return;
      const label = sd < 0 ? 'SHOVE ' + o.name.split(' ')[0].toUpperCase() : 'SHOVE ' + o.name.split(' ')[0].toUpperCase();
      const key = gest ? (sd < 0 ? 'swipe left' : 'swipe right') : a.touchMode ? (sd < 0 ? 'Shove L' : 'Shove R') : gp ? (sd < 0 ? 'X' : 'B') : (sd < 0 ? 'Z' : 'X');
      const bw = 150 * sc, bh = 44 * sc, by = h - pad.bottom - bh - (a.touchMode && !gest ? 10 : 18), bx = sd < 0 ? pad.left + 4 : w - pad.right - bw - 4;
      const pulse = rm ? 1 : 0.8 + 0.2 * Math.sin(a.time * 10);
      rr(ctx, bx, by, bw, bh, 12); ctx.fillStyle = 'rgba(255,105,64,' + (0.78 * pulse) + ')'; ctx.fill();
      txt(ctx, (sd < 0 ? '◀ ' : '') + label + (sd > 0 ? ' ▶' : ''), bx + bw / 2, by + 16 * sc, 11 * sc, '#fff7ee', 'center', '700');
      txt(ctx, key, bx + bw / 2, by + 32 * sc, 10 * sc, '#ffe3d6', 'center', '600');
    });
  }
  // wipeout: a remount ring
  if (P.crash > 0 && W.phase === 'racing') {
    const f = clamp(P.crashT / P.crashDur, 0, 1), x = w / 2, y = h * 0.6;
    ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fillStyle = 'rgba(12,10,8,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.strokeStyle = '#44ffa8'; ctx.lineWidth = 4; ctx.stroke();
    txt(ctx, a.touchMode ? 'Tap to remount faster' : 'Press Up or Space to remount faster', x, y + 46, 11 * sc, INK, 'center', '600');
  }
  // pops
  for (let i = 0; i < W.pops.length; i++) {
    const p = W.pops[i], k = p.t / 1.6, al = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
    const y = h * 0.42 - (W.pops.length - 1 - i) * 44 * sc - (rm ? 0 : k * 24);
    ctx.globalAlpha = clamp(al, 0, 1);
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 8;
    txt(ctx, p.text, w / 2, y, (p.big ? 30 : 22) * sc, p.col, 'center', '600', F_DISP);
    if (p.sub) txt(ctx, p.sub, w / 2, y + 20 * sc, 11 * sc, INK, 'center', '600');
    ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.globalAlpha = 1;
  }
  // a reminder of the touch gestures for the first seconds
  if (a.touchMode && a.touchStyle !== 'pads' && W.phase === 'racing' && W.t < 7 && !W.attract) {
    const al = W.t > 5.5 ? (7 - W.t) / 1.5 : 1;
    ctx.globalAlpha = clamp(al, 0, 1);
    const lines = a.touchStyle === 'tilt' ? ['Tilt to steer', 'Swipe left or right to shove, up for nitro'] : ['Drag to steer', 'Swipe left or right to shove, up for nitro'];
    const y = h * 0.66;
    plate(ctx, w / 2 - 150, y - 22, 300, 52, 12);
    txt(ctx, lines[0], w / 2, y - 6, 13, INK, 'center', '700');
    txt(ctx, lines[1], w / 2, y + 14, 11, DIM, 'center', '600');
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------ menu, garage and glue */
const MENU_CSS =
  '.gr-prev{display:grid;grid-template-columns:150px 1fr;gap:14px;align-items:center;margin:2px 0 12px;padding:10px;border:1px solid var(--rule-strong);border-radius:12px;background:var(--bg-deep)}' +
  '.arc-stage .gr-prev canvas{position:static;inset:auto;width:150px;height:96px;display:block;border-radius:8px;background:var(--bg)}' +
  '.gr-stat{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:center;font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.gr-stat .gr-name{grid-column:1/-1;font-family:var(--font-display);font-size:20px;letter-spacing:0;text-transform:none;color:var(--ink);line-height:1.1}' +
  '.gr-bar{height:6px;border-radius:3px;background:var(--rule);position:relative;overflow:hidden}.gr-bar i{position:absolute;inset:0 auto 0 0;background:var(--accent-warm);border-radius:3px}' +
  '.gr-blurb{grid-column:1/-1;font-family:var(--font-body);font-size:13px;letter-spacing:0;text-transform:none;color:var(--ink-dim);line-height:1.35}' +
  '.gr-wallet{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;font-family:var(--font-mono);font-size:12px;color:var(--ink-dim)}' +
  '.gr-wallet b{color:var(--accent-warm);font-size:15px;font-weight:500}' +
  '.gr-buy{min-height:36px;padding:0 12px;border-radius:9px;border:1px solid var(--rule-strong);background:var(--primary-soft);color:var(--ink);cursor:pointer;font-family:var(--font-mono);font-size:12px}' +
  '.gr-buy[disabled]{opacity:.45;cursor:default}' +
  '.gr-courses{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 12px;margin:0 0 12px;font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.gr-courses b{display:block;font-size:13px;color:var(--ink);font-weight:500;letter-spacing:0;text-transform:none}.gr-courses span.lock b{color:var(--ink-mute)}' +
  '.gr-res{width:100%;border-collapse:collapse;margin:4px 0 12px;font-size:14px}.gr-res td{padding:6px 8px;border-bottom:1px solid var(--rule);color:var(--ink-dim)}' +
  '.gr-res tr.me td{background:var(--primary-soft);color:var(--ink)}.gr-res td:first-child{font-family:var(--font-mono);color:var(--accent);width:30px}' +
  '.gr-res small{display:block;font-size:11px;color:var(--ink-mute)}.gr-res td:last-child{text-align:right;font-family:var(--font-mono)}' +
  '.gr-line{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 10px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}.gr-line b{display:block;font-size:16px;color:var(--ink);font-weight:500}' +
  '.gr-cash{font-size:14px;color:var(--ink-dim)}.gr-cash b{color:var(--accent-warm)}' +
  '.arc-card:has(.gr-prev){padding-bottom:0}.arc-card:has(.gr-prev) .arc-actions{position:sticky;bottom:0;background:var(--bg-elev);padding:12px 0 clamp(14px,3vw,22px);margin-top:8px;box-shadow:0 -14px 14px var(--bg-elev);z-index:2}' +
  '.arc-card:has(.gr-prev) p{font-size:14px;margin-bottom:10px}.arc-card:has(.gr-prev) h2{margin:4px 0 8px}' +
  '@media (pointer:fine){.arc-card:has(.gr-prev) .arc-seg button{min-height:34px;padding:0 12px;font-size:13px}.arc-card:has(.gr-prev) .arc-opts{gap:7px;margin-bottom:6px}}' +
  '@media (max-width:420px){.gr-prev{grid-template-columns:118px 1fr;gap:10px}.arc-stage .gr-prev canvas{width:118px;height:76px}.gr-courses{grid-template-columns:1fr 1fr 1fr;font-size:10px}}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }

// A side view of the chosen bike against the chosen course's sky, for the menu card.
function drawPreview(cv) {
  const g = cv.getContext('2d'), ch = ARC.choices, L = LOOK[ch.course] || LOOK.misty, b = BIKES[ch.bike] || BIKES.scout, W = cv.width, H = cv.height;
  const hz = H * 0.62, sg = g.createLinearGradient(0, 0, 0, hz);
  sg.addColorStop(0, L.skyTop); sg.addColorStop(0.6, L.skyMid); sg.addColorStop(1, L.skyHor);
  g.fillStyle = sg; g.fillRect(0, 0, W, hz + 1);
  const sx = W * (0.5 + Math.sin(L.sunAz) * 0.35), sy = hz * (1 - L.sunEl * 1.6) - 6;
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 50); sun.addColorStop(0, 'rgba(255,240,210,.95)'); sun.addColorStop(0.2, 'rgba(255,220,170,.5)'); sun.addColorStop(1, 'rgba(255,220,170,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, hz);
  g.fillStyle = 'rgba(40,52,70,.55)'; g.beginPath(); g.moveTo(0, hz); for (let x = 0; x <= W; x += 12) g.lineTo(x, hz - 18 - Math.sin(x * 0.03) * 12 - Math.sin(x * 0.11) * 6); g.lineTo(W, hz); g.fill();
  g.fillStyle = L.grass2; g.fillRect(0, hz, W, H - hz);
  g.fillStyle = '#4e4d52'; g.fillRect(0, hz + 10, W, H - hz - 10);
  g.fillStyle = 'rgba(238,236,226,.8)'; for (let i = 0; i < 5; i++) g.fillRect(10 + i * W / 4.5, hz + (H - hz) * 0.72, W / 10, 2);
  const s = W / 3.1, ox = W * 0.5, gy = H * 0.9, X = (z) => ox + z * s, Y = (y) => gy - y * s;
  g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(ox, gy + 1, s * 0.8, 4, 0, 0, TAU); g.fill();
  [-0.71, 0.71].forEach((z) => { g.beginPath(); g.arc(X(z), Y(0.32), 0.32 * s, 0, TAU); g.fillStyle = '#121214'; g.fill(); g.beginPath(); g.arc(X(z), Y(0.32), 0.2 * s, 0, TAU); g.fillStyle = '#9aa0a8'; g.fill(); g.beginPath(); g.arc(X(z), Y(0.32), 0.06 * s, 0, TAU); g.fillStyle = '#444'; g.fill(); });
  g.strokeStyle = '#2a2b30'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(-0.71), Y(0.32)); g.lineTo(X(-0.52), Y(0.98)); g.moveTo(X(0.71), Y(0.32)); g.lineTo(X(0.28), Y(0.48)); g.stroke();
  g.fillStyle = '#8a8e96'; g.fillRect(X(-0.25), Y(0.62), 0.42 * s, 0.32 * s);
  g.fillStyle = b.paint;
  g.beginPath(); g.ellipse(X(-0.18), Y(0.96), 0.32 * s, 0.13 * s, 0, 0, TAU); g.fill();
  if (b.id === 'phantom') { g.beginPath(); g.moveTo(X(-0.9), Y(0.82)); g.lineTo(X(-0.5), Y(1.16)); g.lineTo(X(-0.1), Y(0.66)); g.lineTo(X(-0.4), Y(0.42)); g.closePath(); g.fill(); g.beginPath(); g.moveTo(X(0.3), Y(0.92)); g.lineTo(X(0.92), Y(1.12)); g.lineTo(X(0.4), Y(0.8)); g.fill(); }
  else { g.fillRect(X(0.35), Y(0.96), 0.4 * s, 0.08 * s); }
  g.fillStyle = b.trim; g.fillRect(X(-0.32), Y(1.0), 0.28 * s, 0.03 * s);
  g.fillStyle = '#26201c'; g.fillRect(X(0.0), Y(0.93), 0.42 * s, 0.07 * s);
  // rider
  const P2 = POSE[KIND_POSE[b.id]];
  g.strokeStyle = '#23262d'; g.lineWidth = 0.17 * s; g.lineCap = 'round';
  g.beginPath(); g.moveTo(X(P2.pelvis[2]), Y(P2.pelvis[1])); g.lineTo(X(P2.knee[2]), Y(P2.knee[1])); g.lineTo(X(P2.peg[2]), Y(P2.peg[1] + 0.06)); g.stroke();
  g.strokeStyle = PLAYER_LOOK.jacket; g.lineWidth = 0.3 * s;
  g.beginPath(); g.moveTo(X(P2.pelvis[2]), Y(P2.pelvis[1])); g.lineTo(X(P2.sh[2]), Y(P2.sh[1])); g.stroke();
  g.lineWidth = 0.12 * s; g.beginPath(); g.moveTo(X(P2.sh[2]), Y(P2.sh[1])); g.lineTo(X(P2.grip[2]), Y(P2.grip[1])); g.stroke();
  g.fillStyle = PLAYER_LOOK.helmet; g.beginPath(); g.arc(X(P2.head[2]), Y(P2.head[1]), 0.16 * s, 0, TAU); g.fill();
  g.fillStyle = '#121620'; g.beginPath(); g.arc(X(P2.head[2]) - 0.05 * s, Y(P2.head[1]), 0.1 * s, Math.PI * 0.6, Math.PI * 1.4); g.fill();
  g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(X(-0.86), Y(0.95), 0.05 * s, 0, TAU); g.fill();
}
function refreshPreview() {
  const card = document.querySelector('.arc-card'); if (!card) return;
  const cv = card.querySelector('.gr-cv'), st = card.querySelector('.gr-stat'); if (!cv || !st) return;
  const b = BIKES[ARC.choices.bike] || BIKES.scout;
  try { drawPreview(cv); } catch (e) { /* the menu must always open */ }
  const bar = (l, v) => '<span>' + l + '</span><div class="gr-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div>';
  const own = SAVE.owned.indexOf(b.id) >= 0;
  st.innerHTML = '<div class="gr-name">' + ARC.esc(b.name) + (own ? '' : ' <small style="font-size:12px;color:var(--accent-warm)">' + money(b.price) + '</small>') + '</div>' + bar('Speed', b.spd) + bar('Handling', b.hdl) + bar('Strength', b.str) + '<div class="gr-blurb">' + ARC.esc(b.blurb) + '</div>';
}
function menuProps() {
  const courses = COURSES.map((c, i) => {
    const lock = i >= SAVE.unlocked, best = SAVE.best[c.id];
    return '<span class="' + (lock ? 'lock' : '') + '">' + ARC.esc(c.name) + '<b>' + (lock ? 'Locked' : best && best.time ? fmtTime(best.time) + (best.place ? ' · ' + ordinal(best.place) : '') : 'No time yet') + '</b></span>';
  }).join('');
  const buys = BIKE_ORDER.filter((id) => SAVE.owned.indexOf(id) < 0).map((id) => '<button type="button" class="gr-buy" data-buy="' + id + '"' + (SAVE.cash < BIKES[id].price ? ' disabled' : '') + '>Buy ' + BIKES[id].name + ' ' + money(BIKES[id].price) + '</button>').join('');
  return {
    eyebrow: 'Mountain road racing', title: 'Ghat <em>Riders</em>', noBest: true,
    html: '<div class="gr-prev"><canvas class="gr-cv" width="300" height="192"></canvas><div class="gr-stat"></div></div>' +
      '<p>Race seven rivals down winding mountain highways. Barge riders alongside with a shoulder shove, weave through trucks and buses, and brake for the hairpins. Place in the top three to unlock the next course.</p>' +
      '<div class="gr-wallet">Wallet <b>' + money(SAVE.cash) + '</b>' + buys + '</div>' +
      '<div class="gr-courses">' + courses + '</div>',
    options: [
      { id: 'mode', label: 'Mode', value: 'career', choices: [{ v: 'career', label: 'Career' }, { v: 'quick', label: 'Quick race' }, { v: 'time', label: 'Time trial' }] },
      { id: 'course', label: 'Course', value: 'misty', choices: COURSES.map((c, i) => ({ v: c.id, label: c.name + (i >= SAVE.unlocked ? ' (locked in Career)' : '') })) },
      { id: 'bike', label: 'Bike', value: 'scout', choices: BIKE_ORDER.map((id) => ({ v: id, label: BIKES[id].name + (SAVE.owned.indexOf(id) < 0 ? ' (' + money(BIKES[id].price) + ')' : '') })) },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      { id: 'gas', label: 'Throttle', value: ARC.touchMode ? 'auto' : 'manual', choices: [{ v: 'auto', label: 'Automatic' }, { v: 'manual', label: 'Hold to ride' }], note: 'On touch screens the throttle is always automatic.' }
    ]
  };
}
function stopAll() { engineStop(); }

function debugState() {
  const W = Wd, a = ARC;
  if (!W) return { phase: 'none', state: a.state };
  const P = W.P, st = P.stats;
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, mode: W.cfg.mode, course: W.T.id, diff: W.cfg.diff, bike: W.cfg.bike, renderer: '3d',
    position: positionOf(W, P), riders: W.riders.length, speed: Math.round(P.v * KMH), distance: Math.round(Math.max(0, P.s - W.T.startS)), progress: +clamp((P.s - W.T.startS) / (W.T.finishS - W.T.startS), 0, 1).toFixed(3),
    x: +P.x.toFixed(2), lean: +P.lean.toFixed(2), steer: +(P.steerIn || 0).toFixed(2), nitro: Math.round(P.nitro), nitroOn: P.nitroOn, draft: +P.draft.toFixed(2),
    shoves: st.shoves, knockoffs: st.knocks, shovesTaken: st.taken, crashes: st.crashes, passes: st.passes, closeCalls: st.near, crashed: P.crash > 0,
    time: +W.t.toFixed(2), countdown: +Math.max(0, W.cd).toFixed(2), busted: W.busted, alive: !W.busted, finished: P.finished, results: W.results,
    cash: SAVE.cash, unlocked: SAVE.unlocked, owned: SAVE.owned.slice(), patrols: W.patrols.length, traffic: W.traffic.length,
    rivals: W.riders.slice(1).map((r) => ({ name: r.name, s: Math.round(r.s), x: +r.x.toFixed(1), crash: r.crash > 0, pos: positionOf(W, r) })),
    gfx: R3 ? { quality: R3.quality, fps: Math.round(R3.fps), cpuMs: +(R3.cpu || 0).toFixed(1), touchStyle: a.touchStyle, soft: R3.soft, calls: R3.renderer.info.render.calls, tris: R3.renderer.info.render.triangles } : null
  };
}
const dev = {
  world: () => Wd,
  bot: (on) => { if (Wd) Wd.P.bot = on !== false; },
  ff: (sec) => { const n = Math.round(sec * 50); for (let i = 0; i < n && Wd && ARC.state === 'play' && !Wd.over; i++) stepWorld(Wd, 0.02); },
  teleport: (s) => { if (Wd) Wd.P.s = s; },
  quality: (q) => { if (R3) R3.lockQ = true; setQuality(q); },
  cash: (n) => { SAVE.cash = n; saveGame(); },
  unlock: (n) => { SAVE.unlocked = clamp(n, 1, 3); saveGame(); },
  shove: (sd) => { if (Wd) Wd.queuedShove = sd; }
};
function measureFps(dt) {
  const r = R3;
  r.qWarm = r.qWarm || 0;
  if (r.qWarm < 4) { r.qWarm++; return; }
  r.qT += dt; r.qN++;
  if (r.qT >= 1.2) {
    r.fps = r.qN / r.qT; r.qT = 0; r.qN = 0;
    if (!r.lockQ && r.fps < 40 && r.quality > 0) { setQuality(r.fps < 16 ? Math.max(0, r.quality - 2) : r.quality - 1); r.qWarm = 2; }
  }
}
function showNo3D(a) {
  a.panel({ eyebrow: 'Ghat Riders', title: '3D graphics <em>unavailable</em>', html: '<p>This browser could not start WebGL, which this game needs. Try another browser or turn on hardware acceleration.</p>', actions: [{ label: 'All games', href: '/games', primary: true }] });
}

Arcade.create({
  three: true,
  slug: 'ghat-riders', title: 'Ghat Riders', genre: 'Mountain road racing',
  graphics(level) { if (!R3) return; if (level === 'auto') { R3.lockQ = false; return; } R3.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  hint: 'Arrows or WASD to ride. Z / X to shove left or right, Space shoves the nearest rider. Shift or N for nitro.',
  touchHint: 'Stick steers. Shove L and Shove R barge, Nitro boosts, Brake slows.',
  keys: [['Left Right / A D', 'Steer'], ['Up / W', 'Throttle'], ['Down / S', 'Brake'], ['Z or J', 'Shove left'], ['X or K', 'Shove right'], ['Space', 'Shove the nearest rider'], ['Shift / N', 'Nitro']],
  gameKeys: ['ShiftLeft', 'ShiftRight'],
  mouse: { steer: false, cursor: 'crosshair', keys: [['Move mouse', 'Steer toward the pointer'], ['Click / hold', 'Throttle']] },
  // Controller: RT throttle, LT brake, X shove left, B shove right, A nitro, Y shoves the nearest rider.
  gamepad: { buttons: ['KeyN', 'KeyZ', 'KeyX', 'Space'], rt: 'ArrowUp', lt: 'ArrowDown' },
  touch: { stick: true, pads: [{ label: 'Shove L', key: 'KeyZ', hot: true }, { label: 'Shove R', key: 'KeyX', hot: true }, { label: 'Nitro', key: 'KeyN' }, { label: 'Brake', key: 'ArrowDown' }] },
  touchKeys: [['On-screen stick', 'Steer'], ['Shove L / Shove R', 'Barge a rider'], ['Nitro', 'Boost'], ['Brake', 'Slow down'], ['Throttle', 'Always on']],
  gestures: {
    drag: 'x', tilt: true,
    hint: 'Drag to steer. Swipe left or right to shove, up for nitro. Hold a downward drag to brake.',
    keys: [['Drag left or right', 'Steer'], ['Swipe left / right', 'Shove that way'], ['Tap', 'Shove the nearest rider'], ['Swipe up', 'Nitro'], ['Hold a downward drag', 'Brake'], ['Throttle', 'Always on']]
  },
  formatScore: (v) => Math.round(v).toLocaleString('en-IN') + ' pts',
  resize: (a) => resize3D(a),
  init(a) {
    ARC = a;
    loadSave();
    if (!setup3D(a)) { NO3D = true; showNo3D(a); return; }
    setQuality(R3.soft ? 0 : a.device === 'desktop' ? 3 : 2); resize3D(a);
    const origMenu = a.menu;
    a.menu = function (p) { stopAll(); return origMenu(Object.assign(menuProps(), p || {})); };
    a.debug = debugState;
    a.dev = dev;
    a.menu();
  },
  onMenu(a) {
    if (NO3D) return;
    injectCss(); stopAll();
    const card = document.querySelector('.arc-card'); if (!card) return;
    refreshPreview();
    card.querySelectorAll('.arc-seg').forEach((seg) => seg.addEventListener('click', () => setTimeout(refreshPreview, 0)));
    card.querySelectorAll('.gr-buy').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-buy'), b = BIKES[id];
      if (!b || SAVE.owned.indexOf(id) >= 0) return;
      if (SAVE.cash < b.price) { a.toast('Not enough prize money', money(b.price - SAVE.cash) + ' to go', 1400); return; }
      SAVE.cash -= b.price; SAVE.owned.push(id); saveGame();
      a.choices.bike = id; a.store.set('arcade.ghat-riders.bike', id);
      a.sfx.tone(660, 0.1, { type: 'triangle', vol: 0.12 }); a.sfx.tone(990, 0.16, { type: 'triangle', vol: 0.12, delay: 0.1 });
      a.toast(b.name + ' is yours', 'Ride it today', 1500);
      a.menu();
    }));
  },
  start(a, ch) {
    if (NO3D) return;
    let course = ch.course, bike = ch.bike;
    const mode = ch.mode || 'career';
    if (mode === 'career' && COURSE_IDX[course] >= SAVE.unlocked) { course = COURSES[SAVE.unlocked - 1].id; a.toast('That course is locked', 'Racing ' + COURSES[SAVE.unlocked - 1].name, 1800); }
    if (SAVE.owned.indexOf(bike) < 0) { bike = 'scout'; a.toast('You do not own that bike yet', 'Riding the Scout', 1800); }
    Wd = newWorld({ course, mode, bike, diff: ch.diff || 'normal', gas: a.touchMode ? 'auto' : (ch.gas || 'manual'), attract: false });
    engineStart();
    if (R3) R3.worldRef = null;
  },
  update(dt, a) {
    if (!Wd || NO3D) return;
    const W = Wd, P = W.P, inp = a.input, gest = a.touchMode && a.touchStyle !== 'pads';
    const sw = inp.swipe(), tap = inp.tap();
    if (W.phase === 'racing' && !W.attract) {
      if (P.crash > 0) {
        // remount faster
        if (tap || sw || inp.hit('ArrowUp', 'KeyW', 'Space')) P.crashT = Math.min(P.crashDur * 0.8, P.crashT + 0.3);
      } else {
        if (sw && gest) {
          if (sw.dir === 'left') W.queuedShove = -1;
          else if (sw.dir === 'right') W.queuedShove = 1;
          else if (sw.dir === 'up') { if (P.nitro > 5) { P.nLatch = 1.2 + 0.9 * sw.power; a.sfx.tone(520, 0.08, { type: 'triangle', vol: 0.1 }); } else a.toast('Nitro empty', 'Shove, pass and slipstream to fill it', 1000); }
          else if (sw.dir === 'down') P.brLatch = 0.45 + 0.4 * sw.power;
        }
        if (tap && a.touchMode) { const sd = nearestSide(W, P); if (sd) W.queuedShove = sd; }
      }
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(W, dt / n);
  },
  idle(dt, a) {
    if (NO3D || a.state !== 'menu') return;
    const c = a.choices, key = c.course + '|' + c.bike;
    if (!Wd || !Wd.attract || Wd.attractKey !== key) {
      Wd = newWorld({ course: c.course || 'misty', mode: 'quick', bike: BIKES[c.bike] ? c.bike : 'scout', diff: 'normal', gas: 'auto', attract: true }); Wd.attractKey = key;
      Wd.P.s = 260; Wd.riders.forEach((r, i) => { if (i) r.s = 250 + i * 7; });
      Wd.traffic.forEach((v, i) => spawnTraffic(Wd, v, 480 + i * 140, false));
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(Wd, dt / n);
  },
  render(ctx, a) {
    if (NO3D || !R3) return;
    const W = Wd;
    const now = performance.now(), dtRaw = R3.lastNow ? (now - R3.lastNow) / 1000 : 1 / 60, dtReal = clamp(dtRaw, 0.001, 0.1); R3.lastNow = now;
    if (!W) { ctx.fillStyle = '#060503'; ctx.fillRect(0, 0, a.w, a.h); return; }
    if (R3.lost || R3.renderer.getContext().isContextLost()) {
      ctx.fillStyle = 'rgba(6,5,3,.85)'; ctx.fillRect(0, 0, a.w, a.h);
      txt(ctx, 'Graphics paused. Restoring...', a.w / 2, a.h / 2, 16, INK, 'center', '600'); return;
    }
    measureFps(dtRaw);
    if (R3.worldRef !== W) { activateWorld(W); R3.qWarm = 0; }
    const slow = W.slowT > 0 && !a.reducedMotion ? 0.35 : 1;
    const c0 = performance.now();
    renderScene(W, a.state === 'pause' ? 0 : dtReal * slow, a);
    if (a.state !== 'menu') drawHUD(ctx, a, W);
    R3.cpu = (R3.cpu || 0) * 0.9 + (performance.now() - c0) * 0.1;
  },
  onPause() { engineStop(); },
  onResume() { if (Wd && !Wd.attract && !Wd.over) engineStart(); },
  onOver() { engineStop(); }
});
