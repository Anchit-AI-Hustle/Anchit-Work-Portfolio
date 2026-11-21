/*
 * Kart Mela: the content and the career. Racers, kart parts, cups, circuits,
 * battle arenas, items, rival personalities, the commentary and the save file.
 * Pure data and small functions, no three.js: game3d.js imports it.
 *
 * Everything here is original: racer names, places, items and lines.
 */

/* ------------------------------------------------------------ racers */
// spd, acc, hnd, wt: 0..1. kind picks the head and body model. persona drives the AI.
export const CHARS = [
  { id: 'chotu', name: 'Chotu Chakra', kind: 'kid', spd: 0.72, acc: 0.95, hnd: 0.9, wt: 0.3, kart: '#ff6a1a', trim: '#ffd23f', skin: '#c98e62', hair: '#2a1b12', shirt: '#2f6fd8', hat: '#e8452c', body: 'scooty', persona: 'starter', blurb: 'A quick-handed kid in a backwards cap. Gets off the line like a firecracker.' },
  { id: 'rani', name: 'Rani Rocket', kind: 'girl', spd: 0.86, acc: 0.78, hnd: 0.86, wt: 0.42, kart: '#ff4f9a', trim: '#ffffff', skin: '#b97a52', hair: '#1c1110', shirt: '#ffcf33', hat: '#38e1ff', body: 'classic', persona: 'precise', blurb: 'Twin braids, flying goggles and no brakes. Fast and tidy through the bends.' },
  { id: 'bholu', name: 'Bholu Bhalu', kind: 'bear', spd: 0.94, acc: 0.58, hnd: 0.62, wt: 0.95, kart: '#c2272d', trim: '#f2c230', skin: '#7a4b2a', hair: '#5c3720', shirt: '#2b8a4b', hat: '#2b8a4b', body: 'tuktuk', persona: 'bruiser', blurb: 'A big friendly bear. Slow to get going, unstoppable once rolling.' },
  { id: 'tikki', name: 'Tikki Tota', kind: 'parrot', spd: 0.74, acc: 0.9, hnd: 1.0, wt: 0.22, kart: '#2fbf4a', trim: '#ff7a1a', skin: '#2fbf4a', hair: '#e8452c', shirt: '#2fbf4a', hat: '#ffd23f', body: 'kite', persona: 'drifter', blurb: 'A chatty parrot who corners like a dart. Light as a feather in a bump.' },
  { id: 'dada', name: 'Dada Dhamaka', kind: 'grandpa', spd: 0.9, acc: 0.66, hnd: 0.72, wt: 0.8, kart: '#f2c230', trim: '#1d2440', skin: '#d9a07a', hair: '#f4f1ea', shirt: '#8a5a3a', hat: '#5b6670', body: 'rath', persona: 'steady', blurb: 'A grandpa with a legendary moustache. Has been racing since before karts.' },
  { id: 'meenu', name: 'Meenu Mausi', kind: 'auntie', spd: 0.84, acc: 0.76, hnd: 0.8, wt: 0.6, kart: '#8a4fe0', trim: '#ffd23f', skin: '#c8875c', hair: '#221512', shirt: '#e94f8a', hat: '#ffd23f', body: 'classic', persona: 'shortcut', blurb: 'Big sunglasses, bigger attitude. Knows every shortcut in town.' },
  { id: 'gappu', name: 'Gappu Gajju', kind: 'elephant', spd: 1.0, acc: 0.52, hnd: 0.55, wt: 1.0, kart: '#2d7fd1', trim: '#ff6a1a', skin: '#8f97a3', hair: '#8f97a3', shirt: '#ff6a1a', hat: '#ffd23f', body: 'thela', persona: 'hothead', blurb: 'A baby elephant with a heavy right foot. The top speed king of the mela.' },
  { id: 'zippy', name: 'Zippy Billi', kind: 'cat', spd: 0.8, acc: 0.86, hnd: 0.94, wt: 0.34, kart: '#19b3a6', trim: '#ffffff', skin: '#f0a64b', hair: '#f0a64b', stripe: '#c9782a', shirt: '#1d2440', hat: '#e94f8a', body: 'scooty', persona: 'hoarder', blurb: 'A nimble cat who always lands on four wheels. Loves a long drift.' },
  { id: 'sitara', name: 'Sitara Stunt', kind: 'girl', spd: 0.88, acc: 0.8, hnd: 0.82, wt: 0.46, kart: '#1d2440', trim: '#ffb736', skin: '#a8714a', hair: '#3a1f14', shirt: '#e8452c', hat: '#ffffff', body: 'rath', persona: 'daredevil', unlock: { cup: 'chai' }, blurb: 'A wall-of-death stunt rider from the travelling circus. Never lands a jump without a trick.' },
  { id: 'sheru', name: 'Sheru Shera', kind: 'cat', spd: 0.9, acc: 0.72, hnd: 0.78, wt: 0.62, kart: '#ff9a1f', trim: '#1d1d22', skin: '#ff8a2a', hair: '#ff8a2a', stripe: '#2a1b12', shirt: '#2b8a4b', hat: '#ffd23f', body: 'thela', persona: 'hunter', unlock: { cup: 'mango' }, blurb: 'A tiger cub who hunts the leader. Saves every rocket for whoever is in front.' },
  { id: 'nani', name: 'Nani Nitro', kind: 'auntie', spd: 0.82, acc: 0.84, hnd: 0.86, wt: 0.5, kart: '#f4f1ea', trim: '#e94f8a', skin: '#c08a66', hair: '#d8d4cc', shirt: '#7a3fbf', hat: '#e94f8a', body: 'kite', persona: 'wily', unlock: { cup: 'masala' }, blurb: 'A grandma with a pocketful of chai. Times every boost for the longest straight.' },
  { id: 'moru', name: 'Moru Mor', kind: 'parrot', spd: 0.86, acc: 0.82, hnd: 0.9, wt: 0.4, kart: '#1a5fbf', trim: '#2fbf8a', skin: '#1a6fd1', hair: '#1fa38a', shirt: '#1a6fd1', hat: '#ffd23f', body: 'rath', persona: 'showboat', unlock: { cup: 'diya' }, blurb: 'A peacock who races for the crowd. Fans his tail on every podium.' }
];
export const CHAR_IDX = {}; CHARS.forEach((c, i) => { CHAR_IDX[c.id] = i; });

// How each rival races. Numbers are small nudges round the shared driving code.
//  line: hugs the racing line (0..1)  err: mistake rate x  drift: drift habit x
//  short: shortcut habit x  bump: leans on karts alongside  hold: keeps items for defence
//  hunt: saves attack items for the leader  heat: temper after being passed  trick: tricks off ramps
//  start: rocket start chance
export const PERSONAS = {
  starter: { name: 'Quick starter', line: 0.8, err: 1, drift: 1, short: 1, bump: 0.2, hold: 0.2, hunt: 0.2, heat: 1, trick: 0.6, start: 0.85, note: 'Explodes off the line and races hard early.' },
  precise: { name: 'Precise', line: 1, err: 0.55, drift: 1.1, short: 0.7, bump: 0, hold: 0.3, hunt: 0.3, heat: 0.6, trick: 0.6, start: 0.55, note: 'Hugs the racing line and rarely puts a wheel wrong.' },
  bruiser: { name: 'Bruiser', line: 0.7, err: 1.1, drift: 0.7, short: 0.8, bump: 1, hold: 0.1, hunt: 0.4, heat: 1.2, trick: 0.3, start: 0.35, note: 'Leans on anyone alongside and never backs off.' },
  drifter: { name: 'Drift artist', line: 0.85, err: 1, drift: 1.8, short: 0.8, bump: 0.1, hold: 0.3, hunt: 0.3, heat: 0.9, trick: 0.8, start: 0.5, note: 'Slides every bend for ultra turbos.' },
  steady: { name: 'Steady', line: 0.9, err: 0.6, drift: 0.8, short: 0.2, bump: 0.2, hold: 0.5, hunt: 0.2, heat: 0.4, trick: 0.4, start: 0.5, note: 'Never gambles. Never takes a shortcut either.' },
  shortcut: { name: 'Shortcut queen', line: 0.75, err: 1, drift: 1, short: 2.4, bump: 0.3, hold: 0.3, hunt: 0.4, heat: 1, trick: 0.5, start: 0.5, note: 'Takes every shortcut, boost or no boost.' },
  hothead: { name: 'Hot-head', line: 0.7, err: 1.5, drift: 0.9, short: 1, bump: 0.6, hold: 0.1, hunt: 0.5, heat: 2, trick: 0.4, start: 0.6, note: 'Fast when calm, wild when passed.' },
  hoarder: { name: 'Item hoarder', line: 0.85, err: 0.9, drift: 1.3, short: 1, bump: 0.1, hold: 1, hunt: 0.3, heat: 0.8, trick: 0.7, start: 0.5, note: 'Trails a peel behind to stay safe.' },
  daredevil: { name: 'Daredevil', line: 0.75, err: 1.2, drift: 1.4, short: 1.8, bump: 0.4, hold: 0.2, hunt: 0.4, heat: 1.1, trick: 1, start: 0.7, note: 'Tricks every jump and gambles on every shortcut.' },
  hunter: { name: 'Hunter', line: 0.85, err: 0.9, drift: 1.1, short: 1, bump: 0.5, hold: 0.2, hunt: 1, heat: 1.2, trick: 0.6, start: 0.6, note: 'Saves rockets for the leader.' },
  wily: { name: 'Wily', line: 0.95, err: 0.7, drift: 1.2, short: 1.2, bump: 0.1, hold: 0.7, hunt: 0.6, heat: 0.5, trick: 0.6, start: 0.7, note: 'Times every boost for the longest straight.' },
  showboat: { name: 'Showboat', line: 0.8, err: 1.1, drift: 1.3, short: 1, bump: 0.2, hold: 0.3, hunt: 0.3, heat: 0.9, trick: 1, start: 0.6, note: 'Plays to the crowd, sometimes too much.' }
};

/* ------------------------------------------------------------ kart parts */
// Each part nudges the racer's stats (0..1 scale). mt is the mini-turbo charge rate.
export const BODIES = [
  { id: 'classic', name: 'Mela Classic', spd: 0, acc: 0, hnd: 0, wt: 0, mt: 0, tokens: 0, blurb: 'The kart every racer learns in. Balanced in every way.' },
  { id: 'scooty', name: 'Scooty Zip', spd: -0.06, acc: 0.1, hnd: 0.06, wt: -0.08, mt: 0.04, tokens: 0, blurb: 'Tiny and twitchy. Leaps off the line.' },
  { id: 'tuktuk', name: 'Tuk Tuk Tank', spd: 0.06, acc: -0.06, hnd: -0.06, wt: 0.14, mt: 0, tokens: 40, blurb: 'Three wheels of attitude. Heavy enough to shove anyone aside.' },
  { id: 'rath', name: 'Royal Rath', spd: 0.02, acc: -0.02, hnd: 0.1, wt: 0.04, mt: 0.04, tokens: 90, blurb: 'A carved chariot body. Turns in like it is on rails.' },
  { id: 'kite', name: 'Patang Glider', spd: -0.02, acc: 0.04, hnd: 0.04, wt: -0.06, mt: 0.12, tokens: 160, blurb: 'Paper-light with tail fins. Charges drift turbos fastest.' },
  { id: 'thela', name: 'Rocket Thela', spd: 0.1, acc: -0.1, hnd: -0.04, wt: 0.08, mt: -0.02, tokens: 260, blurb: 'A street cart with a jet strapped on. All top speed.' }
];
export const WHEELS = [
  { id: 'std', name: 'Standard', spd: 0, acc: 0, hnd: 0, wt: 0, mt: 0, off: 0, tokens: 0, r: 0.3, rr: 0.36, w: 0.26, rim: null, blurb: 'Good at everything.' },
  { id: 'chunky', name: 'Chunky Treads', spd: -0.02, acc: 0.02, hnd: -0.02, wt: 0.06, mt: 0, off: 0.12, tokens: 25, r: 0.36, rr: 0.42, w: 0.34, rim: '#444a55', blurb: 'Big knobbly tyres. Barely slow down on grass and sand.' },
  { id: 'slick', name: 'Slicks', spd: 0.05, acc: -0.04, hnd: 0.02, wt: 0, mt: 0, off: -0.06, tokens: 70, r: 0.29, rr: 0.35, w: 0.3, rim: '#d9dde4', blurb: 'Smooth and fast on the road. Slippery off it.' },
  { id: 'spoke', name: 'Wooden Spokes', spd: -0.02, acc: 0.06, hnd: 0.04, wt: -0.04, mt: 0.05, off: 0, tokens: 130, r: 0.33, rr: 0.4, w: 0.18, rim: '#a8743a', blurb: 'Bullock-cart wheels, rebuilt for racing. Light and lively.' },
  { id: 'glow', name: 'Diya Glow', spd: 0.02, acc: 0.02, hnd: 0.02, wt: 0, mt: 0.06, off: 0, tokens: 220, r: 0.3, rr: 0.36, w: 0.26, rim: '#ffb736', glow: true, blurb: 'Lit from inside like festival lamps. A little better at everything.' }
];
export const BODY_IDX = {}; BODIES.forEach((b, i) => { BODY_IDX[b.id] = i; });
export const WHEEL_IDX = {}; WHEELS.forEach((b, i) => { WHEEL_IDX[b.id] = i; });
const cl01 = (v) => (v < 0.05 ? 0.05 : v > 1.1 ? 1.1 : v);
export function statsFor(c, bodyId, wheelId) {
  const b = BODIES[BODY_IDX[bodyId]] || BODIES[0], w = WHEELS[WHEEL_IDX[wheelId]] || WHEELS[0];
  return { spd: cl01(c.spd + b.spd + w.spd), acc: cl01(c.acc + b.acc + w.acc), hnd: cl01(c.hnd + b.hnd + w.hnd), wt: cl01(c.wt + b.wt + w.wt), mt: b.mt + w.mt, off: w.off };
}

/* ------------------------------------------------------------ classes and cups */
export const DIFF = {
  easy: { name: 'Easy', cc: '50cc', speed: 0.86, ai: 0.85, ahead: -0.12, behind: 0.05, mul: 0.6, drift: 0.35, short: 0.1, err: 1.5 },
  normal: { name: 'Normal', cc: '100cc', speed: 1.0, ai: 0.94, ahead: -0.06, behind: 0.09, mul: 1, drift: 0.65, short: 0.35, err: 1 },
  hard: { name: 'Hard', cc: '150cc', speed: 1.12, ai: 1.0, ahead: -0.025, behind: 0.12, mul: 1.5, drift: 0.9, short: 0.7, err: 0.7 },
  mirror: { name: 'Mirror', cc: 'Mirror', speed: 1.12, ai: 1.0, ahead: -0.025, behind: 0.12, mul: 1.8, drift: 0.9, short: 0.7, err: 0.7, mirror: true }
};
export const PTS = [15, 12, 10, 8, 6, 4, 3, 2, 1, 0, 0, 0];
export const CUPS = [
  { id: 'chai', name: 'Chai Cup', tracks: ['fair', 'coast', 'hill', 'roof'], col: '#d98a4b', blurb: 'Four friendly circuits to learn on.' },
  { id: 'mango', name: 'Mango Cup', tracks: ['bigtop', 'fort', 'tea', 'pass'], col: '#ffc531', blurb: 'Longer laps, desert dunes and the first snow.', unlock: { any: ['chai'] } },
  { id: 'masala', name: 'Masala Cup', tracks: ['kites', 'lighthouse', 'canyon', 'glacier'], col: '#e8452c', blurb: 'Rooftop gaps, sea cliffs and black ice.', unlock: { any: ['chai', 'mango'], count: 2 } },
  { id: 'diya', name: 'Diya Cup', tracks: ['finale', 'harbour', 'mirage', 'summit'], col: '#ffb736', blurb: 'The hardest four. Win here to be the champion of the mela.', unlock: { any: ['masala'] } }
];
export const CUP_IDX = {}; CUPS.forEach((c, i) => { CUP_IDX[c.id] = i; });

/* ------------------------------------------------------------ circuits */
// pts: [x, z, y] control points of a closed Catmull-Rom loop. Positions along the lap
// are a spline parameter p (point index plus the fraction to the next). theme picks the
// scenery builder; look overrides parts of the theme's sky and light.
export const TRACKS = [
  {
    id: 'fair', theme: 'fair', name: 'Mela Lights', place: 'Fairground at night', short: 'Fairground', hw: 7, scale: 0.85, start: 0.45, wall: 6.5, off: 0.55, voidOff: false,
    pts: [[0, -40, 0], [0, 40, 0], [12, 72, 0], [45, 88, 0], [80, 80, 0], [96, 55, 0], [86, 28, 0], [64, 18, 0], [56, -4, 0], [72, -26, 0], [110, -30, 0.4], [140, -14, 0.4], [160, 16, 0], [178, 40, 0], [200, 40, 0], [214, 10, 0], [208, -40, 0], [180, -80, 1.2], [130, -100, 1.6], [60, -100, 1.2], [16, -82, 0.4]],
    sc: { from: 6, to: 12, via: [[100, 10, 0], [130, 8, 0]], hw: 4.2, mult: 0.72 },
    boxes: [2.3, 8.6, 15.2], pads: [[13.6, 0], [19.4, -0.3], [6.25, 0, 1]], ramps: [{ p: 10.42, len: 7, gap: [10.5, 10.68] }],
    haz: [{ k: 'ball', p: 17.4 }, { k: 'ball', p: 4.4 }]
  },
  {
    id: 'hill', theme: 'hill', name: 'Monsoon Hills', place: 'Hill station in the rain', short: 'Hill station', hw: 6.5, scale: 1, start: 0.5, wall: 5, off: 0.5, voidOff: false,
    pts: [[0, -30, 0], [0, 50, 0], [-10, 80, 2], [-40, 95, 5], [-70, 80, 7], [-80, 50, 7], [-60, 20, 5], [-70, -10, 6], [-100, -25, 9], [-120, -55, 11], [-105, -90, 12], [-60, -100, 11], [-40, -80, 7], [-20, -110, 11], [20, -120, 10], [50, -95, 7], [40, -65, 4], [15, -55, 2]],
    sc: { from: 11, to: 13, via: [[-42, -113, 11.2]], hw: 3.6, mult: 0.8 },
    boxes: [1.0, 6.6, 13.7], pads: [[15.6, 0], [3.4, 0.25]], ramps: [{ p: 9.3, len: 6 }],
    haz: [{ k: 'puddle', p: 1.6, lat: -0.35 }, { k: 'puddle', p: 1.85, lat: 0.4 }, { k: 'puddle', p: 5.5, lat: 0 }, { k: 'puddle', p: 7.6, lat: -0.25 }, { k: 'puddle', p: 14.5, lat: 0.3 }, { k: 'puddle', p: 16.6, lat: -0.3 }]
  },
  {
    id: 'roof', theme: 'roof', name: 'Spice Rooftops', place: 'Market rooftops at sunset', short: 'Rooftops', hw: 6, scale: 1, start: 0.5, wall: 1.8, off: 0.6, voidOff: true,
    pts: [[0, -50, 10], [0, 30, 10], [20, 60, 10], [60, 65, 10], [85, 45, 10], [85, 10, 8], [110, -10, 8], [150, -5, 8], [170, 25, 8], [200, 30, 8], [215, 0, 8], [200, -40, 8], [160, -60, 9], [120, -55, 10], [90, -75, 10], [50, -95, 10], [15, -85, 10]],
    sc: { from: 7, to: 10, via: [[183, -12, 8]], hw: 2.6, mult: 0.92 },
    boxes: [1.3, 7.35, 13.4], pads: [[3.4, 0], [10.6, -0.2]], ramps: [{ p: 4.3, len: 6, gap: [4.4, 4.62] }],
    haz: [{ k: 'sack', p: 2.5, lat: 0.55 }, { k: 'sack', p: 6.4, lat: -0.5 }, { k: 'sack', p: 8.6, lat: 0.45 }, { k: 'sack', p: 12.3, lat: -0.4 }, { k: 'sack', p: 15.2, lat: 0.5 }, { k: 'heap', p: 6.0, lat: 0.3 }, { k: 'heap', p: 11.4, lat: -0.1 }, { k: 'heap', p: 14.6, lat: -0.45 }]
  }
  ,
  {
    id: 'coast', theme: 'beach', name: 'Coconut Coast', place: 'Seaside promenade at noon', short: 'Beach', hw: 7, scale: 1.2, start: 0.4, wall: 5, off: 0.62, voidOff: false,
    pts: [[0, -50, 0], [0, 30, 0], [10, 60, 0], [40, 78, 0], [75, 72, 0.3], [95, 48, 0.6], [92, 15, 0.6], [75, -5, 0.3], [80, -35, 0], [108, -55, 0], [120, -85, 0.5], [100, -112, 1], [60, -118, 1], [25, -100, 0.5]],
    sc: { from: 6, to: 9, via: [[104, -20, 0.4]], hw: 4, mult: 0.74 },
    boxes: [2.2, 7.2, 11.6], pads: [[4.4, 0], [12.6, 0.2]], ramps: [{ p: 0.45, len: 7, gap: [0.53, 0.62] }],
    haz: [{ k: 'ball', p: 3.5 }, { k: 'ball', p: 11.1 }, { k: 'sand', p: 5.6, lat: 0.4 }, { k: 'sand', p: 9.6, lat: -0.35 }, { k: 'sand', p: 12.9, lat: 0.3 }]
  },
  {
    id: 'bigtop', theme: 'fair', name: 'Big Top Loop', place: 'Circus field at dusk', short: 'Circus', hw: 7, scale: 1.2, start: 0.4, wall: 6, off: 0.55, voidOff: false,
    look: { skyTop: '#101a4a', skyMid: '#4a3a7a', skyHor: '#ff8a5a', exposure: 1.18, stars: 0.5 },
    pts: [[0, -70, 0], [0, 10, 0], [12, 45, 0], [45, 62, 0], [80, 55, 0], [100, 28, 0], [95, -5, 0], [74, -24, 0], [46, -10, 0], [30, -34, 0], [42, -58, 0], [75, -62, 0], [105, -70, 0.5], [120, -100, 1], [95, -128, 1.2], [50, -132, 1], [15, -112, 0.5]],
    sc: { from: 6, to: 11, via: [[93, -38, 0]], hw: 4.2, mult: 0.62 },
    boxes: [2.3, 9.0, 13.6], pads: [[4.5, 0], [15.4, 0], [6.3, 0, 1]], ramps: [{ p: 0.55, len: 7, gap: [0.62, 0.71] }],
    haz: [{ k: 'ball', p: 12.5 }, { k: 'ball', p: 3.4 }, { k: 'ball', p: 8.4 }]
  },
  {
    id: 'fort', theme: 'desert', name: 'Dune Fort Dash', place: 'Desert fort at golden hour', short: 'Desert fort', hw: 7.5, scale: 1.2, start: 0.4, wall: 6, off: 0.5, voidOff: false,
    pts: [[0, -60, 0], [0, 40, 0], [15, 75, 1], [55, 92, 2], [100, 85, 3], [130, 55, 3], [135, 15, 2], [102, -16, 1], [120, -50, 1.5], [145, -80, 3], [130, -115, 4], [85, -125, 3], [45, -110, 1.5], [20, -90, 0.5]],
    sc: { from: 6, to: 8, via: [[134, -18, 2]], hw: 4.2, mult: 0.7 },
    boxes: [1.8, 6.9, 11.5], pads: [[3.3, 0], [12.6, 0]], ramps: [{ p: 10.45, len: 7 }],
    haz: [{ k: 'ball', p: 3.6 }, { k: 'ball', p: 11.9 }, { k: 'sand', p: 1.5, lat: 0.4 }, { k: 'sand', p: 7.5, lat: -0.3 }, { k: 'sand', p: 9.4, lat: 0.35 }]
  },
  {
    id: 'tea', theme: 'hill', name: 'Tea Garden Terraces', place: 'Tea estate on a misty morning', short: 'Tea estate', hw: 6.8, scale: 1.2, start: 0.45, wall: 5, off: 0.55, voidOff: false,
    look: { rain: 0, skyTop: '#6f93b8', skyMid: '#a9c2cf', skyHor: '#e4e6d8', sun: '#fff1d8', sunI: 2.0, sunEl: 0.55, fog: '#c9d3cc', fogD: 0.0075, hemiSky: '#e2ecef', exposure: 1.06, cloud: 0.6, bloom: 0.6 },
    pts: [[0, -50, 0], [0, 35, 1], [14, 68, 3], [48, 82, 5], [82, 70, 7], [95, 40, 8], [80, 12, 8], [55, 5, 9], [40, -20, 10], [55, -48, 11], [88, -55, 12], [110, -80, 12], [95, -112, 11], [55, -122, 9], [20, -108, 6], [8, -80, 3]],
    sc: { from: 10, to: 12, via: [[86, -86, 12]], hw: 3.8, mult: 0.7 },
    boxes: [1.4, 6.6, 12.8], pads: [[4.4, 0], [14.4, 0.2]], ramps: [{ p: 7.55, len: 6 }],
    haz: [{ k: 'puddle', p: 2.5, lat: 0.35 }, { k: 'puddle', p: 9.4, lat: -0.3 }, { k: 'puddle', p: 13.5, lat: 0.25 }]
  },
  {
    id: 'pass', theme: 'snow', name: 'Snowline Pass', place: 'Mountain pass under fresh snow', short: 'Mountain pass', hw: 6.8, scale: 1.2, start: 0.45, wall: 5, off: 0.5, voidOff: false,
    pts: [[10, -50, 0], [0, 30, 1], [-12, 62, 3], [-45, 75, 5], [-78, 62, 7], [-88, 30, 8], [-70, 5, 8], [-80, -25, 9], [-110, -40, 11], [-118, -75, 12], [-90, -100, 12], [-50, -95, 10], [-30, -70, 7], [0, -95, 5], [30, -84, 3]],
    sc: { from: 9, to: 11, via: [[-84, -80, 12]], hw: 3.6, mult: 0.85 },
    boxes: [1.6, 6.6, 12.4], pads: [[3.6, 0], [13.6, 0]], ramps: [{ p: 5.45, len: 6 }],
    haz: [{ k: 'ball', p: 3.4 }, { k: 'ball', p: 12.3 }, { k: 'ice', p: 1.5, lat: 0.3 }, { k: 'ice', p: 7.5, lat: -0.2 }, { k: 'ice', p: 14.0, lat: 0.25 }]
  },
  {
    id: 'kites', theme: 'roof', name: 'Kite Market', place: 'Old city rooftops on kite day', short: 'Kite day', hw: 6, scale: 1.2, start: 0.3, wall: 1.8, off: 0.6, voidOff: true,
    look: { sunEl: 0.32, skyHor: '#ffcf8a', sunI: 3.0, exposure: 1.06 },
    pts: [[0, -60, 12], [0, 20, 12], [15, 55, 12], [50, 70, 12], [88, 60, 11], [105, 30, 10], [100, -5, 10], [125, -30, 10], [160, -25, 10], [180, 5, 10], [205, 0, 10], [215, -35, 11], [195, -70, 12], [150, -85, 12], [100, -80, 12], [60, -95, 12], [25, -90, 12]],
    sc: { from: 8, to: 11, via: [[190, -22, 10.4]], hw: 2.6, mult: 0.92 },
    boxes: [1.4, 7.2, 12.6], pads: [[3.4, 0], [14.6, 0]], ramps: [{ p: 0.5, len: 6, gap: [0.56, 0.65] }, { p: 13.45, len: 6, gap: [13.53, 13.66] }],
    haz: [{ k: 'sack', p: 2.5, lat: 0.5 }, { k: 'sack', p: 6.4, lat: -0.5 }, { k: 'sack', p: 10.4, lat: 0.45 }, { k: 'heap', p: 5.6, lat: 0.3 }, { k: 'heap', p: 15.4, lat: -0.35 }]
  },
  {
    id: 'lighthouse', theme: 'beach', name: 'Lighthouse Point', place: 'Rocky headland in the afternoon', short: 'Headland', hw: 6.8, scale: 1.2, start: 0.45, wall: 5, off: 0.6, voidOff: false,
    look: { sunEl: 0.45, sunAz: 1.4, skyHor: '#ffe2b8', sunI: 2.6 },
    pts: [[0, -60, 0], [0, 25, 0], [-15, 58, 1], [-50, 70, 2], [-85, 58, 3], [-100, 25, 3], [-95, -10, 2], [-70, -25, 1], [-75, -58, 1.5], [-105, -80, 3], [-95, -115, 3], [-55, -125, 2], [-20, -110, 1], [-5, -85, 0.5]],
    sc: { from: 6, to: 8, via: [[-96, -38, 2.4]], hw: 3.8, mult: 0.74 },
    boxes: [1.6, 6.8, 12.0], pads: [[3.5, 0], [12.7, 0]], ramps: [{ p: 10.45, len: 7, gap: [10.56, 10.73] }],
    haz: [{ k: 'ball', p: 4.4 }, { k: 'ball', p: 8.4 }, { k: 'sand', p: 2.6, lat: -0.35 }, { k: 'sand', p: 7.6, lat: 0.3 }, { k: 'sand', p: 11.6, lat: -0.25 }]
  },
  {
    id: 'canyon', theme: 'desert', name: 'Camel Canyon', place: 'Red rock canyon at midday', short: 'Canyon', hw: 6.8, scale: 1.2, start: 0.45, wall: 4, off: 0.5, voidOff: false,
    look: { sunEl: 1.05, skyHor: '#f3d2a2', exposure: 1.0, fogD: 0.004 },
    pts: [[0, -50, 0], [0, 30, 2], [-15, 62, 4], [-50, 72, 6], [-82, 55, 6], [-90, 20, 5], [-70, -5, 4], [-66, -34, 5], [-110, -50, 7], [-125, -82, 8], [-100, -112, 8], [-60, -110, 6], [-35, -90, 4], [-10, -100, 3], [20, -95, 2], [25, -70, 1]],
    sc: { from: 6, to: 8, via: [[-96, -24, 5.6]], hw: 3.6, mult: 0.72 },
    boxes: [1.6, 6.8, 11.5], pads: [[3.4, 0], [14.4, 0]], ramps: [{ p: 12.42, len: 6, gap: [12.5, 12.73] }],
    haz: [{ k: 'ball', p: 2.6 }, { k: 'ball', p: 9.5 }, { k: 'ball', p: 14.6 }, { k: 'sand', p: 5.4, lat: 0.3 }, { k: 'sand', p: 10.6, lat: -0.3 }]
  },
  {
    id: 'glacier', theme: 'snow', name: 'Glacier Gully', place: 'Frozen river valley at dawn', short: 'Glacier', hw: 7, scale: 1.2, start: 0.45, wall: 5, off: 0.5, voidOff: false,
    look: { sunEl: 0.18, sunAz: 2.2, skyHor: '#ffc8a8', skyMid: '#a8b8e0', sun: '#ffd2b0', sunI: 2.6 },
    pts: [[0, -60, 0], [0, 25, 0], [18, 58, 1], [55, 70, 2], [85, 52, 3], [90, 18, 3], [70, -5, 2.5], [78, -38, 3], [108, -55, 5], [140, -45, 6], [160, -15, 7], [185, -25, 7], [190, -65, 6], [165, -100, 5], [120, -115, 4], [70, -110, 2], [30, -95, 1]],
    sc: { from: 8, to: 12, via: [[148, -70, 5.6]], hw: 4, mult: 0.82 },
    boxes: [1.8, 7.3, 13.4], pads: [[2.6, 0], [15.4, 0]], ramps: [{ p: 4.45, len: 7, gap: [4.55, 4.75] }],
    haz: [{ k: 'ball', p: 6.5 }, { k: 'ball', p: 14.4 }, { k: 'ice', p: 1.4, lat: -0.3 }, { k: 'ice', p: 10.6, lat: 0.3 }, { k: 'ice', p: 15.6, lat: -0.2 }]
  },
  {
    id: 'finale', theme: 'fair', name: 'Festival Finale', place: 'The last night of the mela', short: 'Festival', hw: 7, scale: 1.2, start: 0.4, wall: 6, off: 0.55, voidOff: false,
    look: { skyHor: '#8a3a5e', bloom: 1.3 },
    pts: [[0, -70, 0], [0, 30, 0], [-12, 65, 0], [-45, 82, 0.5], [-85, 78, 1], [-108, 50, 1], [-100, 15, 0.5], [-75, 0, 0], [-70, -30, 0], [-95, -55, 0.8], [-90, -90, 1.2], [-55, -110, 1.4], [-10, -112, 0.8]],
    sc: { from: 6, to: 9, via: [[-104, -22, 0.6]], hw: 4.2, mult: 0.68 },
    boxes: [2.1, 7.4, 11.4], pads: [[3.6, 0], [12.6, 0], [6.3, 0, 1]], ramps: [{ p: 0.55, len: 7, gap: [0.61, 0.68] }],
    haz: [{ k: 'ball', p: 4.4 }, { k: 'ball', p: 10.6 }, { k: 'ball', p: 8.0 }]
  },
  {
    id: 'harbour', theme: 'beach', name: 'Sunset Harbour', place: 'Fishing docks at sunset', short: 'Harbour', hw: 6.8, scale: 1.2, start: 0.4, wall: 4, off: 0.6, voidOff: true,
    look: { sunEl: 0.12, sunAz: 2.6, skyTop: '#2a3b84', skyMid: '#d07070', skyHor: '#ffa860', sun: '#ffa870', sunI: 3.2, exposure: 1.0, fog: '#e0a080' },
    pts: [[0, -70, 0], [0, 20, 0], [12, 55, 0], [45, 72, 0], [85, 68, 0], [110, 42, 0], [112, 5, 0], [90, -18, 0], [95, -50, 0], [125, -68, 0], [160, -60, 0], [180, -30, 0], [205, -40, 0], [210, -80, 0], [185, -112, 0], [135, -125, 0], [80, -118, 0], [40, -105, 0], [15, -90, 0]],
    sc: { from: 10, to: 13, via: [[190, -66, 0]], hw: 2.8, mult: 0.92 },
    boxes: [1.8, 7.4, 14.6], pads: [[4.5, 0], [16.4, 0]], ramps: [{ p: 8.5, len: 7, gap: [8.58, 8.78] }],
    haz: [{ k: 'ball', p: 3.4 }, { k: 'ball', p: 15.5 }, { k: 'puddle', p: 6.5, lat: 0.3 }, { k: 'puddle', p: 12.5, lat: -0.3 }]
  },
  {
    id: 'mirage', theme: 'desert', name: 'Mirage Palace', place: 'Palace gardens in the heat haze', short: 'Palace', hw: 7.5, scale: 1.2, start: 0.3, wall: 6, off: 0.5, voidOff: false,
    look: { sunEl: 0.7, skyHor: '#ffe8c0', exposure: 1.04, fogD: 0.0055 },
    pts: [[0, -80, 0], [0, 30, 0], [20, 70, 1], [65, 90, 2], [110, 80, 2], [130, 45, 1.5], [120, 10, 1], [90, -5, 1], [85, -40, 1], [110, -65, 2], [150, -60, 3], [172, -28, 3], [192, 12, 3], [222, 0, 3], [228, -55, 3], [200, -100, 2.5], [150, -120, 2], [90, -125, 1.5], [40, -115, 1], [10, -100, 0.5]],
    sc: { from: 11, to: 14, via: [[202, -38, 3]], hw: 4.2, mult: 0.72 },
    boxes: [1.7, 7.5, 14.5], pads: [[4.5, 0], [16.5, 0], [10.5, 0]], ramps: [{ p: 0.6, len: 7, gap: [0.66, 0.72] }, { p: 17.45, len: 6 }],
    haz: [{ k: 'ball', p: 3.5 }, { k: 'ball', p: 12.6 }, { k: 'sand', p: 6.5, lat: 0.35 }, { k: 'sand', p: 9.5, lat: -0.35 }, { k: 'puddle', p: 15.5, lat: 0.2 }]
  },
  {
    id: 'summit', theme: 'snow', name: 'Cloudtop Summit', place: 'Above the clouds at midday', short: 'Summit', hw: 6.8, scale: 1.2, start: 0.4, wall: 5, off: 0.5, voidOff: false,
    look: { skyTop: '#2a5aa8', skyMid: '#7ea8e0', skyHor: '#e0eaf4', sunEl: 0.9, sunI: 2.6, fogD: 0.0055, exposure: 1.02 },
    pts: [[2, -66, 0], [0, 20, 2], [-10, 55, 4], [-40, 75, 6], [-80, 70, 8], [-105, 40, 10], [-100, 5, 11], [-75, -15, 12], [-80, -50, 13], [-110, -70, 14], [-120, -105, 15], [-90, -135, 15], [-45, -140, 13], [-15, -120, 10], [12, -142, 8], [45, -122, 6], [50, -95, 4], [32, -82, 2]],
    sc: { from: 13, to: 15, via: [[14, -118, 8.6]], hw: 3.6, mult: 0.8 },
    boxes: [1.6, 7.4, 12.6], pads: [[3.5, 0], [10.5, 0], [16.4, 0]], ramps: [{ p: 6.45, len: 6, gap: [6.55, 6.74] }],
    haz: [{ k: 'ball', p: 4.4 }, { k: 'ball', p: 11.5 }, { k: 'ice', p: 2.5, lat: 0.3 }, { k: 'ice', p: 8.6, lat: -0.25 }, { k: 'ice', p: 14.4, lat: 0.3 }]
  }
];

export const TRACK_IDX = {}; TRACKS.forEach((t, i) => { TRACK_IDX[t.id] = i; });
export const CUP_OF = {}; CUPS.forEach((c) => c.tracks.forEach((t, i) => { CUP_OF[t] = { cup: c.id, i }; }));

/* ------------------------------------------------------------ battle arenas */
// A ring road so wide it is a floor: the kart model and walls work unchanged. The ring's
// hole is the centre piece (a fountain, a well, a frozen pond) that blocks the middle.
function ring(R, n) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push([Math.sin(a) * R, Math.cos(a) * R, 0]); } return o; }
export const ARENAS = [
  { id: 'plaza', theme: 'fair', arena: true, name: 'Fountain Plaza', place: 'The fairground square at night', hw: 24, scale: 1, start: 0, wall: 1.2, off: 0.6, voidOff: false, pts: ring(36, 16), haz: [{ k: 'ball', p: 4, lat: 0 }, { k: 'ball', p: 12, lat: 0 }], blurb: 'A lit-up square round the big fountain. Rolling beach balls keep everyone moving.' },
  { id: 'oasis', theme: 'desert', arena: true, name: 'Oasis Ring', place: 'Palm well in the dunes', hw: 22, scale: 1, start: 0, wall: 1.2, off: 0.5, voidOff: false, pts: ring(34, 16), haz: [{ k: 'sand', p: 2, lat: 0.4 }, { k: 'sand', p: 6, lat: -0.4 }, { k: 'sand', p: 10, lat: 0.3 }, { k: 'sand', p: 14, lat: -0.3 }, { k: 'ball', p: 8, lat: 0 }], blurb: 'Round and round the palm well. Soft sand slows the careless.' },
  { id: 'rink', theme: 'snow', arena: true, name: 'Snowglobe Rink', place: 'Frozen lake in the hills', hw: 25, scale: 1, start: 0, wall: 1.2, off: 0.5, voidOff: false, pts: ring(38, 16), haz: [{ k: 'ice', p: 1, lat: 0.3 }, { k: 'ice', p: 5, lat: -0.3 }, { k: 'ice', p: 9, lat: 0.4 }, { k: 'ice', p: 13, lat: -0.4 }, { k: 'ball', p: 3, lat: 0 }, { k: 'ball', p: 11, lat: 0 }], blurb: 'A frozen lake with slick ice and rolling snowballs.' }
];
export const ARENA_IDX = {}; ARENAS.forEach((t, i) => { ARENA_IDX[t.id] = i; });
export const BATTLE_RULES = {
  balloon: { name: 'Balloon Battle', time: 150, note: 'Everyone carries three balloons. Pop a rival\'s balloon with an item or a sparkler bump for a point. Lose all three and you lose a point, then start again with three. Most points when the clock runs out wins.' },
  coins: { name: 'Token Chase', time: 120, note: 'Grab the gold tokens scattered round the arena. A hit spills half of yours for anyone to take. Most tokens when the clock runs out wins.' }
};

/* ------------------------------------------------------------ items */
export const ITEMS = {
  peel: { name: 'Mango Peel', note: 'Drop it behind you. Anyone who drives over it spins out.' },
  peel3: { name: 'Three Peels', base: 'peel', n: 3, note: 'Three peels to drop one at a time.' },
  rocket: { name: 'Paper Rocket', note: 'Flies along the road and homes in on the kart ahead of you.' },
  rocket3: { name: 'Rocket Trio', base: 'rocket', n: 3, note: 'Three paper rockets.' },
  shield: { name: 'Marigold Shield', note: 'A ring of marigolds that blocks one hit, for ten seconds.' },
  chai: { name: 'Speed Chai', note: 'A hot boost of speed.' },
  chai3: { name: 'Triple Chai', base: 'chai', n: 3, note: 'Three boosts in a row.' },
  token: { name: 'Token Pouch', note: 'Three gold tokens. Each token you hold adds a little top speed, up to ten.' },
  cut: { name: 'Power Cut', note: 'The lights go out and every rival shrinks for a few seconds.' },
  seeker: { name: 'Kite Seeker', note: 'A fighting kite that flies over the field and dives on the leader.' },
  sparkler: { name: 'Diwali Sparkler', note: 'For a few seconds nothing can hurt you, you go faster and you spin out anyone you touch.' },
  rickshaw: { name: 'Rocket Rickshaw', note: 'Hail a rocket rickshaw that drives you up the field at full speed. Only for racers far behind.' }
};
export const ITEM_IDS = Object.keys(ITEMS);
// Weights at the front, the middle and the back of the field: the further back you are,
// the stronger what you get. That is the catch-up.
const ITEM_W = {
  peel: [0.30, 0.10, 0], peel3: [0.06, 0.12, 0.04], token: [0.20, 0.06, 0], shield: [0.20, 0.12, 0.04],
  rocket: [0.10, 0.24, 0.10], rocket3: [0, 0.08, 0.14], chai: [0.12, 0.18, 0.10], chai3: [0, 0.06, 0.18],
  seeker: [0, 0.03, 0.08], cut: [0, 0.02, 0.07], sparkler: [0, 0.02, 0.12], rickshaw: [0, 0, 0.14]
};
const BATTLE_W = { peel: 0.18, peel3: 0.1, rocket: 0.2, rocket3: 0.1, shield: 0.16, chai: 0.12, sparkler: 0.06, token: 0.08 };
const BASIC = { peel: 1, rocket: 1, shield: 1, chai: 1 };
// rank: 0 for the leader to 1 for last. gap: metres behind the leader. rand: a 0..1 number.
export function rollItem(rank, gap, opts, rand) {
  opts = opts || {};
  if (opts.battle) return pickW(BATTLE_W, rand);
  let r = rank + (opts.items === 'frantic' ? 0.35 : 0) + Math.min(0.25, Math.max(0, (gap || 0) - 120) / 600);
  r = r < 0 ? 0 : r > 1 ? 1 : r;
  const w = {};
  ITEM_IDS.forEach((k) => {
    const t = ITEM_W[k]; let v = r < 0.5 ? t[0] + (t[1] - t[0]) * (r / 0.5) : t[1] + (t[2] - t[1]) * ((r - 0.5) / 0.5);
    if (opts.items === 'basic' && !BASIC[k]) v = 0;
    if (k === 'rickshaw' && r < 0.7) v = 0;
    if ((k === 'seeker' || k === 'cut') && (opts.seekerOut || rank < 0.2)) v = 0;
    if (k === 'seeker' && opts.seekerOut) v = 0;
    w[k] = v;
  });
  if (opts.items === 'basic') { w.peel = Math.max(w.peel, 0.1); w.rocket = Math.max(w.rocket, 0.1); }
  return pickW(w, rand);
}
function pickW(w, rand) {
  let tot = 0; Object.keys(w).forEach((k) => { tot += w[k]; });
  let x = (rand == null ? Math.random() : rand) * tot;
  const ks = Object.keys(w);
  for (let i = 0; i < ks.length; i++) { x -= w[ks[i]]; if (x <= 0) return ks[i]; }
  return 'peel';
}

/* ------------------------------------------------------------ the commentary booth */
// Two voices on Mela TV. {a} is who did it, {b} who it was done to, {t} the place.
export const LINES = {
  start: ['Lights out and away they go at {t}!', 'And they are racing at {t}!', 'Here we go! Twelve karts, three laps, one {t}.'],
  rocketStart: ['{a} nails the rocket start!', 'What a getaway from {a}!'],
  stall: ['{a} jumped the gun and spins the wheels.'],
  lead: ['{a} takes the lead!', '{a} hits the front!', 'New leader: {a}!', 'And now it is {a} out in front!'],
  rocket: ['{a} lands a paper rocket on {b}!', 'Direct hit! {b} goes flying.', '{b} never saw that rocket coming.'],
  peel: ['{b} slips on a mango peel!', 'Oh, a peel! {b} spins out.', 'That peel from {a} catches {b}.'],
  cut: ['Lights out! {a} pulls the plug on everyone!', 'Power cut! Everybody shrinks except {a}.'],
  seeker: ['A kite seeker is out hunting {b}!', 'Look up! {a} sends a kite after {b}.'],
  seekerHit: ['The kite dives and {b} is caught!', 'Kite strike on {b} at the front!'],
  sparkler: ['{a} lights a Diwali sparkler!', 'Nobody can touch {a} right now!'],
  rickshaw: ['{a} hails a rocket rickshaw!', '{a} is riding the rickshaw up the field!'],
  ultra: ['Ultra turbo for {a}!', 'Look at the sparks off {a}!'],
  shortcut: ['{a} dives into the shortcut!', '{a} gambles on the short way round.'],
  slip: ['{a} tucks into the slipstream of {b}.', '{a} slingshots past {b}!'],
  comeback: ['{a} is climbing through the field!', 'Watch {a}, moving up fast.'],
  finalLap: ['Final lap! {a} leads.', 'One lap to go and {a} is out in front.', 'Last lap, and it is tight at the top!'],
  finish: ['{a} takes the chequered flag!', 'Victory for {a}!', '{a} wins it at {t}!'],
  photo: ['Too close to call! Over to the photo.'],
  bump: ['{a} leans on {b}. No room given.', 'Elbows out from {a}!'],
  pop: ['{a} pops a balloon off {b}!', 'Pop! {a} gets {b}.'],
  out: ['{b} is out of balloons and starts again.'],
  coinSpill: ['{b} spills tokens everywhere!'],
  battleStart: ['Into the arena! Balloons up!', 'Battle time at {t}!'],
  battleEnd: ['Time! Let us count them up.']
};
export function line(kind, a, b, t, rand) {
  const L = LINES[kind]; if (!L) return '';
  const s = L[Math.floor((rand == null ? Math.random() : rand) * L.length) % L.length];
  return s.replace('{a}', a || '').replace('{b}', b || '').replace('{t}', t || '');
}

/* ------------------------------------------------------------ driving school */
export const LESSONS = [
  { id: 'drive', title: 'Drive', goal: 'Drive 250 metres', key: 'Hold Up or W to go and Left or Right to steer.', touch: 'The throttle is always on. Drag left and right to steer.', pad: 'Hold RT to go. Steer with the left stick.' },
  { id: 'drift', title: 'Drift', goal: 'Hold a drift for two seconds', key: 'Hold Space or Shift as you turn: you hop and slide into a drift. Keep it held through the bend.', touch: 'Touch and hold still, or put a second finger down, while you steer: you hop into a drift.', pad: 'Hold B or a bumper while you turn to drift.' },
  { id: 'turbo', title: 'Mini-turbo', goal: 'Release a drift for a turbo', key: 'Keep drifting until the sparks turn blue, then let go of Space for a mini-turbo.', touch: 'Keep the drift until the sparks turn blue, then lift your finger for a mini-turbo.', pad: 'Drift until the sparks turn blue, then let go for a mini-turbo.' },
  { id: 'super', title: 'Super turbo', goal: 'Release an orange or pink turbo', key: 'Hold the drift longer: blue, then orange, then pink. Steering into the bend charges faster.', touch: 'Hold the drift longer: blue, then orange, then pink.', pad: 'Hold the drift longer: blue, then orange, then pink.' },
  { id: 'item', title: 'Items', goal: 'Grab a box and use the item', key: 'Drive through a glowing box, then press X or E to use what you get.', touch: 'Drive through a glowing box, then tap the screen to use your item.', pad: 'Drive through a box, then press A or X.' },
  { id: 'slip', title: 'Slipstream', goal: 'Catch a slipstream boost', key: 'Tuck in right behind the pace kart. When the wind lines close in, you get a free boost.', touch: 'Tuck in right behind the pace kart until the wind lines close in.', pad: 'Tuck in right behind the pace kart until the wind lines close in.' },
  { id: 'trick', title: 'Ramp trick', goal: 'Land a trick off the ramp', key: 'Press Space just as you leave the ramp to do a trick, and land it for a boost.', touch: 'Tap and hold as you leave the ramp for a trick.', pad: 'Press B just as you leave the ramp.' },
  { id: 'start', title: 'Rocket start', goal: 'Rocket start from the grid', key: 'On the grid, hold Up as the last red light comes on. Too early and the wheels spin.', touch: 'On the grid, put your finger down as the last red light comes on.', pad: 'Hold RT as the last red light comes on.' }
];

/* ------------------------------------------------------------ the career */
export const CAREER_KEY = 'kart-mela.career';
export function blankCareer() {
  return { v: 1, tokens: 0, trophies: {}, gp: 0, wins: 0, podiums: 0, races: 0, battles: 0, battleWins: 0, vs: 0, turbos: 0, hits: 0, items: 0, dist: 0, tut: {}, grad: false, seen: [] };
}
export function loadCareer(store) {
  const d = store.get(CAREER_KEY, null);
  const c = blankCareer();
  if (d && typeof d === 'object') Object.keys(c).forEach((k) => { if (d[k] != null && typeof d[k] === typeof c[k]) c[k] = d[k]; });
  if (!c.trophies || typeof c.trophies !== 'object') c.trophies = {};
  if (!c.tut || typeof c.tut !== 'object') c.tut = {};
  if (!Array.isArray(c.seen)) c.seen = [];
  return c;
}
// best place in a cup at any class (1 gold, 2 silver, 3 bronze), or 0
export function cupBest(C, cupId, cls) {
  const t = C.trophies[cupId]; if (!t) return 0;
  if (cls) return t[cls] | 0;
  let b = 0; Object.keys(t).forEach((k) => { const v = t[k] | 0; if (v && (!b || v < b)) b = v; });
  return b;
}
export function cupOpen(C, cupId) {
  const cup = CUPS[CUP_IDX[cupId]]; if (!cup || !cup.unlock) return true;
  const u = cup.unlock, n = u.count || 1;
  return u.any.filter((id) => cupBest(C, id) > 0).length >= n;
}
export function classOpen(C, cls) {
  if (cls !== 'mirror') return true;
  return CUPS.some((cup) => cupBest(C, cup.id, 'hard') === 1);
}
export function charOpen(C, ch) { return !ch.unlock || cupBest(C, ch.unlock.cup) === 1; }
export function partOpen(C, p) { return C.tokens >= (p.tokens || 0); }
export function unlockText(ch) {
  if (!ch.unlock) return '';
  const cup = CUPS[CUP_IDX[ch.unlock.cup]];
  return 'Win the ' + (cup ? cup.name : 'cup') + ' to unlock';
}
// Everything that is open now, by id, so the game can say what is new after a race.
export function openList(C) {
  const out = [];
  CHARS.forEach((c) => { if (c.unlock && charOpen(C, c)) out.push('char:' + c.id); });
  BODIES.forEach((b) => { if (b.tokens && partOpen(C, b)) out.push('body:' + b.id); });
  WHEELS.forEach((w) => { if (w.tokens && partOpen(C, w)) out.push('wheel:' + w.id); });
  CUPS.forEach((c) => { if (c.unlock && cupOpen(C, c.id)) out.push('cup:' + c.id); });
  if (classOpen(C, 'mirror')) out.push('class:mirror');
  return out;
}
export function nameOf(key) {
  const [k, id] = key.split(':');
  if (k === 'char') return (CHARS[CHAR_IDX[id]] || {}).name + ' joins the roster';
  if (k === 'body') return 'New kart body: ' + (BODIES[BODY_IDX[id]] || {}).name;
  if (k === 'wheel') return 'New wheels: ' + (WHEELS[WHEEL_IDX[id]] || {}).name;
  if (k === 'cup') return (CUPS[CUP_IDX[id]] || {}).name + ' is open';
  if (k === 'class') return 'Mirror class is open';
  return key;
}
