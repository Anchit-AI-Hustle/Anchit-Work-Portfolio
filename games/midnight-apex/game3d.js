import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost } from '/games/shared/fx3d.js';
import { createHuman, createCrowd } from '/games/shared/human.js';
import { createVFX } from '/games/shared/vfx.js';
import * as MX from './mx-career.js';

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
  kestrel: { name: 'Kestrel RS', top: 1.0, acc: 1.0, grip: 1.0, brk: 1.0, drift: 1.0, blurb: 'Balanced, forgiving, quick off the line.', style: 'sport', tail: 'bar', wing: 'lip', L: 4.4, hw: 0.95, noseY: 0.5, hoodY: 0.7, beltY: 0.82, tailY: 0.92, roofY: 1.36, cabZ0: -0.5, cabZ1: 1.75, pipes: [-0.55, 0.55] },
  vanta: { name: 'Vanta GT', top: 1.08, acc: 0.86, grip: 0.88, brk: 0.95, drift: 1.15, blurb: 'Fastest on the straights, wide and edgy in corners.', style: 'gt', tail: 'slim', wing: 'none', L: 4.7, hw: 1.0, noseY: 0.44, hoodY: 0.62, beltY: 0.74, tailY: 0.82, roofY: 1.22, cabZ0: -0.2, cabZ1: 1.8, pipes: [-0.62, -0.38, 0.38, 0.62] },
  rook: { name: 'Rook Mk2', top: 0.94, acc: 1.2, grip: 1.2, brk: 1.1, drift: 0.85, blurb: 'Grippy and punchy. Lower top speed, hard to shake.', style: 'compact', tail: 'round', wing: 'big', L: 4.0, hw: 0.93, noseY: 0.58, hoodY: 0.78, beltY: 0.9, tailY: 0.98, roofY: 1.46, cabZ0: -0.45, cabZ1: 1.7, pipes: [0.55] },
  sable: { name: 'Sable R', top: 1.02, acc: 1.07, grip: 1.12, brk: 1.05, drift: 1.25, blurb: 'Tuner coupe. Sharp on turn-in and happy to hang its tail out.', style: 'sport', tail: 'round', wing: 'big', L: 4.3, hw: 0.94, noseY: 0.5, hoodY: 0.72, beltY: 0.84, tailY: 0.94, roofY: 1.32, cabZ0: -0.42, cabZ1: 1.68, pipes: [0.48] },
  halcyon: { name: 'Halcyon V8', top: 1.07, acc: 1.13, grip: 0.86, brk: 0.92, drift: 1.4, blurb: 'Old-school muscle. A huge shove and a tail that loves to slide.', style: 'gt', tail: 'bar', wing: 'none', L: 4.85, hw: 1.0, noseY: 0.62, hoodY: 0.86, beltY: 0.96, tailY: 1.0, roofY: 1.4, cabZ0: -0.02, cabZ1: 1.9, pipes: [-0.66, -0.5, 0.5, 0.66] },
  aurora: { name: 'Aurora X', top: 1.17, acc: 1.17, grip: 1.12, brk: 1.15, drift: 1.05, blurb: 'The crown car. Low, light and very, very quick.', style: 'gt', tail: 'slim', wing: 'lip', L: 4.6, hw: 1.03, noseY: 0.4, hoodY: 0.55, beltY: 0.69, tailY: 0.8, roofY: 1.12, cabZ0: -0.1, cabZ1: 1.62, pipes: [-0.32, 0.32] },
  cop: { name: 'Metro Patrol', top: 1.0, acc: 1.0, grip: 1.05, style: 'sedan', tail: 'box', wing: 'none', L: 4.8, hw: 0.95, noseY: 0.56, hoodY: 0.76, beltY: 0.9, tailY: 0.98, roofY: 1.48, cabZ0: -0.4, cabZ1: 1.9, pipes: [0.5], cop: true },
  swift: { name: 'Pursuit Special', top: 1.12, acc: 1.1, grip: 1.1, style: 'gt', tail: 'slim', wing: 'lip', L: 4.6, hw: 0.98, noseY: 0.46, hoodY: 0.64, beltY: 0.76, tailY: 0.84, roofY: 1.24, cabZ0: -0.2, cabZ1: 1.75, pipes: [-0.4, 0.4], cop: true },
  sedan: { name: 'Sedan', style: 'sedan', tail: 'box', wing: 'none', L: 4.6, hw: 0.92, noseY: 0.55, hoodY: 0.74, beltY: 0.88, tailY: 0.96, roofY: 1.46, cabZ0: -0.4, cabZ1: 1.85, pipes: [0.5] },
  hatch: { name: 'Hatch', style: 'hatch', tail: 'box', wing: 'lip', L: 3.9, hw: 0.88, noseY: 0.55, hoodY: 0.74, beltY: 0.88, tailY: 1.0, roofY: 1.5, cabZ0: -0.5, cabZ1: 1.95, pipes: [-0.4] },
  van: { name: 'Van', style: 'van', tail: 'tall', wing: 'none', L: 4.9, hw: 0.95, noseY: 0.7, hoodY: 0.95, beltY: 1.05, tailY: 1.9, roofY: 2.1, cabZ0: -1.6, cabZ1: 2.4, pipes: [0.5] },
  taxi: { name: 'Cab', style: 'sedan', tail: 'box', wing: 'none', L: 4.6, hw: 0.92, noseY: 0.55, hoodY: 0.74, beltY: 0.88, tailY: 0.96, roofY: 1.46, cabZ0: -0.4, cabZ1: 1.85, pipes: [0.5], taxi: true }
};
const PLAYER_KINDS = MX.PLAYER_CARS;
const COLORS = MX.PAINTS;
const colorHex = (id) => MX.pick(COLORS, id).hex;

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
const TRACK_ORDER = ['harbour', 'neon', 'ghat', 'city'];
// Lantern District: a downtown of real blocks, laid out as a closed run of streets with square corners,
// two underpasses and three shortcuts (a back alley across a whole block and two cuts through parking
// lots on the inside of corners). Dockside Strip: a straight quarter mile with run-off, for drag only.
PAL.city = {
  name: 'Lantern District', sub: 'Downtown blocks and back alleys', sky: [0, '#03050f', 0.5, '#101a36', 0.8, '#2d2a4a', 1, '#6e4a50'], fog: '#3b3046', fogD: 0.0031,
  ground: ['#3a3640', '#2b2830'], road: '#34343c', rumble: ['#e2e0d8', '#c8a02a'], lane: '#ece6cf', moonDir: [-0.35, 0.42, -0.84], moonCol: '#ffe6c4',
  hemi: ['#6a5a8a', '#170f14', 0.62], sun: ['#c4aed8', 0.6], k: 0.0055, wet: 0.35, noShrink: true
};
PAL.strip = {
  name: 'Dockside Strip', sub: 'A quarter mile under the cranes', sky: [0, '#030817', 0.5, '#0a1836', 0.82, '#1b3a63', 1, '#3b6a8c'], fog: '#25466b', fogD: 0.0024,
  ground: ['#2a2f37', '#2a2f37'], road: '#3a3e48', rumble: ['#dde2ec', '#b3322c'], lane: '#ebe7d5', moonDir: [0.3, 0.36, -0.88], moonCol: '#cfe3ff',
  hemi: ['#46689a', '#10161f', 0.6], sun: ['#9db8e8', 0.95], k: 0.005, wet: 0.05, open: true
};
const TRACK_NAME = (id) => (PAL[id] || PAL.harbour).name;

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

{
  const R = [10, 49, 10, 5, 0], Lt = [10, 49, 10, -5, 0], st = (n, o) => [0, n, 0, 0, 0, o || {}];
  SECTIONS.city = [st(160), R, st(45), Lt, st(135), Lt, st(45), R, st(155), R, st(130), st(150, { tun: 2 }), st(135), R,
    st(155), Lt, st(85), R, st(215), R, st(125), Lt, st(155), R, st(120), st(120, { tun: 2 }), st(135), R, st(75)];
  SECTIONS.strip = [[0, 900, 0, 0, 0, { gl: 2, gr: 2 }]];
}
// Shortcuts: [from section, its end or start, segments of offset] .. [to section, end or start, offset]. side -1 forks left.
const BRANCHES = {
  city: [
    { name: 'Market Alley', kind: 'alley', side: -1, from: [1, 0, 0], to: [7, 1, 0] },
    { name: 'Rail Yard Cut', kind: 'lot', side: 1, from: [13, 0, -70], to: [13, 1, 70] },
    { name: 'Parking Cut', kind: 'lot', side: 1, from: [19, 0, -70], to: [19, 1, 70] }
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
  pillar: { solid: true, hw: 0.14, hl: 220 },
  // things that break when you drive through them, and the pursuit breakers that fall on the police
  bin: { brk: true, hw: 0.06, hl: 70 }, crate: { brk: true, hw: 0.08, hl: 90 }, cone: { brk: true, hw: 0.04, hl: 50 }, saw: { brk: true, hw: 0.14, hl: 60 },
  stall: { brk: true, hw: 0.22, hl: 260 }, news: { brk: true, hw: 0.07, hl: 80 }, brkr: { breaker: true, hw: 0.3, hl: 420 }, lant: {}
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
  const hillK = id === 'ghat' ? 0.8 : 1, secAt = [];
  SECTIONS[id].forEach((s, k) => {
    let o = s[5] || {}; o = { gl: o.gl, gr: o.gr, tun: o.tun, cliff: o.cliff, sec: k };
    if (id === 'ghat') { o.gl = o.cliff === -1 ? 1 : 0; o.gr = o.cliff === 1 ? 1 : 0; }
    const a = segs.length;
    road(s[0], s[1], s[2], s[3], s[4] * hillK, o);
    secAt.push([a, segs.length]);
  });
  if (!P.open && Math.abs(lastY()) > 1) road(30, 20, 30, 0, -lastY() / SEG, { gl: segs[segs.length - 1].gl, gr: segs[segs.length - 1].gr, sec: 99 });
  const N = segs.length;
  for (let si = 0; si < N; si++) { segs[si].y1 = si ? segs[si - 1].y2 : 0; }
  const startSeg = P.open ? 40 : 2;
  const T = { id, pal: P, segs, n: N, L: N * SEG, name: P.name, defs: DEFS, F: null, M: 0, FS: 2, gantryZ: startSeg * SEG, startSeg, startZ: P.open ? startSeg * SEG : 0, open: !!P.open, sea: null, secAt, branches: [], zones: [], keep: [] };
  buildFrames(T);
  buildBranches(T);
  decorate(T);
  findZones(T);
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
      if (s.gr === 2 && i % 37 === 5 && r() < 0.6) place(s, r() < 0.6 ? 'cone' : 'saw', 1.27 + r() * 0.05);
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
      if (s.tun === 0 && i % 41 === 7 && r() < 0.5) place(s, r() < 0.6 ? 'bin' : 'news', (r() < 0.5 ? -1 : 1) * (1.27 + r() * 0.05));
    } else if (id === 'city') {
      if (i % 24 === 0 && clearAt(T, i, -1.46, 1.5)) place(s, 'lampL', -1.46);
      if (i % 24 === 12 && clearAt(T, i, 1.46, 1.5)) place(s, 'lampR', 1.46);
      for (let side = -1; side <= 1; side += 2) {
        if (s.tun === 2) { if (i % 12 === 0) place(s, 'pillar', side * 1.3); continue; }
        if (i % 18 === (side < 0 ? 0 : 9) && r() < 0.86) { const off = side * (3.7 + r() * 2.6); if (clearAt(T, i, off, 17)) place(s, 'tower' + ((r() * 4) | 0), off); }
        if (i % 22 === (side < 0 ? 4 : 15) && r() < 0.9 && clearAt(T, i, side * 2.2, 10)) place(s, 'shop' + ((r() * 5) | 0), side * (2.18 + r() * 0.06));
        if (Math.abs(s.curve) < 0.5 && r() < 0.03 && clearAt(T, i, side * 1.28, 2)) place(s, r() < 0.5 ? 'bin' : 'crate', side * (1.26 + r() * 0.06));
        if (i % 150 === (side < 0 ? 70 : 145) && Math.abs(s.curve) < 0.5 && clearAt(T, i, side * 1.34, 4)) place(s, 'stall', side * 1.34);
        if (i % 190 === (side < 0 ? 30 : 125) && clearAt(T, i, side * 1.28, 2)) place(s, 'news', side * 1.28);
      }
      if (i % 26 === 13 && s.tun === 0 && clearAt(T, i, 0, 9)) place(s, 'lant', 0);
      if (i % 95 === 50 && s.tun === 0 && Math.abs(s.curve) < 0.5 && clearAt(T, i, 1.66, 2)) place(s, 'sign' + ((r() * 6) | 0), (i % 190 === 50 ? -1 : 1) * 1.66);
    } else if (id === 'strip') {
      s.rail = 3;
      if (i % 20 === 0) place(s, 'lampL', -1.42);
      if (i % 20 === 10) place(s, 'lampR', 1.42);
      for (let side = -1; side <= 1; side += 2) if (i % 14 === (side < 0 ? 3 : 10) && r() < 0.8) place(s, 'cont', side * (2.6 + r() * 0.5));
      if (i % 220 === 90) place(s, 'crane', (i % 440 === 90 ? -1 : 1) * 9.5);
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
  place(segs[T.startSeg], 'gantry', 0);
  for (let i = 0; i < N; i++) if (segs[i].tun === 1) segs[i].rail = 3;
  // pursuit breakers: tall things beside straight road, spread round the lap
  if (!T.open) {
    const want = id === 'city' ? 6 : 3, gap = Math.floor(N / want);
    for (let k = 0; k < want; k++) {
      for (let tries = 0; tries < 60; tries++) {
        const i = (Math.floor(gap * (k + 0.55)) + tries * 7) % N, sg = segs[i];
        if (Math.abs(sg.curve) > 0.6 || sg.tun || i < 60) continue;
        let side = k % 2 ? 1 : -1;
        if (id === 'harbour') side = sg.gr ? 1 : -1;
        if (id === 'ghat' && sg.cliff === side) side = -side;
        if (id === 'harbour' && side < 0 && sg.gl === 0) continue;
        if (!clearAt(T, i, side * 1.5, 5)) continue;
        place(sg, 'brkr', side * 1.5); break;
      }
    }
  }
}

// Is a roadside spot (segment i, lateral offset off in road half widths) clear of every OTHER stretch of road,
// the shortcuts and the cross streets? rad is the object's radius in metres.
function clearAt(T, i, off, rad) {
  frameAt(T, i * SEG + SEG / 2);
  const m = off * HW, x = FR.px + FR.hx * m, z = FR.pz + FR.hz * m;
  const F = T.F, M = T.M, own = Math.round(i / T.FS), need = rad + HW + 1.5;
  for (let j = 0; j < M; j += 2) {
    let dj = Math.abs(j - own); if (!T.open) dj = Math.min(dj, M - dj);
    if (dj < 28) continue;
    const dx = F[j * STRIDE] - x, dz = F[j * STRIDE + 2] - z;
    if (dx * dx + dz * dz < need * need) return false;
  }
  for (let k = 0; k < T.keep.length; k++) {
    const q = T.keep[k], r2 = (q.r + rad) * (q.r + rad), p = q.pts;
    for (let n = 0; n < p.length; n += 2) { const dx = p[n] - x, dz = p[n + 1] - z; if (dx * dx + dz * dz < r2) return false; }
  }
  return true;
}

// The shortcuts: a road of their own between two points of the lap, built as a smooth curve
// from the fork (in the lane on that side) to the merge, with frames like the main road's.
function buildBranches(T) {
  const defs = BRANCHES[T.id]; if (!defs) return;
  const K = T.pal.k, SEGM = SEG * SC;
  defs.forEach((d, bi) => {
    const dA = (T.secAt[d.from[0]][d.from[1]] + d.from[2]) * SEG, dB = (T.secAt[d.to[0]][d.to[1]] + d.to[2]) * SEG, xA = 0.62 * d.side;
    frameAt(T, dA); const A = new THREE.Vector3(FR.px + FR.rx * xA * HW, FR.py, FR.pz + FR.rz * xA * HW), hA = new THREE.Vector3(FR.fx, 0, FR.fz).normalize();
    frameAt(T, dB); const B = new THREE.Vector3(FR.px + FR.rx * xA * HW, FR.py, FR.pz + FR.rz * xA * HW), hB = new THREE.Vector3(FR.fx, 0, FR.fz).normalize();
    const chord = A.distanceTo(B), k = d.kind === 'alley' ? 0.2 : 0.42;
    const c1 = A.clone().addScaledVector(hA, chord * k), c2 = B.clone().addScaledVector(hB, -chord * k);
    const bez = new THREE.CubicBezierCurve3(A, c1, c2, B);
    bez.arcLengthDivisions = 400;
    const len = bez.getLength(), M = Math.max(8, Math.round(len / (SEGM * T.FS)) + 1);
    const sp = bez.getSpacedPoints(M - 1);
    const F = framesFrom(sp, M, false, () => 0);
    const L = (M - 1) * T.FS * SEG, curv = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      const a = Math.max(0, i - 1), b = Math.min(M - 1, i + 1);
      const ha = Math.atan2(F[a * STRIDE + 3], -F[a * STRIDE + 5]), hb = Math.atan2(F[b * STRIDE + 3], -F[b * STRIDE + 5]);
      let dh = hb - ha; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
      curv[i] = dh / ((b - a) * T.FS) / K;
    }
    const br = { id: bi, name: d.name, kind: d.kind, side: d.side, xA, dA, dB, L, M, F, FS: T.FS, curv, ratio: (dB - dA) / L, lenM: len, props: [] };
    const pts = []; for (let i = 0; i < M; i += 2) pts.push(F[i * STRIDE], F[i * STRIDE + 2]);
    T.keep.push({ pts, r: 0.62 * HW + 3.5, branch: bi });
    T.branches.push(br);
    // knock-over clutter down the alley, kept off the racing line
    const r = rng(500 + bi * 31);
    for (let s2 = 30 / SC; s2 < L - 30 / SC; s2 += (16 + r() * 22) / SC) {
      if (r() < 0.55) br.props.push({ bs: s2, x: (r() < 0.5 ? -1 : 1) * (0.32 + r() * 0.16), key: d.kind === 'alley' ? (r() < 0.5 ? 'crate' : 'bin') : (r() < 0.6 ? 'cone' : 'saw'), hit: -9, broken: 0 });
    }
  });
  // cross streets at every corner and halfway along long blocks (look only, they lead to more of the city)
  T.stubs = [];
  if (T.id === 'city') {
    const add = (d, dirSign, side, len) => {
      frameAt(T, d);
      let ox = FR.px, oz = FR.pz, ux, uz;
      if (side) { ux = FR.hx * side; uz = FR.hz * side; ox += ux * HW; oz += uz * HW; } else { ux = FR.fx * dirSign; uz = FR.fz * dirSign; const l = Math.hypot(ux, uz); ux /= l; uz /= l; }
      const mid = [ox + ux * len * 0.5, oz + uz * len * 0.5], end = [ox + ux * len, oz + uz * len];
      for (let k = 0; k < T.keep.length; k++) if (T.keep[k].branch != null) {
        const p = T.keep[k].pts;
        for (let n = 0; n < p.length; n += 2) { const a = Math.hypot(p[n] - mid[0], p[n + 1] - mid[1]), b = Math.hypot(p[n] - end[0], p[n + 1] - end[1]); if (a < 14 || b < 14) return; }
      }
      T.stubs.push({ x: ox, z: oz, y: FR.py, ux, uz, len });
      const pts = []; for (let t = 0.25; t <= 1.001; t += 0.125) pts.push(ox + ux * len * t, oz + uz * len * t);
      T.keep.push({ pts, r: 9 });
    };
    SECTIONS.city.forEach((sc, k) => {
      const a = T.secAt[k][0] * SEG, b = T.secAt[k][1] * SEG;
      if (sc[3] !== 0) { add(a, 1, 0, 52); add(b, -1, 0, 52); }
      else if (sc[1] >= 150 && !(sc[5] && sc[5].tun)) { const mdl = (a + b) / 2; add(mdl, 0, -1, 44); add(mdl, 0, 1, 44); }
    });
  }
}

// Cool-down spots: anywhere the road is covered, plus named places on tracks with none.
function findZones(T) {
  const segs = T.segs, N = T.n, name = { city: 'the underpass', neon: 'the flyover', ghat: 'the tunnel', harbour: 'the container yard' }[T.id] || 'cover';
  let a = -1;
  const test = (sg) => sg.tun > 0 || (T.id === 'harbour' && sg.gr === 2 && sg.gl === 0);
  for (let i = 0; i <= N; i++) {
    const on = i < N && test(segs[i]);
    if (on && a < 0) a = i;
    if (!on && a >= 0) { if (i - a > 30) T.zones.push({ d0: a * SEG, d1: i * SEG, name }); a = -1; }
  }
}

// Reusable output of frameAt().
const FR = { px: 0, py: 0, pz: 0, fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, hx: 1, hy: 0, hz: 0, bank: 0, curve: 0 };
const STRIDE = 16;

function buildFrames(T) {
  if (T.open) return buildOpenFrames(T);
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
    T.minD = minD;
    if (minD > 55 || P.noShrink) break;
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

// A straight (or gently bending) road that does not close: the drag strip.
function buildOpenFrames(T) {
  const n = T.n, segs = T.segs, SEGM = SEG * SC, K = T.pal.k;
  const pts = []; let h = 0, x = 0, z = 0;
  for (let i = 0; i < n; i++) { pts.push([x, z]); x += Math.sin(h) * SEGM; z -= Math.cos(h) * SEGM; h += K * segs[i].curve; }
  const ctl = [];
  for (let i = 0; i < n; i += 3) ctl.push(new THREE.Vector3(pts[i][0], segs[i].y1 * SC, pts[i][1]));
  ctl.push(new THREE.Vector3(x, segs[n - 1].y2 * SC, z));
  const curve = new THREE.CatmullRomCurve3(ctl, false, 'centripetal');
  curve.arcLengthDivisions = Math.max(600, n);
  const M = Math.floor(n / T.FS);
  const sp = curve.getSpacedPoints(M - 1);
  T.M = M; T.curve3 = curve; T.pathLen = curve.getLength(); T.minD = 1e9;
  T.F = framesFrom(sp, M, false, () => 0);
}
// Frames (position, forward, right, up, horizontal right, bank) along a list of points.
function framesFrom(sp, M, loop, bankAt) {
  const F = new Float32Array(M * STRIDE);
  const up = new THREE.Vector3(0, 1, 0), f = new THREE.Vector3(), rh = new THREE.Vector3(), u0 = new THREE.Vector3();
  for (let i = 0; i < M; i++) {
    const a = sp[loop ? (i + M - 1) % M : Math.max(0, i - 1)], b = sp[loop ? (i + 1) % M : Math.min(M - 1, i + 1)], c = sp[i];
    f.subVectors(b, a).normalize();
    rh.crossVectors(f, up).normalize();
    u0.crossVectors(rh, f).normalize();
    const bank = bankAt(i), cb = Math.cos(bank), sb = Math.sin(bank), o = i * STRIDE;
    F[o] = c.x; F[o + 1] = c.y; F[o + 2] = c.z;
    F[o + 3] = f.x; F[o + 4] = f.y; F[o + 5] = f.z;
    F[o + 6] = rh.x * cb - u0.x * sb; F[o + 7] = rh.y * cb - u0.y * sb; F[o + 8] = rh.z * cb - u0.z * sb;
    F[o + 9] = u0.x * cb + rh.x * sb; F[o + 10] = u0.y * cb + rh.y * sb; F[o + 11] = u0.z * cb + rh.z * sb;
    F[o + 12] = rh.x; F[o + 13] = rh.y; F[o + 14] = rh.z;
    F[o + 15] = bank;
  }
  return F;
}

// Fill FR with the frame of the road at distance z (world units along the lap).
function frameAt(T, z) { return frameAtF(T.F, T.M, T.L, T.FS, z, T.open); }
function frameAtF(F, M, L, FS, z, open) {
  const u = (open ? clamp(z, 0, L - 1) : mod(z, L)) / SEG / FS;
  const i0 = Math.min(M - 1, Math.floor(u)) % M, i1 = open ? Math.min(M - 1, i0 + 1) : (i0 + 1) % M, t = u - Math.floor(u);
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
const TRAFFIC = { harbour: 26, neon: 40, ghat: 0, city: 34, strip: 0 };

const PLAN = { tx: 0, vcap: 1, slow: 1e9, avoid: 0 };
let racerId = 0;
let ARC = null, Wd = null, BESTS = {};

const wrapD = (a, L) => mod(a + L / 2, L) - L / 2;

function mkRacer(o) {
  const k = o.k || KINDS[o.kind];
  return {
    id: ++racerId, name: o.name, kind: o.kind, k, hex: o.hex, isPlayer: !!o.isPlayer, isTraffic: !!o.isTraffic, isCop: !!o.isCop,
    dist: o.dist || 0, x: o.x || 0, vx: 0, speed: o.speed || 0, vmax: o.vmax || BASE_MAX * (k.top || 1), skill: o.skill || 0.5, pref: o.pref || 0, rb: 1,
    finished: false, finT: 0, lapIdx: Math.floor((o.dist || 0) / 1e9), lapT0: 0, lapTimes: [], bestLap: Infinity, z: 0, brake: false, ghost: false, nmT: -9, block: 0,
    mind: o.isPlayer || o.isTraffic || o.isCop ? null : mkMind(), emo: null, br: -1, bs: 0, brBase: 0, wantBr: -1, slip: 0, drift: 0, nitroOn: false, boss: !!o.boss
  };
}
function placeCar(T, c) { c.z = mod(c.dist, T.L); }
const gridSlot = (slot) => ({ dist: -(Math.floor(slot / 2) * 1500 + 800), x: slot % 2 ? 0.36 : -0.36 });
const DRAG_LEN = Math.round(402 / SC);   // a quarter mile, in world units
const DRAG_NAMES = ['Tamsin', 'Okoro', 'Lio', 'Bhav', 'Reyes', 'Juno'];
let SAVE = null;

/* ------------------------------------------------------------ the road a car is on: the lap, or a shortcut */
const brFrame = (B, s) => frameAtF(B.F, B.M, B.L, B.FS, s, true);
// Set FR for the point `off` world units ahead of car c along ITS road; returns the lateral shift to add to c.x.
function pathFrame(W, c, off) {
  if (!(c.br >= 0)) { frameAt(W.T, c.dist + off); return 0; }
  const B = W.T.branches[c.br], s = c.bs + off;
  if (s < 0) { frameAt(W.T, B.dA + s); return B.xA; }
  if (s > B.L) { frameAt(W.T, B.dB + s - B.L); return B.xA; }
  brFrame(B, s); return 0;
}
// How far car b is ahead of car a along the road they share; huge when they are on different roads.
function gapZ(W, a, b) {
  if (a.br !== b.br) return 1e9;
  if (a.br >= 0) return b.bs - a.bs;
  return wrapD(b.dist - a.dist, W.T.L);
}
// Move a car along its road, taking or leaving a shortcut where the road forks.
function advance(W, c, ds) {
  const T = W.T;
  if (c.br >= 0) {
    const B = T.branches[c.br];
    c.bs += ds;
    if (c.bs >= B.L) { c.dist = c.brBase + B.dB + (c.bs - B.L); c.x += B.xA; if (c.isPlayer) c.xCam += B.xA; c.br = -1; c.bs = 0; c.wantBr = -1; }
    else c.dist = c.brBase + B.dA + c.bs * B.ratio;
    return;
  }
  const before = c.dist; c.dist += ds;
  if (!T.branches.length || T.open || ds <= 0) return;
  const z0 = mod(before, T.L), z1 = z0 + ds;
  for (let b = 0; b < T.branches.length; b++) {
    const B = T.branches[b];
    if (z0 < B.dA && z1 >= B.dA) {
      const side = B.side < 0 ? c.x < -0.3 : c.x > 0.3;
      if (c.isPlayer ? side : (c.wantBr === b && (B.side < 0 ? c.x < -0.12 : c.x > 0.12))) {
        c.br = b; c.brBase = before - z0; c.bs = z1 - B.dA; c.x -= B.xA; if (c.isPlayer) c.xCam -= B.xA;
        c.dist = c.brBase + B.dA + c.bs * B.ratio;
        if (c.isPlayer && W && !W.attract) { ARC.toast(B.name, 'Shortcut', 1300); ARC.haptic('tap', 0.4); }
      }
      c.wantBr = -1;
      return;
    }
  }
}
// The bend under a car right now, in the track's curve units.
function curveUnder(W, c) {
  if (c.br >= 0) { const B = W.T.branches[c.br]; return B.curv[clamp(Math.round(c.bs / SEG / B.FS), 0, B.M - 1)]; }
  return W.T.segs[(mod(c.dist, W.T.L) / SEG) | 0].curve;
}

function newWorld(cfg) {
  const T = getTrack(cfg.track), segs = T.segs;
  for (let i = 0; i < T.n; i++) { const s = segs[i]; for (let j = 0; j < s.spr.length; j++) { const sp = s.spr[j]; sp.hit = -9; if (sp.bk) sp.bk.broken = false; if (sp.br) { sp.br.used = false; sp.br.blockT = 0; } } }
  T.branches.forEach((B) => B.props.forEach((p) => { p.hit = -9; if (p.bk) p.bk.broken = false; }));
  racerId = 0;
  const mode = cfg.mode || 'race', attract = !!cfg.attract, ev = cfg.event || null;
  const laps = cfg.laps || (mode === 'drift' ? 2 : LAPS);
  const W = {
    T, cfg, attract, mode, ev, diff: DIFF[cfg.diff] || DIFF.pro, phase: attract ? 'racing' : 'countdown', laps,
    cd: 0, t: 0, racers: [], rivals: [], traffic: [], cops: [], obst: [], order: [], P: null, shake: 0, fov: 84, endT: 0, bannerT: 0, banner: '', flash: 0,
    rbT: 0, lastBeep: -1, sq: 0, scr: 0, nitroSnd: 0, results: null, over: false, goT: 0, sparksT: 0, lastBeepOk: true, hintT: 0,
    startD: mode === 'drag' ? T.startZ : 0, raceLen: 0, police: null, drift: null, drag: null, ghost: null, earn: { props: 0, propsN: 0 }, top: 0, cut: null, msg: null, msgT: 0
  };
  W.raceLen = mode === 'sprint' ? Math.round(T.L * 0.86 / SEG) * SEG : mode === 'drag' ? W.startD + DRAG_LEN : mode === 'pursuit' ? Infinity : laps * T.L;
  const save = SAVE || MX.newSave(), carKind = KINDS[cfg.car] && PLAYER_KINDS.indexOf(cfg.car) >= 0 ? cfg.car : 'kestrel';
  const cs = MX.carSave(save, carKind), st = MX.statsFor(KINDS[carKind], cs.up);
  const hex = colorHex(cs.paint), P = mkRacer({ name: 'You', kind: carKind, hex, isPlayer: true, k: Object.assign({}, KINDS[carKind], st) });
  P.look = cs; P.nmax = st.nmax; P.npow = st.npow;
  P.nitro = 35; P.nitroOn = false; P.steerIn = 0; P.rpm = 0.2; P.gear = 1; P.xCam = 0; P.drift = 0; P.cleanT = 0; P.draft = 0; P.hitCd = 0; P.lean = 0; P.thr = 0;
  P.lapT0 = 0; P.started = false; P.crashLog = { car: 0, obj: 0, wall: 0, edge: 0 }; P.crashes = 0; P.nearMisses = 0; P.nLatch = 0; P.brLatch = 0; P.yaw = 0; P.pitch = 0; P.roll = 0;
  P.hb = 0; P.hbLatch = 0; P.flat = 0; P.shiftLatch = 0;
  W.P = P; W.racers.push(P);
  const withRivals = attract || mode === 'race' || mode === 'sprint';
  if (withRivals) {
    const pool = RIVAL_HEX.filter((h) => h !== hex), pslot = ev && ev.boss ? Math.min(W.diff.slot, 3) : W.diff.slot;
    const nRiv = ev && ev.rivals ? ev.rivals : RIVALS.length;
    let slot = 0;
    for (let idx = 0; idx < nRiv; idx++) {
      let rv = RIVALS[idx % RIVALS.length];
      const isBoss = !!(ev && ev.boss && idx === 0 && !attract);
      if (isBoss) { const b = ev.crew.boss; rv = { name: b.name, skill: b.skill, kind: b.kind, pref: -0.1, hex: b.hex }; }
      if (slot === pslot) slot++;
      const g = gridSlot(slot); slot++;
      const vf = W.diff.base + W.diff.span * Math.min(1.1, rv.skill) + (isBoss ? 0.02 : 0);
      const r = mkRacer({ name: rv.name, kind: rv.kind, hex: rv.hex || pool[idx % pool.length], skill: Math.min(1, rv.skill), pref: rv.pref, dist: g.dist, x: g.x, vmax: BASE_MAX * KINDS[rv.kind].top * vf, boss: isBoss });
      r.block = (W.diff.block && rv.skill > 0.6) || isBoss ? 1 : 0;
      if (isBoss) { W.boss = r; r.mind.form = Math.max(r.mind.form, 1.0); }
      W.racers.push(r); W.rivals.push(r);
    }
    const pg = gridSlot(pslot); P.dist = pg.dist; P.x = pg.x;
  } else if (mode === 'drag') {
    P.dist = W.startD; P.x = -0.45;
    const rs = ev ? 0.55 + 0.2 * ['rookie', 'pro', 'legend'].indexOf(cfg.diff) : 0.6 + 0.15 * ['rookie', 'pro', 'legend'].indexOf(cfg.diff);
    const rk = ['kestrel', 'rook', 'vanta', 'sable', 'halcyon'][(rng(cfg.diff.length * 7 + (ev ? ev.id.length : 3))() * 5) | 0];
    const r = mkRacer({ name: DRAG_NAMES[((ev ? ev.ci : 0) * 2 + cfg.diff.length) % DRAG_NAMES.length], kind: rk, hex: RIVAL_HEX[(cfg.diff.length + 2) % RIVAL_HEX.length], skill: clamp(rs, 0.4, 1), dist: W.startD, x: 0.45, vmax: BASE_MAX * KINDS[rk].top * (0.93 + 0.05 * ['rookie', 'pro', 'legend'].indexOf(cfg.diff)) });
    r.drag = { gear: 1, rpm: 0.2, err: 0, boost: 0, bog: 0, launched: false };
    W.racers.push(r); W.rivals.push(r);
  } else if (mode === 'pursuit') { P.dist = 3000; P.x = 0.1; }
  else { P.dist = -800; P.x = 0; }
  const tf = attract ? 1 : mode === 'time' ? 0.4 : mode === 'drift' ? 0 : mode === 'drag' ? 0 : mode === 'pursuit' ? 1.1 : 1;
  const tc = Math.round((TRAFFIC[cfg.track] || 0) * tf);
  const perLane = [0, 0, 0, 0], r2 = rng(1234 + cfg.track.length * 17);
  for (let i = 0; i < tc; i++) perLane[i % 4]++;
  let tIdx = 0;
  for (let ln = 0; ln < 4; ln++) {
    for (let j = 0; j < perLane[ln]; j++) {
      let zz = (j + 0.5 + (r2() - 0.5) * 0.5) * T.L / perLane[ln];
      if (zz > T.L - 9000) zz = T.L - 9000 - r2() * 1500;
      if (zz < 2600) zz += 4200;
      if (mode === 'pursuit' && Math.abs(zz - P.dist) < 6000) zz += 9000;
      const kind = CIV_KINDS[(r2() * CIV_KINDS.length) | 0];
      const tr = mkRacer({ name: 'civ', kind, hex: CIV_HEX[(r2() * CIV_HEX.length) | 0], isTraffic: true, dist: zz, x: LANE_X[ln], speed: LANE_V[ln], vmax: LANE_V[ln] });
      tr.id = 5000 + (tIdx++); W.traffic.push(tr);
    }
  }
  if (attract) {
    P.dist = 2600; P.x = 0.1; P.speed = 6500; P.nitro = 0; P.started = true;
    W.rivals.forEach((r, idx) => { r.dist = P.dist + (idx - 2) * 2200 + 1500; r.speed = 7000; r.x = [-0.4, 0.4, 0, -0.2, 0.3][idx % 5]; });
    W.traffic.forEach((c) => { const dd = wrapD(c.dist - P.dist, T.L); if (Math.abs(dd) < 3500) c.dist += 7000; });
  }
  // the police: a fixed pool of patrol cars that join and leave the chase
  const heat = cfg.heat | 0;
  if (!attract && (heat > 0 || (cfg.cops === 'on' && (mode === 'race' || mode === 'sprint')))) {
    for (let i = 0; i < COP_POOL; i++) {
      const c = mkRacer({ name: MX.UNITS[i % MX.UNITS.length], kind: 'cop', hex: '#0d1426', isCop: true, dist: -1e6, x: 0 });
      c.ghost = true; c.active = false; c.role = 'off'; c.hp = 1; c.unit = MX.UNITS[i % MX.UNITS.length]; c.lights = false; c.wreck = 0; c.ramCd = 0;
      W.cops.push(c);
    }
    W.police = newPolice(W, heat, mode === 'pursuit');
  }
  if (mode === 'drift') W.drift = { score: 0, chain: 0, mult: 1, chainT: 0, idle: 0, best: 0, banks: 0, target: ev && ev.target ? ev.target : Math.round(laps * T.L * 0.02 / 100) * 100 };
  if (mode === 'drag') W.drag = { gear: 1, limT: 0, boost: 0, bog: 0, launch: '', last: '', lastT: 0, perfect: 0, shifts: 0, heat: 0, cooked: false, rev: 0.2 };
  if (mode === 'time') W.ghost = { rec: new Float32Array(3 * 6000), n: 0, recT: 0, lapStart: 0, best: loadGhost(cfg.track, carKind), target: ev && ev.pace ? Math.round(laps * T.L / (BASE_MAX * ev.pace) * 100) / 100 : 0 };
  W.racers.forEach((c) => { c.lapIdx = Math.floor(c.dist / T.L); });
  W.traffic.forEach((c) => placeCar(T, c));
  W.racers.forEach((c) => { if (!c.isPlayer) placeCar(T, c); });
  W.obst = W.rivals.concat(W.traffic, W.cops, [P]);
  W.order = W.racers.slice();
  W.actors = [P].concat(W.rivals, W.cops, W.traffic);
  W.rec = newRecorder(W.actors.length);
  return W;
}

/* ------------------------------------------------------------ AI */
function aiPlan(W, c) {
  const T = W.T, segs = T.segs, N = T.n, L = T.L, si = (mod(c.dist, L) / SEG) | 0;
  if (c.br >= 0) return aiPlanBranch(W, c);
  let sum = 0, cm = 0;
  for (let k = 1; k <= 24; k += 2) { const cv = segs[(si + k) % N].curve; sum += cv; if (k <= 17) { const ac = Math.abs(cv); if (ac > cm) cm = ac; } }
  const lineX = clamp(sum / 12 * 0.3, -0.6, 0.6);
  let tx = lineX * (0.55 + 0.45 * c.skill) + c.pref * (1 - Math.abs(lineX) * 1.2);
  const vcap = 1 - clamp((cm - 2.9) * 0.07 * (1.3 - c.skill * 0.45), 0, 0.3);
  let avoid = 0, slow = 1e9, blocking = false;
  const P = W.P;
  // a shortcut coming up: a rival decides once whether to take it, a cop follows the suspect
  if (T.branches.length && !c.isTraffic) {
    const z = mod(c.dist, L);
    for (let b = 0; b < T.branches.length; b++) {
      const B = T.branches[b], ahead = B.dA - z;
      if (ahead > 0 && ahead < 9000) {
        if (c.brDec !== b) {
          c.brDec = b;
          if (c.isCop) c.wantBr = (P.br === b || (gapZ(W, c, P) > 0 && gapZ(W, c, P) < 1e8 && (B.side < 0 ? P.x < -0.25 : P.x > 0.25))) ? b : -1;
          else if (c.isPlayer) c.wantBr = c.bot && Math.random() < 0.5 ? b : -1;
          else c.wantBr = Math.random() < 0.3 + 0.45 * c.skill ? b : -1;
        }
        if (c.isCop && P.br < 0 && gapZ(W, c, P) > 0 && gapZ(W, c, P) < 1e8) c.wantBr = (B.side < 0 ? P.x < -0.25 : P.x > 0.25) ? b : -1;
        if (c.wantBr === b && ahead < 7000) tx = B.xA * 0.95;
      } else if (c.brDec === b && (ahead < -200 || ahead > 12000)) c.brDec = -1;
    }
  }
  if (!c.isPlayer && c.block && !W.attract && !P.ghost && P.started) {
    const bz = gapZ(W, P, c);
    if (bz > CL + 200 && bz < CL + 2800 && P.speed > c.speed - 900 && Math.sin(W.t * 0.35 + c.id * 1.9) > 0.15) { blocking = true; tx = clamp(P.x, -0.72, 0.72); }
  }
  const ob = W.obst || [];
  for (let j = 0; j < ob.length; j++) {
    const o = ob[j];
    if (o === c || o.ghost || (blocking && o === P) || (c.isCop && o === P) || o.parked && c.isCop) continue;
    const dz = gapZ(W, c, o);
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
// In a shortcut: keep to the middle, a little slower between the walls, around anyone in the way.
function aiPlanBranch(W, c) {
  let avoid = 0, slow = 1e9;
  const ob = W.obst || [];
  for (let j = 0; j < ob.length; j++) {
    const o = ob[j]; if (o === c || o.ghost || o.br !== c.br) continue;
    const dz = o.bs - c.bs; if (dz <= 150 || dz > 4000) continue;
    const dx = o.x - c.x; if (Math.abs(dx) < 0.4) { avoid += (dx > 0 ? -1 : 1) * (1 - dz / 4000); if (dz < 1500) slow = Math.min(slow, o.speed * 0.98); }
  }
  PLAN.tx = 0; PLAN.vcap = 0.88; PLAN.slow = slow; PLAN.avoid = avoid;
}

// A rival is a person behind the wheel: a day that is a little better or worse than usual, a
// moment to react to a car that appears ahead, a braking habit that changes bend to bend, a
// temper when passed, a scare after a near miss, and the odd small mistake (a lift and a run
// wide), more likely with someone in the mirrors. It all averages out, so the race stays fair.
function mkMind() {
  const r = Math.random;
  return { form: 0.978 + r() * 0.038, rx: 0.15 + r() * 0.15, seen: 0, brk: 1, brkT: 0, err: 0, errT: 0, errDir: 0, errK: 0, nextErr: 8 + r() * 16, temper: 0.75 + r() * 0.5, heat: 0, cool: 0, press: 0, rel: 0 };
}
function emote(c, k, t) { if (!c.emo || c.emo.t <= 0) c.emo = { k, t: t || 1.3, d: t || 1.3 }; }
function humanMind(W, c, dt) {
  const m = c.mind, P = W.P, L = W.T.L;
  if (m.heat > 0) m.heat = Math.max(0, m.heat - dt / 9);
  if (m.cool > 0) m.cool = Math.max(0, m.cool - dt / 5);
  if (c.emo && c.emo.t > 0) c.emo.t -= dt;
  const dz = gapZ(W, P, c);
  const press = dz > 300 && dz < 2600 && Math.abs(c.x - P.x) < 0.55 && P.started ? 1 - dz / 2600 : 0;
  m.press += (press - m.press) * Math.min(1, dt * 2);
  if (m.press > 0.5 && Math.random() < dt * 0.45) emote(c, 'look', 0.9);
  // overtakes, both ways
  const rel = dz > 0 ? 1 : -1;
  if (m.rel && rel !== m.rel && Math.abs(dz) < 2500 && !W.attract) { if (rel < 0) { m.heat = 1; emote(c, 'shake', 1.1); } else emote(c, 'fist', 1.1); }
  m.rel = rel;
  m.brkT -= dt;
  if (m.brkT <= 0) { m.brkT = 2.5 + Math.random() * 3; m.brk = 0.9 + Math.random() * 0.2 - m.heat * 0.05; }
  if (m.errT > 0) m.errT -= dt;
  else if (!W.attract && c.speed > BASE_MAX * 0.45) {
    m.nextErr -= dt * (1 + m.press * 1.6 + m.heat * 0.8 + (1 - m.form) * 12);
    if (m.nextErr <= 0) {
      const si = (mod(c.dist, L) / SEG) | 0, cv = c.br >= 0 ? 0 : W.T.segs[(si + 6) % W.T.n].curve;
      m.errT = m.err = 0.5 + Math.random() * 0.7; m.errDir = Math.abs(cv) > 0.5 ? Math.sign(cv) : (Math.random() < 0.5 ? -1 : 1);
      m.errK = 0.14 + Math.random() * 0.2; m.nextErr = 12 + Math.random() * 22;
      if (Math.abs(dz) < 4000) emote(c, 'shake', 1.2);
    }
  }
}

function updateRival(W, c, dt) {
  aiPlan(W, c);
  const m = c.mind;
  if (m) {
    humanMind(W, c, dt);
    if (Math.abs(PLAN.avoid) > 0.05) m.seen += dt; else m.seen = 0;
    if (m.seen < m.rx) PLAN.avoid *= 0.35;
    if (m.errT > 0) PLAN.tx += m.errDir * m.errK * Math.sin(Math.PI * (1 - m.errT / m.err));
    PLAN.vcap *= m.form * (1 + (1 - m.brk) * 0.05) * (1 + m.heat * 0.01 - m.cool * 0.02) * (m.errT > 0 ? 0.95 : 1);
  }
  let tgt = Math.min(c.vmax * c.rb * PLAN.vcap, PLAN.slow);
  if (c.finished) tgt = Math.min(tgt, BASE_MAX * 0.5);
  if (c.speed < tgt) c.speed = Math.min(tgt, c.speed + BASE_MAX * 0.3 * (1.05 - 0.75 * c.speed / BASE_MAX) * c.k.acc * dt);
  else c.speed = Math.max(tgt, c.speed - BASE_MAX * 0.6 * dt);
  c.brake = c.speed > tgt + 250;
  const want = clamp((PLAN.tx - c.x) * 1.7 + PLAN.avoid, -1.1, 1.1);
  c.vx += (want - c.vx) * Math.min(1, dt * (m ? 0.9 / m.rx : 5));
  const xl = c.br >= 0 ? 0.5 : 0.9;
  c.x = clamp(c.x + c.vx * dt, -xl, xl);
  advance(W, c, c.speed * dt);
  // two cars that would sit on top of each other part them sideways
  const ob = W.obst || [];
  for (let j = 0; j < ob.length; j++) {
    const o = ob[j];
    if (o === c || o.isPlayer || o.ghost) continue;
    const dz = gapZ(W, c, o), dxx = c.x - o.x;
    if (Math.abs(dz) < CL * 0.7 && Math.abs(dxx) < 0.2) c.x = clamp(c.x + (dxx >= 0 ? 1 : -1) * dt * 1.4, -0.9, 0.9);
  }
}

function advanceAI(W, dt, rivalsOn) {
  const T = W.T;
  W.t += rivalsOn ? dt : 0;
  for (let i = 0; i < W.traffic.length; i++) { const c = W.traffic[i]; c.dist += c.speed * dt; placeCar(T, c); }
  if (!rivalsOn) { if (W.police) stepPolice(W, dt, true); return; }
  W.rbT -= dt;
  const P = W.P;
  for (let i = 0; i < W.rivals.length; i++) {
    const c = W.rivals[i];
    if (W.rbT <= 0 && !W.attract) {
      const gap = P.dist - c.dist, d = W.diff;
      c.rb = 1 + (gap > 0 ? Math.min(gap / 9000, 1) * d.up : Math.max(gap / 9000, -1) * d.down);
      if (P.ghost) c.rb = 1;
    }
    if (c.drag) updateDragRival(W, c, dt); else updateRival(W, c, dt);
    placeCar(T, c);
    if (!c.finished && !W.attract && c.dist >= W.raceLen) { c.finished = true; c.finT = W.t - (c.dist - W.raceLen) / Math.max(c.speed, 500); }
  }
  if (W.rbT <= 0) W.rbT = 0.3;
  if (W.police) stepPolice(W, dt);
}

/* ------------------------------------------------------------ sound */
const SND = { e1: null, e2: null };
function engineStop() { if (SND.e1) { SND.e1.stop(); SND.e2.stop(); } SND.e1 = SND.e2 = null; if (SND.siren) { SND.siren.stop(); SND.siren = null; } }
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
  const sh = pathFrame(W, c, -back);
  return surf(c.x + sh + dxLane, h, out);
}
function sparksAt(W, side, n, power) {
  if (!FX) return;
  const P = W.P;
  carPoint(W, P, side * 0.13, 0, 0.35, _v);
  const sp = P.speed * SC * 0.55, fx = FR.fx, fy = FR.fy, fz = FR.fz, rx = FR.rx, ry = FR.ry, rz = FR.rz;
  for (let i = 0; i < n; i++) {
    const out = side * (2 + Math.random() * 5) * power, up = 1.5 + Math.random() * 4 * power, back = -(Math.random() * 6);
    FX.spark(_v.x, _v.y, _v.z, fx * (sp + back) + rx * out, fy * (sp + back) + ry * out + up, fz * (sp + back) + rz * out, 0.45 + Math.random() * 0.55, 1, _v.y - 0.33);
  }
}
function crashFx(W, strength, side, kind) {
  const P = W.P;
  P.crashLog[kind || 'car']++;
  if (W.attract) { P.hitCd = 0.35; return; }
  P.cleanT = 0; P.hitCd = 0.35; P.crashes++;
  if (W.drift) loseChain(W);
  if (!ARC.reducedMotion) W.shake = Math.max(W.shake, 6 + strength * 12);
  ARC.haptic(strength > 0.5 ? 'heavy' : 'hit', 0.5 + strength * 0.5);
  if (POST && strength > 0.5) { POST.flash(0.16 + strength * 0.12, '#ffd8b8'); POST.kick(-4); }
  sparksAt(W, side || (Math.random() < 0.5 ? -1 : 1), Math.round(8 + strength * 22), 0.8 + strength * 0.7);
  if (VFX && strength > 0.25) { carPoint(W, P, (side || 0) * 0.12, 0, 0.5, _v); _vq.set(_v.x, _v.y, _v.z); VFX.impact(_vq, _vn, { kind: 'spark', size: 0.8 + strength }); if (strength > 0.5) VFX.dust(_vq, { size: 1 + strength }); }
  ARC.sfx.noise(0.3, { freq: 560, vol: 0.14 + 0.3 * strength });
  ARC.sfx.tone(120, 0.24, { type: 'sawtooth', slide: 42, vol: 0.12 + 0.14 * strength });
}
// launch revs on the line: a backfire pop and a puff of tyre smoke behind the player. It also
// draws every contact effect once before the first real hit, so that hit never pays a first draw.
function revPops(W, step) {
  if (!VFX || W.attract) return;
  const P = W.P, sd = step === 1 ? -1 : 1;
  carPoint(W, P, sd * 0.1, 1500, 0.25, _v); _vq.set(_v.x, _v.y, _v.z);
  VFX.impact(_vq, _vn, { kind: 'spark', size: 0.35 });
  VFX.dust(_vq, { size: 0.7 });
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
  const auto = W.attract || fin || P.bot || W.phase === 'busted', live = !W.attract && !fin, quiet = W.attract;
  const drag = W.mode === 'drag';
  const top = BASE_MAX * K.top * (P.flat > 0 ? 0.62 : 1);
  let steer = 0, gas = false, brake = false, nit = false, hb = false, shift = false;
  const z = mod(P.dist, L), si = (z / SEG) | 0, seg = segs[si], onBr = P.br >= 0, B = onBr ? T.branches[P.br] : null;
  if (auto) {
    aiPlan(W, P);
    const vt = fin || W.phase === 'busted' ? 0 : Math.min(top * (P.bot ? 0.97 : 0.82) * PLAN.vcap, PLAN.slow);
    if (P.bot && !fin) nit = P.nitro > 30 && PLAN.vcap > 0.97 && PLAN.slow > 1e8;
    steer = clamp((PLAN.tx - P.x) * 2.2 + PLAN.avoid * 0.9 - P.vx * 0.3, -1, 1);
    if (fin) steer = clamp(-P.x * 1.4 - P.vx * 0.3, -1, 1);
    gas = !fin && P.speed < vt; brake = !fin && P.speed > vt * 1.06;
    if (drag && P.bot && P.gear < 6 && P.rpm > 0.9 && W.drag && W.drag.lastT > 0.25) shift = true;
    hb = P.hbLatch > 0 || (P.bot && !!W.drift && Math.abs(seg.curve) > 1.8 && Math.abs(P.slip) < 0.15 && P.speed > BASE_MAX * 0.4);
    if (P.bot && W.drift && Math.abs(P.slip) > 0.1) { gas = true; brake = false; if (Math.abs(seg.curve) > 0.8) steer = clamp(steer + Math.sign(P.slip) * 0.3, -1, 1); else steer = clamp(steer - Math.sign(P.slip) * 0.4, -1, 1); }
    if (drag && fin) { gas = false; brake = P.speed > 300; }
  } else {
    const sx = readSteer();
    const g = inp.gesture, gest = ARC.touchMode && ARC.touchStyle !== 'pads';
    brake = inp.down('ArrowDown', 'KeyS') || P.brLatch > 0 || (gest && g.active && g.type !== 'mouse' && g.dy > 46 && g.dy > Math.abs(g.dx) * 0.5);
    gas = inp.down('ArrowUp', 'KeyW') || inp.pointer.down || gest || (W.cfg.auto === 'on' && !brake);
    nit = inp.down('ShiftLeft', 'ShiftRight', 'KeyN') || P.nLatch > 0;
    hb = inp.down('Space') || P.hbLatch > 0 || padButton(4);
    if (drag) {
      const sk = inp.down('ArrowUp', 'KeyW', 'Space', 'KeyE') || padButton(4) || P.shiftLatch > 0;
      shift = sk && !P.shiftHeld; P.shiftHeld = sk; P.shiftLatch = 0;
      hb = false;
      gas = cd ? (inp.down('ArrowUp', 'KeyW', 'Space') || inp.pointer.down || (gest && g.active) || (ARC.touchMode && ARC.touchStyle === 'pads' && inp.down('ArrowUp'))) : true;
      if (fin) { gas = false; brake = true; }
    }
    P.steerIn += (sx - P.steerIn) * Math.min(1, dt * (Math.abs(sx) > 0.01 ? 11 : 15));
    steer = P.steerIn;
  }
  if (P.brLatch > 0) P.brLatch -= dt;
  if (P.hbLatch > 0) P.hbLatch -= dt;
  if (P.flat > 0) { P.flat -= dt; steer += Math.sin(W.t * 9) * 0.08; }
  P.thr += ((gas ? 1 : 0) - P.thr) * Math.min(1, dt * 8);
  const spPct = clamp(P.speed / (BASE_MAX * 0.95), 0, 1.5);
  // nitro
  if (live && racing && nit && P.nitro > 0 && P.speed > 1800 && !(drag && P.gear < 2)) {
    if (!P.nitroOn) {
      P.nitroOn = true;
      if (!W.attract) { ARC.haptic('boost', 1); if (POST) POST.kick(6); }
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
      const dz = gapZ(W, P, o); if (dz > 1e8) continue;
      const adz = Math.abs(dz), adx = Math.abs(o.x - P.x);
      if (dz > CL + 200 && dz < CL + 3800 && adx < 0.26 && o.speed > BASE_MAX * 0.33 && P.speed > BASE_MAX * 0.45) drafting = true;
      if (adz < CL && adx > 0.34 && adx < 0.47 && P.speed > o.speed + 1300 && W.t - o.nmT > 2 && P.hitCd <= 0) {
        o.nmT = W.t; P.nearMisses++; addNitro(W, 13);
        ARC.toast(o.isCop ? 'Slipped past' : 'Near miss', '+ nitro', 700); ARC.haptic('tap', 0.6);
        ARC.sfx.noise(0.18, { filter: 'highpass', freq: 1400, vol: 0.2 });
      }
    }
  }
  P.draft += ((drafting ? 1 : 0) - P.draft) * Math.min(1, dt * 4);
  if (drafting) addNitro(W, 9 * dt);
  if (racing && live && P.cleanT > 2.2 && spPct > 0.55) addNitro(W, 2.4 * dt);
  // speed
  const offroad = !onBr && Math.abs(P.x) > 1.12 && !(seg.rail & (P.x < 0 ? 1 : 2));
  if (drag) dragDrive(W, dt, gas, shift, cd, fin, top);
  else if (cd) { P.speed = 0; }
  else {
    let a = 0;
    const topCap = top * (P.nitroOn ? 1.34 * P.npow : 1) * (1 + 0.045 * P.draft);
    if (fin || W.phase === 'busted') { a = -BASE_MAX * 0.3; }
    else if (brake) a = -BASE_MAX * (0.85 + 0.2 * K.grip) * (K.brk || 1);
    else if (gas) a = BASE_MAX * 0.26 * K.acc * clamp(1.05 - 0.8 * (P.speed / top), 0.05, 1.1) * (spPct < 0.12 ? 0.75 + spPct * 2 : 1);
    else a = -BASE_MAX * (0.07 + 0.1 * spPct);
    if (P.nitroOn) a += BASE_MAX * 0.6 * P.npow;
    if (P.flat > 0 && P.speed > top) a = Math.min(a, -BASE_MAX * 0.4);
    P.speed += a * dt;
    if (P.speed > topCap) P.speed -= (P.speed - topCap) * Math.min(1, dt * 2.6);
    if (offroad && P.speed > top * 0.3) P.speed -= BASE_MAX * 0.55 * dt;
    if (P.speed < 0) P.speed = 0;
  }
  P.brake = brake || (fin && P.speed > 500);
  // steering, bends and the handbrake
  const curve = cd ? 0 : (onBr ? curveUnder(W, P) : seg.curve);
  const auth = Math.min(1, spPct * 5) * (1.05 - 0.3 * Math.min(1, spPct));
  const maxLat = (drag ? 0.9 : 2.1) * K.grip * auth;
  P.vx += (steer * maxLat - P.vx) * (1 - Math.exp(-dt * 8 * K.grip));
  // the slide: the handbrake (or a hard lift and turn at speed) swings the tail out; throttle and steering hold it
  let slipT = 0;
  if (!drag && !cd && spPct > 0.3) {
    const dir = Math.abs(steer) > 0.2 ? Math.sign(steer) : (Math.abs(curve) > 0.6 ? Math.sign(curve) : Math.sign(P.slip || P.vx || 1));
    if (hb) { P.hb = 0.45; if (P.speed > 2000) P.speed -= BASE_MAX * 0.18 * dt; }
    if (P.hb > 0) { P.hb -= dt; slipT = dir * (0.36 + 0.24 * Math.abs(steer)) * (K.drift || 1); }
    else if (Math.abs(P.slip) > 0.1 && gas) slipT = Math.sign(P.slip) * clamp((0.2 + 0.32 * (Math.sign(steer) === Math.sign(P.slip) ? Math.abs(steer) : -Math.abs(steer) * 0.6) + Math.abs(curve) * 0.04) * (K.drift || 1), 0, 0.62);
  }
  P.slip += (slipT - P.slip) * Math.min(1, dt * (Math.abs(slipT) > Math.abs(P.slip) ? 5 : 2.4));
  const slipK = Math.abs(P.slip);
  if (slipK > 0.08) P.speed -= P.speed * slipK * 0.22 * dt;
  let push = 2 * CENT * curve * spPct * spPct / Math.pow(K.grip, 0.75);
  if (slipK > 0.1 && Math.sign(P.slip) === Math.sign(curve)) push *= 1 - Math.min(0.85, slipK * 1.6);
  if (cd) push = 0;
  P.x += (P.vx - push) * dt;
  const slide = Math.abs(push) / (maxLat + 0.5) + (brake && spPct > 0.6 ? 0.35 * Math.abs(steer) : 0) + (Math.abs(steer) > 0.75 && spPct > 0.8 ? 0.2 : 0);
  P.drift += ((spPct > 0.5 && slide > 0.5 ? clamp(slide, 0, 1) : 0) - P.drift) * Math.min(1, dt * 7);
  if (slipK > 0.12 && spPct > 0.3) P.drift = Math.max(P.drift, clamp(slipK / 0.42, 0, 1));
  if (P.drift > 0.5 && spPct > 0.4 && !offroad) {
    W.sq -= dt;
    if (W.sq <= 0) { W.sq = 0.085; if (!quiet) ARC.sfx.noise(0.1, { filter: 'bandpass', freq: 2300 + Math.random() * 500, vol: 0.05 + 0.09 * P.drift }); }
    if (!ARC.reducedMotion && FX && Math.random() < 0.7) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      carPoint(W, P, sd * 0.11, 1500, 0.2, _v);
      FX.smoke(_v.x, _v.y, _v.z, FR.rx * sd * 0.6, 0.5 + Math.random() * 0.8, FR.fz * 0, 0.9, 1.1 + Math.random() * 0.9, 0);
    }
  }
  if (P.drift > 0.5) P.cleanT = Math.min(P.cleanT, 1.2);
  if (W.drift && racing && live) driftScore(W, dt, offroad);
  // walls and the edge of the world
  if (onBr) {
    const lim = 0.52;
    if (P.x < -lim || P.x > lim) { const sd = P.x < 0 ? -1 : 1; P.x = sd * lim; P.vx = 0; if (B.kind === 'alley') wallScrape(W, sd, dt); else { P.speed = Math.max(0, P.speed - BASE_MAX * 0.3 * dt); } }
  } else {
    const lim = 1.11;
    if ((seg.rail & 1) && P.x < -lim) { P.x = -lim; P.vx = Math.max(P.vx, 0); wallScrape(W, -1, dt); }
    else if ((seg.rail & 2) && P.x > lim) { P.x = lim; P.vx = Math.min(P.vx, 0); wallScrape(W, 1, dt); }
    if (P.x < -2.75 || P.x > 2.75) { const sd = P.x < 0 ? -1 : 1; P.x = sd * 2.75; P.vx = 0; P.speed *= 0.8; if (P.hitCd <= 0) crashFx(W, 0.5, sd, 'edge'); }
  }
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
  advance(W, P, P.speed * dt);
  if (P.speed > W.top) W.top = P.speed;
  P.hitCd -= dt;
  if (!cd && P.speed > 1500 && !offroad && !P.nitroOn) P.cleanT += dt;
  // roadside objects (a long object is hit along its whole length), things that break, pursuit breakers
  if (P.br < 0) {
    const zNow = mod(P.dist, L), si2 = (zNow / SEG) | 0;
    for (let sj = -3; sj <= 14; sj++) {
      const sg = segs[(si2 + sj + T.n) % T.n];
      for (let i = 0; i < sg.spr.length; i++) {
        const sp = sg.spr[i], dd = T.defs[sp.key];
        if (!(dd.solid || dd.brk || dd.breaker) || W.t - sp.hit < 0.7) continue;
        const oz = sg.i * SEG + SEG / 2;
        if (Math.abs(wrapD(oz - zNow, L)) > dd.hl + 520) continue;
        if (dd.brk) { if (!sp.bk || !sp.bk.broken) { if (Math.abs(P.x - sp.off) < dd.hw + CAR_HALF) { sp.hit = W.t; breakProp(W, sp.bk, sp.off); } } continue; }
        if (dd.breaker) {
          const br = sp.br; if (!br || br.used) continue;
          const near = sp.off < 0 ? P.x < -0.92 : P.x > 0.92;
          if (near && W.police && W.police.active && P.speed > BASE_MAX * 0.3) { sp.hit = W.t; triggerBreaker(W, br); continue; }
          if (!(Math.abs(P.x - sp.off) < dd.hw + CAR_HALF)) continue;
        }
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
  } else {
    const props = T.branches[P.br].props;
    for (let i = 0; i < props.length; i++) {
      const pr = props[i]; if (!pr.bk || pr.bk.broken) continue;
      if (Math.abs(pr.bs - P.bs) < 420 && Math.abs(pr.x - P.x) < T.defs[pr.key].hw + CAR_HALF) breakProp(W, pr.bk, pr.x);
    }
  }
  // spike strips
  if (W.police) spikeCheck(W, P, before);
  // other cars
  if (!cd) {
    for (let i = 0; i < W.obst.length; i++) {
      const o = W.obst[i]; if (o === P || o.ghost) continue;
      const dz2 = gapZ(W, P, o);
      if (Math.abs(dz2) > CL) continue;
      const dx2 = P.x - o.x, adx2 = Math.abs(dx2);
      if (adx2 >= 0.34) continue;
      const rel = Math.abs(P.speed - o.speed), stt = clamp(rel / 8000, 0.1, 1);
      if (dz2 > 250 && P.speed >= o.speed - 300) {
        P.dist += (dz2 - (CL + 10)) * 0.6; if (P.br >= 0) P.bs += (dz2 - (CL + 10)) * 0.6;
        P.speed = Math.max(o.speed * 0.9, P.speed * (o.role === 'block' ? 0.3 : 0.5));
        if (!o.isTraffic && !o.parked) o.speed = Math.min(o.speed * 1.0 + 300, o.vmax * 1.05);
      } else if (dz2 < -250) {
        if (o.isCop) { P.speed *= 0.94; P.vx += (dx2 >= 0 ? 1 : -1) * 0.8; }
        else { o.speed = Math.max(0, o.speed * 0.92); P.speed = Math.min(P.speed * 1.02 + 200, top * 1.2); }
      } else {
        P.speed *= 0.97;
      }
      let dir = dx2 >= 0 ? 1 : -1; if (adx2 < 0.02) dir = P.x > 0 ? -1 : 1;
      const ov = 0.34 - adx2;
      P.x += dir * ov * 0.6; P.vx = dir * 0.9;
      if (!o.isTraffic && !o.parked) { o.x = clamp(o.x - dir * ov * 0.5, -0.9, 0.9); o.vx = -dir * 0.9; if (o.mind && P.hitCd <= 0) { o.mind.cool = 1; o.mind.errT = 0; emote(o, 'shake', 1.4); } }
      if (o.isCop && P.hitCd <= 0) { copHit(W, o, stt); o.ramCd = 2.5; }
      if (P.hitCd <= 0) { P.nitroOn = false; P.nLatch = 0; crashFx(W, stt, dir); }
    }
  }
  // camera follows the car a little late, so the car slides on screen
  P.xCam += (P.x - P.xCam) * Math.min(1, dt * 6.5);
  P.lean += (clamp(P.vx * 0.045 - push * 0.03, -0.14, 0.14) - P.lean) * Math.min(1, dt * 8);
  // engine
  if (!drag) {
    const gr = gearOf(P.speed, top * (P.nitroOn ? 1.2 : 1));
    let rpmT = P.speed > 80 ? gr.rpm : 0.2 + 0.55 * P.thr;
    if (cd) rpmT = 0.2 + 0.6 * P.thr;
    P.rpm += (rpmT - P.rpm) * Math.min(1, dt * (rpmT < P.rpm ? 7 : 11));
    if (gr.g !== P.gear) {
      if (P.speed > 800 && !cd && !quiet) { ARC.sfx.tone(150, 0.07, { type: 'square', vol: 0.05 }); if (gr.g > P.gear && P.thr < 0.4 && Math.random() < 0.5) ARC.sfx.noise(0.06, { freq: 700, vol: 0.12 }); }
      P.gear = gr.g;
    }
  }
  engineSet(P.rpm, P.thr, P.nitroOn);
  // field of view kick
  const fovT = 84 + (ARC.reducedMotion ? 0 : spPct * 8 + (P.nitroOn ? 16 : 0));
  W.fov += (fovT - W.fov) * Math.min(1, dt * 3.5);
  return before;
}

// Controller buttons the shell does not map (the bumpers): read straight from the pad, once a frame.
let PAD_F = -1, PAD_B = 0, PAD_PREV = 0;
function padButton(i, edge) {
  if (PAD_F !== ARC.frame) {
    PAD_F = ARC.frame; PAD_PREV = PAD_B; PAD_B = 0;
    if (ARC.gamepad) {
      try { const ps = navigator.getGamepads ? navigator.getGamepads() : null; if (ps) for (let k = 0; k < ps.length; k++) { const p = ps[k]; if (!p || !p.buttons) continue; for (let b = 4; b <= 5; b++) if (p.buttons[b] && p.buttons[b].pressed) PAD_B |= 1 << b; } } catch (e) { /* no pads */ }
    }
  }
  const on = !!(PAD_B & (1 << i));
  return edge ? on && !(PAD_PREV & (1 << i)) : on;
}

/* ------------------------------------------------------------ drag racing: a gearbox you work yourself */
const DRAG_GT = [0, 0.27, 0.44, 0.6, 0.75, 0.88, 1.0], DRAG_MUL = [0, 1.5, 1.24, 1.04, 0.88, 0.76, 0.66];
const dragTq = (r) => (r < 0.3 ? 0.62 : r < 0.92 ? 0.62 + 0.38 * (r - 0.3) / 0.62 : Math.max(0.2, 1 - (r - 0.92) * 3));
function judgeShift(r) { return r >= 0.88 && r < 0.99 ? 2 : r >= 0.76 && r < 0.88 ? 1 : r < 0.76 ? 0 : -1; }
function dragMsg(W, text, good) { const D = W.drag; if (!D) return; D.last = text; D.lastGood = good; D.msgT = 1.4; }
function dragDrive(W, dt, gas, shift, cd, fin, top) {
  const P = W.P, D = W.drag, K = P.k;
  D.lastT += dt; if (D.msgT > 0) D.msgT -= dt;
  if (cd) {
    D.rev += ((gas ? 1.0 : 0.16) - D.rev) * Math.min(1, dt * (gas ? 2.4 : 4));
    P.rpm = clamp(D.rev + (gas && D.rev > 0.95 ? Math.sin(W.cd * 60) * 0.03 : 0), 0, 1.05); P.speed = 0; P.gear = 1; P.thr = gas ? 1 : 0;
    return;
  }
  if (!D.launch) {
    const r = W.attract || P.bot ? 0.66 : D.rev;
    if (r >= 0.55 && r <= 0.82) { D.launch = 'Perfect launch'; D.boost = 1.0; D.perfect++; dragMsg(W, 'Perfect launch', 2); ARC.haptic('success', 0.6); }
    else if (r > 0.82) { D.launch = 'Wheelspin'; D.spin = 0.9; dragMsg(W, 'Too many revs: wheelspin', 0); }
    else { D.launch = 'Slow launch'; D.bog = 0.8; dragMsg(W, 'Not enough revs', 0); }
  }
  const gt = DRAG_GT[P.gear] * top;
  P.rpm = clamp(Math.max(0.24, P.speed / gt), 0, 1.06);
  if (shift && P.gear < 6 && !fin) {
    const q = judgeShift(P.rpm);
    if (q === 2) { D.boost = 0.55; D.perfect++; addNitro(W, 7); dragMsg(W, 'Perfect shift', 2); ARC.haptic('tap', 0.8); ARC.sfx.tone(880, 0.08, { type: 'triangle', vol: 0.12 }); }
    else if (q === 1) dragMsg(W, 'Good shift', 1);
    else if (q === 0) { D.bog = 0.45; dragMsg(W, 'Early shift', 0); }
    else { D.bog = 0.18; dragMsg(W, 'Late shift', 0); }
    P.gear++; D.lastT = 0; D.shifts++;
    ARC.sfx.noise(0.07, { freq: 900, vol: 0.14 });
    P.rpm = clamp(Math.max(0.24, P.speed / (DRAG_GT[P.gear] * top)), 0, 1.06);
  }
  let a = BASE_MAX * 0.36 * K.acc * DRAG_MUL[P.gear] * dragTq(P.rpm);
  if (D.boost > 0) { D.boost -= dt; a *= 1.28; }
  if (D.bog > 0) { D.bog -= dt; a *= 0.55; }
  if (D.spin > 0) {
    D.spin -= dt; a *= 0.6;
    if (FX && !ARC.reducedMotion && Math.random() < 0.8) { const sd = Math.random() < 0.5 ? -1 : 1; carPoint(W, P, sd * 0.11, 1500, 0.2, _v); FX.smoke(_v.x, _v.y, _v.z, sd * 0.8, 0.6 + Math.random(), 0, 1.0, 1.3, 0); }
  }
  if (D.cooked) a *= 0.55;
  if (P.nitroOn) a += BASE_MAX * 0.42 * P.npow;
  if (P.rpm >= 1.0 && !fin) {
    a = Math.min(a, 0); P.speed = Math.min(P.speed, gt); D.limT += dt;
    if (D.limT > 2.4 && !D.cooked) { D.cooked = true; dragMsg(W, 'Engine overheated', 0); ARC.haptic('fail', 0.7); }
  } else D.limT = Math.max(0, D.limT - dt * 0.5);
  if (fin) a = -BASE_MAX * 0.5;
  P.speed = Math.max(0, P.speed + a * dt);
  P.thr = fin ? 0 : 1;
}
function updateDragRival(W, c, dt) {
  const D = c.drag, racing = W.phase === 'racing' || W.phase === 'finished' || W.phase === 'busted';
  if (!racing) { c.speed = 0; return; }
  if (!D.launched) {
    D.launched = true; const q = Math.random();
    if (q < c.skill * 0.75) D.boost = 0.9; else if (q > 0.9) D.bog = 0.7;
    D.at = 0.9 + (Math.random() - 0.5) * (1 - c.skill) * 0.3;
  }
  const top = c.vmax, gt = DRAG_GT[D.gear] * top;
  D.rpm = clamp(Math.max(0.24, c.speed / gt), 0, 1.06);
  if (D.gear < 6 && D.rpm >= D.at && !c.finished) {
    const q = judgeShift(D.rpm); if (q === 2) D.boost = 0.5; else if (q === 0) D.bog = 0.45; else if (q < 0) D.bog = 0.18;
    D.gear++; D.at = 0.91 + (Math.random() - 0.5) * (1 - c.skill) * 0.34;
  }
  let a = BASE_MAX * 0.36 * c.k.acc * DRAG_MUL[D.gear] * dragTq(D.rpm) * (0.97 + 0.04 * c.skill);
  if (D.boost > 0) { D.boost -= dt; a *= 1.28; }
  if (D.bog > 0) { D.bog -= dt; a *= 0.55; }
  if (D.rpm >= 1) { a = Math.min(a, 0); c.speed = Math.min(c.speed, gt); }
  c.nitroOn = !c.finished && D.gear >= 4 && c.skill > 0.75 && c.speed < top * 0.97;
  if (c.nitroOn) a += BASE_MAX * 0.3;
  if (c.finished) a = -BASE_MAX * 0.5;
  c.speed = Math.max(0, c.speed + a * dt);
  c.brake = c.finished && c.speed > 300;
  c.vx = (0.45 - c.x) * 2; c.x += c.vx * dt;
  advance(W, c, c.speed * dt);
}

/* ------------------------------------------------------------ drifting: points for angle times speed, chained */
function driftScore(W, dt, offroad) {
  const D = W.drift, P = W.P, sp = P.speed / BASE_MAX, ang = Math.abs(P.slip);
  if (D.wallT > 0) D.wallT = Math.max(0, D.wallT - dt * 0.5);
  if (ang > 0.13 && sp > 0.3 && !offroad) {
    D.idle = 0; D.chainT += dt;
    D.mult = Math.min(5, 1 + Math.floor(D.chainT / 2) * 0.5);
    D.chain += ang * sp * 1000 * dt;
  } else if (D.chain > 0) {
    D.idle += dt;
    if (D.idle > 1.5) bankChain(W);
  }
}
function bankChain(W) {
  const D = W.drift; if (!D || D.chain <= 0) return;
  const pts = Math.round(D.chain * D.mult);
  D.score += pts; D.banks++; if (pts > D.best) D.best = pts;
  if (!W.attract) { ARC.toast('+' + MX.money(pts), 'Drift x' + D.mult.toFixed(1), 1100); ARC.sfx.tone(700 + Math.min(600, pts / 20), 0.12, { type: 'triangle', vol: 0.14 }); ARC.haptic('tap', 0.5); }
  D.chain = 0; D.mult = 1; D.chainT = 0; D.idle = 0;
}
function loseChain(W) {
  const D = W.drift; if (!D) return;
  if (D.chain > 80 && !W.attract) { ARC.toast('Chain lost', MX.money(Math.round(D.chain * D.mult)) + ' points gone', 1000); ARC.sfx.tone(180, 0.25, { type: 'sawtooth', slide: 90, vol: 0.12 }); }
  D.chain = 0; D.mult = 1; D.chainT = 0; D.idle = 0;
}

/* ------------------------------------------------------------ things that break, and pursuit breakers */
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
function breakProp(W, ref, off) {
  if (!ref || ref.broken) return;
  ref.broken = true;
  const P = W.P;
  P.speed *= ref.type === 'stall' ? 0.86 : 0.94;
  W.earn.propsN++;
  if (W.drift) loseChain(W);
  if (W.police && W.police.active) policeXP(W, 0.04);
  if (!W.attract) { if (!ARC.reducedMotion) W.shake = Math.max(W.shake, 3); ARC.haptic('tap', 0.6); ARC.sfx.noise(0.25, { freq: 900, vol: 0.2 }); ARC.sfx.tone(240, 0.12, { type: 'square', vol: 0.06 }); }
  const S = R3 && R3.cur; if (!S || !S.brk) return;
  const e = S.brk[ref.type]; if (!e) return;
  e.im.setMatrixAt(ref.idx, _zero); e.im.instanceMatrix.needsUpdate = true;
  if (VFX) {
    e.proxy.matrix.copy(ref.m); e.proxy.matrixWorld.copy(ref.m);
    VFX.shatter(e.proxy, { hide: false, color: BRK_COL[ref.type], pieces: ref.type === 'stall' ? 22 : 12, force: 0.8 + P.speed / BASE_MAX, chunky: true });
    _vq.setFromMatrixPosition(ref.m); _vq.y += 0.5;
    VFX.impact(_vq, _vn, { kind: ref.type === 'stall' ? 'powder' : 'dust', size: 0.8, color: ref.type === 'stall' ? '#ffb43a' : undefined });
  }
}
function restoreProps(S) {
  if (!S || !S.brk) return;
  for (const k in S.brk) { const e = S.brk[k]; for (let i = 0; i < e.list.length; i++) e.im.setMatrixAt(i, e.list[i].m); e.im.instanceMatrix.needsUpdate = true; }
  if (S.breakers) S.breakers.forEach((b) => { b.ang = 0; b.vel = 0; b.falling = false; b.landed = false; b.mesh.matrix.copy(b.base); b.mesh.matrixWorldNeedsUpdate = true; });
}
function triggerBreaker(W, br) {
  if (br.used) return;
  br.used = true; br.falling = true; br.vel = 0.2; br.t = 0;
  const pol = W.police;
  pol.breakers++; pol.bounty += 1500;
  // every patrol car between the breaker and the next bend behind it, or arriving in the next seconds, is caught
  br.blockT = 3.2;
  let n = 0;
  for (let i = 0; i < W.cops.length; i++) {
    const c = W.cops[i]; if (!c.active || c.role === 'wreck' || c.br >= 0) continue;
    const g = wrapD(br.dist - c.dist, W.T.L);
    if (g > -400 && g < 11000) { wreckCop(W, c, true); n++; }
  }
  radio(W, 'breaker');
  policeXP(W, 0.3);
  if (!W.attract) {
    ARC.toast(n ? 'Pursuit breaker: ' + n + ' down' : 'Pursuit breaker', n ? '+$' + MX.money(1500 + n * 800) : 'Nobody close enough', 1600);
    ARC.haptic('heavy', 1); ARC.sfx.noise(1.1, { freq: 300, vol: 0.4 }); ARC.sfx.tone(70, 0.8, { type: 'sawtooth', slide: 35, vol: 0.18 });
    if (VFX && !ARC.reducedMotion) VFX.timeWarp(0.35, 1.1);
    W.cut = { kind: 'breaker', t: 0, dur: ARC.reducedMotion ? 0 : 1.5, br };
  }
}

/* ------------------------------------------------------------ the police */
const COP_POOL = 8;
function newPolice(W, heat, hunt) {
  const pol = { heat: Math.max(1, heat || 1), xp: 0, state: hunt ? 'pursuit' : 'idle', active: hunt, hunt, cool: 0, bust: 0, lostT: 0, spawnT: hunt ? 4 : 6, spikeT: 14, blockT: 22,
    spikes: [], radio: [], wrecked: 0, bounty: 0, breakers: 0, rams: 0, pursuitT: 0, boxT: 0, lastKey: {}, siren: 0, hidden: false, zoneName: '', escaped: 0, flats: 0 };
  W.police = pol;
  if (hunt) {
    spawnCop(W, 'behind', -3600);
    spawnCop(W, 'ahead');
  }
  return pol;
}
function radio(W, key, unit) {
  const pol = W.police; if (!pol || W.attract) return;
  const now = W.t;
  if (pol.lastKey[key] != null && now - pol.lastKey[key] < (key === 'rammed' ? 6 : 3)) return;
  pol.lastKey[key] = now;
  const list = MX.RADIO[key]; if (!list) return;
  const P = W.P, zone = zoneName(W) || W.T.name;
  const line = list[(Math.random() * list.length) | 0].replace('{u}', unit || MX.UNITS[(Math.random() * 6) | 0]).replace('{h}', String(pol.heat)).replace('{z}', zone).replace('{c}', (P.k.name || 'car').split(' ')[0]);
  pol.radio.push({ text: line, t: now });
  if (pol.radio.length > 3) pol.radio.shift();
  ARC.sfx.noise(0.08, { filter: 'bandpass', freq: 2400, vol: 0.06 });
}
function zoneName(W) {
  const T = W.T, z = mod(W.P.dist, T.L);
  for (let i = 0; i < T.zones.length; i++) { const q = T.zones[i]; if (z >= q.d0 - 6000 && z < q.d1 + 6000) return q.name; }
  return T.name;
}
function inZone(W) {
  const P = W.P; if (P.br >= 0) return 'the ' + W.T.branches[P.br].name.toLowerCase();
  const T = W.T, z = mod(P.dist, T.L);
  for (let i = 0; i < T.zones.length; i++) { const q = T.zones[i]; if (z >= q.d0 && z < q.d1) return q.name; }
  return '';
}
function policeXP(W, n) {
  const pol = W.police; if (!pol) return;
  pol.xp += n;
  while (pol.xp >= 1 && pol.heat < 5) { pol.xp -= 1; pol.heat++; radio(W, 'heat'); if (!W.attract) { ARC.toast('Heat level ' + pol.heat, pol.heat >= 4 ? 'Roadblocks ahead' : pol.heat >= 3 ? 'Spike strips authorised' : 'More units coming', 1500); ARC.haptic('hit', 0.7); } }
  if (pol.heat >= 5) pol.xp = Math.min(pol.xp, 1);
}
function freeCop(W) { for (let i = 0; i < W.cops.length; i++) if (!W.cops[i].active) return W.cops[i]; return null; }
function spawnCop(W, where, at) {
  const c = freeCop(W); if (!c) return null;
  const P = W.P, pol = W.police, r = Math.random();
  c.active = true; c.ghost = false; c.br = -1; c.bs = 0; c.wantBr = -1; c.brDec = -1; c.wreck = 0; c.hp = 1; c.flat = 0; c.parked = false; c.box = ''; c.slip = 0; c.spin = 0;
  c.swift = pol.heat >= 4 && r < 0.4;
  c.vmax = BASE_MAX * (0.94 + 0.04 * pol.heat) * (c.swift ? 1.08 : 1);
  c.lane = LANE_X[(Math.random() * 4) | 0]; c.side = Math.random() < 0.5 ? -1 : 1;
  const base = P.br >= 0 ? P.brBase + W.T.branches[P.br].dA : P.dist;
  if (where === 'behind') { c.dist = base + (at || -(9000 + r * 4000)); c.speed = Math.max(P.speed * 1.05, BASE_MAX * 0.6); c.role = pol.active ? 'chase' : 'patrol'; c.x = c.lane; }
  else { c.dist = base + (at || (24000 + r * 12000)); c.speed = BASE_MAX * 0.38; c.role = pol.active && pol.state === 'evade' ? 'search' : 'patrol'; c.x = c.lane; }
  c.lights = c.role === 'chase';
  c.z = mod(c.dist, W.T.L);
  c.dirty = true;
  return c;
}
function wreckCop(W, c, quiet) {
  if (c.role === 'wreck') return;
  const pol = W.police;
  c.role = 'wreck'; c.wreck = 0.01; c.lights = false; c.parked = false; c.spin = (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random());
  pol.wrecked++; pol.bounty += 800;
  policeXP(W, 0.28);
  if (!quiet) radio(W, 'wreck', c.unit);
  if (!W.attract && !quiet) { ARC.toast('Unit down', '+$800 bounty', 1000); }
  if (VFX && R3 && R3.cops) { const m = R3.cops.find((x) => x.slot === c); if (m) { _vq.setFromMatrixPosition(m.car.root.matrix); _vq.y += 0.8; VFX.impact(_vq, _vn, { kind: 'spark', size: 1.2 }); VFX.dust(_vq, { size: 1.4 }); c.plume = VFX.smokePlume(_vq, { size: 0.7, duration: 5 }); } }
}
function copHit(W, c, strength) {
  if (c.role === 'wreck') return;
  c.hp -= 0.22 + strength * 0.6;
  W.police.rams++; policeXP(W, 0.05);
  if (c.role === 'patrol' || c.role === 'search' || c.role === 'block') startPursuit(W, c);
  radio(W, 'rammed', c.unit);
  if (c.hp <= 0) wreckCop(W, c);
}
function startPursuit(W, c) {
  const pol = W.police;
  if (pol.state === 'pursuit') return;
  const was = pol.state;
  pol.state = 'pursuit'; pol.active = true; pol.lostT = 0; pol.cool = 0;
  for (let i = 0; i < W.cops.length; i++) { const k = W.cops[i]; if (k.active && (k.role === 'patrol' || k.role === 'search')) { k.role = 'chase'; k.lights = true; } }
  if (was === 'idle') { radio(W, 'start'); if (!W.attract) { ARC.toast('Police pursuit', 'Lose them', 1600); ARC.haptic('hit', 0.8); } }
  else radio(W, 'seen', c && c.unit);
  if (c) radio(W, 'chase', c.unit);
}
function sees(W, c) {
  if (!c.active || c.role === 'wreck') return false;
  const P = W.P, g = gapZ(W, P, c);
  if (g > 1e8) return Math.abs(c.dist - P.dist) < 2500;
  const range = 13000 + W.police.heat * 1600;
  if (W.police.hidden && Math.abs(g) > 4200) return false;
  return Math.abs(g) < range;
}
function deploySpikes(W) {
  const pol = W.police, P = W.P;
  if (P.br >= 0 || pol.spikes.length >= 2) return;
  const d = P.dist + 17000 + Math.random() * 5000, z = mod(d, W.T.L);
  for (let b = 0; b < W.T.branches.length; b++) { const B = W.T.branches[b]; if (z > B.dA - 4000 && z < B.dB + 2000) return; }
  const g = (Math.random() * 4) | 0;
  pol.spikes.push({ dist: d, gapX: LANE_X[g], gap: g, t: 0, dirty: true });
  radio(W, 'spikes');
  if (!W.attract) ARC.toast('Spike strip ahead', 'Find the gap', 1300);
}
function deployBlock(W) {
  const pol = W.police, P = W.P; if (P.br >= 0) return;
  const n = pol.heat >= 5 ? 3 : 2, d = P.dist + 28000 + Math.random() * 5000, z = mod(d, W.T.L);
  for (let b = 0; b < W.T.branches.length; b++) { const B = W.T.branches[b]; if (z > B.dA - 5000 && z < B.dB + 3000) return; }
  const lanes = [0, 1, 2, 3], gapL = (Math.random() * 4) | 0; lanes.splice(gapL, 1);
  if (n === 2) lanes.splice((Math.random() * 3) | 0, 1);
  let made = 0;
  for (let i = 0; i < lanes.length; i++) {
    const c = freeCop(W); if (!c) break;
    spawnCop(W, 'ahead', d - P.dist + (i % 2) * 300);
    c.role = 'block'; c.parked = true; c.speed = 0; c.x = LANE_X[lanes[i]]; c.lane = c.x; c.lights = true; c.parkYaw = (i % 2 ? 1 : -1) * (0.5 + Math.random() * 0.3);
    made++;
  }
  if (made) { radio(W, 'block'); if (!W.attract) ARC.toast('Roadblock ahead', 'Look for the gap', 1300); }
}
function spikeCheck(W, c, before) {
  const pol = W.police; if (!pol || c.br >= 0) return;
  for (let i = 0; i < pol.spikes.length; i++) {
    const sk = pol.spikes[i];
    if (before < sk.dist && c.dist >= sk.dist && Math.abs(c.x - sk.gapX) > 0.24) {
      if (c.isPlayer) {
        if (c.flat <= 0) { c.flat = 12; pol.flats++; radio(W, 'flat'); if (!W.attract) { ARC.toast('Tyres punctured', 'Top speed down for a while', 1500); ARC.haptic('heavy', 0.8); ARC.sfx.noise(0.6, { filter: 'highpass', freq: 1200, vol: 0.25 }); } sparksAt(W, 1, 18, 0.9); sparksAt(W, -1, 18, 0.9); }
      } else if (c.isCop && c.role !== 'wreck') { wreckCop(W, c); }
    }
  }
}
function stepPolice(W, dt, pre) {
  const pol = W.police, P = W.P, T = W.T;
  // cars
  for (let i = 0; i < W.cops.length; i++) { const c = W.cops[i]; if (c.active) updateCop(W, c, pre ? 0 : dt); }
  if (pre) return;
  for (let i = pol.spikes.length - 1; i >= 0; i--) { const sk = pol.spikes[i]; sk.t += dt; if (P.dist > sk.dist + 16000 || sk.t > 60) pol.spikes.splice(i, 1); }
  const zone = inZone(W);
  pol.hidden = !!zone; pol.zoneName = zone;
  let any = false, near = 1e9;
  for (let i = 0; i < W.cops.length; i++) {
    const c = W.cops[i]; if (!c.active) continue;
    if (sees(W, c)) { any = true; if (pol.state === 'idle' && (c.role === 'patrol' || c.role === 'block') && P.speed > BASE_MAX * 0.5 && P.started) startPursuit(W, c); }
    if (c.role !== 'wreck' && c.role !== 'patrol') { const g = gapZ(W, P, c); if (g < 1e8) near = Math.min(near, Math.abs(g)); }
  }
  pol.near = near;
  if (pol.state === 'pursuit') {
    pol.pursuitT += dt;
    if (any) pol.lostT = 0; else pol.lostT += dt;
    if (pol.lostT > 2.8) {
      pol.state = 'evade'; pol.cool = 0; radio(W, 'lost');
      for (let i = 0; i < W.cops.length; i++) { const c = W.cops[i]; if (c.active && c.role === 'chase') c.role = 'search'; }
    }
    policeXP(W, dt / (42 + pol.heat * 9));
    if (pol.heat >= 3) { pol.spikeT -= dt; if (pol.spikeT <= 0) { pol.spikeT = 18 + Math.random() * 10; deploySpikes(W); } }
    if (pol.heat >= 4) { pol.blockT -= dt; if (pol.blockT <= 0) { pol.blockT = 26 + Math.random() * 12; deployBlock(W); } }
  } else if (pol.state === 'evade') {
    if (any) startPursuit(W, null);
    else {
      const rate = 1 / (6 + pol.heat * 2.4) * (pol.hidden ? 2.3 : 1) * (pol.hidden && P.speed < BASE_MAX * 0.25 ? 1.4 : 1);
      pol.cool += dt * rate;
      if (pol.hidden && Math.random() < dt * 0.15) radio(W, 'hide');
      if (pol.cool >= 1) escaped(W);
    }
  }
  // busted: stopped with a patrol car right beside you
  if (pol.state === 'pursuit' || pol.state === 'evade') {
    let close = false;
    for (let i = 0; i < W.cops.length; i++) {
      const c = W.cops[i]; if (!c.active || c.role === 'wreck' || c.role === 'patrol') continue;
      const g = gapZ(W, P, c); if (Math.abs(g) < 1900 && Math.abs(c.x - P.x) < 0.8) { close = true; break; }
    }
    if (close && P.speed < 1100 && W.phase === 'racing') pol.bust += dt / 2.4; else pol.bust = Math.max(0, pol.bust - dt / 1.4);
    if (pol.bust >= 1 && W.phase === 'racing') busted(W);
  }
  // spawning and recycling
  const cap = pol.state === 'idle' ? 2 : [0, 2, 3, 4, 5, 6][pol.heat];
  let alive = 0;
  for (let i = 0; i < W.cops.length; i++) {
    const c = W.cops[i]; if (!c.active) continue;
    const g = c.br >= 0 || P.br >= 0 ? c.dist - P.dist : wrapD(c.dist - P.dist, T.L);
    const lose = c.role === 'wreck' ? (g < -16000 || c.wreck > 14) : c.role === 'patrol' ? (g > 64000 || g < -22000) : c.role === 'block' ? g < -40000 : g < -34000 || g > 70000;
    if (lose) { c.active = false; c.ghost = true; c.role = 'off'; if (c.plume && c.plume.stop) c.plume.stop(); c.plume = null; continue; }
    if (c.role !== 'wreck' && c.role !== 'block') alive++;
  }
  pol.spawnT -= dt;
  if (pol.spawnT <= 0 && alive < cap) {
    pol.spawnT = pol.state === 'idle' ? 14 + Math.random() * 10 : 4 + Math.random() * 5;
    const behind = pol.state === 'pursuit' && Math.random() < 0.6;
    const c = spawnCop(W, behind ? 'behind' : 'ahead');
    if (c && c.role === 'chase') radio(W, 'chase', c.unit);
  }
  // boxing in: from heat two, one car gets in front and brakes while the others pull alongside
  pol.boxT -= dt;
  if (pol.boxT <= 0) {
    pol.boxT = 1;
    let front = null, fg = -1e9;
    for (let i = 0; i < W.cops.length; i++) { const c = W.cops[i]; if (!c.active || c.role !== 'chase') continue; c.box = ''; const g = gapZ(W, P, c); if (g < 1e8 && g > -2500 && g < 7000 && g > fg) { fg = g; front = c; } }
    if (front && pol.heat >= 2 && (W.t % 10) < 4.5) { if (front.box !== 'front') front.aimX = front.x; front.box = 'front'; }
  }
  // sirens
  const sv = pol.active && near < 40000 ? clamp(1 - near / 40000, 0, 1) : 0;
  pol.siren = sv;
}
function updateCop(W, c, dt) {
  if (!dt) return;
  const P = W.P, pol = W.police;
  if (c.role === 'block') { c.speed = 0; c.vx = 0; c.brake = false; if (gapZ(W, P, c) < -5000 && pol.active) { c.role = 'chase'; c.parked = false; c.lights = true; } return; }
  if (c.role === 'wreck') {
    c.wreck += dt; c.speed = Math.max(0, c.speed - BASE_MAX * 0.5 * dt); c.slip += c.spin * dt * (c.speed / BASE_MAX + 0.15); c.spin *= Math.exp(-dt * 1.5);
    c.vx *= Math.exp(-dt * 2); c.x = clamp(c.x + c.vx * dt, -1.05, 1.05); advance(W, c, c.speed * dt); c.brake = true; return;
  }
  if (c.flat > 0) c.flat -= dt;
  const g = gapZ(W, P, c);
  let tgt, tx = c.lane;
  aiPlan(W, c);
  const avoid = PLAN.avoid, slowFor = PLAN.slow;
  if (c.role === 'patrol') { tgt = BASE_MAX * 0.38; tx = c.lane; }
  else if (c.role === 'search') { tgt = BASE_MAX * 0.62; tx = c.lane; }
  else {
    if (g > 1e8) { tgt = c.vmax * 0.95; tx = c.lane; }
    else if (g < -500) {
      const close = -g;
      tgt = Math.min(c.vmax * (c.flat > 0 ? 0.6 : 1), P.speed + 700 + close * 0.3);
      tx = close < 2800 ? P.x : P.x * 0.6 + c.lane * 0.4;
    } else if (g > 500) {
      // ahead of the suspect: the front car of a box brakes in their path now and then, the rest hold station
      if (c.box === 'front') { tgt = Math.max(P.speed * 0.86, BASE_MAX * 0.42); c.aimX += (P.x - c.aimX) * Math.min(1, dt * 1.6); tx = c.aimX; }
      else { tgt = P.speed * 0.97; tx = clamp(P.x + c.side * 0.48, -0.85, 0.85); }
      if (g > 9000) tgt = Math.min(tgt, BASE_MAX * 0.5);
    } else { tgt = P.speed * (1 + 0.05 * Math.sin(W.t * 2 + c.id)); tx = clamp(P.x + c.side * (Math.sin(W.t * 1.3 + c.id) > 0.4 ? 0.3 : 0.46), -0.9, 0.9); }
    if (c.ramCd > 0) { c.ramCd -= dt; if (g < 0 && g > -3000) { tx = clamp(P.x + c.side * 0.55, -0.9, 0.9); tgt = Math.min(tgt, P.speed * 0.98); } }
  }
  if (PLAN.tx !== 0 && c.wantBr >= 0) tx = PLAN.tx;
  if (c.role !== 'chase' || g > 1e8 || g > 0) tgt = Math.min(tgt, slowFor);
  if (c.speed < tgt) c.speed = Math.min(tgt, c.speed + BASE_MAX * 0.34 * (1.05 - 0.6 * c.speed / c.vmax) * dt);
  else c.speed = Math.max(tgt, c.speed - BASE_MAX * 0.7 * dt);
  c.brake = c.speed > tgt + 250;
  const want = clamp((tx - c.x) * 2.2 + avoid * 0.9, -1.4, 1.4);
  c.vx += (want - c.vx) * Math.min(1, dt * 4);
  const xl = c.br >= 0 ? 0.5 : 0.92;
  c.x = clamp(c.x + c.vx * dt, -xl, xl);
  const before = c.dist;
  advance(W, c, c.speed * dt);
  spikeCheck(W, c, before);
  // cars arriving at a fallen breaker
  const S = R3 && R3.cur;
  if (S && S.breakers) for (let i = 0; i < S.breakers.length; i++) { const b = S.breakers[i]; if (b.used && b.blockT > 0 && c.br < 0 && before < b.dist && c.dist >= b.dist) wreckCop(W, c); }
}
function busted(W) {
  const pol = W.police; if (W.phase !== 'racing') return;
  pol.state = 'busted'; W.phase = 'busted'; W.endT = 0; W.banner = 'BUSTED'; W.bannerT = 3.2;
  radio(W, 'busted');
  if (!W.attract) { ARC.toast('Busted', 'The chase is over', 2200); ARC.haptic('fail', 1); ARC.sfx.tone(300, 0.5, { type: 'square', slide: 140, vol: 0.18 }); }
}
function escaped(W) {
  const pol = W.police;
  pol.escaped++; radio(W, 'escaped');
  pol.state = 'idle'; pol.active = false; pol.cool = 0; pol.bust = 0;
  for (let i = 0; i < W.cops.length; i++) { const c = W.cops[i]; if (c.active && c.role !== 'wreck' && c.role !== 'block') { c.role = 'patrol'; c.lights = false; } }
  if (W.mode === 'pursuit') { W.phase = 'finished'; W.P.finished = true; W.P.finT = W.t; W.endT = 0; W.banner = 'ESCAPED'; W.bannerT = 3.2; if (!W.attract) { ARC.toast('Escaped', 'They lost you', 2200); ARC.haptic('success', 1); } if (VFX && R3) R3.show = { n: 4, t: 0.4 }; }
  else if (!W.attract) { ARC.toast('Escaped', 'Back to the race', 1600); ARC.haptic('success', 0.6); }
  pol.heat = Math.max(1, pol.heat - 1); pol.xp = 0;
}

function wallScrape(W, side, dt) {
  const P = W.P;
  if (W.drift) { W.drift.wallT = (W.drift.wallT || 0) + dt; if (W.drift.wallT > 0.35) loseChain(W); }
  P.speed = Math.max(0, P.speed - BASE_MAX * 0.55 * dt); P.cleanT = 0;
  W.sparksT -= dt;
  if (W.sparksT <= 0 && P.speed > 1200) { W.sparksT = 0.05; sparksAt(W, side, 3, 0.8); }
  W.scr -= dt;
  if (W.scr <= 0) { W.scr = 0.12; if (!W.attract) { ARC.sfx.noise(0.14, { filter: 'bandpass', freq: 1700, vol: 0.14 }); ARC.haptic('tap', 0.45); } }
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
  const P = W.P, L = W.T.L, m = W.mode;
  if (W.attract || P.finished) return;
  if (m === 'sprint' || m === 'drag' || m === 'pursuit') {
    if (!P.started && P.dist >= W.startD) { P.started = true; P.lapT0 = W.t; P.lapIdx = 0; }
    if (P.dist >= W.raceLen) finishPlayer(W, W.t - (P.dist - W.raceLen) / Math.max(P.speed, 500));
    return;
  }
  const lap = Math.floor(P.dist / L);
  if (W.ghost && P.started) ghostRecord(W);
  if (lap > P.lapIdx) {
    const over = (P.dist - lap * L) / Math.max(P.speed, 500), tNow = W.t - over;
    P.lapIdx = lap;
    if (lap === 0) { P.lapT0 = tNow; P.started = true; if (W.ghost) { W.ghost.n = 0; W.ghost.recT = 0; } }
    else {
      const lt = tNow - P.lapT0; P.lapT0 = tNow; P.lapTimes.push(lt);
      const prevBest = P.bestLap, stored = bestOf(W.cfg.track).lap;
      if (lt < P.bestLap) P.bestLap = lt;
      if (W.ghost) ghostLap(W, lt);
      let msg = fmtTime(lt), sub = lap < W.laps ? 'Lap ' + lap + ' done' : 'Final lap';
      if (lt <= prevBest) sub += ' - best lap';
      if (stored != null) msg += '  (' + (lt <= stored ? '-' : '+') + Math.abs(lt - stored).toFixed(2) + ')';
      if (lap < W.laps) { ARC.haptic('hit', 0.6); ARC.toast(msg, sub, 2000); ARC.sfx.tone(660, 0.12, { type: 'triangle', vol: 0.2 }); ARC.sfx.tone(990, 0.16, { type: 'triangle', vol: 0.2, delay: 0.12 }); }
      if (lap >= W.laps) finishPlayer(W, tNow);
    }
  }
}

function finishPlayer(W, tNow) {
  const P = W.P;
  P.finished = true; P.finT = tNow; W.phase = 'finished'; W.endT = 0; P.nitroOn = false; P.nLatch = 0;
  if (W.drift) bankChain(W);
  sortOrder(W);
  const pos = positionOf(W, P), versus = W.mode === 'race' || W.mode === 'sprint' || W.mode === 'drag';
  W.banner = versus ? ordinal(pos) : W.mode === 'drift' ? MX.money(W.drift.score) : fmtTime(tNow); W.bannerT = 3.2;
  ARC.toast(versus ? 'You finished ' + ordinal(pos) : W.mode === 'drift' ? 'Drift score ' + MX.money(W.drift.score) : 'Time ' + fmtTime(tNow), W.mode === 'drag' ? 'Quarter mile' : 'Chequered flag', 2600);
  [523, 659, 784, 1046].forEach((f, i) => ARC.sfx.tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.11 }));
  if (FX) FX.confetti(W);
  if (VFX && R3) R3.show = { n: !versus || pos <= 3 ? 7 : 3, t: 0.1 };
  ARC.haptic(!versus || pos <= 3 ? 'success' : 'hit', 1);
  if (POST) POST.flash(0.2, '#fff2d0');
  if (W.police && W.police.active && W.mode !== 'pursuit') { W.police.state = 'idle'; W.police.active = false; }
}

/* ------------------------------------------------------------ main step */
function stepWorld(W, dt) {
  const P = W.P;
  if (W.phase === 'countdown') {
    W.cd += dt;
    const step = W.cd < 0.6 ? -1 : W.cd < 1.4 ? 0 : W.cd < 2.2 ? 1 : W.cd < 3.0 ? 2 : 3;
    if (step !== W.lastBeep) {
      W.lastBeep = step;
      if (step >= 0 && step < 3) { beep(520, 0.16, 0.18); if (!W.attract) ARC.haptic('tap', 0.4); }
      if (step === 1 || step === 2) revPops(W, step);
      if (step === 3) { beep(1040, 0.5, 0.2); if (!W.attract) ARC.haptic('hit', 0.8); ARC.toast('GO!', '', 900); W.phase = 'racing'; W.t = 0; W.goT = 0.9; }
    }
    advanceAI(W, dt, false);
    updatePlayer(W, dt);
  } else {
    advanceAI(W, dt, true);
    updatePlayer(W, dt);
    if (!W.attract) updateLaps(W);
    if (W.phase === 'finished' || W.phase === 'busted') {
      W.endT += dt;
      if (W.endT > (W.phase === 'busted' ? 2.6 : 3.0) && !W.over) { W.over = true; endRace(W); }
    } else if (!W.attract && W.mode === 'pursuit' && W.t > 900 && !W.over) { escaped(W); }
    else if (!W.attract && W.mode !== 'pursuit' && W.t > (W.mode === 'drag' ? 90 : 480) && !W.over) { W.over = true; timeUp(W); }
  }
  W.goT = Math.max(0, W.goT - dt); W.bannerT = Math.max(0, W.bannerT - dt);
  if (W.cut) { W.cut.t += dt; if (W.cut.t >= W.cut.dur) W.cut = null; }
  sortOrder(W);
  W.shake *= Math.exp(-dt * 7);
  if (W.shake > 0.3 && !ARC.reducedMotion) ARC.shake = Math.max(ARC.shake, W.shake);
  placeCar(W.T, P);
  if (!W.attract) recordFrame(W, dt);
}

function simulateRest(W) {
  W.P.ghost = true;
  let guard = 0;
  const open = () => { for (let i = 0; i < W.rivals.length; i++) if (!W.rivals[i].finished) return true; return false; };
  const pol = W.police; W.police = null;
  while (open() && guard++ < 7000) advanceAI(W, 1 / 30, true);
  W.police = pol;
}

/* ------------------------------------------------------------ results, rewards and the career */
let PENDING = null, AGAIN = null;
const DIFF_IDX = { rookie: 0, pro: 1, legend: 2 };
function endRace(W) {
  const P = W.P, T = W.T, track = W.cfg.track, mode = W.mode, ev = W.ev, d = DIFF_IDX[W.cfg.diff] || 0, pol = W.police;
  engineStop();
  const bustedNow = W.phase === 'busted';
  let rows = [], pos = 1, win = false, cash = 0, rep = 0, fine = 0, title = '', eyebrow = '', medal = '';
  const lines = [];
  const versus = mode === 'race' || mode === 'sprint' || mode === 'drag';
  if (versus && !bustedNow) {
    simulateRest(W);
    W.racers.forEach((c) => rows.push(c));
    rows.sort((a, b) => (a.finT || 1e9) - (b.finT || 1e9));
    pos = rows.indexOf(P) + 1; win = pos === 1;
    const prize = [1500, 2200, 3000][d] * (mode === 'drag' ? 0.8 : mode === 'sprint' ? 1.1 : 1);
    cash = Math.round(prize * (pos === 1 ? 1 : pos === 2 ? 0.55 : pos === 3 ? 0.3 : 0.1));
    rep = pos === 1 ? 60 : pos <= 3 ? 25 : 5;
    lines.push(['Finish ' + ordinal(pos), cash]);
  } else if (mode === 'drift') {
    const D = W.drift, sc = D.score;
    medal = sc >= D.target ? 'Gold' : sc >= D.target * 0.8 ? 'Silver' : sc >= D.target * 0.6 ? 'Bronze' : '';
    win = sc >= D.target; cash = Math.round(sc / 9); rep = medal === 'Gold' ? 60 : medal ? 30 : 5;
    lines.push(['Drift points ' + MX.money(sc), cash]);
  } else if (mode === 'time') {
    const tgt = W.ghost && W.ghost.target ? W.ghost.target : 0;
    win = !tgt || P.finT <= tgt; cash = Math.round([900, 1300, 1800][d] * (win ? 1 : 0.4)); rep = win ? 40 : 10;
    lines.push([tgt ? (win ? 'Beat the target' : 'Missed the target') : 'Laps complete', cash]);
  } else if (mode === 'pursuit') {
    win = !bustedNow;
    if (win) { cash = Math.round(pol.bounty + pol.heat * 900 + Math.min(pol.pursuitT, 300) * 6); rep = 40 + pol.heat * 20; lines.push(['Escaped at heat ' + pol.heat, Math.round(pol.heat * 900 + Math.min(pol.pursuitT, 300) * 6)]); if (pol.bounty) lines.push(['Bounty', pol.bounty]); }
  }
  if (bustedNow) { fine = Math.min(SAVE.cash, 600 * (pol ? pol.heat : 1)); win = false; cash = 0; rep = 0; }
  // bonuses for style
  if (!bustedNow) {
    if (P.nearMisses) { const b = P.nearMisses * 60; cash += b; lines.push(['Near misses x' + P.nearMisses, b]); }
    if (W.earn.propsN) { const b = W.earn.propsN * 30; cash += b; lines.push(['Things knocked over x' + W.earn.propsN, b]); }
    if (pol && mode !== 'pursuit' && pol.wrecked) { const b = pol.wrecked * 800; cash += b; lines.push(['Police cars put out x' + pol.wrecked, b]); }
    if (W.drag && W.drag.perfect) { const b = W.drag.perfect * 150; cash += b; lines.push(['Perfect shifts x' + W.drag.perfect, b]); }
  }
  // the career
  let unlocked = '', evDone = false, firstWin = false;
  if (ev) {
    SAVE.last = ev.id;
    if (win) {
      firstWin = !SAVE.done[ev.id];
      const evCash = Math.round(ev.reward * (firstWin ? 1 : 0.4));
      cash += evCash; rep += firstWin ? ev.rep : Math.round(ev.rep * 0.2); lines.push([firstWin ? 'Event won' : 'Event won again', evCash]);
      SAVE.done[ev.id] = true; evDone = true;
      if (ev.unlock && SAVE.owned.indexOf(ev.unlock) < 0) { SAVE.owned.push(ev.unlock); unlocked = KINDS[ev.unlock].name; }
    } else if (versus && pos <= 3 && !bustedNow) { const b = Math.round(ev.reward * 0.2); cash += b; lines.push(['Podium in a crew event', b]); }
  }
  SAVE.cash = Math.max(0, SAVE.cash + cash - fine); SAVE.rep += rep;
  SAVE.stats.races++; if (win) SAVE.stats.wins++; if (pol) { SAVE.stats.wrecked += pol.wrecked; if (mode === 'pursuit' && win) SAVE.stats.escapes++; if (bustedNow) SAVE.stats.busts++; }
  const bk = mode + '|' + track;
  const prevB = SAVE.best[bk];
  let newBest = false;
  if (mode === 'drift') { if (prevB == null || W.drift.score > prevB) { SAVE.best[bk] = W.drift.score; newBest = prevB != null; } }
  else if (!bustedNow && P.finished && mode !== 'pursuit') { if (prevB == null || P.finT < prevB) { SAVE.best[bk] = +P.finT.toFixed(2); newBest = prevB != null; } }
  // track bests for laps, as before
  const st = bestOf(track);
  let newTotal = false;
  if ((mode === 'race' || mode === 'time') && P.finished && !bustedNow) {
    const total = P.finT; newTotal = st.total == null || total < st.total;
    if (newTotal) st.total = total;
    if (P.bestLap < Infinity && (st.lap == null || P.bestLap < st.lap)) st.lap = P.bestLap;
    ARC.store.set('midnight-apex.bests', BESTS);
  }
  writeSave();
  // the panel
  const esc = ARC.esc, evName = ev ? ev.crew.name + ': ' + ev.name : (MX.MODES.find((m) => m.v === mode) || { label: 'Race' }).label + ' - ' + T.name;
  eyebrow = bustedNow ? 'Busted - ' + evName : (win ? 'Won - ' : 'Result - ') + evName;
  if (bustedNow) title = 'Busted';
  else if (versus) title = ordinal(pos) + ' <em>place</em>';
  else if (mode === 'drift') title = MX.money(W.drift.score) + ' <em>points</em>';
  else if (mode === 'pursuit') title = 'You <em>escaped</em>';
  else title = fmtTime(P.finT) + ' <em>' + (win ? 'on target' : 'time') + '</em>';
  let html = '';
  if (bustedNow) html += '<p>' + esc('The police boxed you in and the chase is over. The fine: $' + MX.money(fine) + '. Keep moving, break line of sight, and use the breakers next time.') + '</p>';
  if (W.boss && !bustedNow) html += '<p class="mx-boss">' + esc(win ? W.boss.name + ' pulls over and tosses you the keys to the crew. The ' + ev.crew.name + ' answer to you now.' : W.boss.name + ' does not even look back. Again?') + '</p>';
  if (rows.length) {
    let h = '<table class="mx-res"><tbody>';
    for (let i = 0; i < rows.length; i++) {
      const c = rows[i], gap = c.finT - rows[0].finT;
      h += '<tr' + (c.isPlayer ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(c.isPlayer ? 'You' : c.name) + (c.boss ? ' <small>crew boss</small>' : '') + '<small>' + esc(c.k.name) + '</small></td><td>' + (i === 0 ? fmtTime(c.finT) : '+' + gap.toFixed(2)) + '</td></tr>';
    }
    html += h + '</tbody></table>';
  }
  if (mode === 'drift') html += '<div class="mx-laps"><span>Target<b>' + MX.money(W.drift.target) + '</b></span><span>Best chain<b>' + MX.money(W.drift.best) + '</b></span><span>Medal<b>' + (medal || 'None') + '</b></span></div>';
  if (mode === 'drag' && W.drag) html += '<div class="mx-laps"><span>Launch<b>' + esc(W.drag.launch || '-') + '</b></span><span>Perfect shifts<b>' + W.drag.perfect + '</b></span><span>Top speed<b>' + Math.round(W.top * KMH) + ' km/h</b></span></div>';
  if (mode === 'time' && W.ghost && W.ghost.target) html += '<div class="mx-laps"><span>Target<b>' + fmtTime(W.ghost.target) + '</b></span><span>Your time<b>' + fmtTime(P.finT) + '</b></span></div>';
  if (pol) html += '<div class="mx-laps"><span>Heat<b>' + pol.heat + ' / 5</b></span><span>Units out<b>' + pol.wrecked + '</b></span><span>Breakers<b>' + pol.breakers + '</b></span></div>';
  if (P.lapTimes.length) html += '<div class="mx-laps">' + P.lapTimes.map((t, k) => '<span>Lap ' + (k + 1) + '<b>' + fmtTime(t) + '</b></span>').join('') + '</div>';
  const earned = lines.filter((l) => l[1]).map((l) => '<tr><td>' + esc(l[0]) + '</td><td>$' + MX.money(l[1]) + '</td></tr>').join('');
  html += '<table class="mx-earn"><tbody>' + earned + (fine ? '<tr class="neg"><td>Fine</td><td>-$' + MX.money(fine) + '</td></tr>' : '') + '<tr class="tot"><td>Cash now</td><td>$' + MX.money(SAVE.cash) + '</td></tr><tr><td>Rep</td><td>' + MX.money(SAVE.rep) + (rep ? ' (+' + rep + ')' : '') + '</td></tr></tbody></table>';
  if (unlocked) html += '<p class="mx-unlock">Unlocked: <b>' + esc(unlocked) + '</b>, waiting in your garage.</p>';
  if (ev && evDone && firstWin && ev.boss) {
    const nx = MX.CREWS[ev.ci + 1];
    if (nx) html += '<p class="mx-unlock">' + esc(SAVE.rep >= nx.rep ? 'The ' + nx.name + ' have heard of you. Their events are open.' : 'Earn ' + nx.rep + ' rep and the ' + nx.name + ' will race you.') + '</p>';
    else html += '<p class="mx-unlock">The crown is yours. Every crew in the city answers to you.</p>';
  }
  if (newBest) html += '<p class="mx-unlock">New personal best for this event.</p>';
  // what Play again does
  if (ev) { AGAIN = win ? MX.nextEvent(SAVE) : ev; } else AGAIN = null;
  const again = ev ? (win ? (AGAIN && AGAIN !== ev ? 'Next event' : 'Race it again') : 'Retry') : bustedNow ? 'Try again' : mode === 'drift' ? 'Drift again' : 'Race again';
  const scoreOK = (mode === 'race' || mode === 'time') && P.finished && !bustedNow;
  const overO = Object.assign({ eyebrow, title, html, again }, scoreOK ? { score: P.finT, lowerIsBetter: true, scoreLabel: 'Total time' } : {});
  ARC.over(overO);
  let statHtml = null;
  if (scoreOK) {
    const stat = document.querySelector('.arc-card .stat');
    statHtml = '<div>Total time<b>' + fmtTime(P.finT) + '</b></div><div>Best lap<b>' + fmtTime(P.bestLap) + '</b></div><div>Track best<b>' + fmtTime(st.total) + '</b></div>' + (newTotal ? '<div class="new">New track best<b class="new">&#9733;</b></div>' : '');
    if (stat) stat.innerHTML = statHtml;
  }
  W.overArgs = { o: overO, stat: statHtml };
  decorateOver(W);
  W.results = { pos, total: P.finT, win, cash, fine, mode, busted: bustedNow, rows: rows.map((c) => ({ name: c.name, t: c.finT })), drift: W.drift ? W.drift.score : null, heat: pol ? pol.heat : 0 };
  LAST_OVER = W;
}
let LAST_OVER = null;
// Extra buttons on the results card: watch the replay, open the garage or the career.
function decorateOver(W) {
  const card = document.querySelector('.arc-card'); if (!card) return;
  const acts = card.querySelector('.arc-actions'); if (!acts) return;
  if (!acts.__mx) { acts.__mx = true; acts.addEventListener('click', (e) => { const b = e.target.closest('.arc-btn'); if (b && b.classList.contains('primary') && ARC.state === 'over') PENDING = AGAIN; }, true); }
  const mk = (label, on) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'arc-btn'; b.textContent = label; b.addEventListener('click', () => { ARC.sfx.unlock(); on(); }); return b; };
  const first = acts.querySelector('.arc-btn.primary');
  const extra = [];
  if (W.rec && W.rec.count > 20) extra.push(mk('Watch replay', () => startReplay(W)));
  extra.push(mk('Garage', () => openGarage()));
  if (W.ev) extra.push(mk('Career', () => openCareer()));
  extra.reverse().forEach((b) => { if (first && first.nextSibling) acts.insertBefore(b, first.nextSibling); else acts.appendChild(b); });
}

function timeUp() {
  engineStop();
  ARC.haptic('fail');
  AGAIN = Wd && Wd.ev ? Wd.ev : null;
  ARC.over({
    eyebrow: 'Out of time', title: 'Time <em>up</em>',
    html: '<p>The clock ran out before the flag. Pull the nitro in the straights and keep it clean in the bends.</p>',
    again: 'Try again'
  });
  if (Wd) decorateOver(Wd);
}

/* ------------------------------------------------------------ the save, ghosts */
function writeSave() { if (SAVE) ARC.store.set(MX.SAVE_KEY, SAVE); }
function loadGhost(track, car) {
  const g = ARC ? ARC.store.get('midnight-apex.ghost.' + track, null) : null;
  if (!g || !g.d || !g.x || !g.d.length) return null;
  return { t: g.t, car: g.car || car, d: Float32Array.from(g.d), x: Float32Array.from(g.x) };
}
function ghostRecord(W) {
  const G = W.ghost, P = W.P, tl = W.t - P.lapT0;
  if (tl < G.recT) return;
  G.recT = tl + 0.1;
  if (G.n >= 6000) return;
  const o = G.n * 3; G.rec[o] = tl; G.rec[o + 1] = P.dist - P.lapIdx * W.T.L; G.rec[o + 2] = P.x; G.n++;
}
function ghostLap(W, lt) {
  const G = W.ghost;
  if (G.n > 20 && (!G.best || lt < G.best.t)) {
    const n = G.n, d = new Float32Array(n), x = new Float32Array(n);
    for (let i = 0; i < n; i++) { d[i] = G.rec[i * 3 + 1]; x[i] = G.rec[i * 3 + 2]; }
    G.best = { t: lt, car: W.P.kind, d, x };
    ARC.store.set('midnight-apex.ghost.' + W.cfg.track, { t: +lt.toFixed(2), car: W.P.kind, d: Array.from(d, (v) => Math.round(v)), x: Array.from(x, (v) => Math.round(v * 1000) / 1000) });
    if (!W.attract) ARC.toast('New ghost saved', 'Race it next lap', 1200);
  }
  G.n = 0; G.recT = 0;
}

/* ------------------------------------------------------------ the replay recorder: the last sixteen seconds of every car */
const REC_HZ = 15, REC_N = REC_HZ * 16, REC_F = 8;
function newRecorder(n) { return { n, buf: new Float32Array(n * REC_F * REC_N), t: new Float32Array(REC_N), head: 0, count: 0, acc: 0 }; }
function recordFrame(W, dt) {
  const R = W.rec; if (!R || W.phase === 'countdown') return;
  R.acc += dt; if (R.acc < 1 / REC_HZ) return;
  R.acc = Math.min(R.acc - 1 / REC_HZ, 0.1);
  const i = R.head, A = W.actors, buf = R.buf, base = i * R.n * REC_F;
  R.t[i] = W.t;
  for (let k = 0; k < A.length; k++) {
    const c = A[k], o = base + k * REC_F;
    buf[o] = c.dist; buf[o + 1] = c.x; buf[o + 2] = c.vx; buf[o + 3] = c.speed;
    buf[o + 4] = (c.brake ? 1 : 0) | (c.nitroOn ? 2 : 0) | (c.drift > 0.5 ? 4 : 0) | (c.active === false ? 0 : 8) | (c.lights ? 16 : 0) | (c.role === 'wreck' ? 32 : 0) | (c.parked ? 64 : 0);
    buf[o + 5] = c.br; buf[o + 6] = c.bs; buf[o + 7] = c.isCop ? c.slip + (c.parkYaw || 0) : c.slip;
  }
  R.head = (i + 1) % REC_N; R.count = Math.min(REC_N, R.count + 1);
}
// write the recorded state at time tau into the cars
function replayApply(W, tau) {
  const R = W.rec, n = R.count; if (n < 2) return;
  const first = (R.head - n + REC_N) % REC_N;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (R.t[(first + mid) % REC_N] <= tau) lo = mid; else hi = mid; }
  const ia = (first + lo) % REC_N, ib = (first + hi) % REC_N, ta = R.t[ia], tb = R.t[ib];
  const k = tb > ta ? clamp((tau - ta) / (tb - ta), 0, 1) : 0, A = W.actors, buf = R.buf;
  for (let j = 0; j < A.length; j++) {
    const c = A[j], a = ia * R.n * REC_F + j * REC_F, b = ib * R.n * REC_F + j * REC_F;
    const same = buf[a + 5] === buf[b + 5];
    c.dist = same ? lerp(buf[a], buf[b], k) : buf[k < 0.5 ? a : b];
    c.x = same ? lerp(buf[a + 1], buf[b + 1], k) : buf[(k < 0.5 ? a : b) + 1];
    c.vx = lerp(buf[a + 2], buf[b + 2], k); c.speed = lerp(buf[a + 3], buf[b + 3], k);
    const f = buf[k < 0.5 ? a + 4 : b + 4];
    c.brake = !!(f & 1); c.nitroOn = !!(f & 2); c.drift = f & 4 ? 0.8 : 0;
    if (c.isCop) { c.active = !!(f & 8); c.ghost = !c.active; c.lights = !!(f & 16); c.role = f & 32 ? 'wreck' : c.active ? (f & 64 ? 'block' : 'chase') : 'off'; c.parked = !!(f & 64); c.parkYaw = c.parked ? buf[a + 7] : 0; c.slip = c.parked ? 0 : buf[a + 7]; }
    else c.slip = lerp(buf[a + 7], buf[b + 7], k);
    c.br = same ? buf[a + 5] : buf[(k < 0.5 ? a : b) + 5]; c.bs = same ? lerp(buf[a + 6], buf[b + 6], k) : buf[(k < 0.5 ? a : b) + 6];
    if (c.isTraffic) placeCar(W.T, c);
  }
  W.P.steerIn = clamp(W.P.vx * 0.5, -1, 1); W.P.xCam = W.P.x;
}
function replaySpan(W) { const R = W.rec, n = R.count, first = (R.head - n + REC_N) % REC_N; return [R.t[first], R.t[(first + n - 1) % REC_N]]; }

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
  const st = { n, head: 0, life: new Float32Array(n), max: new Float32Array(n), vel: new Float32Array(n * 3), grow: new Float32Array(n), s0: new Float32Array(n), kind: new Int8Array(n), grav: new Float32Array(n), floor: new Float32Array(n).fill(-1e9) };
  return { pts, geo, mat, pos, size, alpha, col, st };
}
function createFX(scene) {
  const t = shared().glow;
  const sparks = makePool(260, true, t), smoke = makePool(240, false, t), conf = makePool(160, false, t);
  scene.add(sparks.pts, smoke.pts, conf.pts);
  function emit(p, x, y, z, vx, vy, vz, life, size, r, g, b, grow, grav, kind, floor) {
    const s = p.st, i = s.head; s.head = (i + 1) % s.n;
    s.floor[i] = floor == null ? -1e9 : floor;
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
      // sparks hit the tarmac and skip along it, losing most of their energy
      if (p.pos[i * 3 + 1] < s.floor[i]) { p.pos[i * 3 + 1] = s.floor[i]; s.vel[i * 3 + 1] = -s.vel[i * 3 + 1] * 0.3; s.vel[i * 3] *= 0.6; s.vel[i * 3 + 2] *= 0.6; }
      p.size[i] = s.s0[i] * (1 + s.grow[i] * (1 - k));
      p.alpha[i] = s.kind[i] === 2 ? (k > 0.15 ? 1 : k / 0.15) : Math.min(1, k * 1.6) * (s.kind[i] === 0 ? 0.5 : 0.8);
    }
    if (any) { p.geo.attributes.position.needsUpdate = true; p.geo.attributes.size.needsUpdate = true; p.geo.attributes.alpha.needsUpdate = true; p.geo.attributes.color.needsUpdate = true; }
  }
  const api = {
    spark(x, y, z, vx, vy, vz, life, size, floor) { emit(sparks, x, y, z, vx, vy, vz, life, 0.09 * size, 1, 0.62 + Math.random() * 0.3, 0.2, -0.4, 9.8, 1, floor); },
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

/* ------------------------------------------------------------ skid marks and scuffs: laid on the road, fading */
// One instanced quad per short segment of rubber. Each wheel that skids leaves a chain of
// segments joined end to end; a segment darkens as it is laid and fades over its life.
// The pool is fixed (no allocation in the frame loop) and sized by the quality tier.
const MARK_VS = 'attribute float aA; varying float vA; varying vec2 vUv; void main(){ vA = aA; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }';
const MARK_FS = 'uniform vec3 uCol; varying float vA; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }' +
  ' void main(){ float e = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x); float g = 0.75 + 0.25 * h(floor(vUv * vec2(6.0, 18.0))); float a = vA * e * g; if (a < 0.004) discard; gl_FragColor = vec4(uCol, a); }';
function makeMarks(scene, max) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); aA.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aA', aA);
  const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color('#0e0d0c') } }, vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, max); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.count = max;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) mesh.setMatrixAt(i, zero);
  scene.add(mesh);
  const age = new Float32Array(max), life = new Float32Array(max), a0 = new Float32Array(max);
  const mx = new THREE.Matrix4(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  const M = { mesh, max, cap: max, head: 0, live: 0, on: true };
  M.add = (ax, ay, az, bxp, byp, bzp, w, alpha, lf) => {
    if (!M.on || M.cap <= 0) return;
    bz.set(bxp - ax, byp - ay, bzp - az); const len = bz.length(); if (len < 0.05) return;
    bz.multiplyScalar(1 / len); bx.set(-bz.z, 0, bz.x).normalize(); by.crossVectors(bz, bx);
    bx.multiplyScalar(w); by.multiplyScalar(1); bz.multiplyScalar(len + 0.04);
    mx.makeBasis(bx, by, bz); mx.setPosition((ax + bxp) / 2, (ay + byp) / 2 + 0.025, (az + bzp) / 2);
    const i = M.head; M.head = (M.head + 1) % M.cap;
    mesh.setMatrixAt(i, mx); age[i] = 0; life[i] = lf; a0[i] = alpha; aA.array[i] = alpha;
    mesh.instanceMatrix.needsUpdate = true; aA.needsUpdate = true;
  };
  // A wheel that may or may not be skidding this frame: lays a segment every ~0.5 m while it does.
  M.trail = (st, on, x, y, z, w, alpha, lf) => {
    if (!on || !M.on) { st.on = false; return; }
    if (!st.on) { st.on = true; st.x = x; st.y = y; st.z = z; return; }
    const dx = x - st.x, dz = z - st.z, d2 = dx * dx + dz * dz;
    if (d2 > 36) { st.x = x; st.y = y; st.z = z; return; }
    if (d2 < 0.25) return;
    M.add(st.x, st.y, st.z, x, y, z, w, alpha, lf);
    st.x = x; st.y = y; st.z = z;
  };
  M.update = (dt) => {
    let any = false;
    for (let i = 0; i < M.cap; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      const k = age[i] / life[i];
      let a = k >= 1 ? 0 : a0[i] * Math.min(1, age[i] * 8) * (1 - k * k);
      if (k >= 1) { life[i] = 0; mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; }
      if (aA.array[i] !== a) { aA.array[i] = a; any = true; }
    }
    if (any) aA.needsUpdate = true;
  };
  M.clear = () => { for (let i = 0; i < M.max; i++) { life[i] = 0; aA.array[i] = 0; mesh.setMatrixAt(i, zero); } M.head = 0; mesh.instanceMatrix.needsUpdate = true; aA.needsUpdate = true; };
  // Tier: 0 marks off, otherwise a share of the pool.
  M.setCap = (n) => { n = Math.max(0, Math.min(M.max, n | 0)); if (n === M.cap) return; M.clear(); M.cap = n; M.on = n > 0; mesh.visible = M.on; mesh.count = Math.max(1, n); };
  return M;
}
let MARKS = null, VFX = null;
const _vq = new THREE.Vector3(), _vn = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------ boost set piece: road heat glow and shed sparks */
// finish show: one shell at a time, each sent up where the finish camera is looking at that moment
const _fs = new THREE.Vector3();
function finishShow(st, dt, cam) {
  if (!st || st.n <= 0 || !VFX || !cam) return;
  st.t -= dt; if (st.t > 0) return;
  st.t = 0.45 + Math.random() * 0.3; st.n--;
  const d = 22 + Math.random() * 8, th = Math.tan(cam.fov * Math.PI / 360);
  _fs.set((Math.random() - 0.5) * 1.2 * d * th * cam.aspect, d * th * (0.2 + Math.random() * 0.35), -d);
  cam.updateMatrixWorld(); _fs.applyMatrix4(cam.matrixWorld);
  VFX.fireworks(_fs, { launch: true, size: 1.3 });
}
let _boostTex = null;
const _bz = new THREE.Vector3(), _bd = new THREE.Vector3();
function boostTex() {
  if (_boostTex) return _boostTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(0.22, 'rgba(255,170,80,0.8)'); gr.addColorStop(0.55, 'rgba(255,100,40,0.28)'); gr.addColorStop(1, 'rgba(255,70,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _boostTex = new THREE.CanvasTexture(c); _boostTex.colorSpace = THREE.SRGBColorSpace; return _boostTex;
}
// an additive pool of light on the road behind the machine, child of its root (local +back is `back`)
function makeBoostGlow(parent, z, w, l, color) {
  const mat = new THREE.MeshBasicMaterial({ map: boostTex(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  mat.userData.keepMat = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.05, z); m.renderOrder = 2; m.visible = false; m.userData.keepMat = true;
  parent.add(m); return m;
}
// drive one boost: jet length flickers between 1.5 and 2 times, the glow breathes, sparks shed off the jet
function driveBoost(st, on, dt, root, glow, nozzles, back, quality, reduced) {
  st.t = (st.t || 0) + dt; st.k = (st.k || 0) + ((on ? 1 : 0) - (st.k || 0)) * Math.min(1, dt * (on ? 10 : 4));
  const f = reduced ? 1.6 : 1.55 + 0.3 * Math.sin(st.t * 31) * Math.sin(st.t * 11.3 + 1.7) + 0.15 * Math.sin(st.t * 57);
  if (st.h) for (let i = 0; i < st.h.length; i++) st.h[i].set(f);
  if (glow) { glow.visible = st.k > 0.02; glow.material.opacity = st.k * (reduced ? 0.5 : 0.55 + 0.2 * Math.sin(st.t * 23) * Math.sin(st.t * 9.1)); }
  if (!on || quality < 1 || !VFX) return;
  st.sp = (st.sp || 0) - dt; if (st.sp > 0) return;
  st.sp = quality >= 2 ? 0.08 : 0.16;
  const nz = nozzles[(Math.random() * nozzles.length) | 0];
  root.updateWorldMatrix(true, false);
  _bz.set(nz[0], nz[1], nz[2] + back * (0.6 + Math.random() * 1.2)).applyMatrix4(root.matrixWorld);
  _bd.set((Math.random() - 0.5) * 0.6, 0.5, back).transformDirection(root.matrixWorld);
  VFX.impact(_bz, _bd, { kind: 'spark', size: 0.26 });
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
    const ns = id === 'neon' ? 260 : id === 'city' ? 700 : 1900;
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
    if (id === 'neon' || id === 'city') {
      const cc = id === 'city' ? '255,150,70' : '255,60,160';
      const cg = g.createLinearGradient(0, h * 0.28, 0, h * 0.5); cg.addColorStop(0, 'rgba(' + cc + ',0)'); cg.addColorStop(1, 'rgba(' + cc + ',.32)');
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

// A wheel in a chosen style and rim colour, cached by both.
const WHEELS = {};
function wheelStyled(R, w, style, rimHex) {
  const key = R + '|' + style + '|' + rimHex;
  if (WHEELS[key]) return WHEELS[key];
  const parts = [], dk = new THREE.Color(rimHex).multiplyScalar(0.7).getHexString();
  parts.push(cylG(R, R, w, 22, '#0c0c0e', null, [0, 0, Math.PI / 2]));
  const lip = style === 'dish' ? 0.74 : 0.64;
  parts.push(cylG(R * lip, R * lip, w + 0.02, 20, style === 'dish' ? rimHex : '#2a2c31', null, [0, 0, Math.PI / 2]));
  if (style === 'dish') parts.push(cylG(R * 0.6, R * 0.6, w + 0.03, 18, '#1a1b1f', null, [0, 0, Math.PI / 2]));
  parts.push(cylG(R * 0.18, R * 0.18, w + 0.06, 10, rimHex, null, [0, 0, Math.PI / 2]));
  const n = style === 'mesh' ? 10 : style === 'blade' ? 7 : 5, len = style === 'dish' ? 0.5 : 0.62, th = style === 'mesh' ? 0.05 : style === 'blade' ? 0.13 : 0.1;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    parts.push(boxG(w + 0.035, R * len, R * th, rimHex, [0, Math.cos(a) * R * len * 0.55, Math.sin(a) * R * len * 0.55], [a + (style === 'blade' ? 0.35 : 0), 0, 0]));
    if (style === 'mesh') parts.push(boxG(w + 0.03, R * len, R * th, '#' + dk, [0, Math.cos(a + 0.31) * R * len * 0.55, Math.sin(a + 0.31) * R * len * 0.55], [a + 0.31 + 0.6, 0, 0]));
  }
  return (WHEELS[key] = mergeG(parts));
}
// Paint jobs on the body, drawn by the paint shader from the body's own shape: stripes, a side flash,
// a race roundel, two-tone, and the patrol car's white doors.
const DECAL_ID = { none: 0, stripes: 1, flash: 2, number: 3, split: 4, police: 5 };
function decalize(mat, mode, hex, K) {
  mat.userData.dec = { uDecal: { value: mode }, uDecalCol: { value: new THREE.Color(hex) }, uD: { value: new THREE.Vector4(K.hw, K.L, K.beltY, K.roofY) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, mat.userData.dec);
    sh.vertexShader = 'varying vec3 vMxLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMxLocal = position;');
    sh.fragmentShader = 'varying vec3 vMxLocal; uniform int uDecal; uniform vec3 uDecalCol; uniform vec4 uD;\n' + sh.fragmentShader.replace('#include <color_fragment>', [
      '#include <color_fragment>',
      '{ vec3 p = vMxLocal; float m = 0.0; float ax = abs(p.x); float side = smoothstep(0.78 * uD.x, 0.86 * uD.x, ax);',
      '  if (uDecal == 1) { float top = smoothstep(uD.z * 0.82, uD.z * 0.9, p.y); m = top * (smoothstep(0.07, 0.085, ax / uD.x) - smoothstep(0.2, 0.215, ax / uD.x) + smoothstep(0.26, 0.275, ax / uD.x) - smoothstep(0.31, 0.325, ax / uD.x)); }',
      '  else if (uDecal == 2) { float t = (p.z / uD.y + 0.5); float c = 0.36 + 0.34 * t; m = side * (smoothstep(c - 0.08, c - 0.065, p.y / uD.w) - smoothstep(c + 0.03, c + 0.045, p.y / uD.w)) * smoothstep(0.08, 0.15, t) * (1.0 - smoothstep(0.86, 0.93, t)); }',
      '  else if (uDecal == 3) { float r = length(vec2(p.z + 0.05 * uD.y, p.y - uD.z * 0.68)); m = side * (1.0 - smoothstep(0.3, 0.315, r)); m = max(m, side * smoothstep(uD.z * 0.32, uD.z * 0.34, p.y) * (1.0 - smoothstep(uD.z * 0.4, uD.z * 0.42, p.y))); }',
      '  else if (uDecal == 4) { m = 1.0 - smoothstep(uD.z * 0.56, uD.z * 0.6, p.y); }',
      '  else if (uDecal == 5) { m = side * smoothstep(uD.z * 0.36, uD.z * 0.4, p.y) * (1.0 - smoothstep(uD.z * 0.97, uD.z * 1.01, p.y)) * (1.0 - smoothstep(0.24 * uD.y, 0.26 * uD.y, abs(p.z - 0.05 * uD.y))); }',
      '  diffuseColor.rgb = mix(diffuseColor.rgb, uDecalCol, clamp(m, 0.0, 1.0)); }'
    ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'mxdecal';
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
    glass: new THREE.MeshStandardMaterial({ color: '#0e1824', metalness: 0.4, roughness: 0.06, transparent: true, opacity: 0.42 }),
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
  const G = carGeos(kind), M = carMats(), K = KINDS[kind], look = o.look || null;
  const root = new THREE.Group(); root.matrixAutoUpdate = false;
  const paint = K.taxi ? '#f2b81c' : hex;
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: paint, emissive: paint, emissiveIntensity: o.player ? 0.1 : 0.06, metalness: 0.45, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.08 });
  if (K.cop) decalize(bodyMat, DECAL_ID.police, '#eef0f2', K);
  else if (look && look.decal !== 'none') decalize(bodyMat, DECAL_ID[look.decal] || 0, MX.pick(MX.DECAL_COLS, look.decalCol).hex, K);
  const tailMat = new THREE.MeshBasicMaterial({ color: '#7a1018', toneMapped: false });
  const body = new THREE.Mesh(G.body, bodyMat), glass = new THREE.Mesh(G.glass, M.glass), dark = new THREE.Mesh(G.dark, M.dark);
  const head = new THREE.Mesh(G.head, M.head), tail = new THREE.Mesh(G.tail, tailMat);
  [body, glass, dark].forEach((m) => { m.castShadow = true; m.receiveShadow = false; root.add(m); });
  root.add(head, tail);
  const wheels = [];
  const wgeo = look ? wheelStyled(G.R, G.ww, look.rim, MX.pick(MX.RIM_COLS, look.rimCol).hex) : G.wheel;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((w) => {
    const pivot = new THREE.Group(); pivot.position.set(w[0] * G.wx, G.R, w[1] * G.wz);
    const mesh = new THREE.Mesh(wgeo, M.wheel); mesh.castShadow = true;
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
  // A person at the wheel, seen through the tinted glass: hands on the wheel, eyes on the road,
  // a glance in the mirror at whoever is close, a fist through the window after a pass.
  const hum = createHuman({ seed: o.seed == null ? 9 : o.seed, quality: R3 ? Math.max(1, R3.quality) : 2, lod: 'mid', castShadow: false,
    outfit: { top: o.player ? '#2a2f3a' : ['#f4f1ea', '#3a4a6a', '#7a2e2e', '#2f5d50', '#c9b79c'][(o.seed || 0) % 5], sleeves: 'short', bottom: '#23262d', legs: 'trousers' } });
  hum.play('drive', { hold: true });
  const hk = hum.height / 1.75;
  hum.group.rotation.y = Math.PI; hum.group.position.set(K.hw * 0.36, K.beltY - 0.44 - 0.42 * hk, K.cabZ0 + 0.95);
  hum.mesh.userData.keepMat = true; root.add(hum.group);
  const car = { root, kind, G, bodyMat, tailMat, tailGlowMat, headGlowMat, wheels, cone, flames: null, spin: 0, brakeOn: false, hum, emoK: '', glow: null, bar: null };
  // underglow: a pool of coloured light on the road under the car
  const gl = look ? MX.pick(MX.GLOWS, look.glow) : null;
  if (gl && gl.hex) {
    const ug = new THREE.Mesh(ARC_PLANE, additiveMat(shared().pool, gl.hex, 0.85)); ug.rotation.x = -Math.PI / 2; ug.position.set(0, 0.05, 0); ug.scale.set(K.hw * 3.4, K.L * 1.25, 1); ug.renderOrder = 2; ug.userData.keepMat = true;
    root.add(ug); car.glow = ug;
    const strip2 = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 1.6, 0.03, K.L * 0.7), new THREE.MeshBasicMaterial({ color: gl.hex, toneMapped: false })); strip2.position.set(0, 0.2, 0); strip2.userData.keepMat = true; root.add(strip2);
  }
  // the patrol car's light bar: red and blue that strobe, a glow off each, and colour thrown on the road
  if (K.cop) {
    const bar = new THREE.Group(); bar.position.set(0, K.roofY + 0.06, 0.35);
    bar.add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.09, 0.3), M.dark));
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.26), new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false })); red.position.set(-0.32, 0.09, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.26), new THREE.MeshBasicMaterial({ color: '#2050ff', toneMapped: false })); blue.position.set(0.32, 0.09, 0);
    const gR = new THREE.Mesh(ARC_PLANE, additiveMat(tg, '#ff2a2a', 0)); gR.scale.set(3.2, 2, 1); gR.position.set(-0.4, 0.1, 0); gR.userData.ov = true;
    const gB = new THREE.Mesh(ARC_PLANE, additiveMat(tg, '#2a5cff', 0)); gB.scale.set(3.2, 2, 1); gB.position.set(0.4, 0.1, 0); gB.userData.ov = true;
    [red.material, blue.material, gR.material, gB.material].forEach((mm) => { mm.userData.keepMat = true; });
    bar.add(red, blue, gR, gB); root.add(bar);
    const pool = new THREE.Mesh(ARC_PLANE, additiveMat(shared().pool, '#ff2a2a', 0)); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.06, 0); pool.scale.set(9, 11, 1); pool.renderOrder = 2; pool.userData.ov = true; pool.material.userData.keepMat = true;
    root.add(pool);
    car.bar = { red, blue, gR, gB, pool, on: false };
  }
  if (o.ghost) {
    const gm = new THREE.MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); gm.userData.keepMat = true;
    if (hum) { root.remove(hum.group); hum.dispose(); car.hum = null; }
    root.traverse((m) => { if (m.isMesh) { m.material = gm; m.castShadow = false; } });
    car.ghostMat = gm;
  }
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
  frameAt(T, dist);
  return poseFromFR(m, x, yaw, pitch, roll, lift);
}
function poseRacer(m, W, c, yaw, pitch, roll) {
  const sh = pathFrame(W, c, 0);
  return poseFromFR(m, c.x + sh, yaw, pitch, roll, 0);
}
function poseFromFR(m, x, yaw, pitch, roll, lift) {
  const fr = FR;
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
  if (c.slip) yaw += c.role === 'wreck' ? c.slip : clamp(c.slip, -0.75, 0.75);
  if (c.parked) yaw = c.parkYaw || 0;
  if (c.isPlayer) {
    if (!c.slip) yaw += clamp(c.drift * Math.sign(c.vx || 1) * 0.1, -0.12, 0.12);
    pitch = (c.brake ? 0.03 : 0) - (c.thr > 0.6 ? 0.012 : 0) - (c.nitroOn ? 0.02 : 0);
    roll = -c.lean * 0.9;
    c.pitch += (pitch - c.pitch) * Math.min(1, dt * 10); pitch = c.pitch;
    c.roll += (roll - c.roll) * Math.min(1, dt * 10); roll = c.roll;
  } else roll = -clamp(c.vx * 0.04, -0.08, 0.08);
  poseRacer(car.root.matrix, W, c, yaw, pitch, roll);
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
  if (car.hum) poseDriver(car, W, c, dt);
  if (car.flames) {
    const on = !!c.nitroOn;
    for (let i = 0; i < car.flames.length; i++) {
      const fl = car.flames[i]; fl.visible = on;
      if (on) { const k = 0.8 + Math.random() * 0.5; fl.scale.set(1, 1, k * (1 + (c.speed / BASE_MAX) * 0.4)); fl.children[0].scale.x = fl.children[0].scale.y = 0.9 + Math.random() * 0.25; }
    }
  }
  void tNow;
}

// Soft contact shadows under people who do not cast real ones (crowds, passers-by): one
// instanced draw of a dark radial blob at each pair of feet, so nobody seems to float.
let BLOB_TEX = null;
function footShadows(parent, n) {
  if (!BLOB_TEX) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    BLOB_TEX = new THREE.CanvasTexture(c);
  }
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), Math.max(1, n));
  mesh.userData.keepMat = true; mesh.renderOrder = 1; mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const api = {
    mesh,
    set(i, x, y, z, s) { m.makeScale(s, 1, s * 0.8); m.setPosition(x, y + 0.02, z); mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; },
  };
  parent.add(mesh);
  return api;
}

const _dl = new THREE.Vector3();
function poseDriver(car, W, c, dt) {
  const H = car.hum;
  _dl.setFromMatrixPosition(car.root.matrix);
  const near = R3.camera.position.distanceToSquared(_dl) < 3600;
  // far away, the figure is a dark shape behind glass: skip the work and the draw
  H.group.visible = (near && R3.quality >= 1) || c.isPlayer;
  if (!H.group.visible) return;
  const lod = R3.quality < 1 ? 'far' : 'mid'; if (H.lod !== lod) H.setLod(lod);
  H.steer = clamp(c.isPlayer ? c.steerIn : c.vx * 1.4, -1, 1);
  const E = c.emo, k = E && E.t > 0 ? E.k : '';
  if (c.isPlayer && c.emo && c.emo.t > 0) c.emo.t -= dt;
  if (k !== car.emoK) { if (k === 'fist') H.play('fistPump', { side: 'left' }); car.emoK = k; }
  if (W.phase === 'finished' && c.isPlayer && !car.cheered) { car.cheered = true; H.play('fistPump', { side: 'left' }); }
  // eyes down the road, or in the mirror at a car close behind
  if (k === 'look') { _dl.set(0, 1.2, 9).applyMatrix4(car.root.matrix); H.lookAt(_dl); }
  else { _dl.set(0, 1.0, -30).applyMatrix4(car.root.matrix); H.lookAt(_dl); }
  H.setMood(k === 'shake' ? -0.6 : k === 'fist' ? 1 : 0.1);
  H.update(dt, { speed: 0, turn: 0, accel: 0 });
  if (k === 'shake' && E) H.bones.head.rotation.y += Math.sin(W.t * 13) * 0.22 * Math.sin(Math.PI * clamp(1 - E.t / E.d, 0, 1));
}

/* ------------------------------------------------------------ people at the start */
// A crowd along the start and finish straight, behind the barriers on whichever side has ground
// to stand on, one instanced draw animated on the GPU with every member on their own timing,
// and a flag marshal who holds the flag up through the lights and waves it on GO.
function makeSpectators(T, S) {
  if (S.people) return S.people;
  const segs = T.segs, N = T.n, r = rng(808 + T.id.length * 13), members = [];
  const okSide = (sg, sd) => sg.tun ? false : T.id === 'harbour' ? (sd < 0 ? sg.gl >= 1 : sg.gr >= 1) : T.id === 'ghat' ? sg.cliff !== sd : true;
  for (let d = -46; d <= 54; d++) {
    if (T.open && (T.startSeg + d < 0 || T.startSeg + d >= N)) continue;
    const i = ((T.startSeg + d) % N + N) % N, sg = segs[i];
    for (let sd = -1; sd <= 1; sd += 2) {
      if (!okSide(sg, sd)) continue;
      for (let row = 0; row < 2; row++) {
        if (r() > 0.78) continue;
        groundBase(T, i, sd * (1.4 + row * 0.11 + r() * 0.03), _t1);
        const x = _t1.x, y = _t1.y, z = _t1.z;
        frameAt(T, i * SEG + SEG / 2); surf(0, 0, _t1);
        members.push({ x, y, z, yaw: Math.atan2(_t1.x - x, _t1.z - z) + (r() - 0.5) * 0.6 });
      }
    }
  }
  const q = R3 ? Math.max(1, R3.quality) : 2;
  const crowd = members.length ? createCrowd({ members, unit: 1, seed: 7, seated: false, quality: q, colors: ['#ff6940', '#ffb736', '#38e1ff', '#f4f1ea'], teamShare: 0.3 }) : null;
  if (crowd) { crowd.mesh.userData.keepMat = true; S.group.add(crowd.mesh); const fs = footShadows(S.group, members.length); members.forEach((mm, i) => fs.set(i, mm.x, mm.y, mm.z, 0.62)); S.feet = fs; }
  // the marshal by the start line
  const ms = T.startSeg + 2;
  let side = okSide(segs[ms], 1) ? 1 : -1;
  const m = createHuman({ seed: 61, quality: q, outfit: { top: '#ff7a1a', top2: '#f4f1ea', sleeves: 'long', bottom: '#23262d', legs: 'trousers', cap: '#ff7a1a' } });
  groundBase(T, ms, side * 1.26, _t1); m.group.position.set(_t1.x, _t1.y, _t1.z);
  frameAt(T, ms * SEG); surf(0, 0, _t1); m.group.rotation.y = Math.atan2(_t1.x - m.group.position.x, _t1.z - m.group.position.z) - side * 0.5;
  const ft = canvasTex(64, 48, (g) => { for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea'; g.fillRect(x * 8, y * 8, 8, 8); } }, { repeat: false });
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.5, metalness: 0.4 })); pole.position.y = 0.3; flag.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.4), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.9 })); cloth.position.set(0.28, 0.56, 0); flag.add(cloth);
  flag.rotation.x = Math.PI / 2; flag.position.y = -0.05; m.bones.wristR.add(flag);
  m.mesh.userData.keepMat = true; S.group.add(m.group);
  S.people = { crowd, m, cloth, cheerT: 0, phase: '' };
  return S.people;
}
const _mp = new THREE.Vector3();
function updatePeople(W, dt) {
  const pp = R3.cur && R3.cur.people; if (!pp) return;
  const P = W.P, T = W.T, dz = wrapD(P.dist - T.startSeg * SEG, T.L), near = Math.abs(dz) < 25000 && R3.quality >= 1;
  carPoint(W, P, 0, 0, 1.0, _mp);
  if (pp.crowd) {
    pp.crowd.mesh.visible = near && R3.quality >= 0;
    if (R3.cur.feet) R3.cur.feet.mesh.visible = pp.crowd.mesh.visible;
    if (near) {
      pp.crowd.update(dt, { look: _mp, excite: W.phase === 'countdown' ? 0.4 : W.phase === 'finished' ? 0.6 : 0.45 });
      pp.cheerT -= dt;
      if (pp.cheerT <= 0 && Math.abs(dz) < 4500 && W.phase !== 'countdown') { pp.crowd.react('cheer', 0.9); pp.cheerT = 3; }
    }
  }
  const m = pp.m; m.group.visible = near;
  if (!near) return;
  if (W.phase !== pp.phase) {
    if (W.phase === 'countdown') m.play('point', { hold: true, target: _mp.set(m.group.position.x, m.group.position.y + 6, m.group.position.z) });
    else { m.stop('point'); m.play('wave'); }
    pp.phase = W.phase;
  }
  carPoint(W, P, 0, 0, 1.0, _mp); m.lookAt(_mp);
  m.update(dt, { speed: 0, turn: 0, accel: 0 });
  pp.cloth.rotation.y = Math.sin(R3.time * 5.7) * 0.28;
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
  const Y0 = id === 'harbour' ? SEA_Y : id === 'neon' ? minY - 3.2 : id === 'city' ? minY - 0.07 : id === 'strip' ? minY - 0.35 : minY - 14;
  S.Y0 = Y0;

  /* ---- road */
  const roadTex = roadTexture(P), kerbTex = kerbTexture(P);
  const rough = id === 'neon' ? 0.34 : id === 'city' ? 0.48 : id === 'harbour' || id === 'strip' ? 0.62 : 0.74;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: rough, metalness: 0.0, envMapIntensity: id === 'neon' ? 1.6 : 0.9 });
  const road = new THREE.Mesh(strip(M + 1, 2, (j, k, o) => {
    frameRow(T, j); surf(k ? 1 : -1, 0, o);
    o.nx = FR.ux; o.ny = FR.uy; o.nz = FR.uz; o.u = k; o.v = j * FS * SEGM / 16;
  }), roadMat);
  road.receiveShadow = true; group.add(road);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7, metalness: 0 });
  // no kerb where a shortcut leaves or joins the road on that side
  const kerbGap = (s, j) => { const z = j * FS * SEG; for (let b = 0; b < T.branches.length; b++) { const B = T.branches[b]; if (B.side !== s) continue; if ((z > B.dA - 1500 && z < B.dA + 12000) || (z > B.dB - 12000 && z < B.dB + 1500)) return true; } return false; };
  [-1, 1].forEach((s) => {
    const kg = strip(M + 1, 2, (j, k, o) => {
      frameRow(T, j); surf(s * (k ? EDGE_X : 0.965), 0.045, o);
      o.nx = FR.ux; o.ny = FR.uy; o.nz = FR.uz; o.u = k; o.v = j * FS * SEGM / 4.8;
    }, { flip: s < 0, skip: T.branches.length ? (j) => kerbGap(s, j) || kerbGap(s, j + 1) : null });
    const km = new THREE.Mesh(kg, kerbMat); km.receiveShadow = true; group.add(km);
  });
  // start / finish line
  const lineMat = new THREE.MeshBasicMaterial({ map: startLineTexture(), toneMapped: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const lg = strip(2, 2, (j, k, o) => { frameAt(T, T.startZ); const f2 = j * 1.6; surf(k ? 0.98 : -0.98, 0.03, o); o.x += FR.fx * f2; o.y += FR.fy * f2; o.z += FR.fz * f2; o.u = k; o.v = j; });
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
    ghat: { near: '#2c3f2e', far: '#14281a', shoulder: '#55544d', rock: '#6a6c6e', rockHi: '#3e4a40' },
    city: { near: '#5a5660', far: '#3a3640', shoulder: '#625e68' },
    strip: { near: '#4a4f57', far: '#3b4048', shoulder: '#4f545c' }
  }[id];
  const flat = id === 'city' || id === 'strip';
  const base = flat ? { dm: [0, 0.7, 4.5, 9.5, 14], dy: [0, -0.01, -0.02, -0.03, -0.05] } : { dm: [0, 1.2, 13.4, 45, 95], dy: [0, -0.1, -0.22, 0, 0] };
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
      if (!flat && k === 3) bdy = drop * 0.3 - 0.2 + (id === 'ghat' ? 9 + nz * 7 : id === 'neon' ? nz * 0.8 : nz * 0.6);
      if (!flat && k === 4) bdy = drop;
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
      else if (flat) col = hexRGB(k < 1 ? C.shoulder : k < 3 ? C.near : C.far);
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
  if (id === 'neon' || id === 'city') {
    const conc = new THREE.MeshStandardMaterial({ map: SH.groundNoise, color: id === 'city' ? '#5a5560' : '#4b4963', roughness: 0.85, side: THREE.DoubleSide });
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
  const glints = [];    // each lamp's long reflection on the damp tarmac, towards the chase camera
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
      // a lamp seen in a damp road stretches towards the viewer, who is always behind the car
      frameAt(T, z - 11 / SC); const gm = new THREE.Matrix4(); surf(side * 0.74, 0.06, _t1);
      setBasis(gm, FR.rx, FR.ry, FR.rz, FR.ux, FR.uy, FR.uz, FR.fx, FR.fy, FR.fz, _t1.x, _t1.y, _t1.z);
      gm.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(2.4, 24, 1));
      glints.push({ m: gm, i: b.seg.i });
    }));
    if (its.length) addInstanced(T, group, lampParts(tint), its, 8);
  }
  if (pools.length) {
    const pm = new THREE.MeshBasicMaterial({ map: SH.pool, color: tint, transparent: true, opacity: id === 'neon' ? 0.42 : 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    addInstanced(T, group, [{ geo: ARC_PLANE, mat: pm, ov: true }], pools, 8);
    const gmat = new THREE.MeshBasicMaterial({ map: SH.pool, color: tint, transparent: true, opacity: id === 'neon' ? 0.34 : 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    addInstanced(T, group, [{ geo: ARC_PLANE, mat: gmat, ov: true }], glints, 8);
  }

  if (id === 'harbour' || id === 'strip') {
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

  if (id === 'neon' || id === 'city') {
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

  buildExtras(T, S, group, roadMat, Y0, stdLit, basicV);

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
    : new THREE.MeshStandardMaterial({ color: id === 'neon' ? '#201b33' : id === 'city' ? '#2c2830' : id === 'strip' ? '#262a31' : '#0f2016', roughness: 1, metalness: 0 });
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


/* ------------------------------------------------------------ the district: shortcuts, cross streets, lanterns, props that break, pursuit breakers */
const BRK_TYPES = ['bin', 'crate', 'cone', 'saw', 'stall', 'news'];
const BRK_COL = { bin: '#2f4a3a', crate: '#8a6a40', cone: '#ff6a1a', saw: '#f2f2ee', stall: '#c0392b', news: '#2a4f8a' };
let BRK_GEO = null;
function brkGeos() {
  if (BRK_GEO) return BRK_GEO;
  BRK_GEO = {
    bin: mergeG([cylG(0.32, 0.28, 0.95, 12, '#2f4a3a', [0, 0.475, 0]), cylG(0.35, 0.35, 0.08, 12, '#26392e', [0, 0.98, 0]), boxG(0.2, 0.05, 0.08, '#1a1a1a', [0, 1.04, 0])]),
    crate: mergeG([boxG(1.0, 0.9, 1.0, '#8a6a40', [0, 0.45, 0]), boxG(1.02, 0.08, 1.02, '#6a4f2e', [0, 0.25, 0]), boxG(1.02, 0.08, 1.02, '#6a4f2e', [0, 0.7, 0]), boxG(0.8, 0.7, 0.8, '#9a7a4a', [0.05, 1.25, 0.04], [0, 0.3, 0])]),
    cone: mergeG([cylG(0.04, 0.2, 0.7, 12, '#ff6a1a', [0, 0.38, 0]), cylG(0.12, 0.155, 0.12, 12, '#f4f1ea', [0, 0.42, 0]), boxG(0.46, 0.05, 0.46, '#1b1b1d', [0, 0.025, 0])]),
    saw: mergeG([boxG(1.9, 0.26, 0.06, '#f2f2ee', [0, 0.9, 0]), boxG(0.38, 0.26, 0.07, '#ff4a1a', [-0.5, 0.9, 0]), boxG(0.38, 0.26, 0.07, '#ff4a1a', [0.3, 0.9, 0]), boxG(1.9, 0.18, 0.06, '#f2f2ee', [0, 0.5, 0]),
      boxG(0.06, 1.0, 0.06, '#8a8f98', [-0.85, 0.5, 0.18], [0.3, 0, 0]), boxG(0.06, 1.0, 0.06, '#8a8f98', [-0.85, 0.5, -0.18], [-0.3, 0, 0]), boxG(0.06, 1.0, 0.06, '#8a8f98', [0.85, 0.5, 0.18], [0.3, 0, 0]), boxG(0.06, 1.0, 0.06, '#8a8f98', [0.85, 0.5, -0.18], [-0.3, 0, 0]),
      sphG(0.07, '#ffb020', [-0.85, 1.08, 0]), sphG(0.07, '#ffb020', [0.85, 1.08, 0])]),
    stall: mergeG([boxG(2.4, 0.08, 1.2, '#6a4a2e', [0, 0.85, 0]), boxG(0.08, 0.85, 0.08, '#4a3420', [-1.1, 0.42, 0.5]), boxG(0.08, 0.85, 0.08, '#4a3420', [1.1, 0.42, 0.5]), boxG(0.08, 0.85, 0.08, '#4a3420', [-1.1, 0.42, -0.5]), boxG(0.08, 0.85, 0.08, '#4a3420', [1.1, 0.42, -0.5]),
      boxG(0.06, 2.2, 0.06, '#4a3420', [-1.15, 1.1, -0.55]), boxG(0.06, 2.2, 0.06, '#4a3420', [1.15, 1.1, -0.55]),
      boxG(2.6, 0.06, 1.5, '#c0392b', [0, 2.15, 0.1], [0.22, 0, 0]), boxG(0.5, 0.065, 1.5, '#f4f1ea', [-0.75, 2.16, 0.1], [0.22, 0, 0]), boxG(0.5, 0.065, 1.5, '#f4f1ea', [0.25, 2.16, 0.1], [0.22, 0, 0]),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => sphG(0.12, ['#ff8a1a', '#ffd22e', '#3dbf4a', '#e03a2a'][k % 4], [-0.9 + k * 0.26, 0.97, (k % 2 ? 0.2 : -0.15)]))]),
    news: mergeG([boxG(0.7, 1.0, 0.5, '#2a4f8a', [0, 0.5, 0]), boxG(0.62, 0.3, 0.44, '#cfe3ff', [0, 1.1, 0]), boxG(0.74, 0.06, 0.54, '#1d3a66', [0, 1.28, 0])])
  };
  return BRK_GEO;
}
// a tall scaffold for the city and the neon streets, a water tank on legs elsewhere; origin at the base, +Z faces the road
let BRKR_GEO = {}, BRKR_LAMPS = null;
function breakerGeo(kind) {
  if (BRKR_GEO[kind]) return BRKR_GEO[kind];
  const P = [];
  if (kind === 'tank') {
    for (let a = 0; a < 4; a++) { const x = a & 1 ? 1.6 : -1.6, z = a & 2 ? 1.6 : -1.6; P.push(cylG(0.12, 0.16, 9, 6, '#4a3a2c', [x, 4.5, z])); }
    for (let h = 2; h <= 8; h += 3) { P.push(boxG(3.4, 0.12, 0.12, '#3a2c20', [0, h, 1.6])); P.push(boxG(3.4, 0.12, 0.12, '#3a2c20', [0, h, -1.6])); P.push(boxG(0.12, 0.12, 3.4, '#3a2c20', [1.6, h, 0])); P.push(boxG(0.12, 0.12, 3.4, '#3a2c20', [-1.6, h, 0])); }
    P.push(cylG(2.2, 2.2, 3.6, 16, '#7d6a52', [0, 10.8, 0]), prep(new THREE.ConeGeometry(2.4, 1.2, 16), '#5a4a3a', [0, 13.2, 0]), cylG(2.25, 2.25, 0.18, 16, '#4a3c2e', [0, 9.2, 0]), boxG(1.4, 0.7, 0.05, '#ffcc22', [0, 10.8, 2.22]));
  } else {
    for (let a = 0; a < 4; a++) { const x = a & 1 ? 2.8 : -2.8, z = a & 2 ? 1.1 : -1.1; P.push(cylG(0.07, 0.07, 10, 6, '#d6a83c', [x, 5, z])); }
    for (let h = 1; h <= 10; h += 3) {
      P.push(boxG(5.8, 0.09, 0.09, '#d6a83c', [0, h, 1.1]), boxG(5.8, 0.09, 0.09, '#d6a83c', [0, h, -1.1]));
      if (h > 1) P.push(boxG(5.7, 0.1, 2.3, '#8a6a40', [0, h - 0.05, 0]));
      P.push(boxG(0.07, 4.2, 0.07, '#d6a83c', [-1.4, h + 1.5, 1.1], [0, 0, 0.75]), boxG(0.07, 4.2, 0.07, '#d6a83c', [1.4, h + 1.5, 1.1], [0, 0, -0.75]));
    }
    P.push(boxG(5.8, 7.5, 0.04, '#2f8f4a', [0, 6, -1.18]), boxG(4.2, 1.1, 0.06, '#ffcc22', [0, 9.2, 1.18]));
    for (let k = 0; k < 6; k++) P.push(boxG(0.36, 1.1, 0.07, '#141518', [-1.75 + k * 0.7, 9.2, 1.2], [0, 0, 0.6]));
    P.push(boxG(1.2, 0.5, 0.6, '#5a5f68', [0, 10.4, 0]));
  }
  return (BRKR_GEO[kind] = mergeG(P));
}

function buildExtras(T, S, group, roadMat, Y0, stdLit, basicV) {
  const id = T.id, SH = shared();
  /* ---- shortcuts */
  S.branchMeshes = [];
  if (T.branches.length) {
    const bmat = roadMat.clone(); bmat.polygonOffset = true; bmat.polygonOffsetFactor = -1; bmat.polygonOffsetUnits = -2; bmat.map = roadMat.map;
    const wallTex = windowTexture(7, ['#ffd9a0', '#ffe8c0', '#ffb070']); wallTex.repeat.set(1, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, emissiveMap: wallTex, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
    const curbMat = new THREE.MeshStandardMaterial({ map: SH.groundNoise, color: '#6a6670', roughness: 0.9 });
    const lanternItems = [];
    T.branches.forEach((B) => {
      const bf = (j) => frameAtF(B.F, B.M, B.L, B.FS, j * B.FS * SEG, true);
      const rm = new THREE.Mesh(strip(B.M, 2, (j, k, o) => { bf(j); surf(k ? 0.62 : -0.62, 0.004, o); o.nx = FR.ux; o.ny = FR.uy; o.nz = FR.uz; o.u = k ? 0.75 : 0.25; o.v = j * B.FS * SEGM / 16; }), bmat);
      rm.receiveShadow = true; group.add(rm); S.branchMeshes.push(rm);
      const open = Math.round(26 / (B.FS * SEGM)), M = B.M;
      if (B.kind === 'alley') {
        [-1, 1].forEach((sd) => {
          const g = strip(M, 2, (j, k, o) => { bf(j); surf(sd * 0.78, k ? 13 : -0.05, o); o.u = j * B.FS * SEGM / 9.6; o.v = k ? 1.4 : 0; }, { flip: sd > 0, normals: true, skip: (j) => j < open || j > M - open - 2 });
          const wm = new THREE.Mesh(g, wallMat); wm.receiveShadow = true; group.add(wm);
        });
        for (let j = open; j < M - open; j += 9) { bf(j); const m = new THREE.Matrix4(); surf(0, 6.2, _t1); m.makeTranslation(_t1.x, _t1.y, _t1.z); lanternItems.push({ m, i: 0, c: new THREE.Color(['#ffb040', '#ff6a3a', '#ffd070'][j % 3]) }); }
      } else {
        [-1, 1].forEach((sd) => {
          const g = strip(M, 2, (j, k, o) => { bf(j); surf(sd * 0.7, k ? 0.32 : -0.02, o); o.u = j * B.FS * SEGM / 6; o.v = k; }, { flip: sd > 0, normals: true, skip: (j) => j < open || j > M - open - 2 });
          group.add(new THREE.Mesh(g, curbMat));
        });
      }
      // a lit arrow board at the fork, on the side the shortcut leaves from
      frameAt(T, B.dA - 4000); const am = new THREE.Matrix4(); surf(B.side * 1.32, 0, _t1);
      setBasis(am, FR.hx, FR.hy, FR.hz, 0, 1, 0, FR.fx, FR.fy, FR.fz, _t1.x, _t1.y, _t1.z);
      S.arrowItems = S.arrowItems || []; S.arrowItems.push({ m: am, i: 0, side: B.side });
    });
    if (lanternItems.length) addInstanced(T, group, [{ geo: sphG(0.22, '#ffffff', null, null, 8, 6), mat: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), colored: true }], lanternItems, 1);
    if (S.arrowItems) {
      const arrowTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#1a1206'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb020'; g.beginPath(); g.moveTo(26, 64); g.lineTo(70, 22); g.lineTo(70, 46); g.lineTo(104, 46); g.lineTo(104, 82); g.lineTo(70, 82); g.lineTo(70, 106); g.closePath(); g.fill(); g.strokeStyle = '#ffb020'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); }, { repeat: false });
      S.arrowItems.forEach((it) => {
        const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.matrix.copy(it.m);
        const pole = new THREE.Mesh(cylG(0.08, 0.08, 3.2, 6, '#3a3f46', [0, 1.6, 0]), stdLit()); grp.add(pole);
        const bg = new THREE.PlaneGeometry(1.6, 1.6); bg.translate(0, 3.0, 0.06); if (it.side > 0) bg.scale(-1, 1, 1);
        const face = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: arrowTex, toneMapped: false, side: THREE.DoubleSide })); face.rotation.y = 0; grp.add(face);
        group.add(grp);
      });
    }
  }
  /* ---- cross streets, crossings and signals */
  if (T.stubs && T.stubs.length) {
    const smat = roadMat.clone(); smat.map = roadMat.map; smat.polygonOffset = true; smat.polygonOffsetFactor = 1; smat.polygonOffsetUnits = 2;
    const sig = [], lamps = [];
    T.stubs.forEach((st, si) => {
      const wx = -st.uz, wz = st.ux, w = HW * 0.92;
      const g = strip(2, 2, (j, k, o) => { const t = j * st.len, sd = k ? 1 : -1; o.x = st.x + st.ux * t + wx * w * sd; o.z = st.z + st.uz * t + wz * w * sd; o.y = st.y - 0.012; o.u = k ? 0.85 : 0.15; o.v = t / 16; });
      group.add(new THREE.Mesh(g, smat));
      for (let sd = -1; sd <= 1; sd += 2) {
        const px = st.x + st.ux * 3 + wx * (w + 1.2) * sd, pz = st.z + st.uz * 3 + wz * (w + 1.2) * sd, m = new THREE.Matrix4();
        m.makeRotationY(Math.atan2(-st.ux, -st.uz)).setPosition(px, st.y, pz); sig.push({ m, i: 0 });
        const lm = m.clone(); lamps.push({ m: lm, i: 0, c: new THREE.Color((si + (sd > 0 ? 1 : 0)) % 2 ? '#ff3a2a' : '#3dff8a') });
      }
    });
    addInstanced(T, group, [{ geo: mergeG([cylG(0.09, 0.11, 4.6, 6, '#2a2e36', [0, 2.3, 0]), boxG(0.36, 1.0, 0.3, '#16181c', [0, 4.6, 0])]), mat: stdLit({ roughness: 0.6, metalness: 0.4 }), cast: true }], sig, 1);
    addInstanced(T, group, [{ geo: sphG(0.13, '#ffffff', [0, 4.75, 0.17], null, 8, 6), mat: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), colored: true }], lamps, 1);
  }
  /* ---- lantern strings across the streets */
  {
    const bulbs = [], warm = ['#ffb040', '#ff6a3a', '#ffd070', '#ff9a2a', '#fff0b0'];
    let n = 0;
    T.segs.forEach((sg) => sg.spr.forEach((sp) => {
      if (sp.key !== 'lant') return;
      frameAt(T, sg.i * SEG + SEG / 2);
      const nb = 17;
      for (let k = 0; k <= nb; k++) {
        const t = k / nb, x = -1.85 + 3.7 * t, sag = 1.3 * (1 - (2 * t - 1) * (2 * t - 1));
        surf(x, 8.6 - sag, _t1);
        const m = new THREE.Matrix4().makeTranslation(_t1.x, _t1.y - 0.25, _t1.z);
        bulbs.push({ m, i: sg.i, c: new THREE.Color(warm[(n + k) % warm.length]) });
      }
      n++;
    }));
    if (bulbs.length) addInstanced(T, group, [{ geo: sphG(0.16, '#ffffff', null, [1, 1.3, 1], 7, 5), mat: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), colored: true }], bulbs, 6);
  }
  /* ---- things that break */
  const G = brkGeos(), lists = {};
  BRK_TYPES.forEach((t) => (lists[t] = []));
  const rr = rng(4242);
  T.segs.forEach((sg) => sg.spr.forEach((sp) => {
    const d = T.defs[sp.key]; if (!d || !d.brk) return;
    const m = objMatrix(T, sg.i, sp.off, (rr() - 0.5) * 0.5, new THREE.Matrix4());
    const ref = { type: sp.key, idx: lists[sp.key].length, m, broken: false };
    sp.bk = ref; lists[sp.key].push(ref);
  }));
  T.branches.forEach((B) => B.props.forEach((pr) => {
    frameAtF(B.F, B.M, B.L, B.FS, pr.bs, true); surf(pr.x, 0, _t1);
    const m = new THREE.Matrix4(); setBasis(m, FR.hx, FR.hy, FR.hz, 0, 1, 0, FR.fx, FR.fy, FR.fz, _t1.x, _t1.y, _t1.z);
    m.multiply(_m4.makeRotationY((rr() - 0.5) * 1.2));
    const ref = { type: pr.key, idx: lists[pr.key].length, m, broken: false };
    pr.bk = ref; lists[pr.key].push(ref);
  }));
  S.brk = {};
  BRK_TYPES.forEach((t) => {
    const L = lists[t]; if (!L.length) return;
    const im = new THREE.InstancedMesh(G[t], stdLit({ roughness: 0.75, metalness: 0.1 }), L.length);
    L.forEach((ref, k) => im.setMatrixAt(k, ref.m));
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    QUAL_LIST.push(im); group.add(im);
    const proxy = new THREE.Mesh(G[t], im.material); proxy.matrixAutoUpdate = false;
    S.brk[t] = { im, list: L, proxy };
  });
  /* ---- pursuit breakers */
  S.breakers = [];
  const bkKind = id === 'city' || id === 'neon' ? 'scaffold' : 'tank';
  const bmat2 = stdLit({ roughness: 0.7, metalness: 0.3 });
  T.segs.forEach((sg) => sg.spr.forEach((sp) => {
    if (sp.key !== 'brkr') return;
    const base = objMatrix(T, sg.i, sp.off, 0, new THREE.Matrix4());
    const mesh = new THREE.Mesh(breakerGeo(bkKind), bmat2); mesh.matrixAutoUpdate = false; mesh.matrix.copy(base); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); QUAL_LIST.push(mesh);
    // work lamps hung on it, so it reads at night (they fall with it)
    const lamps = new THREE.Mesh(BRKR_LAMPS || (BRKR_LAMPS = mergeG([sphG(0.18, '#ffb43a', [-2.8, 10.1, 1.2]), sphG(0.18, '#ffb43a', [2.8, 10.1, 1.2]), sphG(0.14, '#ffe2a0', [-1.2, 7.2, 1.25]), sphG(0.14, '#ffe2a0', [1.2, 4.2, 1.25]), sphG(0.14, '#ffe2a0', [0, 1.4, 1.25])])), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    lamps.matrixAutoUpdate = false; mesh.add(lamps);
    // a pulsing marker on the ground in front of it, so a driver can find it
    const mk = new THREE.Mesh(ARC_PLANE, additiveMat(SH.pool, '#ff3a2a', 0.0)); mk.matrixAutoUpdate = false;
    const mm = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.08, 3.4)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(9, 7, 1));
    mk.matrix.copy(mm); mk.renderOrder = 2; group.add(mk);
    const br = { sp, seg: sg.i, dist: sg.i * SEG + SEG / 2, side: sp.off < 0 ? -1 : 1, base, mesh, mk, ang: 0, vel: 0, used: false, t: 0, depth: bkKind === 'tank' ? 1.8 : 1.2, kind: bkKind };
    sp.br = br; S.breakers.push(br);
  }));
}

/* ------------------------------------------------------------ the 3D stage: renderer, lights, sky, camera */
let R3 = null, POST = null;
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
  // a second camera for replays and cut-aways; parented to a group so the shared post pass leaves its framing alone
  const rcam = new THREE.PerspectiveCamera(50, 1, 0.2, 3200), rcamHolder = new THREE.Group(); rcamHolder.add(rcam);
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
    renderer, scene, camera, rcam, rcamHolder, camMode: 0, replay: null, hemi, moon, spots, sky, skyMat, pmrem, cur: null, cars: null, worldRef: null, TR: null, lost: false,
    quality: -1, qT: 0, qN: 0, qMax: 0, fps: 60, soft: false, lastNow: 0, camPos: new THREE.Vector3(), camTgt: new THREE.Vector3(), camUp: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0.3, 0.4, -0.8),
    shakeS: 0, time: 0, camInit: false, blink: 0
  };
  FX = createFX(scene);
  MARKS = makeMarks(scene, 240);
  R3.TR = createTraffic(scene);
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R3.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R3.soft = false; }
  arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
  arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
  // Shared post pass: bloom on street lamps, tail lights and neon, grade, grain. During the countdown the
  // camera swings round from the front quarter onto the chase shot; the results drift slowly round the car.
  POST = createPost(renderer, { arc, soft: R3.soft, intro: { yaw: 1.1, up: 0.35, back: 0.4, dur: 2.8 }, results: { yaw: 0.45, rise: 0.15 }, target: (v) => (R3.cars && R3.cars.player ? v.set(0, 0.6, 0).applyMatrix4(R3.cars.player.root.matrix) : null), look: { bloom: 0.85, bloomWide: 0.65, threshold: 0.6, sat: 1.03 } });
  // Spectacle: nitro flame jets with heat glow and speed lines, drift sparks, crash sparks and dust,
  // finish fireworks over the harbour. Thinner on low tiers; its shaders compile after the menu.
  try { VFX = createVFX(renderer, scene, camera, { quality: 2, soft: R3.soft, lights: 0 }); R3.vfxWarm = 30; } catch (e) { VFX = null; }
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
    if (o.material && !Array.isArray(o.material) && !o.userData.keepMat && !o.material.userData.keepMat) {
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
  if (MARKS) MARKS.setCap([0, 80, 160, 240][r.quality]);
  if (VFX) VFX.setQuality(r.quality);
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

function disposeOne(c) {
  if (!c) return;
  R3.scene.remove(c.root);
  if (c.hum) c.hum.dispose();
  c.bodyMat.dispose(); if (cheapCache.has(c.bodyMat)) { cheapCache.get(c.bodyMat).dispose(); cheapCache.delete(c.bodyMat); } c.tailMat.dispose(); c.tailGlowMat.dispose(); c.headGlowMat.dispose(); c.cone.material.dispose();
  if (c.flames) c.flames.forEach((f) => f.children.forEach((m) => m.material.dispose()));
  if (c.glow) c.glow.material.dispose();
  if (c.bar) [c.bar.red, c.bar.blue, c.bar.gR, c.bar.gB, c.bar.pool].forEach((m) => m.material.dispose());
  if (c.ghostMat) c.ghostMat.dispose();
}
function disposeCars() {
  if (!R3.cars) return;
  [R3.cars.player].concat(R3.cars.rivals).forEach(disposeOne);
  if (R3.cops) { R3.cops.forEach((m) => disposeOne(m.car)); R3.cops = null; }
  if (R3.ghostCar) { disposeOne(R3.ghostCar); R3.ghostCar = null; }
  R3.cars = null;
}

// spike strips (two at most) and the sprint finish arch, built the first time they are needed
function ensureSpikes() {
  if (R3.spikes) return R3.spikes;
  const piece = mergeG([boxG(HW * 0.5 - 0.1, 0.05, 0.42, '#1b1c20', [0, 0.025, 0]), ...Array.from({ length: 12 }, (_, i) => prep(new THREE.ConeGeometry(0.04, 0.14, 4), '#9aa0a8', [-HW * 0.25 + 0.22 + i * (HW * 0.5 - 0.44) / 11, 0.12, (i % 2 ? 0.1 : -0.1)])), boxG(HW * 0.5 - 0.1, 0.02, 0.06, '#ffcc22', [0, 0.06, 0.2])]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 });
  const cone = brkGeos().cone;
  const coneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  R3.spikes = [0, 1].map(() => {
    const pieces = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(piece, mat); m.matrixAutoUpdate = false; m.visible = false; R3.scene.add(m); return m; });
    const cones = [0, 1].map(() => { const m = new THREE.Mesh(cone, coneMat); m.matrixAutoUpdate = false; m.visible = false; R3.scene.add(m); return m; });
    return { pieces, cones, ref: null };
  });
  return R3.spikes;
}
function ensureFinish() {
  if (R3.finish) return R3.finish;
  const gm = new THREE.Group(); gm.matrixAutoUpdate = false;
  const steel = new THREE.MeshStandardMaterial({ color: '#2a2e36', roughness: 0.5, metalness: 0.7 });
  [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 10, 0.9), steel); p.position.set(s * 10.4, 5, 0); p.castShadow = true; gm.add(p); });
  const flagTex = canvasTex(256, 64, (g, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea'; g.fillRect(x * 16, y * 16, 16, 16); } }, { repeat: false });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(21, 2.2), new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })); banner.position.set(0, 9.4, 0); gm.add(banner);
  for (let i = -5; i <= 5; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: '#ffcf80', toneMapped: false })); l.position.set(i * 1.9, 10.7, 0); gm.add(l); }
  const lineTex = startLineTexture();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(HW * 1.96, 1.6), new THREE.MeshBasicMaterial({ map: lineTex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.03; gm.add(line);
  R3.scene.add(gm); gm.visible = false;
  return (R3.finish = gm);
}

function activateWorld(W) {
  const r = R3, T = W.T, S = buildTrackScene(T);
  if (r.cur !== S) {
    if (r.cur) r.scene.remove(r.cur.group);
    r.scene.add(S.group); r.cur = S; lookFor(T, S);
  }
  restoreProps(S);
  disposeCars();
  r.cars = { player: makeCar(W.P.kind, W.P.hex, { player: true, seed: 3, look: W.P.look }), rivals: W.rivals.map((rv, i) => makeCar(rv.kind, rv.hex, { seed: 5 + i * 11 })) };
  if (r.quality >= 1) makeSpectators(T, S);
  r.scene.add(r.cars.player.root); r.cars.rivals.forEach((c) => r.scene.add(c.root));
  if (W.cops.length) { r.cops = W.cops.map((c, i) => { const car = makeCar('cop', '#121a2e', { seed: 40 + i * 7 }); car.root.visible = false; r.scene.add(car.root); return { slot: c, car }; }); }
  if (W.ghost && W.ghost.best && KINDS[W.ghost.best.car]) { r.ghostCar = makeCar(W.ghost.best.car, '#8fd0ff', { ghost: true }); r.ghostCar.root.visible = false; r.scene.add(r.ghostCar.root); }
  if (W.police) ensureSpikes();
  const fin = (W.mode === 'sprint' || W.mode === 'drag') ? ensureFinish() : r.finish;
  if (fin) {
    fin.visible = W.mode === 'sprint' || W.mode === 'drag';
    if (fin.visible) { frameAt(T, W.raceLen); setBasis(fin.matrix, FR.hx, FR.hy, FR.hz, 0, 1, 0, FR.fx, FR.fy, FR.fz, FR.px, FR.py, FR.pz); fin.matrixWorldNeedsUpdate = true; }
  }
  assignTraffic(r.TR, W);
  FX.clear();
  if (MARKS) MARKS.clear();
  r.skid = [W.P].concat(W.rivals).map(() => [{ on: false, x: 0, y: 0, z: 0 }, { on: false, x: 0, y: 0, z: 0 }]);
  applyTier();
  r.camInit = false; r.worldRef = W;
  if (!W.attract) warmDraw(W);
}

// One hidden draw while the race loads: every pooled object (patrol cars, spikes, the roadblock,
// the ghost, breakers), everything out of view and every contact effect is drawn once into a
// single pixel, so the first
// hit, spike strip or roadblock of the race never pays for its first draw. The next frame
// clears the canvas, so nothing of it is ever seen.
const _warmHidden = [], _warmCulled = [];
function warmDraw(W) {
  const r = R3, rd = r.renderer, S = r.cur;
  if (!rd || r.lost) return;
  try {
    if (VFX) {
      carPoint(W, W.P, 0, 1500, 0.4, _v); _vq.set(_v.x, _v.y, _v.z);
      VFX.impact(_vq, _vn, { kind: 'spark', size: 0.5 });
      VFX.impact(_vq, _vn, { kind: 'powder', size: 0.5, color: '#ffb43a' });
      VFX.dust(_vq, { size: 0.6 });
      VFX.smokePlume(_vq, { size: 0.5, duration: 0.1 });
      const e = S && S.brk && S.brk[Object.keys(S.brk)[0]];
      if (e && e.proxy && e.list.length) { e.proxy.matrix.copy(e.list[0].m); e.proxy.matrixWorld.copy(e.list[0].m); VFX.shatter(e.proxy, { hide: false, pieces: 4, chunky: true }); }
      VFX.speedLines(r.camera, 1);
      VFX.update(1 / 60);
    }
    _warmHidden.length = 0;
    _warmCulled.length = 0;
    // out of view, only what can need a program of its own: anything that was hidden, and
    // transparent or two-sided surfaces (drawn back face first, as a separate program)
    const uncull = (o) => { if (o.frustumCulled && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) { _warmCulled.push(o); o.frustumCulled = false; } };
    const odd = (mt) => mt && (mt.transparent || mt.side !== THREE.FrontSide);
    r.scene.traverse((o) => {
      if (!o.visible && !o.isLight) { _warmHidden.push(o); o.visible = true; o.traverse(uncull); }
      else if (o.material && (Array.isArray(o.material) ? o.material.some(odd) : odd(o.material))) uncull(o);
    });
    r.scene.updateMatrixWorld();
    const cam = r.camera;
    rd.setScissorTest(true); rd.setScissor(0, 0, 1, 1);
    rd.render(r.scene, cam);
  } catch (err) { /* a warm draw is only an optimisation */ }
  rd.setScissorTest(false);
  for (let i = 0; i < _warmHidden.length; i++) _warmHidden[i].visible = false;
  for (let i = 0; i < _warmCulled.length; i++) _warmCulled[i].frustumCulled = true;
  _warmHidden.length = 0; _warmCulled.length = 0;
  if (VFX) { VFX.clear(); VFX.speedLines(r.camera, 0); r.nitroH = null; }
}

const _wp = new THREE.Vector3(), _wt = new THREE.Vector3(), _cu = { x: 0, y: 0, z: 0 };
// Player cameras: 0 chase, 1 close chase, 2 bumper.
function updateCamera(W, dt, a) {
  const r = R3, P = W.P, cam = r.camera, aspect = a.w / a.h, port = aspect < 0.9;
  const sp = clamp(P.speed / (BASE_MAX * 1.1), 0, 1.3);
  const mode = W.attract ? 0 : r.camMode | 0;
  const car = r.cars.player;
  if (W.attract && r.showroom) {
    // the garage: a slow walk round the car under the street lights
    car.root.visible = true;
    r.orbit = (r.orbit || 0.6) + (a.reducedMotion ? 0 : dt * 0.22);
    _wt.set(0, 0.7, 0).applyMatrix4(car.root.matrix);
    const rad = port ? 9 : 8.4;
    cam.position.set(_wt.x + Math.sin(r.orbit) * rad, _wt.y + (port ? 2.4 : 1.4), _wt.z + Math.cos(r.orbit) * rad);
    const fov = port ? 58 : 40;
    // on a wide screen the car sits to the left of the garage card instead of behind it
    if (!port) { const off = rad * Math.tan(fov * Math.PI / 360) * aspect * 0.6; _wt.x += Math.cos(r.orbit) * off; _wt.z -= Math.sin(r.orbit) * off; }
    cam.up.set(0, 1, 0); _wt.y += port ? -0.2 : 0.1; cam.lookAt(_wt);
    if (Math.abs(cam.fov - fov) > 0.01 || cam.aspect !== aspect) { cam.fov = fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    return;
  }
  car.root.visible = mode !== 2 || W.attract;
  if (mode === 2) {
    // on the bumper: low, at the nose, the road rushing at you
    _wp.set(0, 0.66, -car.G.L / 2 - 0.05).applyMatrix4(car.root.matrix);
    const sh = pathFrame(W, P, 32 / SC);
    surf(P.x + sh + P.slip * 0.3, 0.55, _cu);
    r.camPos.copy(_wp); r.camTgt.set(_cu.x, _cu.y, _cu.z);
    const sx = a.shakeX || 0, sy = a.shakeY || 0;
    r.camPos.x += sx * 0.006; r.camPos.y += sy * 0.006 + (a.reducedMotion ? 0 : Math.sin(a.time * 23) * 0.006 * sp);
    cam.position.copy(r.camPos); r.camUp.set(0, 1, 0).applyMatrix4(_m4.extractRotation(car.root.matrix)); cam.up.copy(r.camUp); cam.lookAt(r.camTgt);
    const fov = (port ? 86 : 68) + (W.fov - 84) * 1.1;
    if (Math.abs(cam.fov - fov) > 0.01 || cam.aspect !== aspect) { cam.fov = fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    return;
  }
  const close = mode === 1;
  const back = close ? (port ? 7.6 : 4.9) + sp * 1.2 : (port ? 11.4 : 6.7) + sp * 1.8 + (P.nitroOn && !a.reducedMotion ? 1.7 : 0);
  const up = close ? (port ? 3.0 : 1.7) + sp * 0.3 : (port ? 4.5 : 2.5) + sp * 0.45;
  const follow = port ? 0.92 : 0.62;
  let sh = pathFrame(W, P, -back / SC);
  surf((P.xCam + sh) * follow + sh * (1 - follow), up, _cu);
  const bankUp = { x: FR.ux, y: FR.uy, z: FR.uz };
  r.camPos.set(_cu.x, _cu.y, _cu.z);
  const ahead = (port ? 21 : 19) / SC;
  sh = pathFrame(W, P, ahead);
  surf((P.xCam + sh) * 0.42 + sh * 0.58, port ? 0.3 : close ? 0.7 : 0.9, _cu);
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

// Cinematic cameras for replays and cut-aways: trackside, helicopter, front, wheel and long-lens chase.
const SHOTS = ['trackside', 'chase', 'heli', 'wheel', 'front', 'trackside', 'heli'];
const _rc = new THREE.Vector3(), _rt = new THREE.Vector3();
function cineCamera(W, dt, a) {
  const r = R3, cam = r.rcam, P = W.P, aspect = a.w / a.h, port = aspect < 0.9, car = r.cars.player;
  car.root.visible = true;
  let fov = port ? 62 : 40;
  _rt.set(0, 0.7, 0).applyMatrix4(car.root.matrix);
  if (W.cut && W.cut.kind === 'breaker') {
    const br = W.cut.br;
    frameAt(W.T, br.dist - 26 / SC); surf(-br.side * 1.25, 2.4, _cu); _rc.set(_cu.x, _cu.y, _cu.z);
    _rt.setFromMatrixPosition(br.base); _rt.y += 3.5;
    fov = port ? 70 : 52;
  } else {
    const R = r.replay, k = R.kind;
    if (k === 'trackside') { _rc.copy(R.fix); fov = port ? 48 : 30; }
    else if (k === 'heli') { R.a += dt * 0.35; _rc.set(_rt.x + Math.sin(R.a) * 16, _rt.y + 12, _rt.z + Math.cos(R.a) * 16); fov = port ? 60 : 44; }
    else if (k === 'front') { _rc.set(0, 1.1, -7.5).applyMatrix4(car.root.matrix); fov = port ? 64 : 46; }
    else if (k === 'wheel') { _rc.set(1.6 * R.side, 0.45, 1.4).applyMatrix4(car.root.matrix); _rt.set(0.4 * R.side, 0.5, -9).applyMatrix4(car.root.matrix); fov = port ? 78 : 60; }
    else { _rc.set(0, 2.2, 13).applyMatrix4(car.root.matrix); fov = port ? 46 : 28; }
  }
  cam.position.copy(_rc); cam.up.set(0, 1, 0); cam.lookAt(_rt);
  if (Math.abs(cam.fov - fov) > 0.01 || cam.aspect !== aspect) { cam.fov = fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}
function startReplay(W) {
  if (!W || !W.rec || W.rec.count < 20 || !R3) return;
  const sp = replaySpan(W), t1 = sp[1], t0 = Math.max(sp[0], t1 - 14);
  R3.replay = { W, t0, t1, tau: t0, shot: -1, shotT: 0, kind: 'chase', fix: new THREE.Vector3(), a: Math.random() * TAU, side: 1, cool: 0.4 };
  ARC.hidePanel();
  if (POST) POST.letterbox(1);
  if (VFX) VFX.setCamera(R3.rcam);
}
function stopReplay() {
  if (!R3 || !R3.replay) return;
  R3.replay = null;
  if (POST) POST.letterbox(0);
  if (VFX) VFX.setCamera(R3.camera);
  if (LAST_OVER && ARC.state === 'over') { const W = LAST_OVER; W.over = false; reShowOver(W); }
}
function replayStep(dt, a) {
  const R = R3.replay, W = R.W;
  R.cool -= dt;
  if (R.cool <= 0 && (a.input.tap() || a.input.down('Space', 'Enter', 'Escape', 'ArrowUp', 'KeyW') || a.input.pointer.down)) { stopReplay(); return; }
  const slow = R.t1 - R.tau < 3 && !a.reducedMotion ? 0.45 : 1;
  R.tau += dt * slow;
  if (R.tau >= R.t1) { stopReplay(); return; }
  replayApply(W, R.tau);
  R.shotT -= dt;
  if (R.shotT <= 0) {
    R.shot++; R.kind = SHOTS[R.shot % SHOTS.length]; R.shotT = 2.4 + Math.random() * 0.8; R.side = Math.random() < 0.5 ? -1 : 1;
    if (R.kind === 'trackside') { const sh = pathFrame(W, W.P, 34 / SC); surf((R.side > 0 ? 1.28 : -1.28) + sh, 1.5, _cu); R.fix.set(_cu.x, _cu.y, _cu.z); }
  }
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
    const o = ob[j]; if (o === P || o.ghost) continue;
    const dz = gapZ(W, P, o);
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

// cops, the ghost, spikes and falling breakers, once a frame
function updateExtras(W, dt) {
  const r = R3, t = r.time;
  if (r.cops) {
    for (let i = 0; i < r.cops.length; i++) {
      const m = r.cops[i], c = m.slot, car = m.car;
      car.root.visible = !!c.active;
      if (!c.active) continue;
      if (c.dirty) { c.dirty = false; car.bodyMat.color.set(c.swift ? '#08080b' : '#121a2e'); car.bodyMat.emissive.set(c.swift ? '#08080b' : '#121a2e'); }
      poseCar(car, W, c, dt);
      const b = car.bar, on = c.lights && !ARC.reducedMotion, ph = (t * 3.4 + i * 0.37) % 1, rr = on && (ph < 0.22 || (ph > 0.3 && ph < 0.42)), bb = on && ph > 0.5 && (ph < 0.72 || (ph > 0.8 && ph < 0.92));
      const steady = c.lights && ARC.reducedMotion;
      b.red.material.color.set(rr || steady ? '#ff3030' : '#4a0808'); b.blue.material.color.set(bb || steady ? '#3070ff' : '#08123a');
      b.gR.material.opacity = rr ? 0.9 : 0; b.gB.material.opacity = bb ? 0.9 : 0;
      b.pool.material.opacity = rr || bb ? 0.55 : 0; if (rr) b.pool.material.color.set('#ff2a2a'); else if (bb) b.pool.material.color.set('#2a5cff');
    }
  }
  if (!r.ghostCar && W.ghost && W.ghost.best && KINDS[W.ghost.best.car] && !W.attract) { r.ghostCar = makeCar(W.ghost.best.car, '#8fd0ff', { ghost: true }); r.ghostCar.root.visible = false; r.scene.add(r.ghostCar.root); }
  if (r.ghostCar) {
    const G = W.ghost, P = W.P, gc = r.ghostCar;
    let vis = false;
    if (G && G.best && P.started && !P.finished) {
      const tl = W.t - P.lapT0, f = tl / 0.1, i0 = Math.floor(f), n = G.best.d.length;
      if (i0 >= 0 && i0 < n - 1) {
        const k = f - i0, d = P.lapIdx * W.T.L + lerp(G.best.d[i0], G.best.d[i0 + 1], k), x = lerp(G.best.x[i0], G.best.x[i0 + 1], k);
        poseMatrix(gc.root.matrix, W.T, d, x, 0, 0, 0, 0); gc.root.matrixWorldNeedsUpdate = true; vis = true;
        G.delta = (P.dist - d) / Math.max(P.speed, 2000);
      }
    }
    gc.root.visible = vis;
  }
  if (W.police && r.spikes) {
    const sp = W.police.spikes;
    for (let k = 0; k < 2; k++) {
      const vis = r.spikes[k], sk = sp[k];
      if (!sk) { vis.pieces.forEach((m) => { m.visible = false; }); vis.cones.forEach((m) => { m.visible = false; }); continue; }
      frameAt(W.T, sk.dist);
      for (let l = 0; l < 4; l++) {
        const m = vis.pieces[l]; m.visible = l !== sk.gap; if (!m.visible) continue;
        surf(LANE_X[l], 0, _cu); setBasis(m.matrix, FR.rx, FR.ry, FR.rz, FR.ux, FR.uy, FR.uz, FR.fx, FR.fy, FR.fz, _cu.x, _cu.y, _cu.z); m.matrixWorldNeedsUpdate = true;
      }
      for (let q = 0; q < 2; q++) { const m = vis.cones[q]; m.visible = true; surf(sk.gapX + (q ? 0.27 : -0.27), 0, _cu); setBasis(m.matrix, FR.rx, FR.ry, FR.rz, FR.ux, FR.uy, FR.uz, FR.fx, FR.fy, FR.fz, _cu.x, _cu.y, _cu.z); m.matrixWorldNeedsUpdate = true; }
    }
  }
  const S = r.cur;
  if (S && S.breakers) {
    const act = W.police && W.police.active && !ARC.reducedMotion;
    for (let i = 0; i < S.breakers.length; i++) {
      const b = S.breakers[i];
      b.mk.material.opacity = !b.used && W.police && W.police.active ? (act ? 0.28 + 0.22 * Math.sin(t * 6) : 0.4) : 0;
      if (b.blockT > 0) b.blockT -= dt;
      if (!b.falling) continue;
      const g = 3.6 * Math.sin(b.ang + 0.18);
      b.vel += g * dt; b.ang += b.vel * dt;
      if (b.ang >= 1.47) {
        b.ang = 1.47;
        if (!b.landed) {
          b.landed = true;
          if (VFX) { _vq.setFromMatrixPosition(b.base); frameAt(W.T, b.dist); _vq.x += FR.hx * -b.side * 4; _vq.z += FR.hz * -b.side * 4; VFX.dust(_vq, { size: 2.6 }); VFX.impact(_vq, _vn, { kind: 'dust', size: 2 }); VFX.impact(_vq, _vn, { kind: 'spark', size: 1.2 }); }
          if (!ARC.reducedMotion) W.shake = Math.max(W.shake, 7);
          ARC.sfx.noise(0.5, { freq: 200, vol: 0.35 });
        }
        b.vel = -b.vel * 0.22; if (Math.abs(b.vel) < 0.12) { b.vel = 0; b.falling = false; }
      }
      const zf = b.depth;
      b.mesh.matrix.copy(b.base).multiply(_m4.makeTranslation(0, 0, zf)).multiply(_tl.makeRotationX(b.ang)).multiply(_tm.makeTranslation(0, 0, -zf));
      b.mesh.matrixWorldNeedsUpdate = true;
    }
  }
  if (r.cars.player.glow) r.cars.player.glow.material.opacity = 0.7 + 0.12 * Math.sin(t * 2.3);
  // sirens
  const pol = W.police;
  if (pol && pol.siren > 0.01 && ARC.state === 'play' && !W.attract) {
    if (!SND.siren) SND.siren = ARC.sfx.hum('triangle');
    const f = 680 + 300 * (0.5 + 0.5 * Math.sin(t * TAU * (pol.heat >= 3 ? 1.6 : 0.55)));
    SND.siren.set(f, 0.06 * pol.siren);
  } else if (SND.siren) { SND.siren.stop(); SND.siren = null; }
}

function renderScene(W, dt, a) {
  const r = R3, T = W.T;
  r.time += dt; r.blink += dt;
  const cars = r.cars;
  poseCar(cars.player, W, W.P, dt);
  for (let i = 0; i < W.rivals.length; i++) poseCar(cars.rivals[i], W, W.rivals[i], dt);
  updateTraffic(r.TR, W);
  updateExtras(W, dt);
  const cine = !!(r.replay && r.replay.W === W) || !!(W.cut && W.cut.dur > 0);
  if (cine) cineCamera(W, dt, a); else updateCamera(W, dt, a);
  const cam = cine ? r.rcam : r.camera;
  if (r.lastCam !== cam) { r.lastCam = cam; if (VFX) VFX.setCamera(cam); if (POST && cine) POST.letterbox(1); else if (POST) POST.letterbox(0); }
  updateLights(W, dt);
  updatePeople(W, dt);
  // nitro flame feeds the particles
  if (W.P.nitroOn && FX) {
    const m = cars.player.root.matrix;
    cars.player.G.pipeX.forEach((px, i) => {
      if (i > 1 && cars.player.G.pipeX.length > 2) return;
      _wp.set(px, 0.3, cars.player.G.L / 2 + 0.3).applyMatrix4(m);
      FX.flame(_wp.x, _wp.y, _wp.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.2);
    });
  }
  // rubber on the road: the player's drifts and hard stops, and a rival locking up close by
  if (MARKS && MARKS.on && r.skid) {
    const L = T.L, P = W.P;
    for (let i = 0; i <= W.rivals.length; i++) {
      const c = i ? W.rivals[i - 1] : P, car = i ? cars.rivals[i - 1] : cars.player, st = r.skid[i]; if (!st || !car) continue;
      const near = !i || Math.abs(wrapD(c.dist - P.dist, L)) < 6000;
      const sp = c.speed / BASE_MAX;
      const on = near && sp > 0.35 && (i ? c.brake && sp > 0.55 : (c.drift > 0.55 || (c.brake && sp > 0.5)) && Math.abs(c.x) < 1.15);
      const k = i ? 0.35 : clamp(Math.max(c.drift, c.brake ? 0.7 : 0), 0.3, 1) * 0.55;
      for (let w = 0; w < 2; w++) {
        _wp.set((w ? 1 : -1) * car.G.wx, 0, car.G.wz).applyMatrix4(car.root.matrix);
        MARKS.trail(st[w], on, _wp.x, _wp.y, _wp.z, 0.22, k, 11);
      }
    }
    MARKS.update(dt);
  }
  FX.update(dt, cam, a.h * r.renderer.getPixelRatio());
  // sky, ground and rain follow the camera
  const cp = cam.position;
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
  if (VFX) {
    const P = W.P, car = cars.player;
    if (r.vfxWarm > 0 && --r.vfxWarm === 0) VFX.warm();
    VFX.setReduced(!!a.reducedMotion);
    carPoint(W, P, 0, 0, 0, _v); VFX.setGround(_v.y);
    // nitro: a flame jet from each pipe, its heat glow, and streaks at the edge of the screen
    if (P.nitroOn) {
      if (!r.nitroH) r.nitroH = car.G.pipeX.slice(0, 2).map((px) => VFX.nitro(car.root, { offset: [px, 0.3, car.G.L / 2 + 0.2], dir: [0, 0, 1], size: 1.3, color: '#5aa8ff' }));
    } else if (r.nitroH) { r.nitroH.forEach((h) => h.stop()); r.nitroH = null; }
    // a pool of blue heat on the tarmac behind the car, sparks shed off both jets
    if (!car.nGlow) car.nGlow = makeBoostGlow(car.root, car.G.L / 2 + 2.2, 2.8, 5.2, '#6fb4ff');
    r.nst = r.nst || {}; r.nst.h = r.nitroH;
    finishShow(r.show, dt, cam);
    if (!car.nzl) car.nzl = car.G.pipeX.slice(0, 2).map((px) => [px, 0.3, car.G.L / 2 + 0.2]);
    driveBoost(r.nst, !!P.nitroOn, dt, car.root, car.nGlow, car.nzl, 1, r.quality, !!a.reducedMotion);
    VFX.speedLines(cam, !W.attract && !cine && !a.reducedMotion && r.camMode !== 2 ? (P.nitroOn ? 1 : clamp((P.speed / BASE_MAX - 0.85) * 2, 0, 0.45)) : 0);
    // a hard drift throws sparks from the rear
    r.drSpark = (r.drSpark || 0) - dt;
    if (P.drift > 0.75 && r.drSpark <= 0) { r.drSpark = 0.18; _wp.set(Math.random() < 0.5 ? -car.G.wx : car.G.wx, 0.05, car.G.wz).applyMatrix4(car.root.matrix); VFX.impact(_vq.set(_wp.x, _wp.y, _wp.z), _vn, { kind: 'spark', size: 0.5 }); }
    VFX.update(dt);
  }
  if (POST) { POST.setQuality(r.quality, r.lockQ); POST.render(r.scene, cam); } else r.renderer.render(r.scene, cam);
  if (!r.firstR) { r.firstR = 1; }
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
  const tr = (x, y) => [ox + (x - minX) * sc, oy + (y - minY) * sc];
  T.map = { pts: pts.map((p) => tr(p[0], p[1])), tr, minX, minY, sc, ox, oy, cache: null, cacheKey: '', br: T.branches.map((B) => { const q = []; for (let i = 0; i < B.M; i += 2) q.push(tr(B.F[i * STRIDE], B.F[i * STRIDE + 2])); return q; }) };
  return T.map;
}
const _mpos = { x: 0, y: 0 };
function mapPos(W, M, c) {
  if (c.br >= 0) { brFrame(W.T.branches[c.br], c.bs); } else frameAt(W.T, c.dist);
  _mpos.x = M.ox + (FR.px - M.minX) * M.sc; _mpos.y = M.oy + (FR.pz - M.minY) * M.sc;
  return _mpos;
}
function drawMap(ctx, W, x, y, S) {
  const T = W.T, M = mapPts(T), pad = Math.max(6, S * 0.1), inner = S - pad * 2;
  const dpr = ARC.dpr || 1, key = T.id + '|' + S + '|' + dpr + '|' + W.mode;
  if (M.cacheKey !== key) {
    const c = makeCanvas(S * dpr, S * dpr), g = c.getContext('2d'); g.scale(dpr, dpr); g.lineJoin = 'round'; g.lineCap = 'round';
    const path = (pts, close) => { g.beginPath(); pts.forEach((p, k) => { const px = pad + p[0] * inner, py = pad + p[1] * inner; if (k) g.lineTo(px, py); else g.moveTo(px, py); }); if (close) g.closePath(); };
    path(M.pts, !T.open);
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = Math.max(6, S * 0.08); g.stroke();
    g.strokeStyle = '#d6cfc0'; g.lineWidth = Math.max(3, S * 0.04); g.stroke();
    M.br.forEach((q) => { path(q, false); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = Math.max(4, S * 0.05); g.stroke(); g.setLineDash([3, 2]); g.strokeStyle = '#9fe0ff'; g.lineWidth = Math.max(2, S * 0.025); g.stroke(); g.setLineDash([]); });
    frameAt(T, T.startZ); const s0 = M.tr(FR.px, FR.pz); g.fillStyle = ORANGE; g.fillRect(pad + s0[0] * inner - 3, pad + s0[1] * inner - 3, 6, 6);
    if (W.mode === 'sprint' || W.mode === 'drag') { frameAt(T, W.raceLen); const f0 = M.tr(FR.px, FR.pz); g.fillStyle = '#f4f1ea'; g.fillRect(pad + f0[0] * inner - 3, pad + f0[1] * inner - 3, 6, 6); }
    M.cache = c; M.cacheKey = key;
  }
  plate(ctx, x, y, S, S, 12);
  ctx.drawImage(M.cache, x, y, S, S);
  const list = W.rivals.concat([W.P]);
  for (let i = 0; i < list.length; i++) {
    const c2 = list[i], q = mapPos(W, M, c2), isP = c2.isPlayer;
    const px = x + pad + q.x * inner, py = y + pad + q.y * inner;
    ctx.beginPath(); ctx.arc(px, py, isP ? Math.max(4.5, S * 0.05) : Math.max(3.2, S * 0.034), 0, TAU);
    ctx.fillStyle = isP ? ORANGE : c2.hex; ctx.fill(); ctx.lineWidth = isP ? 2 : 1.2; ctx.strokeStyle = isP ? '#fff' : 'rgba(0,0,0,.7)'; ctx.stroke();
  }
  if (W.cops.length) {
    const fl = Math.sin(performance.now() * 0.012) > 0;
    for (let i = 0; i < W.cops.length; i++) {
      const c2 = W.cops[i]; if (!c2.active) continue;
      const q = mapPos(W, M, c2), px = x + pad + q.x * inner, py = y + pad + q.y * inner;
      ctx.beginPath(); ctx.arc(px, py, Math.max(3, S * 0.03), 0, TAU);
      ctx.fillStyle = c2.role === 'wreck' ? '#666' : c2.lights ? (fl ? '#ff3a2a' : '#3a6dff') : '#9fb4d8'; ctx.fill();
    }
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

function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
const HUDR = { cam: { x: 0, y: 0, w: 0, h: 0 } };
function drawHUD(ctx, arc, W) {
  if (R3 && R3.replay && R3.replay.W === W) return drawReplayHUD(ctx, arc, W);
  const w = arc.w, h = arc.h, P = W.P, touch = arc.touchMode, mode = W.mode, hp = arc.hudPad(), pads = touch && arc.touchStyle === 'pads', gest = touch && !pads;
  const u = clamp(Math.min(w / 700, h / 600), 0.78, 1.15), portrait = w / h < 0.9;
  const S = (v) => Math.round(v * u), F = (v) => Math.max(12, Math.round(v * u));
  const m = S(9) + 2;
  if (W.cut && W.cut.dur > 0) {
    return;
  }
  const versus = mode === 'race' || mode === 'sprint' || mode === 'drag';
  const pos = positionOf(W, P), lapNo = clamp(P.lapIdx + 1, 1, W.laps);
  const tTotal = W.phase === 'countdown' ? 0 : (P.finished ? P.finT : W.t), lapNow = (P.started && !P.finished) ? W.t - P.lapT0 : 0;
  const stored = bestOf(W.cfg.track).lap, bestL = Math.min(P.bestLap, stored == null ? Infinity : stored);
  if (R3.camMode !== 2) drawSpeedLines(ctx, arc, W);

  const aw = S(108), ah = S(66);
  plate(ctx, m, m, aw, ah, 12);
  const toGo = Math.max(0, (W.raceLen - P.dist) * SC);
  if (versus) {
    txt(ctx, String(pos), m + S(12), m + S(40), F(38), pos === 1 ? GOLD : INK, 'left', '500', F_DISP);
    const nw = ctx.measureText(String(pos)).width;
    txt(ctx, ordinal(pos).replace(/\d+/, ''), m + S(14) + nw, m + S(24), F(13), DIM, 'left', '600');
    txt(ctx, '/ ' + (W.rivals.length + 1), m + S(14) + nw + S(26), m + S(40), F(14), DIM, 'left', '600');
    txt(ctx, mode === 'race' ? 'LAP ' + lapNo + '/' + W.laps : (toGo >= 1000 ? (toGo / 1000).toFixed(1) + ' KM' : Math.round(toGo) + ' M') + ' TO GO', m + S(12), m + S(59), F(mode === 'race' ? 13 : 11), INK, 'left', '700');
  } else if (mode === 'drift') {
    txt(ctx, 'DRIFT', m + S(12), m + S(22), F(11), GOLD, 'left', '700');
    txt(ctx, MX.money(W.drift.score), m + S(12), m + S(44), F(22), INK, 'left', '700');
    txt(ctx, 'LAP ' + lapNo + '/' + W.laps, m + S(12), m + S(60), F(11), DIM, 'left', '600');
  } else if (mode === 'pursuit') {
    const pol = W.police;
    txt(ctx, 'PURSUIT', m + S(12), m + S(22), F(11), '#ff6a5a', 'left', '700');
    txt(ctx, pol && pol.state === 'evade' ? 'HIDE' : 'ESCAPE', m + S(12), m + S(46), F(22), INK, 'left', '700');
    txt(ctx, 'HEAT ' + (pol ? pol.heat : 1), m + S(12), m + S(60), F(11), GOLD, 'left', '700');
  } else {
    txt(ctx, 'LAP ' + lapNo + '/' + W.laps, m + S(12), m + S(34), F(20), INK, 'left', '700');
    txt(ctx, 'TIME TRIAL', m + S(12), m + S(55), F(11), GOLD, 'left', '600');
  }
  const bw = S(178), bh = S(66), bx = portrait ? m + aw + S(6) : Math.round((w - bw) / 2), by = m;
  plate(ctx, bx, by, bw, bh, 12);
  let rows;
  if (mode === 'drift') {
    const D = W.drift, idle = D.chain > 0 ? clamp(1 - D.idle / 1.5, 0, 1) : 0;
    rows = [['CHAIN', D.chain > 0 ? MX.money(Math.round(D.chain)) + ' x' + D.mult.toFixed(1) : '-', D.chain > 0 ? GOLD : DIM], ['TARGET', MX.money(D.target), INK], ['TIME', fmtTime(tTotal), DIM]];
    if (idle > 0) { ctx.fillStyle = 'rgba(255,183,54,.85)'; ctx.fillRect(bx + S(10), by + bh - S(6), (bw - S(20)) * idle, S(3)); }
  } else if (mode === 'pursuit') {
    const pol = W.police;
    rows = [['TIME', fmtTime(tTotal), INK], ['UNITS OUT', String(pol ? pol.wrecked : 0), INK], ['BOUNTY', '$' + MX.money(pol ? pol.bounty : 0), GOLD]];
  } else if (mode === 'drag') {
    const R = W.rivals[0], gap = R ? (P.dist - R.dist) * SC : 0;
    rows = [['TIME', fmtTime(tTotal), INK], ['GAP', (gap >= 0 ? '+' : '') + gap.toFixed(1) + ' m', gap >= 0 ? '#5dff9e' : '#ff7a6a'], ['TOP', Math.round(W.top * KMH) + ' km/h', DIM]];
  } else {
    const gd = W.ghost && W.ghost.delta != null && R3.ghostCar && R3.ghostCar.root.visible ? W.ghost.delta : null;
    rows = [['TIME', fmtTime(tTotal), INK], [gd != null ? 'GHOST' : 'LAP', gd != null ? (gd >= 0 ? '-' : '+') + Math.abs(gd).toFixed(2) : fmtTime(lapNow), gd != null ? (gd >= 0 ? '#5dff9e' : '#ff7a6a') : INK], ['BEST', bestL < Infinity ? fmtTime(bestL) : '-:--.--', P.bestLap <= (stored == null ? Infinity : stored) && P.bestLap < Infinity ? GOLD : DIM]];
    if (mode === 'sprint') rows[1] = ['TO GO', toGo >= 1000 ? (toGo / 1000).toFixed(2) + ' km' : Math.round(toGo) + ' m', INK];
  }
  for (let i = 0; i < 3; i++) {
    txt(ctx, rows[i][0], bx + S(10), by + S(19) + i * S(18), F(11), DIM, 'left', '600');
    txt(ctx, rows[i][1], bx + bw - S(10), by + S(19) + i * S(18), F(i === 0 ? 15 : 13), rows[i][2], 'right', i === 0 ? '700' : '600');
  }
  const ms = portrait ? S(100) : S(136);
  drawMap(ctx, W, w - m - ms, m, ms);
  // camera button under the map (touch), with the camera's name
  {
    const cw = S(portrait ? 100 : 136), ch = S(26), cx0 = w - m - cw, cy0 = m + ms + S(6);
    plate(ctx, cx0, cy0, cw, ch, 8);
    txt(ctx, (touch ? 'CAM: ' : 'C  CAM: ') + ['CHASE', 'CLOSE', 'BUMPER'][R3.camMode | 0], cx0 + cw / 2, cy0 + ch * 0.68, F(10), DIM, 'center', '700');
    HUDR.cam.x = cx0; HUDR.cam.y = cy0; HUDR.cam.w = cw; HUDR.cam.h = ch;
  }
  // police: heat, the search and the bust meters, the radio
  let py = m + ah + S(8);
  const pol = W.police;
  if (pol && (pol.active || pol.state === 'busted')) {
    const pw = S(portrait ? 184 : 220), ph = S(52), pxx = m;
    plate(ctx, pxx, py, pw, ph, 10);
    for (let i = 0; i < 5; i++) star(ctx, pxx + S(16) + i * S(16), py + S(16), S(6.5), i < pol.heat ? (pol.state === 'evade' ? '#9fc7ff' : GOLD) : 'rgba(251,245,236,.18)');
    let cops = 0; for (let i = 0; i < W.cops.length; i++) { const c = W.cops[i]; if (c.active && c.role !== 'wreck') cops++; }
    txt(ctx, cops + ' UNIT' + (cops === 1 ? '' : 'S'), pxx + pw - S(10), py + S(20), F(10), DIM, 'right', '700');
    const flash = (Math.sin(arc.time * 9) > 0) && !arc.reducedMotion;
    let label, fill, k;
    if (pol.state === 'evade') { label = pol.hidden ? 'HIDING: ' + pol.zoneName.toUpperCase() : 'SEARCHING'; fill = '#4aa8ff'; k = pol.cool; }
    else if (pol.bust > 0.02) { label = 'BUSTED IN ' + Math.max(0, (1 - pol.bust) * 2.4).toFixed(1); fill = '#ff3a2a'; k = pol.bust; }
    else { label = 'PURSUIT'; fill = flash ? '#ff3a2a' : '#3a6dff'; k = 0; }
    txt(ctx, label, pxx + S(10), py + S(36), F(10), pol.state === 'evade' ? '#9fc7ff' : pol.bust > 0.02 ? '#ff7a6a' : INK, 'left', '700');
    ctx.fillStyle = 'rgba(251,245,236,.14)'; ctx.fillRect(pxx + S(10), py + S(41), pw - S(20), S(5));
    ctx.fillStyle = fill; ctx.fillRect(pxx + S(10), py + S(41), (pw - S(20)) * clamp(k, 0, 1), S(5));
    py += ph + S(6);
  }
  // warnings ahead: spike strip, roadblock, breaker, shortcut
  let warn = '', sub = '', col = GOLD, gapLane = -1;
  if (pol && pol.active) {
    for (let i = 0; i < pol.spikes.length; i++) { const d = pol.spikes[i].dist - P.dist; if (d > 0 && d < 26000) { warn = 'SPIKE STRIP ' + Math.round(d * SC) + ' M'; sub = 'Gap in the ' + ['far left', 'left', 'right', 'far right'][pol.spikes[i].gap] + ' lane'; col = '#ff7a6a'; gapLane = pol.spikes[i].gap; break; } }
    if (!warn) for (let i = 0; i < W.cops.length; i++) { const c = W.cops[i]; if (c.active && c.role === 'block') { const d = gapZ(W, P, c); if (d > 0 && d < 34000) { warn = 'ROADBLOCK ' + Math.round(d * SC) + ' M'; sub = 'Find the open lane'; col = '#ff7a6a'; break; } } }
    if (!warn && R3.cur && R3.cur.breakers && P.br < 0) for (let i = 0; i < R3.cur.breakers.length; i++) { const b = R3.cur.breakers[i]; if (b.used) continue; const d = wrapD(b.dist - P.dist, W.T.L); if (d > 0 && d < 30000) { warn = 'PURSUIT BREAKER ' + Math.round(d * SC) + ' M'; sub = 'Brush past on the ' + (b.side < 0 ? 'left' : 'right'); break; } }
  }
  if (!warn && P.br < 0 && !W.attract && mode !== 'drag') for (let b = 0; b < W.T.branches.length; b++) { const B = W.T.branches[b], d = wrapD(B.dA - P.dist, W.T.L); if (d > 0 && d < 34000) { warn = (B.side < 0 ? '< ' : '') + 'SHORTCUT' + (B.side > 0 ? ' >' : ''); sub = B.name + ', keep ' + (B.side < 0 ? 'left' : 'right') + ' in ' + Math.round(d * SC) + ' m'; col = '#9fe0ff'; break; } }
  // On a narrow screen every message joins one column down the left, under the cards, so
  // nothing can sit on top of anything else; on a wide one the warning stays centred and the
  // radio column stops short of it.
  const narrow = portrait || w < 760;
  const colW = narrow ? w - ms - m * 2 - S(8) : Math.round((w - S(250)) / 2) - m - S(14);
  if (warn && W.phase === 'racing' && W.goT <= 0) {
    const ww = narrow ? Math.min(S(250), colW) : S(250), wh = S(44);
    const wx = narrow ? m : (w - ww) / 2, wy = narrow ? py : Math.round(h * 0.17);
    const tc = narrow ? wx + S(10) : w / 2, al = narrow ? 'left' : 'center';
    ctx.save(); ctx.globalAlpha = 0.92; plate(ctx, wx, wy, ww, wh, 10);
    txt(ctx, warn, tc, wy + S(19), F(14), col, al, '700'); txt(ctx, sub, tc, wy + S(36), F(11), INK, al, '600', 'Inter, sans-serif');
    if (gapLane >= 0) for (let l = 0; l < 4; l++) { ctx.fillStyle = l === gapLane ? '#5dff9e' : '#ff4a3a'; ctx.fillRect(wx + ww - S(54) + l * S(11), wy + S(8), S(8), S(4)); }
    ctx.restore();
    if (narrow) py += wh + S(6);
  }
  // radio chatter: the newest lines, fading; one line on a phone
  if (pol && (pol.active || pol.state === 'busted')) {
    const lines = narrow ? 1 : 2;
    for (let i = pol.radio.length - 1, n = 0; i >= 0 && n < lines; i--, n++) {
      const rl = pol.radio[i], age = W.t - rl.t; if (age > 7) continue;
      ctx.save(); ctx.globalAlpha = clamp(1 - (age - 5) / 2, 0, 1) * (n ? 0.65 : 1);
      ctx.font = '600 ' + F(11) + 'px ' + F_MONO; const tw = Math.min(colW, ctx.measureText(rl.text).width + S(16));
      plate(ctx, m, py, tw, S(22), 8); ctx.save(); ctx.beginPath(); ctx.rect(m + S(6), py, tw - S(12), S(22)); ctx.clip();
      txt(ctx, rl.text, m + S(8), py + S(15), F(11), '#bcd6ff', 'left', '600'); ctx.restore(); ctx.restore();
      py += S(26);
    }
  }
  const r = touch ? S(62) : S(74);
  let cx, cy;
  if (touch) { cx = Math.max(18, m) + r + 4; cy = h - (pads ? 150 : 22) - 12 - r; }
  else { cx = w - m - r - 6; cy = h - m - r - 6; }
  drawDial(ctx, cx, cy, r, P);
  if (mode === 'drag') drawDragBar(ctx, arc, W, S, F, touch ? Math.min(cy - r - S(40), h - hp.bottom - S(66) - S(70) - S(40)) : h - m - S(70));
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
    else if (P.flat > 0) txt(ctx, 'TYRES DAMAGED', nx + nw2, ny - 7, F(11), '#ff7a6a', 'right', '700');
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
      const steerLine = arc.touchStyle === 'tilt' ? 'Tilt your phone to steer' : 'Drag left or right to steer';
      const lines = !early ? ['Swipe up for nitro'] : mode === 'drag' ? (W.phase === 'countdown' ? ['Hold a finger down to rev', 'Launch with the needle in the green', 'Tap to shift up'] : ['Tap to shift up in the green', 'Swipe up for nitro', steerLine]) : [steerLine, 'Swipe up nitro, tap to drift', 'Hold a downward drag to brake'];
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
      const on = step > i, lcx = lx + lw / 2 + (i - 1) * S(58), lcy = ly + lh / 2, colOn = mode === 'drag' ? '#ffb020' : '#ff2a20';
      ctx.beginPath(); ctx.arc(lcx, lcy, S(20), 0, TAU); ctx.fillStyle = on ? colOn : '#2a1412'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(251,245,236,.3)'; ctx.stroke();
      if (on && !arc.reducedMotion) glow(ctx, lcx, lcy, S(44), colOn, 0.8);
    }
    const intro = W.ev ? W.ev.crew.name + ' - ' + W.ev.name : (MX.MODES.find((q) => q.v === mode) || { label: '' }).label.toUpperCase() + ' - ' + W.T.name.toUpperCase();
    txt(ctx, step === 0 ? intro : mode === 'drag' ? 'REV INTO THE GREEN' : 'GET SET', w / 2, ly + lh + F(22), F(step === 0 ? 13 : 15), INK, 'center', '700');
    if (W.boss && step <= 1) { const ln = W.ev.crew.boss.name + ': "' + W.ev.crew.boss.line + '"'; ctx.save(); ctx.font = 'italic 500 ' + F(13) + 'px ' + F_DISP; const tw = Math.min(w - S(30), ctx.measureText(ln).width + S(24)); plate(ctx, (w - tw) / 2, ly + lh + F(32), tw, F(30), 10); ctx.beginPath(); ctx.rect((w - tw) / 2 + 6, ly + lh + F(32), tw - 12, F(30)); ctx.clip(); txt(ctx, ln, w / 2, ly + lh + F(52), F(13), GOLD, 'center', '500', F_DISP); ctx.restore(); }
  } else if (W.goT > 0 && !W.attract) {
    const gl = W.goT / 0.9;
    ctx.globalAlpha = Math.min(1, gl * 1.5);
    const lw2 = S(206), lh2 = S(64), lx2 = (w - lw2) / 2, ly2 = Math.round(h * 0.2);
    plate(ctx, lx2, ly2, lw2, lh2, 14);
    for (let i = 0; i < 3; i++) { const gx = lx2 + lw2 / 2 + (i - 1) * S(58); ctx.beginPath(); ctx.arc(gx, ly2 + lh2 / 2, S(20), 0, TAU); ctx.fillStyle = '#3dff8a'; ctx.fill(); if (!arc.reducedMotion) glow(ctx, gx, ly2 + lh2 / 2, S(44), '#3dff8a', 0.7); }
    ctx.globalAlpha = 1;
  }
  if (W.bannerT > 0 && (W.phase === 'finished' || W.phase === 'busted')) {
    const al = Math.min(1, W.bannerT * 2, (3.2 - W.bannerT) * 4), busted = W.phase === 'busted';
    ctx.save(); ctx.globalAlpha = clamp(al, 0, 1);
    txt(ctx, busted ? 'POLICE' : W.mode === 'pursuit' ? 'PURSUIT OVER' : W.mode === 'drift' ? 'DRIFT SCORE' : 'FINISH', w / 2, Math.round(h * 0.34), F(26), busted ? '#ff6a5a' : GOLD, 'center', '700');
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 24;
    txt(ctx, W.banner, w / 2, Math.round(h * 0.34) + F(74), F(W.banner.length > 6 ? 58 : 78), INK, 'center', '500', F_DISP);
    ctx.restore();
  }
}
function drawDragBar(ctx, arc, W, S, F, y) {
  const P = W.P, D = W.drag, w = arc.w, bw = Math.min(S(340), w - S(40)), bh = S(16), x = (w - bw) / 2;
  plate(ctx, x - S(10), y - S(30), bw + S(20), bh + S(46), 12);
  txt(ctx, W.phase === 'countdown' ? 'REVS' : 'GEAR ' + P.gear, x, y - S(12), F(12), GOLD, 'left', '700');
  if (D.msgT > 0 && D.last) txt(ctx, D.last.toUpperCase(), x + bw, y - S(12), F(12), D.lastGood === 2 ? '#5dff9e' : D.lastGood === 1 ? INK : '#ff7a6a', 'right', '700');
  ctx.fillStyle = 'rgba(251,245,236,.12)'; ctx.fillRect(x, y, bw, bh);
  const z0 = W.phase === 'countdown' ? 0.55 : 0.88, z1 = W.phase === 'countdown' ? 0.82 : 0.99;
  ctx.fillStyle = 'rgba(61,255,138,.28)'; ctx.fillRect(x + bw * z0, y, bw * (z1 - z0), bh);
  ctx.fillStyle = 'rgba(255,58,42,.3)'; ctx.fillRect(x + bw * z1, y, bw * (1 - z1), bh);
  const r = clamp(P.rpm, 0, 1.04), inG = r >= z0 && r < z1;
  ctx.fillStyle = inG ? '#3dff8a' : r >= z1 ? '#ff3a2a' : '#ffd23f'; ctx.fillRect(x, y + bh * 0.25, bw * Math.min(1, r), bh * 0.5);
  if (inG && !arc.reducedMotion && W.phase !== 'countdown') glow(ctx, x + bw * r, y + bh / 2, S(26), '#3dff8a', 0.6);
  if (D.cooked) txt(ctx, 'ENGINE HOT', w / 2, y + bh + S(14), F(11), '#ff7a6a', 'center', '700');
  else if (D.limT > 0.5) txt(ctx, 'SHIFT!', w / 2, y + bh + S(14), F(11), '#ff7a6a', 'center', '700');
}
function drawReplayHUD(ctx, arc, W) {
  const R = R3.replay, w = arc.w, h = arc.h, u = clamp(Math.min(w / 700, h / 600), 0.78, 1.15), S = (v) => Math.round(v * u), F = (v) => Math.max(12, Math.round(v * u));
  const blink = arc.reducedMotion || Math.sin(arc.time * 4) > 0;
  plate(ctx, S(14), S(14), S(132), S(34), 10);
  if (blink) { ctx.beginPath(); ctx.arc(S(32), S(31), S(6), 0, TAU); ctx.fillStyle = '#ff3a2a'; ctx.fill(); }
  txt(ctx, 'REPLAY', S(46), S(36), F(14), INK, 'left', '700');
  const k = clamp((R.tau - R.t0) / Math.max(0.1, R.t1 - R.t0), 0, 1), bw = Math.min(S(320), w - S(60));
  ctx.fillStyle = 'rgba(251,245,236,.18)'; ctx.fillRect((w - bw) / 2, h - S(40), bw, S(4));
  ctx.fillStyle = GOLD; ctx.fillRect((w - bw) / 2, h - S(40), bw * k, S(4));
  txt(ctx, arc.touchMode ? 'Tap to skip' : 'Press any key to skip', w / 2, h - S(52), F(11), DIM, 'center', '600', 'Inter, sans-serif');
  txt(ctx, R.kind.toUpperCase() + ' CAM', w - S(16), S(36), F(11), DIM, 'right', '700');
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
  '.mx-earn{width:100%;border-collapse:collapse;margin:2px 0 12px;font-size:13px}.mx-earn td{padding:4px 2px;color:var(--ink-dim);border-bottom:1px dashed var(--rule)}.mx-earn td:last-child{text-align:right;font-family:var(--font-mono);color:var(--ink)}' +
  '.mx-earn tr.tot td{color:var(--ink);font-weight:600;border-bottom:none;padding-top:8px}.mx-earn tr.neg td:last-child{color:#ff7a6a}' +
  '.mx-unlock{font-size:14px;color:var(--accent-warm);margin:4px 0 10px}.mx-boss{font-family:var(--font-display);font-style:italic;color:var(--ink);font-size:16px}' +
  '.mx-prof{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0 0 10px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}.mx-prof b{color:var(--ink);font-weight:600;letter-spacing:0;font-size:13px}' +
  '.mx-next{margin:0 0 10px;padding:8px 10px;border:1px solid var(--rule-strong);border-radius:10px;font-size:13px;color:var(--ink-dim)}.mx-next b{color:var(--ink)}' +
  '.mx-gar h3,.mx-help h3,.mx-crew h3{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-mute);margin:14px 0 6px;font-weight:600}' +
  '.mx-chips{display:flex;flex-wrap:wrap;gap:6px}.mx-chip{min-height:32px;padding:0 10px;border-radius:999px;border:1px solid var(--rule-strong);background:var(--bg-deep);color:var(--ink-dim);font:500 12px var(--font-body);cursor:pointer}' +
  '.mx-chip[aria-pressed="true"]{border-color:var(--accent-warm);color:var(--ink);box-shadow:inset 0 0 0 1px var(--accent-warm)}.mx-chip i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:6px;vertical-align:-1px;box-shadow:0 0 0 1px rgba(251,245,236,.4)}' +
  '.mx-chip:disabled{opacity:.45;cursor:default}' +
  '.mx-up{display:grid;grid-template-columns:1fr auto auto;gap:4px 10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--rule)}.mx-up b{font-size:14px;color:var(--ink);font-weight:600}.mx-up small{display:block;font-size:12px;color:var(--ink-mute)}' +
  '.mx-pips{display:flex;gap:3px}.mx-pips i{width:12px;height:6px;border-radius:2px;background:var(--rule)}.mx-pips i.on{background:var(--accent-warm)}' +
  '.mx-buy{min-height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--accent-warm);background:transparent;color:var(--ink);font:600 12px var(--font-mono);cursor:pointer}.mx-buy:disabled{opacity:.4;cursor:default;border-color:var(--rule-strong)}' +
  '.mx-cash{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--font-mono);font-size:20px;color:var(--ink);margin:0 0 10px}.mx-cash span{font-size:12px;color:var(--ink-mute);letter-spacing:.08em;text-transform:uppercase}' +
  '.mx-crew{margin:6px 0 12px;padding:10px;border:1px solid var(--rule-strong);border-radius:12px;background:var(--bg-deep)}.mx-crew.locked{opacity:.55}.mx-crew p{font-size:13px;margin:0 0 8px;color:var(--ink-dim)}' +
  '.mx-ev{display:grid;grid-template-columns:1fr auto;gap:2px 10px;width:100%;text-align:left;padding:8px 10px;margin:4px 0;border-radius:9px;border:1px solid var(--rule);background:transparent;color:var(--ink-dim);font:500 13px var(--font-body);cursor:pointer}' +
  '.mx-ev b{color:var(--ink);font-weight:600}.mx-ev small{grid-column:1/-1;font-size:11px;color:var(--ink-mute);font-family:var(--font-mono);letter-spacing:.04em}.mx-ev .st{font-family:var(--font-mono);font-size:11px;align-self:center}' +
  '.mx-ev.done .st{color:#5dff9e}.mx-ev.open{border-color:var(--accent-warm)}.mx-ev:disabled{cursor:default}.mx-ev.boss b::after{content:" BOSS";font-family:var(--font-mono);font-size:10px;color:#ff6a5a;letter-spacing:.1em}' +
  '.mx-help p{font-size:13px;margin:0 0 8px;color:var(--ink-dim)}.mx-keys{width:100%;border-collapse:collapse;font-size:13px}.mx-keys td{padding:4px 2px;border-bottom:1px solid var(--rule);color:var(--ink-dim)}.mx-keys td:first-child{font-family:var(--font-mono);font-size:12px;color:var(--ink);width:48%}' +
  '.arc-card:has(.mx-prev),.arc-card:has(.mx-help),.arc-card:has(.mx-crew){padding-bottom:0}.arc-card:has(.mx-prev) .arc-actions,.arc-card:has(.mx-help) .arc-actions,.arc-card:has(.mx-crew) .arc-actions{position:sticky;bottom:0;background:var(--bg-elev);padding:12px 0 clamp(14px,3vw,22px);margin-top:8px;box-shadow:0 -14px 14px var(--bg-elev);z-index:2}' +
  '.arc-card:has(.mx-prev) p{font-size:14px;margin-bottom:10px}.arc-card:has(.mx-prev) h2{margin:4px 0 8px}' +
  '@media (pointer:fine){.arc-card:has(.mx-prev) .arc-seg button{min-height:34px;padding:0 12px;font-size:13px}.arc-card:has(.mx-prev) .arc-opts{gap:7px;margin-bottom:6px}}' +
  '@media (max-width:420px){.mx-prev{grid-template-columns:110px 1fr;gap:10px}.arc-stage .mx-prev canvas{width:110px;height:70px}}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }

// A small side view of a car with its paint, wheels, stripes and underglow, on a track's night.
function drawPreview(cv, kind, look, track) {
  const g = cv.getContext('2d'), pal = PAL[track] || PAL.harbour, K = KINDS[kind] || KINDS.kestrel, W = cv.width, H = cv.height;
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
  const gl = look ? MX.pick(MX.GLOWS, look.glow) : null;
  if (gl && gl.hex) { const gg = g.createRadialGradient(W / 2, gy, 2, W / 2, gy, K.L * sc * 0.62); gg.addColorStop(0, rgba(gl.hex, 0.85)); gg.addColorStop(1, rgba(gl.hex, 0)); g.fillStyle = gg; g.fillRect(0, gy - 30, W, 40); }
  g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(W / 2, gy + 2, K.L * sc * 0.5, 5, 0, 0, TAU); g.fill();
  const col = look ? colorHex(look.paint) : '#e8452c', f = -K.L / 2, r = K.L / 2;
  const body = [[f, 0.3], [f + 0.1, K.noseY], [f + 1.1, K.hoodY], [K.cabZ0 + 0.3, K.beltY], [K.cabZ0 + 1.0, K.roofY], [K.cabZ1 - 0.8, K.roofY - 0.02], [K.cabZ1, K.tailY - 0.02], [r, K.tailY - 0.1], [r, 0.42], [r - 0.3, 0.26], [f + 0.3, 0.26]];
  g.beginPath(); body.forEach((p, i) => { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.closePath();
  g.fillStyle = col; g.fill(); g.save(); g.clip();
  if (look && look.decal !== 'none') {
    const dc = MX.pick(MX.DECAL_COLS, look.decalCol).hex; g.fillStyle = dc;
    if (look.decal === 'stripes') { g.fillRect(0, Y(K.roofY + 0.05), W, 3); g.fillRect(0, Y(K.hoodY + 0.04), W, 2); }
    else if (look.decal === 'flash') { g.beginPath(); g.moveTo(X(f + 0.3), Y(0.42)); g.lineTo(X(r - 0.2), Y(K.beltY - 0.05)); g.lineTo(X(r - 0.2), Y(K.beltY - 0.2)); g.lineTo(X(f + 0.3), Y(0.32)); g.fill(); }
    else if (look.decal === 'number') { g.beginPath(); g.arc(X(-0.05 * K.L), Y(K.beltY * 0.62), 0.3 * sc, 0, TAU); g.fill(); g.fillStyle = col; g.font = '700 ' + Math.round(0.34 * sc) + 'px ' + F_MONO; g.textAlign = 'center'; g.fillText('7', X(-0.05 * K.L), Y(K.beltY * 0.5)); }
    else if (look.decal === 'split') g.fillRect(0, Y(K.beltY * 0.58), W, H);
  }
  const sh = g.createLinearGradient(0, Y(K.roofY), 0, Y(0.2)); sh.addColorStop(0, 'rgba(255,255,255,.35)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H); g.restore();
  const gl2 = [[K.cabZ0 + 0.42, K.beltY + 0.02], [K.cabZ0 + 1.05, K.roofY - 0.1], [K.cabZ1 - 0.85, K.roofY - 0.12], [K.cabZ1 - 0.2, K.tailY - 0.1], [K.cabZ1 - 0.3, K.beltY + 0.02]];
  g.beginPath(); gl2.forEach((p, i) => { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); g.closePath();
  g.fillStyle = '#0b1220'; g.fill(); g.fillStyle = 'rgba(160,200,255,.18)'; g.fill();
  const rim = look ? MX.pick(MX.RIM_COLS, look.rimCol).hex : '#b9bec7';
  [-1, 1].forEach((s2) => { const wx = X(s2 * (K.L / 2 - 0.88)), wy = Y(0.34); g.beginPath(); g.arc(wx, wy, 0.37 * sc, 0, TAU); g.fillStyle = '#0a0a0c'; g.fill(); g.beginPath(); g.arc(wx, wy, (look && look.rim === 'dish' ? 0.27 : 0.22) * sc, 0, TAU); g.fillStyle = rim; g.fill(); g.beginPath(); g.arc(wx, wy, 0.07 * sc, 0, TAU); g.fillStyle = '#444'; g.fill(); });
  g.fillStyle = '#fff3d2'; g.fillRect(X(f) - 1, Y(K.noseY - 0.1), 3, 3);
  glow(g, X(f) - 4, Y(K.noseY - 0.1), 22, '#fff0cc', 0.7);
  g.fillStyle = '#ff3b30'; g.fillRect(X(r) - 2, Y(K.tailY - 0.25), 3, 3); glow(g, X(r), Y(K.tailY - 0.25), 20, '#ff3030', 0.7);
  if (K.wing === 'big') { g.fillStyle = '#16171b'; g.fillRect(X(r - 0.5), Y(K.tailY + 0.55), 0.6 * sc, 3); }
}
const statBars = (st) => {
  const bar = (l, v) => '<span>' + l + '</span><div class="mx-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div>';
  return bar('Top speed', (st.top - 0.8) / 0.5) + bar('Accel', (st.acc - 0.7) / 0.75) + bar('Grip', (st.grip - 0.7) / 0.7) + bar('Drift', ((st.drift || 1) - 0.7) / 0.8);
};
function refreshPreview() {
  const card = document.querySelector('.arc-card'); if (!card) return;
  if (ARC.choices.car && SAVE.owned.indexOf(ARC.choices.car) >= 0 && SAVE.cur !== ARC.choices.car) { SAVE.cur = ARC.choices.car; writeSave(); }
  const cv = card.querySelector('.mx-cv'), st = card.querySelector('.mx-stat');
  if (cv && st && !card.querySelector('.mx-gar')) {
    const kind = SAVE.cur, k = KINDS[kind], cs = MX.carSave(SAVE, kind), s2 = MX.statsFor(k, cs.up);
    try { drawPreview(cv, kind, cs, ARC.choices.mode === 'drag' ? 'strip' : ARC.choices.track); } catch (e) { /* the menu must always open */ }
    st.innerHTML = '<div class="mx-name">' + ARC.esc(k.name) + ' <small style="font-family:var(--font-mono);font-size:11px;color:var(--ink-mute)">PR ' + MX.ratingOf(s2) + '</small></div>' + statBars(s2) + '<div class="mx-blurb">' + ARC.esc(k.blurb) + '</div>';
  }
  const bl = card.querySelector('.mx-mode'); if (bl) bl.innerHTML = modeLine();
}
function modeLine() {
  const m = MX.MODES.find((q) => q.v === ARC.choices.mode) || MX.MODES[1];
  let h = '<p>' + ARC.esc(m.blurb) + '</p>';
  if (m.v === 'career') {
    const ev = MX.nextEvent(SAVE);
    h += '<div class="mx-next">Next: <b>' + ARC.esc(ev.crew.name + ' - ' + ev.name) + '</b><br>' + ARC.esc(modeName(ev.mode) + ' on ' + TRACK_NAME(ev.track) + ', ' + ev.diff + (ev.heat ? ', police heat ' + ev.heat : '') + '. Prize $' + MX.money(ev.reward)) + '</div>';
  }
  if (m.v === 'drag') h += '<p style="font-size:12px;color:var(--ink-mute)">Drag races run on Dockside Strip, whatever track is picked.</p>';
  return h;
}
const modeName = (v) => (MX.MODES.find((q) => q.v === v) || { label: v }).label;

function menuProps() {
  const P = MX.crewProgress(SAVE), crew = MX.CREWS[P.crew];
  ARC.choices.car = SAVE.cur;
  return {
    eyebrow: 'Street racing', title: 'Midnight <em>Apex</em>', noBest: true,
    html: '<div class="mx-prof"><span>Cash<b> $' + MX.money(SAVE.cash) + '</b></span><span>Rep<b> ' + MX.money(SAVE.rep) + '</b></span><span>Crew<b> ' + ARC.esc(crew.name) + '</b></span><span>Events<b> ' + P.done + '/' + P.total + '</b></span></div>' +
      '<div class="mx-prev"><canvas class="mx-cv" width="264" height="168"></canvas><div class="mx-stat"></div></div>' +
      '<div class="mx-mode"></div>',
    options: [
      { id: 'mode', label: 'Mode', value: 'race', choices: MX.MODES.map((m) => ({ v: m.v, label: m.label })) },
      { id: 'track', label: 'Track', value: 'harbour', choices: TRACK_ORDER.map((id) => ({ v: id, label: PAL[id].name })) },
      { id: 'car', label: 'Car', value: SAVE.cur, choices: SAVE.owned.map((id) => ({ v: id, label: KINDS[id].name })) },
      { id: 'diff', label: 'Difficulty', value: 'pro', choices: [{ v: 'rookie', label: 'Rookie' }, { v: 'pro', label: 'Pro' }, { v: 'legend', label: 'Legend' }] },
      { id: 'cops', label: 'Police in races', value: 'off', choices: [{ v: 'off', label: 'Off' }, { v: 'on', label: 'On' }] },
      { id: 'auto', label: 'Auto gas', value: ARC.touchMode ? 'on' : 'off', choices: [{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }] }
    ],
    actions: [
      { label: 'Play', primary: true, on: () => ARC.start() },
      { label: 'Garage', on: () => openGarage() },
      { label: 'Career', on: () => openCareer() },
      { label: 'How to play', on: () => openHelp() },
      { label: 'All games', href: '/games' }
    ]
  };
}

/* ------------------------------------------------------------ the garage */
let GSEL = null;
function garageHtml() {
  const esc = ARC.esc, kind = GSEL, K = KINDS[kind], owned = SAVE.owned.indexOf(kind) >= 0, cs = MX.carSave(SAVE, kind), st = MX.statsFor(K, cs.up), meta = MX.CAR_META[kind];
  const chip = (g, label, on, dot, dis) => '<button type="button" class="mx-chip" data-g="' + g + '" aria-pressed="' + (on ? 'true' : 'false') + '"' + (dis ? ' disabled' : '') + '>' + (dot ? '<i style="background:' + dot + '"></i>' : '') + esc(label) + '</button>';
  let h = '<div class="mx-gar"><div class="mx-cash">$' + MX.money(SAVE.cash) + '<span>Rep ' + MX.money(SAVE.rep) + '</span></div>';
  h += '<div class="mx-chips">' + MX.PLAYER_CARS.map((k) => chip('car:' + k, KINDS[k].name + (SAVE.owned.indexOf(k) >= 0 ? (SAVE.cur === k ? ' (driving)' : '') : MX.CAR_META[k].unlock ? ' (locked)' : ' $' + MX.money(MX.CAR_META[k].price)), k === kind)).join('') + '</div>';
  h += '<div class="mx-prev" style="margin-top:10px"><canvas class="mx-cv" width="264" height="168"></canvas><div class="mx-stat"><div class="mx-name">' + esc(K.name) + ' <small style="font-family:var(--font-mono);font-size:11px;color:var(--ink-mute)">' + esc(meta.tier) + ' - PR ' + MX.ratingOf(st) + '</small></div>' + statBars(st) + '<div class="mx-blurb">' + esc(K.blurb) + '</div></div></div>';
  if (owned) h += SAVE.cur === kind ? '<p style="font-size:13px;color:var(--accent-warm);margin:0 0 4px">This is the car you race.</p>' : '<button type="button" class="mx-buy" data-g="use">Race this car</button>';
  else { const cb = MX.canBuy(SAVE, kind); h += '<button type="button" class="mx-buy" data-g="buy"' + (cb.ok ? '' : ' disabled') + '>' + (meta.unlock ? esc(meta.note) : 'Buy for $' + MX.money(meta.price)) + '</button>' + (cb.ok || meta.unlock ? '' : ' <small style="color:var(--ink-mute);font-size:12px">' + esc(cb.why) + '</small>'); }
  h += '<h3>Performance parts</h3>';
  MX.UPGRADES.forEach((u) => {
    const lv = cs.up[u.id] | 0, cost = u.cost[lv], can = owned && lv < 3 && SAVE.cash >= cost;
    h += '<div class="mx-up"><div><b>' + esc(u.name) + '</b><small>' + esc(u.text) + '</small></div><div class="mx-pips">' + [0, 1, 2].map((i) => '<i class="' + (i < lv ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<button type="button" class="mx-buy" data-g="up:' + u.id + '"' + (can ? '' : ' disabled') + '>' + (lv >= 3 ? 'Maxed' : '$' + MX.money(cost)) + '</button></div>';
  });
  const dis = !owned;
  h += '<h3>Paint</h3><div class="mx-chips">' + MX.PAINTS.map((p) => chip('paint:' + p.id, p.name, cs.paint === p.id, p.hex, dis)).join('') + '</div>';
  h += '<h3>Wheels</h3><div class="mx-chips">' + MX.RIMS.map((p) => chip('rim:' + p.id, p.name, cs.rim === p.id, null, dis)).join('') + '</div>';
  h += '<div class="mx-chips" style="margin-top:6px">' + MX.RIM_COLS.map((p) => chip('rimCol:' + p.id, p.name, cs.rimCol === p.id, p.hex, dis)).join('') + '</div>';
  h += '<h3>Livery</h3><div class="mx-chips">' + MX.DECALS.map((p) => chip('decal:' + p.id, p.name, cs.decal === p.id, null, dis)).join('') + '</div>';
  h += '<div class="mx-chips" style="margin-top:6px">' + MX.DECAL_COLS.map((p) => chip('decalCol:' + p.id, p.name, cs.decalCol === p.id, p.hex, dis || cs.decal === 'none')).join('') + '</div>';
  h += '<h3>Underglow</h3><div class="mx-chips">' + MX.GLOWS.map((p) => chip('glow:' + p.id, p.name, cs.glow === p.id, p.hex || null, dis)).join('') + '</div>';
  return h + '</div>';
}
function openGarage() {
  if (NO3D) return;
  engineStop(); if (R3) { R3.replay = null; R3.showroom = true; }
  if (!GSEL) GSEL = SAVE.cur;
  ARC.state = ARC.state === 'over' ? 'menu' : ARC.state;
  ARC.panel({ eyebrow: 'Garage', title: 'Your <em>garage</em>', html: garageHtml(), actions: [{ label: 'Done', primary: true, on: () => { if (R3) R3.showroom = false; ARC.menu(); } }] });
  paintGarage();
}
function paintGarage() {
  const card = document.querySelector('.arc-card'); if (!card) return;
  const cv = card.querySelector('.mx-cv'); if (cv) { try { drawPreview(cv, GSEL, MX.carSave(SAVE, GSEL), ARC.choices.track); } catch (e) { /* preview only */ } }
}
function garageClick(g) {
  const [k, v] = g.split(':');
  const cs = MX.carSave(SAVE, GSEL);
  if (k === 'car') GSEL = v;
  else if (k === 'use') { SAVE.cur = GSEL; ARC.choices.car = GSEL; ARC.store.set('arcade.midnight-apex.car', GSEL); }
  else if (k === 'buy') { const cb = MX.canBuy(SAVE, GSEL); if (!cb.ok) { ARC.toast('Not yet', cb.why, 1200); return; } SAVE.cash -= MX.CAR_META[GSEL].price; SAVE.owned.push(GSEL); SAVE.cur = GSEL; ARC.choices.car = GSEL; ARC.toast(KINDS[GSEL].name, 'Bought. It is in your garage.', 1400); ARC.haptic('success', 0.7); }
  else if (k === 'up') { const u = MX.UPGRADES.find((q) => q.id === v), lv = cs.up[v] | 0; if (lv >= 3 || SAVE.cash < u.cost[lv]) return; SAVE.cash -= u.cost[lv]; cs.up[v] = lv + 1; ARC.toast(u.name + ' level ' + (lv + 1), 'Fitted', 900); ARC.sfx.tone(520 + lv * 120, 0.12, { type: 'triangle', vol: 0.14 }); }
  else if (SAVE.owned.indexOf(GSEL) >= 0 && (k === 'paint' || k === 'rim' || k === 'rimCol' || k === 'decal' || k === 'decalCol' || k === 'glow')) cs[k] = v;
  writeSave();
  const card = document.querySelector('.arc-card'), box = card && card.querySelector('.mx-gar');
  if (box) { const sc = card.scrollTop; box.outerHTML = garageHtml(); card.scrollTop = sc; paintGarage(); }
  if (Wd && Wd.attract) Wd.attractKey = '';
}

/* ------------------------------------------------------------ the career ladder */
function careerHtml() {
  const esc = ARC.esc, P = MX.crewProgress(SAVE);
  let h = '<div class="mx-cash">$' + MX.money(SAVE.cash) + '<span>Rep ' + MX.money(SAVE.rep) + ' - ' + P.done + ' of ' + P.total + ' won</span></div>';
  MX.CREWS.forEach((c, ci) => {
    const open = MX.crewOpen(SAVE, ci);
    h += '<div class="mx-crew' + (open ? '' : ' locked') + '"><h3>' + esc(c.name + ' - ' + c.turf) + '</h3>';
    h += '<p>' + (open ? esc('Boss: ' + c.boss.name + '. "' + c.boss.line + '"') : esc(ci && !SAVE.done[MX.CREWS[ci - 1].events[3].id] ? 'Beat ' + MX.CREWS[ci - 1].boss.name + ' to be noticed.' : 'Needs ' + c.rep + ' rep.')) + '</p>';
    c.events.forEach((e) => {
      const done = !!SAVE.done[e.id], can = MX.eventOpen(SAVE, e);
      const sub = modeName(e.mode) + ' - ' + TRACK_NAME(e.track) + ' - ' + e.diff + (e.laps ? ' - ' + e.laps + ' laps' : '') + (e.heat ? ' - police heat ' + e.heat : '') + (e.target ? ' - target ' + MX.money(e.target) : '') + ' - $' + MX.money(e.reward);
      h += '<button type="button" class="mx-ev' + (done ? ' done' : '') + (can && !done ? ' open' : '') + (e.boss ? ' boss' : '') + '" data-g="ev:' + e.id + '"' + (can ? '' : ' disabled') + '><b>' + esc(e.name) + '</b><span class="st">' + (done ? 'WON' : can ? 'RACE' : 'LOCKED') + '</span><small>' + esc(sub) + '</small></button>';
    });
    h += '</div>';
  });
  return h;
}
function openCareer() {
  if (NO3D) return;
  engineStop(); if (R3) { R3.replay = null; R3.showroom = false; }
  ARC.state = ARC.state === 'over' ? 'menu' : ARC.state;
  ARC.panel({ eyebrow: 'Career', title: 'The <em>crews</em>', html: careerHtml(), actions: [{ label: 'Race next event', primary: true, on: () => { PENDING = MX.nextEvent(SAVE); ARC.start(); } }, { label: 'Back', on: () => ARC.menu() }] });
}
function openHelp() {
  ARC.panel({ eyebrow: 'Midnight Apex', title: 'How to <em>play</em>', html: MX.helpHtml(ARC.esc), actions: [{ label: 'Back', primary: true, on: () => ARC.menu() }] });
}
function onCardClick(e) {
  const b = e.target.closest('[data-g]'); if (!b || b.disabled) return;
  const g = b.getAttribute('data-g');
  ARC.sfx.unlock();
  if (g.indexOf('ev:') === 0) { const ev = MX.EVENT_BY_ID[g.slice(3)]; if (ev && MX.eventOpen(SAVE, ev)) { PENDING = ev; ARC.start(); } return; }
  garageClick(g);
}

function stopAll() { engineStop(); }

function debugState() {
  const W = Wd, a = ARC;
  if (!W) return { phase: 'none', state: a.state };
  const P = W.P, pol = W.police;
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, track: W.cfg.track, mode: W.mode, diff: W.cfg.diff, lap: clamp(P.lapIdx + 1, 1, W.laps), position: positionOf(W, P),
    speed: Math.round(P.speed * KMH), speedRaw: Math.round(P.speed), nitro: Math.round(P.nitro), nitroOn: P.nitroOn, playerX: +P.x.toFixed(3), distance: Math.round(P.dist),
    totalTime: +(P.finished ? P.finT : W.t).toFixed(2), lapTimes: P.lapTimes.map((t) => +t.toFixed(2)), bestLap: P.bestLap < Infinity ? +P.bestLap.toFixed(2) : null,
    gear: P.gear, rpm: +P.rpm.toFixed(2), drift: +P.drift.toFixed(2), slip: +P.slip.toFixed(2), draft: +P.draft.toFixed(2), crashes: P.crashes, crashLog: P.crashLog, nearMisses: P.nearMisses, trackLen: W.T.L, raceLen: isFinite(W.raceLen) ? W.raceLen : null,
    branch: P.br, props: W.earn.propsN, flat: +Math.max(0, P.flat).toFixed(1), camera: R3 ? R3.camMode : 0,
    rivals: W.rivals.map((r) => ({ name: r.name, dist: Math.round(r.dist), x: +r.x.toFixed(2), speed: Math.round(r.speed * KMH), pos: positionOf(W, r), finished: r.finished, br: r.br })),
    traffic: W.traffic.length, results: W.results,
    police: pol ? { state: pol.state, heat: pol.heat, xp: +pol.xp.toFixed(2), cool: +pol.cool.toFixed(2), bust: +pol.bust.toFixed(2), cops: W.cops.filter((c) => c.active).map((c) => c.role + ':' + Math.round(gapZ(W, P, c))), wrecked: pol.wrecked, spikes: pol.spikes.length, breakers: pol.breakers, radio: pol.radio.length ? pol.radio[pol.radio.length - 1].text : '' } : null,
    driftScore: W.drift ? Math.round(W.drift.score) : null, chain: W.drift ? Math.round(W.drift.chain) : null, dragGear: W.drag ? P.gear : null, shifts: W.drag ? W.drag.shifts : null, launch: W.drag ? W.drag.launch : null,
    ghost: W.ghost ? { best: W.ghost.best ? +W.ghost.best.t.toFixed(2) : null, n: W.ghost.n, delta: W.ghost.delta != null ? +W.ghost.delta.toFixed(2) : null } : null,
    event: W.ev ? W.ev.id : null, cash: SAVE ? SAVE.cash : null, rep: SAVE ? SAVE.rep : null, replay: !!(R3 && R3.replay),
    gfx: R3 ? { cpuScene: +(R3.cpuScene || 0).toFixed(1), cpuHud: +(R3.cpuHud || 0).toFixed(1), quality: R3.quality, fps: Math.round(R3.fps), touchStyle: a.touchStyle, fov: +W.fov.toFixed(1), nLatch: +P.nLatch.toFixed(2) } : null
  };
}

// helpers for automated play-testing: a bot that drives like a decent player
const dev = {
  world: () => Wd,
  bot: (on) => { if (Wd) Wd.P.bot = on !== false; },
  ff: (sec) => { const W = Wd, n = Math.round(sec * 50); for (let i = 0; i < n && W && ARC.state === 'play'; i++) stepWorld(W, 0.02); },
  teleport: (dist) => { if (Wd) Wd.P.dist = dist; },
  quality: (q) => { if (R3) R3.lockQ = true; setQuality(q); },
  bump: (k) => { if (Wd) crashFx(Wd, k == null ? 0.9 : k, 1, 'car'); },
  save: () => SAVE,
  cash: (n) => { SAVE.cash = n; writeSave(); },
  unlockAll: () => { MX.CREWS.forEach((c) => c.events.forEach((e) => { SAVE.done[e.id] = true; })); SAVE.rep = 9000; MX.PLAYER_CARS.forEach((k) => { if (SAVE.owned.indexOf(k) < 0) SAVE.owned.push(k); }); writeSave(); },
  reset: () => { SAVE = MX.newSave(); writeSave(); },
  event: (id) => { PENDING = MX.EVENT_BY_ID[id] || null; ARC.start(); },
  play: (o) => { DEVCFG = o; ARC.start(); },
  heat: (h) => { if (Wd && Wd.police) { Wd.police.heat = clamp(h, 1, 5); startPursuit(Wd, null); } },
  spikes: () => { if (Wd && Wd.police) deploySpikes(Wd); },
  block: () => { if (Wd && Wd.police) deployBlock(Wd); },
  breaker: () => { const S = R3 && R3.cur; if (Wd && Wd.police && S && S.breakers.length) { const b = S.breakers.find((q) => !q.used); if (b) triggerBreaker(Wd, b); } },
  camera: (i) => { if (R3) { R3.camMode = clamp(i | 0, 0, 2); SAVE.cam = R3.camMode; } },
  replay: () => { if (LAST_OVER) startReplay(LAST_OVER); },
  finish: () => { if (Wd && !Wd.P.finished) { if (Wd.mode === 'pursuit') escaped(Wd); else finishPlayer(Wd, Wd.t); } },
  garage: () => openGarage(), career: () => openCareer(), help: () => openHelp(),
  hb: (s) => { if (Wd) Wd.P.hbLatch = s || 0.6; },
  shift: () => { if (Wd) Wd.P.shiftLatch = 1; }
};
let DEVCFG = null;

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
function reShowOver(W) {
  W.over = true;
  if (!W.overArgs) return;
  ARC.over(W.overArgs.o);
  if (W.overArgs.stat) { const st = document.querySelector('.arc-card .stat'); if (st) st.innerHTML = W.overArgs.stat; }
  decorateOver(W);
}
const PADS = {
  normal: [{ label: 'Gas', key: 'ArrowUp', hot: true, big: true }, { label: 'Brake', key: 'ArrowDown' }, { label: 'Nitro', key: 'KeyN' }, { label: 'Drift', key: 'Space' }],
  drag: [{ label: 'Shift', key: 'Space', hot: true, big: true }, { label: 'Nitro', key: 'KeyN' }]
};

Arcade.create({
  // Settings > Graphics: 'smooth' and 'sharp' pin a quality level, 'auto' hands it back to the frame-rate auto-scaler.
  graphics(level) { if (!R3) return; if (level === 'auto') { R3.lockQ = false; return; } R3.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  three: true,
  slug: 'midnight-apex', title: 'Midnight Apex', genre: 'Street racing',
  hint: 'WASD or mouse to steer, Up for gas, Space to drift, Shift for nitro, C camera.',
  touchHint: 'Stick steers, Gas and Brake pads, Drift for the handbrake, Nitro when you have it',
  keys: [['Left Right / A D', 'Steer'], ['Up / W', 'Gas'], ['Down / S', 'Brake'], ['Space', 'Handbrake (drag: shift)'], ['Shift / N (hold)', 'Nitro'], ['C', 'Camera']],
  gameKeys: ['KeyC'],
  mouse: { steer: false, cursor: 'none', keys: [['Move mouse', 'Steer'], ['Click / hold', 'Gas']] },
  // Controller: A or right trigger gas, B or left trigger brake, X nitro, Y handbrake (shift in drag); bumpers read directly.
  gamepad: { buttons: ['ArrowUp', 'KeyN', 'ArrowDown', 'Space'], rt: 'ArrowUp', lt: 'ArrowDown' },
  touch: { stick: true, pads: PADS.normal },
  touchKeys: [['On-screen stick', 'Steer'], ['Gas', 'Accelerate'], ['Brake', 'Slow down'], ['Drift', 'Handbrake'], ['Nitro', 'Boost']],
  gestures: {
    drag: 'x', tilt: true,
    hint: 'Drag to steer. Swipe up for nitro. Tap to flick the handbrake. Hold a downward drag to brake.',
    keys: [['Drag left or right', 'Steer'], ['Swipe up', 'Nitro'], ['Tap', 'Handbrake (drag: shift)'], ['Hold a downward drag, or swipe down', 'Brake'], ['Gas', 'Always on']]
  },
  formatScore: fmtTime,
  resize: (a) => resize3D(a),
  init(a) {
    ARC = a;
    BESTS = a.store.get('midnight-apex.bests', {}) || {};
    SAVE = MX.loadSave(a.store);
    if (!setup3D(a)) { NO3D = true; showNo3D(a); return; }
    R3.camMode = clamp(SAVE.cam | 0, 0, 2);
    setQuality(R3.soft ? 0 : 3); resize3D(a);
    const origMenu = a.menu;
    a.menu = function (p) { stopAll(); if (R3) { R3.showroom = false; R3.replay = null; } return origMenu(Object.assign(menuProps(), p || {})); };
    a.debug = debugState;
    a.dev = dev;
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.arc-card')) onCardClick(e); });
    a.menu();
  },
  onMenu() {
    if (NO3D) return;
    injectCss(); stopAll();
    const card = document.querySelector('.arc-card'); if (!card) return;
    refreshPreview();
    card.querySelectorAll('.arc-seg').forEach((seg) => { seg.addEventListener('click', () => { setTimeout(refreshPreview, 0); }); });
  },
  start(a, ch) {
    if (NO3D) return;
    if (R3) { R3.replay = null; R3.showroom = false; }
    let ev = PENDING; PENDING = null;
    if (!ev && ch.mode === 'career' && !DEVCFG) ev = MX.nextEvent(SAVE);
    const car = SAVE.cur;
    let cfg;
    if (DEVCFG) { cfg = Object.assign({ track: ch.track, mode: 'race', car, diff: ch.diff, auto: ch.auto }, DEVCFG); DEVCFG = null; }
    else if (ev) cfg = { track: ev.track, mode: ev.mode, car, diff: ev.diff, auto: ch.auto, laps: ev.laps, heat: ev.heat || 0, event: ev };
    else {
      const mode = ch.mode === 'career' ? 'race' : ch.mode;
      cfg = { track: mode === 'drag' ? 'strip' : ch.track, mode, car, diff: ch.diff, auto: ch.auto, heat: mode === 'pursuit' ? 1 + (DIFF_IDX[ch.diff] || 0) : 0, cops: ch.cops };
    }
    if (cfg.mode === 'drag') cfg.track = 'strip';
    Wd = newWorld(cfg);
    if (a.setPads) a.setPads(cfg.mode === 'drag' ? PADS.drag : PADS.normal);
    engineStart();
    if (R3) R3.worldRef = null;
  },
  update(dt, a) {
    if (!Wd || NO3D) return;
    const P = Wd.P, racing = (Wd.phase === 'racing' || Wd.phase === 'countdown') && !Wd.attract;
    const sw = a.input.swipe(), tp = a.input.tap();
    if (tp && R3 && tp.x >= HUDR.cam.x && tp.x <= HUDR.cam.x + HUDR.cam.w && tp.y >= HUDR.cam.y - 6 && tp.y <= HUDR.cam.y + HUDR.cam.h + 6) cycleCam();
    else if (tp && a.touchMode && a.touchStyle !== 'pads' && racing) { if (Wd.mode === 'drag') P.shiftLatch = 1; else if (Wd.phase === 'racing') P.hbLatch = 0.45; }
    if (sw && a.touchMode && a.touchStyle !== 'pads' && Wd.phase === 'racing' && !Wd.attract) {
      if (sw.dir === 'up') {
        if (P.nitro > 6) { P.nLatch = 1.1 + 0.9 * sw.power; a.sfx.tone(520, 0.08, { type: 'triangle', vol: 0.1 }); }
        else a.toast('Nitro empty', 'Draft and near-miss to refill', 900);
      } else if (sw.dir === 'down') P.brLatch = 0.5 + 0.4 * sw.power;
    }
    const kc = a.input.down('KeyC');
    if (kc && !R3.keyC) cycleCam();
    R3.keyC = kc;
    if (padButton(5, true)) cycleCam();
    const n = Math.max(1, Math.ceil(dt / 0.02));
    const k = VFX && !a.reducedMotion ? VFX.timeScale || 1 : 1;
    for (let i = 0; i < n; i++) stepWorld(Wd, dt * k / n);
  },
  idle(dt, a) {
    if (NO3D) return;
    if (a.state === 'over') { if (R3 && R3.replay) replayStep(dt, a); return; }
    if (a.state !== 'menu') return;
    const c = a.choices, show = !!(R3 && R3.showroom);
    const car = show ? GSEL || SAVE.cur : SAVE.cur, cs = MX.carSave(SAVE, car);
    const track = c.mode === 'drag' ? 'strip' : (TRACK_ORDER.indexOf(c.track) >= 0 ? c.track : 'harbour');
    const key = track + '|' + car + '|' + cs.paint + cs.rim + cs.rimCol + cs.decal + cs.decalCol + cs.glow + '|' + show;
    if (!Wd || !Wd.attract || Wd.attractKey !== key) {
      const prevCur = SAVE.cur; SAVE.cur = car;
      Wd = newWorld({ track, mode: 'race', car, diff: 'pro', auto: 'on', attract: true }); Wd.attractKey = key;
      SAVE.cur = prevCur;
      if (show) { Wd.rivals.forEach((r) => { r.dist = Wd.P.dist + 9000 + r.id * 2000; }); Wd.P.speed = 0; }
    }
    if (show) return;
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(Wd, dt / n);
    // the drag strip ends: send the showcase back to the start of it
    if (Wd.T.open && Wd.P.dist > Wd.T.L - 45000) { const back = Wd.P.dist - 9000; Wd.racers.concat(Wd.traffic).forEach((c) => { c.dist -= back; }); }
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
    if (a.state !== 'menu' && !(W.attract)) drawHUD(ctx, a, W);
    const c2 = performance.now();
    R3.cpuScene = (R3.cpuScene || c1 - c0) * 0.9 + (c1 - c0) * 0.1; R3.cpuHud = (R3.cpuHud || c2 - c1) * 0.9 + (c2 - c1) * 0.1;
  },
  onPause() { engineStop(); },
  onResume() { if (Wd && !Wd.attract) engineStart(); },
  onOver() { engineStop(); }
});
function cycleCam() {
  if (!R3) return;
  R3.camMode = (R3.camMode + 1) % 3; SAVE.cam = R3.camMode; writeSave();
  ARC.toast(['Chase camera', 'Close camera', 'Bumper camera'][R3.camMode], '', 700);
}
