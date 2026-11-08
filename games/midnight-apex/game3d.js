import * as THREE from '/games/vendor/three/three.module.min.js';

/*
 * Midnight Apex, 3D edition.
 *
 * The same race as the 2D game (three tracks, three cars, five rivals, traffic,
 * laps, nitro, time attack, drafting, near misses), but the road is now a real
 * 3D ribbon built from the track's own bends and hills, with banked curves,
 * lamps, scenery per track, and a chase camera behind a modelled car.
 *
 * The race rules run on the same flat model as before: a distance along the
 * lap and a lateral lane position. The 3D world is placed from those two numbers.
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const ease = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);
const easeIn = (a, b, p) => a + (b - a) * p * p;
function hash(i) {
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function fmtTime(s) {
  if (s == null || !isFinite(s)) return '-:--.--';
  const cs = Math.max(0, Math.round(s * 100));
  const m = Math.floor(cs / 6000), sec = Math.floor((cs % 6000) / 100), c = cs % 100;
  return m + ':' + pad2(sec) + '.' + pad2(c);
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
const hexN = (h) => parseInt(h.replace('#', ''), 16);

/* ------------------------------------------------------------ constants */
const SEG = 200;            // length of one road segment, world units
const ROAD_W = 2000;        // half width of the road, world units
const RUMBLE = 3;
const BASE_MAX = 12000;     // top speed of a 1.00 car, units per second
const LAPS = 3;
const CENT = 0.26;          // how hard bends push the car outward
const CAR_HALF = 0.19;      // half width of a car in road-half-width units
const KMH = 280 / BASE_MAX;
const SC = 0.004;           // metres per world unit
const HW = ROAD_W * SC;     // road half width in metres (8)
const CL = 800;             // contact length of a car in world units (3.2 m), used for contact and spacing
const EDGE_X = 1.12;        // where the paved shoulder ends, in road-half-width units

/* ------------------------------------------------------------ cars (stats and look) */
const KINDS = {
  kestrel: { name: 'Kestrel RS', top: 1.0, acc: 1.0, grip: 1.0, blurb: 'Balanced, forgiving, quick off the line.', style: 'sport', tail: 'bar', wing: 'lip', L: 4.4, hw: 0.95, noseY: 0.5, hoodY: 0.7, beltY: 0.82, tailY: 0.92, roofY: 1.36, cabZ0: -0.5, cabZ1: 1.75, pipes: [-0.55, 0.55] },
  vanta: { name: 'Vanta GT', top: 1.08, acc: 0.86, grip: 0.88, blurb: 'Fastest on the straights, wide and edgy in corners.', style: 'gt', tail: 'slim', wing: 'none', L: 4.7, hw: 1.0, noseY: 0.44, hoodY: 0.62, beltY: 0.74, tailY: 0.82, roofY: 1.22, cabZ0: -0.2, cabZ1: 1.8, pipes: [-0.62, -0.38, 0.38, 0.62] },
  rook: { name: 'Rook Mk2', top: 0.94, acc: 1.2, grip: 1.2, blurb: 'Grippy and punchy. Lower top speed, hard to shake.', style: 'compact', tail: 'round', wing: 'big', L: 4.0, hw: 0.93, noseY: 0.58, hoodY: 0.78, beltY: 0.9, tailY: 0.98, roofY: 1.46, cabZ0: -0.45, cabZ1: 1.7, pipes: [0.55] },
  sedan: { name: 'Sedan', style: 'sedan', tail: 'box', wing: 'none', L: 4.6, hw: 0.92, noseY: 0.55, hoodY: 0.74, beltY: 0.88, tailY: 0.96, roofY: 1.46, cabZ0: -0.4, cabZ1: 1.85, pipes: [0.5] },
  hatch: { name: 'Hatch', style: 'hatch', tail: 'box', wing: 'lip', L: 3.9, hw: 0.88, noseY: 0.55, hoodY: 0.74, beltY: 0.88, tailY: 1.0, roofY: 1.5, cabZ0: -0.5, cabZ1: 1.95, pipes: [-0.4] },
  van: { name: 'Van', style: 'van', tail: 'tall', wing: 'none', L: 4.9, hw: 0.95, noseY: 0.7, hoodY: 0.95, beltY: 1.05, tailY: 1.9, roofY: 2.1, cabZ0: -1.6, cabZ1: 2.4, pipes: [0.5] },
  taxi: { name: 'Cab', style: 'sedan', tail: 'box', wing: 'none', L: 4.6, hw: 0.92, noseY: 0.55, hoodY: 0.74, beltY: 0.88, tailY: 0.96, roofY: 1.46, cabZ0: -0.4, cabZ1: 1.85, pipes: [0.5], taxi: true }
};
const PLAYER_KINDS = ['kestrel', 'vanta', 'rook'];
const COLORS = [
  { id: 'ember', name: 'Ember', hex: '#e8452c' },
  { id: 'cobalt', name: 'Cobalt', hex: '#2f6fe0' },
  { id: 'solar', name: 'Solar', hex: '#ffc22e' },
  { id: 'mint', name: 'Mint', hex: '#2fd5a0' },
  { id: 'violet', name: 'Violet', hex: '#8a4bff' },
  { id: 'pearl', name: 'Pearl', hex: '#e9e7e2' }
];
const colorHex = (id) => { for (let i = 0; i < COLORS.length; i++) if (COLORS[i].id === id) return COLORS[i].hex; return COLORS[0].hex; };

/* ------------------------------------------------------------ tracks */
const SHOP_NAMES = [['NOODLE', 'ORBIT'], ['BLUE', 'LANTERN'], ['KITE & CO', ''], ['PIXEL', 'BAZAAR'], ['MOON', 'TAILOR'], ['TURBO', 'TEA'], ['VELVET', 'ARCADE'], ['HOTEL', 'AURORA']];
const NEON_COLS = ['#ff3d8b', '#38e1ff', '#ffb52e', '#9b6bff', '#44ffa8', '#ff6940'];

const PAL = {
  harbour: {
    name: 'Harbour Run', sub: 'Sea-front highway', sky: [0, '#030817', 0.5, '#0a1836', 0.82, '#1b3a63', 1, '#3b6a8c'], fog: '#25466b', fogD: 0.0026,
    ground: ['#0a2947', '#16281f', '#2a2f37'], road: '#3d424e', rumble: ['#dde2ec', '#b3322c'], lane: '#ebe7d5', moonDir: [0.3, 0.36, -0.88], moonCol: '#cfe3ff',
    hemi: ['#46689a', '#10161f', 0.55], sun: ['#9db8e8', 0.95], k: 0.0055, kBase: 0.0055, wet: 0.0
  },
  neon: {
    name: 'Neon Mile', sub: 'Downtown in the rain', sky: [0, '#06021a', 0.45, '#1c0b3d', 0.8, '#521a64', 1, '#8a2a84'], fog: '#3f1757', fogD: 0.0036,
    ground: ['#2a2440', '#201b33'], road: '#292938', rumble: ['#e8e4f5', '#5b2a7a'], lane: '#f0e9ff', moonDir: [-0.5, 0.4, -0.76], moonCol: '#d8c4ff',
    hemi: ['#7a4aa8', '#150e24', 0.7], sun: ['#a58ad6', 0.55], k: 0.0048, wet: 1.0
  },
  ghat: {
    name: 'Ghat Pass', sub: 'Mountain switchbacks', sky: [0, '#02060f', 0.5, '#0b1f2c', 0.85, '#2a4a56', 1, '#4f747c'], fog: '#3c5a63', fogD: 0.0042,
    ground: ['#142a1b', '#2f3331', '#3a3a35'], road: '#3a3d41', rumble: ['#d9d7c8', '#9c3d28'], lane: '#e9e2c4', moonDir: [0.55, 0.5, -0.66], moonCol: '#e6f0ff',
    hemi: ['#5d8a9a', '#0e1612', 0.6], sun: ['#b4d0e6', 0.9], k: 0.0066, wet: 0.15
  }
};
const TRACK_ORDER = ['harbour', 'neon', 'ghat'];

// [enter, hold, leave, curve, hill, options]
const SECTIONS = {
  harbour: [
    [25, 50, 25, 0, 0, { gl: 0, gr: 1 }], [30, 40, 30, 1.6, 8, { gl: 0, gr: 1 }], [20, 60, 20, 0, -8, { gl: 0, gr: 2 }], [30, 50, 30, -2.4, 0, { gl: 0, gr: 2 }],
    [15, 30, 15, 0, 12, { gl: 0, gr: 2 }], [30, 40, 30, 3.2, -12, { gl: 0, gr: 1 }], [20, 40, 20, -3.2, 0, { gl: 1, gr: 1 }], [25, 50, 25, 0, 0, { gl: 1, gr: 1 }],
    [30, 60, 30, 2.0, 0, { gl: 1, gr: 1 }], [20, 30, 20, 0, 18, { gl: 0, gr: 1 }], [25, 50, 25, -3.8, -18, { gl: 0, gr: 1 }], [15, 40, 15, 0, 0, { gl: 0, gr: 2 }],
    [25, 35, 25, 4.2, 0, { gl: 0, gr: 2 }], [25, 35, 25, -4.2, 6, { gl: 0, gr: 1 }], [20, 80, 20, 0, 0, { gl: 0, gr: 1 }], [30, 45, 30, 2.6, -6, { gl: 0, gr: 1 }],
    [20, 60, 20, 0, 10, { gl: 0, gr: 2 }], [30, 50, 30, -2.0, -10, { gl: 0, gr: 2 }], [25, 40, 25, 3.4, 0, { gl: 0, gr: 1 }], [20, 50, 20, 0, 0, { gl: 0, gr: 1 }],
    [30, 50, 30, -3.0, 8, { gl: 0, gr: 1 }], [25, 60, 25, 1.8, -8, { gl: 0, gr: 1 }], [40, 100, 40, 0, 0, { gl: 0, gr: 1 }]
  ],
  neon: [
    [20, 40, 20, 0, 0], [20, 30, 20, 4.2, 0], [15, 30, 15, 0, 0], [20, 30, 20, -4.4, 0],
    [20, 40, 20, 0, 16], [20, 60, 20, 0, 0, { tun: 2 }], [20, 40, 20, 2.4, -16], [15, 25, 15, -4.8, 0], [15, 25, 15, 4.8, 0], [20, 60, 20, 0, 0],
    [25, 40, 25, 3.0, 8], [25, 40, 25, -3.0, -8], [20, 40, 20, -3.4, 0], [20, 40, 20, 3.4, 6], [20, 50, 20, 0, 0], [15, 30, 15, 5.0, 0], [15, 30, 15, 5.0, 0],
    [20, 40, 20, 0, 12], [20, 40, 20, -3.6, -12], [20, 80, 20, 0, 0, { tun: 2 }], [20, 35, 20, 4.0, 0], [20, 35, 20, -4.0, 0], [20, 60, 20, 0, 0], [25, 45, 25, -2.8, -6], [30, 60, 30, 0, 0]
  ],
  ghat: [
    [25, 40, 25, 0, 0, { cliff: -1 }], [25, 40, 25, 2.8, 15, { cliff: -1 }], [20, 40, 20, -3.6, 15, { cliff: 1 }], [20, 35, 20, 4.6, 18, { cliff: -1 }],
    [20, 35, 20, -4.8, 18, { cliff: 1 }], [20, 50, 20, 0, 0, { tun: 1 }], [20, 40, 20, 3.4, 0, { tun: 1 }], [20, 60, 20, 0, 9, { cliff: -1 }],
    [25, 40, 25, -3.2, 9, { cliff: 1 }], [20, 30, 20, 5.0, 6, { cliff: -1 }], [20, 30, 20, -5.0, 6, { cliff: 1 }], [25, 50, 25, 0, -8, { cliff: -1 }],
    [25, 40, 25, 3.8, -21, { cliff: 1 }], [20, 35, 20, -4.6, -21, { cliff: -1 }], [20, 35, 20, 4.6, -18, { cliff: 1 }], [20, 60, 20, 0, -12, { tun: 1 }],
    [20, 40, 20, -3.0, 0, { cliff: 1 }], [20, 30, 20, 5.2, 0, { cliff: -1 }], [20, 30, 20, -5.2, -9, { cliff: 1 }], [25, 60, 25, 2.4, 0, { cliff: -1 }],
    [20, 40, 20, 0, 0, { cliff: 1 }], [25, 40, 25, -3.4, 0, { cliff: -1 }], [25, 50, 25, 0, 0, { cliff: 1 }]
  ]
};

// What a player can hit. hw is the half width in road-half-widths, hl the half length in world units.
const DEFS = {
  lampL: { solid: true, hw: 0.045, hl: 90 }, lampR: { solid: true, hw: 0.045, hl: 90 },
  palm: { solid: true, hw: 0.06, hl: 90 },
  cont: { solid: true, hw: 0.36, hl: 760 },
  ware: {}, crane: {}, gantry: {},
  pine0: { solid: true, hw: 0.07, hl: 90 }, pine1: { solid: true, hw: 0.07, hl: 90 }, pine2: { solid: true, hw: 0.07, hl: 90 },
  rock0: { solid: true, hw: 0.22, hl: 450 }, rock1: { solid: true, hw: 0.16, hl: 330 },
  cliff: { solid: true, edge: true, hl: 520 },
  chevRt: { solid: true, hw: 0.04, hl: 70 }, chevLt: { solid: true, hw: 0.04, hl: 70 },
  shrine: { solid: true, hw: 0.3, hl: 640 },
  tower0: {}, tower1: {}, tower2: {}, tower3: {},
  shop0: { solid: true, edge: true, hl: 1500 }, shop1: { solid: true, edge: true, hl: 1500 }, shop2: { solid: true, edge: true, hl: 1500 },
  shop3: { solid: true, edge: true, hl: 1500 }, shop4: { solid: true, edge: true, hl: 1500 },
  sign0: { solid: true, hw: 0.05, hl: 90 }, sign1: { solid: true, hw: 0.05, hl: 90 }, sign2: { solid: true, hw: 0.05, hl: 90 },
  sign3: { solid: true, hw: 0.05, hl: 90 }, sign4: { solid: true, hw: 0.05, hl: 90 }, sign5: { solid: true, hw: 0.05, hl: 90 },
  pillar: { solid: true, hw: 0.14, hl: 220 }
};

/* ------------------------------------------------------------ track data and frames */
const trackCache = {};
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getTrack(id) {
  if (trackCache[id]) return trackCache[id];
  const P = PAL[id], segs = [];
  const lastY = () => (segs.length ? segs[segs.length - 1].y2 : 0);
  function add(curve, y, o) {
    const n = segs.length, y0 = lastY();
    segs.push({ i: n, curve, gl: o.gl || 0, gr: o.gr || 0, rail: 0, tun: o.tun || 0, sec: o.sec, cliff: o.cliff || 0, spr: [], y1: y0, y2: y });
  }
  function road(en, ho, le, curve, y, o) {
    const y0 = lastY(), y1 = y0 + y * SEG, tot = en + ho + le;
    let n;
    for (n = 0; n < en; n++) add(easeIn(0, curve, n / en), ease(y0, y1, n / tot), o);
    for (n = 0; n < ho; n++) add(curve, ease(y0, y1, (en + n) / tot), o);
    for (n = 0; n < le; n++) add(ease(curve, 0, n / le), ease(y0, y1, (en + ho + n) / tot), o);
  }
  const hillK = id === 'ghat' ? 0.8 : 1;
  SECTIONS[id].forEach((s, k) => {
    let o = s[5] || {}; o = { gl: o.gl, gr: o.gr, tun: o.tun, cliff: o.cliff, sec: k };
    if (id === 'ghat') { o.gl = o.cliff === -1 ? 1 : 0; o.gr = o.cliff === 1 ? 1 : 0; }
    road(s[0], s[1], s[2], s[3], s[4] * hillK, o);
  });
  if (Math.abs(lastY()) > 1) road(30, 20, 30, 0, -lastY() / SEG, { gl: segs[segs.length - 1].gl, gr: segs[segs.length - 1].gr, sec: 99 });
  const N = segs.length;
  for (let si = 0; si < N; si++) { segs[si].y1 = si ? segs[si - 1].y2 : 0; }
  const T = { id, pal: P, segs, n: N, L: N * SEG, name: P.name, defs: DEFS, F: null, M: 0, FS: 2, gantryZ: 2 * SEG, sea: null };
  decorate(T);
  buildFrames(T);
  trackCache[id] = T;
  return T;
}

function place(seg, key, off) { seg.spr.push({ key, off, hit: -9 }); }

function decorate(T) {
  const id = T.id, segs = T.segs, N = T.n, r = rng(100 + id.length * 7);
  for (let i = 0; i < N; i++) {
    const s = segs[i];
    if (id === 'harbour') {
      if (s.gl === 0) s.rail |= 1;
      if (i % 28 === 0) place(s, 'lampR', 1.5);
      if (i % 28 === 14) place(s, 'lampL', s.gl === 0 ? -1.19 : -1.5);
      if (s.gr === 1) { if (i % 7 === 2 && r() < 0.6) place(s, 'palm', 1.7 + r() * 1.5); }
      else if (s.gr === 2) {
        if (i % 12 === 3 && r() < 0.8) place(s, 'cont', 2.55 + r() * 0.5);
        if (i % 60 === 20) place(s, 'ware', 5.5 + r() * 1.5);
        if (i % 150 === 40) place(s, 'crane', 8.5 + r() * 1.5);
      }
      if (s.gl === 1 && i % 9 === 4 && r() < 0.6) place(s, 'palm', -(1.7 + r() * 1.5));
    } else if (id === 'neon') {
      if (i % 30 === 0) place(s, 'lampL', -1.46);
      if (i % 30 === 15) place(s, 'lampR', 1.46);
      for (let side = -1; side <= 1; side += 2) {
        if (s.tun === 2) { if (i % 12 === 0) place(s, 'pillar', side * 1.3); }
        else {
          if (i % 16 === (side < 0 ? 0 : 8) && r() < 0.92) place(s, 'tower' + ((r() * 4) | 0), side * (3.6 + r() * 3.4));
          if (i % 26 === (side < 0 ? 3 : 16) && r() < 0.9) place(s, 'shop' + ((r() * 5) | 0), side * (2.18 + r() * 0.08));
        }
      }
      if (i % 80 === 30 && s.tun === 0) place(s, 'sign' + ((r() * 6) | 0), (i % 160 === 30 ? -1 : 1) * 1.66);
    } else {
      if (s.tun !== 1) {
        if (Math.abs(s.curve) > 2.2) s.rail |= (s.curve > 0 ? 1 : 2);
        for (let sd = -1; sd <= 1; sd += 2) {
          if (s.cliff === sd) continue;
          if (i % 5 === (sd < 0 ? 0 : 2) && r() < 0.8) place(s, 'pine' + ((r() * 3) | 0), sd * (1.55 + r() * 2.2));
          if (i % 3 === (sd < 0 ? 1 : 2) && r() < 0.9) place(s, 'pine1', sd * (4.4 + r() * 8));
        }
        if (s.cliff && i % 5 === 0) place(s, 'cliff', s.cliff * 1.38);
        if (r() < 0.03) place(s, r() < 0.5 ? 'rock0' : 'rock1', (r() < 0.5 ? -1 : 1) * (1.62 + r() * 0.4));
        if (Math.abs(s.curve) >= 4.2 && i % 7 === 2) place(s, s.curve > 0 ? 'chevRt' : 'chevLt', (s.curve > 0 ? -1 : 1) * 1.5);
        if (i % 41 === 9 && Math.abs(s.curve) < 1) place(s, 'shrine', (r() < 0.5 ? -1 : 1) * 1.62);
        if (i % 50 === 20 && Math.abs(s.curve) < 2) place(s, 'lampR', 1.5);
      }
    }
  }
  place(segs[2], 'gantry', 0);
  for (let i = 0; i < N; i++) if (segs[i].tun === 1) segs[i].rail = 3;
}

// Reusable output of frameAt().
const FR = { px: 0, py: 0, pz: 0, fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, hx: 1, hy: 0, hz: 0, bank: 0, curve: 0 };
const STRIDE = 16;

function buildFrames(T) {
  const n = T.n, segs = T.segs, SEGM = SEG * SC;
  // 1. headings: the bends of the track plus an even turn so the lap closes as one loop.
  const P = T.pal;
  let K = P.k, pts = null, h = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += K * segs[i].curve;
    const u = (TAU - sum) / n;
    h = new Float64Array(n);
    let a = 0;
    for (let i = 0; i < n; i++) { h[i] = a; a += K * segs[i].curve + u; }
    const endpos = (al, be) => {
      let x = 0, z = 0;
      for (let i = 0; i < n; i++) { const d = al * Math.cos(TAU * i / n) + be * Math.sin(TAU * i / n), hh = h[i] + d; x += Math.sin(hh) * SEGM; z -= Math.cos(hh) * SEGM; }
      return [x, z];
    };
    let al = 0, be = 0;
    for (let it = 0; it < 24; it++) {
      const e0 = endpos(al, be);
      if (Math.hypot(e0[0], e0[1]) < 0.02) break;
      const e = 1e-4, e1 = endpos(al + e, be), e2 = endpos(al, be + e);
      const a11 = (e1[0] - e0[0]) / e, a21 = (e1[1] - e0[1]) / e, a12 = (e2[0] - e0[0]) / e, a22 = (e2[1] - e0[1]) / e, det = a11 * a22 - a12 * a21;
      if (Math.abs(det) < 1e-9) break;
      al -= (a22 * e0[0] - a12 * e0[1]) / det; be -= (-a21 * e0[0] + a11 * e0[1]) / det;
    }
    pts = []; let x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const d = al * Math.cos(TAU * i / n) + be * Math.sin(TAU * i / n), hh = h[i] + d; h[i] = hh;
      pts.push([x, z]); x += Math.sin(hh) * SEGM; z -= Math.cos(hh) * SEGM;
    }
    // a lap that passes too close to itself would put the road on top of the road
    let minD = 1e9;
    for (let i = 0; i < n; i += 8) for (let j = i + 160; j < n; j += 8) { if (n - (j - i) < 160) continue; const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d < minD) minD = d; }
    if (minD > 55) break;
    K *= 0.8;
  }
  // 2. a closed spline through the road, resampled at equal distance
  const ctl = [];
  for (let i = 0; i < n; i += 3) ctl.push(new THREE.Vector3(pts[i][0], segs[i].y1 * SC, pts[i][1]));
  const curve = new THREE.CatmullRomCurve3(ctl, true, 'centripetal');
  curve.arcLengthDivisions = Math.max(600, n);
  const M = Math.floor(n / T.FS);
  const sp = curve.getSpacedPoints(M);
  T.M = M; T.curve3 = curve; T.pathLen = curve.getLength();
  const F = new Float32Array(M * STRIDE);
  const up = new THREE.Vector3(0, 1, 0), f = new THREE.Vector3(), rh = new THREE.Vector3(), u0 = new THREE.Vector3();
  for (let i = 0; i < M; i++) {
    const a = sp[(i + M - 1) % M], b = sp[(i + 1) % M], c = sp[i];
    f.subVectors(b, a).normalize();
    rh.crossVectors(f, up).normalize();
    u0.crossVectors(rh, f).normalize();
    let cv = 0, cnt = 0;
    const zi = Math.floor(i * T.FS);
    for (let k = -8; k <= 8; k++) { cv += segs[mod(zi + k, n)].curve; cnt++; }
    cv /= cnt;
    const bank = clamp(cv * 0.02, -0.11, 0.11);
    const cb = Math.cos(bank), sb = Math.sin(bank);
    const o = i * STRIDE;
    F[o] = c.x; F[o + 1] = c.y; F[o + 2] = c.z;
    F[o + 3] = f.x; F[o + 4] = f.y; F[o + 5] = f.z;
    F[o + 6] = rh.x * cb - u0.x * sb; F[o + 7] = rh.y * cb - u0.y * sb; F[o + 8] = rh.z * cb - u0.z * sb;
    F[o + 9] = u0.x * cb + rh.x * sb; F[o + 10] = u0.y * cb + rh.y * sb; F[o + 11] = u0.z * cb + rh.z * sb;
    F[o + 12] = rh.x; F[o + 13] = rh.y; F[o + 14] = rh.z;
    F[o + 15] = bank;
  }
  T.F = F;
}

// Fill FR with the frame of the road at distance z (world units along the lap).
function frameAt(T, z) {
  const M = T.M, F = T.F;
  const u = mod(z, T.L) / SEG / T.FS;
  const i0 = Math.floor(u) % M, i1 = (i0 + 1) % M, t = u - Math.floor(u);
  const a = i0 * STRIDE, b = i1 * STRIDE;
  const g = (k) => F[a + k] + (F[b + k] - F[a + k]) * t;
  FR.px = g(0); FR.py = g(1); FR.pz = g(2);
  let x = g(3), y = g(4), w = g(5), l = Math.hypot(x, y, w) || 1; FR.fx = x / l; FR.fy = y / l; FR.fz = w / l;
  x = g(6); y = g(7); w = g(8); l = Math.hypot(x, y, w) || 1; FR.rx = x / l; FR.ry = y / l; FR.rz = w / l;
  x = g(9); y = g(10); w = g(11); l = Math.hypot(x, y, w) || 1; FR.ux = x / l; FR.uy = y / l; FR.uz = w / l;
  x = g(12); y = g(13); w = g(14); l = Math.hypot(x, y, w) || 1; FR.hx = x / l; FR.hy = y / l; FR.hz = w / l;
  FR.bank = g(15);
  return FR;
}

// World position of the point at lateral x (road-half-widths) and h metres above the surface. Needs FR set by frameAt.
function surf(x, h, out) {
  const m = x * HW, lim = EDGE_X * HW;
  if (Math.abs(x) <= EDGE_X) {
    out.x = FR.px + FR.rx * m + FR.ux * h; out.y = FR.py + FR.ry * m + FR.uy * h; out.z = FR.pz + FR.rz * m + FR.uz * h;
  } else {
    const sg = x < 0 ? -1 : 1, e = lim * sg, d = m - e;
    out.x = FR.px + FR.rx * e + FR.hx * d; out.y = FR.py + FR.ry * e - 0.05 + h; out.z = FR.pz + FR.rz * e + FR.hz * d;
  }
  return out;
}


/* ------------------------------------------------------------ world and race rules */
const DIFF = {
  rookie: { base: 0.74, span: 0.10, up: 0.07, down: 0.06, block: 0, slot: 3, name: 'Rookie' },
  pro: { base: 0.84, span: 0.11, up: 0.06, down: 0.04, block: 1, slot: 5, name: 'Pro' },
  legend: { base: 0.91, span: 0.12, up: 0.05, down: 0.02, block: 1, slot: 5, name: 'Legend' }
};
const RIVALS = [
  { name: 'Nyx', skill: 0.95, kind: 'vanta', pref: -0.22 }, { name: 'Saffron', skill: 0.8, kind: 'kestrel', pref: 0.3 },
  { name: 'Jett', skill: 0.65, kind: 'rook', pref: -0.08 }, { name: 'Mara', skill: 0.5, kind: 'kestrel', pref: 0.18 }, { name: 'Dax', skill: 0.35, kind: 'rook', pref: 0.34 }
];
const RIVAL_HEX = ['#e8452c', '#2f6fe0', '#ffc22e', '#2fd5a0', '#8a4bff', '#e9e7e2', '#ff7ab8', '#22a6b3'];
const CIV_HEX = ['#7d8591', '#b9bcc4', '#2f3a4a', '#8a2f2f', '#3f5a49', '#d8d2c4', '#4c3f5a', '#a8692e'];
const CIV_KINDS = ['sedan', 'hatch', 'van', 'taxi', 'sedan', 'hatch'];
const LANE_X = [-0.75, -0.25, 0.25, 0.75], LANE_V = [4900, 3700, 3300, 4300];
const TRAFFIC = { harbour: 26, neon: 40, ghat: 0 };

const PLAN = { tx: 0, vcap: 1, slow: 1e9, avoid: 0 };
let racerId = 0;
let ARC = null, Wd = null, BESTS = {};

const wrapD = (a, L) => mod(a + L / 2, L) - L / 2;

function mkRacer(o) {
  const k = KINDS[o.kind];
  return {
    id: ++racerId, name: o.name, kind: o.kind, k, hex: o.hex, isPlayer: !!o.isPlayer, isTraffic: !!o.isTraffic,
    dist: o.dist || 0, x: o.x || 0, vx: 0, speed: o.speed || 0, vmax: o.vmax || BASE_MAX * (k.top || 1), skill: o.skill || 0.5, pref: o.pref || 0, rb: 1,
    finished: false, finT: 0, lapIdx: Math.floor((o.dist || 0) / 1e9), lapT0: 0, lapTimes: [], bestLap: Infinity, z: 0, brake: false, ghost: false, nmT: -9, block: 0
  };
}
function placeCar(T, c) { c.z = mod(c.dist, T.L); }
const gridSlot = (slot) => ({ dist: -(Math.floor(slot / 2) * 1500 + 800), x: slot % 2 ? 0.36 : -0.36 });

function newWorld(cfg) {
 
  const T = getTrack(cfg.track), segs = T.segs;
  for (let i = 0; i < T.n; i++) { const s = segs[i]; for (let j = 0; j < s.spr.length; j++) s.spr[j].hit = -9; }
  racerId = 0;
  const W = {
    T, cfg, attract: !!cfg.attract, mode: cfg.mode || 'race', diff: DIFF[cfg.diff] || DIFF.pro, phase: cfg.attract ? 'racing' : 'countdown',
    cd: 0, t: 0, racers: [], rivals: [], traffic: [], obst: [], order: [], P: null, shake: 0, fov: 84, endT: 0, bannerT: 0, banner: '', flash: 0,
    rbT: 0, lastBeep: -1, sq: 0, scr: 0, nitroSnd: 0, results: null, over: false, goT: 0, sparksT: 0, lastBeepOk: true, hintT: 0
  };
  const hex = colorHex(cfg.color), P = mkRacer({ name: 'You', kind: cfg.car, hex, isPlayer: true });
  P.nitro = 35; P.nitroOn = false; P.steerIn = 0; P.rpm = 0.2; P.gear = 1; P.xCam = 0; P.drift = 0; P.cleanT = 0; P.draft = 0; P.hitCd = 0; P.lean = 0; P.thr = 0;
  P.lapT0 = 0; P.started = false; P.crashLog = { car: 0, obj: 0, wall: 0, edge: 0 }; P.crashes = 0; P.nearMisses = 0; P.nLatch = 0; P.brLatch = 0; P.yaw = 0; P.pitch = 0; P.roll = 0;
  W.P = P; W.racers.push(P);
  const attract = W.attract, withRivals = attract || W.mode === 'race';
  if (withRivals) {
    const pool = RIVAL_HEX.filter((h) => h !== hex), pslot = W.diff.slot;
    let slot = 0;
    RIVALS.forEach((rv, idx) => {
      if (slot === pslot) slot++;
      const g = gridSlot(slot++), vf = W.diff.base + W.diff.span * rv.skill;
      const r = mkRacer({ name: rv.name, kind: rv.kind, hex: pool[idx % pool.length], skill: rv.skill, pref: rv.pref, dist: g.dist, x: g.x, vmax: BASE_MAX * KINDS[rv.kind].top * vf });
      r.block = W.diff.block && rv.skill > 0.6 ? 1 : 0;
      W.racers.push(r); W.rivals.push(r);
    });
    const pg = gridSlot(pslot); P.dist = pg.dist; P.x = pg.x;
  } else { P.dist = -800; P.x = 0; }
  const tc = Math.round((TRAFFIC[cfg.track] || 0) * (W.mode === 'time' && !attract ? 0.4 : 1));
  const perLane = [0, 0, 0, 0], r2 = rng(1234 + cfg.track.length * 17);
  for (let i = 0; i < tc; i++) perLane[i % 4]++;
  let tIdx = 0;
  for (let ln = 0; ln < 4; ln++) {
    for (let j = 0; j < perLane[ln]; j++) {
      let zz = (j + 0.5 + (r2() - 0.5) * 0.5) * T.L / perLane[ln];
      if (zz > T.L - 9000) zz = T.L - 9000 - r2() * 1500;
      if (zz < 2600) zz += 4200;
      const kind = CIV_KINDS[(r2() * CIV_KINDS.length) | 0];
      const tr = mkRacer({ name: 'civ', kind, hex: CIV_HEX[(r2() * CIV_HEX.length) | 0], isTraffic: true, dist: zz, x: LANE_X[ln], speed: LANE_V[ln], vmax: LANE_V[ln] });
      tr.id = 5000 + (tIdx++); W.traffic.push(tr);
    }
  }
  if (attract) {
    P.dist = 2600; P.x = 0.1; P.speed = 6500; P.nitro = 0; P.started = true;
    W.rivals.forEach((r, idx) => { r.dist = P.dist + (idx - 2) * 2200 + 1500; r.speed = 7000; r.x = [-0.4, 0.4, 0, -0.2, 0.3][idx]; });
    W.traffic.forEach((c) => { const dd = wrapD(c.dist - P.dist, T.L); if (Math.abs(dd) < 3500) c.dist += 7000; });
  }
  W.racers.forEach((c) => { c.lapIdx = Math.floor(c.dist / T.L); });
  W.traffic.forEach((c) => placeCar(T, c));
  W.racers.forEach((c) => { if (!c.isPlayer) placeCar(T, c); });
  W.obst = W.rivals.concat(W.traffic, [P]);
  W.order = W.racers.slice();
  return W;
}

/* ------------------------------------------------------------ AI */
function aiPlan(W, c) {
  const T = W.T, segs = T.segs, N = T.n, L = T.L, si = (mod(c.dist, L) / SEG) | 0;
  let sum = 0, cm = 0;
  for (let k = 1; k <= 24; k += 2) { const cv = segs[(si + k) % N].curve; sum += cv; if (k <= 17) { const ac = Math.abs(cv); if (ac > cm) cm = ac; } }
  const lineX = clamp(sum / 12 * 0.3, -0.6, 0.6);
  let tx = lineX * (0.55 + 0.45 * c.skill) + c.pref * (1 - Math.abs(lineX) * 1.2);
  const vcap = 1 - clamp((cm - 2.9) * 0.07 * (1.3 - c.skill * 0.45), 0, 0.3);
  let avoid = 0, slow = 1e9, blocking = false;
  const P = W.P;
  if (!c.isPlayer && c.block && !W.attract && !P.ghost && P.started) {
    const bz = wrapD(c.dist - P.dist, L);
    if (bz > CL + 200 && bz < CL + 2800 && P.speed > c.speed - 900 && Math.sin(W.t * 0.35 + c.id * 1.9) > 0.15) { blocking = true; tx = clamp(P.x, -0.72, 0.72); }
  }
  const ob = W.obst || [];
  for (let j = 0; j < ob.length; j++) {
    const o = ob[j];
    if (o === c || o.ghost || (blocking && o === P)) continue;
    const dz = wrapD(o.dist - c.dist, L);
    if (dz <= 150 && dz > -CL) {
      const sdx = o.x - c.x, asd = Math.abs(sdx);
      if (asd < 0.46) avoid += (sdx > 0 ? -1 : (sdx < 0 ? 1 : (c.x > 0 ? -1 : 1))) * (1 - asd / 0.46) * 1.3;
      continue;
    }
    if (dz <= 150 || dz > 4400) continue;
    const dx = o.x - c.x, adx = Math.abs(dx);
    if (adx < 0.5) {
      const str = 1 - (dz - 150) / 4250;
      let dir = dx > 0 ? -1 : 1;
      if (adx < 0.04) dir = c.x > 0 ? -1 : 1;
      if (c.x + dir * 0.5 > 0.86 || c.x + dir * 0.5 < -0.86) dir = -dir;
      avoid += dir * str * (1.5 + 0.5 * c.skill);
      if (dz < 1550 && adx < 0.33 && o.speed < c.speed + 600) slow = Math.min(slow, o.speed * 0.98);
    }
  }
  PLAN.tx = tx; PLAN.vcap = vcap; PLAN.slow = slow; PLAN.avoid = avoid;
}

function updateRival(W, c, dt) {
  aiPlan(W, c);
  let tgt = Math.min(c.vmax * c.rb * PLAN.vcap, PLAN.slow);
  if (c.finished) tgt = Math.min(tgt, BASE_MAX * 0.5);
  if (c.speed < tgt) c.speed = Math.min(tgt, c.speed + BASE_MAX * 0.3 * (1.05 - 0.75 * c.speed / BASE_MAX) * c.k.acc * dt);
  else c.speed = Math.max(tgt, c.speed - BASE_MAX * 0.6 * dt);
  c.brake = c.speed > tgt + 250;
  const want = clamp((PLAN.tx - c.x) * 1.7 + PLAN.avoid, -1.1, 1.1);
  c.vx += (want - c.vx) * Math.min(1, dt * 5);
  c.x = clamp(c.x + c.vx * dt, -0.9, 0.9);
  c.dist += c.speed * dt;
  // two cars that would sit on top of each other part them sideways
  const L = W.T.L;
  const ob = W.obst || [];
  for (let j = 0; j < ob.length; j++) {
    const o = ob[j];
    if (o === c || o.isPlayer || o.ghost) continue;
    const dz = wrapD(o.dist - c.dist, L), dxx = c.x - o.x;
    if (Math.abs(dz) < CL * 0.7 && Math.abs(dxx) < 0.2) c.x = clamp(c.x + (dxx >= 0 ? 1 : -1) * dt * 1.4, -0.9, 0.9);
  }
}

function advanceAI(W, dt, rivalsOn) {
  const T = W.T;
  W.t += rivalsOn ? dt : 0;
  for (let i = 0; i < W.traffic.length; i++) { const c = W.traffic[i]; c.dist += c.speed * dt; placeCar(T, c); }
  if (!rivalsOn) return;
  W.rbT -= dt;
  const P = W.P;
  for (let i = 0; i < W.rivals.length; i++) {
    const c = W.rivals[i];
    if (W.rbT <= 0 && !W.attract) {
      const gap = P.dist - c.dist, d = W.diff;
      c.rb = 1 + (gap > 0 ? Math.min(gap / 9000, 1) * d.up : Math.max(gap / 9000, -1) * d.down);
      if (P.ghost) c.rb = 1;
    }
    updateRival(W, c, dt); placeCar(T, c);
    if (!c.finished && !W.attract && c.dist >= LAPS * T.L) { c.finished = true; c.finT = W.t - (c.dist - LAPS * T.L) / Math.max(c.speed, 500); }
  }
  if (W.rbT <= 0) W.rbT = 0.3;
}

/* ------------------------------------------------------------ sound */
const SND = { e1: null, e2: null };
function engineStop() { if (SND.e1) { SND.e1.stop(); SND.e2.stop(); } SND.e1 = SND.e2 = null; }
function engineStart() { engineStop(); SND.e1 = ARC.sfx.hum('sawtooth'); SND.e2 = ARC.sfx.hum('square'); }
function engineSet(rpm, thr, boost) {
  if (!SND.e1) return;
  const f = 44 + rpm * 175 + (boost ? 24 : 0);
  SND.e1.set(f, 0.05 + 0.07 * thr + 0.035 * rpm); SND.e2.set(f * 0.5, 0.035 + 0.04 * thr);
}
const beep = (freq, dur, vol) => ARC.sfx.tone(freq, dur, { type: 'square', vol: vol || 0.16 });

/* ------------------------------------------------------------ the player */
function gearOf(speed, top) {
  const sp = speed / top, gsz = 1 / 6, g = Math.min(5, Math.floor(sp / gsz)), inG = Math.min(1.05, (sp - g * gsz) / gsz);
  return { g: g + 1, rpm: g === 0 ? 0.24 + 0.74 * inG : 0.44 + 0.55 * inG };
}

const _v = { x: 0, y: 0, z: 0 };
// world point beside / behind a car; sets FR for the car's distance as a side effect
function carPoint(W, c, dxLane, back, h, out) {
  frameAt(W.T, c.dist - back);
  return surf(c.x + dxLane, h, out);
}
function sparksAt(W, side, n, power) {
  if (!FX) return;
  const P = W.P;
  carPoint(W, P, side * 0.13, 0, 0.35, _v);
  const sp = P.speed * SC * 0.55, fx = FR.fx, fy = FR.fy, fz = FR.fz, rx = FR.rx, ry = FR.ry, rz = FR.rz;
  for (let i = 0; i < n; i++) {
    const out = side * (2 + Math.random() * 5) * power, up = 1.5 + Math.random() * 4 * power, back = -(Math.random() * 6);
    FX.spark(_v.x, _v.y, _v.z, fx * (sp + back) + rx * out, fy * (sp + back) + ry * out + up, fz * (sp + back) + rz * out, 0.3 + Math.random() * 0.45, 1);
  }
}
function crashFx(W, strength, side, kind) {
  const P = W.P;
  P.crashLog[kind || 'car']++;
  if (W.attract) { P.hitCd = 0.35; return; }
  P.cleanT = 0; P.hitCd = 0.35; P.crashes++;
  if (!ARC.reducedMotion) W.shake = Math.max(W.shake, 6 + strength * 12);
  sparksAt(W, side || (Math.random() < 0.5 ? -1 : 1), Math.round(8 + strength * 22), 0.8 + strength * 0.7);
  ARC.sfx.noise(0.3, { freq: 560, vol: 0.14 + 0.3 * strength });
  ARC.sfx.tone(120, 0.24, { type: 'sawtooth', slide: 42, vol: 0.12 + 0.14 * strength });
}
const addNitro = (W, n) => { W.P.nitro = Math.min(100, W.P.nitro + n); };

function readSteer() {
  const inp = ARC.input;
  let sx = inp.axis().x;
  if (inp.stick.active) { sx = clamp(inp.stick.x * 1.35, -1, 1); if (Math.abs(sx) < 0.07) sx = 0; }
  else if (ARC.touchMode && ARC.touchStyle === 'tilt') sx = clamp(sx * 1.3, -1, 1);
  else if (sx === 0 && !ARC.touchMode && inp.pointer.seen && inp.pointer.type === 'mouse') {
    sx = clamp(inp.pointer.nx * 2 - 1, -1, 1);
    if (Math.abs(sx) < 0.08) sx = 0;
  }
  return sx;
}

function updatePlayer(W, dt) {
  const P = W.P, T = W.T, K = P.k, segs = T.segs, L = T.L, inp = ARC.input;
  const racing = W.phase === 'racing', fin = W.phase === 'finished', cd = W.phase === 'countdown';
  const auto = W.attract || fin || P.bot, live = !W.attract && !fin, quiet = W.attract;
  const top = BASE_MAX * K.top;
  let steer = 0, gas = false, brake = false, nit = false;
  const z = mod(P.dist, L), si = (z / SEG) | 0, seg = segs[si];
  if (auto) {
    aiPlan(W, P);
    const vt = fin ? 0 : Math.min(top * (P.bot ? 0.97 : 0.82) * PLAN.vcap, PLAN.slow);
    if (P.bot && !fin) nit = P.nitro > 30 && PLAN.vcap > 0.97 && PLAN.slow > 1e8;
    steer = clamp((PLAN.tx - P.x) * 2.2 + PLAN.avoid * 0.9 - P.vx * 0.3, -1, 1);
    if (fin) steer = clamp(-P.x * 1.4 - P.vx * 0.3, -1, 1);
    gas = !fin && P.speed < vt; brake = !fin && P.speed > vt * 1.06;
  } else {
    const sx = readSteer();
    const g = inp.gesture, gest = ARC.touchMode && ARC.touchStyle !== 'pads';
    brake = inp.down('ArrowDown', 'KeyS') || P.brLatch > 0 || (gest && g.active && g.type !== 'mouse' && g.dy > 46 && g.dy > Math.abs(g.dx) * 0.5);
    gas = inp.down('ArrowUp', 'KeyW') || inp.pointer.down || gest || (W.cfg.auto === 'on' && !brake);
    nit = inp.down('ShiftLeft', 'ShiftRight', 'KeyN') || P.nLatch > 0;
    P.steerIn += (sx - P.steerIn) * Math.min(1, dt * (Math.abs(sx) > 0.01 ? 11 : 15));
    steer = P.steerIn;
  }
  if (P.brLatch > 0) P.brLatch -= dt;
  P.thr += ((gas ? 1 : 0) - P.thr) * Math.min(1, dt * 8);
  const spPct = clamp(P.speed / (BASE_MAX * 0.95), 0, 1.5);
  // nitro
  if (live && racing && nit && P.nitro > 0 && P.speed > 1800) {
    if (!P.nitroOn) {
      P.nitroOn = true;
      ARC.sfx.noise(0.8, { filter: 'highpass', freq: 900, vol: 0.28 });
      ARC.sfx.tone(260, 0.6, { type: 'sawtooth', slide: 1100, vol: 0.1 });
    }
  } else P.nitroOn = false;
  if (P.nitroOn) {
    P.nitro = Math.max(0, P.nitro - 28 * dt);
    if (P.nLatch > 0) P.nLatch -= dt;
    if (P.nitro <= 0) { P.nitroOn = false; P.nLatch = 0; }
    W.nitroSnd -= dt; if (W.nitroSnd <= 0) { W.nitroSnd = 0.11; ARC.sfx.noise(0.12, { filter: 'bandpass', freq: 1800, vol: 0.07 }); }
  } else if (P.nLatch > 0 && !(racing && live)) P.nLatch = 0;
  // drafting and near misses
  let drafting = false;
  if (racing && live) {
    for (let i = 0; i < W.obst.length; i++) {
      const o = W.obst[i]; if (o === P || o.ghost) continue;
      const dz = wrapD(o.dist - P.dist, L), adz = Math.abs(dz), adx = Math.abs(o.x - P.x);
      if (dz > CL + 200 && dz < CL + 3800 && adx < 0.26 && o.speed > BASE_MAX * 0.33 && P.speed > BASE_MAX * 0.45) drafting = true;
      if (adz < CL && adx > 0.34 && adx < 0.47 && P.speed > o.speed + 1300 && W.t - o.nmT > 2 && P.hitCd <= 0) {
        o.nmT = W.t; P.nearMisses++; addNitro(W, 13);
        ARC.toast('Near miss', '+ nitro', 700);
        ARC.sfx.noise(0.18, { filter: 'highpass', freq: 1400, vol: 0.2 });
      }
    }
  }
  P.draft += ((drafting ? 1 : 0) - P.draft) * Math.min(1, dt * 4);
  if (drafting) addNitro(W, 9 * dt);
  if (racing && live && P.cleanT > 2.2 && spPct > 0.55) addNitro(W, 2.4 * dt);
  // speed
  const offroad = Math.abs(P.x) > 1.12 && !(seg.rail & (P.x < 0 ? 1 : 2));
  if (cd) { P.speed = 0; }
  else {
    let a = 0;
    const topCap = top * (P.nitroOn ? 1.34 : 1) * (1 + 0.045 * P.draft);
    if (fin) { a = -BASE_MAX * 0.3; }
    else if (brake) a = -BASE_MAX * (0.85 + 0.2 * K.grip);
    else if (gas) a = BASE_MAX * 0.26 * K.acc * clamp(1.05 - 0.8 * (P.speed / top), 0.05, 1.1) * (spPct < 0.12 ? 0.75 + spPct * 2 : 1);
    else a = -BASE_MAX * (0.07 + 0.1 * spPct);
    if (P.nitroOn) a += BASE_MAX * 0.6;
    P.speed += a * dt;
    if (P.speed > topCap) P.speed -= (P.speed - topCap) * Math.min(1, dt * 2.6);
    if (offroad && P.speed > top * 0.3) P.speed -= BASE_MAX * 0.55 * dt;
    if (P.speed < 0) P.speed = 0;
  }
  P.brake = brake || (fin && P.speed > 500);
  // steering and bends
  const auth = Math.min(1, spPct * 5) * (1.05 - 0.3 * Math.min(1, spPct));
  const maxLat = 2.1 * K.grip * auth;
  P.vx += (steer * maxLat - P.vx) * (1 - Math.exp(-dt * 8 * K.grip));
  let push = 2 * CENT * seg.curve * spPct * spPct / Math.pow(K.grip, 0.75);
  if (cd) push = 0;
  P.x += (P.vx - push) * dt;
  const slide = Math.abs(push) / (maxLat + 0.5) + (brake && spPct > 0.6 ? 0.35 * Math.abs(steer) : 0) + (Math.abs(steer) > 0.75 && spPct > 0.8 ? 0.2 : 0);
  P.drift += ((spPct > 0.5 && slide > 0.5 ? clamp(slide, 0, 1) : 0) - P.drift) * Math.min(1, dt * 7);
  if (P.drift > 0.5 && spPct > 0.5 && !offroad) {
    W.sq -= dt;
    if (W.sq <= 0) { W.sq = 0.085; if (!quiet) ARC.sfx.noise(0.1, { filter: 'bandpass', freq: 2300 + Math.random() * 500, vol: 0.05 + 0.09 * P.drift }); }
    if (!ARC.reducedMotion && FX && Math.random() < 0.7) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      carPoint(W, P, sd * 0.11, 1500, 0.2, _v);
      FX.smoke(_v.x, _v.y, _v.z, FR.rx * sd * 0.6, 0.5 + Math.random() * 0.8, FR.fz * 0, 0.9, 1.1 + Math.random() * 0.9, 0);
    }
  }
  if (P.drift > 0.5) P.cleanT = Math.min(P.cleanT, 1.2);
  // walls and the edge of the world
  const lim = 1.11;
  if ((seg.rail & 1) && P.x < -lim) { P.x = -lim; P.vx = Math.max(P.vx, 0); wallScrape(W, -1, dt); }
  else if ((seg.rail & 2) && P.x > lim) { P.x = lim; P.vx = Math.min(P.vx, 0); wallScrape(W, 1, dt); }
  if (P.x < -2.75 || P.x > 2.75) { const sd = P.x < 0 ? -1 : 1; P.x = sd * 2.75; P.vx = 0; P.speed *= 0.8; if (P.hitCd <= 0) crashFx(W, 0.5, sd, 'edge'); }
  // gravel
  if (offroad && P.speed > 2000) {
    P.cleanT = 0;
    if (!ARC.reducedMotion) { W.shake = Math.max(W.shake, 2.5 + 3 * spPct); }
    W.scr -= dt; if (W.scr <= 0) { W.scr = 0.1; if (!quiet) ARC.sfx.noise(0.12, { freq: 380, vol: 0.12 }); }
    if (FX && Math.random() < 0.8) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      carPoint(W, P, sd * 0.11, 1500, 0.15, _v);
      FX.smoke(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, 0, 0.8, 0.8 + Math.random() * 0.8, 1);
    }
  }
  // advance
  const before = P.dist;
  P.dist += P.speed * dt;
  P.hitCd -= dt;
  if (!cd && P.speed > 1500 && !offroad && !P.nitroOn) P.cleanT += dt;
  // roadside objects (a long object is hit along its whole length)
  const zNow = mod(P.dist, L);
  for (let sj = -3; sj <= 14; sj++) {
    const sg = segs[(si + sj + T.n) % T.n];
    for (let i = 0; i < sg.spr.length; i++) {
      const sp = sg.spr[i], dd = T.defs[sp.key];
      if (!dd.solid || W.t - sp.hit < 0.7) continue;
      const oz = sg.i * SEG + SEG / 2;
      if (Math.abs(wrapD(oz - zNow, L)) > dd.hl + 520) continue;
      let hit;
      if (dd.edge) hit = sp.off < 0 ? P.x < sp.off + CAR_HALF : P.x > sp.off - CAR_HALF;
      else hit = Math.abs(P.x - sp.off) < dd.hw + CAR_HALF;
      if (hit) {
        sp.hit = W.t;
        if (dd.edge) P.x = sp.off + (sp.off < 0 ? 1 : -1) * (CAR_HALF + 0.03);
        else P.x = sp.off + (P.x >= sp.off ? 1 : -1) * (dd.hw + CAR_HALF + 0.03);
        const st = clamp(P.speed / BASE_MAX, 0.15, 1.1);
        P.speed = Math.min(P.speed * 0.4, BASE_MAX * 0.28); P.vx = 0; P.nitroOn = false; P.nLatch = 0;
        crashFx(W, st, P.x > 0 ? 1 : -1, 'obj');
        if (sp.node) sp.node.knock = 1;
      }
    }
  }
  // other cars
  if (!cd) {
    for (let i = 0; i < W.obst.length; i++) {
      const o = W.obst[i]; if (o === P || o.ghost) continue;
      const dz2 = wrapD(o.dist - P.dist, L);
      if (Math.abs(dz2) > CL) continue;
      const dx2 = P.x - o.x, adx2 = Math.abs(dx2);
      if (adx2 >= 0.34) continue;
      const rel = Math.abs(P.speed - o.speed), stt = clamp(rel / 8000, 0.1, 1);
      if (dz2 > 250 && P.speed >= o.speed - 300) {
        P.dist += (dz2 - (CL + 10)) * 0.6; P.speed = Math.max(o.speed * 0.9, P.speed * 0.5);
        if (!o.isTraffic) o.speed = Math.min(o.speed * 1.0 + 300, o.vmax * 1.05);
      } else if (dz2 < -250) {
        o.speed = Math.max(0, o.speed * 0.92); P.speed = Math.min(P.speed * 1.02 + 200, top * 1.2);
      } else {
        P.speed *= 0.97;
      }
      let dir = dx2 >= 0 ? 1 : -1; if (adx2 < 0.02) dir = P.x > 0 ? -1 : 1;
      const ov = 0.34 - adx2;
      P.x += dir * ov * 0.6; P.vx = dir * 0.9;
      if (!o.isTraffic) { o.x = clamp(o.x - dir * ov * 0.5, -0.9, 0.9); o.vx = -dir * 0.9; }
      if (P.hitCd <= 0) { P.nitroOn = false; P.nLatch = 0; crashFx(W, stt, dir); }
    }
  }
  // camera follows the car a little late, so the car slides on screen
  P.xCam += (P.x - P.xCam) * Math.min(1, dt * 6.5);
  P.lean += (clamp(P.vx * 0.045 - push * 0.03, -0.14, 0.14) - P.lean) * Math.min(1, dt * 8);
  // engine
  const gr = gearOf(P.speed, top * (P.nitroOn ? 1.2 : 1));
  let rpmT = P.speed > 80 ? gr.rpm : 0.2 + 0.55 * P.thr;
  if (cd) rpmT = 0.2 + 0.6 * P.thr;
  P.rpm += (rpmT - P.rpm) * Math.min(1, dt * (rpmT < P.rpm ? 7 : 11));
  if (gr.g !== P.gear) {
    if (P.speed > 800 && !cd && !quiet) { ARC.sfx.tone(150, 0.07, { type: 'square', vol: 0.05 }); if (gr.g > P.gear && P.thr < 0.4 && Math.random() < 0.5) ARC.sfx.noise(0.06, { freq: 700, vol: 0.12 }); }
    P.gear = gr.g;
  }
  engineSet(P.rpm, P.thr, P.nitroOn);
  // field of view kick
  const fovT = 84 + (ARC.reducedMotion ? 0 : spPct * 8 + (P.nitroOn ? 16 : 0));
  W.fov += (fovT - W.fov) * Math.min(1, dt * 3.5);
  return before;
}

function wallScrape(W, side, dt) {
  const P = W.P;
  P.speed = Math.max(0, P.speed - BASE_MAX * 0.55 * dt); P.cleanT = 0;
  W.sparksT -= dt;
  if (W.sparksT <= 0 && P.speed > 1200) { W.sparksT = 0.05; sparksAt(W, side, 3, 0.8); }
  W.scr -= dt;
  if (W.scr <= 0) { W.scr = 0.12; if (!W.attract) ARC.sfx.noise(0.14, { filter: 'bandpass', freq: 1700, vol: 0.14 }); }
  if (!ARC.reducedMotion) W.shake = Math.max(W.shake, 3);
}

/* ------------------------------------------------------------ laps, order, finish */
function sortOrder(W) {
  const a = W.order;
  const key = (c) => (c.finished ? 1e9 - c.finT * 1000 : c.dist);
  for (let i = 1; i < a.length; i++) { const t = a[i], kt = key(t); let j; for (j = i - 1; j >= 0 && key(a[j]) < kt; j--) a[j + 1] = a[j]; a[j + 1] = t; }
}
const positionOf = (W, c) => W.order.indexOf(c) + 1;
const bestOf = (track) => BESTS[track] || (BESTS[track] = { total: null, lap: null });

function updateLaps(W) {
  const P = W.P, L = W.T.L;
  if (W.attract || P.finished) return;
  const lap = Math.floor(P.dist / L);
  if (lap > P.lapIdx) {
    const over = (P.dist - lap * L) / Math.max(P.speed, 500), tNow = W.t - over;
    P.lapIdx = lap;
    if (lap === 0) { P.lapT0 = tNow; P.started = true; }
    else {
      const lt = tNow - P.lapT0; P.lapT0 = tNow; P.lapTimes.push(lt);
      const prevBest = P.bestLap, stored = bestOf(W.cfg.track).lap;
      if (lt < P.bestLap) P.bestLap = lt;
      let msg = fmtTime(lt), sub = lap < LAPS ? 'Lap ' + lap + ' done' : 'Final lap';
      if (lt <= prevBest) sub += ' - best lap';
      if (stored != null) msg += '  (' + (lt <= stored ? '-' : '+') + Math.abs(lt - stored).toFixed(2) + ')';
      if (lap < LAPS) { ARC.toast(msg, sub, 2000); ARC.sfx.tone(660, 0.12, { type: 'triangle', vol: 0.2 }); ARC.sfx.tone(990, 0.16, { type: 'triangle', vol: 0.2, delay: 0.12 }); }
      if (lap >= LAPS) finishPlayer(W, tNow);
    }
  }
}

function finishPlayer(W, tNow) {
  const P = W.P;
  P.finished = true; P.finT = tNow; W.phase = 'finished'; W.endT = 0; P.nitroOn = false; P.nLatch = 0;
  sortOrder(W);
  const pos = positionOf(W, P);
  W.banner = W.mode === 'race' ? ordinal(pos) : 'FINISH'; W.bannerT = 3.2;
  ARC.toast(W.mode === 'race' ? 'You finished ' + ordinal(pos) : 'Time ' + fmtTime(tNow), 'Chequered flag', 2600);
  [523, 659, 784, 1046].forEach((f, i) => ARC.sfx.tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.11 }));
  if (FX) FX.confetti(W);
}

/* ------------------------------------------------------------ main step */
function stepWorld(W, dt) {
  const P = W.P;
  if (W.phase === 'countdown') {
    W.cd += dt;
    const step = W.cd < 0.6 ? -1 : W.cd < 1.4 ? 0 : W.cd < 2.2 ? 1 : W.cd < 3.0 ? 2 : 3;
    if (step !== W.lastBeep) {
      W.lastBeep = step;
      if (step >= 0 && step < 3) beep(520, 0.16, 0.18);
      if (step === 3) { beep(1040, 0.5, 0.2); ARC.toast('GO!', '', 900); W.phase = 'racing'; W.t = 0; W.goT = 0.9; }
    }
    advanceAI(W, dt, false);
    updatePlayer(W, dt);
  } else {
    advanceAI(W, dt, true);
    updatePlayer(W, dt);
    if (!W.attract) updateLaps(W);
    if (W.phase === 'finished') {
      W.endT += dt;
      if (W.endT > 3.0 && !W.over) { W.over = true; endRace(W); }
    } else if (!W.attract && W.t > 480 && !W.over) { W.over = true; timeUp(W); }
  }
  W.goT = Math.max(0, W.goT - dt); W.bannerT = Math.max(0, W.bannerT - dt);
  sortOrder(W);
  W.shake *= Math.exp(-dt * 7);
  if (W.shake > 0.3 && !ARC.reducedMotion) ARC.shake = Math.max(ARC.shake, W.shake);
  placeCar(W.T, P);
}

function simulateRest(W) {
  W.P.ghost = true;
  let guard = 0;
  const open = () => { for (let i = 0; i < W.rivals.length; i++) if (!W.rivals[i].finished) return true; return false; };
  while (open() && guard++ < 7000) advanceAI(W, 1 / 30, true);
}

function endRace(W) {
  const P = W.P, T = W.T, track = W.cfg.track;
  engineStop();
  const rows = [];
  if (W.mode === 'race') {
    simulateRest(W);
    W.racers.forEach((c) => rows.push(c));
    rows.sort((a, b) => (a.finT || 1e9) - (b.finT || 1e9));
  }
  const pos = W.mode === 'race' ? rows.indexOf(P) + 1 : 1, total = P.finT, st = bestOf(track);
  const newTotal = st.total == null || total < st.total, newLap = P.bestLap < Infinity && (st.lap == null || P.bestLap < st.lap);
  const prevTotal = st.total;
  if (newTotal) st.total = total;
  if (newLap) st.lap = P.bestLap;
  ARC.store.set('midnight-apex.bests', BESTS);
  let html = '';
  if (W.mode === 'race') {
    let h = '<table class="mx-res"><tbody>';
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i], gap = c.finT - rows[0].finT;
      h += '<tr' + (c.isPlayer ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' + ARC.esc(c.isPlayer ? 'You' : c.name) + '<small>' + ARC.esc(c.k.name) + '</small></td><td>' + (i === 0 ? fmtTime(c.finT) : '+' + gap.toFixed(2)) + '</td></tr>';
    }
    h += '</tbody></table>';
    html += h;
  }
  html += '<div class="mx-laps">' + P.lapTimes.map((t, k) => '<span>Lap ' + (k + 1) + '<b>' + fmtTime(t) + '</b></span>').join('') + '</div>';
  const title = W.mode === 'race' ? ordinal(pos) + ' <em>place</em>' : 'Time <em>attack</em>';
  ARC.over({
    score: total, lowerIsBetter: true, scoreLabel: 'Total time', eyebrow: W.mode === 'race' ? 'Race result - ' + T.name : 'Time attack - ' + T.name,
    title, html, again: W.mode === 'race' ? 'Race again' : 'Go again'
  });
  const stat = document.querySelector('.arc-card .stat');
  if (stat) {
    stat.innerHTML = '<div>Total time<b>' + fmtTime(total) + '</b></div><div>Best lap<b>' + fmtTime(P.bestLap) + '</b></div><div>Track best<b>' + fmtTime(st.total) + '</b></div>' +
      (newTotal ? '<div class="new">' + (prevTotal == null ? 'First time set' : 'New track best') + '<b class="new">&#9733;</b></div>' : '');
  }
  W.results = { pos, total, rows: rows.map((c) => ({ name: c.name, t: c.finT })) };
}

function timeUp() {
  engineStop();
  ARC.over({
    eyebrow: 'Out of time', title: 'Time <em>up</em>',
    html: '<p>Eight minutes on the clock and no chequered flag. Pull the nitro in the straights and keep it clean in the bends.</p>',
    again: 'Try again'
  });
}

/* ------------------------------------------------------------ small geometry toolkit */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

// Give a geometry flat vertex colours and an optional transform. Everything is non-indexed so it can be merged.
function prep(geo, hex, pos, rot, scl) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (pos || rot || scl) {
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e);
    _s.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1);
    _p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    _m4.compose(_p, _q, _s);
    g.applyMatrix4(_m4);
  }
  if (hex != null) {
    _c.set(hex);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}
function mergeG(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3).fill(1), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
const boxG = (w, h, d, hex, pos, rot) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot);
const cylG = (rt, rb, h, seg, hex, pos, rot, scl) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, scl);
const sphG = (r, hex, pos, scl, ws, hs) => prep(new THREE.SphereGeometry(r, ws || 10, hs || 8), hex, pos, null, scl);
const planeG = (w, h, hex, pos, rot) => prep(new THREE.PlaneGeometry(w, h), hex, pos, rot);

/* ------------------------------------------------------------ textures */
let RENDERER = null;
let TEX_ANISO = 1;
const ALL_TEX = [];
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat !== false) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (o.repeat && o.repeat !== true) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.anisotropy = TEX_ANISO;
  if (o.noMip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  else { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  t.needsUpdate = true;
  ALL_TEX.push(t);
  return t;
}
function noiseFill(g, w, h, base, amp, n, seed) {
  const r = rng(seed || 5);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amp * 255, a = 0.25 + r() * 0.5;
    g.fillStyle = v > 0 ? 'rgba(255,255,255,' + (a * amp * 0.9) + ')' : 'rgba(0,0,0,' + (a * amp * 0.9) + ')';
    const s = 1 + (r() * 2.6) | 0;
    g.fillRect((r() * w) | 0, (r() * h) | 0, s, s);
  }
}
function radialTex(inner, size) {
  return canvasTex(size || 128, size || 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, inner.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    glow: radialTex('rgba(255,255,255,1)', 128),
    pool: canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, { repeat: false }),
    beam: canvasTex(64, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const m = g.createLinearGradient(0, 0, w, 0);
      m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.5, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = m; g.fillRect(0, 0, w, h);
    }, { repeat: false }),
    groundNoise: canvasTex(256, 256, (g, w, h) => noiseFill(g, w, h, '#9a9a9a', 0.5, 5200, 31)),
    rock: canvasTex(256, 256, (g, w, h) => {
      noiseFill(g, w, h, '#8c8c8c', 0.6, 4200, 41);
      const r = rng(9);
      for (let i = 0; i < 14; i++) { const y = r() * h; g.strokeStyle = i % 2 ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.09)'; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 6 + (r() - 0.5) * 8); g.stroke(); }
    }),
    metal: canvasTex(64, 64, (g, w, h) => noiseFill(g, w, h, '#b9bec6', 0.25, 600, 3)),
    container: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + 2, 0, 1.5, h); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
      noiseFill(g, w, h, 'rgba(0,0,0,0)', 0.3, 300, 8);
    })
  };
  return SHARED;
}

function roadTexture(P) {
  // Tiles every 16 m along the road; the whole width is one tile.
  return canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, P.road, 0.18, 12000, 11);
    const r = rng(3);
    // worn wheel tracks in each lane
    [0.125, 0.375, 0.625, 0.875].forEach((cx) => {
      [-0.07, 0.07].forEach((o) => {
        const gr = g.createLinearGradient((cx + o - 0.03) * w, 0, (cx + o + 0.03) * w, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.20)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect((cx + o - 0.03) * w, 0, 0.06 * w, h);
      });
    });
    // patches and cracks
    for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.05 + r() * 0.08) + ')'; g.fillRect(r() * w, r() * h, 20 + r() * 80, 12 + r() * 50); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 10; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += r() * 26; g.lineTo(x, y); } g.stroke(); }
    // markings: edge lines (solid) and lane dashes
    g.fillStyle = P.lane;
    const px = w / 16; // pixels per metre across the road
    g.globalAlpha = 0.92;
    g.fillRect(0.55 * px, 0, 0.22 * px, h); g.fillRect(w - 0.77 * px, 0, 0.22 * px, h);
    [0.25, 0.5, 0.75].forEach((f) => {
      for (let k = 0; k < 2; k++) g.fillRect(f * w - 0.11 * px, k * 256 + 8, 0.22 * px, 112);
    });
    g.globalAlpha = 1;
  });
}

function kerbTexture(P) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = P.rumble[0]; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = P.rumble[1]; g.fillRect(0, h / 2, w, h / 2);
    noiseFill(g, w, h, 'rgba(0,0,0,0)', 0.3, 200, 4);
  });
}

function windowTexture(seed, lit) {
  return canvasTex(256, 512, (g, w, h) => {
    const r = rng(seed * 13 + 1);
    g.fillStyle = '#0d0a1c'; g.fillRect(0, 0, w, h);
    const cw = 16, ch = 20;
    for (let y = 8; y < h - 8; y += ch) for (let x = 6; x < w - 8; x += cw) {
      const on = r();
      g.fillStyle = on < 0.5 ? lit[(r() * lit.length) | 0] : (on < 0.62 ? '#2a2347' : '#120d26');
      if (on < 0.5) g.globalAlpha = 0.55 + r() * 0.45;
      g.fillRect(x, y, cw - 6, ch - 8); g.globalAlpha = 1;
    }
    // vertical neon trim
    const col = NEON_COLS[seed % NEON_COLS.length];
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8; g.fillRect(2, 0, 3, h); g.fillRect(w - 5, 0, 3, h); g.shadowBlur = 0;
  });
}

function signTexture(nameIdx, ci) {
  const nm = SHOP_NAMES[nameIdx % SHOP_NAMES.length], a = NEON_COLS[ci % NEON_COLS.length], b = NEON_COLS[(ci + 1) % NEON_COLS.length];
  return canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = '#090714'; g.fillRect(0, 0, w, h);
    g.lineWidth = 6; g.strokeStyle = a; g.shadowColor = a; g.shadowBlur = 14; g.strokeRect(10, 10, w - 20, h - 20);
    g.lineWidth = 3; g.strokeStyle = b; g.shadowColor = b; g.shadowBlur = 8; g.strokeRect(22, 22, w - 44, h - 44);
    g.shadowBlur = 14; g.shadowColor = a; g.fillStyle = '#fff'; g.textAlign = 'center';
    const two = !!nm[1];
    g.font = '800 ' + (two ? 40 : 50) + 'px Inter, Arial, sans-serif';
    g.fillText(nm[0], w / 2, two ? 88 : 112);
    if (two) { g.shadowColor = b; g.fillText(nm[1], w / 2, 138); }
    g.shadowBlur = 0;
  }, { repeat: false });
}

function shopTexture(nameIdx, ci) {
  const nm = SHOP_NAMES[nameIdx % SHOP_NAMES.length], a = NEON_COLS[ci % NEON_COLS.length], b = NEON_COLS[(ci + 3) % NEON_COLS.length];
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#1b1438'; g.fillRect(0, 0, w, h);
    const r = rng(nameIdx + 70);
    for (let i = 0; i < 7; i++) { g.fillStyle = r() < 0.6 ? '#ffd9a0' : '#171030'; g.fillRect(28 + i * 68, 28, 40, 46); }
    g.fillStyle = '#0b0818'; g.fillRect(30, 90, w - 60, 40);
    g.lineWidth = 3; g.strokeStyle = a; g.shadowColor = a; g.shadowBlur = 12; g.strokeRect(30, 90, w - 60, 40);
    g.fillStyle = '#fff'; g.font = '800 26px Inter, Arial, sans-serif'; g.textAlign = 'center';
    g.fillText((nm[0] + ' ' + nm[1]).trim(), w / 2, 119); g.shadowBlur = 0;
    const gy = 138, gh = h - gy - 6;
    const gr = g.createLinearGradient(0, gy, 0, gy + gh); gr.addColorStop(0, 'rgba(255,224,170,.95)'); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(30, gy, w - 60, gh);
    g.fillStyle = 'rgba(20,10,40,.7)'; for (let i = 0; i < 5; i++) g.fillRect(70 + i * 90, gy + 10, 9, gh - 10);
    g.fillStyle = '#0c0818'; g.fillRect(30, gy, 5, gh); g.fillRect(w - 35, gy, 5, gh);
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#f6ecf6' : a; g.fillRect(30 + i * ((w - 60) / 12), gy, (w - 60) / 12, 14); }
  }, { repeat: false });
}

function gantryTexture() {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#100c0a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff6940'; g.fillRect(0, h - 12, w, 6);
    g.fillStyle = '#fbf5ec'; g.font = 'italic 700 56px Georgia, serif'; g.textAlign = 'center'; g.fillText('MIDNIGHT APEX', w / 2, 62);
    g.fillStyle = '#c9a96e'; g.font = '600 20px monospace'; g.fillText('START  /  FINISH', w / 2, 100);
  }, { repeat: false });
}

function startLineTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    const c = 8;
    for (let i = 0; i < w / c; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f3f3f3'; g.fillRect(i * c * 2 - (j ? 0 : 0), j * (h / 2), c * 2, h / 2); }
    g.clearRect(0, 0, 0, 0);
  }, { repeat: false });
}

function waterNormal() {
  return canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data, r = rng(61), waves = [];
    for (let i = 0; i < 12; i++) { const kx = ((r() * 9) | 0) - 4, ky = ((r() * 9) | 0) - 4; if (!kx && !ky) { i--; continue; } waves.push([kx, ky, r() * TAU, 1 / (1 + Math.hypot(kx, ky) * 0.55)]); }
    const ht = (x, y) => { let s = 0; for (const q of waves) s += Math.sin(TAU * (q[0] * x + q[1] * y) / w + q[2]) * q[3]; return s; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = ht(x, y), dx = ht(x + 1, y) - a, dy = ht(x, y + 1) - a;
      const nx = -dx * 5, ny = -dy * 5, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * w + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { linear: true });
}

// A fake world to reflect: sky, moon and the glow of whatever lights the place.
function envTexture(P, id) {
  return canvasTex(512, 256, (g, w, h) => {
    const sg = g.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i < P.sky.length; i += 2) sg.addColorStop(P.sky[i] * 0.52, P.sky[i + 1]);
    sg.addColorStop(0.52, P.sky[7]); sg.addColorStop(0.56, '#05060a'); sg.addColorStop(1, '#020203');
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
    const r = rng(17);
    if (id === 'neon') {
      for (let i = 0; i < 70; i++) { const x = r() * w, ww = 4 + r() * 16, hh = 14 + r() * 56, col = NEON_COLS[(r() * 6) | 0]; g.fillStyle = col; g.globalAlpha = 0.5 + r() * 0.5; g.shadowColor = col; g.shadowBlur = 16; g.fillRect(x, h * 0.5 - hh, ww, hh); }
      g.shadowBlur = 0; g.globalAlpha = 1;
    } else {
      for (let i = 0; i < 40; i++) { g.fillStyle = id === 'harbour' ? '#ffb55a' : '#ffd9a0'; g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(r() * w, h * 0.5 - 2 - r() * 6, 2, 2); }
      g.globalAlpha = 1;
    }
    const md = P.moonDir, az = Math.atan2(md[0], -md[2]), mx = ((az / TAU) + 0.5) * w, my = h * (0.5 - Math.asin(md[1] / Math.hypot(md[0], md[1], md[2])) / Math.PI);
    const mg = g.createRadialGradient(mx, my, 0, mx, my, 70); mg.addColorStop(0, 'rgba(255,255,255,1)'); mg.addColorStop(0.1, P.moonCol); mg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mg; g.fillRect(mx - 80, my - 80, 160, 160);
  }, { repeat: false });
}

/* ------------------------------------------------------------ particles (sparks, smoke, dust, confetti) */
let FX = null;
function makePool(n, additive, tex) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), col = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 600 } },
    vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;\n' +
      'void main(){ vA=alpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(size*scale/max(-mv.z,0.5),180.0); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform sampler2D map; varying float vA; varying vec3 vC;\n' +
      'void main(){ vec4 t=texture2D(map,gl_PointCoord); float a=t.a*vA; if(a<0.01) discard; gl_FragColor=vec4(vC*(' + (additive ? '1.6' : '1.0') + '),a); }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 5;
  const st = { n, head: 0, life: new Float32Array(n), max: new Float32Array(n), vel: new Float32Array(n * 3), grow: new Float32Array(n), s0: new Float32Array(n), kind: new Int8Array(n), grav: new Float32Array(n) };
  return { pts, geo, mat, pos, size, alpha, col, st };
}
function createFX(scene) {
  const t = shared().glow;
  const sparks = makePool(260, true, t), smoke = makePool(240, false, t), conf = makePool(160, false, t);
  scene.add(sparks.pts, smoke.pts, conf.pts);
  function emit(p, x, y, z, vx, vy, vz, life, size, r, g, b, grow, grav, kind) {
    const s = p.st, i = s.head; s.head = (i + 1) % s.n;
    p.pos[i * 3] = x; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = z;
    s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz;
    s.life[i] = life; s.max[i] = life; s.s0[i] = size; s.grow[i] = grow; s.grav[i] = grav; s.kind[i] = kind;
    p.col[i * 3] = r; p.col[i * 3 + 1] = g; p.col[i * 3 + 2] = b; p.size[i] = size; p.alpha[i] = 1;
  }
  function step(p, dt, drag) {
    const s = p.st; let any = false;
    for (let i = 0; i < s.n; i++) {
      if (s.life[i] <= 0) { if (p.alpha[i] !== 0) { p.alpha[i] = 0; any = true; } continue; }
      any = true;
      s.life[i] -= dt;
      const k = Math.max(0, s.life[i] / s.max[i]);
      s.vel[i * 3 + 1] -= s.grav[i] * dt;
      const d = Math.exp(-drag * dt);
      s.vel[i * 3] *= d; s.vel[i * 3 + 2] *= d;
      p.pos[i * 3] += s.vel[i * 3] * dt; p.pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt; p.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
      p.size[i] = s.s0[i] * (1 + s.grow[i] * (1 - k));
      p.alpha[i] = s.kind[i] === 2 ? (k > 0.15 ? 1 : k / 0.15) : Math.min(1, k * 1.6) * (s.kind[i] === 0 ? 0.5 : 0.8);
    }
    if (any) { p.geo.attributes.position.needsUpdate = true; p.geo.attributes.size.needsUpdate = true; p.geo.attributes.alpha.needsUpdate = true; p.geo.attributes.color.needsUpdate = true; }
  }
  const api = {
    spark(x, y, z, vx, vy, vz, life, size) { emit(sparks, x, y, z, vx, vy, vz, life, 0.09 * size, 1, 0.62 + Math.random() * 0.3, 0.2, -0.4, 9, 1); },
    smoke(x, y, z, vx, vy, vz, life, size, kind) {
      if (kind === 1) emit(smoke, x, y, z, vx, vy, vz, life, 0.8 * size, 0.42, 0.36, 0.3, 1.6, -0.5, 0);
      else emit(smoke, x, y, z, vx, vy, vz, life * 1.3, 1.1 * size, 0.78, 0.78, 0.82, 2.2, -0.6, 0);
    },
    flame(x, y, z, vx, vy, vz) { emit(sparks, x, y, z, vx, vy, vz, 0.22 + Math.random() * 0.12, 0.34, 0.35, 0.6, 1, -0.5, 0, 1); },
    confetti(W) {
      const P = W.P; carPoint(W, P, 0, -2000, 3, _v);
      const cols = [[1, 0.41, 0.25], [1, 0.76, 0.2], [0.35, 0.6, 1], [0.2, 0.85, 0.6], [1, 1, 1]];
      for (let i = 0; i < 110; i++) {
        const c = cols[i % cols.length], a = Math.random() * TAU, sp = 3 + Math.random() * 8;
        emit(conf, _v.x, _v.y, _v.z, Math.cos(a) * sp, 6 + Math.random() * 8, Math.sin(a) * sp, 2.2 + Math.random() * 1.4, 0.34, c[0], c[1], c[2], 0, 7, 2);
      }
    },
    update(dt, cam, vh) {
      step(sparks, dt, 0.8); step(smoke, dt, 1.4); step(conf, dt, 1.2);
      const sc = vh * 0.5 / Math.tan(cam.fov * Math.PI / 360);
      sparks.mat.uniforms.scale.value = sc; smoke.mat.uniforms.scale.value = sc; conf.mat.uniforms.scale.value = sc;
    },
    clear() { [sparks, smoke, conf].forEach((p) => { p.st.life.fill(0); p.alpha.fill(0); p.geo.attributes.alpha.needsUpdate = true; }); }
  };
  return api;
}

// The night sky as a picture on the inside of a big sphere: gradient, stars, moon, glow of the town.
function skyTexture(P, id) {
  return canvasTex(2048, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h * 0.5);
    for (let i = 0; i < P.sky.length; i += 2) gr.addColorStop(P.sky[i], P.sky[i + 1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.5 + 1);
    const gb = g.createLinearGradient(0, h * 0.5, 0, h);
    gb.addColorStop(0, P.fog); gb.addColorStop(0.5, P.fog); gb.addColorStop(1, '#05060a');
    g.fillStyle = gb; g.fillRect(0, h * 0.5, w, h * 0.5);
    const r = rng(23);
    const ns = id === 'neon' ? 260 : 1900;
    for (let i = 0; i < ns; i++) {
      const y = Math.pow(r(), 0.8) * h * 0.46, x = r() * w, a = (0.25 + r() * 0.75) * (1 - y / (h * 0.5) * 0.8);
      g.fillStyle = 'rgba(255,255,255,' + a + ')'; const s = r() < 0.07 ? 2 : 1; g.fillRect(x, y, s, s);
    }
    const md = P.moonDir, l = Math.hypot(md[0], md[1], md[2]), dx = md[0] / l, dy = md[1] / l, dz = md[2] / l;
    const phi = Math.atan2(dz, -dx), mx = ((phi / TAU) % 1 + 1) % 1 * w, my = Math.acos(dy) / Math.PI * h;
    const hg = g.createRadialGradient(mx, my, 0, mx, my, 170);
    hg.addColorStop(0, rgba(P.moonCol, 0.55)); hg.addColorStop(0.1, rgba(P.moonCol, 0.22)); hg.addColorStop(1, rgba(P.moonCol, 0));
    g.fillStyle = hg; g.fillRect(mx - 170, my - 170, 340, 340);
    g.beginPath(); g.arc(mx, my, 13, 0, TAU); g.fillStyle = '#f4f8ff'; g.fill();
    if (id === 'neon') {
      const cg = g.createLinearGradient(0, h * 0.28, 0, h * 0.5); cg.addColorStop(0, 'rgba(255,60,160,0)'); cg.addColorStop(1, 'rgba(255,60,160,.35)');
      g.fillStyle = cg; g.fillRect(0, h * 0.28, w, h * 0.22);
    }
  }, { repeat: false, noMip: true });
}

/* ------------------------------------------------------------ cars */
// Lofted body: sections [z, halfWidth, yBottom, yTop, topRadius] from the nose (negative z) to the tail.
function loft(secs, m, rb) {
  const pts = [];
  const ring = (hw, yb, yt, rt) => {
    const out = [];
    rt = Math.min(rt, hw * 0.95, (yt - yb) * 0.5); const b = Math.min(rb, hw * 0.95, (yt - yb) * 0.5);
    const arc = (cx, cy, r, a0, a1) => { for (let k = 0; k <= m; k++) { const a = a0 + (a1 - a0) * k / m; out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } };
    arc(hw - b, yb + b, b, -Math.PI / 2, 0);
    arc(hw - rt, yt - rt, rt, 0, Math.PI / 2);
    arc(-hw + rt, yt - rt, rt, Math.PI / 2, Math.PI);
    arc(-hw + b, yb + b, b, Math.PI, Math.PI * 1.5);
    return out;
  };
  const rings = secs.map((s) => ring(s[1], s[2], s[3], s[4] == null ? 0.16 : s[4]));
  const np = rings[0].length / 2, verts = [], idx = [];
  rings.forEach((r, k) => { for (let i = 0; i < np; i++) verts.push(r[i * 2], r[i * 2 + 1], secs[k][0]); });
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < np; i++) {
      const i2 = (i + 1) % np, a = k * np + i, b = k * np + i2, d = (k + 1) * np + i, c = (k + 1) * np + i2;
      idx.push(a, b, d, b, c, d);
    }
  }
  const sideCount = verts.length / 3;
  const cap = (k, front) => {
    const base = verts.length / 3, s = secs[k], cy = (s[2] + s[3]) / 2;
    verts.push(0, cy, s[0]);
    for (let i = 0; i < np; i++) verts.push(rings[k][i * 2], rings[k][i * 2 + 1], s[0]);
    for (let i = 0; i < np; i++) {
      const a = base + 1 + i, b = base + 1 + ((i + 1) % np);
      if (front) idx.push(base, b, a); else idx.push(base, a, b);
    }
  };
  cap(0, true); cap(rings.length - 1, false);
  void sideCount;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const ng = g.toNonIndexed(); g.dispose();
  return ng;
}

function wheelGeo(R, w) {
  const parts = [];
  parts.push(cylG(R, R, w, 22, '#0c0c0e', null, [0, 0, Math.PI / 2]));
  parts.push(cylG(R * 0.64, R * 0.64, w + 0.02, 18, '#c4c9d2', null, [0, 0, Math.PI / 2]));
  parts.push(cylG(R * 0.2, R * 0.2, w + 0.05, 10, '#4f545c', null, [0, 0, Math.PI / 2]));
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    parts.push(boxG(w + 0.03, R * 0.62, R * 0.1, '#8a9099', [0, Math.cos(a) * R * 0.34, Math.sin(a) * R * 0.34], [a, 0, 0]));
  }
  return mergeG(parts);
}

const CARGEO = {};
function carGeos(kind) {
  if (CARGEO[kind]) return CARGEO[kind];
  const K = KINDS[kind], L = K.L, f = -L / 2, r = L / 2, hw = K.hw, van = K.style === 'van';
  const body = [], glass = [], dark = [], head = [], tail = [];
  let secs;
  if (van) {
    secs = [[f, hw * 0.72, 0.3, 0.78, 0.12], [f + 0.15, hw * 0.92, 0.26, 0.92, 0.14], [f + 0.8, hw * 0.99, 0.25, 1.02, 0.16], [f + 1.25, hw, 0.24, 1.14, 0.14],
      [f + 1.55, hw * 0.98, 0.24, 1.98, 0.16], [r - 0.3, hw * 0.98, 0.26, 2.08, 0.16], [r - 0.05, hw * 0.95, 0.3, 2.06, 0.14], [r, hw * 0.92, 0.34, 2.0, 0.12]];
  } else {
    secs = [[f, hw * 0.72, 0.3, K.noseY * 0.92, 0.1], [f + 0.12, hw * 0.9, 0.26, K.noseY, 0.14], [f + 0.65, hw * 0.99, 0.25, K.hoodY * 0.95, 0.16], [f + 1.5, hw, 0.24, K.hoodY, 0.14],
      [K.cabZ0 + 0.3, hw, 0.24, K.beltY, 0.12], [K.cabZ1 - 0.1, hw, 0.24, K.beltY, 0.12], [r - 0.55, hw * 0.98, 0.26, K.tailY, 0.12], [r - 0.08, hw * 0.92, 0.32, K.tailY - 0.03, 0.14], [r, hw * 0.82, 0.42, K.tailY - 0.1, 0.16]];
  }
  body.push(loft(secs, 3, 0.08));
  if (van) {
    glass.push(boxG(hw * 1.5, 0.78, 0.06, '#0a0f17', [0, 1.42, f + 1.42], [-0.62, 0, 0]));
    for (let sd = -1; sd <= 1; sd += 2) glass.push(boxG(0.05, 0.5, 0.9, '#0a0f17', [sd * (hw + 0.005), 1.35, f + 1.5]));
  } else {
    const cab = [[K.cabZ0, hw * 0.74, K.beltY - 0.02, K.beltY + 0.12, 0.06], [K.cabZ0 + 0.5, hw * 0.69, K.beltY - 0.02, K.roofY - 0.14, 0.16], [K.cabZ0 + 1.0, hw * 0.66, K.beltY - 0.02, K.roofY, 0.2],
      [K.cabZ1 - 0.8, hw * 0.65, K.beltY - 0.02, K.roofY - 0.02, 0.2], [K.cabZ1 - 0.25, hw * 0.68, K.beltY - 0.02, K.roofY - 0.22, 0.16], [K.cabZ1, hw * 0.76, K.beltY - 0.02, K.tailY - 0.02, 0.08]];
    glass.push(loft(cab, 3, 0.05));
    const roof = [1, 2, 3, 4].map((i) => [cab[i][0], cab[i][1] * 0.94, cab[i][3] - 0.04, cab[i][3] + 0.012, 0.18]);
    body.push(loft(roof, 3, 0.02));
  }
  // trim, bumpers, mirrors
  const dk = '#08090c';
  dark.push(boxG(hw * 1.5, 0.2, 0.1, dk, [0, 0.38, r - 0.03]));
  dark.push(boxG(hw * 1.5, 0.05, 0.38, dk, [0, 0.2, f + 0.1]));
  dark.push(boxG(hw * 0.92, 0.1, 0.05, dk, [0, K.noseY - 0.3, f - 0.005]));
  for (let sd = -1; sd <= 1; sd += 2) {
    dark.push(boxG(0.07, 0.1, L - 2.0, dk, [sd * (hw - 0.01), 0.28, 0]));
    body.push(boxG(0.14, 0.1, 0.2, K.style === 'van' ? '#222' : null, [sd * (hw * 0.84), (van ? 1.2 : K.beltY + 0.16), (van ? f + 1.3 : K.cabZ0 + 0.3)]));
  }
  body.forEach((g, i) => { if (!g.attributes.color) body[i] = prep(g, '#ffffff'); });
  for (let i = 0; i < K.pipes.length; i++) dark.push(cylG(0.055, 0.055, 0.28, 10, '#9aa0a8', [K.pipes[i], 0.27, r + 0.02], [Math.PI / 2, 0, 0]));
  dark.push(boxG(0.52, 0.13, 0.03, '#e8e6da', [0, 0.55, r + 0.012]));
  // wings
  if (K.wing === 'lip') body.push(prep(boxG(hw * 1.5, 0.045, 0.3, null, [0, K.tailY + 0.05, r - 0.4]), '#ffffff'));
  if (K.wing === 'big') {
    dark.push(boxG(hw * 2.05, 0.07, 0.52, '#121317', [0, K.tailY + 0.5, r - 0.28]));
    for (let sd = -1; sd <= 1; sd += 2) {
      body.push(prep(boxG(0.05, 0.34, 0.58, null, [sd * hw * 1.02, K.tailY + 0.5, r - 0.28]), '#ffffff'));
      dark.push(boxG(0.06, 0.44, 0.1, '#121317', [sd * hw * 0.5, K.tailY + 0.28, r - 0.3]));
    }
  }
  if (K.taxi) head.push(boxG(0.7, 0.17, 0.3, '#fff1b0', [0, K.roofY + 0.1, 0.4]));
  // lights
  const ty = (van ? 1.0 : K.tailY - 0.3), rz = r + 0.012, red = '#ffffff';
  if (K.tail === 'bar') {
    tail.push(boxG(hw * 1.4, 0.1, 0.03, red, [0, ty, rz]));
    for (let sd = -1; sd <= 1; sd += 2) tail.push(boxG(0.5, 0.2, 0.03, red, [sd * hw * 0.62, ty - 0.02, rz]));
  } else if (K.tail === 'slim') {
    tail.push(boxG(hw * 1.66, 0.07, 0.03, red, [0, ty + 0.02, rz]));
    for (let sd = -1; sd <= 1; sd += 2) tail.push(boxG(0.34, 0.14, 0.03, red, [sd * hw * 0.78, ty - 0.02, rz]));
  } else if (K.tail === 'round') {
    for (let sd = -1; sd <= 1; sd += 2) for (let q = 0; q < 2; q++) tail.push(cylG(0.085, 0.085, 0.03, 12, red, [sd * hw * 0.62, ty + 0.06 - q * 0.2, rz], [Math.PI / 2, 0, 0]));
  } else if (K.tail === 'tall') {
    for (let sd = -1; sd <= 1; sd += 2) tail.push(boxG(0.14, 0.6, 0.03, red, [sd * hw * 0.9, ty + 0.1, rz]));
  } else {
    for (let sd = -1; sd <= 1; sd += 2) tail.push(boxG(0.5, 0.2, 0.03, red, [sd * hw * 0.68, ty, rz]));
  }
  const hy = van ? 0.72 : K.noseY - 0.17;
  for (let sd = -1; sd <= 1; sd += 2) head.push(boxG(0.42, 0.1, 0.03, '#ffffff', [sd * hw * 0.52, hy, f - 0.012]));
  const R = van ? 0.39 : 0.34, ww = 0.27;
  const G = {
    kind, K, R, ww,
    body: mergeG(body), glass: mergeG(glass), dark: mergeG(dark), head: mergeG(head), tail: mergeG(tail),
    wheel: wheelGeo(R, ww), wx: hw - 0.12, wz: L / 2 - 0.88, hw, L,
    tailGlow: [{ x: -hw * 0.62, y: ty, z: rz }, { x: hw * 0.62, y: ty, z: rz }],
    headGlow: [{ x: -hw * 0.52, y: hy, z: f - 0.02 }, { x: hw * 0.52, y: hy, z: f - 0.02 }],
    pipeZ: r + 0.1, pipeX: K.pipes.slice()
  };
  // traffic and shared lights read these merged, with the wheels fixed on
  const dark2 = [G.dark];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((w) => {
    const g = G.wheel.clone(); g.applyMatrix4(new THREE.Matrix4().makeTranslation(w[0] * G.wx, R, w[1] * G.wz));
    dark2.push(g);
  });
  const gl2 = G.glass.clone(); gl2.setAttribute('color', new THREE.BufferAttribute(new Float32Array(gl2.attributes.position.count * 3).fill(0.03), 3));
  dark2.push(gl2);
  G.darkAll = mergeG(dark2);
  const lamp = [G.head.clone(), G.tail.clone()];
  const hc = new THREE.Color('#fff4d8'), tc = new THREE.Color('#d8141c');
  [hc, tc].forEach((cc, i) => { const a = new Float32Array(lamp[i].attributes.position.count * 3); for (let k = 0; k < a.length; k += 3) { a[k] = cc.r; a[k + 1] = cc.g; a[k + 2] = cc.b; } lamp[i].setAttribute('color', new THREE.BufferAttribute(a, 3)); });
  G.lampAll = mergeG(lamp);
  CARGEO[kind] = G;
  return G;
}

let CMAT = null;
function carMats() {
  if (CMAT) return CMAT;
  CMAT = {
    glass: new THREE.MeshStandardMaterial({ color: '#0a1220', metalness: 0.85, roughness: 0.08 }),
    dark: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5 }),
    wheel: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.42 }),
    head: new THREE.MeshBasicMaterial({ color: '#fff3d2', toneMapped: false }),
    glowTail: null
  };
  return CMAT;
}

function additiveMat(tex, hex, opacity) {
  return new THREE.MeshBasicMaterial({ map: tex, color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true });
}

const ARC_PLANE = new THREE.PlaneGeometry(1, 1);
let CONE_GEO = null;

// A race car: body, glass, trim, four wheels that spin and steer, lights that go bright on the brake.
function makeCar(kind, hex, o) {
  o = o || {};
  const G = carGeos(kind), M = carMats(), K = KINDS[kind];
  const root = new THREE.Group(); root.matrixAutoUpdate = false;
  const paint = K.taxi ? '#f2b81c' : hex;
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: paint, emissive: paint, emissiveIntensity: o.player ? 0.1 : 0.06, metalness: 0.45, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.08 });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#7a1018', toneMapped: false });
  const body = new THREE.Mesh(G.body, bodyMat), glass = new THREE.Mesh(G.glass, M.glass), dark = new THREE.Mesh(G.dark, M.dark);
  const head = new THREE.Mesh(G.head, M.head), tail = new THREE.Mesh(G.tail, tailMat);
  [body, glass, dark].forEach((m) => { m.castShadow = true; m.receiveShadow = false; root.add(m); });
  root.add(head, tail);
  const wheels = [];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((w) => {
    const pivot = new THREE.Group(); pivot.position.set(w[0] * G.wx, G.R, w[1] * G.wz);
    const mesh = new THREE.Mesh(G.wheel, M.wheel); mesh.castShadow = true;
    pivot.add(mesh); root.add(pivot);
    wheels.push({ pivot, mesh, front: w[1] < 0, spin: 0 });
  });
  const glows = [];
  const tg = shared().glow;
  const tailGlowMat = additiveMat(tg, '#ff2a30', 0.5), headGlowMat = additiveMat(tg, '#fff0cc', 0.55);
  G.tailGlow.forEach((p) => { const m = new THREE.Mesh(ARC_PLANE, tailGlowMat); m.scale.set(0.95, 0.55, 1); m.position.set(p.x, p.y, p.z + 0.05); m.userData.ov = true; root.add(m); glows.push(m); });
  G.headGlow.forEach((p) => { const m = new THREE.Mesh(ARC_PLANE, headGlowMat); m.scale.set(0.8, 0.5, 1); m.rotation.y = Math.PI; m.position.set(p.x, p.y, p.z - 0.05); m.userData.ov = true; root.add(m); });
  // light on the road ahead
  const cone = new THREE.Mesh(ARC_PLANE, additiveMat(shared().beam, '#ffe9c0', o.player ? 0.0 : 0.28));
  cone.rotation.x = -Math.PI / 2; cone.scale.set(7, 17, 1); cone.position.set(0, 0.07, -G.L / 2 - 7); cone.renderOrder = 2; cone.userData.ov = true;
  root.add(cone);
  const car = { root, kind, G, bodyMat, tailMat, tailGlowMat, headGlowMat, wheels, cone, flames: null, spin: 0, brakeOn: false };
  if (o.player) {
    if (!CONE_GEO) CONE_GEO = new THREE.ConeGeometry(0.16, 1.7, 10, 1, true);
    car.flames = [];
    G.pipeX.forEach((px, i) => {
      if (i > 1 && G.pipeX.length > 2) return;
      const fl = new THREE.Group(); fl.position.set(px, 0.28, G.L / 2 + 0.12);
      const outer = new THREE.Mesh(CONE_GEO, additiveMat(null, '#2f8bff', 0.8)); outer.rotation.x = Math.PI / 2; outer.position.z = 0.85;
      const inner = new THREE.Mesh(CONE_GEO, additiveMat(null, '#dff4ff', 0.9)); inner.rotation.x = Math.PI / 2; inner.scale.set(0.5, 0.6, 0.5); inner.position.z = 0.5;
      const glow = new THREE.Mesh(ARC_PLANE, additiveMat(tg, '#58a8ff', 0.9)); glow.scale.set(1.8, 1.8, 1); glow.position.z = 0.1; glow.rotation.y = Math.PI;
      fl.add(outer, inner, glow); fl.visible = false; root.add(fl); car.flames.push(fl);
      outer.material.side = THREE.DoubleSide; inner.material.side = THREE.DoubleSide;
    });
  }
  return car;
}

function setBasis(m, rx, ry, rz, ux, uy, uz, fx, fy, fz, px, py, pz) {
  m.set(rx, ux, -fx, px, ry, uy, -fy, py, rz, uz, -fz, pz, 0, 0, 0, 1);
}

const _P = { x: 0, y: 0, z: 0 };
// Pose a car (or an instance matrix) on the road. yaw/pitch/roll are small body angles.
function poseMatrix(m, T, dist, x, yaw, pitch, roll, lift) {
  const fr = frameAt(T, dist);
  surf(x, lift || 0, _P);
  let fx = fr.fx, fy = fr.fy, fz = fr.fz, rx = fr.rx, ry = fr.ry, rz = fr.rz, ux = fr.ux, uy = fr.uy, uz = fr.uz;
  if (yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const nfx = fx * c + rx * s, nfy = fy * c + ry * s, nfz = fz * c + rz * s;
    rx = rx * c - fx * s; ry = ry * c - fy * s; rz = rz * c - fz * s; fx = nfx; fy = nfy; fz = nfz;
  }
  if (pitch) {
    const c = Math.cos(pitch), s = Math.sin(pitch);
    const nfx = fx * c + ux * s, nfy = fy * c + uy * s, nfz = fz * c + uz * s;
    ux = ux * c - fx * s; uy = uy * c - fy * s; uz = uz * c - fz * s; fx = nfx; fy = nfy; fz = nfz;
  }
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const nrx = rx * c - ux * s, nry = ry * c - uy * s, nrz = rz * c - uz * s;
    ux = ux * c + rx * s; uy = uy * c + ry * s; uz = uz * c + rz * s; rx = nrx; ry = nry; rz = nrz;
  }
  setBasis(m, rx, ry, rz, ux, uy, uz, fx, fy, fz, _P.x, _P.y, _P.z);
}

function poseCar(car, W, c, dt, tNow) {
  const T = W.T, vxm = c.vx * HW, spm = Math.max(c.speed * SC, 0.1);
  let yaw = clamp(Math.atan2(vxm, spm + 6), -0.3, 0.3);
  let pitch = 0, roll = 0;
  if (c.isPlayer) {
    yaw += clamp(c.drift * Math.sign(c.vx || 1) * 0.1, -0.12, 0.12);
    pitch = (c.brake ? 0.03 : 0) - (c.thr > 0.6 ? 0.012 : 0) - (c.nitroOn ? 0.02 : 0);
    roll = -c.lean * 0.9;
    c.pitch += (pitch - c.pitch) * Math.min(1, dt * 10); pitch = c.pitch;
    c.roll += (roll - c.roll) * Math.min(1, dt * 10); roll = c.roll;
  } else roll = -clamp(c.vx * 0.04, -0.08, 0.08);
  poseMatrix(car.root.matrix, T, c.dist, c.x, yaw, pitch, roll, 0);
  car.root.matrixWorldNeedsUpdate = true;
  // wheels
  const rot = spm * dt / car.G.R;
  const steer = clamp(c.isPlayer ? c.steerIn * 0.45 : c.vx * 0.3, -0.5, 0.5);
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    w.spin -= rot; w.mesh.rotation.x = w.spin;
    if (w.front) w.pivot.rotation.y = -steer;
  }
  // lights
  const br = !!c.brake;
  if (br !== car.brakeOn) {
    car.brakeOn = br;
    car.tailMat.color.set(br ? '#ff4a3c' : '#7a1018');
    car.tailGlowMat.opacity = br ? 0.95 : 0.45;
    car.glowScale = br ? 1.5 : 1;
    car.root.children.forEach((ch) => { if (ch.material === car.tailGlowMat) ch.scale.set(br ? 1.5 : 0.95, br ? 0.9 : 0.55, 1); });
  }
  if (car.flames) {
    const on = !!c.nitroOn;
    for (let i = 0; i < car.flames.length; i++) {
      const fl = car.flames[i]; fl.visible = on;
      if (on) { const k = 0.8 + Math.random() * 0.5; fl.scale.set(1, 1, k * (1 + (c.speed / BASE_MAX) * 0.4)); fl.children[0].scale.x = fl.children[0].scale.y = 0.9 + Math.random() * 0.25; }
    }
  }
  void tNow;
}

/* ------------------------------------------------------------ traffic: all the civilians as a few instanced draws */
function createTraffic(scene) {
  const kinds = ['sedan', 'hatch', 'van', 'taxi'], CAP = 44, out = { kinds: {}, group: new THREE.Group() };
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.55, roughness: 0.38 });
  const darkMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.45 });
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  kinds.forEach((k) => {
    const G = carGeos(k);
    const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, CAP); im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = true; out.group.add(im); return im; };
    const body = mk(G.body, bodyMat), dark = mk(G.darkAll, darkMat), lamp = mk(G.lampAll, lampMat);
    lamp.castShadow = false;
    const glowM = new THREE.MeshBasicMaterial({ map: shared().glow, color: '#ff2a30', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const glow = new THREE.InstancedMesh(ARC_PLANE, glowM, CAP * 2); glow.count = 0; glow.userData.ov = true; glow.frustumCulled = false; glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); out.group.add(glow);
    const coneM = additiveMat(shared().beam, '#ffe9c0', 0.22);
    const cone = new THREE.InstancedMesh(ARC_PLANE, coneM, CAP); cone.count = 0; cone.userData.ov = true; cone.frustumCulled = false; cone.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cone.renderOrder = 2; out.group.add(cone);
    out.kinds[k] = { G, body, dark, lamp, glow, cone, list: [] };
  });
  scene.add(out.group);
  return out;
}
const _tm = new THREE.Matrix4(), _tl = new THREE.Matrix4(), _col = new THREE.Color();
function assignTraffic(TR, W) {
  for (const k in TR.kinds) TR.kinds[k].list.length = 0;
  W.traffic.forEach((c) => { const e = TR.kinds[c.kind]; if (e) e.list.push(c); });
  for (const k in TR.kinds) {
    const e = TR.kinds[k], n = e.list.length;
    e.body.count = e.dark.count = e.lamp.count = n; e.glow.count = n * 2; e.cone.count = n;
    for (let i = 0; i < n; i++) { _col.set(k === 'taxi' ? '#f2b81c' : e.list[i].hex); e.body.setColorAt(i, _col); }
    if (e.body.instanceColor) e.body.instanceColor.needsUpdate = true;
  }
}
function updateTraffic(TR, W) {
  for (const k in TR.kinds) {
    const e = TR.kinds[k], n = e.list.length, G = e.G;
    for (let i = 0; i < n; i++) {
      const c = e.list[i];
      poseMatrix(_tm, W.T, c.dist, c.x, clamp(c.vx * 0.2, -0.1, 0.1), 0, 0, 0);
      e.body.setMatrixAt(i, _tm); e.dark.setMatrixAt(i, _tm); e.lamp.setMatrixAt(i, _tm);
      for (let g = 0; g < 2; g++) {
        const p = G.tailGlow[g];
        _tl.makeTranslation(p.x, p.y, p.z + 0.06).scale(_s.set(0.95, 0.55, 1));
        _tl.premultiply(_tm); e.glow.setMatrixAt(i * 2 + g, _tl);
      }
      _tl.makeTranslation(0, 0.07, -G.L / 2 - 7).multiply(_m4.makeRotationX(-Math.PI / 2)).multiply(_m4.makeScale(7, 17, 1));
      _tl.premultiply(_tm); e.cone.setMatrixAt(i, _tl);
    }
    e.body.instanceMatrix.needsUpdate = e.dark.instanceMatrix.needsUpdate = e.lamp.instanceMatrix.needsUpdate = e.glow.instanceMatrix.needsUpdate = e.cone.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------ building the 3D track */
const SEGM = SEG * SC;
const QUAL_LIST = [];
const CULL = [];     // instanced chunks, hidden when far from the camera   // scenery meshes whose shadow casting follows the quality level

function strip(rows, cols, fn, o) {
  o = o || {};
  const nV = rows * cols, pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), col = new Float32Array(nV * 3);
  const p = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, u: 0, v: 0, r: 1, g: 1, b: 1 };
  for (let j = 0; j < rows; j++) for (let k = 0; k < cols; k++) {
    p.nx = 0; p.ny = 1; p.nz = 0; p.r = p.g = p.b = 1;
    fn(j, k, p);
    const i = j * cols + k;
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    nor[i * 3] = p.nx; nor[i * 3 + 1] = p.ny; nor[i * 3 + 2] = p.nz;
    uv[i * 2] = p.u; uv[i * 2 + 1] = p.v;
    col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    if (o.skip && o.skip(j)) continue;
    for (let k = 0; k < cols - 1; k++) {
      const a = j * cols + k, b = a + 1, c = a + cols, d = c + 1;
      if (o.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  if (o.normals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
const frameRow = (T, j) => frameAt(T, j * T.FS * SEG);
const hexRGB = (h) => { _c.set(h); return [_c.r, _c.g, _c.b]; };

// Ground lookup: where is the ground at a distance dm (metres) beyond the paved edge?
function gndY(T, side, j, dm) {
  const A = side > 0 ? T.gR : T.gL, o = (((j % T.M) + T.M) % T.M) * 10;
  if (dm <= 0) return A[o + 5];
  for (let k = 0; k < 4; k++) {
    const d0 = A[o + k], d1 = A[o + k + 1];
    if (dm <= d1) { const t = (dm - d0) / Math.max(0.001, d1 - d0); return A[o + 5 + k] + (A[o + 5 + k + 1] - A[o + 5 + k]) * t; }
  }
  return A[o + 9];
}
const _t1 = { x: 0, y: 0, z: 0 };
function groundBase(T, segIdx, off, out) {
  const z = segIdx * SEG + SEG / 2;
  frameAt(T, z);
  if (Math.abs(off) <= EDGE_X) return surf(off, 0, out);
  const side = off < 0 ? -1 : 1, dm = (Math.abs(off) - EDGE_X) * HW;
  surf(side * EDGE_X, 0, _t1);
  const j = Math.round(z / SEG / T.FS);
  out.x = _t1.x + FR.hx * side * dm; out.z = _t1.z + FR.hz * side * dm; out.y = gndY(T, side, j, dm);
  return out;
}
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3();
// A placement matrix for a roadside object. 'face' mode puts the object's +Z toward the road and its X along it.
function objMatrix(T, segIdx, off, yaw, m) {
  groundBase(T, segIdx, off, _t1);
  const side = off < 0 ? -1 : 1;
  _Y.set(0, 1, 0);
  _Z.set(-side * FR.hx, 0, -side * FR.hz).normalize();
  _X.crossVectors(_Y, _Z).normalize();
  if (yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); const x = _X.clone().multiplyScalar(c).addScaledVector(_Z, s); _Z.multiplyScalar(c).addScaledVector(_X, -s); _X.copy(x); }
  m.makeBasis(_X, _Y, _Z).setPosition(_t1.x, _t1.y, _t1.z);
  return m;
}

function addInstanced(T, group, parts, items, chunks) {
  chunks = chunks || 1;
  for (let ch = 0; ch < chunks; ch++) {
    const sub = chunks === 1 ? items : items.filter((it) => Math.floor(it.i * chunks / T.n) === ch);
    if (!sub.length) continue;
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, sub.length);
      for (let k = 0; k < sub.length; k++) {
        im.setMatrixAt(k, sub[k].m);
        if (part.colored) im.setColorAt(k, sub[k].c || _c.set('#ffffff'));
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = !!part.cast; im.receiveShadow = !!part.recv; if (part.ov) im.userData.ov = true;
      if (part.cast) QUAL_LIST.push(im);
      group.add(im);
      if (part.cull !== false) { im.computeBoundingSphere(); const bs = im.boundingSphere; im.frustumCulled = true; CULL.push({ im, x: bs.center.x, y: bs.center.y, z: bs.center.z, r: bs.radius }); }
    }
  }
}

function lampParts(tint) {
  const lit = mergeG([
    cylG(0.1, 0.15, 9.2, 8, '#2b3038', [0, 4.6, 0]), boxG(0.5, 0.5, 0.5, '#20242c', [0, 0.25, 0]),
    boxG(0.13, 0.13, 3.5, '#2b3038', [0, 9.1, 1.7]), boxG(0.55, 0.16, 1.35, '#14161b', [0, 9.02, 3.35])
  ]);
  const glow = mergeG([boxG(0.42, 0.05, 1.05, tint, [0, 8.92, 3.35])]);
  return [
    { geo: lit, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), cast: true },
    { geo: glow, mat: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) }
  ];
}

function palmGeo() {
  const parts = [];
  for (let s = 0; s < 6; s++) {
    const t = s / 6, lean = 0.45 * t * t * 3;
    parts.push(cylG(0.2 - t * 0.07, 0.25 - t * 0.07, 1.3, 7, s % 2 ? '#4a3a2c' : '#5a4838', [lean, 0.65 + s * 1.2, 0], [0, 0, -0.07 * (s + 1) * 0.5]));
  }
  const crown = [1.2, 7.35, 0];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU + (i % 2) * 0.2, droop = 0.35 + (i % 3) * 0.25;
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(droop), 0.25 - Math.sin(droop), Math.sin(a) * Math.cos(droop)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir), e = new THREE.Euler().setFromQuaternion(q);
    const len = 3.8;
    parts.push(prep(new THREE.ConeGeometry(0.55, len, 4), i % 2 ? '#1d6a42' : '#144d31', [crown[0] + dir.x * len / 2, crown[1] + dir.y * len / 2, crown[2] + dir.z * len / 2], [e.x, e.y, e.z], [1, 1, 0.22]));
  }
  parts.push(sphG(0.3, '#33281b', [1.1, 7.0, 0.2]));
  return mergeG(parts);
}

function pineGeo(h, far) {
  const parts = [cylG(0.14, 0.24, h * 0.3, 6, '#2e2218', [0, h * 0.15, 0])];
  const layers = far ? 3 : 5;
  for (let i = 0; i < layers; i++) {
    const t = i / layers, r = (1 - t * 0.78) * h * 0.2, ch = h * (0.34 - t * 0.07);
    parts.push(cylG(0.02, r, ch, far ? 6 : 8, i % 2 ? '#14412a' : '#0e3322', [0, h * (0.22 + t * 0.62) + ch * 0.35, 0]));
  }
  return mergeG(parts);
}

function rockGeo(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, rr = rng(seed);
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
    if (!map.has(key)) map.set(key, 0.72 + rr() * 0.5);
    const k = map.get(key);
    p.setXYZ(i, p.getX(i) * k * 1.15, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return prep(g, '#585b5e', [0, r * 0.3, 0]);
}

function towerGeo(type) {
  const dims = [[16, 70, 16], [22, 96, 18], [14, 54, 14], [20, 80, 20]][type];
  const parts = [boxG(dims[0], dims[1], dims[2], null, [0, dims[1] / 2, 0])];
  if (type === 1) parts.push(boxG(dims[0] * 0.7, 14, dims[2] * 0.7, null, [0, dims[1] + 7, 0]));
  if (type === 3) parts.push(boxG(dims[0] * 1.08, 3, dims[2] * 1.08, null, [0, dims[1] + 1.5, 0]));
  return { geo: mergeG(parts.map((g) => prep(g, '#ffffff'))), dims, extraH: type === 1 ? 14 : type === 3 ? 3 : 0 };
}

function mountainGeo(seed) {
  const r = rng(seed), parts = [];
  for (let i = 0; i < 4; i++) {
    const rad = 120 + r() * 120, h = 150 + r() * 190;
    const cg = new THREE.ConeGeometry(rad, h, 7, 3, true), p = cg.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k), t = (y + h / 2) / h, a = Math.atan2(p.getZ(k), p.getX(k)), bump = 1 + Math.sin(a * 5 + i) * 0.1 + Math.sin(a * 11 + y * 0.05) * 0.05;
      p.setXYZ(k, p.getX(k) * bump, y + (Math.sin(a * 3 + y * 0.03) * 7), p.getZ(k) * bump);
    }
    cg.computeVertexNormals();
    const g = prep(cg, '#ffffff', [(i - 1.5) * rad * 0.9, h / 2 - 12, (r() - 0.5) * 90]);
    const pp = g.attributes.position, col = g.attributes.color;
    for (let k = 0; k < pp.count; k++) {
      const t = clamp((pp.getY(k) + 12) / h, 0, 1);
      const a = new THREE.Color('#0c1d18'), b = new THREE.Color('#44525a');
      a.lerp(b, Math.pow(t, 1.4)); col.setXYZ(k, a.r, a.g, a.b);
    }
    parts.push(g);
  }
  return mergeG(parts);
}

function smooth(arr, rad) {
  const n = arr.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = -rad; k <= rad; k++) s += arr[mod(i + k, n)]; out[i] = s / (2 * rad + 1); }
  return out;
}

const TS = {};   // built track scenes, by track id

function buildTrackScene(T) {
  if (TS[T.id]) return TS[T.id];
  trackExtents(T); 
  const P = T.pal, id = T.id, M = T.M, FS = T.FS, segs = T.segs, SH = shared();
  const group = new THREE.Group(); group.name = 'track-' + id;
  const S = { group, id, T, update: null, rain: null, sea: null, farPlane: null, env: null, tunnelLights: null };
  // lowest and highest road
  let minY = 1e9, maxY = -1e9;
  for (let j = 0; j < M; j++) { const y = T.F[j * STRIDE + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const SEA_Y = -3.5;
  const Y0 = id === 'harbour' ? SEA_Y : id === 'neon' ? minY - 3.2 : minY - 14;
  S.Y0 = Y0;

  /* ---- road */
  const roadTex = roadTexture(P), kerbTex = kerbTexture(P);
  const rough = id === 'neon' ? 0.34 : id === 'harbour' ? 0.62 : 0.74;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: rough, metalness: 0.0, envMapIntensity: id === 'neon' ? 1.6 : 0.9 });
  const road = new THREE.Mesh(strip(M + 1, 2, (j, k, o) => {
    frameRow(T, j); surf(k ? 1 : -1, 0, o);
    o.nx = FR.ux; o.ny = FR.uy; o.nz = FR.uz; o.u = k; o.v = j * FS * SEGM / 16;
  }), roadMat);
  road.receiveShadow = true; group.add(road);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7, metalness: 0 });
  [-1, 1].forEach((s) => {
    const kg = strip(M + 1, 2, (j, k, o) => {
      frameRow(T, j); surf(s * (k ? EDGE_X : 0.965), 0.045, o);
      o.nx = FR.ux; o.ny = FR.uy; o.nz = FR.uz; o.u = k; o.v = j * FS * SEGM / 4.8;
    }, { flip: s < 0 });
    const km = new THREE.Mesh(kg, kerbMat); km.receiveShadow = true; group.add(km);
  });
  // start / finish line
  const lineMat = new THREE.MeshBasicMaterial({ map: startLineTexture(), toneMapped: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const lg = strip(2, 2, (j, k, o) => { frameRow(T, 0); const f2 = j * 1.6; surf(k ? 0.98 : -0.98, 0.03, o); o.x += FR.fx * f2; o.y += FR.fy * f2; o.z += FR.fz * f2; o.u = k; o.v = j; });
  const lineM = new THREE.Mesh(lg, lineMat); lineM.renderOrder = 1; group.add(lineM);

  /* ---- ground on both sides */
  const wSea = [new Float32Array(M), new Float32Array(M)], wCliff = [new Float32Array(M), new Float32Array(M)], wYard = [new Float32Array(M), new Float32Array(M)];
  for (let j = 0; j < M; j++) {
    const sg = segs[Math.min(T.n - 1, j * FS)];
    if (id === 'harbour') { wSea[0][j] = sg.gl === 0 ? 1 : 0; wYard[0][j] = sg.gl === 2 ? 1 : 0; wSea[1][j] = sg.gr === 0 ? 1 : 0; wYard[1][j] = sg.gr === 2 ? 1 : 0; }
    if (id === 'ghat') { wCliff[0][j] = sg.cliff === -1 ? 1 : 0; wCliff[1][j] = sg.cliff === 1 ? 1 : 0; }
  }
  for (let s = 0; s < 2; s++) { wSea[s] = smooth(wSea[s], 8); wCliff[s] = smooth(wCliff[s], 8); wYard[s] = smooth(wYard[s], 8); }
  T.gL = new Float32Array((M + 1) * 10); T.gR = new Float32Array((M + 1) * 10);
  const groundMat = new THREE.MeshStandardMaterial({ map: SH.groundNoise, vertexColors: true, roughness: id === 'neon' ? 0.55 : 0.95, metalness: 0, envMapIntensity: 0.5 });
  const C = {
    harbour: { grass: '#1f3c29', far: '#13271c', yard: '#4a525b', wall: '#3a424b', shoulder: '#4a4f57' },
    neon: { near: '#4a4560', far: '#2d2742', shoulder: '#4f4a66' },
    ghat: { near: '#2c3f2e', far: '#14281a', shoulder: '#55544d', rock: '#6a6c6e', rockHi: '#3e4a40' }
  }[id];
  const base = { dm: [0, 1.2, 13.4, 45, 95], dy: [0, -0.1, -0.22, 0, 0] };
  [-1, 1].forEach((s) => {
    const si = s > 0 ? 1 : 0, A = s > 0 ? T.gR : T.gL;
    const gg = strip(M + 1, 5, (j, k, o) => {
      frameRow(T, j);
      surf(s * EDGE_X, 0, _t1);
      const jj = j % M, ws = wSea[si][jj], wc = wCliff[si][jj], wy = wYard[si][jj];
      const eY = _t1.y, drop = Y0 - eY;
      const nz = Math.sin(j * 0.045 + s) * 0.5 + Math.sin(j * 0.13 + 2 * s) * 0.3;
      const bdm = base.dm[k];
      let bdy = base.dy[k];
      if (k === 3) bdy = drop * 0.3 - 0.2 + (id === 'ghat' ? 9 + nz * 7 : id === 'neon' ? nz * 0.8 : nz * 0.6);
      if (k === 4) bdy = drop;
      let dm = bdm, dy = bdy;
      if (ws > 0) { const sdm = [0, 0.5, 0.8, 1.0, 1.2][k], sdy = [0, -0.25, SEA_Y - eY + 0.5, SEA_Y - eY, SEA_Y - eY][k]; dm = lerp(dm, sdm, ws); dy = lerp(dy, sdy, ws); }
      if (wc > 0) { const sdm = [0, 2.0, 3.4, 6.5, 45][k], sdy = [0, -0.1, 8.5, 24, 34][k]; dm = lerp(dm, sdm, wc); dy = lerp(dy, sdy, wc); }
      A[j * 10 + k] = dm; A[j * 10 + 5 + k] = eY + dy;
      o.x = _t1.x + FR.hx * s * dm; o.z = _t1.z + FR.hz * s * dm; o.y = eY + dy;
      o.u = dm / 12 * s; o.v = j * FS * SEGM / 12;
      let col;
      if (id === 'harbour') {
        const g1 = hexRGB(k < 2 ? C.shoulder : (k < 4 ? C.grass : C.far)), y1 = hexRGB(k < 2 ? C.shoulder : C.yard), w1 = hexRGB(C.wall);
        col = [lerp(lerp(g1[0], y1[0], wy), w1[0], ws), lerp(lerp(g1[1], y1[1], wy), w1[1], ws), lerp(lerp(g1[2], y1[2], wy), w1[2], ws)];
      } else if (id === 'neon') col = hexRGB(k < 3 ? C.near : C.far);
      else {
        const n1 = hexRGB(k < 2 ? C.shoulder : (k < 3 ? C.near : C.far)), r1 = hexRGB(k < 2 ? C.shoulder : (k === 4 ? C.rockHi : C.rock));
        col = [lerp(n1[0], r1[0], wc), lerp(n1[1], r1[1], wc), lerp(n1[2], r1[2], wc)];
      }
      o.r = col[0]; o.g = col[1]; o.b = col[2];
    }, { flip: s < 0, normals: true });
    const gm = new THREE.Mesh(gg, groundMat); gm.receiveShadow = true; group.add(gm);
  });

 
  /* ---- guard rails */
  const railMat = new THREE.MeshStandardMaterial({ map: SH.metal, color: '#c4cad2', metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide });
  const postMat = new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.6, metalness: 0.4 });
  const postGeo = new THREE.BoxGeometry(0.12, 0.95, 0.12); postGeo.translate(0, 0.475, 0);
  [-1, 1].forEach((s) => {
    const flag = s < 0 ? 1 : 2;
    const mask = (j) => { const sg = segs[Math.min(T.n - 1, j * FS)]; return (sg.rail & flag) && sg.tun === 0; };
    let any = false; for (let j = 0; j < M; j++) if (mask(j)) { any = true; break; }
    if (!any) return;
    const rg = strip(M + 1, 4, (j, k, o) => {
      frameRow(T, j);
      const hs = [0.36, 0.5, 0.8, 0.94][k], l = (EDGE_X - 0.012 - (k === 0 || k === 3 ? 0 : 0.0)) * s;
      surf(l, hs, o); o.u = j * FS * SEGM / 4; o.v = k / 3;
    }, { skip: (j) => !(mask(j) && mask(j + 1)), flip: s < 0, normals: true });
    const rm = new THREE.Mesh(rg, railMat); rm.receiveShadow = true; rm.castShadow = true; group.add(rm);
    const items = [];
    for (let j = 0; j < M; j += 3) if (mask(j)) { frameRow(T, j); surf((EDGE_X - 0.02) * s, 0, _t1); const m = new THREE.Matrix4(); setBasis(m, FR.hx, FR.hy, FR.hz, 0, 1, 0, FR.fx, FR.fy, FR.fz, _t1.x, _t1.y - 0.05, _t1.z); items.push({ m, i: j * FS }); }
    if (items.length) addInstanced(T, group, [{ geo: postGeo, mat: postMat, cast: false }], items, 1);
  });

  /* ---- tunnels and flyovers: an extruded cross-section along the runs where the road is covered */
  function runs(test) {
    const out = []; let start = -1;
    for (let j = 0; j <= M; j++) {
      const on = j < M && test(segs[Math.min(T.n - 1, j * FS)]);
      if (on && start < 0) start = j;
      if (!on && start >= 0) { out.push([start, j - 1]); start = -1; }
    }
    return out;
  }
  function extrude(run, prof, mat, o) {
    const n = prof.length, rows = run[1] - run[0] + 1;
    const g = strip(rows, n, (jj, k, p) => {
      frameRow(T, run[0] + jj);
      const l = prof[k][0], y = prof[k][1];
      p.x = FR.px + FR.hx * l; p.y = FR.py + y; p.z = FR.pz + FR.hz * l; p.u = k / (n - 1) * 3; p.v = (run[0] + jj) * FS * SEGM / 6;
    }, { normals: true });
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; group.add(m);
    if (o && o.portals) {
      [run[0], run[1]].forEach((jr) => {
        const outer = prof.map((q) => [q[0] * o.portalK, q[1] * o.portalK + (q[1] > 0.1 ? 0.0 : 0)]);
        const pg = strip(2, n, (r, k, p) => {
          frameRow(T, jr); const q = r ? outer[k] : prof[k];
          p.x = FR.px + FR.hx * q[0]; p.y = FR.py + q[1]; p.z = FR.pz + FR.hz * q[0]; p.u = r; p.v = k / (n - 1);
        }, { normals: true });
        const pm = new THREE.Mesh(pg, mat); pm.castShadow = true; group.add(pm);
      });
    }
  }
  if (id === 'ghat') {
    const rockMat = new THREE.MeshStandardMaterial({ map: SH.rock, color: '#7b7e80', roughness: 0.95, side: THREE.DoubleSide });
    const inner = [[-9.4, 0], [-9.4, 1.5], [-9.0, 3.2], [-7.8, 4.8], [-5.8, 6.0], [-3.0, 6.7], [0, 7.0], [3.0, 6.7], [5.8, 6.0], [7.8, 4.8], [9.0, 3.2], [9.4, 1.5], [9.4, 0]];
    const outer = inner.map((q) => [q[0] * 1.55, q[1] * 1.5 + 0.1 * Math.abs(q[0])]);
    const lampItems = [], tunPools = [];
    runs((s) => s.tun === 1).forEach((r) => {
      extrude(r, inner, new THREE.MeshStandardMaterial({ map: SH.rock, color: '#8a8d90', emissive: '#b8702e', emissiveMap: SH.rock, emissiveIntensity: 0.32, roughness: 0.95, side: THREE.DoubleSide }), null);
      extrude(r, outer, rockMat, null);
      // portal faces between inner and outer arch
      [r[0], r[1]].forEach((jr) => {
        const pg = strip(2, inner.length, (rr, k, p) => { frameRow(T, jr); const q = rr ? outer[k] : inner[k]; p.x = FR.px + FR.hx * q[0]; p.y = FR.py + q[1]; p.z = FR.pz + FR.hz * q[0]; p.u = rr; p.v = k / 12; }, { normals: true });
        const pm = new THREE.Mesh(pg, rockMat); pm.castShadow = true; group.add(pm);
      });
      for (let j = r[0]; j <= r[1]; j += 4) for (let s = -1; s <= 1; s += 2) {
        frameRow(T, j); const m = new THREE.Matrix4(); setBasis(m, FR.hx, FR.hy, FR.hz, 0, 1, 0, FR.fx, FR.fy, FR.fz, FR.px + FR.hx * s * 3.2, FR.py + 6.55, FR.pz + FR.hz * s * 3.2); lampItems.push({ m, i: j * FS });
        if (j % 8 === 0) { const pm = new THREE.Matrix4(); surf(s * 0.4, 0.06, _t1); setBasis(pm, FR.rx, FR.ry, FR.rz, FR.ux, FR.uy, FR.uz, FR.fx, FR.fy, FR.fz, _t1.x, _t1.y, _t1.z); pm.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(15, 15, 1)); tunPools.push({ m: pm, i: j * FS }); }
      }
    });
    if (lampItems.length) addInstanced(T, group, [{ geo: boxG(0.5, 0.12, 1.6, '#ffb060'), mat: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) }], lampItems, 1);
    if (tunPools.length) addInstanced(T, group, [{ geo: ARC_PLANE, mat: new THREE.MeshBasicMaterial({ map: SH.pool, color: '#ff9c4a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), ov: true }], tunPools, 1);
  }
  if (id === 'neon') {
    const conc = new THREE.MeshStandardMaterial({ map: SH.groundNoise, color: '#4b4963', roughness: 0.85, side: THREE.DoubleSide });
    const deck = [[-12, 6.6], [-12, 7.6], [12, 7.6], [12, 6.6], [-12, 6.6]];
    const lampItems = [];
    runs((s) => s.tun === 2).forEach((r) => {
      extrude(r, deck, conc, null);
      [r[0], r[1]].forEach((jr) => {
        const shp = new THREE.Shape(); deck.forEach((q, k) => { if (k) shp.lineTo(q[0], q[1]); else shp.moveTo(q[0], q[1]); });
        const cg = new THREE.ShapeGeometry(shp); frameRow(T, jr);
        const cm = new THREE.Matrix4().makeBasis(new THREE.Vector3(FR.hx, FR.hy, FR.hz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(FR.fx, FR.fy, FR.fz)).setPosition(FR.px, FR.py, FR.pz);
        cg.applyMatrix4(cm); const capM = new THREE.Mesh(cg, conc); group.add(capM);
      });
      for (let j = r[0] + 2; j <= r[1]; j += 5) for (let s = -1; s <= 1; s += 1) { frameRow(T, j); const m = new THREE.Matrix4(); setBasis(m, FR.hx, FR.hy, FR.hz, 0, 1, 0, FR.fx, FR.fy, FR.fz, FR.px + FR.hx * s * 4.6, FR.py + 6.5, FR.pz + FR.hz * s * 4.6); lampItems.push({ m, i: j * FS }); }
    });
    if (lampItems.length) addInstanced(T, group, [{ geo: boxG(0.4, 0.1, 2.4, '#bfe9ff'), mat: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) }], lampItems, 1);
  }

 
  /* ---- roadside scenery */
  const buckets = {};
  segs.forEach((sg) => sg.spr.forEach((sp) => { (buckets[sp.key] = buckets[sp.key] || []).push({ seg: sg, sp }); }));
  const rr2 = rng(900 + id.length);
  const items = (key, make) => {
    const out = [];
    (buckets[key] || []).forEach((b) => { make(b, out); });
    return out;
  };
  const stdLit = (extra) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.7, metalness: 0.2 }, extra || {}));
  const pools = [];     // light pools on the road, filled by lamps
  const basicV = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const mk = (b, yaw) => ({ m: objMatrix(T, b.seg.i, b.sp.off, yaw || 0, new THREE.Matrix4()), i: b.seg.i });

  // lamps
  const tint = id === 'neon' ? '#bfe9ff' : id === 'ghat' ? '#ffd9a0' : '#ffb55a';
  {
    const its = [];
    ['lampL', 'lampR'].forEach((key) => items(key, (b, out) => {
      its.push(mk(b));
      const side = b.sp.off < 0 ? -1 : 1, z = b.seg.i * SEG + SEG / 2;
      frameAt(T, z); const pm = new THREE.Matrix4(); surf(side * 0.86, 0.05, _t1);
      setBasis(pm, FR.rx, FR.ry, FR.rz, FR.ux, FR.uy, FR.uz, FR.fx, FR.fy, FR.fz, _t1.x, _t1.y, _t1.z);
      pm.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(19, 19, 1));
      pools.push({ m: pm, i: b.seg.i });
    }));
    if (its.length) addInstanced(T, group, lampParts(tint), its, 8);
  }
  if (pools.length) {
    const pm = new THREE.MeshBasicMaterial({ map: SH.pool, color: tint, transparent: true, opacity: id === 'neon' ? 0.42 : 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    addInstanced(T, group, [{ geo: ARC_PLANE, mat: pm, ov: true }], pools, 8);
  }

  if (id === 'harbour') {
    const palm = items('palm', (b, out) => { const it = mk(b, rr2() * TAU); const s = 0.85 + rr2() * 0.45; it.m.multiply(new THREE.Matrix4().makeScale(s, s, s)); out.push(it); });
    if (palm.length) addInstanced(T, group, [{ geo: palmGeo(), mat: stdLit({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), cast: true }], palm, 4);
    const cols = ['#b3402b', '#2a5f8f', '#c9902a', '#3c7a4a', '#7a2f3a', '#d8d8d0', '#2b3a55'];
    const cg = new THREE.BoxGeometry(6.06, 2.6, 2.44); cg.translate(0, 1.3, 0);
    const cmat = new THREE.MeshStandardMaterial({ map: SH.container, roughness: 0.55, metalness: 0.45 });
    const conts = items('cont', (b, out) => {
      const base = mk(b);
      const hgt = 1 + ((rr2() * 2) | 0);
      for (let a = 0; a < 2; a++) for (let h = 0; h < hgt; h++) {
        const m = base.m.clone().multiply(new THREE.Matrix4().makeTranslation((rr2() - 0.5) * 0.5, h * 2.6, (a ? -1 : 1) * 1.3 - 1.2));
        out.push({ m, i: b.seg.i, c: new THREE.Color(cols[(rr2() * cols.length) | 0]) });
      }
    });
    if (conts.length) addInstanced(T, group, [{ geo: cg, mat: cmat, cast: true, recv: true, colored: true }], conts, 4);
    // warehouses
    const wh = mergeG([boxG(34, 9, 16, '#4a4f58', [0, 4.5, -8]), prep(new THREE.CylinderGeometry(8.6, 8.6, 34, 3), '#2d3138', [0, 9.0, -8], [0, 0, Math.PI / 2], [0.55, 1, 1]), boxG(7, 5.5, 0.3, '#14161b', [-8, 2.8, 0.1]), boxG(7, 5.5, 0.3, '#14161b', [8, 2.8, 0.1])]);
    const whg = mergeG([boxG(28, 0.6, 0.12, '#ffcf80', [0, 7.3, 0.12]), boxG(6, 0.2, 0.12, '#ffb04a', [-8, 5.9, 0.2]), boxG(6, 0.2, 0.12, '#ffb04a', [8, 5.9, 0.2])]);
    const whs = items('ware', (b, out) => out.push(mk(b)));
    if (whs.length) addInstanced(T, group, [{ geo: wh, mat: stdLit({ roughness: 0.8 }), cast: true, recv: true }, { geo: whg, mat: basicV() }], whs, 1);
    // cranes
    const crane = mergeG([
      boxG(1.2, 38, 1.2, '#35506f', [-9, 19, -4]), boxG(1.2, 38, 1.2, '#35506f', [9, 19, -4]), boxG(1.2, 38, 1.2, '#35506f', [-9, 19, -14]), boxG(1.2, 38, 1.2, '#35506f', [9, 19, -14]),
      boxG(20, 2, 14, '#2b3d55', [0, 38, -9]), boxG(3, 3.4, 78, '#d8dde4', [0, 41, 12]), boxG(8, 4.4, 8, '#c0392b', [0, 41.6, -10]), boxG(0.4, 0.4, 70, '#222', [-2.5, 36, 14]),
      boxG(0.5, 22, 0.5, '#2b3d55', [0, 50, -9], [0, 0, 0.35]), boxG(2.4, 3, 2.4, '#d8dde4', [0, 36, 40])
    ]);
    const cl = mergeG([sphG(0.5, '#ff2a2a', [0, 43.4, 50.4]), sphG(0.5, '#ff2a2a', [-9, 38.6, -4]), sphG(0.5, '#ff2a2a', [9, 38.6, -4])]);
    const cr = items('crane', (b, out) => out.push(mk(b)));
    const craneGlowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    if (cr.length) addInstanced(T, group, [{ geo: crane, mat: stdLit({ roughness: 0.6, metalness: 0.5 }), cast: false }, { geo: cl, mat: craneGlowMat }], cr, 1);
    S.craneGlowMat = craneGlowMat;
  }

  if (id === 'neon') {
    const lit = [['#ffd9a0', '#ffe8c0', '#9fe8ff'], ['#ff9ad0', '#ffd9a0', '#ffe8c0'], ['#9fe8ff', '#ffffff', '#ffd9a0'], ['#c9a9ff', '#ffd9a0', '#9fe8ff']];
    for (let ty = 0; ty < 4; ty++) {
      const tg = towerGeo(ty), tex = windowTexture(ty + 2, lit[ty]);
      tex.repeat.set(tg.dims[0] / 38.4, (tg.dims[1] + tg.extraH) / 80);
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 1.3, roughness: 0.55, metalness: 0.3 });
      const its = items('tower' + ty, (b, out) => { const it = mk(b); const s = 0.8 + rr2() * 0.5; it.m.multiply(new THREE.Matrix4().makeScale(s, s * (0.8 + rr2() * 0.5), s)); out.push(it); });
      // far skyline of the same type
      const rf = rng(333 + ty * 17);
      for (let k = 0; k < 34; k++) {
        const a = rf() * TAU, rad = 420 + rf() * 520, s = 1.1 + rf() * 1.2, m = new THREE.Matrix4();
        m.makeTranslation(T.cx + Math.cos(a) * rad, Y0, T.cz + Math.sin(a) * rad).multiply(new THREE.Matrix4().makeRotationY(rf() * TAU)).multiply(new THREE.Matrix4().makeScale(s, s * (0.9 + rf() * 1.1), s));
        its.push({ m, i: ((a / TAU) * T.n) | 0 });
      }
      addInstanced(T, group, [{ geo: tg.geo, mat, cast: false }], its, 6);
    }
    // shops: one body, five facades
    const body = mergeG([boxG(14, 7, 10, '#2a2150', [0, 3.5, -5]), boxG(14.6, 0.5, 10.6, '#3a2e6a', [0, 7.2, -5]), boxG(14, 0.25, 2.4, null, [0, 4.6, 1.1])].map((g) => prep(g, '#2a2150')));
    const bodyItems = [];
    for (let v = 0; v < 5; v++) {
      const its = items('shop' + v, (b, out) => out.push(mk(b)));
      its.forEach((it) => bodyItems.push(it));
      if (!its.length) continue;
      const fm = new THREE.MeshBasicMaterial({ map: shopTexture(v, v), toneMapped: true });
      const fg = new THREE.PlaneGeometry(13.6, 6.8); fg.translate(0, 3.4, 0.05);
      addInstanced(T, group, [{ geo: fg, mat: fm }], its, 1);
    }
    if (bodyItems.length) addInstanced(T, group, [{ geo: body, mat: stdLit({ roughness: 0.8 }), cast: true, recv: true }], bodyItems, 1);
    // signs
    const poleG = mergeG([cylG(0.14, 0.18, 8.2, 8, '#2a2d36', [0, 4.1, 0]), boxG(5.6, 4.4, 0.35, '#090714', [0, 9.4, -0.1])]);
    const signPole = [];
    for (let v = 0; v < 6; v++) {
      const its = items('sign' + v, (b, out) => out.push(mk(b)));
      if (!its.length) continue;
      its.forEach((it) => signPole.push(it));
      const pg = new THREE.PlaneGeometry(5.2, 3.9); pg.translate(0, 9.4, 0.1);
      addInstanced(T, group, [{ geo: pg, mat: new THREE.MeshBasicMaterial({ map: signTexture(v + 3, v), toneMapped: false }) }], its, 1);
    }
    if (signPole.length) addInstanced(T, group, [{ geo: poleG, mat: stdLit({ roughness: 0.6 }), cast: true }], signPole, 1);
    const pil = mergeG([boxG(1.8, 7, 1.8, '#4b4a55', [0, 3.5, 0]), boxG(3.2, 0.9, 2.6, '#3d3c48', [0, 7.0, 0])]);
    const pits = items('pillar', (b, out) => out.push(mk(b)));
    if (pits.length) addInstanced(T, group, [{ geo: pil, mat: stdLit({ roughness: 0.9, metalness: 0 }), cast: true }], pits, 1);
  }

  if (id === 'ghat') {
    const pm = stdLit({ roughness: 0.9, metalness: 0 });
    const specs = [['pine0', pineGeo(9, false)], ['pine1', pineGeo(13, true)], ['pine2', pineGeo(7, false)]];
    specs.forEach(([key, geo]) => {
      const its = items(key, (b, out) => { const it = mk(b, rr2() * TAU); const s = 0.8 + rr2() * 0.55; it.m.multiply(new THREE.Matrix4().makeScale(s, s * (0.9 + rr2() * 0.4), s)); out.push(it); });
      if (its.length) addInstanced(T, group, [{ geo, mat: pm, cast: key !== 'pine1' }], its, 6);
    });
    const rg1 = rockGeo(2.1, 4), rg2 = rockGeo(1.5, 9), rmat = stdLit({ roughness: 0.95, metalness: 0 });
    ['rock0', 'rock1'].forEach((key, q) => {
      const its = items(key, (b, out) => { const it = mk(b, rr2() * TAU); const s = 0.9 + rr2() * 0.6; it.m.multiply(new THREE.Matrix4().makeScale(s, s, s)); out.push(it); });
      if (its.length) addInstanced(T, group, [{ geo: q ? rg2 : rg1, mat: rmat, cast: true, recv: true }], its, 1);
    });
    // chevrons
    const chevTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#f6c11c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#17171a'; g.lineWidth = 14; g.lineJoin = 'round';
      for (let i = 0; i < 2; i++) { const x = 34 + i * 40; g.beginPath(); g.moveTo(x, 24); g.lineTo(x + 28, 64); g.lineTo(x, 104); g.stroke(); }
      g.strokeRect(5, 5, w - 10, h - 10);
    }, { repeat: false });
    ['chevRt', 'chevLt'].forEach((key) => {
      const its = items(key, (b, out) => out.push(mk(b)));
      if (!its.length) return;
      const flip = key === 'chevLt' ? -1 : 1;
      const fg = new THREE.PlaneGeometry(1.7 * flip, 1.7); fg.translate(0, 2.4, 0.06);
      addInstanced(T, group, [{ geo: mergeG([cylG(0.07, 0.07, 2.4, 6, '#9aa0a8', [0, 1.2, 0]), boxG(1.8, 1.8, 0.1, '#17171a', [0, 2.4, 0])]), mat: stdLit(), cast: true }, { geo: fg, mat: new THREE.MeshBasicMaterial({ map: chevTex, side: THREE.DoubleSide, toneMapped: false }) }], its, 1);
    });
    // shrine
    const sh = mergeG([boxG(5.2, 0.6, 4.4, '#5a554e', [0, 0.3, -2.2]), boxG(3.6, 2.4, 3, '#3d2d25', [0, 1.8, -2.2]), prep(new THREE.ConeGeometry(3.4, 1.6, 4), '#2a1c18', [0, 3.8, -2.2], [0, Math.PI / 4, 0])]);
    const shg = mergeG([boxG(1.2, 1.6, 0.1, '#ffcf80', [0, 1.7, -0.62]), ...[0, 1, 2, 3, 4, 5].map((i) => boxG(0.5, 0.45, 0.05, i % 2 ? '#ffc22e' : '#e8452c', [-2.2 + i * 0.88, 3.0, 0.2]))]);
    const shi = items('shrine', (b, out) => out.push(mk(b)));
    if (shi.length) addInstanced(T, group, [{ geo: sh, mat: stdLit({ roughness: 0.85, metalness: 0 }), cast: true }, { geo: shg, mat: basicV() }], shi, 1);
    // mountains around the valley
    const mg = mountainGeo(5), mt = [];
    const rm = rng(6);
    for (let k = 0; k < 20; k++) { const a = k / 20 * TAU + rm() * 0.2, rad = 650 + rm() * 450, m = new THREE.Matrix4(); m.makeTranslation(T.cx + Math.cos(a) * rad, Y0 - 10, T.cz + Math.sin(a) * rad).multiply(new THREE.Matrix4().makeRotationY(rm() * TAU)).multiply(new THREE.Matrix4().makeScale(1 + rm() * 0.8, 0.7 + rm() * 0.9, 1 + rm() * 0.8)); mt.push({ m, i: 0 }); }
    addInstanced(T, group, [{ geo: mg, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }) }], mt, 1);
  }

  /* ---- start / finish gantry */
  {
    const gz = T.gantryZ + SEG / 2;
    frameAt(T, gz);
    const gm = new THREE.Group(), m = new THREE.Matrix4();
    setBasis(m, FR.hx, FR.hy, FR.hz, 0, 1, 0, FR.fx, FR.fy, FR.fz, FR.px, FR.py, FR.pz);
    gm.matrixAutoUpdate = false; gm.matrix.copy(m);
    const steel = new THREE.MeshStandardMaterial({ color: '#2a2e36', roughness: 0.5, metalness: 0.7 });
    [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 11, 0.9), steel); p.position.set(s * 10.6, 5.5, 0); p.castShadow = true; gm.add(p); });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(22.4, 1.2, 1.1), steel); beam.position.set(0, 11.2, 0); beam.castShadow = true; gm.add(beam);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: gantryTexture(), toneMapped: false, side: THREE.DoubleSide }));
    banner.position.set(0, 9.7, 0.1); gm.add(banner);
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(15, 4.2), additiveMat(SH.glow, '#ff7a3a', 0.35)); bl.position.set(0, 9.7, 0.3); gm.add(bl);
    for (let i = -4; i <= 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: '#fff2cf', toneMapped: false })); l.position.set(i * 2.3, 11.9, 0); gm.add(l); }
    group.add(gm);
  }

  /* ---- ground plane to the horizon, sea, sky glow */
  const farMat = id === 'harbour'
    ? new THREE.MeshStandardMaterial({ color: '#06223d', roughness: 0.12, metalness: 0.05, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 1.6 })
    : new THREE.MeshStandardMaterial({ color: id === 'neon' ? '#201b33' : '#0f2016', roughness: 1, metalness: 0 });
  if (id === 'harbour') { farMat.normalMap.repeat.set(110, 110); S.waterTex = farMat.normalMap; }
  const far = new THREE.Mesh(new THREE.CircleGeometry(4200, 40), farMat);
  far.rotation.x = -Math.PI / 2; far.position.y = Y0; far.receiveShadow = id !== 'harbour'; group.add(far);
  S.far = far;
  if (id === 'harbour') {
    // ships and buoy lights out on the water
    const ship = mergeG([boxG(46, 7, 12, '#1c2430', [0, 3.5, 0]), boxG(14, 9, 10, '#d9dde3', [-12, 11.5, 0]), boxG(4, 6, 4, '#c0392b', [-14, 18, 0]), boxG(30, 0.4, 11, '#6a5b49', [10, 7.2, 0])]);
    const shipGlow = mergeG([boxG(12, 0.7, 0.1, '#ffd9a0', [-12, 12, 5.1]), boxG(12, 0.7, 0.1, '#ffd9a0', [-12, 14.4, 5.1]), sphG(0.7, '#ff4a3a', [-14, 21.4, 0]), sphG(0.7, '#e8fff0', [18, 9, 0]), boxG(40, 0.5, 0.1, '#ffb55a', [0, 5.6, 6.05])]);
    const sit = [], rs = rng(77);
    for (let k = 0; k < 9; k++) { const a = rs() * TAU, rad = 420 + rs() * 650, m = new THREE.Matrix4(); m.makeTranslation(T.cx + Math.cos(a) * rad, SEA_Y - 0.5, T.cz + Math.sin(a) * rad).multiply(new THREE.Matrix4().makeRotationY(rs() * TAU)); sit.push({ m, i: 0 }); }
    addInstanced(T, group, [{ geo: ship, mat: stdLit({ roughness: 0.7, metalness: 0.3 }) }, { geo: shipGlow, mat: basicV() }], sit, 1);
  }

  /* ---- rain on the neon streets */
  if (id === 'neon') {
    const N = 900, pos = new Float32Array(N * 6), vel = new Float32Array(N), off = new Float32Array(N * 3);
    const r = rng(8);
    for (let i = 0; i < N; i++) { off[i * 3] = (r() - 0.5) * 60; off[i * 3 + 1] = r() * 30; off[i * 3 + 2] = (r() - 0.5) * 60; vel[i] = 26 + r() * 10; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#b9c8ff', transparent: true, opacity: 0.32, depthWrite: false, fog: false }));
    rain.frustumCulled = false; rain.renderOrder = 6; group.add(rain);
    S.rain = { rain, pos, vel, off, N, geo };
  }

  // centre of the lap, used by far things
  S.update = null; 
  return (TS[id] = S);
}

function trackExtents(T) {
  let sx = 0, sz = 0;
  for (let j = 0; j < T.M; j++) { sx += T.F[j * STRIDE]; sz += T.F[j * STRIDE + 2]; }
  T.cx = sx / T.M; T.cz = sz / T.M;
}

/* ------------------------------------------------------------ the 3D stage: renderer, lights, sky, camera */
let R3 = null;
let NO3D = false;

function setup3D(arc) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  RENDERER = renderer;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor('#05060c');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#25466b', 0.003);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.15, 3200);
  const hemi = new THREE.HemisphereLight('#46689a', '#10161f', 0.55); scene.add(hemi);
  const moon = new THREE.DirectionalLight('#9db8e8', 0.95);
  moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 5; sc.far = 190;
  moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.06;
  scene.add(moon, moon.target);
  const spots = [];
  for (let i = 0; i < 2; i++) {
    const sp = new THREE.SpotLight('#fff0d2', 1500, 90, 0.34, 0.65, 2);
    scene.add(sp, sp.target); spots.push(sp);
  }
  const skyMat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  R3 = {
    renderer, scene, camera, hemi, moon, spots, sky, skyMat, pmrem, cur: null, cars: null, worldRef: null, TR: null, lost: false,
    quality: -1, qT: 0, qN: 0, qMax: 0, fps: 60, soft: false, lastNow: 0, camPos: new THREE.Vector3(), camTgt: new THREE.Vector3(), camUp: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0.3, 0.4, -0.8),
    shakeS: 0, time: 0, camInit: false, blink: 0
  };
  FX = createFX(scene);
  R3.TR = createTraffic(scene);
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R3.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R3.soft = false; }
  arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
  arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
  return true;
}

// Four looks, from "everything" to "a slow or software renderer". Each step trades pixels, shadows, lights and shading cost.
const TIERS = [
  { px: 0.45, budget: 125000, shadow: 0, spots: 0, cheap: true, overlay: false, env: false, mapSize: 1024, aniso: 1, cull: 240 },
  { px: 0.7, budget: 460000, shadow: 0, spots: 1, cheap: false, overlay: true, env: true, mapSize: 1024, aniso: 2, cull: 420 },
  { px: 0.88, budget: 1000000, shadow: 1, spots: 2, cheap: false, overlay: true, env: true, mapSize: 1024, aniso: 4, cull: 650 },
  { px: 1, budget: 1.7e6, shadow: 1, spots: 2, cheap: false, overlay: true, env: true, mapSize: 2048, aniso: 8, cull: 900 }
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
    c = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map, vertexColors: m.vertexColors, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, side: m.side });
    c.userData.full = m; cheapCache.set(m, c);
  }
  return c;
}
function applyTier() {
  const r = R3, t = TIERS[r.quality];
  r.scene.traverse((o) => {
    if (o.material && !Array.isArray(o.material)) {
      const full = fullOf(o.material), want = t.cheap ? cheapOf(full) : full;
      if (o.material !== want) o.material = want;
    }
    if (o.userData && o.userData.ov) o.visible = t.overlay;
  });
  r.scene.environment = t.env && r.cur ? r.cur.env : null;
  const an = Math.min(t.aniso, r.renderer.capabilities.getMaxAnisotropy()); TEX_ANISO = an;
  ALL_TEX.forEach((tx) => { if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; } });
  r.spots.forEach((sp, i) => { sp.visible = i < t.spots; });
  QUAL_LIST.forEach((m) => { m.castShadow = t.shadow > 0 && r.quality >= 2; });
  r.renderer.shadowMap.enabled = t.shadow > 0;
  r.moon.castShadow = t.shadow > 0;
  r.hemi.intensity = r.baseHemi * (t.cheap ? 1.9 : 1); r.moon.intensity = r.baseMoon * (t.cheap ? 1.5 : 1);
  if (r.moon.shadow.mapSize.x !== t.mapSize) { r.moon.shadow.mapSize.set(t.mapSize, t.mapSize); if (r.moon.shadow.map) { r.moon.shadow.map.dispose(); r.moon.shadow.map = null; } }
}
function setQuality(q) {
  if (!R3) return;
  q = clamp(q | 0, 0, 3);
  if (q === R3.quality) return;
  R3.quality = q;
  applyTier(); resize3D(ARC);
}

function lookFor(T, S) {
  const P = T.pal, r = R3;
  r.scene.fog.color.set(P.fog); r.scene.fog.density = P.fogD;
  r.hemi.color.set(P.hemi[0]); r.hemi.groundColor.set(P.hemi[1]); r.baseHemi = P.hemi[2]; r.hemi.intensity = r.baseHemi;
  r.moon.color.set(P.sun[0]); r.baseMoon = P.sun[1]; r.moon.intensity = r.baseMoon;
  r.moonDir.set(P.moonDir[0], P.moonDir[1], P.moonDir[2]).normalize();
  if (!S.skyTex) S.skyTex = skyTexture(P, T.id);
  r.skyMat.map = S.skyTex; r.skyMat.needsUpdate = true;
  if (!S.env) S.env = r.pmrem.fromEquirectangular(envTexture(P, T.id)).texture;
  r.scene.environment = TIERS[Math.max(0, r.quality)].env ? S.env : null; r.scene.environmentIntensity = T.id === 'neon' ? 1.0 : 0.65;
  r.renderer.setClearColor(P.fog);
  const tt = TIERS[Math.max(0, r.quality)]; r.hemi.intensity = r.baseHemi * (tt.cheap ? 1.9 : 1); r.moon.intensity = r.baseMoon * (tt.cheap ? 1.5 : 1);
}

function disposeCars() {
  if (!R3.cars) return;
  const all = [R3.cars.player].concat(R3.cars.rivals);
  all.forEach((c) => {
    R3.scene.remove(c.root);
    c.bodyMat.dispose(); if (cheapCache.has(c.bodyMat)) { cheapCache.get(c.bodyMat).dispose(); cheapCache.delete(c.bodyMat); } c.tailMat.dispose(); c.tailGlowMat.dispose(); c.headGlowMat.dispose(); c.cone.material.dispose();
    if (c.flames) c.flames.forEach((f) => f.children.forEach((m) => m.material.dispose()));
  });
  R3.cars = null;
}

function activateWorld(W) {
  const r = R3, T = W.T, S = buildTrackScene(T);
  if (r.cur !== S) {
    if (r.cur) r.scene.remove(r.cur.group);
    r.scene.add(S.group); r.cur = S; lookFor(T, S);
  }
  disposeCars();
  r.cars = { player: makeCar(W.P.kind, W.P.hex, { player: true }), rivals: W.rivals.map((rv) => makeCar(rv.kind, rv.hex)) };
  r.scene.add(r.cars.player.root); r.cars.rivals.forEach((c) => r.scene.add(c.root));
  assignTraffic(r.TR, W);
  FX.clear();
  applyTier();
  r.camInit = false; r.worldRef = W;
}

const _wp = new THREE.Vector3(), _wt = new THREE.Vector3(), _cu = { x: 0, y: 0, z: 0 };
function updateCamera(W, dt, a) {
  const r = R3, P = W.P, T = W.T, cam = r.camera, aspect = a.w / a.h, port = aspect < 0.9;
  const sp = clamp(P.speed / (BASE_MAX * 1.1), 0, 1.3);
  const back = (port ? 11.4 : 6.7) + sp * 1.8 + (P.nitroOn && !a.reducedMotion ? 1.1 : 0);
  const up = (port ? 4.5 : 2.5) + sp * 0.45;
  const follow = port ? 0.92 : 0.62;
  frameAt(T, P.dist - back / SC);
  surf(P.xCam * follow, up, _cu);
  const bankUp = { x: FR.ux, y: FR.uy, z: FR.uz };
  r.camPos.set(_cu.x, _cu.y, _cu.z);
  const ahead = (port ? 21 : 19) / SC;
  frameAt(T, P.dist + ahead);
  surf(P.xCam * 0.42, port ? 0.3 : 0.9, _cu);
  r.camTgt.set(_cu.x, _cu.y, _cu.z);
  // shake and drift
  const sx = a.shakeX || 0, sy = a.shakeY || 0;
  r.camPos.x += sx * 0.014; r.camPos.y += sy * 0.014; r.camPos.z += sx * 0.01;
  if (!a.reducedMotion) { r.camPos.y += Math.sin(a.time * 11) * 0.012 * sp; }
  cam.position.copy(r.camPos);
  r.camUp.set(lerp(0, bankUp.x, 0.45), lerp(1, bankUp.y, 0.45), lerp(0, bankUp.z, 0.45)).normalize();
  cam.up.copy(r.camUp);
  cam.lookAt(r.camTgt);
  const base = port ? 80 : clamp(2 * Math.atan(Math.tan(42 * Math.PI / 180) / aspect) * 180 / Math.PI, 46, 70);
  const fov = base + (W.fov - 84) * 0.9;
  if (Math.abs(cam.fov - fov) > 0.01 || cam.aspect !== aspect) { cam.fov = fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}

function updateLights(W, dt) {
  const r = R3, P = W.P, car = r.cars.player;
  _wp.set(0, 0.6, 0).applyMatrix4(car.root.matrix);
  r.moon.target.position.copy(_wp);
  r.moon.position.copy(_wp).addScaledVector(r.moonDir, 80);
  r.moon.target.updateMatrixWorld(); r.moon.updateMatrixWorld();
  // A car right in front catches the full beam at a metre or two and burns to a white disc; dim the beams as it closes.
  let near = 1;
  const ob = W.obst || [];
  for (let j = 0; j < ob.length; j++) {
    const o = ob[j]; if (o === P) continue;
    const dz = wrapD(o.dist - P.dist, W.T.L);
    if (dz > 0 && dz < 3600 && Math.abs(o.x - P.x) < 0.75) near = Math.min(near, clamp((dz - 500) / 3100, 0.05, 1));
  }
  near *= near;
  for (let i = 0; i < 2; i++) {
    const sd = i ? 1 : -1, sp = r.spots[i];
    sp.position.set(sd * 0.62, 0.72, -2.1).applyMatrix4(car.root.matrix);
    sp.target.position.set(sd * 0.9, -0.2, -26).applyMatrix4(car.root.matrix);
    sp.target.updateMatrixWorld();
    sp.intensity = (W.T.id === 'neon' ? 900 : 1500) * (P.nitroOn ? 1.2 : 1) * (R3.quality >= 2 ? 1 : 1.4) * near;
  }
}

function renderScene(W, dt, a) {
  const r = R3, T = W.T;
  r.time += dt; r.blink += dt;
  const cars = r.cars;
  poseCar(cars.player, W, W.P, dt);
  for (let i = 0; i < W.rivals.length; i++) poseCar(cars.rivals[i], W, W.rivals[i], dt);
  updateTraffic(r.TR, W);
  updateCamera(W, dt, a);
  updateLights(W, dt);
  // nitro flame feeds the particles
  if (W.P.nitroOn && FX) {
    const m = cars.player.root.matrix;
    cars.player.G.pipeX.forEach((px, i) => {
      if (i > 1 && cars.player.G.pipeX.length > 2) return;
      _wp.set(px, 0.3, cars.player.G.L / 2 + 0.3).applyMatrix4(m);
      FX.flame(_wp.x, _wp.y, _wp.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.2);
    });
  }
  FX.update(dt, r.camera, a.h * r.renderer.getPixelRatio());
  // sky, ground and rain follow the camera
  const cp = r.camera.position;
  r.sky.position.copy(cp);
  const S = r.cur;
  if (S.far) { S.far.position.set(cp.x, S.Y0, cp.z); if (S.waterTex) { const n = S.waterTex; n.offset.set(cp.x * 110 / 8400 + r.time * 0.006, -cp.z * 110 / 8400 + r.time * 0.004); } }
  if (S.craneGlowMat) { const k = 0.25 + 0.75 * (Math.sin(r.time * 3) > 0.2 ? 1 : 0); S.craneGlowMat.color.setScalar(k); }
  if (S.rain) {
    const q = S.rain, p = q.pos, f = FR;
    frameAt(T, W.P.dist); const sx = -f.fx * 0.35, sz = -f.fz * 0.35;
    for (let i = 0; i < q.N; i++) {
      let y = (q.off[i * 3 + 1] - r.time * q.vel[i]) % 30; if (y < 0) y += 30;
      const x = cp.x + ((q.off[i * 3] - cp.x % 60 + 90) % 60 - 30), z = cp.z + ((q.off[i * 3 + 2] - cp.z % 60 + 90) % 60 - 30);
      const yy = cp.y - 6 + y;
      p[i * 6] = x; p[i * 6 + 1] = yy; p[i * 6 + 2] = z; p[i * 6 + 3] = x + sx; p[i * 6 + 4] = yy + 1.1; p[i * 6 + 5] = z + sz;
    }
    q.geo.attributes.position.needsUpdate = true;
  }
  const maxD = TIERS[Math.max(0, r.quality)].cull;
  for (let i = 0; i < CULL.length; i++) { const c = CULL[i], dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z; c.im.visible = (!c.im.userData.ov || TIERS[Math.max(0, r.quality)].overlay) && Math.sqrt(dx * dx + dy * dy + dz * dz) - c.r < maxD; }
  r.renderer.render(r.scene, r.camera); if (!r.firstR) { r.firstR = 1; }
}

/* ------------------------------------------------------------ HUD */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function glow(g, x, y, r, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, 0));
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif';
const INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736', ORANGE = '#ff6940';
function txt(ctx, s, x, y, size, color, align, weight, fam) {
  ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y);
}
function plate(ctx, x, y, w, h, r) {
  rr(ctx, x, y, w, h, r == null ? 10 : r); ctx.fillStyle = 'rgba(8,6,4,.64)'; ctx.fill(); ctx.strokeStyle = 'rgba(251,245,236,.16)'; ctx.lineWidth = 1; ctx.stroke();
}

function drawDial(ctx, cx, cy, r, P) {
  const a0 = 0.75 * Math.PI, a1 = 2.25 * Math.PI, maxK = 400, kmh = P.speed * KMH;
  const g = ctx.createRadialGradient(cx, cy - r * 0.25, r * 0.1, cx, cy, r * 1.05);
  g.addColorStop(0, 'rgba(38,31,24,.88)'); g.addColorStop(1, 'rgba(8,6,4,.9)');
  ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(251,245,236,.22)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.87, a0 + (330 / maxK) * (a1 - a0), a1); ctx.lineWidth = r * 0.07; ctx.strokeStyle = 'rgba(255,77,31,.85)'; ctx.stroke();
  ctx.lineCap = 'butt';
  for (let v = 0; v <= maxK; v += 20) {
    const a = a0 + (v / maxK) * (a1 - a0), big = v % 100 === 0, in1 = r * (big ? 0.72 : 0.79), out = r * 0.9;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * in1, cy + Math.sin(a) * in1); ctx.lineTo(cx + Math.cos(a) * out, cy + Math.sin(a) * out);
    ctx.strokeStyle = big ? INK : 'rgba(251,245,236,.45)'; ctx.lineWidth = big ? 2 : 1; ctx.stroke();
    if (big && r >= 62) txt(ctx, String(v / 100), cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6 + 4, 11, DIM, 'center', '500');
  }
  const na = a0 + clamp(kmh / maxK, 0, 1.02) * (a1 - a0);
  ctx.save(); ctx.shadowColor = ORANGE; ctx.shadowBlur = 8; ctx.strokeStyle = ORANGE; ctx.lineWidth = Math.max(2.5, r * 0.05); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(na) * r * 0.12, cy - Math.sin(na) * r * 0.12); ctx.lineTo(cx + Math.cos(na) * r * 0.84, cy + Math.sin(na) * r * 0.84); ctx.stroke(); ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.09, 0, TAU); ctx.fillStyle = '#2a251f'; ctx.fill(); ctx.strokeStyle = ORANGE; ctx.lineWidth = 2; ctx.stroke();
  txt(ctx, P.speed < 120 ? 'N' : String(P.gear), cx, cy - r * 0.22, Math.max(14, r * 0.5), GOLD, 'center', '700');
  txt(ctx, String(Math.round(kmh)), cx, cy + r * 0.36, Math.max(13, r * 0.38), INK, 'center', '700');
  if (r >= 62) txt(ctx, 'km/h', cx, cy + r * 0.5, 11, DIM, 'center', '500');
  const seg = 14, bw = r * 1.18, sw = bw / seg, by = cy + r * (r >= 62 ? 0.62 : 0.56), lit = Math.round(clamp(P.rpm, 0, 1) * seg);
  for (let i = 0; i < seg; i++) {
    ctx.fillStyle = i < lit ? (i > seg - 4 ? '#ff4d1f' : i > seg - 7 ? '#ffd23f' : '#44e39a') : 'rgba(251,245,236,.14)';
    ctx.fillRect(cx - bw / 2 + i * sw + 0.5, by, sw - 1.5, Math.max(4, r * 0.09));
  }
}

function mapPts(T) {
  if (T.map) return T.map;
  const pts = [], M = T.M;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let j = 0; j < M; j++) { const x = T.F[j * STRIDE], y = T.F[j * STRIDE + 2]; pts.push([x, y]); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const sc = 1 / Math.max(maxX - minX, maxY - minY, 1), ox = (1 - (maxX - minX) * sc) / 2, oy = (1 - (maxY - minY) * sc) / 2;
  T.map = { pts: pts.map((p) => [ox + (p[0] - minX) * sc, oy + (p[1] - minY) * sc]), cache: null, cacheKey: '' };
  return T.map;
}
function drawMap(ctx, W, x, y, S) {
  const T = W.T, M = mapPts(T), pad = Math.max(6, S * 0.1), inner = S - pad * 2;
  const dpr = ARC.dpr || 1, key = T.id + '|' + S + '|' + dpr;
  if (M.cacheKey !== key) {
    const c = makeCanvas(S * dpr, S * dpr), g = c.getContext('2d'); g.scale(dpr, dpr); g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); M.pts.forEach((p, k) => { const px = pad + p[0] * inner, py = pad + p[1] * inner; if (k) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath();
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = Math.max(6, S * 0.08); g.stroke();
    g.strokeStyle = '#d6cfc0'; g.lineWidth = Math.max(3, S * 0.04); g.stroke();
    const s0 = M.pts[0]; g.fillStyle = ORANGE; g.fillRect(pad + s0[0] * inner - 3, pad + s0[1] * inner - 3, 6, 6);
    M.cache = c; M.cacheKey = key;
  }
  plate(ctx, x, y, S, S, 12);
  ctx.drawImage(M.cache, x, y, S, S);
  const list = W.rivals.concat([W.P]);
  for (let i = 0; i < list.length; i++) {
    const c2 = list[i], f = mod(c2.dist, T.L) / SEG / T.FS, k = Math.floor(f) % T.M, t = f - Math.floor(f), a = M.pts[k], b = M.pts[(k + 1) % T.M];
    const px = x + pad + lerp(a[0], b[0], t) * inner, py = y + pad + lerp(a[1], b[1], t) * inner, isP = c2.isPlayer;
    ctx.beginPath(); ctx.arc(px, py, isP ? Math.max(4.5, S * 0.05) : Math.max(3.2, S * 0.034), 0, TAU);
    ctx.fillStyle = isP ? ORANGE : c2.hex; ctx.fill(); ctx.lineWidth = isP ? 2 : 1.2; ctx.strokeStyle = isP ? '#fff' : 'rgba(0,0,0,.7)'; ctx.stroke();
  }
}

function drawSpeedLines(ctx, a, W) {
  const P = W.P, sp = clamp(P.speed / (BASE_MAX * 1.2), 0, 1.2), k = clamp((sp - 0.5) * 1.7 + (P.nitroOn ? 0.55 : 0), 0, 1);
  if (k < 0.04 || a.reducedMotion) return;
  const w = a.w, h = a.h, cx = w / 2, cy = h * 0.42, R = Math.hypot(w, h) * 0.55, t = a.time;
  ctx.save(); ctx.lineCap = 'round';
  const n = 26;
  for (let i = 0; i < n; i++) {
    const seed = hash(i * 7 + 3), ang = seed * TAU, ph = (t * (1.7 + hash(i) * 1.5) + hash(i + 40)) % 1;
    const r0 = R * (0.3 + ph * 0.55), r1 = r0 + R * (0.1 + 0.18 * k) * (0.4 + ph);
    ctx.globalAlpha = k * 0.26 * Math.sin(ph * Math.PI);
    ctx.strokeStyle = P.nitroOn ? '#a8dcff' : '#ffffff'; ctx.lineWidth = 1 + hash(i + 9) * 2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.8); ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.8); ctx.stroke();
  }
  ctx.restore();
  if (P.nitroOn) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(47,123,255,0)'); g.addColorStop(1, 'rgba(47,123,255,.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
}

function drawHUD(ctx, arc, W) {
  const w = arc.w, h = arc.h, P = W.P, touch = arc.touchMode, race = W.mode === 'race', hp = arc.hudPad(), pads = touch && arc.touchStyle === 'pads', gest = touch && !pads;
  const u = clamp(Math.min(w / 700, h / 600), 0.78, 1.15), portrait = w / h < 0.9;
  const S = (v) => Math.round(v * u), F = (v) => Math.max(12, Math.round(v * u));
  const m = S(9) + 2;
  const pos = positionOf(W, P), lapNo = clamp(P.lapIdx + 1, 1, LAPS);
  const tTotal = W.phase === 'countdown' ? 0 : (P.finished ? P.finT : W.t), lapNow = (P.started && !P.finished) ? W.t - P.lapT0 : 0;
  const stored = bestOf(W.cfg.track).lap, bestL = Math.min(P.bestLap, stored == null ? Infinity : stored);
  drawSpeedLines(ctx, arc, W);

  const aw = S(108), ah = S(66);
  plate(ctx, m, m, aw, ah, 12);
  if (race) {
    txt(ctx, String(pos), m + S(12), m + S(40), F(38), pos === 1 ? GOLD : INK, 'left', '500', F_DISP);
    const nw = ctx.measureText(String(pos)).width;
    txt(ctx, ordinal(pos).replace(/\d+/, ''), m + S(14) + nw, m + S(24), F(13), DIM, 'left', '600');
    txt(ctx, '/ ' + (W.rivals.length + 1), m + S(14) + nw + S(26), m + S(40), F(14), DIM, 'left', '600');
    txt(ctx, 'LAP ' + lapNo + '/' + LAPS, m + S(12), m + S(59), F(13), INK, 'left', '700');
  } else {
    txt(ctx, 'LAP ' + lapNo + '/' + LAPS, m + S(12), m + S(34), F(20), INK, 'left', '700');
    txt(ctx, 'TIME ATTACK', m + S(12), m + S(55), F(11), GOLD, 'left', '600');
  }
  const bw = S(178), bh = S(66), bx = portrait ? m + aw + S(6) : Math.round((w - bw) / 2), by = m;
  plate(ctx, bx, by, bw, bh, 12);
  const rows = [['TIME', fmtTime(tTotal), INK], ['LAP', fmtTime(lapNow), INK], ['BEST', bestL < Infinity ? fmtTime(bestL) : '-:--.--', P.bestLap <= (stored == null ? Infinity : stored) && P.bestLap < Infinity ? GOLD : DIM]];
  for (let i = 0; i < 3; i++) {
    txt(ctx, rows[i][0], bx + S(10), by + S(19) + i * S(18), F(11), DIM, 'left', '600');
    txt(ctx, rows[i][1], bx + bw - S(10), by + S(19) + i * S(18), F(i === 0 ? 15 : 13), rows[i][2], 'right', i === 0 ? '700' : '600');
  }
  const ms = portrait ? S(100) : S(136);
  drawMap(ctx, W, w - m - ms, m, ms);

  const r = touch ? S(62) : S(74);
  let cx, cy;
  if (touch) { cx = Math.max(18, m) + r + 4; cy = h - (pads ? 150 : 22) - 12 - r; }
  else { cx = w - m - r - 6; cy = h - m - r - 6; }
  drawDial(ctx, cx, cy, r, P);
  const nit = clamp(P.nitro / 100, 0, 1), flick = P.nitroOn ? 0.75 + 0.25 * Math.sin(performance.now() * 0.04) : 1;
  let nx, ny, nw2, nh2;
  if (touch) {
    nw2 = S(14); nh2 = S(112); nx = w - 14 - nw2 - 6; ny = h - (pads ? 168 : 30) - 14 - nh2;
    plate(ctx, nx - 5, ny - 22, nw2 + 10, nh2 + 28, 8);
    txt(ctx, 'N2O', nx + nw2 / 2, ny - 7, 11, GOLD, 'center', '700');
    ctx.fillStyle = 'rgba(251,245,236,.14)'; ctx.fillRect(nx, ny, nw2, nh2);
    const gv = ctx.createLinearGradient(0, ny + nh2, 0, ny); gv.addColorStop(0, '#2f7bff'); gv.addColorStop(1, '#a8e4ff');
    ctx.globalAlpha = flick; ctx.fillStyle = gv; ctx.fillRect(nx, ny + nh2 * (1 - nit), nw2, nh2 * nit); ctx.globalAlpha = 1;
    if (P.draft > 0.4) txt(ctx, 'DRAFT', nx + nw2 / 2, ny - 26, 11, '#9fe0ff', 'center', '700');
  } else {
    nw2 = S(250); nh2 = S(16); nx = m + 4; ny = h - m - nh2 - 6;
    plate(ctx, nx - 8, ny - S(24), nw2 + 16, nh2 + S(32), 10);
    txt(ctx, 'NITRO', nx, ny - 7, F(11), GOLD, 'left', '700');
    if (P.draft > 0.4) txt(ctx, 'DRAFTING', nx + nw2, ny - 7, F(11), '#9fe0ff', 'right', '700');
    ctx.fillStyle = 'rgba(251,245,236,.14)'; ctx.fillRect(nx, ny, nw2, nh2);
    const gh = ctx.createLinearGradient(nx, 0, nx + nw2, 0); gh.addColorStop(0, '#2f7bff'); gh.addColorStop(1, '#a8e4ff');
    ctx.globalAlpha = flick; ctx.fillStyle = gh; ctx.fillRect(nx, ny, nw2 * nit, nh2); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(251,245,236,.3)'; ctx.lineWidth = 1; ctx.strokeRect(nx + 0.5, ny + 0.5, nw2 - 1, nh2 - 1);
  }
  // touch gesture prompts
  if (gest && W.phase !== 'finished' && !W.attract) {
    const early = W.t < 8 || W.phase === 'countdown';
    const ready = P.nitro >= 60 && !P.nitroOn;
    if (early || ready) {
      const lines = early ? [arc.touchStyle === 'tilt' ? 'Tilt your phone to steer' : 'Drag left or right to steer', 'Swipe up for nitro', 'Hold a downward drag to brake'] : ['Swipe up for nitro'];
      const lw = S(early ? 268 : 170), lh = S(early ? 66 : 30), lx = (w - lw) / 2, ly = h - hp.bottom - lh - (early ? S(70) : S(62));
      const pulse = 0.65 + 0.35 * Math.sin(arc.time * 5);
      ctx.save(); ctx.globalAlpha = early ? clamp(1 - (W.t - 6) / 2, 0, 1) : pulse;
      plate(ctx, lx, ly, lw, lh, 12);
      lines.forEach((ln, i) => txt(ctx, ln, w / 2, ly + (early ? S(22) + i * S(18) : S(20)), F(early ? 13 : 12), i === 1 || !early ? GOLD : INK, 'center', '600', 'Inter, sans-serif'));
      ctx.restore();
    }
  }
  if (W.phase === 'countdown') {
    const step = W.cd < 0.6 ? 0 : W.cd < 1.4 ? 1 : W.cd < 2.2 ? 2 : 3, lw = S(206), lh = S(64), lx = (w - lw) / 2, ly = Math.round(h * 0.2);
    plate(ctx, lx, ly, lw, lh, 14);
    for (let i = 0; i < 3; i++) {
      const on = step > i, lcx = lx + lw / 2 + (i - 1) * S(58), lcy = ly + lh / 2;
      ctx.beginPath(); ctx.arc(lcx, lcy, S(20), 0, TAU); ctx.fillStyle = on ? '#ff2a20' : '#2a1412'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(251,245,236,.3)'; ctx.stroke();
      if (on && !arc.reducedMotion) glow(ctx, lcx, lcy, S(44), '#ff3a2c', 0.8);
    }
    txt(ctx, step === 0 ? 'READY' : 'GET SET', w / 2, ly + lh + F(22), F(15), INK, 'center', '700');
  } else if (W.goT > 0 && !W.attract) {
    const gl = W.goT / 0.9;
    ctx.globalAlpha = Math.min(1, gl * 1.5);
    const lw2 = S(206), lh2 = S(64), lx2 = (w - lw2) / 2, ly2 = Math.round(h * 0.2);
    plate(ctx, lx2, ly2, lw2, lh2, 14);
    for (let i = 0; i < 3; i++) { const gx = lx2 + lw2 / 2 + (i - 1) * S(58); ctx.beginPath(); ctx.arc(gx, ly2 + lh2 / 2, S(20), 0, TAU); ctx.fillStyle = '#3dff8a'; ctx.fill(); if (!arc.reducedMotion) glow(ctx, gx, ly2 + lh2 / 2, S(44), '#3dff8a', 0.7); }
    ctx.globalAlpha = 1;
  }
  if (W.bannerT > 0 && W.phase === 'finished') {
    const al = Math.min(1, W.bannerT * 2, (3.2 - W.bannerT) * 4);
    ctx.save(); ctx.globalAlpha = clamp(al, 0, 1);
    txt(ctx, 'FINISH', w / 2, Math.round(h * 0.34), F(26), GOLD, 'center', '700');
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 24;
    txt(ctx, W.banner, w / 2, Math.round(h * 0.34) + F(74), F(78), INK, 'center', '500', F_DISP);
    ctx.restore();
  }
}

/* ------------------------------------------------------------ menu and glue */
const MENU_CSS =
  '.mx-prev{display:grid;grid-template-columns:132px 1fr;gap:14px;align-items:center;margin:2px 0 12px;padding:10px;border:1px solid var(--rule-strong);border-radius:12px;background:var(--bg-deep)}' +
  '.arc-stage .mx-prev canvas{position:static;inset:auto;width:132px;height:84px;display:block;border-radius:8px;background:var(--bg)}' +
  '.mx-stat{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:center;font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.mx-stat .mx-name{grid-column:1/-1;font-family:var(--font-display);font-size:20px;letter-spacing:0;text-transform:none;color:var(--ink);line-height:1.1}' +
  '.mx-bar{height:6px;border-radius:3px;background:var(--rule);position:relative;overflow:hidden}.mx-bar i{position:absolute;inset:0 auto 0 0;background:var(--accent-warm);border-radius:3px}' +
  '.mx-blurb{grid-column:1/-1;font-family:var(--font-body);font-size:13px;letter-spacing:0;text-transform:none;color:var(--ink-dim);line-height:1.35}' +
  '.mx-laps{display:grid;grid-template-columns:repeat(3,auto);justify-content:start;gap:6px 18px;margin:0 0 12px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.mx-laps b{display:block;font-size:15px;color:var(--ink);font-weight:500;letter-spacing:0}' +
  '.mx-res{width:100%;border-collapse:collapse;margin:4px 0 12px;font-size:14px}.mx-res td{padding:7px 8px;border-bottom:1px solid var(--rule);color:var(--ink-dim)}' +
  '.mx-res tr.me td{background:var(--primary-soft);color:var(--ink)}.mx-res td:first-child{font-family:var(--font-mono);color:var(--accent);width:30px}' +
  '.mx-res small{display:block;font-size:11px;color:var(--ink-mute)}.mx-res td:last-child{text-align:right;font-family:var(--font-mono)}' +
  '.arc-seg[data-opt="color"] button::before{content:"";display:inline-block;width:11px;height:11px;border-radius:50%;background:var(--sw);margin-right:7px;vertical-align:-1px;box-shadow:0 0 0 1px rgba(251,245,236,.4)}' +
  '.arc-card:has(.mx-prev){padding-bottom:0}.arc-card:has(.mx-prev) .arc-actions{position:sticky;bottom:0;background:var(--bg-elev);padding:12px 0 clamp(14px,3vw,22px);margin-top:8px;box-shadow:0 -14px 14px var(--bg-elev);z-index:2}' +
  '.arc-card:has(.mx-prev) p{font-size:14px;margin-bottom:10px}.arc-card:has(.mx-prev) h2{margin:4px 0 8px}' +
  '@media (pointer:fine){.arc-card:has(.mx-prev) .arc-seg button{min-height:34px;padding:0 12px;font-size:13px}.arc-card:has(.mx-prev) .arc-opts{gap:7px;margin-bottom:6px}}' +
  '@media (max-width:420px){.mx-prev{grid-template-columns:110px 1fr;gap:10px}.arc-stage .mx-prev canvas{width:110px;height:70px}}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }

// A small side view of the chosen car on the chosen track's night, for the menu card.
function drawPreview(cv) {
  const g = cv.getContext('2d'), ch = ARC.choices, pal = PAL[ch.track] || PAL.harbour, K = KINDS[ch.car] || KINDS.kestrel, W = cv.width, H = cv.height;
  const hz = Math.round(H * 0.62);
  const sg = g.createLinearGradient(0, 0, 0, hz);
  for (let i = 0; i < pal.sky.length; i += 2) sg.addColorStop(pal.sky[i], pal.sky[i + 1]);
  g.fillStyle = sg; g.fillRect(0, 0, W, hz + 1);
  g.fillStyle = '#fff'; for (let i = 0; i < 26; i++) { g.globalAlpha = 0.5; g.fillRect(hash(i * 3) * W, hash(i * 5 + 1) * hz * 0.7, 1.4, 1.4); } g.globalAlpha = 1;
  glow(g, pal.moonDir[0] > 0 ? W * 0.78 : W * 0.24, hz * 0.3, 40, pal.moonCol, 0.9);
  g.fillStyle = pal.road; g.fillRect(0, hz, W, H - hz);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, hz, W, 4);
  g.fillStyle = pal.lane; for (let i = 0; i < 6; i++) g.fillRect(8 + i * (W / 5.5), hz + (H - hz) * 0.62, W / 12, 3);
  const sc = W * 0.76 / K.L, ox = W * 0.12, gy = H * 0.9;
  const X = (z) => ox + (z + K.L / 2) * sc, Y = (y) => gy - y * sc;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(W / 2, gy + 2, K.L * sc * 0.5, 5, 0, 0, TAU); g.fill();
  const col = colorHex(ch.color), f = -K.L / 2, r = K.L / 2;
  const body = [[f, 0.3], [f + 0.1, K.noseY], [f + 1.1, K.hoodY], [K.cabZ0 + 0.3, K.beltY], [K.cabZ0 + 1.0, K.roofY], [K.cabZ1 - 0.8, K.roofY - 0.02], [K.cabZ1, K.tailY - 0.02], [r, K.tailY - 0.1], [r, 0.42], [r - 0.3, 0.26], [f + 0.3, 0.26]];
  g.beginPath(); body.forEach((p, i) => { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.closePath();
  const bg = g.createLinearGradient(0, Y(K.roofY), 0, Y(0.2)); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.18, col); bg.addColorStop(1, '#000000');
  g.fillStyle = col; g.fill(); g.save(); g.clip(); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(0,0,0,.0)';
  g.globalCompositeOperation = 'source-over'; const sh = g.createLinearGradient(0, Y(K.roofY), 0, Y(0.2)); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H); g.restore();
  void bg;
  const gl = [[K.cabZ0 + 0.42, K.beltY + 0.02], [K.cabZ0 + 1.05, K.roofY - 0.1], [K.cabZ1 - 0.85, K.roofY - 0.12], [K.cabZ1 - 0.2, K.tailY - 0.1], [K.cabZ1 - 0.3, K.beltY + 0.02]];
  g.beginPath(); gl.forEach((p, i) => { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.closePath();
  g.fillStyle = '#0b1220'; g.fill(); g.fillStyle = 'rgba(160,200,255,.18)'; g.fill();
  [-1, 1].forEach((s) => { const wx = X(s * (K.L / 2 - 0.88)), wy = Y(0.34); g.beginPath(); g.arc(wx, wy, 0.37 * sc, 0, TAU); g.fillStyle = '#0a0a0c'; g.fill(); g.beginPath(); g.arc(wx, wy, 0.22 * sc, 0, TAU); g.fillStyle = '#b9bec7'; g.fill(); g.beginPath(); g.arc(wx, wy, 0.07 * sc, 0, TAU); g.fillStyle = '#444'; g.fill(); });
  g.fillStyle = '#fff3d2'; g.fillRect(X(f) - 1, Y(K.noseY - 0.1), 3, 3);
  glow(g, X(f) - 4, Y(K.noseY - 0.1), 22, '#fff0cc', 0.7);
  g.fillStyle = '#ff3b30'; g.fillRect(X(r) - 2, Y(K.tailY - 0.25), 3, 3); glow(g, X(r), Y(K.tailY - 0.25), 20, '#ff3030', 0.7);
  if (K.wing === 'big') { g.fillStyle = '#16171b'; g.fillRect(X(r - 0.5), Y(K.tailY + 0.55), 0.6 * sc, 3); }
}

function refreshPreview() {
  const card = document.querySelector('.arc-card'); if (!card) return;
  const cv = card.querySelector('.mx-cv'), st = card.querySelector('.mx-stat'); if (!cv || !st) return;
  const ch = ARC.choices, k = KINDS[ch.car] || KINDS.kestrel;
  try { drawPreview(cv); } catch (e) { /* the menu must always open */ }
  const bar = (l, v) => '<span>' + l + '</span><div class="mx-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div>';
  st.innerHTML = '<div class="mx-name">' + ARC.esc(k.name) + '</div>' + bar('Top speed', (k.top - 0.7) / 0.45) + bar('Accel', (k.acc - 0.6) / 0.7) + bar('Grip', (k.grip - 0.6) / 0.7) + '<div class="mx-blurb">' + ARC.esc(k.blurb) + '</div>';
}

function menuProps() {
  const bests = TRACK_ORDER.map((id) => {
    const b = BESTS[id];
    return '<span>' + ARC.esc(PAL[id].name) + '<b>' + (b && b.total != null ? fmtTime(b.total) : '-:--.--') + '</b>' + (b && b.lap != null ? '<small style="color:var(--ink-mute);font-size:11px">best lap ' + fmtTime(b.lap) + '</small>' : '') + '</span>';
  }).join('');
  return {
    eyebrow: 'Street racing', title: 'Midnight <em>Apex</em>', noBest: true,
    html: '<div class="mx-prev"><canvas class="mx-cv" width="264" height="168"></canvas><div class="mx-stat"></div></div>' +
      '<p>Three laps of the night. Draft rivals and brush past traffic to fill the nitro, then burn it on the straights. Lift for the hairpins or the bend throws you wide.</p>' +
      '<div class="mx-laps">' + bests + '</div>',
    options: [
      { id: 'track', label: 'Track', value: 'harbour', choices: TRACK_ORDER.map((id) => ({ v: id, label: PAL[id].name })) },
      { id: 'mode', label: 'Mode', value: 'race', choices: [{ v: 'race', label: 'Race' }, { v: 'time', label: 'Time attack' }] },
      { id: 'car', label: 'Car', value: 'kestrel', choices: PLAYER_KINDS.map((id) => ({ v: id, label: KINDS[id].name })) },
      { id: 'color', label: 'Colour', value: 'ember', choices: COLORS.map((c) => ({ v: c.id, label: c.name })) },
      { id: 'diff', label: 'Difficulty', value: 'pro', choices: [{ v: 'rookie', label: 'Rookie' }, { v: 'pro', label: 'Pro' }, { v: 'legend', label: 'Legend' }] },
      { id: 'auto', label: 'Auto gas', value: ARC.touchMode ? 'on' : 'off', choices: [{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }] }
    ]
  };
}

function stopAll() { engineStop(); }

function debugState() {
  const W = Wd, a = ARC;
  if (!W) return { phase: 'none', state: a.state };
  const P = W.P;
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, track: W.cfg.track, mode: W.mode, diff: W.cfg.diff, lap: clamp(P.lapIdx + 1, 1, LAPS), position: positionOf(W, P),
    speed: Math.round(P.speed * KMH), speedRaw: Math.round(P.speed), nitro: Math.round(P.nitro), nitroOn: P.nitroOn, playerX: +P.x.toFixed(3), distance: Math.round(P.dist),
    totalTime: +(P.finished ? P.finT : W.t).toFixed(2), lapTimes: P.lapTimes.map((t) => +t.toFixed(2)), bestLap: P.bestLap < Infinity ? +P.bestLap.toFixed(2) : null,
    gear: P.gear, rpm: +P.rpm.toFixed(2), drift: +P.drift.toFixed(2), draft: +P.draft.toFixed(2), crashes: P.crashes, crashLog: P.crashLog, nearMisses: P.nearMisses, trackLen: W.T.L,
    rivals: W.rivals.map((r) => ({ name: r.name, dist: Math.round(r.dist), x: +r.x.toFixed(2), speed: Math.round(r.speed * KMH), pos: positionOf(W, r), finished: r.finished })),
    traffic: W.traffic.length, results: W.results,
    gfx: R3 ? { cpuScene: +(R3.cpuScene || 0).toFixed(1), cpuHud: +(R3.cpuHud || 0).toFixed(1), quality: R3.quality, fps: Math.round(R3.fps), touchStyle: a.touchStyle, fov: +W.fov.toFixed(1), nLatch: +P.nLatch.toFixed(2) } : null
  };
}

// helpers for automated play-testing: a bot that drives like a decent player
const dev = {
  world: () => Wd,
  bot: (on) => { if (Wd) Wd.P.bot = on !== false; },
  ff: (sec) => { const W = Wd, n = Math.round(sec * 50); for (let i = 0; i < n && W && ARC.state === 'play'; i++) stepWorld(W, 0.02); },
  teleport: (dist) => { if (Wd) Wd.P.dist = dist; },
  quality: (q) => { if (R3) R3.lockQ = true; setQuality(q); }
};

function measureFps(dt) {
  const r = R3;
  if (r.lockQ) return;
  r.qWarm = (r.qWarm || 0);
  if (r.qWarm < 3) { r.qWarm++; return; }
  r.qT += dt; r.qN++;
  const win = r.fps < 12 ? 0.6 : 1.2;
  if (r.qT >= win || r.qN >= 4 && r.qT > 2.4) {
    r.fps = r.qN / r.qT; r.qT = 0; r.qN = 0;
    if (r.fps < 38 && r.quality > 0) { setQuality(r.fps < 14 ? Math.max(0, r.quality - 2) : r.quality - 1); r.qWarm = 2; }
  }
}

function showNo3D(a) {
  a.panel({
    eyebrow: 'Midnight Apex', title: '3D graphics <em>unavailable</em>',
    html: '<p>This browser could not start WebGL, which the 3D version of this game needs. Try another browser or turn on hardware acceleration.</p>',
    actions: [{ label: 'All games', href: '/games', primary: true }]
  });
}

Arcade.create({
  three: true,
  slug: 'midnight-apex', title: 'Midnight Apex', genre: 'Street racing',
  hint: 'WASD or mouse to steer. Hold click or Up for gas. Shift or N for nitro.',
  touchHint: 'Stick steers, Gas and Brake pads, Nitro when you have it',
  keys: [['Left Right / A D', 'Steer'], ['Up / W', 'Gas'], ['Down / S', 'Brake'], ['Shift / N (hold)', 'Nitro']],
  mouse: { steer: false, cursor: 'none', keys: [['Move mouse', 'Steer'], ['Click / hold', 'Gas']] },
  touch: { stick: true, pads: [{ label: 'Gas', key: 'ArrowUp', hot: true, big: true }, { label: 'Brake', key: 'ArrowDown' }, { label: 'Nitro', key: 'KeyN' }] },
  touchKeys: [['On-screen stick', 'Steer'], ['Gas', 'Accelerate'], ['Brake', 'Slow down'], ['Nitro', 'Boost']],
  gestures: {
    drag: 'x', tilt: true,
    hint: 'Drag to steer. Swipe up for nitro. Hold a downward drag to brake.',
    keys: [['Drag left or right', 'Steer'], ['Swipe up', 'Nitro'], ['Hold a downward drag, or swipe down', 'Brake'], ['Gas', 'Always on']]
  },
  formatScore: fmtTime,
  resize: (a) => resize3D(a),
  init(a) {
    ARC = a;
    BESTS = a.store.get('midnight-apex.bests', {}) || {};
    if (!setup3D(a)) { NO3D = true; showNo3D(a); return; }
    setQuality(R3.soft ? 0 : 3); resize3D(a);
    const origMenu = a.menu;
    a.menu = function (p) { stopAll(); return origMenu(Object.assign(menuProps(), p || {})); };
    a.debug = debugState;
    a.dev = dev;
    a.menu();
  },
  onMenu() {
    if (NO3D) return;
    injectCss(); stopAll();
    const card = document.querySelector('.arc-card'); if (!card) return;
    card.querySelectorAll('.arc-seg[data-opt="color"] button').forEach((b) => { b.style.setProperty('--sw', colorHex(b.getAttribute('data-v'))); });
    refreshPreview();
    card.querySelectorAll('.arc-seg').forEach((seg) => { seg.addEventListener('click', () => { setTimeout(refreshPreview, 0); }); });
  },
  start(a, ch) {
    if (NO3D) return;
    Wd = newWorld({ track: ch.track, mode: ch.mode, car: ch.car, color: ch.color, diff: ch.diff, auto: ch.auto, attract: false });
    engineStart();
    if (R3) R3.worldRef = null;
  },
  update(dt, a) {
    if (!Wd || NO3D) return;
    const sw = a.input.swipe();
    if (sw && a.touchMode && a.touchStyle !== 'pads' && Wd.phase === 'racing' && !Wd.attract) {
      const P = Wd.P;
      if (sw.dir === 'up') {
        if (P.nitro > 6) { P.nLatch = 1.1 + 0.9 * sw.power; a.sfx.tone(520, 0.08, { type: 'triangle', vol: 0.1 }); }
        else a.toast('Nitro empty', 'Draft and near-miss to refill', 900);
      } else if (sw.dir === 'down') P.brLatch = 0.5 + 0.4 * sw.power;
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(Wd, dt / n);
  },
  idle(dt, a) {
    if (NO3D || a.state !== 'menu') return;
    const c = a.choices, key = c.track + '|' + c.car + '|' + c.color;
    if (!Wd || !Wd.attract || Wd.attractKey !== key) {
      Wd = newWorld({ track: c.track, mode: 'race', car: c.car, color: c.color, diff: 'pro', auto: 'on', attract: true }); Wd.attractKey = key;
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
    const c0 = performance.now();
    renderScene(W, a.state === 'pause' ? 0 : dtReal, a);
    const c1 = performance.now();
    if (a.state !== 'menu') drawHUD(ctx, a, W);
    const c2 = performance.now();
    R3.cpuScene = (R3.cpuScene || c1 - c0) * 0.9 + (c1 - c0) * 0.1; R3.cpuHud = (R3.cpuHud || c2 - c1) * 0.9 + (c2 - c1) * 0.1;
  },
  onPause() { engineStop(); },
  onResume() { if (Wd && !Wd.attract) engineStart(); },
  onOver() { engineStop(); }
});
