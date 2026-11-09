(function () {
  'use strict';

/*
 * Chhat Hopper, a side-scrolling platformer across old city rooftops, a
 * monsoon forest and a night bazaar.
 *
 * This file is two things. It is the whole game (levels, physics, enemies,
 * audio, input, HUD, menus) with a 2D canvas renderer, which loads when a
 * browser cannot run WebGL2. And when the 3D edition sets
 * window.__CHHAT_CORE_ONLY before loading it, it only hands the rules over
 * (window.ChhatCore) so both editions play exactly the same game.
 *
 * The world is a tile grid: x to the right, y up, one tile is one metre.
 * Bodies keep their centre x and their bottom y. Physics runs at 120 Hz.
 */

const CORE_ONLY = !!window.__CHHAT_CORE_ONLY;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
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
const fmtTime = (s) => { const cs = Math.max(0, Math.round(s * 100)); return Math.floor(cs / 6000) + ':' + pad2(Math.floor((cs % 6000) / 100)) + '.' + pad2(cs % 100); };

/* ------------------------------------------------------------ tiles and levels */
const H = 16;
const T_EMPTY = 0, T_GROUND = 1, T_BRICK = 2, T_Q = 3, T_USED = 4, T_HIDDEN = 5, T_PLANK = 6, T_CHIMNEY = 7, T_TANK = 8, T_STONE = 9;
const SOLID = [false, true, true, true, true, false, false, true, true, true];
const isSolid = (t) => SOLID[t] === true;
const KEY = (x, y) => x + y * 4096;

const THEMES = {
  roof: { id: 'roof', world: 0, name: 'Old City Rooftops', short: 'Rooftops', enemies: ['coconut', 'coconut', 'pigeon'], song: 'roof',
    sky: ['#3b4f8c', '#e98a5a', '#ffcf8a'], ink: '#2a1d18', plank: 'Planks', col: '#ff9a4a' },
  forest: { id: 'forest', world: 1, name: 'Monsoon Forest', short: 'Forest', enemies: ['coconut', 'pigeon', 'pigeon', 'rickshaw'], song: 'forest',
    sky: ['#3f5752', '#7f988c', '#b9c6b4'], ink: '#14231c', plank: 'Vines', col: '#5fc07a' },
  bazaar: { id: 'bazaar', world: 2, name: 'Night Bazaar', short: 'Bazaar', enemies: ['rickshaw', 'rickshaw', 'coconut', 'pigeon'], song: 'bazaar',
    sky: ['#0b0a24', '#2a1f4f', '#6b3a5a'], ink: '#120c1c', plank: 'Awnings', col: '#ff5fa2' }
};
const LEVELS = [
  { id: '1-1', theme: 'roof', name: 'Rooftop Run', seed: 11, segs: 13, en: 0.42, gapMax: 3, pool: ['flat', 'blocks', 'gap', 'stepUp', 'stepDown', 'blocks', 'gap', 'flat', 'stairs', 'tankHop', 'springLedge', 'hidden'] },
  { id: '1-2', theme: 'roof', name: 'Water Tank Hop', seed: 23, segs: 15, en: 0.58, gapMax: 4, pool: ['flat', 'blocks', 'gap', 'tankHop', 'tankHop', 'stepUp', 'stepDown', 'movers', 'climb', 'springLedge', 'planks', 'pigeons'] },
  { id: '1-3', theme: 'roof', name: 'Kite Festival Sky', seed: 37, segs: 16, en: 0.68, gapMax: 5, pool: ['flat', 'blocks', 'gap', 'glideGap', 'glideGap', 'pigeons', 'tankHop', 'movers', 'stepUp', 'stepDown', 'climb', 'hidden'] },
  { id: '2-1', theme: 'forest', name: 'Monsoon Trail', seed: 41, segs: 15, en: 0.6, gapMax: 4, pool: ['flat', 'blocks', 'gap', 'planks', 'stepUp', 'stepDown', 'springLedge', 'climb', 'pigeons', 'stairs'] },
  { id: '2-2', theme: 'forest', name: 'Vine Falls', seed: 53, segs: 17, en: 0.72, gapMax: 4, pool: ['flat', 'blocks', 'gap', 'planks', 'planks', 'movers', 'glideGap', 'stepUp', 'stepDown', 'climb', 'hidden'] },
  { id: '2-3', theme: 'forest', name: 'Thunder Canopy', seed: 67, segs: 18, en: 0.84, gapMax: 5, pool: ['flat', 'blocks', 'gap', 'climb', 'movers', 'glideGap', 'pigeons', 'planks', 'stepUp', 'stepDown', 'springLedge'] },
  { id: '3-1', theme: 'bazaar', name: 'Lantern Lane', seed: 71, segs: 16, en: 0.74, gapMax: 4, pool: ['flat', 'blocks', 'gap', 'rickshaw', 'rickshaw', 'planks', 'stepUp', 'stepDown', 'springLedge', 'stairs', 'hidden'] },
  { id: '3-2', theme: 'bazaar', name: 'Awning Alley', seed: 83, segs: 18, en: 0.88, gapMax: 5, pool: ['flat', 'blocks', 'gap', 'movers', 'planks', 'glideGap', 'rickshaw', 'climb', 'pigeons', 'stepUp', 'stepDown'] },
  { id: '3-3', theme: 'bazaar', name: 'Monkey Business', seed: 97, segs: 10, en: 0.8, gapMax: 4, boss: true, pool: ['flat', 'blocks', 'gap', 'rickshaw', 'planks', 'stepUp', 'stepDown', 'movers', 'stairs'] }
];

function makeGen(seed, theme, P) {
  const W = 760;
  const t = new Uint8Array(W * H);
  const g = { x: 0, h: 3, t, theme, P, r: rng(seed), ents: [], coins: [], content: new Map(), pits: [], stands: [], tips: [], secrets: [], W };
  g.ri = (a, b) => a + Math.floor(g.r() * (b - a + 1));
  g.set = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) t[y * W + x] = v; };
  g.get = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? t[y * W + x] : 0);
  g.col = (x, top, v) => { for (let y = 0; y < top; y++) g.set(x, y, v || T_GROUND); };
  g.ground = (n) => { for (let i = 0; i < n; i++) g.col(g.x + i, g.h); g.x += n; };
  g.pit = (n) => { g.pits.push([g.x, n]); g.x += n; };
  g.coin = (x, y) => { if (y < H - 0.6) g.coins.push({ x, y }); };
  g.ent = (type, x, y, o) => { g.ents.push(Object.assign({ type, x, y }, o || {})); };
  g.block = (x, y, kind, content) => { if (y >= H) return; g.set(x, y, kind); if (content) g.content.set(KEY(x, y), content); };
  g.coinRow = (x, n, y) => { for (let i = 0; i < n; i++) g.coin(x + i + 0.5, y); };
  g.coinArc = (xa, xb, y0, peak, n) => { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); g.coin(lerp(xa, xb, k), y0 + peak * 4 * k * (1 - k)); } };
  return g;
}

function enemies(g, x0, n, mul) {
  const P = g.P, pool = THEMES[g.theme].enemies;
  let count = P.en * (mul == null ? 1 : mul) * n / 6 * P.dm;
  count = Math.floor(count) + (g.r() < count % 1 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const x = x0 + 0.5 + g.r() * Math.max(1, n - 1);
    if (x < 16) continue;
    const ty = pool[Math.floor(g.r() * pool.length)];
    if (ty === 'pigeon') g.ent('pigeon', x, g.h + 3 + g.r() * 1.6);
    else g.ent(ty, x, g.h);
  }
}

const RECIPES = {
  flat(g) {
    const n = 6 + g.ri(0, 5), x0 = g.x; g.ground(n);
    if (g.r() < 0.65) g.coinRow(x0 + 2, Math.min(4, n - 3), g.h + 1.5);
    enemies(g, x0 + 2, n - 3);
  },
  blocks(g) {
    const n = 10, x0 = g.x; g.ground(n);
    const pats = ['b?b!b', '?b?', 'b!b?b', '??!?', 'bb?bb', '?!?'];
    const p = pats[Math.floor(g.r() * pats.length)], bx = x0 + 2 + ((7 - p.length) >> 1), by = g.h + 3;
    let powered = false;
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === 'b') g.block(bx + i, by, T_BRICK);
      else if (c === '?') g.block(bx + i, by, T_Q, g.r() < 0.16 ? 'coins' : 'coin');
      else if (c === '!') { g.block(bx + i, by, T_Q, 'power'); powered = true; }
    }
    if (g.r() < 0.45 && by + 4 < H - 1) { g.block(bx + 1 + Math.floor(g.r() * (p.length - 2)), by + 4, T_Q, powered ? 'coins' : 'power'); g.coinRow(bx, p.length, by + 1.6); }
    else if (g.r() < 0.5) g.coinRow(bx, p.length, by + 1.6);
    enemies(g, x0 + 3, n - 4, 1.1);
  },
  gap(g) {
    const P = g.P, gw = clamp(2 + g.ri(0, P.gapMax - 2), 2, P.gapMax);
    g.ground(2);
    const x0 = g.x; g.pit(gw);
    const hb = g.h;
    if (g.r() < 0.3) g.h = clamp(g.h + (g.r() < 0.5 ? -1 : 1), 2, 8);
    g.coinArc(x0 - 0.2, x0 + gw + 0.2, Math.max(hb, g.h) + 1.2, 2.2, gw + 1);
    g.ground(3);
  },
  stepUp(g) {
    const d = 1 + g.ri(0, 2);
    if (g.h + d > 8) return RECIPES.stepDown(g);
    g.h += d; const x0 = g.x; g.ground(4 + g.ri(0, 3));
    if (g.r() < 0.5) g.coinRow(x0 + 1, 3, g.h + 1.5);
    enemies(g, x0 + 2, g.x - x0 - 2, 0.8);
  },
  stepDown(g) {
    const d = 1 + g.ri(0, 2);
    if (g.h - d < 2) return RECIPES.stepUp(g);
    g.h -= d; const x0 = g.x; g.ground(4 + g.ri(0, 3));
    enemies(g, x0 + 1, g.x - x0 - 1, 0.9);
  },
  stairs(g) {
    const k = 3 + g.ri(0, 2);
    g.ground(1);
    for (let i = 0; i < k; i++) { g.col(g.x, g.h); for (let y = g.h; y < g.h + i + 1; y++) g.set(g.x, y, T_STONE); g.x++; }
    g.coinRow(g.x - 2, 3, g.h + k + 1.5);
    if (g.r() < 0.5) { g.pit(2); for (let i = k - 1; i >= 0; i--) { g.col(g.x, g.h); for (let y = g.h; y < g.h + i + 1; y++) g.set(g.x, y, T_STONE); g.x++; } }
    else { for (let i = k - 1; i >= 0; i--) { g.col(g.x, g.h); for (let y = g.h; y < g.h + i + 1; y++) g.set(g.x, y, T_STONE); g.x++; } }
    g.ground(3);
  },
  tankHop(g) {
    g.ground(2);
    const x0 = g.x, pw = 10; g.pit(pw);
    const top = g.h + 1;
    [[x0 + 2, top], [x0 + 6, top + 1]].forEach(([tx, ty]) => {
      for (let dx = 0; dx < 2; dx++) for (let y = ty - 2; y < ty; y++) g.set(tx + dx, y, T_TANK);
      g.stands.push([tx, ty - 2]);
      g.coinRow(tx, 2, ty + 1.2);
    });
    g.h = clamp(g.h + (g.r() < 0.5 ? 1 : 0), 2, 8);
    g.ground(3);
    if (g.r() < 0.6) g.ent('pigeon', x0 + 5, top + 4);
  },
  springLedge(g) {
    const x0 = g.x; g.ground(12);
    g.ent('spring', x0 + 2.5, g.h);
    const ly = Math.min(g.h + 5, H - 4);
    for (let x = x0 + 4; x <= x0 + 8; x++) g.set(x, ly, T_STONE);
    g.coinRow(x0 + 4, 5, ly + 1.6);
    if (g.h + 9 <= H - 2) g.block(x0 + 2, g.h + 9, T_HIDDEN, g.r() < 0.5 ? 'life' : 'coins');
    enemies(g, x0 + 5, 5, 1);
    g.tips.push([x0 + 1, 'spring']);
  },
  movers(g) {
    g.ground(2);
    const x0 = g.x, pw = 11; g.pit(pw);
    g.ent('mover', x0 + 2.5, g.h, { ax: 1.5, ay: 0, per: 3.6 });
    g.ent('mover', x0 + 8, g.h, { ax: 0, ay: 1.5, per: 3.2 });
    g.coinArc(x0 + 1, x0 + 10, g.h + 1.4, 1.6, 6);
    g.ground(3);
  },
  planks(g) {
    g.ground(2);
    const x0 = g.x, pw = 9; g.pit(pw);
    const pl = [[x0 + 0, g.h + 2], [x0 + 4, g.h + 4], [x0 + 7, g.h + 2]];
    pl.forEach(([px, py]) => { for (let i = 0; i < (px === x0 + 7 ? 2 : 3); i++) g.set(px + i, Math.min(H - 2, py), T_PLANK); g.coinRow(px, 2, Math.min(H - 1, py + 1.5)); });
    if (g.r() < 0.5) g.ent('pigeon', x0 + 5, g.h + 7);
    g.ground(3);
  },
  climb(g) {
    if (g.h > 4) return RECIPES.stepDown(g);
    g.ground(4);
    const x0 = g.x;
    g.ground(3);
    for (let y = g.h + 2; y < g.h + 7; y++) g.set(x0 - 1, y, T_STONE);
    const top = g.h + 6;
    for (let i = 0; i < 2; i++) g.col(x0 + 3 + i, top);
    for (let y = g.h + 1; y < top; y += 1.3) g.coin(x0 + 1.5, y + 0.5);
    if (g.P.diff === 'easy') g.ent('spring', x0 + 1.5, g.h);
    g.tips.push([x0 - 3, 'wall']);
    g.x = x0 + 5; g.h = top;
    g.ground(3);
    g.h = top;
  },
  glideGap(g) {
    g.ground(1);
    const k = 3;
    for (let i = 0; i < k; i++) { g.col(g.x, g.h); for (let y = g.h; y < g.h + i + 1; y++) g.set(g.x, y, T_STONE); g.x++; }
    g.col(g.x, g.h); for (let y = g.h; y < g.h + k; y++) g.set(g.x, y, T_STONE); g.x++;
    const x0 = g.x, pw = 10 + g.ri(0, 2);
    g.pit(pw);
    for (let i = 0; i < 6; i++) g.coin(x0 + 1 + i * (pw - 2) / 5, g.h + k + 1.2 - i * 0.55);
    g.ground(4);
    g.tips.push([x0 - 6, 'glide']);
  },
  pigeons(g) {
    const x0 = g.x; g.ground(10);
    g.ent('pigeon', x0 + 4, g.h + 4); g.ent('pigeon', x0 + 7.5, g.h + 5.6);
    g.coinRow(x0 + 3, 5, g.h + 3);
  },
  rickshaw(g) {
    const x0 = g.x; g.ground(13);
    const by = g.h + 3; g.block(x0 + 4, by, T_Q, 'coin'); g.block(x0 + 5, by, T_BRICK); g.block(x0 + 6, by, T_Q, g.r() < 0.4 ? 'power' : 'coin');
    if (x0 + 9 > 16) g.ent('rickshaw', x0 + 9, g.h);
    g.coinRow(x0 + 9, 3, g.h + 1.5);
  },
  hidden(g) {
    const x0 = g.x; g.ground(9);
    g.block(x0 + 4, g.h + 3, T_HIDDEN, g.r() < 0.55 ? 'diya' : 'life');
    g.coinRow(x0 + 2, 2, g.h + 1.5); g.coinRow(x0 + 6, 2, g.h + 1.5);
    enemies(g, x0 + 5, 3, 0.8);
  },
  checkpoint(g) {
    const x0 = g.x; g.ground(7);
    g.ent('check', x0 + 3.5, g.h);
  },
  chimney(g) {
    const x0 = g.x; g.ground(16);
    for (let dx = 0; dx < 2; dx++) for (let y = g.h; y < g.h + 2; y++) { g.set(x0 + 3 + dx, y, T_CHIMNEY); g.set(x0 + 12 + dx, y, T_CHIMNEY); }
    g.secrets.push({ x0: x0 + 3, y: g.h + 2, ret: { x: x0 + 13, y: g.h + 2 } });
    g.coinRow(x0 + 7, 3, g.h + 1.5);
    enemies(g, x0 + 7, 3, 1);
  }
};

function finale(g) {
  g.ground(3);
  const k = 5;
  for (let i = 0; i < k; i++) { g.col(g.x, g.h); for (let y = g.h; y < g.h + i + 1; y++) g.set(g.x, y, T_STONE); g.x++; }
  g.ground(3);
  const fx = g.x; g.ground(1); g.set(fx, g.h, T_STONE);
  g.flag = { x: fx + 0.5, y0: g.h + 1, y1: Math.min(H - 1, g.h + 10) };
  g.ground(4);
  g.hut = { x: g.x + 1, y: g.h, door: g.x + 3 };
  g.ground(12);
}

function bossArena(g) {
  g.ground(5);
  const x0 = g.x, W = 26, floor = g.h;
  for (let i = 0; i < W; i++) g.col(x0 + i, floor);
  const plats = [[x0 + 4, floor + 3, 4], [x0 + 11, floor + 5, 5], [x0 + 19, floor + 3, 4]];
  plats.forEach(([px, py, n]) => { for (let i = 0; i < n; i++) g.set(px + i, py, T_PLANK); });
  for (let i = 0; i < 4; i++) g.col(x0 + W + i, Math.min(H - 1, floor + 9));
  g.ent('monkey', x0 + 13.5, floor + 6);
  g.arena = { x0, x1: x0 + W, floor, gate: x0, plats: plats.map(([px, py, n]) => ({ x: px + n / 2, y: py + 1, w: n })) };
  g.coinRow(x0 + 4, 4, floor + 4.5); g.coinRow(x0 + 19, 4, floor + 4.5);
  g.x = x0 + W + 4;
  g.hut = null; g.flag = null;
}

function buildLevel(li, diff) {
  const D = LEVELS[li];
  const P = { en: D.en, gapMax: D.gapMax, diff, dm: diff === 'easy' ? 0.65 : diff === 'hard' ? 1.35 : 1 };
  const g = makeGen(D.seed * 977 + (diff === 'hard' ? 3 : 0), D.theme, P);
  g.ground(12);
  const spawn = { x: 3.5, y: g.h };
  const mid = Math.floor(D.segs / 2), sec = 2 + Math.floor(g.r() * Math.max(1, mid - 3));
  let last = '';
  for (let i = 0; i < D.segs; i++) {
    if (i === mid) { RECIPES.checkpoint(g); continue; }
    if (i === sec) { RECIPES.chimney(g); continue; }
    let pick;
    for (let k = 0; k < 6; k++) {
      pick = D.pool[Math.floor(g.r() * D.pool.length)];
      if (i < 2 && pick !== 'flat' && pick !== 'blocks') continue;
      if (pick !== last) break;
    }
    if (D.boss && pick === 'glideGap') pick = 'flat';
    RECIPES[pick](g); last = pick;
  }
  if (D.boss) bossArena(g); else finale(g);
  const w = g.x;
  const t = new Uint8Array(w * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) t[y * w + x] = g.t[y * g.W + x];
  return {
    li, id: D.id, name: D.name, theme: D.theme, w, h: H, spec: t, specContent: g.content, specEnts: g.ents, specCoins: g.coins,
    spawn, flag: g.flag || null, hut: g.hut || null, arena: g.arena || null, secrets: g.secrets, stands: g.stands, pits: g.pits, tips: g.tips,
    boss: !!D.boss, seed: D.seed, indoor: false
  };
}

function buildRoom(theme, seed) {
  const w = 22, h = 12, t = new Uint8Array(w * H), r = rng(seed);
  const set = (x, y, v) => { t[y * w + x] = v; };
  for (let x = 0; x < w; x++) { set(x, 0, T_GROUND); set(x, 1, T_GROUND); if (x < 2 || x > 4) set(x, h - 1, T_GROUND); }
  for (let y = 0; y < h; y++) { set(0, y, T_GROUND); set(w - 1, y, T_GROUND); }
  for (let x = 12; x < 16; x++) set(x, 5, T_PLANK);
  const content = new Map(); set(8, 6, T_Q); content.set(KEY(8, 6), r() < 0.5 ? 'power' : 'coins');
  const coins = [];
  for (let x = 5; x < 11; x++) { coins.push({ x: x + 0.5, y: 2.6 }); coins.push({ x: x + 0.5, y: 3.6 }); }
  for (let x = 12; x < 16; x++) { coins.push({ x: x + 0.5, y: 6.6 }); coins.push({ x: x + 0.5, y: 7.6 }); }
  for (let x = 16; x < 19; x++) coins.push({ x: x + 0.5, y: 2.6 });
  return { li: -1, id: 'room', name: 'Secret attic', theme, w, h: H, spec: t, specContent: content, specEnts: [], specCoins: coins, spawn: { x: 3.5, y: h - 2.5 },
    flag: null, hut: null, arena: null, secrets: [], stands: [], pits: [], tips: [], boss: false, seed, indoor: true, door: { x: w - 1.6, y: 2 }, roomH: h };
}

// A fresh, playable copy of a level from its plan (deaths and restarts rebuild it).
let MAPV = 0;
function liveMap(B) {
  const M = Object.assign({}, B);
  M.t = B.spec.slice();
  M.content = new Map(B.specContent);
  M.multi = new Map();
  M.bump = new Map();
  M.coins = B.specCoins.map((c) => ({ x: c.x, y: c.y, got: false, t: 0 }));
  M.ents = B.specEnts.map((e, i) => mkEnt(Object.assign({}, e, { id: i })));
  M.version = ++MAPV; M.tilesV = 0;
  M.gateOn = false;
  return M;
}
const tileAt = (M, x, y) => {
  if (x < 0 || x >= M.w) return y < H + 4 ? T_GROUND : 0;
  if (y < 0 || y >= H) return 0;
  return M.t[y * M.w + x];
};
function setTile(M, x, y, v) { if (x >= 0 && x < M.w && y >= 0 && y < H) { M.t[y * M.w + x] = v; M.tilesV++; } }

/* ------------------------------------------------------------ entities */
const ENT_SIZE = { coconut: [0.82, 0.82], pigeon: [0.95, 0.7], rickshaw: [1.25, 1.05], monkey: [1.5, 2.1], ball: [0.6, 0.6], mango: [0.75, 0.75], chilli: [0.8, 0.7], diya: [0.8, 0.6], life: [0.85, 0.85], spring: [1, 0.55], mover: [3, 0.45], check: [0.7, 2.6] };
function mkEnt(e) {
  const s = ENT_SIZE[e.type] || [0.8, 0.8];
  e.w = e.w || s[0]; e.h = e.h || s[1];
  e.vx = 0; e.vy = 0; e.dir = -1; e.t = hash(e.id * 13 + 5) * 10; e.alive = true; e.active = false; e.dead = 0; e.onGround = false;
  e.x0 = e.x; e.y0 = e.y;
  if (e.type === 'mover') { e.dx = 0; e.dy = 0; e.ph = hash(e.id * 7) * TAU; }
  if (e.type === 'spring') { e.comp = 0; }
  if (e.type === 'check') { e.on = false; e.raise = 0; }
  if (e.type === 'monkey') { e.hp = 3; e.state = 'wait'; e.st = 0; e.plat = 1; e.speed = 1; e.kite = true; e.face = -1; }
  if (e.type === 'rickshaw') { e.pause = 0; e.key = 0; }
  if (e.type === 'pigeon') { e.dir = hash(e.id) < 0.5 ? -1 : 1; e.swoop = 0; }
  return e;
}
const isEnemy = (e) => e.type === 'coconut' || e.type === 'pigeon' || e.type === 'rickshaw' || e.type === 'ball';
const isItem = (e) => e.type === 'mango' || e.type === 'chilli' || e.type === 'diya' || e.type === 'life';

/* ------------------------------------------------------------ physics */
const PH = {
  g: 62, fallMul: 1.38, maxFall: 24, jumpV: 21.5, runJump: 0.16, jumpCut: 0.45, coyote: 0.1, buffer: 0.13,
  walk: 7.2, run: 11.2, accG: 60, accA: 38, decG: 50, turn: 95, decA: 9,
  glideFall: 3.2, glideAcc: 26, glideMax: 9.8,
  wallSlide: 4.2, wallJumpVx: 7.6, wallJumpVy: 18, wallLock: 0.12,
  dashV: 17, dashT: 0.17, dashCD: 0.5, fireDashV: 19.5, fireDashT: 0.3,
  springV: 28.5, springHeld: 33, stompV: 13.5, stompHeld: 19.5
};
const FIXED = 1 / 120;

function moveX(M, b, dx, oneWay) {
  if (!dx) return 0;
  b.x += dx;
  const half = b.w / 2, y0 = Math.floor(b.y + 0.04), y1 = Math.floor(b.y + b.h - 0.04);
  if (dx > 0) {
    const tx = Math.floor(b.x + half);
    for (let ty = y0; ty <= y1; ty++) if (isSolid(tileAt(M, tx, ty))) { b.x = tx - half - 0.0005; return 1; }
  } else {
    const tx = Math.floor(b.x - half);
    for (let ty = y0; ty <= y1; ty++) if (isSolid(tileAt(M, tx, ty))) { b.x = tx + 1 + half + 0.0005; return -1; }
  }
  return 0;
}
// Returns 1 landed, -1 head hit (with b._hx, b._hy), 0 free.
function moveY(M, b, dy, revealHidden) {
  if (!dy) return 0;
  const half = b.w / 2 - 0.03, x0 = Math.floor(b.x - half), x1 = Math.floor(b.x + half);
  const pb = b.y, pt = b.y + b.h;
  b.y += dy;
  if (dy < 0) {
    const ty = Math.floor(b.y);
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(M, tx, ty);
      if (isSolid(t) || (t === T_PLANK && pb >= ty + 1 - 0.02)) { b.y = ty + 1; return 1; }
    }
  } else {
    const ty = Math.floor(b.y + b.h);
    let best = null, bd = 9;
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(M, tx, ty);
      if (isSolid(t) || (revealHidden && t === T_HIDDEN && pt <= ty + 0.02)) { const d = Math.abs(tx + 0.5 - b.x); if (d < bd) { bd = d; best = tx; } }
    }
    if (best != null) { b.y = ty - b.h - 0.0005; b._hx = best; b._hy = ty; return -1; }
  }
  return 0;
}
const overlap = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y < b.y + b.h && b.y < a.y + a.h;
const groundUnder = (M, x, y) => { const t = tileAt(M, Math.floor(x), Math.floor(y - 0.1)); return isSolid(t) || t === T_PLANK; };

/* ------------------------------------------------------------ the run (game state) */
let ARC = null;
let G = null;           // the live game
let SAVE = null;
const SAVE_KEY = 'chhat-hopper.save';
function loadSave() {
  const s = ARC.store.get(SAVE_KEY, null) || {};
  SAVE = { unlocked: clamp(s.unlocked | 0 || 1, 1, 9), best: s.best || {}, cleared: s.cleared || 0, tips: s.tips || {} };
}
const saveGame = () => ARC.store.set(SAVE_KEY, SAVE);

function newPlayer(x, y) {
  return { x, y, vx: 0, vy: 0, w: 0.66, h: 0.92, big: false, power: 'none', face: 1, onGround: false, coyote: 0, buf: 0, cut: true, inv: 0, star: 0,
    dashT: 0, dashCD: 0, dashDir: 1, airDash: true, fireDash: false, lock: 0, wall: 0, wallT: 0, wallDir: 0, gliding: false, kite: true, on: null,
    land: 0, landV: 0, anim: 0, combo: 0, flag: 0, grow: 0, stepT: 0, walk: 0, jumps: 0, dashes: 0, glideTime: 0, wallJumps: 0, prevY: y, sq: 0 };
}
function setBig(P, on) {
  const was = P.big; P.big = on;
  P.w = on ? 0.72 : 0.66; P.h = on ? 1.7 : 0.92;
  if (was !== on) P.grow = on ? 1 : -1;
}

function newGame(cfg) {
  const lives = cfg.diff === 'easy' ? 7 : cfg.diff === 'hard' ? 3 : 5;
  return { cfg, mode: cfg.mode, diff: cfg.diff, li: cfg.li, lives, score: 0, jalebis: 0, stomps: 0, total: 0, time: 0, clock: 0, levelsDone: 0,
    phase: 'none', pt: 0, map: null, main: null, room: null, P: null, cp: null, ev: [], pops: [], iris: 1, irisT: 1, trans: null, letter: 0, letterT: 0,
    cam: { x: 0, y: 0, tx: 0, ty: 0, vy: 0, look: 0, zoom: 1, kick: 0, roll: 0, init: false, groundY: 0, yaw: 0, intro: 0 },
    slow: 0, shownTips: {}, banner: null, bannerT: 0, boss: null, cut: null, attract: !!cfg.attract, over: false, fw: 0, tally: null, kiteBack: 0, gameOver: false };
}

function emit(Gm, e) {
  if (e.t === 'jump' || e.t === 'walljump') Gm.nJumps = (Gm.nJumps || 0) + 1;
  else if (e.t === 'dash') Gm.nDashes = (Gm.nDashes || 0) + 1;
  if (Gm.ev.length < 200) Gm.ev.push(e);
  if (!Gm.attract) react(e);
}
function addScore(Gm, v, x, y) {
  Gm.score += v;
  if (x != null) Gm.pops.push({ x, y, text: String(v), t: 0, col: v >= 1000 ? '#ffd36b' : '#fff6e0' });
}
function banner(Gm, text, sub, dur) { Gm.banner = { text, sub }; Gm.bannerT = dur || 2; }

function loadLevel(Gm, li, fromCheckpoint) {
  Gm.li = li;
  const B = buildLevel(li, Gm.diff);
  Gm.base = B;
  Gm.main = liveMap(B);
  Gm.map = Gm.main; Gm.room = null;
  const sp = fromCheckpoint && Gm.cp && Gm.cp.li === li ? Gm.cp : B.spawn;
  const keepKite = Gm.P ? Gm.P.kite : true;
  Gm.P = newPlayer(sp.x, sp.y);
  if (Gm.cp && Gm.cp.li === li && fromCheckpoint) {
    Gm.main.ents.forEach((e) => { if (e.type === 'check' && Math.abs(e.x - Gm.cp.x) < 0.6) { e.on = true; e.raise = 1; } });
  } else Gm.cp = null;
  // In the boss level the monkey steals the kite in the intro; after a respawn it is still gone.
  Gm.P.kite = !B.boss || !fromCheckpoint;
  void keepKite;
  Gm.clock = Gm.diff === 'easy' ? 400 : Gm.diff === 'hard' ? 250 : 320;
  if (Gm.mode === 'speed') Gm.clock = 0;
  Gm.cam.init = false;
  Gm.boss = null; Gm.cut = null; Gm.tally = null; Gm.slow = 0; Gm.kiteBack = 0;
  Gm.pops.length = 0;
  emit(Gm, { t: 'level', li });
}

function phase(Gm, p) { Gm.phase = p; Gm.pt = 0; }

// Iris wipe: close on the hero, run mid() while black, open again.
function transition(Gm, mid, dur) {
  if (Gm.trans) return;
  Gm.trans = { t: 0, dur: dur || 0.9, mid, done: false };
}
function stepTrans(Gm, dt) {
  const T = Gm.trans;
  if (!T) { Gm.iris = approach(Gm.iris, 1, dt * 2.4); return; }
  T.t += dt;
  const half = T.dur / 2;
  if (T.t < half) Gm.iris = 1 - smooth01(T.t / half);
  else {
    if (!T.done) { T.done = true; Gm.iris = 0; try { T.mid(); } catch (e) { console.error(e); } }
    Gm.iris = smooth01((T.t - half) / half);
    if (T.t >= T.dur) { Gm.iris = 1; Gm.trans = null; }
  }
}

function startIntro(Gm) {
  phase(Gm, 'intro');
  Gm.cam.init = false; Gm.cam.intro = 1;
  if (Gm.base.boss && Gm.P.kite) Gm.cut = { type: 'steal', t: 0 };
  music(THEMES[Gm.base.theme].song);
}

function startPlay(Gm) { phase(Gm, 'play'); Gm.cam.intro = 0; Gm.cut = null; }

/* ------------------------------------------------------------ the main step */
function stepGame(Gm, dt, inp) {
  stepTrans(Gm, dt);
  if (Gm.over) return;
  if (Gm.slow > 0) Gm.slow -= dt;
  Gm.letter = approach(Gm.letter, Gm.letterT, dt * 2.2);
  if (Gm.bannerT > 0) Gm.bannerT -= dt;
  for (let i = Gm.pops.length - 1; i >= 0; i--) { Gm.pops[i].t += dt; if (Gm.pops[i].t > 1.1) Gm.pops.splice(i, 1); }
  Gm.pt += dt;
  const P = Gm.P, ph = Gm.phase;
  Gm.letterT = (ph === 'intro' || ph === 'goal' || ph === 'bosswin' || ph === 'ending' || (Gm.boss && Gm.boss.intro > 0)) ? 1 : 0;
  if (ph === 'map') {
    if ((Gm.pt > 0.8 && inp.any) || Gm.pt > 3.6) {
      transition(Gm, () => { loadLevel(Gm, Gm.li, false); startIntro(Gm); }, 0.8);
      Gm.pt = -99;
    }
    return;
  }
  if (!P || !Gm.map) return;
  if (ph === 'intro') {
    const dur = Gm.cut ? 3.2 : 2.6;
    if (Gm.cut) {
      Gm.cut.t += dt;
      if (Gm.cut.t > 1.45 && P.kite) { P.kite = false; emit(Gm, { t: 'steal', x: P.x, y: P.y + 1.2 }); }
    }
    P.anim += dt; updateWorld(Gm, dt * 0.0, true);
    if ((Gm.pt > 0.45 && (inp.jumpPressed || inp.dashPressed || inp.any)) || Gm.pt > dur) {
      if (Gm.cut && P.kite) { P.kite = false; }
      startPlay(Gm);
    }
    return;
  }
  if (ph === 'dead') {
    P.vy -= 40 * dt; P.y += P.vy * dt; P.anim += dt;
    if (Gm.pt > 1.7 && !Gm.trans) {
      transition(Gm, () => {
        Gm.lives--;
        if (Gm.lives < 0) { Gm.gameOver = true; finish(Gm, false); return; }
        loadLevel(Gm, Gm.li, true); phase(Gm, 'respawn');
        music(THEMES[Gm.base.theme].song);
      }, 1.0);
    }
    return;
  }
  if (ph === 'respawn') { updateWorld(Gm, 0, true); if (Gm.pt > 0.5) startPlay(Gm); return; }
  if (ph === 'pipe-in') {
    P.y -= dt * 2.2; P.x = lerp(P.x, Gm.pipeX, dt * 10);
    if (Gm.pt > 0.55 && !Gm.trans) transition(Gm, () => enterRoom(Gm), 0.8);
    return;
  }
  if (ph === 'door-out') {
    P.x += dt * 2; P.anim += dt;
    if (Gm.pt > 0.3 && !Gm.trans) transition(Gm, () => exitRoom(Gm), 0.8);
    return;
  }
  if (ph === 'pipe-up') {
    P.y = Math.min(Gm.pipeY, P.y + dt * 2.4); P.anim += dt;
    updateWorld(Gm, dt, false);
    if (P.y >= Gm.pipeY - 0.001 && Gm.pt > 0.5) { P.onGround = true; phase(Gm, 'play'); }
    return;
  }
  if (ph === 'goal' || ph === 'bosswin') { stepGoal(Gm, dt, inp); return; }
  if (ph === 'ending') {
    Gm.fw -= dt;
    if (Gm.fw <= 0) { Gm.fw = 0.35 + Math.random() * 0.4; emit(Gm, { t: 'firework', x: Gm.cam.x + (Math.random() - 0.5) * 12, y: Gm.cam.y + 3 + Math.random() * 4 }); }
    if ((Gm.pt > 2.5 && inp.any) || Gm.pt > 7) { if (!Gm.over) finish(Gm, true); }
    return;
  }
  if (ph !== 'play') return;
  // timer
  if (Gm.mode === 'speed') Gm.clock += dt;
  else {
    const before = Gm.clock; Gm.clock -= dt;
    if (before > 60 && Gm.clock <= 60) { emit(Gm, { t: 'hurry' }); banner(Gm, 'Hurry up!', 'The sun is setting', 1.6); }
    if (Gm.clock <= 0) { Gm.clock = 0; die(Gm, 'time'); return; }
  }
  Gm.time += dt;
  updateWorld(Gm, dt, false);
  stepPlayer(Gm, dt, inp);
  if (Gm.phase !== 'play') return;
  interact(Gm, dt, inp);
  // tips shown once per game
  if (!Gm.attract) for (let i = 0; i < Gm.map.tips.length; i++) {
    const tp = Gm.map.tips[i];
    if (!Gm.shownTips[tp[1]] && P.x > tp[0] && P.x < tp[0] + 4) {
      Gm.shownTips[tp[1]] = 1;
      const touch = !!(ARC && ARC.touchMode), pad = !!(ARC && ARC.gamepad) && !touch;
      const jumpWord = touch ? 'Jump' : pad ? 'A' : 'Space';
      if (tp[1] === 'glide') banner(Gm, 'Glide with your kite', 'Hold ' + jumpWord + ' in the air', 2.6);
      else if (tp[1] === 'wall') banner(Gm, 'Wall jump', 'Hold toward a wall, then jump off it', 2.6);
      else if (tp[1] === 'spring') banner(Gm, 'Bounce on the charpai', 'Hold ' + jumpWord + ' to go higher', 2.2);
    }
  }
  // boss arena gate
  const ar = Gm.map.arena;
  if (ar && !Gm.boss && P.x > ar.x0 + 2.5 && P.y < ar.floor + 8) startBoss(Gm);
  if (Gm.boss) stepBoss(Gm, dt);
}

function updateWorld(Gm, dt, frozen) {
  const M = Gm.map;
  M.bump.forEach((v, k) => { const nv = v - dt; if (nv <= 0) M.bump.delete(k); else M.bump.set(k, nv); });
  const tt = Gm.time;
  for (let i = 0; i < M.ents.length; i++) {
    const e = M.ents[i];
    if (e.type === 'mover') {
      const ox = e.x, oy = e.y, w = TAU / e.per, s = Math.sin(tt * w + e.ph);
      e.x = e.x0 + e.ax * s; e.y = e.y0 + e.ay * s;
      e.dx = e.x - ox; e.dy = e.y - oy;
    } else if (e.type === 'spring') e.comp = Math.max(0, e.comp - dt * 4);
    else if (e.type === 'check' && e.on) e.raise = Math.min(1, e.raise + dt * 1.6);
  }
  for (let i = 0; i < M.coins.length; i++) { const c = M.coins[i]; if (c.got && c.t < 1) c.t += dt * 3; }
}

function stepPlayer(Gm, dt, inp) {
  const P = Gm.P, M = Gm.map;
  P.anim += dt;
  P.coyote -= dt; P.buf -= dt; P.inv -= dt; P.dashCD -= dt; P.lock -= dt; P.wallT -= dt; P.land = Math.max(0, P.land - dt * 3);
  if (P.star > 0) { P.star -= dt; if (P.star <= 0) { P.star = 0; music(THEMES[Gm.base.theme].song); } }
  if (P.grow) P.grow = approach(P.grow, 0, dt * 2.5);
  if (inp.jumpPressed) P.buf = PH.buffer;
  let ax = inp.x;
  if (Math.abs(ax) < 0.18) ax = 0;
  if (ax) P.face = ax > 0 ? 1 : -1;
  // ride a moving platform
  if (P.on) {
    const m = P.on;
    if (Math.abs(P.x - m.x) < m.w / 2 + P.w / 2 && Math.abs(P.y - m.y) < 0.3) { P.x += m.dx; P.y = m.y; }
    else P.on = null;
  }
  const fire = P.power === 'chilli';
  if (inp.dashPressed && P.dashCD <= 0 && P.dashT <= 0 && (P.onGround || P.airDash)) {
    P.fireDash = fire;
    P.dashT = fire ? PH.fireDashT : PH.dashT;
    P.dashDir = ax ? Math.sign(ax) : P.face; P.face = P.dashDir;
    if (!P.onGround) P.airDash = false;
    P.dashCD = PH.dashCD; P.dashes++;
    emit(Gm, { t: 'dash', x: P.x, y: P.y + P.h / 2, dir: P.dashDir, fire });
  }
  const wasGround = P.onGround;
  if (P.dashT > 0) {
    P.dashT -= dt;
    P.vx = P.dashDir * (P.fireDash ? PH.fireDashV : PH.dashV);
    if (!P.onGround) P.vy = Math.max(P.vy, 0) * 0.5;
    P.gliding = false;
  } else {
    P.fireDash = false;
    if (P.lock <= 0) {
      let maxV = inp.run ? PH.run : PH.walk;
      if (ax) maxV *= Math.max(0.4, Math.min(1, Math.abs(ax) * 1.15));
      const target = ax * maxV;
      let acc;
      if (P.onGround) acc = ax ? ((Math.sign(ax) !== Math.sign(P.vx) && Math.abs(P.vx) > 0.6) ? PH.turn : PH.accG) : PH.decG;
      else acc = P.gliding ? PH.glideAcc : ax ? PH.accA : PH.decA;
      if (!ax && P.onGround && Math.abs(P.vx) > maxV) acc = PH.decG;
      P.vx = approach(P.vx, target, acc * dt);
    }
    let g = PH.g;
    if (P.vy < 0) g *= PH.fallMul;
    if (inp.jumpHeld && Math.abs(P.vy) < 2.6 && !P.onGround) g *= 0.55;
    P.vy -= g * dt;
    // wall slide
    P.wall = 0;
    if (!P.onGround && P.vy < 0) {
      if (ax < -0.3 && touchingWall(M, P, -1)) P.wall = -1;
      else if (ax > 0.3 && touchingWall(M, P, 1)) P.wall = 1;
    }
    if (P.wall) { P.vy = Math.max(P.vy, -PH.wallSlide); P.wallT = 0.12; P.wallDir = P.wall; P.gliding = false; if (Math.random() < dt * 20) emit(Gm, { t: 'slide', x: P.x + P.wall * P.w / 2, y: P.y + P.h * 0.5 }); }
    // glide on the kite
    const glideWant = P.kite && !P.onGround && !P.wall && P.vy < 0 && (inp.jumpHeld || inp.glideHeld);
    if (glideWant) {
      if (!P.gliding) emit(Gm, { t: 'glide', x: P.x, y: P.y });
      P.gliding = true; P.vy = Math.max(P.vy, -PH.glideFall); P.vx = clamp(P.vx, -PH.glideMax, PH.glideMax); P.glideTime += dt;
    } else P.gliding = false;
    P.vy = Math.max(P.vy, -PH.maxFall);
  }
  // jumps
  if (P.buf > 0) {
    if (P.onGround || P.coyote > 0) {
      P.vy = PH.jumpV + Math.abs(P.vx) * PH.runJump; P.onGround = false; P.coyote = 0; P.buf = 0; P.cut = false; P.on = null; P.jumps++;
      emit(Gm, { t: 'jump', x: P.x, y: P.y, big: P.big });
    } else if (P.wallT > 0 && P.dashT <= 0) {
      P.vy = PH.wallJumpVy; P.vx = -P.wallDir * PH.wallJumpVx; P.lock = PH.wallLock; P.face = -P.wallDir; P.buf = 0; P.wallT = 0; P.cut = false; P.wallJumps++; P.airDash = true;
      emit(Gm, { t: 'walljump', x: P.x + P.wallDir * P.w / 2, y: P.y + 0.5, dir: -P.wallDir });
    }
  }
  if (!inp.jumpHeld && P.vy > 0 && !P.cut) { P.vy *= PH.jumpCut; P.cut = true; }
  // move
  const prevVy = P.vy;
  P.prevY = P.y;
  const hx = moveX(M, P, P.vx * dt);
  if (hx) {
    if (P.fireDash && P.big) { breakAhead(Gm, P, hx); }
    P.vx = 0;
  }
  const ry = moveY(M, P, P.vy * dt, true);
  P.onGround = false;
  if (ry === 1) { P.onGround = true; P.vy = 0; }
  else if (ry === -1) { if (P.vy > 0) { P.vy = Math.min(0, -1); bumpBlock(Gm, P._hx, P._hy); } }
  // movers
  if (!P.onGround && P.vy <= 0) {
    for (let i = 0; i < M.ents.length; i++) {
      const m = M.ents[i]; if (m.type !== 'mover') continue;
      if (Math.abs(P.x - m.x) < m.w / 2 + P.w / 2 - 0.08 && P.prevY >= m.y - 0.06 - Math.max(0, -m.dy) && P.y <= m.y + 0.02) { P.y = m.y; P.vy = 0; P.onGround = true; P.on = m; break; }
    }
  }
  if (P.onGround) {
    P.coyote = PH.coyote; P.airDash = true; P.gliding = false;
    if (!wasGround) {
      P.land = 1; P.landV = -prevVy; P.combo = 0;
      emit(Gm, { t: 'land', x: P.x, y: P.y, v: -prevVy, big: P.big });
    }
    if (Math.abs(P.vx) > 0.5) {
      P.walk += Math.abs(P.vx) * dt;
      P.stepT -= Math.abs(P.vx) * dt;
      if (P.stepT <= 0) { P.stepT = P.big ? 1.25 : 0.95; emit(Gm, { t: 'step', x: P.x, y: P.y, v: Math.abs(P.vx) }); }
    }
  }
  if (P.y < -3) die(Gm, 'fall');
}

function touchingWall(M, P, dir) {
  const tx = Math.floor(P.x + dir * (P.w / 2 + 0.06));
  const ya = Math.floor(P.y + 0.2), yb = Math.floor(P.y + P.h - 0.1);
  for (let ty = ya; ty <= yb; ty++) { const t = tileAt(M, tx, ty); if (isSolid(t) && t !== T_PLANK) return true; }
  return false;
}
function breakAhead(Gm, P, dir) {
  const M = Gm.map, tx = Math.floor(P.x + dir * (P.w / 2 + 0.05));
  for (let ty = Math.floor(P.y); ty <= Math.floor(P.y + P.h - 0.05); ty++) {
    if (tileAt(M, tx, ty) === T_BRICK) { setTile(M, tx, ty, T_EMPTY); emit(Gm, { t: 'brick', x: tx + 0.5, y: ty + 0.5 }); addScore(Gm, 50); }
  }
}

function bumpBlock(Gm, tx, ty) {
  const M = Gm.map, P = Gm.P, t = tileAt(M, tx, ty), k = KEY(tx, ty);
  if (t === T_BRICK) {
    if (P.big) { setTile(M, tx, ty, T_EMPTY); emit(Gm, { t: 'brick', x: tx + 0.5, y: ty + 0.5 }); addScore(Gm, 50); }
    else { M.bump.set(k, 0.2); emit(Gm, { t: 'bump', x: tx + 0.5, y: ty + 0.5 }); }
  } else if (t === T_Q || t === T_HIDDEN) {
    M.bump.set(k, 0.2);
    const c = M.content.get(k) || 'coin';
    if (t === T_HIDDEN) emit(Gm, { t: 'reveal', x: tx + 0.5, y: ty + 0.5 });
    if (c === 'coin' || c === 'coins') {
      giveCoin(Gm, tx + 0.5, ty + 1.2, true);
      const left = (M.multi.has(k) ? M.multi.get(k) : (c === 'coins' ? 7 : 1)) - 1;
      M.multi.set(k, left);
      if (left <= 0) setTile(M, tx, ty, T_USED);
      else setTile(M, tx, ty, T_Q);
    } else {
      setTile(M, tx, ty, T_USED);
      let type = c;
      if (c === 'power') type = P.big ? 'chilli' : 'mango';
      const e = mkEnt({ type, x: tx + 0.5, y: ty + 0.05, id: M.ents.length + 500 });
      e.rise = 1; e.active = true; e.dir = P.face || 1; e.ry = ty + 1;
      M.ents.push(e);
      emit(Gm, { t: 'sprout', x: tx + 0.5, y: ty + 1, item: type });
    }
    emit(Gm, { t: 'bump', x: tx + 0.5, y: ty + 0.5, q: true });
  } else {
    emit(Gm, { t: 'thud', x: tx + 0.5, y: ty + 0.5 });
  }
  // bop whatever stands on the block
  for (let i = 0; i < M.ents.length; i++) {
    const e = M.ents[i]; if (!e.alive) continue;
    if (Math.abs(e.x - (tx + 0.5)) < 0.9 && Math.abs(e.y - (ty + 1)) < 0.3) {
      if (isEnemy(e)) pop(Gm, e, 200);
      else if (isItem(e)) { e.vy = 10; e.dir = e.x < tx + 0.5 ? -1 : 1; }
    }
  }
}

function giveCoin(Gm, x, y, popped) {
  Gm.jalebis++; Gm.total++;
  addScore(Gm, 100);
  emit(Gm, { t: 'coin', x, y, popped: !!popped });
  if (Gm.jalebis >= 100) { Gm.jalebis -= 100; Gm.lives++; emit(Gm, { t: 'oneup', x: Gm.P.x, y: Gm.P.y + 2 }); Gm.pops.push({ x: Gm.P.x, y: Gm.P.y + 2.2, text: '1 UP', t: 0, col: '#7dffb0' }); }
}

function pop(Gm, e, pts) {
  if (!e.alive) return;
  e.alive = false; e.dead = 0.001;
  const v = pts || 100;
  addScore(Gm, v, e.x, e.y + e.h + 0.3);
  Gm.stomps++;
  emit(Gm, { t: 'pop', x: e.x, y: e.y + e.h / 2, kind: e.type, v });
}

function hurt(Gm, why) {
  const P = Gm.P;
  if (P.inv > 0 || P.star > 0 || Gm.phase !== 'play') return;
  if (P.big) {
    setBig(P, false); P.power = 'none'; P.inv = 1.8;
    emit(Gm, { t: 'shrink', x: P.x, y: P.y + 0.8 });
    return;
  }
  die(Gm, why || 'hit');
}
function die(Gm, why) {
  const P = Gm.P;
  if (Gm.phase !== 'play' && Gm.phase !== 'intro') return;
  if (Gm.attract) { Gm.restart = true; return; }
  phase(Gm, 'dead');
  P.vy = why === 'fall' ? 0 : 14; P.vx = 0; P.gliding = false; P.dashT = 0;
  if (why === 'fall') P.y = Math.max(P.y, -2);
  music(null);
  emit(Gm, { t: 'die', x: P.x, y: P.y + 0.5, why });
}

function interact(Gm, dt, inp) {
  const P = Gm.P, M = Gm.map;
  // coins
  for (let i = 0; i < M.coins.length; i++) {
    const c = M.coins[i]; if (c.got) continue;
    if (Math.abs(c.x - P.x) < P.w / 2 + 0.35 && c.y > P.y - 0.35 && c.y < P.y + P.h + 0.35) { c.got = true; c.t = 0; giveCoin(Gm, c.x, c.y, false); }
  }
  const spd = Gm.diff === 'easy' ? 0.85 : Gm.diff === 'hard' ? 1.2 : 1;
  const camX = Gm.cam.x;
  for (let i = M.ents.length - 1; i >= 0; i--) {
    const e = M.ents[i];
    if (!e.alive) { e.dead += dt; if (e.dead > 1.2 && (isEnemy(e) || isItem(e))) M.ents.splice(i, 1); continue; }
    if (!e.active) { if (Math.abs(e.x - P.x) < 15 || Math.abs(e.x - camX) < 13) e.active = true; else continue; }
    e.t += dt;
    if (e.type === 'coconut') walker(Gm, e, dt, 2.6 * spd, false);
    else if (e.type === 'rickshaw') {
      if (e.pause > 0) { e.pause -= dt; e.key += dt * 3; }
      else { walker(Gm, e, dt, 2.1 * spd, true); e.key += dt * 14; if (Math.random() < dt * 0.25) e.pause = 0.8; }
    } else if (e.type === 'pigeon') pigeon(Gm, e, dt, spd);
    else if (e.type === 'ball') ball(Gm, e, dt);
    else if (isItem(e)) item(Gm, e, dt);
    else if (e.type === 'spring') {
      if (P.vy <= 0 && Math.abs(P.x - e.x) < 0.62 + P.w / 2 - 0.2 && P.y <= e.y + e.h + 0.05 && P.prevY >= e.y + e.h - 0.35) {
        P.y = e.y + e.h; P.vy = inp.jumpHeld ? PH.springHeld : PH.springV; P.onGround = false; P.cut = true; P.airDash = true; e.comp = 1;
        emit(Gm, { t: 'spring', x: e.x, y: e.y + e.h, held: inp.jumpHeld });
      }
    } else if (e.type === 'check') {
      if (!e.on && Math.abs(P.x - e.x) < 0.8 && P.y < e.y + 3) {
        e.on = true; Gm.cp = { li: Gm.li, x: e.x, y: e.y };
        emit(Gm, { t: 'check', x: e.x, y: e.y + 2.2 });
        addScore(Gm, 500, e.x, e.y + 3);
      }
    }
    if (!e.alive) continue;
    // enemies against the hero
    if (isEnemy(e) && Gm.phase === 'play' && overlap(P, e)) {
      const fromAbove = P.vy < 0 && P.prevY >= e.y + e.h * 0.45;
      if (P.star > 0 || (P.dashT > 0 && P.fireDash)) { pop(Gm, e, 200); feel(30, 0.5, 0.3); }
      else if (fromAbove) {
        P.combo++;
        const pts = 100 * Math.pow(2, Math.min(4, P.combo - 1));
        pop(Gm, e, pts);
        P.vy = inp.jumpHeld ? PH.stompHeld : PH.stompV; P.cut = false; P.airDash = true; P.y = Math.max(P.y, e.y + e.h * 0.6);
        emit(Gm, { t: 'stomp', x: e.x, y: e.y + e.h, combo: P.combo });
      } else if (P.inv <= 0) hurt(Gm, 'hit');
    }
  }
  // flag pole
  const F = M.flag;
  if (F && P.x > F.x - 0.45 && Gm.phase === 'play') grabFlag(Gm);
  // chimney: press down on top
  if (inp.down && P.onGround && !M.indoor) {
    for (let i = 0; i < M.secrets.length; i++) {
      const s = M.secrets[i];
      if (P.x > s.x0 + 0.35 && P.x < s.x0 + 1.65 && Math.abs(P.y - s.y) < 0.05) {
        Gm.pipeX = s.x0 + 1; Gm.secret = s; phase(Gm, 'pipe-in'); P.vx = 0;
        emit(Gm, { t: 'pipe', x: P.x, y: P.y });
        break;
      }
    }
  }
  if (M.indoor && M.door && P.x > M.door.x - 0.2 && P.y < M.door.y + 1) { phase(Gm, 'door-out'); emit(Gm, { t: 'pipe', x: P.x, y: P.y }); }
}

function walker(Gm, e, dt, speed, ledgeTurn) {
  const M = Gm.map;
  e.vx = e.dir * speed;
  e.vy = Math.max(-20, e.vy - PH.g * dt);
  if (moveX(M, e, e.vx * dt)) e.dir = -e.dir;
  const r = moveY(M, e, e.vy * dt, false);
  e.onGround = r === 1;
  if (r) e.vy = 0;
  if (ledgeTurn && e.onGround) {
    const fx = e.x + e.dir * (e.w / 2 + 0.05);
    if (!groundUnder(M, fx, e.y)) { e.dir = -e.dir; e.x += e.dir * 0.02; }
  }
  if (e.y < -4) { e.alive = false; e.dead = 2; }
  e.rot = (e.rot || 0) - e.vx * dt / (e.h / 2);
}
function pigeon(Gm, e, dt, spd) {
  const P = Gm.P;
  if (e.swoop > 0) {
    e.swoop -= dt;
    const tx = e.sx, ty = e.sy;
    e.x += (tx - e.x) * Math.min(1, dt * 2.2); e.y += (ty - e.y) * Math.min(1, dt * 2.6);
    if (e.swoop <= 0) { e.back = 1.2; }
  } else if (e.back > 0) {
    e.back -= dt; e.y += (e.y0 - e.y) * Math.min(1, dt * 2); e.x += (e.x0 - e.x) * Math.min(1, dt * 1.2);
  } else {
    const ox = e.x;
    e.x = e.x0 + Math.sin(e.t * 0.75 * spd) * 2.6;
    e.y = e.y0 + Math.sin(e.t * 2.3) * 0.35;
    e.dir = e.x > ox ? 1 : -1;
    const near = Math.abs(P.x - e.x) < 5 && P.y < e.y - 1 && P.y > e.y - 6;
    const swoopy = Gm.diff === 'hard' || Gm.li >= 2;
    if (swoopy && near && Math.random() < dt * 0.8) { e.swoop = 1.1; e.sx = P.x; e.sy = P.y + 0.4; emit(Gm, { t: 'coo', x: e.x, y: e.y }); }
  }
}
function ball(Gm, e, dt) {
  const M = Gm.map;
  e.vy -= 30 * dt;
  moveX(M, e, e.vx * dt);
  const r = moveY(M, e, e.vy * dt, false);
  if (r === 1) { if (Math.abs(e.vy) > 3 || e.bounces < 1) { e.vy = 9; e.bounces = (e.bounces || 0) + 1; emit(Gm, { t: 'thud', x: e.x, y: e.y, soft: true }); } else e.vy = 0; }
  e.rot = (e.rot || 0) + dt * 8;
  if (e.t > 3.6 || e.y < -3) { e.alive = false; e.dead = 1.2; emit(Gm, { t: 'puff', x: e.x, y: e.y + 0.3 }); }
}
function item(Gm, e, dt) {
  const M = Gm.map, P = Gm.P;
  if (e.rise > 0) {
    e.y = Math.min(e.ry, e.y + dt * 1.6);
    if (e.y >= e.ry) e.rise = 0;
  } else if (e.type !== 'chilli') {
    const sp = e.type === 'diya' ? 4.2 : e.type === 'life' ? 3.8 : 3.2;
    e.vx = e.dir * sp;
    e.vy = Math.max(-20, e.vy - PH.g * 0.8 * dt);
    if (moveX(M, e, e.vx * dt)) e.dir = -e.dir;
    const r = moveY(M, e, e.vy * dt, false);
    if (r === 1) e.vy = e.type === 'diya' ? 11 : 0; else if (r === -1) e.vy = 0;
    if (e.y < -3) { e.alive = false; e.dead = 2; }
  } else {
    e.vy = Math.max(-20, e.vy - PH.g * dt);
    const r = moveY(M, e, e.vy * dt, false); if (r) e.vy = 0;
  }
  if (overlap(P, e)) {
    e.alive = false; e.dead = 1.5;
    if (e.type === 'mango') { if (!P.big) setBig(P, true); addScore(Gm, 1000, e.x, e.y + 1); emit(Gm, { t: 'power', x: P.x, y: P.y + 1, kind: 'mango' }); }
    else if (e.type === 'chilli') { setBig(P, true); P.power = 'chilli'; addScore(Gm, 1000, e.x, e.y + 1); emit(Gm, { t: 'power', x: P.x, y: P.y + 1, kind: 'chilli' }); }
    else if (e.type === 'diya') { P.star = 10; addScore(Gm, 1000, e.x, e.y + 1); emit(Gm, { t: 'power', x: P.x, y: P.y + 1, kind: 'diya' }); music('star'); }
    else if (e.type === 'life') { Gm.lives++; Gm.pops.push({ x: P.x, y: P.y + 2.2, text: '1 UP', t: 0, col: '#7dffb0' }); emit(Gm, { t: 'oneup', x: P.x, y: P.y + 1 }); }
  }
}

/* ------------------------------------------------------------ secrets */
function enterRoom(Gm) {
  const B = buildRoom(Gm.base.theme, Gm.base.seed * 3 + 1);
  Gm.room = liveMap(B); Gm.map = Gm.room;
  const P = Gm.P; P.x = B.spawn.x; P.y = B.spawn.y; P.vx = 0; P.vy = -2; P.on = null;
  Gm.cam.init = false;
  phase(Gm, 'play');
  emit(Gm, { t: 'room' });
}
function exitRoom(Gm) {
  const s = Gm.secret;
  Gm.map = Gm.main; Gm.room = null;
  const P = Gm.P; P.x = s.ret.x; P.y = s.ret.y - 1.3; P.vx = 0; P.vy = 0; P.on = null;
  Gm.pipeY = s.ret.y; Gm.cam.init = false;
  phase(Gm, 'pipe-up');
  emit(Gm, { t: 'pipe', x: P.x, y: P.y + 1 });
}

/* ------------------------------------------------------------ flag pole and level end */
function grabFlag(Gm) {
  const P = Gm.P, F = Gm.map.flag;
  const h = clamp((P.y - F.y0) / (F.y1 - F.y0), 0, 1);
  const pts = [100, 400, 800, 2000, 5000][Math.min(4, Math.floor(h * 5))];
  addScore(Gm, pts, F.x, P.y + 1);
  P.x = F.x - 0.36; P.vx = 0; P.vy = 0; P.gliding = false; P.dashT = 0; P.face = 1;
  P.flag = 1;
  Gm.goal = { step: 'slide', t: 0, h, flagY: F.y1 - 1.2 };
  phase(Gm, 'goal');
  Gm.slow = 0.55;
  music(null);
  emit(Gm, { t: 'flag', x: F.x, y: P.y, h });
}
function stepGoal(Gm, dt, inp) {
  const P = Gm.P, F = Gm.map.flag, Go = Gm.goal;
  Go.t += dt; P.anim += dt;
  updateWorld(Gm, dt, false);
  if (Go.step === 'slide') {
    P.y = Math.max(F ? F.y0 : P.y, P.y - dt * 7.5);
    if (F) Go.flagY = Math.max(F.y0 + 0.2, Go.flagY - dt * 7.5);
    if (!F || (P.y <= F.y0 + 0.001 && Go.t > 0.5)) { Go.step = 'hop'; Go.t = 0; P.flag = 0; P.vy = 8; P.vx = 3; P.face = 1; emit(Gm, { t: 'jump', x: P.x, y: P.y }); }
  } else if (Go.step === 'hop' || Go.step === 'walk') {
    P.vy -= PH.g * dt;
    moveX(Gm.map, P, P.vx * dt);
    const r = moveY(Gm.map, P, P.vy * dt, false);
    if (r === 1) { P.vy = 0; P.onGround = true; if (Go.step === 'hop') { Go.step = 'walk'; Go.t = 0; music('win'); } }
    if (Go.step === 'walk') {
      P.vx = 3.4; P.walk += 3.4 * dt;
      const door = Gm.map.hut ? Gm.map.hut.door + 0.5 : P.x + 99;
      if (P.x >= door - 0.1 || Go.t > 3.5) { Go.step = 'tally'; Go.t = 0; P.vx = 0; P.inside = 1; Gm.tally = { clock: Gm.clock, bonus: 0 }; }
    }
  } else if (Go.step === 'tally' || Go.step === 'boss') {
    if (!P.inside) { P.vy = Math.max(-20, P.vy - PH.g * dt); const r = moveY(Gm.map, P, P.vy * dt, false); if (r === 1) { P.vy = 0; P.onGround = true; } P.vx = approach(P.vx, 0, dt * 30); moveX(Gm.map, P, P.vx * dt); }
    if (Gm.boss) stepBoss(Gm, dt);
    // time left becomes points, with fireworks overhead
    if (Gm.mode !== 'speed' && Gm.clock > 0) {
      const take = Math.min(Gm.clock, dt * 90);
      Gm.clock -= take; const pts = Math.round(take * 50); Gm.score += pts; Gm.tally.bonus += pts;
      if (Math.random() < dt * 30) emit(Gm, { t: 'tick' });
    }
    Gm.fw -= dt;
    if (Gm.fw <= 0) { Gm.fw = 0.45 + Math.random() * 0.4; emit(Gm, { t: 'firework', x: Gm.cam.x + (Math.random() - 0.5) * 10, y: Gm.cam.y + 2.5 + Math.random() * 3.5 }); }
    const done = Gm.mode === 'speed' || Gm.clock <= 0.01;
    if (done && Go.t > 2.6 && !Gm.trans && !Gm.over) levelCleared(Gm);
  }
}
function levelCleared(Gm) {
  const li = Gm.li;
  if (Gm.attract) { Gm.restart = true; return; }
  SAVE.unlocked = Math.max(SAVE.unlocked, Math.min(9, li + 2));
  SAVE.best[LEVELS[li].id] = Math.max(SAVE.best[LEVELS[li].id] || 0, Gm.score);
  saveGame();
  Gm.levelsDone++;
  if (Gm.mode === 'adventure' && li < LEVELS.length - 1) {
    transition(Gm, () => {
      Gm.li = li + 1; Gm.cp = null; Gm.mapFrom = li; phase(Gm, 'map'); Gm.map = null; Gm.P = null; music('map');
    }, 1.0);
  } else if (Gm.mode === 'adventure') {
    SAVE.cleared++; saveGame();
    phase(Gm, 'ending'); Gm.fw = 0; music('win');
    banner(Gm, 'The kite flies again', 'All nine levels cleared', 6);
  } else finish(Gm, true);
}

/* ------------------------------------------------------------ the monkey boss */
function startBoss(Gm) {
  const ar = Gm.map.arena, M = Gm.map;
  for (let y = ar.floor; y < Math.min(H, ar.floor + 9); y++) setTile(M, ar.gate, y, T_STONE);
  M.gateOn = true;
  const mk = M.ents.find((e) => e.type === 'monkey');
  Gm.boss = { e: mk, intro: 1.6, hits: 0 };
  if (mk) { mk.active = true; mk.state = 'perch'; mk.st = 0; mk.plat = 1; const pl = ar.plats[1]; mk.x = pl.x; mk.y = pl.y; }
  banner(Gm, 'The kite thief', 'Bop the monkey three times', 2.4);
  music('boss');
  emit(Gm, { t: 'gate', x: ar.gate + 0.5, y: ar.floor + 2 });
}
function stepBoss(Gm, dt) {
  const B = Gm.boss, m = B.e, P = Gm.P, ar = Gm.map.arena;
  if (!m) return;
  if (B.intro > 0) B.intro -= dt;
  m.st += dt; m.t += dt;
  const spd = m.speed;
  if (m.state === 'perch') {
    m.face = P.x < m.x ? -1 : 1;
    if (m.st > 1.1 / spd) { m.state = 'throw'; m.st = 0; m.thrown = 0; }
  } else if (m.state === 'throw') {
    m.face = P.x < m.x ? -1 : 1;
    const n = 2 + Math.min(2, B.hits);
    if (m.thrown < n && m.st > 0.35 + m.thrown * 0.55 / spd) {
      m.thrown++;
      const b = mkEnt({ type: 'ball', x: m.x + m.face * 0.6, y: m.y + 1.6, id: 900 + Math.floor(Math.random() * 999) });
      const dx = P.x - b.x, tFlight = 1.05;
      b.vx = clamp(dx / tFlight, -8, 8); b.vy = 9 + Math.random() * 3; b.active = true; b.bounces = 0;
      Gm.map.ents.push(b);
      emit(Gm, { t: 'throw', x: b.x, y: b.y });
    }
    if (m.st > 0.4 + n * 0.55 / spd + 0.4) { m.state = 'leap'; m.st = 0; leapTarget(Gm, m); }
  } else if (m.state === 'leap') {
    const k = clamp(m.st / (0.85 / spd), 0, 1);
    m.x = lerp(m.lx0, m.lx1, k); m.y = lerp(m.ly0, m.ly1, k) + Math.sin(k * Math.PI) * 3.4;
    m.face = m.lx1 > m.lx0 ? 1 : -1;
    if (k >= 1) { emit(Gm, { t: 'land', x: m.x, y: m.y, v: 18, boss: true }); m.state = m.plat < 0 ? 'charge' : 'perch'; m.st = 0; }
  } else if (m.state === 'charge') {
    m.face = P.x < m.x ? -1 : 1;
    m.x += m.face * 4.2 * spd * dt; m.x = clamp(m.x, ar.x0 + 1.5, ar.x1 - 1.5);
    if (m.st > 1.6) { m.state = 'leap'; m.st = 0; leapTarget(Gm, m, true); }
  } else if (m.state === 'dizzy') {
    if (m.st > 1.3) { if (B.hits >= 3) { m.state = 'give'; m.st = 0; giveKite(Gm); } else { m.state = 'leap'; m.st = 0; leapTarget(Gm, m, true); } }
  } else if (m.state === 'give') {
    m.x += dt * 5; m.y += dt * 2.5;
  }
  // contact
  if (m.state !== 'dizzy' && m.state !== 'give' && Gm.phase === 'play') {
    const box = { x: m.x, y: m.y, w: m.w, h: m.h };
    if (overlap(P, box)) {
      if (P.vy < 0 && P.prevY >= m.y + m.h * 0.55) {
        B.hits++; m.state = 'dizzy'; m.st = 0; m.speed = 1 + B.hits * 0.18;
        P.vy = PH.stompHeld; P.cut = false; P.airDash = true;
        addScore(Gm, 2000, m.x, m.y + m.h + 0.5);
        Gm.slow = 0.35;
        emit(Gm, { t: 'bosshit', x: m.x, y: m.y + m.h, hits: B.hits });
      } else if (P.star > 0) { /* the monkey shrugs off the diya */ }
      else hurt(Gm, 'boss');
    }
  }
}
function leapTarget(Gm, m, any) {
  const ar = Gm.map.arena, P = Gm.P;
  let opts = [-1, 0, 1, 2].filter((i) => i !== m.plat);
  if (!any) opts = opts.filter((i) => i >= 0);
  const pick = opts[Math.floor(Math.random() * opts.length)];
  m.lx0 = m.x; m.ly0 = m.y;
  if (pick < 0) { m.lx1 = clamp(P.x + (Math.random() - 0.5) * 4, ar.x0 + 2, ar.x1 - 2); m.ly1 = ar.floor; }
  else { const pl = ar.plats[pick]; m.lx1 = pl.x; m.ly1 = pl.y; }
  m.plat = pick;
  emit(Gm, { t: 'whoop', x: m.x, y: m.y + 1.5 });
}
function giveKite(Gm) {
  const m = Gm.boss.e;
  m.kite = false; Gm.kiteBack = 1;
  phase(Gm, 'bosswin');
  Gm.goal = { step: 'boss', t: 0 };
  Gm.tally = { clock: Gm.clock, bonus: 0 };
  addScore(Gm, 5000, m.x, m.y + 3);
  Gm.P.kite = true;
  music('win');
  banner(Gm, 'Kite rescued!', 'The monkey swaps it for a banana', 3);
  emit(Gm, { t: 'kiteback', x: m.x, y: m.y + 2 });
}

function finish(Gm, won) {
  if (Gm.over) return;
  Gm.over = true;
  music(null); ambience(null);
  const a = ARC, L = LEVELS[Gm.li];
  let score = Gm.score;
  const html = '<p>' + (won ? (Gm.mode === 'adventure' ? 'You brought the kite home across all three worlds.' : 'Level ' + L.id + ', ' + a.esc(L.name) + ', cleared.') : 'The hero ran out of lives on ' + L.id + ', ' + a.esc(L.name) + '.') + '</p>' +
    '<div class="ch-res"><span>Jalebis<b>' + Gm.total + '</b></span><span>Bops<b>' + Gm.stomps + '</b></span><span>Levels<b>' + Gm.levelsDone + '</b></span>' +
    (Gm.mode === 'speed' ? '<span>Time<b>' + fmtTime(Gm.time) + '</b></span>' : '') + '</div>';
  if (Gm.mode === 'speed' && won) score = Math.max(500, Math.round(60000 - Gm.time * 220)) + Gm.total * 20;
  setTimeout(() => {
    if (G !== Gm) return;
    a.over({ eyebrow: won ? 'Well hopped' : 'Out of lives', title: won ? (Gm.mode === 'adventure' ? 'Kite <em>rescued</em>' : 'Level <em>clear</em>') : 'Game <em>over</em>', score, scoreLabel: 'Score', html });
  }, won ? 300 : 120);
}

/* ------------------------------------------------------------ camera (shared by both renderers) */
// Look-ahead in the facing direction, a vertical dead zone that follows the
// ground the hero stands on, critically damped smoothing, level bounds.
function camStep(Gm, dt, aspect) {
  const c = Gm.cam, P = Gm.P, M = Gm.map;
  if (!P || !M) return;
  const portrait = aspect < 0.9;
  const viewW = portrait ? clamp(8.8 + (aspect - 0.45) * 10, 8.5, 12) : 11 * aspect;
  c.viewH = viewW / aspect;
  const speed = Math.abs(P.vx);
  const lookT = (portrait ? 1.4 : 2.6) * P.face * clamp(0.35 + speed / 9, 0, 1.2);
  c.look = lerp(c.look, Gm.phase === 'play' ? lookT : 0, Math.min(1, dt * 1.8));
  if (P.onGround || P.wall || P.y < c.groundY) c.groundY = P.y;
  const off = c.viewH * (portrait ? 0.11 : 0.22) + 0.5;
  let ty = c.groundY + off;
  if (P.y > c.groundY + 4.2) ty = P.y - 1.6 + off;
  if (P.gliding || P.vy < -12) ty = Math.min(ty, P.y + c.viewH * 0.12);
  let tx = P.x + c.look;
  if (Gm.boss && M.arena) { tx = lerp(tx, (M.arena.x0 + M.arena.x1) / 2, 0.75); ty = Math.max(ty, M.arena.floor + 4.5); }
  const half = viewW / 2;
  tx = clamp(tx, half - 0.5, Math.max(half - 0.5, M.w - half + 0.5));
  if (M.indoor) { tx = clamp(P.x, half, Math.max(half, M.w - half)); if (viewW > M.w) tx = M.w / 2; ty = 6; }
  ty = Math.max(ty, c.viewH * 0.36);
  if (!c.init) { c.x = tx; c.y = ty; c.vx = 0; c.vy = 0; c.init = true; c.groundY = P.y; c.snaps = (c.snaps || 0) + 1; }
  const k = Gm.phase === 'play' ? 7 : 4;
  const ax = (tx - c.x) * k * k - 2 * k * (c.vx || 0), ay = (ty - c.y) * 3.2 * 3.2 * 2 - 2 * 3.2 * 1.4 * c.vy;
  c.vx = (c.vx || 0) + ax * dt; c.vy += ay * dt;
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.kick = approach(c.kick, P.dashT > 0 ? 1 : P.gliding ? 0.45 : 0, dt * 5);
  c.roll = lerp(c.roll, -P.vx * 0.0045, Math.min(1, dt * 3));
}

/* ------------------------------------------------------------ audio: music, ambience, effects */
// The shell's synth plays one-shots; music and beds need timed notes, so the
// game keeps its own Web Audio graph and follows the shell's mute.
const AU = { ctx: null, master: null, mus: null, sfx: null, amb: null, noise: null, song: null, step: 0, next: 0, bed: null, glideN: null, ambOn: null };
function auEnsure() {
  if (AU.ctx) return AU.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { AU.ctx = new AC(); } catch (e) { return null; }
  const c = AU.ctx;
  AU.master = c.createGain(); AU.master.gain.value = 0; AU.master.connect(c.destination);
  AU.mus = c.createGain(); AU.mus.gain.value = 0.26; AU.mus.connect(AU.master);
  AU.sfx = c.createGain(); AU.sfx.gain.value = 0.6; AU.sfx.connect(AU.master);
  AU.amb = c.createGain(); AU.amb.gain.value = 0.5; AU.amb.connect(AU.master);
  const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  AU.noise = nb;
  return c;
}
function auUnlock() { const c = auEnsure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
function auFrame() {
  if (!AU.ctx) return;
  const on = !(ARC && ARC.sfx.muted);
  const t = AU.ctx.currentTime;
  AU.master.gain.setTargetAtTime(on ? 0.6 : 0, t, 0.05);
  AU.mus.gain.setTargetAtTime(SETTINGS.music === 'off' ? 0 : 0.26, t, 0.1);
  musicTick();
}
function note(f, dur, o) {
  const c = AU.ctx; if (!c) return;
  o = o || {};
  const t = o.at != null ? o.at : c.currentTime + (o.delay || 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
  if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
  const v = o.vol == null ? 0.16 : o.vol, at = o.attack || 0.006;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = g;
  if (o.lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; g.connect(f2); out = f2; }
  osc.connect(g); out.connect(o.bus || AU.sfx);
  osc.start(t); osc.stop(t + dur + 0.03);
}
function hiss(dur, o) {
  const c = AU.ctx; if (!c) return;
  o = o || {};
  const t = o.at != null ? o.at : c.currentTime + (o.delay || 0);
  const s = c.createBufferSource(); s.buffer = AU.noise; s.loop = true;
  const f = c.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1200, t); f.Q.value = o.q || 0.8;
  if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
  const g = c.createGain(), v = o.vol == null ? 0.2 : o.vol;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(o.bus || AU.sfx);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Songs: a scale, a chord walk and a seeded phrase so each world sounds its own.
const SONGS = {
  roof: { bpm: 140, root: 60, scale: [0, 2, 4, 7, 9, 12, 14, 16], chords: [0, 9, 5, 7], lead: 'square', bass: 'triangle', seed: 5, swing: 0.06, drums: 1 },
  forest: { bpm: 112, root: 57, scale: [0, 2, 3, 5, 7, 9, 10, 12, 14], chords: [0, 5, 3, 10], lead: 'triangle', bass: 'sine', seed: 9, swing: 0.1, drums: 0.6, rain: 1 },
  bazaar: { bpm: 124, root: 62, scale: [0, 1, 4, 5, 7, 8, 11, 12, 13], chords: [0, 0, 5, 7], lead: 'sawtooth', bass: 'triangle', seed: 13, swing: 0.12, drums: 1, tabla: 1 },
  boss: { bpm: 150, root: 62, scale: [0, 1, 4, 5, 7, 8, 11, 12], chords: [0, 1, 0, 8], lead: 'square', bass: 'sawtooth', seed: 21, swing: 0, drums: 1.2, tabla: 1 },
  star: { bpm: 172, root: 67, scale: [0, 2, 4, 7, 9, 12, 14], chords: [0, 5, 0, 7], lead: 'square', bass: 'square', seed: 31, swing: 0, drums: 1.3 },
  map: { bpm: 100, root: 60, scale: [0, 2, 4, 7, 9, 12], chords: [0, 5, 7, 0], lead: 'triangle', bass: 'sine', seed: 41, swing: 0.08, drums: 0.4 }
};
const PHR = {};
function phraseOf(name) {
  if (PHR[name]) return PHR[name];
  const S = SONGS[name], r = rng(S.seed), mel = [];
  const motif = []; let d = 2;
  for (let i = 0; i < 8; i++) { if (r() < 0.22 && i % 2) motif.push(-1); else { d = clamp(d + Math.floor(r() * 5) - 2, 0, S.scale.length - 1); motif.push(d); } }
  const answer = motif.map((v, i) => (v < 0 ? v : clamp(v + (i > 4 ? 1 : 0) + (r() < 0.3 ? 1 : 0), 0, S.scale.length - 1)));
  const bridge = []; d = 4;
  for (let i = 0; i < 8; i++) { if (r() < 0.18) bridge.push(-1); else { d = clamp(d + (r() < 0.5 ? 1 : -1) * (1 + Math.floor(r() * 2)), 0, S.scale.length - 1); bridge.push(d); } }
  const end = motif.slice(0, 6).concat([0, -1]);
  [motif, answer, motif, end, bridge, bridge.map((v) => (v < 0 ? v : Math.max(0, v - 1))), motif, end].forEach((p) => mel.push.apply(mel, p));
  PHR[name] = mel;
  return mel;
}
function music(name) {
  if (G && G.attract) return;
  if (AU.song === name) return;
  AU.song = name; AU.step = 0;
  if (AU.ctx) AU.next = AU.ctx.currentTime + 0.08;
  if (name === 'win') { fanfare(); AU.song = null; }
  ambience(name && THEMES[name] ? name : name === 'boss' ? 'bazaar' : AU.ambOn);
}
function fanfare() {
  if (!AU.ctx) return;
  const seq = [72, 76, 79, 84, 79, 84, 88];
  seq.forEach((n, i) => { note(MIDI(n), i === seq.length - 1 ? 0.7 : 0.16, { type: 'square', vol: 0.12, delay: i * 0.12, bus: AU.mus, lp: 4000 }); note(MIDI(n - 12), 0.18, { type: 'triangle', vol: 0.14, delay: i * 0.12, bus: AU.mus }); });
}
function musicTick() {
  const c = AU.ctx, name = AU.song;
  if (!c || !name || !SONGS[name]) return;
  const S = SONGS[name], mel = phraseOf(name), spb = 60 / S.bpm / 2;
  if (AU.next < c.currentTime) AU.next = c.currentTime + 0.05;
  while (AU.next < c.currentTime + 0.22) {
    const st = AU.step, at = AU.next + (st % 2 ? S.swing * spb : 0);
    const bar = Math.floor(st / 8) % 4, chord = S.root + S.chords[bar] - 12;
    const deg = mel[st % mel.length];
    if (deg >= 0) note(MIDI(S.root + S.scale[deg]), spb * 0.9, { at, type: S.lead, vol: name === 'star' ? 0.085 : 0.07, lp: S.lead === 'sawtooth' ? 2200 : 5200, vib: S.lead === 'sawtooth' ? 5.5 : 0, bus: AU.mus });
    if (st % 2 === 0) note(MIDI(chord + (st % 8 === 4 ? 7 : 0)), spb * 1.7, { at, type: S.bass, vol: 0.13, lp: 900, bus: AU.mus });
    if (st % 4 === 2) note(MIDI(chord + 12 + 4 * (S.scale[2] === 4 ? 1 : 0.75)), spb * 0.5, { at, type: 'triangle', vol: 0.04, bus: AU.mus });
    if (S.drums) {
      if (st % 8 === 0 || (st % 8 === 6 && S.drums > 0.9)) note(130, 0.16, { at, type: 'sine', slide: 42, vol: 0.26 * S.drums, bus: AU.mus });
      if (st % 8 === 4) hiss(0.12, { at, freq: 1800, filter: 'bandpass', vol: 0.09 * S.drums, bus: AU.mus });
      if (st % 2 === 1) hiss(0.04, { at, freq: 7000, filter: 'highpass', vol: 0.025 * S.drums, bus: AU.mus });
      if (S.tabla && (st % 4 === 3 || st % 8 === 2)) note(st % 4 === 3 ? 340 : 190, 0.14, { at, type: 'sine', slide: st % 4 === 3 ? 300 : 260, vol: 0.12, bus: AU.mus });
    }
    AU.next += spb; AU.step++;
  }
}
// A looping bed per world: wind over the roofs, rain in the forest, a crowd in the bazaar.
function ambience(theme) {
  if (!AU.ctx) { AU.ambOn = theme; return; }
  if (AU.ambOn === theme && AU.bed) return;
  AU.ambOn = theme;
  const c = AU.ctx;
  if (AU.bed) { const old = AU.bed; old.g.gain.setTargetAtTime(0, c.currentTime, 0.3); setTimeout(() => { try { old.s.stop(); old.l && old.l.stop(); } catch (e) { /* stopped */ } }, 1500); AU.bed = null; }
  if (!theme) return;
  const s = c.createBufferSource(); s.buffer = AU.noise; s.loop = true;
  const f = c.createBiquadFilter(), g = c.createGain();
  if (theme === 'roof') { f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0; g.gain.setTargetAtTime(0.18, c.currentTime, 1); }
  else if (theme === 'forest') { f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.4; g.gain.value = 0; g.gain.setTargetAtTime(0.16, c.currentTime, 1); }
  else { f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7; g.gain.value = 0; g.gain.setTargetAtTime(0.14, c.currentTime, 1); }
  let l = null;
  if (theme !== 'forest') { l = c.createOscillator(); const lg = c.createGain(); l.frequency.value = theme === 'roof' ? 0.13 : 0.6; lg.gain.value = theme === 'roof' ? 160 : 260; l.connect(lg); lg.connect(f.frequency); l.start(); }
  s.connect(f); f.connect(g); g.connect(AU.amb); s.start();
  AU.bed = { s, g, l };
}
function glideSound(on, v) {
  const c = AU.ctx; if (!c) return;
  if (on && !AU.glideN) {
    const s = c.createBufferSource(); s.buffer = AU.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(AU.sfx); s.start();
    AU.glideN = { s, f, g };
  }
  if (AU.glideN) {
    const t = c.currentTime;
    AU.glideN.g.gain.setTargetAtTime(on ? 0.05 + v * 0.01 : 0, t, 0.08);
    AU.glideN.f.frequency.setTargetAtTime(700 + v * 90, t, 0.1);
  }
}

// Haptics: a phone buzz from the shell, and controller rumble where it exists.
function feel(ms, strong, weak) {
  const a = ARC; if (!a || (G && G.attract)) return;
  try { a.buzz(ms); } catch (e) { /* no vibration */ }
  if (a.prefs.haptics === 'off' || !a.gamepad || !navigator.getGamepads) return;
  try {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected && p.vibrationActuator && p.vibrationActuator.playEffect) {
        p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(strong, 0, 1), weakMagnitude: clamp(weak, 0, 1) }).catch(() => {});
        break;
      }
    }
  } catch (e) { /* no rumble */ }
}

// Sound and touch feel for each thing that happens in the game.
function react(e) {
  const P = G && G.P;
  switch (e.t) {
    case 'jump': note(e.big ? 330 : 420, 0.16, { type: 'square', slide: e.big ? 620 : 820, vol: 0.09, lp: 3200 }); break;
    case 'walljump': note(500, 0.14, { type: 'square', slide: 900, vol: 0.08 }); hiss(0.1, { freq: 3000, vol: 0.06 }); feel(14, 0.2, 0.4); break;
    case 'land': if (e.boss) { note(70, 0.3, { type: 'sine', slide: 40, vol: 0.3 }); feel(50, 0.8, 0.4); if (ARC) ARC.shake = Math.max(ARC.shake, 7); } else if (e.v > 14) { hiss(0.09, { freq: 500, filter: 'lowpass', vol: 0.08 * Math.min(1.5, e.v / 20) }); feel(Math.round(clamp(e.v, 8, 30)), 0.15, 0.25); } break;
    case 'step': hiss(0.03, { freq: G && G.base && G.base.theme === 'forest' ? 900 : 2400, filter: 'bandpass', vol: 0.025 }); break;
    case 'coin': note(1318, 0.07, { type: 'square', vol: 0.06, lp: 6000 }); note(1976, 0.22, { type: 'square', vol: 0.06, delay: 0.06, lp: 6000 }); break;
    case 'bump': note(e.q ? 180 : 140, 0.12, { type: 'triangle', slide: 90, vol: 0.18 }); feel(12, 0.2, 0.3); break;
    case 'thud': note(110, 0.1, { type: 'triangle', slide: 70, vol: e.soft ? 0.06 : 0.12 }); break;
    case 'brick': hiss(0.25, { freq: 900, filter: 'lowpass', vol: 0.28, slide: 200 }); note(160, 0.18, { type: 'square', slide: 60, vol: 0.1 }); feel(28, 0.6, 0.4); if (ARC) ARC.shake = Math.max(ARC.shake, 3); break;
    case 'sprout': [0, 4, 7, 12].forEach((n, i) => note(MIDI(64 + n), 0.09, { type: 'square', vol: 0.05, delay: i * 0.05 })); break;
    case 'reveal': note(880, 0.25, { type: 'triangle', vol: 0.08, slide: 1760 }); break;
    case 'power':
      if (e.kind === 'diya') [0, 4, 7, 11, 14, 19].forEach((n, i) => note(MIDI(72 + n), 0.12, { type: 'square', vol: 0.06, delay: i * 0.06 }));
      else [0, 7, 12, 16, 19, 24].forEach((n, i) => note(MIDI(60 + n), 0.1, { type: e.kind === 'chilli' ? 'sawtooth' : 'square', vol: 0.06, delay: i * 0.06, lp: 3500 }));
      feel(40, 0.5, 0.6); break;
    case 'shrink': [12, 7, 0, -5].forEach((n, i) => note(MIDI(64 + n), 0.11, { type: 'square', vol: 0.07, delay: i * 0.07 })); feel(80, 1, 0.6); if (ARC) ARC.shake = Math.max(ARC.shake, 6); break;
    case 'pop': note(620, 0.08, { type: 'square', slide: 1240, vol: 0.08 }); hiss(0.16, { freq: 3800, vol: 0.06 }); if (e.kind === 'pigeon') note(340, 0.2, { type: 'triangle', slide: 240, vol: 0.06, delay: 0.05 }); break;
    case 'stomp': note(320 + 80 * Math.min(5, e.combo), 0.1, { type: 'square', slide: 700 + 100 * e.combo, vol: 0.09 }); feel(Math.min(45, 18 + 6 * e.combo), 0.35, 0.5); if (ARC) ARC.shake = Math.max(ARC.shake, 2 + e.combo); break;
    case 'spring': note(220, 0.35, { type: 'sine', slide: 880, vol: 0.18, vib: 18 }); feel(30, 0.4, 0.6); break;
    case 'dash': hiss(0.22, { freq: e.fire ? 900 : 2000, slide: e.fire ? 300 : 5000, filter: 'bandpass', vol: e.fire ? 0.22 : 0.12 }); if (e.fire) note(90, 0.3, { type: 'sawtooth', slide: 50, vol: 0.08 }); feel(e.fire ? 34 : 16, e.fire ? 0.7 : 0.2, 0.5); break;
    case 'glide': hiss(0.3, { freq: 1500, slide: 600, vol: 0.06 }); break;
    case 'check': [0, 4, 7, 12, 16].forEach((n, i) => note(MIDI(67 + n), 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.07 })); feel(30, 0.3, 0.4); break;
    case 'die': music(null); [0, -2, -3, -5, -7, -12].forEach((n, i) => note(MIDI(67 + n), 0.16, { type: 'square', vol: 0.08, delay: 0.15 + i * 0.13, lp: 3000 })); feel(120, 1, 0.8); if (ARC) ARC.shake = Math.max(ARC.shake, 9); break;
    case 'flag': note(1600, 0.9, { type: 'triangle', slide: 300, vol: 0.1 }); feel(40, 0.4, 0.6); break;
    case 'firework': hiss(0.5, { freq: 700, filter: 'lowpass', vol: 0.22, slide: 120, delay: 0.02 }); hiss(0.9, { freq: 6000, filter: 'highpass', vol: 0.04, delay: 0.12 }); feel(18, 0.25, 0.1); break;
    case 'tick': note(1900, 0.04, { type: 'square', vol: 0.025 }); break;
    case 'pipe': note(200, 0.4, { type: 'square', slide: 70, vol: 0.08 }); break;
    case 'room': [0, 3, 7, 10].forEach((n, i) => note(MIDI(60 + n), 0.14, { type: 'triangle', vol: 0.07, delay: i * 0.08 })); break;
    case 'oneup': [0, 4, 7, 12, 7, 12].forEach((n, i) => note(MIDI(76 + n), 0.11, { type: 'square', vol: 0.06, delay: i * 0.07 })); feel(40, 0.3, 0.5); break;
    case 'hurry': [0, 0, 7].forEach((n, i) => note(MIDI(72 + n), 0.12, { type: 'square', vol: 0.07, delay: i * 0.14 })); break;
    case 'coo': note(300, 0.25, { type: 'sine', slide: 220, vol: 0.06, vib: 9 }); break;
    case 'throw': hiss(0.12, { freq: 2600, vol: 0.06 }); break;
    case 'whoop': note(400, 0.2, { type: 'triangle', slide: 900, vol: 0.08, vib: 14 }); note(900, 0.2, { type: 'triangle', slide: 500, vol: 0.06, delay: 0.18 }); break;
    case 'bosshit': note(300, 0.35, { type: 'square', slide: 80, vol: 0.12 }); note(900, 0.25, { type: 'triangle', slide: 1500, vol: 0.06, delay: 0.1 }); feel(90, 1, 0.8); if (ARC) ARC.shake = Math.max(ARC.shake, 10); break;
    case 'gate': note(80, 0.5, { type: 'sawtooth', slide: 50, vol: 0.12, lp: 600 }); feel(60, 0.8, 0.3); if (ARC) ARC.shake = Math.max(ARC.shake, 6); break;
    case 'steal': note(700, 0.3, { type: 'triangle', slide: 1200, vol: 0.1, vib: 20 }); note(300, 0.4, { type: 'square', slide: 160, vol: 0.06, delay: 0.25 }); break;
    case 'kiteback': [0, 5, 9, 12, 17, 21, 24].forEach((n, i) => note(MIDI(65 + n), 0.15, { type: 'triangle', vol: 0.08, delay: i * 0.07 })); feel(60, 0.6, 0.6); break;
    case 'puff': hiss(0.1, { freq: 2000, vol: 0.03 }); break;
    default: break;
  }
  if (e.t === 'dash' || e.t === 'glide') { /* the glide bed follows below */ }
  if (P && e.t === 'die') glideSound(false, 0);
}

/* ------------------------------------------------------------ input: keyboard, controller, touch */
const SETTINGS = { layout: 'thumbs', music: 'on' };
const TOUCH = { jumpHeld: false, jumpPressed: false, dashPressed: false, down: false, ids: new Map(), holdT: 0 };
function installTouch(a) {
  // Capture on the stage, before the shell's own canvas listeners: on the
  // right of the screen a thumb jumps (and the shell must not steer with it);
  // with one finger, a tap or an upward flick jumps and a sideways flick dashes.
  const st = a.stage;
  const live = () => a.state === 'play' && a.touchMode && a.touchStyle === 'gesture';
  st.addEventListener('pointerdown', (e) => {
    if (e.target !== a.canvas || e.pointerType === 'mouse' || !live()) return;
    const r = a.canvas.getBoundingClientRect(), nx = (e.clientX - r.left) / Math.max(1, r.width);
    auUnlock();
    if (SETTINGS.layout === 'thumbs' && nx > 0.55) {
      TOUCH.ids.set(e.pointerId, { kind: 'jump', x: e.clientX, y: e.clientY, t: performance.now() });
      TOUCH.jumpPressed = true; TOUCH.jumpHeld = true;
      e.stopPropagation();
      try { a.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      return;
    }
    TOUCH.ids.set(e.pointerId, { kind: SETTINGS.layout === 'one' ? 'one' : 'move', x: e.clientX, y: e.clientY, t: performance.now(), jumped: false, dashed: false });
  }, true);
  st.addEventListener('pointermove', (e) => {
    const s = TOUCH.ids.get(e.pointerId); if (!s) return;
    if (s.kind === 'jump') { e.stopPropagation(); return; }
    const dx = e.clientX - s.x, dy = e.clientY - s.y, el = performance.now() - s.t;
    if (s.kind === 'one') {
      if (!s.jumped && dy < -34 && Math.abs(dy) > Math.abs(dx) * 0.8) { s.jumped = true; TOUCH.jumpPressed = true; TOUCH.jumpHeld = true; }
      if (!s.dashed && el < 190 && Math.abs(dx) > 80) { s.dashed = true; TOUCH.dashPressed = true; }
    }
    TOUCH.down = dy > 46 && Math.abs(dx) < 50;
  }, true);
  const up = (e) => {
    const s = TOUCH.ids.get(e.pointerId); if (!s) return;
    TOUCH.ids.delete(e.pointerId);
    if (s.kind === 'jump') { e.stopPropagation(); TOUCH.jumpHeld = Array.from(TOUCH.ids.values()).some((v) => v.kind === 'jump' || v.jumped); return; }
    const dx = e.clientX - s.x, dy = e.clientY - s.y, el = performance.now() - s.t;
    if (s.kind === 'one' && !s.jumped && el < 260 && Math.hypot(dx, dy) < 18) { TOUCH.jumpPressed = true; TOUCH.holdT = 0.2; }
    TOUCH.down = false;
    TOUCH.jumpHeld = Array.from(TOUCH.ids.values()).some((v) => v.kind === 'jump' || v.jumped);
  };
  st.addEventListener('pointerup', up, true);
  st.addEventListener('pointercancel', up, true);
}
function readInput(a, dt) {
  const I = a.input, ax = I.axis();
  const gest = a.touchMode && a.touchStyle === 'gesture';
  let x = ax.x;
  const keysJ = ['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyJ'];
  if (TOUCH.holdT > 0) TOUCH.holdT -= dt;
  const inp = {
    x,
    jumpPressed: I.hit.apply(null, keysJ) || TOUCH.jumpPressed,
    jumpHeld: I.down.apply(null, keysJ) || TOUCH.jumpHeld || TOUCH.holdT > 0,
    dashPressed: I.hit('KeyX', 'KeyK') || TOUCH.dashPressed,
    glideHeld: I.down('KeyG', 'KeyC'),
    run: I.down('ShiftLeft', 'ShiftRight', 'KeyX', 'KeyK'),
    down: I.down('ArrowDown', 'KeyS') || ax.y > 0.6 || TOUCH.down,
    any: false
  };
  if (gest) {
    const gz = I.gesture;
    if (gz.active && Math.abs(gz.dx) > I.dragRadius * 0.82) inp.run = true;
    if (gz.active && gz.dy > 46 && Math.abs(gz.dx) < 40) inp.down = true;
  }
  if (I.stick.active && Math.hypot(I.stick.x, I.stick.y) > 0.86) inp.run = true;
  if (I.pad.active && Math.abs(I.pad.x) > 0.9) inp.run = inp.run || false;
  inp.any = inp.jumpPressed || inp.dashPressed || I.hit('Enter', 'NumpadEnter', 'KeyX', 'KeyK') || !!I.tap() || !!I.swipe();
  TOUCH.jumpPressed = false; TOUCH.dashPressed = false;
  return inp;
}
const NOINP = { x: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, glideHeld: false, run: false, down: false, any: false };

// A simple player for the menu backdrop and for tests: run right, hop gaps,
// walls and enemies, glide across long drops.
function botInput(Gm) {
  const P = Gm.P, M = Gm.map, inp = Object.assign({}, NOINP);
  if (!P || !M) return inp;
  if (P.onGround || Gm.botDir == null) Gm.botDir = 1;
  inp.x = Gm.botDir; inp.run = true;
  const tall = P.wall && (P.wall > 0 || Gm.botDir < 0) && isSolid(tileAt(M, Math.floor(P.x + P.wall * 0.9), Math.floor(P.y + 2.6)));
  const was = Gm.botWall; Gm.botWall = tall ? 1 : 0;
  if (tall && !was) { inp.jumpPressed = true; inp.jumpHeld = true; Gm.botDir = -P.wall; return inp; }
  if (!P.onGround && Gm.botDir < 0) { inp.jumpHeld = true; return inp; }
  const ahead = (d) => groundUnder(M, P.x + d, P.y) || groundUnder(M, P.x + d, P.y - 1) || groundUnder(M, P.x + d, P.y - 2);
  const wall = isSolid(tileAt(M, Math.floor(P.x + 0.9), Math.floor(P.y + 0.3))) || isSolid(tileAt(M, Math.floor(P.x + 1.6), Math.floor(P.y + 0.3)));
  let foe = false;
  for (let i = 0; i < M.ents.length; i++) { const e = M.ents[i]; if (e.alive && isEnemy(e) && e.x > P.x && e.x - P.x < 2.6 && Math.abs(e.y - P.y) < 1.6) foe = true; }
  if (P.onGround && (!ahead(1.6) || wall || foe)) inp.jumpPressed = true;
  inp.jumpHeld = inp.jumpPressed || (!P.onGround && (P.vy > 0 || !ahead(0.5)));
  Gm.botHold = inp.jumpHeld;
  return inp;
}

/* ------------------------------------------------------------ HUD (drawn on the 2D overlay) */
const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif';
const INK = '#fff6e8', DIM = '#c8bfae', GOLD = '#ffc34d', ORANGE = '#ff8a3d';
function txt(ctx, s, x, y, size, color, align, weight, fam) {
  ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function txtS(ctx, s, x, y, size, color, align, weight, fam) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; txt(ctx, s, x, y, size, color, align, weight, fam); ctx.restore();
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function plate(ctx, x, y, w, h, r) { rr(ctx, x, y, w, h, r || 10); ctx.fillStyle = 'rgba(14,10,8,0.5)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,240,220,0.12)'; ctx.lineWidth = 1; ctx.stroke(); }
function jalebiIcon(ctx, x, y, r) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = r * 0.34;
  ctx.strokeStyle = '#e8781e'; ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU * 2.2, rr2 = r * (0.15 + 0.85 * i / 40); const px = x + Math.cos(a) * rr2, py = y + Math.sin(a) * rr2; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.stroke(); ctx.strokeStyle = 'rgba(255,220,140,0.75)'; ctx.lineWidth = r * 0.1; ctx.stroke(); ctx.restore();
}
function kiteIcon(ctx, x, y, s, col) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = col || '#ff5a6e'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.72, 0); ctx.lineTo(0, s * 0.9); ctx.lineTo(-s * 0.72, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.72, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, s * 0.9); ctx.quadraticCurveTo(s * 0.4, s * 1.3, 0, s * 1.6); ctx.stroke();
  ctx.restore();
}
const _pr = { x: 0, y: 0, ok: true };
function drawHUD(ctx, a, Gm, R) {
  const w = a.w, h = a.h, pad = a.hudPad(), small = w < 560, sc = small ? 0.86 : 1, rm = a.reducedMotion;
  const P = Gm.P;
  // letterbox bars for cut-aways
  const lb = smooth01(Gm.letter) * Math.min(h * 0.1, 80);
  if (lb > 0.5) { ctx.fillStyle = '#050403'; ctx.fillRect(0, 0, w, lb); ctx.fillRect(0, h - lb, w, lb); }
  if (Gm.phase === 'map') { drawMapHUD(ctx, a, Gm); return; }
  if (!P) return;
  // score pops over the world
  for (let i = 0; i < Gm.pops.length; i++) {
    const p = Gm.pops[i]; R.project(p.x, p.y + (rm ? 0 : p.t * 1.2), _pr); if (!_pr.ok) continue;
    ctx.globalAlpha = clamp(1.4 - p.t * 1.3, 0, 1);
    txtS(ctx, p.text, _pr.x, _pr.y, (p.text.length > 4 ? 15 : 13) * sc, p.col, 'center', '700');
    ctx.globalAlpha = 1;
  }
  if (Gm.phase === 'intro' || Gm.phase === 'ending' || Gm.attract) {
    if (Gm.phase === 'intro') {
      const k = clamp(Gm.pt / 0.5, 0, 1) * clamp((2.6 - Gm.pt) / 0.5 + (Gm.cut ? 1.2 : 0), 0, 1), L = LEVELS[Gm.li];
      ctx.globalAlpha = k;
      txtS(ctx, 'WORLD ' + L.id, w / 2, h * 0.36, 13 * sc, GOLD, 'center', '700');
      txtS(ctx, L.name, w / 2, h * 0.36 + 34 * sc, 34 * sc, INK, 'center', '500', F_DISP);
      txtS(ctx, THEMES[L.theme].name, w / 2, h * 0.36 + 66 * sc, 12 * sc, DIM, 'center', '600');
      ctx.globalAlpha = 1;
      if (Gm.cut && Gm.cut.t > 1.2) txtS(ctx, 'Hey! That monkey took the kite!', w / 2, h * 0.62, 14 * sc, '#ffd0a0', 'center', '700');
    }
    if (Gm.phase !== 'ending') { drawBanner(ctx, a, Gm, sc); return; }
  }
  // top-left: lives and jalebis
  const pw = 150 * sc, ph = 58 * sc;
  plate(ctx, pad.left, pad.top, pw, ph, 12);
  kiteIcon(ctx, pad.left + 18 * sc, pad.top + 18 * sc, 9 * sc, P.kite ? '#ff5a6e' : 'rgba(255,90,110,0.35)');
  txt(ctx, 'x ' + Math.max(0, Gm.lives), pad.left + 34 * sc, pad.top + 19 * sc, 14 * sc, INK, 'left', '700');
  jalebiIcon(ctx, pad.left + 18 * sc, pad.top + 41 * sc, 8 * sc);
  txt(ctx, 'x ' + pad2(Gm.jalebis), pad.left + 34 * sc, pad.top + 41 * sc, 14 * sc, GOLD, 'left', '700');
  // power badge
  const pwr = P.star > 0 ? 'DIYA ' + Math.ceil(P.star) : P.power === 'chilli' ? 'CHILLI' : P.big ? 'MANGO' : '';
  if (pwr) { const bx = pad.left + 92 * sc, by = pad.top + 12 * sc; rr(ctx, bx, by, 50 * sc, 18 * sc, 9 * sc); ctx.fillStyle = P.star > 0 ? 'rgba(255,214,90,0.85)' : P.power === 'chilli' ? 'rgba(230,60,40,0.85)' : 'rgba(255,170,40,0.85)'; ctx.fill(); txt(ctx, pwr, bx + 25 * sc, by + 9.5 * sc, 9 * sc, '#1a0f08', 'center', '800'); }
  // top-right: score and clock
  const sw = 150 * sc, sx = w - pad.right - sw;
  plate(ctx, sx, pad.top, sw, ph, 12);
  txt(ctx, String(Gm.score).padStart(7, '0'), sx + sw - 12 * sc, pad.top + 19 * sc, 15 * sc, INK, 'right', '700');
  const lowT = Gm.mode !== 'speed' && Gm.clock < 60, clk = Gm.mode === 'speed' ? fmtTime(Gm.clock) : fmtClock(Gm.clock);
  txt(ctx, (Gm.mode === 'speed' ? 'TIME ' : 'SUN ') + clk, sx + sw - 12 * sc, pad.top + 41 * sc, 12 * sc, lowT && (rm || Math.floor(a.time * 3) % 2 === 0) ? '#ff7a5a' : DIM, 'right', '600');
  // middle: level name (only when there is room)
  const L = LEVELS[Gm.li];
  if (w - (pw + sw) - pad.left - pad.right > 160) {
    plate(ctx, w / 2 - 70 * sc, pad.top, 140 * sc, 30 * sc, 10);
    txt(ctx, (Gm.map && Gm.map.indoor ? 'SECRET ' : L.id + ' ') + (Gm.map && Gm.map.indoor ? 'ATTIC' : THEMES[L.theme].short.toUpperCase()), w / 2, pad.top + 15 * sc, 11 * sc, DIM, 'center', '700');
  }
  // boss hit pips
  if (Gm.boss) {
    const left = 3 - Gm.boss.hits, by = pad.top + ph + 12 * sc;
    plate(ctx, w / 2 - 74 * sc, by, 148 * sc, 30 * sc, 10);
    txt(ctx, 'MONKEY', w / 2 - 62 * sc, by + 15 * sc, 10 * sc, DIM, 'left', '700');
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(w / 2 + 18 * sc + i * 18 * sc, by + 15 * sc, 6 * sc, 0, TAU); ctx.fillStyle = i < left ? '#ff7a3d' : 'rgba(255,255,255,0.15)'; ctx.fill(); }
  }
  // the down arrow over a chimney you can enter
  const M = Gm.map;
  if (M && !M.indoor && Gm.phase === 'play') for (let i = 0; i < M.secrets.length; i++) {
    const s = M.secrets[i];
    if (Math.abs(P.x - (s.x0 + 1)) < 2.5 && Math.abs(P.y - s.y) < 2.5) {
      R.project(s.x0 + 1, s.y + 1.4 + (rm ? 0 : Math.abs(Math.sin(a.time * 4)) * 0.3), _pr);
      if (_pr.ok) { ctx.fillStyle = 'rgba(255,214,120,0.95)'; ctx.beginPath(); ctx.moveTo(_pr.x - 9, _pr.y - 6); ctx.lineTo(_pr.x + 9, _pr.y - 6); ctx.lineTo(_pr.x, _pr.y + 6); ctx.closePath(); ctx.fill(); txtS(ctx, a.touchMode ? 'drag down' : a.gamepad ? 'down' : 'press Down', _pr.x, _pr.y - 18, 10, INK, 'center', '700'); }
    }
  }
  // tally at the end of a level
  if (Gm.tally && (Gm.phase === 'goal' || Gm.phase === 'bosswin')) {
    const by = h * 0.3;
    plate(ctx, w / 2 - 120 * sc, by - 30 * sc, 240 * sc, 74 * sc, 14);
    txt(ctx, 'LEVEL CLEAR', w / 2, by - 12 * sc, 12 * sc, GOLD, 'center', '700');
    txt(ctx, 'Sun bonus +' + Gm.tally.bonus, w / 2, by + 12 * sc, 15 * sc, INK, 'center', '700');
    txt(ctx, 'Score ' + Gm.score, w / 2, by + 32 * sc, 11 * sc, DIM, 'center', '600');
  }
  drawBanner(ctx, a, Gm, sc);
  // a reminder of the touch controls for the first seconds
  if (a.touchMode && a.touchStyle !== 'pads' && Gm.phase === 'play' && Gm.time < 6 && Gm.li === Gm.cfg.li && !Gm.attract) {
    const al = clamp((6 - Gm.time) / 1.2, 0, 1), y = pad.top + 96 * sc;
    ctx.globalAlpha = al;
    plate(ctx, w / 2 - 150, y - 24, 300, 54, 12);
    const one = SETTINGS.layout === 'one';
    txt(ctx, one ? 'Drag to move, tap or flick up to jump' : 'Drag on the left to move', w / 2, y - 6, 12, INK, 'center', '700');
    txt(ctx, one ? 'Keep holding to glide, flick sideways to dash' : 'Jump on the right, hold it to glide', w / 2, y + 14, 11, DIM, 'center', '600');
    ctx.globalAlpha = 1;
  }
  if (Gm.phase === 'dead' && Gm.pt > 0.4) { txtS(ctx, Gm.lives > 0 ? 'Oops!' : 'Last kite down', w / 2, h * 0.4, 30 * sc, INK, 'center', '500', F_DISP); }
}
function drawBanner(ctx, a, Gm, sc) {
  if (!(Gm.bannerT > 0 && Gm.banner)) return;
  const w = a.w, h = a.h;
  const y = h * 0.24;
  ctx.globalAlpha = clamp(Gm.bannerT / 0.4, 0, 1);
  txtS(ctx, Gm.banner.text, w / 2, y, 26 * sc, INK, 'center', '500', F_DISP);
  if (Gm.banner.sub) txtS(ctx, Gm.banner.sub, w / 2, y + 28 * sc, 12 * sc, GOLD, 'center', '700');
  ctx.globalAlpha = 1;
}
function drawMapHUD(ctx, a, Gm) {
  const w = a.w, h = a.h, sc = w < 560 ? 0.86 : 1, L = LEVELS[Gm.li];
  txtS(ctx, 'WORLD MAP', w / 2, h * 0.14, 12 * sc, GOLD, 'center', '700');
  txtS(ctx, THEMES[L.theme].name, w / 2, h * 0.14 + 30 * sc, 28 * sc, INK, 'center', '500', F_DISP);
  txtS(ctx, 'Next: ' + L.id + ' ' + L.name, w / 2, h * 0.14 + 58 * sc, 13 * sc, DIM, 'center', '600');
  txtS(ctx, 'Lives ' + Math.max(0, Gm.lives) + '   Score ' + Gm.score, w / 2, h * 0.86, 12 * sc, INK, 'center', '700');
  if (Gm.pt > 0.8) txtS(ctx, a.touchMode ? 'Tap Jump to go' : a.gamepad ? 'Press A to go' : 'Press Space to go', w / 2, h * 0.86 + 22 * sc, 11 * sc, DIM, 'center', '600');
}

/* ------------------------------------------------------------ menu, glue, the game loop */
const MENU_CSS =
  '.ch-prog{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 12px;font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.ch-prog span{display:block;padding:4px 8px;border:1px solid var(--rule-strong);border-radius:9px;background:var(--bg-deep)}' +
  '.ch-prog b{display:block;font-size:12px;color:var(--ink);font-weight:500;letter-spacing:0;text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ch-prog span.lock b{color:var(--ink-mute)}' +
  '.ch-res{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 10px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}.ch-res b{display:block;font-size:16px;color:var(--ink);font-weight:500}' +
  '.arc-app.ch-one.gestures .arc-pad.keep{display:none}' +
  '.arc-card:has(.ch-prog) p{font-size:14px;margin-bottom:10px}.arc-card:has(.ch-prog){padding-bottom:0}.arc-card:has(.ch-prog) .arc-actions{padding-bottom:clamp(14px,3vw,22px);box-shadow:0 -14px 14px var(--bg-elev)}' +
  '@media (pointer:fine){.arc-card:has(.ch-prog) .arc-seg button{min-height:34px;padding:0 12px;font-size:13px}.arc-card:has(.ch-prog) .arc-opts{gap:7px;margin-bottom:6px}}' +
  '@media (max-width:420px){.ch-prog{font-size:10px}.ch-prog b{font-size:11px}}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }

function menuProps(a) {
  const prog = LEVELS.map((L, i) => {
    const lock = i >= SAVE.unlocked, best = SAVE.best[L.id];
    return '<span class="' + (lock ? 'lock' : '') + '">' + L.id + '<b>' + (lock ? 'Locked' : best ? best.toLocaleString('en-IN') : a.esc(L.name)) + '</b></span>';
  }).join('');
  const opts = [
    { id: 'mode', label: 'Mode', value: 'adventure', choices: [{ v: 'adventure', label: 'Adventure' }, { v: 'single', label: 'One level' }, { v: 'speed', label: 'Speed run' }] },
    { id: 'level', label: 'Start at', value: '1-1', choices: LEVELS.map((L, i) => ({ v: L.id, label: L.id + (i >= SAVE.unlocked ? ' (locked)' : '') })) },
    { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] }
  ];
  if (a.touchMode) opts.push({ id: 'layout', label: 'Tap & swipe layout', value: 'thumbs', choices: [{ v: 'thumbs', label: 'Two thumbs' }, { v: 'one', label: 'One finger' }], note: 'Two thumbs: drag on the left, Jump and Dash on the right. One finger: drag to move, tap or flick up to jump.' });
  opts.push({ id: 'music', label: 'Music', value: 'on', choices: [{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }] });
  return {
    eyebrow: 'Rooftop platformer', title: 'Chhat <em>Hopper</em>',
    html: '<p>Hop across old city rooftops, a monsoon forest and a night bazaar. Bop coconuts, grumpy pigeons and wind-up rickshaws, bump blocks for jalebis, and glide on your kite. A mango makes you big, a chilli gives a fire dash, a glowing diya makes you shine.</p>' +
      '<div class="ch-prog">' + prog + '</div>',
    options: opts
  };
}

function debugState() {
  const a = ARC, Gm = G;
  const R = RENDER;
  const gfx = R && R.gfx ? R.gfx() : null;
  if (!Gm) return { state: a.state, phase: 'none', renderer: R ? R.kind : 'none', gfx };
  const P = Gm.P;
  return {
    state: a.state, phase: Gm.attract ? 'attract' : Gm.phase, mode: Gm.mode, diff: Gm.diff, level: LEVELS[Gm.li].id, world: THEMES[LEVELS[Gm.li].theme].world + 1, renderer: R ? R.kind : 'none',
    x: P ? +P.x.toFixed(2) : 0, y: P ? +P.y.toFixed(2) : 0, vx: P ? +P.vx.toFixed(2) : 0, vy: P ? +P.vy.toFixed(2) : 0, onGround: P ? P.onGround : false,
    big: P ? P.big : false, power: P ? (P.star > 0 ? 'diya' : P.power) : 'none', kite: P ? P.kite : true, gliding: P ? P.gliding : false, wall: P ? P.wall : 0,
    jumps: Gm.nJumps || 0, dashes: Gm.nDashes || 0, wallJumps: P ? P.wallJumps : 0, glideTime: P ? +P.glideTime.toFixed(2) : 0,
    lives: Gm.lives, score: Gm.score, jalebis: Gm.jalebis, totalJalebis: Gm.total, stomps: Gm.stomps, clock: +Gm.clock.toFixed(1), time: +Gm.time.toFixed(2),
    checkpoint: !!Gm.cp, indoor: !!(Gm.map && Gm.map.indoor), boss: Gm.boss ? { hits: Gm.boss.hits, state: Gm.boss.e ? Gm.boss.e.state : null } : null,
    enemies: Gm.map ? Gm.map.ents.filter((e) => e.alive && isEnemy(e)).length : 0, levelWidth: Gm.map ? Gm.map.w : 0,
    alive: !Gm.gameOver, over: Gm.over, touchStyle: a.touchStyle, layout: SETTINGS.layout, iris: +Gm.iris.toFixed(2), gfx
  };
}

let RENDER = null;
let botOn = false;
function startGame(a, ch, attract) {
  SETTINGS.layout = ch.layout || 'thumbs'; SETTINGS.music = ch.music || 'on';
  a.app.classList.toggle('ch-one', SETTINGS.layout === 'one');
  let li = Math.max(0, LEVELS.findIndex((L) => L.id === ch.level));
  const mode = ch.mode || 'adventure';
  if (!attract && li >= SAVE.unlocked) { li = SAVE.unlocked - 1; a.toast('That level is locked', 'Starting at ' + LEVELS[li].id, 1800); }
  const Gm = newGame({ mode: attract ? 'single' : mode, diff: ch.diff || 'normal', li, attract });
  G = Gm;
  if (!attract && mode === 'adventure') { Gm.mapFrom = Math.max(0, li - 1); phase(Gm, 'map'); music('map'); Gm.iris = 0; }
  else { loadLevel(Gm, li, false); if (attract) { phase(Gm, 'play'); Gm.P.x = 6; } else { startIntro(Gm); Gm.iris = 0; } }
  return Gm;
}
function stopAudio() { AU.song = null; ambience(null); glideSound(false, 0); }

function run(R) {
  RENDER = R;
  let lastGlide = false;
  Arcade.create({
    three: !!R.three,
    slug: 'chhat-hopper', title: 'Chhat Hopper', genre: 'Rooftop platformer',
    hint: 'Arrows or WASD to move. Space, Up or Z to jump, hold it to glide. Shift to run, X to dash. Down to enter chimneys.',
    touchHint: 'Stick to move, Jump (hold to glide), Dash and Run buttons.',
    keys: [['Left Right / A D', 'Move'], ['Space / Up / Z', 'Jump, hold to glide'], ['Shift', 'Run'], ['X / K', 'Dash (fire dash with a chilli)'], ['Down / S', 'Enter a chimney'], ['G', 'Glide']],
    gameKeys: ['ShiftLeft', 'ShiftRight'],
    // Controller: A jump, X dash, B glide, Y or RT run.
    gamepad: { buttons: ['Space', 'KeyX', 'KeyG', 'ShiftLeft'], rt: 'ShiftLeft', lt: 'KeyX' },
    touch: { stick: true, pads: [{ label: 'Jump', key: 'Space', big: true, hot: true, keep: true }, { label: 'Dash', key: 'KeyX', keep: true }, { label: 'Run', key: 'ShiftLeft' }] },
    touchKeys: [['On-screen stick', 'Move, push far to run'], ['Jump', 'Jump, hold to glide'], ['Dash', 'Dash'], ['Run', 'Run'], ['Stick down', 'Enter a chimney']],
    gestures: {
      drag: 'x', tilt: false,
      hint: 'Drag on the left to move. Jump and Dash on the right, hold Jump to glide.',
      keys: [['Drag left or right', 'Move, drag far to run'], ['Jump button or right side', 'Jump, hold to glide'], ['Dash button', 'Dash'], ['Drag down', 'Enter a chimney'], ['One-finger layout', 'Tap or flick up to jump']]
    },
    graphics: (lv) => { if (R.graphics) R.graphics(lv); },
    formatScore: (v) => Math.round(v).toLocaleString('en-IN'),
    resize: (a) => { if (R.resize) R.resize(a); },
    init(a) {
      ARC = a; loadSave(); injectCss();
      if (!R.init(a)) return;
      installTouch(a);
      const origMenu = a.menu;
      a.menu = function (p) { stopAudio(); return origMenu(Object.assign(menuProps(a), p || {})); };
      a.debug = debugState;
      a.dev = {
        game: () => G, quality: (q) => { if (R.quality) R.quality(q); }, bot: (on) => { botOn = on !== false; },
        level: (id) => { const li = LEVELS.findIndex((L) => L.id === id); if (li >= 0 && G) { loadLevel(G, li, false); startPlay(G); } },
        teleport: (x, y) => { if (G && G.P) { G.P.x = x; if (y != null) G.P.y = y; else { let top = 0; for (let yy = H - 1; yy >= 0; yy--) if (isSolid(tileAt(G.map, Math.floor(x), yy))) { top = yy + 1; break; } G.P.y = top + 0.01; } G.cam.init = false; } },
        room: () => { if (G && G.map && G.map.secrets[0]) { const s = G.map.secrets[0]; G.secret = s; enterRoom(G); } },
        map: (li) => { if (G) { G.li = li | 0; G.mapFrom = Math.max(0, (li | 0) - 1); phase(G, 'map'); G.map = null; G.P = null; } },
        power: (k) => { if (G && G.P) { if (k === 'diya') G.P.star = 10; else { setBig(G.P, true); if (k === 'chilli') G.P.power = 'chilli'; } } },
        unlock: (n) => { SAVE.unlocked = clamp(n | 0, 1, 9); saveGame(); },
        finishLevel: () => { if (G && G.map && G.map.flag) { G.P.x = G.map.flag.x - 0.4; G.P.y = G.map.flag.y0 + 4; } },
        boss: () => { if (G) { loadLevel(G, 8, false); startPlay(G); G.P.kite = false; G.P.x = G.map.arena.x0 + 1; G.P.y = G.map.arena.floor; G.cam.init = false; } }
      };
      a.menu();
    },
    onMenu(a) {
      if (R.failed) return;
      stopAudio();
      const card = document.querySelector('.arc-card'); if (!card) return;
      card.querySelectorAll('.arc-seg').forEach((seg) => seg.addEventListener('click', () => setTimeout(() => { G = null; }, 0)));
    },
    start(a, ch) {
      if (R.failed) return;
      auUnlock();
      startGame(a, ch, false);
      if (R.onStart) R.onStart(G);
    },
    update(dt, a) {
      if (!G || R.failed) return;
      auFrame();
      const inp = botOn ? botInput(G) : readInput(a, dt);
      const slow = G.slow > 0 && !a.reducedMotion ? 0.4 : 1;
      let left = dt * slow;
      while (left > 1e-6) { const s = Math.min(FIXED, left); stepGame(G, s, inp); inp.jumpPressed = false; inp.dashPressed = false; inp.any = false; left -= s; if (G.over) break; }
      const P = G.P;
      const gl = !!(P && P.gliding && G.phase === 'play');
      if (gl || lastGlide) glideSound(gl, P ? Math.abs(P.vx) : 0);
      lastGlide = gl;
    },
    idle(dt, a) {
      if (R.failed) return;
      auFrame();
      if (a.state === 'menu') {
        const ch = a.choices;
        const key = (ch.level || '1-1');
        if (!G || !G.attract || G.attractKey !== key || G.restart) {
          const li = Math.min(SAVE.unlocked - 1, Math.max(0, LEVELS.findIndex((L) => L.id === key)));
          startGame(a, { mode: 'single', level: LEVELS[li].id, diff: 'normal', layout: ch.layout, music: ch.music }, true);
          G.attractKey = key;
        }
        const inp = botInput(G);
        let left = dt;
        while (left > 1e-6) { const s = Math.min(FIXED, left); stepGame(G, s, inp); inp.jumpPressed = false; left -= s; }
        if (G.map && G.P && G.map.flag && G.P.x > G.map.flag.x - 6) G.restart = true;
      } else if (a.state === 'over' && G) {
        G.pt += dt;
        stepTrans(G, dt);
        G.fw -= dt;
        if (!G.gameOver && G.fw <= 0 && G.P) { G.fw = 0.5 + Math.random() * 0.5; G.ev.push({ t: 'firework', x: G.cam.x + (Math.random() - 0.5) * 10, y: G.cam.y + 2 + Math.random() * 4 }); }
      }
    },
    render(ctx, a) {
      if (R.failed) return;
      R.render(ctx, a, G);
      if (G) {
        drawHUD(ctx, a, G, R);
        G.ev.length = 0;
      }
    },
    onPause() { stopAudio(); glideSound(false, 0); },
    onResume() { if (G && G.base) music(G.phase === 'map' ? 'map' : G.boss ? 'boss' : THEMES[G.base.theme].song); },
    onOver() { glideSound(false, 0); }
  });
}

/* ------------------------------------------------------------ the 2D renderer (no WebGL) */
const R2 = {
  kind: '2d', three: false, w: 0, h: 0, cam: { x: 0, y: 0, s: 40 }, fx: [], bg: {},
  init(a) { this.a = a; return true; },
  resize() {},
  gfx() { return { quality: 0, fps: 0, renderer: '2d' }; },
  project(x, y, out) { const c = this.cam; out.x = (x - c.x) * c.s + this.w / 2; out.y = this.h / 2 - (y - c.y) * c.s; out.ok = true; return out; },
  render(ctx, a, Gm) {
    this.w = a.w; this.h = a.h;
    const dt = Math.min(0.05, 1 / 60);
    if (!Gm) { ctx.fillStyle = '#1b1410'; ctx.fillRect(0, 0, a.w, a.h); return; }
    if (Gm.phase === 'map' || !Gm.map) { draw2DMap(ctx, a, Gm, this); return; }
    camStep(Gm, dt, a.w / a.h);
    const c = this.cam, gc = Gm.cam;
    c.s = a.h / gc.viewH; c.x = gc.x + a.shakeX / c.s; c.y = gc.y - a.shakeY / c.s;
    draw2DWorld(ctx, a, Gm, this, dt);
    // iris wipe
    if (Gm.iris < 0.999) {
      const P = Gm.P; this.project(P ? P.x : c.x, P ? P.y + 0.6 : c.y, _pr);
      const rad = Gm.iris * Math.hypot(a.w, a.h);
      ctx.save(); ctx.fillStyle = '#060403'; ctx.beginPath(); ctx.rect(0, 0, a.w, a.h); ctx.arc(_pr.x, _pr.y, Math.max(0.1, rad), 0, TAU, true); ctx.fill('evenodd'); ctx.restore();
    }
  }
};
function draw2DMap(ctx, a, Gm, R) {
  const w = a.w, h = a.h;
  const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1d2340'); gr.addColorStop(1, '#3b2a2a'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  const nodes = LEVELS.map((L, i) => ({ x: w * (0.14 + (i % 9) * 0.09), y: h * (0.5 + Math.sin(i * 1.3) * 0.08), col: THEMES[L.theme].col }));
  ctx.strokeStyle = 'rgba(255,240,220,0.35)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.beginPath(); nodes.forEach((n, i) => (i ? ctx.lineTo(n.x, n.y) : ctx.moveTo(n.x, n.y))); ctx.stroke(); ctx.setLineDash([]);
  nodes.forEach((n, i) => { ctx.beginPath(); ctx.arc(n.x, n.y, 9, 0, TAU); ctx.fillStyle = i < SAVE.unlocked || i <= Gm.li ? n.col : '#555'; ctx.fill(); });
  const k = smooth01(Gm.pt / 1.4), from = nodes[clamp(Gm.mapFrom || 0, 0, 8)], to = nodes[Gm.li];
  const x = lerp(from.x, to.x, k), y = lerp(from.y, to.y, k) - Math.abs(Math.sin(Gm.pt * 8)) * 6 * (k < 1 ? 1 : 0);
  ctx.fillStyle = '#ff7a2e'; ctx.fillRect(x - 5, y - 22, 10, 14); ctx.beginPath(); ctx.arc(x, y - 26, 6, 0, TAU); ctx.fillStyle = '#e9b48a'; ctx.fill();
  kiteIcon(ctx, x + 10, y - 30, 7);
  if (Gm.iris < 0.999) { ctx.fillStyle = 'rgba(6,4,3,' + (1 - Gm.iris) + ')'; ctx.fillRect(0, 0, w, h); }
}
const SKY2 = { roof: ['#4a5c9c', '#f0956a', '#ffd79a'], forest: ['#4a625c', '#8ca698', '#c9d4c0'], bazaar: ['#090820', '#251a48', '#5e3456'] };
function draw2DWorld(ctx, a, Gm, R, dt) {
  const w = a.w, h = a.h, M = Gm.map, th = M.indoor ? 'room' : M.theme, c = R.cam, s = c.s;
  const sky = M.indoor ? ['#2a1a14', '#3b261c', '#4a3022'] : SKY2[M.theme];
  const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, sky[0]); gr.addColorStop(0.65, sky[1]); gr.addColorStop(1, sky[2]); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  if (!M.indoor) {
    // sun or moon
    const sx = w * 0.72 - c.x * 2 % w * 0, sy = h * 0.24;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 90); sg.addColorStop(0, M.theme === 'bazaar' ? 'rgba(240,240,255,0.95)' : 'rgba(255,245,210,0.95)'); sg.addColorStop(0.25, 'rgba(255,220,170,0.35)'); sg.addColorStop(1, 'rgba(255,220,170,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - 90, sy - 90, 180, 180);
    // two parallax silhouettes
    [[0.25, 0.62, 'rgba(40,30,50,0.35)'], [0.5, 0.72, 'rgba(30,20,30,0.55)']].forEach(([f, base, col], li) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = -40; x <= w + 40; x += 20) {
        const wx = (x - w / 2) / s + c.x * f, k = Math.floor(wx / 2.2);
        const hh = M.theme === 'forest' ? 60 + hash(k + li * 99) * 70 + Math.sin(wx) * 10 : 40 + hash(k + li * 99) * 90;
        ctx.lineTo(x, h * base - hh * (h / 800) - (c.y - 6) * s * f * 0.3);
      }
      ctx.lineTo(w + 40, h); ctx.closePath(); ctx.fill();
    });
  }
  const x0 = Math.max(0, Math.floor(c.x - w / 2 / s) - 1), x1 = Math.min(M.w - 1, Math.ceil(c.x + w / 2 / s) + 1);
  const toX = (x) => (x - c.x) * s + w / 2, toY = (y) => h / 2 - (y - c.y) * s;
  const tcol = M.indoor ? ['#6b4630', '#4a2f20'] : M.theme === 'roof' ? ['#cfb79a', '#9c7a62'] : M.theme === 'forest' ? ['#4f8a3c', '#5a3f2c'] : ['#8c7f9a', '#4c3f58'];
  for (let x = x0; x <= x1; x++) for (let y = 0; y < H; y++) {
    const t = M.t[y * M.w + x]; if (!t || t === T_HIDDEN) continue;
    const bump = M.bump.get(KEY(x, y)) || 0, by = toY(y + 1) - Math.sin(bump / 0.2 * Math.PI) * 6 * (bump > 0 ? 1 : 0);
    const px = toX(x);
    if (t === T_GROUND) { const top = tileAt(M, x, y + 1) === 0 || tileAt(M, x, y + 1) === T_PLANK; ctx.fillStyle = top ? tcol[0] : tcol[1]; ctx.fillRect(px, by, s + 0.6, s + 0.6); if (top) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px, by, s + 0.6, s * 0.15); } else if (M.theme === 'roof' && !M.indoor && (x + y) % 3 === 0) { ctx.fillStyle = 'rgba(255,210,120,0.55)'; ctx.fillRect(px + s * 0.3, by + s * 0.25, s * 0.4, s * 0.5); } }
    else if (t === T_STONE) { ctx.fillStyle = '#8a8170'; ctx.fillRect(px, by, s, s); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(px + 0.5, by + 0.5, s - 1, s - 1); }
    else if (t === T_BRICK) { ctx.fillStyle = '#b55a34'; ctx.fillRect(px, by, s, s); ctx.strokeStyle = 'rgba(60,20,10,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, by + s / 2); ctx.lineTo(px + s, by + s / 2); ctx.moveTo(px + s / 2, by); ctx.lineTo(px + s / 2, by + s / 2); ctx.stroke(); }
    else if (t === T_Q) { ctx.fillStyle = '#e8a828'; rr(ctx, px + 1, by + 1, s - 2, s - 2, 4); ctx.fill(); txt(ctx, '?', px + s / 2, by + s / 2, s * 0.6, '#5a2a08', 'center', '800'); }
    else if (t === T_USED) { ctx.fillStyle = '#8a5a3a'; ctx.fillRect(px + 1, by + 1, s - 2, s - 2); }
    else if (t === T_PLANK) { ctx.fillStyle = M.theme === 'bazaar' ? '#d8486a' : M.theme === 'forest' ? '#3f7a30' : '#9a6a3a'; ctx.fillRect(px, by, s, s * 0.25); }
    else if (t === T_CHIMNEY) { ctx.fillStyle = '#9a4a36'; ctx.fillRect(px, by, s, s); ctx.fillStyle = '#2a1a14'; if (tileAt(M, x, y + 1) === 0) ctx.fillRect(px + 2, by, s - 4, s * 0.2); }
    else if (t === T_TANK) { ctx.fillStyle = M.theme === 'roof' ? '#2a2e33' : M.theme === 'forest' ? '#6a4a30' : '#b07a3a'; ctx.fillRect(px, by, s, s); }
  }
  // flag pole and hut
  if (M.flag) {
    const F = M.flag, fx = toX(F.x);
    ctx.fillStyle = '#d8c8a0'; ctx.fillRect(fx - 2, toY(F.y1), 4, (F.y1 - F.y0) * s);
    const fy = Gm.goal && Gm.goal.flagY != null ? Gm.goal.flagY : F.y1 - 1.2;
    ctx.save(); ctx.translate(fx + 2, toY(fy + 1)); kiteIcon(ctx, s * 0.5, s * 0.5, s * 0.5); ctx.restore();
  }
  if (M.hut) { const hx = toX(M.hut.x), hy = toY(M.hut.y + 3); ctx.fillStyle = '#c96a3a'; ctx.fillRect(hx, hy, s * 4, s * 3); ctx.fillStyle = '#3a2016'; ctx.fillRect(toX(M.hut.door), toY(M.hut.y + 1.8), s, s * 1.8); }
  if (M.indoor && M.door) { ctx.fillStyle = '#ffcf7a'; ctx.fillRect(toX(M.door.x - 0.2), toY(M.door.y + 1.8), s * 0.9, s * 1.8); }
  // coins
  for (let i = 0; i < M.coins.length; i++) {
    const co = M.coins[i]; if (co.got && co.t >= 1) continue;
    const px = toX(co.x); if (px < -s || px > w + s) continue;
    const py = toY(co.y + (co.got ? co.t * 1.2 : 0));
    ctx.globalAlpha = co.got ? 1 - co.t : 1; jalebiIcon(ctx, px, py, s * 0.3); ctx.globalAlpha = 1;
  }
  // entities
  for (let i = 0; i < M.ents.length; i++) {
    const e = M.ents[i], px = toX(e.x), py = toY(e.y);
    if (px < -3 * s || px > w + 3 * s) continue;
    if (!e.alive && e.dead > 0) { ctx.globalAlpha = clamp(1 - e.dead * 2, 0, 1); }
    if (e.type === 'coconut') { ctx.fillStyle = '#6a4224'; ctx.beginPath(); ctx.arc(px, py - e.h * s / 2, e.w * s / 2, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(px - 5, py - e.h * s * 0.6, 3, 3); ctx.fillRect(px + 2, py - e.h * s * 0.6, 3, 3); }
    else if (e.type === 'pigeon') { ctx.fillStyle = '#7d8aa0'; ctx.beginPath(); ctx.ellipse(px, py - e.h * s / 2, e.w * s / 2, e.h * s / 2.4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#9fb0c8'; const f = Math.sin(e.t * 18) * 0.5; ctx.beginPath(); ctx.ellipse(px, py - e.h * s * 0.7, e.w * s * 0.45, 4, f, 0, TAU); ctx.fill(); }
    else if (e.type === 'rickshaw') { ctx.fillStyle = '#ffcc33'; ctx.fillRect(px - e.w * s / 2, py - e.h * s, e.w * s, e.h * s * 0.75); ctx.fillStyle = '#2f7a3a'; ctx.fillRect(px - e.w * s / 2, py - e.h * s, e.w * s, e.h * s * 0.25); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(px - e.w * s * 0.3, py - 4, 5, 0, TAU); ctx.arc(px + e.w * s * 0.3, py - 4, 5, 0, TAU); ctx.fill(); }
    else if (e.type === 'monkey') { ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.ellipse(px, py - e.h * s * 0.45, e.w * s / 2, e.h * s * 0.45, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8b896'; ctx.beginPath(); ctx.arc(px + e.face * 6, py - e.h * s * 0.75, 9, 0, TAU); ctx.fill(); if (e.kite) kiteIcon(ctx, px - e.face * 14, py - e.h * s * 0.9, 10); }
    else if (e.type === 'ball') { ctx.fillStyle = '#ff9a1a'; ctx.beginPath(); ctx.arc(px, py - e.h * s / 2, e.w * s / 2, 0, TAU); ctx.fill(); }
    else if (e.type === 'mango') { ctx.fillStyle = '#ffb82a'; ctx.beginPath(); ctx.ellipse(px, py - e.h * s / 2, e.w * s / 2, e.h * s / 2, 0.4, 0, TAU); ctx.fill(); }
    else if (e.type === 'chilli') { ctx.strokeStyle = '#e8321e'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(px, py - e.h * s, e.w * s * 0.5, 0.3, 2.2); ctx.stroke(); }
    else if (e.type === 'diya') { ctx.fillStyle = '#b8643a'; ctx.beginPath(); ctx.ellipse(px, py - 6, 12, 6, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#ffe28a'; ctx.beginPath(); ctx.ellipse(px, py - 16, 4, 8, 0, 0, TAU); ctx.fill(); }
    else if (e.type === 'life') kiteIcon(ctx, px, py - e.h * s / 2, e.w * s / 2);
    else if (e.type === 'spring') { ctx.fillStyle = '#8a5a2a'; ctx.fillRect(px - s / 2, py - e.h * s * (1 - e.comp * 0.4), s, 5); ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(px - s / 2, py); ctx.lineTo(px + s / 2, py - e.h * s * 0.5); ctx.stroke(); }
    else if (e.type === 'mover') { ctx.fillStyle = M.theme === 'bazaar' ? '#e84a6a' : '#8a6038'; ctx.fillRect(px - e.w * s / 2, py, e.w * s, e.h * s); }
    else if (e.type === 'check') { ctx.fillStyle = '#ddd'; ctx.fillRect(px - 2, py - e.h * s, 4, e.h * s); ctx.fillStyle = e.on ? '#ff9a2a' : '#888'; ctx.beginPath(); const fy = py - s * (0.6 + 1.6 * e.raise); ctx.moveTo(px + 2, fy - 10); ctx.lineTo(px + 26, fy - 3); ctx.lineTo(px + 2, fy + 4); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  // the hero
  const P = Gm.P;
  if (P && !(P.inside) && !(P.inv > 0 && Math.floor(P.inv * 12) % 2 === 0)) {
    const px = toX(P.x), py = toY(P.y), hh = P.h * s, ww = P.w * s;
    ctx.save(); ctx.translate(px, py);
    if (Gm.phase === 'dead') ctx.rotate(Gm.pt * 6);
    if (P.star > 0) { ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 18; }
    const leg = Math.sin(P.walk * 3.2) * (P.onGround ? 0.35 : 0.1);
    ctx.fillStyle = '#3a3d5c'; ctx.fillRect(-ww * 0.3, -hh * 0.32, ww * 0.22, hh * 0.32); ctx.fillRect(ww * 0.08, -hh * 0.32 + leg * 4, ww * 0.22, hh * 0.32);
    ctx.fillStyle = P.power === 'chilli' ? '#f4f0e6' : '#2a86e0'; rr(ctx, -ww * 0.5, -hh * 0.75, ww, hh * 0.48, 5); ctx.fill();
    ctx.fillStyle = '#e8b48a'; ctx.beginPath(); ctx.arc(0, -hh * 0.84, ww * 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8402a'; ctx.beginPath(); ctx.arc(0, -hh * 0.9, ww * 0.44, Math.PI, 0); ctx.fill(); ctx.fillRect(P.face * ww * 0.1, -hh * 0.92, P.face * ww * 0.55, 4);
    ctx.fillStyle = '#1a1010'; ctx.fillRect(P.face * ww * 0.15 - 2, -hh * 0.85, 3, 4);
    if (P.kite) { ctx.save(); if (P.gliding) { ctx.translate(0, -hh * 1.4); ctx.rotate(P.face * 0.2); kiteIcon(ctx, 0, 0, s * 0.9); } else { ctx.translate(-P.face * ww * 0.45, -hh * 0.6); ctx.rotate(-P.face * 0.5); kiteIcon(ctx, 0, 0, s * 0.42); } ctx.restore(); }
    ctx.restore();
  }
  // simple sparks and confetti from events
  for (let i = 0; i < Gm.ev.length; i++) {
    const e = Gm.ev[i];
    const n = e.t === 'firework' ? 26 : e.t === 'pop' || e.t === 'brick' ? 14 : e.t === 'coin' || e.t === 'stomp' ? 6 : e.t === 'land' && e.v > 16 ? 5 : 0;
    for (let k = 0; k < n; k++) {
      const an = Math.random() * TAU, sp = e.t === 'firework' ? 4 + Math.random() * 3 : 2 + Math.random() * 3;
      R.fx.push({ x: e.x, y: e.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp + 2, life: 0.8 + Math.random() * 0.5, col: e.t === 'firework' ? ['#ff6a8a', '#ffd34d', '#6ae0ff', '#a6ff7a'][k % 4] : e.t === 'coin' ? '#ffcf5a' : e.t === 'brick' ? '#b55a34' : ['#ff6a8a', '#ffd34d', '#6ae0ff', '#ffffff'][k % 4] });
    }
  }
  for (let i = R.fx.length - 1; i >= 0; i--) {
    const p = R.fx[i]; p.life -= dt; if (p.life <= 0) { R.fx.splice(i, 1); continue; }
    p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.fillStyle = p.col; ctx.globalAlpha = clamp(p.life * 1.5, 0, 1); ctx.fillRect(toX(p.x) - 2, toY(p.y) - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  if (R.fx.length > 600) R.fx.splice(0, R.fx.length - 600);
  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------ hand over or start */
const CORE = {
  THREE_HINT: true, TAU, H, clamp, lerp, smooth01, approach, hash, rng, KEY,
  T_EMPTY, T_GROUND, T_BRICK, T_Q, T_USED, T_HIDDEN, T_PLANK, T_CHIMNEY, T_TANK, T_STONE, isSolid, tileAt,
  THEMES, LEVELS, buildLevel, buildRoom, camStep, run, R2, txt, txtS, plate, rr, jalebiIcon, kiteIcon,
  get G() { return G; }, get ARC() { return ARC; }, get SAVE() { return SAVE; }, SETTINGS, isEnemy, isItem,
  _t: { newGame, loadLevel, startPlay, stepGame, botInput, PH, FIXED, setSave: (s) => { SAVE = s; } }
};
if (CORE_ONLY) window.ChhatCore = CORE;
else run(R2);
})();
