/*
 * Rangoli Drop: the rules, controls, sound and HUD, shared by the 3D view
 * (game3d.js) and the 2D view (game.js) so both editions play identically.
 *
 * A falling block puzzle. Seven four-tile shapes fall into a brass courtyard
 * frame; turn and slide them so whole rows fill, and a full row bursts into
 * colour powder. Clearing four rows at once is a Chauka, turning the T shape
 * into a tight gap is a Twist, and back to back hard clears and combos score
 * more. Modes: Marathon (150 lines), Sprint (40 lines against the clock) and
 * Blitz (best score in two minutes).
 *
 * Board: 10 columns by 40 rows, row 0 at the bottom; rows 0 to 19 are the
 * visible field and pieces appear in rows 20 and 21. Rotation follows the
 * modern standard with wall kicks, a 7-bag randomiser deals the pieces, and
 * the logic runs on a fixed 120 Hz step so it plays the same at any frame
 * rate; the views smooth what they draw.
 */
export const COLS = 10, ROWS = 40, VIS = 20, TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TYPES = 'IOTSZJL';
// Gulal powder colours: kumkum red, peacock teal, marigold, rani pink, neel indigo, leaf green, jamun violet.
export const PIECE_COL = ['#ff3b58', '#14c8b8', '#ffb21f', '#ff4fb0', '#5d6eff', '#62d43f', '#ac5cff'];
export const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
export const INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736';

/* ------------------------------------------------------------ shapes and kicks */
const DEF = [
  ['....', '####', '....', '....'],
  ['##', '##'],
  ['.#.', '###', '...'],
  ['.##', '##.', '...'],
  ['##.', '.##', '...'],
  ['#..', '###', '...'],
  ['..#', '###', '...'],
];
export const SIZE = DEF.map((d) => d.length);
// SHAPES[type][rot] = Int8Array of 4 (x, y) pairs inside the piece box, y up.
export const SHAPES = DEF.map((rows) => {
  const n = rows.length;
  let cells = [];
  rows.forEach((row, y) => { for (let x = 0; x < n; x++) if (row[x] === '#') cells.push([x, y]); });
  const out = [];
  for (let r = 0; r < 4; r++) {
    const a = new Int8Array(8);
    cells.forEach((c, i) => { a[i * 2] = c[0]; a[i * 2 + 1] = n - 1 - c[1]; });
    out.push(a);
    cells = cells.map((c) => [n - 1 - c[1], c[0]]);
  }
  return out;
});
// Lowest filled row of the spawn state, so every piece first shows in row 20.
const SPAWN_Y = SHAPES.map((s) => { let m = 9; for (let i = 1; i < 8; i += 2) m = Math.min(m, s[0][i]); return 20 - m; });
const KJ = { '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]] };
const KI = { '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]] };
const kickTable = (tab) => { const out = []; for (let f = 0; f < 4; f++) for (let t = 0; t < 4; t++) out[f * 4 + t] = tab[f + '>' + t] || [[0, 0]]; return out; };
const KICK_J = kickTable(KJ), KICK_I = kickTable(KI), KICK_O = kickTable({});
const KICKS = [KICK_I, KICK_O, KICK_J, KICK_J, KICK_J, KICK_J, KICK_J];

/* ------------------------------------------------------------ timing */
const STEP = 1 / 120;
const LOCK_DELAY = 0.5, MAX_RESETS = 15, ARE = 0.1, CLEAR_DUR = 0.34, INTRO = 1.6, END_DUR = 2.1;
export const HANDLING = { gentle: [0.19, 0.05], std: [0.15, 0.033], fast: [0.115, 0.016], instant: [0.1, 0] };
export function gravityOf(level) { const l = Math.min(level, 20); return Math.pow(0.8 - (l - 1) * 0.007, l - 1); }
const MODES = { marathon: { goal: 150, per: 10 }, sprint: { goal: 40, per: 0 }, blitz: { secs: 120, per: 5 } };
// The courtyard changes with the level: sky, mandala lines, the frame's inlay and the lamps.
export const PALETTES = [
  { name: 'Marigold dusk', bg0: '#12060f', bg1: '#4a1a2a', line: '#ffa63d', inlay: '#ffb04a', diya: '#ffb35c', sky: '#c98a7a' },
  { name: 'Indigo night', bg0: '#04061a', bg1: '#18205c', line: '#6f8cff', inlay: '#8ea4ff', diya: '#ffc46b', sky: '#7f8cc9' },
  { name: 'Rani festival', bg0: '#160413', bg1: '#5a0f43', line: '#ff5cb5', inlay: '#ff7cc8', diya: '#ffb070', sky: '#c97fa8' },
  { name: 'Peacock monsoon', bg0: '#021212', bg1: '#0b4645', line: '#2fe0c6', inlay: '#4fe8d2', diya: '#ffd27a', sky: '#7fbcb4' },
  { name: 'Saffron dawn', bg0: '#1a0904', bg1: '#6a280b', line: '#ff8a3a', inlay: '#ffa35a', diya: '#ffe08a', sky: '#d99a72' },
  { name: 'Mehendi grove', bg0: '#081005', bg1: '#284812', line: '#9ee05a', inlay: '#b8ee70', diya: '#ffcf6e', sky: '#9cb77e' },
  { name: 'Moonlit marble', bg0: '#07090f', bg1: '#2a3044', line: '#cdd7ff', inlay: '#e4e9ff', diya: '#fff0c4', sky: '#a8b0c8' },
  { name: 'Holi noon', bg0: '#12061c', bg1: '#3b1a5c', line: '#ffd23f', inlay: '#ff6ad2', diya: '#ffe27a', sky: '#b48ad0' },
];
export const paletteOf = (level) => PALETTES[(Math.max(1, level) - 1) % PALETTES.length];
export const paletteName = (level) => paletteOf(level).name;

/* ------------------------------------------------------------ the game */
function rngOf(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function newGame(cfg) {
  const G = {
    cfg, board: new Uint8Array(COLS * ROWS), rnd: rngOf(cfg.seed || ((Math.random() * 1e9) | 0)),
    queue: [], cur: { t: 0, r: 0, x: 3, y: 20 }, has: false, pieceId: 0,
    hold: -1, holdUsed: false,
    level: cfg.startLevel || 1, lines: 0, score: 0, combo: -1, b2b: false, b2bRun: 0,
    phase: 'intro', pt: 0, time: 0, acc: 0,
    fallT: 0, lockT: 0, resets: 0, lowest: 99, lastRot: false, lastKick: 0, ghostY: 0,
    areT: 0, clearT: 0, clearRows: new Int8Array(4), clearN: 0, clearMask: new Uint8Array(ROWS),
    dasDir: 0, dasT: 0, arrT: 0, softOn: false, bufRot: 0, bufHold: false,
    stats: { pieces: 0, singles: 0, doubles: 0, triples: 0, chaukas: 0, twists: 0, maxCombo: 0, allClears: 0, hard: 0, soft: 0, moves: 0, rotations: 0, holds: 0 },
    pops: [], endT: 0, endKind: '', reported: false, best: null,
    bot: !!cfg.attract, botT: 0, botR: -1, botX: 0, botFor: -1,
    lastClear: '', tick: 0,
  };
  while (G.queue.length < 14) fillBag(G);
  return G;
}
function fillBag(G) {
  const b = [0, 1, 2, 3, 4, 5, 6];
  for (let i = 6; i > 0; i--) { const j = Math.floor(G.rnd() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; }
  for (let i = 0; i < 7; i++) G.queue.push(b[i]);
}
export function fits(G, t, r, x, y) {
  const s = SHAPES[t][r], b = G.board;
  for (let i = 0; i < 8; i += 2) {
    const cx = x + s[i], cy = y + s[i + 1];
    if (cx < 0 || cx >= COLS || cy < 0) return false;
    if (cy < ROWS && b[cy * COLS + cx]) return false;
  }
  return true;
}
function ghostOf(G) { const c = G.cur; let y = c.y; while (fits(G, c.t, c.r, c.x, y - 1)) y--; return y; }

let ARC = null, VIEW = null, GAME = null, FREEZE_AT = -1;
// A held moment for the poster: the game and its effects stop at a chosen time while the frame keeps drawing.
export const frozen = () => !!GAME && FREEZE_AT >= 0 && GAME.time >= FREEZE_AT;
const ev = (type, d) => {
  feel(type, d);
  if (VIEW && VIEW.event) { try { VIEW.event(type, d, GAME); } catch (e) { console.warn(e); } }
};

function spawn(G, t) {
  if (t == null) { t = G.queue.shift(); if (G.queue.length < 7) fillBag(G); }
  const c = G.cur;
  c.t = t; c.r = 0; c.x = SIZE[t] === 2 ? 4 : 3; c.y = SPAWN_Y[t];
  G.pieceId++; G.fallT = 0; G.lockT = 0; G.resets = 0; G.lastRot = false; G.lastKick = 0; G.has = true;
  if (G.bufRot) { const d = G.bufRot; G.bufRot = 0; const r = (c.r + d + 4) % 4; if (fits(G, t, r, c.x, c.y)) { c.r = r; ev('rotate', { dir: d, kick: 0, irs: true }); } }
  if (!fits(G, c.t, c.r, c.x, c.y)) { G.has = false; endGame(G, 'topout'); return; }
  if (fits(G, c.t, c.r, c.x, c.y - 1)) c.y--;
  G.lowest = c.y; G.ghostY = ghostOf(G);
  ev('spawn', { t });
}
function tryMove(G, dx, dy) {
  const c = G.cur;
  if (!G.has || !fits(G, c.t, c.r, c.x + dx, c.y + dy)) return false;
  c.x += dx; c.y += dy;
  if (dx) { G.ghostY = ghostOf(G); G.stats.moves++; }
  G.lastRot = false;
  afterMove(G);
  return true;
}
function afterMove(G) {
  const c = G.cur;
  if (c.y < G.lowest) { G.lowest = c.y; G.resets = 0; G.lockT = 0; }
  else if (G.resets < MAX_RESETS) { G.lockT = 0; G.resets++; }
  else if (G.resets >= MAX_RESETS) G.resets++;
}
function tryRotate(G, dir) {
  const c = G.cur;
  if (!G.has) return false;
  const to = (c.r + dir + 4) % 4, tests = KICKS[c.t][c.r * 4 + to];
  for (let i = 0; i < tests.length; i++) {
    const nx = c.x + tests[i][0], ny = c.y + tests[i][1];
    if (fits(G, c.t, to, nx, ny)) {
      c.x = nx; c.y = ny; c.r = to; G.lastRot = true; G.lastKick = i; G.stats.rotations++;
      G.ghostY = ghostOf(G);
      afterMove(G);
      ev('rotate', { dir, kick: i });
      return true;
    }
  }
  return false;
}
function doHold(G) {
  if (!G.has || G.holdUsed) return false;
  const t = G.cur.t;
  G.holdUsed = true; G.stats.holds++;
  if (G.hold < 0) { G.hold = t; spawn(G); } else { const h = G.hold; G.hold = t; spawn(G, h); }
  ev('hold', { t });
  return true;
}
function hardDrop(G) {
  if (!G.has) return;
  const c = G.cur, y0 = c.y, d = c.y - G.ghostY;
  if (d > 0) { c.y = G.ghostY; G.lastRot = false; }
  G.score += d * 2; G.stats.hard++;
  ev('drop', { t: c.t, r: c.r, x: c.x, y0, y1: c.y });
  lock(G, true, d);
}
// T shape: three of the four corners of its box filled is a Twist; both front corners make it a full one.
const FRONT = [[0, 2, 2, 2], [2, 2, 2, 0], [0, 0, 2, 0], [0, 0, 0, 2]];
function twistOf(G) {
  const c = G.cur;
  if (c.t !== 2 || !G.lastRot) return 0;
  const occ = (bx, by) => { const x = c.x + bx, y = c.y + by; return x < 0 || x >= COLS || y < 0 || !!G.board[y * COLS + x]; };
  const n = (occ(0, 0) ? 1 : 0) + (occ(2, 0) ? 1 : 0) + (occ(0, 2) ? 1 : 0) + (occ(2, 2) ? 1 : 0);
  if (n < 3) return 0;
  const f = FRONT[c.r];
  if ((occ(f[0], f[1]) && occ(f[2], f[3])) || G.lastKick === 4) return 2;
  return 1;
}
const LABEL = ['', 'Single', 'Double', 'Triple', 'Chauka'];
function lock(G, hard, dropRows) {
  const c = G.cur, s = SHAPES[c.t][c.r];
  const tw = twistOf(G);
  let above = true, minY = 99, maxY = -1;
  for (let i = 0; i < 8; i += 2) {
    const x = c.x + s[i], y = c.y + s[i + 1];
    if (y < ROWS) G.board[y * COLS + x] = c.t + 1;
    if (y < VIS) above = false;
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  G.has = false; G.holdUsed = false; G.stats.pieces++;
  // full rows
  G.clearN = 0; G.clearMask.fill(0);
  for (let y = Math.max(0, minY); y <= Math.min(ROWS - 1, maxY); y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) if (!G.board[y * COLS + x]) { full = false; break; }
    if (full) { G.clearRows[G.clearN++] = y; G.clearMask[y] = 1; }
  }
  const n = G.clearN;
  ev('lock', { t: c.t, r: c.r, x: c.x, y: c.y, hard: !!hard, rows: dropRows || 0, lines: n });
  if (above && n === 0) { endGame(G, 'topout'); return; }
  // score at the level the piece landed on
  const L = G.level;
  let pts, label, hardClear;
  if (tw === 2) { pts = [400, 800, 1200, 1600][n]; label = n ? 'Twist ' + LABEL[n] : 'Twist'; hardClear = n > 0; G.stats.twists++; }
  else if (tw === 1) { pts = [100, 200, 400, 400][n]; label = n ? 'Mini twist ' + LABEL[n].toLowerCase() : 'Mini twist'; hardClear = n > 0; G.stats.twists++; }
  else { pts = [0, 100, 300, 500, 800][n]; label = LABEL[n]; hardClear = n === 4; }
  pts *= L;
  let b2b = false, allClear = false;
  if (n > 0) {
    if (hardClear) { if (G.b2b) { pts = Math.floor(pts * 1.5); b2b = true; G.b2bRun++; } G.b2b = true; } else { G.b2b = false; G.b2bRun = 0; }
    G.combo++;
    if (G.combo > 0) pts += 50 * G.combo * L;
    G.stats.maxCombo = Math.max(G.stats.maxCombo, G.combo);
    let rest = 0;
    for (let i = 0; i < COLS * ROWS; i++) if (G.board[i] && !G.clearMask[(i / COLS) | 0]) { rest++; break; }
    if (!rest) { allClear = true; pts += (b2b && n === 4 ? 3200 : [0, 800, 1200, 1800, 2000][n]) * L; G.stats.allClears++; }
    if (tw === 0) { if (n === 1) G.stats.singles++; else if (n === 2) G.stats.doubles++; else if (n === 3) G.stats.triples++; else G.stats.chaukas++; }
    else if (n === 4) G.stats.chaukas++;
  } else G.combo = -1;
  G.score += pts;
  if (label) pop(G, label, pts > 0 ? '+' + fmt(pts) : '', tw ? '#c48bff' : n === 4 ? GOLD : INK, n === 4 || tw === 2 || allClear ? 1 : 0.6);
  if (b2b) pop(G, 'Back to back', '', '#7ce8ff', 0.5);
  if (G.combo > 0) pop(G, 'Combo ' + G.combo, '', '#ffd36a', 0.5);
  if (allClear) pop(G, 'All clear', '', '#9dffb0', 1);
  G.lastClear = label;
  if (n > 0 || tw) ev('clear', { n, tw, b2b, combo: G.combo, allClear, rows: G.clearRows, pts });
  // lines and level
  if (n > 0) {
    G.lines += n;
    const M = MODES[G.cfg.mode] || MODES.marathon;
    if (M.per) {
      const lv = Math.min(20, (G.cfg.startLevel || 1) + Math.floor(G.lines / M.per));
      if (lv > G.level) { G.level = lv; ev('level', { level: lv }); pop(G, 'Level ' + lv, paletteName(lv), '#ffe6a8', 0.8); }
    }
    G.phase = 'clear'; G.clearT = 0;
  } else { G.phase = 'are'; G.areT = 0; }
}
function collapse(G) {
  const b = G.board;
  let w = 0;
  for (let y = 0; y < ROWS; y++) {
    if (G.clearMask[y]) continue;
    if (w !== y) for (let x = 0; x < COLS; x++) b[w * COLS + x] = b[y * COLS + x];
    w++;
  }
  for (let y = w; y < ROWS; y++) for (let x = 0; x < COLS; x++) b[y * COLS + x] = 0;
  ev('collapse', { rows: G.clearRows, n: G.clearN });
  G.clearMask.fill(0); G.clearN = 0;
  const M = G.cfg.mode;
  if (M === 'sprint' && G.lines >= MODES.sprint.goal) { endGame(G, 'win'); return; }
  if (M === 'marathon' && G.lines >= MODES.marathon.goal) { endGame(G, 'win'); return; }
}
function endGame(G, kind) {
  if (G.phase === 'end') return;
  G.phase = 'end'; G.endT = 0; G.endKind = kind; G.has = false;
  ev('end', { kind });
  if (!G.cfg.attract) {
    if (kind === 'topout') { sound('topout'); haptic('fail', 1); }
    else { sound('win'); haptic('success', 1); }
  }
}
function pop(G, text, sub, col, big) {
  if (G.pops.length > 3) G.pops.shift();
  G.pops.push({ text: text.toUpperCase(), sub, col, big, t: 0 });
}
export const fmt = (n) => { const s = String(Math.floor(n)); let o = ''; for (let i = 0; i < s.length; i++) { if (i && (s.length - i) % 3 === 0) o += ','; o += s[i]; } return o; };
export const fmtTime = (t, cs) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; const si = Math.floor(s); let out = m + ':' + (si < 10 ? '0' : '') + si; if (cs) { const c = Math.floor((s - si) * 100); out += '.' + (c < 10 ? '0' : '') + c; } return out; };

/* ------------------------------------------------------------ the bot (menu attract, tests, poster) */
const BOT_B = new Uint8Array(COLS * ROWS);
function botPlan(G) {
  const c = G.cur;
  let best = -1e9, br = 0, bx = c.x;
  const rots = c.t === 1 ? 1 : 4;
  for (let r = 0; r < rots; r++) {
    for (let x = -2; x < COLS; x++) {
      if (!fits(G, c.t, r, x, Math.min(c.y, 22))) continue;
      let y = Math.min(c.y, 22); while (fits(G, c.t, r, x, y - 1)) y--;
      BOT_B.set(G.board);
      const s = SHAPES[c.t][r];
      for (let i = 0; i < 8; i += 2) { const yy = y + s[i + 1]; if (yy < ROWS) BOT_B[yy * COLS + x + s[i]] = 1; }
      // clear full rows
      let lines = 0, w = 0;
      for (let yy = 0; yy < 24; yy++) {
        let full = true; for (let xx = 0; xx < COLS; xx++) if (!BOT_B[yy * COLS + xx]) { full = false; break; }
        if (full) { lines++; continue; }
        if (w !== yy) for (let xx = 0; xx < COLS; xx++) BOT_B[w * COLS + xx] = BOT_B[yy * COLS + xx];
        w++;
      }
      for (let yy = w; yy < 24; yy++) for (let xx = 0; xx < COLS; xx++) BOT_B[yy * COLS + xx] = 0;
      let agg = 0, holes = 0, bump = 0, prev = -1, maxH = 0;
      for (let xx = 0; xx < COLS; xx++) {
        let h = 0;
        for (let yy = 23; yy >= 0; yy--) if (BOT_B[yy * COLS + xx]) { h = yy + 1; break; }
        for (let yy = 0; yy < h; yy++) if (!BOT_B[yy * COLS + xx]) holes++;
        agg += h; maxH = Math.max(maxH, h);
        if (prev >= 0) bump += Math.abs(h - prev);
        prev = h;
      }
      const sc = -0.51 * agg + 0.76 * lines * (lines === 4 ? 1.6 : 1) - 0.36 * holes * 2 - 0.18 * bump - (maxH > 14 ? (maxH - 14) * 2 : 0);
      if (sc > best) { best = sc; br = r; bx = x; }
    }
  }
  G.botR = br; G.botX = bx; G.botFor = G.pieceId;
}
function botStep(G, dt) {
  if (!G.has) return;
  if (G.botFor !== G.pieceId) { botPlan(G); G.botT = G.cfg.attract ? 0.25 : 0.05; }
  G.botT -= dt;
  if (G.botT > 0) return;
  const c = G.cur, gap = G.cfg.attract ? 0.11 : (G.cfg.botGap || 0.05);
  G.botT = gap;
  if (c.r !== G.botR) { const d = (G.botR - c.r + 4) % 4 === 3 ? -1 : 1; if (!tryRotate(G, d)) hardDrop(G); return; }
  if (c.x < G.botX) { if (!tryMove(G, 1, 0)) hardDrop(G); return; }
  if (c.x > G.botX) { if (!tryMove(G, -1, 0)) hardDrop(G); return; }
  if (G.cfg.attract) { G.softOn = true; G.botT = 0; return; }
  hardDrop(G);
}

/* ------------------------------------------------------------ the fixed step */
const IN = { left: false, right: false, soft: false, lastDir: 0, rotCW: 0, rotCCW: 0, hard: 0, hold: 0, moves: 0, softRows: 0, padUp: false, stickUp: false, padL: false, padR: false };
function settings() {
  const ch = ARC ? ARC.choices : {};
  const h = HANDLING[ch.das] || HANDLING.std;
  const sdf = ch.sdf === 'inst' ? 0 : ch.sdf === '10' ? 10 : 20;
  return { das: h[0], arr: h[1], sdf };
}
let SET = { das: 0.15, arr: 0.033, sdf: 20 };
function stepLive(G, dt, first) {
  if (G.bot) { G.softOn = false; botStep(G, dt); if (!G.has || G.phase !== 'live') return; }
  else if (first) {
    // one-shot inputs, applied once per frame
    if (IN.hold) { IN.hold = 0; if (doHold(G)) { sound('hold'); haptic('tap', 0.25); } if (!G.has) return; }
    while (IN.rotCW > 0) { IN.rotCW--; if (tryRotate(G, 1)) sound(G.lastKick ? 'kick' : 'rotate'); }
    while (IN.rotCCW > 0) { IN.rotCCW--; if (tryRotate(G, -1)) sound(G.lastKick ? 'kick' : 'rotate'); }
    while (IN.moves !== 0) { const d = IN.moves > 0 ? 1 : -1; IN.moves -= d; if (tryMove(G, d, 0)) sound('move'); }
    while (IN.softRows > 0) { IN.softRows--; if (tryMove(G, 0, -1)) { G.score += 1; G.stats.soft++; G.fallT = 0; } }
    if (IN.hard) { IN.hard = 0; hardDrop(G); return; }
  }
  if (!G.bot) {
    // auto shift: a held direction moves once, waits, then slides
    let dir = 0;
    if (IN.left && IN.right) dir = IN.lastDir; else if (IN.left) dir = -1; else if (IN.right) dir = 1;
    if (dir !== G.dasDir) { G.dasDir = dir; G.dasT = 0; G.arrT = 0; if (dir && tryMove(G, dir, 0)) sound('move'); }
    else if (dir) {
      G.dasT += dt;
      if (G.dasT >= SET.das) {
        if (SET.arr <= 0) { let moved = false; while (tryMove(G, dir, 0)) moved = true; if (moved) sound('move'); }
        else { G.arrT += dt; while (G.arrT >= SET.arr) { G.arrT -= SET.arr; if (!tryMove(G, dir, 0)) { G.arrT = 0; break; } sound('move'); } }
      }
    }
    G.softOn = IN.soft;
  }
  // gravity, sped up by a soft drop
  const c = G.cur;
  if (G.softOn && SET.sdf === 0 && !G.bot) {
    let d = 0; while (tryMove(G, 0, -1)) d++;
    if (d) { G.score += d; G.stats.soft += d; }
  } else {
    const g = gravityOf(G.cfg.mode === 'sprint' ? 1 : G.level);
    const iv = G.softOn ? Math.min(g, Math.max(0.004, g / (SET.sdf || 20)), 0.05) : g;
    G.fallT += dt;
    let guard = 0;
    while (G.fallT >= iv && guard++ < 25) {
      G.fallT -= iv;
      if (fits(G, c.t, c.r, c.x, c.y - 1)) {
        c.y--; G.lastRot = false;
        if (c.y < G.lowest) { G.lowest = c.y; G.resets = 0; G.lockT = 0; }
        if (G.softOn) { G.score += 1; G.stats.soft++; }
      } else { G.fallT = 0; break; }
    }
  }
  // lock delay, reset by moves up to fifteen times per row reached
  if (!fits(G, c.t, c.r, c.x, c.y - 1)) {
    G.lockT += dt;
    if (G.lockT >= LOCK_DELAY || G.resets > MAX_RESETS) { lock(G, false, 0); sound(G.clearN ? 'thunk' : 'lock'); haptic('tap', 0.3); }
  }
}
export function step(G, dt) {
  G.acc = Math.min(G.acc + dt, 0.25);
  let first = true;
  while (G.acc >= STEP) {
    G.acc -= STEP;
    fixed(G, STEP, first);
    first = false;
  }
  for (let i = G.pops.length - 1; i >= 0; i--) { G.pops[i].t += dt; if (G.pops[i].t > 1.5) G.pops.splice(i, 1); }
}
function fixed(G, dt, first) {
  G.tick++;
  if (G.phase === 'intro') {
    G.pt += dt;
    if (first) bufferInputs(G);
    if (G.pt >= (G.cfg.attract ? 0 : INTRO)) { G.phase = 'live'; spawn(G); if (!G.cfg.attract) { sound('go'); haptic('tap', 0.4); } }
    return;
  }
  if (G.phase === 'end') {
    G.endT += dt;
    if (G.endT >= END_DUR && !G.reported) { G.reported = true; if (!G.cfg.attract) finish(G); }
    return;
  }
  G.time += dt;
  if (G.cfg.mode === 'blitz' && G.time >= MODES.blitz.secs) { endGame(G, 'timeup'); return; }
  if (G.cfg.dropAt != null && G.time >= G.cfg.dropAt && G.phase === 'live' && G.has) { G.cfg.dropAt = null; hardDrop(G); return; }
  if (G.phase === 'live') stepLive(G, dt, first);
  else if (G.phase === 'clear') {
    if (first) bufferInputs(G);
    chargeDas(G, dt);
    G.clearT += dt;
    if (G.clearT >= CLEAR_DUR) { collapse(G); if (G.phase !== 'end') { G.phase = 'are'; G.areT = ARE * 0.5; } }
  } else if (G.phase === 'are') {
    if (first) bufferInputs(G);
    chargeDas(G, dt);
    G.areT += dt;
    if (G.areT >= ARE) {
      G.phase = 'live';
      if (G.bufHold && G.hold >= 0) { G.bufHold = false; const h = G.hold; G.hold = G.queue.shift(); if (G.queue.length < 7) fillBag(G); G.holdUsed = true; spawn(G, h); ev('hold', { t: G.hold }); }
      else { if (G.bufHold && G.hold < 0) { G.bufHold = false; G.hold = G.queue.shift(); if (G.queue.length < 7) fillBag(G); G.holdUsed = true; ev('hold', { t: G.hold }); } spawn(G); }
    }
  }
}
// Between pieces, a held direction keeps charging and a turn or hold waits for the next piece.
function chargeDas(G, dt) {
  if (G.bot) return;
  let dir = 0;
  if (IN.left && IN.right) dir = IN.lastDir; else if (IN.left) dir = -1; else if (IN.right) dir = 1;
  if (dir !== G.dasDir) { G.dasDir = dir; G.dasT = 0; G.arrT = 0; } else if (dir) G.dasT += dt;
}
function bufferInputs(G) {
  if (G.bot) return;
  if (IN.rotCW) { G.bufRot = 1; IN.rotCW = 0; }
  if (IN.rotCCW) { G.bufRot = -1; IN.rotCCW = 0; }
  if (IN.hold) { G.bufHold = true; IN.hold = 0; }
  IN.hard = 0; IN.moves = 0; IN.softRows = 0;
}

/* ------------------------------------------------------------ touch and mouse gestures */
// One finger: drag sideways to move a cell at a time, drag down slowly to
// soft drop, flick down to hard drop, flick up to hold, tap to turn (left half
// anticlockwise, right half clockwise). A second finger tap turns too.
const TQ = { id: null, x0: 0, y0: 0, t0: 0, ax: 0, ay: 0, moved: false, n: 0, sx: new Float64Array(8), sy: new Float64Array(8), st: new Float64Array(8), mouse: false, seen: 0 };
function stepPx() { const L = VIEW && VIEW.layout ? VIEW.layout : null; const c = L && L.cell > 4 ? L.cell : 30; return Math.max(14, c * (TQ.mouse ? 1 : 0.92)); }
function sample(e) { const i = TQ.n++ % 8; TQ.sx[i] = e.clientX; TQ.sy[i] = e.clientY; TQ.st[i] = e.timeStamp; }
function velocity(out) {
  // over the last ~70 ms of the gesture
  const last = (TQ.n - 1) % 8; let j = last;
  for (let k = 1; k < Math.min(8, TQ.n); k++) { const i = (TQ.n - 1 - k) % 8; j = i; if (TQ.st[last] - TQ.st[i] > 70) break; }
  const dt = Math.max(8, TQ.st[last] - TQ.st[j]);
  out.vx = (TQ.sx[last] - TQ.sx[j]) / dt; out.vy = (TQ.sy[last] - TQ.sy[j]) / dt;
  return out;
}
const VEL = { vx: 0, vy: 0 };
function liveForInput() { return ARC && ARC.state === 'play' && GAME && !GAME.cfg.attract && !GAME.bot; }
function attachGestures(a) {
  const cv = a.canvas;
  cv.addEventListener('pointerdown', (e) => {
    if (!liveForInput()) return;
    if (e.pointerType === 'mouse' && e.button === 2) { IN.hold++; return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (TQ.id != null) { if (e.pointerType === 'touch' && e.pointerId !== TQ.id) IN.rotCW++; return; }
    TQ.id = e.pointerId; TQ.mouse = e.pointerType === 'mouse';
    TQ.x0 = TQ.ax = e.clientX; TQ.y0 = TQ.ay = e.clientY; TQ.t0 = e.timeStamp; TQ.moved = false; TQ.n = 0; sample(e);
    TQ.seen++;
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== TQ.id) return;
    if (!liveForInput()) { TQ.id = null; return; }
    sample(e);
    const s = stepPx();
    let dx = e.clientX - TQ.ax;
    while (dx >= s) { IN.moves++; TQ.ax += s; dx -= s; TQ.moved = true; }
    while (dx <= -s) { IN.moves--; TQ.ax -= s; dx += s; TQ.moved = true; }
    // a slow drag down soft drops a row per cell dragged; a fast one is left for the flick
    velocity(VEL);
    let dy = e.clientY - TQ.ay;
    if (dy < 0) { TQ.ay = e.clientY; dy = 0; }
    if (VEL.vy < 0.75 && Math.abs(VEL.vx) < Math.max(0.3, VEL.vy * 1.2 + 0.25)) {
      while (dy >= s * 0.85) { IN.softRows++; TQ.ay += s * 0.85; dy -= s * 0.85; TQ.moved = true; }
    } else if (VEL.vy >= 0.75) TQ.moved = true;
  });
  const end = (e) => {
    if (e.pointerId !== TQ.id) return;
    TQ.id = null;
    if (e.type === 'pointercancel' || !liveForInput()) return;
    sample(e); velocity(VEL);
    const dx = e.clientX - TQ.x0, dy = e.clientY - TQ.y0, dist = Math.hypot(dx, dy), ms = e.timeStamp - TQ.t0;
    if (!TQ.moved && dist < 14 && ms < 320) {
      const r = cv.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 2) IN.rotCCW++; else IN.rotCW++;
      return;
    }
    // a flick: fast at the end, or the whole stroke quick and mostly vertical
    const quick = ms < 280 && Math.abs(dy) / Math.max(1, ms) > 0.5 && Math.abs(dy) > Math.abs(dx) * 1.6;
    if (dy > 36 && ((VEL.vy > 0.55 && VEL.vy > Math.abs(VEL.vx) * 1.3) || quick)) { IN.hard++; return; }
    if (dy < -36 && ((VEL.vy < -0.5 && -VEL.vy > Math.abs(VEL.vx) * 1.2) || quick)) { IN.hold++; }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('lostpointercapture', (e) => { if (e.pointerId === TQ.id) TQ.id = null; });
}
function readInputs(a) {
  const inp = a.input;
  const pad = inp.pad, st = inp.stick;
  const padL = pad.active && pad.x < -0.5, padR = pad.active && pad.x > 0.5;
  const stL = st.active && st.x < -0.45, stR = st.active && st.x > 0.45;
  IN.left = inp.down('ArrowLeft') || padL || stL;
  IN.right = inp.down('ArrowRight') || padR || stR;
  if (inp.hit('ArrowLeft')) IN.lastDir = -1;
  if (inp.hit('ArrowRight')) IN.lastDir = 1;
  if (padL && !IN.padL) IN.lastDir = -1; if (padR && !IN.padR) IN.lastDir = 1;
  IN.padL = padL; IN.padR = padR;
  IN.soft = inp.down('ArrowDown', 'KeyS') || (pad.active && pad.y > 0.5) || (st.active && st.y > 0.55 && Math.abs(st.x) < 0.6);
  if (inp.hit('ArrowUp', 'KeyX')) IN.rotCW++;
  if (inp.hit('KeyZ', 'ControlLeft', 'ControlRight')) IN.rotCCW++;
  if (inp.hit('KeyC', 'ShiftLeft', 'ShiftRight')) IN.hold++;
  if (inp.hit('Space')) IN.hard++;
  // controller: up on the d-pad or stick hard drops, once per push
  const pu = pad.active && pad.y < -0.6 && Math.abs(pad.x) < 0.6;
  if (pu && !IN.padUp) IN.hard++;
  IN.padUp = pu;
  const su = st.active && st.y < -0.75 && Math.abs(st.x) < 0.5;
  if (su && !IN.stickUp) IN.hard++;
  IN.stickUp = su;
}
function clearInputs() { IN.left = IN.right = IN.soft = false; IN.rotCW = IN.rotCCW = IN.hard = IN.hold = IN.moves = IN.softRows = 0; TQ.id = null; }

/* ------------------------------------------------------------ sound: its own small synth */
const AU = { ctx: null, master: null, music: null, sfx: null, noise: null, ok: false, next: 0, beat: 0, muted: false };
function audioInit() {
  if (AU.ok) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = new AC();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(c.destination);
    AU.master = c.createGain(); AU.master.gain.value = 0; AU.master.connect(comp);
    AU.music = c.createGain(); AU.music.gain.value = 0.55; AU.music.connect(AU.master);
    AU.sfx = c.createGain(); AU.sfx.gain.value = 1; AU.sfx.connect(AU.master);
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    AU.noise = nb; AU.ctx = c; AU.ok = true; AU.next = 0;
  } catch (e) { AU.ok = false; }
}
function audioLevel(target) {
  if (!AU.ok) return;
  const m = ARC && ARC.sfx.muted;
  try { AU.master.gain.setTargetAtTime(m ? 0 : target, AU.ctx.currentTime, 0.08); if (AU.ctx.state === 'suspended' && !m) AU.ctx.resume().catch(() => {}); } catch (e) { /* closed */ }
}
function tone(f, dur, o) {
  const c = AU.ctx, t = c.currentTime + (o.delay || 0);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.att || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(o.bus || AU.sfx); osc.start(t); osc.stop(t + dur + 0.05);
}
function noise(dur, o) {
  const c = AU.ctx, t = c.currentTime + (o.delay || 0);
  const src = c.createBufferSource(); src.buffer = AU.noise;
  const f = c.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.setValueAtTime(o.freq || 1000, t); if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur); f.Q.value = o.q || 0.8;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.att || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(AU.sfx); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
// a bell: a sine and its bright partials, for the line clear chimes
function bell(f, delay, vol) {
  tone(f, 1.1, { delay, vol, type: 'sine' });
  tone(f * 2.76, 0.5, { delay, vol: vol * 0.35, type: 'sine' });
  tone(f * 5.4, 0.22, { delay, vol: vol * 0.12, type: 'sine' });
}
// Bhoopali, a five note scale: Sa Re Ga Pa Dha.
const SCALE = [0, 2, 4, 7, 9];
const note = (deg, base) => base * Math.pow(2, (SCALE[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5)) / 12);
let lastMoveSnd = 0;
function sound(kind, d) {
  if (!AU.ok || (GAME && GAME.cfg.attract) || (ARC && ARC.sfx.muted)) return;
  try {
    const now = AU.ctx.currentTime;
    switch (kind) {
      case 'move': if (now - lastMoveSnd < 0.03) return; lastMoveSnd = now; tone(1650, 0.025, { vol: 0.035, type: 'triangle' }); break;
      case 'rotate': tone(720, 0.05, { vol: 0.05, type: 'triangle', slide: 980 }); break;
      case 'kick': tone(620, 0.07, { vol: 0.06, type: 'triangle', slide: 1240 }); noise(0.05, { filter: 'bandpass', freq: 2400, vol: 0.03 }); break;
      case 'lock': tone(150, 0.16, { vol: 0.22, slide: 62 }); noise(0.07, { freq: 520, vol: 0.08 }); break;
      case 'thunk': tone(130, 0.2, { vol: 0.26, slide: 55 }); noise(0.09, { freq: 420, vol: 0.1 }); break;
      case 'hard': {
        const r = d ? clamp(d.rows / 18, 0, 1) : 0.5;
        noise(0.09 + r * 0.05, { filter: 'bandpass', freq: 600, to: 2600, vol: 0.05 + r * 0.04, q: 1.4 });
        tone(105, 0.24, { vol: 0.34, slide: 44, delay: 0.015 }); tone(210, 0.08, { vol: 0.08, type: 'triangle', slide: 120, delay: 0.015 });
        noise(0.12, { freq: 360, vol: 0.14, delay: 0.015 });
        break;
      }
      case 'hold': noise(0.16, { filter: 'bandpass', freq: 320, to: 1800, vol: 0.08, q: 1.2 }); tone(540, 0.1, { vol: 0.04, type: 'sine', slide: 760, delay: 0.04 }); break;
      case 'clear': {
        const n = d.n, base = 261.6 * (1 + Math.min(d.combo > 0 ? d.combo : 0, 10) * 0.06);
        const k = n === 4 ? 6 : n + 2;
        for (let i = 0; i < k; i++) bell(note(i + (n === 4 ? 2 : 0), base), i * (n === 4 ? 0.055 : 0.07), n === 4 ? 0.11 : 0.085);
        noise(0.35, { filter: 'highpass', freq: 3800, vol: 0.05 + n * 0.012, att: 0.02 });
        if (n === 4) { tone(65, 1.4, { vol: 0.32, slide: 52 }); bell(note(10, base), 0.38, 0.14); noise(0.9, { filter: 'bandpass', freq: 5000, to: 1600, vol: 0.06, att: 0.05 }); }
        if (d.tw) { noise(0.06, { filter: 'bandpass', freq: 900, vol: 0.12, q: 3 }); tone(220, 0.25, { vol: 0.14, slide: 330 }); }
        break;
      }
      case 'twist': noise(0.06, { filter: 'bandpass', freq: 900, vol: 0.1, q: 3 }); tone(196, 0.3, { vol: 0.12, slide: 294 }); break;
      case 'level': for (let i = 0; i < 5; i++) bell(note(5 + i, 261.6), i * 0.06, 0.07); break;
      case 'tick': tone(880, 0.09, { vol: 0.06, type: 'triangle' }); break;
      case 'go': bell(note(5, 261.6), 0, 0.09); bell(note(7, 261.6), 0.03, 0.07); tone(130.8, 0.6, { vol: 0.12 }); break;
      case 'topout': for (let i = 0; i < 5; i++) tone(note(8 - i * 2, 196), 0.5, { delay: i * 0.12, vol: 0.09, type: 'triangle' }); tone(55, 1.6, { vol: 0.3, slide: 32, delay: 0.1 }); noise(1.4, { freq: 300, to: 80, vol: 0.12, delay: 0.1 }); break;
      case 'win': for (let i = 0; i < 8; i++) bell(note(5 + i, 261.6), i * 0.08, 0.09); tone(130.8, 1.6, { vol: 0.12, delay: 0.1 }); break;
    }
  } catch (e) { /* audio off */ }
}
// A tanpura drone: four plucked strings, Pa Sa Sa Sa, round and round; a little quicker each level.
function pluck(f, t, vol) {
  const c = AU.ctx;
  const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
  o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = f; o2.frequency.value = f * 1.004;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(520, t + 1.6); lp.Q.value = 2.5;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(AU.music);
  o1.start(t); o2.start(t); o1.stop(t + 2.7); o2.stop(t + 2.7);
}
const DRONE = [98, 130.8, 130.8, 65.4];
function music(G, playing) {
  if (!AU.ok || !playing || (ARC && ARC.sfx.muted)) { if (AU.ok) AU.next = 0; return; }
  const c = AU.ctx, now = c.currentTime;
  if (!AU.next || AU.next < now) AU.next = now + 0.05;
  const per = Math.max(0.36, 0.62 - (G.level - 1) * 0.018);
  let guard = 0;
  while (AU.next < now + 0.2 && guard++ < 4) {
    try {
      pluck(DRONE[AU.beat % 4], AU.next, AU.beat % 4 === 3 ? 0.07 : 0.05);
      // from level 4 a soft shaker keeps time
      if (G.level >= 4) { const src = c.createBufferSource(); src.buffer = AU.noise; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500; const g = c.createGain(); g.gain.setValueAtTime(0.0001, AU.next); g.gain.exponentialRampToValueAtTime(0.025, AU.next + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, AU.next + 0.07); src.connect(f); f.connect(g); g.connect(AU.music); src.start(AU.next, Math.random() * 0.5); src.stop(AU.next + 0.1); }
    } catch (e) { /* closed */ }
    AU.next += per; AU.beat++;
  }
}

/* ------------------------------------------------------------ haptics */
function haptic(kind, s) {
  if (!ARC || (GAME && GAME.cfg.attract)) return;
  try {
    if (typeof ARC.haptic === 'function') ARC.haptic(kind, s);
    else if (typeof ARC.buzz === 'function') ARC.buzz(Math.round(10 + s * 40));
  } catch (e) { /* no motor */ }
}

/* ------------------------------------------------------------ HUD */
const HUD = { scoreV: -1, scoreS: '0', linesV: -1, linesS: '0', timeK: -1, timeS: '0:00', fc: -1, fSmall: '', fBig: '', fMid: '', fMono: '', fBold: '', fPopBig: '', fPopMid: '', fSub: '', fCount: '', fEnd: '', small: 10, big: 20, mid: 14 };
function txt(ctx, s, x, y, font, col, align) { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.fillText(s, x, y); }
function hudRow(ctx, x, y, label, val, big, col) {
  txt(ctx, label, x, y, HUD.fSmall, DIM, 'right'); y += (big ? HUD.big : HUD.mid) * 1.05;
  txt(ctx, val, x, y, big ? HUD.fBig : HUD.fMid, col, 'right'); return y + HUD.small * 2.4;
}
function fonts(c) {
  if (HUD.fc === c) return;
  HUD.fc = c;
  const small = HUD.small = Math.round(clamp(c * 0.36, 9, 13)), big = HUD.big = Math.round(clamp(c * 0.95, 18, 38)), mid = HUD.mid = Math.round(clamp(c * 0.62, 13, 24));
  HUD.fSmall = '600 ' + small + 'px ' + F_MONO; HUD.fBold = '700 ' + small + 'px ' + F_MONO;
  HUD.fBig = '600 ' + big + 'px ' + F_DISP; HUD.fMid = '600 ' + mid + 'px ' + F_MONO;
  HUD.fPopBig = '700 ' + Math.round(big * 1.05) + 'px ' + F_DISP; HUD.fPopMid = '700 ' + Math.round(mid * 1.05) + 'px ' + F_MONO;
  HUD.fSub = '600 ' + Math.round(small * 1.15) + 'px ' + F_MONO; HUD.fHint = '600 ' + Math.round(clamp(c * 0.42, 9, 12)) + 'px ' + F_MONO;
  HUD.fCount = '700 ' + Math.round(big * 1.5) + 'px ' + F_DISP; HUD.fEnd = '700 ' + Math.round(big * 1.3) + 'px ' + F_DISP;
}
export function drawHUD(ctx, a, G) {
  const L = VIEW && VIEW.layout; if (!L || !G || !L.cell) return;
  ctx.textBaseline = 'alphabetic';
  const c = L.cell;
  fonts(Math.round(c * 4) / 4);
  const small = HUD.small, big = HUD.big, mid = HUD.mid;
  if (HUD.scoreV !== G.score) { HUD.scoreV = G.score; HUD.scoreS = fmt(G.score); }
  const mode = G.cfg.mode;
  if (HUD.linesV !== G.lines || HUD.modeV !== mode) { HUD.linesV = G.lines; HUD.modeV = mode; HUD.linesS = String(G.lines); HUD.leftS = String(Math.max(0, 40 - G.lines)); HUD.linesTagS = mode === 'sprint' ? 'LEFT ' + HUD.leftS : 'LINES ' + HUD.linesS; }
  if (HUD.levelV !== G.level) { HUD.levelV = G.level; HUD.levelS = String(G.level); HUD.lvS = 'LV ' + G.level; }
  if (HUD.piecesV !== G.stats.pieces) { HUD.piecesV = G.stats.pieces; HUD.piecesS = String(G.stats.pieces); }
  if (HUD.tagC !== G.combo || HUD.tagB !== G.b2b) { HUD.tagC = G.combo; HUD.tagB = G.b2b; HUD.tagS = (G.combo > 0 ? 'COMBO ' + G.combo : '') + (G.combo > 0 && G.b2b ? '   ' : '') + (G.b2b ? 'B2B' : ''); }
  const tShow = mode === 'blitz' ? Math.max(0, MODES.blitz.secs - G.time) : G.time;
  const tk = Math.floor(tShow * (mode === 'sprint' ? 20 : 2));
  if (tk !== HUD.timeK) { HUD.timeK = tk; HUD.timeS = fmtTime(tShow, mode === 'sprint'); }
  const att = G.cfg.attract;
  // labels over the side panels
  ctx.globalAlpha = att ? 0.55 : 1;
  if (L.tall) {
    txt(ctx, 'HOLD', L.hold.x + small * 0.8, L.hold.y + small * 1.5, HUD.fSmall, DIM);
    txt(ctx, 'NEXT', L.next.x + small * 0.8, L.next.y + small * 1.5, HUD.fSmall, DIM);
  } else {
    txt(ctx, 'HOLD', L.hold.x + L.hold.w / 2, L.hold.y - small * 0.7, HUD.fSmall, DIM, 'center');
    txt(ctx, 'NEXT', L.next.x + L.next.w / 2, L.next.y - small * 0.7, HUD.fSmall, DIM, 'center');
  }
  ctx.globalAlpha = 1;
  if (!att) {
    const linesVal = mode === 'sprint' ? HUD.leftS : HUD.linesS;
    if (L.portrait) {
      // a strip above the board: score left, the clock in the middle, level and lines right
      const y0 = L.ty - small * 0.2;
      txt(ctx, mode === 'sprint' ? 'TIME' : 'SCORE', L.bx0, y0 - big * 0.95, HUD.fSmall, DIM);
      txt(ctx, mode === 'sprint' ? HUD.timeS : HUD.scoreS, L.bx0, y0, HUD.fBig, INK);
      txt(ctx, HUD.lvS, L.bx1, y0 - big * 0.95, HUD.fSmall, GOLD, 'right');
      txt(ctx, HUD.linesTagS, L.bx1, y0, HUD.fMid, INK, 'right');
      if (mode === 'blitz') txt(ctx, HUD.timeS, (L.bx0 + L.bx1) / 2 + c * 1.2, y0, HUD.fMid, tShow < 10 ? '#ff8a6a' : INK, 'center');
    } else {
      // a column under the hold panel
      let y = L.hold.y + L.hold.h + mid * 2.2;
      const x = L.hold.x + L.hold.w;
      if (mode === 'sprint') { y = hudRow(ctx, x, y, 'TIME', HUD.timeS, true, INK); y = hudRow(ctx, x, y, 'LINES LEFT', linesVal, false, INK); y = hudRow(ctx, x, y, 'PIECES', HUD.piecesS, false, INK); }
      else { y = hudRow(ctx, x, y, 'SCORE', HUD.scoreS, true, INK); if (mode === 'blitz') y = hudRow(ctx, x, y, 'TIME LEFT', HUD.timeS, false, tShow < 10 ? '#ff8a6a' : INK); y = hudRow(ctx, x, y, 'LEVEL', HUD.levelS, false, GOLD); y = hudRow(ctx, x, y, 'LINES', HUD.linesS, false, INK); }
      if (G.combo > 0 || G.b2b) txt(ctx, HUD.tagS, x, y + small * 0.4, HUD.fBold, G.b2b ? '#7ce8ff' : '#ffd36a', 'right');
    }
    // combo and back to back tags beside the board
    if ((G.combo > 0 || G.b2b) && L.portrait) txt(ctx, HUD.tagS, (L.bx0 + L.bx1) / 2, L.ty - small * 0.2 - big * 0.95, HUD.fBold, G.b2b ? '#7ce8ff' : '#ffd36a', 'center');
  }
  // popups over the board: the clear first, then back to back and the combo under it
  const cx = (L.bx0 + L.bx1) / 2;
  let py = L.by0 + (L.by1 - L.by0) * 0.3;
  for (let i = 0; i < G.pops.length; i++) {
    const p = G.pops[i], k = p.t, rm = a.reducedMotion;
    const al = k < 0.12 ? k / 0.12 : k > 1.1 ? Math.max(0, 1 - (k - 1.1) / 0.4) : 1;
    const sc = rm ? 1 : k < 0.18 ? 0.7 + 0.3 * (1 - Math.pow(1 - k / 0.18, 3)) + Math.sin(k / 0.18 * Math.PI) * 0.08 : 1;
    const f = Math.round((p.big >= 1 ? big * 1.05 : mid * 1.05));
    py += f;
    ctx.globalAlpha = al;
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 10;
    ctx.save(); ctx.translate(cx, py - (rm ? 0 : k * c * 0.5)); ctx.scale(sc, sc);
    txt(ctx, p.text, 0, 0, (p.big >= 1 ? HUD.fPopBig : HUD.fPopMid), p.col, 'center');
    if (p.sub) txt(ctx, p.sub, 0, small * 1.7, HUD.fSub, INK, 'center');
    ctx.restore();
    ctx.shadowBlur = 0;
    py += (p.sub ? small * 1.9 : 0) + f * 0.4;
  }
  ctx.globalAlpha = 1;
  // countdown
  if (G.phase === 'intro' && !att) {
    const k = G.pt / INTRO, label = k < 0.6 ? 'READY' : 'GO';
    const al = k < 0.6 ? Math.min(1, k * 4) : Math.max(0, 1 - (k - 0.6) * 2.5);
    ctx.globalAlpha = al; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 14;
    txt(ctx, label, cx, (L.by0 + L.by1) / 2, HUD.fCount, label === 'GO' ? GOLD : INK, 'center');
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  if (G.phase === 'end' && !att) {
    const k = clamp(G.endT / 0.5, 0, 1);
    const t = G.endKind === 'topout' ? 'BOARD FULL' : G.endKind === 'timeup' ? 'TIME' : mode === 'sprint' ? 'CLEAR' : 'COMPLETE';
    ctx.globalAlpha = k; ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 16;
    txt(ctx, t, cx, (L.by0 + L.by1) / 2, HUD.fEnd, G.endKind === 'topout' ? '#ff9b80' : GOLD, 'center');
    if (mode === 'sprint' && G.endKind === 'win') txt(ctx, fmtTime(G.time, true), cx, (L.by0 + L.by1) / 2 + big * 1.1, HUD.fMid, INK, 'center');
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  // a reminder of the gestures for the first seconds on a touch screen
  if (!att && a.touchMode && a.touchStyle === 'gesture' && G.time < 7 && G.phase !== 'end') {
    const al = G.time < 5 ? 0.85 : Math.max(0, (7 - G.time) / 2) * 0.85;
    ctx.globalAlpha = al;
    const pad = a.hudPad(); const y = a.h - Math.max(18, pad.bottom - 30);
    txt(ctx, 'DRAG MOVE  ·  TAP TURN  ·  FLICK DOWN DROP  ·  UP HOLD', a.w / 2, y, HUD.fHint, INK, 'center');
    ctx.globalAlpha = 1;
  }
}


/* ------------------------------------------------------------ layout and animation, shared by both views */
// World units: one cell is 1, the board spans x -5..5 and y -10..10, pieces appear up to y 12.
// Three arrangements: a tall phone puts hold and next in a strip above the board, so the board
// can use the full height; a tablet or a landscape screen puts them in columns either side.
export function layoutUnits(w, h) {
  const tall = h > w * 1.55, portrait = w < h * 0.95, frame = 0.6;
  const U = { tall, portrait, frame, slots: [] };
  if (tall) {
    const y0 = 12.75, ph = 2.7, cy = y0 + ph / 2;
    U.hold = { cx: -4.85, cy, w: 3.0, h: ph };
    U.next = { cx: 1.7, cy, w: 9.2, h: ph };
    U.holdS = 0.5;
    U.slots.push({ x: -1.6, y: cy - 0.12, s: 0.52 });
    for (let i = 1; i < 6; i++) U.slots.push({ x: 0.4 + (i - 1) * 1.65, y: cy - 0.12, s: 0.36 });
    U.xmin = -6.6; U.xmax = 6.6; U.ymin = -10 - frame - 0.25; U.ymax = y0 + ph + 0.1;
  } else {
    const s = portrait ? 0.5 : 0.62, colW = portrait ? 2.9 : 4.3, gap = portrait ? 0.42 : 0.85, slot = portrait ? 1.55 : 1.95;
    const holdCx = -(5 + frame + gap + colW / 2), holdH = portrait ? 2.5 : 3.2, nextH = slot * 5 + 0.45;
    U.hold = { cx: holdCx, cy: 10 - holdH / 2, w: colW, h: holdH };
    U.next = { cx: -holdCx, cy: 10 - nextH / 2, w: colW, h: nextH };
    U.holdS = s;
    for (let i = 0; i < 6; i++) U.slots.push({ x: -holdCx, y: 10 - slot * (i + 0.5) - 0.2, s: s * (i === 0 ? 1.12 : 0.92) });
    U.xmin = holdCx - colW / 2 - 0.25; U.xmax = -holdCx + colW / 2 + 0.25; U.ymin = -10 - frame - 0.25; U.ymax = 12.4;
  }
  return U;
}
// Where the i-th next piece sits while the queue slides up by one (k from 1 down to 0).
export function slotAt(U, i, k, out) {
  const a = U.slots[i], b = U.slots[i + 1] || a;
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.s = a.s + (b.s - a.s) * k;
  return out;
}
// Screen space the board must leave free: the score strip above it on a phone, the controls below.
export function margins(a, U) {
  const pad = a.hudPad ? a.hudPad() : { bottom: 52, touch: false };
  const top = U.tall ? Math.round(clamp(a.h * 0.06, 42, 64)) : U.portrait ? Math.round(clamp(a.h * 0.085, 58, 112)) : 14;
  const bottom = pad.touch ? (pad.bottom > 100 ? pad.bottom - 6 : Math.max(30, pad.bottom - 22)) : 16;
  return { top, bottom, left: 8, right: 8 };
}
export function makeAnim() {
  return {
    px: 0, py: 0, rot: 0, pop: 1, pid: -1, glow: 0,
    flash: new Float32Array(COLS * ROWS), squash: new Float32Array(COLS * ROWS),
    drop: new Float32Array(ROWS), dropV: new Float32Array(ROWS), land: new Float32Array(ROWS),
    burst: new Uint8Array(COLS * ROWS), crumble: new Float32Array(COLS * ROWS * 4),
    nextShift: 0, holdPop: 0, dip: 0, dipV: 0, punch: 0, levelK: 1, palFrom: 0, palTo: 0,
    trailT: 9, trailX0: 0, trailX1: 0, trailY0: 0, trailY1: 0, trailType: 0,
    sweep: new Float32Array(4), sweepRow: new Float32Array(4), sweepN: 0, shockT: 9, ringT: 9, endSeen: false,
  };
}
const CRUMBLE_AT = 0.85;
export function animEvent(A, type, d, G) {
  if (type === 'spawn' || type === 'reset') {
    const c = G.cur; A.pid = G.pieceId; A.px = c.x; A.py = c.y; A.rot = 0; A.pop = type === 'reset' ? 1 : 0; A.glow = 1;
    if (type === 'spawn') A.nextShift = 1;
  } else if (type === 'rotate') { A.rot = d.irs ? 0 : (d.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
  else if (type === 'hold') { A.holdPop = 1; }
  else if (type === 'drop') {
    A.trailT = 0; A.trailType = d.t; A.trailY0 = d.y0; A.trailY1 = d.y1;
    const s = SHAPES[d.t][d.r]; let x0 = 99, x1 = -99;
    for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, d.x + s[i]); x1 = Math.max(x1, d.x + s[i]); }
    A.trailX0 = x0; A.trailX1 = x1; A.py = d.y1;
  } else if (type === 'lock') {
    const s = SHAPES[d.t][d.r];
    for (let i = 0; i < 8; i += 2) { const x = d.x + s[i], y = d.y + s[i + 1]; if (y >= 0 && y < ROWS) { A.flash[y * COLS + x] = 1; A.squash[y * COLS + x] = d.hard ? 1 : 0.6; } }
    A.dipV -= d.hard ? clamp(1.2 + d.rows * 0.18, 1.2, 4.5) : 0.6;
  } else if (type === 'clear') {
    if (d.n > 0) {
      A.burst.fill(0); A.sweepN = 0;
      for (let i = 0; i < d.n; i++) { A.sweep[i] = 0; A.sweepRow[i] = d.rows[i]; A.sweepN++; }
      if (d.n === 4 || d.allClear) { A.shockT = 0; A.punch = 1; }
    }
  } else if (type === 'collapse') {
    let n = 0;
    A.drop.fill(0); A.dropV.fill(0);
    const cleared = (o) => { for (let i = 0; i < d.n; i++) if (d.rows[i] === o) return true; return false; };
    for (let o = 0; o < ROWS; o++) {
      if (cleared(o)) continue;
      if (o !== n) { for (let x = 0; x < COLS; x++) { A.flash[n * COLS + x] = A.flash[o * COLS + x]; A.squash[n * COLS + x] = A.squash[o * COLS + x]; } }
      A.drop[n] = o - n; n++;
    }
    for (let y = n; y < ROWS; y++) for (let x = 0; x < COLS; x++) { A.flash[y * COLS + x] = 0; A.squash[y * COLS + x] = 0; }
  } else if (type === 'level') { A.palFrom = d.snap ? d.level : A.palTo || d.level; A.palTo = d.level; A.levelK = d.snap ? 1 : 0; if (!d.snap) A.ringT = 0; }
  else if (type === 'end') {
    A.endSeen = true;
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = i % COLS;
      A.crumble[i * 4] = (x - 4.5) * 0.35 + (Math.random() - 0.5) * 2.2;
      A.crumble[i * 4 + 1] = 2 + Math.random() * 4;
      A.crumble[i * 4 + 2] = (Math.random() - 0.5) * 9;
      A.crumble[i * 4 + 3] = Math.random() * 0.25;
    }
    if (d.kind !== 'topout') A.shockT = 0;
  }
}
export function animTick(A, dt, G) {
  const c = G.cur;
  if (G.has && A.pid !== G.pieceId) animEvent(A, 'spawn', null, G);
  if (G.has) {
    const k = 1 - Math.exp(-dt * 30);
    if (Math.abs(c.y - A.py) > 2.5) A.py = c.y + Math.sign(A.py - c.y) * 2.5;
    if (Math.abs(c.x - A.px) > 3) A.px = c.x + Math.sign(A.px - c.x) * 3;
    A.px += (c.x - A.px) * k; A.py += (c.y - A.py) * k;
  }
  A.rot *= Math.exp(-dt * 24); if (Math.abs(A.rot) < 0.002) A.rot = 0;
  A.pop = Math.min(1, A.pop + dt * 9); A.glow = Math.max(0, A.glow - dt * 3);
  A.nextShift = Math.max(0, A.nextShift - dt * 7); A.holdPop = Math.max(0, A.holdPop - dt * 4);
  for (let i = 0; i < COLS * ROWS; i++) {
    if (A.flash[i] > 0) A.flash[i] = Math.max(0, A.flash[i] - dt * 3.2);
    if (A.squash[i] > 0) A.squash[i] = Math.max(0, A.squash[i] - dt * 5);
  }
  for (let y = 0; y < ROWS; y++) {
    if (A.drop[y] > 0) { A.dropV[y] += dt * 70; A.drop[y] -= A.dropV[y] * dt; if (A.drop[y] <= 0) { A.drop[y] = 0; A.land[y] = Math.min(1, A.dropV[y] * 0.04); A.dropV[y] = 0; } }
    if (A.land[y] > 0) A.land[y] = Math.max(0, A.land[y] - dt * 5);
  }
  // the camera dips on a lock and springs back
  A.dipV += (-A.dip * 160 - A.dipV * 15) * dt; A.dip += A.dipV * dt;
  A.punch = Math.max(0, A.punch - dt * 2.2);
  A.trailT += dt; A.shockT += dt; A.ringT += dt;
  for (let i = 0; i < A.sweepN; i++) A.sweep[i] += dt;
  A.levelK = Math.min(1, A.levelK + dt * 0.8);
}
// How a board tile looks right now: offsets, scale, spin, white flash, grey. Written into the shared T object.
export const TILE = { x: 0, y: 0, z: 0, s: 1, sz: 1, rz: 0, white: 0, grey: 0, glow: 0, hide: false, burstNow: false };
export function boardTile(A, G, x, y, rm) {
  const T = TILE, i = y * COLS + x;
  T.x = x; T.y = y + A.drop[y]; T.z = 0; T.s = 1; T.sz = 1; T.rz = 0; T.white = 0; T.grey = 0; T.hide = false; T.burstNow = false;
  T.glow = 0.85 + A.flash[i] * 1.8;
  const sq = A.squash[i];
  if (sq > 0 && !rm) { const k = Math.sin(sq * Math.PI); T.sz = 1 - k * 0.35 * sq; T.z = -k * 0.12; T.s = 1 + k * 0.04; }
  if (A.land[y] > 0 && !rm) T.s *= 1 + A.land[y] * 0.06;
  if (G.phase === 'clear' && G.clearMask[y]) {
    const t = G.clearT / CLEAR_DUR, delay = Math.abs(x - 4.5) * 0.045, k = clamp((t - 0.28 - delay) / 0.5, 0, 1);
    T.white = clamp(t / 0.25, 0, 1) * (1 - k * 0.6); T.glow += 1.5 * T.white;
    if (k > 0 && !A.burst[i]) { A.burst[i] = 1; T.burstNow = true; }
    T.s = (1 + 0.1 * clamp(t / 0.25, 0, 1)) * (1 - k); T.rz = rm ? 0 : k * k * 2.2 * (x < 5 ? -1 : 1);
    if (T.s < 0.02) T.hide = true;
  }
  if (G.phase === 'end') {
    const e = G.endT;
    if (G.endKind === 'topout') {
      T.grey = clamp(e * 2.2 - y * 0.06, 0, 1); T.glow *= 1 - T.grey * 0.75;
      const tt = e - CRUMBLE_AT - A.crumble[i * 4 + 3] - y * 0.012;
      if (tt > 0 && !rm) {
        T.x += A.crumble[i * 4] * tt; T.y += A.crumble[i * 4 + 1] * tt - 14 * tt * tt; T.z += tt * 3;
        T.rz += A.crumble[i * 4 + 2] * tt;
        if (T.y < -14) T.hide = true;
      }
    } else {
      const w = clamp(e * 2.4 - y * 0.08, 0, 1.6);
      T.glow += Math.sin(clamp(w, 0, 1) * Math.PI) * 2.2; T.white = Math.sin(clamp(w, 0, 1) * Math.PI) * 0.35;
    }
  }
  return T;
}

/* ------------------------------------------------------------ menu, results and the shell */
const CSS = '.rd-res{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 12px}.rd-res div{background:var(--bg-elev);border:1px solid var(--rule);border-radius:10px;padding:8px 10px;font-size:11px;color:var(--ink-mute);font-family:var(--font-mono);letter-spacing:.06em;text-transform:uppercase}' +
  '.rd-res b{display:block;font-size:17px;color:var(--ink);font-family:var(--font-mono);letter-spacing:0;text-transform:none;margin-top:2px}.rd-note{font-size:13px;color:var(--ink-mute);margin:0 0 8px}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
function menuProps() {
  return {
    eyebrow: 'Falling block puzzle', title: 'Rangoli <em>Drop</em>',
    html: '<p>Glowing rangoli tiles fall in seven shapes. Turn and slide them so whole rows fill; a full row bursts into colour powder. Clear four rows at once for a <b>Chauka</b>, turn the T shape into a tight gap for a <b>Twist</b>, and chain clears for combos.</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'marathon', choices: [{ v: 'marathon', label: 'Marathon' }, { v: 'sprint', label: 'Sprint 40' }, { v: 'blitz', label: 'Blitz 2:00' }], note: 'Marathon: 150 lines, faster every 10. Sprint: 40 lines against the clock. Blitz: best score in two minutes.' },
      { id: 'start', label: 'Start level (Marathon)', value: '1', choices: [{ v: '1', label: '1' }, { v: '5', label: '5' }, { v: '10', label: '10' }, { v: '15', label: '15' }] },
    ],
  };
}
const HANDLING_OPTS = [
  { id: 'das', label: 'Held direction (auto shift)', value: 'std', choices: [{ v: 'gentle', label: 'Gentle' }, { v: 'std', label: 'Standard' }, { v: 'fast', label: 'Fast' }, { v: 'instant', label: 'Instant' }], note: 'How soon a held left or right starts sliding the piece, and how fast it slides.' },
  { id: 'sdf', label: 'Soft drop speed', value: '20', choices: [{ v: '10', label: 'Steady' }, { v: '20', label: 'Quick' }, { v: 'inst', label: 'Instant' }] },
  { id: 'ghost', label: 'Ghost piece', value: 'on', choices: [{ v: 'on', label: 'Show' }, { v: 'off', label: 'Hide' }] },
];
const lines = (n) => n + (n === 1 ? ' line' : ' lines');
function bestKey(mode) { return 'arcade.rangoli-drop.best.' + mode; }
function finish(G) {
  const a = ARC, s = G.stats, mode = G.cfg.mode;
  const pps = G.time > 0 ? (s.pieces / G.time).toFixed(2) : '0';
  const cell = (k, v) => '<div>' + k + '<b>' + v + '</b></div>';
  let html, title, eyebrow;
  if (mode === 'sprint') {
    const won = G.endKind === 'win';
    const prev = a.store.get(bestKey('sprint'), null);
    const isBest = won && (prev == null || G.time < prev);
    if (isBest) a.store.set(bestKey('sprint'), G.time);
    eyebrow = 'Sprint 40'; title = won ? 'Sprint <em>clear</em>' : 'Board <em>full</em>';
    html = '<p class="rd-note">' + (won ? 'Forty lines in ' + fmtTime(G.time, true) + (isBest ? ', a new personal best.' : '.') : 'The stack reached the top after ' + lines(G.lines) + '.') + (prev != null && !isBest ? ' Best: ' + fmtTime(prev, true) + '.' : '') + '</p>' +
      '<div class="rd-res">' + cell('Time', fmtTime(G.time, true)) + cell('Lines', G.lines) + cell('Pieces', s.pieces) + cell('Per second', pps) + cell('Chaukas', s.chaukas) + cell('Max combo', Math.max(0, s.maxCombo)) + '</div>';
    a.over({ eyebrow, title, html, again: 'Run it again' });
    return;
  }
  eyebrow = mode === 'blitz' ? 'Blitz 2:00' : 'Marathon';
  title = G.endKind === 'topout' ? 'Board <em>full</em>' : mode === 'blitz' ? 'Time <em>up</em>' : 'Marathon <em>complete</em>';
  const prev = a.store.get(bestKey(mode), null);
  if (prev == null || G.score > prev) a.store.set(bestKey(mode), G.score);
  html = '<p class="rd-note">' + (mode === 'blitz' ? 'Two minutes, ' + lines(G.lines) + ', level ' + G.level + '.' : lines(G.lines) + ', reached level ' + G.level + '.') + (prev != null ? ' Best in ' + eyebrow + ': ' + fmt(Math.max(prev, G.score)) + '.' : '') + '</p>' +
    '<div class="rd-res">' + cell('Lines', G.lines) + cell('Level', G.level) + cell('Pieces', s.pieces) + cell('Chaukas', s.chaukas) + cell('Twists', s.twists) + cell('Max combo', Math.max(0, s.maxCombo)) + cell('All clears', s.allClears) + cell('Per second', pps) + cell('Time', fmtTime(G.time)) + '</div>';
  a.over({ eyebrow, title, html, score: G.score });
}
function debugState() {
  const G = GAME, a = ARC;
  if (!G) return { state: a.state, phase: 'none' };
  const c = G.cur;
  return {
    state: a.state, phase: G.cfg.attract ? 'attract' : G.phase === 'end' ? 'over' : G.phase, mode: G.cfg.mode, renderer: VIEW ? VIEW.name : 'none',
    alive: G.phase !== 'end', score: G.score, lines: G.lines, level: G.level, combo: G.combo, b2b: G.b2b, time: +G.time.toFixed(2),
    piece: G.has ? { type: TYPES[c.t], x: c.x, y: c.y, rot: c.r } : null, ghostY: G.ghostY, hold: G.hold >= 0 ? TYPES[G.hold] : null, next: G.queue.slice(0, 5).map((t) => TYPES[t]).join(''),
    pieces: G.stats.pieces, moves: G.stats.moves, rotations: G.stats.rotations, holds: G.stats.holds, hardDrops: G.stats.hard, softRows: G.stats.soft,
    chaukas: G.stats.chaukas, twists: G.stats.twists, allClears: G.stats.allClears, filled: G.board.reduce((n, v) => n + (v ? 1 : 0), 0),
    lastClear: G.lastClear, bot: G.bot, gestures: TQ.seen, handling: SET,
    gfx: VIEW && VIEW.debug ? VIEW.debug() : null,
  };
}
// A finished board for the poster and screenshots: a deep stack with a well on the right and a long
// piece above it. With poster set, the piece drops by itself and the moment is held mid burst.
function showcase(poster) {
  const G = GAME; if (!G || G.cfg.attract) return Promise.resolve(false);
  const apply = () => {
    const P = [
      '2233344455', '6623311445', '6622014455', '0662661555',
      '06.2..1.5.', '0...3.....',
    ];
    G.board.fill(0);
    P.forEach((row, i) => { for (let x = 0; x < COLS; x++) { const ch = row[x]; if (ch !== '.') G.board[i * COLS + x] = (+ch) + 1; } });
    for (let y = 0; y < 4; y++) G.board[y * COLS + 9] = 0;
    G.phase = 'live'; G.pt = INTRO; G.level = 3; G.lines = 21; G.score = 18240; G.combo = 1; G.b2b = true; G.hold = 2; G.time = 214; G.bot = false;
    G.queue.splice(0, G.queue.length, 2, 6, 3, 1, 5, 4, 0); fillBag(G);
    spawn(G, 0); const c = G.cur; c.r = 1; c.x = 7; c.y = 9; G.ghostY = ghostOf(G); G.lowest = c.y;
    ev('level', { level: G.level, snap: true }); ev('reset', {});
    if (poster) { G.cfg.dropAt = G.time + 0.3; FREEZE_AT = G.time + 0.3 + 0.62; }
    if (VIEW && VIEW.dev && VIEW.dev.still) VIEW.dev.still();
    return true;
  };
  return (VIEW && VIEW.whenReady ? VIEW.whenReady() : Promise.resolve()).then(apply);
}
export function boot(view) {
  VIEW = view;
  const A = window.Arcade;
  A.create({
    three: !!view.three,
    slug: 'rangoli-drop', title: 'Rangoli Drop', genre: 'Falling block puzzle',
    graphics(level) { if (view.graphics) view.graphics(level); },
    hint: 'Arrows move, Up or X turns, Z turns back, Space drops, C holds.',
    touchHint: 'Stick moves and soft drops, flick it up to drop. Buttons turn and hold.',
    keys: [['Left / Right arrows', 'Move'], ['Down arrow / S', 'Soft drop'], ['Up arrow / X', 'Rotate clockwise'], ['Z', 'Rotate anticlockwise'], ['Space', 'Hard drop'], ['C / Shift', 'Hold']],
    gameKeys: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyZ', 'KeyC', 'KeyS'],
    mouse: { steer: false, cursor: 'default', keys: [['Drag', 'Move, slow drag down soft drops'], ['Click left / right half', 'Turn anticlockwise / clockwise'], ['Flick down', 'Hard drop'], ['Right click', 'Hold']] },
    // Controller: d-pad moves and soft drops, up hard drops; A turns, B turns back, X holds, Y drops; triggers soft drop.
    gamepad: { buttons: ['KeyX', 'KeyC', 'KeyZ', 'Space'], rt: 'KeyS', lt: 'KeyS' },
    touch: { stick: true, pads: [{ label: 'Turn', key: 'KeyX', big: true, hot: true }, { label: 'Back', key: 'KeyZ' }, { label: 'Hold', key: 'KeyC' }, { label: 'Drop', key: 'Space' }] },
    touchKeys: [['Stick left / right', 'Move'], ['Stick down', 'Soft drop'], ['Flick the stick up', 'Hard drop'], ['Turn / Back', 'Rotate clockwise / anticlockwise'], ['Hold', 'Keep a piece for later'], ['Drop', 'Hard drop']],
    gestures: {
      drag: false, tilt: false,
      hint: 'Drag to move. Tap to turn. Flick down to drop, up to hold.',
      keys: [['Drag left / right', 'Move a cell at a time'], ['Tap right / left side', 'Turn clockwise / anticlockwise'], ['Slow drag down', 'Soft drop'], ['Flick down', 'Hard drop'], ['Flick up', 'Hold'], ['Second finger tap', 'Turn while you drag']],
    },
    formatScore: (v) => fmt(v),
    pauseHtml: () => (GAME && !GAME.cfg.attract ? '<p class="rd-note">' + (GAME.cfg.mode === 'sprint' ? 'Sprint: ' + Math.max(0, 40 - GAME.lines) + ' lines to go, ' + fmtTime(GAME.time, true) + '.' : 'Score ' + fmt(GAME.score) + ', level ' + GAME.level + ', ' + lines(GAME.lines) + '.') + ' Handling and the ghost piece are in Settings.</p>' : ''),
    resize: (a) => { if (view.resize) view.resize(a); },
    onMute: (m) => { audioLevel(m ? 0 : 0.8); },
    init(a) {
      ARC = a;
      const origMenu = a.menu;
      a.menu = function (p) { return origMenu(Object.assign(menuProps(), p || {})); };
      // Settings gets the handling options: auto shift, soft drop speed and the ghost piece.
      const origPanel = a.panel;
      a.panel = function (p) { if (p && p.isSettings) p = Object.assign({}, p, { options: (p.options || []).concat(HANDLING_OPTS) }); return origPanel(p); };
      HANDLING_OPTS.forEach((o) => { if (a.choices[o.id] == null) a.choices[o.id] = a.store.get('arcade.rangoli-drop.' + o.id, o.value); });
      a.debug = debugState;
      a.dev = Object.assign({
        game: () => GAME,
        bot: (on, gap) => { if (GAME) { GAME.bot = on !== false; GAME.cfg.botGap = gap || 0.05; GAME.botFor = -1; } },
        skip: () => { if (GAME && GAME.phase === 'intro') GAME.pt = INTRO; },
        showcase,
      }, view.dev || {});
      attachGestures(a);
      injectCss();
      a.menu();
      if (view.init) view.init(a);
    },
    onMenu() { injectCss(); },
    start(a, ch) {
      injectCss();
      const mode = MODES[ch.mode] ? ch.mode : 'marathon';
      const startLevel = mode === 'marathon' ? clamp(+(ch.start || 1) || 1, 1, 15) : 1;
      GAME = newGame({ mode, startLevel, attract: false }); FREEZE_AT = -1;
      clearInputs();
      audioInit(); audioLevel(0.8); AU.next = 0;
      if (view.newGame) view.newGame(GAME, a);
      sound('tick');
    },
    update(dt, a) {
      const G = GAME; if (!G || frozen()) return;
      SET = settings();
      if (!G.bot) readInputs(a);
      const lv = G.level;
      step(G, dt);
      if (G.level !== lv && !G.cfg.attract) { sound('level'); haptic('success', 0.6); }
      music(G, G.phase !== 'end');
    },
    idle(dt, a) {
      if (a.state === 'menu') {
        if (!GAME || !GAME.cfg.attract || (GAME.phase === 'end' && GAME.endT > 1.4)) {
          GAME = newGame({ mode: 'marathon', startLevel: 3, attract: true });
          if (view.newGame) view.newGame(GAME, a);
        }
        SET = settings();
        step(GAME, dt);
      } else if (a.state === 'over' && GAME) step(GAME, dt);
      music(GAME, false);
    },
    render(ctx, a) {
      if (!GAME) { ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, a.w, a.h); return; }
      let ok;
      try { ok = view.render(a, GAME, ctx) !== false; } catch (e) { ok = false; console.warn(e); }
      if (ok) drawHUD(ctx, a, GAME);
    },
    onPause() { clearInputs(); audioLevel(0); },
    onResume() { audioLevel(0.8); AU.next = 0; },
    onOver() { audioLevel(0.35); },
  });
}
export { sound, haptic, INTRO, CLEAR_DUR, END_DUR, ARE };
export const ghostOn = () => !ARC || ARC.choices.ghost !== 'off';
// Sound and haptics for the game's events live here, so both views feel the same.
function feel(type, d) {
  if (type === 'drop') { sound('hard', { rows: d.y0 - d.y1 }); haptic('hit', clamp(0.25 + (d.y0 - d.y1) / 30, 0.25, 0.6)); }
  else if (type === 'clear') {
    if (d.n > 0) sound('clear', d); else if (d.tw) sound('twist');
    if (d.n === 4 || d.allClear) haptic('heavy', 1); else if (d.n > 0) haptic('hit', 0.35 + d.n * 0.15); else haptic('tap', 0.4);
  }
}
// for the rules tests
export const _rules = { spawn, tryMove, tryRotate, hardDrop, lock, doHold, twistOf };
