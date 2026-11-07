import * as THREE from '/games/vendor/three/three.module.min.js';

/*
 * Turf Kings 3D: arcade five-a-side football on a floodlit rooftop cage pitch.
 *
 * The rules, AI and scoring are one small simulation (phases: kickoff, play,
 * goal, foul, halftime, fulltime, penalties) that runs in flat pitch units.
 * Everything you see is drawn from that state with three.js: a broadcast
 * camera that follows the ball, turf, cage boards and mesh, goals with nets
 * that ripple, floodlight towers, a terrace with a crowd and a night city
 * around the roof. Controls are tap and swipe on a phone (drag to run, tap a
 * team-mate to pass, swipe to shoot, tap or swipe to defend) and keyboard and
 * mouse on a desktop. Everything is original and generated in code.
 *
 * World mapping: pitch (x, y, z) is three.js (X, Y = z, Z = y).
 */
const Arcade = window.Arcade;

/* ------------------------------------------------------------------ constants */
const HL = 500, HW = 280;            // half length, half width of the playing area (world units)
const GH = 70, GOAL_H = 56, GD = 38; // goal half mouth, crossbar height, net depth
const PR = 13, BR = 6.5;             // player and ball radius
const GRAV = 900, ROOF = 168, CORNER = 46;
const FR_C = 58, FR_K = 0.82;        // rolling friction: dv/dt = -(C + K v)
const PI = Math.PI, TAU = PI * 2;
const hyp = Math.hypot, abs = Math.abs;
const F_MONO = '"JetBrains Mono", ui-monospace, monospace';
const F_UI = 'Inter, system-ui, sans-serif';
const F_DISP = 'Fraunces, "Times New Roman", serif';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sgn = (v) => (v < 0 ? -1 : 1);
const rnd = Math.random;
const pick = (a) => a[(rnd() * a.length) | 0];
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const colDist = (a, b) => { const x = hex2rgb(a), y = hex2rgb(b); return hyp(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const rrPath = (g, x, y, w, h, r, keep) => {
  r = Math.min(r, w / 2, h / 2);
  if (!keep) g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
};

/* ------------------------------------------------------------------ the league (all invented) */
/* ------------------------------------------------------------------ the league (all invented) */
const TEAMS = [
  { name: 'Bandra Blazers', short: 'Blazers', abbr: 'BLZ', c1: '#ff7a1a', c2: '#fff1d6', shorts: '#1c1a1f', sock: '#ff7a1a',
    alt: { c1: '#f6f1e7', c2: '#ff7a1a', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['A. Dastur', 'K. Menon', 'R. Sethi', 'V. Kamat', 'I. Bhosale'] },
  { name: 'Salt Lake Strikers', short: 'Strikers', abbr: 'SLS', c1: '#2f6bff', c2: '#ffffff', shorts: '#14327a', sock: '#2f6bff',
    alt: { c1: '#f6f1e7', c2: '#2f6bff', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['S. Haldar', 'T. Mondal', 'P. Sarkar', 'D. Bagchi', 'N. Lahiri'] },
  { name: 'Koramangala Kites', short: 'Kites', abbr: 'KOR', c1: '#1fb36b', c2: '#ffe14a', shorts: '#0e5a38', sock: '#ffe14a',
    alt: { c1: '#f6f1e7', c2: '#1fb36b', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['M. Gowda', 'H. Shetty', 'C. Rangan', 'B. Nayak', 'J. Urs'] },
  { name: 'Powai Panthers', short: 'Panthers', abbr: 'POW', c1: '#7b3fe4', c2: '#e9dcff', shorts: '#26134d', sock: '#7b3fe4',
    alt: { c1: '#f6f1e7', c2: '#7b3fe4', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['F. Joglekar', 'Y. Parab', 'O. Gaikwad', 'L. Tendle', 'E. Salvi'] },
  { name: 'Marina Mariners', short: 'Mariners', abbr: 'MAR', c1: '#12b5c6', c2: '#ffffff', shorts: '#0b4a55', sock: '#ffffff',
    alt: { c1: '#f6f1e7', c2: '#12b5c6', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['G. Pillai', 'W. Varkey', 'Z. Nambiar', 'U. Cheriyan', 'X. Kurup'] },
  { name: 'Hauz Khas Hawks', short: 'Hawks', abbr: 'HKH', c1: '#e23a43', c2: '#1b1b1f', shorts: '#1b1b1f', sock: '#e23a43',
    alt: { c1: '#f6f1e7', c2: '#e23a43', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['B. Khanna', 'L. Anand', 'H. Bakshi', 'P. Suri', 'Q. Dhillon'] },
  { name: 'Park Street Pumas', short: 'Pumas', abbr: 'PSP', c1: '#f4c21d', c2: '#2b2b2b', shorts: '#2b2b2b', sock: '#f4c21d',
    alt: { c1: '#2b2b2b', c2: '#f4c21d', shorts: '#2b2b2b', sock: '#2b2b2b' }, names: ['O. Ghosh', 'R. Dutta', 'E. Sen', 'M. Biswas', 'C. Roy'] },
  { name: 'Charminar Chargers', short: 'Chargers', abbr: 'CHM', c1: '#9c2347', c2: '#ffd8e2', shorts: '#4d1022', sock: '#9c2347',
    alt: { c1: '#f6f1e7', c2: '#9c2347', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['D. Reddy', 'V. Naidu', 'K. Goud', 'S. Rao', 'A. Yadav'] },
];
const ROLES = ['GK', 'DEF', 'WL', 'WR', 'ATT'];
const NUMS = [1, 4, 7, 11, 9];
const FORM = { GK: [-0.93, 0], DEF: [-0.5, 0], WL: [-0.1, -0.5], WR: [-0.1, 0.5], ATT: [0.28, 0] };
const SKINS = ['#f0c8a0', '#d9a073', '#b9784b', '#8d5530', '#6b3d22'];
const HAIRS = ['#1a1410', '#2b1c12', '#3d2a1a', '#0e0e10', '#4a3322'];
const STAGES = ['Quarter-final', 'Semi-final', 'Final'];
const GK_COLS = ['#c8ff3a', '#ff5fa8', '#8ae6ff', '#f4f4f4', '#ffb15e'];

/* ------------------------------------------------------------------ module state */
let arc = null;
let S = null;          // current match (or attract-mode demo)
let CUP = null;        // cup run
let lastRenderT = 0;
const TMP = { x: 0, y: 0 };
const AA = { x: 0, y: 0 };
const G0 = { x: 0, y: 0 }, G1 = { x: 0, y: 0 }, PJ = { x: 0, y: 0 }, SW = { x: 0, y: 0 };
// The camera looks along (lx, ly) in pitch units; (rx, ry) is screen right. Portrait
// phones look down the pitch from behind the attack; wide screens look across it.
const V = { portrait: false, f: 1, lx: 0, ly: -1, rx: 1, ry: 0 };
const CAM = { snap: true, tx: 0, ty: 0, zm: 1, pen: false };
let renderer = null, scene = null, camera = null, NOGL = false, LOST = false;

const uOf = (x, y) => x * V.rx + y * V.ry;
const vOf = (x, y) => -(x * V.lx + y * V.ly);
function uvToWorld(du, dv, out) { out.x = V.rx * du - V.lx * dv; out.y = V.ry * du - V.ly * dv; }
function setLook(portrait, f) {
  V.portrait = portrait; V.f = f;
  if (portrait) { V.lx = f; V.ly = 0; } else { V.lx = 0; V.ly = -f; }
  V.rx = -V.ly; V.ry = V.lx;
}

/* ------------------------------------------------------------------ audio helpers (silent in attract mode) */
const snd = {
  kick(p) { if (S.demo) return; arc.sfx.tone(150 + 70 * p, 0.09, { type: 'triangle', slide: 70, vol: 0.2 + 0.14 * p }); arc.sfx.noise(0.05, { freq: 2200, vol: 0.1 + 0.1 * p }); },
  pass() { if (S.demo) return; arc.sfx.tone(210, 0.07, { type: 'triangle', slide: 120, vol: 0.14 }); arc.sfx.noise(0.04, { freq: 1500, vol: 0.07 }); },
  wall(sp) { if (S.demo || S.sfxWall > 0 || sp < 110) return; S.sfxWall = 0.07; arc.sfx.noise(0.07, { freq: 900, filter: 'bandpass', vol: clamp(sp / 1400, 0.04, 0.2) }); arc.sfx.tone(260, 0.05, { type: 'square', slide: 140, vol: clamp(sp / 4000, 0.02, 0.06) }); },
  post() { if (S.demo) return; arc.sfx.tone(880, 0.5, { type: 'triangle', slide: 700, vol: 0.2 }); arc.sfx.tone(1320, 0.3, { type: 'sine', vol: 0.08 }); },
  net() { if (S.demo) return; arc.sfx.noise(0.5, { freq: 700, vol: 0.2 }); },
  whistle(long) { if (S.demo) return; const d = long ? 0.8 : 0.3; arc.sfx.tone(2250, d, { type: 'sine', vol: 0.16 }); arc.sfx.tone(2330, d, { type: 'sine', vol: 0.1, delay: 0.02 }); },
  roar(big) { if (S.demo) return; arc.sfx.noise(big ? 2.6 : 1.2, { freq: 800, filter: 'bandpass', vol: big ? 0.42 : 0.2 }); arc.sfx.noise(big ? 2 : 0.9, { freq: 420, vol: big ? 0.3 : 0.12 }); if (big) arc.sfx.tone(440, 0.9, { type: 'sawtooth', slide: 520, vol: 0.05 }); },
  ooh() { if (S.demo) return; arc.sfx.noise(0.8, { freq: 600, filter: 'bandpass', vol: 0.18 }); arc.sfx.tone(300, 0.6, { type: 'sine', slide: 520, vol: 0.05 }); },
  save() { if (S.demo) return; arc.sfx.noise(0.12, { freq: 500, vol: 0.2 }); arc.sfx.tone(180, 0.1, { type: 'square', slide: 90, vol: 0.1 }); },
  tackle() { if (S.demo) return; arc.sfx.noise(0.08, { freq: 700, vol: 0.18 }); arc.sfx.tone(120, 0.08, { type: 'triangle', vol: 0.14 }); },
  bounce(i) { if (S.demo) return; arc.sfx.tone(130, 0.05, { type: 'sine', slide: 90, vol: clamp(i / 1600, 0.03, 0.12) }); },
  beep(hi) { if (S.demo) return; arc.sfx.tone(hi ? 880 : 520, 0.12, { type: 'square', vol: 0.1 }); },
};

/* ------------------------------------------------------------------ commentary (original lines) */
const LINES = {
  shot: ['Off it goes!', 'He lets fly!', 'Strike from distance!', 'Hit it first time!', 'Bold effort!'],
  save: ['Smart stop!', 'The keeper stands tall!', 'What a save!', 'Hands like a vice!', 'Denied!'],
  post: ['Off the woodwork!', 'Clang! Inches away!', 'The post shakes!'],
  wall: ['Cage ricochet!', 'Off the boards!', 'Wall pass of sorts!'],
  tackle: ['Cleanly won!', 'Great timing!', 'Ball nicked away!', 'Strong challenge!'],
  slide: ['Slides in and wins it!', 'Clean slide!'],
  goal: ['Clinical finish!', 'The net bulges!', 'Pigeons scatter on the roof!', 'Scenes under the floodlights!', 'Pure class!'],
  og: ['Oh no, that went in off him!', 'An own goal, cruel luck!'],
  kickoff: ['Floodlights on, ball rolling.', 'We are underway!', 'Kick-off on the rooftop!'],
  final: ['Thirty seconds left. Everything on the line!', 'Last half minute, the cage is roaring!'],
  out: ['Wide of the mark.', 'Over the bar!', 'Not this time.'],
};
function say(text, life) {
  if (!S || S.demo) return;
  S.say = { text, age: 0, life: life || 2.4 };
}
function sayRare(kind, force) {
  if (!S || S.demo) return;
  if (S.sayCD > 0 && !force) return;
  S.sayCD = 2.6;
  say(pick(LINES[kind]));
}

/* ------------------------------------------------------------------ match construction */
function pickKits(th, ta) {
  const k0 = { c1: th.c1, c2: th.c2, shorts: th.shorts, sock: th.sock };
  let k1 = { c1: ta.c1, c2: ta.c2, shorts: ta.shorts, sock: ta.sock };
  if (colDist(k0.c1, k1.c1) < 135) k1 = { c1: ta.alt.c1, c2: ta.alt.c2, shorts: ta.alt.shorts, sock: ta.alt.sock };
  if (colDist(k0.c1, k1.c1) < 135) k1 = { c1: '#f6f1e7', c2: '#222', shorts: '#222', sock: '#f6f1e7' };
  [k0, k1].forEach((k, i) => {
    const other = i === 0 ? k1 : k0;
    let best = GK_COLS[0], bs = -1;
    GK_COLS.forEach((c) => { const s = Math.min(colDist(c, k0.c1), colDist(c, k1.c1), colDist(c, '#2f9a55') * 1.2); if (s > bs && !(i === 1 && c === k0.gk)) { bs = s; best = c; } });
    k.gk = best; k.gkTrim = '#1b1b22'; void other;
  });
  return [k0, k1];
}

function mkPlayer(team, idx, name) {
  return {
    team, idx, i: team * 5 + idx, role: ROLES[idx], num: NUMS[idx], name,
    x: 0, y: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, fx: team ? -1 : 1, fy: 0, k: 0,
    sprint: false, stam: 1, tired: false, phase: rnd() * 6, kx: 0, ky: 0,
    slideT: 0, slideCD: 0, slideDX: 1, slideDY: 0, slideTouched: false, slideHit: false,
    tackleCD: 0, tackleAnim: 0, stunT: 0, noBallT: 0, kickT: 0, cheer: 0, hold: 0,
    aiT: rnd() * 0.3, rx: 0, ry: 0, rT: 0, mark: null, holdT: 0,
    diving: false, diveE: 0, diveY0: 0, diveY1: 0, diveRec: 0, diveDelay: -1, diveTo: 0, diveDir: 0,
    skin: SKINS[(idx * 2 + team * 3) % 5], hair: HAIRS[(idx + team) % 5], lunge: 0,
  };
}

function newMatch(cfg) {
  const th = TEAMS[cfg.home], ta = TEAMS[cfg.away];
  S = {
    cfg, demo: !!cfg.demo, teams: [th, ta], kits: pickKits(th, ta),
    dir: [1, -1], half: 1, phase: 'kickoff', phaseT: 0, kickTeam: 0,
    matchT: 0, T: cfg.minutes * 60, score: [0, 0],
    skill: [0.64, cfg.skill], kskill: [0.62, cfg.skill],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null, lastTeam: 0, spin: 0, tx: new Float32Array(8), ty: new Float32Array(8), tz: new Float32Array(8), tn: 0 },
    players: [], ents: [], ctrl: 1, switchLock: 0, charge: 0, charging: false,
    stats: { shots: [0, 0], sot: [0, 0], poss: [0, 0.001], fouls: [0, 0], saves: [0, 0] },
    scorers: [], nets: [{ amp: 0, t: 0, y: 0, z: 0 }, { amp: 0, t: 0, y: 0, z: 0 }],
    t: 0, slow: 1, say: null, sayCD: 0, sfxWall: 0, restrict: null, foul: null, goalP: null, goalTeam: -1,
    chase: [[], []], infoT: 0, markT: 0, passTarget: null, passT: 0,
    last30: false, excite: 0, crowdT: 0, flash: 0, fade: 0, htStage: 0, pen: null,
    nearWall: 0, ballEnt: { ball: true, k: 0 }, kickOffT: 0, lastKick: null,
    parts: [], matchNo: cfg.matchNo || 1, label: cfg.label || '',
  };
  for (let t = 0; t < 2; t++) for (let i = 0; i < 5; i++) { const p = mkPlayer(t, i, TEAMS[t ? cfg.away : cfg.home].names[i]); S.players.push(p); S.ents.push(p); }
  S.ents.push(S.ballEnt);
  S.ctrl = 4; // the home striker starts as the controlled player
  placeKickoff(true);
  CAM.snap = true;
  syncMatch3D();
}

const attackX = (team) => S.dir[team] * HL;

function placeKickoff(snap) {
  const b = S.ball;
  b.x = 0; b.y = 0; b.z = 0; b.vx = b.vy = b.vz = 0; b.owner = null; b.tn = 0;
  S.players.forEach((p) => {
    const d = S.dir[p.team], f = FORM[p.role];
    let rx = f[0], ry = f[1];
    if (p.role === 'ATT') rx = S.kickTeam === p.team ? -0.04 : -0.2;
    if ((p.role === 'WL' || p.role === 'WR') && S.kickTeam !== p.team) rx = -0.16;
    p.kx = d * rx * HL; p.ky = ry * HW * 0.9;
    if (p.role === 'ATT' && S.kickTeam === p.team) { p.kx = -d * 18; p.ky = 0; }
    if (snap) { p.x = p.kx; p.y = p.ky; p.vx = p.vy = 0; p.fx = d; p.fy = 0; }
    p.slideT = 0; p.stunT = 0; p.diving = false; p.holdT = 0; p.cheer = 0; p.noBallT = 0; p.dvx = p.dvy = 0;
  });
  S.restrict = null; S.charging = false; S.charge = 0;
}

function beginPlay() {
  S.phase = 'play'; S.phaseT = 0;
  const kicker = S.players.find((p) => p.team === S.kickTeam && p.role === 'ATT');
  const d = S.dir[S.kickTeam];
  kicker.x = -d * (PR + BR + 2); kicker.y = 0; kicker.fx = d; kicker.fy = 0; kicker.vx = kicker.vy = 0;
  S.ball.x = 0; S.ball.y = 0;
  takeBall(kicker);
  kicker.hold = -0.35;
  if (S.kickTeam === 0 && !S.demo) S.ctrl = kicker.i;
  snd.whistle(false);
  if (S.matchT < 1) sayRare('kickoff', true);
}

/* ------------------------------------------------------------------ ball ownership and kicks */
function takeBall(p, hold) {
  const b = S.ball;
  b.owner = p; b.lastTouch = p; b.lastTeam = p.team; b.vz = 0; b.z = p.role === 'GK' ? 15 : 0;
  p.hold = 0;
  if (hold) p.holdT = 0.9 + rnd() * 0.7;
  if (S.passTarget && S.passTarget.team !== p.team) S.passTarget = null;
  if (S.passTarget === p) S.passTarget = null;
  if (S.restrict && p.team !== S.restrict.team) S.restrict = null;
}
function releaseBall(p) {
  const b = S.ball;
  if (b.owner !== p) return;
  b.owner = null; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
}
function speedFor(d, vEnd) {
  const c = FR_C / FR_K; let t = d / 420, v = vEnd;
  for (let i = 0; i < 4; i++) { v = vEnd + FR_K * (d + c * t); t = Math.log((v + c) / (vEnd + c)) / FR_K; }
  return v;
}
function kickBall(p, dx, dy, speed, vz, kind) {
  const b = S.ball; const m = hyp(dx, dy) || 1; dx /= m; dy /= m;
  if (b.owner === p) {
    b.owner = null;
    b.x = p.x + dx * (PR + BR + 1.5); b.y = p.y + dy * (PR + BR + 1.5);
  }
  b.vx = dx * speed; b.vy = dy * speed; b.vz = vz; if (vz > 0) b.z = Math.max(b.z, 1.5);
  b.lastTouch = p; b.lastTeam = p.team; p.noBallT = 0.3; p.kickT = 0.22; p.fx = dx; p.fy = dy;
  S.lastKick = { p, kind, t: S.t };
  if (S.restrict && p.team !== S.restrict.team) S.restrict = null;
  ballConfine();
  const pw = clamp(speed / 900, 0, 1);
  for (let i = 0; i < 3; i++) spawn(0, b.x, b.y, 2, (rnd() - 0.5) * 60 - dx * 30, (rnd() - 0.5) * 60 - dy * 30, 20 + rnd() * 20, 0.35, '#e8efdc', 3);
  if (kind === 'shot') snd.kick(pw); else snd.pass();
  if (kind === 'shot') S.excite = Math.min(1, S.excite + 0.5);
}
function ballConfine() {
  const b = S.ball;
  if (abs(b.x) > HL - BR && abs(b.y) < GH && b.z < GOAL_H) return;
  confine(b, BR);
}

/* ------------------------------------------------------------------ geometry helpers */
function confine(o, r) {
  const ix = HL - r, iy = HW - r;
  if (o.x > ix) o.x = ix; else if (o.x < -ix) o.x = -ix;
  if (o.y > iy) o.y = iy; else if (o.y < -iy) o.y = -iy;
  const cr = Math.max(2, CORNER - r), cx = ix - cr, cy = iy - cr;
  const dx = abs(o.x) - cx, dy = abs(o.y) - cy;
  if (dx > 0 && dy > 0) {
    const d = hyp(dx, dy);
    if (d > cr) { const k = cr / d; o.x = sgn(o.x) * (cx + dx * k); o.y = sgn(o.y) * (cy + dy * k); }
  }
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return Math.sqrt(cx * cx + cy * cy);
}
function laneMin(team, ax, ay, bx, by, withGK) {
  let m = 1e9;
  for (let i = 0; i < 10; i++) {
    const o = S.players[i]; if (o.team === team) continue;
    if (o.role === 'GK' && !withGK) continue;
    const d = segDist(o.x, o.y, ax, ay, bx, by); if (d < m) m = d;
  }
  return m;
}
function nearestOpp(p, skipGK) {
  let best = null, bd = 1e9;
  for (let i = 0; i < 10; i++) {
    const o = S.players[i]; if (o.team === p.team || (skipGK && o.role === 'GK')) continue;
    const d = hyp(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; }
  }
  S.nearD = bd; return best;
}

/* ------------------------------------------------------------------ particles */
const PT = [];
for (let i = 0; i < 260; i++) PT.push({ a: false, kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, col: '#fff', size: 3, rot: 0, vr: 0 });
function spawn(kind, x, y, z, vx, vy, vz, life, col, size) {
  for (let i = 0; i < PT.length; i++) {
    const q = PT[i]; if (q.a) continue;
    q.a = true; q.kind = kind; q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.life = life; q.max = life; q.col = col; q.size = size; q.rot = rnd() * TAU; q.vr = (rnd() - 0.5) * 12;
    return;
  }
}
function confetti(x, y, team) {
  if (arc.reducedMotion) return;
  const cols = [S.kits[team].c1, S.kits[team].c2, '#ffb736', '#ff6940', '#fbf5ec'];
  for (let i = 0; i < 90; i++) spawn(1, x + (rnd() - 0.5) * 160, y + (rnd() - 0.5) * 120, 90 + rnd() * 90, (rnd() - 0.5) * 140, (rnd() - 0.5) * 140, 40 + rnd() * 120, 2.4 + rnd() * 1.6, cols[(rnd() * cols.length) | 0], 3 + rnd() * 3);
}
function updateParticles(dt) {
  for (let i = 0; i < PT.length; i++) {
    const q = PT[i]; if (!q.a) continue;
    q.life -= dt; if (q.life <= 0) { q.a = false; continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.rot += q.vr * dt;
    if (q.kind === 1) { q.vz -= 160 * dt; q.vz = Math.max(q.vz, -60); q.vx *= 0.99; q.vy *= 0.99; if (q.z < 0) { q.z = 0; q.vz = 0; q.vx *= 0.9; q.vy *= 0.9; q.vr *= 0.8; } }
    else { q.vx *= 0.94; q.vy *= 0.94; q.vz -= 120 * dt; if (q.z < 0) { q.z = 0; q.vz = 0; } }
  }
}

/* ------------------------------------------------------------------ the ball */
function updateBall(dt) {
  const b = S.ball;
  if (b.owner) { carry(dt); return; }
  const sp0 = hyp(b.vx, b.vy), n = sp0 * dt > 9 ? Math.min(6, Math.ceil(sp0 * dt / 9)) : 1, h = dt / n;
  for (let k = 0; k < n; k++) ballStep(h);
  if (hyp(b.vx, b.vy) > 320 || b.z > 8) { // trail
    b.tn = (b.tn + 1) % 8; b.tx[b.tn] = b.x; b.ty[b.tn] = b.y; b.tz[b.tn] = b.z;
  }
  b.spin += hyp(b.vx, b.vy) * dt / BR;
}
function carry(dt) {
  const b = S.ball, p = b.owner;
  if (p.stunT > 0 || p.slideT > 0 || p.diving) { releaseBall(p); return; }
  if (p.role === 'GK') { b.x = p.x + p.fx * 8; b.y = p.y + p.fy * 8; b.z = 15; b.vx = b.vy = b.vz = 0; return; }
  const spd = hyp(p.vx, p.vy);
  const d = PR + BR - 1 + (p.sprint ? 5 : 1.5) + Math.sin(p.phase * 2) * 3.2 * Math.min(1, spd / 120);
  const tx = p.x + p.fx * d, ty = p.y + p.fy * d;
  const k = 1 - Math.exp(-26 * dt);
  b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.z = 0; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
  confine(b, BR);
  b.spin += spd * dt / BR;
}
function netHit(side, y, z, sp) {
  const n = S.nets[side > 0 ? 1 : 0];
  n.amp = Math.min(1, 0.35 + sp / 700); n.t = 0; n.y = y; n.z = z;
  snd.net();
}
function ballStep(h) {
  const b = S.ball;
  b.vz -= GRAV * h;
  b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
  if (b.z <= 0) {
    b.z = 0;
    if (b.vz < -70) { const imp = -b.vz; b.vz = imp * 0.58; b.vx *= 0.95; b.vy *= 0.95; if (imp > 150) snd.bounce(imp); if (imp > 260) spawn(0, b.x, b.y, 0, 0, 0, 14, 0.3, '#dfe9d4', 3); }
    else {
      b.vz = 0;
      const sp = hyp(b.vx, b.vy);
      if (sp > 0) { const ns = Math.max(0, sp - (FR_C + FR_K * sp) * h), k = ns / sp; b.vx *= k; b.vy *= k; }
    }
  } else { const k = Math.exp(-0.16 * h); b.vx *= k; b.vy *= k; }
  if (b.z > ROOF - BR) { b.z = ROOF - BR; if (b.vz > 0) b.vz = -b.vz * 0.4; }
  // posts
  for (let a = -1; a <= 1; a += 2) for (let c = -1; c <= 1; c += 2) {
    if (b.z > GOAL_H + 2) continue;
    const px = a * HL, py = c * GH, dx = b.x - px, dy = b.y - py, d = hyp(dx, dy), rr = BR + 4;
    if (d < rr && d > 0.001) {
      const nx = dx / d, ny = dy / d; b.x = px + nx * rr; b.y = py + ny * rr;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; b.vx *= 0.92; b.vy *= 0.92; if (-vn > 130) postHit(); }
    }
  }
  // crossbar
  const ax = abs(b.x);
  if (ax > HL - BR && ax < HL + BR && abs(b.y) < GH && b.z > GOAL_H - BR && b.z < GOAL_H + BR + 2) {
    const rising = b.vz > 0;
    if (abs(b.vz) > 40 || abs(b.vx) > 60) { b.z = rising ? GOAL_H - BR - 0.5 : GOAL_H + BR + 0.5; b.vz = (rising ? -1 : 1) * abs(b.vz) * 0.5; b.vx *= 0.82; postHit(); }
  }
  // end walls and goal
  if (ax > HL - BR) {
    const mouth = abs(b.y) < GH - 1 && b.z < GOAL_H - 2;
    const sx = sgn(b.x);
    if (ax > HL) {
      // inside the alcove
      if (b.y > GH - BR) { b.y = GH - BR; if (b.vy > 0) b.vy *= -0.2; } else if (b.y < -(GH - BR)) { b.y = -(GH - BR); if (b.vy < 0) b.vy *= -0.2; }
      if (b.z > GOAL_H - BR) { b.z = GOAL_H - BR; if (b.vz > 0) b.vz *= -0.2; }
      if (ax > HL + GD - BR) { const spx = abs(b.vx); b.x = sx * (HL + GD - BR); if (b.vx * sx > 0) { b.vx *= -0.14; b.vy *= 0.5; netHit(sx, b.y, b.z, spx); } }
      goalCheck(sx, mouth);
    } else if (!mouth) {
      b.x = sx * (HL - BR);
      if (b.vx * sx > 0) { wallBounce(abs(b.vx)); b.vx *= -0.72; b.vy *= 0.96; }
    }
  }
  if (ax <= HL) {
    if (b.y > HW - BR) { b.y = HW - BR; if (b.vy > 0) { wallBounce(b.vy); b.vy *= -0.76; b.vx *= 0.96; } }
    else if (b.y < -HW + BR) { b.y = -HW + BR; if (b.vy < 0) { wallBounce(-b.vy); b.vy *= -0.76; b.vx *= 0.96; } }
    // rounded cage corners
    const ix = HL - BR, iy = HW - BR, cr = CORNER - BR, cx = ix - cr, cy = iy - cr;
    const dx = ax - cx, dy = abs(b.y) - cy;
    if (dx > 0 && dy > 0) {
      const d = hyp(dx, dy);
      if (d > cr) {
        const nx = sgn(b.x) * dx / d, ny = sgn(b.y) * dy / d, k = cr / d;
        b.x = sgn(b.x) * (cx + dx * k); b.y = sgn(b.y) * (cy + dy * k);
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { wallBounce(vn); b.vx -= 1.74 * vn * nx; b.vy -= 1.74 * vn * ny; }
      }
    }
  }
}
function wallBounce(sp) {
  snd.wall(sp);
  if (sp > 380 && S.lastKick && S.t - S.lastKick.t < 1.6 && S.sayCD <= 0 && rnd() < 0.3) sayRare('wall');
}
function postHit() {
  snd.post(); S.excite = 1;
  if (S.phase === 'penalties') return;
  sayRare('post', true);
  const b = S.ball; for (let i = 0; i < 4; i++) spawn(2, b.x, b.y, b.z, (rnd() - 0.5) * 120, (rnd() - 0.5) * 120, 40 + rnd() * 50, 0.4, '#ffe9a8', 2);
}
function goalCheck(sx, mouth) {
  const b = S.ball;
  if (S.phase === 'penalties') { penBallInGoal(); return; }
  if (S.phase !== 'play') return;
  if (abs(b.y) < GH && b.z < GOAL_H) scoreGoal(sx);
  void mouth;
}

/* ------------------------------------------------------------------ goal, fouls, phases */
function matchClock(t) {
  const m = (t === undefined ? S.matchT : t) / S.T * 20;
  const mm = Math.floor(m), ss = Math.floor((m - mm) * 60);
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
}
function scoreGoal(sx) {
  const b = S.ball;
  const team = S.dir[0] === sx ? 0 : 1;
  let scorer = b.lastTouch, og = false;
  if (!scorer || scorer.team !== team) { og = !!scorer; if (!scorer) scorer = S.players.find((p) => p.team === team && p.role === 'ATT'); }
  S.score[team]++;
  S.scorers.push({ team, name: scorer.name, clock: matchClock(), og, num: scorer.num });
  S.phase = 'goal'; S.phaseT = 0; S.goalTeam = team; S.goalP = { x: scorer.x, y: scorer.y }; S.charging = false; S.charge = 0;
  S.players.forEach((p) => { if (p.team === team) p.cheer = 2.8; });
  S.excite = 1; S.flash = arc.reducedMotion ? 0 : 1;
  confetti(scorer.x, scorer.y, team);
  snd.roar(true); snd.whistle(false);
  if (!S.demo) {
    arc.toast('GOAL!', scorer.name + (og ? ' (og)' : '') + '  ' + S.teams[team].abbr + '  ' + matchClock(), 2800);
    say(og ? pick(LINES.og) : pick(LINES.goal), 3);
  }
  S.nearWall = 0;
}
function startHalftime() {
  S.phase = 'halftime'; S.phaseT = 0; S.htStage = 0; S.charging = false;
  S.players.forEach((p) => { p.dvx = p.dvy = 0; });
  snd.whistle(true);
  if (!S.demo) { arc.toast('Half time', S.teams[0].abbr + ' ' + S.score[0] + ' - ' + S.score[1] + ' ' + S.teams[1].abbr, 2400); say('Teams swap ends for the second half.', 3); }
}
function startFulltime() {
  S.phase = 'fulltime'; S.phaseT = 0; S.charging = false;
  S.players.forEach((p) => { p.dvx = p.dvy = 0; });
  snd.whistle(true); snd.roar(false);
  if (!S.demo) arc.toast('Full time', S.teams[0].abbr + ' ' + S.score[0] + ' - ' + S.score[1] + ' ' + S.teams[1].abbr, 2400);
}
function callFoul(fouler, victim) {
  S.phase = 'foul'; S.phaseT = 0;
  S.foul = { x: clamp(victim.x, -HL + 45, HL - 45), y: clamp(victim.y, -HW + 40, HW - 40), off: fouler.team, victim };
  S.stats.fouls[fouler.team]++;
  S.charging = false;
  const b = S.ball; b.owner = null; b.vx = b.vy = b.vz = 0; b.z = 0; b.x = S.foul.x; b.y = S.foul.y;
  snd.whistle(false);
  if (!S.demo) { arc.toast('Foul!', 'Free kick ' + S.teams[victim.team].short, 1800); say('Clumsy from behind. Free kick.', 2.6); }
}

/* ------------------------------------------------------------------ movement and physics of players */
function baseSpeed(p) {
  if (p.role === 'GK') return 176;
  let s = 150;
  if (p.team === 1 || S.demo || p.i !== S.ctrl) s *= 0.86 + 0.2 * S.skill[p.team];
  if (S.ball.owner === p) s *= 0.94;
  return s;
}
function moveTo(p, tx, ty, spr) {
  const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy);
  p.sprint = !!(spr && p.stam > 0.08 && !p.tired);
  if (d < 3) { p.dvx = 0; p.dvy = 0; p.sprint = false; return; }
  const sp = baseSpeed(p) * (p.sprint ? 1.34 : 1) * Math.min(1, d / 26 + 0.05);
  p.dvx = dx / d * sp; p.dvy = dy / d * sp;
}
function integratePlayers(dt) {
  for (let i = 0; i < 10; i++) {
    const p = S.players[i];
    if (p.tackleCD > 0) p.tackleCD -= dt;
    if (p.slideCD > 0) p.slideCD -= dt;
    if (p.noBallT > 0) p.noBallT -= dt;
    if (p.kickT > 0) p.kickT -= dt;
    if (p.tackleAnim > 0) p.tackleAnim -= dt;
    if (p.cheer > 0) p.cheer -= dt;
    if (p.diveRec > 0) p.diveRec -= dt;
    if (p.lunge > 0) p.lunge -= dt;
    if (p.diving) {
      p.diveE += dt;
      const t = Math.min(1, p.diveE / 0.3), e = 1 - (1 - t) * (1 - t);
      const ny = p.diveY0 + (p.diveY1 - p.diveY0) * e;
      p.vy = (ny - p.y) / Math.max(dt, 0.001); p.vx = 0; p.y = ny;
      if (p.diveE > 0.85) { p.diving = false; p.diveRec = 0.45; p.vy = 0; }
      continue;
    }
    if (p.slideT > 0) {
      p.slideT -= dt;
      const k = Math.max(0, p.slideT / 0.5);
      p.vx = p.slideDX * 330 * k; p.vy = p.slideDY * 330 * k;
      if (p.slideT <= 0) { p.slideCD = 0.9; p.stunT = 0.25; p.vx = p.vy = 0; }
    } else if (p.stunT > 0) {
      p.stunT -= dt; p.vx *= 0.88; p.vy *= 0.88;
    } else {
      const a = (p.lunge > 0 ? 3200 : 1500) * dt;
      p.vx = approach(p.vx, p.dvx, a); p.vy = approach(p.vy, p.dvy, a);
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    confine(p, PR);
    const sp = hyp(p.vx, p.vy);
    if (sp > 22 && p.slideT <= 0 && p.stunT <= 0 && p.kickT <= 0.1) {
      const k = 1 - Math.exp(-(p.i === S.ctrl ? 18 : 12) * dt);
      p.fx += (p.vx / sp - p.fx) * k; p.fy += (p.vy / sp - p.fy) * k;
      const m = hyp(p.fx, p.fy) || 1; p.fx /= m; p.fy /= m;
    }
    p.phase += sp * dt * 0.08;
    // stamina
    if (p.sprint && sp > 60) { p.stam -= (p.i === S.ctrl ? 0.34 : 0.22) * dt; if (p.stam <= 0.02) { p.stam = 0.02; p.tired = true; } }
    else { p.stam = Math.min(1, p.stam + (sp < 30 ? 0.3 : 0.17) * dt); if (p.tired && p.stam > 0.3) p.tired = false; }
  }
  for (let i = 0; i < 10; i++) {
    const a = S.players[i];
    for (let j = i + 1; j < 10; j++) {
      const c = S.players[j];
      if (a.diving || c.diving) continue;
      const dx = c.x - a.x, dy = c.y - a.y, min = PR * 1.75;
      if (dx > min || dx < -min || dy > min || dy < -min) continue;
      const d = hyp(dx, dy);
      if (d < min && d > 0.01) {
        const push = (min - d) * 0.5, nx = dx / d, ny = dy / d;
        const wa = a.slideT > 0 ? 0.2 : 1, wc = c.slideT > 0 ? 0.2 : 1;
        a.x -= nx * push * wa; a.y -= ny * push * wa; c.x += nx * push * wc; c.y += ny * push * wc;
      }
    }
  }
}

/* ------------------------------------------------------------------ interactions: pick up, saves, tackles */
function tryPickup() {
  const b = S.ball;
  if (b.owner || b.z > 26 || S.phase !== 'play') return;
  let best = null, bd = 1e9;
  for (let i = 0; i < 10; i++) {
    const p = S.players[i];
    if (p.stunT > 0 || p.slideT > 0 || p.noBallT > 0 || p.diving) continue;
    if (S.restrict && p.team === S.restrict.team) continue;
    const d = hyp(b.x - p.x, b.y - p.y), reach = PR + BR + (p.role === 'GK' ? 7 : 2);
    if (d < reach && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const rel = hyp(b.vx - best.vx, b.vy - best.vy);
  if (best.role === 'GK') { if (rel < 300 && b.z < 36) takeBall(best, true); return; }
  if (rel > 640) { // too hot to control: it cannons off
    const nx = (b.x - best.x) / (bd || 1), ny = (b.y - best.y) / (bd || 1), vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny; b.vx *= 0.55; b.vy *= 0.55; }
    best.noBallT = 0.15; b.lastTouch = best; b.lastTeam = best.team; snd.tackle();
    return;
  }
  takeBall(best);
}
function keeperSaves() {
  const b = S.ball;
  if (b.owner || (S.phase !== 'play' && S.phase !== 'penalties')) return;
  for (let i = 0; i < 10; i++) {
    const g = S.players[i]; if (g.role !== 'GK' || g.noBallT > 0) continue;
    const reach = PR + BR + (g.diving ? 22 : 8);
    const d = hyp(b.x - g.x, b.y - g.y);
    if (d < reach && b.z < (g.diving ? 62 : 42)) {
      const rel = hyp(b.vx - g.vx, b.vy - g.vy), ks = S.kskill[g.team];
      const lim = 340 + 250 * ks - (b.z > 30 ? 90 : 0) - (g.diving ? 70 : 0);
      const isShot = hyp(b.vx, b.vy) > 250;
      if (S.phase === 'penalties' && S.pen) S.pen.saved = true;
      if (rel < lim) {
        takeBall(g, true); b.lastTouch = g;
        if (isShot) { S.stats.saves[g.team]++; snd.save(); if (g.team === 1) sayRare('save', true); else sayRare('save', true); }
      } else {
        const inward = S.dir[g.team];
        b.vx = -b.vx * 0.25 + inward * 120; b.vy = b.vy * 0.3 + (sgn(b.y - g.y + (rnd() - 0.5) * 8)) * (170 + rnd() * 130); b.vz = 80 + rnd() * 90;
        b.lastTouch = g; b.lastTeam = g.team; g.noBallT = 0.4;
        S.stats.saves[g.team]++; snd.save(); sayRare('save', true);
      }
      return;
    }
  }
}
function startSlide(p, dx, dy) {
  if (p.slideCD > 0 || p.slideT > 0 || p.stunT > 0) return;
  const m = hyp(dx, dy); if (m < 0.1) { dx = p.fx; dy = p.fy; } else { dx /= m; dy /= m; }
  p.slideT = 0.5; p.slideDX = dx; p.slideDY = dy; p.fx = dx; p.fy = dy; p.slideTouched = false; p.slideHit = false;
  for (let i = 0; i < 3; i++) spawn(0, p.x, p.y, 1, -dx * 40 + (rnd() - 0.5) * 50, -dy * 40 + (rnd() - 0.5) * 50, 14, 0.4, '#cfe0c0', 3);
}
function slideContacts() {
  const b = S.ball;
  for (let i = 0; i < 10; i++) {
    const p = S.players[i]; if (p.slideT <= 0) continue;
    // the ball
    const db = hyp(b.x - p.x, b.y - p.y);
    if (db < PR + BR + 9 && b.z < 22 && !p.slideTouched) {
      p.slideTouched = true;
      const own = b.owner;
      if (own && own.team !== p.team) { own.stunT = 0.5; own.noBallT = 0.6; releaseBall(own); }
      if (!own || own.team !== p.team) {
        b.owner = null; b.vx = p.slideDX * 360 + (rnd() - 0.5) * 40; b.vy = p.slideDY * 360 + (rnd() - 0.5) * 40; b.vz = 0;
        b.lastTouch = p; b.lastTeam = p.team; p.noBallT = 0.2;
        snd.tackle(); sayRare('slide', true);
        for (let k = 0; k < 4; k++) spawn(3, b.x, b.y, 1, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, 30 + rnd() * 30, 0.5, '#2a8148', 2.4);
      }
    }
    // opponents
    if (p.slideHit) continue;
    for (let j = 0; j < 10; j++) {
      const o = S.players[j]; if (o.team === p.team || o.stunT > 0 || o.role === 'GK' && o.holdT > 0) continue;
      if (hyp(o.x - p.x, o.y - p.y) < PR * 1.9) {
        p.slideHit = true;
        if (p.slideTouched) break; // clean, ball first
        const fromBehind = (p.x - o.x) * o.fx + (p.y - o.y) * o.fy < 0;
        const hadBall = b.owner === o;
        if (S.phase === 'play' && (fromBehind || !hadBall)) {
          o.stunT = 0.8; callFoul(p, o);
        } else if (hadBall) { // clean take from the front or side
          o.stunT = 0.5; o.noBallT = 0.6; releaseBall(o); b.vx = p.slideDX * 240; b.vy = p.slideDY * 240; b.lastTouch = p; b.lastTeam = p.team; snd.tackle();
        }
        break;
      }
    }
  }
}
function standTackle(p, human) {
  if (p.tackleCD > 0 || p.stunT > 0 || p.slideT > 0 || S.phase !== 'play') return;
  if (S.restrict && S.restrict.team === p.team) return;
  p.tackleCD = human ? 0.6 : 0.8 - 0.3 * S.skill[p.team] + rnd() * 0.4; p.tackleAnim = 0.25;
  const b = S.ball, o = b.owner;
  // lunge toward the ball carrier or the ball
  let tx = b.x, ty = b.y; const dm = hyp(tx - p.x, ty - p.y);
  if (dm > 1) { p.lunge = 0.14; p.vx += (tx - p.x) / dm * 90; p.vy += (ty - p.y) / dm * 90; }
  if (o && o.team !== p.team) {
    const d = hyp(o.x - p.x, o.y - p.y);
    if (d < PR * 2 + 12) {
      const front = (p.x - o.x) * o.fx + (p.y - o.y) * o.fy > 0;
      const sk = S.skill[p.team];
      let chance = human ? (front ? 0.62 : 0.5) : (0.22 + 0.42 * sk) * (front ? 1.1 : 0.7);
      if (o.sprint) chance -= 0.08;
      if (S.last30 && !human) chance += 0.05;
      if (rnd() < chance) {
        const vx = (b.x - o.x), vy = (b.y - o.y), m = hyp(vx, vy) || 1;
        o.noBallT = 0.55; o.stunT = 0.12; releaseBall(o);
        b.vx = vx / m * 120 + p.fx * 60; b.vy = vy / m * 120 + p.fy * 60; b.lastTouch = p; b.lastTeam = p.team;
        snd.tackle(); if (human || rnd() < 0.4) sayRare('tackle');
        for (let k = 0; k < 3; k++) spawn(2, b.x, b.y, 4, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, 40, 0.3, '#fff2b8', 2);
      }
    }
  }
}

/* ------------------------------------------------------------------ shooting and passing */
function shootAt(p, dx, dy, power01, assist, spread, chip) {
  const gx = attackX(p.team), sgx = sgn(gx);
  const m = hyp(dx, dy) || 1; dx /= m; dy /= m;
  if (dx * sgx > 0.12) {
    const t = (gx - p.x) / dx, yy = p.y + dy * t;
    if (abs(yy) < GH + 95) {
      const target = clamp(yy, -(GH - 11), GH - 11);
      const tx = gx - p.x, ty = target - p.y, tm = hyp(tx, ty) || 1;
      dx = lerp(dx, tx / tm, assist); dy = lerp(dy, ty / tm, assist);
      const m2 = hyp(dx, dy) || 1; dx /= m2; dy /= m2;
    }
  }
  if (spread) { const a = (rnd() - 0.5) * spread, c = Math.cos(a), s = Math.sin(a); const nx = dx * c - dy * s; dy = dx * s + dy * c; dx = nx; }
  if (chip) {
    // a lofted chip: it clears the keeper's reach and comes down under the bar
    let d = clamp(250 + 200 * power01, 220, 470);
    if (dx * sgx > 0.12) d = clamp((gx - p.x) / dx, 90, 520);
    const T = clamp(d / 470, 0.48, 1.0), vh = d / T * 1.06;
    kickBall(p, dx, dy, vh, (44 + 0.5 * GRAV * T * T) / T, 'shot');
  } else {
    const pw = 0.3 + 0.7 * power01;
    const speed = 430 + 470 * pw * 0.9 + (power01 > 0.5 ? 60 : 0);
    const vz = 20 + 125 * power01 * power01 * (0.4 + rnd() * 0.6);
    kickBall(p, dx, dy, speed, vz, 'shot');
  }
  S.stats.shots[p.team]++;
  // on target? project to the goal line
  if (dx * sgx > 0.05) {
    const t = (gx - S.ball.x) / S.ball.vx, yy = S.ball.y + S.ball.vy * t, zz = S.ball.z + S.ball.vz * t - 0.5 * GRAV * t * t;
    if (abs(yy) < GH && zz < GOAL_H) S.stats.sot[p.team]++;
  }
  sayRare('shot');
}
function bestReceiver(p, dx, dy, hasDir, lob) {
  let best = null, bs = -1e9; const dir = S.dir[p.team];
  for (let i = 0; i < 10; i++) {
    const m = S.players[i]; if (m.team !== p.team || m === p) continue;
    const vx = m.x - p.x, vy = m.y - p.y, d = hyp(vx, vy); if (d < 45) continue;
    const cos = (vx * dx + vy * dy) / d;
    if (cos < (hasDir ? 0.3 : 0.12)) continue;
    if (m.role === 'GK' && cos < 0.85) continue;
    let sc = cos * 60 - d * 0.04 + (vx * dir) * 0.02;
    if (!lob) sc += laneMin(p.team, p.x, p.y, m.x, m.y, false) > 24 ? 16 : -26;
    if (m.role === 'GK') sc -= 20;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
function passTo(p, m, lob, err) {
  const b = S.ball;
  const d0 = hyp(m.x - p.x, m.y - p.y);
  let lead = lob ? 0.55 : 0.3;
  let tx = m.x + clamp(m.vx * lead, -45, 45), ty = m.y + clamp(m.vy * lead, -45, 45);
  tx = clamp(tx, -HL + 20, HL - 20); ty = clamp(ty, -HW + 20, HW - 20);
  let dx = tx - p.x, dy = ty - p.y; const d = hyp(dx, dy) || 1;
  if (err) { const a = (rnd() - 0.5) * err, c = Math.cos(a), s = Math.sin(a); const nx = dx * c - dy * s; dy = dx * s + dy * c; dx = nx; }
  if (lob) {
    const T = clamp(d / 560, 0.55, 1.05), vh = d / T * 1.06;
    kickBall(p, dx, dy, vh, GRAV * T / 2, 'pass');
  } else {
    kickBall(p, dx, dy, clamp(speedFor(d, 170), 300, 740), 0, 'pass');
  }
  void d0;
  S.passTarget = m; S.passT = 1.6;
  return b;
}

/* ------------------------------------------------------------------ human control */
function canKick(p) {
  const b = S.ball;
  if (p.stunT > 0 || p.slideT > 0) return false;
  if (b.owner === p) return true;
  return !b.owner && hyp(b.x - p.x, b.y - p.y) < PR + BR + 10 && b.z < 30;
}

// Counters that prove the touch gestures were read (also shown by arc.debug()).
const GI = { taps: 0, swipes: 0, passes: 0, shots: 0, chips: 0, tackles: 0, slides: 0, dives: 0 };
// The finger's path this gesture, sampled once a frame, to tell a curved swipe from a straight one.
const PATH = { pts: [], t0: -1 };
function trackGesture() {
  const g = arc.input.gesture;
  if (!g.active) return;
  if (PATH.t0 !== g.t0) { PATH.t0 = g.t0; PATH.pts.length = 0; }
  if (PATH.pts.length < 600) PATH.pts.push(g.x, g.y);
}
// A swipe that starts flat and curls upward on screen is a chip.
function pathChip(sw) {
  const a = PATH.pts, n = a.length >> 1;
  if (n < 4) return false;
  const x0 = a[0], y0 = a[1], cx = sw.x - x0, cy = sw.y - y0, L = hyp(cx, cy);
  if (L < 60) return false;
  let dev = 0;
  for (let i = 0; i < n; i++) { const d = abs((a[2 * i] - x0) * cy - (a[2 * i + 1] - y0) * cx) / L; if (d > dev) dev = d; }
  if (dev < 0.14 * L) return false;
  const k = Math.max(1, Math.floor(n * 0.3));
  let sx = a[2 * k] - a[0], sy = a[2 * k + 1] - a[1]; const sm = hyp(sx, sy) || 1; sx /= sm; sy /= sm;
  const j = n - 1 - k;
  let ex = sw.x - a[2 * j], ey = sw.y - a[2 * j + 1]; const em = hyp(ex, ey) || 1; ex /= em; ey /= em;
  return ey - sy < -0.4;
}
// A swipe on screen, laid onto the grass: where the finger started and ended on the ground.
function swipeDir(sw, out) {
  if (screenToGround(sw.x0, sw.y0, G0) && screenToGround(sw.x, sw.y, G1)) { out.x = G1.x - G0.x; out.y = G1.y - G0.y; }
  else uvToWorld(sw.dx, sw.dy, out);
  let m = hyp(out.x, out.y);
  if (m < 1e-3) { uvToWorld(sw.dx, sw.dy, out); m = hyp(out.x, out.y) || 1; }
  out.x /= m; out.y /= m;
  return out;
}
function tapPass(p, tp) {
  // the team-mate nearest the tapped spot on screen ...
  let m = null, bd = 1e9;
  for (let i = 0; i < 5; i++) {
    const q = S.players[p.team * 5 + i]; if (q === p) continue;
    if (!projectScreen(q.x, 22, q.y, PJ)) continue;
    const d = hyp(PJ.x - tp.x, PJ.y - tp.y);
    if (d < bd) { bd = d; m = q; }
  }
  let dir = null;
  if (!m || bd > (arc.touchMode ? 120 : 84)) {
    // ... or, on empty grass, the best-aligned team-mate toward that spot
    m = null;
    if (screenToGround(tp.x, tp.y, G0)) {
      let ddx = G0.x - p.x, ddy = G0.y - p.y; const dm = hyp(ddx, ddy);
      if (dm > 20) { ddx /= dm; ddy /= dm; dir = { x: ddx, y: ddy }; m = bestReceiver(p, ddx, ddy, true, false); }
    }
  }
  if (m) {
    const d = hyp(m.x - p.x, m.y - p.y);
    const lob = d > 150 && laneMin(p.team, p.x, p.y, m.x, m.y, false) < 20;
    passTo(p, m, lob, 0.03); GI.passes++;
    if (m.role !== 'GK') { S.ctrl = m.i; S.switchLock = 0.5; }
    markAt(m.x, m.y, 0);
  } else if (dir) { kickBall(p, dir.x, dir.y, 400, 0, 'pass'); GI.passes++; }
  else { kickBall(p, p.fx, p.fy, 380, 0, 'pass'); GI.passes++; }
}
function swipeShoot(p, sw) {
  swipeDir(sw, SW);
  const chip = pathChip(sw);
  const pw = clamp((sw.power - 0.2) / 0.8, 0, 1);
  shootAt(p, SW.x, SW.y, 0.3 + 0.7 * pw, 0.62, 0.02, chip);
  GI.shots++; if (chip) GI.chips++;
  flashTrail(chip ? 2 : 1);
  markAt(p.x + SW.x * 60, p.y + SW.y * 60, chip ? 2 : 1);
}
function swipeSlide(p, sw) {
  if (S.restrict && S.restrict.team === p.team) return;
  swipeDir(sw, SW);
  if (p.slideCD > 0 || p.slideT > 0 || p.stunT > 0) return;
  startSlide(p, SW.x, SW.y); GI.slides++; flashTrail(0);
}
function humanControl(dt) {
  const p = S.players[S.ctrl]; if (!p) return;
  const IN = arc.input, ax = IN.axis(), mag = hyp(ax.x, ax.y);
  const tapE = IN.tap(), swE = IN.swipe();
  let dx = 0, dy = 0;
  if (mag > 0.12) { uvToWorld(ax.x, ax.y, TMP); dx = TMP.x; dy = TMP.y; }
  const free = S.phase === 'play' || S.phase === 'foul';
  const busy = p.slideT > 0 || p.stunT > 0 || p.diving;
  if (!free) { p.dvx = p.dvy = 0; p.sprint = false; return; }
  const gz = IN.gesture;
  const dragFar = IN.dragSteer && gz.active && gz.type !== 'mouse' && hyp(gz.dx, gz.dy) > 118;
  const wantSprint = (IN.down('KeyL', 'ShiftLeft', 'ShiftRight') || dragFar) && mag > 0.2;
  p.sprint = wantSprint && p.stam > 0.04 && !p.tired;
  if (!busy) {
    const sp = 158 * (p.sprint ? 1.36 : 1) * (S.ball.owner === p ? 0.95 : 1) * (S.charging ? 0.6 : 1);
    p.dvx = dx * sp; p.dvy = dy * sp;
    if (mag > 0.12 && S.ball.owner === p && hyp(p.vx, p.vy) < 40) { p.fx = dx / mag; p.fy = dy / mag; }
  }
  if (busy || S.phase !== 'play') { S.charging = false; return; }
  const owns = canKick(p);
  const hasDir = mag > 0.3, ndx = hasDir ? dx / mag : p.fx, ndy = hasDir ? dy / mag : p.fy;
  if (IN.hit('KeyK')) {
    if (owns) { S.charging = true; S.charge = 0.001; }
    else if (!(S.restrict && S.restrict.team === p.team)) startSlide(p, ndx, ndy);
  }
  if (S.charging) {
    if (!owns) { S.charging = false; S.charge = 0; }
    else if (IN.down('KeyK')) S.charge = Math.min(1, S.charge + dt / 0.75);
    else { shootAt(p, ndx, ndy, S.charge, 0.62, S.charge > 0.93 ? 0.12 : 0.02); S.charging = false; S.charge = 0; }
  }
  if (IN.hit('KeyJ', 'Space')) { if (owns) humanPass(p, false, hasDir, ndx, ndy); else standTackle(p, true); }
  if (tapE) { GI.taps++; if (owns) tapPass(p, tapE); else { standTackle(p, true); GI.tackles++; } }
  if (swE) { GI.swipes++; if (owns) swipeShoot(p, swE); else swipeSlide(p, swE); }
  if (IN.hit('KeyU')) { if (owns) humanPass(p, true, hasDir, ndx, ndy); }
  if (IN.hit('KeyQ')) manualSwitch();
}
function humanPass(p, lob, hasDir, dx, dy) {
  const m = bestReceiver(p, dx, dy, hasDir, lob);
  GI.passes++;
  if (m) {
    passTo(p, m, lob, 0.03);
    if (m.role !== 'GK') { S.ctrl = m.i; S.switchLock = 0.5; }
  } else {
    kickBall(p, dx, dy, lob ? 430 : 400, lob ? 330 : 0, 'pass');
  }
}
function manualSwitch() {
  const b = S.ball; let best = null, bd = 1e9;
  for (let i = 1; i < 5; i++) { if (i === S.ctrl) continue; const p = S.players[i]; const d = hyp(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } }
  if (best) { S.ctrl = best.i; S.switchLock = 0.45; S.charging = false; }
}
function autoSwitch(dt) {
  if (S.demo) { S.ctrl = -1; return; }
  S.switchLock -= dt;
  const b = S.ball, cp = S.players[S.ctrl];
  if (b.owner && b.owner.team === 0 && b.owner.role !== 'GK') { if (b.owner !== cp && S.switchLock <= 0) { S.ctrl = b.owner.i; S.charging = false; } return; }
  if (S.switchLock > 0 || b.owner === cp || (cp && (cp.slideT > 0))) return;
  let best = null, bd = 1e9;
  for (let i = 1; i < 5; i++) { const p = S.players[i]; const d = hyp(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } }
  if (best && best !== cp && bd + 18 < hyp(cp.x - b.x, cp.y - b.y)) { S.ctrl = best.i; S.switchLock = 0.3; S.charging = false; }
}

/* ------------------------------------------------------------------ AI */
function anchor(p, out) {
  const t = p.team, d = S.dir[t], f = FORM[p.role], b = S.ball;
  const att = b.owner ? b.owner.team === t : b.lastTeam === t;
  const bx = b.x * d / HL;
  const rx = f[0] + (att ? 0.16 : -0.05) + bx * 0.34;
  out.x = d * clamp(rx, -0.92, 0.8) * HL;
  out.y = clamp(f[1] * HW * 0.9 + b.y * 0.28, -HW + 40, HW - 40);
}
function computeInfo() {
  const b = S.ball;
  for (let t = 0; t < 2; t++) {
    const list = [];
    for (let i = 0; i < 5; i++) {
      const p = S.players[t * 5 + i]; if (p.role === 'GK') continue;
      if (!S.demo && p.i === S.ctrl) continue;
      list.push(p);
    }
    list.sort((a, c) => hyp(a.x - b.x, a.y - b.y) - hyp(c.x - b.x, c.y - b.y));
    S.chase[t] = list;
  }
}
function assignMarks(t) {
  const b = S.ball, o = b.owner;
  const defs = S.chase[t].slice(2), atk = [];
  for (let i = 1; i < 5; i++) { const q = S.players[(1 - t) * 5 + i]; if (q !== o) atk.push(q); }
  defs.forEach((d) => { d.mark = null; });
  const used = new Set();
  const pairs = [];
  defs.forEach((d) => atk.forEach((a) => pairs.push([hyp(d.x - a.x, d.y - a.y), d, a])));
  pairs.sort((x, y) => x[0] - y[0]);
  const done = new Set();
  pairs.forEach((pr) => { if (done.has(pr[1]) || used.has(pr[2])) return; pr[1].mark = pr[2]; done.add(pr[1]); used.add(pr[2]); });
}
function interceptPoint(p, out) {
  const b = S.ball;
  let tt = hyp(b.x - p.x, b.y - p.y) / (baseSpeed(p) * 1.2 + 60); tt = clamp(tt, 0, 0.9);
  const f = (1 - Math.exp(-FR_K * tt)) / FR_K;
  out.x = clamp(b.x + b.vx * f, -HL + 22, HL - 22); out.y = clamp(b.y + b.vy * f, -HW + 22, HW - 22);
}
function pickRun(p, o) {
  const t = p.team, d = S.dir[t];
  anchor(p, AA);
  let bx = AA.x, by = AA.y, bs = -1e9;
  for (let k = 0; k < 9; k++) {
    let cx, cy;
    if (k === 0) { cx = AA.x; cy = AA.y; }
    else { const ang = (k - 1) / 8 * TAU + p.idx, r = 110 + ((k * 37) % 90); cx = o.x + Math.cos(ang) * r + d * 50; cy = o.y + Math.sin(ang) * r; }
    cx = clamp(cx, -HL + 50, HL - 50); cy = clamp(cy, -HW + 45, HW - 45);
    const dO = hyp(cx - o.x, cy - o.y);
    let sc = (cx - o.x) * d * 0.18;
    if (dO < 70 || dO > 330) sc -= 40;
    sc += clamp(laneMin(t, o.x, o.y, cx, cy, false), 0, 60) * 0.9;
    let no = 1e9; for (let i = 0; i < 10; i++) { const q = S.players[i]; if (q.team === t) continue; const dd = hyp(q.x - cx, q.y - cy); if (dd < no) no = dd; }
    sc += clamp(no, 0, 90) * 0.6;
    for (let i = 0; i < 5; i++) { const m = S.players[t * 5 + i]; if (m === p || m === o || m.role === 'GK') continue; const mx = m.rT > 0 ? m.rx : m.x, my = m.rT > 0 ? m.ry : m.y, dm = hyp(cx - mx, cy - my); if (dm < 85) sc -= (85 - dm) * 0.8; }
    sc -= hyp(cx - AA.x, cy - AA.y) * 0.12;
    if (abs(cx - attackX(t)) < 300) sc += p.role === 'ATT' ? 38 : 20;
    if (sc > bs) { bs = sc; bx = cx; by = cy; }
  }
  p.rx = bx; p.ry = by; p.rT = 0.55 + rnd() * 0.4;
}
function aiPlayer(p, dt) {
  const b = S.ball, t = p.team, sk = S.skill[t] + (S.last30 ? 0.05 : 0);
  p.aiT -= dt; if (p.rT > 0) p.rT -= dt;
  if (p.role === 'GK') { keeperAI(p, dt); return; }
  if (p.stunT > 0 || p.slideT > 0) return;
  if (S.phase === 'kickoff') { moveTo(p, p.kx, p.ky, true); const d = hyp(p.kx - p.x, p.ky - p.y); if (d > 30) { p.dvx *= 2.2; p.dvy *= 2.2; } return; }
  if (S.phase === 'goal') {
    if (p.team === S.goalTeam && S.goalP) { const a = p.idx * 1.5 + 0.8; moveTo(p, S.goalP.x + Math.cos(a) * 34, S.goalP.y + Math.sin(a) * 34, false); } else { p.dvx = p.dvy = 0; }
    return;
  }
  if (S.phase === 'halftime' || S.phase === 'fulltime' || S.phase === 'penalties') { p.dvx = p.dvy = 0; return; }
  if (S.phase === 'foul' && S.foul) {
    if (p.team === S.foul.off) { // give the free kick room
      let vx = p.x - S.foul.x, vy = p.y - S.foul.y; const d = hyp(vx, vy) || 1;
      if (d < 110) moveTo(p, S.foul.x + vx / d * 115, S.foul.y + vy / d * 115, true); else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
    } else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
    return;
  }
  const o = b.owner;
  if (o === p) { carrierAI(p, dt); return; }
  if (S.restrict && S.restrict.team === t && S.restrict.t > 0 && o) {
    let vx = p.x - o.x, vy = p.y - o.y; const d = hyp(vx, vy) || 1;
    if (d < 95) moveTo(p, o.x + vx / d * 100, o.y + vy / d * 100, true); else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
    return;
  }
  const ch = S.chase[t];
  if (o && o.team === t) { // attacking support
    if (p.rT <= 0) pickRun(p, o);
    moveTo(p, p.rx, p.ry, hyp(p.rx - p.x, p.ry - p.y) > 70);
  } else if (o) { // defending
    const press = ch[0] === p, cover = ch[1] === p;
    if (press) {
      const d = hyp(o.x - p.x, o.y - p.y);
      moveTo(p, o.x + o.vx * 0.2, o.y + o.vy * 0.2, d > 60);
      if (d < PR * 2 + 10) standTackle(p, false);
    } else if (cover && S.skill[t] > 0.4) {
      const gx = -S.dir[t] * HL; let vx = gx - o.x, vy = -o.y; const m = hyp(vx, vy) || 1;
      moveTo(p, o.x + vx / m * 70, o.y + vy / m * 70, false);
    } else if (p.mark) {
      const m = p.mark, gx = -S.dir[t] * HL; let vx = gx - m.x, vy = -m.y; const dm = hyp(vx, vy) || 1;
      moveTo(p, m.x + vx / dm * 36, m.y + vy / dm * 36, false);
    } else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
  } else { // loose ball
    const pt = S.passTarget && S.passT > 0 && S.passTarget.team === t ? S.passTarget : null;
    if (pt === p || (!pt && ch[0] === p) || (!pt && ch[1] === p && hyp(b.x - p.x, b.y - p.y) < 120)) {
      interceptPoint(p, AA); moveTo(p, AA.x, AA.y, hyp(AA.x - p.x, AA.y - p.y) > 50);
    } else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
  }
  void sk;
}
function carrierAI(p, dt) {
  const t = p.team, sk = S.skill[t] + (S.last30 ? 0.05 : 0), d = S.dir[t], gx = d * HL;
  p.hold += dt;
  const dg = hyp(gx - p.x, p.y);
  // steer toward the goal mouth, around defenders
  let sx = gx - d * 30 - p.x, sy = clamp(p.y, -85, 85) - p.y;
  let mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
  let nearD = 1e9;
  for (let i = 0; i < 10; i++) {
    const q = S.players[i]; if (q.team === t) continue;
    const qx = q.x - p.x, qy = q.y - p.y, qd = hyp(qx, qy); if (qd < nearD) nearD = qd;
    if (qd < 120 && qd > 1 && (qx * sx + qy * sy) / qd > 0.2) {
      const side = (sx * qy - sy * qx) > 0 ? -1 : 1, w = (1 - qd / 120) * 1.5;
      const px = -sy * side * w, py = sx * side * w;
      sx += px; sy += py;
    }
  }
  mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
  // wall avoidance
  if (abs(p.y) > HW - 50) sy -= sgn(p.y) * 0.8;
  mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
  moveTo(p, p.x + sx * 90, p.y + sy * 90, nearD > 85 && p.stam > 0.25);
  if (p.hold < 0.28 || S.phase !== 'play') return;
  if (p.aiT > 0) return;
  p.aiT = lerp(0.42, 0.16, sk) + rnd() * 0.12;
  // shoot
  const range = 230 + 70 * sk;
  if (dg < range && (p.hold > 0.55 || dg < 170)) {
    const blocked = laneMin(t, p.x, p.y, gx, 0, false) < 24;
    const pS = (dg < 170 ? 0.62 : 0.14 + 0.2 * sk) * (blocked ? 0.25 : 1);
    if (rnd() < pS) { aiShoot(p); return; }
  }
  // pass
  const pressed = nearD < 48;
  if (pressed || p.hold > 1.3 + 1.4 * sk || rnd() < 0.08) {
    const m = bestAIReceiver(p);
    if (m && rnd() < (pressed ? 0.85 : 0.45)) { aiPass(p, m); return; }
  }
  if (dg > 380 && sk > 0.7 && rnd() < 0.05) { const m = bestAIReceiver(p); if (m) aiPass(p, m, true); }
}
function aiShoot(p) {
  const t = p.team, sk = S.skill[t], gx = attackX(t);
  const gk = S.players[(1 - t) * 5];
  let ty = (gk.y > 0 ? -1 : 1) * (GH - 18) * (0.45 + rnd() * 0.55);
  if (rnd() < 0.18) ty = (rnd() - 0.5) * 70;
  ty += (rnd() - 0.5) * (1.15 - sk) * 76;
  const dx = gx - p.x, dy = ty - p.y;
  shootAt(p, dx, dy, clamp(0.45 + 0.3 * sk * rnd() + 0.15 * rnd(), 0.35, 0.9), 0, (1.1 - sk) * 0.1);
}
function bestAIReceiver(p) {
  let best = null, bs = -1e9; const dir = S.dir[p.team];
  for (let i = 0; i < 5; i++) {
    const m = S.players[p.team * 5 + i]; if (m === p || m.role === 'GK') continue;
    const d = hyp(m.x - p.x, m.y - p.y); if (d < 70 || d > 430) continue;
    const lane = laneMin(p.team, p.x, p.y, m.x, m.y, false); if (lane < 26) continue;
    let no = 1e9; for (let j = 0; j < 10; j++) { const q = S.players[j]; if (q.team === p.team) continue; const dd = hyp(q.x - m.x, q.y - m.y); if (dd < no) no = dd; }
    const sc = (m.x - p.x) * dir * 0.25 + Math.min(no, 100) * 0.5 + lane * 0.3 - d * 0.05 + (abs(m.x - attackX(p.team)) < 260 ? 30 : 0);
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
function aiPass(p, m, lob) { passTo(p, m, !!lob, (1 - S.skill[p.team]) * 0.2); }
function keeperAI(g, dt) {
  const b = S.ball, t = g.team, d = S.dir[t], gx = -d * HL, sk = S.kskill[t];
  if (g.stunT > 0 || g.diving) return;
  if (S.phase === 'kickoff') { moveTo(g, g.kx, g.ky, false); return; }
  if (S.phase === 'goal' || S.phase === 'halftime' || S.phase === 'fulltime') { g.dvx = g.dvy = 0; return; }
  if (S.phase === 'penalties') return;
  if (b.owner === g) {
    g.dvx = g.dvy = 0;
    g.holdT -= dt;
    if (g.holdT <= 0 && S.phase === 'play') {
      let best = null, bs = -1e9;
      for (let i = 1; i < 5; i++) {
        const m = S.players[t * 5 + i]; const dd = hyp(m.x - g.x, m.y - g.y);
        const sc = laneMin(t, g.x, g.y, m.x, m.y, false) * 0.5 + (m.x - g.x) * d * 0.1 - dd * 0.05;
        if (sc > bs) { bs = sc; best = m; }
      }
      if (best) { passTo(g, best, sk > 0.7 && rnd() < 0.3, 0.1); if (t === 0 && !S.demo) { S.ctrl = best.i; S.switchLock = 0.4; } }
    }
    return;
  }
  const bd = hyp(b.x - gx, b.y);
  // incoming shot?
  const toward = (gx - b.x) * b.vx > 0 && !b.owner;
  if (toward && abs(b.vx) > 150 && g.diveRec <= 0 && g.diveDelay < 0) {
    const tc = (gx - b.x) / b.vx;
    if (tc > 0 && tc < 0.62) {
      const yc = b.y + b.vy * tc, zc = b.z + b.vz * tc - 0.5 * GRAV * tc * tc;
      if (abs(yc) < GH + 24 && zc < GOAL_H + 12 && hyp(b.vx, b.vy) > 240) {
        g.diveTo = clamp(yc, -(GH - 8), GH - 8);
        if (rnd() > 0.5 + 0.48 * sk) g.diveTo = clamp(yc + sgn(rnd() - 0.5) * (35 + rnd() * 45), -(GH - 8), GH - 8);
        g.diveDelay = (1 - sk) * 0.14 + 0.02;
      }
    }
  }
  if (g.diveDelay >= 0) { g.diveDelay -= dt; if (g.diveDelay < 0) { keeperDive(g, g.diveTo); g.diveDelay = -1; return; } }
  // positioning on an arc
  const rad = clamp(bd * 0.13 + 16, 24, 66);
  let vx = b.x - gx, vy = b.y; const m = hyp(vx, vy) || 1;
  let tx = gx + d * (vx / m * rad), ty = (vy / m * rad);
  if (b.owner && b.owner.team !== t && hyp(b.owner.x - gx, b.owner.y) < 230) { tx = gx + d * (rad + 10) * (vx / m); }
  ty = clamp(ty, -(GH - 4), GH - 4);
  tx = clamp(tx, gx + d * 14, gx + d * 90);
  // rush a loose ball in the box
  if (!b.owner && abs(b.x - gx) < 120 && abs(b.y) < 120 && hyp(b.vx, b.vy) < 160 && S.chase[t].every((q) => hyp(q.x - b.x, q.y - b.y) > hyp(g.x - b.x, g.y - b.y) + 12) && S.chase[1 - t].every((q) => hyp(q.x - b.x, q.y - b.y) > hyp(g.x - b.x, g.y - b.y) - 8)) { tx = b.x; ty = b.y; }
  moveTo(g, tx, ty, false);
  g.dvx *= 0.7 + 0.45 * sk; g.dvy *= 0.7 + 0.45 * sk;
}
function keeperDive(g, toY) {
  if (g.diving) return;
  g.diving = true; g.diveE = 0; g.diveY0 = g.y; g.diveY1 = clamp(toY, -(GH - 6), GH - 6); g.diveDir = g.diveY1 > g.y ? 1 : -1; if (abs(g.diveY1 - g.y) < 8) g.diveDir = 0;
  g.dvx = g.dvy = 0;
}

/* ------------------------------------------------------------------ penalty shootout */
function startPenalties() {
  S.phase = 'penalties'; S.phaseT = 0; S.charging = false;
  S.pen = { kicks: [[], []], k: 0, stage: 'intro', t: 0, aimY: 0, aimH: 26, charge: 0, charging: false, taker: null, keeper: null, saved: false, scored: false, res: '', winner: -1, first: 0, humanDive: false };
  S.ball.owner = null;
  S.players.forEach((p) => { p.dvx = p.dvy = 0; p.diving = false; p.stunT = 0; p.slideT = 0; p.cheer = 0; });
  CAM.snap = true;
  if (!S.demo) arc.toast('Penalty shootout', 'Level after full time', 2200);
  snd.whistle(false);
  penSetup();
  S.pen.stage = 'intro'; S.pen.t = 0;
}
function penTeamOf(k) { return k % 2 === 0 ? S.pen.first : 1 - S.pen.first; }
function penSetup() {
  const pen = S.pen, b = S.ball;
  pen.team = penTeamOf(pen.k);
  const round = Math.floor(pen.k / 2);
  pen.taker = S.players[pen.team * 5 + 1 + (round % 4)];
  pen.keeper = S.players[(1 - pen.team) * 5];
  pen.saved = false; pen.scored = false; pen.charge = 0; pen.charging = false; pen.humanDive = false; pen.aimY = 0; pen.aimH = 26; pen.res = '';
  S.players.forEach((p, i) => { // everyone else waits on the halfway line
    const slot = i % 5;
    p.x = -40 + slot * 6 + (p.team ? 60 : 0); p.y = -120 + slot * 60 + (p.team ? 20 : -20); p.vx = p.vy = 0; p.fx = 1; p.fy = 0; p.diving = false; p.diveRec = 0; p.noBallT = 0;
  });
  pen.taker.x = HL - 110 - 40; pen.taker.y = 0; pen.taker.fx = 1; pen.taker.fy = 0;
  pen.keeper.x = HL - 14; pen.keeper.y = 0; pen.keeper.fx = -1; pen.keeper.fy = 0; pen.keeper.diving = false;
  b.owner = null; b.x = HL - 110; b.y = 0; b.z = 0; b.vx = b.vy = b.vz = 0; b.tn = 0;
  pen.stage = 'aim'; pen.t = 0;
  if (pen.team === 0) S.ctrl = pen.taker.i;
}
function penShoot(aimY, aimH, power) {
  const pen = S.pen, b = S.ball, p = pen.taker;
  const v = 430 + 480 * power;
  const x0 = b.x, y0 = b.y, dx = HL - x0, dy = aimY - y0, dm = hyp(dx, dy);
  const hv = v, t = dm / hv;
  const vz = Math.max(0, (aimH - 4 + 0.5 * GRAV * t * t) / t);
  b.vx = dx / dm * hv; b.vy = dy / dm * hv; b.vz = vz; b.z = 4; b.lastTouch = p; b.lastTeam = p.team;
  p.kickT = 0.25; p.fx = 1; p.fy = 0; snd.kick(power);
  pen.stage = 'flight'; pen.t = 0;
  // the AI keeper guesses
  if (pen.keeper.team === 1 || S.demo) {
    const sk = S.kskill[pen.keeper.team];
    const side = abs(aimY) < 18 ? 0 : sgn(aimY);
    let guess = side;
    if (rnd() > 0.34 + 0.3 * sk) { const opts = [-1, 0, 1].filter((s) => s !== side); guess = pick(opts); }
    pen.keeper.diveDelay = 0.04 + (1 - sk) * 0.1; pen.keeper.diveTo = guess * (GH - 14);
  }
}
function penBallInGoal() {
  const pen = S.pen; if (!pen || pen.stage !== 'flight' || pen.scored || pen.saved) return;
  const b = S.ball; if (abs(b.y) < GH && b.z < GOAL_H) { pen.scored = true; netHit(1, b.y, b.z, hyp(b.vx, b.vy)); penResolve(true); }
}
function penResolve(goal) {
  const pen = S.pen; if (pen.stage === 'result') return;
  pen.kicks[pen.team].push(goal ? 1 : 0);
  pen.stage = 'result'; pen.t = 0; pen.res = goal ? 'goal' : (pen.saved ? 'saved' : 'missed');
  if (goal) { snd.roar(true); if (!S.demo) arc.toast('GOAL!', pen.taker.name, 1500); confetti(HL, 0, pen.team); }
  else { snd.ooh(); if (!S.demo) arc.toast(pen.saved ? 'Saved!' : 'Missed!', pen.taker.name, 1500); }
  pen.k++;
  // decided?
  const a = pen.kicks[0], c = pen.kicks[1], sa = a.reduce((x, y) => x + y, 0), sc = c.reduce((x, y) => x + y, 0);
  const ra = Math.max(0, 5 - a.length), rc = Math.max(0, 5 - c.length);
  if (a.length <= 5 && c.length <= 5 && !(a.length === 5 && c.length === 5)) {
    if (sa > sc + rc) pen.winner = 0; else if (sc > sa + ra) pen.winner = 1;
  } else if (a.length === c.length && a.length >= 5) {
    if (sa !== sc) pen.winner = sa > sc ? 0 : 1;
  }
  void ra;
}
function penUpdate(dt) {
  const pen = S.pen, b = S.ball, IN = arc.input;
  pen.t += dt;
  const k = pen.keeper, tk = pen.taker;
  if (pen.stage === 'intro') { if (pen.t > 1.2) penSetup(); return; }
  const humanTaker = pen.team === 0 && !S.demo;
  const humanKeeper = pen.team === 1 && !S.demo;
  if (pen.stage === 'aim') {
    if (humanTaker) {
      const gz = IN.gesture, swE = IN.swipe();
      if (IN.dragSteer && gz.active && gz.type !== 'mouse') {
        // a finger on the glass: the reticle follows the drag, the swipe is the shot
        const up = Math.max(24, -gz.dy);
        pen.aimY = clamp(gz.dx / up * (GH - 4), -(GH + 24), GH + 24);
        pen.aimH = clamp(10 + Math.min(1, hyp(gz.dx, gz.dy) / 140) * 36, 5, GOAL_H + 20);
      } else {
        const ax = IN.axis();
        pen.aimY = clamp(pen.aimY + ax.x * 150 * dt, -(GH + 24), GH + 24);
        pen.aimH = clamp(pen.aimH - ax.y * 70 * dt, 5, GOAL_H + 20);
      }
      if (swE) penSwipe(swE);
      else {
        if (IN.hit('KeyK') && !pen.charging) { pen.charging = true; pen.charge = 0.001; }
        if (pen.charging) {
          if (IN.down('KeyK')) pen.charge = Math.min(1, pen.charge + dt / 0.9);
          else { pen.charging = false; let ay = pen.aimY, ah = pen.aimH; const pw = pen.charge; if (pw > 0.92) { ay += (rnd() - 0.5) * 34; ah += (rnd() - 0.2) * 24; } if (pw < 0.3) ah = Math.min(ah, 30); penShoot(ay, ah, Math.max(0.25, pw)); }
        }
      }
    } else if (pen.t > (S.demo ? 0.6 : 1.5)) {
      const sk = S.skill[pen.team];
      const side = pick([-1, 1, -1, 1, 0]);
      let ay = side * (GH - 12 - rnd() * 14) + (rnd() - 0.5) * (1 - sk) * 60;
      let ah = 10 + rnd() * 38 + (rnd() - 0.5) * (1 - sk) * 24;
      penShoot(ay, ah, clamp(0.55 + 0.35 * sk + (rnd() - 0.5) * 0.25, 0.3, 1));
    }
    if (humanKeeper && !pen.humanDive && (pen.t > 0.5 || IN.tap() || IN.swipe())) { penHumanDive(); }
  } else if (pen.stage === 'flight') {
    if (humanKeeper && !pen.humanDive) penHumanDive();
    if (k.diveDelay >= 0) { k.diveDelay -= dt; if (k.diveDelay < 0) { keeperDive(k, k.diveTo); k.diveDelay = -1; } }
    updateBall(dt); keeperSaves(); integratePlayers(dt);
    if (pen.saved && pen.t > 0.9) penResolve(false);
    else if (!pen.scored && pen.t > 1.7) penResolve(false);
    if (b.owner && pen.stage === 'flight') penResolve(false);
  } else if (pen.stage === 'result') {
    updateBall(dt); integratePlayers(dt);
    if (pen.t > 1.6) {
      if (pen.winner >= 0) { S.phase = 'fulltime'; S.phaseT = 0; S.penWinner = pen.winner; S.pen.done = true; CAM.snap = true; finishMatch(); }
      else penSetup();
    }
  }
  void tk;
}
function penSwipe(sw) {
  const pen = S.pen;
  const up = Math.max(24, -sw.dy);
  let ay = clamp(sw.dx / up * (GH - 4), -(GH + 24), GH + 24);
  const pw = clamp((sw.power - 0.2) / 0.8, 0, 1), chip = pathChip(sw);
  let ah = chip ? 46 : 10 + pw * 36;
  if (pw > 0.96 && !chip) { ay += (rnd() - 0.5) * 30; ah += (rnd() - 0.2) * 22; }
  pen.aimY = ay; pen.aimH = ah; GI.shots++; if (chip) GI.chips++;
  flashTrail(chip ? 2 : 1);
  penShoot(ay, ah, chip ? 0.5 : Math.max(0.3, 0.4 + 0.55 * pw));
}
function penHumanDive() {
  const IN = arc.input, ax = IN.axis(), pen = S.pen;
  const tp = IN.tap(), sw = IN.swipe();
  if (tp || sw) {
    // tap a side of the screen (or swipe it) to dive that way, the middle jumps on the spot
    const side = sw ? (sw.dir === 'left' ? -1 : sw.dir === 'right' ? 1 : 0) : (tp.nx < 0.36 ? -1 : tp.nx > 0.64 ? 1 : 0);
    keeperDive(pen.keeper, side * (GH - 14)); pen.humanDive = true; GI.dives++;
    return;
  }
  if (ax.x < -0.5) { keeperDive(pen.keeper, -(GH - 14)); pen.humanDive = true; }
  else if (ax.x > 0.5) { keeperDive(pen.keeper, GH - 14); pen.humanDive = true; }
  else if (ax.y < -0.6) { keeperDive(pen.keeper, 0); pen.humanDive = true; }
}

/* ------------------------------------------------------------------ frame update */
function stepSim(rawdt) {
  const ph = S.phase;
  S.phaseT += rawdt;
  S.sayCD -= rawdt; S.sfxWall -= rawdt; S.excite = Math.max(0, S.excite - rawdt * 0.35);
  if (S.say) { S.say.age += rawdt; if (S.say.age > S.say.life) S.say = null; }
  // slow motion on a goal
  const targetSlow = (ph === 'goal' && S.phaseT < 1.1 && !arc.reducedMotion) ? 0.42 : 1;
  S.slow = approach(S.slow, targetSlow, rawdt * 3);
  const dt = rawdt * S.slow;
  S.t += dt;
  for (let i = 0; i < 2; i++) { const n = S.nets[i]; if (n.amp > 0) { n.t += rawdt; n.amp = Math.max(0, n.amp - rawdt * 0.7); } }
  if (S.flash > 0) S.flash = Math.max(0, S.flash - rawdt * 1.8);
  if (S.restrict) { S.restrict.t -= dt; if (S.restrict.t <= 0) S.restrict = null; }
  if (S.passT > 0) S.passT -= dt;
  updateParticles(dt);
  crowdTick(rawdt);

  if (ph === 'penalties') { penUpdate(rawdt); return; }

  S.infoT -= dt; if (S.infoT <= 0) { S.infoT = 0.14; computeInfo(); }
  S.markT -= dt; if (S.markT <= 0) { S.markT = 0.45; assignMarks(0); assignMarks(1); }

  if (ph === 'kickoff') {
    for (let i = 0; i < 10; i++) { if (!S.demo && i === S.ctrl) { S.players[i].dvx = S.players[i].dvy = 0; } aiPlayer(S.players[i], dt); }
    // let the controlled player jog too
    if (!S.demo) { const c = S.players[S.ctrl]; moveTo(c, c.kx, c.ky, true); const d = hyp(c.kx - c.x, c.ky - c.y); if (d > 30) { c.dvx *= 2.2; c.dvy *= 2.2; } }
    integratePlayers(dt);
    S.ball.x = 0; S.ball.y = 0;
    if (S.phaseT > 2.1) { S.players.forEach((p) => { p.x = p.kx; p.y = p.ky; p.vx = p.vy = 0; }); beginPlay(); }
    return;
  }
  if (ph === 'halftime') { halftimeStep(rawdt); return; }
  if (ph === 'fulltime') {
    integratePlayers(dt);
    if (S.phaseT > 2.4 && !S.pen) finishMatch();
    return;
  }

  // play, goal, foul share the main loop
  if (!S.demo) { autoSwitch(dt); if (S.phase === 'play' || S.phase === 'foul') humanControl(dt); else { const c = S.players[S.ctrl]; if (c) { c.dvx = c.dvy = 0; } } }
  for (let i = 0; i < 10; i++) { const p = S.players[i]; if (!S.demo && i === S.ctrl && (S.phase === 'play' || S.phase === 'foul')) continue; aiPlayer(p, dt); }
  // keeper dive trigger from shots (delay handled inside keeperAI); human team keeper too
  integratePlayers(dt);
  updateBall(dt);
  if (S.phase === 'play') {
    tryPickup(); keeperSaves(); slideContacts();
    S.matchT += dt;
    if (S.ball.owner) S.stats.poss[S.ball.owner.team] += dt; else S.stats.poss[S.ball.lastTeam] += dt * 0.5;
    const rem = S.T - S.matchT;
    if (!S.last30 && rem <= 30 && rem > 0 && S.matchT > S.T * 0.5) { S.last30 = true; if (!S.demo) { arc.toast('Final 30 seconds', 'Everything on the line', 1800); say(pick(LINES.final), 3); snd.beep(true); } }
    if (S.half === 1 && S.matchT >= S.T / 2) startHalftime();
    else if (S.matchT >= S.T) startFulltime();
  } else if (S.phase === 'goal') {
    if (S.phaseT > 3.5) {
      const conc = 1 - S.goalTeam;
      if (S.matchT >= S.T) startFulltime();
      else if (S.half === 1 && S.matchT >= S.T / 2) startHalftime();
      else { S.kickTeam = conc; S.phase = 'kickoff'; S.phaseT = 0; placeKickoff(false); }
    }
  } else if (S.phase === 'foul') {
    if (S.phaseT > 1.6 && S.foul) {
      const v = S.foul.victim, off = S.foul.off;
      S.phase = 'play'; S.phaseT = 0;
      v.stunT = 0; v.x = S.foul.x; v.y = S.foul.y; v.noBallT = 0;
      takeBall(v); v.hold = -0.2;
      S.restrict = { team: off, t: 1.8 };
      if (v.team === 0 && !S.demo && v.role !== 'GK') S.ctrl = v.i;
      S.foul = null;
    }
  }
  if (S.last30 && !S.demo && S.phase === 'play' && ((S.T - S.matchT) | 0) < 10 && ((S.T - S.matchT) | 0) !== S.lastBeep) { S.lastBeep = (S.T - S.matchT) | 0; snd.beep(false); }
}
function halftimeStep(rawdt) {
  const t = S.phaseT;
  if (t < 1.5) { S.fade = 0; return; }
  if (t < 2.1) { S.fade = (t - 1.5) / 0.6; return; }
  if (S.htStage === 0) {
    S.htStage = 1; S.half = 2; S.dir = [-S.dir[0], -S.dir[1]]; S.kickTeam = 1; S.last30 = false;
    placeKickoff(true); CAM.snap = true;
    S.ball.lastTeam = 1;
  }
  if (t < 2.9) { S.fade = 1 - (t - 2.1) / 0.8; return; }
  S.fade = 0; S.phase = 'kickoff'; S.phaseT = 0;
  void rawdt;
}
function crowdTick(dt) {
  if (S.demo) return;
  S.crowdT -= dt;
  if (S.crowdT <= 0) {
    S.crowdT = 0.8 + rnd() * 0.6;
    const f = (S.last30 ? 1.6 : 1) + S.excite * 1.4;
    arc.sfx.noise(1.2, { freq: 480 + rnd() * 260, filter: 'bandpass', vol: 0.014 * f });
  }
}

function update(dt) { if (!S || S.demo) return; trackGesture(); stepSim(dt); }
function idle(dt) {
  if (!S) return;
  if (arc.state === 'menu' && S.demo) {
    stepSim(dt);
    if (S.matchT > S.T - 2 || S.phase === 'fulltime') startDemo();
  }
}

/* ------------------------------------------------------------------ results, cup flow */
function finishMatch() {
  if (S.demo) { startDemo(); return; }
  S.say = null;
  const h = S.score[0], a = S.score[1];
  const cup = S.cfg.mode === 'cup';
  if (h === a && cup && !S.pen) { startPenalties(); return; }
  showResult();
}
function showResult() {
  const h = S.score[0], a = S.score[1], pw = S.penWinner;
  const tie = h === a;
  const won = h > a || (tie && pw === 0), drew = tie && pw === undefined;
  const pts = Math.max(0, h * 100 - a * 50 + (won ? (tie ? 200 : 300) : drew ? 100 : 0));
  const th = S.teams[0], ta = S.teams[1];
  const sc = S.scorers.length ? S.scorers.map((s) => '<b style="color:var(--ink)">' + arc.esc(s.name) + '</b> ' + arc.esc(S.teams[s.team].abbr) + ' ' + s.clock + (s.og ? ' (og)' : '')).join(' &middot; ') : 'No goals. A proper tactical scrap.';
  const tot = S.stats.poss[0] + S.stats.poss[1], pa = Math.round(S.stats.poss[0] / tot * 100);
  let pensLine = '';
  if (S.pen) { const k0 = S.pen.kicks[0].reduce((x, y) => x + y, 0), k1 = S.pen.kicks[1].reduce((x, y) => x + y, 0); pensLine = '<p>Penalties: ' + arc.esc(th.abbr) + ' ' + k0 + ' - ' + k1 + ' ' + arc.esc(ta.abbr) + '</p>'; }
  const html =
    '<p style="color:var(--ink);font-size:18px"><b>' + arc.esc(th.name) + ' ' + h + ' - ' + a + ' ' + arc.esc(ta.name) + '</b></p>' + pensLine +
    '<p>' + sc + '</p>' +
    '<div class="stat"><div>Shots<b>' + S.stats.shots[0] + ' - ' + S.stats.shots[1] + '</b></div><div>On target<b>' + S.stats.sot[0] + ' - ' + S.stats.sot[1] + '</b></div><div>Possession<b>' + pa + '% - ' + (100 - pa) + '%</b></div><div>Fouls<b>' + S.stats.fouls[0] + ' - ' + S.stats.fouls[1] + '</b></div></div>';
  const verdict = won ? (tie ? 'Won on penalties' : 'Victory') : drew ? 'Honours even' : 'Beaten';
  const detail = '<p>Points: goals ' + h * 100 + ' minus conceded ' + a * 50 + (won ? ' plus win bonus ' + (tie ? 200 : 300) : drew ? ' plus draw bonus 100' : '') + ' = <b style="color:var(--ink)">' + pts + '</b></p>';
  if (S.cfg.mode !== 'cup') {
    arc.over({ score: pts, scoreLabel: 'Points', eyebrow: 'Full time', title: verdict, html: html + detail, again: 'Play again' });
    return;
  }
  CUP.total += pts; CUP.results.push({ line: th.short + ' ' + h + '-' + a + ' ' + ta.short + (tie ? ' (pens)' : ''), won });
  const resHtml = '<p>' + CUP.results.map((r, i) => STAGES[i] + ': ' + arc.esc(r.line)).join('<br>') + '</p>';
  if (!won) {
    arc.over({ score: CUP.total, scoreLabel: 'Cup points', eyebrow: 'Knocked out in the ' + STAGES[CUP.idx].toLowerCase(), title: 'Cup run over', html: html + detail + resHtml, again: 'New cup run' });
  } else if (CUP.idx >= 2) {
    CUP.total += 500;
    arc.over({ score: CUP.total, scoreLabel: 'Cup points', eyebrow: 'Kings Cup', title: 'Champions of the <em>rooftop</em>', html: html + detail + resHtml + '<p>Trophy bonus +500</p>', again: 'New cup run' });
  } else {
    CUP.pending = true;
    arc.over({ eyebrow: STAGES[CUP.idx] + ' won', title: 'Through to the ' + STAGES[CUP.idx + 1].toLowerCase(), html: html + detail + resHtml + '<p>Next: <b style="color:var(--ink)">' + arc.esc(TEAMS[CUP.opps[CUP.idx + 1]].name) + '</b>, and they are tougher.</p>', again: 'Next match' });
  }
}
function diffSkill(d) { return d === 'easy' ? 0.3 : d === 'hard' ? 0.82 : 0.56; }
function startCupMatch() {
  const ch = arc.choices;
  newMatch({ home: CUP.team, away: CUP.opps[CUP.idx], minutes: ch.len || 2, skill: clamp(diffSkill(ch.diff) + CUP.idx * 0.05, 0.2, 0.94), mode: 'cup', matchNo: CUP.idx + 1, label: STAGES[CUP.idx] });
  announceMatch();
}
function announceMatch() {
  if (S.cfg.mode === 'cup') arc.toast(S.cfg.label, 'vs ' + S.teams[1].name, 2400);
  else arc.toast(S.teams[0].short + ' v ' + S.teams[1].short, 'Friendly', 2000);
}
function startDemo() {
  let a = (rnd() * TEAMS.length) | 0, b = (rnd() * TEAMS.length) | 0; if (b === a) b = (a + 3) % TEAMS.length;
  newMatch({ home: a, away: b, minutes: 2, skill: 0.6, demo: true });
  S.dir = [1, -1]; S.ctrl = -1;
}

/* ================================================================== three.js: helpers */
const COL = {};
const C = (hex) => COL[hex] || (COL[hex] = new THREE.Color(hex));
const TEXQ = { pitchW: 2048, aniso: 4, shadow: 2048 };
const UPV = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _n3 = new THREE.Matrix3(), _v3 = new THREE.Vector3();

function canvasTex(w, h, draw, o) {
  o = o || {};
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (o.repeatS) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = o.aniso === undefined ? TEXQ.aniso : o.aniso;
  if (o.nomip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}
// Matrix from position, euler rotation and scale (all optional)
function M(x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x || 0, y || 0, z || 0), _q, _s.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz));
}
// A cylinder of radius r between two points, as a matrix for a unit-height cylinder geometry
function tubeM(ax, ay, az, bx, by, bz) {
  _a.set(bx - ax, by - ay, bz - az); const len = _a.length(); _a.normalize();
  _q.setFromUnitVectors(UPV, _a);
  return new THREE.Matrix4().compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(1, len, 1));
}
// Collects many small shapes into one geometry (positions, normals, uvs, vertex colours)
class GB {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.base = 0; this.hasC = false; }
  add(geo, mat, col, uv) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uvs = geo.attributes.uv, idx = geo.index;
    _n3.getNormalMatrix(mat);
    for (let k = 0; k < pos.count; k++) {
      _v3.fromBufferAttribute(pos, k).applyMatrix4(mat); this.p.push(_v3.x, _v3.y, _v3.z);
      _v3.fromBufferAttribute(nor, k).applyMatrix3(_n3).normalize(); this.n.push(_v3.x, _v3.y, _v3.z);
      if (uv) this.u.push(uv[0], uv[1]); else if (uvs) this.u.push(uvs.getX(k), uvs.getY(k)); else this.u.push(0, 0);
      if (col) { this.c.push(col.r, col.g, col.b); this.hasC = true; } else this.c.push(1, 1, 1);
    }
    if (idx) for (let k = 0; k < idx.count; k++) this.i.push(this.base + idx.getX(k));
    else for (let k = 0; k < pos.count; k++) this.i.push(this.base + k);
    this.base += pos.count;
    geo.dispose();
    return this;
  }
  box(w, h, d, mat, col, uv) { return this.add(new THREE.BoxGeometry(w, h, d), mat, col, uv); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.hasC) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i.length > 65000 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}
// Lets an instanced mesh fade each instance with an 'instA' attribute
function patchAlpha(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float instA;\nvarying float vInstA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstA = instA;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInstA;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstA;');
  };
  mat.customProgramCacheKey = () => 'instA';
  return mat;
}
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ------------------------------------------------------------------ procedural textures */
function texPitch() {
  const W = TEXQ.pitchW, H = Math.round(W * 680 / 1100);
  return canvasTex(W, H, (g) => {
    const s = W / 1100;
    g.setTransform(s, 0, 0, s, 550 * s, 340 * s);
    const R = Arcade.rng(2027), rr = (a, b) => a + (b - a) * R();
    g.save(); rrPath(g, -516, -296, 1032, 592, 58); g.clip();
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#23813f' : '#2c9a4d'; g.fillRect(-600 + i * 100, -300, 101, 600); }
    // soft long shading, worn patches where the play happens
    const lg = g.createLinearGradient(0, -296, 0, 296); lg.addColorStop(0, 'rgba(0,0,0,.18)'); lg.addColorStop(.5, 'rgba(255,255,255,.04)'); lg.addColorStop(1, 'rgba(0,0,0,.14)');
    g.fillStyle = lg; g.fillRect(-520, -300, 1040, 600);
    [[0, 0, 70], [-392, 0, 60], [392, 0, 60], [-470, 0, 84], [470, 0, 84], [-250, 140, 70], [260, -150, 70], [-120, -160, 60], [150, 170, 60]].forEach((q) => {
      const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], q[2]); gr.addColorStop(0, 'rgba(70,56,24,.20)'); gr.addColorStop(1, 'rgba(70,56,24,0)');
      g.fillStyle = gr; g.fillRect(q[0] - q[2], q[1] - q[2], q[2] * 2, q[2] * 2);
    });
    // fibres
    g.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 9000; i++) g.fillRect(rr(-516, 516), rr(-296, 296), rr(.8, 2.2), rr(.5, 1.3));
    g.fillStyle = 'rgba(0,30,10,.10)'; for (let i = 0; i < 9000; i++) g.fillRect(rr(-516, 516), rr(-296, 296), rr(.8, 2.2), rr(.5, 1.3));
    // painted rubber zones in the boxes
    g.fillStyle = 'rgba(14,100,112,.34)'; g.fillRect(HL - 160, -150, 170, 300); g.fillRect(-HL - 10, -150, 170, 300);
    // lines
    g.strokeStyle = 'rgba(244,250,240,.95)'; g.lineWidth = 3.4; g.lineJoin = 'round';
    rrPath(g, -HL, -HW, HL * 2, HW * 2, CORNER); g.stroke();
    g.beginPath(); g.moveTo(0, -HW); g.lineTo(0, HW); g.stroke();
    g.beginPath(); g.arc(0, 0, 68, 0, TAU); g.stroke();
    [-1, 1].forEach((sx) => {
      g.strokeRect(sx > 0 ? HL - 160 : -HL, -150, 160, 300);
      g.beginPath(); g.arc(sx * (HL - 110), 0, 3.8, 0, TAU); g.fillStyle = 'rgba(244,250,240,.97)'; g.fill();
      g.beginPath(); g.arc(sx * (HL - 110), 0, 44, sx > 0 ? PI * 0.58 : -PI * 0.42, sx > 0 ? PI * 1.42 : PI * 0.42); g.stroke();
    });
    g.beginPath(); g.arc(0, 0, 3.8, 0, TAU); g.fill();
    // centre crown
    g.fillStyle = 'rgba(255,214,120,.5)';
    g.beginPath(); g.moveTo(-30, 14); g.lineTo(-32, -12); g.lineTo(-15, 1); g.lineTo(0, -20); g.lineTo(15, 1); g.lineTo(32, -12); g.lineTo(30, 14); g.closePath(); g.fill();
    g.fillRect(-30, 17, 60, 5);
    g.restore();
  });
}
function texGrain() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
    const R = Arcade.rng(77);
    for (let i = 0; i < 5200; i++) { const v = 90 + R() * 80 | 0; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(R() * 256, R() * 256, 1 + R() * 1.4, 2 + R() * 4); }
  }, { repeat: true, data: true, aniso: 2 });
}
function texRoof() {
  return canvasTex(1024, 640, (g, w, h) => {
    const R = Arcade.rng(5);
    g.fillStyle = '#3a3e46'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.07)'; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 2); }
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.4;
    const cell = 90 * w / 1180;
    for (let x = 0; x <= w; x += cell) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += cell) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h, r = 20 + R() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });
}
function texBoards() {
  return canvasTex(2048, 64, (g, w, h) => {
    g.fillStyle = '#16304a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5a82a8'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
    const names = ['TURF KINGS', 'ROOFTOP LEAGUE', 'FIVE A SIDE', 'KINGS CUP', 'CITY CAGE', 'TURF KINGS', 'ROOFTOP LEAGUE', 'KINGS CUP'];
    const sw = w / 8;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 27px Inter, Arial, sans-serif';
    if (g.letterSpacing !== undefined) g.letterSpacing = '3px';
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#ffb736' : '#ff6940'; g.fillRect(i * sw, 7, sw * 0.03, h - 14);
      g.fillStyle = '#ffd36b'; g.fillText(names[i], i * sw + sw / 2, h / 2 + 1);
    }
  }, { repeatS: true });
}
function texFence() {
  return canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(214,230,246,1)'; g.lineWidth = 3.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-8, -8); g.lineTo(72, 72); g.moveTo(72, -8); g.lineTo(-8, 72); g.stroke();
  }, { repeat: true });
}
function texNet() {
  return canvasTex(64, 64, (g) => {
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 4;
    g.strokeRect(2, 2, 60, 60);
  }, { repeat: true });
}
function texWindows() {
  return canvasTex(256, 256, (g) => {
    const R = Arcade.rng(31);
    g.fillStyle = '#10172a'; g.fillRect(0, 0, 256, 256);
    const lit = ['#ffd9a0', '#ffe9c4', '#ffc27a', '#a9d8ff', '#fff4d8'];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const on = R() < 0.4;
      g.fillStyle = on ? lit[(R() * lit.length) | 0] : (R() < 0.5 ? '#1a2440' : '#141c33');
      g.fillRect(c * 32 + 6, r * 32 + 7, 20, 17);
      if (on) { g.fillStyle = 'rgba(255,230,180,.22)'; g.fillRect(c * 32 + 3, r * 32 + 4, 26, 23); }
    }
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let r = 0; r < 8; r++) g.fillRect(0, r * 32, 256, 2);
  }, { repeat: true });
}
function texSky() {
  return canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#04060f'); gr.addColorStop(0.28, '#0a1232'); gr.addColorStop(0.43, '#232a52');
    gr.addColorStop(0.48, '#6a4a60'); gr.addColorStop(0.5, '#a0654f'); gr.addColorStop(0.52, '#4a3650');
    gr.addColorStop(0.6, '#1a1c34'); gr.addColorStop(1, '#0b0e1a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const R = Arcade.rng(9);
    for (let i = 0; i < 380; i++) { const y = R() * h * 0.46; const a = 0.25 + R() * 0.75; g.fillStyle = 'rgba(255,248,230,' + (a * (1 - y / (h * 0.5))).toFixed(2) + ')'; g.fillRect(R() * w, y, 1 + (R() < 0.15 ? 1 : 0), 1); }
    const mx = w * 0.62, my = h * 0.22;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, 70); mg.addColorStop(0, 'rgba(255,244,214,.55)'); mg.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = mg; g.fillRect(mx - 70, my - 70, 140, 140);
    g.fillStyle = '#fff6df'; g.beginPath(); g.arc(mx, my, 11, 0, TAU); g.fill();
  }, { aniso: 1 });
}
function texCityFloor() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const R = Arcade.rng(21);
    g.fillStyle = '#0a0d17'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#151a28';
    for (let i = 0; i < 4; i++) { g.fillRect(i * 256 + 108, 0, 40, h); g.fillRect(0, i * 256 + 108, w, 40); }
    for (let i = 0; i < 500; i++) { const x = R() * w, y = R() * h; g.fillStyle = R() < 0.55 ? 'rgba(255,200,130,.85)' : R() < 0.6 ? 'rgba(255,70,60,.8)' : 'rgba(150,220,255,.8)'; g.fillRect(x, y, 2, 2); }
    for (let i = 0; i < 70; i++) { const x = R() * w, y = R() * h; const gr = g.createRadialGradient(x, y, 0, x, y, 20); gr.addColorStop(0, 'rgba(255,190,120,.4)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = gr; g.fillRect(x - 20, y - 20, 40, 40); }
  }, { repeat: true });
}
function texGlow() {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,246,214,.75)'); gr.addColorStop(0.55, 'rgba(255,240,200,.18)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }, { aniso: 1 });
}
function texBlob() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, { aniso: 1 });
}
function texBall() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f4f5f2'; g.fillRect(0, 0, w, h);
    const ph = (1 + Math.sqrt(5)) / 2;
    const vs = [[0, 1, ph], [0, -1, ph], [0, 1, -ph], [0, -1, -ph], [1, ph, 0], [-1, ph, 0], [1, -ph, 0], [-1, -ph, 0], [ph, 0, 1], [-ph, 0, 1], [ph, 0, -1], [-ph, 0, -1]];
    g.fillStyle = '#1b1d24';
    vs.forEach((v) => {
      const m = hyp(v[0], v[1], v[2]), lon = Math.atan2(v[2], v[0]), lat = Math.asin(v[1] / m);
      const cx = ((lon / TAU) + 0.5) * w, cy = (0.5 - lat / PI) * h, rx = 26 / Math.max(0.35, Math.cos(lat)), ry = 24;
      for (const o of [-w, 0, w]) { g.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU - PI / 2; const x = cx + o + Math.cos(a) * rx, y = cy + Math.sin(a) * ry; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); g.fill(); }
    });
    g.strokeStyle = 'rgba(80,84,92,.55)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, i * h / 5); g.lineTo(w, i * h / 5); g.stroke(); }
  }, { aniso: 2 });
}

/* ================================================================== three.js: the world */
const W3 = { nets: [], crowd: null, towers: [], redLights: null, fx: null, ready: false, level: 0 };
const TOWERS = [[-560, -332], [560, -332], [-560, 332], [560, 332]];

function arcPts(cx, cz, r, a0, a1, n) {
  const out = [];
  for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}
// The cage wall's centre lines, inner face at the playing area: two runs with the goal mouths left open
function wallPolys() {
  const Cn = CORNER, N = 9;
  const A = [[HL, GH + 4], [HL, HW - Cn]].concat(arcPts(HL - Cn, HW - Cn, Cn, 0, PI / 2, N), [[-HL + Cn, HW]], arcPts(-HL + Cn, HW - Cn, Cn, PI / 2, PI, N), [[-HL, GH + 4]]);
  const B = [[-HL, -GH - 4], [-HL, -(HW - Cn)]].concat(arcPts(-HL + Cn, -(HW - Cn), Cn, PI, 1.5 * PI, N), [[HL - Cn, -HW]], arcPts(HL - Cn, -(HW - Cn), Cn, 1.5 * PI, 2 * PI, N), [[HL, -GH - 4]]);
  return [A, B];
}
// A vertical band along a polyline, facing the middle of the pitch (or away from it with flip)
function wallStrip(polys, y0, y1, off, uPer, vPer, flip) {
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  polys.forEach((poly) => {
    let cum = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const p0 = poly[i], p1 = poly[i + 1];
      let tx = p1[0] - p0[0], tz = p1[1] - p0[1]; const len = hyp(tx, tz); if (len < 1e-6) continue; tx /= len; tz /= len;
      let nx = -tz, nz = tx; const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
      if (nx * -mx + nz * -mz < 0) { nx = -nx; nz = -nz; }
      const ox = -nx * off, oz = -nz * off, fx = flip ? -nx : nx, fz = flip ? -nz : nz;
      const u0 = cum / uPer, u1 = (cum + len) / uPer, vv = (y1 - y0) / vPer;
      pos.push(p0[0] + ox, y0, p0[1] + oz, p1[0] + ox, y0, p1[1] + oz, p1[0] + ox, y1, p1[1] + oz, p0[0] + ox, y1, p0[1] + oz);
      for (let k = 0; k < 4; k++) nor.push(fx, 0, fz);
      uv.push(u0, 0, u1, 0, u1, vv, u0, vv);
      if (fx * -tz + fz * tx > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      base += 4; cum += len;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
// The flat top of the wall between two offsets
function wallCap(polys, y, off0, off1) {
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  polys.forEach((poly) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const p0 = poly[i], p1 = poly[i + 1];
      let tx = p1[0] - p0[0], tz = p1[1] - p0[1]; const len = hyp(tx, tz); if (len < 1e-6) continue; tx /= len; tz /= len;
      let nx = -tz, nz = tx; const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
      if (nx * -mx + nz * -mz < 0) { nx = -nx; nz = -nz; }
      const a = [p0[0] - nx * off0, p0[1] - nz * off0], b = [p1[0] - nx * off0, p1[1] - nz * off0], c = [p1[0] - nx * off1, p1[1] - nz * off1], d = [p0[0] - nx * off1, p0[1] - nz * off1];
      pos.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], d[0], y, d[1]);
      for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      const ox = -nx, oz = -nz;
      if (tz * ox - tx * oz > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      base += 4;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
function polyPosts(polys, step) {
  const out = [];
  polys.forEach((poly) => {
    let total = 0; for (let i = 0; i < poly.length - 1; i++) total += hyp(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
    const n = Math.max(1, Math.round(total / step)), gap = total / n;
    let next = 0, cum = 0, k = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const p0 = poly[i], p1 = poly[i + 1], len = hyp(p1[0] - p0[0], p1[1] - p0[1]);
      while (k <= n && next <= cum + len + 1e-6) { const t = len ? (next - cum) / len : 0; out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); k++; next = k * gap; }
      cum += len;
    }
  });
  return out;
}
// A box with window-texture uvs scaled to its size (one cell of the texture is 16 units)
function winBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const sz = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let v = 0; v < 24; v++) {
    const f = (v / 4) | 0;
    if (f === 2 || f === 3) uv.setXY(v, 0.01, 0.5); else uv.setXY(v, uv.getX(v) * sz[f][0] / 128, uv.getY(v) * sz[f][1] / 128);
  }
  return g;
}

function buildWorld(Q) {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x151b30, 0.00041);
  const fogCol = scene.fog.color;
  void fogCol;

  /* sky */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5200, 32, 16), new THREE.MeshBasicMaterial({ map: texSky(), side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); W3.sky = sky;

  /* lights */
  const hemi = new THREE.HemisphereLight(0xb4c8ff, 0x2a3340, 1.05); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2d9, 2.7);
  key.position.set(150, 900, 210); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(Q.shadow, Q.shadow);
  const sc = key.shadow.camera; sc.left = -575; sc.right = 575; sc.top = 335; sc.bottom = -335; sc.near = 300; sc.far = 1700;
  key.shadow.bias = -0.0007; key.shadow.normalBias = 0.5; key.shadow.radius = 2.4;
  scene.add(key); scene.add(key.target); W3.key = key; W3.hemi = hemi;
  const rim = new THREE.DirectionalLight(0x9db8ff, 0.55); rim.position.set(-300, 400, -500); scene.add(rim); W3.rim = rim;

  /* turf and roof */
  const pitchTex = texPitch(); const grain = texGrain(); grain.repeat.set(1100 / 90, 680 / 90);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(1100, 680), new THREE.MeshStandardMaterial({ map: pitchTex, bumpMap: grain, bumpScale: 1.6, roughness: 0.93, metalness: 0, alphaTest: 0.5 }));
  pitch.rotation.x = -PI / 2; pitch.position.y = 0; pitch.receiveShadow = true; scene.add(pitch);
  const roofTex = texRoof();
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(1180, 740), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95 }));
  roof.rotation.x = -PI / 2; roof.position.y = -0.4; roof.receiveShadow = true; scene.add(roof);
  // the goal alcoves: green rubber floor, dark side and back walls
  const alc = new GB(), alcWall = new GB();
  [-1, 1].forEach((sx) => {
    alc.box(GD + 14, 1.2, GH * 2 + 16, M(sx * (HL + (GD + 14) / 2 - 4), 0.05, 0));
    alcWall.box(GD + 16, 66, 4, M(sx * (HL + (GD + 16) / 2 - 4), 33, GH + 8));
    alcWall.box(GD + 16, 66, 4, M(sx * (HL + (GD + 16) / 2 - 4), 33, -(GH + 8)));
    alcWall.box(4, 66, GH * 2 + 20, M(sx * (HL + GD + 6), 33, 0));
  });
  const alcM = new THREE.Mesh(alc.build(), new THREE.MeshStandardMaterial({ color: 0x1d6a3a, roughness: 0.95 })); alcM.receiveShadow = true; scene.add(alcM);
  scene.add(new THREE.Mesh(alcWall.build(), new THREE.MeshStandardMaterial({ color: 0x16304a, roughness: 0.6 })));

  /* the building under the roof, and the parapet */
  const winTex = texWindows();
  const host = new THREE.Mesh(winBox(1180, 560, 740), new THREE.MeshBasicMaterial({ map: winTex, color: 0xb8c4e8 }));
  host.position.set(0, -280.4, 0); scene.add(host);
  const par = new GB();
  par.box(1180, 26, 14, M(0, 12.6, -363)); par.box(1180, 26, 14, M(0, 12.6, 363)); par.box(14, 26, 740, M(-593, 12.6, 0)); par.box(14, 26, 740, M(593, 12.6, 0));
  par.box(1196, 3, 20, M(0, 26.6, -363)); par.box(1196, 3, 20, M(0, 26.6, 363)); par.box(20, 3, 760, M(-593, 26.6, 0)); par.box(20, 3, 760, M(593, 26.6, 0));
  scene.add(new THREE.Mesh(par.build(), new THREE.MeshStandardMaterial({ color: 0x575c67, roughness: 0.9 })));

  /* cage: boards, caps, mesh, posts */
  const polys = wallPolys();
  const boardTex = texBoards(); const BOARD_H = 34;
  const boardIn = new THREE.Mesh(wallStrip(polys, 0, BOARD_H, 0, 640, BOARD_H), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }));
  boardIn.castShadow = false; scene.add(boardIn);
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a5d80, roughness: 0.45, metalness: 0.4, side: THREE.DoubleSide });
  const outer = wallStrip(polys, 0, BOARD_H, 12, 100, 100, true);
  scene.add(new THREE.Mesh(outer, steel));
  scene.add(new THREE.Mesh(wallCap(polys, BOARD_H, 0, 12), new THREE.MeshStandardMaterial({ color: 0x7ea3c6, roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide })));
  const fenceTex = texFence(); fenceTex.repeat.set(1, 1);
  const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTex, color: 0x9fb2c8, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9fb6cc, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  // the fence is built in pieces so the side nearest the camera can step out of the way
  W3.fence = [];
  const pieceOf = (poly) => [poly.slice(0, 2), poly.slice(1, 11), poly.slice(10, 12), poly.slice(11, 21), poly.slice(20, 22)];
  polys.forEach((poly) => pieceOf(poly).forEach((pc) => {
    const grp = new THREE.Group();
    const f = new THREE.Mesh(wallStrip([pc], BOARD_H, ROOF, 6, 14, 14), fenceMat); f.renderOrder = 3; grp.add(f);
    const gb = new GB(), ps = polyPosts([pc], 112);
    ps.forEach((q) => gb.add(new THREE.CylinderGeometry(1.7, 1.9, ROOF, 8), M(q[0], ROOF / 2, q[1])));
    const pm = new THREE.Mesh(gb.build(), postMat); pm.castShadow = true; grp.add(pm);
    grp.add(new THREE.Mesh(wallStrip([pc], ROOF - 2.5, ROOF + 1, 6, 100, 100), postMat));
    const k = (pc.length - 1) >> 1, p0 = pc[k], p1 = pc[k + 1];
    let tx = p1[0] - p0[0], tz = p1[1] - p0[1]; const l = hyp(tx, tz) || 1; let nx = -tz / l, nz = tx / l;
    const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2; if (nx * -mx + nz * -mz < 0) { nx = -nx; nz = -nz; }
    scene.add(grp); W3.fence.push({ grp, mx, mz, nx, nz });
  }));
  // mesh over the goal mouths above the crossbar
  const mouthTop = [[[HL, -GH - 4], [HL, GH + 4]], [[-HL, GH + 4], [-HL, -GH - 4]]];
  const mouthFence = new THREE.Mesh(wallStrip(mouthTop, GOAL_H + 4, ROOF, 6, 14, 14), fenceMat); mouthFence.renderOrder = 3; scene.add(mouthFence);

  /* goals */
  const goalMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f1, roughness: 0.35, metalness: 0.3 });
  const netTex = texNet();
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, color: 0xe9eff4, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  [-1, 1].forEach((sx) => {
    const bx = sx * HL, ex = sx * (HL + GD), gb = new GB();
    const tube = (ax, ay, az, bx2, by, bz, r) => gb.add(new THREE.CylinderGeometry(r, r, 1, 8), tubeM(ax, ay, az, bx2, by, bz));
    [-1, 1].forEach((sz) => {
      tube(bx, 0, sz * GH, bx, GOAL_H, sz * GH, 3.3);
      tube(bx, GOAL_H, sz * GH, ex, GOAL_H, sz * GH, 1.8);
      tube(ex, 0, sz * GH, ex, GOAL_H, sz * GH, 1.8);
      tube(bx, 0.8, sz * GH, ex, 0.8, sz * GH, 1.5);
    });
    tube(bx, GOAL_H, -GH, bx, GOAL_H, GH, 3);
    tube(ex, GOAL_H, -GH, ex, GOAL_H, GH, 1.8);
    tube(ex, 0.8, -GH, ex, 0.8, GH, 1.5);
    const frame = new THREE.Mesh(gb.build(), goalMat); frame.castShadow = true; scene.add(frame);
    scene.add(makeNet(sx, bx, ex, netMat));
  });

  /* floodlight towers */
  buildTowers();

  /* terrace and crowd, benches, rooftop clutter */
  buildTerrace(Q);
  buildClutter();

  /* the night city around the roof */
  buildCity(winTex);

  W3.ready = true;
}

function makeNet(sx, bx, ex, mat) {
  const P = [], U = [], I = [], WK = [], BY = [], BZ = [];
  let base = 0;
  const panel = (ox, oy, oz, ux, uy, uz, vx, vy, vz, nu, nv, back) => {
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const x = ox + ux * i / nu + vx * j / nv, y = oy + uy * i / nu + vy * j / nv, z = oz + uz * i / nu + vz * j / nv;
      P.push(x, y, z); U.push(i, j);
      WK.push(back ? 1 : 0.6 * abs(x - bx) / GD); BY.push(z); BZ.push(y);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      I.push(a, b, d, a, d, c);
    }
    base += (nu + 1) * (nv + 1);
  };
  panel(ex, 0, -GH, 0, 0, GH * 2, 0, GOAL_H, 0, 20, 8, true);
  panel(bx, GOAL_H, -GH, 0, 0, GH * 2, sx * GD, 0, 0, 20, 6, false);
  panel(bx, 0, -GH, sx * GD, 0, 0, 0, GOAL_H, 0, 6, 8, false);
  panel(bx, 0, GH, sx * GD, 0, 0, 0, GOAL_H, 0, 6, 8, false);
  const g = new THREE.BufferGeometry();
  const pa = new THREE.Float32BufferAttribute(P, 3); pa.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(sx * (HL + GD / 2), GOAL_H / 2, 0), 120);
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
  W3.nets[sx > 0 ? 1 : 0] = { mesh, base: new Float32Array(P), wk: new Float32Array(WK), by: new Float32Array(BY), bz: new Float32Array(BZ), sx, live: false };
  return mesh;
}
function rippleNets() {
  for (let k = 0; k < 2; k++) {
    const N = W3.nets[k], n = S.nets[k]; if (!N) continue;
    const pos = N.mesh.geometry.attributes.position, a = pos.array, base = N.base;
    if (n.amp > 0.01) {
      for (let i = 0, v = 0; v < N.wk.length; v++, i += 3) {
        const dy = N.by[v] - n.y, dz = N.bz[v] - n.z, d2 = dy * dy + dz * dz;
        a[i] = base[i] + N.sx * n.amp * 11 * Math.exp(-d2 / 3600) * Math.sin(n.t * 26 - Math.sqrt(d2) * 0.07) * N.wk[v];
        a[i + 1] = base[i + 1]; a[i + 2] = base[i + 2];
      }
      pos.needsUpdate = true; N.live = true;
    } else if (N.live) { a.set(base); pos.needsUpdate = true; N.live = false; }
  }
}

function buildTowers() {
  const poles = new GB(), bulbs = new GB();
  const steelC = C('#3a3f48'), dark = C('#23272e'), bulbC = C('#fffbe8');
  const tmp = new THREE.Matrix4();
  TOWERS.forEach((t) => {
    const tx = t[0], tz = t[1];
    poles.add(new THREE.CylinderGeometry(2.2, 3.8, 330, 10), M(tx, 165, tz), steelC);
    poles.add(new THREE.CylinderGeometry(6, 7, 6, 10), M(tx, 3, tz), dark);
    [90, 190, 280].forEach((y) => poles.add(new THREE.TorusGeometry(3.6 - y * 0.0045, 0.9, 5, 12), M(tx, y, tz, PI / 2), dark));
    const yaw = Math.atan2(-tx, -tz);
    const H = M(tx, 338, tz, 0, yaw, 0).multiply(M(0, 0, 0, 0.42, 0, 0));
    poles.add(new THREE.BoxGeometry(74, 46, 4), tmp.copy(H).multiply(M(0, 0, 0)), steelC);
    poles.add(new THREE.BoxGeometry(6, 40, 14), tmp.copy(H).multiply(M(0, -16, -9)), dark);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) bulbs.add(new THREE.BoxGeometry(11, 10, 2.4), tmp.copy(H).multiply(M(-28 + c * 14, -14 + r * 14, 3.4)), bulbC);
    W3.towers.push({ x: tx, y: 338, z: tz });
  });
  scene.add(new THREE.Mesh(poles.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 })));
  scene.add(new THREE.Mesh(bulbs.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: 0xffffff })));
  const glowTex = texGlow();
  W3.towers.forEach((t) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1cc, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    sp.position.set(t.x * 0.97, t.y - 2, t.z * 0.97); sp.scale.set(190, 190, 1); sp.renderOrder = 4; scene.add(sp); (W3.glows = W3.glows || []).push(sp);
  });
  // soft cones of light from each head to the middle of the pitch
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(1, 0.95, 0.78) }, k: { value: 0.085 } },
    vertexShader: 'attribute float t; varying vec3 vN; varying vec3 vV; varying float vT; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); vT = t; gl_Position = projectionMatrix*viewMatrix*wp; }',
    fragmentShader: 'uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vV; varying float vT; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 1.6) * (1.0 - vT) * (1.0 - vT) * k; gl_FragColor = vec4(col * a, 1.0); }',
  });
  const cones = [];
  W3.towers.forEach((t) => {
    const aim = new THREE.Vector3(-t.x * 0.28, 0, -t.z * 0.28), apex = new THREE.Vector3(t.x * 0.96, t.y - 6, t.z * 0.96);
    const len = apex.distanceTo(aim) * 1.12, rad = len * Math.tan(0.4), seg = 28;
    const pos = [], nor = [], tt = [];
    const ca = Math.cos(Math.atan(0.4)), sa = Math.sin(Math.atan(0.4));
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      pos.push(0, 0, 0, Math.cos(a0) * rad, Math.sin(a0) * rad, len, Math.cos(a1) * rad, Math.sin(a1) * rad, len);
      tt.push(0, 1, 1);
      [a0, a0, a1].forEach((a) => nor.push(Math.cos(a) * ca, Math.sin(a) * ca, -sa));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('t', new THREE.Float32BufferAttribute(tt, 1));
    const m = new THREE.Mesh(g, coneMat); m.position.copy(apex); m.lookAt(aim); m.frustumCulled = false; m.renderOrder = 5; scene.add(m); cones.push(m);
  });
  W3.cones = cones;
}

function buildTerrace(Q) {
  // three stepped tiers behind each long side, with people on them
  const gb = new GB(), conc = C('#3b414d'), lip = C('#575e6b');
  const tiers = 3, tierD = 17, z0 = 300;
  [-1, 1].forEach((sz) => {
    for (let i = 0; i < tiers; i++) {
      const hgt = 12 * (i + 1), zc = sz * (z0 + tierD * i + tierD / 2);
      gb.box(900, hgt, tierD, M(0, hgt / 2, zc), conc);
      gb.box(900, 1.6, tierD, M(0, hgt + 0.8, zc), lip);
    }
    gb.box(900, 56, 4, M(0, 28, sz * 354), conc);
  });
  const terr = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })); terr.receiveShadow = true; scene.add(terr);
  // the crowd: one capsule body and one head per person
  const pts = [];
  [-1, 1].forEach((sz) => {
    for (let i = 0; i < tiers; i++) {
      const hgt = 12 * (i + 1) + 1.6, zc = sz * (z0 + tierD * i + tierD / 2);
      for (let x = -432; x <= 432; x += 12.6) { if (hash01(x * 3.1 + i * 17 + sz * 5) < 0.12) continue; pts.push({ x: x + (hash01(x + i) - 0.5) * 4, y: hgt, z: zc + (hash01(x * 2 + i) - 0.5) * 3, ph: hash01(x * 7 + i * 3 + sz) * TAU, s: 0.9 + hash01(x * 5 + i) * 0.25 }); }
    }
  });
  const n = pts.length;
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(2.8, 4.4, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const tmp = new THREE.Color();
  pts.forEach((p, i) => { tmp.set(SKINS[(hash01(i * 1.7) * 5) | 0]); heads.setColorAt(i, tmp); tmp.set('#ffffff'); bodies.setColorAt(i, tmp); });
  bodies.frustumCulled = false; heads.frustumCulled = false;
  scene.add(bodies); scene.add(heads);
  W3.crowd = { pts, bodies, heads, n };

  // benches on the near side
  const bg = new GB(), wood = C('#4b505b');
  [-270, 250].forEach((x) => {
    bg.box(78, 3, 11, M(x, 8, 305.5), wood); bg.box(78, 12, 2.4, M(x, 15, 311), wood);
    [-34, 34].forEach((dx) => bg.box(3, 8, 9, M(x + dx, 4, 305.5), C('#30343c')));
  });
  bg.box(16, 14, 12, M(-440, 7, 311), C('#26566b')); bg.box(14, 10, 10, M(-418, 5, 311), C('#6c4a2d')); bg.box(12, 10, 10, M(-411, 15, 311), C('#6c4a2d'));
  scene.add(new THREE.Mesh(bg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
}

function buildClutter() {
  const gb = new GB(), tank = C('#8fa6b8'), tankD = C('#4b6173'), ac = C('#7d8590'), fan = C('#2c3036'), metal = C('#a7aeb9');
  [[-562, -205], [562, 205], [-562, 190], [562, -190]].forEach((t) => {
    gb.add(new THREE.CylinderGeometry(19, 19, 34, 18), M(t[0], 17, t[1]), tank);
    gb.add(new THREE.CylinderGeometry(1, 19.5, 8, 18), M(t[0], 38, t[1]), tankD);
    [0, 1, 2, 3].forEach((k) => gb.add(new THREE.CylinderGeometry(1.2, 1.2, 12, 5), M(t[0] + Math.cos(k * PI / 2 + 0.7) * 13, 6, t[1] + Math.sin(k * PI / 2 + 0.7) * 13), metal));
  });
  [[-566, -100], [566, 100], [-566, 105], [566, -105]].forEach((t) => {
    gb.box(26, 18, 22, M(t[0], 9, t[1]), ac);
    gb.add(new THREE.CylinderGeometry(7, 7, 1.2, 16), M(t[0], 18.4, t[1]), fan);
    gb.box(2, 2, 22, M(t[0], 19.4, t[1]), metal);
  });
  [[-575, -30], [575, 30]].forEach((t) => gb.add(new THREE.CylinderGeometry(0.9, 0.9, 64, 5), M(t[0], 32, t[1]), metal));
  scene.add(new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })));
  const rl = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a2e, toneMapped: false }));
  const rl2 = rl.clone(); rl.position.set(-575, 66, -30); rl2.position.set(575, 66, 30); scene.add(rl); scene.add(rl2);
  W3.redLights = [rl, rl2];
}

function buildCity(winTex) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshBasicMaterial({ map: texCityFloor() }));
  floor.material.map.repeat.set(14, 14);
  floor.rotation.x = -PI / 2; floor.position.y = -540; scene.add(floor);
  const R = Arcade.rng(404);
  const classes = [150, 240, 340, 470, 640, 820], base = -540;
  const lists = classes.map(() => []);
  for (let tries = 0; tries < 900 && lists.reduce((a, l) => a + l.length, 0) < 150; tries++) {
    const ang = R() * TAU, dist = 760 + R() * 3000;
    const x = Math.cos(ang) * dist * 1.25, z = Math.sin(ang) * dist;
    if (abs(x) < 720 && abs(z) < 470) continue;
    const ci = Math.min(5, (R() * R() * 6 + (dist > 1500 ? R() * 2 : 0)) | 0);
    const top = base + classes[ci];
    if (hyp(x, z) < 1500 && top > -150) continue;
    if (abs(x) < 1100 && abs(z) > 380 && hyp(x, z) < 1900 && top > -150) continue;
    lists[ci].push({ x, z, s: 0.8 + R() * 0.8, sy: R() < 0.5 ? 0 : PI / 2, tint: 0.55 + R() * 0.7, hue: R() });
  }
  const tmp = new THREE.Color(), mm = new THREE.Matrix4();
  classes.forEach((h, ci) => {
    const list = lists[ci]; if (!list.length) return;
    const geo = winBox(150, h, 150);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: winTex }), list.length);
    list.forEach((b, i) => {
      mm.compose(_p.set(b.x, base + h / 2, b.z), _q.setFromEuler(_e.set(0, b.sy, 0)), _s.set(b.s, 1, b.s * (0.8 + b.hue * 0.5)));
      mesh.setMatrixAt(i, mm);
      tmp.setHSL(0.55 + b.hue * 0.18 - (b.hue > 0.8 ? 0.55 : 0), 0.25, 0.5 * b.tint + 0.1); mesh.setColorAt(i, tmp);
    });
    mesh.frustumCulled = false; scene.add(mesh);
  });
  // a few neon signs
  const sign = (text, col, x, y, z, ry, w) => {
    const t = canvasTex(512, 128, (g, cw, ch) => {
      g.fillStyle = '#080a12'; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(8, 8, cw - 16, ch - 16);
      g.fillStyle = col; g.font = '800 62px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cw / 2, ch / 2 + 3);
    }, { aniso: 2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
  };
  sign('KINGS CUP', '#ff9a3c', -1050, -20, -1150, 0.5, 380);
  sign('ROOFTOP LEAGUE', '#4de0ff', 1200, 60, -900, -0.7, 420);
  sign('TURF KINGS', '#ff5fa8', 100, -90, 1500, PI, 360);
}

/* ================================================================== three.js: players, ball, shadows, particles */
const RIGS = [];
const ATL = { cv: null, tex: null, mat: null };
const FX = { ball: null, spinQ: new THREE.Quaternion(), px: 0, py: 0, pz: 0, ring: null, arrow: null, target: null, marks: [], shadow: null, puff: null, conf: null, trail: null, flash: 0 };
const _bq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _ax = new THREE.Vector3(), _mm = new THREE.Matrix4(), _col = new THREE.Color();
const ZAX = new THREE.Vector3(0, 0, 1);
const WHITE_UV = [0.875, 0.125];

function cellUV(i) {
  const col = i % 4, row = (i / 4) | 0;
  return [col / 4 + 0.004, (col + 1) / 4 - 0.004, 1 - (row + 1) / 4 + 0.004, 1 - row / 4 - 0.004];
}
function drawAtlas() {
  const g = ATL.cv.getContext('2d');
  g.clearRect(0, 0, 512, 512);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 96px Inter, Arial, sans-serif';
  for (let i = 0; i < 10; i++) {
    const p = S.players[i], kit = S.kits[p.team], gk = p.role === 'GK';
    const shirt = gk ? kit.gk : kit.c1, trim = gk ? kit.gkTrim : kit.c2;
    let ink = colDist(shirt, '#ffffff') < 190 ? '#15151a' : '#ffffff';
    if (colDist(shirt, trim) > 200 && !gk) ink = trim;
    g.fillStyle = ink; g.fillText(String(p.num), (i % 4) * 128 + 64, ((i / 4) | 0) * 128 + 68);
  }
  g.fillStyle = '#ffffff'; g.fillRect(384, 384, 128, 128);
  ATL.tex.needsUpdate = true;
}
// One player's three pieces (body, a leg, an arm) in kit colours with the shirt number
function playerGeos(p) {
  const kit = S.kits[p.team], gk = p.role === 'GK';
  const shirt = C(gk ? kit.gk : kit.c1), trim = C(gk ? kit.gkTrim : kit.c2), shorts = C(gk ? '#1b1b22' : kit.shorts), sock = C(gk ? kit.gk : kit.sock);
  const skin = C(p.skin), hair = C(p.hair), boot = C('#17171d'), eye = C('#1a1410'), glove = gk ? C(kit.gkTrim === '#1b1b22' ? '#f4f4f4' : kit.gkTrim) : skin;
  const white = C('#ffffff');
  const up = new GB(), leg = new GB(), arm = new GB();
  // body (origin at the hip)
  up.add(new THREE.BoxGeometry(10.6, 6.4, 6.6), M(0, 2.4, 0), shorts, WHITE_UV);
  up.add(new THREE.CylinderGeometry(5.7, 4.9, 15, 12), M(0, 12.4, 0, 0, 0, 0, 1.14, 1, 0.74), shirt, WHITE_UV);
  up.add(new THREE.CylinderGeometry(5.0, 5.0, 1.8, 12), M(0, 5.6, 0, 0, 0, 0, 1.14, 1, 0.74), trim, WHITE_UV);
  up.add(new THREE.SphereGeometry(3.1, 8, 6), M(-6.3, 17.6, 0), shirt, WHITE_UV);
  up.add(new THREE.SphereGeometry(3.1, 8, 6), M(6.3, 17.6, 0), shirt, WHITE_UV);
  up.add(new THREE.CylinderGeometry(1.8, 2.1, 3.2, 8), M(0, 20.2, 0), skin, WHITE_UV);
  up.add(new THREE.TorusGeometry(2.7, 0.7, 5, 12), M(0, 19.5, 0, PI / 2), trim, WHITE_UV);
  up.add(new THREE.SphereGeometry(4.9, 14, 10), M(0, 25.2, 0.2, 0, 0, 0, 0.94, 1.05, 1), skin, WHITE_UV);
  up.add(new THREE.SphereGeometry(5.15, 14, 8, 0, TAU, 0, PI * 0.56), M(0, 25.6, -0.55, -0.22), hair, WHITE_UV);
  up.add(new THREE.SphereGeometry(0.62, 6, 5), M(-1.9, 25.7, 4.5), eye, WHITE_UV);
  up.add(new THREE.SphereGeometry(0.62, 6, 5), M(1.9, 25.7, 4.5), eye, WHITE_UV);
  // the numbers: big on the back, small on the chest
  const back = new THREE.PlaneGeometry(7.6, 7.6), cu = cellUV(p.i), buv = back.attributes.uv;
  for (let k = 0; k < buv.count; k++) buv.setXY(k, lerp(cu[0], cu[1], buv.getX(k)), lerp(cu[2], cu[3], buv.getY(k)));
  up.add(back, M(0, 13.2, -4.35, 0, PI), white);
  const chest = new THREE.PlaneGeometry(3.6, 3.6), cuv = chest.attributes.uv;
  for (let k = 0; k < cuv.count; k++) cuv.setXY(k, lerp(cu[0], cu[1], cuv.getX(k)), lerp(cu[2], cu[3], cuv.getY(k)));
  up.add(chest, M(2.9, 15.4, 4.42), white);
  // leg (origin at the hip, hanging down)
  leg.add(new THREE.CylinderGeometry(3.7, 3.2, 9.4, 8), M(0, -4.6, 0), shorts, WHITE_UV);
  leg.add(new THREE.CylinderGeometry(2.7, 2.35, 11.8, 8), M(0, -14.7, 0), sock, WHITE_UV);
  leg.add(new THREE.CylinderGeometry(2.85, 2.85, 1.8, 8), M(0, -9.8, 0), trim, WHITE_UV);
  leg.add(new THREE.BoxGeometry(3.9, 2.8, 8.6), M(0, -21.6, 1.7), boot, WHITE_UV);
  // arm (origin at the shoulder, hanging down)
  arm.add(new THREE.CylinderGeometry(2.3, 2.0, 6.8, 8), M(0, -3.2, 0), shirt, WHITE_UV);
  arm.add(new THREE.CylinderGeometry(1.75, 1.55, 7.2, 8), M(0, -10.2, 0), skin, WHITE_UV);
  arm.add(new THREE.SphereGeometry(gk ? 3 : 2.1, 8, 6), M(0, -14.4, 0), glove, WHITE_UV);
  return { up: up.build(), leg: leg.build(), arm: arm.build() };
}
function buildRigs() {
  ATL.cv = document.createElement('canvas'); ATL.cv.width = 512; ATL.cv.height = 512;
  ATL.tex = new THREE.CanvasTexture(ATL.cv); ATL.tex.colorSpace = THREE.SRGBColorSpace; ATL.tex.generateMipmaps = false; ATL.tex.minFilter = THREE.LinearFilter; ATL.tex.magFilter = THREE.LinearFilter;
  ATL.mat = new THREE.MeshStandardMaterial({ map: ATL.tex, vertexColors: true, roughness: 0.72, metalness: 0, alphaTest: 0.5 });
  for (let i = 0; i < 10; i++) {
    const root = new THREE.Group(), tilt = new THREE.Group();
    const mk = () => { const m = new THREE.Mesh(new THREE.BufferGeometry(), ATL.mat); m.castShadow = true; m.frustumCulled = false; return m; };
    const up = mk(), legL = mk(), legR = mk(), armL = mk(), armR = mk();
    legL.position.set(-3.4, 0, 0); legR.position.set(3.4, 0, 0); armL.position.set(-6.3, 17.6, 0); armR.position.set(6.3, 17.6, 0);
    tilt.add(up, legL, legR, armL, armR); tilt.position.y = 23; root.add(tilt); scene.add(root);
    RIGS.push({ root, tilt, up, legL, legR, armL, armR, yaw: 0, ph: i * 1.7 });
  }
}
function applyKits() {
  drawAtlas();
  for (let i = 0; i < 10; i++) {
    const r = RIGS[i], g = playerGeos(S.players[i]);
    [r.up.geometry, r.legL.geometry, r.armL.geometry].forEach((o) => o.dispose());
    r.up.geometry = g.up; r.legL.geometry = g.leg; r.legR.geometry = g.leg; r.armL.geometry = g.arm; r.armR.geometry = g.arm;
  }
}
function buildFx(Q) {
  // ball
  const bt = texBall();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR * 1.08, 24, 16), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.42, metalness: 0 }));
  ball.castShadow = true; scene.add(ball); FX.ball = ball;
  // trail
  const trail = new THREE.InstancedMesh(new THREE.SphereGeometry(BR * 0.95, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }), 6);
  trail.frustumCulled = false; trail.count = 0; scene.add(trail); FX.trail = trail;
  // cursor ring, arrow, pass target ring
  const ringG = new THREE.RingGeometry(14.5, 18, 40); ringG.rotateX(-PI / 2);
  const mkRing = (hex, o) => { const m = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.renderOrder = 6; m.visible = false; scene.add(m); return m; };
  FX.ring = mkRing(0xffd23d, 0.95); FX.target = mkRing(0x59e0ff, 0.9);
  const coneG = new THREE.ConeGeometry(4.6, 9, 4); coneG.rotateX(PI);
  FX.arrow = new THREE.Mesh(coneG, new THREE.MeshBasicMaterial({ color: 0xffd23d, toneMapped: false })); FX.arrow.visible = false; FX.arrow.renderOrder = 7; scene.add(FX.arrow);
  const mg = new THREE.RingGeometry(5, 7.5, 24); mg.rotateX(-PI / 2);
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; m.renderOrder = 6; scene.add(m); FX.marks.push({ m, age: 9, life: 0.5 }); }
  // soft shadows from each floodlight tower plus a contact blob
  const blob = texBlob();
  const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-PI / 2);
  const N = 51; sg.setAttribute('instA', new THREE.InstancedBufferAttribute(new Float32Array(N), 1));
  const sm = patchAlpha(new THREE.MeshBasicMaterial({ map: blob, color: 0x02050a, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  FX.shadow = new THREE.InstancedMesh(sg, sm, N); FX.shadow.frustumCulled = false; FX.shadow.renderOrder = 1; FX.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(FX.shadow);
  // particles: soft puffs and confetti
  const pg = new THREE.PlaneGeometry(1, 1); pg.setAttribute('instA', new THREE.InstancedBufferAttribute(new Float32Array(PT.length), 1));
  const pm = patchAlpha(new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
  FX.puff = new THREE.InstancedMesh(pg, pm, PT.length); FX.puff.frustumCulled = false; FX.puff.count = 0; FX.puff.renderOrder = 8; scene.add(FX.puff);
  FX.puff.setColorAt(0, _col.set('#ffffff'));
  FX.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), PT.length); FX.conf.frustumCulled = false; FX.conf.count = 0; FX.conf.renderOrder = 8; scene.add(FX.conf);
  FX.conf.setColorAt(0, _col.set('#ffffff'));
  void Q;
}
function markAt(x, y, kind) {
  if (!FX.marks.length) return;
  let k = FX.marks[0]; for (const q of FX.marks) if (q.age > k.age) k = q;
  k.age = 0; k.m.position.set(x, 0.4, y); k.m.material.color.set(kind === 0 ? '#59e0ff' : kind === 1 ? '#ff9a3c' : '#ff5fa8'); k.m.visible = true;
}

function posePlayer(i, p, dt, snap) {
  const r = RIGS[i], tilt = r.tilt;
  const spd = hyp(p.vx, p.vy), amp = Math.min(1.25, spd / 150);
  const target = Math.atan2(p.fx, p.fy);
  let d = target - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  r.yaw = snap ? target : r.yaw + d * Math.min(1, dt * 15);
  r.root.rotation.y = r.yaw;
  const t = S.t + i * 0.37;
  let legA = Math.sin(p.phase) * 1.0 * amp, legB = -legA, armA = -legA * 0.85, armB = legA * 0.85;
  let lean = 0.16 * amp, hop = 0, y = 23 + Math.abs(Math.sin(p.phase)) * 1.3 * amp, roll = 0, armZ = 0.1, armXadd = 0;
  const gk = p.role === 'GK';
  if (spd < 6) { y += Math.sin(t * 2.2) * 0.25; armA = armB = -0.12; }
  if (gk && !p.diving) { armZ = 0.55; armXadd = -0.35; }
  if (p.kickT > 0) { const k = 1 - p.kickT / 0.22; legB = -1.55 * Math.sin(k * PI); legA = 0.5 * Math.sin(k * PI); lean -= 0.18 * Math.sin(k * PI); }
  if (p.tackleAnim > 0) { const k = 1 - p.tackleAnim / 0.25; legB = -1.4 * Math.sin(k * PI); lean += 0.45 * Math.sin(k * PI); }
  if (p.cheer > 0) { hop = Math.abs(Math.sin(S.t * 11 + i)) * 5; armZ = 2.75; armA = armB = 0; lean = 0; }
  // lying down: slide tackle, stunned, or a diving keeper
  let lie = 0;
  if (p.slideT > 0) lie = Math.min(1, (0.5 - p.slideT) / 0.1 + 0.2) * (p.slideT < 0.12 ? p.slideT / 0.12 : 1);
  else if (p.stunT > 0.05) lie = Math.min(1, p.stunT / 0.25) * 0.9;
  if (lie > 0) {
    tilt.rotation.x = -1.38 * lie; y = lerp(y, 7.5, lie); legA = legB = -0.2 * lie; armA = armB = -2.3 * lie; armZ = 0.25; lean = 0;
  }
  if (p.diving) {
    const e = p.diveE; const da = Math.min(1, e / 0.2) * (1 - Math.pow(clamp((e - 0.55) / 0.3, 0, 1), 2));
    const dirW = p.diveDir; const lx = Math.cos(r.yaw), lz = -Math.sin(r.yaw);
    const s = dirW * lz; // sideways component along the keeper's local x
    roll = -s * 1.5 * da * (p.diveDir === 0 ? 0 : 1);
    y = lerp(y, 18, da); hop = Math.sin(Math.min(1, e / 0.5) * PI) * (p.diveDir === 0 ? 16 : 9);
    armA = armB = -2.6 * da; armZ = 0.15; legA = -0.3 * da; legB = 0.3 * da; lean = 0;
    void lx;
  }
  if (lie <= 0) tilt.rotation.x = lean;
  tilt.rotation.z = roll;
  tilt.position.y = y;
  r.root.position.set(p.x, hop, p.y);
  r.legL.rotation.x = -legA; r.legR.rotation.x = -legB;
  r.armL.rotation.x = armA + armXadd; r.armR.rotation.x = armB + armXadd;
  r.armL.rotation.z = -armZ; r.armR.rotation.z = armZ;
}

const TW_H = 338;
function syncShadows(visible) {
  const sh = FX.shadow, a = sh.geometry.attributes.instA.array;
  let n = 0;
  const put = (x, z, yaw, lx, lz, al) => {
    _q.setFromAxisAngle(UPV, yaw); _mm.compose(_p.set(x, 0.12, z), _q, _s.set(lx, 1, lz)); sh.setMatrixAt(n, _mm); a[n] = al; n++;
  };
  for (let i = 0; i < 10; i++) {
    const p = S.players[i];
    if (!visible[i]) { for (let k = 0; k < 5; k++) put(0, 0, 0, 0.001, 0.001, 0); continue; }
    const lie = p.slideT > 0 || p.stunT > 0.1 || p.diving;
    put(p.x, p.y, 0, lie ? 34 : 27, lie ? 22 : 27, 0.4);
    for (let k = 0; k < 4; k++) {
      const tw = TOWERS[k], dx = p.x - tw[0], dz = p.y - tw[1], dist = hyp(dx, dz) || 1;
      const hh = lie ? 16 : 49, len = clamp(hh * dist / (TW_H - hh), 6, 120);
      const ux = dx / dist, uz = dz / dist;
      put(p.x + ux * len * 0.5, p.y + uz * len * 0.5, -Math.atan2(uz, ux), len + 14, lie ? 22 : 20, 0.12 * (1 - clamp(dist / 1500, 0, 1) * 0.6));
    }
  }
  const b = S.ball, sc = clamp(1 - b.z / 220, 0.35, 1);
  put(b.x + b.z * 0.18, b.y + b.z * 0.18, 0, 17 * (1.2 - sc * 0.4), 17 * (1.2 - sc * 0.4), 0.5 * sc);
  sh.count = n; sh.instanceMatrix.needsUpdate = true; sh.geometry.attributes.instA.needsUpdate = true;
}
function syncParticles() {
  const puff = FX.puff, conf = FX.conf, pa = puff.geometry.attributes.instA.array;
  let np = 0, nc = 0;
  for (let i = 0; i < PT.length; i++) {
    const q = PT[i]; if (!q.a) continue;
    const a = clamp(q.life / q.max, 0, 1);
    if (q.kind === 1) {
      _cq.setFromAxisAngle(ZAX, q.rot); _bq.copy(camera.quaternion).multiply(_cq);
      const flip = abs(Math.cos(q.rot * 0.7));
      _mm.compose(_p.set(q.x, q.z, q.y), _bq, _s.set(q.size * 1.1, q.size * 0.66 * (0.3 + flip), 1));
      conf.setMatrixAt(nc, _mm); conf.setColorAt(nc, _col.set(q.col)); nc++;
    } else {
      const sz = q.kind === 0 ? q.size * (1.6 - a) * 2.4 : q.size * 1.5;
      _mm.compose(_p.set(q.x, q.z + 1.5, q.y), camera.quaternion, _s.set(sz, sz, 1));
      puff.setMatrixAt(np, _mm); puff.setColorAt(np, _col.set(q.col)); pa[np] = q.kind === 0 ? a * 0.5 : a; np++;
    }
  }
  puff.count = np; conf.count = nc;
  if (np) { puff.instanceMatrix.needsUpdate = true; if (puff.instanceColor) puff.instanceColor.needsUpdate = true; puff.geometry.attributes.instA.needsUpdate = true; }
  if (nc) { conf.instanceMatrix.needsUpdate = true; if (conf.instanceColor) conf.instanceColor.needsUpdate = true; }
}

/* ================================================================== camera, projection, per-frame sync */
const _pv = new THREE.Vector3(), _pd = new THREE.Vector3();
// pitch point -> pixels in the stage (false when it is behind the camera)
function projectScreen(x, y, z, out) {
  if (!camera) return false;
  _pv.set(x, z, y).applyMatrix4(camera.matrixWorldInverse);
  if (_pv.z > -1) return false;
  _pv.applyMatrix4(camera.projectionMatrix);
  out.x = (_pv.x * 0.5 + 0.5) * arc.w; out.y = (-_pv.y * 0.5 + 0.5) * arc.h;
  return true;
}
// pixels in the stage -> the point on the grass under them
function screenToGround(px, py, out) {
  if (!camera || !arc.w) return false;
  _pv.set(px / arc.w * 2 - 1, -(py / arc.h * 2 - 1), 0.5).unproject(camera);
  _pd.copy(_pv).sub(camera.position);
  if (_pd.y > -1e-4) return false;
  const t = -camera.position.y / _pd.y;
  out.x = camera.position.x + _pd.x * t; out.y = camera.position.z + _pd.z * t;
  return true;
}

function layout(w, h) {
  const pen = !!(S && S.phase === 'penalties');
  const portrait = pen ? true : h > w * 0.98;
  const f = pen ? 1 : (S ? S.dir[0] : 1);
  if (portrait !== V.portrait || f !== V.f) { setLook(portrait, f); CAM.snap = true; }
  const key = w + 'x' + h;
  if (key !== CAM.key) { CAM.key = key; CAM.snap = true; }
}
function camStep(dt) {
  const w = arc.w, h = arc.h, asp = w / h, b = S.ball;
  const pen = S.phase === 'penalties';
  if (pen !== CAM.pen) { CAM.pen = pen; CAM.snap = true; }
  let vfov;
  const sx = (arc.shakeX || 0) * 0.7, sy = (arc.shakeY || 0) * 0.7;
  if (pen) {
    const wide = asp > 1;
    vfov = wide ? 40 : 54;
    const hf = 2 * Math.atan(Math.tan(vfov * PI / 360) * asp);
    const dist = clamp(((wide ? 340 : 270) / 2) / Math.tan(hf / 2), 240, 600);
    if (camera.fov !== vfov) { camera.fov = vfov; camera.updateProjectionMatrix(); }
    camera.position.set(HL - 30 - dist, 92 + dist * 0.2 + sy, -42 + sx);
    camera.lookAt(HL - 30, 24, 0);
    camera.updateMatrixWorld();
    return;
  }
  vfov = V.portrait ? 54 : 36;
  const elevDeg = V.portrait ? 50 : (S.demo ? 22 : 30);
  let tx = b.x + clamp(b.vx * 0.2, -90, 90), ty = b.y + clamp(b.vy * 0.2, -90, 90), zm = 1;
  if (S.phase === 'goal' && S.goalP) { tx = S.goalP.x * 0.6 + b.x * 0.4; ty = S.goalP.y * 0.6 + b.y * 0.4; zm = arc.reducedMotion ? 1.1 : 1.28; }
  else if (S.last30) zm = 1.06;
  if (S.demo) zm = 0.92;
  if (V.portrait) { tx += V.lx * 70; ty += V.ly * 70; }
  if (V.portrait) { tx = clamp(tx, -(HL - 110), HL - 110); ty = clamp(ty, -(HW - 150), HW - 150); }
  else { tx = clamp(tx, -(HL - 240), HL - 240); ty = clamp(ty, -(HW - 170), HW - 170); }
  const snap = CAM.snap;
  const kf = snap ? 1 : 1 - Math.exp(-(arc.reducedMotion ? 2.4 : 4.6) * dt);
  CAM.tx += (tx - CAM.tx) * kf; CAM.ty += (ty - CAM.ty) * kf;
  CAM.zm += (zm - CAM.zm) * (snap ? 1 : 1 - Math.exp(-2.4 * dt));
  CAM.snap = false;
  const hf = 2 * Math.atan(Math.tan(vfov * PI / 360) * asp);
  const Wd = (V.portrait ? 400 : 900) / CAM.zm;
  const d = clamp((Wd / 2) / Math.tan(hf / 2), 380, 1700);
  const el = elevDeg * PI / 180, dh = d * Math.cos(el), dv = d * Math.sin(el);
  if (camera.fov !== vfov) { camera.fov = vfov; camera.updateProjectionMatrix(); }
  camera.position.set(CAM.tx - V.lx * dh + sx * V.rx, dv + sy, CAM.ty - V.ly * dh + sx * V.ry);
  camera.lookAt(CAM.tx, 0, CAM.ty);
  camera.updateMatrixWorld();
}

// A new match: kits, numbers and crowd colours
function syncMatch3D() {
  if (!W3.ready) return;
  applyKits();
  RIGS.forEach((r) => { r.snap = true; });
  const c = W3.crowd, k0 = S.kits[0], k1 = S.kits[1];
  const pal = [k0.c1, k0.c1, k1.c1, k1.c1, k0.c2, k1.c2, '#d9d4c8', '#222831', '#ff7a1a', '#7b3fe4', '#12b5c6', '#f4c21d'];
  for (let i = 0; i < c.n; i++) c.bodies.setColorAt(i, _col.set(pal[(hash01(i * 2.3 + S.cfg.home * 7 + S.cfg.away) * pal.length) | 0]));
  c.bodies.instanceColor.needsUpdate = true;
  FX.snapBall = true;
}

function syncCrowd(t) {
  const c = W3.crowd, ba = c.bodies.instanceMatrix.array, ha = c.heads.instanceMatrix.array, pts = c.pts;
  const ex = S.demo ? 0.15 : S.excite, goal = S.phase === 'goal' ? 1.4 : 0;
  const amp = 0.3 + ex * 4.5 + goal * 3 + (S.last30 ? 1 : 0), rate = 4.4 + ex * 5;
  const calm = arc.reducedMotion ? 0.2 : 1;
  for (let k = 0; k < c.n; k++) {
    const p = pts[k], o = k * 16;
    const j = Math.max(0, Math.sin(t * rate + p.ph)) * amp * calm, s = p.s;
    ba[o] = s; ba[o + 5] = s; ba[o + 10] = s; ba[o + 12] = p.x; ba[o + 13] = p.y + 4.7 * s + j; ba[o + 14] = p.z; ba[o + 15] = 1;
    ha[o] = s; ha[o + 5] = s; ha[o + 10] = s; ha[o + 12] = p.x; ha[o + 13] = p.y + 11.6 * s + j; ha[o + 14] = p.z; ha[o + 15] = 1;
  }
  c.bodies.instanceMatrix.needsUpdate = true; c.heads.instanceMatrix.needsUpdate = true;
}

const VIS = new Array(10).fill(true);
function syncScene(dt, running) {
  const pen = S.phase === 'penalties' && S.pen;
  const snapAll = !!FX.snapBall;
  for (let i = 0; i < 10; i++) {
    const p = S.players[i], show = !pen || p === S.pen.taker || p === S.pen.keeper;
    VIS[i] = show; RIGS[i].root.visible = show;
    if (show) { posePlayer(i, p, running ? dt : 0, RIGS[i].snap || snapAll); RIGS[i].snap = false; }
  }
  // ball
  const b = S.ball, bm = FX.ball, by = b.z + BR * 1.08;
  if (snapAll) { FX.px = b.x; FX.pz = b.y; FX.snapBall = false; }
  const ddx = b.x - FX.px, ddz = b.y - FX.pz, dist = hyp(ddx, ddz);
  if (dist > 0.01 && dist < 80) { _ax.set(ddz, 0, -ddx).normalize(); _bq.setFromAxisAngle(_ax, dist / (BR * 1.08)); bm.quaternion.premultiply(_bq); }
  FX.px = b.x; FX.pz = b.y; bm.position.set(b.x, by, b.y);
  if (!b.owner && hyp(b.vx, b.vy) > 340) {
    let n = 0;
    for (let i = 1; i <= 6; i++) {
      const j = (b.tn - i + 16) % 8; if (b.tx[j] === 0 && b.ty[j] === 0) continue;
      const sc = 1 - i * 0.12; _mm.compose(_p.set(b.tx[j], b.tz[j] + BR, b.ty[j]), _q.identity(), _s.set(sc, sc, sc)); FX.trail.setMatrixAt(n++, _mm);
    }
    FX.trail.count = n; FX.trail.instanceMatrix.needsUpdate = true;
  } else FX.trail.count = 0;
  // markers
  const cp = !S.demo && S.ctrl >= 0 && !pen ? S.players[S.ctrl] : null;
  if (cp) {
    FX.ring.visible = true; FX.ring.position.set(cp.x, 0.5, cp.y); const pul = 1 + (arc.reducedMotion ? 0 : Math.sin(S.t * 6) * 0.06); FX.ring.scale.set(pul, 1, pul);
    FX.arrow.visible = true; FX.arrow.position.set(cp.x, 66 + (arc.reducedMotion ? 0 : Math.sin(S.t * 6) * 2), cp.y); FX.arrow.rotation.y = S.t * 2;
  } else { FX.ring.visible = false; FX.arrow.visible = false; }
  const pt = S.passTarget;
  if (pt && S.passT > 0 && pt.team === 0 && !S.demo && !pen && pt.i !== S.ctrl) { FX.target.visible = true; FX.target.position.set(pt.x, 0.45, pt.y); } else FX.target.visible = false;
  for (const m of FX.marks) {
    if (m.age >= m.life) { m.m.visible = false; continue; }
    m.age += dt; const k = clamp(m.age / m.life, 0, 1);
    m.m.visible = k < 1; m.m.scale.setScalar(1 + k * 2.6); m.m.material.opacity = (1 - k) * 0.9;
  }
  rippleNets();
  syncShadows(VIS);
  syncParticles();
  W3.crowdTick = (W3.crowdTick || 0) + 1;
  if (W3.level < 3 || W3.crowdTick % 3 === 0) syncCrowd(performance.now() / 1000);
  W3.sky.position.copy(camera.position);
  for (const f of W3.fence) f.grp.visible = f.nx * (camera.position.x - f.mx) + f.nz * (camera.position.z - f.mz) > -10;
  const bl = Math.sin(performance.now() / 420) > 0;
  W3.redLights[0].visible = bl; W3.redLights[1].visible = !bl;
}

/* ================================================================== quality */
const PERF = { ema: 16, n: 0, level: 0, scale: 1, skip: 1, tick: 0, lock: false };
function applyQuality(level) {
  W3.level = level;
  const sc = [1, 0.85, 0.7, 0.5, 0.4, 0.35][level];
  PERF.scale = sc; PERF.skip = level >= 5 ? 3 : level >= 4 ? 2 : 1;
  renderer.setPixelRatio(arc.dpr * sc);
  renderer.setSize(arc.w, arc.h, false);
  const key = W3.key;
  if (level >= 1 && key.shadow.mapSize.x > 1024) { key.shadow.mapSize.set(1024, 1024); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
  if (level >= 2) { key.castShadow = false; W3.cones.forEach((c) => { c.visible = false; }); W3.glows.forEach((c) => { c.visible = false; }); }
  if (level >= 3) W3.rim.visible = false;
}
function perfTick(dtMs) {
  if (PERF.lock) return;
  PERF.n++;
  if (PERF.n < 12) return;
  PERF.ema += (dtMs * PERF.skip - PERF.ema) * 0.1;
  if (PERF.n % 12 === 0 && PERF.ema > 45 && PERF.level < 5) { PERF.level++; applyQuality(PERF.level); PERF.n = 0; PERF.ema = 20; }
}

/* ================================================================== HUD (2D overlay) */
const TRAIL = { pts: [], t: -9, kind: 0 };
function flashTrail(kind) {
  TRAIL.pts = PATH.pts.slice(); TRAIL.t = performance.now(); TRAIL.kind = kind;
}
function plate(g, x, y, w, h, r, fill) { rrPath(g, x, y, w, h, r); g.fillStyle = fill || 'rgba(15,13,10,.9)'; g.fill(); g.strokeStyle = 'rgba(251,245,236,.16)'; g.lineWidth = 1; g.stroke(); }
function drawScoreboard(g, w) {
  const th = S.teams[0], ta = S.teams[1];
  const sw = Math.min(w - 120, 270), x = w / 2 - sw / 2, y = 8, hh = 42;
  plate(g, x, y, sw, hh, 12);
  g.fillStyle = S.kits[0].c1; rrPath(g, x + 8, y + 9, 6, 24, 3); g.fill();
  g.fillStyle = S.kits[1].c1; rrPath(g, x + sw - 14, y + 9, 6, 24, 3); g.fill();
  g.textBaseline = 'middle';
  g.font = '700 12px ' + F_MONO; g.fillStyle = '#fbf5ec'; g.textAlign = 'left'; g.fillText(th.abbr, x + 20, y + 21);
  g.textAlign = 'right'; g.fillText(ta.abbr, x + sw - 20, y + 21);
  g.font = '500 24px ' + F_DISP; g.textAlign = 'right'; g.fillText(String(S.score[0]), w / 2 - 12, y + 17);
  g.textAlign = 'left'; g.fillText(String(S.score[1]), w / 2 + 12, y + 17);
  g.textAlign = 'center'; g.fillStyle = '#a39e94'; g.fillText('-', w / 2, y + 16); g.fillStyle = '#fbf5ec';
  const hot = S.last30 && S.phase === 'play';
  g.font = '700 11px ' + F_MONO;
  g.fillStyle = hot ? (arc.reducedMotion || Math.sin(S.t * 6) > -0.2 ? '#ff6940' : '#ffb736') : '#c9a96e';
  const label = S.phase === 'penalties' ? 'PENALTIES' : matchClock() + '  ' + (S.half === 1 ? '1ST' : '2ND') + (S.cfg.mode === 'cup' ? '  ' + (S.cfg.matchNo === 3 ? 'FINAL' : S.cfg.matchNo === 2 ? 'SEMI' : 'QF') : '');
  g.fillText(label, w / 2, y + 34);
}
function drawNamePlate(g, w) {
  if (S.demo || S.ctrl < 0 || S.phase === 'penalties') return;
  const p = S.players[S.ctrl]; if (!p) return;
  const nw = 150, x = w / 2 - nw / 2, y = 56;
  plate(g, x, y, nw, 22, 8, 'rgba(15,13,10,.72)');
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = '600 11px ' + F_UI; g.fillStyle = '#ffd23d';
  g.fillText(String(p.num), x + 8, y + 11.5);
  g.fillStyle = '#fbf5ec'; g.fillText(p.name, x + 24, y + 11.5);
  const bw = 40, bx = x + nw - bw - 8;
  g.fillStyle = 'rgba(251,245,236,.15)'; rrPath(g, bx, y + 8, bw, 6, 3); g.fill();
  g.fillStyle = p.tired ? '#ff4d1f' : p.stam < 0.35 ? '#ff8a3d' : '#c9a96e'; rrPath(g, bx, y + 8, Math.max(2, bw * p.stam), 6, 3); g.fill();
}
function drawMini(g, w) {
  if (S.phase === 'penalties') return;
  const portrait = V.portrait, mw = portrait ? 40 : 78, mh = portrait ? 70 : 44, x = w - mw - 8, y = 8;
  plate(g, x - 3, y - 3, mw + 6, mh + 6, 7, 'rgba(15,13,10,.6)');
  g.fillStyle = 'rgba(38,128,70,.55)'; g.fillRect(x, y, mw, mh);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1);
  g.beginPath();
  if (portrait) { g.moveTo(x, y + mh / 2); g.lineTo(x + mw, y + mh / 2); } else { g.moveTo(x + mw / 2, y); g.lineTo(x + mw / 2, y + mh); }
  g.stroke();
  const mp = (wx, wy) => {
    const u = uOf(wx, wy), v = vOf(wx, wy);
    if (portrait) { TMP.x = x + (u / 295 * 0.5 + 0.5) * mw; TMP.y = y + (v / 515 * 0.5 + 0.5) * mh; } else { TMP.x = x + (u / 515 * 0.5 + 0.5) * mw; TMP.y = y + (v / 295 * 0.5 + 0.5) * mh; }
  };
  for (let i = 0; i < 10; i++) {
    const p = S.players[i]; mp(p.x, p.y);
    g.fillStyle = S.kits[p.team].c1; g.beginPath(); g.arc(TMP.x, TMP.y, p.i === S.ctrl ? 2.8 : 2, 0, TAU); g.fill();
    if (p.i === S.ctrl) { g.strokeStyle = '#ffd23d'; g.lineWidth = 1; g.stroke(); }
  }
  mp(S.ball.x, S.ball.y); g.fillStyle = '#fff'; g.beginPath(); g.arc(TMP.x, TMP.y, 1.8, 0, TAU); g.fill();
}
function drawSay(g, w) {
  if (!S.say) return;
  const q = S.say, a = clamp(Math.min(q.age / 0.2, (q.life - q.age) / 0.4), 0, 1);
  g.save(); g.globalAlpha = a;
  g.font = 'italic 500 15px ' + F_DISP; const tw = g.measureText(q.text).width + 28;
  const y = 84;
  plate(g, w / 2 - tw / 2, y, tw, 28, 14, 'rgba(15,13,10,.78)');
  g.fillStyle = '#fbf5ec'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(q.text, w / 2, y + 14.5);
  g.restore();
}
function drawOverheadName(g) {
  if (S.demo || S.ctrl < 0 || S.phase === 'penalties') return;
  const p = S.players[S.ctrl]; if (!p || !projectScreen(p.x, 60, p.y, PJ)) return;
  const sx = PJ.x, sy = PJ.y;
  g.font = '600 11px ' + F_UI; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText(p.name).width + 12, ny = sy - 22;
  plate(g, sx - tw / 2, ny - 9, tw, 18, 6, 'rgba(15,13,10,.75)');
  g.fillStyle = '#ffd23d'; g.fillText(p.name, sx, ny + 0.5);
  if (S.charging && S.charge > 0) {
    const bw = 46, bx = sx - bw / 2, by = ny - 20;
    g.fillStyle = 'rgba(15,13,10,.7)'; rrPath(g, bx - 2, by - 2, bw + 4, 10, 5); g.fill();
    g.fillStyle = S.charge > 0.93 ? '#ff4d1f' : S.charge > 0.6 ? '#ffb736' : '#c9a96e'; rrPath(g, bx, by, Math.max(3, bw * S.charge), 6, 3); g.fill();
  }
}
function drawTrail(g) {
  const age = (performance.now() - TRAIL.t) / 1000;
  if (age > 0.32 || TRAIL.pts.length < 4) return;
  const a = 1 - age / 0.32;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = TRAIL.kind === 2 ? 'rgba(255,95,168,' + a.toFixed(2) + ')' : TRAIL.kind === 1 ? 'rgba(255,154,60,' + a.toFixed(2) + ')' : 'rgba(89,224,255,' + a.toFixed(2) + ')';
  g.lineWidth = 5 * a + 1; g.beginPath();
  for (let i = 0; i < TRAIL.pts.length; i += 2) { if (i) g.lineTo(TRAIL.pts[i], TRAIL.pts[i + 1]); else g.moveTo(TRAIL.pts[i], TRAIL.pts[i + 1]); }
  g.stroke(); g.restore();
}
function drawPenaltyHud(g, w, h) {
  const pen = S.pen; if (!pen) return;
  const y = 70;
  [0, 1].forEach((t) => {
    const row = pen.kicks[t], n = Math.max(5, row.length);
    const total = n * 16, x0 = 44;
    plate(g, 6, y - 12 + t * 18 - 3, total + 46, 22, 8, 'rgba(15,13,10,.7)');
    g.font = '700 10px ' + F_MONO; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = '#a39e94';
    g.fillText(S.teams[t].abbr, x0 - 6, y + t * 18);
    for (let i = 0; i < n; i++) {
      const cx = x0 + i * 16 + 8, cy = y + t * 18;
      g.beginPath(); g.arc(cx, cy, 5.5, 0, TAU);
      if (i < row.length) { g.fillStyle = row[i] ? '#ffb736' : '#e23a43'; g.fill(); } else { g.strokeStyle = 'rgba(251,245,236,.4)'; g.lineWidth = 1.2; g.stroke(); }
    }
  });
  const gest = arc.touchMode && arc.touchStyle !== 'pads';
  const by = h - (arc.touchMode ? (gest ? 120 : arc.hudPad().bottom) : 74);
  if (pen.stage === 'aim' && pen.team === 0) {
    if (projectScreen(HL, pen.aimY, pen.aimH, PJ)) {
      g.strokeStyle = '#ffd23d'; g.lineWidth = 2; const r = 9;
      g.beginPath(); g.arc(PJ.x, PJ.y, r, 0, TAU); g.moveTo(PJ.x - r * 1.6, PJ.y); g.lineTo(PJ.x - r * 0.5, PJ.y); g.moveTo(PJ.x + r * 1.6, PJ.y); g.lineTo(PJ.x + r * 0.5, PJ.y); g.moveTo(PJ.x, PJ.y - r * 1.6); g.lineTo(PJ.x, PJ.y - r * 0.5); g.moveTo(PJ.x, PJ.y + r * 0.5); g.lineTo(PJ.x, PJ.y + r * 1.6); g.stroke();
    }
    const bw = gest ? 250 : 170, bx = w / 2 - bw / 2;
    plate(g, bx - 6, by - 6, bw + 12, 32, 10, 'rgba(15,13,10,.78)');
    if (!gest) { g.fillStyle = 'rgba(251,245,236,.15)'; rrPath(g, bx, by + 14, bw, 6, 3); g.fill(); g.fillStyle = pen.charge > 0.92 ? '#ff4d1f' : '#ffb736'; rrPath(g, bx, by + 14, Math.max(2, bw * pen.charge), 6, 3); g.fill(); }
    g.font = '600 11px ' + F_MONO; g.fillStyle = '#fbf5ec'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(gest ? 'SWIPE TO SHOOT, FAST IS HARD' : 'AIM, THEN HOLD SHOOT', w / 2, gest ? by + 10 : by + 5);
  } else if (pen.stage === 'aim' && pen.team === 1 && !S.demo) {
    const bw = gest ? 270 : 240;
    plate(g, w / 2 - bw / 2, by - 6, bw, 32, 10, 'rgba(15,13,10,.78)');
    g.font = '600 11px ' + F_MONO; g.fillStyle = '#fbf5ec'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(gest ? 'KEEPER: TAP LEFT, MIDDLE OR RIGHT' : 'KEEPER: LEFT, UP OR RIGHT TO DIVE', w / 2, by + 10);
  }
}
function drawTouchHint(g, w, h) {
  if (S.demo || !arc.touchMode || arc.touchStyle !== 'gesture' || S.phase === 'penalties' || S.t > 9 || CUP && CUP.idx > 0) return;
  const a = clamp(Math.min(S.t / 0.4, (9 - S.t) / 0.8), 0, 1) * 0.92;
  g.save(); g.globalAlpha = a;
  g.font = '600 11px ' + F_MONO; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = ['DRAG TO RUN  |  DRAG FAR TO SPRINT', 'TAP A MATE TO PASS  |  SWIPE TO SHOOT'];
  const bw = Math.min(w - 24, 330), by = h - 168;
  plate(g, w / 2 - bw / 2, by, bw, 44, 12, 'rgba(15,13,10,.78)');
  g.fillStyle = '#fbf5ec'; g.fillText(lines[0], w / 2, by + 15); g.fillStyle = '#ffd23d'; g.fillText(lines[1], w / 2, by + 31);
  g.restore();
}
function drawVignette(g, w, h) {
  if (S.last30 && S.phase === 'play') {
    const pulse = arc.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(S.t * 3);
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    gr.addColorStop(0, 'rgba(255,60,30,0)'); gr.addColorStop(1, 'rgba(255,60,30,' + (0.08 + 0.1 * pulse).toFixed(3) + ')');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  if (S.flash > 0) { g.fillStyle = 'rgba(255,244,214,' + (S.flash * 0.22).toFixed(3) + ')'; g.fillRect(0, 0, w, h); }
  if (S.fade > 0) { g.fillStyle = 'rgba(6,5,3,' + clamp(S.fade, 0, 1).toFixed(3) + ')'; g.fillRect(0, 0, w, h); }
}

/* ================================================================== frame */
function render(ctx, a) {
  const w = a.w, h = a.h;
  const now = performance.now(), dtMs = lastRenderT ? now - lastRenderT : 16, dtR = Math.min(0.05, dtMs / 1000); lastRenderT = now;
  if (!S) return;
  if (NOGL || !renderer) {
    ctx.fillStyle = '#070a12'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fbf5ec'; ctx.font = '600 15px ' + F_UI; ctx.textAlign = 'center'; ctx.fillText('This game needs WebGL, which this browser does not offer.', w / 2, h / 2);
    return;
  }
  layout(w, h);
  const running = a.state === 'play' || (a.state === 'menu' && S.demo);
  PERF.tick++;
  if (PERF.skip <= 1 || PERF.tick % PERF.skip === 0 || PERF.tick < 3) {
    camStep(running ? dtR * PERF.skip : 0);
    syncScene(running ? dtR * PERF.skip : 0, running);
    if (!LOST) renderer.render(scene, camera);
  }
  perfTick(dtMs);
  if (!(a.state === 'menu')) {
    drawOverheadName(ctx);
    drawScoreboard(ctx, w);
    drawNamePlate(ctx, w);
    drawMini(ctx, w);
    if (S.phase === 'penalties') drawPenaltyHud(ctx, w, h);
    drawSay(ctx, w);
    drawTrail(ctx);
    drawTouchHint(ctx, w, h);
  }
  drawVignette(ctx, w, h);
}

/* ------------------------------------------------------------------ boot */
function debug() {
  if (!S) return {};
  const b = S.ball;
  const owner = b.owner;
  return {
    phase: S.phase, clock: matchClock(), clockSeconds: Math.round(S.matchT * 10) / 10, phaseT: Math.round(S.phaseT * 10) / 10, remaining: Math.round((S.T - S.matchT) * 10) / 10, half: S.half,
    score: { home: S.score[0], away: S.score[1] },
    ball: { x: Math.round(b.x), y: Math.round(b.y), z: Math.round(b.z), vx: Math.round(b.vx), vy: Math.round(b.vy) },
    controlled: S.ctrl, controlledName: S.ctrl >= 0 ? S.players[S.ctrl].name : null,
    possession: owner ? owner.team : b.lastTeam, owner: owner ? owner.i : -1,
    mode: S.cfg.mode || 'friendly', matchNo: S.matchNo, demo: S.demo, teams: [S.teams[0].name, S.teams[1].name],
    stats: S.stats, scorers: S.scorers.length, pen: S.pen ? { stage: S.pen.stage, k: S.pen.k, kicks: S.pen.kicks, winner: S.pen.winner } : null,
    players: S.players.map((p) => [Math.round(p.x), Math.round(p.y)]),
    input: Object.assign({}, GI), view: V.portrait ? 'portrait' : 'wide', quality: PERF.level,
  };
}

function start(a, ch) {
  if (CUP && CUP.pending) { CUP.pending = false; CUP.idx++; startCupMatch(); return; }
  const skill = diffSkill(ch.diff);
  const mins = ch.len || 2;
  const my = clamp(ch.team | 0, 0, TEAMS.length - 1);
  if (ch.mode === 'cup') {
    const others = TEAMS.map((_, i) => i).filter((i) => i !== my);
    for (let i = others.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = others[i]; others[i] = others[j]; others[j] = t; }
    CUP = { team: my, idx: 0, opps: others.slice(0, 3), results: [], total: 0, pending: false };
    startCupMatch();
  } else {
    CUP = null;
    let opp = (rnd() * TEAMS.length) | 0; if (opp === my) opp = (opp + 1 + ((rnd() * (TEAMS.length - 1)) | 0)) % TEAMS.length;
    newMatch({ home: my, away: opp, minutes: mins, skill, mode: 'friendly', matchNo: 1 });
    announceMatch();
  }
  S.lastBeep = -1;
}

function showMenu() {
  const touch = !!arc.touchMode;
  arc.menu({
    eyebrow: 'Arcade football',
    title: 'Turf <em>Kings</em>',
    showKeys: true,
    html: '<p>Five-a-side on a floodlit rooftop cage. The walls are live, so play off the boards and finish low. Cup mode is three knockout ties, and a draw goes to penalties.</p>' +
      (touch ? '<p>Drag to run, tap a team-mate to pass, swipe to shoot and curve the swipe up to chip. Defending, tap to tackle and swipe to slide.</p>' : '<p>Defending, K slides in and J tackles. Click a team-mate to pass.</p>'),
    options: [
      { id: 'mode', label: 'Mode', choices: [{ v: 'friendly', label: 'Friendly' }, { v: 'cup', label: 'Cup (3 matches)' }] },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      { id: 'len', label: 'Match length', value: 2, choices: [{ v: 2, label: '2 min' }, { v: 4, label: '4 min' }, { v: 6, label: '6 min' }] },
      { id: 'team', label: 'Your club', value: 0, choices: TEAMS.map((t, i) => ({ v: i, label: t.short })) },
    ],
  });
}

/* ------------------------------------------------------------------ three.js start-up */
function initThree(a) {
  // Probe first, so a browser with no WebGL gets a sentence and not a stack of errors.
  let ok = false, soft = false;
  try {
    const pc = document.createElement('canvas'), gl = pc.getContext('webgl2') || pc.getContext('webgl');
    ok = !!gl;
    if (gl) { const di = gl.getExtension('WEBGL_debug_renderer_info'); soft = !!di && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(di.UNMASKED_RENDERER_WEBGL))); }
    if (gl) { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
  } catch (e) { ok = false; }
  if (!ok) { NOGL = true; return; }
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  TEXQ.pitchW = coarse ? 1536 : 2048; TEXQ.shadow = coarse ? 1536 : 2048;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: !soft, powerPreference: 'high-performance' });
  } catch (e) { NOGL = true; renderer = null; return; }
  TEXQ.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(a.dpr); renderer.setSize(a.w, a.h, false);
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); LOST = true; });
  a.canvas.addEventListener('webglcontextrestored', () => { LOST = false; CAM.snap = true; });
  camera = new THREE.PerspectiveCamera(36, a.w / Math.max(1, a.h), 20, 9000);
  const qm = /[?&]quality=(\d)/.exec(location.search);
  buildWorld(TEXQ);
  buildRigs();
  buildFx(TEXQ);
  scene.add(camera);
  if (soft && !qm) { PERF.level = 3; applyQuality(3); }
  if (qm) { PERF.lock = true; PERF.level = +qm[1]; applyQuality(PERF.level); }
}
function resize(a) {
  if (!renderer) return;
  renderer.setPixelRatio(a.dpr * PERF.scale); renderer.setSize(a.w, a.h, false);
  camera.aspect = a.w / Math.max(1, a.h); camera.updateProjectionMatrix();
  CAM.snap = true;
}

arc = Arcade.create({
  slug: 'turf-kings', title: 'Turf Kings', genre: 'Arcade football', three: true,
  hint: 'WASD move  |  click a mate or J pass  |  K shoot  |  L sprint',
  touchHint: 'Stick to run, Shoot / Pass / Sprint pads',
  mouse: { cursor: 'pointer', keys: [['Click a team-mate', 'Pass to him (or tackle)'], ['Flick the mouse', 'Shoot that way']] },
  pauseHtml() {
    if (!S) return '';
    return '<div class="stat"><div>Score<b>' + S.score[0] + ' - ' + S.score[1] + '</b></div><div>Clock<b>' + matchClock() + '</b></div></div>';
  },
  gestures: {
    drag: 'xy',
    hint: 'Drag to run  |  tap a mate to pass  |  swipe to shoot',
    keys: [
      ['Drag', 'Run (drag far to sprint)'],
      ['Tap a team-mate', 'Pass to him'],
      ['Swipe', 'Shoot, curve it up to chip'],
      ['Tap, defending', 'Tackle'],
      ['Swipe, defending', 'Slide tackle'],
      ['Penalties', 'Swipe to shoot, tap a side to dive'],
    ],
  },
  keys: [
    ['WASD / Arrows', 'Move'],
    ['L / Shift', 'Sprint (hold)'],
    ['J / Space', 'Pass, or tackle'],
    ['U', 'Lob pass'],
    ['K', 'Shoot (hold to charge)'],
    ['Q', 'Switch player'],
  ],
  touch: {
    stick: true,
    pads: [{ label: 'Shoot', key: 'KeyK', big: true, hot: true }, { label: 'Pass', key: 'KeyJ' }, { label: 'Sprint', key: 'ShiftLeft', keep: true }, { label: 'Switch', key: 'KeyQ' }],
  },
  init(a) {
    arc = a;
    initThree(a);
    startDemo();
    a.debug = debug;
    showMenu();
  },
  onMenu() { CUP = null; if (!S || !S.demo) startDemo(); },
  start,
  update,
  idle,
  render,
  resize,
  formatScore: (v) => String(v),
});

// test helpers (kept tiny): run the attract-mode simulation fast and read the numbers
window.__tk = {
  get S() { return S; }, V, CAM, GI, step: (dt) => stepSim(dt), newMatch: (c) => newMatch(c), matchClock: () => matchClock(),
  get camera() { return camera; }, get renderer() { return renderer; }, W3, FX, PERF, PATH, pathChip, startPenalties: () => startPenalties(), RIGS,
  project: (x, y, z) => (projectScreen(x, y, z, PJ) ? { x: PJ.x, y: PJ.y } : null),
  axisFor(dx, dy) { return { x: V.rx * dx + V.ry * dy, y: -(V.lx * dx + V.ly * dy) }; },
  simDemo(seconds, skill) {
    newMatch({ home: 0, away: 1, minutes: 2, skill: skill == null ? 0.6 : skill, demo: true });
    S.ctrl = -1;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) { stepSim(1 / 60); if (S.phase === 'fulltime') break; }
    const r = { score: S.score.slice(), shots: S.stats.shots.slice(), sot: S.stats.sot.slice(), saves: S.stats.saves.slice(), fouls: S.stats.fouls.slice(), phase: S.phase, clock: matchClock() };
    startDemo();
    return r;
  },
};
