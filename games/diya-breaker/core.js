/*
 * Diya Breaker, the shared core: the board, the physics, the levels, the
 * power-ups, the bosses, the controls, the HUD and the sound. game3d.js
 * (WebGL) and game.js (the 2D fallback) each add a renderer, a "view", and
 * call boot(view). Both play exactly the same game.
 *
 * The board is 13 bricks wide. Game space is x across (-6.5 .. 6.5) and y up
 * the board (the paddle near 1.2, the top wall at 17.2). The ball is swept
 * against every surface it could reach in a fixed step of 1/120 s, so it can
 * never pass through a brick or the paddle however fast it travels.
 */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------ the board */
export const COLS = 13, ROWS = 22, HALF = 6.5, TOPY = 17.2, GRID_TOP = 16.6, BH = 0.5;
export const PAD_Y = 1.2, PAD_H = 0.2, BALL_R = 0.2, BOTTOM_Y = -1.0;
const STEP = 1 / 120, MAX_BALLS = 12, MAX_CAPS = 4;

export const K_CLAY = 0, K_GLASS = 1, K_METAL = 2, K_GOLD = 3, K_FIRE = 4, K_MOVE = 5;
export const CLAY = { r: '#c9553b', o: '#e98a35', y: '#f2b632', g: '#4f9d55', b: '#3f66c0', p: '#d6527e', w: '#eadcbc', c: '#26a69a' };
export const GLASS = { R: '#ff6a52', O: '#ffa04a', Y: '#ffd35a', G: '#6fe08a', B: '#6a9cff', P: '#ff7aa8', W: '#f4f0ff', C: '#4fe3d4' };
export const METAL = { 2: '#b97a3c', 3: '#9aa0ab', 4: '#6a6f7c' };
export const GOLD_COL = '#e9b949', FIRE_COL = '#d8322b', MOVE_COL = '#8f5fd6';
const PTS = { r: 50, o: 60, y: 70, g: 80, b: 90, p: 100, w: 50, c: 80 };

export const POWERS = {
  wide: { key: 'W', name: 'Wide paddle', col: '#55d27a', good: true, w: 16 },
  multi: { key: 'M', name: 'Multiball', col: '#5f9dff', good: true, w: 14 },
  laser: { key: 'L', name: 'Laser paddle', col: '#ff5a4a', good: true, w: 13 },
  slow: { key: 'S', name: 'Slow ball', col: '#ffa13a', good: true, w: 12 },
  catch: { key: 'C', name: 'Catch', col: '#35d6c6', good: true, w: 11 },
  fire: { key: 'F', name: 'Fireball', col: '#ff7a1a', good: true, w: 8 },
  life: { key: '1', name: 'Extra lamp', col: '#ff6fae', good: true, w: 3 },
  narrow: { key: 'N', name: 'Narrow paddle', col: '#9a7cc8', good: false, w: 8 },
  fast: { key: 'X', name: 'Fast ball', col: '#c43a5a', good: false, w: 7 },
  heavy: { key: 'H', name: 'Heavy paddle', col: '#7b8494', good: false, w: 5 }
};
const POWER_KEYS = Object.keys(POWERS);
let POWER_SUM = 0; POWER_KEYS.forEach((k) => { POWER_SUM += POWERS[k].w; });

export const ACTS = [
  { name: 'Dusk Courtyard', short: 'Act I' },
  { name: 'Monsoon Terrace', short: 'Act II' },
  { name: 'Festival Night', short: 'Act III' }
];

/* ------------------------------------------------------------ the 30 levels */
// S() mirrors a left half of 7 cells into a full row of 13.
const S = (h) => h + h.slice(0, 6).split('').reverse().join('');
function polar(rows, fn) {
  const out = [], rc = (rows - 1) / 2;
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < COLS; c++) { const x = c - 6, y = (rc - r) * 0.5; s += fn(Math.hypot(x, y), Math.atan2(y, x), x, y) || '.'; }
    out.push(s);
  }
  return out;
}
const BLANK = '.............';
const E = (n) => { const o = []; for (let i = 0; i < n; i++) o.push(BLANK); return o; };

export const LEVELS = [
  { name: 'First Flame', rows: [S('......y'), S('.....yY'), S('.....oY'), S('......o'), BLANK, S('.r.....'), S('.rr....'), S('.rrrrrr'), S('..rrrrr'), S('...rrrr'), S('....www')] },
  { name: 'Marigold Rows', rows: ['ooooooooooooo', 'yyyyyyyyyyyyy', 'ooooooooooooo', BLANK, '.Y.Y.Y.Y.Y.Y.', BLANK, 'ggggggggggggg', 'yyyyyyyyyyyyy'] },
  { name: 'Patang', rows: [S('......p'), S('.....pp'), S('....ppP'), S('...ppPP'), S('..ppPPP'), S('...ppPP'), S('....ppP'), S('.....pp'), S('......p'), S('......y'), '.....y.......', '......y......', '.......y.....', '......y......'] },
  { name: 'Doorstep Rangoli', rows: [S('.....c.'), S('....cpc'), S('...cpyy'), S('..cpy.o'), S('.cpy.o*'), S('..cpy.o'), S('...cpyy'), S('....cpc'), S('.....c.')] },
  { name: 'Mango Orchard', rows: [S('..ggg..'), S('.ggygg.'), S('.gyggg.'), S('.gggyg.'), S('..ggg..'), S('...2...'), S('...2...'), S('..222..'), BLANK, S('.y.y.y.')] },
  { name: 'The Gopuram', rows: [S('......#'), S('......y'), S('.....yy'), S('.....rr'), S('....yyy'), S('....rrr'), S('...yyyy'), S('...r*rr'), S('..yyyyy'), S('..rr2rr'), S('.rrr2rr'), S('.rrr2..'), S('##3333.')] },
  { name: 'Night Mail', rows: ['.w...........', '..ww.........', '.w...........', '.22..........', '.22...rrrrrr.', '22222.rRrRrRr', '2BBB2.rrrrrrr', '22222*rrrrrrr', '#.#.#.#.#.#.#'] },
  { name: 'Cracker Lane', rows: ['rr*rrr*rrr*rr', 'ooooooooooooo', 'yy*yyy*yyy*yy', 'ggggggggggggg', '..2..2.2..2..', 'bb*bbb*bbb*bb'] },
  { name: 'Lotus Pond', rows: [S('......p'), S('.....pP'), S('..p..pP'), S('.pPp.pP'), S('.pPPppP'), S('..pPPpP'), S('...ppPP'), S('....ppp'), S('.cccccc'), S('cc.cc.c'), S('.C.C.C.')] },
  { name: 'The Brass Drum', boss: 'drum', rows: E(9).concat([S('r.r.r..'), S('.#...#.')]) },
  { name: 'Rain Clouds', rows: ['..bbb....bbb.', '.bBBBb..bBBBb', 'bBBBBBbbBBBBB', 'bbbbbbbbbbbbb', '.c...c...c...', '...c...c...c.', '.c...c...c...', '...c...c...c.', '.C...C...C...'] },
  { name: 'Chhatri', rows: [S('......b'), S('....bbB'), S('..bbBBB'), S('.bBBbBB'), S('bbbbbbb'), S('b..b..2'), '......2......', '......2......', '......2......', '....2.2......', '.....2.......'] },
  { name: 'Paper Boats', rows: ['..w.....w....', '..ww....ww...', '..www...www..', '.wwwww.wwwww.', '..yyy...yyy..', 'bbbbbbbbbbbbb', '.bBb.bBb.bBb.', 'C.C.C.C.C.C.C'] },
  { name: 'Mor', rows: [S('...c.c.'), S('..cGcGc'), S('.cGbGbG'), S('cGbBbBb'), S('.cGbGb*'), S('..cGcbB'), S('.....bB'), S('.....bb'), S('......b'), S('.....33')] },
  { name: 'Cutting Chai', rows: [BLANK, '..w..w..w....', '...w..w..w...', S('.WWWWWW'), S('.Wooooo'), S('.Woyyyy'), S('.Wooooo'), S('..Woooo'), S('..WWWWW'), S('...####')] },
  { name: 'Sliding Stalls', rows: ['~............', 'rrrrrrrrrrrrr', '......~......', 'ooooooooooooo', '~............', 'yy*yyyyyyy*yy', '............~', 'ggggggggggggg'] },
  { name: 'Haathi', rows: [BLANK, '...wwwww.....', '..wwwwwwwp...', '.wWwwwwwwwp..', '.wwwwwwwwww..', '.w.wwwwwwww..', '.w.ww..ww....', '...ww..ww....', '..333..333...'] },
  { name: 'Drizzle Grid', rows: ['B.B.B.B.B.B.B', '.2.2.2.2.2.2.', 'C.C.C.C.C.C.C', '.3.3.3.3.3.3.', 'B.B.*.B.*.B.B', '.2.2.2.2.2.2.'] },
  { name: 'Fish Bazaar', rows: ['.ccc.c.......', 'cCCCcc.......', '.ccc.c.......', '.......ooo.o.', '......oOOOoo.', '.......ooo.o.', '...yyy.y.....', '..yYYYyy.....', '...yyy.y.....', BLANK, '2.2.2.2.2.2.2'] },
  { name: 'The Paper Dragon', boss: 'dragon', rows: E(10).concat([S('g.g.g..'), S('.3...3.')]) },
  { name: 'Lantern Street', rows: ['..#...#...#..', '..2...2...2..', '.oOo.oOo.oOo.', '.OyO.OyO.OyO.', '.oOo.oOo.oOo.', '..*...*...*..', BLANK, 'ppppppppppppp', '.P.P.P.P.P.P.'] },
  { name: 'Chakri Spiral', rows: ['ooooooooooooo', '............o', '.yyyyyyyyyy.o', '.y........y.o', '.y.******.y.o', '.y........y.o', '.yyyyyyyyyy.o', '............o', 'ooooooooooooo'] },
  { name: 'Auto Rickshaw', rows: ['....yyyyyy...', '...yyyyyyyy..', '...gBBB.BBy..', '..ggBBB.BBy..', '.gggggggggyyy', '.ggggggggggyy', '..#.......#..'] },
  { name: 'Fort Walls', rows: ['r.r.r.r.r.r.r', 'rrrrrrrrrrrrr', '#####...#####', BLANK, '..ooooooooo..', '..o*ooooo*o..', '..ooooooooo..', '##.........##', '3333#...#3333'] },
  { name: 'Star Mandala', rows: polar(21, (d, a) => {
    if (d < 0.7) return 'W';
    const star = 2.1 + 1.9 * Math.pow(Math.abs(Math.cos(a * 4)), 2);
    if (d < star) return d < 1.7 ? 'Y' : 'y';
    if (d > 4.5 && d < 5.3) return Math.abs(Math.cos(a * 2)) > 0.985 ? '*' : 'c';
    return '.';
  }) },
  { name: 'Drifting Lamps', rows: ['YYYYYYYYYYYYY', '~............', '.2.2.2.2.2.2.', '............~', 'ccccc*c*ccccc', '~............', 'WWWWWWWWWWWWW'] },
  { name: 'Toran Gate', rows: ['y.y.y.y.y.y.y', '.g.g.g.g.g.g.', 'rrrrrrrrrrrrr', 'r2#.......#2r', 'r2.........2r', 'r2.........2r', 'r2...*.*...2r', 'r2.........2r', '33.........33'] },
  { name: 'Festival Express', rows: ['w............', '.w...........', '.22..........', '2222*pppp*bbb', '2CC2*pPPp*bBb', '2222*pppp*bbb', '#.#..#..#..#.'] },
  { name: 'Grand Rangoli', rows: polar(21, (d, a) => {
    if (d < 0.8) return '*';
    if (d < 1.7) return 'Y';
    if (d < 2.6) return Math.cos(a * 6) > 0 ? 'p' : 'r';
    if (d < 3.1) return '.';
    if (d < 3.9) return Math.cos(a * 6 + Math.PI) > 0.6 ? '3' : 'o';
    if (d < 4.4) return '.';
    if (d < 5.3) return Math.abs(Math.sin(a * 6)) < 0.16 ? '*' : (Math.cos(a * 12) > 0 ? 'c' : 'G');
    return '.';
  }) },
  { name: 'The Night Lantern', boss: 'lantern', rows: E(10).concat([S('2.....2'), BLANK, S('.W.W.W.')]) }
];
LEVELS.forEach((L, i) => { L.n = i + 1; L.act = Math.floor(i / 10); L.rows = L.rows.slice(0, ROWS).map((r) => (r + BLANK).slice(0, COLS)); });

export const BOSSES = {
  drum: { name: 'The Brass Drum', hp: 16, r: 1.45, y: 13.4, speed: 2.1, shields: 8, ring: 2.35, spin: 0.9, regrow: 3.2, fireEvery: 2.7, shots: 1 },
  dragon: { name: 'The Paper Dragon', hp: 22, r: 1.05, y: 13.0, speed: 2.6, segs: 7, fireEvery: 2.2, shots: 1 },
  lantern: { name: 'The Night Lantern', hp: 30, r: 1.7, y: 12.9, speed: 1.2, shields: 10, ring: 2.85, spin: -0.65, regrow: 2.6, fireEvery: 2.4, shots: 3 }
};

/* Endless: layouts made from a seed, harder the deeper you go. */
function rngOf(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const CLAYS = 'roygbpwc', GLASSES = 'ROYGBPWC';
function endlessLevel(n, seed) {
  if (n % 10 === 0) { const b = ['drum', 'dragon', 'lantern'][((n / 10) - 1) % 3]; const src = LEVELS.find((L) => L.boss === b); return { name: BOSSES[b].name, boss: b, rows: src.rows.slice(), n, act: ((n / 10) - 1) % 3 }; }
  const R = rngOf(seed * 7919 + n * 104729);
  const depth = Math.min(1, n / 25);
  const rows = 7 + Math.floor(R() * (6 + depth * 8));
  const style = Math.floor(R() * 5);
  const pal = [CLAYS[Math.floor(R() * 8)], CLAYS[Math.floor(R() * 8)], CLAYS[Math.floor(R() * 8)]];
  const pick = (r, c, d) => {
    const u = R();
    if (u < 0.04 + depth * 0.05) return '*';
    if (u < 0.1 + depth * 0.14) return String(2 + Math.floor(R() * (1 + depth * 2.2)));
    if (u < 0.13 + depth * 0.18) return GLASSES[CLAYS.indexOf(pal[(r + c) % 3])];
    if (u < 0.15 + depth * 0.2 && d) return '#';
    return pal[(style === 2 ? c : r) % 3];
  };
  const out = [];
  for (let r = 0; r < rows; r++) {
    const half = [];
    for (let c = 0; c < 7; c++) {
      let on;
      if (style === 0) on = R() < 0.72;
      else if (style === 1) on = ((r + c) % 2) === 0 || r % 4 === 0;
      else if (style === 2) on = c % 3 !== 2 || r % 3 === 0;
      else if (style === 3) { const d = Math.hypot(c - 6, (r - rows / 2) * 0.5); on = Math.abs(d - 3.2) < 1.2 || d < 1.2 || Math.abs(d - 5.6) < 0.7; }
      else on = Math.sin(c * 0.9 + r * 0.6) > -0.2;
      half.push(on ? pick(r, c, style !== 3) : '.');
    }
    out.push(S(half.join('')));
  }
  // a guarantee: gold never blocks every path; keep at most a third of any row gold
  for (let r = 0; r < out.length; r++) { let g = 0; for (let c = 0; c < COLS; c++) if (out[r][c] === '#') g++; if (g > 4) out[r] = out[r].replace(/#/g, pal[0]); }
  if (n > 3 && R() < 0.4) { const rr = Math.min(out.length - 1, 1 + Math.floor(R() * 3)); out.splice(rr, 0, R() < 0.5 ? '~............' : '............~'); }
  const names = ['Ember Field', 'Clay Courtyard', 'Glass Garden', 'Brass Market', 'Monsoon Steps', 'Night Kiln', 'Lamp Alley', 'Kite Hill'];
  return { name: names[Math.floor(R() * names.length)] + ' ' + n, rows: out.map((r) => (r + BLANK).slice(0, COLS)), n, act: Math.floor(((n - 1) % 30) / 10) };
}

/* ------------------------------------------------------------ difficulty, modes */
export const DIFF = {
  easy: { speed: 7.2, lives: 5, cap: 1.38, drop: 0.17, label: 'Relaxed' },
  normal: { speed: 8.6, lives: 3, cap: 1.5, drop: 0.14, label: 'Classic' },
  hard: { speed: 10.0, lives: 3, cap: 1.62, drop: 0.11, label: 'Fierce' }
};

/* ------------------------------------------------------------ events for the views (a ring, no allocation) */
const EVN = 512;
const EVQ = []; for (let i = 0; i < EVN; i++) EVQ.push({ type: '', x: 0, y: 0, a: 0, b: 0, c: 0, s: '', k: 0 });
function ev(G, type, x, y, a, b, c, s, k) {
  const e = EVQ[G.evN % EVN]; G.evN++;
  e.type = type; e.x = x || 0; e.y = y || 0; e.a = a || 0; e.b = b || 0; e.c = c || 0; e.s = s || ''; e.k = k || 0;
}
export function events(G, from, fn) { const start = Math.max(from, G.evN - EVN); for (let i = start; i < G.evN; i++) fn(EVQ[i % EVN]); return G.evN; }

/* ------------------------------------------------------------ game state */
function newBall() { return { alive: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, stuck: false, off: 0, top: false, spin: 0, ang: 0, idle: 0, trail: 0, id: 0 }; }
function newGame(cfg) {
  const G = {
    cfg, level: 1, lv: null, phase: 'intro', pt: 0, introDur: 2.4, score: 0, shown: 0, lives: DIFF[cfg.diff].lives,
    bricks: [], grid: new Int16Array(COLS * ROWS), movers: [], breakable: 0, total: 0, version: 0,
    balls: [], caps: [], bolts: [], embers: [], pops: [],
    paddle: { x: 0, px: 0, w: 1.1, tw: 1.1, size: 0, vx: 0, mode: 'none', modeT: 0, stun: 0, squash: 0, cool: 0, catches: 0 },
    boss: null, speedUp: 1, slowT: 0, fastT: 0, fireT: 0, heavyT: 0, combo: 0, comboT: 0, chain: 0, fuses: 0, slowmo: 0,
    acc: 0, alpha: 1, evN: 0, lostLife: false, levelScore: 0, bestCombo: 0, bricksBroken: 0, levelsCleared: 0, t: 0, stuckT: 0,
    msg: null, ai: { aim: 0, t: 0, launchT: 0 }, seed: (Math.random() * 1e9) | 0
  };
  for (let i = 0; i < MAX_BALLS; i++) { const b = newBall(); b.id = i; G.balls.push(b); }
  for (let i = 0; i < 8; i++) G.caps.push({ alive: false, x: 0, y: 0, px: 0, py: 0, type: 'wide', rot: 0 });
  for (let i = 0; i < 24; i++) G.bolts.push({ alive: false, x: 0, y: 0, py: 0 });
  for (let i = 0; i < 16; i++) G.embers.push({ alive: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0 });
  for (let i = 0; i < 40; i++) G.pops.push({ t: 9, life: 1, x: 0, y: 0, text: '', col: '#fff', big: 0 });
  return G;
}
function levelDef(G, n) {
  const m = G.cfg.mode;
  if (m === 'endless') return endlessLevel(n, G.seed);
  if (m === 'boss') { const b = ['drum', 'dragon', 'lantern'][n - 1]; return LEVELS.find((L) => L.boss === b); }
  return LEVELS[n - 1];
}
export function levelCount(G) { return G.cfg.mode === 'boss' ? 3 : G.cfg.mode === 'endless' ? Infinity : 30; }

function loadLevel(G, n) {
  const L = levelDef(G, n);
  G.level = n; G.lv = L; G.version++;
  G.bricks.length = 0; G.grid.fill(0); G.movers.length = 0; G.breakable = 0;
  const rows = L.rows;
  for (let r = 0; r < rows.length && r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = rows[r][c];
      if (ch === '.' || ch === ' ') continue;
      const b = { id: G.bricks.length, c, r, x: -HALF + c + 0.5, y: GRID_TOP - (r + 0.5) * BH, kind: K_CLAY, col: '#ffffff', hp: 1, max: 1, alive: true, flash: 0, crack: 0, pts: 50, ch, fuse: -1, mv: 0, minX: 0, maxX: 0, dx: 0, hitT: 0 };
      if (CLAY[ch]) { b.col = CLAY[ch]; b.pts = PTS[ch]; }
      else if (GLASS[ch]) { b.kind = K_GLASS; b.col = GLASS[ch]; b.pts = 150; }
      else if (METAL[ch]) { b.kind = K_METAL; b.col = METAL[ch]; b.hp = b.max = +ch; b.pts = 60 * b.max; }
      else if (ch === '#') { b.kind = K_GOLD; b.col = GOLD_COL; b.hp = b.max = 999; b.pts = 0; }
      else if (ch === '*') { b.kind = K_FIRE; b.col = FIRE_COL; b.pts = 200; }
      else if (ch === '~') { b.kind = K_MOVE; b.col = MOVE_COL; b.pts = 150; }
      else continue;
      G.bricks.push(b);
      if (b.kind === K_MOVE) {
        // a mover slides along the free run of its row
        let lo = c, hi = c;
        while (lo > 0 && rows[r][lo - 1] === '.') lo--;
        while (hi < COLS - 1 && rows[r][hi + 1] === '.') hi++;
        b.minX = -HALF + lo + 0.5; b.maxX = -HALF + hi + 0.5; b.mv = (c < 6 ? 1 : -1) * (1.6 + Math.min(1.2, n * 0.03));
        G.movers.push(b);
      } else G.grid[r * COLS + c] = b.id + 1;
      if (b.kind !== K_GOLD) G.breakable++;
    }
  }
  G.total = G.breakable;
  G.boss = L.boss ? makeBoss(L.boss) : null;
  G.caps.forEach((c) => { c.alive = false; });
  G.bolts.forEach((c) => { c.alive = false; });
  G.embers.forEach((c) => { c.alive = false; });
  G.lostLife = false; G.levelScore = 0; G.combo = 0; G.stuckT = 0;
  const P = G.paddle; P.mode = 'none'; P.stun = 0; P.size = 0; P.tw = 1.1; P.x = P.px = 0; P.vx = 0;
  G.slowT = G.fastT = G.fireT = G.heavyT = 0; G.speedUp = 1;
  serve(G);
  setPhase(G, 'intro');
  G.introDur = G.cfg.attract ? 0.8 : (ARC && ARC.reducedMotion ? 1.3 : 2.6);
  const act = ACTS[L.act || 0];
  G.lblTop = (G.cfg.mode === 'story' ? act.short + '  |  ' + act.name : G.cfg.mode === 'boss' ? 'Boss rush' : 'Endless').toUpperCase();
  G.lblSub = L.boss ? 'Break its glow, dodge its embers' : 'Level ' + n;
  G.lblLvl = G.cfg.mode === 'endless' ? 'LEVEL ' + n : G.cfg.mode === 'boss' ? 'BOSS ' + n + ' / 3' : 'LEVEL ' + n + ' / 30';
  ev(G, 'level', 0, 0, n, L.act || 0);
}
function makeBoss(kind) {
  const D = BOSSES[kind];
  const B = { kind, def: D, x: 0, y: D.y, px: 0, py: D.y, r: D.r, hp: D.hp, max: D.hp, t: 0, inv: 0, hitT: 0, fireT: D.fireEvery * 1.4, dead: false, deadT: 0, shields: [], segs: [], hist: [], growT: 0, mood: 0 };
  for (let i = 0; i < (D.shields || 0); i++) B.shields.push({ a: i / D.shields * TAU, alive: true, x: 0, y: 0, flash: 0 });
  for (let i = 0; i < (D.segs || 0); i++) B.segs.push({ x: 0, y: D.y, r: 0.62 - i * 0.04 });
  for (let i = 0; i < 60; i++) B.hist.push({ x: -i * 0.25, y: D.y });
  return B;
}
function setPhase(G, p) { G.phase = p; G.pt = 0; }
function serve(G) {
  G.balls.forEach((b) => { b.alive = false; });
  const b = G.balls[0];
  b.alive = true; b.stuck = true; b.off = (Math.random() < 0.5 ? -1 : 1) * 0.28; b.x = b.px = G.paddle.x + b.off; b.y = b.py = PAD_Y + PAD_H + BALL_R + 0.01; b.vx = 0; b.vy = 0; b.top = false; b.idle = 0;
  G.combo = 0;
}
export function speedOf(G) {
  const base = DIFF[G.cfg.diff].speed + Math.min(29, G.level - 1) * 0.05;
  let s = base * G.speedUp;
  if (G.slowT > 0) s *= 0.68;
  if (G.fastT > 0) s *= 1.28;
  return s;
}

/* ------------------------------------------------------------ the sweep: earliest contact of a moving circle */
const HIT = { t: 2, nx: 0, ny: 0, kind: 0, ref: 0 };
const EPS = 1e-6;
function take(t, nx, ny, kind, ref) { if (t < HIT.t) { HIT.t = t; HIT.nx = nx; HIT.ny = ny; HIT.kind = kind; HIT.ref = ref; } }
function circleT(px, py, dx, dy, cx, cy, R) {
  const fx = px - cx, fy = py - cy;
  const b = fx * dx + fy * dy;
  if (b >= 0) return 2; // moving away
  const c = fx * fx + fy * fy - R * R;
  if (c <= 0) return 0; // already touching
  const a = dx * dx + dy * dy; if (a < 1e-12) return 2;
  const disc = b * b - a * c; if (disc < 0) return 2;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : 2;
}
function circleHit(px, py, dx, dy, cx, cy, R, kind, ref) {
  const t = circleT(px, py, dx, dy, cx, cy, R);
  if (t > 1) return;
  const hx = px + dx * t - cx, hy = py + dy * t - cy, l = Math.hypot(hx, hy) || 1;
  take(t, hx / l, hy / l, kind, ref);
}
// a box (centre cx,cy, half sizes hw,hh) grown by r. open: which faces are exposed (1 L, 2 R, 4 T, 8 B);
// a corner is round only where both its faces are exposed, otherwise the exposed face runs on past it.
function boxHit(px, py, dx, dy, cx, cy, hw, hh, r, open, kind, ref) {
  const L = open & 1, Rr = open & 2, T = open & 4, Bt = open & 8;
  if (L && dx > 0) { const fx = cx - hw - r; if (px <= fx + EPS) { const t = (fx - px) / dx; if (t >= 0 && t <= 1) { const y = py + dy * t; if (y >= cy - hh - (Bt ? 0 : r) && y <= cy + hh + (T ? 0 : r)) take(t, -1, 0, kind, ref); } } }
  if (Rr && dx < 0) { const fx = cx + hw + r; if (px >= fx - EPS) { const t = (fx - px) / dx; if (t >= 0 && t <= 1) { const y = py + dy * t; if (y >= cy - hh - (Bt ? 0 : r) && y <= cy + hh + (T ? 0 : r)) take(t, 1, 0, kind, ref); } } }
  if (T && dy < 0) { const fy = cy + hh + r; if (py >= fy - EPS) { const t = (fy - py) / dy; if (t >= 0 && t <= 1) { const x = px + dx * t; if (x >= cx - hw - (L ? 0 : r) && x <= cx + hw + (Rr ? 0 : r)) take(t, 0, 1, kind, ref); } } }
  if (Bt && dy > 0) { const fy = cy - hh - r; if (py <= fy + EPS) { const t = (fy - py) / dy; if (t >= 0 && t <= 1) { const x = px + dx * t; if (x >= cx - hw - (L ? 0 : r) && x <= cx + hw + (Rr ? 0 : r)) take(t, 0, -1, kind, ref); } } }
  if (L && T) circleHit(px, py, dx, dy, cx - hw, cy + hh, r, kind, ref);
  if (Rr && T) circleHit(px, py, dx, dy, cx + hw, cy + hh, r, kind, ref);
  if (L && Bt) circleHit(px, py, dx, dy, cx - hw, cy - hh, r, kind, ref);
  if (Rr && Bt) circleHit(px, py, dx, dy, cx + hw, cy - hh, r, kind, ref);
}
const cellAt = (G, c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? 0 : G.grid[r * COLS + c]);
function openOf(G, c, r) {
  return (cellAt(G, c - 1, r) ? 0 : 1) | (cellAt(G, c + 1, r) ? 0 : 2) | (cellAt(G, c, r - 1) ? 0 : 4) | (cellAt(G, c, r + 1) ? 0 : 8);
}
const H_KIND_WALL = 1, H_BRICK = 2, H_MOVER = 3, H_PADDLE = 4, H_BOSS = 5, H_SHIELD = 6, H_SEG = 7;

function sweepBall(G, b, dt, a) {
  let rem = dt, it = 0;
  const r = BALL_R, P = G.paddle, fire = G.fireT > 0;
  while (rem > 1e-7 && it++ < 7) {
    const dx = b.vx * rem, dy = b.vy * rem;
    HIT.t = 2;
    // walls
    if (dx < 0) { const t = (-HALF + r - b.x) / dx; if (t >= 0 && t <= 1) take(t, 1, 0, H_KIND_WALL, 0); else if (b.x < -HALF + r) take(0, 1, 0, H_KIND_WALL, 0); }
    if (dx > 0) { const t = (HALF - r - b.x) / dx; if (t >= 0 && t <= 1) take(t, -1, 0, H_KIND_WALL, 1); else if (b.x > HALF - r) take(0, -1, 0, H_KIND_WALL, 1); }
    if (dy > 0) { const t = (TOPY - r - b.y) / dy; if (t >= 0 && t <= 1) take(t, 0, -1, H_KIND_WALL, 2); else if (b.y > TOPY - r) take(0, 0, -1, H_KIND_WALL, 2); }
    // bricks in the cells the sweep can touch
    const x0 = Math.min(b.x, b.x + dx) - r, x1 = Math.max(b.x, b.x + dx) + r;
    const y0 = Math.min(b.y, b.y + dy) - r, y1 = Math.max(b.y, b.y + dy) + r;
    if (y1 > GRID_TOP - ROWS * BH && y0 < GRID_TOP) {
      const c0 = Math.max(0, Math.floor(x0 + HALF)), c1 = Math.min(COLS - 1, Math.floor(x1 + HALF));
      const r0 = Math.max(0, Math.floor((GRID_TOP - y1) / BH)), r1 = Math.min(ROWS - 1, Math.floor((GRID_TOP - y0) / BH));
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        const id = G.grid[rr * COLS + cc]; if (!id) continue;
        const br = G.bricks[id - 1];
        boxHit(b.x, b.y, dx, dy, br.x, br.y, 0.5, BH / 2, r, openOf(G, cc, rr), H_BRICK, id - 1);
      }
    }
    for (let i = 0; i < G.movers.length; i++) { const m = G.movers[i]; if (m.alive) boxHit(b.x, b.y, dx, dy, m.x, m.y, 0.5, BH / 2, r, 15, H_MOVER, m.id); }
    const B = G.boss;
    if (B && !B.dead) {
      circleHit(b.x, b.y, dx, dy, B.x, B.y, B.r + r, H_BOSS, 0);
      for (let i = 0; i < B.shields.length; i++) { const s = B.shields[i]; if (s.alive) circleHit(b.x, b.y, dx, dy, s.x, s.y, 0.36 + r, H_SHIELD, i); }
      for (let i = 0; i < B.segs.length; i++) { const s = B.segs[i]; circleHit(b.x, b.y, dx, dy, s.x, s.y, s.r + r, H_SEG, i); }
    }
    // the paddle: a capsule, only from above or the sides
    {
      const ax = P.x - P.w + PAD_H, bx = P.x + P.w - PAD_H, R = PAD_H + r;
      if (dy < 0) { const fy = PAD_Y + R; if (b.y >= fy - EPS) { const t = (fy - b.y) / dy; if (t >= 0 && t <= 1) { const x = b.x + dx * t; if (x >= ax && x <= bx) take(t, 0, 1, H_PADDLE, 0); } } }
      circleHit(b.x, b.y, dx, dy, ax, PAD_Y, R, H_PADDLE, 1);
      circleHit(b.x, b.y, dx, dy, bx, PAD_Y, R, H_PADDLE, 2);
    }
    if (HIT.t > 1) { b.x += dx; b.y += dy; break; }
    const t = Math.max(0, HIT.t), nx = HIT.nx, ny = HIT.ny, kind = HIT.kind, ref = HIT.ref;
    b.x += dx * t; b.y += dy * t;
    let reflect = true;
    if (kind === H_BRICK || kind === H_MOVER) {
      const br = G.bricks[ref];
      if (fire && br.kind !== K_GOLD) { reflect = false; damage(G, br, 99, 'fire', b); }
      else damage(G, br, 1, 'ball', b);
      b.idle = br.kind === K_GOLD ? b.idle : 0;
    } else if (kind === H_KIND_WALL) {
      ev(G, 'wall', b.x - nx * r, b.y - ny * r, nx, ny, Math.hypot(b.vx, b.vy));
      if (ref === 2 && !b.top) { b.top = true; G.speedUp = Math.min(DIFF[G.cfg.diff].cap, G.speedUp * 1.06); }
    } else if (kind === H_PADDLE) {
      reflect = false;
      paddleBounce(G, b, nx, ny, a);
      if (b.stuck) return;
    } else if (kind === H_BOSS) {
      hitBoss(G, fire ? 2 : 1, b.x - nx * r, b.y - ny * r);
    } else if (kind === H_SHIELD) {
      const s = B.shields[ref]; s.alive = false; s.flash = 1;
      G.score += 80; pop(G, s.x, s.y, '+80', '#ffd27a', 0);
      ev(G, 'shield', s.x, s.y, 0, 0, 0, B.kind === 'lantern' ? '#6a9cff' : '#c9553b');
      if (fire) reflect = false;
    } else if (kind === H_SEG) {
      ev(G, 'seg', b.x - nx * r, b.y - ny * r, 0, 0, 0);
    }
    if (reflect) {
      const d = b.vx * nx + b.vy * ny;
      if (d < 0) { b.vx -= 2 * d * nx; b.vy -= 2 * d * ny; }
      fixAngle(b);
    }
    b.x += nx * 2e-4; b.y += ny * 2e-4;
    rem *= (1 - t);
    if (t === 0 && it > 4) { b.x += nx * 0.01; b.y += ny * 0.01; }
  }
}
// never let a ball settle into a near flat bounce
function fixAngle(b) {
  const s = Math.hypot(b.vx, b.vy) || 1, min = s * 0.27;
  if (Math.abs(b.vy) < min) {
    b.vy = (b.vy >= 0 ? 1 : -1) * min;
    b.vx = (b.vx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, s * s - min * min));
  }
}
function paddleBounce(G, b, nx, ny, a) {
  const P = G.paddle, s = Math.hypot(b.vx, b.vy) || speedOf(G);
  if (ny > 0.35 && b.y >= PAD_Y - 0.02) {
    if (P.mode === 'catch' && !G.cfg.attract) {
      b.stuck = true; b.off = clamp(b.x - P.x, -P.w + 0.1, P.w - 0.1); b.y = PAD_Y + PAD_H + BALL_R + 0.01; b.vx = b.vy = 0;
      P.catches++; P.squash = 0.6;
      ev(G, 'catch', b.x, b.y, 0);
      if (P.catches >= 12) { P.mode = 'none'; }
      G.combo = 0;
      return;
    }
    // where it lands on the paddle sets the angle; the paddle's own motion adds a touch of spin
    const off = clamp((b.x - P.x) / (P.w + BALL_R * 0.5), -1, 1);
    let ang = off * 1.05 + clamp(P.vx * 0.014, -0.22, 0.22);
    ang = clamp(ang, -1.2, 1.2);
    b.vx = Math.sin(ang) * s; b.vy = Math.cos(ang) * s;
    b.spin = clamp(P.vx * 0.6 + off * 6, -14, 14);
    G.speedUp = Math.min(DIFF[G.cfg.diff].cap, G.speedUp * 1.012);
    b.y = Math.max(b.y, PAD_Y + PAD_H + BALL_R * 0.98);
  } else {
    const d = b.vx * nx + b.vy * ny;
    if (d < 0) { b.vx -= 2 * d * nx; b.vy -= 2 * d * ny; }
    b.vx += P.vx * 0.3;
    // a glancing touch on an end cap still sends the ball up; a hit from below does not
    if (ny > -0.25 && b.vy < 1.5) b.vy = 1.5;
    const l = Math.hypot(b.vx, b.vy) || 1; b.vx *= s / l; b.vy *= s / l;
  }
  fixAngle(b);
  P.squash = 1;
  b.idle = 0;
  if (G.combo >= 8) ev(G, 'comboEnd', b.x, b.y, G.combo);
  G.combo = 0;
  ev(G, 'paddle', b.x, PAD_Y + PAD_H, s, (b.x - P.x) / P.w);
  if (!G.cfg.attract) hap(a, 'tap', 0.25 + clamp(s / 16, 0, 0.5));
}

/* ------------------------------------------------------------ bricks */
function pop(G, x, y, text, col, big) {
  let p = G.pops[0];
  for (let i = 0; i < G.pops.length; i++) if (G.pops[i].t > p.t) p = G.pops[i];
  p.t = 0; p.life = big ? 1.6 : 0.9; p.x = x; p.y = y; p.text = text; p.col = col; p.big = big || 0;
}
const NUMSTR = new Map();
const plus = (n) => { let s = NUMSTR.get(n); if (!s) { s = '+' + n; if (NUMSTR.size < 4000) NUMSTR.set(n, s); } return s; };
export function mult(G) { return Math.min(5, 1 + Math.floor(G.combo / 5) * 0.5); }
function damage(G, br, amount, src, ball) {
  if (!br.alive) return;
  if (br.kind === K_GOLD) { br.flash = 1; ev(G, 'gold', br.x, br.y, 0); return; }
  br.hp -= amount; br.flash = 1; br.hitT = 0;
  if (br.hp > 0) {
    br.crack = 1 - br.hp / br.max;
    G.score += 10; ev(G, 'crack', br.x, br.y, br.crack, 0, 0, br.col, br.kind);
    return;
  }
  destroy(G, br, src);
}
function destroy(G, br, src) {
  br.alive = false;
  if (br.kind !== K_MOVE) G.grid[br.r * COLS + br.c] = 0;
  G.breakable--; G.bricksBroken++;
  G.combo++; G.comboT = 0; if (G.combo > G.bestCombo) G.bestCombo = G.combo;
  if (G.fuses > 0 || src === 'boom') G.chain++;
  const m = mult(G), pts = Math.round(br.pts * m);
  G.score += pts; G.levelScore += pts;
  pop(G, br.x, br.y, plus(pts), br.kind === K_GLASS ? '#dff6ff' : m > 1 ? '#ffd27a' : '#fbf5ec', 0);
  ev(G, 'break', br.x, br.y, br.kind, G.combo, br.id, br.col, src === 'fire' ? 1 : src === 'boom' ? 2 : src === 'laser' ? 3 : 0);
  if (br.kind === K_FIRE) { br.fuse = 0.13; G.fuses++; }
  if (src !== 'boom' && Math.random() < (G.cfg.attract ? 0.05 : DIFF[G.cfg.diff].drop) * (G.boss ? 0.5 : 1)) spawnCap(G, br.x, br.y);
  if (G.breakable <= 0 && !G.boss && !G.cfg.attract) G.slowmo = ARC && ARC.reducedMotion ? 0 : 0.8;
}
function explode(G, br) {
  G.fuses--;
  ev(G, 'boom', br.x, br.y, G.chain, 0, 0, br.col);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const id = cellAt(G, br.c + dc, br.r + dr); if (!id) continue;
    const o = G.bricks[id - 1];
    if (o.kind === K_GOLD) { o.flash = 1; continue; }
    if (o.kind === K_FIRE) { if (o.alive) { o.hp = 0; destroy(G, o, 'boom'); } continue; }
    damage(G, o, o.kind === K_METAL ? 2 : 9, 'boom');
  }
  for (let i = 0; i < G.movers.length; i++) { const m = G.movers[i]; if (m.alive && Math.abs(m.x - br.x) < 1.6 && Math.abs(m.y - br.y) < 0.8) damage(G, m, 9, 'boom'); }
  if (G.boss && !G.boss.dead && Math.hypot(G.boss.x - br.x, G.boss.y - br.y) < G.boss.r + 1.2) hitBoss(G, 2, br.x, br.y);
  if (G.fuses <= 0) {
    if (G.chain >= 4) {
      const bonus = G.chain * G.chain * 10;
      G.score += bonus;
      pop(G, br.x, br.y + 0.6, 'Chain x' + G.chain + '  +' + bonus, '#ffcf5a', 1);
      ev(G, 'chain', br.x, br.y, G.chain);
    }
    G.chain = 0;
  }
}
function spawnCap(G, x, y) {
  let n = 0; for (let i = 0; i < G.caps.length; i++) if (G.caps[i].alive) n++;
  if (n >= MAX_CAPS) return;
  let u = Math.random() * POWER_SUM, type = 'wide';
  for (let i = 0; i < POWER_KEYS.length; i++) { u -= POWERS[POWER_KEYS[i]].w; if (u <= 0) { type = POWER_KEYS[i]; break; } }
  if (type === 'life' && G.lives >= 7) type = 'wide';
  const c = G.caps.find((k) => !k.alive); if (!c) return;
  c.alive = true; c.x = c.px = clamp(x, -HALF + 0.5, HALF - 0.5); c.y = c.py = y; c.type = type; c.rot = 0;
  ev(G, 'capSpawn', x, y, 0, 0, 0, type);
}
function applyPower(G, type, a) {
  const P = G.paddle, D = POWERS[type];
  G.score += 250; pop(G, P.x, PAD_Y + 0.8, D.name, D.col, 1);
  switch (type) {
    case 'wide': P.size = Math.min(2, P.size + 1); break;
    case 'narrow': P.size = Math.max(-1, P.size - 1); break;
    case 'multi': {
      const alive = G.balls.filter((b) => b.alive);
      alive.forEach((b) => {
        if (b.stuck) launch(G, b);
        const s = Math.hypot(b.vx, b.vy) || speedOf(G), ang = Math.atan2(b.vx, b.vy);
        [-0.42, 0.42].forEach((d) => {
          const nb = G.balls.find((k) => !k.alive); if (!nb) return;
          nb.alive = true; nb.stuck = false; nb.x = nb.px = b.x; nb.y = nb.py = b.y; nb.top = b.top; nb.idle = 0;
          nb.vx = Math.sin(ang + d) * s; nb.vy = Math.cos(ang + d) * s; fixAngle(nb);
        });
      });
      break;
    }
    case 'laser': P.mode = 'laser'; P.modeT = 15; releaseAll(G); break;
    case 'catch': P.mode = 'catch'; P.modeT = 25; P.catches = 0; break;
    case 'slow': G.slowT = 12; G.fastT = 0; break;
    case 'fast': G.fastT = 10; G.slowT = 0; break;
    case 'fire': G.fireT = 10; break;
    case 'life': G.lives = Math.min(9, G.lives + 1); break;
    case 'heavy': G.heavyT = 9; break;
  }
  P.tw = [0.66, 1.1, 1.6, 2.05][P.size + 1];
  ev(G, 'power', P.x, PAD_Y, D.good ? 1 : 0, 0, 0, type);
  hap(a, D.good ? 'boost' : 'hit', D.good ? 0.7 : 0.4);
  audio('power', D.good ? 1 : 0);
}
function launch(G, b) {
  const P = G.paddle;
  if (!b.stuck) return;
  b.stuck = false; b.held = 0;
  const off = clamp(b.off / P.w, -1, 1);
  let ang = off * 0.9 + clamp(P.vx * 0.01, -0.2, 0.2);
  if (Math.abs(ang) < 0.12) ang = (ang >= 0 ? 1 : -1) * 0.2;
  const s = speedOf(G);
  b.vx = Math.sin(ang) * s; b.vy = Math.cos(ang) * s; b.idle = 0;
  ev(G, 'launch', b.x, b.y, s);
}
function releaseAll(G) { G.balls.forEach((b) => { if (b.alive && b.stuck) launch(G, b); }); }

/* ------------------------------------------------------------ bosses */
function hitBoss(G, dmg, x, y) {
  const B = G.boss; if (!B || B.dead || B.inv > 0) return;
  B.hp -= dmg; B.inv = 0.16; B.hitT = 0; B.mood = 1;
  G.score += 300; pop(G, x, y, '+300', '#ffd27a', 0);
  ev(G, 'bossHit', x, y, B.hp / B.max);
  hap(ARC, 'hit', 0.7);
  if (B.hp <= 0) {
    B.dead = true; B.deadT = 0;
    G.score += 10000; pop(G, B.x, B.y + 1, 'Boss down  +10000', '#ffcf5a', 1);
    ev(G, 'bossDown', B.x, B.y, 0);
    G.embers.forEach((e) => { e.alive = false; });
    hap(ARC, 'heavy', 1);
  }
}
function stepBoss(G, dt) {
  const B = G.boss; if (!B) return;
  B.px = B.x; B.py = B.y;
  if (B.dead) { B.deadT += dt; return; }
  const D = B.def;
  B.t += dt; B.inv = Math.max(0, B.inv - dt); B.mood = Math.max(0, B.mood - dt * 1.5);
  const rage = 1 + (1 - B.hp / B.max) * 0.6;
  if (B.kind === 'drum') {
    B.x = Math.sin(B.t * 0.42 * rage) * 3.4;
    B.y = D.y + Math.sin(B.t * 0.9) * 0.35;
  } else if (B.kind === 'dragon') {
    B.x = Math.sin(B.t * 0.55 * rage) * 4.6;
    B.y = D.y + Math.sin(B.t * 1.2 * rage) * 1.6;
    // the body follows the head's own path, a breadcrumb every quarter unit it travels
    const h0 = B.hist[0];
    if (Math.hypot(B.x - h0.x, B.y - h0.y) > 0.25) { const h = B.hist.pop(); h.x = B.x; h.y = B.y; B.hist.unshift(h); }
    for (let i = 0; i < B.segs.length; i++) { const k = Math.min(B.hist.length - 1, (i + 1) * 4 + 1); B.segs[i].x = B.hist[k].x; B.segs[i].y = B.hist[k].y; }
  } else {
    B.x = Math.sin(B.t * 0.35 * rage) * 3.0;
    B.y = D.y + Math.sin(B.t * 0.7 * rage) * 0.9;
  }
  // shields orbit and grow back one at a time
  if (B.shields.length) {
    const n = B.shields.length;
    for (let i = 0; i < n; i++) {
      const s = B.shields[i], a = s.a + B.t * D.spin * rage;
      s.x = B.x + Math.cos(a) * D.ring; s.y = B.y + Math.sin(a) * D.ring * 0.78;
      s.flash = Math.max(0, s.flash - dt * 3);
    }
    B.growT += dt;
    if (B.growT > D.regrow) { B.growT = 0; const s = B.shields.find((k) => !k.alive); if (s) { s.alive = true; s.flash = 1; } }
  }
  // the lantern lights fresh lamps below itself now and then
  if (B.kind === 'lantern' && B.t > 6 && Math.floor((B.t - dt) / 9) !== Math.floor(B.t / 9)) {
    const r = 12 + Math.floor(Math.random() * 3);
    for (let c = 1; c < COLS - 1; c += 2) {
      if (G.grid[r * COLS + c]) continue;
      const b = { id: G.bricks.length, c, r, x: -HALF + c + 0.5, y: GRID_TOP - (r + 0.5) * BH, kind: K_GLASS, col: GLASS.B, hp: 1, max: 1, alive: true, flash: 1, crack: 0, pts: 150, ch: 'B', fuse: -1, mv: 0, minX: 0, maxX: 0, dx: 0, hitT: 0 };
      if (G.balls.some((k) => k.alive && Math.abs(k.x - b.x) < 0.8 && Math.abs(k.y - b.y) < 0.6)) continue;
      G.bricks.push(b); G.grid[r * COLS + c] = b.id + 1; G.breakable++; G.total++;
    }
    G.version++;
    ev(G, 'spawnRow', B.x, B.y, r);
  }
  // the boss watches the paddle the way a person would: what it saw a beat ago (0.15 to 0.3 s), and its
  // aim wanders a little, so a paddle on the move is hard to hit but one standing still is not safe
  if (B.seenX == null) { B.seenX = G.paddle.x; B.seenT = 0; }
  B.seenT -= dt; if (B.seenT <= 0) { B.seenX = G.paddle.x; B.seenT = 0.15 + Math.random() * 0.15; }
  // embers fall toward the paddle
  B.fireT -= dt;
  if (B.fireT <= 0 && (G.phase === 'play' || G.phase === 'serve')) {
    B.fireT = D.fireEvery / rage * (0.85 + Math.random() * 0.3);
    const n = D.shots, aimErr = (Math.random() - 0.5) * 0.7;
    for (let k = 0; k < n; k++) {
      const e = G.embers.find((q) => !q.alive); if (!e) break;
      const spread = n > 1 ? (k - (n - 1) / 2) * 0.32 : 0;
      const dx = B.seenX + aimErr - B.x, dy = PAD_Y - B.y, l = Math.hypot(dx, dy) || 1, sp = 4.2 + (rage - 1) * 2;
      const ang = Math.atan2(dx / l, -dy / l) + spread;
      e.alive = true; e.x = e.px = B.x; e.y = e.py = B.y - B.r * 0.8; e.vx = Math.sin(ang) * sp; e.vy = -Math.cos(ang) * sp;
    }
    ev(G, 'bossFire', B.x, B.y - B.r * 0.8, n);
  }
}

/* ------------------------------------------------------------ one fixed step */
const IN = { axis: 0, target: null, act: false, hold: false, src: 'keys' };
function stepPaddle(G, dt, a) {
  const P = G.paddle;
  P.px = P.x;
  P.w += (P.tw - P.w) * Math.min(1, dt * 10);
  P.squash = Math.max(0, P.squash - dt * 5);
  if (P.modeT > 0) { P.modeT -= dt; if (P.modeT <= 0) P.mode = 'none'; }
  P.cool = Math.max(0, P.cool - dt);
  const heavy = G.heavyT > 0 ? 0.45 : 1;
  let nx = P.x;
  if (P.stun > 0) { P.stun -= dt; }
  else if (G.cfg.attract || G.auto) nx = aiPaddle(G, dt);
  else if (IN.target != null) {
    const max = 70 * heavy, d = IN.target - P.x;
    nx = P.x + clamp(d, -max * dt, max * dt);
  } else {
    const want = IN.axis * 15.5 * heavy;
    P.vk = P.vk || 0;
    P.vk += clamp(want - P.vk, -110 * dt, 110 * dt);
    if (!IN.axis && Math.abs(P.vk) < 0.6) P.vk = 0;
    nx = P.x + P.vk * dt;
  }
  const lim = HALF - P.w;
  if (nx < -lim) { nx = -lim; P.vk = 0; } else if (nx > lim) { nx = lim; P.vk = 0; }
  const v = (nx - P.x) / dt;
  P.vx += (v - P.vx) * Math.min(1, dt * 25);
  P.x = nx;
  // a paddle that moves into a ball sweeps it along
  for (let i = 0; i < G.balls.length; i++) {
    const b = G.balls[i]; if (!b.alive) continue;
    if (b.stuck) {
      b.off = clamp(b.off, -P.w + 0.12, P.w - 0.12); b.px = b.x; b.py = b.y; b.x = P.x + b.off; b.y = PAD_Y + PAD_H + BALL_R + 0.01;
      // a caught ball lets go by itself after a few seconds
      if (G.phase === 'play') { b.held = (b.held || 0) + dt; if (b.held > 4) launch(G, b); }
      continue;
    }
    const ax = P.x - P.w + PAD_H, bx = P.x + P.w - PAD_H, cx = clamp(b.x, ax, bx);
    const dx = b.x - cx, dy = b.y - PAD_Y, d = Math.hypot(dx, dy), R = PAD_H + BALL_R;
    if (d < R && d > 1e-6) {
      const nnx = dx / d, nny = dy / d;
      b.x = cx + nnx * (R + 1e-3); b.y = PAD_Y + nny * (R + 1e-3);
      if (b.vx * nnx + b.vy * nny < 0 || Math.abs(P.vx) > 1) paddleBounce(G, b, nnx, nny, a);
    }
  }
}
function aiPaddle(G, dt) {
  const P = G.paddle, A = G.ai;
  let tx = 0, best = -1e9;
  for (let i = 0; i < G.balls.length; i++) {
    const b = G.balls[i]; if (!b.alive) continue;
    if (b.stuck) { if (G.phase === 'serve' || G.phase === 'play') A.launchT += dt; if (A.launchT > 0.9) { A.launchT = 0; b.off = (Math.random() - 0.5) * P.w; launch(G, b); } tx = P.x; best = 0; continue; }
    if (b.vy >= 0) { if (best < -1e8) tx = b.x * 0.6; continue; }
    const tt = (PAD_Y + 0.4 - b.y) / b.vy;
    let x = b.x + b.vx * tt;
    const w = (HALF - BALL_R) * 2;
    x = ((x + HALF - BALL_R) % (2 * w) + 2 * w) % (2 * w); x = x > w ? 2 * w - x : x; x = x - HALF + BALL_R;
    const urg = -tt;
    if (urg > best) { best = urg; tx = x; }
  }
  A.t -= dt; if (A.t <= 0) { A.t = 1.2 + Math.random(); A.aim = (Math.random() - 0.5) * P.w * 1.2; }
  const d = tx - A.aim - P.x;
  return P.x + clamp(d, -14 * dt, 14 * dt);
}
function stepWorld(G, dt, a) {
  const P = G.paddle, attract = G.cfg.attract;
  G.t += dt;
  stepPaddle(G, dt, a);
  for (let i = 0; i < G.movers.length; i++) {
    const m = G.movers[i]; if (!m.alive) continue;
    m.x += m.mv * dt; if (m.x < m.minX) { m.x = m.minX; m.mv = Math.abs(m.mv); } else if (m.x > m.maxX) { m.x = m.maxX; m.mv = -Math.abs(m.mv); }
    for (let k = 0; k < G.balls.length; k++) {
      const b = G.balls[k]; if (!b.alive || b.stuck) continue;
      const qx = clamp(b.x, m.x - 0.5, m.x + 0.5), qy = clamp(b.y, m.y - 0.25, m.y + 0.25), dx = b.x - qx, dy = b.y - qy, d = Math.hypot(dx, dy);
      if (d < BALL_R && d > 1e-6) { b.x = qx + dx / d * (BALL_R + 1e-3); b.y = qy + dy / d * (BALL_R + 1e-3); const dd = b.vx * dx / d + b.vy * dy / d; if (dd < 0) { b.vx -= 2 * dd * dx / d; b.vy -= 2 * dd * dy / d; fixAngle(b); } }
    }
  }
  stepBoss(G, dt);
  if (G.boss && !G.boss.dead) {
    const B = G.boss;
    for (let k = 0; k < G.balls.length; k++) {
      const b = G.balls[k]; if (!b.alive || b.stuck) continue;
      const dx = b.x - B.x, dy = b.y - B.y, d = Math.hypot(dx, dy), R = B.r + BALL_R;
      if (d < R && d > 1e-6) { b.x = B.x + dx / d * (R + 1e-3); b.y = B.y + dy / d * (R + 1e-3); const dd = b.vx * dx / d + b.vy * dy / d; if (dd < 0) { b.vx -= 2 * dd * dx / d; b.vy -= 2 * dd * dy / d; fixAngle(b); } }
    }
  }
  // the balls
  const target = speedOf(G);
  let alive = 0;
  for (let i = 0; i < G.balls.length; i++) {
    const b = G.balls[i]; if (!b.alive) continue;
    b.px = b.x; b.py = b.y;
    if (b.stuck) { alive++; continue; }
    const s = Math.hypot(b.vx, b.vy);
    if (s > 1e-6) { const ns = s + clamp(target - s, -6 * dt, 4 * dt); b.vx *= ns / s; b.vy *= ns / s; }
    sweepBall(G, b, dt, a);
    b.ang += b.spin * dt; b.spin *= Math.exp(-dt * 0.6);
    b.idle += dt;
    // a ball that has only met gold and walls for a long while gets a nudge
    if (b.idle > 11) { b.idle = 0; const s2 = Math.hypot(b.vx, b.vy), ang = Math.atan2(b.vx, b.vy) + (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.2); b.vx = Math.sin(ang) * s2; b.vy = Math.cos(ang) * s2; fixAngle(b); ev(G, 'nudge', b.x, b.y); }
    if (b.y < BOTTOM_Y) { b.alive = false; ev(G, 'ballOut', b.x, PAD_Y, 0); continue; }
    alive++;
  }
  // firecracker fuses
  if (G.fuses > 0) for (let i = 0; i < G.bricks.length; i++) { const br = G.bricks[i]; if (br.fuse > 0) { br.fuse -= dt; if (br.fuse <= 0) { br.fuse = -1; explode(G, br); } } }
  // lasers
  for (let i = 0; i < G.bolts.length; i++) {
    const L = G.bolts[i]; if (!L.alive) continue;
    L.py = L.y; const ny = L.y + 24 * dt;
    let hit = false;
    const c = Math.floor(L.x + HALF);
    if (c >= 0 && c < COLS) {
      const r0 = Math.max(0, Math.floor((GRID_TOP - ny) / BH)), r1 = Math.min(ROWS - 1, Math.floor((GRID_TOP - L.y) / BH));
      for (let r = r1; r >= r0 && !hit; r--) { const id = G.grid[r * COLS + c]; if (id) { const br = G.bricks[id - 1]; damage(G, br, 1, 'laser'); ev(G, 'zap', L.x, br.y - 0.25, 0); hit = true; } }
    }
    if (!hit) for (let k = 0; k < G.movers.length && !hit; k++) { const m = G.movers[k]; if (m.alive && Math.abs(m.x - L.x) < 0.5 && m.y - 0.25 <= ny && m.y - 0.25 >= L.y - 0.01) { damage(G, m, 1, 'laser'); ev(G, 'zap', L.x, m.y - 0.25, 0); hit = true; } }
    const B = G.boss;
    if (!hit && B && !B.dead) {
      for (let k = 0; k < B.shields.length && !hit; k++) { const s = B.shields[k]; if (s.alive && Math.abs(s.x - L.x) < 0.4 && Math.abs(s.y - ny) < 0.4) { s.alive = false; ev(G, 'shield', s.x, s.y, 0, 0, 0, '#c9553b'); hit = true; } }
      if (!hit && Math.hypot(B.x - L.x, B.y - ny) < B.r) { hitBoss(G, 0.5, L.x, ny); ev(G, 'zap', L.x, ny, 0); hit = true; }
    }
    if (hit || ny > TOPY) { if (!hit) ev(G, 'zap', L.x, TOPY, 1); L.alive = false; } else L.y = ny;
  }
  // capsules
  for (let i = 0; i < G.caps.length; i++) {
    const c = G.caps[i]; if (!c.alive) continue;
    c.px = c.x; c.py = c.y; c.y -= 3.1 * dt; c.rot += dt * 3;
    if (!attract && c.y < PAD_Y + PAD_H + 0.2 && c.y > PAD_Y - PAD_H - 0.25 && Math.abs(c.x - P.x) < P.w + 0.45 && G.phase !== 'lost') { c.alive = false; applyPower(G, c.type, a); continue; }
    if (attract && c.y < PAD_Y + 0.3) { c.alive = false; continue; }
    if (c.y < BOTTOM_Y) c.alive = false;
  }
  // embers
  for (let i = 0; i < G.embers.length; i++) {
    const e = G.embers[i]; if (!e.alive) continue;
    e.px = e.x; e.py = e.y; e.x += e.vx * dt; e.y += e.vy * dt;
    if (Math.abs(e.x) > HALF) e.vx = -e.vx;
    if (!attract && e.y < PAD_Y + PAD_H + 0.15 && e.y > PAD_Y - PAD_H && Math.abs(e.x - P.x) < P.w + 0.15 && P.stun <= 0) {
      e.alive = false; P.stun = 0.9; if (P.mode !== 'none') P.mode = 'none';
      ev(G, 'stun', e.x, PAD_Y, 0); hap(a, 'heavy', 0.6); continue;
    }
    if (e.y < BOTTOM_Y) e.alive = false;
  }
  // timers
  if (G.slowT > 0) G.slowT -= dt;
  if (G.fastT > 0) G.fastT -= dt;
  if (G.fireT > 0) G.fireT -= dt;
  if (G.heavyT > 0) G.heavyT -= dt;
  G.comboT += dt;
  for (let i = 0; i < G.bricks.length; i++) { const br = G.bricks[i]; if (br.flash > 0) br.flash = Math.max(0, br.flash - dt * 4); br.hitT += dt; }
  return alive;
}

/* ------------------------------------------------------------ the frame */
function frame(G, dt, a) {
  const attract = G.cfg.attract;
  G.pt += dt;
  if (G.slowmo > 0) G.slowmo -= dt;
  const simDt = dt * (G.slowmo > 0 ? 0.28 : 1);
  if (G.phase === 'intro') {
    if (G.pt >= G.introDur || (IN.act && G.pt > 0.5)) { IN.act = false; setPhase(G, 'serve'); ev(G, 'serve', 0, 0); }
  }
  // controls that act once
  if (G.phase === 'serve' || G.phase === 'play') {
    const P = G.paddle;
    if (IN.act) {
      let launched = false;
      for (let i = 0; i < G.balls.length; i++) { const b = G.balls[i]; if (b.alive && b.stuck) { launch(G, b); launched = true; } }
      if (launched && G.phase === 'serve') setPhase(G, 'play');
      else if (!launched && P.mode === 'laser') fireLaser(G, a);
    } else if (IN.hold && P.mode === 'laser' && P.cool <= 0 && G.phase === 'play') { let st = false; for (let i = 0; i < G.balls.length; i++) if (G.balls[i].alive && G.balls[i].stuck) st = true; if (!st) fireLaser(G, a); }
  }
  IN.act = false;
  // fixed steps, with the leftover kept for smooth drawing between them
  if (G.phase !== 'over' && G.phase !== 'win') {
    G.acc += simDt;
    let n = 0;
    while (G.acc >= STEP && n < 12) {
      G.acc -= STEP; n++;
      const live = G.phase === 'serve' || G.phase === 'play';
      if (live || G.phase === 'intro' || G.phase === 'clear' || G.phase === 'lost') {
        const alive = stepWorld(G, STEP, a);
        if (G.phase === 'play' && alive === 0) lose(G, a);
      }
      if (G.phase === 'serve') { let st = false; for (let i = 0; i < G.balls.length; i++) if (G.balls[i].alive && G.balls[i].stuck) st = true; if (!st) setPhase(G, 'play'); }
      if (G.phase === 'play' || G.phase === 'serve') {
        const won = G.boss ? (G.boss.dead && G.boss.deadT > 1.2) : G.breakable <= 0;
        if (won && G.fuses <= 0) clear(G, a);
      }
    }
    if (G.acc > STEP) G.acc = STEP;
    G.alpha = G.acc / STEP;
  }
  if (G.phase === 'lost' && G.pt > 1.4) {
    if (G.lives > 0 || attract) { serve(G); setPhase(G, 'serve'); ev(G, 'serve', 0, 0); }
    else { setPhase(G, 'over'); gameOver(G, a); }
  }
  if (G.phase === 'clear' && G.pt > (attract ? 1.2 : 3.4)) {
    const next = G.level + 1;
    if (next > levelCount(G)) { setPhase(G, 'win'); gameOver(G, a, true); }
    else {
      if (!attract && G.cfg.mode === 'story') { const reached = a.store.get('arcade.diya-breaker.reached', 1) || 1; if (next > reached) a.store.set('arcade.diya-breaker.reached', next); }
      if (a.fade && !attract) a.fade(240);
      loadLevel(G, attract ? 1 + (G.level % 9) : next);
    }
  }
  G.shown += (G.score - G.shown) * Math.min(1, dt * 8); if (Math.abs(G.score - G.shown) < 1) G.shown = G.score;
  for (let i = 0; i < G.pops.length; i++) G.pops[i].t += dt;
}
function fireLaser(G, a) {
  const P = G.paddle; if (P.cool > 0) return;
  P.cool = 0.26;
  let k = 0;
  for (let i = 0; i < G.bolts.length && k < 2; i++) { const L = G.bolts[i]; if (L.alive) continue; L.alive = true; L.x = P.x + (k ? 1 : -1) * (P.w - 0.28); L.y = L.py = PAD_Y + 0.25; k++; }
  ev(G, 'laser', P.x, PAD_Y, 0);
  hap(a, 'tap', 0.2);
}
function lose(G, a) {
  if (G.phase !== 'play') return;
  G.lives--; G.lostLife = true; G.speedUp = 1; G.slowT = G.fastT = G.fireT = G.heavyT = 0;
  const P = G.paddle; P.mode = 'none'; P.size = 0; P.tw = 1.1;
  G.caps.forEach((c) => { c.alive = false; }); G.bolts.forEach((c) => { c.alive = false; }); G.embers.forEach((c) => { c.alive = false; });
  setPhase(G, 'lost');
  G.lblLost = G.lives + (G.lives === 1 ? ' lamp left' : ' lamps left');
  ev(G, 'lost', P.x, PAD_Y, G.lives);
  if (!G.cfg.attract) { hap(a, 'fail', 1); audio('lost'); if (G.combo >= 8) ev(G, 'comboEnd', P.x, PAD_Y, G.combo); }
  G.combo = 0;
}
function clear(G, a) {
  setPhase(G, 'clear');
  G.levelsCleared++;
  const bonus = G.cfg.attract ? 0 : 1000 + G.level * 200 + (G.lostLife ? 0 : 2500);
  G.score += bonus; G.clearBonus = bonus;
  G.lblClear = 'Clear bonus ' + bonus + (G.lostLife ? '' : '  |  no lamps lost');
  G.balls.forEach((b) => { if (b.alive) { b.vx *= 0.3; b.vy *= 0.3; } });
  ev(G, 'clear', 0, 9, G.level, bonus);
  if (!G.cfg.attract) { hap(a, 'success', 1); audio('clear'); }
}
function gameOver(G, a, won) {
  if (G.cfg.attract) return;
  ev(G, won ? 'win' : 'over', 0, 0);
  if (!won) audio('over'); else audio('clear');
  const reach = G.cfg.mode === 'endless' ? 'Reached level ' + G.level : G.cfg.mode === 'boss' ? (won ? 'All three bosses beaten' : 'Boss ' + G.level + ' of 3') : (won ? 'All 30 levels lit' : 'Level ' + G.level + ' of 30');
  const html = '<p class="db-final"><b>' + reach + '</b><span>|</span>' + G.bricksBroken + ' bricks<span>|</span>best streak ' + G.bestCombo + '</p>';
  G.overAt = won ? 2.6 : 1.5;
  G.overArgs = { score: G.score, scoreLabel: 'Score', eyebrow: won ? 'Every lamp lit' : 'The lamps went out', title: won ? 'Diya <em>Breaker</em> champion' : 'Game over', html, again: 'Play again' };
}

/* ------------------------------------------------------------ haptics, sound */
let ARC = null, VIEW = null, MG = null;
function hap(a, kind, s) {
  a = a || ARC; if (!a || (MG && MG.cfg.attract)) return;
  try { if (typeof a.haptic === 'function') a.haptic(kind, s); else if (typeof a.buzz === 'function') a.buzz(Math.round(10 + 50 * (s || 0.5))); } catch (e) { /* no vibration */ }
}
const AU = { ok: false, ctx: null, master: null, music: null, sfx: null, noise: null, next: 0, step: 0, drone: null, scale: null };
const SCALES = [[0, 2, 4, 7, 9, 12, 14, 16], [0, 3, 5, 7, 10, 12, 15, 17], [0, 2, 4, 6, 7, 9, 11, 12]];
const ROOTS = [146.83, 130.81, 155.56];
function audioInit() {
  if (AU.ok || AU.failed) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { AU.failed = true; return; }
    const c = new AC(); AU.ctx = c;
    AU.master = c.createGain(); AU.master.gain.value = 0; AU.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(AU.master);
    AU.sfx = c.createGain(); AU.sfx.gain.value = 0.9; AU.sfx.connect(comp);
    AU.music = c.createGain(); AU.music.gain.value = 0; AU.music.connect(comp);
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = nb;
    // the drone: two soft voices on the root and its fifth, breathing through a slow filter
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.7;
    const dg = c.createGain(); dg.gain.value = 0.07; lp.connect(dg); dg.connect(AU.music);
    const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'triangle';
    o1.connect(lp); o2.connect(lp); o3.connect(lp);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 260; lfo.connect(lg); lg.connect(lp.frequency);
    [o1, o2, o3, lfo].forEach((o) => o.start());
    AU.drone = { o1, o2, o3, gain: dg };
    AU.ok = true; setRoot(0);
    if (c.state === 'suspended') c.resume().catch(() => {});
  } catch (e) { AU.failed = true; }
}
function setRoot(act) {
  if (!AU.ok) return;
  const f = ROOTS[act] || ROOTS[0], t = AU.ctx.currentTime;
  AU.root = f; AU.scale = SCALES[act] || SCALES[0];
  AU.drone.o1.frequency.setTargetAtTime(f / 2, t, 0.3); AU.drone.o2.frequency.setTargetAtTime(f * 0.75 * 1.003, t, 0.3); AU.drone.o3.frequency.setTargetAtTime(f, t, 0.3);
}
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function osc(type, f, t, dur, vol, slide, dest, detune) {
  const c = AU.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  if (detune) o.detune.value = detune;
  env(g, t, Math.min(0.012, dur / 4), vol, dur); o.connect(g); g.connect(dest || AU.sfx); o.start(t); o.stop(t + dur + 0.05);
}
function nz(t, dur, vol, type, freq, q, dest) {
  const c = AU.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = AU.noise; s.playbackRate.value = 0.7 + Math.random() * 0.6; f.type = type || 'bandpass'; f.frequency.value = freq || 1500; f.Q.value = q || 1;
  env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(dest || AU.sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const note = (i) => AU.root * Math.pow(2, (AU.scale[((i % 8) + 8) % 8] + 12 * Math.floor(i / 8)) / 12);
function audio(kind, x, y) {
  if (!AU.ok || !ARC || ARC.sfx.muted) return;
  const t = AU.ctx.currentTime + 0.005;
  try {
    switch (kind) {
      case 'clay': { const f = note(4 + Math.min(14, x)); osc('triangle', f * 2, t, 0.14, 0.16); osc('sine', f, t, 0.18, 0.12); nz(t, 0.05, 0.12, 'bandpass', 1800, 2); break; }
      case 'glass': { const f = note(8 + Math.min(14, x)) * 2; osc('sine', f, t, 0.5, 0.1); osc('sine', f * 2.76, t, 0.35, 0.05); osc('sine', f * 5.4, t, 0.2, 0.03); nz(t, 0.12, 0.1, 'highpass', 5000, 0.8); break; }
      case 'metal': osc('square', 220 + y * 40, t, 0.09, 0.06, 160); osc('sine', 880 + y * 120, t, 0.25, 0.06); nz(t, 0.05, 0.12, 'bandpass', 3200, 6); break;
      case 'gold': osc('sine', 1318, t, 0.45, 0.08); osc('sine', 1975, t, 0.3, 0.04); break;
      case 'paddle': osc('sine', 180 + x * 30, t, 0.12, 0.2, 90); nz(t, 0.04, 0.08, 'lowpass', 900); break;
      case 'wall': osc('triangle', 520, t, 0.05, 0.05, 380); break;
      case 'boom': nz(t, 0.5, 0.45, 'lowpass', 900, 0.7); osc('sine', 120, t, 0.4, 0.3, 40); for (let i = 0; i < 6; i++) nz(t + 0.05 + Math.random() * 0.3, 0.04, 0.12, 'highpass', 3000); break;
      case 'laser': osc('sawtooth', 1400, t, 0.12, 0.05, 300); break;
      case 'launch': osc('triangle', 330, t, 0.16, 0.1, 660); break;
      case 'power': if (x) [0, 2, 4, 7].forEach((k, i) => osc('triangle', note(8 + k), t + i * 0.06, 0.16, 0.1)); else osc('sawtooth', 300, t, 0.35, 0.08, 120); break;
      case 'cap': osc('sine', 660, t, 0.08, 0.05); break;
      case 'lost': osc('triangle', 392, t, 0.25, 0.14, 330); osc('triangle', 330, t + 0.22, 0.25, 0.14, 262); osc('triangle', 262, t + 0.44, 0.6, 0.14, 196); break;
      case 'clear': [0, 2, 4, 5, 7, 9, 11, 12].forEach((k, i) => { osc('triangle', note(8 + Math.min(7, k)), t + i * 0.09, 0.3, 0.1); osc('sine', note(16 + Math.min(7, k)), t + i * 0.09, 0.2, 0.04); }); break;
      case 'over': osc('sine', 220, t, 1.2, 0.14, 110); break;
      case 'bossHit': osc('sine', 90, t, 0.35, 0.3, 50); nz(t, 0.18, 0.2, 'lowpass', 600); osc('square', 180, t, 0.1, 0.05, 120); break;
      case 'bossFire': osc('sawtooth', 200, t, 0.3, 0.05, 520); break;
      case 'stun': nz(t, 0.25, 0.22, 'bandpass', 700, 2); osc('square', 110, t, 0.2, 0.08, 70); break;
      case 'firework': nz(t, 0.9, 0.18, 'lowpass', 500, 0.6); for (let i = 0; i < 8; i++) nz(t + 0.1 + Math.random() * 0.7, 0.05, 0.06, 'highpass', 4000); break;
      case 'whoosh': nz(t, 0.6, 0.08, 'bandpass', 800, 0.6); break;
      case 'catch': osc('sine', 520, t, 0.1, 0.1, 700); break;
    }
  } catch (e) { /* audio is optional */ }
}
// a gentle original groove: a plucked melody over a hand drum, scheduled a little ahead each frame
const MEL = [0, 2, 4, 2, 5, 4, 2, 0, 4, 5, 7, 5, 4, 2, 4, 1];
function music(G, a, dt) {
  if (!AU.ok) return;
  const c = AU.ctx, t = c.currentTime;
  const on = !a.sfx.muted && (a.state === 'play' || a.state === 'menu' || a.state === 'over');
  AU.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.08);
  const playing = a.state === 'play' && G && !G.cfg.attract && (G.phase === 'play' || G.phase === 'serve' || G.phase === 'intro');
  AU.music.gain.setTargetAtTime(playing ? 0.5 : a.state === 'menu' ? 0.25 : 0.12, t, 0.4);
  if (!playing) { AU.next = t + 0.1; return; }
  const beat = 60 / (88 + (G.level % 10) * 1.2) / 2;
  if (AU.next < t) AU.next = t + 0.05;
  while (AU.next < t + 0.25) {
    const s = AU.step++ % 32, tt = AU.next;
    // drum: deep on the one, a ringing open stroke on the off beats
    if (s % 8 === 0) { osc('sine', 110, tt, 0.25, 0.16, 62, AU.music); }
    if (s % 8 === 3 || s % 8 === 6) { osc('sine', 320, tt, 0.12, 0.07, 290, AU.music); nz(tt, 0.03, 0.03, 'bandpass', 2400, 3, AU.music); }
    if (s % 4 === 2) nz(tt, 0.02, 0.02, 'highpass', 6000, 1, AU.music);
    if (s % 2 === 0) { const m = MEL[(s / 2) % 16] + (AU.step % 64 >= 32 ? 1 : 0); if ((s / 2) % 4 !== 3) { const f = note(8 + m); osc('triangle', f, tt, 0.35, 0.045, 0, AU.music); osc('sine', f * 2, tt, 0.18, 0.015, 0, AU.music); } }
    AU.next += beat;
  }
}

/* ------------------------------------------------------------ controls */
const PTR = { id: null, sx: 0, x0: 0, t: 0, moved: 0, mouse: false, mx: 0, my: 0, mouseT: -9, down: false, taps: 0 };
function boardFromScreenX(px) {
  const L = VIEW.paddleLine();
  return -HALF + (px - L.x0) / Math.max(1, L.x1 - L.x0) * 2 * HALF;
}
function readInput(G, a, dt) {
  const inp = a.input;
  const ax = inp.axis().x;
  IN.axis = Math.abs(ax) > 0.04 ? ax : 0;
  if (IN.axis) { IN.target = null; IN.src = 'keys'; PTR.mouse = false; }
  else if (PTR.id != null) { IN.src = 'touch'; }
  else if (PTR.mouse) { IN.target = clamp(boardFromScreenX(PTR.mx), -HALF, HALF); IN.src = 'mouse'; }
  else if (IN.src !== 'touch') IN.target = null;
  if (inp.hit('Space', 'Enter', 'NumpadEnter', 'KeyJ', 'ArrowUp', 'KeyW')) IN.act = true;
  IN.hold = inp.down('Space', 'KeyJ') || PTR.down;
  if (PTR.taps > 0) { PTR.taps = 0; IN.act = true; }
}
function attachPointer(a) {
  const cv = a.canvas;
  const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => {
    if (a.state !== 'play') return;
    const p = local(e);
    if (e.pointerType === 'mouse') {
      PTR.mouse = true; PTR.mx = p.x; PTR.my = p.y; if (e.button === 0) { PTR.taps++; PTR.down = true; }
      return;
    }
    if (PTR.id == null) {
      PTR.id = e.pointerId; PTR.sx = p.x; PTR.t = e.timeStamp; PTR.moved = 0; PTR.down = false;
      PTR.x0 = MG ? MG.paddle.x : 0;
      IN.target = PTR.x0; IN.src = 'touch'; PTR.mouse = false;
    } else PTR.taps++; // a second finger taps to launch or fire while the first steers
  });
  cv.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (e.pointerType === 'mouse') { if (a.state === 'play' && (e.movementX || e.movementY || !PTR.mouse)) { PTR.mouse = true; PTR.mx = p.x; PTR.my = p.y; } return; }
    if (e.pointerId !== PTR.id || !MG) return;
    // the paddle moves with the finger, not to it, so a thumb never covers it
    const L = VIEW.paddleLine(), k = 2 * HALF / Math.max(1, L.x1 - L.x0) * (a.device === 'phone' ? 1.25 : 1.1);
    PTR.moved = Math.max(PTR.moved, Math.abs(p.x - PTR.sx));
    let tgt = PTR.x0 + (p.x - PTR.sx) * k;
    const lim = HALF - MG.paddle.w;
    // past an edge, re-anchor so turning back moves the paddle at once
    if (tgt < -lim) { PTR.x0 = -lim; PTR.sx = p.x; tgt = -lim; } else if (tgt > lim) { PTR.x0 = lim; PTR.sx = p.x; tgt = lim; }
    IN.target = tgt; IN.src = 'touch';
  });
  const up = (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 0) PTR.down = false; return; }
    if (e.pointerId !== PTR.id) return;
    PTR.id = null;
    if (e.type !== 'pointercancel' && PTR.moved < 14 && e.timeStamp - PTR.t < 320) PTR.taps++;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => { PTR.id = null; PTR.down = false; });
}

/* ------------------------------------------------------------ HUD */
export const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
export const INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736';
// font strings are built once and reused, so drawing the HUD allocates nothing
const FC = {};
function fontOf(w, size, fam) {
  let a = FC[fam]; if (!a) a = FC[fam] = {};
  let b = a[w]; if (!b) b = a[w] = {};
  let f = b[size]; if (!f) f = b[size] = w + ' ' + size + 'px ' + fam;
  return f;
}
function txt(ctx, s, x, y, size, color, align, weight, fam) {
  ctx.font = fontOf(weight || '600', size, fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const PLATE = ['rgba(14,10,8,0.45)', 'rgba(14,10,8,0.5)', 'rgba(14,10,8,0.55)', 'rgba(14,10,8,0.6)'];
function plate(ctx, x, y, w, h, r, al) { rr(ctx, x, y, w, h, r || 10); ctx.fillStyle = PLATE[al | 0] || PLATE[1]; ctx.fill(); ctx.strokeStyle = 'rgba(251,245,236,0.10)'; ctx.lineWidth = 1; ctx.stroke(); }
// one small diya drawn once into a sprite
let LAMP = null;
function lampSprite() {
  if (LAMP) return LAMP;
  const c = document.createElement('canvas'), S2 = 3; c.width = 28 * S2; c.height = 34 * S2;
  const g = c.getContext('2d'); g.scale(S2, S2);
  const x = 14, y = 24;
  const gl = g.createRadialGradient(x, y - 9, 0, x, y - 9, 14); gl.addColorStop(0, 'rgba(255,200,90,0.6)'); gl.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = gl; g.fillRect(0, 0, 28, 34);
  g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x, y + 8, x + 8, y); g.closePath();
  const bg = g.createLinearGradient(0, y, 0, y + 6); bg.addColorStop(0, '#e07848'); bg.addColorStop(1, '#8a3a20'); g.fillStyle = bg; g.fill();
  g.beginPath(); g.moveTo(x, y - 12); g.quadraticCurveTo(x + 4, y - 3.5, x, y - 0.8); g.quadraticCurveTo(x - 4, y - 3.5, x, y - 12);
  const fg = g.createLinearGradient(0, y - 12, 0, y); fg.addColorStop(0, '#fff3c0'); fg.addColorStop(0.6, '#ffc94a'); fg.addColorStop(1, '#ff8a2a'); g.fillStyle = fg; g.fill();
  LAMP = c; return c;
}
function lamp(ctx, x, y, s, t) {
  const sp = lampSprite(), f = 1 + Math.sin(t * 11 + x * 0.7) * 0.05;
  ctx.drawImage(sp, x - 14 * s, y - 24 * s * f, 28 * s, 34 * s * f);
}
const MULT_STR = {};
const multStr = (m) => MULT_STR[m] || (MULT_STR[m] = 'x' + m.toFixed(1));
let chipX = 0;
function chip(ctx, y, label, col, frac) {
  const w = label.length > 1 ? 46 : 28;
  plate(ctx, chipX, y, w, 24, 12, 2);
  if (frac < 1) { ctx.beginPath(); ctx.arc(chipX + w / 2, y + 12, 11, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1)); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); }
  txt(ctx, label, chipX + w / 2, y + 12.5, 11, col, 'center', '700');
  chipX += w + 6;
}
const PJ = { x: 0, y: 0, on: false };
let scoreStr = '0', scoreFor = -1, bossGrad = null, bossGradW = 0;
function drawHUD(ctx, a, G) {
  const W = a.w, H = a.h, pad = a.hudPad(), small = W < 520, t = a.time;
  if (G.cfg.attract) return;
  const top = pad.top, ph = G.phase;
  // score, level, lamps
  const sc = Math.round(G.shown);
  if (sc !== scoreFor) { scoreFor = sc; scoreStr = String(sc); }
  const bh = small ? 42 : 48;
  plate(ctx, pad.left, top, small ? 112 : 150, bh, 12, 1);
  txt(ctx, 'SCORE', pad.left + 12, top + 12, 9, DIM, 'left', '700');
  txt(ctx, scoreStr, pad.left + 12, top + (small ? 28 : 31), small ? 19 : 23, INK, 'left', '600', F_DISP);
  if (ph !== 'intro') {
    txt(ctx, G.lblLvl, W / 2, top + 12, 9, GOLD, 'center', '700');
    if (G.lv) txt(ctx, G.lv.name, W / 2, top + 29, small ? 14 : 17, INK, 'center', '500', F_DISP);
  }
  const n = Math.min(9, G.lives), lw = small ? 15 : 19, pw = Math.max(64, n * lw + 22);
  plate(ctx, W - pad.right - pw, top, pw, bh, 12, 1);
  txt(ctx, 'LAMPS', W - pad.right - 10, top + 12, 9, DIM, 'right', '700');
  const lx = W - pad.right - 10 - lw / 2 - (n - 1) * lw;
  for (let i = 0; i < n; i++) lamp(ctx, lx + i * lw, top + (small ? 35 : 39), small ? 0.6 : 0.72, t);
  // boss bar
  let y2 = top + bh + 8;
  if (G.boss) {
    const B = G.boss, bw = Math.min(W - pad.left - pad.right - 20, 420), bx = W / 2 - bw / 2;
    plate(ctx, bx, y2, bw, 22, 11, 2);
    if (B.hp > 0) {
      if (!bossGrad || bossGradW !== bw) { bossGradW = bw; bossGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0); bossGrad.addColorStop(0, '#ff7a1a'); bossGrad.addColorStop(1, '#ffd35a'); }
      ctx.save(); ctx.translate(0, 0); rr(ctx, bx + 4, y2 + 4, Math.max(8, (bw - 8) * clamp(B.hp / B.max, 0, 1)), 14, 7); ctx.fillStyle = bossGrad; ctx.fill(); ctx.restore();
    }
    txt(ctx, B.def.name, W / 2, y2 + 11.5, 10, B.hp / B.max > 0.5 ? '#1a0d02' : INK, 'center', '700');
    y2 += 30;
  }
  // the streak multiplier and power timers
  chipX = pad.left;
  const m = mult(G), P = G.paddle;
  if (m > 1) chip(ctx, y2, multStr(m), '#ffcf5a', 1);
  if (P.mode === 'laser') chip(ctx, y2, 'L', POWERS.laser.col, P.modeT / 15);
  if (P.mode === 'catch') chip(ctx, y2, 'C', POWERS.catch.col, P.modeT / 25);
  if (G.fireT > 0) chip(ctx, y2, 'F', POWERS.fire.col, G.fireT / 10);
  if (G.slowT > 0) chip(ctx, y2, 'S', POWERS.slow.col, G.slowT / 12);
  if (G.fastT > 0) chip(ctx, y2, 'X', POWERS.fast.col, G.fastT / 10);
  if (G.heavyT > 0) chip(ctx, y2, 'H', POWERS.heavy.col, G.heavyT / 9);
  if (P.size > 0) chip(ctx, y2, 'W', POWERS.wide.col, 1);
  if (P.size < 0) chip(ctx, y2, 'N', POWERS.narrow.col, 1);
  // capsule letters ride on the falling capsules
  for (let i = 0; i < G.caps.length; i++) {
    const c = G.caps[i]; if (!c.alive) continue;
    if (!VIEW.project(lerp(c.px, c.x, G.alpha), lerp(c.py, c.y, G.alpha), 0.34, PJ) || !PJ.on) continue;
    const D = POWERS[c.type];
    ctx.beginPath(); ctx.arc(PJ.x, PJ.y, small ? 8 : 10, 0, TAU); ctx.fillStyle = 'rgba(10,8,6,0.72)'; ctx.fill(); ctx.strokeStyle = D.col; ctx.lineWidth = 1.5; ctx.stroke();
    txt(ctx, D.key, PJ.x, PJ.y + 0.5, small ? 10 : 11, D.good ? '#ffffff' : '#ffb0b0', 'center', '800');
  }
  // score pops
  for (let i = 0; i < G.pops.length; i++) {
    const p = G.pops[i]; if (p.t >= p.life) continue;
    if (!VIEW.project(p.x, p.y, 0.6, PJ)) continue;
    const k = p.t / p.life;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    if (p.big) {
      const sz = Math.round((small ? 15 : 19) * (1 + 0.25 * Math.max(0, 1 - p.t * 6)));
      ctx.font = fontOf('700', sz, F_DISP); const tw = ctx.measureText(p.text).width;
      const px = clamp(PJ.x, tw / 2 + 16, W - tw / 2 - 16), py = clamp(PJ.y - 30 - k * 26, top + 70, H - 60);
      plate(ctx, px - tw / 2 - 10, py - sz * 0.7, tw + 20, sz * 1.4, 10, 0);
      txt(ctx, p.text, px, py, sz, p.col, 'center', '700', F_DISP);
    } else txt(ctx, p.text, PJ.x, PJ.y - 8 - k * 22, small ? 11 : 13, p.col, 'center', '700');
  }
  ctx.globalAlpha = 1;
  // centre messages
  const cy = H * 0.56;
  if (ph === 'intro') {
    const k = G.pt / G.introDur;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : k > 0.82 ? Math.max(0, 1 - (k - 0.82) / 0.18) : 1;
    txt(ctx, G.lblTop, W / 2, H * 0.42, 11, GOLD, 'center', '700');
    txt(ctx, G.lv.name, W / 2, H * 0.42 + (small ? 32 : 40), small ? 32 : 46, INK, 'center', '500', F_DISP);
    txt(ctx, G.lblSub, W / 2, H * 0.42 + (small ? 62 : 78), 12, DIM, 'center', '600');
    ctx.globalAlpha = 1;
  } else if (ph === 'serve') {
    ctx.globalAlpha = 0.6 + Math.sin(t * 4) * 0.3;
    const s = a.touchMode ? (a.touchStyle === 'pads' ? 'Stick to move, Launch to serve' : a.touchStyle === 'tilt' ? 'Tilt to move, tap to launch' : 'Drag anywhere to move, tap to launch') : a.inputMode === 'gamepad' ? 'Stick to move, A to launch' : a.inputMode === 'mouse' ? 'Move the mouse, click to launch' : 'Arrows to move, Space to launch';
    txt(ctx, s, W / 2, cy, small ? 13 : 15, INK, 'center', '600', F_BODY);
    ctx.globalAlpha = 1;
  } else if (ph === 'lost') {
    ctx.globalAlpha = Math.min(1, G.pt * 3) * (G.pt > 1.1 ? Math.max(0, 1 - (G.pt - 1.1) / 0.3) : 1);
    txt(ctx, G.lives > 0 ? 'The lamp flickers' : 'The last lamp is out', W / 2, cy - 10, small ? 22 : 30, INK, 'center', '500', F_DISP);
    if (G.lives > 0) txt(ctx, G.lblLost, W / 2, cy + 20, 12, GOLD, 'center', '700');
    ctx.globalAlpha = 1;
  } else if (ph === 'clear') {
    ctx.globalAlpha = Math.min(1, G.pt * 2.5) * (G.pt > 3.0 ? Math.max(0, 1 - (G.pt - 3.0) / 0.4) : 1);
    txt(ctx, G.boss ? 'Boss defeated' : 'Level clear', W / 2, H * 0.4, small ? 32 : 46, '#ffe7a8', 'center', '500', F_DISP);
    txt(ctx, G.lblClear, W / 2, H * 0.4 + (small ? 34 : 44), 12, GOLD, 'center', '700');
    ctx.globalAlpha = 1;
  } else if (ph === 'win') {
    txt(ctx, G.cfg.mode === 'boss' ? 'All bosses beaten' : 'Every lamp lit', W / 2, H * 0.42, small ? 30 : 44, '#ffe7a8', 'center', '500', F_DISP);
  }
  if (G.paddle.stun > 0 && ph === 'play' && VIEW.project(G.paddle.x, PAD_Y, 0.8, PJ)) txt(ctx, 'STUNNED', PJ.x, PJ.y - 18, 10, '#ffb0b0', 'center', '800');
}
function drawLoading(ctx, a) {
  const W = a.w, H = a.h, t = a.time + performance.now() / 1000;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a1a2c'); g.addColorStop(0.55, '#3d2018'); g.addColorStop(1, '#120b09');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.5;
  for (let ring = 0; ring < 5; ring++) {
    const n = 8 + ring * 6, R = 30 + ring * 26;
    for (let i = 0; i < n; i++) {
      const an = i / n * TAU + ring * 0.3 + t * (ring % 2 ? 0.15 : -0.12);
      ctx.beginPath(); ctx.arc(cx + Math.cos(an) * R, cy + Math.sin(an) * R * 0.6, 3 + (ring % 2), 0, TAU);
      ctx.fillStyle = ['#ffb736', '#d6527e', '#26a69a', '#e98a35', '#6a9cff'][ring];
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 3 + i + ring); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  lamp(ctx, cx, cy + 10, 2.2, t);
}

/* ------------------------------------------------------------ menu */
const MENU_CSS =
  '.db-intro{margin:0 0 6px}.db-final{font-family:var(--font-mono);font-size:14px;margin:0 0 10px}.db-final b{font-weight:600}.db-final span{color:var(--ink-mute);margin:0 8px}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }
function menuProps(a) {
  const reached = a.store.get('arcade.diya-breaker.reached', 1) || 1;
  return {
    eyebrow: 'Brick breaker', title: 'Diya <em>Breaker</em>',
    html: '<p class="db-intro">Ride the paddle and keep the glowing diya in play. Smash clay and glass, set off firecracker bricks in chains, catch falling power-ups and beat three festival bosses across 30 levels.</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'story', choices: [{ v: 'story', label: '30 levels' }, { v: 'endless', label: 'Endless' }, { v: 'boss', label: 'Boss rush' }] },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Relaxed' }, { v: 'normal', label: 'Classic' }, { v: 'hard', label: 'Fierce' }] },
      { id: 'act', label: 'Start at', value: '1', choices: [{ v: '1', label: 'Act I' }, { v: '11', label: 'Act II' }, { v: '21', label: 'Act III' }], note: reached >= 21 ? 'Every act is open.' : reached >= 11 ? 'Act III opens when you reach level 21.' : 'Later acts open as you reach them in the 30 levels.' }
    ]
  };
}
function debugState() {
  const G = MG; if (!G) return null;
  const b = G.balls.find((k) => k.alive) || G.balls[0];
  let balls = 0; for (let i = 0; i < G.balls.length; i++) if (G.balls[i].alive) balls++;
  const v = VIEW && VIEW.debug ? VIEW.debug() : {};
  return Object.assign({
    mode: G.cfg.mode, diff: G.cfg.diff, attract: !!G.cfg.attract, level: G.level, phase: G.phase, score: G.score, lives: G.lives, balls, bricks: G.breakable,
    paddleX: +G.paddle.x.toFixed(3), paddleW: +G.paddle.w.toFixed(2), paddleMode: G.paddle.mode, ballX: +b.x.toFixed(3), ballY: +b.y.toFixed(3), speed: +Math.hypot(b.vx, b.vy).toFixed(2),
    combo: G.combo, broken: G.bricksBroken, boss: G.boss ? +G.boss.hp.toFixed(1) : null, caps: G.caps.filter((c) => c.alive).length, input: IN.src
  }, v);
}

/* ------------------------------------------------------------ boot */
export function boot(view) {
  VIEW = view;
  window.Arcade.create({
    three: !!view.three,
    slug: 'diya-breaker', title: 'Diya Breaker', genre: 'Brick breaker',
    graphics(level) { if (view.graphics) view.graphics(level); },
    hint: 'Arrows or A D move the paddle, or just move the mouse. Space or click launches the ball and fires lasers.',
    touchHint: 'Stick moves the paddle. Launch serves the ball and fires lasers.',
    keys: [['Left Right / A D', 'Move the paddle'], ['Space / Up', 'Launch, fire lasers'], ['Hold Space', 'Keep firing lasers']],
    mouse: { steer: false, cursor: 'default', keys: [['Move mouse', 'Move the paddle'], ['Click', 'Launch, fire lasers']] },
    gamepad: { buttons: ['Space', 'Space', 'Space', 'Space'], rt: 'Space' },
    touch: { stick: true, pads: [{ label: 'Launch', key: 'Space', big: true, hot: true }] },
    touchKeys: [['Stick', 'Move the paddle'], ['Launch', 'Serve the ball, fire lasers']],
    gestures: {
      drag: false, tilt: true,
      hint: 'Drag anywhere to move the paddle. Tap to launch and fire.',
      keys: [['Drag anywhere', 'The paddle follows your finger'], ['Tap', 'Launch the ball, fire lasers'], ['Second finger tap', 'Fire while you steer']]
    },
    formatScore: (v) => String(Math.round(v)),
    resize: (a) => { if (view.resize) view.resize(a); },
    init(a) {
      ARC = a;
      if (!view.init(a)) return;
      const origMenu = a.menu;
      a.menu = function (p) { return origMenu(Object.assign(menuProps(a), p || {})); };
      a.debug = debugState;
      a.dev = Object.assign({
        game: () => MG,
        level: (n) => { if (MG && !MG.cfg.attract) { loadLevel(MG, clamp(n | 0, 1, 30)); if (view.newLevel) view.newLevel(MG); } },
        skip: () => { if (MG && MG.phase === 'intro') MG.pt = MG.introDur; },
        auto: (on) => { if (MG) MG.auto = on !== false; },
        power: (t) => { if (MG && POWERS[t]) applyPower(MG, t, a); },
        clear: () => { if (MG) { MG.bricks.forEach((b) => { if (b.alive && b.kind !== K_GOLD) { b.alive = false; G_gridClear(MG, b); MG.breakable--; } }); if (MG.boss) { MG.boss.hp = 0; MG.boss.dead = true; MG.boss.deadT = 9; } } }
      }, view.dev || {});
      attachPointer(a);
      a.menu();
    },
    onMenu(a) { injectCss(); },
    start(a, ch) {
      injectCss();
      const mode = ch.mode === 'endless' || ch.mode === 'boss' ? ch.mode : 'story';
      const diff = DIFF[ch.diff] ? ch.diff : 'normal';
      MG = newGame({ mode, diff, attract: false });
      let lvl = 1;
      if (mode === 'story') {
        const want = +ch.act || 1, reached = a.store.get('arcade.diya-breaker.reached', 1) || 1;
        if (want > 1 && reached < want) a.toast('Act ' + (want === 11 ? 'II' : 'III') + ' opens when you reach level ' + want, 'Starting from Act I', 2200);
        else lvl = want;
      }
      PTR.id = null; PTR.taps = 0; PTR.down = false; PTR.mouse = false; IN.target = null; IN.act = false; IN.src = 'keys';
      audioInit(); if (AU.ok && AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {});
      loadLevel(MG, lvl);
      setRoot(MG.lv.act || 0);
      if (view.newLevel) view.newLevel(MG);
      if (view.newGame) view.newGame(MG, a);
    },
    update(dt, a) {
      const G = MG; if (!G || G.cfg.attract) return;
      readInput(G, a, dt);
      const ev0 = G.evN;
      frame(G, dt, a);
      if (G.evN !== ev0) soundEvents(G, ev0);
      if ((G.phase === 'over' || G.phase === 'win') && G.overArgs && !G.overShown && G.pt > G.overAt) { G.overShown = true; G.overArgs.score = G.score; a.over(G.overArgs); }
      if (G.version !== G.seenVersion) { G.seenVersion = G.version; if (view.newLevel) view.newLevel(G); if (G.lv) setRoot(G.lv.act || 0); }
      music(G, a, dt);
      a.canvas.style.cursor = IN.src === 'mouse' && (G.phase === 'play' || G.phase === 'serve') ? 'none' : 'default';
    },
    idle(dt, a) {
      if (a.state === 'menu') {
        if (!MG || !MG.cfg.attract) { MG = newGame({ mode: 'story', diff: 'normal', attract: true }); loadLevel(MG, 4); MG.seenVersion = MG.version; if (view.newLevel) view.newLevel(MG); }
        IN.target = null; IN.axis = 0; IN.act = false;
        frame(MG, dt, a);
        if (MG.version !== MG.seenVersion) { MG.seenVersion = MG.version; if (view.newLevel) view.newLevel(MG); }
      }
      a.canvas.style.cursor = 'default';
      music(MG, a, dt);
    },
    render(ctx, a) {
      if (!MG) { drawLoading(ctx, a); return; }
      let ok;
      try { ok = view.render(a, MG, ctx) !== false; } catch (e) { ok = false; console.warn(e); }
      if (!ok) { drawLoading(ctx, a); return; }
      drawHUD(ctx, a, MG);
    },
    onPause() { if (AU.ok) try { AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.05); } catch (e) { /* ignore */ } },
    onMute() { if (AU.ok && AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {}); }
  });
}
export const _test = { newGame, loadLevel, frame, IN, LEVELS };
function G_gridClear(G, b) { if (b.kind !== K_MOVE) G.grid[b.r * COLS + b.c] = 0; }
const SND_KIND = ['clay', 'glass', 'metal', 'gold', 'clay', 'clay'];
let lastWall = 0;
function soundEvents(G, from) {
  if (!AU.ok) return;
  let breaks = 0;
  events(G, from, (e) => {
    switch (e.type) {
      case 'break': if (breaks++ < 3) { if (e.k === 2) break; audio(SND_KIND[e.a] || 'clay', e.b, 0); } break;
      case 'crack': audio('metal', 0, 1); break;
      case 'gold': audio('gold'); break;
      case 'paddle': audio('paddle', clamp(e.b, -1, 1)); break;
      case 'wall': { const now = performance.now(); if (now - lastWall > 60) { lastWall = now; audio('wall'); } break; }
      case 'boom': audio('boom'); break;
      case 'laser': audio('laser'); break;
      case 'launch': audio('launch'); break;
      case 'bossHit': audio('bossHit'); break;
      case 'bossFire': audio('bossFire'); break;
      case 'stun': audio('stun'); break;
      case 'catch': audio('catch'); break;
      case 'level': audio('whoosh'); break;
      case 'bossDown': audio('boom'); audio('firework'); break;
      case 'clear': audio('firework'); break;
      case 'chain': if (e.a >= 8) hap(ARC, 'heavy', clamp(e.a / 16, 0.5, 1)); else hap(ARC, 'hit', 0.6); break;
      case 'shield': audio('clay', 3); break;
    }
  });
}
