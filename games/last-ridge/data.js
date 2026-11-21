/*
 * Last Ridge, the data: who fights, what they carry, where, and what is said.
 * Everything here is invented: the nations, the units, the ranks, the places
 * and every weapon (no real gun names or designs). Nobody is hurt: a soldier
 * who takes too many hits is knocked down and out of the fight.
 *
 * Units are metres and seconds. A map is a grid of 2 m cells; x runs east,
 * z runs south, and yaw 0 looks north (-z).
 */

export const CS = 2;
export const EYE = { stand: 1.62, crouch: 1.12, prone: 0.42, slide: 0.86 };
export const BODY = { stand: 1.8, crouch: 1.25, prone: 0.5, slide: 1.0 };
export const RAD = 0.34;
export const LOW_H = 1.05, TALL_H = 2.5, WALL_H = 4.4;

/* ------------------------------------------------------------ the two sides */
export const FACTIONS = [
  { id: 0, name: 'Task Force Halberd', short: 'HALBERD', nation: 'the Northmarch Union', ui: '#8fd3ff', tag: '#5fb6ff',
    kit: { top: '#5d6448', top2: '#3e4433', bottom: '#4f5640', shoes: '#2a2620', soles: '#3a352c', gloves: '#2b2a24', helmet: '#4b5240', vest: '#3a4030', strap: '#2a2e24' } },
  { id: 1, name: 'Grey Banner', short: 'GREY BANNER', nation: 'the Vostrel Directorate', ui: '#ff8a66', tag: '#ff6a4a',
    kit: { top: '#5a5d63', top2: '#3d4046', bottom: '#45484e', shoes: '#1e1f22', soles: '#2e2f33', gloves: '#202124', helmet: '#3b3d42', vest: '#2c2e33', strap: '#7a2e24' } },
];
export const FFA_KIT = { top: '#6a5a44', top2: '#4a3f30', bottom: '#4d4436', shoes: '#26221d', soles: '#3a342b', gloves: '#2a2620', helmet: '#56503f', vest: '#3b352a', strap: '#8a6a2a' };
export const ALLIES = ['Okoro', 'Pell', 'Ivo', 'Marsh', 'Tamsin', 'Rook', 'Haldane', 'Brisk'];
export const RIVALS = ['Varga', 'Drost', 'Kell', 'Mazur', 'Lenko', 'Orsk', 'Brann', 'Teodor', 'Halvic', 'Ruza', 'Sorrel', 'Vane'];
export const FFA_NAMES = ['Wick', 'Saber', 'Moth', 'Grit', 'Ember', 'Quill', 'Hollow', 'Lark', 'Flint', 'Sable'];
export const HQ = 'Hearth';

/* ------------------------------------------------------------ weapons (all invented) */
// rate: rounds per second. dmg: per hit at close range, falling to dmgFar past far metres.
// spread in degrees (hip, ads). kick: vertical recoil per shot in degrees, side: horizontal.
export const WEAPONS = {
  vr7: { id: 'vr7', name: 'VR-7 Carbine', cls: 'Assault rifle', slot: 0, mode: 'auto', rate: 11.5, dmg: 28, dmgFar: 21, near: 26, far: 48, mag: 30, spare: 120, reload: 2.0, reloadEmpty: 2.5,
    hip: 3.4, ads: 0.4, adsT: 0.22, zoom: 1.32, kick: 0.62, side: 0.28, move: 1.0, sound: 'rifle', unlock: 1, len: 0.72, body: '#3a3d36', acc: '#6b6a5a', blurb: 'A balanced carbine that does a little of everything.' },
  ks9: { id: 'ks9', name: 'KS-9 Sparrow', cls: 'Submachine gun', slot: 0, mode: 'auto', rate: 14, dmg: 22, dmgFar: 13, near: 12, far: 26, mag: 32, spare: 160, reload: 1.6, reloadEmpty: 2.0,
    hip: 2.4, ads: 0.75, adsT: 0.16, zoom: 1.22, kick: 0.46, side: 0.4, move: 1.08, sound: 'smg', unlock: 1, len: 0.52, body: '#2f3134', acc: '#4f5254', blurb: 'Light and fast, deadly up close and hopeless at range.' },
  tr12: { id: 'tr12', name: 'Thresher T-12', cls: 'Shotgun', slot: 0, mode: 'pump', rate: 1.3, pellets: 8, dmg: 17, dmgFar: 3, near: 7, far: 18, mag: 6, spare: 30, reload: 0.55, reloadEmpty: 0.55, shell: true,
    hip: 6.5, ads: 5, adsT: 0.2, zoom: 1.12, kick: 2.6, side: 0.6, move: 1.02, sound: 'shotgun', unlock: 4, len: 0.8, body: '#3b2f26', acc: '#5a4a3a', blurb: 'Pump action. One shell clears a doorway.' },
  ld4: { id: 'ld4', name: 'Lancet LD-4', cls: 'Marksman rifle', slot: 0, mode: 'semi', rate: 4.2, dmg: 52, dmgFar: 44, near: 40, far: 80, mag: 12, spare: 60, reload: 2.3, reloadEmpty: 2.8,
    hip: 4.5, ads: 0.12, adsT: 0.3, zoom: 2.4, kick: 1.8, side: 0.3, move: 0.95, sound: 'dmr', unlock: 6, len: 0.9, body: '#4a4434', acc: '#2e2c26', scope: true, blurb: 'Semi automatic, a built in scope, two hits to put anyone down.' },
  hm40: { id: 'hm40', name: 'HM-40 Hailstorm', cls: 'Light machine gun', slot: 0, mode: 'auto', rate: 10, dmg: 30, dmgFar: 24, near: 30, far: 60, mag: 80, spare: 160, reload: 4.4, reloadEmpty: 5.0,
    hip: 4.6, ads: 0.6, adsT: 0.38, zoom: 1.3, kick: 0.72, side: 0.42, move: 0.86, sound: 'lmg', unlock: 10, len: 0.95, body: '#383a30', acc: '#55574a', blurb: 'A long belt and a heavy hand. Hold a lane on your own.' },
  lw8: { id: 'lw8', name: 'Longwatch LW-8', cls: 'Bolt action rifle', slot: 0, mode: 'bolt', rate: 0.85, dmg: 105, dmgFar: 98, near: 60, far: 120, mag: 5, spare: 25, reload: 3.0, reloadEmpty: 3.4,
    hip: 9, ads: 0.02, adsT: 0.42, zoom: 4.2, kick: 4.2, side: 0.5, move: 0.92, sound: 'sniper', unlock: 14, len: 1.1, body: '#3d4436', acc: '#22251f', scope: true, blurb: 'One clean hit on the body puts anyone down. Hold your breath.' },
  p11: { id: 'p11', name: 'P-11 Wren', cls: 'Pistol', slot: 1, mode: 'semi', rate: 6.5, dmg: 30, dmgFar: 20, near: 14, far: 30, mag: 12, spare: 48, reload: 1.35, reloadEmpty: 1.6,
    hip: 2.0, ads: 0.6, adsT: 0.12, zoom: 1.15, kick: 1.1, side: 0.3, move: 1.1, sound: 'pistol', unlock: 1, len: 0.22, body: '#2a2b2d', acc: '#48494c', blurb: 'The sidearm. Quicker to draw than to reload a rifle.' },
  bk2: { id: 'bk2', name: 'Brakk B-2', cls: 'Machine pistol', slot: 1, mode: 'auto', rate: 15, dmg: 18, dmgFar: 11, near: 9, far: 20, mag: 20, spare: 80, reload: 1.5, reloadEmpty: 1.8,
    hip: 2.6, ads: 1.1, adsT: 0.13, zoom: 1.12, kick: 0.5, side: 0.55, move: 1.08, sound: 'smg', unlock: 8, len: 0.26, body: '#2d2c2a', acc: '#5c4a38', blurb: 'A pistol that never stops talking.' },
  rk3: { id: 'rk3', name: 'RK-3 Pike', cls: 'Launcher', slot: 1, mode: 'rocket', rate: 0.5, dmg: 140, dmgFar: 140, near: 0, far: 0, mag: 1, spare: 2, reload: 2.6, reloadEmpty: 2.6, rocket: true,
    hip: 1.2, ads: 0.3, adsT: 0.35, zoom: 1.4, kick: 3, side: 0.4, move: 0.92, sound: 'rocket', unlock: 17, len: 0.95, body: '#3f4532', acc: '#2a2d24', blurb: 'A shoulder launcher. Knocks down drones, crews and cover.' },
  turret: { id: 'turret', name: 'Mounted HM-90', cls: 'Mounted gun', slot: 0, mode: 'auto', rate: 9, dmg: 40, dmgFar: 34, near: 40, far: 90, mag: 9999, spare: 0, reload: 0, reloadEmpty: 0,
    hip: 1.4, ads: 0.6, adsT: 0.2, zoom: 1.4, kick: 0.45, side: 0.3, move: 0, sound: 'lmg', unlock: 99, len: 1.2, body: '#3a3d34', acc: '#222', blurb: '' },
};
export const PRIMARY = ['vr7', 'ks9', 'tr12', 'ld4', 'hm40', 'lw8'];
export const SECONDARY = ['p11', 'bk2', 'rk3'];

// Attachments: one optic and one mod per weapon, unlocked by rank.
export const OPTICS = {
  iron: { id: 'iron', name: 'Iron sights', unlock: 1, zoom: 1, note: 'The sights the weapon came with.' },
  pip: { id: 'pip', name: 'Pip dot', unlock: 3, zoom: 1.05, adsT: 0.95, note: 'A small red dot, a clearer picture.' },
  ring: { id: 'ring', name: 'Ring reflex', unlock: 7, zoom: 1.1, note: 'A wide ring reticle, quick on target.' },
  scout: { id: 'scout', name: 'Scout 3x', unlock: 12, zoom: 2.0, adsT: 1.2, note: 'Three times magnified. Slower to raise.' },
};
export const MODS = {
  none: { id: 'none', name: 'No mod', unlock: 1, note: 'Nothing on the rail.' },
  grip: { id: 'grip', name: 'Foregrip', unlock: 2, note: 'A quarter less climb on every shot.' },
  mag: { id: 'mag', name: 'Long mag', unlock: 5, note: 'Half again the rounds, a slower reload.' },
  quiet: { id: 'quiet', name: 'Hush can', unlock: 9, note: 'Quiet shots that stay off the enemy radar. Shorter range.' },
  laser: { id: 'laser', name: 'Laser', unlock: 15, note: 'A third tighter from the hip.' },
  stock: { id: 'stock', name: 'Light stock', unlock: 19, note: 'Raise the sights a quarter faster.' },
};
export const PERKS = [
  [{ id: 'swift', name: 'Swiftfoot', unlock: 1, note: 'Sprint for longer and raise your weapon sooner after a sprint.' },
   { id: 'bulwark', name: 'Bulwark', unlock: 4, note: 'Take a third less from blasts.' },
   { id: 'ghost', name: 'Greycoat', unlock: 11, note: 'Hidden from enemy recon drones while you move.' }],
  [{ id: 'steady', name: 'Steady Hands', unlock: 1, note: 'Less recoil and a tighter hip spread.' },
   { id: 'quick', name: 'Quickload', unlock: 6, note: 'Reload a quarter faster.' },
   { id: 'deep', name: 'Deep Pockets', unlock: 13, note: 'An extra grenade of each kind and a spare magazine.' }],
  [{ id: 'light', name: 'Lightstep', unlock: 1, note: 'Your footsteps are almost silent.' },
   { id: 'ears', name: 'Keen Ears', unlock: 8, note: 'Enemy footsteps are louder and show on your radar up close.' },
   { id: 'hard', name: 'Hardline', unlock: 16, note: 'Scorestreaks cost a fifth less.' }],
];
export const LETHAL = { frag: { id: 'frag', name: 'Frag grenade', note: 'Cook it, throw it, clear a room. A blast of dust and grit, nobody hurt for real.' } };
export const TACTICAL = {
  smoke: { id: 'smoke', name: 'Smoke grenade', note: 'A thick grey screen for a crossing.' },
  flash: { id: 'flash', name: 'Flash grenade', note: 'A white flash and a ringing that leaves anyone facing it helpless for a moment.' },
};
// Ready made classes, and a custom one built in the Armory.
export const CLASSES = {
  rifleman: { id: 'rifleman', name: 'Rifleman', primary: 'vr7', optic: 'iron', mod: 'grip', secondary: 'p11', tactical: 'smoke', perks: ['swift', 'steady', 'light'] },
  pointman: { id: 'pointman', name: 'Pointman', primary: 'ks9', optic: 'iron', mod: 'none', secondary: 'p11', tactical: 'flash', perks: ['swift', 'steady', 'light'] },
  marksman: { id: 'marksman', name: 'Marksman', primary: 'ld4', optic: 'iron', mod: 'none', secondary: 'p11', tactical: 'smoke', perks: ['swift', 'steady', 'light'], unlock: 6 },
  gunner: { id: 'gunner', name: 'Gunner', primary: 'hm40', optic: 'iron', mod: 'grip', secondary: 'p11', tactical: 'smoke', perks: ['bulwark', 'steady', 'light'], unlock: 10 },
};

/* ------------------------------------------------------------ scorestreaks */
export const STREAKS = [
  { id: 'drone', name: 'Recon Drone', cost: 400, key: 'Digit4', note: 'Shows every enemy on the radar for thirty seconds.' },
  { id: 'supply', name: 'Supply Drop', cost: 600, key: 'Digit5', note: 'A crate on a parachute: full ammo, grenades and an armour plate.' },
  { id: 'mortar', name: 'Mortar Strike', cost: 900, key: 'Digit6', note: 'Three shells on the ground under your sights.' },
];

/* ------------------------------------------------------------ ranks */
const TITLES = ['Recruit', 'Trooper', 'Lance', 'Warden', 'Sentinel', 'Vanguard', 'Marshal', 'Ridgeguard', 'Pathfinder', 'Highwarden'];
export const RANKS = [];
for (let i = 0; i < 30; i++) {
  const t = TITLES[Math.floor(i / 3)], tier = ['I', 'II', 'III'][i % 3];
  RANKS.push({ level: i + 1, title: i === 29 ? 'Last Ridge Legend' : t + ' ' + tier, xp: Math.round(700 * i + 120 * i * i) });
}
export function rankOf(xp) {
  let r = RANKS[0];
  for (const k of RANKS) if (xp >= k.xp) r = k;
  return r;
}

/* ------------------------------------------------------------ maps */
// Cell kinds: '.' open ground, '#' building wall, 'H' cliff or sea wall (edge),
// 'X' water edge, 'b' tall cover (containers, crate stacks), 'c' low cover
// (sandbags, barriers: vault or crouch behind), 'o' pillar, mast, tank, crane leg,
// 't' rock or tree, 'e' fuel barrel (shoot it and it blows), 'B' a spawn of the
// north side (mirrored to the south side for the other team).
export const MAPS = {
  ridge: {
    id: 'ridge', name: 'Korrin Ridge', where: 'A mountain relay outpost', when: 'Dawn, light snow', mirror: true, wallH: 3.4, floor: 'snow',
    blurb: 'Snow, rock and sandbags around a relay mast on a mountain spine. Bunkers at both ends, long sightlines down the middle and a rock trail on each flank.',
    rows: [
      'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
      'HHt....B.B.B..####..B.B.B....tHH',
      'Ht............#..#............tH',
      'H.....bb......#....c....bb.....H',
      'H..cc.........##.#........cc...H',
      'H.......t..................t...H',
      'H..t.......cc.......cc.......t.H',
      'H.....bb..........e.....bb.....H',
      'Ht...........ccc.........c....tH',
      'H...c....t..........t....c.....H',
      'H...c.........bb..bb...........H',
      'Htt........c..........c......ttH',
      'H.....e....c...oo.....c..e.....H',
      'H..bb..........oo.........bb...H',
      'H.......cc............cc.......H',
      'Ht...t.......c....c.......t...tH',
    ],
    dom: [[16, 6], [16, 15.5], [16, 25]], sites: [[8, 8], [24, 8]],
    land: [['the north bunker', 16, 2.5], ['the south bunker', 16, 29.5], ['the relay mast', 16, 15.5], ['the west rocks', 3, 15.5], ['the east rocks', 29, 15.5], ['the north trench', 16, 8], ['the south trench', 16, 23], ['the west crates', 7, 7], ['the east crates', 25, 7], ['the west slope', 6, 24], ['the east slope', 26, 24]],
    look: { sky: ['#5a7096', '#e8c9b8', '#cfd6dc'], sun: '#ffd2a8', sunEl: 0.16, sunAz: -0.9, sunI: 2.6, hemi: ['#c9d6e6', '#8a8f96', 1.25], fog: '#c4ccd6', fogD: 0.012, exposure: 1.08, snow: 0.6, rain: 0, night: 0, env: 0.7, grade: 'natural' },
  },
  docks: {
    id: 'docks', name: 'Saltmere Docks', where: 'A container port on a grey sea', when: 'Night, rain', mirror: true, wallH: 4.6, floor: 'wet',
    blurb: 'Stacked containers, warehouse walls and crane legs on a rain soaked quay. Tight lanes, stacked cover and floodlights in the wet.',
    rows: [
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'X....B.B.B..bbbb..bbbb.B.B.B...X',
      'X...........bbbb..bbbb.........X',
      'X.##...e...................##..X',
      'X.##...c....c......c....c..##..X',
      'X...........bb....bb...........X',
      'X..bbbb...................bbbb.X',
      'X..bbbb...cc.........cc...bbbb.X',
      'X.............o..o.............X',
      'X..c....bb..............bb..c..X',
      'X..c....bb...######.....bb..c..X',
      'X...........#.....#............X',
      'X.bbb..e....#..e..#.....e..bbb.X',
      'X.bbb.......##.#.##.........bbbX',
      'X......cc..............cc......X',
      'X..o.......b....b....b.......o.X',
    ],
    dom: [[16, 5], [16, 15.5], [16, 26]], sites: [[6, 8], [26, 8]],
    land: [['the north quay', 16, 2], ['the south quay', 16, 29], ['the west stacks', 4, 6.5], ['the east stacks', 28, 6.5], ['the pump house', 15, 11.5], ['the south pump house', 15, 20.5], ['the crane legs', 16, 8], ['mid quay', 16, 15.5], ['the west warehouse', 2.5, 3.5], ['the east warehouse', 28.5, 3.5]],
    look: { sky: ['#18233a', '#34445e', '#5a6a80'], sun: '#c8d6f0', sunEl: 0.7, sunAz: 0.7, sunI: 1.25, hemi: ['#8ea4c8', '#2a303a', 1.7], fog: '#2c3848', fogD: 0.022, exposure: 1.45, snow: 0, rain: 1, night: 1, env: 0.4, grade: 'night' },
  },
  town: {
    id: 'town', name: 'Varrow Old Town', where: 'A hill town square and its lanes', when: 'Golden hour', mirror: true, wallH: 5.2, floor: 'cobble',
    blurb: 'Stone houses, market stalls and a fountain square. Lanes wrap round the old chapel and every corner is a fight.',
    rows: [
      '################################',
      '#....B.B.B..#....#..B.B.B......#',
      '#...........#....#.............#',
      '#.###..c..........c....c..###..#',
      '#.#.#.....###....###......#.#..#',
      '#.....e...#.......#.......e....#',
      '#..cc.....#.......#.......cc...#',
      '####.....................#######',
      '#......bb....c....c...bb.......#',
      '#..##.....................##...#',
      '#..##..c....######....c...##...#',
      '#.......o...#....#...o.........#',
      '#..e........#.cc.#.........e...#',
      '#....bb.....##..##........bb...#',
      '####.........................###',
      '#......c.......o.......c.......#',
    ],
    dom: [[5.5, 9], [16, 15.5], [26.5, 22]], sites: [[3, 5], [27, 5]],
    land: [['the north gate', 14.5, 1.5], ['the south gate', 14.5, 30.5], ['the fountain square', 16, 15.5], ['the chapel', 14.5, 11.5], ['the south chapel', 14.5, 20.5], ['the west lane', 2, 15.5], ['the east lane', 28, 15.5], ['the market', 8, 8], ['the south market', 8, 23], ['the north houses', 27, 4], ['the south houses', 27, 27]],
    look: { sky: ['#4a6ea6', '#f0b07a', '#ffd9a8'], sun: '#ffb874', sunEl: 0.14, sunAz: 1.9, sunI: 3.2, hemi: ['#d9c6b0', '#8a6a4a', 1.2], fog: '#d9a98a', fogD: 0.011, exposure: 1.05, snow: 0, rain: 0, night: 0, env: 0.7, grade: 'natural' },
  },
  refinery: {
    id: 'refinery', name: 'Drayfield Refinery', where: 'A desert fuel works', when: 'Sunset, dust in the air', mirror: true, wallH: 3.6, floor: 'sand',
    blurb: 'Fuel tanks, pipe racks and crate stacks on hard sand. Open ground between the tanks; do not stand next to the barrels.',
    rows: [
      'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
      'H....B.B.B.....oo.....B.B.B....H',
      'H..............oo..............H',
      'H.oo...ee...bbbbbbbb...ee...oo.H',
      'H.oo........................oo.H',
      'H.......cc.....ee.....cc.......H',
      'H..bbb...................bbb...H',
      'H..bbb...oo.........oo...bbb...H',
      'H........oo...cc....oo.........H',
      'H.c..........................c.H',
      'H.c....bb..ooo....ooo..bb....c.H',
      'H..........ooo....ooo..........H',
      'H...e.......................e..H',
      'H......cc....bb..bb....cc......H',
      'H.bb........................bb.H',
      'H.bb...o......cccc......o...bb.H',
    ],
    dom: [[16, 6], [16, 15.5], [16, 25]], sites: [[14, 9], [24, 11.5]],
    land: [['the north tanks', 16, 3], ['the south tanks', 16, 28], ['the west tanks', 12, 10.5], ['the east tanks', 19, 10.5], ['the pipe yard', 16, 15.5], ['the west crates', 4, 6.5], ['the east crates', 27, 6.5], ['the south west tanks', 12, 20.5], ['the south east tanks', 19, 20.5]],
    look: { sky: ['#465a8c', '#d98a5a', '#ffbf6a'], sun: '#ffac5c', sunEl: 0.1, sunAz: -1.4, sunI: 3.4, hemi: ['#d9c2a0', '#a67a4a', 1.15], fog: '#cf9a6c', fogD: 0.013, exposure: 1.04, snow: 0, rain: 0, night: 0, env: 0.6, dust: 1, grade: 'natural' },
  },
};
export const MP_MAPS = ['ridge', 'docks', 'town', 'refinery'];

// The convoy road and the firing range are built in code (see sim.js), with their own looks.
export const ROAD_LOOK = { sky: ['#5c6a7a', '#a9b2b8', '#c8c6c0'], sun: '#e8e2d6', sunEl: 0.45, sunAz: 0.4, sunI: 1.6, hemi: ['#b6c0c8', '#6a645a', 1.3], fog: '#a6aeb4', fogD: 0.012, exposure: 1.1, snow: 0, rain: 0, night: 0, env: 0.7, grade: 'natural' };
export const RANGE_LOOK = { sky: ['#5a86c4', '#cfe0ea', '#f0e6d2'], sun: '#fff0d8', sunEl: 0.5, sunAz: 0.9, sunI: 2.6, hemi: ['#c8d8ea', '#8a7a62', 1.2], fog: '#d6dce0', fogD: 0.006, exposure: 1.05, snow: 0, rain: 0, night: 0, env: 0.8, grade: 'natural' };

/* ------------------------------------------------------------ multiplayer modes */
export const MP_MODES = {
  tdm: { id: 'tdm', name: 'Team Deathmatch', short: 'TDM', size: 6, target: 30, limit: 420, respawn: 3.5,
    rules: 'Six on six. Every rival you knock down scores one for your side; downed soldiers rejoin at their spawn a few seconds later. First side to 30 wins, or the side ahead when the clock runs out.' },
  dom: { id: 'dom', name: 'Domination', short: 'DOM', size: 6, target: 150, limit: 480, respawn: 4,
    rules: 'Three flags, A, B and C. Stand in a flag zone with no rival inside to turn it your colour. Each flag you hold scores a point every two seconds. First side to 150 wins.' },
  dem: { id: 'dem', name: 'Demolition', short: 'DEM', size: 5, target: 4, limit: 100, respawn: 0,
    rules: 'Five on five, one life a round. The attackers carry a breach charge to site A or B and hold Use to plant it; it blows after 35 seconds unless a defender holds Use on it to disarm it. Knock out the whole other side to win the round too. First side to four rounds wins; sides swap after three.' },
  ffa: { id: 'ffa', name: 'Free for All', short: 'FFA', size: 8, target: 20, limit: 420, respawn: 3,
    rules: 'Eight soldiers, every one for themselves. First to 20 knockdowns wins. The top three finish on the podium.' },
};

/* ------------------------------------------------------------ the campaign */
// Coordinates are grid cells (x, z). Objectives: goto (reach a point), ko (knock out n),
// plant (hold Use at a point), hold (stay in a zone for a time), defend (do not lose a zone),
// ride (the convoy), board (get on the helicopter).
export const MISSIONS = [
  {
    id: 'light', name: 'First Light', kind: 'Assault', map: 'ridge', when: 'Korrin Ridge, 05:40',
    brief: 'The Grey Banner have put a signal jammer on the Korrin relay mast and every radio in the valley is deaf. Halberd goes up the ridge at first light: take the trench, clear the mast position, plant a charge on the jammer and storm the north bunker.',
    intro: ['MISSION 1 : FIRST LIGHT', 'Korrin Ridge, 05:40, light snow', 'Task Force Halberd'],
    spawn: [16, 25.5], yaw: 0, allies: ['Okoro', 'Pell', 'Ivo'],
    enemies: [{ at: [16, 18], n: 3, role: 'guard' }, { at: [8, 17], n: 2, role: 'guard' }, { at: [24, 17], n: 2, role: 'guard' }, { at: [16, 11], n: 4, role: 'guard' }, { at: [15.5, 3], n: 3, role: 'guard' }],
    objs: [
      { t: 'goto', text: 'Take the south trench', at: [16, 22.5], r: 3, call: 'Okoro: Trench is ours. Mast position next, they are dug in.' },
      { t: 'ko', text: 'Clear the mast position', n: 6, waves: { alive: [2, 3, 4], every: 7, from: 'north' }, call: 'Pell: Mast is clear! Get that charge on the jammer.' },
      { t: 'plant', text: 'Plant a charge on the jammer', at: [16, 14.2], time: 3, blow: [16, 13], call: 'Ivo: Jammer is down! Radios are coming back. Bunker, now!' },
      { t: 'goto', text: 'Storm the north bunker', at: [15.5, 2.6], r: 1.6, waves: { alive: [2, 3, 4], every: 6, from: 'north' }, call: 'Okoro: Bunker secure. Hearth, Korrin relay is ours.' },
    ],
  },
  {
    id: 'hold', name: 'Hold Varrow', kind: 'Defend', map: 'town', when: 'Varrow Old Town, 18:55',
    brief: 'A relief column is two minutes out of Varrow and the Grey Banner want the town square before it arrives. Hold the fountain square with your squad. Use the supply crate by the fountain and do not let them take the square.',
    intro: ['MISSION 2 : HOLD VARROW', 'Varrow Old Town, 18:55, golden hour', 'Hold until the column arrives'],
    spawn: [16, 17.5], yaw: 0, allies: ['Okoro', 'Pell', 'Tamsin', 'Marsh'], crate: [17.5, 16.5],
    enemies: [{ at: [8, 4], n: 2, role: 'hunt' }, { at: [24, 4], n: 2, role: 'hunt' }],
    objs: [
      { t: 'defend', text: 'Hold the fountain square', at: [16, 15.5], r: 4.5, time: 140, waves: { alive: [4, 5, 7], every: 5, from: 'edges' }, call: 'Hearth: Column is in the town. Good work, Halberd. Varrow holds.' },
    ],
  },
  {
    id: 'water', name: 'Quiet Water', kind: 'Stealth', map: 'docks', when: 'Saltmere Docks, 02:10', stealth: true,
    brief: 'Night and rain at Saltmere. Two containers on this quay carry parts for the jammers. Get in quietly, put a tracker on each one and slip away on the boat at the north quay. Stay low and out of the floodlights; knock out a sentry from behind with Use. If they raise the alarm, fight your way out.',
    intro: ['MISSION 3 : QUIET WATER', 'Saltmere Docks, 02:10, rain', 'Suppressed weapons, stay in the dark'],
    spawn: [2.5, 29.5], yaw: 0, allies: [], loadout: { primary: 'vr7', optic: 'pip', mod: 'quiet', secondary: 'p11', tactical: 'smoke' },
    enemies: [
      { at: [8, 24], n: 1, role: 'patrol', path: [[8, 24], [8, 18], [13, 18], [13, 24]] },
      { at: [22, 26], n: 1, role: 'patrol', path: [[22, 26], [22, 20], [28, 20], [28, 26]] },
      { at: [16, 15.5], n: 1, role: 'patrol', path: [[10, 15.5], [22, 15.5]] },
      { at: [6, 9], n: 1, role: 'patrol', path: [[2, 9], [10, 9], [10, 12], [2, 12]] },
      { at: [25, 9], n: 1, role: 'patrol', path: [[22, 9], [29, 9], [29, 12], [22, 12]] },
      { at: [15, 11.5], n: 1, role: 'post' }, { at: [16, 4], n: 2, role: 'post' }, { at: [10, 3], n: 1, role: 'patrol', path: [[6, 3], [11, 3], [11, 5], [6, 5]] },
    ],
    objs: [
      { t: 'plant', text: 'Put a tracker on the west container', at: [7.1, 7], time: 2, quiet: true, call: 'Hearth: First tracker is live. One more.' },
      { t: 'plant', text: 'Put a tracker on the east container', at: [25.1, 6.4], time: 2, quiet: true, call: 'Hearth: Both trackers live. Get to the boat.' },
      { t: 'goto', text: 'Reach the boat at the north quay', at: [16.5, 1.4], r: 1.4, call: 'Hearth: We have you. Lights off, we are moving.' },
    ],
  },
  {
    id: 'road', name: 'Iron Road', kind: 'Convoy', map: 'road', when: 'Varrow Road, 11:20',
    brief: 'The jammer parts are moving out by road and Halberd is riding the convoy that will stop them. You are on the mounted gun of the lead truck. Keep the road clear, knock out the roadblocks and get the convoy across the Varrow bridge.',
    intro: ['MISSION 4 : IRON ROAD', 'Varrow Road, 11:20, overcast', 'Lead truck, mounted gun'],
    spawn: [8, 96], yaw: 0, allies: [], vehicle: true,
    objs: [
      { t: 'ride', text: 'Keep the convoy rolling', to: 4, call: 'Hearth: Convoy is across the bridge. That was hard driving, Halberd.' },
    ],
  },
  {
    id: 'smoke', name: 'Black Smoke', kind: 'Sabotage', map: 'refinery', when: 'Drayfield Refinery, 19:30',
    brief: 'The Drayfield refinery fuels every Grey Banner vehicle on the plain. Plant charges on the three fuel tanks marked on your map, then get clear of the yard before they go up. Watch the barrels: they blow.',
    intro: ['MISSION 5 : BLACK SMOKE', 'Drayfield Refinery, 19:30, sunset', 'Three charges, then run'],
    spawn: [16, 30], yaw: 0, allies: ['Okoro', 'Ivo', 'Rook'],
    enemies: [{ at: [10, 20], n: 2, role: 'guard' }, { at: [22, 20], n: 2, role: 'guard' }, { at: [14, 10], n: 3, role: 'guard' }, { at: [19, 10], n: 3, role: 'guard' }, { at: [16, 2.5], n: 3, role: 'guard' }],
    objs: [
      { t: 'plant', text: 'Charge the west tank', at: [14.2, 10.5], time: 3, waves: { alive: [2, 3, 4], every: 7, from: 'north' }, call: 'Okoro: West tank is set. East tank next.' },
      { t: 'plant', text: 'Charge the east tank', at: [17.8, 10.5], time: 3, waves: { alive: [2, 3, 4], every: 7, from: 'north' }, call: 'Ivo: East is set. One more at the north tanks.' },
      { t: 'plant', text: 'Charge the north tank', at: [14.2, 1.5], time: 3, waves: { alive: [3, 4, 5], every: 6, from: 'north' }, call: 'Rook: All three set! Get out of the yard, it is going up!' },
      { t: 'goto', text: 'Get clear: south gate', at: [16, 30], r: 2, timer: 45, blowAll: true, call: 'Hearth: Drayfield is burning. Every road out of the plain just got longer for them.' },
    ],
  },
  {
    id: 'ridge', name: 'Last Ridge', kind: 'Extraction', map: 'ridge', when: 'Korrin Ridge, 22:10',
    brief: 'The Grey Banner want Korrin back and they are coming up the ridge in force, in a snowstorm, at night. Break out of the north bunker, fight down to the landing zone on the south slope and hold it until the Kestrel transport lands. Then get everyone on board. Nobody stays on the ridge.',
    intro: ['MISSION 6 : LAST RIDGE', 'Korrin Ridge, 22:10, snowstorm', 'Extraction'],
    spawn: [15.5, 2.6], yaw: Math.PI, allies: ['Okoro', 'Pell', 'Ivo'], look: { sky: ['#141c2c', '#2e3a4e', '#56627a'], sun: '#b8c8e4', sunEl: 0.5, sunAz: 0.4, sunI: 1.1, hemi: ['#8a9ab8', '#30343c', 1.6], fog: '#3a4454', fogD: 0.026, exposure: 1.45, snow: 1.6, rain: 0, night: 1, env: 0.45, grade: 'night' },
    enemies: [{ at: [16, 9], n: 3, role: 'guard' }, { at: [8, 14], n: 2, role: 'guard' }, { at: [24, 14], n: 2, role: 'guard' }, { at: [16, 19], n: 3, role: 'guard' }],
    objs: [
      { t: 'goto', text: 'Break out of the bunker', at: [16, 9], r: 3, call: 'Okoro: Out of the bunker. Down the ridge, stay together.' },
      { t: 'goto', text: 'Fight down to the landing zone', at: [16, 22.5], r: 3, waves: { alive: [2, 3, 4], every: 7, from: 'flanks' }, call: 'Hearth: Kestrel is two minutes out. Hold that landing zone.' },
      { t: 'hold', text: 'Hold the landing zone', at: [16, 22.5], r: 4.5, time: 75, waves: { alive: [4, 5, 7], every: 4.5, from: 'all' }, heli: true, call: 'Pell: Kestrel is on the ground! Everyone on!' },
      { t: 'board', text: 'Get on the Kestrel', at: [16, 26.2], r: 1.8, call: 'Hearth: Halberd is wheels up. Welcome home.' },
    ],
  },
];

/* ------------------------------------------------------------ difficulty */
export const DIFF = {
  easy: { name: 'Easy', react: [0.3, 0.55], aim: 5.0, track: 2.6, dmgIn: 0.6, flank: 0.12, cover: 0.5, nade: 0.25, regen: 1.4, notice: 0.6, idx: 0 },
  normal: { name: 'Normal', react: [0.2, 0.4], aim: 2.7, track: 4.2, dmgIn: 0.85, flank: 0.3, cover: 0.72, nade: 0.55, regen: 1, notice: 1, idx: 1 },
  hard: { name: 'Hard', react: [0.15, 0.3], aim: 1.5, track: 6.4, dmgIn: 1, flank: 0.5, cover: 0.9, nade: 0.9, regen: 0.85, notice: 1.4, idx: 2 },
};

/* ------------------------------------------------------------ what people say */
export const LINES = {
  spot: ['{n}: Contact, {p}!', '{n}: Movement at {p}.', '{n}: One on {p}, watch it.', '{n}: Hostile, {p}!', '{n}: Eyes on {p}, I see them.'],
  reload: ['{n}: Reloading!', '{n}: Changing mags, cover me!', '{n}: I am dry, swapping!'],
  nade: ['{n}: Frag out!', '{n}: Grenade, going in!', '{n}: Throwing!'],
  nadeIn: ['{n}: Grenade! Move!', '{n}: Frag at our feet, scatter!', '{n}: Grenade, get clear!'],
  smoke: ['{n}: Smoke out, crossing!', '{n}: Popping smoke!'],
  flash: ['{n}: Flash out!', '{n}: Eyes shut, flash!'],
  flank: ['{n}: I will flank {p}.', '{n}: Going round {p}, keep them busy.', '{n}: Moving to flank.'],
  suppress: ['{n}: Suppressing!', '{n}: Keep their heads down!', '{n}: Laying down fire!'],
  cover: ['{n}: Taking cover!', '{n}: Pinned, moving to cover!', '{n}: Getting behind something!'],
  down: ['{n}: I am down! I am out!', '{n}: They got me, I am out of it.', '{n}: Down, down!'],
  up: ['{n}: Back on my feet.', '{n}: I am up, I am good.', '{n}: Shook it off, back in.'],
  got: ['{n}: Got one!', '{n}: Tango down!', '{n}: One less!', '{n}: Dropped him!'],
  nice: ['{n}: Nice shot, Lead!', '{n}: Good hit!', '{n}: That is how it is done.', '{n}: Clean work.'],
  hurt: ['{n}: I am hit, still in it!', '{n}: Taking fire!', '{n}: That was close!'],
  follow: ['{n}: On you, Lead.', '{n}: Right behind you.', '{n}: Moving with you.'],
  rally: ['{n}: Push, push!', '{n}: Move up, we have them!', '{n}: Go go go!'],
  fallback: ['{n}: Fall back!', '{n}: Too many of them, pull back!', '{n}: Back to cover!'],
  enemySpot: ['{n}: There, {p}!', '{n}: Halberd at {p}!', '{n}: I see one!'],
  enemyHear: ['{n}: Did you hear that?', '{n}: Something moved.', '{n}: Who is there?', '{n}: Check that corner.'],
  enemyBody: ['{n}: Man down! Someone is here!', '{n}: Found one of ours! Wake up!'],
  enemyAlarm: ['{n}: Alarm! Intruders on the quay!', '{n}: Contact! Raise the alarm!'],
  enemyCalm: ['{n}: Probably the rain.', '{n}: Nothing. Back to it.', '{n}: Just the wind.'],
  droneOurs: ['Hearth: Recon drone is up, enemies on your radar.'],
  droneTheirs: ['Hearth: Enemy recon drone overhead! They can see you on radar.'],
  supply: ['Hearth: Supply drop inbound, look for the smoke.'],
  mortarOurs: ['Hearth: Mortar strike confirmed. Shells away.'],
  mortarTheirs: ['Hearth: Incoming mortar fire! Get under cover!'],
  capturing: ['{n}: Taking {f}!', '{n}: Capturing {f}, cover me.'],
  captured: ['Hearth: We have {f}.', 'Hearth: {f} secured.'],
  lost: ['Hearth: We lost {f}!', 'Hearth: They took {f}.'],
  planted: ['Hearth: Charge is planted. Defend it.', 'Hearth: The charge is set!'],
  theyPlanted: ['Hearth: They planted the charge! Get to the site and disarm it!'],
  defused: ['Hearth: Charge disarmed.'],
  last: ['Hearth: You are the last one standing. Make it count.'],
  start: ['Hearth: Halberd, you are clear to move.', 'Hearth: Weapons free, Halberd.', 'Hearth: Good hunting.'],
};

export const MEDALS = {
  double: 'Double Down', triple: 'Triple Down', fury: 'Fury', streak5: 'Five Straight', streak10: 'Unstoppable', precision: 'Precision', long: 'Long Shot',
  revenge: 'Payback', first: 'First Down', grenade: 'Grenadier', saviour: 'Saviour', last: 'Last Stand', silent: 'Silent', capture: 'Flag Runner', plant: 'Breacher', defuse: 'Cool Head', comeback: 'Comeback',
};
