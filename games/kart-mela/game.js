(function () {
  'use strict';
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

/* ================================================================ the 2D view (no WebGL) */
// The same race drawn from above: the world turns so your kart always points up.
const V2 = { cache: {}, parts: [], camX: 0, camZ: 0, camH: 0, init: false, fps: 60, fT: 0, fN: 0, fw: 2 };
const PAL2 = {
  fair: { bg: '#1b2a1c', verge: '#3a4a2a', road: '#3a3940', curbA: '#d8262e', curbB: '#f4f1ea', sc: '#7a5a3a', night: 0.42, tint: 'rgba(40,20,90,', deco: ['#e8452c', '#ffb736', '#2d7fd1', '#e94f8a'] },
  hill: { bg: '#2f5a2a', verge: '#4f7a38', road: '#3c3e40', curbA: '#f2c230', curbB: '#2b2d33', sc: '#7d7a74', night: 0.1, tint: 'rgba(120,140,140,', deco: ['#2f5a33', '#376a3a', '#3f7442'] },
  roof: { bg: '#5a524c', verge: '#e2c7a8', road: '#b9805c', curbA: '#ff7a1a', curbB: '#fff2dc', sc: '#8a5a34', night: 0.0, tint: 'rgba(255,140,60,', deco: ['#f2c9a0', '#e8a0a0', '#9ccbe0', '#f4e3b0'] }
};
const S2 = 5; // pixels per metre in the cached ground layer
function trackLayer(T) {
  if (V2.cache[T.id]) return V2.cache[T.id];
  const p = PAL2[T.id], b = T.box, M = 50;
  const W0 = Math.ceil((b.x1 - b.x0 + 2 * M) * S2), H0 = Math.ceil((b.z1 - b.z0 + 2 * M) * S2);
  const cv = document.createElement('canvas'); cv.width = W0; cv.height = H0;
  const g = cv.getContext('2d');
  const X = (x) => (x - b.x0 + M) * S2, Z = (z) => (z - b.z0 + M) * S2;
  g.fillStyle = p.bg; g.fillRect(0, 0, W0, H0);
  const r = rng(5);
  // ground speckle
  for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * 0.12 + ')'; g.fillRect(r() * W0, r() * H0, 2 + r() * 4, 2 + r() * 4); }
  const path = (S, closed) => { g.beginPath(); for (let i = 0; i < S.N; i++) i ? g.lineTo(X(S.X[i]), Z(S.Z[i])) : g.moveTo(X(S.X[i]), Z(S.Z[i])); if (closed) g.closePath(); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  // scenery round the lap
  for (let i = 0; i < 260; i++) {
    const x = lerp(b.x0 - M, b.x1 + M, r()), z = lerp(b.z0 - M, b.z1 + M, r());
    const m = nearestPath(T, x, z, -1, true); if (Math.sqrt(m.d2) < T.def.hw + T.def.wall + 3) continue;
    if (T.sc) { const q = nearestPath(T.sc, x, z, -1, false); if (Math.sqrt(q.d2) < T.sc.hw + 3) continue; }
    const c = p.deco[i % p.deco.length];
    if (T.id === 'hill') { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(X(x) + 4, Z(z) + 4, 7, 0, TAU); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(X(x), Z(z), 7 + r() * 3, 0, TAU); g.fill(); }
    else if (T.id === 'roof') { const s = 18 + r() * 24; g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(X(x) + 5, Z(z) + 5, s, s); g.fillStyle = c; g.fillRect(X(x), Z(z), s, s); if (r() < 0.4) { g.fillStyle = '#2b2b30'; g.beginPath(); g.arc(X(x) + s / 2, Z(z) + s / 2, 4, 0, TAU); g.fill(); } }
    else if (i % 3 === 0) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(X(x) + 3, Z(z) + 3, 12, 9); g.fillStyle = c; g.fillRect(X(x), Z(z), 12, 9); g.fillStyle = '#fff2dc'; g.fillRect(X(x) + 4, Z(z), 4, 9); }
  }
  // verge, curbs, road
  g.strokeStyle = p.verge; g.lineWidth = (T.def.hw + T.def.wall) * 2 * S2; path(T, true); g.stroke();
  g.strokeStyle = p.curbA; g.lineWidth = (T.def.hw + 1) * 2 * S2; path(T, true); g.stroke();
  g.setLineDash([3 * S2, 3 * S2]); g.strokeStyle = p.curbB; g.stroke(); g.setLineDash([]);
  g.strokeStyle = p.road; g.lineWidth = T.def.hw * 2 * S2; path(T, true); g.stroke();
  g.setLineDash([4 * S2, 6 * S2]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; path(T, true); g.stroke(); g.setLineDash([]);
  if (T.sc) { g.strokeStyle = p.sc; g.lineWidth = T.sc.hw * 2 * S2; path(T.sc, false); g.stroke(); }
  // gaps over the alley or the fountain
  T.gaps.forEach((G) => { for (let s = G[0]; s < G[1]; s += 1) { frameAt(T, s); g.fillStyle = T.id === 'fair' ? '#0b2a4a' : '#2a2420'; g.save(); g.translate(X(FR.x), Z(FR.z)); g.rotate(-FR.h); g.fillRect(-(T.def.hw + 2) * S2, -S2, (T.def.hw + 2) * 2 * S2, 2.4 * S2); g.restore(); } });
  // start line
  frameAt(T, T.startS); g.save(); g.translate(X(FR.x), Z(FR.z)); g.rotate(-FR.h);
  for (let i = 0; i < 14; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f5efe3'; g.fillRect(-T.def.hw * S2 + i * T.def.hw * 2 * S2 / 14, j * S2 * 0.7, T.def.hw * 2 * S2 / 14, S2 * 0.7); }
  g.restore();
  // pads and puddles
  T.pads.forEach((pd) => { if (pd.onShort) return; posAt(T, pd.s, pd.lat, 0, FR_TMP); g.save(); g.translate(X(FR_TMP.x), Z(FR_TMP.z)); g.rotate(-FR.h); g.fillStyle = '#ff8a2a'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-5 * S2 / 3, (k * 2 - 2) * S2 + S2); g.lineTo(0, (k * 2 - 2) * S2 + S2 * 2); g.lineTo(5 * S2 / 3, (k * 2 - 2) * S2 + S2); g.lineWidth = 4; g.strokeStyle = '#ffb736'; g.stroke(); } g.restore(); });
  const out = { cv, x0: b.x0 - M, z0: b.z0 - M };
  V2.cache[T.id] = out;
  return out;
}
function part2(x, z, vx, vz, life, size, col, kind) {
  if (V2.parts.length > 260) V2.parts.shift();
  V2.parts.push({ x, z, vx, vz, life, max: life, size, col, kind: kind || 'dot' });
}
function drawKart2(ctx, K, k, t) {
  const c = K.c, sc = (K.shrinkT > 0 ? 0.6 : 1);
  ctx.save(); ctx.translate(K.x, K.z); ctx.rotate(-(K.h + (K.drift ? K.drift * -0.34 : 0) + K.anim.spinYaw));
  ctx.scale(sc * (1 + K.y * 0.02), sc * (1 + K.y * 0.02));
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-0.9 + 0.25, -1.2 + 0.25, 1.8, 2.4);
  ctx.fillStyle = '#1b1b1e'; [[-0.85, 0.8], [0.85, 0.8], [-0.9, -0.8], [0.9, -0.8]].forEach((w) => ctx.fillRect(w[0] - 0.18, w[1] - 0.3, 0.36, 0.6));
  ctx.fillStyle = c.kart; rr(ctx, -0.7, -1.15, 1.4, 2.4, 0.4); ctx.fill();
  ctx.fillStyle = c.trim; ctx.fillRect(-0.72, -1.25, 1.44, 0.25);
  ctx.fillStyle = c.shirt; ctx.beginPath(); ctx.arc(0, -0.2, 0.36, 0, TAU); ctx.fill();
  ctx.fillStyle = c.skin; ctx.beginPath(); ctx.arc(0, 0.1, 0.38, 0, TAU); ctx.fill();
  ctx.fillStyle = c.hat; ctx.beginPath(); ctx.arc(0, 0.05, 0.3, Math.PI, 0); ctx.fill();
  if (K.isPlayer) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.12; rr(ctx, -0.8, -1.25, 1.6, 2.6, 0.45); ctx.stroke(); }
  if (K.shieldT > 0) { ctx.strokeStyle = 'rgba(255,154,31,.8)'; ctx.lineWidth = 0.25; ctx.setLineDash([0.3, 0.25]); ctx.beginPath(); ctx.arc(0, 0, 1.6, t * 3, t * 3 + TAU); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
}
const VIEW2D = {
  three: false,
  init(a) { V2.init = true; return true; },
  resize() {},
  world(W) { V2.parts.length = 0; V2.camInit = false; },
  graphics() {}, quality() {}, podium() {},
  lost() { return false; },
  info() { return { quality: 0, fps: Math.round(V2.fps), soft: true, calls: 0, tris: 0, post: false, camera: '2d' }; },
  project(x, y, z, out) {
    const dx = x - V2.camX, dz = z - V2.camZ, h = V2.camH, k = V2.k || 8;
    out.x = V2.ox + (-Math.cos(h) * dx + Math.sin(h) * dz) * k; out.y = V2.oy - (Math.sin(h) * dx + Math.cos(h) * dz) * k - y * k * 0.5; out.vis = true;
    return out;
  },
  fx(kind, a, b, c) {
    if (kind === 'turbo' || kind === 'sparkup') { for (let i = 0; i < 10; i++) part2(a.x, a.z, rnd2(6), rnd2(6), 0.4, 0.35, SPARK_HUD[b] || '#ffd27a'); }
    else if (kind === 'hit' || kind === 'boom' || kind === 'wall' || kind === 'bump') { const x = a.x, z = a.z; for (let i = 0; i < 12; i++) part2(x, z, rnd2(8), rnd2(8), 0.5, 0.3, '#ffd27a'); }
    else if (kind === 'box') { for (let i = 0; i < 12; i++) part2(a.x, a.z, rnd2(6), rnd2(6), 0.6, 0.35, ['#ff4f9a', '#ffb736', '#44ffa8', '#38c8ff'][i % 4]); }
    else if (kind === 'splash' || kind === 'land' || kind === 'spice') { for (let i = 0; i < 4; i++) part2(a.x, a.z, rnd2(4), rnd2(4), 0.6, 0.7, kind === 'spice' ? '#e8452c' : 'rgba(220,230,240,.7)', 'puff'); }
    else if (kind === 'finish') { for (let i = 0; i < 60; i++) part2(a.x + rnd2(12), a.z + rnd2(12), rnd2(3), rnd2(3), 2.5, 0.4, ['#ff6940', '#ffb736', '#44ffa8', '#38e1ff', '#e94f8a'][i % 5], 'conf'); }
  },
  render(W, dt, a, ctx) {
    V2.fT += dt; V2.fN++; if (V2.fT > 1) { V2.fps = V2.fN / V2.fT; V2.fT = 0; V2.fN = 0; }
    const T = W.T, P = W.attract ? (W.order ? W.order[0] : W.karts[0]) : W.P, w = a.w, h = a.h, t = W.t, pal = PAL2[T.id];
    const port = w < h;
    const intro = W.phase === 'intro';
    const k = intro ? Math.min(w, h) / (Math.max(T.box.x1 - T.box.x0, T.box.z1 - T.box.z0) + 40) * lerp(1, 2.2, smooth01(W.introT / W.introDur)) : (port ? 8 : 10) * (1 - clamp(Math.abs(P.v) / 30, 0, 1) * 0.18);
    V2.k += ((V2.k || k) === k ? 0 : (k - (V2.k || k)) * Math.min(1, dt * 4)); if (!V2.k || !V2.camInit) V2.k = k;
    const cx = intro ? lerp(T.box.cx, P.x, smooth01(W.introT / W.introDur)) : P.x, cz = intro ? lerp(T.box.cz, P.z, smooth01(W.introT / W.introDur)) : P.z;
    const ch = intro ? lerp(0.3, P.h, smooth01(W.introT / W.introDur)) : P.h;
    if (!V2.camInit) { V2.camX = cx; V2.camZ = cz; V2.camH = ch; V2.camInit = true; }
    const kk = Math.min(1, dt * 6);
    V2.camX += (cx - V2.camX) * kk; V2.camZ += (cz - V2.camZ) * kk; V2.camH += wrapA(ch - V2.camH) * Math.min(1, dt * 3.5);
    V2.ox = w / 2; V2.oy = intro ? h / 2 : h * 0.64;
    const hh = V2.camH, kz = V2.k;
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(V2.ox, V2.oy);
    ctx.transform(-Math.cos(hh) * kz, -Math.sin(hh) * kz, Math.sin(hh) * kz, -Math.cos(hh) * kz, 0, 0);
    ctx.translate(-V2.camX, -V2.camZ);
    const L0 = trackLayer(T);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(L0.cv, L0.x0, L0.z0, L0.cv.width / S2, L0.cv.height / S2);
    // puddles, sacks, heaps, balls
    W.haz.forEach((hz) => {
      if (hz.k === 'puddle') { ctx.fillStyle = 'rgba(120,150,170,.5)'; ctx.beginPath(); ctx.ellipse(hz.x, hz.z, 2.6, 4.2, -FR.h, 0, TAU); ctx.fill(); }
      else if (hz.k === 'sack') { ctx.fillStyle = '#c9a46e'; ctx.beginPath(); ctx.arc(hz.x, hz.z, 0.9, 0, TAU); ctx.fill(); }
      else if (hz.k === 'heap') { ctx.fillStyle = '#e8452c'; ctx.beginPath(); ctx.arc(hz.x, hz.z, 1.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffc531'; ctx.beginPath(); ctx.arc(hz.x, hz.z, 0.7, 0, TAU); ctx.fill(); }
      else if (hz.k === 'ball') { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(hz.x + 0.5, hz.z + 0.5, 1.7, 0, TAU); ctx.fill(); ['#ff4f9a', '#ffd23f', '#38c8ff', '#44ffa8'].forEach((cc, i) => { ctx.fillStyle = cc; ctx.beginPath(); ctx.moveTo(hz.x, hz.z); ctx.arc(hz.x, hz.z, 1.7, hz.spin + i * TAU / 4, hz.spin + (i + 1) * TAU / 4); ctx.fill(); }); }
    });
    // item boxes
    W.boxes.forEach((b) => { if (!b.on) return; ctx.save(); ctx.translate(b.x, b.z); ctx.rotate(t * 1.5 + b.k); const gr = ctx.createLinearGradient(-0.6, -0.6, 0.6, 0.6); gr.addColorStop(0, '#ff4f9a'); gr.addColorStop(0.5, '#ffb736'); gr.addColorStop(1, '#38c8ff'); ctx.fillStyle = gr; ctx.fillRect(-0.6, -0.6, 1.2, 1.2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.12; ctx.strokeRect(-0.6, -0.6, 1.2, 1.2); ctx.restore(); });
    // peels and rockets
    W.objs.forEach((o) => {
      if (o.type === 'peel') { ctx.fillStyle = '#ffc531'; ctx.beginPath(); ctx.ellipse(o.x, o.z, 0.5, 0.35, o.rot, 0, TAU); ctx.fill(); }
      else { ctx.save(); ctx.translate(o.x, o.z); ctx.rotate(-o.h); ctx.fillStyle = '#f4f1ea'; ctx.fillRect(-0.2, -0.6, 0.4, 1.2); ctx.fillStyle = '#e8452c'; ctx.beginPath(); ctx.moveTo(-0.2, 0.6); ctx.lineTo(0, 1.0); ctx.lineTo(0.2, 0.6); ctx.fill(); ctx.restore(); part2(o.x, o.z, rnd2(1), rnd2(1), 0.5, 0.3, 'rgba(240,235,225,.7)', 'puff'); }
    });
    // particles under the karts
    for (let i = V2.parts.length - 1; i >= 0; i--) {
      const p = V2.parts[i]; p.life -= dt; if (p.life <= 0) { V2.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.96; p.vz *= 0.96;
      const f = p.life / p.max; ctx.globalAlpha = p.kind === 'conf' ? 1 : f; ctx.fillStyle = p.col;
      if (p.kind === 'conf') ctx.fillRect(p.x, p.z, p.size, p.size * 0.6);
      else { ctx.beginPath(); ctx.arc(p.x, p.z, p.size * (p.kind === 'puff' ? 2 - f : 1), 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    W.karts.forEach((K) => {
      if (K.respawnT > 0 && K.anim.rescue > 0.6) return;
      if (K.drift && K.level > 0 && Math.random() < 0.6) part2(K.x - Math.sin(K.h) * 1.1, K.z - Math.cos(K.h) * 1.1, rnd2(3), rnd2(3), 0.3, 0.22, SPARK_HUD[K.level]);
      if (K.boostT > 0) part2(K.x - Math.sin(K.h) * 1.4, K.z - Math.cos(K.h) * 1.4, rnd2(2), rnd2(2), 0.25, 0.3, '#ff9a3a');
    });
    if (W.ghost && (W.phase === 'race' || W.phase === 'finished') && ghostAt2(W.ghost, W.raceT)) { ctx.globalAlpha = 0.4; drawKart2(ctx, { x: G2.x, z: G2.z, y: 0, h: G2.h, c: CHARS[CHAR_IDX[W.ghost.char]] || CHARS[0], shrinkT: 0, drift: 0, anim: { spinYaw: 0 }, shieldT: 0 }, 1, t); ctx.globalAlpha = 1; }
    for (let i = W.karts.length - 1; i >= 0; i--) { const K = W.karts[i]; if (K.y < -100) continue; drawKart2(ctx, K, 1, t); }
    ctx.restore();
    // light and weather over the top
    if (pal.night) { ctx.fillStyle = pal.tint + pal.night + ')'; ctx.fillRect(0, 0, w, h); }
    if (T.id === 'hill') { ctx.strokeStyle = 'rgba(210,225,235,.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 70; i++) { const x = (i * 97.3 + t * 140) % w, y = (i * 53.1 + t * 520) % h; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); } ctx.stroke(); }
    if (T.id === 'roof') { const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,150,80,.25)'); gr.addColorStop(1, 'rgba(255,150,80,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); }
    if (W.cutT > 0) { ctx.fillStyle = 'rgba(10,6,30,' + 0.35 * clamp(Math.min(W.cutT, 3.8 - W.cutT) * 3, 0, 1) + ')'; ctx.fillRect(0, 0, w, h); }
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }
};
const rnd2 = (a) => (Math.random() - 0.5) * a;
const G2 = { x: 0, z: 0, h: 0 };
function ghostAt2(g, t) { const n = g.x.length, f = clamp(t / g.dt, 0, n - 1.001), i = Math.floor(f), k = f - i; G2.x = lerp(g.x[i], g.x[i + 1], k); G2.z = lerp(g.z[i], g.z[i + 1], k); G2.h = g.h[i]; return i < n - 2; }
const VIEW = VIEW2D;

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
})();
