import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost, createSkyEnv, createParticles } from '/games/shared/fx3d.js';
import { createHuman, createCrowd, prepareHuman } from '/games/shared/human.js';
import { createVFX } from '/games/shared/vfx.js';

/*
 * Turf Kings 3D: a full football simulation with an original league.
 *
 * Two venues share one simulation. The Stadium is eleven-a-side on a full
 * size pitch with the real rules: kick-off, throw-ins, corners, goal kicks,
 * fouls, direct and indirect free kicks with a wall, penalties, yellow and
 * red cards, offside called by an assistant referee, two halves with
 * stoppage time, and in the cup extra time and a shootout. The Cage is the
 * original five-a-side game on a floodlit rooftop, walls live, kept as its
 * own mode.
 *
 * Modes: Friendly (either venue), the Monsoon League (a saved season with a
 * table), the Banyan Cup (an eight club knockout with extra time and
 * penalties), a Penalty shootout, and Skill training (passing, beating a
 * defender, shooting, free kicks and penalties, scored).
 *
 * Teams play formations with roles: a back line that steps up and drops
 * together, pressing and cover, zonal marking, off-the-ball runs held onside
 * until a through ball, overlapping full-backs, crosses and headers, and a
 * keeper who reads shots, claims crosses and distributes. Opponents react
 * like people: 150 to 300 ms reaction time, heavy touches and misplaced
 * passes under pressure, better or worse days, and a lift after a goal.
 *
 * Presentation: a TV broadcast camera (TV, wide and close), team walkouts and
 * a club anthem moment, a broadcast scoreboard and clock with stoppage time,
 * goal replays from three angles in slow motion, celebrations, crowd chants
 * and flares, original commentary, man of the match and full stats.
 *
 * Everything (clubs, crests, kits, players, league, stadium, commentary,
 * anthems) is original and generated in code. People come from
 * /games/shared/human.js, effects from /games/shared/vfx.js, post from fx3d.
 *
 * World mapping: pitch (x, y, z) is three.js (X, Y = z, Z = y). 30 world
 * units are one metre.
 */
const Arcade = window.Arcade;

/* ------------------------------------------------------------------ venues and constants */
const UNIT = 30; // world units per metre: a 1.75 m player is 52.5 units tall
const VEN = {
  // the rooftop cage, walls live (the original five-a-side game)
  cage: { key: 'cage', HL: 500, HW: 280, GH: 70, GOAL_H: 56, GD: 38, walls: true, boxD: 160, boxW: 150, sixD: 70, sixW: 100, spot: 110, circle: 68, n: 5, gameMins: 20 },
  // a full pitch: 105 x 68 m, goals 7.32 x 2.44 m, boxes, spot and circle to the real dimensions
  stadium: { key: 'stadium', HL: 1575, HW: 1020, GH: 110, GOAL_H: 73, GD: 66, walls: false, boxD: 495, boxW: 605, sixD: 165, sixW: 275, spot: 330, circle: 275, n: 11, gameMins: 90 },
};
let VN = VEN.stadium;
let HL = VN.HL, HW = VN.HW, GH = VN.GH, GOAL_H = VN.GOAL_H, GD = VN.GD;
function setVenue(k) { VN = VEN[k]; HL = VN.HL; HW = VN.HW; GH = VN.GH; GOAL_H = VN.GOAL_H; GD = VN.GD; }
const PR = 13, BR = 6.5;             // player and ball radius
const GRAV = 900, ROOF = 168, CORNER = 46;
const FR_C = 58, FR_K = 0.82;        // rolling friction: dv/dt = -(C + K v)
const WALL_D = 275;                  // 9.15 m: the wall, and everyone at a restart
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
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ the Monsoon League (all invented) */
const LEAGUE = 'Monsoon League', CUPNAME = 'Banyan Cup';
// Squads in formation order for a 4-3-3 shape: GK, LB, CB, CB, RB, CM x3, LW, ST, RW. Every name is invented.
const TEAMS = [
  { name: 'Konkan Tide', short: 'Tide', abbr: 'KTD', ground: 'Tidewater Park', c1: '#0e9aa0', c2: '#f4f1e8', shorts: '#0b3d48', sock: '#0e9aa0',
    alt: { c1: '#f4f1e8', c2: '#0e9aa0', shorts: '#f4f1e8', sock: '#f4f1e8' }, crest: ['shield', 'wave'], rating: 0.66, form: '433', ment: 0,
    names: ['R. Naik', 'S. Kamat', 'A. Desai', 'P. Gawas', 'J. Mascarenhas', 'V. Sawant', 'N. Pednekar', 'K. Shirodkar', 'M. Colaco', 'D. Rebelo', 'T. Prabhu'],
    anthem: [0, 4, 7, 9, 7, 4, 2, 0] },
  { name: 'Thar Falcons', short: 'Falcons', abbr: 'THF', ground: 'Dune Arena', c1: '#d9b26c', c2: '#7a1f2b', shorts: '#7a1f2b', sock: '#d9b26c',
    alt: { c1: '#7a1f2b', c2: '#d9b26c', shorts: '#7a1f2b', sock: '#7a1f2b' }, crest: ['round', 'falcon'], rating: 0.6, form: '442', ment: -1,
    names: ['B. Rathore', 'K. Shekhawat', 'H. Bhati', 'M. Charan', 'R. Jodha', 'P. Solanki', 'V. Bishnoi', 'A. Chundawat', 'S. Deora', 'L. Rajpurohit', 'N. Kachhwaha'],
    anthem: [0, 2, 3, 7, 5, 3, 2, 0] },
  { name: 'Nilgiri Stags', short: 'Stags', abbr: 'NGS', ground: 'Pinehill Ground', c1: '#1f6b3a', c2: '#e7c04a', shorts: '#f4f1e8', sock: '#1f6b3a',
    alt: { c1: '#f4f1e8', c2: '#1f6b3a', shorts: '#1f6b3a', sock: '#f4f1e8' }, crest: ['shield', 'stag'], rating: 0.7, form: '4231', ment: 0,
    names: ['P. Murugan', 'K. Selvam', 'R. Ilango', 'M. Sundar', 'J. Arul', 'V. Kannan', 'S. Pandian', 'D. Mani', 'E. Raja', 'G. Senthil', 'A. Velu'],
    anthem: [0, 5, 4, 2, 4, 7, 5, 4] },
  { name: 'Brahmaputra Rhinos', short: 'Rhinos', abbr: 'BRR', ground: 'River Island Stadium', c1: '#3d4b5c', c2: '#ff8a2a', shorts: '#2a333f', sock: '#ff8a2a',
    alt: { c1: '#ff8a2a', c2: '#2a333f', shorts: '#2a333f', sock: '#ff8a2a' }, crest: ['hex', 'rhino'], rating: 0.64, form: '352', ment: 1,
    names: ['D. Bora', 'P. Kalita', 'R. Hazarika', 'J. Saikia', 'N. Deka', 'B. Baruah', 'M. Lahon', 'K. Phukan', 'L. Rongpi', 'T. Mili', 'S. Doley'],
    anthem: [0, 3, 5, 7, 10, 7, 5, 3] },
  { name: 'Coromandel Cyclones', short: 'Cyclones', abbr: 'COC', ground: 'Cyclone Bowl', c1: '#5b2c91', c2: '#ffd23d', shorts: '#2c1450', sock: '#ffd23d',
    alt: { c1: '#ffd23d', c2: '#5b2c91', shorts: '#f4f1e8', sock: '#ffd23d' }, crest: ['round', 'storm'], rating: 0.74, form: '433', ment: 1,
    names: ['S. Varma', 'K. Raju', 'B. Chowdary', 'M. Naidu', 'T. Prasad', 'R. Teja', 'Y. Kiran', 'H. Sastry', 'N. Babu', 'G. Kishore', 'D. Murthy'],
    anthem: [0, 7, 5, 4, 2, 4, 5, 7] },
  { name: 'Vindhya Wolves', short: 'Wolves', abbr: 'VDW', ground: 'Ridgeback Park', c1: '#c8323c', c2: '#f4f1e8', shorts: '#1f2228', sock: '#1f2228',
    alt: { c1: '#f4f1e8', c2: '#c8323c', shorts: '#f4f1e8', sock: '#c8323c' }, crest: ['diamond', 'wolf'], rating: 0.62, form: '532', ment: -1,
    names: ['A. Tiwari', 'R. Chouhan', 'S. Pathak', 'K. Dubey', 'M. Raghuvanshi', 'P. Shukla', 'V. Bundela', 'N. Mishra', 'D. Thakur', 'H. Sengar', 'L. Pande'],
    anthem: [0, 3, 7, 3, 8, 7, 3, 0] },
  { name: 'Ganga Rovers', short: 'Rovers', abbr: 'GRV', ground: 'Ghat Road Ground', c1: '#2457c5', c2: '#f4f1e8', shorts: '#f4f1e8', sock: '#2457c5',
    alt: { c1: '#f4f1e8', c2: '#2457c5', shorts: '#2457c5', sock: '#f4f1e8' }, crest: ['shield', 'river'], rating: 0.68, form: '4231', ment: 0,
    names: ['S. Mukherjee', 'A. Pal', 'R. Ghoshal', 'T. Majumdar', 'P. Das', 'K. Bose', 'D. Chakraborty', 'N. Sen', 'B. Roy', 'M. Kundu', 'J. Adhikari'],
    anthem: [0, 2, 4, 7, 9, 12, 9, 7] },
  { name: 'Malwa Kites', short: 'Kites', abbr: 'MLK', ground: 'Fivefields Stadium', c1: '#f07a1a', c2: '#1a2a55', shorts: '#1a2a55', sock: '#f07a1a',
    alt: { c1: '#1a2a55', c2: '#f07a1a', shorts: '#1a2a55', sock: '#1a2a55' }, crest: ['diamond', 'kite'], rating: 0.66, form: '442', ment: 0,
    names: ['H. Grewal', 'J. Brar', 'K. Gill', 'M. Dhaliwal', 'S. Randhawa', 'P. Sekhon', 'A. Bains', 'R. Cheema', 'T. Mann', 'V. Aulakh', 'N. Virk'],
    anthem: [0, 4, 5, 7, 5, 4, 0, -1] },
];
// shirt numbers for the eleven, in squad order
const SQ_NUM = [1, 3, 5, 4, 2, 8, 6, 10, 11, 9, 7];
// the role each squad member was signed to play (the order of names above)
const SQ_ROLE = ['GK', 'FB', 'CB', 'CB', 'FB', 'CM', 'DM', 'AM', 'W', 'ST', 'W'];
const GK_COLS = ['#c8ff3a', '#ff5fa8', '#8ae6ff', '#f4f4f4', '#ffb15e', '#9cf0c0'];

/* Formations: each slot is [attack-frame x (-1 own goal line .. 1 the other), y (-1 left .. 1 right), role]. Roles name the
   job: GK; FB full-back, CB centre-back, WB wing-back; DM holding, CM, AM attacking midfield, WM wide midfield; W winger, ST. */
const FORMS = {
  '433': { label: '4-3-3', slots: [[-0.94, 0, 'GK'], [-0.6, -0.68, 'FB'], [-0.7, -0.24, 'CB'], [-0.7, 0.24, 'CB'], [-0.6, 0.68, 'FB'], [-0.38, 0, 'DM'], [-0.22, -0.36, 'CM'], [-0.22, 0.36, 'CM'], [0.1, -0.64, 'W'], [0.14, 0, 'ST'], [0.1, 0.64, 'W']] },
  '442': { label: '4-4-2', slots: [[-0.94, 0, 'GK'], [-0.6, -0.66, 'FB'], [-0.7, -0.22, 'CB'], [-0.7, 0.22, 'CB'], [-0.6, 0.66, 'FB'], [-0.3, -0.2, 'CM'], [-0.3, 0.2, 'CM'], [-0.22, -0.68, 'WM'], [0.1, -0.16, 'ST'], [0.1, 0.16, 'ST'], [-0.22, 0.68, 'WM']] },
  '4231': { label: '4-2-3-1', slots: [[-0.94, 0, 'GK'], [-0.6, -0.68, 'FB'], [-0.7, -0.22, 'CB'], [-0.7, 0.22, 'CB'], [-0.6, 0.68, 'FB'], [-0.42, -0.18, 'DM'], [-0.42, 0.18, 'DM'], [-0.06, 0, 'AM'], [-0.06, -0.6, 'W'], [0.16, 0, 'ST'], [-0.06, 0.6, 'W']] },
  '352': { label: '3-5-2', slots: [[-0.94, 0, 'GK'], [-0.7, -0.34, 'CB'], [-0.74, 0, 'CB'], [-0.7, 0.34, 'CB'], [-0.28, -0.76, 'WB'], [-0.28, 0.76, 'WB'], [-0.42, 0, 'DM'], [-0.24, -0.3, 'CM'], [-0.24, 0.3, 'CM'], [0.1, -0.18, 'ST'], [0.1, 0.18, 'ST']] },
  '532': { label: '5-3-2', slots: [[-0.94, 0, 'GK'], [-0.52, -0.76, 'WB'], [-0.72, -0.36, 'CB'], [-0.74, 0, 'CB'], [-0.52, 0.76, 'WB'], [-0.34, 0, 'CM'], [-0.3, -0.34, 'CM'], [-0.3, 0.34, 'CM'], [0.06, -0.18, 'ST'], [-0.72, 0.36, 'CB'], [0.06, 0.18, 'ST']] },
  cage: { label: 'Cage', slots: [[-0.93, 0, 'GK'], [-0.5, 0, 'CB'], [-0.1, -0.5, 'W'], [-0.1, 0.5, 'W'], [0.28, 0, 'ST']] },
};
const FORM_KEYS = ['433', '442', '4231', '352', '532'];
const CAT = { GK: 'GK', FB: 'DEF', CB: 'DEF', WB: 'DEF', DM: 'MID', CM: 'MID', AM: 'MID', WM: 'MID', W: 'ATT', ST: 'ATT' };
// cage squads: keeper, a centre-back, the two wingers and the striker
const CAGE_PICK = [0, 2, 8, 10, 9];

/* ------------------------------------------------------------------ module state */
let arc = null;
let S = null;          // current match (or attract-mode demo)
let CUP = null;        // cup run
let SEASON = null;     // league season (saved)
let lastRenderT = 0;
const TMP = { x: 0, y: 0 };
const AA = { x: 0, y: 0 }, AB = { x: 0, y: 0 };
const G0 = { x: 0, y: 0 }, G1 = { x: 0, y: 0 }, PJ = { x: 0, y: 0 }, SW = { x: 0, y: 0 };
// The camera looks along (lx, ly) in pitch units; (rx, ry) is screen right. Portrait
// phones look down the pitch from behind the attack; wide screens look across it.
const V = { portrait: false, f: 1, lx: 0, ly: -1, rx: 1, ry: 0 };
const CAM = { snap: true, tx: 0, ty: 0, zm: 1, pen: false, mode: 'tv', px: 0, pz: 0, fov: 30 };
let renderer = null, scene = null, camera = null, NOGL = false, LOST = false, POST = null;

const uOf = (x, y) => x * V.rx + y * V.ry;
const vOf = (x, y) => -(x * V.lx + y * V.ly);
function uvToWorld(du, dv, out) { out.x = V.rx * du - V.lx * dv; out.y = V.ry * du - V.ly * dv; }
function setLook(portrait, f) {
  V.portrait = portrait; V.f = f;
  if (portrait) { V.lx = f; V.ly = 0; } else { V.lx = 0; V.ly = -f; }
  V.rx = -V.ly; V.ry = V.lx;
}

/* ------------------------------------------------------------------ audio (silent in attract mode) */
const quiet = () => !S || S.demo || (S.replay && S.replay.on);
const snd = {
  kick(p) { if (quiet()) return; arc.sfx.tone(150 + 70 * p, 0.09, { type: 'triangle', slide: 70, vol: 0.2 + 0.14 * p }); arc.sfx.noise(0.05, { freq: 2200, vol: 0.1 + 0.1 * p }); },
  pass() { if (quiet()) return; arc.sfx.tone(210, 0.07, { type: 'triangle', slide: 120, vol: 0.14 }); arc.sfx.noise(0.04, { freq: 1500, vol: 0.07 }); },
  head() { if (quiet()) return; arc.sfx.tone(260, 0.06, { type: 'sine', slide: 160, vol: 0.14 }); arc.sfx.noise(0.05, { freq: 1100, vol: 0.08 }); },
  wall(sp) { if (quiet() || S.sfxWall > 0 || sp < 110) return; S.sfxWall = 0.07; arc.sfx.noise(0.07, { freq: 900, filter: 'bandpass', vol: clamp(sp / 1400, 0.04, 0.2) }); arc.sfx.tone(260, 0.05, { type: 'square', slide: 140, vol: clamp(sp / 4000, 0.02, 0.06) }); },
  post() { if (quiet()) return; arc.sfx.tone(880, 0.5, { type: 'triangle', slide: 700, vol: 0.2 }); arc.sfx.tone(1320, 0.3, { type: 'sine', vol: 0.08 }); },
  net() { if (quiet()) return; arc.sfx.noise(0.5, { freq: 700, vol: 0.2 }); },
  whistle(kind) { if (quiet()) return; const d = kind === 2 ? 0.95 : kind === 1 ? 0.6 : 0.28; arc.sfx.tone(2250, d, { type: 'sine', vol: 0.16 }); arc.sfx.tone(2330, d, { type: 'sine', vol: 0.1 }); if (kind === 2) setTimeout(() => { if (!quiet()) { arc.sfx.tone(2250, 0.28, { type: 'sine', vol: 0.14 }); } }, 380); },
  roar(big) { if (quiet()) return; arc.sfx.noise(big ? 2.8 : 1.2, { freq: 800, filter: 'bandpass', vol: big ? 0.42 : 0.2 }); arc.sfx.noise(big ? 2.2 : 0.9, { freq: 420, vol: big ? 0.3 : 0.12 }); if (big) arc.sfx.tone(440, 0.9, { type: 'sawtooth', slide: 520, vol: 0.05 }); },
  ooh() { if (quiet()) return; arc.sfx.noise(0.8, { freq: 600, filter: 'bandpass', vol: 0.18 }); arc.sfx.tone(300, 0.6, { type: 'sine', slide: 520, vol: 0.05 }); },
  save() { if (quiet()) return; arc.sfx.noise(0.12, { freq: 500, vol: 0.2 }); arc.sfx.tone(180, 0.1, { type: 'square', slide: 90, vol: 0.1 }); },
  tackle() { if (quiet()) return; arc.sfx.noise(0.08, { freq: 700, vol: 0.18 }); arc.sfx.tone(120, 0.08, { type: 'triangle', vol: 0.14 }); },
  bounce(i) { if (quiet()) return; arc.sfx.tone(130, 0.05, { type: 'sine', slide: 90, vol: clamp(i / 1600, 0.03, 0.12) }); },
  beep(hi) { if (quiet()) return; arc.sfx.tone(hi ? 880 : 520, 0.12, { type: 'square', vol: 0.1 }); },
  card() { if (quiet()) return; arc.sfx.tone(1900, 0.18, { type: 'sine', vol: 0.12 }); arc.sfx.noise(0.6, { freq: 520, filter: 'bandpass', vol: 0.12 }); },
  skill() { if (quiet()) return; arc.sfx.noise(0.06, { freq: 2600, filter: 'bandpass', vol: 0.06 }); },
  // a terrace chant: three claps and a sung two-note call, the end that is singing louder
  chant(k) {
    if (quiet()) return;
    const v = 0.03 + 0.05 * k;
    for (let i = 0; i < 3; i++) setTimeout(() => { if (!quiet()) arc.sfx.noise(0.07, { freq: 1600, filter: 'bandpass', vol: v * 1.5 }); }, i * 230);
    setTimeout(() => { if (!quiet()) { arc.sfx.tone(196, 0.42, { type: 'sawtooth', vol: v * 0.45 }); arc.sfx.tone(247, 0.42, { type: 'triangle', vol: v * 0.4 }); } }, 760);
    setTimeout(() => { if (!quiet()) { arc.sfx.tone(220, 0.55, { type: 'sawtooth', vol: v * 0.45 }); arc.sfx.tone(277, 0.55, { type: 'triangle', vol: v * 0.4 }); } }, 1220);
  },
  // the home club's anthem, played over the line-up: a short original melody on a soft brass voice
  anthem(club) {
    if (quiet()) return;
    const notes = TEAMS[club].anthem, base = 262;
    notes.forEach((n, i) => setTimeout(() => {
      if (!S || S.phase !== 'walkout') return;
      const f = base * Math.pow(2, n / 12);
      arc.sfx.tone(f, 0.46, { type: 'triangle', vol: 0.09 }); arc.sfx.tone(f / 2, 0.5, { type: 'sine', vol: 0.06 });
    }, 300 + i * 420));
  },
};

/* ------------------------------------------------------------------ commentary (original lines) */
const LINES = {
  shot: ['Off it goes!', 'Lets fly!', 'Strike from distance!', 'Hit first time!', 'Bold effort!', 'Pulls the trigger!', 'Has a go from there!'],
  chip: ['A delicate chip!', 'Tries to lift it over!', 'The cheeky dink!'],
  save: ['Smart stop!', 'The keeper stands tall!', 'What a save!', 'Hands like a vice!', 'Denied!', 'Tipped away at full stretch!', 'Strong wrists there.'],
  post: ['Off the woodwork!', 'Clang! Inches away!', 'The post shakes!', 'Rattles the frame!'],
  wall: ['Cage ricochet!', 'Off the boards!', 'Wall pass of sorts!'],
  tackle: ['Cleanly won!', 'Great timing!', 'Nicked away!', 'Strong challenge!', 'Read that perfectly.'],
  slide: ['Slides in and wins it!', 'Clean slide!', 'Textbook sliding tackle.'],
  goal: ['Clinical finish!', 'The net bulges!', 'Scenes in the stands!', 'Pure class!', 'Buried it!', 'Into the top corner!', 'Nothing the keeper could do!', 'The roof nearly comes off!'],
  header: ['A towering header!', 'Rises above them all!', 'Gets his head to it!', 'Nods it goalwards!'],
  og: ['Oh no, that went in off him!', 'An own goal, cruel luck!'],
  kickoff: ['And we are underway!', 'The referee gets us going.', 'Kick-off, and a big crowd in tonight.', 'Here we go!'],
  second: ['The second half begins.', 'Back underway for the second half.'],
  cross: ['Swings it in!', 'Whips in the cross!', 'Lofted into the box!', 'Delivery from the flank!'],
  through: ['Threads the needle!', 'Lovely weighted through ball!', 'Splits the defence!'],
  skill: ['Oh, the step-over!', 'Turned him inside out!', 'Lovely feet!', 'Skips past his man!', 'A bit of magic there.'],
  foul: ['That is a foul.', 'Clumsy from behind.', 'The whistle goes.', 'Mistimed that one.'],
  yellow: ['Into the book he goes.', 'Yellow card, fair enough.', 'Cautioned.'],
  red: ['Off! He is sent off!', 'A red card, and that changes everything.', 'Down to ten men.'],
  offside: ['The flag is up. Offside.', 'Timed that run a touch early.', 'Caught offside.'],
  corner: ['Corner kick.', 'They will have a corner.', 'Out for a corner.'],
  goalkick: ['Goal kick.', 'Wide, goal kick.'],
  throw: ['Throw-in.', 'Out for a throw.'],
  freekick: ['Free kick in a dangerous spot.', 'A free kick here, in shooting range.', 'Wall lining up.'],
  penalty: ['Penalty! The referee points to the spot!', 'It is a penalty!'],
  pengoal: ['Sends the keeper the wrong way!', 'Coolly converted from the spot.'],
  penmiss: ['Saved! A huge moment.', 'Misses from the spot!'],
  miss: ['Wide of the mark.', 'Over the bar!', 'Not this time.', 'He will want that one back.', 'Should have done better.'],
  half: ['The referee blows for half time.', 'That is the break.'],
  full: ['Full time!', 'The final whistle goes.', 'And that is it, over.'],
  stoppage: ['The board goes up for added time.', 'Minutes added on.'],
  late: ['Late drama!', 'Right at the death!', 'In the dying moments!'],
  equaliser: ['They are level!', 'All square again!'],
  comeback: ['What a turnaround!', 'They have come back from behind!'],
  claim: ['The keeper comes and claims it.', 'Confident handling.'],
  final: ['Thirty seconds left. Everything on the line!', 'Last half minute, the cage is roaring!'],
  advantage: ['Advantage played, good refereeing.', 'Plays on, advantage.'],
  et: ['Extra time it is.', 'Thirty more minutes to settle this.'],
};
function say(text, life) {
  if (!S || S.demo) return;
  S.say = { text, age: 0, life: life || 2.6 };
}
function sayRare(kind, force) {
  if (!S || S.demo) return;
  if (S.sayCD > 0 && !force) return;
  S.sayCD = 2.4;
  say(pick(LINES[kind]));
}

/* ------------------------------------------------------------------ squads, kits, players */
// how well a squad member signed for one role fills another
const COMPAT = {
  GK: { GK: 10 }, CB: { CB: 10, DM: 6, FB: 5, CM: 3 }, FB: { FB: 10, WB: 9, CB: 5, W: 4, WM: 5, CM: 3 }, WB: { FB: 9, W: 7, WM: 8, CM: 4 },
  DM: { DM: 10, CM: 8, CB: 5, AM: 4 }, CM: { CM: 10, DM: 8, AM: 8, WM: 5 }, AM: { AM: 10, CM: 8, ST: 5, W: 5 }, WM: { W: 9, FB: 5, CM: 6, AM: 5 },
  W: { W: 10, WM: 8, AM: 6, ST: 5, FB: 3 }, ST: { ST: 10, AM: 6, W: 6 },
};
function squadFor(formKey) {
  const slots = FORMS[formKey].slots, n = slots.length;
  if (formKey === 'cage') return CAGE_PICK.slice();
  const pairs = [];
  for (let s = 0; s < n; s++) for (let q = 0; q < 11; q++) pairs.push([(COMPAT[slots[s][2]][SQ_ROLE[q]] || 0) + (s === q ? 0.5 : 0), s, q]);
  pairs.sort((a, b) => b[0] - a[0]);
  const out = new Array(n).fill(-1), used = new Set();
  for (const pr of pairs) { if (out[pr[1]] >= 0 || used.has(pr[2])) continue; out[pr[1]] = pr[2]; used.add(pr[2]); }
  return out;
}
const hashN = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function attrsFor(club, sq) {
  const r = TEAMS[club].rating, role = SQ_ROLE[sq], h = (k) => (hashN(club * 101 + sq * 13 + k) - 0.5) * 0.16;
  const b = { pace: 0, pass: 0, shot: 0, tack: 0, head: 0, keep: 0 };
  if (role === 'ST') { b.shot = 0.14; b.pace = 0.05; b.head = 0.08; }
  else if (role === 'W') { b.pace = 0.14; b.shot = 0.05; b.pass = 0.04; }
  else if (role === 'AM') { b.pass = 0.12; b.shot = 0.06; }
  else if (role === 'CM') { b.pass = 0.09; b.tack = 0.03; }
  else if (role === 'DM') { b.tack = 0.11; b.pass = 0.05; }
  else if (role === 'CB') { b.tack = 0.15; b.head = 0.14; b.pace = -0.05; b.shot = -0.12; }
  else if (role === 'FB') { b.pace = 0.07; b.tack = 0.07; b.shot = -0.06; }
  else if (role === 'GK') { b.keep = 0.14; b.pace = -0.1; b.shot = -0.3; }
  const a = {};
  let k = 0;
  for (const key in b) a[key] = clamp(r + b[key] + h(k++), 0.25, 0.97);
  return a;
}
function pickKits(th, ta) {
  const k0 = { c1: th.c1, c2: th.c2, shorts: th.shorts, sock: th.sock };
  let k1 = { c1: ta.c1, c2: ta.c2, shorts: ta.shorts, sock: ta.sock };
  if (colDist(k0.c1, k1.c1) < 140) k1 = { c1: ta.alt.c1, c2: ta.alt.c2, shorts: ta.alt.shorts, sock: ta.alt.sock };
  if (colDist(k0.c1, k1.c1) < 140) k1 = { c1: '#f6f1e7', c2: '#222', shorts: '#222', sock: '#f6f1e7' };
  [k0, k1].forEach((k, i) => {
    let best = GK_COLS[0], bs = -1;
    GK_COLS.forEach((c) => { const s = Math.min(colDist(c, k0.c1), colDist(c, k1.c1), colDist(c, '#2f9a55') * 1.2, colDist(c, '#14141a') * 1.4); if (s > bs && !(i === 1 && c === k0.gk)) { bs = s; best = c; } });
    k.gk = best; k.gkTrim = '#1b1b22';
  });
  return [k0, k1];
}
function mkPlayer(team, k, club, slot, sq) {
  const T = TEAMS[club];
  return {
    team, k, i: 0, club, sq, role: slot[2], cat: CAT[slot[2]], ax: slot[0], ay: slot[1], num: SQ_NUM[sq], name: T.names[sq],
    att: attrsFor(club, sq),
    x: 0, y: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, fx: team ? -1 : 1, fy: 0,
    sprint: false, stam: 1, tired: false, phase: rnd() * 6, kx: 0, ky: 0,
    slideT: 0, slideCD: 0, slideDX: 1, slideDY: 0, slideTouched: false, slideHit: false,
    tackleCD: 0, tackleAnim: 0, stunT: 0, noBallT: 0, kickT: 0, cheer: 0, hold: 0, headT: 0, jumpT: 0,
    aiT: rnd() * 0.3, rx: 0, ry: 0, rT: 0, mark: null, holdT: 0, run: 0,
    diving: false, diveE: 0, diveY0: 0, diveY1: 0, diveX0: 0, diveX1: 0, diveRec: 0, diveDelay: -1, diveTo: 0, diveDir: 0,
    lunge: 0, react: 0, seenEvt: -1, fooled: 0, skillT: 0, skillCD: 0,
    yellow: 0, out: false, leaving: 0, offId: -1,
    st: { g: 0, a: 0, sh: 0, sot: 0, pa: 0, pc: 0, tk: 0, int: 0, sv: 0, fo: 0, yc: 0, rc: 0, rating: 6 },
  };
}
const ON = (p) => !p.out;

function newMatch(cfg) {
  setVenue(cfg.venue || 'stadium');
  const th = TEAMS[cfg.home], ta = TEAMS[cfg.away];
  const cage = VN.walls;
  const f0 = cage ? 'cage' : (cfg.form0 || th.form), f1 = cage ? 'cage' : (cfg.form1 || ta.form);
  S = {
    cfg, demo: !!cfg.demo, venue: VN.key, teams: [th, ta], club: [cfg.home, cfg.away], hostTeam: cfg.hostTeam || 0,
    kits: pickKits(cfg.hostTeam === 1 ? ta : th, cfg.hostTeam === 1 ? th : ta),
    dir: [1, -1], half: 1, period: 1, phase: 'restart', phaseT: 0, kickTeam: 0,
    pt: 0, periodLen: Math.max(30, (cfg.len || 6) * 30), added: 0, addedShown: false, lost: 0,
    score: [0, 0], skill: [0.64, cfg.skill], kskill: [0.62, cfg.skill],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, cv: 0, owner: null, held: false, lastTouch: null, lastTeam: 0, spin: 0, inGoal: 0 },
    players: [], tp: [[], []], form: [f0, f1], tac: [{ form: f0, ment: cfg.ment0 || 0, press: 1 }, { form: f1, ment: ta.ment, press: 1 }],
    ctrl: -1, switchLock: 0, charge: 0, charging: false, chargeKind: 'shot',
    stats: { shots: [0, 0], sot: [0, 0], poss: [0, 0.001], fouls: [0, 0], saves: [0, 0], corners: [0, 0], offsides: [0, 0], yc: [0, 0], rc: [0, 0], passes: [0, 0], passOk: [0, 0], tackles: [0, 0] },
    scorers: [], cards: [], nets: [{ amp: 0, t: 0, y: 0, z: 0 }, { amp: 0, t: 0, y: 0, z: 0 }],
    t: 0, slow: 1, say: null, sayCD: 0, sfxWall: 0, restrict: null, rs: null, goalP: null, goalTeam: -1,
    chase: [[], []], infoT: 0, markT: 0, passTarget: null, passT: 0,
    last30: false, excite: 0, crowdT: 0, chantT: 6, flash: 0, fade: 0, brk: null, pen: null,
    evt: 0, evq: [], formDay: [1, 1], morale: [0, 0],
    kickId: 0, lastKick: null, offChk: null, lastPass: null, assist: null,
    line: [-0.6, -0.6], offLine: [0, 0], wk: null, replay: null, lastGoalT: -99, band: null, advT: 0, advTeam: -1,
    ref: { x: 0, y: -120, vx: 0, vy: 0, fx: 0, fy: 1, role: 'REF', ref: true, cheer: 0 },
    ars: [{ x: -HL * 0.5, y: HW + 26, vx: 0, vy: 0, fx: 0, fy: -1, role: 'AR', ref: true, flag: 0 }, { x: HL * 0.5, y: -HW - 26, vx: 0, vy: 0, fx: 0, fy: 1, role: 'AR', ref: true, flag: 0 }],
    matchNo: cfg.matchNo || 1, label: cfg.label || '',
  };
  // a better or worse day: each side plays a few percent above or below its level this match
  S.formDay = [1 + (rnd() - 0.5) * 0.08, 1 + (rnd() - 0.5) * 0.12];
  S.skill = [clamp(S.skill[0] * S.formDay[0], 0.2, 0.95), clamp(S.skill[1] * S.formDay[1], 0.2, 0.96)];
  S.kskill = [clamp(0.6 * S.formDay[0], 0.3, 0.9), clamp(cfg.skill * 0.95 * S.formDay[1], 0.25, 0.95)];
  buildTeams();
  S.ctrl = -1;
  if (cfg.training) return;
  startRestart('kickoff', 0, 0, 0, { snap: true });
  CAM.snap = true;
  syncMatch3D();
}
// (re)build both sides from their formations; keeps sent-off players out and the stats of those who stay
function buildTeams() {
  const keep = S.players.slice();
  S.players.length = 0; S.tp = [[], []];
  for (let t = 0; t < 2; t++) {
    const fk = S.form[t], slots = FORMS[fk].slots, map = squadFor(fk), club = S.club[t];
    const n = S.cfg.training ? S.cfg.roster[t] : slots.length;
    for (let k = 0; k < n; k++) {
      const s = S.cfg.training ? S.cfg.slots[t][k] : slots[k];
      const sq = S.cfg.training ? S.cfg.sqs[t][k] : map[k];
      const old = keep.find((q) => q.team === t && q.sq === sq);
      const p = old || mkPlayer(t, k, club, s, sq);
      p.k = k; p.role = s[2]; p.cat = CAT[s[2]]; p.ax = s[0]; p.ay = s[1];
      p.i = S.players.length; S.players.push(p); S.tp[t].push(p);
    }
  }
}
// a formation change at half time or from the tactics screen: same eleven, new shape
function changeFormation(t, fk) {
  if (!S || S.venue !== 'stadium' || !FORMS[fk] || S.form[t] === fk) return;
  const slots = FORMS[fk].slots, map = squadFor(fk);
  S.form[t] = fk; S.tac[t].form = fk;
  for (const p of S.tp[t]) {
    const k = map.indexOf(p.sq); if (k < 0) continue;
    const s = slots[k]; p.role = s[2]; p.cat = CAT[s[2]]; p.ax = s[0]; p.ay = s[1];
  }
}

const attackX = (team) => S.dir[team] * HL;
const kitOf = (t) => S.kits[t === S.hostTeam ? 0 : 1];
const ownGoalX = (team) => -S.dir[team] * HL;
const possTeam = () => (S.ball.owner ? S.ball.owner.team : S.ball.lastTeam);
const gkOf = (t) => { for (const p of S.tp[t]) if (p.role === 'GK' && !p.out) return p; return S.tp[t][0]; };

/* ------------------------------------------------------------------ the clock */
// game minutes per period, and the minute each period starts at
const perMins = () => (S.period > 2 ? 15 : VN.gameMins / 2);
const perBase = () => (S.period === 1 ? 0 : S.period === 2 ? VN.gameMins / 2 : S.period === 3 ? VN.gameMins : VN.gameMins + 15);
const perReal = () => (S.period > 2 ? S.periodLen / 3 : S.periodLen);
function gameMinute() { return perBase() + S.pt / perReal() * perMins(); }
function matchClock() {
  const m = gameMinute(), mm = Math.floor(m), ss = Math.floor((m - mm) * 60);
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
}
// minutes added: from the time lost to goals, cards, fouls and injuries this period
function addedFor() { const lost = S.lost / 60; return S.period === 1 || S.period === 3 ? clamp(Math.round(lost * 0.8 + 0.6), 1, 3) : clamp(Math.round(lost * 0.8 + 1.2), 1, 6); }
function periodOver() { return S.pt >= perReal() * (perMins() + S.added) / perMins(); }
function loseTime(gameSecs) { S.lost += gameSecs; }

/* ------------------------------------------------------------------ ball ownership and kicks */
function takeBall(p, hold) {
  const b = S.ball;
  if (b.owner !== p) S.evt++;
  // offside: the flag goes up when a player in an offside position becomes involved
  if (S.offChk && S.phase === 'play' && p.offId === S.offChk.id && p.team === S.offChk.team && b.lastTeam === p.team) { callOffside(p); return; }
  if (S.offChk && p.team !== S.offChk.team) S.offChk = null;
  // pass completion and the assist trail
  const lp = S.lastPass;
  if (lp && S.t - lp.t < 5) {
    if (lp.team === p.team && lp.from !== p) { lp.from.st.pc++; S.stats.passOk[p.team]++; S.assist = { p: lp.from, to: p, t: S.t }; }
    else if (lp.team !== p.team) { p.st.int++; S.assist = null; }
    S.lastPass = null;
  } else if (b.lastTeam !== p.team) S.assist = null;
  b.owner = p; b.lastTouch = p; b.lastTeam = p.team; b.vz = 0; b.cv = 0; b.z = p.role === 'GK' && p.holdT > 0 ? 15 : 0; b.held = false;
  p.hold = 0;
  if (hold) { p.holdT = 1.1 + rnd() * 0.9; b.z = 15; }
  if (S.passTarget && S.passTarget.team !== p.team) S.passTarget = null;
  if (S.passTarget === p) S.passTarget = null;
  if (S.restrict && p.team !== S.restrict.team) S.restrict = null;
}
function releaseBall(p) {
  const b = S.ball;
  if (b.owner !== p) return;
  b.owner = null; b.held = false; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
}
function speedFor(d, vEnd) {
  const c = FR_C / FR_K; let t = d / 420, v = vEnd;
  for (let i = 0; i < 4; i++) { v = vEnd + FR_K * (d + c * t); t = Math.log((v + c) / (vEnd + c)) / FR_K; }
  return v;
}
// offside positions are judged the moment a team-mate plays the ball
function markOffside(p) {
  if (VN.walls || S.cfg.training) { S.offChk = null; return; }
  const t = p.team, d = S.dir[t], line = Math.max(offsideLine(t), S.ball.x * d, 0);
  S.offChk = { team: t, id: ++S.kickId };
  for (const m of S.tp[t]) {
    if (m === p || m.out || m.role === 'GK') continue;
    if (m.x * d > line + 3) m.offId = S.kickId;
  }
}
// the second-last defender of the side that team t attacks, in t's attacking direction
function offsideLine(t) {
  const d = S.dir[t];
  let a = -1e9, b2 = -1e9;
  for (const o of S.tp[1 - t]) { if (o.out) continue; const v = o.x * d; if (v > a) { b2 = a; a = v; } else if (v > b2) b2 = v; }
  return b2;
}
function kickBall(p, dx, dy, speed, vz, kind, curl) {
  const b = S.ball; const m = hyp(dx, dy) || 1; dx /= m; dy /= m;
  if (b.owner === p) {
    b.owner = null; b.held = false;
    b.x = p.x + dx * (PR + BR + 1.5); b.y = p.y + dy * (PR + BR + 1.5);
  }
  b.vx = dx * speed; b.vy = dy * speed; b.vz = vz; b.cv = curl || 0; if (vz > 0) b.z = Math.max(b.z, 1.5);
  b.lastTouch = p; b.lastTeam = p.team; p.noBallT = 0.3; p.kickT = 0.22; p.fx = dx; p.fy = dy;
  S.lastKick = { p, kind, t: S.t };
  S.evt++; pushEvt(kind === 'shot' || kind === 'header' ? kind : kind === 'throw' ? 'throw' : 'pass', p, null, speed);
  if (S.restrict && p.team !== S.restrict.team) S.restrict = null;
  if (kind !== 'shot' && kind !== 'header') { S.lastPass = { from: p, team: p.team, t: S.t }; p.st.pa++; S.stats.passes[p.team]++; }
  if (S.rs && S.rs.noOffside) S.offChk = null; else markOffside(p);
  if (VN.walls) ballConfine();
  const pw = clamp(speed / 900, 0, 1);
  if (kind !== 'throw') for (let i = 0; i < 3; i++) spawn(0, b.x, b.y, 2, (rnd() - 0.5) * 60 - dx * 30, (rnd() - 0.5) * 60 - dy * 30, 20 + rnd() * 20, 0.35, '#e8efdc', 3);
  if (kind === 'shot') snd.kick(pw); else if (kind === 'header') snd.head(); else snd.pass();
  if (!S.demo && p.team === 0 && p.i === S.ctrl) arc.haptic(kind === 'shot' ? 'hit' : 'tap', kind === 'shot' ? 0.5 + pw * 0.5 : 0.35);
  if (kind === 'shot' || kind === 'header') S.excite = Math.min(1, S.excite + 0.5);
  recordEvent(kind === 'shot' || kind === 'header' ? 1 : 0, p);
}
function ballConfine() {
  const b = S.ball;
  if (abs(b.x) > HL - BR && abs(b.y) < GH && b.z < GOAL_H) return;
  confine(b, BR);
}

/* ------------------------------------------------------------------ geometry helpers */
function confine(o, r) {
  if (!VN.walls) {
    // the stadium: people may step a little off the pitch but not into the stands
    const ix = HL + 90, iy = HW + 70;
    if (o.x > ix) o.x = ix; else if (o.x < -ix) o.x = -ix;
    if (o.y > iy) o.y = iy; else if (o.y < -iy) o.y = -iy;
    return;
  }
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
  const opp = S.tp[1 - team];
  for (let i = 0; i < opp.length; i++) {
    const o = opp[i]; if (o.out || (o.role === 'GK' && !withGK)) continue;
    const d = segDist(o.x, o.y, ax, ay, bx, by); if (d < m) m = d;
  }
  return m;
}
function nearestOpp(p, skipGK) {
  let best = null, bd = 1e9;
  const opp = S.tp[1 - p.team];
  for (let i = 0; i < opp.length; i++) {
    const o = opp[i]; if (o.out || (skipGK && o.role === 'GK')) continue;
    const d = hyp(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; }
  }
  S.nearD = bd; return best;
}
function inBox(x, y, defTeam) { const gx = ownGoalX(defTeam); return abs(x - gx) < VN.boxD && abs(y) < VN.boxW && x * sgn(gx) > 0; }

/* ------------------------------------------------------------------ events the 3D side reacts to */
function pushEvt(kind, p, q, v) { if (S.evq.length < 24) S.evq.push({ kind, p, q, v: v || 0, t: S.t }); }

/* ------------------------------------------------------------------ particles (light puffs and confetti) */
const PT = [];
for (let i = 0; i < 260; i++) PT.push({ a: false, kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, col: '#fff', size: 3, rot: 0, vr: 0 });
function spawn(kind, x, y, z, vx, vy, vz, life, col, size) {
  if (S && S.replay && S.replay.on) return;
  for (let i = 0; i < PT.length; i++) {
    const q = PT[i]; if (q.a) continue;
    q.a = true; q.kind = kind; q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.life = life; q.max = life; q.col = col; q.size = size; q.rot = rnd() * TAU; q.vr = (rnd() - 0.5) * 12;
    return;
  }
}
function confetti(x, y, team) {
  if (arc.reducedMotion) return;
  const k = kitOf(team), cols = [k.c1, k.c2, '#ffb736', '#ff6940', '#fbf5ec'];
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
  const sp0 = hyp(b.vx, b.vy), n = sp0 * dt > 9 ? Math.min(8, Math.ceil(sp0 * dt / 9)) : 1, h = dt / n;
  for (let k = 0; k < n; k++) ballStep(h);
  b.spin += hyp(b.vx, b.vy) * dt / BR;
}
function carry(dt) {
  const b = S.ball, p = b.owner;
  if (p.stunT > 0 || p.slideT > 0 || p.diving) { releaseBall(p); return; }
  if (b.held) { b.x = p.x + p.fx * (p.role === 'GK' ? 8 : 4); b.y = p.y + p.fy * (p.role === 'GK' ? 8 : 4); b.z = p.role === 'GK' ? 15 : 58; b.vx = b.vy = b.vz = 0; return; }
  if (p.role === 'GK' && p.holdT > 0) { b.x = p.x + p.fx * 8; b.y = p.y + p.fy * 8; b.z = 15; b.vx = b.vy = b.vz = 0; return; }
  const spd = hyp(p.vx, p.vy);
  const d = PR + BR - 1 + (p.sprint ? 5 : 1.5) + Math.sin(p.phase * 2) * 3.2 * Math.min(1, spd / 120);
  const tx = p.x + p.fx * d, ty = p.y + p.fy * d;
  const k = 1 - Math.exp(-26 * dt);
  b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.z = 0; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
  if (VN.walls) confine(b, BR);
  b.spin += spd * dt / BR;
}
function netHit(side, y, z, sp) {
  const n = S.nets[side > 0 ? 1 : 0];
  n.amp = Math.min(1, 0.35 + sp / 700); n.t = 0; n.y = y; n.z = z;
  snd.net();
  if (sp > 380) pushEvt('net', null, null, sp);
}
function ballStep(h) {
  const b = S.ball;
  b.vz -= GRAV * h;
  // curl: a sideways push that fades as the spin dies
  if (b.cv) {
    const sp = hyp(b.vx, b.vy);
    if (sp > 60) { const nx = -b.vy / sp, ny = b.vx / sp; b.vx += nx * b.cv * h; b.vy += ny * b.cv * h; }
    b.cv *= Math.exp(-1.1 * h); if (abs(b.cv) < 4) b.cv = 0;
  }
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
  if (VN.walls && b.z > ROOF - BR) { b.z = ROOF - BR; if (b.vz > 0) b.vz = -b.vz * 0.4; }
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
  if (VN.walls) { cageWalls(b, ax); return; }
  // the stadium: the goal, and the lines
  const sx = sgn(b.x);
  if (b.inGoal) {
    // inside the net: side netting, roof and the back
    if (b.y > GH - BR) { b.y = GH - BR; if (b.vy > 0) b.vy *= -0.2; } else if (b.y < -(GH - BR)) { b.y = -(GH - BR); if (b.vy < 0) b.vy *= -0.2; }
    if (b.z > GOAL_H - BR) { b.z = GOAL_H - BR; if (b.vz > 0) b.vz *= -0.2; }
    if (ax > HL + GD - BR) { const spx = abs(b.vx); b.x = sx * (HL + GD - BR); if (b.vx * sx > 0) { b.vx *= -0.14; b.vy *= 0.5; netHit(sx, b.y, b.z, spx); } }
    if (ax < HL - BR) { b.x = sx * (HL - BR); if (b.vx * sx < 0) b.vx *= -0.3; }
    return;
  }
  if (ax > HL + BR * 0.5) {
    if (abs(b.y) < GH - BR * 0.5 && b.z < GOAL_H - BR * 0.5) { b.inGoal = sx; goalCheck(sx); return; }
    // wide of the post or over: the side netting from outside stops it, otherwise it is out of play
    if (ax < HL + GD && abs(b.y) < GH + BR && b.z < GOAL_H) { b.y = sgn(b.y) * (GH + BR); if (b.vy * sgn(b.y) < 0) b.vy *= -0.3; b.vx *= 0.6; }
    if (ax > HL + BR * 2.2) ballOut('end', sx);
  } else if (abs(b.y) > HW + BR * 2.2) ballOut('side', sgn(b.y));
}
function cageWalls(b, ax) {
  if (ax > HL - BR) {
    const mouth = abs(b.y) < GH - 1 && b.z < GOAL_H - 2;
    const sx = sgn(b.x);
    if (ax > HL) {
      if (b.y > GH - BR) { b.y = GH - BR; if (b.vy > 0) b.vy *= -0.2; } else if (b.y < -(GH - BR)) { b.y = -(GH - BR); if (b.vy < 0) b.vy *= -0.2; }
      if (b.z > GOAL_H - BR) { b.z = GOAL_H - BR; if (b.vz > 0) b.vz *= -0.2; }
      if (ax > HL + GD - BR) { const spx = abs(b.vx); b.x = sx * (HL + GD - BR); if (b.vx * sx > 0) { b.vx *= -0.14; b.vy *= 0.5; netHit(sx, b.y, b.z, spx); } }
      if (!b.inGoal && abs(b.y) < GH && b.z < GOAL_H) { b.inGoal = sx; goalCheck(sx); }
    } else if (!mouth) {
      b.x = sx * (HL - BR);
      if (b.vx * sx > 0) { wallBounce(abs(b.vx)); b.vx *= -0.72; b.vy *= 0.96; }
    }
  }
  if (ax <= HL) {
    if (b.y > HW - BR) { b.y = HW - BR; if (b.vy > 0) { wallBounce(b.vy); b.vy *= -0.76; b.vx *= 0.96; } }
    else if (b.y < -HW + BR) { b.y = -HW + BR; if (b.vy < 0) { wallBounce(-b.vy); b.vy *= -0.76; b.vx *= 0.96; } }
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
  pushEvt('post', null, null, 0);
  if (!S.demo) { arc.haptic('hit', 0.9); if (POST) POST.kick(-3); }
  if (S.phase === 'penalties') return;
  sayRare('post', true);
  const b = S.ball; for (let i = 0; i < 4; i++) spawn(2, b.x, b.y, b.z, (rnd() - 0.5) * 120, (rnd() - 0.5) * 120, 40 + rnd() * 50, 0.4, '#ffe9a8', 2);
}
function goalCheck(sx) {
  if (S.phase === 'penalties') { penBallInGoal(); return; }
  if (S.cfg.training) { trainGoal(sx); return; }
  if (S.phase !== 'play') return;
  scoreGoal(sx);
}
// the ball has crossed a line: a throw-in, a corner or a goal kick
function ballOut(kind, s) {
  if (S.phase !== 'play') return;
  if (S.cfg.training) { trainOut(); return; }
  const b = S.ball, last = b.lastTeam;
  S.offChk = null;
  if (kind === 'side') {
    const team = 1 - last;
    startRestart('throw', team, clamp(b.x, -HL + 20, HL - 20), s * HW, {});
    return;
  }
  // which team defends this end
  const def = S.dir[0] === -s ? 0 : 1;
  if (last === def) {
    S.stats.corners[1 - def]++;
    startRestart('corner', 1 - def, s * (HL - 4), sgn(b.y || 1) * (HW - 4), {});
  } else {
    startRestart('goalkick', def, s * (HL - VN.sixD * 0.6), sgn(b.y || 1) * VN.sixW * 0.5, {});
    if (S.lastKick && S.lastKick.kind === 'shot' && S.t - S.lastKick.t < 2.5 && S.lastKick.p.team !== def) { sayRare('miss', true); snd.ooh(); if (W3.crowd) W3.crowd.react('groan', 0.6); }
  }
}

/* ------------------------------------------------------------------ goals */
function scoreGoal(sx) {
  const b = S.ball;
  const team = S.dir[0] === sx ? 0 : 1;
  let scorer = b.lastTouch, og = false;
  if (!scorer || scorer.team !== team) { og = !!scorer; if (!scorer) scorer = S.tp[team][S.tp[team].length - 1]; }
  const was = S.score.slice();
  S.score[team]++;
  if (!og) { scorer.st.g++; if (S.assist && S.assist.to === scorer && S.assist.p.team === team && S.t - S.assist.t < 9) S.assist.p.st.a++; }
  S.scorers.push({ team, name: scorer.name, clock: Math.ceil(gameMinute()) + "'", og, num: scorer.num });
  S.phase = 'goal'; S.phaseT = 0; S.goalTeam = team; S.goalP = { x: scorer.x, y: scorer.y, p: scorer }; S.charging = false; S.charge = 0; S.rs = null;
  S.lastGoalT = S.t; S.lastGoalSx = sx; S.offChk = null;
  S.morale[team] = Math.min(1, S.morale[team] + 0.35); S.morale[1 - team] = Math.max(-1, S.morale[1 - team] - 0.3);
  // the scorer heads for the corner flag on his side, team-mates chase him
  S.goalP.cx = sx * (HL - 40); S.goalP.cy = sgn(scorer.y || 1) * (HW - 40);
  S.tp[team].forEach((p) => { if (!p.out) p.cheer = 3.2; });
  pushEvt('goal', scorer, null, team);
  S.excite = 1; S.flash = arc.reducedMotion ? 0 : 1;
  confetti(b.x, b.y, team);
  snd.roar(true); snd.whistle(0);
  loseTime(35);
  if (!S.demo) {
    arc.haptic(team === 0 ? 'success' : 'fail', 1); if (POST) { POST.flash(team === 0 ? 0.24 : 0.1, '#fff2d0'); POST.kick(-5); }
    arc.toast('GOAL!', scorer.name + (og ? ' (og)' : '') + '  ' + S.teams[team].abbr + '  ' + Math.ceil(gameMinute()) + "'", 2800);
    const late = gameMinute() > VN.gameMins - 5;
    const head = S.lastKick && S.lastKick.kind === 'header' && S.lastKick.p === scorer;
    let line = og ? pick(LINES.og) : head ? pick(LINES.header) : pick(LINES.goal);
    if (!og && was[team] < was[1 - team] && S.score[team] === S.score[1 - team]) line = pick(LINES.equaliser) + ' ' + line;
    else if (!og && was[team] === was[1 - team] && late) line = pick(LINES.late) + ' ' + line;
    say(line, 3.2);
  }
}

/* ------------------------------------------------------------------ restarts */
// One machine for every stoppage: the players take up their places (stage 'walk'), then the taker stands over
// the ball (stage 'ready') until the kick, throw or tap. The human side chooses its own; the other side thinks.
const RS_WALK = { kickoff: 1.7, throw: 1.1, corner: 2.0, goalkick: 1.5, free: 2.0, pen: 2.2 };
function startRestart(type, team, x, y, o) {
  o = o || {};
  const b = S.ball;
  S.phase = 'restart'; S.phaseT = 0; S.charging = false; S.charge = 0;
  S.rs = { type, team, x, y, stage: 'walk', t: 0, taker: null, direct: o.direct !== false, wall: [], aimY: 0, aimH: 26, think: 0.7 + rnd() * 0.9, noOffside: type === 'throw' || type === 'corner' || type === 'goalkick', ballOut: !o.snap && type !== 'kickoff' && type !== 'free' && type !== 'pen', humanKeeper: false, auto: 0, inRange: false };
  const rs = S.rs;
  rs.taker = takerFor(type, team, x, y);
  for (const p of S.players) p.wallX = undefined;
  // a direct free kick in shooting range brings a wall
  if (type === 'free' && rs.direct) {
    const gx = attackX(team), dg = hyp(gx - x, y);
    rs.inRange = dg < (VN.walls ? 420 : 1050) && abs(y) < (VN.walls ? HW : HW * 0.7);
    if (rs.inRange && !VN.walls) buildWall(rs);
  }
  if (type === 'pen') rs.inRange = true;
  S.offChk = null; S.preDive = null; S.gkWin = 0;
  for (const p of S.players) { p.humanDive = false; if (!p.out) { restartSpot(p, rs); p.slideT = 0; p.stunT = Math.min(p.stunT, 0.3); p.diving = false; p.dvx = p.dvy = 0; } }
  if (!rs.ballOut) { b.owner = null; b.x = x; b.y = y; b.z = 0; b.vx = b.vy = b.vz = 0; b.cv = 0; b.inGoal = 0; }
  if (o.snap) { for (const p of S.players) { if (p.out) continue; p.x = p.kx; p.y = p.ky; p.vx = p.vy = 0; } rs.t = RS_WALK[type]; }
  // the human side's keeper is theirs to move on a direct free kick or penalty against them
  rs.humanKeeper = !S.demo && team === 1 && rs.inRange;
  if (!S.demo) {
    if (team === 0 && rs.taker) { S.ctrl = rs.taker.i; S.switchLock = 1; }
    else if (rs.humanKeeper) { S.ctrl = gkOf(0).i; S.switchLock = 1; }
  }
  if (type !== 'kickoff') {
    snd.whistle(0);
    if (!S.demo) {
      const nm = S.teams[team].short;
      if (type === 'corner') { arc.toast('Corner', nm, 1400); sayRare('corner'); }
      else if (type === 'goalkick') { arc.toast('Goal kick', nm, 1200); sayRare('goalkick'); }
      else if (type === 'throw') { if (rnd() < 0.25) sayRare('throw'); }
      else if (type === 'free' && rs.inRange) { say(pick(LINES.freekick)); }
    }
    loseTime(type === 'throw' ? 6 : 12);
  }
  S.passTarget = null;
}
function takerFor(type, team, x, y) {
  let best = null, bs = -1e9;
  for (const p of S.tp[team]) {
    if (p.out) continue;
    let s = -hyp(p.x - x, p.y - y) * 0.01;
    if (type === 'goalkick') s = p.role === 'GK' ? 100 : -100;
    else if (p.role === 'GK') s -= 100;
    if (type === 'kickoff') s += p.role === 'ST' ? 20 : p.role === 'AM' || p.role === 'W' ? 10 : 0;
    if (type === 'throw') s += p.cat === 'DEF' ? 3 : p.role === 'W' || p.role === 'WM' ? 2 : 0;
    if (type === 'corner') s += p.att.pass * 10 + (p.role === 'W' || p.role === 'WM' ? 6 : p.role === 'CB' || p.role === 'ST' ? -20 : 0);
    if (type === 'free') s += p.att.shot * 6 + p.att.pass * 6 - (p.role === 'CB' ? 4 : 0);
    if (type === 'pen') s += p.att.shot * 20 + (p.role === 'ST' ? 6 : 0);
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
function buildWall(rs) {
  const def = 1 - rs.team, gx = ownGoalX(def), gy = 0;
  const dx = gx - rs.x, dy = gy - rs.y, dm = hyp(dx, dy) || 1, ux = dx / dm, uy = dy / dm;
  const n = dm < 650 ? 4 : dm < 900 ? 3 : 2;
  // the wall covers the near post side; the keeper the far one
  const near = rs.y >= 0 ? 1 : -1, nx = -uy, ny = ux, shift = (near * ny >= 0 ? 1 : -1) * 12;
  const cand = S.tp[def].filter((p) => !p.out && p.role !== 'GK').sort((a, b) => hyp(a.x - rs.x, a.y - rs.y) - hyp(b.x - rs.x, b.y - rs.y)).slice(0, n);
  cand.forEach((p, i) => { p.wallX = rs.x + ux * WALL_D + nx * ((i - (n - 1) / 2) * 30 + shift); p.wallY = rs.y + uy * WALL_D + ny * ((i - (n - 1) / 2) * 30 + shift); });
  rs.wall = cand;
}
// where each player stands for this restart
function restartSpot(p, rs) {
  const t = p.team, d = S.dir[t], att = t === rs.team, type = rs.type;
  if (p === rs.taker) {
    // behind the ball, facing where it is going
    let fx = d, fy = 0;
    if (type === 'throw') { fx = 0; fy = -sgn(rs.y); }
    else if (type === 'corner') { fx = -sgn(rs.x); fy = -sgn(rs.y) * 0.6; }
    const m = hyp(fx, fy) || 1; fx /= m; fy /= m;
    const back = type === 'throw' ? -4 : type === 'pen' ? 36 : 22;
    p.kx = rs.x - fx * back; p.ky = rs.y - fy * back; p.tfx = fx; p.tfy = fy;
    if (type === 'throw') { p.kx = rs.x; p.ky = rs.y + sgn(rs.y) * 6; }
    return;
  }
  p.tfx = undefined;
  if (type === 'pen') {
    // everyone outside the box and the arc, level with or behind the spot
    if (p.role === 'GK' && !att) { p.kx = ownGoalX(t) + d * 6; p.ky = 0; p.tfx = d; p.tfy = 0; return; }
    const gx = ownGoalX(1 - rs.team), sx = sgn(gx);
    const k = (p.i * 37) % 19;
    p.kx = gx - sx * (VN.boxD + 50 + (k % 3) * 40); p.ky = (k / 18 - 0.5) * VN.boxW * 1.5;
    if (p.role === 'GK') { p.kx = ownGoalX(t) + d * 30; p.ky = 0; }
    return;
  }
  if (type === 'kickoff') {
    anchor(p, AA, true);
    let fx = Math.min(AA.x * d, -20), y = AA.y;
    if (!att && hyp(fx, y) < VN.circle + 20) { const a = Math.atan2(y, fx); fx = Math.min(-20, Math.cos(a) * (VN.circle + 24)); y = Math.sin(a) * (VN.circle + 24); }
    p.kx = fx * d; p.ky = y;
    if (att && rs.taker && p === kickoffMate(rs)) { p.kx = -d * 40; p.ky = 50; }
    return;
  }
  if (p.role === 'GK') {
    p.kx = ownGoalX(t) + d * (rs.humanKeeper || (type === 'free' && rs.inRange && !att) ? 10 : 30); p.ky = clamp(rs.y * 0.05, -GH * 0.4, GH * 0.4);
    return;
  }
  if (type === 'corner') {
    const gx = attackX(rs.team), sx = sgn(gx);
    if (att) {
      // big men attack the box: near post, far post, the spot and the edge; the rest hold
      const order = ['CB', 'ST', 'CB', 'AM', 'CM', 'W', 'DM'];
      const box = [[gx - sx * 95, sgn(rs.y) * 60], [gx - sx * 110, -sgn(rs.y) * 80], [gx - sx * 200, 0], [gx - sx * 150, -sgn(rs.y) * 160], [gx - sx * 420, sgn(rs.y) * 90], [gx - sx * 380, -sgn(rs.y) * 260]];
      const mates = S.tp[t].filter((q) => !q.out && q !== rs.taker && q.role !== 'GK').sort((a, c) => order.indexOf(a.role) - order.indexOf(c.role));
      const k = mates.indexOf(p);
      if (k >= 0 && k < box.length) { p.kx = box[k][0]; p.ky = box[k][1]; return; }
      if (k >= 0 && k < box.length + 2 && VN.n === 11) { p.kx = d * HL * 0.05; p.ky = (k - box.length - 0.5) * 300; return; }
      anchor(p, AA); p.kx = AA.x; p.ky = AA.y; return;
    }
    // defenders: one on each post, the rest pick up a man in the box
    const mine = S.tp[t].filter((q) => !q.out && q.role !== 'GK');
    const k = mine.indexOf(p), gx2 = ownGoalX(t), sx2 = sgn(gx2);
    if (k === 0) { p.kx = gx2 - sx2 * 12; p.ky = sgn(rs.y) * (GH - 6); return; }
    if (k === 1 && VN.n === 11) { p.kx = gx2 - sx2 * 12; p.ky = -sgn(rs.y) * (GH - 6); return; }
    const opp = S.tp[rs.team].filter((q) => !q.out && q !== rs.taker && q.role !== 'GK');
    const m = opp[(k - 2 + opp.length) % Math.max(1, opp.length)];
    if (m && k < 2 + Math.min(opp.length, 6)) { restartSpot(m, rs); p.kx = m.kx + (gx2 - m.kx) * 0.15; p.ky = m.ky * 0.9; return; }
    anchor(p, AA); p.kx = AA.x; p.ky = AA.y; return;
  }
  if (rs.wall && rs.wall.indexOf(p) >= 0) { p.kx = p.wallX; p.ky = p.wallY; return; }
  // general: shape around the ball, opponents at least 9.15 m away
  anchor(p, AA);
  p.kx = AA.x; p.ky = AA.y;
  if (type === 'goalkick' && !att) p.kx = clamp(p.kx * d, -HL * 0.95, HL - VN.boxD - 30) * d;
  if (type === 'goalkick' && att && p.cat === 'DEF') { const gx = ownGoalX(t); if (abs(p.kx - gx) < VN.boxD + 20) p.kx = gx + d * (VN.boxD + 30); }
  if (!att) {
    const dx = p.kx - rs.x, dy = p.ky - rs.y, dd = hyp(dx, dy);
    if (dd < WALL_D + 10) { const k = (WALL_D + 14) / (dd || 1); p.kx = rs.x + dx * k; p.ky = rs.y + dy * k; }
  } else if (type === 'free' && rs.inRange && p.cat !== 'DEF') {
    // attackers on the edge of the box for a rebound or a cross
    const gx = attackX(t); p.kx = gx - d * (VN.boxD - 40 + (p.k % 3) * 40); p.ky = clamp(p.ky, -VN.boxW * 0.8, VN.boxW * 0.8);
  }
  p.kx = clamp(p.kx, -HL + 10, HL - 10); p.ky = clamp(p.ky, -HW + 10, HW - 10);
  if (rs.wall) { const w = rs.wall.indexOf(p); if (w >= 0) { p.kx = p.wallX; p.ky = p.wallY; } }
}
function kickoffMate(rs) {
  let best = null, bs = 1e9;
  for (const q of S.tp[rs.team]) { if (q.out || q === rs.taker || q.role === 'GK') continue; const s = q.role === 'ST' || q.role === 'AM' ? 0 : q.cat === 'MID' ? 1 : 3; if (s < bs) { bs = s; best = q; } }
  return best;
}
function restartStep(dt) {
  const rs = S.rs; if (!rs) { S.phase = 'play'; return; }
  rs.t += dt;
  const walkT = RS_WALK[rs.type];
  // the ball that went out keeps rolling for a moment, then a new one appears at the spot
  if (rs.ballOut) {
    updateBall(dt);
    if (rs.t > 0.8) { rs.ballOut = false; const b = S.ball; b.owner = null; b.x = rs.x; b.y = rs.y; b.z = 0; b.vx = b.vy = b.vz = 0; b.cv = 0; b.inGoal = 0; }
  }
  for (const p of S.players) {
    if (p.out) { leaveStep(p, dt); continue; }
    if (rs.stage === 'ready' && p === rs.taker) { p.dvx = p.dvy = 0; p.vx *= 0.8; p.vy *= 0.8; if (p.tfx !== undefined) { p.fx = p.tfx; p.fy = p.tfy; } continue; }
    if (rs.humanKeeper && p.i === S.ctrl && rs.stage === 'ready') { keeperShuffle(p, dt); continue; }
    moveTo(p, p.kx, p.ky, true);
    const d = hyp(p.kx - p.x, p.ky - p.y);
    if (d > 30) { p.dvx *= 1.7; p.dvy *= 1.7; }
    if (d < 6 && p.tfx === undefined) { p.fx += (rs.x - p.x) * 0.0001; }
  }
  integratePlayers(dt);
  if (rs.stage === 'walk') {
    if (rs.t >= walkT && !rs.ballOut) {
      // anyone still on the way slips into place (the camera is on the ball)
      for (const p of S.players) { if (p.out) continue; const d = hyp(p.kx - p.x, p.ky - p.y); if (d > 60) { p.x = lerp(p.x, p.kx, 0.85); p.y = lerp(p.y, p.ky, 0.85); } }
      const tk = rs.taker;
      tk.x = tk.kx; tk.y = tk.ky; tk.vx = tk.vy = 0; if (tk.tfx !== undefined) { tk.fx = tk.tfx; tk.fy = tk.tfy; }
      const b = S.ball; b.x = rs.x; b.y = rs.y; b.z = 0; b.vx = b.vy = b.vz = 0;
      if (rs.type === 'throw') { b.owner = tk; b.held = true; }
      else if (rs.type === 'goalkick' || rs.type === 'free' || rs.type === 'corner' || rs.type === 'pen' || rs.type === 'kickoff') { b.owner = null; }
      rs.stage = 'ready'; rs.t = 0;
      if (rs.type === 'kickoff') { beginKickoff(); return; }
    }
    return;
  }
  // ready: the human chooses; the computer thinks, then goes
  if (rs.team === 0 && !S.demo) {
    restartInput(dt);
    rs.auto += dt;
    if (rs.auto > 9 && S.phase === 'restart') aiRestart(rs); // nobody pressed anything: play it simple
  } else if (rs.t > rs.think) aiRestart(rs);
}
function beginKickoff() {
  const rs = S.rs, tk = rs.taker, d = S.dir[rs.team];
  S.phase = 'play'; S.phaseT = 0;
  tk.x = -d * (PR + BR + 2); tk.y = 0; tk.fx = d; tk.fy = 0; tk.vx = tk.vy = 0;
  S.ball.x = 0; S.ball.y = 0;
  S.rs = null;
  takeBall(tk);
  tk.hold = -0.4;
  S.restrict = { team: 1 - rs.team, t: 1.0 };
  if (rs.team === 0 && !S.demo) S.ctrl = tk.i;
  snd.whistle(0);
  if (!S.demo) { if (S.pt < 1 && S.period === 1) sayRare('kickoff', true); else if (S.pt < 1 && S.period === 2) say(pick(LINES.second)); }
}
// after the kick, throw or tap the ball is live
function restartDone() {
  if (!S.rs) return;
  const rs = S.rs;
  S.phase = 'play'; S.phaseT = 0;
  S.restrict = null; S.rs = null;
  for (const p of rs.wall) { p.jumpT = 0.6; }
  if (rs.humanKeeper && !S.demo) S.switchLock = 0.6;
}

/* ------------------------------------------------------------------ fouls, cards, offside */
// sev 0..1: how bad the challenge was. From behind, studs-first slides and late tackles are worse.
function callFoul(fouler, victim, sev) {
  const b = S.ball;
  if (S.phase !== 'play' || S.cfg.training) return;
  fouler.st.fo++; S.stats.fouls[fouler.team]++;
  pushEvt('foul', fouler, victim);
  victim.stunT = Math.max(victim.stunT, 0.9);
  if (!S.demo) arc.haptic('hit', 0.6);
  // advantage: the fouled side still has it and is going forward
  const own = b.owner;
  if (!VN.walls && own && own.team === victim.team && own !== victim && (own.x - victim.x) * S.dir[victim.team] > -40) {
    S.advT = 2.2; S.advTeam = victim.team;
    if (!S.demo) { arc.toast('Advantage', 'Play on', 1400); sayRare('advantage', true); }
    cardFor(fouler, victim, sev, false);
    return;
  }
  const inBoxFoul = !VN.walls && inBox(victim.x, victim.y, fouler.team);
  // denying an obvious goal scoring chance: through on goal with nobody but the keeper to beat
  const gx = ownGoalX(fouler.team), dg = hyp(victim.x - gx, victim.y);
  let dogso = false;
  if (!VN.walls && dg < 900 && (b.owner === victim || hyp(b.x - victim.x, b.y - victim.y) < 60)) {
    let cover = 0; for (const q of S.tp[fouler.team]) { if (q.out || q === fouler || q.role === 'GK') continue; if ((q.x - victim.x) * sgn(gx) > 0 && abs(q.y - victim.y) < 260) cover++; }
    dogso = cover === 0;
  }
  snd.whistle(0);
  cardFor(fouler, victim, sev, dogso && !inBoxFoul);
  loseTime(25);
  if (inBoxFoul) {
    if (!S.demo) { arc.toast('Penalty!', S.teams[victim.team].short, 2000); say(pick(LINES.penalty), 3); }
    pushEvt('penalty', fouler, victim);
    startRestart('pen', victim.team, ownGoalX(fouler.team) - sgn(ownGoalX(fouler.team)) * VN.spot, 0, { direct: true });
    return;
  }
  const fx = VN.walls ? clamp(victim.x, -HL + 45, HL - 45) : clamp(victim.x, -HL + 8, HL - 8), fy = VN.walls ? clamp(victim.y, -HW + 40, HW - 40) : clamp(victim.y, -HW + 8, HW - 8);
  if (!S.demo) arc.toast('Foul', 'Free kick ' + S.teams[victim.team].short, 1500);
  if (!S.demo && rnd() < 0.5) sayRare('foul');
  startRestart('free', victim.team, fx, fy, { direct: true });
  if (VN.walls) { // the cage keeps its quick tap restarts
    S.rs.think = 0.5;
  }
}
function cardFor(p, victim, sev, dogso) {
  if (VN.walls) return; // five-a-side in the cage: fouls, no cards
  let card = 0;
  if (dogso && rnd() < 0.6) card = 2;
  else if (sev > 0.95 && rnd() < 0.1) card = 2;
  else if (sev > 0.7 && rnd() < (sev - 0.55) * 1.3) card = 1;
  if (!card) return;
  if (card === 1) { p.yellow++; p.st.yc++; S.stats.yc[p.team]++; if (p.yellow >= 2) card = 3; }
  if (card >= 2) { p.st.rc++; S.stats.rc[p.team]++; }
  S.cards.push({ team: p.team, name: p.name, clock: Math.ceil(gameMinute()) + "'", red: card >= 2 });
  pushEvt('card', p, victim, card);
  S.band = { kind: card === 1 ? 'yellow' : 'red', name: p.name, team: p.team, t: 0, second: card === 3 };
  snd.card();
  loseTime(25);
  if (!S.demo) {
    if (card === 1) { arc.toast('Yellow card', p.name, 1800); sayRare('yellow', true); }
    else { arc.toast(card === 3 ? 'Second yellow, red card' : 'Red card', p.name, 2400); say(pick(LINES.red), 3); }
  }
  if (card >= 2) sendOff(p);
}
function sendOff(p) {
  p.out = true; p.leaving = 0.01;
  const b = S.ball; if (b.owner === p) releaseBall(p);
  if (S.ctrl === p.i) S.ctrl = -1;
  S.morale[p.team] -= 0.2;
}
// a sent-off player walks to the touchline nearest the dugouts and is gone
function leaveStep(p, dt) {
  if (!p.leaving) return;
  p.leaving += dt;
  moveTo(p, p.x * 0.6, HW + 160, false);
  p.dvx *= 0.6; p.dvy *= 0.6;
}
function callOffside(p) {
  const b = S.ball;
  S.offChk = null; p.offId = -1;
  S.stats.offsides[p.team]++;
  pushEvt('offside', p, null);
  snd.whistle(0);
  if (!S.demo) { arc.toast('Offside', p.name, 1500); sayRare('offside', true); }
  const ar = S.ars[p.x > 0 ? 1 : 0]; ar.flag = 2.4;
  loseTime(15);
  // an indirect free kick to the defending side where he was
  b.owner = null; b.vx = b.vy = b.vz = 0;
  startRestart('free', 1 - p.team, clamp(p.x, -HL + 10, HL - 10), clamp(p.y, -HW + 10, HW - 10), { direct: false, snap: false });
}

/* ------------------------------------------------------------------ movement and physics of players */
function baseSpeed(p) {
  if (p.role === 'GK') return 176;
  let s = 132 + 40 * p.att.pace;
  if (p.team === 1 || S.demo || p.i !== S.ctrl) s *= 0.88 + 0.16 * S.skill[p.team];
  if (S.ball.owner === p) s *= 0.94;
  if (p.stam < 0.3) s *= 0.9;
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
  const P = S.players, n = P.length;
  for (let i = 0; i < n; i++) {
    const p = P[i];
    if (p.tackleCD > 0) p.tackleCD -= dt;
    if (p.slideCD > 0) p.slideCD -= dt;
    if (p.noBallT > 0) p.noBallT -= dt;
    if (p.kickT > 0) p.kickT -= dt;
    if (p.tackleAnim > 0) p.tackleAnim -= dt;
    if (p.cheer > 0) p.cheer -= dt;
    if (p.diveRec > 0) p.diveRec -= dt;
    if (p.lunge > 0) p.lunge -= dt;
    if (p.headT > 0) p.headT -= dt;
    if (p.jumpT > 0) p.jumpT -= dt;
    if (p.fooled > 0) p.fooled -= dt;
    if (p.skillT > 0) p.skillT -= dt;
    if (p.skillCD > 0) p.skillCD -= dt;
    if (p.diving) {
      p.diveE += dt;
      const t = Math.min(1, p.diveE / 0.3), e = 1 - (1 - t) * (1 - t);
      const ny = p.diveY0 + (p.diveY1 - p.diveY0) * e, nx = p.diveX0 + (p.diveX1 - p.diveX0) * e;
      p.vy = (ny - p.y) / Math.max(dt, 0.001); p.vx = (nx - p.x) / Math.max(dt, 0.001); p.y = ny; p.x = nx;
      if (p.diveE > 0.85) { p.diving = false; p.diveRec = 0.45; p.vy = 0; p.vx = 0; }
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
      const a = (p.lunge > 0 || p.skillT > 0.25 ? 3200 : 1500) * dt;
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
    if (p.sprint && sp > 60) { p.stam -= (p.i === S.ctrl ? 0.3 : 0.2) * dt; if (p.stam <= 0.02) { p.stam = 0.02; p.tired = true; } }
    else { p.stam = Math.min(1, p.stam + (sp < 30 ? 0.3 : 0.17) * dt); if (p.tired && p.stam > 0.3) p.tired = false; }
  }
  // bodies do not overlap (a grid would pay for itself only with many more players)
  for (let i = 0; i < n; i++) {
    const a = P[i]; if (a.out && a.leaving > 3) continue;
    for (let j = i + 1; j < n; j++) {
      const c = P[j];
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

/* ------------------------------------------------------------------ interactions: control, headers, saves, tackles */
function tryPickup() {
  const b = S.ball;
  if (b.owner || S.phase !== 'play') return;
  if (b.z > 34) { tryHeader(); return; }
  let best = null, bd = 1e9;
  const P = S.players;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    if (p.out || p.stunT > 0 || p.slideT > 0 || p.noBallT > 0 || p.diving) continue;
    if (S.restrict && p.team === S.restrict.team) continue;
    const d = hyp(b.x - p.x, b.y - p.y), reach = PR + BR + (p.role === 'GK' ? 7 : 2);
    if (d < reach && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const rel = hyp(b.vx - best.vx, b.vy - best.vy);
  if (best.role === 'GK' && keeperMayHandle(best)) { if (rel < 330 && b.z < 36) { takeBall(best, true); keeperHolds(best); } return; }
  // a hot ball or a heavy first touch under pressure: it cannons off
  const press = nearestOpp(best, true) && S.nearD < 50;
  const limit = 560 + 160 * best.att.pass - (press ? 80 : 0);
  if (rel > limit && best.role !== 'GK') {
    const nx = (b.x - best.x) / (bd || 1), ny = (b.y - best.y) / (bd || 1), vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny; b.vx *= 0.55; b.vy *= 0.55; }
    best.noBallT = 0.15; b.lastTouch = best; b.lastTeam = best.team; snd.tackle();
    if (S.offChk && best.team !== S.offChk.team) S.offChk = null;
    return;
  }
  takeBall(best);
}
// in a shootout every kick is at the one goal at +HL, so the keeper's box is that goal's, not their team's own
function keeperInBox(g) { return S.phase === 'penalties' ? abs(g.x - HL) < VN.boxD && abs(g.y) < VN.boxW : inBox(g.x, g.y, g.team); }
function keeperMayHandle(g) { return VN.walls || keeperInBox(g); }
function keeperHolds(g) {
  const b = S.ball; b.z = 15;
  g.holdT = 1.3 + rnd() * 1.0;
  S.offChk = null;
}
// a high ball: whoever gets up to it heads it (a cross, a clearance, a flick on)
function tryHeader() {
  const b = S.ball;
  if (b.z > 88 || b.vz > 120) return;
  let best = null, bd = 1e9;
  for (const p of S.players) {
    if (p.out || p.stunT > 0 || p.slideT > 0 || p.noBallT > 0 || p.diving || p.headT > 0) continue;
    if (S.restrict && p.team === S.restrict.team) continue;
    const d = hyp(b.x - p.x, b.y - p.y);
    const reach = p.role === 'GK' && keeperMayHandle(p) ? 30 : 22;
    if (d > reach) continue;
    // a keeper in his box claims it with his hands
    const sc = d - p.att.head * 10 - (p.role === 'GK' ? 14 : 0);
    if (sc < bd) { bd = sc; best = p; }
  }
  if (!best) return;
  if (best.role === 'GK' && keeperMayHandle(best)) {
    if (b.z < GOAL_H + 22) { takeBall(best, true); keeperHolds(best); pushEvt('claim', best); if (rnd() < 0.5) sayRare('claim'); }
    return;
  }
  if (b.z > 80) return;
  best.headT = 0.6; best.jumpT = 0.5;
  headBall(best);
}
function headBall(p) {
  const b = S.ball, t = p.team, gx = attackX(t), d = S.dir[t];
  const human = !S.demo && p.team === 0 && p.i === S.ctrl;
  const dg = hyp(gx - p.x, p.y);
  const wantShot = human ? (arc.input.down('KeyK', 'KeyH') || S.headBuf > 0 && S.headBufK === 'shot' || dg < 420) : dg < 470 + 80 * p.att.head;
  if (S.offChk && p.team === S.offChk.team && p.offId === S.offChk.id && b.lastTeam === p.team) { callOffside(p); return; }
  if (wantShot && (gx - p.x) * d > 0) {
    // aimed at a corner, with the head's own error
    const gk = gkOf(1 - t);
    let ty = (gk && gk.y > 0 ? -1 : 1) * (GH - 16) * (0.4 + rnd() * 0.6) + (rnd() - 0.5) * (1.1 - p.att.head) * 110;
    if (human) { const ax = arc.input.axis(); if (abs(ax.x) > 0.3 || abs(ax.y) > 0.3) { uvToWorld(ax.x, ax.y, TMP); ty = clamp(p.y + TMP.y * 400, -(GH - 10), GH - 10); } }
    const dx = gx - p.x, dy = ty - p.y, m = hyp(dx, dy) || 1;
    const sp = 420 + 260 * p.att.head;
    p.st.sh++; S.stats.shots[t]++;
    const tt = m / sp, vz = (8 + rnd() * 40 - (b.z - 6) + 0.5 * GRAV * tt * tt) / tt;
    kickBall(p, dx, dy, sp, clamp(vz, -260, 260), 'header');
    const zz = b.z + b.vz * tt - 0.5 * GRAV * tt * tt;
    if (abs(ty) < GH && zz < GOAL_H && zz > -10) { p.st.sot++; S.stats.sot[t]++; }
    if (!S.demo) sayRare('header', true);
    S.headBuf = 0;
    return;
  }
  // defenders clear it, others nod it on to a team-mate in front
  const own = abs(p.x - ownGoalX(t)) < HL * 0.6;
  if (own && p.cat === 'DEF' && !human) {
    const a = (rnd() - 0.5) * 1.2; kickBall(p, d * Math.cos(a), Math.sin(a) + sgn(p.y) * 0.3, 380 + 160 * p.att.head, 230, 'pass');
  } else {
    let fx = d, fy = 0, hasDir = false;
    if (human) { const ax = arc.input.axis(); if (abs(ax.x) > 0.2 || abs(ax.y) > 0.2) { uvToWorld(ax.x, ax.y, TMP); fx = TMP.x; fy = TMP.y; hasDir = true; } }
    const m = bestReceiver(p, fx, fy, hasDir, false);
    if (m) { const dx = m.x - p.x, dy = m.y - p.y, dm = hyp(dx, dy) || 1; kickBall(p, dx, dy, clamp(dm * 1.15, 220, 520), 140, 'pass'); S.passTarget = m; S.passT = 1.4; }
    else kickBall(p, d, 0, 360, 170, 'pass');
  }
  S.headBuf = 0;
}
function keeperSaves() {
  const b = S.ball;
  if (b.owner || (S.phase !== 'play' && S.phase !== 'penalties')) return;
  for (let t = 0; t < 2; t++) {
    const g = gkOf(t); if (!g || g.out || g.noBallT > 0) continue;
    if (!VN.walls && !keeperInBox(g) && !g.diving) continue;
    const reach = PR + BR + (g.diving ? 24 : 9);
    const d = hyp(b.x - g.x, b.y - g.y);
    if (d < reach && b.z < (g.diving ? 70 : 52)) {
      const rel = hyp(b.vx - g.vx, b.vy - g.vy), ks = S.kskill[g.team];
      const lim = 340 + 270 * ks - (b.z > 32 ? 90 : 0) - (g.diving ? 60 : 0);
      const isShot = hyp(b.vx, b.vy) > 250 && S.lastKick && (S.lastKick.kind === 'shot' || S.lastKick.kind === 'header') && S.lastKick.p.team !== g.team;
      if (S.phase === 'penalties' && S.pen) S.pen.saved = true;
      if (S.inPen) S.inPen.saved = true;
      if (rel < lim) {
        takeBall(g, true); keeperHolds(g); b.lastTouch = g;
        if (isShot) { S.stats.saves[g.team]++; g.st.sv++; snd.save(); sayRare('save', true); pushEvt('save', g, S.lastKick.p); }
      } else {
        const inward = S.dir[g.team];
        b.vx = -b.vx * 0.25 + inward * 120; b.vy = b.vy * 0.3 + (sgn(b.y - g.y + (rnd() - 0.5) * 8)) * (170 + rnd() * 130); b.vz = 80 + rnd() * 90;
        b.lastTouch = g; b.lastTeam = g.team; g.noBallT = 0.4; b.cv = 0;
        if (isShot) { S.stats.saves[g.team]++; g.st.sv++; }
        snd.save(); sayRare('save', true); pushEvt('parry', g);
        if (S.offChk && S.offChk.team !== g.team) { /* a save does not reset offside */ }
      }
      return;
    }
  }
}
function startSlide(p, dx, dy) {
  if (p.slideCD > 0 || p.slideT > 0 || p.stunT > 0) return;
  const m = hyp(dx, dy); if (m < 0.1) { dx = p.fx; dy = p.fy; } else { dx /= m; dy /= m; }
  p.slideT = 0.5; p.slideDX = dx; p.slideDY = dy; p.fx = dx; p.fy = dy; p.slideTouched = false; p.slideHit = false;
  pushEvt('slide', p);
  for (let i = 0; i < 3; i++) spawn(0, p.x, p.y, 1, -dx * 40 + (rnd() - 0.5) * 50, -dy * 40 + (rnd() - 0.5) * 50, 14, 0.4, '#cfe0c0', 3);
}
function slideContacts() {
  const b = S.ball, P = S.players;
  for (let i = 0; i < P.length; i++) {
    const p = P[i]; if (p.slideT <= 0 || p.out) continue;
    const db = hyp(b.x - p.x, b.y - p.y);
    if (db < PR + BR + 9 && b.z < 22 && !p.slideTouched && !(b.owner && b.owner.role === 'GK')) {
      p.slideTouched = true;
      const own = b.owner;
      if (own && own.team !== p.team) { own.stunT = 0.5; own.noBallT = 0.6; releaseBall(own); }
      if (!own || own.team !== p.team) {
        b.owner = null; b.vx = p.slideDX * 360 + (rnd() - 0.5) * 40; b.vy = p.slideDY * 360 + (rnd() - 0.5) * 40; b.vz = 0;
        b.lastTouch = p; b.lastTeam = p.team; p.noBallT = 0.2; p.st.tk++; S.stats.tackles[p.team]++;
        if (S.offChk && p.team !== S.offChk.team) S.offChk = null;
        snd.tackle(); sayRare('slide', true);
        for (let k = 0; k < 4; k++) spawn(3, b.x, b.y, 1, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, 30 + rnd() * 30, 0.5, '#2a8148', 2.4);
      }
    }
    if (p.slideHit) continue;
    for (let j = 0; j < P.length; j++) {
      const o = P[j]; if (o.out || o.team === p.team || o.stunT > 0 || (o.role === 'GK' && o.holdT > 0)) continue;
      if (hyp(o.x - p.x, o.y - p.y) < PR * 1.9) {
        p.slideHit = true;
        if (p.slideTouched) break; // ball first: clean
        const fromBehind = (p.x - o.x) * o.fx + (p.y - o.y) * o.fy < 0;
        const hadBall = b.owner === o;
        if (S.phase === 'play' && (fromBehind || !hadBall)) {
          o.stunT = 0.8; callFoul(p, o, clamp(0.45 + (fromBehind ? 0.35 : 0) + (hadBall ? 0 : 0.15) + hyp(p.vx, p.vy) / 2400, 0, 1));
        } else if (hadBall) {
          o.stunT = 0.5; o.noBallT = 0.6; releaseBall(o); b.vx = p.slideDX * 240; b.vy = p.slideDY * 240; b.lastTouch = p; b.lastTeam = p.team; snd.tackle(); p.st.tk++; S.stats.tackles[p.team]++;
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
  const tx = b.x, ty = b.y, dm = hyp(tx - p.x, ty - p.y);
  if (dm > 1) { p.lunge = 0.14; p.vx += (tx - p.x) / dm * 90; p.vy += (ty - p.y) / dm * 90; }
  if (o && o.team !== p.team && !(o.role === 'GK' && o.holdT > 0)) {
    const d = hyp(o.x - p.x, o.y - p.y);
    if (d < PR * 2 + 12) {
      const front = (p.x - o.x) * o.fx + (p.y - o.y) * o.fy > 0;
      const sk = human ? 0.6 : S.skill[p.team];
      let chance = human ? (front ? 0.62 : 0.5) : (0.22 + 0.42 * sk) * (front ? 1.1 : 0.7);
      chance += (p.att.tack - 0.6) * 0.4;
      if (o.sprint) chance -= 0.08;
      if (o.skillT > 0) chance -= 0.4; // he has just beaten you with a feint
      if (S.last30 && !human) chance += 0.05;
      if (rnd() < chance) {
        const vx = (b.x - o.x), vy = (b.y - o.y), m = hyp(vx, vy) || 1;
        o.noBallT = 0.55; o.stunT = 0.12; releaseBall(o); pushEvt('tackled', o, p);
        const kk = 120 + rnd() * 200; b.vx = vx / m * kk + p.fx * 60; b.vy = vy / m * kk + p.fy * 60; b.lastTouch = p; b.lastTeam = p.team;
        p.st.tk++; S.stats.tackles[p.team]++;
        if (S.offChk && p.team !== S.offChk.team) S.offChk = null;
        snd.tackle(); if (human || rnd() < 0.4) sayRare('tackle');
        for (let k = 0; k < 3; k++) spawn(2, b.x, b.y, 4, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, 40, 0.3, '#fff2b8', 2);
      } else if (!front && rnd() < (human ? 0.3 : (0.1 + (1 - sk) * 0.1) * (inBox(o.x, o.y, p.team) ? 0.3 : 1))) {
        // through the back of him
        callFoul(p, o, 0.5 + rnd() * 0.3);
      }
    }
  }
}
// a feint: the fake shot or the drag. Burst away, the nearest defender bites.
function skillMove(p, dx, dy) {
  if (p.skillCD > 0 || S.ball.owner !== p) return false;
  let m = hyp(dx, dy); if (m < 0.2) { dx = -p.fy; dy = p.fx; if (rnd() < 0.5) { dx = -dx; dy = -dy; } m = 1; }
  dx /= m; dy /= m;
  p.skillT = 0.55; p.skillCD = 1.4; p.fx = dx; p.fy = dy;
  p.vx = dx * 230; p.vy = dy * 230; p.dvx = dx * 200; p.dvy = dy * 200;
  const o = nearestOpp(p, true);
  if (o && S.nearD < 150) { o.fooled = 0.5 + 0.3 * p.att.pace; o.react = Math.max(o.react, 0.3); o.vx *= 0.3; o.vy *= 0.3; o.tackleCD = Math.max(o.tackleCD, 0.5); }
  pushEvt('skill', p);
  snd.skill();
  if (!S.demo && rnd() < 0.6) sayRare('skill');
  return true;
}

/* ------------------------------------------------------------------ shooting and passing */
// Aim, power and type. assist pulls the aim inside the posts; spread is the player's error.
// kind 'drive' is low and hard, 'place' curls toward the corner, 'chip' lifts it over the keeper.
function shootAt(p, dx, dy, power01, assist, spread, kind) {
  const gx = attackX(p.team), sgx = sgn(gx);
  const m = hyp(dx, dy) || 1; dx /= m; dy /= m;
  let curl = 0;
  if (dx * sgx > 0.12) {
    const t = (gx - p.x) / dx, yy = p.y + dy * t;
    if (abs(yy) < GH + (VN.walls ? 95 : 260)) {
      const target = clamp(yy, -(GH - 11), GH - 11);
      const tx = gx - p.x, ty = target - p.y, tm = hyp(tx, ty) || 1;
      dx = lerp(dx, tx / tm, assist); dy = lerp(dy, ty / tm, assist);
      const m2 = hyp(dx, dy) || 1; dx /= m2; dy /= m2;
      if (kind === 'place') curl = clamp(-(target - p.y) * 0.25, -110, 110) * sgx * 0.6;
    }
  }
  const skillErr = (1.05 - p.att.shot) * 0.12 + (S.nearD < 60 ? 0.04 : 0);
  spread = (spread || 0) + skillErr * (p.team === 0 && !S.demo ? 0.5 : 1);
  if (spread) { const a = (rnd() - 0.5) * spread, c = Math.cos(a), s = Math.sin(a); const nx = dx * c - dy * s; dy = dx * s + dy * c; dx = nx; }
  if (kind === 'chip') {
    let d = clamp(250 + 200 * power01, 220, VN.walls ? 470 : 760);
    if (dx * sgx > 0.12) d = clamp((gx - p.x) / dx, 90, VN.walls ? 520 : 900);
    const T = clamp(d / 520, 0.5, 1.15), vh = d / T * 1.06;
    kickBall(p, dx, dy, vh, (44 + 0.5 * GRAV * T * T) / T, 'shot');
  } else {
    const pw = 0.3 + 0.7 * power01;
    const drive = kind === 'drive';
    const speed = (drive ? 520 : 430) + 470 * pw * 0.9 * (0.85 + 0.25 * p.att.shot) + (power01 > 0.5 ? 60 : 0);
    let vz = drive ? 10 + 70 * power01 * power01 * (0.3 + rnd() * 0.6) : 20 + 125 * power01 * power01 * (0.4 + rnd() * 0.6);
    if (!VN.walls) { const dist = hyp(gx - p.x, p.y); vz *= clamp(dist / 900, 0.6, 1.4); }
    kickBall(p, dx, dy, speed, vz, 'shot', curl);
  }
  p.st.sh++; S.stats.shots[p.team]++;
  if (dx * sgx > 0.05) {
    const b = S.ball, t = (gx - b.x) / b.vx, yy = b.y + b.vy * t, zz = b.z + b.vz * t - 0.5 * GRAV * t * t;
    if (t > 0 && abs(yy) < GH + 10 && zz < GOAL_H) { S.stats.sot[p.team]++; p.st.sot++; }
  }
  if (!S.demo) sayRare(kind === 'chip' ? 'chip' : 'shot');
}
function bestReceiver(p, dx, dy, hasDir, lob) {
  let best = null, bs = -1e9; const dir = S.dir[p.team];
  for (const m of S.tp[p.team]) {
    if (m === p || m.out) continue;
    const vx = m.x - p.x, vy = m.y - p.y, d = hyp(vx, vy); if (d < 45) continue;
    const cos = (vx * dx + vy * dy) / d;
    if (cos < (hasDir ? 0.3 : 0.12)) continue;
    if (m.role === 'GK' && cos < 0.85) continue;
    let sc = cos * 60 - d * (VN.walls ? 0.04 : 0.025) + (vx * dir) * 0.02;
    if (!lob) sc += laneMin(p.team, p.x, p.y, m.x, m.y, false) > 24 ? 16 : -26;
    if (m.role === 'GK') sc -= 20;
    if (m.offId >= 0 && !VN.walls && m.x * S.dir[m.team] > offsideLine(m.team) + 3 && m.x * S.dir[m.team] > 0) sc -= 30;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
function passTo(p, m, lob, err) {
  const d0 = hyp(m.x - p.x, m.y - p.y);
  const lead = lob ? 0.55 : 0.3;
  let tx = m.x + clamp(m.vx * lead, -60, 60), ty = m.y + clamp(m.vy * lead, -60, 60);
  tx = clamp(tx, -HL + 20, HL - 20); ty = clamp(ty, -HW + 20, HW - 20);
  let dx = tx - p.x, dy = ty - p.y; const d = hyp(dx, dy) || 1;
  // the passer's quality and the pressure on him
  const e = (err || 0) + (1 - p.att.pass) * 0.06 + (d0 > 700 ? 0.03 : 0);
  if (e) { const a = (rnd() - 0.5) * e, c = Math.cos(a), s = Math.sin(a); const nx = dx * c - dy * s; dy = dx * s + dy * c; dx = nx; }
  if (lob) {
    const T = clamp(d / 600, 0.55, 1.35), vh = d / T * 1.06;
    kickBall(p, dx, dy, vh, GRAV * T / 2, 'pass');
  } else {
    kickBall(p, dx, dy, clamp(speedFor(d, 170), 300, 860), 0, 'pass');
  }
  S.passTarget = m; S.passT = 1.6;
}
// into the space ahead of a runner, weighted for him to run onto
function throughTo(p, m) {
  const d = S.dir[p.team];
  const lead = VN.walls ? 90 : 190 + 70 * m.att.pace;
  let tx = m.x + d * lead + m.vx * 0.3, ty = m.y + m.vy * 0.3 + (abs(m.y) > HW * 0.6 ? -sgn(m.y) * 40 : 0);
  tx = clamp(tx, -HL + 40, HL - 40); ty = clamp(ty, -HW + 30, HW - 30);
  const dx = tx - p.x, dy = ty - p.y, dd = hyp(dx, dy) || 1;
  const e = (1 - p.att.pass) * 0.07;
  const a = (rnd() - 0.5) * e, c = Math.cos(a), s = Math.sin(a);
  kickBall(p, dx * c - dy * s, dx * s + dy * c, clamp(speedFor(dd, 120), 280, 820), 0, 'pass');
  S.passTarget = m; S.passT = 2.2; m.run = 1.6;
  if (!S.demo && rnd() < 0.5) sayRare('through');
}
// a cross: lofted to land around head height in the box
function crossTo(p, tx, ty) {
  const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy) || 1;
  const T = clamp(d / 640, 0.6, 1.25), vh = d / T;
  const e = (1 - p.att.pass) * 0.1, a = (rnd() - 0.5) * e, c = Math.cos(a), s = Math.sin(a);
  kickBall(p, dx * c - dy * s, dx * s + dy * c, vh, (48 + 0.5 * GRAV * T * T) / T, 'pass', (rnd() - 0.5) * 60);
  if (!S.demo && rnd() < 0.6) sayRare('cross');
}
// where a cross should go: the best team-mate attacking the box, or the penalty spot
function crossTarget(p, out) {
  const t = p.team, gx = attackX(t), sx = sgn(gx);
  let best = null, bs = -1e9;
  for (const m of S.tp[t]) {
    if (m === p || m.out || m.role === 'GK') continue;
    const inb = abs(m.x - gx) < VN.boxD && abs(m.y) < VN.boxW;
    if (!inb) continue;
    let no = 1e9; for (const o of S.tp[1 - t]) { if (o.out) continue; const dd = hyp(o.x - m.x, o.y - m.y); if (dd < no) no = dd; }
    const sc = Math.min(no, 90) + m.att.head * 30 - abs(m.x - gx) * 0.05;
    if (sc > bs) { bs = sc; best = m; }
  }
  if (best) { out.x = best.x + best.vx * 0.4; out.y = best.y + best.vy * 0.4; return best; }
  out.x = gx - sx * VN.spot; out.y = -sgn(p.y) * 40;
  return null;
}

/* ------------------------------------------------------------------ human control */
function canKick(p) {
  const b = S.ball;
  if (p.stunT > 0 || p.slideT > 0) return false;
  if (b.owner === p) return true;
  return !b.owner && hyp(b.x - p.x, b.y - p.y) < PR + BR + 10 && b.z < 30;
}

// Counters that prove input was read (also shown by arc.debug()).
const GI = { taps: 0, swipes: 0, passes: 0, shots: 0, chips: 0, tackles: 0, slides: 0, dives: 0, through: 0, crosses: 0, skills: 0, switches: 0, setpieces: 0, skips: 0 };
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
// the team-mate nearest a tapped point on screen (or null)
function mateAtTap(p, tp, maxPx) {
  let m = null, bd = 1e9;
  for (const q of S.tp[p.team]) {
    if (q.out || q === p) continue;
    if (!projectScreen(q.x, q.y, 30, PJ)) continue;
    const d = hyp(PJ.x - tp.x, PJ.y - tp.y);
    if (d < bd) { bd = d; m = q; }
  }
  return bd < maxPx ? m : null;
}
function tapPass(p, tp) {
  // a tap on yourself is a skill move
  if (projectScreen(p.x, p.y, 30, PJ) && hyp(PJ.x - tp.x, PJ.y - tp.y) < (arc.touchMode ? 46 : 30)) { if (skillMove(p, p.fx, p.fy)) GI.skills++; return; }
  const m = mateAtTap(p, tp, arc.touchMode ? 120 : 84);
  if (m) {
    const d = hyp(m.x - p.x, m.y - p.y);
    // a tap on a runner ahead of you is a through ball; a long one through traffic is lofted
    const ahead = (m.x - p.x) * S.dir[p.team] > 120 && (m.cat === 'ATT' || m.run > 0) && !VN.walls;
    if (ahead && laneMin(p.team, p.x, p.y, m.x + S.dir[p.team] * 150, m.y, false) > 26) { throughTo(p, m); GI.through++; }
    else { const lob = d > (VN.walls ? 150 : 420) && laneMin(p.team, p.x, p.y, m.x, m.y, false) < 22; passTo(p, m, lob, 0.03); }
    GI.passes++;
    if (m.role !== 'GK') { S.ctrl = m.i; S.switchLock = 0.5; }
    markAt(m.x, m.y, 0);
    return;
  }
  // on empty grass: into that space, to whoever is best placed to run onto it
  if (screenToGround(tp.x, tp.y, G0)) {
    let ddx = G0.x - p.x, ddy = G0.y - p.y; const dm = hyp(ddx, ddy);
    if (dm > 20) {
      ddx /= dm; ddy /= dm;
      const r = bestReceiver(p, ddx, ddy, true, false);
      kickBall(p, ddx, ddy, clamp(speedFor(dm, 110), 260, 820), 0, 'pass');
      if (r) { S.passTarget = r; S.passT = 2; r.run = 1.2; if (r.role !== 'GK') { S.ctrl = r.i; S.switchLock = 0.6; } }
      GI.passes++; GI.through++; markAt(G0.x, G0.y, 0);
      return;
    }
  }
  kickBall(p, p.fx, p.fy, 380, 0, 'pass'); GI.passes++;
}
// a swipe on the ball: at goal it is a shot (fast is hard, curved up a chip); anywhere else a lofted ball or a cross
function swipeBall(p, sw) {
  swipeDir(sw, SW);
  const chip = pathChip(sw);
  const pw = clamp((sw.power - 0.2) / 0.8, 0, 1);
  const gx = attackX(p.team), gdx = gx - p.x, gdy = -p.y, gm = hyp(gdx, gdy) || 1;
  const cosG = (SW.x * gdx + SW.y * gdy) / gm;
  const range = VN.walls ? 1e9 : 1150;
  if (cosG > 0.55 && gm < range) {
    shootAt(p, SW.x, SW.y, 0.3 + 0.7 * pw, 0.62, 0.02, chip ? 'chip' : pw > 0.75 ? 'drive' : 'place');
    GI.shots++; if (chip) GI.chips++;
    flashTrail(chip ? 2 : 1);
    markAt(p.x + SW.x * 60, p.y + SW.y * 60, chip ? 2 : 1);
    return;
  }
  // lofted: a cross when wide in the final third, otherwise a long ball the way you swiped
  const d = S.dir[p.team];
  if (!VN.walls && abs(p.y) > HW * 0.45 && (p.x * d) > HL * 0.35 && SW.y * p.y < 0) {
    crossTarget(p, AB); crossTo(p, AB.x, AB.y); GI.crosses++;
  } else {
    const dist = clamp(260 + 700 * pw, 240, 1100);
    const r = bestReceiver(p, SW.x, SW.y, true, true);
    if (r && hyp(r.x - p.x, r.y - p.y) < dist * 1.3) passTo(p, r, true, 0.04); else lofted(p, SW.x, SW.y, dist);
    GI.passes++;
  }
  flashTrail(0);
}
function lofted(p, dx, dy, dist) {
  const m = hyp(dx, dy) || 1, T = clamp(dist / 600, 0.55, 1.3), vh = dist / T;
  kickBall(p, dx / m, dy / m, vh, GRAV * T / 2, 'pass');
}
function humanControl(dt) {
  const p = S.players[S.ctrl]; if (!p || p.out) return;
  const IN = arc.input, ax = IN.axis(), mag = hyp(ax.x, ax.y);
  const tapE = IN.tap(), swE = IN.swipe();
  let dx = 0, dy = 0;
  if (mag > 0.12) { uvToWorld(ax.x, ax.y, TMP); dx = TMP.x; dy = TMP.y; }
  const busy = p.slideT > 0 || p.stunT > 0 || p.diving;
  const gz = IN.gesture;
  const dragFar = IN.dragSteer && gz.active && gz.type !== 'mouse' && hyp(gz.dx, gz.dy) > 118;
  const wantSprint = (IN.down('KeyL', 'ShiftLeft', 'ShiftRight') || dragFar) && mag > 0.2;
  p.sprint = wantSprint && p.stam > 0.04 && !p.tired;
  if (!busy) {
    const sp = (138 + 34 * p.att.pace) * (p.sprint ? 1.36 : 1) * (S.ball.owner === p ? 0.95 : 1) * (S.charging ? 0.6 : 1);
    p.dvx = dx * sp; p.dvy = dy * sp;
    if (mag > 0.12 && S.ball.owner === p && hyp(p.vx, p.vy) < 40) { p.fx = dx / mag; p.fy = dy / mag; }
  }
  if (busy || S.phase !== 'play') { S.charging = false; return; }
  const owns = canKick(p);
  const hasDir = mag > 0.3, ndx = hasDir ? dx / mag : p.fx, ndy = hasDir ? dy / mag : p.fy;
  // a ball in the air coming to you: K or J now and he heads it
  if (!owns && S.ball.z > 30 && hyp(S.ball.x - p.x, S.ball.y - p.y) < 120) {
    if (IN.hit('KeyK', 'KeyH')) { S.headBuf = 0.5; S.headBufK = 'shot'; }
    else if (IN.hit('KeyJ', 'Space')) { S.headBuf = 0.5; S.headBufK = 'pass'; }
  }
  if (IN.hit('KeyK', 'KeyH')) {
    if (owns) { S.charging = true; S.charge = 0.001; S.chargeKind = IN.down('KeyH') ? 'chip' : 'shot'; }
    else if (!(S.restrict && S.restrict.team === p.team) && !(S.ball.z > 30)) { startSlide(p, ndx, ndy); GI.slides++; }
  }
  if (S.charging) {
    if (!owns) { S.charging = false; S.charge = 0; }
    else if (IN.down('KeyK', 'KeyH')) S.charge = Math.min(1, S.charge + dt / 0.75);
    else {
      const kind = S.chargeKind === 'chip' ? 'chip' : IN.down('ShiftLeft', 'ShiftRight', 'KeyL') ? 'drive' : 'place';
      shootAt(p, ndx, ndy, S.charge, 0.62, S.charge > 0.93 ? 0.12 : 0.02, kind); GI.shots++; if (kind === 'chip') GI.chips++;
      S.charging = false; S.charge = 0;
    }
  }
  if (IN.hit('KeyJ', 'Space')) { if (owns) humanPass(p, false, hasDir, ndx, ndy); else { standTackle(p, true); GI.tackles++; } }
  if (tapE) {
    GI.taps++;
    if (owns) tapPass(p, tapE);
    else {
      // tap a team-mate to take him over, anywhere else to tackle
      const m = mateAtTap(p, tapE, 60);
      if (m && m.role !== 'GK') { S.ctrl = m.i; S.switchLock = 0.8; GI.switches++; }
      else { standTackle(p, true); GI.tackles++; }
    }
  }
  if (swE) { GI.swipes++; if (owns) swipeBall(p, swE); else if (!(S.restrict && S.restrict.team === p.team)) { swipeDir(swE, SW); startSlide(p, SW.x, SW.y); GI.slides++; flashTrail(0); } }
  if (IN.hit('KeyU')) { if (owns) humanLofted(p, hasDir, ndx, ndy); }
  if (IN.hit('KeyI')) { if (owns) humanThrough(p, hasDir, ndx, ndy); }
  if (IN.hit('KeyE')) { if (owns && skillMove(p, hasDir ? ndx : 0, hasDir ? ndy : 0)) GI.skills++; }
  if (IN.hit('KeyQ')) { if (S.ball.owner === p) { if (skillMove(p, hasDir ? ndx : 0, hasDir ? ndy : 0)) GI.skills++; } else manualSwitch(); }
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
// U: the lofted button. A cross from wide in the final third, a chip near goal, a long ball elsewhere.
function humanLofted(p, hasDir, dx, dy) {
  const t = p.team, d = S.dir[t], gx = attackX(t), dg = hyp(gx - p.x, p.y);
  if (!VN.walls && abs(p.y) > HW * 0.45 && p.x * d > HL * 0.35) { crossTarget(p, AB); if (hasDir) { AB.x += dx * 90; AB.y += dy * 90; } crossTo(p, AB.x, AB.y); GI.crosses++; return; }
  if (dg < (VN.walls ? 300 : 820) && (gx - p.x) * d > 0 && abs(p.y) < GH * 3) { shootAt(p, hasDir ? dx : d, hasDir ? dy : 0, 0.6, 0.6, 0.02, 'chip'); GI.shots++; GI.chips++; return; }
  humanPass(p, true, hasDir, dx, dy);
}
// I: through ball to the best runner the way you are pointing
function humanThrough(p, hasDir, dx, dy) {
  const d = S.dir[p.team];
  let best = null, bs = -1e9;
  for (const m of S.tp[p.team]) {
    if (m === p || m.out || m.role === 'GK') continue;
    const vx = m.x - p.x, vy = m.y - p.y, dm = hyp(vx, vy); if (dm < 60) continue;
    const ahead = vx * d;
    if (ahead < -40) continue;
    let sc = ahead * 0.06 - dm * 0.015 + (m.cat === 'ATT' ? 20 : m.role === 'AM' || m.role === 'WB' ? 8 : 0);
    if (hasDir) sc += ((vx * dx + vy * dy) / dm) * 40;
    if (sc > bs) { bs = sc; best = m; }
  }
  GI.passes++; GI.through++;
  if (best) { throughTo(p, best); if (best.role !== 'GK') { S.ctrl = best.i; S.switchLock = 0.7; } }
  else kickBall(p, hasDir ? dx : d, hasDir ? dy : 0, 520, 0, 'pass');
}
function manualSwitch() {
  const b = S.ball; let best = null, bd = 1e9;
  for (const p of S.tp[0]) { if (p.out || p.i === S.ctrl || p.role === 'GK') continue; const d = hyp(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } }
  if (best) { S.ctrl = best.i; S.switchLock = 0.45; S.charging = false; GI.switches++; }
}
function autoSwitch(dt) {
  if (S.demo) { S.ctrl = -1; return; }
  S.switchLock -= dt;
  const b = S.ball, cp = S.players[S.ctrl];
  const mine = b.owner && b.owner.team === 0;
  if (mine && b.owner.role !== 'GK') { if (b.owner !== cp && S.switchLock <= 0) { S.ctrl = b.owner.i; S.charging = false; } return; }
  if (cp && cp.role === 'GK' && S.switchLock > 0) return;
  if (S.switchLock > 0 && cp && !cp.out && cp.role !== 'GK') return;
  if (cp && (b.owner === cp || cp.slideT > 0) && !cp.out) return;
  // the man nearest where the ball will be, not where it is
  const tx = b.x + b.vx * 0.35, ty = b.y + b.vy * 0.35;
  let best = null, bd = 1e9;
  for (const p of S.tp[0]) { if (p.out || p.role === 'GK') continue; const d = hyp(p.x - tx, p.y - ty); if (d < bd) { bd = d; best = p; } }
  const cd = cp && !cp.out && cp.role !== 'GK' ? hyp(cp.x - tx, cp.y - ty) : 1e9;
  if (best && best !== cp && bd + 22 < cd) { S.ctrl = best.i; S.switchLock = 0.3; S.charging = false; }
}

/* ------------------------------------------------------------------ set pieces, the human side */
const SP = { ax: 0, ay: 0, show: false, kind: '' }; // aim shown by the HUD and the pitch marker
function restartInput(dt) {
  const rs = S.rs, p = rs.taker, IN = arc.input;
  if (!p || p.out) { aiRestart(rs); return; }
  const ax = IN.axis(), mag = hyp(ax.x, ax.y);
  const tapE = IN.tap(), swE = IN.swipe();
  const goalAim = rs.type === 'pen' || (rs.type === 'free' && rs.inRange && rs.direct);
  SP.show = true; SP.kind = goalAim ? 'goal' : rs.type;
  if (goalAim) {
    // aim a reticle on the goal mouth: across with left/right, height with up/down (or drag on a phone)
    const gz = IN.gesture;
    if (IN.dragSteer && gz.active && gz.type !== 'mouse') {
      const up = Math.max(24, -gz.dy);
      rs.aimY = clamp(screenAimY(gz.dx / up), -(GH + 30), GH + 30);
      rs.aimH = clamp(10 + Math.min(1, hyp(gz.dx, gz.dy) / 140) * (GOAL_H * 0.7), 5, GOAL_H + 24);
    } else {
      rs.aimY = clamp(rs.aimY + aimAcross(ax.x) * 170 * dt, -(GH + 30), GH + 30);
      rs.aimH = clamp(rs.aimH - ax.y * 80 * dt, 5, GOAL_H + 24);
    }
    if (swE) { const pw = clamp((swE.power - 0.2) / 0.8, 0, 1), chip = pathChip(swE); const up = Math.max(24, -swE.dy); setPieceShot(rs, clamp(screenAimY(swE.dx / up), -(GH + 30), GH + 30), chip ? GOAL_H * 0.8 : 10 + pw * GOAL_H * 0.65, chip ? 0.5 : 0.35 + 0.6 * pw, 0); GI.shots++; GI.setpieces++; flashTrail(chip ? 2 : 1); return; }
    if (IN.hit('KeyK', 'KeyH') && !S.charging) { S.charging = true; S.charge = 0.001; }
    if (S.charging) {
      if (IN.down('KeyK', 'KeyH')) S.charge = Math.min(1, S.charge + dt / 0.9);
      else { S.charging = false; let ay = rs.aimY, ah = rs.aimH; const pw = S.charge; if (pw > 0.92) { ay += (rnd() - 0.5) * 40; ah += (rnd() - 0.2) * 30; } setPieceShot(rs, ay, ah, Math.max(0.25, pw), rs.type === 'free' ? -aimAcross(ax.x) * 120 : 0); GI.shots++; GI.setpieces++; return; }
    }
    if (rs.type === 'free') {
      if (tapE) { GI.taps++; const m = mateAtTap(p, tapE, 120); if (m) { passTo(p, m, hyp(m.x - p.x, m.y - p.y) > 420, 0.03); GI.passes++; GI.setpieces++; restartDone(); return; } }
      if (IN.hit('KeyJ', 'Space')) { humanPass(p, false, false, S.dir[0], 0); GI.setpieces++; restartDone(); return; }
      if (IN.hit('KeyU')) { crossTarget(p, AB); crossTo(p, AB.x, AB.y); GI.crosses++; GI.setpieces++; restartDone(); return; }
    }
    return;
  }
  // everything else: point with the stick, then pass (J / tap a mate), loft or cross (U / K / swipe)
  let dx, dy;
  if (mag > 0.25) { uvToWorld(ax.x, ax.y, TMP); dx = TMP.x / mag; dy = TMP.y / mag; }
  else { dx = rs.type === 'throw' ? S.dir[0] * 0.5 : S.dir[0]; dy = rs.type === 'throw' ? -sgn(rs.y) : rs.type === 'corner' ? -sgn(rs.y) * 0.5 : 0; if (rs.type === 'corner') dx = -sgn(rs.x); const m = hyp(dx, dy) || 1; dx /= m; dy /= m; }
  SP.ax = dx; SP.ay = dy;
  if (rs.type !== 'throw' && rs.type !== 'pen') { p.fx = dx; p.fy = dy; }
  const go = (fn) => { fn(); GI.setpieces++; restartDone(); };
  if (tapE) {
    GI.taps++;
    const m = mateAtTap(p, tapE, 130);
    if (m) { go(() => { if (rs.type === 'throw') throwTo(p, m, false); else passTo(p, m, rs.type === 'goalkick' && hyp(m.x - p.x, m.y - p.y) > 500, 0.03); }); GI.passes++; return; }
    if (rs.type === 'corner' && screenToGround(tapE.x, tapE.y, G0)) { go(() => crossTo(p, G0.x, G0.y)); GI.crosses++; return; }
  }
  if (swE) {
    GI.swipes++; swipeDir(swE, SW);
    if (rs.type === 'corner') { crossTarget(p, AB); AB.x += SW.x * 40; AB.y += SW.y * 40; go(() => crossTo(p, AB.x, AB.y)); GI.crosses++; return; }
    if (rs.type === 'throw') { go(() => throwDir(p, SW.x, SW.y, true)); return; }
    const pw = clamp((swE.power - 0.2) / 0.8, 0, 1);
    go(() => lofted(p, SW.x, SW.y, clamp(320 + 900 * pw, 300, 1300))); GI.passes++; return;
  }
  if (IN.hit('KeyJ', 'Space')) {
    const m = bestReceiver(p, dx, dy, mag > 0.25, false);
    go(() => { if (rs.type === 'throw') { if (m) throwTo(p, m, false); else throwDir(p, dx, dy, false); } else if (m) passTo(p, m, false, 0.03); else kickBall(p, dx, dy, 420, 0, 'pass'); });
    GI.passes++; if (m && m.role !== 'GK') { S.ctrl = m.i; S.switchLock = 0.6; } return;
  }
  if (IN.hit('KeyU', 'KeyK', 'KeyH')) {
    if (rs.type === 'corner') { crossTarget(p, AB); if (mag > 0.25) { AB.x += dx * 70; AB.y += dy * 70; } go(() => crossTo(p, AB.x, AB.y)); GI.crosses++; return; }
    if (rs.type === 'throw') { go(() => throwDir(p, dx, dy, true)); return; }
    const m = bestReceiver(p, dx, dy, true, true);
    go(() => { if (m && hyp(m.x - p.x, m.y - p.y) > 300) passTo(p, m, true, 0.04); else lofted(p, dx, dy, 900); }); GI.passes++; return;
  }
  if (IN.hit('KeyI')) { go(() => humanThrough(p, mag > 0.25, dx, dy)); return; }
}
// left/right on the stick, as seen on screen, moves the reticle across the goal the same way
function aimAcross(sx) {
  // project two points on the goal line and see which way screen right goes
  const gx = S.rs && S.rs.type ? attackX(S.rs.team) : HL;
  if (projectScreen(gx, -50, 0, PJ)) { const ax0 = PJ.x; if (projectScreen(gx, 50, 0, PJ)) return sx * sgn(PJ.x - ax0 || 1); }
  return sx;
}
function screenAimY(k) { return aimAcross(1) * k * (GH - 4); }
// the kick at goal from a set piece: aim (y across the mouth, h height), power 0..1, curl
function setPieceShot(rs, aimY, aimH, power, curl) {
  const p = rs.taker, b = S.ball, gx = attackX(rs.team);
  const v = (VN.walls ? 430 : 520) + 480 * power;
  const dx = gx - b.x, dy = aimY - b.y, dm = hyp(dx, dy);
  const t = dm / v;
  // over a wall: it needs height early, and dips
  const vz = Math.max(0, (aimH - 4 + 0.5 * GRAV * t * t) / t);
  p.fx = sgn(dx); p.fy = 0;
  const e = (1.05 - p.att.shot) * (rs.team === 0 ? 0.04 : 0.1);
  const a = (rnd() - 0.5) * e, c = Math.cos(a), s = Math.sin(a);
  kickBall(p, dx * c - dy * s, dx * s + dy * c, v, vz, 'shot', curl || 0);
  p.st.sh++; S.stats.shots[rs.team]++;
  if (abs(aimY) < GH && aimH < GOAL_H) { p.st.sot++; S.stats.sot[rs.team]++; }
  // the keeper reads it (a person or the computer)
  const g = gkOf(1 - rs.team);
  if (g && rs.humanKeeper && !S.demo) {
    // the human keeper's dive, picked before the kick, goes as it is struck
    if (S.preDive !== undefined && S.preDive !== null) { g.diveDelay = 0.03; g.diveTo = S.preDive * (GH - 14); g.humanDive = true; }
    S.gkWin = 0.9;
  } else if (g) {
    const sk = S.kskill[g.team];
    if (rs.type === 'pen') {
      const side = abs(aimY) < 18 ? 0 : sgn(aimY);
      let guess = side; if (rnd() > 0.34 + 0.3 * sk) { const o = [-1, 0, 1].filter((x) => x !== side); guess = pick(o); }
      g.diveDelay = 0.05 + (1 - sk) * 0.1; g.diveTo = guess * (GH - 14);
    }
  }
  if (rs.type === 'pen') { S.inPen = { team: rs.team, t: 0, saved: false, taker: p }; }
  if (!S.demo && rs.type === 'free' && rs.inRange) sayRare('shot', true);
  restartDone();
}
function throwTo(p, m, long) {
  const dx = m.x + m.vx * 0.3 - p.x, dy = m.y + m.vy * 0.3 - p.y;
  throwDir(p, dx, dy, long, hyp(dx, dy));
}
function throwDir(p, dx, dy, long, dist) {
  const b = S.ball; const m = hyp(dx, dy) || 1;
  dist = dist || (long ? 520 : 300);
  const T = clamp(dist / 520, 0.4, 1.0), vh = dist / T;
  b.owner = null; b.held = false; b.z = 58; b.x = p.x + dx / m * 8; b.y = p.y + dy / m * 8;
  kickBall(p, dx, dy, Math.min(vh, long ? 620 : 470), (GRAV * T / 2) - 58 / T, 'throw');
  b.z = 58;
}
// the keeper's own feet on a free kick against: he can shuffle along his line
function keeperShuffle(g, dt) {
  const IN = arc.input, ax = IN.axis();
  const tY = clamp(g.y + aimAcross(ax.x) * 140 * dt * 2, -(GH - 10), GH - 10);
  g.dvx = 0; g.dvy = (tY - g.y) / Math.max(dt, 0.001); g.dvy = clamp(g.dvy, -150, 150);
  const gx = ownGoalX(g.team) + S.dir[g.team] * 10; g.x += (gx - g.x) * 0.2;
  g.fx = S.dir[g.team]; g.fy = 0;
  // a dive picked before the kick goes the moment it is struck
  const tp = IN.tap(), sw = IN.swipe();
  if (tp || sw || IN.hit('KeyJ', 'Space', 'KeyK')) {
    const side = tp ? (tp.nx < 0.38 ? -1 : tp.nx > 0.62 ? 1 : 0) : sw ? (sw.dir === 'left' ? -1 : sw.dir === 'right' ? 1 : 0) : ax.x ? sgn(ax.x) : 0;
    S.preDive = side ? aimAcross(side) : 0; GI.dives++;
  }
}

/* ------------------------------------------------------------------ set pieces, the computer's side */
function aiRestart(rs) {
  const p = rs.taker; if (!p) { restartDone(); return; }
  const t = rs.team, d = S.dir[t], sk = S.skill[t];
  const done = () => restartDone();
  if (rs.type === 'pen') {
    const side = pick([-1, 1, -1, 1, 0]);
    setPieceShot(rs, side * (GH - 12 - rnd() * 14) + (rnd() - 0.5) * (1 - sk) * 60, 10 + rnd() * (GOAL_H * 0.6) + (rnd() - 0.5) * (1 - sk) * 24, clamp(0.55 + 0.35 * sk + (rnd() - 0.5) * 0.25, 0.3, 1), 0);
    return;
  }
  if (rs.type === 'free' && rs.inRange && rs.direct && (VN.walls || rnd() < 0.72)) {
    // over or round the wall, toward the corner the keeper is not covering
    const g = gkOf(1 - t), side = g && g.y > 6 ? -1 : g && g.y < -6 ? 1 : sgn(rs.y || rnd() - 0.5) * -1;
    const ay = side * (GH - 14 - rnd() * 20) + (rnd() - 0.5) * (1 - sk) * 70;
    const ah = VN.walls ? 14 + rnd() * 30 : GOAL_H * (0.55 + rnd() * 0.35) + (rnd() - 0.5) * (1 - sk) * 30;
    setPieceShot(rs, ay, ah, clamp(0.6 + 0.3 * sk + (rnd() - 0.5) * 0.2, 0.4, 1), -side * (50 + 60 * sk));
    return;
  }
  if (rs.type === 'corner' || (rs.type === 'free' && !VN.walls && p.x * d > HL * 0.45)) {
    if (rs.type === 'corner' && rnd() < 0.18) { const m = bestReceiver(p, -sgn(rs.x), -sgn(rs.y) * 0.3, false, false); if (m) { passTo(p, m, false, 0.05); done(); return; } }
    crossTarget(p, AB); crossTo(p, AB.x, AB.y); done(); return;
  }
  if (rs.type === 'throw') {
    const m = bestAIReceiver(p, true);
    if (m && hyp(m.x - p.x, m.y - p.y) < 480) throwTo(p, m, false); else throwDir(p, d, -sgn(rs.y) * 0.4, true);
    done(); return;
  }
  if (rs.type === 'goalkick') {
    // short to a centre-back unless the other side presses high, else long to the front men
    let press = 0; for (const o of S.tp[1 - t]) if (!o.out && abs(o.x - p.x) < VN.boxD + 100) press++;
    const short = press < 2 && rnd() < 0.5 + 0.3 * sk;
    let best = null, bs = -1e9;
    for (const m of S.tp[t]) {
      if (m === p || m.out) continue;
      const fwd = (m.x - p.x) * d;
      const sc = short ? (m.cat === 'DEF' ? 40 : 0) - abs(fwd - 300) * 0.05 + laneMin(t, p.x, p.y, m.x, m.y, false) * 0.3 : (m.cat === 'ATT' || m.role === 'AM' ? 30 : m.cat === 'MID' ? 15 : -30) + fwd * 0.01;
      if (sc > bs) { bs = sc; best = m; }
    }
    if (best) passTo(p, best, !short, 0.05); else lofted(p, d, 0, 1100);
    done(); return;
  }
  // a free kick out of range: keep it simple
  const m = bestAIReceiver(p, false);
  if (m) passTo(p, m, hyp(m.x - p.x, m.y - p.y) > 500, 0.05); else kickBall(p, d, 0, 420, 0, 'pass');
  done();
}

/* ------------------------------------------------------------------ AI: shape, pressing, marking */
// Where this player belongs right now: his slot in the shape, shifted with the ball and the team's mentality.
function anchor(p, out, neutral) {
  const t = p.team, d = S.dir[t], b = S.ball, tac = S.tac[t];
  if (VN.walls) {
    const att = b.owner ? b.owner.team === t : b.lastTeam === t;
    const bx = neutral ? 0 : b.x * d / HL;
    const rx = p.ax + (neutral ? 0 : att ? 0.16 : -0.05) + bx * 0.34;
    out.x = d * clamp(rx, -0.92, 0.8) * HL;
    out.y = clamp(p.ay * HW * 0.9 * d + (neutral ? 0 : b.y * 0.28), -HW + 40, HW - 40);
    return;
  }
  const own = neutral ? false : possTeam() === t;
  const bx = neutral ? 0 : clamp(b.x * d / HL, -1, 1), by = neutral ? 0 : clamp(b.y / HW, -1, 1);
  const m = tac.ment + S.morale[t] * 0.3;
  let x;
  if (p.cat === 'DEF') {
    x = S.line[t] + (p.role === 'CB' ? 0 : own ? 0.06 + 0.1 * Math.max(0, m) : 0.03);
    // the full-back on the ball side overlaps when we attack with an attacking mind
    if (own && (p.role === 'FB' || p.role === 'WB') && m > -0.5 && by * p.ay * d > 0.15 && bx > -0.1) x += 0.25 + 0.15 * m;
  } else {
    const follow = p.cat === 'MID' ? 0.5 : 0.42;
    x = p.ax + (own ? 0.2 + 0.07 * m : -0.04 + 0.06 * m) + bx * follow;
    if (p.cat === 'ATT' && own) x += 0.1;
    if (!own && p.cat === 'ATT') x = Math.max(x, -0.2 + 0.1 * m);
    x = Math.max(x, S.line[t] + 0.12);
  }
  x = clamp(x, -0.93, 0.9);
  // narrow without the ball, wide with it, everyone shifted toward the ball's side
  const width = own ? 1.0 : 0.66;
  let y = p.ay * d * width + by * (own ? 0.16 : 0.34);
  y = clamp(y, -0.94, 0.94);
  out.x = d * x * HL; out.y = y * HW;
  // attackers wait on the line, they do not stand offside
  if (!neutral && own && p.role !== 'GK') {
    const lim = (S.offLine[t] - 14 + (p.lineErr || 0)) * d;
    if (out.x * d > lim * d && p.run <= 0) out.x = lim;
  }
}
// the back line: where it holds, steps up and drops as one
function computeLines() {
  const b = S.ball;
  for (let t = 0; t < 2; t++) {
    const d = S.dir[t], bx = clamp(b.x * d / HL, -1, 1), m = S.tac[t].ment + S.morale[t] * 0.3;
    const own = possTeam() === t;
    let line = own ? -0.58 + 0.45 * Math.max(bx, -0.5) + 0.07 * m : -0.7 + 0.42 * Math.max(bx, -0.75) + 0.07 * m;
    if (!own) line = Math.min(line, bx - 0.12);
    // never stand higher than the deepest opponent who is not offside-proof... keep a cushion against pace
    S.line[t] = clamp(line, -0.86, own ? 0.15 : -0.14);
    S.offLine[t] = Math.max(offsideLine(t), b.x * d, 0);
  }
}
function computeInfo() {
  const b = S.ball;
  for (let t = 0; t < 2; t++) {
    const list = S.chase[t]; list.length = 0;
    for (const p of S.tp[t]) {
      if (p.role === 'GK' || p.out) continue;
      if (!S.demo && p.i === S.ctrl) continue;
      list.push(p);
    }
    list.sort((a, c) => hyp(a.x - b.x, a.y - b.y) - hyp(c.x - b.x, c.y - b.y));
  }
  if (!VN.walls) computeLines();
}
function assignMarks(t) {
  const b = S.ball, o = b.owner;
  const defs = S.chase[t].slice(2), atk = [];
  for (const q of S.tp[1 - t]) if (!q.out && q !== o && q.role !== 'GK') atk.push(q);
  defs.forEach((d) => { d.mark = null; });
  const pairs = [];
  defs.forEach((d) => { anchor(d, AB); atk.forEach((a) => { const za = hyp(AB.x - a.x, AB.y - a.y); if (za < (VN.walls ? 1e9 : 420)) pairs.push([hyp(d.x - a.x, d.y - a.y) + za * 0.5, d, a]); }); });
  pairs.sort((x, y) => x[0] - y[0]);
  const done = new Set(), used = new Set();
  pairs.forEach((pr) => { if (done.has(pr[1]) || used.has(pr[2])) return; pr[1].mark = pr[2]; done.add(pr[1]); used.add(pr[2]); });
}
function interceptPoint(p, out) {
  const b = S.ball;
  let tt = hyp(b.x - p.x, b.y - p.y) / (baseSpeed(p) * 1.2 + 60); tt = clamp(tt, 0, 1.2);
  const f = (1 - Math.exp(-FR_K * tt)) / FR_K;
  out.x = clamp(b.x + b.vx * f, -HL + 22, HL - 22); out.y = clamp(b.y + b.vy * f, -HW + 22, HW - 22);
}
// off the ball: find space a team-mate can pass into, and runs in behind
function pickRun(p, o) {
  const t = p.team, d = S.dir[t];
  anchor(p, AA);
  let bx = AA.x, by = AA.y, bs = -1e9;
  const R = VN.walls ? 1 : 2.2;
  for (let k = 0; k < 9; k++) {
    let cx, cy;
    if (k === 0) { cx = AA.x; cy = AA.y; }
    else { const ang = (k - 1) / 8 * TAU + p.k, r = (110 + ((k * 37) % 90)) * R; cx = AA.x * 0.5 + o.x * 0.5 + Math.cos(ang) * r + d * 50 * R; cy = AA.y * 0.6 + o.y * 0.4 + Math.sin(ang) * r; }
    cx = clamp(cx, -HL + 50, HL - 50); cy = clamp(cy, -HW + 45, HW - 45);
    // stay onside
    if (!VN.walls && cx * d > S.offLine[t] - 12 + (p.lineErr || 0)) cx = (S.offLine[t] - 12 + (p.lineErr || 0)) * d;
    const dO = hyp(cx - o.x, cy - o.y);
    let sc = (cx - o.x) * d * 0.18;
    if (dO < 70 * R || dO > 330 * R * 1.3) sc -= 40;
    sc += clamp(laneMin(t, o.x, o.y, cx, cy, false), 0, 60) * 0.9;
    let no = 1e9; for (const q of S.tp[1 - t]) { if (q.out) continue; const dd = hyp(q.x - cx, q.y - cy); if (dd < no) no = dd; }
    sc += clamp(no, 0, 90 * R) * 0.6 / R;
    for (const m of S.tp[t]) { if (m === p || m === o || m.role === 'GK' || m.out) continue; const mx = m.rT > 0 ? m.rx : m.x, my = m.rT > 0 ? m.ry : m.y, dm = hyp(cx - mx, cy - my); if (dm < 85 * R) sc -= (85 * R - dm) * 0.8 / R; }
    sc -= hyp(cx - AA.x, cy - AA.y) * 0.12 / R;
    if (abs(cx - attackX(t)) < 300 * R) sc += p.cat === 'ATT' ? 38 : 20;
    if (sc > bs) { bs = sc; bx = cx; by = cy; }
  }
  p.rx = bx; p.ry = by; p.rT = 0.55 + rnd() * 0.4;
  // nobody reads the line perfectly: now and then a forward drifts a yard or two beyond it
  p.lineErr = rnd() < 0.2 + (1 - S.skill[t]) * 0.3 ? 8 + rnd() * 30 : 0;
}
function aiPlayer(p, dt) {
  const b = S.ball, t = p.team;
  p.aiT -= dt; if (p.rT > 0) p.rT -= dt; if (p.run > 0) p.run -= dt;
  if (p.out) { leaveStep(p, dt); return; }
  if (p.role === 'GK') { keeperAI(p, dt); return; }
  if (p.stunT > 0 || p.slideT > 0) return;
  if (S.phase === 'goal') {
    const gp = S.goalP;
    if (p.team === S.goalTeam && gp) {
      if (p === gp.p) moveTo(p, gp.cx, gp.cy, S.phaseT < 2.2);
      else { const a = p.k * 1.3 + 0.8, k = Math.min(1, S.phaseT / 1.6); moveTo(p, lerp(p.x, gp.cx, k * 0.9) + Math.cos(a) * 40, lerp(p.y, gp.cy, k * 0.9) + Math.sin(a) * 40, true); }
    } else { p.dvx *= 0.9; p.dvy *= 0.9; }
    return;
  }
  if (S.phase !== 'play') { p.dvx = p.dvy = 0; return; }
  const o = b.owner;
  if (o === p) { carrierAI(p, dt); return; }
  // reaction time: when the ball changes hands or is struck, carry on with the last decision for a moment
  if (p.seenEvt !== S.evt) { p.seenEvt = S.evt; p.react = 0.13 + rnd() * 0.09 + (0.95 - S.skill[t]) * 0.12; }
  if (p.react > 0) { p.react -= dt; return; }
  // just been sold a dummy: he goes the wrong way for a beat
  if (p.fooled > 0 && o) { moveTo(p, p.x - o.fx * 30 + o.fy * 40, p.y - o.fy * 30 - o.fx * 40, false); return; }
  if (S.restrict && S.restrict.team === t && S.restrict.t > 0 && o) {
    let vx = p.x - o.x, vy = p.y - o.y; const d = hyp(vx, vy) || 1;
    if (d < 95) moveTo(p, o.x + vx / d * 100, o.y + vy / d * 100, true); else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
    return;
  }
  const ch = S.chase[t], R = VN.walls ? 1 : 2.4;
  const pt = S.passTarget && S.passT > 0 && S.passTarget.team === t ? S.passTarget : null;
  if (pt === p && !o) { interceptPoint(p, AA); moveTo(p, AA.x, AA.y, true); return; }
  if (o && o.team === t) { // attacking support
    if (p.run > 0) { moveTo(p, p.x + S.dir[t] * 200, p.y, true); return; }
    if (p.rT <= 0) pickRun(p, o);
    moveTo(p, p.rx, p.ry, hyp(p.rx - p.x, p.ry - p.y) > 70 * R);
  } else if (o) { // defending
    const press = ch[0] === p, cover = ch[1] === p;
    const tac = S.tac[t], dO = hyp(o.x - p.x, o.y - p.y);
    // how far up the pitch the side presses: mentality and how the match is going
    const pressZone = VN.walls ? 1e9 : (0.25 + 0.25 * tac.ment + 0.1 * S.morale[t] + (S.score[t] < S.score[1 - t] && gameMinute() > VN.gameMins * 0.7 ? 0.3 : 0));
    const ballOurHalf = o.x * S.dir[t] < pressZone * HL;
    if (press && (ballOurHalf || dO < 260)) {
      moveTo(p, o.x + o.vx * 0.2, o.y + o.vy * 0.2, dO > 60);
      if (dO < PR * 2 + 10) standTackle(p, false);
      else if (dO < 70 && hyp(o.vx, o.vy) > 120 && rnd() < dt * (0.25 + 0.35 * p.att.tack) * S.skill[t] * (inBox(o.x, o.y, t) ? 0.15 : 1)) {
        // only from the front or the side, and at the ball, not the man
        const b2 = S.ball, sx2 = b2.x + b2.vx * 0.15 - p.x, sy2 = b2.y + b2.vy * 0.15 - p.y, sm = hyp(sx2, sy2) || 1;
        if ((sx2 * o.fx + sy2 * o.fy) / sm < 0.3) startSlide(p, sx2, sy2);
      }
    } else if (cover && S.skill[t] > 0.35) {
      const gx = ownGoalX(t); let vx = gx - o.x, vy = -o.y; const m = hyp(vx, vy) || 1;
      moveTo(p, o.x + vx / m * 90 * (VN.walls ? 0.8 : 1.6), o.y + vy / m * 90 * (VN.walls ? 0.8 : 1.6), false);
    } else if (p.mark) {
      const m = p.mark, gx = ownGoalX(t); let vx = gx - m.x, vy = -m.y; const dm = hyp(vx, vy) || 1;
      anchor(p, AA);
      // defenders hold the line rather than follow a runner into an offside trap
      let tx = m.x + vx / dm * 36, ty = m.y + vy / dm * 36;
      if (p.cat === 'DEF' && !VN.walls) tx = S.dir[t] * Math.min(tx * S.dir[t], S.line[t] * HL + 60);
      moveTo(p, tx, ty, hyp(tx - p.x, ty - p.y) > 120);
    } else { anchor(p, AA); moveTo(p, AA.x, AA.y, hyp(AA.x - p.x, AA.y - p.y) > 160); }
  } else { // loose ball
    if ((!pt && ch[0] === p) || (!pt && ch[1] === p && hyp(b.x - p.x, b.y - p.y) < 120 * R)) {
      interceptPoint(p, AA); moveTo(p, AA.x, AA.y, hyp(AA.x - p.x, AA.y - p.y) > 50);
    } else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
  }
}
function carrierAI(p, dt) {
  const t = p.team, sk = S.skill[t] + (S.last30 ? 0.05 : 0), d = S.dir[t], gx = d * HL;
  p.hold += dt;
  const dg = hyp(gx - p.x, p.y);
  const R = VN.walls ? 1 : 2.2;
  // steer toward goal (wide men down the line), around defenders
  let sx = gx - d * 30 - p.x, sy = clamp(p.y, -85 * R, 85 * R) - p.y;
  if (!VN.walls && (p.role === 'W' || p.role === 'WM' || p.role === 'WB' || p.role === 'FB') && p.x * d < HL * 0.6) sy = (sgn(p.y || p.ay) * HW * 0.78 - p.y) * 0.5;
  let mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
  let nearD = 1e9;
  for (const q of S.tp[1 - t]) {
    if (q.out) continue;
    const qx = q.x - p.x, qy = q.y - p.y, qd = hyp(qx, qy); if (qd < nearD) nearD = qd;
    if (qd < 120 && qd > 1 && (qx * sx + qy * sy) / qd > 0.2) {
      const side = (sx * qy - sy * qx) > 0 ? -1 : 1, w = (1 - qd / 120) * 1.5;
      sx += -sy * side * w; sy += sx * side * w;
    }
  }
  mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
  if (abs(p.y) > HW - 50) sy -= sgn(p.y) * 0.8;
  mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
  moveTo(p, p.x + sx * 90, p.y + sy * 90, nearD > 85 && p.stam > 0.25);
  // the odd heavy touch when running hard: the ball runs a little ahead, there to be won
  if (S.phase === 'play' && p.sprint && p.hold > 0.6 && nearD < 110 && rnd() < dt * 0.45 * (1.05 - sk)) {
    releaseBall(p); const b2 = S.ball; b2.vx = p.vx * 1.55 + (rnd() - 0.5) * 40; b2.vy = p.vy * 1.55 + (rnd() - 0.5) * 40; p.noBallT = 0.28; S.evt++; return;
  }
  if (p.hold < 0.28 || S.phase !== 'play') return;
  if (p.aiT > 0) return;
  p.aiT = lerp(0.42, 0.16, sk) + rnd() * 0.12 + (rnd() < 0.12 ? 0.18 + rnd() * 0.2 : 0); // now and then a moment of hesitation
  const pressed = nearD < 48;
  // a skill move to beat the man in front
  if (nearD < 70 && !pressed && p.cat !== 'DEF' && p.skillCD <= 0 && rnd() < 0.12 + 0.2 * p.att.pace * sk) { skillMove(p, sx * 0.6 + (rnd() < 0.5 ? -sy : sy), sy * 0.6 + (rnd() < 0.5 ? sx : -sx)); return; }
  // shoot
  const range = VN.walls ? 230 + 70 * sk : 520 + 300 * p.att.shot;
  const close = VN.walls ? 170 : 430;
  if (dg < range && (p.hold > 0.55 || dg < close) && (gx - p.x) * d > 0) {
    const blocked = laneMin(t, p.x, p.y, gx, 0, false) < 24;
    const angle = abs(p.y) / Math.max(60, abs(gx - p.x));
    let pS = (dg < close ? 0.62 : 0.12 + 0.2 * sk) * (blocked ? 0.25 : 1) * (angle > 1.4 ? 0.35 : 1);
    if (S.score[t] < S.score[1 - t] && gameMinute() > VN.gameMins * 0.8) pS *= 1.3;
    if (rnd() < pS) { aiShoot(p); return; }
  }
  if (!VN.walls) {
    // cross from the flank in the final third
    if (abs(p.y) > HW * 0.5 && p.x * d > HL * 0.42) {
      const tgt = crossTarget(p, AB);
      if ((tgt || p.x * d > HL * 0.7) && rnd() < (tgt ? 0.55 : 0.25)) { crossTo(p, AB.x, AB.y); return; }
    }
    // a through ball to a runner on the shoulder of the last man
    if (p.x * d > -HL * 0.2 && rnd() < 0.35 + 0.3 * sk) {
      const r = throughRunner(p);
      if (r) { throughTo(p, r); return; }
    }
    // in trouble near our own goal: clear it
    if (p.cat === 'DEF' && pressed && p.x * d < -HL * 0.55 && rnd() < 0.7) { lofted(p, d, (rnd() - 0.5) * 0.6 + sgn(p.y || 1) * 0.5, 900 + rnd() * 400); return; }
  }
  // pass
  if (pressed || p.hold > 1.3 + 1.4 * sk || rnd() < 0.08) {
    const m = bestAIReceiver(p, false);
    if (m && rnd() < (pressed ? 0.85 : 0.45)) { aiPass(p, m); return; }
  }
  if (dg > (VN.walls ? 380 : 1500) && sk > 0.6 && rnd() < 0.05) { const m = bestAIReceiver(p, false); if (m) aiPass(p, m, true); }
}
function throughRunner(p) {
  const t = p.team, d = S.dir[t], line = S.offLine[t];
  let best = null, bs = -1e9;
  for (const m of S.tp[t]) {
    if (m === p || m.out || m.role === 'GK' || !(m.cat === 'ATT' || m.role === 'AM' || m.role === 'WB')) continue;
    const mx = m.x * d;
    // a mistimed run now and then: the pass goes, the flag goes up
    if (mx > line - 2 && !(mx < line + 30 && rnd() < (1 - S.skill[t]) * 0.4)) continue;
    if (line - mx > 160) continue; // not on the shoulder
    if (mx < p.x * d - 100) continue;
    const tx = m.x + d * 220, ty = m.y;
    if (abs(tx) > HL - 30) continue;
    const lane = laneMin(t, p.x, p.y, tx, ty, false);
    if (lane < 30) continue;
    const sc = lane + m.att.pace * 50 - abs(m.y) * 0.02;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
function aiShoot(p) {
  const t = p.team, sk = S.skill[t], gx = attackX(t);
  const gk = gkOf(1 - t);
  let ty = (gk && gk.y > 0 ? -1 : 1) * (GH - 18) * (0.45 + rnd() * 0.55);
  if (rnd() < 0.18) ty = (rnd() - 0.5) * GH;
  ty += (rnd() - 0.5) * (1.2 - sk) * GH * (VN.walls ? 1.1 : 1.7);
  const dx = gx - p.x, dy = ty - p.y;
  const dg = hyp(dx, dy);
  const gkOut = gk && hyp(gk.x - gx, gk.y) > 140 && dg > 300;
  const kind = gkOut && rnd() < 0.6 ? 'chip' : dg < (VN.walls ? 200 : 500) ? (rnd() < 0.5 ? 'place' : 'drive') : rnd() < 0.5 ? 'drive' : 'place';
  shootAt(p, dx, dy, clamp(0.45 + 0.3 * sk * rnd() + 0.15 * rnd(), 0.35, 0.9), 0, (1.1 - sk) * (VN.walls ? 0.1 : 0.16), kind);
}
function bestAIReceiver(p, throwIn) {
  let best = null, bs = -1e9; const dir = S.dir[p.team], R = VN.walls ? 1 : 2.4;
  for (const m of S.tp[p.team]) {
    if (m === p || m.role === 'GK' || m.out) continue;
    const d = hyp(m.x - p.x, m.y - p.y); if (d < 70 || d > (throwIn ? 480 : 430 * R)) continue;
    const lane = laneMin(p.team, p.x, p.y, m.x, m.y, false); if (lane < 26) continue;
    if (!VN.walls && m.x * dir > S.offLine[p.team] + 2 && rnd() > (1.05 - S.skill[p.team]) * 0.5) continue; // he is offside (and usually seen to be)
    let no = 1e9; for (const q of S.tp[1 - p.team]) { if (q.out) continue; const dd = hyp(q.x - m.x, q.y - m.y); if (dd < no) no = dd; }
    // a side with an attacking mind looks forward first; a defensive one keeps it
    const fwdW = 0.25 * (1 + 0.4 * S.tac[p.team].ment);
    const sc = (m.x - p.x) * dir * fwdW / (VN.walls ? 1 : 1.6) + Math.min(no, 100 * R) * 0.5 / R + lane * 0.3 / R - d * 0.05 / R + (abs(m.x - attackX(p.team)) < 260 * R ? 30 : 0);
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
function aiPass(p, m, lob) { passTo(p, m, !!lob || (!VN.walls && hyp(m.x - p.x, m.y - p.y) > 900), (1 - S.skill[p.team]) * 0.2 + (S.nearD < 50 ? 0.05 : 0)); }
function keeperAI(g, dt) {
  const b = S.ball, t = g.team, d = S.dir[t], gx = -d * HL, sk = S.kskill[t];
  if (g.stunT > 0 || g.diving) return;
  if (S.phase !== 'play') { g.dvx = g.dvy = 0; return; }
  if (b.owner === g) {
    g.dvx = g.dvy = 0;
    g.holdT -= dt;
    if (g.holdT <= 0) {
      // roll it out to a defender, or kick it long under pressure
      let pressure = 0; for (const o of S.tp[1 - t]) if (!o.out && hyp(o.x - g.x, o.y - g.y) < 300) pressure++;
      let best = null, bs = -1e9;
      for (const m of S.tp[t]) {
        if (m === g || m.out) continue; const dd = hyp(m.x - g.x, m.y - g.y);
        const sc = laneMin(t, g.x, g.y, m.x, m.y, false) * 0.5 + (m.x - g.x) * d * 0.1 - dd * 0.05 + (pressure > 1 && m.cat !== 'DEF' ? 40 : 0);
        if (sc > bs) { bs = sc; best = m; }
      }
      const long = !VN.walls && (pressure > 1 || rnd() < 0.3);
      if (best) { if (long) passTo(g, best, true, 0.08); else passTo(g, best, false, 0.06); if (t === 0 && !S.demo) { S.ctrl = best.i; S.switchLock = 0.4; } }
    }
    return;
  }
  const bd = hyp(b.x - gx, b.y);
  // incoming shot?
  const toward = (gx - b.x) * b.vx > 0 && !b.owner;
  if (toward && abs(b.vx) > 150 && g.diveRec <= 0 && g.diveDelay < 0 && !g.humanDive) {
    const tc = (gx - b.x) / b.vx;
    if (tc > 0 && tc < 0.7) {
      const yc = b.y + b.vy * tc, zc = b.z + b.vz * tc - 0.5 * GRAV * tc * tc;
      if (abs(yc) < GH + 24 && zc < GOAL_H + 12 && hyp(b.vx, b.vy) > 240) {
        g.diveTo = clamp(yc, -(GH - 8), GH - 8);
        if (rnd() > 0.5 + 0.48 * sk) g.diveTo = clamp(yc + sgn(rnd() - 0.5) * (35 + rnd() * 45), -(GH - 8), GH - 8);
        g.diveDelay = 0.07 + (1 - sk) * 0.12 + rnd() * 0.05; // a keeper reads the shot in about 100 to 200 ms
      }
    }
  }
  if (g.diveDelay >= 0) { g.diveDelay -= dt; if (g.diveDelay < 0) { keeperDive(g, g.diveTo); g.diveDelay = -1; return; } }
  // positioning on an arc between the ball and the middle of the goal
  const R = VN.walls ? 1 : 1.6;
  const rad = clamp(bd * 0.13 + 16, 24, 66 * R);
  let vx = b.x - gx, vy = b.y; const m = hyp(vx, vy) || 1;
  let tx = gx + d * (vx / m * rad), ty = (vy / m * rad);
  if (b.owner && b.owner.team !== t && hyp(b.owner.x - gx, b.owner.y) < 230 * R) { tx = gx + d * (rad + 10) * (vx / m); }
  ty = clamp(ty, -(GH - 4), GH - 4);
  tx = clamp(tx * d, gx * d + 14, gx * d + 90 * R) * d;
  // come off his line for a loose ball or a through ball he can reach first
  const myD = hyp(g.x - b.x, g.y - b.y);
  if (!b.owner && abs(b.x - gx) < (VN.walls ? 120 : VN.boxD + 60) && abs(b.y) < (VN.walls ? 120 : VN.boxW) && b.z < 40 && S.chase[t].every((q) => hyp(q.x - b.x, q.y - b.y) > myD + 12) && S.chase[1 - t].every((q) => hyp(q.x - b.x, q.y - b.y) > myD - 8)) { tx = b.x; ty = b.y; }
  // a cross dropping into his six-yard box: go and claim it
  if (!VN.walls && !b.owner && b.z > 30 && b.vz < 60 && abs(b.x - gx) < VN.sixD * 1.6 && abs(b.y) < VN.sixW * 1.2) { tx = b.x + b.vx * 0.3; ty = b.y + b.vy * 0.3; }
  moveTo(g, tx, ty, hyp(tx - g.x, ty - g.y) > 80);
  g.dvx *= 0.7 + 0.45 * sk; g.dvy *= 0.7 + 0.45 * sk;
}
function keeperDive(g, toY) {
  if (g.diving) return;
  g.diving = true; g.diveE = 0; g.diveY0 = g.y; g.diveX0 = g.x; g.diveX1 = g.x; g.diveY1 = clamp(toY, -(GH - 6), GH - 6); g.diveDir = g.diveY1 > g.y ? 1 : -1; if (abs(g.diveY1 - g.y) < 8) g.diveDir = 0;
  g.dvx = g.dvy = 0;
}

/* ------------------------------------------------------------------ penalty shootout */
// Five each, then sudden death. Every kick is at the same end; the keeper of the other side faces it.
function startPenalties() {
  S.phase = 'penalties'; S.phaseT = 0; S.charging = false; S.rs = null; S.replay = null;
  S.pen = { kicks: [[], []], k: 0, stage: 'intro', t: 0, aimY: 0, aimH: 26, charge: 0, charging: false, taker: null, keeper: null, saved: false, scored: false, res: '', winner: -1, first: 0, humanDive: false, order: [[], []] };
  for (let t = 0; t < 2; t++) S.pen.order[t] = S.tp[t].filter((p) => !p.out && p.role !== 'GK').sort((a, b) => b.att.shot - a.att.shot);
  S.ball.owner = null;
  S.players.forEach((p) => { p.dvx = p.dvy = 0; p.diving = false; p.stunT = 0; p.slideT = 0; p.cheer = 0; });
  CAM.snap = true;
  if (!S.demo && !S.cfg.shootout) arc.toast('Penalty shootout', 'Still level', 2200);
  snd.whistle(1);
  penSetup();
  S.pen.stage = 'intro'; S.pen.t = 0;
}
function penTeamOf(k) { return k % 2 === 0 ? S.pen.first : 1 - S.pen.first; }
function penSetup() {
  const pen = S.pen, b = S.ball;
  pen.team = penTeamOf(pen.k);
  const round = Math.floor(pen.k / 2), ord = pen.order[pen.team];
  pen.taker = ord[round % ord.length];
  pen.keeper = gkOf(1 - pen.team);
  pen.saved = false; pen.scored = false; pen.charge = 0; pen.charging = false; pen.humanDive = false; pen.aimY = 0; pen.aimH = GOAL_H * 0.4; pen.res = '';
  const cx = VN.walls ? 0 : 0;
  S.players.forEach((p, i) => { // everyone else waits in the centre circle, arm in arm
    const slot = i % S.tp[p.team].length;
    p.x = cx - 40 + slot * 7 + (p.team ? 50 : -50); p.y = -VN.circle * 0.6 + slot * (VN.circle * 1.2 / Math.max(1, S.tp[p.team].length)); p.vx = p.vy = 0; p.fx = 1; p.fy = 0; p.diving = false; p.diveRec = 0; p.noBallT = 0; p.humanDive = false;
  });
  pen.taker.x = HL - VN.spot - 40; pen.taker.y = 0; pen.taker.fx = 1; pen.taker.fy = 0;
  pen.keeper.x = HL - 10; pen.keeper.y = 0; pen.keeper.fx = -1; pen.keeper.fy = 0; pen.keeper.diving = false;
  b.owner = null; b.x = HL - VN.spot; b.y = 0; b.z = 0; b.vx = b.vy = b.vz = 0; b.cv = 0; b.inGoal = 0;
  pen.stage = 'aim'; pen.t = 0;
  if (pen.team === 0) S.ctrl = pen.taker.i;
}
function penShoot(aimY, aimH, power) {
  const pen = S.pen, b = S.ball, p = pen.taker;
  const v = 430 + 520 * power;
  const dx = HL - b.x, dy = aimY - b.y, dm = hyp(dx, dy);
  const t = dm / v;
  const vz = Math.max(0, (aimH - 4 + 0.5 * GRAV * t * t) / t);
  b.vx = dx / dm * v; b.vy = dy / dm * v; b.vz = vz; b.z = 4; b.lastTouch = p; b.lastTeam = p.team;
  p.kickT = 0.25; p.fx = 1; p.fy = 0; snd.kick(power);
  pushEvt('shot', p, null, v);
  recordEvent(1, p);
  pen.stage = 'flight'; pen.t = 0;
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
  if (!S.demo) arc.haptic(goal === (pen.team === 0) ? 'success' : 'fail', 0.9);
  if (goal) { snd.roar(true); if (!S.demo) arc.toast('GOAL!', pen.taker.name, 1500); confetti(HL, 0, pen.team); if (POST) POST.flash(0.18, '#fff2d0'); pushEvt('pengoal', pen.taker, null, pen.team); }
  else { snd.ooh(); if (!S.demo) arc.toast(pen.saved ? 'Saved!' : 'Missed!', pen.taker.name, 1500); pushEvt('penmiss', pen.taker, pen.keeper, pen.saved ? 1 : 0); }
  pen.k++;
  const a = pen.kicks[0], c = pen.kicks[1], sa = a.reduce((x, y) => x + y, 0), sc = c.reduce((x, y) => x + y, 0);
  const ra = Math.max(0, 5 - a.length), rc = Math.max(0, 5 - c.length);
  if (a.length <= 5 && c.length <= 5 && !(a.length === 5 && c.length === 5)) {
    if (sa > sc + rc) pen.winner = 0; else if (sc > sa + ra) pen.winner = 1;
  } else if (a.length === c.length && a.length >= 5) {
    if (sa !== sc) pen.winner = sa > sc ? 0 : 1;
  }
}
function penUpdate(dt) {
  const pen = S.pen, IN = arc.input;
  pen.t += dt;
  const k = pen.keeper;
  if (pen.stage === 'intro') { if (pen.t > 1.2) penSetup(); return; }
  const humanTaker = pen.team === 0 && !S.demo;
  const humanKeeper = pen.team === 1 && !S.demo;
  if (pen.stage === 'aim') {
    if (humanTaker) {
      const gz = IN.gesture, swE = IN.swipe();
      if (IN.dragSteer && gz.active && gz.type !== 'mouse') {
        const up = Math.max(24, -gz.dy);
        pen.aimY = clamp(screenAimY(gz.dx / up), -(GH + 24), GH + 24);
        pen.aimH = clamp(10 + Math.min(1, hyp(gz.dx, gz.dy) / 140) * GOAL_H * 0.65, 5, GOAL_H + 20);
      } else {
        const ax = IN.axis();
        pen.aimY = clamp(pen.aimY + aimAcross(ax.x) * 150 * dt * (GH / 70), -(GH + 24), GH + 24);
        pen.aimH = clamp(pen.aimH - ax.y * 70 * dt * (GOAL_H / 56), 5, GOAL_H + 20);
      }
      if (swE) penSwipe(swE);
      else {
        if (IN.hit('KeyK', 'KeyJ', 'Space') && !pen.charging) { pen.charging = true; pen.charge = 0.001; }
        if (pen.charging) {
          if (IN.down('KeyK', 'KeyJ', 'Space')) pen.charge = Math.min(1, pen.charge + dt / 0.9);
          else { pen.charging = false; let ay = pen.aimY, ah = pen.aimH; const pw = pen.charge; if (pw > 0.92) { ay += (rnd() - 0.5) * GH * 0.5; ah += (rnd() - 0.2) * GOAL_H * 0.42; } if (pw < 0.3) ah = Math.min(ah, GOAL_H * 0.5); penShoot(ay, ah, Math.max(0.25, pw)); GI.shots++; }
        }
      }
      if (pen.t > 12 && pen.stage === 'aim') penShoot(pen.aimY, pen.aimH, 0.6);
    } else if (pen.t > (S.demo ? 0.6 : 1.5)) {
      const sk = S.skill[pen.team];
      const side = pick([-1, 1, -1, 1, 0]);
      const ay = side * (GH - 12 - rnd() * 14) + (rnd() - 0.5) * (1 - sk) * GH * 0.85;
      const ah = GOAL_H * (0.18 + rnd() * 0.68) + (rnd() - 0.5) * (1 - sk) * GOAL_H * 0.42;
      penShoot(ay, ah, clamp(0.55 + 0.35 * sk + (rnd() - 0.5) * 0.25, 0.3, 1));
    }
    if (humanKeeper && !pen.humanDive && (IN.tap() || IN.swipe() || IN.hit('KeyJ', 'KeyK', 'Space'))) penHumanDive();
  } else if (pen.stage === 'flight') {
    if (humanKeeper && !pen.humanDive) penHumanDive();
    if (k.diveDelay >= 0) { k.diveDelay -= dt; if (k.diveDelay < 0) { keeperDive(k, k.diveTo); k.diveDelay = -1; } }
    updateBall(dt); keeperSaves(); integratePlayers(dt);
    if (pen.saved && pen.t > 0.9) penResolve(false);
    else if (!pen.scored && pen.t > 1.7) penResolve(false);
    if (S.ball.owner && pen.stage === 'flight') penResolve(false);
  } else if (pen.stage === 'result') {
    updateBall(dt); integratePlayers(dt);
    if (pen.t > 1.6) {
      if (pen.winner >= 0) { S.penWinner = pen.winner; S.pen.done = true; S.phase = 'break'; S.brk = { kind: 'full', t: 0 }; CAM.snap = true; pushEvt('fulltime', null, null, pen.winner); }
      else penSetup();
    }
  }
}
function penSwipe(sw) {
  const pen = S.pen;
  const up = Math.max(24, -sw.dy);
  let ay = clamp(screenAimY(sw.dx / up), -(GH + 24), GH + 24);
  const pw = clamp((sw.power - 0.2) / 0.8, 0, 1), chip = pathChip(sw);
  let ah = chip ? GOAL_H * 0.82 : 10 + pw * GOAL_H * 0.64;
  if (pw > 0.96 && !chip) { ay += (rnd() - 0.5) * GH * 0.43; ah += (rnd() - 0.2) * GOAL_H * 0.4; }
  pen.aimY = ay; pen.aimH = ah; GI.shots++; if (chip) GI.chips++;
  flashTrail(chip ? 2 : 1);
  penShoot(ay, ah, chip ? 0.5 : Math.max(0.3, 0.4 + 0.55 * pw));
}
function penHumanDive() {
  const IN = arc.input, ax = IN.axis(), pen = S.pen;
  const tp = IN.tap(), sw = IN.swipe();
  if (tp || sw) {
    const raw = sw ? (sw.dir === 'left' ? -1 : sw.dir === 'right' ? 1 : 0) : (tp.nx < 0.38 ? -1 : tp.nx > 0.62 ? 1 : 0);
    keeperDive(pen.keeper, aimAcross(raw) * (GH - 14)); pen.humanDive = true; GI.dives++;
    return;
  }
  if (IN.hit('KeyJ', 'KeyK', 'Space') && !ax.x) { keeperDive(pen.keeper, 0); pen.humanDive = true; GI.dives++; return; }
  if (ax.x < -0.5) { keeperDive(pen.keeper, aimAcross(-1) * (GH - 14)); pen.humanDive = true; GI.dives++; }
  else if (ax.x > 0.5) { keeperDive(pen.keeper, aimAcross(1) * (GH - 14)); pen.humanDive = true; GI.dives++; }
  else if (ax.y < -0.6) { keeperDive(pen.keeper, 0); pen.humanDive = true; GI.dives++; }
}

/* ------------------------------------------------------------------ the referee and his assistants */
function refStep(dt) {
  const b = S.ball, R = S.ref;
  // a diagonal: ahead of play and to one side, never in the passing lanes
  const d = possTeam() === 0 ? S.dir[0] : S.dir[1];
  const tx = clamp(b.x - d * (VN.walls ? 60 : 180), -HL + 40, HL - 40), ty = clamp(b.y + (b.y > 0 ? -1 : 1) * (VN.walls ? 80 : 240), -HW + 40, HW - 40);
  const dx = tx - R.x, dy = ty - R.y, dd = hyp(dx, dy);
  const sp = dd > 240 ? 190 : dd > 40 ? 120 : 0;
  R.vx = approach(R.vx, dd > 1 ? dx / dd * sp : 0, 500 * dt); R.vy = approach(R.vy, dd > 1 ? dy / dd * sp : 0, 500 * dt);
  R.x += R.vx * dt; R.y += R.vy * dt;
  const fd = hyp(b.x - R.x, b.y - R.y) || 1; R.fx = (b.x - R.x) / fd; R.fy = (b.y - R.y) / fd;
  if (VN.walls) return;
  // assistants run the touchline, level with the second-last defender of their half
  for (let k = 0; k < 2; k++) {
    const A = S.ars[k], half = k === 0 ? -1 : 1;
    // the side attacking toward this half
    const at = S.dir[0] === half ? 0 : 1;
    const lineV = Math.max(offsideLine(at), b.x * S.dir[at], 0);
    const tx2 = clamp(lineV * S.dir[at], half < 0 ? -HL : 0, half < 0 ? 0 : HL);
    const ddx = tx2 - A.x, sp2 = abs(ddx) > 30 ? 160 : abs(ddx) > 4 ? 70 : 0;
    A.vx = approach(A.vx, sgn(ddx) * sp2, 600 * dt); A.vy = 0;
    A.x += A.vx * dt;
    A.fx = 0; A.fy = k === 0 ? -1 : 1;
    if (A.flag > 0) A.flag -= dt;
  }
}

/* ------------------------------------------------------------------ the replay recorder */
// The last eight seconds, thirty times a second: every player and the ball. Fixed arrays, nothing allocated.
const REC = { n: 0, hz: 30, acc: 0, cap: 240, stride: 0, buf: null, ball: new Float32Array(240 * 3), ev: [], evN: 0 };
for (let i = 0; i < 48; i++) REC.ev.push({ f: -1, i: 0, k: 0 });
function recReset() { REC.n = 0; REC.acc = 0; REC.evN = 0; REC.stride = 6; if (!REC.buf) REC.buf = new Float32Array(REC.cap * 26 * 6); for (const e of REC.ev) e.f = -1; }
function recordFrame(dt) {
  if (S.demo || !REC.buf || (S.replay && S.replay.on)) return;
  REC.acc += dt;
  if (REC.acc < 1 / REC.hz) return;
  REC.acc -= 1 / REC.hz; if (REC.acc > 0.1) REC.acc = 0;
  const f = REC.n % REC.cap, P = S.players, base = f * 26 * 6;
  for (let i = 0; i < P.length && i < 25; i++) {
    const p = P[i], o = base + i * 6;
    REC.buf[o] = p.x; REC.buf[o + 1] = p.y; REC.buf[o + 2] = p.fx; REC.buf[o + 3] = p.fy; REC.buf[o + 4] = hyp(p.vx, p.vy); REC.buf[o + 5] = (p.diving ? 1 : 0) + (p.slideT > 0 ? 2 : 0) + (p.out ? 4 : 0) + (p.jumpT > 0 ? 8 : 0);
  }
  const R = S.ref, o = base + 25 * 6; REC.buf[o] = R.x; REC.buf[o + 1] = R.y; REC.buf[o + 2] = R.fx; REC.buf[o + 3] = R.fy; REC.buf[o + 4] = hyp(R.vx, R.vy); REC.buf[o + 5] = 0;
  const b = S.ball; REC.ball[f * 3] = b.x; REC.ball[f * 3 + 1] = b.y; REC.ball[f * 3 + 2] = b.z;
  REC.n++;
}
function recordEvent(kind, p) {
  if (!S || S.demo || (S.replay && S.replay.on)) return;
  const e = REC.ev[REC.evN % REC.ev.length]; REC.evN++;
  e.f = REC.n; e.i = p.i; e.k = kind;
}
// three angles of the goal: the broadcast shot, then low behind the goal and a high reverse, both slowed
function startReplay() {
  const span = Math.min(REC.n - 1, REC.hz * 6);
  if (span < REC.hz * 1.5 || arc.reducedMotion && false) return false;
  const to = REC.n - 1, from = to - span;
  S.replay = { on: true, angle: 0, from, to, f: from, a0: from, speed: 1, t: 0, total: 0, saved: null };
  replayAngle(0);
  pushEvt('replay', null, null, 0);
  return true;
}
function replayAngle(k) {
  const R = S.replay, len = R.to - R.from;
  R.angle = k; R.t = 0;
  if (k === 0) { R.a0 = R.to - Math.floor(REC.hz * 3.2); R.speed = 1; }
  else if (k === 1) { R.a0 = R.to - Math.floor(REC.hz * 1.8); R.speed = 0.5; }
  else { R.a0 = R.to - Math.floor(REC.hz * 1.5); R.speed = 0.45; }
  void len;
  R.a0 = Math.max(R.from, R.a0); R.f = R.a0; R.lastF = R.a0 - 1; R.hold = 0;
  for (const r of RIGS) r.snap = true;
  CAM.snap = true;
}
function replayStep(rawdt) {
  const R = S.replay;
  R.t += rawdt; R.total += rawdt;
  if (R.f < R.to) { R.f = Math.min(R.to, R.f + rawdt * REC.hz * R.speed); R.hold = 0; }
  else { R.hold += rawdt; if (R.hold > (R.angle === 0 ? 0.3 : 0.7)) { if (R.angle < 2) replayAngle(R.angle + 1); else endReplay(); return; } }
  applyReplay(R.f);
}
function applyReplay(fr) {
  const f0 = Math.floor(fr), k = fr - f0, f1 = Math.min(f0 + 1, REC.n - 1);
  const a = (f0 % REC.cap) * 26 * 6, c = (f1 % REC.cap) * 26 * 6, B = REC.buf, P = S.players;
  for (let i = 0; i < P.length && i < 25; i++) {
    const p = P[i], o = i * 6;
    p.x = lerp(B[a + o], B[c + o], k); p.y = lerp(B[a + o + 1], B[c + o + 1], k);
    p.fx = lerp(B[a + o + 2], B[c + o + 2], k); p.fy = lerp(B[a + o + 3], B[c + o + 3], k);
    const sp = B[a + o + 4]; p.vx = p.fx * sp; p.vy = p.fy * sp;
    const fl = B[a + o + 5]; p.rDive = !!(fl & 1); p.rSlide = !!(fl & 2); p.rOut = !!(fl & 4);
  }
  const ro = 25 * 6, Rf = S.ref; Rf.x = lerp(B[a + ro], B[c + ro], k); Rf.y = lerp(B[a + ro + 1], B[c + ro + 1], k); Rf.fx = B[a + ro + 2]; Rf.fy = B[a + ro + 3]; Rf.vx = Rf.fx * B[a + ro + 4]; Rf.vy = Rf.fy * B[a + ro + 4];
  const b = S.ball, ba = (f0 % REC.cap) * 3, bc = (f1 % REC.cap) * 3;
  b.owner = null; b.x = lerp(REC.ball[ba], REC.ball[bc], k); b.y = lerp(REC.ball[ba + 1], REC.ball[bc + 1], k); b.z = lerp(REC.ball[ba + 2], REC.ball[bc + 2], k);
}
function endReplay() {
  if (!S.replay) return;
  S.replay.on = false;
  for (const p of S.players) { p.rDive = p.rSlide = p.rOut = false; }
  for (const r of RIGS) r.snap = true;
  arc.fade(260);
  afterGoal();
}
function skipReplay() { if (S.replay && S.replay.on) { GI.skips++; endReplay(); } }
// after a goal (and its replay): the half may be over, otherwise the side that conceded kicks off
function afterGoal() {
  S.replay = null;
  if (periodOver()) { endPeriod(); return; }
  S.kickTeam = 1 - S.goalTeam;
  startRestart('kickoff', S.kickTeam, 0, 0, { snap: true });
  CAM.snap = true;
}

/* ------------------------------------------------------------------ periods, breaks, walkouts */
function endPeriod() {
  S.charging = false; S.rs = null;
  S.players.forEach((p) => { p.dvx = p.dvy = 0; });
  const level = S.score[0] === S.score[1];
  if (S.period === 1 || S.period === 3) {
    snd.whistle(1);
    S.phase = 'break'; S.brk = { kind: S.period === 1 ? 'half' : 'eth', t: 0 };
    if (!S.demo) { arc.toast(S.period === 1 ? 'Half time' : 'Extra time, half time', S.teams[0].abbr + ' ' + S.score[0] + ' - ' + S.score[1] + ' ' + S.teams[1].abbr, 2400); say(pick(LINES.half), 3); }
    pushEvt('half', null, null, 0);
    return;
  }
  if (S.period === 2 && level && S.cfg.knockout && !S.demo) {
    snd.whistle(2);
    S.phase = 'break'; S.brk = { kind: 'et', t: 0 };
    arc.toast('Extra time', 'Level after ninety minutes', 2400); say(pick(LINES.et), 3);
    pushEvt('half', null, null, 0);
    return;
  }
  if (S.period === 4 && level && S.cfg.knockout && !S.demo) { snd.whistle(2); startPenalties(); return; }
  snd.whistle(2); snd.roar(false);
  S.phase = 'break'; S.brk = { kind: 'full', t: 0 };
  pushEvt('fulltime', null, null, level ? -1 : S.score[0] > S.score[1] ? 0 : 1);
  if (!S.demo) { arc.toast('Full time', S.teams[0].abbr + ' ' + S.score[0] + ' - ' + S.score[1] + ' ' + S.teams[1].abbr, 2400); say(pick(LINES.full), 3); }
}
function breakStep(dt) {
  const B = S.brk; B.t += dt;
  integratePlayers(dt);
  if (B.kind === 'full') { if (B.t > 2.6 && !B.done) { B.done = true; finishMatch(); } return; }
  // a fade out, the teams swap ends, a fade back in on the kick-off
  if (B.t < 2.6) { S.fade = clamp((B.t - 1.9) / 0.7, 0, 1); return; }
  if (!B.swapped) {
    B.swapped = true;
    S.period++; S.pt = 0; S.added = 0; S.addedShown = false; S.lost = 0; S.last30 = false;
    S.dir = [-S.dir[0], -S.dir[1]];
    S.kickTeam = S.period === 2 || S.period === 4 ? 1 : 0;
    startRestart('kickoff', S.kickTeam, 0, 0, { snap: true });
    S.phase = 'break'; S.brk = B; CAM.snap = true;
    for (const r of RIGS) r.snap = true;
    // the manager's half-time tweak, if the player changed the shape
    applyTactics();
  }
  if (B.t < 3.4) { S.fade = 1 - (B.t - 2.6) / 0.8; return; }
  S.fade = 0; S.phase = 'restart'; S.brk = null;
}
// The teams come out of the tunnel side by side, line up facing the main stand for the anthem, then break.
const WK_END = 11;
function startWalkout() {
  S.phase = 'walkout'; S.phaseT = 0;
  const LY = HW * 0.6;
  S.wk = { t: 0, LY, anthem: false, flare: false };
  for (const p of S.players) {
    const t = p.team, k = S.tp[t].indexOf(p), sx = t === 0 ? -1 : 1;
    p.wkX0 = sx * 18; p.wkY0 = HW + 40 + k * 30; p.wkT0 = k * 0.32;
    p.wkX1 = sx * (80 + k * 38); p.wkY1 = LY;
    p.x = p.wkX0; p.y = p.wkY0; p.fx = 0; p.fy = -1; p.vx = p.vy = 0;
  }
  S.ref.x = 0; S.ref.y = HW + 10; S.ars[0].x = -30; S.ars[0].y = HW + 10; S.ars[1].x = 30; S.ars[1].y = HW + 10;
  S.ball.owner = null; S.ball.x = 0; S.ball.y = LY - 30; S.ball.z = 0;
  pushEvt('walkout', null, null, 0);
}
function walkoutStep(dt) {
  const W = S.wk; W.t += dt;
  const IN = arc.input;
  if (W.t > 0.4 && (IN.tap() || IN.swipe() || IN.hit('Space', 'KeyJ', 'KeyK', 'Enter', 'KeyU', 'KeyQ', 'KeyI', 'KeyE', 'ShiftLeft'))) { GI.skips++; endWalkout(); return; }
  for (const p of S.players) {
    if (W.t < p.wkT0) { p.dvx = p.dvy = 0; continue; }
    const dx = p.wkX1 - p.x, dy = p.wkY1 - p.y, d = hyp(dx, dy);
    if (W.t < 8.6) {
      if (d > 4) { const sp = Math.min(118, d * 2); p.dvx = dx / d * sp; p.dvy = dy / d * sp; p.sprint = false; }
      else { p.dvx = p.dvy = 0; p.fx = 0; p.fy = 1; p.vx *= 0.5; p.vy *= 0.5; }
    } else { anchor(p, AA, true); moveTo(p, AA.x, AA.y, false); p.dvx *= 0.6; p.dvy *= 0.6; }
  }
  // the officials lead them out
  const R = S.ref; if (R.y > W.LY + 4) { R.vy = -110; R.y += R.vy * dt; } else { R.vy = 0; R.fx = 0; R.fy = 1; }
  for (let k = 0; k < 2; k++) { const A = S.ars[k], tx = (k ? 1 : -1) * 34; if (A.y > W.LY + 4) { A.y -= 110 * dt; A.vy = -110; } else { A.vy = 0; A.fy = 1; } A.x += (tx - A.x) * dt * 2; }
  integratePlayers(dt);
  if (W.t > 5.6 && !W.anthem) { W.anthem = true; snd.anthem(S.club[S.hostTeam]); pushEvt('anthem', null, null, S.hostTeam); if (!S.demo) say('The ' + S.teams[S.hostTeam].short + ' anthem rings around ' + TEAMS[S.club[S.hostTeam]].ground + '.', 3.4); }
  if (W.t > 2.2 && !W.flare) { W.flare = true; pushEvt('flare', null, null, S.hostTeam); }
  if (W.t > WK_END) endWalkout();
  else if (W.t > WK_END - 0.7) S.fade = (W.t - (WK_END - 0.7)) / 0.7;
}
function endWalkout() {
  S.wk = null; S.fade = 0;
  arc.fade(260);
  startRestart('kickoff', S.kickTeam, 0, 0, { snap: true });
  S.ref.x = 0; S.ref.y = -VN.circle - 60; S.ars[0].x = -HL * 0.3; S.ars[0].y = HW + 26; S.ars[1].x = HL * 0.3; S.ars[1].y = -HW - 26;
  for (const r of RIGS) r.snap = true;
  CAM.snap = true;
}

/* ------------------------------------------------------------------ frame update */
function stepSim(rawdt) {
  const ph = S.phase;
  S.phaseT += rawdt;
  S.sayCD -= rawdt; S.sfxWall -= rawdt; S.excite = Math.max(0, S.excite - rawdt * 0.35);
  if (S.say) { S.say.age += rawdt; if (S.say.age > S.say.life) S.say = null; }
  if (S.band) { S.band.t += rawdt; if (S.band.t > 3.4) S.band = null; }
  if (S.boardT > 0) S.boardT -= rawdt;
  if (S.replay && S.replay.on) {
    replayStep(rawdt);
    if (arc.input.tap() || arc.input.hit('Space', 'KeyJ', 'KeyK', 'Enter', 'Escape')) skipReplay();
    return;
  }
  // slow motion on a goal
  const targetSlow = (ph === 'goal' && S.phaseT < 1.1 && !arc.reducedMotion) ? 0.42 : 1;
  S.slow = approach(S.slow, targetSlow, rawdt * 3);
  const dt = rawdt * S.slow;
  S.t += dt;
  for (let i = 0; i < 2; i++) { const n = S.nets[i]; if (n.amp > 0) { n.t += rawdt; n.amp = Math.max(0, n.amp - rawdt * 0.7); } }
  if (S.flash > 0) S.flash = Math.max(0, S.flash - rawdt * 1.8);
  if (S.restrict) { S.restrict.t -= dt; if (S.restrict.t <= 0) S.restrict = null; }
  if (S.passT > 0) S.passT -= dt;
  if (S.headBuf > 0) S.headBuf -= dt;
  if (S.advT > 0) S.advT -= dt;
  if (S.gkWin > 0) { S.gkWin -= dt; if (!S.demo) keeperWindow(); }
  if (S.inPen) { S.inPen.t += dt; if (S.inPen.t > 2) S.inPen = null; }
  updateParticles(dt);
  crowdTick(rawdt);
  if (ph === 'walkout') { walkoutStep(rawdt); recordFrame(dt); return; }
  if (ph === 'penalties') { penUpdate(rawdt); return; }
  if (ph === 'break') { breakStep(rawdt); return; }
  S.infoT -= dt; if (S.infoT <= 0) { S.infoT = 0.14; computeInfo(); }
  S.markT -= dt; if (S.markT <= 0) { S.markT = 0.45; assignMarks(0); assignMarks(1); }
  if (S.cfg.training) trainStep(dt);
  if (S.phase === 'restart') {
    restartStep(dt);
    refStep(dt);
    if (!S.cfg.training) tickClock(dt, false);
    recordFrame(dt);
    return;
  }
  // play and goal share the main loop
  if (!S.demo) {
    autoSwitch(dt);
    const cp = S.players[S.ctrl];
    if (S.phase === 'play' && cp && cp.role !== 'GK') humanControl(dt);
    else if (cp && cp.role !== 'GK') { cp.dvx = cp.dvy = 0; }
  }
  const P = S.players;
  for (let i = 0; i < P.length; i++) { const p = P[i]; if (!S.demo && i === S.ctrl && S.phase === 'play' && p.role !== 'GK') continue; aiPlayer(p, dt); }
  integratePlayers(dt);
  updateBall(dt);
  refStep(dt);
  if (S.phase === 'play') {
    tryPickup(); if (S.phase === 'play') keeperSaves(); if (S.phase === 'play') slideContacts();
    if (S.headBuf > 0 && S.ball.z > 30) tryHeader();
    if (!S.cfg.training) tickClock(dt, true);
  } else if (S.phase === 'goal') {
    if (S.phaseT > 3.2) {
      if (!S.demo && !S.cfg.training && !VN.walls && S.cfg.replays !== false && startReplay()) { /* replay running */ }
      else afterGoal();
    }
  }
  recordFrame(dt);
}
function tickClock(dt, live) {
  S.pt += dt;
  if (live) { if (S.ball.owner) S.stats.poss[S.ball.owner.team] += dt; else S.stats.poss[S.ball.lastTeam] += dt * 0.5; }
  // the fourth official's board at the end of normal time
  if (!S.addedShown && S.pt >= perReal()) {
    S.addedShown = true; S.added = addedFor(); S.boardT = 4.5;
    if (!S.demo) { if (!VN.walls) { arc.toast('+' + S.added, 'Minutes added on', 2200); sayRare('stoppage', true); } }
    pushEvt('board', null, null, S.added);
  }
  // the cage keeps its arcade countdown feel in the last half minute
  const rem = (perReal() * (perMins() + S.added) / perMins() - S.pt) * (VN.walls ? 1 : 0);
  if (VN.walls && !S.last30 && S.period === 2 && rem <= 30 && rem > 0) { S.last30 = true; if (!S.demo) { arc.toast('Final 30 seconds', 'Everything on the line', 1800); say(pick(LINES.final), 3); snd.beep(true); } }
  if (periodOver() && S.phase === 'play') {
    // the referee waits for a shot already in the air to finish
    if (S.lastKick && S.lastKick.kind === 'shot' && S.t - S.lastKick.t < 1.2) return;
    endPeriod();
  }
}
// the human keeper on a free kick or penalty against: a dive picked in the moment, either side
function keeperWindow() {
  const g = gkOf(0); if (!g || g.diving || g.humanDive) return;
  const IN = arc.input, ax = IN.axis(), tp = IN.tap(), sw = IN.swipe();
  let side = null;
  if (tp) side = tp.nx < 0.38 ? -1 : tp.nx > 0.62 ? 1 : 0;
  else if (sw) side = sw.dir === 'left' ? -1 : sw.dir === 'right' ? 1 : 0;
  else if (abs(ax.x) > 0.5) side = sgn(ax.x);
  else if (IN.hit('KeyJ', 'KeyK', 'Space')) side = 0;
  if (side === null) return;
  keeperDive(g, g.y + aimAcross(side) * (GH - 10)); g.humanDive = true; GI.dives++;
}
// crowd noise between the big moments: a low bed, chants and the odd flare from the ultras' end
function crowdTick(dt) {
  if (S.demo) return;
  S.crowdT -= dt;
  if (S.crowdT <= 0) {
    S.crowdT = 0.8 + rnd() * 0.6;
    const f = (S.last30 ? 1.6 : 1) + S.excite * 1.4 + (VN.walls ? 0 : 0.5);
    arc.sfx.noise(1.2, { freq: 480 + rnd() * 260, filter: 'bandpass', vol: 0.014 * f });
  }
  if (S.phase === 'play' || S.phase === 'restart') {
    S.chantT -= dt;
    if (S.chantT <= 0) {
      S.chantT = 7 + rnd() * 6;
      const t = S.score[0] >= S.score[1] ? (rnd() < 0.6 ? S.hostTeam : 1 - S.hostTeam) : (rnd() < 0.7 ? 1 : 0);
      snd.chant(0.4 + S.excite * 0.6);
      pushEvt('chant', null, null, t);
      if (!VN.walls && rnd() < 0.3) pushEvt('flare', null, null, t);
    }
  }
}

function update(dt) {
  if (!S || S.demo) return;
  trackGesture();
  // C cycles the broadcast camera
  if (arc.input.hit('KeyC')) { const m = ['tv', 'wide', 'close']; CAM.mode = m[(m.indexOf(CAM.mode) + 1) % 3]; arc.choices.cam = CAM.mode; arc.store.set('arcade.turf-kings.cam', CAM.mode); arc.toast('Camera: ' + (CAM.mode === 'tv' ? 'TV' : CAM.mode === 'wide' ? 'Wide' : 'Close'), null, 900); }
  if (S.phase !== 'restart' || !S.rs || S.rs.team !== 0) SP.show = false;
  stepSim(dt);
}
function idle(dt) {
  if (!S) return;
  if (arc.state === 'menu' && S.demo) {
    stepSim(dt);
    if (S.phase === 'break' || S.period > 1) startDemo();
  }
}

/* ------------------------------------------------------------------ skill training */
const DRILLS = [
  { key: 'pass', name: 'Passing', n: 4, brief: 'Pass to the team-mate in the ring. Quick and accurate scores more.' },
  { key: 'beat', name: 'Beat your man', n: 3, brief: 'Get past the defender into the box. A skill move helps: E or Q, or tap yourself.' },
  { key: 'shoot', name: 'Shooting', n: 5, brief: 'Beat the keeper from the edge of the box. Hold to power, Shift for a driven shot, H to chip.' },
  { key: 'free', name: 'Free kicks', n: 3, brief: 'Aim over or round the wall, hold to power, release.' },
  { key: 'pen', name: 'Penalties', n: 3, brief: 'Pick your spot. Too much power and it flies.' },
];
function startTraining(club) {
  const sl = (r) => [0, 0, r];
  newMatch({
    home: club, away: (club + 3) % TEAMS.length, venue: 'stadium', len: 6, skill: 0.6, mode: 'training', training: true,
    roster: [4, 5], slots: [[sl('ST'), sl('CM'), sl('W'), sl('W')], [sl('GK'), sl('CB'), sl('CB'), sl('DM'), sl('CM')]], sqs: [[9, 7, 8, 10], [0, 2, 3, 6, 5]],
  });
  S.dir = [1, -1];
  S.train = { d: 0, n: 0, score: 0, state: 'setup', t: 0, target: null, msg: '', log: DRILLS.map(() => 0) };
  syncMatch3D();
  trainSetup();
  CAM.snap = true;
}
function park(p) { p.out = true; p.leaving = 0; p.x = (p.team ? 1 : -1) * 200 + p.k * 40; p.y = HW + 420; p.vx = p.vy = p.dvx = p.dvy = 0; }
function unpark(p, x, y, fx, fy) { p.out = false; p.leaving = 0; p.x = x; p.y = y; p.fx = fx; p.fy = fy; p.vx = p.vy = p.dvx = p.dvy = 0; p.stunT = 0; p.slideT = 0; p.diving = false; p.noBallT = 0; p.frozen = false; p.humanDive = false; }
function trainSetup() {
  const T = S.train, dr = DRILLS[T.d], me = S.tp[0][0], gk = S.tp[1][0];
  const b = S.ball;
  b.owner = null; b.vx = b.vy = b.vz = 0; b.z = 0; b.inGoal = 0; b.cv = 0;
  S.players.forEach(park);
  S.rs = null; S.offChk = null; S.passTarget = null;
  T.state = 'live'; T.t = 0; T.msg = ''; T.target = null;
  unpark(gk, HL - 10, 0, -1, 0);
  const R = (a, c) => a + (c - a) * rnd();
  if (dr.key === 'pass') {
    gk.out = true;
    const cx = HL * 0.15;
    unpark(me, cx, 0, 1, 0);
    const spots = [[cx + 380, -340], [cx + 520, 80], [cx + 300, 380]];
    for (let k = 1; k < 4; k++) { const h = S.tp[0][k]; unpark(h, spots[k - 1][0] + R(-60, 60), spots[k - 1][1] + R(-60, 60), -1, 0); h.frozen = true; }
    T.target = S.tp[0][1 + ((rnd() * 3) | 0)];
    takeBall(me); S.phase = 'play';
  } else if (dr.key === 'beat') {
    const y = R(-200, 200), x = HL - VN.boxD - 460;
    unpark(me, x, y, 1, 0);
    const d = S.tp[1][1]; unpark(d, x + 240, y * 0.8, -1, 0);
    takeBall(me); S.phase = 'play';
  } else if (dr.key === 'shoot') {
    const ang = R(-0.6, 0.6), dist = R(520, 760);
    unpark(me, HL - Math.cos(ang) * dist, Math.sin(ang) * dist, 1, 0);
    takeBall(me); S.phase = 'play';
  } else {
    const ang = R(-0.45, 0.45), dist = dr.key === 'pen' ? VN.spot : R(640, 840);
    unpark(me, HL - Math.cos(ang) * dist - 30, Math.sin(ang) * dist, 1, 0);
    if (dr.key === 'free') for (let k = 1; k < 5; k++) unpark(S.tp[1][k], HL - 400, (k - 2.5) * 30, -1, 0);
    startRestart(dr.key === 'pen' ? 'pen' : 'free', 0, dr.key === 'pen' ? HL - VN.spot : HL - Math.cos(ang) * dist, dr.key === 'pen' ? 0 : Math.sin(ang) * dist, { snap: true, direct: true });
    S.rs.taker = me; restartSpot(me, S.rs); me.x = me.kx; me.y = me.ky;
    S.rs.think = 99;
  }
  S.ctrl = me.i; S.switchLock = 99;
  for (const r of RIGS) r.snap = true;
  CAM.snap = true;
}
function trainResult(pts, msg) {
  const T = S.train; if (T.state !== 'live') return;
  T.state = 'result'; T.t = 0; T.score += pts; T.log[T.d] += pts; T.msg = msg + (pts ? '  +' + pts : '');
  arc.haptic(pts > 0 ? 'success' : 'fail', pts > 0 ? 0.6 : 0.4);
  if (pts >= 150) { snd.roar(false); confetti(S.ball.x, S.ball.y, 0); } else if (!pts) snd.ooh();
}
function trainStep(dt) {
  const T = S.train; if (!T) return;
  T.t += dt;
  const dr = DRILLS[T.d], b = S.ball, me = S.tp[0][0];
  for (const p of S.players) if (p.frozen && S.passTarget !== p) { p.dvx = p.dvy = 0; p.vx *= 0.8; p.vy *= 0.8; }
  if (T.state === 'live') {
    const kicked = b.owner !== me && S.phase === 'play';
    T.kt = kicked ? (T.kt || 0) + dt : 0;
    if (dr.key === 'pass') {
      if (b.owner && b.owner !== me) { if (b.owner === T.target) trainResult(T.t < 2.6 ? 150 : 100, 'On the money'); else trainResult(20, 'Wrong man'); }
      else if (T.kt > 4 || T.t > 12) trainResult(0, 'Too slow');
    } else if (dr.key === 'beat') {
      if (b.owner === me && inBox(me.x, me.y, 1)) trainResult(150, 'Beaten him');
      else if (b.owner && b.owner.team === 1) trainResult(0, 'Dispossessed');
      else if (T.t > 9 || T.kt > 4) trainResult(0, 'Out of time');
    } else {
      const gk = S.tp[1][0];
      if (b.owner === gk) trainResult(dr.key === 'shoot' ? 40 : 30, 'Saved');
      else if (T.kt > 4.5) trainResult(0, 'Missed');
      else if (T.t > 22) trainResult(0, 'Out of time');
    }
  } else if (T.state === 'result' && T.t > 1.5) {
    T.n++;
    if (T.n >= dr.n) { T.n = 0; T.d++; if (T.d < DRILLS.length) arc.toast(DRILLS[T.d].name, DRILLS[T.d].brief, 2600); }
    if (T.d >= DRILLS.length) { finishTraining(); return; }
    trainSetup();
    arc.fade(160);
  }
}
function trainGoal() {
  const T = S.train; if (!T || T.state !== 'live') return;
  const k = DRILLS[T.d].key, top = S.ball.z > GOAL_H * 0.55 && abs(S.ball.y) > GH * 0.55;
  snd.net(); snd.roar(false);
  pushEvt('goal', S.tp[0][0], null, 0);
  if (k === 'beat') trainResult(250, 'Beaten him, and scored');
  else trainResult((k === 'shoot' ? 200 : k === 'free' ? 260 : 150) + (top ? 60 : 0), top ? 'Top corner' : 'Goal');
}
function trainOut() { const T = S.train; if (T && T.state === 'live') trainResult(0, DRILLS[T.d].key === 'pass' ? 'Out of play' : 'Wide'); }
function finishTraining() {
  const T = S.train;
  T.state = 'done';
  const rows = DRILLS.map((d, i) => d.name + ' <b style="color:var(--ink)">' + T.log[i] + '</b>').join('<br>');
  const grade = T.score > 2600 ? 'Academy graduate' : T.score > 1800 ? 'First team ready' : T.score > 1000 ? 'Squad player' : 'Keep practising';
  arc.over({ score: T.score, scoreLabel: 'Training points', eyebrow: 'Skill training', title: grade, html: '<p>' + rows + '</p>', again: 'Train again' });
}

/* ------------------------------------------------------------------ results: ratings, man of the match */
function computeRatings() {
  const won = S.score[0] > S.score[1] ? 0 : S.score[1] > S.score[0] ? 1 : -1;
  for (const p of S.players) {
    const s = p.st, conc = S.score[1 - p.team];
    let r = 6.0 + s.g * 1.1 + s.a * 0.7 + s.sot * 0.15 + s.tk * 0.16 + s.int * 0.08 + s.pc * 0.03 + s.sv * 0.45 - s.yc * 0.4 - s.rc * 1.6 - s.fo * 0.05;
    if (won === p.team) r += 0.35; else if (won === 1 - p.team) r -= 0.25;
    if (p.role === 'GK' || p.cat === 'DEF') r += conc === 0 ? 0.6 : -0.22 * conc;
    s.rating = Math.round(clamp(r, 3, 10) * 10) / 10;
  }
}
function motm() { let best = null; for (const p of S.players) if (!best || p.st.rating > best.st.rating) best = p; return best; }
function statsHtml() {
  const st = S.stats, tot = st.poss[0] + st.poss[1], pa = Math.round(st.poss[0] / tot * 100);
  const pacc = (t) => (st.passes[t] ? Math.round(st.passOk[t] / st.passes[t] * 100) + '%' : '-');
  const row = (l, a, b) => '<tr><td style="text-align:right;color:var(--ink)">' + a + '</td><td style="text-align:center;padding:0 10px">' + l + '</td><td style="color:var(--ink)">' + b + '</td></tr>';
  let h = '<table style="width:100%;font-size:13px;border-collapse:collapse;margin:4px 0 12px">';
  h += row('Possession', pa + '%', (100 - pa) + '%') + row('Shots', st.shots[0], st.shots[1]) + row('On target', st.sot[0], st.sot[1]);
  if (!VN.walls) h += row('Passes', st.passes[0], st.passes[1]) + row('Pass accuracy', pacc(0), pacc(1)) + row('Corners', st.corners[0], st.corners[1]) + row('Offsides', st.offsides[0], st.offsides[1]);
  h += row('Tackles', st.tackles[0], st.tackles[1]) + row('Fouls', st.fouls[0], st.fouls[1]);
  if (!VN.walls) h += row('Yellow cards', st.yc[0], st.yc[1]) + row('Red cards', st.rc[0], st.rc[1]);
  h += row('Saves', st.saves[0], st.saves[1]) + '</table>';
  return h;
}
function finishMatch() {
  if (S.demo) { startDemo(); return; }
  S.say = null;
  computeRatings();
  showResult();
}
function showResult() {
  const h = S.score[0], a = S.score[1], pw = S.penWinner;
  const tie = h === a;
  const won = h > a || (tie && pw === 0), drew = tie && pw === undefined;
  const pts = Math.max(0, h * 100 - a * 50 + (won ? (tie ? 200 : 300) : drew ? 100 : 0));
  const th = S.teams[0], ta = S.teams[1];
  const sc = S.scorers.length ? S.scorers.map((s) => '<b style="color:var(--ink)">' + esc(s.name) + '</b> ' + esc(S.teams[s.team].abbr) + ' ' + s.clock + (s.og ? ' (og)' : '')).join(' &middot; ') : 'No goals. A proper tactical scrap.';
  const cards = S.cards.length ? '<p>' + S.cards.map((c) => (c.red ? 'Red' : 'Yellow') + ': ' + esc(c.name) + ' ' + c.clock).join(' &middot; ') + '</p>' : '';
  let pensLine = '';
  if (S.pen) { const k0 = S.pen.kicks[0].reduce((x, y) => x + y, 0), k1 = S.pen.kicks[1].reduce((x, y) => x + y, 0); pensLine = '<p>Penalties: ' + esc(th.abbr) + ' ' + k0 + ' - ' + k1 + ' ' + esc(ta.abbr) + '</p>'; }
  const m = motm();
  const mo = m ? '<p>Man of the match: <b style="color:var(--ink)">' + esc(m.name) + '</b> (' + esc(S.teams[m.team].short) + ', ' + m.st.rating.toFixed(1) + ')' + (m.st.g ? ', ' + m.st.g + ' goal' + (m.st.g > 1 ? 's' : '') : '') + (m.st.sv ? ', ' + m.st.sv + ' saves' : '') + '</p>' : '';
  const shoot = S.cfg.mode === 'shootout';
  const html =
    '<p style="color:var(--ink);font-size:18px"><b>' + esc(th.name) + ' ' + h + ' - ' + a + ' ' + esc(ta.name) + '</b></p>' + pensLine +
    (shoot ? '' : '<p>' + sc + '</p>' + cards + mo + statsHtml());
  const verdict = won ? (tie ? 'Won on penalties' : 'Victory') : drew ? 'Honours even' : (tie ? 'Lost on penalties' : 'Beaten');
  arc.haptic(won ? 'success' : drew ? 'hit' : 'fail', 1);
  if (won) bumpTrophy(shoot ? 'shootout' : null);
  const detail = '<p>Points: goals ' + h * 100 + ' minus conceded ' + a * 50 + (won ? ' plus win bonus ' + (tie ? 200 : 300) : drew ? ' plus draw bonus 100' : '') + ' = <b style="color:var(--ink)">' + pts + '</b></p>';
  if (S.cfg.mode === 'league') { leagueResult(html, won, drew); return; }
  if (S.cfg.mode !== 'cup') {
    arc.over({ score: pts, scoreLabel: 'Points', eyebrow: shoot ? 'Penalty shootout' : 'Full time', title: verdict, html: html + detail, again: 'Play again' });
    return;
  }
  CUP.total += pts; CUP.results.push({ line: th.short + ' ' + h + '-' + a + ' ' + ta.short + (tie && pw !== undefined ? ' (pens)' : S.period > 2 ? ' (aet)' : ''), won });
  saveCup();
  const resHtml = '<p>' + CUP.results.map((r, i) => STAGES[i] + ': ' + esc(r.line)).join('<br>') + '</p>';
  if (!won) {
    CUP.done = true; saveCup();
    arc.over({ score: CUP.total, scoreLabel: 'Cup points', eyebrow: 'Knocked out in the ' + STAGES[CUP.idx].toLowerCase(), title: 'Cup run over', html: html + detail + resHtml, again: 'New cup run' });
  } else if (CUP.idx >= 2) {
    CUP.total += 500; CUP.done = true; saveCup();
    bumpTrophy('cup');
    arc.over({ score: CUP.total, scoreLabel: 'Cup points', eyebrow: CUPNAME, title: 'Cup <em>winners</em>', html: html + detail + resHtml + '<p>Trophy bonus +500. The golden match ball is yours to use in any game.</p>', again: 'New cup run' });
  } else {
    CUP.pending = true; saveCup();
    arc.over({ eyebrow: STAGES[CUP.idx] + ' won', title: 'Through to the ' + STAGES[CUP.idx + 1].toLowerCase(), html: html + detail + resHtml + '<p>Next: <b style="color:var(--ink)">' + esc(TEAMS[CUP.opps[CUP.idx + 1]].name) + '</b>, and they are tougher.</p>', again: 'Next round' });
  }
}

/* ------------------------------------------------------------------ the Monsoon League: a saved season */
const SEASON_KEY = 'arcade.turf-kings.season', CUP_KEY = 'arcade.turf-kings.cup', TROPHY_KEY = 'arcade.turf-kings.trophies';
const STAGES = ['Quarter-final', 'Semi-final', 'Final'];
function trophies() { const t = arc.store.get(TROPHY_KEY, null); return t && typeof t === 'object' ? Object.assign({ league: 0, cup: 0, shootout: 0 }, t) : { league: 0, cup: 0, shootout: 0 }; }
function bumpTrophy(k) { if (!k) return; const t = trophies(); t[k] = (t[k] || 0) + 1; arc.store.set(TROPHY_KEY, t); }
function newSeason(club, diff, len) {
  const n = TEAMS.length, arr = TEAMS.map((_, i) => i), rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const ms = [];
    for (let i = 0; i < n / 2; i++) { let h = arr[i], a = arr[n - 1 - i]; if ((r + i) % 2) { const t = h; h = a; a = t; } ms.push([h, a]); }
    rounds.push(ms);
    arr.splice(1, 0, arr.pop());
  }
  const table = {}; for (let i = 0; i < n; i++) table[i] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  return { v: 1, club, round: 0, rounds, table, results: [], diff, len, done: false, last: null };
}
function loadSeason() {
  const s = arc.store.get(SEASON_KEY, null);
  if (!s || s.v !== 1 || !Array.isArray(s.rounds) || !s.table) return null;
  return s;
}
function saveSeason() { if (SEASON) arc.store.set(SEASON_KEY, SEASON); }
function saveCup() { if (CUP) arc.store.set(CUP_KEY, CUP); }
function myFixture(s) { const r = s.rounds[s.round]; return r ? r.find((m) => m[0] === s.club || m[1] === s.club) : null; }
function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 9); return k - 1; }
function simScore(h, a) { const rh = TEAMS[h].rating, ra = TEAMS[a].rating; return [poisson(clamp(1.35 + (rh - ra) * 4 + 0.2, 0.3, 3.2)), poisson(clamp(1.15 + (ra - rh) * 4, 0.25, 3))]; }
function tableAdd(t, gf, ga) { t.p++; t.gf += gf; t.ga += ga; if (gf > ga) t.w++; else if (gf === ga) t.d++; else t.l++; }
const ptsOf = (t) => t.w * 3 + t.d;
function standings(s) {
  return Object.keys(s.table).map(Number).sort((x, y) => { const a = s.table[x], b = s.table[y]; return ptsOf(b) - ptsOf(a) || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || x - y; });
}
function tableHtml(s) {
  const rows = standings(s).map((c, i) => {
    const t = s.table[c], me = c === s.club;
    return '<tr style="' + (me ? 'color:var(--ink);font-weight:700' : '') + '"><td>' + (i + 1) + '</td><td><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + TEAMS[c].c1 + ';margin-right:6px"></span>' + esc(TEAMS[c].short) + '</td><td>' + t.p + '</td><td>' + t.w + '</td><td>' + t.d + '</td><td>' + t.l + '</td><td>' + (t.gf - t.ga > 0 ? '+' : '') + (t.gf - t.ga) + '</td><td><b>' + ptsOf(t) + '</b></td></tr>';
  }).join('');
  return '<table style="width:100%;font-size:13px;border-collapse:collapse;margin:4px 0 12px"><tr style="color:var(--ink-mute);font-size:11px"><td>#</td><td>Club</td><td>P</td><td>W</td><td>D</td><td>L</td><td>GD</td><td>Pts</td></tr>' + rows + '</table>';
}
function leagueResult(html, won, drew) {
  const s = SEASON, fx = myFixture(s);
  const myHome = fx[0] === s.club, gh = myHome ? S.score[0] : S.score[1], ga = myHome ? S.score[1] : S.score[0];
  tableAdd(s.table[fx[0]], gh, ga); tableAdd(s.table[fx[1]], ga, gh);
  const others = [];
  for (const m of s.rounds[s.round]) {
    if (m === fx || m[0] === s.club || m[1] === s.club) continue;
    const r = simScore(m[0], m[1]); tableAdd(s.table[m[0]], r[0], r[1]); tableAdd(s.table[m[1]], r[1], r[0]);
    others.push(TEAMS[m[0]].abbr + ' ' + r[0] + '-' + r[1] + ' ' + TEAMS[m[1]].abbr);
  }
  s.results.push({ round: s.round, line: TEAMS[fx[0]].short + ' ' + gh + '-' + ga + ' ' + TEAMS[fx[1]].short, won, drew });
  s.round++;
  const pos = standings(s).indexOf(s.club) + 1, myPts = ptsOf(s.table[s.club]);
  const rest = '<p style="font-size:13px">Elsewhere: ' + others.join(' &middot; ') + '</p>';
  if (s.round >= s.rounds.length) {
    s.done = true; saveSeason();
    const champ = standings(s)[0] === s.club;
    if (champ) bumpTrophy('league');
    arc.over({ score: myPts * 100 + (champ ? 1000 : 0), scoreLabel: 'Season points', eyebrow: LEAGUE + ', final table', title: champ ? 'League <em>champions</em>' : 'Finished ' + ordinal(pos), html: html + rest + tableHtml(s) + (champ ? '<p>Title won. Dusk kick-offs are unlocked.</p>' : ''), again: 'New season' });
    return;
  }
  saveSeason();
  const nx = myFixture(s), opp = nx[0] === s.club ? nx[1] : nx[0];
  arc.over({ eyebrow: LEAGUE + ', matchday ' + s.round + ' of ' + s.rounds.length, title: won ? 'Three points' : drew ? 'A point gained' : 'No points', html: html + rest + tableHtml(s) + '<p>' + ordinal(pos) + ' on ' + myPts + ' points. Next: ' + esc(TEAMS[opp].name) + (nx[0] === s.club ? ' at home' : ' away') + '.</p>', again: 'Next matchday' });
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/* ------------------------------------------------------------------ starting matches */
function diffSkill(d) { return d === 'easy' ? 0.3 : d === 'hard' ? 0.8 : d === 'legend' ? 0.93 : 0.56; }
const MENT = { def: -1, bal: 0, att: 1 };
function applyTactics() {
  if (!S || S.demo || S.venue !== 'stadium' || S.cfg.training) return;
  const f = arc.choices.form && arc.choices.form !== 'club' ? arc.choices.form : TEAMS[S.club[0]].form;
  changeFormation(0, f);
  S.tac[0].ment = MENT[arc.choices.ment] != null ? MENT[arc.choices.ment] : 0;
}
function matchCfg(ch, extra) {
  return Object.assign({ len: ch.len || 6, skill: diffSkill(ch.diff), ment0: MENT[ch.ment] || 0, form0: ch.form && ch.form !== 'club' ? ch.form : undefined }, extra);
}
function kickoffMatch(walk) {
  S.kickTeam = rnd() < 0.5 ? 0 : 1;
  startRestart('kickoff', S.kickTeam, 0, 0, { snap: true });
  recReset();
  if (walk && S.venue === 'stadium' && !arc.reducedMotion) startWalkout();
  else if (walk && S.venue === 'stadium') startWalkout();
  syncMatch3D();
}
function startCupMatch() {
  const ch = arc.choices;
  newMatch(matchCfg(ch, { home: CUP.team, away: CUP.opps[CUP.idx], venue: 'stadium', skill: clamp(diffSkill(ch.diff) + CUP.idx * 0.05, 0.2, 0.96), mode: 'cup', knockout: true, matchNo: CUP.idx + 1, label: STAGES[CUP.idx], hostTeam: CUP.idx === 2 ? 0 : (CUP.idx % 2) }));
  kickoffMatch(true);
  arc.toast(CUPNAME + ', ' + S.cfg.label, 'vs ' + S.teams[1].name, 2600);
}
function start(a, ch) {
  CAM.mode = ch.cam || 'tv';
  GI.taps = GI.swipes = GI.passes = GI.shots = 0;
  const my = clamp(ch.team | 0, 0, TEAMS.length - 1);
  if (ch.mode === 'cup') {
    if (CUP && CUP.pending && CUP.team === my) { CUP.pending = false; CUP.idx++; saveCup(); startCupMatch(); return; }
    const others = TEAMS.map((_, i) => i).filter((i) => i !== my);
    for (let i = others.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = others[i]; others[i] = others[j]; others[j] = t; }
    // the draw puts the strongest clubs later in the run
    const opps = others.slice(0, 3).sort((x, y) => TEAMS[x].rating - TEAMS[y].rating);
    CUP = { team: my, idx: 0, opps, results: [], total: 0, pending: false, done: false };
    saveCup();
    startCupMatch();
    return;
  }
  CUP = null;
  if (ch.mode === 'league') {
    SEASON = loadSeason();
    if (!SEASON || SEASON.done || SEASON.club !== my) SEASON = newSeason(my, ch.diff, ch.len);
    saveSeason();
    const fx = myFixture(SEASON), home = fx[0] === my, opp = home ? fx[1] : fx[0];
    newMatch(matchCfg(ch, { home: my, away: opp, venue: 'stadium', mode: 'league', hostTeam: home ? 0 : 1, matchNo: SEASON.round + 1, label: 'Matchday ' + (SEASON.round + 1) }));
    kickoffMatch(true);
    arc.toast(LEAGUE + ', matchday ' + (SEASON.round + 1), (home ? 'vs ' : 'at ') + S.teams[1].name, 2600);
    return;
  }
  let opp = (rnd() * TEAMS.length) | 0; if (opp === my) opp = (opp + 1 + ((rnd() * (TEAMS.length - 1)) | 0)) % TEAMS.length;
  if (ch.mode === 'training') { startTraining(my); arc.toast('Skill training', DRILLS[0].brief, 3200); return; }
  if (ch.mode === 'pens') {
    newMatch(matchCfg(ch, { home: my, away: opp, venue: 'stadium', mode: 'shootout', shootout: true }));
    recReset(); syncMatch3D();
    S.pt = 0; startPenalties();
    arc.toast('Penalty shootout', S.teams[0].short + ' v ' + S.teams[1].short, 2200);
    return;
  }
  const venue = ch.venue === 'cage' ? 'cage' : 'stadium';
  newMatch(matchCfg(ch, { home: my, away: opp, venue, mode: 'friendly', matchNo: 1 }));
  kickoffMatch(venue === 'stadium');
  arc.toast(S.teams[0].short + ' v ' + S.teams[1].short, venue === 'cage' ? 'Five-a-side in the cage' : 'Friendly at ' + TEAMS[my].ground, 2200);
}
function startDemo() {
  let a = (rnd() * TEAMS.length) | 0, b = (rnd() * TEAMS.length) | 0; if (b === a) b = (a + 3) % TEAMS.length;
  newMatch({ home: a, away: b, venue: 'stadium', len: 2, skill: 0.62, demo: true });
  S.dir = [1, -1]; S.ctrl = -1;
}

/* ------------------------------------------------------------------ menus: the main menu, tactics, the rules */
function clubChoices() { return TEAMS.map((t, i) => ({ v: i, label: t.short })); }
function showMenu() {
  const touch = !!arc.touchMode;
  SEASON = loadSeason();
  const cupS = arc.store.get(CUP_KEY, null);
  if (cupS && cupS.pending && !cupS.done && !CUP) CUP = cupS;
  const tr = trophies();
  let status = '';
  if (SEASON && !SEASON.done) {
    const fx = myFixture(SEASON), opp = fx ? (fx[0] === SEASON.club ? fx[1] : fx[0]) : 0;
    status += '<p><b style="color:var(--ink)">' + LEAGUE + '</b>: ' + esc(TEAMS[SEASON.club].short) + ', ' + ordinal(standings(SEASON).indexOf(SEASON.club) + 1) + ', matchday ' + (SEASON.round + 1) + ' of ' + SEASON.rounds.length + ' next, ' + esc(TEAMS[opp].short) + '. <button type="button" class="arc-btn" data-tk="table" style="min-height:34px;padding:0 12px">Table</button> <button type="button" class="arc-btn" data-tk="newseason" style="min-height:34px;padding:0 12px">New season</button></p>';
  }
  if (CUP && CUP.pending && !CUP.done) status += '<p><b style="color:var(--ink)">' + CUPNAME + '</b>: ' + esc(TEAMS[CUP.team].short) + ' are through to the ' + STAGES[CUP.idx + 1].toLowerCase() + ' (choose Cup to play it).</p>';
  const cab = tr.league || tr.cup || tr.shootout ? '<p style="font-size:13px">Trophy cabinet: ' + [tr.league ? tr.league + ' league title' + (tr.league > 1 ? 's' : '') : '', tr.cup ? tr.cup + ' ' + CUPNAME + (tr.cup > 1 ? 's' : '') : '', tr.shootout ? tr.shootout + ' shootout win' + (tr.shootout > 1 ? 's' : '') : ''].filter(Boolean).join(', ') + '.</p>' : '';
  const opts = [
    { id: 'mode', label: 'Mode', choices: [{ v: 'friendly', label: 'Friendly' }, { v: 'league', label: 'League' }, { v: 'cup', label: 'Cup' }, { v: 'pens', label: 'Penalties' }, { v: 'training', label: 'Training' }] },
    { id: 'venue', label: 'Friendly venue', value: 'stadium', choices: [{ v: 'stadium', label: 'Stadium 11v11' }, { v: 'cage', label: 'Rooftop cage 5v5' }], note: 'League, cup, penalties and training are eleven-a-side in the stadium.' },
    { id: 'team', label: 'Your club', value: 0, choices: clubChoices() },
    { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }, { v: 'legend', label: 'Legend' }] },
    { id: 'len', label: 'Match length', value: 6, choices: [{ v: 4, label: '4 min' }, { v: 6, label: '6 min' }, { v: 10, label: '10 min' }] },
    { id: 'cam', label: 'Camera', value: 'tv', choices: [{ v: 'tv', label: 'TV' }, { v: 'wide', label: 'Wide' }, { v: 'close', label: 'Close' }] },
  ];
  if (tr.cup) opts.push({ id: 'ball', label: 'Match ball', value: 'classic', choices: [{ v: 'classic', label: 'Classic' }, { v: 'gold', label: 'Golden' }] });
  if (tr.league) opts.push({ id: 'sky', label: 'Kick-off', value: 'night', choices: [{ v: 'night', label: 'Floodlit night' }, { v: 'dusk', label: 'Dusk' }] });
  arc.menu({
    eyebrow: 'Football, ' + LEAGUE,
    title: 'Turf <em>Kings</em>',
    showKeys: true,
    html: '<p>Eleven-a-side in a packed stadium with the full rules: throw-ins, corners, offside, fouls and cards, stoppage time, extra time and penalties in the cup. The original five-a-side rooftop cage is still here for a friendly.</p>' +
      (touch ? '<p>Drag to run, tap a team-mate to pass, tap space ahead for a through ball, swipe at goal to shoot (curve up to chip), swipe elsewhere to cross. Tap yourself for a skill move.</p>' : '<p>J pass, I through ball, U cross or lob, K shoot (hold for power, Shift for driven, H to chip), E skill move, Q switch, C camera.</p>') +
      status + cab +
      '<p><button type="button" class="arc-btn" data-tk="tactics" style="min-height:38px">Tactics</button> <button type="button" class="arc-btn" data-tk="rules" style="min-height:38px">Rules</button></p>',
    options: opts,
  });
}
function formationSvg(fk) {
  const f = FORMS[fk] || FORMS['433'];
  let s = '<svg viewBox="0 0 120 80" width="100%" style="max-width:320px;display:block;margin:2px 0 10px" aria-label="' + esc(f.label) + ' formation"><rect x="1" y="1" width="118" height="78" rx="4" fill="#2a7a45" stroke="rgba(255,255,255,.55)"/><line x1="60" y1="1" x2="60" y2="79" stroke="rgba(255,255,255,.45)"/><circle cx="60" cy="40" r="9" fill="none" stroke="rgba(255,255,255,.45)"/><rect x="1" y="22" width="16" height="36" fill="none" stroke="rgba(255,255,255,.45)"/><rect x="103" y="22" width="16" height="36" fill="none" stroke="rgba(255,255,255,.45)"/>';
  for (const sl of f.slots) { const x = 60 + sl[0] * 57, y = 40 + sl[1] * 36; s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="' + (sl[2] === 'GK' ? '#ffd23d' : '#fbf5ec') + '"/><text x="' + x.toFixed(1) + '" y="' + (y + 9).toFixed(1) + '" font-size="4.4" text-anchor="middle" fill="rgba(255,255,255,.85)">' + sl[2] + '</text>'; }
  return s + '</svg>';
}
function showTactics(fromPause) {
  const club = arc.choices.team | 0, fk = arc.choices.form && arc.choices.form !== 'club' ? arc.choices.form : TEAMS[club].form;
  arc.panel({
    eyebrow: 'Tactics', title: 'Shape and <em>mentality</em>',
    html: '<div data-tk-svg>' + formationSvg(fk) + '</div><p>Defensive sits deep and presses less. Attacking pushes the line up, full-backs overlap and the team presses high. Losing late, every side throws men forward.</p>',
    options: [
      { id: 'form', label: 'Formation', value: 'club', choices: [{ v: 'club', label: 'Club (' + FORMS[TEAMS[club].form].label + ')' }].concat(FORM_KEYS.map((k) => ({ v: k, label: FORMS[k].label }))) },
      { id: 'ment', label: 'Mentality', value: 'bal', choices: [{ v: 'def', label: 'Defensive' }, { v: 'bal', label: 'Balanced' }, { v: 'att', label: 'Attacking' }] },
    ],
    actions: [{ label: fromPause ? 'Back to the match' : 'Done', primary: true, on: () => { if (fromPause) { applyTactics(); arc.resume(); } else showMenu(); } }],
  });
}
function showRules(fromPause) {
  arc.panel({
    eyebrow: 'The laws', title: 'How a match <em>works</em>',
    html: '<p><b style="color:var(--ink)">Restarts.</b> Over a touchline: a throw-in to the side that did not touch it last. Over the goal line: a corner if a defender touched it last, otherwise a goal kick. After a goal the side that conceded kicks off.</p>' +
      '<p><b style="color:var(--ink)">Offside.</b> When a team-mate plays the ball, you are offside if you are in the other half, ahead of the ball and ahead of the second-last defender. It is only called when you get involved. No offside from a throw-in, a corner or a goal kick.</p>' +
      '<p><b style="color:var(--ink)">Fouls.</b> Tackling through the back of a player, or sliding in and missing the ball, gives a direct free kick; inside your own box, a penalty. Reckless challenges earn a yellow card, two yellows or denying a clear chance a red, and that side plays a man short. If the fouled side keeps the ball going forward the referee plays advantage.</p>' +
      '<p><b style="color:var(--ink)">Time.</b> Two halves of 45 game minutes, with time added for goals, cards and stoppages. In the cup a draw goes to 30 minutes of extra time, then five penalties each and sudden death.</p>' +
      '<p><b style="color:var(--ink)">The league.</b> Seven matchdays against every other club once. Three points for a win, one for a draw; the table splits ties on goal difference, then goals scored. Your season is saved on this device.</p>' +
      '<p><b style="color:var(--ink)">Set pieces.</b> Point with the stick or drag, then J to pass, U to cross or loft, K to shoot (hold for power). On a free kick or penalty you aim a ring on the goal. Against you, you control the keeper: move along the line, then pick a side to dive.</p>',
    actions: [{ label: fromPause ? 'Back to the match' : 'Done', primary: true, on: () => { if (fromPause) arc.resume(); else showMenu(); } }],
  });
}
function showTable() {
  if (!SEASON) return;
  arc.panel({ eyebrow: LEAGUE, title: 'The <em>table</em>', html: tableHtml(SEASON) + (SEASON.results.length ? '<p style="font-size:13px">' + SEASON.results.map((r) => 'MD' + (r.round + 1) + ': ' + esc(r.line)).join('<br>') + '</p>' : ''), actions: [{ label: 'Done', primary: true, on: () => showMenu() }] });
}
document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest ? e.target.closest('[data-tk]') : null;
  if (b && arc) {
    const k = b.getAttribute('data-tk'), paused = arc.state === 'pause';
    if (k === 'tactics') showTactics(paused);
    else if (k === 'rules') showRules(paused);
    else if (k === 'table') showTable();
    else if (k === 'newseason') { arc.store.set(SEASON_KEY, null); SEASON = null; showMenu(); }
    return;
  }
  // the formation picture follows the choice
  const seg = e.target && e.target.closest ? e.target.closest('.arc-seg[data-opt="form"] button') : null;
  if (seg && arc) {
    const club = arc.choices.team | 0, v = seg.getAttribute('data-v'), fk = v === 'club' ? TEAMS[club].form : v;
    const host = document.querySelector('[data-tk-svg]'); if (host) host.innerHTML = formationSvg(fk);
  }
});
/* ================================================================== three.js: helpers */
const COL = {};
const C = (hex) => COL[hex] || (COL[hex] = new THREE.Color(hex));
const TEXQ = { pitchW: 2048, aniso: 4, shadow: 2048, crowdQ: 2 };
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
    const names = ['TURF KINGS', 'ROOFTOP LEAGUE', 'FIVE A SIDE', 'BANYAN CUP', 'CITY CAGE', 'TURF KINGS', 'ROOFTOP LEAGUE', 'BANYAN CUP'];
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

function buildCage(Q) {
  /* turf and roof */
  const pitchTex = texPitch(); const grain = texGrain(); grain.repeat.set(1100 / 90, 680 / 90);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(1100, 680), new THREE.MeshStandardMaterial({ map: pitchTex, bumpMap: grain, bumpScale: 1.6, roughness: 0.93, metalness: 0, alphaTest: 0.5 }));
  pitch.rotation.x = -PI / 2; pitch.position.y = 0; pitch.receiveShadow = true; ROOTG.add(pitch);
  const roofTex = texRoof();
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(1180, 740), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95 }));
  roof.rotation.x = -PI / 2; roof.position.y = -0.4; roof.receiveShadow = true; ROOTG.add(roof);
  // the goal alcoves: green rubber floor, dark side and back walls
  const alc = new GB(), alcWall = new GB();
  [-1, 1].forEach((sx) => {
    alc.box(GD + 14, 1.2, GH * 2 + 16, M(sx * (HL + (GD + 14) / 2 - 4), 0.05, 0));
    alcWall.box(GD + 16, 66, 4, M(sx * (HL + (GD + 16) / 2 - 4), 33, GH + 8));
    alcWall.box(GD + 16, 66, 4, M(sx * (HL + (GD + 16) / 2 - 4), 33, -(GH + 8)));
    alcWall.box(4, 66, GH * 2 + 20, M(sx * (HL + GD + 6), 33, 0));
  });
  const alcM = new THREE.Mesh(alc.build(), new THREE.MeshStandardMaterial({ color: 0x1d6a3a, roughness: 0.95 })); alcM.receiveShadow = true; ROOTG.add(alcM);
  ROOTG.add(new THREE.Mesh(alcWall.build(), new THREE.MeshStandardMaterial({ color: 0x16304a, roughness: 0.6 })));

  /* the building under the roof, and the parapet */
  const winTex = texWindows();
  const host = new THREE.Mesh(winBox(1180, 560, 740), new THREE.MeshBasicMaterial({ map: winTex, color: 0xb8c4e8 }));
  host.position.set(0, -280.4, 0); ROOTG.add(host);
  const par = new GB();
  par.box(1180, 26, 14, M(0, 12.6, -363)); par.box(1180, 26, 14, M(0, 12.6, 363)); par.box(14, 26, 740, M(-593, 12.6, 0)); par.box(14, 26, 740, M(593, 12.6, 0));
  par.box(1196, 3, 20, M(0, 26.6, -363)); par.box(1196, 3, 20, M(0, 26.6, 363)); par.box(20, 3, 760, M(-593, 26.6, 0)); par.box(20, 3, 760, M(593, 26.6, 0));
  ROOTG.add(new THREE.Mesh(par.build(), new THREE.MeshStandardMaterial({ color: 0x575c67, roughness: 0.9 })));

  /* cage: boards, caps, mesh, posts */
  const polys = wallPolys();
  const boardTex = texBoards(); const BOARD_H = 34;
  const boardIn = new THREE.Mesh(wallStrip(polys, 0, BOARD_H, 0, 640, BOARD_H), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }));
  boardIn.castShadow = false; ROOTG.add(boardIn);
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a5d80, roughness: 0.45, metalness: 0.4, side: THREE.DoubleSide });
  const outer = wallStrip(polys, 0, BOARD_H, 12, 100, 100, true);
  ROOTG.add(new THREE.Mesh(outer, steel));
  ROOTG.add(new THREE.Mesh(wallCap(polys, BOARD_H, 0, 12), new THREE.MeshStandardMaterial({ color: 0x7ea3c6, roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide })));
  const fenceTex = texFence(); fenceTex.repeat.set(1, 1);
  const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTex, color: 0x9fb2c8, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x9fb6cc, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  // the fence is built in pieces so the side nearest the camera can step out of the way
  BV.fence = [];
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
    ROOTG.add(grp); BV.fence.push({ grp, mx, mz, nx, nz });
  }));
  // mesh over the goal mouths above the crossbar
  const mouthTop = [[[HL, -GH - 4], [HL, GH + 4]], [[-HL, GH + 4], [-HL, -GH - 4]]];
  const mouthFence = new THREE.Mesh(wallStrip(mouthTop, GOAL_H + 4, ROOF, 6, 14, 14), fenceMat); mouthFence.renderOrder = 3; ROOTG.add(mouthFence);

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
    const frame = new THREE.Mesh(gb.build(), goalMat); frame.castShadow = true; ROOTG.add(frame);
    ROOTG.add(makeNet(sx, bx, ex, netMat));
  });

  /* floodlight towers */
  buildTowers();

  /* terrace and crowd, benches, rooftop clutter */
  buildTerrace(Q);
  buildClutter();

  /* the night city around the roof */
  buildCity(winTex);

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
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2; ROOTG.add(mesh);
  BV.nets[sx > 0 ? 1 : 0] = { mesh, base: new Float32Array(P), wk: new Float32Array(WK), by: new Float32Array(BY), bz: new Float32Array(BZ), sx, live: false };
  return mesh;
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
    BV.towers.push({ x: tx, y: 338, z: tz });
  });
  ROOTG.add(new THREE.Mesh(poles.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 })));
  ROOTG.add(new THREE.Mesh(bulbs.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: 0xffffff })));
  const glowTex = texGlow();
  BV.towers.forEach((t) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1cc, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    sp.position.set(t.x * 0.97, t.y - 2, t.z * 0.97); sp.scale.set(190, 190, 1); sp.renderOrder = 4; ROOTG.add(sp); BV.glows.push(sp);
  });
  // soft cones of light from each head to the middle of the pitch
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(1, 0.95, 0.78) }, k: { value: 0.085 } },
    vertexShader: 'attribute float t; varying vec3 vN; varying vec3 vV; varying float vT; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); vT = t; gl_Position = projectionMatrix*viewMatrix*wp; }',
    fragmentShader: 'uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vV; varying float vT; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 1.6) * (1.0 - vT) * (1.0 - vT) * k; gl_FragColor = vec4(col * a, 1.0); }',
  });
  const cones = [];
  BV.towers.forEach((t) => {
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
    const m = new THREE.Mesh(g, coneMat); m.position.copy(apex); m.lookAt(aim); m.frustumCulled = false; m.renderOrder = 5; ROOTG.add(m); cones.push(m);
  });
  BV.cones = cones;
}

function buildTerrace(Q) {
  // three stepped tiers behind each long side, each step a seat (0.43 m high, 0.67 m deep), with people on them
  const gb = new GB(), conc = C('#3b414d'), lip = C('#575e6b');
  const tiers = 3, tierD = 20, tierH = 13, z0 = 300;
  [-1, 1].forEach((sz) => {
    for (let i = 0; i < tiers; i++) {
      const hgt = tierH * (i + 1), zc = sz * (z0 + tierD * i + tierD / 2);
      gb.box(900, hgt, tierD, M(0, hgt / 2, zc), conc);
      gb.box(900, 1.6, tierD, M(0, hgt + 0.8, zc), lip);
    }
    gb.box(900, 60, 4, M(0, 30, sz * (z0 + tierD * tiers + 2)), conc);
  });
  const terr = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })); terr.receiveShadow = true; ROOTG.add(terr);
  // the crowd: real people sitting on the step edge with their feet on the step below, facing the pitch;
  // one instanced draw, each with their own timing, and they stand, clap, wave and turn to each other
  const members = [];
  [-1, 1].forEach((sz) => {
    for (let i = 0; i < tiers; i++) {
      const floor = tierH * i + (i ? 1.6 : 0), z = sz * (z0 + tierD * i + 4.5);
      for (let x = -432; x <= 432; x += 16.5) {
        if (hash01(x * 3.1 + i * 17 + sz * 5) < 0.14) continue;
        members.push({ x: x + (hash01(x + i) - 0.5) * 5, y: floor, z: z - sz * 0.5, yaw: (sz > 0 ? PI : 0) + (hash01(x * 9 + i) - 0.5) * 0.3 });
      }
    }
  });
  // shuffled (seeded) so a lower tier can draw the first part of the list and still fill both stands evenly
  for (let i = members.length - 1; i > 0; i--) { const j = (hash01(i * 7.7 + 3) * (i + 1)) | 0; const t = members[i]; members[i] = members[j]; members[j] = t; }
  const crowd = createCrowd({ members, unit: UNIT, seed: 9, quality: Q.crowdQ, colors: ['#ff7a1a', '#2f6bff'] });
  // with the seat at the top of a step, the seated figure is dropped by one step height
  ROOTG.add(crowd.mesh);
  BV.crowd = crowd;

  // benches on the near side
  const bg = new GB(), wood = C('#4b505b');
  [-270, 250].forEach((x) => {
    bg.box(78, 3, 11, M(x, 8, 305.5), wood); bg.box(78, 12, 2.4, M(x, 15, 311), wood);
    [-34, 34].forEach((dx) => bg.box(3, 8, 9, M(x + dx, 4, 305.5), C('#30343c')));
  });
  bg.box(16, 14, 12, M(-440, 7, 311), C('#26566b')); bg.box(14, 10, 10, M(-418, 5, 311), C('#6c4a2d')); bg.box(12, 10, 10, M(-411, 15, 311), C('#6c4a2d'));
  ROOTG.add(new THREE.Mesh(bg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
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
  ROOTG.add(new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 })));
  const rl = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a2e, toneMapped: false }));
  const rl2 = rl.clone(); rl.position.set(-575, 66, -30); rl2.position.set(575, 66, 30); ROOTG.add(rl); ROOTG.add(rl2);
  BV.redLights = [rl, rl2];
}

function buildCity(winTex) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshBasicMaterial({ map: texCityFloor() }));
  floor.material.map.repeat.set(14, 14);
  floor.rotation.x = -PI / 2; floor.position.y = -540; ROOTG.add(floor);
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
    mesh.frustumCulled = false; ROOTG.add(mesh);
  });
  // a few neon signs
  const sign = (text, col, x, y, z, ry, w) => {
    const t = canvasTex(512, 128, (g, cw, ch) => {
      g.fillStyle = '#080a12'; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(8, 8, cw - 16, ch - 16);
      g.fillStyle = col; g.font = '800 62px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cw / 2, ch / 2 + 3);
    }, { aniso: 2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); m.position.set(x, y, z); m.rotation.y = ry; ROOTG.add(m);
  };
  sign('BANYAN CUP', '#ff9a3c', -1050, -20, -1150, 0.5, 380);
  sign('ROOFTOP LEAGUE', '#4de0ff', 1200, 60, -900, -0.7, 420);
  sign('TURF KINGS', '#ff5fa8', 100, -90, 1500, PI, 360);
}


/* ================================================================== three.js: venues */
// Each venue is built once into its own group and shown or hidden; the stadium at boot, the cage the first
// time a cage match starts. Heavy, non-essential parts go on a queue built one piece per frame after the menu.
const W3 = { venues: {}, cur: null, ready: false, level: 0, q: [], screenDirty: true, prof: [] };
let ROOTG = null, BV = null;
function venueRec(key) {
  return W3.venues[key] || (W3.venues[key] = { key, group: null, built: false, nets: [], towers: [], glows: [], cones: [], crowd: null, fence: [], redLights: null, boards: null, sheets: [], flares: [], screen: null });
}
function buildVenue(key, Q) {
  const rec = venueRec(key); if (rec.built) return rec;
  const keep = VN.key; setVenue(key);
  BV = rec; ROOTG = rec.group = new THREE.Group(); ROOTG.name = key; scene.add(ROOTG);
  if (key === 'cage') buildCage(Q); else buildStadium(Q);
  rec.built = true; setVenue(keep); BV = null; ROOTG = null;
  return rec;
}
// run one queued build step (a part of the stadium that can wait until after the menu is up)
function buildTick() {
  if (!W3.q.length) return;
  const job = W3.q.shift();
  const keep = VN.key; setVenue(job.venue);
  BV = venueRec(job.venue); ROOTG = BV.group;
  const t0 = performance.now();
  try { job.fn(); } catch (e) { console.warn(e); }
  if (W3.prof.length < 200) W3.prof.push(['job' + W3.q.length + '@' + arc.frame, Math.round(performance.now() - t0)]);
  setVenue(keep); BV = null; ROOTG = null;
  if (W3.cur) applyQuality(PERF.level);
}
function showVenue(key) {
  if (!venueRec(key).built) buildVenue(key, TEXQ);
  for (const k in W3.venues) if (W3.venues[k].group) W3.venues[k].group.visible = k === key;
  W3.cur = W3.venues[key];
  const cage = key === 'cage', key2 = W3.key, sc = key2.shadow.camera;
  if (cage) {
    scene.fog.density = 0.00041;
    key2.position.set(150, 900, 210); key2.target.position.set(0, 0, 0);
    sc.left = -575; sc.right = 575; sc.top = 335; sc.bottom = -335; sc.near = 300; sc.far = 1700;
    W3.hemi.intensity = 1.05; key2.intensity = 2.7;
  } else {
    scene.fog.density = W3.dusk ? 0.00009 : 0.000085;
    sc.left = -820; sc.right = 820; sc.top = 820; sc.bottom = -820; sc.near = 600; sc.far = 5200;
    W3.hemi.intensity = W3.dusk ? 0.9 : 0.95; key2.intensity = W3.dusk ? 2.5 : 2.9;
  }
  sc.updateProjectionMatrix();
  if (camera) { camera.far = cage ? 9000 : 26000; camera.near = cage ? 20 : 30; camera.updateProjectionMatrix(); }
  if (renderer) applyQuality(PERF.level);
}
// one scene, sky and lights for both venues
function initScene(Q) {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x151b30, 0.000085);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5200, 32, 16), new THREE.MeshBasicMaterial({ map: texSky(), side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); W3.sky = sky;
  const hemi = new THREE.HemisphereLight(0xb4c8ff, 0x2a3340, 1.0); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2d9, 2.8);
  key.position.set(150, 900, 210); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(Q.shadow, Q.shadow);
  key.shadow.bias = -0.0007; key.shadow.normalBias = 0.5; key.shadow.radius = 2.4;
  scene.add(key); scene.add(key.target); W3.key = key; W3.hemi = hemi;
  const rim = new THREE.DirectionalLight(0x9db8ff, 0.55); rim.position.set(-300, 400, -500); scene.add(rim); W3.rim = rim;
}
// dusk (unlocked by a league title): a warm low sun, a long sky
function setSky(dusk) {
  if (!!W3.dusk === !!dusk && W3.skyDone) return;
  W3.dusk = !!dusk; W3.skyDone = true;
  const old = W3.sky.material.map; W3.sky.material.map = dusk ? texSkyDusk() : texSky(); W3.sky.material.needsUpdate = true; if (old) old.dispose();
  W3.key.color.set(dusk ? '#ffd2a0' : '#fff2d9'); W3.hemi.color.set(dusk ? '#f0b98a' : '#b4c8ff'); W3.hemi.groundColor.set(dusk ? '#3a2a24' : '#2a3340');
  scene.fog.color.set(dusk ? '#4a3240' : '#151b30');
  if (W3.cur) showVenue(W3.cur.key);
}
function texSkyDusk() {
  return canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1a2448'); gr.addColorStop(0.3, '#3d3a6a'); gr.addColorStop(0.42, '#a8607a'); gr.addColorStop(0.48, '#ff9a5a');
    gr.addColorStop(0.505, '#ffd08a'); gr.addColorStop(0.53, '#7a4a5a'); gr.addColorStop(1, '#1b1620');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const R = Arcade.rng(19);
    for (let i = 0; i < 26; i++) { const x = R() * w, y = h * (0.2 + R() * 0.25), cw = 60 + R() * 160; g.fillStyle = 'rgba(255,190,150,' + (0.08 + R() * 0.12).toFixed(2) + ')'; g.beginPath(); g.ellipse(x, y, cw, 6 + R() * 8, 0, 0, TAU); g.fill(); }
    const sx = w * 0.3, sy = h * 0.49, sg = g.createRadialGradient(sx, sy, 0, sx, sy, 110); sg.addColorStop(0, 'rgba(255,236,190,.95)'); sg.addColorStop(0.2, 'rgba(255,190,120,.5)'); sg.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = sg; g.fillRect(sx - 110, sy - 110, 220, 220);
  }, { aniso: 1 });
}

/* ------------------------------------------------------------------ stadium textures */
// The full pitch: 105 x 68 m, mown stripes, wear in the goalmouths and the centre, every line to scale.
function texPitchStadium() {
  const PX = HL + 230, PY = HW + 170; // half extents of the painted area (the grass runs past the lines)
  const W = TEXQ.pitchW, H = Math.round(W * PY / PX);
  return canvasTex(W, H, (g) => {
    const s = W / (PX * 2);
    g.setTransform(s, 0, 0, s, PX * s, PY * s);
    const R = Arcade.rng(2031), rr = (a, b) => a + (b - a) * R();
    g.fillStyle = '#2a8a47'; g.fillRect(-PX, -PY, PX * 2, PY * 2);
    // mower stripes: 18 bands across the length, the apron darker and unstriped
    const n = 18, bw = HL * 2 / n;
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#25803f' : '#2f9850'; g.fillRect(-HL + i * bw, -HW, bw + 1, HW * 2); }
    g.fillStyle = 'rgba(0,30,10,.16)'; g.fillRect(-PX, -PY, PX * 2, PY - HW); g.fillRect(-PX, HW, PX * 2, PY - HW); g.fillRect(-PX, -HW, PX - HL, HW * 2); g.fillRect(HL, -HW, PX - HL, HW * 2);
    const lg = g.createLinearGradient(0, -PY, 0, PY); lg.addColorStop(0, 'rgba(0,0,0,.14)'); lg.addColorStop(0.5, 'rgba(255,255,255,.04)'); lg.addColorStop(1, 'rgba(0,0,0,.12)');
    g.fillStyle = lg; g.fillRect(-PX, -PY, PX * 2, PY * 2);
    // worn earth where the play happens most
    [[0, 0, 220], [-HL + 60, 0, 170], [HL - 60, 0, 170], [-HL + 330, 0, 150], [HL - 330, 0, 150], [-600, 300, 220], [620, -280, 220], [0, -500, 180], [0, 520, 180]].forEach((q) => {
      const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], q[2]); gr.addColorStop(0, 'rgba(92,72,34,.24)'); gr.addColorStop(1, 'rgba(92,72,34,0)');
      g.fillStyle = gr; g.fillRect(q[0] - q[2], q[1] - q[2], q[2] * 2, q[2] * 2);
    });
    g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 9000; i++) g.fillRect(rr(-PX, PX), rr(-PY, PY), rr(2, 6), rr(1.5, 4));
    g.fillStyle = 'rgba(0,30,10,.09)'; for (let i = 0; i < 9000; i++) g.fillRect(rr(-PX, PX), rr(-PY, PY), rr(2, 6), rr(1.5, 4));
    // the lines: 12 cm wide
    g.strokeStyle = 'rgba(246,250,240,.95)'; g.fillStyle = 'rgba(246,250,240,.97)'; g.lineWidth = 4.2; g.lineJoin = 'miter';
    g.strokeRect(-HL, -HW, HL * 2, HW * 2);
    g.beginPath(); g.moveTo(0, -HW); g.lineTo(0, HW); g.stroke();
    g.beginPath(); g.arc(0, 0, VEN.stadium.circle, 0, TAU); g.stroke();
    g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
    const st = VEN.stadium;
    [-1, 1].forEach((sx) => {
      const gx = sx * HL;
      g.strokeRect(sx > 0 ? HL - st.boxD : -HL, -st.boxW, st.boxD, st.boxW * 2);
      g.strokeRect(sx > 0 ? HL - st.sixD : -HL, -st.sixW, st.sixD, st.sixW * 2);
      g.beginPath(); g.arc(gx - sx * st.spot, 0, 7, 0, TAU); g.fill();
      // the arc of the D: 9.15 m from the spot, outside the box
      const a = Math.acos((st.boxD - st.spot) / st.circle);
      g.beginPath(); if (sx > 0) g.arc(gx - st.spot, 0, st.circle, PI - a, PI + a); else g.arc(gx + st.spot, 0, st.circle, -a, a); g.stroke();
      [-1, 1].forEach((sy) => { g.beginPath(); g.arc(gx, sy * HW, 30, sx > 0 ? (sy > 0 ? PI : PI / 2) : (sy > 0 ? 1.5 * PI : 0), sx > 0 ? (sy > 0 ? 1.5 * PI : PI) : (sy > 0 ? TAU : PI / 2)); g.stroke(); });
      // the goal line inside the posts a touch brighter
      g.fillRect(gx - 2.1, -GH, 4.2, GH * 2);
    });
  });
}
// a seated crowd at a distance: rows of heads and shirts in the clubs' colours and everyday clothes
function texCrowdSheet(c1, c2) {
  return canvasTex(1024, 256, (g, w, h) => {
    const R = Arcade.rng(77 + (c1.charCodeAt(1) | 0));
    g.fillStyle = '#20232b'; g.fillRect(0, 0, w, h);
    const rows = 16, rh = h / rows, cols = ['#3a4252', '#5b6474', '#7a2e2e', '#2f5d50', '#c9b79c', '#e8e2d6', '#3c3c42', '#8a5a2b', '#2d6cdf', '#f2c14e', c1, c1, c2, c1];
    const skin = ['#e7bb95', '#d9a47b', '#c98f66', '#b77b54', '#a26a47', '#8c5a3b', '#744830'];
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + rh - 2, w, 2);
      for (let x = 0; x < w; x += 7 + R() * 3) {
        if (R() < 0.06) continue;
        const cx = x + R() * 2;
        g.fillStyle = cols[(R() * cols.length) | 0]; g.fillRect(cx - 3, y + rh * 0.45, 6.5, rh * 0.5);
        g.fillStyle = skin[(R() * skin.length) | 0]; g.beginPath(); g.arc(cx + 0.2, y + rh * 0.32, 2.4, 0, TAU); g.fill();
        g.fillStyle = 'rgba(18,14,11,.9)'; g.fillRect(cx - 2.2, y + rh * 0.18, 4.6, 1.8);
      }
    }
  }, { repeatS: true });
}
// LED boards: the league's own words, nothing anyone else owns
function texBoardsLED() {
  return canvasTex(2048, 64, (g, w, h) => {
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
    const words = ['TURF KINGS', 'MONSOON LEAGUE', 'BANYAN CUP', 'PLAY FAIR', 'KICK OFF LIVE', 'RESPECT THE REF', 'CHAI AT HALF TIME', 'GROUNDS FOR ALL'];
    const sw = w / words.length;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 30px Inter, Arial, sans-serif';
    if (g.letterSpacing !== undefined) g.letterSpacing = '2px';
    words.forEach((t, i) => {
      const bg = ['#14304a', '#3a1c4a', '#103a2e', '#4a2a10'][i % 4];
      g.fillStyle = bg; g.fillRect(i * sw + 2, 4, sw - 4, h - 8);
      // every phrase fits its own panel: a long one is set smaller rather than running into the next
      let fs = 30; g.font = '800 ' + fs + 'px Inter, Arial, sans-serif';
      while (fs > 14 && g.measureText(t).width > sw - 20) { fs -= 2; g.font = '800 ' + fs + 'px Inter, Arial, sans-serif'; }
      g.fillStyle = ['#ffd36b', '#7fe0ff', '#9cff9c', '#ffb07a'][i % 4]; g.fillText(t, i * sw + sw / 2, h / 2 + 1);
    });
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
  }, { repeatS: true });
}
/* ------------------------------------------------------------------ the stadium */
const STAND = { side: { y0: 0, rows: 24, rowD: 26, rowH: 13.5, h0: 34, len: 0 }, end: { rows: 18, rowD: 26, rowH: 13.5, h0: 34 } };
function buildStadium(Q) {
  STAND.side.y0 = HW + 240; STAND.end.x0 = HL + 330; STAND.side.len = (HL + 330) * 2; STAND.end.len = (HW + 240 + STAND.side.rows * STAND.side.rowD) * 2;
  /* the ground around and the pitch */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 7400), new THREE.MeshStandardMaterial({ color: 0x1d4a2a, roughness: 0.96 }));
  ground.rotation.x = -PI / 2; ground.position.y = -0.6; ground.receiveShadow = true; ROOTG.add(ground);
  const PX = HL + 230, PY = HW + 170;
  const ptex = texPitchStadium(); const grain = texGrain(); grain.repeat.set(PX * 2 / 90, PY * 2 / 90);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PX * 2, PY * 2), new THREE.MeshStandardMaterial({ map: ptex, bumpMap: grain, bumpScale: 1.4, roughness: 0.92, metalness: 0 }));
  pitch.rotation.x = -PI / 2; pitch.receiveShadow = true; ROOTG.add(pitch); BV.pitchMat = pitch.material; BV.grain = grain;
  // a running track of rubber crumb between the grass and the stands
  const trk = new GB(); const tc = C('#6b3a2e');
  trk.box(PX * 2 + 220, 1, 90, M(0, 0.2, PY + 45), tc); trk.box(PX * 2 + 220, 1, 90, M(0, 0.2, -PY - 45), tc);
  trk.box(90, 1, PY * 2, M(PX + 45, 0.2, 0), tc); trk.box(90, 1, PY * 2, M(-PX - 45, 0.2, 0), tc);
  const trkM = new THREE.Mesh(trk.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); trkM.receiveShadow = true; ROOTG.add(trkM);
  /* goals */
  const goalMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f1, roughness: 0.35, metalness: 0.3 });
  const netMat = new THREE.MeshBasicMaterial({ map: texNet(), color: 0xe9eff4, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  netMat.map.repeat.set(1, 1);
  [-1, 1].forEach((sx) => {
    const bx = sx * HL, ex = sx * (HL + GD), gb = new GB();
    const tube = (ax, ay, az, bx2, by, bz, r) => gb.add(new THREE.CylinderGeometry(r, r, 1, 10), tubeM(ax, ay, az, bx2, by, bz));
    [-1, 1].forEach((sz) => {
      tube(bx, 0, sz * GH, bx, GOAL_H, sz * GH, 3.6);
      tube(bx, GOAL_H, sz * GH, ex, GOAL_H * 0.92, sz * GH, 1.6);
      tube(ex, 0, sz * GH, ex, GOAL_H * 0.92, sz * GH, 1.6);
      tube(bx, 0.8, sz * GH, ex, 0.8, sz * GH, 1.4);
    });
    tube(bx, GOAL_H, -GH, bx, GOAL_H, GH, 3.6);
    tube(ex, GOAL_H * 0.92, -GH, ex, GOAL_H * 0.92, GH, 1.6);
    tube(ex, 0.8, -GH, ex, 0.8, GH, 1.4);
    const frame = new THREE.Mesh(gb.build(), goalMat); frame.castShadow = true; ROOTG.add(frame);
    makeNet(sx, bx, ex, netMat);
  });
  /* corner flags */
  const fl = new GB(), flagG = new GB();
  [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => {
    fl.add(new THREE.CylinderGeometry(0.9, 0.9, 46, 6), M(sx * HL, 23, sy * HW), C('#f2efe6'));
    flagG.add(new THREE.PlaneGeometry(16, 11), M(sx * HL + sx * 8, 40, sy * HW, 0, sx > 0 ? 0 : PI, 0), C('#ffb736'));
  }));
  ROOTG.add(new THREE.Mesh(fl.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));
  const flags = new THREE.Mesh(flagG.build(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })); ROOTG.add(flags); BV.flags = flags;
  /* LED boards around the pitch */
  const btex = texBoardsLED();
  const bmat = new THREE.MeshBasicMaterial({ map: btex, toneMapped: false, color: 0xd8d8d8 });
  const boards = [];
  const board = (len, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 30), bmat); m.position.set(x, 15, z); m.rotation.y = ry; ROOTG.add(m); boards.push(m); };
  board(HL * 2 + 160, 0, -(HW + 130), 0); board(HL * 2 + 160, 0, HW + 130, PI);
  board(HW * 2 - 80, -(HL + 190), 0, PI / 2); board(HW * 2 - 80, HL + 190, 0, -PI / 2);
  btex.repeat.set(2, 1);
  const bback = new GB(); const dark = C('#1a1d24');
  bback.box(HL * 2 + 160, 32, 4, M(0, 16, -(HW + 133)), dark); bback.box(HL * 2 + 160, 32, 4, M(0, 16, HW + 133), dark);
  bback.box(4, 32, HW * 2 - 80, M(-(HL + 193), 16, 0), dark); bback.box(4, 32, HW * 2 - 80, M(HL + 193, 16, 0), dark);
  ROOTG.add(new THREE.Mesh(bback.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));
  BV.boards = btex;
  /* the stands: concrete steps, a crowd sheet on the rows the instanced people do not fill, roofs */
  standGeometry();
  W3.q.push({ venue: 'stadium', fn: () => standRoofs() });
  W3.q.push({ venue: 'stadium', fn: () => stadiumPylons() });
  W3.q.push({ venue: 'stadium', fn: () => stadiumCrowd(Q) });
  W3.q.push({ venue: 'stadium', fn: () => stadiumExtras() });
  W3.q.push({ venue: 'stadium', fn: () => stadiumSkyline() });
}
function standGeometry() {
  const gb = new GB(), conc = C('#3e4450'), lip = C('#5b6270'), wall = C('#2a2e37');
  const S1 = STAND.side, E1 = STAND.end;
  [-1, 1].forEach((sz) => {
    for (let i = 0; i < S1.rows; i++) {
      const hgt = S1.h0 + S1.rowH * (i + 1), zc = sz * (S1.y0 + S1.rowD * i + S1.rowD / 2);
      gb.box(S1.len, hgt, S1.rowD, M(0, hgt / 2, zc), conc); gb.box(S1.len, 1.4, S1.rowD, M(0, hgt + 0.7, zc), lip);
    }
    gb.box(S1.len, S1.h0 + 2, 6, M(0, (S1.h0 + 2) / 2, sz * (S1.y0 - 3)), wall);
    const top = S1.h0 + S1.rowH * S1.rows;
    gb.box(S1.len + 40, top + 120, 10, M(0, (top + 120) / 2, sz * (S1.y0 + S1.rowD * S1.rows + 5)), wall);
    // stand ends
    [-1, 1].forEach((sx) => gb.box(10, top + 120, S1.rowD * S1.rows + 10, M(sx * S1.len / 2, (top + 120) / 2, sz * (S1.y0 + S1.rowD * S1.rows / 2)), wall));
  });
  [-1, 1].forEach((sx) => {
    for (let i = 0; i < E1.rows; i++) {
      const hgt = E1.h0 + E1.rowH * (i + 1), xc = sx * (E1.x0 + E1.rowD * i + E1.rowD / 2);
      gb.box(E1.rowD, hgt, E1.len, M(xc, hgt / 2, 0), conc); gb.box(E1.rowD, 1.4, E1.len, M(xc, hgt + 0.7, 0), lip);
    }
    gb.box(6, E1.h0 + 2, E1.len, M(sx * (E1.x0 - 3), (E1.h0 + 2) / 2, 0), wall);
    const top = E1.h0 + E1.rowH * E1.rows;
    gb.box(10, top + 60, E1.len + 20, M(sx * (E1.x0 + E1.rowD * E1.rows + 5), (top + 60) / 2, 0), wall);
  });
  const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })); m.receiveShadow = true; ROOTG.add(m);
  // crowd sheets: one sloped quad per stand above the treads, a painted crowd that sways with the noise
  const mkSheet = (c1, c2, len, rows, rowD, rowH, h0, place) => {
    // one painted crowd shared by every stand (a clone shares the image, only the repeat differs)
    if (!W3.crowdTex) W3.crowdTex = texCrowdSheet(c1, c2);
    const tex = W3.crowdTex.clone(); tex.repeat.set(len / 380, 1);
    const run = rows * rowD, rise = rows * rowH, L = hyp(run, rise);
    const geo = new THREE.PlaneGeometry(len, L);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    place(mesh, run, rise, L, h0);
    ROOTG.add(mesh); BV.sheets.push({ mesh, tex, base: tex.offset.y });
    return mesh;
  };
  const c1 = '#c9b79c', c2 = '#e8e2d6';
  [-1, 1].forEach((sz) => mkSheet(c1, c2, S1.len - 20, S1.rows, S1.rowD, S1.rowH, S1.h0, (mesh, run, rise, L, h0) => {
    mesh.position.set(0, h0 + rise / 2 + 9, sz * (S1.y0 + run / 2));
    mesh.lookAt(0, h0 + rise / 2 + 9 + 300 * Math.cos(Math.atan2(rise, run)), sz * (S1.y0 + run / 2) - sz * 300 * Math.sin(Math.atan2(rise, run)));
  }));
  [-1, 1].forEach((sx) => mkSheet(c1, c2, E1.len - 20, E1.rows, E1.rowD, E1.rowH, E1.h0, (mesh, run, rise, L, h0) => {
    mesh.position.set(sx * (E1.x0 + run / 2), h0 + rise / 2 + 9, 0);
    const a = Math.atan2(rise, run);
    mesh.lookAt(sx * (E1.x0 + run / 2) - sx * 300 * Math.sin(a), h0 + rise / 2 + 9 + 300 * Math.cos(a), 0);
  }));
}
function standRoofs() {
  const S1 = STAND.side, gb = new GB(), steel = C('#3b4049'), glass = C('#7d8796');
  const lights = new GB(), lc = C('#fffbe8');
  const top = S1.h0 + S1.rowH * S1.rows;
  [-1, 1].forEach((sz) => {
    const back = S1.y0 + S1.rowD * S1.rows + 5, front = S1.y0 + 40, depth = back - front + 60;
    const yb = top + 150, yf = top + 120;
    const a = Math.atan2(yb - yf, depth);
    gb.box(S1.len + 60, 5, depth, M(0, (yb + yf) / 2, sz * (front + depth / 2 - 30), sz > 0 ? a : -a), glass);
    // trusses
    for (let x = -S1.len / 2; x <= S1.len / 2 + 1; x += 210) {
      gb.add(new THREE.CylinderGeometry(3, 3, 1, 6), tubeM(x, yb, sz * back, x, yf, sz * (front - 30)), steel);
      gb.add(new THREE.CylinderGeometry(2.4, 2.4, 1, 6), tubeM(x, yb + 40, sz * back, x, yf, sz * (front - 30)), steel);
      gb.add(new THREE.CylinderGeometry(4, 4, 1, 6), tubeM(x, 0, sz * (back + 8), x, yb + 40, sz * (back + 8)), steel);
    }
    // a band of floodlights along the front edge
    for (let x = -S1.len / 2 + 60; x < S1.len / 2 - 40; x += 70) lights.box(26, 7, 4, M(x, yf - 6, sz * (front - 34), sz > 0 ? -0.5 : 0.5), lc);
  });
  const roof = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 })); roof.castShadow = false; ROOTG.add(roof);
  ROOTG.add(new THREE.Mesh(lights.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
}
function stadiumPylons() {
  const poles = new GB(), bulbs = new GB();
  const steelC = C('#3a3f48'), dark = C('#23272e'), bulbC = C('#fffbe8');
  const tmp = new THREE.Matrix4(), H = 1180;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((c) => {
    const tx = c[0] * (HL + 920), tz = c[1] * (HW + 960);
    poles.add(new THREE.CylinderGeometry(7, 14, H, 10), M(tx, H / 2, tz), steelC);
    for (let y = 160; y < H; y += 220) poles.add(new THREE.TorusGeometry(12 - y * 0.004, 2.2, 5, 12), M(tx, y, tz, PI / 2), dark);
    const yaw = Math.atan2(-tx, -tz);
    const Hm = M(tx, H + 10, tz, 0, yaw, 0).multiply(M(0, 0, 0, 0.5, 0, 0));
    poles.add(new THREE.BoxGeometry(230, 140, 10), tmp.copy(Hm), steelC);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) bulbs.add(new THREE.BoxGeometry(26, 24, 4), tmp.copy(Hm).multiply(M(-96 + k * 32, -45 + r * 31, 7)), bulbC);
    BV.towers.push({ x: tx, y: H + 10, z: tz });
  });
  ROOTG.add(new THREE.Mesh(poles.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 })));
  ROOTG.add(new THREE.Mesh(bulbs.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: 0xffffff })));
  const glowTex = texGlow();
  BV.towers.forEach((t) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1cc, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    sp.position.set(t.x * 0.985, t.y - 4, t.z * 0.985); sp.scale.set(620, 620, 1); sp.renderOrder = 4; ROOTG.add(sp); BV.glows.push(sp);
  });
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(1, 0.95, 0.8) }, k: { value: 0.05 } },
    vertexShader: 'attribute float t; varying vec3 vN; varying vec3 vV; varying float vT; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); vT = t; gl_Position = projectionMatrix*viewMatrix*wp; }',
    fragmentShader: 'uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vV; varying float vT; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 1.6) * (1.0 - vT) * (1.0 - vT) * k; gl_FragColor = vec4(col * a, 1.0); }',
  });
  BV.towers.forEach((t) => {
    const aim = new THREE.Vector3(-t.x * 0.3, 0, -t.z * 0.3), apex = new THREE.Vector3(t.x * 0.98, t.y - 10, t.z * 0.98);
    const len = apex.distanceTo(aim) * 1.1, rad = len * Math.tan(0.42), seg = 28;
    const pos = [], nor = [], tt = [];
    const ca = Math.cos(Math.atan(0.42)), sa = Math.sin(Math.atan(0.42));
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      pos.push(0, 0, 0, Math.cos(a0) * rad, Math.sin(a0) * rad, len, Math.cos(a1) * rad, Math.sin(a1) * rad, len);
      tt.push(0, 1, 1);
      [a0, a0, a1].forEach((a) => nor.push(Math.cos(a) * ca, Math.sin(a) * ca, -sa));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('t', new THREE.Float32BufferAttribute(tt, 1));
    const m = new THREE.Mesh(g, coneMat); m.position.copy(apex); m.lookAt(aim); m.frustumCulled = false; m.renderOrder = 5; ROOTG.add(m); BV.cones.push(m);
  });
}
// the people in the front rows of every stand: one instanced draw, each with their own timing
function stadiumCrowd(Q) {
  const S1 = STAND.side, E1 = STAND.end, members = [];
  // fewer people in the front rows on a light tier (the painted crowd fills the rest)
  const lite = W3.soft || PERF.level >= 3, rowsS = lite ? 2 : 5, rowsE = lite ? 1 : 4, gap = 19;
  [-1, 1].forEach((sz) => {
    for (let i = 0; i < rowsS; i++) {
      const floor = S1.h0 + S1.rowH * i + 1.4, z = sz * (S1.y0 + S1.rowD * i + 6);
      for (let x = -S1.len / 2 + 30; x <= S1.len / 2 - 30; x += gap) {
        if (hash01(x * 3.1 + i * 17 + sz * 5) < 0.08) continue;
        members.push({ x: x + (hash01(x + i) - 0.5) * 6, y: floor, z, yaw: (sz > 0 ? PI : 0) + (hash01(x * 9 + i) - 0.5) * 0.3 });
      }
    }
  });
  [-1, 1].forEach((sx) => {
    for (let i = 0; i < rowsE; i++) {
      const floor = E1.h0 + E1.rowH * i + 1.4, x = sx * (E1.x0 + E1.rowD * i + 6);
      for (let z = -E1.len / 2 + 30; z <= E1.len / 2 - 30; z += gap) {
        if (hash01(z * 2.3 + i * 11 + sx * 7) < 0.1) continue;
        members.push({ x, y: floor, z: z + (hash01(z + i) - 0.5) * 6, yaw: (sx > 0 ? -PI / 2 : PI / 2) + (hash01(z * 5 + i) - 0.5) * 0.3 });
      }
    }
  });
  for (let i = members.length - 1; i > 0; i--) { const j = (hash01(i * 7.7 + 3) * (i + 1)) | 0; const t = members[i]; members[i] = members[j]; members[j] = t; }
  const crowd = createCrowd({ members, unit: UNIT, seed: 13, quality: Q.crowdQ, lod: 'far', colors: ['#ff7a1a', '#2f6bff'] });
  ROOTG.add(crowd.mesh);
  BV.crowd = crowd;
  if (S && !S.demo) recolorCrowd();
}
function stadiumExtras() {
  // dugouts, the tunnel and the big screen
  const gb = new GB(), dark = C('#1b1e25'), seat = C('#2f6bff'), glass = C('#9fb4c8');
  [-1, 1].forEach((sx) => {
    const x = sx * 330, z = HW + 150;
    gb.box(170, 4, 46, M(x, 2, z), dark); gb.box(170, 46, 4, M(x, 25, z + 22), dark);
    gb.box(4, 46, 46, M(x - 85, 25, z), glass); gb.box(4, 46, 46, M(x + 85, 25, z), glass);
    gb.box(170, 4, 50, M(x, 48, z), glass);
    gb.box(150, 12, 14, M(x, 8, z + 10), seat);
  });
  // the tunnel mouth under the main stand
  gb.box(120, 80, 6, M(0, 40, HW + 236), C('#090a0d'));
  gb.box(140, 10, 90, M(0, 84, HW + 200), dark);
  ROOTG.add(new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 })));
  // the big screen above the end stand
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const E1 = STAND.end, sx = -1, top = E1.h0 + E1.rowH * E1.rows;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(420, 210), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  scr.position.set(sx * (E1.x0 + E1.rowD * E1.rows - 10), top + 190, 0); scr.rotation.y = PI / 2; ROOTG.add(scr);
  const fr = new GB(); fr.box(12, 230, 440, M(sx * (E1.x0 + E1.rowD * E1.rows - 4), top + 190, 0), dark); fr.add(new THREE.CylinderGeometry(6, 6, 100, 8), M(sx * (E1.x0 + E1.rowD * E1.rows - 4), top + 40, -120), dark); fr.add(new THREE.CylinderGeometry(6, 6, 100, 8), M(sx * (E1.x0 + E1.rowD * E1.rows - 4), top + 40, 120), dark);
  ROOTG.add(new THREE.Mesh(fr.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  BV.screen = { cv, g: cv.getContext('2d'), tex };
  W3.screenDirty = true;
}
function stadiumSkyline() {
  const winTex = texWindows();
  const keep = ROOTG; ROOTG = new THREE.Group(); keep.add(ROOTG); BV.skyline = ROOTG;
  const R = Arcade.rng(512), lists = [[], [], []], hs = [420, 760, 1200];
  for (let tries = 0; tries < 400 && lists[0].length + lists[1].length + lists[2].length < 90; tries++) {
    const ang = R() * TAU, dist = 4300 + R() * 4200;
    const x = Math.cos(ang) * dist * 1.2, z = Math.sin(ang) * dist;
    const ci = Math.min(2, (R() * R() * 3 + (dist > 6000 ? R() : 0)) | 0);
    lists[ci].push({ x, z, s: 1.4 + R() * 1.4, sy: R() < 0.5 ? 0 : PI / 2, tint: 0.5 + R() * 0.6, hue: R() });
  }
  const tmp = new THREE.Color(), mm = new THREE.Matrix4();
  hs.forEach((h, ci) => {
    const list = lists[ci]; if (!list.length) return;
    const mesh = new THREE.InstancedMesh(winBox(160, h, 160), new THREE.MeshBasicMaterial({ map: winTex }), list.length);
    list.forEach((b, i) => {
      mm.compose(_p.set(b.x, h / 2 - 2, b.z), _q.setFromEuler(_e.set(0, b.sy, 0)), _s.set(b.s, 1, b.s * (0.8 + b.hue * 0.5)));
      mesh.setMatrixAt(i, mm);
      tmp.setHSL(0.58 + b.hue * 0.12, 0.22, 0.42 * b.tint + 0.08); mesh.setColorAt(i, tmp);
    });
    mesh.frustumCulled = false; ROOTG.add(mesh);
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000), new THREE.MeshBasicMaterial({ map: texCityFloor() }));
  floor.material.map.repeat.set(24, 24); floor.rotation.x = -PI / 2; floor.position.y = -3; ROOTG.add(floor);
  ROOTG = keep;
}
// the big screen: the score, the clubs, the clock, redrawn only when something changes
function drawScreen() {
  const v = W3.venues.stadium; if (!v || !v.screen || !S) return;
  const { g, tex } = v.screen, w = 512, h = 256;
  g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(40,60,110,.5)'); gr.addColorStop(1, 'rgba(10,12,20,.2)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 22px Inter, Arial, sans-serif'; g.fillStyle = '#c9a96e'; g.fillText(S.demo ? LEAGUE.toUpperCase() : (S.cfg.label || (S.cfg.mode === 'friendly' ? 'FRIENDLY' : LEAGUE)).toUpperCase(), w / 2, 30);
  for (let t = 0; t < 2; t++) {
    const x = t ? w * 0.78 : w * 0.22;
    drawCrest(g, x, 112, 46, S.club[t]);
    g.font = '800 26px Inter, Arial, sans-serif'; g.fillStyle = '#fbf5ec'; g.fillText(S.teams[t].abbr, x, 186);
  }
  g.font = '700 84px Inter, Arial, sans-serif'; g.fillStyle = '#ffffff'; g.fillText(S.score[0] + '-' + S.score[1], w / 2, 118);
  g.font = '600 20px Inter, Arial, sans-serif'; g.fillStyle = '#a9b8d8'; g.fillText(TEAMS[S.club[S.hostTeam]].ground, w / 2, 222);
  tex.needsUpdate = true;
  W3.screenDirty = false;
}

/* ================================================================== three.js: people, ball, effects */
const RIGS = [];
const NRIG = 25, REF_I = 22; // 22 players, then the referee and his two assistants
const FX = { ball: null, ballMat: null, ballTex: null, goldTex: null, spinQ: new THREE.Quaternion(), px: 0, py: 0, pz: 0, ring: null, arrow: null, target: null, marks: [], shadow: null, puff: null, conf: null, aim: null, offLine: null, offT: 0, card: null, flag: [] };
const _bq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _ax = new THREE.Vector3(), _mm = new THREE.Matrix4(), _col = new THREE.Color();
const ZAX = new THREE.Vector3(0, 0, 1);
const BUILDS = ['athletic', 'average', 'athletic', 'slim'];
const PHAIR = ['short', 'buzz', 'curly', 'short', 'buzz', 'curly'];
function playerOutfit(p) {
  const kit = S.kits[p.team === S.hostTeam ? 0 : 1], gk = p.role === 'GK';
  return gk
    ? { top: kit.gk, top2: kit.gkTrim, sleeves: 'long', bottom: '#1b1b22', legs: 'shorts', socks: kit.gk, socksHigh: true, shoes: '#17171d', soles: '#d9d6cf', gloves: '#f4f4f4', number: p.num }
    : { top: kit.c1, top2: kit.c2, sleeves: 'short', bottom: kit.shorts, legs: 'shorts', socks: kit.sock, socksHigh: true, shoes: p.k % 2 ? '#17171d' : '#f2f0ea', soles: p.k % 2 ? '#e9e6df' : '#26262b', number: p.num };
}
const OFFICIAL = { top: '#17181d', top2: '#e8c33a', sleeves: 'short', bottom: '#17181d', legs: 'shorts', socks: '#17181d', socksHigh: true, shoes: '#111114', soles: '#e9e6df', number: null };
// every body the clubs use, built one per frame while idle so a new match never stalls on it
const PREP = [];
for (const b of ['athletic', 'average', 'slim']) for (const hr of ['short', 'buzz', 'curly']) for (const lod of ['mid', 'full', 'far']) PREP.push({ lod, sex: 'm', build: b, hair: hr });
function prepTick() {
  if (PERF.level >= 3) { PREP.length = 0; W3.varyBodies = false; W3.prepDone = true; return; }
  while (PREP.length) { const o = PREP.shift(); if (o.lod === 'full' && PERF.level >= 2) continue; if (prepareHuman(o)) return; }
  W3.varyBodies = true; W3.prepDone = true;
}
function buildRigs() {
  for (let i = 0; i < NRIG; i++) RIGS.push({ h: null, root: null, snap: true, yaw: 0, key: '', want: '', state: '', wait: 0, next: null, nextO: null, held: '', acc: 0, odd: i & 1, jumpSeen: 0, lod: '', vis: false });
}
// which person each rig should be: a club's own player in this match's kit, or an official
function rigWant(i) {
  if (i >= REF_I) return 'off:' + i;
  const p = S.players[i]; if (!p) return '';
  return p.club + ':' + p.sq;
}
// A new match: these clubs' own players (the same club always fields the same people), in this match's kits.
function applyKits() { for (let i = 0; i < NRIG; i++) { RIGS[i].want = rigWant(i); RIGS[i].kitDirty = true; } }
// the rig queue: at most two new people a frame, outfits changed in place
function rigTick() {
  let made = 0;
  for (let i = 0; i < NRIG && made < (arc.frame < 3 ? 3 : 1); i++) {
    const r = RIGS[i];
    if (!r.want) continue;
    if (r.key !== r.want || !r.h) {
      if (r.h && W3.varyBodies !== r.vary) { r.h.dispose(); r.h = null; }
      const q = PERF.level <= 1 ? 3 : PERF.level <= 3 ? 2 : 1;
      const vary = !!W3.varyBodies, lod = PERF.level >= 2 ? 'mid' : 'full';
      if (r.h && r.key && r.key.slice(0, 4) !== 'off:' && r.want.slice(0, 4) !== 'off:' && !vary) { r.key = r.want; r.kitDirty = true; }
      else {
        if (r.h) { r.h.dispose(); r.h = null; }
        let o;
        if (i >= REF_I) o = { seed: 900 + i * 7, unit: UNIT, sex: 'm', build: 'average', hair: vary ? 'buzz' : 'short', quality: q, lod, outfit: OFFICIAL, castShadow: true };
        else {
          const p = S.players[i], seed = p.club * 16 + p.sq * 3 + 1;
          o = { seed, unit: UNIT, sex: 'm', build: vary ? BUILDS[(p.club + p.sq) % BUILDS.length] : 'athletic', hair: vary ? PHAIR[(p.club * 3 + p.sq) % PHAIR.length] : 'short', height: p.role === 'GK' ? 1.88 : undefined, quality: q, lod, outfit: playerOutfit(p), castShadow: true };
        }
        const t0 = performance.now();
        r.h = createHuman(o); r.vary = vary; r.lod = lod;
        if (W3.prof.length < 200) W3.prof.push(['rig' + i, Math.round(performance.now() - t0)]);
        r.h.mesh.frustumCulled = true;
        r.root = r.h.group; scene.add(r.root); r.key = r.want; r.snap = true; r.kitDirty = false;
        if (i === REF_I && FX.card) r.h.bones.wristR.add(FX.card);
        if (i > REF_I && FX.flag[i - REF_I - 1]) r.h.bones.wristR.add(FX.flag[i - REF_I - 1]);
        made++;
      }
    }
    if (r.kitDirty && r.h) { r.kitDirty = false; if (i < REF_I && S.players[i]) r.h.setOutfit(playerOutfit(S.players[i])); r.h.stop(); r.held = ''; r.next = null; r.wait = 0; r.snap = true; }
  }
}
// queue a reaction a beat after the moment, so a side never reacts as one
function react(i, name, o, delay) { const r = RIGS[i]; if (!r || !r.h) return; r.next = name; r.nextO = o || null; r.wait = delay == null ? 0.08 + rnd() * 0.35 : delay; }
const _look = new THREE.Vector3();
const _vp = new THREE.Vector3();
let BALLTRAIL = null;
function startTrail(col) { if (BALLTRAIL) BALLTRAIL.stop(); BALLTRAIL = W3.vfx.trail(FX.ball, { color: col, width: 0.22, life: 0.4 }); W3.trailT = 0; }
function trailTick(dt) {
  if (!BALLTRAIL) return;
  W3.trailT += dt;
  const b = S.ball;
  if (b.owner || hyp(b.vx, b.vy) < 260 || W3.trailT > 2.5 || S.phase === 'restart') { BALLTRAIL.stop(); BALLTRAIL = null; }
}
// where a stand flare goes: the end behind a goal, among the home or away fans
function flareAt(team, out) {
  const stad = !VN.walls;
  const end = (team === S.hostTeam ? -1 : 1) * (S.dir[0] > 0 ? 1 : -1);
  if (stad) out.set(end * (STAND.end.x0 + 60 + rnd() * 120), 60 + rnd() * 50, (rnd() - 0.5) * STAND.end.len * 0.7);
  else out.set((rnd() - 0.5) * 700, 40, (rnd() < 0.5 ? -1 : 1) * 330);
  return out;
}
function consumeEvents() {
  const q = S.evq, stad = !VN.walls, v = W3.vfx && !S.demo ? W3.vfx : null;
  const crowd = W3.cur && W3.cur.crowd;
  const P = S.players;
  for (let k = 0; k < q.length; k++) {
    const e = q[k];
    if (e.kind === 'goal') {
      const team = e.v;
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; if (p.out) continue;
        if (p === e.p && p.team === team) react(i, 'celebrate', null, 0.05);
        else if (p.team === team) react(i, pick(['cheer', 'fistPump', 'cheer', 'highFive', 'clap']), { side: rnd() < 0.5 ? 'left' : 'right' }, 0.15 + rnd() * 0.6);
        else react(i, p.role === 'GK' ? pick(['slump', 'handsOnHead']) : pick(['handsOnHead', 'slump', 'slump', 'shrug']), null, 0.2 + rnd() * 0.7);
      }
      if (crowd) crowd.react(team === S.hostTeam ? 'cheer' : 'groan', team === S.hostTeam ? 1 : 0.8);
      if (v) {
        const gx = S.ball.x > 0 ? 1 : -1, kit = S.kits[team === S.hostTeam ? 0 : 1];
        _vp.set(gx * (HL + GD * (stad ? 1.4 : 0.6)), 0, 0);
        v.goalBurst(_vp, { color: kit.c1, color2: kit.c2, size: stad ? 1.3 : 0.75 });
        v.timeWarp(0.45, 1.1);
        if (stad) for (let f = 0; f < 3; f++) v.smokePlume(flareAt(team, _vp), { size: 1.4, duration: 6, color: f % 2 ? kit.c2 : kit.c1, fire: true, delay: f * 0.4 });
      }
      W3.screenDirty = true;
    } else if (e.kind === 'fulltime') {
      if (v && e.v === 0) { _vp.set(0, 0, 0); v.winBurst(_vp, { colors: [S.kits[S.hostTeam === 0 ? 0 : 1].c1, S.kits[S.hostTeam === 0 ? 0 : 1].c2], size: stad ? 1.4 : 0.8 }); }
      for (let i = 0; i < P.length; i++) { const p = P[i]; if (p.out) continue; react(i, e.v < 0 ? pick(['shrug', 'clap', 'slump']) : p.team === e.v ? pick(['celebrate', 'cheer', 'fistPump']) : pick(['slump', 'handsOnHead', 'slump']), null, 0.2 + rnd() * 0.8); }
      if (crowd) crowd.react(e.v === S.hostTeam ? 'cheer' : e.v === 1 - S.hostTeam ? 'groan' : 'clap', 0.9);
      W3.screenDirty = true;
    } else if (e.kind === 'save') {
      if (rnd() < 0.55) react(e.p.i, 'fistPump', { side: rnd() < 0.5 ? 'left' : 'right', intensity: 0.8 }, 0.35);
      if (e.q && e.q.team !== e.p.team && rnd() < 0.7) react(e.q.i, rnd() < 0.6 ? 'handsOnHead' : 'shrug', null, 0.25 + rnd() * 0.3);
      if (crowd) crowd.react('gasp', 0.6);
    } else if (e.kind === 'parry' || e.kind === 'claim') { if (crowd) crowd.react(e.kind === 'claim' ? 'clap' : 'gasp', 0.5); }
    else if (e.kind === 'foul') { react(e.q.i, 'fall', null, 0); if (rnd() < 0.7) react(e.p.i, 'shrug', null, 0.5 + rnd() * 0.3); if (RIGS[REF_I].h && !VN.walls) react(REF_I, 'point', { target: _vp.set(e.q.x, 20, e.q.y).clone() }, 0.15); }
    else if (e.kind === 'card') {
      FX.cardT = 2.6; if (FX.card) FX.card.material.color.set(e.v === 1 ? '#f4d21d' : '#e2262f');
      if (RIGS[REF_I].h) react(REF_I, 'point', { target: new THREE.Vector3(S.ref.x, 140, S.ref.y), intensity: 1 }, 0.3);
      react(e.p.i, e.v >= 2 ? 'slump' : 'shrug', null, 0.6);
      if (crowd) crowd.react(e.p.team === S.hostTeam ? 'groan' : 'cheer', 0.5);
    } else if (e.kind === 'offside') {
      FX.offT = 2.6; FX.offX = e.p.x;
      const ai = REF_I + 1 + (e.p.x > 0 ? 1 : 0);
      if (RIGS[ai] && RIGS[ai].h) react(ai, 'point', { target: new THREE.Vector3(S.ars[ai - REF_I - 1].x, 160, S.ars[ai - REF_I - 1].y), intensity: 1 }, 0.05);
      react(e.p.i, 'shrug', null, 0.4);
    } else if (e.kind === 'penalty') { react(e.q.i, 'fall', null, 0); react(e.p.i, 'handsOnHead', null, 0.5); if (RIGS[REF_I].h) react(REF_I, 'point', { target: new THREE.Vector3(attackX(e.q.team) - sgn(attackX(e.q.team)) * VN.spot, 0, 0) }, 0.2); if (crowd) crowd.react('gasp', 0.8); }
    else if (e.kind === 'tackled') { react(e.p.i, 'stumble', null, 0); }
    else if (e.kind === 'slide') { react(e.p.i, 'slide', null, 0); }
    else if (e.kind === 'skill') { const r = RIGS[e.p.i]; if (r && r.h) r.h.play('kick', { side: rnd() < 0.5 ? 'left' : 'right', from: 0.12, speed: 1.9, intensity: 0.45 }); if (v) { _vp.set(e.p.x, 2, e.p.y); v.ring(_vp, '#fff2c0', { size: 0.35, kind: 'ripple' }); } }
    else if (e.kind === 'throw') { const r = RIGS[e.p.i]; if (r && r.h) r.h.play('throw', { from: 0.35, speed: 1.4 }); }
    else if (e.kind === 'shot' || e.kind === 'pass' || e.kind === 'header') {
      const r = RIGS[e.p.i];
      if (r && r.h) {
        if (e.kind === 'header') r.h.play('jump', { from: 0.2, speed: 1.5, intensity: 0.8 });
        else r.h.play('kick', { side: (e.p.i + ((e.t * 7) | 0)) % 3 ? 'right' : 'left', from: 0.3, speed: e.kind === 'shot' ? 1.25 : 1.7, intensity: e.kind === 'shot' ? 1 : 0.75 });
      }
      if ((e.kind === 'shot' || e.kind === 'header') && crowd) crowd.excite(Math.min(1, 0.55 + S.excite * 0.5));
      if ((e.kind === 'shot' || e.kind === 'header') && v && e.v > 560) { _vp.set(S.ball.x, 6, S.ball.y); v.impact(_vp, UPV, { kind: 'dust', color: '#bcd3b0', size: 0.7 }); startTrail(e.v > 820 ? '#ffe2a6' : '#fff6e6'); }
    } else if (e.kind === 'post' && v) { _vp.set(S.ball.x, S.ball.z + BR, S.ball.y); v.impact(_vp, UPV, { kind: 'spark', color: '#ffe7b0', size: 0.8 }); v.ring(_vp, '#fff1c9', { size: 0.6, kind: 'shock' });
    } else if (e.kind === 'net' && v) { _vp.set(S.ball.x, S.ball.z + BR, S.ball.y); v.impact(_vp, UPV, { kind: 'powder', color: '#e8efe6', size: 0.6 });
    } else if (e.kind === 'chant') { if (crowd) crowd.react(rnd() < 0.5 ? 'clap' : 'wave', 0.45); }
    else if (e.kind === 'flare' && v && stad && PERF.level <= 3) {
      const kit = S.kits[e.v === S.hostTeam ? 0 : 1];
      for (let f = 0; f < 2; f++) v.smokePlume(flareAt(e.v, _vp), { size: 1.2, duration: 7, color: f ? kit.c2 : kit.c1, fire: true, delay: f * 0.6 });
    } else if (e.kind === 'walkout') { if (crowd) { crowd.react('cheer', 1); crowd.excite(0.9); } }
    else if (e.kind === 'anthem') { if (crowd) crowd.react('wave', 1); }
    else if (e.kind === 'pengoal') { if (crowd) crowd.react(e.v === S.hostTeam ? 'cheer' : 'groan', 0.9); if (v) { _vp.set(HL + GD, 0, 0); v.confetti(_vp, { count: 60, colors: [S.kits[e.v === S.hostTeam ? 0 : 1].c1, '#ffffff'] }); } react(e.p.i, 'celebrate', null, 0.1); }
    else if (e.kind === 'penmiss') { if (crowd) crowd.react('gasp', 0.9); react(e.p.i, 'handsOnHead', null, 0.3); if (e.q && e.v) react(e.q.i, 'fistPump', null, 0.4); }
    else if (e.kind === 'replay') { /* the camera and the HUD pick it up */ }
  }
  q.length = 0;
}
function buildFx(Q) {
  FX.ballTex = texBall();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR * 1.08, 24, 16), new THREE.MeshStandardMaterial({ map: FX.ballTex, roughness: 0.42, metalness: 0 }));
  ball.castShadow = true; scene.add(ball); FX.ball = ball; FX.ballMat = ball.material;
  const ringG = new THREE.RingGeometry(14.5, 18, 40); ringG.rotateX(-PI / 2);
  const mkRing = (hex, o) => { const m = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.renderOrder = 6; m.visible = false; scene.add(m); return m; };
  FX.ring = mkRing(0xffd23d, 0.95); FX.target = mkRing(0x59e0ff, 0.9);
  const coneG = new THREE.ConeGeometry(4.6, 9, 4); coneG.rotateX(PI);
  FX.arrow = new THREE.Mesh(coneG, new THREE.MeshBasicMaterial({ color: 0xffd23d, toneMapped: false })); FX.arrow.visible = false; FX.arrow.renderOrder = 7; scene.add(FX.arrow);
  const mg = new THREE.RingGeometry(5, 7.5, 24); mg.rotateX(-PI / 2);
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; m.renderOrder = 6; scene.add(m); FX.marks.push({ m, age: 9, life: 0.5 }); }
  // the set-piece aim: a chevron on the grass from the ball
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -7, 0, 0, 7, 120, 0, 0, 120, 0, 0, 100, 0, -16, 100, 0, 16], 3));
  ag.setIndex([0, 1, 2, 3, 4, 5]);
  FX.aim = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide })); FX.aim.visible = false; FX.aim.renderOrder = 7; scene.add(FX.aim);
  // the offside line the broadcast draws across the pitch
  const lg = new THREE.PlaneGeometry(4, 1); lg.rotateX(-PI / 2);
  FX.offLine = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xff4d6a, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); FX.offLine.visible = false; FX.offLine.renderOrder = 6; scene.add(FX.offLine);
  // the referee's card and the assistants' flags
  FX.card = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.09), new THREE.MeshBasicMaterial({ color: 0xf4d21d, side: THREE.DoubleSide, toneMapped: false })); FX.card.position.set(0, -0.1, 0.03); FX.card.visible = false;
  for (let k = 0; k < 2; k++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    pole.position.y = -0.2; g.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.24), new THREE.MeshStandardMaterial({ color: k ? 0xff5a2a : 0xf4d21d, side: THREE.DoubleSide, roughness: 0.8 }));
    fl.position.set(0.17, -0.38, 0); g.add(fl);
    FX.flag.push(g);
  }
  // soft shadows from each floodlight plus a contact blob
  const blob = texBlob();
  const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-PI / 2);
  const N = NRIG * 5 + 1; sg.setAttribute('instA', new THREE.InstancedBufferAttribute(new Float32Array(N), 1));
  const sm = patchAlpha(new THREE.MeshBasicMaterial({ map: blob, color: 0x02050a, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  FX.shadow = new THREE.InstancedMesh(sg, sm, N); FX.shadow.frustumCulled = false; FX.shadow.renderOrder = 1; FX.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(FX.shadow);
  const pg = new THREE.PlaneGeometry(1, 1); pg.setAttribute('instA', new THREE.InstancedBufferAttribute(new Float32Array(PT.length), 1));
  const pm = patchAlpha(new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
  FX.puff = new THREE.InstancedMesh(pg, pm, PT.length); FX.puff.frustumCulled = false; FX.puff.count = 0; FX.puff.renderOrder = 8; scene.add(FX.puff);
  FX.puff.setColorAt(0, _col.set('#ffffff'));
  FX.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), PT.length); FX.conf.frustumCulled = false; FX.conf.count = 0; FX.conf.renderOrder = 8; scene.add(FX.conf);
  FX.conf.setColorAt(0, _col.set('#ffffff'));
  void Q;
}
function setBall(gold) {
  if (!FX.ballMat) return;
  if (gold && !FX.goldTex) FX.goldTex = texBallGold();
  const t = gold ? FX.goldTex : FX.ballTex;
  if (FX.ballMat.map !== t) { FX.ballMat.map = t; FX.ballMat.metalness = gold ? 0.55 : 0; FX.ballMat.roughness = gold ? 0.3 : 0.42; FX.ballMat.needsUpdate = true; }
}
function texBallGold() {
  return canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe7a0'); gr.addColorStop(0.5, '#e0b14a'); gr.addColorStop(1, '#b07f22');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,60,10,.6)'; g.lineWidth = 3;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.bezierCurveTo(i * w / 8 + 40, h * 0.3, i * w / 8 - 40, h * 0.7, i * w / 8, h); g.stroke(); }
  }, { aniso: 2 });
}
function markAt(x, y, kind) {
  if (!FX.marks.length) return;
  let k = FX.marks[0]; for (const q of FX.marks) if (q.age > k.age) k = q;
  k.age = 0; k.m.position.set(x, 0.4, y); k.m.material.color.set(kind === 0 ? '#59e0ff' : kind === 1 ? '#ff9a3c' : '#ff5fa8'); k.m.visible = true;
}

const UPD = { speed: 0 }, CRU = { look: null };
const DO1 = { count: 2.2, vel: [0, 40, 0], color: '#3f7d43' }, DO2 = { count: 0.9, vel: [0, 0, 0], color: '#9fb59a', size: 0.8 }, DO3 = { count: 1, vel: [0, 0, 0], color: '#a9c0a2', size: 0.55, life: 0.6 };
const SHOWN = new Array(NRIG).fill(false);
const FRUS = new THREE.Frustum(), _sph = new THREE.Sphere(new THREE.Vector3(), 70), _pm = new THREE.Matrix4();
// pose one person from the simulation (a player, or with ent an official)
function posePerson(i, p, dt, snap) {
  const r = RIGS[i], h = r.h;
  if (!h) return;
  // far away: a lighter body, and only every other frame
  const cx = camera.position.x, cz = camera.position.z, dist = hyp(p.x - cx, p.y - cz);
  const lodWant = PERF.level >= 2 ? (dist > 2400 ? 'far' : 'mid') : dist < 900 ? 'full' : dist < 2400 ? 'mid' : 'far';
  if (lodWant !== h.lod && !W3.lodBusy) { h.setLod(lodWant); W3.lodBusy = true; }
  // off screen: only the position moves; the body catches up when it is seen again
  _sph.center.set(p.x, 30, p.y);
  if (!snap && !FRUS.intersectsSphere(_sph)) { r.acc = Math.min(0.3, r.acc + dt); r.root.position.set(p.x, 0, p.y); return; }
  if (!snap && ((dist > 1700 && PERF.level >= 1) || (dist > 1100 && PERF.level >= 3))) { r.acc += dt; if ((W3.tick & 1) !== r.odd) return; }
  dt = Math.min(0.3, dt + r.acc); r.acc = 0;
  const target = Math.atan2(p.fx, p.fy);
  let d = target - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  r.yaw = snap ? target : r.yaw + d * Math.min(1, dt * 12);
  r.root.rotation.y = r.yaw;
  r.root.position.set(p.x, 0, p.y);
  if (r.next) { r.wait -= dt; if (r.wait <= 0) { h.play(r.next, r.nextO || undefined); r.next = null; } }
  const rep = S.replay && S.replay.on;
  const gk = p.role === 'GK', b = S.ball;
  const holding = !rep && b.owner === p && (b.held || (gk && p.holdT > 0));
  const diving = rep ? p.rDive : p.diving;
  const want = diving ? '' : holding ? 'carry' : gk && !rep && S.phase === 'play' && !b.owner && hyp(b.x - p.x, b.y - p.y) < 500 && hyp(p.vx, p.vy) < 60 ? 'crouch' : '';
  if (want !== r.held) { if (r.held) h.stop(r.held); if (want) h.play(want, want === 'crouch' ? { intensity: 0.55 } : undefined); r.held = want; }
  if (diving && r.state !== 'dive') {
    const left = p.diveDir === 0 ? rnd() < 0.5 : p.diveDir * -Math.sin(r.yaw) > 0;
    h.play('dive', { side: left ? 'left' : 'right', speed: 1.3 });
  }
  r.state = diving ? 'dive' : '';
  if (!rep && p.jumpT > 0.3 && r.jumpSeen <= 0) { h.play('jump', { speed: 1.4, intensity: 0.8 }); r.jumpSeen = 0.8; }
  if (r.jumpSeen > 0) r.jumpSeen -= dt;
  _look.set(b.x, b.z + BR, b.y);
  h.lookAt(_look);
  UPD.speed = hyp(p.vx, p.vy);
  h.update(snap ? 0 : dt, UPD);
}

function syncShadows() {
  const sh = FX.shadow, a = sh.geometry.attributes.instA.array;
  let n = 0;
  const put = (x, z, yaw, lx, lz, al) => {
    _q.setFromAxisAngle(UPV, yaw); _mm.compose(_p.set(x, 0.12, z), _q, _s.set(lx, 1, lz)); sh.setMatrixAt(n, _mm); a[n] = al; n++;
  };
  const towers = W3.cur && W3.cur.towers.length ? W3.cur.towers : null;
  const TH = towers ? towers[0].y : 338;
  const ents = S.players;
  const one = (p, lie) => {
    put(p.x, p.y, 0, lie ? 34 : 27, lie ? 22 : 27, 0.4);
    if (!towers || PERF.level >= 4) return;
    for (let k = 0; k < towers.length; k++) {
      const tw = towers[k], dx = p.x - tw.x, dz = p.y - tw.z, dist = hyp(dx, dz) || 1;
      const hh = lie ? 16 : 49, len = clamp(hh * dist / (TH - hh), 6, 140);
      const ux = dx / dist, uz = dz / dist;
      put(p.x + ux * len * 0.5, p.y + uz * len * 0.5, -Math.atan2(uz, ux), len + 14, lie ? 22 : 20, 0.12 * (1 - clamp(dist / 4000, 0, 1) * 0.6));
    }
  };
  for (let i = 0; i < ents.length; i++) { if (!SHOWN[i]) continue; const p = ents[i]; one(p, p.slideT > 0 || p.stunT > 0.1 || p.diving || p.rDive || p.rSlide); }
  for (let k = 0; k < 3; k++) { if (!SHOWN[REF_I + k]) continue; one(k ? S.ars[k - 1] : S.ref, false); }
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
function rippleNets() {
  const nets = W3.cur ? W3.cur.nets : null; if (!nets) return;
  for (let k = 0; k < 2; k++) {
    const N = nets[k], n = S.nets[k]; if (!N) continue;
    const pos = N.mesh.geometry.attributes.position, a = pos.array, base = N.base;
    if (n.amp > 0.01) {
      const sc = VN.walls ? 1 : 1.7;
      for (let i = 0, v = 0; v < N.wk.length; v++, i += 3) {
        const dy = N.by[v] - n.y, dz = N.bz[v] - n.z, d2 = dy * dy + dz * dz;
        a[i] = base[i] + N.sx * n.amp * 11 * sc * Math.exp(-d2 / (3600 * sc * sc)) * Math.sin(n.t * 26 - Math.sqrt(d2) * 0.07 / sc) * N.wk[v];
        a[i + 1] = base[i + 1]; a[i + 2] = base[i + 2];
      }
      pos.needsUpdate = true; N.live = true;
    } else if (N.live) { a.set(base); pos.needsUpdate = true; N.live = false; }
  }
}

/* ================================================================== camera, projection */
const _pv = new THREE.Vector3(), _pd = new THREE.Vector3();
function projectScreen(x, y, z, out) {
  if (!camera) return false;
  _pv.set(x, z, y).applyMatrix4(camera.matrixWorldInverse);
  if (_pv.z > -1) return false;
  _pv.applyMatrix4(camera.projectionMatrix);
  out.x = (_pv.x * 0.5 + 0.5) * arc.w; out.y = (-_pv.y * 0.5 + 0.5) * arc.h;
  return true;
}
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
  const pen = !!(S && (S.phase === 'penalties'));
  const portrait = pen ? true : h > w * 0.98;
  const f = pen ? 1 : (S ? S.dir[0] : 1);
  if (portrait !== V.portrait || f !== V.f) { setLook(portrait, f); CAM.snap = true; }
  const key = w + 'x' + h;
  if (key !== CAM.key) { CAM.key = key; CAM.snap = true; }
}
const ZOOMW = { tv: 1150, wide: 1600, close: 760 }, ZOOMP = { tv: 540, wide: 760, close: 400 };
function setFov(v) { if (abs(camera.fov - v) > 0.01) { camera.fov = v; camera.updateProjectionMatrix(); } }
function camStep(dt) {
  const w = arc.w, h = arc.h, asp = w / h, b = S.ball;
  const sx = (arc.shakeX || 0) * 0.7, sy = (arc.shakeY || 0) * 0.7;
  const k = VN.walls ? 1 : GH / 70;
  const rs = S.rs;
  const penKick = S.phase === 'penalties' || (S.phase === 'restart' && rs && rs.type === 'pen' && rs.stage === 'ready') || (S.inPen && S.inPen.t < 1.4);
  if (penKick !== CAM.pen) { CAM.pen = penKick; CAM.snap = true; }
  if (penKick) {
    const gx = S.phase === 'penalties' ? HL : rs ? attackX(rs.team) : attackX(S.inPen.team), s = sgn(gx);
    // behind the taker, the whole goal and the ball in shot
    const D = VN.spot + 150 * k, cx = gx - s * D;
    const hf = 2 * Math.atan((asp > 1 ? 2.1 : 1.45) * GH / (D - 20 * k)), vf = clamp(2 * Math.atan(Math.tan(hf / 2) / asp) * 180 / PI, 20, 70);
    setFov(vf);
    camera.position.set(cx + sx, 78 * k + sy, -26 * k * s);
    camera.lookAt(gx - s * 70 * k, 14 * k, 0);
    camera.updateMatrixWorld();
    return;
  }
  if (S.replay && S.replay.on) { replayCam(dt, asp); return; }
  if (S.phase === 'walkout' && S.wk) { walkoutCam(dt, asp); return; }
  const stad = !VN.walls;
  let tx = b.x + clamp(b.vx * 0.2, -90 * k, 90 * k), ty = b.y + clamp(b.vy * 0.2, -90 * k, 90 * k), zm = 1;
  if (S.phase === 'goal' && S.goalP) { const gp = S.goalP.p; tx = gp ? gp.x * 0.7 + b.x * 0.3 : b.x; ty = gp ? gp.y * 0.7 + b.y * 0.3 : b.y; zm = arc.reducedMotion ? 1.1 : 1.3; }
  else if (S.phase === 'restart' && rs && rs.type === 'corner') { tx = lerp(rs.x, attackX(rs.team), 0.15) - sgn(rs.x) * 260; ty = rs.y * 0.85; zm = 0.72; }
  else if (S.phase === 'restart' && rs && rs.type === 'free' && rs.inRange) { tx = lerp(rs.x, attackX(rs.team), 0.4); ty = rs.y * 0.6; }
  else if (S.last30) zm = 1.06;
  if (S.cfg.training) zm = 1.15;
  if (S.demo) zm = 0.9;
  const snap = CAM.snap;
  const kf = snap ? 1 : 1 - Math.exp(-(arc.reducedMotion ? 2.4 : 4.2) * dt);
  if (!stad) {
    // the cage keeps its original framing
    const vfov = V.portrait ? 54 : 36, elevDeg = V.portrait ? 50 : (S.demo ? 22 : 30);
    if (V.portrait) { tx += V.lx * 70; ty += V.ly * 70; tx = clamp(tx, -(HL - 110), HL - 110); ty = clamp(ty, -(HW - 150), HW - 150); }
    else { tx = clamp(tx, -(HL - 240), HL - 240); ty = clamp(ty, -(HW - 170), HW - 170); }
    CAM.tx += (tx - CAM.tx) * kf; CAM.ty += (ty - CAM.ty) * kf;
    CAM.zm += (zm - CAM.zm) * (snap ? 1 : 1 - Math.exp(-2.4 * dt));
    CAM.snap = false;
    const hf = 2 * Math.atan(Math.tan(vfov * PI / 360) * asp);
    const Wd = (V.portrait ? 400 : 900) / CAM.zm;
    const d = clamp((Wd / 2) / Math.tan(hf / 2), 380, 1700);
    const el = elevDeg * PI / 180, dh = d * Math.cos(el), dv = d * Math.sin(el);
    setFov(vfov);
    camera.position.set(CAM.tx - V.lx * dh + sx * V.rx, dv + sy, CAM.ty - V.ly * dh + sx * V.ry);
    camera.lookAt(CAM.tx, 0, CAM.ty);
    camera.updateMatrixWorld();
    return;
  }
  const mode = CAM.mode || 'tv';
  if (V.portrait) {
    // behind the attack, high: the whole width of play across a phone
    tx += V.lx * 160; tx = clamp(tx, -(HL + 60), HL + 60); ty = clamp(ty, -(HW - 140), HW - 140);
    CAM.tx += (tx - CAM.tx) * kf; CAM.ty += (ty - CAM.ty) * kf;
    CAM.zm += (zm - CAM.zm) * (snap ? 1 : 1 - Math.exp(-2.4 * dt));
    CAM.snap = false;
    const vfov = 50, hf = 2 * Math.atan(Math.tan(vfov * PI / 360) * asp);
    const Wd = ZOOMP[mode] / CAM.zm;
    const d = clamp((Wd / 2) / Math.tan(hf / 2), 500, 4200);
    const el = (mode === 'close' ? 38 : 44) * PI / 180, dh = d * Math.cos(el), dv = d * Math.sin(el);
    setFov(vfov);
    camera.position.set(CAM.tx - V.lx * dh + sx * V.rx, dv + sy, CAM.ty - V.ly * dh + sx * V.ry);
    camera.lookAt(CAM.tx, 0, CAM.ty);
    camera.updateMatrixWorld();
    return;
  }
  // the broadcast camera: high on the halfway line in the stand, panning and zooming with play
  tx = clamp(tx, -(HL + 120), HL + 120); ty = clamp(ty, -(HW - 60), HW - 60);
  CAM.tx += (tx - CAM.tx) * kf; CAM.ty += (ty - CAM.ty) * kf;
  CAM.zm += (zm - CAM.zm) * (snap ? 1 : 1 - Math.exp(-2.4 * dt));
  // mounted at the front of the main stand's upper rows, under its roof
  const camH = mode === 'wide' ? 470 : 440, back = HW + 340;
  const px = CAM.tx * (mode === 'close' ? 0.86 : 0.74), pz = -V.ly * back;
  if (snap) { CAM.px = px; CAM.pz = pz; }
  CAM.px += (px - CAM.px) * kf; CAM.pz = pz;
  CAM.snap = false;
  camera.position.set(CAM.px + sx, camH + sy, CAM.pz);
  camera.lookAt(CAM.tx, 0, CAM.ty * 0.92);
  const dist = hyp(CAM.tx - CAM.px, camH, CAM.ty - CAM.pz);
  const wantW = ZOOMW[mode] / CAM.zm;
  const hf = 2 * Math.atan(wantW / 2 / dist), vf = clamp(2 * Math.atan(Math.tan(hf / 2) / asp) * 180 / PI, 9, 60);
  CAM.fov = snap ? vf : CAM.fov + (vf - CAM.fov) * (1 - Math.exp(-3 * dt));
  setFov(CAM.fov);
  camera.updateMatrixWorld();
}
// the goal again: the broadcast angle, then low behind the net, then a high reverse angle
function replayCam(dt, asp) {
  const R = S.replay, b = S.ball, sx = S.lastGoalSx || 1, k = GH / 70;
  if (R.angle === 0) {
    const camH = 440, back = HW + 340, px = b.x * 0.8;
    camera.position.set(px, camH, -V.ly * back); camera.lookAt(b.x, 0, b.y * 0.9);
    const dist = hyp(b.x - px, camH, b.y + V.ly * back), hf = 2 * Math.atan(820 / 2 / dist);
    setFov(clamp(2 * Math.atan(Math.tan(hf / 2) / asp) * 180 / PI, 9, 55));
  } else if (R.angle === 1) {
    // low behind the net, between the goal and the boards
    camera.position.set(sx * (HL + 168), 92, clamp(b.y * 0.35, -200, 200) + 30);
    camera.lookAt(b.x, b.z * 0.6 + 30, b.y);
    setFov(asp > 1 ? 34 : 50);
  } else {
    camera.position.set(b.x * 0.6 - sx * 300, 430, V.ly * (HW + 340));
    camera.lookAt(b.x, 0, b.y);
    const dist = hyp(b.x * 0.4 + sx * 300, 430, b.y - V.ly * (HW + 340)), hf = 2 * Math.atan(700 / 2 / dist);
    setFov(clamp(2 * Math.atan(Math.tan(hf / 2) / asp) * 180 / PI, 9, 55));
  }
  camera.updateMatrixWorld();
  void dt;
}
// the walkout: low on the grass as they come out, then along the line for the anthem
function walkoutCam(dt, asp) {
  const W = S.wk, t = W.t;
  let ly = 0, n = 0;
  for (const p of S.players) { if (W.t >= p.wkT0) { ly += p.y; n++; } }
  ly = n ? ly / n : HW;
  if (t < 5.6) {
    const look = Math.max(ly, W.LY);
    camera.position.set(240, 64, look - 470);
    camera.lookAt(0, 46, look + 20);
    setFov(asp > 1 ? 36 : 56);
  } else {
    const u = clamp((t - 5.6) / 3.8, 0, 1), e = u * u * (3 - 2 * u);
    const x = lerp(-560, 560, e);
    camera.position.set(x, 60, W.LY - (asp > 1 ? 220 : 300));
    camera.lookAt(x * 0.92, 50, W.LY);
    setFov(asp > 1 ? 32 : 52);
  }
  camera.updateMatrixWorld();
  void dt;
}
// A new match: kits, the crowd and the screen in the home side's colours
function syncMatch3D() {
  if (!W3.ready) return;
  showVenue(S.venue);
  applyKits();
  recolorCrowd();
  setBall(arc.choices.ball === 'gold' && !S.demo);
  setSky(arc.choices.sky === 'dusk' && !S.demo);
  FX.snapBall = true;
  W3.screenDirty = true;
  for (const r of RIGS) r.snap = true;
}
function recolorCrowd() {
  const c = W3.cur && W3.cur.crowd; if (!c || !S) return;
  const hk = S.kits[0], ak = S.kits[1];
  c.recolor([hk.c1, hk.c1, hk.c1, hk.c2, ak.c1, ak.c2]);
}

// turf crumbs kicked up by sprinting feet and slides; they rise a little, drift and settle
const DUST = { acc: new Float32Array(NRIG) };
function syncDust(dt, adt) {
  const P = W3.parts;
  if (!P) return;
  if (dt > 0 && PERF.level <= 3) for (let i = 0; i < S.players.length; i++) {
    const p = S.players[i]; if (!SHOWN[i]) continue;
    const sp = hyp(p.vx, p.vy);
    if (p.slideT > 0.1) { DO1.vel[0] = p.vx * 0.35; DO1.vel[2] = p.vy * 0.35; P.emit('debris', p.x + p.slideDX * 16, 1, p.y + p.slideDY * 16, DO1); DO2.vel[0] = p.vx * 0.2; DO2.vel[2] = p.vy * 0.2; P.emit('dust', p.x, 2, p.y, DO2); }
    else if (sp > 190) { DUST.acc[i] += dt * sp / 60; if (DUST.acc[i] > 1) { DUST.acc[i] = 0; DO3.vel[0] = -p.vx * 0.12; DO3.vel[2] = -p.vy * 0.12; P.emit('dust', p.x - p.fx * 8, 1, p.y - p.fy * 8, DO3); } }
  }
  P.update(adt, camera);
}
function syncCrowd(dt) {
  const c = W3.cur && W3.cur.crowd;
  const goal = S.phase === 'goal' ? 0.35 : 0, wk = S.phase === 'walkout' ? 0.5 : 0;
  const ex = S.demo ? 0.12 : clamp(0.08 + S.excite * 0.75 + goal + wk + (S.last30 ? 0.15 : 0), 0, 1);
  if (c) {
    c.excite(ex);
    _look.set(S.ball.x, 0, S.ball.y);
    CRU.look = _look;
    c.update(arc.reducedMotion ? dt * 0.35 : dt, CRU);
  }
  // the painted crowd in the upper rows bounces with the noise
  const sh = W3.cur ? W3.cur.sheets : null;
  if (sh && !arc.reducedMotion) { W3.sheetT = (W3.sheetT || 0) + dt; for (let i = 0; i < sh.length; i++) sh[i].tex.offset.y = sh[i].base + Math.sin(W3.sheetT * 9 + i * 1.7) * 0.006 * ex; }
  if (W3.cur && W3.cur.boards) W3.cur.boards.offset.x = (W3.cur.boards.offset.x + dt * 0.018) % 1;
  if (W3.cur && W3.cur.flags && !arc.reducedMotion) W3.cur.flags.rotation.y = Math.sin(performance.now() / 700) * 0.04;
}

function syncScene(dt, running, adt) {
  const pen = S.phase === 'penalties' && S.pen;
  const snapAll = !!FX.snapBall;
  const rep = S.replay && S.replay.on;
  if (running && !rep) consumeEvents();
  W3.lodBusy = false; W3.tick = (W3.tick || 0) + 1;
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); FRUS.setFromProjectionMatrix(_pm);
  const P = S.players, n = P.length, stad = !VN.walls;
  for (let i = 0; i < NRIG; i++) {
    const r = RIGS[i];
    let show = false, ent = null;
    if (i < REF_I) { ent = P[i]; show = !!ent && (!pen || ent === S.pen.taker || ent === S.pen.keeper) && (!ent.out || (ent.leaving > 0 && ent.leaving < 5)) && !(rep && ent.rOut); }
    else if (i === REF_I) { ent = S.ref; show = stad && !pen && !S.cfg.training; }
    else { ent = S.ars[i - REF_I - 1]; show = stad && !pen && !S.cfg.training; }
    if (i >= n && i < REF_I) show = false;
    show = show && !!r.h;
    SHOWN[i] = show;
    if (r.root) r.root.visible = show;
    if (show) { posePerson(i, ent, adt, r.snap || snapAll); r.snap = false; }
  }
  // the replay plays the strikes again as their frames come round
  if (rep) {
    const R = S.replay;
    for (const e of REC.ev) if (e.f > R.lastF && e.f <= R.f && e.f >= 0) { const r = RIGS[e.i]; if (r && r.h) r.h.play(e.k === 1 ? 'kick' : 'kick', { side: e.i % 2 ? 'right' : 'left', from: 0.3, speed: (e.k ? 1.25 : 1.7) * R.speed, intensity: e.k ? 1 : 0.75 }); }
    R.lastF = R.f;
  }
  if (FX.card) FX.card.visible = FX.cardT > 0;
  if (FX.cardT > 0) FX.cardT -= dt;
  for (let k = 0; k < 2; k++) if (FX.flag[k]) FX.flag[k].visible = stad;
  // ball
  const b = S.ball, bm = FX.ball, by = b.z + BR * 1.08;
  if (snapAll) { FX.px = b.x; FX.pz = b.y; FX.snapBall = false; }
  const ddx = b.x - FX.px, ddz = b.y - FX.pz, dist = hyp(ddx, ddz);
  if (dist > 0.01 && dist < 120) { _ax.set(ddz, 0, -ddx).normalize(); _bq.setFromAxisAngle(_ax, dist / (BR * 1.08)); bm.quaternion.premultiply(_bq); }
  FX.px = b.x; FX.pz = b.y; bm.position.set(b.x, by, b.y);
  bm.visible = !(S.phase === 'walkout');
  // markers
  const cp = !S.demo && S.ctrl >= 0 && !pen && !rep && S.phase !== 'walkout' ? P[S.ctrl] : null;
  if (cp && !cp.out) {
    FX.ring.visible = true; FX.ring.position.set(cp.x, 0.5, cp.y); const pul = 1 + (arc.reducedMotion ? 0 : Math.sin(S.t * 6) * 0.06); FX.ring.scale.set(pul, 1, pul);
    FX.arrow.visible = true; FX.arrow.position.set(cp.x, 66 + (arc.reducedMotion ? 0 : Math.sin(S.t * 6) * 2), cp.y); FX.arrow.rotation.y = S.t * 2;
  } else { FX.ring.visible = false; FX.arrow.visible = false; }
  const pt = S.cfg.training && S.train && S.train.target && S.train.state === 'live' ? S.train.target : S.passTarget;
  if (pt && (S.passT > 0 || S.cfg.training) && pt.team === 0 && !S.demo && !pen && !rep && pt.i !== S.ctrl) { FX.target.visible = true; FX.target.position.set(pt.x, 0.45, pt.y); const ts = stad ? (S.cfg.training ? 2.4 : 1.4) : 1; FX.target.scale.set(ts, 1, ts); } else FX.target.visible = false;
  for (const m of FX.marks) {
    if (m.age >= m.life) { m.m.visible = false; continue; }
    m.age += dt; const k = clamp(m.age / m.life, 0, 1);
    m.m.visible = k < 1; m.m.scale.setScalar(1 + k * 2.6); m.m.material.opacity = (1 - k) * 0.9;
  }
  // set-piece aim
  const rs = S.rs;
  if (SP.show && rs && rs.stage === 'ready' && rs.team === 0 && SP.kind !== 'goal' && !S.demo) {
    FX.aim.visible = true; FX.aim.position.set(b.x, 0.6, b.y); FX.aim.rotation.y = -Math.atan2(SP.ay, SP.ax);
    const s = VN.walls ? 0.6 : 1.4; FX.aim.scale.set(s, 1, s);
  } else FX.aim.visible = false;
  // the offside line, briefly
  if (FX.offT > 0 && stad) { FX.offT -= dt; FX.offLine.visible = true; FX.offLine.position.set(FX.offX, 0.5, 0); FX.offLine.scale.set(1, 1, HW * 2); FX.offLine.material.opacity = clamp(FX.offT, 0, 1) * 0.8; }
  else FX.offLine.visible = false;
  rippleNets();
  syncShadows();
  syncParticles();
  syncCrowd(adt);
  syncDust(dt, adt);
  W3.sky.position.copy(camera.position);
  // the stadium's key light follows the play so its shadows stay sharp where the camera looks
  if (stad) { const kl = W3.key; kl.target.position.set(CAM.tx, 0, CAM.ty); kl.position.set(CAM.tx + 900, 2600, CAM.ty + 650); kl.target.updateMatrixWorld(); }
  const cur = W3.cur;
  if (cur && cur.fence) for (const f of cur.fence) f.grp.visible = f.nx * (camera.position.x - f.mx) + f.nz * (camera.position.z - f.mz) > -10;
  if (cur && cur.redLights) { const bl = Math.sin(performance.now() / 420) > 0; cur.redLights[0].visible = bl; cur.redLights[1].visible = !bl; }
  if (W3.screenDirty && cur && cur.screen) drawScreen();
}

/* ================================================================== quality */
const PERF = { ema: 16, n: 0, level: 0, scale: 1, skip: 1, tick: 0, lock: false };
function applyQuality(level) {
  W3.level = level;
  const sc = [1, 0.85, 0.7, 0.55, 0.45, 0.34][level];
  PERF.scale = sc; PERF.skip = level >= 5 ? 3 : level >= 4 ? 2 : 1;
  renderer.setPixelRatio(arc.dpr * sc);
  renderer.setSize(arc.w, arc.h, false);
  const key = W3.key;
  if (level >= 1 && key.shadow.mapSize.x > 1024) { key.shadow.mapSize.set(1024, 1024); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
  key.castShadow = level < 2;
  for (const k in W3.venues) {
    const v = W3.venues[k];
    v.cones.forEach((c) => { c.visible = level < 2; }); v.glows.forEach((c) => { c.visible = level < 2; });
    if (v.crowd) v.crowd.mesh.count = Math.ceil(v.crowd.count * (k === 'stadium' ? [1, 0.7, 0.48, 0.3, 0.18, 0.12][level] : [1, 1, 1, 0.7, 0.5, 0.35][level]));
  }
  W3.rim.visible = level < 3;
  // the light tiers: no city behind the stands, and the pitch without its fibre relief or costly filtering
  const st = W3.venues.stadium;
  if (st) {
    if (st.skyline) st.skyline.visible = level < 4;
    const pm = st.pitchMat, lite = level >= 3;
    if (pm && !!pm.userData.lite !== lite) { pm.userData.lite = lite; pm.bumpMap = lite ? null : st.grain; pm.map.anisotropy = lite ? 1 : TEXQ.aniso; pm.map.needsUpdate = true; pm.needsUpdate = true; }
  }
  if (W3.vfx) W3.vfx.setQuality(level <= 0 ? 3 : level === 1 ? 2 : level === 2 ? 1 : 0);
  if (W3.env) scene.environment = level >= 3 ? null : W3.env.texture;
  for (const r of RIGS) r.wantLod = level >= 2 ? 'mid' : 'full';
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
function flashTrail(kind) { TRAIL.pts = PATH.pts.slice(); TRAIL.t = performance.now(); TRAIL.kind = kind; }
function plate(g, x, y, w, h, r, fill) { rrPath(g, x, y, w, h, r); g.fillStyle = fill || 'rgba(15,13,10,.9)'; g.fill(); g.strokeStyle = 'rgba(251,245,236,.16)'; g.lineWidth = 1; g.stroke(); }
// club crests, drawn once each: a shape in the first colour, a symbol in the second
const CREST = {};
function crestCanvas(c) {
  if (CREST[c]) return CREST[c];
  const T = TEAMS[c], cv = document.createElement('canvas'); cv.width = cv.height = 96;
  const g = cv.getContext('2d'), r = 40, cx = 48, cy = 48;
  g.lineJoin = 'round'; g.lineCap = 'round';
  const shape = () => {
    g.beginPath();
    const s = T.crest[0];
    if (s === 'round') g.arc(cx, cy, r, 0, TAU);
    else if (s === 'diamond') { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); }
    else if (s === 'hex') { for (let k = 0; k < 6; k++) { const a = k / 6 * TAU - PI / 2; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); }
    else { g.moveTo(cx - r * 0.85, cy - r * 0.85); g.lineTo(cx + r * 0.85, cy - r * 0.85); g.lineTo(cx + r * 0.85, cy + r * 0.05); g.quadraticCurveTo(cx + r * 0.8, cy + r * 0.75, cx, cy + r); g.quadraticCurveTo(cx - r * 0.8, cy + r * 0.75, cx - r * 0.85, cy + r * 0.05); g.closePath(); }
  };
  shape(); g.fillStyle = T.c1; g.fill(); g.lineWidth = 6; g.strokeStyle = T.c2; g.stroke();
  g.save(); shape(); g.clip();
  g.strokeStyle = T.c2; g.fillStyle = T.c2; g.lineWidth = 5;
  const sym = T.crest[1];
  if (sym === 'wave') { for (let k = -1; k <= 1; k++) { g.beginPath(); for (let x = -30; x <= 30; x += 2) { const y = cy + k * 13 + Math.sin(x / 8) * 5; if (x === -30) g.moveTo(cx + x, y); else g.lineTo(cx + x, y); } g.stroke(); } }
  else if (sym === 'falcon') { g.beginPath(); g.moveTo(cx - 28, cy - 4); g.quadraticCurveTo(cx - 12, cy - 18, cx, cy + 4); g.quadraticCurveTo(cx + 12, cy - 18, cx + 28, cy - 4); g.stroke(); g.beginPath(); g.moveTo(cx, cy + 4); g.lineTo(cx - 6, cy + 20); g.lineTo(cx + 6, cy + 20); g.closePath(); g.fill(); }
  else if (sym === 'stag') { g.beginPath(); g.moveTo(cx, cy + 22); g.lineTo(cx, cy - 2); g.moveTo(cx, cy - 2); g.lineTo(cx - 18, cy - 22); g.moveTo(cx - 10, cy - 12); g.lineTo(cx - 22, cy - 8); g.moveTo(cx, cy - 2); g.lineTo(cx + 18, cy - 22); g.moveTo(cx + 10, cy - 12); g.lineTo(cx + 22, cy - 8); g.stroke(); g.beginPath(); g.arc(cx, cy + 10, 8, 0, TAU); g.fill(); }
  else if (sym === 'rhino') { g.beginPath(); g.ellipse(cx + 4, cy + 8, 22, 12, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(cx - 18, cy + 2); g.lineTo(cx - 26, cy - 18); g.lineTo(cx - 10, cy - 2); g.closePath(); g.fill(); }
  else if (sym === 'storm') { g.beginPath(); for (let a = 0; a < 4.2 * PI; a += 0.2) { const rr = 3 + a * 2.1; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
  else if (sym === 'wolf') { g.beginPath(); g.moveTo(cx - 20, cy - 20); g.lineTo(cx - 8, cy - 4); g.lineTo(cx + 8, cy - 4); g.lineTo(cx + 20, cy - 20); g.lineTo(cx + 16, cy + 6); g.lineTo(cx, cy + 22); g.lineTo(cx - 16, cy + 6); g.closePath(); g.fill(); g.fillStyle = T.c1; g.beginPath(); g.arc(cx - 7, cy + 2, 3, 0, TAU); g.arc(cx + 7, cy + 2, 3, 0, TAU); g.fill(); }
  else if (sym === 'river') { for (let k = -1; k <= 1; k++) { g.beginPath(); for (let y = -30; y <= 30; y += 2) { const x = cx + k * 12 + Math.sin(y / 7 + k) * 4; if (y === -30) g.moveTo(x, cy + y); else g.lineTo(x, cy + y); } g.stroke(); } }
  else { g.beginPath(); g.moveTo(cx, cy - 22); g.lineTo(cx + 16, cy - 2); g.lineTo(cx, cy + 14); g.lineTo(cx - 16, cy - 2); g.closePath(); g.fill(); g.beginPath(); g.moveTo(cx, cy + 14); g.quadraticCurveTo(cx + 10, cy + 22, cx - 4, cy + 30); g.stroke(); }
  g.restore();
  CREST[c] = cv;
  return cv;
}
function drawCrest(g, x, y, r, c) { g.drawImage(crestCanvas(c), x - r, y - r, r * 2, r * 2); }
function periodLabel() {
  if (S.phase === 'penalties') return 'PENS';
  if (S.cfg.mode === 'shootout') return 'PENS';
  return S.period === 1 ? '1ST' : S.period === 2 ? '2ND' : S.period === 3 ? 'ET 1' : 'ET 2';
}
// the broadcast scoreboard: top left on a wide screen, top centre on a phone
function drawScoreboard(g, w) {
  if (S.cfg.training) return;
  const th = S.teams[0], ta = S.teams[1], port = V.portrait || w < 560;
  const bw = 236, x = port ? w / 2 - (bw + 64) / 2 : 12, y = 8, hh = 30;
  plate(g, x, y, bw, hh, 6, 'rgba(14,16,22,.92)');
  g.fillStyle = S.kits[S.hostTeam === 0 ? 0 : 1].c1; g.fillRect(x + 4, y + 4, 4, hh - 8);
  g.fillStyle = S.kits[S.hostTeam === 1 ? 0 : 1].c1; g.fillRect(x + bw - 8, y + 4, 4, hh - 8);
  drawCrest(g, x + 22, y + hh / 2, 10, S.club[0]); drawCrest(g, x + bw - 26, y + hh / 2, 10, S.club[1]);
  g.textBaseline = 'middle'; g.font = '700 13px ' + F_MONO; g.fillStyle = '#fbf5ec';
  g.textAlign = 'left'; g.fillText(th.abbr, x + 36, y + hh / 2 + 1);
  g.textAlign = 'right'; g.fillText(ta.abbr, x + bw - 40, y + hh / 2 + 1);
  // score box
  const sx = x + bw / 2;
  g.fillStyle = 'rgba(251,245,236,.95)'; rrPath(g, sx - 30, y + 4, 60, hh - 8, 4); g.fill();
  g.fillStyle = '#121418'; g.font = '800 16px ' + F_UI; g.textAlign = 'center';
  g.fillText(S.score[0] + ' - ' + S.score[1], sx, y + hh / 2 + 1);
  // clock
  const cx = x + bw + 2;
  plate(g, cx, y, 62, hh, 6, 'rgba(14,16,22,.92)');
  g.fillStyle = '#c9a96e'; g.font = '700 12px ' + F_MONO; g.textAlign = 'center';
  const clk = S.phase === 'penalties' || S.cfg.mode === 'shootout' ? 'PENS' : matchClock();
  g.fillText(clk, cx + 31, y + 12);
  g.font = '600 9px ' + F_MONO; g.fillStyle = '#a39e94'; g.fillText(clk === 'PENS' ? 'SHOOTOUT' : periodLabel(), cx + 31, y + 23);
  if (S.added && S.phase !== 'penalties') {
    plate(g, cx + 64, y, 30, hh, 6, 'rgba(14,16,22,.92)');
    g.fillStyle = '#7dff8a'; g.font = '700 12px ' + F_MONO; g.fillText('+' + S.added, cx + 79, y + hh / 2 + 1);
  }
  // red cards next to the side
  for (let t = 0; t < 2; t++) for (let k = 0; k < S.stats.rc[t]; k++) { g.fillStyle = '#e2262f'; g.fillRect(x + (t ? bw - 52 - k * 6 : 48 + k * 6) + (t ? -10 : 0), y + hh + 3, 4, 7); }
}
// the fourth official's board: added time in green digits
function drawBoard(g, w, h) {
  if (!(S.boardT > 0) || VN.walls) return;
  const a = clamp(Math.min((4.5 - S.boardT) / 0.3, S.boardT / 0.4), 0, 1);
  g.save(); g.globalAlpha = a;
  const bw = 86, bh = 54, x = w - bw - 14, y = h * 0.32;
  plate(g, x, y, bw, bh, 6, 'rgba(10,12,16,.95)');
  g.fillStyle = '#c9a96e'; g.font = '600 9px ' + F_MONO; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ADDED TIME', x + bw / 2, y + 12);
  g.fillStyle = '#7dff8a'; g.font = '800 26px ' + F_MONO; g.fillText('+' + S.added, x + bw / 2, y + 35);
  g.restore();
}
function drawNamePlate(g, w) {
  if (S.demo || S.ctrl < 0 || S.phase === 'penalties' || S.phase === 'walkout' || (S.replay && S.replay.on)) return;
  const p = S.players[S.ctrl]; if (!p) return;
  const nw = 176, port = V.portrait || w < 560, x = port ? w / 2 - nw / 2 : 12, y = port ? 48 : 46;
  plate(g, x, y, nw, 22, 8, 'rgba(15,13,10,.72)');
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = '600 11px ' + F_UI; g.fillStyle = '#ffd23d';
  g.fillText(String(p.num), x + 8, y + 11.5);
  g.fillStyle = '#fbf5ec'; g.fillText(p.name, x + 26, y + 11.5);
  g.fillStyle = '#a39e94'; g.font = '600 9px ' + F_MONO; g.fillText(p.role, x + 112, y + 11.5);
  const bw = 34, bx = x + nw - bw - 8;
  g.fillStyle = 'rgba(251,245,236,.15)'; rrPath(g, bx, y + 8, bw, 6, 3); g.fill();
  g.fillStyle = p.tired ? '#ff4d1f' : p.stam < 0.35 ? '#ff8a3d' : '#c9a96e'; rrPath(g, bx, y + 8, Math.max(2, bw * p.stam), 6, 3); g.fill();
}
function drawMini(g, w) {
  if (S.phase === 'penalties' || S.phase === 'walkout' || (S.replay && S.replay.on) || S.cfg.training) return;
  const portrait = V.portrait, mw = portrait ? 46 : 96, mh = portrait ? 72 : 62, x = w - mw - 10, y = 8;
  plate(g, x - 3, y - 3, mw + 6, mh + 6, 7, 'rgba(15,13,10,.6)');
  g.fillStyle = 'rgba(38,128,70,.55)'; g.fillRect(x, y, mw, mh);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1);
  g.beginPath();
  if (portrait) { g.moveTo(x, y + mh / 2); g.lineTo(x + mw, y + mh / 2); } else { g.moveTo(x + mw / 2, y); g.lineTo(x + mw / 2, y + mh); }
  g.stroke();
  const LX = HL + 15, LY = HW + 15;
  const mp = (wx, wy) => {
    const u = uOf(wx, wy), v = vOf(wx, wy);
    if (portrait) { TMP.x = x + (u / LY * 0.5 + 0.5) * mw; TMP.y = y + (v / LX * 0.5 + 0.5) * mh; } else { TMP.x = x + (u / LX * 0.5 + 0.5) * mw; TMP.y = y + (v / LY * 0.5 + 0.5) * mh; }
  };
  const P = S.players;
  for (let i = 0; i < P.length; i++) {
    const p = P[i]; if (p.out) continue; mp(p.x, p.y);
    g.fillStyle = S.kits[p.team === S.hostTeam ? 0 : 1].c1; g.beginPath(); g.arc(TMP.x, TMP.y, p.i === S.ctrl ? 2.6 : 1.9, 0, TAU); g.fill();
    if (p.i === S.ctrl) { g.strokeStyle = '#ffd23d'; g.lineWidth = 1; g.stroke(); }
  }
  mp(S.ball.x, S.ball.y); g.fillStyle = '#fff'; g.beginPath(); g.arc(TMP.x, TMP.y, 1.8, 0, TAU); g.fill();
}
function drawSay(g, w, h) {
  if (!S.say) return;
  const q = S.say, a = clamp(Math.min(q.age / 0.2, (q.life - q.age) / 0.4), 0, 1);
  g.save(); g.globalAlpha = a;
  g.font = 'italic 500 15px ' + F_DISP; const tw = Math.min(w - 24, g.measureText(q.text).width + 28);
  const port = V.portrait || w < 560, y = port ? 82 : 10;
  plate(g, w / 2 - tw / 2, y, tw, 28, 14, 'rgba(15,13,10,.8)');
  g.fillStyle = '#fbf5ec'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(q.text, w / 2, y + 14.5, tw - 16);
  g.restore();
}
function drawBand(g, w, h) {
  const B = S.band; if (!B) return;
  const a = clamp(Math.min(B.t / 0.25, (3.4 - B.t) / 0.4), 0, 1);
  g.save(); g.globalAlpha = a;
  const bw = Math.min(w - 24, 300), x = w / 2 - bw / 2, y = h * 0.62;
  plate(g, x, y, bw, 44, 10, 'rgba(14,16,22,.94)');
  g.fillStyle = B.kind === 'yellow' ? '#f4d21d' : '#e2262f'; rrPath(g, x + 12, y + 8, 20, 28, 3); g.fill();
  g.fillStyle = '#fbf5ec'; g.font = '700 14px ' + F_UI; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(B.name, x + 44, y + 16);
  g.fillStyle = '#a39e94'; g.font = '600 10px ' + F_MONO;
  g.fillText((B.kind === 'yellow' ? 'YELLOW CARD' : B.second ? 'SECOND YELLOW, SENT OFF' : 'RED CARD, SENT OFF') + '  ' + S.teams[B.team].abbr, x + 44, y + 31);
  g.restore();
}
function drawOverheadName(g) {
  if (S.demo || S.ctrl < 0 || S.phase === 'penalties' || S.phase === 'walkout' || (S.replay && S.replay.on)) return;
  const p = S.players[S.ctrl]; if (!p || p.out || !projectScreen(p.x, p.y, 62, PJ)) return;
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
function hintY(h) { const gest = arc.touchMode && arc.touchStyle !== 'pads'; return h - (arc.touchMode ? (gest ? 122 : arc.hudPad().bottom + 8) : 78); }
function hintBox(g, w, h, text, sub) {
  g.font = '600 11px ' + F_MONO;
  const bw = Math.min(w - 20, Math.max(g.measureText(text).width, sub ? g.measureText(sub).width : 0) + 30), by = hintY(h);
  plate(g, w / 2 - bw / 2, by - 6, bw, sub ? 42 : 28, 10, 'rgba(15,13,10,.8)');
  g.fillStyle = '#fbf5ec'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, by + 8, bw - 14);
  if (sub) { g.fillStyle = '#ffd23d'; g.fillText(sub, w / 2, by + 23, bw - 14); }
}
// the reticle on the goal mouth for a free kick or penalty, with the power bar
function drawReticle(g, gx, aimY, aimH, charge) {
  if (!projectScreen(gx, aimY, aimH, PJ)) return;
  g.strokeStyle = '#ffd23d'; g.lineWidth = 2; const r = 9;
  g.beginPath(); g.arc(PJ.x, PJ.y, r, 0, TAU); g.moveTo(PJ.x - r * 1.6, PJ.y); g.lineTo(PJ.x - r * 0.5, PJ.y); g.moveTo(PJ.x + r * 1.6, PJ.y); g.lineTo(PJ.x + r * 0.5, PJ.y); g.moveTo(PJ.x, PJ.y - r * 1.6); g.lineTo(PJ.x, PJ.y - r * 0.5); g.moveTo(PJ.x, PJ.y + r * 0.5); g.lineTo(PJ.x, PJ.y + r * 1.6); g.stroke();
  if (charge > 0) {
    const bw = 60, bx = PJ.x - bw / 2, by = PJ.y + 20;
    g.fillStyle = 'rgba(15,13,10,.7)'; rrPath(g, bx - 2, by - 2, bw + 4, 10, 5); g.fill();
    g.fillStyle = charge > 0.92 ? '#ff4d1f' : '#ffb736'; rrPath(g, bx, by, Math.max(3, bw * charge), 6, 3); g.fill();
  }
}
function drawSetPiece(g, w, h) {
  const rs = S.rs; if (!rs || S.demo || S.phase !== 'restart') return;
  const gest = arc.touchMode && arc.touchStyle !== 'pads';
  if (rs.stage !== 'ready') {
    const names = { throw: 'THROW-IN', corner: 'CORNER', goalkick: 'GOAL KICK', free: rs.direct ? 'FREE KICK' : 'INDIRECT FREE KICK', pen: 'PENALTY', kickoff: 'KICK-OFF' };
    if (rs.type !== 'kickoff') hintBox(g, w, h, names[rs.type] + '  |  ' + S.teams[rs.team].abbr);
    return;
  }
  if (rs.humanKeeper) { hintBox(g, w, h, gest ? 'KEEPER: SLIDE ALONG THE LINE, TAP A SIDE TO DIVE' : 'KEEPER: LEFT / RIGHT MOVE, J THEN A SIDE TO DIVE'); return; }
  if (rs.team !== 0) return;
  const goalAim = rs.type === 'pen' || (rs.type === 'free' && rs.inRange && rs.direct);
  if (goalAim) {
    drawReticle(g, attackX(rs.team), rs.aimY, rs.aimH, S.charge);
    hintBox(g, w, h, gest ? 'DRAG TO AIM, SWIPE TO SHOOT' : 'AIM WITH THE STICK, HOLD K TO POWER', rs.type === 'free' ? (gest ? 'TAP A MATE TO PASS INSTEAD' : 'J PASS  |  U CROSS INSTEAD') : '');
    return;
  }
  const t = { throw: gest ? 'TAP A MATE TO THROW  |  SWIPE FOR A LONG ONE' : 'J THROW TO A MATE  |  U LONG THROW', corner: gest ? 'SWIPE TO CROSS  |  TAP A MATE FOR A SHORT ONE' : 'U CROSS  |  J SHORT  |  STICK AIMS', goalkick: gest ? 'TAP A MATE  |  SWIPE TO KICK LONG' : 'J SHORT  |  U LONG  |  STICK AIMS', free: gest ? 'TAP A MATE  |  SWIPE TO LOFT IT' : 'J PASS  |  U LOFT  |  I THROUGH', kickoff: '' }[rs.type];
  if (t) hintBox(g, w, h, t);
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
  if (pen.stage === 'aim' && pen.team === 0 && !S.demo) {
    drawReticle(g, HL, pen.aimY, pen.aimH, pen.charge);
    hintBox(g, w, h, gest ? 'SWIPE TO SHOOT, FAST IS HARD' : 'AIM, THEN HOLD K TO SHOOT');
  } else if (pen.stage === 'aim' && pen.team === 1 && !S.demo) {
    hintBox(g, w, h, gest ? 'KEEPER: TAP LEFT, MIDDLE OR RIGHT' : 'KEEPER: LEFT, UP OR RIGHT TO DIVE');
  }
}
function drawWalkout(g, w, h) {
  const W = S.wk; if (!W) return;
  const a = clamp(Math.min(W.t / 0.6, (WK_END - 0.8 - W.t) / 0.5), 0, 1);
  g.save(); g.globalAlpha = a;
  const bw = Math.min(w - 24, 380), x = 12, y = h - (arc.touchMode ? 190 : 150);
  plate(g, x, y, bw, 64, 8, 'rgba(14,16,22,.92)');
  g.fillStyle = '#e2262f'; rrPath(g, x + 10, y + 10, 40, 16, 3); g.fill();
  g.fillStyle = '#fff'; g.font = '800 10px ' + F_MONO; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LIVE', x + 30, y + 18.5);
  g.textAlign = 'left'; g.fillStyle = '#c9a96e'; g.font = '600 10px ' + F_MONO;
  g.fillText((S.cfg.mode === 'cup' ? CUPNAME + ', ' + S.cfg.label : S.cfg.mode === 'league' ? LEAGUE + ', ' + S.cfg.label : 'Friendly').toUpperCase(), x + 58, y + 18.5, bw - 66);
  drawCrest(g, x + 24, y + 44, 12, S.club[0]); drawCrest(g, x + bw - 24, y + 44, 12, S.club[1]);
  g.fillStyle = '#fbf5ec'; g.font = '700 14px ' + F_UI; g.textAlign = 'center';
  g.fillText(S.teams[0].name + '  v  ' + S.teams[1].name, x + bw / 2, y + 44, bw - 80);
  g.font = '500 11px ' + F_UI; g.fillStyle = '#a39e94';
  g.fillText(W.anthem ? 'The ' + S.teams[S.hostTeam].short + ' anthem, ' + TEAMS[S.club[S.hostTeam]].ground : 'Live from ' + TEAMS[S.club[S.hostTeam]].ground, x + bw / 2, y + 58, bw - 20);
  g.restore();
  g.font = '600 10px ' + F_MONO; g.textAlign = 'right'; g.fillStyle = 'rgba(251,245,236,.7)';
  g.fillText(arc.touchMode ? 'TAP TO SKIP' : 'PRESS ANY KEY TO SKIP', w - 14, h - 18);
}
function drawReplay(g, w, h) {
  const R = S.replay; if (!R || !R.on) return;
  const x = 14, y = 50;
  plate(g, x, y, 128, 26, 6, 'rgba(14,16,22,.92)');
  g.fillStyle = '#e2262f'; rrPath(g, x + 6, y + 6, 14, 14, 3); g.fill();
  g.fillStyle = '#fbf5ec'; g.font = '800 12px ' + F_MONO; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('REPLAY', x + 28, y + 13.5);
  g.fillStyle = '#a39e94'; g.font = '600 10px ' + F_MONO; g.fillText(['BROADCAST', 'BEHIND THE GOAL', 'REVERSE ANGLE'][R.angle] + (R.speed < 0.6 ? '  SLOW' : ''), x, y + 40);
  g.textAlign = 'right'; g.fillStyle = 'rgba(251,245,236,.7)'; g.fillText(arc.touchMode ? 'TAP TO SKIP' : 'SPACE TO SKIP', w - 14, h - 18);
}
function drawBreak(g, w, h) {
  const B = S.brk; if (!B || B.kind === 'full' || B.t > 2.4) return;
  const a = clamp(Math.min(B.t / 0.3, (2.4 - B.t) / 0.4), 0, 1);
  g.save(); g.globalAlpha = a;
  const bw = Math.min(w - 24, 300), x = w / 2 - bw / 2, y = h * 0.3;
  plate(g, x, y, bw, 108, 12, 'rgba(14,16,22,.94)');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#c9a96e'; g.font = '600 11px ' + F_MONO; g.fillText(B.kind === 'half' ? 'HALF TIME' : B.kind === 'et' ? 'EXTRA TIME' : 'EXTRA TIME, HALF TIME', w / 2, y + 16);
  g.fillStyle = '#fbf5ec'; g.font = '700 22px ' + F_UI; g.fillText(S.teams[0].abbr + '  ' + S.score[0] + ' - ' + S.score[1] + '  ' + S.teams[1].abbr, w / 2, y + 42);
  const st = S.stats, tot = st.poss[0] + st.poss[1], pa = Math.round(st.poss[0] / tot * 100);
  g.font = '500 12px ' + F_UI; g.fillStyle = '#a39e94';
  g.fillText('Possession ' + pa + '% - ' + (100 - pa) + '%', w / 2, y + 68);
  g.fillText('Shots ' + st.shots[0] + ' - ' + st.shots[1] + '   On target ' + st.sot[0] + ' - ' + st.sot[1], w / 2, y + 88);
  g.restore();
}
function drawTraining(g, w, h) {
  const T = S.train; if (!T || T.state === 'done') return;
  const dr = DRILLS[Math.min(T.d, DRILLS.length - 1)];
  const bw = Math.min(w - 24, 280), x = (V.portrait || w < 560) ? w / 2 - bw / 2 : 12, y = 8;
  plate(g, x, y, bw, 40, 8, 'rgba(14,16,22,.92)');
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#c9a96e'; g.font = '600 10px ' + F_MONO;
  g.fillText('TRAINING  ' + (T.d + 1) + '/' + DRILLS.length + '  ' + dr.name.toUpperCase(), x + 12, y + 13);
  g.fillStyle = '#fbf5ec'; g.font = '600 12px ' + F_UI;
  g.fillText('Attempt ' + Math.min(T.n + 1, dr.n) + ' of ' + dr.n, x + 12, y + 29);
  g.textAlign = 'right'; g.font = '800 18px ' + F_UI; g.fillStyle = '#ffd23d'; g.fillText(String(T.score), x + bw - 12, y + 22);
  if (T.state === 'result' && T.msg) {
    const a = clamp(Math.min(T.t / 0.15, (1.5 - T.t) / 0.3), 0, 1);
    g.save(); g.globalAlpha = a; g.font = '800 22px ' + F_UI; g.textAlign = 'center';
    const tw = g.measureText(T.msg).width + 40;
    plate(g, w / 2 - tw / 2, h * 0.36, tw, 44, 12, 'rgba(14,16,22,.9)');
    g.fillStyle = T.msg.indexOf('+') >= 0 ? '#7dff8a' : '#ff8a6a'; g.fillText(T.msg, w / 2, h * 0.36 + 23);
    g.restore();
  }
}
function drawTouchHint(g, w, h) {
  if (S.demo || !arc.touchMode || arc.touchStyle !== 'gesture' || S.phase !== 'play' || S.t > 10 || (CUP && CUP.idx > 0) || S.cfg.training) return;
  const a = clamp(Math.min(S.t / 0.4, (10 - S.t) / 0.8), 0, 1) * 0.92;
  g.save(); g.globalAlpha = a;
  hintBox(g, w, h, 'DRAG TO RUN  |  DRAG FAR TO SPRINT', 'TAP A MATE TO PASS  |  SWIPE AT GOAL TO SHOOT');
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
  // a software renderer builds everything on the frame after the menu card has painted (see prebuild)
  if (W3.soft && !W3.pre && a.frame >= 1) { W3.pre = true; prebuild(); }
  // the build queue and the people: a little each frame, never a long stall
  if (a.frame > 3) { if (W3.q.length && (a.frame & 3) === 0) buildTick(); }
  rigTick();
  if (!W3.prepDone && a.frame > 40 && !W3.q.length) prepTick();
  layout(w, h);
  const running = a.state === 'play' || (a.state === 'menu' && S.demo);
  PERF.tick++;
  const rep = !!(S.replay && S.replay.on), cine = rep || S.phase === 'walkout';
  if (POST && cine !== W3.cine) { W3.cine = cine; POST.letterbox(cine ? 1 : 0); POST.handheld(rep); }
  if (PERF.skip <= 1 || PERF.tick % PERF.skip === 0 || PERF.tick < 3) {
    camStep(running ? dtR * PERF.skip : 0);
    syncScene(running ? dtR * PERF.skip : 0, running, a.state === 'pause' ? 0 : dtR * PERF.skip);
    if (W3.vfxWant && !W3.vfx && a.frame > 20) {
      W3.vfxWant = false;
      try { W3.vfx = createVFX(renderer, scene, camera, { quality: PERF.level <= 0 ? 3 : PERF.level === 1 ? 2 : PERF.level === 2 ? 1 : 0, unit: UNIT, groundY: 0, soft: W3.vfxSoft, force: W3.vfxSoft, lights: 0, reduced: !!a.reducedMotion }); W3.vfx.warm(); } catch (e) { W3.vfx = null; }
    }
    if (W3.vfx && W3.vfxRM !== a.reducedMotion) { W3.vfxRM = a.reducedMotion; W3.vfx.setReduced(!!a.reducedMotion); }
    if (W3.vfx) { trailTick(running ? dtR : 0); W3.vfx.update(a.state === 'pause' ? 0 : dtR * PERF.skip); W3.vfx.applyShake(camera); }
    const tr0 = performance.now();
    if (!LOST) { if (POST) { const L = PERF.level; POST.setQuality(L <= 0 ? 3 : L === 1 ? 2 : L === 2 ? 1 : 0, PERF.lock); POST.render(scene, camera); } else renderer.render(scene, camera); }
    if (W3.vfx) W3.vfx.removeShake(camera);
    const trd = performance.now() - tr0; if (trd > 40 && W3.prof.length < 200) W3.prof.push(['draw@' + a.frame, Math.round(trd)]);
  }
  perfTick(dtMs);
  if (a.state !== 'menu') {
    if (S.phase === 'walkout') { drawWalkout(ctx, w, h); drawSay(ctx, w, h); drawVignette(ctx, w, h); return; }
    if (rep) { drawScoreboard(ctx, w); drawReplay(ctx, w, h); drawVignette(ctx, w, h); return; }
    drawOverheadName(ctx);
    drawScoreboard(ctx, w);
    drawBoard(ctx, w, h);
    drawNamePlate(ctx, w);
    drawMini(ctx, w);
    if (S.phase === 'penalties') drawPenaltyHud(ctx, w, h);
    drawSetPiece(ctx, w, h);
    drawBand(ctx, w, h);
    drawBreak(ctx, w, h);
    if (S.cfg.training) drawTraining(ctx, w, h);
    drawSay(ctx, w, h);
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
    phase: S.phase, venue: S.venue, period: S.period, clock: matchClock(), clockSeconds: Math.round(S.pt * 10) / 10, added: S.added, phaseT: Math.round(S.phaseT * 10) / 10, half: S.period,
    score: { home: S.score[0], away: S.score[1] },
    ball: { x: Math.round(b.x), y: Math.round(b.y), z: Math.round(b.z), vx: Math.round(b.vx), vy: Math.round(b.vy) },
    controlled: S.ctrl, controlledName: S.ctrl >= 0 && S.players[S.ctrl] ? S.players[S.ctrl].name : null,
    possession: owner ? owner.team : b.lastTeam, owner: owner ? owner.i : -1,
    mode: S.cfg.mode || 'friendly', matchNo: S.matchNo, demo: S.demo, teams: [S.teams[0].name, S.teams[1].name], form: S.form.slice(), ment: [S.tac[0].ment, S.tac[1].ment],
    restart: S.rs ? { type: S.rs.type, team: S.rs.team, stage: S.rs.stage, direct: S.rs.direct, inRange: S.rs.inRange } : null,
    stats: S.stats, scorers: S.scorers.length, cards: S.cards.length, onPitch: [S.tp[0].filter(ON).length, S.tp[1].filter(ON).length],
    pen: S.pen ? { stage: S.pen.stage, k: S.pen.k, kicks: S.pen.kicks, winner: S.pen.winner } : null,
    replay: S.replay && S.replay.on ? S.replay.angle : -1, walkout: S.phase === 'walkout' ? Math.round(S.wk.t * 10) / 10 : -1,
    training: S.train ? { drill: S.train.d, n: S.train.n, score: S.train.score, state: S.train.state } : null,
    season: SEASON ? { round: SEASON.round, of: SEASON.rounds.length } : null,
    players: S.players.map((p) => [Math.round(p.x), Math.round(p.y)]),
    input: Object.assign({}, GI), view: V.portrait ? 'portrait' : 'wide', cam: CAM.mode, quality: PERF.level,
  };
}

/* ------------------------------------------------------------------ three.js start-up */
function initThree(a) {
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
  camera = new THREE.PerspectiveCamera(36, a.w / Math.max(1, a.h), 30, 26000);
  const qm = /[?&]quality=(\d)/.exec(location.search);
  TEXQ.crowdQ = soft || (qm && +qm[1] >= 3) ? 1 : 2;
  W3.soft = soft;
  initScene(TEXQ);
  if (!soft) W3.env = createSkyEnv(renderer, scene, { top: '#0c1530', horizon: '#4a3f52', ground: '#15181f', sun: { dir: [-0.3, 0.12, -1], color: '#ffb46a', size: 0.08, intensity: 1.2 }, intensity: 0.42 });
  setVenue('stadium');
  buildVenue('stadium', TEXQ);
  W3.ready = true;
  W3.parts = createParticles(scene, { max: 240, unit: UNIT, soft, quality: soft ? 0 : 3 });
  buildRigs();
  buildFx(TEXQ);
  scene.add(camera);
  POST = createPost(renderer, { arc: a, soft, preset: 'night', handheld: true, dof: { results: 0.55, radius: 0.24 }, intro: { yaw: 0.9, up: 0.25, back: 0.35, dur: 2.2 }, results: { yaw: 0.3, rise: 0.05 }, target: (v) => (CAM.pen ? null : v.set(CAM.tx, 0, CAM.ty)), look: { bloom: 0.5, threshold: 0.7, sat: 0.97 } });
  W3.vfxWant = !soft || !!qm; W3.vfxSoft = soft;
  // a software renderer starts one tier lighter: it settles at the lightest tier anyway, and starting there keeps the menu smooth
  if (soft && !qm) { PERF.level = 4; applyQuality(4); }
  if (qm) { PERF.lock = true; PERF.level = +qm[1]; applyQuality(PERF.level); }
  showVenue('stadium');
}
// A software renderer pays for every new shader and texture by stalling the frame that first draws it, so
// there the whole stadium and every person are built, and the shaders compiled, before the menu shows.
function prebuild() {
  while (W3.q.length) buildTick();
  for (let k = 0; k < 40 && RIGS.some((r) => r.want && (!r.h || r.key !== r.want)); k++) rigTick();
  try { renderer.compile(scene, camera); } catch (e) { /* the first frame compiles instead */ }
}
function resize(a) {
  if (!renderer) return;
  renderer.setPixelRatio(a.dpr * PERF.scale); renderer.setSize(a.w, a.h, false);
  camera.aspect = a.w / Math.max(1, a.h); camera.updateProjectionMatrix();
  CAM.snap = true;
}


arc = Arcade.create({
  // Settings > Graphics: 'smooth' and 'sharp' pin a quality level, 'auto' hands it back to the frame-rate auto-scaler.
  graphics(level) { if (level === 'auto') { PERF.lock = false; return; } PERF.lock = true; PERF.level = level === 'sharp' ? 0 : 3; if (W3.ready) applyQuality(PERF.level); },
  slug: 'turf-kings', title: 'Turf Kings', genre: 'Football', three: true,
  hint: 'WASD move  |  J pass  |  I through  |  U cross  |  K shoot  |  E skill  |  Q switch',
  touchHint: 'Stick to run, Shoot / Pass / Lob / Through pads',
  mouse: { cursor: 'pointer', keys: [['Click a team-mate', 'Pass to him (or tackle)'], ['Flick the mouse', 'Shoot that way']] },
  gameKeys: ['KeyC'],
  pauseHtml() {
    if (!S) return '';
    return '<div class="stat"><div>Score<b>' + S.score[0] + ' - ' + S.score[1] + '</b></div><div>Clock<b>' + (S.cfg.training ? 'Training' : matchClock()) + '</b></div></div>' +
      (S.venue === 'stadium' && !S.cfg.training ? '<p><button type="button" class="arc-btn" data-tk="tactics" style="min-height:38px">Tactics</button> <button type="button" class="arc-btn" data-tk="rules" style="min-height:38px">Rules</button></p>' : '');
  },
  gestures: {
    drag: 'xy',
    hint: 'Drag to run  |  tap a mate to pass  |  swipe at goal to shoot',
    keys: [
      ['Drag', 'Run (drag far to sprint)'],
      ['Tap a team-mate', 'Pass to him'],
      ['Tap space ahead', 'Through ball into it'],
      ['Tap yourself', 'Skill move'],
      ['Swipe at goal', 'Shoot, fast is hard, curve up to chip'],
      ['Swipe elsewhere', 'Cross or long ball'],
      ['Defending', 'Tap to tackle or take over a mate, swipe to slide'],
      ['Set pieces', 'Drag to aim, swipe, or tap a mate'],
      ['Penalties', 'Swipe to shoot, tap a side to dive'],
    ],
  },
  keys: [
    ['WASD / Arrows', 'Move'],
    ['L / Shift', 'Sprint (hold)'],
    ['J / Space', 'Pass; defending, tackle'],
    ['I', 'Through ball'],
    ['U', 'Cross, lob, or chip near goal'],
    ['K', 'Shoot, hold for power (Shift: driven)'],
    ['H', 'Chip shot'],
    ['E', 'Skill move'],
    ['Q', 'Switch player (on the ball: skill move)'],
    ['K defending', 'Slide tackle'],
    ['C', 'Camera: TV, wide, close'],
    ['Set pieces', 'Stick aims, J pass, U cross, K shoot'],
  ],
  // Controller: A pass, X through ball, B shoot, Y cross or lob; right trigger sprint, left trigger switch or skill.
  gamepad: { buttons: ['KeyJ', 'KeyI', 'KeyK', 'KeyU'], rt: 'ShiftLeft', lt: 'KeyQ' },
  touch: {
    stick: true,
    pads: [{ label: 'Shoot', key: 'KeyK', big: true, hot: true }, { label: 'Pass', key: 'KeyJ' }, { label: 'Lob', key: 'KeyU' }, { label: 'Through', key: 'KeyI' }, { label: 'Sprint', key: 'ShiftLeft', keep: true }, { label: 'Switch', key: 'KeyQ' }],
  },
  init(a) {
    arc = a;
    const cam = a.store.get('arcade.turf-kings.cam', null); if (cam) CAM.mode = cam;
    initThree(a);
    startDemo();
    a.debug = debug;
    // poster and screenshot helpers
    a.dev = {
      quality(q) { PERF.lock = true; PERF.level = clamp(3 - (q | 0), 0, 3); if (W3.ready) applyQuality(PERF.level); },
      skip() { if (!S) return; if (S.phase === 'walkout') endWalkout(); if (S.replay && S.replay.on) endReplay(); },
      end() { if (!S || S.demo) return; S.rs = null; S.phase = 'play'; S.period = 2; S.added = 1; S.addedShown = true; S.pt = perReal() * (perMins() + 1) / perMins() + 0.01; S.lastKick = null; endPeriod(); },
      goal() { if (!S || S.demo || S.phase !== 'play') return false; const b = S.ball; const p = S.tp[0][S.tp[0].length - 2] || S.tp[0][0]; b.owner = null; b.lastTouch = p; b.lastTeam = 0; b.x = S.dir[0] * (HL + 14); b.y = 0; b.inGoal = S.dir[0]; scoreGoal(S.dir[0]); return true; },
      shot() { if (!S || S.demo) return false; const p = S.tp[0].find((q) => q.role === 'ST') || S.tp[0][S.tp[0].length - 1]; if (S.phase !== 'play') return false; if (S.ball.owner !== p) { p.x = attackX(0) - S.dir[0] * 600; p.y = 80; takeBall(p); } kickBall(p, S.dir[0], -0.08, 1000, 60, 'shot'); return true; },
      restart(type) { if (!S || S.demo) return; const d = S.dir[0]; const at = { corner: [d * (HL - 4), HW - 4], free: [d * (HL - 700), 120], throw: [d * HL * 0.3, -HW], goalkick: [-d * (HL - 100), 80], pen: [d * (HL - VN.spot), 0] }[type] || [0, 0]; startRestart(type, 0, at[0], at[1], { snap: true, direct: true }); },
      against(type) { if (!S || S.demo) return; const d = S.dir[1]; startRestart(type || 'free', 1, type === 'pen' ? d * (HL - VN.spot) : d * (HL - 700), type === 'pen' ? 0 : -100, { snap: true, direct: true }); },
      pens() { if (S && !S.demo) startPenalties(); },
      card(red) { if (!S || S.demo) return; const p = S.tp[1][3]; cardFor(p, S.tp[0][9] || S.tp[0][1], red ? 1 : 0.99, !!red); },
      offside() { if (!S || S.demo) return; const p = S.tp[0].find((q) => q.role === 'ST') || S.tp[0][1]; p.x = attackX(0) - S.dir[0] * 300; callOffside(p); },
      replay() { if (S && !S.demo) return startReplay(); return false; },
      walkout() { if (S && !S.demo && S.venue === 'stadium') startWalkout(); },
      cam(m) { CAM.mode = m; CAM.snap = true; },
      ff(sec) { if (!S || S.demo) return; const n = Math.round(sec * 60); for (let i = 0; i < n && S.phase !== 'break'; i++) stepSim(1 / 60); },
    };
    showMenu();
  },
  onMenu() { if (!S || !S.demo) startDemo(); },
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
  get camera() { return camera; }, get renderer() { return renderer; }, W3, FX, PERF, PATH, pathChip, startPenalties: () => startPenalties(), RIGS, REC,
  project: (x, y, z) => (projectScreen(x, y, z, PJ) ? { x: PJ.x, y: PJ.y } : null),
  axisFor(dx, dy) { return { x: V.rx * dx + V.ry * dy, y: -(V.lx * dx + V.ly * dy) }; },
  simDemo(seconds, skill, venue) {
    newMatch({ home: 0, away: 1, venue: venue || 'stadium', len: 6, skill: skill == null ? 0.6 : skill, demo: true });
    S.ctrl = -1;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) { stepSim(1 / 60); if (S.phase === 'break' && S.brk && S.brk.kind === 'full') break; }
    const r = { score: S.score.slice(), shots: S.stats.shots.slice(), sot: S.stats.sot.slice(), saves: S.stats.saves.slice(), fouls: S.stats.fouls.slice(), corners: S.stats.corners.slice(), offsides: S.stats.offsides.slice(), passes: S.stats.passes.slice(), passOk: S.stats.passOk.slice(), cards: S.cards.length, phase: S.phase, clock: matchClock(), period: S.period };
    startDemo();
    return r;
  },
};
