import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost } from '/games/shared/fx3d.js';
import { createHuman, createCrowd } from '/games/shared/human.js';
import { createVFX } from '/games/shared/vfx.js';

/*
 * Ghat Riders, a 3D motorbike road race with fists, feet and a patrol to dodge.
 *
 * A career up a ladder of five levels of mountain and coastal ghat routes, prize money, a garage of six
 * bikes with upgrades, a roster of rivals with fighting styles and grudges that carry from race to race,
 * a patrol that chases riders who fight near it, old bridge shortcuts, rain, fog and night, and the
 * broadcast around it all: a flyover intro, commentary, replays of knockdowns and a podium.
 *
 * Point-to-point runs down winding mountain highways: a cliff wall on one side,
 * the valley drop and its painted guard stones on the other, hairpins, chai
 * stalls, waterfalls, tunnels, villages, trucks, buses and the odd cow.
 *
 * The rules run on a flat model: every rider has a distance along the course
 * (s, metres) and a lateral position from the centre line (x, metres). The 3D
 * world is placed from those two numbers. Fighting is punches and kicks between
 * riders alongside; a rider knocked off tumbles harmlessly, gets up, runs back
 * to the bike and rides on.
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
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
function fmtTime(s) {
  if (s == null || !isFinite(s)) return '-:--.--';
  const cs = Math.max(0, Math.round(s * 100));
  return Math.floor(cs / 6000) + ':' + pad2(Math.floor((cs % 6000) / 100)) + '.' + pad2(cs % 100);
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
const money = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

/* ------------------------------------------------------------ constants */
const SEGM = 4;          // metres per course row
const HALF = 5.5;        // half width of the tarmac
const XW = 6.75;         // where the barrier (guard stones, rock wall, hedge) begins
const SHOULDER = 7.2;
const KMH = 3.6;
const START_S = 72;      // start line
const RUNOUT = 260;      // straight past the finish line
const CENT = 0.21;       // how hard a bend throws a bike to the outside
const N_RIVALS = 7;

// The garage. Six original machines in three families (the family sets the frame, the riding position and
// the silhouette): light roadsters, heavy cruisers and faired sport bikes. Weight is the shoulder in a
// fight: a heavy bike shrugs off a kick and hits harder, a light one turns and accelerates sooner.
const BIKES = {
  scout: { id: 'scout', fam: 'scout', name: 'Scout', price: 0, spd: 0.80, hdl: 0.88, wgt: 0.38, paint: '#e8452c', trim: '#f5efe3', blurb: 'A light roadster that turns on a coin. Easy to ride, easy to knock about.' },
  thunder: { id: 'thunder', fam: 'thunder', name: 'Thunder', price: 2500, spd: 0.88, hdl: 0.70, wgt: 0.9, paint: '#1f5fbf', trim: '#d9a441', blurb: 'A heavy cruiser. Wide bars, big tank, and a shoulder like a wall.' },
  kestrel: { id: 'kestrel', fam: 'scout', name: 'Kestrel', price: 3800, spd: 0.85, hdl: 0.98, wgt: 0.34, paint: '#2f9a6a', trim: '#f2c230', dirt: true, blurb: 'A tall scrambler on knobbly tyres. Loses little on gravel, dirt and the old bridge shortcuts.' },
  phantom: { id: 'phantom', fam: 'phantom', name: 'Phantom', price: 6000, spd: 1.00, hdl: 0.93, wgt: 0.62, paint: '#15161b', trim: '#ffb736', blurb: 'A faired sport bike. Quick everywhere, and steady in a scrap.' },
  bison: { id: 'bison', fam: 'thunder', name: 'Bison', price: 9000, spd: 0.94, hdl: 0.68, wgt: 1.0, paint: '#6b3a24', trim: '#e9e2d0', blurb: 'A touring heavyweight. Nothing on the mountain moves it, and its kicks land like a door.' },
  vayu: { id: 'vayu', fam: 'phantom', name: 'Vayu', price: 15000, spd: 1.08, hdl: 0.97, wgt: 0.66, paint: '#e6e9ee', trim: '#ff6940', blurb: 'The top of the shop: a hand built racer, the fastest thing between the hills and the sea.' }
};
const BIKE_ORDER = ['scout', 'thunder', 'kestrel', 'phantom', 'bison', 'vayu'];
Object.keys(BIKES).forEach((k) => { BIKES[k].str = 0.3 + 0.7 * BIKES[k].wgt; });
const bikeTop = (b) => 38 + 16 * b.spd;          // m/s
const bikeAcc = (b) => 6.4 + 5 * b.spd - 0.6 * b.wgt;
const bikeSteer = (b) => 5.6 + 4.2 * b.hdl;       // lateral m/s at full lock
const bikeGrip = (b) => 1.18 - 0.32 * b.hdl;      // multiplies the bend push

// Upgrades from the shop, bought per bike: engine (top speed and pull), tyres (grip and steering),
// armour (the bike takes less damage and the rider is harder to knock off) and a bigger nitro bottle.
const UPGRADES = [
  { id: 'eng', name: 'Engine', max: 3, cost: [1200, 2600, 4800], note: 'Top speed and pull' },
  { id: 'tyre', name: 'Tyres', max: 3, cost: [800, 1800, 3400], note: 'Grip in bends, sharper steering, steadier on oil' },
  { id: 'arm', name: 'Armour', max: 3, cost: [900, 2000, 3800], note: 'Less bike damage, harder to knock off' },
  { id: 'nos', name: 'Nitro bottle', max: 2, cost: [1500, 3500], note: 'A bigger tank that fills faster' }
];

// Fighting styles. atk: how often they start a scrap; kick: share of kicks; block: how well they read
// an incoming blow; counter: how readily they hit straight back; ram: rides into you to set up a hit.
const STYLES = {
  brawler: { name: 'Brawler', atk: 1.0, kick: 0.25, block: 0.35, counter: 0.35, ram: 0.4, note: 'Throws punches all day' },
  kicker: { name: 'Kicker', atk: 0.8, kick: 0.65, block: 0.4, counter: 0.4, ram: 0.2, note: 'Long, heavy kicks' },
  blocker: { name: 'Counter puncher', atk: 0.5, kick: 0.25, block: 0.85, counter: 0.9, ram: 0.1, note: 'Guards, waits, punishes' },
  dirty: { name: 'Road hog', atk: 0.9, kick: 0.45, block: 0.25, counter: 0.25, ram: 1.0, note: 'Rides into you, fights near the patrol' },
  clean: { name: 'Racer', atk: 0.3, kick: 0.15, block: 0.65, counter: 0.55, ram: 0, note: 'Rides fast and fights only when hit' }
};

// The rival roster. Each has a bike, a style, a home level (they turn up from that level of the career),
// and a grudge with you that lives in the save and grows every time one of you drops the other.
const RIVALS = [
  { name: 'Rocky Bhau', kind: 'thunder', style: 'brawler', paint: '#c2272d', jacket: '#2b2f3a', helmet: '#f2c230', aggr: 1.0, pace: 0.99, tier: 1, line: 'Owns the Misty Pass and says so.' },
  { name: 'Zoya Wheels', kind: 'phantom', style: 'clean', paint: '#7b3fe4', jacket: '#f4f1ea', helmet: '#7b3fe4', aggr: 0.55, pace: 1.0, tier: 1, line: 'Quickest line on any hairpin.' },
  { name: 'Captain Kesar', kind: 'thunder', style: 'blocker', paint: '#e8892c', jacket: '#3d5a3a', helmet: '#e8892c', aggr: 0.8, pace: 0.97, tier: 1, line: 'Patient. Never throws the first punch.' },
  { name: 'Bunty Turbo', kind: 'scout', style: 'dirty', paint: '#19a3a0', jacket: '#ffd23f', helmet: '#19a3a0', aggr: 0.9, pace: 0.96, tier: 1, line: 'Rides into you and grins about it.' },
  { name: 'Meera Mach', kind: 'phantom', style: 'kicker', paint: '#e94f8a', jacket: '#1d2440', helmet: '#ffffff', aggr: 0.75, pace: 1.01, tier: 1, line: 'Kicks like a mule, rides like the wind.' },
  { name: 'Tenzin Gale', kind: 'kestrel', style: 'clean', paint: '#3a8f3a', jacket: '#b3242a', helmet: '#3a8f3a', aggr: 0.6, pace: 0.98, tier: 1, line: 'Knows every shortcut on the hill.' },
  { name: 'Lalit Lightning', kind: 'thunder', style: 'brawler', paint: '#f2d24b', jacket: '#4a2f22', helmet: '#222222', aggr: 0.75, pace: 0.95, tier: 1, line: 'Loud, slow off the line, loves a scrap.' },
  { name: 'Gudiya Gears', kind: 'kestrel', style: 'kicker', paint: '#ff8fb1', jacket: '#2a2440', helmet: '#ff8fb1', aggr: 0.8, pace: 1.0, tier: 2, line: 'Small bike, big kicks, bigger laugh.' },
  { name: 'Sultan Speedy', kind: 'bison', style: 'blocker', paint: '#4b3a8f', jacket: '#d8c9a0', helmet: '#4b3a8f', aggr: 0.85, pace: 1.0, tier: 3, line: 'The wall on wheels. Hit him and he hits back.' },
  { name: 'Rani Rocket', kind: 'vayu', style: 'clean', paint: '#e6e9ee', jacket: '#c2272d', helmet: '#c2272d', aggr: 0.6, pace: 1.03, tier: 4, line: 'Reigning queen of the ghats.' }
];
const FEMALE = /Zoya|Meera|Gudiya|Rani/;
const PLAYER_LOOK = { jacket: '#e7672e', helmet: '#f5efe3' };

const DIFF = {
  easy: { name: 'Easy', pace: 0.86, aggr: 0.35, band: 0.08, shoveRes: -0.12, dealt: 1.3, taken: 0.65, block: 0.55 },
  normal: { name: 'Normal', pace: 0.94, aggr: 0.7, band: 0.05, shoveRes: 0, dealt: 1.0, taken: 1.0, block: 0.85 },
  hard: { name: 'Hard', pace: 1.0, aggr: 1.0, band: 0.03, shoveRes: 0.1, dealt: 0.9, taken: 1.18, block: 1.1 }
};

// The career ladder. Each level is a set of routes; finish in the top three on every one of them to
// qualify for the next level. Prize money, rival pace and the patrol all go up as you climb.
const LEVELS = [
  { n: 1, name: 'Village Rookie', routes: ['misty', 'tea', 'cliff'], pace: 0.95, prize: 1, patrols: 0, bonus: 2000 },
  { n: 2, name: 'District Club', routes: ['tea', 'coast', 'monsoon'], pace: 0.98, prize: 1.6, patrols: 0, bonus: 4000 },
  { n: 3, name: 'State Circuit', routes: ['coast', 'monsoon', 'night', 'misty'], pace: 1.0, prize: 2.4, patrols: 1, bonus: 7000 },
  { n: 4, name: 'Ghat Kings', routes: ['night', 'cliff', 'monsoon', 'tea'], pace: 1.02, prize: 3.4, patrols: 1, bonus: 11000 },
  { n: 5, name: 'The Crown Run', routes: ['misty', 'coast', 'night', 'monsoon', 'cliff'], pace: 1.04, prize: 5, patrols: 2, bonus: 20000 }
];

// [length m, total turn in degrees (+ right), climb m, options]
// c: which side the rock wall is on (+1 right, -1 left, 0 open banks). The valley drop is the other side.
const COURSES = [
  {
    id: 'misty', name: 'Misty Pass', when: 'Dawn mist', patrol: false, prize: 1, wx: 'clear', dens: [4, 2], oil: 5, grav: 10, cows: 5, goats: 2,
    blurb: 'A climb through dawn mist: waterfalls, prayer flags and two tight hairpins.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [220, 30, 8, { c: 1, flags: 1 }], [200, -55, 10, { c: -1, chai: 1 }], [240, 0, 14, { c: 1, falls: 1 }],
      [110, 150, 12, { c: 1, sc: 1 }], [200, 0, 12, { c: -1, temple: 1 }], [110, -150, 12, { c: -1 }], [260, 20, 16, { c: 1, falls: 1, flags: 1 }],
      [300, 0, 6, { tun: 1 }], [200, -70, 10, { c: -1, flags: 1 }], [220, 60, 8, { c: 1, chai: 1 }], [240, 0, 4, { c: 0, village: 1 }],
      [120, -130, 12, { c: -1 }], [240, 40, 12, { c: 1, falls: 1 }], [120, 135, 10, { c: 1 }], [260, -40, 8, { c: -1, temple: 1, flags: 1 }],
      [220, -60, 10, { c: -1, chai: 1 }], [200, 70, 6, { c: 1 }], [300, 0, 2, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  },
  {
    id: 'tea', name: 'Tea Estate Climb', when: 'Golden afternoon', patrol: true, prize: 1.5, wx: 'clear', dens: [5, 3], oil: 6, grav: 7, cows: 6, goats: 2,
    blurb: 'Rolling tea gardens in golden light. Patrol riders work this road.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [260, -25, 10, { c: 0, tea: 1 }], [220, 45, 14, { c: 1, tea: 1 }], [260, 0, 18, { c: 0, tea: 1, chai: 1 }],
      [120, -140, 14, { c: -1, sc: 1 }], [240, 20, 16, { c: 0, tea: 1, temple: 1 }], [120, 145, 14, { c: 1 }], [280, -30, 14, { c: -1, falls: 1 }],
      [260, 0, 6, { c: 0, village: 1 }], [220, 70, 12, { c: 1, tea: 1 }], [200, -80, 12, { c: -1, chai: 1 }], [260, 0, 10, { c: 0, tea: 1 }],
      [130, 150, 12, { c: 1 }], [240, -30, 10, { c: 0, tea: 1, flags: 1 }], [130, -150, 10, { c: -1 }], [300, 40, 10, { c: 0, tea: 1 }],
      [220, 0, 4, { tun: 1 }], [240, -45, 6, { c: -1, temple: 1 }], [300, 0, 2, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  },
  {
    id: 'coast', name: 'Coastal Ghat', when: 'Dusk', patrol: true, prize: 2, wx: 'clear', dens: [6, 3], oil: 9, grav: 6, cows: 6, goats: 2,
    blurb: 'Down to the sea at dusk. Palms, tunnels, headlights and heavy traffic.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [240, 40, -6, { c: 1, palm: 1 }], [220, -60, -8, { c: -1, chai: 1 }], [300, 0, -4, { c: 1, falls: 1 }],
      [120, -130, -10, { c: -1, sc: 1 }], [220, 0, -8, { tun: 1 }], [300, 30, 0, { c: 1, palm: 1, temple: 1 }], [200, 60, -6, { c: 1 }],
      [120, 130, -8, { c: 1 }], [260, -30, -6, { c: 0, village: 1 }], [220, -50, -6, { c: -1, palm: 1 }], [300, 0, 0, { tun: 1 }],
      [200, 60, -4, { c: 1, chai: 1 }], [120, -140, -6, { c: -1 }], [260, 30, -4, { c: 1, falls: 1 }], [240, 40, -4, { c: 1, palm: 1, temple: 1 }],
      [300, 0, 0, { c: 0, village: 1 }], [220, -40, -2, { c: -1, palm: 1 }], [300, 0, 0, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  },
  {
    id: 'monsoon', name: 'Monsoon Falls', when: 'Monsoon rain', patrol: true, prize: 2.2, wx: 'rain', dens: [5, 3], oil: 7, grav: 8, cows: 4, goats: 2,
    blurb: 'Rain hammers a green gorge full of waterfalls. Slick tarmac, two old bridge shortcuts.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [240, -35, 10, { c: -1, falls: 1 }], [220, 50, 12, { c: 1, falls: 1, flags: 1 }], [120, -150, 12, { c: -1, sc: 1 }], [260, 0, 14, { c: 1, falls: 1 }],
      [200, 60, 10, { c: 1, chai: 1 }], [220, -40, 12, { c: -1, temple: 1 }], [280, 0, 8, { tun: 1 }], [120, 140, 12, { c: 1 }], [240, -30, 10, { c: -1, falls: 1, flags: 1 }],
      [260, 0, 6, { c: 0, village: 1 }], [200, 70, 10, { c: 1, falls: 1 }], [120, -145, 10, { c: -1, sc: 1 }], [240, 30, 8, { c: 1, chai: 1 }], [220, -60, 8, { c: -1, falls: 1 }],
      [260, 40, 6, { c: 1, temple: 1 }], [300, 0, 2, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  },
  {
    id: 'night', name: 'Moonlit Hairpins', when: 'Night', patrol: true, prize: 2.6, wx: 'clear', dens: [4, 3], oil: 6, grav: 6, cows: 4, goats: 3,
    blurb: 'Six hairpins under a full moon. Headlights, lamp lit villages and a patrol that never sleeps.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [200, 40, 12, { c: 1 }], [110, -150, 14, { c: -1, sc: 1 }], [180, 0, 14, { c: 1, flags: 1 }], [110, 150, 14, { c: 1 }],
      [200, -30, 12, { c: -1, chai: 1 }], [110, -145, 14, { c: -1 }], [240, 0, 10, { tun: 1 }], [110, 150, 12, { c: 1, sc: 1 }], [220, 30, 10, { c: 1, temple: 1 }],
      [200, -60, 10, { c: -1, falls: 1 }], [260, 0, 6, { c: 0, village: 1 }], [120, -140, 10, { c: -1 }], [240, 50, 8, { c: 1, flags: 1 }], [120, 140, 8, { c: 1 }],
      [260, -30, 4, { c: -1, chai: 1 }], [300, 0, 2, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  },
  {
    id: 'cliff', name: 'Konkan Cliffs', when: 'Bright morning', patrol: true, prize: 1.8, wx: 'clear', dens: [5, 3], oil: 5, grav: 6, cows: 5, goats: 3,
    blurb: 'Red laterite cliffs over a blue sea in morning sun. Palms, fishing villages and one old bridge.',
    secs: [
      [160, 0, 0, { c: 0, village: 1 }], [260, 30, -4, { c: 1, palm: 1 }], [240, -45, -6, { c: -1, palm: 1, chai: 1 }], [200, 0, -4, { c: 1, falls: 1 }], [130, -140, -8, { c: -1, sc: 1 }],
      [260, 20, -6, { c: 0, palm: 1, village: 1 }], [240, 25, -6, { c: 1, temple: 1 }], [200, -40, -4, { c: -1, palm: 1 }], [280, 0, 0, { tun: 1 }], [220, -30, -4, { c: -1, chai: 1 }],
      [130, 140, -6, { c: 1 }], [260, -30, -4, { c: -1, palm: 1, flags: 1 }], [240, 30, -2, { c: 1, palm: 1 }], [300, 0, 0, { c: 0, village: 1 }], [260, 0, 0, { c: 0, village: 1 }]
    ]
  }
];
const COURSE_IDX = { misty: 0, tea: 1, coast: 2, monsoon: 3, night: 4, cliff: 5 };
const courseDef = (id) => COURSES[COURSE_IDX[id]] || COURSES[0];
const WEATHER = { clear: 'Clear', rain: 'Rain', fog: 'Fog', storm: 'Storm' };

// The light of each course: dawn mist, golden afternoon, dusk.
const LOOK = {
  misty: {
    skyTop: '#5b7fb3', skyMid: '#c9b8c4', skyHor: '#f3c9a1', sun: '#ffd6a8', sunI: 2.0, sunEl: 0.12, sunAz: -0.6,
    fog: '#c6c4cc', fogD: 0.0058, hemiSky: '#c4d2ec', hemiGnd: '#4a4636', hemiI: 1.05, exposure: 1.05,
    grass: '#55703f', grass2: '#3f5a33', rock: '#7d7569', dirt: '#8a7457', floor: '#3f5638', tree: 'pine', mist: 0.75, night: 0, sea: false, cloud: 0.55
  },
  tea: {
    skyTop: '#3b6fb8', skyMid: '#8fb5d9', skyHor: '#f2d39b', sun: '#ffd28a', sunI: 3.0, sunEl: 0.42, sunAz: 0.9,
    fog: '#d9cfae', fogD: 0.0026, hemiSky: '#bfd3ea', hemiGnd: '#5d5532', hemiI: 0.9, exposure: 1.0,
    grass: '#6f8a3c', grass2: '#4e7a2f', rock: '#8c7b63', dirt: '#9b7a50', floor: '#4f6a32', tree: 'oak', mist: 0.25, night: 0, sea: false, cloud: 0.35
  },
  coast: {
    skyTop: '#26306a', skyMid: '#b45c84', skyHor: '#ff9a4a', sun: '#ff9a5a', sunI: 2.2, sunEl: 0.035, sunAz: 2.4,
    fog: '#9a6478', fogD: 0.0032, hemiSky: '#b39ad0', hemiGnd: '#5a4038', hemiI: 1.35, exposure: 1.3,
    grass: '#4f6b38', grass2: '#3c5a2f', rock: '#6f5f58', dirt: '#7c6048', floor: '#1d3a52', tree: 'palm', mist: 0.35, night: 1, sea: true, cloud: 0.5
  },
  monsoon: {
    skyTop: '#4c5a68', skyMid: '#7f8c96', skyHor: '#a9b0b0', sun: '#d8dde0', sunI: 1.4, sunEl: 0.55, sunAz: 0.3,
    fog: '#8d979a', fogD: 0.0062, hemiSky: '#aab6c0', hemiGnd: '#3f4a38', hemiI: 1.3, exposure: 1.05,
    grass: '#3f7a33', grass2: '#2f6a2c', rock: '#5e5a52', dirt: '#6b5a44', floor: '#2f4a2c', tree: 'oak', mist: 0.9, night: 0, sea: false, cloud: 1.0, rain: 1
  },
  night: {
    skyTop: '#060a1a', skyMid: '#121a36', skyHor: '#2a3256', sun: '#9fb4ff', sunI: 0.55, sunEl: 0.35, sunAz: -1.2,
    fog: '#141a2c', fogD: 0.0045, hemiSky: '#3a4a78', hemiGnd: '#1a1a20', hemiI: 0.75, exposure: 1.3,
    grass: '#2f4630', grass2: '#25392a', rock: '#4a4844', dirt: '#4e4234', floor: '#0f1a14', tree: 'pine', mist: 0.3, night: 1, sea: false, cloud: 0.2, stars: 1
  },
  cliff: {
    skyTop: '#2f6fc0', skyMid: '#86b9e6', skyHor: '#e9e2c8', sun: '#fff1d6', sunI: 3.1, sunEl: 0.55, sunAz: -0.4,
    fog: '#c8d6e0', fogD: 0.0022, hemiSky: '#cfe0f2', hemiGnd: '#6a5a3e', hemiI: 0.95, exposure: 1.0,
    grass: '#6b8a3a', grass2: '#55782f', rock: '#9a6a4a', dirt: '#a8765a', floor: '#1f5a7a', tree: 'palm', mist: 0.1, night: 0, sea: true, cloud: 0.3
  }
};

/* ------------------------------------------------------------ the course: rows, frames, safe speeds */
// Cross section offsets from the centre line, metres, for the banks on each side.
const OFF = [5.5, 7.2, 7.7, 10, 15, 23, 34, 48];
const P_CLIFF = [0, 0.02, 1.0, 5.5, 13, 23, 33, 44];
const P_VALLEY = [0, -0.02, -0.5, -5, -15, -30, -50, -74];
const P_GENTLE = [0, 0.02, 0.18, 0.9, 2.4, 4.6, 8, 13];

const courseCache = {};
function getCourse(id) {
  if (courseCache[id]) return courseCache[id];
  const C = COURSES[COURSE_IDX[id]], r = rng(17 + COURSE_IDX[id] * 101);
  const rows = [];
  let h = 0, x = 0, z = 0, y = 0;
  C.secs.forEach((sec, si) => {
    const len = sec[0], turn = sec[1] * Math.PI / 180, climb = sec[2], o = sec[3] || {};
    const n = Math.round(len / SEGM);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, w = 2 * Math.pow(Math.sin(Math.PI * t), 2), dh = turn / n * w;
      rows.push({ h0: h, dh, x, z, y, sec: si, o, hair: Math.abs(sec[1]) >= 120 });
      h += dh / 2; x += Math.sin(h) * SEGM; z -= Math.cos(h) * SEGM; h += dh / 2; y += climb / n;
    }
  });
  rows.push({ h0: h, dh: 0, x, z, y, sec: C.secs.length - 1, o: C.secs[C.secs.length - 1][3], hair: false });
  const N = rows.length;
  const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N), HD = new Float32Array(N), CV = new Float32Array(N);
  const KL = new Float32Array(N), KR = new Float32Array(N), TUN = new Float32Array(N), VS = new Float32Array(N), LIM = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { PX[i] = rows[i].x; PZ[i] = rows[i].z; HD[i] = rows[i].h0; }
  // heights smoothed so slopes ease between sections
  for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let k = -14; k <= 14; k++) { const j = clamp(i + k, 0, N - 1); a += rows[j].y; c++; } PY[i] = a / c; }
  for (let i = 0; i < N; i++) CV[i] = rows[i].dh / SEGM;
  // the bank on each side, eased across about 50 m
  const kl = new Float32Array(N), kr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const o = rows[i].o || {};
    if (o.tun) { kl[i] = 1; kr[i] = 1; TUN[i] = 1; }
    else if (o.village) { kl[i] = 0.05; kr[i] = 0.05; }
    else if (o.c === 1) { kl[i] = -1; kr[i] = 1; }
    else if (o.c === -1) { kl[i] = 1; kr[i] = -1; }
    else { kl[i] = 0.22; kr[i] = 0.22; }
    if (o.tea) { kl[i] = Math.min(kl[i], 0.3); kr[i] = Math.min(kr[i], 0.3); }
    if (o.sc) { if (C.secs[rows[i].sec][1] > 0) { kl[i] = 1; kr[i] = -1; } else { kl[i] = -1; kr[i] = 1; } }
  }
  for (let i = 0; i < N; i++) {
    let a = 0, b = 0, c = 0;
    for (let k = -12; k <= 12; k++) { const j = clamp(i + k, 0, N - 1); a += kl[j]; b += kr[j]; c++; }
    KL[i] = a / c; KR[i] = b / c;
  }
  // tunnel blend for lighting, eased so the light drops at the portal
  const tb = new Float32Array(N);
  for (let i = 0; i < N; i++) { let a = 0, c = 0; for (let k = -4; k <= 4; k++) { const j = clamp(i + k, 0, N - 1); a += TUN[j]; c++; } tb[i] = a / c; }
  // how far the banks may reach on the inside of a bend before they fold over
  for (let i = 0; i < N; i++) {
    let cv = 0; for (let k = -6; k <= 6; k++) cv += CV[clamp(i + k, 0, N - 1)]; cv /= 13;
    const rad = Math.abs(cv) > 1e-4 ? 1 / Math.abs(cv) : 1e4;
    const inner = clamp(rad * 0.72, 12, 48);
    LIM[i * 2] = cv < 0 ? inner : 48; LIM[i * 2 + 1] = cv > 0 ? inner : 48;
  }
  // safe speed for the AI and the bend warnings: v^2 * curvature within the push a rider can hold
  for (let i = 0; i < N; i++) { let c = 0; for (let k = -3; k <= 3; k++) c = Math.max(c, Math.abs(CV[clamp(i + k, 0, N - 1)])); VS[i] = Math.min(60, Math.sqrt(5.4 / CENT / Math.max(c, 1e-4))); }
  for (let i = N - 2; i >= 0; i--) VS[i] = Math.min(VS[i], Math.sqrt(VS[i + 1] * VS[i + 1] + 2 * 13 * SEGM));
  const L = (N - 1) * SEGM;
  const T = {
    id, def: C, look: LOOK[id], N, L, PX, PY, PZ, HD, CV, KL, KR, TUN: tb, VS, LIM, rows,
    finishS: L - RUNOUT, startS: START_S, minY: 0, maxY: 0, decor: null, r
  };
  let mn = 1e9, mx = -1e9; for (let i = 0; i < N; i++) { mn = Math.min(mn, PY[i]); mx = Math.max(mx, PY[i]); }
  T.minY = mn; T.maxY = mx;
  // the bounding box of the whole run, for the minimap
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, PX[i]); x1 = Math.max(x1, PX[i]); z0 = Math.min(z0, PZ[i]); z1 = Math.max(z1, PZ[i]); }
  T.box = { x0, x1, z0, z1 };
  T.sc = courseShortcuts(T);
  courseCache[id] = T;
  return T;
}

// Position on the course: s metres along, x metres right of the centre line, up metres above the road.
const FR = { x: 0, y: 0, z: 0, h: 0, fx: 0, fz: -1, rx: 1, rz: 0, pitch: 0, i: 0, t: 0 };
function frameAt(T, s) {
  const u = clamp(s / SEGM, 0, T.N - 1.001), i = Math.floor(u), t = u - i, j = i + 1;
  FR.x = T.PX[i] + (T.PX[j] - T.PX[i]) * t; FR.y = T.PY[i] + (T.PY[j] - T.PY[i]) * t; FR.z = T.PZ[i] + (T.PZ[j] - T.PZ[i]) * t;
  FR.h = T.HD[i] + (T.HD[j] - T.HD[i]) * t;
  FR.fx = Math.sin(FR.h); FR.fz = -Math.cos(FR.h); FR.rx = Math.cos(FR.h); FR.rz = Math.sin(FR.h);
  FR.pitch = Math.atan2(T.PY[j] - T.PY[i], SEGM);
  FR.i = i; FR.t = t;
  // past the end of the run the road carries straight on
  if (s > T.L) { const d = s - T.L; FR.x += FR.fx * d; FR.z += FR.fz * d; }
  else if (s < 0) { FR.x += FR.fx * s; FR.z += FR.fz * s; }
  return FR;
}
function posAt(T, s, x, up, out) {
  frameAt(T, s);
  out.x = FR.x + FR.rx * x; out.y = FR.y + up; out.z = FR.z + FR.rz * x;
  return out;
}
const rowOf = (T, s) => clamp(Math.floor(s / SEGM), 0, T.N - 1);
const curvAt = (T, s) => T.CV[rowOf(T, s)];

// The bank height at lateral offset `off` (metres, signed) at row i.
function profileH(k, j) {
  return k >= 0 ? lerp(P_GENTLE[j], P_CLIFF[j], k) : lerp(P_GENTLE[j], P_VALLEY[j], -k);
}
function bankH(T, i, off) {
  const side = off < 0 ? 0 : 1, a = Math.abs(off), k = side ? T.KR[i] : T.KL[i];
  if (a <= OFF[0]) return 0;
  let j = 0; while (j < OFF.length - 2 && OFF[j + 1] < a) j++;
  const t = clamp((a - OFF[j]) / (OFF[j + 1] - OFF[j]), 0, 1);
  return lerp(profileH(k, j), profileH(k, j + 1), t) + bankNoise(i, side, a);
}
function bankNoise(i, side, a) {
  const amp = clamp((a - 7.5) / 20, 0, 1) * 2.4;
  if (amp <= 0) return 0;
  const f = i * 0.21 + side * 37, g = a * 0.17;
  return amp * (Math.sin(f) * 0.6 + Math.sin(f * 2.3 + g * 3.1) * 0.3 + Math.sin(f * 0.37 + g * 1.7) * 0.5);
}
// world position of a point on the banks, for scenery
function groundPos(T, s, off, out) {
  const i = rowOf(T, s);
  posAt(T, s, off, bankH(T, i, off), out);
  return out;
}

/* ------------------------------------------------------------ save game */
// One record per browser: the wallet, the garage and its upgrades, the career ladder, the season's
// points, the grudges and the records. Earlier saves (wallet, bikes, best times) carry straight over.
let ARC = null, Wd = null, SAVE = null;
const SAVE_KEY = 'ghat-riders.career';
const OLD_KEY = 'ghat-riders.save';
function loadSave() {
  const old = ARC.store.get(OLD_KEY, null) || {};
  const d = ARC.store.get(SAVE_KEY, null) || {};
  const src = d.v === 2 ? d : old;
  SAVE = {
    v: 2,
    cash: typeof src.cash === 'number' ? Math.max(0, src.cash) : 0,
    owned: Array.isArray(src.owned) && src.owned.length ? src.owned.filter((b, i, a) => BIKES[b] && a.indexOf(b) === i) : ['scout'],
    up: d.up && typeof d.up === 'object' ? d.up : {},
    best: src.best && typeof src.best === 'object' ? src.best : {},
    level: clamp((d.level | 0) || 1, 1, LEVELS.length),
    qual: d.qual && typeof d.qual === 'object' ? d.qual : {},
    crowned: !!d.crowned,
    grudge: d.grudge && typeof d.grudge === 'object' ? d.grudge : {},
    pts: d.pts && typeof d.pts === 'object' ? d.pts : {},
    rec: Object.assign({ races: 0, wins: 0, podiums: 0, knocks: 0, busted: 0, wrecked: 0, earned: 0 }, d.rec || {}),
    tut: !!d.tut
  };
  if (SAVE.owned.indexOf('scout') < 0) SAVE.owned.unshift('scout');
  // an earlier save had three courses unlocked in turn: the ladder starts where it left off
  if (d.v !== 2 && (old.unlocked | 0) >= 3) SAVE.level = 2;
}
const saveGame = () => ARC.store.set(SAVE_KEY, SAVE);
const upOf = (id) => { const u = SAVE && SAVE.up[id]; return { eng: u ? u.eng | 0 : 0, tyre: u ? u.tyre | 0 : 0, arm: u ? u.arm | 0 : 0, nos: u ? u.nos | 0 : 0 }; };
const levelDef = (n) => LEVELS[clamp((n || 1) - 1, 0, LEVELS.length - 1)];
// routes the player may race outside the career: every route of the levels reached so far
function routeOpen(id) { for (let i = 0; i < SAVE.level; i++) if (LEVELS[i].routes.indexOf(id) >= 0) return true; return false; }
function grudgeOf(name) { return (SAVE && SAVE.grudge[name]) || 0; }
function addGrudge(name, n) { if (!SAVE) return; SAVE.grudge[name] = clamp(+((SAVE.grudge[name] || 0) + n).toFixed(2), 0, 10); }
function topGrudge() { let best = RIVALS[0], b = -1; RIVALS.forEach((r) => { const g = grudgeOf(r.name); if (g > b && r.tier <= SAVE.level + 1) { b = g; best = r; } }); return best; }

/* ------------------------------------------------------------ the world and its rules */
const TRAFFIC_KINDS = {
  truck: { hl: 3.7, hw: 1.25, h: 3.1 },
  bus: { hl: 5.4, hw: 1.3, h: 3.2 },
  car: { hl: 2.0, hw: 0.88, h: 1.5 },
  tempo: { hl: 1.5, hw: 0.72, h: 1.8 }
};
const TRAFFIC_MIX = ['truck', 'bus', 'car', 'truck', 'tempo', 'car', 'bus', 'truck'];
const TRAFFIC_COL = ['#e0a020', '#2d7fc1', '#d8452f', '#3f9a5a', '#e7e1d2', '#9a4fb5', '#f0c419', '#c9672e', '#e8e8e8', '#5b6670'];
const LEFT_LANE = -2.75, RIGHT_LANE = 2.75;   // traffic keeps left; oncoming uses the right lane

// Fighting from the saddle. A punch is quick and light, a kick is slow, heavy and hurts the bike too.
// hit: when in the move the blow lands (s); rx / rs: reach across and along the road (m); sta: stamina
// it costs; bal: balance it takes off the rider it lands on; push: how far it shoves them across.
const ATK = [null,
  { name: 'punch', dur: 0.34, hit: 0.15, rx: 2.35, rs: 2.3, sta: 11, bal: [14, 20], push: 2.4, bike: 0 },
  { name: 'kick', dur: 0.6, hit: 0.33, rx: 2.75, rs: 2.6, sta: 22, bal: [28, 36], push: 5.2, bike: 5 }
];
const PARRY_WINDOW = 0.22;   // a guard raised this close before the blow turns it back
const CRASH_DMG = { traffic: 30, wall: 16, cow: 18, goat: 10, patrol: 12, knock: 7, wobble: 6 };
const COACH = { name: 'Coach Ustad', kind: 'thunder', style: 'blocker', paint: '#6f7a84', jacket: '#ffb736', helmet: '#ffb736', aggr: 0.4, pace: 1, tier: 1, line: 'Teaches the old ways of the ghat.' };

function mkRider(o) {
  const b = BIKES[o.kind] || BIKES.scout, u = o.up || { eng: 0, tyre: 0, arm: 0, nos: 0 };
  return Object.assign({
    s: 0, x: 0, v: 0, vx: 0, lean: 0, steer: 0, thr: 0, wob: 0, wobPh: 0, crash: 0, crashT: 0, crashDur: 4, crashDir: 1, crashSpin: 0,
    nitro: 20, nitroOn: false, nLatch: 0, brLatch: 0, draft: 0, finished: false, finT: 0, place: 0,
    invuln: 0, oil: 0, gravel: 0, scrape: 0, onShoulder: false, peg: 0, wheel: 0, tumble: 0, react: 0, lastHit: -9, pass: {},
    bal: 100, sta: 100, dmg: 0, balT: 9, staT: 9, lastSide: 1,
    atkK: 0, atkSide: 1, atkT: 0, atkDur: 0, atkHitAt: 0, atkDone: true, atkPow: 1, atkCd: 0, atkId: 0,
    guard: false, guardT: 0, guardIn: false, guardLatch: 0, guardBreak: 0, stagger: 0, hitT: 0, hitSide: 1, combo: 0, comboT: 0, counterT: 0,
    rd: 0, rx: 0, rv: 0, rvx: 0, crashPh: 0, phT: 0, runV: 0, runBoost: 0, sc: null, scU: 0, scYaw: 0, dnf: false, out: '', lastBy: null, lastHitT: -9,
    ai: { tx: 0, bias: 0, cd: 1 + Math.random() * 2, barge: 0, bargeT: null, nitroT: 0, mood: Math.random(), mind: mkMind(), atkCd: 1 + Math.random(), blockPlan: -1, guardFor: 0, sawAtk: 0, scPlan: -1 }, emo: null,
    stats: { shoves: 0, knocks: 0, taken: 0, crashes: 0, passes: 0, near: 0, blocks: 0, parries: 0, kicks: 0, punches: 0, bridges: 0, punchL: 0, punchR: 0 }
  }, o, { b, up: u, top: bikeTop(b) * (1 + 0.035 * u.eng), acc: bikeAcc(b) * (1 + 0.05 * u.eng), steerMax: bikeSteer(b) * (1 + 0.05 * u.tyre), grip: bikeGrip(b) * (1 - 0.05 * u.tyre), nCap: 100 + 25 * u.nos, arm: u.arm });
}
// rivals bring their own upgrades as the career climbs
const rivalUp = (lv) => ({ eng: clamp(lv.n - 1, 0, 3), tyre: clamp(lv.n - 2, 0, 3), arm: clamp(lv.n - 2, 0, 3), nos: clamp(lv.n - 3, 0, 2) });
function pickField(lv, attract) {
  const pool = RIVALS.filter((r) => attract || r.tier <= lv.n);
  const keep = attract ? null : topGrudge();
  const out = keep && grudgeOf(keep.name) > 0.5 && pool.indexOf(keep) >= 0 ? [keep] : [];
  const rest = pool.filter((r) => out.indexOf(r) < 0).sort(() => Math.random() - 0.5);
  // the stars of the level always turn up
  rest.sort((a, b) => (b.tier === lv.n ? 1 : 0) - (a.tier === lv.n ? 1 : 0));
  while (out.length < N_RIVALS && rest.length) out.push(rest.shift());
  return out;
}

function newWorld(cfg) {
  const T = getCourse(cfg.course), d = DIFF[cfg.diff] || DIFF.normal, C = T.def;
  const mode = cfg.mode, tt = mode === 'time', prac = mode === 'practice', grudge = mode === 'grudge';
  const lv = levelDef(cfg.attract ? 1 : cfg.level || (SAVE ? SAVE.level : 1));
  const W = {
    T, cfg, d, lv, attract: !!cfg.attract, phase: cfg.attract ? 'racing' : 'intro', introT: 0, introDur: 0, t: 0, cd: cfg.attract ? 0.01 : 3.4,
    riders: [], traffic: [], cows: [], patrols: [], hazards: [],
    pops: [], timeScale: 1, slowT: 0, finWait: 0, results: null, busted: false, wrecked: false, bustT: 0, fov: 0, evt: [], seed: (Math.random() * 1e9) | 0,
    falls: [], hornT: 0, overTimer: 0, banner: null, bannerT: 0, msgT: 0, atkSeq: 0, tele: null,
    wx: cfg.weather && cfg.weather !== 'route' ? cfg.weather : (C.wx || 'clear'), comm: [], rec: null, clips: [], pend: null, replay: null, podium: null, podT: 0,
    tut: null, leader: null, lightT: 6 + Math.random() * 8, sirenT: 0, skip: false
  };
  W.wet = W.wx === 'rain' || W.wx === 'storm' ? 1 : 0;
  W.introDur = cfg.attract ? 0 : (ARC.reducedMotion ? 2.6 : 5.4);
  const P = mkRider({ name: 'You', kind: cfg.bike, isPlayer: true, paint: BIKES[cfg.bike].paint, jacket: PLAYER_LOOK.jacket, helmet: PLAYER_LOOK.helmet, idx: 0, aggr: 0, pace: 1, up: cfg.attract ? null : upOf(cfg.bike) });
  W.P = P; W.riders.push(P);
  let field = [];
  if (prac) field = [COACH];
  else if (grudge) field = [RIVALS.find((r) => r.name === cfg.foe) || topGrudge()];
  else if (!tt) field = pickField(lv, cfg.attract);
  field.forEach((rv, i) => W.riders.push(mkRider(Object.assign({}, rv, { idx: i + 1, isPlayer: false, sty: STYLES[rv.style] || STYLES.clean, up: rivalUp(lv) }))));
  // grid: rows of two behind the start line, the player starts mid-pack
  const slots = [];
  for (let k = 0; k < 8; k++) slots.push({ s: START_S - 7 - Math.floor(k / 2) * 6, x: k % 2 ? 1.9 : -1.9 });
  const order = W.riders.slice();
  if (field.length > 2) { order.splice(0, 1); order.splice(cfg.attract ? 2 : Math.min(5, order.length), 0, P); }
  order.forEach((r, k) => { r.s = slots[k].s; r.x = slots[k].x; r.ai.tx = r.x; r.react = r.isPlayer ? 0 : 0.05 + Math.random() * 0.3; });
  if (tt) { P.s = START_S - 8; P.x = 0; }
  // traffic pool
  const dens = C.dens || [4, 2];
  const scale = (cfg.diff === 'easy' ? 0.7 : cfg.diff === 'hard' ? 1.2 : 1) * (tt ? 0.6 : 1) * (prac ? 0 : 1);
  const nSame = Math.round(dens[0] * scale), nOn = Math.round(dens[1] * scale);
  for (let i = 0; i < nSame + nOn; i++) {
    const kind = TRAFFIC_MIX[i % TRAFFIC_MIX.length];
    W.traffic.push({ kind, k: TRAFFIC_KINDS[kind], dir: i < nSame ? 1 : -1, s: 0, x: 0, v: 0, col: TRAFFIC_COL[(i * 3 + 1) % TRAFFIC_COL.length], live: false, horn: 0, idx: i, swayP: Math.random() * 6 });
  }
  W.traffic.forEach((v, i) => spawnTraffic(W, v, 200 + i * (3200 / W.traffic.length), true));
  const r = rng(W.seed);
  // oil and gravel on the tarmac
  const nOil = prac ? 0 : (C.oil || 5) + W.wet * 2, nGrav = prac ? 0 : C.grav || 6;
  for (let i = 0; i < nOil + nGrav; i++) {
    const s = 260 + r() * (T.finishS - 400);
    if (T.sc.some((q) => s > q.s0 - 30 && s < q.s0 + 6)) continue;
    W.hazards.push({ kind: i < nOil ? 'oil' : 'gravel', s, x: (r() * 2 - 1) * 4.2, rs: 2.6 + r() * 1.6, rx: 1.2 + r() * 0.6 });
  }
  // cows by the road, some wander across; goats cross in little groups
  const nCow = prac ? 0 : C.cows || 5;
  for (let i = 0; i < nCow; i++) {
    const s = 330 + (i + r() * 0.6) * (T.finishS - 500) / nCow, side = r() < 0.5 ? -1 : 1;
    W.cows.push({ s, x: side * (6.3 + r() * 0.3), home: side * 6.4, walk: r() < 0.45 ? -side : 0, wT: 0, hd: r() * 6, moo: 0, look: r() * 6, col: r() < 0.6 ? '#ece6da' : '#b8ada0', goat: false });
  }
  const nGoat = prac ? 0 : C.goats || 2;
  for (let i = 0; i < nGoat; i++) {
    const s = 500 + (i + 0.3 + r() * 0.4) * (T.finishS - 700) / nGoat, side = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < 3; k++) W.cows.push({ s: s + k * 1.6 + r(), x: side * (6.4 + r() * 0.6), home: side * 6.5, walk: -side, wT: 0, hd: r() * 6, moo: 0, look: r() * 6, col: ['#3a2f28', '#f1ece2', '#8a6a4a'][(i + k) % 3], goat: true, wait: k * 0.5 });
  }
  // patrol riders: parked at the roadside, one cruising, more of them higher up the career
  if (C.patrol && !tt && !prac) {
    [0.33, 0.68].forEach((f, i) => W.patrols.push(mkPatrol(T.finishS * f, (i % 2 ? 1 : -1) * 6.2, 0, true)));
    W.patrols.push(mkPatrol(950, LEFT_LANE - 0.6, 20.5, false));
    for (let i = 0; i < lv.patrols; i++) W.patrols.push(mkPatrol(1800 + i * 1100, LEFT_LANE - 0.4, 19, false));
  }
  if (cfg.attract) { W.phase = 'racing'; W.riders.forEach((rr) => { rr.react = 0; }); P.bot = true; }
  else W.rec = makeRec(W);
  if (prac) W.tut = { step: 0, t: 0, flags: {}, doneT: -1 };
  // positions of waterfalls, for the spray
  W.falls = (decorFor(T).falls || []).slice();
  return W;
}
function mkPatrol(s, x, v, parked) { return { s, x, v, parked, home: x, beacon: 0, chase: false, tgt: null, chaseT: 0, lostT: 0, closeT: 0, down: 0, warned: false }; }

function spawnTraffic(W, v, s, init) {
  const T = W.T;
  v.s = clamp(s, 120, T.finishS + 120);
  v.x = (v.dir > 0 ? LEFT_LANE : RIGHT_LANE) + (Math.random() - 0.5) * 0.6;
  v.v = v.dir > 0 ? 10 + Math.random() * 8 : -(12 + Math.random() * 6);
  if (v.kind === 'tempo') v.v *= 0.8;
  v.live = true; v.horn = 0;
  if (init && Math.abs(v.s - START_S) < 140) v.s = START_S + 150 + Math.random() * 60;
}

function updateTraffic(W, dt) {
  const T = W.T, focus = W.P.finished ? W.P.s : Math.max(W.P.s, START_S);
  for (let i = 0; i < W.traffic.length; i++) {
    const v = W.traffic[i];
    if (W.phase !== 'grid' || v.s > START_S + 120) v.s += v.v * dt;
    // ease off on hairpins
    const c = Math.abs(curvAt(T, v.s));
    if (c > 0.01) v.s -= v.v * dt * clamp((c - 0.01) * 18, 0, 0.35);
    v.x += ((v.dir > 0 ? LEFT_LANE : RIGHT_LANE) - v.x) * dt * 0.5;
    if (v.s < focus - 140 || v.s > focus + 900 || v.s > T.finishS + 140) {
      const ahead = v.dir > 0 ? 380 + Math.random() * 380 : 520 + Math.random() * 320;
      spawnTraffic(W, v, focus + ahead, false);
    }
    if (v.horn > 0) v.horn -= dt;
  }
}

function updateCows(W, dt) {
  for (let i = 0; i < W.cows.length; i++) {
    const c = W.cows[i];
    c.hd += dt; c.look += dt;
    if (c.moo > 0) c.moo -= dt;
    if (!c.walk) continue;
    const near = Math.abs(c.s - W.P.s) < (c.goat ? 160 : 220);
    if (!near && c.wT === 0) continue;
    if (c.wait > 0) { c.wait -= dt; continue; }
    c.wT += dt;
    c.x += c.walk * (c.goat ? 1.5 : 0.9) * dt;
    const lim = c.goat ? 6.9 : 6.4;
    if (Math.abs(c.x) > lim) { c.x = clamp(c.x, -lim, lim); c.walk = -c.walk; c.wT = 0; c.wait = c.goat ? 3 + Math.random() * 5 : 0; if (!c.goat && Math.random() < 0.5) c.walk = 0; }
  }
}

/* ------------------------------------------------------------ the patrol */
// Patrol riders sit at the roadside or cruise the climb. A fight in front of one, or a reckless wipeout,
// puts them on your tail with the lights going. They pull alongside and wave you down: stay in front,
// out of reach, for a few seconds (or let them meet a truck, or take the old bridge) and they give up.
const patrolNear = (W, s, d) => { for (let i = 0; i < W.patrols.length; i++) { const p = W.patrols[i]; if (p.down <= 0 && Math.abs(p.s - s) < d) return p; } return null; };
function noticeFight(W, R) {
  if (W.attract || W.phase !== 'racing' || R.dnf) return;
  for (let i = 0; i < W.patrols.length; i++) {
    const p = W.patrols[i];
    if (p.down > 0) continue;
    if (p.chase) { if (p.tgt === R) p.lostT = 0; continue; }
    const ds = R.s - p.s;
    if (ds < -25 || ds > (p.parked ? 80 : 130)) continue;
    if (W.patrols.some((q) => q.chase && q.tgt === R)) return;
    p.chase = true; p.tgt = R; p.parked = false; p.chaseT = 0; p.lostT = 0; p.closeT = 0; p.v = Math.max(p.v, 12);
    if (R.isPlayer) {
      pop(W, 'Patrol!', 'They saw that. Get clear', TEAL, true); ARC.haptic('fail', 0.7);
      tone(660, 0.25, { type: 'square', vol: 0.1 }); tone(520, 0.25, { type: 'square', vol: 0.1, delay: 0.27 });
    }
    say(W, R.isPlayer ? 'chase' : 'chaseR', R.isPlayer ? 'you' : R.name);
    return;
  }
}
function endChase(W, p, why) {
  const R = p.tgt;
  p.chase = false; p.tgt = null; p.closeT = 0; p.lostT = 0; p.v = Math.min(p.v, 18);
  if (!R || !R.isPlayer || W.phase !== 'racing') return;
  if (why === 'lost') { pop(W, 'Lost them!', 'The patrol gives up', '#44ffa8', true); addNitro(R, 30); ARC.haptic('success', 0.6); say(W, 'escape', 'You'); }
  else if (why === 'crash') { pop(W, 'Patrol down!', 'They met the traffic', '#44ffa8', true); addNitro(R, 20); say(W, 'patrolDown', 'You'); }
}
function bust(W, R, p) {
  if (R.dnf || W.phase !== 'racing') return;
  if (p) { p.chase = false; p.tgt = null; p.parked = true; p.v = 0; p.s = R.s - 5; p.x = clamp(R.x, -6, 6) + (R.x > 0 ? -1 : 1); }
  if (R.isPlayer) {
    if (W.attract) return;
    W.busted = true; W.phase = 'busted'; W.bustT = 0; ARC.haptic('fail', 1);
    pop(W, 'Busted!', 'The patrol flags you down', TEAL, true);
    tone(660, 0.25, { type: 'square', vol: 0.12 }); tone(520, 0.25, { type: 'square', vol: 0.12, delay: 0.27 });
    say(W, 'busted', 'You');
    markClip(W, 'bust', R, null);
  } else {
    R.dnf = true; R.out = 'busted'; R.atkK = 0; R.guard = false;
    say(W, 'bustR', R.name);
    if (Math.abs(R.s - W.P.s) < 120) pop(W, 'Pulled over', R.name + ' is out', TEAL);
  }
}
function updatePatrols(W, dt) {
  const T = W.T;
  for (let i = 0; i < W.patrols.length; i++) {
    const p = W.patrols[i];
    p.beacon += dt;
    if (p.down > 0) {
      p.down -= dt; p.v *= Math.exp(-3 * dt); p.s += p.v * dt;
      if (p.down <= 0) { p.down = 0; p.v = 0; p.parked = true; p.x = Math.sign(p.x || 1) * 6.4; }
      continue;
    }
    if (p.chase) {
      const R = p.tgt;
      if (!R || R.finished || R.dnf || W.phase !== 'racing') { endChase(W, p, 'quiet'); continue; }
      p.chaseT += dt;
      const gap = R.s - p.s;
      const vs = T.VS[rowOf(T, p.s + 14)] * 1.04;
      const want = Math.min(57, vs, R.crash > 0 ? 16 : R.v + 8.5);
      p.v += clamp(want - p.v, -18 * dt, 9.5 * dt);
      p.s += p.v * dt;
      const tx = gap < 14 ? R.x + (R.x > 0 ? -1.5 : 1.5) * (gap < 4 ? 1 : 0.4) : clamp(R.x, -3.4, 3.4);
      p.x += clamp(tx - p.x, -5 * dt, 5 * dt);
      if (Math.abs(gap) < 3.2 && Math.abs(R.x - p.x) < 2.5 && R.crash <= 0 && !R.sc) {
        p.closeT += dt * (R.v < p.v + 1.5 ? 1 : 0.35);
        if (p.closeT > 1.5) bust(W, R, p);
      } else p.closeT = Math.max(0, p.closeT - dt * 0.5);
      if (R.crash > 0 && Math.abs(gap) < 30) { bust(W, R, p); continue; }
      if (gap > 220 || R.sc) p.lostT += dt; else p.lostT = Math.max(0, p.lostT - dt * 0.5);
      if (p.lostT > 3.2 || p.chaseT > 45) endChase(W, p, 'lost');
    } else if (!p.parked && W.phase !== 'grid' && W.phase !== 'intro') {
      p.s += p.v * dt;
      const c = Math.abs(curvAt(T, p.s)); if (c > 0.012) p.s -= p.v * dt * 0.3;
      p.x += (p.home - p.x) * Math.min(1, dt);
      if (p.s > T.finishS - 40) { p.s = T.finishS - 40; p.v = 0; p.parked = true; }
    }
  }
}

/* ------------------------------------------------------------ commentary */
// The voice in the corner of the broadcast. Original lines, a few for every moment that matters.
const LINES = {
  start: ['And they are away down {r}!', 'Eight riders, one mountain road. Here we go!', 'Green flag on {r}. Mind the cows!', 'Engines screaming, {r} is live!'],
  startG: ['One on one on {r}. {a} has not forgotten.', 'Grudge match! You and {a}, nobody else.'],
  knockP: ['{b} takes the scenic route, courtesy of you!', 'Down goes {b}! You mean business today.', 'You send {b} into the ferns!', 'Off the bike! {b} will be picking leaves out of that helmet.'],
  knockR: ['{a} drops {b} on the shoulder!', '{a} and {b} trade blows, and {b} is off!', '{a} cleans out {b}. Brutal riding.'],
  knocked: ['{a} sends you tumbling! Up you get.', 'You are off! {a} is loving that.', 'A big hit from {a}. Run for that bike!'],
  parry: ['What a parry by {a}!', '{a} reads it perfectly and turns it away!', 'Blocked and punished, {a} saw it coming.'],
  combo: ['{a} lands a combination!', 'Three in a row from {a}!'],
  comboP: ['What a combination!', 'Three in a row, and they all landed!'],
  parryP: ['What a parry! You read that perfectly.', 'Blocked and turned away. Now hit back!'],
  bridgeP: ['You take the old bridge!', 'Over the trestle you go! Brave.', 'The shortcut! Seconds saved.'],
  lead: ['{a} takes the lead!', 'New leader: {a}!', '{a} hits the front!'],
  leadP: ['You hit the front!', 'You lead {r}!', 'Look at that, you are leading!'],
  chase: ['Sirens! The patrol is on your tail!', 'Blue lights behind you. Ride clean or ride fast!'],
  chaseR: ['The patrol goes after {a}!', 'Sirens behind {a}!'],
  escape: ['You give the patrol the slip!', 'Gone! The patrol cannot keep up.'],
  patrolDown: ['The patrol rider meets a truck! Shaken, not stirred.'],
  busted: ['Busted! The patrol flags you down.', 'That is the end of that. Pulled over!'],
  bustR: ['The patrol pulls {a} over. Race over for them!', '{a} is busted. One less rival.'],
  bridge: ['{a} takes the old bridge!', 'Over the trestle goes {a}! Brave.', 'The shortcut! {a} saves seconds.'],
  wreck: ['That bike has had enough. Wrecked!', 'Smoke and steam, the bike is done.'],
  wreckR: ['{a} has wrecked the bike. Out of the race!'],
  traffic: ['Inches from that truck!', 'Threading the needle through the traffic!'],
  finishW: ['You win it! What a ride down {r}!', 'Victory on {r}!'],
  finishP: ['A podium finish on {r}!', 'Top three, and a spot on the podium!'],
  finishL: ['Across the line in {a}. More to do next time.', 'Finished {a}. The mountain wins this one.'],
  grudge: ['{a} has not forgotten the last race.', 'Bad blood between you and {a}.', '{a} is out for payback today.'],
  wet: ['Rain on {r}. The tarmac is like soap.', 'Wet roads. Gentle on the brakes!'],
  tired: ['Running out of puff there.']
};
function say(W, key, a, b) {
  if (W.attract) return;
  const L = LINES[key]; if (!L) return;
  const s = L[(Math.random() * L.length) | 0].replace(/\{a\}/g, a || '').replace(/\{b\}/g, b || '').replace(/\{r\}/g, W.T.def.name);
  if (W.comm.length && W.comm[W.comm.length - 1].s === s) return;
  if (W.comm.length > 2) W.comm.splice(1, 1);
  W.comm.push({ s, t: 0 });
}

/* ------------------------------------------------------------ replays */
// Every rider, vehicle and patrol is written into a short ring buffer fifteen times a second. A
// knockdown involving you (or a bust) cuts a four second clip out of it; the best two are shown as
// a slow-motion highlight reel before the podium.
const REC_F = ['s', 'x', 'v', 'vx', 'lean', 'wob', 'wobPh', 'crash', 'crashT', 'crashDir', 'crashSpin', 'crashPh', 'rd', 'rx', 'atkK', 'atkSide', 'atkT', 'atkDur', 'guard', 'hitT', 'hitSide', 'wheel', 'scU'];
const RF = REC_F.length + 1;
function makeRec(W) {
  const stride = W.riders.length * RF + W.traffic.length * 2 + W.patrols.length * 3, cap = 96;
  return { stride, cap, buf: new Float32Array(stride * cap), tm: new Float64Array(cap), head: 0, n: 0, acc: 0 };
}
function recFrame(W) {
  const r = W.rec, o = r.head * r.stride, b = r.buf;
  let k = o;
  for (let i = 0; i < W.riders.length; i++) {
    const R = W.riders[i];
    for (let f = 0; f < REC_F.length; f++) { const v = R[REC_F[f]]; b[k++] = v === true ? 1 : v === false ? 0 : +v || 0; }
    b[k++] = R.sc ? R.sc.k : -1;
  }
  for (let i = 0; i < W.traffic.length; i++) { b[k++] = W.traffic[i].s; b[k++] = W.traffic[i].x; }
  for (let i = 0; i < W.patrols.length; i++) { const p = W.patrols[i]; b[k++] = p.s; b[k++] = p.x; b[k++] = p.down > 0 ? 1 : 0; }
  r.tm[r.head] = W.t; r.head = (r.head + 1) % r.cap; r.n = Math.min(r.cap, r.n + 1);
}
function markClip(W, kind, victim, by) {
  if (!W.rec || W.attract || W.pend) return;
  const label = kind === 'bust' ? 'Busted' : by && by.isPlayer ? 'You drop ' + victim.name : by ? by.name + ' drops you' : 'Wipeout';
  W.pend = { kind, t: W.t, until: W.t + 1.5, vi: victim.idx, ai: by ? by.idx : -1, label, pri: kind === 'bust' ? 1 : by && by.isPlayer ? 3 : 2 };
}
function cutClip(W) {
  const r = W.rec, p = W.pend; W.pend = null;
  const idx = [];
  for (let j = 0; j < r.n; j++) { const h = (r.head - r.n + j + r.cap) % r.cap; const t = r.tm[h]; if (t >= p.t - 2.6 && t <= p.until) idx.push(h); }
  if (idx.length < 6) return;
  const frames = new Float32Array(idx.length * r.stride), tm = new Float32Array(idx.length);
  idx.forEach((h, j) => { frames.set(r.buf.subarray(h * r.stride, h * r.stride + r.stride), j * r.stride); tm[j] = r.tm[h] - r.tm[idx[0]]; });
  const clip = { frames, tm, n: idx.length, dur: tm[idx.length - 1], label: p.label, vi: p.vi, ai: p.ai, kind: p.kind, pri: p.pri, at: p.t - r.tm[idx[0]] };
  W.clips.push(clip);
  W.clips.sort((a, b) => b.pri - a.pri);
  if (W.clips.length > 3) W.clips.length = 3;
}

/* ------------------------------------------------------------ sound */
const SND = { e1: null, e2: null };
function engineStop() { if (SND.e1) { SND.e1.stop(); SND.e2.stop(); } SND.e1 = SND.e2 = null; }
function engineStart() { engineStop(); SND.e1 = ARC.sfx.hum('sawtooth'); SND.e2 = ARC.sfx.hum('square'); }
function engineSet(P) {
  if (!SND.e1) return;
  const sp = clamp(P.v / P.top, 0, 1.3), gear = Math.min(5, Math.floor(sp * 5.2)), inG = sp * 5.2 - gear;
  const rpm = 0.3 + inG * 0.7;
  const f = 62 + rpm * 120 + gear * 6;
  const vol = P.crash > 0 ? 0.02 : 0.05 + P.thr * 0.07 + (P.nitroOn ? 0.03 : 0);
  SND.e1.set(f, vol); SND.e2.set(f * 0.5, vol * 0.6);
}
const tone = (f, d, o) => ARC.sfx.tone(f, d, o);
const noise = (d, o) => ARC.sfx.noise(d, o);

function pop(W, text, sub, col, big) {
  if (W.attract) return;
  W.pops.push({ text, sub: sub || '', col: col || '#ffb736', t: 0, big: !!big });
  if (W.pops.length > 4) W.pops.shift();
}

/* ------------------------------------------------------------ steering input */
// A controller's shoulder buttons are read straight from the pad: left or right bumper holds the guard.
function padGuard() {
  if (!ARC.gamepad || !navigator.getGamepads) return false;
  try { const all = navigator.getGamepads(); for (let i = 0; i < all.length; i++) { const g = all[i]; if (g && g.connected) return !!((g.buttons[4] && g.buttons[4].pressed) || (g.buttons[5] && g.buttons[5].pressed)); } } catch (e) { /* no pad */ }
  return false;
}
function readInput(W, P, dt) {
  const inp = ARC.input, a = ARC;
  const gest = a.touchMode && a.touchStyle !== 'pads';
  let sx = inp.axis().x;
  if (inp.stick.active) { sx = clamp(inp.stick.x * 1.3, -1, 1); if (Math.abs(sx) < 0.07) sx = 0; }
  else if (a.touchMode && a.touchStyle === 'tilt') sx = clamp(sx * 1.25, -1, 1);
  else if (sx === 0 && !a.touchMode && inp.pointer.seen && inp.pointer.type === 'mouse' && (!inp.gesture.active || inp.gesture.type === 'mouse')) {
    // mouse: steer toward the pointer
    sx = clamp((inp.pointer.nx - 0.5) * 2.4, -1, 1);
    if (Math.abs(sx) < 0.06) sx = 0;
  }
  const g = inp.gesture;
  const dragBrake = gest && g.active && g.type !== 'mouse' && g.dy > 46 && g.dy > Math.abs(g.dx) * 0.5;
  const stickBrake = inp.stick.active && inp.stick.y > 0.55;
  const brake = inp.down('ArrowDown', 'KeyS') || P.brLatch > 0 || dragBrake || stickBrake;
  const autoGas = a.touchMode || W.cfg.gas === 'auto';
  const gas = !brake && (inp.down('ArrowUp', 'KeyW') || (inp.pointer.down && inp.pointer.type === 'mouse') || autoGas);
  const nit = inp.down('ShiftLeft', 'ShiftRight', 'KeyN') || P.nLatch > 0;
  // a downward drag that brakes should not also steer
  if (dragBrake) sx *= 0.4;
  P.steerIn = (P.steerIn || 0) + (sx - (P.steerIn || 0)) * Math.min(1, dt * (Math.abs(sx) > 0.01 ? 10 : 14));
  // fists and feet: Z / J punch left, X / K punch right, C / L kick, Space punches whoever is nearest;
  // B or Q (or a controller bumper) holds the guard. Gestures are turned into the same in update().
  // a key press is read once per drawn frame, however many physics steps that frame runs
  let atk = 0, side = 0;
  const fresh = W.inFrame !== a.frame; W.inFrame = a.frame;
  if (!fresh) { /* already read this frame */ }
  else if (inp.hit('KeyZ', 'KeyJ')) { atk = 1; side = -1; }
  else if (inp.hit('KeyX', 'KeyK')) { atk = 1; side = 1; }
  else if (inp.hit('KeyC', 'KeyL')) { atk = 2; side = nearestSide(W, P) || P.lastSide || 1; }
  else if (inp.hit('Space')) { atk = 1; side = nearestSide(W, P) || P.lastSide || 1; }
  if (W.queuedAtk) { atk = W.queuedAtk.k; side = W.queuedAtk.side || nearestSide(W, P) || P.lastSide || 1; W.queuedAtk = null; }
  const guard = inp.down('KeyB', 'KeyQ') || P.guardLatch > 0 || padGuard();
  return { steer: P.steerIn, gas, brake, nit, atk, side, guard };
}

// Which side the nearest rider in fighting range is on (or 0).
function nearestSide(W, P) {
  let best = 99, side = 0;
  for (let i = 0; i < W.riders.length; i++) {
    const o = W.riders[i]; if (o === P || o.crash > 0 || o.finished || o.dnf || o.sc) continue;
    const ds = Math.abs(o.s - P.s), dx = o.x - P.x;
    if (ds < 4.5 && Math.abs(dx) < 4) { const d = ds + Math.abs(dx); if (d < best) { best = d; side = dx < 0 ? -1 : 1; } }
  }
  return side;
}
function inRange(W, P, side, rx, rs) {
  rx = rx || 2.9; rs = rs || 2.4;
  let best = null, bd = 99;
  for (let i = 0; i < W.riders.length; i++) {
    const o = W.riders[i]; if (o === P || o.crash > 0 || o.finished || o.invuln > 0 || o.dnf || !!o.sc !== !!P.sc) continue;
    const ds = Math.abs(o.s - P.s), dx = (o.x - P.x) * side;
    if (ds < rs && dx > 0.25 && dx < rx) { const d = ds * 0.6 + dx; if (d < bd) { bd = d; best = o; } }
  }
  return best;
}

/* ------------------------------------------------------------ AI */
// A rival is a person on a bike, not a machine. Each one has a day (form), a reaction time for
// things that appear ahead, a habit of braking a touch early or late into each bend, a temper
// that rises when they are passed and cools after a scare, and the odd small mistake: a lift and
// a run wide that is more likely when someone is right on their tail. All of it is small and
// averages out, so the field stays fair; the rubber band still keeps the race close.
function mkMind() {
  const r = Math.random;
  return {
    form: 0.975 + r() * 0.04, rx: 0.15 + r() * 0.15, seen: 0, brk: 1, brkT: 0, err: 0, errT: 0, errDir: 0, errK: 0,
    nextErr: 7 + r() * 16, temper: 0.75 + r() * 0.5, heat: 0, cool: 0, press: 0
  };
}
function emote(R, k, t) { if (!R.emo || R.emo.t <= 0 || k === 'crash') R.emo = { k, t: t || 1.4, d: t || 1.4 }; }
function humanMind(W, R, dt, cAhead) {
  const m = R.ai.mind, P = W.P;
  if (m.heat > 0) m.heat = Math.max(0, m.heat - dt / 9);
  if (m.cool > 0) m.cool = Math.max(0, m.cool - dt / 5);
  if (R.emo && R.emo.t > 0) R.emo.t -= dt;
  // pressure: the player (or anyone) right behind
  let press = 0;
  for (let i = 0; i < W.riders.length; i++) { const o = W.riders[i]; if (o === R || o.crash > 0) continue; const ds = R.s - o.s; if (ds > 0.5 && ds < 9 && Math.abs(o.x - R.x) < 2.6) press = Math.max(press, (o.isPlayer ? 1 : 0.5) * (1 - ds / 9)); }
  m.press += (press - m.press) * Math.min(1, dt * 2);
  // a glance over the shoulder at whoever is close behind
  if (m.press > 0.55 && Math.random() < dt * 0.5) emote(R, 'look', 0.9);
  // brake points: re-judged as each bend comes up
  m.brkT -= dt;
  if (m.brkT <= 0) { m.brkT = 2.5 + Math.random() * 3; m.brk = 0.86 + Math.random() * 0.24 - m.heat * 0.06; }
  // the odd mistake, sooner on a bad day, under pressure, or hot after being passed
  if (m.errT > 0) m.errT -= dt;
  else if (W.phase === 'racing' && R.v > 16) {
    m.nextErr -= dt * (1 + m.press * 1.6 + m.heat * 0.8 + (1.0 - m.form) * 12);
    if (m.nextErr <= 0) {
      m.errT = m.err = 0.5 + Math.random() * 0.7;
      m.errDir = Math.abs(cAhead) > 0.0015 ? -Math.sign(cAhead) : (Math.random() < 0.5 ? -1 : 1);
      m.errK = 0.8 + Math.random() * 1.3;
      m.nextErr = 12 + Math.random() * 22;
      if (Math.abs(R.s - P.s) < 40) emote(R, 'shake', 1.2);
    }
  }
}
// Fists and feet, the way a person rides a scrap: a guard goes up a human reaction after a blow is
// seen coming (kicks are easier to read than punches), and blows are thrown at whoever is alongside,
// mostly you, more so when there is history between you. A patrol close by keeps most of them honest.
function aiCombat(W, R, dt) {
  const ai = R.ai, st = R.sty || STYLES.clean, d = W.d, m = ai.mind, tut = W.tut;
  R.guardIn = false;
  if (W.phase !== 'racing' || R.crash > 0 || R.sc || R.finished || R.dnf) { ai.blockPlan = -1; ai.guardFor = 0; return; }
  const tutStep = tut ? TUT[tut.step] && TUT[tut.step].id : '';
  // defence
  if (ai.guardFor > 0) { ai.guardFor -= dt; R.guardIn = true; }
  if (ai.blockPlan >= 0) { ai.blockPlan -= dt; if (ai.blockPlan < 0) { ai.guardFor = 0.35 + Math.random() * 0.35; R.guardIn = true; } }
  else if (ai.guardFor <= 0 && !(tut && tutStep !== 'knock')) {
    for (let i = 0; i < W.riders.length; i++) {
      const o = W.riders[i]; if (o === R || !o.atkK || o.atkDone || o.crash > 0) continue;
      const ds = Math.abs(o.s - R.s), dx = (R.x - o.x) * o.atkSide;
      if (ds < 3 && dx > 0.2 && dx < 3.1 && ai.sawAtk !== o.atkId) {
        ai.sawAtk = o.atkId;
        const skill = st.block * d.block * (o.atkK === 2 ? 1.25 : 0.7) * (o.isPlayer ? 1 : 0.8) * (1 - m.cool * 0.3);
        if (Math.random() < skill) ai.blockPlan = m.rx * (0.7 + Math.random() * 0.6);
      }
    }
  }
  // offence
  if (ai.atkCd > 0) ai.atkCd -= dt;
  if (R.atkK || R.stagger > 0 || ai.guardFor > 0.1 || ai.atkCd > 0 || R.hitT > 0.2) return;
  if (tut && tutStep !== 'block' && tutStep !== 'knock') return;
  let tgt = null, side = 0, best = 0;
  for (let sd = -1; sd <= 1; sd += 2) {
    const o = inRange(W, R, sd, 2.55, 2.3); if (!o) continue;
    let want = o.isPlayer ? 1 + grudgeOf(R.name) * 0.12 + (W.cfg.mode === 'grudge' ? 0.6 : 0) : 0.45;
    if (st === STYLES.clean && !(R.lastBy === o && W.t - R.lastHitT < 6)) want *= 0.25;
    if (want > best) { best = want; tgt = o; side = sd; }
  }
  if (!tgt) return;
  if (st !== STYLES.dirty && patrolNear(W, R.s, 90) && !tut) { ai.atkCd = 0.6; return; }
  const p = (tut ? 0.9 : st.atk * d.aggr * (R.aggr || 1)) * best * (1 + m.heat * 0.6) * (1 - m.cool * 0.7);
  const counter = R.counterT > 0 && Math.random() < st.counter;
  if (counter || Math.random() < p * dt * 3.2) {
    const kick = tut ? tutStep === 'block' : R.sta > 30 && (Math.random() < st.kick || (tgt.guard && Math.random() < 0.5));
    startAttack(W, R, kick ? 2 : 1, side);
    ai.atkCd = (0.35 + Math.random() * 0.9) / Math.max(0.3, tut ? 0.5 : st.atk) * (R.sta < 30 ? 2 : 1);
  }
}
function aiControl(W, R, dt) {
  const T = W.T, d = W.d, P = W.P;
  const ai = R.ai;
  const look = R.s + 10 + R.v * 0.55;
  let cAhead = 0; for (let k = 0; k < 4; k++) cAhead += curvAt(T, look + k * 6); cAhead /= 4;
  const m = ai.mind, human = !R.isPlayer && !R.bot, st = R.sty || STYLES.clean;
  if (human) { humanMind(W, R, dt, cAhead); aiCombat(W, R, dt); }
  ai.bias += ((Math.sin(W.t * 0.13 + R.idx * 1.7) * 1.4) - ai.bias) * dt * 0.5;
  let tx = clamp(cAhead * 160, -3.6, 3.6) + ai.bias;
  // the old bridge: some riders always take it, some sometimes, none on a bad day
  for (let q = 0; q < T.sc.length; q++) {
    const sc = T.sc[q], ds = sc.s0 - R.s;
    if (ds > 160 || ds < -2) { if (ai.scPlan === q && ds < -2) ai.scPlan = -1; continue; }
    if (ai.scPlan === -1 && ds > 120) ai.scPlan = (R.b.dirt || R.name === 'Tenzin Gale' ? 0.9 : human ? 0.35 : R.bot ? 0.5 : 0) > Math.random() ? q : -2;
    if (ai.scPlan === q && ds < 70) tx = sc.side * (HALF - 0.7);
  }
  // things to ride around: traffic, cows, oil, other riders
  let avoid = null, aDist = 1e9;
  const consider = (s, x, hw, hl, rel) => {
    const ds = s - R.s - hl;
    if (ds < -1 || ds > 26 + Math.max(0, rel) * 1.4) return;
    if (Math.abs(x - tx) < hw + 1.3 || Math.abs(x - R.x) < hw + 1.0) { if (ds < aDist) { aDist = ds; avoid = { x, hw }; } }
  };
  for (let i = 0; i < W.traffic.length; i++) { const v = W.traffic[i]; consider(v.s, v.x, v.k.hw, v.k.hl, R.v - v.v); }
  for (let i = 0; i < W.cows.length; i++) { const c = W.cows[i]; if (Math.abs(c.x) < 6) consider(c.s, c.x, c.goat ? 0.6 : 0.9, c.goat ? 0.8 : 1.2, R.v); }
  for (let i = 0; i < W.hazards.length; i++) { const h = W.hazards[i]; if (h.kind === 'oil') consider(h.s, h.x, h.rx, h.rs, R.v); }
  for (let i = 0; i < W.patrols.length; i++) { const p = W.patrols[i]; consider(p.s, p.x, 0.6, 1.2, R.v - p.v); }
  for (let i = 0; i < W.riders.length; i++) { const o = W.riders[i]; if (o !== R && !o.sc && (o.crash > 0 || o.dnf || o.v < R.v - 6)) consider(o.s, o.crash > 0 ? o.x : o.x, 0.6, 1.1, R.v - o.v); }
  // a person needs a moment to see a new hazard, unless it is right there
  if (human) { if (avoid) m.seen += dt; else m.seen = 0; if (avoid && m.seen < m.rx && aDist > 9) avoid = null; }
  if (avoid) {
    const l = avoid.x - avoid.hw - 1.5, rr = avoid.x + avoid.hw + 1.5;
    const lOk = l > -XW + 0.9, rOk = rr < XW - 0.9;
    tx = (lOk && (!rOk || Math.abs(l - R.x) < Math.abs(rr - R.x))) ? l : rOk ? rr : tx;
  }
  // a fight: ride up alongside a rider (or, for a road hog, right into them) and stay there
  ai.cd -= dt;
  if (W.tut && human) {
    // the coach rides alongside and waits for each lesson
    const sd = W.tut.step === 2 ? 1 : W.tut.step === 1 ? -1 : (R.x > P.x ? 1 : -1);
    tx = clamp(P.x + sd * 1.55, -XW + 1.2, XW - 1.2);
    if (W.tut.step === 1) tx = clamp(P.x - 1.55, -XW + 1.2, XW - 1.2);
  } else if (ai.barge && ai.bargeT) {
    const o = ai.bargeT;
    if (o.crash > 0 || o.dnf || o.sc || Math.abs(o.s - R.s) > 6) { ai.barge = 0; ai.bargeT = null; }
    else {
      ai.barge -= dt;
      tx = st.ram > 0.6 && ai.barge < 0.5 ? o.x - Math.sign(o.x - R.x || 1) * 0.7 : o.x - Math.sign(o.x - R.x || 1) * 1.5;
      if (ai.barge <= 0) { ai.barge = 0; ai.bargeT = null; }
    }
  } else if (ai.cd <= 0 && W.phase === 'racing' && R.crash <= 0 && human) {
    let tgt = null;
    for (let i = 0; i < W.riders.length; i++) {
      const o = W.riders[i]; if (o === R || o.crash > 0 || o.finished || o.invuln > 0 || o.dnf || o.sc) continue;
      if (Math.abs(o.s - R.s) < 4 && Math.abs(o.x - R.x) < 4) { if (!tgt || o.isPlayer) tgt = o; }
    }
    if (tgt) {
      const want = (tgt.isPlayer ? 1.2 + grudgeOf(R.name) * 0.1 : 0.35) * d.aggr * R.aggr * (st.atk * 0.7 + st.ram * 0.5) * m.temper * (1 + m.heat * 0.7) * (1 - m.cool * 0.8);
      if (Math.random() < want * 0.9) { ai.barge = 1.6 + Math.random(); ai.bargeT = tgt; }
      ai.cd = 0.9 + Math.random() * 1.2;
    }
  }
  if (human && m.errT > 0) tx += m.errDir * m.errK * Math.sin(Math.PI * (1 - m.errT / m.err));
  tx = clamp(tx, -XW + 1.0, XW - 1.0);
  ai.tx += (tx - ai.tx) * Math.min(1, dt * (human ? 0.66 / m.rx : 3));
  // speed: the bend ahead, pace and a gentle rubber band
  let vSafe = 1e9;
  const brakeLook = (R.v * R.v / 26 + 8) * (human ? m.brk : 1);
  for (let k = 0; k <= 5; k++) vSafe = Math.min(vSafe, T.VS[rowOf(T, R.s + brakeLook * k / 5)]);
  if (W.wet) vSafe *= 0.93;
  let pace = (R.pace || 1) * d.pace * W.lv.pace;
  if (!R.isPlayer && !W.attract) {
    const gap = R.s - P.s;
    if (gap < -70) pace += d.band; else if (gap > 110) pace -= d.band * 0.8;
  }
  if (R.bot) pace = 0.97;
  if (human) pace *= m.form * (1 + m.heat * 0.012 - m.cool * 0.025) * (m.errT > 0 ? 0.93 : 1);
  let vt = Math.min(R.top * pace, vSafe * (0.93 + 0.06 * (R.pace || 1)) * (human ? 1 + (1 - m.brk) * 0.12 : 1));
  if (W.tut && human) vt = Math.max(8, P.v + (P.s - R.s) * 0.8);
  const push = R.v * R.v * curvAt(T, R.s) * CENT * R.grip;
  const steer = clamp(((ai.tx - R.x) * 1.4 + push - R.vx * 0.2) / R.steerMax, -1, 1);
  let nit = false;
  if (R.nitro > 40 && W.phase === 'racing' && vSafe > R.v + 10 && Math.abs(cAhead) < 0.004 && !W.tut) ai.nitroT = 1.8;
  if (ai.nitroT > 0) { ai.nitroT -= dt; nit = true; }
  return { steer, gas: R.v < vt, brake: R.v > vt + 2.5, nit, atk: 0, guard: R.guardIn };
}

/* ------------------------------------------------------------ fighting */
function startAttack(W, R, k, side) {
  if (!k || !side || R.crash > 0 || R.atkK || R.stagger > 0 || R.atkCd > 0 || R.sc || R.finished || R.dnf || W.phase !== 'racing') return false;
  const A = ATK[k], tired = R.sta < A.sta;
  R.atkK = k; R.atkSide = side; R.atkT = 0; R.atkDone = false; R.atkPow = tired ? 0.5 : 1;
  R.atkDur = A.dur * (tired ? 1.25 : 1); R.atkHitAt = A.hit * (tired ? 1.2 : 1); R.atkId = ++W.atkSeq;
  R.sta = Math.max(0, R.sta - A.sta); R.staT = 0; R.guard = false; R.lastSide = side;
  if (k === 2) R.stats.kicks++; else { R.stats.punches++; if (side < 0) R.stats.punchL++; else R.stats.punchR++; }
  if (R.isPlayer) {
    noise(k === 2 ? 0.2 : 0.1, { filter: 'bandpass', freq: k === 2 ? 650 : 1400, vol: 0.13 });
    if (tired) pop(W, 'Tired', 'Let your stamina refill', DIM);
  } else {
    const P = W.P;
    if (P && P.crash <= 0 && Math.abs(R.s - P.s) < 3.2 && (P.x - R.x) * side > 0.2 && (P.x - R.x) * side < A.rx + 0.3) {
      W.tele = { R, k, t: R.atkHitAt, d: R.atkHitAt };
      tone(k === 2 ? 480 : 760, 0.07, { type: 'triangle', vol: 0.06 });
    }
  }
  return true;
}
function resolveHit(W, A) {
  A.atkDone = true;
  const K = A.atkK, D = ATK[K], side = A.atkSide;
  if (W.tele && W.tele.R === A) W.tele = null;
  const o = inRange(W, A, side, D.rx, D.rs);
  if (!o) { A.vx += side * (K === 2 ? 1.4 : 0.8); A.combo = 0; if (A.isPlayer) pop(W, 'Whiff', 'Nobody in reach', DIM); return; }
  let mult = A.atkPow, tag = '';
  if (o.atkK && !o.atkDone) { mult *= 1.4; o.atkK = 0; o.atkDone = true; tag = 'Counter!'; }
  if (A.counterT > 0) { mult *= 1.5; A.counterT = 0; tag = tag || 'Punished!'; }
  A.combo = A.comboT > 0 ? A.combo + 1 : 1; A.comboT = 1.1;
  if (A.combo >= 3) { mult *= 1 + 0.12 * Math.min(4, A.combo - 2); tag = tag || A.combo + ' hit combo!'; if (A.combo === 3) say(W, A.isPlayer ? 'comboP' : 'combo', A.name); }
  const d = W.d;
  if (A.isPlayer) mult *= d.dealt;
  if (W.tut && !A.isPlayer) mult *= 0.4;
  if (o.isPlayer) mult *= d.taken;
  mult *= (0.85 + 0.3 * A.b.wgt) / (0.85 + 0.3 * o.b.wgt) * (1 - 0.07 * o.arm);
  let dmg = (D.bal[0] + Math.random() * (D.bal[1] - D.bal[0])) * mult;
  const pl = A.isPlayer || o.isPlayer;
  // the guard: raised just in time it turns the blow back (a parry), otherwise it soaks most of it
  if (o.guard) {
    if (o.guardT < PARRY_WINDOW) {
      A.stagger = 0.7; A.wob = Math.max(A.wob, 0.7); A.vx -= side * 2.2; A.combo = 0;
      o.counterT = 0.85; o.sta = Math.min(100, o.sta + 10); o.stats.parries++;
      clashFx(W, A, o, 0.5);
      if (pl) { pop(W, 'Parry!', o.isPlayer ? 'Hit back now' : o.name + ' read it', TEAL, true); noise(0.15, { filter: 'highpass', freq: 2400, vol: 0.2 }); tone(1180, 0.12, { type: 'triangle', vol: 0.1 }); ARC.haptic('hit', 0.6); }
      if (pl) say(W, o.isPlayer ? 'parryP' : 'parry', o.name);
      emote(o, 'fist', 0.8);
      return;
    }
    o.sta -= K === 2 ? 18 : 8; o.stats.blocks++;
    if (o.sta <= 0) { o.sta = 0; o.guard = false; o.guardBreak = 0.9; dmg *= 0.6; tag = 'Guard broken!'; }
    else {
      dmg *= K === 2 ? 0.35 : 0.12; A.stagger = K === 2 ? 0.12 : 0.28; A.combo = 0;
      o.bal = Math.max(1, o.bal - dmg); o.balT = 0; o.vx += side * (K === 2 ? 2.2 : 1.1); o.wob = Math.max(o.wob, 0.18);
      clashFx(W, A, o, 0.3);
      if (pl) { pop(W, 'Blocked', o.isPlayer ? 'Guard held' : o.name + ' covers up', DIM); noise(0.09, { freq: 900, vol: 0.16 }); ARC.haptic('tap', 0.5); }
      return;
    }
  }
  o.bal -= dmg; o.balT = 0; o.hitT = 0.38; o.hitSide = side;
  o.vx += side * D.push * (0.6 + dmg / 30); o.wob = Math.max(o.wob, 0.25 + dmg / 70);
  o.lastBy = A; o.lastHitT = W.t; A.lastHit = o.lastHit = W.t;
  if (K === 2) o.dmg = Math.min(99, o.dmg + D.bike * (1 - 0.16 * o.arm));
  A.stats.shoves++; o.stats.taken++;
  if (o.ai && o.ai.mind) o.ai.mind.heat = Math.min(1, o.ai.mind.heat + 0.4);
  noticeFight(W, A);
  const edge = Math.abs(o.x) > HALF - 0.5 && Math.sign(o.x) === side;
  if (o.bal <= 0 || (K === 2 && edge && dmg > 24 && Math.random() < 0.6)) { knockOff(W, A, o, side, tag); return; }
  clashFx(W, A, o, K === 2 ? 0.8 : 0.55);
  if (A.isPlayer) { addNitro(A, K === 2 ? 12 : 7); pop(W, tag || (K === 2 ? 'Kick!' : 'Punch!'), o.name + ' reels', GOLD); ARC.shake = Math.max(ARC.shake, K === 2 ? 5 : 3); ARC.haptic('hit', K === 2 ? 0.75 : 0.5); }
  if (o.isPlayer) { pop(W, tag || (K === 2 ? 'Kicked!' : 'Hit!'), 'by ' + A.name, '#e8452c'); ARC.shake = Math.max(ARC.shake, K === 2 ? 7 : 4.5); ARC.haptic('hit', K === 2 ? 0.95 : 0.7); }
  if (pl) { noise(K === 2 ? 0.2 : 0.12, { freq: K === 2 ? 520 : 800, vol: 0.26 }); tone(K === 2 ? 110 : 150, 0.12, { type: 'square', vol: 0.1, slide: 70 }); }
}
function knockOff(W, A, o, side, tag) {
  A.stats.knocks++;
  crash(W, o, side, 'knock');
  o.rvx = side * 7; o.vx = side * 4;
  addNitro(A, 26);
  clashFx(W, A, o, 1);
  if (VFX && R3 && Math.abs(o.s - W.P.s) < 70) { posAt(W.T, o.s, o.x, 0.9, V); _vq.set(V.x, V.y, V.z); VFX.impact(_vq, _up, { kind: 'dust', size: 1.4, color: W.T.look.dirt }); }
  if (A.isPlayer) {
    pop(W, tag || 'Knocked off!', o.name + ' takes a tumble', ORANGE, true);
    if (!ARC.reducedMotion) W.slowT = 0.75;
    ARC.shake = Math.max(ARC.shake, 9); ARC.haptic('heavy', 0.75);
    if (POST) { POST.flash(0.18, '#ffd8b8'); POST.kick(-4); }
    addGrudge(o.name, 1); emote(o, 'shake', 2);
    say(W, 'knockP', 'You', o.name);
    markClip(W, 'knock', o, A);
  } else if (o.isPlayer) {
    ARC.haptic('heavy', 1);
    pop(W, 'Knocked off!', A.name + ' got you', ORANGE, true);
    addGrudge(A.name, 0.5); emote(A, 'fist', 1.4);
    say(W, 'knocked', A.name);
    markClip(W, 'knock', o, A);
  } else if (Math.abs(o.s - W.P.s) < 90) say(W, 'knockR', A.name, o.name);
  if (A.isPlayer || o.isPlayer) { noise(0.3, { freq: 600, vol: 0.3 }); tone(100, 0.2, { type: 'square', vol: 0.12, slide: 50 }); }
}
function stepCombat(W, R, dt) {
  if (R.atkCd > 0) R.atkCd -= dt;
  if (R.stagger > 0) R.stagger -= dt;
  if (R.hitT > 0) R.hitT -= dt;
  if (R.counterT > 0) R.counterT -= dt;
  if (R.comboT > 0) { R.comboT -= dt; if (R.comboT <= 0) R.combo = 0; }
  if (R.guardBreak > 0) R.guardBreak -= dt;
  if (R.guardLatch > 0) R.guardLatch -= dt;
  if (R.atkK) {
    R.atkT += dt;
    if (!R.atkDone && R.atkT >= R.atkHitAt) resolveHit(W, R);
    if (R.atkT >= R.atkDur) { R.atkK = 0; R.atkCd = 0.08; }
  }
  const want = R.guardIn && !R.atkK && R.stagger <= 0 && R.guardBreak <= 0 && R.sta > 1 && W.phase === 'racing' && !R.sc;
  if (want) { if (!R.guard) { R.guard = true; R.guardT = 0; } else R.guardT += dt; R.sta = Math.max(0, R.sta - 5 * dt); R.staT = 0; }
  else R.guard = false;
  R.staT += dt; R.balT += dt;
  if (R.staT > 0.55) R.sta = Math.min(100, R.sta + (R.sta < 25 ? 22 : 17) * dt);
  if (R.balT > 2.4) R.bal = Math.min(100, R.bal + 7 * dt);
  // the coach never falls before the last lesson
  if (W.tut && !R.isPlayer && TUT[W.tut.step] && TUT[W.tut.step].id !== 'knock') R.bal = Math.max(R.bal, 45);
}

const addNitro = (R, n) => { R.nitro = Math.min(R.nCap || 100, R.nitro + n); };

function crash(W, R, dir, kind) {
  if (R.crash > 0 || R.finished || R.sc || R.dnf) return;
  R.crash = 1; R.crashT = 0; R.crashPh = 0; R.phT = 0; R.crashDur = 4; R.crashDir = dir || (R.x < 0 ? -1 : 1);
  R.crashKind = kind; R.crashSpin = (Math.random() - 0.5) * 2.5; R.nitroOn = false; R.atkK = 0; R.guard = false; R.wob = 0; R.stats.crashes++;
  R.crashV = R.v; R.rd = 0; R.rx = R.x; R.rv = R.v * 0.9 + 2; R.rvx = R.crashDir * (2.5 + Math.random() * 2) + R.vx * 0.3; R.runBoost = 0;
  R.dmg = Math.min(100, R.dmg + (CRASH_DMG[kind] || 10) * (1 - 0.16 * R.arm) * (R.isPlayer ? W.d.taken : 1));
  if (R.ai && R.ai.mind) { R.ai.mind.cool = 1; R.ai.mind.heat = 0; R.ai.mind.errT = 0; }
  emote(R, 'crash', 3);
  if (R.dmg >= 100) {
    if (R.isPlayer && !W.attract && W.phase === 'racing') {
      W.wrecked = true; W.phase = 'wrecked'; W.bustT = 0;
      pop(W, 'Wrecked!', 'The bike is done for today', ORANGE, true); say(W, 'wreck', 'You'); markClip(W, 'wreck', R, R.lastBy && W.t - R.lastHitT < 3 ? R.lastBy : null);
    } else if (!R.isPlayer) { R.dnf = true; R.out = 'wrecked'; if (Math.abs(R.s - W.P.s) < 150) say(W, 'wreckR', R.name); }
  }
  if (R.isPlayer) {
    ARC.shake = Math.max(ARC.shake, 12); ARC.haptic('heavy', 1);
    if (POST) { POST.flash(0.3, '#ffe0c8'); POST.kick(-6); }
    noise(0.7, { freq: 500, vol: 0.32 }); tone(160, 0.5, { type: 'sawtooth', slide: 40, vol: 0.12 });
    if (!W.attract && W.phase === 'racing') {
      // a reckless wipeout in sight of a patrol ends the race, and so does any wipeout while they chase you
      const reckless = kind === 'traffic' || kind === 'wall' || kind === 'cow' || kind === 'goat' || kind === 'patrol';
      for (let i = 0; i < W.patrols.length; i++) {
        const p = W.patrols[i];
        if (p.down > 0) continue;
        if ((p.chase && p.tgt === R && Math.abs(p.s - R.s) < 60) || (reckless && Math.abs(p.s - R.s) < 65)) { bust(W, R, p); break; }
      }
      if (!W.busted && !W.wrecked && kind !== 'knock') pop(W, 'Wipeout!', 'Run back to your bike', ORANGE);
      if (!W.busted && kind !== 'knock') markClip(W, 'crash', R, null);
    }
  }
  crashFx(W, R);
}

/* ------------------------------------------------------------ the old bridge shortcuts */
// At some hairpins an old trestle bridge leaves the road on the inside of the bend and rejoins it on the
// way out. Hug the inside edge at the sign to take it: a rough plank deck, slower than the road, but far
// shorter than the hairpin. No traffic, no patrol, and nobody can reach you to fight while you are on it.
function scPoint(sc, u, out) {
  out.x = lerp(sc.ax, sc.bx, u); out.z = lerp(sc.az, sc.bz, u);
  out.y = lerp(sc.ay, sc.by, u) + Math.sin(Math.PI * u) * sc.hump;
  return out;
}
function enterShortcut(W, R) {
  const T = W.T;
  for (let q = 0; q < T.sc.length; q++) {
    const sc = T.sc[q];
    if (R.s < sc.s0 - 3 || R.s > sc.s0 + 4 || R.x * sc.side < HALF - 1.7 || R.crash > 0 || R.v < 6) continue;
    R.sc = sc; R.scU = 0; R.atkK = 0; R.guard = false; R.stats.bridges++;
    if (R.isPlayer) { pop(W, 'Old bridge!', 'The shortcut', '#44ffa8', true); ARC.haptic('boost', 0.4); say(W, 'bridgeP'); }
    else if (Math.abs(R.s - W.P.s) < 80) say(W, 'bridge', R.name);
    return;
  }
}
function stepShortcut(W, R, dt, gas, brake) {
  const sc = R.sc, top = R.b.dirt ? 30 : 24;
  let a = gas ? R.acc * 0.7 : -1.5;
  if (brake) a -= 12;
  if (R.v > top) a -= (R.v - top) * 2.2;
  R.v = Math.max(4, R.v + a * dt);
  R.scU += R.v * dt / sc.len;
  R.s = sc.s0 + clamp(R.scU, 0, 1) * (sc.s1 - sc.s0);
  R.x = sc.side * HALF; R.vx = 0; R.lean += (0 - R.lean) * Math.min(1, dt * 6);
  R.wobPh += dt * 23; R.wob = Math.max(R.wob, R.b.dirt ? 0.05 : 0.12);
  R.wheel += R.v * dt / 0.32;
  if (R.isPlayer && Math.random() < dt * 6) ARC.shake = Math.max(ARC.shake, 1.2);
  if (R.scU >= 1) { R.sc = null; R.scU = 0; R.s = sc.s1 + 0.5; R.x = sc.side * (HALF - 0.9); R.vx = -sc.side * 1.2; R.invuln = Math.max(R.invuln, 0.4); R.wob = 0.3; }
}

/* ------------------------------------------------------------ one rider, one step */
function stepRider(W, R, dt) {
  const T = W.T, live = W.phase === 'racing' || W.phase === 'finished' || W.phase === 'busted' || W.phase === 'wrecked';
  R.wheel += R.v * dt / 0.32;
  if (R.invuln > 0) R.invuln -= dt;
  // out of the race: pulled over by the patrol, or a wrecked bike left at the roadside
  if (R.dnf && R.out === 'busted') { R.v = Math.max(0, R.v - 14 * dt); R.s += R.v * dt; R.x += (Math.sign(R.x || 1) * 6.4 - R.x) * Math.min(1, dt * 1.5); R.lean *= Math.exp(-4 * dt); return; }
  if (R.crash > 0) { stepCrash(W, R, dt); return; }
  stepCombat(W, R, dt);
  const inp = !live || R.react > 0 || (W.phase === 'finished' && !R.isPlayer && R.finished) ? null
    : (R.isPlayer && !R.bot && !W.attract && W.phase === 'racing') ? readInput(W, R, dt) : aiControl(W, R, dt);
  if (R.react > 0 && live) R.react -= dt;
  let steer = 0, gas = false, brake = false, nit = false;
  if (inp) {
    steer = inp.steer; gas = inp.gas; brake = inp.brake; nit = inp.nit;
    if (R.isPlayer) {
      // a blow pressed while busy waits a moment and goes as soon as it can (a short input buffer)
      R.guardIn = !!inp.guard;
      if (inp.atk) R.buf = { k: inp.atk, side: inp.side, t: 0.45 };
      if (R.buf) { if (startAttack(W, R, R.buf.k, R.buf.side)) R.buf = null; else if ((R.buf.t -= dt) <= 0) R.buf = null; }
    }
  } else R.guardIn = false;
  if (R.finished) { gas = false; brake = R.v > 12; steer = clamp(-R.x * 0.3 - R.vx * 0.2, -1, 1); }
  if (R.isPlayer && (W.busted || W.wrecked)) { gas = false; brake = R.v > 3; nit = false; }
  if (W.phase === 'grid' && R.isPlayer && !W.attract) { const ii = ARC.input; R.thr += ((ii.down('ArrowUp', 'KeyW') || ARC.touchMode || W.cfg.gas === 'auto' ? 1 : 0) - R.thr) * Math.min(1, dt * 6); }
  R.brakeIn = brake;
  if (R.brLatch > 0) R.brLatch -= dt;
  if (R.nLatch > 0) R.nLatch -= dt;
  if (W.phase !== 'grid' && W.phase !== 'intro') R.thr += ((gas ? 1 : 0) - R.thr) * Math.min(1, dt * 7);
  if (R.sc) { stepShortcut(W, R, dt, gas, brake); return; }
  if (R.guard) steer *= 0.65;
  // nitro
  if (live && W.phase === 'racing' && nit && R.nitro > 0 && R.v > 8 && !R.finished) {
    if (!R.nitroOn && R.isPlayer) { ARC.haptic('boost', 0.9); if (POST) POST.kick(5); noise(0.7, { filter: 'highpass', freq: 900, vol: 0.24 }); tone(240, 0.5, { type: 'sawtooth', slide: 900, vol: 0.09 }); }
    R.nitroOn = true;
  } else R.nitroOn = false;
  if (R.nitroOn) { R.nitro = Math.max(0, R.nitro - 30 * dt); if (R.nitro <= 0) { R.nitroOn = false; R.nLatch = 0; } }
  // slipstream: tucked in behind a rider or a truck
  let draft = 0;
  if (W.phase === 'racing' && R.v > 18) {
    for (let i = 0; i < W.riders.length; i++) { const o = W.riders[i]; if (o === R || o.crash > 0 || o.sc) continue; const ds = o.s - R.s; if (ds > 2.5 && ds < 16 && Math.abs(o.x - R.x) < 1.2) draft = Math.max(draft, 1 - ds / 18); }
    for (let i = 0; i < W.traffic.length; i++) { const o = W.traffic[i]; if (o.dir < 0) continue; const ds = o.s - o.k.hl - R.s; if (ds > 1 && ds < 20 && Math.abs(o.x - R.x) < o.k.hw + 0.3) draft = Math.max(draft, 1 - ds / 22); }
  }
  R.draft += (draft - R.draft) * Math.min(1, dt * 3);
  if (R.draft > 0.3) addNitro(R, 5 * R.draft * dt * (1 + 0.2 * R.up.nos));
  // speed: a battered bike loses a little top end
  const top = R.top * (1 + 0.07 * R.draft) * (R.nitroOn ? 1.24 : 1) * (R.gravel > 0 ? (R.b.dirt ? 0.92 : 0.78) : 1) * (1 - 0.12 * R.dmg / 100);
  if (W.phase === 'grid' || W.phase === 'intro') { R.v = 0; }
  else {
    let a = 0;
    if (gas) a += R.acc * (R.nitroOn ? 1.6 : 1) * Math.max(0.08, 1 - Math.pow(R.v / top, 2));
    if (brake) a -= 17 * (1 - 0.18 * W.wet);
    a -= 0.02 * R.v + (gas ? 0 : 1.2);
    if (R.v > top) a -= (R.v - top) * 1.5;
    R.v = Math.max(0, R.v + a * dt);
  }
  // shoulder and patches
  const onShoulder = Math.abs(R.x) > HALF + 0.2;
  if (onShoulder && R.v > 14) { R.v -= R.v * (R.b.dirt ? 0.25 : 0.5) * dt; if (Math.random() < dt * 25) dustAt(W, R, 1); }
  R.onShoulder = onShoulder;
  if (R.gravel > 0) R.gravel -= dt;
  if (R.oil > 0) R.oil -= dt;
  for (let i = 0; i < W.hazards.length; i++) {
    const h = W.hazards[i], ds = (R.s - h.s) / h.rs, dx = (R.x - h.x) / h.rx;
    if (ds * ds + dx * dx < 1) {
      if (h.kind === 'oil') { if (R.oil <= 0) { R.oil = 0.9; R.wob = Math.max(R.wob, (0.5 + Math.abs(R.lean)) * (1 - 0.12 * R.up.tyre)); if (R.isPlayer) { pop(W, 'Oil!', 'Keep it straight', DIM); noise(0.3, { filter: 'highpass', freq: 2000, vol: 0.1 }); } } }
      else { R.gravel = 0.5; if (Math.random() < dt * 30) gravelAt(W, R); if (R.isPlayer && R.wob < 0.2 && R.v > 25 && !R.b.dirt) { R.wob = 0.35; ARC.shake = Math.max(ARC.shake, 2.5); } }
    }
  }
  // lateral
  const grip = R.oil > 0 ? 0.25 : 1;
  const lowSp = clamp(R.v / 13, 0.3, 1);
  const sTarget = steer * R.steerMax * lowSp;
  R.vx += (sTarget - R.vx) * Math.min(1, dt * 6 * grip);
  const curv = curvAt(T, R.s);
  const push = R.v * R.v * curv * CENT * R.grip * (R.oil > 0 ? 1.5 : 1) * (1 + 0.15 * W.wet);
  if (R.wob > 0) { R.wob = Math.max(0, R.wob - dt); R.wobPh += dt * 17; R.vx += Math.sin(R.wobPh) * R.wob * 9 * dt; }
  R.s += R.v * dt;
  R.x += (R.vx - push) * dt;
  // footpeg scrape in hard corners
  const leanT = clamp(Math.atan2(R.v * R.v * curv, 9.8) * 0.95 + steer * 0.2 + R.vx * 0.015, -0.86, 0.86);
  R.lean += (leanT - R.lean) * Math.min(1, dt * 7);
  R.peg = Math.abs(R.lean) > 0.6 && R.v > 15 ? Math.abs(R.lean) - 0.56 : 0;
  if (R.peg > 0 && Math.random() < dt * 40 * R.peg) pegSparks(W, R);
  // the barrier: guard stones, rock wall or hedge (with a gap where an old bridge leaves the road)
  if (Math.abs(R.x) > XW) {
    const side = Math.sign(R.x), out = (R.vx - push) * side;
    const k = side > 0 ? T.KR[rowOf(T, R.s)] : T.KL[rowOf(T, R.s)];
    if ((out > 6.2 || (out > 4 && R.v > 36)) && R.invuln <= 0) { crash(W, R, side, 'wall'); R.vx = -side * 1; R.x = side * XW; }
    else {
      R.x = side * XW; R.vx = -side * Math.max(1.2, Math.abs(R.vx) * 0.3); R.v *= Math.exp(-1.1 * dt);
      R.scrape = 0.2; R.wob = Math.max(R.wob, 0.2); R.dmg = Math.min(99, R.dmg + 2.5 * dt * (1 - 0.16 * R.arm));
      scrapeFx(W, R, side, k);
      if (R.isPlayer) { ARC.shake = Math.max(ARC.shake, 2.2); if (Math.random() < dt * 12) noise(0.08, { filter: 'highpass', freq: 2400, vol: 0.12 }); }
    }
  }
  if (R.scrape > 0) R.scrape -= dt;
  // big wobble at speed can throw a rider
  if (R.wob > 1.25 && R.v > 22 && Math.random() < dt * 1.5) crash(W, R, Math.sign(R.vx) || 1, 'wobble');
  if (W.phase === 'racing' && T.sc.length) enterShortcut(W, R);
}

// Thrown off: the rider flies on and tumbles, the bike slides and stops sooner. The rider sits up,
// shakes it off, then runs back to the bike (mash a key or tap to run faster), climbs on and goes.
function stepCrash(W, R, dt) {
  R.crashT += dt; R.phT += dt;
  R.atkK = 0; R.guard = false;
  if (R.staT > 0.5) R.sta = Math.min(100, R.sta + 12 * dt);
  // the bike
  R.v *= Math.exp(-3.0 * dt); R.vx *= Math.exp(-2.2 * dt);
  R.s += R.v * dt; R.x += R.vx * dt;
  if (Math.abs(R.x) > XW + 0.2) { R.x = Math.sign(R.x) * (XW + 0.2); R.vx = -R.vx * 0.2; }
  R.lean += ((R.crashDir > 0 ? 1.45 : -1.45) - R.lean) * Math.min(1, dt * 8);
  // the rider
  if (R.crashPh === 0) {
    R.rv *= Math.exp(-1.5 * dt); R.rvx *= Math.exp(-1.8 * dt);
    R.rd += (R.rv - R.v) * dt; R.rx += R.rvx * dt;
    if (Math.abs(R.rx) > XW - 0.2) { R.rx = Math.sign(R.rx) * (XW - 0.2); R.rvx = -R.rvx * 0.3; }
    if (R.crashT > 1.05) { R.crashPh = 1; R.phT = 0; R.dazed = R.isPlayer ? 0.7 : 0.55 + Math.random() * 0.5; }
  } else if (R.crashPh === 1) {
    if (R.dnf || (R.isPlayer && W.wrecked)) return;   // a wrecked bike: the rider sits by it, out of the race
    if (R.phT > R.dazed) { R.crashPh = 2; R.phT = 0; R.rd0 = Math.max(1, Math.hypot(R.rd, R.x - R.rx)); }
  } else if (R.crashPh === 2) {
    if (R.runBoost > 0) R.runBoost = Math.max(0, R.runBoost - dt * 1.2);
    R.runV = (R.isPlayer ? 5.6 : 4.9 + (R.idx % 3) * 0.4) + 2.8 * clamp(R.runBoost, 0, 1);
    const dx = R.x - R.rx, dd = Math.hypot(R.rd, dx), step = R.runV * dt;
    if (dd <= step + 0.55) { R.crashPh = 3; R.phT = 0; }
    else { R.rd -= R.rd / dd * step; R.rx += dx / dd * step; }
  } else if (R.phT > 0.5) {
    R.crash = 0; R.crashT = 0; R.crashPh = 0; R.v = 4; R.vx = 0; R.lean = 0; R.invuln = 1.4; R.rd = 0;
    R.x = clamp(R.x, -HALF + 1.2, HALF - 1.2); R.bal = Math.max(R.bal, 60); R.sta = Math.max(R.sta, 50);
    if (R.isPlayer && !W.attract) pop(W, 'Back on!', '', '#44ffa8');
  }
  R.crashDur = R.crashT + (R.crashPh === 0 ? 3 : R.crashPh === 1 ? 2 : R.crashPh === 2 ? Math.hypot(R.rd, R.x - R.rx) / Math.max(1, R.runV) + 0.5 : 0.5 - R.phT);
}

/* ------------------------------------------------------------ contact between everything */
function contacts(W, dt) {
  const rs = W.riders, T = W.T;
  for (let i = 0; i < rs.length; i++) {
    const A = rs[i]; if (A.crash > 0 || A.sc || A.dnf) continue;
    for (let j = i + 1; j < rs.length; j++) {
      const B = rs[j]; if (B.crash > 0 || B.sc || B.dnf) continue;
      const ds = B.s - A.s, dx = B.x - A.x;
      if (Math.abs(ds) < 1.9 && Math.abs(dx) < 0.78) {
        const back = ds > 0 ? A : B, front = ds > 0 ? B : A;
        const sd = dx >= 0 ? 1 : -1;
        A.vx -= sd * 3; B.vx += sd * 3; A.x -= sd * 0.25 * dt * 10; B.x += sd * 0.25 * dt * 10;
        if (back.v > front.v + 3 && Math.abs(ds) > 1.1) { back.v = front.v - 1; back.wob = Math.max(back.wob, 0.6); front.wob = Math.max(front.wob, 0.3); }
        else { A.wob = Math.max(A.wob, 0.25); B.wob = Math.max(B.wob, 0.25); }
        A.lastHit = B.lastHit = W.t;
        if ((A.isPlayer || B.isPlayer) && W.t - (W.bumpSnd || 0) > 0.3) { W.bumpSnd = W.t; noise(0.1, { freq: 600, vol: 0.18 }); ARC.shake = Math.max(ARC.shake, 2); }
      }
    }
  }
  for (let i = 0; i < rs.length; i++) {
    const R = rs[i]; if (R.crash > 0 || R.invuln > 0 || R.sc || R.dnf) continue;
    for (let j = 0; j < W.traffic.length; j++) {
      const v = W.traffic[j], ds = v.s - R.s, dx = v.x - R.x;
      if (Math.abs(ds) < v.k.hl + 0.9 && Math.abs(dx) < v.k.hw + 0.32) {
        const rel = R.v - v.v;
        if (rel > 5) { crash(W, R, dx > 0 ? -1 : 1, 'traffic'); R.v = Math.max(v.v, 0) * 0.6; if (R.isPlayer) honk(v); }
        else { R.v = Math.min(R.v, Math.max(0, v.v) - 0.5); R.vx -= Math.sign(dx || 1) * 2; R.wob = Math.max(R.wob, 0.4); R.dmg = Math.min(99, R.dmg + 3 * dt); }
      }
      // horns at riders tucked in behind or racing head-on
      if (R.isPlayer && v.horn <= 0 && ((v.dir < 0 && ds > 0 && ds < 70 && Math.abs(dx) < 2.4) || (v.dir > 0 && ds > 0 && ds < 14 && Math.abs(dx) < 1.6))) honk(v);
    }
    for (let j = 0; j < W.cows.length; j++) {
      const c = W.cows[j], ds = c.s - R.s, dx = c.x - R.x, hl = c.goat ? 0.9 : 1.5, hw = c.goat ? 0.6 : 0.95;
      if (Math.abs(ds) < hl && Math.abs(dx) < hw && R.v > 6) {
        crash(W, R, dx > 0 ? -1 : 1, c.goat ? 'goat' : 'cow'); R.v *= c.goat ? 0.6 : 0.4;
        if (c.moo <= 0) {
          c.moo = 2; if (c.goat) { c.walk = c.walk || 1; c.x += Math.sign(c.x || 1) * 0.8; }
          if (R.isPlayer || Math.abs(c.s - W.P.s) < 60) (c.goat ? baa : moo)();
          if (R.isPlayer) pop(W, c.goat ? 'Baa!' : 'Moo!', c.goat ? 'The goat is fine. Your pride is not.' : 'The cow is fine. You are not.', '#f5efe3');
        }
      }
    }
    for (let j = 0; j < W.patrols.length; j++) {
      const p = W.patrols[j], ds = p.s - R.s, dx = p.x - R.x;
      if (p.down > 0) continue;
      if (Math.abs(ds) < 1.8 && Math.abs(dx) < 0.85) {
        if (R.v - p.v > 6) crash(W, R, dx > 0 ? -1 : 1, 'patrol');
        else { R.v = Math.min(R.v, p.v); R.vx -= Math.sign(dx || 1) * 2; }
      }
    }
  }
  // a chasing patrol rider can meet the traffic too
  for (let j = 0; j < W.patrols.length; j++) {
    const p = W.patrols[j]; if (!p.chase || p.down > 0) continue;
    for (let k = 0; k < W.traffic.length; k++) {
      const v = W.traffic[k];
      if (Math.abs(v.s - p.s) < v.k.hl + 0.9 && Math.abs(v.x - p.x) < v.k.hw + 0.35 && p.v - v.v > 6) { p.down = 3.5; honk(v); endChase(W, p, 'crash'); break; }
    }
  }
}
function honk(v) { v.horn = 3; tone(392, 0.32, { type: 'square', vol: 0.06 }); tone(330, 0.32, { type: 'square', vol: 0.05 }); }
function moo() { tone(150, 0.7, { type: 'sawtooth', slide: 115, vol: 0.12 }); tone(110, 0.7, { type: 'triangle', slide: 95, vol: 0.1 }); }
function baa() { tone(420, 0.45, { type: 'sawtooth', slide: 360, vol: 0.08 }); tone(300, 0.45, { type: 'triangle', slide: 280, vol: 0.06, delay: 0.05 }); }

/* ------------------------------------------------------------ passes, positions, the finish */
function passes(W) {
  const P = W.P;
  if (W.phase !== 'racing' || P.crash > 0) return;
  for (let i = 0; i < W.riders.length; i++) {
    const o = W.riders[i]; if (o === P) continue;
    const ahead = o.s > P.s, was = P.pass[o.idx];
    if (was === true && !ahead && o.crash <= 0 && !o.dnf) {
      if (Math.abs(o.x - P.x) < 3.6 && W.t - P.lastHit > 1.2) { P.stats.passes++; addNitro(P, 10); pop(W, 'Clean pass', o.name, '#44ffa8'); tone(880, 0.07, { type: 'triangle', vol: 0.08 }); if (Math.random() < 0.5) emote(P, 'fist', 0.8); }
      if (o.ai && o.ai.mind) { o.ai.mind.heat = 1; emote(o, 'shake', 1.1); }
    }
    else if (was === false && ahead && o.crash <= 0 && Math.abs(o.x - P.x) < 4) emote(o, 'fist', 1.1);
    P.pass[o.idx] = ahead;
  }
  for (let i = 0; i < W.traffic.length; i++) {
    const v = W.traffic[i], k = 't' + i;
    const ahead = v.s > P.s, was = P.pass[k];
    if (was === true && !ahead && Math.abs(v.x - P.x) < v.k.hw + 1.4 && P.v > 18) {
      P.stats.near++; addNitro(P, 6); pop(W, 'Close call', v.dir < 0 ? 'Oncoming ' + v.kind : 'Past the ' + v.kind, GOLD);
      if (v.dir < 0 && Math.random() < 0.3) say(W, 'traffic');
    }
    P.pass[k] = ahead;
  }
  // a new leader gets a mention
  if (W.riders.length > 2 && W.t > 4 && (W.leadT = (W.leadT || 0) + 1) % 25 === 0) {
    const L = order(W)[0];
    if (L !== W.leader) { if (W.leader) say(W, L.isPlayer ? 'leadP' : 'lead', L.name); W.leader = L; }
  }
}

const rankS = (R) => (R.dnf ? -1e6 + R.s : R.s);
function order(W) {
  return W.riders.slice().sort((a, b) => (a.finished && b.finished ? a.finT - b.finT : a.finished ? -1 : b.finished ? 1 : rankS(b) - rankS(a)));
}
const positionOf = (W, R) => order(W).indexOf(R) + 1;
// the finishing order with everyone still out on the road placed by their pace (pure: changes nothing)
function finalOrder(W) {
  const T = W.T;
  const list = W.riders.map((r) => ({ r, t: r.finished ? r.finT : r.dnf || (W.busted && r.isPlayer) || (W.wrecked && r.isPlayer) ? 1e9 + r.idx : W.t + Math.max(0, T.finishS - r.s) / Math.max(12, r.v * 0.8 + 8) + (r.crash > 0 ? 2.5 : 0) }));
  list.sort((a, b) => a.t - b.t);
  return list;
}

function stepWorld(W, dtReal) {
  let dt = dtReal;
  if (W.slowT > 0) { W.slowT -= dtReal; dt *= ARC.reducedMotion ? 1 : 0.35; }
  if (W.phase === 'intro') {
    W.introT += dtReal;
    if (W.introT >= W.introDur || W.skip) { W.phase = 'grid'; W.skip = false; if (W.cfg.mode === 'grudge') say(W, 'startG', W.riders[1] ? W.riders[1].name : ''); else if (W.wet) say(W, 'wet'); }
  }
  if (W.phase === 'replay') { stepReplay(W, dtReal); tickHud(W, dtReal); return; }
  if (W.phase === 'podium') { W.podT += dtReal; if (W.podT > (ARC.reducedMotion ? 4 : 6) || W.skip) { W.skip = false; endRace(W); } tickHud(W, dtReal); return; }
  if (W.phase === 'grid') {
    const before = Math.ceil(W.cd);
    W.cd -= dt;
    const after = Math.ceil(W.cd);
    if (after !== before && after > 0 && after <= 3 && !W.attract) { tone(440, 0.16, { type: 'square', vol: 0.12 }); ARC.haptic('tap', 0.4); }
    if (W.cd <= 0) { W.phase = 'racing'; W.t = 0; if (!W.attract) { tone(880, 0.4, { type: 'square', vol: 0.14 }); ARC.haptic('hit', 0.8); W.banner = 'GO!'; W.bannerT = 1; if (W.cfg.mode !== 'grudge') say(W, 'start'); } }
  } else if (W.phase === 'racing' || W.phase === 'finished' || W.phase === 'busted' || W.phase === 'wrecked') {
    W.t += dt;
  }
  if (W.bannerT > 0) W.bannerT -= dtReal;
  if (W.tele) { W.tele.t -= dt; if (W.tele.t <= -0.1 || !W.tele.R.atkK) W.tele = null; }
  for (let i = 0; i < W.riders.length; i++) stepRider(W, W.riders[i], dt);
  updateTraffic(W, dt); updateCows(W, dt); updatePatrols(W, dt);
  contacts(W, dt);
  passes(W);
  if (W.tut) stepTutorial(W, dtReal);
  // the replay buffer
  if (W.rec && W.phase !== 'grid' && W.phase !== 'intro' && W.phase !== 'over') {
    W.rec.acc += dt;
    if (W.rec.acc >= 1 / 15) { W.rec.acc = 0; recFrame(W); }
    if (W.pend && W.t >= W.pend.until) cutClip(W);
  }
  // finishing
  const T = W.T;
  for (let i = 0; i < W.riders.length; i++) {
    const R = W.riders[i];
    if (!R.finished && !R.dnf && R.s >= T.finishS && W.phase !== 'grid' && W.phase !== 'intro') {
      R.finished = true; R.finT = W.t; R.crash = 0; R.sc = null;
      let fin = 0; for (let k = 0; k < W.riders.length; k++) if (W.riders[k].finished) fin++;
      R.place = fin;
      if (R.isPlayer && !W.attract && W.phase === 'racing') {
        W.phase = 'finished'; W.finWait = 0; P_finish(W);
      }
    }
  }
  if (W.phase === 'finished') {
    W.finWait += dtReal;
    if ((W.finWait > 3.4 || (W.skip && W.finWait > 0.8)) && !W.attract) { W.skip = false; if (W.pend) cutClip(W); if (W.clips.length && W.cfg.mode !== 'practice') startReplay(W); else startPodium(W); }
  }
  if (W.phase === 'busted' || W.phase === 'wrecked') { W.bustT += dtReal; if (W.bustT > 2.6) endRace(W); }
  tickHud(W, dtReal);
  if (W.attract && W.P.s > T.finishS - 30) {
    // the menu backdrop loops: start again
    const k = W.attractKey; Wd = newWorld(W.cfg); Wd.attractKey = k;
  }
  if (W.P.isPlayer && !W.attract) engineSet(W.P);
}
function tickHud(W, dtReal) {
  for (let i = W.pops.length - 1; i >= 0; i--) { W.pops[i].t += dtReal; if (W.pops[i].t > 1.6) W.pops.splice(i, 1); }
  if (W.comm.length) { W.comm[0].t += dtReal; if (W.comm[0].t > 3.4) W.comm.shift(); }
}

/* ------------------------------------------------------------ after the line: highlights, then the podium */
function startReplay(W) {
  if (ARC.fade) ARC.fade(220);
  W.phase = 'replay'; W.replay = { ci: 0, t: 0 }; W.skip = false;
  if (!W.ghosts) W.ghosts = W.riders.map((R) => { const g = Object.create(R); g.emo = null; g.finished = false; g.dnf = false; g.invuln = 0; g.sc = null; return g; });
  if (POST) POST.letterbox(1);
}
function stepReplay(W, dtReal) {
  const rp = W.replay, clip = W.clips[rp.ci];
  rp.t += dtReal * (ARC.reducedMotion ? 0.8 : 0.55);
  if (W.skip || !clip || rp.t > clip.dur) {
    W.skip = false; rp.ci++; rp.t = 0; if (ARC.fade) ARC.fade(180);
    if (rp.ci >= Math.min(2, W.clips.length)) { if (POST) POST.letterbox(0); startPodium(W); }
  }
}
function startPodium(W) {
  if (ARC.fade) ARC.fade(220);
  W.phase = 'podium'; W.podT = 0; W.skip = false;
  const fo = finalOrder(W);
  W.podium = fo.slice(0, 3).filter((x) => x.t < 1e8).map((x) => x.r);
  if (W.cfg.mode === 'time' || W.cfg.mode === 'practice') W.podium = [W.P];
  W.podShow = true;
}

function P_finish(W) {
  const P = W.P, pos = positionOf(W, P);
  P.place = pos;
  W.banner = W.cfg.mode === 'time' || W.cfg.mode === 'practice' ? 'FINISH' : ordinal(pos).toUpperCase(); W.bannerT = 3;
  tone(660, 0.18, { type: 'triangle', vol: 0.14 }); tone(880, 0.18, { type: 'triangle', vol: 0.14, delay: 0.18 }); tone(1320, 0.4, { type: 'triangle', vol: 0.14, delay: 0.36 });
  confetti(W, 160);
  if (VFX && R3) { R3.show = { n: pos <= 3 ? 7 : 3, t: 0.1 }; R3.camera.updateMatrixWorld(); VFX.confetti(_vq.set(0, 0.8, -6).applyMatrix4(R3.camera.matrixWorld), { count: 120 }); }
  ARC.haptic(pos <= 3 || W.cfg.mode === 'time' ? 'success' : 'hit', 1);
  if (POST) POST.flash(0.22, '#fff2d0');
  if (W.cfg.mode !== 'time' && W.cfg.mode !== 'practice') say(W, pos === 1 ? 'finishW' : pos <= 3 ? 'finishP' : 'finishL', ordinal(pos));
  if (pos <= 3 && W.cfg.mode !== 'time' && W.cfg.mode !== 'practice') ARC.toast(pos === 1 ? 'Winner!' : 'Podium!', W.T.def.name, 1800);
}

const PRIZE = [1200, 800, 520, 320, 200, 140, 100, 80];
const PTS = [25, 18, 15, 12, 10, 8, 6, 4];

function endRace(W) {
  if (W.over) return; W.over = true;
  const T = W.T, P = W.P, mode = W.cfg.mode, d = W.d, lv = W.lv;
  engineStop();
  if (POST) POST.letterbox(0);
  const fo = finalOrder(W);
  fo.forEach((x) => { if (!x.r.finished && x.t < 1e8) { x.r.finT = x.t; x.r.finished = true; } });
  const ord = fo.map((x) => x.r);
  const out = W.busted || W.wrecked;
  const pos = out ? 0 : ord.indexOf(P) + 1;
  const st = P.stats;
  const career = mode === 'career', tt = mode === 'time', prac = mode === 'practice', grudge = mode === 'grudge';
  let score = 0, prize = 0, bonus = 0, fine = 0, repair = 0, lvlMsg = '', qualMsg = '', grudgeMsg = '';
  if (tt || prac) score = out ? 0 : Math.round(200000 / Math.max(30, P.finT));
  else score = out ? Math.max(0, st.shoves * 30 + st.knocks * 80) : PTS[pos - 1] * 40 + st.shoves * 30 + st.knocks * 80 + st.parries * 50 + st.passes * 25 + st.near * 10 - st.crashes * 40;
  score = Math.max(0, Math.round(score * (d === DIFF.hard ? 1.25 : d === DIFF.easy ? 0.8 : 1)));
  const mult = T.def.prize * lv.prize * (career ? 1 : grudge ? 1.2 : 0.5) * (d === DIFF.hard ? 1.3 : d === DIFF.easy ? 0.75 : 1);
  if (!out && !tt && !prac) {
    prize = Math.round(PRIZE[pos - 1] * mult * (grudge ? (pos === 1 ? 2.5 : 0.4) : 1));
    bonus = Math.round((st.knocks * 90 + st.parries * 40 + st.shoves * 12) * mult);
  }
  if (W.busted) fine = Math.min(SAVE.cash, Math.round(250 * lv.n * T.def.prize));
  if (W.wrecked) repair = Math.min(SAVE.cash, Math.round(320 * lv.n));
  const net = prize + bonus - fine - repair;
  SAVE.cash = Math.max(0, SAVE.cash + net);
  SAVE.rec.races++; if (pos === 1 && !tt && !prac) SAVE.rec.wins++; if (pos && pos <= 3 && !tt && !prac) SAVE.rec.podiums++;
  SAVE.rec.knocks += st.knocks; if (W.busted) SAVE.rec.busted++; if (W.wrecked) SAVE.rec.wrecked++; SAVE.rec.earned += Math.max(0, prize + bonus);
  // the season table: points for everyone who raced
  if (!tt && !prac && !W.attract) {
    fo.forEach((x, i) => { if (x.t < 1e8 && i < PTS.length) { const k = x.r.isPlayer ? 'You' : x.r.name; SAVE.pts[k] = (SAVE.pts[k] || 0) + (career ? PTS[i] : Math.round(PTS[i] / 2)); } });
  }
  // the ladder: qualify on every route of the level to move up
  if (career && !out && pos <= 3) {
    const q = SAVE.qual[T.id];
    if (q == null || pos < q) SAVE.qual[T.id] = pos;
    const L = levelDef(SAVE.level), done = L.routes.filter((id) => SAVE.qual[id] != null).length;
    qualMsg = 'Qualified on ' + T.def.name + ' (' + done + ' of ' + L.routes.length + ')';
    if (done >= L.routes.length) {
      SAVE.cash += L.bonus;
      if (SAVE.level < LEVELS.length) { SAVE.level++; SAVE.qual = {}; lvlMsg = 'Level up! ' + levelDef(SAVE.level).name + ' is open, and a ' + money(L.bonus) + ' bonus is yours.'; }
      else { SAVE.crowned = true; lvlMsg = 'You are the Crown of the Ghats! ' + money(L.bonus) + ' bonus.'; }
    }
  } else if (career && !out) qualMsg = 'Finish in the top three to qualify on ' + T.def.name + '.';
  if (grudge && W.riders[1]) {
    const foe = W.riders[1];
    if (!out && pos === 1) { addGrudge(foe.name, -2); grudgeMsg = foe.name + ' has to live with that one.'; }
    else { addGrudge(foe.name, 1); grudgeMsg = foe.name + ' will not let you forget this.'; }
  }
  if (prac) SAVE.tut = SAVE.tut || (W.tut && W.tut.step >= TUT.length);
  if (!out && !prac) {
    const b = SAVE.best[T.id] || (SAVE.best[T.id] = {});
    if (P.finT && (b.time == null || P.finT < b.time)) b.time = +P.finT.toFixed(2);
    if (!tt && (b.place == null || pos < b.place)) b.place = pos;
  }
  saveGame();
  W.results = { pos, score, cash: net, prize, bonus, fine, repair, time: P.finT, busted: W.busted, wrecked: W.wrecked, level: SAVE.level };
  W.phase = 'over';
  if (!W.podium) startPodiumQuiet(W);
  const rows = ord.map((r, i) => {
    const isOut = (r === P && out) || r.dnf;
    const tm = isOut ? (r === P ? (W.busted ? 'Busted' : 'Wrecked') : r.out === 'busted' ? 'Busted' : 'Wrecked') : fmtTime(r.finT);
    return '<tr class="' + (r === P ? 'me' : '') + '"><td>' + (isOut ? '-' : i + 1) + '</td><td>' + ARC.esc(r.name) + '<small>' + ARC.esc(r.b.name) + (r.isPlayer ? '' : ' · ' + ARC.esc((STYLES[r.style] || STYLES.clean).name)) + '</small></td><td>' + tm + '</td></tr>';
  }).join('');
  const table = tt || prac ? '' : '<table class="gr-res">' + rows + '</table>';
  const line = '<div class="gr-line"><span>Hits<b>' + st.shoves + '</b></span><span>Knock-offs<b>' + st.knocks + '</b></span><span>Parries<b>' + st.parries + '</b></span><span>Blocks<b>' + st.blocks + '</b></span><span>Passes<b>' + st.passes + '</b></span><span>Wipeouts<b>' + st.crashes + '</b></span>' + (st.bridges ? '<span>Bridges<b>' + st.bridges + '</b></span>' : '') + '</div>';
  const purse = [];
  if (prize) purse.push('Prize <b>' + money(prize) + '</b>');
  if (bonus) purse.push('Fight bonus <b>' + money(bonus) + '</b>');
  if (fine) purse.push('Patrol fine <b>-' + money(fine) + '</b>');
  if (repair) purse.push('Repairs <b>-' + money(repair) + '</b>');
  const money1 = (purse.length ? '<p class="gr-cash">' + purse.join(' · ') + '. Wallet <b>' + money(SAVE.cash) + '</b>.</p>' : '<p class="gr-cash">Wallet <b>' + money(SAVE.cash) + '</b>.</p>') +
    (qualMsg ? '<p class="gr-cash">' + ARC.esc(qualMsg) + '</p>' : '') + (lvlMsg ? '<p class="gr-cash"><b>' + ARC.esc(lvlMsg) + '</b></p>' : '') + (grudgeMsg ? '<p class="gr-cash">' + ARC.esc(grudgeMsg) + '</p>' : '');
  let title, eyebrow, lead = '';
  if (W.busted) { title = 'Busted, <em>race over</em>'; eyebrow = 'Patrol'; lead = '<p>The patrol caught up with you and flagged you off the road: no prize money, and a fine. Fight away from the blue lights, or get clear of them fast.</p>'; }
  else if (W.wrecked) { title = 'Wrecked, <em>race over</em>'; eyebrow = T.def.name; lead = '<p>The bike took one hit too many. Armour in the shop makes it tougher; the repair bill comes out of your wallet.</p>'; }
  else if (prac) { title = W.tut && W.tut.step >= TUT.length ? 'Combat school <em>passed</em>' : 'Practice <em>done</em>'; eyebrow = 'Combat school'; lead = '<p>' + (W.tut && W.tut.step >= TUT.length ? 'Every lesson done. The coach says you are ready for the ghats.' : 'Lessons done: ' + (W.tut ? W.tut.step : 0) + ' of ' + TUT.length + '. Come back and finish them any time.') + '</p>'; }
  else if (tt) { title = fmtTime(P.finT); eyebrow = 'Time trial, ' + T.def.name; }
  else { title = ordinal(pos) + ' <em>place</em>'; eyebrow = T.def.name + (career ? ', Level ' + lv.n : grudge ? ', grudge match' : ''); }
  const html = lead + table + line + money1;
  ARC.over({ eyebrow, title, html, score, scoreLabel: 'Ride score', again: career ? 'Next race' : 'Race again' });
}
function startPodiumQuiet(W) { const fo = finalOrder(W); W.podium = fo.slice(0, 3).filter((x) => x.t < 1e8).map((x) => x.r); W.podShow = false; }

/* ------------------------------------------------------------ combat school */
// Practice mode: a quiet road with no traffic, and a coach riding alongside. Each lesson waits for you.
const TUT = [
  { id: 'ride', title: 'Ride', k: 'Hold Up to ride, steer with Left and Right', t: 'Drag left and right to steer, the throttle is automatic', p: 'Push the stick to steer, the throttle is automatic', g: 'Left stick steers, RT rides' },
  { id: 'punchL', title: 'Punch left', k: 'The coach is on your left: press Z (or J)', t: 'The coach is on your left: swipe left', p: 'The coach is on your left: press Punch L', g: 'The coach is on your left: press X' },
  { id: 'punchR', title: 'Punch right', k: 'Now on your right: press X (or K)', t: 'Now on your right: swipe right', p: 'Now on your right: press Punch R', g: 'Now on your right: press B' },
  { id: 'kick', title: 'Kick', k: 'Press C (or L): a slow, heavy kick', t: 'A long, hard swipe toward him kicks', p: 'Press Kick', g: 'Press Y to kick' },
  { id: 'block', title: 'Block', k: 'He swings now. Hold B (or Q) as the GUARD warning shows', t: 'He swings now. Swipe down as GUARD shows to raise your guard', p: 'He swings now. Hold Guard as the warning shows', g: 'He swings now. Hold a bumper (LB or RB) to guard' },
  { id: 'nitro', title: 'Nitro', k: 'Press Shift (or N) for nitro', t: 'Swipe up for nitro', p: 'Press Nitro', g: 'Press A for nitro' },
  { id: 'knock', title: 'Knock him off', k: 'Last lesson: knock the coach off his bike', t: 'Last lesson: knock the coach off his bike', p: 'Last lesson: knock the coach off his bike', g: 'Last lesson: knock the coach off his bike' }
];
function stepTutorial(W, dt) {
  const tu = W.tut, P = W.P, st = P.stats, L = TUT[tu.step];
  if (!L || W.phase !== 'racing') return;
  tu.t += dt;
  const coach = W.riders[1];
  // each lesson counts from the moment it starts
  if (!tu.base) tu.base = { pl: st.punchL, pr: st.punchR, kk: st.kicks, bk: st.blocks + st.parries };
  const B = tu.base;
  let ok = false;
  if (L.id === 'ride') ok = P.s - W.T.startS > 140;
  else if (L.id === 'punchL') ok = st.punchL > B.pl;
  else if (L.id === 'punchR') ok = st.punchR > B.pr;
  else if (L.id === 'kick') ok = st.kicks > B.kk;
  else if (L.id === 'block') ok = st.blocks + st.parries > B.bk;
  else if (L.id === 'nitro') ok = P.nitroOn;
  else if (L.id === 'knock') ok = coach && coach.crash > 0;
  if (L.id === 'nitro' && P.nitro < 40) P.nitro = 60;
  if (ok && tu.t > 0.6) {
    tu.step++; tu.t = 0; tu.base = null;
    tone(990, 0.12, { type: 'triangle', vol: 0.12 }); ARC.haptic('success', 0.5);
    pop(W, tu.step >= TUT.length ? 'Combat school passed!' : 'Nice!', tu.step >= TUT.length ? 'You are ready for the ghats' : 'Next: ' + TUT[tu.step].title, '#44ffa8', tu.step >= TUT.length);
    if (tu.step >= TUT.length) { tu.doneT = 0; SAVE.tut = true; saveGame(); }
  }
  if (tu.doneT >= 0) { tu.doneT += dt; if (tu.doneT > 2.5 && W.phase === 'racing') { W.phase = 'finished'; W.finWait = 3; P.finT = W.t; } }
}

/* ------------------------------------------------------------ geometry helpers */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _c = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const V = { x: 0, y: 0, z: 0 }, V2 = { x: 0, y: 0, z: 0 }, _vq = new THREE.Vector3();

/* ------------------------------------------------------------ boost set piece: road heat glow and shed sparks */
// finish show: one shell at a time, each sent up where the finish camera is looking at that moment
const _fs = new THREE.Vector3();
function finishShow(st, dt, cam) {
  if (!st || st.n <= 0 || !VFX || !cam) return;
  st.t -= dt; if (st.t > 0) return;
  st.t = 0.45 + Math.random() * 0.3; st.n--;
  const d = 22 + Math.random() * 8, th = Math.tan(cam.fov * Math.PI / 360);
  _fs.set((Math.random() - 0.5) * 1.2 * d * th * cam.aspect, d * th * (0.2 + Math.random() * 0.35), -d);
  cam.updateMatrixWorld(); _fs.applyMatrix4(cam.matrixWorld);
  VFX.fireworks(_fs, { launch: true, size: 1.3 });
}
let _boostTex = null;
const _bz = new THREE.Vector3(), _bd = new THREE.Vector3();
function boostTex() {
  if (_boostTex) return _boostTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,215,1)'); gr.addColorStop(0.22, 'rgba(255,170,80,0.8)'); gr.addColorStop(0.55, 'rgba(255,100,40,0.28)'); gr.addColorStop(1, 'rgba(255,70,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _boostTex = new THREE.CanvasTexture(c); _boostTex.colorSpace = THREE.SRGBColorSpace; return _boostTex;
}
// an additive pool of light on the road behind the machine, child of its root (local +back is `back`)
function makeBoostGlow(parent, z, w, l, color) {
  const mat = new THREE.MeshBasicMaterial({ map: boostTex(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  mat.userData.keepMat = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.05, z); m.renderOrder = 2; m.visible = false; m.userData.keepMat = true;
  parent.add(m); return m;
}
// drive one boost: jet length flickers between 1.5 and 2 times, the glow breathes, sparks shed off the jet
function driveBoost(st, on, dt, root, glow, nozzles, back, quality, reduced) {
  st.t = (st.t || 0) + dt; st.k = (st.k || 0) + ((on ? 1 : 0) - (st.k || 0)) * Math.min(1, dt * (on ? 10 : 4));
  const f = reduced ? 1.6 : 1.55 + 0.3 * Math.sin(st.t * 31) * Math.sin(st.t * 11.3 + 1.7) + 0.15 * Math.sin(st.t * 57);
  if (st.h) for (let i = 0; i < st.h.length; i++) st.h[i].set(f);
  if (glow) { glow.visible = st.k > 0.02; glow.material.opacity = st.k * (reduced ? 0.5 : 0.55 + 0.2 * Math.sin(st.t * 23) * Math.sin(st.t * 9.1)); }
  if (!on || quality < 1 || !VFX) return;
  st.sp = (st.sp || 0) - dt; if (st.sp > 0) return;
  st.sp = quality >= 2 ? 0.08 : 0.16;
  const nz = nozzles[(Math.random() * nozzles.length) | 0];
  root.updateWorldMatrix(true, false);
  _bz.set(nz[0], nz[1], nz[2] + back * (0.6 + Math.random() * 1.2)).applyMatrix4(root.matrixWorld);
  _bd.set((Math.random() - 0.5) * 0.6, 0.5, back).transformDirection(root.matrixWorld);
  VFX.impact(_bz, _bd, { kind: 'spark', size: 0.26 });
}

// Bake a primitive: place it, give it one vertex colour, drop its uvs so a whole model merges into one mesh.
function prep(geo, hex, pos, rot, scl) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  if (scl == null) _s3.set(1, 1, 1); else if (typeof scl === 'number') _s3.set(scl, scl, scl); else _s3.set(scl[0], scl[1], scl[2]);
  _p3.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _m4.compose(_p3, _q, _s3); g.applyMatrix4(_m4);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function mergeG(list) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const boxG = (w, h, d, hex, pos, rot) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot);
const cylG = (rt, rb, h, seg, hex, pos, rot, scl) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, scl);
const sphG = (r, hex, pos, scl, ws, hs) => prep(new THREE.SphereGeometry(r, ws || 12, hs || 9), hex, pos, null, scl);
// a cylinder (or capsule) from point a to point b
function limbG(a, b, r, hex, cap, r2) {
  _v1.set(a[0], a[1], a[2]); _v2.set(b[0], b[1], b[2]);
  const len = _v1.distanceTo(_v2);
  const g = cap ? new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 10) : new THREE.CylinderGeometry(r2 == null ? r : r2, r, len, 10);
  const gg = g.index ? g.toNonIndexed() : g; if (gg !== g) g.dispose();
  if (gg.attributes.uv) gg.deleteAttribute('uv');
  _v3.subVectors(_v2, _v1).normalize();
  _q.setFromUnitVectors(_up, _v3);
  _p3.addVectors(_v1, _v2).multiplyScalar(0.5);
  _m4.compose(_p3, _q, _s3.set(1, 1, 1)); gg.applyMatrix4(_m4);
  return prep(gg, hex);
}

/* ------------------------------------------------------------ textures */
let RENDERER = null;
let TEX_ANISO = 4;
const ALL_TEX = [];
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = TEX_ANISO; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  ALL_TEX.push(t);
  return t;
}
function noiseFill(g, w, h, base, amp, n, seed, size) {
  const r = rng(seed || 7);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amp, s = (size || 2) * (0.5 + r());
    g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')';
    g.fillRect(r() * w, r() * h, s, s);
  }
}
function softBlob(g, x, y, r, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
// a normal map from a height function, for rock and tarmac relief
function normalTex(size, hf, strength, rep) {
  return canvasTex(size, size, (g) => {
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = hf(x / size, y / size);
    const im = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)], u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
      const o = (y * size + x) * 4; im.data[o] = (nx * 0.5 + 0.5) * 255; im.data[o + 1] = (ny * 0.5 + 0.5) * 255; im.data[o + 2] = (nz * 0.5 + 0.5) * 255; im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, { data: true, repeat: rep });
}
// tileable value noise
function vnoise(seed, cells) {
  const r = rng(seed), G = new Float32Array(cells * cells); for (let i = 0; i < G.length; i++) G[i] = r();
  return (u, v) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const g = (i, j) => G[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
  };
}

let TX = null;
function textures() {
  if (TX) return TX;
  TX = {};
  // tarmac: grain, a worn centre dash, faded edge lines, tar patches
  TX.road = canvasTex(512, 1024, (g, w, h) => {
    noiseFill(g, w, h, '#57565a', 0.22, 26000, 3, 2);
    const r = rng(11);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(20,20,22,' + (0.05 + r() * 0.07) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 30, 20 + r() * 50, r() * 3, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(25,25,28,.5)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
    // tyre lines
    [0.27, 0.73].forEach((u) => { const gr = g.createLinearGradient(u * w - 40, 0, u * w + 40, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u * w - 40, 0, 80, h); });
    g.fillStyle = 'rgba(238,236,226,.88)';
    g.fillRect(10, 0, 9, h); g.fillRect(w - 19, 0, 9, h);
    for (let y = 0; y < h; y += 256) g.fillRect(w / 2 - 5, y + 30, 10, 140);
    g.fillStyle = 'rgba(80,72,60,.5)'; g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
  }, { repeat: [1, 1] });
  // fine asphalt grain only: a broad low-frequency term read as big dark blotches under a low sun
  // fine asphalt grain only, near texel size so it averages out to an even surface at distance:
  // any broader bump term reads as dark and light blotches under the low sun
  const nh = vnoise(5, 192), nh2 = vnoise(9, 128);
  TX.roadN = normalTex(256, (u, v) => nh(u, v) * 0.7 + nh2(u, v) * 0.3, 1.0, [1, 1]);
  // damp tarmac for the dawn mist: the wheel tracks are polished a little smoother, the edges and
  // the centre stay matt, and a few shallow puddles sit in the dips. Roughness is the green channel.
  TX.roadR = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = 'rgb(0,178,0)'; g.fillRect(0, 0, w, h);
    const r = rng(23);
    [0.27, 0.73].forEach((u) => { const gr = g.createLinearGradient(u * w - 34, 0, u * w + 34, 0); gr.addColorStop(0, 'rgba(0,178,0,0)'); gr.addColorStop(0.5, 'rgb(0,156,0)'); gr.addColorStop(1, 'rgba(0,178,0,0)'); g.fillStyle = gr; g.fillRect(u * w - 34, 0, 68, h); });
    for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(0,' + (150 + r() * 40 | 0) + ',0,0.35)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 40 + r() * 140); }
    for (let i = 0; i < 4; i++) { const x = (0.2 + r() * 0.6) * w, y = r() * h, rx = 10 + r() * 16, ry = 26 + r() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, ry); gr.addColorStop(0, 'rgb(0,96,0)'); gr.addColorStop(0.6, 'rgba(0,118,0,0.8)'); gr.addColorStop(1, 'rgba(0,178,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
  }, { data: true, repeat: [1, 1] });
  // the banks: one grey detail texture, the hue comes from vertex colours
  TX.ground = canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#bdbdbd', 0.32, 20000, 21, 3);
    const r = rng(4);
    for (let i = 0; i < 380; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.05 + r() * 0.1) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 14, 2 + r() * 8, r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 260; i++) { g.strokeStyle = 'rgba(255,255,255,' + (0.06 + r() * 0.1) + ')'; g.lineWidth = 1; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 8); g.stroke(); }
  });
  const rk = vnoise(13, 24), rk2 = vnoise(31, 8);
  // soil and grass clumps, no regular rows: a sine term here printed zebra bands across every bank
  const rk3 = vnoise(47, 96);
  TX.groundN = normalTex(256, (u, v) => rk(u, v) * 0.45 + rk2(u, v) * 0.2 + rk3(u, v) * 0.35, 2.2, [1, 1]);
  // soft blobs for mist, glow and particles
  TX.mist = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); const r = rng(8);
    for (let i = 0; i < 40; i++) softBlob(g, 50 + r() * 156, 60 + r() * 136, 30 + r() * 60, 'rgba(255,255,255,A)', 0.12 + r() * 0.1);
  }, { clamp: true });
  TX.glow = canvasTex(128, 128, (g, w) => { softBlob(g, w / 2, w / 2, w / 2, 'rgba(255,255,255,A)', 1); }, { clamp: true });
  // a waterfall: falling streaks
  TX.falls = canvasTex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); const r = rng(19);
    for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, l = 30 + r() * 120; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(235,245,255,' + (0.3 + r() * 0.5) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, 1 + r() * 3, l); g.fillRect(x, y - h, 1 + r() * 3, l); }
  });
  // the back of a goods truck: hand-painted panel
  TX.truckBack = canvasTex(256, 256, (g, w, h) => {
    const cols = ['#e8452c', '#f2c230', '#2f9e5a', '#2d6fd1', '#e94f8a'];
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 5]; g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 8, 18); g.lineTo(i * 16 + 16, 0); g.fill(); g.beginPath(); g.moveTo(i * 16, h); g.lineTo(i * 16 + 8, h - 18); g.lineTo(i * 16 + 16, h); g.fill(); }
    g.fillStyle = '#c2272d'; g.fillRect(14, 30, w - 28, 66);
    g.fillStyle = '#fff6d6'; g.font = 'bold 34px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HORN', w / 2, 52); g.font = 'bold 26px Inter, Arial, sans-serif'; g.fillText('OK PLEASE', w / 2, 82);
    for (let i = 0; i < 3; i++) { g.fillStyle = cols[(i + 2) % 5]; g.beginPath(); g.arc(50 + i * 78, 150, 26, 0, TAU); g.fill(); g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(50 + i * 78, 150, 11, 0, TAU); g.fill(); }
    g.fillStyle = '#1d2440'; g.font = 'bold 22px Inter, Arial, sans-serif'; g.fillText('USE DIPPER AT NIGHT', w / 2, 210);
  }, { clamp: true });
  // house walls with a window and a door, painted white so instance colours tint them
  TX.house = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#f2efe8', 0.14, 6000, 41, 3);
    g.fillStyle = '#5a3a28'; g.fillRect(96, 130, 64, 126);
    g.fillStyle = '#2b3442'; g.fillRect(20, 70, 52, 52); g.fillRect(184, 70, 52, 52);
    g.strokeStyle = '#8a6a48'; g.lineWidth = 6; g.strokeRect(20, 70, 52, 52); g.strokeRect(184, 70, 52, 52);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 236, w, 20);
  }, { clamp: true });
  TX.houseLit = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcf7a'; g.fillRect(24, 74, 44, 44); g.fillRect(188, 74, 44, 44);
  }, { clamp: true });
  // tunnel concrete
  TX.tunnel = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#9a968e', 0.25, 9000, 51, 3);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
    g.fillStyle = 'rgba(40,30,20,.15)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * w, 0, 2, h * Math.random());
  });
  // start and finish banners
  TX.banner = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#c2272d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f5efe3'; g.fillRect(i * 32, j * 16, 32, 16); g.fillRect(i * 32, h - 32 + j * 16, 32, 16); }
    g.fillStyle = '#ffd23f'; g.font = 'bold 54px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('GHAT RIDERS  ·  START', w / 2, h / 2 + 2);
  }, { clamp: true });
  TX.finish = canvasTex(1024, 128, (g, w, h) => {
    for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f5efe3'; g.fillRect(i * 32, j * 32, 32, 32); }
    g.fillStyle = 'rgba(17,17,17,.82)'; g.fillRect(w / 2 - 230, 14, 460, 100);
    g.fillStyle = '#ffd23f'; g.font = 'bold 64px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', w / 2, h / 2 + 2);
  }, { clamp: true });
  // a milestone face
  TX.mile = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2a516'; g.fillRect(0, 0, w, 44);
    g.fillStyle = '#222'; g.font = 'bold 20px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('GHAT', w / 2, 76); g.font = 'bold 16px Inter, Arial, sans-serif'; g.fillText('KM', w / 2, 102);
  }, { clamp: true });
  // sea ripples
  const wn = vnoise(77, 32), wn2 = vnoise(78, 8);
  TX.seaN = normalTex(256, (u, v) => wn(u, v) * 0.6 + wn2(u, v) * 0.4 + Math.sin((u + v * 0.3) * TAU * 8) * 0.05, 2.2, [40, 40]);
  // chevron board on hairpins
  TX.chev = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h); g.fillStyle = '#111';
    for (let i = 0; i < 4; i++) { const x = 20 + i * 60; g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 26, h / 2); g.lineTo(x, h - 8); g.lineTo(x + 14, h - 8); g.lineTo(x + 40, h / 2); g.lineTo(x + 14, 8); g.closePath(); g.fill(); }
  }, { clamp: true });
  return TX;
}

/* ------------------------------------------------------------ particles */
let FX = null;
function makePool(n, additive, square) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;' +
      'void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; ' +
      (square ? 'if (abs(p.x) > 0.42 || abs(p.y) > 0.26) discard; float a = vA;' : 'float d = length(p); if (d > 0.5) discard; float a = vA * ' + (additive ? 'pow(1.0 - d * 2.0, 1.6)' : 'smoothstep(0.5, 0.15, d)') + ';') +
      ' gl_FragColor = vec4(vC, a); }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  const P = { n, pos, col, size, alpha, geo, mat, pts, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s0: new Float32Array(n), grow: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), a0: new Float32Array(n), spin: new Float32Array(n), floor: new Float32Array(n).fill(-1e9), head: 0, live: 0 };
  return P;
}
function createFX(scene) {
  const F = { add: makePool(700, true), soft: makePool(600, false), conf: makePool(360, false, true), density: 1 };
  scene.add(F.add.pts, F.soft.pts, F.conf.pts);
  F.emit = (pool, x, y, z, vx, vy, vz, life, size, hex, alpha, grav, drag, grow, floor) => {
    const P = F[pool]; const i = P.head; P.head = (P.head + 1) % P.n;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    _c.set(hex); P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b;
    P.life[i] = life; P.max[i] = life; P.s0[i] = size; P.size[i] = size; P.a0[i] = alpha; P.alpha[i] = alpha;
    P.grav[i] = grav || 0; P.drag[i] = drag || 0; P.grow[i] = grow || 0; P.spin[i] = Math.random() * 6; P.floor[i] = floor == null ? -1e9 : floor;
  };
  F.update = (dt, scale) => {
    ['add', 'soft', 'conf'].forEach((k) => {
      const P = F[k]; P.mat.uniforms.uScale.value = scale;
      let any = false;
      for (let i = 0; i < P.n; i++) {
        if (P.life[i] <= 0) { if (P.alpha[i] !== 0) { P.alpha[i] = 0; any = true; } continue; }
        any = true;
        P.life[i] -= dt;
        const f = Math.max(0, P.life[i] / P.max[i]), dr = Math.exp(-P.drag[i] * dt);
        P.vel[i * 3] *= dr; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * dr - P.grav[i] * dt; P.vel[i * 3 + 2] *= dr;
        if (k === 'conf') { P.spin[i] += dt * 9; P.vel[i * 3] += Math.sin(P.spin[i]) * dt * 2; }
        P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
        // sparks and grit hit the road and bounce, losing most of their energy
        if (P.pos[i * 3 + 1] < P.floor[i]) { P.pos[i * 3 + 1] = P.floor[i]; P.vel[i * 3 + 1] = -P.vel[i * 3 + 1] * 0.32; P.vel[i * 3] *= 0.55; P.vel[i * 3 + 2] *= 0.55; }
        P.size[i] = P.s0[i] * (1 + P.grow[i] * (1 - f)) * (k === 'conf' ? 0.6 + 0.4 * Math.abs(Math.sin(P.spin[i])) : 1);
        P.alpha[i] = P.a0[i] * (k === 'add' ? f : Math.min(1, f * 2.5));
      }
      if (any) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aColor.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aAlpha.needsUpdate = true; }
    });
  };
  F.clear = () => { ['add', 'soft', 'conf'].forEach((k) => { F[k].life.fill(0); }); };
  return F;
}
// effect helpers called by the rules (no-ops before the 3D stage exists)
const fxOK = () => FX && R3 && !R3.lost;
const chance = (p) => Math.random() < p * (FX ? FX.density : 1);
function dustAt(W, R, k) {
  if (!fxOK() || !chance(1)) return;
  posAt(W.T, R.s - 0.6, R.x + (Math.random() - 0.5) * 0.4, 0.15, V);
  FX.emit('soft', V.x, V.y, V.z, (Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 2, 1.0 + Math.random() * 0.6, 0.9 * (k || 1), W.T.look.dirt, 0.5, -0.3, 1.2, 2.2);
}
function gravelAt(W, R) {
  if (!fxOK()) return;
  for (let i = 0; i < 2; i++) {
    posAt(W.T, R.s - 0.7, R.x + (Math.random() - 0.5) * 0.5, 0.1, V);
    FX.emit('soft', V.x, V.y, V.z, (Math.random() - 0.5) * 5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 5, 0.9, 0.14, '#5a4a3a', 1, 9.8, 0.5, 0, V.y - 0.08);
  }
  dustAt(W, R, 0.8);
}
function sparkBurst(x, y, z, n, spread, up, hex, floor) {
  if (!fxOK()) return;
  for (let i = 0; i < n * FX.density; i++) FX.emit('add', x, y, z, (Math.random() - 0.5) * spread, Math.random() * up, (Math.random() - 0.5) * spread, 0.35 + Math.random() * 0.45, 0.09 + Math.random() * 0.07, hex || (Math.random() < 0.5 ? '#ffd27a' : '#ff8a3a'), 1, 9.8, 0.9, 0, floor);
}
function pegSparks(W, R) {
  if (!fxOK()) return;
  const side = R.lean > 0 ? 1 : -1;
  posAt(W.T, R.s + 0.05, R.x + side * 0.42, 0.05, V);
  for (let i = 0; i < 3; i++) FX.emit('add', V.x, V.y, V.z, (Math.random() - 0.5) * 2 - FR.fx * 3, Math.random() * 2, (Math.random() - 0.5) * 2 - FR.fz * 3, 0.45, 0.07, '#ffd27a', 1, 9.8, 1, 0, V.y - 0.04);
}
function scrapeFx(W, R, side, k) {
  if (!fxOK() || !chance(0.7)) return;
  posAt(W.T, R.s, side * (XW + 0.1), 0.35, V);
  if (k > 0.2) sparkBurst(V.x, V.y, V.z, 4, 3, 3, null, V.y - 0.33);
  else FX.emit('soft', V.x, V.y, V.z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.8, 0.7, W.T.look.dirt, 0.6, -0.2, 1, 2);
}
function clashFx(W, A, B, k) {
  if (!fxOK()) return;
  posAt(W.T, (A.s + B.s) / 2, (A.x + B.x) / 2, 1.0, V);
  sparkBurst(V.x, V.y, V.z, 10 + 16 * k, 5, 3.5, '#ffe9b0', V.y - 0.98);
  FX.emit('add', V.x, V.y, V.z, 0, 0, 0, 0.18, 1.6 * k + 0.4, '#fff3d6', 0.9, 0, 0, 1.5);
}
function crashFx(W, R) {
  if (!fxOK()) return;
  if (VFX && Math.abs(R.s - W.P.s) < 70) {
    posAt(W.T, R.s, R.x, 0.35, V); _vq.set(V.x, V.y, V.z);
    const big = R.isPlayer || (R.crashV || 0) > 30;
    VFX.impact(_vq, _up, { kind: 'spark', size: big ? 1.9 : 1.3 }); VFX.dust(_vq, { size: big ? 2.2 : 1.5, color: W.T.look.dirt });
    if (big) { VFX.impact(_vq, _up, { kind: 'glass', size: 1.2 }); VFX.smokePlume(_vq, { size: 0.8, duration: 1.6 }); }
  }
  posAt(W.T, R.s, R.x, 0.3, V);
  sparkBurst(V.x, V.y, V.z, 18, 5, 4, null, V.y - 0.28);
  for (let i = 0; i < 10 * FX.density; i++) FX.emit('soft', V.x, V.y, V.z, (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4, 1.4, 1.1, W.T.look.dirt, 0.55, -0.2, 1.4, 2.4);
  // a few bits of plastic and grit skitter across the tarmac
  for (let i = 0; i < 6 * FX.density; i++) FX.emit('soft', V.x, V.y + 0.2, V.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, 1.6, 0.1, Math.random() < 0.5 ? '#2a2724' : R.paint, 1, 9.8, 0.4, 0, V.y - 0.26);
}
function confetti(W, n) {
  if (!fxOK()) return;
  const cols = ['#ff6940', '#ffb736', '#44ffa8', '#38e1ff', '#e94f8a', '#f5efe3', '#9b6bff'];
  for (let i = 0; i < n * FX.density; i++) {
    posAt(W.T, W.P.s + 6 + Math.random() * 10, (Math.random() - 0.5) * 12, 5 + Math.random() * 4, V);
    FX.emit('conf', V.x, V.y, V.z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 3 + Math.random() * 1.5, 0.22, cols[i % cols.length], 1, 2.2, 0.9, 0);
  }
}

/* ------------------------------------------------------------ skid marks and scuffs: laid on the road, fading */
// One instanced quad per short segment of rubber. Each wheel that skids leaves a chain of
// segments joined end to end; a segment darkens as it is laid and fades over its life.
// The pool is fixed (no allocation in the frame loop) and sized by the quality tier.
const MARK_VS = 'attribute float aA; varying float vA; varying vec2 vUv; void main(){ vA = aA; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }';
const MARK_FS = 'uniform vec3 uCol; varying float vA; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }' +
  ' void main(){ float e = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x); float g = 0.75 + 0.25 * h(floor(vUv * vec2(6.0, 18.0))); float a = vA * e * g; if (a < 0.004) discard; gl_FragColor = vec4(uCol, a); }';
function makeMarks(scene, max) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); aA.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aA', aA);
  const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color('#0e0d0c') } }, vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, max); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.count = max;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) mesh.setMatrixAt(i, zero);
  scene.add(mesh);
  const age = new Float32Array(max), life = new Float32Array(max), a0 = new Float32Array(max);
  const mx = new THREE.Matrix4(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  const M = { mesh, max, cap: max, head: 0, live: 0, on: true };
  M.add = (ax, ay, az, bxp, byp, bzp, w, alpha, lf) => {
    if (!M.on || M.cap <= 0) return;
    bz.set(bxp - ax, byp - ay, bzp - az); const len = bz.length(); if (len < 0.05) return;
    bz.multiplyScalar(1 / len); bx.set(-bz.z, 0, bz.x).normalize(); by.crossVectors(bz, bx);
    bx.multiplyScalar(w); by.multiplyScalar(1); bz.multiplyScalar(len + 0.04);
    mx.makeBasis(bx, by, bz); mx.setPosition((ax + bxp) / 2, (ay + byp) / 2 + 0.025, (az + bzp) / 2);
    const i = M.head; M.head = (M.head + 1) % M.cap;
    mesh.setMatrixAt(i, mx); age[i] = 0; life[i] = lf; a0[i] = alpha; aA.array[i] = alpha;
    mesh.instanceMatrix.needsUpdate = true; aA.needsUpdate = true;
  };
  // A wheel that may or may not be skidding this frame: lays a segment every ~0.5 m while it does.
  M.trail = (st, on, x, y, z, w, alpha, lf) => {
    if (!on || !M.on) { st.on = false; return; }
    if (!st.on) { st.on = true; st.x = x; st.y = y; st.z = z; return; }
    const dx = x - st.x, dz = z - st.z, d2 = dx * dx + dz * dz;
    if (d2 > 36) { st.x = x; st.y = y; st.z = z; return; }
    if (d2 < 0.25) return;
    M.add(st.x, st.y, st.z, x, y, z, w, alpha, lf);
    st.x = x; st.y = y; st.z = z;
  };
  M.update = (dt) => {
    let any = false;
    for (let i = 0; i < M.cap; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      const k = age[i] / life[i];
      let a = k >= 1 ? 0 : a0[i] * Math.min(1, age[i] * 8) * (1 - k * k);
      if (k >= 1) { life[i] = 0; mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; }
      if (aA.array[i] !== a) { aA.array[i] = a; any = true; }
    }
    if (any) aA.needsUpdate = true;
  };
  M.clear = () => { for (let i = 0; i < M.max; i++) { life[i] = 0; aA.array[i] = 0; mesh.setMatrixAt(i, zero); } M.head = 0; mesh.instanceMatrix.needsUpdate = true; aA.needsUpdate = true; };
  // Tier: 0 marks off, otherwise a share of the pool.
  M.setCap = (n) => { n = Math.max(0, Math.min(M.max, n | 0)); if (n === M.cap) return; M.clear(); M.cap = n; M.on = n > 0; mesh.visible = M.on; mesh.count = Math.max(1, n); };
  return M;
}
let MARKS = null, VFX = null;

/* ------------------------------------------------------------ motorbikes and riders */
// Local frame: forward is -z, origin on the ground halfway between the axles.
const POSE = {
  sport: { pelvis: [0, 0.98, 0.2], sh: [0, 1.31, -0.2], head: [0, 1.46, -0.33], grip: [0.27, 1.0, -0.5], peg: [0.21, 0.44, 0.12], knee: [0.25, 0.86, -0.22], lean: 0.95 },
  roadster: { pelvis: [0, 0.93, 0.18], sh: [0, 1.38, -0.04], head: [0, 1.57, -0.12], grip: [0.32, 1.07, -0.5], peg: [0.22, 0.42, 0.06], knee: [0.25, 0.78, -0.24], lean: 0.6 },
  cruiser: { pelvis: [0, 0.85, 0.27], sh: [0, 1.36, 0.14], head: [0, 1.58, 0.1], grip: [0.42, 1.13, -0.42], peg: [0.27, 0.44, -0.36], knee: [0.27, 0.86, -0.28], lean: 0.35 }
};
const KIND_POSE = { scout: 'roadster', thunder: 'cruiser', phantom: 'sport' };
const GEO = {};
function bikeBodyGeo(kind, paint, trim, patrol) {
  const key = kind + paint + trim + (patrol ? 'p' : '');
  if (GEO[key]) return GEO[key];
  const L = [], dark = '#1d1e22', metal = '#8a8e96', chrome = '#d0d3d9', black = '#101114', seatC = '#26201c';
  // frame
  L.push(limbG([0, 0.96, -0.5], [0, 0.5, 0.3], 0.045, dark));
  L.push(limbG([0, 0.96, -0.5], [0, 0.36, -0.22], 0.04, dark));
  L.push(limbG([0, 0.36, -0.22], [0, 0.4, 0.3], 0.035, dark));
  // engine and cylinder fins
  L.push(boxG(0.3, 0.3, 0.4, metal, [0, 0.46, -0.05]));
  for (let i = 0; i < 4; i++) L.push(boxG(0.36, 0.025, 0.3, i % 2 ? metal : '#a3a7ae', [0, 0.62 + i * 0.04, -0.14], [0.35, 0, 0]));
  L.push(cylG(0.13, 0.13, 0.08, 14, chrome, [0.17, 0.42, 0.02], [0, 0, Math.PI / 2]));
  // swingarm and shock
  [-1, 1].forEach((sd) => {
    L.push(limbG([sd * 0.12, 0.45, 0.28], [sd * 0.12, 0.32, 0.71], 0.032, dark));
    L.push(limbG([sd * 0.11, 0.38, 0.6], [sd * 0.13, 0.82, 0.38], 0.025, '#c84b2a'));
    // fork
    L.push(limbG([sd * 0.09, 1.0, -0.53], [sd * 0.09, 0.33, -0.72], 0.032, chrome));
  });
  // handlebar
  const pose = POSE[KIND_POSE[kind]];
  const gw = pose.grip[0], gy = pose.grip[1], gz = pose.grip[2];
  L.push(limbG([-gw, gy, gz], [gw, gy, gz], 0.018, black));
  L.push(limbG([0, 0.98, -0.53], [0, gy, gz], 0.02, black));
  [-1, 1].forEach((sd) => { L.push(cylG(0.026, 0.026, 0.12, 8, black, [sd * (gw + 0.02), gy, gz], [0, 0, Math.PI / 2])); L.push(boxG(0.1, 0.03, 0.05, black, [sd * (gw - 0.1), gy + 0.03, gz - 0.03])); });
  // fenders
  L.push(prep(new THREE.CylinderGeometry(0.36, 0.36, 0.13, 14, 1, true, -0.4, 1.9), patrol ? '#f2f2f2' : paint, [0, 0.33, -0.72], [0, 0, Math.PI / 2]));
  L.push(prep(new THREE.CylinderGeometry(0.37, 0.37, 0.16, 14, 1, true, 1.2, 1.7), dark, [0, 0.33, 0.71], [0, 0, Math.PI / 2]));
  // number plate (a plain yellow plate) and tail light housing
  L.push(boxG(0.2, 0.12, 0.015, '#f2c230', [0, 0.58, 0.97], [-0.3, 0, 0]));
  if (kind === 'phantom') {
    // faired sport bike
    L.push(sphG(0.3, paint, [0, 0.92, -0.6], [0.95, 0.85, 1.55], 16, 10));
    L.push(boxG(0.5, 0.28, 0.9, paint, [0, 0.62, -0.22]));
    L.push(boxG(0.46, 0.08, 0.95, trim, [0, 0.72, -0.24]));
    L.push(boxG(0.28, 0.16, 0.42, '#203448', [0, 1.13, -0.62], [-0.85, 0, 0]));
    L.push(sphG(0.22, paint, [0, 0.95, -0.12], [1.05, 0.7, 1.5], 14, 9));
    L.push(boxG(0.22, 0.07, 0.42, seatC, [0, 0.93, 0.24], [0.08, 0, 0]));
    L.push(prep(new THREE.ConeGeometry(0.17, 0.62, 4), paint, [0, 0.98, 0.58], [Math.PI / 2 - 0.25, Math.PI / 4, 0], [1.1, 1, 0.7]));
    L.push(boxG(0.36, 0.1, 0.5, black, [0, 0.33, -0.08]));
    L.push(limbG([0.13, 0.45, 0.25], [0.18, 0.72, 0.78], 0.05, chrome));
    L.push(cylG(0.075, 0.075, 0.28, 10, '#3a3d44', [0.18, 0.74, 0.86], [Math.PI / 2 - 0.35, 0, 0]));
  } else if (kind === 'thunder') {
    // heavy cruiser
    L.push(sphG(0.27, paint, [0, 0.95, -0.22], [1.05, 0.8, 1.8], 16, 10));
    L.push(boxG(0.3, 0.04, 0.32, trim, [0, 1.13, -0.2]));
    L.push(boxG(0.36, 0.1, 0.48, seatC, [0, 0.84, 0.28], [0.06, 0, 0]));
    L.push(boxG(0.3, 0.14, 0.3, seatC, [0, 0.92, 0.5], [-0.25, 0, 0]));
    L.push(sphG(0.15, chrome, [0, 0.96, -0.74], [1, 1, 0.65]));
    L.push(prep(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 14, 1, true, 1.0, 2.2), paint, [0, 0.33, 0.71], [0, 0, Math.PI / 2]));
    [-1, 1].forEach((sd) => { L.push(limbG([sd * 0.17, 0.4, -0.06], [sd * 0.2, 0.34, 0.95], 0.045, chrome)); L.push(boxG(0.16, 0.2, 0.32, paint, [sd * 0.28, 0.6, 0.62])); });
    L.push(boxG(0.7, 0.05, 0.12, chrome, [0, 0.47, -0.36]));
    if (patrol) { L.push(boxG(0.56, 0.42, 0.06, '#d8e4f0', [0, 1.14, -0.72], [-0.3, 0, 0])); L.push(boxG(0.52, 0.12, 0.66, '#f4f4f4', [0, 1.02, 0.66])); }
  } else {
    // light roadster
    L.push(sphG(0.24, paint, [0, 0.95, -0.24], [1, 0.82, 1.6], 16, 10));
    L.push(boxG(0.06, 0.2, 0.5, trim, [0.2, 0.95, -0.24]));
    L.push(boxG(0.06, 0.2, 0.5, trim, [-0.2, 0.95, -0.24]));
    L.push(boxG(0.26, 0.08, 0.56, seatC, [0, 0.9, 0.24]));
    L.push(boxG(0.24, 0.1, 0.32, paint, [0, 0.92, 0.6], [-0.15, 0, 0]));
    L.push(sphG(0.13, chrome, [0, 1.0, -0.72], [1, 1, 0.7]));
    L.push(limbG([0.14, 0.42, -0.02], [0.2, 0.62, 0.72], 0.04, chrome));
    L.push(cylG(0.06, 0.07, 0.36, 10, '#3a3d44', [0.2, 0.66, 0.78], [Math.PI / 2 - 0.5, 0, 0]));
  }
  if (patrol) { L.push(boxG(0.6, 0.06, 0.05, '#1f5fbf', [0, 0.78, -0.2])); L.push(limbG([0, 1.05, 0.7], [0, 1.6, 0.74], 0.012, '#888')); }
  const g = mergeG(L);
  GEO[key] = g;
  return g;
}
function wheelGeo(fat) {
  const key = 'wheel' + (fat ? 'f' : '');
  if (GEO[key]) return GEO[key];
  const L = [], tube = fat ? 0.085 : 0.066;
  L.push(prep(new THREE.TorusGeometry(0.32 - tube, tube, 8, 22), '#151517', null, [0, Math.PI / 2, 0]));
  L.push(prep(new THREE.TorusGeometry(0.21, 0.018, 5, 22), '#b9bec7', null, [0, Math.PI / 2, 0]));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; L.push(boxG(0.02, 0.2, 0.03, '#9aa0a8', [0, Math.cos(a) * 0.1, Math.sin(a) * 0.1], [a, 0, 0])); }
  L.push(cylG(0.05, 0.05, 0.12, 10, '#6b6f77', null, [0, 0, Math.PI / 2]));
  L.push(cylG(0.15, 0.15, 0.012, 16, '#c0c4ca', [0.06, 0, 0], [0, 0, Math.PI / 2]));
  const g = mergeG(L); GEO[key] = g; return g;
}
function lightsGeo() {
  if (GEO.lights) return GEO.lights;
  const L = [];
  L.push(prep(new THREE.CircleGeometry(0.09, 14), '#fff6dc', [0, 0.97, -0.84], [Math.PI, 0, 0]));
  L.push(boxG(0.14, 0.05, 0.02, '#ff2a1a', [0, 0.82, 0.98]));
  const g = mergeG(L); GEO.lights = g; return g;
}
let BMAT = null;
function bikeMats() {
  if (BMAT) return BMAT;
  BMAT = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 }),
    wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }),
    lights: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glow: new THREE.SpriteMaterial({ map: textures().glow, color: '#ffe8b8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }),
    tailGlow: new THREE.SpriteMaterial({ map: textures().glow, color: '#ff3020', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }),
    beaconR: new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false }),
    beaconB: new THREE.MeshBasicMaterial({ color: '#2a6bff', toneMapped: false })
  };
  return BMAT;
}

// A bike and its rider. The rider has its own root so it can tumble away from the bike.
function makeBike(R, o) {
  o = o || {};
  const M = bikeMats(), b = BIKES[R.kind] || BIKES.thunder, kind = b.fam;
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const body = new THREE.Mesh(bikeBodyGeo(kind, R.paint, b.trim, o.patrol), M.body); body.castShadow = true;
  const wf = new THREE.Mesh(wheelGeo(kind === 'thunder'), M.wheel); wf.position.set(0, 0.32, -0.71); wf.castShadow = true;
  const wr = new THREE.Mesh(wheelGeo(kind === 'thunder'), M.wheel); wr.position.set(0, 0.32, 0.71); wr.castShadow = true;
  const lights = new THREE.Mesh(lightsGeo(), M.lights);
  root.add(body, wf, wr, lights);
  let glow = null, tail = null;
  if (o.night) {
    tail = new THREE.Sprite(M.tailGlow); tail.position.set(0, 0.82, 1.02); tail.scale.set(0.6, 0.6, 1); root.add(tail);
  }
  let beacon = null;
  if (o.patrol) {
    beacon = { r: new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), M.beaconR), b: new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), M.beaconB) };
    beacon.r.position.set(-0.07, 1.64, 0.74); beacon.b.position.set(0.07, 1.64, 0.74); root.add(beacon.r, beacon.b);
  }
  const p = POSE[KIND_POSE[kind]];
  const rroot = new THREE.Group(); rroot.rotation.order = 'YXZ';
  const lean = new THREE.Group(); rroot.add(lean);
  const torso = new THREE.Group(); torso.position.set(p.pelvis[0], p.pelvis[1], p.pelvis[2]); lean.add(torso);
  // The rider is a person: proportions, a face that blinks and looks about, gloves on the bars.
  // The figure sits with its pelvis on the torso pivot, so the tumble and the lean move it whole.
  // The person in the saddle is built a moment later (attachRider), a few per frame, so the
  // first frame of a course, and the menu behind it, costs no more than a bare bike.
  const humOpts = { seed: 41 + (R.idx || 0) * 17 + (o.patrol ? 300 + (o.pi || 0) * 7 : 0), sex: FEMALE.test(R.name || '') ? 'f' : 'm', build: kind === 'thunder' ? 'heavy' : kind === 'phantom' ? 'athletic' : 'average',
    castShadow: true, outfit: { top: R.jacket, top2: o.patrol ? '#c8ff3a' : null, sleeves: 'long', bottom: o.patrol ? '#2a3550' : '#23262d', legs: 'trousers', shoes: '#1a1716', soles: '#2a2622', gloves: '#1f1f22', helmet: R.helmet } };
  const arms = [new THREE.Object3D(), new THREE.Object3D()];
  return { root, body, wf, wr, lights, glow, tail, beacon, rroot, lean, torso, arms, hum: null, humOpts, emoK: '', pose: p, kind, R, tum: { x: 0, y: 0, z: 0, rx: 0, rz: 0 }, crPh: -1, arms2: '' };
}
function attachRider(B) {
  const o = B.humOpts; o.quality = Math.max(0, R3.quality);
  const hum = createHuman(o);
  hum.play('drive', { bars: true, hold: true });
  const hk = hum.height / 1.75;
  hum.group.rotation.y = Math.PI; hum.group.position.set(0, -0.45 * hk, -0.1 * hk);
  hum.mesh.userData.keepMat = true; B.torso.add(hum.group);
  B.hum = hum;
}
// Riders, then the roadside crowds, joined to the scene one or two per frame once a few frames
// of the course have drawn: nothing of it lands in the first frame or the menu's start-up.
function pumpPeople() {
  const r = R3, q = r.peopleQ; if (!q) return;
  if (r.peopleWait > 0) { r.peopleWait--; return; }
  for (let n = 0; n < 1 && q.length; n++) { const B = q.shift(); if (!B.hum && B.rroot.parent) attachRider(B); }
  if (!q.length) {
    if (r.quality >= 1 && r.cur && !r.cur.people) { makeSpectators(r.cur.T, r.cur); r.lodT = 0; }
    r.peopleQ = null;
  }
}

const _pp = { x: 0, y: 0, z: 0 };
const RP = { x: 0, y: 0, z: 0, h: 0, pitch: 0 };
// Where a rider (or a point beside, above and ahead of them) is in the world: on the road, or out on
// an old bridge. Also leaves the heading and pitch of that spot in RP.
function riderAt(T, R, lat, up, fwd) {
  fwd = fwd || 0;
  if (R.sc) {
    const sc = R.sc, u = clamp(R.scU, 0, 1);
    scPoint(sc, clamp(u + fwd / sc.len, 0, 1), RP);
    RP.x += Math.cos(sc.h) * lat; RP.z += Math.sin(sc.h) * lat; RP.y += up;
    RP.h = sc.h; RP.pitch = sc.pitch + Math.cos(Math.PI * u) * Math.atan(sc.hump * Math.PI / sc.len);
    return RP;
  }
  posAt(T, R.s + fwd, R.x + lat, up, RP); RP.h = FR.h; RP.pitch = FR.pitch;
  return RP;
}
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Place a bike and rider from the rider's (s, x) and its animation state.
function poseBike(B, W, R, dt) {
  const T = W.T;
  riderAt(T, R, 0, 0, 0);
  if (B.hs == null || dt <= 0 || Math.abs(wrapA(RP.h - B.hs)) > 2) B.hs = RP.h;
  else B.hs += wrapA(RP.h - B.hs) * Math.min(1, dt * 9);
  const yaw = -B.hs + Math.atan2(R.vx * 0.6, Math.max(6, R.v)) * -1;
  const root = B.root;
  root.position.set(RP.x, RP.y, RP.z);
  const pitch = RP.pitch;
  let lean = R.lean;
  const wob = R.wob > 0 ? Math.sin(R.wobPh) * R.wob * 0.16 : 0;
  root.rotation.set(-pitch, yaw + wob * 0.6, -(lean + wob));
  // the bike lies on its side in a crash and skids around; on the remount it is hauled upright
  const crashing = R.crash > 0, mount = crashing && R.crashPh === 3;
  if (crashing) {
    const t = R.crashT, e = Math.min(1, t * 4);
    root.rotation.y = yaw + R.crashSpin * Math.min(t, 1.2);
    root.position.y = RP.y + 0.12 * e;
    root.rotation.z = -lean;
    if (mount) { const u = smooth01(R.phT / 0.5); root.rotation.z = -lean * (1 - u); root.position.y = RP.y + 0.12 * (1 - u); }
  }
  B.wf.rotation.x = -R.wheel; B.wr.rotation.x = -R.wheel;
  // a flicker on the patrol beacon, steady under reduced motion
  if (B.beacon) {
    const on = ARC.reducedMotion ? 1 : (Math.floor(R.beacon * (R.siren ? 9 : 6)) % 2);
    B.beacon.r.material.color.setScalar(1); B.beacon.r.visible = ARC.reducedMotion || on === 1; B.beacon.b.visible = ARC.reducedMotion || on === 0;
  }
  // the rider
  const rr = B.rroot, hk = B.hum ? B.hum.height / 1.75 : 1;
  if (!crashing || mount) {
    rr.position.copy(root.position); rr.rotation.copy(root.rotation);
    const tuck = clamp((R.v - 25) / 25, 0, 1) * B.pose.lean;
    B.lean.rotation.set(0, 0, 0); B.lean.position.set(0, 0, 0);
    // lean the body further into the bend than the bike
    B.torso.rotation.set(tuck * 0.18, 0, -R.lean * 0.35);
    B.torso.position.set(B.pose.pelvis[0] + clamp(R.lean, -1, 1) * 0.12, B.pose.pelvis[1] - tuck * 0.04, B.pose.pelvis[2]);
    if (mount) { const u = smooth01(R.phT / 0.5); B.torso.position.y = lerp(0.45 * hk, B.pose.pelvis[1], u); B.torso.position.z = lerp(0.6, B.pose.pelvis[2], u); }
    // a blow: the shoulder and hips go into it; a hit taken snaps the body away
    if (R.atkK) {
      const k = clamp(R.atkT / R.atkDur, 0, 1), sd = R.atkSide, pk = Math.sin(Math.PI * clamp((k - 0.1) / 0.6, 0, 1));
      B.torso.rotation.z += -sd * (R.atkK === 2 ? -0.28 : 0.42) * pk;
      B.torso.position.x += sd * (R.atkK === 2 ? -0.08 : 0.16) * pk;
    }
    if (R.hitT > 0) { const k = Math.sin(Math.PI * clamp(1 - R.hitT / 0.38, 0, 1)); B.torso.rotation.z += R.hitSide * 0.35 * k; B.torso.position.x += R.hitSide * 0.1 * k; }
    if (R.guard) B.torso.rotation.x += 0.12;
    // a person, not a mannequin: breathing on the grid, a glance back at whoever is close,
    // a fist after a pass, a shake of the head after a slip, an arm up crossing the line
    const tt = W.t + R.idx * 1.7, rm = ARC.reducedMotion;
    if (R.emo && R.emo.t > 0 && R.isPlayer) R.emo.t -= dt;
    const E = R.emo, ek = E && E.t > 0 ? Math.sin(Math.PI * clamp(1 - E.t / E.d, 0, 1)) : 0;
    if (W.phase === 'grid' || W.phase === 'intro' || R.v < 2) {
      const br = Math.sin((W.t + R.idx + (R3 ? R3.time : 0)) * 1.9);
      B.torso.position.y += br * 0.008; B.torso.rotation.x += br * 0.02;
      B.torso.rotation.y = Math.sin(tt * 0.45) * 0.35 * Math.max(0, Math.sin(tt * 0.21));
    } else if (ek > 0 && !R.atkK) {
      if (E.k === 'look') B.torso.rotation.y = (R.x > W.P.x ? 1 : -1) * 0.55 * ek;
      else if (E.k === 'shake') B.torso.rotation.y = Math.sin(tt * (rm ? 6 : 13)) * 0.18 * ek;
    }
    B.tum.x = 0; B.tum.y = 0; B.tum.z = 0;
  } else {
    // thrown off: the rider rolls away, sits up dazed, then runs back to the bike
    const t = R.crashT, sd = R.crashDir, ph = R.crashPh;
    posAt(T, R.s + R.rd, R.rx, 0, _pp);
    rr.rotation.order = 'YXZ';
    if (ph === 0) {
      const k = clamp(t / 0.95, 0, 1), hop = Math.max(0, Math.sin(Math.min(1, t / 0.95) * Math.PI) * 0.7);
      rr.position.set(_pp.x, _pp.y + hop, _pp.z);
      rr.rotation.set(t < 0.95 ? 0.3 : 0.15, -FR.h + R.crashSpin * 0.3, -sd * k * TAU * 1.25);
      B.torso.rotation.set(0.9, 0, 0); B.torso.position.set(0, 0.45, 0.1);
    } else {
      rr.position.set(_pp.x, _pp.y, _pp.z);
      let ry = -FR.h + Math.PI + sd * 0.5;
      if (ph === 2 || ph === 1) {
        // face the bike (it lies behind, where it slid to a stop)
        const dx = root.position.x - _pp.x, dz = root.position.z - _pp.z;
        if (dx * dx + dz * dz > 0.04) ry = Math.atan2(-dx, -dz);
      }
      B.ryS = B.ryS == null || dt <= 0 ? ry : B.ryS + wrapA(ry - B.ryS) * Math.min(1, dt * 7);
      rr.rotation.set(0, B.ryS, 0);
      B.torso.rotation.set(0, 0, 0); B.torso.position.set(0, 0.45 * hk, 0.1 * hk);
    }
  }
  if (B.hum) poseRider(B, W, R, dt, crashing && !mount);
  // blink while invulnerable after a remount (never under reduced motion)
  const vis = !(R.invuln > 0 && !ARC.reducedMotion && Math.floor(R.invuln * 10) % 2 === 0);
  rr.visible = vis; root.visible = vis || R.invuln <= 0;
  // a bike waits for its rider before it shows
  if (!B.hum) { rr.visible = false; root.visible = false; }
}

// The person on the bike: feet on the pegs, a tuck that matches the bike, hands on the bars,
// eyes on the road ahead or on whoever is alongside, and the emotion of the moment. In a fight:
// an arm thrown at the rider alongside, a leg swung out for a kick, forearms up to guard.
// hip pitch, knee bend, forward lean of the spine, knee splay: worked out from each bike's saddle,
// knee and footpeg points so the thigh and shin reach the peg (roadster upright, cruiser feet forward, sport tucked)
const LEGS = { roadster: [-1.22, 2.0, 0.15, 0.1], cruiser: [-1.5, 1.05, 0.0, 0.22], sport: [-1.29, 2.05, 0.45, 0.12] };
const _look = new THREE.Vector3();
function poseRider(B, W, R, dt, crashing) {
  const H = B.hum, bn = H.bones, pk = KIND_POSE[B.kind], leg = LEGS[pk];
  H.steer = crashing ? 0 : clamp(R.vx / (R.steerMax || 6), -1, 1);
  // what this rider is looking at
  let look = null;
  const E = R.emo, ek = E && E.t > 0 ? Math.sin(Math.PI * clamp(1 - E.t / E.d, 0, 1)) : 0;
  if (!crashing && R.atkK) { riderAt(W.T, R, R.atkSide * 2, 1.3, 0.2); look = _look.set(RP.x, RP.y, RP.z); }
  else if (!crashing && E && E.t > 0 && E.k === 'look') {
    let best = null, bd = 99;
    for (let i = 0; i < W.riders.length; i++) { const o = W.riders[i]; if (o === R) continue; const ds = R.s - o.s; if (ds > 0 && ds < bd && Math.abs(o.x - R.x) < 4) { bd = ds; best = o; } }
    if (best) { posAt(W.T, best.s, best.x, 1.2, V2); look = _look.set(V2.x, V2.y, V2.z); }
  } else if (!crashing && (W.phase === 'grid' || W.phase === 'intro')) { posAt(W.T, START_S + 2, -6.5, 1.6, V2); look = _look.set(V2.x, V2.y, V2.z); }
  else if (!crashing) { riderAt(W.T, R, -R.x * 0.5, 1.0, 30); look = _look.set(RP.x, RP.y, RP.z); }
  else if (R.crashPh === 2) { look = _look.copy(B.root.position); look.y += 0.8; }
  H.lookAt(look);
  // a fresh feeling plays once
  const k = E && E.t > 0 ? E.k : '';
  if (k !== B.emoK) {
    if (k === 'fist' && !R.atkK) H.play('fistPump', { side: 'left' });
    else if (k === 'crash') { H.stop('drive'); H.play('handsOnHead'); }
    B.emoK = k;
  }
  // the crash: dazed in a crouch, then the run back
  const ph = crashing ? R.crashPh : -1;
  if (ph !== B.crPh) {
    if (ph === 1) { H.stop(); H.play('crouch', { hold: true }); }
    else if (ph === 2 || ph === -1) H.stop('crouch');
    B.crPh = ph;
  }
  if (!crashing && !H.playing('drive')) H.play('drive', { bars: true, hold: true });
  if (R.finished && R.place <= 3 && !B.cheered && R.v < 18) { B.cheered = true; H.play('celebrate'); }
  H.setMood(R.finished ? (R.place <= 3 ? 1 : -0.3) : crashing ? -0.5 : R.atkK || R.guard ? -0.15 : E && E.t > 0 && E.k === 'shake' ? -0.6 : 0.15);
  // arms in a fight, set before the update so the solver takes them this frame
  if (!B.aimV) { B.aimV = new THREE.Vector3(); B.gL = new THREE.Vector3(); B.gR = new THREE.Vector3(); }
  const headY = B.pose.head[1];
  let arms = '';
  if (!crashing && R.atkK === 1 && R.atkT < R.atkDur * 0.8) {
    const kk = R.atkT / R.atkDur, side = R.atkSide > 0 ? 'right' : 'left';
    riderAt(W.T, R, R.atkSide * (kk < 0.2 ? 0.9 : 2.2), headY - 0.12, kk < 0.2 ? -0.1 : 0.35);
    B.aimV.set(RP.x, RP.y, RP.z); H.aim(side, B.aimV, { elbow: kk < 0.2 ? 1.6 : 0.08 });
    H.aim(side === 'right' ? 'left' : 'right', null);
    arms = side;
  } else if (!crashing && R.guard) {
    riderAt(W.T, R, -0.16, headY + 0.02, 0.42); B.gL.set(RP.x, RP.y, RP.z);
    riderAt(W.T, R, 0.16, headY + 0.02, 0.42); B.gR.set(RP.x, RP.y, RP.z);
    H.aim('left', B.gL, { elbow: 2.25 }); H.aim('right', B.gR, { elbow: 2.25 });
    arms = 'guard';
  }
  if (arms !== B.arms2) { if (!arms) { H.aim('left', null); H.aim('right', null); } B.arms2 = arms; }
  // riders far down the road are animated a few times a second, not every frame
  const far = B.rroot.position.distanceToSquared(R3.camera.position) > 3600;
  B.hAcc = (B.hAcc || 0) + dt;
  if (far && B.hAcc < 0.12) return;
  H.update(B.hAcc, { speed: ph === 2 ? R.runV : 0, turn: 0, accel: 0 });
  B.hAcc = 0;
  if (crashing) return;
  // legs down to the pegs; the sport bike's rider tucks over the tank
  bn.hipL.rotation.x = bn.hipR.rotation.x = leg[0];
  bn.kneeL.rotation.x = bn.kneeR.rotation.x = leg[1];
  bn.hipL.rotation.z = leg[3]; bn.hipR.rotation.z = -leg[3];
  const tuck = clamp((R.v - 25) / 25, 0, 1) * B.pose.lean;
  bn.spine.rotation.x += leg[2] + tuck * 0.25;
  bn.neck.rotation.x -= (leg[2] + tuck * 0.25) * 0.7;
  // the body leans a little further into the bend than the bike, the inside knee opens
  bn.chest.rotation.z += R.lean * 0.18;
  if (R.lean > 0.2) bn.hipL.rotation.z += R.lean * 0.4; else if (R.lean < -0.2) bn.hipR.rotation.z += R.lean * 0.4;
  // a punch: the chest turns into it
  if (R.atkK === 1) { const kk = R.atkT / R.atkDur; bn.chest.rotation.y += -R.atkSide * 0.38 * Math.sin(Math.PI * clamp(kk * 1.4, 0, 1)); }
  // a kick: the leg on that side swings out straight, the body leans away to load it
  if (R.atkK === 2) {
    const kk = R.atkT / R.atkDur, sw = Math.sin(Math.PI * clamp((kk - 0.1) / 0.75, 0, 1)), right = R.atkSide > 0;
    const hip = right ? bn.hipR : bn.hipL, knee = right ? bn.kneeR : bn.kneeL;
    hip.rotation.z += (right ? -1 : 1) * 1.15 * sw; hip.rotation.x = lerp(leg[0], -0.55, sw);
    knee.rotation.x = lerp(leg[1], 0.15, sw);
    bn.chest.rotation.z += (right ? 1 : -1) * 0.3 * sw;
  }
  // a blow taken: the head snaps and the chest gives
  if (R.hitT > 0) { const kk = Math.sin(Math.PI * clamp(1 - R.hitT / 0.38, 0, 1)); bn.head.rotation.y += R.hitSide * 0.45 * kk; bn.chest.rotation.z += -R.hitSide * 0.2 * kk; }
  // a shake of the head after a slip or being passed
  if (ek > 0 && E.k === 'shake') bn.head.rotation.y += Math.sin(W.t * 13) * 0.25 * ek;
}

/* ------------------------------------------------------------ people at the roadside */
// Villagers and race fans: a crowd at the start and the finish, people outside the village
// houses and around the chai stalls. Each crowd is one instanced draw animated on the GPU,
// every member on their own phase (they never move in sync), facing the road. Two marshals in
// full detail: one flags the start, one waves the riders home.
// Soft contact shadows under people who do not cast real ones (crowds, passers-by): one
// instanced draw of a dark radial blob at each pair of feet, so nobody seems to float.
let BLOB_TEX = null;
function footShadows(parent, n) {
  if (!BLOB_TEX) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    BLOB_TEX = new THREE.CanvasTexture(c);
  }
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), Math.max(1, n));
  mesh.userData.keepMat = true; mesh.renderOrder = 1; mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const api = {
    mesh,
    set(i, x, y, z, s) { m.makeScale(s, 1, s * 0.8); m.setPosition(x, y + 0.02, z); mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; },
  };
  parent.add(mesh);
  return api;
}

function spectatorSpots(T) {
  const D = decorFor(T), r = rng(4242 + COURSE_IDX[T.id] * 31), N = T.N;
  const ok = (s, sd) => { const i = rowOf(T, s), k = sd < 0 ? T.KL[i] : T.KR[i]; return k > -0.3 && k < 0.55 && T.TUN[i] < 0.1; };
  const put = (list, s, sd, off) => { groundPos(T, s, sd * off, V); posAt(T, s, 0, 1.4, V2); list.push({ x: V.x, y: V.y, z: V.z, yaw: Math.atan2(V2.x - V.x, V2.z - V.z) + (r() - 0.5) * 0.5 }); };
  const ends = [], road = [];
  const bank = (list, s0, s1, rows, step) => {
    for (let sd = -1; sd <= 1; sd += 2) for (let s = s0; s < s1; s += step) { if (!ok(s, sd)) continue; for (let j = 0; j < rows; j++) if (r() < 0.82) put(list, s + (r() - 0.5) * step * 0.6, sd, 7.55 + j * 0.75 + r() * 0.25); }
  };
  bank(ends, START_S - 22, START_S + 26, 2, 0.95);
  bank(ends, T.finishS - 34, T.finishS + 12, 3, 0.85);
  D.houses.forEach((h) => { const sd = Math.sign(h.x) || 1; if (r() < 0.65 && ok(h.s, sd)) for (let k = 0; k < 2 + ((r() * 3) | 0); k++) put(road, h.s + (r() - 0.5) * 6, sd, 7.6 + r() * 1.4); });
  D.chai.forEach((c) => { const sd = Math.sign(c.x) || 1; for (let k = 0; k < 5; k++) put(road, c.s + (r() - 0.5) * 7, sd, 7.7 + r() * 1.6); });
  D.temple.forEach((c) => { const sd = Math.sign(c.x) || 1; for (let k = 0; k < 4; k++) if (ok(c.s, sd)) put(road, c.s + (r() - 0.5) * 8, sd, 7.8 + r() * 1.5); });
  void N;
  return { ends, road };
}
function flagGeo(check) {
  const tex = canvasTex(64, 48, (g, w, h) => { if (check) { for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea'; g.fillRect(x * 8, y * 8, 8, 8); } } else { g.fillStyle = '#2f9a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, 6); } }, { clamp: true });
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.5, metalness: 0.4 }));
  pole.position.y = 0.3; grp.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36, 6, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.position.set(0.26, 0.56, 0); grp.add(cloth);
  grp.userData.cloth = cloth;
  return grp;
}
function makeSpectators(T, S) {
  if (S.people) return S.people;
  const sp = spectatorSpots(T), q = R3 ? Math.max(0, R3.quality) : 2;
  const mk = (members, seed) => {
    if (!members.length) return null;
    const c = createCrowd({ members, unit: 1, seed, seated: false, quality: Math.max(1, q), colors: ['#e7672e', '#2b7fc1', '#f2c230', '#c2272d', '#f4f1ea'], teamShare: 0.35 });
    c.mesh.userData.keepMat = true; S.group.add(c.mesh); return c;
  };
  const marshal = (s, off, check) => {
    const h = createHuman({ seed: check ? 77 : 55, quality: q, outfit: { top: '#ff7a1a', top2: '#f4f1ea', sleeves: 'long', bottom: '#2a2f3a', legs: 'trousers', cap: '#ff7a1a' } });
    groundPos(T, s, off, V); h.group.position.set(V.x, V.y, V.z);
    posAt(T, s, 0, 0, V2); h.group.rotation.y = Math.atan2(V2.x - V.x, V2.z - V.z) + (check ? 0.6 : -0.6);
    const f = flagGeo(check); f.rotation.set(Math.PI / 2, 0, 0); f.position.set(0, -0.05, 0); h.bones.wristR.add(f);
    h.mesh.userData.keepMat = true; S.group.add(h.group);
    return { h, flag: f, s, check, cd: 0 };
  };
  const ends = mk(sp.ends, 11 + COURSE_IDX[T.id]), road = mk(sp.road, 23 + COURSE_IDX[T.id]);
  const feet = (list, c) => { if (!c) return; const fs = footShadows(S.group, list.length); list.forEach((m, i) => fs.set(i, m.x, m.y, m.z, 0.62)); c.feet = fs.mesh; };
  feet(sp.ends, ends); feet(sp.road, road);
  S.people = { ends, road, start: marshal(START_S + 3, -6.6, false), fin: marshal(T.finishS + 2, 6.6, true), cheerT: 0 };
  return S.people;
}
const _hp = new THREE.Vector3();
function updatePeople(W, dt) {
  const S = R3.cur, pp = S && S.people; if (!pp) return;
  const P = W.P, T = W.T, q = R3.quality;
  const show = q >= 1;
  pp.start.h.group.visible = pp.fin.h.group.visible = show;
  if (!show) { [pp.ends, pp.road].forEach((c) => { if (c) c.mesh.visible = c.feet.visible = false; }); return; }
  posAt(T, P.s, P.x, 1.2, V); _hp.set(V.x, V.y, V.z);
  const nearStart = Math.abs(P.s - START_S) < 120, nearFin = Math.abs(P.s - T.finishS) < 160;
  if (pp.ends) { pp.ends.mesh.visible = pp.ends.feet.visible = (nearStart || nearFin) && q >= 0; if (pp.ends.mesh.visible) pp.ends.update(dt, { look: _hp, excite: W.phase === 'grid' ? 0.35 : W.phase === 'finished' ? 0.6 : 0.42 }); }
  if (pp.road) { pp.road.mesh.visible = pp.road.feet.visible = q >= 1; if (pp.road.mesh.visible) pp.road.update(dt, { look: _hp, excite: 0.22 }); }
  // the crowd goes up as the pack goes by, and again for the finish
  pp.cheerT -= dt;
  if (pp.cheerT <= 0 && pp.ends && (Math.abs(P.s - START_S) < 18 || Math.abs(P.s - T.finishS) < 22) && W.phase !== 'grid') { pp.ends.react('cheer', 0.8); pp.cheerT = 2.5; }
  if (pp.cheerT <= 0 && pp.road && W.phase === 'racing') { pp.road.react(Math.random() < 0.5 ? 'wave' : 'cheer', 0.4); pp.cheerT = 3 + Math.random() * 3; }
  // the starter holds the flag up through the countdown and sweeps it down on GO
  const st = pp.start, fn = pp.fin;
  if (nearStart) {
    const hS = st.h;
    if (W.phase === 'grid' && !hS.playing('point')) hS.play('point', { hold: true, target: _hp.set(hS.group.position.x, hS.group.position.y + 6, hS.group.position.z) });
    else if (W.phase !== 'grid' && hS.playing('point')) { hS.stop('point'); hS.play('wave'); }
    posAt(T, P.s, P.x, 1.2, V); hS.lookAt(_hp.set(V.x, V.y, V.z));
    hS.update(dt, { speed: 0, turn: 0, accel: 0 });
  }
  if (nearFin) {
    const hF = fn.h;
    fn.cd -= dt;
    if ((P.s > T.finishS - 90 || P.finished) && fn.cd <= 0) { hF.play('wave', { side: 'right' }); fn.cd = 2.1; }
    posAt(T, P.s, P.x, 1.2, V); hF.lookAt(_hp.set(V.x, V.y, V.z));
    hF.update(dt, { speed: 0, turn: 0, accel: 0 });
  }
  const tt = R3.time;
  st.flag.userData.cloth.rotation.y = Math.sin(tt * 5.3) * 0.25; fn.flag.userData.cloth.rotation.y = Math.sin(tt * 6.1 + 1) * 0.3;
}

/* ------------------------------------------------------------ traffic, cows */
function truckGeo() {
  const L = [], w = '#ffffff', dk = '#24252a', gl = '#1a2a38', ch = '#cfd2d8';
  L.push(boxG(2.3, 1.6, 1.7, w, [0, 1.75, -2.75]));             // cab
  L.push(boxG(2.2, 0.9, 0.08, gl, [0, 2.05, -3.61]));            // windscreen
  L.push(boxG(2.4, 0.5, 0.5, w, [0, 0.95, -3.4]));               // bonnet
  L.push(boxG(2.5, 0.2, 0.2, ch, [0, 0.7, -3.72]));              // bumper
  L.push(boxG(2.3, 0.25, 0.12, '#e8452c', [0, 2.7, -3.55]));      // painted crown
  for (let i = 0; i < 5; i++) L.push(boxG(0.3, 0.3, 0.1, ['#f2c230', '#2f9e5a', '#e94f8a', '#2d6fd1', '#f2c230'][i], [-0.9 + i * 0.45, 2.95, -3.5], [0, 0, Math.PI / 4]));
  L.push(boxG(2.5, 1.7, 5.2, '#c9b38a', [0, 1.85, 0.95]));       // wooden cargo body
  for (let i = 0; i < 4; i++) L.push(boxG(2.54, 0.06, 5.22, '#8a6a48', [0, 1.2 + i * 0.42, 0.95]));
  L.push(prep(new THREE.CylinderGeometry(1.25, 1.25, 5.1, 12, 1, false, -Math.PI / 2, Math.PI), w, [0, 2.7, 0.95], [Math.PI / 2, 0, 0], [1, 1, 0.55]));
  L.push(boxG(2.4, 0.3, 7.2, dk, [0, 0.62, -0.1]));               // chassis
  [-2.9, 0.5, 2.2].forEach((z) => [-1, 1].forEach((sd) => L.push(cylG(0.5, 0.5, 0.36, 14, dk, [sd * 1.05, 0.5, z], [0, 0, Math.PI / 2]))));
  return mergeG(L);
}
function busGeo() {
  const L = [], w = '#ffffff', dk = '#24252a', gl = '#18242e';
  L.push(boxG(2.55, 2.5, 10.6, w, [0, 1.85, 0]));
  L.push(boxG(2.58, 0.9, 9.2, gl, [0, 2.35, 0.3]));
  L.push(boxG(2.4, 1.2, 0.06, gl, [0, 2.2, -5.31]));
  L.push(boxG(2.6, 0.32, 10.62, '#d8d2c4', [0, 1.22, 0]));
  L.push(boxG(2.3, 0.3, 6, '#3a3d44', [0, 3.25, 0.5]));
  L.push(boxG(2.6, 0.2, 0.2, '#cfd2d8', [0, 0.65, -5.35]));
  [-3.6, 3.4].forEach((z) => [-1, 1].forEach((sd) => L.push(cylG(0.52, 0.52, 0.34, 14, dk, [sd * 1.1, 0.52, z], [0, 0, Math.PI / 2]))));
  return mergeG(L);
}
function carGeo() {
  const L = [], w = '#ffffff', dk = '#202126', gl = '#1a2633';
  L.push(boxG(1.72, 0.66, 3.9, w, [0, 0.62, 0]));
  L.push(boxG(1.5, 0.56, 2.2, w, [0, 1.2, 0.25]));
  L.push(boxG(1.52, 0.44, 2.22, gl, [0, 1.22, 0.25]));
  L.push(boxG(1.4, 0.46, 0.06, gl, [0, 1.17, -0.88], [-0.5, 0, 0]));
  [-1.25, 1.25].forEach((z) => [-1, 1].forEach((sd) => L.push(cylG(0.33, 0.33, 0.22, 12, dk, [sd * 0.8, 0.33, z], [0, 0, Math.PI / 2]))));
  return mergeG(L);
}
function tempoGeo() {
  const L = [], w = '#ffffff', dk = '#202126', gl = '#1a2633';
  L.push(boxG(1.3, 1.25, 1.0, w, [0, 1.15, -0.95]));
  L.push(boxG(1.2, 0.5, 0.05, gl, [0, 1.45, -1.46]));
  L.push(boxG(1.4, 0.55, 1.9, '#3a5a3a', [0, 0.95, 0.55]));
  L.push(boxG(1.4, 0.06, 1.9, w, [0, 1.25, 0.55]));
  L.push(boxG(1.36, 0.7, 0.06, w, [0, 1.6, 1.5]));
  L.push(cylG(0.28, 0.28, 0.18, 12, dk, [0, 0.28, -1.2], [0, 0, Math.PI / 2]));
  [-1, 1].forEach((sd) => L.push(cylG(0.28, 0.28, 0.18, 12, dk, [sd * 0.62, 0.28, 0.75], [0, 0, Math.PI / 2])));
  return mergeG(L);
}
function vLightsGeo() {
  // unit-sized: scaled per vehicle by its half width, height and half length
  const L = [];
  [-1, 1].forEach((sd) => {
    L.push(boxG(0.16, 0.05, 0.02, '#ff2a1a', [sd * 0.78, 0.3, 1.005]));
    L.push(boxG(0.14, 0.06, 0.02, '#fff2c8', [sd * 0.72, 0.28, -1.005]));
  });
  return mergeG(L);
}
function cowGeo() {
  const L = [], w = '#ffffff', hoof = '#2a2522', horn = '#4a443c';
  L.push(sphG(0.5, w, [0, 1.05, 0.05], [0.8, 0.82, 1.55], 14, 10));
  L.push(sphG(0.24, w, [0, 1.42, -0.45], [0.9, 1, 1.1]));      // hump
  L.push(boxG(0.3, 0.32, 0.48, w, [0, 1.18, -0.98], [0.5, 0, 0]));
  L.push(sphG(0.13, '#d9cfc2', [0, 1.03, -1.22], [1.1, 0.8, 1]));
  [-1, 1].forEach((sd) => {
    L.push(limbG([sd * 0.12, 1.38, -0.96], [sd * 0.26, 1.62, -0.88], 0.035, horn));
    L.push(boxG(0.2, 0.06, 0.1, w, [sd * 0.22, 1.26, -0.92], [0, 0, sd * 0.4]));
    [-0.5, 0.55].forEach((z) => { L.push(limbG([sd * 0.2, 0.9, z], [sd * 0.2, 0.08, z], 0.07, w)); L.push(cylG(0.08, 0.09, 0.1, 8, hoof, [sd * 0.2, 0.05, z])); });
  });
  L.push(sphG(0.3, '#e9d9cf', [0, 1.62, -0.2], [1.2, 0.2, 0.9]));
  L.push(limbG([0, 1.15, 0.8], [0, 0.45, 0.95], 0.025, w));
  return mergeG(L);
}

/* ------------------------------------------------------------ scenery placement (pure data, seeded) */
const decorCache = {};
function decorFor(T) {
  if (decorCache[T.id]) return decorCache[T.id];
  const r = rng(900 + COURSE_IDX[T.id] * 77), D = { guard: [], mile: [], chev: [], trees: [], far: [], rocks: [], tea: [], houses: [], chai: [], temple: [], flags: [], falls: [], lamps: [], mtn: [], mist: [], poles: [] };
  const look = T.look, N = T.N;
  const sideK = (i, sd) => (sd < 0 ? T.KL[i] : T.KR[i]);
  const lastSec = {};
  for (let i = 2; i < N - 2; i++) {
    const s = i * SEGM, row = T.rows[i], o = row.o || {}, tun = T.TUN[i] > 0.2;
    if (tun) continue;
    for (let sd = -1; sd <= 1; sd += 2) {
      const k = sideK(i, sd), lim = T.LIM[i * 2 + (sd > 0 ? 1 : 0)];
      // painted guard stones along the drop
      if (k < -0.35 && !T.sc.some((q) => q.side === sd && (Math.abs(s - q.s0) < 9 || Math.abs(s - q.s1) < 9))) D.guard.push({ s, x: sd * 7.0, n: i });
      // hedges and fences on open ground
      if (k >= -0.35 && k < 0.5 && !o.village && i % 3 === 0) D.guard.push({ s, x: sd * 7.05, n: i, low: true });
      // trees: on the valley slope and on top of banks
      const treeEvery = look.tree === 'palm' ? 5 : look.tree === 'oak' ? 6 : 3;
      if (i % treeEvery === (sd < 0 ? 0 : 1) && r() < 0.85) {
        let off;
        if (k < -0.3) off = 10 + r() * Math.min(28, lim - 10);
        else if (k > 0.5) off = 15 + r() * Math.min(25, lim - 15);
        else off = 9 + r() * Math.min(26, lim - 9);
        if (!(o.tea && off < 30) && !(o.village && off < 16)) D.trees.push({ s: s + r() * 3, x: sd * off, sc: 0.75 + r() * 0.6, yaw: r() * TAU });
      }
      if (i % 9 === (sd < 0 ? 4 : 0) && r() < 0.7) D.far.push({ s: s + r() * 30, x: sd * (40 + r() * 6), sc: 0.9 + r() * 0.8, yaw: r() * TAU });
      // rocks on cliff sides
      if (k > 0.5 && r() < 0.06) D.rocks.push({ s, x: sd * (8.2 + r() * 2), sc: 0.5 + r() * 1.2, yaw: r() * TAU });
      // tea hedges in rows across the open banks
      if (o.tea && k > -0.3 && i % 1 === 0) for (let j = 0; j < 7; j++) { const off = 9 + j * 2.6; if (off < lim - 2 && ((i + j) % 1 === 0)) D.tea.push({ s: s + (j % 2) * 1.5, x: sd * off, sc: 0.85 + r() * 0.3, yaw: 0 }); }
    }
    // milestones every 400 m
    if (i % 100 === 10) D.mile.push({ s, x: (T.KL[i] < -0.3 ? 1 : -1) * 6.9 });
    // chevron boards on the outside of hairpins
    if (row.hair && i % 4 === 0 && Math.abs(T.CV[i]) > 0.012) { const out = T.CV[i] > 0 ? -1 : 1; D.chev.push({ s, x: out * 7.3, flip: out }); }
    // set pieces, once per section, a third of the way in
    const sec = row.sec, firstRow = !lastSec[sec];
    if (firstRow) lastSec[sec] = { i, used: {} };
    const L = lastSec[sec], at = (frac) => i === L.i + Math.round(frac * (T.def.secs[sec][0] / SEGM));
    if (o.village && at(0.15)) {
      for (let h = 0; h < 7; h++) { const sd = h % 2 ? 1 : -1, ss = s + h * 14 + r() * 6; D.houses.push({ s: ss, x: sd * (11 + r() * 6), sc: 0.9 + r() * 0.35, yaw: r() < 0.5 ? 0 : Math.PI / 2, col: ['#f2a7b8', '#9cc7e8', '#f5d66b', '#f4f1ea', '#a8d8a0', '#f0b27a'][(h + sec) % 6] }); }
      for (let l = 0; l < 3; l++) D.lamps.push({ s: s + l * 34, x: (l % 2 ? 1 : -1) * 6.95 });
      D.poles.push({ s: s + 50, x: -7.2 }, { s: s + 90, x: 7.2 });
    }
    if (o.chai && at(0.45)) D.chai.push({ s, x: (T.KL[i] > 0.4 ? -1 : T.KR[i] > 0.4 ? 1 : (r() < 0.5 ? -1 : 1)) * 9.6 });
    if (o.temple && at(0.6)) D.temple.push({ s, x: (T.KL[i] > 0.3 ? -1 : 1) * 12.5 });
    if (o.flags && at(0.3)) { D.flags.push({ s }); D.flags.push({ s: s + 26 }); }
    if (o.falls && at(0.55)) { const sd = T.KR[i] > 0.4 ? 1 : -1; D.falls.push({ s, x: sd * 11, sd }); }
  }
  // far mountains
  for (let s = -200; s < T.L + 400; s += 210) {
    for (let sd = -1; sd <= 1; sd += 2) {
      const i = clamp(Math.floor(s / SEGM), 0, N - 1), k = sideK(i, sd);
      if (look.sea && k < 0.4) continue;
      D.mtn.push({ s, x: sd * (k > 0.4 ? 230 + r() * 220 : 420 + r() * 380), sc: 0.8 + r() * 0.9, yaw: r() * TAU, v: (r() * 3) | 0 });
    }
  }
  // mist banks drifting in the valley
  for (let i = 4; i < N; i += 9) {
    for (let sd = -1; sd <= 1; sd += 2) if (sideK(i, sd) < -0.4 && r() < 0.7) D.mist.push({ s: i * SEGM, x: sd * (22 + r() * 40), y: -14 - r() * 34, sc: 30 + r() * 30 });
  }
  decorCache[T.id] = D;
  return D;
}

/* ------------------------------------------------------------ scenery models */
function pineGeo() {
  const L = [cylG(0.12, 0.2, 2.4, 6, '#5a3e2b', [0, 1.2, 0])];
  for (let k = 0; k < 4; k++) L.push(prep(new THREE.ConeGeometry(1.7 - k * 0.32, 2.6, 8), k % 2 ? '#2f4f33' : '#294a2f', [0, 2.6 + k * 1.45, 0]));
  return mergeG(L);
}
function oakGeo() {
  const L = [limbG([0, 0, 0], [0.2, 7, 0.1], 0.18, '#6b5442'), limbG([0.1, 4, 0], [1.4, 6.5, 0.4], 0.08, '#6b5442')];
  L.push(sphG(1.6, '#4f6e33', [0.3, 7.8, 0.1], [1.2, 0.85, 1.1], 9, 7), sphG(1.2, '#5c7c3a', [1.6, 6.8, 0.4], [1.1, 0.8, 1], 8, 6), sphG(1.1, '#466a30', [-0.8, 6.6, -0.4], [1.1, 0.8, 1], 8, 6));
  return mergeG(L);
}
function palmGeo() {
  const L = [];
  let x = 0, y = 0;
  for (let k = 0; k < 6; k++) { const nx = x + 0.12 + k * 0.03, ny = y + 1.3; L.push(limbG([x, y, 0], [nx, ny, 0], 0.16 - k * 0.012, k % 2 ? '#7a6248' : '#6b553f')); x = nx; y = ny; }
  for (let f = 0; f < 8; f++) {
    const a = f / 8 * TAU, dx = Math.cos(a), dz = Math.sin(a);
    L.push(limbG([x, y, 0], [x + dx * 1.5, y + 0.45, dz * 1.5], 0.06, '#3f6e2f'));
    L.push(limbG([x + dx * 1.5, y + 0.45, dz * 1.5], [x + dx * 3.0, y - 0.55, dz * 3.0], 0.045, '#4a7a34'));
    L.push(boxG(0.9, 0.02, 2.2, '#3d6a2e', [x + dx * 1.6, y + 0.15, dz * 1.6], [-0.2, -a + Math.PI / 2, 0]));
  }
  L.push(sphG(0.28, '#5a4a2a', [x, y - 0.2, 0], [1, 0.8, 1], 8, 6));
  return mergeG(L);
}
function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, r = rng(seed);
  for (let i = 0; i < p.count; i++) { const f = 0.75 + r() * 0.5; p.setXYZ(i, p.getX(i) * f * 1.3, p.getY(i) * f * 0.8 + 0.3, p.getZ(i) * f); }
  g.computeVertexNormals();
  return prep(g, '#8a8278');
}
function mountainGeo(seed) {
  const g = new THREE.ConeGeometry(160, 230, 14, 6), p = g.attributes.position, r = rng(seed), nz = vnoise(seed, 12);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x) / TAU + 0.5, h = (y + 115) / 230;
    const f = 0.7 + nz(a, h * 0.5) * 0.6 + (r() - 0.5) * 0.08;
    p.setXYZ(i, x * f, y + (h > 0.98 ? -20 * r() : 0) + nz(a * 2, h) * 30 * h, z * f);
  }
  g.computeVertexNormals();
  const gg = prep(g, '#ffffff', [0, 100, 0]);
  const col = gg.attributes.color, pp = gg.attributes.position;
  for (let i = 0; i < pp.count; i++) { const h = clamp(pp.getY(i) / 230, 0, 1); _c.set('#4d6a52').lerp(_c2.set('#8d9aa6'), h * h); col.setXYZ(i, _c.r, _c.g, _c.b); }
  return gg;
}
const _c2 = new THREE.Color();
function teaGeo() { return mergeG([sphG(1, '#ffffff', [0, 0.45, 0], [0.75, 0.55, 2.3], 8, 5)]); }
function guardGeo() { return mergeG([boxG(0.42, 0.55, 0.3, '#ffffff', [0, 0.27, 0])]); }
function hedgeGeo() { return mergeG([boxG(0.14, 0.75, 3.8, '#ffffff', [0, 0.37, 0]), boxG(0.1, 0.06, 3.8, '#ffffff', [0, 0.62, 0])]); }
function houseGeo() {
  const g = new THREE.BoxGeometry(6, 3.6, 5); g.translate(0, 1.8, 0); return g;
}
function roofGeo() {
  const L = [prep(new THREE.CylinderGeometry(3.6, 3.6, 5.6, 3, 1), '#ffffff', [0, 3.6 + 0.85, 0], [Math.PI / 2, 0, Math.PI / 2], [1, 1, 0.28]), boxG(6.6, 0.18, 5.8, '#ffffff', [0, 3.62, 0])];
  return mergeG(L);
}
function chaiGeo() {
  const L = [], post = '#6b4a2e';
  [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.4], [1.8, 1.4]].forEach((p) => L.push(cylG(0.07, 0.07, 2.6, 6, post, [p[0], 1.3, p[1]])));
  L.push(boxG(4.2, 0.12, 3.2, '#8a8f96', [0, 2.65, 0.1], [0.12, 0, 0]));
  for (let i = 0; i < 7; i++) L.push(boxG(0.6, 0.04, 1.2, i % 2 ? '#f5efe3' : '#d8452f', [-1.8 + i * 0.6, 2.4, -1.75], [-0.45, 0, 0]));
  L.push(boxG(3.4, 1.0, 0.8, '#3a6e9c', [0, 0.5, -0.9]));
  L.push(boxG(3.5, 0.08, 0.9, '#d9c49a', [0, 1.04, -0.9]));
  L.push(cylG(0.16, 0.2, 0.32, 10, '#c9ccd2', [-0.8, 1.24, -0.9]));
  L.push(cylG(0.18, 0.18, 0.08, 10, '#2a2a2a', [-0.8, 1.1, -0.9]));
  for (let i = 0; i < 5; i++) L.push(cylG(0.035, 0.03, 0.09, 6, '#f4ecd8', [0.2 + i * 0.16, 1.13, -0.95]));
  L.push(boxG(3.0, 0.08, 0.45, '#7a5232', [0, 0.45, -2.6]));
  [-1.3, 1.3].forEach((x) => L.push(boxG(0.08, 0.45, 0.4, '#7a5232', [x, 0.22, -2.6])));
  L.push(boxG(2.4, 0.6, 0.06, '#f2c230', [0, 2.95, -1.55]));
  L.push(boxG(2.5, 1.8, 0.1, '#7b5b3c', [0, 0.95, 1.4]));
  return mergeG(L);
}
function templeGeo() {
  const L = [], w = '#f4efe6', sf = '#ff8c1a';
  L.push(boxG(5, 0.6, 5, '#d6cbb8', [0, 0.3, 0]));
  L.push(boxG(3.4, 2.8, 3.4, w, [0, 2.0, 0]));
  L.push(boxG(1.2, 1.9, 0.1, '#3a2a20', [0, 1.55, -1.71]));
  for (let k = 0; k < 5; k++) L.push(boxG(3.0 - k * 0.5, 0.9, 3.0 - k * 0.5, k % 2 ? '#f0e4d0' : w, [0, 3.85 + k * 0.82, 0], [0, k * 0.1, 0]));
  L.push(prep(new THREE.ConeGeometry(0.5, 1.4, 8), '#e8b13a', [0, 8.6, 0]));
  L.push(limbG([0, 9.2, 0], [0, 10.8, 0], 0.03, '#555'));
  L.push(prep(new THREE.ConeGeometry(0.45, 1.3, 3), sf, [0.62, 10.4, 0], [0, 0, -Math.PI / 2], [1, 1, 0.1]));
  L.push(boxG(3.6, 0.25, 3.6, '#c2272d', [0, 3.45, 0]));
  return mergeG(L);
}
function lampGeo() { return mergeG([cylG(0.06, 0.09, 6, 6, '#3a3d44', [0, 3, 0]), limbG([0, 5.9, 0], [0, 6.1, -1.4], 0.04, '#3a3d44'), boxG(0.4, 0.14, 0.6, '#3a3d44', [0, 6.0, -1.5])]); }
function lampHeadGeo() { return mergeG([boxG(0.32, 0.05, 0.5, '#ffd28a', [0, 5.92, -1.5])]); }
function poleGeo() { return mergeG([cylG(0.09, 0.13, 8, 6, '#8a8178', [0, 4, 0]), boxG(1.8, 0.1, 0.1, '#6b6157', [0, 7.4, 0])]); }
function chevGeo() { const g = new THREE.BoxGeometry(1.4, 0.45, 0.06); g.translate(0, 1.05, 0); return g; }
function chevPostGeo() { return mergeG([cylG(0.04, 0.04, 1.2, 5, '#3a3d44', [-0.5, 0.6, 0.05]), cylG(0.04, 0.04, 1.2, 5, '#3a3d44', [0.5, 0.6, 0.05])]); }
function mileGeo() { const g = new THREE.BoxGeometry(0.42, 0.75, 0.2); g.translate(0, 0.37, 0); return g; }

/* ------------------------------------------------------------ building a course in 3D */
const CULL = [];         // instanced chunks and terrain pieces, hidden when far from the camera
const QUAL = [];         // meshes that only cast shadows on the top tier
const _mtx = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _sc = new THREE.Vector3(), _ps = new THREE.Vector3(), _ax = new THREE.Vector3(0, 1, 0);
function itemMatrix(T, it, m, upY) {
  groundPos(T, it.s, it.x, V);
  const yaw = -FR.h + (it.yaw || 0);
  _qt.setFromAxisAngle(_ax, yaw);
  const sc = it.sc || 1;
  _sc.set(sc, sc, sc);
  _ps.set(V.x, V.y + (upY || 0) + (it.y || 0), V.z);
  m.compose(_ps, _qt, _sc);
  return m;
}
function addInstanced(T, group, geo, mat, items, o) {
  o = o || {};
  const chunk = o.chunk || 400, buckets = new Map();
  items.forEach((it) => { const k = Math.floor(it.s / chunk); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(it); });
  buckets.forEach((list) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, j) => {
      if (o.matrix) o.matrix(it, _mtx); else itemMatrix(T, it, _mtx, o.up);
      im.setMatrixAt(j, _mtx);
      if (o.color) { _c.set(o.color(it, j)); im.setColorAt(j, _c); }
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = !!o.shadow; im.receiveShadow = o.receive !== false;
    if (o.shadow === 'q') { im.castShadow = false; QUAL.push(im); }
    im.userData.ov = !!o.ov;
    group.add(im);
    const bs = im.boundingSphere;
    CULL.push({ im, x: bs.center.x, y: bs.center.y, z: bs.center.z, r: bs.radius, far: !!o.far });
  });
}

const SCN = {};   // built course scenes by id
function buildCourseScene(T) {
  if (SCN[T.id]) return SCN[T.id];
  const tx = textures(), look = T.look, D = decorFor(T), group = new THREE.Group(), S = { group, T, falls: [], flagMat: null, waterMats: [], lit: [] };
  const N = T.N, CH = 40;
  // terrain: one grid per side, normals from the whole grid so chunks join without seams
  const NC = OFF.length;
  const sides = [-1, 1].map((sd) => {
    const P = new Float32Array(N * NC * 3), C = new Float32Array(N * NC * 3), U = new Float32Array(N * NC * 2);
    const cG = new THREE.Color(look.grass), cG2 = new THREE.Color(look.grass2), cR = new THREE.Color(look.rock), cD = new THREE.Color(look.dirt), tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const lim = T.LIM[i * 2 + (sd > 0 ? 1 : 0)], k = sd < 0 ? T.KL[i] : T.KR[i];
      frameAt(T, i * SEGM);
      let prev = 0;
      for (let j = 0; j < NC; j++) {
        const off = j < 3 ? OFF[j] : Math.min(OFF[j], Math.max(prev + 0.4, lim));
        prev = off;
        const h = bankH(T, i, sd * off);
        const q = (i * NC + j) * 3;
        P[q] = FR.x + FR.rx * sd * off; P[q + 1] = FR.y + h; P[q + 2] = FR.z + FR.rz * sd * off;
        U[(i * NC + j) * 2] = off / 4; U[(i * NC + j) * 2 + 1] = i * SEGM / 4;
        // colour: shoulder dirt, rock on walls and drops, grass on top
        const nz = hash(i * 13 + j * 7 + (sd > 0 ? 999 : 0));
        if (j <= 1) tmp.copy(cD).lerp(cR, 0.2 + nz * 0.15);
        else {
          const steep = j >= 2 && j <= 5 ? Math.abs(k) : Math.abs(k) * 0.4;
          tmp.copy(nz > 0.5 ? cG : cG2).lerp(cR, clamp(steep * 1.05 - 0.1 + (nz - 0.5) * 0.3, 0, 1));
          if (k < -0.3 && j >= 5) tmp.lerp(cG2, 0.5);
        }
        C[q] = tmp.r; C[q + 1] = tmp.g; C[q + 2] = tmp.b;
      }
    }
    // normals by central differences over the grid
    const Nn = new Float32Array(N * NC * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
    const pv = (i, j, out) => { i = clamp(i, 0, N - 1); j = clamp(j, 0, NC - 1); const q = (i * NC + j) * 3; return out.set(P[q], P[q + 1], P[q + 2]); };
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    for (let i = 0; i < N; i++) for (let j = 0; j < NC; j++) {
      pv(i + 1, j, p1); pv(i - 1, j, p0); a.subVectors(p1, p0);
      pv(i, j + 1, p1); pv(i, j - 1, p0); b.subVectors(p1, p0);
      n.crossVectors(a, b).normalize(); if (sd > 0) n.negate(); if (n.y < 0) n.negate();
      const q = (i * NC + j) * 3; Nn[q] = n.x; Nn[q + 1] = n.y; Nn[q + 2] = n.z;
    }
    return { P, C, U, Nn };
  });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tx.ground, normalMap: tx.groundN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.96, metalness: 0 });
  const damp = !look.night && look.mist > 0.5;
  S.groundMat = groundMat;
  const roadMat = new THREE.MeshStandardMaterial({ map: tx.road, normalMap: tx.roadN, normalScale: new THREE.Vector2(damp ? 0.12 : 0.24, damp ? 0.12 : 0.24), roughnessMap: damp ? tx.roadR : null, roughness: look.night ? 0.72 : damp ? 1 : 0.86, metalness: 0.02, color: look.night ? '#d8d4dc' : look.mist > 0.5 ? '#ecebef' : '#ffffff' }); // the dawn mist leaves the tarmac damp, so it catches the sky
  S.roadMat = roadMat;
  for (let c0 = 0; c0 < N - 1; c0 += CH) {
    const c1 = Math.min(N - 1, c0 + CH), rowsN = c1 - c0 + 1;
    // banks
    const pos = [], nor = [], col = [], uv = [], idx = [];
    let base = 0;
    sides.forEach((sdD, si) => {
      for (let i = c0; i <= c1; i++) for (let j = 0; j < NC; j++) {
        const q = (i * NC + j) * 3, u = (i * NC + j) * 2;
        pos.push(sdD.P[q], sdD.P[q + 1], sdD.P[q + 2]); nor.push(sdD.Nn[q], sdD.Nn[q + 1], sdD.Nn[q + 2]); col.push(sdD.C[q], sdD.C[q + 1], sdD.C[q + 2]); uv.push(sdD.U[u], sdD.U[u + 1]);
      }
      for (let i = 0; i < rowsN - 1; i++) for (let j = 0; j < NC - 1; j++) {
        const a = base + i * NC + j, b = a + NC, c = a + 1, d = b + 1;
        if (si === 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
      }
      base += rowsN * NC;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; group.add(m);
    CULL.push({ im: m, x: g.boundingSphere.center.x, y: g.boundingSphere.center.y, z: g.boundingSphere.center.z, r: g.boundingSphere.radius, terrain: true });
    // tarmac
    const rp = [], rn = [], ru = [], ri = [];
    for (let i = c0; i <= c1; i++) {
      frameAt(T, i * SEGM);
      [-1, 1].forEach((sd) => { rp.push(FR.x + FR.rx * sd * 5.62, FR.y + 0.012, FR.z + FR.rz * sd * 5.62); rn.push(0, 1, 0); ru.push(sd < 0 ? 0 : 1, i * SEGM / 16); });
    }
    for (let i = 0; i < rowsN - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; ri.push(a, b, c, b, d, c); }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2)); rg.setIndex(ri);
    rg.computeBoundingSphere();
    const rm = new THREE.Mesh(rg, roadMat); rm.receiveShadow = true; group.add(rm);
    CULL.push({ im: rm, x: rg.boundingSphere.center.x, y: rg.boundingSphere.center.y, z: rg.boundingSphere.center.z, r: rg.boundingSphere.radius, terrain: true });
  }
  // tunnels: an arched shell, a stone portal at each end and lamps along the roof
  const tunMat = new THREE.MeshStandardMaterial({ map: tx.tunnel, color: '#bdb6aa', roughness: 0.9, side: THREE.DoubleSide });
  const portalMat = new THREE.MeshStandardMaterial({ color: '#8f877b', map: tx.ground, roughness: 0.95 });
  const tLamps = [];
  let inT = false, t0 = 0;
  for (let i = 0; i <= N; i++) {
    const on = i < N && T.TUN[i] > 0.5;
    if (on && !inT) { inT = true; t0 = i; }
    if (!on && inT) {
      inT = false; const t1 = i - 1, A = 12;
      const pos = [], uv = [], idx = [];
      for (let r0 = t0; r0 <= t1; r0++) {
        frameAt(T, r0 * SEGM);
        for (let a = 0; a <= A; a++) { const an = a / A * Math.PI, x = Math.cos(an) * 7.7, y = Math.sin(an) * 6.6; pos.push(FR.x + FR.rx * x, FR.y + y, FR.z + FR.rz * x); uv.push(a / A * 4, r0 * SEGM / 6); }
        if (r0 % 3 === 0) { tLamps.push({ s: r0 * SEGM, x: -2.6, y: 6.1 }); tLamps.push({ s: r0 * SEGM, x: 2.6, y: 6.1 }); }
      }
      for (let r0 = 0; r0 < t1 - t0; r0++) for (let a = 0; a < A; a++) { const p = r0 * (A + 1) + a, q = p + A + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, tunMat); m.castShadow = true; m.receiveShadow = true; group.add(m);
      CULL.push({ im: m, x: g.boundingSphere.center.x, y: g.boundingSphere.center.y, z: g.boundingSphere.center.z, r: g.boundingSphere.radius, terrain: true });
      // portals: a stone face with the arch cut out
      [t0, t1].forEach((rr) => {
        frameAt(T, rr * SEGM);
        const pp = [], ii = [], A2 = 16;
        for (let a = 0; a <= A2; a++) {
          const an = a / A2 * Math.PI, ix = Math.cos(an) * 7.7, iy = Math.sin(an) * 6.6;
          const ox = Math.cos(an) * 17, oy = Math.max(0, Math.sin(an) * 15) + (a === 0 || a === A2 ? 0 : 1);
          pp.push(FR.x + FR.rx * ix, FR.y + iy, FR.z + FR.rz * ix, FR.x + FR.rx * ox, FR.y + oy, FR.z + FR.rz * ox);
        }
        for (let a = 0; a < A2; a++) { const p = a * 2; ii.push(p, p + 1, p + 2, p + 2, p + 1, p + 3); }
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
        const uvs = []; for (let a = 0; a <= A2; a++) uvs.push(a / A2 * 6, 0, a / A2 * 6, 3);
        pg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); pg.setIndex(ii); pg.computeVertexNormals();
        const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: '#8f877b', map: tx.ground, roughness: 0.95, side: THREE.DoubleSide })); pm.castShadow = true; pm.receiveShadow = true; group.add(pm);
      });
    }
  }
  void portalMat;
  if (tLamps.length) {
    const lm = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false });
    addInstanced(T, group, new THREE.BoxGeometry(0.5, 0.12, 1.4), lm, tLamps, { matrix: (it, m) => { posAt(T, it.s, it.x, it.y, V); _qt.setFromAxisAngle(_ax, -FR.h); m.compose(_ps.set(V.x, V.y, V.z), _qt, _sc.set(1, 1, 1)); return m; } });
  }
  // scenery
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0 }, o || {}));
  const guards = D.guard.filter((g) => !g.low), hedges = D.guard.filter((g) => g.low);
  addInstanced(T, group, guardGeo(), std({ roughness: 0.7 }), guards, { shadow: 'q', color: (it) => (it.n % 2 ? '#f4f1ea' : (T.id === 'tea' ? '#f2c230' : '#202124')) });
  addInstanced(T, group, hedgeGeo(), std({ roughness: 0.9 }), hedges, { color: (it) => (T.id === 'tea' ? '#3f6b2f' : T.id === 'coast' ? '#8a6a48' : '#4b6a3a') });
  const treeG = look.tree === 'palm' ? palmGeo() : look.tree === 'oak' ? oakGeo() : pineGeo();
  addInstanced(T, group, treeG, std({ roughness: 0.9 }), D.trees, { shadow: 'q' });
  addInstanced(T, group, look.tree === 'palm' ? palmGeo() : pineGeo(), std({ roughness: 0.95 }), D.far, { far: true, ov: true });
  addInstanced(T, group, rockGeo(4), std({ map: tx.ground, roughness: 0.95 }), D.rocks, { shadow: 'q' });
  if (D.tea.length) addInstanced(T, group, teaGeo(), std({ roughness: 0.95, map: tx.ground }), D.tea, { color: (it, j) => (hash(j * 3) > 0.5 ? '#4d8a2f' : '#3f7a2a'), chunk: 300 });
  addInstanced(T, group, mileGeo(), new THREE.MeshStandardMaterial({ map: tx.mile, roughness: 0.6 }), D.mile, { yaw: 0 });
  const houseMat = new THREE.MeshStandardMaterial({ map: tx.house, roughness: 0.85, emissiveMap: look.night ? tx.houseLit : null, emissive: look.night ? '#ffffff' : '#000000', emissiveIntensity: look.night ? 1.2 : 0 });
  addInstanced(T, group, houseGeo(), houseMat, D.houses, { shadow: true, color: (it) => it.col });
  addInstanced(T, group, roofGeo(), std({ roughness: 0.6, metalness: 0.3 }), D.houses, { shadow: true, color: (it, j) => ['#9a4a32', '#8d9399', '#b05a3a', '#6f7a84'][j % 4] });
  addInstanced(T, group, chaiGeo(), std({ roughness: 0.75 }), D.chai.map((c) => Object.assign({ yaw: c.x < 0 ? Math.PI / 2 : -Math.PI / 2 }, c)), { shadow: true });
  addInstanced(T, group, templeGeo(), std({ roughness: 0.7 }), D.temple.map((c) => Object.assign({ yaw: c.x < 0 ? Math.PI / 2 : -Math.PI / 2 }, c)), { shadow: true });
  addInstanced(T, group, lampGeo(), std({ roughness: 0.5, metalness: 0.4 }), D.lamps.map((l) => Object.assign({ yaw: l.x < 0 ? -Math.PI / 2 : Math.PI / 2 }, l)), { shadow: 'q' });
  const headMat = new THREE.MeshBasicMaterial({ color: look.night ? '#ffd28a' : '#cfcac0', toneMapped: !look.night });
  addInstanced(T, group, lampHeadGeo(), headMat, D.lamps.map((l) => Object.assign({ yaw: l.x < 0 ? -Math.PI / 2 : Math.PI / 2 }, l)));
  addInstanced(T, group, poleGeo(), std({ roughness: 0.8 }), D.poles, { shadow: 'q' });
  const chevMat = new THREE.MeshStandardMaterial({ map: tx.chev, roughness: 0.6, emissive: look.night ? '#ffffff' : '#000000', emissiveMap: tx.chev, emissiveIntensity: look.night ? 0.35 : 0 });
  const chevItems = D.chev.map((c) => Object.assign({ yaw: c.flip > 0 ? Math.PI : 0 }, c));
  addInstanced(T, group, chevGeo(), chevMat, chevItems, {});
  addInstanced(T, group, chevPostGeo(), std({}), chevItems, {});
  // prayer flags strung across the road, swaying in the wind
  const flagItems = [], flagCols = ['#2d5fd1', '#f4f1ea', '#d8352f', '#2f9e5a', '#f2c230'];
  const poleItems = [];
  D.flags.forEach((f) => {
    const n = 22;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1), x = lerp(-7.4, 7.4, u), sag = 1.6 * (1 - Math.pow(2 * u - 1, 2));
      flagItems.push({ s: f.s + u * 3, x, y: 6.4 - sag, k });
    }
    poleItems.push({ s: f.s, x: -7.5 }, { s: f.s + 3, x: 7.5 });
  });
  if (flagItems.length) {
    const fg = new THREE.PlaneGeometry(0.42, 0.34); fg.translate(0, -0.17, 0);
    const fm = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 }; S.flagShader = sh;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5; transformed.z += sin(uTime * 5.0 + ph) * 0.12 * (-position.y + 0.05) * 3.0; transformed.x += cos(uTime * 3.7 + ph) * 0.03;');
    };
    addInstanced(T, group, fg, fm, flagItems, { matrix: (it, m) => { posAt(T, it.s, it.x, it.y, V); _qt.setFromAxisAngle(_ax, -FR.h); return m.compose(_ps.set(V.x, V.y, V.z), _qt, _sc.set(1, 1, 1)); }, color: (it) => flagCols[it.k % 5] });
    addInstanced(T, group, mergeG([cylG(0.06, 0.08, 7, 6, '#7a6248', [0, 3.5, 0])]), std({}), poleItems, { shadow: 'q' });
  }
  // waterfalls down the rock wall, with a pool at the foot
  if (D.falls.length) {
    const fallTex = tx.falls.clone(); fallTex.needsUpdate = true; ALL_TEX.push(fallTex);
    const fm = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.9, depthWrite: false, color: '#e6f2ff', side: THREE.DoubleSide, fog: true });
    S.fallTex = fallTex;
    D.falls.forEach((f) => {
      // a strip laid on the rock face itself, from the pool up the wall
      const fp = [], fu = [], fi = [], OF = [8.2, 9.5, 11, 13, 15.5, 18, 21, 24, 27];
      for (let a = 0; a < 2; a++) {
        const s = f.s + (a ? 2.4 : -2.4), i = rowOf(T, s);
        for (let j = 0; j < OF.length; j++) {
          posAt(T, s, f.sd * OF[j], bankH(T, i, f.sd * OF[j]) + 0.35 + j * 0.05, V);
          fp.push(V.x, V.y, V.z); fu.push(a, j / (OF.length - 1) * 3);
        }
      }
      for (let j = 0; j < OF.length - 1; j++) { const p0 = j, p1 = j + 1, q0 = j + OF.length, q1 = q0 + 1; fi.push(p0, q0, p1, p1, q0, q1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); g.setIndex(fi);
      const m = new THREE.Mesh(g, fm); m.renderOrder = 2;
      group.add(m);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.4, 18), new THREE.MeshStandardMaterial({ color: '#6f95a8', roughness: 0.1, metalness: 0.4 }));
      groundPos(T, f.s, f.sd * 8.0, V2); pool.position.set(V2.x, V2.y + 0.06, V2.z); pool.rotation.x = -Math.PI / 2; group.add(pool);
      const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.mist, color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false }));
      mist.position.set(V2.x, V2.y + 1.6, V2.z); mist.scale.set(6, 3.5, 1); group.add(mist);
      S.falls.push({ s: f.s, sd: f.sd, x: V2.x, y: V2.y, z: V2.z });
    });
  }
  // mist banks hanging in the valley
  if (D.mist.length && look.mist > 0) {
    const mm = new THREE.MeshBasicMaterial({ map: tx.mist, transparent: true, depthWrite: false, opacity: 0.55 * look.mist + 0.15, color: look.fog, fog: true, side: THREE.DoubleSide });
    const mg = new THREE.PlaneGeometry(1, 1); mg.rotateX(-Math.PI / 2);
    addInstanced(T, group, mg, mm, D.mist, { matrix: (it, m) => { posAt(T, it.s, it.x, it.y, V); _qt.setFromAxisAngle(_ax, hash(it.s | 0) * 6); return m.compose(_ps.set(V.x, V.y, V.z), _qt, _sc.set(it.sc, 1, it.sc * 0.7)); }, ov: true, far: true });
  }
  // far mountains
  const mgs = [mountainGeo(3), mountainGeo(7), mountainGeo(11)];
  const mmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  for (let v = 0; v < 3; v++) {
    const items = D.mtn.filter((m) => m.v === v);
    addInstanced(T, group, mgs[v], mmat, items, { chunk: 1200, far: true, matrix: (it, m) => { posAt(T, it.s, it.x, 0, V); V.y = T.minY - 120; _qt.setFromAxisAngle(_ax, it.yaw); return m.compose(_ps.set(V.x, V.y, V.z), _qt, _sc.set(it.sc * 1.3, it.sc * (0.9 + 0.4 * hash(it.s | 0)), it.sc * 1.3)); } });
  }
  // start and finish gantries
  [[T.startS, tx.banner], [T.finishS, tx.finish]].forEach((gd) => {
    posAt(T, gd[0], 0, 0, V);
    const gg = new THREE.Group(); gg.position.set(V.x, V.y, V.z); gg.rotation.y = -FR.h;
    const post = new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.5, metalness: 0.6 });
    [-1, 1].forEach((sd) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 7.2, 10), post); p.position.set(sd * 7.4, 3.6, 0); p.castShadow = true; gg.add(p); });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 1.8), new THREE.MeshStandardMaterial({ map: gd[1], side: THREE.DoubleSide, roughness: 0.7, emissive: '#ffffff', emissiveMap: gd[1], emissiveIntensity: look.night ? 0.5 : 0.1 }));
    ban.position.set(0, 6.4, 0); ban.castShadow = true; gg.add(ban);
    group.add(gg);
  });
  // the valley floor (or the sea) is a broad plane that follows the camera
  const floorY = T.minY - (look.sea ? 34 : 90);
  let far;
  if (look.sea) {
    const sm = new THREE.MeshStandardMaterial({ color: '#2b4a68', roughness: 0.18, metalness: 0.65, normalMap: tx.seaN, normalScale: new THREE.Vector2(0.6, 0.6) });
    far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), sm); S.seaTex = tx.seaN;
  } else {
    const ft = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, '#ffffff', 0.4, 4000, 66, 6); const r = rng(3); for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.08 + r() * 0.12) + ')'; g.fillRect(r() * w, r() * h, 20 + r() * 50, 14 + r() * 40); } }, { repeat: [90, 90] });
    far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: look.floor, map: ft, roughness: 1 }));
  }
  far.rotation.x = -Math.PI / 2; far.receiveShadow = false; group.add(far);
  S.far = far; S.floorY = floorY;
  S.cullFrom = CULL.length;
  SCN[T.id] = S;
  // every culled piece knows which course it belongs to
  CULL.forEach((c) => { if (!c.course) c.course = T.id; });
  return S;
}

// Old bridges: where each shortcut leaves the road and where it comes back (pure data from the course).
function courseShortcuts(T) {
  const C = T.def, out = [];
  let acc = 0;
  C.secs.forEach((sec) => {
    const n = Math.round(sec[0] / SEGM), len = n * SEGM, o = sec[3] || {};
    if (o.sc) {
      const side = sec[1] > 0 ? 1 : -1, s0 = acc + len * 0.1, s1 = acc + len * 0.9;
      posAt(T, s0, side * HALF, 0.05, V); const ax = V.x, ay = V.y, az = V.z;
      posAt(T, s1, side * HALF, 0.05, V); const bx = V.x, by = V.y, bz = V.z;
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz, by - ay);
      out.push({ k: out.length, s0, s1, side, ax, ay, az, bx, by, bz, len: l, h: Math.atan2(dx, -dz), hump: 1.3 + l * 0.012, pitch: Math.atan2(by - ay, Math.hypot(dx, dz)) });
    }
    acc += len;
  });
  return out;
}

// The bridge itself: a plank deck on timber trestles over the gully, rope rails, and a painted board
// at the roadside a little before it. One merged mesh per bridge.
const _bp = { x: 0, y: 0, z: 0 };
// Built straight into typed arrays from one unit box (no geometry object per plank), so a bridge of
// several hundred parts costs a few milliseconds.
let UNIT_BOX = null;
function bridgeGeo(sc) {
  if (!UNIT_BOX) { const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); UNIT_BOX = { p: g.attributes.position.array, n: g.attributes.normal.array, c: g.attributes.position.count }; g.dispose(); }
  const parts = [], yaw = -sc.h, step = 0.62, n = Math.ceil(sc.len / step), cols = ['#7a5a3a', '#6a4a2e', '#84623e', '#5e432b'];
  const rx = Math.cos(sc.h), rz = Math.sin(sc.h);
  const add = (w, h, d, hex, x, y, z, ax, ay, az) => parts.push([w, h, d, hex, x, y, z, ax || 0, ay || 0, az || 0]);
  for (let i = 0; i <= n; i++) { scPoint(sc, i / n, _bp); add(3.9, 0.09, step * 0.86, cols[(i * 7) % 4], _bp.x, _bp.y - 0.05, _bp.z, 0, yaw, (hash(i * 3 + sc.k) - 0.5) * 0.04); }
  // posts and rope rails along both edges
  const posts = Math.ceil(sc.len / 3.2);
  for (let i = 0; i <= posts; i++) {
    scPoint(sc, i / posts, _bp);
    for (let sd = -1; sd <= 1; sd += 2) add(0.12, 1.15, 0.12, '#4e3a26', _bp.x + rx * sd * 1.95, _bp.y + 0.5, _bp.z + rz * sd * 1.95, 0, yaw, 0);
    if (i < posts) {
      scPoint(sc, (i + 0.5) / posts, _bp);
      for (let sd = -1; sd <= 1; sd += 2) for (let hh = 0; hh < 2; hh++) add(0.035, 0.035, sc.len / posts, '#c9b48a', _bp.x + rx * sd * 1.95, _bp.y + 0.62 + hh * 0.4 - 0.08 * (1 - hh), _bp.z + rz * sd * 1.95, -sc.pitch, yaw, 0);
    }
  }
  // trestle legs and braces down into the gully
  const legs = Math.max(2, Math.floor(sc.len / 9));
  for (let i = 1; i < legs; i++) {
    const u = i / legs; scPoint(sc, u, _bp);
    const depth = 10 + Math.sin(Math.PI * u) * 26;
    for (let sd = -1; sd <= 1; sd += 2) add(0.3, depth, 0.3, '#5a4430', _bp.x + rx * sd * 1.7, _bp.y - depth / 2, _bp.z + rz * sd * 1.7, 0, yaw, 0);
    add(3.6, 0.14, 0.14, '#5a4430', _bp.x, _bp.y - 1.2, _bp.z, 0, yaw, 0);
    add(0.12, 0.12, depth * 0.9, '#4e3a26', _bp.x, _bp.y - depth * 0.45, _bp.z, Math.PI / 2 - 0.35, yaw, 0);
  }
  const U = UNIT_BOX, nv = U.c * parts.length, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const nm = new THREE.Matrix3(), v = new THREE.Vector3();
  let o = 0;
  for (const q of parts) {
    _e.set(q[7], q[8], q[9], 'YXZ'); _q.setFromEuler(_e);
    _m4.compose(_p3.set(q[4], q[5], q[6]), _q, _s3.set(q[0], q[1], q[2])); nm.getNormalMatrix(_m4); _c.set(q[3]);
    for (let k = 0; k < U.c; k++, o++) {
      v.set(U.p[k * 3], U.p[k * 3 + 1], U.p[k * 3 + 2]).applyMatrix4(_m4); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      v.set(U.n[k * 3], U.n[k * 3 + 1], U.n[k * 3 + 2]).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
      col[o * 3] = _c.r; col[o * 3 + 1] = _c.g; col[o * 3 + 2] = _c.b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function signTex(text, sub, col) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = col || '#f2c230'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1a17'; g.fillRect(6, 6, w - 12, h - 12); g.fillStyle = col || '#f2c230'; g.fillRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#1c1a17'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 34px Arial, sans-serif'; g.fillText(text, w / 2, h * 0.38);
    g.font = '700 22px Arial, sans-serif'; g.fillText(sub, w / 2, h * 0.72);
  }, { clamp: true });
}
// One job per bridge, so a race start builds them over the opening flyover, a frame at a time.
function bridgeJobs(T, S) {
  if (!T.sc.length) return [];
  let mats = null;
  const matsOf = () => {
    if (mats) return mats;
    // built after the tier was applied: take the cheap material now if that is the tier
    const tierCheap = R3 && TIERS[Math.max(0, R3.quality)].cheap;
    const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const sign = new THREE.MeshStandardMaterial({ map: signTex('OLD BRIDGE', 'SHORTCUT', '#f2c230'), roughness: 0.7 }), post = new THREE.MeshStandardMaterial({ color: '#3a3026', roughness: 0.8 });
    const pick = (m) => (tierCheap ? cheapOf(m) : m);
    mats = { wood: pick(wood), sign: pick(sign), post: pick(post) };
    return mats;
  };
  return T.sc.map((sc) => () => {
    const M = matsOf();
    const g = bridgeGeo(sc); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, M.wood); m.receiveShadow = true; m.castShadow = false; QUAL.push(m); S.group.add(m);
    CULL.push({ im: m, x: g.boundingSphere.center.x, y: g.boundingSphere.center.y, z: g.boundingSphere.center.z, r: g.boundingSphere.radius, course: T.id });
    [sc.s0 - 34, sc.s0 - 4].forEach((s, j) => {
      groundPos(T, s, sc.side * (XW + (j ? 0.6 : 1.1)), V);
      const sg = new THREE.Group(); sg.position.set(V.x, V.y, V.z); sg.rotation.y = -FR.h;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), M.sign); board.position.y = 1.75; board.castShadow = true; sg.add(board);
      for (let sd = -1; sd <= 1; sd += 2) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), M.post); p.position.set(sd * 0.75, 1.1, 0.02); sg.add(p); }
      S.group.add(sg);
    });
  });
}
// The race-start queue: work a race needs before the lights go out but not in its first frame. One
// job a frame through the flyover and the countdown; anything left when the race starts runs at once.
function pumpStage(W) {
  const r = R3, q = r.stageQ; if (!q || !q.length) return;
  const all = W.phase !== 'intro' && W.phase !== 'grid';
  // the first frames of a race upload the riders, traffic and the wide view: nothing else until those are in
  if (!all && (r.stageWait > 0 || r.peopleQ)) { r.stageWait--; return; }
  do { q.shift()(); } while (all && q.length);
}

/* ------------------------------------------------------------ the podium */
let PODIUM = null;
function makePodium() {
  if (PODIUM) return PODIUM;
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.75 });
  const tops = ['#ffcf4a', '#d6dbe2', '#d89a5a'];
  const H = [1.05, 0.72, 0.48], X = [0, -1.55, 1.55];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, H[i], 1.3), stone); b.position.set(X[i], H[i] / 2, 0); b.castShadow = true; b.receiveShadow = true; g.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.06, 1.34), new THREE.MeshStandardMaterial({ color: tops[i], roughness: 0.35, metalness: 0.6 })); top.position.set(X[i], H[i] + 0.03, 0); g.add(top);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (c, w, h) => { c.fillStyle = tops[i]; c.fillRect(0, 0, w, h); c.fillStyle = '#1c1a17'; c.font = '900 46px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), w / 2, h / 2 + 2); }, { clamp: true }), roughness: 0.5 }));
    num.position.set(X[i], H[i] * 0.55, 0.66); g.add(num);
  }
  // an arch of the race colours behind it
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.12, 8, 28, Math.PI), new THREE.MeshStandardMaterial({ color: '#ff6940', roughness: 0.4, metalness: 0.3, emissive: '#ff6940', emissiveIntensity: 0.25 }));
  arch.position.set(0, 0, -1.1); g.add(arch);
  g.userData.H = H; g.userData.X = X;
  g.visible = false;
  PODIUM = g;
  return g;
}

/* ------------------------------------------------------------ weather: rain streaks around the camera */
const RAIN_VS = [
  'attribute float aEnd; uniform float uTime; uniform vec3 uCam; uniform float uLen; uniform vec2 uWind; varying float vA;',
  'void main(){',
  '  vec3 p = position;',
  '  p.y = mod(p.y - uTime * 21.0, 26.0) - 8.0;',
  '  p.x = mod(p.x - uCam.x + 18.0, 36.0) - 18.0; p.z = mod(p.z - uCam.z + 18.0, 36.0) - 18.0;',
  '  p += vec3(uWind.x, -1.0, uWind.y) * uLen * aEnd;',
  '  vec3 w = p + vec3(uCam.x, uCam.y, uCam.z);',
  '  vA = (1.0 - aEnd * 0.85) * smoothstep(18.0, 6.0, length(p.xz));',
  '  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);',
  '}'
].join('\n');
const RAIN_FS = 'uniform vec3 uCol; uniform float uAlpha; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA * uAlpha); }';
function makeRain(scene) {
  const N = 2400, pos = new Float32Array(N * 6), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = Math.random() * 36, y = Math.random() * 26, z = Math.random() * 36;
    pos.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uLen: { value: 0.75 }, uWind: { value: new THREE.Vector2(0.18, 0.05) }, uCol: { value: new THREE.Color('#d6e2ee') }, uAlpha: { value: 0.32 } }, vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, fog: false });
  m.userData.keepMat = true;
  const ls = new THREE.LineSegments(g, m); ls.frustumCulled = false; ls.renderOrder = 6; ls.visible = false; ls.userData.keepMat = true;
  scene.add(ls);
  return ls;
}

/* ------------------------------------------------------------ the 3D stage */
let R3 = null, POST = null;
let NO3D = false;
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uFog; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uCloud; uniform float uTime; uniform float uStars;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }',
  'void main(){',
  '  vec3 d = normalize(vDir); float y = d.y;',
  '  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, y));',
  '  c = mix(c, uTop, smoothstep(0.18, 0.85, y));',
  '  float sd = max(dot(d, normalize(uSunDir)), 0.0);',
  '  c += uSun * (pow(sd, 900.0) * 6.0 + pow(sd, 22.0) * 0.35 + pow(sd, 4.0) * 0.12);',
  '  if (y > 0.0) {',
  '    if (uStars > 0.0) { vec3 q = floor(d * 380.0); float st = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
  '    c += vec3(0.85, 0.9, 1.0) * smoothstep(0.9965, 1.0, st) * uStars * smoothstep(0.03, 0.3, y) * (0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0)); }',
  '    vec2 uv = d.xz / (y + 0.14) * 0.8 + vec2(uTime * 0.006, uTime * 0.002);',
  '    float n = fbm(uv * 1.6);',
  '    float cl = smoothstep(0.62 - uCloud * 0.28, 0.95, n) * smoothstep(0.0, 0.18, y);',
  '    vec3 cc = mix(vec3(1.0, 0.98, 0.95), uSun, 0.45) * (0.65 + 0.7 * pow(sd, 5.0)) + uHor * 0.15;',
  '    c = mix(c, cc, cl * 0.75);',
  '  }',
  '  c = mix(c, uFog, (1.0 - smoothstep(-0.02, 0.1, y)) * 0.85);',
  '  if (y < 0.0) c = mix(uFog, uFog * 0.8, smoothstep(0.0, -0.4, y));',
  '  gl_FragColor = vec4(c, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}'
].join('\n');

function setup3D(arc) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  RENDERER = renderer;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c6c4cc', 0.004);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 2600);
  const hemi = new THREE.HemisphereLight('#c4d2ec', '#4a4636', 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe0b8', 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 2; sc.far = 240;
  // the dawn and dusk suns sit only a few degrees up; with a small bias the road shadowed itself
  // in wavy blotches (acne), so the offset along the surface normal is larger
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.14;
  scene.add(sun, sun.target);
  const head = new THREE.SpotLight('#ffe9c4', 0, 70, 0.42, 0.55, 1.6); scene.add(head, head.target);
  const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.2, -1) }, uSun: { value: new THREE.Color() }, uCloud: { value: 0.5 }, uTime: { value: 0 }, uStars: { value: 0 } };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  R3 = {
    renderer, scene, camera, hemi, sun, head, sky, skyMat, skyU, pmrem, cur: null, bikes: null, worldRef: null, lost: false,
    quality: -1, qT: 0, qN: 0, fps: 60, soft: false, lastNow: 0, camPos: new THREE.Vector3(), camTgt: new THREE.Vector3(), camInit: false, time: 0, sunDir: new THREE.Vector3(), envs: {}, tunK: 0, lockQ: false
  };
  FX = createFX(scene);
  MARKS = makeMarks(scene, 260);
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R3.gpu = name;
    R3.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R3.soft = false; }
  arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
  arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
  // Shared post pass: bloom on headlights, lamps and nitro, grade, grain, letterbox behind the menu.
  // The grid countdown and the results orbit are this game's own camera, so no extra moves here.
  POST = createPost(renderer, { arc, soft: R3.soft, look: { bloom: 0.5, threshold: 0.72 } });
  // Spectacle: the nitro flame jet with its heat glow and speed lines, crash sparks, dust and smoke,
  // finish fireworks. Thinner on low tiers and a software renderer; its shaders compile after the menu.
  try { VFX = createVFX(renderer, scene, camera, { quality: 2, soft: R3.soft, lights: 0 }); R3.vfxWarm = 30; } catch (e) { VFX = null; }
  return true;
}

// Four looks, from everything on to a slow or software renderer.
const TIERS = [
  { px: 0.5, budget: 160000, shadow: false, map: 1024, cheap: true, cull: 320, fx: 0.4, aniso: 1, ov: false },
  { px: 0.72, budget: 520000, shadow: false, map: 1024, cheap: false, cull: 480, fx: 0.7, aniso: 2, ov: true },
  { px: 0.9, budget: 1.05e6, shadow: true, map: 1024, cheap: false, cull: 640, fx: 1, aniso: 4, ov: true },
  { px: 1, budget: 1.9e6, shadow: true, map: 2048, cheap: false, cull: 900, fx: 1, aniso: 8, ov: true }
];
function resize3D(arc) {
  if (!R3) return;
  const t = TIERS[Math.max(0, R3.quality)];
  const pr = Math.min(arc.dpr * t.px, Math.sqrt(t.budget / Math.max(1, arc.w * arc.h)));
  R3.renderer.setPixelRatio(Math.max(0.3, pr));
  R3.renderer.setSize(arc.w, arc.h, false);
  R3.camera.aspect = arc.w / arc.h; R3.camera.updateProjectionMatrix();
}
const cheapCache = new Map();
function fullOf(m) { return m.userData && m.userData.full ? m.userData.full : m; }
function cheapOf(m) {
  if (!m.isMeshStandardMaterial) return m;
  let c = cheapCache.get(m);
  if (!c) {
    c = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map, vertexColors: m.vertexColors, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity });
    c.userData.full = m; cheapCache.set(m, c);
  }
  return c;
}
function applyTier() {
  const r = R3, t = TIERS[r.quality];
  r.scene.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && !o.userData.keepMat && !o.material.userData.keepMat) {
      const full = fullOf(o.material), want = t.cheap ? cheapOf(full) : full;
      if (o.material !== want) o.material = want;
    }
  });
  const an = Math.min(t.aniso, r.renderer.capabilities.getMaxAnisotropy()); TEX_ANISO = an;
  ALL_TEX.forEach((tx) => { if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; } });
  QUAL.forEach((m) => { m.castShadow = t.shadow && r.quality >= 3; });
  r.renderer.shadowMap.enabled = t.shadow; r.sun.castShadow = t.shadow;
  if (r.sun.shadow.mapSize.x !== t.map) { r.sun.shadow.mapSize.set(t.map, t.map); if (r.sun.shadow.map) { r.sun.shadow.map.dispose(); r.sun.shadow.map = null; } }
  if (FX) FX.density = t.fx;
  if (MARKS) MARKS.setCap([0, 90, 170, 260][r.quality]);
  if (VFX) VFX.setQuality(r.quality);
  r.scene.environment = t.cheap ? null : (r.cur ? r.envs[r.cur.T.id] : null);
  lightLevels();
}
function setQuality(q) {
  if (!R3) return;
  q = clamp(q | 0, 0, 3);
  if (q === R3.quality) return;
  R3.quality = q;
  applyTier(); resize3D(ARC);
}
function lightLevels() {
  const r = R3; if (!r.cur) return;
  const L = r.cur.T.look, t = TIERS[Math.max(0, r.quality)], dark = 1 - 0.62 * r.tunK;
  r.hemi.intensity = L.hemiI * (t.cheap ? 1.6 : 1) * dark;
  r.sun.intensity = L.sunI * (t.cheap ? 1.2 : 1) * (1 - 0.85 * r.tunK) * (r.wxSun || 1);
}

function lookFor(T, S) {
  const r = R3, L = T.look;
  r.scene.fog.color.set(L.fog); r.scene.fog.density = L.fogD;
  r.hemi.color.set(L.hemiSky); r.hemi.groundColor.set(L.hemiGnd);
  r.sun.color.set(L.sun);
  r.sunDir.set(Math.sin(L.sunAz) * Math.cos(L.sunEl), Math.sin(L.sunEl), -Math.cos(L.sunAz) * Math.cos(L.sunEl)).normalize();
  const u = r.skyU;
  u.uTop.value.set(L.skyTop); u.uMid.value.set(L.skyMid); u.uHor.value.set(L.skyHor); u.uFog.value.set(L.fog); u.uSun.value.set(L.sun); u.uCloud.value = L.cloud;
  u.uSunDir.value.copy(r.sunDir); u.uStars.value = L.stars ? 1 : 0;
  r.renderer.toneMappingExposure = L.exposure;
  r.renderer.setClearColor(L.fog);
  if (!r.envs[T.id]) {
    // image-based light from this course's own sky, so paint and chrome pick up dawn, gold or dusk
    const es = new THREE.Scene(), em = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), r.skyMat); es.add(em);
    const keepFog = r.scene.fog;
    r.envs[T.id] = r.pmrem.fromScene(es, 0.02, 0.1, 100).texture;
    em.geometry.dispose(); r.scene.fog = keepFog;
  }
  const t = TIERS[Math.max(0, r.quality)];
  r.scene.environment = t.cheap ? null : r.envs[T.id];
  r.scene.environmentIntensity = L.night ? 0.55 : 0.75;
  r.head.intensity = 0;
  lightLevels();
}

/* ------------------------------------------------------------ the world in 3D: bikes, traffic, cows */
function disposeWorld3D() {
  const r = R3; if (!r.bikes) return;
  r.bikes.forEach((B) => { r.scene.remove(B.root, B.rroot); if (B.hum) B.hum.dispose(); });
  r.patrolBikes.forEach((B) => { r.scene.remove(B.root, B.rroot); if (B.hum) B.hum.dispose(); });
  r.cows.forEach((c) => r.scene.remove(c));
  Object.keys(r.traffic).forEach((k) => { const t = r.traffic[k]; r.scene.remove(t.im); t.im.dispose(); });
  if (r.tLights) { r.scene.remove(r.tLights); r.tLights.dispose(); }
  if (r.tBack) { r.scene.remove(r.tBack); r.tBack.dispose(); }
  if (r.hazMesh) { r.hazMesh.forEach((m) => { r.scene.remove(m); m.geometry.dispose(); }); }
  r.bikes = null;
}
let TRAF_GEO = null, COW_GEO = null, HAZ_MAT = null;
function activateWorld(W) {
  const r = R3, T = W.T, S = buildCourseScene(T);
  if (r.cur !== S) {
    if (r.cur) r.scene.remove(r.cur.group);
    r.scene.add(S.group); r.cur = S;
  }
  lookFor(T, S);
  // bystanders are a full-detail extra: none on the lowest tier or a software renderer
  disposeWorld3D();
  const night = !!T.look.night;
  r.bikes = W.riders.map((R) => makeBike(R, { night }));
  r.bikes.forEach((B) => r.scene.add(B.root, B.rroot));
  r.patrolBikes = W.patrols.map((p) => {
    const pr = { kind: 'thunder', paint: '#f4f4f4', jacket: '#eef1f4', helmet: '#f4f4f4', beacon: 0 };
    const B = makeBike(pr, { patrol: true, night, pi: W.patrols.indexOf(p) }); B.p = p; r.scene.add(B.root, B.rroot); return B;
  });
  // traffic: one instanced mesh per kind
  if (!TRAF_GEO) TRAF_GEO = { truck: truckGeo(), bus: busGeo(), car: carGeo(), tempo: tempoGeo(), lights: vLightsGeo() };
  const vm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
  r.traffic = {};
  ['truck', 'bus', 'car', 'tempo'].forEach((k) => {
    const list = W.traffic.filter((v) => v.kind === k); if (!list.length) return;
    const im = new THREE.InstancedMesh(TRAF_GEO[k], vm, list.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    list.forEach((v, j) => { _c.set(v.col); im.setColorAt(j, _c); });
    im.instanceColor.needsUpdate = true;
    r.scene.add(im); r.traffic[k] = { im, list };
  });
  r.tLights = new THREE.InstancedMesh(TRAF_GEO.lights, bikeMats().lights, W.traffic.length); r.tLights.frustumCulled = false; r.scene.add(r.tLights);
  const trucks = W.traffic.filter((v) => v.kind === 'truck');
  r.tBackList = trucks;
  r.tBack = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 1.9), new THREE.MeshStandardMaterial({ map: textures().truckBack, roughness: 0.7 }), Math.max(1, trucks.length)); r.tBack.frustumCulled = false; r.scene.add(r.tBack);
  // cows
  if (!COW_GEO) COW_GEO = cowGeo();
  r.cows = W.cows.map((c) => { const m = new THREE.Mesh(COW_GEO, new THREE.MeshStandardMaterial({ vertexColors: true, color: c.col, roughness: c.goat ? 0.95 : 0.85 })); m.castShadow = true; m.userData.cow = c; if (c.goat) m.scale.set(0.46, 0.5, 0.42); r.scene.add(m); return m; });
  // oil and gravel patches
  if (!HAZ_MAT) {
    const tx = textures();
    HAZ_MAT = {
      oil: new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w) => { g.clearRect(0, 0, w, w); softBlob(g, w / 2, w / 2, w / 2, 'rgba(8,8,12,A)', 0.95); const gr = g.createLinearGradient(20, 30, 100, 100); gr.addColorStop(0, 'rgba(120,60,200,.0)'); gr.addColorStop(0.5, 'rgba(60,160,200,.25)'); gr.addColorStop(1, 'rgba(200,120,60,0)'); g.fillStyle = gr; g.beginPath(); g.arc(w / 2, w / 2, w / 2.6, 0, TAU); g.fill(); }, { clamp: true }), transparent: true, depthWrite: false, roughness: 0.05, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
      gravel: new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w) => { g.clearRect(0, 0, w, w); const r = rng(5); for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * w, d = Math.hypot(x - w / 2, y - w / 2) / (w / 2); if (d > 1 || r() < d * d) continue; g.fillStyle = ['#8a7a64', '#6b5d4c', '#a8977c', '#4e443a'][i % 4]; g.fillRect(x, y, 2 + r() * 3, 2 + r() * 3); } }, { clamp: true }), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })
    };
    void tx;
  }
  r.hazMesh = W.hazards.map((h) => {
    const g = new THREE.PlaneGeometry(h.rx * 2.2, h.rs * 2.2); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, HAZ_MAT[h.kind]); posAt(T, h.s, h.x, 0.03, V); m.position.set(V.x, V.y, V.z); m.rotation.y = -FR.h; m.receiveShadow = true; m.renderOrder = 1; r.scene.add(m); return m;
  });
  FX.clear();
  if (MARKS) MARKS.clear();
  r.skid = W.riders.map(() => ({ on: false, x: 0, y: 0, z: 0, s: { on: false, x: 0, y: 0, z: 0 } }));
  // the old bridges are built for a real race only (the menu backdrop never reaches one)
  // a race left during its flyover still finishes its bridges, so the course keeps them
  while (r.stageQ && r.stageQ.length) r.stageQ.shift()();
  r.stageQ = []; r.stageWait = 4;
  if (!W.attract && !S.bridged) { S.bridged = true; r.stageQ.push(...bridgeJobs(T, S)); }
  if (r.podium) r.podium.visible = false;
  applyTier();
  applyWeather(W);
  r.peopleQ = r.bikes.concat(r.patrolBikes); r.peopleWait = 3;
  r.camInit = false; r.worldRef = W;
}

const _tq = new THREE.Quaternion(), _te = new THREE.Euler(0, 0, 0, 'YXZ');
// A replay frame: the recorded state of everyone, eased between the two nearest samples, written onto
// stand-ins (so the live race state is never touched), and the traffic and patrol positions borrowed.
const REC_LERP = { s: 1, x: 1, v: 1, vx: 1, lean: 1, wob: 1, wobPh: 1, crashT: 1, rd: 1, rx: 1, atkT: 1, atkDur: 1, hitT: 1, wheel: 1, scU: 1 };
let TR_SAVE = null;
function replayFrame(W) {
  const rp = W.replay, clip = rp && W.clips[rp.ci]; if (!clip || !W.ghosts) return false;
  let i = 0; while (i < clip.n - 2 && clip.tm[i + 1] < rp.t) i++;
  const f = clamp((rp.t - clip.tm[i]) / Math.max(1e-3, clip.tm[i + 1] - clip.tm[i]), 0, 1);
  const st = W.rec.stride, A = clip.frames, o0 = i * st, o1 = (i + 1) * st;
  let k = 0;
  for (let r = 0; r < W.ghosts.length; r++) {
    const G = W.ghosts[r];
    for (let q = 0; q < REC_F.length; q++, k++) { const n = REC_F[q], a = A[o0 + k], b = A[o1 + k]; G[n] = REC_LERP[n] ? a + (b - a) * f : (f < 0.5 ? a : b); }
    const sc = f < 0.5 ? A[o0 + k] : A[o1 + k]; k++;
    G.sc = sc >= 0 ? W.T.sc[sc] || null : null; G.guard = G.guard > 0.5;
  }
  if (!TR_SAVE || TR_SAVE.length < W.traffic.length * 2 + W.patrols.length * 3) TR_SAVE = new Float32Array(W.traffic.length * 2 + W.patrols.length * 3 + 8);
  let j = 0;
  for (let q = 0; q < W.traffic.length; q++, k += 2) { const v = W.traffic[q]; TR_SAVE[j++] = v.s; TR_SAVE[j++] = v.x; v.s = lerp(A[o0 + k], A[o1 + k], f); v.x = lerp(A[o0 + k + 1], A[o1 + k + 1], f); }
  for (let q = 0; q < W.patrols.length; q++, k += 3) { const p = W.patrols[q]; TR_SAVE[j++] = p.s; TR_SAVE[j++] = p.x; TR_SAVE[j++] = p.down; p.s = lerp(A[o0 + k], A[o1 + k], f); p.x = lerp(A[o0 + k + 1], A[o1 + k + 1], f); p.down = A[o0 + k + 2] > 0.5 ? 1 : 0; }
  return true;
}
function replayRestore(W) {
  let j = 0;
  for (let q = 0; q < W.traffic.length; q++) { const v = W.traffic[q]; v.s = TR_SAVE[j++]; v.x = TR_SAVE[j++]; }
  for (let q = 0; q < W.patrols.length; q++) { const p = W.patrols[q]; p.s = TR_SAVE[j++]; p.x = TR_SAVE[j++]; p.down = TR_SAVE[j++]; }
}
function poseWorld(W, dt) {
  const r = R3, T = W.T;
  const rep = W.phase === 'replay' && replayFrame(W);
  const riders = rep ? W.ghosts : W.riders;
  const pod = r.podium, show = !!(R3.podOk !== false && W.podShow && W.podium && (W.phase === 'podium' || W.phase === 'over'));
  for (let i = 0; i < riders.length; i++) { if (show && W.podium.indexOf(W.riders[i]) >= 0) continue; poseBike(r.bikes[i], W, riders[i], dt); }
  for (let i = 0; i < r.patrolBikes.length; i++) {
    const B = r.patrolBikes[i], p = B.p, fake = B.R;
    fake.s = p.s; fake.x = p.x; fake.v = p.v; fake.vx = 0; fake.lean = 0; fake.wob = 0; fake.crash = 0; fake.atkK = 0; fake.guard = false; fake.hitT = 0; fake.invuln = 0; fake.beacon = p.beacon; fake.siren = p.chase; fake.wheel = (fake.wheel || 0) + p.v * dt / 0.32;
    if (p.down > 0) { fake.crash = 1; fake.crashT = 3.5 - p.down; fake.crashPh = fake.crashT < 1.05 ? 0 : 1; fake.phT = fake.crashT - 1.05; fake.rd = 1.8 * Math.min(1, fake.crashT); fake.rx = p.x + 1.2; fake.crashDir = 1; fake.crashSpin = 0.6; fake.lean = 1.45; fake.dazed = 9; }
    poseBike(B, W, fake, dt);
    if (p.parked && !p.down) { B.root.rotation.z = 0.12 * Math.sign(p.x); B.rroot.rotation.z = 0.12 * Math.sign(p.x); }
  }
  // traffic
  let li = 0, bi = 0;
  Object.keys(r.traffic).forEach((k) => {
    const t = r.traffic[k];
    t.list.forEach((v, j) => {
      posAt(T, v.s, v.x, 0, V);
      _te.set(-FR.pitch * v.dir, -FR.h + (v.dir < 0 ? Math.PI : 0), Math.sin(W.t * 2 + v.swayP) * 0.012);
      _tq.setFromEuler(_te);
      _mtx.compose(_ps.set(V.x, V.y, V.z), _tq, _sc.set(1, 1, 1));
      t.im.setMatrixAt(j, _mtx);
      _mtx.compose(_ps.set(V.x, V.y, V.z), _tq, _sc.set(v.k.hw, v.k.h * 0.9, v.k.hl * 0.995));
      r.tLights.setMatrixAt(li++, _mtx);
      if (k === 'truck') {
        _v1.set(0, 1.85, 3.56).applyQuaternion(_tq);
        _mtx.compose(_ps.set(V.x + _v1.x, V.y + _v1.y, V.z + _v1.z), _tq, _sc.set(1, 1, 1));
        r.tBack.setMatrixAt(bi++, _mtx);
      }
    });
    t.im.instanceMatrix.needsUpdate = true;
  });
  r.tLights.instanceMatrix.needsUpdate = true; r.tBack.instanceMatrix.needsUpdate = true;
  if (rep) replayRestore(W);
  // cows graze, flick their heads and walk across; goats trot over in a line
  for (let i = 0; i < r.cows.length; i++) {
    const m = r.cows[i], c = m.userData.cow;
    posAt(T, c.s, c.x, 0, V);
    m.position.set(V.x, V.y, V.z);
    const face = c.walk && !(c.wait > 0) ? (c.walk > 0 ? -Math.PI / 2 : Math.PI / 2) : Math.sin(c.look * 0.3) * 0.6 + (c.home > 0 ? 0.4 : -0.4);
    m.rotation.set(0, -FR.h + face, c.walk ? Math.sin(c.hd * (c.goat ? 9 : 5)) * (c.goat ? 0.06 : 0.03) : 0);
    if (c.goat) m.position.y += Math.abs(Math.sin(c.hd * 9)) * (c.walk && !(c.wait > 0) ? 0.06 : 0);
    m.visible = Math.abs(c.s - W.P.s) < 500 && !W.podShow;
  }
  // after the line: the top three up on the podium, everyone else out of shot
  if (show && !pod) { r.podium = makePodium(); r.scene.add(r.podium); }
  if (r.podium) r.podium.visible = show;
  if (show) posePodium(W, dt);
  const hideT = show;
  Object.keys(r.traffic).forEach((k) => { r.traffic[k].im.visible = !hideT; });
  r.tLights.visible = r.tBack.visible = !hideT;
}
// In a replay, any bike between the lens and the rider the clip is about is hidden for that frame.
function replayLens(W) {
  const r = R3, clip = W.clips[W.replay.ci]; if (!clip) return;
  const S = r.bikes[clip.vi] || r.bikes[0], cp = r.camera.position;
  _nl.copy(S.root.position).sub(cp); const dp = _nl.length(); if (dp < 0.01) return; _nl.multiplyScalar(1 / dp);
  for (let i = 0; i < r.bikes.length; i++) {
    const B = r.bikes[i]; if (B === S || i === clip.ai) continue;
    _nr.copy(B.root.position).sub(cp);
    const along = _nr.dot(_nl), off = Math.sqrt(Math.max(0, _nr.lengthSq() - along * along));
    if (along > -0.5 && along < dp - 1.2 && off < 1.6) { B.rroot.visible = false; B.root.visible = false; }
  }
}
// The podium stands on the road just past the finish, facing back down the hill toward the camera.
function posePodium(W, dt) {
  const r = R3, T = W.T, pod = r.podium;
  posAt(T, T.finishS + 46, 0, 0, V);
  pod.position.set(V.x, V.y, V.z); pod.rotation.y = -FR.h;
  pod.updateMatrixWorld(true);
  const H = pod.userData.H, X = pod.userData.X;
  for (let i = 0; i < r.bikes.length; i++) {
    const B = r.bikes[i], R = W.riders[i], at = W.podium.indexOf(R);
    if (at < 0) { B.root.visible = false; B.rroot.visible = false; continue; }
    B.root.visible = false;
    if (!B.hum) continue;
    const rr = B.rroot, hk = B.hum.height / 1.75;
    _v1.set(X[at], H[at] + 0.06, 0).applyMatrix4(pod.matrixWorld);
    rr.position.copy(_v1); rr.rotation.set(0, -FR.h + Math.PI, 0); rr.visible = true;
    B.torso.rotation.set(0, 0, 0); B.torso.position.set(0, 0.45 * hk, 0.1 * hk);
    const Hm = B.hum;
    B.podCd = (B.podCd || 0) - dt;
    if (Hm.playing('drive')) Hm.stop();
    if (B.podCd <= 0) { Hm.play(at === 0 ? (R.isPlayer ? 'celebrate' : 'cheer') : at === 1 ? 'clap' : 'wave', { side: 'right' }); B.podCd = 2.2 + at * 0.4 + Math.random() * 0.6; }
    Hm.setMood(at === 0 ? 1 : 0.6);
    Hm.lookAt(r.camera.position);
    Hm.update(dt, { speed: 0, turn: 0, accel: 0 });
  }
  for (let i = 0; i < r.patrolBikes.length; i++) { r.patrolBikes[i].root.visible = false; r.patrolBikes[i].rroot.visible = false; }
}

// Full detail for the riders near the lens, lighter rigs further away, lightest on a slow device.
function riderLod(W, dt) {
  const r = R3; r.lodT = (r.lodT || 0) - dt; if (r.lodT > 0) return; r.lodT = 0.5;
  const cp = r.camera.position, q = r.quality;
  const all = r.bikes.concat(r.patrolBikes);
  for (let i = 0; i < all.length; i++) {
    const B = all[i]; if (!B.hum) continue;
    const d = B.rroot.position.distanceTo(cp);
    const want = q <= 0 ? 'far' : q === 1 ? (d < 18 ? 'mid' : 'far') : d < 30 ? 'full' : d < 80 ? 'mid' : 'far';
    if (B.hum.lod !== want) B.hum.setLod(want);
  }
}

/* ------------------------------------------------------------ camera */
// The chase camera, plus the broadcast shots: the flyover that opens a race, the side-on replay of a
// knockdown, and the podium. Every shot eases into the next; nothing cuts.
const _cp = new THREE.Vector3(), _ct = new THREE.Vector3();
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function shotIntro(W, a) {
  const P = W.P, T = W.T, u = ease(W.introT / W.introDur);
  if (a.reducedMotion) {
    posAt(T, P.s - 15, P.x * 0.5 + 3, 7, V); _cp.set(V.x, V.y, V.z);
    posAt(T, P.s + 12, 0, 1.2, V); _ct.set(V.x, V.y, V.z); return;
  }
  // high over the road ahead, sweeping down and round to sit behind the grid
  const s = lerp(START_S + 560, P.s - 9, u), lat = lerp(30, P.x * 0.8 + 1.5, Math.pow(u, 0.7)), up = lerp(62, 3.6, Math.pow(u, 0.75));
  const i = rowOf(T, s), g = Math.max(0, bankH(T, i, clamp(lat, -40, 40)));
  posAt(T, s, lat, up + g * (1 - u), V); _cp.set(V.x, V.y, V.z);
  const ts = lerp(START_S + 360, P.s + 14, Math.pow(u, 0.9));
  posAt(T, ts, lerp(0, P.x * 0.5, u), lerp(0, 1.2, u), V); _ct.set(V.x, V.y, V.z);
}
function shotReplay(W) {
  const rp = W.replay, clip = W.clips[rp.ci], T = W.T;
  const G = W.ghosts[clip.vi] || W.ghosts[0], A = clip.ai >= 0 ? W.ghosts[clip.ai] : null;
  const fs = G.s + (G.crash > 0 ? G.rd * 0.5 : 0), fx = G.crash > 0 ? (G.x + G.rx) / 2 : G.x;
  const mx = A && Math.abs(A.s - G.s) < 12 ? (fx + A.x) / 2 : fx, side = mx > 0 ? -1 : 1;
  const drift = rp.t * 0.9;
  if (G.sc) { riderAt(T, G, side * 4, 1.8, 6); _cp.set(RP.x, RP.y, RP.z); riderAt(T, G, 0, 0.9, 0); _ct.set(RP.x, RP.y, RP.z); return; }
  posAt(T, fs + 9 - drift, mx + side * 4.2, 2.3, V); _cp.set(V.x, V.y, V.z);
  posAt(T, fs, mx, 0.85, V); _ct.set(V.x, V.y, V.z);
}
function shotPodium(W, a) {
  const T = W.T, t = W.phase === 'over' ? (R3.time % 40) : W.podT;
  const sw = a.reducedMotion ? 0 : Math.sin(t * 0.35) * 2.4;
  posAt(T, T.finishS + 46 - 8.6 + Math.min(1.5, t * 0.25), sw, 2.4, V); _cp.set(V.x, V.y, V.z);
  posAt(T, T.finishS + 46, 0, 1.75, V); _ct.set(V.x, V.y, V.z);
}
function updateCamera(W, dt, a) {
  const r = R3, P = W.P, T = W.T, cam = r.camera, aspect = a.w / a.h, port = aspect < 0.9;
  const sp = clamp(P.v / 50, 0, 1.5), rm = a.reducedMotion;
  let shot = '';
  if (W.phase === 'intro') { shotIntro(W, a); shot = 'intro'; }
  else if (W.phase === 'replay' && W.clips[W.replay.ci]) { shotReplay(W); shot = 'replay'; }
  else if (W.podShow && (W.phase === 'podium' || W.phase === 'over')) { shotPodium(W, a); shot = 'podium'; }
  if (shot) {
    // a new broadcast shot (or the next replay) is a cut, hidden by a quick fade
    const clipNo = shot === 'replay' ? W.replay.ci : -1;
    if (!r.camInit || r.shot !== shot || r.shotClip !== clipNo) { if (shot !== 'podium' || W.phase === 'podium') { r.camPos.copy(_cp); r.camTgt.copy(_ct); } r.camInit = true; r.shotClip = clipNo; }
    const k = shot === 'intro' ? 1 : 1 - Math.exp(-dt * (shot === 'replay' ? 4 : 2.5));
    r.camPos.lerp(_cp, k); r.camTgt.lerp(_ct, shot === 'intro' ? 1 : 1 - Math.exp(-dt * 6));
    cam.position.copy(r.camPos); cam.up.set(0, 1, 0); cam.lookAt(r.camTgt); r.roll = 0;
    const base = shot === 'podium' ? (port ? 58 : 40) : shot === 'replay' ? (port ? 66 : 48) : (port ? 70 : 55);
    W.fov = (W.fov || base) + (base - (W.fov || base)) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - W.fov) > 0.01 || cam.aspect !== aspect) { cam.fov = W.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(); r.shot = shot;
    return;
  }
  r.shot = '';
  let back = (port ? 5.0 : 4.5) + sp * 1.0 + (P.nitroOn && !rm ? 1.5 : 0);
  let up = (port ? 2.05 : 1.8) + sp * 0.2;
  let side = P.x * 0.82, look = port ? 10 : 12, lookUp = port ? 1.45 : 1.15;
  let orbit = 0, fs = P.s, fx = P.x;
  if (P.crash > 0) {
    // follow the rider as they tumble and run back, keeping the bike in shot
    fs = P.s + P.rd * 0.55; fx = (P.x + P.rx) / 2; side = fx * 0.82;
    back += 3.2 + Math.abs(P.rd) * 0.25; up += 2.2; orbit = Math.min(1, P.crashT) * 0.6 * (P.crashDir || 1); look = 2; lookUp = 0.6;
  }
  if (W.phase === 'finished' || W.phase === 'busted' || W.phase === 'wrecked' || W.phase === 'over') { r.orb = (r.orb || 0) + dt * 0.35; orbit = Math.sin(r.orb) * 0.9 + 0.6; back += 2; up += 1.2; look = 1; }
  else r.orb = 0;
  if (W.phase === 'grid' && !W.attract) { back += W.cd * 1.6; up += W.cd * 0.7; }
  // a rival tucked in right behind you sits between the lens and your bike: rise and look over it
  let occ = 0;
  if (orbit === 0 && P.crash <= 0) {
    for (let i = 0; i < W.riders.length; i++) {
      const R = W.riders[i]; if (R === P || R.crash > 0 || R.sc) continue;
      const ds = P.s - R.s; if (ds < 0.3 || ds > back + 0.5) continue;
      const dx = Math.abs(R.x - side); if (dx < 1.7) occ = Math.max(occ, 1 - dx / 1.7);
    }
  }
  r.occ = (r.occ || 0) + (occ - (r.occ || 0)) * Math.min(1, dt * (occ > (r.occ || 0) ? 5 : 2));
  up += r.occ * 1.6; lookUp -= r.occ * 0.25;
  if (P.sc && P.crash <= 0) {
    // out on the old bridge: ride along the deck
    const sc = P.sc, fx2 = Math.sin(sc.h), fz2 = -Math.cos(sc.h);
    riderAt(T, P, 0, 0, 0);
    _cp.set(RP.x - fx2 * back, RP.y + up, RP.z - fz2 * back);
    _ct.set(RP.x + fx2 * look, RP.y + lookUp, RP.z + fz2 * look);
  } else {
    posAt(T, fs - back * Math.cos(orbit), side + back * Math.sin(orbit) * 1.4, 0, _pp);
    // keep the camera above the ground it passes over
    const gi = rowOf(T, fs - back);
    const gl = Math.max(0, bankH(T, gi, clamp(side + back * Math.sin(orbit) * 1.4, -20, 20)));
    _cp.set(_pp.x, _pp.y + up + gl * 0.6, _pp.z);
    posAt(T, fs + look, fx * 0.55, lookUp, _pp);
    _ct.set(_pp.x, _pp.y, _pp.z);
  }
  if (!r.camInit) { r.camPos.copy(_cp); r.camTgt.copy(_ct); r.camInit = true; }
  const k = 1 - Math.exp(-dt * (rm ? 6 : 9)), kt = 1 - Math.exp(-dt * 12);
  r.camPos.lerp(_cp, k); r.camTgt.lerp(_ct, kt);
  cam.position.copy(r.camPos);
  const sx = a.shakeX || 0, sy = a.shakeY || 0;
  if (sx || sy) { frameAt(T, P.s); cam.position.x += FR.rx * sx * 0.02; cam.position.z += FR.rz * sx * 0.02; cam.position.y += sy * 0.02; }
  cam.up.set(0, 1, 0);
  cam.lookAt(r.camTgt);
  // lean-heavy: the camera rolls a little with the bike
  const roll = P.crash > 0 ? 0 : P.lean * (rm ? 0.08 : 0.3);
  r.roll = (r.roll || 0) + (roll - (r.roll || 0)) * Math.min(1, dt * 6);
  cam.rotateZ(-r.roll);
  const base = port ? 70 : clamp(2 * Math.atan(Math.tan(33 * Math.PI / 180) / Math.max(0.5, aspect / 1.6)) * 180 / Math.PI, 50, 68);
  const kick = rm ? 0 : sp * 7 + (P.nitroOn ? 13 : 0) + P.draft * 2;
  W.fov = (W.fov || base) + (base + kick - (W.fov || base)) * Math.min(1, dt * 4);
  if (Math.abs(cam.fov - W.fov) > 0.01 || cam.aspect !== aspect) { cam.fov = W.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}

/* ------------------------------------------------------------ weather */
// Rain darkens the sky, wets and darkens the tarmac (it catches the sky), thickens the haze and fills
// the air around the camera with streaks; a storm adds lightning. Fog just closes the distance in.
function applyWeather(W) {
  const r = R3, S = r.cur, L = W.T.look, wx = W.wx, wet = wx === 'rain' || wx === 'storm';
  r.wxSun = wet ? 0.45 : wx === 'fog' ? 0.6 : 1;
  r.scene.fog.density = L.fogD * (wet ? 1.7 : wx === 'fog' ? 2.6 : 1);
  const u = r.skyU, grey = _c.set(L.night ? '#0e1220' : wet ? '#7d8790' : '#b9bcc0');
  if (wet || wx === 'fog') {
    u.uTop.value.set(L.skyTop).lerp(grey, 0.6); u.uMid.value.set(L.skyMid).lerp(grey, 0.65); u.uHor.value.set(L.skyHor).lerp(grey, 0.6);
    u.uFog.value.set(L.fog).lerp(grey, 0.4); r.scene.fog.color.copy(u.uFog.value); r.renderer.setClearColor(u.uFog.value);
    u.uCloud.value = wet ? 1.2 : 0.8; u.uSun.value.set(L.sun).multiplyScalar(0.35);
  }
  if (S && S.roadMat) {
    const m = S.roadMat, o = S.roadOrig || (S.roadOrig = { rough: m.roughness, col: m.color.getHex(), rmap: m.roughnessMap });
    if (wet) { m.roughness = 0.32; m.roughnessMap = null; m.color.set(o.col).multiplyScalar(0.72); }
    else { m.roughness = o.rough; m.roughnessMap = o.rmap; m.color.setHex(o.col); }
    m.needsUpdate = true;
  }
  if (wet && !r.rain) r.rain = makeRain(r.scene);
  if (r.rain) {
    r.rain.visible = wet;
    r.rain.geometry.setDrawRange(0, [500, 1100, 1800, 2400][Math.max(0, r.quality)] * 2);
    r.rain.material.uniforms.uAlpha.value = L.night ? 0.2 : 0.3;
  }
  lightLevels();
}

// a rival close enough to fill the lens is hidden for that frame, so your own bike always reads
// (also any rival sitting between the lens and your bike, close to that line of sight)
const _nl = new THREE.Vector3(), _nr = new THREE.Vector3();
function nearLens() {
  const r = R3, cp = r.camera.position, all = r.bikes, me = all[0];
  if (!me) return;
  _nl.copy(me.root.position).sub(cp); const dp = _nl.length(); if (dp < 0.01) return; _nl.multiplyScalar(1 / dp);
  for (let i = 1; i < all.length; i++) {
    const B = all[i]; if (!B.rroot.visible) continue;
    _nr.copy(B.root.position).sub(cp);
    const along = _nr.dot(_nl), d2 = _nr.lengthSq();
    const off = Math.sqrt(Math.max(0, d2 - along * along));
    if (d2 < 6.25 || (along > -0.5 && along < dp - 1.6 && off < 1.5)) { B.rroot.visible = false; B.root.visible = false; }
  }
}

/* ------------------------------------------------------------ per-frame visuals */
function renderScene(W, dt, a) {
  const r = R3, T = W.T, S = r.cur, P = W.P;
  r.time += dt;
  pumpPeople(); pumpStage(W);
  poseWorld(W, dt);
  updateCamera(W, dt, a);
  if (!r.shot) nearLens(); else if (r.shot === 'replay') replayLens(W);
  if (POST) POST.handheld(r.shot === 'replay' || r.shot === 'podium');
  // rain around the lens, and lightning in a storm
  if (r.rain && r.rain.visible) { const u = r.rain.material.uniforms; u.uTime.value = r.time; u.uCam.value.copy(r.camera.position); }
  if (W.wx === 'storm' && !W.attract) {
    W.lightT -= dt;
    if (W.lightT <= 0) { W.lightT = 6 + Math.random() * 9; if (POST && !a.reducedMotion) POST.flash(0.45, '#dfe8ff'); noise(1.6, { freq: 160, vol: 0.22 }); }
  }
  updatePeople(W, dt);
  riderLod(W, dt);
  // sun and its shadow box follow the player
  posAt(T, P.s + 6, P.x, 0, V);
  r.sun.target.position.set(V.x, V.y, V.z);
  r.sun.position.set(V.x + r.sunDir.x * 120, V.y + Math.max(25, r.sunDir.y * 120), V.z + r.sunDir.z * 120);
  r.sun.target.updateMatrixWorld(); r.sun.updateMatrixWorld();
  // darker inside tunnels
  const tk = T.TUN[rowOf(T, Math.max(0, P.s - 3))];
  if (Math.abs(tk - r.tunK) > 0.004) { r.tunK += (tk - r.tunK) * Math.min(1, dt * 5); lightLevels(); }
  // headlight at dusk
  if (T.look.night && P.crash <= 0) {
    const B = r.bikes[0];
    r.head.position.set(0, 0.95, -1.5).applyMatrix4(B.root.matrixWorld);
    r.head.target.position.set(0, -0.6, -24).applyMatrix4(B.root.matrixWorld); r.head.target.updateMatrixWorld();
    r.head.intensity = 140;
  } else r.head.intensity = 0;
  // nitro flames, exhaust, rain of spray near waterfalls
  if (FX) {
    for (let i = 0; i < W.riders.length; i++) {
      const R = W.riders[i]; if (Math.abs(R.s - P.s) > 70 || W.phase === 'replay' || W.podShow) continue;
      if (R.nitroOn && R.crash <= 0) {
        const B = r.bikes[i];
        for (let k = 0; k < 2; k++) {
          _v1.set(0.19, 0.66, 0.95).applyMatrix4(B.root.matrixWorld);
          FX.emit('add', _v1.x, _v1.y, _v1.z, (Math.random() - 0.5) * 1.5, Math.random() * 0.8, (Math.random() - 0.5) * 1.5, 0.22 + Math.random() * 0.12, 0.34, k ? '#5aa8ff' : '#ff9a3a', 0.9, -1, 2, -0.5);
        }
      } else if (R.thr > 0.5 && Math.random() < dt * 6 * FX.density) {
        const B = r.bikes[i];
        _v1.set(0.19, 0.6, 1.0).applyMatrix4(B.root.matrixWorld);
        FX.emit('soft', _v1.x, _v1.y, _v1.z, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, 0.9, 0.3, '#9a9590', 0.22, -0.3, 1, 3);
      }
      if (R.draft > 0.45 && R.isPlayer && Math.random() < dt * 30 * FX.density && !a.reducedMotion) {
        posAt(T, R.s + 3 + Math.random() * 4, R.x + (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.2, V);
        FX.emit('add', V.x, V.y, V.z, -FR.fx * 30, 0, -FR.fz * 30, 0.18, 0.05, '#dfe8ff', 0.5, 0, 0, 0);
      }
    }
    // rubber and smoke: a locked rear wheel, an oil wobble, a bike sliding on its side
    if (MARKS && MARKS.on && r.skid) {
      for (let i = 0; i < W.riders.length; i++) {
        const R = W.riders[i], st = r.skid[i]; if (!st) continue;
        const near = Math.abs(R.s - P.s) < 80;
        const lock = near && R.crash <= 0 && ((R.brakeIn && R.v > 18) || (R.wob > 0.35 && R.v > 14));
        posAt(T, R.s - 0.7, R.x, 0, V);
        MARKS.trail(st, lock, V.x, V.y, V.z, 0.12, (R.brakeIn ? 0.55 : 0.35) * clamp((R.v - 12) / 22, 0.25, 1), 10);
        if (lock && R.v > 24 && Math.random() < dt * 16 * FX.density) FX.emit('soft', V.x, V.y + 0.15, V.z, (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 0.8, 0.55, '#d8d4cc', 0.22, -0.5, 1.6, 3.2);
        const slide = near && R.crash > 0 && R.v > 2.5 && R.crashPh <= 1;
        MARKS.trail(st.s, slide, V.x, V.y, V.z, 0.32, 0.4, 14);
        if (slide && Math.random() < dt * 20 * FX.density) FX.emit('soft', V.x, V.y + 0.1, V.z, (Math.random() - 0.5) * 1.5, 0.4 + Math.random(), (Math.random() - 0.5) * 1.5, 1.2, 0.7, T.look.dirt, 0.35, -0.3, 1.4, 2.6);
      }
      MARKS.update(dt);
    }
    for (let i = 0; i < S.falls.length; i++) {
      const f = S.falls[i]; if (Math.abs(f.s - P.s) > 90) continue;
      if (Math.random() < dt * 22 * FX.density) FX.emit('soft', f.x + (Math.random() - 0.5) * 3, f.y + 0.4, f.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 1.6, 1.5, '#ffffff', 0.35, -0.2, 1, 2.2);
      if (Math.abs(f.s - P.s) < 8 && Math.random() < dt * 30 * FX.density) { posAt(T, P.s + 4, P.x + (Math.random() - 0.5) * 6, 1 + Math.random() * 2, V); FX.emit('add', V.x, V.y, V.z, f.sd * -2, -1, 0, 0.5, 0.12, '#dff2ff', 0.6, 3, 0.5, 0); }
    }
    FX.update(dt, a.h * r.renderer.getPixelRatio() * 0.5 / Math.tan(r.camera.fov * Math.PI / 360));
  }
  if (S.fallTex) S.fallTex.offset.y += dt * 1.7;
  if (S.seaTex) S.seaTex.offset.set(r.time * 0.004, r.time * 0.003);
  if (S.flagShader) S.flagShader.uniforms.uTime.value = r.time;
  r.skyU.uTime.value = r.time;
  const cp = r.camera.position;
  r.sky.position.copy(cp);
  S.far.position.set(cp.x, S.floorY, cp.z);
  // hide what is far away
  const t = TIERS[Math.max(0, r.quality)];
  for (let i = 0; i < CULL.length; i++) {
    const c = CULL[i]; if (c.course !== T.id) continue;
    const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) - c.r;
    c.im.visible = (c.im.userData.ov ? t.ov : true) && d < (c.far ? t.cull * 2.6 : c.terrain ? t.cull * 1.15 : t.cull);
  }
  if (VFX) {
    if (r.vfxWarm > 0 && --r.vfxWarm === 0) VFX.warm();
    VFX.setReduced(!!a.reducedMotion);
    posAt(T, P.s, P.x, 0, V); VFX.setGround(V.y);
    // the nitro jet rides the player's exhaust; speed lines only at real speed, never under reduced motion
    const B0 = r.bikes[0];
    // nitro: a long jet (hot core to orange tips, 1.5 to 2.5 bike lengths), a pool of heat on the road, shed sparks
    const nOn = !!(B0 && P.nitroOn && P.crash <= 0 && !r.shot);
    if (nOn) { if (!r.nitroH || !r.nitroH.active) r.nitroH = VFX.nitro(B0.root, { offset: [0.19, 0.66, 1.0], dir: [0, 0.05, 1], size: 1.45, color: '#ff8a3a' }); }
    else if (r.nitroH && r.nitroH.active) { r.nitroH.stop(); r.nitroH = null; }
    if (B0 && !r.nGlow) r.nGlow = makeBoostGlow(B0.root, 1.9, 2.4, 4.4, '#ff9a4a');
    r.nst = r.nst || {}; r.nst.h = r.nitroH ? [r.nitroH] : null;
    finishShow(r.show, dt, r.camera);
    if (B0) driveBoost(r.nst, nOn, dt, B0.root, r.nGlow, [[0.19, 0.66, 1.0]], 1, r.quality, !!a.reducedMotion);
    VFX.speedLines(r.camera, W.attract || a.reducedMotion || r.shot ? 0 : P.nitroOn && P.crash <= 0 ? 1 : P.v > 44 ? clamp((P.v - 30) / 30, 0, 1) * 0.6 : 0);
    // the podium: a victory burst as it comes into shot
    if (W.podShow && W.phase === 'podium' && !W.podFx && W.podT > 0.6 && r.podium) { W.podFx = true; r.podium.updateMatrixWorld(true); _vq.set(0, 2.2, 0).applyMatrix4(r.podium.matrixWorld); VFX.winBurst(_vq, { size: 0.8 }); }
    VFX.update(dt);
  }
  if (POST) { POST.setQuality(r.quality, r.lockQ); POST.render(r.scene, r.camera); } else r.renderer.render(r.scene, r.camera);
}

/* ------------------------------------------------------------ HUD */
const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
const INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736', ORANGE = '#ff6940', TEAL = '#38e1ff';
function txt(ctx, s, x, y, size, color, align, weight, fam) {
  ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function plate(ctx, x, y, w, h, r) { rr(ctx, x, y, w, h, r || 10); ctx.fillStyle = 'rgba(12,10,8,0.58)'; ctx.fill(); ctx.strokeStyle = 'rgba(251,245,236,0.10)'; ctx.lineWidth = 1; ctx.stroke(); }
const _proj = new THREE.Vector3();

function mapPts(T) {
  if (T.mapPts) return T.mapPts;
  const pts = [], b = T.box, w = b.x1 - b.x0, h = b.z1 - b.z0;
  for (let i = 0; i < T.N; i += 6) pts.push([(T.PX[i] - b.x0) / Math.max(w, h), (T.PZ[i] - b.z0) / Math.max(w, h)]);
  T.mapPts = { pts, w: w / Math.max(w, h), h: h / Math.max(w, h) };
  return T.mapPts;
}
function riderColor(R) { return R.isPlayer ? ORANGE : R.paint; }

// What each control is called on the device in hand.
function ctlName(a, act) {
  const gest = a.touchMode && a.touchStyle !== 'pads', pads = a.touchMode && !gest, gp = a.gamepad && !a.touchMode;
  const M = {
    pl: gest ? 'swipe left' : pads ? 'Punch L' : gp ? 'X' : 'Z',
    pr: gest ? 'swipe right' : pads ? 'Punch R' : gp ? 'B' : 'X',
    kick: gest ? 'long swipe' : pads ? 'Kick' : gp ? 'Y' : 'C',
    guard: gest ? 'swipe down' : pads ? 'Guard' : gp ? 'LB / RB' : 'hold B',
    nitro: gest ? 'swipe up' : pads ? 'Nitro' : gp ? 'A' : 'Shift',
    run: a.touchMode ? 'tap tap tap' : gp ? 'mash A' : 'mash Up or Space'
  };
  return M[act];
}
function bar(ctx, x, y, w, h, f, col, back) {
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = back || 'rgba(251,245,236,0.13)'; ctx.fill();
  if (f > 0.005) { rr(ctx, x, y, Math.max(h, w * clamp(f, 0, 1)), h, h / 2); ctx.fillStyle = col; ctx.fill(); }
}
const balCol = (f) => (f > 0.55 ? '#44ffa8' : f > 0.28 ? GOLD : '#ff5a3c');

function drawHUD(ctx, a, W) {
  const P = W.P, T = W.T, pad = a.hudPad(), w = a.w, h = a.h, small = w < 560, rm = a.reducedMotion;
  const sc = small ? 0.86 : 1, cy = h * 0.32;
  // the broadcast shots get their own captions and nothing else
  if (W.phase === 'intro') { drawIntroCard(ctx, a, W, sc); return; }
  if (W.phase === 'replay') { drawReplayTag(ctx, a, W, sc); return; }
  if (W.phase === 'podium') { drawPodiumCard(ctx, a, W, sc); return; }
  // speed lines at pace and on nitro
  const spd = P.v / P.top;
  if (!rm && (spd > 0.82 || P.nitroOn) && P.crash <= 0 && W.phase === 'racing') {
    const k = P.nitroOn ? 1 : clamp((spd - 0.82) / 0.2, 0, 1) * 0.6, cx = w / 2, cyy = h * 0.45;
    ctx.save(); ctx.strokeStyle = 'rgba(255,248,235,' + (0.18 * k) + ')'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 26; i++) {
      const an = hash(i * 7 + (a.frame >> 1)) * TAU, r0 = Math.max(w, h) * (0.32 + hash(i * 13 + (a.frame >> 2)) * 0.2), len = 40 + 90 * k;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * r0, cyy + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an) * (r0 + len), cyy + Math.sin(an) * (r0 + len)); ctx.stroke();
    }
    ctx.restore();
  }
  // edge glow on nitro, a blue tint when busted, red and blue at the edges with the patrol on your tail
  if (P.nitroOn && !rm) { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); g.addColorStop(0, 'rgba(90,168,255,0)'); g.addColorStop(1, 'rgba(90,168,255,0.22)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  if (W.phase === 'busted') { const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7); g.addColorStop(0, 'rgba(40,90,255,0)'); g.addColorStop(1, 'rgba(40,90,255,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  let chase = null;
  for (let i = 0; i < W.patrols.length; i++) if (W.patrols[i].chase && W.patrols[i].tgt === P) chase = W.patrols[i];
  if (chase && W.phase === 'racing') {
    const on = rm ? 0.5 : (Math.sin(a.time * 9) * 0.5 + 0.5), al = 0.16 + 0.1 * (1 - clamp((P.s - chase.s) / 200, 0, 1));
    const gl = ctx.createLinearGradient(0, 0, w * 0.18, 0); gl.addColorStop(0, 'rgba(255,40,40,' + (al * on) + ')'); gl.addColorStop(1, 'rgba(255,40,40,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, w * 0.18, h);
    const gr = ctx.createLinearGradient(w, 0, w * 0.82, 0); gr.addColorStop(0, 'rgba(40,110,255,' + (al * (1 - on)) + ')'); gr.addColorStop(1, 'rgba(40,110,255,0)'); ctx.fillStyle = gr; ctx.fillRect(w * 0.82, 0, w * 0.18, h);
  }
  // rival name tags, with a balance bar on anyone close enough to fight
  const cam = R3.camera, tags = [];
  const tL = inRange(W, P, -1), tR = inRange(W, P, 1);
  const ord = order(W);
  for (let i = 1; i < W.riders.length; i++) {
    const R = W.riders[i], ds = R.s - P.s;
    if (ds < -6 || ds > 55 || R.dnf) continue;
    riderAt(T, R, 0, 2.15, 0); _proj.set(RP.x, RP.y, RP.z).project(cam);
    if (_proj.z > 1 || _proj.z < -1) continue;
    let x = (_proj.x * 0.5 + 0.5) * w;
    let y = (-_proj.y * 0.5 + 0.5) * h;
    if (x < -40 || x > w + 40 || y < 50) continue;
    const al = clamp(1 - ds / 55, 0.35, 1), fs = clamp(14 - ds * 0.12, 9, 13) * sc;
    const near = Math.abs(ds) < 22, tgt = R === tL || R === tR;
    ctx.globalAlpha = al;
    const label = (ord.indexOf(R) + 1) + ' ' + R.name;
    ctx.font = '600 ' + fs + 'px ' + F_MONO; const tw = Math.max(ctx.measureText(label).width + 14, near ? 70 : 0);
    // a rider at the edge of the lens keeps the whole tag on screen
    x = clamp(x, tw / 2 + 6, w - tw / 2 - 6);
    // nudge labels up so they never sit on each other
    for (let k = 0; k < tags.length; k++) { const t = tags[k]; if (Math.abs(t.x - x) < (t.w + tw) / 2 + 2 && Math.abs(t.y - y) < fs * 2.3) { y = t.y - fs * 2.4; k = -1; } }
    tags.push({ x, y, w: tw });
    const th = near ? fs * 2.3 : fs * 1.75;
    rr(ctx, x - tw / 2, y - fs, tw, th, 6); ctx.fillStyle = tgt ? 'rgba(80,24,10,0.78)' : 'rgba(12,10,8,0.62)'; ctx.fill();
    if (tgt) { ctx.strokeStyle = ORANGE; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.fillStyle = R.paint; ctx.fillRect(x - tw / 2 + 4, y - fs * 0.4, 3, fs * 0.8);
    txt(ctx, label, x + 3, y - fs * 0.12, fs, R.crash > 0 ? DIM : INK, 'center', '600');
    if (near) bar(ctx, x - tw / 2 + 8, y + fs * 0.62, tw - 16, 3.5, R.bal / 100, balCol(R.bal / 100));
    if (R.guard && near) txt(ctx, 'GUARD', x + tw / 2 - 4, y - fs * 1.35, 8 * sc, TEAL, 'right', '700');
    if (W.tele && W.tele.R === R) txt(ctx, '!', x - tw / 2 - 8, y - fs * 0.1, 18 * sc, '#ff5a3c', 'center', '800', F_DISP);
    ctx.globalAlpha = 1;
  }
  // top left: position and time, then the rider's state: balance, stamina, the bike
  const tt = W.cfg.mode === 'time', prac = W.cfg.mode === 'practice';
  const pw0 = 136 * sc;
  plate(ctx, pad.left, pad.top, pw0, 66 * sc, 12);
  if (tt || prac) { txt(ctx, tt ? 'TIME TRIAL' : 'COMBAT SCHOOL', pad.left + 12, pad.top + 18 * sc, 10 * sc, GOLD, 'left', '700'); }
  else {
    const pos = ord.indexOf(P) + 1;
    txt(ctx, String(pos), pad.left + 12, pad.top + 30 * sc, 34 * sc, INK, 'left', '600', F_DISP);
    ctx.font = '600 ' + 34 * sc + 'px ' + F_DISP; const pw = ctx.measureText(String(pos)).width;
    txt(ctx, ordinal(pos).replace(/^\d+/, '') + ' / ' + W.riders.filter((r) => !r.dnf).length, pad.left + 14 + pw, pad.top + 24 * sc, 12 * sc, DIM, 'left', '600');
    if (W.cfg.mode === 'career') txt(ctx, 'L' + W.lv.n, pad.left + pw0 - 10, pad.top + 18 * sc, 10 * sc, GOLD, 'right', '700');
  }
  txt(ctx, fmtTime(W.phase === 'grid' ? 0 : (P.finished ? P.finT : W.t)), pad.left + 12, pad.top + 52 * sc, 13 * sc, INK, 'left', '500');
  const sy0 = pad.top + 72 * sc, sh0 = 58 * sc;
  plate(ctx, pad.left, sy0, pw0, sh0, 12);
  const bx = pad.left + 42 * sc, bw = pw0 - 52 * sc;
  [['BAL', P.bal / 100, balCol(P.bal / 100)], ['STA', P.sta / 100, P.sta < 25 ? '#ff9a3c' : '#ffd36a'], ['BIKE', 1 - P.dmg / 100, P.dmg > 70 ? '#ff5a3c' : '#7fb8ff']].forEach((rw, i) => {
    const yy = sy0 + 12 * sc + i * 16 * sc;
    txt(ctx, rw[0], pad.left + 10, yy + 2, 8.5 * sc, DIM, 'left', '700');
    bar(ctx, bx, yy - 2, bw, 6 * sc, rw[1], rw[2]);
  });
  if (P.guard) txt(ctx, 'GUARD UP', pad.left + pw0 / 2, sy0 + sh0 + 10 * sc, 9 * sc, TEAL, 'center', '700');
  // top right: speed, nitro, the wallet and the weather
  const sw = 136 * sc, sx = w - pad.right - sw;
  plate(ctx, sx, pad.top, sw, 66 * sc, 12);
  txt(ctx, String(Math.round(P.v * KMH)), sx + sw - 44 * sc, pad.top + 24 * sc, 30 * sc, INK, 'right', '600', F_DISP);
  txt(ctx, 'km/h', sx + sw - 12 * sc, pad.top + 28 * sc, 10 * sc, DIM, 'right', '600');
  const nx = sx + 12 * sc, ny = pad.top + 50 * sc, nw = sw - 24 * sc;
  rr(ctx, nx, ny, nw, 7 * sc, 3.5 * sc); ctx.fillStyle = 'rgba(251,245,236,0.12)'; ctx.fill();
  const nf = P.nitro / (P.nCap || 100);
  if (nf > 0) { rr(ctx, nx, ny, Math.max(7 * sc, nw * nf), 7 * sc, 3.5 * sc); const g = ctx.createLinearGradient(nx, 0, nx + nw, 0); g.addColorStop(0, '#5aa8ff'); g.addColorStop(1, P.nitroOn ? '#ffffff' : '#9fd0ff'); ctx.fillStyle = g; ctx.fill(); }
  txt(ctx, 'NITRO', nx, ny - 7 * sc, 8 * sc, P.nitro > 30 ? '#9fd0ff' : DIM, 'left', '700');
  if (P.draft > 0.4) txt(ctx, 'SLIPSTREAM', nx + nw, ny - 8 * sc, 9 * sc, '#dfe8ff', 'right', '700');
  plate(ctx, sx, sy0, sw, 30 * sc, 10);
  txt(ctx, money(SAVE.cash), sx + 10, sy0 + 15 * sc, 11 * sc, GOLD, 'left', '600');
  txt(ctx, (WEATHER[W.wx] || 'Clear').toUpperCase(), sx + sw - 10, sy0 + 15 * sc, 9 * sc, DIM, 'right', '700');
  // the course strip: everyone's progress from start to finish, hairpins, bridges and the patrol
  const stripW = Math.min(w - pad.left - pad.right - (136 * sc + 10) * 2, 460), stripX = (w - stripW) / 2, stripY = pad.top + 14;
  if (stripW > 90) {
    const span = T.finishS - T.startS, at = (s) => stripX + clamp((s - T.startS) / span, 0, 1) * stripW;
    rr(ctx, stripX - 8, stripY - 10, stripW + 16, 34, 10); ctx.fillStyle = 'rgba(12,10,8,0.5)'; ctx.fill();
    ctx.fillStyle = 'rgba(251,245,236,0.18)'; ctx.fillRect(stripX, stripY + 3, stripW, 3);
    ctx.fillStyle = 'rgba(255,183,54,0.55)';
    for (let i = 0; i < T.N; i += 3) if (Math.abs(T.CV[i]) > 0.016) ctx.fillRect(at(i * SEGM) - 0.5, stripY + 1, 1.5, 7);
    ctx.fillStyle = '#44ffa8'; for (let i = 0; i < T.sc.length; i++) { const q = T.sc[i]; ctx.fillRect(at(q.s0), stripY + 9, Math.max(2, at(q.s1) - at(q.s0)), 2); }
    for (let i = 0; i < W.patrols.length; i++) { const p = W.patrols[i], px = at(p.s); ctx.fillStyle = p.chase ? '#ff5a3c' : TEAL; ctx.beginPath(); ctx.moveTo(px, stripY - 3); ctx.lineTo(px + 4, stripY - 8); ctx.lineTo(px - 4, stripY - 8); ctx.fill(); }
    for (let i = W.riders.length - 1; i >= 0; i--) {
      const R = W.riders[i]; if (R.dnf) continue; const px = at(R.s);
      ctx.beginPath(); ctx.arc(px, stripY + 4.5, R.isPlayer ? 5 : 3.3, 0, TAU); ctx.fillStyle = riderColor(R); ctx.fill();
      if (R.isPlayer) { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    txt(ctx, Math.max(0, (T.finishS - P.s) / 1000).toFixed(1) + ' km to go', stripX + stripW / 2, stripY + 18, 10, DIM, 'center', '600');
    ctx.fillStyle = INK; ctx.fillRect(stripX + stripW + 1, stripY - 4, 2, 12); ctx.fillRect(stripX + stripW + 3, stripY - 4, 6, 5);
  }
  // a top-down outline of the course on bigger screens
  let mapW = 0;
  if (w >= 700 && h >= 560) {
    const M = mapPts(T), S = 118; mapW = S * M.w + 34; const mx = w - pad.right - S - 6, my = h - pad.bottom - S * M.h - 30;
    plate(ctx, mx - 10, my - 10, S * M.w + 20, S * M.h + 20, 12);
    ctx.strokeStyle = 'rgba(251,245,236,0.55)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
    M.pts.forEach((p, i) => { const X = mx + p[0] * S, Y = my + p[1] * S; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.stroke();
    const dot = (s, col, r) => { const i = rowOf(T, s), b = T.box, mm = Math.max(b.x1 - b.x0, b.z1 - b.z0); ctx.beginPath(); ctx.arc(mx + (T.PX[i] - b.x0) / mm * S, my + (T.PZ[i] - b.z0) / mm * S, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); };
    dot(T.finishS, INK, 3);
    for (let i = 0; i < W.patrols.length; i++) dot(W.patrols[i].s, W.patrols[i].chase ? '#ff5a3c' : TEAL, 2.5);
    for (let i = W.riders.length - 1; i >= 0; i--) if (!W.riders[i].dnf) dot(W.riders[i].s, riderColor(W.riders[i]), W.riders[i].isPlayer ? 4.5 : 2.6);
  }
  // countdown
  if (W.phase === 'grid' && !W.attract) {
    // a soft shadow under the count: it sits over the gantry and the sky
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 1;
    const n = Math.ceil(W.cd);
    if (n <= 3 && n >= 1) { const f = W.cd - Math.floor(W.cd); txt(ctx, String(n), w / 2, cy, (rm ? 86 : 86 + 40 * f) * sc, GOLD, 'center', '600', F_DISP); }
    else txt(ctx, T.def.name.toUpperCase(), w / 2, cy, 18 * sc, INK, 'center', '700');
    txt(ctx, a.touchMode ? 'Throttle is automatic' : (W.cfg.gas === 'auto' ? 'Throttle is automatic' : 'Hold Up or click to ride'), w / 2, cy + 64 * sc, 12.5 * sc, INK, 'center', '700');
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }
  if (W.bannerT > 0 && W.banner) {
    const f = clamp(W.bannerT, 0, 1);
    ctx.globalAlpha = f; txt(ctx, W.banner, w / 2, cy, 64 * sc, W.banner === 'GO!' ? '#44ffa8' : GOLD, 'center', '600', F_DISP); ctx.globalAlpha = 1;
  }
  // bend warning
  let warnY = cy - 70 * sc;
  if (W.phase === 'racing' && P.crash <= 0 && !P.sc) {
    let vs = 1e9, at = 0;
    for (let k = 1; k <= 12; k++) { const v = T.VS[rowOf(T, P.s + k * 8)]; if (v < vs) { vs = v; at = k * 8; } }
    if (vs < P.v - 3 && vs < 30) {
      const on = rm || Math.floor(a.time * 4) % 2 === 0, c = T.CV[rowOf(T, P.s + at)], dir = c > 0 ? 1 : -1;
      if (on) {
        const bx2 = w / 2, by = warnY;
        ctx.fillStyle = 'rgba(255,183,54,0.92)';
        for (let i = 0; i < 3; i++) { const x = bx2 + dir * (i - 1) * 22 * sc; ctx.beginPath(); ctx.moveTo(x - dir * 8 * sc, by - 12 * sc); ctx.lineTo(x + dir * 6 * sc, by); ctx.lineTo(x - dir * 8 * sc, by + 12 * sc); ctx.lineTo(x - dir * 2 * sc, by); ctx.closePath(); ctx.fill(); }
        txt(ctx, Math.abs(c) > 0.018 ? 'HAIRPIN, BRAKE' : 'SHARP BEND', bx2, by + 26 * sc, 11 * sc, GOLD, 'center', '700');
      }
    }
    // an old bridge coming up on the inside
    for (let q = 0; q < T.sc.length; q++) {
      const s0 = T.sc[q].s0, d = s0 - P.s;
      if (d > 0 && d < 150) {
        const bw2 = 236 * sc, bx2 = (w - bw2) / 2, by2 = pad.top + 92 * sc + (small ? 58 * sc : 0);
        plate(ctx, bx2, by2, bw2, 34 * sc, 9);
        txt(ctx, 'OLD BRIDGE ' + Math.round(d) + ' m', bx2 + bw2 / 2, by2 + 11 * sc, 11 * sc, '#44ffa8', 'center', '700');
        txt(ctx, 'Hug the ' + (T.sc[q].side > 0 ? 'right' : 'left') + ' edge to take the shortcut', bx2 + bw2 / 2, by2 + 24 * sc, 9.5 * sc, INK, 'center', '600');
      }
    }
  }
  // the patrol: close by, or on your tail
  if (W.phase === 'racing') {
    const pyy = pad.top + 56 + (small ? 58 * sc : 0);
    if (chase) {
      const gap = Math.max(0, P.s - chase.s), bw2 = 236 * sc, bx2 = (w - bw2) / 2;
      plate(ctx, bx2, pyy, bw2, 40 * sc, 9);
      const on = rm || Math.floor(a.time * 5) % 2 === 0;
      ctx.fillStyle = on ? '#2a6bff' : '#ff2a2a'; ctx.beginPath(); ctx.arc(bx2 + 16 * sc, pyy + 13 * sc, 5 * sc, 0, TAU); ctx.fill();
      txt(ctx, 'PATROL ON YOUR TAIL  ' + Math.round(gap) + ' m', bx2 + 28 * sc, pyy + 13 * sc, 10.5 * sc, '#ffd6d0', 'left', '700');
      bar(ctx, bx2 + 12 * sc, pyy + 26 * sc, bw2 - 24 * sc, 5 * sc, clamp(Math.max(gap / 220, chase.lostT / 3.2), 0, 1), '#44ffa8');
      if (chase.closeT > 0.2) txt(ctx, 'PULL AWAY OR BE BUSTED', w / 2, pyy + 54 * sc, 12 * sc, '#ff5a3c', 'center', '800');
    } else {
      let near = 1e9;
      for (let i = 0; i < W.patrols.length; i++) { const d = W.patrols[i].s - P.s; if (W.patrols[i].down <= 0 && d > -40 && d < 160) near = Math.min(near, Math.abs(d)); }
      if (near < 1e9) {
        const on = rm || Math.floor(a.time * 3) % 2 === 0;
        const bw2 = 220 * sc, bx2 = (w - bw2) / 2;
        plate(ctx, bx2, pyy, bw2, 30 * sc, 8);
        ctx.fillStyle = on ? '#2a6bff' : '#ff2a2a'; ctx.beginPath(); ctx.arc(bx2 + 16 * sc, pyy + 15 * sc, 5 * sc, 0, TAU); ctx.fill();
        txt(ctx, 'PATROL ' + Math.round(near) + ' m, NO FIGHTING', bx2 + 28 * sc, pyy + 15 * sc, 10.5 * sc, '#cfe0ff', 'left', '700');
      }
    }
  }
  // a blow coming your way: get the guard up
  if (W.tele && W.phase === 'racing' && P.crash <= 0) {
    const k = clamp(W.tele.t / Math.max(0.05, W.tele.d), 0, 1), gy = h * (small ? 0.4 : 0.37);
    const sideTxt = W.tele.R.x < P.x ? '◀ ' : '';
    ctx.globalAlpha = 0.6 + 0.4 * (1 - k);
    rr(ctx, w / 2 - 92 * sc, gy - 22 * sc, 184 * sc, 44 * sc, 12); ctx.fillStyle = 'rgba(120,20,10,0.78)'; ctx.fill();
    ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 2; ctx.stroke();
    txt(ctx, sideTxt + (W.tele.k === 2 ? 'KICK! GUARD' : 'GUARD') + (sideTxt ? '' : ' ▶'), w / 2, gy - 6 * sc, 14 * sc, '#fff1ea', 'center', '800');
    txt(ctx, ctlName(a, 'guard'), w / 2, gy + 11 * sc, 10 * sc, '#ffd0c4', 'center', '600');
    ctx.globalAlpha = 1;
  }
  // fight prompts: who you can reach on each side, and how
  if (W.phase === 'racing' && P.crash <= 0 && !P.sc) {
    [-1, 1].forEach((sd) => {
      const o = sd < 0 ? tL : tR;
      if (!o) return;
      const bw2 = 158 * sc, bh = 50 * sc, by = h - pad.bottom - bh - (a.touchMode && a.touchStyle === 'pads' ? 10 : 18), bx2 = sd < 0 ? pad.left + 4 : w - pad.right - bw2 - 4 - mapW;
      const pulse = rm ? 1 : 0.82 + 0.18 * Math.sin(a.time * 10);
      rr(ctx, bx2, by, bw2, bh, 12); ctx.fillStyle = 'rgba(255,105,64,' + (0.78 * pulse) + ')'; ctx.fill();
      txt(ctx, (sd < 0 ? '◀ ' : '') + o.name.split(' ')[0].toUpperCase() + (sd > 0 ? ' ▶' : ''), bx2 + bw2 / 2, by + 13 * sc, 11 * sc, '#fff7ee', 'center', '700');
      bar(ctx, bx2 + 12, by + 23 * sc, bw2 - 24, 4, o.bal / 100, '#fff1e6', 'rgba(0,0,0,0.25)');
      txt(ctx, small || a.touchMode ? 'Punch: ' + ctlName(a, sd < 0 ? 'pl' : 'pr') : 'Punch ' + ctlName(a, sd < 0 ? 'pl' : 'pr') + ' · Kick ' + ctlName(a, 'kick'), bx2 + bw2 / 2, by + 38 * sc, 9 * sc, '#ffe3d6', 'center', '600');
    });
  }
  // thrown off: run back to the bike
  if (P.crash > 0 && W.phase === 'racing') {
    const x = w / 2, y = h * (small ? 0.62 : 0.68), d = Math.hypot(P.rd, P.x - P.rx);
    ctx.beginPath(); ctx.arc(x, y, 28, 0, TAU); ctx.fillStyle = 'rgba(12,10,8,0.6)'; ctx.fill();
    const f = P.crashPh === 0 ? 0.1 * clamp(P.crashT, 0, 1) : P.crashPh === 1 ? 0.1 + 0.15 * clamp(P.phT / 0.7, 0, 1) : P.crashPh === 2 ? 0.25 + 0.7 * clamp(1 - d / Math.max(1, P.rd0 || d), 0, 1) : 1;
    ctx.beginPath(); ctx.arc(x, y, 28, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.strokeStyle = '#44ffa8'; ctx.lineWidth = 4; ctx.stroke();
    txt(ctx, P.crashPh >= 2 ? Math.round(d) + ' m' : '...', x, y, 13, INK, 'center', '700');
    txt(ctx, P.crashPh >= 2 ? 'Run to your bike: ' + ctlName(a, 'run') : 'Back on your feet...', x, y + 48, 11 * sc, INK, 'center', '600');
  }
  // pops
  for (let i = 0; i < W.pops.length; i++) {
    const p = W.pops[i], k = p.t / 1.6, al = k < 0.04 ? 0.6 + k * 10 : k > 0.7 ? (1 - k) / 0.3 : 1;
    const y = h * 0.42 - (W.pops.length - 1 - i) * 58 * sc - (rm ? 0 : k * 24);
    ctx.globalAlpha = clamp(al, 0, 1);
    // a soft dark panel and shadow so the call reads over a bright sky or a white wall
    const fs = (p.big ? 30 : 22) * sc, ss = 11.5 * sc;
    ctx.font = '700 ' + fs + 'px ' + F_DISP; let tw = ctx.measureText(p.text).width;
    if (p.sub) { ctx.font = '700 ' + ss + 'px ' + F_MONO; tw = Math.max(tw, ctx.measureText(p.sub).width); }
    const pw = Math.min(w - 16, tw + 34 * sc), ph = fs + (p.sub ? ss + 14 * sc : 10 * sc);
    rr(ctx, w / 2 - pw / 2, y - fs * 0.62 - 3 * sc, pw, ph, 12); ctx.fillStyle = 'rgba(12,10,8,0.62)'; ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
    txt(ctx, p.text, w / 2, y, fs, p.col === DIM ? '#e9e1d3' : p.col, 'center', '700', F_DISP);
    if (p.sub) txt(ctx, p.sub, w / 2, y + fs * 0.5 + ss * 0.75, ss, '#fffaf2', 'center', '700');
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;
  }
  // the commentary box, low on the screen
  if (W.comm.length && !W.attract) {
    const c = W.comm[0], al = clamp(Math.min(c.t / 0.25, (3.4 - c.t) / 0.4), 0, 1);
    ctx.font = '600 ' + 12 * sc + 'px ' + F_BODY; const tw = Math.min(w - 40, ctx.measureText(c.s).width + 70 * sc);
    const by = h - pad.bottom - (a.touchMode && a.touchStyle === 'pads' ? 196 : 92) * sc;
    ctx.globalAlpha = al;
    rr(ctx, (w - tw) / 2, by, tw, 28 * sc, 8); ctx.fillStyle = 'rgba(12,10,8,0.7)'; ctx.fill();
    ctx.fillStyle = '#e8452c'; rr(ctx, (w - tw) / 2 + 6, by + 7 * sc, 34 * sc, 14 * sc, 4); ctx.fill();
    txt(ctx, 'LIVE', (w - tw) / 2 + 6 + 17 * sc, by + 14 * sc, 8 * sc, '#fff', 'center', '800');
    ctx.save(); ctx.beginPath(); ctx.rect((w - tw) / 2 + 44 * sc, by, tw - 50 * sc, 28 * sc); ctx.clip();
    txt(ctx, c.s, (w - tw) / 2 + 48 * sc, by + 14 * sc, 12 * sc, INK, 'left', '600', F_BODY);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // combat school: the lesson in hand
  if (W.tut && W.phase === 'racing') {
    const L = TUT[W.tut.step];
    if (L) {
      const dev = a.touchMode ? (a.touchStyle === 'pads' ? 'p' : 't') : a.gamepad ? 'g' : 'k';
      const bw2 = Math.min(w - 32, 360 * sc), bx2 = (w - bw2) / 2, by = h * (small ? 0.68 : 0.7);
      plate(ctx, bx2, by, bw2, 52 * sc, 12);
      txt(ctx, 'LESSON ' + (W.tut.step + 1) + ' OF ' + TUT.length + ': ' + L.title.toUpperCase(), bx2 + bw2 / 2, by + 15 * sc, 10 * sc, GOLD, 'center', '700');
      ctx.save(); ctx.beginPath(); ctx.rect(bx2 + 6, by, bw2 - 12, 52 * sc); ctx.clip();
      txt(ctx, L[dev], bx2 + bw2 / 2, by + 35 * sc, 11 * sc, INK, 'center', '600', F_BODY);
      ctx.restore();
    }
  }
  // a reminder of the touch gestures for the first seconds
  if (a.touchMode && a.touchStyle !== 'pads' && W.phase === 'racing' && W.t < 7 && !W.attract && !W.tut && !(P.stats.punches + P.stats.kicks)) {
    const al = W.t > 5.5 ? (7 - W.t) / 1.5 : 1;
    ctx.globalAlpha = clamp(al, 0, 1);
    const lines = [a.touchStyle === 'tilt' ? 'Tilt to steer, swipe up for nitro' : 'Drag to steer, swipe up for nitro', 'Swipe left or right: punch', 'Long swipe: kick. Swipe down: guard'];
    const y = h - pad.bottom - 150;
    const bw2 = Math.min(w - 24, 320);
    plate(ctx, w / 2 - bw2 / 2, y - 22, bw2, 70, 12);
    txt(ctx, lines[0], w / 2, y - 6, 12.5, INK, 'center', '700');
    txt(ctx, lines[1], w / 2, y + 13, 10.5, DIM, 'center', '600');
    txt(ctx, lines[2], w / 2, y + 30, 10.5, DIM, 'center', '600');
    ctx.globalAlpha = 1;
  }
}

// The race intro: the route, the level and the weather over the flyover, and who has a score to settle.
function drawIntroCard(ctx, a, W, sc) {
  const w = a.w, h = a.h, T = W.T, k = clamp(W.introT / 0.6, 0, 1) * clamp((W.introDur - W.introT) / 0.5, 0, 1);
  ctx.globalAlpha = k;
  const x = a.hudPad().left + 18, y = h * 0.62;
  const gd = ctx.createLinearGradient(0, y - 60 * sc, 0, y + 150 * sc); gd.addColorStop(0, 'rgba(8,7,6,0)'); gd.addColorStop(0.3, 'rgba(8,7,6,0.5)'); gd.addColorStop(0.7, 'rgba(8,7,6,0.5)'); gd.addColorStop(1, 'rgba(8,7,6,0)');
  ctx.fillStyle = gd; ctx.fillRect(0, y - 60 * sc, w, 210 * sc);
  const mode = W.cfg.mode;
  const eyebrow = mode === 'career' ? 'LEVEL ' + W.lv.n + ', ' + W.lv.name.toUpperCase() : mode === 'grudge' ? 'GRUDGE MATCH' : mode === 'time' ? 'TIME TRIAL' : mode === 'practice' ? 'COMBAT SCHOOL' : 'QUICK RACE';
  txt(ctx, eyebrow, x, y, 11 * sc, GOLD, 'left', '700');
  txt(ctx, T.def.name, x, y + 34 * sc, 34 * sc, INK, 'left', '600', F_DISP);
  txt(ctx, T.def.when + ' · ' + (WEATHER[W.wx] || 'Clear') + ' · ' + (Math.round((T.finishS - T.startS) / 100) / 10) + ' km' + (T.sc.length ? ' · ' + T.sc.length + ' old bridge' + (T.sc.length > 1 ? 's' : '') : ''), x, y + 64 * sc, 12 * sc, DIM, 'left', '600', F_BODY);
  const foe = W.riders.find((r) => !r.isPlayer && grudgeOf(r.name) >= 1);
  if (mode === 'grudge' && W.riders[1]) txt(ctx, W.riders[1].name + ': "' + W.riders[1].line + '"', x, y + 88 * sc, 12 * sc, ORANGE, 'left', '600', F_BODY);
  else if (foe) txt(ctx, 'Grudge: ' + foe.name + ' remembers you', x, y + 88 * sc, 12 * sc, ORANGE, 'left', '600', F_BODY);
  else if (W.riders.length > 2) txt(ctx, (W.riders.length - 1) + ' rivals: ' + W.riders.slice(1, 4).map((r) => r.name.split(' ')[0]).join(', ') + ' and more', x, y + 88 * sc, 12 * sc, INK, 'left', '600', F_BODY);
  ctx.globalAlpha = 1;
  txt(ctx, a.touchMode ? 'Tap to skip' : 'Press any key to skip', w - a.hudPad().right - 16, h - a.hudPad().bottom - 24, 10, DIM, 'right', '600');
}
function drawReplayTag(ctx, a, W, sc) {
  const clip = W.clips[W.replay.ci]; if (!clip) return;
  const pad = a.hudPad(), x = pad.left + 16, y = pad.top + 46 * sc;
  const on = a.reducedMotion || Math.floor(a.time * 2) % 2 === 0;
  ctx.fillStyle = on ? '#e8452c' : 'rgba(232,69,44,0.35)'; ctx.beginPath(); ctx.arc(x + 6, y, 6, 0, TAU); ctx.fill();
  txt(ctx, 'REPLAY ' + (W.replay.ci + 1) + ' / ' + Math.min(2, W.clips.length), x + 20, y, 12 * sc, INK, 'left', '700');
  txt(ctx, clip.label, x, y + 26 * sc, 20 * sc, INK, 'left', '600', F_DISP);
  txt(ctx, a.touchMode ? 'Tap to skip' : 'Press any key to skip', a.w - pad.right - 16, a.h - pad.bottom - 24, 10, DIM, 'right', '600');
}
function drawPodiumCard(ctx, a, W, sc) {
  const w = a.w, h = a.h, pad = a.hudPad(), k = clamp(W.podT / 0.6, 0, 1);
  ctx.globalAlpha = k;
  txt(ctx, W.T.def.name.toUpperCase() + ', THE PODIUM', w / 2, pad.top + 40 * sc, 11 * sc, GOLD, 'center', '700');
  const names = (W.podium || []).map((r, i) => (i + 1) + '. ' + r.name).join('    ');
  txt(ctx, names, w / 2, h - pad.bottom - 60 * sc, 14 * sc, INK, 'center', '600', F_BODY);
  ctx.globalAlpha = 1;
  txt(ctx, a.touchMode ? 'Tap to continue' : 'Press any key to continue', w - pad.right - 16, h - pad.bottom - 24, 10, DIM, 'right', '600');
}

/* ------------------------------------------------------------ menu, garage and glue */
const MENU_CSS =
  '.gr-prev{display:grid;grid-template-columns:150px 1fr;gap:14px;align-items:center;margin:2px 0 12px;padding:10px;border:1px solid var(--rule-strong);border-radius:12px;background:var(--bg-deep)}' +
  '.arc-stage .gr-prev canvas{position:static;inset:auto;width:150px;height:96px;display:block;border-radius:8px;background:var(--bg)}' +
  '.gr-stat{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:center;font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.gr-stat .gr-name{grid-column:1/-1;font-family:var(--font-display);font-size:20px;letter-spacing:0;text-transform:none;color:var(--ink);line-height:1.1}' +
  '.gr-bar{height:6px;border-radius:3px;background:var(--rule);position:relative;overflow:hidden}.gr-bar i{position:absolute;inset:0 auto 0 0;background:var(--accent-warm);border-radius:3px}' +
  '.gr-blurb{grid-column:1/-1;font-family:var(--font-body);font-size:13px;letter-spacing:0;text-transform:none;color:var(--ink-dim);line-height:1.35}' +
  '.gr-wallet{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:0 0 10px;font-family:var(--font-mono);font-size:12px;color:var(--ink-dim)}' +
  '.gr-wallet b{color:var(--accent-warm);font-size:15px;font-weight:500}' +
  '.gr-buy{min-height:36px;padding:0 12px;border-radius:9px;border:1px solid var(--rule-strong);background:var(--primary-soft);color:var(--ink);cursor:pointer;font-family:var(--font-mono);font-size:12px}' +
  '.gr-buy[disabled]{opacity:.45;cursor:default}.gr-buy:not([disabled]){border-color:var(--accent-warm);color:var(--accent-warm)}' +
  '.gr-courses{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 12px;margin:0 0 12px;font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.gr-courses b{display:block;font-size:13px;color:var(--ink);font-weight:500;letter-spacing:0;text-transform:none}.gr-courses span.lock b{color:var(--ink-mute)}.gr-courses span.q b{color:#44ffa8}' +
  '.gr-res{width:100%;border-collapse:collapse;margin:4px 0 12px;font-size:14px}.gr-res td{padding:6px 8px;border-bottom:1px solid var(--rule);color:var(--ink-dim)}' +
  '.gr-res tr.me td{background:var(--primary-soft);color:var(--ink)}.gr-res td:first-child{font-family:var(--font-mono);color:var(--accent);width:30px}' +
  '.gr-res small{display:block;font-size:11px;color:var(--ink-mute)}.gr-res td:last-child{text-align:right;font-family:var(--font-mono)}' +
  '.gr-line{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 10px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}.gr-line b{display:block;font-size:16px;color:var(--ink);font-weight:500}' +
  '.gr-cash{font-size:14px;color:var(--ink-dim)}.gr-cash b{color:var(--accent-warm)}' +
  '.gr-lv{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline;margin:0 0 6px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}.gr-lv b{font-family:var(--font-display);font-size:17px;letter-spacing:0;text-transform:none;color:var(--ink);font-weight:500}' +
  '.gr-bikes{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin:0 0 14px}' +
  '.gr-bk{padding:10px;border:1px solid var(--rule-strong);border-radius:12px;background:var(--bg-deep);display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center;font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}' +
  '.gr-bk.cur{border-color:var(--accent-warm)}.gr-bk h3{grid-column:1/-1;margin:0;font-family:var(--font-display);font-size:18px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--ink)}.gr-bk h3 i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:8px;vertical-align:middle}' +
  '.gr-bk p{grid-column:1/-1;margin:2px 0 4px;font-family:var(--font-body);font-size:12px;letter-spacing:0;text-transform:none;color:var(--ink-dim);line-height:1.3}.gr-bk .gr-buy{grid-column:1/-1;margin-top:4px}' +
  '.gr-ups{display:grid;gap:8px;margin:0 0 12px}.gr-up{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;padding:8px 10px;border:1px solid var(--rule);border-radius:10px}' +
  '.gr-up b{font-size:14px;color:var(--ink);font-weight:500}.gr-up small{grid-column:1;font-size:12px;color:var(--ink-mute)}.gr-up .gr-buy{grid-row:1/3;grid-column:2}.gr-pips{font-family:var(--font-mono);color:var(--accent-warm);letter-spacing:.2em;margin-left:8px}' +
  '.gr-tab{width:100%;border-collapse:collapse;margin:4px 0 14px;font-size:13px}.gr-tab td,.gr-tab th{padding:5px 8px;border-bottom:1px solid var(--rule);color:var(--ink-dim);text-align:left}.gr-tab th{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute);font-weight:500}' +
  '.gr-tab tr.me td{color:var(--ink);background:var(--primary-soft)}.gr-tab td.n{font-family:var(--font-mono);text-align:right}.gr-heat{color:#ff6940;letter-spacing:.1em}' +
  '.gr-h{margin:14px 0 6px;font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-warm)}.gr-rules p{margin:0 0 8px;font-size:14px;line-height:1.45;color:var(--ink-dim)}.gr-rules b{color:var(--ink);font-weight:600}' +
  '.arc-card:has(.gr-prev),.arc-card:has(.gr-bikes),.arc-card:has(.gr-tab),.arc-card:has(.gr-rules){padding-bottom:0}.arc-card:has(.gr-prev) .arc-actions,.arc-card:has(.gr-bikes) .arc-actions,.arc-card:has(.gr-tab) .arc-actions,.arc-card:has(.gr-rules) .arc-actions{position:sticky;bottom:0;background:var(--bg-elev);padding:12px 0 clamp(14px,3vw,22px);margin-top:8px;box-shadow:0 -14px 14px var(--bg-elev);z-index:2}' +
  '.arc-card:has(.gr-prev) .arc-actions .arc-btn:not(.primary){min-height:40px;padding:0 14px;font-size:14px}.arc-card:has(.gr-prev) .arc-actions{gap:8px}' +
  '.arc-card:has(.gr-prev) p{font-size:14px;margin-bottom:10px}.arc-card:has(.gr-prev) h2{margin:4px 0 8px}' +
  '@media (pointer:fine){.arc-card:has(.gr-prev) .arc-seg button{min-height:34px;padding:0 12px;font-size:13px}.arc-card:has(.gr-prev) .arc-opts{gap:7px;margin-bottom:6px}}' +
  '@media (max-width:420px){.gr-prev{grid-template-columns:118px 1fr;gap:10px}.arc-stage .gr-prev canvas{width:118px;height:76px}.gr-courses{grid-template-columns:1fr 1fr;font-size:10px}.gr-bikes{grid-template-columns:1fr}}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }

// A side view of the chosen bike against the chosen course's sky, for the menu card.
function drawPreview(cv) {
  const g = cv.getContext('2d'), ch = ARC.choices, L = LOOK[ch.course] || LOOK.misty, b = BIKES[ch.bike] || BIKES.scout, W = cv.width, H = cv.height;
  const hz = H * 0.62, sg = g.createLinearGradient(0, 0, 0, hz);
  sg.addColorStop(0, L.skyTop); sg.addColorStop(0.6, L.skyMid); sg.addColorStop(1, L.skyHor);
  g.fillStyle = sg; g.fillRect(0, 0, W, hz + 1);
  const sx = W * (0.5 + Math.sin(L.sunAz) * 0.35), sy = hz * (1 - L.sunEl * 1.6) - 6;
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 50); sun.addColorStop(0, 'rgba(255,240,210,.95)'); sun.addColorStop(0.2, 'rgba(255,220,170,.5)'); sun.addColorStop(1, 'rgba(255,220,170,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, hz);
  g.fillStyle = 'rgba(40,52,70,.55)'; g.beginPath(); g.moveTo(0, hz); for (let x = 0; x <= W; x += 12) g.lineTo(x, hz - 18 - Math.sin(x * 0.03) * 12 - Math.sin(x * 0.11) * 6); g.lineTo(W, hz); g.fill();
  g.fillStyle = L.grass2; g.fillRect(0, hz, W, H - hz);
  g.fillStyle = '#4e4d52'; g.fillRect(0, hz + 10, W, H - hz - 10);
  g.fillStyle = 'rgba(238,236,226,.8)'; for (let i = 0; i < 5; i++) g.fillRect(10 + i * W / 4.5, hz + (H - hz) * 0.72, W / 10, 2);
  if (L.rain) { g.strokeStyle = 'rgba(214,226,238,.45)'; g.lineWidth = 1; for (let i = 0; i < 60; i++) { const x = hash(i * 3) * W, y = hash(i * 7) * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + 10); g.stroke(); } }
  const s = W / 3.1, ox = W * 0.5, gy = H * 0.9, X = (z) => ox + z * s, Y = (y) => gy - y * s;
  g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(ox, gy + 1, s * 0.8, 4, 0, 0, TAU); g.fill();
  [-0.71, 0.71].forEach((z) => { g.beginPath(); g.arc(X(z), Y(0.32), 0.32 * s, 0, TAU); g.fillStyle = '#121214'; g.fill(); g.beginPath(); g.arc(X(z), Y(0.32), 0.2 * s, 0, TAU); g.fillStyle = '#9aa0a8'; g.fill(); g.beginPath(); g.arc(X(z), Y(0.32), 0.06 * s, 0, TAU); g.fillStyle = '#444'; g.fill(); });
  g.strokeStyle = '#2a2b30'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(-0.71), Y(0.32)); g.lineTo(X(-0.52), Y(0.98)); g.moveTo(X(0.71), Y(0.32)); g.lineTo(X(0.28), Y(0.48)); g.stroke();
  g.fillStyle = '#8a8e96'; g.fillRect(X(-0.25), Y(0.62), 0.42 * s, 0.32 * s);
  g.fillStyle = b.paint;
  g.beginPath(); g.ellipse(X(-0.18), Y(0.96), 0.32 * s, 0.13 * s, 0, 0, TAU); g.fill();
  if (b.fam === 'phantom') { g.beginPath(); g.moveTo(X(-0.9), Y(0.82)); g.lineTo(X(-0.5), Y(1.16)); g.lineTo(X(-0.1), Y(0.66)); g.lineTo(X(-0.4), Y(0.42)); g.closePath(); g.fill(); g.beginPath(); g.moveTo(X(0.3), Y(0.92)); g.lineTo(X(0.92), Y(1.12)); g.lineTo(X(0.4), Y(0.8)); g.fill(); }
  else { g.fillRect(X(0.35), Y(0.96), 0.4 * s, 0.08 * s); }
  g.fillStyle = b.trim; g.fillRect(X(-0.32), Y(1.0), 0.28 * s, 0.03 * s);
  g.fillStyle = '#26201c'; g.fillRect(X(0.0), Y(0.93), 0.42 * s, 0.07 * s);
  const P2 = POSE[KIND_POSE[b.fam]];
  g.strokeStyle = '#23262d'; g.lineWidth = 0.17 * s; g.lineCap = 'round';
  g.beginPath(); g.moveTo(X(P2.pelvis[2]), Y(P2.pelvis[1])); g.lineTo(X(P2.knee[2]), Y(P2.knee[1])); g.lineTo(X(P2.peg[2]), Y(P2.peg[1] + 0.06)); g.stroke();
  g.strokeStyle = PLAYER_LOOK.jacket; g.lineWidth = 0.3 * s;
  g.beginPath(); g.moveTo(X(P2.pelvis[2]), Y(P2.pelvis[1])); g.lineTo(X(P2.sh[2]), Y(P2.sh[1])); g.stroke();
  g.lineWidth = 0.12 * s; g.beginPath(); g.moveTo(X(P2.sh[2]), Y(P2.sh[1])); g.lineTo(X(P2.grip[2]), Y(P2.grip[1])); g.stroke();
  g.fillStyle = PLAYER_LOOK.helmet; g.beginPath(); g.arc(X(P2.head[2]), Y(P2.head[1]), 0.16 * s, 0, TAU); g.fill();
  g.fillStyle = '#121620'; g.beginPath(); g.arc(X(P2.head[2]) - 0.05 * s, Y(P2.head[1]), 0.1 * s, Math.PI * 0.6, Math.PI * 1.4); g.fill();
  g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(X(-0.86), Y(0.95), 0.05 * s, 0, TAU); g.fill();
}
const statBar = (l, v) => '<span>' + l + '</span><div class="gr-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div>';
function refreshPreview() {
  const card = document.querySelector('.arc-card'); if (!card) return;
  const cv = card.querySelector('.gr-cv'), st = card.querySelector('.gr-stat'); if (!cv || !st) return;
  const b = BIKES[ARC.choices.bike] || BIKES.scout, u = upOf(b.id);
  try { drawPreview(cv); } catch (e) { /* the menu must always open */ }
  const own = SAVE.owned.indexOf(b.id) >= 0;
  st.innerHTML = '<div class="gr-name">' + ARC.esc(b.name) + (own ? '' : ' <small style="font-size:12px;color:var(--accent-warm)">' + money(b.price) + '</small>') + '</div>' + statBar('Speed', b.spd * (1 + 0.035 * u.eng) / 1.15) + statBar('Handling', b.hdl * (1 + 0.05 * u.tyre) / 1.12) + statBar('Weight', b.wgt) + '<div class="gr-blurb">' + ARC.esc(b.blurb) + '</div>';
}
function ladderHtml() {
  const L = levelDef(SAVE.level);
  const chips = L.routes.map((id) => { const q = SAVE.qual[id], c = courseDef(id); return '<span class="' + (q != null ? 'q' : '') + '">' + ARC.esc(c.name) + '<b>' + (q != null ? 'Qualified, ' + ordinal(q) : 'Top 3 to qualify') + '</b></span>'; }).join('');
  return '<div class="gr-lv">Career <b>Level ' + L.n + ': ' + ARC.esc(L.name) + '</b>' + (SAVE.crowned ? ' Crowned' : '') + '</div><div class="gr-courses">' + chips + '</div>';
}
function menuProps() {
  const buys = BIKE_ORDER.filter((id) => SAVE.owned.indexOf(id) < 0).slice(0, 2).map((id) => '<button type="button" class="gr-buy" data-buy="' + id + '"' + (SAVE.cash < BIKES[id].price ? ' disabled' : '') + '>Buy ' + BIKES[id].name + ' ' + money(BIKES[id].price) + '</button>').join('');
  const routeLabel = (c) => c.name + (routeOpen(c.id) ? '' : ' (from Level ' + (LEVELS.findIndex((l) => l.routes.indexOf(c.id) >= 0) + 1) + ')');
  return {
    eyebrow: 'Mountain road combat racing', title: 'Ghat <em>Riders</em>', noBest: true,
    html: '<div class="gr-prev"><canvas class="gr-cv" width="300" height="192"></canvas><div class="gr-stat"></div></div>' +
      '<p>Race and brawl down mountain and coastal ghat roads. Punch and kick the riders alongside, guard and parry their blows, dodge trucks, cows and goats, take the old bridge shortcuts, and keep clear of the patrol. Finish in the top three on every route of a level to climb the career ladder.</p>' +
      '<div class="gr-wallet">Wallet <b>' + money(SAVE.cash) + '</b>' + buys + '</div>' + ladderHtml(),
    options: [
      { id: 'mode', label: 'Mode', value: 'career', choices: [{ v: 'career', label: 'Career' }, { v: 'quick', label: 'Quick race' }, { v: 'grudge', label: 'Grudge match' }, { v: 'time', label: 'Time trial' }, { v: 'practice', label: 'Combat school' }] },
      { id: 'course', label: 'Route', value: 'misty', choices: COURSES.map((c) => ({ v: c.id, label: routeLabel(c) })) },
      { id: 'bike', label: 'Bike', value: 'scout', choices: BIKE_ORDER.map((id) => ({ v: id, label: BIKES[id].name + (SAVE.owned.indexOf(id) < 0 ? ' (' + money(BIKES[id].price) + ')' : '') })) },
      { id: 'weather', label: 'Weather', value: 'route', choices: [{ v: 'route', label: 'Route default' }, { v: 'clear', label: 'Clear' }, { v: 'rain', label: 'Rain' }, { v: 'fog', label: 'Fog' }, { v: 'storm', label: 'Storm' }], note: 'Career races use each route\'s own weather.' },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      { id: 'gas', label: 'Throttle', value: ARC.touchMode ? 'auto' : 'manual', choices: [{ v: 'auto', label: 'Automatic' }, { v: 'manual', label: 'Hold to ride' }], note: 'On touch screens the throttle is always automatic.' }
    ],
    actions: [{ label: 'Race', primary: true, on: () => ARC.start() }, { label: 'Garage', on: openGarage }, { label: 'Career', on: openCareer }, { label: 'How to play', on: openRules }]
  };
}
// The garage: buy bikes, pick one to ride, and spend prize money on its upgrades.
function openGarage() {
  injectCss();
  const cur = BIKES[ARC.choices.bike] && SAVE.owned.indexOf(ARC.choices.bike) >= 0 ? ARC.choices.bike : 'scout';
  const cards = BIKE_ORDER.map((id) => {
    const b = BIKES[id], own = SAVE.owned.indexOf(id) >= 0, u = upOf(id);
    const btn = own ? (id === cur ? '<button type="button" class="gr-buy" disabled>Riding this</button>' : '<button type="button" class="gr-buy" data-ride="' + id + '">Ride this</button>')
      : '<button type="button" class="gr-buy" data-buy="' + id + '"' + (SAVE.cash < b.price ? ' disabled' : '') + '>Buy for ' + money(b.price) + '</button>';
    return '<div class="gr-bk' + (id === cur ? ' cur' : '') + '"><h3><i style="background:' + b.paint + '"></i>' + ARC.esc(b.name) + '</h3><p>' + ARC.esc(b.blurb) + '</p>' +
      statBar('Speed', b.spd * (1 + 0.035 * u.eng) / 1.15) + statBar('Handling', b.hdl * (1 + 0.05 * u.tyre) / 1.12) + statBar('Weight', b.wgt) + btn + '</div>';
  }).join('');
  const u = upOf(cur);
  const ups = UPGRADES.map((g) => {
    const lv = u[g.id], next = g.cost[lv];
    const btn = lv >= g.max ? '<button type="button" class="gr-buy" disabled>Maxed</button>' : '<button type="button" class="gr-buy" data-up="' + g.id + '"' + (SAVE.cash < next ? ' disabled' : '') + '>Fit ' + money(next) + '</button>';
    return '<div class="gr-up"><div><b>' + ARC.esc(g.name) + '</b><span class="gr-pips">' + '■'.repeat(lv) + '□'.repeat(g.max - lv) + '</span></div><small>' + ARC.esc(g.note) + '</small>' + btn + '</div>';
  }).join('');
  ARC.panel({
    eyebrow: 'Garage and shop', title: 'Wallet <em>' + money(SAVE.cash) + '</em>',
    html: '<div class="gr-bikes">' + cards + '</div><div class="gr-h">Upgrades for the ' + ARC.esc(BIKES[cur].name) + '</div><div class="gr-ups">' + ups + '</div>',
    actions: [{ label: 'Back to the menu', primary: true, on: () => ARC.menu() }]
  });
  const card = document.querySelector('.arc-card'); if (!card) return;
  card.querySelectorAll('[data-buy]').forEach((el) => el.addEventListener('click', () => { buyBike(el.getAttribute('data-buy')); openGarage(); }));
  card.querySelectorAll('[data-ride]').forEach((el) => el.addEventListener('click', () => { const id = el.getAttribute('data-ride'); ARC.choices.bike = id; ARC.store.set('arcade.ghat-riders.bike', id); ARC.sfx.tone(660, 0.08, { type: 'triangle', vol: 0.1 }); openGarage(); }));
  card.querySelectorAll('[data-up]').forEach((el) => el.addEventListener('click', () => {
    const g = UPGRADES.find((x) => x.id === el.getAttribute('data-up')), uu = SAVE.up[cur] || (SAVE.up[cur] = { eng: 0, tyre: 0, arm: 0, nos: 0 }), lv = uu[g.id] | 0;
    if (lv >= g.max || SAVE.cash < g.cost[lv]) return;
    SAVE.cash -= g.cost[lv]; uu[g.id] = lv + 1; saveGame();
    ARC.sfx.tone(520, 0.08, { type: 'triangle', vol: 0.12 }); ARC.sfx.tone(780, 0.14, { type: 'triangle', vol: 0.12, delay: 0.08 });
    ARC.toast(g.name + ' fitted', BIKES[cur].name + ', stage ' + (lv + 1), 1300);
    openGarage();
  }));
}
function buyBike(id) {
  const b = BIKES[id];
  if (!b || SAVE.owned.indexOf(id) >= 0) return;
  if (SAVE.cash < b.price) { ARC.toast('Not enough prize money', money(b.price - SAVE.cash) + ' to go', 1400); return; }
  SAVE.cash -= b.price; SAVE.owned.push(id); saveGame();
  ARC.choices.bike = id; ARC.store.set('arcade.ghat-riders.bike', id);
  ARC.sfx.tone(660, 0.1, { type: 'triangle', vol: 0.12 }); ARC.sfx.tone(990, 0.16, { type: 'triangle', vol: 0.12, delay: 0.1 });
  ARC.toast(b.name + ' is yours', 'Ride it today', 1500);
}
// The career: the ladder, the season table and the rivals, with the grudge each one holds.
function openCareer() {
  injectCss();
  const lv = LEVELS.map((L) => {
    const st = L.n < SAVE.level || (L.n === SAVE.level && SAVE.crowned) ? 'Cleared' : L.n === SAVE.level ? L.routes.filter((id) => SAVE.qual[id] != null).length + ' of ' + L.routes.length + ' qualified' : 'Locked';
    return '<tr class="' + (L.n === SAVE.level ? 'me' : '') + '"><td>' + L.n + '. ' + ARC.esc(L.name) + '<small style="display:block;color:var(--ink-mute)">' + L.routes.map((id) => ARC.esc(courseDef(id).name)).join(', ') + '</small></td><td>' + st + '</td><td class="n">x' + L.prize + '</td></tr>';
  }).join('');
  const table = Object.keys(SAVE.pts).map((k) => [k, SAVE.pts[k]]).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map((r, i) => '<tr class="' + (r[0] === 'You' ? 'me' : '') + '"><td class="n">' + (i + 1) + '</td><td>' + ARC.esc(r[0]) + '</td><td class="n">' + r[1] + '</td></tr>').join('') || '<tr><td colspan="3">No races yet this season.</td></tr>';
  const riv = RIVALS.map((r) => {
    const g = grudgeOf(r.name), heat = g >= 0.5 ? '<span class="gr-heat">' + '♦'.repeat(clamp(Math.round(g), 1, 5)) + '</span>' : '';
    return '<tr><td>' + ARC.esc(r.name) + (r.tier > SAVE.level ? ' <small style="color:var(--ink-mute)">(Level ' + r.tier + ')</small>' : '') + '<small style="display:block;color:var(--ink-mute)">' + ARC.esc(BIKES[r.kind].name + ', ' + STYLES[r.style].name + '. ' + r.line) + '</small></td><td>' + heat + '</td></tr>';
  }).join('');
  const R = SAVE.rec;
  ARC.panel({
    eyebrow: 'Career', title: 'Level <em>' + SAVE.level + '</em> of ' + LEVELS.length,
    html: '<div class="gr-h">The ladder</div><table class="gr-tab"><tr><th>Level</th><th>Status</th><th>Prize</th></tr>' + lv + '</table>' +
      '<div class="gr-h">Season points</div><table class="gr-tab">' + table + '</table>' +
      '<div class="gr-h">The rivals and their grudges</div><table class="gr-tab">' + riv + '</table>' +
      '<div class="gr-line"><span>Races<b>' + R.races + '</b></span><span>Wins<b>' + R.wins + '</b></span><span>Podiums<b>' + R.podiums + '</b></span><span>Knock-offs<b>' + R.knocks + '</b></span><span>Busted<b>' + R.busted + '</b></span><span>Earned<b>' + money(R.earned) + '</b></span></div>',
    actions: [{ label: 'Back to the menu', primary: true, on: () => ARC.menu() }]
  });
}
function openRules() {
  injectCss();
  ARC.panel({
    eyebrow: 'How to play', title: 'Ride hard, <em>fight fair</em>',
    html: '<div class="gr-rules">' +
      '<div class="gr-h">The race</div><p>Point to point down a ghat road, eight riders, first across the line wins. Prize money for every finish, more the higher you place and the higher your level. Hairpins need braking; slipstream a rider or a truck and pass cleanly to fill your <b>nitro</b>.</p>' +
      '<div class="gr-h">Fighting</div><p>When a rider is alongside you can <b>punch</b> to that side (quick, light) or <b>kick</b> (slow, heavy, and it dents their bike). Each blow takes some of their <b>balance</b>; at zero they are knocked off. Kick them near the edge of the road and they may go straight over. Blows cost <b>stamina</b>: tired blows are weak and slow, so let it refill.</p>' +
      '<p>Hold the <b>guard</b> to block: most of the blow is soaked, but it drains stamina. Raise it just as a blow lands to <b>parry</b>: the attacker staggers and your next hit lands harder. Watch for the GUARD warning when a rival winds up. Hit someone mid-swing for a counter, and chain hits for a combo.</p>' +
      '<div class="gr-h">Thrown off</div><p>Knocked off or crashed, you tumble (nobody is hurt), get up and run back to your bike. Mash a key or tap to run faster. Every crash damages the <b>bike</b>; at zero it is wrecked, your race is over and the repairs cost money. Armour from the shop helps.</p>' +
      '<div class="gr-h">The patrol</div><p>Patrol riders wait by the road and cruise the climb. Fight in front of them, or wipe out carelessly near them, and they chase you with the lights on. If they pull alongside and you cannot get away, you are <b>busted</b>: no prize and a fine. Escape by pulling more than 200 m clear, taking an old bridge, or leading them into the traffic. Rivals get busted too.</p>' +
      '<div class="gr-h">Old bridges and the road</div><p>Some hairpins have an old trestle bridge across the gully: hug the inside edge at the yellow sign to take the shortcut. Trucks, buses and cars come both ways, cows wander and goats cross in a line. Oil is slippery, gravel slows you (less on the Kestrel), and rain makes everything slicker.</p>' +
      '<div class="gr-h">Career</div><p>Each level is a set of routes. Finish in the top three on every one to qualify for the next level, with faster rivals, bigger purses and more patrol. Rivals remember who knocked them off: their <b>grudge</b> grows, and they come for you harder. Settle one in a Grudge match. Combat school teaches every move.</p>' +
      '</div>',
    showKeys: true,
    actions: [{ label: 'Back to the menu', primary: true, on: () => ARC.menu() }]
  });
}
function stopAll() { engineStop(); }

function debugState() {
  const W = Wd, a = ARC;
  if (!W) return { phase: 'none', state: a.state };
  const P = W.P, st = P.stats;
  let chase = null; for (let i = 0; i < W.patrols.length; i++) if (W.patrols[i].chase) chase = { target: W.patrols[i].tgt ? W.patrols[i].tgt.name : null, gap: W.patrols[i].tgt ? Math.round(W.patrols[i].tgt.s - W.patrols[i].s) : 0 };
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, mode: W.cfg.mode, course: W.T.id, diff: W.cfg.diff, bike: W.cfg.bike, weather: W.wx, level: W.lv.n, renderer: '3d',
    position: positionOf(W, P), riders: W.riders.length, speed: Math.round(P.v * KMH), distance: Math.round(Math.max(0, P.s - W.T.startS)), progress: +clamp((P.s - W.T.startS) / (W.T.finishS - W.T.startS), 0, 1).toFixed(3),
    x: +P.x.toFixed(2), lean: +P.lean.toFixed(2), steer: +(P.steerIn || 0).toFixed(2), nitro: Math.round(P.nitro), nitroOn: P.nitroOn, draft: +P.draft.toFixed(2),
    balance: Math.round(P.bal), stamina: Math.round(P.sta), bikeDamage: Math.round(P.dmg), guard: P.guard, attack: P.atkK ? ATK[P.atkK].name : null, combo: P.combo,
    shoves: st.shoves, hits: st.shoves, punches: st.punches, kicks: st.kicks, blocks: st.blocks, parries: st.parries, knockoffs: st.knocks, shovesTaken: st.taken, crashes: st.crashes, passes: st.passes, closeCalls: st.near, bridges: st.bridges,
    crashed: P.crash > 0, crashPhase: P.crash > 0 ? ['tumble', 'getup', 'run', 'mount'][P.crashPh] : null, runTo: P.crash > 0 ? +Math.hypot(P.rd, P.x - P.rx).toFixed(1) : 0, shortcut: P.sc ? P.sc.k : -1,
    time: +W.t.toFixed(2), countdown: +Math.max(0, W.cd).toFixed(2), intro: W.phase === 'intro' ? +(W.introDur - W.introT).toFixed(2) : 0,
    busted: W.busted, wrecked: W.wrecked, alive: !W.busted && !W.wrecked, finished: P.finished, results: W.results, chase, clips: W.clips.length, replay: W.replay ? W.replay.ci : -1, podium: W.podium ? W.podium.map((r) => r.name) : null,
    comm: W.comm.length ? W.comm[0].s : '', lesson: W.tut ? W.tut.step : -1,
    cash: SAVE.cash, careerLevel: SAVE.level, qualified: Object.keys(SAVE.qual), unlocked: SAVE.level, owned: SAVE.owned.slice(), upgrades: upOf(W.cfg.bike), patrols: W.patrols.length, traffic: W.traffic.length, animals: W.cows.length,
    rivals: W.riders.slice(1).map((r) => ({ name: r.name, style: r.style, s: Math.round(r.s), x: +r.x.toFixed(1), bal: Math.round(r.bal), crash: r.crash > 0, out: r.out || null, grudge: grudgeOf(r.name), pos: positionOf(W, r) })),
    gfx: R3 ? { quality: R3.quality, fps: Math.round(R3.fps), touchStyle: a.touchStyle, soft: R3.soft, calls: R3.renderer.info.render.calls, tris: R3.renderer.info.render.triangles } : null
  };
}
let FROZEN = false;
const dev = {
  world: () => Wd,
  // hold the simulation still (the picture keeps drawing): for screenshots of one exact moment
  freeze: (on) => { FROZEN = on !== false; },
  bot: (on) => { if (Wd) Wd.P.bot = on !== false; },
  ff: (sec) => { const n = Math.round(sec * 50); for (let i = 0; i < n && Wd && ARC.state === 'play' && !Wd.over; i++) stepWorld(Wd, 0.02); },
  teleport: (s) => { if (Wd) Wd.P.s = s; },
  quality: (q) => { if (R3) R3.lockQ = true; setQuality(q); },
  cash: (n) => { SAVE.cash = n; saveGame(); },
  unlock: (n) => { SAVE.level = clamp(n, 1, LEVELS.length); saveGame(); },
  shove: (sd) => { if (Wd) Wd.queuedAtk = { k: 1, side: sd }; },
  attack: (k, sd) => { if (Wd) Wd.queuedAtk = { k: k === 'kick' || k === 2 ? 2 : 1, side: sd || 0 }; },
  skipIntro: () => { if (Wd && Wd.phase === 'intro') { Wd.phase = 'grid'; Wd.cd = Math.min(Wd.cd, 3.4); } },
  skip: () => { if (Wd) Wd.skip = true; },
  career: () => SAVE,
  r3: () => R3,
  crash: (i) => { if (Wd) { const R = Wd.riders[i] || Wd.P; crash(Wd, R, 1, 'wall'); } },
  // who is drawn where, measured from the camera (for checks)
  probe: () => { if (!R3 || !R3.bikes) return null; const c = R3.camera.position; return { cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], bikes: R3.bikes.map((B) => ({ name: B.R.name, vis: B.root.visible && B.rroot.visible, hum: !!B.hum, d: +B.root.position.distanceTo(c).toFixed(2), top: B.hum ? B.hum.outfit.top : null })) }; }
};
function measureFps(dt) {
  const r = R3;
  r.qWarm = r.qWarm || 0;
  if (r.qWarm < 4) { r.qWarm++; return; }
  r.qT += dt; r.qN++;
  if (r.qT >= 1.2) {
    r.fps = r.qN / r.qT; r.qT = 0; r.qN = 0;
    if (!r.lockQ && r.fps < 40 && r.quality > 0) { setQuality(r.fps < 16 ? Math.max(0, r.quality - 2) : r.quality - 1); r.qWarm = 2; }
  }
}
function showNo3D(a) {
  a.panel({ eyebrow: 'Ghat Riders', title: '3D graphics <em>unavailable</em>', html: '<p>This browser could not start WebGL, which this game needs. Try another browser or turn on hardware acceleration.</p>', actions: [{ label: 'All games', href: '/games', primary: true }] });
}

Arcade.create({
  three: true,
  slug: 'ghat-riders', title: 'Ghat Riders', genre: 'Mountain road combat racing',
  graphics(level) { if (!R3) return; if (level === 'auto') { R3.lockQ = false; return; } R3.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  hint: 'Arrows or WASD to ride. Z / X punch left or right, C kicks, hold B to guard. Shift or N for nitro.',
  touchHint: 'Stick steers (pull down to brake). Punch L / R, Kick, hold Guard, Nitro.',
  keys: [['Left Right / A D', 'Steer'], ['Up / W', 'Throttle'], ['Down / S', 'Brake'], ['Z or J', 'Punch left'], ['X or K', 'Punch right'], ['C or L', 'Kick the nearest rider'], ['Space', 'Punch the nearest rider'], ['Hold B or Q', 'Guard (just in time to parry)'], ['Shift / N', 'Nitro'], ['Up or Space, fast', 'Run back to a fallen bike'], ['Any key', 'Skip the intro, replays and podium']],
  gameKeys: ['ShiftLeft', 'ShiftRight'],
  mouse: { steer: false, cursor: 'crosshair', keys: [['Move mouse', 'Steer toward the pointer'], ['Click / hold', 'Throttle']] },
  // Controller: RT throttle, LT brake, X punch left, B punch right, Y kick, A nitro, a bumper (LB or RB) guards.
  gamepad: { buttons: ['KeyN', 'KeyZ', 'KeyX', 'KeyC'], rt: 'ArrowUp', lt: 'ArrowDown' },
  touch: { stick: true, pads: [{ label: 'Punch L', key: 'KeyZ', hot: true }, { label: 'Punch R', key: 'KeyX', hot: true }, { label: 'Kick', key: 'KeyC' }, { label: 'Guard', key: 'KeyB' }, { label: 'Nitro', key: 'KeyN' }] },
  touchKeys: [['On-screen stick', 'Steer, pull down to brake'], ['Punch L / Punch R', 'Punch that side'], ['Kick', 'Kick the nearest rider'], ['Guard (hold)', 'Block, just in time to parry'], ['Nitro', 'Boost'], ['Throttle', 'Always on']],
  gestures: {
    drag: 'x', tilt: true,
    hint: 'Drag to steer. Swipe left or right to punch, a long swipe kicks, swipe down to guard, up for nitro.',
    keys: [['Drag left or right', 'Steer'], ['Swipe left / right', 'Punch that side'], ['Long, hard swipe', 'Kick that side'], ['Tap / double tap', 'Punch / kick the nearest rider'], ['Swipe down', 'Raise your guard'], ['Swipe up', 'Nitro'], ['Hold a downward drag', 'Brake'], ['Tap fast when thrown off', 'Run back to the bike'], ['Throttle', 'Always on']]
  },
  formatScore: (v) => Math.round(v).toLocaleString('en-IN') + ' pts',
  resize: (a) => resize3D(a),
  init(a) {
    ARC = a;
    loadSave();
    if (!setup3D(a)) { NO3D = true; showNo3D(a); return; }
    setQuality(R3.soft ? 0 : a.device === 'desktop' ? 3 : 2); resize3D(a);
    const origMenu = a.menu;
    a.menu = function (p) { stopAll(); return origMenu(Object.assign(menuProps(), p || {})); };
    a.debug = debugState;
    a.dev = dev;
    a.menu();
  },
  onMenu(a) {
    if (NO3D) return;
    injectCss(); stopAll();
    const card = document.querySelector('.arc-card'); if (!card) return;
    refreshPreview();
    card.querySelectorAll('.arc-seg').forEach((seg) => seg.addEventListener('click', () => setTimeout(refreshPreview, 0)));
    card.querySelectorAll('.gr-buy[data-buy]').forEach((btn) => btn.addEventListener('click', () => { buyBike(btn.getAttribute('data-buy')); a.menu(); }));
  },
  start(a, ch) {
    if (NO3D) return;
    let course = COURSE_IDX[ch.course] != null ? ch.course : 'misty', bike = ch.bike;
    const mode = ch.mode || 'career';
    if (mode === 'career') {
      const L = levelDef(SAVE.level);
      // the career moves on by itself: a route already qualified gives way to the next one still open
      if (L.routes.indexOf(course) < 0 || (SAVE.qual[course] != null && L.routes.some((id) => SAVE.qual[id] == null))) {
        const nxt = L.routes.find((id) => SAVE.qual[id] == null) || L.routes[0];
        if (nxt !== course) { a.toast('Career, Level ' + L.n, 'Next up: ' + courseDef(nxt).name, 1800); course = nxt; a.choices.course = nxt; a.store.set('arcade.ghat-riders.course', nxt); }
      }
    } else if (mode === 'practice') course = 'misty';
    else if (!routeOpen(course)) { const nxt = levelDef(SAVE.level).routes[0]; a.toast('That route opens later in the career', 'Racing ' + courseDef(nxt).name, 1800); course = nxt; }
    if (SAVE.owned.indexOf(bike) < 0) { bike = 'scout'; a.toast('You do not own that bike yet', 'Riding the Scout', 1800); }
    const foe = topGrudge();
    Wd = newWorld({ course, mode, bike, diff: ch.diff || 'normal', gas: a.touchMode ? 'auto' : (ch.gas || 'manual'), attract: false, weather: mode === 'career' || mode === 'practice' ? 'route' : (ch.weather || 'route'), level: SAVE.level, foe: foe ? foe.name : null });
    engineStart();
    if (POST) POST.letterbox(1);
    if (R3) R3.worldRef = null;
  },
  update(dt, a) {
    if (!Wd || NO3D || FROZEN) return;
    const W = Wd, P = W.P, inp = a.input, gest = a.touchMode && a.touchStyle !== 'pads';
    const sw = inp.swipe(), tap = inp.tap();
    const anyKey = inp.hit('Space', 'Enter', 'KeyJ', 'KeyK', 'KeyZ', 'KeyX', 'KeyC', 'KeyN', 'ArrowUp', 'KeyW', 'KeyL');
    if (W.phase === 'intro' || W.phase === 'replay' || W.phase === 'podium' || (W.phase === 'finished' && W.finWait > 0.8)) {
      if (tap || sw || anyKey || (inp.pointer.pressed && !a.touchMode)) W.skip = true;
      if (W.phase === 'intro' && W.skip && POST) POST.letterbox(0);
    } else if (W.phase === 'racing' && !W.attract) {
      if (W.phase === 'racing' && POST && W.t < 0.1) POST.letterbox(0);
      if (P.crash > 0) {
        // thrown off: every tap or press is a stride
        if (tap || sw || inp.hit('ArrowUp', 'KeyW', 'Space', 'KeyN', 'KeyJ')) P.runBoost = Math.min(1.4, P.runBoost + 0.45);
      } else {
        if (sw && gest) {
          if (sw.dir === 'left' || sw.dir === 'right') W.queuedAtk = { k: Math.abs(sw.dx) >= 130 || sw.power >= 0.8 ? 2 : 1, side: sw.dir === 'left' ? -1 : 1 };
          else if (sw.dir === 'up') { if (P.nitro > 5) { P.nLatch = 1.2 + 0.9 * sw.power; a.sfx.tone(520, 0.08, { type: 'triangle', vol: 0.1 }); } else a.toast('Nitro empty', 'Fight, pass and slipstream to fill it', 1000); }
          else if (sw.dir === 'down') P.guardLatch = 0.75 + 0.35 * sw.power;
        }
        if (tap && a.touchMode) {
          const dbl = a.time - (W.lastTap || -9) < 0.32;
          W.queuedAtk = { k: dbl ? 2 : 1, side: 0 }; W.lastTap = dbl ? -9 : a.time;
        }
      }
    }
    if (W.phase === 'grid' && POST && W.cd < 3.3) POST.letterbox(0);
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(W, dt / n);
  },
  idle(dt, a) {
    if (NO3D || a.state !== 'menu') return;
    const c = a.choices, key = c.course + '|' + c.bike + '|' + c.weather;
    if (!Wd || !Wd.attract || Wd.attractKey !== key) {
      Wd = newWorld({ course: COURSE_IDX[c.course] != null ? c.course : 'misty', mode: 'quick', bike: BIKES[c.bike] ? c.bike : 'scout', diff: 'normal', gas: 'auto', attract: true, weather: c.weather || 'route' }); Wd.attractKey = key;
      Wd.P.s = 260; Wd.riders.forEach((r, i) => { if (i) r.s = 250 + i * 7; });
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let k = 0; k < n; k++) stepWorld(Wd, dt / n);
  },
  render(ctx, a) {
    if (NO3D || !R3) return;
    const W = Wd;
    const now = performance.now(), dtRaw = R3.lastNow ? (now - R3.lastNow) / 1000 : 1 / 60, dtReal = clamp(dtRaw, 0.001, 0.1); R3.lastNow = now;
    if (!W) { ctx.fillStyle = '#060503'; ctx.fillRect(0, 0, a.w, a.h); return; }
    if (R3.lost || R3.renderer.getContext().isContextLost()) {
      ctx.fillStyle = 'rgba(6,5,3,.85)'; ctx.fillRect(0, 0, a.w, a.h);
      txt(ctx, 'Graphics paused. Restoring...', a.w / 2, a.h / 2, 16, INK, 'center', '600'); return;
    }
    measureFps(dtRaw);
    if (R3.worldRef !== W) { activateWorld(W); R3.qWarm = 0; }
    const slow = W.slowT > 0 && !a.reducedMotion ? 0.35 : 1;
    renderScene(W, a.state === 'pause' ? 0 : dtReal * slow, a);
    if (a.state !== 'menu') drawHUD(ctx, a, W);
  },
  onPause() { engineStop(); },
  onResume() { if (Wd && !Wd.attract && !Wd.over) engineStart(); },
  onOver() { engineStop(); }
});
