import * as THREE from '/games/vendor/three/three.module.min.js';

/*
 * Paint Ops, a first-person tactical paintball shooter.
 *
 * Two squads of five carry toy paint markers through an abandoned textile mill
 * at dusk, across monsoon rooftops in the rain and inside a desert fort at
 * sunset. A paint splat drains your shield; a full splat tags you out, you put
 * your marker up, walk off and respawn. Nobody is hurt, the paint washes off.
 *
 * The rules run on a flat grid: every map is 24 by 24 cells of 2 metres, each
 * cell floor, wall, low cover (climbable), tall cover or a railed gap. Paint
 * balls are real projectiles with drop, characters are capsules, and the 3D
 * world is dressed around that grid.
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
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
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + pad2(s % 60); };

/* ------------------------------------------------------------ the field */
const CS = 2;            // metres per grid cell
const GN = 24;           // cells per side
const HALFW = GN * CS / 2;
const EYE = 1.62, EYE_C = 1.08;
const BODY_H = 1.78, BODY_HC = 1.24, RAD = 0.36;
const CRATE_H = 1.1, TALL_H = 1.75;

const HALF_MAPS = {
  mill: [
    '########################',
    '#.B..B..#......#..B..B.#',
    '#.......#..cc..#.......#',
    '#...cc..b......b..cc...#',
    '#..........G...........#',
    '#.bbbb...cc..cc...bbbb.#',
    '#.........o..o.........#',
    '###..c.###....###.c..###',
    '#....c.....bb.....c....#',
    '#..bbb..o......o..bbb..#',
    '#........cc..cc........#',
    '#..c.......bb.......c..#'
  ],
  roof: [
    'xxxxxxxxxxxxxxxxxxxxxxxx',
    'x.B..B.xx..B..B.xx.B..Bx',
    'x......xx.......xx.....x',
    'x..c...xx..o.o..xx..c..x',
    'x.bb...xx...G...xx..bb.x',
    'x..........cc..........x',
    'x..o...xx.......xx..o..x',
    'x......xxbb...bbxx.....x',
    'x.cc...xx.......xx..cc.x',
    'x......xx..c.c..xx.....x',
    'x..##.........c....##..x',
    'x..##..xx..o.o..xx.##..x'
  ],
  fort: [
    '########################',
    '#..B..B#........#B..B..#',
    '#......#..o..o..#......#',
    '#..cc......G.......cc..#',
    '#......b........b......#',
    '##.##.....cccc.....##.##',
    '#..........oo..........#',
    '#..b..c..........c..b..#',
    '#....###...cc...###....#',
    '#..c..#..........#..c..#',
    '#.....#..b....b..#.....#',
    '#..o.......cc.......o..#'
  ]
};

const MAPS = {
  mill: {
    id: 'mill', name: 'Old Loom Mill', when: 'Dusk', wallH: 4.6,
    blurb: 'An abandoned textile mill at dusk. Rows of silent looms, cotton bales and low orange light through the arched windows.',
    landmarks: [['north looms', 0, -12], ['south looms', 0, 12], ['the dye vats', 0, 0], ['west bales', -14, 0], ['east bales', 14, 0], ['the north office', 0, -20], ['the south office', 0, 20], ['the west hall', -16, -14], ['the east hall', 16, -14], ['the west yard', -16, 14], ['the east yard', 16, 14]],
    look: {
      skyTop: '#2a2b55', skyMid: '#8b4f6e', skyHor: '#ff9450', sun: '#ffa260', sunI: 3.1, sunEl: 0.13, sunAz: -1.25,
      fog: '#6b4a4a', fogD: 0.014, hemiSky: '#c4b0d8', hemiGnd: '#6a4a36', hemiI: 1.7, exposure: 1.2, cloud: 0.55,
      grade: [1.05, 0.99, 0.92], lift: [0.014, 0.01, 0.02], sat: 0.98, env: 0.6, rain: 0, dust: 1, bloom: 0.8
    }
  },
  roof: {
    id: 'roof', name: 'Monsoon Rooftops', when: 'Monsoon rain', wallH: 3.2,
    blurb: 'Three city rooftops linked by plank bridges in heavy monsoon rain. Water tanks, neon signs and slick concrete.',
    landmarks: [['the north tanks', 0, -16], ['the south tanks', 0, 16], ['the center roof', 0, 0], ['the west roof', -16, 0], ['the east roof', 16, 0], ['the west stairs', -15, -4], ['the east stairs', 15, -4], ['the north bridge', -6, -14], ['the south bridge', 6, 14]],
    look: {
      skyTop: '#1d2633', skyMid: '#3f4c5c', skyHor: '#6d7a86', sun: '#b9c7dc', sunI: 1.1, sunEl: 0.55, sunAz: 0.6,
      fog: '#4a5663', fogD: 0.02, hemiSky: '#a9bbd0', hemiGnd: '#3a4046', hemiI: 1.6, exposure: 1.2, cloud: 0.95,
      grade: [0.94, 1.0, 1.08], lift: [0.0, 0.01, 0.025], sat: 0.92, env: 0.9, rain: 1, dust: 0, bloom: 1.25
    }
  },
  fort: {
    id: 'fort', name: 'Sunset Bastion', when: 'Desert sunset', wallH: 5.2,
    blurb: 'A sandstone desert fort at sunset. Arched galleries, a pillared courtyard, banners and long golden shadows.',
    landmarks: [['the north gate', 0, -18], ['the south gate', 0, 18], ['the pavilion', 0, 0], ['the west gallery', -14, -8], ['the east gallery', 14, -8], ['the west court', -14, 8], ['the east court', 14, 8], ['the north towers', 0, -12], ['the south towers', 0, 12]],
    look: {
      skyTop: '#3b4f8c', skyMid: '#d98a6a', skyHor: '#ffc06a', sun: '#ffb468', sunI: 3.6, sunEl: 0.1, sunAz: 1.9,
      fog: '#c99b7a', fogD: 0.009, hemiSky: '#d9c6b0', hemiGnd: '#b07a4a', hemiI: 1.35, exposure: 1.08, cloud: 0.3,
      grade: [1.06, 1.0, 0.9], lift: [0.016, 0.01, 0.006], sat: 0.99, env: 0.7, rain: 0, dust: 1, bloom: 0.78
    }
  }
};
const MAP_ORDER = ['mill', 'roof', 'fort'];

// Cell kinds: '.' floor, '#' wall, 'c' low cover you can climb, 'b' tall cover,
// 'o' pillar / tank, 'x' railed gap (blocks feet, not paint above the rail).
function buildGrid(id) {
  const top = HALF_MAPS[id];
  const rows = top.concat(top.slice().reverse().map((r) => r.replace(/B/g, 'A').replace(/G/g, 'F')));
  const n = GN * GN;
  const kind = new Array(n), h = new Float32Array(n), block = new Uint8Array(n);
  const spawns = [[], []], flags = [null, null];
  for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
    let c = (rows[z] || '')[x] || '#';
    const i = z * GN + x;
    if (c === 'A') { spawns[0].push([x, z]); c = '.'; }
    if (c === 'B') { spawns[1].push([x, z]); c = '.'; }
    if (c === 'F') { flags[0] = [x, z]; c = '.'; }
    if (c === 'G') { flags[1] = [x, z]; c = '.'; }
    kind[i] = c;
    if (c === '#') { h[i] = 99; block[i] = 1; }
    else if (c === 'b') { h[i] = TALL_H; block[i] = 1; }
    else if (c === 'o') { h[i] = 99; block[i] = 1; }
    else if (c === 'c') { h[i] = CRATE_H; block[i] = 0; }
    else if (c === 'x') { h[i] = 1.02; block[i] = 2; }
    else { h[i] = 0; block[i] = 0; }
  }
  const G = { id, rows, kind, h, block, spawns, flags };
  // bridge cells: floor inside a gap column (the rooftops)
  G.bridge = new Uint8Array(n);
  if (id === 'roof') for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
    const i = z * GN + x;
    if (kind[i] !== '.' && kind[i] !== 'c') continue;
    if ((x === 7 || x === 8 || x === 15 || x === 16)) G.bridge[i] = 1;
  }
  return G;
}
const cellX = (i) => (i - GN / 2 + 0.5) * CS;
const toCell = (v) => Math.floor(v / CS + GN / 2);

/* ------------------------------------------------------------ teams, people, markers */
const TEAMS = [
  { id: 0, name: 'Marigold Squad', short: 'MARIGOLD', paint: '#ff7a1a', vest: '#e86a1f', trim: '#3a2416', ui: '#ffae4a', pants: '#3b3a36' },
  { id: 1, name: 'Indigo Rush', short: 'INDIGO', paint: '#3f6dff', vest: '#3446c8', trim: '#151a3a', ui: '#8aa6ff', pants: '#2b2f3c' }
];
const SQUAD = ['Meera', 'Kabir', 'Zoya', 'Dev'];
const RIVALS = ['Rohan', 'Naina', 'Ishaan', 'Anaya', 'Vikram', 'Tara', 'Neel', 'Ira', 'Samar', 'Pia'];
const SKIN = ['#c98d67', '#8d5a3d', '#e0ac85', '#a86e4c', '#6e4630', '#d79a74'];

const GUNS = [
  { id: 'rapid', name: 'Hummingbird', kind: 'Rapid', mode: 'auto', rate: 11, dmg: 17, spread: 1.7, ads: 0.75, speed: 72, drop: 4.5, mag: 40, reload: 1.6, kick: 0.55, zoom: 1.3, range: 32, body: '#2bb3a3', acc: '#ffd23f', tank: '#e8eef2' },
  { id: 'burst', name: 'Tri-Splat', kind: 'Burst', mode: 'burst', rate: 2.8, burst: 3, gap: 0.07, dmg: 25, spread: 1.15, ads: 0.35, speed: 86, drop: 3.6, mag: 30, reload: 1.85, kick: 0.85, zoom: 1.55, range: 44, body: '#e8452c', acc: '#2d2f3a', tank: '#f5d547' },
  { id: 'long', name: 'Longshot', kind: 'Long-range', mode: 'single', rate: 1.05, dmg: 100, spread: 2.6, ads: 0.04, speed: 150, drop: 1.4, mag: 6, reload: 2.3, kick: 2.6, zoom: 3.4, range: 90, body: '#7b3fe4', acc: '#f2f2f2', tank: '#36d17a' }
];

const DIFF = {
  easy: { name: 'Easy', react: 0.8, aim: 5.2, track: 2.2, dmgIn: 0.7, lead: 0.35, flank: 0.15, cover: 0.45, burst: 0.55, regen: 1.4 },
  normal: { name: 'Normal', react: 0.45, aim: 2.6, track: 4.2, dmgIn: 0.9, lead: 0.7, flank: 0.35, cover: 0.7, burst: 0.8, regen: 1.0 },
  hard: { name: 'Hard', react: 0.26, aim: 1.4, track: 7, dmgIn: 1.0, lead: 0.95, flank: 0.55, cover: 0.9, burst: 1.0, regen: 0.85 }
};

/* ------------------------------------------------------------ campaign */
const MISSIONS = [
  {
    id: 'loom', name: 'Loom Light', map: 'mill', tickets: 14,
    brief: 'The Indigo Rush hold the old loom mill. Push up the weaving floor, clear the north looms and carry the golden spool home before the light goes.',
    intro: ['MISSION 1 : LOOM LIGHT', 'Old Loom Mill, dusk', 'Squad: Meera, Kabir, Zoya'],
    objs: [
      { t: 'goto', text: 'Push up to the dye vats', at: [11.5, 11.5], r: 3.2, call: 'Meera: Vats are ours. Eyes up, they are dug in on the looms.' },
      { t: 'tag', text: 'Clear the north looms', n: 6, call: 'Kabir: Floor is clear! The spool is on the north platform.' },
      { t: 'carry', text: 'Grab the golden spool', from: [11, 4], to: [11, 19], label: 'Spool', call: 'Zoya: Got eyes on the extraction. Bring it home!' }
    ],
    waves: { alive: [3, 4, 5], spawnEvery: 5 }
  },
  {
    id: 'monsoon', name: 'Monsoon Run', map: 'roof', tickets: 14,
    brief: 'Heavy rain over the old quarter. Cross the plank bridges, plant a paint beacon on the tank roof, hold it while the Indigo Rush counter, then get to the east stairs.',
    intro: ['MISSION 2 : MONSOON RUN', 'Monsoon Rooftops, heavy rain', 'Watch your footing on the planks'],
    objs: [
      { t: 'goto', text: 'Cross to the center roof', at: [11.5, 13.5], r: 3.2, call: 'Meera: Center roof, check. Beacon goes up by the tanks.' },
      { t: 'hold', text: 'Hold the beacon by the tanks', at: [12, 6], r: 3.4, time: 24, call: 'Kabir: Beacon is lit! Pull out, east stairs!' },
      { t: 'goto', text: 'Reach the east stairs', at: [20.5, 21], r: 2.6, call: 'Zoya: Everyone across. Great run in the rain.' }
    ],
    waves: { alive: [3, 4, 5], spawnEvery: 4.5 }
  },
  {
    id: 'bastion', name: 'Sunset Bastion', map: 'fort', tickets: 16,
    brief: 'The final round at the desert fort. Raise both banners on the galleries, then tag Captain Toofan in the courtyard before the sun sets.',
    intro: ['MISSION 3 : SUNSET BASTION', 'Desert fort, sunset', 'Finale against Captain Toofan'],
    objs: [
      { t: 'hold', text: 'Raise the west banner', at: [3, 9.5], r: 2.6, time: 8, call: 'Meera: West banner flying! East side next.' },
      { t: 'hold', text: 'Raise the east banner', at: [20.5, 9.5], r: 2.6, time: 8, call: 'Kabir: Both banners up. The captain is in the courtyard!' },
      { t: 'boss', text: 'Tag Captain Toofan', at: [11.5, 4], call: 'Zoya: Captain Toofan is splatted! The bastion is ours!' }
    ],
    waves: { alive: [3, 4, 5], spawnEvery: 5 }
  }
];

const CALLS = {
  spot: ['{n}: Rival at {p}!', '{n}: Contact, {p}!', '{n}: Got movement at {p}.', '{n}: One on {p}, watch it.'],
  reload: ['{n}: Reloading, cover me!', '{n}: Hopper dry, swapping in!', '{n}: Refilling!'],
  down: ['{n}: I am splatted, back in a few!', '{n}: Got me! Heading out.', '{n}: Tagged, respawning.'],
  nice: ['{n}: Nice splat!', '{n}: Clean shot!', '{n}: That is how it is done!', '{n}: Great tag!'],
  got: ['{n}: Got one!', '{n}: Splat! One down.', '{n}: Tagged! Moving up.', '{n}: Yes! Scratch one.'],
  rivalOut: ['{n}: Argh, good shot!', '{n}: Okay, okay, you got me.', '{n}: Not again!', '{n}: Lucky one!'],
  close: ['{n}: Whoa, close one!', '{n}: That nearly had me.'],
  follow: ['{n}: On you, lead the way.', '{n}: Right behind you.', '{n}: Moving with you.'],
  flagTaken: ['{n}: They have our flag! Stop the carrier!'],
  flagGot: ['{n}: You have the flag, run it home!', '{n}: Flag is ours, escort the carrier!'],
  streak: ['{n}: Radar is up!', '{n}: Drone in the air, nice!']
};

/* ------------------------------------------------------------ procedural textures */
let ANISO = 4;
const ALL_TEX = [];
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });
function toTex(cv, o) {
  o = o || {};
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (o.rep) t.repeat.set(o.rep[0], o.rep[1]);
  ALL_TEX.push(t);
  return t;
}
// Value noise in a typed array, tileable, a few octaves.
const noiseCache = {};
function noiseField(size, cells, oct, seed) {
  const key = size + ':' + cells + ':' + oct + ':' + seed;
  if (noiseCache[key]) return noiseCache[key];
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0, c = cells;
  for (let o = 0; o < oct; o++) {
    const g = new Float32Array(c * c); const r = rng(seed * 31 + o * 977 + 7);
    for (let i = 0; i < c * c; i++) g[i] = r();
    for (let y = 0; y < size; y++) {
      const fy = y / size * c, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % c;
      for (let x = 0; x < size; x++) {
        const fx = x / size * c, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % c;
        const a = g[y0 * c + x0], b = g[y0 * c + x1], d = g[y1 * c + x0], e = g[y1 * c + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) + ((d + (e - d) * sx) - (a + (b - a) * sx)) * sy);
      }
    }
    tot += amp; amp *= 0.5; c *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  noiseCache[key] = out;
  return out;
}
// Multiply a canvas by noise (grime), centred on 1.
function grain(g, size, cells, oct, seed, amt, tint) {
  const img = g.getImageData(0, 0, size, size), d = img.data, n = noiseField(size, cells, oct, seed);
  for (let i = 0, p = 0; i < n.length; i++, p += 4) {
    const k = 1 + (n[i] - 0.5) * amt;
    d[p] = clamp(d[p] * k * (tint ? tint[0] : 1), 0, 255); d[p + 1] = clamp(d[p + 1] * k * (tint ? tint[1] : 1), 0, 255); d[p + 2] = clamp(d[p + 2] * k * (tint ? tint[2] : 1), 0, 255);
  }
  g.putImageData(img, 0, 0);
}
// Height canvas (grey) to a tangent-space normal map.
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, src = ctx2d(hc).getImageData(0, 0, w, h).data;
  const out = mkCanvas(w, h), og = out.getContext('2d'), img = og.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), p = (y * w + x) * 4;
    d[p] = (-dx / l * 0.5 + 0.5) * 255; d[p + 1] = (dy / l * 0.5 + 0.5) * 255; d[p + 2] = (1 / l * 0.5 + 0.5) * 255; d[p + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return toTex(out, { linear: true });
}
function rough(hc, base, span, invert) {
  const w = hc.width, src = ctx2d(hc).getImageData(0, 0, w, w).data;
  const out = mkCanvas(w, w), og = out.getContext('2d'), img = og.createImageData(w, w), d = img.data;
  for (let i = 0; i < d.length; i += 4) { let v = src[i] / 255; if (invert) v = 1 - v; const r = clamp(base + (v - 0.5) * span, 0.04, 1) * 255; d[i] = d[i + 1] = d[i + 2] = r; d[i + 3] = 255; }
  og.putImageData(img, 0, 0);
  return toTex(out, { linear: true });
}
function hex(c) { const v = new THREE.Color(c); return [v.r * 255, v.g * 255, v.b * 255]; }
function rgbS(r, g, b, a) { return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (a == null ? 1 : a) + ')'; }

// Each surface: { map, normalMap, roughnessMap } built once and cached.
const SURF = {};
function surface(id) {
  if (SURF[id]) return SURF[id];
  const S = 512, R = rng(hash(id.length * 131 + id.charCodeAt(0)) * 1e9 | 0);
  const c = mkCanvas(S, S), g = ctx2d(c), hc = mkCanvas(S, S), hg = ctx2d(hc);
  let ns = 3, rb = 0.85, rs = 0.3, rinv = false;
  if (id === 'brick') {
    g.fillStyle = '#8f8576'; g.fillRect(0, 0, S, S); hg.fillStyle = '#222'; hg.fillRect(0, 0, S, S);
    const rows = 16, bw = S / 4, bh = S / rows;
    for (let r = 0; r < rows; r++) for (let k = -1; k < 5; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh, t = R();
      const base = t < 0.15 ? [96, 52, 40] : t < 0.5 ? [138, 66, 46] : t < 0.85 ? [156, 82, 56] : [118, 72, 58];
      const j = 0.85 + R() * 0.3;
      g.fillStyle = rgbS(base[0] * j, base[1] * j, base[2] * j); g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      hg.fillStyle = rgbS(170 + R() * 60, 0, 0); hg.fillRect(x + 4, y + 4, bw - 8, bh - 8);
      if (R() < 0.12) { g.fillStyle = 'rgba(30,22,18,.35)'; g.fillRect(x + 3, y + 3, bw - 6, bh - 6); }
    }
    hg.filter = 'blur(1.5px)'; hg.drawImage(hc, 0, 0); hg.filter = 'none';
    grain(g, S, 16, 4, 11, 0.55);
    const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, 'rgba(20,14,12,0.35)'); gr.addColorStop(0.3, 'rgba(20,14,12,0)'); gr.addColorStop(0.75, 'rgba(20,14,12,0)'); gr.addColorStop(1, 'rgba(20,14,12,0.5)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) { const x = R() * S; g.fillStyle = 'rgba(25,20,18,' + (0.05 + R() * 0.12) + ')'; g.fillRect(x, R() * S * 0.3, 2 + R() * 6, S * (0.3 + R() * 0.6)); }
    ns = 5; rb = 0.88; rs = 0.24; rinv = true;
  } else if (id === 'millfloor' || id === 'rooffloor' || id === 'fortfloor') {
    const pal = id === 'millfloor' ? ['#6d6458', '#5d554b', '#77695a'] : id === 'rooffloor' ? ['#55595b', '#4a4e51', '#5f6366'] : ['#c49a6c', '#b48a5e', '#cfa676'];
    g.fillStyle = pal[0]; g.fillRect(0, 0, S, S); hg.fillStyle = '#bbb'; hg.fillRect(0, 0, S, S);
    const tiles = id === 'fortfloor' ? 4 : id === 'rooffloor' ? 4 : 2;
    const tw = S / tiles;
    for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) {
      const off = id === 'fortfloor' && y % 2 ? tw / 2 : 0;
      g.fillStyle = pal[(R() * 3) | 0]; g.globalAlpha = 0.6; g.fillRect(x * tw + off + 2, y * tw + 2, tw - 4, tw - 4); g.globalAlpha = 1;
      hg.fillStyle = '#111'; hg.fillRect(x * tw + off - 2, y * tw - 2, tw, 4); hg.fillRect(x * tw + off - 2, y * tw - 2, 4, tw);
      g.fillStyle = id === 'fortfloor' ? 'rgba(232,196,140,.55)' : 'rgba(25,22,20,.45)'; g.fillRect(x * tw + off - 2, y * tw - 2, tw, 3); g.fillRect(x * tw + off - 2, y * tw - 2, 3, tw);
    }
    grain(g, S, 8, 5, id.length * 7, id === 'fortfloor' ? 0.4 : 0.7);
    // stains, puddles, sand drifts
    for (let i = 0; i < 18; i++) {
      const x = R() * S, y = R() * S, r = 20 + R() * 70, rg = g.createRadialGradient(x, y, 0, x, y, r);
      const col = id === 'millfloor' ? '30,24,20' : id === 'rooffloor' ? '20,26,32' : '240,205,150';
      rg.addColorStop(0, 'rgba(' + col + ',' + (0.2 + R() * 0.25) + ')'); rg.addColorStop(1, 'rgba(' + col + ',0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
      if (id === 'rooffloor') { const hr = hg.createRadialGradient(x, y, 0, x, y, r); hr.addColorStop(0, 'rgba(255,255,255,.9)'); hr.addColorStop(1, 'rgba(255,255,255,0)'); hg.fillStyle = hr; hg.fillRect(x - r, y - r, 2 * r, 2 * r); }
    }
    if (id === 'millfloor') { for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(20,16,12,.18)'; g.lineWidth = 1; g.beginPath(); const x = R() * S, y = R() * S; g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 90, y + (R() - 0.5) * 90); g.stroke(); } }
    hg.filter = 'blur(2px)'; hg.drawImage(hc, 0, 0); hg.filter = 'none';
    ns = id === 'fortfloor' ? 3 : 2.5; rb = id === 'rooffloor' ? 0.42 : id === 'millfloor' ? 0.82 : 0.9; rs = id === 'rooffloor' ? 0.9 : 0.3; rinv = id === 'rooffloor';
  } else if (id === 'plaster') {
    g.fillStyle = '#9fb7b0'; g.fillRect(0, 0, S, S); hg.fillStyle = '#999'; hg.fillRect(0, 0, S, S);
    grain(g, S, 6, 5, 21, 0.45);
    for (let i = 0; i < 9; i++) { const x = R() * S, y = R() * S, w = 40 + R() * 120, h = 30 + R() * 80; g.fillStyle = 'rgba(140,90,70,.55)'; g.fillRect(x, y, w, h); hg.fillStyle = '#555'; hg.fillRect(x, y, w, h); }
    for (let i = 0; i < 70; i++) { const x = R() * S; g.fillStyle = 'rgba(40,52,52,' + (0.04 + R() * 0.12) + ')'; g.fillRect(x, R() * S * 0.4, 1 + R() * 4, S * (0.2 + R() * 0.7)); }
    const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, 'rgba(20,30,30,0.0)'); gr.addColorStop(1, 'rgba(20,30,30,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    hg.filter = 'blur(3px)'; hg.drawImage(hc, 0, 0); hg.filter = 'none';
    ns = 2; rb = 0.8; rs = 0.3;
  } else if (id === 'sandstone') {
    g.fillStyle = '#c98f5a'; g.fillRect(0, 0, S, S); hg.fillStyle = '#222'; hg.fillRect(0, 0, S, S);
    const rows = 4, bh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -S / 4 : 0;
      while (x < S) {
        const w = S / 2 * (0.7 + R() * 0.6), t = 0.85 + R() * 0.3;
        g.fillStyle = rgbS(206 * t, 146 * t, 92 * t); g.fillRect(x + 3, r * bh + 3, w - 6, bh - 6);
        hg.fillStyle = rgbS(190 + R() * 50, 0, 0); hg.fillRect(x + 4, r * bh + 4, w - 8, bh - 8);
        x += w;
      }
    }
    hg.filter = 'blur(2px)'; hg.drawImage(hc, 0, 0); hg.filter = 'none';
    grain(g, S, 24, 5, 41, 0.42);
    for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(90,50,25,' + R() * 0.2 + ')'; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
    const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, 'rgba(255,220,170,0.12)'); gr.addColorStop(1, 'rgba(90,50,30,0.3)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    ns = 4; rb = 0.9; rs = 0.18; rinv = true;
  } else if (id === 'bale') {
    g.fillStyle = '#e9e2d3'; g.fillRect(0, 0, S, S); hg.fillStyle = '#888'; hg.fillRect(0, 0, S, S);
    grain(g, S, 32, 5, 5, 0.35);
    for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(255,255,255,' + R() * 0.35 + ')'; g.fillRect(R() * S, R() * S, 1, 2 + R() * 4); }
    for (const yy of [0.22, 0.5, 0.78]) { g.fillStyle = '#6b5136'; g.fillRect(0, yy * S - 7, S, 14); hg.fillStyle = '#eee'; hg.fillRect(0, yy * S - 7, S, 14); }
    hg.filter = 'blur(2px)'; hg.drawImage(hc, 0, 0); hg.filter = 'none';
    ns = 3; rb = 0.95; rs = 0.1;
  } else if (id === 'wood') {
    g.fillStyle = '#9a6d42'; g.fillRect(0, 0, S, S); hg.fillStyle = '#999'; hg.fillRect(0, 0, S, S);
    const pl = 6, ph = S / pl;
    for (let i = 0; i < pl; i++) {
      const t = 0.8 + R() * 0.35; g.fillStyle = rgbS(150 * t, 104 * t, 62 * t); g.fillRect(0, i * ph + 2, S, ph - 4);
      for (let k = 0; k < 30; k++) { g.strokeStyle = 'rgba(60,36,18,' + R() * 0.25 + ')'; g.lineWidth = 1; g.beginPath(); const yy = i * ph + R() * ph; g.moveTo(0, yy); g.bezierCurveTo(S * 0.3, yy + (R() - 0.5) * 8, S * 0.6, yy + (R() - 0.5) * 8, S, yy); g.stroke(); }
      hg.fillStyle = '#222'; hg.fillRect(0, i * ph - 2, S, 4);
    }
    g.strokeStyle = '#5c3b1e'; g.lineWidth = 14; g.strokeRect(7, 7, S - 14, S - 14); g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.stroke();
    hg.strokeStyle = '#eee'; hg.lineWidth = 14; hg.strokeRect(7, 7, S - 14, S - 14); hg.beginPath(); hg.moveTo(0, 0); hg.lineTo(S, S); hg.stroke();
    grain(g, S, 16, 4, 9, 0.35);
    ns = 3; rb = 0.78; rs = 0.2;
  } else if (id === 'metal') {
    g.fillStyle = '#5c6b62'; g.fillRect(0, 0, S, S); hg.fillStyle = '#888'; hg.fillRect(0, 0, S, S);
    grain(g, S, 8, 5, 17, 0.4);
    for (let i = 0; i < 40; i++) { const x = R() * S, y = R() * S, r = 6 + R() * 40, rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(120,62,28,.6)'); rg.addColorStop(1, 'rgba(120,62,28,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r); hg.fillStyle = 'rgba(255,255,255,.3)'; hg.fillRect(x - r / 2, y - r / 2, r, r); }
    for (let i = 0; i < 8; i++) { const y = R() * S; hg.fillStyle = '#333'; hg.fillRect(0, y, S, 3); g.fillStyle = 'rgba(30,34,30,.4)'; g.fillRect(0, y, S, 3); }
    ns = 2; rb = 0.5; rs = 0.5; rinv = false;
  } else {
    g.fillStyle = '#888'; g.fillRect(0, 0, S, S); hg.fillStyle = '#888'; hg.fillRect(0, 0, S, S);
  }
  const s = { map: toTex(c), normalMap: normalFromHeight(hc, ns), roughnessMap: rough(hc, rb, rs, rinv) };
  SURF[id] = s;
  return s;
}

// Small one-off textures.
const TX = {};
function splatTex() {
  if (TX.splat) return TX.splat;
  const S = 256, c = mkCanvas(S, S), g = ctx2d(c), R = rng(99);
  g.fillStyle = '#fff';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  blob(S / 2, S / 2, S * 0.2);
  for (let i = 0; i < 16; i++) { const a = R() * TAU, d = S * (0.12 + R() * 0.12); blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.05 + R() * 0.07)); }
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU, d0 = S * 0.18, d1 = S * (0.3 + R() * 0.17);
    g.lineWidth = 3 + R() * 6; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * d0, S / 2 + Math.sin(a) * d0); g.lineTo(S / 2 + Math.cos(a) * d1, S / 2 + Math.sin(a) * d1); g.stroke();
    blob(S / 2 + Math.cos(a) * d1, S / 2 + Math.sin(a) * d1, 3 + R() * 6);
  }
  for (let i = 0; i < 26; i++) { const a = R() * TAU, d = S * (0.3 + R() * 0.18); blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1.5 + R() * 4); }
  // a soft sheen in the alpha so the edge reads wet
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a; }
  g.putImageData(img, 0, 0);
  TX.splat = toTex(c, { clamp: true });
  return TX.splat;
}
function dotTex() {
  if (TX.dot) return TX.dot;
  const S = 64, c = mkCanvas(S, S), g = c.getContext('2d'), rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,255,255,.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  TX.dot = toTex(c, { clamp: true, linear: true });
  return TX.dot;
}
function glowTex(col) {
  const k = 'glow' + col; if (TX[k]) return TX[k];
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d'), rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, col); rg.addColorStop(0.25, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  TX[k] = toTex(c, { clamp: true });
  return TX[k];
}
function shaftTex() {
  if (TX.shaft) return TX.shaft;
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, S, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const v = g.createLinearGradient(0, 0, 0, S); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.15, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, S, S);
  TX.shaft = toTex(c, { clamp: true });
  return TX.shaft;
}
function windowsTex(seed, lit) {
  const k = 'win' + seed; if (TX[k]) return TX[k];
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = '#0d0f12'; g.fillRect(0, 0, S, S);
  const cols = 8, rows = 16;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const on = R() < lit, t = R();
    g.fillStyle = on ? (t < 0.6 ? 'rgb(255,196,120)' : t < 0.85 ? 'rgb(255,236,190)' : 'rgb(140,200,255)') : 'rgb(28,32,38)';
    g.fillRect(x * S / cols + 6, y * S / rows + 4, S / cols - 12, S / rows - 7);
  }
  TX[k] = toTex(c);
  return TX[k];
}
function signTex(text, col, bg) {
  const k = 'sign' + text; if (TX[k]) return TX[k];
  const c = mkCanvas(512, 128), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.font = '700 78px "Inter", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = col; g.shadowBlur = 24; g.fillStyle = col; g.fillText(text, 256, 68);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(text, 256, 68);
  TX[k] = toTex(c, { clamp: true });
  return TX[k];
}
function clothTex(a, b) {
  const k = 'cloth' + a + b; if (TX[k]) return TX[k];
  const c = mkCanvas(128, 256), g = ctx2d(c);
  g.fillStyle = a; g.fillRect(0, 0, 128, 256); g.fillStyle = b;
  g.fillRect(0, 30, 128, 18); g.fillRect(0, 200, 128, 18);
  g.beginPath(); g.moveTo(64, 80); g.lineTo(96, 125); g.lineTo(64, 170); g.lineTo(32, 125); g.closePath(); g.fill();
  g.fillStyle = a; g.beginPath(); g.arc(64, 125, 14, 0, TAU); g.fill();
  grain(g, 128, 8, 3, 3, 0.25);
  TX[k] = toTex(c, { clamp: true });
  return TX[k];
}

/* ------------------------------------------------------------ shaders */
const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 uTop, uMid, uHor, uSun, uFog; uniform vec3 uSunDir; uniform float uCloud, uTime, uFlash, uStorm, uDetail;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.22, y));
  col = mix(col, uTop, smoothstep(0.18, 0.75, y));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(sd, 6.0) * 0.45 + pow(sd, 64.0) * 0.9) * (1.0 - uStorm * 0.7);
  col += uSun * smoothstep(0.9993, 0.9997, sd) * 18.0 * (1.0 - uStorm);
  if (y > -0.02 && uDetail > 0.5) {
    vec2 uv = d.xz / (y + 0.18) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
    float c = fbm(uv * 0.9); float c2 = fbm(uv * 2.1 + 7.0);
    float cov = smoothstep(1.0 - uCloud * 0.85, 1.05, c * 0.75 + c2 * 0.45);
    vec3 cc = mix(uMid * 0.55 + uHor * 0.25, uSun * 1.1, pow(sd, 3.0) * (1.0 - uStorm));
    cc = mix(cc, vec3(0.16,0.18,0.22), uStorm * 0.6);
    col = mix(col, cc, cov * smoothstep(-0.02, 0.12, y) * 0.92);
  }
  col = mix(col, uFog, smoothstep(0.08, -0.06, y));
  col += vec3(0.75,0.82,1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
}`;
const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT_FS = `uniform sampler2D tSrc; uniform float uThr; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = max(max(c.r,c.g),c.b); float k = smoothstep(uThr, uThr + 1.2, l); gl_FragColor = vec4(c * k, 1.0); }`;
const BLUR_FS = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ vec3 s = texture2D(tSrc, vUv).rgb * 0.227027;
  s += texture2D(tSrc, vUv + uDir * 1.3846).rgb * 0.316216; s += texture2D(tSrc, vUv - uDir * 1.3846).rgb * 0.316216;
  s += texture2D(tSrc, vUv + uDir * 3.2308).rgb * 0.070270; s += texture2D(tSrc, vUv - uDir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(s, 1.0); }`;
const COMP_FS = `uniform sampler2D tScene, tBloomA, tBloomB; uniform float uBloom, uExp, uTime, uVig, uGrain, uSat, uHurt, uDesat, uAber;
uniform vec3 uHurtCol, uGain, uLift; varying vec2 vUv;
vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime * 7.31) * 43758.5453); }
vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 cuv = vUv - 0.5; float r2 = dot(cuv, cuv);
  vec3 c;
  if (uAber > 0.0) { vec2 o = cuv * uAber * 0.02; c = vec3(texture2D(tScene, vUv + o).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - o).b); }
  else c = texture2D(tScene, vUv).rgb;
  c += (texture2D(tBloomA, vUv).rgb * 0.7 + texture2D(tBloomB, vUv).rgb * 0.9) * uBloom;
  c = aces(c * uExp);
  c = c * uGain + uLift * (1.0 - c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat * (1.0 - uDesat));
  // split toning, as film and a real sky do it: shadows lean cool, highlights warm
  float lw = smoothstep(0.04, 0.8, l);
  c += mix(vec3(-0.012, -0.002, 0.016), vec3(0.016, 0.006, -0.014), lw) * (0.4 + 0.6 * (1.0 - abs(lw * 2.0 - 1.0)));
  c *= 1.0 - smoothstep(0.18, 0.75, r2) * uVig;
  c = mix(c, uHurtCol, smoothstep(0.08, 0.42, r2) * uHurt);
  c = clamp(c, 0.0, 1.0);
  c = srgb(c);
  c += (hh(vUv * 913.0) - 0.5) * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;
const PTS_VS = `attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uScale; varying vec3 vCol; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.1, -mv.z); vCol = aCol; vA = aAlpha; }`;
const PTS_FS = `uniform sampler2D tDot; varying vec3 vCol; varying float vA;
void main(){ float a = texture2D(tDot, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vCol, a); }`;

/* ------------------------------------------------------------ renderer and post */
let ARC = null, R3 = null, NO3D = false, FX = null, AU = null;
const TIERS = [
  { px: 0.55, budget: 260000, shadow: false, map: 512, post: false, fx: 0.45, aniso: 1, samples: 0, cheap: true, rain: 0.4, decor: false },
  { px: 0.75, budget: 640000, shadow: false, map: 1024, post: true, fx: 0.7, aniso: 2, samples: 0, cheap: false, rain: 0.65, decor: true },
  { px: 0.9, budget: 1.15e6, shadow: true, map: 1024, post: true, fx: 1, aniso: 4, samples: 2, cheap: false, rain: 1, decor: true },
  { px: 1, budget: 2.2e6, shadow: true, map: 2048, post: true, fx: 1, aniso: 8, samples: 4, cheap: false, rain: 1, decor: true }
];

function setup3D(arc) {
  // a software rasteriser gets no multisampling and a smaller canvas
  let soft = false;
  try {
    const tc = document.createElement('canvas'), tg = tc.getContext('webgl2') || tc.getContext('webgl');
    const ex = tg && tg.getExtension('WEBGL_debug_renderer_info');
    soft = !!ex && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(tg.getParameter(ex.UNMASKED_RENDERER_WEBGL)));
    const lc = tg && tg.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext();
  } catch (e) { soft = false; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: !soft, powerPreference: 'high-performance' }); } catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#6b4a4a', 0.015);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 900);
  camera.rotation.order = 'YXZ';
  const hemi = new THREE.HemisphereLight('#9a86b8', '#3a2a22', 0.8); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffa260', 3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 180;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.2, -1) }, uCloud: { value: 0.5 }, uTime: { value: 0 }, uFlash: { value: 0 }, uStorm: { value: 0 }, uDetail: { value: 1 } };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = 1; scene.add(sky);
  // the marker in your hands lives in its own little scene, drawn over the world
  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  const vmHemi = new THREE.HemisphereLight('#9a86b8', '#3a2a22', 1.0), vmSun = new THREE.DirectionalLight('#ffa260', 2.2);
  vmScene.add(vmHemi, vmSun, vmSun.target);
  const quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mk = (fs, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
  const matBright = mk(BRIGHT_FS, { tSrc: { value: null }, uThr: { value: 1.0 } });
  const matBlur = mk(BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const matComp = mk(COMP_FS, {
    tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, uBloom: { value: 0.9 }, uExp: { value: 1.1 }, uTime: { value: 0 }, uVig: { value: 0.35 },
    uGrain: { value: 0.035 }, uSat: { value: 1.05 }, uHurt: { value: 0 }, uDesat: { value: 0 }, uAber: { value: 0 }, uHurtCol: { value: new THREE.Color() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: new THREE.Vector3() }
  });
  const quad = new THREE.Mesh(quadGeo, matComp); quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pmrem = new THREE.PMREMGenerator(renderer);
  R3 = {
    renderer, scene, camera, hemi, sun, sky, skyMat, skyU, vmScene, vmCam, vmHemi, vmSun, quad, quadScene, orthoCam, matBright, matBlur, matComp, pmrem,
    rt: null, rtH: null, rtQa: null, rtQb: null, rtEa: null, rtEb: null, rtKey: '', envs: {},
    camPos: new THREE.Vector3(), camTgt: new THREE.Vector3(), camInit: false, quality: -1, lockQ: false, fps: 60, qT: 0, qN: 0, qWarm: 0, soft: false, lost: false, lastNow: 0, time: 0, mapRef: null, world: null
  };
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R3.gpu = name; R3.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R3.soft = false; }
  arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
  arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; R3.rtKey = ''; });
  FX = createFX(scene);
  return true;
}

function ensureTargets() {
  const r = R3, t = TIERS[Math.max(0, r.quality)];
  if (!t.post) return;
  const sz = new THREE.Vector2(); r.renderer.getDrawingBufferSize(sz);
  const w = Math.max(2, sz.x), h = Math.max(2, sz.y);
  const key = w + 'x' + h + ':' + t.samples;
  if (key === r.rtKey) return;
  r.rtKey = key;
  [r.rt, r.rtH, r.rtQa, r.rtQb, r.rtEa, r.rtEb].forEach((x) => { if (x) x.dispose(); });
  const o = { type: THREE.HalfFloatType, depthBuffer: false };
  r.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: t.samples, depthBuffer: true });
  r.rtH = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), o);
  r.rtQa = new THREE.WebGLRenderTarget(Math.max(2, w >> 2), Math.max(2, h >> 2), o);
  r.rtQb = new THREE.WebGLRenderTarget(Math.max(2, w >> 2), Math.max(2, h >> 2), o);
  r.rtEa = new THREE.WebGLRenderTarget(Math.max(2, w >> 3), Math.max(2, h >> 3), o);
  r.rtEb = new THREE.WebGLRenderTarget(Math.max(2, w >> 3), Math.max(2, h >> 3), o);
}
function pass(mat, target) { const r = R3; r.quad.material = mat; r.renderer.setRenderTarget(target); r.renderer.render(r.quadScene, r.orthoCam); }
function blur(src, tmp, dst) {
  const r = R3, u = r.matBlur.uniforms;
  u.tSrc.value = src.texture; u.uDir.value.set(1 / src.width, 0); pass(r.matBlur, tmp);
  u.tSrc.value = tmp.texture; u.uDir.value.set(0, 1 / tmp.height); pass(r.matBlur, dst);
}
// World, then the marker in your hands, then (from tier 1) the bloom chain and the grade.
function drawFrame(showVM, post) {
  const r = R3, t = TIERS[Math.max(0, r.quality)], rd = r.renderer;
  rd.info.reset();
  if (!t.post) {
    rd.setRenderTarget(null); rd.autoClear = true; rd.render(r.scene, r.camera);
    if (showVM) { rd.autoClear = false; rd.clearDepth(); rd.render(r.vmScene, r.vmCam); rd.autoClear = true; }
    return;
  }
  ensureTargets();
  rd.setRenderTarget(r.rt); rd.autoClear = true; rd.render(r.scene, r.camera);
  if (showVM) { rd.autoClear = false; rd.clearDepth(); rd.render(r.vmScene, r.vmCam); rd.autoClear = true; }
  r.matBright.uniforms.tSrc.value = r.rt.texture; r.matBright.uniforms.uThr.value = post.thr;
  pass(r.matBright, r.rtH);
  r.matBlur.uniforms.tSrc.value = r.rtH.texture; r.matBlur.uniforms.uDir.value.set(0.5 / r.rtH.width, 0); pass(r.matBlur, r.rtQb);
  r.matBlur.uniforms.tSrc.value = r.rtQb.texture; r.matBlur.uniforms.uDir.value.set(0, 1 / r.rtQb.height); pass(r.matBlur, r.rtQa);
  blur(r.rtQa, r.rtEb, r.rtEa);
  blur(r.rtEa, r.rtEb, r.rtEa);
  const u = r.matComp.uniforms;
  u.tScene.value = r.rt.texture; u.tBloomA.value = r.rtQa.texture; u.tBloomB.value = r.rtEa.texture;
  u.uBloom.value = post.bloom; u.uExp.value = post.exp; u.uTime.value = r.time; u.uVig.value = post.vig; u.uGrain.value = post.grain;
  u.uSat.value = post.sat; u.uHurt.value = post.hurt; u.uHurtCol.value.copy(post.hurtCol); u.uDesat.value = post.desat; u.uAber.value = post.aber;
  u.uGain.value.set(post.gain[0], post.gain[1], post.gain[2]); u.uLift.value.set(post.lift[0], post.lift[1], post.lift[2]);
  pass(r.matComp, null);
}

/* ------------------------------------------------------------ particles: one soft pool, one glowing pool */
function createFX(scene) {
  const mkPool = (n, additive) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDot: { value: dotTex() }, uScale: { value: 400 } }, vertexShader: PTS_VS, fragmentShader: PTS_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 5; scene.add(pts);
    const P = [];
    for (let i = 0; i < n; i++) P.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 0, s1: 0, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, floor: -99 });
    return { geo, mat, pts, P, n, pos, col, size, alpha, next: 0, live: 0 };
  };
  const soft = mkPool(1400, false), add = mkPool(700, true);
  const tmp = new THREE.Color();
  return {
    soft, add, density: 1,
    emit(kind, x, y, z, vx, vy, vz, life, size, color, alpha, grav, drag, grow, floor) {
      const pool = kind === 'add' ? add : soft;
      const p = pool.P[pool.next]; pool.next = (pool.next + 1) % pool.n;
      tmp.set(color);
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = 0; p.max = life; p.s0 = size; p.s1 = size * (grow == null ? 1 : grow);
      const boost = kind === 'add' ? 2.2 : 1;
      p.r = tmp.r * boost; p.g = tmp.g * boost; p.b = tmp.b * boost; p.a = alpha == null ? 1 : alpha; p.grav = grav || 0; p.drag = drag || 0; p.floor = floor == null ? -99 : floor;
    },
    update(dt, scale) {
      [soft, add].forEach((pool) => {
        pool.mat.uniforms.uScale.value = scale;
        let live = 0;
        for (let i = 0; i < pool.n; i++) {
          const p = pool.P[i], k3 = i * 3;
          if (p.on) {
            p.life += dt;
            if (p.life >= p.max) p.on = false;
            else {
              const dr = Math.exp(-p.drag * dt);
              p.vx *= dr; p.vy = p.vy * dr - p.grav * dt; p.vz *= dr;
              p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
              if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.15; p.vx *= 0.4; p.vz *= 0.4; }
            }
          }
          if (p.on) {
            const t = p.life / p.max, fade = t < 0.12 ? t / 0.12 : 1 - smooth01((t - 0.35) / 0.65);
            pool.pos[k3] = p.x; pool.pos[k3 + 1] = p.y; pool.pos[k3 + 2] = p.z;
            pool.col[k3] = p.r; pool.col[k3 + 1] = p.g; pool.col[k3 + 2] = p.b;
            pool.size[i] = lerp(p.s0, p.s1, t); pool.alpha[i] = p.a * fade; live++;
          } else if (pool.alpha[i] !== 0) { pool.alpha[i] = 0; pool.size[i] = 0; pool.pos[k3 + 1] = -999; }
        }
        pool.live = live;
        const a = pool.geo.attributes;
        a.position.needsUpdate = true; a.aCol.needsUpdate = true; a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true;
      });
    },
    clear() { [soft, add].forEach((pool) => pool.P.forEach((p) => { p.on = false; })); }
  };
}

/* ------------------------------------------------------------ geometry helpers */
function GB() { return { p: [], n: [], u: [], idx: [] }; }
function gbQuad(g, a, b, c, d, nx, ny, nz, ua, ub, uc, ud) {
  const base = g.p.length / 3;
  g.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  for (let k = 0; k < 4; k++) g.n.push(nx, ny, nz);
  g.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]);
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
// Axis-aligned box with world-projected UVs. mask: which faces (px, nx, py, ny, pz, nz).
function gbBox(g, x0, y0, z0, x1, y1, z1, mask, us, vs) {
  us = us || 2; vs = vs || us; mask = mask == null ? 63 : mask;
  if (mask & 1) gbQuad(g, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, [z1 / us, y0 / vs], [z0 / us, y0 / vs], [z0 / us, y1 / vs], [z1 / us, y1 / vs]);
  if (mask & 2) gbQuad(g, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, [z0 / us, y0 / vs], [z1 / us, y0 / vs], [z1 / us, y1 / vs], [z0 / us, y1 / vs]);
  if (mask & 4) gbQuad(g, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, [x0 / us, z1 / us], [x1 / us, z1 / us], [x1 / us, z0 / us], [x0 / us, z0 / us]);
  if (mask & 8) gbQuad(g, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, [x0 / us, z0 / us], [x1 / us, z0 / us], [x1 / us, z1 / us], [x0 / us, z1 / us]);
  if (mask & 16) gbQuad(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, [x0 / us, y0 / vs], [x1 / us, y0 / vs], [x1 / us, y1 / vs], [x0 / us, y1 / vs]);
  if (mask & 32) gbQuad(g, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, [x1 / us, y0 / vs], [x0 / us, y0 / vs], [x0 / us, y1 / vs], [x1 / us, y1 / vs]);
}
function gbGeo(g) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
  geo.setIndex(g.idx);
  geo.computeBoundingSphere();
  return geo;
}
// Merge several (geometry, matrix) pairs into one non-indexed geometry with vertex colours.
function mergeParts(parts) {
  const P = [], N = [], U = [], C = [];
  const m3 = new THREE.Matrix3(), v = new THREE.Vector3(), col = new THREE.Color();
  parts.forEach(([geo0, mat, color]) => {
    const geo = geo0.index ? geo0.toNonIndexed() : geo0;
    const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
    m3.getNormalMatrix(mat); col.set(color || '#ffffff');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mat); P.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(m3).normalize(); N.push(v.x, v.y, v.z);
      if (u) U.push(u.getX(i), u.getY(i)); else U.push(0, 0);
      C.push(col.r, col.g, col.b);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere();
  return g;
}
const M4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (r0, r1, h, s) => new THREE.CylinderGeometry(r0, r1, h, s || 12);

const QUAL_SHADOW = [];   // meshes that cast shadows only on the top tiers
function stdMat(o) {
  const m = new THREE.MeshStandardMaterial(o);
  return m;
}
function repMat(id, rep, o) {
  const s = surface(id), cl = (t) => { const c = t.clone(); c.repeat.set(rep, rep); c.needsUpdate = true; ALL_TEX.push(c); return c; };
  return stdMat(Object.assign({ map: cl(s.map), normalMap: cl(s.normalMap), roughnessMap: cl(s.roughnessMap), roughness: 1, metalness: 0 }, o || {}));
}
function surfMat(id, o) {
  const s = surface(id);
  return stdMat(Object.assign({ map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, roughness: 1, metalness: 0 }, o || {}));
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
function instanced(geo, mat, list, shadow) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.count = list.length; im.instanceMatrix.needsUpdate = true;
  im.castShadow = !!shadow; im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}

/* ------------------------------------------------------------ the world, built per map */
function buildWorld(mapId) {
  const r = R3, M = MAPS[mapId], G = buildGrid(mapId), L = M.look;
  const group = new THREE.Group(); group.name = 'map-' + mapId;
  const S = { id: mapId, M, G, group, cloths: [], flicker: [], flagMeshes: [], neon: [], lamps: [], beams: [] };
  const K = (x, z) => (x < 0 || z < 0 || x >= GN || z >= GN ? (mapId === 'roof' ? 'x' : '#') : G.kind[z * GN + x]);
  const cx = (x) => (x - GN / 2) * CS;
  const WH = M.wallH;

  // floors: merged quads per material, the rooftop gaps left open
  const fl = GB(), br = GB();
  for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
    const k = K(x, z); if (k === 'x' || k === '#') continue;
    const g = G.bridge[z * GN + x] ? br : fl;
    const x0 = cx(x), z0 = cx(z), x1 = x0 + CS, z1 = z0 + CS;
    gbQuad(g, [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], 0, 1, 0, [x0 / 4, z1 / 4], [x1 / 4, z1 / 4], [x1 / 4, z0 / 4], [x0 / 4, z0 / 4]);
    if (mapId === 'roof') {
      // slab edges where the roof drops away
      const d = G.bridge[z * GN + x] ? 0.18 : 0.7;
      if (K(x + 1, z) === 'x') gbBox(g, x1 - 0.01, -d, z0, x1, 0, z1, 1, 2);
      if (K(x - 1, z) === 'x') gbBox(g, x0, -d, z0, x0 + 0.01, 0, z1, 2, 2);
      if (K(x, z + 1) === 'x') gbBox(g, x0, -d, z1 - 0.01, x1, 0, z1, 16, 2);
      if (K(x, z - 1) === 'x') gbBox(g, x0, -d, z0, x1, 0, z0 + 0.01, 32, 2);
    }
  }
  const floorId = mapId + 'floor';
  const floorMat = surfMat(floorId === 'millfloor' ? 'millfloor' : floorId === 'rooffloor' ? 'rooffloor' : 'fortfloor', mapId === 'roof' ? { roughness: 1, metalness: 0.05, envMapIntensity: 1.6 } : {});
  const floor = new THREE.Mesh(gbGeo(fl), floorMat); floor.receiveShadow = true; group.add(floor);
  if (br.p.length) { const bm = new THREE.Mesh(gbGeo(br), surfMat('wood', { color: '#b89272' })); bm.receiveShadow = true; bm.castShadow = true; group.add(bm); }

  // walls: one merged mesh, internal faces culled
  const wg = GB();
  const wallId = mapId === 'mill' ? 'brick' : mapId === 'roof' ? 'plaster' : 'sandstone';
  for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
    if (K(x, z) !== '#') continue;
    let mask = 4;
    if (K(x + 1, z) !== '#') mask |= 1; if (K(x - 1, z) !== '#') mask |= 2; if (K(x, z + 1) !== '#') mask |= 16; if (K(x, z - 1) !== '#') mask |= 32;
    if (x === 0) mask |= 2; if (x === GN - 1) mask |= 1; if (z === 0) mask |= 32; if (z === GN - 1) mask |= 16;
    const h = mapId === 'roof' ? 3.0 : WH;
    gbBox(wg, cx(x), 0, cx(z), cx(x) + CS, h, cx(z) + CS, mask, mapId === 'fort' ? 4 : 2, mapId === 'fort' ? 4 : 2);
  }
  // rooftop parapets along every edge that drops into a gap
  const pg = GB(), rail = [];
  if (mapId === 'roof') {
    for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
      const k = K(x, z); if (k === 'x' || k === '#') continue;
      const x0 = cx(x), z0 = cx(z), x1 = x0 + CS, z1 = z0 + CS, bridge = G.bridge[z * GN + x];
      const edge = (side, ax0, az0, ax1, az1) => {
        if (bridge) { rail.push([ax0, az0, ax1, az1]); return; }
        gbBox(pg, ax0, 0, az0, ax1, 1.02, az1, 63 & ~8, 1.5);
      };
      if (K(x + 1, z) === 'x') edge(0, x1 - 0.22, z0, x1, z1);
      if (K(x - 1, z) === 'x') edge(1, x0, z0, x0 + 0.22, z1);
      if (K(x, z + 1) === 'x') edge(2, x0, z1 - 0.22, x1, z1);
      if (K(x, z - 1) === 'x') edge(3, x0, z0, x1, z0 + 0.22);
    }
  }
  const wallMat = surfMat(wallId, mapId === 'roof' ? { color: '#d8e4e0' } : {});
  const walls = new THREE.Mesh(gbGeo(wg), wallMat); walls.castShadow = true; walls.receiveShadow = true; group.add(walls);
  if (pg.p.length) { const pm = new THREE.Mesh(gbGeo(pg), surfMat('plaster', { color: '#b9c9c4' })); pm.castShadow = true; pm.receiveShadow = true; group.add(pm); }
  if (rail.length) {
    const pipes = [];
    rail.forEach(([a0, b0, a1, b1]) => {
      const mx = (a0 + a1) / 2, mz = (b0 + b1) / 2, len = Math.max(Math.abs(a1 - a0), Math.abs(b1 - b0)), along = Math.abs(a1 - a0) > Math.abs(b1 - b0);
      [0.55, 1.0].forEach((yy) => pipes.push(M4(mx, yy, mz, along ? 0 : Math.PI / 2, 0, along ? Math.PI / 2 : 0, 1, len, 1)));
      pipes.push(M4(a0, 0.5, b0, 0, 0, 0, 1, 1, 1));
    });
    const rm = instanced(CYL(0.035, 0.035, 1, 6), stdMat({ color: '#9aa3a8', metalness: 0.8, roughness: 0.35 }), pipes, true);
    group.add(rm);
  }

  // props on cover cells
  const lists = { c: [], b: [], o: [] };
  for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) { const k = K(x, z); if (lists[k]) lists[k].push([cx(x) + CS / 2, cx(z) + CS / 2, hash(x * 97 + z * 13 + mapId.length)]); }
  buildProps(S, mapId, lists);
  buildDecor(S, mapId, G, K, cx);

  r.scene.add(group);
  // light and air for this map
  const sunDir = new THREE.Vector3(Math.sin(L.sunAz) * Math.cos(L.sunEl), Math.sin(L.sunEl), -Math.cos(L.sunAz) * Math.cos(L.sunEl)).normalize();
  S.sunDir = sunDir;
  r.scene.fog.color.set(L.fog); r.scene.fog.density = L.fogD;
  r.hemi.color.set(L.hemiSky); r.hemi.groundColor.set(L.hemiGnd); r.hemi.intensity = L.hemiI;
  r.sun.color.set(L.sun); r.sun.intensity = L.sunI;
  r.sun.position.copy(sunDir).multiplyScalar(90); r.sun.target.position.set(0, 0, 0);
  r.sun.target.updateMatrixWorld(); r.sun.updateMatrixWorld();
  const sc = r.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 20; sc.far = 190; sc.updateProjectionMatrix();
  r.vmHemi.color.set(L.hemiSky); r.vmHemi.groundColor.set(L.hemiGnd); r.vmHemi.intensity = L.hemiI * 1.3;
  r.vmSun.color.set(L.sun); r.vmSun.intensity = L.sunI * 0.8; r.vmSun.position.copy(sunDir).multiplyScalar(5);
  const u = r.skyU;
  u.uTop.value.set(L.skyTop); u.uMid.value.set(L.skyMid); u.uHor.value.set(L.skyHor); u.uFog.value.set(L.fog); u.uSun.value.set(L.sun).multiplyScalar(1.4); u.uCloud.value = L.cloud; u.uStorm.value = L.rain ? 1 : 0;
  u.uSunDir.value.copy(sunDir);
  r.renderer.setClearColor(L.fog);
  if (!r.envs[mapId]) {
    const es = new THREE.Scene(), em = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), r.skyMat); es.add(em);
    r.envs[mapId] = r.pmrem.fromScene(es, 0.02, 0.1, 100).texture;
    em.geometry.dispose();
  }
  r.scene.environmentIntensity = L.env; r.vmScene.environment = r.envs[mapId]; r.vmScene.environmentIntensity = L.env * 1.2;
  S.decals = makeDecals(group);
  S.markers = makeMarkers(group);
  S.flags = makeFlagMeshes(group, G, cx);
  return S;
}
function disposeWorld(S) {
  if (!S) return;
  R3.scene.remove(S.group);
  S.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  S.lamps.forEach((l) => R3.scene.remove(l));
}

function buildProps(S, mapId, lists) {
  const g = S.group, rot = (h) => (h - 0.5) * 0.18;
  const add = (o) => { g.add(o); return o; };
  if (mapId === 'mill') {
    const bale = new THREE.BoxGeometry(1.86, 1.08, 1.86, 2, 2, 2);
    add(instanced(bale, surfMat('bale', { color: '#f2ead8' }), lists.c.map(([x, z, h]) => M4(x, 0.54, z, 0, rot(h), 0, 0.97 + h * 0.05, 1, 0.97 + h * 0.05)), true));
    const loom = mergeParts([
      [BOX(1.9, 0.26, 1.5), M4(0, 0.13, 0), '#3f5248'], [BOX(0.12, 1.75, 1.5), M4(-0.89, 0.875, 0), '#4b6155'], [BOX(0.12, 1.75, 1.5), M4(0.89, 0.875, 0), '#4b6155'],
      [BOX(1.9, 0.14, 0.16), M4(0, 1.68, -0.6), '#33443b'], [BOX(1.9, 0.14, 0.16), M4(0, 1.68, 0.6), '#33443b'],
      [CYL(0.16, 0.16, 1.72, 14), M4(0, 0.62, -0.45, 0, 0, Math.PI / 2), '#b8946a'], [CYL(0.2, 0.2, 1.72, 14), M4(0, 1.25, 0.45, 0, 0, Math.PI / 2), '#a07a52'],
      [BOX(1.5, 0.22, 0.6), M4(0, 0.95, 0.05, -0.35, 0, 0), '#9b8a70'], [BOX(0.5, 0.5, 0.5), M4(-0.6, 0.45, 0.55), '#2f3a34'],
      [CYL(0.3, 0.3, 0.1, 16), M4(0.98, 1.0, 0, 0, 0, Math.PI / 2), '#7a2f22']
    ]);
    const lm = add(instanced(loom, surfMat('metal', { vertexColors: true, metalness: 0.45 }), lists.b.map(([x, z, h]) => M4(x, 0, z, 0, (h < 0.5 ? 0 : Math.PI) + rot(h) * 0.3, 0)), true));
    const cloth = add(instanced(new THREE.BoxGeometry(1.4, 0.5, 0.42), stdMat({ roughness: 0.9 }), lists.b.map(([x, z, h]) => M4(x, 1.45, z + (h < 0.5 ? 0.12 : -0.12), -0.4 * (h < 0.5 ? 1 : -1), 0, 0)), true));
    const dyes = ['#d9381e', '#2c44c8', '#e3a21a', '#b8237a', '#1e9a8a', '#e8692a'];
    lists.b.forEach((b, i) => cloth.setColorAt(i, new THREE.Color(dyes[(b[2] * 97 | 0) % dyes.length])));
    if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
    const top = MAPS.mill.wallH + 3.6;
    add(instanced(mergeParts([[BOX(1.5, top, 1.5), M4(0, top / 2, 0), '#ffffff'], [BOX(1.75, 0.35, 1.75), M4(0, 2.4, 0), '#c9b9a0'], [BOX(1.75, 0.5, 1.75), M4(0, 0.25, 0), '#a89a86']]), surfMat('brick', { vertexColors: true }), lists.o.map(([x, z]) => M4(x, 0, z)), true));
    void lm;
  } else if (mapId === 'roof') {
    add(instanced(new THREE.BoxGeometry(1.75, 1.06, 1.75), surfMat('wood', { color: '#c49a6a' }), lists.c.map(([x, z, h]) => M4(x, 0.53, z, 0, rot(h) * 2, 0)), true));
    add(instanced(new THREE.BoxGeometry(0.7, 0.45, 0.5), stdMat({ color: '#2a8f5a', roughness: 0.5 }), lists.c.filter((c) => c[2] > 0.4).map(([x, z, h]) => M4(x + (h - 0.5), 1.29, z - 0.2, 0, h * 3, 0)), true));
    const ac = mergeParts([
      [BOX(1.8, 1.45, 1.25), M4(0, 0.85, 0), '#c9cfd2'], [BOX(1.9, 0.12, 1.35), M4(0, 0.06, 0), '#6d7377'],
      [CYL(0.5, 0.5, 0.06, 20), M4(-0.3, 0.9, 0.64, Math.PI / 2, 0, 0), '#30363a'], [BOX(0.5, 1.2, 0.04), M4(0.55, 0.85, 0.63), '#9aa2a6'],
      [BOX(1.8, 0.08, 1.25), M4(0, 1.6, 0), '#a5adb1'], [CYL(0.05, 0.05, 1.3, 6), M4(0.8, 0.6, -0.7, Math.PI / 2, 0, 0), '#b58a52']
    ]);
    add(instanced(ac, surfMat('metal', { vertexColors: true, metalness: 0.6, roughness: 0.55 }), lists.b.map(([x, z, h]) => M4(x, 0, z, 0, h < 0.5 ? 0 : Math.PI, 0)), true));
    const ribs = [];
    for (let k = 0; k < 4; k++) ribs.push([CYL(0.97, 0.97, 0.07, 28), M4(0, 1.0 + k * 0.38, 0), '#15171a']);
    const tank = mergeParts([[BOX(1.9, 0.12, 1.9), M4(0, 0.72, 0), '#8a8f92'], [BOX(0.12, 0.72, 0.12), M4(-0.8, 0.36, -0.8), '#707579'], [BOX(0.12, 0.72, 0.12), M4(0.8, 0.36, -0.8), '#707579'], [BOX(0.12, 0.72, 0.12), M4(-0.8, 0.36, 0.8), '#707579'], [BOX(0.12, 0.72, 0.12), M4(0.8, 0.36, 0.8), '#707579'],
      [CYL(0.92, 0.95, 1.65, 28), M4(0, 1.6, 0), '#1c1e21'], [CYL(0.45, 0.6, 0.18, 20), M4(0, 2.5, 0), '#1c1e21'], [CYL(0.3, 0.3, 0.1, 16), M4(0, 2.62, 0), '#26292d']].concat(ribs));
    add(instanced(tank, stdMat({ vertexColors: true, roughness: 0.32, metalness: 0.1 }), lists.o.map(([x, z]) => M4(x, 0, z)), true));
  } else {
    const barrels = mergeParts([
      [CYL(0.42, 0.42, 1.0, 16), M4(-0.42, 0.5, -0.3), '#8a5a33'], [CYL(0.42, 0.42, 1.0, 16), M4(0.45, 0.5, 0.25), '#7a4e2c'],
      [CYL(0.44, 0.44, 0.06, 16), M4(-0.42, 0.25, -0.3), '#3a3a3a'], [CYL(0.44, 0.44, 0.06, 16), M4(-0.42, 0.78, -0.3), '#3a3a3a'], [CYL(0.44, 0.44, 0.06, 16), M4(0.45, 0.25, 0.25), '#3a3a3a'], [CYL(0.44, 0.44, 0.06, 16), M4(0.45, 0.78, 0.25), '#3a3a3a'],
      [BOX(0.9, 0.7, 0.8), M4(0.35, 0.35, -0.6, 0, 0.3, 0), '#b08a5a'], [BOX(0.85, 0.35, 0.75), M4(-0.3, 0.17, 0.62, 0, -0.2, 0), '#c9a26e']
    ]);
    add(instanced(barrels, surfMat('wood', { vertexColors: true }), lists.c.map(([x, z, h]) => M4(x, 0, z, 0, h * TAU, 0)), true));
    add(instanced(mergeParts([[BOX(1.92, 1.5, 1.92), M4(0, 0.75, 0), '#ffffff'], [BOX(2.04, 0.26, 2.04), M4(0, 1.62, 0), '#f0d8b8']]), surfMat('sandstone', { vertexColors: true }), lists.b.map(([x, z]) => M4(x, 0, z)), true));
    const wh = MAPS.fort.wallH;
    add(instanced(mergeParts([[CYL(0.55, 0.62, wh, 16), M4(0, wh / 2, 0), '#ffffff'], [BOX(1.35, 0.5, 1.35), M4(0, 0.25, 0), '#e8cfa8'], [BOX(1.3, 0.4, 1.3), M4(0, wh - 0.2, 0), '#f0d8b8'], [CYL(0.75, 0.58, 0.3, 16), M4(0, wh - 0.55, 0), '#f0d8b8']]), surfMat('sandstone', { vertexColors: true }), lists.o.map(([x, z]) => M4(x, 0, z)), true));
  }
}

// Set dressing beyond the grid: roofs, trusses, the city below, towers and dunes.
function buildDecor(S, mapId, G, K, cx) {
  const g = S.group, M = MAPS[mapId], WH = M.wallH;
  const add = (o) => { g.add(o); return o; };
  const emissive = (map, col, k, extra) => stdMat(Object.assign({ map, emissiveMap: map, emissive: new THREE.Color(col), emissiveIntensity: k, roughness: 0.6 }, extra || {}));
  if (mapId === 'mill') {
    // ground outside the hall and a chimney against the dusk
    const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(500, 500), repMat('millfloor', 120, { color: '#5a4a3c' })));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; S.outside = ground;
    add(new THREE.Mesh(CYL(1.7, 2.4, 34, 20), surfMat('brick'))).position.set(34, 17, -40);
    add(new THREE.Mesh(CYL(1.9, 1.9, 1.2, 20), surfMat('brick', { color: '#6b5a50' }))).position.set(34, 34.4, -40);
    add(new THREE.Mesh(BOX(26, 12, 14), surfMat('brick', { color: '#8a7a70' }))).position.set(-44, 6, 30);
    // gable trusses spanning the hall, and corrugated sheets on some bays
    const span = GN * CS, rise = 4.2, y0 = WH + 0.15;
    const half = span / 2, rl = Math.hypot(half, rise), ra = Math.atan2(rise, half);
    const truss = [[BOX(span, 0.28, 0.3), M4(0, y0, 0), '#3d332c'], [BOX(rl, 0.3, 0.3), M4(-half / 2, y0 + rise / 2, 0, 0, 0, ra), '#3d332c'], [BOX(rl, 0.3, 0.3), M4(half / 2, y0 + rise / 2, 0, 0, 0, -ra), '#3d332c']];
    for (let k = -3; k <= 3; k++) { const x = k * 6, h = rise * (1 - Math.abs(x) / half); truss.push([BOX(0.14, h, 0.14), M4(x, y0 + h / 2, 0), '#4a3f36']); if (k) truss.push([BOX(Math.hypot(6, h), 0.12, 0.12), M4(x - Math.sign(x) * 3, y0 + h / 2, 0, 0, 0, Math.sign(x) * Math.atan2(h, 6)), '#4a3f36']); }
    const tr = [];
    for (let z = -21; z <= 21; z += 6) tr.push(M4(0, 0, z));
    add(instanced(mergeParts(truss), surfMat('metal', { vertexColors: true, metalness: 0.6 }), tr, true));
    const sheets = [];
    for (let z = -21; z < 21; z += 6) for (const sd of [-1, 1]) { if (hash(z * 7 + sd * 3) < 0.45) continue; sheets.push(M4(sd * half / 2, y0 + rise / 2 + 0.2, z + 3, 0, 0, -sd * ra, 1, 1, 1)); }
    add(instanced(new THREE.BoxGeometry(rl, 0.05, 5.6), surfMat('metal', { color: '#8c6d52', metalness: 0.7, roughness: 0.7, side: THREE.DoubleSide }), sheets, true));
    // arched windows glowing with the sunset, on the inside of the outer walls
    const wc = mkCanvas(64, 128), wg = wc.getContext('2d');
    const gr = wg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#ffd9a0'); gr.addColorStop(1, '#ff8a3a');
    wg.fillStyle = '#1b1310'; wg.fillRect(0, 0, 64, 128); wg.fillStyle = gr; wg.beginPath(); wg.moveTo(6, 128); wg.lineTo(6, 32); wg.arc(32, 32, 26, Math.PI, 0); wg.lineTo(58, 128); wg.fill();
    wg.fillStyle = '#1b1310'; for (let i = 1; i < 4; i++) wg.fillRect(6, i * 30 + 10, 52, 3); wg.fillRect(30, 6, 4, 122);
    const wt = toTex(wc, { clamp: true });
    const winMat = stdMat({ map: wt, emissiveMap: wt, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 3.2, roughness: 0.4 });
    const wins = [], shafts = [];
    const sd = new THREE.Vector3(Math.sin(M.look.sunAz) * Math.cos(M.look.sunEl), Math.sin(M.look.sunEl), -Math.cos(M.look.sunAz) * Math.cos(M.look.sunEl)).normalize();
    for (let i = 1; i < GN - 1; i += 2) {
      const p = cx(i) + CS / 2;
      [[p, -HALFW + CS + 0.02, 0, 0], [p, HALFW - CS - 0.02, Math.PI, 0], [-HALFW + CS + 0.02, p, Math.PI / 2, 1], [HALFW - CS - 0.02, p, -Math.PI / 2, 1]].forEach(([x, z, ry, side]) => {
        const zz = z, xx = x;
        wins.push(M4(xx, 3.3, zz, 0, ry, 0, 1.3, 2.2, 1));
        const facing = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
        if (facing.dot(sd) < -0.4) {
          // a shaft of light from the window into the hall, down along the sun
          const dir = sd.clone().negate(), len = 13, mid = new THREE.Vector3(xx, 3.3, zz).addScaledVector(dir, len / 2);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
          for (const tw of [0, Math.PI / 2]) { const m = new THREE.Matrix4().compose(mid, q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tw + ry, 0))), new THREE.Vector3(1.5, len, 1)); shafts.push(m); }
        }
      });
    }
    add(instanced(new THREE.PlaneGeometry(1, 1), winMat, wins, false));
    if (shafts.length) {
      const sm = new THREE.MeshBasicMaterial({ map: shaftTex(), color: new THREE.Color('#ffb070').multiplyScalar(0.28), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const sh = add(instanced(new THREE.PlaneGeometry(1, 1), sm, shafts, false)); sh.receiveShadow = false; sh.userData.decor = true; sh.renderOrder = 4;
    }
    // dyed cloth drying on lines across the hall
    const dyes = ['#e8452c', '#2b48d6', '#f2a51a', '#c22a86', '#18a39a', '#ff7a2a', '#7b3fe4'];
    const cl = [];
    for (const z of [-7, 7]) for (let x = -20; x <= 20; x += 2.6) { if (hash(x * 13 + z) < 0.3) continue; cl.push([x, z]); }
    const cm = add(instanced(new THREE.PlaneGeometry(1.5, 2.4, 1, 4), stdMat({ side: THREE.DoubleSide, roughness: 0.85 }), cl.map(([x, z]) => M4(x, 3.9, z)), true));
    cl.forEach((c, i) => { cm.setColorAt(i, new THREE.Color(dyes[(hash(c[0] * 7 + c[1]) * 70 | 0) % dyes.length])); S.cloths.push({ im: cm, i, x: c[0], y: 3.9, z: c[1], ph: hash(i + 3) * TAU, sw: 0.12, h: 2.4, ry: 0 }); });
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    const lineMats = [];
    for (const z of [-7, 7]) lineMats.push(M4(0, 5.12, z, 0, 0, Math.PI / 2, 1, 46, 1));
    add(instanced(CYL(0.015, 0.015, 1, 4), stdMat({ color: '#2a2420' }), lineMats, false));
    // hanging lamps
    const lampPos = [[-9, -9], [9, 9], [-9, 9], [9, -9]];
    add(instanced(mergeParts([[CYL(0.02, 0.02, 2.4, 4), M4(0, 1.2, 0), '#222'], [CYL(0.08, 0.5, 0.35, 16, 1, true), M4(0, 0, 0), '#3b4a42']]), stdMat({ vertexColors: true, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }), lampPos.map(([x, z]) => M4(x, 5.0, z)), false));
    add(instanced(new THREE.SphereGeometry(0.13, 12, 8), stdMat({ color: '#fff2d0', emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 6 }), lampPos.map(([x, z]) => M4(x, 4.85, z)), false));
    lampPos.slice(0, 2).forEach(([x, z]) => { const pl = new THREE.PointLight('#ffc27a', 9, 16, 1.6); pl.position.set(x, 4.6, z); S.lamps.push(pl); });
  } else if (mapId === 'roof') {
    // the three buildings under the roofs, lit windows going down into the rain
    const bg = GB();
    const blocks = [[1, 6], [9, 14], [17, 22]];
    blocks.forEach(([a, b]) => gbBox(bg, cx(a), -30, cx(1), cx(b) + CS, -0.7, cx(22) + CS, 1 | 2 | 16 | 32, 8, 16));
    add(new THREE.Mesh(gbGeo(bg), emissive(windowsTex(7, 0.42), '#ffffff', 1.4, { color: '#8a8f96' })));
    const street = add(new THREE.Mesh(new THREE.PlaneGeometry(600, 600), stdMat({ color: '#15181c', roughness: 0.25, metalness: 0.2 })));
    street.rotation.x = -Math.PI / 2; street.position.y = -30;
    const city = [], R = rng(55);
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, d = 34 + R() * 110, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
      const top = -12 + R() * (d < 60 ? 20 : 34), w = 8 + R() * 14, dd = 8 + R() * 14;
      city.push(M4(x, (top - 30) / 2, z, 0, R() * 0.3, 0, w, top + 30, dd));
    }
    add(instanced(new THREE.BoxGeometry(1, 1, 1), emissive(windowsTex(19, 0.32), '#ffffff', 1.2, { color: '#6d737a' }), city, false));
    const signs = [['CHAI', '#ff3d8b', -36, 6, -10, Math.PI / 2], ['TAILORS', '#38e1ff', 34, 4, 12, -Math.PI / 2], ['RADIO', '#7dff6a', 12, 8, -40, 0], ['SWEETS', '#ffb736', -10, 5, 40, Math.PI]];
    signs.forEach(([t, col, x, y, z, ry], i) => {
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), stdMat({ map: signTex(t, col, '#0b0d10'), emissiveMap: signTex(t, col, '#0b0d10'), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 2.6, roughness: 0.5 })));
      m.position.set(x, y, z); m.rotation.y = ry; S.neon.push({ m, base: 2.6, ph: i * 1.7 });
      const back = add(new THREE.Mesh(BOX(8, 6, 0.6), stdMat({ color: '#30353b', roughness: 0.8 })));
      back.position.set(x - Math.sin(ry) * 0.35, y, z - Math.cos(ry) * 0.35); back.rotation.y = ry;
    });
    // laundry lines over the west and east roofs
    const dyes = ['#ff5a3c', '#ffd23f', '#3fa7ff', '#ff6fb5', '#5cd16a', '#ffffff'], cl = [];
    for (const [x0, z] of [[-20, -18], [-20, 18], [14, -9], [14, 9]]) for (let k = 0; k < 4; k++) cl.push([x0 + k * 1.4, z]);
    const cm = add(instanced(new THREE.PlaneGeometry(0.95, 1.0, 1, 3), stdMat({ side: THREE.DoubleSide, roughness: 0.9 }), cl.map(([x, z]) => M4(x, 2.65, z)), true));
    cl.forEach((c, i) => { cm.setColorAt(i, new THREE.Color(dyes[i % dyes.length])); S.cloths.push({ im: cm, i, x: c[0], y: 2.65, z: c[1], ph: i * 0.7, sw: 0.28, h: 1.0, ry: 0 }); });
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    const posts = [];
    [[-20.7, -18], [-14.6, -18], [-20.7, 18], [-14.6, 18], [13.3, -9], [19.4, -9], [13.3, 9], [19.4, 9]].forEach(([x, z]) => posts.push(M4(x, 1.6, z)));
    add(instanced(CYL(0.04, 0.04, 3.2, 6), stdMat({ color: '#6c7377', metalness: 0.8, roughness: 0.4 }), posts, false));
    // a neon sign on the stairwell housings
    [[-15, -1.0, 0], [15, -1.0, Math.PI]].forEach(([x, z, ry], i) => {
      const t = i ? 'STAIRS' : 'ROOF 3';
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), stdMat({ map: signTex(t, i ? '#38e1ff' : '#ff3d8b', '#0b0d10'), emissiveMap: signTex(t, i ? '#38e1ff' : '#ff3d8b', '#0b0d10'), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 2.2 })));
      m.position.set(x, 2.5, z + (i ? 0 : 0)); m.rotation.y = ry; S.neon.push({ m, base: 2.2, ph: 3 + i });
    });
    const pl = new THREE.PointLight('#ff4f9a', 6, 14, 1.6); pl.position.set(-15, 2.6, -0.2); S.lamps.push(pl);
    const pl2 = new THREE.PointLight('#38e1ff', 6, 14, 1.6); pl2.position.set(15, 2.6, -0.2); S.lamps.push(pl2);
  } else {
    // dunes beyond the walls
    const dg = new THREE.PlaneGeometry(520, 520, 96, 96), pa = dg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), d = Math.max(Math.abs(x), Math.abs(y));
      const k = smooth01((d - 30) / 40);
      pa.setZ(i, -0.06 + k * (3 + Math.sin(x * 0.045) * 4 + Math.sin(y * 0.06 + x * 0.02) * 3 + Math.sin((x + y) * 0.13) * 0.8));
    }
    dg.computeVertexNormals();
    const dune = add(new THREE.Mesh(dg, repMat('fortfloor', 90, { color: '#e6b47e' })));
    dune.rotation.x = -Math.PI / 2; dune.receiveShadow = true; S.outside = dune;
    // merlons along the top of the outer walls
    const mer = [];
    for (let i = 0; i < 30; i++) { const p = -HALFW + 0.8 + i * (GN * CS - 1.6) / 29; mer.push(M4(p, WH + 0.45, -HALFW + 0.4), M4(p, WH + 0.45, HALFW - 0.4), M4(-HALFW + 0.4, WH + 0.45, p), M4(HALFW - 0.4, WH + 0.45, p)); }
    add(instanced(BOX(0.85, 0.9, 0.7), surfMat('sandstone'), mer, true));
    // corner towers with domed pavilions
    const cols = [];
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; cols.push([CYL(0.16, 0.16, 2.2, 8), M4(Math.cos(a) * 2.1, 10.4, Math.sin(a) * 2.1), '#f0d8b8']); }
    const tower = mergeParts([[CYL(3.2, 3.5, 9.2, 24), M4(0, 4.6, 0), '#ffffff'], [CYL(3.5, 3.4, 0.5, 24), M4(0, 9.3, 0), '#f0d8b8'], [new THREE.SphereGeometry(2.5, 20, 10, 0, TAU, 0, Math.PI / 2), M4(0, 11.5, 0), '#f6e2c6'], [CYL(0.12, 0.3, 1.0, 8), M4(0, 14.3, 0), '#d6a842']].concat(cols));
    add(instanced(tower, surfMat('sandstone', { vertexColors: true }), [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => M4(a * HALFW, 0, b * HALFW)), true));
    // pavilion canopies over the courtyard pillars
    const can = mergeParts([[BOX(4.6, 0.35, 2.4), M4(0, 0, 0), '#f0d8b8'], [new THREE.SphereGeometry(1.25, 18, 9, 0, TAU, 0, Math.PI / 2), M4(0, 0.15, 0), '#f6e2c6'], [CYL(0.06, 0.18, 0.6, 8), M4(0, 1.6, 0), '#d6a842']]);
    add(instanced(can, surfMat('sandstone', { vertexColors: true }), [M4(0, WH + 0.15, cx(6) + 1), M4(0, WH + 0.15, cx(17) + 1)], true));
    // gate arches on the north and south walls
    const ac = mkCanvas(128, 160), ag = ac.getContext('2d');
    ag.fillStyle = '#c98f5a'; ag.fillRect(0, 0, 128, 160); ag.fillStyle = '#2a1a10'; ag.beginPath(); ag.moveTo(20, 160); ag.lineTo(20, 64); ag.quadraticCurveTo(20, 14, 64, 6); ag.quadraticCurveTo(108, 14, 108, 64); ag.lineTo(108, 160); ag.fill();
    ag.strokeStyle = '#f0d0a0'; ag.lineWidth = 6; ag.stroke();
    const arch = stdMat({ map: toTex(ac, { clamp: true }), roughness: 0.9 });
    [[0, -HALFW + CS + 0.03, 0], [0, HALFW - CS - 0.03, Math.PI]].forEach(([x, z, ry]) => { const m = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.3), arch)); m.position.set(x, 2.15, z); m.rotation.y = ry; });
    // banners on the outer walls, each squad's colours on its own half
    const bn = [];
    for (const [x, z, ry, t] of [[-8, -HALFW + CS + 0.06, 0, 1], [8, -HALFW + CS + 0.06, 0, 1], [-8, HALFW - CS - 0.06, Math.PI, 0], [8, HALFW - CS - 0.06, Math.PI, 0], [-HALFW + CS + 0.06, -8, Math.PI / 2, 1], [HALFW - CS - 0.06, -8, -Math.PI / 2, 1], [-HALFW + CS + 0.06, 8, Math.PI / 2, 0], [HALFW - CS - 0.06, 8, -Math.PI / 2, 0]]) bn.push([x, z, ry, t]);
    [0, 1].forEach((t) => {
      const list = bn.filter((b) => b[3] === t);
      const m = add(instanced(new THREE.PlaneGeometry(1.5, 3.2, 1, 4), stdMat({ map: clothTex(TEAMS[t].vest, '#f2d48a'), side: THREE.DoubleSide, roughness: 0.85 }), list.map(([x, z, ry]) => M4(x, 3.2, z, 0, ry, 0)), true));
      list.forEach(([x, z, ry], i) => S.cloths.push({ im: m, i, x, y: 3.2, z, ph: i * 1.3, sw: 0.05, ry, h: 3.2 }));
    });
    // torches
    const tp = [[-6, -HALFW + CS + 0.3], [6, HALFW - CS - 0.3], [-HALFW + CS + 0.3, 0], [HALFW - CS - 0.3, 0]];
    add(instanced(mergeParts([[CYL(0.06, 0.04, 0.7, 6), M4(0, 0, 0), '#3a2a1a'], [CYL(0.14, 0.08, 0.2, 10), M4(0, 0.38, 0), '#6a4a2a']]), stdMat({ vertexColors: true }), tp.map(([x, z]) => M4(x, 2.6, z)), false));
    tp.forEach(([x, z], i) => { S.flicker.push({ x, y: 3.15, z, ph: i * 2.1 }); });
    [tp[0], tp[1]].forEach(([x, z]) => { const pl = new THREE.PointLight('#ff9a40', 7, 13, 1.7); pl.position.set(x, 3.4, z); S.lamps.push(pl); });
    // distant mesas in the haze
    const R = rng(91), mesas = [];
    for (let i = 0; i < 9; i++) { const a = R() * TAU, d = 170 + R() * 120; mesas.push(M4(Math.cos(a) * d, 6, Math.sin(a) * d, 0, R(), 0, 30 + R() * 40, 12 + R() * 22, 20 + R() * 30)); }
    add(instanced(new THREE.CylinderGeometry(0.42, 0.5, 1, 7), stdMat({ color: '#b5785a', roughness: 1 }), mesas, false));
  }
  S.lamps.forEach((l) => { l.userData.lamp = true; R3.scene.add(l); });
}

/* ------------------------------------------------------------ decals, markers, flags */
// A run of paint: a thin trail with a fat drop at the bottom, anchored at its top edge.
function dripTex() {
  if (TX.drip) return TX.drip;
  const Wd2 = 32, Hd = 128, c = mkCanvas(Wd2, Hd), g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(Wd2 / 2 - 7, 0); g.quadraticCurveTo(Wd2 / 2 - 3, Hd * 0.55, Wd2 / 2 - 4, Hd - 14); g.lineTo(Wd2 / 2 + 4, Hd - 14); g.quadraticCurveTo(Wd2 / 2 + 3, Hd * 0.55, Wd2 / 2 + 7, 0); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(Wd2 / 2, Hd - 11, 7, 9, 0, 0, TAU); g.fill();
  TX.drip = toTex(c, { clamp: true });
  return TX.drip;
}
const GROW_N = 96;
function makeDecals(group) {
  const mat = stdMat({ map: splatTex(), transparent: true, depthWrite: false, roughness: 0.18, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const MAX = 600, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX);
  im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.renderOrder = 2;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, new THREE.Color(1, 1, 1)); }
  group.add(im);
  const bmat = mat.clone(); bmat.polygonOffsetFactor = -2;
  const BMAX = 96, body = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), bmat, BMAX);
  body.frustumCulled = false; body.renderOrder = 3;
  for (let i = 0; i < BMAX; i++) { body.setMatrixAt(i, zero); body.setColorAt(i, new THREE.Color(1, 1, 1)); }
  group.add(body);
  // paint that runs down a wall: grows from the splat under its own weight, slowing as it thins
  const dmat = mat.clone(); dmat.map = dripTex(); dmat.polygonOffsetFactor = -5; dmat.polygonOffsetUnits = -5;
  const dg = new THREE.PlaneGeometry(1, 1); dg.translate(0, -0.5, 0);
  const DMAX = 72, drip = new THREE.InstancedMesh(dg, dmat, DMAX);
  drip.frustumCulled = false; drip.renderOrder = 2; drip.count = 0;
  for (let i = 0; i < DMAX; i++) { drip.setMatrixAt(i, zero); drip.setColorAt(i, new THREE.Color(1, 1, 1)); }
  group.add(drip);
  // splats that are still spreading, satellites still in flight and runs still running
  const grow = [];
  for (let i = 0; i < GROW_N; i++) grow.push({ on: false, kind: 0, i: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), sx: 1, sy: 1, t: 0, dur: 0.15, delay: 0, len: 0, rate: 1 });
  return { im, MAX, n: 0, body, BMAX, bn: 0, bodyList: new Array(BMAX).fill(null), zero, drip, DMAX, dn: 0, grow, gi: 0 };
}
const _q2 = new THREE.Quaternion(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _tn = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
function growSlot(D) { for (let k = 0; k < GROW_N; k++) { const g = D.grow[(D.gi + k) % GROW_N]; if (!g.on) { D.gi = (D.gi + k + 1) % GROW_N; return g; } } return null; }
// Advance spreading splats and running drips (pure matrix updates, nothing allocated).
function growSplats(D, dt) {
  let mi = false, md = false;
  for (let k = 0; k < GROW_N; k++) {
    const g = D.grow[k]; if (!g.on) continue;
    g.t += dt;
    const t = g.t - g.delay;
    if (g.kind === 0) {
      if (t < 0) continue;
      const e = 1 - Math.pow(1 - Math.min(1, t / g.dur), 3), s = 0.22 + 0.78 * e;
      _m.compose(g.p, g.q, _s.set(g.sx * s, g.sy * s, 1)); D.im.setMatrixAt(g.i, _m); mi = true;
      if (t >= g.dur) g.on = false;
    } else {
      if (t < 0) continue;
      const L = g.len * (1 - Math.exp(-t * g.rate));
      _m.compose(g.p, g.q, _s.set(g.sx, Math.max(0.001, L), 1)); D.drip.setMatrixAt(g.i, _m); md = true;
      if (t > 2.2 / g.rate) g.on = false;
    }
  }
  if (mi) D.im.instanceMatrix.needsUpdate = true;
  if (md) D.drip.instanceMatrix.needsUpdate = true;
}
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();
const ZAXIS = new THREE.Vector3(0, 0, 1), YAXIS = new THREE.Vector3(0, 1, 0);
// A splat on a surface. With the ball's velocity it smears along its line of travel (a glancing hit runs long)
// and, given time to grow, spreads out from the impact point over a few frames instead of appearing whole.
function addSplat(D, x, y, z, nx, ny, nz, color, size, vx, vy, vz, delay) {
  const i = D.n % D.MAX; D.n++;
  _v.set(nx, ny, nz).normalize();
  _q.setFromUnitVectors(ZAXIS, _v);
  let ang = Math.random() * TAU, st = 1;
  if (vx != null) {
    const sp = Math.hypot(vx, vy, vz) || 1, dn = vx * _v.x + vy * _v.y + vz * _v.z;
    _v3.set(vx - dn * _v.x, vy - dn * _v.y, vz - dn * _v.z);
    const tl = _v3.length() / sp;
    if (tl > 0.12) {
      st = 1 + 1.25 * tl * tl;
      _v3.normalize();
      _v4.set(1, 0, 0).applyQuaternion(_q);
      ang = Math.atan2(_v5.crossVectors(_v4, _v3).dot(_v), _v4.dot(_v3));
      x += _v3.x * size * 0.22 * (st - 1); y += _v3.y * size * 0.22 * (st - 1); z += _v3.z * size * 0.22 * (st - 1);
    }
  }
  _q.multiply(_q2.setFromAxisAngle(ZAXIS, ang));
  _v2.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
  const s = size * (0.8 + Math.random() * 0.5), sx = s * (0.85 + Math.random() * 0.3) * st, sy = s * (0.85 + Math.random() * 0.3) / Math.sqrt(st);
  const g = vx != null && !(ARC && ARC.reducedMotion) ? growSlot(D) : null;
  if (g) {
    g.on = true; g.kind = 0; g.i = i; g.p.copy(_v2); g.q.copy(_q); g.sx = sx; g.sy = sy; g.t = 0; g.delay = delay || 0; g.dur = 0.1 + size * 0.12;
    D.im.setMatrixAt(i, D.zero);
  } else { _m.compose(_v2, _q, _s.set(sx, sy, 1)); D.im.setMatrixAt(i, _m); }
  D.im.setColorAt(i, _c.set(color));
  D.im.count = Math.min(D.MAX, D.n);
  D.im.instanceMatrix.needsUpdate = true; if (D.im.instanceColor) D.im.instanceColor.needsUpdate = true;
}
// A run of paint below a splat on a wall. Its length is limited by the floor below it.
function addDrip(D, x, y, z, nx, nz, color, width, len, delay) {
  const g = growSlot(D); if (!g) return;
  const i = D.dn % D.DMAX; D.dn++;
  _v.set(nx, 0, nz).normalize();
  _v4.crossVectors(UPV, _v);
  _m.makeBasis(_v4, UPV, _v); g.q.setFromRotationMatrix(_m);
  g.on = true; g.kind = 1; g.i = i; g.p.set(x + nx * 0.016, y, z + nz * 0.016); g.sx = width; g.len = len; g.rate = 0.7 + Math.random() * 0.8; g.t = 0; g.delay = delay;
  D.drip.setMatrixAt(i, D.zero); D.drip.setColorAt(i, _c.set(color));
  D.drip.count = Math.min(D.DMAX, D.dn);
  D.drip.instanceMatrix.needsUpdate = true; if (D.drip.instanceColor) D.drip.instanceColor.needsUpdate = true;
}
function clearSplats(D) {
  for (let i = 0; i < D.MAX; i++) D.im.setMatrixAt(i, D.zero);
  D.n = 0; D.im.count = 0; D.im.instanceMatrix.needsUpdate = true;
  D.bodyList.fill(null); D.bn = 0;
  D.dn = 0; D.drip.count = 0; D.grow.forEach((g) => { g.on = false; });
}

function makeMarkers(group) {
  const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), stdMat({ color: '#ffd23f', emissive: new THREE.Color('#ffb21a'), emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.2 }));
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc24a').multiplyScalar(0.5), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, map: shaftTex() });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 30, 16, 1, true), beamMat);
  beam.rotation.x = Math.PI;
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc24a'), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), ringMat); ring.rotation.x = -Math.PI / 2;
  const fillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc24a'), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), fillMat); fill.rotation.x = -Math.PI / 2;
  const spool = new THREE.Group();
  const sp = mergeParts([[CYL(0.32, 0.32, 0.08, 20), M4(0, -0.3, 0), '#b8862a'], [CYL(0.32, 0.32, 0.08, 20), M4(0, 0.3, 0), '#b8862a'], [CYL(0.22, 0.22, 0.56, 20), M4(0, 0, 0), '#ffd24a'], [CYL(0.05, 0.05, 0.75, 8), M4(0, 0, 0), '#6a4a1a']]);
  spool.add(new THREE.Mesh(sp, stdMat({ vertexColors: true, metalness: 0.75, roughness: 0.28, emissive: new THREE.Color('#5a3a00'), emissiveIntensity: 0.6 })));
  [dia, beam, ring, fill, spool].forEach((o) => { o.visible = false; group.add(o); });
  dia.castShadow = true; spool.children[0].castShadow = true;
  return { dia, beam, ring, fill, spool };
}
function makeFlagMeshes(group, G, cx) {
  const out = [];
  [0, 1].forEach((t) => {
    const T = TEAMS[t], root = new THREE.Group();
    const base = new THREE.Mesh(mergeParts([[CYL(0.9, 1.0, 0.18, 24), M4(0, 0.09, 0), '#3a3f45'], [CYL(0.75, 0.75, 0.04, 24), M4(0, 0.2, 0), T.paint]]), stdMat({ vertexColors: true, roughness: 0.5, metalness: 0.3, emissive: new THREE.Color(T.paint), emissiveIntensity: 0.35 }));
    base.receiveShadow = true;
    const holder = new THREE.Group();
    const pole = new THREE.Mesh(CYL(0.035, 0.035, 2.6, 8), stdMat({ color: '#d9dde0', metalness: 0.8, roughness: 0.3 })); pole.position.y = 1.3; pole.castShadow = true;
    const cg = new THREE.PlaneGeometry(1.3, 0.85, 12, 6); cg.translate(0.65, 0, 0);
    const cloth = new THREE.Mesh(cg, stdMat({ map: clothTex(T.paint, '#ffffff'), side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color(T.paint), emissiveIntensity: 0.15 }));
    cloth.position.set(0.04, 2.15, 0); cloth.castShadow = true;
    holder.add(pole, cloth);
    root.add(base, holder);
    const f = G.flags[t];
    root.position.set(cx(f[0]) + CS / 2, 0, cx(f[1]) + CS / 2);
    root.visible = false; group.add(root);
    out.push({ root, base, holder, cloth, orig: cg.attributes.position.array.slice(), home: root.position.clone() });
  });
  return out;
}

/* ------------------------------------------------------------ people: every body part is one instanced mesh */
const PARTS = {};
const MAXC = 16;
function makePeople(scene) {
  const P = { list: [], group: new THREE.Group() };
  const mk = (name, geo, mat, shadow) => { const im = new THREE.InstancedMesh(geo, mat, MAXC); im.name = name; im.frustumCulled = false; im.castShadow = shadow !== false; im.receiveShadow = true; for (let i = 0; i < MAXC; i++) { im.setMatrixAt(i, _m.makeScale(0, 0, 0)); im.setColorAt(i, _c.set('#ffffff')); } P.group.add(im); P[name] = im; P.list.push(im); return im; };
  const fabric = stdMat({ roughness: 0.82 }), skin = stdMat({ roughness: 0.6 }), plastic = stdMat({ roughness: 0.38, metalness: 0.05 });
  const CAP = (r, l, sx, sy, sz) => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); if (sx) g.scale(sx, sy, sz); return g; };
  const rbox = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 0.22; const ax = Math.abs(v.x) / (w / 2), ay = Math.abs(v.y) / (h / 2), az = Math.abs(v.z) / (d / 2); const m = Math.max(ax, ay, az); if (m > 0.99) { const sq = Math.sqrt(ax * ax + ay * ay + az * az) / Math.sqrt(3); v.multiplyScalar(lerp(1, 1 / Math.max(0.6, sq), k)); } p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; };
  mk('hips', rbox(0.36, 0.24, 0.25), fabric);
  mk('torso', CAP(0.17, 0.24, 1.26, 1, 0.82), fabric);
  mk('rig', rbox(0.38, 0.32, 0.1), plastic);
  mk('pack', rbox(0.26, 0.3, 0.13), plastic);
  mk('head', new THREE.SphereGeometry(0.12, 16, 12), skin);
  mk('helmet', new THREE.SphereGeometry(0.138, 16, 9, 0, TAU, 0, Math.PI * 0.56), plastic);
  mk('mask', rbox(0.22, 0.17, 0.11), plastic);
  mk('visor', rbox(0.2, 0.072, 0.035), stdMat({ color: '#0e1620', roughness: 0.05, metalness: 0.7, emissive: new THREE.Color('#3a6a9a'), emissiveIntensity: 0.5 }), false);
  mk('uarmL', CAP(0.056, 0.2), fabric); mk('uarmR', CAP(0.056, 0.2), fabric);
  mk('farmL', CAP(0.05, 0.19), fabric); mk('farmR', CAP(0.05, 0.19), fabric);
  mk('thighL', CAP(0.078, 0.28), fabric); mk('thighR', CAP(0.078, 0.28), fabric);
  mk('shinL', CAP(0.066, 0.3), fabric); mk('shinR', CAP(0.066, 0.3), fabric);
  mk('bootL', rbox(0.135, 0.11, 0.27), plastic); mk('bootR', rbox(0.135, 0.11, 0.27), plastic);
  const gun = mergeParts([[BOX(0.07, 0.1, 0.42), M4(0, 0, 0), '#ffffff'], [CYL(0.018, 0.018, 0.34, 8), M4(0, 0.01, -0.36, Math.PI / 2, 0, 0), '#2a2d33'], [new THREE.SphereGeometry(0.075, 10, 8), M4(0, 0.1, -0.02, 0, 0, 0, 1, 0.8, 1.3), '#ffe680'], [CYL(0.035, 0.035, 0.2, 8), M4(0, -0.02, 0.28, Math.PI / 2, 0, 0), '#e8eef2'], [BOX(0.04, 0.12, 0.05), M4(0, -0.09, 0.08, 0.3, 0, 0), '#2a2d33']]);
  mk('gun', gun, stdMat({ vertexColors: true, roughness: 0.35, metalness: 0.15 }));
  // contact shadows: a soft dark footprint under everyone, so nobody floats where the shadow map is coarse or off
  const cc = mkCanvas(64, 64), cg = cc.getContext('2d'), rg = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.45, 'rgba(0,0,0,.65)'); rg.addColorStop(0.8, 'rgba(0,0,0,.15)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  cg.fillStyle = rg; cg.fillRect(0, 0, 64, 64);
  const csG = new THREE.PlaneGeometry(1, 1); csG.rotateX(-Math.PI / 2);
  P.cs = new THREE.InstancedMesh(csG, new THREE.MeshBasicMaterial({ map: toTex(cc, { clamp: true, linear: true }), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), MAXC);
  P.cs.frustumCulled = false; P.cs.renderOrder = 4;
  for (let i = 0; i < MAXC; i++) P.cs.setMatrixAt(i, _m.makeScale(0, 0, 0));
  P.group.add(P.cs);
  scene.add(P.group);
  P.visor.castShadow = false;
  return P;
}
// One character's pose into the instance buffers.
const _fr = new THREE.Matrix4(), _up = new THREE.Matrix4(), _aim = new THREE.Matrix4(), _hd = new THREE.Matrix4(), _leg = new THREE.Matrix4();
function setPart(im, i, frame, ox, oy, oz, rx, ry, rz, py, sx, sy, sz) {
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  _m.compose(_v.set(ox, oy, oz), _q, _s.set(1, 1, 1));
  if (py) _m.multiply(_m3.makeTranslation(0, py, 0));
  if (sx != null) _m.multiply(_m3.makeScale(sx, sy, sz));
  _m2.multiplyMatrices(frame, _m);
  im.setMatrixAt(i, _m2);
  return _m2;
}
const LEGS = [['thighL', 'shinL', 'bootL', -0.1, 0], ['thighR', 'shinR', 'bootR', 0.1, Math.PI]];
function poseCharacter(P, i, c, frames) {
  const hide = !c.visible || c.fade <= 0.01;
  if (hide) { P.list.forEach((im) => im.setMatrixAt(i, _m.makeScale(0, 0, 0))); return; }
  const sc = c.fade;
  _fr.compose(_v.set(c.pos.x, c.pos.y, c.pos.z), _q.setFromAxisAngle(YAXIS, c.yaw), _s.set(sc, sc, sc));
  const cr = c.crouchK, run = c.runK, ph = c.phase;
  const pel = lerp(0.95, 0.64, cr) + Math.abs(Math.sin(ph)) * 0.035 * run;
  _up.copy(_fr).multiply(_m3.makeTranslation(0, pel, 0));
  // legs: hip, knee, a flat boot
  LEGS.forEach(([th, sh, bo, ox, off]) => {
    const lp = ph + off, sw = Math.sin(lp) * 0.75 * run, kn = Math.max(0, -Math.cos(lp)) * 1.0 * run;
    const t0 = cr * 1.15 + sw + (c.air ? 0.55 : 0), k0 = -(cr * 1.95 + kn) - (c.air ? 0.85 : 0);
    const m = setPart(P[th], i, _up, ox, -0.06, 0, t0, 0, 0, -0.215);
    _leg.copy(m).multiply(_m3.makeTranslation(0, -0.215, 0));
    _e.set(k0, 0, 0); _q.setFromEuler(_e); _m.compose(_v.set(0, 0, 0), _q, _s.set(1, 1, 1)); _leg.multiply(_m);
    setPart(P[sh], i, _leg, 0, -0.21, 0, 0, 0, 0, 0);
    setPart(P[bo], i, _leg, 0, -0.44, -0.06, -k0 - t0, 0, 0, 0);
  });
  setPart(P.hips, i, _up, 0, 0, 0, 0, 0, 0, 0);
  // a hit rocks the body back and twists it; standing still, the chest rises and falls
  const fk = c.flinchK || 0, br = run < 0.2 && !c.tagged ? Math.sin(R3.time * 1.7 + i * 1.3) * 0.012 : 0;
  const lean = 0.12 * run + cr * 0.32 + (c.tagged ? -0.1 : 0) - fk * 0.22 + br;
  _e.set(-lean, (c.twist || 0) + fk * 0.28 * (c.flinchSide || 1), 0); _q.setFromEuler(_e); _m.compose(_v.set(0, 0.06, 0), _q, _s.set(1, 1, 1)); _up.multiply(_m);
  setPart(P.torso, i, _up, 0, 0.27, 0, 0, 0, 0, 0);
  setPart(P.pack, i, _up, 0, 0.3, 0.19, 0, 0, 0, 0);
  setPart(P.rig, i, _up, 0, 0.3, -0.13, 0.05, 0, 0, 0);
  // head and mask
  const pitch = c.tagged ? -0.25 : clamp(c.pitch, -0.9, 0.9);
  _hd.copy(_up).multiply(_m3.makeTranslation(0, 0.66, 0));
  _e.set(pitch * 0.6 - fk * 0.25, c.tagged ? 0 : (c.look || 0), 0, 'YXZ'); _q.setFromEuler(_e); _m.compose(_v.set(0, 0, 0), _q, _s.set(1, 1, 1)); _hd.multiply(_m); _e.order = 'XYZ';
  setPart(P.head, i, _hd, 0, 0, 0, 0, 0, 0, 0);
  setPart(P.helmet, i, _hd, 0, 0.02, 0.01, -0.1, 0, 0, 0);
  setPart(P.mask, i, _hd, 0, -0.02, -0.08, 0, 0, 0, 0);
  setPart(P.visor, i, _hd, 0, 0.02, -0.133, 0, 0, 0, 0);
  // arms and marker: an aim frame at the shoulders, pitched with the aim
  _aim.copy(_up).multiply(_m3.makeTranslation(0, 0.48, 0));
  if (c.tagged) {
    setPart(P.uarmL, i, _aim, -0.27, 0, 0, Math.PI - 0.15, 0, 0.25, -0.15);
    setPart(P.uarmR, i, _aim, 0.27, 0, 0, Math.PI - 0.15, 0, -0.25, -0.15);
    setPart(P.farmL, i, _aim, -0.34, 0.42, 0, Math.PI - 0.05, 0, 0.15, -0.14);
    setPart(P.farmR, i, _aim, 0.34, 0.42, 0, Math.PI - 0.05, 0, -0.15, -0.14);
    setPart(P.gun, i, _aim, 0, 0.78, 0, 0, Math.PI / 2, 0, 0);
  } else {
    const ap = clamp(c.pitch, -1, 1) * 0.85, rec = c.recoilK || 0, rl = c.reloadK || 0;
    _e.set(ap + rec * 0.1, 0, 0); _q.setFromEuler(_e); _m.compose(_v.set(0, 0, 0), _q, _s.set(1, 1, 1)); _aim.multiply(_m);
    setPart(P.uarmR, i, _aim, 0.24, -0.02, -0.02, 0.95, 0, 0.2, -0.15);
    setPart(P.farmR, i, _aim, 0.2, -0.2, -0.2, 1.45, -0.3, 0, -0.13);
    // the free hand comes off the marker for a fist pump after a tag
    const cht = c.cheerT || 0, ck = cht > 0 ? smooth01(Math.min((0.9 - cht) / 0.2, cht / 0.25)) : 0, pump = ck > 0 ? Math.sin(R3.time * 14) * 0.12 * ck : 0;
    setPart(P.uarmL, i, _aim, -0.24, -0.02, -0.02, lerp(1.25 - rl * 0.4, Math.PI - 0.35 + pump, ck), 0, lerp(-0.35, 0.25, ck), -0.15);
    setPart(P.farmL, i, _aim, lerp(-0.1, -0.33, ck), lerp(-0.12, 0.4, ck), lerp(-0.3 + rl * 0.1, 0.02, ck), lerp(1.55 - rl * 0.5, Math.PI - 0.15 + pump, ck), lerp(0.7, 0, ck), lerp(0, 0.12, ck), -0.13);
    setPart(P.gun, i, _aim, 0.1, -0.12 - rl * 0.08, -0.34 + rec * 0.06, rl * 0.5, 0, rl * 0.3, 0);
  }
  if (frames) frames[i] = { up: _up.clone(), head: _hd.clone() };
}

/* ------------------------------------------------------------ spectacle (the shared VFX library) */
// Paint only: a puff of air and paint mist at every rival's marker, a coloured powder cloud where a ball
// lands near you, a Holi-style burst of powder in the tagger's colour on a tag-out, a stadium burst for a
// flag capture and a victory shower of confetti and fireworks over the podium. Loads after the menu is up;
// it adds no lights, so no material ever recompiles.
const VX = { fx: null, state: 0, v: new THREE.Vector3(), n: new THREE.Vector3(), q: -1, red: null };
function vxGround(x, z) { const W = Wd; if (!W) return 0; const cx = toCell(x), cz = toCell(z); if (!inGrid(cx, cz)) return 0; const h = W.G.h[cz * GN + cx]; return h > 50 ? 0 : h; }
function loadVfx() {
  if (VX.state || !R3) return;
  VX.state = 1;
  import('/games/shared/vfx.js').then((m) => {
    try {
      VX.fx = m.createVFX(R3.renderer, R3.scene, R3.camera, { quality: Math.max(0, R3.quality), unit: 1, groundY: vxGround, lights: 0, soft: R3.soft, reduced: !!(ARC && ARC.reducedMotion) });
      VX.state = 2; const w = VX.fx.warm(); if (w && w.catch) w.catch(() => {});
    } catch (e) { VX.state = -1; }
  }).catch(() => { VX.state = -1; });
}
const vxOn = (W) => VX.state === 2 && VX.fx && (!W || Wd === W);
function vxTick(dt) {
  if (!vxOn()) return;
  const q = Math.max(0, R3.quality); if (q !== VX.q) { VX.q = q; VX.fx.setQuality(q); }
  const red = !!(ARC && ARC.reducedMotion); if (red !== VX.red) { VX.red = red; VX.fx.setReduced(red); }
  VX.fx.update(dt);
}
const vxNear = (x, y, z, d) => { const p = R3.camera.position; return (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) + (p.z - z) * (p.z - z) < d * d; };
/* ------------------------------------------------------------ real people (the shared people library) */
// From tier 1 up every player is a full rig from the shared people library: real proportions, a face that
// blinks and glances behind the mask, a gait driven by real speed with the feet planted, both hands on the
// marker through the arm aim, a fist pump after a tag, hands up and a slump when tagged out. The kit
// (helmet, mask, visor, chest rig, pack, marker) stays instanced and rides the rig's head, chest and right
// wrist, so it is still one draw per piece for the whole field. Tier 0 and a software renderer keep the
// instanced figures. The library loads after the menu is up.
const HU = { lib: null, state: 0, rigs: [] };
const HEADFIX = new THREE.Matrix4().makeRotationY(Math.PI).premultiply(new THREE.Matrix4().makeTranslation(0, 0.1, 0.012));
const CHESTFIX = new THREE.Matrix4().makeRotationY(Math.PI).premultiply(new THREE.Matrix4().makeTranslation(0, -0.215, 0.005));
const _hv = new THREE.Vector3(), _hf = new THREE.Vector3(), _hr = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hm = new THREE.Matrix4();
const GEAR = ['helmet', 'mask', 'visor', 'rig', 'pack', 'gun'];
function loadPeopleLib() {
  if (HU.state || !R3 || R3.soft) return;
  HU.state = 1;
  import('/games/shared/human.js').then((m) => { HU.lib = m; HU.state = 2; }).catch(() => { HU.state = -1; });
}
const rigsOn = () => HU.state === 2 && R3 && R3.quality >= 1;
function rigFor(W, i, c) {
  let r = HU.rigs[i];
  const key = c.id + ':' + c.team + ':' + (c.isBoss ? 1 : 0) + ':' + c.name;
  if (r && r.key === key) return r;
  if (!r) {
    const q = R3.quality >= 3 ? 3 : 2;
    const h = HU.lib.createHuman({ seed: 900 + i * 53, unit: 1, quality: q, lod: q >= 3 ? 'full' : 'mid', build: i % 3 ? 'athletic' : 'average', hair: 'short' });
    h.group.visible = false; R3.scene.add(h.group);
    r = HU.rigs[i] = { h, key: '', vR: new THREE.Vector3(), vL: new THREE.Vector3(), crouch: false, tagged: false, cheer: false, air: false, hit: 0, pod: false };
  }
  const T = TEAMS[c.team];
  r.h.setOutfit({ top: c.isBoss ? '#5a2a8a' : T.vest, top2: T.trim, sleeves: 'long', bottom: T.pants, legs: 'trousers', shoes: '#1a1b1f', soles: '#44464a', gloves: '#1d2026', number: null });
  r.key = key; r.crouch = r.tagged = r.cheer = r.air = r.pod = false; r.h.stop(); r.h.aim('right', null); r.h.aim('left', null);
  return r;
}
// One player's rig for this frame, and their kit on its bones. Returns false when the rig is not drawn.
function poseRig(W, Pp, i, c, dt, show) {
  const r = rigFor(W, i, c), h = r.h, g = h.group;
  if (!show) { g.visible = false; return false; }
  g.visible = true;
  const sc = c.fade * (c.isBoss ? 1.16 : 1);
  g.position.copy(c.pos); g.rotation.y = c.yaw + Math.PI; g.scale.setScalar(sc);
  const pod = !!(W.podium && W.podium.list.indexOf(c) >= 0);
  // aim frame: where the marker points
  const cp = Math.cos(c.pitch), fx = -Math.sin(c.yaw) * cp, fy = Math.sin(c.pitch), fz = -Math.cos(c.yaw) * cp, rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  if (pod) {
    if (!r.pod) { r.pod = true; h.aim('right', null); h.aim('left', null); h.stop(); }
    if (!h.playing('cheer') && !h.playing('celebrate')) h.play(Math.random() < 0.5 ? 'cheer' : 'celebrate', { speed: 0.9 + Math.random() * 0.2 });
  } else if (c.tagged) {
    // marker up over the head, then the long walk off
    if (!r.tagged) { r.tagged = true; h.play('slump', { intensity: 0.6 }); }
    h.bones.head.getWorldPosition(_hv);
    r.vR.set(_hv.x + rx * 0.15 + fx * 0.15, _hv.y + 1.2, _hv.z + rz * 0.15 + fz * 0.15); r.vL.set(_hv.x - rx * 0.15 + fx * 0.15, _hv.y + 1.2, _hv.z - rz * 0.15 + fz * 0.15);
    h.aim('right', r.vR, { elbow: 0.35 }); h.aim('left', r.vL, { elbow: 0.35 });
  } else {
    r.tagged = false; r.pod = false;
    // both hands on the marker: the right on the grip, tucked toward the chest, the left out under the barrel
    h.bones.shoulderR.getWorldPosition(_hv);
    r.vR.set(_hv.x + fx * 0.5 - rx * 0.16, _hv.y + fy * 0.5 - 0.34, _hv.z + fz * 0.5 - rz * 0.16);
    h.bones.shoulderL.getWorldPosition(_hv);
    r.vL.set(_hv.x + fx * 0.8 + rx * 0.2, _hv.y + fy * 0.8 - 0.1, _hv.z + fz * 0.8 + rz * 0.2);
    const ck = c.cheerT || 0;
    h.aim('right', r.vR, { elbow: 1.45 - (c.reloadK || 0) * 0.3 });
    if (ck > 0) { if (!r.cheer) { r.cheer = true; h.aim('left', null); h.play('fistPump', { side: 'left' }); } }
    else { r.cheer = false; h.aim('left', r.vL, { elbow: 0.55 + (c.reloadK || 0) * 0.6 }); }
  }
  // crouch, the hop of a jump, a flinch when a ball lands
  const cr = c.crouchK > 0.5 && !pod;
  if (cr !== r.crouch) { r.crouch = cr; if (cr) h.play('crouch'); else h.stop('crouch'); }
  if (c.air && !r.air && !pod) h.play('jump', { intensity: 0.6 });
  r.air = c.air;
  if ((c.hitFlash || 0) > 0.95 && r.hit <= 0 && !c.tagged) { h.play('stumble', { intensity: 0.3 }); r.hit = 0.5; }
  r.hit -= dt;
  // eyes on the rival they are fighting, else their own glances
  const T = c.bot && c.bot.vis && c.bot.target && c.bot.target.alive ? c.bot.target : null;
  if (T) h.lookAt(_hf.set(T.pos.x, T.pos.y + 1.55, T.pos.z)); else h.lookAt(null);
  h.setMood(pod ? 1 : c.tagged ? -0.7 : (c.cheerT || 0) > 0 ? 0.9 : 0);
  h.update(dt, { speed: Math.hypot(c.vel.x, c.vel.z) });
  g.updateMatrixWorld(true);
  // the kit rides the bones
  _hm.multiplyMatrices(h.bones.head.matrixWorld, HEADFIX);
  setPart(Pp.helmet, i, _hm, 0, 0.02, 0.01, -0.1, 0, 0, 0);
  setPart(Pp.mask, i, _hm, 0, -0.02, -0.08, 0, 0, 0, 0);
  setPart(Pp.visor, i, _hm, 0, 0.02, -0.133, 0, 0, 0, 0);
  _hm.multiplyMatrices(h.bones.chest.matrixWorld, CHESTFIX);
  setPart(Pp.pack, i, _hm, 0, 0.3, 0.19, 0, 0, 0, 0);
  setPart(Pp.rig, i, _hm, 0, 0.3, -0.13, 0.05, 0, 0, 0);
  // the marker in the right hand, pointing where its owner aims (up over the head when tagged)
  h.bones.fingersR.getWorldPosition(_hv);
  if (c.tagged && !pod) { _e.set(0, c.yaw + Math.PI / 2, 0, 'YXZ'); _q.setFromEuler(_e); _e.order = 'XYZ'; _hm.compose(_hv, _q, _s.set(sc, sc, sc)); }
  else { _e.set(c.pitch + (c.reloadK || 0) * 0.5, c.yaw, (c.reloadK || 0) * 0.3, 'YXZ'); _q.setFromEuler(_e); _e.order = 'XYZ'; _hm.compose(_hv, _q, _s.set(sc, sc, sc)).multiply(_m3.makeTranslation(0, 0.09, -0.08)); }
  Pp.gun.setMatrixAt(i, _hm);
  return true;
}
// Hide the instanced body parts a rig replaces (the kit is placed by poseRig).
function hideBody(Pp, i) {
  for (const im of Pp.list) { if (GEAR.indexOf(im.name) < 0) im.setMatrixAt(i, _m.makeScale(0, 0, 0)); }
}

/* ------------------------------------------------------------ the marker in your hands */
function buildViewModel(gun, team) {
  const G = GUNS[gun], T = TEAMS[team];
  const len = gun === 2 ? 0.52 : gun === 1 ? 0.36 : 0.3;
  const plastic = [
    [new THREE.BoxGeometry(0.072, 0.1, 0.36, 2, 2, 4), M4(0, 0, 0), G.body], [BOX(0.05, 0.026, 0.3), M4(0, 0.063, -0.02), G.acc],
    [BOX(0.042, 0.13, 0.06), M4(0, -0.1, 0.09, 0.32, 0, 0), '#25272d'], [BOX(0.05, 0.05, 0.12), M4(0, -0.062, -0.2), '#25272d'],
    [BOX(0.074, 0.02, 0.2), M4(0, -0.045, -0.02), G.acc], [BOX(0.03, 0.09, 0.05), M4(0, -0.085, -0.22, -0.2, 0, 0), '#25272d']
  ];
  const metal = [
    [new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), M4(0, -0.05, 0.02, 0, Math.PI / 2, Math.PI), '#9aa0a8'], [BOX(0.008, 0.035, 0.012), M4(0, -0.065, 0.025, 0.4, 0, 0), '#c0c4ca'],
    [CYL(0.034, 0.034, 0.17, 16), M4(0, -0.025, 0.265, Math.PI / 2, 0, 0), G.tank], [CYL(0.036, 0.036, 0.025, 16), M4(0, -0.025, 0.36, Math.PI / 2, 0, 0), '#9aa0a8'],
    [CYL(0.016, 0.018, len, 14), M4(0, 0.012, -0.18 - len / 2, Math.PI / 2, 0, 0), '#3a3e46'], [CYL(0.023, 0.023, 0.035, 14), M4(0, 0.012, -0.18 - len + 0.012, Math.PI / 2, 0, 0), G.acc],
    [CYL(0.02, 0.02, 0.04, 10), M4(0, 0.012, -0.17, Math.PI / 2, 0, 0), '#7a8088']
  ];
  if (gun === 0) plastic.push([CYL(0.022, 0.026, 0.07, 12), M4(0, 0.075, -0.02), '#25272d']);
  if (gun === 1) plastic.push([BOX(0.034, 0.16, 0.075), M4(0.058, 0.02, -0.06, 0, 0, 0.6), G.acc], [BOX(0.03, 0.04, 0.05), M4(0, 0.09, 0.05), '#25272d'], [BOX(0.02, 0.03, 0.02), M4(0, 0.09, -0.24), '#25272d']);
  if (gun === 2) { metal.push([CYL(0.026, 0.026, 0.2, 16), M4(0, 0.1, -0.04, Math.PI / 2, 0, 0), '#1b1d22'], [CYL(0.033, 0.026, 0.03, 16), M4(0, 0.1, -0.15, Math.PI / 2, 0, 0), '#1b1d22'], [CYL(0.03, 0.026, 0.025, 16), M4(0, 0.1, 0.07, Math.PI / 2, 0, 0), '#1b1d22']); plastic.push([BOX(0.02, 0.04, 0.03), M4(0, 0.07, -0.04), '#1b1d22'], [BOX(0.03, 0.06, 0.07), M4(0, -0.07, -0.04), G.acc]); }
  const root = new THREE.Group(), gunG = new THREE.Group();
  const body = new THREE.Mesh(mergeParts(plastic), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.18 }));
  const steel = new THREE.Mesh(mergeParts(metal), stdMat({ vertexColors: true, roughness: 0.28, metalness: 0.85 }));
  gunG.add(body, steel);
  if (gun === 0) {
    // paint balls rattling in the clear hopper
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 8, 6), stdMat({ color: T.paint, roughness: 0.25, emissive: new THREE.Color(T.paint), emissiveIntensity: 0.3 }), 16);
    for (let i = 0; i < 16; i++) balls.setMatrixAt(i, M4((hash(i) - 0.5) * 0.07, 0.115 + hash(i + 9) * 0.045, -0.02 + (hash(i + 3) - 0.5) * 0.11));
    gunG.add(balls); gunG.userData.balls = balls;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.068, 20, 14), new THREE.MeshPhysicalMaterial({ color: '#fff6d8', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false }));
    shell.position.set(0, 0.13, -0.02); shell.scale.set(0.95, 0.82, 1.3); gunG.add(shell);
    const lid = new THREE.Mesh(CYL(0.04, 0.045, 0.012, 16), stdMat({ color: G.acc, roughness: 0.4 })); lid.position.set(0, 0.186, -0.02); gunG.add(lid);
  }
  // hands and forearms: gloved fingers wrapped round the grip and the fore-grip, a strip of wrist, rolled sleeves
  const sleeve = stdMat({ color: T.vest, roughness: 0.86 }), glove = stdMat({ vertexColors: true, roughness: 0.62 });
  const seg = (ax, ay, az, bx, by, bz, ra, rb, col) => {
    _v.set(bx - ax, by - ay, bz - az); const l = _v.length(); _v.normalize();
    return [CYL(rb, ra, l, 12), new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), new THREE.Quaternion().setFromUnitVectors(YAXIS, _v), new THREE.Vector3(1, 1, 1)), col];
  };
  const SPH = new THREE.SphereGeometry(1, 12, 8), FING = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
  const gl = '#22252b', gl2 = '#2c3038', sk = SKIN[(team * 3 + 2) % SKIN.length];
  const hands = [
    // right hand round the pistol grip: palm, four curled fingers, thumb over the top, index on the trigger
    [SPH, M4(0.016, -0.1, 0.112, 0.32, 0, 0, 0.038, 0.05, 0.034), gl],
    [FING(0.0115, 0.034), M4(-0.002, -0.084, 0.064, 0.32, 0, Math.PI / 2), gl2], [FING(0.0115, 0.034), M4(-0.002, -0.104, 0.07, 0.32, 0, Math.PI / 2), gl2], [FING(0.011, 0.03), M4(-0.002, -0.123, 0.076, 0.32, 0, Math.PI / 2), gl2],
    [FING(0.0105, 0.042), M4(0.012, -0.052, 0.035, Math.PI / 2 - 0.3, 0, 0), gl2],
    [FING(0.012, 0.04), M4(-0.03, -0.066, 0.1, 0.9, 0, 0.35), gl2],
    seg(0.018, -0.125, 0.14, 0.024, -0.137, 0.17, 0.034, 0.04, gl), seg(0.024, -0.137, 0.17, 0.034, -0.15, 0.2, 0.031, 0.033, sk),
    // left hand cupped under the fore-grip, fingers up its far side, thumb along the near side
    [SPH, M4(-0.004, -0.096, -0.2, 0, 0, -0.25, 0.042, 0.022, 0.056), gl],
    [FING(0.011, 0.032), M4(0.032, -0.07, -0.226, 0, 0, -0.15), gl2], [FING(0.011, 0.034), M4(0.034, -0.07, -0.203, 0, 0, -0.12), gl2], [FING(0.0105, 0.03), M4(0.032, -0.072, -0.18, 0, 0, -0.1), gl2],
    [FING(0.0115, 0.036), M4(-0.033, -0.068, -0.205, 0.2, 0, 0.2), gl2],
    seg(-0.022, -0.108, -0.16, -0.04, -0.122, -0.122, 0.034, 0.039, gl), seg(-0.04, -0.122, -0.122, -0.055, -0.133, -0.092, 0.031, 0.033, sk)
  ];
  const gh = new THREE.Mesh(mergeParts(hands), glove);
  const arms = mergeParts([seg(0.034, -0.15, 0.2, 0.09, -0.215, 0.44, 0.047, 0.056, '#ffffff'), seg(-0.055, -0.133, -0.092, -0.14, -0.205, 0.13, 0.046, 0.055, '#ffffff'),
    [new THREE.TorusGeometry(0.047, 0.009, 6, 14), M4(0.036, -0.152, 0.205, 1.35, 0.25, 0), '#ffffff'], [new THREE.TorusGeometry(0.046, 0.009, 6, 14), M4(-0.057, -0.135, -0.088, 1.25, -0.35, 0), '#ffffff']]);
  const sl = new THREE.Mesh(arms, sleeve);
  gunG.add(gh, sl);
  // muzzle pop
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,255,255,1)'), color: new THREE.Color(T.paint).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.set(0, 0.012, -0.2 - len); flash.visible = false; gunG.add(flash);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, -0.2 - len); gunG.add(muzzle);
  gunG.scale.setScalar(0.82);
  root.add(gunG);
  root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
  return { root, gunG, flash, muzzle, len };
}

function makeBalls(scene) {
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), stdMat({ roughness: 0.2, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 }), 260);
  im.frustumCulled = false; im.count = 0; im.castShadow = false;
  for (let i = 0; i < 260; i++) im.setColorAt(i, _c.set('#ffffff'));
  scene.add(im);
  return im;
}
function makeDrone(scene) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(mergeParts([[BOX(0.5, 0.16, 0.5), M4(0, 0, 0), '#2a2d33'], [BOX(1.3, 0.05, 0.08), M4(0, 0, 0, 0, Math.PI / 4, 0), '#3a3e46'], [BOX(1.3, 0.05, 0.08), M4(0, 0, 0, 0, -Math.PI / 4, 0), '#3a3e46'], [new THREE.SphereGeometry(0.12, 10, 8), M4(0, -0.1, -0.2), '#111111'], [CYL(0.03, 0.03, 0.3, 8), M4(0, -0.12, -0.32, Math.PI / 2, 0, 0), '#444']]), stdMat({ vertexColors: true, roughness: 0.4, metalness: 0.4 }));
  body.castShadow = true;
  const shell = new THREE.Mesh(BOX(0.44, 0.08, 0.44), stdMat({ color: '#ff7a1a', roughness: 0.4 })); shell.position.y = 0.11; g.userData.shell = shell;
  const rotors = [];
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; const r = new THREE.Mesh(CYL(0.24, 0.24, 0.01, 16), new THREE.MeshBasicMaterial({ color: '#cfd6dc', transparent: true, opacity: 0.35, depthWrite: false })); r.position.set(Math.cos(a) * 0.46, 0.05, Math.sin(a) * 0.46); rotors.push(r); g.add(r); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), stdMat({ color: '#ff3a3a', emissive: new THREE.Color('#ff2a2a'), emissiveIntensity: 5 })); lamp.position.set(0, -0.05, 0.26);
  g.add(body, shell, lamp); g.visible = false; scene.add(g);
  return { g, rotors, shell };
}

/* ------------------------------------------------------------ grid queries */
const cw = (c) => (c - GN / 2) * CS;              // cell units (fractional) to world
const inGrid = (x, z) => x >= 0 && z >= 0 && x < GN && z < GN;
// How high a cell stops a body (feet) and a paint ball.
function bodyH(G, x, z) { if (!inGrid(x, z)) return 99; const i = z * GN + x, b = G.block[i]; return b ? 99 : G.h[i]; }
function shotH(G, x, z) {
  if (!inGrid(x, z)) return G.id === 'roof' ? -99 : 99;
  const i = z * GN + x, k = G.kind[i];
  if (k === 'o' && G.id === 'roof') return 2.62;
  if (k === 'x') return 1.02;
  return G.h[i];
}
function walkable(G, x, z) { if (!inGrid(x, z)) return false; const i = z * GN + x; return G.block[i] === 0 && G.kind[i] !== 'c'; }
function groundAt(G, x, z, r, feet) {
  const x0 = toCell(x - r), x1 = toCell(x + r), z0 = toCell(z - r), z1 = toCell(z + r);
  let g = 0;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    if (!inGrid(cx, cz)) continue;
    const h = bodyH(G, cx, cz);
    if (h < 50 && h <= feet + 0.36 && h > g) g = h;
  }
  return g;
}
// Push a circle out of every cell that is taller than the feet can step.
function collide(G, p, r, feet) {
  for (let it = 0; it < 2; it++) {
    const x0 = toCell(p.x - r), x1 = toCell(p.x + r), z0 = toCell(p.z - r), z1 = toCell(p.z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const h = bodyH(G, cx, cz);
      if (h <= feet + 0.36) continue;
      const bx0 = cw(cx), bz0 = cw(cz), bx1 = bx0 + CS, bz1 = bz0 + CS;
      const nx = clamp(p.x, bx0, bx1), nz = clamp(p.z, bz0, bz1);
      let dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        const l = p.x - bx0, rr = bx1 - p.x, t = p.z - bz0, b = bz1 - p.z, m = Math.min(l, rr, t, b);
        if (m === l) p.x = bx0 - r; else if (m === rr) p.x = bx1 + r; else if (m === t) p.z = bz0 - r; else p.z = bz1 + r;
      } else { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
    }
  }
}
// Line of sight through the grid at the heights along the line.
function clearLine(G, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.45));
  for (let k = 1; k < n; k++) {
    const t = k / n, x = ax + dx * t, z = az + dz * t, y = ay + dy * t;
    const cx = toCell(x), cz = toCell(z);
    if (!inGrid(cx, cz)) { if (G.id === 'roof') continue; return false; }
    if (shotH(G, cx, cz) > y) return false;
  }
  return true;
}
function walkLine(G, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.5));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    for (const [ox, oz] of [[0.42, 0], [-0.42, 0], [0, 0.42], [0, -0.42]]) if (!walkable(G, toCell(ax + dx * t + ox), toCell(az + dz * t + oz))) return false;
  }
  return true;
}
// A* over walkable cells, eight ways without cutting corners.
function findPath(G, sx, sz, tx, tz) {
  let a = [toCell(sx), toCell(sz)], b = [toCell(tx), toCell(tz)];
  const near = (c) => {
    if (walkable(G, c[0], c[1])) return c;
    for (let r = 1; r < 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (walkable(G, c[0] + dx, c[1] + dz)) return [c[0] + dx, c[1] + dz];
    return null;
  };
  a = near(a); b = near(b);
  if (!a || !b) return null;
  const N = GN * GN, si = a[1] * GN + a[0], ti = b[1] * GN + b[0];
  if (si === ti) return [[tx, tz]];
  const gS = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [si]; gS[si] = 0;
  const hf = (i) => { const x = i % GN, z = (i / GN) | 0; return Math.hypot(x - b[0], z - b[1]); };
  let guard = 0;
  while (open.length && guard++ < 900) {
    let bi = 0, bf = 1e9;
    for (let k = 0; k < open.length; k++) { const f = gS[open[k]] + hf(open[k]); if (f < bf) { bf = f; bi = k; } }
    const cur = open[bi]; open.splice(bi, 1);
    if (cur === ti) break;
    closed[cur] = 1;
    const x = cur % GN, z = (cur / GN) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (!walkable(G, nx, nz)) continue;
      if (dx && dz && (!walkable(G, x + dx, z) || !walkable(G, x, z + dz))) continue;
      const ni = nz * GN + nx; if (closed[ni]) continue;
      const g = gS[cur] + (dx && dz ? 1.414 : 1);
      if (g < gS[ni]) { gS[ni] = g; from[ni] = cur; if (open.indexOf(ni) < 0) open.push(ni); }
    }
  }
  if (from[ti] < 0) return null;
  const cells = [];
  for (let i = ti; i !== si && i >= 0; i = from[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => [cw(i % GN + 0.5), cw(((i / GN) | 0) + 0.5)]);
  pts[pts.length - 1] = [tx, tz];
  // string pull
  const out = []; let ax = sx, az = sz, k = 0;
  while (k < pts.length) {
    let j = pts.length - 1;
    while (j > k && !walkLine(G, ax, az, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]); ax = pts[j][0]; az = pts[j][1]; k = j + 1;
  }
  return out;
}
// Floor cells next to something solid: places to take cover.
function coverSpots(G) {
  const out = [];
  for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
    if (!walkable(G, x, z)) continue;
    let low = 0, tall = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (!inGrid(x + dx, z + dz)) continue; const k = G.kind[(z + dz) * GN + x + dx]; if (k === 'c') low++; else if (k === 'b' || k === '#' || k === 'o') tall++; }
    if (low || tall) out.push({ x: cw(x + 0.5), z: cw(z + 0.5), low: !!low && !tall });
  }
  return out;
}
function landmarkName(M, x, z) {
  let best = M.landmarks[0][0], bd = 1e9;
  M.landmarks.forEach(([n, lx, lz]) => { const d = (lx - x) * (lx - x) + (lz - z) * (lz - z); if (d < bd) { bd = d; best = n; } });
  return best;
}
// Closest distance between segments p0-p1 and q0-q1 (squared).
function segSeg2(p0x, p0y, p0z, p1x, p1y, p1z, q0x, q0y, q0z, q1x, q1y, q1z) {
  const ux = p1x - p0x, uy = p1y - p0y, uz = p1z - p0z, vx = q1x - q0x, vy = q1y - q0y, vz = q1z - q0z, wx = p0x - q0x, wy = p0y - q0y, wz = p0z - q0z;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz, d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const D = a * c - b * b;
  let sc, tc;
  if (D < 1e-7) { sc = 0; tc = c > 1e-7 ? e / c : 0; } else { sc = (b * e - c * d) / D; tc = (a * e - b * d) / D; }
  sc = clamp(sc, 0, 1); tc = clamp(tc, 0, 1);
  if (c > 1e-7) tc = clamp((b * sc + e) / c, 0, 1);
  if (a > 1e-7) sc = clamp((b * tc - d) / a, 0, 1);
  const dx = wx + sc * ux - tc * vx, dy = wy + sc * uy - tc * vy, dz = wz + sc * uz - tc * vz;
  segSeg2.s = sc; segSeg2.t = tc;
  return dx * dx + dy * dy + dz * dz;
}

/* ------------------------------------------------------------ the match */
let Wd = null;
let SAVE = { unlocked: 1, best: {} };
function loadSave() { try { const s = JSON.parse(localStorage.getItem('paint-ops.save') || 'null'); if (s && typeof s === 'object') SAVE = Object.assign(SAVE, s); } catch (e) { /* fresh */ } }
function saveGame() { try { localStorage.setItem('paint-ops.save', JSON.stringify(SAVE)); } catch (e) { /* private mode */ } }

function newChar(W, team, name, isPlayer, idx) {
  return {
    id: idx, team, name, isPlayer: !!isPlayer, isBoss: false, hpMax: 100, hp: 100,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, air: false, crouch: false, crouchK: 0, runK: 0, phase: 0,
    gun: isPlayer ? (W.cfg.gun | 0) : (idx * 7 + team) % 3, ammo: GUNS.map((g) => g.mag), reloadT: 0, fireT: 0, burstLeft: 0, burstT: 0, adsK: 0, sprint: false,
    alive: true, tagged: false, taggedT: 0, respawnT: 0, visible: true, fade: 1, regenT: 9, lastHitBy: null, streak: 0, tags: 0, outs: 0, caps: 0, carry: -1,
    recoilK: 0, reloadK: 0, twist: 0, hitFlash: 0, footT: 0, splats: 0, bot: isPlayer ? null : { state: 'roam', target: null, path: null, pathT: 0, goal: null, reactT: 0, seenT: 0, aimYaw: 0, aimPitch: 0, strafeT: 0, strafeDir: 1, coverT: 0, role: 'hunt', thinkT: Math.random() * 0.3, trig: false, trigHit: false, stuckT: 0, lastPos: new THREE.Vector3(), errX: 0, errY: 0, errT: 0, crouchT: 0, slot: idx,
      // a person, not a turret: a better or worse day, a moment of doubt before breaking cover, a flinch when hit
      form: 0.86 + Math.random() * 0.28, settle: 0, ready: false, hesT: 0, nearT: 0, scanT: 0, scanTo: 0, prevCoverT: 0 },
    look: 0, flinchK: 0, cheerT: 0
  };
}
function newWorld(cfg) {
  const mapId = cfg.mode === 'campaign' ? MISSIONS[cfg.mission].map : cfg.map;
  const G = buildGrid(mapId);
  const W = {
    cfg, mode: cfg.mode, mapId, M: MAPS[mapId], G, D: DIFF[cfg.diff] || DIFF.normal, diffIdx: cfg.diff === 'easy' ? 0 : cfg.diff === 'hard' ? 2 : 1,
    chars: [], balls: [], score: [0, 0], t: 0, phase: cfg.attract ? 'play' : 'intro', phaseT: 0, attract: !!cfg.attract,
    feed: [], calls: [], pops: [], intel: [{}, {}], cover: coverSpots(G), flags: [], obj: null, tickets: 0, waveT: 2, over: false, result: null,
    radarT: 0, drone: null, slow: 1, slowT: 0, tagcam: null, final: null, hitMark: 0, hitKill: 0, hurt: [], shake: 0, lastCallT: -9, stats: { shots: 0, hits: 0, tags: 0, outs: 0, caps: 0, heads: 0, bestStreak: 0, objs: 0 },
    flash: 0, lightning: 6 + Math.random() * 6, msg: null, letter: cfg.attract ? 0 : 1
  };
  W.target = cfg.mode === 'ctf' ? 3 : 30;
  W.limit = cfg.mode === 'ctf' ? 480 : cfg.mode === 'splat' ? 420 : 0;
  const nPer = cfg.mode === 'campaign' ? 4 : 5;
  for (let i = 0; i < nPer; i++) W.chars.push(newChar(W, 0, i === 0 ? (cfg.attract ? 'Arjun' : 'You') : SQUAD[i - 1], i === 0 && !cfg.attract, W.chars.length));
  if (cfg.mode !== 'campaign') for (let i = 0; i < 5; i++) W.chars.push(newChar(W, 1, RIVALS[(i + (cfg.seed || 0)) % RIVALS.length], false, W.chars.length));
  W.P = W.chars[0];
  W.chars.forEach((c) => spawnChar(W, c, true));
  // roles: half the squad sticks with you, the rest hunt or play the flag
  W.chars.forEach((c, i) => {
    if (!c.bot) return;
    const k = c.team === 0 ? i : i - 5;
    if (W.mode === 'ctf') c.bot.role = k % 3 === 1 ? 'defend' : 'attack';
    else if (W.mode === 'campaign') c.bot.role = c.team === 0 ? 'follow' : 'hunt';
    else c.bot.role = c.team === 0 && (k === 1 || k === 2) && !W.attract ? 'follow' : 'hunt';
  });
  if (W.mode === 'ctf') W.flags = [0, 1].map((t) => ({ team: t, state: 'home', pos: new THREE.Vector3(cw(G.flags[t][0] + 0.5), 0, cw(G.flags[t][1] + 0.5)), home: new THREE.Vector3(cw(G.flags[t][0] + 0.5), 0, cw(G.flags[t][1] + 0.5)), carrier: null, dropT: 0 }));
  if (W.mode === 'campaign') {
    const Ms = MISSIONS[cfg.mission];
    W.mission = Ms; W.tickets = Ms.tickets + (cfg.diff === 'easy' ? 6 : cfg.diff === 'hard' ? -4 : 0);
    startObjective(W, 0);
  }
  W.introDur = cfg.mode === 'campaign' ? 5.6 : 4.2;
  return W;
}
function spawnPoint(W, c) {
  const list = W.G.spawns[c.team], others = W.chars.filter((o) => o.alive && o.team !== c.team && o !== c);
  let best = null, bs = -1e9;
  list.forEach(([x, z], k) => {
    const px = cw(x + 0.5), pz = cw(z + 0.5);
    let s = Math.random() * 3;
    others.forEach((o) => { const d = Math.hypot(o.pos.x - px, o.pos.z - pz); s += Math.min(d, 30) * 0.3; if (d < 10) s -= 20; });
    W.chars.forEach((o) => { if (o !== c && o.alive && Math.hypot(o.pos.x - px, o.pos.z - pz) < 1.2) s -= 30; });
    if (s > bs) { bs = s; best = [px, pz]; }
  });
  return best || [0, 0];
}
function spawnChar(W, c, first) {
  let p;
  if (W.mode === 'campaign' && c.team === 0 && W.campSpawn) p = W.campSpawn.slice();
  else p = spawnPoint(W, c);
  if (first) {
    const sp = W.G.spawns[c.team], k = W.chars.filter((o) => o.team === c.team).indexOf(c), s = sp[Math.max(0, k) % sp.length];
    p = [cw(s[0] + 0.5) + Math.floor(Math.max(0, k) / sp.length) * 1.1, cw(s[1] + 0.5) + (c.team ? 0.9 : -0.9) * Math.floor(Math.max(0, k) / sp.length)];
  }
  c.pos.set(p[0], 0, p[1]); c.vel.set(0, 0, 0);
  c.yaw = c.team === 0 ? 0 : Math.PI; c.pitch = 0;
  c.hp = c.hpMax; c.alive = true; c.tagged = false; c.visible = true; c.fade = first ? 1 : 0.01; c.regenT = 9;
  c.ammo = GUNS.map((g) => g.mag); c.reloadT = 0; c.fireT = 0.3; c.burstLeft = 0; c.carry = -1; c.streak = 0; c.splats = 0; c.crouch = false;
  c.spawnShield = first ? 0 : 1.6;
  if (c.bot) { c.bot.path = null; c.bot.target = null; c.bot.reactT = 0; c.bot.aimYaw = c.yaw; c.bot.state = 'roam'; }
  if (Wd === W && R3 && R3.S) clearBodySplats(R3.S.decals, c.id);
}

/* ------------------------------------------------------------ objectives */
function objAt(o) { return [cw(o.at[0]), cw(o.at[1])]; }
function startObjective(W, i) {
  const Ms = W.mission;
  if (i >= Ms.objs.length) { finishMatch(W, 0, 'mission'); return; }
  const o = Ms.objs[i];
  W.obj = { i, def: o, prog: 0, count: 0, carried: false, itemPos: o.from ? new THREE.Vector3(cw(o.from[0] + 0.5), 0, cw(o.from[1] + 0.5)) : null, boss: null, t: 0 };
  // the squad respawns near the last objective it took
  if (i > 0) { const prev = Ms.objs[i - 1]; if (prev.at) W.campSpawn = objAt(prev).map((v, k) => v + (k ? 3 : 0)); }
  if (o.t === 'boss') {
    const b = newChar(W, 1, 'Captain Toofan', false, W.chars.length);
    b.isBoss = true; b.hpMax = W.diffIdx === 0 ? 220 : W.diffIdx === 2 ? 340 : 280; b.gun = 1; b.bot.role = 'guard';
    W.chars.push(b); spawnChar(W, b, false);
    const at = objAt(o); b.pos.set(at[0], 0, at[1]); b.fade = 1; b.bot.home = at;
    W.obj.boss = b;
  }
  if (!W.attract && Wd === W && ARC && i > 0) ARC.toast(o.text, 'New objective', 2200);
  if (Wd === W) sfxObjective();
}
function objectiveText(W) {
  if (!W.obj) return '';
  const o = W.obj.def;
  if (o.t === 'tag') return o.text + ' (' + W.obj.count + '/' + o.n + ')';
  if (o.t === 'hold') return o.text + ' (' + Math.round(W.obj.prog / o.time * 100) + '%)';
  if (o.t === 'carry') return W.obj.carried ? 'Carry the spool to the extraction' : o.text;
  return o.text;
}
// Where the objective marker floats.
function objMarker(W) {
  if (!W.obj) return null;
  const o = W.obj.def;
  if (o.t === 'carry') { if (W.obj.carried) return [cw(o.to[0] + 0.5), 1.6, cw(o.to[1] + 0.5), 'Extract']; return [W.obj.itemPos.x, W.obj.itemPos.y + 1.4, W.obj.itemPos.z, 'Spool']; }
  if (o.t === 'boss') { const b = W.obj.boss; return b && b.alive ? [b.pos.x, b.pos.y + 2.5, b.pos.z, 'Captain'] : null; }
  if (o.t === 'tag') return null;
  const a = objAt(o); return [a[0], 1.6, a[1], o.t === 'hold' ? 'Hold' : 'Go'];
}
function updateObjective(W, dt) {
  const ob = W.obj; if (!ob || W.over) return;
  const o = ob.def, P = W.P;
  ob.t += dt;
  const done = () => {
    W.stats.objs++;
    if (o.call) pushCall(W, o.call, true);
    addPop(W, 'OBJECTIVE +500', '#ffd23f'); feel('success', 0.9, 40, [0.5, 0.6, 260]);
    startObjective(W, ob.i + 1);
  };
  if (o.t === 'goto') { const a = objAt(o); if (P.alive && Math.hypot(P.pos.x - a[0], P.pos.z - a[1]) < o.r * CS * 0.6) done(); }
  else if (o.t === 'tag') { if (ob.count >= o.n) done(); }
  else if (o.t === 'hold') {
    const a = objAt(o), R = o.r * CS * 0.6;
    let mine = 0, foes = 0;
    W.chars.forEach((c) => { if (!c.alive) return; const d = Math.hypot(c.pos.x - a[0], c.pos.z - a[1]); if (d < R) { if (c.team === 0) mine += c.isPlayer ? 2 : 1; else foes++; } });
    ob.contested = mine > 0 && foes > 0;
    if (mine && !foes) ob.prog += dt * (P.alive && Math.hypot(P.pos.x - a[0], P.pos.z - a[1]) < R ? 1 : 0.5);
    if (ob.prog >= o.time) done();
  } else if (o.t === 'carry') {
    if (!ob.carried) {
      if (P.alive && Math.hypot(P.pos.x - ob.itemPos.x, P.pos.z - ob.itemPos.z) < 1.4) { ob.carried = true; P.carry = 2; ARC && ARC.toast('Spool grabbed', 'Run it to the extraction', 1500); sfxPickup(); }
    } else {
      if (!P.alive || P.carry !== 2) { ob.carried = false; ob.itemPos.set(P.pos.x, 0, P.pos.z); }
      const tx = cw(o.to[0] + 0.5), tz = cw(o.to[1] + 0.5);
      if (P.alive && Math.hypot(P.pos.x - tx, P.pos.z - tz) < 2.2) { P.carry = -1; ob.carried = false; done(); }
    }
  } else if (o.t === 'boss') { if (ob.boss && !ob.boss.alive) done(); }
  // enemy waves around the objective
  W.waveT -= dt;
  const alive = W.chars.filter((c) => c.team === 1 && c.alive && !c.isBoss).length;
  const want = W.mission.waves.alive[W.diffIdx] + (o.t === 'hold' ? 1 : 0);
  if (W.waveT <= 0 && alive < want) {
    W.waveT = W.mission.waves.spawnEvery * (W.diffIdx === 0 ? 1.3 : W.diffIdx === 2 ? 0.75 : 1);
    let c = W.chars.find((x) => x.team === 1 && !x.alive && !x.isBoss && !x.tagged);
    if (!c && W.chars.length < MAXC - 1) { c = newChar(W, 1, RIVALS[W.chars.length % RIVALS.length], false, W.chars.length); W.chars.push(c); }
    if (c) {
      spawnChar(W, c, false);
      const tgt = objMarker(W) || [P.pos.x, 0, P.pos.z];
      c.bot.role = Math.random() < 0.55 ? 'guard' : 'hunt'; c.bot.home = [tgt[0], tgt[2]];
    }
  }
}

/* ------------------------------------------------------------ events: feed, callouts, pops */
function pushFeed(W, a, b, col, how) { W.feed.unshift({ a, b, col, how, t: 0 }); if (W.feed.length > 5) W.feed.length = 5; }
function pushCall(W, text, force) { if (W.attract) return; if (!force && W.t - W.lastCallT < 2.6) return; W.lastCallT = W.t; W.calls.unshift({ text, t: 0 }); if (W.calls.length > 3) W.calls.length = 3; }
function call(W, kind, who, place) { const L = CALLS[kind]; if (!L || !who) return; pushCall(W, L[(Math.random() * L.length) | 0].replace('{n}', who.name).replace('{p}', place || 'ahead')); }
function addPop(W, text, col) { W.pops.push({ text, col, t: 0 }); if (W.pops.length > 4) W.pops.shift(); }

/* ------------------------------------------------------------ markers and paint */
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function eyeOf(c, out) { return out.set(c.pos.x, c.pos.y + lerp(EYE, EYE_C, c.crouchK), c.pos.z); }
function aimDir(yaw, pitch, out) { const cp = Math.cos(pitch); return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp); }
function spreadOf(c, G) {
  const moving = Math.hypot(c.vel.x, c.vel.z) > 1.2;
  let s = lerp(G.spread, G.ads, c.adsK);
  if (moving) s *= 1.35; if (!c.onGround) s *= 1.8; if (c.crouchK > 0.5) s *= 0.75;
  if (c.sprint) s *= 2;
  return s * Math.PI / 180;
}
function canFire(c) { return c.alive && c.reloadT <= 0 && !c.tagged && (c.swapT || 0) <= 0; }
function startReload(W, c) {
  const G = GUNS[c.gun];
  if (c.reloadT > 0 || c.ammo[c.gun] >= G.mag || !c.alive) return;
  c.reloadT = G.reload; c.burstLeft = 0;
  if (c.isPlayer) sfxReload();
  else if (c.team === 0 && Math.random() < 0.25 && W.chars.some((o) => o.team === 1 && o.alive && o.pos.distanceTo(c.pos) < 20)) call(W, 'reload', c);
}
// One paint ball from c's marker along yaw/pitch, converged on what the aim ray meets.
function shoot(W, c, yaw, pitch) {
  const G = GUNS[c.gun];
  if (c.ammo[c.gun] <= 0) { startReload(W, c); return false; }
  c.ammo[c.gun]--;
  const sp = spreadOf(c, G), a = Math.random() * TAU, m = Math.sqrt(Math.random()) * sp;
  const y2 = yaw + Math.cos(a) * m, p2 = pitch + Math.sin(a) * m;
  aimDir(y2, p2, _f);
  eyeOf(c, _a);
  // start at the marker's muzzle, aimed so it converges on the aim point
  const right = _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const start = _b.copy(_a).addScaledVector(right, c.isPlayer ? 0.16 : 0.14).addScaledVector(aimDir(yaw, pitch, _v3), 0.55);
  start.y -= c.isPlayer ? 0.12 : 0.22;
  const far = _v2.copy(_a).addScaledVector(_f, 26);
  const dir = far.sub(start).normalize();
  // the barrel can sit past a wall the eye is still behind
  if (!clearLine(W.G, _a.x, _a.y, _a.z, start.x, start.y, start.z)) start.copy(_a);
  const col = TEAMS[c.team].paint;
  W.balls.push({ sx: start.x, sz: start.z, x: start.x, y: start.y, z: start.z, px: start.x, py: start.y, pz: start.z, vx: dir.x * G.speed + c.vel.x * 0.3, vy: dir.y * G.speed, vz: dir.z * G.speed + c.vel.z * 0.3, g: G.drop, team: c.team, owner: c, dmg: G.dmg, life: 0, col, gun: c.gun, trail: 0 });
  if (W.balls.length > 250) W.balls.shift();
  c.recoilK = Math.min(1.6, c.recoilK + G.kick * 0.5);
  if (c.isPlayer) { W.stats.shots++; onPlayerShot(W, c, G); }
  else if (Wd === W) sfxShot(c, G, false);
  if (FX && Wd === W) {
    const k = c.isPlayer ? 0.6 : 1;
    for (let i = 0; i < 3; i++) FX.emit('soft', start.x + dir.x * 0.15, start.y + dir.y * 0.15, start.z + dir.z * 0.15, dir.x * 2 + (Math.random() - 0.5), dir.y * 2 + Math.random() * 0.5, dir.z * 2 + (Math.random() - 0.5), 0.35 + Math.random() * 0.2, 0.12 * k, '#dfe6ee', 0.32, -0.4, 2, 3.5);
    FX.emit('add', start.x, start.y, start.z, 0, 0, 0, 0.06, 0.25 * k, col, 0.9, 0, 0, 1.8);
  }
  if (!c.isPlayer && vxOn(W) && vxNear(start.x, start.y, start.z, 30)) VX.fx.muzzle(start, dir, { color: col, size: 0.5 });
  return true;
}
// Trigger logic for every marker: auto, three round burst, single.
function runGun(W, c, dt, held, pressed, yaw, pitch) {
  const G = GUNS[c.gun];
  c.fireT -= dt; c.swapT = Math.max(0, (c.swapT || 0) - dt);
  if (c.reloadT > 0) {
    c.reloadT -= dt;
    if (c.reloadT <= 0) { c.ammo[c.gun] = G.mag; c.reloadT = 0; if (c.isPlayer) sfxReloadDone(); }
    return;
  }
  if (!canFire(c)) return;
  if (G.mode === 'burst' && c.burstLeft > 0) {
    c.burstT -= dt;
    if (c.burstT <= 0) { if (shoot(W, c, yaw, pitch)) { c.burstLeft--; c.burstT = G.gap; } else c.burstLeft = 0; }
    return;
  }
  if (c.ammo[c.gun] <= 0) { if (pressed || held || !c.isPlayer) startReload(W, c); return; }
  if (c.fireT > 0) return;
  if (G.mode === 'auto' && held) { shoot(W, c, yaw, pitch); c.fireT += 1 / G.rate; if (c.fireT < 0) c.fireT = 0; }
  else if (G.mode === 'burst' && (pressed || held)) { if (shoot(W, c, yaw, pitch)) { c.burstLeft = G.burst - 1; c.burstT = G.gap; c.fireT = 1 / G.rate; } }
  else if (G.mode === 'single' && pressed) { shoot(W, c, yaw, pitch); c.fireT = 1 / G.rate; }
}
function stepBalls(W, dt) {
  const G = W.G, live = W.balls;
  for (let i = live.length - 1; i >= 0; i--) {
    const b = live[i];
    let gone = false;
    const sub = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy, b.vz) * dt / 0.45));
    const h = dt / sub;
    for (let s = 0; s < sub && !gone; s++) {
      b.px = b.x; b.py = b.y; b.pz = b.z;
      b.vy -= b.g * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.life += h;
      // people
      for (let k = 0; k < W.chars.length; k++) {
        const c = W.chars[k];
        if (!c.alive || c.team === b.team || c.fade < 0.5) continue;
        const top = c.pos.y + lerp(BODY_H, BODY_HC, c.crouchK);
        if (Math.abs(b.x - c.pos.x) > 2.5 || Math.abs(b.z - c.pos.z) > 2.5) continue;
        const r = (c.isBoss ? 0.46 : 0.36) + 0.04;
        const d2 = segSeg2(b.px, b.py, b.pz, b.x, b.y, b.z, c.pos.x, c.pos.y + 0.25, c.pos.z, c.pos.x, top - 0.2, c.pos.z);
        if (d2 < r * r) {
          const t = segSeg2.s, hx = lerp(b.px, b.x, t), hy = lerp(b.py, b.y, t), hz = lerp(b.pz, b.z, t);
          const head = hy > top - 0.34;
          hitChar(W, c, b.owner, b.dmg * (head ? 1.5 : 1) * (b.drone ? 1 : 1), hx, hy, hz, b.vx, b.vz, head, b.col);
          gone = true; break;
        }
        if (c.bot && d2 < 0.9 && c.bot.nearT <= 0) { c.bot.nearT = 0.6; if (c.team === 0 && !W.attract && Math.random() < 0.15) call(W, 'close', c); }
      }
      if (gone) break;
      // floors, walls, cover
      const cx = toCell(b.x), cz = toCell(b.z);
      const sh = shotH(G, cx, cz);
      if (sh > b.y) {
        let nx = 0, ny = 1, nz = 0, x = b.x, y = b.y, z = b.z;
        const pcx = toCell(b.px), pcz = toCell(b.pz);
        if (pcx !== cx) { nx = pcx < cx ? -1 : 1; ny = 0; x = cw(Math.max(cx, pcx)); }
        else if (pcz !== cz) { nz = pcz < cz ? -1 : 1; ny = 0; z = cw(Math.max(cz, pcz)); }
        else { y = sh; }
        if (ny === 0) { const t = Math.abs(b.x - b.px) > 1e-4 && nx ? (x - b.px) / (b.x - b.px) : Math.abs(b.z - b.pz) > 1e-4 && nz ? (z - b.pz) / (b.z - b.pz) : 1; y = lerp(b.py, b.y, clamp(t, 0, 1)); if (nx) z = lerp(b.pz, b.z, clamp(t, 0, 1)); else x = lerp(b.px, b.x, clamp(t, 0, 1)); }
        const fi = inGrid(pcx, pcz) ? G.h[pcz * GN + pcx] : 0;
        splatWorld(W, x, Math.min(y, sh > 50 ? 9 : sh), z, nx, ny, nz, b.col, 0.55 * splatScale(b), b.owner, b.vx, b.vy, b.vz, fi > 50 ? 0 : fi);
        gone = true; break;
      }
      const over = G.id === 'roof' && (!inGrid(cx, cz) || G.kind[cz * GN + cx] === 'x');
      if (b.y <= 0 && !over) { splatWorld(W, b.x, 0, b.z, 0, 1, 0, b.col, 0.6 * splatScale(b), b.owner, b.vx, b.vy, b.vz, 0); gone = true; break; }
      if (b.life > 2.4 || b.y < -40) { gone = true; break; }
    }
    if (gone) live.splice(i, 1);
  }
}
// A ball that has barely left the barrel leaves a small mark, so a wall at arm's length is not one big blot.
function splatScale(b) { return b.sx == null ? 1 : clamp(Math.hypot(b.x - b.sx, b.z - b.sz) / 5, 0.3, 1); }
function splatWorld(W, x, y, z, nx, ny, nz, col, size, owner, vx, vy, vz, floorY) {
  if (Wd !== W) return;
  const S = R3 && R3.S;
  if (S) {
    const D = S.decals, dens = FX ? FX.density : 0.5;
    addSplat(D, x, y, z, nx, ny, nz, col, size, vx, vy, vz, 0);
    if (vx != null) {
      // droplets thrown off the impact land a moment later, mostly ahead of the ball's line
      _tn.set(nx, ny, nz); _t1.set(Math.abs(ny) > 0.9 ? 1 : 0, Math.abs(ny) > 0.9 ? 0 : 1, 0).cross(_tn).normalize(); _t2.crossVectors(_tn, _t1);
      const sp = Math.hypot(vx, vy, vz) || 1, fa = (vx * _t1.x + vy * _t1.y + vz * _t1.z) / sp, fb = (vx * _t2.x + vy * _t2.y + vz * _t2.z) / sp;
      const n = Math.round(3 * dens);
      for (let k = 0; k < n; k++) {
        const r = size * (0.5 + Math.random() * 1.1), a = Math.random() * TAU;
        const ox = Math.cos(a) * r + fa * r * 0.9, oy = Math.sin(a) * r + fb * r * 0.9;
        addSplat(D, x + _t1.x * ox + _t2.x * oy, y + _t1.y * ox + _t2.y * oy, z + _t1.z * ox + _t2.z * oy, nx, ny, nz, col, size * (0.12 + Math.random() * 0.14), vx * 0.2, vy * 0.2, vz * 0.2, 0.04 + Math.random() * 0.14);
      }
      // on a wall, paint runs: one or two trails creep down under their own weight
      if (Math.abs(ny) < 0.3 && dens >= 0.7 && floorY != null) {
        const runs = Math.random() < 0.55 ? 2 : 1;
        for (let k = 0; k < runs; k++) {
          const off = (Math.random() - 0.5) * size * 0.7, top = y - size * (0.05 + Math.random() * 0.15);
          const room = top - floorY - 0.03; if (room < 0.1) continue;
          addDrip(D, x + _t1.x * off, top, z + _t1.z * off, nx, nz, col, size * (0.07 + Math.random() * 0.05), Math.min(room, size * (0.5 + Math.random() * 1.2)), 0.15 + Math.random() * 0.35);
        }
      }
    }
  }
  if (FX) {
    const n = Math.round(6 * FX.density) + 2;
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 3;
      FX.emit('soft', x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, nx * sp + (Math.random() - 0.5) * 3, ny * sp + Math.random() * 2.5, nz * sp + (Math.random() - 0.5) * 3, 0.45 + Math.random() * 0.3, 0.05 + Math.random() * 0.05, col, 1, 9.8, 0.5, 1, 0.02);
    }
    FX.emit('soft', x + nx * 0.08, y + ny * 0.08, z + nz * 0.08, nx * 0.4, 0.3, nz * 0.4, 0.5, 0.35, col, 0.35, 0, 2, 2.2);
  }
  if (owner && owner.isPlayer) sfxSplat(x, y, z, 0.6); else sfxSplat(x, y, z, 0.35);
  // a little cloud of coloured powder hangs where the ball burst (close to you only, it is a lot of paint)
  if (vxOn(W) && vxNear(x, y, z, owner && owner.isPlayer ? 40 : 14)) VX.fx.impact(VX.v.set(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05), VX.n.set(nx, ny, nz), { kind: 'powder', color: col, size: 0.28 });
}
function hitChar(W, c, shooter, dmg, x, y, z, vx, vz, head, col) {
  if (!c.alive) return;
  if (c.spawnShield > 0) dmg *= 0.25;
  if (c.isPlayer || (c.team === 0 && W.mode === 'campaign')) dmg *= W.D.dmgIn;
  if (c.isPlayer && W.attract) dmg = 0;
  c.hp -= dmg; c.regenT = 0; c.lastHitBy = shooter; c.hitFlash = 1;
  if (Wd === W && R3 && R3.S) addBodySplat(R3.S.decals, c, x, y, z, vx, vz, col);
  if (FX && Wd === W) {
    const n = Math.round(10 * FX.density) + 3, sp = Math.hypot(vx, vz) || 1;
    for (let i = 0; i < n; i++) FX.emit('soft', x, y, z, vx / sp * -2 + (Math.random() - 0.5) * 4, Math.random() * 3, vz / sp * -2 + (Math.random() - 0.5) * 4, 0.5 + Math.random() * 0.3, 0.05 + Math.random() * 0.06, col, 1, 9.8, 0.4, 1, 0.02);
    FX.emit('add', x, y, z, 0, 0.3, 0, 0.12, 0.6, col, 0.6, 0, 0, 2);
  }
  if (shooter && shooter.isPlayer) { W.stats.hits++; W.hitMark = 1; if (head) { W.stats.heads++; W.hitHead = 1; } sfxHitMark(head); }
  if (c.isPlayer) {
    const a = Math.atan2(-(shooter ? shooter.pos.x - c.pos.x : vx), -(shooter ? shooter.pos.z - c.pos.z : vz));
    W.hurt.push({ a, t: 0 }); if (W.hurt.length > 4) W.hurt.shift();
    W.shake = Math.min(1, W.shake + dmg / 60);
    W.hurtK = Math.min(1, (W.hurtK || 0) + dmg / 70);
    sfxHurt();
    feel('hit', clamp(dmg / 55, 0.3, 1), Math.round(clamp(dmg * 1.2, 12, 70)), [clamp(dmg / 100, 0.15, 1), clamp(dmg / 160, 0.1, 0.6), 120 + dmg * 2]);
  }
  if (c.bot && shooter && c.alive) {
    c.bot.threat = shooter; c.bot.threatT = 2.5; if (!c.bot.target) { c.bot.target = shooter; c.bot.reactT = Math.max(c.bot.reactT, W.D.react * 0.6); }
    // a hit knocks the aim off and costs a beat
    c.bot.errX += (Math.random() - 0.5) * 0.22; c.bot.reactT = Math.max(c.bot.reactT, 0.1 + Math.random() * 0.15); c.bot.settle = Math.max(c.bot.settle, 0.5);
  }
  c.flinchK = 1; c.flinchSide = Math.random() < 0.5 ? -1 : 1;
  if (c.hp <= 0) tagOut(W, c, shooter, head);
}
function tagOut(W, c, shooter, head) {
  c.hp = 0; c.alive = false; c.tagged = true; c.taggedT = 0; c.outs++; c.streak = 0;
  c.respawnT = c.isBoss ? 1e9 : (W.mode === 'campaign' ? 4.2 : 4.6);
  if (c.carry >= 0 && c.carry < 2 && W.flags.length) { const f = W.flags[c.carry]; f.state = 'dropped'; f.carrier = null; f.pos.set(c.pos.x, 0, c.pos.z); f.dropT = 0; pushFeed(W, c.name, 'dropped the flag', TEAMS[c.team].ui, ''); }
  if (c.carry === 2 && W.obj) { W.obj.carried = false; W.obj.itemPos.set(c.pos.x, 0, c.pos.z); }
  c.carry = -1;
  const s = shooter;
  if (s) {
    s.tags++; s.streak++;
    if (s.isPlayer) {
      W.stats.tags++; W.stats.bestStreak = Math.max(W.stats.bestStreak, s.streak); W.hitKill = 1;
      addPop(W, head ? 'VISOR SPLAT +150' : 'TAG +100', TEAMS[s.team].ui);
      sfxTag();
      feel('tap', head ? 1 : 0.8, 22, [0.5, 0.3, 140]);
      if (s.streak === 3) { W.radarT = 12; addPop(W, 'RADAR PING', '#38e1ff'); feel('boost', 0.8, 30, [0.3, 0.7, 300]); ARC && ARC.toast('Radar ping', 'Rivals show on your minimap', 1600); sfxStreak(); }
      if (s.streak === 5) { launchDrone(W, s); addPop(W, 'PAINT DRONE', '#ffd23f'); feel('boost', 1, 40, [0.3, 0.8, 400]); ARC && ARC.toast('Paint drone launched', 'It hunts rivals for you', 1700); sfxStreak(); }
      if (Math.random() < 0.4) call(W, 'nice', W.chars.find((o) => o.team === 0 && o.bot && o.alive), '');
      else if (c.bot && Math.random() < 0.3) call(W, 'rivalOut', c);
    } else if (s.bot) {
      // a fist pump, and the squad hears about it
      if (Math.random() < 0.65) s.cheerT = 0.9;
      if (s.team === 0 && !W.attract && Math.random() < 0.35) call(W, 'got', s);
    }
  }
  if (c.isPlayer) { W.stats.outs++; startTagCam(W, c, s); }
  else if (c.team === 0 && Math.random() < 0.5) call(W, 'down', c);
  pushFeed(W, s ? s.name : 'Paint', c.name, s ? TEAMS[s.team].ui : '#fff', head ? 'visor' : GUNS[s ? s.gun : 0].name);
  if (W.mode === 'splat' && s) W.score[s.team]++;
  if (W.mode === 'campaign') {
    if (c.team === 0) { W.tickets--; if (W.tickets <= 0 && !W.over) finishMatch(W, 1, 'tickets', c); }
    else if (W.obj && W.obj.def.t === 'tag') W.obj.count++;
  }
  if (FX && Wd === W) for (let i = 0; i < 16 * FX.density; i++) FX.emit('soft', c.pos.x, c.pos.y + 1 + Math.random(), c.pos.z, (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5, 0.7, 0.07, s ? TEAMS[s.team].paint : '#fff', 1, 9.8, 0.4, 1, 0.02);
  // tagged out: a Holi burst, a cloud of the tagger's colour round the player and a ring of it on the floor
  if (vxOn(W) && !(c.isPlayer && R3 && R3.firstPerson)) {
    const tc = s ? TEAMS[s.team].paint : '#ffd23f';
    // sized so the cloud hangs round the tagged player and thins in a second or two, never a wall across the field
    VX.fx.impact(VX.v.set(c.pos.x, c.pos.y + 1.1, c.pos.z), VX.n.set(0, 1, 0), { kind: 'powder', color: tc, size: 1.05 });
    VX.fx.impact(VX.v.set(c.pos.x, c.pos.y + 0.6, c.pos.z), VX.n.set(0, 1, 0), { kind: 'powder', size: 0.7 });
    VX.fx.ring(VX.v.set(c.pos.x, c.pos.y + 0.03, c.pos.z), tc, { size: 1.4, kind: 'shock' });
  }
  if (!W.over && W.mode === 'splat' && s && W.score[s.team] >= W.target) finishMatch(W, s.team, 'score', c);
}
function addBodySplat(D, c, x, y, z, vx, vz, col) {
  const i = D.bn % D.BMAX; D.bn++;
  const lx = x - c.pos.x, lz = z - c.pos.z;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  // into the character's own frame (yaw only)
  const ux = cy * lx - sy * lz, uz = sy * lx + cy * lz;
  const top = lerp(BODY_H, BODY_HC, c.crouchK);
  const ly = y - c.pos.y;
  let part = ly > top - 0.34 ? 'head' : ly > lerp(0.95, 0.64, c.crouchK) ? 'torso' : 'legs';
  const ang = Math.atan2(ux, uz);
  D.bodyList[i] = { cid: c.id, part, ang, h: ly, rot: Math.random() * TAU, s: 0.22 + Math.random() * 0.12, col: new THREE.Color(col) };
  D.body.setColorAt(i, D.bodyList[i].col); if (D.body.instanceColor) D.body.instanceColor.needsUpdate = true;
  c.splats++;
}
function clearBodySplats(D, cid) { for (let i = 0; i < D.BMAX; i++) if (D.bodyList[i] && D.bodyList[i].cid === cid) D.bodyList[i] = null; }

/* ------------------------------------------------------------ bodies */
function moveBody(W, c, wx, wz, speed, dt, jump) {
  const G = W.G, k = c.onGround ? 11 : 2.2;
  const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
  c.vel.x = damp(c.vel.x, wx * speed, k, dt); c.vel.z = damp(c.vel.z, wz * speed, k, dt);
  if (jump && c.onGround) { c.vel.y = 5.7; c.onGround = false; c.air = true; if (c.isPlayer) sfxJump(); }
  c.vel.y -= 17 * dt;
  const ox = c.pos.x, oz = c.pos.z;
  c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
  collide(G, c.pos, RAD, c.pos.y);
  // bodies do not walk through each other
  for (let i = 0; i < W.chars.length; i++) {
    const o = W.chars[i]; if (o === c || !o.alive || !c.alive || o.fade < 0.5) continue;
    const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = RAD * 2;
    if (d < m && d > 1e-4 && Math.abs(c.pos.y - o.pos.y) < 1.4) { const push = (m - d) * (o.isPlayer ? 1 : 0.5); c.pos.x += dx / d * push; c.pos.z += dz / d * push; }
  }
  collide(G, c.pos, RAD, c.pos.y);
  // keep inside the field
  c.pos.x = clamp(c.pos.x, -HALFW + 0.5, HALFW - 0.5); c.pos.z = clamp(c.pos.z, -HALFW + 0.5, HALFW - 0.5);
  c.pos.y += c.vel.y * dt;
  const g = groundAt(G, c.pos.x, c.pos.z, RAD * 0.7, c.pos.y);
  if (c.pos.y <= g) {
    if (!c.onGround && c.vel.y < -4 && c.isPlayer) { W.land = Math.min(1, -c.vel.y / 9); sfxLand(); }
    if (!c.onGround && c.vel.y < -3.5) footPuff(W, c, 5);
    c.pos.y = g; c.vel.y = 0; c.onGround = true; c.air = false;
  } else if (c.pos.y > g + 0.05) { c.onGround = false; if (c.vel.y < -1.5) c.air = true; }
  // a body walking off a crate steps down instead of floating
  if (c.onGround && c.pos.y > g + 0.01) c.pos.y = g;
  const moved = Math.hypot(c.pos.x - ox, c.pos.z - oz) / Math.max(dt, 1e-4);
  c.runK = damp(c.runK, clamp(moved / 4.5, 0, 1.25), 10, dt);
  // stride lengthens with speed (about 1 m crouched, 1.5 m at a jog, 1.8 m flat out), so the feet keep pace with the ground
  c.phase += moved * dt * Math.PI / (0.6 + 0.2 * moved);
  c.crouchK = damp(c.crouchK, c.crouch ? 1 : 0, 12, dt);
  if (c.onGround && moved > 1) { c.footT -= moved * dt; if (c.footT <= 0) { c.footT = c.sprint ? 1.55 : 1.25; if (Wd === W) { sfxStep(c, moved); if (moved > 3.2) footPuff(W, c, 2); } } }
  if (W.mode === 'ctf' || (W.obj && W.obj.carried)) { /* carriers are a touch slower, handled by speed */ }
}
// Each footfall kicks a little dust off the mill floor or the fort's sand (it rises a hand's width and settles),
// or a splash off a wet roof.
function footPuff(W, c, n) {
  if (Wd !== W || !FX || !R3 || R3.quality < 1 || (c.isPlayer && R3.firstPerson)) return;
  const L = W.M.look, wet = !!L.rain;
  n = Math.round(n * FX.density);
  for (let k = 0; k < n; k++) {
    const x = c.pos.x + (Math.random() - 0.5) * 0.35, z = c.pos.z + (Math.random() - 0.5) * 0.35;
    if (wet) FX.emit('soft', x, c.pos.y + 0.03, z, (Math.random() - 0.5) * 1.2, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2, 0.35, 0.05, '#cfdbe6', 0.45, 9.8, 0.4, 1, c.pos.y + 0.02);
    else FX.emit('soft', x, c.pos.y + 0.06, z, (Math.random() - 0.5) * 0.7 - c.vel.x * 0.05, 0.25 + Math.random() * 0.35, (Math.random() - 0.5) * 0.7 - c.vel.z * 0.05, 1 + Math.random() * 0.7, 0.16 + Math.random() * 0.1, W.mapId === 'fort' ? '#d9b68c' : '#9c8c7a', 0.22, 0.35, 2.4, 2.6, c.pos.y + 0.02);
  }
}
function aliveEnemies(W, team) { return W.chars.filter((o) => o.alive && o.team !== team); }

/* ------------------------------------------------------------ the player */
function stepPlayer(W, c, dt, I) {
  const G = GUNS[c.gun];
  if (!c.alive || W.phase !== 'play' || W.over) { c.adsK = damp(c.adsK, 0, 10, dt); return; }
  c.yaw -= I.lx; c.pitch = clamp(c.pitch - I.ly, -1.4, 1.4);
  if (I.gunTo >= 0 && I.gunTo !== c.gun) switchGun(W, c, I.gunTo);
  if (I.nextGun) switchGun(W, c, (c.gun + 1) % 3);
  if (I.reloadHit) startReload(W, c);
  c.crouch = I.crouch;
  const wantAds = I.aim && c.reloadT <= 0;
  c.adsK = damp(c.adsK, wantAds ? 1 : 0, 14, dt);
  const fw = -I.mz, st = I.mx;
  c.sprint = I.sprint && fw > 0.5 && !wantAds && !I.fire && c.onGround && !c.crouch;
  if (c.sprint && c.reloadT > 0) c.sprint = false;
  let speed = c.sprint ? 7.0 : 4.8;
  if (c.crouch) speed = 2.6; if (c.adsK > 0.5) speed *= 0.62; if (c.carry >= 0) speed *= 0.9;
  const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
  const wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
  if (I.jumpHit && c.crouch) { c.crouch = false; I.crouchOff = true; }
  moveBody(W, c, wx, wz, speed, dt, I.jumpHit);
  runGun(W, c, dt, I.fire && !c.sprint, I.fireHit && !c.sprint, c.yaw, c.pitch);
  c.reloadK = damp(c.reloadK, c.reloadT > 0 ? 1 : 0, 10, dt);
  c.recoilK = damp(c.recoilK, 0, 9, dt);
}
function switchGun(W, c, g) {
  if (g === c.gun || g < 0 || g > 2) return;
  c.gun = g; c.reloadT = 0; c.burstLeft = 0; c.swapT = 0.42; c.fireT = Math.max(c.fireT, 0.2);
  if (c.isPlayer) { sfxSwap(); W.swapT = 0.42; if (ARC) ARC.toast(GUNS[g].name, GUNS[g].kind + ' marker', 900); }
}

/* ------------------------------------------------------------ the bots */
function prefDist(g) { return g === 2 ? 26 : g === 1 ? 16 : 11; }
function botThink(W, c) {
  const B = c.bot, D = W.D;
  eyeOf(c, _a);
  // what can I see
  let best = null, bs = 1e9;
  const fwx = -Math.sin(B.aimYaw), fwz = -Math.cos(B.aimYaw);
  for (const o of W.chars) {
    if (!o.alive || o.team === c.team || o.fade < 0.6) continue;
    const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 52) continue;
    const facing = (dx * fwx + dz * fwz) / Math.max(d, 0.01);
    const threat = B.threat === o && B.threatT > 0;
    if (facing < 0.15 && d > 7 && !threat) continue;
    const ty = o.pos.y + lerp(1.3, 0.95, o.crouchK);
    if (!clearLine(W.G, _a.x, _a.y, _a.z, o.pos.x, ty, o.pos.z)) {
      // a crouched body behind low cover still shows its head
      if (!clearLine(W.G, _a.x, _a.y, _a.z, o.pos.x, o.pos.y + lerp(1.62, 1.12, o.crouchK), o.pos.z)) continue;
    }
    let s = d - (threat ? 12 : 0) - (o.carry >= 0 ? 10 : 0) + (o.isPlayer && W.diffIdx === 0 ? 6 : 0);
    if (s < bs) { bs = s; best = o; }
  }
  if (best) {
    // seeing someone is not shooting them: human reaction time, slower on an off day, quicker to re-find a face already seen
    if (B.target !== best || !B.vis) { B.reactT = Math.max(0.16, D.react * (0.7 + Math.random() * 0.6) * (B.target === best ? 0.4 : 1) / B.form); B.ready = false; }
    B.target = best; B.vis = true; B.lastSeen = [best.pos.x, best.pos.z]; B.lostT = 0;
    const known = W.intel[c.team][best.id];
    if (!known || W.t - known.t > 4) {
      if (c.team === 0 && !W.attract && best.team === 1 && Math.random() < 0.5) call(W, 'spot', c, landmarkName(W.M, best.pos.x, best.pos.z));
    }
    W.intel[c.team][best.id] = { x: best.pos.x, z: best.pos.z, t: W.t };
  } else {
    B.vis = false;
    if (B.target && (!B.target.alive || (B.lostT = (B.lostT || 0) + 0.25) > 3.5)) B.target = null;
  }
  // where to go
  let goal = null, mode = 'move';
  const T = B.target, dist = T ? Math.hypot(T.pos.x - c.pos.x, T.pos.z - c.pos.z) : 0;
  if (T && B.vis && W.mode !== 'ctf' || (T && B.vis && W.mode === 'ctf' && !(c.carry >= 0))) {
    const needCover = (c.hp < 55 && Math.random() < D.cover) || (c.reloadT > 0 && Math.random() < D.cover * 0.7);
    if (B.mode === 'cover' && B.coverT > 0) { goal = B.goal; mode = 'cover'; }
    else if (needCover) {
      const spot = pickCover(W, c, T);
      if (spot) { goal = [spot.x, spot.z]; mode = 'cover'; B.coverT = 2.2 + Math.random() * 1.8; B.coverLow = spot.low; }
    }
    if (!goal && B.mode === 'flank' && B.flankT > 0) { goal = B.goal; mode = 'flank'; }
    if (!goal && Math.random() < D.flank * 0.12 && dist > 9) {
      const px = -(T.pos.z - c.pos.z) / dist, pz = (T.pos.x - c.pos.x) / dist, sd = Math.random() < 0.5 ? 1 : -1;
      for (const k of [sd, -sd]) {
        const gx = T.pos.x + px * 9 * k - (T.pos.x - c.pos.x) / dist * 3, gz = T.pos.z + pz * 9 * k - (T.pos.z - c.pos.z) / dist * 3;
        if (walkable(W.G, toCell(gx), toCell(gz))) { goal = [gx, gz]; mode = 'flank'; B.flankT = 4 + Math.random() * 2; break; }
      }
    }
    if (!goal) {
      mode = 'fight';
      const pd = prefDist(c.gun);
      if (dist > pd + 6) goal = [T.pos.x, T.pos.z];
      else if (dist < pd - 5) { const ax = c.pos.x - (T.pos.x - c.pos.x) / dist * 4, az = c.pos.z - (T.pos.z - c.pos.z) / dist * 4; if (walkable(W.G, toCell(ax), toCell(az))) goal = [ax, az]; }
    }
  }
  if (!goal && mode !== 'fight') {
    mode = 'move';
    const P = W.P;
    if (W.mode === 'ctf') goal = ctfGoal(W, c);
    else if (B.role === 'follow' && P.alive && !P.isBot) {
      const k = (c.id % 4) - 1.5, back = 3.2 + Math.abs(k) * 0.9;
      const gx = P.pos.x + Math.sin(P.yaw) * back + Math.cos(P.yaw) * k * 1.6, gz = P.pos.z + Math.cos(P.yaw) * back - Math.sin(P.yaw) * k * 1.6;
      const dP = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      if (dP > 4.5) goal = walkable(W.G, toCell(gx), toCell(gz)) ? [gx, gz] : [P.pos.x, P.pos.z];
      if (dP > 30 && W.mode === 'campaign' && !B.followCalled) { B.followCalled = true; call(W, 'follow', c); }
    } else if (B.role === 'guard' && B.home) {
      const near = W.chars.find((o) => o.alive && o.team !== c.team && Math.hypot(o.pos.x - B.home[0], o.pos.z - B.home[1]) < 18);
      if (near && !c.isBoss) goal = [near.pos.x, near.pos.z];
      else if (!B.goal || Math.hypot(B.goal[0] - c.pos.x, B.goal[1] - c.pos.z) < 1.2 || Math.random() < 0.02) { const a = Math.random() * TAU, r = Math.random() * (c.isBoss ? 3 : 6); goal = [B.home[0] + Math.cos(a) * r, B.home[1] + Math.sin(a) * r]; if (!walkable(W.G, toCell(goal[0]), toCell(goal[1]))) goal = B.home.slice(); }
      else goal = B.goal;
    } else {
      // hunt: the freshest sighting the team has, else sweep the far half
      let tgt = null, tt = -1;
      Object.keys(W.intel[c.team]).forEach((id) => { const it = W.intel[c.team][id], o = W.chars[id]; if (o && o.alive && W.t - it.t < 8 && it.t > tt) { tt = it.t; tgt = [it.x, it.z]; } });
      if (W.mode === 'campaign' && c.team === 1 && W.P.alive && Math.random() < 0.4) tgt = [W.P.pos.x, W.P.pos.z];
      if (tgt) goal = tgt;
      else if (!B.goal || Math.hypot(B.goal[0] - c.pos.x, B.goal[1] - c.pos.z) < 2 || B.goalT < 0) {
        const pts = W.cover; const p = pts[(Math.random() * pts.length) | 0];
        goal = [p.x, p.z]; B.goalT = 14;
      } else goal = B.goal;
    }
  }
  B.mode = mode;
  if (goal) {
    const moved = !B.goal || Math.hypot(goal[0] - B.goal[0], goal[1] - B.goal[1]) > 1.8;
    B.goal = goal;
    if (moved || !B.path || B.pathT <= 0) { B.path = findPath(W.G, c.pos.x, c.pos.z, goal[0], goal[1]); B.pathT = 1.6; }
  } else { B.path = null; }
}
function pickCover(W, c, T) {
  let best = null, bs = 1e9;
  eyeOf(T, _b);
  for (const s of W.cover) {
    const d = Math.hypot(s.x - c.pos.x, s.z - c.pos.z); if (d > 14 || d < 0.5) continue;
    if (Math.hypot(s.x - T.pos.x, s.z - T.pos.z) < 6) continue;
    const hy = s.low ? 0.95 : 1.4;
    if (clearLine(W.G, _b.x, _b.y, _b.z, s.x, hy, s.z)) continue;
    const sc = d + (W.chars.some((o) => o !== c && o.alive && o.bot && o.bot.mode === 'cover' && o.bot.goal && Math.hypot(o.bot.goal[0] - s.x, o.bot.goal[1] - s.z) < 1) ? 20 : 0);
    if (sc < bs) { bs = sc; best = s; }
  }
  return best;
}
function ctfGoal(W, c) {
  const B = c.bot, mine = W.flags[c.team], theirs = W.flags[1 - c.team];
  if (c.carry >= 0) return [mine.home.x, mine.home.z];
  if (mine.state !== 'home' && (B.role === 'defend' || Math.hypot(mine.pos.x - c.pos.x, mine.pos.z - c.pos.z) < 16)) return [mine.pos.x, mine.pos.z];
  if (B.role === 'defend') {
    if (!B.goal || Math.hypot(B.goal[0] - c.pos.x, B.goal[1] - c.pos.z) < 1.2 || Math.random() < 0.03) { const a = Math.random() * TAU; const g = [mine.home.x + Math.cos(a) * 5, mine.home.z + Math.sin(a) * 5]; return walkable(W.G, toCell(g[0]), toCell(g[1])) ? g : [mine.home.x, mine.home.z]; }
    return B.goal;
  }
  if (theirs.state === 'carried' && theirs.carrier && theirs.carrier.team === c.team) { const cr = theirs.carrier; return [cr.pos.x + Math.sin(c.id) * 2, cr.pos.z + Math.cos(c.id) * 2]; }
  return [theirs.pos.x, theirs.pos.z];
}
function stepBot(W, c, dt) {
  const B = c.bot, D = W.D, G = GUNS[c.gun];
  if (!c.alive) return;
  B.thinkT -= dt; B.pathT -= dt; B.coverT -= dt; B.flankT = (B.flankT || 0) - dt; B.threatT = (B.threatT || 0) - dt; B.goalT = (B.goalT || 0) - dt;
  if (B.thinkT <= 0) { B.thinkT = 0.2 + Math.random() * 0.12; botThink(W, c); }
  B.reactT -= dt;
  let held = false, pressed = false;
  const T = B.target;
  let wantYaw = B.aimYaw, wantPitch = 0, fighting = false;
  if (T && T.alive && B.vis) {
    fighting = true;
    eyeOf(c, _a);
    const ty = T.pos.y + lerp(1.2, 0.85, T.crouchK);
    const dx0 = T.pos.x - _a.x, dz0 = T.pos.z - _a.z, d0 = Math.hypot(dx0, dz0), tof = d0 / G.speed;
    const px = T.pos.x + T.vel.x * tof * D.lead, pz = T.pos.z + T.vel.z * tof * D.lead;
    const dx = px - _a.x, dz = pz - _a.z, hd = Math.hypot(dx, dz);
    const drop = 0.5 * G.drop * tof * tof;
    B.errT -= dt;
    if (B.reactT <= 0 && !B.ready) { B.ready = true; B.settle = 0.75; B.errT = 0; }
    B.settle = Math.max(0, B.settle - dt * 1.2); B.nearT = Math.max(0, B.nearT - dt);
    // aim error: wider far away, against a moving or crouched target, in the first shots before the aim settles,
    // right after a near miss, and on an off day
    if (B.errT <= 0) { B.errT = 0.3 + Math.random() * 0.45; const e = D.aim * Math.PI / 180 * (1 + hd / 28) * (T.isPlayer && T.crouchK > 0.5 ? 1.25 : 1) * (Math.hypot(T.vel.x, T.vel.z) > 3 ? 1.3 : 1) * (1 + B.settle) * (B.nearT > 0 ? 1.5 : 1) * (2 - B.form); B.errX = (Math.random() - 0.5) * 2 * e; B.errY = (Math.random() - 0.5) * e; }
    wantYaw = Math.atan2(-dx, -dz) + B.errX; wantPitch = Math.atan2(ty + drop - _a.y, hd) + B.errY;
    const err = Math.abs(angDiff(B.aimYaw, wantYaw - B.errX));
    if (B.reactT <= 0 && B.hesT <= 0 && hd < G.range * 1.15 && err < 0.14) {
      B.fireT = (B.fireT || 0) - dt;
      if (G.mode === 'auto') { if (B.fireT <= 0) { B.firing = !B.firing; B.fireT = B.firing ? 0.45 + Math.random() * 0.6 * D.burst : (0.35 + Math.random() * 0.4) / D.burst; } held = B.firing; }
      else if (G.mode === 'burst') { pressed = B.fireT <= 0; if (pressed) B.fireT = (0.25 + Math.random() * 0.35) / D.burst; }
      else { pressed = err < 0.035 && B.fireT <= 0; if (pressed) B.fireT = 0.6 / D.burst; }
    }
  } else {
    const v = c.vel; if (Math.hypot(v.x, v.z) > 0.6) wantYaw = Math.atan2(-v.x, -v.z);
    else if (B.lastSeen) wantYaw = Math.atan2(-(B.lastSeen[0] - c.pos.x), -(B.lastSeen[1] - c.pos.z));
  }
  B.aimYaw += angDiff(B.aimYaw, wantYaw) * Math.min(1, (fighting ? D.track : 5) * dt);
  B.aimPitch = damp(B.aimPitch, clamp(wantPitch, -0.9, 0.9), fighting ? D.track : 4, dt);
  c.yaw = B.aimYaw; c.pitch = B.aimPitch;
  // out of a fight the head keeps checking left and right
  B.scanT -= dt; if (B.scanT <= 0) { B.scanT = 0.7 + Math.random() * 1.8; B.scanTo = fighting ? 0 : (Math.random() - 0.5) * 1.5; }
  c.look = damp(c.look, fighting ? 0 : B.scanTo, 5, dt);
  c.flinchK = Math.max(0, c.flinchK - dt * 4); c.cheerT = Math.max(0, c.cheerT - dt);
  if (c.ammo[c.gun] <= 0 || (!fighting && c.ammo[c.gun] < GUNS[c.gun].mag * 0.4)) startReload(W, c);
  runGun(W, c, dt, held, pressed, c.yaw, c.pitch);
  // walk the path
  let wx = 0, wz = 0;
  if (B.path && B.path.length) {
    let wp = B.path[0];
    if (Math.hypot(wp[0] - c.pos.x, wp[1] - c.pos.z) < 0.7) { B.path.shift(); wp = B.path[0]; }
    if (wp) { const dx = wp[0] - c.pos.x, dz = wp[1] - c.pos.z, l = Math.hypot(dx, dz) || 1; wx = dx / l; wz = dz / l; if (!B.path.length || (B.path.length === 1 && l < 1.2)) { wx *= l; wz *= l; } }
  }
  if (fighting && B.mode !== 'cover') {
    B.strafeT -= dt;
    if (B.strafeT <= 0) { B.strafeT = 0.5 + Math.random() * 1.1; B.strafeDir = Math.random() < 0.5 ? -1 : 1; }
    const k = c.gun === 2 ? 0.25 : 0.75;
    wx += Math.cos(c.yaw) * B.strafeDir * k; wz += -Math.sin(c.yaw) * B.strafeDir * k;
    if (!walkable(W.G, toCell(c.pos.x + wx * 1.2), toCell(c.pos.z + wz * 1.2))) B.strafeDir *= -1;
  }
  // personal space
  for (const o of W.chars) { if (o === c || !o.alive || o.team !== c.team) continue; const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z, d = Math.hypot(dx, dz); if (d < 1.3 && d > 0.01) { wx += dx / d * (1.3 - d) * 1.5; wz += dz / d * (1.3 - d) * 1.5; } }
  const inCover = B.mode === 'cover' && B.goal && Math.hypot(B.goal[0] - c.pos.x, B.goal[1] - c.pos.z) < 1.0;
  // the moment to leave cover comes, and a person waits a beat before going
  if (B.prevCoverT > 0 && B.coverT <= 0 && inCover && fighting) B.hesT = 0.25 + Math.random() * 0.65 * (2 - B.form);
  B.prevCoverT = B.coverT;
  if (B.hesT > 0) { B.hesT -= dt; wx = 0; wz = 0; }
  // a ball cracking past the head makes anyone duck for a moment
  if (B.nearT > 0.35 && !c.crouch && c.gun !== 2) { wx *= 0.4; wz *= 0.4; }
  c.crouch = (inCover && B.coverLow && !(c.reloadT <= 0 && B.coverT < 0.8)) || (c.gun === 2 && fighting && B.reactT < 0 && Math.random() < 0.02 ? !c.crouch : (c.gun === 2 && fighting ? c.crouch : false));
  if (inCover && !B.coverLow) c.crouch = false;
  if ((B.hesT > 0 && inCover && B.coverLow) || B.nearT > 0.3) c.crouch = true;
  c.sprint = !fighting && B.path && B.path.length > 2 && !c.crouch;
  let speed = c.sprint ? 6.1 : 4.4; if (c.crouch) speed = 2.3; if (c.carry >= 0) speed *= 0.9; if (c.isBoss) speed *= 0.8;
  // stuck
  B.stuckT = (B.stuckT || 0) + dt;
  if (B.stuckT > 1) { if (c.pos.distanceTo(B.lastPos) < 0.35 && (wx || wz)) { B.path = null; B.pathT = 0; B.thinkT = 0; B.goal = null; } B.lastPos.copy(c.pos); B.stuckT = 0; }
  moveBody(W, c, wx, wz, speed, dt, false);
  c.reloadK = damp(c.reloadK, c.reloadT > 0 ? 1 : 0, 10, dt);
  c.recoilK = damp(c.recoilK, 0, 9, dt);
}

/* ------------------------------------------------------------ flags, the drone, the end */
function stepFlags(W, dt) {
  W.flags.forEach((f) => {
    const enemy = 1 - f.team;
    if (f.state === 'carried') {
      const c = f.carrier;
      if (!c || !c.alive) { f.state = 'dropped'; f.dropT = 0; f.carrier = null; return; }
      f.pos.set(c.pos.x, c.pos.y, c.pos.z);
      const home = W.flags[c.team];
      if (home.state === 'home' && Math.hypot(c.pos.x - home.home.x, c.pos.z - home.home.z) < 1.6) {
        W.score[c.team]++; c.caps++; c.carry = -1; f.state = 'home'; f.pos.copy(f.home); f.carrier = null;
        pushFeed(W, c.name, 'captured the flag', TEAMS[c.team].ui, '');
        if (c.isPlayer) { W.stats.caps++; addPop(W, 'CAPTURE +500', '#ffd23f'); feel('success', 1, 50, [0.7, 0.5, 260]); }
        if (vxOn(W)) VX.fx.goalBurst(VX.v.set(f.home.x, f.home.y + 0.4, f.home.z), { color: TEAMS[c.team].paint, color2: '#ffd23f', size: 0.6 });
        if (!W.attract && ARC) ARC.toast(TEAMS[c.team].name + ' capture', W.score[0] + ' : ' + W.score[1], 1800);
        sfxCapture(c.team === 0);
        if (W.score[c.team] >= W.target && !W.over) finishMatch(W, c.team, 'caps', c);
      }
      return;
    }
    if (f.state === 'dropped') { f.dropT += dt; if (f.dropT > 20) { f.state = 'home'; f.pos.copy(f.home); pushFeed(W, TEAMS[f.team].short, 'flag returned', TEAMS[f.team].ui, ''); return; } }
    for (const c of W.chars) {
      if (!c.alive || c.fade < 0.6) continue;
      if (Math.hypot(c.pos.x - f.pos.x, c.pos.z - f.pos.z) > 1.4) continue;
      if (c.team === enemy && c.carry < 0) {
        f.state = 'carried'; f.carrier = c; c.carry = f.team;
        pushFeed(W, c.name, 'took the ' + TEAMS[f.team].short + ' flag', TEAMS[c.team].ui, '');
        if (c.isPlayer) { ARC && ARC.toast('You have the flag', 'Run it home', 1500); sfxPickup(); call(W, 'flagGot', W.chars.find((o) => o.team === 0 && o.bot && o.alive)); }
        else if (f.team === 0 && !W.attract) { call(W, 'flagTaken', W.chars.find((o) => o.team === 0 && o.bot && o.alive)); sfxAlarm(); }
        break;
      }
      if (c.team === f.team && f.state === 'dropped') { f.state = 'home'; f.pos.copy(f.home); pushFeed(W, c.name, 'returned the flag', TEAMS[c.team].ui, ''); if (c.isPlayer) addPop(W, 'RETURN +150', '#ffd23f'); break; }
    }
  });
}
function launchDrone(W, owner) {
  W.drone = { t: 18, owner, x: owner.pos.x, y: owner.pos.y + 4, z: owner.pos.z, vx: 0, vy: 0, vz: 0, fireT: 0.6, target: null, yaw: 0 };
}
function stepDrone(W, dt) {
  const d = W.drone; if (!d) return;
  d.t -= dt;
  if (d.t <= 0 || W.over) { W.drone = null; return; }
  const o = d.owner;
  let tg = null, bd = 1e9;
  for (const c of W.chars) {
    if (!c.alive || c.team === o.team) continue;
    const dd = Math.hypot(c.pos.x - d.x, c.pos.z - d.z); if (dd > 30) continue;
    if (!clearLine(W.G, d.x, d.y, d.z, c.pos.x, c.pos.y + 1.2, c.pos.z)) continue;
    if (dd < bd) { bd = dd; tg = c; }
  }
  d.target = tg;
  const ax = tg ? (tg.pos.x + o.pos.x) / 2 : o.pos.x + Math.sin(W.t * 0.7) * 3, az = tg ? (tg.pos.z + o.pos.z) / 2 : o.pos.z + Math.cos(W.t * 0.7) * 3;
  d.vx = damp(d.vx, (ax - d.x) * 1.2, 2, dt); d.vz = damp(d.vz, (az - d.z) * 1.2, 2, dt); d.vy = damp(d.vy, (6.2 + Math.sin(W.t * 2) * 0.3 - d.y) * 1.5, 2, dt);
  d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
  d.yaw += angDiff(d.yaw, tg ? Math.atan2(-(tg.pos.x - d.x), -(tg.pos.z - d.z)) : d.yaw + 0.4) * Math.min(1, dt * 3);
  d.fireT -= dt;
  if (tg && d.fireT <= 0) {
    d.fireT = 0.32;
    const tx = tg.pos.x + tg.vel.x * 0.15 + (Math.random() - 0.5) * 0.5, ty = tg.pos.y + 1.1 + (Math.random() - 0.5) * 0.4, tz = tg.pos.z + tg.vel.z * 0.15 + (Math.random() - 0.5) * 0.5;
    const dx = tx - d.x, dy = ty - d.y, dz = tz - d.z, l = Math.hypot(dx, dy, dz);
    W.balls.push({ x: d.x, y: d.y - 0.2, z: d.z, px: d.x, py: d.y, pz: d.z, vx: dx / l * 60, vy: dy / l * 60, vz: dz / l * 60, g: 0, team: o.team, owner: o, dmg: 22, life: 0, col: TEAMS[o.team].paint, gun: 0, drone: true, trail: 0 });
    if (Wd === W) sfxShotAt(d.x, d.y, d.z, 0.5, 1.4);
  }
}
function startTagCam(W, c, killer) {
  W.tagcam = { t: 0, killer, x: c.pos.x, y: c.pos.y, z: c.pos.z, dist: killer ? Math.round(killer.pos.distanceTo(c.pos)) : 0, gun: killer ? GUNS[killer.gun].name : '' };
  sfxTaggedOut();
  feel('heavy', 1, 90, [1, 0.8, 380]);
}
function finishMatch(W, team, why, victim) {
  if (W.over) return;
  if (W.attract) { W.score = [0, 0]; W.t = 0; return; }
  W.over = true; W.winner = team; W.why = why;
  W.final = { t: 0, victim: victim || null, dur: victim ? 3.0 : 1.4 };
  W.phase = 'final'; W.phaseT = 0;
  sfxFinal(team === 0);
  feel(team === W.P.team ? 'success' : 'fail', 1, 80, [0.8, 0.6, 400]);
}
function respawns(W, dt) {
  for (const c of W.chars) {
    if (c.alive) { c.fade = Math.min(1, c.fade + dt * 2.5); c.spawnShield = Math.max(0, (c.spawnShield || 0) - dt); continue; }
    if (c.tagged) {
      c.taggedT += dt;
      // hands up and walk off, then a puff of paint
      c.vel.x = damp(c.vel.x, 0, 6, dt); c.vel.z = damp(c.vel.z, 0, 6, dt);
      moveBody(W, c, 0, 0, 0, dt, false);
      if (c.taggedT > 1.6) {
        c.fade = Math.max(0, c.fade - dt * 3);
        if (c.fade <= 0.02 && c.visible) {
          c.visible = false;
          if (FX && Wd === W) for (let i = 0; i < 10 * FX.density; i++) FX.emit('soft', c.pos.x + (Math.random() - 0.5), c.pos.y + Math.random() * 1.7, c.pos.z + (Math.random() - 0.5), 0, 0.6, 0, 0.9, 0.5, '#e8e2d8', 0.3, -0.2, 1, 2.5);
        }
      }
    }
    if (c.isBoss) continue;
    if (W.mode === 'campaign' && c.team === 1 && !c.isPlayer) { if (c.taggedT > 2.2) c.tagged = false; continue; }
    c.respawnT -= dt;
    if (c.respawnT <= 0 && !W.over) {
      spawnChar(W, c, false);
      if (c.isPlayer) { W.tagcam = null; W.fadeIn = 1; R3 && (R3.camInit = false); }
    }
  }
}
function regen(W, dt) {
  for (const c of W.chars) {
    if (!c.alive) continue;
    c.regenT += dt;
    if (c.regenT > 3.6 && c.hp < c.hpMax) c.hp = Math.min(c.hpMax, c.hp + 34 * dt * (c.isPlayer ? W.D.regen : 1));
    c.hitFlash = Math.max(0, c.hitFlash - dt * 3);
  }
}

/* ------------------------------------------------------------ one step of the world */
function stepWorld(W, dt, I) {
  W.t += dt; W.phaseT += dt;
  W.hitMark = Math.max(0, W.hitMark - dt * 4); W.hitKill = Math.max(0, W.hitKill - dt * 2.5); W.hitHead = Math.max(0, (W.hitHead || 0) - dt * 3);
  W.shake = Math.max(0, W.shake - dt * 2.5); W.hurtK = Math.max(0, (W.hurtK || 0) - dt * 0.9); W.land = Math.max(0, (W.land || 0) - dt * 4); W.swapT = Math.max(0, (W.swapT || 0) - dt);
  W.hurt.forEach((h) => { h.t += dt; }); W.hurt = W.hurt.filter((h) => h.t < 1.6);
  W.feed.forEach((f) => { f.t += dt; }); W.feed = W.feed.filter((f) => f.t < 6);
  W.calls.forEach((f) => { f.t += dt; }); W.calls = W.calls.filter((f) => f.t < 4.2);
  W.pops.forEach((f) => { f.t += dt; }); W.pops = W.pops.filter((f) => f.t < 1.4);
  W.radarT = Math.max(0, W.radarT - dt);
  if (W.phase === 'intro') {
    if (W.phaseT >= W.introDur || (I && I.skip)) { W.phase = 'play'; W.phaseT = 0; W.letter = 1; if (ARC && !W.attract) ARC.toast(W.mode === 'campaign' ? W.obj.def.text : W.mode === 'ctf' ? 'Capture 3 flags' : 'First squad to 30 tags', W.mode === 'campaign' ? 'Objective' : 'Go go go', 1800); sfxGo(); }
    W.chars.forEach((c) => { moveBody(W, c, 0, 0, 0, dt, false); });
    return;
  }
  if (W.phase === 'results') { stepPodium(W, dt); return; }
  const P = W.P;
  if (W.phase === 'play' && !W.attract && I) stepPlayer(W, P, dt, I);
  if (W.tagcam) W.tagcam.t += dt;
  for (const c of W.chars) if (c.bot) stepBot(W, c, dt);
  respawns(W, dt);
  regen(W, dt);
  stepBalls(W, dt);
  if (W.mode === 'ctf') stepFlags(W, dt);
  if (W.mode === 'campaign') updateObjective(W, dt);
  stepDrone(W, dt);
  if (W.phase === 'play' && W.limit && W.t >= W.limit + W.introDur && !W.over) {
    const win = W.score[0] > W.score[1] ? 0 : W.score[1] > W.score[0] ? 1 : -1;
    if (W.attract) { W.score = [0, 0]; W.t = W.introDur; } else finishMatch(W, win, 'time', null);
  }
  if (W.phase === 'final') {
    W.final.t += dt / Math.max(0.05, W.slow);
    if (W.final.t > W.final.dur) { W.phase = 'results'; W.phaseT = 0; setupPodium(W); }
  }
}
function matchTime(W) { return Math.max(0, W.limit - Math.max(0, W.t - W.introDur)); }
// The winners line up at the centre for the podium shot.
function setupPodium(W) {
  const win = W.winner >= 0 ? W.winner : 0;
  const team = W.chars.filter((c) => c.team === win && !c.isBoss).sort((a, b) => (b.tags + b.caps * 3) - (a.tags + a.caps * 3)).slice(0, 3);
  const sp = W.G.spawns[win], base = sp[0];
  // an open patch of floor in the winners' half, with clear floor in front of it for the camera
  let cx0 = 0, cz0 = win === 0 ? 10 : -10, bs = 1e9;
  const fz = win === 0 ? -1 : 1;
  const open = (x, z) => inGrid(x, z) && W.G.kind[z * GN + x] === '.';
  for (let z = 2; z < GN - 2; z++) for (let x = 2; x < GN - 2; x++) {
    if ((win === 0) !== (z >= GN / 2)) continue;
    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++) for (let k = 0; k <= 4 && ok; k++) if (!open(x + dx, z + fz * k)) ok = false;
    if (!ok) continue;
    const px = cw(x + 0.5), pz = cw(z + 0.5), sc = Math.abs(px) + Math.abs(Math.abs(pz) - 10);
    if (sc < bs) { bs = sc; cx0 = px; cz0 = pz; }
  }
  void base;
  W.podium = { team: win, list: team, x: cx0, z: cz0, yaw: win === 0 ? 0 : Math.PI };
  void sp;
  W.chars.forEach((c) => { if (team.indexOf(c) < 0) { c.visible = false; c.fade = 0; } });
  team.forEach((c, i) => {
    const off = (i === 0 ? 0 : i === 1 ? -1.3 : 1.3);
    c.alive = true; c.tagged = false; c.visible = true; c.fade = 1; c.vel.set(0, 0, 0);
    c.pos.set(cx0 + Math.cos(W.podium.yaw) * off, 0, cz0 - Math.sin(W.podium.yaw) * off);
    c.yaw = W.podium.yaw; c.pitch = 0.1; c.crouch = false;
  });
  W.chars.forEach((c) => { if (c.carry >= 0) c.carry = -1; });
  W.balls.length = 0; W.drone = null;
  if (FX) FX.clear();
  if (R3) R3.camInit = false;
  // the victory shower over the podium
  if (vxOn(W)) {
    const T = TEAMS[win];
    VX.fx.winBurst(VX.v.set(cx0, 0.2, cz0), { colors: [T.paint, '#ffd23f', '#ffffff', T.ui], size: 0.7 });
    VX.fx.fireworks(VX.v.set(cx0, 9, cz0 - Math.cos(W.podium.yaw) * 6), { size: 0.8, launch: true, delay: 0.4 });
  }
}
function stepPodium(W, dt) {
  const Pd = W.podium; if (!Pd) return;
  Pd.list.forEach((c, i) => {
    c.cheer = (c.cheer || 0) + dt;
    const jump = Math.max(0, Math.sin(c.cheer * 5 + i * 1.7));
    c.pos.y = jump * 0.25; c.air = jump > 0.05; c.tagged = Math.sin(c.cheer * 2.4 + i) > 0.2;
    c.runK = 0; c.crouchK = 0;
  });
  for (let ci = 0; FX && ci < 3; ci++) if (Math.random() < dt * 30 * FX.density) {
    const cols = ['#ff7a1a', '#ffd23f', '#3f6dff', '#ff4fa0', '#36d17a', '#ffffff'];
    FX.emit('soft', Pd.x + (Math.random() - 0.5) * 8, 6 + Math.random() * 2, Pd.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 2, -0.5, (Math.random() - 0.5) * 2, 3.5, 0.09, cols[(Math.random() * cols.length) | 0], 1, 0.6, 0.8, 1, 0);
  }
  if (!W.overShown && W.phaseT > 1.6) { W.overShown = true; showResults(W); }
}

/* ------------------------------------------------------------ rain */
function makeRain(scene) {
  const N = 1600, pos = new Float32Array(N * 6), seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { seed[i * 3] = (Math.random() - 0.5) * 36; seed[i * 3 + 1] = Math.random() * 18; seed[i * 3 + 2] = (Math.random() - 0.5) * 36; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ color: '#b8c8da', transparent: true, opacity: 0.32, depthWrite: false, fog: true });
  const ls = new THREE.LineSegments(geo, mat); ls.frustumCulled = false; ls.visible = false; ls.renderOrder = 7; scene.add(ls);
  return { ls, geo, pos, seed, N, t: 0 };
}
function updateRain(Rn, cam, dt, on, density) {
  Rn.ls.visible = on;
  if (!on) return;
  Rn.t += dt;
  const n = Math.floor(Rn.N * density);
  Rn.geo.setDrawRange(0, n * 2);
  const wx = 1.6, wz = 0.8, sp = 24;
  for (let i = 0; i < n; i++) {
    const k = i * 3; let y = Rn.seed[k + 1] - Rn.t * sp;
    y = ((y % 18) + 18) % 18;
    const ox = Rn.seed[k] + (18 - y) * wx * 0.05, oz = Rn.seed[k + 2] + (18 - y) * wz * 0.05;
    const x = Math.floor((cam.x - ox) / 36 + 0.5) * 36 + ox, z = Math.floor((cam.z - oz) / 36 + 0.5) * 36 + oz;
    const yy = cam.y - 6 + y, p = i * 6;
    Rn.pos[p] = x; Rn.pos[p + 1] = yy; Rn.pos[p + 2] = z;
    Rn.pos[p + 3] = x - wx * 0.03; Rn.pos[p + 4] = yy + 0.55; Rn.pos[p + 5] = z - wz * 0.03;
  }
  Rn.geo.attributes.position.needsUpdate = true;
}

/* ------------------------------------------------------------ activating a world in 3D */
function activateWorld(W) {
  const r = R3;
  if (!r.S || r.S.id !== W.mapId) { disposeWorld(r.S); r.S = buildWorld(W.mapId); applyTier(); }
  else { clearSplats(r.S.decals); }
  r.world = W;
  const S = r.S;
  S.flags.forEach((f) => { f.root.visible = W.mode === 'ctf'; });
  const team = W.P.team;
  if (!r.vm || r.vmTeam !== team) {
    if (r.vm) r.vm.forEach((v) => r.vmScene.remove(v.root));
    r.vm = [0, 1, 2].map((g) => buildViewModel(g, team)); r.vmTeam = team;
    r.vm.forEach((v) => { v.root.visible = false; r.vmScene.add(v.root); });
  }
  r.camInit = false; r.vmBall = 0;
  if (FX) FX.clear();
}
function applyTier() {
  const r = R3, t = TIERS[Math.max(0, r.quality)];
  r.scene.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && o.material && !Array.isArray(o.material) && !o.material.isShaderMaterial && !(o.material.userData && o.material.userData.keepMat)) {
      const full = fullOf(o.material), want = t.cheap ? cheapOf(full) : full;
      if (o.material !== want) o.material = want;
    }
    if (o.userData && o.userData.decor) o.visible = t.decor;
  });
  const an = Math.min(t.aniso, r.renderer.capabilities.getMaxAnisotropy()); ANISO = an;
  ALL_TEX.forEach((tx) => { if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; } });
  r.renderer.shadowMap.enabled = t.shadow; r.sun.castShadow = t.shadow;
  if (r.sun.shadow.mapSize.x !== t.map) { r.sun.shadow.mapSize.set(t.map, t.map); if (r.sun.shadow.map) { r.sun.shadow.map.dispose(); r.sun.shadow.map = null; } }
  if (t.shadow !== r.lastShadow) { r.scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; }); r.lastShadow = t.shadow; }
  if (FX) FX.density = t.fx;
  r.skyU.uDetail.value = t.cheap && r.soft ? 0 : 1;
  if (r.S) {
    r.S.lamps.forEach((l) => { l.visible = r.quality >= 2; });
    r.scene.environment = t.cheap ? null : r.envs[r.S.id];
  }
  r.rtKey = '';
}
function setQuality(q) {
  if (!R3) return;
  q = clamp(q | 0, 0, 3);
  if (q === R3.quality) return;
  R3.quality = q;
  applyTier(); resize3D(ARC);
}
function resize3D(arc) {
  if (!R3 || !arc) return;
  const t = TIERS[Math.max(0, R3.quality)];
  const budget = R3.soft && !R3.lockQ ? Math.min(t.budget, 120000) : t.budget;
  const pr = Math.min(arc.dpr * t.px, Math.sqrt(budget / Math.max(1, arc.w * arc.h)));
  R3.renderer.setPixelRatio(Math.max(0.3, pr));
  R3.renderer.setSize(arc.w, arc.h, false);
  R3.camera.aspect = arc.w / arc.h; R3.camera.updateProjectionMatrix();
  R3.vmCam.aspect = arc.w / arc.h; R3.vmCam.updateProjectionMatrix();
  R3.rtKey = '';
}
function measureFps(dt) {
  const r = R3;
  if (r.qWarm < 6) { r.qWarm++; return; }
  r.qT += dt; r.qN++;
  if (r.qT >= 1.5) {
    r.fps = r.qN / r.qT; r.qT = 0; r.qN = 0;
    if (!r.lockQ && r.fps < 38 && r.quality > 0) { setQuality(r.fps < 18 ? Math.max(0, r.quality - 2) : r.quality - 1); r.qWarm = 0; }
  }
}

/* ------------------------------------------------------------ cameras */
const _cp = new THREE.Vector3(), _ct = new THREE.Vector3(), _ce = new THREE.Vector3();
function safeCam(W, tx, ty, tz, cam) {
  // pull a third person camera in front of any wall between it and its subject
  if (clearLine(W.G, tx, ty, tz, cam.x, cam.y, cam.z)) return cam;
  for (let k = 0.85; k > 0.1; k -= 0.15) { const x = lerp(tx, cam.x, k), y = lerp(ty, cam.y, k), z = lerp(tz, cam.z, k); if (clearLine(W.G, tx, ty, tz, x, y, z)) return cam.set(x, y, z); }
  return cam.set(lerp(tx, cam.x, 0.1), lerp(ty, cam.y, 0.1) + 0.5, lerp(tz, cam.z, 0.1));
}
function baseFov(a) { const asp = a.w / Math.max(1, a.h); return asp >= 1.25 ? 68 : clamp(2 * Math.atan(Math.tan(38 * Math.PI / 180) / asp) * 180 / Math.PI, 68, 90); }
function updateCamera(W, dt, a, I) {
  const r = R3, cam = r.camera, P = W.P, rm = a.reducedMotion;
  let fov = baseFov(a), fp = false;
  const blendTo = (x, y, z, tx, ty, tz, k) => {
    if (!r.camInit) { r.camPos.set(x, y, z); r.camTgt.set(tx, ty, tz); r.camInit = true; }
    r.camPos.x = damp(r.camPos.x, x, k, dt); r.camPos.y = damp(r.camPos.y, y, k, dt); r.camPos.z = damp(r.camPos.z, z, k, dt);
    r.camTgt.x = damp(r.camTgt.x, tx, k * 1.3, dt); r.camTgt.y = damp(r.camTgt.y, ty, k * 1.3, dt); r.camTgt.z = damp(r.camTgt.z, tz, k * 1.3, dt);
    cam.position.copy(r.camPos); cam.up.set(0, 1, 0); cam.lookAt(r.camTgt);
  };
  if (W.attract) {
    // menu: a slow crane over the arena, cutting to a shoulder shot of a player now and then
    r.shotT = (r.shotT || 0) - dt;
    if (r.shotT <= 0) { r.shotT = 7; r.shot = ((r.shot || 0) + 1) % 3; r.shotWho = W.chars[(Math.random() * W.chars.length) | 0]; r.camInit = false; W.fadeIn = 1; }
    const t = W.t * 0.07;
    if (r.shot === 1 && r.shotWho && r.shotWho.alive) {
      const c = r.shotWho, bx = Math.sin(c.yaw) * 3.4 + Math.cos(c.yaw) * 1.1, bz = Math.cos(c.yaw) * 3.4 - Math.sin(c.yaw) * 1.1;
      _cp.set(c.pos.x + bx, c.pos.y + 2.0, c.pos.z + bz); safeCam(W, c.pos.x, c.pos.y + 1.6, c.pos.z, _cp);
      aimDir(c.yaw, c.pitch * 0.5, _ce);
      blendTo(_cp.x, _cp.y, _cp.z, c.pos.x + _ce.x * 8, c.pos.y + 1.3 + _ce.y * 8, c.pos.z + _ce.z * 8, 4);
      fov = 58;
    } else if (r.shot === 2) {
      blendTo(Math.sin(t * 1.6) * 6, 2.2, 14 + Math.cos(t) * 3, Math.sin(t) * 4, 1.2, -6, 2);
      fov = 60;
    } else {
      blendTo(Math.sin(t) * 30, 17 + Math.sin(t * 0.7) * 3, Math.cos(t) * 30, 0, 0, 0, 2);
      fov = 52;
    }
  } else if (W.phase === 'intro') {
    const k = smooth01(W.phaseT / W.introDur), e = smooth01((k - 0.62) / 0.38);
    const ang = (W.P.team === 0 ? 0 : Math.PI) + 0.9 - k * 1.5;
    eyeOf(P, _ce);
    const sx = Math.sin(ang) * 34, sz = Math.cos(ang) * 34, sy = 22 - k * 10;
    aimDir(P.yaw, P.pitch, _f);
    cam.position.set(lerp(sx, _ce.x, e), lerp(sy, _ce.y, e), lerp(sz, _ce.z, e));
    cam.up.set(0, 1, 0);
    _ct.set(lerp(0, _ce.x + _f.x * 10, e), lerp(0, _ce.y + _f.y * 10, e), lerp(0, _ce.z + _f.z * 10, e));
    cam.lookAt(_ct); r.camInit = false;
    fov = lerp(50, fov, e);
  } else if (W.phase === 'results' && W.podium) {
    const Pd = W.podium, fx = -Math.sin(Pd.yaw), fz = -Math.cos(Pd.yaw), t = W.phaseT;
    const d = lerp(8.5, 5.2, smooth01(t / 4)), side = Math.sin(t * 0.25) * 1.2;
    _cp.set(Pd.x + fx * d + Math.cos(Pd.yaw) * side, 1.75 - Math.min(0.35, t * 0.08), Pd.z + fz * d - Math.sin(Pd.yaw) * side);
    safeCam(W, Pd.x, 1.3, Pd.z, _cp);
    blendTo(_cp.x, _cp.y, _cp.z, Pd.x, 1.15, Pd.z, 3);
    fov = 50;
  } else if (W.phase === 'final' && W.final) {
    const v = W.final.victim, t = W.final.t;
    const vx = v ? v.pos.x : 0, vy = v ? v.pos.y : 0, vz = v ? v.pos.z : 0;
    const a0 = (v ? v.yaw : 0) + 0.6 + t * 0.5, rad = v ? 3.4 - t * 0.25 : 18;
    _cp.set(vx + Math.sin(a0) * rad, vy + (v ? 1.5 + t * 0.15 : 12), vz + Math.cos(a0) * rad);
    safeCam(W, vx, vy + 1.2, vz, _cp);
    blendTo(_cp.x, _cp.y, _cp.z, vx, vy + 1.15, vz, 3.5);
    fov = 46;
  } else if (W.tagcam && !P.alive) {
    const T = W.tagcam, K = T.killer, t = T.t;
    if (K && t < 3.6) {
      const kx = K.pos.x, kz = K.pos.z, dx = T.x - kx, dz = T.z - kz, d = Math.hypot(dx, dz) || 1;
      const bx = -dx / d, bz = -dz / d, rx = -bz, rz = bx;
      _cp.set(kx + bx * 2.0 + rx * 0.8, K.pos.y + 1.95, kz + bz * 2.0 + rz * 0.8);
      safeCam(W, kx, K.pos.y + 1.6, kz, _cp);
      const look = smooth01(t / 0.6);
      blendTo(_cp.x, _cp.y, _cp.z, lerp(kx, T.x, 0.65 + look * 0.2), lerp(K.pos.y + 1.3, T.y + 1.0, 0.7), lerp(kz, T.z, 0.65 + look * 0.2), t < 0.2 ? 30 : 5);
      fov = lerp(64, 44, smooth01((t - 0.3) / 1.6));
    } else {
      const a0 = t * 0.35;
      _cp.set(T.x + Math.sin(a0) * 6, T.y + 4.5, T.z + Math.cos(a0) * 6); safeCam(W, T.x, T.y + 1, T.z, _cp);
      blendTo(_cp.x, _cp.y, _cp.z, T.x, T.y + 0.8, T.z, 3);
      fov = 58;
    }
  } else {
    // first person
    fp = true;
    eyeOf(P, _ce);
    const G = GUNS[P.gun], run = P.onGround ? P.runK : 0, ph = P.phase;
    const bobK = rm ? 0.3 : 1;
    const bobY = (Math.abs(Math.sin(ph)) - 0.5) * 0.05 * run * bobK * (P.sprint ? 1.6 : 1) * (1 - P.adsK * 0.8);
    const bobX = Math.cos(ph) * 0.03 * run * bobK * (1 - P.adsK * 0.8);
    r.kick = damp(r.kick || 0, 0, 14, dt);
    r.land = W.land || 0;
    cam.position.set(_ce.x + Math.cos(P.yaw) * bobX, _ce.y + bobY - r.land * 0.12 * bobK, _ce.z - Math.sin(P.yaw) * bobX);
    cam.rotation.set(P.pitch + r.kick, P.yaw, (rm ? 0 : -Math.cos(ph) * 0.006 * run - (I ? I.mx : 0) * 0.012), 'YXZ');
    const zoom = lerp(1, G.zoom, smooth01(P.adsK));
    fov = (fov + (P.sprint && !rm ? 7 : 0)) / zoom;
    r.camInit = false;
  }
  // shake
  const sh = rm ? 0 : (a.shakeX || 0) * 0.002 + (W.shake || 0) * 0.012;
  if (sh) { cam.position.x += (Math.random() - 0.5) * sh; cam.position.y += (Math.random() - 0.5) * sh; }
  r.fov = damp(r.fov || fov, fov, fp ? 16 : 5, dt);
  if (Math.abs(cam.fov - r.fov) > 0.01 || cam.aspect !== a.w / a.h) { cam.fov = r.fov; cam.aspect = a.w / a.h; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
  r.firstPerson = fp;
}

/* ------------------------------------------------------------ per frame: put the world where the rules say */
function setPeopleColors(W) {
  const Pp = R3.people;
  const set = (name, i, col) => Pp[name].setColorAt(i, _c.set(col));
  W.chars.forEach((c, i) => {
    const T = TEAMS[c.team], skin = SKIN[(c.id * 5 + c.team * 3) % SKIN.length];
    const vest = c.isBoss ? '#5a2a8a' : T.vest;
    set('torso', i, vest); set('helmet', i, c.isBoss ? '#ffd23f' : T.vest); set('mask', i, T.trim); set('visor', i, '#ffffff');
    set('pack', i, c.isBoss ? '#ffd23f' : T.paint); set('head', i, skin); set('hips', i, T.pants); set('rig', i, c.isBoss ? '#2a1a3a' : T.trim);
    ['uarmL', 'uarmR'].forEach((n) => set(n, i, vest)); ['farmL', 'farmR'].forEach((n) => set(n, i, '#1d2026'));
    ['thighL', 'thighR', 'shinL', 'shinR'].forEach((n) => set(n, i, T.pants)); ['bootL', 'bootR'].forEach((n) => set(n, i, '#1a1b1f'));
    Pp.gun.setColorAt(i, _c.set('#ffffff'));
  });
  Pp.list.forEach((im) => { if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  R3.colorKey = W.chars.length + ':' + W.mode + ':' + (W === R3.world ? 1 : 0) + W.cfg.seed;
}
const _proj = new THREE.Vector3();
function renderScene(W, dt, a, I) {
  const r = R3, S = r.S, P = W.P, Pp = r.people, t = TIERS[Math.max(0, r.quality)], L = W.M.look, rm = a.reducedMotion;
  r.time += dt;
  if (r.colorKey !== W.chars.length + ':' + W.mode + ':1' + W.cfg.seed) setPeopleColors(W);
  updateCamera(W, dt, a, I);
  const cam = r.camera;
  // people
  const showSelf = !r.firstPerson, rigs = rigsOn();
  if (!rigs) for (let k = 0; k < HU.rigs.length; k++) if (HU.rigs[k]) HU.rigs[k].h.group.visible = false;
  for (let i = 0; i < MAXC; i++) {
    const c = W.chars[i];
    if (!c) { Pp.list.forEach((im) => im.setMatrixAt(i, _m.makeScale(0, 0, 0))); Pp.cs.setMatrixAt(i, _m.makeScale(0, 0, 0)); if (HU.rigs[i]) HU.rigs[i].h.group.visible = false; continue; }
    const hideSelf = c === P && !showSelf;
    const vis = c.visible, fade = c.fade;
    if (hideSelf) { c.visible = false; }
    if (c.isBoss) c.fade = fade * 1.16;
    if (rigs) {
      const show = c.visible && c.fade > 0.01;
      if (show) hideBody(Pp, i); else Pp.list.forEach((im) => im.setMatrixAt(i, _m.makeScale(0, 0, 0)));
      poseRig(W, Pp, i, c, dt, show);
    } else poseCharacter(Pp, i, c, null);
    if (c.onGround) c.gy = c.pos.y;
    if (c.visible && c.fade > 0.05) {
      const gy = c.gy == null ? c.pos.y : c.gy, k = clamp(1 - (c.pos.y - gy) * 0.9, 0.35, 1) * Math.min(1, c.fade), w = (0.62 + 0.22 * c.crouchK) * k + 0.08;
      _m.compose(_v.set(c.pos.x, gy + 0.012, c.pos.z), _q.identity(), _s.set(w, 1, w * 1.15)); Pp.cs.setMatrixAt(i, _m);
    } else Pp.cs.setMatrixAt(i, _m.makeScale(0, 0, 0));
    c.visible = vis; c.fade = fade;
  }
  Pp.cs.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < W.chars.length && i < MAXC; i++) Pp.gun.setColorAt(i, _c.set(GUNS[W.chars[i].gun].body));
  if (Pp.gun.instanceColor) Pp.gun.instanceColor.needsUpdate = true;
  Pp.list.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
  // paint on people
  const D = S.decals;
  growSplats(D, dt);
  for (let k = 0; k < D.BMAX; k++) {
    const s = D.bodyList[k];
    const c = s && W.chars[s.cid];
    if (!s || !c || !c.visible || c.fade < 0.05 || (c === P && !showSelf)) { D.body.setMatrixAt(k, D.zero); continue; }
    const top = lerp(BODY_H, BODY_HC, c.crouchK), hh = clamp(s.h, 0.3, BODY_H) / BODY_H * top;
    const rr = s.part === 'head' ? 0.15 : s.part === 'torso' ? 0.22 : 0.12;
    const ang = c.yaw + s.ang;
    const nx = Math.sin(ang), nz = Math.cos(ang);
    _v.set(c.pos.x + nx * rr, c.pos.y + hh, c.pos.z + nz * rr);
    _q.setFromUnitVectors(ZAXIS, _v2.set(nx, 0, nz)).multiply(_q2.setFromAxisAngle(ZAXIS, s.rot));
    _m.compose(_v, _q, _s.set(s.s * c.fade, s.s * c.fade, 1));
    D.body.setMatrixAt(k, _m);
  }
  D.body.instanceMatrix.needsUpdate = true;
  // paint balls in flight
  const bm = r.balls; let n = 0;
  for (const b of W.balls) {
    if (n >= 260) break;
    _m.makeTranslation(b.x, b.y, b.z); bm.setMatrixAt(n, _m); bm.setColorAt(n, _c.set(b.col)); n++;
    if (FX && (b.trail = (b.trail + 1) % 2) === 0) FX.emit('add', b.x, b.y, b.z, 0, 0, 0, 0.09, 0.07, b.col, 0.45, 0, 0, 0.3);
  }
  bm.count = n; bm.instanceMatrix.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
  // flags
  if (W.mode === 'ctf') S.flags.forEach((F, k) => {
    const f = W.flags[k];
    F.root.visible = true;
    if (f.state === 'carried' && f.carrier) {
      const c = f.carrier;
      F.holder.position.set(c.pos.x - F.root.position.x + Math.sin(c.yaw) * 0.25, c.pos.y + 0.2 - F.root.position.y, c.pos.z - F.root.position.z + Math.cos(c.yaw) * 0.25);
      F.holder.rotation.set(0.15, c.yaw, 0); F.holder.visible = !(c === P && r.firstPerson);
    } else { F.holder.visible = true; F.holder.position.set(f.pos.x - F.root.position.x, f.state === 'dropped' ? -0.3 : 0.12, f.pos.z - F.root.position.z); F.holder.rotation.set(f.state === 'dropped' ? 0.35 : 0, 0, f.state === 'dropped' ? 0.3 : 0); }
    const pa = F.cloth.geometry.attributes.position, o = F.orig;
    for (let v = 0; v < pa.count; v++) { const x = o[v * 3], y = o[v * 3 + 1]; pa.setZ(v, Math.sin(x * 4.5 - r.time * 7 + k) * 0.09 * x + Math.sin(y * 3 + r.time * 5) * 0.02 * x); }
    pa.needsUpdate = true; F.cloth.geometry.computeVertexNormals();
  });
  // objective marker
  const Mk = S.markers, mk = W.mode === 'campaign' && !W.attract && W.phase === 'play' ? objMarker(W) : null;
  Mk.dia.visible = Mk.beam.visible = !!mk;
  const zone = mk && W.obj && (W.obj.def.t === 'hold' || W.obj.def.t === 'goto');
  Mk.ring.visible = Mk.fill.visible = !!zone;
  if (mk) {
    Mk.dia.position.set(mk[0], mk[1] + Math.sin(r.time * 2.2) * 0.12, mk[2]); Mk.dia.rotation.y = r.time * 1.6;
    Mk.beam.position.set(mk[0], mk[1] + 14, mk[2]);
    if (zone) { const R = W.obj.def.r * CS * 0.6; Mk.ring.position.set(mk[0], 0.04, mk[2]); Mk.ring.scale.setScalar(R); Mk.fill.position.set(mk[0], 0.03, mk[2]); Mk.fill.scale.setScalar(R); Mk.fill.material.opacity = 0.08 + (W.obj.contested ? 0.1 * Math.abs(Math.sin(r.time * 6)) : 0.06); }
  }
  const sp = W.mode === 'campaign' && W.obj && W.obj.def.t === 'carry';
  Mk.spool.visible = !!sp && (!W.obj.carried || !r.firstPerson);
  if (sp) {
    if (W.obj.carried) Mk.spool.position.set(P.pos.x + Math.sin(P.yaw) * 0.3, P.pos.y + 1.3, P.pos.z + Math.cos(P.yaw) * 0.3);
    else Mk.spool.position.set(W.obj.itemPos.x, W.obj.itemPos.y + 0.6 + Math.sin(r.time * 2) * 0.1, W.obj.itemPos.z);
    Mk.spool.rotation.set(0, r.time, Math.PI / 2);
  }
  // drone
  const dr = r.drone;
  dr.g.visible = !!W.drone;
  if (W.drone) { dr.g.position.set(W.drone.x, W.drone.y, W.drone.z); dr.g.rotation.set(W.drone.vz * 0.05, W.drone.yaw, -W.drone.vx * 0.05); dr.rotors.forEach((ro, k) => { ro.rotation.y = r.time * 40 + k; }); }
  // cloth, neon, torches, motes, rain, lightning
  S.cloths.forEach((cl) => {
    const sw = rm ? cl.sw * 0.3 : cl.sw, ang = Math.sin(r.time * 1.3 + cl.ph) * sw + Math.sin(r.time * 3.1 + cl.ph * 2) * sw * 0.3;
    _e.set(ang, cl.ry || 0, 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_v.set(cl.x, cl.y + cl.h / 2, cl.z), _q, _s.set(1, 1, 1)).multiply(_m3.makeTranslation(0, -cl.h / 2, 0));
    cl.im.setMatrixAt(cl.i, _m); cl.im.instanceMatrix.needsUpdate = true;
  });
  S.neon.forEach((ne) => { const fl = rm ? 1 : (Math.sin(r.time * 13 + ne.ph) > 0.97 ? 0.35 : 1); ne.m.material.emissiveIntensity = ne.base * fl; });
  if (FX) {
    S.flicker.forEach((f) => { if (Math.random() < dt * 26 * FX.density) FX.emit('add', f.x + (Math.random() - 0.5) * 0.12, f.y, f.z + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.3, 1 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3, 0.4 + Math.random() * 0.25, 0.32, Math.random() < 0.5 ? '#ff8a2a' : '#ffcc55', 0.9, -0.5, 1, 0.4); });
    S.lamps.forEach((l, k) => { if (W.mapId === 'fort') l.intensity = 7 * (0.85 + Math.sin(r.time * 17 + k * 3) * 0.08 + Math.sin(r.time * 31 + k) * 0.06); });
    if (L.dust && Math.random() < dt * 18 * FX.density) {
      const p = cam.position;
      FX.emit('soft', p.x + (Math.random() - 0.5) * 14, p.y + (Math.random() - 0.4) * 4, p.z + (Math.random() - 0.5) * 14, 0.2 + Math.random() * 0.2, (Math.random() - 0.5) * 0.1, 0.1, 4, 0.05, W.mapId === 'fort' ? '#ffd9a0' : '#ffc890', 0.5, 0, 0, 1);
    }
    if (L.rain && Math.random() < dt * 60 * FX.density) { const p = cam.position, x = p.x + (Math.random() - 0.5) * 16, z = p.z + (Math.random() - 0.5) * 16, cx0 = toCell(x), cz0 = toCell(z); if (inGrid(cx0, cz0) && W.G.kind[cz0 * GN + cx0] !== 'x') FX.emit('soft', x, W.G.h[cz0 * GN + cx0] > 50 ? 3.0 : W.G.h[cz0 * GN + cx0] + 0.02, z, 0, 1.2, 0, 0.18, 0.12, '#cfdbe6', 0.5, 8, 0, 1.6); }
  }
  updateRain(r.rain, cam.position, dt, !!L.rain, t.rain);
  let flash = 0;
  if (L.rain) {
    W.lightning -= dt;
    if (W.lightning <= 0) { W.lightning = 9 + Math.random() * 10; r.bolt = 0; sfxThunder(); }
    if (r.bolt != null) { r.bolt += dt; const b = r.bolt; flash = b < 0.08 ? 1 : b < 0.16 ? 0.15 : b < 0.24 ? 0.8 : Math.max(0, 1 - (b - 0.24) * 4) * 0.5; if (b > 0.6) r.bolt = null; }
    if (rm) flash *= 0.12;
  }
  r.skyU.uFlash.value = flash * 1.4;
  r.hemi.intensity = L.hemiI * (t.cheap ? 1.6 : 1) * (1 + flash * 2.2);
  r.sun.intensity = L.sunI * (t.cheap ? 1.25 : 1);
  r.skyU.uTime.value = r.time;
  r.sky.position.copy(cam.position);
  // the ground beyond the walls only shows from up high
  if (S.outside) S.outside.visible = cam.position.y > W.M.wallH - 0.5 || Math.abs(cam.position.x) > HALFW - 1 || Math.abs(cam.position.z) > HALFW - 1 || W.mapId === 'fort' && cam.position.y > 2.6;
  // the marker in your hands
  const showVM = r.firstPerson && P.alive && !W.attract;
  updateViewModel(W, dt, a, I, showVM);
  if (FX) FX.update(dt, a.h * r.renderer.getPixelRatio() * 0.5 / Math.tan(cam.fov * Math.PI / 360));
  // grade
  const hurtK = clamp((W.hurtK || 0) * 0.7 + (P.alive ? clamp((60 - P.hp) / 60, 0, 1) * 0.35 : 0.4), 0, 0.85) * (W.attract ? 0 : 1);
  const slowK = W.phase === 'final' ? 0.3 : (W.tagcam && !P.alive ? 0.55 : 0);
  const G = GUNS[P.gun], scoped = r.firstPerson && P.gun === 2 && P.adsK > 0.85;
  const post = {
    thr: 1.0, bloom: L.bloom * (t.quality === 1 ? 0.8 : 1), exp: L.exposure, vig: 0.42 + (scoped ? 0.3 : 0) + (W.letter ? 0.1 : 0), grain: rm ? 0.02 : 0.035,
    sat: L.sat, hurt: hurtK * 0.55, hurtCol: _c.set(TEAMS[1 - P.team].paint).multiplyScalar(0.55), desat: slowK, aber: rm ? 0 : clamp((W.hurtK || 0) * 1.5 + (W.hitKill || 0) * 0.3, 0, 1.2), gain: L.grade, lift: L.lift
  };
  r.renderer.toneMappingExposure = L.exposure * (t.post ? 1 : 0.95);
  void G;
  drawFrame(showVM && !scoped, post);
}
function updateViewModel(W, dt, a, I, show) {
  const r = R3, P = W.P;
  r.vm.forEach((v, k) => { v.root.visible = show && k === P.gun; });
  if (!show) return;
  const v = r.vm[P.gun], g = v.root, rm = a.reducedMotion, asp = a.w / Math.max(1, a.h);
  const port = asp < 1;
  r.vmCam.fov = port ? 74 : 56; r.vmCam.aspect = asp; r.vmCam.updateProjectionMatrix();
  const ads = smooth01(P.adsK), run = P.onGround ? P.runK : 0, ph = P.phase, bk = rm ? 0.35 : 1;
  const hipX = port ? 0.08 : 0.22, hipY = port ? -0.25 : -0.2, hipZ = port ? -0.78 : -0.6;
  r.swayX = damp(r.swayX || 0, clamp(-(I ? I.lx : 0) * 3, -0.06, 0.06), 8, dt);
  r.swayY = damp(r.swayY || 0, clamp((I ? I.ly : 0) * 3, -0.05, 0.05), 8, dt);
  const sprint = P.sprint ? 1 : 0;
  r.sprintK = damp(r.sprintK || 0, sprint, 9, dt);
  const sw = r.swapK = damp(r.swapK || 0, W.swapT > 0 ? 1 : 0, 18, dt);
  const rel = P.reloadK, rec = P.recoilK;
  let x = lerp(hipX, 0, ads) + Math.cos(ph) * 0.012 * run * bk * (1 - ads * 0.85) + r.swayX * (1 - ads * 0.7) - r.sprintK * 0.04;
  let y = lerp(hipY, -0.085, ads) + (Math.abs(Math.sin(ph)) - 0.5) * 0.016 * run * bk * (1 - ads * 0.85) - r.swayY - sw * 0.28 - rel * 0.05 - (W.land || 0) * 0.04 - r.sprintK * 0.05;
  let z = lerp(hipZ, -0.42, ads) + rec * 0.045 + Math.sin(r.time * 1.6) * 0.003 * (1 - ads);
  g.position.set(x, y, z);
  g.rotation.set(rec * 0.09 - rel * 0.38 + r.sprintK * -0.25 + r.swayY * 1.5 + sw * -0.6, r.swayX * 2 + r.sprintK * (port ? 0.4 : 0.75) + (port ? 0.16 * (1 - ads) : 0), -rel * 0.5 + r.sprintK * 0.35 + (I ? -I.mx * 0.03 : 0) * (1 - ads), 'YXZ');
  // the muzzle pop and the hopper rattle
  r.muzzleT = Math.max(0, (r.muzzleT || 0) - dt);
  v.flash.visible = r.muzzleT > 0;
  if (v.flash.visible) { v.flash.rotation.z = Math.random() * TAU; v.flash.scale.setScalar(0.8 + Math.random() * 0.6); }
  const balls = v.gunG.userData.balls;
  if (balls) { balls.rotation.y = Math.sin(r.time * 20) * 0.08 * (run + rec); balls.position.y = rel * Math.sin(r.time * 30) * 0.004; }
  r.vmSun.position.copy(R3.S.sunDir).multiplyScalar(5).applyAxisAngle(YAXIS, -P.yaw);
}

/* ------------------------------------------------------------ HUD */
const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
const INK = '#fbf5ec', DIM = '#b8b0a4', GOLD = '#ffd23f';
function txt(ctx, s, x, y, size, color, align, weight, fam) { ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function plate(ctx, x, y, w, h, r, a) { rr(ctx, x, y, w, h, r || 10); ctx.fillStyle = 'rgba(10,9,8,' + (a == null ? 0.55 : a) + ')'; ctx.fill(); ctx.strokeStyle = 'rgba(251,245,236,0.10)'; ctx.lineWidth = 1; ctx.stroke(); }
function project(x, y, z, a) {
  _proj.set(x, y, z).project(R3.camera);
  return { x: (_proj.x * 0.5 + 0.5) * a.w, y: (-_proj.y * 0.5 + 0.5) * a.h, front: _proj.z < 1 && _proj.z > -1 };
}
// The minimap's walls, drawn once per map.
const miniCache = {};
function miniFor(G) {
  if (miniCache[G.id]) return miniCache[G.id];
  const S = 192, c = mkCanvas(S, S), g = c.getContext('2d'), k = S / GN;
  g.fillStyle = 'rgba(20,18,16,0.0)'; g.fillRect(0, 0, S, S);
  for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
    const ch = G.kind[z * GN + x];
    if (ch === '#' || ch === 'o') g.fillStyle = 'rgba(235,225,210,0.85)';
    else if (ch === 'b') g.fillStyle = 'rgba(235,225,210,0.55)';
    else if (ch === 'c') g.fillStyle = 'rgba(235,225,210,0.3)';
    else if (ch === 'x') g.fillStyle = 'rgba(0,0,0,0.0)';
    else g.fillStyle = G.bridge[z * GN + x] ? 'rgba(190,150,110,0.35)' : 'rgba(60,56,52,0.55)';
    g.fillRect(x * k, z * k, k + 0.5, k + 0.5);
  }
  miniCache[G.id] = c;
  return c;
}
function drawMinimap(ctx, a, W, x, y, R) {
  const P = W.P, scale = R / 20;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fillStyle = 'rgba(10,9,8,0.58)'; ctx.fill();
  ctx.clip();
  ctx.translate(x, y); ctx.rotate(P.yaw);
  const img = miniFor(W.G), sz = GN * CS * scale;
  ctx.drawImage(img, -P.pos.x * scale - sz / 2, -P.pos.z * scale - sz / 2, sz, sz);
  const dot = (px, pz, col, r0, ang) => {
    const dx = (px - P.pos.x) * scale, dz = (pz - P.pos.z) * scale;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(dx, dz, r0, 0, TAU); ctx.fill();
    if (ang != null) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(dx, dz); ctx.lineTo(dx - Math.sin(ang) * r0 * 2.2, dz - Math.cos(ang) * r0 * 2.2); ctx.stroke(); }
  };
  if (W.mode === 'ctf') W.flags.forEach((f) => { ctx.fillStyle = TEAMS[f.team].paint; const dx = (f.pos.x - P.pos.x) * scale, dz = (f.pos.z - P.pos.z) * scale; ctx.fillRect(dx - 4, dz - 6, 8, 6); ctx.fillRect(dx - 4, dz - 6, 1.5, 12); });
  const mk = W.mode === 'campaign' ? objMarker(W) : null;
  if (mk) { const dx = (mk[0] - P.pos.x) * scale, dz = (mk[2] - P.pos.z) * scale; ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(dx, dz - 6); ctx.lineTo(dx + 5, dz); ctx.lineTo(dx, dz + 6); ctx.lineTo(dx - 5, dz); ctx.fill(); }
  W.chars.forEach((c) => {
    if (!c.alive || c === P) return;
    if (c.team === P.team) { dot(c.pos.x, c.pos.z, TEAMS[c.team].ui, 3.2, c.yaw); return; }
    const intel = W.intel[P.team][c.id], seen = intel && W.t - intel.t < 1.2, firing = c.fireT > -0.4 && c.fireT < 1;
    if (W.radarT > 0 || seen || (firing && Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < 26) || c.isBoss) dot(c.pos.x, c.pos.z, c.isBoss ? GOLD : '#ff5a5a', c.isBoss ? 4.4 : 3.4, null);
  });
  if (W.drone) dot(W.drone.x, W.drone.z, '#38e1ff', 3, null);
  ctx.restore();
  // you, always pointing up
  ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 5, y + 5); ctx.lineTo(x, y + 2.5); ctx.lineTo(x - 5, y + 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = W.radarT > 0 ? 'rgba(56,225,255,' + (0.5 + 0.3 * Math.sin(R3.time * 6)) + ')' : 'rgba(251,245,236,0.22)'; ctx.lineWidth = W.radarT > 0 ? 2.5 : 1.2;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
  txt(ctx, 'N', x + Math.sin(-P.yaw) * (R - 9) * -1, y - Math.cos(P.yaw) * (R - 9), 10, DIM, 'center', '700');
}
function drawHUD(ctx, a, W, I) {
  const P = W.P, pad = a.hudPad(), w = a.w, h = a.h, sm = w < 560, r = R3;
  const letterK = W.phase === 'intro' || W.phase === 'final' || (W.tagcam && !P.alive) ? 1 : 0;
  r.letter = damp(r.letter || 0, letterK, 6, 1 / 60);
  const lb = h * 0.1 * r.letter;
  if (lb > 0.5) { ctx.fillStyle = '#050403'; ctx.fillRect(0, 0, w, lb); ctx.fillRect(0, h - lb, w, lb); }
  if (W.phase === 'intro') { drawIntro(ctx, a, W, lb); drawFade(ctx, a, W); return; }
  if (W.phase === 'results') { drawFade(ctx, a, W); return; }
  const fp = r.firstPerson && P.alive;
  // scope for the Longshot
  const scoped = fp && P.gun === 2 && P.adsK > 0.85;
  if (scoped) {
    const R = Math.min(w, h) * 0.42;
    ctx.save(); ctx.fillStyle = 'rgba(4,4,6,0.96)'; ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(w / 2, h / 2, R, 0, TAU, true); ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,12,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2 - R, h / 2); ctx.lineTo(w / 2 + R, h / 2); ctx.moveTo(w / 2, h / 2 - R); ctx.lineTo(w / 2, h / 2 + R); ctx.stroke();
    ctx.fillStyle = TEAMS[P.team].paint; ctx.beginPath(); ctx.arc(w / 2, h / 2, 2.5, 0, TAU); ctx.fill();
    const vg = ctx.createRadialGradient(w / 2, h / 2, R * 0.7, w / 2, h / 2, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)'); ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // squad name tags
  if (fp) W.chars.forEach((c) => {
    if (c === P || !c.alive || c.team !== P.team || c.fade < 0.5) return;
    const p = project(c.pos.x, c.pos.y + 2.05, c.pos.z, a); if (!p.front) return;
    const d = Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z); if (d > 40) return;
    txt(ctx, c.name, p.x, p.y, 11, TEAMS[c.team].ui, 'center', '700');
    ctx.fillStyle = TEAMS[c.team].ui; ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + 8); ctx.lineTo(p.x + 4, p.y + 8); ctx.lineTo(p.x, p.y + 13); ctx.fill();
  });
  // objective marker / flags on screen
  const marks = [];
  const mk = W.mode === 'campaign' ? objMarker(W) : null;
  if (mk) marks.push([mk[0], mk[1] + 0.6, mk[2], mk[3], GOLD]);
  if (W.mode === 'ctf') W.flags.forEach((f) => { const lbl = f.team === P.team ? (f.state === 'home' ? 'Defend' : f.state === 'carried' ? 'Stop carrier' : 'Return') : (f.state === 'carried' && f.carrier === P ? null : f.state === 'carried' ? 'Escort' : 'Take'); if (lbl) marks.push([f.pos.x, f.pos.y + 2.9, f.pos.z, lbl, TEAMS[f.team].ui]); });
  if (W.mode === 'ctf' && P.carry >= 0) { const hm = W.flags[P.team].home; marks.push([hm.x, 2.6, hm.z, 'Capture', TEAMS[P.team].ui]); }
  if (fp || !P.alive) marks.forEach(([x, y, z, lbl, col]) => {
    const p = project(x, y, z, a), d = Math.round(Math.hypot(x - P.pos.x, z - P.pos.z));
    let sx = p.x, sy = p.y, off = !p.front || sx < 30 || sx > w - 30 || sy < 70 || sy > h - 90;
    if (off) {
      // pin to the edge, pointing the way
      const ang = Math.atan2(-(x - P.pos.x), -(z - P.pos.z)) - P.yaw, cx = w / 2, cy = h / 2;
      const dx = -Math.sin(ang), dy = -Math.cos(ang), k = Math.min((w / 2 - 40) / Math.max(0.01, Math.abs(dx)), (h / 2 - 100) / Math.max(0.01, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 4); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill(); ctx.restore();
    } else {
      ctx.save(); ctx.translate(sx, sy); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 0); ctx.lineTo(0, 10); ctx.lineTo(-8, 0); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    txt(ctx, lbl.toUpperCase() + '  ' + d + ' m', sx, sy + (off ? -20 : 21), 11, col, 'center', '700');
  });
  // crosshair, hit marker
  if (fp && !scoped) {
    const G = GUNS[P.gun], sp = spreadOf(P, G), fov = R3.camera.fov * Math.PI / 180;
    const gap = clamp(Math.tan(sp) / Math.tan(fov / 2) * h / 2, 3, 60) + 4 + P.recoilK * 4;
    const col = 'rgba(251,245,236,' + (0.9 - P.adsK * 0.4) + ')';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3.5;
    const cx = w / 2, cy = h / 2, L = sm ? 7 : 9;
    const lines = () => { ctx.beginPath(); ctx.moveTo(cx - gap - L, cy); ctx.lineTo(cx - gap, cy); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + L, cy); ctx.moveTo(cx, cy - gap - L); ctx.lineTo(cx, cy - gap); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + L); ctx.stroke(); };
    lines(); ctx.strokeStyle = col; ctx.lineWidth = 1.6; lines();
    ctx.fillStyle = r.aimOn ? TEAMS[1 - P.team].paint : col; ctx.beginPath(); ctx.arc(cx, cy, r.aimOn ? 2.6 : 1.6, 0, TAU); ctx.fill();
    if (W.hitMark > 0) {
      const k = W.hitMark, kill = W.hitKill > 0, s = 7 + (1 - k) * 4 + (kill ? 4 : 0);
      ctx.strokeStyle = kill ? TEAMS[P.team].paint : W.hitHead > 0 ? GOLD : 'rgba(255,255,255,' + k + ')'; ctx.lineWidth = kill ? 3 : 2.2;
      ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s / 2.5, cy - s / 2.5); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s / 2.5, cy - s / 2.5); ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx - s / 2.5, cy + s / 2.5); ctx.moveTo(cx + s, cy + s); ctx.lineTo(cx + s / 2.5, cy + s / 2.5); ctx.stroke();
    }
    if (P.reloadT > 0) { const k = 1 - P.reloadT / G.reload; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 20, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke(); txt(ctx, 'RELOADING', cx, cy + 36, 10, INK, 'center', '700'); }
    else if (P.ammo[P.gun] <= Math.ceil(G.mag * 0.2)) txt(ctx, P.ammo[P.gun] ? 'LOW PAINT  R' : 'RELOAD  R', cx, cy + 36, 10, P.ammo[P.gun] ? GOLD : '#ff6a5a', 'center', '700');
  }
  // where the hits came from
  W.hurt.forEach((hh) => {
    const ang = hh.a - P.yaw, k = 1 - hh.t / 1.6, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.17;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-ang); ctx.strokeStyle = 'rgba(255,90,60,' + (0.8 * k) + ')'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35); ctx.stroke(); ctx.restore();
  });
  // score bar
  const sw0 = sm ? 196 : 300, sx0 = w / 2 - sw0 / 2, sy0 = pad.top;
  plate(ctx, sx0, sy0, sw0, 46, 12);
  const mid = W.mode === 'campaign' ? 'TICKETS ' + Math.max(0, W.tickets) : fmtClock(matchTime(W));
  ctx.fillStyle = TEAMS[0].paint; rr(ctx, sx0 + 6, sy0 + 6, 54, 34, 8); ctx.fill();
  txt(ctx, W.mode === 'campaign' ? '' + W.stats.objs + '/' + W.mission.objs.length : '' + W.score[0], sx0 + 33, sy0 + 23, 19, '#1a0d06', 'center', '800');
  if (W.mode !== 'campaign') { ctx.fillStyle = TEAMS[1].paint; rr(ctx, sx0 + sw0 - 60, sy0 + 6, 54, 34, 8); ctx.fill(); txt(ctx, '' + W.score[1], sx0 + sw0 - 33, sy0 + 23, 19, '#f5f7ff', 'center', '800'); }
  else { ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(ctx, sx0 + sw0 - 60, sy0 + 6, 54, 34, 8); ctx.fill(); txt(ctx, '' + W.stats.tags, sx0 + sw0 - 33, sy0 + 23, 17, INK, 'center', '800'); }
  txt(ctx, mid, w / 2, sy0 + 17, sm ? 13 : 15, INK, 'center', '700');
  txt(ctx, W.mode === 'ctf' ? (sm ? '3 FLAGS' : 'FIRST TO 3 FLAGS') : W.mode === 'splat' ? (sm ? 'TO 30' : 'FIRST TO 30 TAGS') : (sm ? 'MISSION' : W.mission.name.toUpperCase()), w / 2, sy0 + 34, 9, DIM, 'center', '600');
  // objective line
  let oy = sy0 + (sm ? 96 : 62);
  if (W.mode === 'campaign' && W.obj) {
    const ot = objectiveText(W);
    ctx.font = '600 13px ' + F_BODY; const tw = Math.min(w - 40, ctx.measureText(ot).width + 34);
    plate(ctx, w / 2 - tw / 2, oy - 13, tw, 26, 13, 0.5);
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(w / 2 - tw / 2 + 12, oy - 5); ctx.lineTo(w / 2 - tw / 2 + 17, oy); ctx.lineTo(w / 2 - tw / 2 + 12, oy + 5); ctx.lineTo(w / 2 - tw / 2 + 7, oy); ctx.fill();
    txt(ctx, ot, w / 2 + 8, oy, 13, INK, 'center', '600', F_BODY);
    if (W.obj.def.t === 'hold') { oy += 20; plate(ctx, w / 2 - 80, oy - 4, 160, 8, 4, 0.5); ctx.fillStyle = W.obj.contested ? '#ff6a5a' : GOLD; rr(ctx, w / 2 - 80, oy - 4, 160 * clamp(W.obj.prog / W.obj.def.time, 0, 1), 8, 4); ctx.fill(); if (W.obj.contested) txt(ctx, 'CONTESTED', w / 2, oy + 14, 10, '#ff6a5a', 'center', '700'); }
    const B = W.obj.boss;
    if (B && B.alive) { oy += 26; txt(ctx, 'CAPTAIN TOOFAN', w / 2, oy, 10, GOLD, 'center', '700'); plate(ctx, w / 2 - 110, oy + 8, 220, 9, 4, 0.5); ctx.fillStyle = '#b54ae8'; rr(ctx, w / 2 - 110, oy + 8, 220 * clamp(B.hp / B.hpMax, 0, 1), 9, 4); ctx.fill(); }
  } else if (W.mode === 'ctf') {
    W.flags.forEach((f, k) => { const st = f.state === 'home' ? 'HOME' : f.state === 'carried' ? 'TAKEN' : 'DROPPED'; txt(ctx, TEAMS[k].short + ' FLAG ' + st, w / 2 + (k ? 70 : -70), oy - 4, 10, f.state === 'home' ? DIM : TEAMS[k].ui, 'center', '700'); });
  }
  // minimap
  const mR = sm ? 38 : 62;
  drawMinimap(ctx, a, W, pad.left + mR + (sm ? 0 : 4), pad.top + mR + (sm ? 2 : 4), mR);
  // feed
  if (!sm || true) {
    let fy = sm ? oy + 30 : pad.top + 8;
    const fx = w - pad.right - 4, al = 'right';
    W.feed.slice(0, sm ? 3 : 5).forEach((f) => {
      const al2 = clamp((6 - f.t) / 0.6, 0, 1);
      ctx.globalAlpha = al2;
      const s = f.b.indexOf(' ') >= 0 && !f.how ? f.a + ' ' + f.b : f.a + '  ▸  ' + f.b;
      ctx.font = '600 ' + (sm ? 10 : 12) + 'px ' + F_BODY;
      const tw = ctx.measureText(s).width + 16;
      plate(ctx, al === 'right' ? fx - tw : fx, fy - 10, tw, 20, 8, 0.45);
      txt(ctx, s, al === 'right' ? fx - 8 : fx + 8, fy, sm ? 10 : 12, f.col, al, '600', F_BODY);
      ctx.globalAlpha = 1; fy += 23;
    });
  }
  // squad callouts
  let cy0 = h * (sm ? 0.6 : 0.62);
  W.calls.slice(0, 2).forEach((c) => {
    const al2 = clamp(Math.min(c.t / 0.25, (4.2 - c.t) / 0.5), 0, 1); ctx.globalAlpha = al2;
    ctx.font = '600 ' + (sm ? 12 : 14) + 'px ' + F_BODY;
    const tw = Math.min(w - 40, ctx.measureText(c.text).width + 22);
    plate(ctx, pad.left, cy0 - 13, tw, 26, 9, 0.5);
    ctx.fillStyle = TEAMS[0].ui; ctx.fillRect(pad.left, cy0 - 13, 3, 26);
    txt(ctx, c.text, pad.left + 12, cy0, sm ? 12 : 14, INK, 'left', '600', F_BODY);
    ctx.globalAlpha = 1; cy0 -= 30;
  });
  // score pops
  W.pops.forEach((p, k) => { const t = p.t / 1.4; ctx.globalAlpha = 1 - smooth01((t - 0.6) / 0.4); txt(ctx, p.text, w / 2, h / 2 + 60 + k * 22 - t * 26, sm ? 15 : 18, p.col, 'center', '800'); ctx.globalAlpha = 1; });
  // shield and marker panel
  const by = h - pad.bottom - 8, stack = a.touchMode && a.touchStyle !== 'pads';
  if (P.alive && W.phase === 'play') {
    const bw = sm ? 130 : 190;
    plate(ctx, pad.left, by - 46, bw + 20, 50, 12);
    txt(ctx, 'SHIELD', pad.left + 10, by - 34, 9, DIM, 'left', '700');
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; rr(ctx, pad.left + 10, by - 24, bw, 12, 6); ctx.fill();
    const hp = clamp(P.hp / P.hpMax, 0, 1);
    ctx.fillStyle = hp > 0.5 ? '#e9f2ff' : hp > 0.25 ? GOLD : '#ff6a5a'; rr(ctx, pad.left + 10, by - 24, Math.max(6, bw * hp), 12, 6); ctx.fill();
    // streak pips
    for (let k = 0; k < 5; k++) { ctx.fillStyle = k < P.streak ? (k < 3 ? '#38e1ff' : GOLD) : 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(pad.left + bw + 2 - (4 - k) * 11, by - 34, 3.5, 0, TAU); ctx.fill(); }
    const G = GUNS[P.gun], gw = sm ? 128 : 190;
    const ax0 = stack ? pad.left + gw + 6 : w - pad.right, ay0 = stack ? by - 58 : by;
    plate(ctx, ax0 - gw - 6, ay0 - 58, gw + 6, 62, 12);
    txt(ctx, '' + P.ammo[P.gun], ax0 - (sm ? 62 : 84), ay0 - 26, sm ? 26 : 32, P.ammo[P.gun] ? INK : '#ff6a5a', 'right', '800');
    txt(ctx, '/ ' + G.mag, ax0 - (sm ? 58 : 80), ay0 - 22, 12, DIM, 'left', '600');
    txt(ctx, G.name.toUpperCase(), ax0 - gw + 6, ay0 - 48, 10, GUNS[P.gun].acc === '#2d2f3a' ? '#ff8a6a' : GUNS[P.gun].acc, 'left', '800');
    for (let k = 0; k < 3; k++) { ctx.fillStyle = k === P.gun ? INK : 'rgba(255,255,255,0.18)'; rr(ctx, ax0 - gw + 6 + k * 18, ay0 - 6, 14, 4, 2); ctx.fill(); }
    if (P.carry >= 0) txt(ctx, P.carry === 2 ? 'CARRYING THE SPOOL' : 'CARRYING THE FLAG', w / 2, by - 12, 12, GOLD, 'center', '800');
  }
  // tag cam
  if (W.tagcam && !P.alive) {
    const T = W.tagcam, k = clamp(T.t / 0.4, 0, 1);
    ctx.globalAlpha = k;
    txt(ctx, 'TAG CAM', w / 2, lb + 26, 12, '#ff6a5a', 'center', '800');
    txt(ctx, T.killer ? 'Tagged by ' + T.killer.name : 'Tagged out', w / 2, h - lb - 46, sm ? 18 : 22, INK, 'center', '500', F_DISP);
    txt(ctx, (T.gun ? T.gun + ' · ' : '') + T.dist + ' m', w / 2, h - lb - 22, 11, DIM, 'center', '600');
    txt(ctx, 'Back in ' + Math.max(1, Math.ceil(P.respawnT)), w / 2, h / 2 + (sm ? 90 : 120), 13, GOLD, 'center', '700');
    ctx.globalAlpha = 1;
  }
  if (W.phase === 'final') {
    const k = clamp(W.final.t / 0.5, 0, 1); ctx.globalAlpha = k;
    txt(ctx, W.why === 'tickets' ? 'SQUAD OUT OF TICKETS' : W.final.victim ? 'FINAL TAG' : 'TIME', w / 2, lb + 30, 13, GOLD, 'center', '800');
    const won = W.winner === P.team, draw = W.winner < 0;
    txt(ctx, draw ? 'Draw' : (W.mode === 'campaign' ? (won ? 'Mission complete' : 'Mission failed') : TEAMS[W.winner].name + ' win'), w / 2, h - lb - 34, sm ? 24 : 32, draw ? INK : TEAMS[Math.max(0, W.winner)].ui, 'center', '500', F_DISP);
    ctx.globalAlpha = 1;
  }
  // touch helpers
  if (a.touchMode && a.state === 'play') drawTouch(ctx, a, W);
  drawFade(ctx, a, W);
}
function drawIntro(ctx, a, W, lb) {
  const w = a.w, h = a.h, t = W.phaseT, sm = w < 560;
  const k = clamp(t / 0.6, 0, 1) * clamp((W.introDur - t) / 0.5, 0, 1);
  ctx.globalAlpha = k;
  if (W.mode === 'campaign') {
    const L = W.mission.intro;
    txt(ctx, L[0], w / 2, lb + 32, sm ? 12 : 14, GOLD, 'center', '800');
    const shown = Math.floor(clamp((t - 0.6) / 2.2, 0, 1) * W.mission.brief.length);
    ctx.font = '500 ' + (sm ? 14 : 17) + 'px ' + F_BODY;
    wrap(ctx, W.mission.brief.slice(0, shown), w / 2, h - lb - (sm ? 96 : 84), Math.min(w - 48, 620), sm ? 19 : 23, INK);
    txt(ctx, L[1] + '  ·  ' + L[2], w / 2, h - lb - 20, 11, DIM, 'center', '600');
  } else {
    txt(ctx, W.mode === 'ctf' ? 'CAPTURE THE FLAG' : 'TEAM SPLAT', w / 2, lb + 32, sm ? 12 : 14, GOLD, 'center', '800');
    txt(ctx, W.M.name, w / 2, h - lb - 54, sm ? 28 : 38, INK, 'center', '500', F_DISP);
    txt(ctx, W.M.when + '  ·  ' + TEAMS[0].name + ' vs ' + TEAMS[1].name, w / 2, h - lb - 22, 11, DIM, 'center', '600');
  }
  txt(ctx, a.touchMode ? 'Tap to skip' : 'Click or press Space to skip', w / 2, lb + 54, 10, 'rgba(251,245,236,0.5)', 'center', '600');
  ctx.globalAlpha = 1;
}
function wrap(ctx, s, x, y, maxW, lh, col) {
  const words = s.split(' '); let line = '', lines = [];
  words.forEach((wd) => { const tl = line ? line + ' ' + wd : wd; if (ctx.measureText(tl).width > maxW && line) { lines.push(line); line = wd; } else line = tl; });
  if (line) lines.push(line);
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1)) * lh));
}
function drawFade(ctx, a, W) {
  W.fadeIn = Math.max(0, (W.fadeIn || 0) - 1 / 60 * 2.4);
  const k = Math.max(W.fadeIn, R3.fadeAll || 0);
  if (k > 0.01) { ctx.fillStyle = 'rgba(4,3,2,' + k + ')'; ctx.fillRect(0, 0, a.w, a.h); }
}
function drawTouch(ctx, a, W) {
  const T = TOUCH;
  if (a.touchStyle !== 'pads') {
    if (T.move) { ctx.strokeStyle = 'rgba(251,245,236,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(T.move.sx, T.move.sy, 52, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(251,245,236,0.32)'; ctx.beginPath(); ctx.arc(T.move.sx + T.mx * 52, T.move.sy + T.mz * 52, 22, 0, TAU); ctx.fill(); }
    else if (W.t < 14 + W.introDur) { ctx.globalAlpha = 0.55; txt(ctx, 'MOVE', a.w * 0.22, a.h * 0.72, 11, INK, 'center', '700'); txt(ctx, 'LOOK', a.w * 0.72, a.h * 0.72, 11, INK, 'center', '700'); ctx.strokeStyle = 'rgba(251,245,236,0.25)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(a.w / 2, a.h * 0.55); ctx.lineTo(a.w / 2, a.h * 0.86); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
  }
  if (ARC.choices.autofire !== 'off' && W.P.alive) txt(ctx, 'AUTO FIRE', a.w / 2, a.h / 2 + 54, 9, R3.aimOn ? TEAMS[1].ui : 'rgba(251,245,236,0.35)', 'center', '700');
}

/* ------------------------------------------------------------ sound: synthesised, panned, gated on mute */
function audio() {
  if (AU) return AU;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx; try { ctx = new AC(); } catch (e) { return null; }
  const master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(master);
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  AU = { ctx, master, comp, noise: buf, amb: null };
  return AU;
}
function muted() { return !ARC || ARC.sfx.muted || (Wd && Wd.attract); }
// Nine markers firing at once would be hundreds of voices: far and frequent sounds share a budget.
const VOICE = { t: 0, n: 0 };
function voiceOk(vol) { const now = performance.now(); if (now - VOICE.t > 100) { VOICE.t = now; VOICE.n = 0; } if (vol < 0.05) return false; return ++VOICE.n <= 4; }
function out(pan) { const A = AU; if (pan == null || !A.ctx.createStereoPanner) return A.comp; const p = A.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(A.comp); return p; }
function noiseHit(dur, f, type, vol, pan, q, slideTo, delay) {
  const A = AU; if (!A || muted() || A.ctx.state !== 'running') return;
  const t = A.ctx.currentTime + (delay || 0), src = A.ctx.createBufferSource(); src.buffer = A.noise;
  const fl = A.ctx.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.setValueAtTime(f, t); if (q) fl.Q.value = q; if (slideTo) fl.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(out(pan));
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
function toneHit(freq, dur, type, vol, pan, slide, delay) {
  const A = AU; if (!A || muted() || A.ctx.state !== 'running') return;
  const t = A.ctx.currentTime + (delay || 0), o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur + 0.05);
}
// Where a sound sits relative to your ears: pan and distance.
function place(x, z) {
  const W = Wd; if (!W || !R3) return { pan: 0, vol: 1 };
  const cp = R3.camera.position, dx = x - cp.x, dz = z - cp.z, d = Math.hypot(dx, dz);
  const yaw = W.attract ? 0 : W.P.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return { pan: d > 0.5 ? (dx * rx + dz * rz) / d * 0.85 : 0, vol: clamp(1 / (1 + d * 0.09), 0.04, 1) };
}
function sfxShot(c, G, mine) {
  const p = mine ? { pan: 0, vol: 1 } : place(c.pos.x, c.pos.z), k = mine ? 1 : 0.7;
  if (!mine && !voiceOk(p.vol)) return;
  const f = G.id === 'long' ? 900 : G.id === 'burst' ? 1500 : 1900;
  noiseHit(0.09, f * 2, 'bandpass', 0.32 * p.vol * k, p.pan, 1.2, f * 0.6);
  toneHit(G.id === 'long' ? 120 : 170, 0.08, 'sine', 0.22 * p.vol * k, p.pan, 60);
  if (mine) noiseHit(0.16, 4000, 'highpass', 0.06, 0, 0, 0, 0.02);
}
function sfxShotAt(x, y, z, v, pitch) { const p = place(x, z); noiseHit(0.08, 2400 * (pitch || 1), 'bandpass', 0.25 * p.vol * v, p.pan, 1.2, 900); }
function sfxSplat(x, y, z, v) { const p = place(x, z); if (v < 0.5 && !voiceOk(p.vol)) return; noiseHit(0.14, 900, 'lowpass', 0.32 * p.vol * v, p.pan, 0, 220); toneHit(260 + Math.random() * 80, 0.06, 'triangle', 0.08 * p.vol * v, p.pan, 120); }
function sfxHitMark(head) { toneHit(head ? 1760 : 1320, 0.05, 'square', 0.06, 0); if (head) toneHit(2200, 0.06, 'triangle', 0.05, 0, null, 0.04); }
function sfxTag() { toneHit(660, 0.09, 'triangle', 0.16, 0); toneHit(990, 0.14, 'triangle', 0.14, 0, null, 0.07); }
function sfxHurt() { noiseHit(0.18, 500, 'lowpass', 0.4, 0, 0, 120); toneHit(90, 0.15, 'sine', 0.3, 0, 50); }
function sfxReload() { noiseHit(0.05, 3000, 'bandpass', 0.18, 0.2, 4); noiseHit(0.05, 2400, 'bandpass', 0.16, 0.2, 4, 0, 0.25); toneHit(420, 0.05, 'square', 0.04, 0.2, null, 0.5); }
function sfxReloadDone() { noiseHit(0.04, 3600, 'bandpass', 0.2, 0.2, 5); toneHit(880, 0.05, 'triangle', 0.06, 0.2, null, 0.02); }
function sfxSwap() { noiseHit(0.06, 2000, 'bandpass', 0.14, 0.2, 3); }
function sfxJump() { noiseHit(0.12, 600, 'lowpass', 0.14, 0, 0, 200); }
function sfxLand() { noiseHit(0.14, 400, 'lowpass', 0.3, 0, 0, 100); }
function sfxStep(c, sp) {
  if (!c.isPlayer && Math.random() < 0.5) return;
  const p = c.isPlayer ? { pan: 0, vol: 1 } : place(c.pos.x, c.pos.z), W = Wd;
  if (!c.isPlayer && !voiceOk(p.vol * 0.6)) return;
  const wet = W && W.mapId === 'roof', sand = W && W.mapId === 'fort';
  noiseHit(0.07, wet ? 1800 : sand ? 1100 : 700, wet ? 'bandpass' : 'lowpass', (c.isPlayer ? 0.07 : 0.1) * p.vol * clamp(sp / 5, 0.4, 1.2), p.pan, wet ? 2 : 0, wet ? 600 : 200);
}
function sfxObjective() { toneHit(523, 0.14, 'triangle', 0.12, 0); toneHit(784, 0.2, 'triangle', 0.12, 0, null, 0.12); }
function sfxPickup() { toneHit(740, 0.08, 'triangle', 0.14, 0); toneHit(1110, 0.16, 'triangle', 0.12, 0, null, 0.08); }
function sfxCapture(mine) { [523, 659, 784, 1046].forEach((f, i) => toneHit(mine ? f : f * 0.75, 0.22, 'triangle', 0.12, 0, null, i * 0.09)); }
function sfxAlarm() { toneHit(880, 0.14, 'square', 0.06, 0); toneHit(660, 0.14, 'square', 0.06, 0, null, 0.16); }
function sfxStreak() { [392, 523, 659, 784].forEach((f, i) => toneHit(f, 0.16, 'sawtooth', 0.05, 0, null, i * 0.06)); }
function sfxTaggedOut() { toneHit(330, 0.4, 'triangle', 0.14, 0, 160); noiseHit(0.5, 700, 'lowpass', 0.2, 0, 0, 150); }
function sfxFinal(won) { (won ? [392, 494, 587, 784] : [392, 349, 311, 262]).forEach((f, i) => toneHit(f, 0.34, 'triangle', 0.12, 0, null, i * 0.16)); noiseHit(1.6, 2000, 'bandpass', 0.06, 0, 0.6, 600, 0.5); }
function sfxGo() { toneHit(587, 0.1, 'square', 0.06, 0); toneHit(880, 0.18, 'square', 0.06, 0, null, 0.1); }
function sfxThunder() { const d = 0.5 + Math.random() * 1.2; noiseHit(2.4, 260, 'lowpass', 0.5, (Math.random() - 0.5) * 0.6, 0, 60, d); noiseHit(0.5, 1200, 'lowpass', 0.25, 0, 0, 300, d); }
// Looping air for each map: rain, a dusty wind, the desert breeze.
function ambience(mapId) {
  const A = AU; if (!A) return;
  if (A.amb && A.amb.id === mapId) { A.amb.g.gain.setTargetAtTime(muted() ? 0 : A.amb.vol, A.ctx.currentTime, 0.3); return; }
  if (A.amb) { const old = A.amb; old.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2); setTimeout(() => { try { old.src.stop(); } catch (e) { /* stopped */ } }, 900); }
  const src = A.ctx.createBufferSource(); src.buffer = A.noise; src.loop = true;
  const f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
  const vol = mapId === 'roof' ? 0.16 : mapId === 'fort' ? 0.05 : 0.045;
  if (mapId === 'roof') { f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.4; } else { f.type = 'lowpass'; f.frequency.value = mapId === 'fort' ? 700 : 420; }
  g.gain.value = 0; src.connect(f); f.connect(g); g.connect(A.master); src.start();
  g.gain.setTargetAtTime(muted() ? 0 : vol, A.ctx.currentTime, 0.6);
  A.amb = { id: mapId, src, g, vol, f };
}
function ambienceOff() { const A = AU; if (A && A.amb) A.amb.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2); }
function onPlayerShot(W, c, G) {
  R3.muzzleT = 0.05; R3.kick = (R3.kick || 0) + G.kick * 0.011 * (1 - c.adsK * 0.5);
  c.pitch = Math.min(1.4, c.pitch + G.kick * 0.0035);
  sfxShot(c, G, true);
  feel('tap', G.id === 'long' ? 0.9 : G.id === 'burst' ? 0.45 : 0.25, G.id === 'long' ? 16 : 6, [G.id === 'long' ? 0.6 : 0.18, G.id === 'long' ? 0.4 : 0.25, G.id === 'long' ? 110 : 45]);
}
// One call for the phone's motor and the controller's rumble: the shell's own
// patterns when it has them, else a plain buzz plus a dual-rumble effect.
function feel(kind, strength, ms, rb) {
  if (!ARC) return;
  if (typeof ARC.haptic === 'function') { ARC.haptic(kind, strength); return; }
  ARC.buzz(ms);
  rumble(rb[0], rb[1], rb[2]);
}
function rumble(strong, weak, ms) {
  if (!ARC || ARC.prefs.haptics === 'off' || !navigator.getGamepads) return;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) { const p = pads[i]; if (p && p.connected && p.vibrationActuator && p.vibrationActuator.playEffect) { p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }).catch(() => {}); break; } }
  } catch (e) { /* no rumble */ }
}

/* ------------------------------------------------------------ input: mouse with pointer lock, two thumbs, a controller */
const MOUSE = { left: false, right: false, leftHit: false, dx: 0, dy: 0, lx: null, ly: null, wheel: 0, lockLostAt: -1e9 };
const TOUCH = { move: null, look: null, mx: 0, mz: 0, ldx: 0, ldy: 0, tap: false, aim: false, crouch: false };
const PAD = { sprint: false, prevL3: false, prevRB: false, prevLB: false };
const locked = () => !!ARC && document.pointerLockElement === ARC.canvas;
function requestLock() {
  if (!ARC || ARC.touchMode || locked()) return;
  try { const p = ARC.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed here */ }
}
function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* fine */ } }
function wireInput(a) {
  const cv = a.canvas;
  cv.addEventListener('mousedown', (e) => {
    if (a.touchMode) return;
    if (e.button === 0) { MOUSE.left = true; MOUSE.leftHit = true; }
    if (e.button === 2) MOUSE.right = true;
    MOUSE.lx = e.clientX; MOUSE.ly = e.clientY;
    if (a.state === 'play') requestLock();
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) MOUSE.left = false; if (e.button === 2) MOUSE.right = false; });
  document.addEventListener('mousemove', (e) => {
    if (locked()) { MOUSE.dx += e.movementX || 0; MOUSE.dy += e.movementY || 0; return; }
    if (MOUSE.left && a.state === 'play' && !a.touchMode && MOUSE.lx != null) { MOUSE.dx += e.clientX - MOUSE.lx; MOUSE.dy += e.clientY - MOUSE.ly; }
    MOUSE.lx = e.clientX; MOUSE.ly = e.clientY;
  });
  cv.addEventListener('wheel', (e) => { if (a.state !== 'play') return; e.preventDefault(); MOUSE.wheel += Math.sign(e.deltaY); }, { passive: false });
  document.addEventListener('pointerlockchange', () => {
    if (!locked() && a.state === 'play' && Wd && !Wd.over && Wd.phase !== 'results') { MOUSE.lockLostAt = performance.now(); a.pause(); }
  });
  // the Escape that freed the pointer must not also resume the game
  window.addEventListener('keydown', (e) => { if ((e.code === 'Escape') && performance.now() - MOUSE.lockLostAt < 450) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r.width]; };
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || a.state !== 'play') return;
    const [x, y, rw] = local(e), gest = a.touchStyle !== 'pads';
    if (gest && x < rw * 0.5 && !TOUCH.move) { TOUCH.move = { id: e.pointerId, sx: x, sy: y }; TOUCH.mx = TOUCH.mz = 0; }
    else if (!TOUCH.look) TOUCH.look = { id: e.pointerId, x, y, t0: performance.now(), moved: 0 };
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    const [x, y] = local(e);
    if (TOUCH.move && e.pointerId === TOUCH.move.id) {
      let dx = (x - TOUCH.move.sx) / 52, dy = (y - TOUCH.move.sy) / 52; const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; TOUCH.move.sx = x - dx * 52; TOUCH.move.sy = y - dy * 52; }
      TOUCH.mx = dx; TOUCH.mz = dy;
    } else if (TOUCH.look && e.pointerId === TOUCH.look.id) {
      const dx = x - TOUCH.look.x, dy = y - TOUCH.look.y; TOUCH.ldx += dx; TOUCH.ldy += dy; TOUCH.look.moved += Math.abs(dx) + Math.abs(dy); TOUCH.look.x = x; TOUCH.look.y = y;
    }
  });
  const end = (e) => {
    if (TOUCH.move && e.pointerId === TOUCH.move.id) { TOUCH.move = null; TOUCH.mx = TOUCH.mz = 0; }
    if (TOUCH.look && e.pointerId === TOUCH.look.id) { if (TOUCH.look.moved < 12 && performance.now() - TOUCH.look.t0 < 280 && e.type === 'pointerup') TOUCH.tap = true; TOUCH.look = null; }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}
function clearInput() { MOUSE.left = MOUSE.right = MOUSE.leftHit = false; MOUSE.dx = MOUSE.dy = 0; MOUSE.wheel = 0; TOUCH.move = TOUCH.look = null; TOUCH.mx = TOUCH.mz = TOUCH.ldx = TOUCH.ldy = 0; TOUCH.tap = false; TOUCH.aim = false; TOUCH.crouch = false; }
function firstPad() { if (!navigator.getGamepads) return null; try { const all = navigator.getGamepads(); for (let i = 0; i < all.length; i++) if (all[i] && all[i].connected) return all[i]; } catch (e) { /* none */ } return null; }
// Which rival sits under the sight, for aim assist and touch auto fire.
function sightTarget(W, P) {
  eyeOf(P, _a); aimDir(P.yaw, P.pitch, _f);
  let best = null, ba = 1e9;
  for (const c of W.chars) {
    if (!c.alive || c.team === P.team || c.fade < 0.6) continue;
    const ty = c.pos.y + lerp(1.25, 0.9, c.crouchK), dx = c.pos.x - _a.x, dy = ty - _a.y, dz = c.pos.z - _a.z, d = Math.hypot(dx, dy, dz);
    if (d > 60) continue;
    const ang = Math.acos(clamp((dx * _f.x + dy * _f.y + dz * _f.z) / d, -1, 1));
    const cone = Math.atan2(0.55, d) + 0.02;
    if (ang > cone * 2.6) continue;
    if (!clearLine(W.G, _a.x, _a.y, _a.z, c.pos.x, ty, c.pos.z)) continue;
    if (ang < ba) { ba = ang; best = { c, ang, cone, d, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; }
  }
  return best;
}
function gatherInput(a, W, dt) {
  const inp = a.input, P = W.P, G = GUNS[P.gun];
  const I = { mx: 0, mz: 0, lx: 0, ly: 0, fire: false, fireHit: false, aim: false, reloadHit: false, jumpHit: false, crouch: false, sprint: false, gunTo: -1, nextGun: false, skip: false };
  if (inp.down('KeyA')) I.mx -= 1; if (inp.down('KeyD')) I.mx += 1;
  if (inp.down('KeyW', 'ArrowUp')) I.mz -= 1; if (inp.down('KeyS', 'ArrowDown')) I.mz += 1;
  const turnK = 2.3 / Math.pow(lerp(1, G.zoom, P.adsK), 0.8);
  if (inp.down('ArrowLeft')) I.lx -= turnK * dt; if (inp.down('ArrowRight')) I.lx += turnK * dt;
  if (inp.stick.active) { I.mx += inp.stick.x; I.mz += inp.stick.y; }
  if (inp.pad.active) { I.mx += inp.pad.x; I.mz += inp.pad.y; }
  if (TOUCH.move) { I.mx += TOUCH.mx; I.mz += TOUCH.mz; }
  const ml = Math.hypot(I.mx, I.mz); if (ml > 1) { I.mx /= ml; I.mz /= ml; }
  const zoom = Math.pow(lerp(1, G.zoom, P.adsK), 0.85), sens = a.prefs.sens === 'high' ? 1.35 : a.prefs.sens === 'low' ? 0.72 : 1;
  I.lx += MOUSE.dx * 0.0023 / zoom; I.ly += MOUSE.dy * 0.0023 / zoom; MOUSE.dx = MOUSE.dy = 0;
  let assistLook = 1;
  I.lx += TOUCH.ldx * 0.0062 * sens / zoom; I.ly += TOUCH.ldy * 0.0062 * sens / zoom; const touchLooked = TOUCH.ldx || TOUCH.ldy; TOUCH.ldx = TOUCH.ldy = 0;
  // controller right stick, L3 sprint, bumpers cycle markers
  const gp = a.gamepad ? firstPad() : null;
  let padLook = false;
  if (gp) {
    const dz = (v) => (Math.abs(v) < 0.14 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.14) / 0.86, 1.7));
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (rx || ry) { padLook = true; I.lx += rx * 3.1 * dt / zoom; I.ly += ry * 2.3 * dt / zoom; }
    const l3 = !!(gp.buttons[10] && gp.buttons[10].pressed), rb = !!(gp.buttons[5] && gp.buttons[5].pressed), lb = !!(gp.buttons[4] && gp.buttons[4].pressed);
    if (l3 && !PAD.prevL3) PAD.sprint = !PAD.sprint;
    if (rb && !PAD.prevRB) I.nextGun = true;
    if (lb && !PAD.prevLB) I.gunTo = (P.gun + 2) % 3;
    PAD.prevL3 = l3; PAD.prevRB = rb; PAD.prevLB = lb;
    if (ml < 0.3) PAD.sprint = false;
  }
  I.fire = MOUSE.left || inp.down('KeyJ');
  I.fireHit = MOUSE.leftHit || inp.hit('KeyJ') || TOUCH.tap;
  if (TOUCH.tap) I.fire = true;
  if (a.touchMode) { if (inp.hit('KeyK')) TOUCH.aim = !TOUCH.aim; I.aim = TOUCH.aim; } else I.aim = MOUSE.right || inp.down('KeyK');
  I.reloadHit = inp.hit('KeyR');
  I.jumpHit = inp.hit('Space');
  if (a.touchMode) { if (inp.hit('KeyC')) TOUCH.crouch = !TOUCH.crouch; I.crouch = TOUCH.crouch; if (I.jumpHit) TOUCH.crouch = false; }
  else I.crouch = inp.down('KeyC', 'ControlLeft', 'ControlRight');
  I.sprint = inp.down('ShiftLeft', 'ShiftRight') || PAD.sprint || (TOUCH.move && TOUCH.mz < -0.9);
  if (inp.hit('Digit1')) I.gunTo = 0; if (inp.hit('Digit2')) I.gunTo = 1; if (inp.hit('Digit3')) I.gunTo = 2;
  if (inp.hit('KeyQ') || MOUSE.wheel) I.nextGun = true; MOUSE.wheel = 0;
  I.skip = I.fireHit || I.jumpHit || inp.hit('Enter') || TOUCH.tap || inp.hit('Escape');
  MOUSE.leftHit = false; TOUCH.tap = false;
  // aim assist for thumbs and sticks, never for a mouse
  const st = P.alive && W.phase === 'play' ? sightTarget(W, P) : null;
  R3.aimOn = !!(st && st.ang < st.cone);
  const assisted = (a.touchMode || a.inputMode === 'gamepad') && st;
  if (assisted) {
    const k = W.diffIdx === 0 ? 1.4 : W.diffIdx === 2 ? 0.75 : 1;
    if (st.ang < st.cone * 1.8) { assistLook = 0.55; I.lx *= assistLook; I.ly *= assistLook; }
    if (ml > 0.2 || padLook || touchLooked) {
      const rate = 0.7 * k * dt;
      I.lx += clamp(-angDiff(P.yaw, st.yaw), -rate, rate); I.ly += clamp(-(st.pitch - P.pitch), -rate * 0.6, rate * 0.6);
    }
    if (I.aim && !PAD.wasAim && st.ang < 0.18) { I.lx += -angDiff(P.yaw, st.yaw) * 0.6 * k; I.ly += -(st.pitch - P.pitch) * 0.6 * k; }
    if (a.touchMode && a.choices.autofire !== 'off' && R3.aimOn && st.d < G.range * 1.2) { I.fire = true; I.fireHit = true; }
  }
  PAD.wasAim = I.aim;
  return I;
}

/* ------------------------------------------------------------ results, menu, the shell */
function scoreOf(W) {
  const s = W.stats, won = W.winner === W.P.team, draw = W.winner < 0;
  let pts = s.tags * 100 + s.heads * 50 + s.bestStreak * 40 + s.caps * 600 + s.objs * 500;
  pts += won ? (W.mode === 'campaign' ? 2000 + Math.max(0, W.tickets) * 50 : 1500) : draw ? 500 : 0;
  pts = Math.round(pts * (W.diffIdx === 0 ? 0.8 : W.diffIdx === 2 ? 1.3 : 1));
  return pts;
}
function showResults(W) {
  const a = ARC, s = W.stats, won = W.winner === W.P.team, draw = W.winner < 0, pts = scoreOf(W);
  const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  let title, eyebrow, again = 'Play again';
  if (W.mode === 'campaign') {
    eyebrow = W.mission.name; title = won ? 'Mission <em>complete</em>' : 'Mission <em>failed</em>';
    const mi = W.cfg.mission;
    if (won) {
      SAVE.unlocked = Math.max(SAVE.unlocked, Math.min(MISSIONS.length, mi + 2)); saveGame();
      if (mi + 1 < MISSIONS.length) { a.choices.mission = String(mi + 1); a.store.set('arcade.paint-ops.mission', String(mi + 1)); again = 'Next mission'; }
    }
  } else { eyebrow = W.mode === 'ctf' ? 'Capture the Flag' : 'Team Splat'; title = draw ? 'A <em>draw</em>' : won ? TEAMS[W.P.team].name + ' <em>win</em>' : TEAMS[1 - W.P.team].name + ' <em>win</em>'; }
  const key = W.mode === 'campaign' ? 'm' + W.cfg.mission : W.mode;
  SAVE.best[key] = Math.max(SAVE.best[key] || 0, pts); saveGame();
  const rows = [['Tags', s.tags], ['Times tagged', s.outs], ['Accuracy', acc + '%'], ['Visor splats', s.heads], ['Best streak', s.bestStreak]];
  if (W.mode === 'ctf') rows.splice(1, 0, ['Flags captured', s.caps]);
  if (W.mode === 'campaign') rows.splice(1, 0, ['Objectives', s.objs + ' / ' + W.mission.objs.length]);
  const sq = W.chars.filter((c) => !c.isBoss).slice().sort((x, y) => (y.tags + y.caps * 3) - (x.tags + x.caps * 3)).slice(0, 4);
  const html = (W.mode !== 'campaign' ? '<p class="po-final">' + TEAMS[0].short + ' ' + W.score[0] + ' : ' + W.score[1] + ' ' + TEAMS[1].short + '</p>' : '<p class="po-final">' + (won ? 'Squad tickets left: ' + Math.max(0, W.tickets) : 'The squad ran out of tickets. Regroup and try again.') + '</p>') +
    '<div class="po-stats">' + rows.map((r) => '<span>' + r[0] + '<b>' + r[1] + '</b></span>').join('') + '</div>' +
    '<div class="po-top">' + sq.map((c, i) => '<span style="color:' + TEAMS[c.team].ui + '">' + (i + 1) + '. ' + a.esc(c.name) + ' <b>' + c.tags + '</b></span>').join('') + '</div>';
  a.over({ eyebrow, title, html, score: pts, scoreLabel: 'Points', again });
}
function missionLocked(i) { return i >= SAVE.unlocked; }
function briefHtml() {
  const ch = ARC.choices, mode = ch.mode || 'splat';
  if (mode === 'campaign') {
    let mi = parseInt(ch.mission || '0', 10) || 0; const Ms = MISSIONS[mi];
    const lock = missionLocked(mi);
    return '<b>' + ARC.esc(Ms.name) + '</b> · ' + ARC.esc(MAPS[Ms.map].name) + '<br>' + (lock ? 'Locked: finish the mission before it first.' : ARC.esc(Ms.brief)) + '<ol>' + Ms.objs.map((o) => '<li>' + ARC.esc(o.text) + '</li>').join('') + '</ol>';
  }
  const M = MAPS[ch.map] || MAPS.mill;
  return '<b>' + ARC.esc(M.name) + '</b> · ' + ARC.esc(M.when) + '<br>' + ARC.esc(M.blurb) + '<br>' + (mode === 'ctf' ? 'Steal the rival flag from their base and carry it home while yours is still there. First squad to three captures wins.' : 'Five on five. Every splat that empties a shield tags that player out. First squad to thirty tags wins.');
}
const MENU_CSS = '.po-brief{margin:10px 0 4px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(251,245,236,.1);font-size:14px;line-height:1.45;color:var(--ink-soft,#d8d0c4)}.po-brief b{color:var(--ink,#fbf5ec)}.po-brief ol{margin:6px 0 0 18px;padding:0}.po-final{font-family:var(--font-mono,monospace);font-size:15px;letter-spacing:.06em}.po-stats,.po-top{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.po-stats span,.po-top span{flex:1 1 30%;min-width:96px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05);font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-mute,#b8b0a4)}.po-stats b,.po-top b{display:block;font-size:18px;color:var(--ink,#fbf5ec);text-transform:none}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }
function menuProps() {
  const touch = ARC.touchMode;
  const opts = [
    { id: 'mode', label: 'Mode', value: 'splat', choices: [{ v: 'splat', label: 'Team Splat' }, { v: 'ctf', label: 'Capture the Flag' }, { v: 'campaign', label: 'Campaign' }] },
    { id: 'map', label: 'Map', value: 'mill', choices: MAP_ORDER.map((m) => ({ v: m, label: MAPS[m].name })), note: 'Campaign missions pick their own map.' },
    { id: 'mission', label: 'Mission', value: '0', choices: MISSIONS.map((m, i) => ({ v: String(i), label: (i + 1) + '. ' + m.name + (missionLocked(i) ? ' (locked)' : '') })) },
    { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }], note: 'Easy rivals react slower, aim wider and your shield takes less paint.' },
    { id: 'gun', label: 'Starting marker', value: '0', choices: GUNS.map((g, i) => ({ v: String(i), label: g.name + ' (' + g.kind + ')' })) }
  ];
  if (touch) opts.push({ id: 'autofire', label: 'Auto fire', value: 'on', choices: [{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }], note: 'Fires on its own when the sight sits on a rival. Turn off to fire with a tap.' });
  return {
    eyebrow: 'Tactical paintball', title: 'Paint <em>Ops</em>', noBest: false,
    html: '<p>Squad up for a paint marker showdown. Splat a rival enough and they are tagged out, raise their marker and walk off to respawn. No one gets hurt, the paint washes off.</p><div class="po-brief"></div>',
    options: opts
  };
}
function refreshBrief() { const el = document.querySelector('.po-brief'); if (el) el.innerHTML = briefHtml(); }

function debugState() {
  const W = Wd, a = ARC;
  if (!W) return { phase: 'none', state: a.state, renderer: '3d' };
  const P = W.P;
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, mode: W.mode, map: W.mapId, diff: W.cfg.diff, renderer: '3d', alive: !W.over, playerOut: !P.alive,
    score: W.score.slice(), time: +W.t.toFixed(2), clock: Math.round(matchTime(W)), hp: Math.round(P.hp), gun: GUNS[P.gun].id, ammo: P.ammo[P.gun], reloading: P.reloadT > 0,
    x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), yaw: +P.yaw.toFixed(3), pitch: +P.pitch.toFixed(3), crouch: P.crouch, ads: +P.adsK.toFixed(2), sprint: P.sprint,
    shots: W.stats.shots, hits: W.stats.hits, tags: W.stats.tags, outs: W.stats.outs, caps: W.stats.caps, streak: P.streak, radar: W.radarT > 0, drone: !!W.drone,
    objective: W.obj ? { i: W.obj.i, kind: W.obj.def.t, text: objectiveText(W) } : null, tickets: W.tickets, flags: W.flags.map((f) => f.state), balls: W.balls.length, chars: W.chars.length,
    result: W.over ? { winner: W.winner, why: W.why, points: scoreOf(W) } : null,
    locked: locked(), touchStyle: a.touchStyle, inputMode: a.inputMode, aimOn: !!(R3 && R3.aimOn),
    gfx: R3 ? { quality: R3.quality, fps: Math.round(R3.fps), soft: R3.soft, calls: R3.renderer.info.render.calls, tris: R3.renderer.info.render.triangles, post: TIERS[Math.max(0, R3.quality)].post } : null
  };
}
const dev = {
  world: () => Wd,
  r3: () => R3,
  vfx: () => VX.state,
  quality: (q) => { if (R3) R3.lockQ = true; setQuality(q); },
  setQuality: (q) => { if (R3) R3.lockQ = true; setQuality(q); },
  skipIntro: () => { if (Wd && Wd.phase === 'intro') Wd.phaseT = Wd.introDur; },
  ff: (sec) => { const n = Math.round(sec * 50); for (let i = 0; i < n && Wd; i++) stepWorld(Wd, 0.02, null); },
  tp: (x, z) => { if (Wd) { Wd.P.pos.set(x, 0, z); Wd.P.vel.set(0, 0, 0); } },
  tagAll: () => { if (Wd) Wd.chars.forEach((c) => { if (c.team !== Wd.P.team && c.alive) tagOut(Wd, c, Wd.P, false); }); },
  win: () => { if (Wd) { Wd.score[Wd.P.team] = Wd.target - 1; const e = Wd.chars.find((c) => c.team !== Wd.P.team && c.alive); if (e) tagOut(Wd, e, Wd.P, false); } },
  hurt: (n) => { if (Wd) hitChar(Wd, Wd.P, Wd.chars.find((c) => c.team !== Wd.P.team) || null, n || 40, Wd.P.pos.x, Wd.P.pos.y + 1.2, Wd.P.pos.z, 1, 0, false, TEAMS[1].paint); }
};
function showNo3D(a) { a.panel({ eyebrow: 'Paint Ops', title: '3D graphics <em>unavailable</em>', html: '<p>This browser could not start WebGL, which this game needs. Try another browser or turn on hardware acceleration.</p>', actions: [{ label: 'All games', href: '/games', primary: true }] }); }
function attractWorld(a) {
  const ch = a.choices, mode = ch.mode || 'splat';
  const map = mode === 'campaign' ? MISSIONS[parseInt(ch.mission || '0', 10) || 0].map : (ch.map || 'mill');
  if (!Wd || !Wd.attract || Wd.mapId !== map) { Wd = newWorld({ mode: 'splat', map, diff: 'normal', attract: true, gun: 0, seed: 3 }); }
}

Arcade.create({
  three: true,
  slug: 'paint-ops', title: 'Paint Ops', genre: 'Tactical paintball shooter',
  graphics(level) { if (!R3) return; if (level === 'auto') { R3.lockQ = false; return; } R3.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  hint: 'WASD to move, mouse to look, click to fire, right click to aim. R reload, Shift sprint, C crouch, Space jump, 1 2 3 switch.',
  touchHint: 'Stick moves, drag the screen to look. Fire, Aim, Reload, Jump, Crouch and Swap on the buttons.',
  keys: [['WASD / Up Down', 'Move'], ['Mouse', 'Look (click the game to lock it)'], ['Click / J', 'Fire'], ['Right click / K', 'Aim down sights'], ['R', 'Reload'], ['Shift', 'Sprint'], ['C / Ctrl', 'Crouch'], ['Space', 'Jump'], ['1 2 3 / Q / wheel', 'Switch marker'], ['Left Right', 'Turn without a mouse']],
  gameKeys: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Digit1', 'Digit2', 'Digit3'],
  mouse: { steer: false, cursor: 'crosshair' },
  // Controller: RT fire, LT aim, A jump, X reload, B crouch, Y switch; right stick looks, L3 sprints, bumpers cycle.
  gamepad: { buttons: ['Space', 'KeyR', 'KeyC', 'KeyQ'], rt: 'KeyJ', lt: 'KeyK' },
  touch: { stick: true, pads: [{ label: 'Fire', key: 'KeyJ', big: true, hot: true }, { label: 'Aim', key: 'KeyK', keep: true }, { label: 'Reload', key: 'KeyR', keep: true }, { label: 'Jump', key: 'Space', keep: true }, { label: 'Crouch', key: 'KeyC' }, { label: 'Swap', key: 'KeyQ' }] },
  touchKeys: [['Stick', 'Move'], ['Drag the screen', 'Look'], ['Fire', 'Shoot paint'], ['Aim', 'Aim down sights (toggle)'], ['Reload / Jump / Crouch / Swap', 'Buttons']],
  gestures: {
    drag: false, tilt: false,
    hint: 'Left thumb moves, right thumb looks. Auto fire splats when your sight is on a rival.',
    keys: [['Left half of the screen', 'Move stick under your thumb'], ['Right half, drag', 'Look around'], ['Right half, tap', 'Fire'], ['Sight on a rival', 'Auto fire (turn off in the menu)'], ['Push the stick all the way up', 'Sprint'], ['Aim / Reload / Jump', 'Buttons']]
  },
  formatScore: (v) => Math.round(v).toLocaleString('en-IN') + ' pts',
  resize: (a) => resize3D(a),
  init(a) {
    ARC = a;
    loadSave();
    if (!setup3D(a)) { NO3D = true; showNo3D(a); return; }
    R3.people = makePeople(R3.scene);
    R3.balls = makeBalls(R3.scene);
    R3.drone = makeDrone(R3.scene);
    R3.rain = makeRain(R3.scene);
    setQuality(R3.soft ? 0 : a.device === 'desktop' ? 3 : 2); resize3D(a);
    wireInput(a);
    const origMenu = a.menu;
    a.menu = function (p) { releaseLock(); ambienceOff(); return origMenu(Object.assign(menuProps(), p || {})); };
    a.debug = debugState;
    a.dev = dev;
    attractWorld(a);
    a.menu();
  },
  onMenu(a) {
    if (NO3D) return;
    injectCss(); releaseLock();
    refreshBrief();
    const card = document.querySelector('.arc-card'); if (!card) return;
    card.querySelectorAll('.arc-seg').forEach((seg) => seg.addEventListener('click', () => setTimeout(() => { refreshBrief(); attractWorld(a); }, 0)));
  },
  start(a, ch) {
    if (NO3D) return;
    clearInput();
    const mode = ch.mode || 'splat';
    let mission = parseInt(ch.mission || '0', 10) || 0;
    if (mode === 'campaign' && missionLocked(mission)) { mission = SAVE.unlocked - 1; a.toast('That mission is locked', 'Playing ' + MISSIONS[mission].name, 1800); }
    Wd = newWorld({ mode, map: ch.map || 'mill', mission, diff: ch.diff || 'normal', gun: parseInt(ch.gun || '0', 10) || 0, seed: (Math.random() * 10) | 0 });
    const auto = a.touchMode && a.choices.autofire !== 'off';
    a.setPads([{ label: 'Fire', key: 'KeyJ', big: true, hot: true, keep: !auto && a.touchStyle !== 'pads' }, { label: 'Aim', key: 'KeyK', keep: true }, { label: 'Reload', key: 'KeyR', keep: true }, { label: 'Jump', key: 'Space', keep: true }, { label: 'Crouch', key: 'KeyC' }, { label: 'Swap', key: 'KeyQ' }]);
    Wd.fadeIn = 1;
    audio(); if (AU && AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {});
    ambience(Wd.mapId);
    requestLock();
  },
  update(dt, a) {
    if (!Wd || NO3D || Wd.attract) return;
    const W = Wd;
    const I = gatherInput(a, W, dt);
    W.slow = W.phase === 'final' ? 0.25 : (W.tagcam && !W.P.alive && W.tagcam.t < 0.9) ? 0.4 : 1;
    const sdt = dt * W.slow, n = Math.max(1, Math.ceil(sdt / 0.017));
    for (let k = 0; k < n; k++) stepWorld(W, sdt / n, k === 0 ? I : Object.assign({}, I, { lx: 0, ly: 0, fireHit: false, reloadHit: false, jumpHit: false, gunTo: -1, nextGun: false, skip: false }));
    R3.lastI = I;
  },
  idle(dt, a) {
    if (NO3D) return;
    if (a.state === 'menu') { attractWorld(a); Wd.slow = 1; stepWorld(Wd, dt, null); }
    else if (a.state === 'over' && Wd && !Wd.attract) stepWorld(Wd, dt, null);
  },
  render(ctx, a) {
    if (NO3D || !R3) return;
    const W = Wd;
    const now = performance.now(), dtRaw = R3.lastNow ? (now - R3.lastNow) / 1000 : 1 / 60, dtReal = clamp(dtRaw, 0.001, 0.1); R3.lastNow = now;
    if (!W) { ctx.fillStyle = '#060503'; ctx.fillRect(0, 0, a.w, a.h); return; }
    let lost = R3.lost; try { lost = lost || R3.renderer.getContext().isContextLost(); } catch (e) { lost = true; }
    if (lost) { ctx.fillStyle = 'rgba(6,5,3,.85)'; ctx.fillRect(0, 0, a.w, a.h); txt(ctx, 'Graphics paused. Restoring...', a.w / 2, a.h / 2, 16, INK, 'center', '600'); return; }
    measureFps(dtRaw);
    if (VX.state === 0 && R3.time > 2) loadVfx();
    vxTick(a.state === 'pause' ? 0 : dtReal * (W.slow || 1));
    if (HU.state === 0 && R3.time > 1.5) loadPeopleLib();
    else if (HU.state === 2 && !HU.warm && R3.quality >= 1) {
      // the first rig is made, shown for one compile and hidden again, so its shaders never hitch the match
      HU.warm = true;
      const h = HU.lib.createHuman({ seed: 1, unit: 1, quality: 2, lod: 'mid' });
      h.group.position.set(0, -50, 0); R3.scene.add(h.group);
      try { R3.renderer.compile(R3.scene, R3.camera); } catch (e) { /* lost context */ }
      R3.scene.remove(h.group); h.dispose();
    }
    if (R3.world !== W) { activateWorld(W); R3.qWarm = 0; }
    const sl = a.state === 'pause' ? 0 : dtReal * (W.slow || 1);
    renderScene(W, sl, a, a.state === 'play' ? R3.lastI : null);
    if (!W.attract && a.state !== 'menu') drawHUD(ctx, a, W, R3.lastI);
    else if (W.attract) drawFade(ctx, a, W);
  },
  onPause() { releaseLock(); clearInput(); ambienceOff(); },
  onResume() { clearInput(); requestLock(); if (Wd) ambience(Wd.mapId); },
  onOver() { releaseLock(); clearInput(); },
  onMute(m) { if (AU && AU.amb) AU.amb.g.gain.setTargetAtTime(m ? 0 : AU.amb.vol, AU.ctx.currentTime, 0.1); }
});
