import * as THREE from '/games/vendor/three/three.module.min.js';

/*
 * Gully Champs 3D: street cricket in a real 3D lane at golden hour.
 * An original game. three.js r185 (vendored) on the shared Arcade shell.
 * The match rules, modes, scoring and ball physics are the 2D game's; the lane,
 * the houses, the kids, the dog, the auto, the aunty and the camera are 3D.
 *
 * World mapping: the game's x runs along the lane (the bowler is at +x, the
 * batter near 0), h is height, z is across the lane (+z = right-hand houses).
 * In three.js that is  X = z,  Y = h,  Z = -x,  so the home camera sits behind
 * the batter and looks down -Z toward the bowler and the far gate.
 */
const A = window.Arcade;
const clamp = A.clamp, lerp = A.lerp;
const PI = Math.PI, TAU = Math.PI * 2;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, sqrt = Math.sqrt, floor = Math.floor, atan2 = Math.atan2;
const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();
const pick = (a) => a[(rnd() * a.length) | 0];
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };

/* ------------------------------------------------------------ world layout */
const END_X = -12, GATE_X = 30, ZW = 2.6, ZN = 2.6;
const STOREY = 3.3;
const CRATE_X = -0.82, BAT_X = 0, HOME_SAFE = 0.95, CHALK_X = 4.0, BOWL_X = 5.8, REL_X = 5.3;
const BR = 0.085;
const GRAV = 9.8;
const RESTIT = 0.64, BOUNCE_FR = 0.9;
const ARR_X = 0.55;
const BAL_D = 1.15, SLAB_T = 0.22, PARA_H = 0.95;

const WALLS = ['#d9879b', '#e2b04a', '#4f9ea0', '#d2693f', '#efe0b8', '#8fb08a', '#6f93c6'];
const SHUT = ['#2e6b4f', '#2a5d8f', '#8f2f2f', '#c9902c', '#5a3d86', '#1f7a7a'];

// Right-hand row (the original lane's houses). wins: [floor, centre x, width, type]
const HOUSES = [
  { side: 1, x0: -12, x1: -6.5, fl: 3, wall: WALLS[0], door: [-9.2, 1.1, '#5b3a29'], wins: [[0, -11.2, 1.1, 'glass'], [0, -7.4, 1.0, 'shutter'], [1, -11.2, 1.1, 'shutter'], [2, -11.2, 1.1, 'glass'], [2, -9.0, 1.1, 'glass'], [2, -7.3, 1.0, 'shutter']], balc: [[1, -10.0, -7.8]] },
  { side: 1, x0: -6.5, x1: 0.8, fl: 2, wall: WALLS[1], door: [-3.7, 1.1, '#2f4a6b'], wins: [[0, -5.6, 1.1, 'glass'], [0, -1.9, 1.1, 'shutter'], [1, -5.7, 1.1, 'shutter'], [1, -0.4, 1.0, 'glass']], balc: [[1, -4.6, -2.3]] },
  { side: 1, x0: 0.8, x1: 7.6, fl: 3, wall: WALLS[2], door: null, wins: [[0, 1.45, 0.9, 'shutter'], [0, 6.4, 1.1, 'glass'], [1, 1.3, 0.9, 'shutter'], [1, 6.4, 1.1, 'glass'], [2, 1.5, 1.1, 'glass'], [2, 3.4, 1.1, 'shutter'], [2, 5.3, 1.1, 'glass'], [2, 6.9, 0.8, 'glass']], balc: [[1, 2.1, 4.9]] },
  { side: 1, x0: 7.6, x1: 13.6, fl: 2, wall: WALLS[3], door: [10.4, 1.1, '#3e5c3a'], wins: [[0, 8.7, 1.0, 'shutter'], [0, 12.5, 1.1, 'glass'], [1, 8.5, 0.9, 'glass'], [1, 12.9, 1.0, 'shutter']], balc: [[1, 9.4, 11.7]] },
  { side: 1, x0: 13.6, x1: 20, fl: 2, wall: WALLS[4], door: null, shop: 'CHINTU KIRANA', wins: [[1, 14.9, 1.1, 'glass'], [1, 17.0, 1.1, 'shutter'], [1, 18.9, 1.0, 'glass']], balc: [] },
  { side: 1, x0: 20, x1: 26, fl: 3, wall: WALLS[5], door: [22.9, 1.1, '#7a3f2a'], wins: [[0, 21.2, 1.1, 'glass'], [0, 24.7, 1.1, 'shutter'], [1, 24.9, 1.0, 'shutter'], [2, 21.2, 1.1, 'glass']], balc: [[1, 20.7, 23.2], [2, 23.2, 25.7]] },
  { side: 1, x0: 26, x1: 30.4, fl: 2, wall: WALLS[6], door: null, wins: [[1, 27.2, 1.1, 'glass'], [1, 29.0, 1.0, 'shutter']], balc: [] },
];

// Left-hand row: the other side of the lane. Fewer glass panes, so the lane is
// as forgiving as the original, whose near wall was a plain wall.
const NEAR_SPEC = [
  { x0: -9.0, x1: -5.5, fl: 3, wall: '#d3875f', door: [-7.2, 1.1, '#3b5a7a'], balc: [[1, -8.6, -6.4]] },
  { x0: -5.5, x1: 1.6, fl: 2, wall: '#a9c7b0', door: [-2.0, 1.1, '#6b3a2a'], balc: [[1, -4.7, -2.7]] },
  { x0: 1.6, x1: 8.2, fl: 3, wall: '#e6c761', door: [6.9, 1.1, '#2f4a6b'], balc: [[1, 2.6, 4.7], [2, 4.7, 6.8]] },
  { x0: 8.2, x1: 14.4, fl: 2, wall: '#c88fb5', door: null, shop: 'BABLU CYCLE STORE', balc: [] },
  { x0: 14.4, x1: 21.0, fl: 3, wall: '#86a9d4', door: [18.2, 1.1, '#7a3f2a'], balc: [[1, 15.2, 17.4]] },
  { x0: 21.0, x1: 27.0, fl: 2, wall: '#e8d9b8', door: [24.4, 1.1, '#3e5c3a'], balc: [] },
  { x0: 27.0, x1: 30.4, fl: 3, wall: '#d97a62', door: null, balc: [[2, 27.9, 29.9]] },
];
(function genNear() {
  const r = A.rng(5511);
  NEAR_SPEC.forEach((h, hi) => {
    h.side = -1; h.wins = [];
    for (let f = 0; f < h.fl; f++) {
      const bal = h.balc.find((b) => b[0] === f);
      for (let cx = h.x0 + 1.05 + r() * 0.3; cx < h.x1 - 0.7; cx += 2.1 + r() * 0.35) {
        if (f === 0 && h.door && abs(cx - h.door[0]) < 1.3) continue;
        if (f === 0 && h.shop) continue;
        if (bal && cx > bal[1] - 0.55 && cx < bal[2] + 0.55) continue;
        h.wins.push([f, cx, 1.0, r() < (f === 0 ? 0.25 : 0.34) ? 'glass' : 'shutter']);
      }
    }
  });
})();
HOUSES.push.apply(HOUSES, NEAR_SPEC);

const roofOf = (h) => h.fl * STOREY + 0.7;
const ROWS = { 1: HOUSES.filter((h) => h.side === 1), '-1': HOUSES.filter((h) => h.side === -1) };
const roofTopAt = (x, side) => {
  const row = ROWS[side];
  for (let i = 0; i < row.length; i++) if (x < row[i].x1) return roofOf(row[i]);
  return roofOf(row[row.length - 1]);
};
const WIN = [];
const BALC = [];
HOUSES.forEach((h, hi) => {
  h.hi = hi;
  h.shutC = SHUT[(hi * 2 + 1) % SHUT.length];
  h.wins.forEach((w, wi) => {
    const f = w[0];
    const h0 = f * STOREY + (f === 0 ? 1.15 : 1.0);
    WIN.push({ x0: w[1] - w[2] / 2, x1: w[1] + w[2] / 2, h0, h1: h0 + 1.4, type: w[3], broken: false, hi, side: h.side, col: SHUT[(hi + wi) % SHUT.length], f, cx: w[1], w: w[2], k: WIN.length });
  });
  h.balc.forEach((b) => BALC.push({ f: b[0], x0: b[1], x1: b[2], hb: b[0] * STOREY, hi, side: h.side }));
});
// Collision boxes: [x0,x1, z0,z1, h0,h1, restitution]
const BOXES = [];
BALC.forEach((b) => {
  const s = b.side;
  const zf = s > 0 ? ZW - BAL_D : -ZW, zt = s > 0 ? ZW : -ZW + BAL_D;
  BOXES.push([b.x0, b.x1, zf, zt, b.hb - SLAB_T, b.hb, 0.45]);
  const fz0 = s > 0 ? ZW - BAL_D : -ZW + BAL_D - 0.14, fz1 = s > 0 ? ZW - BAL_D + 0.14 : -ZW + BAL_D;
  BOXES.push([b.x0, b.x1, fz0, fz1, b.hb, b.hb + PARA_H, 0.5]);
  BOXES.push([b.x0, b.x0 + 0.14, zf, zt, b.hb, b.hb + PARA_H, 0.5]);
  BOXES.push([b.x1 - 0.14, b.x1, zf, zt, b.hb, b.hb + PARA_H, 0.5]);
});
const SHOP = { x0: 13.9, x1: 19.5 };
BOXES.push([SHOP.x0, SHOP.x1, ZW - 1.5, ZW, 2.5, 2.66, 0.74]); // striped awning: bouncy
const AWN = BOXES[BOXES.length - 1];

const FIELD_X0 = [-5.4, 11.6, 17.8, 24.2];
const KID_STYLES = {
  bat: { tee: '#e23e57', shorts: '#2f4b7c', skin: '#c68642', hair: '#1c1410', cap: null, shoe: '#f2efe6' },
  bowl: { tee: '#2f80c9', shorts: '#e9e2d0', skin: '#d19a66', hair: '#241812', cap: null, shoe: '#2a2a30' },
  f0: { tee: '#f2b01e', shorts: '#3c3c46', skin: '#a8703a', hair: '#15100c', cap: '#c1272d', shoe: '#d9d2c2' },
  f1: { tee: '#3f9e5a', shorts: '#2a3140', skin: '#c68642', hair: '#1c1410', cap: null, shoe: '#f2efe6' },
  f2: { tee: '#8a56c9', shorts: '#e4d9c0', skin: '#d9a679', hair: '#2b1d14', cap: null, shoe: '#3a3a44' },
  f3: { tee: '#ee7a33', shorts: '#31405c', skin: '#b87a45', hair: '#17110d', cap: '#2f80c9', shoe: '#f2efe6' },
};
const KID_NAMES = { bat: 'Bunty', bowl: 'Golu', f0: 'Raju', f1: 'Munni', f2: 'Tinku', f3: 'Pappu' };

/* ------------------------------------------------------------ modes */
const RIVALS = ['Neem Gali Nawabs', 'Chai Corner Cobras', 'Peepal Park Pirates', 'Mochi Mohalla Mavericks', 'Kabootar Chowk Kings', 'Jalebi Gali Jaguars'];
const SUNDAY = [
  { name: 'Peepal Gali Pandas', speed: 0.96, add: 0 },
  { name: 'Jamun Chowk Jaguars', speed: 1.06, add: 6 },
  { name: 'Imli Mohalla Lions', speed: 1.16, add: 12 },
];
const BATTERS = ['Bunty', 'Pinky', 'Chotu'];
const DIFF = {
  chill: { label: 'Chill', zs: 1.0, speed: 0.84, swing: 0.44, perfect: 0.34, good: 0.72, fieldSpeed: 3.7, pCatch: 0.16, pStop: 0.5, target: [17, 21], patches: 3, mix: { fast: 2, slow: 4, full: 3, bouncer: 1, googly: 1 } },
  serious: { label: 'Serious', zs: 0.75, speed: 1.0, swing: 0.37, perfect: 0.30, good: 0.62, fieldSpeed: 4.8, pCatch: 0.26, pStop: 0.62, target: [26, 32], patches: 4, mix: { fast: 3, slow: 3, full: 2, bouncer: 2, googly: 2 } },
  legend: { label: 'Gully Legend', zs: 0.42, speed: 1.14, swing: 0.31, perfect: 0.26, good: 0.55, fieldSpeed: 5.9, pCatch: 0.36, pStop: 0.74, target: [36, 44], patches: 5, mix: { fast: 3, slow: 1, full: 1, bouncer: 3, googly: 3 } },
};
const DELIV = {
  fast: { speed: 10.6, run: 3.4, tag: 'Fast', aim: [0.4, 0.95], xp: [1.9, 3.8] },
  slow: { speed: 6.3, run: 1.2, tag: 'Slow', aim: [0.5, 1.15], xp: [1.3, 3.2] },
  full: { speed: 8.8, run: 2.2, tag: 'Full toss', aim: [0.65, 1.25] },
  bouncer: { speed: 11.8, run: 3.4, tag: 'Bouncer', aim: [1.45, 1.8], xp: [3.0, 4.6] },
  googly: { speed: 7.6, run: 1.8, tag: 'Googly', aim: [0.45, 1.0], xp: [1.5, 3.4] },
};

/* ------------------------------------------------------------ speech lines */
const LINES = {
  trial: ['Trial ball hai, gina nahi jayega!', 'Pehle trial, phir match!'],
  lastMan: ['Last man bhi khelega!', 'Akela hai to kya, khelega!'],
  four: ['Chauka! Seedha gate pe!', 'Kya shot hai!', 'Gate tak gayi!'],
  two: ['Deewar se takraayi, do!', 'Pichhe deewar, do run!'],
  six: ['Chhakka! Par aap out!', 'Chhat ke upar! Out!', 'Six and out, bhaiya!'],
  out: ['Out hai, out!', 'Gaya bhai gaya!', 'Bas, ho gaya!'],
  tip: ['Ek tip, ek haath, out!', 'Ek haath, ek tip, out!'],
  bowled: ['Crate gir gaya! Out!', 'Gilli udd gayi!'],
  glass: ['Ball gaya!', 'Oho, sheesha tod diya!'],
  aunty: ['Kiska ball hai ye?!', 'Sheesha kaun bharega?!', 'Mummy ko bulaun?'],
  miss: ['Beat ho gaya!', 'Haath hi nahi aaya!'],
  dot: ['Dot ball!', 'Ek bhi run nahi!'],
  drop: ['Chhod diya!', 'Haath se phisla!'],
  run: ['Daud, daud!', 'Run lo, run lo!'],
  runout: ['Run out! Dhoka hua!', 'Kaata gaya!'],
  stuck: ['Ball chhajje pe atak gayi!', 'Upar fas gayi ball!'],
  dog: ['Bhuri ball le gayi!', 'Kutta ball le gaya!'],
  auto: ['Gaadi aa gayi!', 'Side ho jao, auto!'],
  perfect: ['Kya timing!', 'Bilkul sahi!'],
  bowl: ['Ye le!', 'Sambhal ke!', 'Aaya aaya!'],
  spare: ['Naya ball aa gaya!', 'Spare ball nikaali!'],
  pot: ['Gaddha!', 'Road kharab hai!'],
  win: ['Colony jeet gayi!', 'Hum jeete, hum jeete!'],
  lose: ['Agli baar pakka!', 'Thoda kam pad gaya!'],
  auntyChat: ['Dhoop mein khelte ho?', 'Kapde gande mat karna!', 'Awaaz kam, beta!', 'Paani peelo, bacchon!'],
};

const FONT_UI = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const FONT_SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";

const POLES = [-9, 9.4, 21, 33];
const WIRES = [{ h: 7.5, sag: 0.45 }, { h: 7.1, sag: 0.55 }, { h: 6.7, sag: 0.4 }];
const WIRE_Z = 2.38;
const wireH = (k, x) => {
  for (let i = 0; i < POLES.length - 1; i++) {
    if (x >= POLES[i] && x <= POLES[i + 1]) {
      const mid = (POLES[i] + POLES[i + 1]) / 2, half = (POLES[i + 1] - POLES[i]) / 2;
      const u = (x - mid) / half;
      return WIRES[k].h - WIRES[k].sag * (1 - u * u) * (half / 8);
    }
  }
  return WIRES[k].h;
};
const wireZ = (k) => WIRE_Z - k * 0.34;

const windowAt = (x, h, side) => {
  for (let i = 0; i < WIN.length; i++) {
    const w = WIN[i];
    if (w.side !== side) continue;
    if (x >= w.x0 - BR && x <= w.x1 + BR && h >= w.h0 - BR && h <= w.h1 + BR) return w;
  }
  return null;
};

/* ------------------------------------------------------------ three helpers */
let R = null; // renderer
let maxAniso = 4;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function canvasTex(c, o) {
  o = o || {};
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = o.aniso == null ? maxAniso : o.aniso;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const col = (c) => (c && c.isColor ? c : new THREE.Color(c));
const shadeC = (c, t) => { const k = col(c).clone(); return t >= 0 ? k.lerp(new THREE.Color(1, 1, 1), t) : k.lerp(new THREE.Color(0, 0, 0), -t); };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3();

// Merges primitives into one vertex-coloured BufferGeometry (one draw call).
class GB {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  add(geo, color, px, py, pz, rx, ry, rz, sx, sy, sz) {
    tmpE.set(rx || 0, ry || 0, rz || 0, 'YXZ'); tmpQ.setFromEuler(tmpE);
    tmpP.set(px || 0, py || 0, pz || 0); tmpS.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
    tmpM.compose(tmpP, tmpQ, tmpS);
    geo.applyMatrix4(tmpM);
    const p = geo.attributes.position, nr = geo.attributes.normal, u = geo.attributes.uv, c = col(color);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(nr.getX(i), nr.getY(i), nr.getZ(i));
      this.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      this.col.push(c.r, c.g, c.b);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(geo.index.getX(i) + this.n);
    else for (let i = 0; i < p.count; i++) this.idx.push(this.n + i);
    this.n += p.count;
    geo.dispose();
    return this;
  }
  box(w, h, d, x, y, z, color, ry, rx, rz) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  cyl(rt, rb, h, x, y, z, color, seg, rx, rz, ry) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg || 10, 1), color, x, y, z, rx, ry, rz); }
  sph(r, x, y, z, color, sx, sy, sz, seg) { return this.add(new THREE.SphereGeometry(r, seg || 12, Math.max(6, (seg || 12) - 4)), color, x, y, z, 0, 0, 0, sx, sy, sz); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
// A box laid out in lane terms: gx0..gx1 along the lane, h0..h1 up, d0..d1 measured from the wall face into the lane.
function laneBox(gb, side, gx0, gx1, h0, h1, d0, d1, color) {
  gb.box(abs(d1 - d0), h1 - h0, gx1 - gx0, side * (ZW - (d0 + d1) / 2), (h0 + h1) / 2, -(gx0 + gx1) / 2, color);
}

/* ------------------------------------------------------------ canvas painters */
function noiseDots(c, n, sr, light, dark, szMax) {
  const w = c.canvas.width, h = c.canvas.height;
  for (let k = 0; k < n; k++) {
    c.fillStyle = sr() < 0.5 ? 'rgba(255,255,255,' + (light * sr()) + ')' : 'rgba(30,18,10,' + (dark * sr()) + ')';
    const x = sr() * w, y = sr() * h, s = 1 + sr() * szMax;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) c.fillRect(x + ox * w, y + oy * h, s, s * (0.5 + sr()));
  }
}
function paintPlaster() {
  const cv = mkCanvas(512, 512), c = cv.getContext('2d'), sr = A.rng(3101);
  c.fillStyle = '#e8e2d4'; c.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 46; k++) {
    const x = sr() * 512, y = sr() * 512, r = 30 + sr() * 110;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const dark = sr() < 0.55;
    g.addColorStop(0, dark ? 'rgba(80,60,40,' + (0.05 + sr() * 0.08) + ')' : 'rgba(255,255,255,' + (0.05 + sr() * 0.1) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { c.save(); c.translate(ox * 512, oy * 512); c.fillRect(x - r, y - r, r * 2, r * 2); c.restore(); }
  }
  noiseDots(c, 2600, sr, 0.16, 0.2, 4);
  // hairline cracks
  c.strokeStyle = 'rgba(40,24,14,.32)'; c.lineWidth = 1.3; c.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    let x = sr() * 512, y = sr() * 512; c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 7; s++) { x += (sr() - 0.5) * 34; y += sr() * 26; c.lineTo(x, y); }
    c.stroke();
  }
  // peeling patches
  for (let k = 0; k < 5; k++) {
    const px = sr() * 440, py = sr() * 440;
    c.fillStyle = sr() < 0.5 ? 'rgba(255,255,255,.17)' : 'rgba(70,46,30,.14)';
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + 20 + sr() * 34, py + 4); c.lineTo(px + 26 + sr() * 22, py + 20 + sr() * 18); c.lineTo(px + 4, py + 24 + sr() * 18); c.closePath(); c.fill();
  }
  return cv;
}
function paintConcrete() {
  const cv = mkCanvas(512, 512), c = cv.getContext('2d'), sr = A.rng(9011);
  c.fillStyle = '#b09b82'; c.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 60; k++) {
    const x = sr() * 512, y = sr() * 512, r = 20 + sr() * 90;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, sr() < 0.5 ? 'rgba(40,28,18,' + (0.06 + sr() * 0.1) + ')' : 'rgba(255,230,190,' + (0.06 + sr() * 0.1) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { c.save(); c.translate(ox * 512, oy * 512); c.fillRect(x - r, y - r, r * 2, r * 2); c.restore(); }
  }
  noiseDots(c, 5200, sr, 0.22, 0.3, 3);
  c.strokeStyle = 'rgba(30,20,12,.4)'; c.lineWidth = 1.6; c.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    let x = sr() * 512, y = sr() * 512; c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (sr() - 0.3) * 40; y += (sr() - 0.5) * 24; c.lineTo(x, y); }
    c.stroke();
  }
  // slab seams on the tile border
  c.strokeStyle = 'rgba(30,20,12,.6)'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(0, 2); c.lineTo(512, 2); c.moveTo(2, 0); c.lineTo(2, 512); c.stroke();
  c.strokeStyle = 'rgba(255,235,200,.16)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, 6); c.lineTo(512, 6); c.moveTo(6, 0); c.lineTo(6, 512); c.stroke();
  return cv;
}
function paintBrick() {
  const cv = mkCanvas(512, 512), c = cv.getContext('2d'), sr = A.rng(4001);
  c.fillStyle = '#7a4a40'; c.fillRect(0, 0, 512, 512);
  const bh = 32, bw = 64;
  for (let y = 0; y < 512; y += bh) {
    for (let x = -bw; x < 512; x += bw) {
      const ox = (y / bh) % 2 ? bw / 2 : 0;
      const sh = 0.82 + sr() * 0.32;
      c.fillStyle = 'rgb(' + Math.round(150 * sh) + ',' + Math.round(86 * sh) + ',' + Math.round(70 * sh) + ')';
      c.fillRect(x + ox + 2, y + 2, bw - 4, bh - 4);
    }
  }
  noiseDots(c, 1800, sr, 0.14, 0.2, 3);
  return cv;
}
function paintGlass() {
  const cv = mkCanvas(64, 128), c = cv.getContext('2d'), sr = A.rng(77);
  const g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#8fc4e2'); g.addColorStop(0.5, '#cfe2de'); g.addColorStop(1, '#f6c27c');
  c.fillStyle = g; c.fillRect(0, 0, 64, 128);
  c.fillStyle = sr() < 0.5 ? 'rgba(190,60,70,.5)' : 'rgba(60,110,150,.46)'; c.fillRect(0, 0, 20, 128);
  c.fillStyle = 'rgba(255,255,255,.3)';
  c.beginPath(); c.moveTo(22, 70); c.lineTo(46, 0); c.lineTo(58, 0); c.lineTo(22, 100); c.closePath(); c.fill();
  return cv;
}
function paintLouver() {
  const cv = mkCanvas(64, 128), c = cv.getContext('2d');
  c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 124; y += 9) { c.fillStyle = 'rgba(0,0,0,.34)'; c.fillRect(3, y, 58, 3.4); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(3, y - 2, 58, 1.5); }
  c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(0, 0, 3, 128); c.fillRect(61, 0, 3, 128);
  c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(0, 0, 64, 4);
  return cv;
}
function paintSoftDot() {
  const cv = mkCanvas(64, 64), c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return cv;
}
function paintSky() {
  const cv = mkCanvas(8, 512), c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 512);
  // top of the texture is the zenith, the middle the horizon, the bottom is under the world
  g.addColorStop(0.0, '#3f6aa6'); g.addColorStop(0.22, '#6f93c0'); g.addColorStop(0.36, '#e8b48f'); g.addColorStop(0.45, '#ffcf8f');
  g.addColorStop(0.5, '#ffd9a0'); g.addColorStop(0.58, '#e9b98f'); g.addColorStop(1.0, '#a8836f');
  c.fillStyle = g; c.fillRect(0, 0, 8, 512);
  return cv;
}
function paintBall() {
  const cv = mkCanvas(256, 128), c = cv.getContext('2d');
  c.fillStyle = '#c4dc2a'; c.fillRect(0, 0, 256, 128);
  const sr = A.rng(9);
  for (let k = 0; k < 500; k++) { c.fillStyle = 'rgba(' + (sr() < 0.5 ? '255,255,170' : '110,140,10') + ',' + (0.1 + sr() * 0.18) + ')'; c.fillRect(sr() * 256, sr() * 128, 1.4, 1.4); }
  // the white tape wrapped round the middle, and a thin seam
  c.fillStyle = '#f7f4ea'; c.fillRect(0, 54, 256, 26);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(0, 54, 256, 2); c.fillRect(0, 78, 256, 2);
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3;
  c.beginPath(); for (let x = 0; x <= 256; x += 4) { const y = 22 + Math.sin(x / 256 * TAU * 2) * 12; if (x === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
  return cv;
}
// A painted sign: board colour, border colour, a main line and an optional second line.
function paintSign(w, h, bg, fg, line1, line2, o) {
  o = o || {};
  const cv = mkCanvas(w, h), c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, shadeC(bg, 0.1).getStyle()); g.addColorStop(1, shadeC(bg, -0.1).getStyle());
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const sr = A.rng(w + h);
  for (let k = 0; k < 160; k++) { c.fillStyle = 'rgba(0,0,0,' + (0.03 + sr() * 0.07) + ')'; c.fillRect(sr() * w, sr() * h, 2 + sr() * 10, 1 + sr() * 3); }
  c.strokeStyle = o.border || fg; c.lineWidth = Math.max(4, h * 0.05); c.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  let f1 = (o.f1 || 0.3) * h;
  c.font = '800 ' + f1 + 'px ' + FONT_UI;
  while (c.measureText(line1).width > w * 0.88 && f1 > 9) { f1 *= 0.93; c.font = '800 ' + f1 + 'px ' + FONT_UI; }
  c.fillText(line1, w / 2, line2 ? h * 0.38 : h * 0.5);
  if (line2) { c.fillStyle = o.fg2 || fg; c.font = '700 ' + (h * 0.15) + 'px ' + FONT_UI; c.fillText(line2, w / 2, h * 0.74); }
  return cv;
}

/* ------------------------------------------------------------ the scene */
let scene = null, camera = null, sun = null, fill = null, hemi = null;
const SUN_DIR = new THREE.Vector3();
const FX = { // handles to things the game animates
  windowsG: null, windowsS: null, cracks: null, glassM: [], crackM: [], clothes: null, clothesData: [], flags: null, flagData: [],
  boardTex: null, boardCanvas: null, boardKey: '', garage: [], auntyClip: null, patches: [], motes: null, glow: null,
};
const matFlat = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9, metalness: 0 }, o || {}));

function facadeGeo(L, H, D) {
  const g = new THREE.BoxGeometry(D, H, L, 1, 18, 1);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, T = 2.6;
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + H / 2, z = p.getZ(i), x = p.getX(i);
    const ax = abs(n.getX(i)), ay = abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, z / T, y / T); else if (ay > 0.5) uv.setXY(i, x / T, z / T); else uv.setXY(i, x / T + 0.37, y / T);
    const k = (0.62 + 0.38 * sstep(0, 1.7, y)) * (1 + 0.1 * sstep(H - 1.6, H, y));
    cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function buildHouses(root) {
  const plaster = canvasTex(paintPlaster(), { repeat: true });
  const det = { 1: new GB(), '-1': new GB() };
  const hang = new GB(); // things that hang in the lane (brackets, tin signs)
  const signMeshes = [];
  HOUSES.forEach((h) => {
    const s = h.side, L = h.x1 - h.x0, H = roofOf(h), gb = det[s];
    const mat = new THREE.MeshStandardMaterial({ map: plaster, bumpMap: plaster, bumpScale: 2.4, vertexColors: true, color: h.wall, roughness: 0.93, metalness: 0 });
    const m = new THREE.Mesh(facadeGeo(L, H, 1.2), mat);
    m.position.set(s * (ZW + 0.6), H / 2, -(h.x0 + h.x1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
    const light = shadeC(h.wall, 0.32), dark = shadeC(h.wall, -0.4), mid = shadeC(h.wall, 0.12);
    laneBox(gb, s, h.x0, h.x1, 0, 0.34, 0, 0.09, shadeC(h.wall, -0.32));
    for (let f = 1; f < h.fl; f++) {
      laneBox(gb, s, h.x0, h.x1, f * STOREY - 0.05, f * STOREY + 0.1, 0, 0.1, light);
      laneBox(gb, s, h.x0, h.x1, f * STOREY - 0.1, f * STOREY - 0.05, 0, 0.06, dark);
    }
    laneBox(gb, s, h.x0 - 0.05, h.x1 + 0.05, H - 0.14, H + 0.1, -0.1, 0.14, light);
    laneBox(gb, s, h.x0 - 0.05, h.x1 + 0.05, H - 0.2, H - 0.14, -0.1, 0.1, dark);
    laneBox(gb, s, h.x0 - 0.02, h.x0 + 0.05, 0, H, 0, 0.06, dark);
    gb.cyl(0.045, 0.045, H, s * (ZW - 0.1), H / 2, -(h.x1 - 0.35), '#3d3a3a', 8);
    for (let y = 1.2; y < H - 0.5; y += 2.2) laneBox(gb, s, h.x1 - 0.42, h.x1 - 0.28, y, y + 0.06, 0, 0.17, '#262424');
    // window dressing
    WIN.forEach((w) => {
      if (w.hi !== h.hi) return;
      laneBox(gb, s, w.x0 - 0.1, w.x1 + 0.1, w.h0 - 0.11, w.h0 - 0.02, 0, 0.17, '#eadfc6');
      laneBox(gb, s, w.x0 - 0.08, w.x1 + 0.08, w.h1 + 0.03, w.h1 + 0.13, 0, 0.11, '#eadfc6');
      laneBox(gb, s, w.x0 - 0.1, w.x1 + 0.1, w.h0 - 0.22, w.h0 - 0.11, 0, 0.05, '#6e5a4a');
    });
    // door
    if (h.door) {
      const dx = h.door[0], dw = h.door[1];
      laneBox(gb, s, dx - dw / 2 - 0.1, dx + dw / 2 + 0.1, 0, 2.38, 0, 0.09, '#eadfc6');
      laneBox(gb, s, dx - dw / 2, dx + dw / 2, 0, 2.28, 0.06, 0.13, h.door[2]);
      laneBox(gb, s, dx - dw / 2 + 0.12, dx + dw / 2 - 0.12, 0.2, 1.05, 0.12, 0.16, shadeC(h.door[2], -0.25));
      laneBox(gb, s, dx - dw / 2 + 0.12, dx + dw / 2 - 0.12, 1.2, 2.12, 0.12, 0.16, shadeC(h.door[2], -0.25));
      gb.sph(0.035, s * (ZW - 0.17), 1.1, -(dx + dw / 2 - 0.14), '#d9b45a', 1, 1, 1, 8);
      laneBox(gb, s, dx - dw / 2 - 0.25, dx + dw / 2 + 0.25, 0, 0.12, 0, 0.36, '#9a8a74');
    }
    if (h.shop) buildShop(h, gb, hang, root, signMeshes);
  });
  // balconies
  BALC.forEach((b, bi) => buildBalcony(b, det[b.side], bi));
  [1, -1].forEach((s) => {
    const mesh = new THREE.Mesh(det[s].build(), matFlat({ roughness: 0.85 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  });
  const hm = new THREE.Mesh(hang.build(), matFlat());
  hm.castShadow = true; root.add(hm);
}

function buildShop(h, gb, hang, root, signMeshes) {
  const s = h.side, x0 = h.x0, x1 = h.x1;
  const sr = A.rng(x0 * 31 + 5);
  const cols = ['#e23e57', '#f2b01e', '#3f9e5a', '#2f80c9', '#8a56c9', '#ee7a33', '#f5e6c4'];
  laneBox(gb, s, x0 + 0.25, x1 - 0.25, 0, 2.5, 0.0, 0.06, '#2b1f18');
  for (let r = 0; r < 3; r++) {
    const hh = 0.95 + r * 0.48;
    laneBox(gb, s, x0 + 0.35, x1 - 2.2, hh, hh + 0.05, 0.06, 0.42, '#8d6a45');
    for (let x = x0 + 0.45; x < x1 - 2.4; x += 0.2) {
      const ph = 0.16 + sr() * 0.12;
      laneBox(gb, s, x, x + 0.14, hh + 0.05, hh + 0.05 + ph, 0.12, 0.3, cols[(sr() * cols.length) | 0]);
    }
  }
  laneBox(gb, s, x1 - 2.0, x1 - 0.4, 0, 2.1, 0.06, 0.78, '#d8e4ea');
  laneBox(gb, s, x1 - 1.9, x1 - 0.5, 0.15, 2.0, 0.78, 0.8, '#8fc7de');
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) laneBox(gb, s, x1 - 1.8 + k * 0.32, x1 - 1.62 + k * 0.32, 0.3 + r * 0.42, 0.62 + r * 0.42, 0.7, 0.76, cols[(r + k) % cols.length]);
  laneBox(gb, s, x0 + 0.25, x1 - 0.25, 0, 0.9, 0.38, 0.84, '#7a5530');
  laneBox(gb, s, x0 + 0.2, x1 - 0.2, 0.9, 0.99, 0.34, 0.9, '#b98a54');
  // striped awning (the physics box is the same flat slab)
  const n = Math.round((x1 - x0 - 0.4) / 0.3);
  const aw = (x1 - x0 - 0.4) / n, a0 = x0 + 0.2;
  for (let i = 0; i < n; i++) {
    const cc = i % 2 ? '#f5e6c4' : '#e0562f';
    laneBox(hang, s, a0 + i * aw, a0 + (i + 1) * aw, 2.5, 2.66, 0, 1.5, cc);
    laneBox(hang, s, a0 + i * aw, a0 + (i + 1) * aw, 2.28, 2.5, 1.46, 1.5, cc);
  }
  for (let x = a0 + 0.3; x < x1 - 1.6; x += 0.5) {
    laneBox(hang, s, x, x + 0.02, 1.95, 2.28, 1.3, 1.32, '#222');
    for (let k = 0; k < 3; k++) laneBox(hang, s, x - 0.07, x + 0.1, 2.02 + k * 0.1, 2.1 + k * 0.1, 1.28, 1.34, cols[(Math.round(x * 3) + k) % cols.length]);
  }
  // sign boards: flat on the wall, and one standing out so it faces the lane
  const sc = h.shop === 'CHINTU KIRANA';
  const sub = sc ? '& COLD DRINKS | CHAI | BISCUIT' : 'REPAIR | PUNCTURE | AIR FREE';
  const cv = paintSign(1024, 200, sc ? '#e8d9a8' : '#d8e6c8', sc ? '#9b2b2b' : '#1f5a3a', h.shop, sub, { fg2: '#1f5a8a', f1: 0.36 });
  const t = canvasTex(cv);
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, emissive: new THREE.Color('#ffffff'), emissiveMap: t, emissiveIntensity: 0.12 });
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.2, 0.9), mat);
  flat.position.set(s * (ZW - 0.12), 3.3, -(x0 + x1) / 2); flat.rotation.y = -s * PI / 2; root.add(flat);
  const cv2 = paintSign(512, 300, sc ? '#e8d9a8' : '#d8e6c8', sc ? '#9b2b2b' : '#1f5a3a', sc ? 'CHINTU' : 'BABLU', sc ? 'KIRANA STORE' : 'CYCLE STORE', { fg2: '#1f5a8a', f1: 0.32 });
  const t2 = canvasTex(cv2);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.88), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.7, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveMap: t2, emissiveIntensity: 0.1 }));
  board.position.set(s * (ZW - 0.1 - 0.8), 3.45, -(x0 + 0.35)); board.castShadow = true; root.add(board);
  laneBox(hang, s, x0 + 0.3, x0 + 0.34, 3.85, 3.9, 0.02, 0.92, '#2a2a2a');
  laneBox(hang, s, x0 + 0.3, x0 + 0.34, 3.0, 3.85, 0.9, 0.93, '#2a2a2a');
}

function buildBalcony(b, gb, bi) {
  const s = b.side, h = HOUSES[b.hi], hb = b.hb;
  const wallL = shadeC(h.wall, 0.3), wallM = shadeC(h.wall, 0.08);
  laneBox(gb, s, b.x0, b.x1, hb - SLAB_T, hb, 0, BAL_D, '#cdbfa6');
  laneBox(gb, s, b.x0 - 0.03, b.x1 + 0.03, hb - SLAB_T, hb - SLAB_T + 0.06, BAL_D - 0.05, BAL_D + 0.03, '#b7a98f');
  laneBox(gb, s, b.x0, b.x1, hb, hb + PARA_H, BAL_D - 0.14, BAL_D, wallM);
  laneBox(gb, s, b.x0, b.x0 + 0.14, hb, hb + PARA_H, 0, BAL_D, wallM);
  laneBox(gb, s, b.x1 - 0.14, b.x1, hb, hb + PARA_H, 0, BAL_D, wallM);
  laneBox(gb, s, b.x0 - 0.05, b.x1 + 0.05, hb + PARA_H - 0.05, hb + PARA_H + 0.07, BAL_D - 0.2, BAL_D + 0.05, wallL);
  laneBox(gb, s, b.x0 - 0.05, b.x0 + 0.19, hb + PARA_H - 0.05, hb + PARA_H + 0.07, 0, BAL_D + 0.05, wallL);
  laneBox(gb, s, b.x1 - 0.19, b.x1 + 0.05, hb + PARA_H - 0.05, hb + PARA_H + 0.07, 0, BAL_D + 0.05, wallL);
  // jali squares on the lane-facing panels
  const dk = shadeC(h.wall, -0.5);
  for (let x = b.x0 + 0.22; x < b.x1 - 0.18; x += 0.2) laneBox(gb, s, x, x + 0.1, hb + 0.32, hb + 0.62, BAL_D - 0.01, BAL_D + 0.012, dk);
  for (let g = 0.28; g < BAL_D - 0.2; g += 0.2) {
    laneBox(gb, s, b.x0 - 0.002, b.x0 + 0.002, hb + 0.32, hb + 0.62, g, g + 0.1, dk);
    laneBox(gb, s, b.x1 - 0.002, b.x1 + 0.002, hb + 0.32, hb + 0.62, g, g + 0.1, dk);
  }
  // the back door and its frame
  laneBox(gb, s, b.x0 + 0.25, b.x1 - 0.25, hb, hb + 2.25, 0, 0.05, '#2a201c');
  laneBox(gb, s, b.x0 + 0.2, b.x0 + 0.3, hb, hb + 2.32, 0, 0.09, '#eadfc6');
  laneBox(gb, s, b.x1 - 0.3, b.x1 - 0.2, hb, hb + 2.32, 0, 0.09, '#eadfc6');
  laneBox(gb, s, b.x0 + 0.2, b.x1 - 0.2, hb + 2.22, hb + 2.32, 0, 0.09, '#eadfc6');
  laneBox(gb, s, (b.x0 + b.x1) / 2 - 0.02, (b.x0 + b.x1) / 2 + 0.02, hb, hb + 2.25, 0.05, 0.08, '#eadfc6');
  // plants on the parapet
  const sr = A.rng(100 + bi * 17);
  const n = 2 + ((bi + 1) % 2);
  for (let k = 0; k < n; k++) {
    const gxp = b.x0 + 0.5 + sr() * (b.x1 - b.x0 - 1.0), r = 0.16 + sr() * 0.07;
    const X = s * (ZW - BAL_D + 0.08), Y = hb + PARA_H + 0.07, Z = -gxp;
    gb.cyl(r * 0.85, r * 0.6, r * 1.5, X, Y + r * 0.75, Z, '#b5532e', 9);
    gb.cyl(r * 0.92, r * 0.92, r * 0.18, X, Y + r * 1.5, Z, '#c76a3e', 9);
    for (let l = 0; l < 5; l++) gb.sph(r * 0.8, X + (sr() - 0.5) * r * 1.1, Y + r * 2.0 + sr() * r * 1.3, Z + (sr() - 0.5) * r * 1.1, sr() < 0.7 ? '#3f7a38' : '#58963f', 1, 0.9, 1, 8);
    if (sr() < 0.6) gb.sph(r * 0.28, X, Y + r * 3.0, Z + r * 0.2, sr() < 0.5 ? '#f2a31e' : '#e23e57', 1, 1, 1, 6);
  }
  if (bi % 2 === 0) { // a plastic chair seen over the edge
    const X = s * (ZW - 0.55), Z = -(b.x1 - 0.55);
    gb.box(0.4, 0.04, 0.4, X, hb + 0.46, Z, '#d9d2c2');
    gb.box(0.4, 0.5, 0.04, X, hb + 0.72, Z + 0.18, '#d9d2c2');
    [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach((p) => gb.box(0.04, 0.46, 0.04, X + p[0], hb + 0.23, Z + p[1], '#cfc8b8'));
  }
  // clothes line posts
  [b.x0 + 0.3, b.x1 - 0.3].forEach((gxp) => {
    gb.cyl(0.015, 0.015, 2.1, s * (ZW - BAL_D + 0.22), hb + 1.05, -gxp, '#3a3030', 5);
  });
  gb.box(0.012, 0.012, b.x1 - b.x0 - 0.6, s * (ZW - BAL_D + 0.22), hb + 2.1, -(b.x0 + b.x1) / 2, '#2a2222');
  // register the clothes on the line
  const cn = Math.max(2, Math.round((b.x1 - b.x0 - 0.6) / 0.42));
  for (let k = 0; k < cn; k++) {
    const t = (k + 0.5) / cn;
    FX.clothesData.push({ x: lerp(b.x0 + 0.3, b.x1 - 0.3, t), h: hb + 2.1, d: ZW - BAL_D + 0.22, s, w: 0.3 + (k % 2) * 0.04, len: 0.55 + ((k + bi) % 3) * 0.13, c: ['#e23e57', '#f5e6c4', '#2f80c9', '#f2b01e', '#3f9e5a', '#c43372'][(bi + k) % 6], ph: bi * 1.7 + k });
  }
}

function buildWindows(root) {
  const nG = WIN.filter((w) => w.type === 'glass').length, nS = WIN.length - nG;
  const unitFrame = (mull) => {
    const g = new GB(), c = '#eadfc6';
    g.box(1.1, 0.07, 0.1, 0, 0.5, 0, c); g.box(1.1, 0.07, 0.1, 0, -0.5, 0, c);
    g.box(0.07, 1.0, 0.1, -0.5, 0, 0, c); g.box(0.07, 1.0, 0.1, 0.5, 0, 0, c);
    if (mull) { g.box(0.035, 1.0, 0.08, 0, 0, 0, c); g.box(1.0, 0.035, 0.08, 0, 0.1, 0, c); }
    return g.build();
  };
  const fm = matFlat({ roughness: 0.7 });
  const iFrameG = new THREE.InstancedMesh(unitFrame(true), fm, nG);
  const iFrameS = new THREE.InstancedMesh(unitFrame(false), fm, nS);
  const glassTex = canvasTex(paintGlass());
  const gm = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.1, metalness: 0.2, envMapIntensity: 1.8, emissive: new THREE.Color('#ffc880'), emissiveMap: glassTex, emissiveIntensity: 0.16 });
  const iGlass = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), gm, nG);
  const dm = new THREE.MeshBasicMaterial({ color: '#150e0b' });
  const iDark = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dm, WIN.length);
  const louver = canvasTex(paintLouver());
  const sm = new THREE.MeshStandardMaterial({ map: louver, roughness: 0.8, color: '#ffffff' });
  const iShut = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), sm, nS * 2);
  // cracked-glass shards left in the frame
  const cg = [];
  const quad = (a, b, c, d) => { cg.push(a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0, a[0], a[1], 0, c[0], c[1], 0, d[0], d[1], 0); };
  quad([-0.5, 0.5], [-0.2, 0.28], [-0.4, -0.05], [-0.5, 0.02]);
  quad([0.5, -0.5], [0.15, -0.3], [0.3, 0.0], [0.5, -0.06]);
  cg.push(0.5, 0.5, 0, 0.28, 0.32, 0, 0.5, 0.2, 0);
  const crackG = new THREE.BufferGeometry(); crackG.setAttribute('position', new THREE.Float32BufferAttribute(cg, 3));
  crackG.setAttribute('normal', new THREE.Float32BufferAttribute(cg.map((v, i) => (i % 3 === 2 ? 1 : 0)), 3));
  crackG.computeVertexNormals();
  const iCrack = new THREE.InstancedMesh(crackG, new THREE.MeshStandardMaterial({ color: '#f3ecdc', roughness: 0.4, side: THREE.DoubleSide }), nG);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), E = new THREE.Euler();
  let gi = 0, si = 0, di = 0;
  const place = (mesh, idx, side, cx, cy, dd, sx, sy, flip) => {
    E.set(0, side > 0 ? -PI / 2 : PI / 2, 0); Q.setFromEuler(E);
    P.set(side * (ZW - dd), cy, -cx); Sc.set(sx, sy, 1);
    M.compose(P, Q, Sc); mesh.setMatrixAt(idx, M);
  };
  const tc = new THREE.Color();
  WIN.forEach((w, wi) => {
    const cy = (w.h0 + w.h1) / 2, hh = w.h1 - w.h0;
    place(iDark, di++, w.side, w.cx, cy, 0.02, w.w + 0.1, hh + 0.1);
    const frameCol = (wi % 4 === 0) ? '#d8efe9' : (wi % 5 === 0) ? '#f4d9c0' : '#eadfc6';
    if (w.type === 'glass') {
      place(iFrameG, gi, w.side, w.cx, cy, 0.07, w.w + 0.12, hh + 0.12);
      iFrameG.setColorAt(gi, tc.set(frameCol));
      place(iGlass, gi, w.side, w.cx, cy, 0.05, w.w, hh, wi % 2 === 0);
      iGlass.setColorAt(gi, tc.setRGB(0.88 + 0.12 * ((wi * 37) % 10) / 10, 0.92, 0.95));
      place(iCrack, gi, w.side, w.cx, cy, 0.035, 0, 0);
      w.gi = gi; gi++;
    } else {
      place(iFrameS, si, w.side, w.cx, cy, 0.07, w.w + 0.12, hh + 0.12);
      iFrameS.setColorAt(si, tc.set(frameCol));
      const lw = w.w / 2 - 0.02;
      place(iShut, si * 2, w.side, w.cx - w.w / 4, cy, 0.075, lw, hh - 0.04);
      place(iShut, si * 2 + 1, w.side, w.cx + w.w / 4, cy, 0.075, lw, hh - 0.04, true);
      iShut.setColorAt(si * 2, tc.set(w.col)); iShut.setColorAt(si * 2 + 1, tc.set(w.col));
      si++;
    }
  });
  FX.crackBase = []; FX.glassBase = [];
  WIN.forEach((w) => {
    if (w.type !== 'glass') return;
    const m1 = new THREE.Matrix4(); iGlass.getMatrixAt(w.gi, m1); FX.glassBase[w.gi] = m1;
    const cy = (w.h0 + w.h1) / 2, hh = w.h1 - w.h0;
    place(iCrack, w.gi, w.side, w.cx, cy, 0.035, w.w, hh);
    const m2 = new THREE.Matrix4(); iCrack.getMatrixAt(w.gi, m2); FX.crackBase[w.gi] = m2;
    place(iCrack, w.gi, w.side, w.cx, cy, 0.035, 0, 0);
  });
  [iFrameG, iFrameS, iGlass, iDark, iShut, iCrack].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; root.add(m); });
  FX.glass = iGlass; FX.crack = iCrack;
  FX.zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
}
function setWindowBroken(w, broken) {
  if (w.type !== 'glass' || !FX.glass) return;
  FX.glass.setMatrixAt(w.gi, broken ? FX.zeroM : FX.glassBase[w.gi]);
  FX.crack.setMatrixAt(w.gi, broken ? FX.crackBase[w.gi] : FX.zeroM);
  FX.glass.instanceMatrix.needsUpdate = true; FX.crack.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------ ground, props, sky */
function planeXZ(w, d, cx, cz, y, tile) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-PI / 2);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + cx) / tile, (p.getZ(i) + cz) / tile);
  g.translate(cx, y, cz);
  return g;
}
function buildGround(root) {
  const conc = canvasTex(paintConcrete(), { repeat: true });
  const lane = new THREE.Mesh(planeXZ(5.4, 46, 0, -11, 0, 2.9), new THREE.MeshStandardMaterial({ map: conc, bumpMap: conc, bumpScale: 1.6, roughness: 0.95, color: '#ffffff' }));
  lane.receiveShadow = true; root.add(lane);
  const road = new THREE.Mesh(planeXZ(80, 120, 0, -92, -0.02, 6), new THREE.MeshStandardMaterial({ map: conc, roughness: 1, color: '#9a8a78' }));
  road.receiveShadow = true; root.add(road);
  const behind = new THREE.Mesh(planeXZ(40, 40, 0, 32, -0.02, 6), new THREE.MeshStandardMaterial({ color: '#7d6a5a', roughness: 1 }));
  root.add(behind);
  // chalk: the batting line, the far line the batter runs to, and the batting box
  const cw = 512, ch = 896, gx0 = -2.2, gx1 = 6.2;
  const cv = mkCanvas(cw, ch), c = cv.getContext('2d');
  const px = (z) => (z + 2.4) / 4.8 * cw, py = (x) => (gx1 - x) / (gx1 - gx0) * ch;
  c.lineCap = 'round';
  const sr = A.rng(31);
  const chalk = (x0, y0, x1, y1, a, w) => {
    c.strokeStyle = 'rgba(255,255,250,' + a + ')'; c.lineWidth = w;
    c.beginPath(); c.moveTo(x0, y0);
    const n = 10; for (let i = 1; i <= n; i++) { const t = i / n; c.lineTo(lerp(x0, x1, t) + (sr() - 0.5) * 1.6, lerp(y0, y1, t) + (sr() - 0.5) * 1.6); }
    c.stroke();
  };
  [HOME_SAFE, CHALK_X].forEach((x) => { chalk(px(-2.35), py(x), px(2.35), py(x), 0.86, 8); chalk(px(-2.35), py(x) + 3, px(2.35), py(x) + 3, 0.3, 3); });
  const bx0 = px(-1.2), bx1 = px(1.2), by0 = py(HOME_SAFE), by1 = py(-1.35);
  chalk(bx0, by0, bx0, by1, 0.6, 5); chalk(bx1, by0, bx1, by1, 0.6, 5); chalk(bx0, by1, bx1, by1, 0.6, 5);
  // the stumps and tally marks drawn on the road behind the crate
  for (let k = 0; k < 5; k++) chalk(px(1.5) + k * 9, py(-1.7), px(1.5) + k * 9 + 1, py(-1.7) - 22, 0.7, 4);
  chalk(px(1.5) - 4, py(-1.7) - 4, px(1.5) + 40, py(-1.7) - 20, 0.7, 4);
  const ct = canvasTex(cv, { aniso: 8 });
  const dec = new THREE.Mesh(new THREE.PlaneGeometry(4.8, gx1 - gx0).rotateX(-PI / 2).translate(0, 0.012, -(gx0 + gx1) / 2),
    new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true }));
  dec.renderOrder = 1; root.add(dec);
  // pothole, crack and stones decals (moved by newPatches)
  const kinds = ['pot', 'crack', 'stones'];
  const pts = {};
  kinds.forEach((k) => {
    const cv2 = mkCanvas(256, 128), c2 = cv2.getContext('2d'), s2 = A.rng(k.length * 77);
    c2.translate(128, 64);
    if (k === 'pot') {
      const g = c2.createRadialGradient(0, 0, 8, 0, 0, 62); g.addColorStop(0, 'rgba(20,12,8,.96)'); g.addColorStop(0.62, 'rgba(34,22,14,.9)'); g.addColorStop(0.8, 'rgba(120,98,76,.7)'); g.addColorStop(1, 'rgba(120,98,76,0)');
      c2.save(); c2.scale(1, 0.62); c2.fillStyle = g; c2.beginPath(); c2.arc(0, 0, 62, 0, TAU); c2.fill(); c2.restore();
      c2.fillStyle = 'rgba(255,230,190,.18)'; c2.beginPath(); c2.ellipse(-20, -18, 30, 5, 0.1, 0, TAU); c2.fill();
    } else if (k === 'crack') {
      c2.strokeStyle = 'rgba(20,12,8,.95)'; c2.lineWidth = 5; c2.lineCap = 'round'; c2.beginPath(); c2.moveTo(-110, 4);
      for (let i = 1; i <= 9; i++) c2.lineTo(-110 + i * 24, (s2() - 0.5) * 40);
      c2.stroke(); c2.lineWidth = 3; c2.beginPath(); c2.moveTo(-10, 0); c2.lineTo(8, 30); c2.lineTo(34, 46); c2.stroke();
    } else {
      for (let i = 0; i < 26; i++) { c2.fillStyle = 'rgba(' + (60 + s2() * 90 | 0) + ',' + (50 + s2() * 70 | 0) + ',' + (40 + s2() * 50 | 0) + ',.95)'; c2.beginPath(); c2.ellipse((s2() - 0.5) * 190, (s2() - 0.5) * 80, 5 + s2() * 9, 4 + s2() * 6, s2() * 3, 0, TAU); c2.fill(); }
    }
    pts[k] = canvasTex(cv2);
  });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: pts.pot, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.position.y = 0.014; m.visible = false; m.renderOrder = 2; root.add(m);
    FX.patches.push({ mesh: m, texs: pts });
  }
  // the road beyond the gate, with a zebra crossing and a lane line
  const rc = mkCanvas(256, 256), r2 = rc.getContext('2d');
  r2.fillStyle = 'rgba(255,255,255,0)'; r2.clearRect(0, 0, 256, 256);
  r2.fillStyle = 'rgba(255,248,230,.7)';
  for (let i = 0; i < 8; i++) r2.fillRect(8 + i * 30, 20, 16, 216);
  const zt = canvasTex(rc);
  const zebra = new THREE.Mesh(new THREE.PlaneGeometry(12, 5).rotateX(-PI / 2).translate(0, 0.01, -35.5), new THREE.MeshBasicMaterial({ map: zt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  root.add(zebra);
}

function buildBackdrops(root) {
  // the closed end of the lane: brick, a drain pipe and the house rules in chalk
  const brick = canvasTex(paintBrick(), { repeat: true });
  const bg = new THREE.BoxGeometry(5.4, 7.3, 0.5);
  const uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.7, uv.getY(i) * 3.65);
  const wall = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: brick, bumpMap: brick, bumpScale: 3, roughness: 0.95, color: '#c9aea4' }));
  wall.position.set(0, 3.65, -END_X + 0.3); wall.receiveShadow = true; wall.castShadow = true; root.add(wall);
  const gc = mkCanvas(1024, 512), g = gc.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.82)'; g.lineWidth = 7; g.lineCap = 'round';
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(80 + k * 36, 470); g.lineTo(82 + k * 36, 250); g.stroke(); }
  g.beginPath(); g.moveTo(66, 262); g.lineTo(184, 252); g.stroke();
  for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(72 + k * 14, 150); g.lineTo(72 + k * 14, 205); g.stroke(); }
  g.beginPath(); g.moveTo(60, 140); g.lineTo(150, 214); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.88)'; g.textAlign = 'left';
  const rules = ['HOUSE RULES', '1 tip 1 hand = OUT', 'glass = OUT', 'roof = 6 + OUT', 'gate = 4', 'wall = 2'];
  rules.forEach((t, i) => { g.font = (i ? '600 38px ' : '700 46px ') + FONT_SERIF; g.fillText(t, 300, 80 + i * 66); });
  const gt = canvasTex(gc);
  const chalkDecal = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false }));
  chalkDecal.position.set(0, 2.9, -END_X + 0.02); chalkDecal.rotation.y = PI; root.add(chalkDecal);

  // a garage doorway on the left of the closed end, with double doors that open for the auto
  const gb = new GB(), wallC = '#c78f6c';
  const gpx = -(ZW + 0.5);
  gb.box(1.0, 3.7, 0.3, gpx, 1.85, -END_X - 0.15, wallC); // left pier at the end
  gb.box(1.0, 3.7, 0.4, gpx, 1.85, -(-9.25 + -9.0) / 2 - 0.0, wallC);
  gb.box(1.0, 1.1, 2.9, gpx, 3.15, -(END_X + -9.0) / 2, shadeC(wallC, 0.1)); // lintel
  gb.box(0.4, 0.2, 3.1, gpx + 0.35, 3.75, -(END_X + -9.0) / 2, shadeC(wallC, 0.3));
  gb.box(2.6, 0.2, 3.0, -(ZW + 1.5), 3.7, -(END_X + -9.0) / 2, '#6d5a4c');
  gb.box(2.4, 0.04, 2.9, -(ZW + 1.6), 0.03, -(END_X + -9.0) / 2, '#5b4d44');
  gb.box(0.2, 3.2, 3.0, -(ZW + 3.0), 1.6, -(END_X + -9.0) / 2, '#4a3c34');
  const gm = new THREE.Mesh(gb.build(), matFlat()); gm.castShadow = true; gm.receiveShadow = true; root.add(gm);
  // interior glow
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd58a' }));
  lamp.position.set(-(ZW + 1.8), 2.6, -(END_X + -9.0) / 2); root.add(lamp);
  const leafGeo = new THREE.BoxGeometry(0.06, 2.55, 1.2); leafGeo.translate(0, 1.275, -0.6);
  const lc = mkCanvas(64, 128), l2 = lc.getContext('2d');
  l2.fillStyle = '#2f6a4a'; l2.fillRect(0, 0, 64, 128); l2.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 8; y < 128; y += 16) l2.fillRect(4, y, 56, 3);
  l2.fillStyle = 'rgba(255,255,255,.12)'; l2.fillRect(0, 0, 64, 4); l2.strokeStyle = 'rgba(0,0,0,.4)'; l2.lineWidth = 3; l2.strokeRect(1, 1, 62, 126);
  const lm = new THREE.MeshStandardMaterial({ map: canvasTex(lc), roughness: 0.7 });
  [[-11.75, 1], [-9.25, -1]].forEach((hg) => {
    const piv = new THREE.Group(); piv.position.set(-ZN, 0, -hg[0]);
    const leaf = new THREE.Mesh(leafGeo, lm); leaf.castShadow = true;
    if (hg[1] < 0) leaf.rotation.y = PI; // right leaf extends toward +z
    piv.add(leaf); root.add(piv); FX.garage.push({ piv, dir: hg[1] });
  });

  // the gate at the far end, and the street beyond it
  const pg = new GB();
  [-1, 1].forEach((s) => {
    pg.box(0.6, 2.9, 0.6, s * 2.32, 1.45, -30.35, '#e4d6b8'); pg.box(0.75, 0.18, 0.75, s * 2.32, 2.95, -30.35, '#c9b48a'); pg.box(0.4, 0.5, 0.4, s * 2.32, 3.3, -30.35, '#e4d6b8');
    pg.sph(0.18, s * 2.32, 3.7, -30.35, '#c9b48a', 1, 1, 1, 8);
  });
  const gm2 = new THREE.Mesh(pg.build(), matFlat()); gm2.castShadow = true; root.add(gm2);
  const arcCv = paintSign(1024, 160, '#2f5d3c', '#f5e6c4', 'GULMOHAR COLONY', '', { f1: 0.42 });
  const at = canvasTex(arcCv);
  const arch = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.62), new THREE.MeshStandardMaterial({ map: at, roughness: 0.6, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveMap: at, emissiveIntensity: 0.12 }));
  arch.position.set(0, 3.25, -30.35); arch.castShadow = true; root.add(arch);
  // the open iron gate leaf, folded back against the right-hand wall
  const gl = new GB();
  gl.box(0.05, 0.08, 2.5, 0, 2.1, 0, '#2f5d3c'); gl.box(0.05, 0.08, 2.5, 0, 1.2, 0, '#2f5d3c'); gl.box(0.05, 0.08, 2.5, 0, 0.1, 0, '#2f5d3c');
  for (let z = -1.2; z <= 1.2; z += 0.2) gl.box(0.04, 2.1, 0.04, 0, 1.1, z, '#2f5d3c');
  const gleaf = new THREE.Mesh(gl.build(), matFlat()); gleaf.position.set(ZW - 0.15, 0, -28.6); gleaf.castShadow = true; root.add(gleaf);

  // street beyond the gate: a painted scene with a bus, a tree and a skyline in haze
  const sc = mkCanvas(1024, 512), s = sc.getContext('2d'), sr = A.rng(6);
  let gr = s.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#fbe3b0'); gr.addColorStop(0.6, '#ffd28a'); gr.addColorStop(1, '#f0a45e');
  s.fillStyle = gr; s.fillRect(0, 0, 1024, 512);
  [['#e7b29a', 190, 380, 60, 140], ['#d68f8f', 120, 300, 50, 120], ['#b9707f', 70, 230, 40, 100]].forEach((L) => {
    let x = -20;
    while (x < 1050) {
      const w = L[3] + sr() * L[4], h = L[1] + sr() * (L[2] - L[1]) * 0.6;
      s.fillStyle = L[0]; s.fillRect(x, 440 - h, w, h);
      s.fillStyle = 'rgba(255,255,255,.12)'; s.fillRect(x, 440 - h, w, 5);
      for (let wy = 440 - h + 18; wy < 420; wy += 26) for (let wx2 = x + 8; wx2 < x + w - 12; wx2 += 20) if (sr() < 0.5) { s.fillStyle = sr() < 0.18 ? 'rgba(255,222,140,.9)' : 'rgba(80,40,60,.2)'; s.fillRect(wx2, wy, 8, 12); }
      x += w * 0.85;
    }
  });
  s.fillStyle = '#6e5a4e'; s.fillRect(0, 440, 1024, 72);
  s.fillStyle = '#c64b3a'; s.beginPath(); s.roundRect ? s.roundRect(300, 380, 270, 100, 14) : s.rect(300, 380, 270, 100); s.fill();
  s.fillStyle = '#f5e6c4'; for (let k = 0; k < 6; k++) s.fillRect(318 + k * 42, 396, 32, 34);
  s.fillStyle = '#2a2a2a'; s.beginPath(); s.arc(360, 480, 20, 0, TAU); s.arc(520, 480, 20, 0, TAU); s.fill();
  s.fillStyle = '#4b3224'; s.fillRect(745, 330, 12, 150); s.fillStyle = '#5a7a3a'; s.beginPath(); s.arc(750, 300, 62, 0, TAU); s.arc(800, 330, 48, 0, TAU); s.arc(700, 335, 46, 0, TAU); s.fill();
  s.fillStyle = 'rgba(255,230,160,.35)'; s.beginPath(); s.arc(730, 280, 28, 0, TAU); s.fill();
  const bt = canvasTex(sc);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(62, 31), new THREE.MeshBasicMaterial({ map: bt, fog: true }));
  back.position.set(0, 11, -78); root.add(back);
  FX.backdrop = back;
}

function buildProps(root) {
  const gb = new GB();
  // curbs and a drain grate
  [1, -1].forEach((s) => {
    gb.box(0.32, 0.15, 46, s * (ZW - 0.16), 0.075, -11, '#9d8e78');
    gb.box(0.04, 0.16, 46, s * (ZW - 0.34), 0.08, -11, '#7e705c');
  });
  gb.box(0.7, 0.04, 0.5, -(ZW - 0.45), 0.02, -9.4, '#241e1a');
  for (let i = 0; i < 6; i++) gb.box(0.04, 0.05, 0.46, -(ZW - 0.45) - 0.28 + i * 0.11, 0.045, -9.4, '#6b625a');
  // a parked scooter by the shop
  const sx = 1.7, sz = -15;
  gb.cyl(0.22, 0.22, 0.1, sx, 0.22, sz + 0.55, '#262626', 14, 0, PI / 2); gb.cyl(0.22, 0.22, 0.1, sx, 0.22, sz - 0.55, '#262626', 14, 0, PI / 2);
  gb.cyl(0.1, 0.1, 0.12, sx, 0.22, sz + 0.55, '#b8b8bc', 8, 0, PI / 2); gb.cyl(0.1, 0.1, 0.12, sx, 0.22, sz - 0.55, '#b8b8bc', 8, 0, PI / 2);
  gb.box(0.36, 0.22, 1.0, sx, 0.34, sz + 0.1, '#2f80c9'); gb.box(0.4, 0.12, 0.55, sx, 0.52, sz + 0.3, '#1d1d22');
  gb.box(0.34, 0.6, 0.12, sx, 0.52, sz - 0.4, '#2f80c9', 0, -0.25); gb.box(0.5, 0.04, 0.06, sx, 0.98, sz - 0.5, '#2a2a2a');
  gb.sph(0.07, sx, 0.92, sz - 0.56, '#fff3c0', 1, 1, 1, 8); gb.box(0.2, 0.08, 0.5, sx, 0.2, sz + 0.12, '#cfcfd3');
  // a stack of crates near the batter's end, a dustbin, a handcart of oranges
  const cc = ['#2f80c9', '#e23e57', '#f2b01e'];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 2 - (r > 1 ? 1 : 0); k++) {
    const x = 1.95 - k * 0.5 + (r % 2) * 0.12, y = 0.15 + r * 0.3, z = -6.6 + (r === 1 ? 0.05 : 0);
    gb.box(0.46, 0.28, 0.6, x, y, z, cc[(r + k) % 3]);
    for (let h = 0; h < 3; h++) gb.box(0.06, 0.1, 0.01, x - 0.12 + h * 0.12, y + 0.02, z - 0.305, '#161212');
  }
  gb.cyl(0.26, 0.22, 0.7, -2.1, 0.35, -5.0, '#2f6fb0', 12); gb.cyl(0.28, 0.28, 0.05, -2.1, 0.72, -5.0, '#1f4f80', 12);
  const tx = 1.9, tz = -23.4;
  gb.box(0.8, 0.07, 1.6, tx, 0.62, tz, '#6b4a2e'); gb.box(0.04, 0.2, 1.6, tx - 0.4, 0.74, tz, '#4a321f'); gb.box(0.04, 0.2, 1.6, tx + 0.4, 0.74, tz, '#4a321f');
  gb.cyl(0.3, 0.3, 0.06, tx - 0.45, 0.3, tz + 0.3, '#242428', 14, 0, PI / 2); gb.cyl(0.3, 0.3, 0.06, tx + 0.45, 0.3, tz + 0.3, '#242428', 14, 0, PI / 2);
  gb.box(0.04, 0.04, 1.2, tx - 0.3, 0.6, tz + 1.4, '#4a321f'); gb.box(0.04, 0.04, 1.2, tx + 0.3, 0.6, tz + 1.4, '#4a321f');
  for (let i = 0; i < 18; i++) gb.sph(0.09, tx - 0.28 + (i % 4) * 0.19, 0.76 + floor(i / 9) * 0.14, tz - 0.55 + ((i * 7) % 9) * 0.14, i % 3 ? '#d9822b' : '#e8932f', 1, 1, 1, 8);
  // bicycles outside the cycle shop (left row)
  for (let b = 0; b < 3; b++) {
    const bx = -2.0, bz = -(9.6 + b * 0.9);
    gb.add(new THREE.TorusGeometry(0.3, 0.02, 6, 16), '#2a2a2a', bx, 0.32, bz + 0.45, 0, PI / 2, 0);
    gb.add(new THREE.TorusGeometry(0.3, 0.02, 6, 16), '#2a2a2a', bx, 0.32, bz - 0.45, 0, PI / 2, 0);
    gb.box(0.03, 0.03, 0.9, bx, 0.52, bz, ['#e23e57', '#2f80c9', '#3f9e5a'][b], 0, 0.1);
    gb.box(0.03, 0.4, 0.03, bx, 0.62, bz - 0.4, '#2a2a2a'); gb.box(0.28, 0.03, 0.03, bx, 0.84, bz - 0.42, '#2a2a2a'); gb.box(0.1, 0.04, 0.2, bx, 0.78, bz + 0.2, '#1d1d22');
  }
  // electric poles with cross arms, insulators and meter boxes
  POLES.forEach((p) => {
    const z = -p;
    gb.cyl(0.075, 0.095, 8.4, 2.42, 4.2, z, '#4b4742', 8);
    gb.box(1.1, 0.08, 0.1, 2.0, 7.7, z, '#322f2b');
    for (let k = 0; k < 3; k++) gb.cyl(0.03, 0.03, 0.1, wireZ(k), 7.78, z, '#8f8a80', 6);
    gb.box(0.2, 0.28, 0.1, 2.3, 3.2, z, '#322f2b');
  });
  // roof furniture: water tanks and a dish
  [[1, 4.2], [1, 20.5], [-1, 3.0], [-1, 17.5], [1, -3.0], [-1, -7.0]].forEach((t, i) => {
    const hs = ROWS[t[0]].find((h) => t[1] >= h.x0 && t[1] < h.x1) || ROWS[t[0]][0];
    const H = roofOf(hs), X = t[0] * (ZW + 0.8), Z = -t[1];
    gb.cyl(0.55, 0.55, 0.95, X, H + 0.9, Z, i % 2 ? '#2f5f8a' : '#232323', 14);
    gb.cyl(0.45, 0.5, 0.12, X, H + 1.42, Z, i % 2 ? '#244b6b' : '#161616', 14);
    [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].forEach((p) => gb.box(0.06, 0.45, 0.06, X + p[0], H + 0.25, Z + p[1], '#3a3a3a'));
    gb.cyl(0.02, 0.02, 1.4, X + 1.0, H + 0.7, Z + 0.6, '#555', 5); gb.sph(0.28, X + 1.0, H + 1.4, Z + 0.6, '#d9d2c2', 1, 0.35, 1, 10);
  });
  const props = new THREE.Mesh(gb.build(), matFlat());
  props.castShadow = true; props.receiveShadow = true; root.add(props);
}

function buildOverhead(root) {
  // wires between the poles
  const pos = [];
  WIRES.forEach((w, k) => {
    for (let x = POLES[0]; x < POLES[POLES.length - 1] - 0.01; x += 0.5) {
      pos.push(wireZ(k), wireH(k, x), -x, wireZ(k), wireH(k, x + 0.5), -(x + 0.5));
    }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const wires = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#171313' }));
  wires.frustumCulled = false; root.add(wires);
  // strings of paper flags across the lane
  const strings = [{ gx: 11.3, h: 6.5, sag: 0.8, n: 22 }, { gx: 19.2, h: 6.7, sag: 0.9, n: 22 }];
  const lg = []; const fcols = ['#e23e57', '#f2b01e', '#3f9e5a', '#2f80c9', '#ee7a33', '#8a56c9'];
  strings.forEach((st) => {
    for (let i = 0; i < 40; i++) {
      const t0 = i / 40, t1 = (i + 1) / 40;
      const p = (t) => [lerp(-ZN + 0.1, ZN - 0.1, t), st.h - st.sag * 4 * t * (1 - t), -st.gx];
      lg.push.apply(lg, p(t0).concat(p(t1)));
    }
    for (let i = 0; i < st.n; i++) {
      const t = (i + 0.5) / st.n;
      FX.flagData.push({ x: lerp(-ZN + 0.1, ZN - 0.1, t), y: st.h - st.sag * 4 * t * (1 - t) - 0.01, z: -st.gx, c: fcols[i % fcols.length], ph: i * 0.7 + st.gx });
    }
  });
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(lg, 3));
  const sl = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#2a2020' })); sl.frustumCulled = false; root.add(sl);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 0, 0, 0.1, 0, 0, 0, -0.26, 0], 3));
  tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const flags = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12 }), FX.flagData.length);
  FX.flagData.forEach((f, i) => flags.setColorAt(i, new THREE.Color(f.c)));
  flags.frustumCulled = false; root.add(flags); FX.flags = flags;
  // clothes on the balcony lines
  const cg = new THREE.PlaneGeometry(1, 1); cg.translate(0, -0.5, 0);
  const cl = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.9 }), FX.clothesData.length);
  FX.clothesData.forEach((c, i) => cl.setColorAt(i, new THREE.Color(c.c)));
  cl.frustumCulled = false; root.add(cl); FX.clothes = cl;
}

function updateSwayers(t) {
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), Qz = new THREE.Quaternion();
  FX.clothesData.forEach((c, i) => {
    const sw = sin(t * 1.7 + c.ph) * 0.1;
    E.set(0, c.s > 0 ? -PI / 2 : PI / 2, 0); Q.setFromEuler(E);
    Qz.setFromAxisAngle(V3(0, 0, 1), sw); Q.premultiply(Qz);
    P.set(c.s * (ZW - c.d), c.h, -c.x); S.set(c.w, c.len, 1);
    M.compose(P, Q, S); FX.clothes.setMatrixAt(i, M);
  });
  FX.clothes.instanceMatrix.needsUpdate = true;
  FX.flagData.forEach((f, i) => {
    E.set(sin(t * 2.2 + f.ph) * 0.18, 0, 0); Q.setFromEuler(E);
    P.set(f.x, f.y, f.z); S.set(1, 1, 1);
    M.compose(P, Q, S); FX.flags.setMatrixAt(i, M);
  });
  FX.flags.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------ characters and actors */
const HIP_Y = 0.75;
let KID_MAT = null;
function buildKid(st, o) {
  o = o || {};
  const skin = st.skin, tee = st.tee, sh = st.shorts;
  // legs: origin at the hip
  const mkLeg = () => {
    const g = new GB();
    g.cyl(0.07, 0.062, 0.3, 0, -0.15, 0, sh, 9); g.cyl(0.045, 0.038, 0.38, 0, -0.49, 0, skin, 8);
    g.box(0.095, 0.07, 0.21, 0, -0.715, 0.04, st.shoe || '#eee'); g.box(0.1, 0.02, 0.215, 0, -0.745, 0.04, '#3a3a3a');
    return g.build();
  };
  const mkArm = () => {
    const g = new GB();
    g.cyl(0.046, 0.042, 0.2, 0, -0.1, 0, tee, 8); g.cyl(0.037, 0.032, 0.22, 0, -0.31, 0, skin, 8); g.sph(0.04, 0, -0.44, 0, skin, 1, 1, 1, 8);
    return g.build();
  };
  const torso = new GB(); const dy = -HIP_Y;
  torso.add(new THREE.CylinderGeometry(0.135, 0.12, 0.4, 12, 1), tee, 0, 0.95 + dy, 0, 0, 0, 0, 1, 1, 0.72);
  torso.add(new THREE.CylinderGeometry(0.126, 0.132, 0.14, 12, 1), sh, 0, 0.78 + dy, 0, 0, 0, 0, 1, 1, 0.76);
  torso.cyl(0.04, 0.045, 0.07, 0, 1.17 + dy, 0, skin, 8);
  torso.sph(0.05, -0.17, 1.08 + dy, 0, tee, 1, 1, 1, 8); torso.sph(0.05, 0.17, 1.08 + dy, 0, tee, 1, 1, 1, 8);
  const head = new GB(), hy = 1.27 + dy;
  head.sph(0.115, 0, hy, 0, skin, 0.95, 1.05, 1, 14);
  head.sph(0.014, -0.042, hy + 0.012, 0.104, '#161010', 1, 1, 1, 6); head.sph(0.014, 0.042, hy + 0.012, 0.104, '#161010', 1, 1, 1, 6);
  head.sph(0.02, 0, hy - 0.02, 0.118, shadeC(skin, -0.12), 1, 1, 1, 6);
  head.sph(0.026, -0.112, hy - 0.005, 0, skin, 0.6, 1, 1, 6); head.sph(0.026, 0.112, hy - 0.005, 0, skin, 0.6, 1, 1, 6);
  if (st.cap) {
    head.add(new THREE.SphereGeometry(0.127, 14, 8, 0, TAU, 0, PI * 0.5), st.cap, 0, hy + 0.02, -0.004, -0.15, 0, 0);
    head.add(new THREE.CylinderGeometry(0.125, 0.125, 0.012, 14, 1, false, -PI / 2, PI), st.cap, 0, hy + 0.062, 0.05, 0.22, 0, 0);
  } else {
    head.add(new THREE.SphereGeometry(0.123, 14, 8, 0, TAU, 0, PI * 0.56), st.hair, 0, hy + 0.012, -0.012, -0.42, 0, 0);
    head.sph(0.05, 0, hy + 0.1, -0.06, st.hair, 1, 0.9, 1, 8);
  }
  if (!KID_MAT) KID_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const root = new THREE.Group(), body = new THREE.Group();
  body.position.y = HIP_Y; root.add(body);
  const tm = new THREE.Mesh(torso.build(), KID_MAT), hm = new THREE.Mesh(head.build(), KID_MAT);
  tm.castShadow = hm.castShadow = true; body.add(tm); body.add(hm);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.07, HIP_Y, 0); legR.position.set(0.07, HIP_Y, 0);
  const lg = mkLeg(); [legL, legR].forEach((g) => { const m = new THREE.Mesh(lg, KID_MAT); m.castShadow = true; g.add(m); root.add(g); });
  const rig = { root, body, legL, legR, head: hm };
  const ag = mkArm();
  if (!o.batter) {
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.18, 1.08 - HIP_Y, 0); armR.position.set(0.18, 1.08 - HIP_Y, 0);
    [armL, armR].forEach((g) => { const m = new THREE.Mesh(ag, KID_MAT); m.castShadow = true; g.add(m); body.add(g); });
    rig.armL = armL; rig.armR = armR;
  } else {
    // both hands on the handle: the arms and the bat swing as one
    const swing = new THREE.Group(); swing.position.set(0, 1.08 - HIP_Y, 0.02); swing.rotation.order = 'YXZ';
    const aL = new THREE.Group(), aR = new THREE.Group();
    aL.position.set(-0.17, 0, 0); aL.rotation.z = 0.4; aR.position.set(0.17, 0, 0); aR.rotation.z = -0.4;
    [aL, aR].forEach((g) => { const m = new THREE.Mesh(ag, KID_MAT); m.castShadow = true; g.add(m); swing.add(g); });
    const bt = new GB();
    bt.cyl(0.017, 0.017, 0.32, 0, 0.0, 0, '#1d1d22', 8);
    bt.cyl(0.024, 0.04, 0.12, 0, -0.2, 0, '#c9a46a', 8);
    bt.add(new THREE.BoxGeometry(0.11, 0.6, 0.036), '#dcb878', 0, -0.52, 0);
    bt.box(0.05, 0.54, 0.03, 0, -0.5, -0.03, '#b58f55'); bt.box(0.1, 0.05, 0.034, 0, -0.84, 0, '#8d6a3a');
    bt.box(0.112, 0.03, 0.038, 0, -0.38, 0, '#f2efe6');
    const bm = new THREE.Mesh(bt.build(), KID_MAT); bm.castShadow = true;
    bm.position.set(0, -0.4, 0.02); swing.add(bm);
    body.add(swing); rig.swing = swing; rig.bat = bm;
  }
  root.scale.setScalar(o.scale || 1);
  return rig;
}
const wrapA = (a) => { a = a % TAU; if (a > PI) a -= TAU; if (a < -PI) a += TAU; return a; };
function poseKid(rig, p) {
  const w = p.walk || 0, s = sin(p.phase || 0), c = p.crouch || 0;
  rig.legL.rotation.x = s * 0.85 * w + c * 0.55;
  rig.legR.rotation.x = -s * 0.85 * w - c * 0.35;
  if (rig.armL) {
    rig.armL.rotation.x = (p.armL != null) ? p.armL : -s * 0.8 * w;
    rig.armR.rotation.x = (p.armR != null) ? p.armR : s * 0.8 * w;
    rig.armL.rotation.z = p.spread ? p.spread : 0.06; rig.armR.rotation.z = p.spread ? -p.spread : -0.06;
  }
  rig.body.position.y = HIP_Y + (p.bob || 0) + abs(cos(p.phase || 0)) * 0.035 * w - c * 0.17;
  rig.body.rotation.x = -(p.lean || 0) * 0.16 + c * 0.2;
  rig.body.rotation.z = sin((p.phase || 0) * 0.5) * 0.04 * w;
  if (p.dive) { rig.root.rotation.x = -p.dive * 0.9; rig.root.position.y = 0.0; } else rig.root.rotation.x = 0;
}

function buildCrate(root) {
  const g = new THREE.Group();
  const gb = new GB();
  const w = 0.42, h = 0.7, d = 0.34;
  gb.box(w, h, d, 0, h / 2, 0, '#e0562f');
  gb.box(w + 0.02, 0.06, d + 0.02, 0, h - 0.03, 0, '#c9421f'); gb.box(w + 0.02, 0.06, d + 0.02, 0, 0.03, 0, '#c9421f');
  [0.2, 0.46].forEach((y) => { gb.box(0.26, 0.11, 0.02, 0, y, -d / 2 - 0.004, '#8e2c14'); gb.box(0.26, 0.11, 0.02, 0, y, d / 2 + 0.004, '#8e2c14'); });
  for (let k = -1; k <= 1; k++) gb.box(0.035, 0.34, 0.012, k * w * 0.22, h * 0.77, -d / 2 - 0.012, '#fbf7ee');
  gb.box(0.3, 0.025, 0.012, 0, h * 0.95, -d / 2 - 0.012, '#fbf7ee');
  const m = new THREE.Mesh(gb.build(), matFlat({ roughness: 0.55 })); m.castShadow = true; m.receiveShadow = true;
  // pivot at the base back edge so it topples backwards toward the camera
  const piv = new THREE.Group(); piv.position.set(0, 0, -CRATE_X); m.position.set(0, 0, 0);
  piv.add(m); g.add(piv); root.add(g);
  const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#2a0f18', transparent: true, opacity: 0.22, depthWrite: false }));
  shadowBlob.position.set(0, 0.016, -CRATE_X); root.add(shadowBlob);
  return { piv, m };
}

function buildBall(root) {
  const t = canvasTex(paintBall());
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, emissive: new THREE.Color('#9fb82a'), emissiveIntensity: 0.28 });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.078, 16, 12), mat);
  m.castShadow = true; root.add(m);
  const soft = canvasTex(paintSoftDot());
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: '#fff4b0', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.setScalar(0.5); root.add(glow);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#1e0c14', transparent: true, opacity: 0.4, depthWrite: false }));
  shadow.position.y = 0.017; root.add(shadow);
  const trail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }), 10);
  trail.frustumCulled = false; root.add(trail);
  return { m, glow, shadow, trail };
}

function buildDog(root) {
  const g = new THREE.Group(); const body = '#b88a5a', dark = '#8d6540', muzzle = '#d9b88c';
  const mk = (gb, parent) => { const m = new THREE.Mesh(gb.build(), matFlat({ roughness: 0.95 })); m.castShadow = true; parent.add(m); return m; };
  const torso = new GB();
  torso.sph(0.2, 0, 0.42, 0, body, 0.9, 0.95, 1.9, 12); torso.sph(0.13, 0, 0.5, -0.02, '#c99a68', 0.9, 0.5, 2.0, 8); torso.sph(0.1, 0.0, 0.38, -0.2, dark, 1, 1, 1.2, 8);
  mk(torso, g);
  const head = new THREE.Group(); head.position.set(0, 0.55, 0.38);
  const hg = new GB();
  hg.sph(0.14, 0, 0.03, 0.04, body, 0.95, 0.92, 1, 12); hg.sph(0.075, 0, -0.02, 0.2, muzzle, 0.9, 0.8, 1.3, 8); hg.sph(0.025, 0, 0.0, 0.29, '#1b130e', 1, 1, 1, 6);
  hg.sph(0.018, -0.055, 0.07, 0.15, '#1b130e', 1, 1, 1, 6); hg.sph(0.018, 0.055, 0.07, 0.15, '#1b130e', 1, 1, 1, 6);
  hg.sph(0.05, -0.12, 0.08, 0.0, dark, 0.5, 1.4, 1, 8); hg.sph(0.05, 0.12, 0.08, 0.0, dark, 0.5, 1.4, 1, 8);
  mk(hg, head); g.add(head);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#d6e64a', roughness: 0.9 }));
  ball.position.set(0, -0.04, 0.3); head.add(ball);
  const legs = [];
  [[-0.1, 0.28], [0.1, 0.28], [-0.1, -0.3], [0.1, -0.3]].forEach((p, i) => {
    const lg = new THREE.Group(); lg.position.set(p[0], 0.3, p[1]);
    const lb = new GB(); lb.cyl(0.04, 0.03, 0.3, 0, -0.15, 0, i % 2 ? dark : body, 7); lb.sph(0.04, 0, -0.3, 0.02, '#e8d6b4', 1, 0.6, 1.3, 6);
    mk(lb, lg); g.add(lg); legs.push(lg);
  });
  const tail = new THREE.Group(); tail.position.set(0, 0.5, -0.38);
  const tb = new GB(); tb.cyl(0.03, 0.015, 0.34, 0, 0.0, -0.06, body, 6, -0.9); mk(tb, tail); g.add(tail);
  g.scale.setScalar(0.95); g.visible = false; root.add(g);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#2a0f18', transparent: true, opacity: 0.2, depthWrite: false }));
  blob.scale.set(0.8, 1, 1.5); blob.position.y = 0.016; g.add(blob);
  return { g, head, legs, tail, ball };
}

function buildAuto(root) {
  const g = new THREE.Group(); // local +Z is forward
  const gb = new GB(), yel = '#f2c230', yel2 = '#d8a423', blk = '#1f1f23', grn = '#1f4a38';
  gb.box(1.32, 0.12, 2.5, 0, 0.42, 0.1, blk);
  gb.box(1.36, 0.78, 1.5, 0, 0.84, -0.42, yel); gb.box(1.38, 0.1, 1.52, 0, 0.46, -0.42, yel2);
  gb.box(0.9, 0.72, 0.9, 0, 0.8, 0.82, yel); gb.box(0.96, 0.1, 0.9, 0, 0.46, 0.82, yel2);
  gb.add(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 14, 1, false, PI / 2, PI), grn, 0, 1.5, -0.45, PI / 2, 0, 0, 1, 1, 0.5);
  gb.box(0.05, 0.9, 0.05, -0.64, 1.45, 0.34, blk); gb.box(0.05, 0.9, 0.05, 0.64, 1.45, 0.34, blk);
  gb.box(1.2, 0.06, 0.08, 0, 1.92, 0.34, blk);
  gb.box(0.9, 0.5, 0.06, 0, 1.45, 0.38, '#9ec9de');
  gb.box(1.0, 0.28, 0.5, 0, 0.78, -0.62, '#7a2a24'); gb.box(1.0, 0.5, 0.1, 0, 1.06, -1.17, '#7a2a24');
  gb.box(0.1, 0.18, 0.1, 0, 1.08, 1.14, blk); gb.box(0.9, 0.04, 0.04, 0, 1.15, 1.0, blk);
  gb.sph(0.09, 0, 0.92, 1.29, '#fff3c0', 1, 1, 0.6, 8);
  gb.box(1.0, 0.5, 0.06, 0, 1.45, -1.22, '#1b1b1e');
  const body = new THREE.Mesh(gb.build(), matFlat({ roughness: 0.5, metalness: 0.1 })); body.castShadow = true; g.add(body);
  const cv = mkCanvas(256, 64), c = cv.getContext('2d'); c.fillStyle = '#7a1f1f'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#f5e6c4'; c.fillRect(4, 4, 248, 56);
  c.fillStyle = '#7a1f1f'; c.font = '800 30px ' + FONT_UI; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HORN PLEASE', 128, 34);
  const tp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.27), new THREE.MeshStandardMaterial({ map: canvasTex(cv), roughness: 0.6 }));
  tp.position.set(0, 0.78, -1.185); tp.rotation.y = PI; g.add(tp);
  const wheels = [];
  [[0, 0.26, 1.3], [-0.74, 0.26, -0.7], [0.74, 0.26, -0.7]].forEach((p) => {
    const w = new THREE.Group(); w.position.set(p[0], p[1], p[2]);
    const wb = new GB(); wb.cyl(0.26, 0.26, 0.13, 0, 0, 0, '#1b1b1e', 16, 0, PI / 2); wb.cyl(0.13, 0.13, 0.15, 0, 0, 0, '#b8b8bc', 10, 0, PI / 2); wb.box(0.16, 0.04, 0.24, 0, 0, 0, '#6a6a70'); wb.box(0.16, 0.24, 0.04, 0, 0, 0, '#6a6a70');
    const wm = new THREE.Mesh(wb.build(), matFlat({ roughness: 0.7 })); wm.castShadow = true; w.add(wm); g.add(w); wheels.push(w);
  });
  // the driver
  const drv = buildKid({ tee: '#8a8a5a', shorts: '#4a4a52', skin: '#b87a45', hair: '#1a1410', cap: '#f5e6c4', shoe: '#222' }, { scale: 1.18 });
  drv.root.position.set(0, -0.05, 0.1); drv.legL.visible = drv.legR.visible = false;
  drv.armL.rotation.x = -1.1; drv.armR.rotation.x = -1.1; drv.body.position.y = 0.95;
  g.add(drv.root);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 16).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#2a0f18', transparent: true, opacity: 0.25, depthWrite: false }));
  blob.scale.set(0.9, 1, 1.5); blob.position.set(0, 0.016, 0); g.add(blob);
  g.visible = false; root.add(g);
  return { g, wheels };
}

function buildAunty(root, clip) {
  const g = new THREE.Group();
  const gb = new GB(), saree = '#c43372', gold = '#e8b64a';
  gb.cyl(0.19, 0.3, 0.95, 0, 0.5, 0, saree, 14);
  gb.cyl(0.305, 0.305, 0.09, 0, 0.08, 0, gold, 14);
  gb.add(new THREE.BoxGeometry(0.14, 0.9, 0.36), '#f2c860', 0.13, 0.55, 0.12, 0, 0, -0.18);
  gb.sph(0.15, 0, 1.0, 0.02, saree, 1.1, 0.9, 0.75, 10);
  gb.cyl(0.045, 0.05, 0.1, 0, 1.17, 0.02, '#c98f63', 8);
  gb.sph(0.135, 0, 1.31, 0.03, '#c98f63', 0.95, 1.05, 1, 14);
  gb.add(new THREE.SphereGeometry(0.14, 14, 8, 0, TAU, 0, PI * 0.58), '#1d1411', 0, 1.33, 0.0, -0.45, 0, 0);
  gb.sph(0.075, 0, 1.43, -0.16, '#1d1411', 1, 1, 1, 8);
  gb.sph(0.014, -0.045, 1.33, 0.125, '#1b130e', 1, 1, 1, 6); gb.sph(0.014, 0.045, 1.33, 0.125, '#1b130e', 1, 1, 1, 6);
  gb.sph(0.011, 0, 1.38, 0.135, '#d33a3a', 1, 1, 1, 6);
  gb.box(0.08, 0.016, 0.01, 0, 1.25, 0.13, '#7a2a2a');
  const mat = matFlat({ roughness: 0.8 }); if (clip) { mat.clippingPlanes = [clip]; }
  const body = new THREE.Mesh(gb.build(), mat); body.castShadow = true; g.add(body);
  const mkArm = (x) => {
    const a = new THREE.Group(); a.position.set(x, 1.08, 0.0);
    const ab = new GB(); ab.cyl(0.045, 0.04, 0.38, 0, -0.19, 0, saree, 8); ab.cyl(0.036, 0.033, 0.26, 0, -0.5, 0, '#c98f63', 8); ab.sph(0.04, 0, -0.65, 0, '#c98f63', 1, 1, 1, 8);
    const am = matFlat({ roughness: 0.8 }); if (clip) am.clippingPlanes = [clip];
    const m = new THREE.Mesh(ab.build(), am); m.castShadow = true; a.add(m); g.add(a); return a;
  };
  const armL = mkArm(-0.2), armR = mkArm(0.2);
  const can = new GB(); can.box(0.14, 0.12, 0.1, 0, -0.04, 0.04, '#3f8f8f'); can.cyl(0.012, 0.012, 0.18, 0.12, -0.02, 0.04, '#3f8f8f', 5, 0, PI / 2.5);
  const cmat = matFlat({}); if (clip) cmat.clippingPlanes = [clip];
  const cm = new THREE.Mesh(can.build(), cmat); cm.position.y = -0.62; armR.add(cm);
  g.visible = false; root.add(g);
  return { g, armL, armR, can: cm };
}

/* birds on the wires: instanced bodies and wings */
function buildBirds(root, n) {
  const bg = new GB();
  bg.sph(0.09, 0, 0.1, 0, '#ffffff', 0.8, 0.85, 1.4, 8); bg.sph(0.055, 0, 0.17, 0.12, '#ffffff', 1, 1, 1, 8);
  bg.add(new THREE.ConeGeometry(0.018, 0.06, 5), '#e7b350', 0, 0.165, 0.2, PI / 2, 0, 0);
  bg.box(0.06, 0.012, 0.13, 0, 0.1, -0.15, '#cfcfcf');
  const body = new THREE.InstancedMesh(bg.build(), matFlat({ roughness: 0.9 }), n);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.07, 0.3, 0, 0.0, 0, 0, -0.1], 3));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const wing = new THREE.InstancedMesh(wg, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.9 }), n * 2);
  const cols = ['#8b8590', '#5b5660'];
  for (let i = 0; i < n; i++) { body.setColorAt(i, new THREE.Color(cols[i % 2])); wing.setColorAt(i * 2, new THREE.Color(cols[i % 2])); wing.setColorAt(i * 2 + 1, new THREE.Color(cols[i % 2])); }
  body.frustumCulled = false; wing.frustumCulled = false; body.castShadow = false;
  root.add(body); root.add(wing);
  return { body, wing };
}

/* particles: dust puffs, sparks and glass, drawn as points */
class PLayer {
  constructor(root, max, soft, additive, ordered) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.colr = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.colr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uSoft: { value: soft ? 1 : 0 } },
      vertexShader: 'attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC;' +
        'void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, aSize * uScale / max(0.1, -mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uSoft; varying float vA; varying vec3 vC;' +
        'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = uSoft > 0.5 ? smoothstep(1.0, 0.0, r) : step(r, 1.0); if (a < 0.01) discard; gl_FragColor = vec4(vC, a * vA);\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.geo = g;
    root.add(this.pts);
  }
  begin() { this.n = 0; }
  push(x, y, z, size, a, c) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.size[i] = size; this.alpha[i] = a; this.colr[i * 3] = c.r; this.colr[i * 3 + 1] = c.g; this.colr[i * 3 + 2] = c.b;
  }
  end() {
    this.geo.setDrawRange(0, this.n);
    const a = this.geo.attributes; a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = true;
  }
}

/* ------------------------------------------------------------ assembling the world */
const W3 = { ready: false, failed: false, lost: false, q: 1, qT: 0, fpsAcc: 0, fpsN: 0, shadowSize: 2048, pr: 1 };
const ACT = { kids: {}, flames: [] };
let layers = null;
const COLF = (c) => new THREE.Color(c);

function buildWorld(arc) {
  const dom = arc.canvas;
  W3.soft = isSoftwareGL();
  R = new THREE.WebGLRenderer({ canvas: dom, antialias: !W3.soft && !/[?&]aa=0/.test(location.search), powerPreference: 'high-performance' });
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.08;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap;
  R.localClippingEnabled = true;
  maxAniso = Math.min(8, R.capabilities.getMaxAnisotropy());
  dom.addEventListener('webglcontextlost', (e) => { e.preventDefault(); W3.lost = true; }, false);
  dom.addEventListener('webglcontextrestored', () => { W3.lost = false; }, false);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#f0c394', 26, 105);
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 420);
  const root = new THREE.Group(); scene.add(root);

  // lighting: a low warm sun ahead and a little to the right, sky and bounce fill, a cool fill from behind
  const az = 8 * PI / 180, el = 25 * PI / 180;
  SUN_DIR.set(sin(az) * cos(el), sin(el), -cos(az) * cos(el)).normalize();
  hemi = new THREE.HemisphereLight('#ffe0b4', '#7a5650', 0.7); scene.add(hemi);
  sun = new THREE.DirectionalLight('#ffb766', 3.6);
  sun.castShadow = true; sun.shadow.mapSize.set(W3.shadowSize, W3.shadowSize);
  const sc = sun.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 150;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035;
  scene.add(sun); scene.add(sun.target);
  fill = new THREE.DirectionalLight('#9fb6e6', 0.6); fill.position.set(-3, 7, 14); scene.add(fill);

  // a sky: a gradient dome, a warm environment for glass and glossy things, and the sun
  const skyTex = canvasTex(paintSky(), { aniso: 1 });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); FX.sky = sky;
  try {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })));
    const sunSpot = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 9, 4) }));
    sunSpot.position.copy(SUN_DIR).multiplyScalar(44); envScene.add(sunSpot);
    const pm = new THREE.PMREMGenerator(R);
    W3.env = pm.fromScene(envScene, 0.03).texture; scene.environment = W3.env;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  } catch (e) { /* no environment: lights alone */ }
  const soft = canvasTex(paintSoftDot());
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: '#ffb35c', transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.setScalar(150); halo.renderOrder = -5; scene.add(halo);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: '#fff1c8', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  core.scale.setScalar(34); core.renderOrder = -4; scene.add(core);
  FX.halo = halo; FX.core = core;

  buildGround(root);
  buildHouses(root);
  buildWindows(root);
  buildBackdrops(root);
  buildProps(root);
  buildOverhead(root);

  // actors
  const kids = ACT.kids;
  kids.bat = buildKid(KID_STYLES.bat, { batter: true });
  kids.bowl = buildKid(KID_STYLES.bowl);
  ['f0', 'f1', 'f2', 'f3'].forEach((k) => { kids[k] = buildKid(KID_STYLES[k]); });
  Object.keys(kids).forEach((k) => root.add(kids[k].root));
  // soft blobs under the kids keep them planted when the sun shadow is thin
  Object.keys(kids).forEach((k) => {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: '#25101a', transparent: true, opacity: 0.2, depthWrite: false }));
    b.position.y = 0.017; kids[k].blob = b; root.add(b);
  });
  ACT.crate = buildCrate(root);
  ACT.ball = buildBall(root);
  ACT.dog = buildDog(root);
  ACT.auto = buildAuto(root);
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(3.3 + 0.02));
  ACT.aunty = buildAunty(root, clip);
  ACT.birds = buildBirds(root, BIRDS.length);
  // board with the live chalk score: on the wall and standing on an easel
  FX.boardCanvas = mkCanvas(512, 256);
  FX.boardTex = canvasTex(FX.boardCanvas);
  const bm = new THREE.MeshStandardMaterial({ map: FX.boardTex, roughness: 0.9, emissive: new THREE.Color('#ffffff'), emissiveMap: FX.boardTex, emissiveIntensity: 0.1 });
  const wallBoard = new THREE.Mesh(new THREE.PlaneGeometry(3.25, 1.6), bm);
  wallBoard.position.set(ZW - 0.13, 2.2, -3.625); wallBoard.rotation.y = -PI / 2; root.add(wallBoard);
  const wf = new GB(); wf.box(0.06, 1.76, 3.41, ZW - 0.1, 2.2, -3.625, '#c99a5b'); wf.box(0.05, 0.08, 3.5, ZW - 0.09, 1.3, -3.625, '#7a5530');
  const wfm = new THREE.Mesh(wf.build(), matFlat()); root.add(wfm);
  const easel = new THREE.Group(); easel.position.set(1.55, 0, -10.0); easel.rotation.y = 0.35;
  const eb = new GB(); eb.box(1.34, 0.9, 0.06, 0, 0.98, 0, '#c99a5b'); eb.box(0.06, 1.2, 0.06, -0.55, 0.6, 0.2, '#6b4a2e', 0, -0.2); eb.box(0.06, 1.2, 0.06, 0.55, 0.6, 0.2, '#6b4a2e', 0, -0.2); eb.box(0.06, 1.1, 0.06, 0, 0.55, -0.3, '#6b4a2e', 0, 0.3);
  const em = new THREE.Mesh(eb.build(), matFlat()); em.castShadow = true; easel.add(em);
  const ep = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.76), bm); ep.position.set(0, 0.98, 0.04); easel.add(ep);
  root.add(easel);
  // a hanging "NO CRICKET" tin sign
  const nc = paintSign(512, 300, '#b72f2a', '#f5e6c4', 'NO CRICKET', '(hehe) - Mgmt', { f1: 0.26 });
  const nct = canvasTex(nc);
  const ncm = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.5), new THREE.MeshStandardMaterial({ map: nct, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  ncm.position.set(ZW - 0.5, 2.15, -7.45); ncm.castShadow = true; root.add(ncm);
  const ncb = new GB(); ncb.box(0.5, 0.03, 0.03, ZW - 0.25, 2.5, -7.45, '#2a2a2a'); ncb.box(0.012, 0.35, 0.012, ZW - 0.5, 2.32, -7.45, '#2a2a2a');
  root.add(new THREE.Mesh(ncb.build(), matFlat()));

  // particles
  layers = {
    dust: new PLayer(scene, 200, true, false), spark: new PLayer(scene, 120, false, true), shard: new PLayer(scene, 120, false, false),
    mote: new PLayer(scene, 90, true, true),
  };
  FX.motes = []; for (let i = 0; i < 90; i++) FX.motes.push({ x: rr(-3, 3), y: rr(0.3, 7), z: rr(-34, 14), p: rr(0, 6), s: rr(0.02, 0.05) });
  W3.stdMeshes = [];
  scene.traverse((o) => { if ((o.isMesh) && o.material && o.material.isMeshStandardMaterial) { o.userData.std = o.material; W3.stdMeshes.push(o); } });
  W3.ready = true;
  paintBoard(true);
  applyQuality();
}

const QL = [
  { pr: 1, sm: 2048, sh: true, lam: false }, { pr: 0.85, sm: 1024, sh: true, lam: false }, { pr: 0.7, sm: 1024, sh: true, lam: true },
  { pr: 0.55, sm: 512, sh: false, lam: true }, { pr: 0.42, sm: 512, sh: false, lam: true }, { pr: 0.32, sm: 512, sh: false, lam: true }, { pr: 0.24, sm: 512, sh: false, lam: true },
];
// Software renderers (no GPU) cannot afford physically based shading: the same scene in plain diffuse materials.
const LAM = new Map();
function lamOf(m) {
  let l = LAM.get(m);
  if (!l) {
    l = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, vertexColors: m.vertexColors, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity, clippingPlanes: m.clippingPlanes });
    LAM.set(m, l);
  }
  return l;
}
function applyQuality() {
  if (!R) return;
  const q = QL[clamp(W3.q, 0, QL.length - 1)];
  W3.pr = q.pr;
  if (sun.shadow.mapSize.x !== q.sm) {
    sun.shadow.mapSize.set(q.sm, q.sm);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  if (W3.curSh !== q.sh || W3.curLam !== q.lam) {
    sun.castShadow = q.sh; R.shadowMap.enabled = q.sh;
    W3.stdMeshes.forEach((o) => { o.material = q.lam ? lamOf(o.userData.std) : o.userData.std; });
    scene.environment = q.lam ? null : W3.env;
    scene.traverse((o) => { if (o.material) { const m = o.material; if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; }); else m.needsUpdate = true; } });
    W3.curSh = q.sh; W3.curLam = q.lam;
  }
  W3.settle = 6;
  sizeRenderer();
}
function isSoftwareGL() {
  try {
    const c = document.createElement('canvas'), g = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!g) return false;
    const e = g.getExtension('WEBGL_debug_renderer_info');
    const r = e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = g.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
  } catch (err) { return false; }
}
function sizeRenderer() {
  if (!R || !arcRef) return;
  R.setPixelRatio(arcRef.dpr * W3.pr);
  R.setSize(arcRef.w, arcRef.h, false);
  camera.aspect = arcRef.w / arcRef.h;
  const portrait = arcRef.h > arcRef.w * 1.05;
  camera.fov = portrait ? 68 : 43;
  camera.updateProjectionMatrix();
  const sf = (R.domElement.height) / (2 * Math.tan(camera.fov * PI / 360));
  if (layers) Object.keys(layers).forEach((k) => { layers[k].mat.uniforms.uScale.value = sf; });
}
let arcRef = null;

/* chalk scoreboard, redrawn only when the figures change */
function paintBoard(force) {
  if (!FX.boardCanvas) return;
  const ovs = floor(G.balls / 6) + '.' + (G.balls % 6);
  const lines = [];
  if (G.phase === 'attract' || (G.phase === 'over' && !G.balls)) { lines.push('GULLY CHAMPS'); lines.push('RUNS 0  OUT 0'); }
  else {
    lines.push('RUNS ' + G.runs + '  OUT ' + G.outs + '/' + G.maxOuts);
    lines.push('BALLS ' + G.balls + '  OV ' + ovs);
    lines.push(G.mode === 'last' ? 'LAST MAN STANDING' : 'TARGET ' + G.target + ' (' + max(0, G.target - G.runs) + ' to go)');
  }
  const key = lines.join('|');
  if (!force && key === FX.boardKey) return;
  FX.boardKey = key;
  const c = FX.boardCanvas.getContext('2d'), w = 512, h = 256;
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#26352f'); g.addColorStop(1, '#1b2622');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const sr = A.rng(12);
  for (let k = 0; k < 90; k++) { c.fillStyle = 'rgba(255,255,255,' + (0.02 + sr() * 0.05) + ')'; c.fillRect(sr() * w, sr() * h, 8 + sr() * 30, 2); }
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = '700 30px ' + FONT_MONO;
  const lh = h / (lines.length + 0.6);
  lines.forEach((t, i) => {
    c.save(); c.translate(w * 0.06, lh * (i + 0.8)); c.rotate((i % 2 ? 1 : -1) * 0.012);
    c.fillStyle = 'rgba(250,246,236,' + (i === 0 ? 0.96 : 0.84) + ')'; c.fillText(t, 0, 0); c.restore();
  });
  c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, h * 0.82, w * 0.6, h * 0.08);
  FX.boardTex.needsUpdate = true;
}

/* ------------------------------------------------------------ game state */
let arc = null;
const CAM = { p: new THREE.Vector3(0, 2.9, 7.2), t: new THREE.Vector3(0, 0.95, -4), s: 1, fx: 3, flash: 0, sFlip: 0, ball: new THREE.Vector3(), hold: new THREE.Vector3() };
const G = {
  mode: 'last', diff: 'serious', D: DIFF.serious, phase: 'attract', t: 0,
  runs: 0, outs: 0, balls: 0, target: 0, ballLimit: 0, maxOuts: 3, trial: true, trialRuns: 0,
  matchIx: 0, rival: '', results: [], totalScore: 0, matchWon: false, speedMul: 1, sunMul: 1,
  lastOutcome: '', lastDelivery: '', shotLabel: '', dotT: 0, deadT: 0, readyT: 0, endBanner: '', interludeT: 0,
  autoTimer: 30, dogTimer: 14, auntyTimer: 9, birdTimer: 0, time: 0, patches: [], overOutcomes: [], deliveries: 0,
  flags: { auto: false, dog: false, aunty: false }, eventLog: [], batterIx: 0, slow: 0, ended: false, yield: 0,
};
const BAT = { x: 0, z: 0, face: 1, state: 'idle', dir: 1, lastEnd: 0, speed: 6.4, phase: 0, run: 0, out: false, style: KID_STYLES.bat, yaw: PI * 0.62 };
const SW = { on: false, t: 0, dur: 0.37, cd: 0, hit: false, kind: 0, after: 0, shot: null, voff: 0 };
const CRATE = { x: CRATE_X, tip: 0, fall: false, vx: 0 };
const BALL = {
  state: 'none', x: REL_X, h: 1.5, z: 0, vx: 0, vh: 0, vz: 0, bounces: 0, batted: false, spin: 0, awarded: '', wallHits: 0,
  googly: false, gf: 1, replan: false, restT: 0, thrown: null, hidden: false, trail: new Float32Array(30), trailN: 0, trailT: 0, stuckT: 0, kind: 'fast',
};
const FZ = [-0.2, 1.3, -1.0, 1.15, 0];
const mkF = (id, x, key, role) => ({
  id, role, key, x, x0: x, z: FZ[id], face: -1, walk: 0, phase: rnd() * 6, speed: 4.5, hands: 0.8 + rnd() * 0.2,
  hasBall: false, tried: false, hold: 0, goal: x, armUp: 0, zone: [x - 5, x + 5], style: KID_STYLES[key], name: KID_NAMES[key], dive: 0, say: 0, yaw: 0,
});
const FIELDERS = [mkF(0, FIELD_X0[0], 'f0', 'keeper'), mkF(1, FIELD_X0[1], 'f1', 'field'), mkF(2, FIELD_X0[2], 'f2', 'field'), mkF(3, FIELD_X0[3], 'f3', 'field'), mkF(4, BOWL_X + 3, 'bowl', 'bowler')];
FIELDERS[0].zone = [-10.8, -1.8]; FIELDERS[0].face = 1;
const BOWLER = FIELDERS[4];
BOWLER.runT = 0; BOWLER.runDur = 1; BOWLER.runFrom = BOWL_X + 3; BOWLER.arm = 0;
const AUNTY = { state: 'hidden', t: 0, up: 0, x: 3.5, h: 3.3, z: ZW - 0.55, shake: 0, cd: 0 };
const DOG = { active: false, x: 0, z: 1.0, dir: 1, state: 'walk', t: 0, phase: 0, goal: 0, stops: 0, carry: false, barkT: 0, fetch: false };
const AUTO = { state: 'none', x: 0, z: -1.45, dir: -1, t: 0, wheel: 0, horned: 0, speed: 11.2, hold: 0, s: 0, hx: -1, hz: 0, door: 0 };
const BIRDS = [];
for (let i = 0; i < 7; i++) BIRDS.push({ k: i % 3, x: -7 + i * 5.7 + rnd() * 2, state: 'perch', t: 0, fx: 0, fy: 0, vx: 0, vy: 0, flap: rnd() * 6, back: 0, face: i % 2 ? PI : 0 });
const PARTS = [];
for (let i = 0; i < 170; i++) PARTS.push({ on: false, x: 0, h: 0, z: 0, vx: 0, vh: 0, vz: 0, life: 0, max: 1, size: 3, kind: 0, col: '#fff', g: 1 });
let partCursor = 0;
const POPS = [];
const BUBBLES = [];
const TEST = { kind: null };

const SND = {
  tone(f, d, o) { if (arc) arc.sfx.tone(f, d, o); },
  noise(d, o, delay) { if (!arc) return; if (delay) setTimeout(() => arc && arc.sfx.noise(d, o), delay * 1000); else arc.sfx.noise(d, o); },
  thock(v) { this.tone(190 + v * 5, 0.07, { type: 'sine', slide: 90, vol: 0.26 }); this.noise(0.04, { filter: 'lowpass', freq: 900, vol: 0.1 }); },
  bat(q) { this.noise(0.05, { filter: 'bandpass', freq: 2600 + q * 900, vol: 0.34 }); this.tone(1100, 0.05, { type: 'square', slide: 420, vol: 0.1 }); this.tone(160, 0.13, { type: 'triangle', slide: 70, vol: 0.3 }); },
  swish() { this.noise(0.12, { filter: 'bandpass', freq: 700, vol: 0.07 }); },
  bounce(v) { this.tone(130 + rnd() * 50, 0.05, { type: 'sine', slide: 80, vol: min(0.2, 0.04 + v * 0.016) }); this.noise(0.03, { filter: 'lowpass', freq: 700, vol: min(0.12, v * 0.012) }); },
  wall(v) { this.noise(0.08, { filter: 'lowpass', freq: 520, vol: min(0.22, 0.05 + v * 0.012) }); this.tone(85, 0.1, { type: 'sine', slide: 50, vol: min(0.22, 0.05 + v * 0.01) }); },
  tink() { this.tone(1500, 0.06, { type: 'triangle', slide: 900, vol: 0.12 }); },
  glass() {
    this.noise(0.55, { filter: 'highpass', freq: 4200, vol: 0.34 });
    for (let i = 0; i < 8; i++) this.tone(2300 + rnd() * 3300, 0.14 + rnd() * 0.22, { type: 'sine', vol: 0.07, delay: 0.03 + i * 0.045 + rnd() * 0.04 });
  },
  horn() { this.tone(430, 0.2, { type: 'square', vol: 0.13 }); this.tone(540, 0.2, { type: 'square', vol: 0.09 }); this.tone(430, 0.32, { type: 'square', vol: 0.13, delay: 0.28 }); this.tone(540, 0.32, { type: 'square', vol: 0.09, delay: 0.28 }); },
  bark() { this.tone(540, 0.1, { type: 'sawtooth', slide: 270, vol: 0.17 }); this.noise(0.08, { filter: 'bandpass', freq: 950, vol: 0.14 }); this.tone(500, 0.12, { type: 'sawtooth', slide: 240, vol: 0.15, delay: 0.17 }); },
  cheer(big) {
    this.noise(big ? 1.1 : 0.65, { filter: 'bandpass', freq: 1700, vol: big ? 0.2 : 0.14 });
    const n = big ? 5 : 3;
    for (let i = 0; i < n; i++) this.tone(520 + i * 90 + rnd() * 60, 0.22, { type: 'triangle', slide: 760 + i * 80, vol: 0.05, delay: 0.04 * i });
  },
  groan() { this.tone(300, 0.4, { type: 'sawtooth', slide: 150, vol: 0.08 }); this.noise(0.4, { filter: 'lowpass', freq: 600, vol: 0.1 }); },
  out() { this.tone(330, 0.18, { type: 'triangle', slide: 200, vol: 0.2 }); this.tone(220, 0.32, { type: 'triangle', slide: 110, vol: 0.2, delay: 0.17 }); },
  run() { this.tone(110 + rnd() * 20, 0.03, { type: 'square', vol: 0.035 }); },
  ding() { this.tone(880, 0.1, { type: 'triangle', vol: 0.12 }); this.tone(1320, 0.18, { type: 'triangle', vol: 0.1, delay: 0.09 }); },
  caught() { this.thock(10); this.tone(700, 0.08, { type: 'square', vol: 0.06 }); },
  boing() { this.tone(260, 0.2, { type: 'sine', slide: 520, vol: 0.12 }); },
};
const kick = (v) => { if (arc && !arc.reducedMotion) arc.shake = max(arc.shake || 0, v * 16); };

/* ------------------------------------------------------------ small systems */
function say(text, ent, life, hOff, opts) {
  if (!text) return;
  if (BUBBLES.length >= 4) BUBBLES.shift();
  BUBBLES.push({ text, ent: ent || null, x: ent ? ent.x : 0, h: hOff == null ? 1.75 : hOff, z: ent ? (ent.z || 0) : 0, t: 0, life: life || 1.7, w: 0, aunty: !!(opts && opts.aunty) });
}
function sayAt(text, x, h, z, life) {
  say(text, null, life);
  const b = BUBBLES[BUBBLES.length - 1]; if (!b) return;
  b.x = x; b.h = h; b.z = z || 0;
}
function pop(text, x, h, col, size, life) {
  if (POPS.length >= 7) POPS.shift();
  POPS.push({ text, x, h, z: 0, t: 0, life: life || 1.1, col: col || '#FFB736', size: size || 18 });
}
function emit(n, x, h, z, kind, o) {
  o = o || {};
  if (arc && arc.reducedMotion) n = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const p = PARTS[partCursor]; partCursor = (partCursor + 1) % PARTS.length;
    p.on = true; p.x = x; p.h = h; p.z = z; p.kind = kind;
    const sp = o.speed || 2;
    p.vx = (rnd() - 0.5) * sp * 2 + (o.vx || 0); p.vh = rnd() * sp * (o.up == null ? 1 : o.up) + (o.vh || 0); p.vz = (rnd() - 0.5) * sp;
    p.max = p.life = (o.life || 0.6) * (0.6 + rnd() * 0.8); p.size = (o.size || 3) * (0.6 + rnd() * 0.8);
    p.col = o.cols ? o.cols[(rnd() * o.cols.length) | 0] : (o.col || '#d9c3a0'); p.g = o.g == null ? 1 : o.g;
  }
}
const dustPuff = (x, h, z, n, big) => emit(n || 5, x, h, z, 0, { speed: big ? 1.6 : 0.9, up: 0.9, life: 0.7, size: big ? 7 : 5, cols: ['#d9c3a0', '#c8ad88', '#e8d6b4'], g: 0.15 });
const sparkBurst = (x, h, z, n) => emit(n || 10, x, h, z, 1, { speed: 4, up: 1, life: 0.35, size: 2.4, cols: ['#FFE08A', '#FFB736', '#ffffff'], g: 0.8 });
const shards = (x, h, z) => emit(34, x, h, z, 2, { speed: 3.2, up: 1, vh: 1.5, life: 1.1, size: 4.5, cols: ['#bfe3f2', '#e8f6fb', '#f5d28a', '#ffffff'], g: 2.2 });

function patchAt(x, z) {
  for (let i = 0; i < G.patches.length; i++) {
    const p = G.patches[i];
    if (x > p.x - p.w / 2 && x < p.x + p.w / 2 && abs(z - p.z) < 1.1) return p;
  }
  return null;
}
function newPatches() {
  G.patches.length = 0;
  const n = G.D.patches, kinds = ['pot', 'crack', 'stones', 'pot', 'crack'];
  let guard = 0;
  while (G.patches.length < n && guard++ < 40) {
    const x = rr(1.3, 4.8), w = rr(0.7, 1.0);
    if (G.patches.some((p) => abs(p.x - x) < (p.w + w) / 2 + 0.25)) continue;
    G.patches.push({ x, w, z: rr(-0.4, 0.4), kind: kinds[G.patches.length % kinds.length], seed: rnd() * 1000 });
  }
  syncPatches();
}
function syncPatches() {
  if (!FX.patches.length) return;
  FX.patches.forEach((fp, i) => {
    const p = G.patches[i];
    if (!p) { fp.mesh.visible = false; return; }
    fp.mesh.visible = true;
    fp.mesh.material.map = fp.texs[p.kind]; fp.mesh.material.needsUpdate = true;
    fp.mesh.position.set(p.z, 0.014, -p.x); fp.mesh.scale.set(p.w * (p.kind === 'crack' ? 1.3 : 1.15), 1, p.w * (p.kind === 'crack' ? 1.0 : 1.5));
    fp.mesh.rotation.y = p.seed % 1 * 0.8;
  });
}
function setPhase(p, t) { G.phase = p; G.t = 0; if (t != null) G.phaseLen = t; }
function breakWindow(w) { w.broken = true; setWindowBroken(w, true); }
function resetWindows() { WIN.forEach((w) => { if (w.broken || w.type === 'glass') { w.broken = false; setWindowBroken(w, false); } }); }

/* ------------------------------------------------------------ ball physics */
function boxHit(b, bx) {
  const cx = clamp(b.x, bx[0], bx[1]), cz = clamp(b.z, bx[2], bx[3]), ch = clamp(b.h, bx[4], bx[5]);
  const dx = b.x - cx, dz = b.z - cz, dh = b.h - ch, d2 = dx * dx + dz * dz + dh * dh;
  if (d2 >= BR * BR) return 0;
  let nx, nz, nh, pen;
  const d = sqrt(d2);
  if (d > 1e-6) { nx = dx / d; nz = dz / d; nh = dh / d; pen = BR - d; }
  else {
    const px = min(b.x - bx[0], bx[1] - b.x), pz = min(b.z - bx[2], bx[3] - b.z), ph = min(b.h - bx[4], bx[5] - b.h);
    nx = nz = nh = 0;
    if (ph <= px && ph <= pz) { nh = (b.h - (bx[4] + bx[5]) / 2) >= 0 ? 1 : -1; pen = ph + BR; }
    else if (pz <= px) { nz = (b.z - (bx[2] + bx[3]) / 2) >= 0 ? 1 : -1; pen = pz + BR; }
    else { nx = (b.x - (bx[0] + bx[1]) / 2) >= 0 ? 1 : -1; pen = px + BR; }
  }
  b.x += nx * pen; b.z += nz * pen; b.h += nh * pen;
  const vn = b.vx * nx + b.vz * nz + b.vh * nh;
  if (vn < 0) {
    const e = bx[6];
    b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; b.vh -= (1 + e) * vn * nh;
    b.vx *= 0.97; b.vz *= 0.97;
    return -vn;
  }
  return 0.0001;
}

// One physics sub-step. Returns '' or an outcome code the caller must act on.
function stepBall(b, dt) {
  b.vh -= GRAV * dt;
  b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt;
  b.spin += (b.vx + b.vz * 0.4) * dt * 3;
  if (b.h <= BR) {
    b.h = BR;
    if (b.vh < -1.1) {
      const sp = -b.vh;
      let e = RESTIT, fr = BOUNCE_FR;
      const pt = patchAt(b.x, b.z);
      if (pt) {
        if (pt.kind === 'pot') { e = 0.22; fr = 0.78; if (!b.batted) b.potHit = true; }
        else if (pt.kind === 'crack') { e = 0.95; fr = 0.95; b.vz += (rnd() - 0.5) * 2.4; b.vx += (rnd() - 0.5) * 1.6; if (!b.batted) b.potHit = true; }
        else { e = 0.5; fr = 0.7; b.vz += (rnd() - 0.5) * 2.6; if (!b.batted) b.potHit = true; }
      }
      if (b.googly && b.bounces === 0 && !b.batted) { fr *= b.gf; b.googly = false; }
      b.vh = sp * e; b.vx *= fr; b.vz *= fr * 0.96; b.bounces++;
      if (b.vh < 0.7) b.vh = 0;
      b.evBounce = sp; b.evPatch = pt ? pt.kind : '';
    } else {
      b.vh = 0;
      const s = sqrt(b.vx * b.vx + b.vz * b.vz);
      if (s > 0) { const ns = max(0, s - 2.5 * dt); b.vx *= ns / s; b.vz *= ns / s; }
    }
  }
  for (let i = 0; i < BOXES.length; i++) {
    const bx = BOXES[i];
    if (b.x < bx[0] - 0.2 || b.x > bx[1] + 0.2 || b.z < bx[2] - 0.2 || b.z > bx[3] + 0.2 || b.h < bx[4] - 0.2 || b.h > bx[5] + 0.2) continue;
    const imp = boxHit(b, bx);
    if (imp > 0.5) { b.evWall = imp; b.evWallKind = bx === AWN ? 'awn' : 'balc'; b.replan = true; b.wallHits++; }
    else if (imp > 0 && b.vh < 0.5 && b.h < bx[5] + BR + 0.02 && bx[5] - bx[4] < 0.3) {
      b.vx *= (1 - 3 * dt); b.vz *= (1 - 3 * dt);
    }
  }
  // the house walls: a glass window on either side ends the innings
  if (b.z > ZW - BR && b.vz > 0) {
    const w = windowAt(b.x, b.h, 1);
    if (w && w.type === 'glass' && !w.broken) { b.hitWin = w; return 'glass'; }
    b.z = ZW - BR;
    const imp = b.vz;
    b.vz = -b.vz * 0.5; b.vx *= 0.9; b.vh *= 0.92; b.wallHits++;
    b.evWall = imp; b.evWallKind = w ? (w.type === 'glass' ? 'brokenwin' : w.type) : 'wall'; b.replan = true;
  } else if (b.z < -ZN + BR && b.vz < 0) {
    const w = windowAt(b.x, b.h, -1);
    if (w && w.type === 'glass' && !w.broken) { b.hitWin = w; return 'glass'; }
    b.z = -ZN + BR; const imp = -b.vz;
    b.vz = -b.vz * 0.5; b.vx *= 0.9; b.wallHits++;
    b.evWall = imp; b.evWallKind = w ? (w.type === 'glass' ? 'brokenwin' : w.type) : 'wall'; b.replan = true;
  }
  if (b.x < END_X + BR && b.vx < 0) {
    const imp = -b.vx;
    if (b.batted && !b.awarded && b.bounces === 0 && b.wallHits === 0 && imp > 3) { b.awarded = 'two'; b.x = END_X + BR; return 'two'; }
    b.x = END_X + BR; b.vx = -b.vx * 0.45; b.vz *= 0.9; b.wallHits++;
    b.evWall = imp; b.evWallKind = 'wall'; b.replan = true;
  }
  if (b.batted && !b.awarded) {
    if (b.h > roofTopAt(b.x, b.z >= 0 ? 1 : -1) + 0.15) { b.awarded = 'six'; return 'six'; }
    if (b.x >= GATE_X) {
      if (b.h > 2.4) { b.awarded = 'six'; return 'sixgate'; }
      b.awarded = 'four'; return 'four';
    }
  } else if (b.x > GATE_X + 0.4 && b.vx > 0) { b.x = GATE_X + 0.4; b.vx = -b.vx * 0.3; }
  if (!b.batted && !CRATE.fall && b.x < CRATE_X + 0.26 && b.x > CRATE_X - 0.3 && abs(b.z) < 0.34 && b.h < 0.8 && b.vx < 0) return 'bowled';
  return '';
}

/* ------------------------------------------------------------ prediction for the fielders */
const PRED = { xFull: 0, tFull: -1, xB: 0, tB: -1, xTip: 0 };
function predict(b) {
  let x = b.x, h = b.h, vx = b.vx, vh = b.vh, t = 0, bounced = b.bounces;
  PRED.tFull = -1; PRED.tB = -1;
  for (let i = 0; i < 240 && t < 4; i++) {
    const dt = 1 / 60; vh -= GRAV * dt; x += vx * dt; h += vh * dt; t += dt;
    if (PRED.tFull < 0 && bounced === 0 && vh < 0 && h < 1.7 && h > 0.2) { PRED.tFull = t; PRED.xFull = x; }
    if (h <= BR) {
      h = BR;
      if (vh < -1.1) { vh = -vh * RESTIT; vx *= BOUNCE_FR; bounced++; if (PRED.tB < 0) { PRED.tB = t; PRED.xB = x; } if (bounced >= 2) break; } else break;
    }
    if (x < END_X || x > GATE_X) break;
  }
  PRED.xTip = PRED.tB >= 0 ? PRED.xB + vx * 0.2 : x;
  if (PRED.tB < 0) { PRED.tB = t; PRED.xB = x; }
}
function planFielding(b) {
  predict(b);
  const useFull = PRED.tFull > 0 && PRED.xFull > END_X + 0.5 && PRED.xFull < GATE_X;
  const px = useFull ? PRED.xFull : PRED.xTip;
  let best = null, bt = 1e9, second = null, st = 1e9;
  FIELDERS.forEach((f) => {
    f.goal = f.x;
    if (f.hasBall) return;
    const T = abs(f.x - px) / f.speed;
    if (T < bt) { second = best; st = bt; best = f; bt = T; } else if (T < st) { second = f; st = T; }
  });
  if (best) best.goal = px;
  const dir = b.vx >= 0 ? 1 : -1;
  if (second) second.goal = clamp(px + dir * 3.5, second.zone[0] - 1, second.zone[1] + 1);
  b.replan = false;
}

/* ------------------------------------------------------------ the match */
function dispName() { return G.mode === 'sunday' ? SUNDAY[G.matchIx].name : G.rival; }
function newMatch() {
  G.D = DIFF[G.diff] || DIFF.serious;
  G.runs = 0; G.outs = 0; G.balls = 0; G.trial = true; G.trialRuns = 0; G.matchWon = false; G.batterIx = 0; G.deliveries = 0;
  G.overOutcomes.length = 0; G.lastOutcome = ''; G.slow = 0; G.ended = false;
  G.sunMul = 1;
  if (G.mode === 'last') { G.target = 0; G.ballLimit = 0; G.sunMul = 1; G.rival = ''; }
  else {
    const T = G.D.target; let add = 0;
    if (G.mode === 'sunday') { const s = SUNDAY[G.matchIx]; add = s.add; G.sunMul = s.speed; G.rival = s.name; }
    else G.rival = RIVALS[(rnd() * RIVALS.length) | 0];
    G.target = floor(rr(T[0], T[1] + 1)) + add; G.ballLimit = 18;
  }
  resetWindows();
  CRATE.tip = 0; CRATE.fall = false;
  newPatches();
  BAT.x = BAT_X; BAT.state = 'idle'; BAT.lastEnd = 0; BAT.out = false; BAT.z = 0;
  SW.on = false; SW.cd = 0; SW.t = 0; SW.shot = null;
  BALL.state = 'none'; BALL.hidden = true;
  FIELDERS.forEach((f, i) => { f.x = f.x0; f.goal = f.x0; f.hasBall = false; f.tried = false; f.walk = 0; f.z = FZ[i] * G.D.zs; });
  BOWLER.x = BOWL_X + 3;
  BUBBLES.length = 0; POPS.length = 0;
  setPhase('intro', 2.1);
  const msg = G.mode === 'last' ? 'Last Man Standing' : 'Chase ' + G.target + ' in 3 overs';
  G.endBanner = '';
  if (arc) arc.toast(msg, G.mode === 'last' ? 'Score as much as you can' : 'vs ' + dispName(), 1900);
  G.t = 0;
  say(pick(LINES.trial), BAT, 2.2, 1.9);
  CAM.snap = true;
}

function chooseKind() {
  if (TEST.kind) return TEST.kind;
  const mix = Object.assign({}, G.D.mix);
  if (G.mode === 'last') {
    const over = floor(G.balls / 6);
    mix.bouncer += min(3, over * 0.4); mix.googly += min(3, over * 0.4); mix.slow = max(0.6, mix.slow - over * 0.3);
  }
  let tot = 0; for (const k in mix) tot += mix[k];
  let r = rnd() * tot;
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return 'fast';
}
function speedMult() {
  let m = G.D.speed * G.sunMul;
  if (G.mode === 'last') m *= 1 + min(0.22, floor(G.balls / 6) * 0.035);
  return m;
}

// Work out a launch that lands where we want it, with the same physics as the game.
function planDelivery(kind) {
  const T = DELIV[kind], mult = speedMult();
  const spd = T.speed * mult * (0.95 + rnd() * 0.1);
  const hr = 1.5 + rnd() * 0.18;
  const out = { kind, vx: -spd, vh: 0, vz: 0, hr, googly: false, gf: 1 };
  const aimH = rr(T.aim[0], T.aim[1]);
  if (kind === 'full') {
    const t = (REL_X - ARR_X) / spd;
    out.vh = (aimH - hr + 0.5 * GRAV * t * t) / t;
    return out;
  }
  let gf = 1;
  if (kind === 'googly') { gf = rnd() < 0.5 ? 0.5 : 1.55; out.googly = true; out.gf = gf; }
  let bestX = 3, bestErr = 1e9, bestVy = 0;
  const shuffleStart = rnd() * 0.1;
  for (let xp = T.xp[0] + shuffleStart; xp <= T.xp[1]; xp += 0.1) {
    const t1 = (REL_X - xp) / spd;
    const vy0 = (0.5 * GRAV * t1 * t1 - (hr - BR)) / t1;
    const vyi = vy0 - GRAV * t1;
    const vyp = -vyi * RESTIT;
    const vx2 = spd * BOUNCE_FR * gf, t2 = (xp - ARR_X) / vx2;
    if (t2 <= 0.02) continue;
    const hArr = BR + vyp * t2 - 0.5 * GRAV * t2 * t2;
    const err = abs(hArr - aimH);
    if (err < bestErr) { bestErr = err; bestX = xp; bestVy = vy0; }
  }
  out.vh = bestVy; out.pitch = bestX;
  return out;
}

function startRunup() {
  const kind = chooseKind();
  G.plan = planDelivery(kind);
  G.lastDelivery = kind;
  const T = DELIV[kind];
  BOWLER.runFrom = BOWL_X + T.run + 0.6; BOWLER.runT = 0; BOWLER.runDur = 0.35 + T.run / 4.6; BOWLER.x = BOWLER.runFrom;
  BOWLER.running = true; BOWLER.arm = 0;
  setPhase('runup');
}
function release() {
  const p = G.plan, b = BALL;
  b.state = 'air'; b.hidden = false; b.x = REL_X; b.h = p.hr; b.z = 0; b.vx = p.vx; b.vh = p.vh; b.vz = 0;
  b.bounces = 0; b.batted = false; b.spin = 0; b.awarded = ''; b.wallHits = 0; b.googly = p.googly; b.gf = p.gf; b.replan = false; b.restT = 0; b.hitWin = null;
  b.kind = p.kind; b.potHit = false; b.evBounce = 0; b.evWall = 0; b.trailN = 0; b.stuckT = 0; b.evPatch = '';
  G.dotT = 0; G.shotLabel = '';
  BOWLER.running = false;
  setPhase('flight');
  SND.swish();
  if (G.D !== DIFF.legend) pop(DELIV[p.kind].tag.toUpperCase(), REL_X, 2.6, '#FFE9B0', 14, 1.0);
  if (rnd() < 0.5) say(pick(LINES.bowl), BOWLER, 1.0, 1.9);
  FIELDERS.forEach((f) => { f.tried = false; f.hasBall = false; });
}

function addRuns(n) {
  if (G.trial) { G.trialRuns += n; return; }
  G.runs += n;
  G.overOutcomes.push(n);
  if (G.mode !== 'last' && G.runs >= G.target && !G.matchWon) { G.matchWon = true; }
}
function addOut() {
  if (G.trial) return;
  G.outs++; G.batterIx = min(2, G.outs);
}

// The ball is dead: put the result on screen and move on.
function endBall(kind, info) {
  if (G.phase === 'dead' || G.phase === 'over' || G.phase === 'interlude') return;
  const trial = G.trial;
  let text = '', small = '', out = false, add = 0, cheer = 0, line = null, lowKey = false;
  switch (kind) {
    case 'four': add = 4; text = 'FOUR!'; small = 'Along the ground to the far gate'; cheer = 2; line = LINES.four; break;
    case 'two': add = 2; text = 'TWO!'; small = 'Full on the end wall'; cheer = 1; line = LINES.two; break;
    case 'six': add = 6; out = true; text = 'SIX, AND OUT!'; small = 'Over the roof: the ball is gone'; cheer = 2; line = LINES.six; break;
    case 'sixgate': add = 6; out = true; text = 'SIX, AND OUT!'; small = 'Over the gate: into the main road'; cheer = 2; line = LINES.six; break;
    case 'caught': out = true; text = 'CAUGHT!'; small = (info && info.name ? info.name : 'Fielder') + ' takes it'; line = LINES.out; break;
    case 'tip': out = true; text = 'ONE TIP, ONE HAND!'; small = 'Caught one-handed after one bounce'; line = LINES.tip; break;
    case 'bowled': out = true; text = 'BOWLED!'; small = 'The crate is down'; line = LINES.bowled; break;
    case 'glass': out = true; text = 'GLASS! BALL GAYA!'; small = 'Window broken: out, and the ball is lost'; line = LINES.glass; break;
    case 'runout': out = true; text = 'RUN OUT!'; small = 'The crate was hit before you got home'; line = LINES.runout; break;
    case 'dot': text = 'DOT BALL'; small = G.shotLabel === 'Miss' ? 'Beaten' : ''; line = LINES.dot; lowKey = true; break;
    case 'stuck': text = 'STUCK UP THERE!'; small = 'Ball on the balcony: dead ball'; line = LINES.stuck; lowKey = true; break;
    case 'dog': text = 'DOG TOOK IT!'; small = 'Bhuri has run off with the ball'; line = LINES.dog; lowKey = true; break;
    case 'stopped': { const r = G.lastBallRuns || 0; text = r > 0 ? r + (r === 1 ? ' RUN' : ' RUNS') : 'NO RUN'; lowKey = true; break; }
    case 'won': text = 'TARGET CHASED!'; small = 'Colony jeet gayi'; cheer = 2; break;
    default: break;
  }
  G.lastOutcome = kind;
  if (trial) {
    G.trial = false;
    text = 'TRIAL BALL'; small = 'Does not count: ' + (kind === 'dot' ? 'have a look' : 'no runs, no out');
    out = false; add = 0; cheer = 0; lowKey = true;
    if (kind === 'caught' || kind === 'tip' || kind === 'bowled' || kind === 'glass' || kind === 'runout') small = 'Not out: it was only the trial ball';
    G.trialRuns = 0;
    G.trialPending = false;
  } else {
    G.balls++;
    addRuns(add);
    if (out) addOut(kind);
  }
  if (arc) arc.toast(text, small, lowKey ? 1300 : 1900);
  if (line) {
    const spk = (kind === 'four' || kind === 'two' || kind === 'six' || kind === 'sixgate') ? FIELDERS[1] : (kind === 'dot' ? FIELDERS[0] : BOWLER);
    say(pick(line), spk, 1.8, 1.95);
  }
  if (cheer) SND.cheer(cheer > 1);
  if (out && !trial) SND.out();
  if (kind === 'glass') {
    AUNTY.state = 'scold'; AUNTY.t = 0;
    setTimeout(() => { if (G.phase === 'dead' || G.phase === 'ready') sayAt(pick(LINES.aunty), AUNTY.x, AUNTY.h + 2.0, ZW - 0.55, 2.4); }, 500);
  }
  if (out && !trial && G.outs === 2 && G.outs < G.maxOuts) setTimeout(() => say(pick(LINES.lastMan), BAT, 2.0, 1.9), 1200);
  G.flags.lastEnd = kind;
  setPhase('dead', kind === 'glass' ? 2.6 : 1.9);
  G.deadKind = kind;
}

function afterBall() {
  if (G.matchWon) return finishMatch(true);
  if (G.outs >= G.maxOuts) return finishMatch(false);
  if (G.mode !== 'last' && G.balls >= G.ballLimit) return finishMatch(false);
  if (G.deadKind === 'glass' || G.deadKind === 'six' || G.deadKind === 'sixgate' || G.deadKind === 'dog' || G.deadKind === 'stuck') {
    if (!G.trialJustSpare) say(pick(LINES.spare), FIELDERS[2], 1.6, 1.9);
  }
  prepareNextBall();
}
function prepareNextBall() {
  BALL.state = 'none'; BALL.hidden = true; BALL.thrown = null;
  FIELDERS.forEach((f) => { f.hasBall = false; f.tried = false; f.goal = f.x0; });
  BOWLER.x = BOWL_X + 3; BOWLER.goal = BOWL_X + 3;
  if (CRATE.fall) { CRATE.tip = 0; CRATE.fall = false; }
  BAT.state = 'idle';
  setPhase('ready');
  G.readyT = 0.85 + (G.D === DIFF.chill ? 0.3 : 0);
  if (!G.trial && G.balls % 6 === 0 && G.balls > 0 && G.mode !== 'last') arc.toast('Over ' + (G.balls / 6) + ' done', G.target - G.runs > 0 ? 'Need ' + (G.target - G.runs) + ' off ' + (G.ballLimit - G.balls) : '', 1500);
  if (G.mode === 'last' && G.balls > 0 && G.balls % 6 === 0) arc.toast('Over ' + (G.balls / 6) + ' done', 'Bowlers are getting quicker', 1400);
  if (G.balls % 6 === 0 && G.balls > 0) newPatches();
}

function finishMatch(won) {
  if (G.ended) return; G.ended = true;
  let bonus = 0;
  if (G.mode !== 'last' && won) bonus = 20 + (G.maxOuts - G.outs) * 5 + max(0, G.ballLimit - G.balls) * 2;
  const rec = { name: dispName(), runs: G.runs, target: G.target, won, bonus, outs: G.outs, balls: G.balls };
  if (G.mode === 'last') {
    setPhase('over');
    arc.over({
      score: G.runs, scoreLabel: 'Runs', eyebrow: 'Three outs', title: G.runs >= 30 ? 'What an <em>innings</em>' : 'Innings <em>over</em>',
      html: '<p>You scored <b>' + G.runs + '</b> in ' + G.balls + ' ball' + (G.balls === 1 ? '' : 's') + ' (' + floor(G.balls / 6) + '.' + (G.balls % 6) + ' overs). The colony says: ' + (G.runs >= 30 ? 'sab ko pata chal gaya, tum champ ho!' : 'ek aur baari?') + '</p>',
    });
    return;
  }
  G.results.push(rec);
  G.totalScore += G.runs + bonus;
  if (G.mode === 'chase') {
    setPhase('over');
    arc.over({
      score: G.runs + bonus, scoreLabel: won ? 'Runs + win bonus' : 'Runs', eyebrow: won ? 'Colony won' : 'Colony lost',
      title: won ? 'Target <em>chased</em>' : 'Just <em>short</em>',
      html: '<p>' + (won ? 'You chased ' + G.target + ' against ' + G.rival + ' with ' + (G.ballLimit - G.balls) + ' ball' + (G.ballLimit - G.balls === 1 ? '' : 's') + ' to spare and ' + (G.maxOuts - G.outs) + ' out' + (G.maxOuts - G.outs === 1 ? '' : 's') + ' in hand. Win bonus: ' + bonus + '.' : G.rival + ' set ' + G.target + '. You made ' + G.runs + (G.outs >= G.maxOuts ? ' and ran out of batters.' : ' and ran out of balls.')) + '</p>',
    });
    return;
  }
  if (!won) {
    setPhase('over');
    arc.over({
      score: G.totalScore, scoreLabel: 'Tournament points', eyebrow: 'Knocked out', title: 'Out of <em>Super Sunday</em>',
      html: '<p>' + sundayRecap() + '</p>',
    });
    return;
  }
  if (G.matchIx >= SUNDAY.length - 1) {
    const trophy = 50; G.totalScore += trophy;
    setPhase('over');
    arc.over({
      score: G.totalScore, scoreLabel: 'Tournament points', eyebrow: 'Trophy', title: 'Super Sunday <em>champions</em>',
      html: '<p>Three lanes beaten. Trophy bonus: ' + trophy + '. ' + sundayRecap() + '</p>',
    });
    return;
  }
  G.interludeT = 0; setPhase('interlude');
  G.interlude = { won, rec, next: SUNDAY[G.matchIx + 1], nextTarget: null };
  if (arc) { SND.cheer(true); }
}
function sundayRecap() {
  return G.results.map((r) => r.name + ' ' + r.runs + '/' + r.target + (r.won ? ' W' : ' L')).join(', ') + '.';
}

/* ------------------------------------------------------------ batting */
function readShot() {
  if (SW.shot) return SW.shot;
  const ax = arc.input.axis();
  return { loft: ax.y < -0.35, ground: ax.y > 0.35, bias: ax.x > 0.35 ? 1 : ax.x < -0.35 ? -1 : 0, side: 0 };
}
// A swipe on a phone: up lofts, down keeps it low, left plays it early (to the front), right late (behind).
function shotFromSwipe(sw) {
  const len = Math.hypot(sw.dx, sw.dy) || 1, nx = sw.dx / len, ny = sw.dy / len;
  return { loft: ny < -0.4, ground: ny > 0.4, bias: nx < -0.4 ? 1 : nx > 0.4 ? -1 : 0, side: nx < -0.4 ? -1 : nx > 0.4 ? 1 : 0 };
}
function pressBat(shot) {
  if (SW.cd > 0 || !(G.phase === 'flight' || G.phase === 'ready' || G.phase === 'runup' || G.phase === 'intro' || (G.phase === 'live' && !BALL.batted))) return;
  const s = shot || { loft: false, ground: false, bias: 0, side: 0, fromAxis: true };
  SW.shot = shot ? s : null;
  const rs = shot || readShot();
  SW.on = true; SW.t = 0; SW.hit = false; SW.kind = rs.loft ? 2 : rs.ground ? 0 : 1; SW.dur = G.D.swing; SW.cd = SW.dur + 0.28; SW.after = 0; SW.voff = 0;
  SND.swish();
}
function contact(p) {
  const b = BALL, D = G.D, s = readShot();
  SW.hit = true; SW.voff = max(0, 0.5 - p);
  const tauRaw = (p - 0.5) / 0.4; // -1 late .. +1 early
  const at = abs(tauRaw);
  const qT = 1 - sstep(D.perfect, 1.0, at) * 0.9;
  const hc = s.loft ? 0.95 : s.ground ? 0.45 : 0.7;
  const hq = 1 - clamp(abs(b.h - hc) / 1.1, 0, 0.62);
  const q = qT * hq;
  const tau = clamp(tauRaw + s.bias * 0.4, -1.3, 1.3);
  const side = s.side ? s.side : (rnd() < 0.55 ? 1 : -1);
  let psi;
  if (abs(tau) <= 0.25) psi = side * (0.04 + rnd() * 0.1);
  else if (tau > 0) psi = side * (0.14 + (tau - 0.25) * 1.0);
  else psi = PI - side * (0.22 + (-tau - 0.25) * 0.95);
  let speed = 5 + 9.5 * q + abs(b.vx) * 0.12;
  if (s.loft) speed *= 1.3;
  let theta;
  if (s.loft) theta = (40 + (q - 0.5) * 8) * PI / 180;
  else if (s.ground) theta = (2 + rnd() * 3) * PI / 180;
  else theta = (15 + rnd() * 4) * PI / 180;
  if (b.h > 1.3 && s.ground) theta += 0.25;
  if (b.h < 0.2 && !s.loft) theta += 0.1;
  if (q < 0.32) { theta += 0.32; speed *= 0.62; }
  const ct = cos(theta);
  b.vx = speed * ct * cos(psi); b.vz = speed * ct * sin(psi); b.vh = speed * sin(theta);
  b.batted = true; b.bounces = 0; b.wallHits = 0; b.awarded = ''; b.googly = false; b.state = 'air';
  b.trailN = 0;
  const lab = q > 0.8 && at <= D.perfect ? 'PERFECT' : q > 0.5 ? 'Good' : tau > 0.3 ? 'Early' : tau < -0.3 ? 'Late' : 'Mistimed';
  G.shotLabel = lab;
  pop(lab, b.x, 1.7, lab === 'PERFECT' ? '#FFB736' : lab === 'Good' ? '#FBF5EC' : '#FF8A3D', lab === 'PERFECT' ? 22 : 17, 0.9);
  SND.bat(q);
  sparkBurst(b.x, b.h, 0, q > 0.7 ? 14 : 7);
  kick(0.26 * (0.4 + q)); if (!arc.reducedMotion) G.slow = q > 0.8 ? 0.14 : 0.06;
  if (lab === 'PERFECT' && rnd() < 0.5) say(pick(LINES.perfect), FIELDERS[3], 1.3, 1.9);
  setPhase('live');
  G.liveT = 0; G.lastBallRuns = 0; BAT.ran = 0;
  FIELDERS.forEach((f) => { f.armUp = 0; f.tried = false; f.hasBall = false; });
  planFielding(b);
  CAM.sFlip = 0; CAM.s = (b.vx >= 0 ? 1 : -1);
}

function updateBatter(dt) {
  BAT.phase += dt * 11;
  if (BAT.state === 'run') {
    BAT.x += BAT.dir * BAT.speed * dt; BAT.run = 1;
    if (BAT.dir > 0 && BAT.x >= CHALK_X) { BAT.x = CHALK_X; arriveEnd(1); }
    else if (BAT.dir < 0 && BAT.x <= BAT_X) { BAT.x = BAT_X; arriveEnd(0); }
    if (rnd() < dt * 7) SND.run();
  } else BAT.run = max(0, BAT.run - dt * 6);
  BAT.face = BAT.state === 'run' ? BAT.dir : 1;
}
function arriveEnd(e) {
  BAT.state = 'idle';
  if (e !== BAT.lastEnd) {
    BAT.lastEnd = e; G.lastBallRuns++;
    if (G.phase === 'live') {
      addRuns(1);
      pop(G.trial ? '(trial)' : '+1', BAT.x, 1.9, '#FFE9B0', 20, 0.8);
      SND.ding();
      if (G.matchWon) { endBall('won'); }
    }
  }
  if (BAT.queue) {
    BAT.queue = false;
    if (G.phase === 'live' && BALL.state !== 'held' && BALL.state !== 'thrown' && BALL.state !== 'gone') { BAT.dir = BAT.lastEnd === 0 ? 1 : -1; BAT.state = 'run'; }
  }
}
function startRun() {
  if (G.phase !== 'live' || !BALL.batted) return;
  if (BALL.state === 'gone') return;
  if (BAT.state === 'idle') { BAT.dir = BAT.lastEnd === 0 ? 1 : -1; BAT.state = 'run'; if (rnd() < 0.5) say(pick(LINES.run), FIELDERS[2], 1.2, 1.9); }
  else if (BALL.state === 'held' || BALL.state === 'thrown') BAT.dir = -BAT.dir;
  else BAT.queue = true;
}

/* ------------------------------------------------------------ fielding */
function updateFielders(dt) {
  const live = G.phase === 'live' && BALL.state !== 'none';
  const b = BALL;
  FIELDERS.forEach((f) => {
    let goal = f.x;
    if (f.role === 'bowler' && G.phase === 'runup') { f.phase += dt * 10; return; }
    if (live && b.batted && b.state === 'air') {
      const rolling = b.h <= BR + 0.02;
      if (rolling && !f.hasBall) {
        let nearest = null, nt = 1e9;
        FIELDERS.forEach((g) => { const T = abs(g.x - b.x) / g.speed; if (T < nt) { nt = T; nearest = g; } });
        if (f === nearest) goal = b.x + b.vx * min(0.5, abs(b.x - f.x) / (f.speed + abs(b.vx) + 0.1));
        else goal = f.goal;
      } else goal = f.goal;
    } else if (live && (b.state === 'held' || b.state === 'thrown')) goal = f.hasBall ? f.x : f.x0;
    else if (!live) goal = f.hasBall ? f.x : (f.role === 'bowler' ? (G.phase === 'ready' || G.phase === 'intro' || G.phase === 'attract' ? BOWL_X + 3 : BOWL_X) : f.x0);
    else goal = f.x0;
    const dx = goal - f.x, step = f.speed * dt;
    if (abs(dx) > 0.06) { f.x += clamp(dx, -step, step); f.face = dx > 0 ? 1 : -1; f.walk = lerp(f.walk, 1, min(1, dt * 10)); f.phase += dt * (9 + f.speed); }
    else { f.walk = lerp(f.walk, 0, min(1, dt * 9)); }
    if (live && b.batted && b.state === 'air' && G.D.zs < 1 && abs(b.x - f.x) < 9) { const tzz = clamp(b.z, -1.6, 1.6); f.z += clamp(tzz - f.z, -1.1 * dt, 1.1 * dt); }
    else if (f.role === 'bowler') { const tz = (G.phase === 'flight' || G.phase === 'live' || G.phase === 'dead') ? 1.6 * G.D.zs : 0; f.z += clamp(tz - f.z, -2.5 * dt, 2.5 * dt); }
    if (f.armUp > 0) f.armUp -= dt;
    if (f.hold > 0) {
      f.hold -= dt;
      if (f.hold <= 0 && f.hasBall && b.state === 'held') throwBall(f);
    }
  });
  if (!live) FIELDERS.forEach((f) => { if (f.walk < 0.1 && f.role !== 'bowler') f.face = f.role === 'keeper' ? 1 : -1; });
}
function throwBall(f) {
  const b = BALL;
  const tx = CRATE_X + 0.25, th = 0.55;
  const dist = abs(f.x - tx);
  b.state = 'thrown';
  b.thrown = { x0: f.x, h0: 1.15, x1: tx, h1: th, t: 0, dur: max(0.4, dist / (9.5 + (G.D === DIFF.legend ? 3 : 0))), arc: min(2.4, 0.4 + dist * 0.07) };
  f.hasBall = false; f.armUp = 0.4;
  SND.swish();
}
function takeBall(f, caughtKind) {
  const b = BALL;
  b.state = 'held'; f.hasBall = true; f.hold = caughtKind ? 0.5 : 0.4 + rnd() * 0.2; f.tried = true;
  b.vx = b.vz = b.vh = 0; b.x = f.x; b.h = 1.0; b.z = f.z;
  f.armUp = 0.5;
}
function checkFielders(b) {
  if (!b.batted || b.state !== 'air') return '';
  const D = G.D;
  for (let i = 0; i < FIELDERS.length; i++) {
    const f = FIELDERS[i];
    if (f.tried || f.hasBall) continue;
    const dx = abs(b.x - f.x), dz = abs(b.z - f.z);
    if (dx > 0.58 || dz > 1.05) continue;
    const spd = sqrt(b.vx * b.vx + b.vz * b.vz + b.vh * b.vh);
    if (b.bounces <= 1 && b.h > 0.45 && b.h < 2.4) {
      f.tried = true;
      let p = D.pCatch * f.hands * (1 - dx / 1.4 * 0.4) * (1 - clamp((spd - 8) / 18, 0, 0.6)) * (b.bounces === 1 ? 0.86 : 1);
      if (b.h > 1.9) p *= 0.8;
      if (f.walk > 0.6) p *= 0.88;
      f.armUp = 0.55;
      if (rnd() < p) { const kind = b.bounces === 0 ? 'caught' : 'tip'; takeBall(f, true); SND.caught(); G.catcher = f; return kind; }
      SND.tink(); b.vx *= 0.35; b.vz += (rnd() - 0.5) * 2; b.vh = max(b.vh, 0) + 2.2; b.replan = true;
      if (rnd() < 0.6) say(pick(LINES.drop), f, 1.3, 1.9);
      pop('Dropped!', f.x, 2.3, '#FF8A3D', 15, 0.9);
    } else if (b.h <= 0.45) {
      f.tried = true;
      const p = D.pStop * f.hands * (1 - clamp((spd - 6) / 14, 0, 0.75));
      f.dive = 0.4;
      if (rnd() < p) { takeBall(f, false); SND.thock(6); G.catcher = f; return ''; }
      else if (rnd() < 0.5) say('Arre!', f, 1.0, 1.9);
    }
  }
  return '';
}

/* ------------------------------------------------------------ the ball in play */
function updateBall(dt) {
  const b = BALL;
  if (b.state === 'none' || b.state === 'gone') return;
  if (b.state === 'held') { const f = FIELDERS.find((q) => q.hasBall); if (f) { b.x = f.x + f.face * 0.2; b.h = 1.0; b.z = f.z; } return; }
  if (b.state === 'stuck') return;
  if (b.state === 'dog') { b.x = DOG.x + DOG.dir * 0.35; b.h = 0.3; b.z = DOG.z; return; }
  if (b.state === 'thrown') {
    const t = b.thrown; t.t += dt; const u = min(1, t.t / t.dur);
    b.x = lerp(t.x0, t.x1, u); b.h = lerp(t.h0, t.h1, u) + 4 * t.arc * u * (1 - u) * 0.5; b.z = 0; b.spin += dt * 20;
    if (u >= 1) {
      b.state = 'held';
      const runOut = BAT.state === 'run' && BAT.x > HOME_SAFE && BAT.x < CHALK_X - 0.25 && G.phase === 'live';
      if (runOut) { SND.wall(8); dustPuff(CRATE_X, 0.4, 0, 6, true); CRATE.fall = true; endBall('runout'); }
      else if (G.phase === 'live') endBall('stopped');
    }
    return;
  }
  const n = max(1, Math.ceil(dt / 0.0055)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const code = stepBall(b, h);
    if (code) { resolveCode(code); return; }
    if (b.batted) {
      const k = checkFielders(b);
      if (k) { endBall(k, { name: G.catcher ? G.catcher.name : '' }); return; }
      if (b.state !== 'air') return;
    }
    if (DOG.active && !DOG.carry && b.batted && b.h <= BR + 0.05 && abs(b.x - DOG.x) < 0.5 && abs(b.z - DOG.z) < 0.9 && rnd() < 0.5 * h * 60) { dogFetch(); return; }
  }
  if (b.evBounce) {
    const v = b.evBounce; b.evBounce = 0;
    SND.bounce(v); dustPuff(b.x, 0.05, b.z, v > 5 ? 5 : 2, v > 7);
    if (b.evPatch === 'pot' && !b.batted) { pop('Gaddha!', b.x, 0.9, '#FF8A3D', 15, 0.8); }
    if (b.evPatch === 'pot' || b.evPatch === 'crack' || b.evPatch === 'stones') { dustPuff(b.x, 0.05, b.z, 7, true); b.evPatch = ''; if (!b.batted && rnd() < 0.5) say(pick(LINES.pot), BOWLER, 1.0, 1.9); }
  }
  if (b.evWall) {
    const v = b.evWall; b.evWall = 0;
    if (b.evWallKind === 'awn') SND.boing(); else SND.wall(v);
    dustPuff(b.x, b.h, clamp(b.z, -ZN + 0.2, ZW - 0.2), v > 6 ? 8 : 4, v > 7);
    if (v > 5) kick(0.12);
    if (v > 7 && abs(b.z) > 1) scareBirds(b.x);
    if (v > 6 && (b.evWallKind === 'balc' || b.evWallKind === 'shutter') && AUNTY.state === 'hidden' && b.x > 0 && b.x < 8 && b.z > 0) AUNTY.cd = -1;
  }
  if (b.replan && b.batted && G.phase === 'live') planFielding(b);
  b.trailT += dt;
  if (b.trailT > 0.016) { b.trailT = 0; const tr = b.trail; for (let i = 27; i >= 3; i--) tr[i] = tr[i - 3]; tr[0] = b.x; tr[1] = b.h; tr[2] = b.z; b.trailN = min(10, b.trailN + 1); }
  // a ball resting on a balcony slab is stuck
  if (b.batted && Math.abs(b.vh) < 0.3) {
    for (let i = 0; i < BALC.length; i++) {
      const bc = BALC[i];
      const inDepth = bc.side > 0 ? b.z > ZW - BAL_D : b.z < -ZW + BAL_D;
      if (b.x > bc.x0 && b.x < bc.x1 && inDepth && abs(b.z) < ZW && b.h < bc.hb + 0.3 && b.h > bc.hb && sqrt(b.vx * b.vx + b.vz * b.vz) < 0.9) {
        b.stuckT += dt;
        if (b.stuckT > 0.35 && G.phase === 'live') { b.state = 'stuck'; b.h = bc.hb + BR; b.vx = b.vz = b.vh = 0; if (bc.side > 0) AUNTY.state = AUNTY.state === 'hidden' ? 'rise' : AUNTY.state; endBall('stuck'); return; }
      }
    }
  }
  if (b.batted && b.h <= BR + 0.02 && sqrt(b.vx * b.vx + b.vz * b.vz) < 0.25) {
    b.restT += dt;
    b.vx = b.vz = 0;
    if (b.restT > 0.2 && G.phase === 'live') {
      let nearest = null, nt = 1e9;
      FIELDERS.forEach((g) => { const T = abs(g.x - b.x) / g.speed; if (T < nt) { nt = T; nearest = g; } });
      if (nearest) { nearest.goal = b.x; if (abs(nearest.x - b.x) < 0.5) { takeBall(nearest, false); SND.thock(4); } }
    }
    if (b.restT > 9 && G.phase === 'live') endBall('stopped');
  } else b.restT = 0;
  if (!b.batted && b.x < -1.1 && G.phase === 'flight') {
    G.dotT += dt;
    if (G.dotT > 0.5) { setPhaseMissed(); }
  }
  if (!b.batted && G.phase === 'flight') {
    if (b.x < END_X + 0.2 || sqrt(b.vx * b.vx + b.vz * b.vz) < 0.2 && b.h <= BR + 0.02) setPhaseMissed();
  }
}
function setPhaseMissed() {
  if (G.phase !== 'flight') return;
  if (SW.on || SW.after > 0) G.shotLabel = 'Miss'; else G.shotLabel = '';
  if (G.shotLabel === 'Miss') pop('Miss!', BAT.x, 1.8, '#FF8A3D', 17, 0.8);
  if (rnd() < 0.45) say(pick(LINES.miss), FIELDERS[0], 1.3, 1.9);
  endBall('dot');
}
function resolveCode(code) {
  const b = BALL;
  switch (code) {
    case 'bowled': {
      CRATE.fall = true; CRATE.vx = -3; SND.wall(9); SND.thock(10); dustPuff(CRATE_X, 0.4, 0, 8, true); kick(0.3);
      b.vx *= 0.25; b.state = 'air'; endBall('bowled'); break;
    }
    case 'glass': {
      const w = b.hitWin; breakWindow(w); b.state = 'gone'; b.hidden = true;
      SND.glass(); shards(b.x, b.h, w.side * (ZW - 0.2)); kick(0.35); scareBirds(b.x, true);
      CAM.hold.set(w.side * ZW, b.h, -b.x); CAM.holdSet = true;
      endBall('glass'); break;
    }
    case 'four': case 'two': {
      b.state = 'air'; SND.wall(10);
      if (code === 'four') { b.x = GATE_X; b.vx *= 0.15; SND.tink(); }
      endBall(code); break;
    }
    case 'six': case 'sixgate': {
      b.state = 'gone'; b.hidden = true; CAM.hold.set(b.z, b.h, -b.x); CAM.holdSet = true; endBall(code); break;
    }
    default: break;
  }
}
function dogFetch() {
  DOG.carry = true; DOG.fetch = true; BALL.state = 'dog'; DOG.dir = DOG.x > CAM.fx ? 1 : -1; SND.bark();
  say(pick(LINES.dog), null, 1.5); const bb = BUBBLES[BUBBLES.length - 1]; if (bb) { bb.x = DOG.x; bb.h = 1.1; bb.z = DOG.z; }
  if (G.phase === 'live') endBall('dog');
}

/* ------------------------------------------------------------ neighbourhood life */
function scareBirds(x, all) {
  for (let i = 0; i < BIRDS.length; i++) {
    const b = BIRDS[i];
    if (b.state !== 'perch') continue;
    if (all || abs(b.px - x) < 10) {
      b.state = 'fly'; b.t = 0; b.x = b.px; b.h = wireH(b.k, b.px) + 0.1; b.vx = rr(-2.8, 2.8); b.vy = rr(2.5, 4.5);
    }
  }
}
BIRDS.forEach((b) => { b.px = clamp(b.x, -8, 30); b.x = b.px; b.h = 0; });
function updateBirds(dt) {
  for (let i = 0; i < BIRDS.length; i++) {
    const b = BIRDS[i];
    b.flap += dt * (b.state === 'perch' ? 0 : 18);
    if (b.state === 'fly') {
      b.t += dt; b.x += b.vx * dt; b.h += b.vy * dt; b.vy = lerp(b.vy, 0.4, min(1, dt * 1.2)) + sin(b.t * 5 + i) * dt * 2;
      if (b.vx !== 0) b.face = b.vx > 0 ? 0 : PI;
      if (b.t > 4.2) { b.state = 'back'; b.t = 0; b.sx = b.x; b.sh = b.h; }
    } else if (b.state === 'back') {
      b.t += dt; const u = min(1, b.t / 1.8), e = u * u * (3 - 2 * u);
      b.x = lerp(b.sx, b.px, e); b.h = lerp(b.sh, wireH(b.k, b.px) + 0.1, e) + sin(u * PI) * 0.6;
      if (u >= 1) { b.state = 'perch'; b.x = b.px; }
    }
  }
}

function updateAunty(dt) {
  const A_ = AUNTY;
  if (A_.state === 'hidden') {
    if (G.auntyTimer <= 0 || A_.cd < 0) {
      A_.state = 'rise'; A_.t = 0; A_.cd = 0; G.auntyTimer = rr(22, 38);
      if (rnd() < 0.7) setTimeout(() => { if (A_.state !== 'hidden') sayAt(pick(LINES.auntyChat), A_.x, A_.h + 2.05, ZW - 0.55, 2.3); }, 700);
    }
  } else if (A_.state === 'rise') {
    A_.up = min(1, A_.up + dt * 2.6); if (A_.up >= 1) { A_.state = 'idle'; A_.t = 0; }
  } else if (A_.state === 'idle') {
    A_.t += dt; if (A_.t > 4) A_.state = 'fall';
  } else if (A_.state === 'scold') {
    A_.up = min(1, A_.up + dt * 4); A_.t += dt; A_.shake = sin(A_.t * 22) * 0.5; if (A_.t > 3.2) A_.state = 'fall';
  } else if (A_.state === 'fall') {
    A_.up = max(0, A_.up - dt * 2.2); if (A_.up <= 0) { A_.state = 'hidden'; A_.shake = 0; }
  }
  G.flags.aunty = A_.state !== 'hidden';
}

function updateDog(dt) {
  const D_ = DOG;
  if (!D_.active) {
    if (G.dogTimer <= 0 && AUTO.state === 'none') {
      D_.active = true; D_.dir = rnd() < 0.5 ? 1 : -1; D_.x = D_.dir > 0 ? -6.5 : 22;
      D_.state = 'walk'; D_.t = 0; D_.carry = false; D_.stops = 0; D_.goal = clamp(3 + rr(-4, 4), END_X + 2, GATE_X - 2); D_.z = rr(0.9, 1.5);
      G.dogTimer = rr(24, 40);
    }
  } else {
    D_.phase += dt * 9;
    D_.t += dt;
    if (D_.carry) {
      D_.x += D_.dir * 5.5 * dt;
      if (D_.x < -12 || D_.x > 29) { D_.active = false; D_.carry = false; }
    } else if (D_.state === 'walk') {
      const toGoal = D_.goal - D_.x;
      if (D_.stops < 1 && abs(toGoal) > 0.1) { D_.dir = toGoal > 0 ? 1 : -1; D_.x += D_.dir * 1.9 * dt; }
      else if (D_.stops < 1) { D_.state = rnd() < 0.5 ? 'sniff' : 'bark'; D_.t = 0; D_.stops = 1; if (D_.state === 'bark') { SND.bark(); say('Bhow bhow!', null, 1.3); const bb = BUBBLES[BUBBLES.length - 1]; bb.x = D_.x; bb.h = 1.15; bb.z = D_.z; } }
      else { D_.x += D_.dir * 2.1 * dt; if (D_.x < -12 || D_.x > 28) D_.active = false; }
    } else if (D_.state === 'sniff') {
      if (D_.t > 1.8) { D_.state = 'walk'; D_.dir = D_.x < 3 ? 1 : -1; if (rnd() < 0.5) D_.dir = -D_.dir; }
    } else if (D_.state === 'bark') {
      D_.barkT += dt; if (D_.barkT > 0.55 && D_.t < 1.7) { D_.barkT = 0; SND.bark(); scareBirds(D_.x); }
      if (D_.t > 1.9) { D_.state = 'walk'; D_.dir = rnd() < 0.5 ? 1 : -1; }
    }
  }
  G.flags.dog = D_.active;
}

// The auto comes in through the far gate, passes the batter, and turns into the garage at the closed end.
const AUTO_L1 = 33 - (-8.2), AUTO_R = 1.9, AUTO_LA = PI / 2 * 1.9, AUTO_L3 = 2.8, AUTO_TOTAL = AUTO_L1 + AUTO_LA + AUTO_L3;
function autoPose() {
  const s = AUTO.s;
  if (s < AUTO_L1) { AUTO.x = 33 - s; AUTO.z = -1.45; AUTO.hx = -1; AUTO.hz = 0; }
  else if (s < AUTO_L1 + AUTO_LA) {
    const phi = (s - AUTO_L1) / AUTO_R, cz = -1.45 - AUTO_R;
    AUTO.x = -8.2 + AUTO_R * -sin(phi); AUTO.z = cz + AUTO_R * cos(phi);
    AUTO.hx = -cos(phi); AUTO.hz = -sin(phi);
  } else { const d = s - AUTO_L1 - AUTO_LA; AUTO.x = -8.2 - AUTO_R; AUTO.z = -1.45 - AUTO_R - d; AUTO.hx = 0; AUTO.hz = -1; }
}
function startAuto() {
  AUTO.dir = -1;
  AUTO.state = 'warn'; AUTO.t = 0; AUTO.horned = 0; AUTO.s = 0; autoPose();
  G.autoTimer = rr(38, 58);
  G.flags.autoCount = (G.flags.autoCount || 0) + 1;
  SND.horn();
  let best = FIELDERS[2], bd = 1e9;
  FIELDERS.forEach((f) => { const d = abs(f.x - 3); if (d < bd) { bd = d; best = f; } });
  say(pick(LINES.auto), best, 2.0, 1.95);
  if (G.phase === 'ready') { setPhase('auto'); SW.on = false; }
}
function updateAuto(dt) {
  if (AUTO.state === 'none') {
    if (G.autoTimer <= 0 && (G.phase === 'ready' || G.phase === 'attract' || G.phase === 'over') && arc.state !== 'pause') startAuto();
    G.flags.auto = false; G.yield = lerp(G.yield || 0, 0, min(1, dt * 3));
    AUTO.door = max(0, AUTO.door - dt * 1.4);
    return;
  }
  G.flags.auto = true;
  AUTO.t += dt;
  G.yield = lerp(G.yield || 0, 1, min(1, dt * 4));
  if (AUTO.state === 'warn') {
    AUTO.door = min(1, AUTO.door + dt * 1.2);
    if (AUTO.t > 0.9) { AUTO.state = 'pass'; AUTO.t = 0; }
  } else if (AUTO.state === 'pass') {
    AUTO.s += AUTO.speed * dt; autoPose(); AUTO.wheel += AUTO.speed * dt / 0.26;
    AUTO.door = 1;
    if (rnd() < dt * 8) emit(1, AUTO.x - AUTO.hx * 1.5, 0.45, AUTO.z - AUTO.hz * 1.5, 0, { speed: 0.4, up: 0.8, life: 0.8, size: 5, col: '#8a8076', g: -0.3 });
    if (!AUTO.horned && AUTO.s > AUTO_L1 - 12) { AUTO.horned = 1; SND.horn(); scareBirds(CAM.fx, true); }
    if (AUTO.s >= AUTO_TOTAL) {
      AUTO.state = 'none'; G.flags.auto = false;
      if (G.phase === 'auto') { setPhase('ready'); G.readyT = 0.9; }
    }
  }
}

/* ------------------------------------------------------------ main update */
function updateParticles(dt) {
  for (let i = 0; i < PARTS.length; i++) {
    const p = PARTS[i];
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; continue; }
    p.vh -= GRAV * p.g * dt; p.x += p.vx * dt; p.h += p.vh * dt; p.z += p.vz * dt;
    if (p.h < 0.02 && p.kind !== 0) { p.h = 0.02; p.vh *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
    if (p.kind === 0) { p.vx *= 1 - dt * 1.5; }
  }
  for (let i = POPS.length - 1; i >= 0; i--) { const p = POPS[i]; p.t += dt; if (p.t > p.life) POPS.splice(i, 1); }
  for (let i = BUBBLES.length - 1; i >= 0; i--) { const b = BUBBLES[i]; b.t += dt; if (b.ent) { b.x = b.ent.x; b.z = b.ent.z || 0; } if (b.t > b.life) BUBBLES.splice(i, 1); }
}

function ambient(dt) {
  G.autoTimer -= dt; G.dogTimer -= dt; G.auntyTimer -= dt;
  updateBirds(dt); updateAunty(dt); updateDog(dt); updateAuto(dt);
  updateParticles(dt);
  if (CRATE.fall) { CRATE.tip = min(1, CRATE.tip + dt * 3.2); }
  BAT.phase += dt * 3;
  SW.cd = max(0, SW.cd - dt);
  if (SW.on) { SW.t += dt; if (SW.t >= SW.dur) { SW.on = false; SW.after = 0.22; } }
  else if (SW.after > 0) SW.after -= dt;
}

function stepFlow(dt) {
  const ph = G.phase;
  if (ph === 'intro') {
    if (G.t >= G.phaseLen) { setPhase('ready'); G.readyT = 0.5; }
  } else if (ph === 'ready') {
    G.readyT -= dt;
    if (G.autoTimer <= 0) startAuto();
    else if (G.readyT <= 0) startRunup();
  } else if (ph === 'runup') {
    BOWLER.runT += dt;
    const u = min(1, BOWLER.runT / BOWLER.runDur);
    BOWLER.x = lerp(BOWLER.runFrom, BOWL_X, u);
    BOWLER.arm = u; BOWLER.phase += dt * 11;
    if (u >= 1) release();
  } else if (ph === 'flight') {
    updateBall(dt);
    if (SW.on && !SW.hit && !BALL.batted && G.phase === 'flight') {
      const b = BALL, p = SW.t / SW.dur;
      if (b.state === 'air' && b.x > -0.15 && b.x < 1.25 && b.h > 0 && b.h < 1.95 && p >= 0.1 && p <= 0.9) contact(p);
    }
  } else if (ph === 'live') {
    G.liveT += dt;
    updateBall(dt);
  } else if (ph === 'dead') {
    if (BALL.state === 'air' || BALL.state === 'thrown' || BALL.state === 'held') updateBall(dt);
    if (G.t >= G.phaseLen) afterBall();
  } else if (ph === 'interlude') {
    G.interludeT += dt;
    if (G.interludeT > 0.6 && (arc.input.hit('Space', 'Enter', 'NumpadEnter') || arc.input.pointer.pressed || arc.input.tap() || G.interludeT > 9)) {
      G.matchIx++; newMatch();
    }
  }
}

// What a finger did on the canvas this frame: a tap, a swipe, or a lift that was a little too slow to count as either.
const TOUCH = { was: false, dx: 0, dy: 0, sx: 0, sy: 0, t0: 0 };
function gestureBat() {
  const inp = arc.input, g = inp.gesture;
  const sw = inp.swipe(), tp = inp.tap();
  if (g.active) { TOUCH.was = true; TOUCH.dx = g.dx; TOUCH.dy = g.dy; if (!TOUCH.t0) TOUCH.t0 = performance.now(); }
  let fired = false;
  if (sw) { pressBat(shotFromSwipe(sw)); fired = true; }
  else if (tp) { pressBat(null); fired = true; }
  else if (TOUCH.was && !g.active) {
    // a slow lift: still counts, the lift is the swing
    const d = Math.hypot(TOUCH.dx, TOUCH.dy);
    if (d < 30) pressBat(null); else pressBat(shotFromSwipe({ dx: TOUCH.dx, dy: TOUCH.dy }));
    fired = true;
  }
  if (!g.active && TOUCH.was) { TOUCH.was = false; TOUCH.dx = TOUCH.dy = 0; TOUCH.t0 = 0; }
  return fired;
}

function update(dt, a) {
  arc = a;
  let gdt = dt;
  if (G.slow > 0) { G.slow -= dt; gdt = dt * 0.28; }
  G.time += gdt; G.t += gdt;
  const inp = a.input;
  const gest = a.touchMode && a.touchStyle !== 'pads' && G.phase !== 'interlude';
  if (gest) {
    gestureBat();
    if (inp.hit('Space')) pressBat();
  } else if (inp.hit('Space') || inp.pointer.pressed) {
    if (G.phase !== 'interlude') pressBat();
  } else { TOUCH.was = false; }
  if (inp.hit('KeyR')) startRun();
  ambient(gdt);
  stepFlow(gdt);
  updateBatter(gdt);
  updateFielders(gdt);
  if (G.phase === 'dead' || G.phase === 'ready') {
    if (BAT.x > BAT_X + 0.02 && BAT.state === 'idle') { BAT.x = max(BAT_X, BAT.x - 4.4 * gdt); BAT.face = -1; BAT.run = 1; if (BAT.x <= BAT_X + 0.02) BAT.lastEnd = 0; }
  }
  updateCamera(dt);
}

function idle(dt, a) {
  arc = a;
  if (a.state === 'pause') return;
  G.time += dt; G.t += dt;
  ambient(dt);
  updateFielders(dt);
  updateBatter(dt);
  if (G.phase === 'dead') { G.phase = 'over'; }
  updateCamera(dt);
}

/* ------------------------------------------------------------ camera */
const V = { W: 1, H: 1, portrait: false, sig: '' };
const cpT = new THREE.Vector3(), ctT = new THREE.Vector3();
function computeView() { V.W = arc.w; V.H = arc.h; V.portrait = V.H > V.W * 1.05; }

function homeRig(pp, tt) {
  if (V.portrait) { pp.set(0, 3.5, 9.4); tt.set(0, 0.6, -4.6); }
  else { pp.set(0, 3.3, 9.4); tt.set(0, 0.9, -4.2); }
}
function updateCamera(dt) {
  if (!arc) return;
  computeView();
  const b = BALL, ph = G.phase;
  let mode = 'home', k = 3.0;
  if (ph === 'attract' || ph === 'over' || ph === 'interlude') mode = 'orbit';
  else if (ph === 'live' && b.state !== 'none') {
    if (b.state === 'gone') mode = 'hold';
    else if (b.state === 'held' || b.state === 'thrown') mode = 'action';
    else mode = 'ball';
  } else if (ph === 'dead') {
    if ((G.deadKind === 'six' || G.deadKind === 'sixgate' || G.deadKind === 'glass') && CAM.holdSet) mode = 'hold';
    else if (b.batted && b.state === 'air' && G.t < 1.1) mode = 'ball';
  }
  if (ph !== 'dead' && ph !== 'live') CAM.holdSet = false;
  if (mode === 'orbit') {
    const T = G.time * 0.16;
    cpT.set(sin(T) * 1.5, 2.3 + 0.5 * sin(T * 0.7), 5.4 + (cos(T * 0.6) + 1) * 1.6);
    ctT.set(0.2, V.portrait ? 0.9 : 1.15, -5.5);
    k = 1.6; CAM.s = 1;
  } else if (mode === 'ball') {
    if (b.batted && b.state === 'air') {
      const want = b.vx >= 0 ? 1 : -1;
      if (abs(b.vx) > 2.5 && want !== CAM.s) { CAM.sFlip += dt; if (CAM.sFlip > 0.16) { CAM.s = want; CAM.cut = 1; CAM.sFlip = 0; } } else CAM.sFlip = 0;
    }
    const s = CAM.s;
    const back = V.portrait ? 8.6 : 8.0;
    cpT.set(clamp(b.z * 0.3, -1.2, 1.2), 2.5 + clamp(b.h * 0.3, 0, 3.2), -clamp(b.x - s * back, -10.8, 28.5));
    ctT.set(b.z * 0.55, clamp(b.h * 0.55 + 0.5, 0.7, 10), -(b.x + s * 2.6));
    k = 4.2;
  } else if (mode === 'action') {
    let mx = BAT.x;
    const hf = FIELDERS.find((f) => f.hasBall);
    if (b.state === 'held' || b.state === 'thrown') mx = (BAT.x + b.x) / 2;
    CAM.s = 1;
    cpT.set(0, V.portrait ? 3.3 : 2.9, -clamp(mx - 9.0, -10.8, 24));
    ctT.set(0, 0.95, -(mx + 1.5));
    k = 3.2; if (hf) k = 3.4;
  } else if (mode === 'hold') {
    cpT.copy(CAM.p); ctT.copy(CAM.hold);
    if (b.state === 'gone' || true) { ctT.y = clamp(ctT.y, 1.0, 11); }
    k = 2.2;
  } else {
    homeRig(cpT, ctT); CAM.s = 1;
    if (ph === 'flight' || ph === 'runup') { const u = ph === 'flight' ? 1 : BOWLER.arm; cpT.z -= 0.35 * u; }
  }
  if (CAM.prevS !== CAM.s) { if (CAM.prevS != null && mode === 'ball') CAM.cut = 1; CAM.prevS = CAM.s; }
  if (arc.reducedMotion) k *= 0.55;
  if (CAM.snap) { CAM.p.copy(cpT); CAM.t.copy(ctT); CAM.snap = false; }
  else if (CAM.cut) {
    CAM.p.copy(cpT); CAM.t.copy(ctT); CAM.cut = 0;
    if (!arc.reducedMotion) CAM.flash = 0.45;
  } else {
    const a = damp(k, dt);
    CAM.p.lerp(cpT, a); CAM.t.lerp(ctT, a * 1.2 > 1 ? 1 : a * 1.2);
  }
  CAM.fx = lerp(CAM.fx, -CAM.t.z, damp(2, dt));
  CAM.flash = max(0, CAM.flash - dt * 2.4);
}

/* ------------------------------------------------------------ syncing the scene to the game */
const POSE = {
  stance: { th: -0.6, yw: 0.2, tw: 0, ln: 0.2 },
  back: { th: 1.8, yw: 0.55, tw: 0.35, ln: -0.1 },
  contact: [{ th: -1.2, yw: -0.1, tw: -0.25, ln: 0.9 }, { th: -1.4, yw: -0.12, tw: -0.3, ln: 0.7 }, { th: -1.65, yw: -0.1, tw: -0.3, ln: 0.5 }],
  follow: [{ th: -2.0, yw: -0.8, tw: -0.75, ln: 0.6 }, { th: -2.55, yw: -0.9, tw: -0.85, ln: 0.4 }, { th: -3.15, yw: -0.6, tw: -0.7, ln: 0.2 }],
  carry: { th: 0.25, yw: 0.6, tw: 0, ln: 0.6 },
};
const mixPose = (a, b, t) => ({ th: lerp(a.th, b.th, t), yw: lerp(a.yw, b.yw, t), tw: lerp(a.tw, b.tw, t), ln: lerp(a.ln, b.ln, t) });
function batterPoseNow() {
  const kind = SW.kind;
  if (SW.on) {
    const p = clamp(SW.t / SW.dur + (SW.hit ? SW.voff : 0), 0, 1);
    if (p < 0.5) return mixPose(POSE.back, POSE.contact[kind], sstep(0, 0.5, p));
    return mixPose(POSE.contact[kind], POSE.follow[kind], sstep(0.5, 1, p));
  }
  if (SW.after > 0) return mixPose(POSE.stance, POSE.follow[kind], sstep(0, 0.22, SW.after));
  const b = BALL;
  if (G.phase === 'flight' && !b.batted && b.x < 5.2 && b.x > 1) return mixPose(POSE.stance, POSE.back, 0.35 * (1 - (b.x - 1) / 4.2));
  if (G.phase === 'runup') return mixPose(POSE.stance, POSE.back, 0.12);
  return POSE.stance;
}
const COLC = {};
const colC = (s) => COLC[s] || (COLC[s] = new THREE.Color(s));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const AX_Z = new THREE.Vector3(0, 0, 1), AX_Y = new THREE.Vector3(0, 1, 0);

function placeKid(key, x, z, yaw) {
  const r = ACT.kids[key];
  r.root.position.set(z, 0, -x); r.root.rotation.y = yaw; r.blob.position.set(z, 0.017, -x);
}
function syncScene(dt) {
  const kids = ACT.kids, y = G.yield || 0;
  const zOf = (z) => z + y * (1.3 - z);
  // batter
  {
    const r = kids.bat;
    const run = BAT.state === 'run' || (BAT.run > 0.4 && (G.phase === 'dead' || G.phase === 'ready'));
    const lat = -0.45 * (1 - y);
    const tyaw = run ? (BAT.state === 'run' ? (BAT.dir > 0 ? PI : 0) : 0) : PI * 0.66;
    BAT.yaw += angDiff(BAT.yaw, tyaw) * damp(run ? 14 : 8, dt);
    placeKid('bat', BAT.x, zOf(BAT.z) + lat, BAT.yaw);
    const pz = batterPoseNow();
    const o = { walk: run ? 1 : 0, phase: BAT.phase, lean: run ? 1.0 : pz.ln, bob: sin(G.time * 2.4) * 0.006, crouch: run ? 0.05 : 0.18 };
    poseKid(r, o);
    const pp = run ? POSE.carry : pz;
    r.swing.rotation.set(pp.th, pp.yw, 0);
    r.body.rotation.y = run ? 0 : pp.tw * 0.5;
  }
  // fielders, keeper, bowler
  for (let i = 0; i < FIELDERS.length; i++) {
    const f = FIELDERS[i], r = kids[f.key];
    const tyaw = f.face > 0 ? PI : 0;
    f.yaw += angDiff(f.yaw, tyaw) * damp(12, dt);
    placeKid(f.key, f.x, zOf(f.z), f.yaw);
    const o = { walk: f.walk, phase: f.phase, lean: f.walk * 0.7, bob: sin(G.time * 2 + f.id) * 0.005 };
    if (f.armUp > 0) { o.armL = -2.35; o.armR = (f.id % 2) ? 0.3 : -2.25; }
    else if (f.dive > 0) { o.crouch = 0.8; o.lean = 1.4; f.dive -= dt; }
    if (f.role === 'bowler') {
      if (G.phase === 'runup') {
        o.walk = 1; o.phase = BOWLER.phase; o.lean = 0.6;
        o.armR = lerp(0.2, PI * 1.12, BOWLER.arm); o.armL = -0.9 * sin(BOWLER.arm * PI);
      } else if (G.phase === 'flight') {
        const fo = sstep(0, 0.5, G.t);
        o.lean = 1.3 * (1 - fo) + 0.3; o.armR = lerp(PI * 1.12, PI * 1.95, fo); o.armL = -0.6 * (1 - fo);
      }
    }
    poseKid(r, o);
  }
  // the crate
  {
    const c = ACT.crate;
    c.piv.rotation.x = CRATE.tip * 1.45;
    c.piv.position.set(0, 0, -CRATE_X + 0.17 + CRATE.tip * 0.3); c.m.position.set(0, 0, -0.17);
  }
  // the ball
  {
    const b = BALL, bo = ACT.ball;
    const vis = !(b.state === 'none' || b.hidden || b.state === 'gone');
    bo.m.visible = bo.glow.visible = bo.shadow.visible = vis;
    if (vis) {
      const dx = b.z - camera.position.x, dy = b.h - camera.position.y, dz = -b.x - camera.position.z;
      const d = sqrt(dx * dx + dy * dy + dz * dz);
      const ms = clamp(d / 9, 1, 2.3);
      bo.m.position.set(b.z, b.h, -b.x); bo.m.rotation.x = b.spin; bo.m.scale.setScalar(ms);
      bo.glow.position.set(b.z, b.h, -b.x); bo.glow.scale.setScalar(clamp(0.18 + d * 0.02, 0.3, 1.1));
      bo.glow.material.opacity = b.state === 'air' ? 0.5 : 0.25;
      const sh = clamp(1 - b.h / 7, 0.25, 1);
      bo.shadow.position.set(b.z, 0.017, -b.x); bo.shadow.scale.setScalar((0.8 + b.h * 0.1) * ms * 0.9); bo.shadow.material.opacity = 0.42 * sh;
      let n = 0;
      if (b.state === 'air') n = min(9, b.trailN - 1);
      for (let i = 0; i < 10; i++) {
        if (i < n) { _p.set(b.trail[(i + 1) * 3 + 2], b.trail[(i + 1) * 3 + 1], -b.trail[(i + 1) * 3]); _s.setScalar((1 - i / 10) * ms); }
        else { _p.set(0, -50, 0); _s.setScalar(0.0001); }
        _m.compose(_p, _q.identity(), _s); bo.trail.setMatrixAt(i, _m);
      }
      bo.trail.instanceMatrix.needsUpdate = true;
    } else {
      for (let i = 0; i < 10; i++) { _m.compose(_p.set(0, -50, 0), _q.identity(), _s.setScalar(0.0001)); bo.trail.setMatrixAt(i, _m); }
      bo.trail.instanceMatrix.needsUpdate = true;
    }
  }
  // the dog
  {
    const d = ACT.dog, D_ = DOG;
    d.g.visible = D_.active;
    if (D_.active) {
      d.g.position.set(D_.z, 0, -D_.x); d.g.rotation.y = D_.dir > 0 ? PI : 0;
      const run = D_.carry ? 1 : (D_.state === 'walk' ? 0.6 : 0);
      d.legs.forEach((lg, i) => { lg.rotation.x = sin(D_.phase + i * 1.6) * 0.55 * run; });
      d.tail.rotation.y = sin(D_.phase * 1.4 + (D_.state === 'bark' ? 6 : 0)) * 0.5;
      d.head.rotation.x = D_.state === 'sniff' ? 0.55 : (D_.state === 'bark' ? -0.25 + (sin(D_.t * 14) > 0 ? -0.1 : 0.05) : 0.05);
      d.g.position.y = D_.state === 'bark' ? abs(sin(D_.t * 14)) * 0.04 : 0;
      d.ball.visible = D_.carry;
    }
  }
  // the auto-rickshaw and the garage doors
  {
    const a = ACT.auto, A_ = AUTO;
    a.g.visible = A_.state === 'pass';
    if (a.g.visible) {
      a.g.position.set(A_.z, abs(sin(A_.wheel * 2)) * 0.012, -A_.x);
      a.g.rotation.y = atan2(A_.hz, -A_.hx);
      a.wheels.forEach((w) => { w.rotation.x = A_.wheel; });
    }
    const ang = sstep(0, 1, A_.door) * 1.75;
    FX.garage.forEach((gd) => { gd.piv.rotation.y = gd.dir * ang; });
  }
  // the aunty
  {
    const a = ACT.aunty, A_ = AUNTY;
    a.g.visible = A_.up > 0.001;
    if (a.g.visible) {
      const sc = A_.state === 'scold';
      a.g.position.set(A_.z + (A_.shake || 0) * 0.03, A_.h - (1 - A_.up) * 1.45, -A_.x);
      a.g.rotation.y = -PI / 2;
      a.armR.rotation.x = sc ? -2.7 + sin(A_.t * 22) * 0.18 : -0.35 + sin(G.time * 1.2) * 0.05;
      a.armR.rotation.z = sc ? -0.1 : -0.12;
      a.armL.rotation.x = sc ? 0.1 : -0.9; a.armL.rotation.z = 0.2;
      a.can.visible = !sc;
    }
  }
  // birds
  {
    const bi = ACT.birds;
    for (let i = 0; i < BIRDS.length; i++) {
      const b = BIRDS[i], perched = b.state === 'perch';
      const px = perched ? b.px : b.x, py = perched ? wireH(b.k, b.px) : b.h;
      _p.set(wireZ(b.k), py, -px);
      _q.setFromAxisAngle(AX_Y, b.face);
      _s.setScalar(1.35);
      _m.compose(_p, _q, _s); bi.body.setMatrixAt(i, _m);
      for (let w = 0; w < 2; w++) {
        const flap = perched ? 0 : sin(b.flap) * 0.9;
        _q2.setFromAxisAngle(AX_Z, w ? flap : -flap);
        _q3.setFromAxisAngle(AX_Y, w ? PI : 0);
        _q2.premultiply(_q).multiply(_q3);
        _s.setScalar(perched ? 0.0001 : 1.2);
        _m.compose(_p, _q2, _s); bi.wing.setMatrixAt(i * 2 + w, _m);
      }
    }
    bi.body.instanceMatrix.needsUpdate = true; bi.wing.instanceMatrix.needsUpdate = true;
  }
  // particles
  {
    layers.dust.begin(); layers.spark.begin(); layers.shard.begin();
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i]; if (!p.on) continue;
      const a = clamp(p.life / p.max, 0, 1), c = colC(p.col);
      if (p.kind === 0) layers.dust.push(p.z, p.h, -p.x, (0.12 + p.size * 0.034) * (1.6 - a * 0.6), a * 0.5, c);
      else if (p.kind === 1) layers.spark.push(p.z, p.h, -p.x, 0.04 + p.size * 0.012, a, c);
      else layers.shard.push(p.z, p.h, -p.x, 0.06 + p.size * 0.014, a, c);
    }
    layers.dust.end(); layers.spark.end(); layers.shard.end();
    layers.mote.begin();
    const wc = colC('#ffe3a6'), t = G.time;
    for (let i = 0; i < FX.motes.length; i++) {
      const m = FX.motes[i];
      const z = ((m.z + t * m.s * 4 - CAM.p.z * 0 + 40) % 56) - 38, x = m.x + sin(t * 0.3 + m.p) * 0.6, yy = m.y + sin(t * 0.5 + m.p * 2) * 0.25;
      layers.mote.push(x, yy, z, 0.045, (0.25 + 0.35 * (0.5 + 0.5 * sin(t * 0.9 + m.p))) * (arc.reducedMotion ? 0.5 : 1), wc);
    }
    layers.mote.end();
  }
  updateSwayers(G.time);
  // sun follows the camera so it stays at infinity; shadow box follows the action
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  FX.sky.position.set(cx, cy, cz);
  FX.halo.position.set(cx + SUN_DIR.x * 250, cy + SUN_DIR.y * 250 * 0.82, cz + SUN_DIR.z * 250);
  FX.core.position.copy(FX.halo.position);
  const fx = Math.round(CAM.t.x / 3) * 3, fz = Math.round(CAM.t.z / 3) * 3;
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx + SUN_DIR.x * 70, SUN_DIR.y * 70, fz + SUN_DIR.z * 70);
  sun.target.updateMatrixWorld();
  paintBoard(false);
}

/* ------------------------------------------------------------ HUD drawing (2D, over the 3D scene) */
function rrect(c, x, y, w, h, r) {
  r = min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function plate(c, x, y, w, h) {
  c.fillStyle = 'rgba(15,13,10,.74)'; rrect(c, x, y, w, h, 10); c.fill();
  c.strokeStyle = 'rgba(251,245,236,.16)'; c.lineWidth = 1; rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, 10); c.stroke();
}
const _sp = { x: 0, y: 0 };
function toScreen(gx, h, gz, out) {
  _p.set(gz, h, -gx).project(camera);
  if (_p.z > 1 || _p.z < -1) return false;
  out.x = (_p.x * 0.5 + 0.5) * V.W; out.y = (-_p.y * 0.5 + 0.5) * V.H;
  return true;
}
function drawBubbles(c) {
  const fs = V.portrait ? 12.5 : 14;
  c.font = '600 ' + fs + 'px ' + FONT_UI; c.textBaseline = 'middle'; c.textAlign = 'center';
  for (let i = 0; i < BUBBLES.length; i++) {
    const b = BUBBLES[i];
    if (!b.lines) {
      const maxW = Math.min(V.W * 0.62, 230);
      const words = b.text.split(' '); let cur = '', lines = [];
      words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
      lines.push(cur); b.lines = lines; b.w = Math.max.apply(null, lines.map((l) => c.measureText(l).width)) + 18;
    }
    if (!toScreen(b.x, b.h + b.t * 0.08, b.z, _sp)) continue;
    const a = b.t < 0.12 ? b.t / 0.12 : b.t > b.life - 0.28 ? (b.life - b.t) / 0.28 : 1;
    const lh = fs * 1.25, bh = b.lines.length * lh + 10;
    const x = _sp.x, y = _sp.y - bh - 10;
    const bx = clamp(x - b.w / 2, 6, V.W - b.w - 6), by = clamp(y, 6, V.H - bh - 6);
    c.globalAlpha = a;
    c.fillStyle = b.aunty ? '#ffe8f0' : '#FBF5EC'; c.strokeStyle = '#1A1814'; c.lineWidth = 1.6;
    rrect(c, bx, by, b.w, bh, 9); c.fill(); c.stroke();
    const tx = clamp(x, bx + 12, bx + b.w - 12);
    c.beginPath(); c.moveTo(tx - 6, by + bh - 0.5); c.lineTo(tx, by + bh + 8); c.lineTo(tx + 6, by + bh - 0.5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(tx - 6, by + bh); c.lineTo(tx, by + bh + 8); c.lineTo(tx + 6, by + bh); c.stroke();
    c.fillStyle = '#FBF5EC'; c.fillRect(tx - 5, by + bh - 2, 10, 3);
    c.fillStyle = '#1A1814';
    b.lines.forEach((l, k) => c.fillText(l, bx + b.w / 2, by + 5 + lh * (k + 0.5) + 1));
  }
  c.globalAlpha = 1;
}
function drawPops(c) {
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  for (let i = 0; i < POPS.length; i++) {
    const p = POPS[i], a = p.t < 0.1 ? p.t / 0.1 : clamp((p.life - p.t) / 0.3, 0, 1);
    if (!toScreen(p.x, p.h + p.t * 0.9, p.z, _sp)) continue;
    c.globalAlpha = a; c.font = '700 ' + max(12, p.size) + 'px ' + FONT_MONO;
    c.lineWidth = 3.5; c.strokeStyle = 'rgba(15,13,10,.85)'; c.strokeText(p.text, _sp.x, _sp.y);
    c.fillStyle = p.col; c.fillText(p.text, _sp.x, _sp.y);
  }
  c.globalAlpha = 1;
}
function drawHUD(c) {
  if (G.phase === 'attract') return;
  const p = V.portrait, pad = 10, sm = p ? 11.5 : 12;
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  const lw = p ? 128 : 168, lh = p ? 58 : 66;
  plate(c, pad, pad, lw, lh);
  c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.fillText('RUNS / OUT', pad + 12, pad + 19);
  c.fillStyle = '#FBF5EC'; c.font = '500 ' + (p ? 32 : 38) + 'px ' + FONT_SERIF; c.fillText(G.runs + '/' + G.outs, pad + 12, pad + (p ? 50 : 56));
  const ov = floor(G.balls / 6) + '.' + (G.balls % 6);
  c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.textAlign = 'right';
  c.fillText('BALLS ' + G.balls, pad + lw - 12, pad + (p ? 34 : 38));
  c.fillText('OV ' + ov, pad + lw - 12, pad + (p ? 50 : 56));
  c.textAlign = 'left';
  for (let i = 0; i < G.maxOuts; i++) {
    const sx = pad + 8 + i * 15, sy = pad + lh + 8;
    c.fillStyle = i < G.outs ? 'rgba(255,77,31,.9)' : 'rgba(251,245,236,.28)';
    rrect(c, sx, sy, 11, 15, 3); c.fill();
    c.fillStyle = 'rgba(15,13,10,.8)'; c.fillRect(sx + 3, sy + 4, 1.6, 8); c.fillRect(sx + 6.4, sy + 4, 1.6, 8);
  }
  c.fillStyle = 'rgba(251,245,236,.85)'; c.font = '600 ' + sm + 'px ' + FONT_UI;
  const bn = BATTERS[min(2, G.outs)] + (G.outs >= 2 ? ' (last man)' : '');
  if (!p || V.W > 360) c.fillText(bn, pad + 8 + G.maxOuts * 15 + 4, pad + lh + 20);
  const rw = p ? 150 : 214;
  if (G.mode !== 'last' && G.phase !== 'over') {
    const need = G.target - G.runs, left = G.ballLimit - G.balls;
    const rh = p ? 58 : 66;
    plate(c, V.W - rw - pad, pad, rw, rh);
    c.textAlign = 'left';
    c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.fillText(G.mode === 'sunday' ? 'MATCH ' + (G.matchIx + 1) + '/3 TARGET' : 'TARGET', V.W - rw - pad + 12, pad + 19);
    c.fillStyle = '#FFB736'; c.font = '500 ' + (p ? 28 : 34) + 'px ' + FONT_SERIF; c.fillText(String(G.target), V.W - rw - pad + 12, pad + (p ? 48 : 54));
    c.textAlign = 'right'; c.fillStyle = '#FBF5EC'; c.font = '600 ' + (p ? 13 : 14) + 'px ' + FONT_UI;
    c.fillText(need > 0 ? 'Need ' + need : 'Chased!', V.W - pad - 12, pad + (p ? 38 : 42));
    c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.fillText(left + ' ball' + (left === 1 ? '' : 's') + ' left', V.W - pad - 12, pad + (p ? 53 : 58));
    c.textAlign = 'left';
    if (!p) { c.fillStyle = 'rgba(251,245,236,.8)'; c.font = '600 ' + sm + 'px ' + FONT_UI; c.textAlign = 'right'; c.fillText('vs ' + dispName(), V.W - pad - 4, pad + rh + 18); c.textAlign = 'left'; }
  } else if (G.mode === 'last') {
    const rh = p ? 46 : 52;
    plate(c, V.W - 118 - pad, pad, 118, rh);
    const best = arc.best();
    c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.textAlign = 'left'; c.fillText('YOUR BEST', V.W - 118 - pad + 12, pad + 19);
    c.fillStyle = '#FFB736'; c.font = '500 ' + (p ? 24 : 28) + 'px ' + FONT_SERIF; c.fillText(best == null ? '-' : String(max(best, G.runs)), V.W - 118 - pad + 12, pad + (p ? 41 : 46));
  }
  if (G.trial && (G.phase === 'intro' || G.phase === 'ready' || G.phase === 'runup' || G.phase === 'flight' || G.phase === 'live')) {
    const t = p ? 'TRIAL BALL' : 'TRIAL BALL: DOES NOT COUNT';
    c.font = '600 ' + sm + 'px ' + FONT_MONO; const w = c.measureText(t).width + 22;
    const cx = p ? V.W - w / 2 - pad : V.W / 2, y = p ? pad + (G.mode === 'last' ? 52 : 64) : pad + 6;
    plate(c, cx - w / 2, y, w, 26);
    c.fillStyle = '#FFE9B0'; c.textAlign = 'center'; c.fillText(t, cx, y + 17); c.textAlign = 'left';
  }
}
function drawInterlude(c) {
  if (G.phase !== 'interlude') return;
  const w = min(V.W - 28, 420), h = 200, x = (V.W - w) / 2, y = (V.H - h) / 2 - 20;
  c.fillStyle = 'rgba(6,5,3,.66)'; c.fillRect(0, 0, V.W, V.H);
  c.fillStyle = '#1A1814'; rrect(c, x, y, w, h, 16); c.fill();
  c.strokeStyle = '#3D3830'; c.lineWidth = 1; rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, 16); c.stroke();
  const I = G.interlude;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#c9a96e'; c.font = '500 12px ' + FONT_MONO; c.fillText('MATCH ' + (G.matchIx + 1) + ' WON', V.W / 2, y + 34);
  c.fillStyle = '#FBF5EC'; c.font = '400 ' + (w < 360 ? 24 : 30) + 'px ' + FONT_SERIF; c.fillText(I.rec.name + ' beaten', V.W / 2, y + 74);
  c.fillStyle = '#A39E94'; c.font = '400 15px ' + FONT_UI; c.fillText(I.rec.runs + ' chased ' + I.rec.target + ', bonus ' + I.rec.bonus, V.W / 2, y + 104);
  c.fillStyle = '#FBF5EC'; c.font = '600 15px ' + FONT_UI; c.fillText('Next: ' + I.next.name, V.W / 2, y + 134);
  const blink = floor(G.time * 2) % 2 === 0;
  c.fillStyle = blink ? '#FF6940' : '#c9a96e'; c.font = '600 13px ' + FONT_MONO; c.fillText(arc.touchMode ? 'TAP TO PLAY ON' : 'PRESS SPACE OR TAP', V.W / 2, y + 174);
  c.textAlign = 'left';
}
// While a finger is down on a phone, show what lifting it will do.
function drawGesture(c) {
  if (!(arc.state === 'play' && arc.touchMode && arc.touchStyle !== 'pads')) return;
  const g = arc.input.gesture;
  if (!g.active || g.type === 'mouse') return;
  const len = Math.hypot(g.dx, g.dy);
  let label = 'LIFT TO SWING';
  if (len > 22) {
    const nx = g.dx / len, ny = g.dy / len;
    const parts = [];
    if (ny < -0.4) parts.push('LOFT'); else if (ny > 0.4) parts.push('GROUND');
    if (nx < -0.4) parts.push('EARLY'); else if (nx > 0.4) parts.push('LATE');
    label = parts.join(' + ') || 'LIFT TO SWING';
  }
  c.save();
  c.lineCap = 'round'; c.strokeStyle = 'rgba(255,183,54,.9)'; c.fillStyle = 'rgba(255,183,54,.9)'; c.lineWidth = 4;
  c.beginPath(); c.arc(g.sx, g.sy, 16, 0, TAU); c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1; c.stroke();
  if (len > 22) {
    const ex = g.sx + g.dx, ey = g.sy + g.dy, an = atan2(g.dy, g.dx);
    c.beginPath(); c.moveTo(g.sx, g.sy); c.lineTo(ex, ey); c.stroke();
    c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - 14 * cos(an - 0.5), ey - 14 * sin(an - 0.5)); c.lineTo(ex - 14 * cos(an + 0.5), ey - 14 * sin(an + 0.5)); c.closePath(); c.fill();
  }
  c.font = '700 13px ' + FONT_MONO; c.textAlign = 'center';
  const tw = c.measureText(label).width + 20, tx = clamp(g.x, tw / 2 + 6, V.W - tw / 2 - 6), ty = clamp(g.y - 42, 16, V.H - 40);
  plate(c, tx - tw / 2, ty - 16, tw, 26);
  c.fillStyle = '#FFE9B0'; c.fillText(label, tx, ty + 2);
  c.restore();
}

/* ------------------------------------------------------------ the frame */
function render(c, a) {
  arc = a; arcRef = a;
  try {
    const now = performance.now();
    const rawDt = (now - (W3.lastT || now)) / 1000, dtR = clamp(rawDt, 0.001, 0.1); W3.lastT = now;
    if (V.sig !== a.w + 'x' + a.h) { computeView(); V.sig = a.w + 'x' + a.h; }
    if (W3.ready && !W3.failed) {
      const t0 = performance.now();
      syncScene(dtR);
      W3.tSync = performance.now() - t0;
      camera.position.copy(CAM.p);
      if (!a.reducedMotion) { camera.position.x += (a.shakeX || 0) * 0.012; camera.position.y += (a.shakeY || 0) * 0.012; }
      camera.lookAt(CAM.t);
      if (!W3.lost && !W3.norender) {
        const t1 = performance.now();
        R.render(scene, camera);
        if (W3.prof) { R.getContext().finish(); }
        W3.tRender = performance.now() - t1; W3.calls = R.info.render.calls; W3.tris = R.info.render.triangles;
        // quality auto-scale: step down when frames run slow (a settle window skips the frames that compile shaders)
        if (W3.settle > 0) W3.settle--;
        else if (!W3.fixq) {
          if (rawDt < 3) { W3.fpsAcc += rawDt; W3.fpsN++; }
          if (W3.fpsN >= 8) {
            const avg = W3.fpsAcc / W3.fpsN; W3.fpsAcc = 0; W3.fpsN = 0;
            W3.fps = 1 / avg;
            if (avg > 1 / 30 && W3.q < QL.length - 1) { W3.q += avg > 0.12 && W3.q < QL.length - 2 ? 2 : 1; applyQuality(); }
          }
        }
      }
    }
    if (W3.nohud) return;
    drawHUD(c);
    drawBubbles(c); drawPops(c);
    drawGesture(c);
    drawInterlude(c);
    if (CAM.flash > 0.01 && !a.reducedMotion) { c.fillStyle = 'rgba(255,238,205,' + CAM.flash * 0.7 + ')'; c.fillRect(0, 0, V.W, V.H); }
    if (W3.failed) {
      c.fillStyle = 'rgba(15,13,10,.8)'; c.fillRect(0, 0, V.W, V.H);
      c.fillStyle = '#FBF5EC'; c.font = '600 15px ' + FONT_UI; c.textAlign = 'center'; c.fillText('3D graphics are not available in this browser.', V.W / 2, V.H / 2); c.textAlign = 'left';
    }
  } catch (err) {
    if (!W3.warned) { W3.warned = true; try { console.warn('gully-champs 3d render:', err && err.message); } catch (e2) { /* ignore */ } }
  }
}

/* ------------------------------------------------------------ shell wiring */
const RULES = [
  ['Trial ball', 'The first ball of every innings is a trial. It does not count.'],
  ['One tip, one hand', 'Caught one-handed after a single bounce is out.'],
  ['Glass', 'Hit a window on either side and you are out. The ball is lost, and the aunty is not happy.'],
  ['Roof', 'Straight over the roof is six, and out.'],
  ['Gate and wall', 'Along the ground to the far gate is four. Full on the end wall is two.'],
  ['Running', 'Runs are between the crate and the chalk line. No LBW. The last man bats on.'],
];
const rulesHtml = () =>
  '<ul style="margin:0 0 14px;padding:0;list-style:none;display:grid;gap:5px;font-size:13.5px;line-height:1.4;color:var(--ink-dim)">' +
  RULES.map((r) => '<li><b style="color:var(--ink);font-weight:600">' + r[0] + '.</b> ' + r[1] + '</li>').join('') + '</ul>';

function resetScene() {
  G.D = DIFF[G.diff] || DIFF.serious;
  resetWindows();
  CRATE.tip = 0; CRATE.fall = false;
  BAT.x = BAT_X; BAT.state = 'idle'; BAT.lastEnd = 0;
  SW.on = false; SW.cd = 0; SW.after = 0; SW.shot = null;
  BALL.state = 'none'; BALL.hidden = true;
  FIELDERS.forEach((f, i) => { f.x = f.x0; f.goal = f.x0; f.hasBall = false; f.tried = false; f.walk = 0; f.armUp = 0; f.z = FZ[i] * G.D.zs; f.speed = (f.role === 'bowler' ? 3.6 : G.D.fieldSpeed) * (0.92 + (i * 0.037) % 0.16); });
  BOWLER.x = BOWL_X + 3;
  BUBBLES.length = 0; POPS.length = 0;
  if (!G.patches.length) newPatches(); else syncPatches();
}

function menuShow(a) {
  a.menu({
    eyebrow: 'Gully cricket',
    title: 'Gully <em>Champs</em>',
    html:
      '<p>A golden-hour afternoon, a narrow lane, and a taped tennis ball. The bowler runs in from the far end. <b>Tap</b> as the ball reaches you to swing, <b>swipe up</b> to loft it or <b>swipe down</b> to keep it on the ground, and tap <b>Run</b> to dash between the crate and the chalk line.</p>' +
      '<div class="eyebrow" style="margin:2px 0 8px">House rules</div>' + rulesHtml() +
      '<p style="font-size:14px"><b style="color:var(--ink)">Last Man Standing</b>: three outs, score as much as you can. <b style="color:var(--ink)">Chase the Colony</b>: beat the rival lane\'s target in three overs. <b style="color:var(--ink)">Super Sunday</b>: three chases against three lanes, getting harder.</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'last', choices: [{ v: 'last', label: 'Last Man Standing' }, { v: 'chase', label: 'Chase the Colony' }, { v: 'sunday', label: 'Super Sunday' }] },
      { id: 'diff', label: 'Difficulty', value: 'serious', choices: [{ v: 'chill', label: 'Chill' }, { v: 'serious', label: 'Serious' }, { v: 'legend', label: 'Gully Legend' }] },
    ],
    showKeys: !a.touchMode,
  });
}

function dbg() {
  const b = BALL;
  return {
    mode: G.mode, diff: G.diff, phase: G.phase, runs: G.runs, outs: G.outs, balls: G.balls, target: G.target, ballLimit: G.ballLimit,
    lastOutcome: G.lastOutcome, delivery: G.lastDelivery, trial: G.trial, shotLabel: G.shotLabel, rival: G.rival, matchIx: G.matchIx,
    ballPos: [+b.x.toFixed(2), +b.h.toFixed(2), +b.z.toFixed(2)], ballState: b.state, ballBatted: b.batted, bounces: b.bounces,
    auto: G.flags.auto, dog: G.flags.dog, aunty: G.flags.aunty, autoCount: G.flags.autoCount || 0,
    batter: { x: +BAT.x.toFixed(2), state: BAT.state }, swing: SW.on, cam: [+CAM.p.x.toFixed(1), +CAM.p.y.toFixed(1), +CAM.p.z.toFixed(1)],
    brokenWindows: WIN.filter((w) => w.broken).length, totalScore: G.totalScore, results: G.results, quality: W3.q, fps: W3.fps ? +W3.fps.toFixed(0) : 0,
  };
}

A.create({
  slug: 'gully-champs',
  title: 'Gully Champs',
  genre: 'Gully cricket',
  three: true,
  hint: 'Click or Space to bat    Up loft    Down ground    R run',
  touchHint: 'Bat pad as the ball arrives, stick for loft and placement, Run pad',
  gestures: {
    drag: false,
    tilt: true,
    hint: 'Tap to bat. Swipe up: loft. Down: ground. Left: early. Right: late. Lift your finger as the ball arrives.',
    keys: [
      ['Tap', 'Bat: lift your finger as the ball reaches you'],
      ['Swipe up / down', 'Loft the shot / keep it on the ground'],
      ['Swipe left / right', 'Play it early (to the front) / late (behind)'],
      ['Run pad', 'Dash between the crate and the chalk line'],
    ],
  },
  keys: [
    ['Space / click', 'Bat: time it as the ball reaches you'],
    ['Up / W (hold)', 'Loft the shot'],
    ['Down / S (hold)', 'Keep it on the ground'],
    ['Left, Right / A, D', 'Placement bias: behind, or to the front'],
    ['R', 'Run between the crate and the chalk line'],
  ],
  mouse: { cursor: 'pointer', keys: [['Click', 'Bat']] },
  touch: { stick: true, pads: [{ label: 'Run', key: 'KeyR', keep: true }, { label: 'Bat', key: 'Space', big: true, hot: true }, { label: 'Loft', key: 'ArrowUp' }, { label: 'Ground', key: 'ArrowDown' }] },
  touchKeys: [['Bat', 'Time it as the ball arrives'], ['Loft / Ground pads', 'Height of the shot'], ['Run', 'Between the crate and the chalk']],
  gameKeys: ['KeyR'],
  formatScore: (v) => String(v),
  resize(a) {
    arc = a; arcRef = a; computeView(); V.sig = a.w + 'x' + a.h;
    if (R) { try { sizeRenderer(); } catch (e) { /* context may be lost */ } }
  },
  init(a) {
    arc = a; arcRef = a; computeView();
    try {
      const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      W3.q = coarse ? 1 : 0;
      W3.softHint = isSoftwareGL(); if (W3.softHint) W3.q = 4;
      const qp = /[?&]q=(\d)/.exec(location.search); if (qp) W3.q = +qp[1];
      W3.prof = /[?&]prof=1/.test(location.search); W3.norender = /[?&]norender=1/.test(location.search); W3.fixq = /[?&]fixq=1/.test(location.search); W3.nohud = /[?&]nohud=1/.test(location.search);
      buildWorld(a);
    } catch (e) {
      W3.failed = true;
      try { console.warn('gully-champs: WebGL unavailable', e && e.message); } catch (e2) { /* ignore */ }
    }
    resetScene();
    a.debug = dbg;
    window.__gully = { G, BALL, BAT, SW, FIELDERS, AUNTY, DOG, AUTO, CRATE, WIN, TEST, CAM, W3, startAuto, startAuntyScold: () => { AUNTY.state = 'scold'; AUNTY.t = 0; }, scareBirds, camera: () => camera, scene: () => scene, R: () => R, THREE };
    G.autoTimer = rr(22, 34); G.dogTimer = rr(6, 12); G.auntyTimer = rr(4, 9);
    CAM.snap = true;
    menuShow(a);
  },
  onMenu(a) {
    G.phase = 'attract'; G.runs = 0; G.outs = 0; G.balls = 0; G.target = 0; G.mode = a.choices.mode || 'last';
    resetScene();
  },
  start(a, ch) {
    arc = a;
    G.mode = ch.mode || 'last'; G.diff = ch.diff || 'serious'; G.D = DIFF[G.diff];
    G.matchIx = 0; G.results = []; G.totalScore = 0; G.flags.autoCount = 0;
    resetScene();
    AUTO.state = 'none'; AUTO.door = 0; DOG.active = false; DOG.carry = false; AUNTY.state = 'hidden'; AUNTY.up = 0;
    G.autoTimer = rr(24, 36); G.dogTimer = rr(8, 16); G.auntyTimer = rr(5, 10);
    G.yield = 0;
    newMatch();
  },
  update,
  idle,
  render,
  pauseHtml() { return '<div class="eyebrow" style="margin:2px 0 8px">House rules</div>' + rulesHtml(); },
});
