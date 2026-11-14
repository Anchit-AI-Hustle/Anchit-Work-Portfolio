/*
 * Ring Rajas, the shared core: the roster, the moves, the rules, the AI, the
 * referee, the career, the commentary, the HUD and the sound. game3d.js (WebGL)
 * and game.js (the 2D fallback) each add a renderer, a "view", and call
 * boot(view). Both play exactly the same match.
 *
 * Units are metres. The ring is a 6 m square of canvas 1.15 m above the arena
 * floor, ropes at 3 m from the centre. A wrestler's x, z is where their pelvis
 * is over the floor; yb is the floor they stand on (the mat, the apron or the
 * arena floor); h is the pelvis height in units of their own standing pelvis
 * height (1 standing, 0.17 lying); pitch tips the whole body forward (+) or
 * back (-) about the pelvis, so -PI/2 is flat on the back and +PI/2 face down.
 * yaw 0 faces +z, and the TV side of the ring is +z.
 */

export const TAU = Math.PI * 2, PI = Math.PI, HALF = Math.PI / 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/* ------------------------------------------------------------ the ring, in metres */
export const RH = 1.15;      // mat height above the arena floor
export const RIN = 2.72;     // how far from the centre a wrestler's pelvis can go inside the ropes
export const ROPE = 3.0;     // rope line
export const POST = 3.08;    // corner posts
export const APRON = 3.55;   // apron edge
export const OUT0 = 3.95;    // ringside floor starts here
export const FLOOR = 6.3;    // barricade
export const STAGE_Z = -20, STAGE_Y = 1.2, RAMP_END = -6.4;
export const LIE = 0.17;     // lying pelvis height (in standing pelvis units)
export const PHf = (W) => 0.95 * W.def.height / 1.75;

/* ------------------------------------------------------------ seeded random */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let R = Math.random;
const rnd = (a, b) => a + R() * (b - a);
const pick = (list) => list[(R() * list.length) | 0];
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += R(); return (s - 2) / 0.58; };

/* ------------------------------------------------------------ the promotion and its roster */
export const PROMO = { name: 'Ring Rajas Wrestling', short: 'RRW', show: 'Monday Akhada', ppv: 'Diwali Dhamaka', belt: 'Raja Belt', gm: 'Commissioner Nalini Bose' };
export const CALLERS = [['RAGHU', 'Raghu Rao'], ['SHALINI', 'Shalini Sen']];

/*
 * Every wrestler: who they are, how they are built (for human.js), how they
 * fight (style and stats 0..1), their outfit and colours, their entrance, and
 * their moves. heavy: the four heavy grapples by stick direction in a lock
 * (n neutral, t toward, a away, s sideways). sub: their submission hold.
 */
export const ROSTER = [
  { id: 'bahubal', name: 'Bhim Sandhu', nick: 'Bahubal', from: 'Ludhiana', kg: 128, height: 1.94, sex: 'm', build: 'heavy', skin: '#b77b54', hair: 'buzz', hairColor: '#120e0b',
    style: 'power', stats: { pow: 1, spd: 0.35, tec: 0.45, air: 0.1, tough: 0.95 }, heel: false,
    col: '#ff7a1a', col2: '#2a1a12', light: '#ffb15c', outfit: { top: '#b77b54', sleeves: 'none', bottom: '#2a1a12', legs: 'long-shorts', socks: '#ff7a1a', socksHigh: true, shoes: '#1a1410', soles: '#ff7a1a' },
    alt: { bottom: '#5b1010', socks: '#f2c230', soles: '#f2c230' },
    taunt: 'fistPump', strikes: ['jab', 'hook', 'forearm'], run: 'clothes', ground: 'elbowDrop',
    heavy: { n: 'slam', t: 'bomb', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'sitLock', name: 'Iron Saddle' },
    sig: { tpl: 'press', name: 'Mountain Press', dmg: 16 }, fin: { tpl: 'bomb', name: 'Pahad Drop', dmg: 30, kind: 'grapple' },
    line: 'A mountain from the fields of Punjab. When he lifts you, you stay lifted.' },
  { id: 'toofan', name: 'Tara Iyer', nick: 'Toofan', from: 'Kochi', kg: 58, height: 1.66, sex: 'f', build: 'athletic', skin: '#a26a47', hair: 'ponytail', hairColor: '#120e0b',
    style: 'flyer', stats: { pow: 0.35, spd: 1, tec: 0.65, air: 1, tough: 0.55 }, heel: false,
    col: '#2ab8ff', col2: '#f4f1ea', light: '#8be3ff', outfit: { top: '#2ab8ff', top2: '#f4f1ea', sleeves: 'none', bottom: '#14365a', legs: 'trousers', socks: '#f4f1ea', socksHigh: true, shoes: '#f4f1ea', soles: '#2ab8ff' },
    alt: { top: '#ff4f9a', top2: '#ffd36a', bottom: '#3a1030' },
    taunt: 'cheer', strikes: ['jab', 'kick', 'kick'], run: 'dropkick', ground: 'kneeDrop',
    heavy: { n: 'takedownBig', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'legLock', name: 'Whirl Lock' },
    sig: { tpl: 'roundkick', name: 'Thunder Crane', dmg: 15, kind: 'strike' }, fin: { tpl: 'splash', name: 'Monsoon Splash', dmg: 30, kind: 'aerial' },
    line: 'Fastest feet on the roster. She arrives like weather and leaves the same way.' },
  { id: 'cobra', name: 'Kabir Qureshi', nick: 'Cobra', from: 'Lucknow', kg: 92, height: 1.80, sex: 'm', build: 'athletic', skin: '#c98f66', hair: 'short', hairColor: '#1d1511',
    style: 'technical', stats: { pow: 0.6, spd: 0.65, tec: 1, air: 0.35, tough: 0.7 }, heel: false,
    col: '#3fd17a', col2: '#101a12', light: '#9dffc2', outfit: { top: '#c98f66', sleeves: 'none', bottom: '#14301c', legs: 'trousers', socks: '#3fd17a', socksHigh: true, shoes: '#101a12', soles: '#3fd17a' },
    alt: { bottom: '#2a2a2e', socks: '#d8d4cc', soles: '#d8d4cc' },
    taunt: 'point', strikes: ['jab', 'chop', 'forearm'], run: 'clothes', ground: 'elbowDrop',
    heavy: { n: 'slam', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'armLock', name: 'Fang Hold' },
    sig: { tpl: 'suplex', name: 'Coil Suplex', dmg: 16 }, fin: { tpl: 'subTake', name: 'Naag Lock', dmg: 18, kind: 'sub', hold: 'sitLock' },
    line: 'Patient, precise, and a submission away from ending anyone. He studies tape on the train.' },
  { id: 'viceroy', name: 'Vikram Rathore', nick: 'The Viceroy', from: 'Jaipur', kg: 104, height: 1.86, sex: 'm', build: 'athletic', skin: '#d9a47b', hair: 'long', hairColor: '#2a1d15',
    style: 'showman', stats: { pow: 0.75, spd: 0.55, tec: 0.75, air: 0.3, tough: 0.8 }, heel: true,
    col: '#b06bff', col2: '#f2c230', light: '#d6b0ff', outfit: { top: '#d9a47b', sleeves: 'none', bottom: '#3a1458', legs: 'trousers', socks: '#f2c230', socksHigh: true, shoes: '#2a0f3a', soles: '#f2c230' },
    alt: { bottom: '#f4f1ea', socks: '#b06bff', soles: '#b06bff' },
    taunt: 'celebrate', strikes: ['jab', 'hook', 'chop'], run: 'clothes', ground: 'elbowDrop',
    heavy: { n: 'slam', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'sitLock', name: 'Throne Hold' },
    sig: { tpl: 'lariat', name: 'Crown Clothesline', dmg: 16, kind: 'strike' }, fin: { tpl: 'ddt', name: 'Royal Decree', dmg: 30, kind: 'grapple' },
    line: 'He calls the crowd his subjects. They call him a lot of things back.' },
  { id: 'bijli', name: 'Meera Das', nick: 'Bijli', from: 'Kolkata', kg: 61, height: 1.68, sex: 'f', build: 'athletic', skin: '#c98f66', hair: 'bun', hairColor: '#1d1511',
    style: 'striker', stats: { pow: 0.5, spd: 0.9, tec: 0.7, air: 0.55, tough: 0.65 }, heel: false,
    col: '#f2e23a', col2: '#14141a', light: '#fff6a0', outfit: { top: '#14141a', top2: '#f2e23a', sleeves: 'none', bottom: '#14141a', legs: 'long-shorts', socks: '#f2e23a', socksHigh: true, shoes: '#14141a', soles: '#f2e23a' },
    alt: { top: '#f4f1ea', top2: '#2ab8ff', bottom: '#1c3a5a' },
    taunt: 'fistPump', strikes: ['jab', 'kick', 'kick'], run: 'bigboot', ground: 'kneeDrop',
    heavy: { n: 'takedownBig', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'armLock', name: 'Static Hold' },
    sig: { tpl: 'kickFlurry', name: 'Spark Combo', dmg: 14, kind: 'strike' }, fin: { tpl: 'superkick', name: 'Bijli Kick', dmg: 28, kind: 'strike' },
    line: 'Lightning in the boots. One clean kick and the lights go out on you, politely.' },
  { id: 'garuda', name: 'Arjun Menon', nick: 'Garuda', from: 'Bengaluru', kg: 80, height: 1.77, sex: 'm', build: 'slim', skin: '#a26a47', hair: 'curly', hairColor: '#120e0b',
    style: 'flyer', stats: { pow: 0.45, spd: 0.9, tec: 0.6, air: 1, tough: 0.6 }, heel: false,
    col: '#ff3b4f', col2: '#f2c230', light: '#ff9aa6', outfit: { top: '#a26a47', sleeves: 'none', bottom: '#7a0f1c', legs: 'trousers', socks: '#f2c230', socksHigh: true, shoes: '#7a0f1c', soles: '#f2c230' },
    alt: { bottom: '#0f3a2a', socks: '#f4f1ea', soles: '#f4f1ea' },
    taunt: 'cheer', strikes: ['jab', 'kick', 'forearm'], run: 'dropkick', ground: 'kneeDrop',
    heavy: { n: 'takedownBig', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'legLock', name: 'Wing Lock' },
    sig: { tpl: 'neckbreaker', name: 'Talon Drop', dmg: 15 }, fin: { tpl: 'elbowDive', name: 'Garuda Dive', dmg: 30, kind: 'aerial' },
    line: 'He trains on rooftops at sunrise. The top rope is just another ledge.' },
  { id: 'dhol', name: 'Dev Dhillon', nick: 'Dhol', from: 'Amritsar', kg: 152, height: 1.98, sex: 'm', build: 'heavy', skin: '#b77b54', hair: 'bald', hairColor: '#1d1511',
    style: 'giant', stats: { pow: 1, spd: 0.25, tec: 0.4, air: 0.05, tough: 1 }, heel: false,
    col: '#ff5a1f', col2: '#f2c230', light: '#ffc07a', outfit: { top: '#ff5a1f', top2: '#f2c230', sleeves: 'none', bottom: '#2a1a12', legs: 'trousers', socks: '#2a1a12', socksHigh: true, shoes: '#2a1a12', soles: '#f2c230' },
    alt: { top: '#2ab8ff', top2: '#f4f1ea', bottom: '#14365a' },
    taunt: 'clap', strikes: ['hook', 'hook', 'forearm'], run: 'bigboot', ground: 'elbowDrop',
    heavy: { n: 'slam', t: 'belly', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'sitLock', name: 'Drum Seat' },
    sig: { tpl: 'slam', name: 'Drum Roll Slam', dmg: 15 }, fin: { tpl: 'belly', name: 'Dhol Bash', dmg: 30, kind: 'grapple' },
    line: 'He drums on his own belly on the way to the ring, and the whole arena keeps time.' },
  { id: 'zenith', name: 'Zoya Khan', nick: 'Zenith', from: 'Hyderabad', kg: 66, height: 1.72, sex: 'f', build: 'athletic', skin: '#d9a47b', hair: 'long', hairColor: '#1d1511',
    style: 'technical', stats: { pow: 0.55, spd: 0.75, tec: 0.95, air: 0.5, tough: 0.7 }, heel: false,
    col: '#e8e2d6', col2: '#c2272d', light: '#ffffff', outfit: { top: '#e8e2d6', top2: '#c2272d', sleeves: 'none', bottom: '#c2272d', legs: 'trousers', socks: '#e8e2d6', socksHigh: true, shoes: '#e8e2d6', soles: '#c2272d' },
    alt: { top: '#1c1a24', top2: '#f2c230', bottom: '#1c1a24' },
    taunt: 'point', strikes: ['jab', 'chop', 'kick'], run: 'dropkick', ground: 'elbowDrop',
    heavy: { n: 'slam', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'legLock', name: 'Zenith Clutch' },
    sig: { tpl: 'neckbreaker', name: 'Spiral Sling', dmg: 15 }, fin: { tpl: 'suplex', name: 'Zenith Bridge', dmg: 26, kind: 'grapple', autoPin: true },
    line: 'Two time tag champion, now chasing gold alone. Her bridge holds up a whole building.' },
  { id: 'sher', name: 'Sher Singh', nick: 'Sher', from: 'Patiala', kg: 118, height: 1.88, sex: 'm', build: 'heavy', skin: '#c98f66', hair: 'short', hairColor: '#b3aca4', age: 'older',
    style: 'power', stats: { pow: 0.9, spd: 0.35, tec: 0.8, air: 0.1, tough: 0.95 }, heel: false, unlock: 'week5',
    col: '#f2c230', col2: '#3a2410', light: '#ffe08a', outfit: { top: '#c98f66', sleeves: 'none', bottom: '#3a2410', legs: 'trousers', socks: '#f2c230', socksHigh: true, shoes: '#3a2410', soles: '#f2c230' },
    alt: { bottom: '#0f2a4a', socks: '#f4f1ea', soles: '#f4f1ea' },
    taunt: 'clap', strikes: ['hook', 'chop', 'forearm'], run: 'clothes', ground: 'elbowDrop',
    heavy: { n: 'slam', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'sitLock', name: 'Old Lion Hold' },
    sig: { tpl: 'slam', name: 'Old School Slam', dmg: 15 }, fin: { tpl: 'bomb', name: 'Lion Roar', dmg: 30, kind: 'grapple' },
    line: 'Three decades in the ring and a legend of the old akhada circuits. Unlocked: reach week five of the career.' },
  { id: 'nightjar', name: 'Nightjar', nick: 'Nightjar', from: 'Parts unknown', kg: 84, height: 1.80, sex: 'm', build: 'athletic', skin: '#8c5a3b', hair: 'short', hairColor: '#120e0b', mask: '#2a1a4a',
    style: 'flyer', stats: { pow: 0.6, spd: 0.85, tec: 0.85, air: 0.95, tough: 0.75 }, heel: false, unlock: 'belt',
    col: '#7a5cff', col2: '#0e0b1a', light: '#b4a6ff', outfit: { top: '#1a1430', top2: '#7a5cff', sleeves: 'long', bottom: '#1a1430', legs: 'trousers', socks: '#7a5cff', socksHigh: true, shoes: '#0e0b1a', soles: '#7a5cff' },
    alt: { top: '#f4f1ea', top2: '#1a1430', bottom: '#f4f1ea' },
    taunt: 'point', strikes: ['jab', 'kick', 'chop'], run: 'dropkick', ground: 'kneeDrop',
    heavy: { n: 'takedownBig', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'legLock', name: 'Dusk Lock' },
    sig: { tpl: 'superkick', name: 'Moonless Kick', dmg: 15, kind: 'strike' }, fin: { tpl: 'splash', name: 'Midnight Plunge', dmg: 30, kind: 'aerial' },
    line: 'Nobody knows the face under the mask. Unlocked: win the Raja Belt in the career.' },
];
const TRAINEE = { id: 'chotu', name: 'Chotu', nick: 'Chotu', from: 'the RRW school', kg: 74, height: 1.72, sex: 'm', build: 'average', skin: '#a26a47', hair: 'short', hairColor: '#120e0b',
  style: 'technical', stats: { pow: 0.4, spd: 0.5, tec: 0.4, air: 0.2, tough: 0.5 }, heel: false,
  col: '#9aa3ad', col2: '#3a3d46', light: '#d8dde4', outfit: { top: '#9aa3ad', sleeves: 'short', bottom: '#3a3d46', legs: 'long-shorts', socks: '#3a3d46', socksHigh: true, shoes: '#2a2a2e', soles: '#9aa3ad' },
  taunt: 'clap', strikes: ['jab', 'hook', 'forearm'], run: 'clothes', ground: 'elbowDrop',
  heavy: { n: 'slam', t: 'suplex', a: 'ddt', s: 'neckbreaker' }, sub: { tpl: 'armLock', name: 'Arm Lock' },
  sig: { tpl: 'slam', name: 'Practice Slam', dmg: 10 }, fin: { tpl: 'slam', name: 'Graduation Slam', dmg: 20, kind: 'grapple' }, line: 'A trainee from the RRW school.' };
export const REF = { id: 'ref', name: 'Referee Anand', height: 1.76, sex: 'm', build: 'slim', skin: '#c98f66', hair: 'short', hairColor: '#2a1d15' };
const byId = (id) => ROSTER.find((r) => r.id === id) || (id === 'chotu' ? TRAINEE : null);

/* ------------------------------------------------------------ moves
 * Two-person moves. Channels are keyed over normalised time 0..1, eased between
 * keys. A (attacker, in place) and D (defender, relative to the attacker's
 * facing: fwd ahead, side to the attacker's left, yaw relative, default PI so
 * they face each other). h is pelvis height in standing-pelvis units of the
 * attacker. I is the impact moment, down tells how each one ends up.
 */
const S = 1, L = LIE;
export const DUO = {
  stun: { dur: 0.72, I: 0.46, dmg: 5, name: 'Knee to the gut',
    A: { pitch: [0, 0, 0.4, 0.22, 1, 0] }, D: { fwd: [0, 0.78, 0.46, 0.86, 1, 0.98], pitch: [0, 0, 0.46, 0.62, 0.8, 0.35, 1, 0.15] }, dEnd: 'hit' },
  takedown: { dur: 1.0, I: 0.6, dmg: 6, name: 'Snapmare',
    A: { h: [0, S, 0.5, 0.86, 1, S], pitch: [0, 0, 0.5, 0.3, 1, 0] },
    D: { fwd: [0, 0.75, 0.3, 0.7, 0.6, 1.0, 1, 1.05], h: [0, S, 0.3, 1.12, 0.6, L, 1, L], pitch: [0, 0, 0.3, -1.1, 0.6, -HALF, 1, -HALF] }, dEnd: 'up', dGet: 1.3 },
  takedownBig: { dur: 1.15, I: 0.62, dmg: 9, name: 'Hurricane takedown',
    A: { h: [0, S, 0.3, 1.05, 0.62, 0.8, 1, S], pitch: [0, 0, 0.3, -0.2, 0.62, 0.35, 1, 0], roll: [0, 0, 0.3, 0.4, 0.62, -0.3, 1, 0] },
    D: { fwd: [0, 0.7, 0.35, 0.4, 0.62, 1.15, 1, 1.15], side: [0, 0, 0.35, 0.35, 0.62, 0.1, 1, 0], h: [0, S, 0.35, 1.5, 0.62, L, 1, L], pitch: [0, 0, 0.35, 1.2, 0.5, 2.6, 0.62, 3 * HALF, 1, 3 * HALF] }, dEnd: 'up', dGet: 1.6 },
  slam: { dur: 1.5, I: 0.74, dmg: 11, name: 'Body slam',
    A: { h: [0, S, 0.2, 0.84, 0.45, S, 0.74, 0.9, 1, S], pitch: [0, 0, 0.2, 0.32, 0.45, -0.12, 0.74, 0.25, 1, 0] },
    D: { fwd: [0, 0.72, 0.2, 0.42, 0.45, 0.2, 0.6, 0.22, 0.74, 0.98, 1, 0.98], h: [0, S, 0.2, 1.1, 0.45, 1.55, 0.6, 1.6, 0.74, L, 1, L],
      pitch: [0, 0, 0.2, -0.4, 0.45, -1.35, 0.6, -1.6, 0.74, -HALF, 1, -HALF], yaw: [0, PI, 0.45, PI + HALF, 1, PI + HALF] }, dEnd: 'up', dGet: 2.0 },
  press: { dur: 2.1, I: 0.78, dmg: 16, name: 'Military press slam',
    A: { h: [0, S, 0.18, 0.82, 0.4, S, 0.74, S, 0.82, 0.9, 1, S], pitch: [0, 0, 0.18, 0.3, 0.4, -0.08, 0.74, -0.08, 0.82, 0.22, 1, 0] },
    D: { fwd: [0, 0.7, 0.2, 0.35, 0.4, 0.05, 0.74, 0.08, 0.82, 1.1, 1, 1.1], h: [0, S, 0.2, 1.2, 0.4, 2.05, 0.74, 2.1, 0.82, L, 1, L],
      pitch: [0, 0, 0.2, -0.6, 0.4, -HALF, 0.82, -HALF, 1, -HALF], yaw: [0, PI, 0.4, PI + HALF, 1, PI + HALF] }, dEnd: 'up', dGet: 2.4 },
  suplex: { dur: 1.6, I: 0.7, dmg: 12, name: 'Vertical suplex',
    A: { pitch: [0, 0, 0.25, -0.12, 0.45, -0.55, 0.7, -1.5, 1, -HALF], h: [0, S, 0.45, 0.78, 0.7, L, 1, L] },
    D: { fwd: [0, 0.55, 0.3, 0.42, 0.46, 0.25, 0.58, -0.2, 0.7, -1.0, 1, -1.05], h: [0, S, 0.3, 1.3, 0.46, 1.95, 0.6, 1.5, 0.7, L, 1, L],
      pitch: [0, 0, 0.3, 0.9, 0.46, PI, 0.6, 4.1, 0.7, 3 * HALF, 1, 3 * HALF] }, aEnd: 'up', aGet: 0.55, dEnd: 'up', dGet: 1.9 },
  ddt: { dur: 1.2, I: 0.56, dmg: 12, name: 'DDT',
    A: { pitch: [0, 0, 0.32, 0.18, 0.56, -HALF, 1, -HALF], h: [0, S, 0.32, 0.92, 0.56, L, 1, L] },
    D: { fwd: [0, 0.6, 0.32, 0.45, 0.56, 0.2, 1, 0.22], pitch: [0, 0, 0.32, 1.05, 0.56, 1.8, 0.75, HALF, 1, HALF], h: [0, S, 0.32, 0.82, 0.56, L, 1, L] }, aEnd: 'up', aGet: 0.6, dEnd: 'front', dGet: 2.1 },
  bomb: { dur: 2.0, I: 0.76, dmg: 16, name: 'Powerbomb',
    A: { h: [0, S, 0.15, 0.74, 0.35, S, 0.62, S, 0.76, 0.62, 1, 0.66], pitch: [0, 0, 0.15, 0.45, 0.35, 0, 0.62, -0.12, 0.76, 0.4, 1, 0.3] },
    D: { fwd: [0, 0.6, 0.15, 0.42, 0.35, 0.22, 0.62, 0.28, 0.76, 0.88, 1, 0.9], h: [0, S, 0.15, 1.0, 0.35, 1.6, 0.62, 1.65, 0.76, L, 1, L],
      pitch: [0, 0, 0.15, 1.35, 0.35, 0.25, 0.62, -0.3, 0.76, -HALF, 1, -HALF] }, aEnd: 'stand', dEnd: 'up', dGet: 2.6 },
  neckbreaker: { dur: 1.15, I: 0.56, dmg: 11, name: 'Neckbreaker',
    A: { pitch: [0, 0, 0.35, -0.45, 0.56, -HALF, 1, -HALF], h: [0, S, 0.56, L, 1, L], side: [0, 0, 0.56, -0.25, 1, -0.25] },
    D: { fwd: [0, 0.55, 0.3, 0.2, 0.56, 0.15, 1, 0.15], side: [0, 0, 0.3, 0.35, 0.56, 0.5, 1, 0.5], yaw: [0, PI, 0.3, 0.2, 1, 0.2], pitch: [0, 0, 0.3, -0.35, 0.56, -HALF, 1, -HALF], h: [0, S, 0.56, L, 1, L] }, aEnd: 'up', aGet: 0.5, dEnd: 'up', dGet: 1.8 },
  belly: { dur: 1.35, I: 0.6, dmg: 13, name: 'Belly to belly',
    A: { h: [0, S, 0.3, 1.05, 0.6, 0.42, 1, 0.42], pitch: [0, 0, 0.3, -0.25, 0.6, 1.3, 1, 1.35] },
    D: { fwd: [0, 0.6, 0.3, 0.5, 0.6, 0.8, 1, 0.8], h: [0, S, 0.3, 1.6, 0.6, L, 1, L], pitch: [0, 0, 0.3, -0.35, 0.6, -HALF, 1, -HALF] }, aEnd: 'front', aGet: 0.45, dEnd: 'up', dGet: 2.3 },
  backdrop: { dur: 1.05, I: 0.6, dmg: 10, name: 'Back body drop',
    A: { pitch: [0, 0, 0.3, 1.0, 0.6, 0.55, 1, 0], h: [0, S, 0.3, 0.74, 1, S] },
    D: { fwd: [0, 1.0, 0.3, 0.25, 0.45, -0.3, 0.6, -1.0, 1, -1.1], h: [0, S, 0.3, 1.35, 0.45, 2.25, 0.6, L, 1, L], pitch: [0, 0, 0.3, 1.0, 0.45, 2.6, 0.6, 3 * HALF, 1, 3 * HALF] }, dEnd: 'up', dGet: 1.7 },
  subTake: { dur: 0.95, I: 0.6, dmg: 6, name: 'Takedown',
    A: { h: [0, S, 0.6, 0.7, 1, 0.7], pitch: [0, 0, 0.6, 0.6, 1, 0.5] },
    D: { fwd: [0, 0.7, 0.6, 0.6, 1, 0.6], h: [0, S, 0.35, 0.9, 0.6, L, 1, L], pitch: [0, 0, 0.35, 0.8, 0.6, HALF, 1, HALF] }, dEnd: 'front', dGet: 1.5 },
};
/* Single-actor moves: strikes, ground moves, running attacks, aerial dives, and the everyday ones. */
export const SOLO = {
  jab: { dur: 0.42, I: 0.5, reach: 1.18, dmg: 3, mom: 3, name: 'Jab', react: 'hit', fwd: [0, 0, 0.5, 0.08, 1, 0.08] },
  hook: { dur: 0.56, I: 0.52, reach: 1.2, dmg: 5, mom: 4, name: 'Right hand', react: 'hit', fwd: [0, 0, 0.52, 0.12, 1, 0.12] },
  chop: { dur: 0.62, I: 0.52, reach: 1.15, dmg: 6, mom: 5, name: 'Knife edge chop', react: 'hit' },
  forearm: { dur: 0.62, I: 0.5, reach: 1.2, dmg: 7, mom: 5, name: 'Forearm smash', react: 'hit', fwd: [0, 0, 0.5, 0.15, 1, 0.15] },
  kick: { dur: 0.68, I: 0.48, reach: 1.35, dmg: 6, mom: 4, name: 'Kick', react: 'hit' },
  roundkick: { dur: 0.9, I: 0.5, reach: 1.45, dmg: 12, mom: 0, name: 'Roundhouse', react: 'fall', yaw: [0, 0, 0.5, 2.6, 1, TAU] },
  kickFlurry: { dur: 1.3, I: 0.78, reach: 1.4, dmg: 12, mom: 0, name: 'Kick flurry', react: 'fall', fwd: [0, 0, 0.78, 0.3, 1, 0.3] },
  superkick: { dur: 0.95, I: 0.52, reach: 1.5, dmg: 16, mom: 0, name: 'Superkick', react: 'fall', fwd: [0, 0, 0.3, -0.1, 0.52, 0.15, 1, 0.15] },
  lariat: { dur: 0.95, I: 0.46, reach: 1.5, dmg: 14, mom: 0, name: 'Lariat', react: 'fall', fwd: [0, 0, 0.46, 0.85, 1, 0.95] },
  clothes: { dur: 0.6, I: 0.3, reach: 1.35, dmg: 9, mom: 7, name: 'Running clothesline', react: 'fall', run: true, fwd: [0, 0, 0.3, 0.9, 1, 1.2] },
  bigboot: { dur: 0.62, I: 0.34, reach: 1.45, dmg: 9, mom: 7, name: 'Big boot', react: 'fall', run: true, fwd: [0, 0, 0.34, 0.9, 1, 1.1] },
  dropkick: { dur: 1.1, I: 0.3, reach: 1.6, dmg: 10, mom: 8, name: 'Dropkick', react: 'fall', run: true, fwd: [0, 0, 0.3, 1.1, 0.5, 1.3, 1, 1.3],
    h: [0, S, 0.22, 1.45, 0.42, 0.55, 0.6, L, 1, L], pitch: [0, 0, 0.22, -1.35, 0.42, -1.5, 1, -HALF], selfDown: 'up', selfGet: 0.45 },
  spear: { dur: 0.8, I: 0.38, reach: 1.45, dmg: 12, mom: 8, name: 'Spear', react: 'fall', run: true, fwd: [0, 0, 0.38, 1.0, 1, 1.4],
    h: [0, S, 0.3, 0.7, 0.5, 0.22, 1, 0.22], pitch: [0, 0, 0.3, 1.1, 0.5, HALF, 1, HALF], selfDown: 'front', selfGet: 0.4 },
  elbowDrop: { dur: 1.05, I: 0.55, reach: 1.7, dmg: 8, mom: 6, name: 'Elbow drop', ground: true, h: [0, S, 0.3, 1.25, 0.55, 0.33, 0.78, 0.33, 1, S], pitch: [0, 0, 0.3, 0.25, 0.55, 1.42, 0.78, 1.42, 1, 0], fwd: [0, 0, 0.55, 0.5, 1, 0.5] },
  kneeDrop: { dur: 0.85, I: 0.5, reach: 1.6, dmg: 7, mom: 5, name: 'Knee drop', ground: true, h: [0, S, 0.25, 1.15, 0.5, 0.48, 0.72, 0.48, 1, S], pitch: [0, 0, 0.5, 0.55, 0.72, 0.55, 1, 0], fwd: [0, 0, 0.5, 0.45, 1, 0.45] },
  whip: { dur: 0.55, I: 0.4, name: 'Irish whip' },
  taunt: { dur: 1.6, name: 'Taunt' },
  getup: { dur: 0.95 },
  fallBack: { dur: 0.55, h: [0, S, 0.5, 0.6, 1, L], pitch: [0, 0, 1, -HALF], fwd: [0, 0, 1, -0.55] },
  fallFront: { dur: 0.55, h: [0, S, 0.5, 0.6, 1, L], pitch: [0, 0, 1, HALF], fwd: [0, 0, 1, 0.45] },
  climb: { dur: 1.0 },
  pickup: { dur: 0.85 },
  rollOut: { dur: 1.15 }, rollIn: { dur: 1.0 }, overTop: { dur: 1.15 },
  tagOut: { dur: 0.8 }, tagIn: { dur: 0.9 },
  crash: { dur: 0.6, h: [0, 0.6, 1, L], pitch: [0, HALF, 1, HALF] },
  shove: { dur: 0.5, I: 0.4, name: 'Shove' },
  dodge: { dur: 0.5 },
};
const HOLDS = {
  legLock: { name: 'Leg lock', press: 1.0 },
  armLock: { name: 'Arm bar', press: 1.05 },
  sitLock: { name: 'Seated hold', press: 1.1 },
};
export function key(arr, t) {
  if (!arr) return null;
  if (t <= arr[0]) return arr[1];
  for (let i = 2; i < arr.length; i += 2) {
    if (t <= arr[i]) { const t0 = arr[i - 2], v0 = arr[i - 1], t1 = arr[i], v1 = arr[i + 1]; return v0 + (v1 - v0) * smooth01((t - t0) / (t1 - t0 || 1)); }
  }
  return arr[arr.length - 1];
}

/* ------------------------------------------------------------ difficulty */
export const DIFF = {
  easy: { react: 0.34, err: 0.15, rev: 0.13, aggr: 0.55, kick: -0.18, mash: 4.5, hes: 0.28, dmgIn: 0.82, dmgOut: 0.9 },
  normal: { react: 0.23, err: 0.095, rev: 0.27, aggr: 0.82, kick: 0, mash: 6.5, hes: 0.12, dmgIn: 1, dmgOut: 1 },
  hard: { react: 0.16, err: 0.06, rev: 0.45, aggr: 1, kick: 0.12, mash: 8.5, hes: 0.04, dmgIn: 1.12, dmgOut: 1.05 },
};
const MATCHES = { single: 'One on one', tag: 'Tag team', triple: 'Triple threat', elim: 'Elimination' };

/* ------------------------------------------------------------ commentary, original lines */
const LINES = {
  entrance: ['Listen to this building, {n} is here.', 'Here comes {n}, and look at that focus.', '{n} from {from}, and this crowd knows the name.', 'The lights change and the whole arena stands for {n}.'],
  heelEntrance: ['And here is {n}, soaking up every single boo.', '{n} thinks this crowd came to see royalty. They did not.'],
  bell: ['There is the bell, and we are under way.', 'Here we go, Shalini, the bell has rung.', 'Collar and elbow to start, this one is on.'],
  strike: ['{a} with a stiff shot.', 'Hard strikes from {a}.', '{a} is throwing bombs in there.'],
  big: ['{a} with the {m}! The ring shook on that one.', 'What a {m} from {a}!', '{m}! Textbook from {a}.', '{d} gets planted by the {m}.'],
  reversal: ['Reversed! {d} saw that coming.', 'Countered! The timing on that was perfect.', '{d} turns it around in a heartbeat.', 'What awareness from {d}!'],
  nearfall: ['Kick out! {d} is still in this!', 'Two and a half! I thought that was it!', 'How did {d} get the shoulder up?', '{d} refuses to stay down!'],
  finisher: ['{a} hits the {m}! Cover! This could be over!', 'The {m}! That is the move that wins titles!', 'It is {m} time, and {d} is in trouble!'],
  sig: ['{a} goes to the signature, the {m}!', 'There it is, the {m}! The crowd knew it was coming.'],
  taunt: ['{a} is playing to the crowd now.', 'Listen to them, {a} has this place in the palm of a hand.'],
  heelTaunt: ['{a} mocks the crowd, and they let {a} hear it.', 'The arrogance of {a}, Raghu, unbelievable.'],
  outside: ['We are on the floor now, and the referee has started the count.', 'This has spilled outside the ring!'],
  tag: ['The tag is made! {a} comes in fresh!', 'Hot tag! {a} is in and firing!'],
  sub: ['{a} has the {m} locked in! {d} needs the ropes!', 'The {m}! {d} is in a world of trouble!'],
  rope: ['Rope break! The referee forces the release.', '{d} gets to the ropes! Smart wrestling.'],
  escape: ['{d} fights out of it! What heart!', 'Escaped! {d} powers out!'],
  fly: ['{a} is going up top!', 'Look out, {a} is on the top turnbuckle!'],
  miss: ['Nobody home! {a} crashes and burns.', '{a} missed big there.'],
  comeback: ['{a} is fired up! Here comes the comeback!', 'The crowd is behind {a}, and {a} is feeding off it!'],
  win: ['It is over! {w} wins it!', 'One, two, three! {w} gets it done!', 'What a match, and {w} has won it!'],
  winSub: ['{d} taps! {w} wins by submission!', 'Tap out! {w} takes it!'],
  winCount: ['That is ten! {w} wins by count out!', '{d} could not beat the count!'],
  elim: ['{d} has been eliminated!', 'That is it for {d}, eliminated!'],
  title: ['And new Raja Belt champion! {w} has done it!', 'History tonight! {w} is the champion!'],
  chatter: ['Shalini, the pace in this one is relentless.', 'You can hear the fans stomping in the upper rows.', 'Every move tonight has had a purpose.', 'Momentum is everything in a match like this.', 'Watch the stamina here, both of them are breathing hard.'],
  pin: ['Cover!', 'Hook of the leg!', 'Going for the pin!'],
  break: ['The pin is broken up!', 'Saved at two!'],
};
let callerTurn = 0;

/* ------------------------------------------------------------ module state */
let ARC = null, VIEW = null, MG = null, AU = null;
const MOUSE = { left: false, right: false, click: false, rclick: false };
const pv = { x: 0, y: 0, ok: false };

/* ------------------------------------------------------------ career */
const CKEY = 'arcade.ring-rajas.save';
const UKEY = 'arcade.ring-rajas.unlocked';
function loadCareer() { return ARC ? ARC.store.get(CKEY, null) : null; }
function saveCareer(c) { if (ARC) ARC.store.set(CKEY, c); }
function unlocks() { const u = (ARC && ARC.store.get(UKEY, null)) || {}; return { sher: !!u.sher, nightjar: !!u.nightjar, wins: u.wins || {} }; }
function setUnlock(k) { const u = (ARC && ARC.store.get(UKEY, null)) || {}; if (!u[k]) { u[k] = true; ARC.store.set(UKEY, u); return true; } return false; }
function addWin(id) { const u = (ARC && ARC.store.get(UKEY, null)) || {}; u.wins = u.wins || {}; u.wins[id] = (u.wins[id] || 0) + 1; ARC.store.set(UKEY, u); return u.wins[id]; }
function available(id) { const r = byId(id); if (!r) return false; if (!r.unlock) return true; const u = unlocks(); return r.unlock === 'week5' ? u.sher : u.nightjar; }

const WEEKS = [
  { title: 'Week 1: Welcome to the Akhada', match: 'single', opp: 'low',
    text: '{gm} meets you at the curtain. "Big crowd tonight, rookie. They have heard about you from {from}. Go out there and give them a reason to remember your name." The {show} lights are hot, the ring is waiting.' },
  { title: 'Week 2: Making a name', match: 'single', opp: 'low',
    text: 'Your first win is all over the highlight reels. Backstage, {rival} watches the replay on a phone and laughs. "Lucky," says {rival}, loud enough for the whole hallway. Tonight you get another chance to prove it was not luck.' },
  { title: 'Week 3: Uneasy partners', match: 'tag', opp: 'rival',
    text: '{gm} has had enough of the talking. "{rival} and {ally} against you and {partner}. Tag team rules. Settle it in the ring, not in my hallway." {partner} shrugs. "Tag me in when you need me. I will be ready."' },
  { title: 'Week 4: The ally', match: 'single', opp: 'ally',
    text: '{ally} cost you a moment last week and enjoyed every second. Tonight it is one on one. Beat {ally}, and {rival} has nobody left to hide behind.' },
  { title: 'Week 5: Grudge', match: 'single', opp: 'rival',
    text: 'No partners, no excuses. {rival} grabs the microphone: "Everyone in {from} must be very proud of a wrestler who wins on luck." The crowd is already on its feet. This one is personal.' },
  { title: 'Week 6: Number one contender', match: 'triple', opp: 'pair',
    text: '{gm} announces a triple threat. The winner earns a place in the four way final eliminator. {rival} is in it. So is {other}. First fall wins, no count outs.' },
  { title: 'Week 7: The final eliminator', match: 'elim', opp: 'trio',
    text: 'Four wrestlers, one spot. Every fall eliminates someone, and the last one standing faces {champ} for the {belt} at {ppv}. Survive.' },
  { title: 'Week 8: {ppv}', match: 'single', opp: 'champ', belt: true,
    text: 'Fireworks over the arena roof. {champ} has held the {belt} for nine months and walks out holding it high. "You do not deserve to share my ring," says {champ}. The bell is about to tell you otherwise.' },
];
const DEFENCE = 'Week {week}: Title defence. {opp} has earned a shot at the {belt}. {gm}: "The champion defends against all comers. That is what champions do." Hold on to the gold.';

/* ------------------------------------------------------------ match setup */
function teamColors(G) { return G.W.map((w) => w.def.col); }
function makeW(G, def, team, i, alt) {
  const outfit = Object.assign({}, def.outfit, alt && def.alt ? def.alt : {});
  return {
    i, def, team, outfit, alt: !!alt, x: 0, z: 0, yb: RH, yaw: 0, vx: 0, vz: 0, speed: 0, turn: 0,
    st: 'idle', t: 0, anim: 'idle', ak: 0, adur: 1, at: 0, h: 1, pitch: 0, roll: 0, yawOff: 0,
    dmg: 0, stam: 100, mom: 0, legal: true, out: false, elim: false, gone: false, apron: false,
    ctl: { mx: 0, mz: 0, run: false }, bot: true, ai: null, threat: null, revLock: 0, revFlash: 0, combo: 0, comboQ: false, comboT: 0,
    move: null, solo: null, lock: null, target: null, downT: 0, getT: 1.4, face: 'up', stun: 0, run: { x: 0, z: 0, forced: false, n: 0 },
    perch: null, fly: null, holdT: 0, mood: 0, fired: 0, frustr: 0, mash: 0, lastBy: null, entered: false,
    stats: { hits: 0, moves: 0, revs: 0, fins: 0, kickouts: 0, taken: 0 }, flash: 0, outT: 0, said: 0, hitT: 9, blinkHurt: 0,
  };
}
function placeStart(G) {
  const n = G.W.length, ins = G.W.filter((w) => !w.apron);
  const spots = ins.length === 2 ? [[-1.4, 0.5, HALF], [1.4, 0.3, -HALF]] : ins.length === 3 ? [[-1.5, 0.7, HALF], [1.5, 0.7, -HALF], [0, -1.5, 0]] : [[-1.6, 0.9, HALF], [1.6, 0.9, -HALF], [-1.2, -1.5, 0.6], [1.2, -1.5, -0.6]];
  ins.forEach((w, k) => { const s = spots[k]; w.x = s[0]; w.z = s[1]; w.yaw = s[2]; w.yb = RH; w.out = false; });
  G.W.forEach((w) => { if (w.apron) { const c = cornerOf(w.team); w.x = c.ax; w.z = c.az; w.yb = RH; w.yaw = 0; } });
  void n;
}
// Tag corners: team 0 far left, team 1 far right. ax/az: the apron spot, tx/tz: the tag spot inside.
function cornerOf(team) { const s = team === 0 ? -1 : 1; return { px: s * POST, pz: -POST, tx: s * 2.45, tz: -2.45, ax: s * 2.62, az: -3.32 }; }

function newMatch(cfg) {
  R = rng(cfg.seed || ((Math.random() * 1e9) | 0));
  const G = { cfg, W: [], phase: 'boot', pt: 0, time: 0, clock: 0, realT: 0, crowd: 0.35, msg: null, msgQ: [], chant: null, chantT: 6, chatT: 9, pop: null, popT: 0,
    pin: null, sub: null, cout: null, winner: null, method: '', result: null, ent: 0, entT: 0, replay: null, replayCd: 0, events: [], lesson: null,
    stats: { nearfalls: 0, revs: 0, fins: 0, finKick: 0, lead: 0, moves: 0 }, camYaw: PI, ui: {}, rec: 0, prompt: null, story: null, storyT: 0, elimMsg: null, bell: 0, slow: 0, ended: false };
  const diff = DIFF[cfg.diff] || DIFF.normal;
  G.D = diff;
  const used = new Set();
  const mine = byId(cfg.wid) || ROSTER[0];
  used.add(mine.id);
  const pool = ROSTER.filter((r) => !r.unlock || available(r.id));
  const fill = (want) => { if (want && !used.has(want)) { used.add(want); return byId(want); } const c = pool.filter((r) => !used.has(r.id)); const r = c.length ? pick(c) : pick(ROSTER); used.add(r.id); return r; };
  const opp = cfg.opps || [];
  const add = (def, team, alt) => { const w = makeW(G, def, team, G.W.length, alt); G.W.push(w); return w; };
  const P = add(mine, 0, cfg.attire === 'alt');
  P.bot = !!cfg.attract;
  if (cfg.mode === 'practice') { add(TRAINEE, 1); }
  else if (cfg.match === 'tag') { const p2 = add(fill(cfg.partner), 0); p2.apron = true; p2.legal = false; add(fill(opp[0]), 1); const o2 = add(fill(opp[1]), 1); o2.apron = true; o2.legal = false; }
  else if (cfg.match === 'triple') { add(fill(opp[0]), 1); add(fill(opp[1]), 2); }
  else if (cfg.match === 'elim') { add(fill(opp[0]), 1); add(fill(opp[1]), 2); add(fill(opp[2]), 3); }
  else add(fill(opp[0]), 1);
  G.P = P;
  G.W.forEach((w) => { w.ai = newAI(w, G); });
  G.ref = { x: 0, z: -1.6, yb: RH, yaw: 0, st: 'watch', t: 0, anim: 'idle', ak: 0, count: 0, slap: 0, speed: 0, look: null, raise: null };
  placeStart(G);
  G.startSpots = G.W.map((w) => [w.x, w.z, w.yaw]);
  G.order = G.W.slice().reverse(); // entrances: opponents first, the player last
  if (cfg.match === 'tag') G.order = [G.W[2], G.W[0]]; // each team walks out together behind its leader
  return G;
}

/* ------------------------------------------------------------ geometry helpers */
const fwdX = (yaw) => Math.sin(yaw), fwdZ = (yaw) => Math.cos(yaw);
function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function faceTo(w, x, z) { return Math.atan2(x - w.x, z - w.z); }
function inRing(w) { return !w.out && !w.apron && w.yb > 0.5; }
function sameLevel(a, b) { return inRing(a) === inRing(b) && !a.apron && !b.apron; }
function isDown(w) { return w.st === 'down' || w.st === 'pinned' || (w.st === 'sub' && w.role === 'd'); }
function standing(w) { return !w.elim && !w.gone && (w.st === 'idle' || w.st === 'run' || w.st === 'hit' || w.st === 'solo' || w.st === 'lock' || w.st === 'perch'); }
function ropeDist(w) { return ROPE - Math.max(Math.abs(w.x), Math.abs(w.z)); }
// how far a lying wrestler's head or feet reach toward the ropes
function bodyReach(w) {
  const s = w.pitch > 0 ? 1 : -1, hx = fwdX(w.yaw) * s, hz = fwdZ(w.yaw) * s;
  return Math.max(Math.abs(w.x + hx * 0.85), Math.abs(w.z + hz * 0.85), Math.abs(w.x - hx * 0.95), Math.abs(w.z - hz * 0.95));
}
function torso(w, out) {
  const s = w.pitch > 0 ? 1 : -1; out.x = w.x + fwdX(w.yaw) * 0.42 * s; out.z = w.z + fwdZ(w.yaw) * 0.42 * s; return out;
}
const _p = { x: 0, z: 0 }, _q = { x: 0, z: 0 };
function opponents(G, w) { return G.W.filter((o) => o !== w && o.team !== w.team && !o.elim && !o.gone && !o.apron); }
function bestTarget(G, w) {
  let best = null, bs = 1e9;
  for (const o of G.W) {
    if (o === w || o.team === w.team || o.elim || o.gone || o.apron || !sameLevel(w, o)) continue;
    const d = dist(w, o), a = Math.abs(wrapA(faceTo(w, o.x, o.z) - w.yaw));
    const s = d + a * 0.9 + (o === w.target ? -0.6 : 0) + (isDown(o) ? 0.4 : 0);
    if (s < bs) { bs = s; best = o; }
  }
  return best;
}
function clampIn(w) {
  if (w.out) {
    const m = Math.max(Math.abs(w.x), Math.abs(w.z));
    if (m < OUT0) { if (Math.abs(w.x) > Math.abs(w.z)) w.x = Math.sign(w.x || 1) * OUT0; else w.z = Math.sign(w.z || 1) * OUT0; }
    w.x = clamp(w.x, -FLOOR, FLOOR); w.z = clamp(w.z, -FLOOR, FLOOR);
  } else if (!w.apron && !w.perch) { w.x = clamp(w.x, -RIN, RIN); w.z = clamp(w.z, -RIN, RIN); }
}

/* ------------------------------------------------------------ states */
function setSt(w, st) { w.st = st; w.t = 0; }
function startSolo(G, w, name, o) {
  const S0 = SOLO[name]; if (!S0) return;
  w.solo = Object.assign({ name, d: S0, t: 0, dur: (S0.dur || 1) * ((o && o.speed) || 1), hit: false, x0: w.x, z0: w.z, fprev: 0, target: null, mv: null }, o || {});
  setSt(w, 'solo'); w.anim = name; w.ak = 0; w.adur = w.solo.dur;
}
function down(G, w, face, gt) {
  setSt(w, 'down'); w.anim = face === 'front' ? 'downFront' : 'down'; w.face = face === 'front' ? 'front' : 'up';
  w.pitch = w.face === 'front' ? HALF : -HALF; w.h = LIE; w.roll = 0; w.yawOff = 0;
  w.getT = (gt || 1.4) * (0.75 + w.dmg / 160) * (1.25 - w.def.stats.tough * 0.35);
  if (w.bot) w.getT *= rnd(0.9, 1.15);
  w.move = null; w.solo = null; w.lock = null; w.perch = null; w.fly = null; w.threat = null;
  clampIn(w);
}
function stand(G, w) { setSt(w, 'idle'); w.anim = 'idle'; w.h = 1; w.pitch = 0; w.roll = 0; w.yawOff = 0; w.move = null; w.solo = null; w.lock = null; }
function hurt(G, w, by, amt, o) {
  amt *= 0.5 * (by && by.bot ? G.D.dmgIn : G.D.dmgOut) * (1.25 - w.def.stats.tough * 0.35);
  if (by) amt *= 0.85 + by.def.stats.pow * 0.3;
  if (G.cfg.mode === 'practice' && w === G.P) amt *= 0.4;
  w.dmg = clamp(w.dmg + amt, 0, 100); w.lastBy = by; w.hitT = 0; w.stats.taken += amt;
  w.mom = Math.max(0, w.mom - amt * 0.3);
  if (by) { by.mom = Math.min(100, by.mom + amt * 1.25 * (o && o.momK != null ? o.momK : 1)); by.stats.hits++; }
  w.mood = Math.max(-1, w.mood - 0.15);
}

/* ------------------------------------------------------------ reversals
 * Every attack opens a reversal window on its target. A player sees a
 * shrinking ring and must press Reverse while it is gold: too early and that
 * attack can no longer be countered. The AI "presses" too, at a time drawn
 * around the window with its own error, so it reverses like a person.
 */
function threaten(G, def, by, kind, at, w0, w1) {
  if (!def || def.elim) return;
  def.threat = { by, kind, at, w0, w1, early: false, t0: G.time };
  if (def.bot) aiPlanReverse(G, def);
}
function tryReverse(G, w) {
  const th = w.threat;
  if (!th || w.revLock > 0) return false;
  if (th.early) return false;
  if (G.time < th.w0) { th.early = true; w.revFlash = -0.6; return false; }
  if (G.time > th.w1) return false;
  w.threat = null;
  doReverse(G, w, th);
  return true;
}
function doReverse(G, d, th) {
  const a = th.by;
  d.stats.revs++; G.stats.revs++; d.mom = Math.min(100, d.mom + 9); d.revFlash = 0.7;
  a.frustr = Math.min(1, a.frustr + 0.25); if (a.ai) a.ai.revd++;
  G.crowd = Math.min(1, G.crowd + 0.12);
  ev(G, 'reverse', { a: d, d: a });
  say(G, 'reversal', { a, d });
  sfx(330, 0.08, { type: 'square', vol: 0.06 });
  if (th.kind === 'strike' || th.kind === 'counter') {
    // catch it and fire back
    a.solo = null; setSt(a, 'hit'); a.stun = 0.55; a.anim = 'stagger';
    d.yaw = faceTo(d, a.x, a.z);
    startSolo(G, d, 'hook', { target: a, noRev: true });
  } else if (th.kind === 'grapple' || th.kind === 'fin') {
    const tpl = th.kind === 'fin' ? 'shove' : pick(['takedown', 'stun', 'neckbreaker']);
    if (a.move) endMoveEarly(G, a);
    if (tpl === 'shove') { d.yaw = faceTo(d, a.x, a.z); a.yaw = faceTo(a, d.x, d.z); startSolo(G, d, 'shove', { target: a, noRev: true }); setSt(a, 'hit'); a.stun = 0.9; a.anim = 'stagger'; a.knock = 0.9; }
    else { d.yaw = faceTo(d, a.x, a.z); a.yaw = faceTo(a, d.x, d.z); startDuo(G, d, a, tpl, { noRev: true, name: tpl === 'stun' ? 'Counter knee' : tpl === 'takedown' ? 'Counter arm drag' : 'Counter neckbreaker' }); }
  } else if (th.kind === 'whip') {
    if (a.move) endMoveEarly(G, a);
    setSt(a, 'idle'); setSt(d, 'idle');
    whip(G, d, a, -fwdX(a.yaw), -fwdZ(a.yaw));
  } else if (th.kind === 'lock') {
    breakLock(G, d.lock || a.lock); startSolo(G, d, 'shove', { target: a, noRev: true }); setSt(a, 'hit'); a.stun = 0.5; a.anim = 'stagger';
  } else if (th.kind === 'dive') {
    // roll out of the way: the dive lands on canvas
    d.rollAway = 1;
  }
}

/* ------------------------------------------------------------ two-person moves */
function startDuo(G, a, d, tplName, o) {
  const tpl = DUO[tplName]; if (!tpl) return;
  o = o || {};
  if (a.lock) breakLock(G, a.lock, true);
  const dur = tpl.dur * (o.speed || 1);
  const mv = { tpl, id: tplName, a, d, t: 0, dur, hit: false, name: o.name || tpl.name, dmg: o.dmg || tpl.dmg, fin: !!o.fin, sig: !!o.sig, autoPin: !!o.autoPin, hold: o.hold || null, ax: a.x, az: a.z };
  a.move = mv; d.move = mv; a.role = 'a'; d.role = 'd';
  setSt(a, 'move'); setSt(d, 'move');
  a.anim = tplName + ':a'; d.anim = tplName + ':d'; a.adur = d.adur = dur;
  a.threat = null; d.threat = null;
  if (!o.noRev && !(G.cfg.mode === 'practice' && a === G.P && G.lesson && G.lesson.k !== 'reverse')) {
    const k = mv.fin ? 'fin' : 'grapple';
    const w0 = G.time + (mv.fin ? 0.1 : 0.04), w1 = G.time + (mv.fin ? 0.26 : 0.32);
    threaten(G, d, a, k, w1, w0, w1);
  }
  a.stam = Math.max(0, a.stam - (mv.fin ? 14 : 8));
  if (mv.fin || mv.sig) { ev(G, mv.fin ? 'finStart' : 'sigStart', { a, d, m: mv.name }); say(G, mv.fin ? 'finisher' : 'sig', { a, d, m: mv.name }); }
}
function endMoveEarly(G, w) {
  const mv = w.move; if (!mv) return;
  for (const x of [mv.a, mv.d]) { x.move = null; if (x.st === 'move') { x.h = Math.max(x.h, 0.9); x.pitch = 0; stand(G, x); } }
}
function updateDuo(G, mv, dt) {
  const a = mv.a, d = mv.d, tpl = mv.tpl;
  mv.t += dt;
  const k = clamp(mv.t / mv.dur, 0, 1);
  a.ak = d.ak = k;
  const A = tpl.A, D = tpl.D;
  a.h = key(A.h, k) ?? 1; a.pitch = key(A.pitch, k) ?? 0; a.roll = key(A.roll, k) ?? 0; a.yawOff = 0;
  const yaw = a.yaw, fx = fwdX(yaw), fz = fwdZ(yaw), sx = fz, sz = -fx;
  const af = key(A.fwd, k) ?? 0, as = key(A.side, k) ?? 0;
  a.x = mv.ax + fx * af + sx * as; a.z = mv.az + fz * af + sz * as;
  const df = key(D.fwd, k) ?? 0.75, ds = key(D.side, k) ?? 0;
  d.x = mv.ax + fx * df + sx * ds; d.z = mv.az + fz * df + sz * ds;
  d.yaw = yaw + (key(D.yaw, k) ?? PI); d.yawOff = 0;
  d.h = (key(D.h, k) ?? 1) * PHf(a) / PHf(d); d.pitch = key(D.pitch, k) ?? 0; d.roll = key(D.roll, k) ?? 0;
  if (!mv.hit && k >= tpl.I) {
    mv.hit = true;
    hurt(G, d, a, mv.dmg * (0.85 + a.def.stats.pow * 0.25), { momK: mv.fin ? 0 : 1 });
    a.stats.moves++; G.stats.moves++;
    if (mv.fin) { a.mom = 0; a.stats.fins++; G.stats.fins++; d.finHit = 1; } else if (mv.sig) a.mom = Math.max(0, a.mom - 50);
    G.crowd = Math.min(1, G.crowd + (mv.fin ? 0.45 : mv.sig ? 0.25 : 0.1));
    ev(G, 'impact', { a, d, x: d.x, z: d.z, y: d.yb, big: mv.fin ? 3 : mv.sig ? 2 : 1, m: mv.name });
    if (!mv.fin && !mv.sig) { if (R() < 0.35) say(G, 'big', { a, d, m: mv.name }); }
    pop(G, mv.name, a.def.col, mv.fin ? 2 : mv.sig ? 1.4 : 1);
    if (mv.fin && !mv.hold && G.cfg.mode !== 'practice') G.replayCd = mv.dur * (1 - tpl.I) + 0.3;
    thud(mv.fin ? 1 : 0.7);
  }
  if (k >= 1) {
    a.move = null; d.move = null;
    clampIn(d); clampIn(a);
    if (mv.hold) { startSub(G, a, d, mv.hold, mv.name, true); return; }
    const dEnd = tpl.dEnd || 'up';
    if (dEnd === 'hit') { setSt(d, 'hit'); d.stun = 0.75; d.anim = 'stagger'; d.h = 1; d.pitch = 0; }
    else down(G, d, dEnd, (tpl.dGet || 1.6) * (mv.fin ? 1.6 : 1));
    const aEnd = tpl.aEnd || 'stand';
    if (aEnd === 'stand') stand(G, a); else down(G, a, aEnd, tpl.aGet || 0.6);
    if (mv.autoPin && d.st === 'down') { if (a.st === 'down') { stand(G, a); } startPin(G, a, d, true); }
  }
}

/* ------------------------------------------------------------ the lock-up, whips, running */
function startLock(G, a, d) {
  if (a.lock || d.lock) return;
  const L = { a, d, t: 0, chosen: false };
  a.lock = L; d.lock = L; setSt(a, 'lock'); setSt(d, 'lock'); a.anim = d.anim = 'lock';
  a.yaw = faceTo(a, d.x, d.z); d.yaw = a.yaw + PI;
  const mx = (a.x + d.x) / 2, mz = (a.z + d.z) / 2;
  L.mx = mx; L.mz = mz;
  threaten(G, d, a, 'lock', G.time + 0.28, G.time + 0.06, G.time + 0.28);
  thud(0.3);
}
function breakLock(G, L, silent) {
  if (!L) return;
  for (const w of [L.a, L.d]) { w.lock = null; if (w.st === 'lock') stand(G, w); }
  void silent;
}
function whip(G, a, d, dx, dz) {
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  if (d.lock) breakLock(G, d.lock, true);
  stand(G, a); startSolo(G, a, 'whip', { target: d, noRev: true });
  setSt(d, 'run'); d.run.x = dx; d.run.z = dz; d.run.forced = true; d.run.n = 0; d.yaw = Math.atan2(dx, dz); d.anim = 'run';
  a.whipped = d;
  ev(G, 'whip', { a, d });
}
function runSpeed(w) { return (4.6 + w.def.stats.spd * 1.8) * (w.stam < 20 ? 0.8 : 1); }

/* ------------------------------------------------------------ pins, holds, count outs */
function startPin(G, a, d, bridge) {
  if (!d.legal && G.cfg.match === 'tag') return;
  stand(G, a);
  setSt(a, 'pin'); setSt(d, 'pinned'); a.anim = bridge ? 'bridge' : 'cover'; d.anim = 'pinned';
  torso(d, _p);
  const s = R() < 0.5 ? 1 : -1, px = Math.cos(d.yaw) * s, pz = -Math.sin(d.yaw) * s;
  a.x = _p.x + px * 0.38; a.z = _p.z + pz * 0.38; a.yaw = Math.atan2(-px, -pz); a.yb = d.yb; a.out = d.out;
  a.h = 0.42; a.pitch = 1.42; a.roll = 0;
  if (bridge) { a.x = d.x - fwdX(d.yaw) * 0.2; a.z = d.z - fwdZ(d.yaw) * 0.2; a.yaw = d.yaw + PI; a.h = 0.62; a.pitch = -1.25; }
  const kickAt = aiKickout(G, d, a);
  G.pin = { a, d, t: 0, count: 0, next: 0.55, kickAt, nk: d === G.P && !d.bot ? needle(G, d) : null, bridge: !!bridge, refIn: false, ropeOK: d === G.P && !d.bot ? true : R() < 0.45 };
  ev(G, 'pin', { a, d }); say(G, 'pin', { a, d }, true);
  G.crowd = Math.min(1, G.crowd + 0.1);
  d.threat = null; a.threat = null;
}
function needle(G, d) {
  const fin = d.finHit > 0;
  const w = clamp(0.36 - d.dmg * 0.0024 - (fin ? 0.1 : 0), 0.06, 0.36) * (G.cfg.diff === 'easy' ? 1.35 : G.cfg.diff === 'hard' ? 0.85 : 1);
  return { p: 0, dir: 1, speed: 0.9, c: rnd(0.3, 0.7), w, done: false, miss: 0 };
}
function aiKickout(G, d, a) {
  // when (in counts) the AI wrestler gets a shoulder up; 9 = never
  if (d === G.P && !d.bot) return 9;
  if (G.cfg.mode === 'practice') return 9;
  const fin = d.finHit > 0 ? 0.32 : 0;
  let p = 1.27 - Math.pow(d.dmg / 100, 1.6) * 1.07 - fin + (d.bot ? G.D.kick : -G.D.kick) * (d.bot ? 1 : 0) + d.def.stats.tough * 0.12 + d.fired * 0.1;
  if (d.dmg < 30) return rnd(0.6, 1.3);
  if (R() < p) return R() < 0.55 ? rnd(2.55, 2.92) : rnd(1.2, 2.2);
  return 9;
}
function startSub(G, a, d, holdName, name, fromFin) {
  const H = HOLDS[holdName] || HOLDS.armLock;
  stand(G, a);
  setSt(a, 'sub'); setSt(d, 'sub'); a.role = 'a'; d.role = 'd';
  a.anim = 'hold:' + holdName + ':a'; d.anim = 'hold:' + holdName + ':d';
  if (holdName === 'sitLock') { d.face = 'front'; d.pitch = HALF; } else { d.face = 'up'; d.pitch = -HALF; }
  d.h = LIE; d.anim = 'hold:' + holdName + ':d';
  G.sub = { a, d, hold: holdName, H, name: name || H.name, t: 0, press: fromFin ? 34 : 14, esc: 0, fin: !!fromFin };
  placeSub(G);
  ev(G, 'sub', { a, d, m: G.sub.name }); say(G, 'sub', { a, d, m: G.sub.name });
  G.crowd = Math.min(1, G.crowd + 0.12);
  d.threat = null;
}
function placeSub(G) {
  const s = G.sub, a = s.a, d = s.d, f = d.face === 'front' ? 1 : -1;
  const hx = fwdX(d.yaw), hz = fwdZ(d.yaw);
  if (s.hold === 'legLock') { a.x = d.x - hx * f * 0.95; a.z = d.z - hz * f * 0.95; a.yaw = Math.atan2(d.x - a.x, d.z - a.z); a.h = 0.66; a.pitch = -0.35; }
  else if (s.hold === 'armLock') { torso(d, _p); a.x = _p.x + Math.cos(d.yaw) * 0.5; a.z = _p.z - Math.sin(d.yaw) * 0.5; a.yaw = Math.atan2(d.x - a.x, d.z - a.z) + HALF; a.h = 0.24; a.pitch = -1.1; }
  else { a.x = d.x + hx * 0.1; a.z = d.z + hz * 0.1; a.yaw = d.yaw; a.h = 0.62; a.pitch = -0.45; }
  a.yb = d.yb; a.out = d.out; a.roll = 0;
}

/* ------------------------------------------------------------ the referee */
function updateRef(G, dt) {
  const r = G.ref; r.t += dt;
  let tx = 0, tz = -1.6, look = null, want = 'watch';
  if (G.pin) {
    const d = G.pin.d; torso(d, _p);
    const ox = Math.cos(d.yaw), oz = -Math.sin(d.yaw), s = (G.pin.a.x - _p.x) * ox + (G.pin.a.z - _p.z) * oz > 0 ? -1 : 1;
    tx = _p.x + ox * 0.85 * s - fwdX(d.yaw) * (d.face === 'front' ? -0.2 : 0.2); tz = _p.z + oz * 0.85 * s; want = 'count'; look = _p;
  } else if (G.sub) { const d = G.sub.d; tx = d.x + 1.1; tz = d.z - 0.4; want = 'sub'; look = d; }
  else if (G.cout) { const o = G.cout.w; tx = clamp(o.x, -RIN + 0.3, RIN - 0.3); tz = clamp(o.z, -RIN + 0.3, RIN - 0.3); want = 'cout'; look = o; }
  else if (G.phase === 'post' && G.winner) { const w = G.winner; tx = w.x + Math.cos(w.yaw) * 0.55; tz = w.z - Math.sin(w.yaw) * 0.55; want = 'raise'; look = w; }
  else {
    let cx = 0, cz = 0, n = 0;
    for (const w of G.W) if (!w.elim && !w.gone && !w.apron && inRing(w)) { cx += w.x; cz += w.z; n++; }
    if (n) { cx /= n; cz /= n; }
    // stay out of the TV camera's line: on the far side of the action
    tx = clamp(cx * 0.5 + (cx > 0 ? -1.2 : 1.2), -2.3, 2.3); tz = clamp(cz - 1.7, -2.4, 1.2);
    look = n ? { x: cx, z: cz } : null;
  }
  tx = clamp(tx, -RIN + 0.15, RIN - 0.15); tz = clamp(tz, -RIN + 0.15, RIN - 0.15);
  const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz);
  const sp = want === 'count' ? 4.2 : 2.4;
  const v = d > 0.08 ? Math.min(sp, d * 3) : 0;
  if (d > 0.01) { r.x += dx / d * v * dt; r.z += dz / d * v * dt; }
  r.speed = v;
  if (look) { const ty = Math.atan2(look.x - r.x, look.z - r.z); r.yaw += wrapA(ty - r.yaw) * Math.min(1, dt * 6); }
  r.near = d < 0.35;
  r.st = want;
  r.slap = Math.max(0, r.slap - dt);
  r.anim = want === 'count' && r.near ? 'count' : want === 'raise' && r.near ? 'raise' : want === 'cout' ? 'cout' : want === 'sub' ? 'sub' : 'idle';
}

/* ------------------------------------------------------------ AI */
function newAI(w, G) {
  return { think: rnd(0.3, 0.9), plan: null, planT: 0, press: [], revd: 0, rest: 0, goal: null, hes: 0, lastAct: '', idleT: 0, tagWant: false, runT: 0, combo: 0, mashT: 0, step: 0, ox: 0, oz: 0 };
}
function aiPlanReverse(G, w) {
  const ai = w.ai, th = w.threat; if (!ai || !th) return;
  const D = G.D, st = w.def.stats;
  let p = D.rev * (0.55 + st.tec * 0.45) * (w.stam < 25 ? 0.7 : 1) * (th.kind === 'fin' ? 0.55 : 1) * (1 - w.frustr * 0.35) * (1 + w.fired * 0.2);
  if (G.cfg.mode === 'practice' || G.calm) p = 0;
  if (w.team === G.P.team && !w.bot) return;
  const mid = (th.w0 + th.w1) / 2;
  if (R() < p) ai.press.push(mid + gauss() * G.D.err * 0.6);
  else if (R() < 0.25) ai.press.push(th.w0 - rnd(0.05, 0.25)); // a mistimed, early press
}
function aiKeep(G, w) {
  // the AI's own copy of player input
  return w.ai.ctl || (w.ai.ctl = { mx: 0, mz: 0, run: false, strike: false, grapple: false, rev: false, pin: false, special: false, action: false, mash: false, whipDir: null, dir: 'n' });
}
function aiThink(G, w, dt) {
  const ai = w.ai, D = G.D, c = aiKeep(G, w);
  c.strike = c.grapple = c.rev = c.pin = c.special = c.action = c.mash = false; c.whipDir = null; c.dir = 'n';
  // scheduled reversal presses
  for (let i = ai.press.length - 1; i >= 0; i--) if (G.time >= ai.press[i]) { ai.press.splice(i, 1); c.rev = true; }
  if (w.st === 'pinned' || (w.st === 'sub' && w.role === 'd') || w.st === 'down') {
    ai.mashT -= dt; if (ai.mashT <= 0) { c.mash = true; ai.mashT = 1 / (D.mash * rnd(0.7, 1.1) * (w.bot ? 1 : 1)); }
  }
  if (w.st === 'sub' && w.role === 'a') { ai.mashT -= dt; if (ai.mashT <= 0) { c.mash = true; ai.mashT = 1 / (D.mash * 0.8); } }
  if (w.apron) { aiApron(G, w, c); return c; }
  ai.think -= dt;
  const T = w.target = bestTarget(G, w);
  // movement intent persists between thoughts; decisions only every so often
  if (ai.think > 0) { aiSteer(G, w, c, T, dt); return c; }
  ai.think = rnd(0.22, 0.48) + D.react * rnd(0.6, 1.3) + (R() < D.hes ? rnd(0.3, 0.9) : 0);
  const st = w.def.style, ss = w.def.stats;
  ai.goal = null;
  if (G.cfg.mode === 'practice' && w !== G.P) {
    const L = G.lesson;
    ai.goal = L && L.k === 'reverse' ? 'attack' : T && dist(w, T) > 2.6 ? 'approach' : 'circle';
    if (w.st === 'perch' || w.out) ai.goal = w.out ? 'rollIn' : null;
    if (w.out && ropeDistOut(w) < 0.55) c.action = true;
    return c;
  }
  if (w.out) {
    const wait = G.cout && G.cfg.countout === 'on' && G.cout.n < 6 && w.dmg > 55 && R() < 0.5;
    ai.goal = wait ? null : 'rollIn';
    if (ai.goal === 'rollIn' && ropeDistOut(w) < 0.55) c.action = true;
    return c;
  }
  if (w.st === 'perch') {
    if (T && isDown(T) && dist(w, T) < 4.6) { if (w.mom >= 100 && w.def.fin.kind === 'aerial') c.special = true; else c.strike = true; }
    else if (T && standing(T) && dist(w, T) < 4.2 && R() < 0.5) c.strike = true;
    else if (w.t > 2.6) c.action = true;
    return c;
  }
  if (w.st === 'lock' && w.lock && w.lock.a === w) { aiLockChoice(G, w, c, T); return c; }
  if (w.st === 'run' && !w.run.forced && T && dist(w, T) < 2.2 && standing(T)) { c.strike = true; return c; }
  if (w.st !== 'idle') return c;
  if (!T) { ai.goal = 'center'; return c; }
  const d = dist(w, T);
  const aggr = D.aggr * (0.85 + w.fired * 0.3 + w.frustr * 0.25) * (w.dmg > 75 ? 0.75 : 1);
  // tag team: tag out when hurt
  if (G.cfg.match === 'tag' && w.legal) {
    const mate = G.W.find((o) => o !== w && o.team === w.team && o.apron);
    if (mate && (w.dmg > 42 || w.stam < 25) && mate.dmg < w.dmg - 10 && R() < 0.45) { ai.goal = 'tag'; const c0 = cornerOf(w.team); if (Math.hypot(w.x - c0.tx, w.z - c0.tz) < 0.9) c.action = true; return c; }
  }
  // break a pin or a hold someone else has
  if ((G.pin && G.pin.a !== w && G.pin.d !== w) || (G.sub && G.sub.a !== w && G.sub.d !== w)) {
    const busy = G.pin ? G.pin.a : G.sub.a;
    if (busy.team !== w.team && R() < 0.75 * aggr) { w.target = busy; ai.goal = 'attack'; if (dist(w, busy) < 1.4) c.strike = true; return c; }
  }
  if (isDown(T)) {
    const near = d < 1.6;
    const dmg = T.dmg;
    const pinW = clamp((dmg - 35) / 50, 0, 1) * (T.finHit > 0 ? 2.5 : 1);
    const subW = (st === 'technical' ? 0.5 : 0.18) * clamp((dmg - 30) / 50, 0.1, 1);
    const groundW = 0.45;
    const climbW = (ss.air > 0.6 ? 0.55 : 0.05) * (T.getT - T.t > 1.6 ? 1 : 0.1);
    const tauntW = w.mom < 100 ? 0.22 + (w.def.heel ? 0.15 : 0) : 0.05;
    const liftW = 0.18;
    const tot = pinW + subW + groundW + climbW + tauntW + liftW;
    let r = R() * tot;
    let choice = 'pin';
    for (const [k, v] of [['pin', pinW], ['sub', subW], ['ground', groundW], ['climb', climbW], ['taunt', tauntW], ['lift', liftW]]) { r -= v; if (r <= 0) { choice = k; break; } }
    if (w.mom >= 100 && w.def.fin.kind === 'aerial') choice = 'climb';
    else if (w.mom >= 100 && T.getT - T.t < 1.2) choice = 'wait';
    ai.goal = choice;
    if (choice === 'taunt') c.special = w.mom < 50;
    if (near) {
      if (choice === 'pin' && bodyReach(T) > 3.0 && R() < 0.6) c.action = true;
      else if (choice === 'pin') c.pin = true; else if (choice === 'sub') c.grapple = true; else if (choice === 'ground') c.strike = true; else if (choice === 'lift') c.action = true;
    }
    if (choice === 'climb') { const cn = nearestCorner(w); if (Math.hypot(w.x - cn.x, w.z - cn.z) < 0.7) c.action = true; }
    return c;
  }
  // T standing
  if (T.st === 'perch' && d < 1.4) { c.strike = true; return c; }
  if (T.st === 'run') {
    const coming = T.run.x * (w.x - T.x) + T.run.z * (w.z - T.z) > 0;
    if (coming) { ai.goal = null; ai.think = 0.05; if (d < 2.3) { if (R() < 0.55) c.strike = true; else c.grapple = true; } return c; }
  }
  if (d > 2.4) {
    ai.goal = 'approach';
    if (d > 3.4 && R() < 0.12 * aggr * (0.5 + ss.spd)) { c.run = true; ai.runT = 0.8; }
    return c;
  }
  if (d > 1.25) { ai.goal = 'approach'; if (R() < 0.12 * aggr && w.stam > 40) { c.run = true; ai.runT = 0.6; } return c; }
  // in range
  if (w.mom >= 100 && R() < 0.7) { c.special = true; return c; }
  if (w.mom >= 50 && w.mom < 100 && R() < 0.22) { c.special = true; return c; }
  const sw = st === 'striker' ? 0.62 : st === 'power' || st === 'giant' ? 0.36 : 0.45;
  if (w.stam < 18 && R() < 0.4) { ai.goal = 'backoff'; return c; }
  if (R() < 0.12) { ai.goal = 'circle'; return c; }
  if (R() < sw) { c.strike = true; ai.combo = R() < 0.6 ? 2 : 1; }
  else c.grapple = true;
  return c;
}
function aiApron(G, w, c) {
  const mate = G.W.find((o) => o !== w && o.team === w.team && o.legal && !o.elim);
  w.reach = !!(mate && mate.ai && (mate.ai.goal === 'tag' || (!mate.bot && mate.dmg > 40)) && Math.hypot(mate.x - cornerOf(w.team).tx, mate.z - cornerOf(w.team).tz) < 1.6);
  // run in to save the pin
  if (G.pin && G.pin.d === mate && G.pin.count >= 1 && G.pin.t > 0.5 && !w.saveTried) { w.saveTried = true; if (R() < 0.45 * G.D.aggr) c.action = true; }
  if (!G.pin) w.saveTried = false;
}
function aiLockChoice(G, w, c, T) {
  const ai = w.ai, L = w.lock;
  if (L.t < 0.18 + G.D.react * 0.6) return;
  if (L.ai) return;
  L.ai = true;
  const st = w.def.style, d = L.d;
  if (w.mom >= 100) { c.special = true; return; }
  if (w.mom >= 50 && R() < 0.3) { c.special = true; return; }
  if (ropeDist(d) < 0.7 && R() < 0.25 && G.cfg.countout === 'on' && G.cfg.match !== 'triple' && G.cfg.match !== 'elim') { c.action = true; return; }
  const r = R();
  if (r < 0.22) { const a = rnd(-PI, PI); c.whipDir = { x: Math.sin(a), z: Math.cos(a) }; return; }
  const heavy = R() < (st === 'power' || st === 'giant' ? 0.65 : 0.45) * (w.stam > 30 ? 1 : 0.4);
  c.dir = pick(['n', 't', 'a', 's']);
  if (heavy) c.grapple = true; else c.strike = true;
}
function nearestCorner(w) { const sx = w.x >= 0 ? 1 : -1, sz = w.z >= 0 ? 1 : -1; return { x: sx * 2.45, z: sz * 2.45, sx, sz }; }
function ropeDistOut(w) { return Math.max(Math.abs(w.x), Math.abs(w.z)) - APRON; }
function aiSteer(G, w, c, T, dt) {
  const ai = w.ai;
  c.mx = 0; c.mz = 0;
  if (w.st !== 'idle' && w.st !== 'run') return;
  if (ai.runT > 0) { ai.runT -= dt; c.run = true; } else c.run = false;
  let tx = null, tz = null, stop = 0;
  if (ai.goal === 'rollIn') { const m = Math.max(Math.abs(w.x), Math.abs(w.z)); const sx = Math.abs(w.x) >= Math.abs(w.z); tx = sx ? Math.sign(w.x) * (APRON + 0.25) : clamp(w.x, -2.4, 2.4); tz = sx ? clamp(w.z, -2.4, 2.4) : Math.sign(w.z) * (APRON + 0.25); stop = 0.15; void m; }
  else if (ai.goal === 'tag') { const c0 = cornerOf(w.team); tx = c0.tx; tz = c0.tz; stop = 0.25; if (Math.hypot(w.x - tx, w.z - tz) < 0.8) c.action = true; }
  else if (ai.goal === 'climb') { const cn = nearestCorner(w); tx = cn.x; tz = cn.z; stop = 0.2; if (Math.hypot(w.x - tx, w.z - tz) < 0.6) c.action = true; }
  else if (ai.goal === 'center') { tx = 0; tz = 0; stop = 1; }
  else if (T && ai.goal === 'backoff') { tx = w.x + (w.x - T.x); tz = w.z + (w.z - T.z); stop = 0.1; }
  else if (T && ai.goal === 'circle') { const a = faceTo(T, w.x, w.z) + 0.9; tx = T.x + Math.sin(a) * 1.8; tz = T.z + Math.cos(a) * 1.8; stop = 0.2; }
  else if (T) {
    if (isDown(T)) { torso(T, _p); tx = _p.x; tz = _p.z; stop = ai.goal === 'wait' ? 1.4 : 0.85; }
    else { tx = T.x; tz = T.z; stop = ai.goal === 'attack' ? 0.8 : 1.05; }
  }
  if (w.st === 'run' && !w.run.forced && T && standing(T) && dist(w, T) < 1.9) c.strike = true;
  if (tx == null) return;
  const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
  if (d > stop) { const s = Math.min(1, (d - stop) * 2.2); c.mx = dx / d * s; c.mz = dz / d * s; }
  // keep apart from team-mates and the ref a little, and wander a touch so they never look like machines
  c.mx += Math.sin(G.time * 0.7 + w.i * 2.1) * 0.08; c.mz += Math.cos(G.time * 0.6 + w.i * 1.3) * 0.08;
}

/* ------------------------------------------------------------ player input */
const PC = { mx: 0, mz: 0, run: false, strike: false, grapple: false, rev: false, pin: false, special: false, action: false, mash: false, whipDir: null, dir: 'n', skip: false };
let padRB = false;
function readPlayer(G, a) {
  const inp = a.input, c = PC;
  c.strike = c.grapple = c.rev = c.pin = c.special = c.action = c.mash = c.skip = false; c.whipDir = null; c.dir = 'n';
  const ax = inp.axis();
  const cy = G.camYaw, fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
  c.mx = rx * ax.x - fx * ax.y; c.mz = rz * ax.x - fz * ax.y;
  c.run = inp.down('ShiftLeft', 'ShiftRight');
  if (inp.hit('KeyJ') || MOUSE.click) c.strike = true;
  if (inp.hit('KeyK') || MOUSE.rclick) c.grapple = true;
  if (inp.hit('KeyL')) c.rev = true;
  if (inp.hit('KeyE')) c.pin = true;
  if (inp.hit('Space')) c.special = true;
  if (inp.hit('KeyF')) c.action = true;
  if (inp.hit('Enter', 'NumpadEnter')) c.skip = true;
  // controller bumpers: Action
  try {
    if (a.gamepad && navigator.getGamepads) {
      const all = navigator.getGamepads(); let g = null;
      for (let i = 0; i < all.length; i++) if (all[i] && all[i].connected) { g = all[i]; break; }
      const on = !!(g && ((g.buttons[4] && g.buttons[4].pressed) || (g.buttons[5] && g.buttons[5].pressed)));
      if (on && !padRB) c.action = true; padRB = on;
    }
  } catch (e) { /* no pad */ }
  MOUSE.click = false; MOUSE.rclick = false;
  // touch gestures
  const tap = inp.tap(), sw = inp.swipe();
  const P = G.P;
  if (tap) {
    if (P.threat || G.phase !== 'live') { c.rev = true; c.skip = true; }
    else if ((G.pin && G.pin.d === P) || (G.sub && (G.sub.d === P || G.sub.a === P)) || P.st === 'down') c.mash = true;
    else if (P.lock && P.lock.a === P) c.strike = true;
    else c.strike = true;
  }
  if (sw) {
    c.skip = true;
    const sx = Math.sin(cy), sz = Math.cos(cy);
    const wx = -Math.cos(cy) * (sw.dx) - sx * sw.dy, wz = Math.sin(cy) * sw.dx - sz * sw.dy;
    if (P.lock && P.lock.a === P) {
      if (sw.dir === 'up') { c.grapple = true; c.dir = 't'; }
      else if (sw.dir === 'down') { c.grapple = true; c.dir = 'a'; }
      else c.whipDir = { x: wx, z: wz };
    } else if (sw.dir === 'up') c.grapple = true;
    else if (sw.dir === 'down') {
      const T = bestTarget(G, P);
      if (T && isDown(T) && dist(P, T) < 1.8) c.pin = true; else c.action = true;
    } else { P.dash = 0.55; P.dashX = wx; P.dashZ = wz; }
  }
  if (P.dash > 0) { const l = Math.hypot(P.dashX, P.dashZ) || 1; c.mx = P.dashX / l; c.mz = P.dashZ / l; c.run = true; }
  // in a lock, the stick picks which variant
  if (P.lock && P.lock.a === P && Math.hypot(c.mx, c.mz) > 0.3 && c.dir === 'n') {
    const rel = wrapA(Math.atan2(c.mx, c.mz) - P.yaw);
    c.dir = Math.abs(rel) < 0.8 ? 't' : Math.abs(rel) > 2.35 ? 'a' : 's';
    if (c.run && !c.grapple && !c.strike) { c.whipDir = { x: c.mx, z: c.mz }; }
  }
  if (c.strike || c.grapple || c.rev || c.pin) c.mash = true;
  return c;
}

/* ------------------------------------------------------------ acting on intent (player and AI alike) */
function act(G, w, c, dt) {
  if (w.elim || w.gone) return;
  if (c.rev && w.threat) tryReverse(G, w);
  else if (c.rev && w.lock && w.lock.d === w && !w.threat) { /* nothing */ }
  // apron partners: tag or save
  if (w.apron) {
    if (c.action && G.pin && G.pin.d.team === w.team && G.pin.count >= 1) { saveIn(G, w); }
    return;
  }
  switch (w.st) {
    case 'idle': return actIdle(G, w, c, dt);
    case 'run': return actRun(G, w, c, dt);
    case 'lock': return actLock(G, w, c);
    case 'perch': return actPerch(G, w, c);
    case 'down': if (c.mash) w.t += 0.07 * (0.8 + w.def.stats.tough * 0.4); return;
    case 'solo':
      if (c.strike && w.solo && SOLO[w.solo.name] && w.def.strikes.indexOf(w.solo.name) >= 0 && w.solo.t > w.solo.dur * w.solo.d.I) w.comboQ = true;
      return;
    case 'sub': if (c.mash && G.sub) { if (G.sub.d === w) G.sub.esc += 4.5 * (0.6 + (100 - w.dmg) / 160) * (0.7 + w.stam / 300); else if (G.sub.a === w) G.sub.press += 1.1; } return;
    case 'pinned': if (c.mash && G.pin && G.pin.nk && !G.pin.nk.done) pinPress(G); return;
    default: return;
  }
}
function actIdle(G, w, c, dt) {
  const T = w.target = bestTarget(G, w);
  const m = Math.hypot(c.mx, c.mz);
  // stamina recovers when not running
  // actions
  if (c.special) { if (trySpecial(G, w, T)) return; }
  if (c.action && tryAction(G, w, T)) return;
  if (c.pin && T && isDown(T) && T.st === 'down' && sameLevel(w, T) && inRing(T)) { torso(T, _p); if (Math.hypot(w.x - _p.x, w.z - _p.z) < 1.5 && (G.cfg.match !== 'tag' || (w.legal && T.legal))) { startPin(G, w, T); return; } }
  if (c.grapple && T && sameLevel(w, T)) {
    if (isDown(T) && T.st === 'down' && inRing(T)) { torso(T, _p); if (Math.min(dist(w, T), Math.hypot(w.x - _p.x, w.z - _p.z)) < 1.6) { startSub(G, w, T, w.def.sub.tpl, w.def.sub.name); return; } }
    else if (standing(T) && T.st !== 'perch' && dist(w, T) < 1.4 && Math.abs(wrapA(faceTo(w, T.x, T.z) - w.yaw)) < 1.4) { startLock(G, w, T); return; }
  }
  if (c.strike) {
    if (T && isDown(T) && T.st === 'down' && dist(w, T) < 1.8 && sameLevel(w, T)) { w.yaw = faceTo(w, T.x, T.z); startSolo(G, w, w.def.ground, { target: T }); return; }
    if (T && T.st === 'perch' && dist(w, T) < 1.6) { knockOffTop(G, T, w); startSolo(G, w, 'forearm', { target: null }); return; }
    if (T && T.st === 'run' && dist(w, T) < 2.6) { w.yaw = faceTo(w, T.x, T.z); startSolo(G, w, w.def.run === 'dropkick' ? 'dropkick' : w.def.run === 'bigboot' ? 'bigboot' : 'clothes', { target: T, counter: true }); return; }
    w.combo = 0;
    if (T && dist(w, T) < 1.9) w.yaw = faceTo(w, T.x, T.z);
    startSolo(G, w, w.def.strikes[0], { target: T });
    w.stam = Math.max(0, w.stam - 3);
    return;
  }
  if (c.grapple && T && T.st === 'run' && dist(w, T) < 2.4) { w.yaw = faceTo(w, T.x, T.z); w.counterGrab = T; w.cgT = 0.5; }
  if (c.special) { startSolo(G, w, 'taunt', {}); return; }
  // movement
  if (m > 0.12) {
    if (c.run && w.stam > 8 && !w.out) { setSt(w, 'run'); w.run.x = c.mx / m; w.run.z = c.mz / m; w.run.forced = false; w.run.n = 0; w.yaw = Math.atan2(w.run.x, w.run.z); w.anim = 'run'; return; }
    const sp = (1.55 + w.def.stats.spd * 0.9) * Math.min(1, m) * (w.stam < 15 ? 0.7 : 1) * (1 - w.dmg / 400);
    w.x += c.mx / Math.max(1, m) * sp * dt; w.z += c.mz / Math.max(1, m) * sp * dt; w.speed = sp;
    const want = T && dist(w, T) < 2.6 ? faceTo(w, T.x, T.z) : Math.atan2(c.mx, c.mz);
    w.yaw += wrapA(want - w.yaw) * Math.min(1, dt * 9);
    w.anim = 'walk';
  } else {
    if (T && dist(w, T) < 4) w.yaw += wrapA(faceTo(w, T.x, T.z) - w.yaw) * Math.min(1, dt * 5);
    w.anim = 'idle';
  }
  clampIn(w);
}
function actRun(G, w, c, dt) {
  const T = bestTarget(G, w);
  if (!w.run.forced && !c.run && !w.dash) { stand(G, w); return; }
  if (!w.run.forced) {
    const m = Math.hypot(c.mx, c.mz);
    if (m > 0.3) { const a = Math.atan2(c.mx, c.mz), cur = Math.atan2(w.run.x, w.run.z), na = cur + clamp(wrapA(a - cur), -dt * 3.5, dt * 3.5); w.run.x = Math.sin(na); w.run.z = Math.cos(na); }
    if (c.strike && T && sameLevel(w, T)) {
      w.yaw = Math.atan2(w.run.x, w.run.z);
      if (isDown(T)) { startSolo(G, w, w.def.ground, { target: T }); return; }
      startSolo(G, w, w.def.run, { target: T }); return;
    }
  }
  w.stam = Math.max(0, w.stam - dt * (w.run.forced ? 2 : 9));
}
function actLock(G, w, c) {
  const L = w.lock; if (!L || L.a !== w || L.chosen) return;
  const d = L.d;
  if (c.special && w.mom >= 50) { L.chosen = true; doSpecialMove(G, w, d); return; }
  if (c.whipDir) { L.chosen = true; whip(G, w, d, c.whipDir.x, c.whipDir.z); threaten(G, d, w, 'whip', G.time + 0.3, G.time + 0.02, G.time + 0.3); return; }
  if (c.action && ropeDist(d) < 0.75) { L.chosen = true; breakLock(G, L, true); tossOver(G, w, d); return; }
  if (c.strike) { L.chosen = true; const map = { n: 'takedown', t: 'stun', a: 'takedown', s: 'takedown' }; const nm = { n: 'Snapmare', t: 'Knee to the gut', a: 'Arm drag', s: 'Hip toss' }; startDuo(G, w, d, map[c.dir], { name: nm[c.dir] }); return; }
  if (c.grapple) { L.chosen = true; const tpl = w.def.heavy[c.dir] || 'slam'; startDuo(G, w, d, tpl, { name: DUO[tpl].name }); return; }
}
function actPerch(G, w, c) {
  const T = bestTarget(G, w);
  if (c.action) { w.perch = null; w.yb = RH; const cn = nearestCorner(w); w.x = cn.x * 0.94; w.z = cn.z * 0.94; stand(G, w); return; }
  const fin = c.special && w.mom >= 100 && w.def.fin.kind === 'aerial';
  if (c.strike || fin) dive(G, w, T, fin);
}
function trySpecial(G, w, T) {
  if (w.mom < 50 || !T || !sameLevel(w, T)) return false;
  const useFin = w.mom >= 100;
  const mv = useFin ? w.def.fin : w.def.sig;
  if (useFin && mv.kind === 'aerial') { if (w.st === 'perch') { dive(G, w, T, true); return true; } return trySpecialSig(G, w, T); }
  if (!standing(T) || T.st === 'perch' || dist(w, T) > 1.7) return false;
  w.yaw = faceTo(w, T.x, T.z);
  doSpecialMove(G, w, T);
  return true;
}
function trySpecialSig(G, w, T) {
  if (!standing(T) || dist(w, T) > 1.7) return false;
  w.yaw = faceTo(w, T.x, T.z);
  doSpecialMove(G, w, T, true);
  return true;
}
function doSpecialMove(G, w, T, forceSig) {
  const useFin = w.mom >= 100 && !forceSig && w.def.fin.kind !== 'aerial';
  const mv = useFin ? w.def.fin : w.def.sig;
  if (w.lock) breakLock(G, w.lock, true);
  w.yaw = faceTo(w, T.x, T.z); T.yaw = w.yaw + PI;
  if (mv.kind === 'strike') {
    startSolo(G, w, mv.tpl, { target: T, special: useFin ? 'fin' : 'sig', name: mv.name, dmg: mv.dmg });
    if (useFin) { say(G, 'finisher', { a: w, d: T, m: mv.name }); ev(G, 'finStart', { a: w, d: T, m: mv.name }); } else { say(G, 'sig', { a: w, d: T, m: mv.name }); ev(G, 'sigStart', { a: w, d: T, m: mv.name }); }
    return;
  }
  if (mv.kind === 'sub') { startDuo(G, w, T, mv.tpl, { fin: useFin, sig: !useFin, name: mv.name, dmg: mv.dmg, hold: mv.hold }); return; }
  startDuo(G, w, T, mv.tpl, { fin: useFin, sig: !useFin, name: mv.name, dmg: mv.dmg, autoPin: useFin && mv.autoPin });
}
function tryAction(G, w, T) {
  // 1. tag
  if (G.cfg.match === 'tag' && w.legal && inRing(w)) {
    const c0 = cornerOf(w.team), mate = G.W.find((o) => o !== w && o.team === w.team && o.apron);
    if (mate && Math.hypot(w.x - c0.tx, w.z - c0.tz) < 1.0) { tagOut(G, w, mate); return true; }
  }
  // 2. pick a downed rival up
  if (T && T.st === 'down' && dist(w, T) < 1.6 && sameLevel(w, T)) { pickUp(G, w, T); return true; }
  // 3. toss a dazed rival over the top rope
  if (T && (T.st === 'hit') && dist(w, T) < 1.4 && ropeDist(T) < 0.7 && inRing(T)) { tossOver(G, w, T); return true; }
  // 4. climb a corner
  if (inRing(w)) { const cn = nearestCorner(w); if (Math.hypot(w.x - cn.x, w.z - cn.z) < 0.85) { climb(G, w, cn); return true; } }
  // 5. roll out or in
  if (inRing(w) && ropeDist(w) < 0.55) { rollOut(G, w); return true; }
  if (w.out && ropeDistOut(w) < 0.6) { rollIn(G, w); return true; }
  return false;
}
function tagOut(G, w, mate) {
  const c0 = cornerOf(w.team);
  startSolo(G, w, 'tagOut', { mate });
  w.legal = false; mate.legal = true;
  mate.apron = false; startSolo(G, mate, 'tagIn', { from: { x: mate.x, z: mate.z }, to: { x: c0.tx * 0.92, z: c0.tz * 0.92 } });
  mate.mom = Math.min(100, mate.mom + 20); mate.stam = 100;
  ev(G, 'tag', { a: mate, d: w }); say(G, 'tag', { a: mate, d: w }, true);
  G.crowd = Math.min(1, G.crowd + 0.25);
  if (w === G.P) { G.P = mate; mate.bot = false; w.bot = true; w.ai = newAI(w, G); }
  else if (mate === G.P) { /* nothing */ }
}
function saveIn(G, w) {
  // an apron partner hops in to break up a pin, then goes back
  w.apron = false; w.saving = 3.2;
  const c0 = cornerOf(w.team);
  startSolo(G, w, 'tagIn', { from: { x: w.x, z: w.z }, to: { x: c0.tx * 0.92, z: c0.tz * 0.92 } });
  w.target = G.pin.a; w.ai.goal = 'attack';
}
function pickUp(G, w, T) {
  w.yaw = faceTo(w, T.x, T.z);
  startSolo(G, w, 'pickup', { target: T });
  setSt(T, 'solo'); T.solo = { name: 'getup', d: SOLO.getup, t: 0, dur: 0.85, from: T.pitch, lift: true }; T.anim = 'getup';
}
function climb(G, w, cn) {
  w.yaw = Math.atan2(-cn.sx, -cn.sz);
  startSolo(G, w, 'climb', { cn });
  say(G, 'fly', { a: w });
}
function rollOut(G, w) {
  const sx = Math.abs(w.x) >= Math.abs(w.z);
  const ox = sx ? Math.sign(w.x) : 0, oz = sx ? 0 : Math.sign(w.z);
  startSolo(G, w, 'rollOut', { ox, oz, x0: w.x, z0: w.z });
  w.yaw = Math.atan2(ox, oz);
}
function rollIn(G, w) {
  const sx = Math.abs(w.x) >= Math.abs(w.z);
  const ox = sx ? -Math.sign(w.x) : 0, oz = sx ? 0 : -Math.sign(w.z);
  startSolo(G, w, 'rollIn', { ox, oz, x0: w.x, z0: w.z });
  w.yaw = Math.atan2(ox, oz);
}
function tossOver(G, w, T) {
  const sx = Math.abs(T.x) >= Math.abs(T.z);
  const ox = sx ? Math.sign(T.x) : 0, oz = sx ? 0 : Math.sign(T.z);
  w.yaw = faceTo(w, T.x, T.z);
  startSolo(G, w, 'shove', { target: null, noRev: true });
  T.lock = null; T.move = null;
  startSolo(G, T, 'overTop', { ox, oz, x0: T.x, z0: T.z });
  T.yaw = Math.atan2(-ox, -oz);
  hurt(G, T, w, 6);
  ev(G, 'over', { a: w, d: T }); say(G, 'outside', { a: w, d: T });
}
function knockOffTop(G, T, by) {
  T.perch = null; T.yb = RH;
  const cn = nearestCorner(T); T.x = cn.x * 0.98; T.z = cn.z * 0.98;
  hurt(G, T, by, 7);
  down(G, T, 'up', 1.6);
  ev(G, 'impact', { a: by, d: T, x: T.x, z: T.z, y: RH, big: 1, m: 'Knocked off the top' });
}
function dive(G, w, T, fin) {
  const p = w.perch; if (!p) return;
  const valid = T && inRing(T) && (isDown(T) || standing(T));
  const tx = valid ? (isDown(T) ? torsoX(T) : T.x) : 0, tz = valid ? (isDown(T) ? torsoZ(T) : T.z) : 0;
  const dd = valid ? Math.hypot(tx - w.x, tz - w.z) : 9;
  const ok = valid && dd < 4.8;
  const ex = ok ? tx : w.x - p.sx * 2.6, ez = ok ? tz : w.z - p.sz * 2.6;
  w.perch = null;
  setSt(w, 'fly'); w.anim = fin ? (w.def.fin.tpl === 'elbowDive' ? 'elbowDive' : 'splash') : (ok && standing(T) ? 'crossbody' : 'splash');
  const dist2 = Math.hypot(ex - w.x, ez - w.z);
  w.fly = { x0: w.x, z0: w.z, y0: w.yb, ex, ez, t: 0, dur: 0.62 + dist2 * 0.06, target: ok ? T : null, fin: !!fin, kind: w.anim, name: fin ? w.def.fin.name : w.anim === 'crossbody' ? 'Crossbody' : 'Top rope splash' };
  w.yaw = Math.atan2(ex - w.x, ez - w.z);
  if (ok) threaten(G, T, w, isDown(T) ? 'dive' : 'counter', G.time + w.fly.dur * 0.85, G.time + w.fly.dur * 0.3, G.time + w.fly.dur * 0.8);
  if (fin) { say(G, 'finisher', { a: w, d: T || w, m: w.fly.name }); ev(G, 'finStart', { a: w, d: T, m: w.fly.name }); }
  ev(G, 'leap', { a: w });
}
function torsoX(T) { torso(T, _q); return _q.x; }
function torsoZ(T) { torso(T, _q); return _q.z; }

/* ------------------------------------------------------------ updating a wrestler */
function updateW(G, w, dt) {
  if (w.gone) return;
  w.t += dt;
  w.revLock = Math.max(0, w.revLock - dt);
  w.revFlash = w.revFlash > 0 ? Math.max(0, w.revFlash - dt) : Math.min(0, w.revFlash + dt);
  w.finHit = Math.max(0, (w.finHit || 0) - dt * 0.05);
  w.hitT += dt; w.fired = Math.max(0, w.fired - dt * 0.05); w.frustr = Math.max(0, w.frustr - dt * 0.03);
  if (w.dash > 0) w.dash -= dt;
  if (w.threat && G.time > w.threat.w1 + 0.4) w.threat = null;
  if (w.cgT > 0) w.cgT -= dt; else w.counterGrab = null;
  // stamina and a slow recovery of the body
  const resting = w.st === 'idle' || w.st === 'down' || w.apron;
  if (resting) w.stam = Math.min(100, w.stam + dt * (w.apron ? 14 : 7) * (1 - w.dmg / 220));
  if (w.apron) w.dmg = Math.max(0, w.dmg - dt * 0.5);
  switch (w.st) {
    case 'idle': w.h += (1 - w.h) * Math.min(1, dt * 8); w.pitch *= Math.max(0, 1 - dt * 8); break;
    case 'hit': w.stun -= dt; w.h = 1; w.pitch = Math.sin(Math.min(1, w.t * 3) * PI) * -0.18;
      if (w.knock) { w.x -= fwdX(w.yaw) * dt * 2.2 * w.knock; w.z -= fwdZ(w.yaw) * dt * 2.2 * w.knock; w.knock = Math.max(0, w.knock - dt * 2); clampIn(w); }
      if (w.stun <= 0) { w.knock = 0; stand(G, w); } break;
    case 'down':
      w.h = LIE; w.pitch = w.face === 'front' ? HALF : -HALF;
      if (w.rollAway > 0) { w.rollAway -= dt * 2; const s = (w.i % 2 ? 1 : -1); w.x += Math.cos(w.yaw) * s * dt * 2.4; w.z -= Math.sin(w.yaw) * s * dt * 2.4; w.roll = Math.sin((1 - w.rollAway) * TAU) * 0.5; clampIn(w); if (w.rollAway <= 0) w.roll = 0; }
      if (w.t >= w.getT && !(G.pin && G.pin.d === w) && !(G.sub && G.sub.d === w)) {
        setSt(w, 'solo'); w.solo = { name: 'getup', d: SOLO.getup, t: 0, dur: SOLO.getup.dur * (1 + w.dmg / 250), from: w.pitch }; w.anim = 'getup';
      }
      break;
    case 'run': {
      const sp = runSpeed(w);
      w.x += w.run.x * sp * dt; w.z += w.run.z * sp * dt; w.yaw = Math.atan2(w.run.x, w.run.z); w.speed = sp; w.anim = 'run';
      // hit the ropes and come back
      let bounced = false;
      if (Math.abs(w.x) > RIN && Math.sign(w.x) === Math.sign(w.run.x)) { w.run.x = -w.run.x; bounced = true; w.x = Math.sign(w.x) * RIN; }
      if (Math.abs(w.z) > RIN && Math.sign(w.z) === Math.sign(w.run.z)) { w.run.z = -w.run.z; bounced = true; w.z = Math.sign(w.z) * RIN; }
      if (bounced) { w.run.n++; ev(G, 'rope', { w, x: w.x, z: w.z }); sfx(90, 0.12, { type: 'triangle', vol: 0.08 }); if (w.run.forced && w.run.n >= 2) { stand(G, w); w.stun = 0; } else if (!w.run.forced && w.run.n >= 3) stand(G, w); }
      // a whipped runner coming back at a waiting rival
      if (w.run.forced) {
        for (const o of G.W) {
          if (o === w || o.team === w.team || !(o.st === 'idle' || o.st === 'solo') || !sameLevel(o, w)) continue;
          if (o.counterGrab === w && dist(o, w) < 1.3) { o.counterGrab = null; o.yaw = faceTo(o, w.x, w.z); stand(G, w); w.yaw = o.yaw + PI; startDuo(G, o, w, o.def.heavy.t === 'bomb' || o.def.style === 'giant' ? 'backdrop' : pick(['backdrop', 'slam']), { name: 'Back body drop' }); break; }
        }
        if (w.run.n >= 1 && w.st === 'run') {
          // the whip just bounces back to the middle; slow to a stop if nobody meets them
          if (w.t > 2.4) stand(G, w);
        }
      }
      clampIn(w);
      break;
    }
    case 'solo': updateSolo(G, w, dt); break;
    case 'lock': {
      const L = w.lock; if (!L) { stand(G, w); break; }
      if (L.a === w) {
        L.t += dt;
        const o = L.d, mx = (w.x + o.x) / 2, mz = (w.z + o.z) / 2;
        w.yaw = faceTo(w, o.x, o.z); o.yaw = w.yaw + PI;
        const sway = Math.sin(L.t * 3.1) * 0.05;
        w.x = mx - fwdX(w.yaw) * 0.38 + sway; w.z = mz - fwdZ(w.yaw) * 0.38; o.x = mx + fwdX(w.yaw) * 0.38 + sway; o.z = mz + fwdZ(w.yaw) * 0.38;
        if (L.t > 2.0 && !L.chosen) { L.chosen = true; startDuo(G, w, o, 'takedown', { name: 'Snapmare' }); }
      }
      break;
    }
    case 'move': if (w.move && w.move.a === w) updateDuo(G, w.move, dt); else if (!w.move) stand(G, w); break;
    case 'perch': w.h = 0.7; w.pitch = 0.35; w.anim = 'perch'; if (w.t > 6) { w.perch = null; w.yb = RH; stand(G, w); } break;
    case 'fly': updateFly(G, w, dt); break;
    case 'pin': case 'pinned': case 'sub': break;
  }
}
function updateSolo(G, w, dt) {
  const s = w.solo; if (!s) { stand(G, w); return; }
  s.t += dt;
  const k = clamp(s.t / s.dur, 0, 1), d = s.d;
  w.ak = k; w.adur = s.dur; w.anim = s.name;
  // body channels
  if (s.name === 'getup') {
    const P0 = s.from != null ? s.from : -HALF;
    w.pitch = P0 * (1 - smooth01(k * 1.15)); w.h = lerp(LIE, 1, smooth01((k - 0.15) / 0.85)); w.roll = 0;
    if (s.lift && k > 0.9 && s.t >= s.dur) { setSt(w, 'hit'); w.stun = 0.8; w.anim = 'stagger'; w.solo = null; return; }
  } else if (s.name === 'climb') {
    const cn = s.cn;
    w.x = lerp(w.x, cn.x * 1.05, dt * 3); w.z = lerp(w.z, cn.z * 1.05, dt * 3);
    w.yb = RH + smooth01(k) * 0.98; w.h = lerp(1, 0.72, k); w.pitch = Math.sin(k * PI) * 0.3;
    if (k >= 1) { setSt(w, 'perch'); w.perch = { sx: cn.sx, sz: cn.sz }; w.x = cn.sx * 2.88; w.z = cn.sz * 2.88; w.solo = null; ev(G, 'perch', { a: w }); G.crowd = Math.min(1, G.crowd + 0.1); return; }
    return;
  } else if (s.name === 'rollOut' || s.name === 'rollIn' || s.name === 'overTop') {
    const out = s.name !== 'rollIn';
    const startM = Math.max(Math.abs(s.x0), Math.abs(s.z0));
    const endM = out ? 4.25 : 2.35;
    const m = lerp(startM, endM, smooth01(k));
    const sx = Math.abs(s.ox) > 0;
    if (sx) w.x = (out ? Math.sign(s.ox) : -Math.sign(s.ox)) * m; else w.z = (out ? Math.sign(s.oz) : -Math.sign(s.oz)) * m;
    const hop = Math.sin(k * PI);
    if (s.name === 'overTop') { w.yb = lerp(RH, 0, smooth01((k - 0.35) / 0.65)); w.h = 1 + hop * 1.1 * (1 - k); w.pitch = -k * PI; w.roll = 0; }
    else if (out) { w.yb = lerp(RH, 0, smooth01((k - 0.3) / 0.7)); w.h = lerp(0.35, 1, smooth01((k - 0.6) / 0.4)); w.pitch = (1 - smooth01((k - 0.55) / 0.45)) * 0.9; w.roll = Math.sin(k * TAU) * 0.6 * (1 - k); }
    else { w.yb = lerp(0, RH, smooth01(k / 0.5)); w.h = lerp(1, 0.35, smooth01(k / 0.3)) + smooth01((k - 0.6) / 0.4) * 0.65; w.pitch = Math.sin(k * PI) * 0.9; w.roll = Math.sin(k * TAU) * 0.6 * (1 - k); }
    if (k >= 1) {
      w.solo = null; w.out = out; w.yb = out ? 0 : RH;
      if (s.name === 'overTop') { w.out = true; down(G, w, 'up', 2.0); w.out = true; ev(G, 'impact', { a: w, d: w, x: w.x, z: w.z, y: 0, big: 1, m: 'Over the top' }); thud(0.8); }
      else stand(G, w);
      clampIn(w);
      if (out) { G.crowd = Math.min(1, G.crowd + 0.08); }
    }
    return;
  } else if (s.name === 'tagIn') {
    const fr = s.from, to = s.to;
    w.x = lerp(fr.x, to.x, smooth01(k)); w.z = lerp(fr.z, to.z, smooth01(k)); w.yb = RH; w.h = 1 - Math.sin(k * PI) * 0.25; w.yaw = Math.atan2(to.x - fr.x, to.z - fr.z);
    if (k >= 1) { w.solo = null; stand(G, w); }
    return;
  } else if (s.name === 'tagOut') {
    const c0 = cornerOf(w.team);
    w.x = lerp(w.x, c0.ax, dt * 3); w.z = lerp(w.z, c0.az, dt * 3); w.h = 1 - Math.sin(k * PI) * 0.25;
    if (k >= 1) { w.solo = null; w.apron = true; w.x = c0.ax; w.z = c0.az; w.yaw = 0; stand(G, w); }
    return;
  } else {
    w.h = d.h ? key(d.h, k) : lerp(w.h, 1, Math.min(1, dt * 8));
    w.pitch = d.pitch ? key(d.pitch, k) : lerp(w.pitch, 0, Math.min(1, dt * 8));
    w.yawOff = d.yaw ? key(d.yaw, k) : 0;
  }
  if (d.fwd) { const f = key(d.fwd, k); const df = f - s.fprev; s.fprev = f; w.x += fwdX(w.yaw) * df; w.z += fwdZ(w.yaw) * df; clampIn(w); }
  // impact
  if (d.I != null && !s.hit && k >= d.I) {
    s.hit = true;
    if (d.reach || d.ground) soloImpact(G, w, s);
    if (s.name === 'whip' && s.target) { /* the whip itself was applied at the start */ }
    if (s.name === 'shove' && s.target) { const T = s.target; if (T.st === 'hit') { T.knock = 1; } }
  }
  // threats are posted at the start of a strike so the target can react
  if (!s.posted) {
    s.posted = true;
    if (s.target && d.reach && !s.noRev) {
      const Ti = G.time + d.I * s.dur;
      threaten(G, s.target, w, s.counter ? 'counter' : 'strike', Ti, Ti - 0.27 - (s.special === 'fin' ? -0.08 : 0), Ti - 0.03);
    }
  }
  if (k >= 1) {
    w.solo = null; w.yawOff = 0;
    if (s.name === 'fallBack' || s.name === 'fallFront') { down(G, w, s.name === 'fallFront' ? 'front' : 'up', s.gt || 1.5); return; }
    if (d.selfDown && !s.missed) { down(G, w, d.selfDown, d.selfGet || 0.5); return; }
    if (d.selfDown && s.missed) { down(G, w, d.selfDown, (d.selfGet || 0.5) + 0.8); return; }
    if (s.name === 'taunt') { w.mom = Math.min(100, w.mom + 14 + (G.crowd * 8)); w.fired = Math.min(1, w.fired + 0.25); G.crowd = Math.min(1, G.crowd + (w.def.heel ? 0.06 : 0.12)); }
    if (s.name === 'pickup') { /* the target was lifted in its own solo */ }
    stand(G, w);
    // combo chain
    const ix = w.def.strikes.indexOf(s.name);
    const chain = (w.comboQ || (w.bot && w.ai && w.ai.combo > 0)) && ix >= 0 && w.combo < 2 && !s.missed;
    w.comboQ = false;
    if (chain) {
      if (w.bot && w.ai && w.ai.combo > 0) w.ai.combo--;
      w.combo++;
      const T = bestTarget(G, w); if (T && dist(w, T) < 2) w.yaw = faceTo(w, T.x, T.z);
      startSolo(G, w, w.def.strikes[w.combo], { target: T });
    } else w.combo = 0;
  }
}
function soloImpact(G, w, s) {
  const d = s.d;
  let T = s.target;
  const hits = [];
  if (d.ground) {
    if (T && isDown(T) && T.st === 'down' && sameLevel(w, T)) { torso(T, _p); if (Math.hypot(w.x - _p.x, w.z - _p.z) < 1.15 || dist(w, T) < 1.0) hits.push(T); }
  } else {
    for (const o of G.W) {
      if (o === w || o.team === w.team || o.elim || o.gone || o.apron || !sameLevel(w, o)) continue;
      if (isDown(o) || o.st === 'fly' || o.st === 'move' && o.move && o.move.a !== w) continue;
      const dd = dist(w, o); if (dd > d.reach) continue;
      const ang = Math.abs(wrapA(faceTo(w, o.x, o.z) - w.yaw - (w.yawOff || 0) * 0));
      if (ang > 1.0 && !(s.name === 'roundkick')) continue;
      hits.push(o); if (!d.run) break;
    }
  }
  if (!hits.length) { s.missed = true; whiff(); if (s.special) say(G, 'miss', { a: w }); return; }
  for (const o of hits) {
    if (o.st === 'perch') { knockOffTop(G, o, w); continue; }
    const dmg = s.dmg || d.dmg;
    hurt(G, o, w, dmg, { momK: s.special === 'fin' ? 0 : 1 });
    if (s.special === 'fin') { w.mom = 0; w.stats.fins++; G.stats.fins++; o.finHit = 1; if (G.cfg.mode !== 'practice') G.replayCd = 0.7; }
    else if (s.special === 'sig') w.mom = Math.max(0, w.mom - 50);
    w.stats.moves += d.react === 'fall' ? 1 : 0;
    if (o.lock) breakLock(G, o.lock, true);
    if (o.move) endMoveEarly(G, o);
    const big = s.special === 'fin' ? 3 : s.special === 'sig' ? 2 : d.react === 'fall' ? 1 : 0;
    ev(G, big ? 'impact' : 'hit', { a: w, d: o, x: o.x, z: o.z, y: o.yb, big, m: s.name || d.name, ground: !!d.ground });
    if (big) { pop(G, s.special ? (s.name === 'roundkick' ? w.def.sig.name : (s.special === 'fin' ? w.def.fin.name : w.def.sig.name)) : d.name, w.def.col, big >= 3 ? 2 : 1.2); if (s.special === 'fin' || s.special === 'sig') G.crowd = Math.min(1, G.crowd + 0.3); }
    if (d.ground) { o.t = Math.max(0, o.t - 0.5); o.stagT = 0.35; thud(0.6); continue; }
    if (d.react === 'fall' || o.stam < 8) {
      o.yaw = faceTo(o, w.x, w.z); o.solo = null; o.lock = null;
      // a hard hit near the ropes sends them over the top
      if (d.run && ropeDist(o) < 0.6 && inRing(o) && R() < 0.5 && G.cfg.match !== 'elim') { const sx = Math.abs(o.x) >= Math.abs(o.z); startSolo(G, o, 'overTop', { ox: sx ? Math.sign(o.x) : 0, oz: sx ? 0 : Math.sign(o.z), x0: o.x, z0: o.z }); }
      else { startSolo(G, o, 'fallBack', { gt: 1.2 + dmg * 0.05 + (s.special === 'fin' ? 1.4 : 0) }); }
      thud(0.8);
    } else {
      setSt(o, 'hit'); o.stun = 0.35 + d.dmg * 0.035; o.anim = 'stagger'; o.yaw = faceTo(o, w.x, w.z); o.knock = 0.35;
      sfx(140 + R() * 40, 0.05, { type: 'square', vol: 0.05 }); noise(0.06, { freq: 900, vol: 0.12 });
    }
  }
}
function updateFly(G, w, dt) {
  const f = w.fly; f.t += dt;
  const k = clamp(f.t / f.dur, 0, 1);
  w.x = lerp(f.x0, f.ex, k); w.z = lerp(f.z0, f.ez, k);
  const peak = 1.0;
  w.yb = lerp(f.y0, RH, k) + Math.sin(k * PI) * peak;
  const flat = f.kind === 'crossbody' ? -HALF : HALF;
  w.h = lerp(0.8, 0.45, k); w.pitch = lerp(0.3, flat, smooth01(k * 1.6)); w.roll = f.kind === 'crossbody' ? HALF * smooth01(k * 1.5) * 0 : 0;
  w.ak = k;
  if (k >= 1) {
    w.fly = null; w.yb = RH;
    const T = f.target;
    const hit = T && !T.elim && !(T.rollAway > 0) && (isDown(T) || standing(T)) && Math.hypot((isDown(T) ? torsoX(T) : T.x) - w.x, (isDown(T) ? torsoZ(T) : T.z) - w.z) < 1.25 && sameLevel(w, T);
    if (hit) {
      const dmg = f.fin ? w.def.fin.dmg : f.kind === 'crossbody' ? 10 : 13;
      hurt(G, T, w, dmg, { momK: f.fin ? 0 : 1 });
      if (f.fin) { w.mom = 0; w.stats.fins++; G.stats.fins++; T.finHit = 1; if (G.cfg.mode !== 'practice') G.replayCd = 0.7; }
      w.stats.moves++;
      if (!isDown(T)) { T.yaw = faceTo(T, w.x, w.z); down(G, T, 'up', 1.5); }
      else { T.t = Math.max(0, T.t - 0.8); }
      ev(G, 'impact', { a: w, d: T, x: T.x, z: T.z, y: RH, big: f.fin ? 3 : 2, m: f.name });
      pop(G, f.name, w.def.col, f.fin ? 2 : 1.3);
      G.crowd = Math.min(1, G.crowd + (f.fin ? 0.45 : 0.25));
      thud(1);
      down(G, w, f.kind === 'crossbody' ? 'front' : 'front', 0.35);
      // landing on them is half a cover already
      if (f.kind !== 'elbowDive' && (G.cfg.match !== 'tag' || (w.legal && T.legal))) { if (w.bot || f.fin) { stand(G, w); startPin(G, w, T); } }
    } else {
      hurt(G, w, null, 9);
      down(G, w, 'front', 1.6);
      ev(G, 'impact', { a: w, d: w, x: w.x, z: w.z, y: RH, big: 1, m: 'Crash' });
      say(G, 'miss', { a: w });
      G.crowd = Math.min(1, G.crowd + 0.15);
      thud(0.9);
    }
  }
}

/* ------------------------------------------------------------ collisions */
function separate(G) {
  const W = G.W;
  for (let i = 0; i < W.length; i++) {
    const a = W[i]; if (a.gone || a.apron || a.st === 'move' || a.st === 'pin' || a.st === 'pinned' || a.st === 'sub' || a.st === 'lock' || a.st === 'fly' || a.st === 'perch') continue;
    if (a.st === 'down') continue;
    for (let j = i + 1; j < W.length; j++) {
      const b = W[j]; if (b.gone || b.apron || b.st === 'move' || b.st === 'pin' || b.st === 'pinned' || b.st === 'sub' || b.st === 'lock' || b.st === 'down' || b.st === 'fly' || b.st === 'perch') continue;
      if (inRing(a) !== inRing(b)) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.78;
      if (d < min && d > 1e-4) { const p = (min - d) / 2; a.x -= dx / d * p; a.z -= dz / d * p; b.x += dx / d * p; b.z += dz / d * p; clampIn(a); clampIn(b); }
    }
  }
}

/* ------------------------------------------------------------ pins, holds and count outs, per frame */
function updatePin(G, dt) {
  const p = G.pin; if (!p) return;
  p.t += dt;
  const r = G.ref;
  // the referee has to get there first
  if (!p.refIn) { if (r.near || p.t > 1.0) { p.refIn = true; p.next = p.t + 0.5; } }
  if (p.nk && !p.nk.done) {
    const n = p.nk; n.p += n.dir * dt * n.speed; if (n.p > 1) { n.p = 1; n.dir = -1; } if (n.p < 0) { n.p = 0; n.dir = 1; }
  }
  // a partner or a third wrestler breaks it up
  if (p.broken) { endPin(G, 'break'); return; }
  if (!p.refIn) return;
  const prog = p.count + clamp((p.t - (p.next - 0.82)) / 0.82, 0, 1);
  if (p.kickAt < 9 && prog >= p.kickAt) { kickOut(G, p); return; }
  if (p.t >= p.next) {
    if (p.ropeOK && bodyReach(p.d) > 3.0 && inRing(p.d) && p.count >= 1) { endPin(G, 'rope'); say(G, 'rope', { d: p.d }, true); return; }
    p.count++; p.next = p.t + 0.82; r.slap = 0.3;
    ev(G, 'count', { n: p.count });
    sfx(220, 0.06, { type: 'square', vol: 0.09 }); noise(0.05, { freq: 2600, vol: 0.18 });
    G.crowd = Math.min(1, G.crowd + 0.06 * p.count);
    if (p.count >= 3) pinWin(G, p);
  }
}
function pinPress(G) {
  const p = G.pin, n = p.nk;
  if (!p.refIn) return;
  if (Math.abs(n.p - n.c) < n.w / 2) { n.done = true; kickOut(G, p); }
  else { n.miss++; n.speed = Math.min(2.6, n.speed + 0.35); n.w = Math.max(0.05, n.w * 0.88); G.P.revFlash = -0.4; }
}
function kickOut(G, p) {
  const d = p.d, a = p.a;
  d.stats.kickouts++;
  if (p.count >= 2) { G.stats.nearfalls++; if (d.finHit > 0) G.stats.finKick++; say(G, 'nearfall', { a, d }, true); G.crowd = 1; d.fired = Math.min(1, d.fired + 0.5); a.frustr = Math.min(1, a.frustr + 0.35); ev(G, 'nearfall', { a, d }); }
  else if (p.count >= 1) { G.crowd = Math.min(1, G.crowd + 0.1); }
  endPin(G, 'kick');
}
function endPin(G, why) {
  const p = G.pin; if (!p) return;
  G.pin = null;
  const a = p.a, d = p.d;
  stand(G, a); a.h = 0.6; a.pitch = 0.5;
  setSt(a, 'solo'); a.solo = { name: 'getup', d: SOLO.getup, t: 0, dur: 0.6, from: 0.9 }; a.anim = 'getup';
  if (why === 'kick') { d.st = 'down'; d.t = Math.max(0, d.getT - 0.8); d.anim = 'kickout'; ev(G, 'kickout', { d, a }); }
  else { d.st = 'down'; d.t = Math.max(0, d.getT - 1.2); }
  if (why === 'break') say(G, 'break', {}, true);
}
function pinWin(G, p) {
  if (G.cfg.mode === 'practice') { G.lessonPin = true; G.pin = null; stand(G, p.a); down(G, p.d, 'up', 1.2); p.d.dmg = Math.max(0, p.d.dmg - 60); toastSafe('That is a three count', 'In a real match, that wins'); return; }
  const a = p.a, d = p.d; G.pin = null;
  fall(G, a, d, 'Pinfall');
}
function updateSub(G, dt) {
  const s = G.sub; if (!s) return;
  s.t += dt;
  placeSub(G);
  const a = s.a, d = s.d;
  const rate = (6 + a.def.stats.tec * 6) * s.H.press * (0.5 + d.dmg / 100) * (s.fin ? 1.35 : 1) * (G.cfg.mode === 'practice' ? 0.6 : 1);
  s.press += rate * dt;
  s.esc = Math.max(0, s.esc - dt * 4);
  // crawl to the ropes: the player pushes toward them, the AI does it on its own
  if (d === G.P && !d.bot) { const c = PC; if (Math.hypot(c.mx, c.mz) > 0.4) { d.x += c.mx * dt * 0.28; d.z += c.mz * dt * 0.28; clampIn(d); } }
  else if (d.bot) { const sx = Math.abs(d.x) >= Math.abs(d.z); if (sx) d.x += Math.sign(d.x || 1) * dt * 0.16; else d.z += Math.sign(d.z || 1) * dt * 0.16; clampIn(d); }
  if (ropeDist(d) < 0.32 && inRing(d)) { endSub(G, 'rope'); return; }
  if (s.esc >= 100) { endSub(G, 'escape'); return; }
  if (s.press >= 100) {
    if (G.cfg.mode === 'practice') { endSub(G, 'escape'); toastSafe('That is a tap out', 'In a real match, that wins'); G.lessonSub = true; return; }
    G.sub = null; fall(G, a, d, 'Submission');
  }
}
function endSub(G, why) {
  const s = G.sub; if (!s) return; G.sub = null;
  const a = s.a, d = s.d;
  stand(G, a);
  if (why === 'escape') { d.stam = Math.max(0, d.stam - 10); setSt(a, 'hit'); a.stun = 0.6; a.anim = 'stagger'; say(G, 'escape', { a, d }, true); G.crowd = Math.min(1, G.crowd + 0.2); }
  else say(G, 'rope', { d }, true);
  d.st = 'down'; d.t = Math.max(0, d.getT - 0.9);
}
function updateCountout(G, dt) {
  if (G.cfg.countout !== 'on' || G.cfg.match === 'triple' || G.cfg.match === 'elim' || G.cfg.mode === 'practice') { G.cout = null; return; }
  let anyOut = null;
  for (const w of G.W) if (w.out && w.legal && !w.elim && !w.apron) { anyOut = w; break; }
  if (!anyOut) { G.cout = null; return; }
  const outW = G.W.filter((w) => w.out && w.legal && !w.elim && !w.apron);
  if (!G.cout) { G.cout = { n: 0, t: 0, w: outW[0] }; say(G, 'outside', { a: outW[0] }); }
  const c = G.cout; c.w = outW[0]; c.t += dt;
  if (c.t >= 1.05) {
    c.t = 0; c.n++; ev(G, 'cout', { n: c.n }); sfx(300, 0.05, { type: 'square', vol: 0.05 });
    if (c.n >= 10) {
      const losers = new Set(outW.map((w) => w.team));
      if (losers.size > 1) { G.cout = null; endMatch(G, null, null, 'Double count out'); return; }
      const loser = outW[0], win = G.W.find((w) => w.team !== loser.team && w.legal && !w.elim);
      G.cout = null; endMatch(G, win, loser, 'Count out');
    }
  }
}

/* ------------------------------------------------------------ falls, eliminations and the end */
function fall(G, a, d, method) {
  if (G.cfg.match === 'elim') {
    d.elim = true; d.legal = false; G.elimMsg = { w: d, t: 0, by: a };
    G.stats.lead++;
    say(G, 'elim', { d }, true); ev(G, 'elim', { a, d });
    stand(G, d); d.st = 'leave'; d.anim = 'walk'; d.t = 0;
    const left = G.W.filter((w) => !w.elim);
    if (d === G.P || left.length <= 1) { endMatch(G, left.length === 1 ? left[0] : a, d, method); return; }
    stand(G, a); setPhase(G, 'elim');
    return;
  }
  endMatch(G, a, d, method);
}
function endMatch(G, win, lose, method) {
  if (G.ended) return;
  G.ended = true;
  G.winner = win; G.loser = lose; G.method = method;
  const P = G.P;
  const teamWin = win ? win.team : -1;
  G.result = { win: teamWin === P.team, draw: !win, method, place: G.cfg.match === 'elim' && lose === P ? G.W.filter((w) => !w.elim).length + 1 : 1 };
  if (win) {
    say(G, method === 'Submission' ? 'winSub' : method === 'Count out' ? 'winCount' : 'win', { w: win, d: lose }, true);
    G.crowd = 1;
    ev(G, 'win', { w: win, method });
  }
  bell(3);
  setPhase(G, 'post');
}
function setPhase(G, ph) { G.phase = ph; G.pt = 0; }

/* ------------------------------------------------------------ crowd, commentary, chants, pops */
function ev(G, type, data) {
  if (G.cfg.attract && type === 'replay') return;
  if (!G.cfg.attract) {
    lessonEvent(G, type, data);
    if (type === 'impact' && data.big >= 2) roar(0.8); else if (type === 'nearfall' || type === 'win' || type === 'tag') roar(1); else if (type === 'reverse') roar(0.4); else if (type === 'entrance') roar(0.6);
  }
  if (VIEW && VIEW.event) { try { VIEW.event(type, data, G); } catch (e) { /* a view effect never breaks the match */ } }
  if (type === 'impact' && data.big >= 2 && ARC && !G.cfg.attract) { ARC.shake = Math.max(ARC.shake, data.big >= 3 ? 10 : 6); }
  if (!G.cfg.attract && ARC && data && (data.d === G.P || data.a === G.P)) {
    if (type === 'impact') hap(data.big >= 3 ? 'heavy' : 'hit', data.big >= 2 ? 1 : 0.6);
    else if (type === 'hit') hap('tap', 0.6);
    else if (type === 'reverse' && data.a === G.P) hap('success', 0.6);
  }
}
function hap(kind, s) { try { if (ARC && ARC.haptic) ARC.haptic(kind, s); else if (ARC) ARC.buzz(20); } catch (e) { /* no haptics */ } }
function fill(str, v) {
  return str.replace(/\{(\w+)\}/g, (m, k) => {
    const o = v[k];
    if (o && o.def) return o.def.nick;
    if (k === 'from' && v.a && v.a.def) return v.a.def.from;
    return o != null ? String(o) : '';
  });
}
function say(G, kind, v, force) {
  if (G.cfg.attract && !force && R() < 0.6) return;
  const list = LINES[kind]; if (!list) return;
  if (!force && G.msg && G.msg.t < 2.2) return;
  callerTurn = (callerTurn + 1) % 2;
  G.msg = { who: CALLERS[callerTurn][0], text: fill(pick(list), v || {}), t: 0 };
}
function pop(G, text, col, size) { G.pop = { text, col, size: size || 1, t: 0 }; }
function updateCrowd(G, dt) {
  const target = 0.32 + (G.pin ? 0.2 : 0) + (G.sub ? 0.12 : 0) + G.W.reduce((s, w) => Math.max(s, w.mom / 100 * 0.2), 0);
  G.crowd += (target - G.crowd) * Math.min(1, dt * 0.35);
  if (G.msg) { G.msg.t += dt; if (G.msg.t > 6) G.msg = null; }
  if (G.pop) { G.pop.t += dt; if (G.pop.t > 1.9) G.pop = null; }
  G.chatT -= dt;
  if (G.chatT <= 0 && G.phase === 'live') { G.chatT = rnd(9, 15); if (!G.msg) say(G, 'chatter', {}); }
  G.chantT -= dt;
  if (G.chant) { G.chant.t += dt; if (G.chant.t > 4.5) G.chant = null; }
  if (G.chantT <= 0 && G.phase === 'live' && G.crowd > 0.45) {
    G.chantT = rnd(9, 16);
    const fav = G.W.filter((w) => !w.elim && !w.def.heel && !w.apron).sort((a, b) => b.mom - a.mom)[0];
    const heel = G.W.find((w) => !w.elim && w.def.heel && !w.apron);
    const opts = [];
    if (fav) opts.push('Let\'s go ' + fav.def.nick + '!', fav.def.nick + '! ' + fav.def.nick + '!');
    if (G.crowd > 0.7) opts.push('Ek aur! Ek aur!', 'Ye toh kamaal hai!', 'Raja! Raja! Raja!');
    if (heel && heel.mom > 40) opts.push('The crowd boos ' + heel.def.nick + ' out of the building');
    if (opts.length) { G.chant = { text: pick(opts), t: 0 }; ev(G, 'chant', { text: G.chant.text }); }
  }
}

/* ------------------------------------------------------------ the match flow */
function stepMatch(G, dt, a, skip) {
  G.realT += dt;
  G.pt += dt;
  updateCrowd(G, dt);
  if (G.phase === 'story') {
    G.storyT += dt;
    if ((skip && G.pt > 0.4) || G.pt > 40) { setPhase(G, 'entrance'); G.ent = 0; G.entT = 0; startEntrance(G); }
    return;
  }
  if (G.phase === 'entrance') { updateEntrance(G, dt, skip); updateRef(G, dt); return; }
  if (G.phase === 'bell') {
    updateRef(G, dt);
    for (const w of G.W) { w.anim = w.apron ? 'apron' : 'idle'; w.h = 1; w.pitch = 0; }
    if (G.pt > 1.0) { setPhase(G, 'live'); if (!G.cfg.attract) { bell(1); say(G, 'bell', {}, true); } }
    return;
  }
  if (G.phase === 'replay') {
    G.replay.t += dt;
    if ((skip && G.replay.t > 0.5) || G.replay.t >= G.replay.dur) { G.replay = null; setPhase(G, 'live'); ev(G, 'replayEnd', {}); }
    return;
  }
  if (G.phase === 'elim') {
    G.time += dt;
    simulate(G, dt, a);
    if (G.elimMsg) G.elimMsg.t += dt;
    if (G.pt > 2.4) { setPhase(G, 'live'); G.elimMsg = null; }
    return;
  }
  if (G.phase === 'post') {
    G.time += dt;
    for (const w of G.W) { if (w.st === 'leave') updateLeave(G, w, dt); }
    postPose(G, dt);
    updateRef(G, dt);
    if (G.pt > (G.cfg.attract ? 3 : 4.6) && !G.overSent) {
      G.overSent = true;
      if (G.cfg.attract) { const n = newMatch(Object.assign({}, G.cfg, { seed: (Math.random() * 1e9) | 0, wid: pick(ROSTER.slice(0, 8)).id })); attractStart(n); MG = n; if (VIEW && VIEW.newMatch) VIEW.newMatch(n, ARC); }
      else if (ARC && ARC.state === 'play') finishMatch(G, ARC);
    }
    return;
  }
  if (G.phase !== 'live') return;
  if (G.frozen) return;
  G.time += dt; G.clock += dt;
  simulate(G, dt, a);
  if (G.replayCd > 0) { G.replayCd -= dt; if (G.replayCd <= 0 && !G.cfg.attract && !G.pin) startReplay(G); }
  if (G.cfg.mode === 'practice') lessonStep(G, dt, a);
}
function simulate(G, dt, a) {
  const P = G.P;
  for (const w of G.W) {
    if (w.elim) { if (w.st === 'leave') updateLeave(G, w, dt); continue; }
    let c;
    if (w === P && !P.bot && a) c = readPlayer(G, a);
    else c = aiThink(G, w, dt);
    if (w === P && !P.bot) aiKeep(G, w); // keep a fresh AI copy for take over on tag
    if (w.saving > 0) { w.saving -= dt; if (w.saving <= 0 && !w.legal) { const c0 = cornerOf(w.team); w.apron = true; w.x = c0.ax; w.z = c0.az; stand(G, w); } }
    w.speed = 0;
    act(G, w, c, dt);
    updateW(G, w, dt);
    // a partner who ran in to save the pin breaks it up on contact
    if (w.saving > 0 && G.pin && G.pin.d.team === w.team && dist(w, G.pin.a) < 1.4) { G.pin.broken = true; ev(G, 'save', { a: w }); }
    if (w.st === 'solo' && w.solo && w.solo.target && G.pin && w.solo.target === G.pin.a && w.solo.hit) { G.pin.broken = true; }
    if (w.st === 'solo' && w.solo && w.solo.target && G.sub && w.solo.target === G.sub.a && w.solo.hit) { endSub(G, 'break'); }
  }
  separate(G);
  updatePin(G, dt);
  updateSub(G, dt);
  updateCountout(G, dt);
  updateRef(G, dt);
  // comebacks: a fired up wrestler near the end of their tether
  for (const w of G.W) if (!w.elim && w.dmg > 70 && w.mom > 70 && w.fired > 0.5 && !w.cbSaid) { w.cbSaid = true; say(G, 'comeback', { a: w }, true); G.crowd = 1; }
}
function updateLeave(G, w, dt) {
  // an eliminated wrestler rolls out and walks up the ramp
  w.t += dt;
  if (!w.out) { w.x += Math.sign(w.x || 1) * dt * 1.4; w.h = 1; w.pitch = 0; if (Math.abs(w.x) > RIN) { w.out = true; w.yb = 0; w.x = Math.sign(w.x) * OUT0; } w.anim = 'walk'; w.speed = 1.4; return; }
  const tx = 0, tz = STAGE_Z + 2;
  const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
  if (Math.abs(w.z) < OUT0 && Math.abs(w.x) < OUT0 + 0.3) { w.x += Math.sign(w.x || 1) * dt * 1.8; }
  else if (d > 0.3) { w.x += dx / d * dt * 1.7; w.z += dz / d * dt * 1.7; w.yaw = Math.atan2(dx, dz); }
  w.yb = w.z < RAMP_END ? STAGE_Y * clamp((RAMP_END - w.z) / (RAMP_END - (STAGE_Z + 3)), 0, 1) : 0;
  w.speed = 1.7; w.anim = 'walk';
  if (d < 0.5 || w.t > 14) w.gone = true;
}
function postPose(G, dt) {
  const win = G.winner;
  for (const w of G.W) {
    if (w.elim || w.gone || w.apron) continue;
    if (w.st === 'pin' || w.st === 'sub') stand(G, w);
    if (w.st === 'pinned' || (w.st === 'sub' && w.role === 'd')) down(G, w, w.face || 'up', 9);
    if (win && w.team === win.team) {
      if (w.st === 'down' && w.t > 0.4) { setSt(w, 'solo'); w.solo = { name: 'getup', d: SOLO.getup, t: 0, dur: 0.9, from: w.pitch }; }
      if (w.st === 'solo' && w.solo) updateSolo(G, w, dt);
      if (w.st === 'idle') { w.anim = 'celebrate'; w.h = 1; w.pitch = 0; }
      if (w.st === 'move' && w.move) updateDuo(G, w.move, dt);
    } else if (w.st === 'move' && w.move && w.move.a === w) updateDuo(G, w.move, dt);
    else if (w.st === 'down') { w.t = Math.min(w.t, 0); }
    else if (w.st === 'idle') { w.anim = 'slump'; }
  }
}
function startReplay(G) {
  if (G.cfg.attract) return;
  G.replay = { t: 0, dur: ARC && ARC.reducedMotion ? 2.6 : 4.4, slow: ARC && ARC.reducedMotion ? 1 : 0.5 };
  setPhase(G, 'replay');
  ev(G, 'replay', { dur: G.replay.dur, slow: G.replay.slow });
}
function bell(n) { for (let i = 0; i < n; i++) { sfx(1320, 0.9, { type: 'sine', vol: 0.09, delay: i * 0.32 }); sfx(1980, 0.6, { type: 'sine', vol: 0.04, delay: i * 0.32 }); } }

/* ------------------------------------------------------------ entrances */
function startEntrance(G) {
  // everyone waits backstage (hidden) until called; the ref is already in the ring
  for (const w of G.W) { w.hidden = true; w.entered = false; }
  G.ref.x = 0; G.ref.z = -1.2;
  callNext(G);
}
function callNext(G) {
  const who = G.order[G.ent];
  if (!who) { finishEntrances(G); return; }
  const grp = G.cfg.match === 'tag' ? G.W.filter((w) => w.team === who.team) : [who];
  G.entGroup = grp; G.entT = 0;
  grp.forEach((w, k) => { w.hidden = false; w.x = (k - (grp.length - 1) / 2) * 1.3; w.z = STAGE_Z + 1.4; w.yb = STAGE_Y; w.out = true; w.yaw = 0; w.anim = 'idle'; w.h = 1; w.pitch = 0; w.entPath = 0; });
  ev(G, 'entrance', { w: who, group: grp });
  say(G, who.def.heel ? 'heelEntrance' : 'entrance', { n: who, a: who }, true);
  G.crowd = who.def.heel ? 0.55 : 0.85;
  sfx(80, 0.6, { type: 'sawtooth', vol: 0.05 });
}
function updateEntrance(G, dt, skip) {
  G.entT += dt;
  const grp = G.entGroup || [];
  const T = G.entT;
  if (skip && T > 0.35) { grp.forEach((w) => placeAtCorner(G, w)); G.ent++; callNext(G); return; }
  // pose on the stage, walk the ramp, climb in, play to the crowd
  let allIn = true;
  grp.forEach((w, k) => {
    if (T < 1.4) { w.anim = 'taunt'; w.at = T; w.speed = 0; return; }
    if (w.entered) { w.anim = 'celebrate'; return; }
    const dest = entryPoint(G, w, k);
    const sp = 3.1;
    const dx = dest.x - w.x, dz = dest.z - w.z, d = Math.hypot(dx, dz);
    if (d > 0.12) { w.x += dx / d * Math.min(d, sp * dt); w.z += dz / d * Math.min(d, sp * dt); w.yaw += wrapA(Math.atan2(dx, dz) - w.yaw) * Math.min(1, dt * 6); w.anim = 'walk'; w.speed = sp; allIn = false; }
    else if (dest.last) { w.entered = true; placeAtCorner(G, w); }
    else { w.entPath++; allIn = false; }
    // stage, ramp and ring heights
    if (w.z < RAMP_END) w.yb = STAGE_Y * clamp((RAMP_END - w.z) / (RAMP_END - (STAGE_Z + 3)), 0, 1);
    else if (w.entPath >= 1) { w.yb = lerp(w.yb, RH, Math.min(1, dt * 5)); w.out = false; }
    else w.yb = 0;
  });
  if ((allIn && T > 2) || T > 9) { grp.forEach((w) => placeAtCorner(G, w)); G.ent++; callNext(G); }
}
function entryPoint(G, w, k) {
  const side = (k - 0.5) * 0.8;
  if (w.entPath === 0) return { x: side * (G.entGroup.length > 1 ? 1 : 0), z: -4.25 };
  return { x: side * (G.entGroup.length > 1 ? 1 : 0), z: -2.2, last: true };
}
function placeAtCorner(G, w) {
  w.hidden = false; w.entered = true; w.out = false; w.yb = RH; w.h = 1; w.pitch = 0;
  const s = G.startSpots[w.i]; w.x = s[0]; w.z = s[1]; w.yaw = s[2];
  stand(G, w); if (w.apron) w.anim = 'apron';
}
function finishEntrances(G) {
  G.W.forEach((w) => placeAtCorner(G, w));
  for (const w of G.W) { w.hidden = false; }
  G.ref.x = 0; G.ref.z = -1.4;
  setPhase(G, 'bell');
  ev(G, 'bell', {});
}
function attractStart(G) {
  G.W.forEach((w) => { w.bot = true; w.hidden = false; });
  G.P.bot = true;
  placeStart(G);
  setPhase(G, 'live');
}

/* ------------------------------------------------------------ practice lessons */
const LESSONS = [
  { k: 'strike', title: 'Strikes', key: 'Press J (or tap) three times for a combo.', touch: 'Tap three times for a combo.', pad: 'Press A three times for a combo.', need: 3 },
  { k: 'grapple', title: 'Grapple', key: 'Walk up and press K to lock up, then J for a quick move.', touch: 'Swipe up near Chotu to lock up, then tap for a quick move.', pad: 'X to lock up, then A for a quick move.', need: 1 },
  { k: 'heavy', title: 'Heavy moves', key: 'Lock up with K, hold a direction and press K again for a heavy move.', touch: 'Lock up with a swipe up, then swipe up again for a slam.', pad: 'X to lock up, then X again for a heavy move.', need: 1 },
  { k: 'whip', title: 'Irish whip', key: 'In a lock, hold Shift and a direction to whip. Press J as they come back.', touch: 'In a lock, swipe left or right to whip, then tap as they come back.', pad: 'In a lock, hold RT and a direction. A as they come back.', need: 1 },
  { k: 'reverse', title: 'Reversals', key: 'Chotu will attack. Press L when the ring around you turns gold.', touch: 'Chotu will attack. Tap when the ring around you turns gold.', pad: 'Chotu will attack. Press B when the ring turns gold.', need: 2 },
  { k: 'top', title: 'Top rope', key: 'Knock Chotu down, walk to a corner, press F to climb, then J to dive.', touch: 'Knock Chotu down, go to a corner, swipe down to climb, tap to dive.', pad: 'Knock Chotu down, go to a corner, RB to climb, A to dive.', need: 1 },
  { k: 'pin', title: 'Pin and submit', key: 'When Chotu is down: E pins, K applies a submission.', touch: 'When Chotu is down: swipe down to pin, swipe up for a submission.', pad: 'When Chotu is down: LT pins, X applies a submission.', need: 1 },
  { k: 'special', title: 'Specials', key: 'Fill the meter with moves and taunts (Space). At half it is a signature, full a finisher.', touch: 'Fill the meter, then press Special near Chotu.', pad: 'Fill the meter, then Y near Chotu.', need: 1 },
];
function lessonStep(G, dt, a) {
  if (!G.lesson) G.lesson = { i: 0, n: 0, t: 0, k: LESSONS[0].k, done: false };
  const L = G.lesson, cur = LESSONS[L.i];
  L.k = cur.k; L.t += dt;
  const P = G.P, C = G.W[1];
  if (cur.k === 'special' && P.mom < 50 && L.t > 0.5 && !L.filled) { P.mom = 60; L.filled = true; }
  // count events
  const hit = (n) => { L.n += n; if (L.n >= cur.need) { L.i = (L.i + 1) % LESSONS.length; L.n = 0; L.t = 0; L.filled = false; toastSafe('Lesson done: ' + cur.title, LESSONS[L.i].title + ' next', 1600); sfx(880, 0.12, { type: 'triangle', vol: 0.08 }); sfx(1320, 0.18, { type: 'triangle', vol: 0.06, delay: 0.1 }); P.dmg = Math.max(0, P.dmg - 30); C.dmg = clamp(C.dmg, 0, 40); } };
  L.hit = hit;
  // the trainee only fights back during the reversal lesson
  if (cur.k === 'reverse' && C.st === 'idle' && dist(C, P) < 1.3 && L.t > 1.2 && (L.cd = (L.cd || 0) - dt) <= 0) { L.cd = 2.2; C.yaw = faceTo(C, P.x, P.z); startSolo(G, C, 'hook', { target: P, speed: 1.45 }); }
  if (cur.k === 'reverse' && C.st === 'idle' && dist(C, P) > 1.3) { C.ai.goal = 'attack'; }
  if (G.lessonPin || G.lessonSub) { G.lessonPin = G.lessonSub = false; if (cur.k === 'pin') hit(1); }
}
function lessonEvent(G, type, d) {
  const L = G.lesson; if (!L || !L.hit || G.cfg.mode !== 'practice') return;
  const P = G.P;
  if (L.k === 'strike' && type === 'hit' && d.a === P) L.hit(1);
  if (L.k === 'grapple' && type === 'impact' && d.a === P && /Snapmare|Arm drag|Hip toss|Knee/.test(d.m || '')) L.hit(1);
  if (L.k === 'heavy' && type === 'impact' && d.a === P && P.move == null && /slam|suplex|DDT|bomb|breaker|Belly|takedown/i.test(d.m || '')) L.hit(1);
  if (L.k === 'whip' && type === 'impact' && d.a === P && /clothes|boot|drop|Back body/i.test(d.m || '')) L.hit(1);
  if (L.k === 'reverse' && type === 'reverse' && d.a === P) L.hit(1);
  if (L.k === 'top' && type === 'impact' && d.a === P && /splash|Crossbody|Dive|Plunge/i.test(d.m || '')) L.hit(1);
  if (L.k === 'special' && (type === 'sigStart' || type === 'finStart') && d.a === P) L.hit(1);
}

/* ------------------------------------------------------------ results, career, score */
function rating(G) {
  const s = G.stats;
  let r = 1.4 + Math.min(1.1, s.nearfalls * 0.38) + Math.min(0.8, s.revs * 0.07) + Math.min(0.5, s.fins * 0.25) + s.finKick * 0.4 + Math.min(0.6, G.clock / 240) + Math.min(0.3, s.moves * 0.02);
  return clamp(Math.round(r * 2) / 2, 0.5, 5);
}
function finishMatch(G, a) {
  const P = G.P, res = G.result || { win: false, draw: true };
  const stars = rating(G);
  const mm = Math.floor(G.clock / 60), ss = Math.floor(G.clock % 60);
  const dur = mm + ':' + (ss < 10 ? '0' : '') + ss;
  let score = Math.round((res.win ? 1000 : res.draw ? 400 : 250) + stars * 220 + P.stats.moves * 12 + P.stats.revs * 25 + (G.cfg.diff === 'hard' ? 300 : G.cfg.diff === 'easy' ? -150 : 0));
  score = Math.max(0, score);
  let html = '<div class="rr-res">';
  html += '<p class="rr-big">' + (G.winner ? a.esc(G.winner.def.nick) + ' wins by ' + a.esc(G.method.toLowerCase()) : a.esc(G.method)) + '</p>';
  html += '<p class="rr-stars" aria-label="' + stars + ' stars">' + starStr(stars) + ' <span>match rating</span></p>';
  html += '<p class="rr-sub">' + a.esc(MATCHES[G.cfg.match] || 'Match') + ', ' + dur + '. Near falls ' + G.stats.nearfalls + ', reversals ' + G.stats.revs + ', finishers ' + G.stats.fins + '.</p>';
  // unlocks and career
  let eyebrow = MATCHES[G.cfg.match] || 'Match', title = res.win ? 'Victory' : res.draw ? 'No winner' : (G.cfg.match === 'elim' ? 'Eliminated' : 'Defeat');
  if (res.win) { const n = addWin(P.def.id); if (n === 3 && P.def.alt) html += '<p class="rr-unlock">Unlocked: the alternate attire for ' + a.esc(P.def.nick) + '.</p>'; }
  if (G.cfg.mode === 'career') {
    const c = loadCareer();
    if (c) {
      if (res.win) {
        c.wins++;
        if (c.champ) { c.defences++; html += '<p class="rr-unlock">Title retained. Defences: ' + c.defences + '.</p>'; title = 'Still champion'; }
        else if (c.week === WEEKS.length - 1) {
          c.champ = true; title = 'New champion';
          html += '<p class="rr-unlock">You are the ' + PROMO.belt + ' champion of ' + PROMO.name + '.</p>';
          if (setUnlock('nightjar')) html += '<p class="rr-unlock">Unlocked: Nightjar, the masked mystery wrestler.</p>';
        }
        c.week++;
        if (c.week >= 4 && setUnlock('sher')) html += '<p class="rr-unlock">Unlocked: Sher Singh, the old lion.</p>';
        c.rank = Math.max(1, (c.rank || 10) - 2);
      } else {
        c.losses++; c.rank = Math.min(15, (c.rank || 10) + 1);
        if (c.champ) { c.champ = false; c.week = WEEKS.length - 1; html += '<p class="rr-unlock">The belt is gone. Earn the rematch next week.</p>'; title = 'Title lost'; }
        else html += '<p class="rr-sub">A setback. ' + PROMO.gm + ' gives you another shot at this week next time.</p>';
      }
      saveCareer(c);
      eyebrow = 'Career, record ' + c.wins + ' and ' + c.losses;
      html += '<p class="rr-sub">Next: ' + a.esc(nextCardTitle(c)) + '</p>';
    }
  }
  html += '</div>';
  injectCss();
  a.over({ score, scoreLabel: 'Points', eyebrow, title, html, again: G.cfg.mode === 'career' ? 'Next match' : 'Play again' });
}
function starStr(n) { let s = ''; for (let i = 1; i <= 5; i++) s += n >= i ? '★' : n >= i - 0.5 ? '½' : '☆'; return s; }
function nextCardTitle(c) { if (c.champ || c.week >= WEEKS.length) return 'Week ' + (c.week + 1) + ', title defence'; return fillStory(WEEKS[c.week].title, c); }
function fillStory(s, c) {
  const n = (id) => { const r = byId(id); return r ? r.nick : ''; };
  const me = byId(c.wid) || ROSTER[0];
  return s.replace(/\{(\w+)\}/g, (m, k) => ({ gm: PROMO.gm, show: PROMO.show, ppv: PROMO.ppv, belt: PROMO.belt, from: me.from, rival: n(c.rival), ally: n(c.ally), partner: n(c.partner), champ: n(c.champ0), other: n(c.other), week: c.week + 1, opp: n(c.next || c.rival) }[k] || ''));
}
function newCareer(wid) {
  const me = byId(wid) || ROSTER[0];
  const others = ROSTER.filter((r) => r.id !== me.id && !r.unlock);
  const r0 = rng((Math.random() * 1e9) | 0);
  const take = () => others.splice((r0() * others.length) | 0, 1)[0].id;
  const champ0 = me.id === 'viceroy' ? 'bahubal' : 'viceroy';
  const oi = others.findIndex((x) => x.id === champ0); if (oi >= 0) others.splice(oi, 1);
  return { wid: me.id, week: 0, wins: 0, losses: 0, rank: 10, champ: false, defences: 0, champ0, rival: take(), ally: take(), partner: take(), other: take(), low: [take(), take()].filter(Boolean) };
}
function careerCfg(cfg) {
  let c = loadCareer();
  if (!c || cfg.career === 'new') { c = newCareer(cfg.wid); saveCareer(c); }
  cfg.wid = c.wid;
  if (c.champ || c.week >= WEEKS.length) {
    const pool = ROSTER.filter((r) => r.id !== c.wid && (!r.unlock || available(r.id)));
    c.next = pick(pool).id; saveCareer(c);
    cfg.match = 'single'; cfg.opps = [c.next];
    return { title: 'Week ' + (c.week + 1) + ': Title defence', text: fillStory(DEFENCE, c), champ: true };
  }
  const W0 = WEEKS[c.week];
  cfg.match = W0.match;
  if (W0.opp === 'low') cfg.opps = [c.low[c.week % c.low.length] || c.ally];
  else if (W0.opp === 'rival') { cfg.opps = W0.match === 'tag' ? [c.rival, c.ally] : [c.rival]; cfg.partner = c.partner; }
  else if (W0.opp === 'ally') cfg.opps = [c.ally];
  else if (W0.opp === 'pair') cfg.opps = [c.rival, c.other];
  else if (W0.opp === 'trio') cfg.opps = [c.rival, c.other, c.ally];
  else if (W0.opp === 'champ') cfg.opps = [c.champ0];
  return { title: fillStory(W0.title, c), text: fillStory(W0.text, c), champ: !!W0.belt };
}

/* ------------------------------------------------------------ sound */
function audioInit() {
  if (AU) return;
  AU = { ok: false };
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC(), master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.45 + b * 2.2; }
    const loop = (freq, q, type) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.75 + Math.random() * 0.5; const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); return { g, f }; };
    const crowd = loop(560, 0.5), roar = loop(1250, 0.7), low = loop(220, 0.6, 'lowpass');
    Object.assign(AU, { ok: true, ctx, master, crowd, roar, low, roarK: 0 });
  } catch (e) { AU.ok = false; }
}
function audioFrame(G, a, dt) {
  if (!AU || !AU.ok || !G) return;
  try {
    const t = AU.ctx.currentTime, on = !a.sfx.muted && (a.state === 'play' || a.state === 'over') && !G.cfg.attract;
    if (AU.ctx.state === 'suspended' && on) AU.ctx.resume().catch(() => {});
    AU.master.gain.setTargetAtTime(on ? 0.8 : 0, t, 0.1);
    if (!on) return;
    AU.roarK = Math.max(0, AU.roarK - dt * 0.35);
    const ex = G.crowd, rp = G.phase === 'replay' ? 0.5 : 1;
    AU.crowd.g.gain.setTargetAtTime((0.05 + ex * 0.07) * rp, t, 0.4);
    AU.roar.g.gain.setTargetAtTime((AU.roarK * 0.2 + ex * ex * 0.05) * rp, t, 0.15);
    AU.low.g.gain.setTargetAtTime(0.03 + ex * 0.03, t, 0.5);
  } catch (e) { /* sound never stops play */ }
}
function roar(k) { if (AU && AU.ok) AU.roarK = Math.min(1.2, AU.roarK + k); }
function sfx(f, d, o) { if (ARC && !(MG && MG.cfg.attract)) ARC.sfx.tone(f, d, o); }
function noise(d, o) { if (ARC && !(MG && MG.cfg.attract)) ARC.sfx.noise(d, o); }
function thud(k) { noise(0.18 + k * 0.12, { freq: 260 + k * 120, vol: 0.12 + k * 0.12 }); sfx(70, 0.2, { type: 'sine', vol: 0.1 + k * 0.08, slide: 40 }); roar(0.35 * k); }
function whiff() { noise(0.12, { freq: 1600, filter: 'bandpass', vol: 0.05 }); }
function toastSafe(t, s, ms) { if (ARC && ARC.toast) ARC.toast(t, s, ms || 1400); }

/* ------------------------------------------------------------ HUD */
const FONT = '"Inter", system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace', DISP = '"Fraunces", Georgia, serif';
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function bar(g, x, y, w, h, v, col, back) { g.fillStyle = back || 'rgba(255,255,255,0.12)'; g.fillRect(x, y, w, h); g.fillStyle = col; g.fillRect(x, y, w * clamp(v, 0, 1), h); }
// Bottom safe area: above the touch buttons that are actually on screen (the shell's figure assumes none
// in gesture mode, but Special and Action stay visible), so no HUD line ever sits under a thumb.
const padCache = { f: -99, v: 0 };
function bottomSafe(a) {
  const base = a.hudPad().bottom;
  if (!a.touchMode) return base;
  if (a.frame - padCache.f > 20) {
    padCache.f = a.frame; padCache.v = 0;
    try {
      const st = a.stage.getBoundingClientRect(); let top = st.bottom;
      a.app.querySelectorAll('.arc-pad, .arc-stick').forEach((el) => { if (el.offsetParent !== null) { const r = el.getBoundingClientRect(); if (r.height) top = Math.min(top, r.top); } });
      padCache.v = Math.max(0, st.bottom - top + 10);
    } catch (e) { padCache.v = 0; }
  }
  return Math.max(base, padCache.v);
}
function drawHUD(g, a, G) {
  const W = a.w, H = a.h, pad = { bottom: bottomSafe(a) }, small = W < 560;
  if (G.cfg.attract) { drawBug(g, W, H, G, small); return; }
  if (G.phase === 'story') { drawStory(g, a, G); return; }
  // replay banner
  if (G.phase === 'replay') {
    g.save(); g.font = '700 ' + (small ? 13 : 16) + 'px ' + MONO; g.textAlign = 'left'; g.textBaseline = 'top';
    const blink = (G.replay.t * 2) % 2 < 1.4;
    g.fillStyle = 'rgba(15,13,10,0.7)'; rr(g, 14, 58, small ? 104 : 124, 28, 6); g.fill();
    g.fillStyle = blink ? '#ff4f4f' : '#7a2020'; g.beginPath(); g.arc(28, 72, 5, 0, TAU); g.fill();
    g.fillStyle = '#fbf5ec'; g.fillText('REPLAY', 40, 64); g.restore();
  }
  drawBug(g, W, H, G, small);
  // entrance lower third
  if (G.phase === 'entrance' && G.entGroup) {
    const w = G.entGroup[0], k = clamp(G.entT / 0.5, 0, 1);
    const bw = Math.min(W - 28, 420), bx = 14 - (1 - k) * 40, by = H - pad.bottom - (small ? 92 : 100) - 62;
    g.save(); g.globalAlpha = k;
    g.fillStyle = 'rgba(15,13,10,0.82)'; rr(g, bx, by, bw, small ? 84 : 92, 10); g.fill();
    g.fillStyle = w.def.col; g.fillRect(bx, by, 5, small ? 84 : 92);
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(251,245,236,0.6)'; g.font = '600 11px ' + MONO; g.fillText((G.entGroup.length > 1 ? 'MAKING THEIR WAY TO THE RING' : 'MAKING THE WAY TO THE RING'), bx + 18, by + 12);
    g.fillStyle = '#fbf5ec'; g.font = '600 ' + (small ? 22 : 26) + 'px ' + DISP;
    g.fillText(G.entGroup.map((x) => x.def.nick).join(' and '), bx + 18, by + 28);
    g.fillStyle = 'rgba(251,245,236,0.75)'; g.font = '500 12px ' + FONT;
    g.fillText(G.entGroup.length > 1 ? 'Tag team' : (w.def.name + ', from ' + w.def.from + ', ' + w.def.kg + ' kg'), bx + 18, by + (small ? 60 : 64));
    g.restore();
    g.save(); g.font = '600 11px ' + MONO; g.textAlign = 'right'; g.fillStyle = 'rgba(251,245,236,0.7)'; g.fillText(a.touchMode ? 'TAP TO SKIP' : a.gamepad ? 'A TO SKIP' : 'SPACE TO SKIP', W - 16, (G.ui.top || 70) + 14); g.restore();
  }
  if (G.phase === 'bell') { big(g, W, H * 0.36, 'Ding ding', '#fbf5ec', small ? 30 : 42); }
  if (G.phase === 'live' || G.phase === 'elim' || G.phase === 'post') {
    drawPrompts(g, a, G, small);
    if (G.pin && G.pin.refIn) { const n = G.pin.count; if (n > 0) big(g, W, H * 0.3, String(n), n >= 3 ? '#ffd36a' : '#fbf5ec', small ? 64 : 84); }
    if (G.cout && G.cout.n > 0) big(g, W, H * 0.24, 'Count ' + G.cout.n, '#fbf5ec', small ? 26 : 34);
    if (G.pop && G.pop.t < 1.7) { const k = clamp(G.pop.t / 0.18, 0, 1), f = 1 - clamp((G.pop.t - 1.3) / 0.4, 0, 1); g.save(); g.globalAlpha = f; big(g, W, H * 0.2, G.pop.text.toUpperCase(), G.pop.col, (small ? 20 : 28) * G.pop.size * (0.8 + 0.2 * k)); g.restore(); }
    if (G.elimMsg) big(g, W, H * 0.42, G.elimMsg.w.def.nick + ' is eliminated', '#ff8a6a', small ? 22 : 30);
    if (G.phase === 'post' && G.winner) { big(g, W, H * 0.34, G.winner.def.nick + ' wins', G.winner.def.col, small ? 34 : 48); }
  }
  if (G.phase === 'live' && G.cfg.mode === 'practice' && G.lesson) drawLesson(g, a, G, small);
  // commentary ticker
  if (G.msg && G.phase !== 'replay') {
    const k = clamp(G.msg.t / 0.3, 0, 1) * (1 - clamp((G.msg.t - 5.4) / 0.6, 0, 1));
    g.save(); g.globalAlpha = k;
    g.font = '500 ' + (small ? 12 : 14) + 'px ' + FONT;
    const lines = wrap(g, G.msg.text, Math.min(W - 40, 640) - 90);
    const hh = 16 + lines.length * (small ? 16 : 18);
    const bw = Math.min(W - 24, 660), bx = (W - bw) / 2, by = H - pad.bottom - hh - 6;
    g.fillStyle = 'rgba(15,13,10,0.74)'; rr(g, bx, by, bw, hh, 8); g.fill();
    g.fillStyle = '#ff9a4a'; g.font = '700 ' + (small ? 10 : 11) + 'px ' + MONO; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(G.msg.who, bx + 12, by + 9);
    g.fillStyle = '#fbf5ec'; g.font = '500 ' + (small ? 12 : 14) + 'px ' + FONT;
    lines.forEach((l, i) => g.fillText(l, bx + 78, by + 8 + i * (small ? 16 : 18)));
    g.restore();
  }
  if (G.chant && G.phase === 'live') {
    const k = clamp(G.chant.t / 0.4, 0, 1) * (1 - clamp((G.chant.t - 3.8) / 0.7, 0, 1));
    g.save(); g.globalAlpha = k * 0.95; g.font = 'italic 600 ' + (small ? 13 : 16) + 'px ' + DISP; g.textAlign = 'center'; g.textBaseline = 'top';
    const cy = (G.ui.top || 90) + 4;
    g.fillStyle = 'rgba(15,13,10,0.55)'; const tw = g.measureText(G.chant.text).width + 24; rr(g, (W - tw) / 2, cy, tw, 26, 13); g.fill();
    g.fillStyle = '#ffe2b0'; g.fillText(G.chant.text, W / 2, cy + 5); g.restore();
  }
}
function hint(g, W, H, pad, text) { g.save(); g.font = '600 11px ' + MONO; g.textAlign = 'center'; g.fillStyle = 'rgba(251,245,236,0.6)'; g.fillText(text.toUpperCase(), W / 2, H - pad.bottom - 4); g.restore(); }
function big(g, W, y, text, col, size) {
  g.save(); g.font = '700 ' + Math.round(size) + 'px ' + DISP; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, size * 0.12); g.strokeStyle = 'rgba(10,8,6,0.75)'; g.lineJoin = 'round';
  let t = text; while (g.measureText(t).width > W - 30 && size > 12) { size *= 0.9; g.font = '700 ' + Math.round(size) + 'px ' + DISP; }
  g.strokeText(t, W / 2, y); g.fillStyle = col; g.fillText(t, W / 2, y); g.restore();
}
function wrap(g, text, maxW) {
  const words = text.split(' '), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out.slice(0, 3);
}
function drawBug(g, W, H, G, small) {
  // the TV scorebug: one plate per wrestler with condition, stamina and momentum
  const list = G.W.filter((w) => !w.gone || w.elim);
  const n = list.length;
  const cols = small ? 2 : Math.min(4, n);
  const pw = small ? Math.floor((W - 28 - (cols - 1) * 6) / cols) : Math.min(230, Math.floor((W - 260) / cols));
  const ph = small ? 40 : 46;
  g.save(); g.textBaseline = 'top';
  list.forEach((w, i) => {
    const cx = i % cols, cy = Math.floor(i / cols);
    const x = 14 + cx * (pw + 6), y = 10 + cy * (ph + 5);
    g.globalAlpha = w.elim ? 0.45 : w.apron ? 0.7 : 1;
    g.fillStyle = 'rgba(15,13,10,0.74)'; rr(g, x, y, pw, ph, 7); g.fill();
    g.fillStyle = w.def.col; g.fillRect(x, y, 4, ph);
    g.fillStyle = '#fbf5ec'; g.font = '700 ' + (small ? 11 : 12) + 'px ' + FONT; g.textAlign = 'left';
    let label = w.def.nick + (w === G.P ? ' (you)' : '');
    while (g.measureText(label).width > pw - 50 && label.length > 4) label = label.slice(0, -1);
    g.fillText(label, x + 10, y + 5);
    if (w.elim) { g.fillStyle = '#ff8a6a'; g.font = '700 10px ' + MONO; g.textAlign = 'right'; g.fillText('OUT', x + pw - 8, y + 6); }
    else if (G.cfg.match === 'tag') { g.fillStyle = w.legal ? '#ffd36a' : 'rgba(251,245,236,0.5)'; g.font = '700 9px ' + MONO; g.textAlign = 'right'; g.fillText(w.legal ? 'LEGAL' : 'APRON', x + pw - 8, y + 7); }
    const bx = x + 10, bw = pw - 20;
    const cond = 1 - w.dmg / 100;
    bar(g, bx, y + ph - 22, bw, 5, cond, cond > 0.5 ? '#7ad36a' : cond > 0.25 ? '#ffc04a' : '#ff5a4a');
    bar(g, bx, y + ph - 15, bw, 2, w.stam / 100, 'rgba(140,200,255,0.85)');
    const m = w.mom / 100, full = w.mom >= 100;
    bar(g, bx, y + ph - 10, bw, 5, m, full ? (Math.sin(G.realT * 10) > 0 ? '#ffe27a' : '#ff9a3a') : w.mom >= 50 ? '#ffb15c' : '#c98a4a');
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(bx + bw * 0.5, y + ph - 11, 1, 7);
    if (w.mom >= 50) { g.fillStyle = full ? '#ffe27a' : '#ffb15c'; g.font = '700 8px ' + MONO; g.textAlign = 'right'; g.fillText(full ? 'FIN' : 'SIG', x + pw - 6, y + ph - 24); }
  });
  g.globalAlpha = 1;
  // match bug on the right (desktop), or under the plates (phone)
  const mm = Math.floor(G.clock / 60), ss = Math.floor(G.clock % 60);
  const txt = (G.cfg.attract ? 'LIVE' : (MATCHES[G.cfg.match] || 'Practice')).toUpperCase();
  const clock = mm + ':' + (ss < 10 ? '0' : '') + ss;
  if (!small) {
    const bx = W - 150, by = 10;
    g.fillStyle = 'rgba(15,13,10,0.74)'; rr(g, bx, by, 136, 46, 7); g.fill();
    g.fillStyle = '#ff7a1a'; g.font = '700 13px ' + DISP; g.textAlign = 'left'; g.fillText(PROMO.short, bx + 10, by + 6);
    g.fillStyle = '#fbf5ec'; g.font = '600 10px ' + MONO; g.fillText(txt.slice(0, 15), bx + 10, by + 26);
    g.textAlign = 'right'; g.font = '700 13px ' + MONO; g.fillText(clock, bx + 126, by + 7);
    g.fillStyle = '#ff4f4f'; g.beginPath(); g.arc(bx + 126 - g.measureText(clock).width - 9, by + 14, 3.5, 0, TAU); g.fill();
  } else {
    const rows = Math.ceil(n / cols), by = 10 + rows * (ph + 5);
    g.fillStyle = 'rgba(15,13,10,0.6)'; rr(g, 14, by, 168, 20, 6); g.fill();
    g.fillStyle = '#ff7a1a'; g.font = '700 10px ' + MONO; g.textAlign = 'left'; g.fillText(PROMO.short, 22, by + 5);
    g.fillStyle = '#fbf5ec'; g.fillText(txt.slice(0, 13) + '  ' + clock, 52, by + 5);
    G.ui.top = by + 26;
  }
  if (!small) G.ui.top = 10 + Math.ceil(n / cols) * (ph + 5) + 4;
  g.restore();
}
function drawPrompts(g, a, G, small) {
  const P = G.P; if (!VIEW || !VIEW.project) return;
  // reversal ring over the player
  if (P.threat && !P.threat.early && G.phase === 'live') {
    const th = P.threat;
    if (VIEW.project(P.x, P.yb + 1.9, P.z, pv)) {
      const k = clamp((G.time - th.t0) / Math.max(0.05, th.w1 - th.t0), 0, 1);
      const inWin = G.time >= th.w0 && G.time <= th.w1;
      const r = 34 * (1 - k) + 14;
      g.save(); g.lineWidth = 3; g.strokeStyle = inWin ? '#ffd36a' : 'rgba(251,245,236,0.7)';
      g.beginPath(); g.arc(pv.x, pv.y, r, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(251,245,236,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(pv.x, pv.y, 14, 0, TAU); g.stroke();
      g.fillStyle = inWin ? '#ffd36a' : '#fbf5ec'; g.font = '700 11px ' + MONO; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(a.touchMode ? (a.touchStyle === 'pads' ? 'REV' : 'TAP') : a.gamepad ? 'B' : 'L', pv.x, pv.y);
      g.restore();
    }
  }
  if (P.revFlash < 0 && VIEW.project(P.x, P.yb + 2.1, P.z, pv)) { g.save(); g.globalAlpha = -P.revFlash / 0.6; g.font = '700 12px ' + MONO; g.textAlign = 'center'; g.fillStyle = '#ff8a6a'; g.fillText('TOO EARLY', pv.x, pv.y); g.restore(); }
  if (P.revFlash > 0 && VIEW.project(P.x, P.yb + 2.1, P.z, pv)) { g.save(); g.globalAlpha = P.revFlash / 0.7; g.font = '700 14px ' + MONO; g.textAlign = 'center'; g.fillStyle = '#ffd36a'; g.fillText('REVERSAL', pv.x, pv.y); g.restore(); }
  // the kick out needle
  const W = a.w, H = a.h, pad = { bottom: bottomSafe(a) };
  if (G.pin && G.pin.d === P && G.pin.nk && G.pin.refIn && !G.pin.nk.done) {
    const n = G.pin.nk, bw = Math.min(W - 60, 360), bx = (W - bw) / 2, by = H * 0.62;
    g.save(); g.fillStyle = 'rgba(15,13,10,0.8)'; rr(g, bx - 12, by - 30, bw + 24, 62, 10); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(bx, by, bw, 14);
    g.fillStyle = '#7ad36a'; g.fillRect(bx + (n.c - n.w / 2) * bw, by, n.w * bw, 14);
    g.fillStyle = '#fbf5ec'; g.fillRect(bx + n.p * bw - 2, by - 5, 4, 24);
    g.font = '700 12px ' + MONO; g.textAlign = 'center'; g.fillStyle = '#fbf5ec'; g.textBaseline = 'bottom';
    g.fillText('KICK OUT: ' + (a.touchMode ? 'TAP' : a.gamepad ? 'PRESS A' : 'PRESS J') + ' IN THE GREEN', W / 2, by - 8);
    g.restore();
  }
  if (G.sub && (G.sub.d === P || G.sub.a === P)) {
    const s = G.sub, bw = Math.min(W - 60, 360), bx = (W - bw) / 2, by = H * 0.62, def = s.d === P;
    g.save(); g.fillStyle = 'rgba(15,13,10,0.8)'; rr(g, bx - 12, by - 30, bw + 24, 66, 10); g.fill();
    bar(g, bx, by, bw, 10, s.press / 100, '#ff5a4a');
    bar(g, bx, by + 14, bw, 10, s.esc / 100, '#7ad36a');
    g.font = '700 12px ' + MONO; g.textAlign = 'center'; g.fillStyle = '#fbf5ec'; g.textBaseline = 'bottom';
    g.fillText(def ? (a.touchMode ? 'TAP FAST TO ESCAPE, DRAG TO THE ROPES' : 'MASH J TO ESCAPE, CRAWL TO THE ROPES') : (a.touchMode ? 'TAP FAST TO WRENCH IT IN' : 'MASH J OR K TO WRENCH IT IN'), W / 2, by - 8);
    g.restore();
  }
  if (P.st === 'down' && !G.pin && !(G.sub && G.sub.d === P) && G.phase === 'live') hint(g, W, H, { bottom: pad.bottom + 40 }, a.touchMode ? 'Tap to get up faster' : 'Press any move button to get up faster');
  // context prompt near the player
  if (G.phase === 'live' && P.st === 'idle') {
    const T = bestTarget(G, P);
    let tip = '';
    const kb = !a.touchMode;
    if (P.mom >= 100 && T && standing(T) && dist(P, T) < 1.8 && P.def.fin.kind !== 'aerial') tip = (kb ? (a.gamepad ? 'Y' : 'Space') : 'Special') + ': ' + P.def.fin.name;
    else if (P.mom >= 100 && P.def.fin.kind === 'aerial' && T && isDown(T)) tip = 'Climb a corner for the ' + P.def.fin.name;
    else if (T && T.st === 'down' && dist(P, T) < 1.7) tip = kb ? (a.gamepad ? 'LT pin, X submit, A ground move, RB lift' : 'E pin, K submit, J ground move, F lift') : 'Swipe down to pin, up to submit, tap to strike';
    else if (inRing(P)) { const cn = nearestCorner(P); if (Math.hypot(P.x - cn.x, P.z - cn.z) < 0.85) tip = (kb ? (a.gamepad ? 'RB' : 'F') : 'Swipe down') + ': climb the corner'; }
    if (!tip && G.cfg.match === 'tag' && P.legal) { const c0 = cornerOf(P.team); if (Math.hypot(P.x - c0.tx, P.z - c0.tz) < 1.0) tip = (kb ? (a.gamepad ? 'RB' : 'F') : 'Swipe down') + ': tag your partner'; }
    if (!tip && P.out) tip = (kb ? (a.gamepad ? 'RB' : 'F') : 'Swipe down') + ' by the apron to roll in';
    if (tip && VIEW.project(P.x, P.yb + 2.15, P.z, pv)) {
      g.save(); g.font = '600 ' + (small ? 11 : 12) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(tip).width + 18, x = clamp(pv.x, tw / 2 + 6, W - tw / 2 - 6);
      g.fillStyle = 'rgba(15,13,10,0.72)'; rr(g, x - tw / 2, pv.y - 12, tw, 24, 12); g.fill();
      g.fillStyle = '#fbf5ec'; g.fillText(tip, x, pv.y); g.restore();
    }
  }
  if (P.st === 'perch' && G.phase === 'live') hint(g, W, H, { bottom: pad.bottom + 40 }, a.touchMode ? 'Tap to dive' : (a.gamepad ? 'A to dive' : 'J to dive, F to climb down'));
  // player marker
  if (!G.cfg.attract && G.phase === 'live' && VIEW.project(P.x, P.yb + (P.h > 0.6 ? 2.05 : 0.7), P.z, pv)) {
    g.save(); g.fillStyle = P.def.col; g.beginPath(); g.moveTo(pv.x - 6, pv.y - 9); g.lineTo(pv.x + 6, pv.y - 9); g.lineTo(pv.x, pv.y - 2); g.closePath(); g.fill(); g.restore();
  }
}
function drawLesson(g, a, G, small) {
  const L = G.lesson, cur = LESSONS[L.i];
  const text = a.touchMode ? cur.touch : a.gamepad ? cur.pad : cur.key;
  const W = a.w, bw = Math.min(W - 28, 460), bx = (W - bw) / 2, by = (G.ui.top || 70) + (small ? 6 : 6);
  g.save(); g.font = '500 ' + (small ? 12 : 13) + 'px ' + FONT;
  const lines = wrap(g, text, bw - 30);
  const hh = 34 + lines.length * 18;
  g.fillStyle = 'rgba(15,13,10,0.8)'; rr(g, bx, by, bw, hh, 10); g.fill();
  g.fillStyle = '#ff9a4a'; g.font = '700 11px ' + MONO; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('LESSON ' + (L.i + 1) + ' OF ' + LESSONS.length + ': ' + cur.title.toUpperCase() + (cur.need > 1 ? '  ' + L.n + '/' + cur.need : ''), bx + 14, by + 10);
  g.fillStyle = '#fbf5ec'; g.font = '500 ' + (small ? 12 : 13) + 'px ' + FONT;
  lines.forEach((l, i) => g.fillText(l, bx + 14, by + 28 + i * 18));
  g.restore();
}
function drawStory(g, a, G) {
  const W = a.w, H = a.h, s = G.story; if (!s) return;
  g.save();
  g.fillStyle = 'rgba(8,6,10,0.72)'; g.fillRect(0, 0, W, H);
  const bw = Math.min(W - 28, 560), bx = (W - bw) / 2;
  g.font = '500 ' + (W < 560 ? 14 : 16) + 'px ' + FONT;
  const words = s.text.split(' '), shown = Math.min(words.length, Math.floor(G.storyT * 28));
  const lines = wrapAll(g, words.slice(0, shown).join(' '), bw - 44);
  const full = wrapAll(g, s.text, bw - 44);
  const hh = 120 + full.length * 22;
  const by = Math.max(16, (H - hh) / 2 - 20);
  g.fillStyle = 'rgba(20,16,14,0.94)'; rr(g, bx, by, bw, hh, 14); g.fill();
  g.strokeStyle = 'rgba(255,154,74,0.5)'; g.lineWidth = 1; rr(g, bx + 0.5, by + 0.5, bw - 1, hh - 1, 14); g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillStyle = '#ff9a4a'; g.font = '700 11px ' + MONO; g.fillText((s.champ ? 'TITLE MATCH, ' : '') + PROMO.show.toUpperCase() + ', ' + PROMO.name.toUpperCase(), bx + 22, by + 20);
  g.fillStyle = '#fbf5ec'; g.font = '600 ' + (W < 560 ? 20 : 24) + 'px ' + DISP; g.fillText(s.title, bx + 22, by + 40);
  g.fillStyle = 'rgba(251,245,236,0.9)'; g.font = '500 ' + (W < 560 ? 14 : 16) + 'px ' + FONT;
  lines.forEach((l, i) => g.fillText(l, bx + 22, by + 84 + i * 22));
  g.fillStyle = 'rgba(251,245,236,0.6)'; g.font = '600 11px ' + MONO;
  g.fillText(a.touchMode ? 'TAP TO HEAD TO THE RING' : 'PRESS SPACE TO HEAD TO THE RING', bx + 22, by + hh - 26);
  g.restore();
}
function wrapAll(g, text, maxW) {
  const words = text.split(' '), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}

/* ------------------------------------------------------------ menu */
const MENU_CSS = '.rr-intro{margin:0 0 10px}.rr-rules{font-size:13px;line-height:1.5;opacity:.86;margin:0 0 6px}.rr-rules b{color:var(--accent,#ff9a4a)}' +
  '.rr-res .rr-big{font-family:var(--font-display,Georgia);font-size:20px;margin:0 0 4px}.rr-res .rr-stars{font-size:22px;letter-spacing:.08em;color:#ffd36a;margin:0 0 6px}.rr-res .rr-stars span{font-size:12px;letter-spacing:.08em;color:rgba(251,245,236,.6);text-transform:uppercase}' +
  '.rr-res .rr-sub{font-size:13px;opacity:.8;margin:0 0 6px}.rr-res .rr-unlock{font-size:13px;color:#ffd36a;margin:0 0 6px}' +
  'details.rr-more{margin:6px 0 10px}details.rr-more summary{cursor:pointer;font-size:13px;color:var(--accent,#ff9a4a)}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }
function menuProps() {
  const u = unlocks(), c = loadCareer();
  const rosterChoices = ROSTER.map((r) => ({ v: r.id, label: r.nick + (r.unlock && !available(r.id) ? ' (locked)' : '') }));
  const career = c ? 'Career saved: ' + (byId(c.wid) || ROSTER[0]).nick + ', week ' + (c.week + 1) + (c.champ ? ', champion' : '') + ', record ' + c.wins + ' and ' + c.losses + '.' : 'No career saved yet.';
  void u;
  return {
    eyebrow: 'Wrestling, ' + PROMO.name, title: 'Ring <em>Rajas</em>',
    html: '<p class="rr-intro">Sports entertainment from the ' + PROMO.name + ' roster: strike, lock up, slam, fly off the top rope and pin your rival for the three count. Reverse at the right moment, fill your meter for a signature and a finisher, and chase the ' + PROMO.belt + ' in a career.</p>' +
      '<details class="rr-more"><summary>Rules and how to win</summary><p class="rr-rules"><b>Pinfall:</b> pin a downed rival and hold them for the referee\'s count of three. Kick out by pressing in the green as the needle sweeps. <b>Submission:</b> lock in a hold on a downed rival; they tap out when the red bar fills, unless they mash free or reach the ropes. <b>Count out:</b> a wrestler on the floor loses at a count of ten (turn this off with Ring-out count). A pin or hold with a foot on the ropes is broken. <b>Tag team:</b> only the legal wrestler may pin or be pinned; tag at your corner, and your partner can run in to save a pin. <b>Triple threat:</b> first fall wins, no count outs. <b>Elimination:</b> four wrestlers, every fall eliminates the one pinned, the last one standing wins.</p></details>' +
      '<p class="rr-rules">' + career + '</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'exhibition', choices: [{ v: 'exhibition', label: 'Exhibition' }, { v: 'career', label: 'Career' }, { v: 'practice', label: 'Training' }] },
      { id: 'match', label: 'Match (exhibition)', value: 'single', choices: [{ v: 'single', label: 'One on one' }, { v: 'tag', label: 'Tag team' }, { v: 'triple', label: 'Triple threat' }, { v: 'elim', label: 'Elimination' }] },
      { id: 'wid', label: 'Your wrestler', value: 'toofan', choices: rosterChoices },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      { id: 'countout', label: 'Ring-out count', value: 'on', choices: [{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }] },
      { id: 'attire', label: 'Attire', value: 'main', choices: [{ v: 'main', label: 'Main' }, { v: 'alt', label: 'Alternate (3 wins)' }] },
      { id: 'career', label: 'Career', value: 'continue', choices: [{ v: 'continue', label: 'Continue' }, { v: 'new', label: 'Start a new one' }], note: 'A new career starts with the wrestler chosen above.' },
    ],
  };
}

/* ------------------------------------------------------------ debug */
function debugState() {
  const G = MG, a = ARC;
  if (!G) return { state: a.state, phase: 'none' };
  const P = G.P, T = bestTarget(G, P);
  return {
    state: a.state, phase: G.cfg.attract ? 'attract' : G.phase, mode: G.cfg.mode, match: G.cfg.match, diff: G.cfg.diff, renderer: VIEW ? VIEW.name : 'none',
    wrestler: P.def.id, st: P.st, anim: P.anim, x: +P.x.toFixed(2), z: +P.z.toFixed(2), yaw: +P.yaw.toFixed(2),
    dmg: Math.round(P.dmg), stam: Math.round(P.stam), mom: Math.round(P.mom), out: P.out, legal: P.legal,
    opp: T ? { id: T.def.id, st: T.st, dmg: Math.round(T.dmg), x: +T.x.toFixed(2), z: +T.z.toFixed(2) } : null,
    hits: P.stats.hits, moves: P.stats.moves, revs: P.stats.revs, fins: P.stats.fins, kickouts: P.stats.kickouts,
    pin: G.pin ? { count: G.pin.count, att: G.pin.a.def.id, def: G.pin.d.def.id } : null, sub: G.sub ? { press: Math.round(G.sub.press), esc: Math.round(G.sub.esc) } : null,
    cout: G.cout ? G.cout.n : 0, clock: +G.clock.toFixed(2), time: +G.time.toFixed(2), crowd: +G.crowd.toFixed(2), wrestlers: G.W.length, elim: G.W.filter((w) => w.elim).length,
    winner: G.winner ? G.winner.def.id : null, method: G.method, alive: G.phase !== 'post', lesson: G.lesson ? G.lesson.i : null,
    gfx: VIEW && VIEW.debug ? VIEW.debug() : null,
  };
}

/* ------------------------------------------------------------ boot */
export function boot(view) {
  VIEW = view;
  const A = window.Arcade;
  A.create({
    three: !!view.three,
    slug: 'ring-rajas', title: 'Ring Rajas', genre: 'Wrestling',
    graphics(level) { if (view.graphics) view.graphics(level); },
    hint: 'WASD move, J strike, K grapple, L reverse, Shift run, E pin, Space special, F climb or tag.',
    touchHint: 'Stick to move. Strike, Grapple and Reverse on the pads; Special when the meter glows.',
    keys: [['WASD / arrows', 'Move'], ['J / left click', 'Strike, tap for a combo; in a lock, a quick move'], ['K / right click', 'Grapple; in a lock, a heavy move (stick picks which); on a downed rival, a submission'], ['L', 'Reverse when the ring turns gold'], ['Shift', 'Run; in a lock with a direction, Irish whip'], ['E', 'Pin a downed rival'], ['Space', 'Signature or finisher when the meter is ready, otherwise taunt'], ['F', 'Climb a corner, lift a rival, roll in or out, tag, toss over the ropes']],
    gameKeys: ['ShiftLeft', 'ShiftRight'],
    mouse: { steer: false, cursor: 'default', keys: [['Left click', 'Strike'], ['Right click', 'Grapple']] },
    // Controller: A strike, X grapple, B reverse, Y special, RT run, LT pin, bumpers climb, tag, roll.
    gamepad: { buttons: ['KeyJ', 'KeyK', 'KeyL', 'Space'], rt: 'ShiftLeft', lt: 'KeyE' },
    touch: { stick: true, pads: [{ label: 'Strike', key: 'KeyJ', big: true, hot: true }, { label: 'Grab', key: 'KeyK', big: true }, { label: 'Reverse', key: 'KeyL' }, { label: 'Run', key: 'ShiftLeft' }, { label: 'Pin', key: 'KeyE' }, { label: 'Special', key: 'Space', keep: true }, { label: 'Action', key: 'KeyF', keep: true }] },
    touchKeys: [['Stick', 'Move'], ['Strike', 'Strike, in a lock a quick move'], ['Grab', 'Lock up, in a lock a heavy move, on a downed rival a submission'], ['Reverse', 'When the ring turns gold'], ['Run', 'Hold with the stick; in a lock, whip'], ['Pin', 'Pin a downed rival'], ['Special', 'Signature or finisher, otherwise taunt'], ['Action', 'Climb, lift, roll in or out, tag']],
    gestures: {
      drag: 'xy', tilt: false,
      hint: 'Drag to move. Tap to strike or reverse. Swipe up to grab, down to pin. Special and Action stay on screen.',
      keys: [['Drag', 'Move'], ['Tap', 'Strike; reverse when the ring turns gold; kick out in the green'], ['Swipe up', 'Lock up; in a lock a heavy move; on a downed rival a submission'], ['Swipe down', 'Pin a downed rival, otherwise climb, roll or tag'], ['Swipe left or right', 'Run; in a lock, Irish whip'], ['Special', 'Signature or finisher, otherwise taunt'], ['Action', 'Climb, lift, roll in or out, tag']],
    },
    formatScore: (v) => Math.round(v) + ' pts',
    resize: (a) => { if (view.resize) view.resize(a); },
    init(a) {
      ARC = a;
      if (!view.init(a)) return;
      const origMenu = a.menu;
      a.menu = function (p) { return origMenu(Object.assign(menuProps(), p || {})); };
      a.debug = debugState;
      a.dev = Object.assign({
        match: () => MG,
        skip: () => { if (MG && (MG.phase === 'story' || MG.phase === 'entrance')) { finishEntrances(MG); MG.pt = 2; } },
        bell: () => { if (MG && MG.phase === 'bell') MG.pt = 5; },
        bot: (on) => { if (MG) MG.P.bot = on !== false; },
        mom: (v) => { if (MG) MG.P.mom = v == null ? 100 : v; },
        hurt: (who, v) => { if (MG) { const w = who === 'p' ? MG.P : bestTarget(MG, MG.P); if (w) w.dmg = v == null ? 90 : v; } },
        finish: () => { if (MG) { const T = bestTarget(MG, MG.P); if (T) { MG.P.mom = 100; MG.P.yaw = faceTo(MG.P, T.x, T.z); T.x = MG.P.x + Math.sin(MG.P.yaw) * 1.0; T.z = MG.P.z + Math.cos(MG.P.yaw) * 1.0; stand(MG, T); doSpecialMove(MG, MG.P, T); } } },
        win: () => { if (MG && MG.phase === 'live') { const T = bestTarget(MG, MG.P); endMatch(MG, MG.P, T, 'Pinfall'); } },
        lose: () => { if (MG && MG.phase === 'live') { const T = bestTarget(MG, MG.P); endMatch(MG, T, MG.P, 'Pinfall'); } },
        pinTest: () => { if (MG) { const T = bestTarget(MG, MG.P); if (T) { down(MG, T, 'up', 9); T.dmg = 95; startPin(MG, MG.P, T); } } },
        career: () => loadCareer(), resetCareer: () => { if (ARC) ARC.store.set(CKEY, null); },
        // stand the nearest rival a step in front of the player (input tests)
        calm: (on) => { if (MG) MG.calm = on !== false; },
        hud: (on) => { if (MG) MG.noHud = on === false; },
        face: () => { const G = MG; if (!G) return; const P = G.P, T = bestTarget(G, P) || G.W[1]; stand(G, P); stand(G, T); P.x = -0.5; P.z = 0.3; P.yaw = HALF; T.x = 0.55; T.z = 0.3; T.yaw = -HALF; T.ai.think = 3; P.threat = null; T.threat = null; T.ai.press.length = 0; },
        // freeze a pose for screenshots: dev.duo('slam', 0.5), dev.solo('dropkick', 0.3), dev.pose('pin')
        freeze: (on) => { if (MG) MG.frozen = on !== false; },
        duo: (tpl, k, fin, heavy) => {
          const G = MG; if (!G || !DUO[tpl]) return;
          finishEntrances(G); setPhase(G, 'live'); G.frozen = true; G.msg = null; G.pin = null; G.sub = null;
          let P = G.P, T = bestTarget(G, P) || G.W[1];
          if (heavy && T.def.kg > P.def.kg) { const x = P; P = T; T = x; }
          for (const w of G.W) { stand(G, w); w.threat = null; }
          P.x = -0.5; P.z = 0.2; P.yaw = HALF; T.x = 0.3; T.z = 0.2; T.yaw = -HALF;
          startDuo(G, P, T, tpl, { noRev: true, fin: !!fin, name: fin ? P.def.fin.name : null });
          const mv = P.move, n = 60; for (let i = 0; i < n; i++) { if (P.move !== mv) break; if (mv.t + mv.dur / n > mv.dur * k) break; updateDuo(G, mv, mv.dur / n); }
          G.ref.x = 0.2; G.ref.z = -1.8;
        },
        solo: (name, k, dn) => {
          const G = MG; if (!G || !SOLO[name]) return;
          finishEntrances(G); setPhase(G, 'live'); G.frozen = true; G.pin = null; G.sub = null;
          const P = G.P, T = bestTarget(G, P) || G.W[1];
          for (const w of G.W) { stand(G, w); w.threat = null; }
          P.x = -0.6; P.z = 0.2; P.yaw = HALF; T.x = 0.6; T.z = 0.2; T.yaw = -HALF;
          if (dn) down(G, T, 'up', 9);
          startSolo(G, P, name, { target: T, noRev: true });
          const n = 60; for (let i = 0; i < n; i++) { if (!P.solo || P.solo.t + P.solo.dur / n > P.solo.dur * k) break; updateSolo(G, P, P.solo.dur / n); }
        },
        pose: (what) => {
          const G = MG; if (!G) return;
          finishEntrances(G); setPhase(G, 'live'); G.frozen = true; G.pin = null; G.sub = null;
          const P = G.P, T = bestTarget(G, P) || G.W[1];
          for (const w of G.W) { stand(G, w); w.threat = null; }
          P.x = -0.6; P.z = 0.2; P.yaw = HALF; T.x = 0.4; T.z = 0.3; T.yaw = -HALF;
          if (what === 'pin') { down(G, T, 'up', 9); startPin(G, P, T); G.pin.count = 2; G.pin.refIn = true; G.ref.x = T.x - 0.9; G.ref.z = T.z + 0.2; G.ref.slap = 0.15; G.ref.anim = 'count'; }
          else if (what === 'bridge') { down(G, T, 'up', 9); startPin(G, P, T, true); }
          else if (what.indexOf('sub:') === 0) { down(G, T, 'up', 9); startSub(G, P, T, what.slice(4)); }
          else if (what === 'perch') { P.x = 2.6; P.z = 2.6; setSt(P, 'perch'); P.perch = { sx: 1, sz: 1 }; P.x = 2.88; P.z = 2.88; P.yb = RH + 0.98; P.yaw = Math.atan2(-1, -1); down(G, T, 'up', 9); }
          else if (what === 'splash') { setSt(P, 'fly'); P.anim = 'splash'; P.x = 0.9; P.z = 0.9; P.yb = RH + 1.2; P.h = 0.5; P.pitch = HALF; down(G, T, 'up', 9); }
          else if (what === 'down') { down(G, T, 'up', 9); T.dmg = 70; }
          else if (what === 'front') { down(G, T, 'front', 9); }
          else if (what === 'lock') { startLock(G, P, T); }
          else if (what === 'apron') { /* tag only */ }
        },
      }, view.dev || {});
      a.canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') { if (e.button === 2) MOUSE.rclick = true; else if (e.button === 0) MOUSE.click = true; }
      });
      a.menu();
    },
    onMenu() { injectCss(); },
    start(a, ch) {
      injectCss();
      const cfg = { mode: ch.mode === 'career' || ch.mode === 'practice' ? ch.mode : 'exhibition', match: MATCHES[ch.match] ? ch.match : 'single', diff: DIFF[ch.diff] ? ch.diff : 'normal',
        wid: available(ch.wid) ? ch.wid : 'toofan', countout: ch.countout === 'off' ? 'off' : 'on', attire: ch.attire === 'alt' ? 'alt' : 'main', career: ch.career === 'new' ? 'new' : 'continue', attract: false };
      if (!available(ch.wid) && ch.wid) a.toast('That wrestler is locked', byId(ch.wid) && byId(ch.wid).unlock === 'belt' ? 'Win the Raja Belt in the career' : 'Reach week five of the career', 2200);
      if (cfg.attire === 'alt' && (unlocks().wins[cfg.wid] || 0) < 3) { cfg.attire = 'main'; }
      let story = null;
      if (cfg.mode === 'career') { story = careerCfg(cfg); a.choices.career = 'continue'; a.store.set('arcade.ring-rajas.career', 'continue'); }
      if (cfg.mode === 'practice') { cfg.match = 'single'; cfg.countout = 'off'; }
      MG = newMatch(cfg);
      MG.P.bot = false;
      audioInit();
      if (view.newMatch) view.newMatch(MG, a);
      if (story) { MG.story = story; setPhase(MG, 'story'); MG.storyT = 0; }
      else if (cfg.mode === 'practice') { MG.W.forEach((w) => { w.hidden = false; }); placeStart(MG); setPhase(MG, 'bell'); }
      else { setPhase(MG, 'entrance'); MG.ent = 0; startEntrance(MG); }
    },
    update(dt, a) {
      const G = MG; if (!G || G.cfg.attract) return;
      const inp = a.input;
      let skip = inp.hit('Space', 'Enter', 'NumpadEnter', 'KeyJ') || MOUSE.click;
      if (G.phase === 'story' || G.phase === 'entrance' || G.phase === 'replay' || G.phase === 'bell') { const tp = inp.tap(), sw = inp.swipe(); if (tp || sw) skip = true; MOUSE.click = false; }
      if (VIEW && VIEW.camYaw) G.camYaw = VIEW.camYaw();
      const scale = VIEW && VIEW.timeScale ? VIEW.timeScale() : 1;
      stepMatch(G, dt * scale, a, skip);
      audioFrame(G, a, dt);
    },
    idle(dt, a) {
      if (a.state === 'menu') {
        if (!MG || !MG.cfg.attract) {
          MG = newMatch({ mode: 'exhibition', match: 'single', diff: 'normal', wid: pick(ROSTER.slice(0, 8)).id, countout: 'off', attire: 'main', attract: true });
          attractStart(MG); if (view.newMatch) view.newMatch(MG, a);
        }
        if (VIEW && VIEW.camYaw) MG.camYaw = VIEW.camYaw();
        stepMatch(MG, dt, a, false);
      } else if (a.state === 'over' && MG) {
        stepMatch(MG, dt, a, false);
      }
      audioFrame(MG, a, dt);
    },
    render(ctx, a) {
      if (!MG) { ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, a.w, a.h); return; }
      let ok = true;
      try { ok = view.render(a, MG, ctx) !== false; } catch (e) { ok = false; console.warn(e); }
      if (!ok) return;
      if (!MG.noHud) drawHUD(ctx, a, MG);
    },
    onPause() { if (AU && AU.ok) try { AU.master.gain.setTargetAtTime(0, AU.ctx.currentTime, 0.05); } catch (e) { /* ignore */ } },
    onOver() { if (AU && AU.ok) try { AU.master.gain.setTargetAtTime(0.3, AU.ctx.currentTime, 0.2); } catch (e) { /* ignore */ } },
  });
}
// For headless tests of the rules: build and step a match without a page.
export const __sim = { newMatch, stepMatch, attractStart, startEntrance, setPhase, finishEntrances, bestTarget };
