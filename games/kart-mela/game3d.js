import * as THREE from '/games/vendor/three/three.module.min.js';
/*
 * Kart Mela, a cartoon kart racing festival.
 *
 * Eight original racers, three laps, three circuits: a fairground at night,
 * a monsoon hill station and a spice market rooftop run at sunset. Drift for
 * a mini-turbo, grab item boxes, and race a Grand Prix for the podium.
 *
 * The rules run on a flat model: every kart has a position (x, z) on the
 * ground, a height y, a heading and a forward and sideways speed. The track
 * is a closed centre line sampled every two metres; a kart's progress round
 * the lap is found by projecting it onto that line.
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
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
const nowMs = () => (window.performance ? performance.now() : Date.now());

/* ------------------------------------------------------------ the racers */
const LAPS = 3;
const KMH = 3.6;
// spd, acc, hnd, wt: 0..1. kind picks the head and body model.
const CHARS = [
  { id: 'chotu', name: 'Chotu Chakra', kind: 'kid', spd: 0.72, acc: 0.95, hnd: 0.9, wt: 0.3, kart: '#ff6a1a', trim: '#ffd23f', skin: '#c98e62', hair: '#2a1b12', shirt: '#2f6fd8', hat: '#e8452c', blurb: 'A quick-handed kid in a backwards cap. Gets off the line like a firecracker.' },
  { id: 'rani', name: 'Rani Rocket', kind: 'girl', spd: 0.86, acc: 0.78, hnd: 0.86, wt: 0.42, kart: '#ff4f9a', trim: '#ffffff', skin: '#b97a52', hair: '#1c1110', shirt: '#ffcf33', hat: '#38e1ff', blurb: 'Twin braids, flying goggles and no brakes. Fast and tidy through the bends.' },
  { id: 'bholu', name: 'Bholu Bhalu', kind: 'bear', spd: 0.94, acc: 0.58, hnd: 0.62, wt: 0.95, kart: '#c2272d', trim: '#f2c230', skin: '#7a4b2a', hair: '#5c3720', shirt: '#2b8a4b', hat: '#2b8a4b', blurb: 'A big friendly bear. Slow to get going, unstoppable once rolling.' },
  { id: 'tikki', name: 'Tikki Tota', kind: 'parrot', spd: 0.74, acc: 0.9, hnd: 1.0, wt: 0.22, kart: '#2fbf4a', trim: '#ff7a1a', skin: '#2fbf4a', hair: '#e8452c', shirt: '#2fbf4a', hat: '#ffd23f', blurb: 'A chatty parrot who corners like a dart. Light as a feather in a bump.' },
  { id: 'dada', name: 'Dada Dhamaka', kind: 'grandpa', spd: 0.9, acc: 0.66, hnd: 0.72, wt: 0.8, kart: '#f2c230', trim: '#1d2440', skin: '#d9a07a', hair: '#f4f1ea', shirt: '#8a5a3a', hat: '#5b6670', blurb: 'A grandpa with a legendary moustache. Has been racing since before karts.' },
  { id: 'meenu', name: 'Meenu Mausi', kind: 'auntie', spd: 0.84, acc: 0.76, hnd: 0.8, wt: 0.6, kart: '#8a4fe0', trim: '#ffd23f', skin: '#c8875c', hair: '#221512', shirt: '#e94f8a', hat: '#ffd23f', blurb: 'Big sunglasses, bigger attitude. Knows every shortcut in town.' },
  { id: 'gappu', name: 'Gappu Gajju', kind: 'elephant', spd: 1.0, acc: 0.52, hnd: 0.55, wt: 1.0, kart: '#2d7fd1', trim: '#ff6a1a', skin: '#8f97a3', hair: '#8f97a3', shirt: '#ff6a1a', hat: '#ffd23f', blurb: 'A baby elephant with a heavy right foot. The top speed king of the mela.' },
  { id: 'zippy', name: 'Zippy Billi', kind: 'cat', spd: 0.8, acc: 0.86, hnd: 0.94, wt: 0.34, kart: '#19b3a6', trim: '#ffffff', skin: '#f0a64b', hair: '#f0a64b', shirt: '#1d2440', hat: '#e94f8a', blurb: 'A nimble cat who always lands on four wheels. Loves a long drift.' }
];
const CHAR_IDX = {}; CHARS.forEach((c, i) => { CHAR_IDX[c.id] = i; });
const kartTop = (c) => 24.5 + 4.2 * c.spd;
const kartAcc = (c) => 8.5 + 7 * c.acc;
const kartTurn = (c) => 1.75 + 0.75 * c.hnd;

const DIFF = {
  easy: { name: 'Easy', cc: '50cc', speed: 0.86, ai: 0.85, ahead: -0.12, behind: 0.05, mul: 0.6, drift: 0.35, short: 0.1 },
  normal: { name: 'Normal', cc: '100cc', speed: 1.0, ai: 0.94, ahead: -0.06, behind: 0.09, mul: 1, drift: 0.65, short: 0.35 },
  hard: { name: 'Hard', cc: '150cc', speed: 1.12, ai: 1.0, ahead: -0.025, behind: 0.13, mul: 1.5, drift: 0.9, short: 0.7 }
};
const PTS = [15, 12, 10, 8, 6, 4, 2, 1];

/* ------------------------------------------------------------ the circuits */
// pts: [x, z, y] control points of a closed Catmull-Rom loop. Positions along the
// lap are written as a spline parameter p (point index plus the fraction to the next).
const TRACKS = [
  {
    id: 'fair', name: 'Mela Lights', place: 'Fairground at night', short: 'Fairground', hw: 7, scale: 0.85, start: 0.45, wall: 6.5, off: 0.55, voidOff: false,
    blurb: 'A night at the fair: string lights, a giant wheel, a jump over the fountain and a dirt shortcut through the big tent.',
    pts: [[0, -40, 0], [0, 40, 0], [12, 72, 0], [45, 88, 0], [80, 80, 0], [96, 55, 0], [86, 28, 0], [64, 18, 0], [56, -4, 0], [72, -26, 0], [110, -30, 0.4], [140, -14, 0.4], [160, 16, 0], [178, 40, 0], [200, 40, 0], [214, 10, 0], [208, -40, 0], [180, -80, 1.2], [130, -100, 1.6], [60, -100, 1.2], [16, -82, 0.4]],
    sc: { from: 6, to: 12, via: [[100, 10, 0], [130, 8, 0]], hw: 4.2, mult: 0.72 },
    boxes: [2.3, 8.6, 15.2], pads: [[13.6, 0], [19.4, -0.3], [6.25, 0, 1]], ramps: [{ p: 10.42, len: 7, gap: [10.5, 10.68] }],
    haz: [{ k: 'ball', p: 17.4 }, { k: 'ball', p: 4.4 }],
    music: { bpm: 118, root: 50, scale: [0, 2, 4, 5, 7, 9, 10], bass: [0, 0, 7, 0, 5, 0, 7, 4], lead: [7, 9, 11, 9, 7, 4, 5, 4, 2, 4, 7, 9, 7, 4, 2, 0] }
  },
  {
    id: 'hill', name: 'Monsoon Hills', place: 'Hill station in the rain', short: 'Hill station', hw: 6.5, scale: 1, start: 0.5, wall: 5, off: 0.5, voidOff: false,
    blurb: 'Rain on the ghats: puddles that spray, a crest jump, and a slippery ledge behind the waterfall.',
    pts: [[0, -30, 0], [0, 50, 0], [-10, 80, 2], [-40, 95, 5], [-70, 80, 7], [-80, 50, 7], [-60, 20, 5], [-70, -10, 6], [-100, -25, 9], [-120, -55, 11], [-105, -90, 12], [-60, -100, 11], [-40, -80, 7], [-20, -110, 11], [20, -120, 10], [50, -95, 7], [40, -65, 4], [15, -55, 2]],
    sc: { from: 11, to: 13, via: [[-42, -113, 11.2]], hw: 3.6, mult: 0.8 },
    boxes: [1.0, 6.6, 13.7], pads: [[15.6, 0], [3.4, 0.25]], ramps: [{ p: 9.3, len: 6 }],
    haz: [{ k: 'puddle', p: 1.6, lat: -0.35 }, { k: 'puddle', p: 1.85, lat: 0.4 }, { k: 'puddle', p: 5.5, lat: 0 }, { k: 'puddle', p: 7.6, lat: -0.25 }, { k: 'puddle', p: 14.5, lat: 0.3 }, { k: 'puddle', p: 16.6, lat: -0.3 }],
    music: { bpm: 112, root: 48, scale: [0, 2, 3, 5, 7, 9, 10], bass: [0, 0, 3, 0, 5, 0, 3, 7], lead: [7, 5, 3, 5, 7, 10, 9, 7, 5, 3, 2, 3, 5, 3, 2, 0] }
  },
  {
    id: 'roof', name: 'Spice Rooftops', place: 'Market rooftops at sunset', short: 'Rooftops', hw: 6, scale: 1, start: 0.5, wall: 1.8, off: 0.6, voidOff: true,
    blurb: 'Sunset over the spice market: leap the alley, dodge the sacks, and risk the plank bridge.',
    pts: [[0, -50, 10], [0, 30, 10], [20, 60, 10], [60, 65, 10], [85, 45, 10], [85, 10, 8], [110, -10, 8], [150, -5, 8], [170, 25, 8], [200, 30, 8], [215, 0, 8], [200, -40, 8], [160, -60, 9], [120, -55, 10], [90, -75, 10], [50, -95, 10], [15, -85, 10]],
    sc: { from: 7, to: 10, via: [[183, -12, 8]], hw: 2.6, mult: 0.92 },
    boxes: [1.3, 7.35, 13.4], pads: [[3.4, 0], [10.6, -0.2]], ramps: [{ p: 4.3, len: 6, gap: [4.4, 4.62] }],
    haz: [{ k: 'sack', p: 2.5, lat: 0.55 }, { k: 'sack', p: 6.4, lat: -0.5 }, { k: 'sack', p: 8.6, lat: 0.45 }, { k: 'sack', p: 12.3, lat: -0.4 }, { k: 'sack', p: 15.2, lat: 0.5 }, { k: 'heap', p: 6.0, lat: 0.3 }, { k: 'heap', p: 11.4, lat: -0.1 }, { k: 'heap', p: 14.6, lat: -0.45 }],
    music: { bpm: 124, root: 52, scale: [0, 1, 4, 5, 7, 8, 11], bass: [0, 0, 4, 0, 7, 5, 4, 1], lead: [7, 8, 7, 5, 4, 5, 4, 1, 0, 1, 4, 5, 7, 11, 12, 11] }
  }
];
const TRACK_IDX = {}; TRACKS.forEach((t, i) => { TRACK_IDX[t.id] = i; });

/* ------------------------------------------------------------ track geometry */
function crv(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
function samplePath(P, closed, ds) {
  const n = P.length, dense = [], SUB = 28;
  const segs = closed ? n : n - 1;
  const at = (i) => closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)];
  for (let i = 0; i < segs; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    for (let k = 0; k < SUB; k++) { const t = k / SUB; dense.push([crv(a[0], b[0], c[0], d[0], t), crv(a[1], b[1], c[1], d[1], t), crv(a[2], b[2], c[2], d[2], t), i + t]); }
  }
  if (!closed) { const e = P[n - 1]; dense.push([e[0], e[1], e[2], n - 1]); }
  const M = dense.length, cum = new Float64Array(M + 1);
  for (let j = 0; j < M; j++) {
    const a = dense[j], b = closed ? dense[(j + 1) % M] : dense[Math.min(M - 1, j + 1)];
    cum[j + 1] = cum[j] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const L = closed ? cum[M] : cum[M - 1];
  const N = Math.max(4, Math.round(L / ds)), step = L / N;
  const cnt = closed ? N : N + 1;
  const X = new Float32Array(cnt), Z = new Float32Array(cnt), Y = new Float32Array(cnt), PP = new Float32Array(cnt);
  let j = 0;
  for (let q = 0; q < cnt; q++) {
    const s = q * step;
    while (j < M - 1 && cum[j + 1] < s) j++;
    const a = dense[j], b = closed ? dense[(j + 1) % M] : dense[Math.min(M - 1, j + 1)];
    const seg = cum[j + 1] - cum[j], t = seg > 1e-6 ? clamp((s - cum[j]) / seg, 0, 1) : 0;
    X[q] = lerp(a[0], b[0], t); Z[q] = lerp(a[1], b[1], t); Y[q] = lerp(a[2], b[2], t);
    let pb = b[3]; if (closed && pb < a[3]) pb += n;
    PP[q] = lerp(a[3], pb, t);
  }
  const TXv = new Float32Array(cnt), TZv = new Float32Array(cnt), HD = new Float32Array(cnt);
  for (let q = 0; q < cnt; q++) {
    const qa = closed ? (q - 1 + cnt) % cnt : Math.max(0, q - 1), qb = closed ? (q + 1) % cnt : Math.min(cnt - 1, q + 1);
    let dx = X[qb] - X[qa], dz = Z[qb] - Z[qa]; const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
    TXv[q] = dx; TZv[q] = dz; HD[q] = Math.atan2(dx, dz);
  }
  return { N: cnt, L, ds: step, X, Z, Y, PP, TX: TXv, TZ: TZv, HD, closed };
}

const trackCache = {};
function getTrack(id) {
  if (trackCache[id]) return trackCache[id];
  const def = TRACKS[TRACK_IDX[id]], sc = def.scale;
  const P = def.pts.map((p) => [p[0] * sc, p[1] * sc, p[2] || 0]);
  const M = samplePath(P, true, 2);
  const N = M.N, ds = M.ds, L = M.L;
  const CV = new Float32Array(N), CVS = new Float32Array(N), VS = new Float32Array(N), LINE = new Float32Array(N), HW = new Float32Array(N);
  for (let q = 0; q < N; q++) { CV[q] = wrapA(M.HD[(q + 1) % N] - M.HD[(q - 1 + N) % N]) / (2 * ds); HW[q] = def.hw; }
  for (let q = 0; q < N; q++) { let a = 0; for (let k = -5; k <= 5; k++) a += CV[(q + k + N) % N]; CVS[q] = a / 11; }
  // safe speed from the bend, then let it fall back so a kart can brake in time
  for (let q = 0; q < N; q++) { let c = 0; for (let k = -3; k <= 3; k++) c = Math.max(c, Math.abs(CVS[(q + k + N) % N])); VS[q] = Math.min(60, Math.sqrt(26 / Math.max(c, 1e-4))); }
  for (let pass = 0; pass < 2; pass++) for (let q = N - 1; q >= 0; q--) VS[q] = Math.min(VS[q], Math.sqrt(VS[(q + 1) % N] * VS[(q + 1) % N] + 2 * 15 * ds));
  // a racing line that hugs the inside of each bend
  for (let q = 0; q < N; q++) { let a = 0; for (let k = -4; k <= 10; k++) a += CVS[(q + k + N) % N]; a /= 15; LINE[q] = clamp(-a * 340, -0.62, 0.62) * def.hw; }
  const sOfP = (p) => {
    const n = def.pts.length; p = ((p % n) + n) % n;
    let best = 0, bd = 1e9;
    for (let q = 0; q < N; q++) { let d = Math.abs(M.PP[q] - p); d = Math.min(d, n - d); if (d < bd) { bd = d; best = q; } }
    return best * ds;
  };
  const T = { id, def, N, L, ds, X: M.X, Z: M.Z, Y: M.Y, TX: M.TX, TZ: M.TZ, HD: M.HD, CV, CVS, VS, LINE, HW, sOfP };
  T.startS = sOfP(def.start);
  // shortcut, an open path joining two points of the lap
  if (def.sc) {
    const a = def.sc.from, b = def.sc.to;
    const ip = (p) => { const q = Math.round(sOfP(p) / ds) % N; return [M.X[q], M.Z[q], M.Y[q]]; };
    const pre = (p, d) => { const q = (Math.round(sOfP(p) / ds) + d + N) % N; return [M.X[q], M.Z[q], M.Y[q]]; };
    const via = def.sc.via.map((v) => [v[0] * sc, v[1] * sc, v[2]]);
    const pts = [pre(a, -6), ip(a)].concat(via, [ip(b), pre(b, 6)]);
    const S = samplePath(pts, false, 2);
    // keep only the part between the two joins (drop the lead in and lead out)
    let i0 = 0, i1 = S.N - 1; const A = ip(a), B = ip(b);
    let d0 = 1e9, d1 = 1e9;
    for (let q = 0; q < S.N; q++) { const da = Math.hypot(S.X[q] - A[0], S.Z[q] - A[1]), db = Math.hypot(S.X[q] - B[0], S.Z[q] - B[1]); if (da < d0) { d0 = da; i0 = q; } if (db < d1) { d1 = db; i1 = q; } }
    const cut = (arr) => arr.slice(i0, i1 + 1);
    const sh = { N: i1 - i0 + 1, ds: S.ds, X: cut(S.X), Z: cut(S.Z), Y: cut(S.Y), TX: cut(S.TX), TZ: cut(S.TZ), HD: cut(S.HD), hw: def.sc.hw, mult: def.sc.mult };
    sh.L = (sh.N - 1) * sh.ds;
    sh.sA = sOfP(a); sh.sB = sOfP(b); if (sh.sB < sh.sA) sh.sB += L;
    T.sc = sh;
  }
  // gaps, ramps, pads, boxes, hazards in metres along the lap
  T.ramps = (def.ramps || []).map((r) => ({ s: sOfP(r.p), len: r.len, gap: r.gap ? [sOfP(r.gap[0]), sOfP(r.gap[1])] : null }));
  T.gaps = T.ramps.filter((r) => r.gap).map((r) => r.gap);
  T.pads = (def.pads || []).map((p) => (p[2] && T.sc ? { s: (T.sc.sA + 0.12 * (T.sc.sB - T.sc.sA)) % L, lat: 0, onShort: true } : { s: sOfP(p[0]), lat: p[1] * def.hw, onShort: false }));
  T.boxRows = (def.boxes || []).map((p) => sOfP(p));
  T.haz = (def.haz || []).map((h, i) => ({ k: h.k, s: sOfP(h.p), lat: (h.lat || 0) * def.hw, i }));
  // bounds for the minimap
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let q = 0; q < N; q++) { x0 = Math.min(x0, M.X[q]); x1 = Math.max(x1, M.X[q]); z0 = Math.min(z0, M.Z[q]); z1 = Math.max(z1, M.Z[q]); y0 = Math.min(y0, M.Y[q]); y1 = Math.max(y1, M.Y[q]); }
  T.box = { x0, x1, z0, z1, y0, y1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  trackCache[id] = T;
  return T;
}

// Point on the centre line s metres round the lap, plus a lateral offset (right is positive).
const FR = { x: 0, y: 0, z: 0, h: 0, fx: 0, fz: 1, rx: -1, rz: 0, i: 0, t: 0 };
function frameAt(T, s) {
  const u = ((s % T.L) + T.L) % T.L / T.ds, i = Math.floor(u) % T.N, t = u - Math.floor(u), j = (i + 1) % T.N;
  FR.x = lerp(T.X[i], T.X[j], t); FR.z = lerp(T.Z[i], T.Z[j], t); FR.y = lerp(T.Y[i], T.Y[j], t);
  FR.h = T.HD[i] + wrapA(T.HD[j] - T.HD[i]) * t;
  FR.fx = Math.sin(FR.h); FR.fz = Math.cos(FR.h); FR.rx = -FR.fz; FR.rz = FR.fx;
  FR.i = i; FR.t = t;
  return FR;
}
function posAt(T, s, lat, up, out) {
  frameAt(T, s);
  out.x = FR.x + FR.rx * lat; out.z = FR.z + FR.rz * lat; out.y = FR.y + up;
  return out;
}

// Nearest point of a sampled path to (x, z), searching near a hint first.
const NP = { i: 0, t: 0, lat: 0, d2: 0, y: 0, along: 0 };
function nearestPath(S, x, z, hint, closed) {
  const N = S.N;
  let best = -1, bd = 1e18;
  const tryI = (i) => { const dx = S.X[i] - x, dz = S.Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } };
  if (hint >= 0 && hint < N) { for (let k = -34; k <= 34; k++) { let i = hint + k; if (closed) i = (i + N) % N; else if (i < 0 || i >= N) continue; tryI(i); } }
  if (best < 0 || bd > 1600) { for (let i = 0; i < N; i++) tryI(i); }
  // project onto the segment either side of the best sample
  let i = best, t = 0;
  const nxt = closed ? (i + 1) % N : Math.min(N - 1, i + 1), prv = closed ? (i - 1 + N) % N : Math.max(0, i - 1);
  const proj = (a, b) => { const ax = S.X[b] - S.X[a], az = S.Z[b] - S.Z[a], l2 = ax * ax + az * az; if (l2 < 1e-9) return 0; return ((x - S.X[a]) * ax + (z - S.Z[a]) * az) / l2; };
  const tf = proj(i, nxt);
  if (tf >= 0 && nxt !== i) t = Math.min(1, tf);
  else if (prv !== i) { const tb = proj(prv, i); if (tb >= 0 && tb <= 1) { i = prv; t = tb; } }
  const j = closed ? (i + 1) % N : Math.min(N - 1, i + 1);
  const cx = lerp(S.X[i], S.X[j], t), cz = lerp(S.Z[i], S.Z[j], t);
  const tx = lerp(S.TX[i], S.TX[j], t), tz = lerp(S.TZ[i], S.TZ[j], t), tm = Math.hypot(tx, tz) || 1;
  NP.i = i; NP.t = t; NP.lat = ((x - cx) * (-tz) + (z - cz) * tx) / tm; NP.d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
  NP.y = lerp(S.Y[i], S.Y[j], t); NP.along = (i + t) * S.ds;
  return NP;
}

// Where a kart is: progress round the lap, how far off the road, the ground below.
function locate(T, K) {
  const m = nearestPath(T, K.x, K.z, K.hi, true);
  K.hi = m.i;
  let s = m.along, lat = m.lat, gy = m.y, hw = T.HW[m.i], onShort = false;
  let exc = Math.abs(lat) - hw;
  if (T.sc) {
    const sc = T.sc, q = nearestPath(sc, K.x, K.z, K.si, false);
    const e2 = Math.abs(q.lat) - sc.hw;
    if (e2 < exc && q.along > 0.5 && q.along < sc.L - 0.5) {
      K.si = q.i; onShort = true; exc = e2; lat = q.lat; gy = q.y;
      s = sc.sA + (q.along / sc.L) * (sc.sB - sc.sA);
      if (s >= T.L) s -= T.L;
    } else K.si = q.i;
  }
  K.s = s; K.lat = lat; K.exc = exc; K.onShort = onShort;
  let surf = exc <= 0 ? (onShort ? 'dirt' : 'road') : exc < 1.1 && !onShort ? 'curb' : 'off';
  // ramps lift the ground; gaps open it
  let ramp = 0;
  if (!onShort) {
    for (let r = 0; r < T.ramps.length; r++) {
      const R = T.ramps[r]; let d = R.s - s; if (d < -T.L / 2) d += T.L;
      if (d >= 0 && d < R.len && Math.abs(lat) < hw) { ramp = 1.1 * (1 - d / R.len); surf = 'ramp'; }
    }
    for (let g = 0; g < T.gaps.length; g++) { const G = T.gaps[g]; if (s > G[0] && s < G[1] && Math.abs(lat) < hw + T.def.wall + 1) { gy = -40; surf = 'void'; } }
  } else if (T.def.voidOff && exc > 0.35) { gy = -40; surf = 'void'; }
  K.gy = gy + ramp; K.ramp = ramp; K.surf = surf;
  return K;
}

/* ------------------------------------------------------------ save game */
let ARC = null, Wd = null, SAVE = null, GP = null;
const SAVE_KEY = 'kart-mela.save';
function loadSave() {
  const d = ARC.store.get(SAVE_KEY, null) || {};
  SAVE = { best: d.best && typeof d.best === 'object' ? d.best : {}, cups: d.cups && typeof d.cups === 'object' ? d.cups : {}, races: d.races | 0 };
}
const saveGame = () => ARC.store.set(SAVE_KEY, SAVE);
const ghostKey = (id) => 'kart-mela.ghost.' + id;

/* ------------------------------------------------------------ items */
const ITEMS = {
  peel: { name: 'Mango Peel', col: '#ffc531' },
  rocket: { name: 'Paper Rocket', col: '#f4f1ea' },
  shield: { name: 'Marigold Shield', col: '#ff9a1f' },
  chai: { name: 'Speed Chai', col: '#c98a4b' },
  cut: { name: 'Power Cut', col: '#9b6bff' }
};
const ITEM_IDS = ['peel', 'rocket', 'shield', 'chai', 'cut'];
function rollItem(W, K) {
  const n = W.karts.length, r = n > 1 ? (K.place - 1) / (n - 1) : 0;
  const w = { peel: 0.42 * (1 - r) + 0.12, shield: 0.24 * (1 - r) + 0.08, rocket: 0.14 + 0.34 * r, chai: 0.08 + 0.34 * r, cut: r > 0.45 && !W.cut ? 0.14 * r : 0 };
  if (W.cfg.mode === 'time') return 'chai';
  let tot = 0; ITEM_IDS.forEach((k) => { tot += w[k]; });
  let x = Math.random() * tot;
  for (let i = 0; i < ITEM_IDS.length; i++) { x -= w[ITEM_IDS[i]]; if (x <= 0) return ITEM_IDS[i]; }
  return 'peel';
}

/* ------------------------------------------------------------ the world */
function mkKart(c, idx, isPlayer) {
  return {
    c, idx, isPlayer, name: isPlayer ? 'You' : c.name, top: kartTop(c), acc: kartAcc(c), turn: kartTurn(c), wt: 0.6 + c.wt * 0.8,
    x: 0, z: 0, y: 0, vy: 0, h: 0, v: 0, slip: 0, air: false, airT: 0, hi: -1, si: -1, s: 0, lat: 0, exc: 0, gy: 0, ramp: 0, surf: 'road', onShort: false,
    steerIn: 0, gas: false, brk: false, driftHeld: false, drift: 0, driftT: 0, charge: 0, level: 0, hopArmed: 0, trick: 0, trickOK: false,
    boostT: 0, boostK: 1, spinT: 0, spinDir: 1, tumbleT: 0, shrinkT: 0, shieldT: 0, invulnT: 0, stall: 0, sneezeT: 0, respawnT: 0, safeS: 0, lastGoodY: 0, dhPrev: false, wasRamp: false, lastRampY: 0, hopWin: 0,
    item: null, roulT: 0, roulPick: null, holdT: 0,
    totalD: 0, prevS: 0, lap: 0, lapT0: 0, laps: [], finished: false, finT: 0, place: idx + 1, bot: !isPlayer,
    ai: { off: (Math.random() - 0.5) * 2.4, cd: 0, driftCd: 0, useAt: 0, shortcut: false, mood: Math.random(), skill: 0.8 + Math.random() * 0.2 },
    anim: { lean: 0, bob: 0, bobV: 0, pitch: 0, roll: 0, wheel: 0, steer: 0, cele: 0, react: 0, reactK: '', head: 0, squash: 0, yawVis: 0, spinYaw: 0, flip: 0, rescue: 0 },
    stats: { drifts: 0, turbos: 0, ultra: 0, hits: 0, taken: 0, items: 0, overtakes: 0, tricks: 0, bestLap: null, boxes: 0 }
  };
}

function newWorld(cfg) {
  const T = getTrack(cfg.track), d = DIFF[cfg.diff] || DIFF.normal;
  const W = {
    T, cfg, d, attract: !!cfg.attract, phase: cfg.attract ? 'race' : 'intro', t: 0, raceT: 0, introT: 0, introDur: 6.8, cd: 3.4, karts: [], objs: [], pops: [],
    boxes: [], haz: [], banner: null, bannerT: 0, cut: null, cutT: 0, slowT: 0, slowK: 1, photo: null, finalLap: false, results: null, finWait: 0, fade: cfg.attract ? 0 : 1,
    ghost: null, rec: null, recT: 0, contT: 0, msgs: [], hint: 3.5, started: false, rocketStart: 0, wrongT: 0, seed: (Math.random() * 1e9) | 0, celebrated: false
  };
  const tt = cfg.mode === 'time';
  const pc = CHARS[CHAR_IDX[cfg.char]] || CHARS[0];
  const P = mkKart(pc, 0, !cfg.attract); P.bot = !!cfg.attract; W.P = P; W.karts.push(P);
  if (!tt) {
    let k = 1;
    CHARS.forEach((c) => { if (c.id !== pc.id) { const K = mkKart(c, k++, false); K.ai.skill = clamp(0.78 + Math.random() * 0.24, 0, 1); W.karts.push(K); } });
  }
  // the grid: pairs behind the line, the player starts near the back in a race
  const order = W.karts.slice();
  if (!tt) { order.splice(0, 1); order.splice(cfg.attract ? 3 : (cfg.gpRace ? Math.min(7, 3 + cfg.gpRace) : 6), 0, P); }
  order.forEach((K, k) => {
    const s = T.startS - 7 - Math.floor(k / 2) * 6, lat = (k % 2 ? 1 : -1) * 2.6 + (tt ? (k % 2 ? -2.6 : 2.6) : 0);
    posAt(T, s, lat, 0, K); K.h = FR.h; K.y = FR.y; K.gy = FR.y;
    K.totalD = s - T.startS; K.prevS = s; K.lap = -1; K.place = k + 1; K.safeS = s; K.lastGoodY = K.y;
    locate(T, K);
  });
  // item boxes in rows across the road
  T.boxRows.forEach((s, r) => {
    const lanes = [-0.62, -0.21, 0.21, 0.62];
    lanes.forEach((f, j) => { posAt(T, s, f * T.def.hw, 1.1, FR_TMP); W.boxes.push({ x: FR_TMP.x, y: FR_TMP.y, z: FR_TMP.z, s, on: true, t: 0, k: r * 4 + j }); });
  });
  if (T.sc && T.def.id === 'fair') { const sc = T.sc, q = Math.round(sc.N * 0.62); W.boxes.push({ x: sc.X[q], y: sc.Y[q] + 1.1, z: sc.Z[q], s: 0, on: true, t: 0, k: 99 }); }
  T.haz.forEach((h) => { W.haz.push({ k: h.k, s: h.s, lat: h.lat, base: h.lat, x: 0, z: 0, y: 0, ph: Math.random() * 6, r: h.k === 'ball' ? 1.7 : h.k === 'puddle' ? 2.6 : h.k === 'sack' ? 0.95 : 1.5, spin: 0 }); });
  W.haz.forEach((h) => placeHaz(W, h, 0));
  if (tt) {
    W.rec = { dt: 0.1, x: [], z: [], y: [], h: [] };
    const g = ARC.store.get(ghostKey(T.id), null);
    if (g && Array.isArray(g.x) && g.x.length > 10 && g.char) W.ghost = g;
  }
  if (cfg.attract) { W.cd = 0; W.started = true; W.karts.forEach((K) => { K.lap = 0; K.totalD = K.s - T.startS + (K.s < T.startS - 30 ? T.L : 0); }); }
  return W;
}
const FR_TMP = { x: 0, y: 0, z: 0 };

function placeHaz(W, h, t) {
  const T = W.T;
  if (h.k === 'ball') { h.lat = Math.sin(t * 0.55 + h.ph) * (T.def.hw + 1.2); h.spin += 0; }
  posAt(T, h.s, h.lat, 0, h);
  if (h.k === 'ball') h.y += h.r;
}

/* ------------------------------------------------------------ sound and music */
const SND = { e1: null, e2: null, skidT: 0, mus: { t: 0, step: 0, on: false } };
function engineStop() { if (SND.e1) { SND.e1.stop(); SND.e2.stop(); } SND.e1 = SND.e2 = null; }
function engineStart() { engineStop(); SND.e1 = ARC.sfx.hum('sawtooth'); SND.e2 = ARC.sfx.hum('square'); }
function engineSet(W, P) {
  if (!SND.e1) return;
  const sp = clamp(Math.abs(P.v) / P.top, 0, 1.4), gear = Math.min(3, Math.floor(sp * 3.4)), inG = sp * 3.4 - gear;
  const f = 70 + (0.35 + inG * 0.65) * 110 + gear * 14 + (P.boostT > 0 ? 40 : 0);
  const vol = P.respawnT > 0 || W.phase === 'intro' ? 0 : (0.035 + (P.gas ? 0.05 : 0.015) + (P.boostT > 0 ? 0.03 : 0)) * (W.phase === 'countdown' ? 0.8 : 1);
  SND.e1.set(f, vol); SND.e2.set(f * 0.5, vol * 0.6);
}
const tone = (f, d, o) => ARC.sfx.tone(f, d, o);
const noise = (d, o) => ARC.sfx.noise(d, o);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function musicTick(W, dtReal) {
  const M = SND.mus, def = W.T.def.music;
  if (W.attract || ARC.sfx.muted || !(W.phase === 'race' || W.phase === 'countdown' || W.phase === 'finished' || W.phase === 'intro')) { M.t = 0; return; }
  const fast = W.finalLap && W.phase === 'race';
  const bpm = def.bpm * (fast ? 1.13 : 1), stepT = 60 / bpm / 4;
  M.t += dtReal;
  if (M.t < stepT) return;
  M.t -= stepT; if (M.t > stepT) M.t = 0;
  const st = M.step = (M.step + 1) % 64;
  const quiet = W.phase === 'intro' ? 0.6 : W.phase === 'countdown' ? 0.4 : 1;
  const key = def.root + (fast ? 2 : 0), sc = def.scale;
  const deg = (d) => { const o = Math.floor(d / 7), r = ((d % 7) + 7) % 7; return key + sc[r] + 12 * o; };
  const s16 = st % 16;
  // dhol: deep on the beat, a slap on the off beat
  if (s16 % 4 === 0) tone(s16 === 0 || s16 === 8 ? 82 : 110, 0.16, { type: 'sine', slide: 46, vol: 0.13 * quiet });
  if (s16 === 4 || s16 === 12) noise(0.09, { freq: 1700, vol: 0.06 * quiet, filter: 'bandpass' });
  if (s16 % 2 === 1 && quiet > 0.5) noise(0.035, { freq: 7000, vol: 0.02, filter: 'highpass' });
  if (fast && (s16 === 6 || s16 === 14)) tone(160, 0.08, { type: 'sine', slide: 90, vol: 0.08 });
  // bass on eighths
  if (s16 % 2 === 0) { const b = def.bass[(s16 / 2) % 8]; tone(mtof(deg(b) - 12), stepT * 1.7, { type: 'triangle', vol: 0.085 * quiet }); }
  // lead melody, every other bar answered an octave up
  if (W.phase === 'race' || W.phase === 'finished') {
    const ph = Math.floor(st / 16);
    if (s16 % 2 === 0 || (fast && s16 % 4 === 1)) {
      const n = def.lead[(s16 >> 1) + (ph % 2) * 8];
      if (n != null) tone(mtof(deg(n) + (ph === 3 ? 12 : 0)), stepT * 1.6, { type: 'square', vol: 0.026 });
    }
    if (s16 === 0) { tone(mtof(deg(0)), stepT * 7, { type: 'sawtooth', vol: 0.016 }); tone(mtof(deg(4)), stepT * 7, { type: 'sawtooth', vol: 0.012 }); }
  }
}
// A bed of sound under the music: the fair's crowd, the hill's rain, the rooftop wind.
function ambienceTick(W, dtReal) {
  if (W.attract || ARC.sfx.muted) return;
  SND.ambT = (SND.ambT || 0) - dtReal;
  if (SND.ambT > 0) return;
  const id = W.T.id;
  if (id === 'fair') { SND.ambT = 0.45 + Math.random() * 0.3; noise(0.9, { freq: 500 + Math.random() * 300, vol: 0.025, filter: 'bandpass' }); if (Math.random() < 0.08) tone(900 + Math.random() * 600, 0.12, { type: 'triangle', vol: 0.02 }); }
  else if (id === 'hill') { SND.ambT = 0.35; noise(0.7, { freq: 4200, vol: 0.035, filter: 'highpass' }); if (Math.random() < 0.05) noise(1.6, { freq: 120, vol: 0.05 }); }
  else { SND.ambT = 0.6 + Math.random() * 0.4; noise(1.2, { freq: 300, vol: 0.02 }); if (Math.random() < 0.06) tone(1320, 0.5, { type: 'sine', vol: 0.015 }); }
}
function sfx(id, k) {
  k = k == null ? 1 : k;
  switch (id) {
    case 'box': tone(660, 0.07, { type: 'triangle', vol: 0.12 }); tone(990, 0.09, { type: 'triangle', vol: 0.1 }); break;
    case 'roul': tone(1100 + Math.random() * 300, 0.03, { type: 'square', vol: 0.03 }); break;
    case 'got': tone(784, 0.08, { type: 'triangle', vol: 0.12 }); tone(1175, 0.14, { type: 'triangle', vol: 0.1 }); break;
    case 'peel': tone(300, 0.12, { type: 'sine', slide: 180, vol: 0.1 }); break;
    case 'rocket': noise(0.5, { freq: 2600, vol: 0.12, filter: 'highpass' }); tone(420, 0.4, { type: 'sawtooth', slide: 900, vol: 0.05 }); break;
    case 'shield': tone(880, 0.2, { type: 'sine', vol: 0.1 }); tone(1320, 0.3, { type: 'sine', vol: 0.07 }); break;
    case 'chai': tone(220, 0.2, { type: 'sine', slide: 660, vol: 0.12 }); noise(0.3, { freq: 900, vol: 0.08 }); break;
    case 'cut': tone(520, 0.6, { type: 'sawtooth', slide: 60, vol: 0.12 }); noise(0.4, { freq: 300, vol: 0.15 }); break;
    case 'hit': noise(0.22, { freq: 800, vol: 0.25 * k }); tone(200, 0.3, { type: 'square', slide: 70, vol: 0.12 * k }); break;
    case 'slip': tone(500, 0.25, { type: 'sine', slide: 140, vol: 0.12 }); noise(0.15, { freq: 1500, vol: 0.08 }); break;
    case 'block': tone(1200, 0.1, { type: 'triangle', vol: 0.12 }); tone(1600, 0.15, { type: 'triangle', vol: 0.08 }); break;
    case 'turbo': tone(320 + 160 * k, 0.18, { type: 'sawtooth', slide: 900 + 300 * k, vol: 0.09 }); noise(0.25, { freq: 1800, vol: 0.06 * k, filter: 'highpass' }); break;
    case 'spark': tone(900 + 300 * k, 0.05, { type: 'square', vol: 0.04 }); break;
    case 'boost': noise(0.35, { freq: 1400, vol: 0.1, filter: 'highpass' }); tone(400, 0.3, { type: 'sawtooth', slide: 800, vol: 0.06 }); break;
    case 'bump': noise(0.1, { freq: 500, vol: 0.18 * k }); tone(140, 0.1, { type: 'square', vol: 0.07 * k }); break;
    case 'wall': noise(0.14, { freq: 420, vol: 0.2 * k }); tone(90, 0.14, { type: 'square', slide: 60, vol: 0.09 * k }); break;
    case 'land': noise(0.12, { freq: 260, vol: 0.2 * k }); break;
    case 'hop': tone(240, 0.06, { type: 'triangle', slide: 360, vol: 0.05 }); break;
    case 'splash': noise(0.3, { freq: 2400, vol: 0.12 * k, filter: 'bandpass' }); break;
    case 'achoo': tone(700, 0.08, { type: 'square', slide: 400, vol: 0.07 }); noise(0.25, { freq: 3000, vol: 0.12, filter: 'highpass' }); break;
    case 'trick': tone(660, 0.08, { type: 'triangle', vol: 0.1 }); tone(880, 0.1, { type: 'triangle', vol: 0.09, delay: 0 }); break;
    case 'beep': tone(k > 1 ? 880 : 440, k > 1 ? 0.5 : 0.18, { type: 'square', vol: 0.1 }); break;
    case 'lap': tone(784, 0.1, { type: 'triangle', vol: 0.12 }); tone(1047, 0.18, { type: 'triangle', vol: 0.1 }); break;
    case 'final': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, { type: 'square', vol: 0.08 }), i * 110)); break;
    case 'finish': [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.22, { type: 'triangle', vol: 0.12 }), i * 120)); noise(1.6, { freq: 1200, vol: 0.1, filter: 'bandpass' }); break;
    case 'cheer': noise(1.8, { freq: 1100, vol: 0.12, filter: 'bandpass' }); break;
    case 'rescue': tone(330, 0.5, { type: 'sine', slide: 660, vol: 0.08 }); break;
    case 'whoosh': noise(0.4, { freq: 900, vol: 0.12 }); break;
  }
}

/* ------------------------------------------------------------ haptics */
function rumble(ms, strong, weak, kind) {
  if (!ARC || !ARC.haptic) return;
  if (kind) { ARC.haptic(kind, clamp(strong, 0.2, 1)); return; }
  ARC.haptic({ vib: [Math.max(6, Math.round(ms))], rumble: [[0, Math.round(ms * 1.4 + 30), clamp(strong, 0, 1), clamp(weak, 0, 1)]], pri: ms >= 100 ? 3 : ms >= 40 ? 2 : 1 }, 1);
}

function pop(W, text, sub, col, big) {
  W.pops.push({ text, sub: sub || '', col: col || '#ffb736', t: 0, big: !!big });
  if (W.pops.length > 4) W.pops.shift();
}
function banner(W, text, sub, dur) { W.banner = { text, sub: sub || '' }; W.bannerT = dur || 2; }

/* ------------------------------------------------------------ input */
// Touch: one finger drags to steer; hold still, or put a second finger down, to drift; a quick tap uses the item.
const TOUCH = { map: new Map(), primary: null, upLp: false, itemQ: 0, tapQ: 0 };
const MOUSE = { left: false, rightQ: 0 };
const evT = (e) => (e && e.timeStamp > 0 ? e.timeStamp : nowMs());
function wireInput(a) {
  const cv = a.canvas;
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 0) MOUSE.left = true; if (e.button === 2) MOUSE.rightQ++; return; }
    TOUCH.map.set(e.pointerId, { t0: evT(e), tr: nowMs(), x0: e.clientX, y0: e.clientY, moved: false, lp: false });
    if (TOUCH.primary == null || !TOUCH.map.has(TOUCH.primary)) TOUCH.primary = e.pointerId;
  });
  cv.addEventListener('pointermove', (e) => {
    const t = TOUCH.map.get(e.pointerId); if (!t) return;
    if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 12) t.moved = true;
  });
  const up = (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 0) MOUSE.left = false; return; }
    const t = TOUCH.map.get(e.pointerId); if (!t) return;
    const dur = evT(e) - t.t0, quick = e.type !== 'pointercancel' && !t.moved;
    if (e.pointerId === TOUCH.primary) {
      TOUCH.upLp = t.lp; TOUCH.primary = null;
      // a quick tap of the steering finger uses the item; any short tap also skips a cutaway
      if (quick && dur < 260) { TOUCH.itemQ++; TOUCH.tapQ++; }
    } else if (quick && dur < 170) { TOUCH.itemQ++; TOUCH.tapQ++; }
    TOUCH.map.delete(e.pointerId);
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => { TOUCH.map.clear(); TOUCH.primary = null; MOUSE.left = false; });
}
function padShoulder() {
  if (!ARC.gamepad || !navigator.getGamepads) return false;
  try { const all = navigator.getGamepads(); for (let i = 0; i < all.length; i++) { const g = all[i]; if (g && g.connected) { const b = g.buttons; return !!((b[5] && b[5].pressed) || (b[4] && b[4].pressed)); } } } catch (e) { return false; }
  return false;
}
function touchDrift() {
  const now = nowMs(); let drift = false;
  const pr = TOUCH.primary != null ? TOUCH.map.get(TOUCH.primary) : null;
  if (pr && !pr.moved && now - pr.tr > 280) pr.lp = true;
  if (pr && pr.lp) drift = true;
  TOUCH.map.forEach((t, id) => { if (id !== TOUCH.primary && now - t.tr > 150) drift = true; });
  return drift;
}
function readPlayer(W, P, dt) {
  const a = ARC, inp = a.input, touch = a.touchMode, gest = touch && a.touchStyle !== 'pads';
  let sx = inp.axis().x;
  if (inp.stick.active) sx = clamp(inp.stick.x * 1.25, -1, 1);
  else if (touch && a.touchStyle === 'tilt') sx = clamp(sx * 1.2, -1, 1);
  const keySteer = inp.down('ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD') || inp.pad.active;
  const mouseMode = !!W.cfg.mouse && !touch;
  if (mouseMode && !keySteer && inp.pointer.seen && inp.pointer.type === 'mouse') { sx = clamp((inp.pointer.nx - 0.5) * 2.6, -1, 1); if (Math.abs(sx) < 0.05) sx = 0; }
  const g = inp.gesture;
  const dragBrake = gest && g.active && g.type !== 'mouse' && g.dy > 70 && g.dy > Math.abs(g.dx) * 1.2;
  if (dragBrake) sx *= 0.5;
  P.gas = !dragBrake && (inp.down('ArrowUp', 'KeyW') || touch || mouseMode);
  // on the grid an automatic throttle waits for a finger, a click or the trigger: that is the rocket start
  if (W.phase === 'countdown') P.gas = inp.down('ArrowUp', 'KeyW') || (touch && TOUCH.map.size > 0) || (mouseMode && MOUSE.left);
  P.brk = inp.down('ArrowDown', 'KeyS') || dragBrake;
  if (P.brk && !touch) P.gas = P.gas && !inp.down('ArrowDown', 'KeyS');
  const tDrift = touch ? touchDrift() : false;
  P.driftHeld = inp.down('Space', 'ShiftLeft', 'ShiftRight') || tDrift || (mouseMode && MOUSE.left) || padShoulder();
  let use = inp.hit('KeyX', 'KeyE', 'KeyJ');
  if (MOUSE.rightQ > 0) { MOUSE.rightQ = 0; if (mouseMode) use = true; }
  if (TOUCH.itemQ > 0) { TOUCH.itemQ = 0; if (touch) use = true; }
  P.steerIn += (sx - P.steerIn) * Math.min(1, dt * (Math.abs(sx) > Math.abs(P.steerIn) ? 11 : 15));
  P.lookBack = inp.down('KeyC');
  return use;
}

/* ------------------------------------------------------------ AI */
const AIV = { x: 0, y: 0, z: 0 };
function aiDrive(W, K, dt) {
  const T = W.T, d = W.d, ai = K.ai;
  const look = 7 + Math.max(0, K.v) * 0.55;
  const s = K.s;
  // decide on the shortcut when its mouth comes up
  if (T.sc && !K.onShort) {
    let dm = T.sc.sA - s; if (dm < -T.L / 2) dm += T.L;
    if (dm > 0 && dm < 25 && ai.scDecide !== K.lap) { ai.scDecide = K.lap; ai.shortcut = !W.attract ? Math.random() < d.short * (K.boostT > 0 || K.item === 'chai' ? 1.6 : 1) * K.ai.skill : Math.random() < 0.4; }
  }
  let tx, tz, ty;
  if (K.onShort || (ai.shortcut && (() => { let dm = T.sc.sA - s; if (dm < -T.L / 2) dm += T.L; return dm > -2 && dm < 14; })())) {
    const sc = T.sc;
    let q = K.onShort ? K.si + Math.round(look / sc.ds) : Math.round(4 / sc.ds);
    if (q >= sc.N) { ai.shortcut = false; posAt(T, sc.sB + (q - sc.N) * sc.ds, 0, 0, AIV); tx = AIV.x; tz = AIV.z; }
    else { tx = sc.X[q]; tz = sc.Z[q]; }
    ty = 0;
  } else {
    const ls = s + look, qi = Math.floor(((ls % T.L) + T.L) % T.L / T.ds) % T.N;
    let lat = T.LINE[qi] + ai.off;
    // ride round karts, peels, sacks and balls ahead
    let avoid = 0;
    const consider = (os, olat, r) => {
      let ds = os - s; if (ds < -T.L / 2) ds += T.L; if (ds > T.L / 2) ds -= T.L;
      if (ds < 1 || ds > 22 + Math.max(0, K.v) * 0.4) return;
      if (Math.abs(olat - lat) < r + 1.4) avoid += (olat > lat ? -1 : 1) * (r + 1.6 - Math.abs(olat - lat)) * (1 - ds / 40);
    };
    for (let i = 0; i < W.objs.length; i++) { const o = W.objs[i]; if (o.type === 'peel') consider(o.s, o.lat, 0.9); }
    for (let i = 0; i < W.haz.length; i++) { const h = W.haz[i]; if (h.k !== 'puddle' || ai.skill > 0.9) consider(h.s, h.lat, h.r); }
    for (let i = 0; i < W.karts.length; i++) { const o = W.karts[i]; if (o !== K && o.v < K.v - 2) consider(o.s, o.lat, 1.1); }
    lat = clamp(lat + avoid * 1.6, -T.def.hw + 1.2, T.def.hw - 1.2);
    posAt(T, ls, lat, 0, AIV); tx = AIV.x; tz = AIV.z;
  }
  const want = Math.atan2(tx - K.x, tz - K.z);
  const err = wrapA(want - (K.h + (K.drift ? K.drift * 0.0 : 0)));
  let steer = clamp(-err * 2.4, -1, 1);
  // speed for the bend ahead, pace and a gentle rubber band
  let vs = 99; const bl = K.v * K.v / 30 + 6;
  for (let k = 0; k <= 4; k++) vs = Math.min(vs, T.VS[Math.floor(((s + bl * k / 4) % T.L + T.L) % T.L / T.ds) % T.N]);
  let pace = d.ai * (0.95 + 0.05 * ai.skill);
  if (!W.attract && !K.isPlayer) {
    const gap = W.P.totalD - K.totalD;
    if (W.P.finished) pace *= 1.02;
    else if (gap > 0) pace *= 1 + d.behind * clamp(gap / 110, 0, 1);
    else pace *= 1 + d.ahead * clamp(-gap / 140, 0, 1);
  }
  if (K.bot && K.isPlayer) pace = 0.96;
  const vt = Math.min(K.top * d.speed * pace, vs * (1.02 + 0.06 * ai.skill));
  K.gas = K.v < vt; K.brk = K.v > vt + 3;
  // drift through long bends for a mini-turbo
  ai.driftCd -= dt;
  const c = Math.abs(T.CVS[K.hi < 0 ? 0 : (K.hi + 6) % T.N]);
  const cs = T.CVS[K.hi < 0 ? 0 : (K.hi + 6) % T.N];
  if (!K.drift && ai.driftCd <= 0 && c > 0.02 && K.v > 14 && !K.onShort && !K.air && Math.random() < d.drift * ai.skill * dt * 5) { K.driftHeld = true; ai.driftDir = cs < 0 ? 1 : -1; ai.driftCd = 2.2; ai.dHold = 0.45; }
  else if (K.drift) { K.driftHeld = c > 0.009 && K.driftT < 2.2 + ai.skill * 1.2; if (K.driftHeld) steer = clamp(steer * 0.75 + K.drift * 0.3, -1, 1); }
  else if (ai.dHold > 0) { ai.dHold -= dt; K.driftHeld = true; steer = ai.driftDir * 0.7; }
  else K.driftHeld = false;
  K.steerIn += (steer - K.steerIn) * Math.min(1, dt * 9);
  // items: hold a moment, then use when it helps
  let use = false;
  if (K.item && !W.attract && W.phase === 'race') {
    K.holdT += dt;
    if (K.holdT > ai.useAt) {
      const it = K.item;
      if (it === 'shield' || it === 'chai' || it === 'cut') use = true;
      else if (it === 'rocket') use = K.place > 1 || K.holdT > 6;
      else if (it === 'peel') { let behind = false; for (let i = 0; i < W.karts.length; i++) { const o = W.karts[i]; const g = K.totalD - o.totalD; if (o !== K && g > 2 && g < 18) behind = true; } use = behind || K.holdT > 8; }
    }
    if (it3(W, K)) use = true;
  }
  return use;
}
function it3(W, K) { return K.item === 'shield' && W.objs.some((o) => o.type === 'rocket' && o.target === K && o.dist < 30); }

/* ------------------------------------------------------------ the rules */
function startDrift(W, K) {
  if (K.air || K.drift || Math.abs(K.v) < 9 || K.spinT > 0 || K.tumbleT > 0 || K.respawnT > 0) return;
  K.vy = 3.4; K.air = true; K.airT = 0; K.hopArmed = 1; K.y += 0.02;
  if (K.isPlayer) sfx('hop');
}
function endDrift(W, K, give) {
  if (!K.drift) return;
  const lv = K.level;
  K.drift = 0; K.driftT = 0; K.charge = 0; K.level = 0;
  if (give && lv > 0) {
    const dur = [0, 0.75, 1.2, 1.7][lv];
    K.boostT = Math.max(K.boostT, dur); K.boostK = 1 + 0.08 * lv;
    K.stats.turbos++; if (lv === 3) K.stats.ultra++;
    VIEW.fx('turbo', K, lv);
    if (K.isPlayer) {
      sfx('turbo', lv); rumble(40 + lv * 25, 0.4 + lv * 0.2, 0.5, 'boost');
      pop(W, ['', 'Mini-turbo', 'Super turbo', 'Ultra turbo'][lv], '', ['', '#38c8ff', '#ff9a1f', '#ff4fd8'][lv]);
    }
  }
}
function hitKart(W, K, kind, by) {
  if (K.respawnT > 0 || K.finished && kind !== 'squash') return false;
  if (K.invulnT > 0 && kind !== 'cut') return false;
  if (K.shieldT > 0) {
    K.shieldT = 0; VIEW.fx('block', K);
    if (K.isPlayer) { sfx('block'); pop(W, 'Blocked!', 'The marigolds took it', '#ffb736'); rumble(30, 0.2, 0.4); }
    return false;
  }
  endDrift(W, K, false);
  K.boostT = 0; K.roulT = 0;
  if (kind === 'peel' || kind === 'squash' || kind === 'ball' || kind === 'sneeze') { K.spinT = kind === 'sneeze' ? 0.6 : 1.05; K.spinDir = Math.random() < 0.5 ? -1 : 1; K.v *= kind === 'sneeze' ? 0.7 : 0.4; }
  else if (kind === 'rocket') { K.tumbleT = 1.25; K.vy = 6.5; K.air = true; K.v *= 0.3; }
  K.invulnT = kind === 'sneeze' ? 0.8 : 1.9;
  K.anim.react = 1.4; K.anim.reactK = kind;
  K.stats.taken++;
  if (by && by !== K) by.stats.hits++;
  VIEW.fx('hit', K, kind);
  if (K.isPlayer || (by && by.isPlayer)) sfx(kind === 'peel' ? 'slip' : kind === 'sneeze' ? 'achoo' : 'hit', K.isPlayer ? 1 : 0.6);
  if (K.isPlayer) {
    const txt = { peel: 'Slipped!', rocket: 'Rocket hit!', squash: 'Squashed!', ball: 'Bonk!', sneeze: 'Achoo!' }[kind] || 'Ouch!';
    pop(W, txt, by && by !== K ? 'by ' + by.c.name : '', '#ff6940', kind !== 'sneeze');
    ARC.shake = Math.max(ARC.shake, kind === 'rocket' ? 10 : 6);
    rumble(kind === 'rocket' ? 140 : 70, kind === 'rocket' ? 0.9 : 0.6, 0.7, kind === 'rocket' ? 'heavy' : 'hit');
  } else if (by && by.isPlayer) {
    pop(W, kind === 'rocket' ? 'Direct hit!' : kind === 'peel' ? 'Peeled!' : 'Got them!', K.c.name, '#44ffa8');
    rumble(40, 0.3, 0.3);
  }
  return true;
}

function useItem(W, K) {
  const it = K.item; if (!it || K.roulT > 0) return;
  K.item = null; K.holdT = 0; K.stats.items++;
  K.ai.useAt = 0.6 + Math.random() * 2.6;
  const fx = Math.sin(K.h), fz = Math.cos(K.h);
  if (it === 'peel') {
    const back = 1;
    const o = { type: 'peel', x: K.x - fx * 1.9 * back, z: K.z - fz * 1.9 * back, y: K.y, vx: back < 0 ? fx * (K.v + 12) : fx * K.v * 0.15, vz: back < 0 ? fz * (K.v + 12) : fz * K.v * 0.15, vy: back < 0 ? 5 : 1.5, owner: K, t: 0, s: K.s, lat: K.lat, hi: K.hi, si: -1, gy: K.y, rot: Math.random() * 6 };
    W.objs.push(o); if (K.isPlayer) sfx('peel');
  } else if (it === 'rocket') {
    let tgt = null;
    const ord = W.order || W.karts;
    const myI = ord.indexOf(K);
    for (let i = myI - 1; i >= 0; i--) { const o = ord[i]; if (!o.finished && o.respawnT <= 0) { tgt = o; break; } }
    W.objs.push({ type: 'rocket', x: K.x + fx * 1.6, z: K.z + fz * 1.6, y: K.y + 0.8, s: K.s, lat: K.lat, hi: K.hi, si: -1, owner: K, target: tgt, t: 0, h: K.h, dist: 999, v: Math.max(K.v + 8, 34) });
    sfx('rocket');
  } else if (it === 'shield') { K.shieldT = 10; if (K.isPlayer) sfx('shield'); VIEW.fx('shield', K); }
  else if (it === 'chai') { K.boostT = Math.max(K.boostT, 1.7); K.boostK = 1.14; VIEW.fx('chai', K); if (K.isPlayer) { sfx('chai'); rumble(80, 0.8, 0.6, 'boost'); } }
  else if (it === 'cut') {
    W.cut = { owner: K, t: 0 }; W.cutT = 3.8;
    sfx('cut');
    W.karts.forEach((o) => {
      if (o === K || o.finished || o.respawnT > 0) return;
      if (o.shieldT > 0) { o.shieldT = 0; VIEW.fx('block', o); return; }
      o.shrinkT = 3.8; o.item = null; o.roulT = 0; endDrift(W, o, false); o.v *= 0.7; o.anim.react = 1; o.anim.reactK = 'cut';
    });
    if (K.isPlayer) pop(W, 'Power cut!', 'Everyone else shrinks', '#9b6bff', true);
    else if (!W.P.finished) { pop(W, 'Power cut!', K.c.name + ' pulled the plug', '#9b6bff', true); rumble(120, 0.6, 0.6); }
  }
  if (!K.isPlayer && Math.abs(K.totalD - W.P.totalD) < 40 && it !== 'cut') VIEW.fx('use', K, it);
}

function stepKart(W, K, dt) {
  const T = W.T;
  // timers
  if (K.boostT > 0) K.boostT = Math.max(0, K.boostT - dt);
  if (K.spinT > 0) K.spinT = Math.max(0, K.spinT - dt);
  if (K.tumbleT > 0) K.tumbleT = Math.max(0, K.tumbleT - dt);
  if (K.shrinkT > 0) K.shrinkT = Math.max(0, K.shrinkT - dt);
  if (K.shieldT > 0) K.shieldT = Math.max(0, K.shieldT - dt);
  if (K.invulnT > 0) K.invulnT = Math.max(0, K.invulnT - dt);
  if (K.sneezeT > 0) K.sneezeT -= dt;
  if (K.stall > 0) K.stall -= dt;
  if (K.roulT > 0) {
    const before = K.roulT; K.roulT = Math.max(0, K.roulT - dt);
    if (K.isPlayer && Math.floor(before * 14) !== Math.floor(K.roulT * 14)) sfx('roul');
    if (K.roulT === 0) { K.item = K.roulPick; if (K.isPlayer) { sfx('got'); rumble(20, 0, 0.3); } }
  }
  // fell into a gap: a kite lifts the kart back onto the roof
  if (K.respawnT > 0) {
    K.respawnT -= dt; K.anim.rescue = clamp(K.respawnT / 1.3, 0, 1);
    if (K.respawnT <= 0) { K.respawnT = 0; K.anim.rescue = 0; K.invulnT = 1.8; K.v = 9; K.vy = 0; K.air = false; }
    else {
      posAt(T, K.safeS, 0, 0, FR_TMP); K.x = FR_TMP.x; K.z = FR_TMP.z; K.h = FR.h;
      K.y = FR_TMP.y + 5 * K.anim.rescue; K.gy = FR_TMP.y; K.v = 0; K.slip = 0; K.hi = FR.i;
      locate(T, K);
    }
    return;
  }
  locate(T, K);
  const stunned = K.spinT > 0 || K.tumbleT > 0;
  // ramps launch: the kart leaves the lip with a kick upward
  if (K.wasRamp && K.surf !== 'ramp' && !K.onShort && K.v > 4 && K.y > K.gy - 0.2) {
    for (let g = 0; g < T.gaps.length; g++) { let dg = T.gaps[g][0] - K.s; if (dg < -T.L / 2) dg += T.L; if (dg > -2 && dg < 8) K.v = Math.max(K.v, 20); }
    K.vy = 6.4 + K.v * 0.08; K.air = true; K.airT = 0; K.trickOK = true; K.y = Math.max(K.y, K.lastRampY || K.y) + 0.05;
    VIEW.fx('launch', K);
    if (K.isPlayer && !K.bot) { sfx('whoosh'); rumble(40, 0.2, 0.5); }
    else if (Math.random() < 0.55 * K.ai.skill) K.trick = 1;
  }
  K.wasRamp = K.surf === 'ramp';
  if (K.wasRamp) K.lastRampY = K.gy;
  const ground = K.gy;
  // grounded or flying
  if (K.air) {
    K.vy -= 27 * dt; K.y += K.vy * dt; K.airT += dt;
    if (K.y <= ground && K.vy <= 0) {
      const hard = -K.vy;
      K.y = ground; K.vy = 0; K.air = false;
      if (hard > 4.5 || K.airT > 0.35) {
        K.anim.squash = clamp(hard / 14, 0.15, 0.6); VIEW.fx('land', K, hard);
        if (K.isPlayer) { sfx('land', clamp(hard / 10, 0.3, 1)); rumble(clamp(hard * 6, 25, 90), clamp(hard / 14, 0.1, 0.7), 0.3); ARC.shake = Math.max(ARC.shake, clamp(hard * 0.4, 0, 5)); }
      }
      if (K.trick > 0) { K.trick = 0; K.boostT = Math.max(K.boostT, 0.9); K.boostK = 1.08; K.stats.tricks++; VIEW.fx('turbo', K, 1); if (K.isPlayer) { pop(W, 'Trick!', 'Landing boost', '#44ffa8'); sfx('turbo', 1); } }
      // a drift hop that lands while steering becomes a drift
      if (K.hopArmed) K.hopWin = 0.7;
      K.hopArmed = 0;
    }
  } else {
    if (ground < K.y - 0.6) { K.air = true; K.airT = 0; }
    else K.y = lerp(K.y, ground, Math.min(1, dt * 30));
  }
  if (K.y < ground - 0.05 && !K.air) K.y = ground;
  // fell into a gap
  if (K.surf === 'void' && K.y < K.lastGoodY - 4.5) {
    K.respawnT = 1.6; K.anim.rescue = 1; K.drift = 0; K.boostT = 0;
    let ss = K.s + 12; for (let g = 0; g < T.gaps.length; g++) { const G = T.gaps[g]; if (K.s > G[0] - 15 && K.s < G[1] + 2) ss = G[1] + 8; }
    if (K.onShort) ss = T.sc.sB + 4;
    K.safeS = ss; VIEW.fx('rescue', K);
    if (K.isPlayer) { sfx('rescue'); pop(W, 'Rescue kite!', 'Hold on tight', '#38e1ff'); rumble(60, 0.3, 0.3); }
    return;
  }
  if (!K.air && K.surf !== 'void') K.lastGoodY = K.y;
  // trick: press drift just after a launch
  if (K.air && K.trickOK && K.airT < 0.35 && K.driftHeld && !K.hopArmed && !stunned) { K.trick = 1; K.trickOK = false; if (K.isPlayer) sfx('trick'); }
  if (K.air && K.airT > 0.35) K.trickOK = false;
  // a hop that lands while drift is held turns into a drift as soon as you steer
  if (K.hopWin > 0) {
    K.hopWin -= dt;
    if (!K.driftHeld || stunned || K.air) K.hopWin = K.air ? K.hopWin : 0;
    else if (Math.abs(K.steerIn) > 0.18 && Math.abs(K.v) > 8) { K.drift = Math.sign(K.steerIn); K.driftT = 0; K.charge = 0; K.level = 0; K.hopWin = 0; K.stats.drifts++; }
  }
  // drift
  if (!K.drift && K.driftHeld && !K.dhPrev && !K.air && !stunned && W.phase === 'race' && !K.finishedLock) startDrift(W, K);
  K.dhPrev = K.driftHeld;
  if (K.drift) {
    if (!K.driftHeld) endDrift(W, K, true);
    else if (Math.abs(K.v) < 7 || stunned || (K.offT || 0) > 0.3) endDrift(W, K, false);
    else {
      K.driftT += dt;
      const into = K.steerIn * K.drift;
      K.charge += dt * (0.75 + 0.55 * clamp(into, 0, 1));
      const lv = K.charge > 2.75 ? 3 : K.charge > 1.75 ? 2 : K.charge > 0.85 ? 1 : 0;
      if (lv > K.level) { K.level = lv; VIEW.fx('sparkup', K, lv); if (K.isPlayer) { sfx('spark', lv); rumble(18, 0, 0.2 + lv * 0.1); } }
    }
  }
  K.offT = K.surf === 'off' && K.boostT <= 0 ? (K.offT || 0) + dt : 0;
  // speed
  const d = W.d;
  let top = K.top * d.speed * (K.isPlayer ? 1 : 1);
  if (K.boostT > 0) top *= 1.3 * K.boostK;
  if (K.shrinkT > 0) top *= 0.7;
  let offMul = 1;
  if (K.boostT <= 0) {
    if (K.surf === 'off') offMul = T.def.off;
    else if (K.surf === 'curb') offMul = 0.93;
    else if (K.surf === 'dirt') offMul = T.sc.mult;
  }
  top *= offMul;
  const gasOn = K.gas && !stunned && K.stall <= 0 && (W.phase === 'race' || W.phase === 'finished') && !(K.finished && !K.bot);
  if (gasOn) {
    const acc = K.acc * (K.boostT > 0 ? 2.6 : 1) * (K.v < 0 ? 2 : 1);
    if (K.v < top) K.v = Math.min(top, K.v + acc * (1 - clamp(K.v / top, 0, 1) * 0.55) * dt);
  } else if (!K.brk) K.v *= Math.exp(-0.55 * dt);
  if (K.brk && !stunned && W.phase !== 'countdown') { if (K.v > 0.5) K.v -= 26 * dt; else K.v = Math.max(-7, K.v - 9 * dt); }
  if (K.v > top) K.v = Math.max(top, K.v - (K.v - top) * 2.2 * dt - 3 * dt);
  if (stunned) K.v *= Math.exp(-2.4 * dt);
  if (K.air) K.v *= Math.exp(-0.05 * dt);
  // steering
  const sf = clamp(Math.abs(K.v) / 7, 0, 1) * (1 - 0.22 * clamp(K.v / K.top, 0, 1)) * Math.sign(K.v || 1);
  let rate;
  // computer racers keep their own steering through a drift; you steer inside the slide
  if (K.drift && !K.bot) rate = K.turn * (K.drift * 0.6 + K.steerIn * 0.48) * 1.08;
  else if (K.drift) rate = K.turn * K.steerIn * sf * 1.1;
  else rate = K.turn * K.steerIn * sf;
  if (stunned) rate = 0;
  if (K.air) rate *= 0.35;
  K.h -= rate * dt;
  // sideways slip: grip pulls it to zero, a drift lets it slide outward
  const grip = K.drift ? 2.6 : K.surf === 'off' ? 6 : 9.5;
  if (K.drift && !K.air) K.slip -= K.drift * K.v * (K.bot ? 0.05 : 0.26) * dt;
  K.slip *= Math.exp(-grip * dt);
  K.slip = clamp(K.slip, -9, 9);
  const fx = Math.sin(K.h), fz = Math.cos(K.h), rx = -fz, rz = fx;
  K.x += (fx * K.v + rx * K.slip) * dt;
  K.z += (fz * K.v + rz * K.slip) * dt;
  // walls: a soft fence at the edge of the circuit
  if (K.surf !== 'void') {
    const wall = K.onShort ? T.sc.hw + 2.2 : T.def.hw + T.def.wall;
    if (Math.abs(K.lat) > wall && !(T.def.voidOff && K.onShort)) {
      const sg = Math.sign(K.lat);
      let nx, nz;
      if (K.onShort) { const sc = T.sc, i = clamp(K.si, 0, sc.N - 1); nx = -sc.TZ[i] * sg; nz = sc.TX[i] * sg; }
      else { const i = K.hi; nx = -T.TZ[i] * sg; nz = T.TX[i] * sg; }
      const over = Math.abs(K.lat) - wall;
      K.x -= nx * over; K.z -= nz * over;
      const wvx = fx * K.v + rx * K.slip, wvz = fz * K.v + rz * K.slip, vn = wvx * nx + wvz * nz;
      if (vn > 0) {
        const nvx = wvx - nx * vn * 1.4, nvz = wvz - nz * vn * 1.4;
        K.v = (nvx * fx + nvz * fz) * 0.9; K.slip = nvx * rx + nvz * rz;
        // turn the nose away from the wall
        K.h -= sg * clamp(vn * 0.02, 0, 0.12) * (K.v >= 0 ? 1 : -1);
        if (vn > 2.5) {
          VIEW.fx('wall', K, vn);
          if (K.drift && vn > 6) endDrift(W, K, false);
          if (K.isPlayer) { sfx('wall', clamp(vn / 12, 0.3, 1)); rumble(clamp(vn * 5, 20, 90), clamp(vn / 18, 0.1, 0.7), 0.4); ARC.shake = Math.max(ARC.shake, clamp(vn * 0.5, 1, 6)); }
        }
      }
    }
  }
  // boost pads
  if (!K.air) {
    for (let i = 0; i < T.pads.length; i++) {
      const p = T.pads[i];
      if (p.onShort !== K.onShort) continue;
      let ds = K.s - p.s; if (ds > T.L / 2) ds -= T.L; if (ds < -T.L / 2) ds += T.L;
      if (Math.abs(ds) < 3 && Math.abs(K.lat - p.lat) < 2.2) {
        if (K.boostT < 0.9) { if (K.isPlayer) { sfx('boost'); rumble(60, 0.3, 0.6); } VIEW.fx('pad', K); }
        K.boostT = Math.max(K.boostT, 1.15); K.boostK = 1.1;
      }
    }
  }
  // spin and tumble animation angles
  if (K.spinT > 0) K.anim.spinYaw += K.spinDir * dt * 13 * (0.3 + K.spinT);
  else K.anim.spinYaw *= Math.exp(-dt * 10);
  if (K.tumbleT > 0) K.anim.flip = (1 - K.tumbleT / 1.25) * TAU; else K.anim.flip = 0;
  // progress round the lap
  let dsg = K.s - K.prevS;
  if (dsg < -T.L / 2) dsg += T.L; else if (dsg > T.L / 2) dsg -= T.L;
  K.totalD += dsg; K.prevS = K.s;
  if (!K.air && K.surf !== 'void' && Math.abs(K.lat) < T.def.hw) K.safeS = K.s;
}

function contacts(W, dt) {
  const ks = W.karts;
  for (let i = 0; i < ks.length; i++) {
    const A = ks[i]; if (A.respawnT > 0) continue;
    for (let j = i + 1; j < ks.length; j++) {
      const B = ks[j]; if (B.respawnT > 0) continue;
      const dx = B.x - A.x, dz = B.z - A.z, d2 = dx * dx + dz * dz;
      const ra = A.shrinkT > 0 ? 0.6 : 1.0, rb = B.shrinkT > 0 ? 0.6 : 1.0, R = ra + rb;
      if (d2 > R * R || Math.abs(A.y - B.y) > 1.4) continue;
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d, over = R - d;
      // a full-size kart squashes a shrunken one
      if (A.shrinkT > 0 && B.shrinkT <= 0) { hitKart(W, A, 'squash', B); }
      else if (B.shrinkT > 0 && A.shrinkT <= 0) { hitKart(W, B, 'squash', A); }
      const ma = A.wt * (A.boostT > 0 ? 1.6 : 1) * (A.shrinkT > 0 ? 0.3 : 1), mb = B.wt * (B.boostT > 0 ? 1.6 : 1) * (B.shrinkT > 0 ? 0.3 : 1), tot = ma + mb;
      A.x -= nx * over * mb / tot; A.z -= nz * over * mb / tot; B.x += nx * over * ma / tot; B.z += nz * over * ma / tot;
      const fa = { x: Math.sin(A.h), z: Math.cos(A.h) }, fb = { x: Math.sin(B.h), z: Math.cos(B.h) };
      const avx = fa.x * A.v - fa.z * A.slip, avz = fa.z * A.v + fa.x * A.slip, bvx = fb.x * B.v - fb.z * B.slip, bvz = fb.z * B.v + fb.x * B.slip;
      const rel = (bvx - avx) * nx + (bvz - avz) * nz;
      if (rel < 0) {
        const jimp = -(1.35) * rel / (1 / ma + 1 / mb);
        const ax = avx - nx * jimp / ma, az = avz - nz * jimp / ma, bx = bvx + nx * jimp / mb, bz = bvz + nz * jimp / mb;
        A.v = ax * fa.x + az * fa.z; A.slip = ax * -fa.z + az * fa.x;
        B.v = bx * fb.x + bz * fb.z; B.slip = bx * -fb.z + bz * fb.x;
        const k = clamp(-rel / 10, 0, 1);
        if (k > 0.2) {
          VIEW.fx('bump', A, B, k);
          if (A.isPlayer || B.isPlayer) { sfx('bump', clamp(k, 0.3, 1)); rumble(clamp(k * 70, 15, 70), k * 0.5, 0.5); ARC.shake = Math.max(ARC.shake, k * 4); }
          A.anim.react = Math.max(A.anim.react, 0.4 * k); B.anim.react = Math.max(B.anim.react, 0.4 * k); A.anim.reactK = B.anim.reactK = A.anim.reactK || 'bump';
        }
      }
    }
  }
}

function stepObjects(W, dt) {
  const T = W.T;
  for (let i = W.objs.length - 1; i >= 0; i--) {
    const o = W.objs[i]; o.t += dt;
    if (o.type === 'peel') {
      o.vy -= 22 * dt; o.y += o.vy * dt; o.x += o.vx * dt; o.z += o.vz * dt;
      const loc = locate(T, o);
      if (o.y <= loc.gy) { o.y = loc.gy; o.vy = 0; o.vx *= Math.exp(-6 * dt); o.vz *= Math.exp(-6 * dt); }
      if (loc.surf === 'void' && o.y < -5) { W.objs.splice(i, 1); continue; }
      let gone = o.t > 45;
      for (let k = 0; k < W.karts.length && !gone; k++) {
        const K = W.karts[k];
        if (K === o.owner && o.t < 0.8) continue;
        if (K.air && K.y > o.y + 0.8) continue;
        const dx = K.x - o.x, dz = K.z - o.z;
        if (dx * dx + dz * dz < (K.shrinkT > 0 ? 0.9 : 1.4)) { hitKart(W, K, 'peel', o.owner); gone = true; VIEW.fx('peelhit', o); }
      }
      if (gone) W.objs.splice(i, 1);
    } else if (o.type === 'rocket') {
      // the paper rocket follows the road and swings in on its target
      o.s += o.v * dt;
      let tgtLat = 0, lead = 99;
      if (o.target && !o.target.finished && o.target.respawnT <= 0) {
        lead = o.target.s - o.s; if (lead < -T.L / 2) lead += T.L; if (lead > T.L / 2) lead -= T.L;
        tgtLat = o.target.lat;
      }
      const near = o.target ? Math.hypot(o.target.x - o.x, o.target.z - o.z) : 99;
      o.dist = near;
      if (o.target && near < 14) {
        const ang = Math.atan2(o.target.x - o.x, o.target.z - o.z);
        o.h += wrapA(ang - o.h) * Math.min(1, dt * 10);
        o.x += Math.sin(o.h) * o.v * dt; o.z += Math.cos(o.h) * o.v * dt;
        const m = nearestPath(T, o.x, o.z, o.hi, true); o.hi = m.i; o.s = m.along; o.lat = m.lat;
        o.y += ((o.target.y + 0.7) - o.y) * Math.min(1, dt * 8);
      } else {
        o.lat += (tgtLat - o.lat) * Math.min(1, dt * (lead < 60 ? 2.5 : 0.8));
        posAt(T, o.s, o.lat, 0, FR_TMP);
        o.h = Math.atan2(FR_TMP.x - o.x, FR_TMP.z - o.z) || o.h;
        o.x = FR_TMP.x; o.z = FR_TMP.z; o.y += ((FR_TMP.y + 1.0) - o.y) * Math.min(1, dt * 6);
      }
      VIEW.fx('rocketTrail', o);
      let gone = o.t > 7;
      for (let k = 0; k < W.karts.length && !gone; k++) {
        const K = W.karts[k];
        if (K === o.owner && o.t < 0.6) continue;
        const dx = K.x - o.x, dz = K.z - o.z, dy = K.y + 0.6 - o.y;
        if (dx * dx + dz * dz + dy * dy < 2.4) { hitKart(W, K, 'rocket', o.owner); gone = true; VIEW.fx('boom', o); }
      }
      for (let k = W.objs.length - 1; k >= 0 && !gone; k--) {
        const p = W.objs[k]; if (p.type !== 'peel') continue;
        if ((p.x - o.x) * (p.x - o.x) + (p.z - o.z) * (p.z - o.z) < 2) { W.objs.splice(k, 1); if (k < i) i--; gone = true; VIEW.fx('boom', o); }
      }
      if (gone) { const idx = W.objs.indexOf(o); if (idx >= 0) W.objs.splice(idx, 1); }
    }
  }
}

function stepHazards(W, dt) {
  const T = W.T;
  for (let i = 0; i < W.haz.length; i++) {
    const h = W.haz[i];
    if (h.k === 'ball') { const old = h.lat; placeHaz(W, h, W.t); h.spin += (h.lat - old) / h.r; }
    for (let k = 0; k < W.karts.length; k++) {
      const K = W.karts[k]; if (K.respawnT > 0) continue;
      const dx = K.x - h.x, dz = K.z - h.z, d2 = dx * dx + dz * dz;
      if (h.k === 'puddle') {
        let ds = K.s - h.s; if (ds > T.L / 2) ds -= T.L; if (ds < -T.L / 2) ds += T.L;
        if (Math.abs(ds) < 4.2 && Math.abs(K.lat - h.lat) < 2.6 && !K.air) {
          if (K.boostT <= 0) K.v *= Math.exp(-0.5 * dt);
          if (Math.abs(K.v) > 9) { K.slip += (Math.random() - 0.5) * 18 * dt; VIEW.fx('splash', K); if (K.isPlayer && (!K.wetT || W.t - K.wetT > 0.5)) { K.wetT = W.t; sfx('splash', clamp(K.v / 25, 0.3, 1)); rumble(35, 0.1, 0.4); } }
        }
        continue;
      }
      const R = h.r + (K.shrinkT > 0 ? 0.6 : 0.95);
      if (d2 < R * R && Math.abs(K.y - (h.y - (h.k === 'ball' ? h.r : 0))) < 2.5) {
        if (h.k === 'heap') { if (K.sneezeT <= 0 && !K.air) { K.sneezeT = 2.5; hitKart(W, K, 'sneeze', null); VIEW.fx('spice', h, K); } continue; }
        const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
        K.x = h.x + nx * R; K.z = h.z + nz * R;
        const fx = Math.sin(K.h), fz = Math.cos(K.h), wvx = fx * K.v - fz * K.slip, wvz = fz * K.v + fx * K.slip, vn = wvx * nx + wvz * nz;
        if (vn < 0) {
          const bx = wvx - nx * vn * 1.6, bz = wvz - nz * vn * 1.6;
          K.v = (bx * fx + bz * fz) * 0.8; K.slip = bx * -fz + bz * fx;
          if (h.k === 'ball' && -vn > 3) hitKart(W, K, 'ball', null);
          else if (-vn > 3) { VIEW.fx('wall', K, -vn); if (K.isPlayer) { sfx('wall', 0.6); rumble(40, 0.3, 0.3); ARC.shake = Math.max(ARC.shake, 3); } }
          if (h.k === 'sack' && -vn > 3) VIEW.fx('spice', h, K);
        }
      }
    }
  }
}

function stepBoxes(W, dt) {
  for (let i = 0; i < W.boxes.length; i++) {
    const b = W.boxes[i];
    if (!b.on) { b.t -= dt; if (b.t <= 0) { b.on = true; VIEW.fx('boxback', b); } continue; }
    for (let k = 0; k < W.karts.length; k++) {
      const K = W.karts[k]; if (K.respawnT > 0) continue;
      const dx = K.x - b.x, dz = K.z - b.z, dy = K.y + 0.5 - b.y;
      if (dx * dx + dz * dz < 3.1 && Math.abs(dy) < 1.8) {
        b.on = false; b.t = 1.2; VIEW.fx('box', b, K);
        K.stats.boxes++;
        if (!K.item && K.roulT <= 0) { K.roulPick = rollItem(W, K); K.roulT = K.isPlayer ? 1.1 : 0.7; }
        if (K.isPlayer) { sfx('box'); rumble(25, 0, 0.35); }
        break;
      }
    }
  }
}

function rankKarts(W) {
  const ord = W.karts.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finT - b.finT;
    if (a.finished) return -1; if (b.finished) return 1;
    return b.totalD - a.totalD;
  });
  ord.forEach((K, i) => {
    const np = i + 1;
    if (K.isPlayer && W.phase === 'race' && K.place && np < K.place && W.raceT > 2) { K.stats.overtakes++; }
    K.place = np;
  });
  W.order = ord;
}

function stepWorld(W, dtIn) {
  const dt = dtIn * W.slowK;
  W.t += dt;
  const P = W.P;
  if (W.phase === 'countdown') {
    const before = W.cd; W.cd -= dt;
    [3, 2, 1].forEach((n) => { if (before > n - 0.4 && W.cd <= n - 0.4) { sfx('beep', 1); rumble(20, 0, 0.2); } });
    // rocket start: throttle held from the last light
    if (P.gas && W.cd > 1.4 && !P.bot) W.rocketStart = -1;
    if (P.gas && W.cd < 0.55 && W.rocketStart === 0) W.rocketStart = 1;
    if (!P.gas && W.cd < 0.55 && W.rocketStart === 1) W.rocketStart = 0;
    if (W.cd <= 0) {
      W.phase = 'race'; W.started = true; W.raceT = 0; sfx('beep', 2); rumble(60, 0.4, 0.4);
      banner(W, 'GO!', '', 1.0);
      W.karts.forEach((K) => { K.lap = 0; K.lapT0 = 0; });
      if (W.rocketStart === 1) { P.boostT = 1.2; P.boostK = 1.1; pop(W, 'Rocket start!', 'Perfect launch', '#44ffa8', true); VIEW.fx('turbo', P, 2); sfx('turbo', 2); rumble(120, 0.6, 0.6); }
      else if (W.rocketStart === -1 && !P.bot) { P.stall = 0.7; pop(W, 'Too early!', 'Wheelspin', '#ff6940'); VIEW.fx('stall', P); }
      W.karts.forEach((K) => { if (!K.isPlayer && Math.random() < 0.25 + 0.4 * (W.d.ai - 0.85) * 4) { K.boostT = 0.9; K.boostK = 1.05; } });
    }
  }
  const racing = W.phase === 'race' || W.phase === 'finished';
  if (racing) W.raceT += dt;
  // controls
  for (let i = 0; i < W.karts.length; i++) {
    const K = W.karts[i];
    if (K.bot || K.finished) { const use = aiDrive(W, K, dt); if (use && racing) useItem(W, K); }
    else if (K.isPlayer && W.phase === 'countdown') { K.driftHeld = false; }
  }
  if (W.phase === 'countdown' || W.phase === 'intro') { W.karts.forEach((K) => { K.v = 0; K.slip = 0; }); return; }
  for (let i = 0; i < W.karts.length; i++) stepKart(W, W.karts[i], dt);
  contacts(W, dt);
  stepObjects(W, dt);
  stepHazards(W, dt);
  stepBoxes(W, dt);
  if (W.cutT > 0) { W.cutT -= dt; if (W.cutT <= 0) W.cut = null; }
  // laps
  const T = W.T;
  for (let i = 0; i < W.karts.length; i++) {
    const K = W.karts[i];
    if (K.finished || W.attract) continue;
    const lap = Math.floor(K.totalD / T.L);
    if (lap > K.lap) {
      const lt = W.raceT - K.lapT0; K.lapT0 = W.raceT;
      if (lap >= 1) { K.laps.push(lt); if (K.stats.bestLap == null || lt < K.stats.bestLap) K.stats.bestLap = lt; }
      K.lap = lap;
      if (lap >= LAPS) { finishKart(W, K); continue; }
      if (K.isPlayer && lap >= 1) {
        if (lap === LAPS - 1) { W.finalLap = true; banner(W, 'FINAL LAP', '', 2.2); sfx('final'); rumble(80, 0.4, 0.6); }
        else { banner(W, 'LAP ' + (lap + 1) + ' / ' + LAPS, fmtTime(lt), 1.6); sfx('lap'); }
      }
    }
  }
  rankKarts(W);
  // ghost recording
  if (W.rec && !P.finished) {
    W.recT += dt;
    while (W.recT >= W.rec.dt) { W.recT -= W.rec.dt; W.rec.x.push(+P.x.toFixed(2)); W.rec.z.push(+P.z.toFixed(2)); W.rec.y.push(+P.y.toFixed(2)); W.rec.h.push(+P.h.toFixed(3)); }
  }
  // wrong way
  if (!P.finished && !W.attract) {
    const fh = T.HD[P.hi], back = Math.cos(wrapA(P.h - fh)) < -0.3 && P.v > 3;
    W.wrongT = back ? W.wrongT + dt : 0;
  }
  if (W.phase === 'finished') {
    W.finWait += dtIn;
    const all = W.karts.every((K) => K.finished);
    if (all || W.finWait > 9) endRace(W);
  }
}
function finishKart(W, K) {
  K.finished = true; K.finT = W.raceT; K.bot = true;
  if (K.isPlayer) {
    W.phase = 'finished'; W.finWait = 0;
    const place = W.order ? W.order.filter((o) => o.finished && o !== K).length + 1 : 1;
    K.place = place;
    // photo finish: someone within a car length
    let close = false;
    W.karts.forEach((o) => { if (o !== K && ((o.finished && W.raceT - o.finT < 0.35) || (!o.finished && K.totalD - o.totalD < 5))) close = true; });
    if (close && W.cfg.mode !== 'time') { W.photo = { t: 0 }; W.slowT = 2.0; W.slowK = 0.22; banner(W, 'PHOTO FINISH', '', 2.4); }
    else { W.slowT = 0.9; W.slowK = 0.45; banner(W, W.cfg.mode === 'time' ? 'FINISH' : place === 1 ? 'YOU WIN!' : ordinal(place) + ' PLACE', fmtTime(K.finT), 2.6); }
    sfx('finish'); if (place <= 3) sfx('cheer');
    rumble(place === 1 ? 260 : 120, place <= 3 ? 1 : 0.5, 0.7, place <= 3 ? 'success' : 'fail');
    K.anim.cele = place <= 3 ? 1 : 0.4;
    VIEW.fx('finish', K, place);
  } else if (K.place <= 3) K.anim.cele = 1;
}
function endRace(W) {
  if (W.results) return;
  // karts still racing are placed by how far they got, with a time estimated from their pace
  const ord = W.karts.slice().sort((a, b) => (a.finished && b.finished) ? a.finT - b.finT : a.finished ? -1 : b.finished ? 1 : b.totalD - a.totalD);
  ord.forEach((K) => {
    if (!K.finished) {
      const left = LAPS * W.T.L - K.totalD, pace = Math.max(8, K.top * W.d.speed * 0.8);
      K.finT = W.raceT + left / pace; K.finished = true;
    }
  });
  ord.sort((a, b) => a.finT - b.finT);
  W.results = ord.map((K, i) => ({ id: K.c.id, name: K.c.name, you: K.isPlayer, time: K.finT, place: i + 1, pts: PTS[i] || 0, best: K.stats.bestLap }));
  W.phase = 'results'; W.contT = 0; W.pops = []; W.banner = null; W.bannerT = 0;
  const me = W.results.find((r) => r.you);
  if (me && GP) {
    W.results.forEach((r) => { GP.points[r.id] = (GP.points[r.id] || 0) + r.pts; });
    GP.log.push({ track: W.T.id, place: me.place });
  }
  if (W.cfg.mode === 'time') {
    const best = SAVE.best[W.T.id];
    const t = W.P.finT;
    W.ttNew = !best || !best.tt || t < best.tt;
    if (W.ttNew) {
      SAVE.best[W.T.id] = Object.assign({}, best || {}, { tt: t });
      if (W.rec && W.rec.x.length > 10) ARC.store.set(ghostKey(W.T.id), { char: W.P.c.id, dt: W.rec.dt, x: W.rec.x, z: W.rec.z, y: W.rec.y, h: W.rec.h, t });
    }
  } else if (me) {
    const best = SAVE.best[W.T.id] || {};
    if (!best.place || me.place < best.place) best.place = me.place;
    if (!best.time || me.time < best.time) best.time = me.time;
    SAVE.best[W.T.id] = best;
  }
  SAVE.races++;
  saveGame();
}

/* ------------------------------------------------------------ scores */
function raceScore(W) {
  const P = W.P, me = W.results ? W.results.find((r) => r.you) : null, d = W.d;
  if (W.cfg.mode === 'time') return Math.round(400000 / Math.max(20, P.finT) * d.mul);
  const place = me ? me.place : 8;
  return Math.round(((9 - place) * 120 + P.stats.turbos * 6 + P.stats.hits * 25 + P.stats.tricks * 10) * d.mul);
}

/* ================================================================ the 3D view */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _c = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const V = { x: 0, y: 0, z: 0 };

// Bake a primitive: place it, give it one vertex colour, drop uvs so a whole model merges into one mesh.
function prep(geo, hex, pos, rot, scl, keepUv) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!keepUv && g.attributes.uv) g.deleteAttribute('uv');
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
function mergeG(list, withUv) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = withUv ? new Float32Array(n * 2) : null;
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const boxG = (w, h, d, hex, pos, rot) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot);
const cylG = (rt, rb, h, seg, hex, pos, rot, scl) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, scl);
const sphG = (r, hex, pos, scl, ws, hs) => prep(new THREE.SphereGeometry(r, ws || 12, hs || 8), hex, pos, null, scl);
const sphR = (r, hex, pos, rot, scl) => prep(new THREE.SphereGeometry(r, 10, 7), hex, pos, rot, scl);
const capG = (r, len, hex, pos, rot, scl) => prep(new THREE.CapsuleGeometry(r, len, 3, 8), hex, pos, rot, scl);
const torG = (r, t, hex, pos, rot, scl) => prep(new THREE.TorusGeometry(r, t, 6, 16), hex, pos, rot, scl);
function limbG(a, b, r, hex, cap, r2) {
  _v1.set(a[0], a[1], a[2]); _v2.set(b[0], b[1], b[2]);
  const len = _v1.distanceTo(_v2);
  const g = cap ? new THREE.CapsuleGeometry(r, Math.max(0.01, len), 3, 8) : new THREE.CylinderGeometry(r2 == null ? r : r2, r, len, 8);
  const gg = g.index ? g.toNonIndexed() : g; if (gg !== g) g.dispose();
  if (gg.attributes.uv) gg.deleteAttribute('uv');
  _v3.subVectors(_v2, _v1).normalize();
  _q.setFromUnitVectors(_up, _v3);
  _p3.addVectors(_v1, _v2).multiplyScalar(0.5);
  _m4.compose(_p3, _q, _s3.set(1, 1, 1)); gg.applyMatrix4(_m4);
  return prep(gg, hex);
}

/* ------------------------------------------------------------ textures */
let RENDERER = null, TEX_ANISO = 4;
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
function vnoise(seed, cells) {
  const r = rng(seed), G = new Float32Array(cells * cells); for (let i = 0; i < G.length; i++) G[i] = r();
  const g = (i, j) => G[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
  return (u, v) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
  };
}
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
// a grey roughness map: dark is glossy (wet), light is matt
function roughTex(size, hf, rep) {
  return canvasTex(size, size, (g) => {
    const im = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const v = clamp(hf(x / size, y / size), 0, 1) * 255, o = (y * size + x) * 4; im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255; }
    g.putImageData(im, 0, 0);
  }, { data: true, repeat: rep });
}

let TX = null;
function textures() {
  if (TX) return TX;
  TX = {};
  const lanes = (g, w, h, edge) => {
    g.fillStyle = edge; g.fillRect(14, 0, 10, h); g.fillRect(w - 24, 0, 10, h);
    g.fillStyle = 'rgba(255,255,255,.18)'; for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 4, y + 20, 8, 70);
  };
  // fairground tarmac
  TX.asphalt = canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#47464c', 0.24, 30000, 3, 2);
    const r = rng(11);
    for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(15,15,18,' + (0.05 + r() * 0.08) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 30, 20 + r() * 60, r() * 3, 0, TAU); g.fill(); }
    [0.3, 0.7].forEach((u) => { const gr = g.createLinearGradient(u * w - 46, 0, u * w + 46, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u * w - 46, 0, 92, h); });
    lanes(g, w, h, 'rgba(240,236,226,.85)');
  });
  // wet hill road
  TX.wet = canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#3a3c3f', 0.1, 20000, 13, 2);
    const r = rng(17);
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(10,12,14,' + (0.04 + r() * 0.06) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 14 + r() * 40, 30 + r() * 80, r() * 3, 0, TAU); g.fill(); }
    lanes(g, w, h, 'rgba(250,214,90,.82)');
  });
  const wn = vnoise(41, 16), wn2 = vnoise(43, 5);
  TX.wetR = roughTex(256, (u, v) => 0.22 + 0.55 * smooth01(wn2(u, v) * 0.7 + wn(u, v) * 0.3), [1, 1]);
  // painted roof slabs
  TX.slab = canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#c8826a', 0.08, 9000, 23, 2);
    const r = rng(29);
    // big square roof tiles, each a slightly different fired colour
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { const k = r(); g.fillStyle = 'rgba(' + (k < 0.5 ? '120,60,40,' : '255,230,200,') + (0.04 + r() * 0.08) + ')'; g.fillRect(x + 2, y + 2, 60, 60); }
    g.fillStyle = 'rgba(245,228,205,.55)';
    for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 3);
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(90,50,30,' + r() * 0.12 + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 20, r() * 3, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,248,230,.8)'; g.fillRect(14, 0, 9, h); g.fillRect(w - 23, 0, 9, h);
  });
  TX.planks = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#8a5a34', 0.25, 6000, 31, 2);
    for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(40,22,10,.6)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(255,220,170,.08)'; g.fillRect(0, y + 4, w, 6); }
  });
  const an = vnoise(5, 64), an2 = vnoise(9, 16);
  TX.roadN = normalTex(256, (u, v) => an(u, v) * 0.6 + an2(u, v) * 0.4, 3, [1, 1]);
  TX.slabN = normalTex(256, (u, v) => an(u, v) * 0.25 + ((Math.abs(((v * 8) % 1) - 0.5) > 0.47 || Math.abs(((u * 8) % 1) - 0.5) > 0.47) ? -0.5 : 0), 2.5, [1, 1]);
  // curbs
  const curb = (a, b) => canvasTex(64, 128, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * 32, w, 32); } noiseFill(g, 0, 0, 'rgba(0,0,0,0)', 0, 0, 1, 1); });
  TX.curbFair = curb('#d8262e', '#f4f1ea'); TX.curbHill = curb('#f2c230', '#2b2d33'); TX.curbRoof = curb('#ff7a1a', '#fff2dc');
  // ground
  TX.grass = canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#bdbdbd', 0.34, 24000, 21, 3);
    const r = rng(4);
    for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.04 + r() * 0.1) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 16, 2 + r() * 9, r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 900; i++) { g.strokeStyle = 'rgba(255,255,255,' + (0.05 + r() * 0.12) + ')'; g.lineWidth = 1; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 5, y - 3 - r() * 8); g.stroke(); }
  });
  const gn = vnoise(13, 24);
  TX.grassN = normalTex(256, (u, v) => gn(u, v), 4, [1, 1]);
  TX.dirt = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, '#8a6a46', 0.3, 12000, 61, 3); const r = rng(62); for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(40,25,10,' + r() * 0.2 + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 4 + r() * 18, 2 + r() * 6, r() * 3, 0, TAU); g.fill(); } });
  TX.street = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, '#5a524c', 0.28, 9000, 71, 3); g.fillStyle = 'rgba(255,240,200,.5)'; for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y, 6, 30); });
  // walls and buildings
  TX.plaster = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#ece2cf', 0.18, 7000, 41, 3);
    const r = rng(42);
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(120,90,60,' + r() * 0.12 + ')'; g.fillRect(r() * w, 0, 6 + r() * 20, h); }
    g.fillStyle = '#4a3a30'; g.fillRect(30, 60, 50, 70); g.fillRect(150, 60, 50, 70); g.fillRect(90, 170, 46, 70);
    g.fillStyle = '#2a7f8a'; g.fillRect(26, 56, 6, 78); g.fillRect(78, 56, 6, 78); g.fillRect(146, 56, 6, 78); g.fillRect(198, 56, 6, 78);
    g.fillStyle = 'rgba(255,190,110,.55)'; g.fillRect(34, 66, 42, 26); g.fillRect(154, 100, 42, 26);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 0, w, 10);
  });
  TX.windowsLit = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb35c'; g.fillRect(34, 66, 42, 26); g.fillRect(154, 100, 42, 26); g.fillStyle = '#ffd08a'; g.fillRect(94, 176, 38, 30);
  });
  TX.stone = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#6f6a62'; g.fillRect(0, 0, w, h);
    const r = rng(51);
    for (let y = 0; y < h; y += 26) for (let x = -(y % 52); x < w; x += 46) { const c = 90 + Math.floor(r() * 50); g.fillStyle = 'rgb(' + c + ',' + (c - 4) + ',' + (c - 10) + ')'; g.fillRect(x + 2, y + 2, 42, 22); }
    noiseFill(g, 0, 0, 'rgba(0,0,0,0)', 0, 0, 1, 1);
  });
  TX.stoneN = normalTex(128, (u, v) => (Math.abs(((v * 5) % 1) - 0.5) > 0.44 || Math.abs((((u * 5.5) + (Math.floor(v * 5) % 2) * 0.5) % 1) - 0.5) > 0.45 ? 0 : 0.6) + an(u, v) * 0.3, 3, [1, 1]);
  // glow sprite, mist, falls
  TX.glow = canvasTex(128, 128, (g, w) => { softBlob(g, w / 2, w / 2, w / 2, 'rgba(255,255,255,A)', 1); }, { clamp: true });
  TX.falls = canvasTex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); const r = rng(19);
    for (let i = 0; i < 300; i++) { const x = r() * w, y = r() * h, l = 30 + r() * 120; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(235,245,255,' + (0.3 + r() * 0.5) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, 1 + r() * 3, l); g.fillRect(x, y - h, 1 + r() * 3, l); }
  });
  // the start gantry banner
  TX.banner = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#c2272d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f5efe3'; g.fillRect(i * 32, j * 14, 32, 14); g.fillRect(i * 32, h - 28 + j * 14, 32, 14); }
    g.fillStyle = '#ffd23f'; g.font = 'bold 58px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('KART  MELA', w / 2, h / 2 + 2);
  }, { clamp: true });
  TX.checker = canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#141414' : '#f5efe3'; g.fillRect(i * 16, j * 16, 16, 16); } });
  // boost pad arrows
  TX.pad = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#2a1500'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const y = i * 64; g.fillStyle = i % 2 ? '#ffb736' : '#ff6a1a'; g.beginPath(); g.moveTo(10, y + 56); g.lineTo(w / 2, y + 12); g.lineTo(w - 10, y + 56); g.lineTo(w - 34, y + 56); g.lineTo(w / 2, y + 34); g.lineTo(34, y + 56); g.closePath(); g.fill(); }
  });
  // item box faces: a rainbow with a bold glyph
  TX.box = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); ['#ff4f9a', '#ffb736', '#44ffa8', '#38c8ff', '#9b6bff'].forEach((c, i) => gr.addColorStop(i / 4, c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(6, 6, w - 12, h - 12);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff'; g.font = 'bold 84px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, h / 2 + 4);
  }, { clamp: true });
  // striped canopy and tent cloth
  TX.stripes = canvasTex(256, 64, (g, w, h) => { const c = ['#e8452c', '#fff2dc', '#ffb736', '#fff2dc', '#2d7fd1', '#fff2dc']; for (let i = 0; i < 12; i++) { g.fillStyle = c[i % c.length]; g.fillRect(i * w / 12, 0, w / 12 + 1, h); } });
  // Both noise fields are built once, not once per pixel: building them inside the callback made
  // 65,536 pairs of them (and ~70 million random draws), the bulk of this game's start-up time.
  const wa = vnoise(77, 32), wb = vnoise(78, 8);
  TX.water = normalTex(256, (u, v) => wa(u, v) * 0.6 + wb(u, v) * 0.4, 2.2, [6, 6]);
  return TX;
}

/* ------------------------------------------------------------ particles */
let FX = null;
function makePool(n, additive, kind) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  let shape;
  if (kind === 'square') shape = 'if (abs(p.x) > 0.42 || abs(p.y) > 0.26) discard; float a = vA;';
  else if (kind === 'streak') shape = 'if (abs(p.x) > 0.05) discard; float a = vA * (1.0 - abs(p.y) * 2.0);';
  else shape = 'float d = length(p); if (d > 0.5) discard; float a = vA * ' + (additive ? 'pow(1.0 - d * 2.0, 1.6)' : 'smoothstep(0.5, 0.12, d)') + ';';
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uGain: { value: additive ? 2.2 : 1 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;' +
      'void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uGain; varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; ' + shape + ' gl_FragColor = vec4(vC * uGain, a); }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  return { n, pos, col, size, alpha, geo, mat, pts, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s0: new Float32Array(n), grow: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), a0: new Float32Array(n), spin: new Float32Array(n), head: 0, kind };
}
function createFX(scene) {
  const F = { add: makePool(900, true), soft: makePool(700, false), conf: makePool(420, false, 'square'), rain: makePool(700, false, 'streak'), density: 1 };
  scene.add(F.add.pts, F.soft.pts, F.conf.pts, F.rain.pts);
  F.emit = (pool, x, y, z, vx, vy, vz, life, size, hex, alpha, grav, drag, grow) => {
    const P = F[pool]; const i = P.head; P.head = (P.head + 1) % P.n;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    _c.set(hex); P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b;
    P.life[i] = life; P.max[i] = life; P.s0[i] = size; P.size[i] = size; P.a0[i] = alpha; P.alpha[i] = alpha;
    P.grav[i] = grav || 0; P.drag[i] = drag || 0; P.grow[i] = grow || 0; P.spin[i] = Math.random() * 6;
  };
  F.update = (dt, scale) => {
    ['add', 'soft', 'conf', 'rain'].forEach((k) => {
      const P = F[k]; P.mat.uniforms.uScale.value = scale;
      let any = false;
      for (let i = 0; i < P.n; i++) {
        if (P.life[i] <= 0) { if (P.alpha[i] !== 0 || P.size[i] !== 0) { P.alpha[i] = 0; P.size[i] = 0; any = true; } continue; }
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
  F.clear = () => { ['add', 'soft', 'conf', 'rain'].forEach((k) => { F[k].life.fill(0); }); };
  return F;
}
const fxOK = () => FX && R3 && !R3.lost;
const rnd = (a) => (Math.random() - 0.5) * a;
function sparkBurst(x, y, z, n, spread, up, hex) {
  if (!fxOK()) return;
  for (let i = 0; i < n * FX.density; i++) FX.emit('add', x, y, z, rnd(spread), Math.random() * up, rnd(spread), 0.25 + Math.random() * 0.35, 0.09 + Math.random() * 0.07, hex || (Math.random() < 0.5 ? '#ffd27a' : '#ff8a3a'), 1, 9, 1.2, 0);
}
function smokePuff(x, y, z, n, hex, size, life) {
  if (!fxOK()) return;
  for (let i = 0; i < n * FX.density; i++) FX.emit('soft', x + rnd(0.6), y, z + rnd(0.6), rnd(2), 0.6 + Math.random() * 1.6, rnd(2), (life || 1) * (0.7 + Math.random() * 0.6), size || 0.9, hex, 0.55, -0.3, 1.3, 2.2);
}
function confettiAt(x, y, z, n, spread) {
  if (!fxOK()) return;
  const cols = ['#ff6940', '#ffb736', '#44ffa8', '#38e1ff', '#e94f8a', '#f5efe3', '#9b6bff', '#ff9a1f'];
  for (let i = 0; i < n * FX.density; i++) FX.emit('conf', x + rnd(spread), y + Math.random() * 3, z + rnd(spread), rnd(6), Math.random() * 5, rnd(6), 3 + Math.random() * 1.5, 0.24, cols[i % cols.length], 1, 2.2, 0.9, 0);
}
const SPARK_COL = ['#ffffff', '#3fa9ff', '#ff9a1f', '#ff4fd8'];
// world point in a kart's own model frame (x to the kart's left, y up, z forward)
function kartPoint(K, lx, ly, lz, out) {
  const fx = Math.sin(K.h), fz = Math.cos(K.h);
  out.x = K.x + fx * lz + fz * lx;
  out.z = K.z + fz * lz - fx * lx;
  out.y = K.y + ly;
  return out;
}

// The rules call VIEW.fx; this is where those moments become sparks, dust and flashes.
const VIEW3D = {
  three: true,
  fx(kind, a, b, c) {
    if (!fxOK()) return;
    const W = Wd;
    switch (kind) {
      case 'turbo': {
        const lv = b || 1; kartPoint(a, 0, 0.6, -1.3, V);
        for (let i = 0; i < 14 * lv * FX.density; i++) FX.emit('add', V.x, V.y, V.z, rnd(3), Math.random() * 2, rnd(3), 0.35 + Math.random() * 0.3, 0.25, SPARK_COL[lv], 1, 0, 2, 1);
        FX.emit('add', V.x, V.y, V.z, 0, 0, 0, 0.2, 1.6 + lv * 0.4, SPARK_COL[lv], 0.8, 0, 0, 1.2);
        if (a.isPlayer) R3.fovKick = Math.max(R3.fovKick, 6 + lv * 3);
        break;
      }
      case 'sparkup': { kartPoint(a, 0, 0.3, -1.0, V); sparkBurst(V.x, V.y, V.z, 10, 4, 3, SPARK_COL[b]); break; }
      case 'hit': {
        kartPoint(a, 0, 0.9, 0, V);
        if (b === 'rocket') { sparkBurst(V.x, V.y, V.z, 26, 8, 6, '#fff3d6'); FX.emit('add', V.x, V.y, V.z, 0, 0, 0, 0.25, 3.6, '#ffd27a', 1, 0, 0, 1.5); smokePuff(V.x, V.y, V.z, 8, '#d8d2c8', 1.4, 1.4); }
        else if (b === 'sneeze') { smokePuff(V.x, V.y + 0.3, V.z, 10, '#e8452c', 1.0, 1.2); }
        else { for (let i = 0; i < 8; i++) FX.emit('add', V.x + rnd(1), V.y + 0.6 + Math.random() * 0.4, V.z + rnd(1), rnd(1), 1.5, rnd(1), 0.9, 0.22, '#ffe066', 1, 1, 1, 0); }
        break;
      }
      case 'block': { kartPoint(a, 0, 0.9, 0, V); for (let i = 0; i < 24 * FX.density; i++) FX.emit('conf', V.x, V.y, V.z, rnd(8), Math.random() * 5, rnd(8), 1.8, 0.2, i % 2 ? '#ff9a1f' : '#ffd23f', 1, 4, 1, 0); break; }
      case 'shield': { kartPoint(a, 0, 1, 0, V); FX.emit('add', V.x, V.y, V.z, 0, 0, 0, 0.35, 3, '#ffb736', 0.6, 0, 0, 1); break; }
      case 'chai': { kartPoint(a, 0, 1.4, 0.3, V); smokePuff(V.x, V.y, V.z, 6, '#f4ece0', 0.7, 0.9); if (a.isPlayer) R3.fovKick = Math.max(R3.fovKick, 10); break; }
      case 'land': { kartPoint(a, 0, 0.1, 0, V); smokePuff(V.x, V.y, V.z, 6 + (b > 8 ? 6 : 0), W.T.def.id === 'roof' ? '#d9b08a' : W.T.def.id === 'hill' ? '#c9d2d6' : '#a08060', 1.1, 0.9); break; }
      case 'launch': { kartPoint(a, 0, 0.2, -0.8, V); sparkBurst(V.x, V.y, V.z, 8, 3, 2); break; }
      case 'wall': { kartPoint(a, Math.sign(a.lat || 1) * -0.9, 0.4, 0.6, V); sparkBurst(V.x, V.y, V.z, clamp(b * 1.5, 4, 22), 5, 3); break; }
      case 'bump': { V.x = (a.x + b.x) / 2; V.y = (a.y + b.y) / 2 + 0.6; V.z = (a.z + b.z) / 2; sparkBurst(V.x, V.y, V.z, 6 + 14 * c, 5, 3, '#ffe9b0'); FX.emit('add', V.x, V.y, V.z, 0, 0, 0, 0.15, 1 + c, '#fff3d6', 0.8, 0, 0, 1.3); break; }
      case 'pad': { kartPoint(a, 0, 0.3, -1.2, V); for (let i = 0; i < 10 * FX.density; i++) FX.emit('add', V.x, V.y, V.z, rnd(2), Math.random() * 2, rnd(2), 0.4, 0.3, '#ff9a1f', 1, 0, 2, 1); if (a.isPlayer) R3.fovKick = Math.max(R3.fovKick, 8); break; }
      case 'splash': { if (Math.random() > 0.35 * FX.density) break; kartPoint(a, rnd(1.6), 0.15, -0.6, V); FX.emit('soft', V.x, V.y, V.z, rnd(3), 2 + Math.random() * 2.5, rnd(3), 0.6, 0.45, '#dfeaf2', 0.6, 9, 0.6, 1.5); if (a.isPlayer && Math.random() < 0.3) R3.drops = Math.min(1, R3.drops + 0.25); break; }
      case 'spice': { const cols = ['#e8452c', '#ffc531', '#ff7a1a', '#c0392b']; const col = cols[(a.i || 0) % 4]; for (let i = 0; i < 18 * FX.density; i++) FX.emit('soft', a.x + rnd(1.5), (a.y || 0) + 0.6, a.z + rnd(1.5), rnd(4), 1 + Math.random() * 2.5, rnd(4), 1.6, 1.0, col, 0.7, -0.2, 1.4, 2.6); break; }
      case 'box': { sparkBurst(a.x, a.y, a.z, 16, 6, 4, '#ffffff'); FX.emit('add', a.x, a.y, a.z, 0, 0, 0, 0.25, 2.4, '#b8e6ff', 0.9, 0, 0, 1.2); for (let i = 0; i < 10 * FX.density; i++) FX.emit('conf', a.x, a.y, a.z, rnd(6), Math.random() * 4, rnd(6), 1.2, 0.18, ['#ff4f9a', '#ffb736', '#44ffa8', '#38c8ff', '#9b6bff'][i % 5], 1, 5, 1, 0); break; }
      case 'boxback': { FX.emit('add', a.x, a.y, a.z, 0, 0, 0, 0.3, 1.6, '#ffffff', 0.6, 0, 0, 0.6); break; }
      case 'peelhit': { FX.emit('add', a.x, a.y + 0.3, a.z, 0, 0, 0, 0.2, 1.2, '#ffc531', 0.8, 0, 0, 1); break; }
      case 'rocketTrail': { if (Math.random() < 0.8 * FX.density) { FX.emit('soft', a.x - Math.sin(a.h) * 0.7, a.y, a.z - Math.cos(a.h) * 0.7, rnd(0.5), rnd(0.5), rnd(0.5), 0.8, 0.45, '#efe8dc', 0.6, -0.2, 1, 2); FX.emit('add', a.x - Math.sin(a.h) * 0.6, a.y, a.z - Math.cos(a.h) * 0.6, rnd(1), rnd(1), rnd(1), 0.2, 0.3, '#ff9a3a', 1, 0, 1, 0); } break; }
      case 'boom': { sparkBurst(a.x, a.y, a.z, 22, 7, 5, '#fff3d6'); FX.emit('add', a.x, a.y, a.z, 0, 0, 0, 0.3, 4, '#ffb060', 0.9, 0, 0, 1.4); smokePuff(a.x, a.y, a.z, 10, '#e8e0d4', 1.5, 1.6); if (W && Math.hypot(W.P.x - a.x, W.P.z - a.z) < 25) { ARC.shake = Math.max(ARC.shake, 5); R3.flash = Math.max(R3.flash, 0.35); } break; }
      case 'rescue': { kartPoint(a, 0, 3, 0, V); sparkBurst(V.x, V.y, V.z, 12, 3, 2, '#38e1ff'); break; }
      case 'stall': { kartPoint(a, 0, 0.5, -1.1, V); smokePuff(V.x, V.y, V.z, 12, '#5a5652', 1.2, 1.4); break; }
      case 'use': { break; }
      case 'finish': { kartPoint(a, 0, 1, 6, V); confettiAt(V.x, V.y + 4, V.z, 90, 10); if (!ARC.reducedMotion) R3.flash = Math.max(R3.flash, b === 1 ? 0.6 : 0.3); break; }
    }
  }
};

/* ------------------------------------------------------------ karts and racers */
// Model frame: forward +z, up +y, origin on the ground between the axles. +x is the kart's left.
const KGEO = {};
function kartBodyGeo(c) {
  const key = 'body:' + c.id; if (KGEO[key]) return KGEO[key];
  const paint = c.kart, trim = c.trim, dark = '#25272d', metal = '#b9bec7';
  const sh = new THREE.Shape();
  const prof = [[-1.02, 0.24], [1.02, 0.24], [1.2, 0.32], [1.14, 0.46], [0.66, 0.56], [0.3, 0.58], [0.12, 0.44], [-0.5, 0.44], [-0.72, 0.66], [-1.02, 0.66]];
  sh.moveTo(prof[0][0], prof[0][1]); for (let i = 1; i < prof.length; i++) sh.lineTo(prof[i][0], prof[i][1]); sh.closePath();
  const ex = new THREE.ExtrudeGeometry(sh, { depth: 0.98, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 4 });
  const parts = [
    prep(ex, paint, [0.49, 0, 0], [0, -Math.PI / 2, 0]),
    boxG(1.36, 0.1, 2.1, dark, [0, 0.2, 0]),
    // side pods with a trim stripe
    capG(0.15, 1.05, paint, [0.72, 0.36, 0.0], [Math.PI / 2, 0, 0], [1.1, 1, 1]), capG(0.15, 1.05, paint, [-0.72, 0.36, 0.0], [Math.PI / 2, 0, 0], [1.1, 1, 1]),
    boxG(0.05, 0.06, 1.1, trim, [0.88, 0.42, 0]), boxG(0.05, 0.06, 1.1, trim, [-0.88, 0.42, 0]),
    // bumpers
    limbG([-0.78, 0.27, 1.32], [0.78, 0.27, 1.32], 0.07, dark, true), limbG([-0.82, 0.3, -1.2], [0.82, 0.3, -1.2], 0.08, dark, true),
    // nose number board
    boxG(0.46, 0.24, 0.04, '#f4f1ea', [0, 0.5, 1.13], [-0.45, 0, 0]), cylG(0.075, 0.075, 0.05, 14, trim, [0, 0.505, 1.15], [Math.PI / 2 - 0.45, 0, 0]),
    // seat
    boxG(0.64, 0.12, 0.52, '#1d1d22', [0, 0.48, -0.28]), boxG(0.64, 0.56, 0.1, '#1d1d22', [0, 0.76, -0.56], [0.22, 0, 0]),
    boxG(0.66, 0.1, 0.12, trim, [0, 1.04, -0.62], [0.22, 0, 0]),
    // steering column and wheel
    limbG([0, 0.5, 0.62], [0, 0.86, 0.32], 0.035, '#3a3d44'), torG(0.17, 0.035, '#1d1d22', [0, 0.88, 0.3], [-0.95, 0, 0]),
    cylG(0.05, 0.05, 0.06, 10, trim, [0, 0.88, 0.3], [Math.PI / 2 - 0.95, 0, 0]),
    // engine and pipes
    boxG(0.7, 0.3, 0.42, '#4a4d55', [0, 0.62, -0.9]), boxG(0.74, 0.06, 0.46, '#6a6e78', [0, 0.79, -0.9]),
    cylG(0.09, 0.09, 0.26, 10, metal, [0.22, 0.64, -1.1], [Math.PI / 2, 0, 0]), cylG(0.09, 0.09, 0.26, 10, metal, [-0.22, 0.64, -1.1], [Math.PI / 2, 0, 0]),
    limbG([0.22, 0.62, -1.08], [0.28, 0.7, -1.36], 0.055, metal), limbG([-0.22, 0.62, -1.08], [-0.28, 0.7, -1.36], 0.055, metal),
    // spoiler
    boxG(1.34, 0.06, 0.34, trim, [0, 1.06, -1.06], [0.12, 0, 0]), boxG(0.05, 0.32, 0.3, paint, [0.62, 0.9, -1.04]), boxG(0.05, 0.32, 0.3, paint, [-0.62, 0.9, -1.04]),
    // front axle beam
    limbG([-0.7, 0.3, 0.78], [0.7, 0.3, 0.78], 0.04, dark)
  ];
  KGEO[key] = mergeG(parts);
  return KGEO[key];
}
function kartLightsGeo() {
  if (KGEO.lights) return KGEO.lights;
  KGEO.lights = mergeG([
    sphR(0.075, '#fff6d6', [0.36, 0.44, 1.2], null, [1, 0.8, 0.5]), sphR(0.075, '#fff6d6', [-0.36, 0.44, 1.2], null, [1, 0.8, 0.5]),
    boxG(0.18, 0.07, 0.03, '#ff2a1a', [0.42, 0.56, -1.19]), boxG(0.18, 0.07, 0.03, '#ff2a1a', [-0.42, 0.56, -1.19])
  ]);
  return KGEO.lights;
}
function wheelGeo(r, w, rim) {
  const key = 'wh:' + r + ':' + w + ':' + rim; if (KGEO[key]) return KGEO[key];
  const parts = [
    cylG(r, r, w, 14, '#1b1b1e', null, [0, 0, Math.PI / 2]),
    cylG(r * 0.92, r * 0.92, w + 0.01, 14, '#2a2a2e', null, [0, 0, Math.PI / 2], [1, 0.4, 1]),
    cylG(r * 0.58, r * 0.58, w + 0.03, 10, rim, null, [0, 0, Math.PI / 2]),
    cylG(r * 0.2, r * 0.2, w + 0.06, 8, '#d9dde4', null, [0, 0, Math.PI / 2])
  ];
  // tread blocks so the spin reads
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; parts.push(boxG(w * 0.9, 0.05, 0.07, '#121214', [0, Math.cos(a) * r, Math.sin(a) * r], [a, 0, 0])); }
  KGEO[key] = mergeG(parts);
  return KGEO[key];
}
function rearAxleGeo(rim) {
  const key = 'ra:' + rim; if (KGEO[key]) return KGEO[key];
  const w = wheelGeo(0.36, 0.36, rim);
  const a = w.clone(); a.translate(0.8, 0, 0); const b = w.clone(); b.translate(-0.8, 0, 0);
  const ax = limbG([-0.7, 0, 0], [0.7, 0, 0], 0.05, '#3a3d44');
  KGEO[key] = mergeG([a, b, ax]);
  return KGEO[key];
}
// The racer: torso and legs, a big expressive head, two arms on the wheel.
function torsoGeo(c) {
  const key = 'torso:' + c.id; if (KGEO[key]) return KGEO[key];
  const animal = /bear|parrot|elephant|cat/.test(c.kind);
  const parts = [
    sphG(0.3, c.shirt, [0, 0.3, 0.02], [1.02, 1.12, 0.86]),
    boxG(0.5, 0.07, 0.04, c.trim === '#ffffff' ? '#f4f1ea' : c.trim, [0, 0.3, 0.27]),
    cylG(0.12, 0.14, 0.12, 10, animal ? c.skin : c.skin, [0, 0.58, 0]),
    capG(0.11, 0.45, animal ? c.skin : '#2b3040', [0.15, 0.02, 0.32], [Math.PI / 2 - 0.25, 0, 0]),
    capG(0.11, 0.45, animal ? c.skin : '#2b3040', [-0.15, 0.02, 0.32], [Math.PI / 2 - 0.25, 0, 0])
  ];
  if (c.kind === 'parrot') parts.push(prep(new THREE.ConeGeometry(0.16, 0.5, 8), '#2d7fd1', [0, 0.1, -0.32], [-1.2, 0, 0]));
  KGEO[key] = mergeG(parts);
  return KGEO[key];
}
function headGeo(c) {
  const key = 'head:' + c.id; if (KGEO[key]) return KGEO[key];
  const k = c.kind, sk = c.skin, hair = c.hair, hat = c.hat;
  const P = [];
  const R = k === 'elephant' ? 0.38 : k === 'parrot' ? 0.32 : 0.35;
  P.push(sphG(R, sk, [0, 0.3, 0], [1, 0.98, 0.98], 18, 12));
  // eyes: big and friendly
  const ey = k === 'grandpa' ? 0.34 : 0.36, ex = k === 'parrot' ? 0.14 : 0.125, ez = R * 0.82;
  const eyeR = k === 'bear' ? 0.07 : 0.085;
  P.push(sphR(eyeR, '#ffffff', [ex, ey, ez], null, [1, 1.25, 0.6]), sphR(eyeR, '#ffffff', [-ex, ey, ez], null, [1, 1.25, 0.6]));
  P.push(sphR(eyeR * 0.55, '#16161c', [ex * 0.95, ey - 0.005, ez + 0.045], null, [1, 1.2, 0.6]), sphR(eyeR * 0.55, '#16161c', [-ex * 0.95, ey - 0.005, ez + 0.045], null, [1, 1.2, 0.6]));
  P.push(sphR(0.018, '#ffffff', [ex * 0.8, ey + 0.03, ez + 0.07]), sphR(0.018, '#ffffff', [-ex * 1.1, ey + 0.03, ez + 0.07]));
  if (k !== 'parrot') {
    P.push(boxG(0.1, 0.022, 0.02, k === 'grandpa' ? '#f4f1ea' : '#2a1b12', [ex, ey + 0.13, ez - 0.02], [0, 0, 0.2]), boxG(0.1, 0.022, 0.02, k === 'grandpa' ? '#f4f1ea' : '#2a1b12', [-ex, ey + 0.13, ez - 0.02], [0, 0, -0.2]));
    P.push(sphR(0.05, '#7a2a24', [0, 0.18, R * 0.9], null, [1.6, 0.55, 0.5]));
    P.push(sphR(0.05, '#ff8a8a', [0.21, 0.24, R * 0.78], null, [1, 0.6, 0.4]), sphR(0.05, '#ff8a8a', [-0.21, 0.24, R * 0.78], null, [1, 0.6, 0.4]));
  }
  if (k === 'kid') {
    P.push(prep(new THREE.SphereGeometry(R * 1.04, 18, 9, 0, TAU, 0, Math.PI / 2), hat, [0, 0.36, -0.01]));
    P.push(boxG(0.34, 0.03, 0.26, hat, [0, 0.4, -0.38], [-0.12, 0, 0]));
    P.push(sphR(0.07, '#ffffff', [0, 0.72, 0]));
    P.push(sphR(0.09, hair, [0.12, 0.42, 0.25], null, [1, 0.5, 0.6]), sphR(0.09, hair, [-0.05, 0.43, 0.27], null, [1, 0.5, 0.6]));
    P.push(sphR(0.06, sk, [0.35, 0.3, 0]), sphR(0.06, sk, [-0.35, 0.3, 0]));
  } else if (k === 'girl') {
    P.push(prep(new THREE.SphereGeometry(R * 1.06, 18, 9, 0, TAU, 0, Math.PI * 0.56), hair, [0, 0.3, -0.03]));
    P.push(capG(0.07, 0.36, hair, [0.27, 0.06, -0.18], [0.3, 0, 0.25]), capG(0.07, 0.36, hair, [-0.27, 0.06, -0.18], [0.3, 0, -0.25]));
    P.push(sphR(0.06, '#ff4f9a', [0.31, -0.14, -0.22]), sphR(0.06, '#ff4f9a', [-0.31, -0.14, -0.22]));
    P.push(cylG(0.075, 0.075, 0.07, 12, hat, [0.12, 0.56, 0.24], [Math.PI / 2 - 0.6, 0, 0]), cylG(0.075, 0.075, 0.07, 12, hat, [-0.12, 0.56, 0.24], [Math.PI / 2 - 0.6, 0, 0]));
    P.push(torG(R * 1.02, 0.02, '#3a2a20', [0, 0.52, 0], [Math.PI / 2 - 0.25, 0, 0]));
  } else if (k === 'bear') {
    P.push(sphR(0.12, sk, [0.25, 0.6, -0.02]), sphR(0.12, sk, [-0.25, 0.6, -0.02]), sphR(0.06, '#e8a9a0', [0.25, 0.6, 0.06]), sphR(0.06, '#e8a9a0', [-0.25, 0.6, 0.06]));
    P.push(sphR(0.16, '#d9b58a', [0, 0.22, 0.26], null, [1.1, 0.8, 0.8]), sphR(0.06, '#141414', [0, 0.28, 0.4], null, [1.3, 0.9, 0.8]));
    P.push(prep(new THREE.SphereGeometry(R * 1.05, 16, 8, 0, TAU, 0, Math.PI * 0.32), hat, [0, 0.31, 0]));
  } else if (k === 'parrot') {
    P.push(prep(new THREE.ConeGeometry(0.11, 0.26, 10), '#ffb21a', [0, 0.26, 0.4], [Math.PI / 2 + 0.5, 0, 0]));
    P.push(prep(new THREE.ConeGeometry(0.07, 0.14, 8), '#ff7a1a', [0, 0.17, 0.33], [Math.PI / 2 + 1.1, 0, 0]));
    P.push(prep(new THREE.ConeGeometry(0.06, 0.24, 8), hair, [0, 0.66, 0.02], [-0.3, 0, 0]), prep(new THREE.ConeGeometry(0.05, 0.2, 8), hair, [0, 0.64, -0.1], [-0.7, 0, 0]), prep(new THREE.ConeGeometry(0.05, 0.18, 8), hat, [0, 0.62, 0.12], [0.2, 0, 0]));
    P.push(sphR(0.13, '#f4f1ea', [0.13, 0.36, 0.2], null, [1, 1.2, 0.5]), sphR(0.13, '#f4f1ea', [-0.13, 0.36, 0.2], null, [1, 1.2, 0.5]));
  } else if (k === 'grandpa') {
    P.push(sphR(0.13, hair, [0.29, 0.3, -0.06], null, [0.7, 1, 1]), sphR(0.13, hair, [-0.29, 0.3, -0.06], null, [0.7, 1, 1]));
    P.push(capG(0.05, 0.17, hair, [0.11, 0.21, 0.31], [0, 0, 1.15]), capG(0.05, 0.17, hair, [-0.11, 0.21, 0.31], [0, 0, -1.15]));
    P.push(sphR(0.05, hair, [0.23, 0.17, 0.27]), sphR(0.05, hair, [-0.23, 0.17, 0.27]));
    P.push(torG(0.075, 0.012, '#2a2a2a', [0.125, 0.35, 0.33], null), torG(0.075, 0.012, '#2a2a2a', [-0.125, 0.35, 0.33], null), boxG(0.06, 0.012, 0.012, '#2a2a2a', [0, 0.36, 0.34]));
    P.push(cylG(0.33, 0.35, 0.1, 18, hat, [0, 0.58, -0.02], [-0.1, 0, 0]), boxG(0.34, 0.03, 0.18, hat, [0, 0.55, 0.3], [-0.2, 0, 0]));
    P.push(sphR(0.06, sk, [0, 0.27, 0.36], null, [1, 1.2, 1]));
  } else if (k === 'auntie') {
    P.push(prep(new THREE.SphereGeometry(R * 1.05, 18, 9, 0, TAU, 0, Math.PI * 0.5), hair, [0, 0.32, -0.02]));
    P.push(sphR(0.15, hair, [0, 0.55, -0.27]), torG(0.1, 0.025, hat, [0, 0.55, -0.22], [0.5, 0, 0]));
    P.push(sphR(0.1, '#121216', [0.13, 0.36, 0.3], null, [1.15, 0.8, 0.4]), sphR(0.1, '#121216', [-0.13, 0.36, 0.3], null, [1.15, 0.8, 0.4]), boxG(0.07, 0.02, 0.02, '#121216', [0, 0.38, 0.33]));
    P.push(sphR(0.045, '#ffd23f', [0.34, 0.14, 0.02]), sphR(0.045, '#ffd23f', [-0.34, 0.14, 0.02]));
    P.push(sphR(0.05, '#d81b60', [0, 0.18, 0.32], null, [1.6, 0.6, 0.5]));
  } else if (k === 'elephant') {
    P.push(sphR(0.26, sk, [0.38, 0.32, -0.08], null, [0.22, 1.1, 0.9]), sphR(0.26, sk, [-0.38, 0.32, -0.08], null, [0.22, 1.1, 0.9]));
    P.push(sphR(0.19, '#e8a9b6', [0.42, 0.32, -0.05], null, [0.12, 0.9, 0.7]), sphR(0.19, '#e8a9b6', [-0.42, 0.32, -0.05], null, [0.12, 0.9, 0.7]));
    P.push(limbG([0, 0.26, 0.32], [0, 0.06, 0.5], 0.085, sk, true), limbG([0, 0.06, 0.5], [0, -0.04, 0.68], 0.07, sk, true), limbG([0, -0.04, 0.68], [0, 0.05, 0.8], 0.06, sk, true));
    P.push(prep(new THREE.SphereGeometry(R * 0.7, 14, 7, 0, TAU, 0, Math.PI * 0.4), hat, [0, 0.42, 0]), sphR(0.06, '#ff6a1a', [0, 0.72, 0]));
  } else if (k === 'cat') {
    P.push(prep(new THREE.ConeGeometry(0.11, 0.2, 4), sk, [0.2, 0.64, -0.02], [0, Math.PI / 4, -0.2]), prep(new THREE.ConeGeometry(0.11, 0.2, 4), sk, [-0.2, 0.64, -0.02], [0, Math.PI / 4, 0.2]));
    P.push(prep(new THREE.ConeGeometry(0.06, 0.12, 4), '#ffb8c4', [0.2, 0.62, 0.03], [0, Math.PI / 4, -0.2]), prep(new THREE.ConeGeometry(0.06, 0.12, 4), '#ffb8c4', [-0.2, 0.62, 0.03], [0, Math.PI / 4, 0.2]));
    P.push(sphR(0.13, '#fff4e6', [0, 0.2, 0.27], null, [1.2, 0.75, 0.7]), sphR(0.035, '#ff7f9a', [0, 0.27, 0.37], null, [1.3, 0.9, 0.8]));
    for (let i = -1; i <= 1; i++) { P.push(boxG(0.22, 0.008, 0.008, '#3a2a20', [0.2, 0.22 + i * 0.03, 0.3], [0, 0.3, i * 0.15]), boxG(0.22, 0.008, 0.008, '#3a2a20', [-0.2, 0.22 + i * 0.03, 0.3], [0, -0.3, -i * 0.15])); }
    P.push(boxG(0.05, 0.12, 0.02, '#c9782a', [0, 0.52, 0.27]), boxG(0.04, 0.1, 0.02, '#c9782a', [0.09, 0.5, 0.26], [0, 0, 0.3]), boxG(0.04, 0.1, 0.02, '#c9782a', [-0.09, 0.5, 0.26], [0, 0, -0.3]));
  }
  KGEO[key] = mergeG(P);
  return KGEO[key];
}
function armGeo(c, side) {
  const key = 'arm:' + c.id + side; if (KGEO[key]) return KGEO[key];
  const hand = [-0.15 * side, -0.14, 0.5];
  KGEO[key] = mergeG([limbG([0, 0, 0], hand, 0.075, c.shirt, true), sphR(0.085, /bear|cat|elephant|parrot/.test(c.kind) ? c.skin : c.skin, hand)]);
  return KGEO[key];
}

let KMAT = null;
function kartMats() {
  if (KMAT) return KMAT;
  KMAT = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.18 }),
    rubber: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.2 }),
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }),
    lights: new THREE.MeshBasicMaterial({ vertexColors: true }),
    ghost: new THREE.MeshStandardMaterial({ color: '#7fe8ff', emissive: '#2aa8d8', emissiveIntensity: 0.8, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.4 })
  };
  KMAT.lights.color.setScalar(3.2);
  return KMAT;
}
function makeKart(c, ghost) {
  const M = kartMats();
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, ghost ? M.ghost : mat); m.castShadow = !ghost; m.receiveShadow = false; return m; };
  const root = new THREE.Group(), tilt = new THREE.Group(), bob = new THREE.Group(), driver = new THREE.Group();
  root.add(tilt); tilt.add(bob);
  const chassis = mk(kartBodyGeo(c), M.paint); bob.add(chassis);
  const lights = new THREE.Mesh(kartLightsGeo(), M.lights); if (!ghost) bob.add(lights);
  driver.position.set(0, 0.5, -0.24); bob.add(driver);
  const torso = mk(torsoGeo(c), M.skin); driver.add(torso);
  const head = mk(headGeo(c), M.skin); head.position.set(0, 0.62, 0); driver.add(head);
  const armL = mk(armGeo(c, 1), M.skin); armL.position.set(0.29, 0.44, 0.02); driver.add(armL);
  const armR = mk(armGeo(c, -1), M.skin); armR.position.set(-0.29, 0.44, 0.02); driver.add(armR);
  const rear = mk(rearAxleGeo(c.trim), M.rubber); rear.position.set(0, 0.36, -0.8); tilt.add(rear);
  const wg = wheelGeo(0.3, 0.26, c.trim);
  const fl = mk(wg, M.rubber); fl.position.set(0.74, 0.3, 0.8); fl.rotation.order = 'YXZ'; tilt.add(fl);
  const fr = mk(wg, M.rubber); fr.position.set(-0.74, 0.3, 0.8); fr.rotation.order = 'YXZ'; tilt.add(fr);
  return { root, tilt, bob, chassis, lights, driver, torso, head, armL, armR, rear, fl, fr, c, ghost: !!ghost };
}

// Pose one kart and its racer for this frame: lean, bounce, spin, celebrate, flinch.
function poseKart(B, K, W, dt, t) {
  const T = W.T, A = K.anim;
  B.root.visible = true;
  B.root.position.set(K.x, K.y, K.z);
  // the visible yaw slides out in a drift and spins after a hit
  const yawT = K.drift ? K.drift * -0.34 : 0;
  A.yawVis += (yawT - A.yawVis) * Math.min(1, dt * 8);
  B.root.rotation.set(0, K.h + A.yawVis + A.spinYaw, 0);
  const sc = K.shrinkT > 0 ? lerp(1, 0.55, clamp(Math.min(K.shrinkT, 3.8 - K.shrinkT) * 4, 0, 1)) : 1;
  B.root.scale.setScalar(sc * (A.rescue > 0 ? 1 : 1));
  // pitch with the slope under the kart, roll with the turn
  const i = K.hi < 0 ? 0 : K.hi, j = (i + 2) % T.N;
  const slope = (T.Y[j] - T.Y[i]) / (2 * T.ds) * Math.cos(wrapA(K.h - T.HD[i]));
  let pitchT = K.air ? clamp(-K.vy * 0.03, -0.35, 0.35) : -Math.atan(slope);
  if (K.ramp > 0 && !K.air) pitchT -= 0.16;
  A.pitch += (pitchT - A.pitch) * Math.min(1, dt * 10);
  const latAcc = K.v * K.steerIn * K.turn * 0.0025 + (K.drift ? K.drift * 0.06 : 0);
  A.roll += (clamp(latAcc, -0.18, 0.18) - A.roll) * Math.min(1, dt * 6);
  A.trickP = K.trick && K.air ? Math.min(1, (A.trickP || 0) + dt / 0.42) : 0;
  B.tilt.rotation.set(A.pitch + (K.tumbleT > 0 ? -A.flip : 0), 0, A.roll + smooth01(A.trickP) * TAU, 'YXZ');
  // suspension: a spring that the landings and bumps compress
  const accel = (K.v - (A.lastV || 0)) / Math.max(dt, 1e-3); A.lastV = K.v;
  A.bobV += (-A.bob * 220 - A.bobV * 14) * dt;
  A.bobV -= A.squash * 30; A.squash = 0;
  if (K.surf === 'off' && !K.air && Math.abs(K.v) > 5) A.bobV += rnd(3);
  A.bob += A.bobV * dt; A.bob = clamp(A.bob, -0.16, 0.16);
  const idle = Math.sin(t * 30 + K.idx) * 0.006 * (K.v < 1 ? 1 : 0.3);
  B.bob.position.y = A.bob * 0.5 + idle;
  B.bob.rotation.x = clamp(-accel * 0.004, -0.06, 0.06);
  B.bob.scale.set(1 + Math.max(0, -A.bob) * 0.6, 1 - Math.max(0, -A.bob) * 0.9, 1);
  // wheels
  A.wheel += K.v * dt / 0.32;
  A.steer += ((K.drift ? K.drift * 0.3 - K.steerIn * 0.2 : -K.steerIn * 0.45) - A.steer) * Math.min(1, dt * 12);
  B.fl.rotation.set(A.wheel, A.steer, 0); B.fr.rotation.set(A.wheel, A.steer, 0); B.rear.rotation.x = A.wheel;
  // the racer
  if (A.react > 0) A.react = Math.max(0, A.react - dt);
  if (A.cele > 0 && K.finished) A.cele = Math.min(1, A.cele + dt);
  const cele = K.finished && A.cele > 0.2 ? 1 : 0;
  const lean = K.steerIn * 0.2 * (K.drift ? 1.5 : 1);
  B.driver.rotation.set(K.boostT > 0 ? -0.12 : 0.05 * Math.sin(t * 2), 0, lean);
  let hy = -K.steerIn * 0.35, hx = 0, hz = 0;
  const RM = ARC.reducedMotion;
  if (A.react > 0) {
    const k = A.react;
    if (A.reactK === 'cut') { hx = 0.2; hy = Math.sin(t * 18) * 0.3 * k; }
    else { hy = Math.sin(t * (RM ? 8 : 22)) * 0.45 * Math.min(1, k); hz = Math.sin(t * 15) * 0.2 * Math.min(1, k); }
  } else if (cele) { hy = Math.sin(t * 3) * 0.4; hx = -0.15 + Math.sin(t * 7) * 0.08; }
  else if (W.phase === 'countdown' && !K.isPlayer) hy = Math.sin(t * 1.4 + K.idx) * 0.4;
  else if (!K.isPlayer && W.phase === 'race' && !W.attract) {
    // rivals glance at you as you draw alongside
    const P = W.P, dx = P.x - K.x, dz = P.z - K.z, d2 = dx * dx + dz * dz;
    if (d2 < 64) { const rel = wrapA(Math.atan2(dx, dz) - K.h); A.look = (A.look || 0) + (clamp(rel, -1.1, 1.1) - (A.look || 0)) * Math.min(1, dt * 6); hy = A.look; }
    else A.look = (A.look || 0) * Math.exp(-dt * 4);
  }
  B.head.rotation.set(hx, hy, hz);
  const hb = cele ? Math.abs(Math.sin(t * 7)) * 0.05 : 0;
  B.head.position.y = 0.62 + hb;
  B.head.scale.set(1 + Math.max(0, -A.bob) * 0.4, 1 - Math.max(0, -A.bob) * 0.5, 1);
  if (cele) {
    B.armL.rotation.set(-2.5 + Math.sin(t * 9) * 0.3, 0, 0.35 + Math.sin(t * 9) * 0.2);
    B.armR.rotation.set(-2.5 + Math.sin(t * 9 + 1.5) * 0.3, 0, -0.35 - Math.sin(t * 9 + 1.5) * 0.2);
  } else if (A.react > 0.3 && A.reactK !== 'bump') {
    B.armL.rotation.set(-1.4 + Math.sin(t * 20) * 0.6, 0, 0.6); B.armR.rotation.set(-1.4 + Math.sin(t * 20 + 2) * 0.6, 0, -0.6);
  } else {
    const st = K.steerIn * 0.4;
    B.armL.rotation.set(st * 0.5, 0, st * 0.6); B.armR.rotation.set(-st * 0.5, 0, st * 0.6);
  }
  // a shrunken kart blinks while it is invulnerable
  B.chassis.visible = !(K.invulnT > 0 && K.invulnT < 1.6 && Math.floor(t * 14) % 2 === 0 && K.spinT <= 0 && K.tumbleT <= 0);
}

/* ------------------------------------------------------------ the circuits in 3D */
const _mtx = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _sc = new THREE.Vector3(), _ps = new THREE.Vector3(), _eu = new THREE.Euler();
function instMesh(geo, mat, list, o) {
  o = o || {};
  const n = Math.max(1, list.length);
  const im = new THREE.InstancedMesh(geo, mat, n);
  list.forEach((it, i) => {
    _eu.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ'); _qt.setFromEuler(_eu);
    _mtx.compose(_ps.set(it.x, it.y, it.z), _qt, _sc.set(it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1));
    im.setMatrixAt(i, _mtx);
    if (it.col) { _c.set(it.col); if (it.k) _c.multiplyScalar(it.k); im.setColorAt(i, _c); }
  });
  if (!list.length) { _mtx.makeScale(0, 0, 0); im.setMatrixAt(0, _mtx); }
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = !!o.cast; im.receiveShadow = o.receive !== false;
  im.computeBoundingSphere();
  return im;
}
// distance from (x, z) to the nearest road edge, main lap or shortcut (negative is on the road)
function roadClear(T, x, z) {
  const m = nearestPath(T, x, z, -1, true);
  let d = Math.sqrt(m.d2) - T.def.hw;
  if (T.sc) { const q = nearestPath(T.sc, x, z, -1, false); d = Math.min(d, Math.sqrt(q.d2) - T.sc.hw); }
  return d;
}
function nearY(T, x, z) { return nearestPath(T, x, z, -1, true).y; }

// A strip along a path between two lateral offsets, with uvs (u across, v along in metres / vRep).
function ribbon(S, closed, latA, latB, yA, yB, vRep, skip, sA) {
  const N = S.N, rows = closed ? N + 1 : N;
  const pos = [], uv = [], idx = [];
  for (let r = 0; r < rows; r++) {
    const i = r % N, rx = -S.TZ[i], rz = S.TX[i];
    const la = typeof latA === 'function' ? latA(i) : latA, lb = typeof latB === 'function' ? latB(i) : latB;
    const ya = typeof yA === 'function' ? yA(i) : yA, yb = typeof yB === 'function' ? yB(i) : yB;
    pos.push(S.X[i] + rx * la, S.Y[i] + ya, S.Z[i] + rz * la, S.X[i] + rx * lb, S.Y[i] + yb, S.Z[i] + rz * lb);
    const v = r * S.ds / vRep; uv.push(0, v, 1, v);
  }
  for (let r = 0; r < rows - 1; r++) {
    if (skip && skip(r % N, ((sA || 0) + r * S.ds))) continue;
    const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // a ribbon read the wrong way round faces down: flip it
  const n = g.attributes.normal; let up = 0; for (let i = 0; i < n.count; i++) up += n.getY(i);
  if (up < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
const inGap = (T, s) => { for (let g = 0; g < T.gaps.length; g++) if (s > T.gaps[g][0] - 0.5 && s < T.gaps[g][1] + 0.5) return true; return false; };

// Looks of each circuit: sky, sun, fog, grade
const LOOK = {
  fair: { skyTop: '#060a22', skyMid: '#141a45', skyHor: '#6a3a6e', sun: '#a8bcff', sunI: 1.1, sunEl: 0.75, sunAz: 2.2, fog: '#2a1f44', fogD: 0.0045, hemiSky: '#5a6ab8', hemiGnd: '#3a2a20', hemiI: 0.75, exposure: 1.25, cloud: 0.25, stars: 1, night: 1, bloom: 1.15, thresh: 0.85, grade: [1.04, 0.98, 1.08], sat: 1.15, rain: 0, envI: 0.45 },
  hill: { skyTop: '#5d6c78', skyMid: '#8b989c', skyHor: '#b9c2bd', sun: '#e9eef0', sunI: 1.35, sunEl: 1.0, sunAz: -0.7, fog: '#9fa9a6', fogD: 0.0105, hemiSky: '#cfdadc', hemiGnd: '#3f4d36', hemiI: 1.25, exposure: 1.12, cloud: 1, stars: 0, night: 0, bloom: 0.55, thresh: 1.1, grade: [0.97, 1.02, 1.04], sat: 1.08, rain: 1, envI: 0.9 },
  roof: { skyTop: '#2a3b84', skyMid: '#c46a78', skyHor: '#ffb062', sun: '#ffb27a', sunI: 3.4, sunEl: 0.14, sunAz: 2.55, fog: '#e6a27a', fogD: 0.0032, hemiSky: '#ffd6b0', hemiGnd: '#6a4030', hemiI: 0.9, exposure: 1.02, cloud: 0.4, stars: 0, night: 0, bloom: 0.75, thresh: 0.95, grade: [1.06, 1.0, 0.94], sat: 1.12, rain: 0, envI: 0.8 }
};

const SCN = {};
function buildScene(T) {
  if (SCN[T.id]) return SCN[T.id];
  const tx = textures(), L = LOOK[T.id], def = T.def, id = T.id, hw = def.hw, r = rng(77 + TRACK_IDX[id] * 31);
  const group = new THREE.Group();
  const S = { group, T, anims: [], glow: [], falls: null, boxes: null, haz: {}, lights: null, lightCol: [] };
  const add = (m) => { group.add(m); return m; };
  const stdMat = (o) => new THREE.MeshStandardMaterial(o);
  // road surface
  const roadTex = id === 'fair' ? tx.asphalt : id === 'hill' ? tx.wet : tx.slab;
  const roadMat = stdMat({ map: roadTex, normalMap: id === 'roof' ? tx.slabN : tx.roadN, normalScale: new THREE.Vector2(id === 'hill' ? 0.35 : 0.6, id === 'hill' ? 0.35 : 0.6), roughness: id === 'hill' ? 1 : 0.86, roughnessMap: id === 'hill' ? tx.wetR : null, metalness: id === 'hill' ? 0.15 : 0.02, color: id === 'hill' ? '#d4d8dc' : '#ffffff' });
  const road = add(new THREE.Mesh(ribbon(T, true, -hw, hw, 0.02, 0.02, 2 * hw, (i, s) => inGap(T, s)), roadMat)); road.receiveShadow = true;
  const curbTex = id === 'fair' ? tx.curbFair : id === 'hill' ? tx.curbHill : tx.curbRoof;
  const curbMat = stdMat({ map: curbTex, roughness: 0.6 });
  const cw = 1.0;
  const cg = mergeRibbons([ribbon(T, true, -hw - cw, -hw, 0.07, 0.03, 4, (i, s) => inGap(T, s)), ribbon(T, true, hw, hw + cw, 0.03, 0.07, 4, (i, s) => inGap(T, s))]);
  const curb = add(new THREE.Mesh(cg, curbMat)); curb.receiveShadow = true;
  // the verge between the curbs and the fence or the parapet
  const vw = def.wall + 2.5;
  let vergeMat;
  if (id === 'roof') vergeMat = stdMat({ map: tx.plaster, color: '#e8cdb0', roughness: 0.9 });
  else vergeMat = stdMat({ map: tx.grass, normalMap: tx.grassN, color: id === 'fair' ? '#7a9050' : '#5d8a3f', roughness: 0.95 });
  const vy = id === 'roof' ? 0.02 : -0.3;
  const vg = mergeRibbons([ribbon(T, true, -hw - cw - vw, -hw - cw, vy, 0.04, 6, (i, s) => inGap(T, s)), ribbon(T, true, hw + cw, hw + cw + vw, 0.04, vy, 6, (i, s) => inGap(T, s))]);
  scaleUv(vg, (vw) / 6, 1);
  const verge = add(new THREE.Mesh(vg, vergeMat)); verge.receiveShadow = true;
  // shortcut
  if (T.sc) {
    const sc = T.sc;
    const scTex = id === 'fair' ? tx.dirt : id === 'hill' ? tx.stone : tx.planks;
    const scMat = stdMat({ map: scTex, color: id === 'hill' ? '#9aa0a0' : '#ffffff', roughness: id === 'hill' ? 0.35 : 0.9, metalness: id === 'hill' ? 0.1 : 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const g = ribbon(sc, false, -sc.hw, sc.hw, 0.05, 0.05, id === 'roof' ? 2 : 2 * sc.hw, null, 0);
    const m = add(new THREE.Mesh(g, scMat)); m.receiveShadow = true;
    if (id !== 'fair') {
      // a skirt under the ledge or the planks, so it stands over the drop
      const sk = mergeRibbons([ribbon(sc, false, -sc.hw, -sc.hw - 0.01, 0.05, id === 'roof' ? -0.35 : -9, 2), ribbon(sc, false, sc.hw + 0.01, sc.hw, id === 'roof' ? -0.35 : -9, 0.05, 2)]);
      add(new THREE.Mesh(sk, stdMat({ map: id === 'roof' ? tx.planks : tx.stone, color: id === 'roof' ? '#6a4428' : '#7d7a74', roughness: 0.9, side: THREE.DoubleSide })));
    }
    S.scMesh = m;
  }
  // start line, gantry and its lights
  {
    frameAt(T, T.startS);
    const f = { x: FR.x, y: FR.y, z: FR.z, h: FR.h };
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 1.4), stdMat({ map: tx.checker, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
    line.rotation.set(-Math.PI / 2, 0, 0, 'YXZ'); line.rotation.y = f.h; line.position.set(f.x, f.y + 0.035, f.z); line.rotation.order = 'YXZ'; line.receiveShadow = true; add(line);
    const gm = new THREE.Group(); gm.position.set(f.x, f.y, f.z); gm.rotation.y = f.h; add(gm);
    const pm = stdMat({ color: '#2b2d33', roughness: 0.5, metalness: 0.6 });
    const postG = mergeG([cylG(0.22, 0.26, 7, 10, '#ffffff', [hw + 1.6, 3.5, 0]), cylG(0.22, 0.26, 7, 10, '#ffffff', [-hw - 1.6, 3.5, 0]), boxG(2 * hw + 4, 0.5, 0.5, '#ffffff', [0, 6.8, 0])]);
    const posts = new THREE.Mesh(postG, pm); posts.castShadow = true; gm.add(posts);
    const banM = stdMat({ map: tx.banner, emissive: '#ffffff', emissiveMap: tx.banner, emissiveIntensity: L.night ? 0.9 : 0.25, roughness: 0.6 });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 3, 1.5), banM); ban.position.set(0, 7.85, 0.02); gm.add(ban);
    const ban2 = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 3, 1.5), banM); ban2.position.set(0, 7.85, -0.02); ban2.rotation.y = Math.PI; gm.add(ban2);
    const lm = new THREE.MeshBasicMaterial({ color: '#330808' });
    S.startLights = [];
    for (let i = 0; i < 3; i++) {
      const lmi = lm.clone(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), lmi); b.position.set((i - 1) * 1.1, 6.15, -0.3); gm.add(b);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.3), pm); hood.position.set((i - 1) * 1.1, 6.15, -0.05); gm.add(hood);
      S.startLights.push(lmi);
    }
  }
  // ramps
  T.ramps.forEach((R) => {
    frameAt(T, R.s - R.len); const ax = FR.x, ay = FR.y, az = FR.z, h0 = FR.h;
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(R.len, 0); sh.lineTo(R.len, 1.15); sh.lineTo(R.len - 0.3, 1.15); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2 * hw, bevelEnabled: false });
    // shape x along the lap, y up, depth across the road
    g.translate(0, 0, -hw); g.rotateY(-Math.PI / 2);
    const tex = tx.planks.clone(); tex.needsUpdate = true; tex.repeat.set(0.25, 0.25); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.Mesh(g, stdMat({ map: tex, color: id === 'fair' ? '#ffcf70' : '#d9a066', roughness: 0.8 }));
    m.position.set(ax, ay + 0.02, az); m.rotation.y = h0; m.castShadow = true; m.receiveShadow = true; add(m);
    const arrows = new THREE.Mesh(new THREE.PlaneGeometry(hw * 1.2, R.len * 0.9), stdMat({ map: tx.pad, emissive: '#ff8a2a', emissiveMap: tx.pad, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }));
    arrows.rotation.order = 'YXZ'; arrows.rotation.set(-Math.PI / 2 + Math.atan2(1.15, R.len), h0, 0);
    frameAt(T, R.s - R.len * 0.5); arrows.position.set(FR.x, FR.y + 0.62, FR.z); add(arrows);
    if (R.gap && id === 'fair') {
      // a fountain pool under the jump
      const gs = (R.gap[0] + R.gap[1]) / 2; frameAt(T, gs);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 6, R.gap[1] - R.gap[0] + 0.5), stdMat({ color: '#0b2a4a', roughness: 0.05, metalness: 0.8, normalMap: tx.water, envMapIntensity: 1.5 }));
      pool.rotation.order = 'YXZ'; pool.rotation.set(-Math.PI / 2, FR.h, 0); pool.position.set(FR.x, FR.y - 0.02, FR.z); add(pool);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 7, 0.4, 0.5), stdMat({ color: '#e8dccb', roughness: 0.7 }));
      S.fountain = { x: FR.x, y: FR.y, z: FR.z, h: FR.h, w: hw, pool };
      void rim;
    }
  });
  // boost pads
  if (T.pads.length) {
    const parts = [];
    T.pads.forEach((p) => {
      let x, y, z, h;
      if (p.onShort && T.sc) { const sc = T.sc, q = Math.round(sc.N * 0.12); x = sc.X[q]; y = sc.Y[q]; z = sc.Z[q]; h = sc.HD[q]; }
      else { posAt(T, p.s, p.lat, 0, V); x = V.x; y = V.y; z = V.z; h = FR.h; }
      const g = new THREE.PlaneGeometry(3.6, 6); g.rotateX(-Math.PI / 2); g.rotateY(h); g.translate(x, y + 0.06, z);
      parts.push(g);
    });
    const g = mergePlain(parts);
    const tex = tx.pad.clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const pm = stdMat({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4 });
    add(new THREE.Mesh(g, pm));
    S.anims.push((dt) => { tex.offset.y -= dt * 1.6; });
  }
  // item boxes: a glassy rainbow cube and a spinning star inside
  {
    const bm = stdMat({ map: tx.box, emissive: '#ffffff', emissiveMap: tx.box, emissiveIntensity: 0.75, transparent: true, opacity: 0.88, roughness: 0.15, metalness: 0.1 });
    const sm = new THREE.MeshBasicMaterial({ color: '#ffd84a' }); sm.color.multiplyScalar(2.2);
    S.starIM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.32), sm, 40); S.starIM.count = 0; S.starIM.frustumCulled = false; add(S.starIM);
    S.boxIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), bm, 40); S.boxIM.count = 0; S.boxIM.frustumCulled = false; add(S.boxIM);
  }
  // hazards
  {
    const balls = T.haz.filter((h) => h.k === 'ball');
    if (balls.length) {
      const bt = canvasTex(256, 128, (g, w, h) => { const c = ['#ff4f9a', '#ffd23f', '#38c8ff', '#44ffa8', '#ff6a1a', '#ffffff']; for (let i = 0; i < 6; i++) { g.fillStyle = c[i]; g.fillRect(i * w / 6, 0, w / 6 + 1, h); } });
      S.balls = balls.map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 16), stdMat({ map: bt, roughness: 0.25, metalness: 0.05 })); m.castShadow = true; add(m); return m; });
    }
    const puds = T.haz.filter((h) => h.k === 'puddle');
    if (puds.length) {
      const parts = puds.map((h) => { posAt(T, h.s, h.lat, 0, V); const g = new THREE.CircleGeometry(1, 28); g.rotateX(-Math.PI / 2); g.scale(2.6, 1, 4.2); g.rotateY(FR.h); g.translate(V.x, V.y + 0.045, V.z); return g; });
      const wtex = tx.water.clone(); wtex.needsUpdate = true; wtex.repeat.set(3, 3);
      const pm = stdMat({ color: '#1c242c', roughness: 0.03, metalness: 0.9, normalMap: wtex, normalScale: new THREE.Vector2(0.1, 0.1), transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -5 });
      add(new THREE.Mesh(mergePlain(parts), pm));
      S.anims.push((dt, t) => { wtex.offset.set(t * 0.03, t * 0.05); });
    }
    const sacks = T.haz.filter((h) => h.k === 'sack'), heaps = T.haz.filter((h) => h.k === 'heap');
    if (sacks.length) {
      const sg = mergeG([cylG(0.72, 0.85, 1.3, 12, '#c9a46e', [0, 0.65, 0]), sphG(0.72, '#c9a46e', [0, 1.3, 0], [1, 0.45, 1]), torG(0.3, 0.06, '#8a6a40', [0, 1.45, 0], [Math.PI / 2, 0, 0])]);
      add(instMesh(sg, stdMat({ vertexColors: true, roughness: 0.95 }), sacks.map((h) => { posAt(T, h.s, h.lat, 0, V); return { x: V.x, y: V.y, z: V.z, ry: r() * 6, s: 1 }; }), { cast: true }));
    }
    if (heaps.length) {
      const cols = ['#e8452c', '#ffc531', '#ff7a1a'];
      add(instMesh(new THREE.ConeGeometry(1.5, 0.9, 16), stdMat({ roughness: 1 }), heaps.map((h, i) => { posAt(T, h.s, h.lat, 0, V); return { x: V.x, y: V.y + 0.45, z: V.z, ry: r() * 6, col: cols[i % 3] }; }), { cast: true }));
    }
  }
  // the world around each circuit
  if (id === 'fair') buildFair(T, S, add, r);
  else if (id === 'hill') buildHill(T, S, add, r);
  else buildRoof(T, S, add, r);
  SCN[T.id] = S;
  return S;
}
function mergeRibbons(list) {
  let n = 0, ni = 0; list.forEach((g) => { n += g.attributes.position.count; ni += g.index.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + o;
    o += g.attributes.position.count; oi += ix.length; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function mergePlain(list) {
  const ok = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; ok.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  ok.forEach((g) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
function scaleUv(g, su, sv) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * su, a.getY(i) * sv); a.needsUpdate = true; }

// String lights, poles and glowing bulbs shared by the fair and the rooftops
function stringLights(T, S, add, spans, cols, k) {
  const bulbs = [];
  spans.forEach((sp) => {
    const n = sp.n || 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n, sag = Math.sin(Math.PI * t) * (sp.sag || 1.2);
      bulbs.push({ x: lerp(sp.a[0], sp.b[0], t), y: lerp(sp.a[1], sp.b[1], t) - sag, z: lerp(sp.a[2], sp.b[2], t), s: 1, col: cols[bulbs.length % cols.length], k: k || 1 });
    }
  });
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const im = instMesh(new THREE.OctahedronGeometry(0.14, 0), m, bulbs, { receive: false });
  add(im);
  S.glow.push({ m, base: 2.6 });
  m.color.setScalar(2.6);
  // the wires
  const wires = [];
  spans.forEach((sp) => {
    const n = sp.n || 9;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, s0 = Math.sin(Math.PI * t0) * (sp.sag || 1.2), s1 = Math.sin(Math.PI * t1) * (sp.sag || 1.2);
      wires.push(lerp(sp.a[0], sp.b[0], t0), lerp(sp.a[1], sp.b[1], t0) - s0 + 0.08, lerp(sp.a[2], sp.b[2], t0), lerp(sp.a[0], sp.b[0], t1), lerp(sp.a[1], sp.b[1], t1) - s1 + 0.08, lerp(sp.a[2], sp.b[2], t1));
    }
  });
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1a1410' })));
  return bulbs;
}
// Points along one side of the lap, clear of every road, for poles, trees and stalls
function alongTrack(T, step, latFn, r, clear) {
  const out = [];
  for (let s = 0; s < T.L; s += step) {
    const lat = latFn(s);
    posAt(T, s, lat, 0, V);
    if (clear != null && roadClear(T, V.x, V.z) < clear) continue;
    if (inGap(T, s)) continue;
    out.push({ x: V.x, y: V.y, z: V.z, h: FR.h, s, lat });
  }
  return out;
}
function scatter(T, n, minD, maxD, r, test) {
  const out = []; const b = T.box; let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const x = lerp(b.x0 - maxD, b.x1 + maxD, r()), z = lerp(b.z0 - maxD, b.z1 + maxD, r());
    const d = roadClear(T, x, z);
    if (d < minD || d > maxD) continue;
    if (test && !test(x, z, d)) continue;
    out.push({ x, z, d });
  }
  return out;
}

function lightPools(S, add, list, col, k, size) {
  const m = new THREE.MeshBasicMaterial({ map: textures().glow, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, fog: true });
  m.color.multiplyScalar(k);
  const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2);
  const im = instMesh(g, m, list, { receive: false }); im.renderOrder = 3; add(im);
  S.glow.push({ m, base: k, col });
  return im;
}
/* ---- Mela Lights: the fairground at night */
function buildFair(T, S, add, r) {
  const tx = textures(), hw = T.def.hw;
  // ground: trampled grass with dirt
  const gg = new THREE.PlaneGeometry(900, 900, 30, 30); gg.rotateX(-Math.PI / 2);
  const gc = new Float32Array(gg.attributes.position.count * 3), gn = vnoise(5, 12);
  for (let i = 0; i < gg.attributes.position.count; i++) { const x = gg.attributes.position.getX(i), z = gg.attributes.position.getZ(i); const n = gn((x + 450) / 900, (z + 450) / 900); _c.set('#55703f').lerp(_c2.set('#7a6040'), clamp(n * 1.6 - 0.4, 0, 1)); gc[i * 3] = _c.r; gc[i * 3 + 1] = _c.g; gc[i * 3 + 2] = _c.b; }
  gg.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  const gtex = tx.grass.clone(); gtex.needsUpdate = true; gtex.repeat.set(90, 90); gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: gtex, vertexColors: true, roughness: 1 }));
  ground.position.set(T.box.cx, -0.32, T.box.cz); ground.receiveShadow = true; add(ground);
  // fence: red and white panels
  const fence = alongTrack(T, 2.4, (s) => (Math.floor(s / 2.4) % 2 ? 1 : 1) * (hw + T.def.wall + 0.4), r, T.def.wall - 0.2).concat(alongTrack(T, 2.4, () => -(hw + T.def.wall + 0.4), r, T.def.wall - 0.2));
  add(instMesh(mergeG([boxG(2.3, 0.7, 0.12, '#ffffff', [0, 0.55, 0]), boxG(0.12, 1.0, 0.12, '#ffffff', [1.1, 0.5, 0])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), fence.map((p, i) => ({ x: p.x, y: p.y - 0.25, z: p.z, ry: p.h + Math.PI / 2, col: i % 2 ? '#e8452c' : '#f4f1ea' })), { cast: true }));
  // light poles with strings of bulbs between them on both sides of the lap
  const poles = alongTrack(T, 16, (s) => hw + T.def.wall + 1.4, r, T.def.wall).concat(alongTrack(T, 16, () => -(hw + T.def.wall + 1.4), r, T.def.wall));
  add(instMesh(mergeG([cylG(0.12, 0.16, 6, 6, '#3a3540', [0, 3, 0]), sphG(0.22, '#3a3540', [0, 6.05, 0], null, 6, 4)]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), poles.map((p) => ({ x: p.x, y: p.y - 0.3, z: p.z })), { cast: true }));
  const spans = [];
  const side = (sg) => poles.filter((p) => Math.sign(p.lat) === sg).sort((a, b) => a.s - b.s);
  [1, -1].forEach((sg) => { const l = side(sg); for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; if (Math.hypot(a.x - b.x, a.z - b.z) > 24) continue; spans.push({ a: [a.x, a.y + 5.7, a.z], b: [b.x, b.y + 5.7, b.z], sag: 1.1, n: 9 }); } });
  // and a few right across the main straight
  for (let k = 0; k < 4; k++) { const s = T.startS + 18 + k * 14; posAt(T, s, hw + 4, 0, V); const a = [V.x, V.y + 7, V.z]; posAt(T, s, -hw - 4, 0, V); spans.push({ a, b: [V.x, V.y + 7, V.z], sag: 1.6, n: 14 }); }
  stringLights(T, S, add, spans, ['#ffb24a', '#ff5a7a', '#5ad1ff', '#ffe066', '#9b6bff', '#7dff9a']);
  // warm pools of light on the ground under the poles
  lightPools(S, add, poles.map((p) => ({ x: p.x, y: p.y - 0.2, z: p.z, s: 1 })), '#ffb070', 0.42, 12);
  // the giant wheel
  {
    const sc = T.def.scale, cx = 128 * sc, cz = -66 * sc, R = 21, cy = R + 4;
    const fw = new THREE.Group(); fw.position.set(cx, 0, cz); fw.rotation.y = 0.35; add(fw);
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7 });
    const legs = mergeG([limbG([-9, 0, 3], [0, cy, 1.4], 0.45, '#d8d4cc'), limbG([9, 0, 3], [0, cy, 1.4], 0.45, '#d8d4cc'), limbG([-9, 0, -3], [0, cy, -1.4], 0.45, '#d8d4cc'), limbG([9, 0, -3], [0, cy, -1.4], 0.45, '#d8d4cc'), cylG(0.6, 0.6, 3.4, 12, '#9aa0a8', [0, cy, 0], [Math.PI / 2, 0, 0]), boxG(22, 0.6, 7, '#5a4a3a', [0, 0.3, 0])]);
    const lm = new THREE.Mesh(legs, metal); lm.castShadow = true; fw.add(lm);
    const wheel = new THREE.Group(); wheel.position.set(0, cy, 0); fw.add(wheel);
    const wp = [torG(R, 0.32, '#e9e4dc', [0, 0, 1.2]), torG(R, 0.32, '#e9e4dc', [0, 0, -1.2]), torG(R * 0.45, 0.2, '#e9e4dc', [0, 0, 1.2]), torG(R * 0.45, 0.2, '#e9e4dc', [0, 0, -1.2])];
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; wp.push(limbG([0, 0, 1.2], [Math.cos(a) * R, Math.sin(a) * R, 1.2], 0.12, '#cfc8bd'), limbG([0, 0, -1.2], [Math.cos(a) * R, Math.sin(a) * R, -1.2], 0.12, '#cfc8bd'), limbG([Math.cos(a) * R, Math.sin(a) * R, 1.2], [Math.cos(a) * R, Math.sin(a) * R, -1.2], 0.1, '#cfc8bd')); }
    const wm = new THREE.Mesh(mergeG(wp), metal); wm.castShadow = true; wheel.add(wm);
    // the rim and spokes outlined in lights
    const lb = []; const lc = ['#ff5a7a', '#ffb24a', '#5ad1ff', '#ffe066', '#7dff9a', '#9b6bff'];
    for (let i = 0; i < 96; i++) { const a = i / 96 * TAU; lb.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, z: 1.55, col: lc[Math.floor(i / 4) % 6], s: 1.3 }); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; for (let k = 1; k < 7; k++) lb.push({ x: Math.cos(a) * R * k / 7, y: Math.sin(a) * R * k / 7, z: 1.55, col: lc[i % 6], s: 1 }); }
    const lmat = new THREE.MeshBasicMaterial({ color: '#ffffff' }); lmat.color.setScalar(3.4);
    const lim = instMesh(new THREE.IcosahedronGeometry(0.17, 0), lmat, lb, { receive: false }); wheel.add(lim);
    S.glow.push({ m: lmat, base: 3.4 });
    // gondolas stay level as the wheel turns
    const NG = 12, gondG = mergeG([boxG(1.8, 1.4, 1.6, '#ffffff', [0, -1.6, 0]), cylG(0.12, 1.2, 0.5, 8, '#ffffff', [0, -0.6, 0]), prep(new THREE.ConeGeometry(1.4, 0.7, 4), '#ffffff', [0, -0.55, 0], [0, Math.PI / 4, 0]), boxG(1.9, 0.12, 1.7, '#ffffff', [0, -2.35, 0])]);
    const gcol = ['#e8452c', '#ffb736', '#2d7fd1', '#2fbf4a', '#e94f8a', '#8a4fe0'];
    const gim = instMesh(gondG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }), new Array(NG).fill(0).map((z, i) => ({ x: 0, y: 0, z: 0, col: gcol[i % 6] })), { cast: true });
    fw.add(gim);
    let ang = 0;
    S.anims.push((dt) => {
      ang += dt * 0.12; wheel.rotation.z = ang;
      for (let i = 0; i < NG; i++) { const a = ang + i / NG * TAU; _mtx.makeTranslation(Math.cos(a) * R, cy + Math.sin(a) * R, 0); gim.setMatrixAt(i, _mtx); }
      gim.instanceMatrix.needsUpdate = true;
    });
    S.wheelPos = { x: cx, y: cy, z: cz };
  }
  // carousel
  {
    const sc = T.def.scale, cx = 30 * sc, cz = 4 * sc;
    const cg = new THREE.Group(); cg.position.set(cx, -0.3, cz); add(cg);
    const base = new THREE.Mesh(mergeG([cylG(6, 6.2, 0.8, 28, '#e9dcc6', [0, 0.4, 0]), cylG(0.5, 0.5, 6, 12, '#d9b44a', [0, 3.6, 0])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }));
    base.receiveShadow = true; base.castShadow = true; cg.add(base);
    const top = new THREE.Group(); cg.add(top);
    const roofTex = tx.stripes.clone(); roofTex.needsUpdate = true; roofTex.repeat.set(3, 1);
    const roofM = new THREE.Mesh(new THREE.ConeGeometry(7, 2.6, 24, 1, true), new THREE.MeshStandardMaterial({ map: roofTex, side: THREE.DoubleSide, roughness: 0.7 })); roofM.position.y = 7.6; roofM.castShadow = true; top.add(roofM);
    const hp = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, x = Math.cos(a) * 4.6, z = Math.sin(a) * 4.6; hp.push(cylG(0.06, 0.06, 5.4, 6, '#f2d27a', [x, 3.6, z]), boxG(0.4, 0.7, 1.4, ['#ffffff', '#ffd23f', '#ff9ab0', '#9ad8ff'][i % 4], [x, 2.4 + (i % 2) * 0.5, z], [0, -a, 0]), sphG(0.32, ['#ffffff', '#ffd23f', '#ff9ab0', '#9ad8ff'][i % 4], [x + Math.cos(a + Math.PI / 2) * 0.7, 2.9 + (i % 2) * 0.5, z + Math.sin(a + Math.PI / 2) * 0.7], [0.8, 1, 0.8])); }
    const horses = new THREE.Mesh(mergeG(hp), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 })); horses.castShadow = true; top.add(horses);
    const cl = []; for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; cl.push({ x: Math.cos(a) * 6.9, y: 6.35, z: Math.sin(a) * 6.9, col: i % 2 ? '#ffe066' : '#ff8a5a' }); }
    const cm = new THREE.MeshBasicMaterial({ color: '#ffffff' }); cm.color.setScalar(3); top.add(instMesh(new THREE.IcosahedronGeometry(0.15, 0), cm, cl, { receive: false })); S.glow.push({ m: cm, base: 3 });
    S.anims.push((dt, t) => { top.rotation.y += dt * 0.5; horses.position.y = Math.sin(t * 2) * 0.15; });
  }
  // stalls with striped canopies, each lit from inside
  const stalls = scatter(T, 34, T.def.wall + 4, 26, r, (x, z) => Math.hypot(x - 128 * T.def.scale, z + 66 * T.def.scale) > 20 && Math.hypot(x - 30 * T.def.scale, z - 4 * T.def.scale) > 11);
  const stG = mergeG([boxG(4, 1.2, 3, '#ffffff', [0, 0.6, 0]), boxG(4, 0.15, 3.2, '#ffffff', [0, 1.25, 0]), cylG(0.07, 0.07, 2.4, 6, '#ffffff', [1.9, 2.3, 1.4]), cylG(0.07, 0.07, 2.4, 6, '#ffffff', [-1.9, 2.3, 1.4]), cylG(0.07, 0.07, 2.4, 6, '#ffffff', [1.9, 2.3, -1.4]), cylG(0.07, 0.07, 2.4, 6, '#ffffff', [-1.9, 2.3, -1.4])]);
  const scol = ['#c8a070', '#b98a5a', '#d8b890'];
  const sl = stalls.map((p, i) => ({ x: p.x, y: nearY(T, p.x, p.z) - 0.3, z: p.z, ry: Math.atan2(T.box.cx - p.x, T.box.cz - p.z), col: scol[i % 3] }));
  add(instMesh(stG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), sl, { cast: true }));
  const canG = new THREE.ConeGeometry(3.2, 1.5, 4, 1, true); canG.rotateY(Math.PI / 4); canG.translate(0, 4.1, 0);
  const cTex = tx.stripes.clone(); cTex.needsUpdate = true; cTex.repeat.set(2, 1);
  add(instMesh(canG, new THREE.MeshStandardMaterial({ map: cTex, side: THREE.DoubleSide, roughness: 0.7 }), sl.map((p) => ({ x: p.x, y: p.y, z: p.z, ry: p.ry, sx: 1, sy: 1, sz: 0.85 })), { cast: true }));
  const glows = sl.map((p, i) => ({ x: p.x, y: p.y + 3.3, z: p.z, col: ['#ffcf7a', '#ffb24a', '#ff9ad0', '#9ae0ff'][i % 4], s: 1 }));
  const gm = new THREE.MeshBasicMaterial({ color: '#ffffff' }); gm.color.setScalar(3);
  add(instMesh(new THREE.IcosahedronGeometry(0.3, 0), gm, glows, { receive: false })); S.glow.push({ m: gm, base: 3 });
  // balloons tied to the stalls
  const bal = []; stalls.slice(0, 14).forEach((p, i) => { for (let k = 0; k < 4; k++) bal.push({ x: p.x + rnd(1.5) + 2, y: 5.6 + r() * 1.6, z: p.z + rnd(1.5), col: ['#ff4f9a', '#ffd23f', '#38c8ff', '#44ffa8', '#ff6a1a'][(i + k) % 5], sx: 0.45, sy: 0.55, sz: 0.45 }); });
  add(instMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.05 }), bal, { cast: true }));
  // the big tent over the shortcut
  if (T.sc) {
    const sc = T.sc, arcs = [];
    for (let q = Math.round(sc.N * 0.3); q < sc.N * 0.72; q += 2) arcs.push({ x: sc.X[q], y: sc.Y[q], z: sc.Z[q], ry: sc.HD[q], col: (q >> 1) % 2 ? '#e8452c' : '#fff2dc' });
    const ag = new THREE.CylinderGeometry(sc.hw + 1.2, sc.hw + 1.2, 2.2, 20, 1, true, -Math.PI / 2, Math.PI); ag.rotateZ(Math.PI / 2); ag.rotateY(Math.PI / 2);
    add(instMesh(ag, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), arcs, { cast: true }));
    const tl = arcs.filter((a, i) => i % 2 === 0).map((a, i) => ({ x: a.x, y: a.y + sc.hw + 1.0, z: a.z, col: i % 2 ? '#ffe066' : '#ff8a5a', s: 1.4 }));
    const tm = new THREE.MeshBasicMaterial({ color: '#ffffff' }); tm.color.setScalar(3.2); add(instMesh(new THREE.IcosahedronGeometry(0.19, 0), tm, tl, { receive: false })); S.glow.push({ m: tm, base: 3.2 });
  }
  // a skyline glowing on the horizon
  const sky = [];
  for (let i = 0; i < 70; i++) { const a = i / 70 * TAU + r() * 0.05, d = 330 + r() * 60, hgt = 14 + r() * 50; sky.push({ x: T.box.cx + Math.cos(a) * d, y: hgt / 2 - 1, z: T.box.cz + Math.sin(a) * d, sx: 14 + r() * 20, sy: hgt, sz: 14 + r() * 20, ry: a }); }
  const skyMat = new THREE.MeshStandardMaterial({ color: '#1a1830', emissive: '#ffffff', emissiveMap: tx.windowsLit, emissiveIntensity: 0.9, roughness: 0.9, map: tx.windowsLit });
  skyMat.map = null; add(instMesh(new THREE.BoxGeometry(1, 1, 1), skyMat, sky, { receive: false }));
  // floodlight towers
  const towers = scatter(T, 6, T.def.wall + 6, 18, r);
  add(instMesh(mergeG([cylG(0.25, 0.4, 16, 8, '#8a8f98', [0, 8, 0]), boxG(2.4, 1.4, 0.4, '#3a3d44', [0, 16.4, 0])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }), towers.map((p) => ({ x: p.x, y: -0.3, z: p.z, ry: Math.atan2(T.box.cx - p.x, T.box.cz - p.z) })), { cast: true }));
  const tg = new THREE.MeshBasicMaterial({ color: '#fff6e0' }); tg.color.setScalar(4);
  add(instMesh(new THREE.BoxGeometry(2.1, 1.1, 0.1), tg, towers.map((p) => { const ry = Math.atan2(T.box.cx - p.x, T.box.cz - p.z); return { x: p.x + Math.sin(ry) * 0.25, y: 16.1, z: p.z + Math.cos(ry) * 0.25, ry }; }), { receive: false }));
  S.glow.push({ m: tg, base: 4 });
  S.fireworks = 0;
}
const _c2 = new THREE.Color();

/* ---- Monsoon Hills: a wet hill station */
function buildHill(T, S, add, r) {
  const tx = textures(), hw = T.def.hw, b = T.box;
  // terrain shaped round the road, rising to hills further out
  const SZ = 520, NG = 110, gx0 = b.cx - SZ / 2, gz0 = b.cz - SZ / 2;
  const geo = new THREE.PlaneGeometry(SZ, SZ, NG, NG); geo.rotateX(-Math.PI / 2);
  const pa = geo.attributes.position, hn = vnoise(23, 9), hn2 = vnoise(29, 24);
  const H = new Float32Array((NG + 1) * (NG + 1)), col = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i) + b.cx, z = pa.getZ(i) + b.cz;
    let best = 1e18, by = 0; for (let q = 0; q < T.N; q += 2) { const dx = T.X[q] - x, dz = T.Z[q] - z, d = dx * dx + dz * dz; if (d < best) { best = d; by = T.Y[q]; } }
    let d = Math.sqrt(best);
    if (T.sc) { for (let q = 0; q < T.sc.N; q++) { const dx = T.sc.X[q] - x, dz = T.sc.Z[q] - z, dd = Math.sqrt(dx * dx + dz * dz); if (dd < d) { d = dd; by = T.sc.Y[q] - 1.5; } } }
    const u = (x - gx0) / SZ, v = (z - gz0) / SZ;
    const far = smooth01((d - hw - 7) / 60);
    const hills = by * 0.6 + (hn(u, v) * 26 + hn2(u, v) * 6) * (0.35 + far * 1.2) + far * 10;
    const h = d < hw + 4 ? by - 0.45 : lerp(by - 0.5, hills, far);
    pa.setY(i, h); H[i] = h;
    _c.set('#4f7a38').lerp(_c2.set('#2f5a2a'), clamp(hn2(u * 3, v * 3), 0, 1)).lerp(_c2.set('#6a6a5a'), clamp((h - by - 12) / 25, 0, 0.6));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const gtex = tx.grass.clone(); gtex.needsUpdate = true; gtex.repeat.set(70, 70); gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping;
  const terr = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: gtex, normalMap: tx.grassN, vertexColors: true, roughness: 0.92 }));
  terr.position.set(b.cx, 0, b.cz); terr.receiveShadow = true; add(terr);
  const hAt = (x, z) => {
    const fx = clamp((x - gx0) / SZ * NG, 0, NG - 0.001), fz = clamp((z - gz0) / SZ * NG, 0, NG - 0.001), ix = Math.floor(fx), iz = Math.floor(fz), tx2 = fx - ix, tz = fz - iz;
    const g = (a, c) => H[c * (NG + 1) + a];
    return lerp(lerp(g(ix, iz), g(ix + 1, iz), tx2), lerp(g(ix, iz + 1), g(ix + 1, iz + 1), tx2), tz);
  };
  S.hAt = hAt;
  // stone walls along the edges
  const walls = alongTrack(T, 3, () => hw + T.def.wall + 0.3, r, T.def.wall - 0.6).concat(alongTrack(T, 3, () => -(hw + T.def.wall + 0.3), r, T.def.wall - 0.6));
  const wtex = tx.stone.clone(); wtex.needsUpdate = true;
  add(instMesh(new THREE.BoxGeometry(3.05, 1.0, 0.6), new THREE.MeshStandardMaterial({ map: wtex, normalMap: tx.stoneN, roughness: 0.75, color: '#c8c2b8' }), walls.map((p) => ({ x: p.x, y: p.y + 0.3, z: p.z, ry: p.h })), { cast: true }));
  // pines
  const pineG = mergeG([cylG(0.18, 0.3, 3, 6, '#5a3f2a', [0, 1.5, 0]), prep(new THREE.ConeGeometry(2.2, 3.6, 8), '#2f5a33', [0, 3.6, 0]), prep(new THREE.ConeGeometry(1.7, 3.0, 8), '#376a3a', [0, 5.2, 0]), prep(new THREE.ConeGeometry(1.1, 2.4, 8), '#3f7442', [0, 6.6, 0])]);
  const pines = scatter(T, 260, T.def.wall + 3.5, 110, r).map((p) => { const s = 0.8 + r() * 0.9; return { x: p.x, y: hAt(p.x, p.z) - 0.2, z: p.z, ry: r() * 6, s }; });
  add(instMesh(pineG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), pines, { cast: true }));
  // cottages with red tin roofs
  const cot = scatter(T, 12, T.def.wall + 6, 40, r).map((p) => ({ x: p.x, y: hAt(p.x, p.z), z: p.z, ry: Math.atan2(T.box.cx - p.x, T.box.cz - p.z) }));
  const wallsG = new THREE.BoxGeometry(6, 3.4, 5); wallsG.translate(0, 1.7, 0);
  add(instMesh(wallsG, new THREE.MeshStandardMaterial({ map: tx.plaster, roughness: 0.85 }), cot.map((p, i) => Object.assign({ col: ['#f4efe6', '#e7d6b8', '#cfe0e8'][i % 3] }, p)), { cast: true }));
  const roofG = new THREE.CylinderGeometry(0.01, 4.4, 2.2, 4, 1); roofG.rotateY(Math.PI / 4); roofG.scale(1.05, 1, 0.85); roofG.translate(0, 4.5, 0);
  add(instMesh(roofG, new THREE.MeshStandardMaterial({ color: '#a8332a', roughness: 0.45, metalness: 0.5 }), cot, { cast: true }));
  const win = cot.map((p) => ({ x: p.x + Math.sin(p.ry) * 2.52, y: p.y + 1.8, z: p.z + Math.cos(p.ry) * 2.52, ry: p.ry }));
  const wm = new THREE.MeshBasicMaterial({ color: '#ffc46a' }); wm.color.multiplyScalar(1.8);
  add(instMesh(new THREE.PlaneGeometry(1.2, 1.0), wm, win, { receive: false })); S.glow.push({ m: wm, base: 1.8, col: '#ffc46a' });
  // lamp posts glowing in the rain
  const lamps = alongTrack(T, 26, (s) => (Math.floor(s / 26) % 2 ? 1 : -1) * (hw + T.def.wall - 0.6), r, T.def.wall - 1.5);
  add(instMesh(mergeG([cylG(0.08, 0.12, 4.6, 8, '#2b2d33', [0, 2.3, 0]), boxG(0.5, 0.32, 0.5, '#2b2d33', [0, 4.7, 0])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }), lamps.map((p) => ({ x: p.x, y: p.y, z: p.z })), { cast: true }));
  const lg = new THREE.MeshBasicMaterial({ color: '#ffe0a0' }); lg.color.multiplyScalar(3.5);
  add(instMesh(new THREE.BoxGeometry(0.36, 0.2, 0.36), lg, lamps.map((p) => ({ x: p.x, y: p.y + 4.5, z: p.z })), { receive: false })); S.glow.push({ m: lg, base: 3.5, col: '#ffe0a0' });
  lightPools(S, add, lamps.map((p) => ({ x: p.x, y: p.y + 0.07, z: p.z, s: 1 })), '#ffd090', 0.3, 10);
  // the waterfall behind the ledge
  if (T.sc) {
    const sc = T.sc, q = Math.round(sc.N * 0.5), x = sc.X[q], z = sc.Z[q], y = sc.Y[q], h = sc.HD[q];
    const nx = -sc.TZ[q], nz = sc.TX[q];
    // which side is away from the main lap
    const testA = roadClear(T, x + nx * 8, z + nz * 8), testB = roadClear(T, x - nx * 8, z - nz * 8);
    const sd = testA > testB ? 1 : -1, bx = x + nx * sd * (sc.hw + 2.2), bz = z + nz * sd * (sc.hw + 2.2);
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(34, 46, 8), new THREE.MeshStandardMaterial({ map: tx.stone, normalMap: tx.stoneN, color: '#8a8478', roughness: 0.8 }));
    cliff.position.set(bx + nx * sd * 4, y + 10, bz + nz * sd * 4); cliff.rotation.y = h; cliff.castShadow = true; cliff.receiveShadow = true; add(cliff);
    const ftex = tx.falls.clone(); ftex.needsUpdate = true; ftex.repeat.set(2, 1.4);
    const fm = new THREE.MeshStandardMaterial({ map: ftex, transparent: true, opacity: 0.9, emissive: '#bcd6e6', emissiveIntensity: 0.4, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 });
    const falls = new THREE.Mesh(new THREE.PlaneGeometry(9, 34), fm);
    falls.position.set(bx + nx * sd * 0.2, y + 9, bz + nz * sd * 0.2); falls.rotation.y = h + (sd > 0 ? Math.PI : 0); add(falls);
    const foam = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshStandardMaterial({ color: '#dfe9ef', roughness: 0.3, transparent: true, opacity: 0.75, normalMap: tx.water }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(bx - nx * sd * 3, y - 8.5, bz - nz * sd * 3); add(foam);
    S.falls = { x: bx, y: y, z: bz, tex: ftex };
    S.anims.push((dt) => { ftex.offset.y += dt * 1.9; });
  }
  // low cloud drifting across the hills
  const mist = [];
  for (let i = 0; i < 26; i++) { const a = r() * TAU, d = 70 + r() * 140; mist.push({ x: b.cx + Math.cos(a) * d, y: 18 + r() * 22, z: b.cz + Math.sin(a) * d, s: 26 + r() * 30 }); }
  const mm = new THREE.SpriteMaterial({ map: tx.glow, color: '#d8dedf', transparent: true, opacity: 0.32, depthWrite: false, fog: true });
  S.mist = mist.map((p) => { const sp = new THREE.Sprite(mm); sp.position.set(p.x, p.y, p.z); sp.scale.set(p.s * 1.8, p.s * 0.6, 1); add(sp); return sp; });
  // a distant ridge line
  const ridge = [];
  for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, d = 300 + r() * 40; ridge.push({ x: b.cx + Math.cos(a) * d, y: -10, z: b.cz + Math.sin(a) * d, sx: 60 + r() * 50, sy: 50 + r() * 70, sz: 60 + r() * 50, ry: a }); }
  add(instMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: '#4c6050', roughness: 1 }), ridge, { receive: false }));
}

/* ---- Spice Rooftops: the market at sunset */
function buildRoof(T, S, add, r) {
  const tx = textures(), hw = T.def.hw, b = T.box, W2 = hw + T.def.wall + 0.3;
  // the street far below
  const st = tx.street.clone(); st.needsUpdate = true; st.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: st, roughness: 0.95, color: '#8a7a6a' }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(b.cx, 0, b.cz); ground.receiveShadow = true; add(ground);
  // buildings under the lap
  const blocks = [];
  const pal = ['#f2c9a0', '#e8a0a0', '#9ccbe0', '#f4e3b0', '#c6e0b0', '#f0b48a', '#e2c8f0'];
  for (let s = 0; s < T.L; s += 7) {
    if (inGap(T, s) || inGap(T, s + 3.5) || inGap(T, s - 3.5)) continue;
    frameAt(T, s);
    blocks.push({ x: FR.x, y: FR.y / 2 - 0.08, z: FR.z, ry: FR.h, sx: 2 * W2 + 0.6, sy: FR.y, sz: 8.4, col: pal[Math.floor(s / 7) % pal.length] });
  }
  const bTex = tx.plaster.clone(); bTex.needsUpdate = true; bTex.repeat.set(3, 2);
  const bMat = new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.88 });
  add(instMesh(new THREE.BoxGeometry(1, 1, 1), bMat, blocks, { cast: true }));
  // parapets
  const par = alongTrack(T, 2, () => W2, r, T.def.wall - 0.6).concat(alongTrack(T, 2, () => -W2, r, T.def.wall - 0.6));
  add(instMesh(mergeG([boxG(2.05, 0.5, 0.26, '#ffffff', [0, 0.25, 0]), boxG(2.1, 0.07, 0.34, '#ffffff', [0, 0.53, 0])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), par.map((p, i) => ({ x: p.x, y: p.y, z: p.z, ry: p.h, col: Math.floor(i / 6) % 2 ? '#f4e7d4' : '#d97a4a' })), { cast: true }));
  // the city all round: flat roofs, water tanks, domes and pavilions
  const city = scatter(T, 170, T.def.wall + 4, 120, r).map((p, i) => { const h = 5 + r() * 8 + (p.d > 60 ? r() * 10 : 0); return { x: p.x, y: h / 2, z: p.z, sx: 8 + r() * 10, sy: h, sz: 8 + r() * 10, ry: Math.round(r() * 4) * Math.PI / 2 + rnd(0.2), col: pal[i % pal.length] }; });
  const ok = city.filter((c) => roadClear(T, c.x, c.z) > Math.max(c.sx, c.sz) * 0.72 + 1.5);
  add(instMesh(new THREE.BoxGeometry(1, 1, 1), bMat, ok, { cast: true }));
  const tanks = ok.filter((c, i) => i % 3 === 0).map((c) => ({ x: c.x + rnd(c.sx * 0.5), y: c.sy + 0.9, z: c.z + rnd(c.sz * 0.5) }));
  add(instMesh(mergeG([cylG(0.9, 0.9, 1.6, 12, '#2b2b30', [0, 0, 0]), cylG(0.95, 0.95, 0.12, 12, '#3a3a40', [0, 0.85, 0])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), tanks, { cast: true }));
  const domes = ok.filter((c, i) => i % 11 === 4).map((c) => ({ x: c.x, y: c.sy, z: c.z, s: Math.min(c.sx, c.sz) * 0.35 }));
  add(instMesh(mergeG([prep(new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI / 2), '#f4ead8'), cylG(0.06, 0.12, 0.8, 6, '#d9a441', [0, 1.3, 0])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 }), domes, { cast: true }));
  const chh = ok.filter((c, i) => i % 13 === 7).map((c) => ({ x: c.x, y: c.sy, z: c.z, s: 1.4 }));
  const chG = mergeG([cylG(0.12, 0.12, 2.2, 6, '#f2e6d2', [1, 1.1, 1]), cylG(0.12, 0.12, 2.2, 6, '#f2e6d2', [-1, 1.1, 1]), cylG(0.12, 0.12, 2.2, 6, '#f2e6d2', [1, 1.1, -1]), cylG(0.12, 0.12, 2.2, 6, '#f2e6d2', [-1, 1.1, -1]), boxG(2.6, 0.2, 2.6, '#f2e6d2', [0, 2.3, 0]), prep(new THREE.SphereGeometry(1.3, 14, 8, 0, TAU, 0, Math.PI / 2), '#f2e6d2', [0, 2.4, 0])]);
  add(instMesh(chG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), chh, { cast: true }));
  // far skyline
  const sky = [];
  for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, d = 250 + r() * 80, h = 8 + r() * 26; sky.push({ x: b.cx + Math.cos(a) * d, y: h / 2, z: b.cz + Math.sin(a) * d, sx: 16 + r() * 24, sy: h, sz: 16 + r() * 24, ry: a, col: pal[i % pal.length] }); }
  add(instMesh(new THREE.BoxGeometry(1, 1, 1), bMat, sky, { receive: false }));
  // clotheslines of bright cloth across the lap
  [1.6, 9.5, 13.9].forEach((p, k) => {
    const s = T.sOfP(p); posAt(T, s, W2, 0, V); const a = [V.x, V.y + 4.2, V.z]; posAt(T, s, -W2, 0, V); const bb = [V.x, V.y + 4.2, V.z];
    const poles = [{ x: a[0], y: a[1] - 2.1, z: a[2] }, { x: bb[0], y: bb[1] - 2.1, z: bb[2] }];
    add(instMesh(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 6), new THREE.MeshStandardMaterial({ color: '#5a4030' }), poles, { cast: true }));
    const cloth = [];
    for (let i = 1; i < 9; i++) { const t = i / 9, sag = Math.sin(Math.PI * t) * 0.6; cloth.push({ x: lerp(a[0], bb[0], t), y: lerp(a[1], bb[1], t) - sag - 0.55, z: lerp(a[2], bb[2], t), ry: FR.h, col: ['#e94f8a', '#ffd23f', '#2fbf4a', '#2d7fd1', '#ff6a1a', '#8a4fe0'][(i + k) % 6] }); }
    const clm = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
    const cim = instMesh(new THREE.PlaneGeometry(0.9, 1.1, 1, 4), clm, cloth, { cast: true }); add(cim);
    const base = cloth.map((c) => ({ x: c.x, y: c.y, z: c.z, ry: c.ry }));
    S.anims.push((dt, t) => { base.forEach((c, i) => { _eu.set(Math.sin(t * 2.2 + i) * 0.25, c.ry, 0, 'YXZ'); _qt.setFromEuler(_eu); _mtx.compose(_ps.set(c.x, c.y, c.z), _qt, _sc.set(1, 1, 1)); cim.setMatrixAt(i, _mtx); }); cim.instanceMatrix.needsUpdate = true; });
    const wl = new THREE.BufferGeometry(); wl.setAttribute('position', new THREE.Float32BufferAttribute(a.concat(bb), 3)); add(new THREE.LineSegments(wl, new THREE.LineBasicMaterial({ color: '#2a2018' })));
  });
  // kites riding the evening wind
  const kites = [];
  for (let i = 0; i < 22; i++) { const a = r() * TAU, d = 30 + r() * 140; kites.push({ x: b.cx + Math.cos(a) * d, y: 30 + r() * 30, z: b.cz + Math.sin(a) * d, col: ['#ff4f9a', '#ffd23f', '#38c8ff', '#44ffa8', '#ff6a1a', '#9b6bff'][i % 6], ph: r() * 6 }); }
  const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.9, 0, 0.7, 0, 0, 0, -0.9, 0, -0.7, 0, 0], 3)); kg.setIndex([0, 1, 2, 0, 2, 3]); kg.computeVertexNormals();
  const kim = instMesh(kg, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6, emissive: '#331a10' }), kites, { receive: false }); kim.frustumCulled = false; add(kim);
  S.anims.push((dt, t) => { kites.forEach((k, i) => { _eu.set(Math.sin(t * 1.3 + k.ph) * 0.3, t * 0.1 + k.ph, Math.sin(t * 0.9 + k.ph) * 0.4, 'YXZ'); _qt.setFromEuler(_eu); _mtx.compose(_ps.set(k.x + Math.sin(t * 0.4 + k.ph) * 3, k.y + Math.sin(t * 0.7 + k.ph) * 1.5, k.z), _qt, _sc.set(1.6, 1.6, 1.6)); kim.setMatrixAt(i, _mtx); }); kim.instanceMatrix.needsUpdate = true; });
  // ropes along the plank bridge
  if (T.sc) {
    const sc = T.sc, rp = [];
    for (let q = 0; q < sc.N - 1; q++) { [1, -1].forEach((sg) => { const nx = -sc.TZ[q] * sg, nz = sc.TX[q] * sg, nx2 = -sc.TZ[q + 1] * sg, nz2 = sc.TX[q + 1] * sg; rp.push(sc.X[q] + nx * (sc.hw + 0.1), sc.Y[q] + 1.0, sc.Z[q] + nz * (sc.hw + 0.1), sc.X[q + 1] + nx2 * (sc.hw + 0.1), sc.Y[q + 1] + 1.0, sc.Z[q + 1] + nz2 * (sc.hw + 0.1)); }); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#c9a46e' })));
    const posts = []; for (let q = 0; q < sc.N; q += 3) [1, -1].forEach((sg) => posts.push({ x: sc.X[q] - sc.TZ[q] * sg * (sc.hw + 0.1), y: sc.Y[q] + 0.5, z: sc.Z[q] + sc.TX[q] * sg * (sc.hw + 0.1) }));
    add(instMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5), new THREE.MeshStandardMaterial({ color: '#6a4428' }), posts, { cast: true }));
  }
  // lanterns and string lights over the alley and the start
  const spans = [];
  for (let k = 0; k < 5; k++) { const s = T.startS + 10 + k * 13; posAt(T, s, W2, 0, V); const a = [V.x, V.y + 5, V.z]; posAt(T, s, -W2, 0, V); spans.push({ a, b: [V.x, V.y + 5, V.z], sag: 1.2, n: 12 }); }
  if (T.gaps.length) { const G = T.gaps[0]; for (let k = 0; k < 4; k++) { const s = lerp(G[0], G[1], k / 3); posAt(T, s, W2 + 4, 0, V); const a = [V.x, V.y - 1, V.z]; posAt(T, s, -W2 - 4, 0, V); spans.push({ a, b: [V.x, V.y - 1, V.z], sag: 1.5, n: 12 }); } }
  stringLights(T, S, add, spans, ['#ffb24a', '#ff5a7a', '#ffe066', '#7dff9a'], 1.4);
  // sacks stacked on the verges
  const stacks = alongTrack(T, 23, (s) => (Math.floor(s / 23) % 2 ? 1 : -1) * (hw + 1.6), r, 0.4).map((p) => ({ x: p.x, y: p.y, z: p.z, ry: r() * 6, s: 0.8 }));
  add(instMesh(mergeG([cylG(0.6, 0.7, 1.0, 10, '#c9a46e', [0, 0.5, 0]), sphG(0.6, '#c9a46e', [0, 1.0, 0], [1, 0.4, 1]), cylG(0.6, 0.7, 1.0, 10, '#b8925e', [1.0, 0.5, 0.2]), sphG(0.6, '#b8925e', [1.0, 1.0, 0.2], [1, 0.4, 1]), cylG(0.6, 0.7, 1.0, 10, '#d4b07a', [0.5, 1.45, 0.1])]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), stacks, { cast: true }));
}

/* ------------------------------------------------------------ renderer, sky, post */
let R3 = null;
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uFog; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uCloud; uniform float uTime; uniform float uStars; uniform float uNight; uniform float uDetail;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }',
  'void main(){',
  '  vec3 d = normalize(vDir); float y = d.y;',
  '  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.25, y));',
  '  c = mix(c, uTop, smoothstep(0.2, 0.9, y));',
  '  float sd = max(dot(d, normalize(uSunDir)), 0.0);',
  '  if (uNight > 0.5) { c += uSun * (smoothstep(0.9993, 0.9996, sd) * 2.5 + pow(sd, 60.0) * 0.25); }',
  '  else { c += uSun * (pow(sd, 1400.0) * 9.0 + pow(sd, 32.0) * 0.45 + pow(sd, 5.0) * 0.16); }',
  '  if (uStars > 0.0 && y > 0.02) { vec2 g = d.xz / (y + 0.35) * 160.0; vec2 id = floor(g); float h = h21(id); vec2 f = fract(g) - 0.5; float st = step(0.985, h) * smoothstep(0.12, 0.0, length(f)) * (0.6 + 0.4 * sin(uTime * 2.0 + h * 40.0)); c += vec3(1.0, 0.95, 0.9) * st * uStars * smoothstep(0.02, 0.3, y) * 2.2; }',
  '  if (y > 0.0 && uDetail > 0.5) {',
  '    vec2 uv = d.xz / (y + 0.12) * 0.7 + vec2(uTime * 0.008, uTime * 0.003);',
  '    float n = fbm(uv * 1.4);',
  '    float cl = smoothstep(0.62 - uCloud * 0.36, 0.98, n) * smoothstep(0.0, 0.2, y);',
  '    vec3 lit = mix(vec3(1.0, 0.97, 0.94), uSun, 0.5) * (0.6 + 0.8 * pow(sd, 4.0));',
  '    vec3 cc = mix(uMid * 0.75, lit, smoothstep(0.4, 1.0, n)) + uHor * 0.1;',
  '    if (uNight > 0.5) cc = uMid * 1.4 + uHor * 0.25;',
  '    c = mix(c, cc, cl * (0.55 + uCloud * 0.35));',
  '  }',
  '  c = mix(c, uFog, (1.0 - smoothstep(-0.02, 0.12, y)) * 0.9);',
  '  if (y < 0.0) c = uFog;',
  '  gl_FragColor = vec4(c, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}'
].join('\n');
const POST_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const BRIGHT_FS = 'uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;' +
  'void main(){ vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.0, 1.0)).rgb; c *= 0.25;' +
  ' float l = max(c.r, max(c.g, c.b)); float k = smoothstep(uThresh, uThresh * 1.6 + 0.3, l); gl_FragColor = vec4(min(c * k, vec3(24.0)), 1.0); }';
const BLUR_FS = 'uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;' +
  'void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;' +
  ' c += texture2D(tDiffuse, vUv + uDir * 1.3846).rgb * 0.316216; c += texture2D(tDiffuse, vUv - uDir * 1.3846).rgb * 0.316216;' +
  ' c += texture2D(tDiffuse, vUv + uDir * 3.2308).rgb * 0.070270; c += texture2D(tDiffuse, vUv - uDir * 3.2308).rgb * 0.070270;' +
  ' gl_FragColor = vec4(c, 1.0); }';
const COMP_FS = [
  'uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB; uniform float uBloom; uniform float uTime; uniform float uVig; uniform float uGrain; uniform float uSat; uniform vec3 uGrade; uniform float uFlash; uniform float uDim; uniform vec2 uRes; uniform float uAberr;',
  'varying vec2 vUv;',
  'void main(){',
  '  vec2 q = vUv - 0.5;',
  '  vec3 c;',
  '  if (uAberr > 0.0) { vec2 o = q * uAberr; c = vec3(texture2D(tScene, vUv + o).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - o).b); }',
  '  else c = texture2D(tScene, vUv).rgb;',
  '  vec3 b = texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.9;',
  '  c += b * uBloom;',
  '  c *= uGrade;',
  '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
  '  c = mix(vec3(l), c, uSat);',
  '  c *= uDim;',
  '  c += vec3(uFlash);',
  '  gl_FragColor = vec4(c, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '  float v = 1.0 - dot(q * vec2(1.15, 1.0), q * vec2(1.15, 1.0)) * uVig;',
  '  gl_FragColor.rgb *= clamp(v, 0.0, 1.0);',
  '  float n = fract(sin(dot(floor(vUv * uRes) + floor(uTime * 24.0) * 7.31, vec2(12.9898, 78.233))) * 43758.5453);',
  '  gl_FragColor.rgb += (n - 0.5) * uGrain;',
  '}'
].join('\n');

function setup3D(arc) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  RENDERER = renderer;
  renderer.info.autoReset = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#2a1f44', 0.004);
  const camera = new THREE.PerspectiveCamera(64, 1, 0.15, 1800);
  const hemi = new THREE.HemisphereLight('#c4d2ec', '#4a4636', 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe0b8', 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 2; sc.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const head = new THREE.SpotLight('#ffe9c4', 0, 60, 0.5, 0.55, 1.5); scene.add(head, head.target);
  const glowP = new THREE.PointLight('#ffb070', 0, 40, 1.6); scene.add(glowP);
  const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.2, -1) }, uSun: { value: new THREE.Color() }, uCloud: { value: 0.5 }, uTime: { value: 0 }, uStars: { value: 0 }, uNight: { value: 0 }, uDetail: { value: 1 } };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  R3 = {
    renderer, scene, camera, hemi, sun, head, glowP, sky, skyMat, skyU, pmrem, cur: null, worldRef: null, lost: false, models: {}, ghostModel: null,
    quality: -1, qT: 0, qN: 0, fps: 60, soft: false, lastNow: 0, camPos: new THREE.Vector3(), camTgt: new THREE.Vector3(), camInit: false, camYaw: 0, time: 0,
    sunDir: new THREE.Vector3(), envs: {}, lockQ: false, fovKick: 0, flash: 0, drops: 0, roll: 0, fov: 64, shot: 0, shotT: 0, fwT: 2, good: 0, startQ: 3, post: null
  };
  FX = createFX(scene);
  makePools();
  R3.post = makePost();
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R3.gpu = name; R3.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R3.soft = false; }
  arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
  arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
  return true;
}

function makePost() {
  const mk = (fs, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: POST_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
  const P = {
    scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    bright: mk(BRIGHT_FS, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1 } }),
    blur: mk(BLUR_FS, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }),
    comp: mk(COMP_FS, { tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, uBloom: { value: 1 }, uTime: { value: 0 }, uVig: { value: 0.9 }, uGrain: { value: 0.03 }, uSat: { value: 1.1 }, uGrade: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: 0 }, uDim: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) }, uAberr: { value: 0 } }),
    w: 0, h: 0, samples: -1
  };
  P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), P.comp); P.quad.frustumCulled = false; P.scene.add(P.quad);
  return P;
}
function sizePost(w, h, samples) {
  const P = R3.post;
  if (P.w === w && P.h === h && P.samples === samples && P.rtScene) return;
  ['rtScene', 'rtA', 'rtB', 'rtC', 'rtD'].forEach((k) => { if (P[k]) { P[k].dispose(); P[k] = null; } });
  const o = { type: THREE.HalfFloatType, depthBuffer: false };
  P.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: samples });
  const hw2 = Math.max(1, w >> 1), hh2 = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
  P.rtA = new THREE.WebGLRenderTarget(hw2, hh2, o); P.rtB = new THREE.WebGLRenderTarget(hw2, hh2, o);
  P.rtC = new THREE.WebGLRenderTarget(qw, qh, o); P.rtD = new THREE.WebGLRenderTarget(qw, qh, o);
  P.w = w; P.h = h; P.samples = samples;
}
function postPass(mat, target) { const P = R3.post; P.quad.material = mat; R3.renderer.setRenderTarget(target); R3.renderer.render(P.scene, P.cam); }
function renderWithPost(L, a) {
  const r = R3, P = r.post, ren = r.renderer;
  const sz = ren.getDrawingBufferSize(_v2b);
  const t = TIERS[r.quality];
  sizePost(Math.max(2, sz.x | 0), Math.max(2, sz.y | 0), t.samples);
  ren.setRenderTarget(P.rtScene); ren.render(r.scene, r.camera);
  // bloom: bright pass at half size, blurred, then again at a quarter
  P.bright.uniforms.tDiffuse.value = P.rtScene.texture; P.bright.uniforms.uTexel.value.set(1 / P.w, 1 / P.h); P.bright.uniforms.uThresh.value = L.thresh;
  postPass(P.bright, P.rtA);
  const bl = P.blur.uniforms;
  bl.tDiffuse.value = P.rtA.texture; bl.uDir.value.set(1 / P.rtA.width, 0); postPass(P.blur, P.rtB);
  bl.tDiffuse.value = P.rtB.texture; bl.uDir.value.set(0, 1 / P.rtA.height); postPass(P.blur, P.rtA);
  bl.tDiffuse.value = P.rtA.texture; bl.uDir.value.set(2 / P.rtA.width, 0); postPass(P.blur, P.rtC);
  bl.tDiffuse.value = P.rtC.texture; bl.uDir.value.set(0, 2 / P.rtC.height); postPass(P.blur, P.rtD);
  bl.tDiffuse.value = P.rtD.texture; bl.uDir.value.set(2 / P.rtC.width, 0); postPass(P.blur, P.rtC);
  bl.tDiffuse.value = P.rtC.texture; bl.uDir.value.set(0, 2 / P.rtC.height); postPass(P.blur, P.rtD);
  const u = P.comp.uniforms;
  u.tScene.value = P.rtScene.texture; u.tBloomA.value = P.rtA.texture; u.tBloomB.value = P.rtD.texture;
  u.uTime.value = r.time; u.uRes.value.set(P.w, P.h);
  postPass(P.comp, null);
}
const _v2b = new THREE.Vector2();

// Four looks, from everything on to a slow or software renderer.
const TIERS = [
  { px: 0.5, budget: 170000, shadow: false, map: 512, post: false, samples: 0, cheap: true, fx: 0.4, aniso: 1 },
  { px: 0.72, budget: 600000, shadow: false, map: 1024, post: true, samples: 0, cheap: false, fx: 0.7, aniso: 2 },
  { px: 0.9, budget: 1.15e6, shadow: true, map: 1024, post: true, samples: 2, cheap: false, fx: 1, aniso: 4 },
  { px: 1, budget: 2.1e6, shadow: true, map: 2048, post: true, samples: 4, cheap: false, fx: 1, aniso: 8 }
];
function resize3D(arc) {
  if (!R3) return;
  const t = TIERS[Math.max(0, R3.quality)];
  const pr = Math.min(arc.dpr * t.px, Math.sqrt((R3.soft && R3.quality === 0 ? 110000 : t.budget) / Math.max(1, arc.w * arc.h)));
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
    c = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map, vertexColors: m.vertexColors, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits });
    c.userData.full = m; cheapCache.set(m, c);
  }
  return c;
}
function applyTier() {
  const r = R3, t = TIERS[r.quality];
  r.scene.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && o.material && !Array.isArray(o.material) && !o.material.isShaderMaterial) {
      const full = fullOf(o.material), want = t.cheap ? cheapOf(full) : full;
      if (o.material !== want) o.material = want;
    }
  });
  const an = Math.min(t.aniso, r.renderer.capabilities.getMaxAnisotropy()); TEX_ANISO = an;
  ALL_TEX.forEach((tx) => { if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; } });
  r.renderer.shadowMap.enabled = t.shadow; r.sun.castShadow = t.shadow;
  if (r.sun.shadow.mapSize.x !== t.map) { r.sun.shadow.mapSize.set(t.map, t.map); if (r.sun.shadow.map) { r.sun.shadow.map.dispose(); r.sun.shadow.map = null; } }
  if (FX) FX.density = t.fx;
  if (r.blobs) r.blobs.visible = !t.shadow;
  r.skyU.uDetail.value = t.cheap ? 0 : 1;
  r.scene.environment = t.cheap ? null : (r.cur ? r.envs[r.cur.T.id] : null);
}
function setQuality(q) {
  if (!R3) return;
  q = clamp(q | 0, 0, 3);
  if (q === R3.quality) return;
  R3.quality = q;
  applyTier(); resize3D(ARC);
}

function lookFor(T) {
  const r = R3, L = LOOK[T.id];
  r.scene.fog.color.set(L.fog); r.scene.fog.density = L.fogD;
  r.hemi.color.set(L.hemiSky); r.hemi.groundColor.set(L.hemiGnd); r.hemi.intensity = L.hemiI;
  r.sun.color.set(L.sun); r.sun.intensity = L.sunI;
  r.sunDir.set(Math.sin(L.sunAz) * Math.cos(L.sunEl), Math.sin(L.sunEl), Math.cos(L.sunAz) * Math.cos(L.sunEl)).normalize();
  const u = r.skyU;
  u.uTop.value.set(L.skyTop); u.uMid.value.set(L.skyMid); u.uHor.value.set(L.skyHor); u.uFog.value.set(L.fog); u.uSun.value.set(L.sun); u.uCloud.value = L.cloud;
  u.uSunDir.value.copy(r.sunDir); u.uStars.value = L.stars; u.uNight.value = L.night;
  r.renderer.toneMappingExposure = L.exposure;
  r.renderer.setClearColor(L.fog);
  if (!r.envs[T.id]) {
    const es = new THREE.Scene(), em = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), r.skyMat); es.add(em);
    if (L.night) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb070').multiplyScalar(6) })); lamp.position.set(10, 6, 20); es.add(lamp); const l2 = lamp.clone(); l2.material = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a9a').multiplyScalar(5) }); l2.position.set(-20, 4, -8); es.add(l2); }
    r.envs[T.id] = r.pmrem.fromScene(es, 0.02, 0.1, 100).texture;
    em.geometry.dispose();
  }
  const t = TIERS[Math.max(0, r.quality)];
  r.scene.environment = t.cheap ? null : r.envs[T.id];
  r.scene.environmentIntensity = L.envI;
  const pc = r.post.comp.uniforms;
  pc.uBloom.value = L.bloom; pc.uSat.value = L.sat; pc.uGrade.value.set(L.grade[0], L.grade[1], L.grade[2]);
  r.head.intensity = 0;
}

/* ------------------------------------------------------------ pools for items, shadows, skids, petals */
function makePools() {
  const r = R3, sc = r.scene;
  // mango peel: a few curled slices of skin
  const peelG = mergeG([sphR(0.32, '#ffc531', [0.22, 0.06, 0], [0, 0.6, 0], [1, 0.25, 0.55]), sphR(0.32, '#ffb21a', [-0.22, 0.06, 0.05], [0, -0.6, 0], [1, 0.25, 0.55]), sphR(0.3, '#ffd84a', [0, 0.07, -0.25], [0, 1.4, 0], [1, 0.25, 0.55]), sphR(0.12, '#e8892c', [0, 0.1, 0], null, [1, 0.6, 1]), sphR(0.28, '#7fb83a', [0.05, 0.05, 0.25], [0, 0.2, 0], [0.8, 0.2, 0.45])]);
  r.peels = new THREE.InstancedMesh(peelG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), 40); r.peels.count = 0; r.peels.frustumCulled = false; r.peels.castShadow = true; sc.add(r.peels);
  // paper rocket: a folded paper dart with fins and a band
  const rkG = mergeG([cylG(0.16, 0.16, 1.0, 10, '#f4f1ea', [0, 0, 0], [Math.PI / 2, 0, 0]), prep(new THREE.ConeGeometry(0.16, 0.45, 10), '#e8452c', [0, 0, 0.72], [Math.PI / 2, 0, 0]), boxG(0.6, 0.03, 0.32, '#f4f1ea', [0, 0, -0.38]), boxG(0.03, 0.5, 0.32, '#f4f1ea', [0, 0.1, -0.38]), cylG(0.165, 0.165, 0.12, 10, '#2d7fd1', [0, 0, 0.15], [Math.PI / 2, 0, 0])]);
  r.rockets = new THREE.InstancedMesh(rkG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 16); r.rockets.count = 0; r.rockets.frustumCulled = false; r.rockets.castShadow = true; sc.add(r.rockets);
  // marigold shield
  const mgG = mergeG([sphR(0.17, '#ff9a1f', [0, 0, 0], null, [1, 0.6, 1]), sphR(0.12, '#ffc531', [0, 0.06, 0], null, [1, 0.6, 1]), sphR(0.05, '#b8500f', [0, 0.11, 0])]);
  const mgM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: '#ff7a1a', emissiveIntensity: 0.6 });
  r.marigolds = new THREE.InstancedMesh(mgG, mgM, 8 * 10); r.marigolds.count = 0; r.marigolds.frustumCulled = false; sc.add(r.marigolds);
  // soft round shadows for the cheaper looks
  const bt = canvasTex(64, 64, (g, w) => { g.clearRect(0, 0, w, w); softBlob(g, w / 2, w / 2, w / 2, 'rgba(0,0,0,A)', 0.7); }, { clamp: true });
  const bg = new THREE.PlaneGeometry(2.6, 3.2); bg.rotateX(-Math.PI / 2);
  r.blobs = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }), 10); r.blobs.count = 0; r.blobs.frustumCulled = false; r.blobs.renderOrder = 2; sc.add(r.blobs);
  // skid marks: a ring of fading quads on the ground
  const NS = 420;
  const sg = new THREE.InstancedBufferGeometry(); const pl = new THREE.PlaneGeometry(0.26, 0.62); pl.rotateX(-Math.PI / 2);
  sg.index = pl.index; sg.attributes.position = pl.attributes.position; sg.attributes.uv = pl.attributes.uv;
  const sAlpha = new THREE.InstancedBufferAttribute(new Float32Array(NS), 1); sAlpha.setUsage(THREE.DynamicDrawUsage); sg.setAttribute('aA', sAlpha);
  const sMat = new THREE.ShaderMaterial({
    vertexShader: 'attribute float aA; varying float vA; varying vec2 vUv; void main(){ vA = aA; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; varying vec2 vUv; void main(){ float e = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x); gl_FragColor = vec4(0.05, 0.05, 0.06, vA * e * 0.55); }',
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5
  });
  r.skids = new THREE.InstancedMesh(sg, sMat, NS); r.skids.frustumCulled = false; r.skids.renderOrder = 1; sc.add(r.skids);
  r.skidA = sAlpha; r.skidAge = new Float32Array(NS).fill(99); r.skidHead = 0; r.skidN = NS;
  _mtx.makeScale(0, 0, 0); for (let i = 0; i < NS; i++) r.skids.setMatrixAt(i, _mtx);
  // podium (hidden until a cup ends)
  const podG = mergeG([boxG(3.2, 1.6, 3, '#f2c230', [0, 0.8, 0]), boxG(3.2, 1.1, 3, '#cfd4dc', [-3.3, 0.55, 0]), boxG(3.2, 0.7, 3, '#d9894a', [3.3, 0.35, 0]), boxG(10.2, 0.15, 3.4, '#f4f1ea', [0, 0.07, 0])]);
  r.podium = new THREE.Mesh(podG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 })); r.podium.visible = false; r.podium.castShadow = true; r.podium.receiveShadow = true; sc.add(r.podium);
}
function addSkid(x, y, z, h) {
  const r = R3, i = r.skidHead; r.skidHead = (i + 1) % r.skidN;
  _eu.set(0, h, 0); _qt.setFromEuler(_eu); _mtx.compose(_ps.set(x, y + 0.045, z), _qt, _sc.set(1, 1, 1));
  r.skids.setMatrixAt(i, _mtx); r.skids.instanceMatrix.needsUpdate = true; r.skidAge[i] = 0;
}

/* ------------------------------------------------------------ the world in 3D */
function activateWorld(W) {
  const r = R3, T = W.T, S = buildScene(T);
  if (r.cur !== S) {
    if (r.cur) r.scene.remove(r.cur.group);
    r.scene.add(S.group); r.cur = S; lookFor(T);
  }
  Object.keys(r.models).forEach((k) => { r.models[k].root.visible = false; });
  r.karts = W.karts.map((K) => {
    let B = r.models[K.c.id];
    if (!B) { B = makeKart(K.c); r.models[K.c.id] = B; r.scene.add(B.root); }
    B.root.visible = true; return B;
  });
  if (r.ghostModel) { r.scene.remove(r.ghostModel.root); r.ghostModel = null; }
  if (W.ghost) { const gc = CHARS[CHAR_IDX[W.ghost.char]] || CHARS[0]; r.ghostModel = makeKart(gc, true); r.scene.add(r.ghostModel.root); }
  r.podium.visible = false;
  FX.clear();
  r.skidAge.fill(99); r.skidA.array.fill(0); r.skidA.needsUpdate = true;
  applyTier();
  r.camInit = false; r.worldRef = W; r.shot = 0; r.shotT = 0; r.fovKick = 0;
  // the item boxes of this race
  S.boxIM.count = W.boxes.length; S.starIM.count = W.boxes.length;
}

const _gp = { x: 0, y: 0, z: 0, h: 0 };
function ghostAt(g, t) {
  const n = g.x.length, f = clamp(t / g.dt, 0, n - 1.001), i = Math.floor(f), k = f - i;
  _gp.x = lerp(g.x[i], g.x[i + 1], k); _gp.y = lerp(g.y[i], g.y[i + 1], k); _gp.z = lerp(g.z[i], g.z[i + 1], k); _gp.h = g.h[i] + wrapA(g.h[i + 1] - g.h[i]) * k;
  return i < n - 2;
}
function poseWorld(W, dt) {
  const r = R3, T = W.T, S = r.cur, t = r.time;
  for (let i = 0; i < W.karts.length; i++) poseKart(r.karts[i], W.karts[i], W, dt, t);
  // the ghost of your best run
  if (r.ghostModel) {
    const G = r.ghostModel, on = W.phase === 'race' || W.phase === 'finished';
    const live = on && ghostAt(W.ghost, W.raceT);
    G.root.visible = !!live || W.phase === 'countdown';
    if (W.phase === 'countdown' || W.phase === 'intro') ghostAt(W.ghost, 0);
    G.root.position.set(_gp.x, _gp.y, _gp.z); G.root.rotation.set(0, _gp.h, 0);
    G.fl.rotation.x = G.fr.rotation.x = G.rear.rotation.x = t * 20;
  }
  // shadows under karts when the real ones are off
  if (r.blobs.visible) {
    r.blobs.count = W.karts.length;
    W.karts.forEach((K, i) => { const s = K.shrinkT > 0 ? 0.55 : 1; _eu.set(0, K.h, 0); _qt.setFromEuler(_eu); _mtx.compose(_ps.set(K.x, Math.max(K.gy, -30) + 0.05, K.z), _qt, _sc.set(s, 1, s)); r.blobs.setMatrixAt(i, _mtx); });
    r.blobs.instanceMatrix.needsUpdate = true;
  }
  // peels and rockets
  let np = 0, nr = 0;
  for (let i = 0; i < W.objs.length; i++) {
    const o = W.objs[i];
    if (o.type === 'peel' && np < 40) { _eu.set(0, o.rot, 0); _qt.setFromEuler(_eu); _mtx.compose(_ps.set(o.x, o.y, o.z), _qt, _sc.set(1.3, 1.3, 1.3)); r.peels.setMatrixAt(np++, _mtx); }
    else if (o.type === 'rocket' && nr < 16) { _eu.set(Math.sin(t * 20) * 0.1, o.h, t * 8, 'YXZ'); _qt.setFromEuler(_eu); _mtx.compose(_ps.set(o.x, o.y, o.z), _qt, _sc.set(1.2, 1.2, 1.2)); r.rockets.setMatrixAt(nr++, _mtx); }
  }
  r.peels.count = np; r.rockets.count = nr; r.peels.instanceMatrix.needsUpdate = true; r.rockets.instanceMatrix.needsUpdate = true;
  // marigolds round shielded karts
  let nm = 0;
  W.karts.forEach((K) => {
    if (K.shieldT <= 0 || nm > 72) return;
    for (let k = 0; k < 8; k++) {
      const a = t * 3 + k / 8 * TAU, rr = 1.45 * (K.shrinkT > 0 ? 0.6 : 1);
      _eu.set(0.3, a, 0); _qt.setFromEuler(_eu);
      const fade = K.shieldT < 1.5 && Math.floor(t * 10) % 2 ? 0.6 : 1;
      _mtx.compose(_ps.set(K.x + Math.cos(a) * rr, K.y + 0.75 + Math.sin(a * 2 + t) * 0.12, K.z + Math.sin(a) * rr), _qt, _sc.setScalar(fade));
      r.marigolds.setMatrixAt(nm++, _mtx);
    }
  });
  r.marigolds.count = nm; r.marigolds.instanceMatrix.needsUpdate = true;
  // item boxes spin and bob; a taken box grows back
  for (let i = 0; i < W.boxes.length; i++) {
    const b = W.boxes[i];
    const g = b.on ? 1 : clamp(1 - b.t / 0.4, 0, 1) * 0;
    const sc = b.on ? Math.min(1, (b.grow = Math.min(1, (b.grow == null ? 1 : b.grow) + dt * 3))) : (b.grow = 0);
    _eu.set(t * 0.9 + b.k, t * 1.3 + b.k, 0); _qt.setFromEuler(_eu);
    _mtx.compose(_ps.set(b.x, b.y + Math.sin(t * 2.4 + b.k) * 0.15, b.z), _qt, _sc.setScalar(sc + g));
    S.boxIM.setMatrixAt(i, _mtx);
    _eu.set(0, -t * 3, 0.4); _qt.setFromEuler(_eu); _mtx.compose(_ps, _qt, _sc.setScalar(sc));
    S.starIM.setMatrixAt(i, _mtx);
  }
  S.boxIM.instanceMatrix.needsUpdate = true; S.starIM.instanceMatrix.needsUpdate = true;
  // rolling balls
  if (S.balls) { let k = 0; W.haz.forEach((h) => { if (h.k !== 'ball') return; const m = S.balls[k++]; if (!m) return; m.position.set(h.x, h.y, h.z); frameAt(T, h.s); m.rotation.set(0, FR.h, -h.spin, 'YXZ'); }); }
  // start lights
  if (S.startLights) {
    S.startLights.forEach((m, i) => {
      let col = '#2a0808';
      if (W.phase === 'countdown') { if (W.cd <= 3 - 0.4 - i) col = '#ff2a1a'; }
      else if (W.phase === 'race' && W.raceT < 2) col = '#2aff6a';
      m.color.set(col); if (col !== '#2a0808') m.color.multiplyScalar(4);
    });
  }
}

/* ------------------------------------------------------------ camera */
const _cp = new THREE.Vector3(), _ct = new THREE.Vector3(), _cq = { x: 0, y: 0, z: 0 };
function camGround(T, x, z) {
  const m = nearestPath(T, x, z, -1, true);
  let gy = m.y;
  if (R3.cur && R3.cur.hAt) gy = Math.max(gy, R3.cur.hAt(x, z));
  return { y: gy, lat: m.lat, i: m.i, d: Math.sqrt(m.d2) };
}
function updateCamera(W, dt, a) {
  const r = R3, P = W.P, T = W.T, cam = r.camera, aspect = a.w / a.h, port = aspect < 0.85, rm = a.reducedMotion;
  const sp = clamp(P.v / 30, 0, 1.4);
  let fovT = port ? 74 : clamp(2 * Math.atan(Math.tan(32 * Math.PI / 180) / Math.max(0.55, aspect / 1.7)) * 180 / Math.PI, 52, 66);
  let mode = 'chase';
  if (W.attract) mode = 'attract';
  else if (W.phase === 'intro') mode = 'intro';
  else if (W.phase === 'countdown') mode = 'grid';
  else if (W.phase === 'podium') mode = 'podium';
  else if (W.photo && W.slowT > 0) mode = 'photo';
  else if (W.phase === 'finished' || W.phase === 'results' || W.phase === 'standings') mode = 'orbit';
  r.mode = mode;
  let snap = false;
  if (mode !== r.lastMode) { if (mode === 'intro' || mode === 'photo' || mode === 'podium' || r.lastMode === 'intro') snap = true; r.lastMode = mode; }
  const look = (x, y, z) => { _ct.set(x, y, z); };
  if (mode === 'chase' || mode === 'grid') {
    const vx = Math.sin(P.h) * P.v - Math.cos(P.h) * P.slip, vz = Math.cos(P.h) * P.v + Math.sin(P.h) * P.slip;
    // Angles blend along the short way round: a plain lerp across the +-PI seam swung the camera
    // sideways whenever the kart faced that way. Velocity only steers the view at speed, and the
    // further the view has fallen behind the kart's nose, the faster it catches up.
    const spd = Math.abs(P.v), velYaw = spd > 2 ? Math.atan2(vx, vz) : P.h;
    const want = P.h + wrapA(velYaw - P.h) * (P.drift ? 0.55 : 0.3) * clamp((spd - 3) / 12, 0, 1);
    const lag = wrapA(want - r.camYaw);
    r.camYaw = wrapA(r.camYaw + lag * Math.min(1, dt * (P.spinT > 0 || P.tumbleT > 0 ? 1.5 : 5.5 + Math.abs(lag) * 6)));
    let back = (port ? 6.4 : 5.6) + sp * 0.9, up = (port ? 2.85 : 2.3) + sp * 0.15;
    if (mode === 'grid') { back += Math.max(0, W.cd - 0.5) * 1.2; up += Math.max(0, W.cd - 0.5) * 0.5; }
    let yaw = r.camYaw;
    if (P.lookBack && mode === 'chase') { yaw += Math.PI; back = 5; }
    _cp.set(P.x - Math.sin(yaw) * back, P.y + up, P.z - Math.cos(yaw) * back);
    const ah = 4 + sp * 4;
    look(P.x + Math.sin(yaw) * ah, P.y + (port ? 0.75 : 1.0) + (P.air ? 0.4 : 0), P.z + Math.cos(yaw) * ah);
    if (P.respawnT > 0) { _cp.y += 2; }
  } else if (mode === 'intro') {
    const k = clamp(W.introT / W.introDur, 0, 1), b = T.box;
    const size = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    if (k < 0.36) {
      const u = k / 0.36, ang = -0.9 + u * 1.3;
      const lm = R3.cur.wheelPos || { x: b.cx, y: 10, z: b.cz };
      _cp.set(b.cx + Math.cos(ang) * size * 0.72, (b.y1 + 52) - u * 14, b.cz + Math.sin(ang) * size * 0.72);
      look(lerp(b.cx, lm.x, 0.5), lerp(b.y0 + 4, lm.y, 0.4), lerp(b.cz, lm.z, 0.5));
    } else if (k < 0.74) {
      const u = (k - 0.36) / 0.38, s = T.startS + T.L * (0.42 + u * 0.36);
      posAt(T, s, Math.sin(u * 5) * 3, 3.2 + Math.sin(u * 3) * 1.2, _cq); _cp.set(_cq.x, _cq.y, _cq.z);
      posAt(T, s + 22, Math.sin(u * 5 + 1) * 2, 1.4, _cq); look(_cq.x, _cq.y, _cq.z);
    } else {
      const u = smooth01((k - 0.74) / 0.26);
      posAt(T, T.startS + 6, 0, 0, _cq);
      const hx = _cq.x, hy = _cq.y, hz = _cq.z;
      const ax = hx + Math.sin(P.h) * 10, az = hz + Math.cos(P.h) * 10;
      const bx = P.x - Math.sin(P.h) * 9, bz = P.z - Math.cos(P.h) * 9;
      _cp.set(lerp(ax, bx, u), lerp(hy + 14, P.y + 4, u), lerp(az, bz, u));
      look(lerp(hx, P.x + Math.sin(P.h) * 4, u), lerp(hy + 3, P.y + 1, u), lerp(hz, P.z + Math.cos(P.h) * 4, u));
      r.camYaw = P.h;
    }
    fovT = port ? 70 : 56;
  } else if (mode === 'photo') {
    frameAt(T, T.startS);
    const sx = FR.x - FR.rx * (T.def.hw + 5), sz = FR.z - FR.rz * (T.def.hw + 5);
    _cp.set(sx, FR.y + 1.4, sz);
    look(P.x, P.y + 0.8, P.z);
    fovT = port ? 46 : 30;
  } else if (mode === 'orbit') {
    r.orb = (r.orb || 0) + dt * (rm ? 0.15 : 0.3);
    const ang = P.h + Math.PI * 0.75 + r.orb, d = port ? 7.5 : 6.5;
    _cp.set(P.x + Math.sin(ang) * d, P.y + 2.2, P.z + Math.cos(ang) * d);
    look(P.x, P.y + 0.9, P.z);
    fovT = port ? 62 : 46;
  } else if (mode === 'podium') {
    const pd = r.podPos; r.orb = (r.orb || 0) + dt * 0.12;
    const ang = pd.h + Math.sin(r.orb) * 0.45, d = port ? 15 : 11;
    _cp.set(pd.x + Math.sin(ang) * d, pd.y + 3.2, pd.z + Math.cos(ang) * d);
    look(pd.x, pd.y + 1.9, pd.z);
    fovT = port ? 62 : 48;
  } else if (mode === 'attract') {
    r.shotT += dt;
    const lead = W.order ? W.order[0] : W.karts[0], subj = W.karts[(r.shot * 3) % W.karts.length];
    if (r.shotT > 6) { r.shotT = 0; r.shot++; snap = true; }
    const kind = r.shot % 3, K = kind === 2 ? subj : lead;
    if (kind === 0) {
      const yaw = K.h + 2.6 + r.shotT * 0.12;
      _cp.set(K.x + Math.sin(yaw) * 6, K.y + 1.8, K.z + Math.cos(yaw) * 6); look(K.x, K.y + 0.8, K.z);
    } else if (kind === 1) {
      if (r.shotT < dt * 1.5 || !r.tsPos) { posAt(T, K.s + 34, (Math.random() < 0.5 ? -1 : 1) * (T.def.hw + 3), 1.4, _cq); r.tsPos = { x: _cq.x, y: _cq.y, z: _cq.z }; }
      _cp.set(r.tsPos.x, r.tsPos.y, r.tsPos.z); look(K.x, K.y + 0.7, K.z);
    } else {
      _cp.set(K.x - Math.sin(K.h) * 5.5, K.y + 2.4, K.z - Math.cos(K.h) * 5.5); look(K.x + Math.sin(K.h) * 5, K.y + 1, K.z + Math.cos(K.h) * 5);
    }
    fovT = port ? 66 : 50;
  }
  // keep the lens out of the ground and inside the walls
  if (mode === 'chase' || mode === 'grid' || mode === 'orbit' || mode === 'attract') {
    const g = camGround(T, _cp.x, _cp.z);
    const wall = T.def.hw + T.def.wall - 0.5;
    if (Math.abs(g.lat) > wall && g.d < wall + 6 && T.def.id !== 'fair') {
      const sg = Math.sign(g.lat), over = Math.abs(g.lat) - wall;
      _cp.x -= -T.TZ[g.i] * sg * over; _cp.z -= T.TX[g.i] * sg * over; _cp.y += over * 0.4;
    }
    if (_cp.y < g.y + 1.0) _cp.y = g.y + 1.0;
  }
  if (!r.camInit || snap) { r.camPos.copy(_cp); r.camTgt.copy(_ct); r.camInit = true; if (mode === 'chase' || mode === 'grid') r.camYaw = P.h; }
  const kp = 1 - Math.exp(-dt * (mode === 'chase' ? (rm ? 6 : 9) : mode === 'intro' ? 6 : 4)), kt = 1 - Math.exp(-dt * (mode === 'chase' ? 14 : 7));
  r.camPos.lerp(_cp, kp); r.camTgt.lerp(_ct, kt);
  cam.position.copy(r.camPos);
  const sx = a.shakeX || 0, sy = a.shakeY || 0;
  if (sx || sy) { cam.position.x += Math.cos(r.camYaw) * sx * 0.025; cam.position.z -= Math.sin(r.camYaw) * sx * 0.025; cam.position.y += sy * 0.025; }
  cam.up.set(0, 1, 0);
  cam.lookAt(r.camTgt);
  const rollT = mode === 'chase' && !rm ? (P.drift ? -P.drift * 0.06 : -P.steerIn * 0.025) : 0;
  r.roll += (rollT - r.roll) * Math.min(1, dt * 4);
  cam.rotateZ(r.roll);
  // speed and boosts widen the lens
  r.fovKick = Math.max(0, r.fovKick - dt * 9);
  const kick = mode === 'chase' && !rm ? sp * 7 + (P.boostT > 0 ? 6 : 0) + r.fovKick : mode === 'chase' ? sp * 2 : 0;
  r.fov += (fovT + kick - r.fov) * Math.min(1, dt * (snap ? 60 : 5));
  if (Math.abs(cam.fov - r.fov) > 0.01 || Math.abs(cam.aspect - aspect) > 1e-4) { cam.fov = r.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}

/* ------------------------------------------------------------ per frame */
function emitKartFx(W, K, B, dt, a) {
  const T = W.T, rm = a.reducedMotion;
  if (K.respawnT > 0) return;
  // drift sparks from the rear wheels, coloured by the charge
  if (K.drift && !K.air) {
    for (let s = -1; s <= 1; s += 2) {
      kartPoint(K, s * 0.8, 0.12, -0.85, V);
      if (K.level > 0) { for (let i = 0; i < 2 * FX.density; i++) FX.emit('add', V.x, V.y, V.z, rnd(3) - Math.sin(K.h) * 3, 0.8 + Math.random() * 2.2, rnd(3) - Math.cos(K.h) * 3, 0.18 + Math.random() * 0.15, 0.13 + K.level * 0.03, SPARK_COL[K.level], 1, 10, 1, 0); }
      if (Math.random() < 0.5 * FX.density) FX.emit('soft', V.x, V.y, V.z, rnd(1), 0.5, rnd(1), 0.7, 0.5, T.def.id === 'roof' ? '#d8c0a8' : '#c8c8cc', 0.32, -0.2, 1.2, 2.4);
    }
    if (K.level > 0 && B) { kartPoint(K, 0, 0.4, -1.0, V); FX.emit('add', V.x, V.y, V.z, 0, 0, 0, 0.06, 1.0 + K.level * 0.25, SPARK_COL[K.level], 0.35, 0, 0, 0); }
  }
  // boost flames from the pipes
  if (K.boostT > 0) {
    for (let s = -1; s <= 1; s += 2) {
      kartPoint(K, s * 0.28, 0.7, -1.4, V);
      FX.emit('add', V.x, V.y, V.z, rnd(1) - Math.sin(K.h) * 4, rnd(0.6), rnd(1) - Math.cos(K.h) * 4, 0.16 + Math.random() * 0.12, 0.42, K.boostK > 1.12 ? '#ffb24a' : '#ff7a2a', 1, -1, 2, -0.4);
      FX.emit('add', V.x, V.y, V.z, -Math.sin(K.h) * 3, 0, -Math.cos(K.h) * 3, 0.08, 0.28, '#7ad0ff', 1, 0, 1, 0);
    }
  } else if (K.gas && Math.random() < dt * 8 * FX.density) { kartPoint(K, 0.28 * (Math.random() < 0.5 ? 1 : -1), 0.7, -1.4, V); FX.emit('soft', V.x, V.y, V.z, rnd(0.6), 0.4, rnd(0.6), 0.8, 0.28, '#8a8580', 0.2, -0.3, 1, 3); }
  // dust off the road
  if (K.surf === 'off' && !K.air && Math.abs(K.v) > 6 && Math.random() < dt * 22 * FX.density) { kartPoint(K, rnd(1.4), 0.15, -1.0, V); FX.emit('soft', V.x, V.y, V.z, rnd(2), 0.8 + Math.random(), rnd(2), 1.1, 1.0, T.def.id === 'hill' ? '#6a7a50' : T.def.id === 'roof' ? '#c8a888' : '#8a7050', 0.45, -0.2, 1.3, 2.4); }
  if (K.surf === 'dirt' && T.def.id === 'fair' && !K.air && Math.abs(K.v) > 6 && Math.random() < dt * 18 * FX.density) { kartPoint(K, rnd(1.4), 0.15, -1.0, V); FX.emit('soft', V.x, V.y, V.z, rnd(2), 0.8, rnd(2), 1.0, 1.0, '#9a7650', 0.5, -0.2, 1.3, 2.4); }
  // rain spray off the wheels
  if (T.def.id === 'hill' && !K.air && Math.abs(K.v) > 10 && Math.random() < dt * 16 * FX.density) { kartPoint(K, rnd(1.6), 0.1, -1.1, V); FX.emit('soft', V.x, V.y, V.z, rnd(2), 1 + Math.random(), rnd(2), 0.5, 0.5, '#d6dee4', 0.3, 6, 0.8, 1.6); }
  // skid marks
  if (!K.air && (K.drift || K.spinT > 0 || (K.brk && K.v > 8)) && (K.skidT = (K.skidT || 0) + dt) > 0.035) {
    K.skidT = 0;
    for (let s = -1; s <= 1; s += 2) { kartPoint(K, s * 0.8, 0, -0.8, V); addSkid(V.x, K.gy, V.z, K.h + (K.drift ? K.drift * -0.3 : 0)); }
  }
  void rm;
}
function renderScene(W, dt, a) {
  const r = R3, T = W.T, S = r.cur, P = W.P, L = LOOK[T.id];
  r.time += dt;
  r.renderer.info.reset();
  poseWorld(W, dt);
  updateCamera(W, dt, a);
  // a rival right in front of the lens would fill the screen: let the camera see through it
  const cp0 = r.camera.position;
  for (let i = 0; i < W.karts.length; i++) {
    const K = W.karts[i]; if (K === P && !W.attract) continue;
    const dx = K.x - cp0.x, dy = K.y + 0.6 - cp0.y, dz = K.z - cp0.z;
    if (dx * dx + dy * dy + dz * dz < 9) r.karts[i].root.visible = false;
  }
  // the sun and its shadow box follow the action
  const fx0 = r.mode === 'chase' || r.mode === 'grid' ? P : (r.mode === 'attract' && W.order ? W.order[0] : P);
  r.sun.target.position.set(fx0.x, fx0.y, fx0.z);
  r.sun.position.set(fx0.x + r.sunDir.x * 140, fx0.y + Math.max(30, r.sunDir.y * 140), fx0.z + r.sunDir.z * 140);
  r.sun.target.updateMatrixWorld(); r.sun.updateMatrixWorld();
  // headlights at night
  if (L.night && P.respawnT <= 0 && !W.attract) {
    const B = r.karts[0];
    r.head.position.set(0, 0.9, 1.4).applyMatrix4(B.root.matrixWorld);
    r.head.target.position.set(0, -0.8, 22).applyMatrix4(B.root.matrixWorld); r.head.target.updateMatrixWorld();
    r.head.intensity = 160;
  } else r.head.intensity = 0;
  // a warm light under the nearest string of bulbs (fair) or the low sun bounce (roof)
  if (T.id === 'fair') { r.glowP.position.set(P.x, P.y + 7, P.z); r.glowP.intensity = 60 * (1 - (W.cutT > 0 ? 0.85 : 0)); r.glowP.color.set('#ffb070'); }
  else r.glowP.intensity = 0;
  if (FX) {
    for (let i = 0; i < W.karts.length; i++) {
      const K = W.karts[i];
      if (Math.hypot(K.x - r.camera.position.x, K.z - r.camera.position.z) > 90) continue;
      emitKartFx(W, K, r.karts[i], dt, a);
    }
    const cp = r.camera.position;
    if (L.rain) {
      const n = Math.round(26 * FX.density);
      for (let i = 0; i < n; i++) FX.emit('rain', cp.x + rnd(44), cp.y + 6 + Math.random() * 14, cp.z + rnd(44), -1.5, -24, -0.8, 0.9, 0.9, '#c8d4dc', 0.38, 0, 0, 0);
    }
    if (S.falls && Math.random() < dt * 30 * FX.density) { const f = S.falls; FX.emit('soft', f.x + rnd(6), f.y - 6 + Math.random() * 4, f.z + rnd(6), rnd(2), 1 + Math.random() * 2, rnd(2), 1.8, 2.2, '#e8f0f4', 0.3, -0.2, 0.8, 1.8); }
    if (S.fountain && Math.random() < dt * 40 * FX.density) { const f = S.fountain; const lat = rnd(f.w * 1.6); FX.emit('add', f.x - Math.cos(f.h) * lat, f.y - 0.2, f.z + Math.sin(f.h) * lat, rnd(0.6), 5 + Math.random() * 3, rnd(0.6), 1.1, 0.22, ['#5ad1ff', '#ff5a9a', '#ffe066', '#7dff9a'][Math.floor(r.time * 2) % 4], 0.6, 9, 0.2, 0.2); }
    // fireworks over the fairground
    if (T.id === 'fair') {
      r.fwT -= dt;
      if (r.fwT <= 0) {
        r.fwT = 1.6 + Math.random() * 2.2;
        const b = T.box, x = lerp(b.x0, b.x1, Math.random()), z = lerp(b.z0, b.z1, Math.random()), y = 55 + Math.random() * 30;
        const cols = ['#ff4f9a', '#ffd23f', '#38c8ff', '#44ffa8', '#ff6a1a', '#c79bff'], c1 = cols[Math.floor(Math.random() * 6)], c2 = cols[Math.floor(Math.random() * 6)];
        const n = Math.round((a.reducedMotion ? 40 : 90) * FX.density);
        for (let i = 0; i < n; i++) { const th = Math.random() * TAU, ph = Math.acos(2 * Math.random() - 1), sp = 11 + Math.random() * 4; FX.emit('add', x, y, z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp, 1.6 + Math.random() * 0.8, 1.1, i % 2 ? c1 : c2, 1, 4, 0.9, -0.3); }
        FX.emit('add', x, y, z, 0, 0, 0, 0.3, 14, c1, 0.7, 0, 0, 0.5);
        if (!W.attract && Math.hypot(x - P.x, z - P.z) < 160) noise(0.5, { freq: 160, vol: 0.06 });
      }
    }
    // celebration confetti on the podium
    if (W.phase === 'podium' && Math.random() < dt * 6) confettiAt(r.podPos.x, r.podPos.y + 9, r.podPos.z, 20, 10);
    FX.update(dt, a.h * r.renderer.getPixelRatio() * 0.5 / Math.tan(r.camera.fov * Math.PI / 360));
  }
  // skid marks fade
  const sa = r.skidA.array; let anyS = false;
  for (let i = 0; i < r.skidN; i++) { if (r.skidAge[i] < 9) { r.skidAge[i] += dt; sa[i] = clamp(1 - r.skidAge[i] / 8, 0, 1); anyS = true; } }
  if (anyS) r.skidA.needsUpdate = true;
  for (let i = 0; i < S.anims.length; i++) S.anims[i](dt, r.time, W);
  // the power cut: lights out across the fair, the screen dims
  const cutK = W.cutT > 0 ? smooth01(Math.min(W.cutT, 3.8 - W.cutT) * 3) : 0;
  const tw = T.id === 'fair' ? 0.85 + 0.15 * Math.sin(r.time * 3) : 1;
  S.glow.forEach((gl) => { gl.m.color.setScalar(gl.base * (1 - 0.88 * cutK) * tw); if (gl.col) { gl.m.color.set(gl.col).multiplyScalar(gl.base * (1 - 0.88 * cutK)); } });
  r.flash = Math.max(0, r.flash - dt * 2.5);
  const pc = r.post.comp.uniforms;
  pc.uDim.value = 1 - 0.38 * cutK;
  pc.uFlash.value = a.reducedMotion ? 0 : r.flash * 0.6;
  pc.uVig.value = 0.85 + (W.phase === 'intro' || r.mode === 'photo' || r.mode === 'podium' ? 0.25 : 0) + cutK * 0.4;
  pc.uGrain.value = 0.028;
  pc.uAberr.value = !a.reducedMotion && P.boostT > 0 && r.mode === 'chase' ? 0.0035 : 0;
  r.skyU.uTime.value = r.time;
  r.sky.position.copy(r.camera.position);
  if (TIERS[r.quality].post) renderWithPost(L, a);
  else { r.renderer.setRenderTarget(null); r.renderer.render(r.scene, r.camera); }
}

const _proj = new THREE.Vector3();
Object.assign(VIEW3D, {
  init(a) {
    if (!setup3D(a)) return false;
    const q = R3.soft ? 0 : a.device === 'desktop' ? 3 : a.device === 'tablet' ? 2 : 2;
    R3.startQ = q; setQuality(q); resize3D(a);
    return true;
  },
  resize(a) { resize3D(a); },
  world(W) { if (R3) R3.worldRef = null; },
  graphics(level) { if (!R3) return; if (level === 'auto') { R3.lockQ = false; return; } R3.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  quality(q) { if (!R3) return; R3.lockQ = true; setQuality(q); },
  project(x, y, z, out) {
    _proj.set(x, y, z).project(R3.camera);
    out.x = (_proj.x * 0.5 + 0.5) * ARC.w; out.y = (-_proj.y * 0.5 + 0.5) * ARC.h; out.vis = _proj.z < 1 && _proj.z > -1;
    return out;
  },
  podium(W) {
    const r = R3, T = W.T;
    posAt(T, T.startS + 30, 0, 0, V); frameAt(T, T.startS + 30);
    r.podPos = { x: V.x, y: V.y, z: V.z, h: FR.h + Math.PI };
    r.podium.visible = true; r.podium.position.set(V.x, V.y, V.z); r.podium.rotation.y = FR.h + Math.PI;
  },
  info() {
    if (!R3) return null;
    const i = R3.renderer.info.render;
    return { quality: R3.quality, fps: Math.round(R3.fps), soft: R3.soft, calls: i.calls, tris: i.triangles, post: !!TIERS[Math.max(0, R3.quality)].post, camera: R3.mode };
  },
  lost() { return !R3 || R3.lost || R3.renderer.getContext().isContextLost(); },
  render(W, dtReal, a) {
    measureFps(dtReal);
    if (R3.worldRef !== W) { activateWorld(W); R3.qWarm = 0; }
    renderScene(W, dtReal, a);
  }
});
function measureFps(dt) {
  const r = R3;
  r.qWarm = r.qWarm || 0;
  if (r.qWarm < 6) { r.qWarm++; return; }
  r.qT += dt; r.qN++;
  if (r.qT >= 1.2) {
    r.fps = r.qN / r.qT; r.qT = 0; r.qN = 0;
    if (r.lockQ) return;
    if (r.fps < 40 && r.quality > 0) { setQuality(r.fps < 18 ? Math.max(0, r.quality - 2) : r.quality - 1); r.qWarm = 3; r.good = 0; }
    else if (r.fps > 57 && r.quality < r.startQ && !r.soft) { r.good++; if (r.good >= 4) { setQuality(r.quality + 1); r.good = 0; r.qWarm = 3; } }
    else r.good = 0;
  }
}
const VIEW = VIEW3D;
VIEW3D.r3 = () => R3;

/* ================================================================ HUD */
const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
const INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736', ORANGE = '#ff6940', TEAL = '#38e1ff', GREEN = '#44ffa8';
function txt(ctx, s, x, y, size, color, align, weight, fam) {
  ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function plate(ctx, x, y, w, h, r, a) { rr(ctx, x, y, w, h, r || 10); ctx.fillStyle = 'rgba(12,10,8,' + (a == null ? 0.58 : a) + ')'; ctx.fill(); ctx.strokeStyle = 'rgba(251,245,236,0.12)'; ctx.lineWidth = 1; ctx.stroke(); }
const PLACE_COL = ['#ffd23f', '#dfe6ee', '#ff9a5a'];
function placeCol(p) { return p <= 3 ? PLACE_COL[p - 1] : INK; }

function drawItemIcon(ctx, id, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (id === 'peel') {
    ['#ffb21a', '#ffc531', '#ffd84a'].forEach((c, i) => { ctx.save(); ctx.rotate(-0.9 + i * 0.9); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -9, 6, 13, 0, 0, TAU); ctx.fill(); ctx.restore(); });
    ctx.fillStyle = '#e8892c'; ctx.beginPath(); ctx.arc(0, 2, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7fb83a'; ctx.beginPath(); ctx.ellipse(8, 10, 7, 3, 0.4, 0, TAU); ctx.fill();
  } else if (id === 'rocket') {
    ctx.rotate(-0.6);
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(-6, -10, 12, 22); ctx.fillStyle = '#e8452c'; ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(0, -20); ctx.lineTo(6, -10); ctx.fill();
    ctx.fillStyle = '#2d7fd1'; ctx.fillRect(-6, -2, 12, 4);
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(-13, 15); ctx.lineTo(-6, 12); ctx.fill(); ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(13, 15); ctx.lineTo(6, 12); ctx.fill();
    ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(0, 21); ctx.lineTo(4, 12); ctx.fill();
  } else if (id === 'shield') {
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.fillStyle = '#ff9a1f'; ctx.beginPath(); ctx.arc(Math.cos(a) * 11, Math.sin(a) * 11, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffc531'; ctx.beginPath(); ctx.arc(Math.cos(a) * 11, Math.sin(a) * 11, 4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#b8500f'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  } else if (id === 'chai') {
    ctx.fillStyle = '#d98a4b'; ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(10, -4); ctx.lineTo(7, 14); ctx.lineTo(-7, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2d2a6'; ctx.fillRect(-10, -6, 20, 4);
    ctx.strokeStyle = '#fff6e6'; ctx.lineWidth = 2.5;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 5, -9); ctx.bezierCurveTo(i * 5 + 4, -13, i * 5 - 4, -16, i * 5, -20); ctx.stroke(); }
  } else if (id === 'cut') {
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(0, -4, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a8f98'; ctx.fillRect(-6, 6, 12, 8);
    ctx.strokeStyle = '#9b6bff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-16, -16); ctx.lineTo(16, 16); ctx.stroke();
  }
  ctx.restore();
}

const _hp = { x: 0, y: 0, vis: false };
function drawHUD(ctx, a, W) {
  const w = a.w, h = a.h, hp = a.hudPad(), P = W.P, T = W.T, port = w < h, t = W.t;
  const s = clamp(Math.min(w, h) / 420, 0.78, 1.35);
  // letterbox for cutaways
  const lbT = W.phase === 'intro' || (W.photo && W.slowT > 0) || W.phase === 'podium' || W.phase === 'results' || W.phase === 'standings' || W.phase === 'finished' ? 1 : 0;
  W.lb = (W.lb || 0) + (lbT - (W.lb || 0)) * Math.min(1, RT.dt * 5);
  // fades between scenes sit under the HUD text
  if (W.fade > 0.003) { ctx.fillStyle = 'rgba(0,0,0,' + clamp(W.fade, 0, 1) + ')'; ctx.fillRect(0, 0, w, h); }
  if (W.lb > 0.01) { const bh = h * (port ? 0.07 : 0.1) * W.lb; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh); }
  // speed lines while boosting
  if (P.boostT > 0 && W.phase === 'race' && !a.reducedMotion) {
    ctx.save(); ctx.globalAlpha = clamp(P.boostT, 0, 1) * 0.35; ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const an = (i / 18) * TAU + (t * 3 % 1) * 0.3, r0 = Math.max(w, h) * (0.42 + ((i * 37 + Math.floor(t * 30)) % 10) / 40), r1 = r0 + Math.max(w, h) * 0.2; ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(an) * r0, h / 2 + Math.sin(an) * r0); ctx.lineTo(w / 2 + Math.cos(an) * r1, h / 2 + Math.sin(an) * r1); ctx.stroke(); }
    ctx.restore();
  }
  if (W.phase === 'intro') {
    const k = W.introT / W.introDur, al = clamp(Math.min(k * 4, (1 - k) * 5), 0, 1);
    ctx.globalAlpha = al;
    const y0 = h * (port ? 0.13 : 0.16);
    txt(ctx, (W.cfg.mode === 'gp' ? 'GRAND PRIX · RACE ' + W.cfg.gpRace + ' OF 3' : W.cfg.mode === 'time' ? 'TIME TRIAL' : 'SINGLE RACE') + '  ·  ' + W.d.cc, w / 2, y0, 11 * s, GOLD, 'center', '600');
    txt(ctx, T.def.name, w / 2, y0 + 34 * s, 34 * s, INK, 'center', '600', F_DISP);
    txt(ctx, T.def.place, w / 2, y0 + 64 * s, 14 * s, DIM, 'center', '500', F_BODY);
    ctx.globalAlpha = al * (0.55 + 0.45 * Math.sin(t * 4));
    txt(ctx, a.touchMode ? 'Tap to skip' : 'Press any key to skip', w / 2, h - h * (port ? 0.07 : 0.1) - 18, 11 * s, DIM, 'center', '600');
    ctx.globalAlpha = 1;
  }
  // countdown lights
  if (W.phase === 'countdown' || (W.phase === 'race' && W.raceT < 1)) {
    const lx = w / 2, ly = h * (port ? 0.2 : 0.18), R = 15 * s;
    plate(ctx, lx - R * 4.6, ly - R * 1.6, R * 9.2, R * 3.2, R * 1.2, 0.7);
    for (let i = 0; i < 3; i++) {
      const on = W.phase === 'race' ? 2 : W.cd <= 3 - 0.4 - i ? 1 : 0;
      ctx.beginPath(); ctx.arc(lx + (i - 1) * R * 2.8, ly, R, 0, TAU);
      ctx.fillStyle = on === 2 ? '#2aff6a' : on ? '#ff2a1a' : '#3a1010'; ctx.fill();
      if (on && !a.reducedMotion) { ctx.save(); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(lx + (i - 1) * R * 2.8, ly, R * 1.7, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    if (W.phase === 'countdown') {
      const n = Math.ceil(W.cd - 0.4);
      if (n >= 1 && n <= 3) { const f = (W.cd - 0.4) % 1, sc = a.reducedMotion ? 1 : 1 + f * 0.5; txt(ctx, String(n), w / 2, h * 0.42, 64 * s * sc, INK, 'center', '600', F_DISP); }
      if (a.touchMode && W.cd < 3) txt(ctx, 'Drag to steer · hold to drift · tap for item', w / 2, h * 0.52, 12 * s, INK, 'center', '600', F_BODY);
      else if (!a.touchMode && W.cd < 3) txt(ctx, 'Hold accelerate as the last light comes on for a rocket start', w / 2, h * 0.52, 12 * s, DIM, 'center', '500', F_BODY);
    }
  }
  if (W.phase === 'race' || W.phase === 'finished' || W.phase === 'countdown') {
    const top = hp.top + (W.lb > 0.5 ? h * 0.07 : 0);
    // position and lap
    if (W.cfg.mode !== 'time') {
      const p = P.place;
      const pw = 104 * s;
      plate(ctx, hp.left, top, pw, 74 * s, 12);
      const ps = ordinal(p), num = String(p);
      txt(ctx, num, hp.left + 12 * s, top + 34 * s, 44 * s, placeCol(p), 'left', '600', F_DISP);
      ctx.font = '600 ' + 44 * s + 'px ' + F_DISP; const nw = ctx.measureText(num).width;
      txt(ctx, ps.slice(num.length), hp.left + 14 * s + nw, top + 22 * s, 15 * s, placeCol(p), 'left', '600', F_DISP);
      txt(ctx, 'OF ' + W.karts.length, hp.left + 14 * s + nw, top + 42 * s, 9 * s, DIM, 'left', '600');
      txt(ctx, 'LAP ' + clamp(P.lap + 1, 1, LAPS) + '/' + LAPS, hp.left + 12 * s, top + 62 * s, 11 * s, W.finalLap ? GOLD : INK, 'left', '600');
    } else {
      plate(ctx, hp.left, top, 132 * s, 74 * s, 12);
      txt(ctx, 'LAP ' + clamp(P.lap + 1, 1, LAPS) + '/' + LAPS, hp.left + 12 * s, top + 18 * s, 11 * s, INK, 'left', '600');
      const best = SAVE.best[T.id] && SAVE.best[T.id].tt;
      txt(ctx, best ? 'BEST ' + fmtTime(best) : 'NO BEST YET', hp.left + 12 * s, top + 56 * s, 10 * s, GOLD, 'left', '600');
      if (W.ghost) txt(ctx, 'GHOST ON', hp.left + 12 * s, top + 37 * s, 10 * s, TEAL, 'left', '600');
    }
    // race time
    txt(ctx, fmtTime(W.raceT), hp.left + 4, top + 74 * s + 14 * s, 13 * s, INK, 'left', '600');
    // item slot
    const isz = 62 * s, ix = w - hp.right - isz, iy = top;
    plate(ctx, ix, iy, isz, isz, 14, 0.62);
    ctx.save(); rr(ctx, ix + 4, iy + 4, isz - 8, isz - 8, 10); ctx.strokeStyle = P.item ? 'rgba(255,183,54,.8)' : 'rgba(251,245,236,.18)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    if (P.roulT > 0) { const id = ITEM_IDS[Math.floor(t * 14) % ITEM_IDS.length]; drawItemIcon(ctx, id, ix + isz / 2, iy + isz / 2, isz * 0.62); }
    else if (P.item) {
      const pulse = a.reducedMotion ? 1 : 1 + Math.sin(t * 6) * 0.04;
      drawItemIcon(ctx, P.item, ix + isz / 2, iy + isz / 2, isz * 0.66 * pulse);
      txt(ctx, ITEMS[P.item].name.toUpperCase(), ix + isz / 2, iy + isz + 11 * s, 8.5 * s, GOLD, 'center', '600');
      txt(ctx, a.touchMode ? 'TAP' : a.gamepad ? 'A / X' : 'X / E', ix + isz / 2, iy + isz + 23 * s, 8 * s, DIM, 'center', '600');
    } else txt(ctx, 'ITEM', ix + isz / 2, iy + isz / 2, 9 * s, DIM, 'center', '600');
    // minimap
    drawMinimap(ctx, W, w - hp.right - (port ? 96 : 130) * s, iy + isz + 34 * s, (port ? 96 : 130) * s);
    // speed and the drift meter
    const by = h - hp.bottom - (a.touchMode ? 10 : 6);
    const kmh = Math.round(Math.abs(P.v) * KMH);
    txt(ctx, String(kmh), w / 2, by - 22 * s, 24 * s, P.boostT > 0 ? GOLD : INK, 'center', '600');
    txt(ctx, 'KM/H', w / 2, by - 6 * s, 9 * s, DIM, 'center', '600');
    if (P.drift || P.charge > 0) {
      const mw = 150 * s, mx = w / 2 - mw / 2, my = by - 50 * s;
      plate(ctx, mx - 4, my - 4, mw + 8, 14 * s, 6, 0.6);
      const segs = [0.85, 1.75, 2.75];
      for (let i = 0; i < 3; i++) {
        const a0 = i ? segs[i - 1] : 0, a1 = segs[i], f = clamp((P.charge - a0) / (a1 - a0), 0, 1);
        const sx = mx + i * mw / 3 + 2, sw = mw / 3 - 4;
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(sx, my, sw, 6 * s);
        ctx.fillStyle = SPARK_HUD[i + 1]; ctx.fillRect(sx, my, sw * f, 6 * s);
      }
    }
    // pointers over nearby rivals
    if (W.phase === 'race') {
      for (let i = 1; i < W.karts.length; i++) {
        const K = W.karts[i], d = K.totalD - P.totalD;
        if (d < 2 || d > 40 || K.respawnT > 0) continue;
        VIEW.project(K.x, K.y + 2.2 * (K.shrinkT > 0 ? 0.6 : 1), K.z, _hp);
        if (!_hp.vis || _hp.y < top + 80 * s) continue;
        const al = clamp((40 - d) / 12, 0, 1) * 0.9;
        ctx.globalAlpha = al;
        ctx.fillStyle = K.c.kart; ctx.beginPath(); ctx.moveTo(_hp.x - 5, _hp.y - 8); ctx.lineTo(_hp.x + 5, _hp.y - 8); ctx.lineTo(_hp.x, _hp.y - 2); ctx.fill();
        txt(ctx, K.c.name.split(' ')[0], _hp.x, _hp.y - 16, 10 * s, INK, 'center', '600', F_BODY);
        ctx.globalAlpha = 1;
      }
      // a rocket closing in
      const rk = W.objs.find((o) => o.type === 'rocket' && o.target === P && o.dist < 45);
      if (rk) {
        const fl = a.reducedMotion ? 1 : (Math.floor(t * 8) % 2 ? 1 : 0.4);
        ctx.globalAlpha = fl; plate(ctx, w / 2 - 70 * s, by - 96 * s, 140 * s, 26 * s, 8, 0.7);
        txt(ctx, 'ROCKET BEHIND!', w / 2, by - 83 * s, 11 * s, ORANGE, 'center', '700'); ctx.globalAlpha = 1;
      }
      if (W.wrongT > 1.2) { plate(ctx, w / 2 - 80 * s, h * 0.3 - 18 * s, 160 * s, 36 * s, 10, 0.7); txt(ctx, 'WRONG WAY', w / 2, h * 0.3, 16 * s, ORANGE, 'center', '700'); }
      if (W.cfg.mode === 'time' && W.ghost && W.ghost.t) { const exp = W.ghost.t * clamp(P.totalD / (LAPS * T.L), 0, 1); const dlt = W.raceT - exp; txt(ctx, (dlt > 0 ? '+' : '-') + Math.abs(dlt).toFixed(2), w / 2, top + 12 * s, 13 * s, dlt > 0 ? ORANGE : GREEN, 'center', '600'); }
    }
    // the touch reminder for the first moments
    if (a.touchMode && W.phase === 'race' && W.raceT < 6 && a.touchStyle !== 'pads') {
      ctx.globalAlpha = clamp(6 - W.raceT, 0, 1) * 0.9;
      plate(ctx, w / 2 - 150 * s, by - 132 * s, 300 * s, 30 * s, 10, 0.6);
      txt(ctx, a.touchStyle === 'tilt' ? 'Tilt to steer · hold to drift · tap for item' : 'Drag to steer · hold to drift · tap for item', w / 2, by - 117 * s, 11 * s, INK, 'center', '600', F_BODY);
      ctx.globalAlpha = 1;
    }
  }
  // banner and pops
  if (W.banner && W.bannerT > 0) {
    const k = W.bannerT, al = clamp(Math.min(k * 3, 1), 0, 1), sc = a.reducedMotion ? 1 : 1 + Math.max(0, k - (W.banner.text === 'GO!' ? 0.6 : 1.6)) * 0.6;
    ctx.globalAlpha = al;
    const by2 = h * (port ? 0.36 : 0.32);
    txt(ctx, W.banner.text, w / 2, by2, 40 * s * sc, W.banner.text === 'FINAL LAP' ? GOLD : INK, 'center', '600', F_DISP);
    if (W.banner.sub) txt(ctx, W.banner.sub, w / 2, by2 + 30 * s, 13 * s, DIM, 'center', '600');
    ctx.globalAlpha = 1;
  }
  let py = h * (port ? 0.42 : 0.42);
  for (let i = W.pops.length - 1; i >= 0; i--) {
    const p = W.pops[i];
    const al = clamp(Math.min(p.t * 6, (2 - p.t) * 2), 0, 1), lift = a.reducedMotion ? 0 : p.t * 10;
    ctx.globalAlpha = al;
    txt(ctx, p.text, w / 2, py - lift, (p.big ? 22 : 17) * s, p.col, 'center', '700', F_BODY);
    if (p.sub) txt(ctx, p.sub, w / 2, py - lift + 17 * s, 11 * s, DIM, 'center', '600');
    ctx.globalAlpha = 1;
    py += 40 * s;
  }
  // results, standings, podium
  if (W.phase === 'results' || W.phase === 'standings' || W.phase === 'podium') drawResults(ctx, a, W, s);
}
const SPARK_HUD = ['#ffffff', '#3fa9ff', '#ff9a1f', '#ff4fd8'];
function drawMinimap(ctx, W, x, y, size) {
  const T = W.T, b = T.box, sp = Math.max(b.x1 - b.x0, b.z1 - b.z0), k = size / sp;
  const ox = x + size / 2, oy = y + size / 2;
  const mx = (px) => ox + (px - b.cx) * k, my = (pz) => oy + (pz - b.cz) * k;
  plate(ctx, x - 8, y - 8, size + 16, size + 16, 12, 0.45);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(251,245,236,.18)'; ctx.lineWidth = 6;
  ctx.beginPath(); for (let i = 0; i <= T.N; i += 3) { const q = i % T.N; i ? ctx.lineTo(mx(T.X[q]), my(T.Z[q])) : ctx.moveTo(mx(T.X[q]), my(T.Z[q])); } ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = 'rgba(251,245,236,.75)'; ctx.lineWidth = 2; ctx.stroke();
  if (T.sc) { ctx.strokeStyle = 'rgba(255,183,54,.6)'; ctx.setLineDash([3, 3]); ctx.beginPath(); for (let q = 0; q < T.sc.N; q += 2) q ? ctx.lineTo(mx(T.sc.X[q]), my(T.sc.Z[q])) : ctx.moveTo(mx(T.sc.X[q]), my(T.sc.Z[q])); ctx.stroke(); ctx.setLineDash([]); }
  frameAt(T, T.startS); ctx.fillStyle = '#fff'; ctx.fillRect(mx(FR.x) - 3, my(FR.z) - 3, 6, 6);
  for (let i = W.karts.length - 1; i >= 0; i--) {
    const K = W.karts[i]; if (K.respawnT > 0 && K.anim.rescue > 0.8) continue;
    ctx.beginPath(); ctx.arc(mx(K.x), my(K.z), K.isPlayer ? 5 : 3.5, 0, TAU); ctx.fillStyle = K.isPlayer ? ORANGE : K.c.kart; ctx.fill();
    if (K.isPlayer) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
  }
}
function drawResults(ctx, a, W, s) {
  const w = a.w, h = a.h, port = w < h;
  const pw = Math.min(w - 24, 420 * s), ph0 = 0;
  let rows = [], title = '', sub = '';
  if (W.phase === 'results' && W.cfg.mode === 'time') {
    title = W.ttNew ? 'New best time' : 'Time trial';
    sub = W.T.def.name + ' · ' + fmtTime(W.P.finT);
    rows = W.P.laps.map((lt, i) => ({ a: 'LAP ' + (i + 1), b: fmtTime(lt), c: lt === W.P.stats.bestLap ? 'BEST' : '', me: lt === W.P.stats.bestLap }));
    const best = SAVE.best[W.T.id] && SAVE.best[W.T.id].tt; rows.push({ a: 'RECORD', b: fmtTime(best), c: W.ttNew ? 'NEW' : '', me: false });
  } else if (W.phase === 'results') {
    const me = W.results.find((r) => r.you);
    title = me.place === 1 ? 'You win!' : ordinal(me.place) + ' place';
    sub = W.T.def.name + (GP ? ' · Race ' + W.cfg.gpRace + ' of 3' : '');
    rows = W.results.map((r) => ({ a: ordinal(r.place), b: r.you ? 'You (' + r.name + ')' : r.name, c: GP ? '+' + r.pts : fmtTime(r.time), me: r.you, col: CHARS[CHAR_IDX[r.id]].kart }));
  } else {
    const st = gpStandings();
    title = W.phase === 'podium' ? 'Grand Prix complete' : 'Grand Prix standings';
    const me = st.find((r) => r.you);
    sub = W.phase === 'podium' ? (me.place <= 3 ? 'You finished ' + ordinal(me.place) + ' overall!' : 'You finished ' + ordinal(me.place) + ' overall') : 'After race ' + (GP.idx + 1) + ' of 3';
    rows = st.map((r) => ({ a: ordinal(r.place), b: r.you ? 'You (' + r.name + ')' : r.name, c: r.pts + ' pts', me: r.you, col: CHARS[CHAR_IDX[r.id]].kart }));
    if (W.phase === 'podium') rows = rows.slice(0, 3);
  }
  const rh = 22 * s, ph = 86 * s + rows.length * rh + 34 * s;
  const px = (w - pw) / 2, py = W.phase === 'podium' ? h - ph - h * 0.11 : clamp((h - ph) / 2 + (port ? h * 0.08 : 0), 10, h - ph - 10);
  const k = clamp(W.contT * 3, 0, 1);
  ctx.globalAlpha = k;
  plate(ctx, px, py + (1 - k) * 20, pw, ph, 16, 0.78);
  const y0 = py + (1 - k) * 20;
  txt(ctx, title, w / 2, y0 + 30 * s, 26 * s, INK, 'center', '600', F_DISP);
  txt(ctx, sub, w / 2, y0 + 56 * s, 11 * s, GOLD, 'center', '600');
  rows.forEach((r, i) => {
    const yy = y0 + 80 * s + i * rh;
    if (r.me) { ctx.fillStyle = 'rgba(255,105,64,.22)'; ctx.fillRect(px + 10, yy - rh / 2 + 2, pw - 20, rh - 2); }
    if (r.col) { ctx.fillStyle = r.col; ctx.fillRect(px + 16, yy - 5, 4, 10); }
    txt(ctx, r.a, px + 28, yy, 11 * s, i < 3 && !GP_NOPLACE(W) ? placeCol(i + 1) : INK, 'left', '600');
    txt(ctx, r.b, px + 28 + 50 * s, yy, 13 * s, r.me ? INK : '#d6d0c6', 'left', '500', F_BODY);
    txt(ctx, r.c, px + pw - 18, yy, 11 * s, r.me ? GOLD : DIM, 'right', '600');
  });
  if (W.contT > 1.1) { ctx.globalAlpha = k * (0.6 + 0.4 * Math.sin(W.t * 4)); txt(ctx, a.touchMode ? 'Tap to continue' : a.gamepad ? 'Press A to continue' : 'Press Enter to continue', w / 2, y0 + ph - 16 * s, 11 * s, INK, 'center', '600'); }
  ctx.globalAlpha = 1;
}
const GP_NOPLACE = (W) => W.cfg.mode === 'time';
function gpStandings() {
  const list = Object.keys(GP.points).map((id) => ({ id, name: CHARS[CHAR_IDX[id]].name, pts: GP.points[id], you: id === GP.char }));
  list.sort((x, y) => y.pts - x.pts || (x.you ? -1 : 1));
  list.forEach((r, i) => { r.place = i + 1; });
  return list;
}

/* ================================================================ menu */
const MENU_CSS =
  '.km-prev{display:grid;grid-template-columns:150px 1fr;gap:14px;align-items:center;margin:2px 0 12px;padding:10px;border:1px solid var(--rule-strong);border-radius:12px;background:var(--bg-deep)}' +
  '.arc-stage .km-prev canvas{position:static;inset:auto;width:150px;height:110px;display:block;border-radius:8px;background:var(--bg)}' +
  '.km-stat{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:center;font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.km-stat .km-name{grid-column:1/-1;font-family:var(--font-display);font-size:20px;letter-spacing:0;text-transform:none;color:var(--ink);line-height:1.1}' +
  '.km-bar{height:6px;border-radius:3px;background:var(--rule);position:relative;overflow:hidden}.km-bar i{position:absolute;inset:0 auto 0 0;background:var(--accent-warm);border-radius:3px}' +
  '.km-blurb{grid-column:1/-1;font-family:var(--font-body);font-size:13px;letter-spacing:0;text-transform:none;color:var(--ink-dim);line-height:1.35}' +
  '.km-tracks{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 12px;margin:0 0 12px;font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.km-tracks b{display:block;font-size:13px;color:var(--ink);font-weight:500;letter-spacing:0;text-transform:none}' +
  '.arc-card:has(.km-prev){padding-bottom:0}.arc-card:has(.km-prev) .arc-actions{position:sticky;bottom:0;background:var(--bg-elev);padding:12px 0 clamp(14px,3vw,22px);margin-top:8px;box-shadow:0 -14px 14px var(--bg-elev);z-index:2}' +
  '.arc-card:has(.km-prev) p{font-size:14px;margin-bottom:10px}.arc-card:has(.km-prev) h2{margin:4px 0 8px}' +
  '@media (pointer:fine){.arc-card:has(.km-prev) .arc-seg button{min-height:34px;padding:0 12px;font-size:13px}.arc-card:has(.km-prev) .arc-opts{gap:7px;margin-bottom:6px}}' +
  '.km-res{width:100%;border-collapse:collapse;margin:4px 0 12px;font-size:14px}.km-res td{padding:5px 8px;border-bottom:1px solid var(--rule);color:var(--ink-dim)}' +
  '.km-res tr.me td{background:var(--primary-soft);color:var(--ink)}.km-res td:first-child{font-family:var(--font-mono);color:var(--accent);width:34px}.km-res td:last-child{text-align:right;font-family:var(--font-mono)}' +
  '.km-line{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 10px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}.km-line b{display:block;font-size:16px;color:var(--ink);font-weight:500}' +
  '@media (max-width:420px){.km-prev{grid-template-columns:110px 1fr;gap:10px}.arc-stage .km-prev canvas{width:110px;height:84px}.km-tracks{font-size:10px}}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }

// A little portrait of the chosen racer in their kart, for the menu card.
function drawPreview(cv) {
  const g = cv.getContext('2d'), c = CHARS[CHAR_IDX[ARC.choices.char]] || CHARS[0], W = cv.width, H = cv.height;
  const tr = TRACKS[TRACK_IDX[ARC.choices.track]] || TRACKS[0];
  const bg = g.createLinearGradient(0, 0, 0, H);
  const skies = { fair: ['#0b1030', '#3a2a6a'], hill: ['#6e7d86', '#b9c2bd'], roof: ['#3a4b96', '#ffb062'] }[tr.id];
  bg.addColorStop(0, skies[0]); bg.addColorStop(1, skies[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (tr.id === 'fair') { for (let i = 0; i < 12; i++) { g.fillStyle = ['#ffb24a', '#ff5a7a', '#5ad1ff', '#ffe066'][i % 4]; g.beginPath(); g.arc(10 + i * W / 11, 18 + Math.sin(i * 0.9) * 6, 3, 0, TAU); g.fill(); } }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, H * 0.78, W, H * 0.22);
  const S = W / 4.2, ox = W * 0.5, gy = H * 0.86, X = (z) => ox + z * S, Y = (y) => gy - y * S;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(ox, gy + 2, S * 1.4, 5, 0, 0, TAU); g.fill();
  // kart side
  g.fillStyle = c.kart; g.beginPath(); g.moveTo(X(-1.05), Y(0.25)); g.lineTo(X(1.15), Y(0.25)); g.lineTo(X(1.2), Y(0.42)); g.lineTo(X(0.6), Y(0.56)); g.lineTo(X(0.15), Y(0.44)); g.lineTo(X(-0.55), Y(0.44)); g.lineTo(X(-0.75), Y(0.66)); g.lineTo(X(-1.05), Y(0.66)); g.closePath(); g.fill();
  g.fillStyle = c.trim; g.fillRect(X(-1.1), Y(1.08), 0.5 * S, 0.07 * S); g.fillRect(X(-0.95), Y(1.0), 0.05 * S, 0.36 * S);
  [[-0.8, 0.36], [0.8, 0.3]].forEach((wv) => { g.beginPath(); g.arc(X(wv[0]), Y(wv[1]), wv[1] * S, 0, TAU); g.fillStyle = '#1b1b1e'; g.fill(); g.beginPath(); g.arc(X(wv[0]), Y(wv[1]), wv[1] * S * 0.55, 0, TAU); g.fillStyle = c.trim; g.fill(); });
  // racer
  g.fillStyle = c.shirt; g.beginPath(); g.ellipse(X(-0.25), Y(0.82), 0.3 * S, 0.34 * S, 0, 0, TAU); g.fill();
  g.strokeStyle = c.shirt; g.lineWidth = 0.15 * S; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(-0.2), Y(0.9)); g.lineTo(X(0.3), Y(0.75)); g.stroke();
  const hx = X(-0.22), hy = Y(1.4), hr = 0.36 * S;
  if (c.kind === 'bear') { g.fillStyle = c.skin; g.beginPath(); g.arc(hx - hr * 0.7, hy - hr * 0.75, hr * 0.35, 0, TAU); g.arc(hx + hr * 0.7, hy - hr * 0.75, hr * 0.35, 0, TAU); g.fill(); }
  if (c.kind === 'cat') { g.fillStyle = c.skin; g.beginPath(); g.moveTo(hx - hr * 0.8, hy - hr * 0.4); g.lineTo(hx - hr * 0.5, hy - hr * 1.3); g.lineTo(hx - hr * 0.1, hy - hr * 0.8); g.fill(); g.beginPath(); g.moveTo(hx + hr * 0.8, hy - hr * 0.4); g.lineTo(hx + hr * 0.5, hy - hr * 1.3); g.lineTo(hx + hr * 0.1, hy - hr * 0.8); g.fill(); }
  if (c.kind === 'elephant') { g.fillStyle = c.skin; g.beginPath(); g.ellipse(hx - hr * 0.95, hy, hr * 0.5, hr * 0.75, 0, 0, TAU); g.ellipse(hx + hr * 0.95, hy, hr * 0.5, hr * 0.75, 0, 0, TAU); g.fill(); }
  g.fillStyle = c.skin; g.beginPath(); g.arc(hx, hy, hr, 0, TAU); g.fill();
  if (c.kind === 'kid' || c.kind === 'grandpa') { g.fillStyle = c.hat; g.beginPath(); g.arc(hx, hy - hr * 0.15, hr * 1.02, Math.PI, 0); g.fill(); }
  if (c.kind === 'girl' || c.kind === 'auntie') { g.fillStyle = c.hair; g.beginPath(); g.arc(hx, hy - hr * 0.1, hr * 1.04, Math.PI * 1.02, -0.02); g.fill(); if (c.kind === 'auntie') { g.beginPath(); g.arc(hx, hy - hr * 1.1, hr * 0.35, 0, TAU); g.fill(); } }
  if (c.kind === 'parrot') { g.fillStyle = '#ffb21a'; g.beginPath(); g.moveTo(hx + hr * 0.5, hy); g.lineTo(hx + hr * 1.3, hy + hr * 0.3); g.lineTo(hx + hr * 0.5, hy + hr * 0.5); g.fill(); g.fillStyle = c.hair; g.beginPath(); g.moveTo(hx - hr * 0.2, hy - hr); g.lineTo(hx, hy - hr * 1.6); g.lineTo(hx + hr * 0.25, hy - hr); g.fill(); }
  if (c.kind === 'elephant') { g.strokeStyle = c.skin; g.lineWidth = hr * 0.35; g.beginPath(); g.moveTo(hx, hy + hr * 0.3); g.quadraticCurveTo(hx + hr * 0.2, hy + hr * 1.3, hx + hr * 0.8, hy + hr * 1.0); g.stroke(); }
  [-1, 1].forEach((sd) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(hx + sd * hr * 0.36, hy - hr * 0.05, hr * 0.22, hr * 0.28, 0, 0, TAU); g.fill(); g.fillStyle = '#16161c'; g.beginPath(); g.arc(hx + sd * hr * 0.36 + hr * 0.04, hy - hr * 0.02, hr * 0.12, 0, TAU); g.fill(); });
  if (c.kind === 'auntie') { g.fillStyle = '#121216'; g.fillRect(hx - hr * 0.62, hy - hr * 0.22, hr * 1.24, hr * 0.32); }
  if (c.kind === 'grandpa') { g.fillStyle = c.hair; g.beginPath(); g.ellipse(hx - hr * 0.22, hy + hr * 0.42, hr * 0.3, hr * 0.12, 0.3, 0, TAU); g.ellipse(hx + hr * 0.22, hy + hr * 0.42, hr * 0.3, hr * 0.12, -0.3, 0, TAU); g.fill(); }
  else if (c.kind !== 'parrot' && c.kind !== 'elephant') { g.strokeStyle = '#7a2a24'; g.lineWidth = 2; g.beginPath(); g.arc(hx, hy + hr * 0.35, hr * 0.28, 0.2, Math.PI - 0.2); g.stroke(); }
}
function refreshPreview() {
  const card = document.querySelector('.arc-card'); if (!card) return;
  const cv = card.querySelector('.km-cv'), st = card.querySelector('.km-stat'); if (!cv || !st) return;
  const c = CHARS[CHAR_IDX[ARC.choices.char]] || CHARS[0];
  try { drawPreview(cv); } catch (e) { /* the menu must always open */ }
  const bar = (l, v) => '<span>' + l + '</span><div class="km-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div>';
  st.innerHTML = '<div class="km-name">' + ARC.esc(c.name) + '</div>' + bar('Speed', c.spd) + bar('Accel', c.acc) + bar('Handling', c.hnd) + bar('Weight', c.wt) + '<div class="km-blurb">' + ARC.esc(c.blurb) + '</div>';
}
function menuProps() {
  const tracks = TRACKS.map((t) => {
    const b = SAVE.best[t.id];
    const line = b ? (b.place ? ordinal(b.place) : '') + (b.place && b.tt ? ' · ' : '') + (b.tt ? fmtTime(b.tt) : '') : 'New';
    return '<span>' + ARC.esc(t.name) + '<b>' + ARC.esc(line || 'New') + '</b></span>';
  }).join('');
  const opts = [
    { id: 'mode', label: 'Mode', value: 'gp', choices: [{ v: 'gp', label: 'Grand Prix' }, { v: 'race', label: 'Single race' }, { v: 'time', label: 'Time trial' }], note: 'A Grand Prix races all three circuits for points. Time trial races your own ghost.' },
    { id: 'track', label: 'Circuit (single race and time trial)', value: 'fair', choices: TRACKS.map((t) => ({ v: t.id, label: t.name })) },
    { id: 'char', label: 'Racer', value: 'chotu', choices: CHARS.map((c) => ({ v: c.id, label: c.name })) },
    { id: 'diff', label: 'Difficulty', value: 'normal', choices: Object.keys(DIFF).map((k) => ({ v: k, label: DIFF[k].name + ' ' + DIFF[k].cc })) }
  ];
  if (!ARC.touchMode) opts.push({ id: 'mouse', label: 'Mouse steering', value: 'off', choices: [{ v: 'off', label: 'Off' }, { v: 'on', label: 'On' }], note: 'Steer by moving the mouse. Left button drifts, right button uses the item.' });
  const cups = SAVE.cups || {};
  const cupLine = Object.keys(DIFF).filter((k) => cups[k]).map((k) => DIFF[k].cc + ' ' + ordinal(cups[k])).join(' · ') || 'No cups yet';
  return {
    eyebrow: 'Cartoon kart racing', title: 'Kart <em>Mela</em>', noBest: false,
    html: '<div class="km-prev"><canvas class="km-cv" width="300" height="220"></canvas><div class="km-stat"></div></div>' +
      '<p>Eight racers, three laps, three circuits. Drift through the bends to charge a mini-turbo, smash item boxes for mango peels, paper rockets and power cuts, and race the Grand Prix for a place on the podium.</p>' +
      '<div class="km-tracks">' + tracks + '</div>' +
      '<div class="km-line"><span>Grand Prix best<b>' + ARC.esc(cupLine) + '</b></span></div>',
    options: opts
  };
}

/* ================================================================ game flow */
function stopAll() { engineStop(); }
function startWorld(cfg) {
  Wd = newWorld(cfg);
  VIEW.world(Wd);
  engineStart();
  SND.mus.step = 0; SND.mus.t = 0;
}
function contPressed(a) {
  const i = a.input;
  const tq = TOUCH.tapQ > 0; TOUCH.tapQ = 0;
  return !!(tq || i.tap() || i.hit('Enter', 'NumpadEnter', 'Space', 'KeyE', 'KeyX', 'KeyJ') || (i.pointer.pressed && i.pointer.type === 'mouse'));
}
function resultsHtml(W) {
  if (W.cfg.mode === 'time') {
    return '<div class="km-line"><span>Total<b>' + fmtTime(W.P.finT) + '</b></span><span>Best lap<b>' + fmtTime(W.P.stats.bestLap) + '</b></span><span>Record<b>' + fmtTime(SAVE.best[W.T.id] && SAVE.best[W.T.id].tt) + '</b></span></div>' +
      '<p>' + (W.ttNew ? 'A new record. Your ghost is saved and will race you next time.' : 'Race your ghost again to beat it.') + '</p>';
  }
  const list = GP ? gpStandings().map((r) => ({ place: r.place, name: r.name, you: r.you, c: r.pts + ' pts' })) : W.results.map((r) => ({ place: r.place, name: r.name, you: r.you, c: fmtTime(r.time) }));
  const st = W.P.stats;
  return '<table class="km-res">' + list.map((r) => '<tr class="' + (r.you ? 'me' : '') + '"><td>' + ordinal(r.place) + '</td><td>' + ARC.esc(r.you ? 'You (' + r.name + ')' : r.name) + '</td><td>' + ARC.esc(r.c) + '</td></tr>').join('') + '</table>' +
    '<div class="km-line"><span>Turbos<b>' + st.turbos + '</b></span><span>Hits landed<b>' + st.hits + '</b></span><span>Items used<b>' + st.items + '</b></span><span>Best lap<b>' + fmtTime(st.bestLap) + '</b></span></div>';
}
function finishRun(a) {
  const W = Wd; engineStop();
  if (W.cfg.mode === 'gp' && GP) {
    const st = gpStandings(), me = st.find((r) => r.you);
    const prev = SAVE.cups[GP.diff]; if (!prev || me.place < prev) { SAVE.cups[GP.diff] = me.place; saveGame(); }
    let score = 0; GP.scores.forEach((v) => { score += v; });
    score += Math.round((me.place === 1 ? 1500 : me.place === 2 ? 900 : me.place === 3 ? 500 : 0) * W.d.mul);
    a.over({ eyebrow: 'Grand Prix · ' + W.d.cc, title: me.place === 1 ? 'Champion of the <em>Mela</em>' : 'Grand Prix: ' + ordinal(me.place) + ' overall', html: resultsHtml(W), score, scoreLabel: 'Cup score', again: 'Race another Grand Prix' });
  } else if (W.cfg.mode === 'time') {
    a.over({ eyebrow: 'Time trial · ' + W.T.def.name, title: W.ttNew ? 'New <em>record</em>' : 'Time trial done', html: resultsHtml(W), score: raceScore(W), scoreLabel: 'Score', again: 'Try again' });
  } else {
    const me = W.results.find((r) => r.you);
    a.over({ eyebrow: W.T.def.name + ' · ' + W.d.cc, title: me.place === 1 ? 'You <em>win!</em>' : 'You finished ' + ordinal(me.place), html: resultsHtml(W), score: raceScore(W), scoreLabel: 'Score', again: 'Race again' });
  }
}
function advance(a) {
  const W = Wd;
  if (W.phase === 'results') {
    if (GP) GP.scores.push(raceScore(W));
    if (W.cfg.mode === 'gp' && GP && GP.idx < GP.races.length - 1) { W.phase = 'standings'; W.contT = 0; return; }
    if (W.cfg.mode === 'gp' && GP) { toPodium(W); return; }
    finishRun(a); return;
  }
  if (W.phase === 'standings') {
    W.fade = 1;
    GP.idx++;
    startWorld({ mode: 'gp', track: GP.races[GP.idx], diff: GP.diff, char: GP.char, mouse: W.cfg.mouse, gpRace: GP.idx + 1 });
    return;
  }
  if (W.phase === 'podium') finishRun(a);
}
function toPodium(W) {
  W.phase = 'podium'; W.contT = 0; W.fade = 1; W.pops = []; W.banner = null; W.bannerT = 0; W.photo = null; W.slowT = 0; W.slowK = 1;
  const st = gpStandings(), T = W.T;
  if (VIEW.podium) VIEW.podium(W);
  posAt(T, T.startS + 30, 0, 0, FR_TMP); frameAt(T, T.startS + 30);
  const px = FR_TMP.x, py = FR_TMP.y, pz = FR_TMP.z, ph = FR.h + Math.PI, rxx = Math.cos(ph), rzz = -Math.sin(ph);
  const spots = [[0, 1.6], [-3.3, 1.1], [3.3, 0.7]];
  W.karts.forEach((K) => { K.y = -200; K.x = px; K.z = pz; K.v = 0; K.slip = 0; K.finished = true; K.anim.cele = 0; K.respawnT = 0; });
  st.slice(0, 3).forEach((r, i) => {
    const K = W.karts.find((k) => k.c.id === r.id); if (!K) return;
    K.x = px + rxx * spots[i][0]; K.z = pz + rzz * spots[i][0]; K.y = py + spots[i][1]; K.h = ph; K.anim.cele = 1; K.anim.yawVis = 0; K.anim.spinYaw = 0; K.drift = 0; K.steerIn = 0;
  });
  sfx('finish'); sfx('cheer');
  rumble(200, 0.7, 0.8, 'success');
}

function debugState() {
  const W = Wd, a = ARC;
  if (!W) return { phase: 'none', state: a.state };
  const P = W.P, st = P.stats;
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, mode: W.cfg.mode, track: W.T.id, diff: W.cfg.diff, char: P.c.id, renderer: VIEW.three ? '3d' : '2d',
    lap: Math.max(0, P.lap + 1), laps: LAPS, position: P.place, racers: W.karts.length, speed: Math.round(Math.abs(P.v) * KMH), distance: Math.round(P.totalD), progress: +clamp(P.totalD / (LAPS * W.T.L), 0, 1).toFixed(3),
    x: +P.x.toFixed(2), z: +P.z.toFixed(2), heading: +P.h.toFixed(2), lat: +P.lat.toFixed(2), aim: +aimFor(W, P).toFixed(2), steer: +P.steerIn.toFixed(2), drift: P.drift, driftLevel: P.level, charge: +P.charge.toFixed(2), boost: +P.boostT.toFixed(2), airborne: P.air, surface: P.surf, shortcut: P.onShort,
    item: P.item, rolling: P.roulT > 0, itemsUsed: st.items, boxes: st.boxes, drifts: st.drifts, turbos: st.turbos, hits: st.hits, hitsTaken: st.taken, tricks: st.tricks, shield: P.shieldT > 0, shrunk: P.shrinkT > 0,
    time: +W.raceT.toFixed(2), countdown: +Math.max(0, W.cd).toFixed(2), finished: P.finished, finalLap: W.finalLap, results: W.results, ghost: !!W.ghost,
    gpRace: GP ? GP.idx + 1 : 0, gpPoints: GP ? (GP.points[GP.char] || 0) : 0, alive: true,
    rivals: W.karts.slice(1).map((K) => ({ name: K.c.name, pos: K.place, d: Math.round(K.totalD), item: K.item })),
    touchStyle: a.touchStyle, input: a.inputMode, ms: { sim: +RT.sim.toFixed(1), view: +RT.view.toFixed(1), hud: +RT.hud.toFixed(1) }, gfx: VIEW.info ? VIEW.info() : null
  };
}
// the steering a careful driver would hold right now, for tests and the attract camera
function aimFor(W, P) {
  if (!W.T || P.hi < 0) return 0;
  posAt(W.T, P.s + 9 + Math.max(0, P.v) * 0.4, -P.lat * 0.3, 0, FR_TMP);
  return clamp(-wrapA(Math.atan2(FR_TMP.x - P.x, FR_TMP.z - P.z) - P.h) * 2.2, -1, 1);
}
const dev = {
  world: () => Wd,
  quality: (q) => { if (VIEW.quality) VIEW.quality(q); },
  skip: () => { const W = Wd; if (!W) return; if (W.phase === 'intro') { W.phase = 'countdown'; W.cd = 0.05; W.fade = 0; } else if (W.phase === 'countdown') W.cd = 0.05; },
  ff: (sec) => { const n = Math.round(sec * 50); for (let i = 0; i < n && Wd && !Wd.results; i++) stepWorld(Wd, 0.02); },
  view: () => VIEW,
  cam: () => (R3 && R3.camera ? { x: R3.camera.position.x, z: R3.camera.position.z, yaw: R3.camYaw, mode: R3.mode } : null),
  touch: () => TOUCH,
  bot: (on) => { if (Wd) Wd.P.bot = on !== false; },
  item: (id) => { if (Wd) { Wd.P.item = id || 'rocket'; Wd.P.roulT = 0; } },
  teleport: (s) => { if (Wd) { const P = Wd.P; posAt(Wd.T, s, 0, 0, P); P.h = FR.h; P.hi = -1; locate(Wd.T, P); P.prevS = P.s; } }
};

function showNo3D(a) {
  a.panel({ eyebrow: 'Kart Mela', title: 'Graphics <em>unavailable</em>', html: '<p>This browser could not start its graphics. Try another browser or turn on hardware acceleration.</p>', actions: [{ label: 'All games', href: '/games', primary: true }] });
}
let NOVIEW = false;
const RT = { last: 0, dt: 0.016, view: 0, hud: 0, sim: 0 };
Arcade.create({
  three: !!VIEW.three,
  slug: 'kart-mela', title: 'Kart Mela', genre: 'Cartoon kart racing',
  graphics(level) { if (VIEW.graphics) VIEW.graphics(level); },
  hint: 'Arrows or WASD to drive. Space or Shift to hop and drift, X or E to use your item, C to look behind.',
  touchHint: 'Stick steers. Drift, Item and Brake on the buttons. The throttle is always on.',
  keys: [['Left Right / A D', 'Steer'], ['Up / W', 'Accelerate'], ['Down / S', 'Brake and reverse'], ['Space / Shift', 'Hop and drift'], ['X / E', 'Use item'], ['C', 'Look behind']],
  gameKeys: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyE', 'KeyC', 'Enter'],
  mouse: { steer: false, cursor: 'default', keys: [['Mouse steering', 'Turn it on in the menu'], ['Move the mouse', 'Steer'], ['Left button', 'Drift'], ['Right button', 'Use item']] },
  // Controller: RT accelerate, LT brake, A or X item, B or RB drift, Y looks behind.
  gamepad: { buttons: ['KeyE', 'KeyX', 'ShiftLeft', 'KeyC'], rt: 'ArrowUp', lt: 'ArrowDown' },
  touch: { stick: true, pads: [{ label: 'Drift', key: 'ShiftLeft', big: true }, { label: 'Item', key: 'KeyE', hot: true }, { label: 'Brake', key: 'ArrowDown' }] },
  touchKeys: [['On-screen stick', 'Steer'], ['Drift', 'Hold to hop and drift'], ['Item', 'Use your item'], ['Brake', 'Slow down'], ['Throttle', 'Always on']],
  gestures: {
    drag: 'x', tilt: true,
    hint: 'Drag to steer. Hold still, or add a second finger, to drift. Tap to use your item.',
    keys: [['Drag left or right', 'Steer'], ['Touch and hold', 'Hop and drift'], ['Second finger', 'Drift while you steer'], ['Tap', 'Use your item'], ['Drag down', 'Brake'], ['Throttle', 'Always on']]
  },
  formatScore: (v) => Math.round(v).toLocaleString('en-IN') + ' pts',
  resize: (a) => { if (VIEW.resize) VIEW.resize(a); },
  init(a) {
    ARC = a;
    loadSave();
    if (!VIEW.init(a)) { NOVIEW = true; showNo3D(a); return; }
    wireInput(a);
    const origMenu = a.menu;
    a.menu = function (p) { stopAll(); return origMenu(Object.assign(menuProps(), p || {})); };
    a.debug = debugState;
    a.dev = dev;
    a.menu();
  },
  onMenu(a) {
    if (NOVIEW) return;
    injectCss(); stopAll(); GP = null;
    const card = document.querySelector('.arc-card'); if (!card) return;
    refreshPreview();
    card.querySelectorAll('.arc-seg').forEach((seg) => seg.addEventListener('click', () => setTimeout(refreshPreview, 0)));
  },
  start(a, ch) {
    if (NOVIEW) return;
    TOUCH.tapQ = 0; TOUCH.itemQ = 0;
    const mode = ch.mode || 'gp', diff = DIFF[ch.diff] ? ch.diff : 'normal', char = CHAR_IDX[ch.char] != null ? ch.char : 'chotu';
    const mouse = !a.touchMode && ch.mouse === 'on';
    GP = mode === 'gp' ? { races: ['fair', 'hill', 'roof'], idx: 0, points: {}, log: [], diff, char, scores: [] } : null;
    if (GP) CHARS.forEach((c) => { GP.points[c.id] = 0; });
    TOUCH.map.clear(); TOUCH.primary = null; MOUSE.left = false;
    startWorld({ mode, track: GP ? GP.races[0] : (TRACK_IDX[ch.track] != null ? ch.track : 'fair'), diff, char, mouse, gpRace: GP ? 1 : 0 });
  },
  update(dt, a) {
    if (!Wd || NOVIEW) return;
    const W = Wd, P = W.P, inp = a.input;
    let use = false;
    if (!P.bot && (W.phase === 'race' || W.phase === 'countdown')) use = readPlayer(W, P, dt);
    else if (W.phase === 'intro') readPlayer(W, P, dt);
    if (W.phase === 'intro') {
      W.introT += dt;
      const k = W.introT / W.introDur;
      // dips to black between the intro shots
      const dip = (c) => clamp(1 - Math.abs(k - c) / 0.035, 0, 1);
      W.fade = Math.max(clamp(1 - W.introT * 2.2, 0, 1), dip(0.36), dip(0.74));
      const tq = TOUCH.tapQ > 0; TOUCH.tapQ = 0;
      const skip = W.introT > 0.25 && (tq || inp.tap() || inp.hit('Space', 'Enter', 'NumpadEnter', 'KeyE', 'KeyX', 'KeyJ', 'ArrowUp', 'KeyW', 'ShiftLeft') || (inp.pointer.pressed && inp.pointer.type === 'mouse'));
      if (W.introT >= W.introDur || skip) { W.phase = 'countdown'; W.cd = 3.4; W.fade = skip ? 0.6 : 0; W.introT = W.introDur; }
    } else if (W.phase === 'countdown' || W.phase === 'race' || W.phase === 'finished') {
      W.fade = Math.max(0, W.fade - dt * 2.5);
      if (use && W.phase === 'race' && !P.finished) { if (P.item && P.roulT <= 0) useItem(W, P); }
      if (W.slowT > 0) { W.slowT -= dt; if (W.slowT <= 0) { W.slowK = 1; W.photo = null; } }
      const n = Math.max(1, Math.ceil(dt / 0.02)), ts = nowMs();
      for (let k = 0; k < n; k++) stepWorld(W, dt / n);
      RT.sim = RT.sim * 0.9 + (nowMs() - ts) * 0.1;
    } else if (W.phase === 'results' || W.phase === 'standings' || W.phase === 'podium') {
      W.fade = Math.max(0, W.fade - dt * 1.5);
      W.contT += dt; W.t += dt;
      if (W.slowT > 0) { W.slowT -= dt; if (W.slowT <= 0) { W.slowK = 1; W.photo = null; } }
      if (W.phase !== 'podium') { const n = Math.max(1, Math.ceil(dt / 0.02)); for (let k = 0; k < n; k++) { W.karts.forEach((K) => { if (K.bot) { aiDrive(W, K, dt / n); } }); W.karts.forEach((K) => stepKart(W, K, dt / n)); } }
      if (W.contT > 1.1 && contPressed(a)) { sfx('lap'); advance(a); return; }
    }
    // timers for the HUD
    W.pops.forEach((p) => { p.t += dt; }); W.pops = W.pops.filter((p) => p.t < 2);
    if (W.bannerT > 0) W.bannerT -= dt;
    if (W.phase === 'finished' && P.finished && W.finWait > 2.2 && !W.celebrated) { W.celebrated = true; }
  },
  idle(dt, a) {
    if (NOVIEW || a.state !== 'menu') return;
    const c = a.choices, key = (c.track || 'fair') + '|' + (c.char || 'chotu');
    if (!Wd || !Wd.attract || Wd.attractKey !== key) {
      Wd = newWorld({ track: TRACK_IDX[c.track] != null ? c.track : 'fair', mode: 'race', char: CHAR_IDX[c.char] != null ? c.char : 'chotu', diff: 'normal', attract: true }); Wd.attractKey = key;
      VIEW.world(Wd);
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(Wd, dt / n);
  },
  render(ctx, a) {
    if (NOVIEW) return;
    const W = Wd;
    const now = nowMs(), dtRaw = RT.last ? (now - RT.last) / 1000 : 1 / 60, dtReal = clamp(dtRaw, 0.001, 0.1); RT.last = now; RT.dt = dtReal;
    if (!W) { ctx.fillStyle = '#060503'; ctx.fillRect(0, 0, a.w, a.h); return; }
    if (VIEW.lost && VIEW.lost()) {
      ctx.fillStyle = 'rgba(6,5,3,.85)'; ctx.fillRect(0, 0, a.w, a.h);
      txt(ctx, 'Graphics paused. Restoring...', a.w / 2, a.h / 2, 16, INK, 'center', '600'); return;
    }
    const paused = a.state === 'pause';
    if (a.state === 'play' && !paused) { musicTick(W, dtReal); ambienceTick(W, dtReal); engineSet(W, W.P); }
    const t0 = nowMs();
    VIEW.render(W, paused ? 0 : dtReal * (W.slowK || 1), a, ctx);
    const t1 = nowMs();
    if (a.state !== 'menu') drawHUD(ctx, a, W);
    const t2 = nowMs();
    RT.view = RT.view * 0.9 + (t1 - t0) * 0.1; RT.hud = RT.hud * 0.9 + (t2 - t1) * 0.1;
  },
  onPause() { engineStop(); },
  onResume() { if (Wd && !Wd.attract && (Wd.phase === 'race' || Wd.phase === 'countdown' || Wd.phase === 'intro' || Wd.phase === 'finished')) engineStart(); },
  onOver() { engineStop(); }
});
