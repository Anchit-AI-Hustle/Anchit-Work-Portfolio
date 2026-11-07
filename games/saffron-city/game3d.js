import * as THREE from '/games/vendor/three/three.module.min.js';

/*
 * Saffron City, in 3D: an original open-world city sandbox at dusk.
 * Invented coastal megacity, family friendly: no weapons, trouble comes from
 * reckless driving and borrowing cars. The city, the jobs, the heat and the
 * traffic are the same simulation as the top-down game; what you see is a
 * three.js world: extruded buildings with lit windows, painted roads, lamp
 * light pools, a sunset sea, cars with working lights and a chase camera.
 * Everything is built in code from primitives and procedural textures.
 */
'use strict';

const TAU = Math.PI * 2, PI = Math.PI;
const W = 5120, CELL = 16, GW = 320, TILE = 512, TN = 10;
const clamp = Arcade.clamp, lerp = Arcade.lerp;
const wrapA = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rr = Math.random;
const pick = (arr) => arr[(rr() * arr.length) | 0];
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const hyp = Math.hypot;

/* ---------------------------------------------------------------- colour */
const hex2rgb = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (r, g, b) => 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
const shade = (h, f) => { const c = hex2rgb(h); return rgb(c[0] * f, c[1] * f, c[2] * f); };
const rgba = (h, a) => { const c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
const hash2 = (a, b, s) => {
  let h = (a * 374761393 + b * 668265263 + (s || 0) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

/* ---------------------------------------------------------------- vehicles */
const VT = {
  hatch:  { name: 'Hatchback', L: 44, Wd: 23, vmax: 330, acc: 250, brake: 540, grip: 7.5, steer: 2.7, mass: 1, hp: 100, circ: [-12, 0, 12], r: 11.5, cols: ['#e8e2d4', '#c0392b', '#2f6fb0', '#e1a41a', '#3c8d5a', '#8a8f96', '#d9772b'] },
  coupe:  { name: 'Sports coupe', L: 48, Wd: 22, vmax: 470, acc: 390, brake: 620, grip: 6.2, steer: 2.9, mass: 0.9, hp: 90, circ: [-14, 0, 14], r: 11, cols: ['#d4263a', '#1f6dd4', '#f0a81b', '#1c1c1f', '#7d4e9d'] },
  auto:   { name: 'Auto-rickshaw', L: 32, Wd: 20, vmax: 235, acc: 190, brake: 430, grip: 5.2, steer: 3.3, mass: 0.6, hp: 70, circ: [-7, 7], r: 9.5, cols: ['#f1c232', '#f1c232', '#3c8d5a'] },
  van:    { name: 'Delivery van', L: 58, Wd: 27, vmax: 290, acc: 170, brake: 430, grip: 6.2, steer: 2.0, mass: 1.7, hp: 140, circ: [-18, 0, 18], r: 13.5, cols: ['#f2f0ea', '#2f6fb0', '#c0392b', '#e8e2d4'] },
  bike:   { name: 'Scooter', L: 24, Wd: 10, vmax: 370, acc: 310, brake: 560, grip: 8.5, steer: 3.8, mass: 0.35, hp: 50, circ: [-5, 5], r: 5.5, cols: ['#d9772b', '#2e8ea8', '#c0392b', '#e8e2d4'] },
  police: { name: 'Police cruiser', L: 48, Wd: 24, vmax: 430, acc: 340, brake: 600, grip: 6.6, steer: 2.8, mass: 1.1, hp: 120, circ: [-14, 0, 14], r: 12, cols: ['#f2f2f2'] },
};

/* ---------------------------------------------------------------- road network */
// Left-hand traffic, as in the city this is invented from.
const XC = [760, 1060, 1320, 1660, 2180, 2460, 2780, 3080, 3440, 3720, 4050, 4350, 4600, 4880];
const YC = [160, 440, 740, 1220, 1480, 1810, 2100, 2400, 2750, 3020, 3340, 3640, 3980, 4260, 4560, 4880];
const NX = XC.length, NY = YC.length;
const XBL = [0, 7], YBL = [6, 12];
const XR = XC.map((c, i) => { const b = XBL.indexOf(i) >= 0; return { c, blvd: b, hw: b ? 70 : 42, lanes: b ? 2 : 1 }; });
const YR = YC.map((c, j) => { const b = YBL.indexOf(j) >= 0; return { c, blvd: b, hw: b ? 70 : 42, lanes: b ? 2 : 1 }; });
const laneOff = (R, k) => (R.blvd ? 21 + 30 * k : 15);
const shore = (y) => 500 + 36 * Math.sin(y / 330) + 24 * Math.sin(y / 110 + 1.3);
const SAND = 54;

const DISTRICTS = [
  { id: 'docks', name: 'Bandar Docks', test: (x, y) => y > 3700 && x < 2300 },
  { id: 'marine', name: 'Marine Parade', test: (x) => x < 1010 },
  { id: 'fort', name: 'Qila Quarter', test: (x, y) => x > 1420 && x < 2420 && y > 380 && y < 1560 },
  { id: 'bazaar', name: 'Chowk Bazaar', test: (x, y) => x > 2250 && x < 3600 && y > 1500 && y < 2950 },
  { id: 'heights', name: 'Malabar Heights', test: (x, y) => x > 3500 && y < 2500 },
  { id: 'biz', name: 'Navi Business Park', test: (x, y) => x > 3300 && y > 2950 },
  { id: 'res', name: 'Lakshmi Nagar', test: () => true },
];
const districtAt = (x, y) => { for (let i = 0; i < DISTRICTS.length; i++) if (DISTRICTS[i].test(x, y)) return DISTRICTS[i]; return DISTRICTS[DISTRICTS.length - 1]; };

const DP = {
  res:     { sw: 16, gap: 4, lotMax: 104, lotMin: 50, hmin: 22, hmax: 46, emptyP: 0.07, parkP: 0.12, treeP: 0.6, walk: '#bdb6a6', yard: '#8f897c',
             roofs: ['#d9a37a', '#c47a5c', '#e3c9a2', '#b8b2a6', '#9fb7c9', '#e8b4a0', '#c9b28c', '#8fae9c'] },
  bazaar:  { sw: 14, gap: 3, lotMax: 70, lotMin: 34, hmin: 14, hmax: 30, emptyP: 0.04, parkP: 0, treeP: 0.18, walk: '#b9a98f', yard: '#857a67',
             roofs: ['#e0584b', '#e8a33a', '#3aa6b5', '#5b7fd1', '#c9477f', '#7bb35a', '#f0c14b', '#d97b3a'] },
  fort:    { sw: 16, gap: 4, lotMax: 84, lotMin: 44, hmin: 18, hmax: 36, emptyP: 0.06, parkP: 0.05, treeP: 0.45, walk: '#c9b48e', yard: '#9c8a68',
             roofs: ['#c9955f', '#bf8450', '#d9ab72', '#b97a4a', '#cfa070'] },
  heights: { sw: 14, gap: 4, lotMax: 168, lotMin: 100, hmin: 14, hmax: 28, emptyP: 0, parkP: 0.1, treeP: 0.8, walk: '#c4bfae', yard: '#7aa05a',
             roofs: ['#f0e6d6', '#c46a4a', '#e7dcc8', '#d8cdb8', '#b86a50'] },
  biz:     { sw: 34, gap: 6, lotMax: 150, lotMin: 90, hmin: 60, hmax: 100, emptyP: 0.0, parkP: 0.12, treeP: 0.7, walk: '#c8c8c4', yard: '#9a9c9c',
             roofs: ['#2e5f78', '#335b6b', '#3b6e88', '#294a63', '#4a7a8c'] },
  docks:   { sw: 14, gap: 4, lotMax: 190, lotMin: 110, hmin: 16, hmax: 26, emptyP: 0.04, parkP: 0, treeP: 0.05, walk: '#a9a8a0', yard: '#7d7c76',
             roofs: ['#7d8791', '#8a7f72', '#6f7b86', '#9a9084'] },
  marine:  { sw: 24, gap: 4, lotMax: 110, lotMin: 60, hmin: 34, hmax: 62, emptyP: 0.03, parkP: 0.08, treeP: 0.7, walk: '#d0c9b8', yard: '#9a9484',
             roofs: ['#f3eadb', '#e6d3b4', '#dbe6e8', '#f0c9b0', '#d9e3c7'] },
};


/* ---------------------------------------------------------------- city storage */
// The city is generated as DATA (the same layout logic as ever); the 3D chunks
// below turn each tile's data into meshes the first time the camera needs it.
const SOLID = new Uint8Array(GW * GW);
const BK = [];
for (let i = 0; i < TN * TN; i++) BK.push({ g: [], f: [], b: [], t: [], l: [] });
const BLD = [];          // every building, for the minimap
const LAMPS = [];        // street lamps
const PARKS = [];        // park rects for the minimap
const SAFE = [];         // safehouses
const BLOCKS = [];

// An object belongs to the tile its centre is in, so a chunk never draws it twice.
function put(cat, obj, x0, y0, x1, y1) {
  const tx = clamp(Math.floor((x0 + x1) / 2 / TILE), 0, TN - 1), ty = clamp(Math.floor((y0 + y1) / 2 / TILE), 0, TN - 1);
  BK[ty * TN + tx][cat].push(obj);
}
// Ground patches: pat picks the surface look in the shader, h is the top height.
const GP = { plain: 0, walk: 1, grass: 2, sand: 3, flag: 4, prom: 5, apron: 6, water: 7, earth: 8, turf: 9 };
function ground(x0, y0, x1, y1, col, pat, h, base) { put('g', { s: 'r', x0, y0, x1, y1, col, pat, h: h == null ? 1.2 : h, base: base == null ? 0 : base }, x0, y0, x1, y1); }
function groundE(cx, cy, rx, ry, col, pat, h) { put('g', { s: 'e', cx, cy, rx, ry, col, pat, h }, cx - rx, cy - ry, cx + rx, cy + ry); }
function prop(o) { put('f', o, o.x, o.y, o.x, o.y); return o; }

function solidRect(x0, y0, x1, y1, pad) {
  pad = pad == null ? 4 : pad;
  const i0 = Math.max(0, Math.floor((x0 - pad) / CELL)), i1 = Math.min(GW - 1, Math.floor((x1 + pad) / CELL));
  const j0 = Math.max(0, Math.floor((y0 - pad) / CELL)), j1 = Math.min(GW - 1, Math.floor((y1 + pad) / CELL));
  for (let j = j0; j <= j1; j++) {
    const cy = (j + 0.5) * CELL; if (cy < y0 - pad || cy > y1 + pad) continue;
    for (let i = i0; i <= i1; i++) { const cx = (i + 0.5) * CELL; if (cx >= x0 - pad && cx <= x1 + pad) SOLID[j * GW + i] = 1; }
  }
}
function clearRect(x0, y0, x1, y1) {
  const i0 = Math.max(0, Math.floor(x0 / CELL)), i1 = Math.min(GW - 1, Math.floor(x1 / CELL));
  const j0 = Math.max(0, Math.floor(y0 / CELL)), j1 = Math.min(GW - 1, Math.floor(y1 / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) SOLID[j * GW + i] = 0;
}
const solidAt = (x, y) => { const i = (x / CELL) | 0, j = (y / CELL) | 0; return i < 0 || j < 0 || i >= GW || j >= GW || SOLID[j * GW + i] === 1; };

/* ---------------------------------------------------------------- generation helpers */
const cr = Arcade.rng(20261102);
const crp = (a) => a[(cr() * a.length) | 0];
const crr = (a, b) => a + cr() * (b - a);

// How tall a footprint stands in the 3D city (one unit is about ten centimetres).
const HK = { res: 4.2, bazaar: 4.0, fort: 4.0, heights: 4.0, biz: 6.2, docks: 3.4, marine: 4.6 };
function addBuilding(o) {
  o.k = o.k || 'bld';
  if (!o.rc) o.rc = '#b8b2a6';
  o.wl = o.wl || shade(o.rc, 0.62);
  o.we = o.we || shade(o.rc, 0.46);
  o.rt = o.rt || shade(o.rc, 1.08);
  o.seed = (cr() * 1e6) | 0;
  const K = HK[o.ds] || 4.2;
  if (o.k === 'bld') o.H = Math.max(48, o.h * K);
  else if (o.k === 'wall') o.H = 64;
  else if (o.k === 'round') o.H = o.clock ? 200 : o.h * 4.4;
  else if (o.k === 'container') o.H = Math.round((o.h - 6) / 5) * 13;
  else if (o.k === 'ship') o.H = 70;
  else o.H = o.h * 4;
  if (o.solid !== false) solidRect(o.x, o.y, o.x + o.w, o.y + o.d);
  BLD.push(o);
  return o;
}
function addTree(x, y, r, kind, solid) {
  const pals = [['#2f6b35', '#3f8a44', '#58a653'], ['#2a5f3a', '#3a7d4b', '#4f9a5f'], ['#3b6e2e', '#52903d', '#74b04e']];
  const p = kind === 'flower' ? [['#b8452a', '#d9622f', '#f08a3c'], ['#c79a22', '#e0b83a', '#f3d765']][(cr() * 2) | 0] : crp(pals);
  const t = { x, y, r, c0: p[0], c1: p[1], c2: p[2], k: kind || 'tree', rot: cr() * TAU };
  put('t', t, x, y, x, y);
  if (solid) solidRect(x - 3, y - 3, x + 3, y + 3, 5);
  return t;
}
function addLamp(x, y, ang) {
  const l = { x, y, a: ang };
  LAMPS.push(l);
  put('l', l, x, y, x, y);
}

// Recursive lot subdivision (a binary space partition of the block interior).
function subdivide(x, y, w, h, mx, mn, out, dep) {
  if ((w <= mx && h <= mx) || dep > 5) { out.push({ x, y, w, d: h }); return; }
  const horiz = w > h, len = horiz ? w : h;
  if (len < mn * 2) { out.push({ x, y, w, d: h }); return; }
  const a = clamp(Math.round(len * (0.4 + cr() * 0.2)), mn, len - mn);
  if (horiz) { subdivide(x, y, a, h, mx, mn, out, dep + 1); subdivide(x + a, y, w - a, h, mx, mn, out, dep + 1); }
  else { subdivide(x, y, w, a, mx, mn, out, dep + 1); subdivide(x, y + a, w, h - a, mx, mn, out, dep + 1); }
}

function roofDeco(b, d) {
  const dec = [];
  const n = b.w * b.d > 3000 ? 3 : b.w * b.d > 1400 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const r = cr();
    const px = 6 + cr() * Math.max(2, b.w - 22), py = 6 + cr() * Math.max(2, b.d - 22);
    if (d.id === 'biz') { if (i === 0 && cr() < 0.35) dec.push({ t: 'heli', px: b.w / 2, py: b.d / 2 }); else dec.push({ t: 'box', px, py, w: 14, h: 12 }); }
    else if (r < 0.28) dec.push({ t: 'tank', px: px + 5, py: py + 5, r: 5 });
    else if (r < 0.55) dec.push({ t: 'ac', px, py });
    else if (r < 0.7) dec.push({ t: 'solar', px, py, w: 18, h: 10 });
    else if (r < 0.85) dec.push({ t: 'box', px, py, w: 11, h: 9 });
    else dec.push({ t: 'tank', px: px + 5, py: py + 5, r: 4 });
  }
  return dec;
}

function genLots(ix, iy, iw, ih, d) {
  const P = DP[d.id];
  const lots = []; subdivide(ix, iy, iw, ih, P.lotMax, P.lotMin, lots, 0);
  for (const L of lots) {
    const g = P.gap;
    const bx = L.x + g, by = L.y + g, bw = L.w - 2 * g, bd = L.d - 2 * g;
    if (bw < 16 || bd < 16) continue;
    if (cr() < P.emptyP) {
      const tx = bx + bw / 2, ty = by + bd / 2;
      for (let k = 0; k < 2; k++) addTree(tx + crr(-bw / 3, bw / 3), ty + crr(-bd / 3, bd / 3), crr(8, 12), 'tree', false);
      continue;
    }
    let h = crr(P.hmin, P.hmax);
    const rc = crp(P.roofs);
    const b = addBuilding({ x: bx, y: by, w: bw, d: bd, h, rc, ds: d.id });
    b.dec = roofDeco(b, d);
    if (d.id === 'bazaar') {
      b.awn = crp(['#e0584b', '#e8a33a', '#3aa6b5', '#c9477f', '#7bb35a']);
      if (cr() < 0.5) b.neon = crp(['#ff3b8a', '#35e0ff', '#ffd23b', '#7dff6b']);
    }
    if (d.id === 'biz') { b.glass = true; if (cr() < 0.55) b.beacon = true; }
    if (d.id === 'marine' && cr() < 0.4) b.neon = crp(['#ff9a3b', '#ff3b8a', '#35e0ff']);
    if (d.id === 'fort' && cr() < 0.22) b.dome = { px: bw / 2, py: bd / 2, r: Math.min(bw, bd) * 0.28, c: crp(['#e8dcc0', '#c9a24a', '#3aa6b5']) };
    if (d.id === 'docks') { b.ribs = true; }
  }
}

function streetTreesAndLamps(x0, y0, x1, y1, d, sw) {
  const P = DP[d.id];
  const e = Math.min(sw / 2, 9);
  const edges = [
    { ax: 'x', a: x0 + 28, b: x1 - 28, fix: y0 + e, ang: PI / 2 },
    { ax: 'x', a: x0 + 28, b: x1 - 28, fix: y1 - e, ang: -PI / 2 },
    { ax: 'y', a: y0 + 28, b: y1 - 28, fix: x0 + e, ang: 0 },
    { ax: 'y', a: y0 + 28, b: y1 - 28, fix: x1 - e, ang: PI },
  ];
  for (const E of edges) {
    let n = 0;
    for (let p = E.a + crr(0, 20); p < E.b; p += 52, n++) {
      const px = E.ax === 'x' ? p : E.fix, py = E.ax === 'x' ? E.fix : p;
      if (n % 3 === 0) addLamp(px, py, E.ang);
      else if (cr() < P.treeP) addTree(px, py, crr(6.5, 9), d.id === 'res' && cr() < 0.2 ? 'flower' : 'tree', false);
    }
  }
}

/* ---- special blocks */
function genPark(x0, y0, x1, y1, d) {
  const w = x1 - x0, h = y1 - y0;
  const v = (cr() * 3) | 0;
  PARKS.push([x0, y0, w, h]);
  ground(x0, y0, x1, y1, '#4f8f45', GP.grass, 2.0);
  const cx = x0 + w / 2, cy = y0 + h / 2;
  if (v === 0) { // pond garden
    ground(x0 + 10, cy - 3.5, x1 - 10, cy + 3.5, '#d9cdb0', GP.flag, 2.4);
    ground(cx - 3.5, y0 + 10, cx + 3.5, y1 - 10, '#d9cdb0', GP.flag, 2.4);
    groundE(cx, cy, 38, 30, '#d9cdb0', GP.flag, 3.0);
    groundE(cx, cy, 32, 25, '#2f7f98', GP.water, 3.6);
    prop({ t: 'fountain', x: cx, y: cy });
    solidRect(cx - 30, cy - 24, cx + 30, cy + 24);
  } else if (v === 1) { // sports ground
    const rw = Math.min(w - 30, 170), rh = Math.min(h - 30, 120);
    groundE(cx, cy, rw / 2 + 6, rh / 2 + 6, '#3f7a38', GP.grass, 2.6);
    groundE(cx, cy, rw / 2, rh / 2, '#6fae4f', GP.turf, 3.1);
    ground(cx - 5, cy - 22, cx + 5, cy + 22, '#d8c9a0', GP.earth, 3.6);
    prop({ t: 'stumps', x: cx, y: cy - 22, a: 0 }); prop({ t: 'stumps', x: cx, y: cy + 22, a: PI });
  } else { // playground
    ground(cx - 50, cy - 36, cx + 50, cy + 36, '#d9b56a', GP.sand, 2.8);
    prop({ t: 'swing', x: cx - 26, y: cy - 8 }); prop({ t: 'slide', x: cx + 22, y: cy + 4 }); prop({ t: 'bench', x: cx, y: cy + 30, a: 0 });
  }
  for (let i = 0; i < 20; i++) {
    const tx = x0 + 14 + cr() * (w - 28), ty = y0 + 14 + cr() * (h - 28);
    if (Math.abs(tx - cx) < 46 && Math.abs(ty - cy) < 36) continue;
    addTree(tx, ty, crr(9, 15), cr() < 0.12 ? 'flower' : 'tree', false);
  }
}

function genFort(x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  const wx0 = x0 + 22, wy0 = y0 + 22, wx1 = x1 - 22, wy1 = y1 - 22, T = 16;
  ground(x0, y0, x1, y1, '#b8a67e', GP.earth, 1.2);
  ground(wx0, wy0, wx1, wy1, '#d6c4a0', GP.flag, 2.0);
  const mx = (wx0 + wx1) / 2, my = (wy0 + wy1) / 2, gate = 32;
  const wallC = '#caa56d';
  const seg = (a, b, c2, d2) => addBuilding({ x: a, y: b, w: c2 - a, d: d2 - b, h: 15, rc: wallC, k: 'wall' });
  seg(wx0, wy0, wx1, wy0 + T);                       // north wall
  seg(wx0, wy1 - T, mx - gate, wy1); seg(mx + gate, wy1 - T, wx1, wy1);   // south wall with gate
  seg(wx0, wy0 + T, wx0 + T, my - gate); seg(wx0, my + gate, wx0 + T, wy1 - T);   // west wall with gate
  seg(wx1 - T, wy0 + T, wx1, wy1 - T);               // east wall
  const bast = [[wx0, wy0], [wx1, wy0], [wx0, wy1], [wx1, wy1], [mx, wy0], [wx1, my]];
  for (const bp of bast) addBuilding({ x: bp[0] - 17, y: bp[1] - 17, w: 34, d: 34, h: 24, rc: '#d2ad74', k: 'round' });
  // palace
  const pw = 150, pd = 92, px = mx - pw / 2, py = my - pd / 2 - 20;
  const pal = addBuilding({ x: px, y: py, w: pw, d: pd, h: 40, rc: '#e8d3a8', ds: 'fort' });
  pal.dec = []; pal.dome = { px: pw / 2, py: pd / 2, r: 24, c: '#f0e6c8' }; pal.chhatri = true; pal.neon = null;
  addBuilding({ x: px - 70, y: py + 26, w: 46, d: 40, h: 22, rc: '#d9ab72', ds: 'fort' }).dec = [];
  addBuilding({ x: px + pw + 24, y: py + 26, w: 46, d: 40, h: 22, rc: '#d9ab72', ds: 'fort' }).dec = [];
  ground(mx - 120, my + 52, mx - 44, my + 96, '#5f9a4a', GP.grass, 3.0);
  ground(mx + 44, my + 52, mx + 120, my + 96, '#5f9a4a', GP.grass, 3.0);
  groundE(mx, my + 74, 16, 16, '#e8d9b0', GP.flag, 3.4);
  groundE(mx, my + 74, 11, 11, '#4f9fb0', GP.water, 3.9);
  prop({ t: 'fountain', x: mx, y: my + 74 });
  solidRect(mx - 11, my + 63, mx + 11, my + 85);
  for (const tp of [[mx - 100, my + 62], [mx - 60, my + 86], [mx + 60, my + 62], [mx + 100, my + 86]]) addTree(tp[0], tp[1], 9, 'tree', false);
}

function genChowk(x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, cx = x0 + w / 2, cy = y0 + h / 2;
  ground(x0, y0, x1, y1, '#c9a77a', GP.earth, 1.4);
  groundE(cx, cy, 52, 52, '#d8b890', GP.flag, 2.0);
  const tw = addBuilding({ x: cx - 13, y: cy - 13, w: 26, d: 26, h: 78, rc: '#e8d9b8', k: 'round' });
  tw.clock = true;
  // stalls: low colourful awnings round the edge, walkable
  const awn = ['#e0584b', '#e8a33a', '#3aa6b5', '#c9477f', '#7bb35a', '#5b7fd1'];
  const stalls = [];
  for (let x = x0 + 14; x < x1 - 30; x += 34) { stalls.push([x, y0 + 12]); stalls.push([x, y1 - 30]); }
  for (let y = y0 + 52; y < y1 - 52; y += 30) { stalls.push([x0 + 12, y]); stalls.push([x1 - 32, y]); }
  stalls.forEach((s, i) => {
    const col = awn[(i * 7 + 3) % awn.length];
    put('b', { k: 'stall', x: s[0], y: s[1], w: 22, d: 16, h: 6, H: 26, col, solid: false, seed: i * 31 + 7 }, s[0], s[1], s[0] + 22, s[1] + 16);
  });
  for (const s of stalls) solidRect(s[0] + 3, s[1] + 3, s[0] + 19, s[1] + 13, 0);
}

function genDockYard(x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  ground(x0, y0, x1, y1, '#8d8d86', GP.apron, 1.4);
  const cols = ['#c0392b', '#2e7d9a', '#e1a41a', '#3c8d5a', '#7d4e9d', '#d9772b', '#8a8f96', '#2f5fa8'];
  let row = 0;
  for (let y = y0 + 16; y + 18 < y1 - 12; y += 26, row++) {
    if (row % 4 === 3) continue;
    let col = 0;
    for (let x = x0 + 14; x + 42 < x1 - 12; x += 48, col++) {
      if (col % 4 === 3) continue;
      if (cr() < 0.12) continue;
      const lv = 1 + ((cr() * 3) | 0);
      addBuilding({ x, y, w: 40, d: 16, h: 6 + lv * 5, rc: cols[(cr() * cols.length) | 0], k: 'container' });
    }
  }
}

function genVillas(ix, iy, iw, ih, d) {
  const lots = []; subdivide(ix, iy, iw, ih, DP.heights.lotMax, DP.heights.lotMin, lots, 0);
  for (const L of lots) {
    const x = L.x + 2, y = L.y + 2, w = L.w - 4, h = L.d - 4;
    if (w < 40 || h < 40) continue;
    ground(x, y, x + w, y + h, '#6f9f50', GP.grass, 2.0);
    const bw = w * crr(0.42, 0.55), bd = h * crr(0.38, 0.5);
    const bx = x + (w - bw) * crr(0.25, 0.75), by = y + h * 0.28 + (h * 0.5 - bd) * cr();
    const rc = crp(DP.heights.roofs);
    const b = addBuilding({ x: bx, y: by, w: bw, d: bd, h: crr(14, 26), rc, ds: 'heights' });
    b.dec = [{ t: 'ac', px: 6, py: 6 }]; b.tiles = rc === '#c46a4a' || rc === '#b86a50';
    if (cr() < 0.45) {
      const px = x + 8 + cr() * (w - 70), py = (by + bd + 10 < y + h - 28) ? by + bd + 10 : y + 6;
      ground(px - 2, py - 2, px + 52, py + 28, '#e8e2d4', GP.flag, 2.5);
      ground(px, py, px + 50, py + 26, '#3fb0d0', GP.water, 2.9);
    }
    for (let k = 0; k < 6; k++) addTree(x + 8 + cr() * (w - 16), y + 8 + cr() * (h - 16), crr(7, 11), cr() < 0.15 ? 'flower' : 'tree', false);
  }
}

/* ---------------------------------------------------------------- build the city */
function buildCity() {
  // Boundary and sea
  for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
    const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL;
    if (i < 2 || j < 2 || i >= GW - 2 || j >= GW - 2 || cx < shore(cy) + 8) SOLID[j * GW + i] = 1;
  }
  // Block grid
  for (let bj = 0; bj < NY - 1; bj++) for (let bi = 0; bi < NX - 1; bi++) {
    const x0 = XC[bi] + XR[bi].hw, x1 = XC[bi + 1] - XR[bi + 1].hw;
    const y0 = YC[bj] + YR[bj].hw, y1 = YC[bj + 1] - YR[bj + 1].hw;
    const d = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
    const P = DP[d.id];
    BLOCKS.push([x0, y0, x1, y1, d.id]);
    ground(x0, y0, x1, y1, P.walk, GP.walk, 1.2);
    const sw = P.sw, ix = x0 + sw, iy = y0 + sw, iw = x1 - x0 - 2 * sw, ih = y1 - y0 - 2 * sw;
    if (iw < 30 || ih < 30) continue;
    let special = null;
    if (bi === 3 && bj === 2) special = 'fort';
    else if (bi === 5 && bj === 6) special = 'chowk';
    else if (d.id === 'docks' && bj >= 12 && (bi === 1 || bi === 2)) special = 'yard';
    else if (d.id === 'heights') special = cr() < 0.12 ? 'park' : 'villas';
    else if (P.parkP && cr() < P.parkP) special = 'park';
    if (special === 'fort') { genFort(x0, y0, x1, y1); }
    else if (special === 'chowk') { genChowk(x0, y0, x1, y1); }
    else if (special === 'yard') { genDockYard(x0, y0, x1, y1); }
    else if (special === 'park') { genPark(ix, iy, ix + iw, iy + ih, d); }
    else {
      ground(ix, iy, ix + iw, iy + ih, P.yard, GP.plain, 2.0);
      if (special === 'villas') genVillas(ix, iy, iw, ih, d); else genLots(ix, iy, iw, ih, d);
    }
    streetTreesAndLamps(x0, y0, x1, y1, d, sw);
  }
  // Promenade, beach, palms, benches
  for (let y = 40; y < W - 40; y += 66) {
    const s = shore(y) + SAND, px = s + (690 - s) * 0.38;
    addTree(px, y, 13, 'palm', false);
    if ((y / 66 | 0) % 2 === 0) prop({ t: 'bench', x: px + 30, y: y + 3, a: PI / 2 });
    if ((y / 66 | 0) % 3 === 1) addLamp(s + (690 - s) * 0.72, y, 0);
  }
  // North / south / east margins: dense trees
  for (let k = 0; k < 160; k++) {
    const side = k % 3; let x, y;
    if (side === 0) { x = 700 + cr() * (W - 700); y = 20 + cr() * 90; }
    else if (side === 1) { x = 700 + cr() * (W - 700); y = YC[NY - 1] + 62 + cr() * 130; }
    else { x = XC[NX - 1] + 62 + cr() * 150; y = 120 + cr() * (YC[NY - 1] - 100); }
    addTree(x, y, crr(11, 18), cr() < 0.1 ? 'flower' : 'tree', false);
  }
  // Docks: concrete apron, fingers, ship, cranes, bollards
  const apron = [440, 3960, 690, 4520], f1 = [300, 4030, 440, 4082], f2 = [300, 4420, 440, 4472];
  clearRect(apron[0], apron[1], apron[2], apron[3]); clearRect(f1[0], f1[1], f1[2], f1[3]); clearRect(f2[0], f2[1], f2[2], f2[3]);
  const pier = (r) => ground(r[0], r[1], r[2], r[3], '#8f9196', GP.apron, 1.0, -8);
  pier(apron); pier(f1); pier(f2);
  addBuilding({ x: 226, y: 4140, w: 214, d: 205, h: 18, rc: '#2f4f6e', k: 'ship', wl: '#233a52', we: '#1b2d41', solid: true });
  // cranes: decor
  for (const cy of [4090, 4390]) put('b', { k: 'crane', x: 452, y: cy, w: 200, d: 10, h: 40, H: 190, solid: false, seed: cy }, 452, cy, 652, cy + 10);
  for (let y = 3990; y < 4500; y += 64) prop({ t: 'bollard', x: 452, y });
  for (const b of BLD) put('b', b, b.x, b.y, b.x + b.w, b.y + b.d);
}
buildCity();

/* safehouses sit on sidewalk corners */
const corner = (i, j, sx, sy) => ({ x: XC[i] + (sx ? 1 : -1) * (XR[i].hw + 9), y: YC[j] + (sy ? 1 : -1) * (YR[j].hw + 9) });
const SAFE_DEFS = [[0, 5, 1, 1, 'Marine Parade flat'], [5, 6, 0, 1, 'Bazaar loft'], [10, 3, 1, 1, 'Hilltop villa'], [2, 12, 1, 0, 'Dockside shed'], [9, 10, 0, 1, 'Tower suite']];
SAFE_DEFS.forEach((s) => { const p = corner(s[0], s[1], s[2], s[3]); SAFE.push({ x: p.x, y: p.y, i: s[0], j: s[1], sx: s[2], sy: s[3], name: s[4] }); });

const newCv = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };

/* ---- minimap image: roads, water, parks, buildings at 1/4 scale */
const MMK = 4, MMS = W / MMK;
const mmCv = newCv(MMS, MMS);
(function buildMini() {
  const c = mmCv.getContext('2d'); c.scale(1 / MMK, 1 / MMK);
  c.fillStyle = '#26324a'; c.fillRect(0, 0, W, W);
  c.fillStyle = '#143f5e'; c.beginPath(); c.moveTo(0, 0); for (let y = 0; y <= W; y += 16) c.lineTo(shore(y), y); c.lineTo(0, W); c.closePath(); c.fill();
  c.fillStyle = '#6b6252'; c.beginPath(); for (let y = 0; y <= W; y += 16) c.lineTo(shore(y), y); for (let y = W; y >= 0; y -= 16) c.lineTo(shore(y) + SAND, y); c.closePath(); c.fill();
  c.fillStyle = '#394563';
  for (const b of BLD) { if (b.k === 'container') c.fillStyle = '#4a5878'; else c.fillStyle = b.k === 'ship' ? '#6a7a96' : '#3d4a6a'; c.fillRect(b.x, b.y, b.w, b.d); }
  c.fillStyle = '#2f6b4a'; for (const p of PARKS) c.fillRect(p[0], p[1], p[2], p[3]);
  c.fillStyle = '#8a96b0';
  const vt = YC[0] - YR[0].hw, vb = YC[NY - 1] + YR[NY - 1].hw, hl = XC[0] - XR[0].hw, hr = XC[NX - 1] + XR[NX - 1].hw;
  for (const R of XR) { c.fillStyle = R.blvd ? '#c3cde0' : '#8d99b2'; c.fillRect(R.c - R.hw * 0.5, vt, R.hw, vb - vt); }
  for (const R of YR) { c.fillStyle = R.blvd ? '#c3cde0' : '#8d99b2'; c.fillRect(hl, R.c - R.hw * 0.5, hr - hl, R.hw); }
})();



/* ================================================================ three.js core: colour, geometry builder, materials */
let LOD = 1;   // 1 full detail, 0 a lighter mesh for software rendering and weak phones
const _tc = new THREE.Color();
const LINC = {};
// sRGB hex or css colour to linear floats (vertex colours are read as linear).
function lin(hex) { let r = LINC[hex]; if (!r) { _tc.set(hex); r = LINC[hex] = [_tc.r, _tc.g, _tc.b]; } return r; }
const mulc = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Shared uniforms: every custom material reads the same time-of-day values.
const UN = {
  uNight: { value: 0 }, uWin: { value: 0 }, uTime: { value: 0 },
};

/* ---- a tiny indexed geometry builder, all in plain arrays */
const D0 = [0, 0, 0, 0];
class GB {
  constructor() { this.P = []; this.N = []; this.C = []; this.U = []; this.D = []; this.I = []; this.n = 0; }
  v(x, y, z, nx, ny, nz, c, u, w, d) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(c[0], c[1], c[2]); this.U.push(u || 0, w || 0); d = d || D0; this.D.push(d[0], d[1], d[2], d[3]);
    return this.n++;
  }
  t(a, b, c) { this.I.push(a, b, c); }
  // p: 12 numbers, four corners counter-clockwise seen from the normal side
  q(p, nx, ny, nz, c, uv, d) {
    const i0 = this.n;
    for (let k = 0; k < 4; k++) this.v(p[k * 3], p[k * 3 + 1], p[k * 3 + 2], nx, ny, nz, c, uv ? uv[k * 2] : 0, uv ? uv[k * 2 + 1] : 0, d);
    this.I.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  // Move everything added since vertex `i0`: turn it by world heading `a` about Y, then shift.
  place(i0, a, ox, oy, oz) {
    const c = Math.cos(a), s = Math.sin(a), P = this.P, N = this.N;
    for (let i = i0; i < this.n; i++) {
      const x = P[i * 3], z = P[i * 3 + 2];
      P[i * 3] = x * c - z * s + ox; P[i * 3 + 1] += oy; P[i * 3 + 2] = x * s + z * c + oz;
      const nx = N[i * 3], nz = N[i * 3 + 2];
      N[i * 3] = nx * c - nz * s; N[i * 3 + 2] = nx * s + nz * c;
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.C), 3));
    g.setAttribute('wuv', new THREE.BufferAttribute(new Float32Array(this.U), 2));
    g.setAttribute('wd', new THREE.BufferAttribute(new Float32Array(this.D), 4));
    g.setIndex(new THREE.BufferAttribute(this.n > 65535 ? new Uint32Array(this.I) : new Uint16Array(this.I), 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Axis aligned box between two corners, with top, four sides and optionally a bottom.
function boxG(g, x0, y0, z0, x1, y1, z1, c, d, o) {
  d = d || D0; o = o || {};
  g.q([x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], 0, 1, 0, o.top || c, null, d);
  g.q([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], 0, 0, 1, c, null, d);
  g.q([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], 0, 0, -1, c, null, d);
  g.q([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], 1, 0, 0, c, null, d);
  g.q([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], -1, 0, 0, c, null, d);
  if (o.bot) g.q([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], 0, -1, 0, c, null, d);
}
// Box centred at (cx, cz) with size sx (along heading) x sz, turned by world heading `a`.
function boxR(g, cx, y0, cz, sx, sy, sz, a, c, d) {
  const i0 = g.n; boxG(g, -sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2, c, d); g.place(i0, a, cx, y0, cz);
}
// Surface of revolution about Y: radii r0 (bottom) and r1 (top), optional ellipse (rz factor) and cap.
function cylG(g, cx, y0, cz, r0, r1, h, seg, c, d, o) {
  o = o || {}; d = d || D0; const ez = o.ez == null ? 1 : o.ez, sl = (r0 - r1) / Math.max(0.001, h);
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const i0 = g.n;
    g.v(cx + c1 * r0, y0, cz + s1 * r0 * ez, c1 / Math.hypot(1, sl), sl / Math.hypot(1, sl), s1 / Math.hypot(1, sl), c, i / seg * 40, 0, d);
    g.v(cx + c0 * r0, y0, cz + s0 * r0 * ez, c0 / Math.hypot(1, sl), sl / Math.hypot(1, sl), s0 / Math.hypot(1, sl), c, (i + 1) / seg * 40, 0, d);
    g.v(cx + c0 * r1, y0 + h, cz + s0 * r1 * ez, c0 / Math.hypot(1, sl), sl / Math.hypot(1, sl), s0 / Math.hypot(1, sl), c, (i + 1) / seg * 40, h, d);
    g.v(cx + c1 * r1, y0 + h, cz + s1 * r1 * ez, c1 / Math.hypot(1, sl), sl / Math.hypot(1, sl), s1 / Math.hypot(1, sl), c, i / seg * 40, h, d);
    g.t(i0, i0 + 1, i0 + 2); g.t(i0, i0 + 2, i0 + 3);
    if (o.cap && r1 > 0.01) {
      const j0 = g.n, ct = o.capc || c;
      g.v(cx, y0 + h, cz, 0, 1, 0, ct, 0, 0, d); g.v(cx + c1 * r1, y0 + h, cz + s1 * r1 * ez, 0, 1, 0, ct, 0, 0, d); g.v(cx + c0 * r1, y0 + h, cz + s0 * r1 * ez, 0, 1, 0, ct, 0, 0, d);
      g.t(j0, j0 + 1, j0 + 2);
    }
  }
}
// Flat disc (or ellipse) facing up.
function discG(g, cx, y, cz, rx, rz, seg, c, d) {
  d = d || D0;
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, j0 = g.n;
    g.v(cx, y, cz, 0, 1, 0, c, 0, 0, d); g.v(cx + Math.cos(a1) * rx, y, cz + Math.sin(a1) * rz, 0, 1, 0, c, 0, 0, d); g.v(cx + Math.cos(a0) * rx, y, cz + Math.sin(a0) * rz, 0, 1, 0, c, 0, 0, d);
    g.t(j0, j0 + 1, j0 + 2);
  }
}
// Ellipsoid (or hemisphere when half is set). jit roughens it into foliage; ca/cb tint bottom to top.
function blobG(g, cx, cy, cz, rx, ry, rz, segs, rings, ca, cb, d, o) {
  o = o || {}; d = d || D0;
  const R = o.half ? rings : rings * 2, phiMax = o.half ? PI / 2 : PI, seed = o.seed || 0, jit = o.jit || 0;
  const idx = [];
  for (let i = 0; i <= R; i++) {
    const phi = i / R * phiMax, sp = Math.sin(phi), cp = Math.cos(phi), row = [];
    for (let k = 0; k < segs; k++) {
      const th = k / segs * TAU, ct = Math.cos(th), st = Math.sin(th);
      const j = 1 + jit * (hash2(i, k, seed) - 0.5) * 2 * (i === 0 || i === R ? 0 : 1);
      const nx = sp * ct, ny = cp, nz = sp * st;
      const col = mixc(ca, cb, clamp(ny * 0.5 + 0.55, 0, 1));
      row.push(g.v(cx + nx * rx * j, cy + ny * ry * j, cz + nz * rz * j, nx, ny, nz, col, 0, 0, d));
    }
    idx.push(row);
  }
  for (let i = 0; i < R; i++) for (let k = 0; k < segs; k++) {
    const k1 = (k + 1) % segs, a = idx[i][k], b = idx[i][k1], c2 = idx[i + 1][k1], e = idx[i + 1][k];
    g.t(c2, e, a); g.t(c2, a, b);
  }
}
// Four sided pyramid / hip roof from a rectangle at y0 up to a smaller rectangle (or ridge) at y1.
function roofG(g, x0, z0, x1, z1, y0, y1, ix, iz, c, d) {
  d = d || D0;
  const ax0 = x0 + ix, ax1 = x1 - ix, az0 = z0 + iz, az1 = z1 - iz;
  const face = (p, c2) => { const e1 = [p[3] - p[0], p[4] - p[1], p[5] - p[2]], e2 = [p[6] - p[3], p[7] - p[4], p[8] - p[5]]; let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0]; const l = Math.hypot(nx, ny, nz) || 1; g.q(p, nx / l, ny / l, nz / l, c2, null, d); };
  face([x0, y0, z1, x1, y0, z1, ax1, y1, az1, ax0, y1, az1], c);
  face([x1, y0, z0, x0, y0, z0, ax0, y1, az0, ax1, y1, az0], mulc(c, 0.9));
  face([x1, y0, z1, x1, y0, z0, ax1, y1, az0, ax1, y1, az1], mulc(c, 0.82));
  face([x0, y0, z0, x0, y0, z1, ax0, y1, az1, ax0, y1, az0], mulc(c, 0.95));
  if (ix < (x1 - x0) / 2 - 0.01 && iz < (z1 - z0) / 2 - 0.01) g.q([ax0, y1, az1, ax1, y1, az1, ax1, y1, az0, ax0, y1, az0], 0, 1, 0, c, null, d);
}

/* ---- time of day: one palette that sky, fog, lights and windows all read */
const TOD = {
  hor: new THREE.Color(), opp: new THREE.Color(), zen: new THREE.Color(), fog: new THREE.Color(), sunCol: new THREE.Color(), glow: new THREE.Color(),
  _kd: new THREE.Vector3(), sunDir: new THREE.Vector3(-0.9, 0.05, 0.3), moonDir: new THREE.Vector3(0.6, 0.6, -0.4), keyDir: new THREE.Vector3(-0.6, 0.5, 0.3),
  night: 0, day: 0, dusk: 1, win: 0, lamp: 0, s: 0, expo: 1, keyI: 1, hemiI: 0.5, envI: 0.5, sunElev: 0, starA: 0,
};

/* ---- patched standard material for the static city (facades, roads, ground, props) */
const GLSL_COMMON = `
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
#ifdef LITE
#define vn(p) 0.5
#endif
`;
function cityMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0 });
  m.shadowSide = THREE.DoubleSide;
  if (!LOD) m.defines = { LITE: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = UN.uNight; sh.uniforms.uWin = UN.uWin; sh.uniforms.uTime = UN.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 wd; attribute vec2 wuv; varying vec4 vWd; varying vec2 vWuv; varying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWd = wd; vWuv = wuv; vWp = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vWd; varying vec2 vWuv; varying vec3 vWp; uniform float uNight; uniform float uWin; uniform float uTime;\n' + GLSL_COMMON)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + `
vec3 wEm = vec3(0.0); float wR = -1.0; float wM = -1.0;
float kind = vWd.x;
float fadeD = 1.0 - smoothstep(160.0, 640.0, vFogDepth);
if (kind < 0.5) {
  float n = vn(vWp.xz * 0.3 + vWp.y * 0.17);
  diffuseColor.rgb *= 0.9 + 0.2 * mix(0.5, n, fadeD);
} else if (kind < 1.9) {
  float cw = vWd.y, ch = vWd.z, seed = vWd.w;
  vec2 cell = vWuv / vec2(cw, ch);
  vec2 id = floor(cell), f = fract(cell);
  float rn = h21(id + seed * 0.37);
  float rn2 = h21(id * 1.7 + seed * 0.11 + 3.0);
  bool glassT = kind > 1.5;
  bool shop = kind > 1.1 && kind < 1.4 && id.y < 0.5;
  vec2 lo = glassT ? vec2(0.05, 0.07) : (shop ? vec2(0.06, 0.08) : vec2(0.22, 0.2));
  vec2 hi = glassT ? vec2(0.95, 0.93) : (shop ? vec2(0.94, 0.8) : vec2(0.78, 0.8));
  vec2 q = (f - lo) / (hi - lo);
  vec2 fw = fwidth(q) + 1e-4;
  vec2 mm = smoothstep(vec2(0.0), fw, q) * (1.0 - smoothstep(vec2(1.0) - fw, vec2(1.0), q));
  float inside = mm.x * mm.y;
  inside = mix(inside, 0.5, smoothstep(0.4, 1.0, max(fw.x, fw.y)));
  vec3 wall = diffuseColor.rgb;
  float streak = vn(vec2(vWuv.x * 0.12, vWuv.y * 0.015 + seed));
  wall *= 0.86 + 0.26 * mix(0.5, streak, fadeD);
  wall *= 0.8 + 0.2 * smoothstep(0.0, 0.1, f.y);
  if (id.y < 0.5 && !shop) wall *= 0.86;
  vec3 glass = mix(vec3(0.025, 0.04, 0.065), vec3(0.11, 0.15, 0.21), rn2 * 0.8);
  float litP = shop ? 0.92 : 0.32 + 0.4 * h21(vec2(seed, id.y * 3.1));
  float lit = step(rn, litP) * uWin;
  vec3 lc = mix(vec3(1.0, 0.72, 0.4), vec3(0.72, 0.85, 1.0), step(0.86, rn2));
  lc *= 0.55 + 0.95 * h21(id + 9.1);
  float mull = glassT ? 0.0 : (1.0 - smoothstep(0.0, 0.05 + fw.x, abs(q.x - 0.5))) * 0.7;
  diffuseColor.rgb = mix(wall, glass, inside * (1.0 - mull * 0.5));
  float shelf = shop ? (0.55 + 0.45 * step(0.5, fract(q.y * 3.0 + rn * 2.0)) * (0.5 + 0.5 * h21(floor(q * vec2(7.0, 3.0)) + seed))) : 1.0;
  wEm = lc * lit * inside * (1.0 - mull * 0.85) * 1.0 * shelf * (shop ? 0.85 : 1.0);
  wR = mix(0.88, 0.1, inside); wM = inside * 0.5;
} else if (kind < 2.5) {
  float hw = vWd.y, L = vWd.z, sg = vWd.w;
  float u = vWuv.x, v = vWuv.y, au = abs(u);
  float gr = 0.5 * vn(vWp.xz * 0.8) + 0.5 * vn(vWp.xz * 3.1);
  vec3 col = vec3(0.105, 0.11, 0.122) * (0.84 + 0.34 * mix(0.5, gr, fadeD));
  float paint = 0.0;
  if (L > 1.0) {
    bool blvd = hw > 60.0;
    float lw = fwidth(u) * 0.8 + 0.0001;
    paint = max(paint, 0.5 * (1.0 - smoothstep(0.0, 0.9 + lw, abs(au - (hw - 4.0)))));
    float inner = step(20.0, v) * step(v, L - 20.0);
    if (!blvd) {
      float dash = step(mod(v - 30.0, 30.0), 16.0) * step(30.0, v) * step(v, L - 30.0);
      paint = max(paint, dash * (1.0 - smoothstep(0.0, 1.2 + lw, au)));
      paint = max(paint, 0.28 * inner * (1.0 - smoothstep(0.0, 0.8 + lw, abs(au - 30.0))));
    } else {
      float med = 1.0 - smoothstep(7.0, 8.0 + lw, au);
      col = mix(col, vec3(0.34, 0.33, 0.3), med * inner);
      float gra = 1.0 - smoothstep(5.0, 6.0 + lw, au);
      col = mix(col, vec3(0.09, 0.2, 0.07) * (0.8 + 0.4 * gr), gra * step(22.0, v) * step(v, L - 22.0));
      float dash2 = step(mod(v - 30.0, 28.0), 14.0) * step(30.0, v) * step(v, L - 30.0);
      paint = max(paint, 0.7 * dash2 * (1.0 - smoothstep(0.0, 0.9 + lw, abs(au - 36.0))));
      paint = max(paint, 0.8 * inner * (1.0 - smoothstep(0.0, 1.0 + lw, abs(au - 66.0))));
    }
    float zb = step(mod(u + hw - 7.0, 11.0), 6.0) * step(7.0, u + hw) * step(u, hw - 9.0);
    float zv = step(2.0, v) * step(v, 17.0) + step(L - 17.0, v) * step(v, L - 2.0);
    paint = max(paint, 0.88 * zb * zv);
    float ext = blvd ? 66.0 : 30.0, inn = blvd ? 8.0 : 3.0;
    float s0 = u * (-sg), s1 = u * sg;
    float sl = step(inn, s0) * step(s0, ext) * step(21.0, v) * step(v, 24.0) + step(inn, s1) * step(s1, ext) * step(L - 24.0, v) * step(v, L - 21.0);
    paint = max(paint, 0.9 * sl);
    float tr = (1.0 - smoothstep(0.0, 5.0, abs(au - (blvd ? 30.0 : 15.0)))) * 0.14;
    col *= 1.0 - tr * fadeD;
  }
  col = mix(col, vec3(0.9, 0.9, 0.84), clamp(paint, 0.0, 1.0));
  diffuseColor.rgb = col;
  wR = 0.62 - 0.12 * paint;
} else if (kind < 3.5) {
  wEm = diffuseColor.rgb * 2.2;
  diffuseColor.rgb *= 0.25;
} else if (kind < 4.5) {
  int pat = int(vWd.y + 0.5);
  vec2 p = vWp.xz;
  vec3 c = diffuseColor.rgb;
  float n1 = vn(p * 0.09), n2 = vn(p * 1.1);
  if (pat == 1) {
    vec2 g = fract(p / 8.0); float j = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)) * 8.0;
    float joint = 1.0 - smoothstep(0.0, 0.45 + fwidth(j), j);
    c *= (1.0 - 0.2 * joint * fadeD) * (0.9 + 0.2 * h21(floor(p / 8.0)));
  } else if (pat == 2 || pat == 9) {
    float st = step(0.5, fract((p.x + p.y * 0.35) / (pat == 9 ? 14.0 : 22.0)));
    c *= (0.78 + 0.4 * n1) * (pat == 9 ? mix(0.86, 1.12, mix(0.5, st, fadeD)) : 1.0) * (0.92 + 0.16 * mix(0.5, n2, fadeD));
  } else if (pat == 3) {
    float wet = 1.0 - smoothstep(0.0, 12.0, vWuv.x);
    c *= (0.92 + 0.16 * mix(0.5, n2, fadeD)) * (1.0 - 0.28 * wet);
  } else if (pat == 4 || pat == 5 || pat == 6) {
    float sz = pat == 5 ? 22.0 : (pat == 6 ? 24.0 : 20.0);
    vec2 g = fract(p / sz); float j = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)) * sz;
    float joint = 1.0 - smoothstep(0.0, 0.5 + fwidth(j), j);
    c *= (1.0 - 0.22 * joint * fadeD) * (0.92 + 0.14 * h21(floor(p / sz)));
  } else if (pat == 7) {
    c *= 0.9 + 0.2 * vn(p * 0.4 + uTime * 0.3);
    wR = 0.06; wM = 0.4;
  } else if (pat == 8) {
    c *= (0.84 + 0.3 * n1) * (0.94 + 0.12 * mix(0.5, n2, fadeD));
  } else {
    c *= (0.9 + 0.2 * n1) * (0.95 + 0.1 * mix(0.5, n2, fadeD));
  }
  diffuseColor.rgb = c;
} else {
  float rib = 0.82 + 0.18 * step(0.5, fract(vWuv.x / 2.2));
  diffuseColor.rgb *= rib * (0.88 + 0.24 * mix(0.5, vn(vWuv * 0.35), fadeD));
  wR = 0.5; wM = 0.45;
}
`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (wR >= 0.0) roughnessFactor = wR;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (wM >= 0.0) metalnessFactor = wM;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wEm;');
  };
  m.customProgramCacheKey = () => 'sc-city-' + LOD;
  return m;
}

/* ---- vehicles: one patched material, tint only the paint vertices */
function vehicleMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 });
  m.shadowSide = THREE.DoubleSide;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float vk; attribute vec3 iCol; attribute vec2 iLamp; varying float vVk; varying vec2 vLamp;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = color.rgb * ((vk < 0.5) ? iCol : vec3(1.0)); vVk = vk; vLamp = iLamp;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vVk; varying vec2 vLamp;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + `
float cR = 0.32; float cM = 0.28; vec3 cEm = vec3(0.0);
if (vVk < 0.5) { cR = 0.3; cM = 0.3; }
else if (vVk < 1.5) { cR = 0.05; cM = 0.92; }
else if (vVk < 2.5) { cR = 0.2; cM = 0.0; cEm = vColor.rgb * vLamp.x * 3.2; }
else if (vVk < 3.5) { cR = 0.25; cM = 0.0; cEm = vColor.rgb * vLamp.y * 2.6; }
else if (vVk < 4.5) { cR = 0.78; cM = 0.04; }
else { cR = 0.42; cM = 0.35; }
`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = cR;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = cM;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cEm;');
  };
  m.customProgramCacheKey = () => 'sc-veh-1';
  return m;
}

/* ================================================================ the static city as geometry */
// Quad whose winding is fixed up so its front faces `hint` (used for slanted bits).
GB.prototype.qh = function (p, hint, c, uv, d) {
  const e1 = [p[3] - p[0], p[4] - p[1], p[5] - p[2]], e2 = [p[6] - p[3], p[7] - p[4], p[8] - p[5]];
  let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
    p = [p[9], p[10], p[11], p[6], p[7], p[8], p[3], p[4], p[5], p[0], p[1], p[2]];
    if (uv) uv = [uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1]];
    nx = -nx; ny = -ny; nz = -nz;
  }
  this.q(p, nx, ny, nz, c, uv, d);
};
// Convex prism from a ground outline (x,z pairs), sides plus a fan on top.
function prismG(g, pts, y0, y1, c, ctop, d) {
  d = d || D0;
  let cx = 0, cz = 0; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; } cx /= pts.length / 2; cz /= pts.length / 2;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2;
    g.qh([pts[a], y0, pts[a + 1], pts[b], y0, pts[b + 1], pts[b], y1, pts[b + 1], pts[a], y1, pts[a + 1]], [(pts[a] + pts[b]) / 2 - cx, 0, (pts[a + 1] + pts[b + 1]) / 2 - cz], c, null, d);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = ((i + 1) % n) * 2, j0 = g.n;
    g.v(cx, y1, cz, 0, 1, 0, ctop || c, 0, 0, d); g.v(pts[a], y1, pts[a + 1], 0, 1, 0, ctop || c, 0, 0, d); g.v(pts[b], y1, pts[b + 1], 0, 1, 0, ctop || c, 0, 0, d);
    const ex1 = pts[a] - cx, ez1 = pts[a + 1] - cz, ex2 = pts[b] - cx, ez2 = pts[b + 1] - cz;
    // want the normal to point up: flip when the fan is wound the other way
    if (ez1 * ex2 - ex1 * ez2 > 0) g.t(j0, j0 + 2, j0 + 1); else g.t(j0, j0 + 1, j0 + 2);
  }
}
// Four walls of a rectangle with window uv: wdFn(side, length) gives [kind, cell w, cell h, seed].
function wallsG(g, x0, z0, x1, z1, y0, y1, c, wdFn) {
  const S = [[x0, z1, 1, 0, 0, 1, x1 - x0], [x1, z0, -1, 0, 0, -1, x1 - x0], [x1, z1, 0, -1, 1, 0, z1 - z0], [x0, z0, 0, 1, -1, 0, z1 - z0]];
  for (let s = 0; s < 4; s++) {
    const o = S[s], len = o[6], d = wdFn(s, len), ex = o[0] + o[2] * len, ez = o[1] + o[3] * len;
    g.q([o[0], y0, o[1], ex, y0, ez, ex, y1, ez, o[0], y1, o[1]], o[4], 0, o[5], c, [0, y0, len, y0, len, y1, 0, y1], d);
  }
}
const SIDEF = (x0, z0, x1, z1) => [[x0, z1, 1, 0, 0, 1, x1 - x0], [x1, z0, -1, 0, 0, -1, x1 - x0], [x1, z1, 0, -1, 1, 0, z1 - z0], [x0, z0, 0, 1, -1, 0, z1 - z0]];

// Which sides of a footprint look onto a road (so they get shopfronts, awnings and signs).
function roadSides(b) {
  const x0 = b.x, x1 = b.x + b.w, z0 = b.y, z1 = b.y + b.d, T = 58, f = [false, false, false, false];
  for (let j = 0; j < NY; j++) {
    const lo = YC[j] - YR[j].hw, hi = YC[j] + YR[j].hw;
    if (lo - z1 >= -2 && lo - z1 < T) f[0] = true;
    if (z0 - hi >= -2 && z0 - hi < T) f[1] = true;
  }
  for (let i = 0; i < NX; i++) {
    const lo = XC[i] - XR[i].hw, hi = XC[i] + XR[i].hw;
    if (lo - x1 >= -2 && lo - x1 < T) f[2] = true;
    if (x0 - hi >= -2 && x0 - hi < T) f[3] = true;
  }
  return f;
}

const KEMIT = [3, 0, 0, 0];
const lampHeads = [];   // filled by the chunk builder: world positions of lamp heads per chunk

function treeG(g, t, out) {
  const R = t.r * 2.6, h1 = hash2(t.x | 0, t.y | 0, 5);
  if (t.k === 'palm') {
    const ht = t.r * 7, lean = 7 + h1 * 6, lx = Math.cos(t.rot) * lean, lz = Math.sin(t.rot) * lean, trunk = lin('#7a5a3a'), trunk2 = lin('#5e4429');
    let px = t.x, pz = t.y, py = 0;
    for (let k = 0; k < 3; k++) {
      const nx = t.x + lx * (k + 1) / 3 * (k + 1) / 3, nz = t.y + lz * (k + 1) / 3 * (k + 1) / 3, hh = ht / 3;
      const i0 = g.n; cylG(g, 0, 0, 0, 3.4 - k * 0.7, 2.7 - k * 0.7, hh, 6, k % 2 ? trunk2 : trunk); g.place(i0, 0, px, py, pz);
      px = nx; pz = nz; py += hh;
    }
    const g1 = lin('#2f7a3a'), g2 = lin('#4aa047');
    for (let f = 0; f < (LOD ? 9 : 6); f++) {
      const a = t.rot + f * TAU / (LOD ? 9 : 6) + h1, ca = Math.cos(a), sa = Math.sin(a), L = 46 + (f % 3) * 5, wv = 5.5, nxv = -sa, nzv = ca;
      const mx = px + ca * L * 0.5, mz = pz + sa * L * 0.5, ex = px + ca * L, ez = pz + sa * L, col = f % 2 ? g1 : g2;
      const up = [0, 1, 0];
      g.qh([px - nxv * 1.5, py, pz - nzv * 1.5, px + nxv * 1.5, py, pz + nzv * 1.5, mx + nxv * wv, py + 9, mz + nzv * wv, mx - nxv * wv, py + 9, mz - nzv * wv], up, col);
      g.qh([px - nxv * 1.5, py, pz - nzv * 1.5, px + nxv * 1.5, py, pz + nzv * 1.5, mx + nxv * wv, py + 9, mz + nzv * wv, mx - nxv * wv, py + 9, mz - nzv * wv], [0, -1, 0], mulc(col, 0.7));
      g.qh([mx - nxv * wv, py + 9, mz - nzv * wv, mx + nxv * wv, py + 9, mz + nzv * wv, ex + nxv * 0.5, py - 4, ez + nzv * 0.5, ex - nxv * 0.5, py - 4, ez - nzv * 0.5], up, mulc(col, 1.1));
      g.qh([mx - nxv * wv, py + 9, mz - nzv * wv, mx + nxv * wv, py + 9, mz + nzv * wv, ex + nxv * 0.5, py - 4, ez + nzv * 0.5, ex - nxv * 0.5, py - 4, ez - nzv * 0.5], [0, -1, 0], mulc(col, 0.7));
    }
    blobG(g, px, py + 1, pz, 3, 3, 3, 5, 2, lin('#6a4a2e'), lin('#8a6a3e'));
    return;
  }
  const ht = R * 0.95, trunk = lin('#5a4128');
  cylG(g, t.x, 0, t.y, Math.max(1.6, R * 0.1), Math.max(1.2, R * 0.065), ht, LOD ? 6 : 4, trunk);
  const ca = lin(t.c0), cb = lin(t.c2), cm = lin(t.c1);
  if (LOD) {
    blobG(g, t.x, ht + R * 0.5, t.y, R, R * 0.82, R, 7, 2, ca, cb, D0, { jit: 0.13, seed: (t.x * 7 + t.y) | 0 });
    blobG(g, t.x + R * 0.6, ht + R * 0.18, t.y + R * 0.2, R * 0.7, R * 0.6, R * 0.7, 5, 2, ca, cm, D0, { jit: 0.14, seed: (t.x + t.y * 3) | 0 });
  } else {
    blobG(g, t.x, ht + R * 0.45, t.y, R, R * 0.85, R, 5, 2, ca, cb, D0, { jit: 0.12, seed: (t.x * 7 + t.y) | 0 });
  }
}

function lampG(g, l, out) {
  const dx = -Math.cos(l.a), dz = -Math.sin(l.a), hd = Math.atan2(dz, dx), pole = lin('#4a4c50'), head = lin('#fff1c8');
  cylG(g, l.x, 0, l.y, 1.5, 1.0, 74, LOD ? 6 : 4, pole);
  boxR(g, l.x + dx * 9, 72.5, l.y + dz * 9, 20, 1.6, 1.6, hd, pole);
  boxR(g, l.x + dx * 18, 70.6, l.y + dz * 18, 10, 1.4, 4.4, hd, head, KEMIT);
  out.push([l.x + dx * 18, 70, l.y + dz * 18]);
}

function propG(g, p) {
  const wood = lin('#7a5636'), metal = lin('#5d6166');
  if (p.t === 'bench') {
    const i0 = g.n;
    boxG(g, -9, 4.5, -2.6, 9, 5.7, 2.6, wood); boxG(g, -9, 5.7, -2.9, 9, 12, -2.2, wood); boxG(g, -8, 0, -2, -6.6, 4.5, 2, metal); boxG(g, 6.6, 0, -2, 8, 4.5, 2, metal);
    g.place(i0, p.a || 0, p.x, 2, p.y);
  } else if (p.t === 'fountain') {
    cylG(g, p.x, 3.4, p.y, 11, 10, 4, 14, lin('#d8cdb0'), D0, { cap: true });
    discG(g, p.x, 7.1, p.y, 9, 9, 14, lin('#3f9bb0'), [4, 7, 0, 0]);
    cylG(g, p.x, 7, p.y, 1.8, 1.2, 15, 8, lin('#d8cdb0'));
    cylG(g, p.x, 20, p.y, 1.4, 5.5, 3, 10, lin('#d8cdb0'));
    discG(g, p.x, 23.1, p.y, 5, 5, 10, lin('#8fd3e0'), [4, 7, 0, 0]);
  } else if (p.t === 'swing') {
    const c1 = lin('#d9503c'), c2 = lin('#3a6fd0');
    boxG(g, p.x - 18, 0, p.y - 1, p.x - 16.6, 20, p.y + 1, metal); boxG(g, p.x + 16.6, 0, p.y - 1, p.x + 18, 20, p.y + 1, metal);
    boxG(g, p.x - 18, 19, p.y - 0.8, p.x + 18, 20.4, p.y + 0.8, c1);
    boxG(g, p.x - 8, 5, p.y - 2.5, p.x - 1, 6.2, p.y + 2.5, c2); boxG(g, p.x + 4, 5, p.y - 2.5, p.x + 11, 6.2, p.y + 2.5, c2);
    boxG(g, p.x - 5, 6, p.y - 0.2, p.x - 4.6, 19, p.y + 0.2, metal); boxG(g, p.x + 7, 6, p.y - 0.2, p.x + 7.4, 19, p.y + 0.2, metal);
  } else if (p.t === 'slide') {
    const c1 = lin('#f0c14b'), c2 = lin('#d9503c');
    boxG(g, p.x - 4, 0, p.y - 4, p.x + 4, 22, p.y + 4, c2);
    g.qh([p.x + 4, 20, p.y - 3.5, p.x + 4, 20, p.y + 3.5, p.x + 30, 1, p.y + 3.5, p.x + 30, 1, p.y - 3.5], [0, 1, 0], c1);
    g.qh([p.x + 4, 20, p.y - 3.5, p.x + 4, 20, p.y + 3.5, p.x + 30, 1, p.y + 3.5, p.x + 30, 1, p.y - 3.5], [0, -1, 0], mulc(c1, 0.7));
  } else if (p.t === 'stumps') {
    const wd2 = lin('#e8dcc0');
    for (let k = -1; k <= 1; k++) boxG(g, p.x - 0.5, 3.5, p.y + k * 1.7 - 0.3, p.x + 0.5, 12.5, p.y + k * 1.7 + 0.3, wd2);
  } else if (p.t === 'bollard') {
    cylG(g, p.x, 0, p.y, 1.9, 1.7, 6, 7, lin('#e1b83b'), D0, { cap: true });
  }
}

function standGoods(g, x, z, seed) {
  const cols = ['#e0584b', '#e8a33a', '#7bb35a', '#c9477f'];
  for (let k = 0; k < 3; k++) blobG(g, x + 4 + k * 6, 10.2, z + 6, 2.6, 2.2, 2.6, 5, 2, lin(cols[(seed + k) % 4]), mulc(lin(cols[(seed + k) % 4]), 1.2));
}

function bldGeo(g, b, lampsOut) {
  const x0 = b.x, x1 = b.x + b.w, z0 = b.y, z1 = b.y + b.d, H = b.H;
  const wallC = lin(b.rc), tint = (f) => mulc(wallC, f);
  if (b.k === 'stall') {
    const col = lin(b.col), cream = lin('#f4efe2'), wood = lin('#6b4a2e');
    boxG(g, x0 + 1, 7, z0 + 5, x1 - 1, 8.4, z1 - 1, wood);
    for (const [px, pz] of [[x0 + 1, z0 + 2], [x1 - 2, z0 + 2], [x0 + 1, z1 - 2], [x1 - 2, z1 - 2]]) boxG(g, px, 0, pz, px + 1, 24, pz + 1, wood);
    const n = 6, sw = (x1 - x0 + 4) / n;
    for (let i = 0; i < n; i++) {
      const xa = x0 - 2 + i * sw, xb = xa + sw, c = i % 2 ? cream : col;
      g.qh([xa, 27, z0 + 1, xb, 27, z0 + 1, xb, 21.5, z1 + 3, xa, 21.5, z1 + 3], [0, 1, 0.4], c);
      g.qh([xa, 27, z0 + 1, xb, 27, z0 + 1, xb, 21.5, z1 + 3, xa, 21.5, z1 + 3], [0, -1, -0.4], mulc(c, 0.6));
      g.qh([xa, 21.5, z1 + 3, xb, 21.5, z1 + 3, xb, 19.2, z1 + 3, xa, 19.2, z1 + 3], [0, 0, 1], mulc(c, 0.9));
    }
    standGoods(g, x0, z0 - 1, b.seed | 0);
    return;
  }
  if (b.k === 'crane') {
    const red = lin('#c9402c'), dark = lin('#4a4d52'), yel = lin('#e8c33a'), cz = z0;
    for (const [lx, lz] of [[448, cz - 10], [468, cz - 10], [448, cz + 12], [468, cz + 12]]) boxG(g, lx, 0, lz, lx + 5, 172, lz + 5, dark);
    boxG(g, 446, 60, cz - 10, 475, 63, cz + 17, dark); boxG(g, 446, 120, cz - 10, 475, 123, cz + 17, dark);
    boxG(g, x0 - 170, 172, cz - 3, x0 + 62, 181, cz + 10, red);
    boxG(g, x0 - 170, 181, cz - 1, x0 + 62, 183, cz + 8, mulc(red, 0.7));
    boxG(g, x0 - 110, 160, cz - 4, x0 - 88, 172, cz + 11, yel);
    boxG(g, x0 - 104, 120, cz + 3.5, x0 - 103, 160, cz + 4.5, dark);
    boxG(g, x0 - 12, 181, cz - 8, x0 + 14, 195, cz + 14, dark);
    boxG(g, x0 - 9, 183, cz - 12, x0 + 5, 192, cz - 7.5, yel, KEMIT);
    boxG(g, x0 - 172, 175, cz, x0 - 168, 179, cz + 6, lin('#ff3020'), KEMIT);
    lampsOut.push([x0 - 170, 180, cz + 3, 1]);
    return;
  }
  if (b.k === 'container') {
    const c = lin(b.rc);
    wallsG(g, x0, z0, x1, z1, 0, H, c, () => [5, 0, 0, 0]);
    g.q([x0, H, z1, x1, H, z1, x1, H, z0, x0, H, z0], 0, 1, 0, mulc(c, 1.15), null, D0);
    return;
  }
  if (b.k === 'ship') {
    const cz = z0 + b.d / 2, hullR = lin('#8a2f25'), hullB = lin('#233a52'), deck = lin('#7d7f84');
    const outline = [x0, cz, x0 + 36, cz - 38, x0 + 76, cz - 54, x1 - 24, cz - 54, x1, cz - 46, x1, cz + 46, x1 - 24, cz + 54, x0 + 76, cz + 54, x0 + 36, cz + 38];
    prismG(g, outline, -8, 24, hullR, deck);
    prismG(g, outline.map((v, i) => (i % 2 ? cz + (v - cz) * 0.99 : v)), 24, 52, hullB, deck);
    const cols = ['#c0392b', '#2e7d9a', '#e1a41a', '#3c8d5a', '#7d4e9d', '#d9772b', '#2f5fa8', '#8a8f96'];
    for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) for (let lv = 0; lv < 1 + ((r + q) % 3); lv++) {
      const bx = x0 + 70 + q * 38, bz = cz - 44 + r * 22, c = lin(cols[(r * 5 + q * 3 + lv) % 8]);
      wallsG(g, bx, bz, bx + 34, bz + 18, 52 + lv * 13, 65 + lv * 13, c, () => [5, 0, 0, 0]);
      g.q([bx, 65 + lv * 13, bz + 18, bx + 34, 65 + lv * 13, bz + 18, bx + 34, 65 + lv * 13, bz, bx, 65 + lv * 13, bz], 0, 1, 0, mulc(c, 1.1), null, D0);
    }
    const bx = x1 - 52, white = lin('#e9eaec');
    wallsG(g, bx, cz - 30, bx + 40, cz + 30, 52, 112, white, (s, len) => [1, 12, 15, 40 + s]);
    g.q([bx, 112, cz + 30, bx + 40, 112, cz + 30, bx + 40, 112, cz - 30, bx, 112, cz - 30], 0, 1, 0, lin('#cfd2d6'), null, D0);
    boxG(g, bx + 8, 112, cz - 20, bx + 30, 124, cz + 20, white);
    boxG(g, bx + 6, 118, cz - 22, bx + 7.4, 121, cz + 22, lin('#ffe6a0'), KEMIT);
    cylG(g, bx + 20, 112, cz + 0, 7, 5.5, 22, 10, lin('#c9402c'), D0, { cap: true });
    boxG(g, bx + 19, 124, cz - 1, bx + 21, 150, cz + 1, lin('#cfd2d6'));
    boxG(g, x0 + 10, 52, cz - 1, x0 + 11, 74, cz + 1, lin('#cfd2d6'));
    lampsOut.push([bx + 20, 150, cz, 1], [x0 + 10, 74, cz, 2]);
    return;
  }
  if (b.k === 'wall') {
    const c = lin(b.rc);
    wallsG(g, x0, z0, x1, z1, 0, H, c, () => [0, 0, 0, 0]);
    g.q([x0, H, z1, x1, H, z1, x1, H, z0, x0, H, z0], 0, 1, 0, mulc(c, 0.8), null, D0);
    const along = b.w >= b.d, len = along ? b.w : b.d;
    for (let u = 3; u < len - 4; u += 12) {
      if (along) { boxG(g, x0 + u, H, z0, x0 + u + 6, H + 8, z0 + b.d, mulc(c, 1.05)); } else { boxG(g, x0, H, z0 + u, x0 + b.w, H + 8, z0 + u + 6, mulc(c, 1.05)); }
    }
    return;
  }
  if (b.k === 'round') {
    const cx = x0 + b.w / 2, cz = z0 + b.d / 2, rx = b.w / 2, c = lin(b.rc), ez = b.d / b.w;
    if (b.clock) {
      cylG(g, cx, 0, cz, rx * 1.05, rx * 0.9, H, 12, c, D0, { ez });
      cylG(g, cx, H, cz, rx * 1.2, rx * 1.2, 5, 12, mulc(c, 0.8), D0, { ez, cap: true });
      cylG(g, cx, H + 5, cz, rx * 1.1, 0.5, 44, 12, lin('#4e9c8a'), D0, { ez });
      cylG(g, cx, H + 49, cz, 0.5, 0.5, 14, 4, lin('#c9a24a'));
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const fx = cx + dx * (rx * 0.93 + 0.7), fz = cz + dz * (rx * 0.93 + 0.7), r = 8, tx = -dz, tz = dx, yc = H - 34;
        g.qh([fx - tx * r, yc - r, fz - tz * r, fx + tx * r, yc - r, fz + tz * r, fx + tx * r, yc + r, fz + tz * r, fx - tx * r, yc + r, fz - tz * r], [dx, 0, dz], lin('#fff2cf'), null, KEMIT);
      }
      return;
    }
    cylG(g, cx, 0, cz, rx * 1.04, rx * 0.94, H, 12, c, D0, { ez });
    cylG(g, cx, H, cz, rx * 1.08, rx * 1.08, 4, 12, mulc(c, 0.85), D0, { ez, cap: true, capc: mulc(c, 0.7) });
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; boxR(g, cx + Math.cos(a) * rx * 1.02, H + 4, cz + Math.sin(a) * rx * ez * 1.02, 6, 6, 5, a + PI / 2, mulc(c, 1.05)); }
    return;
  }
  // ordinary building
  const faces = roadSides(b), glass = !!b.glass, ribs = !!b.ribs;
  const nfl = Math.max(1, Math.round(H / (glass ? 26 : 30))), chh = H / nfl;
  const sd = ((b.seed | 0) % 997) * 0.01;
  const shopOK = !glass && !ribs && b.ds !== 'heights' && b.ds !== 'docks';
  wallsG(g, x0, z0, x1, z1, 0, H, tint(glass ? 0.7 : 0.97), (s, len) => {
    const nb = Math.max(1, Math.round(len / (glass ? 15 : 22)));
    if (ribs) return [5, 0, 0, 0];
    return [glass ? 1.6 : (faces[s] && shopOK ? 1.2 : 1.0), len / nb, chh, sd + s * 7.3];
  });
  const roofC = ribs ? lin('#8c8f94') : mixc(wallC, [0.16, 0.16, 0.17], 0.5);
  let roofY = H;
  if (b.tiles) {
    roofG(g, x0 - 3, z0 - 3, x1 + 3, z1 + 3, H, H + Math.min(b.w, b.d) * 0.22, Math.min(b.w, b.d) * 0.3, Math.min(b.w, b.d) * 0.3, lin('#b5573a'));
  } else if (ribs) {
    if (b.w >= b.d) roofG(g, x0 - 2, z0 - 2, x1 + 2, z1 + 2, H, H + b.d * 0.18, 0, b.d / 2 + 2, roofC); else roofG(g, x0 - 2, z0 - 2, x1 + 2, z1 + 2, H, H + b.w * 0.18, b.w / 2 + 2, 0, roofC);
  } else {
    g.q([x0, H, z1, x1, H, z1, x1, H, z0, x0, H, z0], 0, 1, 0, roofC, null, D0);
    const pc = mulc(wallC, 0.92), ph = 4;
    g.q([x0, H, z1, x1, H, z1, x1, H + ph, z1, x0, H + ph, z1], 0, 0, 1, pc, null, D0); g.q([x1, H, z0, x0, H, z0, x0, H + ph, z0, x1, H + ph, z0], 0, 0, -1, pc, null, D0);
    g.q([x1, H, z1, x1, H, z0, x1, H + ph, z0, x1, H + ph, z1], 1, 0, 0, pc, null, D0); g.q([x0, H, z0, x0, H, z1, x0, H + ph, z1, x0, H + ph, z0], -1, 0, 0, pc, null, D0);
    if (glass && b.w > 50 && b.d > 50) {
      const ins = Math.min(b.w, b.d) * 0.2, H2 = H * 0.1;
      wallsG(g, x0 + ins, z0 + ins, x1 - ins, z1 - ins, H, H + H2, tint(0.7), (s, len) => [1.6, len / Math.max(1, Math.round(len / 15)), 26, sd + s]);
      g.q([x0 + ins, H + H2, z1 - ins, x1 - ins, H + H2, z1 - ins, x1 - ins, H + H2, z0 + ins, x0 + ins, H + H2, z0 + ins], 0, 1, 0, roofC, null, D0);
      roofY = H + H2;
    }
    if (glass && b.beacon) { boxG(g, x0 + 4, roofY, z0 + 4, x0 + 5.4, roofY + 14, z0 + 5.4, lin('#6a6e74')); boxG(g, x0 + 3.6, roofY + 14, z0 + 3.6, x0 + 5.8, roofY + 16.2, z0 + 5.8, lin('#ff2a1a'), KEMIT); lampsOut.push([x0 + 4.7, roofY + 15, z0 + 4.7, 1]); }
  }
  if (b.dec && !b.tiles && LOD) {
    for (const e of b.dec) {
      const px = x0 + e.px, pz = z0 + e.py;
      if (e.t === 'ac') boxG(g, px, roofY, pz, px + 9, roofY + 6, pz + 7, lin('#c8cbcf'));
      else if (e.t === 'tank') cylG(g, px, roofY, pz, e.r * 1.5, e.r * 1.5, 12, 8, lin('#d9d5ca'), D0, { cap: true });
      else if (e.t === 'solar') g.qh([px, roofY + 2, pz + e.h, px + e.w, roofY + 2, pz + e.h, px + e.w, roofY + 7, pz, px, roofY + 7, pz], [0, 1, 0.5], lin('#1d3a66'));
      else if (e.t === 'box') boxG(g, px, roofY, pz, px + e.w, roofY + 10, pz + e.h, tint(0.85));
      else if (e.t === 'heli') { discG(g, px, roofY + 0.5, pz, 22, 22, 16, lin('#e8e8e4')); discG(g, px, roofY + 0.9, pz, 19, 19, 16, lin('#46494e')); boxG(g, px - 8, roofY + 0.9, pz - 1, px + 8, roofY + 1.2, pz + 1, lin('#e8e8e4')); boxG(g, px - 8, roofY + 0.9, pz - 7, px - 6, roofY + 1.2, pz + 7, lin('#e8e8e4')); boxG(g, px + 6, roofY + 0.9, pz - 7, px + 8, roofY + 1.2, pz + 7, lin('#e8e8e4')); }
    }
  }
  if (b.dome) {
    const dx = x0 + b.dome.px, dz = z0 + b.dome.py, r = b.dome.r * 1.1, c = lin(b.dome.c);
    cylG(g, dx, roofY, dz, r * 0.92, r * 0.92, 7, 14, mulc(c, 0.85));
    blobG(g, dx, roofY + 7, dz, r, r * 0.95, r, 14, 4, mulc(c, 0.8), mulc(c, 1.15), D0, { half: true });
    cylG(g, dx, roofY + 7 + r * 0.95, dz, 0.8, 0.3, 9, 5, lin('#c9a24a'));
  }
  if (b.chhatri) {
    for (const [qx, qz] of [[8, 8], [b.w - 8, 8], [8, b.d - 8], [b.w - 8, b.d - 8]]) {
      const cx = x0 + qx, cz = z0 + qz;
      for (const [ox, oz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) boxG(g, cx + ox - 0.6, roofY, cz + oz - 0.6, cx + ox + 0.6, roofY + 16, cz + oz + 0.6, lin('#efe5c8'));
      blobG(g, cx, roofY + 16, cz, 6.2, 6, 6.2, 10, 3, lin('#d8caa0'), lin('#f4ecd4'), D0, { half: true });
      cylG(g, cx, roofY + 22, cz, 0.7, 0.2, 6, 4, lin('#c9a24a'));
    }
  }
  // shop fronts: awnings and signs on the sides that face a road
  if (b.awn && !glass) {
    const awn = lin(b.awn), cream = lin('#f4efe2'), S = SIDEF(x0, z0, x1, z1);
    for (let s = 0; s < 4; s++) {
      if (!faces[s]) continue;
      const o = S[s], len = o[6], n = Math.max(3, Math.floor(len / 9)), st = len / n;
      for (let i = 0; i < n; i++) {
        const a0 = i * st, a1 = a0 + st, c = i % 2 ? cream : awn;
        const p0 = [o[0] + o[2] * a0, o[1] + o[3] * a0], p1 = [o[0] + o[2] * a1, o[1] + o[3] * a1];
        g.qh([p0[0], 31, p0[1], p1[0], 31, p1[1], p1[0] + o[4] * 9, 24, p1[1] + o[5] * 9, p0[0] + o[4] * 9, 24, p0[1] + o[5] * 9], [o[4] * 0.5, 1, o[5] * 0.5], c);
        g.qh([p0[0] + o[4] * 9, 24, p0[1] + o[5] * 9, p1[0] + o[4] * 9, 24, p1[1] + o[5] * 9, p1[0] + o[4] * 9, 21.5, p1[1] + o[5] * 9, p0[0] + o[4] * 9, 21.5, p0[1] + o[5] * 9], [o[4], 0, o[5]], mulc(c, 0.85));
      }
    }
  }
  if (b.neon) {
    const c = lin(b.neon), S = SIDEF(x0, z0, x1, z1);
    for (let s = 0; s < 4; s++) {
      if (!faces[s]) continue;
      const o = S[s], len = o[6], a0 = 5, a1 = len - 5;
      const p0 = [o[0] + o[2] * a0 + o[4] * 0.8, o[1] + o[3] * a0 + o[5] * 0.8], p1 = [o[0] + o[2] * a1 + o[4] * 0.8, o[1] + o[3] * a1 + o[5] * 0.8];
      g.q([p0[0], 33, p0[1], p1[0], 33, p1[1], p1[0], 38, p1[1], p0[0], 38, p0[1]], o[4], 0, o[5], c, null, KEMIT);
      lampsOut.push([(p0[0] + p1[0]) / 2 + o[4] * 3, 36, (p0[1] + p1[1]) / 2 + o[5] * 3, 3, b.neon]);
      break;
    }
  }
}

/* ---- road geometry */
const RB = Array.from({ length: TN * TN }, () => ({ segs: [], inter: [] }));
(function () {
  const tileOf = (x, y) => clamp(Math.floor(y / TILE), 0, TN - 1) * TN + clamp(Math.floor(x / TILE), 0, TN - 1);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY - 1; j++) {
    const a = YC[j] + YR[j].hw, b = YC[j + 1] - YR[j + 1].hw;
    RB[tileOf(XC[i], (a + b) / 2)].segs.push({ v: 1, R: XR[i], a, b });
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX - 1; i++) {
    const a = XC[i] + XR[i].hw, b = XC[i + 1] - XR[i + 1].hw;
    RB[tileOf((a + b) / 2, YC[j])].segs.push({ v: 0, R: YR[j], a, b });
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) RB[tileOf(XC[i], YC[j])].inter.push({ i, j });
})();
const ASPH = [0.1, 0.105, 0.115];

function roadSegG(g, s) {
  const c = s.R.c, hw = s.R.hw, L = s.b - s.a;
  if (s.v) { // runs along y
    g.q([c - hw, 0, s.b, c + hw, 0, s.b, c + hw, 0, s.a, c - hw, 0, s.a], 0, 1, 0, ASPH, [-hw, L, hw, L, hw, 0, -hw, 0], [2, hw, L, 1]);
  } else {  // runs along x
    g.q([s.a, 0, c + hw, s.b, 0, c + hw, s.b, 0, c - hw, s.a, 0, c - hw], 0, 1, 0, ASPH, [hw, 0, hw, L, -hw, L, -hw, 0], [2, hw, L, -1]);
  }
}

/* ---- one 512 unit tile of city becomes one mesh */
function buildChunkGeo(tx, ty) {
  const k = ty * TN + tx, bk = BK[k], g = new GB(), lampsOut = [];
  const walk = (c) => mulc(c, 0.86);
  for (const q of bk.g) {
    const c = lin(q.col), d = [4, q.pat, 0, 0];
    if (q.s === 'r') {
      g.q([q.x0, q.h, q.y1, q.x1, q.h, q.y1, q.x1, q.h, q.y0, q.x0, q.h, q.y0], 0, 1, 0, c, null, d);
      const sc = walk(c), sd = [0, 0, 0, 0];
      g.q([q.x0, q.base, q.y1, q.x1, q.base, q.y1, q.x1, q.h, q.y1, q.x0, q.h, q.y1], 0, 0, 1, sc, null, sd);
      g.q([q.x1, q.base, q.y0, q.x0, q.base, q.y0, q.x0, q.h, q.y0, q.x1, q.h, q.y0], 0, 0, -1, sc, null, sd);
      g.q([q.x1, q.base, q.y1, q.x1, q.base, q.y0, q.x1, q.h, q.y0, q.x1, q.h, q.y1], 1, 0, 0, sc, null, sd);
      g.q([q.x0, q.base, q.y0, q.x0, q.base, q.y1, q.x0, q.h, q.y1, q.x0, q.h, q.y0], -1, 0, 0, sc, null, sd);
    } else {
      discG(g, q.cx, q.h, q.cy, q.rx, q.ry, 28, c, d);
      cylG(g, q.cx, 0, q.cy, q.rx, q.rx, q.h, 28, walk(c), D0, { ez: q.ry / q.rx });
    }
  }
  for (const s of RB[k].segs) roadSegG(g, s);
  for (const n of RB[k].inter) {
    const hx = XR[n.i].hw, hy = YR[n.j].hw, cx = XC[n.i], cy = YC[n.j];
    g.q([cx - hx, 0, cy + hy, cx + hx, 0, cy + hy, cx + hx, 0, cy - hy, cx - hx, 0, cy - hy], 0, 1, 0, ASPH, [-hx, 0, hx, 0, hx, 0, -hx, 0], [2, 40, 0, 0]);
    // signal poles on the four corners
    const sx = hx + 6, sy = hy + 6, dark = lin('#2c2f34');
    for (const [px, pz, fx, fz] of [[cx - sx, cy - sy, -1, 0], [cx + sx, cy + sy, 1, 0], [cx + sx, cy - sy, 0, -1], [cx - sx, cy + sy, 0, 1]]) {
      cylG(g, px, 0, pz, 1.2, 0.9, 50, 6, dark);
      boxR(g, px + fx * 2, 38, pz + fz * 2, 4, 14, 4, 0, dark);
    }
    // median trees on boulevards
  }
  for (const s of RB[k].segs) {
    if (!s.R.blvd) continue;
    for (let p = s.a + 34; p < s.b - 30; p += 52) {
      const t = { x: s.v ? s.R.c : p, y: s.v ? p : s.R.c, r: 4.0, c0: '#2a5f3a', c1: '#3a7d4b', c2: '#4f9a5f', k: 'tree', rot: p };
      treeG(g, t);
    }
  }
  for (const b of bk.b) bldGeo(g, b, lampsOut);
  for (const t of bk.t) treeG(g, t);
  for (const l of bk.l) lampG(g, l, lampsOut);
  for (const p of bk.f) propG(g, p);
  const geo = g.geometry();
  return { geo, lights: lampsOut };
}

/* ---- the beach strip, the promenade and the open sea, built once */
function buildShore() {
  const g = new GB(), sand = lin('#e2cc92'), prom = lin('#bab3a3'), edge = lin('#d6cdb8');
  for (let y = -1200; y < W + 1200; y += 16) {
    const s0 = shore(y), s1 = shore(y + 16), a0 = s0 + SAND, a1 = s1 + SAND, pe = 690;
    g.qh([s0 - 1, 0.3, y, s1 - 1, 0.3, y + 16, a1, 0.3, y + 16, a0, 0.3, y], [0, 1, 0], sand, [0, 0, 0, 0, SAND + 1, 0, SAND + 1, 0], [4, 3, 0, 0]);
    g.qh([a0, 0.3, y, a1, 0.3, y + 16, a1, 0.9, y + 16, a0, 0.9, y], [-1, 0, 0], edge, null, [0, 0, 0, 0]);
    g.qh([a0, 0.9, y, a1, 0.9, y + 16, pe, 0.9, y + 16, pe, 0.9, y], [0, 1, 0], prom, null, [4, 5, 0, 0]);
  }
  const far = new GB();
  far.q([620, -0.6, W + 9000, W + 9000, -0.6, W + 9000, W + 9000, -0.6, -9000, 620, -0.6, -9000], 0, 1, 0, lin('#52603e'), null, [4, 8, 0, 0]);
  return { shore: g.geometry(), far: far.geometry() };
}
function buildSeaGeo() {
  const ys = [-9000, -4000, -1800]; for (let y = -1400; y <= W + 1400; y += 32) ys.push(y); ys.push(W + 1800, W + 4000, W + 9000);
  const pos = [], dist = [], idx = [];
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i], s = (y < -1400 || y > W + 1400) ? 640 : shore(y);
    pos.push(-9000, -1.4, y, s + 2, -1.4, y); dist.push(s + 9000, 0);
    if (i) { const b = (i - 1) * 2; idx.push(b, b + 2, b + 3, b, b + 3, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aD', new THREE.BufferAttribute(new Float32Array(dist), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function seaMaterial() {
  return new THREE.ShaderMaterial({
    fog: true, side: THREE.DoubleSide, defines: LOD ? {} : { LITE: 1 },
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: UN.uTime, uNight: UN.uNight, uSunDir: { value: TOD.sunDir }, uSunCol: { value: TOD.sunCol }, uHor: { value: TOD.hor }, uZen: { value: TOD.zen }, uCam: { value: new THREE.Vector3() },
    }]),
    vertexShader: `
attribute float aD; varying float vD; varying vec3 vW;
#include <fog_pars_vertex>
void main() { vD = aD; vW = position; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `
varying float vD; varying vec3 vW; uniform float uTime; uniform float uNight; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uHor; uniform vec3 uZen; uniform vec3 uCam;
#include <fog_pars_fragment>
void main() {
  vec2 p = vW.xz; float t = uTime; vec2 g = vec2(0.0);
  g += vec2(0.8, 0.3) * 0.05 * cos(dot(p, vec2(0.8, 0.3)) * 0.11 + t * 1.3);
#ifndef LITE
  g += vec2(-0.4, 0.9) * 0.04 * cos(dot(p, vec2(-0.4, 0.9)) * 0.19 - t * 1.7);
  g += vec2(0.2, -0.95) * 0.025 * cos(dot(p, vec2(0.2, -0.95)) * 0.43 + t * 2.3);
  g += vec2(0.6, 0.7) * 0.014 * cos(dot(p, vec2(0.6, 0.7)) * 0.9 + t * 3.1);
#endif
  float far = smoothstep(500.0, 2200.0, distance(uCam, vW));
  g *= 1.0 - 0.7 * far;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(uCam - vW);
  float fr = mix(0.05, 1.0, pow(1.0 - max(dot(n, V), 0.0), 4.0));
  vec3 R = reflect(-V, n);
  float rh = clamp(R.y, 0.0, 1.0);
  vec3 sky = mix(uHor, uZen, pow(rh, 0.5));
  float sd = max(dot(R, uSunDir), 0.0);
  sky += uSunCol * (pow(sd, 5.0) * 0.3 + pow(sd, 120.0) * 2.4 + pow(sd, 1800.0) * 7.0);
  vec3 deep = vec3(0.012, 0.085, 0.14), shallow = vec3(0.05, 0.3, 0.33);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 110.0, vD)) * (1.0 - 0.7 * uNight);
  vec3 col = mix(body, sky, fr);
  float foam = smoothstep(10.0, 0.0, vD + sin(p.y * 0.05 + t * 0.9) * 3.5 + sin(p.y * 0.19 - t * 1.4) * 1.4);
  float wash = smoothstep(30.0, 0.0, vD) * 0.1;
  col = mix(col, vec3(0.92, 0.96, 1.0) * (0.35 + 0.65 * (1.0 - uNight)), clamp(foam * 0.85 + wash, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`,
  });
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, defines: LOD ? {} : { LITE: 1 },
    uniforms: {
      uHor: { value: TOD.hor }, uZen: { value: TOD.zen }, uSunDir: { value: TOD.sunDir }, uSunCol: { value: TOD.sunCol }, uGlow: { value: TOD.glow }, uMoon: { value: TOD.moonDir },
      uNight: UN.uNight, uTime: UN.uTime, uStar: { value: 0 }, uSunUp: { value: 0 }, uFogC: { value: TOD.fog }, uOpp: { value: TOD.opp },
    },
    vertexShader: 'varying vec3 vD; void main() { vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `
varying vec3 vD; uniform vec3 uHor; uniform vec3 uZen; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uGlow; uniform vec3 uMoon; uniform float uNight; uniform float uTime; uniform float uStar; uniform float uSunUp; uniform vec3 uFogC; uniform vec3 uOpp;
${GLSL_COMMON}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vD);
  float h = d.y;
  float west = 0.5 + 0.5 * dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4));
  vec3 horC = mix(uOpp, uHor, west);
  vec3 col = mix(horC, uZen, pow(clamp(h, 0.0, 1.0), 0.42));
  if (h < 0.0) col = mix(horC, uFogC * 0.8, clamp(-h * 6.0, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (exp(-h * h * 38.0) * (0.25 + 0.75 * west) * 1.1);
  col += uSunCol * (pow(sd, 6.0) * 0.42 + pow(sd, 48.0) * 0.8);
  float disc = smoothstep(0.99935, 0.9997, sd);
  col = mix(col, uSunCol * 6.0, disc * uSunUp);
#ifndef LITE
  // clouds lit from below by the low sun
  vec2 cp = d.xz / (h + 0.28) * 1.6 + vec2(uTime * 0.004, 0.0);
  float cl = smoothstep(0.5, 0.8, fbm(cp)) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.55, 0.95, h));
  vec3 cc = mix(uHor * 0.5 + uZen * 0.3, uSunCol * 1.2 + uGlow * 0.6, pow(sd, 1.5) * 0.8 + 0.2 * west);
  col = mix(col, cc, cl * (0.55 - 0.3 * uNight));
  // stars and moon
  float st = 0.0;
  if (uStar > 0.01 && h > 0.0) {
    vec3 q = d * 90.0; vec3 id = floor(q);
    float r = h21(id.xy + id.z * 7.7);
    vec3 f = fract(q) - 0.5;
    st = step(0.985, r) * smoothstep(0.35, 0.0, length(f)) * (0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0));
  }
  col += vec3(0.85, 0.9, 1.0) * st * uStar * smoothstep(0.0, 0.2, h);
  float md = max(dot(d, uMoon), 0.0);
  col += vec3(0.8, 0.88, 1.0) * (smoothstep(0.9993, 0.9997, md) * 1.6 + pow(md, 80.0) * 0.12) * uNight;
  // far ridge line on the land side
  float az = atan(d.z, d.x);
  float ridge = 0.012 + 0.03 * fbm(vec2(az * 5.0, 3.0)) + 0.01 * fbm(vec2(az * 17.0, 9.0));
  float land = smoothstep(-0.2, 0.4, d.x) + smoothstep(0.6, 0.0, abs(d.z)) * 0.0;
  float rd = smoothstep(ridge, ridge - 0.004, h) * smoothstep(-0.02, 0.0, h) * land;
  col = mix(col, mix(uFogC, uZen, 0.28) * 0.62, rd);
#else
  float md = max(dot(d, uMoon), 0.0);
  col += vec3(0.8, 0.88, 1.0) * smoothstep(0.9993, 0.9997, md) * 1.6 * uNight;
#endif
  gl_FragColor = vec4(col, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
  });
}

/* ================================================================ 3D scene: renderer, lights, sky, sea, chunks */
const GL = {
  renderer: null, scene: null, camera: null, fail: '', lost: false, q: 2, qMul: 1, fpsT: 0, fpsN: 0, fps: 60, lowRuns: 0, pinned: false, shadowSize: 2048,
  buildMs: 0, buildN: 0, hemi: null, key: null, spot: null, spotT: null, sky: null, sea: null, shore: null, far: null, chunks: new Map(), buildQ: [], clock: 0,
  frustum: new THREE.Frustum(), pv: new THREE.Matrix4(), env: null, w: 1, h: 1, lastFov: 0, cityMat: null, vehMat: null,
};
const CAM = { yaw: 0, x: 0, y: 60, z: 0, lx: 0, ly: 10, lz: 0, cdist: 110, fov: 58, sx: 0, sy: 0, ground: { x: 0, y: 0 } };

function newDyn(geo, n) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * geo), geo); a.setUsage(THREE.DynamicDrawUsage); return a; }

/* ---- vehicle models (side profiles extruded, wheels separate so they steer and spin) */
const VD = (k) => [k, 0, 0, 0];
const PAINT = [1, 1, 1], GLASS = [0.016, 0.026, 0.04], TRIM = [0.028, 0.03, 0.034], HEADC = [1.0, 0.92, 0.72], TAILC = [1.0, 0.035, 0.015];
function extG(g, pts, depth, bev, c, d) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) sh.lineTo(pts[i], pts[i + 1]);
  const dd = Math.max(0.1, depth - 2 * bev);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: dd, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: LOD ? 2 : 1, curveSegments: 1, steps: 1 });
  geo.translate(0, 0, -dd / 2);
  const p = geo.attributes.position, n = geo.attributes.normal, base = g.n;
  for (let i = 0; i < p.count; i++) g.v(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), c, 0, 0, d);
  const idx = geo.index;
  if (idx) for (let i = 0; i < idx.count; i++) g.I.push(base + idx.getX(i)); else for (let i = 0; i < p.count; i++) g.I.push(base + i);
  geo.dispose();
}
function sx(pts, f) { return pts.map((v, i) => (i % 2 ? v : v * f)); }
function lampSet(g, xf, xb, zh, hy, hw, tz, ty, th, tw) {
  for (const s of [-1, 1]) {
    boxG(g, xf - 0.5, hy, s * zh - hw / 2, xf + 0.9, hy + 2.3, s * zh + hw / 2, HEADC, VD(2));
    boxG(g, xb - 0.9, ty, s * tz - tw / 2, xb + 0.5, ty + th, s * tz + tw / 2, TAILC, VD(3));
  }
}
function modelSedan(police) {
  const g = new GB(), f = police ? 1.09 : 1, bw = police ? 21 : 20;
  extG(g, sx([-22, 4.2, -22, 9.6, -20.6, 11.4, -8, 12.2, 6, 12.4, 16, 11.4, 21, 9.8, 22.4, 7.6, 22.4, 4.2], f), bw, 1.3, PAINT, VD(0));
  extG(g, sx([-12.8, 11.8, -9.6, 18.9, 4.6, 18.9, 11.2, 11.8], f), bw - 2.6, 0.8, GLASS, VD(1));
  boxG(g, -10.2 * f, 18.8, -(bw - 3.4) / 2, 4.6 * f, 19.9, (bw - 3.4) / 2, PAINT, VD(0));
  for (const s of [-1, 1]) {
    boxG(g, -2.4 * f, 12, s * (bw / 2 - 1.6) - 0.5, -0.9 * f, 18.9, s * (bw / 2 - 1.6) + 0.5, PAINT, VD(0));
    boxG(g, 5.8 * f, 12.4, s * (bw / 2 + 0.7) - 0.8, 7.4 * f, 14, s * (bw / 2 + 0.7) + 0.8, PAINT, VD(0));
    boxG(g, -19.5 * f, 3.4, s * (bw / 2 - 0.2) - 0.1, 19.5 * f, 5.2, s * (bw / 2 - 0.2) + 0.1, TRIM, VD(4));
  }
  boxG(g, -19.5 * f, 3.4, -bw / 2 + 0.3, 19.5 * f, 5.2, bw / 2 - 0.3, TRIM, VD(4));
  boxG(g, 21.5 * f, 4.4, -bw / 2 + 1.2, 22.9 * f, 6.6, bw / 2 - 1.2, TRIM, VD(4));
  boxG(g, -22.9 * f, 4.4, -bw / 2 + 1.2, -21.5 * f, 6.6, bw / 2 - 1.2, TRIM, VD(4));
  boxG(g, 22.0 * f, 7.0, -4.5, 22.9 * f, 9.4, 4.5, TRIM, VD(4));
  boxG(g, -23.0 * f, 5.6, -3, -22.3 * f, 7.4, 3, [0.8, 0.8, 0.78], VD(5));
  lampSet(g, 21.6 * f, -22.9 * f, bw / 2 - 4.4, 8.0, 3.8, bw / 2 - 4.6, 8.0, 2.2, 5.6);
  if (police) {
    for (const s of [-1, 1]) boxG(g, -17 * f, 7.3, s * (bw / 2) - (s > 0 ? 0 : 0.2), 17 * f, 9.0, s * (bw / 2) + (s > 0 ? 0.2 : 0), [0.05, 0.16, 0.5], VD(5));
    boxG(g, -3.6, 19.9, -6, 0.9, 21.2, 6, TRIM, VD(4));
  }
  const wr = police ? 5.2 : 5.0;
  return { g, wheels: [[13.8 * f, 9.4, 1, wr, 3.4], [13.8 * f, -9.4, 1, wr, 3.4], [-13.2 * f, 9.4, 0, wr, 3.4], [-13.2 * f, -9.4, 0, wr, 3.4]], bars: police };
}
function modelCoupe() {
  const g = new GB(), bw = 19;
  extG(g, [-24, 3.8, -24, 8.4, -22.4, 10.0, -10, 10.6, 8, 10.6, 19, 9.6, 24.4, 7.0, 24.4, 3.8], bw, 1.3, PAINT, VD(0));
  extG(g, [-8.5, 10.2, -3.6, 16.3, 4.0, 16.3, 12.5, 10.4], bw - 3.4, 0.8, GLASS, VD(1));
  boxG(g, -3.8, 16.2, -6.8, 4.0, 17.1, 6.8, PAINT, VD(0));
  boxG(g, -24.4, 11.0, -8.6, -21, 12.0, 8.6, PAINT, VD(0));
  for (const s of [-1, 1]) {
    boxG(g, -23.4, 9.6, s * 6 - 0.5, -22.4, 11.0, s * 6 + 0.5, TRIM, VD(4));
    boxG(g, -21.5, 3.2, s * (bw / 2 - 0.2) - 0.1, 21.5, 4.9, s * (bw / 2 - 0.2) + 0.1, TRIM, VD(4));
    boxG(g, 6.5, 11, s * (bw / 2 + 0.6) - 0.7, 8.1, 12.5, s * (bw / 2 + 0.6) + 0.7, PAINT, VD(0));
    boxG(g, -9, 10.6, s * 2.5 - 0.5, 14, 10.78, s * 2.5 + 0.5, [0.92, 0.92, 0.9], VD(5));
  }
  boxG(g, 23.8, 4.1, -bw / 2 + 1, 25.0, 6.2, bw / 2 - 1, TRIM, VD(4));
  boxG(g, -25.0, 4.1, -bw / 2 + 1, -23.8, 6.2, bw / 2 - 1, TRIM, VD(4));
  lampSet(g, 23.8, -24.8, bw / 2 - 4.2, 7.2, 4.8, bw / 2 - 4.4, 7.4, 1.8, 6.4);
  return { g, wheels: [[15.2, 9.2, 1, 5.1, 4.2], [15.2, -9.2, 1, 5.1, 4.2], [-14.6, 9.2, 0, 5.2, 4.4], [-14.6, -9.2, 0, 5.2, 4.4]] };
}
function modelAuto() {
  const g = new GB(), black = [0.03, 0.03, 0.035];
  extG(g, [-14, 4.8, -14, 12.4, -11, 13.4, 3, 13.4, 3, 4.8], 17.6, 1.2, PAINT, VD(0));
  extG(g, [3, 5.2, 3, 13.0, 8, 12.6, 12.8, 9.4, 14, 6.8, 14, 5.2], 8.6, 1.1, PAINT, VD(0));
  boxG(g, -14.4, 22.4, -9.8, 6.4, 23.8, 9.8, black, VD(5));
  for (const [px, pz] of [[-13.6, -9], [-13.6, 8.2], [4.6, -9], [4.6, 8.2]]) boxG(g, px, 13.4, pz, px + 0.8, 22.6, pz + 0.8, black, VD(5));
  g.qh([5.4, 13.6, -8, 5.4, 13.6, 8, 7.6, 22.6, 8, 7.6, 22.6, -8], [1, 0.3, 0], GLASS, null, VD(1));
  boxG(g, -12.5, 13.4, -8, -3.5, 16, 8, [0.1, 0.1, 0.1], VD(5));
  boxG(g, -12.5, 16, -8, -11.5, 22.2, 8, [0.08, 0.08, 0.08], VD(5));
  boxG(g, 8.8, 13.4, -0.5, 9.6, 17.5, 0.5, TRIM, VD(4));
  boxG(g, 8.4, 17, -5.5, 9.4, 18, 5.5, TRIM, VD(4));
  boxG(g, 13.4, 9.2, -1.7, 14.9, 12, 1.7, HEADC, VD(2));
  for (const s of [-1, 1]) boxG(g, -14.9, 9, s * 6.8 - 1.3, -13.8, 11.5, s * 6.8 + 1.3, TAILC, VD(3));
  boxG(g, -14.9, 5.2, -7, -13.8, 7, 7, TRIM, VD(4));
  return { g, wheels: [[12.6, 0, 1, 4.6, 2.6], [-8.0, 8.6, 0, 4.8, 3], [-8.0, -8.6, 0, 4.8, 3]] };
}
function modelVan() {
  const g = new GB(), bw = 25.4;
  extG(g, [-29, 4.4, -29, 25, -27.5, 26.6, 6, 26.6, 10.5, 24.8, 15, 17.5, 27, 14.2, 29.2, 11.5, 29.2, 4.4], bw, 1.5, PAINT, VD(0));
  g.qh([11.0, 23.7, -10.4, 11.0, 23.7, 10.4, 14.5, 18.2, 10.4, 14.5, 18.2, -10.4], [0.85, 0.53, 0], GLASS, null, VD(1));
  for (const s of [-1, 1]) {
    boxG(g, 8.0, 18.8, s * 12.75 - 0.25, 12.6, 23.2, s * 12.75 + 0.25, GLASS, VD(1));
    boxG(g, -27, 11, s * 12.7 - 0.12, 5, 15, s * 12.7 + 0.12, [0.9, 0.42, 0.06], VD(5));
    boxG(g, -25, 12.2, s * 12.72 - 0.12, 3, 13.2, s * 12.72 + 0.12, [0.9, 0.9, 0.88], VD(5));
    boxG(g, 9, 19, s * 14.1 - 0.9, 10.6, 22, s * 14.1 + 0.9, TRIM, VD(4));
  }
  boxG(g, -29.2, 6, -0.18, -28.9, 25, 0.18, TRIM, VD(4));
  boxG(g, 28.6, 4.4, -11.8, 30.2, 7.4, 11.8, TRIM, VD(4)); boxG(g, -30.2, 4.4, -11.8, -28.6, 7.4, 11.8, TRIM, VD(4));
  for (const s of [-1, 1]) { boxG(g, 28.6, 9.2, s * 8.6 - 2.2, 30.2, 12, s * 8.6 + 2.2, HEADC, VD(2)); boxG(g, -30.2, 9.5, s * 10.6 - 1.4, -28.7, 15.5, s * 10.6 + 1.4, TAILC, VD(3)); }
  return { g, wheels: [[19.5, 11.6, 1, 6, 4.4], [19.5, -11.6, 1, 6, 4.4], [-19, 11.6, 0, 6, 4.4], [-19, -11.6, 0, 6, 4.4]] };
}
function modelBike() {
  const g = new GB();
  boxG(g, -5, 3.4, -3.4, 5, 5.2, 3.4, PAINT, VD(0));
  extG(g, [-12, 5.2, -12, 9.2, -9, 10.6, -3, 11.0, -1, 10.4, 0, 5.2], 7, 1.0, PAINT, VD(0));
  extG(g, [5, 5.2, 5.5, 16, 7.2, 16.5, 8, 15.5, 7.4, 5.2], 7.4, 1.0, PAINT, VD(0));
  boxG(g, 7.6, 12.6, -2, 8.9, 15, 2, HEADC, VD(2));
  boxG(g, 6.0, 16.2, -7, 7.6, 17.2, 7, TRIM, VD(4));
  boxG(g, -9.5, 10.8, -3, 0.5, 12.4, 3, TRIM, VD(4));
  boxG(g, -12.9, 8, -2.2, -11.8, 9.6, 2.2, TAILC, VD(3));
  boxG(g, 7.4, 4.4, -0.5, 8.2, 16.5, 0.5, TRIM, VD(4));
  boxG(g, -10, 3.6, 3.4, -3, 4.8, 4.6, [0.5, 0.52, 0.55], VD(5));
  return { g, wheels: [[8.6, 0, 1, 4.3, 2.4], [-8.4, 0, 0, 4.3, 2.4]], rider: true };
}
function modelRider() {
  const g = new GB(), shirt = lin('#2f5fa8'), jeans = lin('#1d2a4a'), skin = lin('#d5a77a');
  boxG(g, -4.6, 12.4, -3.3, 0.8, 23.4, 3.3, shirt);
  for (const s of [-1, 1]) {
    boxG(g, -3, 12.2, s * 2.9 - 1.5, 3.6, 15.4, s * 2.9 + 1.5, jeans);
    boxG(g, 3, 7, s * 2.9 - 1.4, 5.4, 15.4, s * 2.9 + 1.4, jeans);
    boxG(g, -1.5, 17.5, s * 4.6 - 1.2, 6.5, 21, s * 4.6 + 1.2, skin);
  }
  blobG(g, -1.8, 26.4, 0, 3.4, 3.6, 3.4, 8, 3, lin('#f4efe2'), lin('#ffffff'));
  boxG(g, 0.6, 25, -3.1, 1.6, 27, 3.1, [0.04, 0.05, 0.08]);
  return g;
}
function wheelG(r, w) {
  const g = new GB(), seg = LOD ? 12 : 8, tire = [0.025, 0.026, 0.03], hub = [0.5, 0.52, 0.56], spoke = [0.16, 0.16, 0.18];
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), hw = w / 2;
    g.q([c1 * r, s1 * r, -hw, c0 * r, s0 * r, -hw, c0 * r, s0 * r, hw, c1 * r, s1 * r, hw], (c0 + c1) / 2, (s0 + s1) / 2, 0, tire, null, VD(4));
    for (const z of [-hw, hw]) {
      const nz = z < 0 ? -1 : 1, ri = r * 0.62, j0 = g.n;
      g.v(c0 * r, s0 * r, z, 0, 0, nz, tire, 0, 0, VD(4)); g.v(c1 * r, s1 * r, z, 0, 0, nz, tire, 0, 0, VD(4)); g.v(c1 * ri, s1 * ri, z, 0, 0, nz, tire, 0, 0, VD(4)); g.v(c0 * ri, s0 * ri, z, 0, 0, nz, tire, 0, 0, VD(4));
      if (nz > 0) { g.t(j0, j0 + 1, j0 + 2); g.t(j0, j0 + 2, j0 + 3); } else { g.t(j0, j0 + 2, j0 + 1); g.t(j0, j0 + 3, j0 + 2); }
      const k0 = g.n;
      g.v(0, 0, z + nz * 0.05, 0, 0, nz, hub, 0, 0, VD(5)); g.v(c0 * ri, s0 * ri, z + nz * 0.05, 0, 0, nz, hub, 0, 0, VD(5)); g.v(c1 * ri, s1 * ri, z + nz * 0.05, 0, 0, nz, hub, 0, 0, VD(5));
      if (nz > 0) g.t(k0, k0 + 1, k0 + 2); else g.t(k0, k0 + 2, k0 + 1);
    }
  }
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * TAU, ca = Math.cos(a), sa = Math.sin(a), L = r * 0.56, hwid = Math.max(0.32, r * 0.07);
    for (const z of [-w / 2 - 0.12, w / 2 + 0.12]) {
      const nz = z < 0 ? -1 : 1;
      g.qh([-sa * hwid, ca * hwid, z, sa * hwid, -ca * hwid, z, ca * L + sa * hwid, sa * L - ca * hwid, z, ca * L - sa * hwid, sa * L + ca * hwid, z], [0, 0, nz], spoke, null, VD(5));
    }
  }
  return g;
}
function vehGeo(g, cap, lampCap) {
  const geo = new THREE.BufferGeometry(), n = g.n, vk = new Float32Array(n);
  for (let i = 0; i < n; i++) vk[i] = g.D[i * 4];
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.P), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.N), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.C), 3));
  geo.setAttribute('vk', new THREE.BufferAttribute(vk, 1));
  geo.setIndex(new THREE.BufferAttribute(g.n > 65535 ? new Uint32Array(g.I) : new Uint16Array(g.I), 1));
  if (cap) { geo.setAttribute('iCol', newDyn(3, cap)); geo.setAttribute('iLamp', newDyn(2, cap)); }
  return geo;
}

const VCAP = 90;
const VM = {};
const PEDS = {};
const FX = {};

function buildDynamics(scene) {
  const vmat = GL.vehMat = vehicleMaterial();
  const wmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
  const defs = { hatch: modelSedan(false), police: modelSedan(true), coupe: modelCoupe(), auto: modelAuto(), van: modelVan(), bike: modelBike() };
  for (const type of Object.keys(defs)) {
    const d = defs[type], geo = vehGeo(d.g, VCAP);
    const body = new THREE.InstancedMesh(geo, vmat, VCAP); body.frustumCulled = false; body.castShadow = true; body.count = 0;
    const wg = wheelG(d.wheels[0][3], d.wheels[0][4]);
    const wheels = new THREE.InstancedMesh(vehGeo(wg, 0), wmat, VCAP * d.wheels.length);
    wheels.frustumCulled = false; wheels.castShadow = true; wheels.count = 0;
    scene.add(body, wheels);
    VM[type] = { type, body, wheels, defs: d.wheels, n: 0, nw: 0, bars: !!d.bars, geo };
  }
  // police light bars and scooter riders
  const barGeo = new THREE.BoxGeometry(3.2, 1.5, 4.8);
  FX.bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), VCAP * 2);
  FX.bars.frustumCulled = false; FX.bars.count = 0; FX.bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(VCAP * 6), 3); scene.add(FX.bars);
  FX.rider = new THREE.InstancedMesh(vehGeo(modelRider(), 0), wmat, VCAP); FX.rider.frustumCulled = false; FX.rider.castShadow = true; FX.rider.count = 0; scene.add(FX.rider);

  // pedestrians: five instanced parts
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const part = (build, n) => { const g = new GB(); build(g); const geo = g.geometry(); const m = new THREE.InstancedMesh(geo, pm, n); m.frustumCulled = false; m.castShadow = true; m.count = 0; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); scene.add(m); return m; };
  const wh = [1, 1, 1];
  PEDS.legs = part((g) => { boxG(g, -1.1, -8.3, -1.0, 1.1, 0, 1.0, wh); boxG(g, -1.2, -8.9, -1.0, 1.8, -8.3, 1.0, [0.07, 0.065, 0.06]); }, 160);
  PEDS.torso = part((g) => { boxG(g, -1.7, 8.2, -2.7, 1.7, 15, 2.7, wh); }, 90);
  PEDS.arms = part((g) => { boxG(g, -0.8, -6.6, -0.8, 0.8, 0.6, 0.8, wh); }, 160);
  PEDS.head = part((g) => { blobG(g, 0, 16.9, 0, 1.9, 2.1, 1.8, LOD ? 7 : 5, LOD ? 3 : 2, wh, wh); }, 90);
  PEDS.hair = part((g) => { blobG(g, -0.25, 17.4, 0, 2.05, 1.9, 1.95, LOD ? 7 : 5, 2, wh, wh, D0, { half: true }); }, 90);
  PEDS.bag = part((g) => { boxG(g, -0.6, 8.6, 2.4, 1.4, 12.2, 5.4, wh); }, 90);

  // textures for light pools, cones, rings and beams
  const radialTex = (size, stops) => { const cv = newCv(size, size), c = cv.getContext('2d'), gr = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); stops.forEach((s) => gr.addColorStop(s[0], s[1])); c.fillStyle = gr; c.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  FX.texPool = radialTex(128, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.55)'], [0.7, 'rgba(255,255,255,.14)'], [1, 'rgba(255,255,255,0)']]);
  const cone = newCv(256, 128), cc = cone.getContext('2d');
  for (let k = 0; k < 4; k++) {
    const hh = 16 + k * 14, gr = cc.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(0.35, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cc.fillStyle = gr; cc.beginPath(); cc.moveTo(0, 64); cc.lineTo(256, 64 - hh); cc.lineTo(256, 64 + hh); cc.closePath(); cc.fill();
  }
  FX.texCone = new THREE.CanvasTexture(cone); FX.texCone.colorSpace = THREE.SRGBColorSpace;
  const bm = newCv(8, 128), bc = bm.getContext('2d'), bg = bc.createLinearGradient(0, 128, 0, 0);
  bg.addColorStop(0, 'rgba(255,255,255,.85)'); bg.addColorStop(0.6, 'rgba(255,255,255,.25)'); bg.addColorStop(1, 'rgba(255,255,255,0)');
  bc.fillStyle = bg; bc.fillRect(0, 0, 8, 128); FX.texBeam = new THREE.CanvasTexture(bm); FX.texBeam.colorSpace = THREE.SRGBColorSpace;

  const addMat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-PI / 2);
  const coneG = new THREE.PlaneGeometry(1, 1); coneG.rotateX(-PI / 2); coneG.translate(0.5, 0, 0);
  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; m.renderOrder = 3; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); scene.add(m); return m; };
  FX.pools = inst(flat, addMat(FX.texPool), 220);
  FX.cones = inst(coneG, addMat(FX.texCone), 90);
  const ringG = new THREE.RingGeometry(0.84, 1, 40); ringG.rotateX(-PI / 2);
  FX.rings = inst(ringG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), 48);
  const beamG = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true); beamG.translate(0, 0.5, 0);
  FX.beams = inst(beamG, addMat(FX.texBeam), 40);
  const billG = new THREE.BoxGeometry(8, 1.1, 14);
  FX.bills = new THREE.InstancedMesh(billG, new THREE.MeshBasicMaterial({ color: 0x7dff9b, toneMapped: false }), 16); FX.bills.frustumCulled = false; FX.bills.count = 0; scene.add(FX.bills);

  // soft points: smoke and dust (alpha), sparks, fire and every glowing light (additive)
  const pointMat = (add) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 600 } },
    vertexShader: 'attribute float aSize; attribute vec4 aCol; varying vec4 vC; uniform float uScale; void main() { vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(1.0, -mv.z); gl_PointSize = min(220.0, aSize * uScale / d); vC.a *= 1.0 - smoothstep(900.0, 1500.0, d); }',
    fragmentShader: 'varying vec4 vC; void main() { vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; if (r > 1.0) discard; float a = 1.0 - r; a *= a; gl_FragColor = vec4(vC.rgb, vC.a * a); }',
  });
  const mkPoints = (add, max) => {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3), col = new THREE.BufferAttribute(new Float32Array(max * 4), 4), sz = new THREE.BufferAttribute(new Float32Array(max), 1);
    pos.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage); sz.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos); geo.setAttribute('aCol', col); geo.setAttribute('aSize', sz); geo.setDrawRange(0, 0);
    const o = new THREE.Points(geo, pointMat(add)); o.frustumCulled = false; o.renderOrder = add ? 5 : 4; scene.add(o);
    return { o, geo, pos, col, sz, n: 0, max, add(x, y, z, r, g, b, a, s) { if (this.n >= this.max) return; const i = this.n++; pos.array[i * 3] = x; pos.array[i * 3 + 1] = y; pos.array[i * 3 + 2] = z; col.array[i * 4] = r; col.array[i * 4 + 1] = g; col.array[i * 4 + 2] = b; col.array[i * 4 + 3] = a; sz.array[i] = s; }, flush() { pos.needsUpdate = col.needsUpdate = sz.needsUpdate = true; geo.setDrawRange(0, this.n); this.n = 0; } };
  };
  FX.soft = mkPoints(false, 520); FX.glow = mkPoints(true, 900);

  // skid marks: a ribbon of quads redrawn when new ones land
  const SKM = SKN * 4;
  const sg = new THREE.BufferGeometry(), sp = new THREE.BufferAttribute(new Float32Array(SKM * 3), 3), sc = new THREE.BufferAttribute(new Float32Array(SKM * 4), 4);
  sp.setUsage(THREE.DynamicDrawUsage); sc.setUsage(THREE.DynamicDrawUsage);
  sg.setAttribute('position', sp); sg.setAttribute('color', sc);
  const si = new Uint16Array(SKN * 6); for (let i = 0; i < SKN; i++) { si.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
  sg.setIndex(new THREE.BufferAttribute(si, 1)); sg.setDrawRange(0, 0);
  FX.skid = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }));
  FX.skid.frustumCulled = false; FX.skid.renderOrder = 2; FX.skidSeen = -1; FX.skidT = 0; scene.add(FX.skid);
  FX.mats = { m1: new THREE.Matrix4(), m2: new THREE.Matrix4(), m3: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s1: new THREE.Vector3(1, 1, 1), col: new THREE.Color(), d: new THREE.Object3D(), v1: new THREE.Vector3(), v2: new THREE.Vector3() };
}

/* ---- time of day */
function computeTOD(h) {
  const T = TOD, s = Math.sin(PI * (h - 6) / 12);
  T.s = s;
  const day = sm(0.05, 0.4, s), nightW = sm(0.0, -0.3, s);
  const dusk = clamp((1 - day - nightW) * 1.55, 0, 1);
  const sum = day + nightW + dusk + 1e-6, wd = day / sum, wn = nightW / sum, wu = dusk / sum;
  const mix3 = (a, b, c) => [a[0] * wd + b[0] * wu + c[0] * wn, a[1] * wd + b[1] * wu + c[1] * wn, a[2] * wd + b[2] * wu + c[2] * wn];
  const hor = mix3([0.5, 0.68, 0.9], [1.0, 0.3, 0.07], [0.02, 0.034, 0.08]);
  const opp = mix3([0.46, 0.64, 0.9], [0.5, 0.2, 0.3], [0.02, 0.034, 0.085]);
  const zen = mix3([0.06, 0.22, 0.62], [0.05, 0.065, 0.27], [0.004, 0.008, 0.03]);
  const glow = mix3([0.08, 0.07, 0.04], [0.95, 0.3, 0.05], [0, 0, 0]);
  const sunC = mix3([1.0, 0.92, 0.78], [1.0, 0.42, 0.12], [0.2, 0.25, 0.4]);
  T.hor.setRGB(hor[0], hor[1], hor[2]); T.opp.setRGB(opp[0], opp[1], opp[2]); T.zen.setRGB(zen[0], zen[1], zen[2]); T.glow.setRGB(glow[0], glow[1], glow[2]); T.sunCol.setRGB(sunC[0], sunC[1], sunC[2]);
  T.fog.setRGB((hor[0] + opp[0]) * 0.5 * 0.9, (hor[1] + opp[1]) * 0.5 * 0.9, (hor[2] + opp[2]) * 0.5 * 0.95);
  const el = Math.asin(clamp(s, -1, 1)) + 0.07;
  T.sunElev = el;
  T.sunDir.set(-0.93 * Math.cos(el), Math.sin(el), 0.37 * Math.cos(el)).normalize();
  const elK = Math.max(el, 0.46), kd = T._kd.set(-0.93 * Math.cos(elK), Math.sin(elK), 0.37 * Math.cos(elK)).normalize();
  const moon = T.moonDir;
  T.keyDir.copy(kd).lerp(moon, clamp(wn * 1.4, 0, 1)).normalize();
  const keyC = mix3([1.0, 0.94, 0.82], [1.0, 0.5, 0.2], [0.45, 0.58, 1.0]);
  T.keyI = (wd * 2.7 + wu * 1.7 + wn * 0.75) * clamp(0.3 + sm(-0.12, 0.08, s), 0, 1);
  T.keyCol = keyC;
  T.hemiI = wd * 0.9 + wu * 0.5 + wn * 0.5;
  T.hemiSky = mix3([0.55, 0.72, 1.0], [0.6, 0.38, 0.55], [0.2, 0.27, 0.62]);
  T.hemiGnd = mix3([0.4, 0.34, 0.28], [0.3, 0.2, 0.16], [0.07, 0.08, 0.13]);
  T.envI = wd * 0.8 + wu * 0.45 + wn * 0.18;
  T.expo = wd * 0.9 + wu * 0.9 + wn * 1.2;
  T.night = nightW; T.day = day; T.dusk = dusk;
  T.win = sm(0.1, -0.12, s); T.lamp = sm(0.07, -0.14, s);
  T.starA = sm(-0.12, -0.34, s);
}

function applyTOD(h) {
  computeTOD(h);
  const T = TOD, sc = GL.scene;
  UN.uNight.value = T.night; UN.uWin.value = T.win;
  GL.hemi.color.setRGB(T.hemiSky[0], T.hemiSky[1], T.hemiSky[2]); GL.hemi.groundColor.setRGB(T.hemiGnd[0], T.hemiGnd[1], T.hemiGnd[2]); GL.hemi.intensity = T.hemiI;
  GL.key.color.setRGB(T.keyCol[0], T.keyCol[1], T.keyCol[2]); GL.key.intensity = T.keyI;
  sc.fog.color.copy(T.fog);
  GL.renderer.toneMappingExposure = T.expo;
  sc.environmentIntensity = T.envI;
  GL.sky.material.uniforms.uStar.value = T.starA;
  GL.sky.material.uniforms.uSunUp.value = sm(-0.06, 0.04, T.s);
}

/* ---- renderer, scene and the one-off pieces */
// A software rasteriser (a CI browser, a phone with no GPU access) gets the lighter world from the start.
function softwareGL() {
  try {
    const cv = document.createElement('canvas'), g = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!g) return false;
    const e = g.getExtension('WEBGL_debug_renderer_info'), name = e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (err) { return false; }
}
function initGL(arc) {
  let renderer;
  GL.soft = softwareGL();
  LOD = GL.soft ? 0 : 1;
  const m = /[?&]lod=(\d)/.exec(location.search); if (m) { LOD = +m[1]; if (LOD) GL.soft = false; }
  if (GL.soft) GL.q = 0;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: !GL.soft, powerPreference: 'high-performance' });
  } catch (e) { GL.fail = 'This game needs WebGL, which this browser did not give it.'; return; }
  GL.renderer = renderer;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); GL.lost = true; });
  arc.canvas.addEventListener('webglcontextrestored', () => { GL.lost = false; GL.shadowDirty = true; });
  const scene = GL.scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x331a20, 240, 1350);
  const cam = GL.camera = new THREE.PerspectiveCamera(58, 1, 3, 9000);
  GL.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); scene.add(GL.hemi);
  const key = GL.key = new THREE.DirectionalLight(0xffffff, 2);
  key.castShadow = true;
  const sc = key.shadow.camera; sc.left = -300; sc.right = 300; sc.top = 300; sc.bottom = -300; sc.near = 20; sc.far = 1600;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.8;
  scene.add(key, key.target);
  // headlights of the car you drive: one spot you can see on the road and walls ahead
  const spot = GL.spot = new THREE.SpotLight(0xfff0cf, 0, 700, 0.62, 0.55, 1.2); spot.castShadow = false; scene.add(spot, spot.target);
  GL.cityMat = cityMaterial();
  const sky = GL.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), skyMaterial()); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const sea = GL.sea = new THREE.Mesh(buildSeaGeo(), seaMaterial()); sea.frustumCulled = false; scene.add(sea);
  const shore = buildShore();
  const sh = GL.shore = new THREE.Mesh(shore.shore, GL.cityMat); sh.receiveShadow = true; scene.add(sh);
  const far = GL.far = new THREE.Mesh(shore.far, GL.cityMat); far.receiveShadow = true; scene.add(far);
  buildDynamics(scene);
  // a dusk environment so paint, glass and wet roads have something to reflect
  if (LOD) try {
    const es = new THREE.Scene();
    const em = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vD; void main() { vec3 d = normalize(vD); float h = d.y; vec3 hor = vec3(1.0, 0.36, 0.1), zen = vec3(0.07, 0.1, 0.34); vec3 c = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.45)); if (h < 0.0) c = mix(hor, vec3(0.12, 0.09, 0.09), clamp(-h * 3.0, 0.0, 1.0)); float s = max(dot(d, normalize(vec3(-0.93, 0.05, 0.37))), 0.0); c += vec3(1.0, 0.5, 0.2) * pow(s, 14.0) * 2.0; gl_FragColor = vec4(c, 1.0); }',
    });
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), em));
    const pm = new THREE.PMREMGenerator(renderer);
    GL.env = pm.fromScene(es, 0.02, 1, 200).texture; scene.environment = GL.env; scene.environmentIntensity = 0.7;
    pm.dispose(); em.dispose();
  } catch (e) { /* no environment: the lights still work */ }
  applyTOD(G.hour);
}

function resizeGL(arc) {
  if (!GL.renderer) return;
  GL.w = arc.w; GL.h = arc.h;
  // software rendering pays for every pixel, so it gets a small fixed budget; a GPU gets the full device ratio
  GL.renderer.setPixelRatio(GL.soft ? clamp(Math.sqrt(56000 / (arc.w * arc.h)), 0.2, arc.dpr) : arc.dpr * GL.qMul);
  GL.renderer.setSize(arc.w, arc.h, false);
  GL.camera.aspect = arc.w / arc.h;
  GL.lastFov = 0;
}

function applyQuality() {
  const r = GL.renderer; if (!r) return;
  const q = GL.q;
  GL.qMul = q >= 2 ? 1 : q === 1 ? 0.8 : (GL.soft ? 0.5 : 0.62);
  const size = q >= 2 ? (arcRef && Math.min(arcRef.w, arcRef.h) < 600 ? 1024 : 2048) : q === 1 ? 1024 : 512;
  r.shadowMap.enabled = q > 0;
  const sh = GL.key.shadow;
  if (sh.mapSize.x !== size) { sh.mapSize.set(size, size); if (sh.map) { sh.map.dispose(); sh.map = null; } }
  GL.key.castShadow = q > 0;
  if (arcRef) resizeGL(arcRef);
}

/* ---- chunks: a tile of the city becomes a mesh when the camera gets near it */
function chunkAt(tx, ty, make) {
  const k = ty * TN + tx; let c = GL.chunks.get(k);
  if (!c && make) {
    const r = buildChunkGeo(tx, ty);
    const mesh = new THREE.Mesh(r.geo, GL.cityMat); mesh.castShadow = true; mesh.receiveShadow = true;
    GL.scene.add(mesh);
    c = { k, tx, ty, mesh, lights: r.lights, last: GL.clock };
    GL.chunks.set(k, c);
  }
  return c;
}
function streamChunks(fx, fy, budget) {
  const RV = GL.q >= 2 ? 1480 : GL.q === 1 ? 1250 : (GL.soft ? 760 : 950), RB2 = RV + 280, cx = clamp(Math.floor(fx / TILE), 0, TN - 1), cy = clamp(Math.floor(fy / TILE), 0, TN - 1);
  let built = 0;
  const need = [];
  for (let ty = Math.max(0, cy - 4); ty <= Math.min(TN - 1, cy + 4); ty++) for (let tx = Math.max(0, cx - 4); tx <= Math.min(TN - 1, cx + 4); tx++) {
    const dx = Math.max(0, Math.abs((tx + 0.5) * TILE - fx) - TILE / 2), dy = Math.max(0, Math.abs((ty + 0.5) * TILE - fy) - TILE / 2);
    const d = Math.hypot(dx, dy); if (d > RB2) continue;
    need.push([d, tx, ty]);
  }
  need.sort((a, b) => a[0] - b[0]);
  for (const n of need) {
    const k = n[2] * TN + n[1];
    if (GL.chunks.has(k)) continue;
    if (built < budget) { const t0 = performance.now(); chunkAt(n[1], n[2], true); GL.buildMs += performance.now() - t0; GL.buildN++; built++; }
  }
  for (const [k, c] of GL.chunks) {
    const dx = Math.max(0, Math.abs((c.tx + 0.5) * TILE - fx) - TILE / 2), dy = Math.max(0, Math.abs((c.ty + 0.5) * TILE - fy) - TILE / 2);
    const d = Math.hypot(dx, dy);
    c.mesh.visible = d <= RV;
    if (d > 2600) { GL.scene.remove(c.mesh); c.mesh.geometry.dispose(); GL.chunks.delete(k); }
  }
  return built;
}

/* ================================================================ the camera: behind the car, over the shoulder on foot */
const _sph = new THREE.Sphere();
const COLC = {};
function parseCol(s) {
  let r = COLC[s]; if (r) return r;
  if (s[0] === '#') { const c = hex2rgb(s); r = [c[0] / 255, c[1] / 255, c[2] / 255, 1]; }
  else { const m = s.match(/[\d.]+/g) || [255, 255, 255]; r = [m[0] / 255, m[1] / 255, m[2] / 255, m[3] != null ? +m[3] : 1]; }
  return (COLC[s] = r);
}

function updateCamera(dt, playing) {
  const arc = arcRef, cam = GL.camera; if (!cam) return;
  const veh = playing ? pl.veh : null, red = arc.reducedMotion;
  const portrait = arc.w < arc.h * 0.95;
  let px, py, dist, hgt, ahead, lat = 0, fovT, rate, ly = 12;
  if (!playing) {
    // menu and attract mode: a slow cruise along the sea road, facing along it
    const L = 3300, t = (G.attractT * 62) % (L * 2), dir = t < L ? 1 : -1;
    const yawT = dir > 0 ? -0.1 : PI + 0.1;
    CAM.yaw += wrapA(yawT - CAM.yaw) * (1 - Math.exp(-dt * 0.8));
    px = G.attX; py = G.attY; dist = portrait ? 150 : 120; hgt = 62; ahead = 220; fovT = portrait ? 72 : 56; rate = 1; ly = 26;
  } else if (veh) {
    const sp = vSpeed(veh), k = clamp(sp / veh.T.vmax, 0, 1.1);
    let hd = veh.a;
    if (sp > 70 && veh.f > 0) hd += wrapA(Math.atan2(veh.vy, veh.vx) - veh.a) * clamp(sp / 520, 0, 0.42);
    const yr = red ? 2.2 : (veh.f < -20 ? 1.4 : 4.2);
    CAM.yaw += wrapA(hd - CAM.yaw) * (1 - Math.exp(-dt * yr));
    px = veh.x; py = veh.y;
    dist = (veh.T.L * 2.1 + 40 + k * 50) * (portrait ? 1.12 : 1); hgt = 46 + veh.T.L * 0.3 + k * 22 + (portrait ? 14 : 0);
    ahead = 26 + k * 70; fovT = (portrait ? 70 : 54) + (red ? 0 : k * 9); ly = 10;
  } else {
    const fk = clamp(pl.fwdK || 0, 0, 1);
    if (pl.moving && fk > 0.05) CAM.yaw += wrapA(pl.a - CAM.yaw) * (1 - Math.exp(-dt * (red ? 0.8 : 1.5) * fk));
    px = pl.x; py = pl.y; dist = portrait ? 104 : 88; hgt = portrait ? 56 : 46; ahead = 26; lat = 10; fovT = portrait ? 68 : 54; ly = 10;
  }
  CAM.fov = lerp(CAM.fov, fovT, 1 - Math.exp(-dt * 3));
  const cy = Math.cos(CAM.yaw), sy = Math.sin(CAM.yaw);
  // pull the camera in rather than let it sit inside a wall
  let d = dist;
  const rx = -sy, rz = cy;
  for (let s = 1; s <= 10; s++) {
    const t = s / 10 * dist, qx = px - cy * t + rx * lat * s / 10, qy = py - sy * t + rz * lat * s / 10;
    if (solidAt(qx, qy) || solidAt(qx - cy * 12, qy - sy * 12)) { d = Math.max(veh ? 62 : 52, t - 26); break; }
  }
  CAM.cdist = d < CAM.cdist ? d : lerp(CAM.cdist, d, 1 - Math.exp(-dt * 1.4));
  const dd = Math.min(CAM.cdist, dist);
  const jit = (G.shake > 0.2 && !red) ? G.shake * 0.5 : 0;
  CAM.x = px - cy * dd + rx * lat + (jit ? (rr() - 0.5) * jit : 0);
  CAM.z = py - sy * dd + rz * lat + (jit ? (rr() - 0.5) * jit : 0);
  CAM.y = lerp(CAM.y, hgt * (0.55 + 0.45 * dd / dist) + (jit ? (rr() - 0.5) * jit : 0), 1 - Math.exp(-dt * 5));
  CAM.lx = px + cy * ahead + rx * lat * 0.3; CAM.lz = py + sy * ahead + rz * lat * 0.3; CAM.ly = ly;
  CAM.ground.x = px; CAM.ground.y = py;
  if (CAM.ov) { CAM.x = CAM.ov[0]; CAM.y = CAM.ov[1]; CAM.z = CAM.ov[2]; CAM.lx = CAM.ov[3]; CAM.ly = CAM.ov[4]; CAM.lz = CAM.ov[5]; if (CAM.ov[6]) CAM.fov = CAM.ov[6]; }
  cam.position.set(CAM.x, CAM.y, CAM.z);
  cam.lookAt(CAM.lx, CAM.ly, CAM.lz);
  if (Math.abs(cam.fov - CAM.fov) > 0.05 || GL.lastFov === 0) { cam.fov = CAM.fov; cam.updateProjectionMatrix(); GL.lastFov = CAM.fov; }
  cam.updateMatrixWorld();
  // what the simulation treats as "on screen": a window ahead of the camera
  G.camX = px + cy * 160; G.camY = py + sy * 160; G.vw = 900; G.vh = 900;
  G.shake *= Math.exp(-dt * 9);
}

// A point on the ground under a screen position (0..1 each way).
const _ray = new THREE.Vector3(), _ray2 = new THREE.Vector3();
function groundAt(nx, ny, out) {
  _ray.set(nx * 2 - 1, -(ny * 2 - 1), 0.5).unproject(GL.camera);
  _ray.sub(GL.camera.position).normalize();
  const t = _ray.y < -0.01 ? -GL.camera.position.y / _ray.y : 600;
  out.x = GL.camera.position.x + _ray.x * t; out.y = GL.camera.position.z + _ray.z * t;
  return out;
}
// World point to screen pixels. Returns false when it is behind the camera.
const SCR = { x: 0, y: 0, z: 0 };
function toScreen(x, y, z) {
  _ray2.set(x, y, z).project(GL.camera);
  SCR.x = (_ray2.x * 0.5 + 0.5) * arcRef.w; SCR.y = (-_ray2.y * 0.5 + 0.5) * arcRef.h; SCR.z = _ray2.z;
  return _ray2.z < 1 && _ray2.z > -1;
}

/* ================================================================ sync the sim into the scene every frame */
function setCol(mesh, i, c, k) { const a = mesh.instanceColor.array; k = k == null ? 1 : k; a[i * 3] = c[0] * k; a[i * 3 + 1] = c[1] * k; a[i * 3 + 2] = c[2] * k; }
const WARM = [1.0, 0.66, 0.32];
let nPool = 0, nCone = 0, nRing = 0, nBeam = 0;
function addPool(x, y, z, size, col, k) {
  if (nPool >= 220 || k < 0.01) return;
  const M = FX.mats; M.p.set(x, y, z); M.q.identity(); M.v1.set(size, 1, size); M.m1.compose(M.p, M.q, M.v1); FX.pools.setMatrixAt(nPool, M.m1); setCol(FX.pools, nPool, col, k); nPool++;
}
function addRing(x, z, r, col, k) {
  if (nRing >= 48) return;
  const M = FX.mats; M.p.set(x, 2.8, z); M.q.identity(); M.v1.set(r, 1, r); M.m1.compose(M.p, M.q, M.v1); FX.rings.setMatrixAt(nRing, M.m1); setCol(FX.rings, nRing, col, k); nRing++;
}
function addBeam(x, z, r, h, col, k) {
  if (nBeam >= 40) return;
  const M = FX.mats; M.p.set(x, 0, z); M.q.identity(); M.v1.set(r, h, r); M.m1.compose(M.p, M.q, M.v1); FX.beams.setMatrixAt(nBeam, M.m1); setCol(FX.beams, nBeam, col, k); nBeam++;
}
const SIGC = { g: [0.2, 1, 0.45], y: [1, 0.75, 0.2], r: [1, 0.2, 0.14] };

function syncVehicles(dt) {
  const M = FX.mats, lampK = TOD.lamp, fr = GL.frustum, reduced = arcRef.reducedMotion;
  for (const t in VM) { VM[t].n = 0; VM[t].nw = 0; }
  let nb = 0, nr = 0;
  for (let vi = 0; vi < V.length; vi++) {
    const v = V[vi], vm = VM[v.type]; if (!vm || vm.n >= VCAP) continue;
    const dxc = v.x - CAM.x, dzc = v.y - CAM.z, d2 = dxc * dxc + dzc * dzc;
    v.wd = (v.wd || 0) + v.f * dt;
    if (d2 > 1500 * 1500) continue;
    _sph.center.set(v.x, 10, v.y); _sph.radius = 42;
    if (!fr.intersectsSphere(_sph)) continue;
    const T = v.T, i = vm.n++, on = (v.player || (!v.parked && !v.wreck) || v.siren) && !v.wreck;
    // body motion: nose dips under braking, the body leans out of a corner (a scooter leans into it)
    const accel = (v.f - (v.pf == null ? v.f : v.pf)) / Math.max(dt, 0.004); v.pf = v.f;
    v.pitch = lerp(v.pitch || 0, clamp(accel * 0.00016, -0.045, 0.045), Math.min(1, dt * 8));
    const driven = v.player || !v.parked;
    const lean = v.type === 'bike' ? clamp(v.c.str * v.f * 0.0011, -0.3, 0.3) : clamp(-v.c.str * v.f * 0.00032, -0.07, 0.07);
    v.roll = lerp(v.roll || 0, driven && !v.wreck ? lean : (v.wreck ? 0.09 : 0), Math.min(1, dt * 7));
    M.e.set(v.roll, -v.a, v.wreck ? v.pitch + 0.03 : v.pitch, 'YZX'); M.q.setFromEuler(M.e); M.p.set(v.x, v.wreck ? -0.8 : 0, v.y); M.m1.compose(M.p, M.q, M.s1);
    vm.body.setMatrixAt(i, M.m1);
    const bc = v.type === 'police' ? [0.92, 0.92, 0.94] : lin(v.col), dmg = 1 - v.hp / v.maxhp;
    const k = v.burnt ? 0.1 : 1 - 0.55 * clamp((dmg - 0.3) / 0.7, 0, 1);
    const ic = vm.geo.attributes.iCol.array, il = vm.geo.attributes.iLamp.array;
    ic[i * 3] = bc[0] * k; ic[i * 3 + 1] = bc[1] * k; ic[i * 3 + 2] = bc[2] * k;
    const head = on ? 0.14 + 0.86 * lampK : 0.04, tail = v.wreck ? 0 : (on ? 0.35 + 0.5 * lampK : 0.1) + (v.brakeL ? 1.5 : 0);
    il[i * 2] = head; il[i * 2 + 1] = tail;
    for (let w = 0; w < vm.defs.length; w++) {
      const wd = vm.defs[w], r = wd[3];
      M.e.set(0, wd[2] ? -v.steerVis * 0.55 : 0, -(v.wd / r), 'YZX'); M.q.setFromEuler(M.e); M.p.set(wd[0], r, wd[1]); M.m2.compose(M.p, M.q, M.s1);
      M.m3.multiplyMatrices(M.m1, M.m2); vm.wheels.setMatrixAt(vm.nw++, M.m3);
    }
    if (v.type === 'bike' && (v.driver || v.player) && !v.wreck && nr < VCAP) FX.rider.setMatrixAt(nr++, M.m1);
    const ca = Math.cos(v.a), sa = Math.sin(v.a), near = d2 < 800 * 800;
    if (v.type === 'police' && nb < VCAP * 2 - 1) {
      const ph = v.siren && !reduced ? (Math.floor(GL.clock * 7 + v.id) % 2) : 0, lit = v.siren;
      for (let s = 0; s < 2; s++) {
        M.p.set(-1.0, 21.9, s ? 3.1 : -3.1); M.q.identity(); M.m2.compose(M.p, M.q, M.s1); M.m3.multiplyMatrices(M.m1, M.m2); FX.bars.setMatrixAt(nb, M.m3);
        const redSide = s === 0, bright = lit && (redSide ? ph === 1 : ph === 0);
        const col = redSide ? (bright ? [1, 0.1, 0.06] : [0.16, 0.02, 0.02]) : (bright ? [0.14, 0.4, 1] : [0.02, 0.04, 0.18]);
        setCol(FX.bars, nb, col, 1); nb++;
        if (bright && near) {
          const wx = v.x + ca * -1.0 - sa * (s ? 3.1 : -3.1), wz = v.y + sa * -1.0 + ca * (s ? 3.1 : -3.1);
          FX.glow.add(wx, 24, wz, col[0], col[1], col[2], 0.95, 52);
          addPool(wx, 2.4, wz, 190, col, 0.55 + 0.3 * (TOD.night + TOD.dusk * 0.6));
        }
      }
    }
    if (near) {
      const hx = v.x + ca * T.L * 0.5, hz = v.y + sa * T.L * 0.5, zl = T.Wd * 0.3, bx = v.x - ca * T.L * 0.5, bz = v.y - sa * T.L * 0.5;
      const hh = v.type === 'bike' ? 13 : 9.5;
      if (on && lampK > 0.03) {
        if (nCone < 90 && d2 < 650 * 650) {
          M.p.set(hx, 2.5, hz); M.e.set(0, -v.a, 0); M.q.setFromEuler(M.e); const len = v.type === 'bike' ? 170 : 250; M.v1.set(len, 1, v.type === 'bike' ? 80 : 140);
          M.m2.compose(M.p, M.q, M.v1); FX.cones.setMatrixAt(nCone, M.m2); setCol(FX.cones, nCone, [1.0, 0.9, 0.66], 0.55 * lampK); nCone++;
        }
        if (v.type === 'bike') FX.glow.add(hx, hh, hz, 1, 0.92, 0.7, 0.9 * lampK, 17);
        else { FX.glow.add(hx - sa * zl, hh, hz + ca * zl, 1, 0.92, 0.7, 0.9 * lampK, 17); FX.glow.add(hx + sa * zl, hh, hz - ca * zl, 1, 0.92, 0.7, 0.9 * lampK, 17); }
      }
      if (!v.wreck && (on || v.brakeL)) {
        const a = (on ? 0.55 : 0.2) + (v.brakeL ? 0.45 : 0);
        if (v.type === 'bike') FX.glow.add(bx, 9, bz, 1, 0.08, 0.04, a, v.brakeL ? 15 : 9);
        else { FX.glow.add(bx - sa * zl, 9, bz + ca * zl, 1, 0.08, 0.04, a, v.brakeL ? 16 : 9); FX.glow.add(bx + sa * zl, 9, bz - ca * zl, 1, 0.08, 0.04, a, v.brakeL ? 16 : 9); }
        if (v.brakeL && d2 < 500 * 500) addPool(bx - ca * 18, 2.4, bz - sa * 18, 60, [1, 0.12, 0.06], 0.5);
      }
      if (v.wreck && v.wreckT > 1.4 && !v.burnt) addPool(v.x, 2.4, v.y, 120 + Math.sin(GL.clock * 18) * 10, [1, 0.5, 0.15], 0.9);
    }
    if (v.player && lampK > 0.02) {
      GL.spot.visible = true; GL.spot.intensity = 5200 * lampK;
      GL.spot.position.set(v.x + ca * T.L * 0.4, 9, v.y + sa * T.L * 0.4); GL.spot.target.position.set(v.x + ca * 220, 0, v.y + sa * 220); GL.spot.target.updateMatrixWorld();
    }
  }
  if (!pl.veh || lampK <= 0.02) GL.spot.visible = false;
  for (const t in VM) {
    const vm = VM[t]; vm.body.count = vm.n; vm.wheels.count = vm.nw;
    if (vm.n) { vm.body.instanceMatrix.needsUpdate = true; vm.wheels.instanceMatrix.needsUpdate = true; vm.geo.attributes.iCol.needsUpdate = true; vm.geo.attributes.iLamp.needsUpdate = true; }
  }
  FX.bars.count = nb; if (nb) { FX.bars.instanceMatrix.needsUpdate = true; FX.bars.instanceColor.needsUpdate = true; }
  FX.rider.count = nr; if (nr) FX.rider.instanceMatrix.needsUpdate = true;
}

function syncPeds() {
  const M = FX.mats, d = M.d;
  let n = 0, nl = 0, nb = 0;
  const put2 = (p, isPlayer) => {
    if (n >= 88) return;
    const dx = p.x - CAM.x, dz = p.y - CAM.z; if (dx * dx + dz * dz > 1100 * 1100) return;
    _sph.center.set(p.x, 9, p.y); _sph.radius = 16; if (!GL.frustum.intersectsSphere(_sph)) return;
    const run = p.state === 'flee' || p.state === 'dive' || (isPlayer && pl.sprint);
    const phase = isPlayer ? pl.step : p.anim, moving = isPlayer ? pl.moving : (p.state !== 'walk' || p.pause <= 0);
    const sw = moving ? Math.sin(phase) * (run ? 1.05 : 0.7) : 0, bob = moving ? Math.abs(Math.cos(phase)) * (run ? 0.9 : 0.5) : 0;
    d.position.set(p.x, bob, p.y); d.rotation.set(p.state === 'dive' ? 1.25 : 0, -p.a, 0, 'YXZ'); d.scale.set(1, 1, 1); d.updateMatrix();
    M.m1.copy(d.matrix);
    PEDS.torso.setMatrixAt(n, M.m1); PEDS.head.setMatrixAt(n, M.m1); PEDS.hair.setMatrixAt(n, M.m1);
    const shirt = isPlayer ? lin('#FF6940') : lin(p.shirt), skin = lin(p.skin), hair = lin(p.hair);
    setCol(PEDS.torso, n, shirt, 1); setCol(PEDS.head, n, skin, 1); setCol(PEDS.hair, n, hair, 1);
    const pants = isPlayer ? [0.07, 0.08, 0.12] : (((p.x * 7 + p.y) | 0) % 3 === 0 ? [0.1, 0.12, 0.2] : ((p.shirt.length + (p.y | 0)) % 2 ? [0.18, 0.16, 0.14] : [0.06, 0.06, 0.07]));
    for (let s = 0; s < 2; s++) {
      const sg = s ? -1 : 1;
      d.position.set(0, 8.4, sg * 1.5); d.rotation.set(0, 0, sg * sw, 'XYZ'); d.updateMatrix(); M.m2.multiplyMatrices(M.m1, d.matrix); PEDS.legs.setMatrixAt(nl, M.m2); setCol(PEDS.legs, nl, pants, 1);
      d.position.set(0, 14.3, sg * 3.5); d.rotation.set(0, 0, -sg * sw * 0.9, 'XYZ'); d.updateMatrix(); M.m2.multiplyMatrices(M.m1, d.matrix); PEDS.arms.setMatrixAt(nl, M.m2); setCol(PEDS.arms, nl, skin, 1);
      nl++;
    }
    if (p.bag) { PEDS.bag.setMatrixAt(nb, M.m1); setCol(PEDS.bag, nb, [0.3, 0.2, 0.12], 1); nb++; }
    n++;
  };
  for (let i = 0; i < PD.length; i++) put2(PD[i], false);
  if ((G.phase === 'play' || G.phase === 'over') && !pl.veh && !(pl.inv > 0 && Math.floor(G.time * 14) % 2 === 0)) { pl.sprint = pl.sprint || false; put2(pl, true); }
  PEDS.torso.count = PEDS.head.count = PEDS.hair.count = n; PEDS.legs.count = PEDS.arms.count = nl; PEDS.bag.count = nb;
  for (const k in PEDS) { PEDS[k].instanceMatrix.needsUpdate = true; if (PEDS[k].instanceColor) PEDS[k].instanceColor.needsUpdate = true; }
}

function syncFx(dt) {
  const M = FX.mats, lampK = TOD.lamp, night = TOD.night;
  nPool = nCone = nRing = nBeam = 0;
  // street lamps, beacons and signs from the loaded chunks
  for (const c of GL.chunks.values()) {
    if (!c.mesh.visible) continue;
    for (const L of c.lights) {
      const dx = L[0] - CAM.x, dz = L[2] - CAM.z, d2 = dx * dx + dz * dz; if (d2 > 900 * 900) continue;
      if (L.length === 3) {
        if (lampK < 0.02 || d2 > 760 * 760) continue;
        _sph.center.set(L[0], 2, L[2]); _sph.radius = 80; if (!GL.frustum.intersectsSphere(_sph)) continue;
        addPool(L[0], 2.4, L[2], 165, WARM, 0.62 * lampK);
        FX.glow.add(L[0], L[1], L[2], 1, 0.84, 0.58, 0.95 * lampK, 28);
      } else if (L[3] === 1) { if (Math.floor(GL.clock * 1.4 + L[0]) % 2 === 0 || lampK > 0.5) FX.glow.add(L[0], L[1], L[2], 1, 0.12, 0.08, 0.9, 20); }
      else if (L[3] === 2) FX.glow.add(L[0], L[1], L[2], 1, 0.95, 0.8, 0.8 * (0.3 + lampK), 16);
      else if (L[3] === 3 && lampK > 0.02) { const c2 = lin(L[4]); FX.glow.add(L[0], L[1], L[2], Math.min(1, c2[0] * 1.6), Math.min(1, c2[1] * 1.6), Math.min(1, c2[2] * 1.6), 0.45 * lampK, 54); addPool(L[0], 2.4, L[2], 90, c2, 0.5 * lampK); }
    }
  }
  // traffic signals near the camera
  for (let j = 0; j < NY; j++) {
    if (Math.abs(YC[j] - CAM.z) > 800) continue;
    for (let i = 0; i < NX; i++) {
      if (Math.abs(XC[i] - CAM.x) > 800) continue;
      const hx = XR[i].hw + 6, hy = YR[j].hw + 6, sh = SIGC[sigState(i, j, 'h')], sv = SIGC[sigState(i, j, 'v')];
      const sth = sigState(i, j, 'h'), stv = sigState(i, j, 'v');
      const yh = (s) => (s === 'r' ? 49 : s === 'y' ? 45 : 41);
      FX.glow.add(XC[i] - hx - 2.6, yh(sth), YC[j] - hy, sh[0], sh[1], sh[2], 1, 11); FX.glow.add(XC[i] + hx + 2.6, yh(sth), YC[j] + hy, sh[0], sh[1], sh[2], 1, 11);
      FX.glow.add(XC[i] + hx, yh(stv), YC[j] - hy - 2.6, sv[0], sv[1], sv[2], 1, 11); FX.glow.add(XC[i] - hx, yh(stv), YC[j] + hy + 2.6, sv[0], sv[1], sv[2], 1, 11);
    }
  }
  // job markers: a ring on the ground and a beam you can find from afar
  const t = GL.clock, playing = G.phase === 'play' || G.phase === 'over';
  const mark = (x, z, r, hgt, hex, k) => {
    const dx = x - CAM.x, dz = z - CAM.z, d2 = dx * dx + dz * dz; if (d2 > 1700 * 1700) return;
    k *= sm(70, 260, Math.sqrt(d2));
    if (k < 0.02) return;
    const c = lin(hex), pul = 1 + 0.06 * Math.sin(t * 3 + x);
    addRing(x, z, r * pul, c, 0.8 * k); addRing(x, z, r * 0.62, c, 0.3 * k); addPool(x, 2.6, z, r * 2.6, c, 0.28 * k); addBeam(x, z, r * 0.5, hgt, c, 0.34 * k);
    FX.glow.add(x, hgt * 0.04 + 6, z, c[0], c[1], c[2], 0.5, r * 1.2);
  };
  if (playing) {
    for (const s of SAFE) mark(s.x, s.y, 15, 70, '#38D6B8', 0.5);
    for (const o of G.offers) { if (o.hidden || o.cd > 0) continue; mark(o.x, o.y, 24, 130, JT[o.type].col, 1); }
    const j = G.job;
    if (j) {
      if (j.type === 'race' && j.cps) { for (let k = j.cps.length - 1; k >= j.cp; k--) mark(j.cps[k].x, j.cps[k].y, k === j.cp ? 36 : 24, k === j.cp ? 240 : 100, k === j.cp ? '#FF5EA8' : '#b4446f', 1); }
      else if (j.tx != null) mark(j.tx, j.ty, 36, 240, j.col, 1);
    }
    if (!pl.veh && G.nearVeh) { const nv = G.nearVeh, a = nv.a, ca = Math.cos(a), sa = Math.sin(a); const r = nv.T.L * 0.72; addRing(nv.x, nv.y, r, [1, 0.72, 0.21], 0.5 + 0.4 * Math.sin(t * 6)); void ca; void sa; }
  } else {
    for (const s of SAFE) mark(s.x, s.y, 15, 70, '#38D6B8', 0.5);
  }
  FX.pools.count = nPool; FX.cones.count = nCone; FX.rings.count = nRing; FX.beams.count = nBeam;
  for (const m of [FX.pools, FX.cones, FX.rings, FX.beams]) if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  // cash on the pavement
  let nbill = 0;
  for (const k of PK) {
    const dx = k.x - CAM.x, dz = k.y - CAM.z; if (dx * dx + dz * dz > 900 * 900 || nbill >= 16) continue;
    M.d.position.set(k.x, 9 + Math.sin(t * 4 + k.s) * 2, k.y); M.d.rotation.set(0.25, t * 2.2 + k.s, 0); M.d.scale.set(1, 1, 1); M.d.updateMatrix(); FX.bills.setMatrixAt(nbill++, M.d.matrix);
    FX.glow.add(k.x, 10, k.y, 0.5, 1, 0.6, 0.6, 22);
  }
  FX.bills.count = nbill; if (nbill) FX.bills.instanceMatrix.needsUpdate = true;
  // particles
  for (let i = 0; i < PART.length; i++) {
    const p = PART[i]; if (!p.on) continue;
    const dx = p.x - CAM.x, dz = p.y - CAM.z; if (dx * dx + dz * dz > 1100 * 1100) continue;
    const a = clamp(p.life / p.max, 0, 1), c = parseCol(p.col);
    if (p.k === 'smoke' || p.k === 'dust') FX.soft.add(p.x, 3 + p.h, p.y, c[0], c[1], c[2], c[3] * a * 0.9, p.size * 2.4 * (1 + (1 - a) * 1.6));
    else if (p.k === 'spark') FX.glow.add(p.x, 3 + p.h, p.y, c[0], c[1], c[2], a, p.size * 2.6);
    else if (p.k === 'fire') FX.glow.add(p.x, 3 + p.h, p.y, a > 0.5 ? 1 : 1, a > 0.5 ? 0.75 : 0.35, a > 0.5 ? 0.24 : 0.12, a * 0.85, p.size * (1.4 + a));
    else if (p.k === 'cash') FX.soft.add(p.x, 3 + p.h, p.y, c[0], c[1], c[2], Math.min(1, a * 1.6), p.size * 2.2);
  }
  FX.soft.flush(); FX.glow.flush();
  const scale = GL.renderer.getPixelRatio() * GL.h / (2 * Math.tan(GL.camera.fov * PI / 360));
  FX.soft.o.material.uniforms.uScale.value = scale; FX.glow.o.material.uniforms.uScale.value = scale;
  // skid marks
  FX.skidT -= dt;
  if (SK.n !== FX.skidSeen || FX.skidT <= 0) {
    FX.skidSeen = SK.n; FX.skidT = 0.5;
    const n = Math.min(SK.n, SKN), pa = FX.skid.geometry.attributes.position.array, ca = FX.skid.geometry.attributes.color.array;
    let q = 0;
    for (let i = 0; i < n; i++) {
      const age = G.time - SK.t[i]; if (age > 26 || age < 0) continue;
      const ax = SK.x1[i], ay = SK.y1[i]; if (Math.abs(ax - CAM.x) > 900 || Math.abs(ay - CAM.z) > 900) continue;
      const bx = SK.x2[i], by = SK.y2[i], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 1.3, ny = dx / l * 1.3;
      const o = q * 12, al = 0.5 * (1 - age / 26);
      pa[o] = ax + nx; pa[o + 1] = 0.35; pa[o + 2] = ay + ny; pa[o + 3] = ax - nx; pa[o + 4] = 0.35; pa[o + 5] = ay - ny;
      pa[o + 6] = bx - nx; pa[o + 7] = 0.35; pa[o + 8] = by - ny; pa[o + 9] = bx + nx; pa[o + 10] = 0.35; pa[o + 11] = by + ny;
      for (let k = 0; k < 4; k++) { ca[q * 16 + k * 4] = 0.02; ca[q * 16 + k * 4 + 1] = 0.02; ca[q * 16 + k * 4 + 2] = 0.025; ca[q * 16 + k * 4 + 3] = al; }
      q++;
    }
    FX.skid.geometry.setDrawRange(0, q * 6);
    FX.skid.geometry.attributes.position.needsUpdate = true; FX.skid.geometry.attributes.color.needsUpdate = true;
  }
}

/* ================================================================ one frame of 3D */
let lastRenderMs = 0;
function render3D(arc) {
  const nowMs = performance.now(), dt = lastRenderMs ? Math.min(0.1, (nowMs - lastRenderMs) / 1000) : 1 / 60; lastRenderMs = nowMs;
  const r = GL.renderer;
  if (!r || GL.lost) return;
  GL.clock += dt;
  UN.uTime.value = GL.clock;
  // quality: if the first seconds run slow, shed pixels and shadow cost
  GL.fpsT += dt; GL.fpsN++;
  if (GL.fpsT >= 1.6) {
    GL.fps = GL.fpsN / GL.fpsT; GL.fpsT = 0; GL.fpsN = 0;
    if (!GL.pinned && GL.q > 0 && GL.fps < 34) { GL.lowRuns++; if (GL.lowRuns >= 2) { GL.q--; GL.lowRuns = 0; applyQuality(); } } else GL.lowRuns = 0;
  }
  const tc0 = performance.now();
  applyTOD(G.hour);
  const cam = GL.camera;
  cam.updateMatrixWorld();
  GL.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); GL.frustum.setFromProjectionMatrix(GL.pv);
  streamChunks(CAM.ground.x, CAM.ground.y, G.preload ? 99 : 1);
  { // fog takes the colour of the horizon in the direction the camera looks
    const dx = CAM.lx - CAM.x, dz = CAM.lz - CAM.z, l = Math.hypot(dx, dz) || 1, sd = TOD.sunDir, sl = Math.hypot(sd.x, sd.z) || 1;
    const west = 0.5 + 0.5 * ((dx / l) * (sd.x / sl) + (dz / l) * (sd.z / sl));
    GL.scene.fog.color.copy(TOD.opp).lerp(TOD.hor, west).multiplyScalar(0.94);
  }
  GL.sky.position.copy(cam.position);
  GL.sea.material.uniforms.uCam.value.copy(cam.position);
  // the key light follows the player so its shadow map stays sharp where you are looking
  const snap = 12, kx = Math.round((CAM.ground.x + Math.cos(CAM.yaw) * 80) / snap) * snap, kz = Math.round((CAM.ground.y + Math.sin(CAM.yaw) * 80) / snap) * snap;
  GL.key.target.position.set(kx, 0, kz);
  GL.key.position.set(kx + TOD.keyDir.x * 800, TOD.keyDir.y * 800, kz + TOD.keyDir.z * 800);
  GL.key.target.updateMatrixWorld();
  syncVehicles(dt);
  syncPeds();
  syncFx(dt);
  const tc1 = performance.now();
  r.render(GL.scene, cam);
  GL.cpuSync = lerp(GL.cpuSync || 0, tc1 - tc0, 0.1); GL.cpuRender = lerp(GL.cpuRender || 0, performance.now() - tc1, 0.1);
}

/* ================================================================ game state */
const G = {
  phase: 'attract', mode: 'free', diff: 'normal', time: 0, hour: 18.2, cash: 0, heat: 0, unseen: 0, spotted: false,
  chain: 0, chainT: 0, job: null, offers: [], hustleLeft: 600, mapOpen: false, caught: null, bank: 0,
  district: null, camX: 0, camY: 0, zoom: 1, shakeT: 0, shake: 0, lookX: 0, lookY: 0, banner: null, floaters: [],
  nearVeh: null, prompt: '', stats: { jobs: 0, crashes: 0 }, hornCd: 0, sirenCd: 0, spawnCd: 0, popCd: 0, copCd: 0,
  attractT: 0, attX: 900, attY: 2076, fx: 900, fy: 2076, vw: 1200, vh: 800, mmA: 0, arrest: 0, safeNear: null, bfs: new Int16Array(NX * NY), bfsT: 0, sfxCd: 0, quiet: 0,
};
const DIFF = {
  easy:   { police: 0.9, count: -1, gain: 0.8, decay: 5, time: 1.3, traffic: 0.9, rival: 0.82 },
  normal: { police: 1.0, count: 0, gain: 1.0, decay: 7, time: 1.0, traffic: 1.0, rival: 0.9 },
  hard:   { police: 1.1, count: 1, gain: 1.25, decay: 9, time: 0.85, traffic: 1.1, rival: 0.98 },
};
const V = [], PD = [];
let vid = 0;
const START_YAW = -0.3;
const pl = { x: 0, y: 0, vx: 0, vy: 0, a: 0, hp: 100, inv: 0, step: 0, veh: null, moving: false, hit: 0, face: 0 };
let arcRef = null;
const touchish = () => !!(arcRef && arcRef.touchMode);

/* ---------------------------------------------------------------- particles and skids */
const PART = [];
for (let i = 0; i < 380; i++) PART.push({ on: false, k: '', x: 0, y: 0, h: 0, vh: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col: '#fff', g: 0 });
let pIdx = 0;
function emit(k, x, y, vx, vy, life, size, col, g) {
  const p = PART[pIdx]; pIdx = (pIdx + 1) % PART.length;
  p.on = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.col = col || '#fff'; p.g = g || 0;
  p.h = 2 + rr() * 5; p.vh = k === 'smoke' ? 14 + rr() * 8 : k === 'fire' ? 26 + rr() * 16 : k === 'dust' ? 5 + rr() * 5 : k === 'spark' ? 18 + rr() * 50 : 28 + rr() * 30;
}
function updateParts(dt) {
  for (let i = 0; i < PART.length; i++) {
    const p = PART[i]; if (!p.on) continue;
    p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.h += p.vh * dt; if (p.k === 'spark' || p.k === 'cash') { p.vh -= 130 * dt; if (p.h < 0.5) { p.h = 0.5; p.vh = Math.abs(p.vh) * 0.3; } }
    const dr = p.k === 'smoke' || p.k === 'dust' ? 0.9 : 0.995;
    p.vx *= Math.pow(dr, dt * 60); p.vy *= Math.pow(dr, dt * 60);
    if (p.k === 'fire') p.vy -= 60 * dt;
    if (p.k === 'smoke') p.vy -= 12 * dt;
    if (p.k === 'cash') p.vy += p.g * dt;
  }
}
const SKN = 800;
const SK = { x1: new Float32Array(SKN), y1: new Float32Array(SKN), x2: new Float32Array(SKN), y2: new Float32Array(SKN), t: new Float32Array(SKN), n: 0 };
function addSkid(x1, y1, x2, y2) {
  const i = SK.n % SKN; SK.n++;
  SK.x1[i] = x1; SK.y1[i] = y1; SK.x2[i] = x2; SK.y2[i] = y2; SK.t[i] = G.time;
}


/* ---------------------------------------------------------------- vehicle creation and physics */
function mkVeh(type, x, y, a, o) {
  o = o || {};
  const T = VT[type];
  const v = {
    id: ++vid, type, T, x, y, a, vx: 0, vy: 0, hp: T.hp, maxhp: T.hp, col: o.col || pick(T.cols),
    c: { thr: 0, brk: 0, str: 0, hb: false }, ai: null, parked: !!o.parked, player: false, police: type === 'police',
    siren: false, wreck: false, wreckT: 0, burnt: false, smoke: 0, sk: [0, 0, 0, 0, 0], skid: false, horn: 0,
    brakeL: false, stuck: 0, blocked: 0, f: 0, l: 0, age: 0, crashCd: 0, fireT: 0, vmul: 1, accMul: 1, driver: !o.parked, lastHit: 0, fleeT: 0, rev: 0, role: 0,
    hum: null, steerVis: 0, mine: false, race: false,
  };
  V.push(v);
  return v;
}
const heading = (v) => ({ x: Math.cos(v.a), y: Math.sin(v.a) });
const vSpeed = (v) => hyp(v.vx, v.vy);

function stepVeh(v, dt) {
  const T = v.T, c = v.c, ca = Math.cos(v.a), sa = Math.sin(v.a);
  let f = v.vx * ca + v.vy * sa, l = -v.vx * sa + v.vy * ca;
  const hpf = v.hp / v.maxhp;
  const dead = v.wreck;
  const vmax = T.vmax * v.vmul * (hpf < 0.3 ? 0.8 : 1);
  v.brakeL = false;
  if (!dead) {
    if (c.thr > 0) {
      const k = 1 - Math.pow(clamp(f / vmax, 0, 1.2), 2);
      f += T.acc * v.accMul * c.thr * Math.max(0.04, k) * dt;
      if (f < -5) { f += T.brake * c.thr * dt; v.brakeL = true; }
    }
    if (c.brk > 0) {
      if (f > 12) { f = Math.max(0, f - T.brake * c.brk * dt); v.brakeL = true; }
      else { f = Math.max(-vmax * 0.32, f - T.acc * 0.7 * c.brk * dt); v.brakeL = f > -8; }
    }
  }
  if (c.thr <= 0 && c.brk <= 0 || dead) {
    f -= f * 0.5 * dt;
    f -= Math.sign(f) * Math.min(Math.abs(f), (dead ? 120 : 40) * dt);
  } else f -= f * 0.1 * dt;
  if (c.hb) { f -= Math.sign(f) * Math.min(Math.abs(f), 240 * dt); v.brakeL = true; }
  const spd = Math.abs(f);
  let grip = T.grip;
  if (c.hb && spd > 55) grip = 1.1;
  else if (spd > vmax * 0.8 && Math.abs(c.str) > 0.7) grip *= 0.7;
  const l0 = l;
  l *= Math.exp(-grip * dt);
  if (spd > 4) f += Math.sign(f) * (Math.abs(l0) - Math.abs(l)) * 0.5;
  const sf = clamp(spd / 55, 0, 1);
  let rate = T.steer * (1 - 0.42 * clamp(spd / T.vmax, 0, 1));
  if (c.hb && spd > 50) rate *= 1.55;
  const yaw = dead ? 0 : c.str * rate * sf * (f >= -2 ? 1 : -1);
  v.a += yaw * dt; v.steerVis = lerp(v.steerVis, c.str, Math.min(1, dt * 10));
  v.vx = ca * f - sa * l; v.vy = sa * f + ca * l;
  v.f = f; v.l = l0;
  v.x += v.vx * dt; v.y += v.vy * dt;
  // skid marks from the rear axle
  const sk = Math.abs(l0) > 38 || (c.hb && spd > 70) || (c.brk > 0.6 && f > 170 && !dead);
  v.skid = sk && !dead;
  const rx = Math.cos(v.a), ry = Math.sin(v.a), bx = v.x - rx * T.L * 0.3, by = v.y - ry * T.L * 0.3, px = -ry * T.Wd * 0.38, py = rx * T.Wd * 0.38;
  if (v.skid) {
    if (v.sk[4]) { addSkid(v.sk[0], v.sk[1], bx + px, by + py); addSkid(v.sk[2], v.sk[3], bx - px, by - py); }
    v.sk[0] = bx + px; v.sk[1] = by + py; v.sk[2] = bx - px; v.sk[3] = by - py; v.sk[4] = 1;
    if (rr() < dt * 22) emit('dust', bx, by, (rr() - 0.5) * 14, (rr() - 0.5) * 14, 0.7, 5 + rr() * 5, 'rgba(225,225,225,.5)');
    if (v.player && rr() < dt * 3) arcRef.sfx.noise(0.18, { freq: 2600, filter: 'bandpass', vol: 0.07 });
  } else v.sk[4] = 0;
  v.age += dt;
  if (v.crashCd > 0) v.crashCd -= dt;
}

// Circle against the solid grid. Returns the deepest penetration.
const hit = { nx: 0, ny: 0, pen: 0, x: 0, y: 0 };
function circleSolid(cx, cy, r) {
  const i0 = Math.floor((cx - r) / CELL), i1 = Math.floor((cx + r) / CELL), j0 = Math.floor((cy - r) / CELL), j1 = Math.floor((cy + r) / CELL);
  let best = 0, bx = 0, by = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (i >= 0 && j >= 0 && i < GW && j < GW && SOLID[j * GW + i] !== 1) continue;
    const x0 = i * CELL, y0 = j * CELL;
    const px = clamp(cx, x0, x0 + CELL), py = clamp(cy, y0, y0 + CELL);
    let dx = cx - px, dy = cy - py; const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    let d = Math.sqrt(d2), pen;
    if (d < 0.001) { dx = cx - (x0 + CELL / 2); dy = cy - (y0 + CELL / 2); d = hyp(dx, dy) || 1; pen = r + CELL / 2; dx /= d; dy /= d; }
    else { pen = r - d; dx /= d; dy /= d; }
    if (pen > best) { best = pen; bx = dx; by = dy; hit.x = px; hit.y = py; }
  }
  hit.pen = best; hit.nx = bx; hit.ny = by;
  return best > 0;
}

function damage(v, amt) {
  if (amt <= 0 || v.wreck) return;
  v.hp -= amt;
  if (v.hp <= 0) wreckVeh(v);
}
function wreckVeh(v) {
  v.hp = 0; v.wreck = true; v.wreckT = 0; v.ai = null; v.c.thr = v.c.brk = v.c.str = 0; v.siren = false;
  if (v.player) { banner('Car wrecked', 'Get out before it burns. Press F', 3000, '#FF8A3D'); arcRef.sfx.tone(120, 0.6, { type: 'sawtooth', slide: 50, vol: 0.2 }); }
  for (let i = 0; i < 12; i++) emit('smoke', v.x, v.y, (rr() - 0.5) * 60, (rr() - 0.5) * 60, 1.4, 10 + rr() * 8, 'rgba(60,60,60,.55)');
}

function crashFx(v, spd, px, py) {
  const n = Math.min(10, 3 + (spd / 30) | 0);
  for (let i = 0; i < n; i++) { const a = rr() * TAU; emit('spark', px, py, Math.cos(a) * (90 + rr() * 150), Math.sin(a) * (90 + rr() * 150), 0.28 + rr() * 0.25, 1.6 + rr() * 1.4, '#ffcf6b'); }
  if (v.player) {
    arcRef.sfx.noise(0.26, { freq: 650 + rr() * 300, vol: clamp(spd / 340, 0.1, 0.4) });
    arcRef.sfx.tone(90 + rr() * 30, 0.2, { type: 'square', slide: 45, vol: clamp(spd / 500, 0.08, 0.28) });
    if (!arcRef.reducedMotion) G.shake = Math.max(G.shake, clamp(spd / 40, 2, 11));
  } else if (vDist(v) < 380) arcRef.sfx.noise(0.16, { freq: 700, vol: clamp(spd / 700, 0.04, 0.16) });
}
const vDist = (o) => hyp(o.x - G.fx, o.y - G.fy);

function collideWorld(v) {
  const T = v.T;
  for (let iter = 0; iter < 2; iter++) {
    const ca = Math.cos(v.a), sa = Math.sin(v.a);
    let found = false, bpen = 0, bnx = 0, bny = 0, hx = 0, hy = 0;
    for (let k = 0; k < T.circ.length; k++) {
      const o = T.circ[k];
      if (circleSolid(v.x + ca * o, v.y + sa * o, T.r) && hit.pen > bpen) { bpen = hit.pen; bnx = hit.nx; bny = hit.ny; hx = hit.x; hy = hit.y; found = true; }
    }
    if (!found) return;
    v.x += bnx * bpen; v.y += bny * bpen;
    const vn = v.vx * bnx + v.vy * bny;
    if (vn < 0) {
      v.vx -= 1.32 * vn * bnx; v.vy -= 1.32 * vn * bny;
      v.vx *= 0.985; v.vy *= 0.985;
      const sp = -vn;
      if (sp > 45) {
        if (v.crashCd <= 0) { crashFx(v, sp, hx, hy); v.crashCd = 0.12; }
        damage(v, Math.max(0, sp - 52) * 0.16 / Math.sqrt(T.mass));
        if (v.ai && v.ai.kind === 'traffic' && sp > 70) v.ai.bump = 1.5;
      }
    }
  }
}
function collideVeh(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, rad = (a.T.L + b.T.L) / 2 + 4;
  if (dx * dx + dy * dy > rad * rad) return;
  const ca = Math.cos(a.a), sa = Math.sin(a.a), cb = Math.cos(b.a), sb = Math.sin(b.a);
  let bp = 0, nx = 0, ny = 0, hx = 0, hy = 0;
  for (let i = 0; i < a.T.circ.length; i++) {
    const ax = a.x + ca * a.T.circ[i], ay = a.y + sa * a.T.circ[i];
    for (let j = 0; j < b.T.circ.length; j++) {
      const bx = b.x + cb * b.T.circ[j], by = b.y + sb * b.T.circ[j];
      const ddx = bx - ax, ddy = by - ay, rs = a.T.r + b.T.r, d2 = ddx * ddx + ddy * ddy;
      if (d2 < rs * rs) { const d = Math.sqrt(d2) || 0.01, pen = rs - d; if (pen > bp) { bp = pen; nx = ddx / d; ny = ddy / d; hx = (ax + bx) / 2; hy = (ay + by) / 2; } }
    }
  }
  if (bp <= 0) return;
  const mA = a.T.mass * (a.driver || a.player ? 1 : 1.3), mB = b.T.mass * (b.driver || b.player ? 1 : 1.3);
  const wa = mB / (mA + mB), wb = mA / (mA + mB);
  a.x -= nx * bp * wa; a.y -= ny * bp * wa; b.x += nx * bp * wb; b.y += ny * bp * wb;
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const j = -(1.4) * vn / (1 / mA + 1 / mB);
    a.vx -= j * nx / mA; a.vy -= j * ny / mA; b.vx += j * nx / mB; b.vy += j * ny / mB;
    const sp = -vn;
    if (sp > 38) {
      if (a.crashCd <= 0 || b.crashCd <= 0) {
        crashFx(a.player || b.player ? (a.player ? a : b) : a, sp, hx, hy);
        onCarCrash(a, b, sp);
      }
      a.crashCd = b.crashCd = 0.2;
      damage(a, Math.max(0, sp - 36) * 0.12 * wb * 2);
      damage(b, Math.max(0, sp - 36) * 0.12 * wa * 2);
      if (a.ai && a.ai.kind === 'traffic') a.ai.bump = 1.2;
      if (b.ai && b.ai.kind === 'traffic') b.ai.bump = 1.2;
    }
  }
}

/* ---------------------------------------------------------------- pedestrians */
const SHIRTS = ['#d9534f', '#e8a33a', '#3aa6b5', '#5b7fd1', '#c9477f', '#7bb35a', '#f0e6d0', '#8a5ad0', '#e07a3a', '#3c8d5a'];
const SKINS = ['#e0b08a', '#c68a5e', '#a96f45', '#8a5a38', '#d9a27a'];
function mkPed(cn) {
  const p = {
    x: 0, y: 0, vx: 0, vy: 0, a: 0, c: cn, prev: null, tx: 0, ty: 0, state: 'walk', t: 0, sp: 24 + rr() * 8, shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(['#1a1410', '#2b1d12', '#3a2a1a', '#101010', '#6b6b6b']),
    anim: rr() * 10, cool: 0, fx: 0, fy: 0, dive: 0, bag: rr() < 0.25, dupatta: rr() < 0.2, scared: 0, pause: 0,
  };
  const q = cornerPos(cn);
  p.x = q.x + (rr() - 0.5) * 6; p.y = q.y + (rr() - 0.5) * 6;
  pedPick(p);
  PD.push(p);
  return p;
}
const cornerPos = (c) => corner(c.i, c.j, c.sx, c.sy);
function pedPick(p) {
  const c = p.c, opts = [];
  const nj = c.j + (c.sy ? 1 : -1), ni = c.i + (c.sx ? 1 : -1);
  if (nj >= 0 && nj < NY) opts.push({ c: { i: c.i, j: nj, sx: c.sx, sy: c.sy ? 0 : 1 }, w: 3 });
  if (ni >= 0 && ni < NX) opts.push({ c: { i: ni, j: c.j, sx: c.sx ? 0 : 1, sy: c.sy }, w: 3 });
  opts.push({ c: { i: c.i, j: c.j, sx: 1 - c.sx, sy: c.sy }, w: 1.1, cross: true });
  opts.push({ c: { i: c.i, j: c.j, sx: c.sx, sy: 1 - c.sy }, w: 1.1, cross: true });
  let tot = 0;
  for (const o of opts) { if (p.prev && o.c.i === p.prev.i && o.c.j === p.prev.j && o.c.sx === p.prev.sx && o.c.sy === p.prev.sy) o.w = 0.15; tot += o.w; }
  let r = rr() * tot, ch = opts[0];
  for (const o of opts) { r -= o.w; if (r <= 0) { ch = o; break; } }
  p.prev = c; p.c = ch.c;
  const q = cornerPos(p.c);
  p.tx = q.x + (rr() - 0.5) * 6; p.ty = q.y + (rr() - 0.5) * 6;
}

function updatePed(p, dt) {
  p.anim += dt * (p.state === 'flee' ? 14 : 8);
  if (p.cool > 0) p.cool -= dt;
  // threats: moving vehicles
  let threat = false;
  for (let i = 0; i < V.length; i++) {
    const v = V[i]; if (v.parked && vSpeed(v) < 20) continue;
    const dx = p.x - v.x, dy = p.y - v.y; if (dx * dx + dy * dy > 150 * 150) continue;
    const sp = vSpeed(v); if (sp < 30) continue;
    const ux = v.vx / sp, uy = v.vy / sp, s = dx * ux + dy * uy, lat = -dx * uy + dy * ux;
    if (s > -14 && s < 40 + sp * 0.5 && Math.abs(lat) < 28) {
      threat = true;
      if (p.state !== 'dive') {
        const sgn = lat >= 0 ? 1 : -1;
        p.fx = -uy * sgn; p.fy = ux * sgn;
        if (p.state !== 'flee') p.state = 'flee';
        p.t = 1.4;
      }
      let hitC = false;
      for (let k = 0; k < v.T.circ.length; k++) { const o = v.T.circ[k]; const ccx = v.x + Math.cos(v.a) * o - p.x, ccy = v.y + Math.sin(v.a) * o - p.y; if (ccx * ccx + ccy * ccy < (v.T.r + 4) * (v.T.r + 4)) { hitC = true; break; } }
      if (hitC && sp > 34 && p.state !== 'dive') {
        p.state = 'dive'; p.t = 0.55; p.vx = p.fx * 170 + v.vx * 0.18; p.vy = p.fy * 170 + v.vy * 0.18;
        for (let q = 0; q < 4; q++) emit('dust', p.x, p.y, (rr() - 0.5) * 40, (rr() - 0.5) * 40, 0.5, 4, 'rgba(230,220,200,.5)');
        if (v.player && p.cool <= 0) { p.cool = 3; addHeat(0.13, 'dive'); popText('Whoa!', p.x, p.y - 12, '#FFB736'); arcRef.sfx.tone(520, 0.1, { type: 'triangle', slide: 760, vol: 0.1 }); }
      }
    }
  }
  if (p.state === 'dive') {
    p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.04, dt); p.vy *= Math.pow(0.04, dt);
    if (p.t <= 0) { p.state = 'flee'; p.t = 1.2; }
    return;
  }
  if (p.state === 'flee') {
    p.t -= dt;
    const sp = 105;
    p.x += p.fx * sp * dt; p.y += p.fy * sp * dt; p.a = Math.atan2(p.fy, p.fx);
    if (p.t <= 0 && !threat) { p.state = 'walk'; p.scared = 2; const q = cornerPos(p.c); p.tx = q.x; p.ty = q.y; }
    if (solidAt(p.x, p.y)) { p.x -= p.fx * sp * dt; p.y -= p.fy * sp * dt; const t0 = p.fx; p.fx = -p.fy; p.fy = t0; }
    return;
  }
  if (p.pause > 0) { p.pause -= dt; return; }
  const dx = p.tx - p.x, dy = p.ty - p.y, d = hyp(dx, dy);
  if (d < 4) { if (rr() < 0.12) p.pause = 0.6 + rr() * 2; pedPick(p); return; }
  const sp = p.sp * (p.scared > 0 ? 1.6 : 1);
  if (p.scared > 0) p.scared -= dt;
  p.x += dx / d * sp * dt; p.y += dy / d * sp * dt; p.a = Math.atan2(dy, dx);
}

/* ================================================================ roads, traffic AI */
const CRUISE = { hatch: 150, coupe: 185, auto: 118, van: 124, bike: 165, police: 155 };
function laneCoord(axis, idx, dir, lane) {
  const R = axis === 'h' ? YR[idx] : XR[idx], off = laneOff(R, lane);
  return axis === 'h' ? YC[idx] - dir * off : XC[idx] + dir * off;
}
function nextNodeIdx(axis, idx, pos, dir) {
  const C = axis === 'h' ? XC : YC, R = axis === 'h' ? XR : YR;
  if (dir > 0) { for (let n = 0; n < C.length; n++) if (C[n] - pos > R[n].hw + 14) return n; }
  else { for (let n = C.length - 1; n >= 0; n--) if (pos - C[n] > R[n].hw + 14) return n; }
  return -1;
}
const headingOf = (axis, dir) => (axis === 'h' ? (dir > 0 ? 0 : PI) : (dir > 0 ? PI / 2 : -PI / 2));
function sigState(i, j, axis) {
  const t = (G.time + ((i * 5 + j * 3) % 22)) % 22;
  if (axis === 'h') return t < 8 ? 'g' : t < 10 ? 'y' : 'r';
  return t < 11 ? 'r' : t < 19 ? 'g' : t < 21 ? 'y' : 'r';
}
function nearestNode(x, y) {
  let bi = 0, bj = 0, bd = 1e9;
  for (let i = 0; i < NX; i++) { const d = Math.abs(x - XC[i]); if (d < bd) { bd = d; bi = i; } }
  bd = 1e9;
  for (let j = 0; j < NY; j++) { const d = Math.abs(y - YC[j]); if (d < bd) { bd = d; bj = j; } }
  return { i: bi, j: bj };
}
function clearLine(x0, y0, x1, y1) {
  const d = hyp(x1 - x0, y1 - y0), n = Math.ceil(d / 14);
  for (let k = 1; k < n; k++) { const t = k / n; if (solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
  return true;
}
function whisker(v, off, len) {
  const a = v.a + off, c = Math.cos(a), s = Math.sin(a);
  return solidAt(v.x + c * len * 0.55, v.y + s * len * 0.55) || solidAt(v.x + c * len, v.y + s * len);
}

function planTurn(v) {
  const ai = v.ai, axis = ai.axis, idx = ai.idx, dir = ai.dir, n = ai.node;
  if (n < 0) { v.remove = true; return; }
  const isH = axis === 'h';
  const i = isH ? n : idx, j = isH ? idx : n;
  const hwc = isH ? XR[i].hw : YR[j].hw, hwr = isH ? YR[j].hw : XR[i].hw;
  const cin = laneCoord(axis, idx, dir, ai.lane);
  const along = isH ? XC[i] : YC[j];
  const pin = isH ? { x: along - dir * (hwc + 6), y: cin, entry: true } : { x: cin, y: along - dir * (hwc + 6), entry: true };
  const opts = [];
  const ns = n + dir;
  if (ns >= 0 && ns < (isH ? NX : NY)) opts.push(['s', ai.cop ? 0.7 : 0.6]);
  const turns = [['l', isH ? -dir : dir], ['r', isH ? dir : -dir]];
  for (const t of turns) { const nn = (isH ? j : i) + t[1]; if (nn >= 0 && nn < (isH ? NY : NX)) opts.push([t[0], 0.2, t[1]]); }
  let tot = 0; for (const o of opts) tot += o[1];
  let r = rr() * tot, ch = opts[0];
  for (const o of opts) { r -= o[1]; if (r <= 0) { ch = o; break; } }
  ai.sig = { h: isH, i, j, dir, stop: along - dir * (hwc + 28 + v.T.L / 2) };
  if (ch[0] === 's') {
    const pout = isH ? { x: along + dir * (hwc + 6), y: cin } : { x: cin, y: along + dir * (hwc + 6) };
    ai.wps = [pin, pout]; ai.node = n + dir;
  } else {
    const d2 = ch[2], axis2 = isH ? 'v' : 'h', idx2 = isH ? i : j;
    const R2 = axis2 === 'h' ? YR[idx2] : XR[idx2];
    const lane2 = ch[0] === 'l' ? R2.lanes - 1 : 0;
    const cout = laneCoord(axis2, idx2, d2, lane2);
    const C = isH ? { x: cout, y: cin } : { x: cin, y: cout };
    const pout = isH ? { x: cout, y: YC[j] + d2 * (hwr + 6) } : { x: XC[i] + d2 * (hwr + 6), y: cout };
    ai.wps = [pin];
    for (let k = 1; k <= 3; k++) {
      const t = k / 4, u = 1 - t;
      ai.wps.push({ x: u * u * pin.x + 2 * u * t * C.x + t * t * pout.x, y: u * u * pin.y + 2 * u * t * C.y + t * t * pout.y, turn: true });
    }
    ai.wps.push(pout);
    ai.axis = axis2; ai.idx = idx2; ai.dir = d2; ai.lane = lane2; ai.node = (isH ? j : i) + d2;
  }
}

function initTraffic(v, axis, idx, dir, lane) {
  const pos = axis === 'h' ? v.x : v.y;
  v.ai = { kind: 'traffic', axis, idx, dir, lane, wps: [], cruise: (CRUISE[v.type] || 140) * (0.85 + rr() * 0.3), node: nextNodeIdx(axis, idx, pos, dir), sig: null, bump: 0, rev: 0, blk: 0, cop: v.police };
  if (v.ai.node < 0) { v.ai.dir = -dir; v.ai.node = nextNodeIdx(axis, idx, pos, -dir); }
  planTurn(v);
}

function aiTraffic(v, dt) {
  const ai = v.ai, c = v.c, ca = Math.cos(v.a), sa = Math.sin(v.a), f = v.f;
  if (!ai.wps.length) { planTurn(v); if (v.remove) return; }
  let wp = ai.wps[0];
  while (wp && hyp(wp.x - v.x, wp.y - v.y) < 22) {
    if (wp.entry) ai.sig = null;
    ai.wps.shift(); if (!ai.wps.length) { planTurn(v); if (v.remove) return; }
    wp = ai.wps[0];
  }
  if (ai.bump > 0) ai.bump -= dt;
  const err = wrapA(Math.atan2(wp.y - v.y, wp.x - v.x) - v.a);
  let str = clamp(err * 2.3, -1, 1);
  let target = ai.cruise;
  if (wp.turn || (ai.wps[1] && ai.wps[1].turn && hyp(wp.x - v.x, wp.y - v.y) < 100)) target = Math.min(target, 92);
  if (ai.sig) {
    const s = ai.sig, pos = s.h ? v.x : v.y, dist = (s.stop - pos) * s.dir;
    const st = sigState(s.i, s.j, s.h ? 'h' : 'v');
    if (dist > -12 && (st === 'r' || (st === 'y' && dist > 40))) target = Math.min(target, Math.sqrt(2 * 190 * Math.max(0, dist - 2)));
  }
  const reach = 50 + Math.max(0, f) * 0.8;
  let gapMin = 1e9;
  for (let i = 0; i < V.length; i++) {
    const o = V[i]; if (o === v) continue;
    const dx = o.x - v.x, dy = o.y - v.y; if (Math.abs(dx) + Math.abs(dy) > 260) continue;
    const fx = dx * ca + dy * sa; if (fx <= 0 || fx > reach + o.T.L) continue;
    const lx = -dx * sa + dy * ca, half = o.parked && !o.player ? 17 : o.T.Wd / 2 + v.T.Wd / 2 + 3;
    if (Math.abs(lx) >= half) continue;
    const gap = fx - (v.T.L + o.T.L) / 2, ovf = o.vx * ca + o.vy * sa;
    target = Math.min(target, Math.max(0, gap - 9) * 1.9 + Math.max(0, ovf) * (gap > 0 ? 0.9 : 0));
    if (gap < gapMin) gapMin = gap;
  }
  const peds = (p) => {
    const dx = p.x - v.x, dy = p.y - v.y; if (Math.abs(dx) + Math.abs(dy) > 160) return;
    const fx = dx * ca + dy * sa; if (fx <= 0 || fx > reach * 1.2) return;
    const lx = -dx * sa + dy * ca; if (Math.abs(lx) > 15) return;
    target = Math.min(target, Math.max(0, fx - v.T.L / 2 - 14) * 2.2);
  };
  for (let i = 0; i < PD.length; i++) peds(PD[i]);
  if (!pl.veh) peds(pl);
  const dv = target - f;
  if (dv > 8) { c.thr = clamp(dv / 55, 0.2, 1); c.brk = 0; }
  else if (dv < -16) { c.thr = 0; c.brk = clamp(-dv / 70, 0.25, 1); }
  else { c.thr = f < target ? 0.12 : 0; c.brk = 0; }
  c.hb = false; c.str = str;
  if (Math.abs(f) < 6 && target > 15) v.stuck += dt; else v.stuck = Math.max(0, v.stuck - dt * 2);
  if (v.stuck > 1.6 && ai.rev <= 0) { ai.rev = 0.9; v.stuck = 0; }
  if (ai.rev > 0) { ai.rev -= dt; c.thr = 0; c.brk = 1; c.str = -str; }
  if (gapMin < 16 && Math.abs(f) < 8) { ai.blk += dt; if (ai.blk > 3 && rr() < dt * 0.6) honk(v); } else ai.blk = 0;
  v.blocked = ai.blk;
}

/* ---- pursuit AI (police) and the street race rival */
function aiChase(v, dt) {
  const ai = v.ai, c = v.c, f = v.f;
  const pv = pl.veh, px = pl.x, py = pl.y, pvx = pv ? pv.vx : pl.vx, pvy = pv ? pv.vy : pl.vy, pspd = hyp(pvx, pvy);
  const dx = px - v.x, dy = py - v.y, d = hyp(dx, dy);
  let tx = px + pvx * 0.45, ty = py + pvy * 0.45;
  if (ai.role === 1 && pspd > 70 && d > 110) { tx = px + pvx / pspd * 120; ty = py + pvy / pspd * 120; }
  else if (ai.role === 2 && d < 300 && pspd > 40) { const sg = ai.side || 1; tx = px - pvy / pspd * 46 * sg; ty = py + pvx / pspd * 46 * sg; }
  let direct = d < 130 || (d < 520 && clearLine(v.x, v.y, tx, ty));
  if (!direct) {
    const n0 = nearestNode(v.x, v.y);
    let bi = n0.i, bj = n0.j, bd = G.bfs[bi + bj * NX];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const q of nb) {
      const ni = n0.i + q[0], nj = n0.j + q[1]; if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
      const dd = G.bfs[ni + nj * NX]; if (dd < bd) { bd = dd; bi = ni; bj = nj; }
    }
    if (bd === 0 && bi === n0.i && bj === n0.j && G.bfs[bi + bj * NX] === 0) direct = true;
    else { tx = XC[bi]; ty = YC[bj]; }
  }
  const err = wrapA(Math.atan2(ty - v.y, tx - v.x) - v.a);
  let str = clamp(err * 2.6, -1, 1);
  const wl = whisker(v, -0.6, 62), wr = whisker(v, 0.6, 62), wc = whisker(v, 0, 70);
  if (wr) str -= 0.9; if (wl) str += 0.9;
  if (wc) str += (wr && !wl ? -1 : 1) * 0.9;
  str = clamp(str, -1, 1);
  let target = v.T.vmax * ai.mul;
  if (d < 140 && pspd < 40) { target = 0; }
  else if (d < 150 && ai.role > 0) target = Math.max(70, pspd * 0.96);
  if (Math.abs(err) > 1.1 && f > 140) target = Math.min(target, 150);
  if (wc && f > 90) target = Math.min(target, 90);
  const dv = target - f;
  if (dv > 8) { c.thr = clamp(dv / 40, 0.3, 1); c.brk = 0; } else if (dv < -25) { c.thr = 0; c.brk = clamp(-dv / 90, 0.2, 1); } else { c.thr = 0.1; c.brk = 0; }
  c.hb = d < 70 && pspd < 40;
  c.str = str;
  if (Math.abs(err) > 2.4 && d < 220 && f < 120) { c.thr = 0.7; c.str = err > 0 ? 1 : -1; }
  if (Math.abs(f) < 10 && target > 40) v.stuck += dt; else v.stuck = Math.max(0, v.stuck - dt * 2);
  if (v.stuck > 1.1 && ai.rev <= 0) { ai.rev = 0.9; v.stuck = 0; }
  if (ai.rev > 0) { ai.rev -= dt; c.thr = 0; c.brk = 1; c.str = -str; c.hb = false; }
}

function aiRival(v, dt) {
  const ai = v.ai, c = v.c, f = v.f;
  if (!ai.go) { c.thr = 0; c.brk = 0; c.hb = true; return; }
  c.hb = false;
  if (ai.k >= ai.route.length) { c.thr = 0; c.brk = 0.5; ai.done = true; return; }
  let wp = ai.route[ai.k];
  if (hyp(wp.x - v.x, wp.y - v.y) < 64) {
    if (wp.cp != null) ai.cp = wp.cp + 1;
    ai.k++;
    if (ai.k >= ai.route.length) { ai.done = true; return; }
    wp = ai.route[ai.k];
  }
  const d = hyp(wp.x - v.x, wp.y - v.y);
  const err = wrapA(Math.atan2(wp.y - v.y, wp.x - v.x) - v.a);
  let str = clamp(err * 2.6, -1, 1);
  const wl = whisker(v, -0.6, 62), wr = whisker(v, 0.6, 62);
  if (wr) str -= 0.9; if (wl) str += 0.9;
  str = clamp(str, -1, 1);
  const job = G.job;
  let mul = ai.mul;
  if (job && job.type === 'race') { const ahead = ai.cp - job.cp; if (ahead >= 2) mul *= 0.78; else if (ahead <= -2) mul *= 1.1; }
  let target = v.T.vmax * mul;
  const nxt = ai.route[ai.k + 1];
  if (nxt) {
    const turnA = Math.abs(wrapA(Math.atan2(nxt.y - wp.y, nxt.x - wp.x) - Math.atan2(wp.y - v.y, wp.x - v.x)));
    if (turnA > 0.7 && d < 190) target = Math.min(target, 205);
  }
  if (Math.abs(err) > 0.9) target = Math.min(target, 170);
  const dv = target - f;
  if (dv > 8) { c.thr = clamp(dv / 40, 0.3, 1); c.brk = 0; } else if (dv < -25) { c.thr = 0; c.brk = clamp(-dv / 90, 0.2, 1); } else { c.thr = 0.1; c.brk = 0; }
  c.str = str;
  if (Math.abs(f) < 10) v.stuck += dt; else v.stuck = Math.max(0, v.stuck - dt * 2);
  if (v.stuck > 1.2 && ai.rev <= 0) { ai.rev = 0.9; v.stuck = 0; }
  if (ai.rev > 0) { ai.rev -= dt; c.thr = 0; c.brk = 1; c.str = -str; }
}

function bfsField(tx, ty) {
  const n0 = nearestNode(tx, ty), F = G.bfs;
  F.fill(9999);
  const q = [n0.i + n0.j * NX]; F[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const id = q[h], i = id % NX, j = (id / NX) | 0, d = F[id] + 1;
    if (i > 0 && F[id - 1] > d) { F[id - 1] = d; q.push(id - 1); }
    if (i < NX - 1 && F[id + 1] > d) { F[id + 1] = d; q.push(id + 1); }
    if (j > 0 && F[id - NX] > d) { F[id - NX] = d; q.push(id - NX); }
    if (j < NY - 1 && F[id + NX] > d) { F[id + NX] = d; q.push(id + NX); }
  }
}

function honk(v) {
  v.horn = 0.35;
  if (vDist(v) < 600) { const k = clamp(1 - vDist(v) / 600, 0.05, 1) * 0.14; arcRef.sfx.tone(380 + (v.id % 5) * 18, 0.22, { type: 'square', vol: k }); }
}

/* ---- placing vehicles on roads */
function roadPoint(cx, cy, rmin, rmax) {
  for (let tries = 0; tries < 10; tries++) {
    const a = rr() * TAU, d = rmin + rr() * (rmax - rmin);
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
    let bi = 0, bj = 0, bd = 1e9;
    for (let i = 0; i < NX; i++) { const q = Math.abs(px - XC[i]); if (q < bd) { bd = q; bi = i; } }
    let bd2 = 1e9;
    for (let j = 0; j < NY; j++) { const q = Math.abs(py - YC[j]); if (q < bd2) { bd2 = q; bj = j; } }
    const axis = bd < bd2 ? 'v' : 'h', idx = axis === 'v' ? bi : bj;
    let pos = axis === 'v' ? py : px;
    const C = axis === 'v' ? YC : XC, R = axis === 'v' ? YR : XR;
    pos = clamp(pos, C[0] + 60, C[C.length - 1] - 60);
    let ok = true;
    for (let n = 0; n < C.length; n++) if (Math.abs(pos - C[n]) < R[n].hw + 76) { ok = false; break; }
    if (!ok) continue;
    return { axis, idx, pos };
  }
  return null;
}
const inView = (x, y, m) => {
  const dx = x - CAM.x, dy = y - CAM.z, fx = Math.cos(CAM.yaw), fy = Math.sin(CAM.yaw);
  const ahead = dx * fx + dy * fy, lat = Math.abs(-dx * fy + dy * fx);
  return ahead > -120 - m && ahead < 1050 + m && lat < ahead * 0.95 + 160 + m;
};
function freeSpot(x, y, rad) {
  if (solidAt(x, y)) return false;
  for (let i = 0; i < V.length; i++) { const o = V[i]; if (Math.abs(o.x - x) < rad && Math.abs(o.y - y) < rad) return false; }
  return true;
}
function spawnTraffic(type, rmin, rmax) {
  const rp = roadPoint(G.fx, G.fy, rmin, rmax); if (!rp) return null;
  const dir = rr() < 0.5 ? 1 : -1, R = rp.axis === 'h' ? YR[rp.idx] : XR[rp.idx], lane = (rr() * R.lanes) | 0;
  const c = laneCoord(rp.axis, rp.idx, dir, lane);
  const x = rp.axis === 'h' ? rp.pos : c, y = rp.axis === 'h' ? c : rp.pos;
  if ((!G.initial && inView(x, y, 90)) || !freeSpot(x, y, 70)) return null;
  const v = mkVeh(type, x, y, headingOf(rp.axis, dir));
  initTraffic(v, rp.axis, rp.idx, dir, lane);
  const sp = v.ai.cruise * 0.8; v.vx = Math.cos(v.a) * sp; v.vy = Math.sin(v.a) * sp; v.f = sp;
  return v;
}
function parkSpot(rp, sideSign, off) {
  // Left hand traffic: a car parked on a given side faces the way that side's traffic flows.
  const dir = sideSign > 0 ? (rp.axis === 'h' ? -1 : 1) : (rp.axis === 'h' ? 1 : -1);
  const R = rp.axis === 'h' ? YR[rp.idx] : XR[rp.idx];
  const o = off || (R.blvd ? 76 : 41);
  const c = (rp.axis === 'h' ? YC[rp.idx] : XC[rp.idx]) + sideSign * o;
  return { x: rp.axis === 'h' ? rp.pos : c, y: rp.axis === 'h' ? c : rp.pos, a: headingOf(rp.axis, dir) };
}
function spawnParked(type, rmin, rmax, force) {
  const rp = roadPoint(G.fx, G.fy, rmin, rmax); if (!rp) return null;
  const sp = parkSpot(rp, rr() < 0.5 ? 1 : -1);
  if ((!force && !G.initial && inView(sp.x, sp.y, 60)) || !freeSpot(sp.x, sp.y, 56)) return null;
  const v = mkVeh(type, sp.x, sp.y, sp.a, { parked: true });
  v.c.hb = true; v.driver = false;
  return v;
}
function pickTrafficType() {
  const r = rr();
  return r < 0.34 ? 'hatch' : r < 0.5 ? 'auto' : r < 0.6 ? 'van' : r < 0.74 ? 'bike' : r < 0.82 ? 'coupe' : 'hatch';
}
function pickParkedType() { const r = rr(); return r < 0.45 ? 'hatch' : r < 0.58 ? 'coupe' : r < 0.74 ? 'auto' : r < 0.86 ? 'van' : 'bike'; }

function spawnPedAt(ringMin, ringMax) {
  for (let t = 0; t < 8; t++) {
    const a = rr() * TAU, d = ringMin + rr() * (ringMax - ringMin);
    const n = nearestNode(G.fx + Math.cos(a) * d, G.fy + Math.sin(a) * d);
    const cn = { i: n.i, j: n.j, sx: rr() < 0.5 ? 1 : 0, sy: rr() < 0.5 ? 1 : 0 };
    const q = cornerPos(cn);
    if ((!G.initial && inView(q.x, q.y, 20)) || hyp(q.x - G.fx, q.y - G.fy) < ringMin * 0.8) continue;
    return mkPed(cn);
  }
  return null;
}

function spawnCop(near) {
  const rp = roadPoint(G.fx, G.fy, 620, 960); if (!rp) return null;
  const dir = rr() < 0.5 ? 1 : -1, R = rp.axis === 'h' ? YR[rp.idx] : XR[rp.idx], lane = (rr() * R.lanes) | 0;
  const c = laneCoord(rp.axis, rp.idx, dir, lane);
  const x = rp.axis === 'h' ? rp.pos : c, y = rp.axis === 'h' ? c : rp.pos;
  if (inView(x, y, 90) || !freeSpot(x, y, 60)) return null;
  const v = mkVeh('police', x, y, headingOf(rp.axis, dir));
  startChase(v);
  return v;
}
function startChase(v) {
  const n = V.filter((o) => o.ai && o.ai.kind === 'chase').length;
  v.ai = { kind: 'chase', role: n % 3, side: n % 2 ? 1 : -1, mul: 0.9, rev: 0 };
  v.siren = true; v.driver = true; v.parked = false; v.c.hb = false;
}
function releaseCop(v) {
  v.siren = false;
  const rp = (() => {
    const n = nearestNode(v.x, v.y);
    const dv = Math.abs(v.x - XC[n.i]), dh = Math.abs(v.y - YC[n.j]);
    return dv < dh ? { axis: 'v', idx: n.i } : { axis: 'h', idx: n.j };
  })();
  const ca = Math.cos(v.a), sa = Math.sin(v.a);
  const dir = rp.axis === 'h' ? (ca >= 0 ? 1 : -1) : (sa >= 0 ? 1 : -1);
  const R = rp.axis === 'h' ? YR[rp.idx] : XR[rp.idx];
  initTraffic(v, rp.axis, rp.idx, dir, (rr() * R.lanes) | 0);
}

/* ================================================================ heat, jobs, pickups, player */
function banner(title, sub, ms, col) { G.banner = { title, sub: sub || '', t: 0, max: (ms || 2200) / 1000, col: col || '#FFB736' }; }
function popText(text, x, y, col) { if (G.floaters.length > 14) G.floaters.shift(); G.floaters.push({ text, x, y, t: 0, col: col || '#fff' }); }
const sfxCash = () => { const s = arcRef.sfx; s.tone(880, 0.08, { type: 'triangle', vol: 0.16 }); s.tone(1320, 0.14, { type: 'triangle', vol: 0.16, delay: 0.07 }); };
const stars = () => Math.floor(G.heat + 1e-6);

function copDist() {
  let m = 1e9;
  for (let i = 0; i < V.length; i++) { const v = V[i]; if (v.police && !v.wreck && !v.player) { const d = hyp(v.x - pl.x, v.y - pl.y); if (d < m) m = d; } }
  return m;
}
function addHeat(amt, why) {
  if (G.phase !== 'play' || G.caught || amt <= 0) return;
  let m = DIFF[G.diff].gain;
  if (G.copDist < 450) m *= 1.8;
  const before = stars();
  G.heat = Math.min(5, G.heat + amt * m);
  G.unseen = 0;
  if (stars() > before) {
    banner(stars() + (stars() === 1 ? ' star' : ' stars'), why === 'jack' ? 'Carjacking: the police are on the way' : 'The police are after you', 2200, '#FF5252');
    arcRef.sfx.tone(660, 0.18, { type: 'square', vol: 0.12 }); arcRef.sfx.tone(880, 0.22, { type: 'square', vol: 0.12, delay: 0.16 });
  }
}
function onCarCrash(a, b, sp) {
  const pv = a.player ? a : b.player ? b : null; if (!pv) return;
  const o = pv === a ? b : a;
  if (vSpeed(pv) < 55 && !o.police) return;
  G.stats.crashes++;
  if (G.job && G.job.type === 'fare') { G.job.crashes++; popText('Ouch!', pv.x, pv.y - 18, '#FF8A3D'); }
  if (o.police) addHeat(clamp(sp / 260, 0.1, 0.5), 'ram');
  else addHeat(clamp(sp / 420, 0.07, 0.33) * (o.parked ? 0.6 : 1), 'crash');
}

/* ---- arrest and respawn */
function nearestSafe(x, y) { let b = SAFE[0], bd = 1e9; for (const s of SAFE) { const d = hyp(s.x - x, s.y - y); if (d < bd) { bd = d; b = s; } } return b; }
function startCaught(reason) {
  if (G.caught || G.phase !== 'play') return;
  const lose = reason === 'ko' ? Math.min(G.cash, Math.round(G.cash * 0.1)) : Math.min(G.cash, Math.max(40, Math.round(G.cash * 0.2)));
  G.cash -= lose;
  G.caught = { t: 0, reason, lose };
  if (G.job) failJob(reason === 'ko' ? 'Knocked out' : 'Caught by the police', true);
  arcRef.sfx.tone(300, 0.5, { type: 'sawtooth', slide: 90, vol: 0.2 });
  if (pl.veh) leaveCar(true);
}
function respawnAtSafe() {
  const s = nearestSafe(pl.x, pl.y);
  pl.x = s.x; pl.y = s.y; pl.vx = pl.vy = 0; pl.hp = 100; CAM.cdist = 120; pl.inv = 2; G.heat = 0; G.arrest = 0; G.unseen = 0;
  for (const v of V) if (v.ai && v.ai.kind === 'chase') releaseCop(v);
  let have = false;
  for (const v of V) if (hyp(v.x - s.x, v.y - s.y) < 170 && !v.wreck && v.type !== 'police') have = true;
  if (!have) starterCar(s);
  G.camX = pl.x; G.camY = pl.y;
  banner('Safehouse', s.name, 2000, '#38D6B8');
}
function starterCar(s) {
  const R = YR[s.j], off = R.blvd ? 76 : 41;
  const x = XC[s.i] + (s.sx ? 1 : -1) * (XR[s.i].hw + 84), y = YC[s.j] + (s.sy ? 1 : -1) * off;
  const v = mkVeh('hatch', x, y, s.sy ? PI : 0, { parked: true, col: '#e1a41a' });
  v.c.hb = true; v.driver = false; v.mine = true;
  return v;
}

/* ---- vehicles in and out */
function startHum(v) {
  stopHum();
  pl.hum = arcRef.sfx.hum(v.type === 'coupe' ? 'sawtooth' : v.type === 'bike' || v.type === 'auto' ? 'square' : 'sawtooth');
}
function stopHum() { if (pl.hum) { pl.hum.stop(); pl.hum = null; } }
function spawnRunner(v) {
  const ca = Math.cos(v.a), sa = Math.sin(v.a);
  const n = nearestNode(v.x, v.y), p = mkPed({ i: n.i, j: n.j, sx: rr() < 0.5 ? 1 : 0, sy: rr() < 0.5 ? 1 : 0 });
  p.x = v.x - sa * (v.T.Wd / 2 + 10); p.y = v.y + ca * (v.T.Wd / 2 + 10);
  p.state = 'flee'; p.t = 2.4; p.fx = -sa; p.fy = ca; p.scared = 5;
}
function tryEnter(pref) {
  let best = pref || null, bd = 1e9;
  if (!pref) for (const v of V) {
    if (v.burnt || (v.wreck && v.wreckT > 1.2) || v.race || v.player) continue;
    const d = hyp(v.x - pl.x, v.y - pl.y);
    if (d < v.T.L / 2 + 28 && d < bd && vSpeed(v) < 170) { bd = d; best = v; }
  }
  if (!best) { arcRef.toast('No car close enough', '', 900); return; }
  const v = best;
  const occupied = v.driver && !v.player && !v.parked;
  if (occupied) {
    spawnRunner(v);
    addHeat(v.police ? 2 : 1.25, 'jack');
    popText(v.police ? 'Police car taken!' : 'Carjacked!', v.x, v.y - 20, '#FF8A3D');
  } else if (G.copDist < 330 && !v.mine) addHeat(0.4, 'borrow');
  pl.veh = v; v.player = true; v.parked = false; v.driver = true; v.ai = null; v.mine = true; v.c.hb = false; v.siren = false; v.c.thr = v.c.brk = v.c.str = 0;
  pl.x = v.x; pl.y = v.y;
  startHum(v);
  arcRef.sfx.tone(260, 0.08, { type: 'square', vol: 0.1 }); arcRef.sfx.tone(200, 0.1, { type: 'square', vol: 0.1, delay: 0.07 });
  G.nearVeh = null;
}
function leaveCar(force) {
  const v = pl.veh; if (!v) return;
  const ca = Math.cos(v.a), sa = Math.sin(v.a);
  let ok = false;
  for (const s of [-1, 1]) {
    const d = v.T.Wd / 2 + 11;
    const x = v.x + sa * d * s, y = v.y - ca * d * s;
    if (!solidAt(x, y)) { pl.x = x; pl.y = y; ok = true; break; }
  }
  if (!ok) { pl.x = v.x; pl.y = v.y; }
  const sp = vSpeed(v);
  pl.vx = v.vx * 0.25; pl.vy = v.vy * 0.25;
  if (sp > 150 && !force) { pl.hp = Math.max(1, pl.hp - Math.min(25, (sp - 140) * 0.1)); pl.inv = 0.8; popText('Rolled out', pl.x, pl.y - 14, '#FF8A3D'); }
  v.player = false; v.c.thr = v.c.brk = 0; v.c.str = 0; v.c.hb = true; v.driver = false; v.parked = true; v.race = false;
  pl.veh = null; stopHum();
  arcRef.sfx.tone(200, 0.08, { type: 'square', vol: 0.09 });
}

/* ---- jobs */
const JT = {
  courier: { name: 'Courier', col: '#FFB736', letter: 'C' },
  fare: { name: 'Fare', col: '#38D6B8', letter: 'F' },
  race: { name: 'Street race', col: '#FF5EA8', letter: 'R' },
  getaway: { name: 'Getaway', col: '#FF5252', letter: 'G' },
};
function placeOffer(o, rx, ry, dmin, dmax) {
  for (let t = 0; t < 60; t++) {
    const i = (rr() * NX) | 0, j = (rr() * NY) | 0, q = corner(i, j, rr() < 0.5 ? 1 : 0, rr() < 0.5 ? 1 : 0);
    const d = hyp(q.x - rx, q.y - ry); if (d < dmin || d > dmax) continue;
    let bad = false;
    for (const k of G.offers) if (k !== o && hyp(k.x - q.x, k.y - q.y) < 220) bad = true;
    for (const s of SAFE) if (hyp(s.x - q.x, s.y - q.y) < 100) bad = true;
    if (bad) continue;
    o.x = q.x; o.y = q.y; return;
  }
  const q = corner((rr() * NX) | 0, (rr() * NY) | 0, 1, 1); o.x = q.x; o.y = q.y;
}
function pickTarget(x, y, dmin, dmax) {
  const od = districtAt(x, y).id;
  for (let t = 0; t < 80; t++) {
    const q = corner((rr() * NX) | 0, (rr() * NY) | 0, rr() < 0.5 ? 1 : 0, rr() < 0.5 ? 1 : 0), d = hyp(q.x - x, q.y - y);
    if (d < dmin || d > dmax) continue;
    if (t < 50 && districtAt(q.x, q.y).id === od) continue;
    return q;
  }
  return corner(7, 7, 1, 1);
}
const jobMult = () => 1 + 0.2 * Math.min(G.chain, 5);

function startJob(o) {
  if (G.job || G.caught) return;
  const type = o.type, need = type !== 'courier';
  const ok = pl.veh && !pl.veh.wreck && (type !== 'fare' || pl.veh.type !== 'bike');
  if (need && !ok) {
    if (G.time - (G.needCarT || -9) > 2.5) { G.needCarT = G.time; banner(type === 'fare' ? 'Fares need a car' : 'Get a vehicle first', type === 'fare' ? 'A scooter will not do. Take a car or rickshaw.' : 'Press F beside a car, then drive into the marker', 2200, JT[type].col); }
    return;
  }
  const D = DIFF[G.diff], j = { type, name: JT[type].name, col: JT[type].col, t: 0, o, crashes: 0, noCar: 0, needCar: need, stage: 'go' };
  if (type === 'courier') {
    const q = pickTarget(o.x, o.y, 900, 2000), dist = hyp(q.x - o.x, q.y - o.y);
    Object.assign(j, { tx: q.x, ty: q.y, tl: (dist / 100 + 24) * D.time, base: Math.round(90 + dist * 0.12), label: 'Deliver the parcel to ' + districtAt(q.x, q.y).name });
    j.tmax = j.tl;
    banner('Parcel picked up', j.label, 2400, j.col);
  } else if (type === 'fare') {
    const q = pickTarget(o.x, o.y, 1000, 2200), dist = hyp(q.x - o.x, q.y - o.y);
    Object.assign(j, { tx: q.x, ty: q.y, tl: (dist / 125 + 24) * D.time, base: Math.round(70 + dist * 0.07), label: 'Drive the passenger to ' + districtAt(q.x, q.y).name });
    j.tmax = j.tl;
    banner('Passenger aboard', 'Smooth and quick earns a tip', 2400, j.col);
  } else if (type === 'getaway') {
    G.heat = Math.max(G.heat, 3.2); G.unseen = 0;
    Object.assign(j, { tx: null, ty: null, base: 420, label: 'Shake the police: break their sight and stay hidden' });
    banner('Getaway', 'Three stars. Lose them!', 2400, j.col);
    arcRef.sfx.tone(660, 0.2, { type: 'square', vol: 0.12 });
  } else if (type === 'race') {
    // route of checkpoints along the road grid
    const n0 = nearestNode(o.x, o.y), cps = [];
    let ci = n0.i, cj = n0.j;
    for (let k = 0; k < 6; k++) {
      for (let t = 0; t < 30; t++) {
        const ni = clamp(ci + ((rr() * 7) | 0) - 3, 0, NX - 1), nj = clamp(cj + ((rr() * 7) | 0) - 3, 0, NY - 1);
        const dd = Math.abs(ni - ci) + Math.abs(nj - cj);
        if (dd >= 2 && dd <= 5 && !cps.some((c) => c.i === ni && c.j === nj) && !(ni === n0.i && nj === n0.j)) { ci = ni; cj = nj; break; }
      }
      cps.push({ i: ci, j: cj, x: XC[ci], y: YC[cj] });
    }
    // rival route: manhattan walk through each checkpoint
    const route = []; let ri = n0.i, rj = n0.j;
    cps.forEach((c, k) => {
      while (ri !== c.i || rj !== c.j) {
        if (ri !== c.i && (rj === c.j || rr() < 0.5)) ri += ri < c.i ? 1 : -1; else rj += rj < c.j ? 1 : -1;
        route.push({ x: XC[ri], y: YC[rj], cp: ri === c.i && rj === c.j ? k : null });
      }
    });
    const start = { x: XC[n0.i], y: YC[n0.j] };
    Object.assign(j, { cps, cp: 0, stage: 'count', cdt: 3.4, base: 350, label: 'Race the rival through 6 checkpoints', tx: cps[0].x, ty: cps[0].y });
    const first = route[0] || cps[0];
    const ang = Math.atan2(first.y - start.y, first.x - start.x);
    const ax = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)), dir = ax ? (Math.cos(ang) >= 0 ? 1 : -1) : (Math.sin(ang) >= 0 ? 1 : -1);
    const lane = ax ? laneCoord('h', n0.j, dir, 0) : laneCoord('v', n0.i, dir, 0);
    const rv = mkVeh('coupe', ax ? start.x - dir * 90 : lane, ax ? lane : start.y - dir * 90, ax ? (dir > 0 ? 0 : PI) : (dir > 0 ? PI / 2 : -PI / 2), { col: '#ff3b8a' });
    rv.race = true; rv.driver = true; rv.vmul = 1;
    rv.ai = { kind: 'rival', route, k: 0, cp: 0, go: false, mul: D.rival, rev: 0, done: false };
    j.rival = rv;
    banner('Street race', 'Get ready', 1800, j.col);
  }
  G.job = j; o.cd = 9999; o.hidden = true;
}
function endJobCleanup(j) {
  if (j.rival) { j.rival.race = false; j.rival.ai = null; j.rival.driver = false; j.rival.parked = true; j.rival.c.hb = true; j.rival.removeLater = true; }
  if (j.o) { j.o.hidden = false; j.o.cd = 25; placeOffer(j.o, pl.x, pl.y, 700, 2600); }
}
function payOut(base, bonus) {
  const mult = jobMult(), total = Math.round((base + bonus) * mult);
  G.cash += total; G.stats.jobs++;
  return { total, mult };
}
function completeJob(msg, sub, base, bonus) {
  const j = G.job; if (!j) return;
  const r = payOut(base, bonus);
  G.chain++; G.chainT = 100;
  banner(msg, money(r.total) + (r.mult > 1 ? '  chain x' + r.mult.toFixed(1) : '') + (sub ? '  ' + sub : ''), 3000, '#38D6B8');
  popText('+' + money(r.total), pl.x, pl.y - 22, '#7dff9b');
  sfxCash();
  for (let i = 0; i < 24; i++) { const a = rr() * TAU, s = 60 + rr() * 140; emit('cash', pl.x, pl.y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.9 + rr() * 0.5, 2 + rr() * 2, rr() < 0.5 ? '#7dff9b' : '#FFB736', 220); }
  endJobCleanup(j); G.job = null;
}
function failJob(why, quiet) {
  const j = G.job; if (!j) return;
  G.chain = 0; G.chainT = 0;
  if (!quiet) banner('Job failed', why, 2600, '#FF5252');
  arcRef.sfx.tone(240, 0.3, { type: 'sawtooth', slide: 110, vol: 0.16 });
  endJobCleanup(j); G.job = null;
}

function updateJob(dt) {
  const j = G.job; if (!j) return;
  j.t += dt;
  if (j.needCar) {
    if (pl.veh && !pl.veh.wreck) j.noCar = 0; else { j.noCar += dt; if (j.noCar > 12) { failJob('You left the car behind'); return; } }
  }
  const dTarget = j.tx != null ? hyp(pl.x - j.tx, pl.y - j.ty) : 1e9;
  if (j.type === 'courier') {
    j.tl -= dt; if (j.tl <= 0) { failJob('Out of time'); return; }
    if (dTarget < 42) { const f = j.tl / j.tmax; completeJob('Parcel delivered', f > 0.4 ? 'fast!' : '', j.base, Math.round(j.base * 0.45 * f)); }
  } else if (j.type === 'fare') {
    j.tl -= dt; if (j.tl <= 0) { failJob('The passenger got out'); return; }
    if (dTarget < 44 && pl.veh) {
      const f = j.tl / j.tmax, comfort = Math.max(0, 1 - 0.28 * j.crashes);
      const tip = Math.round(j.base * 0.7 * f * comfort);
      completeJob('Passenger dropped off', tip > 0 ? 'tip ' + money(tip) : 'no tip', j.base, tip);
    }
  } else if (j.type === 'getaway') {
    if (j.t > 4 && G.heat < 0.7 && G.copDist > 340) completeJob('Lost them', '', j.base, Math.round(j.t < 60 ? 80 : 0));
  } else if (j.type === 'race') {
    const rv = j.rival;
    if (j.stage === 'count') {
      j.cdt -= dt;
      const n = Math.ceil(j.cdt);
      if (n !== j.lastN && n > 0) { j.lastN = n; arcRef.sfx.tone(520, 0.12, { type: 'square', vol: 0.14 }); banner(String(n), 'Race starts', 900, j.col); }
      if (j.cdt <= 0) { j.stage = 'race'; if (rv && rv.ai) rv.ai.go = true; banner('GO!', '', 900, '#38D6B8'); arcRef.sfx.tone(880, 0.3, { type: 'square', vol: 0.16 }); }
    } else {
      const cp = j.cps[j.cp];
      if (cp && hyp(pl.x - cp.x, pl.y - cp.y) < 56) {
        j.cp++; arcRef.sfx.tone(700 + j.cp * 60, 0.12, { type: 'triangle', vol: 0.15 });
        if (j.cp >= j.cps.length) { completeJob('You won the race', '', j.base, 60); return; }
        j.tx = j.cps[j.cp].x; j.ty = j.cps[j.cp].y; popText('Checkpoint ' + j.cp, pl.x, pl.y - 20, '#FF5EA8');
      }
      if (rv && rv.ai && rv.ai.done) { failJob('The rival got there first'); return; }
      if (rv && rv.stuck > 3.2 && rv.ai) { const a = rv.ai, wp = a.route[Math.min(a.k, a.route.length - 1)]; if (wp) { rv.x = wp.x - Math.cos(rv.a) * 30; rv.y = wp.y - Math.sin(rv.a) * 30; rv.vx = rv.vy = 0; rv.stuck = 0; } }
      j.tx = j.cps[Math.min(j.cp, j.cps.length - 1)].x; j.ty = j.cps[Math.min(j.cp, j.cps.length - 1)].y;
    }
  }
}

/* ---- pickups */
const PK = [];
function managePickups() {
  for (let i = PK.length - 1; i >= 0; i--) if (hyp(PK[i].x - G.fx, PK[i].y - G.fy) > 1300) PK.splice(i, 1);
  if (PK.length >= 8) return;
  for (let t = 0; t < 6; t++) {
    const a = rr() * TAU, d = 220 + rr() * 800, n = nearestNode(G.fx + Math.cos(a) * d, G.fy + Math.sin(a) * d);
    const q = corner(n.i, n.j, rr() < 0.5 ? 1 : 0, rr() < 0.5 ? 1 : 0);
    if (solidAt(q.x, q.y) || inView(q.x, q.y, 0)) continue;
    PK.push({ x: q.x, y: q.y, v: 15 + ((rr() * 6) | 0) * 7, s: rr() * 6 }); return;
  }
}

/* ---- heat, police, arrest */
function updateHeat(dt) {
  G.copDist = copDist();
  const prev = stars();
  if (G.heat > 0) {
    if (G.copDist < 440) G.unseen = 0; else G.unseen += dt;
    const need = G.heat < 1 ? 3 : DIFF[G.diff].decay;
    if (G.unseen > need) G.heat -= (G.heat < 1 ? 0.35 : 0.2) * dt;
    if (G.heat < 0.02) G.heat = 0;
  }
  if (stars() < prev && G.heat >= 0) { if (G.heat === 0 || stars() < prev) banner(stars() === 0 ? 'Heat is off' : stars() + (stars() === 1 ? ' star' : ' stars'), 'You slipped away', 1600, '#38D6B8'); }
  const st = stars(), D = DIFF[G.diff];
  G.bfsT -= dt;
  if (st >= 1 && G.bfsT <= 0) { bfsField(pl.x, pl.y); G.bfsT = 0.5; }
  let chasers = 0;
  for (let i = 0; i < V.length; i++) {
    const v = V[i]; if (!v.police || v.wreck || v.player) continue;
    const d = hyp(v.x - pl.x, v.y - pl.y);
    if (st >= 1) {
      if ((!v.ai || v.ai.kind !== 'chase') && d < 1100 && !v.race) startChase(v);
      if (v.ai && v.ai.kind === 'chase') { v.ai.mul = (0.9 + 0.045 * st) * D.police; chasers++; if (d > 1500) v.remove = true; }
    } else if (v.ai && v.ai.kind === 'chase') releaseCop(v);
  }
  const target = st >= 1 ? clamp([0, 2, 3, 4, 6, 8][st] + D.count, 1, 9) : 0;
  G.copCd -= dt;
  if (chasers < target && G.copCd <= 0) { if (spawnCop()) G.copCd = Math.max(0.5, 1.8 - 0.25 * st); else G.copCd = 0.3; }
  // arrest
  if (G.caught) return;
  let nearC = 0, nearAny = 1e9;
  for (let i = 0; i < V.length; i++) { const v = V[i]; if (v.police && !v.wreck && !v.player && v.ai && v.ai.kind === 'chase') { const d = hyp(v.x - pl.x, v.y - pl.y); if (d < nearAny) nearAny = d; if (d < 56) nearC++; } }
  const pv = pl.veh, psp = pv ? vSpeed(pv) : hyp(pl.vx, pl.vy);
  let cond = false;
  if (st >= 1) {
    if (!pv && nearAny < 46) cond = true;
    else if (pv && pv.wreck && nearAny < 62) cond = true;
    else if (pv && psp < 38 && nearC >= 2) cond = true;
  }
  G.arrest = cond ? G.arrest + dt / 1.15 : Math.max(0, G.arrest - dt * 1.6);
  if (G.arrest >= 1) startCaught('busted');
}

/* ---- the player */
function updatePlayer(dt) {
  const inp = arcRef.input;
  if (pl.inv > 0) pl.inv -= dt;
  if (G.caught) return;
  const arc = arcRef, gmode = arc.touchMode && arc.touchStyle !== 'pads', tiltM = arc.touchMode && arc.touchStyle === 'tilt';
  const tap = inp.tap(), swipe = inp.swipe();
  if (inp.hit('KeyF')) { if (pl.veh) leaveCar(false); else tryEnter(); }
  else if (tap && gmode && !G.mapOpen) {
    if (pl.veh) { if (vSpeed(pl.veh) < 40 || pl.veh.wreck) leaveCar(false); else G.brakeUntil = G.time + 0.6; }
    else tapEnter(tap);
  }
  if (swipe && gmode) { if (pl.veh) { if (swipe.dir === 'up') G.hornReq = 0.3; } else G.dashT = 1.2; }
  G.hornReq -= dt; G.dashT -= dt;
  const horn = inp.down('KeyH') || G.hornReq > 0;
  G.hornCd -= dt;
  if (!pl.veh) CAM.yaw += ((inp.down('KeyE') ? 1 : 0) - (inp.down('KeyQ') ? 1 : 0)) * 1.9 * dt;
  if (horn && G.hornCd <= 0) {
    G.hornCd = 0.27; const s = arcRef.sfx;
    s.tone(392, 0.24, { type: 'square', vol: 0.13 }); s.tone(494, 0.24, { type: 'square', vol: 0.1 });
    if (pl.veh) pl.veh.horn = 0.25;
    for (const p of PD) if (hyp(p.x - pl.x, p.y - pl.y) < 150 && p.state === 'walk') { p.state = 'flee'; p.t = 1.1; const d = hyp(p.x - pl.x, p.y - pl.y) || 1; p.fx = (p.x - pl.x) / d; p.fy = (p.y - pl.y) / d; }
  }
  if (pl.veh) {
    const v = pl.veh, ax = inp.axis(), c = v.c;
    if (gmode) {
      const brakeIn = ax.y > 0.42 && ax.y > Math.abs(ax.x) * 0.6, pulse = G.time < G.brakeUntil, boost = ax.y < -0.45 && !tiltM;
      if (brakeIn || pulse) { c.thr = 0; c.brk = brakeIn ? clamp(ax.y, 0.6, 1) : 0.9; }
      else { c.brk = 0; c.thr = boost ? 1 : (v.f < v.T.vmax * 0.66 ? 1 : 0.1); }
    } else { c.thr = Math.max(0, -ax.y); c.brk = Math.max(0, ax.y); }
    c.str = lerp(c.str, ax.x, Math.min(1, dt * 9));
    c.hb = inp.down('Space');
    pl.x = v.x; pl.y = v.y; pl.a = v.a;
    if (pl.hum) {
      const sp = vSpeed(v), base = v.type === 'bike' ? 70 : v.type === 'coupe' ? 62 : v.type === 'van' ? 42 : v.type === 'auto' ? 52 : 50;
      pl.hum.set(base + sp * (v.type === 'coupe' ? 0.28 : 0.2) + c.thr * 14, v.wreck ? 0 : 0.045 + 0.05 * Math.max(c.thr, sp / v.T.vmax * 0.6));
    }
    if (v.wreck && v.wreckT > 5.4) { leaveCar(true); pl.hp = Math.max(1, pl.hp - 25); }
    else if (v.wreck && v.wreckT > 1.5 && !v.burnt) { pl.hp -= 9 * dt; if (pl.hp <= 0) { pl.hp = 1; startCaught('ko'); } }
  } else {
    const ax = inp.axis();
    let wx, wy, m;
    if (tiltM) {
      const hold = inp.gesture.active || inp.pointer.down;
      pl.a = wrapA(pl.a + ax.x * 2.4 * dt);
      m = hold ? 1 : 0; wx = Math.cos(pl.a) * m; wy = Math.sin(pl.a) * m; pl.fwdK = m;
    } else {
      const fx = Math.cos(CAM.yaw), fy = Math.sin(CAM.yaw), fwd = -ax.y, side = ax.x;
      wx = fx * fwd - fy * side; wy = fy * fwd + fx * side;
      m = hyp(wx, wy); if (m > 1) { wx /= m; wy /= m; m = 1; }
      pl.fwdK = fwd > 0 ? clamp(fwd / Math.max(0.4, m), 0, 1) : 0;
    }
    const sprint = inp.down('ShiftLeft', 'ShiftRight', 'Space') || G.dashT > 0;
    pl.sprint = sprint && m > 0.1;
    const sp = sprint ? 165 : 98;
    pl.vx = lerp(pl.vx, wx * sp, Math.min(1, dt * 12)); pl.vy = lerp(pl.vy, wy * sp, Math.min(1, dt * 12));
    pl.moving = m > 0.1;
    if (pl.moving) { if (!tiltM) pl.a = Math.atan2(wy, wx); pl.step += dt * (sprint ? 16 : 10); }
    pl.x += pl.vx * dt; pl.y += pl.vy * dt;
    for (let it = 0; it < 2; it++) if (circleSolid(pl.x, pl.y, 5.5)) { pl.x += hit.nx * hit.pen; pl.y += hit.ny * hit.pen; }
    // cars as obstacles, and as danger
    for (let i = 0; i < V.length; i++) {
      const v = V[i]; if (Math.abs(v.x - pl.x) > 60 || Math.abs(v.y - pl.y) > 60) continue;
      const ca = Math.cos(v.a), sa = Math.sin(v.a), spd = vSpeed(v);
      for (let k = 0; k < v.T.circ.length; k++) {
        const o = v.T.circ[k], cx = v.x + ca * o, cy = v.y + sa * o, dx = pl.x - cx, dy = pl.y - cy, rs = v.T.r + 5.5, d2 = dx * dx + dy * dy;
        if (d2 < rs * rs) {
          const d = Math.sqrt(d2) || 0.1;
          pl.x += dx / d * (rs - d); pl.y += dy / d * (rs - d);
          if (spd > 55 && pl.inv <= 0) {
            const dmg = Math.min(32, spd * 0.09); pl.hp -= dmg; pl.inv = 1.2; pl.vx += v.vx * 0.5; pl.vy += v.vy * 0.5;
            popText('Ow!', pl.x, pl.y - 14, '#FF8A3D'); arcRef.sfx.tone(180, 0.12, { type: 'triangle', slide: 90, vol: 0.18 });
            if (!arcRef.reducedMotion) G.shake = Math.max(G.shake, 5);
            if (v.player) addHeat(0.1, 'hit');
            if (pl.hp <= 0) { pl.hp = 1; startCaught('ko'); }
          }
        }
      }
    }
    pl.x = clamp(pl.x, 30, W - 30); pl.y = clamp(pl.y, 30, W - 30);
    if (pl.hp < 100 && !G.caught) pl.hp = Math.min(100, pl.hp + 2.5 * dt);
  }
  // cash pickups
  for (let i = PK.length - 1; i >= 0; i--) {
    const k = PK[i];
    if (hyp(k.x - pl.x, k.y - pl.y) < (pl.veh ? 28 : 20)) {
      PK.splice(i, 1); G.cash += k.v; popText('+' + money(k.v), k.x, k.y - 8, '#7dff9b'); sfxCash();
      for (let q = 0; q < 8; q++) emit('cash', k.x, k.y, (rr() - 0.5) * 120, -rr() * 90, 0.7, 2.4, '#7dff9b', 220);
    }
  }
  // markers
  for (const o of G.offers) {
    if (o.hidden) continue;
    if (o.cd > 0) { o.cd -= dt; continue; }
    if (hyp(pl.x - o.x, pl.y - o.y) < 34) startJob(o);
  }
  // near car prompt
  G.nearVeh = null;
  if (!pl.veh) {
    let bd = 1e9;
    for (const v of V) { if (v.burnt || v.player || v.race || (v.wreck && v.wreckT > 1.2)) continue; const d = hyp(v.x - pl.x, v.y - pl.y); if (d < v.T.L / 2 + 28 && d < bd && vSpeed(v) < 170) { bd = d; G.nearVeh = v; } }
  }
}

/* ---- ambient world: fire, smoke, peds, spawns */
function updateVehFx(v, dt) {
  if (v.horn > 0) v.horn -= dt;
  if (v.wreck) {
    v.wreckT += dt;
    if (v.wreckT > 1.4 && !v.burnt) {
      if (rr() < dt * 26) emit('fire', v.x + (rr() - 0.5) * v.T.L * 0.6, v.y + (rr() - 0.5) * v.T.Wd * 0.6, (rr() - 0.5) * 20, -20, 0.5 + rr() * 0.3, 5 + rr() * 5, 'rgba(255,150,40,1)');
      if (rr() < dt * 14) emit('smoke', v.x, v.y, (rr() - 0.5) * 30, -30, 1.6, 9 + rr() * 8, 'rgba(40,40,40,.55)');
    }
    if (v.wreckT > 5 && !v.burnt) { v.burnt = true; for (let i = 0; i < 14; i++) emit('smoke', v.x, v.y, (rr() - 0.5) * 80, (rr() - 0.5) * 80, 1.6, 12, 'rgba(30,30,30,.6)'); }
    v.c.hb = true;
  } else if (v.hp < v.maxhp * 0.5) {
    v.smoke -= dt;
    if (v.smoke <= 0) {
      v.smoke = v.hp < v.maxhp * 0.25 ? 0.07 : 0.16;
      const ca = Math.cos(v.a), sa = Math.sin(v.a);
      emit('smoke', v.x + ca * v.T.L * 0.32, v.y + sa * v.T.L * 0.32, (rr() - 0.5) * 16 - v.vx * 0.1, (rr() - 0.5) * 16 - v.vy * 0.1, 1.1, 5 + rr() * 5, v.hp < v.maxhp * 0.25 ? 'rgba(30,30,30,.6)' : 'rgba(150,150,150,.5)');
    }
  }
}

function manageSpawns() {
  const D = DIFF[G.diff], touch = touchish();
  const tTraffic = Math.round(24 * D.traffic * (touch ? 0.72 : 1)), tParked = touch ? 14 : 18, tPed = touch ? 26 : 38;
  let nT = 0, nP = 0, nPol = 0;
  for (let i = V.length - 1; i >= 0; i--) {
    const v = V[i], d = hyp(v.x - G.fx, v.y - G.fy), vis = inView(v.x, v.y, 80);
    if (v.player || (G.job && G.job.rival === v)) { continue; }
    let rm = false;
    if (v.remove) rm = true;
    else if (v.removeLater) rm = !vis;
    else if (v.burnt || v.wreck) rm = d > 1000 || (!vis && d > 700 && v.wreckT > 12);
    else if (v.mine) rm = d > 2300;
    else if (v.parked) rm = d > 1500 || (!vis && d > 1050 && rr() < 0.3);
    else if (v.ai && v.ai.kind === 'chase') rm = d > 1600;
    else rm = d > 1300 || (!vis && v.stuck > 5 && v.blocked > 5) || (!vis && d > 900 && rr() < 0.15);
    if (rm) { V.splice(i, 1); continue; }
    if (v.ai && v.ai.kind === 'traffic') { if (v.police) nPol++; else nT++; } else if (v.parked && !v.mine) nP++;
  }
  for (let i = PD.length - 1; i >= 0; i--) { const p = PD[i], d = hyp(p.x - G.fx, p.y - G.fy); if (d > 1250 || (d > 800 && !inView(p.x, p.y, 40) && rr() < 0.1)) PD.splice(i, 1); }
  if (nT < tTraffic) spawnTraffic(pickTrafficType(), 560, 1050);
  if (nP < tParked) spawnParked(pickParkedType(), 300, 1050);
  if (nPol < 2 && G.phase === 'play' && stars() === 0 && rr() < 0.2) spawnTraffic('police', 700, 1100);
  if (PD.length < tPed) { spawnPedAt(330, 950); }
  managePickups();
}
function populate() {
  G.initial = true;
  const touch = touchish(), D = DIFF[G.diff];
  for (let i = 0; i < 160 && V.filter((v) => v.ai && v.ai.kind === 'traffic' && !v.police).length < Math.round(24 * D.traffic * (touch ? 0.72 : 1)); i++) spawnTraffic(pickTrafficType(), 60, 1000);
  for (let i = 0; i < 120 && V.filter((v) => v.parked && !v.mine).length < (touch ? 14 : 18); i++) spawnParked(pickParkedType(), 120, 1000);
  for (let i = 0; i < 80 && PD.length < (touch ? 26 : 38); i++) spawnPedAt(60, 900);
  for (let i = 0; i < 2; i++) spawnTraffic('police', 300, 1000);
  G.initial = false;
}

/* ================================================================ world update, camera */
const nightOf = (h) => { const s = Math.sin(PI * (h - 6) / 12); return clamp((0.18 - s) / 0.5, 0, 1); };
const duskOf = (h) => { const s = Math.sin(PI * (h - 6) / 12); return Math.max(0, 1 - Math.abs(s - 0.03) / 0.3); };
const hourText = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60), ap = hh >= 12 ? 'PM' : 'AM', h12 = hh % 12 === 0 ? 12 : hh % 12; return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap; };
const RANKS = [[0, 'Pavement Rookie'], [500, 'Rickshaw Runner'], [1500, 'Street Hustler'], [3000, 'Saffron Boss'], [6000, 'City Legend']];
const rankOf = (cash) => { let r = RANKS[0]; for (const k of RANKS) if (cash >= k[0]) r = k; return r[1]; };
const nextRank = (cash) => { for (const k of RANKS) if (cash < k[0]) return k; return null; };

function updateWorld(dt, playing) {
  G.time += dt; G.hour = (G.hour + dt / 15) % 24;
  if (playing) { G.fx = pl.x; G.fy = pl.y; } else {
    G.attractT += dt;
    const L = 3300, t = (G.attractT * 62) % (L * 2), u = t < L ? t : L * 2 - t;
    G.attX = 900 + u; G.attY = YC[6] - 24 + Math.sin(G.attractT * 0.2) * 26; G.fx = G.attX; G.fy = G.attY;
  }
  G.popCd -= dt;
  if (G.popCd <= 0) { G.popCd = 0.25; manageSpawns(); }
  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    if (v.ai) { const k = v.ai.kind; if (k === 'traffic') aiTraffic(v, dt); else if (k === 'chase') aiChase(v, dt); else if (k === 'rival') aiRival(v, dt); }
    if (v.remove) continue;
    const moving = v.player || !v.parked || v.vx * v.vx + v.vy * v.vy > 0.25;
    if (!moving) { v.f = 0; v.l = 0; updateVehFx(v, dt); continue; }
    stepVeh(v, dt);
    collideWorld(v);
    v.x = clamp(v.x, 24, W - 24); v.y = clamp(v.y, 24, W - 24);
    updateVehFx(v, dt);
  }
  for (let i = 0; i < V.length; i++) {
    const a = V[i];
    for (let j = i + 1; j < V.length; j++) {
      const b = V[j];
      if (Math.abs(a.x - b.x) > 80 || Math.abs(a.y - b.y) > 80) continue;
      if (!a.player && !b.player && a.parked && b.parked && a.vx * a.vx + a.vy * a.vy < 1 && b.vx * b.vx + b.vy * b.vy < 1) continue;
      collideVeh(a, b);
    }
  }
  for (let i = 0; i < PD.length; i++) updatePed(PD[i], dt);
  updateParts(dt);
  for (let i = G.floaters.length - 1; i >= 0; i--) { const f = G.floaters[i]; f.t += dt; f.y -= 22 * dt; if (f.t > 1.4) G.floaters.splice(i, 1); }
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.max) G.banner = null; }
}

function updatePlay(dt) {
  const arc = arcRef;
  if (arc.input.hit('KeyM')) { G.mapOpen = !G.mapOpen; arc.sfx.tone(G.mapOpen ? 520 : 400, 0.06, { type: 'triangle', vol: 0.1 }); }
  if (G.mapOpen) { if (arc.input.tap()) { G.mapOpen = false; } updateCamera(dt, true); return; }
  if (G.caught) {
    G.caught.t += dt;
    if (G.caught.t > 2.6 && !G.caught.done) { G.caught.done = true; respawnAtSafe(); }
    if (G.caught.t > 3.4) G.caught = null;
  }
  updatePlayer(dt);
  updateWorld(dt, true);
  if (!G.caught) { updateJob(dt); updateHeat(dt); }
  G.hintT += dt; if (G.tipT > 0) G.tipT -= dt;
  if (G.chainT > 0) { G.chainT -= dt; if (G.chainT <= 0) G.chain = 0; }
  if (G.mode === 'hustle') {
    G.hustleLeft -= dt;
    if (G.hustleLeft <= 0) { endHustle(); return; }
    if (!G.warned && G.hustleLeft < 30) { G.warned = true; banner('30 seconds left', 'Cash in what you can', 2200, '#FFB736'); }
  }
  // sirens
  let cd = 1e9;
  for (const v of V) if (v.siren && !v.wreck) { const d = hyp(v.x - pl.x, v.y - pl.y); if (d < cd) cd = d; }
  G.sirenCd -= dt;
  if (cd < 800 && G.sirenCd <= 0) {
    G.sirenT = !G.sirenT; G.sirenCd = 0.38;
    const vol = clamp(1 - cd / 800, 0.02, 1) * 0.1;
    arc.sfx.tone(G.sirenT ? 650 : 900, 0.4, { type: 'sine', slide: G.sirenT ? 900 : 650, vol });
  }
  // district toast
  const d = districtAt(pl.x, pl.y);
  if (G.district !== d) { const first = !G.district; G.district = d; if (!first) arc.toast(d.name, 'Entering', 1700); }
  // prompt
  const t = arc.touchMode, key = t ? (arc.touchStyle === 'pads' ? 'Tap Car' : 'Tap') : 'Press F';
  G.prompt = '';
  if (!G.caught) {
    if (!pl.veh && G.nearVeh) { const nv = G.nearVeh; G.prompt = key + ': ' + (nv.driver && !nv.parked ? 'carjack the ' : 'take the ') + nv.T.name.toLowerCase(); }
    else if (pl.veh && vSpeed(pl.veh) < 40 && !pl.veh.wreck) G.prompt = key + ': get out';
    else if (pl.veh && pl.veh.wreck) G.prompt = key + ': get out now';
  }
  updateCamera(dt, true);
}

function endHustle() {
  if (G.phase !== 'play') return;
  G.phase = 'over'; G.active = false;
  stopHum();
  const arc = arcRef;
  arc.sfx.tone(520, 0.2, { type: 'triangle', vol: 0.15 }); arc.sfx.tone(780, 0.3, { type: 'triangle', vol: 0.15, delay: 0.18 });
  arc.over({
    score: Math.round(G.cash), scoreLabel: 'Cash', eyebrow: 'Time up', title: 'Ten minute hustle',
    html: '<p>' + esc(rankOf(G.cash)) + '. ' + G.stats.jobs + (G.stats.jobs === 1 ? ' job' : ' jobs') + ' done, ' + G.stats.crashes + ' crashes.</p>',
    again: 'Hustle again',
  });
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function resetGame() {
  V.length = 0; PD.length = 0; PK.length = 0; for (const p of PART) p.on = false; SK.n = 0; stopHum();
  G.phase = 'play'; G.cash = 0; G.heat = 0; G.unseen = 0; G.arrest = 0; G.chain = 0; G.chainT = 0; G.job = null; G.caught = null; G.mapOpen = false;
  G.banner = null; G.floaters.length = 0; G.stats = { jobs: 0, crashes: 0 }; G.hustleLeft = 600; G.warned = false; G.district = null; G.copDist = 1e9; G.copCd = 0;
  G.hour = 18.2; G.offers = []; G.prompt = ''; G.nearVeh = null;
  pl.hp = 100; pl.inv = 0; pl.veh = null; pl.vx = pl.vy = 0; pl.a = 0.3;
  const s = SAFE[0]; pl.x = s.x + 30; pl.y = s.y + 6;
  G.fx = pl.x; G.fy = pl.y; G.camX = pl.x; G.camY = pl.y; G.lookX = G.lookY = 0; CAM.yaw = START_YAW; CAM.cdist = 120; G.hintT = 0; G.tip = ''; G.tipT = 0; G.brakeUntil = 0; G.hornReq = 0; G.dashT = 0;
  starterCar(s);
  populate();
  const types = ['courier', 'courier', 'courier', 'fare', 'fare', 'race', 'race', 'getaway', 'getaway'];
  types.forEach((t, i) => { const o = { type: t, x: 0, y: 0, cd: 0, hidden: false }; G.offers.push(o); placeOffer(o, pl.x, pl.y, i < 4 ? 260 : 500, i < 4 ? 1100 : 2400); });
  for (let i = 0; i < 6; i++) managePickups();
  banner('Saffron City', arcRef.touchMode ? 'Walk to the car and tap Car. Drive into a glowing marker for a job.' : 'Walk to the yellow car and press F. Drive into a glowing marker for a job.', 5200, '#FFB736');
  arcRef.toast('Marine Parade', 'Entering', 1800);
  G.district = districtAt(pl.x, pl.y);
}

// Tap on a car: the one nearest the tapped spot on the ground, and within reach of the player.
const _tapG = { x: 0, y: 0 };
function tapEnter(tap) {
  groundAt(tap.nx, tap.ny, _tapG);
  let best = null, bd = 1e9;
  for (const v of V) {
    if (v.burnt || v.player || v.race || (v.wreck && v.wreckT > 1.2)) continue;
    if (!(hyp(v.x - pl.x, v.y - pl.y) < v.T.L / 2 + 28 && vSpeed(v) < 170)) continue;
    const d = hyp(v.x - _tapG.x, v.y - _tapG.y);
    if (d < bd) { bd = d; best = v; }
  }
  tryEnter(best);
}

/* ================================================================ HUD */
const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_UI = 'Inter, -apple-system, sans-serif', F_DISP = 'Fraunces, "Times New Roman", serif';
function plate(c, x, y, w, h, r, a) {
  c.fillStyle = 'rgba(10,9,7,' + (a == null ? 0.7 : a) + ')'; rrect(c, x, y, w, h, r == null ? 10 : r); c.fill();
  c.strokeStyle = 'rgba(251,245,236,.14)'; c.lineWidth = 1; c.stroke();
}
function text(c, s, x, y, font, col, align) { c.font = font; c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y); }
function starPath(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rad = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); }
function wrapLines(c, s, maxW, maxLines) {
  const words = s.split(' '), lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '...'; }
  return lines;
}
function bar(c, x, y, w, h, f, col, back) {
  c.fillStyle = back || 'rgba(251,245,236,.12)'; rrect(c, x, y, w, h, h / 2); c.fill();
  if (f > 0.01) { c.fillStyle = col; rrect(c, x, y, Math.max(h, w * clamp(f, 0, 1)), h, h / 2); c.fill(); }
}

const blipSpec = () => {
  const out = [];
  for (const o of G.offers) if (!o.hidden && o.cd <= 0) out.push({ x: o.x, y: o.y, col: JT[o.type].col, ch: JT[o.type].letter, r: 6.5 });
  for (const s of SAFE) out.push({ x: s.x, y: s.y, col: '#38D6B8', ch: 'H', r: 5.5 });
  const j = G.job;
  if (j) {
    if (j.cps) { for (let q = j.cp; q < j.cps.length; q++) out.push({ x: j.cps[q].x, y: j.cps[q].y, col: '#FF5EA8', ch: String(q + 1), r: q === j.cp ? 8 : 5.5, pulse: q === j.cp }); }
    else if (j.tx != null) out.push({ x: j.tx, y: j.ty, col: j.col, ch: '*', r: 8, pulse: true });
  }
  return out;
};

function drawMinimap(c, cx, cy, R, arc) {
  const Rw = arc.touchMode ? 400 : 440, s = R / Rw;
  G.mmA = CAM.yaw;
  const th = -PI / 2 - G.mmA;
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  c.fillStyle = '#10141c'; c.fillRect(cx - R, cy - R, R * 2, R * 2);
  c.translate(cx, cy); c.rotate(th);
  c.save(); c.scale(s * MMK, s * MMK); c.drawImage(mmCv, -pl.x / MMK, -pl.y / MMK); c.restore();
  const edge = R - 9;
  // labels drawn upright: handle by drawing each blip's letter after un-rotating
  for (const b of blipSpec()) {
    let dx = (b.x - pl.x) * s, dy = (b.y - pl.y) * s; const d = hyp(dx, dy);
    if (d > edge) { dx *= edge / d; dy *= edge / d; }
    const pu = b.pulse ? 1 + 0.18 * Math.sin(G.time * 6) : 1;
    c.fillStyle = b.col; c.strokeStyle = '#0c0b09'; c.lineWidth = 1.5; c.beginPath(); c.arc(dx, dy, b.r * pu, 0, TAU); c.fill(); c.stroke();
    c.save(); c.translate(dx, dy); c.rotate(-th); c.fillStyle = '#16130e'; c.font = '700 ' + Math.round(b.r * 1.3) + 'px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.ch, 0, 0.5); c.restore();
  }
  const flash = !arc.reducedMotion && Math.floor(G.time * 4) % 2;
  for (const v of V) {
    if (!v.police || v.wreck) continue;
    let dx = (v.x - pl.x) * s, dy = (v.y - pl.y) * s; const d = hyp(dx, dy);
    if (d > edge) { if (!(v.ai && v.ai.kind === 'chase')) continue; dx *= edge / d; dy *= edge / d; }
    const chase = v.ai && v.ai.kind === 'chase';
    c.fillStyle = chase ? (flash ? '#ff3a3a' : '#4b8bff') : '#8aa0c8'; c.strokeStyle = '#fff'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(dx, dy, chase ? 4.4 : 3, 0, TAU); c.fill(); if (chase) c.stroke();
  }
  c.restore();
  c.save(); c.translate(cx, cy);
  c.fillStyle = '#FBF5EC'; c.strokeStyle = '#0c0b09'; c.lineWidth = 1.6;
  c.save(); c.rotate(wrapA((pl.veh ? pl.veh.a : pl.a) - CAM.yaw)); c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fill(); c.stroke(); c.restore();
  // north marker
  const na = -PI / 2 + th, nr = R - 8;
  c.fillStyle = '#FFB736'; c.font = '700 11px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', Math.cos(na) * nr, Math.sin(na) * nr);
  c.restore();
  const g = c.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
  g.addColorStop(0, 'rgba(10,9,7,0)'); g.addColorStop(1, 'rgba(10,9,7,.55)');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(10,9,7,.9)'; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, R + 1, 0, TAU); c.stroke();
  c.strokeStyle = G.copDist < 440 && stars() > 0 && !arc.reducedMotion ? (flash ? '#ff5252' : '#4b8bff') : '#c9a96e'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
}

const DLABELS = [['Marine Parade', 640, 1700], ['Bandar Docks', 1300, 4300], ['Qila Quarter', 1900, 960], ['Chowk Bazaar', 2900, 2200], ['Malabar Heights', 4260, 1100], ['Navi Business Park', 4100, 3900], ['Lakshmi Nagar', 1850, 3000]];
function drawFullMap(c, arc) {
  const w = arc.w, h = arc.h;
  c.fillStyle = 'rgba(6,5,3,.92)'; c.fillRect(0, 0, w, h);
  const top = 56, bottom = 46, size = Math.min(w - 24, h - top - bottom), s = size / W, ox = (w - size) / 2, oy = top + (h - top - bottom - size) / 2;
  c.save(); c.translate(ox, oy);
  c.fillStyle = '#10141c'; c.fillRect(0, 0, size, size);
  c.drawImage(mmCv, 0, 0, size, size);
  c.strokeStyle = 'rgba(201,169,110,.6)'; c.lineWidth = 2; c.strokeRect(0, 0, size, size);
  c.font = '600 ' + (size > 520 ? 12 : 10) + 'px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const d of DLABELS) { const x = d[1] * s, y = d[2] * s; c.lineWidth = 3; c.strokeStyle = 'rgba(8,7,5,.85)'; c.strokeText(d[0].toUpperCase(), x, y); c.fillStyle = '#FBF5EC'; c.fillText(d[0].toUpperCase(), x, y); }
  for (const b of blipSpec()) {
    const x = b.x * s, y = b.y * s, r = Math.max(5, b.r * 0.95) * (size > 520 ? 1.2 : 1);
    c.fillStyle = b.col; c.strokeStyle = '#0c0b09'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#16130e'; c.font = '700 ' + Math.round(r * 1.3) + 'px ' + F_MONO; c.fillText(b.ch, x, y + 0.5);
  }
  const flash = Math.floor(G.time * 4) % 2;
  for (const v of V) if (v.police && !v.wreck && v.ai && v.ai.kind === 'chase') { c.fillStyle = flash ? '#ff3a3a' : '#4b8bff'; c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.beginPath(); c.arc(v.x * s, v.y * s, 4.5, 0, TAU); c.fill(); c.stroke(); }
  c.save(); c.translate(pl.x * s, pl.y * s); c.rotate((pl.veh ? pl.veh.a : pl.a) + PI / 2);
  c.fillStyle = '#FBF5EC'; c.strokeStyle = '#0c0b09'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke();
  c.restore();
  c.restore();
  text(c, 'CITY MAP', 16, 28, '600 12px ' + F_MONO, '#c9a96e');
  text(c, arc.touchMode ? 'Tap Map to close' : 'Press M to close', w - 16, 28, '600 12px ' + F_MONO, 'rgba(251,245,236,.7)', 'right');
  const leg = [['C', '#FFB736', 'Courier'], ['F', '#38D6B8', 'Fare'], ['R', '#FF5EA8', 'Race'], ['G', '#FF5252', 'Getaway'], ['H', '#38D6B8', 'Safehouse']];
  let lx = Math.max(12, w / 2 - (leg.length * 84) / 2); const ly = h - 22;
  for (const l of leg) { c.fillStyle = l[1]; c.beginPath(); c.arc(lx + 8, ly, 8, 0, TAU); c.fill(); c.fillStyle = '#16130e'; c.font = '700 11px ' + F_MONO; c.textAlign = 'center'; c.fillText(l[0], lx + 8, ly + 0.5); text(c, l[2], lx + 21, ly, '500 12px ' + F_UI, 'rgba(251,245,236,.8)'); lx += 84; }
}

function jobCard(c, x, y, w, arc) {
  const j = G.job, t = arc.touchMode;
  const fs = t ? 13 : 14;
  c.font = '600 ' + fs + 'px ' + F_UI;
  let lines, sub = '', fraction = null, rightTxt = '', rewardTxt = '';
  if (j) {
    lines = wrapLines(c, j.label, w - 24, 2);
    if (j.type === 'courier' || j.type === 'fare') { fraction = j.tl / j.tmax; rightTxt = Math.max(0, Math.ceil(j.tl)) + 's'; rewardTxt = money(j.base * jobMult()); }
    else if (j.type === 'race') { const rv = j.rival && j.rival.ai ? j.rival.ai.cp : 0; sub = j.stage === 'count' ? 'Get ready' : 'Checkpoint ' + Math.min(j.cp + 1, j.cps.length) + '/' + j.cps.length + '   Rival ' + rv + '/' + j.cps.length; rewardTxt = money(j.base * jobMult()); }
    else if (j.type === 'getaway') { const need = G.heat < 1 ? 3 : DIFF[G.diff].decay; fraction = clamp(G.unseen / need, 0, 1); sub = G.copDist < 440 ? 'They can see you' : 'Out of sight'; rewardTxt = money(j.base * jobMult()); }
    if (j.type === 'fare') sub = 'Comfort ' + '★'.repeat(Math.max(0, 3 - j.crashes)) + '☆'.repeat(Math.min(3, j.crashes));
    if (j.needCar && j.noCar > 0.5) sub = 'Get back in a car: ' + Math.max(0, Math.ceil(12 - j.noCar)) + 's';
  } else lines = wrapLines(c, 'No job running. Step into a glowing marker.', w - 24, 2);
  const lh = fs + 4, h = 30 + lines.length * lh + (sub ? 16 : 0) + (fraction != null ? 12 : 0) + (j ? 0 : 20);
  plate(c, x, y, w, h, 12, 0.72);
  c.fillStyle = j ? j.col : '#c9a96e'; c.beginPath(); c.arc(x + 14, y + 16, 4.5, 0, TAU); c.fill();
  text(c, j ? j.name.toUpperCase() : 'JOBS', x + 26, y + 16, '600 11px ' + F_MONO, j ? j.col : '#c9a96e');
  if (G.chain > 0) text(c, 'CHAIN x' + jobMult().toFixed(1), x + w - 12, y + 16, '700 11px ' + F_MONO, '#FFB736', 'right');
  else if (j && rewardTxt) text(c, rewardTxt, x + w - 12, y + 16, '700 12px ' + F_MONO, '#7dff9b', 'right');
  let yy = y + 36;
  c.font = '600 ' + fs + 'px ' + F_UI;
  for (const l of lines) { text(c, l, x + 12, yy, '600 ' + fs + 'px ' + F_UI, '#FBF5EC'); yy += lh; }
  if (sub) { text(c, sub, x + 12, yy, '500 12px ' + F_MONO, 'rgba(251,245,236,.78)'); yy += 16; }
  if (fraction != null) {
    const low = j.type !== 'getaway' && fraction < 0.25;
    bar(c, x + 12, yy - 2, w - 24 - (rightTxt ? 40 : 0), 6, fraction, j.type === 'getaway' ? '#38D6B8' : low ? '#FF5252' : j.col);
    if (rightTxt) text(c, rightTxt, x + w - 12, yy + 1, '700 12px ' + F_MONO, low ? '#FF8A8A' : '#FBF5EC', 'right');
  }
  if (!j) {
    const ch = [['C', '#FFB736', 'Courier'], ['F', '#38D6B8', 'Fare'], ['R', '#FF5EA8', 'Race'], ['G', '#FF5252', 'Getaway']];
    let lx = x + 12; const ly = y + h - 14;
    for (const q of ch) { c.fillStyle = q[1]; c.beginPath(); c.arc(lx + 5, ly, 5, 0, TAU); c.fill(); text(c, q[2], lx + 13, ly, '500 10px ' + F_MONO, 'rgba(251,245,236,.7)'); lx += t ? 54 : 62; }
  }
  return h;
}

function drawHUD(c, arc) {
  const w = arc.w, h = arc.h, t = arc.touchMode, pad = t ? 10 : 14;
  const st = stars();
  // vignette when wanted
  if (st >= 1 && G.copDist < 500) {
    const a = (arc.reducedMotion ? 0.12 : 0.1 + 0.07 * Math.sin(G.time * 7)) * (0.5 + st * 0.15);
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    const flash = !arc.reducedMotion && Math.floor(G.time * 3.5) % 2;
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, flash ? 'rgba(255,40,40,' + (a * 2) + ')' : 'rgba(60,110,255,' + (a * 2) + ')');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  drawLabels(c, arc);
  // cash / stars / bars
  const cw = t ? 148 : 214, ch = t ? 96 : 120, x = pad, y = pad;
  plate(c, x, y, cw, ch, 12, 0.74);
  text(c, money(G.cash), x + 12, y + (t ? 20 : 25), '500 ' + (t ? 22 : 29) + 'px ' + F_DISP, '#FBF5EC');
  if (!t) text(c, rankOf(G.cash).toUpperCase(), x + 12, y + 47, '600 10.5px ' + F_MONO, '#c9a96e');
  const sr = t ? 7 : 9.5, sy = y + (t ? 42 : 65), gap = t ? 19 : 25;
  const flashS = st >= 1 && G.copDist < 440 && !arc.reducedMotion && Math.floor(G.time * 4) % 2;
  for (let i = 0; i < 5; i++) {
    const sx = x + 18 + i * gap, filled = G.heat >= i + 1, part = clamp(G.heat - i, 0, 1);
    starPath(c, sx, sy, sr); c.fillStyle = 'rgba(251,245,236,.12)'; c.fill();
    if (filled || part > 0.04) {
      c.save(); starPath(c, sx, sy, sr); c.clip();
      c.fillStyle = flashS ? '#ff6a5a' : '#FFB736'; c.fillRect(sx - sr, sy - sr, sr * 2 * (filled ? 1 : part), sr * 2); c.restore();
    }
    starPath(c, sx, sy, sr); c.strokeStyle = filled ? 'rgba(255,183,54,.9)' : 'rgba(251,245,236,.3)'; c.lineWidth = 1; c.stroke();
  }
  const by = y + (t ? 60 : 87);
  text(c, 'HP', x + 12, by + 3, '600 10px ' + F_MONO, 'rgba(251,245,236,.7)');
  bar(c, x + 38, by, cw - 52, t ? 6 : 7, pl.hp / 100, pl.hp < 30 ? '#FF5252' : '#7dff9b');
  const v = pl.veh;
  text(c, 'CAR', x + 12, by + (t ? 15 : 17), '600 10px ' + F_MONO, 'rgba(251,245,236,.7)');
  bar(c, x + 38, by + (t ? 12 : 14), cw - 52, t ? 6 : 7, v ? v.hp / v.maxhp : 0, v && v.hp / v.maxhp < 0.3 ? '#FF5252' : '#FFB736');

  // clock and hustle timer
  if (!t) {
    const tw = G.mode === 'hustle' ? 168 : 138, tx = w / 2 - tw / 2;
    plate(c, tx, pad, tw, 46, 12, 0.7);
    if (G.mode === 'hustle') {
      const m = Math.max(0, G.hustleLeft), mm = Math.floor(m / 60), ss = Math.floor(m % 60);
      text(c, 'HUSTLE', w / 2, pad + 13, '600 10px ' + F_MONO, G.hustleLeft < 30 ? '#FF8A8A' : '#c9a96e', 'center');
      text(c, mm + ':' + (ss < 10 ? '0' : '') + ss, w / 2, pad + 32, '500 22px ' + F_DISP, G.hustleLeft < 30 && Math.floor(G.time * 2) % 2 ? '#FF8A8A' : '#FBF5EC', 'center');
    } else {
      text(c, 'FREE ROAM', w / 2, pad + 13, '600 10px ' + F_MONO, '#c9a96e', 'center');
      text(c, hourText(G.hour), w / 2, pad + 32, '500 20px ' + F_DISP, '#FBF5EC', 'center');
    }
  }
  // minimap
  const R = t ? 56 : 84;
  const mcx = t ? w - pad - R - 2 : w - pad - R - 4, mcy = t ? pad + R + 2 : h - pad - R - 30;
  drawMinimap(c, mcx, mcy, R, arc);
  const dn = G.district ? G.district.name : '';
  c.font = '600 ' + (t ? 10 : 11) + 'px ' + F_MONO;
  const dw = Math.min(R * 2 + 8, c.measureText(dn.toUpperCase()).width + 18);
  plate(c, mcx - dw / 2, mcy + R + 6, dw, 20, 10, 0.72);
  text(c, dn.toUpperCase(), mcx, mcy + R + 16.5, '600 ' + (t ? 9.5 : 10.5) + 'px ' + F_MONO, '#FBF5EC', 'center');
  if (t) {
    // clock lives under the minimap on touch
    let lbl = G.mode === 'hustle' ? (() => { const m = Math.max(0, G.hustleLeft); return Math.floor(m / 60) + ':' + (Math.floor(m % 60) < 10 ? '0' : '') + Math.floor(m % 60); })() : hourText(G.hour);
    const hw2 = G.mode === 'hustle' ? 92 : 80;
    plate(c, mcx - hw2 / 2, mcy + R + 30, hw2, 22, 10, 0.72);
    text(c, G.mode === 'hustle' ? 'TIME ' + lbl : lbl, mcx, mcy + R + 41.5, '600 11px ' + F_MONO, G.mode === 'hustle' && G.hustleLeft < 30 ? '#FF8A8A' : '#FBF5EC', 'center');
  }
  // job card
  if (t) { const jw = Math.max(170, w - pad * 2 - (R * 2 + 14)); jobCard(c, pad, y + ch + 6, jw, arc); }
  else { const jw = 292; jobCard(c, w - pad - jw, pad, jw, arc); }
  // speed / vehicle (desktop, and on touch when the stick is not in the corner)
  if (!t || arc.touchStyle !== 'pads') {
    plate(c, pad, h - pad - 54, 190, 54, 12, 0.7);
    const sp = v ? Math.round(vSpeed(v) * 0.36) : 0;
    text(c, v ? v.T.name.toUpperCase() : 'ON FOOT', pad + 12, h - pad - 38, '600 10px ' + F_MONO, '#c9a96e');
    text(c, v ? String(sp) : (pl.moving ? 'WALKING' : 'STANDING'), pad + 12, h - pad - 18, '500 ' + (v ? 26 : 16) + 'px ' + F_DISP, '#FBF5EC');
    if (v) text(c, 'km/h', pad + 12 + c.measureText(String(sp)).width + 8, h - pad - 14, '600 11px ' + F_MONO, 'rgba(251,245,236,.65)');
  }
  // prompt
  if (G.prompt && !G.mapOpen) {
    c.font = '600 14px ' + F_UI;
    const pw = c.measureText(G.prompt).width + 28, py = t ? h - (arc.hudPad ? arc.hudPad().bottom : 188) - 18 : h - pad - 30;
    plate(c, w / 2 - pw / 2, py - 18, pw, 36, 18, 0.78);
    text(c, G.prompt, w / 2, py, '600 14px ' + F_UI, '#FFB736', 'center');
  }
  // arrest meter
  if (G.arrest > 0.04) {
    const aw = 180, ax = w / 2 - aw / 2, ay = h * 0.62;
    plate(c, ax - 10, ay - 22, aw + 20, 40, 12, 0.78);
    text(c, 'BEING ARRESTED', w / 2, ay - 9, '700 10px ' + F_MONO, '#FF8A8A', 'center');
    bar(c, ax, ay + 4, aw, 8, G.arrest, '#ff4a4a');
  }
  // banner
  if (G.banner) {
    const b = G.banner, a = b.t < 0.2 ? b.t / 0.2 : b.t > b.max - 0.4 ? clamp((b.max - b.t) / 0.4, 0, 1) : 1;
    c.save(); c.globalAlpha = a;
    const by = t ? Math.min(h * 0.34, 260) : h * 0.27;
    c.font = '500 ' + (t ? 28 : 36) + 'px ' + F_DISP; const tw = c.measureText(b.title).width;
    c.font = '500 ' + (t ? 13 : 15) + 'px ' + F_UI;
    const subLines = b.sub ? wrapLines(c, b.sub, Math.min(w - 40, 520), 2) : [];
    let sw2 = 0; for (const l of subLines) sw2 = Math.max(sw2, c.measureText(l).width);
    const bw = Math.min(w - 20, Math.max(tw, sw2) + 48), bh = 20 + (t ? 34 : 42) + subLines.length * 19;
    plate(c, w / 2 - bw / 2, by - 14, bw, bh, 14, 0.74);
    c.fillStyle = b.col; c.fillRect(w / 2 - bw / 2 + 14, by - 14, 28, 3);
    text(c, b.title, w / 2, by + (t ? 14 : 18), '500 ' + (t ? 28 : 36) + 'px ' + F_DISP, '#FBF5EC', 'center');
    subLines.forEach((l, i) => text(c, l, w / 2, by + (t ? 40 : 50) + i * 19, '500 ' + (t ? 13 : 15) + 'px ' + F_UI, 'rgba(251,245,236,.85)', 'center'));
    c.restore();
  }
  // caught overlay
  if (G.caught) {
    const k = G.caught.t, a = k < 0.5 ? k / 0.5 : k < 2.6 ? 1 : clamp(1 - (k - 2.6) / 0.8, 0, 1);
    c.fillStyle = 'rgba(6,5,3,' + (0.82 * a) + ')'; c.fillRect(0, 0, w, h);
    c.save(); c.globalAlpha = a;
    text(c, G.caught.reason === 'ko' ? 'Knocked out' : 'Busted', w / 2, h / 2 - 16, '500 ' + (t ? 44 : 60) + 'px ' + F_DISP, '#FBF5EC', 'center');
    text(c, (G.caught.lose ? 'You lost ' + money(G.caught.lose) + '. ' : '') + 'Back to the safehouse.', w / 2, h / 2 + 26, '500 16px ' + F_UI, 'rgba(251,245,236,.8)', 'center');
    c.restore();
  }
  if (G.mapOpen) drawFullMap(c, arc);
}

/* ---- labels that live in the 3D world: marker badges, floating text, the arrow to the job */
function badge(c, x, y, col, ch, r) {
  c.fillStyle = 'rgba(8,7,5,.55)'; c.beginPath(); c.arc(x + 1, y + 2, r + 1, 0, TAU); c.fill();
  c.fillStyle = col; c.strokeStyle = '#0c0b09'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = '#16130e'; c.font = '700 ' + Math.round(r * 1.25) + 'px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x, y + 0.5);
}
function drawLabels(c, arc) {
  if (!GL.camera || G.mapOpen || G.caught) return;
  const w = arc.w, h = arc.h, t = arc.touchMode;
  const items = [];
  for (const o of G.offers) if (!o.hidden && o.cd <= 0) items.push([o.x, o.y, JT[o.type].col, JT[o.type].letter, 150, 0]);
  for (const s of SAFE) items.push([s.x, s.y, '#38D6B8', 'H', 84, 0]);
  const j = G.job;
  if (j) {
    if (j.cps) { for (let q = j.cp; q < j.cps.length; q++) items.push([j.cps[q].x, j.cps[q].y, '#FF5EA8', String(q + 1), q === j.cp ? 270 : 120, q === j.cp ? 1 : 0]); }
    else if (j.tx != null) items.push([j.tx, j.ty, j.col, j.type === 'fare' ? 'F' : 'D', 270, 1]);
  }
  for (const it of items) {
    const d = hyp(it[0] - pl.x, it[1] - pl.y); if (d > 1500) continue;
    if (!toScreen(it[0], it[4], it[1])) continue;
    const sx = SCR.x, sy = SCR.y; if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
    const r = clamp(2200 / (d + 160), t ? 10 : 11, it[5] ? 19 : 16);
    badge(c, sx, sy, it[2], it[3], r);
    if (it[5]) { const txt = Math.round(d / 10) + ' m'; c.font = '700 11px ' + F_MONO; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(10,8,5,.85)'; c.strokeText(txt, sx, sy + r + 12); c.fillStyle = '#fff'; c.fillText(txt, sx, sy + r + 12); }
  }
  // floating text: cash, ouch, checkpoints
  c.font = '700 14px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const f of G.floaters) {
    if (!toScreen(f.x, 26 + f.t * 26, f.y)) continue;
    const a = clamp(1.4 - f.t, 0, 1);
    c.globalAlpha = Math.min(1, a * 1.6); c.lineWidth = 3.5; c.strokeStyle = 'rgba(10,8,5,.9)'; c.strokeText(f.text, SCR.x, SCR.y); c.fillStyle = f.col; c.fillText(f.text, SCR.x, SCR.y);
  }
  c.globalAlpha = 1;
  // the arrow: which way the next marker lies from where the camera looks
  if (j && j.tx != null) {
    const tx = j.cps ? j.cps[Math.min(j.cp, j.cps.length - 1)].x : j.tx, ty = j.cps ? j.cps[Math.min(j.cp, j.cps.length - 1)].y : j.ty;
    const dx = tx - pl.x, dy = ty - pl.y, d = hyp(dx, dy);
    const on = toScreen(tx, 120, ty) && SCR.x > 30 && SCR.x < w - 30 && SCR.y > 30 && SCR.y < h - 30;
    if (d > 90 && !on) {
      const fx = Math.cos(CAM.yaw), fy = Math.sin(CAM.yaw), rx = -fy, ry = fx;
      const ang = Math.atan2(dx * rx + dy * ry, dx * fx + dy * fy);
      const ax = w / 2, ay = h * (t ? 0.5 : 0.56);
      c.save(); c.translate(ax, ay); c.rotate(ang);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(0, -21); c.lineTo(15, 11); c.lineTo(0, 4); c.lineTo(-15, 11); c.closePath(); c.translate(1.5, 2.5); c.fill(); c.translate(-1.5, -2.5);
      c.fillStyle = j.col; c.strokeStyle = '#16130e'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(0, -20); c.lineTo(14, 10); c.lineTo(0, 3); c.lineTo(-14, 10); c.closePath(); c.fill(); c.stroke();
      c.restore();
      c.font = '700 11px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle';
      const txt = Math.round(d / 10) + ' m'; c.lineWidth = 3; c.strokeStyle = 'rgba(10,8,5,.85)'; c.strokeText(txt, ax, ay + 28); c.fillStyle = '#fff'; c.fillText(txt, ax, ay + 28);
    }
  }
  // a hint for whatever the player is doing now, on touch
  if (t && arc.touchStyle !== 'pads') {
    const tilt = arc.touchStyle === 'tilt', car = !!pl.veh;
    const tip = car ? (tilt ? 'Tilt to steer. Tap to brake, tap again when stopped to get out.' : 'Drag left or right to steer. Drag down to brake. Swipe up to honk.') : (tilt ? 'Tilt to turn and hold a finger to walk. Tap a car to get in.' : 'Drag to walk. Tap a nearby car to get in.');
    if (tip !== G.tip) { G.tip = tip; G.tipT = 7; }
    if (G.tipT > 0 && !G.banner) {
      const a = clamp(G.tipT / 1.2, 0, 1);
      c.save(); c.globalAlpha = a; c.font = '500 13px ' + F_UI;
      const lines = wrapLines(c, tip, Math.min(w - 40, 320), 2), bw = Math.min(w - 20, 340), bh = 14 + lines.length * 18;
      const by = h - 64 - bh - (G.prompt ? 48 : 0);
      plate(c, w / 2 - bw / 2, by, bw, bh, 12, 0.7);
      lines.forEach((l, i) => text(c, l, w / 2, by + 15 + i * 18, '500 13px ' + F_UI, 'rgba(251,245,236,.92)', 'center'));
      c.restore();
    }
  }
}


/* ================================================================ wiring to the arcade shell */
function enterAttract() {
  stopHum();
  V.length = 0; PD.length = 0; PK.length = 0; for (const p of PART) p.on = false; SK.n = 0;
  G.phase = 'attract'; G.heat = 0; G.job = null; G.offers = []; G.caught = null; G.mapOpen = false; G.banner = null; G.floaters.length = 0; G.prompt = ''; G.nearVeh = null;
  pl.veh = null; pl.x = -2000; pl.y = -2000; pl.vx = pl.vy = 0;
  G.attractT = 0; G.attX = 900; G.attY = YC[6] - 24; G.camX = 900; G.camY = YC[6] - 24; G.fx = G.attX; G.fy = G.attY; G.lookX = G.lookY = 0;
  G.hour = 18.1;
  CAM.yaw = -0.1; CAM.cdist = 200;
  updateCamera(0.016, false);
  populate();
  G.preload = true;
}

const MENU_HTML = '<p>It is dusk in Saffron City. Walk to a car and get in to borrow it, then drive into a glowing marker to take a job: courier runs, taxi fares, street races or a getaway. Crash, carjack or run people off the road and the heat rises, so break the police\'s sight to cool off.</p>' +
  '<p>Free roam has no clock. The ten minute hustle ends when time is up and your score is your cash.</p>';
function showMenu(arc, extra) {
  arc.menu({
    eyebrow: 'Open-world sandbox', title: 'Saffron <em>City</em>',
    html: (extra || '') + MENU_HTML,
    options: [
      { id: 'mode', label: 'Mode', choices: [{ v: 'free', label: 'Free roam' }, { v: 'hustle', label: 'Ten minute hustle' }] },
      { id: 'diff', label: 'Police heat', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
    ],
  });
}

const arc = Arcade.create({
  slug: 'saffron-city', title: 'Saffron City', genre: 'Open-world sandbox', three: true,
  keys: [['WASD / arrows', 'Walk or drive'], ['Space', 'Handbrake (sprint on foot)'], ['Shift', 'Sprint on foot'], ['F', 'Get in or out of a car'], ['H', 'Horn'], ['Q / E', 'Turn the camera on foot'], ['M', 'City map']],
  gestures: {
    drag: 'xy', tilt: true,
    hint: 'Drag to walk or steer   Drag down to brake   Tap a car to get in   Swipe up to honk',
    keys: [['Drag', 'Walk on foot. In a car: left and right steer, down brakes'], ['Tap', 'Tap a nearby car to get in. In a car, tap when stopped to get out'], ['Swipe up', 'Honk the horn'], ['Tilt style', 'Tilt to steer, hold a finger to walk, tap to brake'], ['Map pad', 'Open the city map']],
  },
  touch: { stick: true, pads: [{ label: 'Car', key: 'KeyF' }, { label: 'Brake', key: 'Space', big: true, hot: true }, { label: 'Map', key: 'KeyM', keep: true }, { label: 'Horn', key: 'KeyH' }] },
  touchKeys: [['On-screen stick', 'Walk or steer'], ['Car', 'Get in or out'], ['Brake', 'Handbrake'], ['Horn', 'Honk'], ['Map', 'Open the city map']],
  touchHint: 'Stick to walk or steer, Car pad to get in, Brake, Horn, Map',
  gameKeys: ['KeyF', 'KeyH', 'KeyM', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'],
  hint: 'WASD move   F car   Space handbrake   H horn   Q E camera   M map',
  formatScore: (v) => money(v),
  resize(a) { resizeGL(a); },
  init(a) {
    arcRef = a;
    initGL(a);
    a.debug = () => {
      let police = 0, traffic = 0, chase = 0;
      for (const v of V) { if (v.police) { police++; if (v.ai && v.ai.kind === 'chase') chase++; } else if (v.ai && v.ai.kind === 'traffic') traffic++; }
      const pv = pl.veh;
      return {
        mode: G.mode, phase: G.phase, onFoot: !pv, vehicleType: pv ? pv.type : null, x: Math.round(pl.x), y: Math.round(pl.y),
        speed: Math.round(pv ? vSpeed(pv) : hyp(pl.vx, pl.vy)), cash: Math.round(G.cash), heat: +G.heat.toFixed(2), stars: stars(),
        job: G.job ? G.job.type : null, jobStage: G.job ? (G.job.stage + (G.job.cp != null ? ':' + G.job.cp : '')) : null,
        police, chasing: chase, traffic, peds: PD.length, vehicles: V.length, district: G.district ? G.district.name : null,
        hp: Math.round(pl.hp), carHp: pv ? Math.round(pv.hp) : null, hour: +G.hour.toFixed(2), night: +nightOf(G.hour).toFixed(2),
        chain: G.chain, hustleLeft: Math.round(G.hustleLeft), tiles: GL.chunks.size, zoom: +CAM.fov.toFixed(1), caught: !!G.caught, arrest: +G.arrest.toFixed(2),
        offers: G.offers.map((o) => ({ t: o.type, x: Math.round(o.x), y: Math.round(o.y), cd: Math.round(o.cd) })), jobs: G.stats.jobs, crashes: G.stats.crashes,
        cam: { yaw: +CAM.yaw.toFixed(2), x: Math.round(CAM.x), y: Math.round(CAM.y), z: Math.round(CAM.z) }, fps: Math.round(GL.fps), quality: GL.q, buildMs: Math.round(GL.buildMs / Math.max(1, GL.buildN)), cpuSync: +(GL.cpuSync || 0).toFixed(1), cpuRender: +(GL.cpuRender || 0).toFixed(1), soft: !!GL.soft, cpuUpd: +(GL.cpuUpd || 0).toFixed(1), cpuHud: +(GL.cpuHud || 0).toFixed(1), touchStyle: a.touchStyle,
      };
    };
    // helpers for automated tests
    a.cheat = {
      step(n, dt) { for (let i = 0; i < n; i++) { updatePlay(dt || 1 / 30); a.input.endFrame(); } },
      tp(x, y) { pl.x = x; pl.y = y; if (pl.veh) { pl.veh.x = x; pl.veh.y = y; } G.camX = x; G.camY = y; },
      cash(n) { G.cash = n; }, heat(n) { G.heat = n; G.unseen = 0; }, time(h) { G.hour = h; }, hustle(s) { G.hustleLeft = s; },
      car(type) { const v = mkVeh(type || 'hatch', pl.x + 40, pl.y, 0); v.driver = false; v.parked = true; v.c.hb = true; return v; },
      enter() { tryEnter(); }, leave() { leaveCar(false); }, V, PD, G, pl, SAFE, CAM, GL, quality(q) { GL.q = q; GL.pinned = true; applyQuality(); },
      job(type) { const o = G.offers.find((q) => q.type === type); if (o) { pl.x = o.x; pl.y = o.y; if (pl.veh) { pl.veh.x = o.x; pl.veh.y = o.y; } startJob(o); } },
      finish() { const j = G.job; if (j && j.tx != null) { pl.x = j.tx; pl.y = j.ty; if (pl.veh) { pl.veh.x = j.tx; pl.veh.y = j.ty; } } },
    };
    try { if (/[?&]q=(\d)/.test(location.search)) { GL.q = +RegExp.$1; GL.pinned = true; } } catch (e) { /* no query */ }
    if (GL.renderer) applyQuality();
    enterAttract();
    showMenu(a);
  },
  start(a, ch) {
    G.mode = ch.mode === 'hustle' ? 'hustle' : 'free'; G.diff = DIFF[ch.diff] ? ch.diff : 'normal';
    G.active = true; resetGame();
    a.input.clear();
  },
  onMenu(a) {
    if (G.active) {
      G.active = false;
      let extra = '';
      if (G.mode === 'free' && G.phase === 'play') {
        const cash = Math.round(G.cash);
        a.record(cash);
        extra = '<div class="stat"><div>Banked in free roam<b>' + money(cash) + '</b></div><div>Rank<b style="font-size:17px">' + esc(rankOf(cash)) + '</b></div></div>';
      }
      enterAttract();
      showMenu(a, extra);
    } else if (G.phase !== 'attract') { enterAttract(); }
  },
  onPause() { if (pl.hum) pl.hum.set(30, 0); },
  idle(dt, a) {
    if (a.state === 'menu') { updateWorld(dt, false); updateCamera(dt, false); }
    else if (a.state === 'over') {
      if (pl.veh) { const c = pl.veh.c; c.thr = 0; c.brk = 0.3; c.str = 0; c.hb = true; }
      stopHum(); updateWorld(dt, true); updateCamera(dt, true);
    }
  },
  update(dt, a) { const t0 = performance.now(); updatePlay(dt); GL.cpuUpd = lerp(GL.cpuUpd || 0, performance.now() - t0, 0.1); },
  render(ctx, a) {
    if (GL.fail) {
      ctx.fillStyle = '#0F0D0A'; ctx.fillRect(0, 0, a.w, a.h);
      text(ctx, GL.fail, a.w / 2, a.h / 2, '500 16px ' + F_UI, '#FBF5EC', 'center');
      return;
    }
    render3D(a);
    G.preload = false;
    const th0 = performance.now();
    if (G.phase === 'play' || G.phase === 'over') drawHUD(ctx, a);
    else {
      const g = ctx.createRadialGradient(a.w / 2, a.h / 2, Math.min(a.w, a.h) * 0.35, a.w / 2, a.h / 2, Math.max(a.w, a.h) * 0.8);
      g.addColorStop(0, 'rgba(6,5,3,0)'); g.addColorStop(1, 'rgba(6,5,3,.5)'); ctx.fillStyle = g; ctx.fillRect(0, 0, a.w, a.h);
    }
    GL.cpuHud = lerp(GL.cpuHud || 0, performance.now() - th0, 0.1);
  },
});
