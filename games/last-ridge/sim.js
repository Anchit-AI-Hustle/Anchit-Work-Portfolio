/*
 * Last Ridge, the simulation: the grid, bodies, weapons, grenades, the bots,
 * every mode's rules, the campaign objectives, the range and the recorder the
 * final killcam plays back. No three.js here: the 3D view and the 2D view
 * both draw this same world. Plain numbers, no allocation in the hot loops.
 */
import { CS, EYE, BODY, RAD, LOW_H, TALL_H, MAPS, WEAPONS, OPTICS, MODS, CLASSES, STREAKS, MP_MODES, MISSIONS, DIFF, LINES, FACTIONS, ALLIES, RIVALS, FFA_NAMES, MEDALS, ROAD_LOOK, RANGE_LOOK, HQ } from './data.js';
import * as SND from './audio.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ================================================================ the grid */
function heightOf(k, wallH) {
  switch (k) {
    case '#': return wallH; case 'H': return 9; case 'X': return 0.35; case 'b': return TALL_H; case 'c': return LOW_H;
    case 'o': return 7; case 't': return 2.3; case 'e': return 1.1; case 'r': return 0.5; default: return 0;
  }
}
function blockOf(k) { return k === '#' || k === 'H' || k === 'X' || k === 'b' || k === 'o' || k === 't' || k === 'e' ? 1 : 0; }
function finishGrid(G, rows, wallH) {
  const n = G.gw * G.gh;
  G.rows = rows; G.kind = new Array(n); G.h = new Float32Array(n); G.block = new Uint8Array(n); G.bhp = new Float32Array(n);
  G.spawns = [[], []]; G.barrels = []; G.wallH = wallH;
  for (let z = 0; z < G.gh; z++) for (let x = 0; x < G.gw; x++) {
    let k = (rows[z] || '')[x] || '#';
    const i = z * G.gw + x;
    if (k === 'A') { G.spawns[0].push([x, z]); k = '.'; }
    if (k === 'B') { G.spawns[1].push([x, z]); k = '.'; }
    G.kind[i] = k; G.h[i] = heightOf(k, wallH); G.block[i] = blockOf(k);
    if (k === 'e') { G.bhp[i] = 30; G.barrels.push(i); }
  }
  return G;
}
export function buildGrid(mapId, seed) {
  if (mapId === 'road') return buildRoad(seed || 7);
  if (mapId === 'range') return buildRange();
  const M = MAPS[mapId];
  const top = M.rows;
  const rows = M.mirror ? top.concat(top.slice().reverse().map((r) => r.replace(/B/g, 'A'))) : top;
  const G = { id: mapId, gw: rows[0].length, gh: rows.length };
  return finishGrid(G, rows, M.wallH);
}
// The convoy road: 16 cells wide, 100 long, built from a seed. Four roadblocks the truck must break.
export const ROADBLOCKS = [80, 58, 36, 15];
function buildRoad(seed) {
  const R = rng(seed), gw = 16, gh = 100, rows = [];
  for (let z = 0; z < gh; z++) {
    const r = new Array(gw).fill('.');
    r[0] = 'H'; r[gw - 1] = 'H';
    rows.push(r);
  }
  // building blocks on both sides with alleys between
  for (const side of [0, 1]) {
    let z = 6;
    while (z < gh - 4) {
      const len = 3 + ((R() * 4) | 0), gap = 1 + ((R() * 2) | 0);
      for (let k = 0; k < len && z + k < gh - 2; k++) for (let x = 1; x <= 2; x++) rows[z + k][side ? gw - 1 - x : x] = '#';
      z += len + gap;
    }
  }
  // the bridge: water either side of the road
  for (let z = 0; z < 6; z++) for (let x = 0; x < gw; x++) if (x < 4 || x > 11) rows[z][x] = 'X';
  // wrecks, sandbags and barrels by the road
  for (let z = 8; z < gh - 6; z += 3 + ((R() * 3) | 0)) {
    if (ROADBLOCKS.some((b) => Math.abs(b - z) < 3)) continue;
    const s = R() < 0.5;
    if (R() < 0.45) rows[z][s ? 4 : 11] = 'b';
    if (R() < 0.6) rows[z][s ? 3 : 12] = 'c';
    if (R() < 0.15) rows[z][s ? 12 : 3] = 'e';
  }
  for (const b of ROADBLOCKS) {
    for (let x = 4; x <= 11; x++) rows[b][x] = 'c';
    rows[b][6] = 'e'; rows[b][9] = 'e';
    rows[b + 1][3] = 'c'; rows[b + 1][12] = 'c'; rows[b - 2][4] = 'b'; rows[b - 3][11] = 'b';
  }
  for (let x = 5; x <= 10; x++) rows[gh - 2][x] = 'A';
  const G = { id: 'road', gw, gh };
  return finishGrid(G, rows.map((r) => r.join('')), 5.2);
}
// The firing range, the Pit: lanes to the north of the booth, the kill house to the east.
const RANGE_ROWS = [
  '########################',
  '#..........#...........#',
  '#..........#.###.#####.#',
  '#..........#.#.......#.#',
  '#..........#.#.###.#.#.#',
  '#..........#...#...#...#',
  '#..........#.#.#.###.#.#',
  '#..c....c..#.#.......#.#',
  '#..........#.#####.###.#',
  '#..........#.#.....#...#',
  '#....ccc...#.#.###.#.#.#',
  '#...c...c..#...#.....#.#',
  '#....ccc...#.###.#####.#',
  '#..........#...........#',
  '#..c....c..#####..######',
  '#......................#',
  '#......................#',
  '#cc.cc.cc.cc...........#',
  '#......................#',
  '#....A.A.A.A...........#',
  '#......................#',
  '########################',
];
function buildRange() {
  const G = { id: 'range', gw: RANGE_ROWS[0].length, gh: RANGE_ROWS.length };
  return finishGrid(G, RANGE_ROWS, 3.4);
}
export const cw = (G, c) => (c - G.gw / 2) * CS;        // cell (fractional) to world x
export const cwz = (G, c) => (c - G.gh / 2) * CS;       // cell (fractional) to world z
export const toCX = (G, v) => Math.floor(v / CS + G.gw / 2);
export const toCZ = (G, v) => Math.floor(v / CS + G.gh / 2);
export const inGrid = (G, x, z) => x >= 0 && z >= 0 && x < G.gw && z < G.gh;
function bodyH(G, x, z) { if (!inGrid(G, x, z)) return 99; const i = z * G.gw + x; return G.block[i] ? 99 : G.h[i]; }
export function cellH(G, x, z) { if (!inGrid(G, x, z)) return 99; return G.h[z * G.gw + x]; }
export function walkable(G, x, z) { if (!inGrid(G, x, z)) return false; const i = z * G.gw + x; return G.block[i] === 0 && G.kind[i] !== 'c'; }
function groundAt(G, x, z, r, feet) {
  const x0 = toCX(G, x - r), x1 = toCX(G, x + r), z0 = toCZ(G, z - r), z1 = toCZ(G, z + r);
  let g = 0;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    if (!inGrid(G, cx, cz)) continue;
    const h = bodyH(G, cx, cz);
    if (h < 50 && h <= feet + 0.38 && h > g) g = h;
  }
  return g;
}
function collide(G, p, r, feet) {
  for (let it = 0; it < 2; it++) {
    const x0 = toCX(G, p.x - r), x1 = toCX(G, p.x + r), z0 = toCZ(G, p.z - r), z1 = toCZ(G, p.z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const h = bodyH(G, cx, cz);
      if (h <= feet + 0.38) continue;
      const bx0 = cw(G, cx), bz0 = cwz(G, cz), bx1 = bx0 + CS, bz1 = bz0 + CS;
      const nx = clamp(p.x, bx0, bx1), nz = clamp(p.z, bz0, bz1);
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        const l = p.x - bx0, rr = bx1 - p.x, t = p.z - bz0, b = bz1 - p.z, m = Math.min(l, rr, t, b);
        if (m === l) p.x = bx0 - r; else if (m === rr) p.x = bx1 + r; else if (m === t) p.z = bz0 - r; else p.z = bz1 + r;
      } else { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
    }
  }
}
// Line of sight at the heights along the line, through smoke too when asked.
export function clearLine(W, ax, ay, az, bx, by, bz, smoke) {
  const G = W.G;
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.5));
  for (let k = 1; k < n; k++) {
    const t = k / n, x = ax + dx * t, z = az + dz * t, y = ay + dy * t;
    const cx = toCX(G, x), cz = toCZ(G, z);
    if (!inGrid(G, cx, cz)) return false;
    if (G.h[cz * G.gw + cx] > y) return false;
  }
  if (smoke && W.smokes.length) {
    for (const s of W.smokes) { if (s.r < 0.8) continue; if (segPointD2(ax, ay, az, bx, by, bz, s.x, s.y + 1.2, s.z) < s.r * s.r * 0.7) return false; }
  }
  return true;
}
function segPointD2(ax, ay, az, bx, by, bz, px, py, pz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az, l2 = ux * ux + uy * uy + uz * uz;
  let t = l2 > 1e-9 ? ((px - ax) * ux + (py - ay) * uy + (pz - az) * uz) / l2 : 0; t = clamp(t, 0, 1);
  const x = ax + ux * t - px, y = ay + uy * t - py, z = az + uz * t - pz;
  return x * x + y * y + z * z;
}
function walkLine(G, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.5));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (!walkable(G, toCX(G, ax + dx * t + 0.4), toCZ(G, az + dz * t)) || !walkable(G, toCX(G, ax + dx * t - 0.4), toCZ(G, az + dz * t)) ||
      !walkable(G, toCX(G, ax + dx * t), toCZ(G, az + dz * t + 0.4)) || !walkable(G, toCX(G, ax + dx * t), toCZ(G, az + dz * t - 0.4))) return false;
  }
  return true;
}
// A* over walkable cells, eight ways, no corner cutting, then pulled tight.
const PF = { g: null, from: null, closed: null, n: 0 };
export function findPath(G, sx, sz, tx, tz) {
  const near = (x, z) => {
    if (walkable(G, x, z)) return [x, z];
    for (let r = 1; r < 5; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (walkable(G, x + dx, z + dz)) return [x + dx, z + dz];
    return null;
  };
  const a = near(toCX(G, sx), toCZ(G, sz)), b = near(toCX(G, tx), toCZ(G, tz));
  if (!a || !b) return null;
  const N = G.gw * G.gh, GW = G.gw;
  if (PF.n !== N) { PF.g = new Float32Array(N); PF.from = new Int32Array(N); PF.closed = new Uint8Array(N); PF.n = N; }
  const gS = PF.g, from = PF.from, closed = PF.closed;
  gS.fill(1e9); from.fill(-1); closed.fill(0);
  const si = a[1] * GW + a[0], ti = b[1] * GW + b[0];
  if (si === ti) return [[tx, tz]];
  const open = [si]; gS[si] = 0;
  const hf = (i) => { const x = i % GW, z = (i / GW) | 0; return Math.hypot(x - b[0], z - b[1]); };
  let guard = 0;
  while (open.length && guard++ < 1400) {
    let bi = 0, bf = 1e9;
    for (let k = 0; k < open.length; k++) { const f = gS[open[k]] + hf(open[k]); if (f < bf) { bf = f; bi = k; } }
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === ti) break;
    closed[cur] = 1;
    const x = cur % GW, z = (cur / GW) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (!walkable(G, nx, nz)) continue;
      if (dx && dz && (!walkable(G, x + dx, z) || !walkable(G, x, z + dz))) continue;
      const ni = nz * GW + nx; if (closed[ni]) continue;
      const g = gS[cur] + (dx && dz ? 1.414 : 1);
      if (g < gS[ni]) { if (gS[ni] >= 1e9) open.push(ni); gS[ni] = g; from[ni] = cur; }
    }
  }
  if (from[ti] < 0) return null;
  const cells = [];
  for (let i = ti; i !== si && i >= 0 && cells.length < 400; i = from[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => [cw(G, i % GW + 0.5), cwz(G, ((i / GW) | 0) + 0.5)]);
  pts[pts.length - 1] = [tx, tz];
  const out = []; let ax = sx, az = sz, k = 0;
  while (k < pts.length) {
    let j = Math.min(pts.length - 1, k + 8);
    while (j > k && !walkLine(G, ax, az, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]); ax = pts[j][0]; az = pts[j][1]; k = j + 1;
  }
  return out;
}
function coverSpots(G) {
  const out = [];
  for (let z = 0; z < G.gh; z++) for (let x = 0; x < G.gw; x++) {
    if (!walkable(G, x, z)) continue;
    let low = 0, tall = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inGrid(G, x + dx, z + dz)) continue;
      const k = G.kind[(z + dz) * G.gw + x + dx];
      if (k === 'c' || k === 'e') low++; else if (k === 'b' || k === '#' || k === 'o' || k === 't') tall++;
    }
    if (low || tall) out.push({ x: cw(G, x + 0.5), z: cwz(G, z + 0.5), low: !!low && !tall, cx: x, cz: z });
  }
  return out;
}
export function nearestFloor(G, cx, cz) {
  const x = Math.floor(cx), z = Math.floor(cz);
  if (walkable(G, x, z)) return [cx, cz];
  for (let r = 1; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (walkable(G, x + dx, z + dz)) return [x + dx + 0.5, z + dz + 0.5];
  return [cx, cz];
}
function landmark(W, x, z) {
  const L = W.M.land; if (!L || !L.length) return 'ahead';
  let best = L[0][0], bd = 1e9;
  for (const l of L) { const lx = cw(W.G, l[1]), lz = cwz(W.G, l[2]), d = (lx - x) * (lx - x) + (lz - z) * (lz - z); if (d < bd) { bd = d; best = l[0]; } }
  return best;
}

/* ================================================================ the ray */
// One shot through the world: walls and floor by a grid walk, people as
// capsules with a head, range targets as boards, the convoy truck as a box.
export const HIT = { t: 0, kind: '', c: null, head: false, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, cell: -1, tgt: null };
function wallT(W, ox, oy, oz, dx, dy, dz, maxT) {
  const G = W.G;
  // floor first
  let best = maxT, nx = 0, ny = 0, nz = 0, cell = -1;
  if (dy < -1e-4) { const tf = -oy / dy; if (tf > 0 && tf < best) { best = tf; nx = 0; ny = 1; nz = 0; } }
  // 2D DDA across cells
  let cx = toCX(G, ox), cz = toCZ(G, oz);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const inv = (v) => (Math.abs(v) < 1e-9 ? 1e9 : 1 / v);
  const bxN = cw(G, cx + (dx > 0 ? 1 : 0)), bzN = cwz(G, cz + (dz > 0 ? 1 : 0));
  let tMaxX = (bxN - ox) * inv(dx), tMaxZ = (bzN - oz) * inv(dz);
  const tdx = Math.abs(CS * inv(dx)), tdz = Math.abs(CS * inv(dz));
  if (tMaxX < 0) tMaxX = 0; if (tMaxZ < 0) tMaxZ = 0;
  let tEnter = 0, side = -1;
  for (let it = 0; it < 220; it++) {
    if (!inGrid(G, cx, cz)) { if (tEnter < best) { best = tEnter; cell = -2; nx = side === 0 ? -stepX : 0; nz = side === 1 ? -stepZ : 0; ny = 0; } break; }
    const i = cz * G.gw + cx, h = G.h[i];
    const tExit = Math.min(tMaxX, tMaxZ);
    if (h > 0 && tEnter < best) {
      const yIn = oy + dy * tEnter, yOut = oy + dy * Math.min(tExit, best);
      if (yIn < h) { if (tEnter > 1e-4 || side >= 0) { best = tEnter; cell = i; nx = side === 0 ? -stepX : 0; nz = side === 1 ? -stepZ : 0; ny = 0; } else if (tEnter <= 1e-4) { /* starting inside a cell: ignore it */ } break; }
      if (yOut < h && dy < 0) { const tt = (h - oy) / dy; if (tt > tEnter && tt < best) { best = tt; cell = i; nx = 0; ny = 1; nz = 0; } break; }
    }
    if (tEnter > best) break;
    if (tMaxX < tMaxZ) { tEnter = tMaxX; tMaxX += tdx; cx += stepX; side = 0; } else { tEnter = tMaxZ; tMaxZ += tdz; cz += stepZ; side = 1; }
  }
  HIT.nx = nx; HIT.ny = ny; HIT.nz = nz; HIT.cell = cell;
  return best;
}
// Closest approach of the ray (o, d) to segment a..b: returns ray t when within r, else -1.
function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = ox - ax, wy = oy - ay, wz = oz - az;
  const a = dx * dx + dy * dy + dz * dz, b = dx * ux + dy * uy + dz * uz, c = ux * ux + uy * uy + uz * uz, d = dx * wx + dy * wy + dz * wz, e = ux * wx + uy * wy + uz * wz;
  const D = a * c - b * b;
  let s, t;
  if (D < 1e-8) { s = 0; t = c > 1e-8 ? e / c : 0; } else { s = (b * e - c * d) / D; t = (a * e - b * d) / D; }
  t = clamp(t, 0, 1);
  s = (b * t - d) / a;
  if (s < 0) return -1;
  const px = ox + dx * s - (ax + ux * t), py = oy + dy * s - (ay + uy * t), pz = oz + dz * s - (az + uz * t);
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return -1;
  return Math.max(0, s - Math.sqrt(r * r - d2) * 0.8);
}
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz, tc = lx * dx + ly * dy + lz * dz;
  if (tc < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  if (d2 > r * r) return -1;
  return tc - Math.sqrt(r * r - d2);
}
export function bodyTop(c) { return c.y + lerp(BODY.stand, c.stance === 'prone' ? BODY.prone : c.stance === 'slide' ? BODY.slide : BODY.crouch, c.stanceK); }
export function chestY(c) { return c.y + (c.stance === 'prone' ? 0.3 : lerp(1.3, 0.9, c.stanceK)); }
export function headY(c) { return bodyTop(c) - 0.13; }
export function eyeY(c) { return c.y + lerp(EYE.stand, c.stance === 'prone' ? EYE.prone : c.stance === 'slide' ? EYE.slide : EYE.crouch, c.stanceK); }
// The eye point including lean (out sideways from cover).
export function eyePos(c, out) {
  const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), L = c.leanK * 0.42;
  out.x = c.x + rx * L; out.y = eyeY(c) - Math.abs(c.leanK) * 0.08; out.z = c.z + rz * L;
  if (c.mount) { out.x = c.mount.x; out.y = c.mount.y; out.z = c.mount.z; }
  return out;
}
export function aimDir(yaw, pitch, out) { const cp = Math.cos(pitch); out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp; return out; }
function castRay(W, shooter, ox, oy, oz, dx, dy, dz, maxT) {
  let best = wallT(W, ox, oy, oz, dx, dy, dz, maxT);
  HIT.kind = HIT.cell >= 0 ? (W.G.kind[HIT.cell] === 'e' ? 'barrel' : 'wall') : HIT.ny === 1 ? 'floor' : best < maxT ? 'wall' : 'none';
  HIT.c = null; HIT.head = false; HIT.tgt = null;
  const nx = HIT.nx, ny = HIT.ny, nz = HIT.nz, cell = HIT.cell;
  for (let k = 0; k < W.chars.length; k++) {
    const c = W.chars[k];
    if (c === shooter || !c.alive || c.ghostT > 0) continue;
    if (shooter && !W.ffa && c.team === shooter.team) continue;
    const top = bodyTop(c);
    let t = -1, head = false;
    if (c.stance === 'prone' && c.stanceK > 0.6) {
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      t = rayCapsule(ox, oy, oz, dx, dy, dz, c.x - fx * 0.7, c.y + 0.22, c.z - fz * 0.7, c.x + fx * 0.55, c.y + 0.25, c.z + fz * 0.55, 0.3);
      const th = raySphere(ox, oy, oz, dx, dy, dz, c.x + fx * 0.75, c.y + 0.32, c.z + fz * 0.75, 0.15);
      if (th >= 0 && (t < 0 || th < t)) { t = th; head = true; }
    } else {
      const lx = Math.cos(c.yaw) * c.leanK * 0.32, lz = -Math.sin(c.yaw) * c.leanK * 0.32;
      t = rayCapsule(ox, oy, oz, dx, dy, dz, c.x, c.y + 0.2, c.z, c.x + lx * 0.6, top - 0.36, c.z + lz * 0.6, 0.27);
      const th = raySphere(ox, oy, oz, dx, dy, dz, c.x + lx, top - 0.13, c.z + lz, 0.14);
      if (th >= 0 && (t < 0 || th < t)) { t = th; head = true; }
    }
    if (t >= 0 && t < best) { best = t; HIT.kind = 'char'; HIT.c = c; HIT.head = head; }
  }
  if (W.targets) for (const g of W.targets) {
    if (!g.up || g.k < 0.6) continue;
    // a board that turns to face the shooter: hit as a slim upright post, the top fifth is the centre ring
    const t = rayCapsule(ox, oy, oz, dx, dy, dz, g.x, g.y + 0.45, g.z, g.x, g.y + 1.75, g.z, 0.3);
    if (t >= 0 && t < best) { best = t; HIT.kind = 'target'; HIT.tgt = g; HIT.head = oy + dy * t > g.y + 1.5; HIT.c = null; }
  }
  if (W.convoy) for (const tr of W.convoy.trucks) {
    if (shooter && shooter.team === 0) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz, tr.x - 1.25, 0.3, tr.z - 3.2, tr.x + 1.25, 2.4, tr.z + 3.2);
    if (t >= 0 && t < best && !(shooter && shooter.mount)) { best = t; HIT.kind = 'truck'; HIT.truck = tr; HIT.c = null; }
  }
  if (HIT.kind !== 'char' && HIT.kind !== 'target' && HIT.kind !== 'truck') { HIT.nx = nx; HIT.ny = ny; HIT.nz = nz; HIT.cell = cell; }
  else { HIT.nx = -dx; HIT.ny = -dy; HIT.nz = -dz; }
  HIT.t = best; HIT.x = ox + dx * best; HIT.y = oy + dy * best; HIT.z = oz + dz * best;
  return HIT;
}
function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 1e9;
  const ax = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (const [o, d, a, b] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return -1; continue; }
    let t1 = (a - o) / d, t2 = (b - o) / d; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return -1;
  }
  return tmin;
}

/* ================================================================ loadouts and weapons */
export function weaponFrom(id, optic, mod, perks) {
  const b = WEAPONS[id]; const o = OPTICS[optic] || OPTICS.iron, m = MODS[mod] || MODS.none;
  const w = Object.assign({}, b);
  w.optic = b.scope ? 'scope' : o.id; w.mod = m.id;
  if (!b.scope && o.zoom) w.zoom = b.zoom * o.zoom;
  if (o.adsT) w.adsT *= o.adsT;
  if (m.id === 'grip') w.kick *= 0.75;
  if (m.id === 'mag' && !b.rocket && !b.shell) { w.mag = Math.round(b.mag * 1.5); w.reload *= 1.15; w.reloadEmpty *= 1.15; }
  if (m.id === 'quiet') { w.quiet = true; w.near *= 0.85; w.far *= 0.85; }
  if (m.id === 'laser') w.hip *= 0.68;
  if (m.id === 'stock') w.adsT *= 0.75;
  if (perks && perks.indexOf('steady') >= 0) { w.kick *= 0.82; w.hip *= 0.85; }
  if (perks && perks.indexOf('quick') >= 0) { w.reload *= 0.75; w.reloadEmpty *= 0.75; }
  if (b.scope && optic !== 'iron') w.optic = 'scope';
  return w;
}
function wState(def, deep) { return { def, mag: def.mag, spare: def.spare + (deep && !def.rocket ? def.mag : 0), reloadT: 0, reloadDur: 0, fireT: 0, boltT: 0, swapT: 0 }; }
export function resolveLoadout(save, choice) {
  if (choice && CLASSES[choice]) return Object.assign({}, CLASSES[choice], { perks: CLASSES[choice].perks.slice() });
  const c = (save && save.custom) || CLASSES.rifleman;
  return Object.assign({}, CLASSES.rifleman, c, { perks: (c.perks || CLASSES.rifleman.perks).slice() });
}
function botLoadout(R, team, rank) {
  const pool = rank > 8 ? ['vr7', 'vr7', 'ks9', 'tr12', 'ld4', 'hm40', 'lw8'] : ['vr7', 'vr7', 'ks9', 'ks9', 'tr12', 'ld4'];
  const p = pool[(R() * pool.length) | 0];
  return { primary: p, optic: R() < 0.4 ? 'pip' : 'iron', mod: R() < 0.3 ? 'grip' : 'none', secondary: 'p11', tactical: R() < 0.5 ? 'smoke' : 'flash', perks: ['swift', 'steady', 'light'] };
}

/* ================================================================ people */
let NEXT_ID = 0;
function newChar(W, team, name, isPlayer, lo) {
  const perks = lo.perks || [];
  const deep = perks.indexOf('deep') >= 0;
  const c = {
    id: W.chars.length, uid: NEXT_ID++, team, name, isPlayer: !!isPlayer, lo, perks,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: true, air: false,
    stance: 'stand', stanceK: 0, slideT: 0, mantle: null, leanK: 0, sprint: false, stamina: 1, sprintCool: 0,
    hp: 100, hpMax: 100, armor: 0, regenT: 9, alive: true, downT: 0, gone: false, respawnT: 0, ghostT: 0, outT: 0,
    w: [wState(weaponFrom(lo.primary, lo.optic, lo.mod, perks), deep), wState(weaponFrom(lo.secondary, 'iron', 'none', perks), deep)], cur: 0,
    adsK: 0, recoilP: 0, recoilY: 0, bloom: 0, sway: Math.random() * 10, breath: 1,
    frag: deep ? 3 : 2, tac: deep ? 3 : 2, cookT: -1, throwT: 0, useT: 0, useK: 0, meleeT: 0,
    kos: 0, downs: 0, assists: 0, score: 0, streak: 0, streakPts: 0, streaksUsed: {}, dmgFrom: new Map(), lastHitBy: null, lastHitT: -9,
    hitFlash: 0, suppress: 0, flashT: 0, footT: 0, phase: 0, speed: 0, flinch: 0, cheerT: 0, firing: 0, fired: false,
    carry: false, mount: null, hasCharge: false, interact: null, interactT: 0,
    bot: null,
  };
  if (!isPlayer) c.bot = newBot(W, c);
  return c;
}
function newBot(W, c) {
  return {
    state: 'roam', target: null, vis: false, lastSeen: null, lostT: 0, reactT: 0, ready: false, settle: 0,
    path: null, pathT: 0, goal: null, goalT: 0, mode: 'move', coverT: 0, coverLow: false, flankT: 0, hesT: 0, peekT: 0, prevCoverT: 0,
    thinkT: Math.random() * 0.3, aimYaw: 0, aimPitch: 0, errX: 0, errY: 0, errT: 0, strafeT: 0, strafeDir: 1, fireT: 0, firingNow: false,
    stuckT: 0, lx: 0, lz: 0, scanT: 0, scanTo: 0, form: 0.85 + Math.random() * 0.3, morale: 0.6 + Math.random() * 0.3,
    role: 'hunt', home: null, squad: -1, nadeT: 6 + Math.random() * 10, callT: 0, alert: 0, heard: null, heardT: 0, patrol: null, pi: 0, waitT: 0,
    suppressT: 0, spotT: 0, flankCalled: false, seenT: 0,
  };
}
function spawnAt(W, c, x, z, yaw) {
  c.x = x; c.z = z; c.y = groundAt(W.G, x, z, RAD * 0.6, 0.5); c.vx = c.vy = c.vz = 0; c.yaw = yaw; c.pitch = 0;
  c.hp = c.hpMax; c.armor = 0; c.alive = true; c.downT = 0; c.gone = false; c.regenT = 9; c.ghostT = 0;
  c.stance = 'stand'; c.stanceK = 0; c.slideT = 0; c.mantle = null; c.leanK = 0; c.sprint = false; c.stamina = 1;
  c.cur = 0; c.adsK = 0; c.recoilP = c.recoilY = 0; c.bloom = 0; c.cookT = -1; c.flashT = 0; c.suppress = 0;
  c.streak = 0; c.streakPts = 0; c.streaksUsed = {}; c.dmgFrom.clear(); c.lastHitBy = null; c.interact = null; c.interactT = 0;
  const deep = c.perks.indexOf('deep') >= 0;
  for (const s of c.w) { s.mag = s.def.mag; s.spare = s.def.spare + (deep && !s.def.rocket ? s.def.mag : 0); s.reloadT = 0; s.fireT = 0.25; s.boltT = 0; s.swapT = 0; }
  c.frag = deep ? 3 : 2; c.tac = deep ? 3 : 2;
  c.spawnShield = 1.2;
  if (c.bot) { const B = c.bot; B.path = null; B.target = null; B.vis = false; B.reactT = 0; B.aimYaw = yaw; B.aimPitch = 0; B.mode = 'move'; B.goal = null; B.alert = 0; B.lastSeen = null; }
}
function spawnPoint(W, c) {
  const G = W.G, team = W.ffa ? -1 : c.team;
  let list = team < 0 ? W.ffaSpawns : G.spawns[W.side ? (team ^ W.side) : team];
  if (!list || !list.length) list = W.cover.map((s) => [s.cx, s.cz]);
  let best = null, bs = -1e9;
  for (const [x, z] of list) {
    const px = cw(G, x + 0.5), pz = cwz(G, z + 0.5);
    let s = Math.random() * 4;
    for (const o of W.chars) {
      if (!o.alive || o === c) continue;
      const d = Math.hypot(o.x - px, o.z - pz);
      if (W.ffa || o.team !== c.team) { s += Math.min(d, 34) * 0.4; if (d < 12) s -= 30; if (d < 26 && clearLine(W, o.x, eyeY(o), o.z, px, 1.4, pz, false)) s -= 18; }
      else if (d < 1.4) s -= 20;
    }
    if (s > bs) { bs = s; best = [px, pz]; }
  }
  return best || [0, 0];
}
function faceCenter(W, x, z) { return Math.atan2(x - 0, z - 0); }

/* ================================================================ the world */
export function newWorld(cfg, save) {
  const kind = cfg.mode;
  let mapId = cfg.map || 'ridge', Ms = null;
  if (kind === 'campaign') { Ms = MISSIONS[cfg.mission | 0]; mapId = Ms.map; }
  if (kind === 'range') mapId = 'range';
  const G = buildGrid(mapId, cfg.seed);
  const M = mapId === 'road' ? { id: 'road', name: 'Varrow Road', where: 'The road to the Varrow bridge', when: 'Midday, overcast', land: [], look: ROAD_LOOK, floor: 'road', wallH: 5.2 }
    : mapId === 'range' ? { id: 'range', name: 'The Pit', where: 'Halberd training ground', when: 'Morning', land: [], look: RANGE_LOOK, floor: 'dirt', wallH: 3.4 } : MAPS[mapId];
  const look = Object.assign({}, M.look, Ms && Ms.look ? Ms.look : {});
  const W = {
    cfg, kind, mapId, M, G, look, mission: Ms, mp: kind === 'mp' ? MP_MODES[cfg.mp || 'tdm'] : null, D: DIFF[cfg.diff] || DIFF.normal,
    chars: [], P: null, t: 0, phase: cfg.attract ? 'live' : 'intro', phaseT: 0, attract: !!cfg.attract, ffa: kind === 'mp' && cfg.mp === 'ffa',
    score: [0, 0], ev: [], nades: [], smokes: [], rockets: [], crates: [], shells: [], drones: [null, null], radar: [0, 0], targets: null,
    feed: [], calls: [], pops: [], medals: [], hurt: [], hitMark: 0, hitKO: 0, hitHead: 0, supK: 0, flashK: 0, hurtK: 0, land: 0,
    intel: [{}, {}], cover: coverSpots(G), over: false, winner: -1, why: '', lastKO: null, lastCallT: -9, lastHQ: -9,
    stats: { shots: 0, hits: 0, kos: 0, downs: 0, assists: 0, heads: 0, bestStreak: 0, objs: 0, caps: 0, plants: 0, defuses: 0, nadeKOs: 0, longest: 0, xp: [], medals: {} },
    rec: newRecorder(), side: 0, slow: 1, fadeIn: 1, msg: null, seed: cfg.seed || 1,
  };
  W.introDur = cfg.attract ? 0 : kind === 'campaign' ? 6.5 : kind === 'range' ? 3 : 5;
  W.ffaSpawns = [];
  if (W.ffa) { for (const s of W.cover) if (Math.random() < 0.25) W.ffaSpawns.push([s.cx, s.cz]); }
  const lo = cfg.loadout || CLASSES.rifleman;
  if (kind === 'mp') setupMP(W, lo, save);
  else if (kind === 'campaign') setupCampaign(W, lo, save);
  else setupRange(W, lo, save);
  if (W.P) W.P.isPlayer = !cfg.attract;
  if (W.P && (cfg.attract || cfg.autoPlayer)) { W.P.bot = newBot(W, W.P); W.P.bot.role = W.kind === 'campaign' ? 'assault' : 'hunt'; if (W.flags) W.P.bot.flag = 1; W.P.bot.site = 0; }
  return W;
}
function addChar(W, team, name, isPlayer, lo) { const c = newChar(W, team, name, isPlayer, lo); W.chars.push(c); return c; }

/* ---------------------------------------------------------------- multiplayer setup */
function setupMP(W, lo, save) {
  const R = rng(W.seed * 977 + 3), md = W.mp, rank = save ? save.rank || 1 : 1;
  W.target = md.target; W.limit = md.limit;
  if (W.ffa) {
    W.P = addChar(W, 0, W.attract ? FFA_NAMES[0] : 'You', true, lo);
    for (let i = 1; i < md.size; i++) addChar(W, i + 1, FFA_NAMES[i % FFA_NAMES.length], false, botLoadout(R, 1, rank));
    W.chars.forEach((c, i) => { c.team = i === 0 ? 0 : i + 1; });
    W.score = new Array(W.chars.length + 2).fill(0);
  } else {
    W.P = addChar(W, 0, W.attract ? ALLIES[7] : 'You', true, lo);
    for (let i = 1; i < md.size; i++) addChar(W, 0, ALLIES[(i - 1) % ALLIES.length], false, botLoadout(R, 0, rank));
    for (let i = 0; i < md.size; i++) addChar(W, 1, RIVALS[(i + (W.seed % 5)) % RIVALS.length], false, botLoadout(R, 1, rank));
  }
  W.chars.forEach((c, i) => {
    if (c.bot) { c.bot.squad = (c.team * 10) + ((i % 3)); c.bot.role = 'hunt'; }
  });
  if (md.id === 'dom') {
    W.flags = W.M.dom.map((d, i) => { const p = nearestFloor(W.G, d[0], d[1]); return { name: 'ABC'[i], x: cw(W.G, p[0]), z: cwz(W.G, p[1]), owner: -1, prog: 0, by: -1, contested: false, r: 4.2 }; });
    W.chars.forEach((c, i) => { if (c.bot) c.bot.flag = i % 3; });
  }
  if (md.id === 'dem') { W.dem = { round: 1, wins: [0, 0], attack: 0, charge: null, phaseT: 0, carrier: null, dropped: null }; }
  firstSpawns(W);
  if (md.id === 'dem') demRound(W, true);
}
function firstSpawns(W) {
  const G = W.G;
  const per = [0, 0];
  for (const c of W.chars) {
    let p, yaw;
    if (W.ffa) { p = spawnPoint(W, c); yaw = Math.atan2(p[0], p[1]); }
    else {
      const t = W.side ? c.team ^ 1 : c.team, list = G.spawns[t], k = per[c.team]++;
      const s = list[k % list.length];
      p = [cw(G, s[0] + 0.5) + Math.floor(k / list.length) * 0.9, cwz(G, s[1] + 0.5) + (t ? -0.9 : 0.9) * Math.floor(k / list.length)];
      yaw = t === 0 ? 0 : Math.PI;
    }
    spawnAt(W, c, p[0], p[1], yaw);
  }
}

/* ---------------------------------------------------------------- campaign setup */
function setupCampaign(W, lo, save) {
  const Ms = W.mission, G = W.G;
  const mlo = Ms.loadout ? Object.assign({}, lo, Ms.loadout, { perks: lo.perks }) : lo;
  W.P = addChar(W, 0, W.attract ? 'Okoro' : 'You', true, mlo);
  const R = rng(W.seed * 31 + 7);
  const sp = W.P;
  spawnAt(W, sp, cw(G, Ms.spawn[0]), cwz(G, Ms.spawn[1]), Ms.yaw || 0);
  W.check = [sp.x, sp.z, sp.yaw];
  (Ms.allies || []).forEach((n, i) => {
    const c = addChar(W, 0, n, false, botLoadout(R, 0, 6)); c.bot.role = 'follow'; c.bot.slot = i;
    const bx = Math.sin(sp.yaw), bz = Math.cos(sp.yaw), rx = Math.cos(sp.yaw), rz = -Math.sin(sp.yaw), k = i - 1;
    const p = nearestFloor(G, Ms.spawn[0] + bx * (1 + (i === 1 ? 0.6 : 0)) + rx * k * 1.1, Ms.spawn[1] + bz * (1 + (i === 1 ? 0.6 : 0)) + rz * k * 1.1);
    spawnAt(W, c, cw(G, p[0]), cwz(G, p[1]), sp.yaw);
  });
  (Ms.enemies || []).forEach((e) => {
    for (let k = 0; k < e.n; k++) {
      const c = addChar(W, 1, RIVALS[W.chars.length % RIVALS.length], false, botLoadout(R, 1, 6 + W.D.idx * 3));
      const p = nearestFloor(G, e.at[0] + (k % 2) * 1.1 - 0.5, e.at[1] + Math.floor(k / 2) * 1.1);
      spawnAt(W, c, cw(G, p[0]), cwz(G, p[1]), Math.PI + rnd(-0.5, 0.5));
      c.bot.role = e.role; c.bot.home = [c.x, c.z];
      if (e.path) { c.bot.patrol = e.path.map((q) => { const f = nearestFloor(G, q[0], q[1]); return [cw(G, f[0]), cwz(G, f[1])]; }); c.bot.pi = 0; }
      if (Ms.stealth) { c.bot.calm = true; c.bot.alert = 0; c.lo.secondary = 'p11'; }
    }
  });
  W.stealth = !!Ms.stealth; W.alarm = false; W.ghost = true;
  W.missionT = 0; W.downsUsed = 0;
  if (Ms.vehicle) setupConvoy(W);
  if (Ms.crate) { const p = Ms.crate; W.crates.push({ x: cw(G, p[0]), y: 0, z: cwz(G, p[1]), vy: 0, landed: true, uses: 99, fixed: true }); }
  W.objI = -1; nextObjective(W);
  W.heli = null;
}
function setupConvoy(W) {
  const G = W.G, P = W.P;
  const x = cw(G, 7.5), z = cwz(G, 95);
  W.convoy = { trucks: [{ x, z, hp: 2200, hpMax: 2200, v: 0, lead: true }, { x: x - 0.5, z: z + 12, hp: 1600, hpMax: 1600, v: 0 }, { x: x + 0.4, z: z + 24, hp: 1600, hpMax: 1600, v: 0 }], block: 0, stopT: 0, spawnI: 0, endZ: cwz(G, 3) };
  P.lo = Object.assign({}, P.lo, { primary: 'turret' });
  P.w[0] = wState(weaponFrom('turret', 'iron', 'none', P.perks), false);
  P.heat = 0;
  P.mount = { x, y: 3.0, z: z - 0.6 };
}

/* ---------------------------------------------------------------- the range */
export const LESSONS = [
  { id: 'look', text: 'Look around', hint: 'Mouse, right stick or drag the right of the screen', check: (W) => W.lesson.look > 2.2 },
  { id: 'move', text: 'Walk to the yellow marker', hint: 'WASD, left stick or the left of the screen', at: [8, 15.5], check: (W, P) => near(W, P, 8, 15.5, 1.6) },
  { id: 'fire', text: 'Hit the three boards in lane one', hint: 'Click, RT or tap. Hold for automatic fire', check: (W) => W.lesson.hits >= 3, targets: 'lane' },
  { id: 'ads', text: 'Aim down the sights and hit the far board', hint: 'Right click, LT or the Aim button. Aimed shots go where the dot is', check: (W) => W.lesson.far >= 1, targets: 'far' },
  { id: 'reload', text: 'Reload', hint: 'R, X on a controller or the Reload button', check: (W, P) => W.lesson.reloads >= 1 },
  { id: 'crouch', text: 'Crouch, then go prone', hint: 'C to crouch, Z to go prone (B: tap crouch, hold prone)', check: (W) => W.lesson.prone },
  { id: 'slide', text: 'Sprint and slide', hint: 'Hold Shift to sprint, press C while sprinting. On a stick: click it in, then B', check: (W) => W.lesson.slide },
  { id: 'lean', text: 'Lean out from the post', hint: 'Q and E lean left and right (on touch, the Lean button)', check: (W) => W.lesson.lean > 0.6 },
  { id: 'vault', text: 'Vault the sandbags', hint: 'Run at the low wall and press Space (A, or the Jump button)', check: (W) => W.lesson.vault },
  { id: 'nade', text: 'Throw a frag into the pit', hint: 'G (LB, or the Frag button). Hold to cook, let go to throw', check: (W) => W.lesson.nade, at: [6, 11] },
  { id: 'course', text: 'Run the kill house', hint: 'Hit every board in the house as fast as you can', course: true, check: (W) => W.course && W.course.done },
];
function near(W, P, cx, cz, r) { return Math.hypot(P.x - cw(W.G, cx), P.z - cwz(W.G, cz)) < r * CS * 0.5 + 0.6; }
function setupRange(W, lo, save) {
  const G = W.G;
  W.P = addChar(W, 0, W.attract ? 'Okoro' : 'You', true, lo);
  spawnAt(W, W.P, cw(G, 8.5), cwz(G, 19.5), 0);
  W.check = [W.P.x, W.P.z, 0];
  W.targets = [];
  const add = (cx, cz, lane, moving) => { const f = nearestFloor(G, cx, cz); cx = f[0]; cz = f[1]; W.targets.push({ x: cw(G, cx), y: 0, z: cwz(G, cz), up: true, k: 1, hitT: 0, lane, moving: moving || 0, x0: cw(G, cx), ph: Math.random() * 6, course: lane === 'course' }); };
  add(2.5, 9, 'lane'); add(3.5, 5, 'lane'); add(2.5, 2.5, 'lane');
  add(9.5, 1.5, 'far');
  add(5.5, 6, 'free', 1.6); add(8.5, 4, 'free'); add(9.5, 8, 'free', 1);
  // the kill house boards, in the order the course raises them
  const house = [[13, 4], [15, 3], [17, 3.5], [20, 3], [22, 5], [19, 6.5], [15, 7], [14, 10], [18, 9.5], [21, 11], [17, 11.5], [13, 12.5]];
  house.forEach((p) => add(p[0] + 0.5, p[1] + 0.5, 'course'));
  W.targets.forEach((g) => { if (g.course) g.up = false; });
  W.lesson = { i: W.cfg.range === 'lesson' ? 0 : -1, look: 0, hits: 0, far: 0, reloads: 0, prone: false, slide: false, lean: 0, vault: false, nade: false, t: 0, done: false };
  W.rangeMode = W.cfg.range || 'lesson';
  if (W.rangeMode === 'course') startCourse(W);
}
function startCourse(W) {
  const G = W.G;
  spawnAt(W, W.P, cw(G, 13.5), cwz(G, 15.5), 0);
  W.course = { i: 0, t: 0, run: false, done: false, misses: 0, list: W.targets.filter((g) => g.course) };
  W.course.list.forEach((g) => { g.up = false; g.k = 0; });
}

/* ================================================================ objectives */
function nextObjective(W) {
  W.objI++;
  const Ms = W.mission;
  if (W.objI >= Ms.objs.length) { finishMatch(W, 0, 'mission'); return; }
  const o = Ms.objs[W.objI];
  const at = o.at ? nearestPt(W, o.at) : null;
  W.obj = { def: o, prog: 0, count: 0, t: 0, x: at ? at[0] : 0, z: at ? at[1] : 0, waveT: 3, contested: false, lost: 0, timer: o.timer || 0 };
  if (W.objI > 0 && W.P.alive) W.check = [W.P.x, W.P.z, W.P.yaw];
  if (o.heli) W.heliT = o.time - 18;
  if (!W.attract && W.objI > 0) { W.ev.push({ k: 'toast', text: o.text, small: 'New objective' }); SND.objective(); }
}
function nearestPt(W, at) { const p = nearestFloor(W.G, at[0], at[1]); return [cw(W.G, at[0]), cwz(W.G, at[1])]; }
function objMarker(W) {
  if (W.kind !== 'campaign' || !W.obj) return null;
  const o = W.obj.def;
  if (o.t === 'ko' || o.t === 'ride') return null;
  return [W.obj.x, o.t === 'plant' ? 1.3 : 1.8, W.obj.z, o.t === 'plant' ? (o.quiet ? 'Tag' : 'Plant') : o.t === 'hold' || o.t === 'defend' ? 'Hold' : o.t === 'board' ? 'Board' : 'Go'];
}
export function markers(W) {
  const out = [], P = W.P;
  const m = objMarker(W); if (m) out.push({ x: m[0], y: m[1], z: m[2], label: m[3], col: '#ffd36a', kind: 'obj' });
  if (W.flags) W.flags.forEach((f) => out.push({ x: f.x, y: 2.2, z: f.z, label: f.name, col: f.owner === P.team ? FACTIONS[0].ui : f.owner < 0 ? '#e8e2d6' : FACTIONS[1].ui, kind: 'flag', flag: f }));
  if (W.dem) {
    const D = W.dem, att = D.attack === P.team;
    if (D.charge) out.push({ x: D.charge.x, y: 1.4, z: D.charge.z, label: att ? 'Defend' : 'Disarm', col: '#ff6a4a', kind: 'site' });
    else W.demSites.forEach((s, i) => out.push({ x: s.x, y: 2.0, z: s.z, label: (att ? 'Plant ' : 'Defend ') + 'AB'[i], col: att ? '#ffd36a' : FACTIONS[0].ui, kind: 'site' }));
    if (D.dropped && att) out.push({ x: D.dropped.x, y: 1, z: D.dropped.z, label: 'Charge', col: '#ffd36a', kind: 'obj' });
  }
  for (const cr of W.crates) if (cr.landed && cr.uses > 0) out.push({ x: cr.x, y: 1.4, z: cr.z, label: 'Supplies', col: '#9de07a', kind: 'crate' });
  if (W.lesson && W.lesson.i >= 0 && W.lesson.i < LESSONS.length && LESSONS[W.lesson.i].at) { const a = LESSONS[W.lesson.i].at; out.push({ x: cw(W.G, a[0]), y: 1, z: cwz(W.G, a[1]), label: 'Here', col: '#ffd36a', kind: 'obj' }); }
  return out;
}
function updateObjective(W, dt) {
  const ob = W.obj; if (!ob || W.over) return;
  const o = ob.def, P = W.P;
  ob.t += dt; W.missionT += dt;
  const done = () => {
    W.stats.objs++;
    if (o.call) pushCall(W, o.call, true);
    addPop(W, 'OBJECTIVE', '#ffd36a'); xp(W, 'Objective', 300);
    W.ev.push({ k: 'haptic', kind: 'success', s: 0.8 });
    if (o.t === 'board' && W.heli) W.heli.state = 'away';
    if (o.blow) { const b = o.blow; W.ev.push({ k: 'boom', x: cw(W.G, b[0]), y: 4, z: cwz(W.G, b[1]), size: 2.2, big: true }); SND.boom(1.4, 0); }
    nextObjective(W);
  };
  if (W.devDone) { W.devDone = false; done(); return; }
  const inR = (c, r) => Math.hypot(c.x - ob.x, c.z - ob.z) < r;
  if (o.t === 'goto' || o.t === 'board') {
    if (P.alive && inR(P, (o.r || 2) * CS * 0.6)) {
      if (o.t === 'board' && W.heli && W.heli.state !== 'down') { /* wait */ } else done();
    }
    if (o.timer) { ob.timer -= dt; if (ob.timer <= 0 && !W.over) { finishMatch(W, 1, 'timer'); } }
    if (o.blowAll && ob.t > 1 && !ob.blown) { ob.blown = true; ['14.2,10.5', '17.8,10.5', '14.2,1.5'].forEach((s, i) => { const [a, b] = s.split(',').map(Number); W.shells.push({ x: cw(W.G, a), z: cwz(W.G, b), t: 6 + i * 2.5, size: 2.6, big: true, team: 0, owner: P, tank: true }); }); }
  } else if (o.t === 'ko') { if (ob.count >= o.n) done(); }
  else if (o.t === 'plant') {
    // hold Use beside the point
    const r = 1.9;
    if (P.alive && inR(P, r) && P.interact === 'obj') { ob.prog += dt; W.useK = ob.prog / o.time; if (ob.prog >= o.time) { SND.plant(); W.stats.plants++; done(); } }
    else { ob.prog = Math.max(0, ob.prog - dt * 0.5); }
  } else if (o.t === 'hold' || o.t === 'defend') {
    const R = (o.r || 4) * CS * 0.55;
    let mine = 0, foes = 0;
    for (const c of W.chars) { if (!c.alive) continue; if (inR(c, R)) { if (c.team === 0) mine++; else foes++; } }
    ob.contested = mine > 0 && foes > 0;
    if (o.t === 'hold') { if (mine && !foes) ob.prog += dt; }
    else {
      ob.prog += dt;
      if (foes && !mine) { ob.lost += dt; if (ob.lost > 12 && !W.over) finishMatch(W, 1, 'lost'); } else ob.lost = Math.max(0, ob.lost - dt * 0.5);
    }
    if (o.heli && ob.prog > o.time - 20 && !W.heli) W.heli = { state: 'in', t: 0, x: ob.x + 30, y: 40, z: ob.z + 60, tx: cw(W.G, 16), tz: cwz(W.G, 26.2) };
    if (ob.prog >= o.time) { if (o.heli && W.heli) { W.heli.state = 'down'; } done(); }
  } else if (o.t === 'ride') { /* the convoy decides */ }
  // waves of enemies
  if (o.waves && !W.over) {
    ob.waveT -= dt;
    const alive = W.chars.filter((c) => c.team === 1 && c.alive).length;
    const want = o.waves.alive[W.D.idx];
    if (ob.waveT <= 0 && alive < want) {
      ob.waveT = o.waves.every * (W.D.idx === 0 ? 1.3 : W.D.idx === 2 ? 0.8 : 1);
      spawnWave(W, o.waves.from, 1 + (Math.random() < 0.4 ? 1 : 0));
    }
  }
}
function spawnWave(W, from, n) {
  const G = W.G, P = W.P;
  for (let k = 0; k < n; k++) {
    let c = W.chars.find((x) => x.team === 1 && !x.alive && x.gone && !x.keep);
    if (!c) { if (W.chars.length >= 22) return; c = addChar(W, 1, RIVALS[W.chars.length % RIVALS.length], false, botLoadout(Math.random, 1, 6 + W.D.idx * 3)); }
    // a spawn far from the player, out of sight, on the side the wave comes from
    let best = null, bs = -1e9;
    for (let tries = 0; tries < 28; tries++) {
      const s = W.cover[(Math.random() * W.cover.length) | 0];
      const d = Math.hypot(s.x - P.x, s.z - P.z);
      if (d < 18 || d > 60) continue;
      let sc = -Math.abs(d - 30);
      const north = s.z < P.z - 6, edge = Math.abs(s.x) > G.gw * CS * 0.3 || Math.abs(s.z - P.z) > 16;
      if (from === 'north' && !north) sc -= 30;
      if (from === 'edges' && !edge) sc -= 20;
      if (from === 'flanks' && Math.abs(s.x - P.x) < 10) sc -= 20;
      if (clearLine(W, P.x, eyeY(P), P.z, s.x, 1.4, s.z, true)) sc -= 25;
      if (sc > bs) { bs = sc; best = s; }
    }
    if (!best) return;
    spawnAt(W, c, best.x, best.z, Math.atan2(best.x - P.x, best.z - P.z));
    c.bot.role = 'hunt'; c.bot.home = W.obj && W.obj.def.at ? [W.obj.x, W.obj.z] : null;
    if (W.obj && (W.obj.def.t === 'defend' || W.obj.def.t === 'hold')) c.bot.role = 'assault';
  }
}

/* ---------------------------------------------------------------- the convoy */
function stepConvoy(W, dt) {
  const V = W.convoy, G = W.G, P = W.P, lead = V.trucks[0];
  const nextBlock = V.block < ROADBLOCKS.length ? cwz(G, ROADBLOCKS[V.block] + 4.5) : V.endZ;
  const blocked = V.block < ROADBLOCKS.length && G.kind[ROADBLOCKS[V.block] * G.gw + 7] === 'c';
  if (V.block < ROADBLOCKS.length && !blocked) { V.block++; pushCall(W, 'Hearth: Roadblock is down. Driver, go!', true); xp(W, 'Roadblock', 250); addPop(W, 'ROADBLOCK CLEARED', '#ffd36a'); }
  let want = 4.2;
  if (lead.z - nextBlock < 0.5 && blocked) want = 0;
  else if (lead.z - nextBlock < 10 && blocked) want = 1.6;
  const enemiesNear = W.chars.some((c) => c.team === 1 && c.alive && Math.abs(c.z - lead.z) < 18);
  if (enemiesNear) want = Math.min(want, 2.6);
  if (!P.alive) want = 0;
  lead.v = damp(lead.v, want, 1.2, dt);
  lead.z -= lead.v * dt;
  for (let i = 1; i < V.trucks.length; i++) { const t = V.trucks[i], gap = V.trucks[i - 1].z + 12 - t.z; t.v = damp(t.v, clamp(-gap * 1.4 + V.trucks[i - 1].v, 0, 5), 2, dt); t.z -= t.v * dt; }
  P.mount.x = lead.x; P.mount.y = 3.05; P.mount.z = lead.z - 0.4; P.x = lead.x; P.z = lead.z - 0.4; P.y = 1.3;
  // ambushes as the trucks roll in
  const zCell = lead.z / CS + G.gh / 2;
  const TRIG = [90, 84, 74, 66, 60, 52, 44, 38, 30, 22, 17, 10];
  while (V.spawnI < TRIG.length && zCell < TRIG[V.spawnI]) {
    const tz = TRIG[V.spawnI] - 12;
    const n = 2 + W.D.idx + (V.spawnI % 3 === 2 ? 2 : 0);
    for (let k = 0; k < n; k++) {
      let c = W.chars.find((x) => x.team === 1 && !x.alive && x.gone);
      if (!c) { if (W.chars.length > 20) break; c = addChar(W, 1, RIVALS[W.chars.length % RIVALS.length], false, botLoadout(Math.random, 1, 8)); }
      const side = k % 2 ? 1 : 0, cx = side ? rnd(12.2, 13.8) : rnd(2.4, 3.6), cz = tz + rnd(-4, 4);
      const p = nearestFloor(G, cx, cz);
      spawnAt(W, c, cw(G, p[0]), cwz(G, p[1]), side ? -Math.PI / 2 : Math.PI / 2);
      c.bot.role = 'guard'; c.bot.home = [c.x, c.z];
    }
    V.spawnI++;
  }
  for (const t of V.trucks) if (t.hp <= 0 && !W.over) { finishMatch(W, 1, 'truck'); W.ev.push({ k: 'boom', x: t.x, y: 1.5, z: t.z, size: 1.8, big: true }); }
  if (lead.z <= V.endZ && !W.over) { W.stats.objs++; xp(W, 'Convoy home', 600); pushCall(W, W.obj.def.call, true); finishMatch(W, 0, 'mission'); }
  // the turret heats up
  P.heat = Math.max(0, (P.heat || 0) - dt * 0.42);
}

/* ================================================================ events: feed, calls, pops, xp */
function pushFeed(W, a, b, col, how, colB) { W.feed.unshift({ a, b, col, colB: colB || col, how, t: 0 }); if (W.feed.length > 6) W.feed.length = 6; }
export function pushCall(W, text, force) { if (W.attract) return; if (!force && W.t - W.lastCallT < 2.4) return; W.lastCallT = W.t; W.calls.unshift({ text, t: 0 }); if (W.calls.length > 3) W.calls.length = 3; SND.radio(); }
function say(W, kind, who, place, extra) {
  const L = LINES[kind]; if (!L || W.attract) return;
  if (who && who.bot && who.team !== W.P.team && !W.ffa) {
    // enemy chatter is only heard up close
    if (Math.hypot(who.x - W.P.x, who.z - W.P.z) > 20) return;
  }
  let s = pick(L).replace('{n}', who ? who.name : HQ).replace('{p}', place || 'ahead');
  if (extra) s = s.replace('{f}', extra);
  pushCall(W, s, kind.indexOf('enemy') === 0 || kind === 'nadeIn');
}
function addPop(W, text, col) { W.pops.push({ text, col, t: 0 }); if (W.pops.length > 4) W.pops.shift(); }
function xp(W, label, n) { if (W.attract) return; W.stats.xp.push([label, n]); W.P.score += n; if (W.kind === 'mp') W.P.streakPts += n; }
function medal(W, id) {
  if (W.attract) return;
  W.medals.push({ id, name: MEDALS[id], t: 0 }); if (W.medals.length > 3) W.medals.shift();
  W.stats.medals[id] = (W.stats.medals[id] || 0) + 1; xp(W, MEDALS[id], 50); SND.medal();
}

/* ================================================================ bodies */
function moveBody(W, c, wx, wz, speed, dt, jump) {
  const G = W.G;
  if (c.mount) { c.vx = c.vz = 0; return; }
  if (c.mantle) {
    const m = c.mantle; m.t += dt;
    const k = smooth01(m.t / m.dur);
    c.x = lerp(m.x0, m.x1, k); c.z = lerp(m.z0, m.z1, k); c.y = m.y0 + Math.sin(k * Math.PI) * (m.top + 0.25);
    if (m.t >= m.dur) { c.mantle = null; c.y = groundAt(G, c.x, c.z, RAD * 0.6, 0.6); c.vx = (m.x1 - m.x0) / m.dur * 0.5; c.vz = (m.z1 - m.z0) / m.dur * 0.5; if (c.isPlayer) { W.land = 0.4; SND.land(0.5); if (W.lesson) W.lesson.vault = true; } }
    return;
  }
  const k = c.onGround ? (c.stance === 'slide' ? 1.2 : 11) : 2.2;
  const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
  if (c.stance === 'slide') {
    const sp = Math.hypot(c.vx, c.vz);
    const ns = Math.max(0, sp - dt * 7.5);
    if (sp > 0.01) { c.vx *= ns / sp; c.vz *= ns / sp; }
  } else {
    c.vx = damp(c.vx, wx * speed, k, dt); c.vz = damp(c.vz, wz * speed, k, dt);
  }
  if (jump && c.onGround && c.stance === 'stand') {
    // vault a low wall in front instead of a hop
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const ax = c.x + fx * 0.9, az = c.z + fz * 0.9, bx = c.x + fx * 2.3, bz = c.z + fz * 2.3;
    const ka = G.kind[toCZ(G, az) * G.gw + toCX(G, ax)], kb = walkable(G, toCX(G, bx), toCZ(G, bz));
    if (ka === 'c' && kb) { c.mantle = { t: 0, dur: 0.48, x0: c.x, z0: c.z, x1: bx, z1: bz, y0: c.y, top: LOW_H }; if (c.isPlayer) SND.vault(); return; }
    c.vy = 5.4; c.onGround = false; c.air = true; if (c.isPlayer) SND.jump();
  }
  c.vy -= 17 * dt;
  const ox = c.x, oz = c.z;
  c.x += c.vx * dt; c.z += c.vz * dt;
  collide(G, c, RAD, c.y);
  for (let i = 0; i < W.chars.length; i++) {
    const o = W.chars[i]; if (o === c || !o.alive || !c.alive) continue;
    const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz), m = RAD * 2;
    if (d < m && d > 1e-4 && Math.abs(c.y - o.y) < 1.4) { const push = (m - d) * (o.isPlayer ? 1 : 0.5); c.x += dx / d * push; c.z += dz / d * push; }
  }
  collide(G, c, RAD, c.y);
  c.y += c.vy * dt;
  const g = groundAt(G, c.x, c.z, RAD * 0.7, c.y);
  if (c.y <= g) {
    if (!c.onGround && c.vy < -4 && c.isPlayer) { W.land = Math.min(1, -c.vy / 9); SND.land(W.land); }
    c.y = g; c.vy = 0; c.onGround = true; c.air = false;
  } else if (c.y > g + 0.05) { c.onGround = false; if (c.vy < -1.5) c.air = true; }
  if (c.onGround && c.y > g + 0.01) c.y = g;
  const moved = Math.hypot(c.x - ox, c.z - oz) / Math.max(dt, 1e-4);
  c.speed = moved;
  c.phase += moved * dt * Math.PI / (0.6 + 0.2 * moved);
  if (c.onGround && moved > 1.1 && c.stance !== 'slide') {
    c.footT -= moved * dt;
    if (c.footT <= 0) {
      c.footT = c.sprint ? 1.6 : c.stance === 'stand' ? 1.3 : 0.9;
      const loud = (c.sprint ? 1 : c.stance === 'stand' ? 0.6 : 0.3) * (c.perks.indexOf('light') >= 0 ? 0.35 : 1);
      W.ev.push({ k: 'step', c: c.id, x: c.x, z: c.z, loud });
      if (!c.isPlayer || true) SND.step(W, c, loud);
      if (loud > 0.5) hearNoise(W, c, c.x, c.z, 9 * loud, 'step');
    }
  }
}
function setStance(c, s) {
  if (c.stance === s) return;
  if (s === 'stand' && !canStand(c)) return;
  c.stance = s;
}
let WREF = null;
function canStand(c) { return true; }

/* ================================================================ weapons */
const _e = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };
function curW(c) { return c.w[c.cur]; }
export function spreadOf(c) {
  const w = curW(c).def;
  let s = lerp(w.hip, w.ads, c.adsK);
  const mv = Math.hypot(c.vx, c.vz);
  if (mv > 1.2) s *= 1 + 0.35 * (1 - c.adsK) + 0.2;
  if (!c.onGround) s *= 1.9;
  if (c.stance === 'crouch') s *= 0.8; else if (c.stance === 'prone') s *= 0.6;
  if (c.sprint) s *= 2.2;
  s += c.bloom * (1 - c.adsK * 0.7);
  if (c.bot) s *= 1.1;
  return s * Math.PI / 180;
}
function canFire(c) { const s = curW(c); return c.alive && s.reloadT <= 0 && s.swapT <= 0 && s.boltT <= 0 && !c.sprint && !c.mantle && c.cookT < 0 && c.meleeT <= 0 && c.stance !== 'slide'; }
function startReload(W, c) {
  const s = curW(c), d = s.def;
  if (s.reloadT > 0 || s.mag >= d.mag || s.spare <= 0 || !c.alive || d.mag > 999) return;
  s.reloadDur = s.mag === 0 ? d.reloadEmpty : d.reload;
  if (d.shell) s.reloadDur = d.reload;
  s.reloadT = s.reloadDur;
  c.sprint = false;
  if (c.isPlayer) { SND.reload(d); if (W.lesson) W.lesson.reloads++; }
  else if (Math.random() < 0.3 && c.bot.target) say(W, 'reload', c);
}
function finishReload(W, c) {
  const s = curW(c), d = s.def;
  if (d.shell) { s.mag++; s.spare--; if (s.mag < d.mag && s.spare > 0) { s.reloadT = d.reload; s.reloadDur = d.reload; if (c.isPlayer) SND.shell(); return; } }
  else { const need = d.mag - s.mag, n = Math.min(need, s.spare); s.mag += n; s.spare -= n; }
  s.reloadT = 0;
  if (c.isPlayer) SND.reloadDone();
}
function switchWeapon(W, c, i) {
  if (i === c.cur || c.mount) return;
  c.cur = i; const s = curW(c); s.reloadT = 0; s.swapT = 0.45 * (s.def.slot ? 0.8 : 1); c.adsK *= 0.3;
  if (c.isPlayer) { SND.swap(); W.ev.push({ k: 'swap' }); }
}
// One trigger pull: hitscan pellets with spread, recoil, the tracer and what it hits.
function shoot(W, c, yaw, pitch) {
  const s = curW(c), d = s.def;
  if (d.mag < 9999 && s.mag <= 0) { startReload(W, c); return false; }
  if (d.mag < 9999) s.mag--;
  if (c.mount) { c.heat = (c.heat || 0) + 0.055; if (c.heat >= 1) { c.overheat = 2.2; } }
  eyePos(c, _e);
  c.firing = 0.12; c.fired = true;
  if (d.rocket) { fireRocket(W, c, yaw, pitch); }
  else {
    const n = d.pellets || 1, sp = spreadOf(c);
    for (let p = 0; p < n; p++) {
      const a = Math.random() * TAU, m = (n > 1 ? Math.sqrt(Math.random()) : Math.pow(Math.random(), 0.7)) * sp;
      aimDir(yaw + Math.cos(a) * m, pitch + Math.sin(a) * m, _d);
      const H = castRay(W, c, _e.x, _e.y, _e.z, _d.x, _d.y, _d.z, 160);
      onHit(W, c, d, H, p === 0);
      if (!W.attract) suppressNear(W, c, _e.x, _e.y, _e.z, H.x, H.y, H.z);
    }
  }
  // recoil: the view climbs, the spread blooms
  const kick = d.kick * (c.stance === 'prone' ? 0.6 : c.stance === 'crouch' ? 0.82 : 1) * (1 - c.adsK * 0.25);
  c.recoilP += kick * Math.PI / 180; c.recoilY += (Math.random() - 0.4) * d.side * Math.PI / 180 * 2;
  c.bloom = Math.min(d.hip * 1.2, c.bloom + d.kick * 0.35);
  if (d.mode === 'bolt') s.boltT = 1 / d.rate; else if (d.mode === 'pump') s.boltT = 1 / d.rate;
  // noise
  const loud = d.quiet ? 0.18 : 1;
  hearNoise(W, c, c.x, c.z, d.quiet ? 6 : 48, 'shot');
  SND.shot(W, c, d, loud);
  W.ev.push({ k: 'muzzle', c: c.id, quiet: !!d.quiet, w: d.id });
  if (c.isPlayer) { W.stats.shots++; W.ev.push({ k: 'recoil', kick }); }
  if (c.team === W.P.team && c.isPlayer && W.lesson) { /* counted on hit */ }
  if (d.quiet !== true && c.team !== W.P.team && !W.ffa) c.revealT = 2.5; else if (!d.quiet) c.revealT = 2.5;
  return true;
}
function onHit(W, c, d, H, first) {
  W.ev.push({ k: 'shot', c: c.id, ox: _e.x, oy: _e.y, oz: _e.z, ex: H.x, ey: H.y, ez: H.z, hit: H.kind, nx: H.nx, ny: H.ny, nz: H.nz, w: d.id, tracer: first || Math.random() < 0.35 });
  W.rec.shot(W, c.id, _e.x, _e.y, _e.z, H.x, H.y, H.z, H.kind);
  if (H.kind === 'char') {
    const T = H.c, dist = H.t;
    let dmg = dist <= d.near ? d.dmg : dist >= d.far ? d.dmgFar : lerp(d.dmg, d.dmgFar, (dist - d.near) / Math.max(1, d.far - d.near));
    if (H.head) dmg *= d.pellets ? 1.2 : 1.45;
    if (c.mount) dmg *= 1;
    damage(W, T, c, dmg, H.x, H.y, H.z, H.head, 'gun', dist);
  } else if (H.kind === 'barrel') {
    const i = H.cell; W.G.bhp[i] -= d.dmg * (d.pellets ? 0.4 : 1);
    if (W.G.bhp[i] <= 0) blowBarrel(W, i, c);
  } else if (H.kind === 'target') {
    const g = H.tgt; if (g.up) { g.up = false; g.hitT = 0; W.hitMark = 1; W.hitHead = H.head ? 1 : 0; SND.hitTarget(); rangeHit(W, g, H.head); }
  } else if (H.kind === 'truck') {
    H.truck.hp -= d.dmg * 0.1 * (W.D.idx === 0 ? 0.6 : W.D.idx === 2 ? 1.25 : 1);
  }
}
function suppressNear(W, c, ax, ay, az, bx, by, bz) {
  for (const o of W.chars) {
    if (!o.alive || o === c || (!W.ffa && o.team === c.team)) continue;
    const d2 = segPointD2(ax, ay, az, bx, by, bz, o.x, eyeY(o), o.z);
    if (d2 < 3.2) {
      o.suppress = Math.min(1, o.suppress + 0.22);
      if (o.isPlayer) { W.supK = Math.min(1, W.supK + 0.3); SND.crack(); }
      else if (o.bot) { o.bot.nearT = 0.8; if (!o.bot.target || !o.bot.vis) { o.bot.threatFrom = [c.x, c.z]; o.bot.threatT = 2; } }
    }
  }
}
// A hit on a person: sparks and dust on the vest, a flinch, and at zero they go down.
export function damage(W, T, by, amt, x, y, z, head, how, dist) {
  if (!T.alive || T.spawnShield > 0 || W.over && W.phase !== 'live') return;
  if (T.bot && W.stealth && by && by.isPlayer && !W.alarm && T.bot.alert < 0.5 && how === 'gun' && amt >= 30) amt = Math.max(amt, T.hp);
  if (T.isPlayer) { amt *= W.D.dmgIn; if (T.mount) amt *= 0.5; if (W.attract) amt = 0; }
  if (how === 'blast' && T.perks.indexOf('bulwark') >= 0) amt *= 0.66;
  if (T.armor > 0) { const a = Math.min(T.armor, amt * 0.5); T.armor -= a; amt -= a; }
  T.hp -= amt; T.regenT = 0; T.hitFlash = 1; T.flinch = 1; T.lastHitBy = by; T.lastHitT = W.t;
  if (by) T.dmgFrom.set(by.id, (T.dmgFrom.get(by.id) || 0) + amt);
  W.ev.push({ k: 'hit', c: T.id, x, y, z, head, by: by ? by.id : -1 });
  if (T.isPlayer && by) { W.hurt.push({ a: Math.atan2(-(by.x - T.x), -(by.z - T.z)), t: 0 }); if (W.hurt.length > 5) W.hurt.shift(); W.hurtK = Math.min(1, W.hurtK + amt / 60); SND.hurt(); W.ev.push({ k: 'haptic', kind: 'hit', s: clamp(amt / 40, 0.2, 1) }); }
  if (by && by.isPlayer && T !== by) { W.hitMark = 1; W.hitHead = head ? 1 : 0; W.stats.hits++; SND.hitMark(head); }
  if (T.bot) {
    const B = T.bot; B.alert = 1; B.calm = false;
    if (by && (!B.target || !B.vis)) { B.target = by; B.reactT = Math.min(B.reactT, 0.25); B.lastSeen = [by.x, by.z]; }
    if (W.stealth && !W.alarm && by && by.isPlayer && T.hp > 0) raiseAlarm(W, T);
    if (T.hp > 0 && Math.random() < 0.3) say(W, 'hurt', T);
  }
  if (T.hp <= 0) knockDown(W, T, by, head, how, dist);
}
function knockDown(W, T, by, head, how, dist) {
  T.alive = false; T.hp = 0; T.downT = 0; T.sprint = false; T.adsK = 0; T.mantle = null; T.cookT = -1; T.leanK = 0; T.useT = 0;
  T.downs++; T.streak = 0;
  if (T.hasCharge && W.dem) { T.hasCharge = false; W.dem.carrier = null; W.dem.dropped = { x: T.x, z: T.z }; }
  T.respawnT = W.mp ? W.mp.respawn : 6;
  W.ev.push({ k: 'down', c: T.id, by: by ? by.id : -1, head, how });
  W.rec.event(W, 'down', T.id, by ? by.id : -1);
  const killer = by && by !== T ? by : null;
  const wname = how === 'blast' ? (by && by.lastBlast ? by.lastBlast : 'Frag') : how === 'melee' ? 'Takedown' : killer ? curW(killer).def.name : '';
  pushFeed(W, killer ? killer.name : T.name, T.name, killer ? teamCol(W, killer) : '#e8e2d6', wname, teamCol(W, T));
  if (killer) {
    killer.kos++; killer.streak++; killer.cheerT = 1.2; killer.score += 100; if (killer.bot) killer.streakPts += 100;
    if (!W.ffa) { if (W.mp && W.mp.id === 'tdm') { W.score[killer.team]++; } }
    else { W.score[killer.team]++; }
    W.lastKO = { t: W.t, killer: killer.id, victim: T.id, head, how, dist: dist || 0 };
    if (killer.bot && killer.team === W.P.team && killer !== W.P && Math.random() < 0.4) say(W, 'got', killer);
    if (killer.bot) { killer.bot.morale = Math.min(1.2, killer.bot.morale + 0.1); }
  }
  // assists
  T.dmgFrom.forEach((v, id) => { const o = W.chars[id]; if (o && o !== killer && v > 25) { o.assists++; o.score += 50; if (o.isPlayer) { W.stats.assists++; xp(W, 'Assist', 50); if (W.kind === 'mp') o.streakPts += 0; } } });
  T.dmgFrom.clear();
  if (killer && killer.isPlayer) {
    W.stats.kos++; W.hitKO = 1;
    xp(W, 'Knockdown', 100);
    if (head) { W.stats.heads++; medal(W, 'precision'); }
    if (dist > 45) medal(W, 'long');
    if (how === 'blast') { W.stats.nadeKOs++; medal(W, 'grenade'); }
    if (how === 'melee') medal(W, 'silent');
    if (W.t - (W.lastPKO || -9) < 4) { W.multi = (W.multi || 1) + 1; if (W.multi === 2) medal(W, 'double'); else if (W.multi === 3) medal(W, 'triple'); else if (W.multi >= 4) medal(W, 'fury'); } else W.multi = 1;
    W.lastPKO = W.t;
    if (killer.streak === 5) medal(W, 'streak5'); if (killer.streak === 10) medal(W, 'streak10');
    if (W.stats.kos === 1 && W.kind === 'mp' && !W.firstDone) { W.firstDone = true; medal(W, 'first'); }
    if (W.P.lastHitBy === T && W.t - W.P.lastHitT < 6) medal(W, 'revenge');
    W.stats.bestStreak = Math.max(W.stats.bestStreak, killer.streak);
    W.stats.longest = Math.max(W.stats.longest, Math.round(dist || 0));
    SND.koMark();
    W.ev.push({ k: 'haptic', kind: 'heavy', s: 0.5 });
    if (Math.random() < 0.35) { const mate = W.chars.find((o) => o.bot && o.team === 0 && o.alive && !W.ffa); if (mate) say(W, 'nice', mate); }
  }
  if (T.isPlayer) {
    W.stats.downs++;
    W.downCam = { t: 0, killer: killer ? killer.id : -1, x: T.x, y: T.y, z: T.z, dist: killer ? Math.round(Math.hypot(killer.x - T.x, killer.z - T.z)) : 0, wname };
    SND.downed(); W.ev.push({ k: 'haptic', kind: 'fail', s: 1 });
    if (W.kind === 'campaign') { T.respawnT = 3.4; W.downsUsed++; }
    if (W.kind === 'range') T.respawnT = 1.5;
  } else if (T.team === W.P.team && !W.ffa && T.bot) { say(W, 'down', T); }
  // morale ripples through their side
  for (const o of W.chars) if (o.bot && o.alive && o.team === T.team && Math.hypot(o.x - T.x, o.z - T.z) < 18) { o.bot.morale -= 0.12; if (o.bot.morale < 0.25 && Math.random() < 0.4) { say(W, 'fallback', o); o.bot.coverT = 4; } }
  if (W.kind === 'campaign' && T.team === 1 && W.obj && W.obj.def.t === 'ko') W.obj.count++;
  if (W.stealth && T.team === 1) T.bot.found = false;
  if (W.mp && W.mp.id === 'dem') demCheck(W);
  if (W.mp && !W.over) {
    const tgt = W.target;
    if (W.mp.id === 'tdm' && killer && W.score[killer.team] >= tgt) finishMatch(W, killer.team, 'score', T);
    if (W.ffa && killer && W.score[killer.team] >= tgt) finishMatch(W, killer.team, 'score', T);
  }
  if (W.stealth && T.team === 1 && !W.alarm) { /* a sentry down where others patrol can be found */ T.bot.body = true; }
}
export function teamCol(W, c) { if (W.ffa) return c.isPlayer ? FACTIONS[0].ui : '#ffb47a'; return FACTIONS[c.team === W.P.team ? 0 : 1].ui; }
function blowBarrel(W, i, by) {
  const G = W.G; if (G.kind[i] !== 'e') return;
  G.kind[i] = 'r'; G.h[i] = 0.12; G.block[i] = 0;
  const cx = i % G.gw, cz = (i / G.gw) | 0, x = cw(G, cx + 0.5), z = cwz(G, cz + 0.5);
  W.ev.push({ k: 'barrel', i });
  explode(W, x, 0.6, z, 7.5, 170, by, 'Barrel', 1.4);
  // roadblocks give way when their barrels go
  if (W.convoy) { for (const b of ROADBLOCKS) if (Math.abs(cz - b) <= 1) { for (let x2 = 4; x2 <= 11; x2++) { const j = b * G.gw + x2; if (G.kind[j] === 'c' || G.kind[j] === 'e') { if (G.kind[j] === 'e') { G.kind[j] = 'r'; W.ev.push({ k: 'barrel', i: j }); } else G.kind[j] = 'r'; G.h[j] = 0.12; G.block[j] = 0; } } W.ev.push({ k: 'grid' }); } }
}
// A blast: dust, grit, sparks and a shove. Damage falls off with distance and needs a clear line.
export function explode(W, x, y, z, R, dmg, by, name, size) {
  W.ev.push({ k: 'boom', x, y, z, size: size || 1 });
  SND.boom(size || 1, Math.hypot(x - W.P.x, z - W.P.z));
  if (by) by.lastBlast = name;
  hearNoise(W, by, x, z, 60, 'boom');
  for (const c of W.chars) {
    if (!c.alive) continue;
    const d = Math.hypot(c.x - x, chestY(c) - y, c.z - z);
    if (d > R) continue;
    if (!clearLine(W, x, y + 0.3, z, c.x, chestY(c), c.z, false)) continue;
    if (by && !W.ffa && c.team === by.team && c !== by) continue;
    const k = Math.pow(1 - d / R, 1.2);
    damage(W, c, by, dmg * k * (c === by ? 0.6 : 1), c.x, chestY(c), c.z, false, 'blast', d);
    if (c.isPlayer) { W.shakeK = Math.min(1, (W.shakeK || 0) + k * 1.5); }
  }
  if (Math.hypot(W.P.x - x, W.P.z - z) < R * 2.4) { W.shakeK = Math.min(1, (W.shakeK || 0) + 0.5 * (1 - Math.hypot(W.P.x - x, W.P.z - z) / (R * 2.4))); W.ev.push({ k: 'haptic', kind: 'heavy', s: 0.7 }); }
  // chain barrels
  const G = W.G;
  for (const i of G.barrels) {
    if (G.kind[i] !== 'e') continue;
    const bx = cw(G, i % G.gw + 0.5), bz = cwz(G, ((i / G.gw) | 0) + 0.5);
    if (Math.hypot(bx - x, bz - z) < 5.5) { G.bhp[i] = -1; W.chainT = W.chainT || []; W.chainT.push({ i, t: 0.18 + Math.random() * 0.3, by }); }
  }
  if (W.targets) for (const g of W.targets) if (g.up && Math.hypot(g.x - x, g.z - z) < R * 0.7) { g.up = false; g.hitT = 0; rangeHit(W, g, false); }
}

/* ---------------------------------------------------------------- grenades and rockets */
function throwNade(W, c, kind, cook) {
  const yaw = c.yaw, pitch = c.pitch + 0.18;
  eyePos(c, _e); aimDir(yaw, pitch, _d);
  const sp = c.isPlayer ? 15.5 : 13;
  W.nades.push({ kind, x: _e.x + _d.x * 0.4, y: _e.y + _d.y * 0.4 - 0.1, z: _e.z + _d.z * 0.4, vx: _d.x * sp + c.vx * 0.5, vy: _d.y * sp + 2.6, vz: _d.z * sp + c.vz * 0.5, fuse: kind === 'frag' ? 3.2 - (cook || 0) : kind === 'flash' ? 1.6 : 1.4, owner: c, t: 0, rest: false, spin: Math.random() * 6, warned: false });
  c.throwT = 0.5;
  if (c.isPlayer) { SND.throwNade(); if (W.lesson && kind === 'frag') W.lessonNade = W.nades[W.nades.length - 1]; }
  else if (c.team === W.P.team && !W.ffa) say(W, kind === 'frag' ? 'nade' : kind, c);
}
function botThrowAt(W, c, tx, tz, kind) {
  eyePos(c, _e);
  const dx = tx - _e.x, dz = tz - _e.z, d = Math.hypot(dx, dz);
  const t = clamp(d / 12, 0.6, 1.8), vy = (0 - _e.y + 0.5 * 17 * t * t) / t * 0.62;
  W.nades.push({ kind, x: _e.x, y: _e.y, z: _e.z, vx: dx / t * 0.95, vy, vz: dz / t * 0.95, fuse: kind === 'frag' ? 2.6 + Math.random() * 0.5 : 1.6, owner: c, t: 0, rest: false, spin: Math.random() * 6, warned: false });
  c.throwT = 0.6;
  if (!W.ffa && c.team === W.P.team) say(W, kind === 'frag' ? 'nade' : kind, c);
}
function stepNades(W, dt) {
  const G = W.G;
  for (let i = W.nades.length - 1; i >= 0; i--) {
    const n = W.nades[i];
    n.t += dt; n.fuse -= dt;
    if (!n.rest) {
      const sub = 4, h = dt / sub;
      for (let s = 0; s < sub; s++) {
        n.vy -= 17 * h;
        const nx = n.x + n.vx * h, ny = n.y + n.vy * h, nz = n.z + n.vz * h;
        const ocx = toCX(G, n.x), ocz = toCZ(G, n.z), cx = toCX(G, nx), cz = toCZ(G, nz);
        const top = cellH(G, cx, cz);
        if (top > ny && (cx !== ocx || cz !== ocz) && cellH(G, ocx, ocz) <= n.y) {
          if (cx !== ocx) n.vx *= -0.42; if (cz !== ocz) n.vz *= -0.42; n.vy *= 0.8;
          if (n.t > 0.05) SND.nadeBounce(n);
          continue;
        }
        const floor = cellH(G, cx, cz) < 50 ? cellH(G, cx, cz) : 0;
        if (ny <= floor + 0.05) {
          n.y = floor + 0.05; n.vy = Math.abs(n.vy) > 2 ? -n.vy * 0.32 : 0; n.vx *= 0.62; n.vz *= 0.62;
          if (Math.abs(n.vy) < 0.4 && Math.hypot(n.vx, n.vz) < 0.4) { n.rest = true; n.vx = n.vz = n.vy = 0; }
          else if (n.t > 0.05) SND.nadeBounce(n);
          n.x = nx; n.z = nz;
        } else { n.x = nx; n.y = ny; n.z = nz; }
      }
      n.spin += dt * 9;
    }
    // bots see frags near their feet
    if (n.kind === 'frag' && !n.warned && n.fuse < 2.2 && n.t > 0.4) {
      n.warned = true;
      for (const c of W.chars) if (c.bot && c.alive && Math.hypot(c.x - n.x, c.z - n.z) < 7 && (W.ffa || c.team !== n.owner.team)) { c.bot.flee = [n.x, n.z]; c.bot.fleeT = 1.6 + Math.random() * 0.5; if (Math.random() < 0.5) say(W, 'nadeIn', c); }
    }
    if (n.fuse <= 0) {
      W.nades.splice(i, 1);
      if (n.kind === 'frag') explode(W, n.x, n.y + 0.1, n.z, 7, 150, n.owner, 'Frag', 1.0);
      else if (n.kind === 'smoke') { W.smokes.push({ x: n.x, y: 0, z: n.z, r: 0.3, life: 16, t: 0, owner: n.owner }); W.ev.push({ k: 'smoke', x: n.x, z: n.z }); SND.smokePop(); }
      else if (n.kind === 'flash') flashBang(W, n);
      if (W.lessonNade === n && W.lesson) { const pit = [cw(G, 6), cwz(G, 11)]; if (Math.hypot(n.x - pit[0], n.z - pit[1]) < 4) W.lesson.nade = true; }
    }
  }
  for (let i = W.smokes.length - 1; i >= 0; i--) { const s = W.smokes[i]; s.t += dt; s.r = Math.min(5.2, s.r + dt * (s.t < 1.5 ? 3.2 : 0.2)); if (s.t > s.life - 3) s.r = Math.max(0, s.r - dt * 1.6); if (s.t > s.life) W.smokes.splice(i, 1); }
  for (let i = W.rockets.length - 1; i >= 0; i--) {
    const r = W.rockets[i]; r.t += dt;
    const step = dt * r.sp;
    const H = castRay(W, r.owner, r.x, r.y, r.z, r.dx, r.dy, r.dz, step);
    if (H.kind !== 'none' && H.t < step || r.t > 4) {
      W.rockets.splice(i, 1);
      if (H.kind === 'barrel') blowBarrel(W, H.cell, r.owner);
      explode(W, H.x - r.dx * 0.2, H.y - r.dy * 0.2, H.z - r.dz * 0.2, 6, 170, r.owner, 'RK-3 Pike', 1.2);
      continue;
    }
    r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step;
  }
  if (W.chainT) for (let k = W.chainT.length - 1; k >= 0; k--) { const ch = W.chainT[k]; ch.t -= dt; if (ch.t <= 0) { W.chainT.splice(k, 1); blowBarrel(W, ch.i, ch.by); } }
}
function fireRocket(W, c, yaw, pitch) {
  eyePos(c, _e); const sp = spreadOf(c) * 0.3; aimDir(yaw + (Math.random() - 0.5) * sp, pitch + (Math.random() - 0.5) * sp, _d);
  W.rockets.push({ x: _e.x + _d.x * 0.6, y: _e.y + _d.y * 0.6 - 0.08, z: _e.z + _d.z * 0.6, dx: _d.x, dy: _d.y, dz: _d.z, sp: 46, t: 0, owner: c });
}
function flashBang(W, n) {
  W.ev.push({ k: 'flash', x: n.x, y: n.y + 0.3, z: n.z }); SND.flashBang(Math.hypot(n.x - W.P.x, n.z - W.P.z));
  for (const c of W.chars) {
    if (!c.alive) continue;
    const dx = n.x - c.x, dz = n.z - c.z, d = Math.hypot(dx, dz);
    if (d > 16) continue;
    eyePos(c, _e);
    if (!clearLine(W, n.x, n.y + 0.3, n.z, _e.x, _e.y, _e.z, false)) continue;
    aimDir(c.yaw, c.pitch, _d);
    const facing = (dx * _d.x + dz * _d.z) / Math.max(0.01, d);
    const k = clamp((1 - d / 16) * (0.35 + 0.65 * clamp(facing * 0.5 + 0.5, 0, 1)), 0, 1);
    c.flashT = Math.max(c.flashT, 0.6 + 2.8 * k);
    if (c.isPlayer) { W.flashK = Math.max(W.flashK, k); W.ev.push({ k: 'haptic', kind: 'heavy', s: k }); }
    else if (c.bot) { c.bot.reactT = Math.max(c.bot.reactT, c.flashT); c.bot.vis = false; }
  }
}

/* ---------------------------------------------------------------- scorestreaks */
export function streakReady(W, c, s) { const cost = Math.round(s.cost * (c.perks.indexOf('hard') >= 0 ? 0.8 : 1)); return c.streakPts >= cost && !c.streaksUsed[s.id]; }
export function useStreak(W, c, id) {
  const s = STREAKS.find((x) => x.id === id); if (!s || !streakReady(W, c, s) || !c.alive) return false;
  c.streaksUsed[id] = true;
  const ally = W.ffa ? c.team === W.P.team : c.team === W.P.team;
  if (id === 'drone') { const t = W.ffa ? (c.isPlayer ? 0 : 1) : c.team; W.radar[t] = 30; W.drones[t] = { t: 30, x: c.x, z: c.z, a: 0, team: t }; say(W, ally ? 'droneOurs' : 'droneTheirs', null); }
  else if (id === 'supply') {
    eyePos(c, _e); aimDir(c.yaw, Math.min(c.pitch, -0.2), _d);
    const H = castRay(W, c, _e.x, _e.y, _e.z, _d.x, _d.y, _d.z, 30);
    const p = nearestFloor(W.G, toCX(W.G, H.x - _d.x) + 0.5, toCZ(W.G, H.z - _d.z) + 0.5);
    W.crates.push({ x: cw(W.G, p[0]), y: 30, z: cwz(W.G, p[1]), vy: -4, landed: false, uses: 3, team: c.team });
    say(W, 'supply', null);
  } else if (id === 'mortar') {
    let tx = 0, tz = 0;
    if (c.isPlayer) { eyePos(c, _e); aimDir(c.yaw, c.pitch, _d); const H = castRay(W, c, _e.x, _e.y, _e.z, _d.x, _d.y, _d.z, 70); tx = H.x; tz = H.z; }
    else { const foes = W.chars.filter((o) => o.alive && (W.ffa ? o !== c : o.team !== c.team)); const f = foes[(Math.random() * foes.length) | 0]; if (!f) return false; tx = f.x; tz = f.z; }
    for (let k = 0; k < 3; k++) W.shells.push({ x: tx + rnd(-4, 4), z: tz + rnd(-4, 4), t: 1.6 + k * 0.75 + Math.random() * 0.3, size: 1.3, team: c.team, owner: c });
    say(W, ally ? 'mortarOurs' : 'mortarTheirs', null);
    if (!ally) SND.alarm();
  }
  if (c.isPlayer) { W.ev.push({ k: 'toast', text: s.name, small: 'Scorestreak' }); SND.streak(); }
  return true;
}
function stepStreakStuff(W, dt) {
  for (let t = 0; t < 2; t++) { W.radar[t] = Math.max(0, W.radar[t] - dt); const d = W.drones[t]; if (d) { d.t -= dt; d.a += dt * 0.35; if (d.t <= 0) W.drones[t] = null; } }
  for (let i = W.shells.length - 1; i >= 0; i--) {
    const s = W.shells[i]; s.t -= dt;
    if (!s.whistled && s.t < 1.1) { s.whistled = true; SND.whistle(Math.hypot(s.x - W.P.x, s.z - W.P.z)); }
    if (s.t <= 0) { W.shells.splice(i, 1); explode(W, s.x, 0.3, s.z, s.tank ? 12 : 6.5, s.tank ? 200 : 180, s.owner, s.tank ? 'Fuel tank' : 'Mortar', s.size); if (s.tank) W.ev.push({ k: 'plume', x: s.x, z: s.z }); }
  }
  for (const cr of W.crates) {
    if (!cr.landed) { cr.y += cr.vy * dt; if (cr.y <= 0) { cr.y = 0; cr.landed = true; W.ev.push({ k: 'dust', x: cr.x, z: cr.z }); SND.land(0.8); } }
  }
  for (let i = W.crates.length - 1; i >= 0; i--) if (W.crates[i].uses <= 0) W.crates.splice(i, 1);
}
function resupply(W, c) {
  for (const s of c.w) { s.spare = s.def.spare + s.def.mag; s.mag = s.def.mag; s.reloadT = 0; }
  const deep = c.perks.indexOf('deep') >= 0;
  c.frag = deep ? 3 : 2; c.tac = deep ? 3 : 2; c.armor = 50;
}

/* ================================================================ hearing and stealth */
function hearNoise(W, src, x, z, R, kind) {
  if (!src) return;
  for (const o of W.chars) {
    if (!o.bot || !o.alive || (!W.ffa && o.team === src.team) || o === src) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    let r = R; if (o.perks.indexOf('ears') >= 0) r *= 1.4;
    if (d > r) continue;
    const B = o.bot;
    if (W.stealth && !W.alarm && B.calm) {
      if (kind === 'shot' || kind === 'boom') { B.alert = Math.max(B.alert, kind === 'boom' ? 1 : 0.7 + (1 - d / r) * 0.4); B.heard = [x, z]; B.heardT = 6; if (B.alert >= 1) raiseAlarm(W, o); else say(W, 'enemyHear', o); }
      else if (kind === 'step' && d < r * 0.7) { B.alert = Math.max(B.alert, 0.35 + (1 - d / r) * 0.3); B.heard = [x, z]; B.heardT = 4; }
    } else if (!B.vis) { B.heard = [x, z]; B.heardT = kind === 'step' ? 2.5 : 4; }
  }
}
function raiseAlarm(W, who) {
  if (W.alarm) return;
  W.alarm = true; W.ghost = false;
  say(W, 'enemyAlarm', who);
  SND.alarm();
  for (const c of W.chars) if (c.bot && c.team === 1) { c.bot.calm = false; c.bot.alert = 1; c.bot.role = 'hunt'; c.bot.target = W.P; c.bot.lastSeen = [W.P.x, W.P.z]; c.bot.reactT = 0.4 + Math.random() * 0.6; }
  W.ev.push({ k: 'toast', text: 'Alarm raised', small: 'They know you are here' });
  // reinforcements from the far quay
  if (W.obj) W.obj.def = Object.assign({}, W.obj.def, { waves: { alive: [3, 4, 5], every: 9, from: 'north' } });
}
// How visible a body is to a watcher: stance, movement, light, distance.
function visibility(W, o, c, d) {
  let v = 1;
  if (c.stance === 'crouch') v *= 0.6; else if (c.stance === 'prone') v *= 0.32;
  const mv = Math.hypot(c.vx, c.vz); v *= mv < 0.5 ? 0.6 : mv > 5 ? 1.4 : 1;
  if (W.look.night) v *= 0.62;
  if (c.firing > 0 && !curW(c).def.quiet) v *= 3;
  v *= clamp(1.25 - d / (W.look.night ? 26 : 50), 0.15, 1.25);
  return v;
}

/* ================================================================ the player */
export function stepPlayer(W, c, dt, I) {
  if (!c.alive || W.phase !== 'live' || W.over) { c.adsK = damp(c.adsK, 0, 10, dt); return; }
  const s = curW(c), d = s.def;
  c.yaw -= I.lx; c.pitch = clamp(c.pitch - I.ly, -1.42, 1.42);
  if (c.mount) c.pitch = clamp(c.pitch, -0.55, 0.42);
  if (W.lesson) W.lesson.look += Math.abs(I.lx) + Math.abs(I.ly);
  // recoil pulls the view and settles back (partly)
  const rec = c.recoilP * Math.min(1, dt * 14), recY = c.recoilY * Math.min(1, dt * 14);
  c.pitch = clamp(c.pitch + rec * 0.85, -1.42, 1.42); c.yaw -= recY;
  c.recoilP -= rec; c.recoilY -= recY;
  c.bloom = damp(c.bloom, 0, 3.2, dt);
  // weapon switching
  if (I.weaponTo >= 0) switchWeapon(W, c, I.weaponTo);
  if (I.nextWeapon) switchWeapon(W, c, c.cur ^ 1);
  // stance
  if (I.crouchHit) {
    if (c.sprint && c.stance === 'stand' && c.onGround) { c.stance = 'slide'; c.slideT = 0.72; const sp = Math.max(8.4, c.speed * 1.25), dx = -Math.sin(c.yaw), dz = -Math.cos(c.yaw); c.vx = dx * sp; c.vz = dz * sp; c.sprint = false; SND.slide(); if (W.lesson) W.lesson.slide = true; }
    else setStance(c, c.stance === 'crouch' ? 'stand' : 'crouch');
  }
  if (I.proneHit) { setStance(c, c.stance === 'prone' ? 'crouch' : 'prone'); if (c.stance === 'prone' && W.lesson) W.lesson.prone = true; }
  if (c.stance === 'slide') { c.slideT -= dt; if (c.slideT <= 0) c.stance = 'crouch'; }
  if (I.jumpHit && c.stance !== 'stand' && c.stance !== 'slide') { setStance(c, 'stand'); I.jumpHit = false; }
  const sk = c.stance === 'stand' ? 0 : 1;
  c.stanceK = damp(c.stanceK, sk, c.stance === 'slide' ? 18 : 10, dt);
  // lean
  const leanWant = c.stance !== 'slide' && !c.sprint && !c.mount ? I.lean : 0;
  if (leanWant) { const rx = Math.cos(c.yaw) * leanWant * 0.7, rz = -Math.sin(c.yaw) * leanWant * 0.7; if (!walkable(W.G, toCX(W.G, c.x + rx), toCZ(W.G, c.z + rz)) && W.G.kind[toCZ(W.G, c.z + rz) * W.G.gw + toCX(W.G, c.x + rx)] !== 'c') c.leanK = damp(c.leanK, 0, 10, dt); else c.leanK = damp(c.leanK, leanWant, 9, dt); }
  else c.leanK = damp(c.leanK, 0, 9, dt);
  if (W.lesson) W.lesson.lean = Math.max(W.lesson.lean, Math.abs(c.leanK));
  // movement
  const fw = -I.mz, st = I.mx;
  const wantAds = I.aim && s.reloadT <= 0 && !c.mantle;
  c.sprintCool = Math.max(0, c.sprintCool - dt);
  const canSprint = fw > 0.45 && !wantAds && c.onGround && c.stance === 'stand' && c.stamina > 0.05 && !c.mount && c.cookT < 0;
  if (I.sprint && canSprint && !c.sprint) { c.sprint = true; if (s.reloadT > 0 && !d.shell) s.reloadT = 0; }
  if (!I.sprint || !canSprint || (I.fire && c.sprint)) { if (c.sprint) c.sprintCool = c.perks.indexOf('swift') >= 0 ? 0.12 : 0.24; c.sprint = false; }
  if (I.fire && c.sprint) c.sprint = false;
  c.stamina = clamp(c.stamina + (c.sprint ? -dt / (c.perks.indexOf('swift') >= 0 ? 8 : 5) : dt / 4), 0, 1);
  const adsTime = d.adsT * (c.perks.indexOf('swift') >= 0 && c.sprintCool > 0 ? 0.8 : 1);
  c.adsK = clamp(c.adsK + (wantAds && c.sprintCool <= 0 ? dt / adsTime : -dt / (adsTime * 0.8)), 0, 1);
  let speed = c.sprint ? 7.3 : 4.7;
  if (c.stance === 'crouch') speed = 2.5; else if (c.stance === 'prone') speed = 1.0;
  speed *= lerp(1, 0.58, c.adsK) * d.move;
  if (c.flashT > 0) speed *= 0.6;
  const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
  let wx, wz;
  if (I.abs) { wx = I.mx; wz = I.mz; } else { wx = -sy * fw + cy * st; wz = -cy * fw - sy * st; }
  moveBody(W, c, wx, wz, speed, dt, I.jumpHit);
  // aim sway with a scope, steadied by holding breath (Shift while aiming)
  if (c.adsK > 0.6 && (d.zoom > 2 || d.optic === 'scope')) {
    c.sway += dt;
    const hold = I.sprint && c.breath > 0;
    c.breath = clamp(c.breath + (hold ? -dt / 3.5 : dt / 5), 0, 1);
    const amp = (hold ? 0.08 : 1) * (c.stance === 'prone' ? 0.4 : 1) * 0.0022 * d.zoom;
    c.yaw += Math.cos(c.sway * 0.9) * amp * dt * 60 * 0.3; c.pitch += Math.sin(c.sway * 1.7) * amp * dt * 60 * 0.22;
  }
  // grenades: hold to cook a frag, let go to throw
  if (c.throwT > 0) c.throwT -= dt;
  if (I.fragDown && c.cookT < 0 && c.frag > 0 && c.throwT <= 0 && !c.mount) { c.cookT = 0; SND.pin(); }
  if (c.cookT >= 0) {
    c.cookT += dt;
    if (!I.fragDown || c.cookT > 3.2) { c.frag--; throwNade(W, c, 'frag', Math.min(c.cookT, 3.1)); c.cookT = -1; }
  }
  if (I.tacHit && c.tac > 0 && c.throwT <= 0 && c.cookT < 0 && !c.mount) { c.tac--; throwNade(W, c, c.lo.tactical || 'smoke', 0); }
  // use: plant, disarm, resupply, a quiet takedown from behind
  c.interact = I.use ? findInteract(W, c) : null;
  if (I.meleeHit || (I.useHit && !c.interact)) tryMelee(W, c);
  if (I.useHit) { for (const cr of W.crates) if (cr.landed && cr.uses > 0 && Math.hypot(cr.x - c.x, cr.z - c.z) < 2.2) { resupply(W, c); cr.uses--; SND.pickup(); W.ev.push({ k: 'toast', text: 'Resupplied', small: 'Ammo, grenades, armour' }); break; } }
  // streaks
  for (const sk2 of STREAKS) if (I['streak_' + sk2.id]) useStreak(W, c, sk2.id);
  if (c.meleeT > 0) c.meleeT -= dt;
  // fire
  if (I.reloadHit) startReload(W, c);
  if (c.overheat > 0) c.overheat -= dt;
  runGun(W, c, dt, I.fire && !(c.overheat > 0), I.fireHit && !(c.overheat > 0), c.yaw, c.pitch);
  c.firing = Math.max(0, c.firing - dt);
}
function findInteract(W, c) {
  if (W.kind === 'campaign' && W.obj && W.obj.def.t === 'plant' && Math.hypot(c.x - W.obj.x, c.z - W.obj.z) < 1.9) return 'obj';
  if (W.dem) {
    const D = W.dem;
    if (D.attack === c.team && c.hasCharge && !D.charge) for (let i = 0; i < W.demSites.length; i++) if (Math.hypot(c.x - W.demSites[i].x, c.z - W.demSites[i].z) < 2.6) return 'plant' + i;
    if (D.charge && D.attack !== c.team && Math.hypot(c.x - D.charge.x, c.z - D.charge.z) < 1.8) return 'defuse';
  }
  return null;
}
function tryMelee(W, c) {
  if (c.meleeT > 0) return;
  c.meleeT = 0.7;
  for (const o of W.chars) {
    if (!o.alive || o === c || (!W.ffa && o.team === c.team)) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
    if (d > 1.7) continue;
    const f = (dx * -Math.sin(c.yaw) + dz * -Math.cos(c.yaw)) / Math.max(0.01, d);
    if (f < 0.6) continue;
    // from behind and unaware: a quiet takedown
    const behind = (-Math.sin(o.yaw) * dx + -Math.cos(o.yaw) * dz) / d > 0.3;
    const unaware = !o.bot || !o.bot.vis || o.bot.target !== c;
    if (behind && unaware) { damage(W, o, c, 999, o.x, chestY(o), o.z, false, 'melee', d); if (c.isPlayer) SND.takedown(); }
    else damage(W, o, c, 55, o.x, chestY(o), o.z, false, 'melee', d);
    W.ev.push({ k: 'melee', c: c.id });
    return;
  }
  W.ev.push({ k: 'melee', c: c.id }); SND.whoosh();
}
function runGun(W, c, dt, held, pressed, yaw, pitch) {
  const s = curW(c), d = s.def;
  s.fireT -= dt; s.swapT = Math.max(0, s.swapT - dt); s.boltT = Math.max(0, s.boltT - dt);
  if (s.reloadT > 0) {
    if (d.shell && pressed && s.mag > 0) { s.reloadT = 0; }
    else { s.reloadT -= dt; if (s.reloadT <= 0) finishReload(W, c); return; }
  }
  if (!canFire(c)) return;
  if (d.mag < 9999 && s.mag <= 0) { if (pressed || held || !c.isPlayer) { if (s.spare > 0) startReload(W, c); else if (c.isPlayer && pressed) SND.dry(); } return; }
  if (s.fireT > 0) return;
  if (d.mode === 'auto' && held) { shoot(W, c, yaw, pitch); s.fireT += 1 / d.rate; if (s.fireT < 0) s.fireT = 0; }
  else if (d.mode !== 'auto' && pressed) { shoot(W, c, yaw, pitch); s.fireT = 1 / d.rate; }
}

/* ================================================================ the bots */
function prefDist(c) { const d = curW(c).def; return d.mode === 'bolt' ? 34 : d.id === 'ld4' ? 26 : d.id === 'tr12' ? 6 : d.id === 'ks9' ? 9 : d.id === 'hm40' ? 18 : 15; }
function enemyOf(W, c, o) { return o !== c && o.alive && (W.ffa ? true : o.team !== c.team); }
function botThink(W, c) {
  const B = c.bot, D = W.D;
  eyePos(c, _e);
  // what can I see: a cone, light, smoke, being blinded
  let best = null, bs = 1e9;
  const fwx = -Math.sin(B.aimYaw), fwz = -Math.cos(B.aimYaw);
  const sight = W.look.night ? 34 : 64, cone = B.calm ? 0.42 : B.alert > 0.5 ? 0.0 : 0.2;
  if (c.flashT <= 0) for (const o of W.chars) {
    if (!enemyOf(W, c, o) || o.ghostT > 0) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
    if (d > sight && !(o.revealT > 0)) continue;
    const facing = (dx * fwx + dz * fwz) / Math.max(d, 0.01);
    const threat = B.target === o && B.vis;
    if (facing < cone && d > 4 && !threat) continue;
    const ty = chestY(o), hy = headY(o);
    if (!clearLine(W, _e.x, _e.y, _e.z, o.x, ty, o.z, true) && !clearLine(W, _e.x, _e.y, _e.z, o.x, hy, o.z, true)) continue;
    if (W.stealth && B.calm) {
      // noticing takes time: a meter that fills faster up close, in the open, on the move
      const v = visibility(W, B, o, d) * D.notice;
      B.alert = Math.min(1.2, B.alert + v * 0.26 * (B.seenT > 0 ? 1.5 : 1));
      B.seenT = 0.5; B.heard = [o.x, o.z]; B.heardT = 3;
      if (B.alert < 1) { if (B.alert > 0.45 && B.callT <= 0) { B.callT = 6; say(W, 'enemyHear', c); } continue; }
      raiseAlarm(W, c);
    }
    let s = d - (threat ? 14 : 0) + (o.isPlayer && D.idx === 0 ? 6 : 0) + (o.hasCharge ? -8 : 0) + (o.mount ? -10 : 0);
    if (s < bs) { bs = s; best = o; }
  }
  B.seenT = Math.max(0, B.seenT - 0.25); B.callT -= 0.25;
  if (best) {
    if (B.target !== best || !B.vis) {
      const [a, b] = D.react;
      B.reactT = Math.max(0.12, rnd(a, b) * (B.target === best ? 0.5 : 1) / B.form * (c.suppress > 0.5 ? 1.4 : 1));
      B.ready = false;
      if (!B.vis && Math.random() < 0.6 && B.spotT <= 0) { B.spotT = 4; if (!W.ffa && c.team === W.P.team) say(W, 'spot', c, landmark(W, best.x, best.z)); else if (!W.ffa) say(W, 'enemySpot', c, best.isPlayer ? 'there' : landmark(W, best.x, best.z)); }
    }
    B.target = best; B.vis = true; B.lastSeen = [best.x, best.z]; B.lostT = 0; B.alert = 1;
    if (!W.ffa) W.intel[c.team][best.id] = { x: best.x, z: best.z, t: W.t };
  } else {
    B.vis = false;
    if (B.target && (!B.target.alive || (B.lostT += 0.25) > 4)) B.target = null;
  }
  B.spotT -= 0.25;
  // radar from a drone overhead
  if (!W.ffa && W.radar[c.team] > 0 && !B.target && Math.random() < 0.3) {
    let nb = null, nd = 1e9;
    for (const o of W.chars) { if (!enemyOf(W, c, o) || (o.perks.indexOf('ghost') >= 0 && o.speed > 0.5)) continue; const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < nd) { nd = d; nb = o; } }
    if (nb) W.intel[c.team][nb.id] = { x: nb.x, z: nb.z, t: W.t };
  }
  chooseGoal(W, c);
}
function chooseGoal(W, c) {
  const B = c.bot, D = W.D, P = W.P;
  let goal = null, mode = 'move';
  const T = B.target, dist = T ? Math.hypot(T.x - c.x, T.z - c.z) : 0;
  if (B.fleeT > 0 && B.flee) {
    const dx = c.x - B.flee[0], dz = c.z - B.flee[1], l = Math.hypot(dx, dz) || 1;
    const gx = c.x + dx / l * 6, gz = c.z + dz / l * 6;
    if (walkable(W.G, toCX(W.G, gx), toCZ(W.G, gz))) { goal = [gx, gz]; mode = 'flee'; }
  }
  const objective = W.dem && (c.hasCharge || (c.team === W.dem.attack && (W.roundT < 75 || !!W.dem.dropped)) || (W.dem.charge && c.team !== W.dem.attack));
  if (!goal && objective && (!T || !B.vis || dist > 7)) { goal = roleGoal(W, c); mode = 'move'; }
  if (!goal && T && B.vis) {
    const lowMorale = B.morale < 0.35;
    B.coverBan = (B.coverBan || 0) - 0.25;
    if (B.mode === 'cover') { B.coverAcc = (B.coverAcc || 0) + 0.25; if (B.coverAcc > 6 + B.form * 3) { B.coverAcc = 0; B.coverBan = 7 + Math.random() * 4; B.coverT = 0; B.mode = 'move'; B.flankT = 0; } }
    const needCover = B.coverBan <= 0 && ((c.hp < 55 && Math.random() < D.cover) || (curW(c).reloadT > 0 && Math.random() < D.cover * 0.8) || (c.suppress > 0.6 && Math.random() < 0.6) || (lowMorale && Math.random() < 0.5));
    if (B.mode === 'cover' && B.coverT > 0) { goal = B.goal; mode = 'cover'; }
    else if (needCover) {
      const spot = pickCover(W, c, T);
      if (spot) { goal = [spot.x, spot.z]; mode = 'cover'; B.coverT = 2.4 + Math.random() * 2; B.coverLow = spot.low; if (Math.random() < 0.25) say(W, 'cover', c); }
    }
    if (!goal && B.mode === 'flank' && B.flankT > 0) { goal = B.goal; mode = 'flank'; }
    if (!goal && (Math.random() < D.flank * 0.1 || B.coverBan > 6) && dist > 10 && B.morale > 0.4) {
      const px = -(T.z - c.z) / dist, pz = (T.x - c.x) / dist, sd = Math.random() < 0.5 ? 1 : -1;
      for (const k of [sd, -sd]) {
        const gx = T.x + px * 10 * k - (T.x - c.x) / dist * 3, gz = T.z + pz * 10 * k - (T.z - c.z) / dist * 3;
        if (walkable(W.G, toCX(W.G, gx), toCZ(W.G, gz))) { goal = [gx, gz]; mode = 'flank'; B.flankT = 5 + Math.random() * 3; if (Math.random() < 0.5) say(W, 'flank', c, landmark(W, T.x, T.z)); break; }
      }
    }
    if (!goal) {
      mode = 'fight';
      const pd = prefDist(c);
      if (dist > pd + 8) goal = [T.x, T.z];
      else if (dist < pd - 5) { const ax = c.x - (T.x - c.x) / dist * 4, az = c.z - (T.z - c.z) / dist * 4; if (walkable(W.G, toCX(W.G, ax), toCZ(W.G, az))) goal = [ax, az]; }
    }
  }
  // a rival out of sight but known: suppress the corner, or throw a grenade at it
  if (!goal && T && !B.vis && B.lastSeen && B.lostT < 3 && Math.hypot(B.lastSeen[0] - c.x, B.lastSeen[1] - c.z) < 28) {
    if (B.nadeT <= 0 && c.frag > 0 && Math.random() < D.nade * 0.5 && Math.hypot(B.lastSeen[0] - c.x, B.lastSeen[1] - c.z) > 7 && !W.attract) {
      c.frag--; B.nadeT = 12 + Math.random() * 10; botThrowAt(W, c, B.lastSeen[0], B.lastSeen[1], 'frag');
    } else if (B.suppressT <= 0 && Math.random() < 0.35 && curW(c).def.mode === 'auto') { B.suppressT = 1.2 + Math.random(); mode = 'suppress'; if (Math.random() < 0.3) say(W, 'suppress', c); }
  }
  if (!goal && mode !== 'fight' && mode !== 'suppress') goal = roleGoal(W, c);
  B.mode = mode;
  if (goal) {
    const moved = !B.goal || Math.hypot(goal[0] - B.goal[0], goal[1] - B.goal[1]) > 1.8;
    B.goal = goal;
    if (moved || !B.path || B.pathT <= 0) { B.path = findPath(W.G, c.x, c.z, goal[0], goal[1]); B.pathT = 1.6 + Math.random() * 0.6; }
  } else { B.path = null; }
}
function roleGoal(W, c) {
  const B = c.bot, P = W.P;
  // what I heard
  if (B.heard && B.heardT > 0 && !(W.stealth && B.calm && B.alert < 0.5)) {
    if (Math.hypot(B.heard[0] - c.x, B.heard[1] - c.z) > 1.5) return B.heard.slice();
  }
  if (W.stealth && B.calm) {
    if (B.alert > 0.35 && B.heard) { B.waitT = 0; return B.heard.slice(); }
    if (B.alert < 0.2 && B.prevAlert > 0.3 && Math.random() < 0.5) say(W, 'enemyCalm', c);
    B.prevAlert = B.alert;
    // a body found raises the alarm
    for (const o of W.chars) if (o.team === c.team && !o.alive && !o.gone && o.bot.body && Math.hypot(o.x - c.x, o.z - c.z) < 9 && clearLine(W, c.x, 1.6, c.z, o.x, 0.4, o.z, true)) { o.bot.body = false; say(W, 'enemyBody', c); raiseAlarm(W, c); }
    if (B.role === 'patrol' && B.patrol) {
      const p = B.patrol[B.pi % B.patrol.length];
      if (Math.hypot(p[0] - c.x, p[1] - c.z) < 1.0) { if (B.waitT <= 0) B.waitT = 1.5 + Math.random() * 2.5; B.waitT -= 0.25; if (B.waitT <= 0.05) B.pi++; return null; }
      return p.slice();
    }
    return B.home ? B.home.slice() : null;
  }
  if (W.convoy) {
    // ambushers fight from their spot by the road
    return B.home ? B.home.slice() : null;
  }
  if (W.kind === 'campaign') {
    if (B.role === 'follow' && P.alive) {
      const k = (B.slot || 0) - 1, back = 3 + Math.abs(k) * 0.9;
      const gx = P.x + Math.sin(P.yaw) * back + Math.cos(P.yaw) * k * 1.8, gz = P.z + Math.cos(P.yaw) * back - Math.sin(P.yaw) * k * 1.8;
      const dP = Math.hypot(P.x - c.x, P.z - c.z);
      if (W.obj && (W.obj.def.t === 'hold' || W.obj.def.t === 'defend')) {
        // spread round the zone, facing out
        const a = (B.slot || 0) * 1.6 + 0.4, R = 3.5;
        const p = nearestFloor(W.G, toCX(W.G, W.obj.x + Math.cos(a) * R) + 0.5, toCZ(W.G, W.obj.z + Math.sin(a) * R) + 0.5);
        return [cw(W.G, p[0]), cwz(W.G, p[1])];
      }
      if (dP > 4.5) return walkable(W.G, toCX(W.G, gx), toCZ(W.G, gz)) ? [gx, gz] : [P.x, P.z];
      return null;
    }
    if (B.role === 'guard' || B.role === 'post') {
      if (B.home && Math.hypot(B.home[0] - c.x, B.home[1] - c.z) > 6) return B.home.slice();
      if (B.role === 'guard' && Math.random() < 0.04 && B.home) { const a = Math.random() * TAU, r = Math.random() * 4; const g = [B.home[0] + Math.cos(a) * r, B.home[1] + Math.sin(a) * r]; if (walkable(W.G, toCX(W.G, g[0]), toCZ(W.G, g[1]))) return g; }
      return B.goal;
    }
    if (B.role === 'assault' && W.obj) return [W.obj.x + rnd(-3, 3), W.obj.z + rnd(-3, 3)];
    // hunt the squad
    return P.alive ? [P.x + rnd(-2, 2), P.z + rnd(-2, 2)] : null;
  }
  if (W.flags) return domGoal(W, c);
  if (W.dem) return demGoal(W, c);
  // hunt: freshest team intel, else sweep cover
  let tgt = null, tt = -1;
  if (!W.ffa) { const I = W.intel[c.team]; for (const id in I) { const it = I[id], o = W.chars[id]; if (o && o.alive && W.t - it.t < 8 && it.t > tt) { tt = it.t; tgt = [it.x, it.z]; } } }
  else { let nd = 1e9; for (const o of W.chars) { if (!enemyOf(W, c, o)) continue; const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < nd && (o.revealT > 0 || d < 20)) { nd = d; tgt = [o.x, o.z]; } } }
  if (tgt) return tgt;
  if (!B.goal || Math.hypot(B.goal[0] - c.x, B.goal[1] - c.z) < 2 || B.goalT < 0) {
    const s = W.cover[(Math.random() * W.cover.length) | 0]; B.goalT = 12; return [s.x, s.z];
  }
  return B.goal;
}
function pickCover(W, c, T) {
  let best = null, bs = 1e9;
  eyePos(T, _d);
  for (const s of W.cover) {
    const d = Math.hypot(s.x - c.x, s.z - c.z); if (d > 14 || d < 0.5) continue;
    if (Math.hypot(s.x - T.x, s.z - T.z) < 6) continue;
    const hy = s.low ? 0.95 : 1.5;
    if (clearLine(W, _d.x, _d.y, _d.z, s.x, hy, s.z, false)) continue;
    let sc = d;
    for (const o of W.chars) if (o !== c && o.alive && o.bot && o.bot.mode === 'cover' && o.bot.goal && Math.hypot(o.bot.goal[0] - s.x, o.bot.goal[1] - s.z) < 1) sc += 20;
    if (sc < bs) { bs = sc; best = s; }
  }
  return best;
}
export function stepBot(W, c, dt) {
  const B = c.bot, D = W.D, s = curW(c), d = s.def;
  if (!c.alive || c.mount) return;
  B.thinkT -= dt; B.pathT -= dt; B.coverT -= dt; B.flankT -= dt; B.goalT -= dt; B.nadeT -= dt; B.suppressT -= dt; B.fleeT = (B.fleeT || 0) - dt; B.heardT -= dt; B.threatT = (B.threatT || 0) - dt;
  if (B.thinkT <= 0) { B.thinkT = 0.22 + Math.random() * 0.1; botThink(W, c); }
  B.reactT -= dt; B.morale += (0.65 - B.morale) * Math.min(1, dt * 0.05);
  if (W.stealth && B.calm) B.alert = Math.max(0, B.alert - dt * 0.05);
  let held = false, pressed = false, fighting = false;
  const T = B.target;
  let wantYaw = B.aimYaw, wantPitch = 0;
  if (T && T.alive && B.vis && c.flashT <= 0) {
    fighting = true;
    eyePos(c, _e);
    const ty = chestY(T) + (Math.random() < 0.08 ? 0.35 : 0);
    const dx = T.x - _e.x, dz = T.z - _e.z, hd = Math.hypot(dx, dz);
    B.errT -= dt;
    if (B.reactT <= 0 && !B.ready) { B.ready = true; B.settle = 0.8; B.errT = 0; }
    B.settle = Math.max(0, B.settle - dt * 1.1);
    B.nearT = Math.max(0, (B.nearT || 0) - dt);
    if (B.errT <= 0) {
      B.errT = 0.28 + Math.random() * 0.4;
      const e = D.aim * Math.PI / 180 * (1 + hd / 26) * (T.stance !== 'stand' ? 1.25 : 1) * (Math.hypot(T.vx, T.vz) > 3 ? 1.3 : 1) * (1 + B.settle * 1.4) * (B.nearT > 0 ? 1.5 : 1) * (2 - B.form) * (1 + c.suppress * 0.8);
      B.errX = (Math.random() - 0.5) * 2 * e; B.errY = (Math.random() - 0.5) * e;
    }
    wantYaw = Math.atan2(-dx, -dz) + B.errX; wantPitch = Math.atan2(ty - _e.y, hd) + B.errY;
    const err = Math.abs(angDiff(B.aimYaw, wantYaw - B.errX));
    if (B.reactT <= 0 && B.hesT <= 0 && hd < d.far * 1.4 + 10 && err < 0.16) {
      B.fireT -= dt;
      if (d.mode === 'auto') { if (B.fireT <= 0) { B.firingNow = !B.firingNow; B.fireT = B.firingNow ? 0.35 + Math.random() * 0.6 : (0.3 + Math.random() * 0.45) * (c.suppress > 0.6 ? 2 : 1); } held = B.firingNow; }
      else { pressed = B.fireT <= 0 && err < (d.mode === 'bolt' ? 0.03 : 0.08); if (pressed) B.fireT = (d.mode === 'bolt' ? 1.3 : 0.32) + Math.random() * 0.4; }
    }
    // grenade a rival dug in behind cover
    if (B.nadeT <= 0 && c.frag > 0 && hd > 8 && hd < 26 && T.stance !== 'stand' && Math.random() < D.nade * 0.02 && !W.attract && !W.convoy) { c.frag--; B.nadeT = 14 + Math.random() * 10; botThrowAt(W, c, T.x, T.z, 'frag'); }
  } else if (B.mode === 'suppress' && B.lastSeen && B.suppressT > 0) {
    eyePos(c, _e);
    const dx = B.lastSeen[0] - _e.x, dz = B.lastSeen[1] - _e.z, hd = Math.hypot(dx, dz);
    wantYaw = Math.atan2(-dx, -dz) + Math.sin(W.t * 3 + c.id) * 0.05; wantPitch = Math.atan2(1.0 - _e.y, hd);
    held = Math.abs(angDiff(B.aimYaw, wantYaw)) < 0.2 && Math.sin(W.t * 6 + c.id) > -0.3;
  } else {
    if (Math.hypot(c.vx, c.vz) > 0.6) wantYaw = Math.atan2(-c.vx, -c.vz);
    else if (B.heard && B.heardT > 0) wantYaw = Math.atan2(-(B.heard[0] - c.x), -(B.heard[1] - c.z));
    else if (B.lastSeen) wantYaw = Math.atan2(-(B.lastSeen[0] - c.x), -(B.lastSeen[1] - c.z));
    else if (B.threatFrom && B.threatT > 0) wantYaw = Math.atan2(-(B.threatFrom[0] - c.x), -(B.threatFrom[1] - c.z));
  }
  // out of a fight the head keeps checking
  B.scanT -= dt; if (B.scanT <= 0) { B.scanT = 0.9 + Math.random() * 1.8; B.scanTo = fighting ? 0 : (Math.random() - 0.5) * (B.calm ? 1.8 : 1.2); }
  if (!fighting && Math.hypot(c.vx, c.vz) < 0.6) wantYaw += B.scanTo;
  const track = fighting ? D.track * (c.suppress > 0.5 ? 0.6 : 1) : 4;
  B.aimYaw += angDiff(B.aimYaw, wantYaw) * Math.min(1, track * dt);
  B.aimPitch = damp(B.aimPitch, clamp(wantPitch, -0.9, 0.9), fighting ? track : 4, dt);
  c.yaw = B.aimYaw; c.pitch = B.aimPitch;
  c.flinch = Math.max(0, c.flinch - dt * 4); c.cheerT = Math.max(0, c.cheerT - dt);
  if (s.mag <= 0 || (!fighting && s.mag < d.mag * 0.35 && s.spare > 0)) startReload(W, c);
  if (s.spare <= 0 && s.mag <= 0) { s.spare = d.mag * 2; }
  // ADS when fighting at range
  c.adsK = damp(c.adsK, fighting && Math.hypot(T.x - c.x, T.z - c.z) > 10 && !c.sprint ? 1 : 0, 6, dt);
  runGun(W, c, dt, held, pressed, c.yaw, c.pitch);
  c.firing = Math.max(0, c.firing - dt);
  // walk the path
  let wx = 0, wz = 0;
  if (B.path && B.path.length) {
    let wp = B.path[0];
    if (Math.hypot(wp[0] - c.x, wp[1] - c.z) < 0.7) { B.path.shift(); wp = B.path[0]; }
    if (wp) { const dx = wp[0] - c.x, dz = wp[1] - c.z, l = Math.hypot(dx, dz) || 1; wx = dx / l; wz = dz / l; if (B.path.length === 1 && l < 1.2) { wx *= l; wz *= l; } }
  }
  if (fighting && B.mode !== 'cover' && B.mode !== 'flee') {
    B.strafeT -= dt;
    if (B.strafeT <= 0) { B.strafeT = 0.5 + Math.random() * 1.2; B.strafeDir = Math.random() < 0.5 ? -1 : 1; }
    const k = d.mode === 'bolt' ? 0.15 : 0.7;
    wx += Math.cos(c.yaw) * B.strafeDir * k; wz += -Math.sin(c.yaw) * B.strafeDir * k;
    if (!walkable(W.G, toCX(W.G, c.x + wx * 1.2), toCZ(W.G, c.z + wz * 1.2))) B.strafeDir *= -1;
  }
  for (const o of W.chars) { if (o === c || !o.alive || (W.ffa ? true : o.team !== c.team)) continue; const dx = c.x - o.x, dz = c.z - o.z, dd = Math.hypot(dx, dz); if (dd < 1.3 && dd > 0.01) { wx += dx / dd * (1.3 - dd) * 1.5; wz += dz / dd * (1.3 - dd) * 1.5; } }
  const inCover = B.mode === 'cover' && B.goal && Math.hypot(B.goal[0] - c.x, B.goal[1] - c.z) < 1.0;
  if (B.prevCoverT > 0 && B.coverT <= 0 && inCover && fighting) B.hesT = 0.25 + Math.random() * 0.6 * (2 - B.form);
  B.prevCoverT = B.coverT;
  if (B.hesT > 0) { B.hesT -= dt; wx = 0; wz = 0; }
  if ((B.nearT || 0) > 0.35) { wx *= 0.4; wz *= 0.4; }
  // stance: down behind low cover, pop up to shoot; flat when pinned
  let st = 'stand';
  if (inCover && B.coverLow) { B.peekT -= dt; if (B.peekT <= 0) B.peekT = 2 + Math.random() * 1.5; st = B.peekT > 1.2 && s.reloadT <= 0 ? 'stand' : 'crouch'; }
  if (c.suppress > 0.7 && !fighting) st = 'crouch';
  if (W.stealth && B.calm) st = 'stand';
  if (d.mode === 'bolt' && fighting && B.mode === 'fight' && Math.hypot(c.vx, c.vz) < 0.5) st = W.D.idx > 0 && c.id % 2 ? 'prone' : 'crouch';
  if (W.convoy && fighting && c.id % 3 === 0) st = 'crouch';
  c.stance = st; c.stanceK = damp(c.stanceK, st === 'stand' ? 0 : 1, 8, dt);
  c.sprint = !fighting && B.path && B.path.length > 2 && st === 'stand' && !(W.stealth && B.calm);
  let speed = c.sprint ? 6.4 : W.stealth && B.calm ? 1.7 : 4.3;
  if (st === 'crouch') speed = 2.3; else if (st === 'prone') speed = 0.8;
  speed *= d.move;
  if (c.flashT > 0) { speed *= 0.3; wx = Math.sin(W.t * 2 + c.id); wz = Math.cos(W.t * 1.7 + c.id); }
  B.stuckT += dt;
  if (B.stuckT > 1) { if (Math.hypot(c.x - B.lx, c.z - B.lz) < 0.35 && (wx || wz)) { B.path = null; B.pathT = 0; B.thinkT = 0; B.goal = null; } B.lx = c.x; B.lz = c.z; B.stuckT = 0; }
  moveBody(W, c, wx, wz, speed, dt, false);
}

/* ================================================================ domination */
function domGoal(W, c) {
  const B = c.bot, F = W.flags;
  const team = c.team;
  // keep my flag unless it is mine already; then go for the nearest not mine
  let want = F[B.flag] || F[1] || F[0];
  if (want.owner === team) {
    let nd = 1e9; for (const f of F) { if (f.owner === team) continue; const d = Math.hypot(f.x - c.x, f.z - c.z) + (f === F[1] ? -6 : 0); if (d < nd) { nd = d; want = f; } }
    if (want.owner === team && Math.random() < 0.5) { const a = Math.random() * TAU; return [want.x + Math.cos(a) * 3, want.z + Math.sin(a) * 3]; }
  }
  const a = (c.id * 1.3) % TAU;
  return [want.x + Math.cos(a) * 1.6, want.z + Math.sin(a) * 1.6];
}
function stepFlags(W, dt) {
  for (const f of W.flags) {
    let n0 = 0, n1 = 0;
    for (const c of W.chars) { if (!c.alive) continue; if (Math.hypot(c.x - f.x, c.z - f.z) < f.r) { if (c.team === 0) n0 += c.isPlayer ? 1.2 : 1; else n1++; } }
    f.contested = n0 > 0 && n1 > 0;
    const was = f.owner;
    if (!f.contested && (n0 || n1)) {
      const t = n0 ? 0 : 1, rate = Math.min(3, n0 || n1) * 0.2;
      if (f.owner !== t) {
        if (f.by !== t) { f.by = t; f.prog = f.owner >= 0 ? -1 : 0; }
        f.prog += dt * rate;
        if (f.prog >= 1) {
          f.owner = t; f.prog = 0; f.by = -1;
          const mine = t === W.P.team;
          say(W, mine ? 'captured' : 'lost', null, null, f.name);
          if (mine && Math.hypot(W.P.x - f.x, W.P.z - f.z) < f.r && W.P.alive) { W.stats.caps++; xp(W, 'Captured ' + f.name, 200); medal(W, 'capture'); }
          SND.capture(mine); W.ev.push({ k: 'flagcap', f: f.name, team: t });
        }
      }
    } else if (!n0 && !n1 && f.owner !== f.by && f.by >= 0) { f.prog = Math.max(0, f.prog - dt * 0.15); if (f.prog <= 0) f.by = -1; }
    void was;
  }
  W.domT = (W.domT || 0) + dt;
  if (W.domT >= 2) { W.domT -= 2; for (const f of W.flags) if (f.owner >= 0) W.score[f.owner]++; }
  for (let t = 0; t < 2; t++) if (W.score[t] >= W.target && !W.over) finishMatch(W, t, 'score', W.lastKO && W.t - W.lastKO.t < 2 ? W.chars[W.lastKO.victim] : null);
}

/* ================================================================ demolition */
function demRound(W, first) {
  const D = W.dem;
  D.attack = D.round <= 3 ? 1 : 0;
  W.side = D.round <= 3 ? 0 : 1;
  const defT = 1 - D.attack;
  const siteSide = W.side ? defT ^ 1 : defT;
  const sites = W.M.sites.map((s) => { const zz = siteSide === 1 ? s[1] : W.G.gh - 1 - s[1]; const p = nearestFloor(W.G, s[0], zz); return { x: cw(W.G, p[0]), z: cwz(W.G, p[1]) }; });
  W.demSites = sites;
  D.charge = null; D.dropped = null; D.carrier = null; D.planter = null;
  firstSpawns(W);
  for (const c of W.chars) { c.hasCharge = false; c.gone = false; if (c.bot) { c.bot.role = 'hunt'; c.bot.site = (c.id % 2); } }
  const att = W.chars.filter((c) => c.team === D.attack);
  const carrier = att.find((c) => c.isPlayer) || att[(Math.random() * att.length) | 0];
  carrier.hasCharge = true; D.carrier = carrier;
  D.siteGoal = Math.random() < 0.5 ? 0 : 1;
  W.roundT = W.limit; W.prepT = first ? 0 : 3;
  if (!first) { W.phase = 'live'; W.ev.push({ k: 'toast', text: 'Round ' + D.round, small: (D.attack === W.P.team ? 'Attack: plant the charge' : 'Defend both sites') }); }
}
function demGoal(W, c) {
  const D = W.dem, B = c.bot, att = c.team === D.attack;
  if (att) {
    if (D.charge) { const a = c.id * 1.7; return [D.charge.x + Math.cos(a) * 4, D.charge.z + Math.sin(a) * 4]; }
    if (D.dropped) return [D.dropped.x, D.dropped.z];
    const site = W.demSites[D.siteGoal] || W.demSites[0];
    if (c.hasCharge) return [site.x, site.z];
    const cr = D.carrier; if (cr && cr.alive) { const a = c.id * 2.1; return [cr.x + Math.cos(a) * 3, cr.z + Math.sin(a) * 3]; }
    return [site.x, site.z];
  }
  if (D.charge) return [D.charge.x, D.charge.z];
  const site = W.demSites[B.site] || W.demSites[0]; const a = c.id * 1.3; return [site.x + Math.cos(a) * 3.5, site.z + Math.sin(a) * 3.5];
}
function stepDem(W, dt) {
  const D = W.dem;
  if (W.prepT > 0) { W.prepT -= dt; return; }
  if (D.betweenT > 0) { D.betweenT -= dt; if (D.betweenT <= 0) { D.round++; demRound(W, false); } return; }
  if (!D.charge) { W.roundT -= dt; if (W.roundT <= 0) return demEnd(W, 1 - D.attack, 'time'); }
  // picking up a dropped charge
  if (D.dropped) for (const c of W.chars) if (c.alive && c.team === D.attack && Math.hypot(c.x - D.dropped.x, c.z - D.dropped.z) < 1.3) { c.hasCharge = true; D.carrier = c; D.dropped = null; if (c.isPlayer) W.ev.push({ k: 'toast', text: 'You have the charge', small: 'Plant it at A or B' }); break; }
  // planting and disarming
  for (const c of W.chars) {
    if (!c.alive) continue;
    let act = null;
    if (c.isPlayer) act = c.interact;
    else if (c.bot) {
      if (c.team === D.attack && c.hasCharge && !D.charge) { for (let i = 0; i < W.demSites.length; i++) if (Math.hypot(c.x - W.demSites[i].x, c.z - W.demSites[i].z) < 2.2) act = 'plant' + i; }
      if (D.charge && c.team !== D.attack && Math.hypot(c.x - D.charge.x, c.z - D.charge.z) < 1.6 && !c.bot.vis) act = 'defuse';
    }
    if (act && act.indexOf('plant') === 0) {
      c.useT += dt; if (c.isPlayer) W.useK = c.useT / 4;
      if (c.useT >= 4) {
        const i = +act.slice(5), s = W.demSites[i];
        D.charge = { x: s.x, z: s.z, t: 35, site: i, defuse: 0 }; c.hasCharge = false; D.carrier = null; c.useT = 0;
        say(W, D.attack === W.P.team ? 'planted' : 'theyPlanted', null); SND.plant();
        if (c.isPlayer) { W.stats.plants++; xp(W, 'Plant', 300); medal(W, 'plant'); }
      }
    } else if (act === 'defuse') {
      D.charge.defuse += dt; if (c.isPlayer) W.useK = D.charge.defuse / 6;
      if (D.charge.defuse >= 6) { say(W, 'defused', null); SND.defuse(); if (c.isPlayer) { W.stats.defuses++; xp(W, 'Disarm', 300); medal(W, 'defuse'); } D.charge = null; return demEnd(W, 1 - D.attack, 'defused'); }
      c.defusing = true;
    } else { if (c.useT > 0) c.useT = Math.max(0, c.useT - dt * 2); }
  }
  if (D.charge) {
    D.charge.t -= dt;
    if (!W.chars.some((c) => c.alive && c.team !== D.attack && Math.hypot(c.x - D.charge.x, c.z - D.charge.z) < 1.8)) D.charge.defuse = Math.max(0, D.charge.defuse - dt * 3);
    D.charge.beep = (D.charge.beep || 0) - dt;
    if (D.charge.beep <= 0) { D.charge.beep = clamp(D.charge.t / 35, 0.15, 1); SND.beep(Math.hypot(D.charge.x - W.P.x, D.charge.z - W.P.z)); }
    if (D.charge.t <= 0) { const ch = D.charge; D.charge = null; explode(W, ch.x, 0.5, ch.z, 12, 300, D.carrier || W.chars.find((c) => c.team === D.attack), 'Breach charge', 2.2); return demEnd(W, D.attack, 'charge'); }
  }
}
function demCheck(W) {
  const D = W.dem; if (!D || D.betweenT > 0 || W.over) return;
  for (let t = 0; t < 2; t++) {
    const left = W.chars.filter((c) => c.team === t && c.alive).length;
    if (left === 1 && W.P.alive && W.P.team === t && !D.lastSaid) { D.lastSaid = true; say(W, 'last', null); }
    if (!left) { if (t === D.attack && D.charge) continue; return demEnd(W, 1 - t, 'elim'); }
  }
}
function demEnd(W, win, why) {
  const D = W.dem; if (D.betweenT > 0 || W.over) return;
  D.wins[win]++; W.score = D.wins.slice();
  D.lastSaid = false;
  const mine = win === W.P.team;
  W.ev.push({ k: 'toast', text: mine ? 'Round won' : 'Round lost', small: why === 'charge' ? 'The charge blew' : why === 'defused' ? 'Charge disarmed' : why === 'time' ? 'Time ran out' : 'Side eliminated' });
  SND.roundEnd(mine);
  if (mine && W.P.alive && why === 'elim' && W.chars.filter((c) => c.team === W.P.team && c.alive).length === 1) medal(W, 'last');
  if (mine) xp(W, 'Round won', 150);
  if (D.wins[win] >= W.target) { finishMatch(W, win, 'rounds', W.lastKO && W.t - W.lastKO.t < 2.5 ? W.chars[W.lastKO.victim] : null); return; }
  D.betweenT = 3.2;
}

/* ================================================================ the range */
function rangeHit(W, g, head) {
  if (W.lesson) { if (g.lane === 'lane') W.lesson.hits++; if (g.lane === 'far') W.lesson.far++; }
  if (W.course && g.course && W.course.run) { W.course.i++; const L = W.course.list; if (W.course.i < L.length) { L[W.course.i].up = true; L[W.course.i].k = 0; } else { W.course.done = true; W.course.run = false; finishCourse(W); } }
  W.rangeScore = (W.rangeScore || 0) + (head ? 150 : 100);
  addPop(W, head ? 'CENTRE +150' : '+100', head ? '#ffd36a' : '#e8e2d6');
}
function finishCourse(W) {
  W.stats.course = W.course.t;
  addPop(W, 'HOUSE CLEARED ' + W.course.t.toFixed(2) + ' s', '#ffd36a');
  if (W.rangeMode === 'course') finishMatch(W, 0, 'course');
  else W.ev.push({ k: 'toast', text: 'House cleared in ' + W.course.t.toFixed(2) + ' s', small: 'Kill house' });
}
function stepRange(W, dt) {
  const L = W.lesson, P = W.P;
  for (const g of W.targets) {
    g.k = damp(g.k, g.up ? 1 : 0, 9, dt);
    if (!g.up && !g.course) { g.hitT += dt; if (g.hitT > 2.4) { g.up = true; } }
    if (g.moving) { g.ph += dt * 0.8; g.x = g.x0 + Math.sin(g.ph) * g.moving * 2; }
  }
  if (L && L.i >= 0 && L.i < LESSONS.length) {
    const les = LESSONS[L.i];
    if (les.course && !W.course) { startCourse(W); W.ev.push({ k: 'toast', text: 'Kill house', small: 'Walk in to start the clock' }); }
    if (les.check(W, P)) {
      L.i++; xp(W, 'Lesson', 50); SND.objective();
      if (L.i < LESSONS.length) W.ev.push({ k: 'toast', text: LESSONS[L.i].text, small: 'Lesson ' + (L.i + 1) + ' of ' + LESSONS.length });
      else { L.done = true; finishMatch(W, 0, 'lessons'); }
    }
  }
  if (W.course) {
    const C = W.course;
    if (!C.run && !C.done && P.x > cw(W.G, 12.4) && P.z < cwz(W.G, 14.5)) { C.run = true; C.t = 0; C.i = 0; C.list.forEach((g) => { g.up = false; }); C.list[0].up = true; SND.go(); }
    if (C.run) C.t += dt;
  }
}

/* ================================================================ the match */
export function finishMatch(W, team, why, victim) {
  if (W.over) return;
  if (W.attract) { W.score = W.score.map(() => 0); W.t = 0; return; }
  W.over = true; W.winner = team; W.why = why;
  const ko = W.lastKO && W.t - W.lastKO.t < 3 ? W.lastKO : null;
  W.final = { t: 0, ko, dur: ko ? 1.3 : 1.6 };
  W.phase = 'final'; W.phaseT = 0;
  const won = W.ffa ? team === W.P.team : team === W.P.team;
  if (W.kind === 'mp') xp(W, won ? 'Victory' : 'Match played', won ? 500 : 150);
  SND.finalSting(won);
  W.ev.push({ k: 'haptic', kind: won ? 'success' : 'fail', s: 1 });
}
function respawns(W, dt) {
  for (const c of W.chars) {
    if (c.alive) { c.spawnShield = Math.max(0, (c.spawnShield || 0) - dt); c.revealT = Math.max(0, (c.revealT || 0) - dt); continue; }
    c.downT += dt;
    if (c.gone) continue;
    if (W.kind === 'campaign' && c.team === 1) { if (c.downT > 9) c.gone = true; continue; }
    if (W.kind === 'campaign' && c.team === 0 && !c.isPlayer) {
      // squadmates shake it off and get back up
      if (c.downT > 9) { c.alive = true; c.hp = 60; c.downT = 0; c.stance = 'crouch'; c.respawnT = 0; say(W, 'up', c); }
      continue;
    }
    if (W.dem) { c.gone = c.downT > 2; continue; }
    c.respawnT -= dt;
    if (c.respawnT <= 0 && !W.over) {
      if (W.kind === 'campaign' && c.isPlayer) { const k = W.check; spawnAt(W, c, k[0], k[1], k[2]); W.fadeIn = 1; W.downCam = null; c.spawnShield = 2.5; continue; }
      if (W.kind === 'range') { const k = W.check; spawnAt(W, c, k[0], k[1], k[2]); W.downCam = null; continue; }
      const p = spawnPoint(W, c);
      spawnAt(W, c, p[0], p[1], Math.atan2(p[0], p[1]) + (W.ffa ? Math.random() * 2 : 0));
      if (!W.ffa) c.yaw = (W.side ? c.team ^ 1 : c.team) === 0 ? 0 : Math.PI;
      if (c.isPlayer) { W.downCam = null; W.fadeIn = 0.8; }
    }
  }
}
function regen(W, dt) {
  for (const c of W.chars) {
    if (!c.alive) continue;
    c.regenT += dt;
    if (c.regenT > 4 && c.hp < c.hpMax) c.hp = Math.min(c.hpMax, c.hp + 32 * dt * (c.isPlayer ? W.D.regen : 1));
    c.hitFlash = Math.max(0, c.hitFlash - dt * 3);
    c.suppress = Math.max(0, c.suppress - dt * 0.45);
    c.flashT = Math.max(0, c.flashT - dt);
  }
}
// One fixed step of everything.
export function step(W, dt, I) {
  W.t += dt; W.phaseT += dt;
  W.hitMark = Math.max(0, W.hitMark - dt * 4); W.hitKO = Math.max(0, W.hitKO - dt * 2.5); W.hitHead = Math.max(0, W.hitHead - dt * 3);
  W.supK = Math.max(0, W.supK - dt * 0.8); W.flashK = Math.max(0, W.flashK - dt * 0.32); W.hurtK = Math.max(0, W.hurtK - dt * 0.9); W.land = Math.max(0, W.land - dt * 4);
  W.shakeK = Math.max(0, (W.shakeK || 0) - dt * 2.2); W.useK = 0;
  for (const h of W.hurt) h.t += dt; while (W.hurt.length && W.hurt[0].t > 1.8) W.hurt.shift();
  for (const f of W.feed) f.t += dt; while (W.feed.length && W.feed[W.feed.length - 1].t > 6) W.feed.pop();
  for (const f of W.calls) f.t += dt; while (W.calls.length && W.calls[W.calls.length - 1].t > 4.4) W.calls.pop();
  for (const f of W.pops) f.t += dt; while (W.pops.length && W.pops[0].t > 1.4) W.pops.shift();
  for (const f of W.medals) f.t += dt; while (W.medals.length && W.medals[0].t > 2.4) W.medals.shift();
  if (W.phase === 'intro') {
    if (W.phaseT >= W.introDur || (I && I.skip)) {
      W.phase = 'live'; W.phaseT = 0;
      if (!W.attract) { W.ev.push({ k: 'toast', text: introGoal(W), small: W.kind === 'mp' ? W.mp.name : W.kind === 'range' ? 'The Pit' : 'Objective' }); SND.go(); if (W.kind !== 'range') say(W, 'start', null); }
    }
    for (const c of W.chars) if (!c.mount) moveBody(W, c, 0, 0, 0, dt, false);
    W.rec.tick(W, dt);
    return;
  }
  if (W.phase === 'killcam' || W.phase === 'results') return;
  const P = W.P;
  if (W.phase === 'live' && !W.attract && I) stepPlayer(W, P, dt, I);
  if (W.downCam) W.downCam.t += dt;
  const frozen = W.dem && (W.prepT > 0);
  for (const c of W.chars) if (c.bot && !frozen) stepBot(W, c, dt);
  if (frozen) for (const c of W.chars) { c.vx = c.vz = 0; }
  respawns(W, dt);
  regen(W, dt);
  stepNades(W, dt);
  stepStreakStuff(W, dt);
  if (W.flags && !W.over) stepFlags(W, dt);
  if (W.dem && !W.over) stepDem(W, dt);
  if (W.kind === 'campaign' && !W.over) { updateObjective(W, dt); if (W.convoy) stepConvoy(W, dt); }
  if (W.kind === 'range') stepRange(W, dt);
  if (W.heli) stepHeli(W, dt);
  // bots earn and use streaks too (not in the campaign)
  if (W.kind === 'mp' && !W.dem) for (const c of W.chars) if (c.bot && c.alive) for (const s of STREAKS) if (streakReady(W, c, s) && Math.random() < 0.01) useStreak(W, c, s.id);
  if (W.kind === 'mp' && W.limit && !W.dem && W.phase === 'live' && W.t >= W.limit + W.introDur && !W.over) {
    let win = -1;
    if (W.ffa) { let bs = -1; W.chars.forEach((c) => { if (W.score[c.team] > bs) { bs = W.score[c.team]; win = c.team; } }); }
    else win = W.score[0] > W.score[1] ? 0 : W.score[1] > W.score[0] ? 1 : -1;
    if (W.attract) { W.score = W.score.map(() => 0); W.t = W.introDur; } else finishMatch(W, win, 'time', null);
  }
  if (W.attract && W.t > 70) { W.t = 0; W.score = W.score.map(() => 0); }
  if (W.phase === 'final') { W.final.t += dt; }
  W.rec.tick(W, dt);
}
function introGoal(W) {
  if (W.kind === 'campaign') return W.obj ? W.obj.def.text : 'Go';
  if (W.kind === 'range') return W.rangeMode === 'course' ? 'Run the kill house' : W.rangeMode === 'free' ? 'Free practice' : LESSONS[0].text;
  const m = W.mp.id;
  return m === 'tdm' ? 'First side to ' + W.target : m === 'dom' ? 'Capture and hold A, B and C' : m === 'dem' ? (W.dem.attack === W.P.team ? 'Attack: plant the charge' : 'Defend both sites') : 'First to ' + W.target + ' knockdowns';
}
function stepHeli(W, dt) {
  const H = W.heli; H.t += dt;
  if (H.state === 'in') { H.x = damp(H.x, H.tx, 0.5, dt); H.z = damp(H.z, H.tz, 0.5, dt); H.y = damp(H.y, 6, 0.4, dt); }
  else if (H.state === 'down') { H.x = damp(H.x, H.tx, 2, dt); H.z = damp(H.z, H.tz, 2, dt); H.y = damp(H.y, 1.0, 1.2, dt); }
  else if (H.state === 'away') { H.y += dt * 4; H.z -= dt * 6; }
}
export function matchClock(W) {
  if (W.dem) return W.dem.charge ? W.dem.charge.t : W.roundT;
  if (W.kind === 'campaign') { if (W.obj && W.obj.def.time) return Math.max(0, W.obj.def.time - W.obj.prog); if (W.obj && W.obj.timer) return W.obj.timer; return W.missionT; }
  if (W.kind === 'range') return W.course ? W.course.t : W.t;
  return Math.max(0, W.limit - Math.max(0, W.t - W.introDur));
}

/* ================================================================ the recorder: the last seconds, for the final killcam */
const REC_N = 220, REC_F = 12;
function newRecorder() {
  return {
    buf: new Float32Array(REC_N * 24 * REC_F), times: new Float64Array(REC_N), head: 0, n: 0, acc: 0, shots: [], events: [],
    tick(W, dt) {
      this.acc += dt; if (this.acc < 0.05) return; this.acc = 0;
      const i = this.head, base = i * 24 * REC_F, chs = W.chars;
      this.times[i] = W.t;
      for (let k = 0; k < 24; k++) {
        const o = base + k * REC_F, c = chs[k];
        if (!c) { this.buf[o + 6] = -1; continue; }
        const b = this.buf;
        b[o] = c.x; b[o + 1] = c.y; b[o + 2] = c.z; b[o + 3] = c.yaw; b[o + 4] = c.pitch;
        b[o + 5] = c.stance === 'stand' ? 0 : c.stance === 'crouch' ? 1 : c.stance === 'prone' ? 2 : 3;
        b[o + 6] = c.alive ? 1 : 0; b[o + 7] = c.downT; b[o + 8] = c.adsK; b[o + 9] = c.cur; b[o + 10] = c.stanceK; b[o + 11] = c.leanK;
      }
      this.head = (i + 1) % REC_N; this.n = Math.min(REC_N, this.n + 1);
      while (this.shots.length && W.t - this.shots[0].t > REC_N * 0.05) this.shots.shift();
      while (this.events.length && W.t - this.events[0].t > REC_N * 0.05) this.events.shift();
    },
    shot(W, id, ox, oy, oz, ex, ey, ez, hit) { if (W.phase === 'killcam') return; this.shots.push({ t: W.t, id, ox, oy, oz, ex, ey, ez, hit }); if (this.shots.length > 600) this.shots.shift(); },
    event(W, k, a, b) { if (W.phase === 'killcam') return; this.events.push({ t: W.t, k, a, b }); },
    // write the recorded pose at time t into the people
    apply(W, t) {
      if (!this.n) return;
      let lo = -1, hi = -1;
      for (let j = 0; j < this.n; j++) {
        const i = (this.head - this.n + j + REC_N) % REC_N;
        if (this.times[i] <= t) lo = i; else { hi = i; break; }
      }
      if (lo < 0) lo = hi; if (hi < 0) hi = lo;
      const t0 = this.times[lo], t1 = this.times[hi], k = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 0;
      for (let c = 0; c < W.chars.length && c < 24; c++) {
        const a = lo * 24 * REC_F + c * REC_F, b = hi * 24 * REC_F + c * REC_F, B = this.buf, ch = W.chars[c];
        if (B[a + 6] < 0) continue;
        ch.x = lerp(B[a], B[b], k); ch.y = lerp(B[a + 1], B[b + 1], k); ch.z = lerp(B[a + 2], B[b + 2], k);
        ch.yaw = B[a + 3] + angDiff(B[a + 3], B[b + 3]) * k; ch.pitch = lerp(B[a + 4], B[b + 4], k);
        ch.stance = ['stand', 'crouch', 'prone', 'slide'][B[b + 5] | 0]; ch.alive = B[b + 6] > 0.5; ch.downT = B[b + 7]; ch.adsK = B[b + 8]; ch.cur = B[b + 9] | 0; ch.stanceK = lerp(B[a + 10], B[b + 10], k); ch.leanK = lerp(B[a + 11], B[b + 11], k);
        ch.gone = false;
        ch.vx = (B[b] - B[a]) / Math.max(0.01, t1 - t0); ch.vz = (B[b + 2] - B[a + 2]) / Math.max(0.01, t1 - t0);
      }
    },
  };
}
// Start the final killcam: the last few seconds before the deciding knockdown, through the eyes behind the shooter.
export function startKillcam(W) {
  const ko = W.final && W.final.ko; if (!ko) return false;
  W.phase = 'killcam'; W.phaseT = 0;
  W.kc = { t: Math.max(ko.t - 4.2, W.rec.times[(W.rec.head - W.rec.n + REC_N) % REC_N] || 0), end: ko.t + 1.4, ko, shotI: 0, slow: 1 };
  W.kc.start = W.kc.t;
  W.kc.shotI = W.rec.shots.findIndex((s) => s.t >= W.kc.t); if (W.kc.shotI < 0) W.kc.shotI = W.rec.shots.length;
  W.smokes.length = 0; W.nades.length = 0;
  return true;
}
export function stepKillcam(W, dt) {
  const K = W.kc; if (!K) return true;
  const near = Math.abs(K.t - K.ko.t);
  K.slow = near < 0.5 ? 0.3 : near < 1.1 ? 0.6 : 1;
  K.t += dt * K.slow;
  W.rec.apply(W, K.t);
  const S = W.rec.shots;
  while (K.shotI < S.length && S[K.shotI].t <= K.t) {
    const s = S[K.shotI++];
    W.ev.push({ k: 'shot', c: s.id, ox: s.ox, oy: s.oy, oz: s.oz, ex: s.ex, ey: s.ey, ez: s.ez, hit: s.hit, nx: 0, ny: 1, nz: 0, w: '', tracer: true, replay: true });
    W.ev.push({ k: 'muzzle', c: s.id, replay: true });
    const c = W.chars[s.id]; if (c) { c.firing = 0.1; SND.shot(W, c, curW(c).def, 0.8); }
  }
  return K.t >= K.end;
}
export function playerScore(W) {
  if (W.kind === 'range') return Math.round(W.rangeScore || 0) + (W.stats.course ? Math.round(Math.max(0, 60 - W.stats.course) * 50) : 0);
  let s = W.stats.xp.reduce((a, x) => a + x[1], 0);
  if (W.kind === 'campaign' && W.winner === 0) s += 1000;
  return Math.round(s * (W.D.idx === 0 ? 0.8 : W.D.idx === 2 ? 1.3 : 1));
}
export function useAvailable(W, c) { if (!c.alive) return false; if (findInteract(W, c)) return true; for (const cr of W.crates) if (cr.landed && cr.uses > 0 && Math.hypot(cr.x - c.x, cr.z - c.z) < 2.2) return true; return false; }
export function makeBot(W, c) { c.bot = newBot(W, c); c.bot.role = W.kind === 'campaign' ? 'assault' : 'hunt'; c.bot.flag = W.flags ? 1 : 0; c.bot.site = 0; return c.bot; }
export { curW, objMarker, LESSONS as RANGE_LESSONS };
