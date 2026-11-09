/*
 * Laddoo Dash, the shared core: mazes, rules, the four mischief spirits, the
 * hero's grid movement, controls, sound, HUD, cutscenes and the arcade shell
 * glue. game3d.js (WebGL) and game.js (the 2D fallback) each add a renderer,
 * a "view", and call boot(view). Both play exactly the same game.
 *
 * The world is a tile grid. x runs right, y runs down the maze, one tile is
 * one unit, and an entity sits on a tile when its position is a whole number.
 * The rules step at a fixed 120 Hz; the views draw positions interpolated
 * between the last two steps, so motion is smooth at any frame rate.
 */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

/* ------------------------------------------------------------ the grid */
// Directions: 0 up, 1 left, 2 down, 3 right (also the tie-break order).
export const DX = [0, -1, 0, 1];
export const DY = [-1, 0, 1, 0];
const REV = [2, 3, 0, 1];
export const WALL = 0, PATH = 1, DOOR = 2, HOUSE = 3, TUN = 4;
const STEP = 1 / 120;

// Each maze is drawn as its left half plus the centre column; the right half is the mirror.
// '#' wall, '.' laddoo, 'o' golden jalebi, ' ' open floor, '=' the spirit house door, 'h' inside the house, 't' tunnel.
export const MAZES = [
  {
    id: 'galli', name: 'Mithai Galli', start: [10, 15], neon: '#ff3d8b', neon2: '#ffb347', glass: '#2a0f2a', floor: '#0d0612',
    rows: ['###########', '#o........#', '#.##.####.#', '#..........', '#.##.#.####', '#....#....#', '####.####.#', '####.#     ', '####.# ###=', 'tttt.  #hhh', '####.# ####', '####.#     ', '####.# ####', '#.........#', '#.##.####.#', '#o.#.......', '##.#.#.####', '#....#....#', '#.#######.#', '#..........', '###########']
  },
  {
    id: 'court', name: 'Rangoli Court', start: [10, 14], neon: '#24e3d4', neon2: '#a77bff', glass: '#08212a', floor: '#050c12',
    rows: ['###########', '#o...#....#', '#.##.#.##.#', '#.##...##..', '#....#....#', '###.###.###', 'tt...#.....', '####.# ###=', '####.# #hhh', '####.# ####', '####.#     ', '#....#.####', '#.##...#...', '#.##.#.#.##', '#o...#.....', '###.####.##', 'tt.....#...', '####.#.#.##', '#....#.....', '#.######.##', '#..........', '###########']
  },
  {
    id: 'bazaar', name: 'Lantern Bazaar', start: [10, 15], neon: '#ffa21f', neon2: '#ff4a3d', glass: '#2a1606', floor: '#100804',
    rows: ['###########', '#.........#', '#.###.###.#', '#o#.....#..', '#.#.###.#.#', '#.........#', '##.###.####', '##.###     ', '##.... ###=', '##.### #hhh', 'tt.### ####', '##.###     ', '##.###.####', '#....#.....', '#.##.#.###.', '#o.#.......', '##.#.#####.', '#....#.....', '#.##.#.#.##', '#..........', '###########']
  },
  {
    id: 'ghat', name: 'Ghat Steps', start: [10, 13], neon: '#4f86ff', neon2: '#3ef0ff', glass: '#0a1030', floor: '#04060f',
    rows: ['###########', '#o...##....', '#.##.##.##.', '#..........', '##.#.###.##', '#..#...#...', '#.####.#.##', '#......#   ', '####.# ###=', 'tt...# #hhh', '####.# ####', '####.#     ', '#......#.##', '#.###.##...', '#o..#....#.', '###.#.##.#.', '#.....#....', '#.###.#.#.#', '#.........#', '###########']
  }
];

export function makeMaze(def) {
  const rows = def.rows.map((r) => r + r.slice(0, r.length - 1).split('').reverse().join(''));
  const H = rows.length, W = rows[0].length;
  const cells = new Uint8Array(W * H), pel0 = new Uint8Array(W * H);
  let door = { x: 10, y: 8 }, total = 0, power = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = rows[y][x], i = y * W + x;
    if (c === '#') cells[i] = WALL;
    else if (c === '=') { cells[i] = DOOR; door = { x, y }; }
    else if (c === 'h') cells[i] = HOUSE;
    else if (c === 't') cells[i] = TUN;
    else cells[i] = PATH;
    if (c === '.') { pel0[i] = 1; total++; }
    else if (c === 'o') { pel0[i] = 2; total++; power++; }
  }
  const start = { x: def.start[0], y: def.start[1] };
  if (pel0[start.y * W + start.x]) { pel0[start.y * W + start.x] = 0; total--; }
  let bonus = { x: door.x, y: door.y + 3 };
  if (cells[bonus.y * W + bonus.x] !== PATH) bonus = { x: start.x, y: start.y };
  return {
    id: def.id, name: def.name, def, W, H, cells, pel0, total, power, door, houseY: door.y + 1, start, bonus,
    neon: def.neon, neon2: def.neon2, glass: def.glass, floor: def.floor,
    // where each spirit heads in scatter: just outside a corner
    corners: [[W - 2, -3], [1, -3], [W - 1, H + 1], [0, H + 1]]
  };
}
const cellAt = (M, x, y) => { if (y < 0 || y >= M.H) return WALL; x = ((x % M.W) + M.W) % M.W; return M.cells[y * M.W + x]; };
const heroOpen = (M, x, y) => { const c = cellAt(M, x, y); return c === PATH || c === TUN; };
export const wrapX = (M, x) => { if (x < -0.5) return x + M.W; if (x >= M.W - 0.5) return x - M.W; return x; };
const wrapDX = (M, d) => { if (d > M.W / 2) return d - M.W; if (d < -M.W / 2) return d + M.W; return d; };

/* ------------------------------------------------------------ the cast */
export const SPIRITS = [
  { name: 'Tikku', col: '#ff3b5c', glow: '#ff9aae', role: 'chases you straight' },
  { name: 'Chhupa', col: '#c063ff', glow: '#e3b4ff', role: 'cuts you off ahead' },
  { name: 'Ghumi', col: '#1fd8e6', glow: '#a6f6ff', role: 'flanks with Tikku' },
  { name: 'Bholu', col: '#ff9d2a', glow: '#ffd19a', role: 'wanders, then shies away' }
];
export const BONUS = [
  { id: 'samosa', name: 'Samosa', pts: 100, col: '#e0a84c' },
  { id: 'mango', name: 'Mango', pts: 300, col: '#ffb21a' },
  { id: 'chai', name: 'Chai', pts: 500, col: '#c98a4b' },
  { id: 'kulfi', name: 'Kulfi', pts: 700, col: '#d8f0c0' },
  { id: 'katli', name: 'Kaju katli', pts: 1000, col: '#e8e8f0' }
];
const bonusFor = (L) => (L <= 1 ? 0 : L === 2 ? 1 : L <= 4 ? 2 : L <= 6 ? 3 : 4);
const CUTS = [
  { title: 'Second helpings', sub: 'Tikku wants the last laddoo' },
  { title: 'The slip', sub: 'Chhupa never looks down' },
  { title: 'Jalebi rain', sub: 'Four spirits, one hero, one giant jalebi' }
];
const DIFF = {
  easy: { pl: 1.0, sp: 0.86, fr: 1.4, lives: 5, rel: 1.4 },
  normal: { pl: 1.0, sp: 0.96, fr: 1.0, lives: 3, rel: 1 },
  hard: { pl: 1.03, sp: 1.07, fr: 0.65, lives: 3, rel: 0.6 }
};
const BASE = 8.0;
const SCHED = [7, 20, 7, 20, 5, 20, 5, 1e9];

/* ------------------------------------------------------------ state */
let ARC = null, VIEW = null, MG = null, BEST = 0;
const TOUCH = { id: null, ax: 0, ay: 0, sx: 0, sy: 0, t0: 0, moved: false, turned: false, want: -1, tap: null, skip: false };
const STATS = { swipes: 0, taps: 0, turns: 0, keys: 0, pad: 0 };
// One reusable payload for view effects, so an event never allocates.
const FXD = { x: 0, y: 0, i: 0, k: 0, col: '#ffffff', combo: 0, kind: 0 };

function newHero() { return { x: 0, y: 0, px: 0, py: 0, dir: 1, want: -1, moving: false, stopT: 0, speed: 0, ang: 0, chomp: 0, dist: 0, spin: 0, scale: 1, vis: true }; }
function newSpirit(i) { return { i, x: 0, y: 0, px: 0, py: 0, tx: 0, ty: 0, dir: 1, st: 'house', fright: false, speed: 0, bobT: i * 1.7, t: 0, released: false, dots: 0, face: 0, vis: true }; }

function newGame(cfg) {
  const G = {
    cfg, level: 1, score: 0, lives: cfg.attract ? 99 : (cfg.mode === 'rush' ? 1 : DIFF[cfg.diff].lives), extra: false,
    M: null, mazeIdx: cfg.maze | 0, pel: null, left: 0, eaten: 0, eatenAll: 0, spiritsEaten: 0, bestCombo: 0, fruits: 0,
    hero: newHero(), sp: [newSpirit(0), newSpirit(1), newSpirit(2), newSpirit(3)],
    phase: 'ready', pt: 0, time: 0, acc: 0, alpha: 0, first: true,
    fright: 0, frightMax: 0, combo: 0, sweep: 0,
    sched: 0, schedT: 0, chase: false, noDotT: 0, deathDots: -1,
    fruit: { on: false, kind: 0, t: 0, shown: 0 }, fruitAt: [50, 120],
    timeLeft: cfg.mode === 'rush' ? 150 : 0, waka: 0, cutN: 0, cut: null, fade: cfg.attract ? 0 : 1,
    pops: [], popI: 0, rng: rngf(cfg.seed || 1234), lastEat: 0, freeze: 0, flash: 0, invincible: false, bot: !!cfg.attract,
    pose: null, ui: { title: 0 }, ended: false, overT: 0, cleared: 0
  };
  for (let i = 0; i < 8; i++) G.pops.push({ on: false, x: 0, y: 0, t: 0, text: '', col: '#fff' });
  G.cut = makeCut();
  loadLevel(G, true);
  return G;
}
function rngf(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mazeForLevel(G) { return (G.mazeIdx + G.level - 1) % MAZES.length; }
const MCACHE = [];
function mazeAt(i) { if (!MCACHE[i]) MCACHE[i] = makeMaze(MAZES[i]); return MCACHE[i]; }
function loadLevel(G, fresh) {
  const M = mazeAt(mazeForLevel(G));
  G.M = M; G.pel = M.pel0.slice(); G.left = M.total; G.eaten = 0;
  G.fruit.on = false; G.fruit.shown = 0; G.fright = 0; G.combo = 0; G.deathDots = -1;
  for (let i = 0; i < 4; i++) { G.sp[i].released = false; G.sp[i].dots = 0; }
  resetActors(G);
  if (VIEW && VIEW.setMaze) VIEW.setMaze(M, G);
  G.phase = 'ready'; G.pt = 0; G.flash = 0;
  if (!fresh) G.first = false;
}
function speeds(G) {
  const L = G.level, d = DIFF[G.cfg.diff] || DIFF.normal;
  const hero = BASE * (L === 1 ? 0.82 : L < 5 ? 0.9 : 0.98) * d.pl;
  const sp = BASE * (L === 1 ? 0.74 : L < 5 ? 0.84 : 0.93) * d.sp * (1 + Math.min(0.1, (L - 1) * 0.008));
  return { hero, sp };
}
function frightTime(G) { const d = DIFF[G.cfg.diff] || DIFF.normal; return Math.max(1.6, 7 - (G.level - 1) * 0.55) * d.fr; }
function resetActors(G) {
  const M = G.M, h = G.hero;
  h.x = h.px = M.start.x; h.y = h.py = M.start.y; h.dir = 1; h.want = -1; h.moving = false; h.stopT = 0; h.ang = -Math.PI / 2; h.chomp = 0; h.spin = 0; h.scale = 1; h.vis = true;
  const hx = M.door.x, hy = M.houseY;
  const P = [[hx, M.door.y - 1], [hx, hy], [hx - 1.6, hy], [hx + 1.6, hy]];
  for (let i = 0; i < 4; i++) {
    const s = G.sp[i];
    s.x = s.px = P[i][0]; s.y = s.py = P[i][1]; s.fright = false; s.vis = true; s.t = 0; s.released = i === 0;
    s.st = i === 0 ? 'active' : 'house'; s.dir = i === 0 ? 1 : (i === 2 ? 0 : 2);
    s.tx = Math.round(s.x) - (i === 0 ? 1 : 0); s.ty = Math.round(s.y); s.face = Math.PI;
  }
  G.sched = 0; G.schedT = 0; G.chase = false; G.noDotT = 0; G.fright = 0; G.freeze = 0;
}

/* ------------------------------------------------------------ the hero */
const CORNER = 0.44;
function tryTurn(G, h) {
  const M = G.M, w = h.want;
  if (w < 0 || w === h.dir && h.moving) return;
  const cx = Math.round(h.x), cy = Math.round(h.y);
  if (w === REV[h.dir] && h.moving) { h.dir = w; return; }
  if (!heroOpen(M, cx + DX[w], cy + DY[w])) return;
  const off = DX[h.dir] !== 0 ? Math.abs(wrapDX(M, h.x - cx)) : Math.abs(h.y - cy);
  if (!h.moving || off <= CORNER) {
    if (h.dir !== w) STATS.turns++;
    h.dir = w; h.moving = true;
  }
}
function heroStep(G, dt) {
  const h = G.hero, M = G.M;
  if (h.stopT > 0) { h.stopT -= dt; return; }
  tryTurn(G, h);
  const d = h.dir;
  if (d < 0) return;
  const v = h.speed * (G.fright > 0 ? 1.06 : 1) * dt;
  const cx = Math.round(h.x), cy = Math.round(h.y);
  // Cornering: while moving one way, ease the other axis onto the corridor's centre line.
  if (DX[d] !== 0) h.y = approach(h.y, cy, v); else { const tx = cx; h.x = h.x + clamp(wrapDX(M, tx - h.x), -v, v); }
  const s = DX[d] !== 0 ? DX[d] : DY[d];
  const along = DX[d] !== 0 ? h.x : h.y;
  const c = Math.round(along);
  const blocked = !heroOpen(M, (DX[d] !== 0 ? c : cx) + DX[d], (DY[d] !== 0 ? c : cy) + DY[d]);
  let a = along + s * v;
  const pre = s * (along - c);
  if (blocked && (pre >= -1e-6 || s * (a - c) >= 0)) { a = c; h.moving = false; } else h.moving = true;
  if (DX[d] !== 0) h.x = wrapX(M, a); else h.y = a;
  if (h.moving) h.dist += v;
}
function eatCheck(G) {
  const h = G.hero, M = G.M;
  const cx = ((Math.round(h.x) % M.W) + M.W) % M.W, cy = Math.round(h.y);
  if (cy < 0 || cy >= M.H) return;
  const i = cy * M.W + cx, p = G.pel[i];
  if (p) {
    G.pel[i] = 0; G.left--; G.eaten++; G.eatenAll++; G.noDotT = 0;
    for (let k = 0; k < 4; k++) { const s = G.sp[k]; if (s.st === 'house' && !s.released) { s.dots++; break; } }
    if (G.deathDots >= 0) G.deathDots++;
    if (p === 1) { addScore(G, 10); h.stopT = 1 / 60; sndEat(G); }
    else { addScore(G, 50); h.stopT = 3 / 60; power(G); }
    FXD.x = cx; FXD.y = cy; FXD.i = i; FXD.kind = p; fx('eat', FXD);
    if (G.eaten === G.fruitAt[0] || G.eaten === G.fruitAt[1]) { G.fruit.on = true; G.fruit.kind = bonusFor(G.level); G.fruit.t = 9.5; FXD.x = M.bonus.x; FXD.y = M.bonus.y; FXD.kind = G.fruit.kind; fx('fruitShow', FXD); }
    if (G.left <= 0) { G.phase = 'clear'; G.pt = 0; G.cleared++; sirenOff(); if (!G.cfg.attract) haptic('success', 0.9); fx('clear', FXD); if (G.cfg.mode === 'rush') G.timeLeft += 15; }
  }
  if (G.fruit.on && cx === M.bonus.x && cy === M.bonus.y) {
    const B = BONUS[G.fruit.kind];
    G.fruit.on = false; G.fruits++; addScore(G, B.pts); pop(G, M.bonus.x, M.bonus.y, '' + B.pts, B.col);
    sndFruit(); if (!G.cfg.attract) haptic('tap', 0.7);
    FXD.x = M.bonus.x; FXD.y = M.bonus.y; FXD.kind = G.fruit.kind; fx('fruit', FXD);
  }
}
function power(G) {
  G.fright = G.frightMax = frightTime(G); G.combo = 0; G.sweep = 0;
  for (let i = 0; i < 4; i++) {
    const s = G.sp[i];
    if (s.st === 'active') { s.fright = true; reverse(G, s); }
    else if (s.st === 'house' || s.st === 'leave') s.fright = true;
  }
  sndPower(); if (!G.cfg.attract) haptic('boost', 0.9);
  FXD.x = G.hero.x; FXD.y = G.hero.y; fx('power', FXD);
}
function addScore(G, n) {
  const before = G.score; G.score += n;
  if (!G.extra && G.cfg.mode !== 'rush' && !G.cfg.attract && before < 10000 && G.score >= 10000) {
    G.extra = true; G.lives++; sndExtra(); haptic('success', 0.6);
    if (ARC) ARC.toast('Extra life', '10,000 points', 1400);
  }
}
function pop(G, x, y, text, col) {
  const p = G.pops[G.popI++ % G.pops.length];
  p.on = true; p.x = x; p.y = y; p.t = 0; p.text = text; p.col = col;
}

/* ------------------------------------------------------------ the spirits */
function reverse(G, s) {
  if (s.st !== 'active') return;
  s.dir = REV[s.dir]; s.tx = s.tx + DX[s.dir]; s.ty = s.ty + DY[s.dir];
  if (s.ty < 0 || s.ty >= G.M.H) { s.ty = Math.round(s.y); s.tx = Math.round(s.x); }
}
function spiritOpen(M, x, y) { const c = cellAt(M, x, y); return c === PATH || c === TUN; }
const TGT = { x: 0, y: 0 };
function target(G, s) {
  const h = G.hero, M = G.M, hx = Math.round(h.x), hy = Math.round(h.y), hd = h.dir < 0 ? 1 : h.dir;
  if (s.st === 'eyes') { TGT.x = M.door.x; TGT.y = M.door.y - 1; return; }
  if (!G.chase && !(s.i === 0 && G.left < 22)) { TGT.x = M.corners[s.i][0]; TGT.y = M.corners[s.i][1]; return; }
  if (s.i === 0) { TGT.x = hx; TGT.y = hy; }
  else if (s.i === 1) { TGT.x = hx + DX[hd] * 4; TGT.y = hy + DY[hd] * 4; }
  else if (s.i === 2) { const ax = hx + DX[hd] * 2, ay = hy + DY[hd] * 2, t = G.sp[0]; TGT.x = ax + (ax - Math.round(t.x)); TGT.y = ay + (ay - Math.round(t.y)); }
  else { const dx = wrapDX(M, s.x - h.x), dy = s.y - h.y; if (dx * dx + dy * dy > 64) { TGT.x = hx; TGT.y = hy; } else { TGT.x = M.corners[3][0]; TGT.y = M.corners[3][1]; } }
}
function decide(G, s) {
  const M = G.M, cx = ((s.tx % M.W) + M.W) % M.W, cy = s.ty;
  let best = -1, bd = 1e9;
  if (s.fright && s.st === 'active') {
    // Frightened: a random open way, never straight back.
    const start = (G.rng() * 4) | 0;
    for (let k = 0; k < 4; k++) { const d = (start + k) & 3; if (d === REV[s.dir]) continue; if (spiritOpen(M, cx + DX[d], cy + DY[d])) { best = d; break; } }
  } else {
    target(G, s);
    for (let d = 0; d < 4; d++) {
      if (d === REV[s.dir]) continue;
      if (!spiritOpen(M, cx + DX[d], cy + DY[d])) continue;
      const ex = wrapDX(M, cx + DX[d] - TGT.x), ey = cy + DY[d] - TGT.y, dd = ex * ex + ey * ey;
      if (dd < bd) { bd = dd; best = d; }
    }
  }
  if (best < 0) best = REV[s.dir];
  s.dir = best; s.tx = s.tx + DX[best]; s.ty = s.ty + DY[best];
}
function spiritSpeed(G, s, sp) {
  const M = G.M;
  if (s.st === 'eyes') return BASE * 1.9;
  if (s.st === 'house' || s.st === 'leave' || s.st === 'enter') return BASE * 0.45;
  const c = cellAt(M, Math.round(s.x), Math.round(s.y));
  if (c === TUN) return BASE * 0.42;
  if (s.fright) return BASE * 0.5;
  let v = sp;
  if (s.i === 0 && G.left < 22) v *= G.left < 10 ? 1.1 : 1.05;
  return v;
}
function moveNav(G, s, dist) {
  const M = G.M;
  let guard = 0;
  while (dist > 1e-6 && guard++ < 4) {
    const dx = s.tx - s.x, dy = s.ty - s.y, l = Math.abs(dx) + Math.abs(dy);
    if (l <= dist) {
      s.x = s.tx; s.y = s.ty; dist -= l;
      if (s.x < 0) { s.x += M.W; s.tx += M.W; } else if (s.x > M.W - 1) { s.x -= M.W; s.tx -= M.W; }
      if (s.st === 'eyes' && Math.round(s.x) === M.door.x && Math.round(s.y) === M.door.y - 1) { s.st = 'enter'; return; }
      decide(G, s);
    } else {
      s.x += Math.sign(dx) * Math.min(dist, Math.abs(dx)); s.y += Math.sign(dy) * Math.min(dist, Math.abs(dy)); dist = 0;
    }
  }
}
function release(G, s) { s.released = true; s.st = 'leave'; }
function houseStep(G, s, dt, v) {
  const M = G.M;
  if (s.st === 'house') {
    s.bobT += dt * 5; s.y = M.houseY + Math.sin(s.bobT) * 0.22; s.dir = Math.cos(s.bobT) > 0 ? 2 : 0;
  } else if (s.st === 'leave') {
    if (Math.abs(s.x - M.door.x) > 0.01) { s.x = approach(s.x, M.door.x, v * dt); s.dir = s.x < M.door.x ? 3 : 1; }
    else if (Math.abs(s.y - M.houseY) > 0.01 && s.y > M.door.y) { s.y = approach(s.y, M.door.y - 1, v * dt); s.dir = 0; }
    else {
      s.y = approach(s.y, M.door.y - 1, v * dt); s.dir = 0;
      if (s.y <= M.door.y - 1 + 1e-6) { s.y = M.door.y - 1; s.st = 'active'; s.dir = 1; s.tx = M.door.x - 1; s.ty = s.y; s.x = M.door.x; }
    }
  } else if (s.st === 'enter') {
    s.x = approach(s.x, M.door.x, BASE * 1.6 * dt);
    s.y = approach(s.y, M.houseY, BASE * 1.6 * dt); s.dir = 2;
    if (Math.abs(s.y - M.houseY) < 1e-4 && Math.abs(s.x - M.door.x) < 1e-4) { s.st = 'leave'; s.fright = false; s.t = 0; sndRevive(); }
  }
}
function releaseCheck(G) {
  const d = DIFF[G.cfg.diff] || DIFF.normal;
  const lim = G.level === 1 ? [0, 0, 14, 40] : G.level === 2 ? [0, 0, 0, 24] : [0, 0, 0, 0];
  const glob = [0, 6, 16, 28];
  for (let i = 1; i < 4; i++) {
    const s = G.sp[i];
    if (s.st !== 'house' || s.released) continue;
    let go;
    if (G.deathDots >= 0) go = G.deathDots >= glob[i];
    else go = s.dots >= lim[i];
    if (!go && G.noDotT > 4 * d.rel) { go = true; G.noDotT = 0; }
    if (go) release(G, s);
    break; // one at a time, in order
  }
}
function spiritsStep(G, dt) {
  const sp = speeds(G).sp;
  for (let i = 0; i < 4; i++) {
    const s = G.sp[i];
    s.t += dt;
    const v = spiritSpeed(G, s, sp);
    if (s.st === 'active' || s.st === 'eyes') moveNav(G, s, v * dt);
    else houseStep(G, s, dt, v);
  }
}
function collide(G) {
  const h = G.hero, M = G.M;
  for (let i = 0; i < 4; i++) {
    const s = G.sp[i];
    if (s.st !== 'active') continue;
    const dx = wrapDX(M, s.x - h.x), dy = s.y - h.y;
    if (dx * dx + dy * dy > 0.36) continue;
    if (s.fright) {
      s.fright = false; s.st = 'eyes'; s.tx = Math.round(s.x); s.ty = Math.round(s.y);
      if (Math.abs(s.tx - s.x) + Math.abs(s.ty - s.y) > 0.01) { /* keep heading to the tile it was on */ } else decide(G, s);
      const pts = 200 << Math.min(3, G.combo);
      G.combo++; G.sweep++; G.spiritsEaten++; G.bestCombo = Math.max(G.bestCombo, G.combo);
      addScore(G, pts); pop(G, s.x, s.y, '' + pts, SPIRITS[i].glow);
      if (G.sweep === 4) { addScore(G, 3000); pop(G, h.x, h.y - 1.2, 'SWEEP +3000', '#ffe27a'); if (ARC && !G.cfg.attract) ARC.toast('Spirit sweep', 'All four in one jalebi, +3000', 1500); }
      G.freeze = 0.55; sndGulp(G.combo);
      if (!G.cfg.attract) { haptic('heavy', clamp(0.55 + G.combo * 0.12, 0, 1)); if (ARC) ARC.shake = Math.max(ARC.shake || 0, 3 + G.combo); }
      FXD.x = s.x; FXD.y = s.y; FXD.i = i; FXD.combo = G.combo; fx('spirit', FXD);
    } else if (!G.invincible) {
      G.phase = 'caught'; G.pt = 0; sirenOff(); sndCaught();
      FXD.x = h.x; FXD.y = h.y; FXD.i = i; fx('caught', FXD);
      return;
    }
  }
}
function tickMode(G, dt) {
  if (G.fright > 0) {
    G.fright -= dt;
    if (G.fright <= 0) { G.fright = 0; for (let i = 0; i < 4; i++) G.sp[i].fright = false; G.combo = 0; }
    return;
  }
  G.schedT += dt;
  if (G.schedT >= SCHED[G.sched]) {
    G.schedT = 0; G.sched = Math.min(SCHED.length - 1, G.sched + 1); G.chase = (G.sched & 1) === 1;
    for (let i = 0; i < 4; i++) reverse(G, G.sp[i]);
  }
}

/* ------------------------------------------------------------ the bot (attract mode, posters, tests) */
const BFS = { dist: null, first: null, q: null, danger: null };
function botThink(G) {
  const h = G.hero, M = G.M, N = M.W * M.H;
  if (!BFS.dist || BFS.dist.length < N) { BFS.dist = new Int16Array(N); BFS.first = new Int8Array(N); BFS.q = new Int16Array(N); BFS.danger = new Uint8Array(N); }
  const cx = ((Math.round(h.x) % M.W) + M.W) % M.W, cy = Math.round(h.y);
  if (Math.abs(wrapDX(M, h.x - cx)) > 0.2 || Math.abs(h.y - cy) > 0.2) return;
  const dist = BFS.dist, first = BFS.first, q = BFS.q, danger = BFS.danger;
  danger.fill(0);
  for (let k = 0; k < 4; k++) {
    const s = G.sp[k];
    if (s.st !== 'active' || s.fright) continue;
    const sx = ((Math.round(s.x) % M.W) + M.W) % M.W, sy = Math.round(s.y);
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      if (Math.abs(ox) + Math.abs(oy) > 2) continue;
      const yy = sy + oy; if (yy < 0 || yy >= M.H) continue;
      danger[yy * M.W + (((sx + ox) % M.W) + M.W) % M.W] = 1;
    }
  }
  dist.fill(-1);
  const start = cy * M.W + cx; dist[start] = 0; first[start] = -1;
  let qh = 0, qt = 0; q[qt++] = start;
  let goal = -1;
  while (qh < qt) {
    const c = q[qh++], x = c % M.W, y = (c / M.W) | 0;
    if (c !== start) {
      if (G.fright > 1.2) {
        for (let k = 0; k < 4; k++) { const s = G.sp[k]; if (s.st === 'active' && s.fright && Math.round(s.x) === x && Math.round(s.y) === y) { goal = c; break; } }
        if (goal >= 0) break;
      }
      if (G.pel[c] && !danger[c]) { if (goal < 0) goal = c; if (G.fright <= 1.2) break; }
    }
    for (let d = 0; d < 4; d++) {
      const nx = (((x + DX[d]) % M.W) + M.W) % M.W, ny = y + DY[d];
      if (!heroOpen(M, nx, ny)) continue;
      const ni = ny * M.W + nx;
      if (dist[ni] >= 0 || (danger[ni] && c !== start && G.fright <= 0)) continue;
      if (danger[ni] && c === start && G.fright <= 0) continue;
      dist[ni] = dist[c] + 1; first[ni] = c === start ? d : first[c]; q[qt++] = ni;
    }
  }
  if (goal >= 0 && first[goal] >= 0) { h.want = first[goal]; return; }
  // Nowhere safe found: step away from the nearest spirit.
  let bestD = -1, bestS = -1;
  for (let d = 0; d < 4; d++) {
    if (!heroOpen(M, cx + DX[d], cy + DY[d])) continue;
    let m = 1e9;
    for (let k = 0; k < 4; k++) { const s = G.sp[k]; if (s.st !== 'active' || s.fright) continue; const ex = wrapDX(M, s.x - (cx + DX[d])), ey = s.y - (cy + DY[d]); m = Math.min(m, ex * ex + ey * ey); }
    if (m > bestS) { bestS = m; bestD = d; }
  }
  if (bestD >= 0) h.want = bestD;
}

/* ------------------------------------------------------------ the cutscenes */
function makeCut() {
  const A = () => ({ vis: false, x: 0, y: 0, dir: 1, scale: 1, chomp: 0, spin: 0, fright: false, flash: false, eyes: false, tumble: 0 });
  return { on: false, kind: 0, t: 0, dur: 8, hero: A(), sp: [A(), A(), A(), A()], jalebi: { vis: false, x: 0, y: 0 }, laddoo: { vis: false, x: 0, y: 0 } };
}
function startCut(G) {
  const C = G.cut; C.on = true; C.kind = G.cutN % CUTS.length; C.t = 0; C.dur = C.kind === 2 ? 8.5 : 8; G.cutN++;
  C.hero.vis = false; for (let i = 0; i < 4; i++) { C.sp[i].vis = false; C.sp[i].tumble = 0; }
  C.jalebi.vis = false; C.laddoo.vis = false;
  G.phase = 'cut'; G.pt = 0; G.fade = 1;
  sndJingle(1);
  if (VIEW && VIEW.fx) fx('cut', FXD);
}
function stepCut(G, dt) {
  const C = G.cut; C.t += dt; const t = C.t, H = C.hero;
  const run = 7.2;
  for (let i = 0; i < 4; i++) { C.sp[i].fright = false; C.sp[i].flash = false; C.sp[i].eyes = false; C.sp[i].scale = 1; C.sp[i].y = 0; }
  H.scale = 1; H.spin = 0; H.y = 0; H.chomp += dt * 14;
  if (C.kind === 0) {
    if (t < 4) { H.vis = true; H.dir = 1; H.x = 13 - t * run; const S = C.sp[0]; S.vis = true; S.dir = 1; S.x = H.x + 3 + Math.max(0, 0.6 - t) * 2; for (let i = 1; i < 4; i++) C.sp[i].vis = false; }
    else { const u = t - 4.3; H.dir = 3; H.scale = 2.6; H.x = -16 + u * run * 0.9; H.vis = u > 0; const S = C.sp[0]; S.vis = u > 0; S.dir = 3; S.fright = true; S.flash = (t * 6 | 0) % 2 === 0 && u > 2; S.x = H.x + 4.2; S.y = 0; }
  } else if (C.kind === 1) {
    const S = C.sp[1]; C.laddoo.vis = t < 2.9; C.laddoo.x = -2; C.laddoo.y = 0;
    if (t < 2.4) { H.vis = true; H.dir = 1; H.x = 13 - t * run; S.vis = true; S.dir = 1; S.x = H.x + 2.6; }
    else if (t < 4.2) { H.x = Math.max(-16, 13 - t * run); S.vis = true; const u = t - 2.4; S.x = lerp(-2.0 + 0.4, -3.4, Math.min(1, u * 2)); S.tumble = Math.min(1, u * 1.6); S.y = Math.sin(Math.min(1, u * 1.6) * Math.PI) * 0.9; S.dir = 1; }
    else { const u = t - 4.2; H.vis = true; H.dir = 3; H.x = -16 + u * run * 0.8; if (H.x > -6) H.x = -6 + Math.max(0, H.x + 6) * 0.05; H.y = Math.abs(Math.sin(u * 9)) * 0.25 * (u > 1.6 ? 1 : 0); S.vis = true; S.tumble = 1; S.x = -3.4; S.y = 0; S.flash = u > 2.2 && (t * 5 | 0) % 2 === 0; }
  } else {
    const drop = 2.4;
    if (t < drop + 0.4) { H.vis = true; H.dir = 1; H.x = 13 - t * run; for (let i = 0; i < 4; i++) { const S = C.sp[i]; S.vis = true; S.dir = 1; S.x = H.x + 3 + i * 1.6; } }
    C.jalebi.vis = t > drop - 1.2 && t < drop + 0.45; C.jalebi.x = 13 - (drop + 0.4) * run; C.jalebi.y = Math.max(0, (drop - t) * 6);
    if (t >= drop + 0.4) {
      const u = t - drop - 0.4; H.vis = true; H.dir = 3; H.scale = 1 + Math.min(1, u * 3) * 0.35;
      H.x = 13 - (drop + 0.4) * run + Math.max(0, u - 0.6) * run * 1.05;
      for (let i = 0; i < 4; i++) { const S = C.sp[i]; S.vis = true; S.dir = 3; S.fright = true; S.flash = u > 3.3 && (t * 6 | 0) % 2 === 0; S.x = 13 - (drop + 0.4) * run + 3 + i * 1.6 + u * run * 1.12; S.y = Math.abs(Math.sin(u * 8 + i)) * 0.18; }
    }
  }
  if (t >= C.dur) endCut(G);
}
function endCut(G) { G.cut.on = false; G.phase = 'ready'; G.pt = 0; G.fade = 1; loadLevel(G, false); }

/* ------------------------------------------------------------ the main step */
function stepGame(G, dt, a) {
  G.time += dt;
  const h = G.hero;
  switch (G.phase) {
    case 'ready': {
      G.pt += dt;
      const dur = G.cfg.attract ? 0.6 : G.first ? 3.4 : 1.6;
      G.fade = Math.max(0, G.fade - dt * 2.4);
      if (G.pt >= dur) { G.phase = 'play'; G.pt = 0; G.first = false; const sp = speeds(G); h.speed = sp.hero; sirenOn(); }
      break;
    }
    case 'play': {
      G.pt += dt; G.fade = Math.max(0, G.fade - dt * 3);
      if (G.freeze > 0) { G.freeze -= dt; break; }
      const sp = speeds(G); h.speed = sp.hero;
      if (G.bot) botThink(G);
      heroStep(G, dt);
      eatCheck(G);
      if (G.phase !== 'play') break;
      G.noDotT += dt;
      tickMode(G, dt);
      releaseCheck(G);
      spiritsStep(G, dt);
      collide(G);
      if (G.fruit.on) { G.fruit.t -= dt; if (G.fruit.t <= 0) G.fruit.on = false; }
      if (G.cfg.mode === 'rush' && !G.cfg.attract) { G.timeLeft -= dt; if (G.timeLeft <= 0) { G.timeLeft = 0; gameOver(G, 'time'); } }
      break;
    }
    case 'caught': {
      G.pt += dt;
      if (G.pt > 0.7) { G.phase = 'dead'; G.pt = 0; sndDeath(); if (!G.cfg.attract) { haptic('fail', 1); if (a) a.shake = Math.max(a.shake || 0, 7); } FXD.x = h.x; FXD.y = h.y; fx('death', FXD); }
      break;
    }
    case 'dead': {
      G.pt += dt;
      h.spin += dt * (10 + G.pt * 16); h.scale = Math.max(0, 1 - Math.max(0, G.pt - 0.6) / 0.9);
      if (G.pt > 2.0) {
        if (G.cfg.mode === 'rush' && !G.cfg.attract) { G.timeLeft = Math.max(0, G.timeLeft - 5); pop(G, h.x, h.y, '-5 s', '#ff8a8a'); if (G.timeLeft <= 0) { gameOver(G, 'time'); break; } }
        else if (!G.cfg.attract) G.lives--;
        if (G.lives <= 0) { gameOver(G, 'caught'); break; }
        resetActors(G); G.deathDots = 0; G.phase = 'ready'; G.pt = 0; G.fruit.on = false;
      }
      break;
    }
    case 'clear': {
      G.pt += dt; G.flash = G.pt;
      if (G.pt > 2.4) {
        G.level++;
        if (!G.cfg.attract && (G.level === 3 || G.level === 6 || (G.level >= 10 && (G.level - 10) % 4 === 0))) startCut(G);
        else { G.fade = 1; loadLevel(G, false); }
      }
      break;
    }
    case 'cut': G.fade = Math.max(0, G.fade - dt * 2.2); stepCut(G, dt); break;
    case 'over': G.pt += dt; break;
  }
  for (let i = 0; i < G.pops.length; i++) { const p = G.pops[i]; if (p.on) { p.t += dt; if (p.t > 1.3) p.on = false; } }
}
function gameOver(G, why) {
  G.phase = 'over'; G.pt = 0; G.ended = true; G.why = why; sirenOff();
  if (G.cfg.attract) { const n = newGame(G.cfg); MG = n; }
}
function showOver(G) {
  {
    const why = G.why;
    const best = ARC.best();
    const isNew = G.score > 0 && (best == null || G.score > best);
    ARC.over({
      eyebrow: why === 'time' ? 'Time up' : 'Game over', title: isNew ? 'New <em>best</em>' : (why === 'time' ? 'Laddoo <em>rush</em> over' : 'Caught by the <em>spirits</em>'),
      score: G.score, scoreLabel: 'Score',
      html: '<table class="ld-res"><tr><th>Level</th><td>' + G.level + '</td></tr><tr><th>Laddoos</th><td>' + G.eatenAll + '</td></tr><tr><th>Spirits eaten</th><td>' + G.spiritsEaten + '</td></tr><tr><th>Best chain</th><td>' + G.bestCombo + '</td></tr><tr><th>Treats</th><td>' + G.fruits + '</td></tr></table>'
    });
  }
}

/* ------------------------------------------------------------ sound: a small synth of our own */
let AU = null;
function audioInit() {
  if (AU) return;
  AU = { ok: false };
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC(), master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    const sir = ctx.createOscillator(), sg = ctx.createGain(), sf = ctx.createBiquadFilter();
    sir.type = 'triangle'; sf.type = 'lowpass'; sf.frequency.value = 1400; sg.gain.value = 0;
    sir.connect(sf); sf.connect(sg); sg.connect(comp); sir.start();
    Object.assign(AU, { ok: true, ctx, master, out: comp, sir, sg, siren: false });
  } catch (e) { AU.ok = false; }
}
const audible = () => AU && AU.ok && ARC && !ARC.sfx.muted && MG && !MG.cfg.attract;
function note(f, dur, o) {
  if (!audible()) return;
  try {
    o = o || {};
    const c = AU.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square'; osc.frequency.setValueAtTime(f, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.slide), t + dur);
    const v = o.vol == null ? 0.1 : o.vol;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.012, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(AU.out); osc.start(t); osc.stop(t + dur + 0.03);
  } catch (e) { /* sound never stops play */ }
}
function sndEat(G) { G.waka ^= 1; note(G.waka ? 560 : 380, 0.075, { type: 'triangle', slide: G.waka ? 380 : 560, vol: 0.09 }); }
function sndPower() { note(220, 0.35, { type: 'sawtooth', slide: 880, vol: 0.06 }); note(330, 0.3, { type: 'triangle', slide: 1320, vol: 0.06, delay: 0.05 }); }
function sndGulp(k) { note(300 + k * 120, 0.22, { type: 'square', slide: 1400 + k * 200, vol: 0.07 }); note(1800, 0.08, { type: 'sine', vol: 0.05, delay: 0.16 }); }
function sndFruit() { [784, 988, 1175, 1568].forEach((f, i) => note(f, 0.09, { type: 'triangle', vol: 0.07, delay: i * 0.05 })); }
function sndExtra() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(f, 0.11, { type: 'square', vol: 0.05, delay: i * 0.08 })); }
function sndRevive() { note(400, 0.18, { type: 'sine', slide: 700, vol: 0.04 }); }
function sndCaught() { note(880, 0.4, { type: 'triangle', slide: 440, vol: 0.06 }); }
function sndDeath() { for (let i = 0; i < 9; i++) note(760 - i * 60, 0.16, { type: 'square', slide: 600 - i * 55, vol: 0.06, delay: i * 0.12 }); note(120, 0.5, { type: 'sine', slide: 50, vol: 0.12, delay: 1.1 }); }
// Our own little tune: a bouncy raga-ish phrase in D, with a bass line under it.
const TUNE = [[587, 0], [659, 0.14], [740, 0.28], [880, 0.42], [740, 0.63], [880, 0.77], [988, 0.91], [1175, 1.12], [988, 1.4], [880, 1.54], [740, 1.68], [659, 1.82], [587, 2.03], [740, 2.24], [587, 2.52]];
const BASS = [[147, 0], [220, 0.42], [147, 0.84], [220, 1.26], [196, 1.68], [147, 2.1], [147, 2.52]];
function sndJingle(kind) {
  const k = kind ? 0.75 : 1;
  TUNE.forEach((n) => note(n[0] * (kind ? 1.122 : 1), 0.16, { type: 'square', vol: 0.045, delay: n[1] * k }));
  BASS.forEach((n) => note(n[0] * (kind ? 1.122 : 1), 0.3, { type: 'triangle', vol: 0.09, delay: n[1] * k }));
}
function sndClear() { [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, 0.14, { type: 'triangle', vol: 0.07, delay: i * 0.07 })); }
function sirenOn() { if (AU && AU.ok) AU.siren = true; }
function sirenOff() { if (AU && AU.ok) AU.siren = false; }
function audioFrame(G, a) {
  if (!AU || !AU.ok) return;
  try {
    const c = AU.ctx, t = c.currentTime, on = !a.sfx.muted && a.state === 'play' && G && !G.cfg.attract;
    if (c.state === 'suspended' && on) c.resume().catch(() => {});
    AU.master.gain.setTargetAtTime(on ? 0.8 : 0, t, 0.05);
    if (!on) { AU.sg.gain.setTargetAtTime(0, t, 0.05); return; }
    const live = AU.siren && G.phase === 'play';
    let f, v;
    if (G.fright > 0) { f = 190 + Math.abs(Math.sin(G.time * 18)) * 140; v = 0.05; }
    else { const k = 1 - G.left / Math.max(1, G.M.total); f = 380 + (0.5 - 0.5 * Math.cos(G.time * (5.5 + k * 3))) * (220 + k * 160); v = 0.022; }
    let eyes = false; for (let i = 0; i < 4; i++) if (G.sp[i].st === 'eyes') eyes = true;
    if (eyes) { f = 900 + Math.abs(Math.sin(G.time * 30)) * 500; v = 0.03; }
    AU.sir.frequency.setTargetAtTime(f, t, 0.02);
    AU.sg.gain.setTargetAtTime(live && G.freeze <= 0 ? v : 0, t, 0.04);
  } catch (e) { /* sound never stops play */ }
}
function haptic(kind, s) { if (!ARC) return; if (typeof ARC.haptic === 'function') ARC.haptic(kind, s); else if (typeof ARC.buzz === 'function') ARC.buzz(Math.round(20 + s * 60)); }
function fx(type, d) { if (VIEW && VIEW.fx) { try { VIEW.fx(type, d, MG); } catch (e) { /* effects never stop play */ } } if (type === 'clear') sndClear(); }

/* ------------------------------------------------------------ poses for the views (interpolated, allocation free) */
function makePose() {
  const E = () => ({ x: 0, y: 0, dir: 1, vis: true });
  return { hero: Object.assign(E(), { ang: 0, mouth: 0.3, spin: 0, scale: 1, moving: false }), sp: [0, 1, 2, 3].map((i) => Object.assign(E(), { i, st: 'house', fright: false, flash: false, eyes: false, bob: 0 })) };
}
function interp(M, p, c, k) { const d = M ? wrapDX(M, c - p) : c - p; if (Math.abs(d) > 1.5) return c; return c - d * (1 - k); }
function updatePose(G) {
  const P = G.pose, M = G.M, k = clamp(G.acc / STEP, 0, 1), h = G.hero;
  const H = P.hero;
  H.x = wrapX(M, interp(M, h.px, h.x, k)); H.y = interp(null, h.py, h.y, k); H.dir = h.dir; H.moving = h.moving && G.phase === 'play' && G.freeze <= 0;
  const want = h.dir >= 0 ? Math.atan2(DX[h.dir], DY[h.dir]) : H.ang;
  let da = want - H.ang; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  H.ang += da * 0.35;
  const open = G.phase === 'dead' ? Math.min(1, G.pt * 1.4) : G.phase === 'play' ? (H.moving ? Math.abs(Math.sin(h.dist * 2.6)) : 0.25) : 0.22;
  H.mouth = open; H.spin = h.spin; H.scale = h.scale; H.vis = G.phase !== 'cut' && h.scale > 0.01;
  const flashOn = G.fright > 0 && G.fright < Math.min(2, G.frightMax * 0.35) && ((G.fright * 5) | 0) % 2 === 0;
  for (let i = 0; i < 4; i++) {
    const s = G.sp[i], S = P.sp[i];
    S.x = wrapX(M, interp(M, s.px, s.x, k)); S.y = interp(null, s.py, s.y, k); S.dir = s.dir; S.st = s.st;
    S.fright = s.fright && (s.st === 'active' || s.st === 'house' || s.st === 'leave'); S.flash = S.fright && flashOn;
    S.eyes = s.st === 'eyes' || s.st === 'enter'; S.bob = s.t;
    S.vis = G.phase !== 'dead' && G.phase !== 'cut' && !(G.phase === 'clear' && G.pt > 0.5);
  }
}

/* ------------------------------------------------------------ HUD */
const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, Georgia, serif', F_BODY = 'Inter, system-ui, sans-serif';
const TXT = { score: -1, scoreS: '', lvl: -1, lvlS: '', hi: -1, hiS: '', time: -1, timeS: '' };
const PV = { x: 0, y: 0, on: false, behind: false };
function txt(ctx, s, x, y, size, col, align, weight, fam) { ctx.font = (weight || '700') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
function drawHUD(ctx, a, G) {
  const pad = a.hudPad(), W = a.w, Hh = a.h, small = W < 520;
  if (G.cfg.attract) { fadeOver(ctx, a, G); return; }
  if (G.phase === 'cut') { drawCutHUD(ctx, a, G, small); fadeOver(ctx, a, G); return; }
  // top band
  const top = pad.top + 4;
  const g = ctx.createLinearGradient(0, 0, 0, top + 46); g.addColorStop(0, 'rgba(6,4,12,0.62)'); g.addColorStop(1, 'rgba(6,4,12,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, top + 50);
  if (TXT.score !== G.score) { TXT.score = G.score; TXT.scoreS = String(G.score).padStart(6, '0'); }
  const best = Math.max(G.score, BEST);
  if (TXT.hi !== best) { TXT.hi = best; TXT.hiS = String(best).padStart(6, '0'); }
  if (TXT.lvl !== G.level) { TXT.lvl = G.level; TXT.lvlS = 'L' + G.level + '  ' + G.M.name.toUpperCase(); }
  txt(ctx, 'SCORE', pad.left + 4, top + 6, small ? 9 : 10, 'rgba(255,240,220,0.62)', 'left', '600');
  txt(ctx, TXT.scoreS, pad.left + 4, top + 22, small ? 18 : 22, '#fff4dc', 'left', '700');
  txt(ctx, 'BEST', W / 2, top + 6, small ? 9 : 10, 'rgba(255,240,220,0.62)', 'center', '600');
  txt(ctx, TXT.hiS, W / 2, top + 22, small ? 14 : 17, '#ffcf5a', 'center', '700');
  // lives as little heroes, or the rush clock
  if (G.cfg.mode === 'rush') {
    const s = Math.ceil(G.timeLeft);
    if (TXT.time !== s) { TXT.time = s; TXT.timeS = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    txt(ctx, 'TIME', W - pad.right - 4, top + 6, small ? 9 : 10, 'rgba(255,240,220,0.62)', 'right', '600');
    txt(ctx, TXT.timeS, W - pad.right - 4, top + 22, small ? 18 : 22, G.timeLeft < 15 && ((G.time * 4) | 0) % 2 ? '#ff6a6a' : '#fff4dc', 'right', '700');
  } else {
    const n = Math.min(6, G.lives - (G.phase === 'ready' || G.phase === 'play' || G.phase === 'caught' || G.phase === 'dead' ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const x = W - pad.right - 12 - i * 22, y = top + 16;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 8, -0.6 + Math.PI, 0.6 + Math.PI, true); ctx.closePath();
      ctx.fillStyle = '#ffc93a'; ctx.fill();
    }
  }
  txt(ctx, TXT.lvlS, pad.left + 4, top + 40, small ? 9 : 10, 'rgba(255,240,220,0.55)', 'left', '600');
  // the jalebi meter while the spirits are on the run
  if (G.fright > 0) {
    const k = G.fright / G.frightMax, bw = Math.min(220, W * 0.42), bx = W / 2 - bw / 2, by = top + 38;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = k < 0.3 && ((G.time * 8) | 0) % 2 ? '#ffffff' : '#ffb21a'; ctx.fillRect(bx, by, bw * k, 4);
  }
  // fruit row, bottom
  {
    const y = Hh - pad.bottom + (pad.touch ? -8 : 20);
    const kind = bonusFor(G.level);
    for (let i = 0; i <= kind; i++) {
      const x = W - pad.right - 14 - i * 20;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fillStyle = BONUS[kind - i].col; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  // score pops at the place they were earned
  for (let i = 0; i < G.pops.length; i++) {
    const p = G.pops[i]; if (!p.on) continue;
    if (!VIEW.project(p.x, p.y, 0.6, PV)) continue;
    const k = p.t / 1.3, al = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    ctx.globalAlpha = clamp(al, 0, 1);
    ctx.font = '800 ' + (small ? 15 : 18) + 'px ' + F_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,6,20,0.85)'; ctx.strokeText(p.text, PV.x, PV.y - 10 - k * 26);
    ctx.fillStyle = p.col; ctx.fillText(p.text, PV.x, PV.y - 10 - k * 26);
    ctx.globalAlpha = 1;
  }
  // READY
  if (G.phase === 'ready') {
    const M = G.M;
    if (VIEW.project(M.door.x, M.door.y + 3, 0.5, PV)) {
      const pulse = 0.75 + 0.25 * Math.sin(G.time * 6);
      ctx.globalAlpha = pulse;
      txt(ctx, G.first ? 'READY' : 'GO AGAIN', PV.x, PV.y, small ? 22 : 28, '#ffe27a', 'center', '800');
      ctx.globalAlpha = 1;
    }
    if (G.first) {
      const hint = a.touchMode ? (a.touchStyle === 'pads' ? 'Push the stick to turn' : 'Swipe anywhere to turn') : a.gamepad ? 'D-pad or stick to turn' : 'Arrows or WASD to turn';
      const y = Hh - pad.bottom - 30;
      ctx.font = '600 ' + (small ? 13 : 15) + 'px ' + F_BODY;
      const w = ctx.measureText(hint).width + 28;
      ctx.fillStyle = 'rgba(10,6,20,0.7)'; roundRect(ctx, W / 2 - w / 2, y - 16, w, 32, 16); ctx.fill();
      txt(ctx, hint, W / 2, y, small ? 13 : 15, '#fff4dc', 'center', '600', F_BODY);
    }
  }
  if (G.phase === 'clear' && G.pt > 0.4) {
    const M = G.M;
    if (VIEW.project(M.door.x, M.door.y + 3, 0.5, PV)) txt(ctx, 'MAZE CLEAR', PV.x, PV.y, small ? 20 : 26, '#ffffff', 'center', '800');
  }
  if (G.phase === 'over' && G.pt > 0.2) {
    const M = G.M;
    if (VIEW.project(M.door.x, M.door.y + 3, 0.5, PV)) txt(ctx, G.why === 'time' ? 'TIME UP' : 'GAME OVER', PV.x, PV.y, small ? 22 : 28, '#ff6a8a', 'center', '800');
  }
  fadeOver(ctx, a, G);
}
function drawCutHUD(ctx, a, G, small) {
  const C = G.cut, def = CUTS[C.kind], W = a.w, Hh = a.h;
  const al = clamp(Math.min(C.t / 0.6, (C.dur - C.t) / 0.6), 0, 1);
  ctx.globalAlpha = al;
  txt(ctx, 'INTERMISSION', W / 2, Hh * 0.16, small ? 11 : 12, '#ffcf5a', 'center', '700');
  txt(ctx, def.title, W / 2, Hh * 0.16 + (small ? 26 : 32), small ? 26 : 36, '#fff4dc', 'center', 'italic 600', F_DISP);
  txt(ctx, def.sub, W / 2, Hh * 0.16 + (small ? 52 : 64), small ? 12 : 14, 'rgba(255,240,220,0.7)', 'center', '500', F_BODY);
  ctx.globalAlpha = al * (0.55 + 0.25 * Math.sin(G.time * 4));
  txt(ctx, a.touchMode ? 'Tap to skip' : 'Space to skip', W / 2, Hh - a.hudPad().bottom - 24, 12, '#fff4dc', 'center', '600', F_BODY);
  ctx.globalAlpha = 1;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fadeOver(ctx, a, G) { if (G.fade > 0.005) { ctx.fillStyle = 'rgba(0,0,0,' + clamp(G.fade, 0, 1) + ')'; ctx.fillRect(0, 0, a.w, a.h); } }

/* ------------------------------------------------------------ input */
const KEYDIR = { ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3 };
const KEYLIST = Object.keys(KEYDIR);
let heldDir = -1;
function readInput(G, a) {
  const inp = a.input, h = G.hero;
  // keyboard: the last arrow pressed wins, and a held arrow keeps asking
  for (let i = 0; i < KEYLIST.length; i++) { const k = KEYLIST[i]; if (inp.hit(k)) { h.want = KEYDIR[k]; heldDir = KEYDIR[k]; STATS.keys++; } }
  if (heldDir >= 0) {
    let still = false;
    for (let i = 0; i < KEYLIST.length; i++) if (KEYDIR[KEYLIST[i]] === heldDir && inp.down(KEYLIST[i])) still = true;
    if (still) h.want = heldDir; else heldDir = -1;
  }
  // the on-screen stick or a controller: four-way, the stronger axis wins
  const st = inp.stick, pd = inp.pad;
  const ax = (st.active ? st.x : 0) + (pd.active ? pd.x : 0), ay = (st.active ? st.y : 0) + (pd.active ? pd.y : 0);
  if (Math.abs(ax) > 0.45 || Math.abs(ay) > 0.45) {
    h.want = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 1 : 3) : (ay < 0 ? 0 : 2);
    if (pd.active) STATS.pad++;
  }
  // swipes and taps, judged by our own pointer listener (below) the moment the finger has moved far enough
  if (TOUCH.want >= 0) { h.want = TOUCH.want; TOUCH.want = -1; }
  const tap = TOUCH.tap;
  if (tap) {
    TOUCH.tap = null;
    if (G.phase === 'play' || G.phase === 'ready') {
      const H = G.pose.hero;
      if (VIEW.project(H.x, H.y, 0.4, PV)) {
        const dx = tap.x - PV.x, dy = tap.y - PV.y;
        if (Math.hypot(dx, dy) > 18) { h.want = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 0 : 2); STATS.taps++; }
      }
    }
  }
}
function bindPointer(a) {
  const cv = a.canvas;
  const SW = 20;
  cv.addEventListener('pointerdown', (e) => {
    if (TOUCH.id != null && e.pointerId !== TOUCH.id) return;
    TOUCH.id = e.pointerId; TOUCH.ax = TOUCH.sx = e.clientX; TOUCH.ay = TOUCH.sy = e.clientY; TOUCH.t0 = e.timeStamp; TOUCH.moved = false; TOUCH.turned = false;
    if (MG && MG.phase === 'cut') TOUCH.skip = true;
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== TOUCH.id) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) return;
    const dx = e.clientX - TOUCH.ax, dy = e.clientY - TOUCH.ay;
    if (Math.abs(dx) < SW && Math.abs(dy) < SW) return;
    // A swipe turns the moment it is long enough, and a long drag can chain turns: each new leg is a new swipe.
    if (Math.abs(dx) > Math.abs(dy) * 1.05) TOUCH.want = dx < 0 ? 1 : 3;
    else if (Math.abs(dy) > Math.abs(dx) * 1.05) TOUCH.want = dy < 0 ? 0 : 2;
    else return;
    TOUCH.ax = e.clientX; TOUCH.ay = e.clientY; TOUCH.moved = true; TOUCH.turned = true; STATS.swipes++;
  });
  const end = (e) => {
    if (e.pointerId !== TOUCH.id) return;
    TOUCH.id = null;
    if (e.type === 'pointercancel') return;
    const d = Math.hypot(e.clientX - TOUCH.sx, e.clientY - TOUCH.sy), ms = e.timeStamp - TOUCH.t0;
    if (!TOUCH.turned && d < 14 && ms < 400) { const r = cv.getBoundingClientRect(); TOUCH.tap = { x: e.clientX - r.left, y: e.clientY - r.top }; }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

/* ------------------------------------------------------------ menu, debug and the shell */
const MENU_CSS =
  '.ld-res{width:100%;border-collapse:collapse;margin:2px 0 12px;font-size:13px}.ld-res th{text-align:left;font-weight:500;color:var(--ink-dim);padding:5px 0;border-top:1px solid var(--rule)}' +
  '.ld-res td{text-align:right;font-family:var(--font-mono);color:var(--ink);padding:5px 0;border-top:1px solid var(--rule)}' +
  '.ld-cast{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;margin:2px 0 12px;font-size:12.5px;color:var(--ink-dim)}.ld-cast i{display:inline-block;width:9px;height:9px;border-radius:50% 50% 2px 2px;margin-right:7px;vertical-align:-1px}.ld-cast b{color:var(--ink);font-weight:600}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }
function menuProps() {
  return {
    eyebrow: 'Maze chase', title: 'Laddoo <em>Dash</em>',
    html: '<p>Gobble every laddoo in the glowing maze before the four mischief spirits catch you. A golden jalebi turns them blue for a moment: chase them down for 200, 400, 800 and 1600.</p>' +
      '<div class="ld-cast">' + SPIRITS.map((s) => '<span><i style="background:' + s.col + '"></i><b>' + s.name + '</b> ' + s.role + '</span>').join('') + '</div>',
    options: [
      { id: 'mode', label: 'Mode', value: 'classic', choices: [{ v: 'classic', label: 'Classic' }, { v: 'rush', label: 'Rush, 2:30' }], note: 'Classic: three lives, an extra one at 10,000. Rush: race the clock, a catch costs 5 seconds, a clear maze adds 15.' },
      { id: 'diff', label: 'Spirits', value: 'normal', choices: [{ v: 'easy', label: 'Gentle' }, { v: 'normal', label: 'Cheeky' }, { v: 'hard', label: 'Ruthless' }] },
      { id: 'maze', label: 'First maze', value: '0', choices: MAZES.map((m, i) => ({ v: String(i), label: m.name })), note: 'The mazes take turns, one per level.' }
    ]
  };
}
function debugState() {
  const G = MG, a = ARC;
  if (!G) return { state: a.state, phase: 'none' };
  const h = G.hero;
  return {
    state: a.state, phase: G.cfg.attract ? 'attract' : G.phase, mode: G.cfg.mode, diff: G.cfg.diff, renderer: VIEW ? VIEW.name : 'none',
    level: G.level, maze: G.M.id, score: G.score, lives: G.lives, left: G.left, eaten: G.eatenAll, alive: G.phase !== 'over',
    x: +h.x.toFixed(2), y: +h.y.toFixed(2), dir: h.dir, want: h.want, moving: h.moving,
    fright: +G.fright.toFixed(2), combo: G.combo, spiritsEaten: G.spiritsEaten, fruit: G.fruit.on ? BONUS[G.fruit.kind].id : null, timeLeft: +G.timeLeft.toFixed(1),
    chase: G.chase, spirits: G.sp.map((s) => ({ name: SPIRITS[s.i].name, st: s.st, fright: s.fright, x: +s.x.toFixed(2), y: +s.y.toFixed(2) })),
    input: { swipes: STATS.swipes, taps: STATS.taps, turns: STATS.turns, keys: STATS.keys, pad: STATS.pad },
    time: +G.time.toFixed(2), bot: !!G.bot,
    gfx: VIEW && VIEW.debug ? VIEW.debug() : null
  };
}
export function boot(view) {
  VIEW = view;
  const A = window.Arcade;
  A.create({
    three: !!view.three,
    slug: 'laddoo-dash', title: 'Laddoo Dash', genre: 'Maze chase',
    graphics(level) { if (view.graphics) view.graphics(level); },
    hint: 'Arrows or WASD to turn, early is fine: the turn waits for the next corner.',
    touchHint: 'Push the stick to turn. The turn waits for the next corner.',
    keys: [['Arrows / WASD', 'Turn (press early, it waits for the corner)'], ['Click and drag', 'Turn with the mouse'], ['Space', 'Skip an intermission']],
    gamepad: { buttons: ['Space'] },
    touch: { stick: true, pads: [] },
    touchKeys: [['Stick', 'Turn up, down, left or right'], ['Tap the screen', 'Skip an intermission']],
    gestures: {
      drag: false, tilt: false,
      hint: 'Swipe anywhere to turn. Swipe early: the turn waits for the corner.',
      keys: [['Swipe', 'Turn that way (it waits for the next corner)'], ['Keep dragging', 'Chain turns in one stroke'], ['Tap beside the hero', 'Turn toward the tap'], ['Tap', 'Skip an intermission']]
    },
    formatScore: (v) => String(Math.round(v)),
    resize: (a) => { if (view.resize) view.resize(a); },
    init(a) {
      ARC = a;
      BEST = a.best() || 0;
      if (!view.init(a)) return;
      const origMenu = a.menu;
      a.menu = function (p) { return origMenu(Object.assign(menuProps(), p || {})); };
      a.debug = debugState;
      a.dev = Object.assign({
        game: () => MG,
        bot: (on) => { if (MG) MG.bot = on !== false; },
        invincible: (on) => { if (MG) MG.invincible = on !== false; },
        skip: () => { if (MG && MG.phase === 'ready') MG.pt = 99; if (MG && MG.phase === 'cut') endCut(MG); if (view.skipCine) view.skipCine(); },
        // run the rules ahead by some seconds at once (the bot drives), so a slow renderer can still show a game in full swing
        warp: (sec) => { const G = MG; if (!G) return; const was = G.bot; G.bot = true; const n = Math.round((sec || 5) / STEP); for (let i = 0; i < n && MG === G && G.phase !== 'over'; i++) { snap(G); stepGame(G, STEP, ARC); } snap(G); G.bot = was; updatePose(G); },
        power: () => { if (MG && MG.phase === 'play') power(MG); },
        level: (n) => { if (!MG) return; MG.level = Math.max(1, n | 0); MG.fade = 1; loadLevel(MG, false); },
        clear: () => { if (MG && MG.phase === 'play') { MG.pel.fill(0); MG.left = 0; MG.phase = 'clear'; MG.pt = 0; sirenOff(); fx('clear', FXD); } },
        cut: () => { if (MG) startCut(MG); },
        stats: () => Object.assign({}, STATS)
      }, view.dev || {});
      bindPointer(a);
      a.menu();
    },
    onMenu() { injectCss(); },
    start(a, ch) {
      injectCss();
      const cfg = { mode: ch.mode === 'rush' ? 'rush' : 'classic', diff: DIFF[ch.diff] ? ch.diff : 'normal', maze: clamp(+ch.maze || 0, 0, MAZES.length - 1), attract: false, seed: (Math.random() * 1e9) | 0 };
      MG = newGame(cfg); MG.pose = makePose(); updatePose(MG);
      TOUCH.want = -1; TOUCH.tap = null; TOUCH.skip = false; heldDir = -1;
      audioInit();
      if (AU && AU.ok) try { AU.master.gain.cancelScheduledValues(AU.ctx.currentTime); AU.master.gain.value = a.sfx.muted ? 0 : 0.8; if (AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ }
      if (view.newGame) view.newGame(MG, a);
      sndJingle(0);
    },
    update(dt, a) {
      const G = MG; if (!G || G.cfg.attract) return;
      readInput(G, a);
      if (G.phase === 'cut' && (TOUCH.skip || a.input.hit('Space', 'Enter', 'KeyJ'))) { TOUCH.skip = false; endCut(G); }
      TOUCH.skip = false;
      G.acc += dt;
      let n = 0;
      while (G.acc >= STEP && n < 12) { snap(G); stepGame(G, STEP, a); G.acc -= STEP; n++; if (MG !== G) break; }
      if (n >= 12) G.acc = 0;
      updatePose(G);
      audioFrame(G, a);
      if (G.phase === 'over' && G.pt > 1.2 && !G.overShown) { G.overShown = true; showOver(G); }
    },
    idle(dt, a) {
      if (a.state === 'menu') {
        if (!MG || !MG.cfg.attract) { MG = newGame({ mode: 'classic', diff: 'normal', maze: clamp(+(a.choices.maze || 0), 0, MAZES.length - 1), attract: true, seed: 7 }); MG.pose = makePose(); updatePose(MG); if (view.newGame) view.newGame(MG, a); }
        const G = MG; G.acc += dt; let n = 0;
        while (G.acc >= STEP && n < 12) { snap(G); stepGame(G, STEP, a); G.acc -= STEP; n++; if (MG !== G) break; }
        if (n >= 12) G.acc = 0;
        if (MG !== G) { MG.pose = makePose(); if (view.newGame) view.newGame(MG, a); }
        updatePose(MG);
      } else if (a.state === 'over' && MG) {
        MG.time += dt; MG.pt += dt; MG.fade = Math.max(0, MG.fade - dt);
        updatePose(MG);
      }
      if (MG) audioFrame(MG, a);
    },
    render(ctx, a) {
      if (!MG || !MG.pose) { ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, a.w, a.h); return; }
      let ok;
      try { ok = view.render(a, MG, ctx) !== false; } catch (e) { ok = false; console.warn(e); }
      if (!ok) return;
      drawHUD(ctx, a, MG);
    },
    onPause() { if (AU && AU.ok) try { AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.04); } catch (e) { /* ignore */ } },
    onOver(a) { BEST = Math.max(BEST, MG ? MG.score : 0); if (AU && AU.ok) try { AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.2); } catch (e) { /* ignore */ } }
  });
}
function snap(G) {
  const h = G.hero; h.px = h.x; h.py = h.y;
  for (let i = 0; i < 4; i++) { const s = G.sp[i]; s.px = s.x; s.py = s.y; }
}
// For headless rule tests only.
export const __rules = { newGame, stepGame, snap, makePose, updatePose, power };
