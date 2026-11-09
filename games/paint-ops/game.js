/*
 * Paint Ops, the 2D version for browsers without WebGL2.
 *
 * The same squads, maps, markers, modes and missions as the 3D game, seen from
 * above: a paintball team shooter on the same 24 by 24 grid. A splat drains
 * the shield, a full splat tags the player out and they respawn. Nobody is
 * hurt, the paint washes off.
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + pad2(s % 60); };
  function hash(i) { let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }

  const CS = 2;            // metres per grid cell
  const GN = 24;           // cells per side
  const HALFW = GN * CS / 2;
  const EYE = 1.62, EYE_C = 1.08;
  const BODY_H = 1.78, BODY_HC = 1.24, RAD = 0.36;
  const CRATE_H = 1.1, TALL_H = 1.75;
  
  const HALF_MAPS = {
    mill: [
      '########################',
      '#.B..B..#......#..B..B.#',
      '#.......#..cc..#.......#',
      '#...cc..b......b..cc...#',
      '#..........G...........#',
      '#.bbbb...cc..cc...bbbb.#',
      '#.........o..o.........#',
      '###..c.###....###.c..###',
      '#....c.....bb.....c....#',
      '#..bbb..o......o..bbb..#',
      '#........cc..cc........#',
      '#..c.......bb.......c..#'
    ],
    roof: [
      'xxxxxxxxxxxxxxxxxxxxxxxx',
      'x.B..B.xx..B..B.xx.B..Bx',
      'x......xx.......xx.....x',
      'x..c...xx..o.o..xx..c..x',
      'x.bb...xx...G...xx..bb.x',
      'x..........cc..........x',
      'x..o...xx.......xx..o..x',
      'x......xxbb...bbxx.....x',
      'x.cc...xx.......xx..cc.x',
      'x......xx..c.c..xx.....x',
      'x..##.........c....##..x',
      'x..##..xx..o.o..xx.##..x'
    ],
    fort: [
      '########################',
      '#..B..B#........#B..B..#',
      '#......#..o..o..#......#',
      '#..cc......G.......cc..#',
      '#......b........b......#',
      '##.##.....cccc.....##.##',
      '#..........oo..........#',
      '#..b..c..........c..b..#',
      '#....###...cc...###....#',
      '#..c..#..........#..c..#',
      '#.....#..b....b..#.....#',
      '#..o.......cc.......o..#'
    ]
  };
  
  const MAPS = {
    mill: {
      id: 'mill', name: 'Old Loom Mill', when: 'Dusk', wallH: 4.6,
      blurb: 'An abandoned textile mill at dusk. Rows of silent looms, cotton bales and low orange light through the arched windows.',
      landmarks: [['north looms', 0, -12], ['south looms', 0, 12], ['the dye vats', 0, 0], ['west bales', -14, 0], ['east bales', 14, 0], ['the north office', 0, -20], ['the south office', 0, 20], ['the west hall', -16, -14], ['the east hall', 16, -14], ['the west yard', -16, 14], ['the east yard', 16, 14]],
      look: {
        skyTop: '#2a2b55', skyMid: '#8b4f6e', skyHor: '#ff9450', sun: '#ffa260', sunI: 3.1, sunEl: 0.13, sunAz: -1.25,
        fog: '#6b4a4a', fogD: 0.014, hemiSky: '#c4b0d8', hemiGnd: '#6a4a36', hemiI: 1.7, exposure: 1.2, cloud: 0.55,
        grade: [1.06, 0.98, 0.9], lift: [0.012, 0.004, 0.018], sat: 1.08, env: 0.6, rain: 0, dust: 1, bloom: 0.9
      }
    },
    roof: {
      id: 'roof', name: 'Monsoon Rooftops', when: 'Monsoon rain', wallH: 3.2,
      blurb: 'Three city rooftops linked by plank bridges in heavy monsoon rain. Water tanks, neon signs and slick concrete.',
      landmarks: [['the north tanks', 0, -16], ['the south tanks', 0, 16], ['the center roof', 0, 0], ['the west roof', -16, 0], ['the east roof', 16, 0], ['the west stairs', -15, -4], ['the east stairs', 15, -4], ['the north bridge', -6, -14], ['the south bridge', 6, 14]],
      look: {
        skyTop: '#1d2633', skyMid: '#3f4c5c', skyHor: '#6d7a86', sun: '#b9c7dc', sunI: 1.1, sunEl: 0.55, sunAz: 0.6,
        fog: '#4a5663', fogD: 0.02, hemiSky: '#a9bbd0', hemiGnd: '#3a4046', hemiI: 1.6, exposure: 1.2, cloud: 0.95,
        grade: [0.94, 1.0, 1.08], lift: [0.0, 0.01, 0.025], sat: 0.92, env: 0.9, rain: 1, dust: 0, bloom: 1.25
      }
    },
    fort: {
      id: 'fort', name: 'Sunset Bastion', when: 'Desert sunset', wallH: 5.2,
      blurb: 'A sandstone desert fort at sunset. Arched galleries, a pillared courtyard, banners and long golden shadows.',
      landmarks: [['the north gate', 0, -18], ['the south gate', 0, 18], ['the pavilion', 0, 0], ['the west gallery', -14, -8], ['the east gallery', 14, -8], ['the west court', -14, 8], ['the east court', 14, 8], ['the north towers', 0, -12], ['the south towers', 0, 12]],
      look: {
        skyTop: '#3b4f8c', skyMid: '#d98a6a', skyHor: '#ffc06a', sun: '#ffb468', sunI: 3.6, sunEl: 0.1, sunAz: 1.9,
        fog: '#c99b7a', fogD: 0.009, hemiSky: '#b9c4e2', hemiGnd: '#9a6a44', hemiI: 1.25, exposure: 1.05, cloud: 0.3,
        grade: [1.08, 1.0, 0.88], lift: [0.015, 0.008, 0.0], sat: 1.1, env: 0.7, rain: 0, dust: 1, bloom: 0.85
      }
    }
  };
  const MAP_ORDER = ['mill', 'roof', 'fort'];
  
  // Cell kinds: '.' floor, '#' wall, 'c' low cover you can climb, 'b' tall cover,
  // 'o' pillar / tank, 'x' railed gap (blocks feet, not paint above the rail).
  function buildGrid(id) {
    const top = HALF_MAPS[id];
    const rows = top.concat(top.slice().reverse().map((r) => r.replace(/B/g, 'A').replace(/G/g, 'F')));
    const n = GN * GN;
    const kind = new Array(n), h = new Float32Array(n), block = new Uint8Array(n);
    const spawns = [[], []], flags = [null, null];
    for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
      let c = (rows[z] || '')[x] || '#';
      const i = z * GN + x;
      if (c === 'A') { spawns[0].push([x, z]); c = '.'; }
      if (c === 'B') { spawns[1].push([x, z]); c = '.'; }
      if (c === 'F') { flags[0] = [x, z]; c = '.'; }
      if (c === 'G') { flags[1] = [x, z]; c = '.'; }
      kind[i] = c;
      if (c === '#') { h[i] = 99; block[i] = 1; }
      else if (c === 'b') { h[i] = TALL_H; block[i] = 1; }
      else if (c === 'o') { h[i] = 99; block[i] = 1; }
      else if (c === 'c') { h[i] = CRATE_H; block[i] = 0; }
      else if (c === 'x') { h[i] = 1.02; block[i] = 2; }
      else { h[i] = 0; block[i] = 0; }
    }
    const G = { id, rows, kind, h, block, spawns, flags };
    // bridge cells: floor inside a gap column (the rooftops)
    G.bridge = new Uint8Array(n);
    if (id === 'roof') for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
      const i = z * GN + x;
      if (kind[i] !== '.' && kind[i] !== 'c') continue;
      if ((x === 7 || x === 8 || x === 15 || x === 16)) G.bridge[i] = 1;
    }
    return G;
  }
  const toCell = (v) => Math.floor(v / CS + GN / 2);
  
  /* ------------------------------------------------------------ teams, people, markers */
  const TEAMS = [
    { id: 0, name: 'Marigold Squad', short: 'MARIGOLD', paint: '#ff7a1a', vest: '#e86a1f', trim: '#3a2416', ui: '#ffae4a', pants: '#3b3a36' },
    { id: 1, name: 'Indigo Rush', short: 'INDIGO', paint: '#3f6dff', vest: '#3446c8', trim: '#151a3a', ui: '#8aa6ff', pants: '#2b2f3c' }
  ];
  const SQUAD = ['Meera', 'Kabir', 'Zoya', 'Dev'];
  const RIVALS = ['Rohan', 'Naina', 'Ishaan', 'Anaya', 'Vikram', 'Tara', 'Neel', 'Ira', 'Samar', 'Pia'];
  const SKIN = ['#c98d67', '#8d5a3d', '#e0ac85', '#a86e4c', '#6e4630', '#d79a74'];
  
  const GUNS = [
    { id: 'rapid', name: 'Hummingbird', kind: 'Rapid', mode: 'auto', rate: 11, dmg: 17, spread: 1.7, ads: 0.75, speed: 72, drop: 4.5, mag: 40, reload: 1.6, kick: 0.55, zoom: 1.3, range: 32, body: '#2bb3a3', acc: '#ffd23f', tank: '#e8eef2' },
    { id: 'burst', name: 'Tri-Splat', kind: 'Burst', mode: 'burst', rate: 2.8, burst: 3, gap: 0.07, dmg: 25, spread: 1.15, ads: 0.35, speed: 86, drop: 3.6, mag: 30, reload: 1.85, kick: 0.85, zoom: 1.55, range: 44, body: '#e8452c', acc: '#2d2f3a', tank: '#f5d547' },
    { id: 'long', name: 'Longshot', kind: 'Long-range', mode: 'single', rate: 1.05, dmg: 100, spread: 2.6, ads: 0.04, speed: 150, drop: 1.4, mag: 6, reload: 2.3, kick: 2.6, zoom: 3.4, range: 90, body: '#7b3fe4', acc: '#f2f2f2', tank: '#36d17a' }
  ];
  
  const DIFF = {
    easy: { name: 'Easy', react: 0.8, aim: 5.2, track: 2.2, dmgIn: 0.7, lead: 0.35, flank: 0.15, cover: 0.45, burst: 0.55, regen: 1.4 },
    normal: { name: 'Normal', react: 0.45, aim: 2.6, track: 4.2, dmgIn: 0.9, lead: 0.7, flank: 0.35, cover: 0.7, burst: 0.8, regen: 1.0 },
    hard: { name: 'Hard', react: 0.26, aim: 1.4, track: 7, dmgIn: 1.0, lead: 0.95, flank: 0.55, cover: 0.9, burst: 1.0, regen: 0.85 }
  };
  
  /* ------------------------------------------------------------ campaign */
  const MISSIONS = [
    {
      id: 'loom', name: 'Loom Light', map: 'mill', tickets: 14,
      brief: 'The Indigo Rush hold the old loom mill. Push up the weaving floor, clear the north looms and carry the golden spool home before the light goes.',
      intro: ['MISSION 1 : LOOM LIGHT', 'Old Loom Mill, dusk', 'Squad: Meera, Kabir, Zoya'],
      objs: [
        { t: 'goto', text: 'Push up to the dye vats', at: [11.5, 11.5], r: 3.2, call: 'Meera: Vats are ours. Eyes up, they are dug in on the looms.' },
        { t: 'tag', text: 'Clear the north looms', n: 6, call: 'Kabir: Floor is clear! The spool is on the north platform.' },
        { t: 'carry', text: 'Grab the golden spool', from: [11, 4], to: [11, 19], label: 'Spool', call: 'Zoya: Got eyes on the extraction. Bring it home!' }
      ],
      waves: { alive: [3, 4, 5], spawnEvery: 5 }
    },
    {
      id: 'monsoon', name: 'Monsoon Run', map: 'roof', tickets: 14,
      brief: 'Heavy rain over the old quarter. Cross the plank bridges, plant a paint beacon on the tank roof, hold it while the Indigo Rush counter, then get to the east stairs.',
      intro: ['MISSION 2 : MONSOON RUN', 'Monsoon Rooftops, heavy rain', 'Watch your footing on the planks'],
      objs: [
        { t: 'goto', text: 'Cross to the center roof', at: [11.5, 13.5], r: 3.2, call: 'Meera: Center roof, check. Beacon goes up by the tanks.' },
        { t: 'hold', text: 'Hold the beacon by the tanks', at: [12, 6], r: 3.4, time: 24, call: 'Kabir: Beacon is lit! Pull out, east stairs!' },
        { t: 'goto', text: 'Reach the east stairs', at: [20.5, 21], r: 2.6, call: 'Zoya: Everyone across. Great run in the rain.' }
      ],
      waves: { alive: [3, 4, 5], spawnEvery: 4.5 }
    },
    {
      id: 'bastion', name: 'Sunset Bastion', map: 'fort', tickets: 16,
      brief: 'The final round at the desert fort. Raise both banners on the galleries, then tag Captain Toofan in the courtyard before the sun sets.',
      intro: ['MISSION 3 : SUNSET BASTION', 'Desert fort, sunset', 'Finale against Captain Toofan'],
      objs: [
        { t: 'hold', text: 'Raise the west banner', at: [3, 9.5], r: 2.6, time: 8, call: 'Meera: West banner flying! East side next.' },
        { t: 'hold', text: 'Raise the east banner', at: [20.5, 9.5], r: 2.6, time: 8, call: 'Kabir: Both banners up. The captain is in the courtyard!' },
        { t: 'boss', text: 'Tag Captain Toofan', at: [11.5, 4], call: 'Zoya: Captain Toofan is splatted! The bastion is ours!' }
      ],
      waves: { alive: [3, 4, 5], spawnEvery: 5 }
    }
  ];
  
  const CALLS = {
    spot: ['{n}: Rival at {p}!', '{n}: Contact, {p}!', '{n}: Got movement at {p}.', '{n}: One on {p}, watch it.'],
    reload: ['{n}: Reloading, cover me!', '{n}: Hopper dry, swapping in!', '{n}: Refilling!'],
    down: ['{n}: I am splatted, back in a few!', '{n}: Got me! Heading out.', '{n}: Tagged, respawning.'],
    nice: ['{n}: Nice splat!', '{n}: Clean shot!', '{n}: That is how it is done!', '{n}: Great tag!'],
    follow: ['{n}: On you, lead the way.', '{n}: Right behind you.', '{n}: Moving with you.'],
    flagTaken: ['{n}: They have our flag! Stop the carrier!'],
    flagGot: ['{n}: You have the flag, run it home!', '{n}: Flag is ours, escort the carrier!'],
    streak: ['{n}: Radar is up!', '{n}: Drone in the air, nice!']
  };
  

  const cw = (c) => (c - GN / 2) * CS;
  const inGrid = (x, z) => x >= 0 && z >= 0 && x < GN && z < GN;
  const blocks = (G, x, z) => !inGrid(x, z) || G.block[z * GN + x] !== 0 || G.kind[z * GN + x] === 'c';
  const stopsPaint = (G, x, z) => { if (!inGrid(x, z)) return G.id !== 'roof'; const k = G.kind[z * GN + x]; return k === '#' || k === 'b' || k === 'o'; };
  function clearLine(G, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.5));
    for (let k = 1; k < n; k++) { const t = k / n; if (stopsPaint(G, toCell(ax + dx * t), toCell(az + dz * t))) return false; }
    return true;
  }
  function collide(G, p, r) {
    for (let it = 0; it < 2; it++) {
      const x0 = toCell(p.x - r), x1 = toCell(p.x + r), z0 = toCell(p.z - r), z1 = toCell(p.z + r);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        if (!blocks(G, cx, cz)) continue;
        const bx0 = cw(cx), bz0 = cw(cz), nx = clamp(p.x, bx0, bx0 + CS), nz = clamp(p.z, bz0, bz0 + CS), dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d < 1e-6) { p.x += r; continue; }
        p.x = nx + dx / d * r; p.z = nz + dz / d * r;
      }
    }
  }
  // Breadth first distance field towards a goal cell: bots walk downhill.
  const fieldCache = {};
  function field(G, gx, gz) {
    const key = G.id + ':' + gx + ',' + gz; if (fieldCache[key]) return fieldCache[key];
    const d = new Int16Array(GN * GN).fill(-1), q = [];
    if (!inGrid(gx, gz)) return d;
    d[gz * GN + gx] = 0; q.push(gz * GN + gx);
    while (q.length) { const i = q.shift(), x = i % GN, z = (i / GN) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (!inGrid(nx, nz) || blocks(G, nx, nz)) continue; const j = nz * GN + nx; if (d[j] >= 0) continue; d[j] = d[i] + 1; q.push(j); } }
    fieldCache[key] = d; return d;
  }
  function stepToward(G, x, z, gx, gz) {
    const cx = toCell(x), cz = toCell(z), tx = clamp(toCell(gx), 0, GN - 1), tz = clamp(toCell(gz), 0, GN - 1);
    if (cx === tx && cz === tz) return [gx - x, gz - z];
    const f = field(G, tx, tz); let best = null, bd = 1e9;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = cx + dx, nz = cz + dz; if (!inGrid(nx, nz)) continue; const v = f[nz * GN + nx]; if (v < 0) continue;
      if (dx && dz && (blocks(G, cx + dx, cz) || blocks(G, cx, cz + dz))) continue;
      const s = v + (dx && dz ? 0.4 : 0); if (s < bd) { bd = s; best = [nx, nz]; }
    }
    if (!best) return [gx - x, gz - z];
    return [cw(best[0] + 0.5) - x, cw(best[1] + 0.5) - z];
  }

  let ARC = null, W = null, SAVE = { unlocked: 1, best: {} };
  try { const s = JSON.parse(localStorage.getItem('paint-ops.save') || 'null'); if (s) SAVE = Object.assign(SAVE, s); } catch (e) { /* fresh */ }
  const saveGame = () => { try { localStorage.setItem('paint-ops.save', JSON.stringify(SAVE)); } catch (e) { /* private */ } };

  function newChar(team, name, isPlayer, id, gun) {
    return { id, team, name, isPlayer, x: 0, z: 0, vx: 0, vz: 0, aim: 0, hp: 100, hpMax: 100, alive: true, outT: 0, respawnT: 0, gun, ammo: GUNS.map((g) => g.mag), reloadT: 0, fireT: 0, burst: 0, burstT: 0, tags: 0, outs: 0, caps: 0, streak: 0, carry: -1, boss: false, think: Math.random() * 0.3, goal: null, target: null, react: 0, strafe: 1, strafeT: 0, role: 'hunt', hit: 0 };
  }
  function spawnAt(c, first) {
    const sp = W.G.spawns[c.team];
    let s;
    if (W.mode === 'campaign' && c.team === 0 && W.campSpawn) { c.x = W.campSpawn[0] + (Math.random() - 0.5) * 2; c.z = W.campSpawn[1] + (Math.random() - 0.5) * 2; }
    else { s = sp[first ? c.id % sp.length : (Math.random() * sp.length) | 0]; c.x = cw(s[0] + 0.5) + (first && c.id >= sp.length ? 0.9 : 0); c.z = cw(s[1] + 0.5); }
    collide(W.G, c, 0.36);
    c.hp = c.hpMax; c.alive = true; c.ammo = GUNS.map((g) => g.mag); c.reloadT = 0; c.carry = -1; c.streak = 0; c.aim = c.team === 0 ? -Math.PI / 2 : Math.PI / 2; c.shield = first ? 0 : 1.5; c.goal = null;
  }
  function newWorld(cfg) {
    const mapId = cfg.mode === 'campaign' ? MISSIONS[cfg.mission].map : cfg.map;
    W = { cfg, mode: cfg.mode, mapId, M: MAPS[mapId], G: buildGrid(mapId), D: DIFF[cfg.diff] || DIFF.normal, chars: [], balls: [], splats: [], parts: [], score: [0, 0], t: 0, over: false, feed: [], flags: [], obj: null, tickets: 0, waveT: 2, attract: !!cfg.attract, stats: { shots: 0, hits: 0, tags: 0, outs: 0, caps: 0, objs: 0, bestStreak: 0 } };
    W.target = cfg.mode === 'ctf' ? 3 : 30; W.limit = cfg.mode === 'ctf' ? 480 : cfg.mode === 'splat' ? 420 : 0;
    const n = cfg.mode === 'campaign' ? 4 : 5;
    for (let i = 0; i < n; i++) W.chars.push(newChar(0, i === 0 && !cfg.attract ? 'You' : i === 0 ? 'Arjun' : SQUAD[i - 1], i === 0 && !cfg.attract, W.chars.length, i === 0 ? (cfg.gun | 0) : i % 3));
    if (cfg.mode !== 'campaign') for (let i = 0; i < 5; i++) W.chars.push(newChar(1, RIVALS[i], false, W.chars.length, i % 3));
    W.P = W.chars[0];
    W.chars.forEach((c, i) => { spawnAt(c, true); c.role = W.mode === 'ctf' ? (i % 3 === 1 ? 'defend' : 'attack') : (c.team === 0 && W.mode === 'campaign' ? 'follow' : c.team === 0 && (i === 1 || i === 2) && !W.attract ? 'follow' : 'hunt'); });
    if (W.mode === 'ctf') W.flags = [0, 1].map((t) => { const f = W.G.flags[t], x = cw(f[0] + 0.5), z = cw(f[1] + 0.5); return { team: t, state: 'home', x, z, hx: x, hz: z, carrier: null, dropT: 0 }; });
    if (W.mode === 'campaign') { W.mission = MISSIONS[cfg.mission]; W.tickets = W.mission.tickets + (cfg.diff === 'easy' ? 6 : cfg.diff === 'hard' ? -4 : 0); startObj(0); }
    W.paint = document.createElement('canvas'); W.paint.width = W.paint.height = 768; W.pg = W.paint.getContext('2d');
    return W;
  }
  const at = (o) => [cw(o.at[0]), cw(o.at[1])];
  function startObj(i) {
    const Ms = W.mission;
    if (i >= Ms.objs.length) { finish(0, 'mission'); return; }
    const o = Ms.objs[i];
    W.obj = { i, def: o, prog: 0, count: 0, carried: false, ix: o.from ? cw(o.from[0] + 0.5) : 0, iz: o.from ? cw(o.from[1] + 0.5) : 0, boss: null };
    if (i > 0 && Ms.objs[i - 1].at) { const p = at(Ms.objs[i - 1]); W.campSpawn = [p[0], p[1] + 3]; }
    if (o.t === 'boss') { const b = newChar(1, 'Captain Toofan', false, W.chars.length, 1); b.boss = true; b.hpMax = 280; b.role = 'guard'; W.chars.push(b); spawnAt(b, false); const p = at(o); b.x = p[0]; b.z = p[1]; b.home = p; W.obj.boss = b; }
    if (i > 0 && ARC) ARC.toast(o.text, 'New objective', 2000);
  }
  function objText() { const o = W.obj.def; if (o.t === 'tag') return o.text + ' (' + W.obj.count + '/' + o.n + ')'; if (o.t === 'hold') return o.text + ' (' + Math.round(W.obj.prog / o.time * 100) + '%)'; if (o.t === 'carry') return W.obj.carried ? 'Carry the spool to the extraction' : o.text; return o.text; }
  function objPoint() { const o = W.obj.def; if (o.t === 'carry') return W.obj.carried ? [cw(o.to[0] + 0.5), cw(o.to[1] + 0.5)] : [W.obj.ix, W.obj.iz]; if (o.t === 'boss') return W.obj.boss && W.obj.boss.alive ? [W.obj.boss.x, W.obj.boss.z] : null; if (o.t === 'tag') return null; return at(o); }
  function stepObj(dt) {
    const ob = W.obj, o = ob.def, P = W.P;
    const done = () => { W.stats.objs++; if (o.call) push(o.call, '#ffae4a'); startObj(ob.i + 1); };
    if (o.t === 'goto') { const p = at(o); if (P.alive && Math.hypot(P.x - p[0], P.z - p[1]) < o.r * CS * 0.6) done(); }
    else if (o.t === 'tag') { if (ob.count >= o.n) done(); }
    else if (o.t === 'hold') { const p = at(o), R = o.r * CS * 0.6; let mine = 0, foe = 0; W.chars.forEach((c) => { if (c.alive && Math.hypot(c.x - p[0], c.z - p[1]) < R) { if (c.team === 0) mine++; else foe++; } }); ob.contested = mine && foe; if (mine && !foe) ob.prog += dt; if (ob.prog >= o.time) done(); }
    else if (o.t === 'carry') {
      if (!ob.carried) { if (P.alive && Math.hypot(P.x - ob.ix, P.z - ob.iz) < 1.4) { ob.carried = true; P.carry = 2; } }
      else { if (!P.alive) { ob.carried = false; ob.ix = P.x; ob.iz = P.z; } const tx = cw(o.to[0] + 0.5), tz = cw(o.to[1] + 0.5); if (P.alive && Math.hypot(P.x - tx, P.z - tz) < 2.2) { P.carry = -1; ob.carried = false; done(); } }
    } else if (o.t === 'boss') { if (ob.boss && !ob.boss.alive) done(); }
    W.waveT -= dt;
    const alive = W.chars.filter((c) => c.team === 1 && c.alive && !c.boss).length, want = W.mission.waves.alive[W.cfg.diff === 'easy' ? 0 : W.cfg.diff === 'hard' ? 2 : 1];
    if (W.waveT <= 0 && alive < want) {
      W.waveT = W.mission.waves.spawnEvery;
      let c = W.chars.find((x) => x.team === 1 && !x.alive && !x.boss && x.outT > 2);
      if (!c && W.chars.length < 14) { c = newChar(1, RIVALS[W.chars.length % RIVALS.length], false, W.chars.length, W.chars.length % 3); W.chars.push(c); }
      if (c) { spawnAt(c, false); c.role = Math.random() < 0.5 ? 'guard' : 'hunt'; c.home = objPoint() || [P.x, P.z]; }
    }
  }
  function push(text, col) { W.feed.unshift({ text, col, t: 0 }); if (W.feed.length > 5) W.feed.length = 5; }
  function spreadOf(c) { const g = GUNS[c.gun]; return (g.spread * (Math.hypot(c.vx, c.vz) > 1 ? 1.4 : 1)) * Math.PI / 180; }
  function shoot(c) {
    const g = GUNS[c.gun];
    if (c.ammo[c.gun] <= 0) { if (c.reloadT <= 0) c.reloadT = g.reload; return false; }
    c.ammo[c.gun]--;
    const a = c.aim + (Math.random() - 0.5) * 2 * spreadOf(c);
    W.balls.push({ x: c.x + Math.cos(a) * 0.5, z: c.z + Math.sin(a) * 0.5, vx: Math.cos(a) * g.speed * 0.6, vz: Math.sin(a) * g.speed * 0.6, team: c.team, owner: c, dmg: g.dmg, life: g.range / (g.speed * 0.6) * 1.3, col: TEAMS[c.team].paint });
    if (c.isPlayer) { W.stats.shots++; if (ARC) ARC.sfx.noise(0.06, { freq: 2600, filter: 'bandpass', vol: 0.12 }); }
    return true;
  }
  function runGun(c, dt, held, pressed) {
    const g = GUNS[c.gun];
    c.fireT -= dt;
    if (c.reloadT > 0) { c.reloadT -= dt; if (c.reloadT <= 0) { c.ammo[c.gun] = g.mag; c.reloadT = 0; } return; }
    if (g.mode === 'burst' && c.burst > 0) { c.burstT -= dt; if (c.burstT <= 0) { if (shoot(c)) { c.burst--; c.burstT = g.gap; } else c.burst = 0; } return; }
    if (c.fireT > 0) return;
    if (g.mode === 'auto' && held) { shoot(c); c.fireT = 1 / g.rate; }
    else if (g.mode === 'burst' && (held || pressed)) { if (shoot(c)) { c.burst = g.burst - 1; c.burstT = g.gap; c.fireT = 1 / g.rate; } }
    else if (g.mode === 'single' && pressed) { shoot(c); c.fireT = 1 / g.rate; }
  }
  function splat(x, z, col, r) {
    const k = 768 / (GN * CS), g = W.pg;
    g.fillStyle = col; g.globalAlpha = 0.85;
    const px = (x + GN) * k, pz = (z + GN) * k;
    g.beginPath(); g.arc(px, pz, r * k, 0, TAU); g.fill();
    for (let i = 0; i < 7; i++) { const a = Math.random() * TAU, d = r * k * (1 + Math.random()); g.beginPath(); g.arc(px + Math.cos(a) * d, pz + Math.sin(a) * d, r * k * (0.15 + Math.random() * 0.3), 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    for (let i = 0; i < 6; i++) W.parts.push({ x, z, vx: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 6, t: 0, col });
  }
  function hit(c, s, dmg) {
    if (c.shield > 0) dmg *= 0.25;
    if (c.isPlayer || (c.team === 0 && W.mode === 'campaign')) dmg *= W.D.dmgIn;
    c.hp -= dmg; c.hit = 1; c.regen = 0;
    if (s && s.isPlayer) { W.stats.hits++; W.hm = 1; }
    if (c.isPlayer) { W.hurt = 1; if (ARC) { ARC.shake = Math.min(14, (ARC.shake || 0) + dmg / 8); ARC.buzz(Math.round(clamp(dmg, 12, 60))); } }
    if (!c.target && s) { c.target = s; c.react = W.D.react * 0.6; }
    if (c.hp <= 0) tagOut(c, s);
  }
  function tagOut(c, s) {
    c.alive = false; c.hp = 0; c.outT = 0; c.outs++; c.streak = 0; c.respawnT = c.boss ? 1e9 : 4.5;
    if (c.carry >= 0 && c.carry < 2 && W.flags.length) { const f = W.flags[c.carry]; f.state = 'dropped'; f.carrier = null; f.x = c.x; f.z = c.z; f.dropT = 0; }
    if (c.carry === 2 && W.obj) { W.obj.carried = false; W.obj.ix = c.x; W.obj.iz = c.z; }
    c.carry = -1;
    if (s) {
      s.tags++; s.streak++;
      if (s.isPlayer) { W.stats.tags++; W.stats.bestStreak = Math.max(W.stats.bestStreak, s.streak); W.hk = 1; if (ARC) ARC.sfx.tone(880, 0.12, { type: 'triangle', vol: 0.1 }); }
    }
    if (c.isPlayer) W.stats.outs++;
    push((s ? s.name : 'Paint') + ' tagged ' + c.name, s ? TEAMS[s.team].ui : '#fff');
    if (W.mode === 'splat' && s) { W.score[s.team]++; if (W.score[s.team] >= W.target) finish(s.team, 'score'); }
    if (W.mode === 'campaign') { if (c.team === 0) { W.tickets--; if (W.tickets <= 0) finish(1, 'tickets'); } else if (W.obj && W.obj.def.t === 'tag') W.obj.count++; }
    for (let i = 0; i < 12; i++) W.parts.push({ x: c.x, z: c.z, vx: (Math.random() - 0.5) * 8, vz: (Math.random() - 0.5) * 8, t: 0, col: s ? TEAMS[s.team].paint : '#fff' });
  }
  function finish(team, why) {
    if (W.over) return;
    if (W.attract) { W.score = [0, 0]; W.t = 0; return; }
    W.over = true; W.winner = team; W.why = why; W.endT = 0;
  }
  function visible(c, o) { return o.alive && o.team !== c.team && Math.hypot(o.x - c.x, o.z - c.z) < 30 && clearLine(W.G, c.x, c.z, o.x, o.z); }
  function stepBot(c, dt) {
    const D = W.D, P = W.P;
    c.think -= dt;
    if (c.think <= 0) {
      c.think = 0.25;
      let best = null, bd = 1e9;
      W.chars.forEach((o) => { if (visible(c, o)) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; best = o; } } });
      if (best && best !== c.target) c.react = D.react * (0.7 + Math.random() * 0.6);
      c.target = best;
      if (W.mode === 'ctf') {
        const mine = W.flags[c.team], theirs = W.flags[1 - c.team];
        if (c.carry >= 0) c.goal = [mine.hx, mine.hz];
        else if (mine.state !== 'home' && (c.role === 'defend' || Math.hypot(mine.x - c.x, mine.z - c.z) < 14)) c.goal = [mine.x, mine.z];
        else if (c.role === 'defend') c.goal = [mine.hx + Math.sin(W.t + c.id) * 4, mine.hz + Math.cos(W.t + c.id) * 4];
        else c.goal = [theirs.x, theirs.z];
      } else if (c.role === 'follow' && P.alive && !W.attract) c.goal = Math.hypot(P.x - c.x, P.z - c.z) > 4 ? [P.x - Math.cos(P.aim) * 3 + (c.id - 2) * 1.2, P.z - Math.sin(P.aim) * 3] : null;
      else if (c.role === 'guard' && c.home) c.goal = best && !c.boss ? [best.x, best.z] : [c.home[0] + Math.sin(W.t * 0.3 + c.id) * 4, c.home[1] + Math.cos(W.t * 0.3 + c.id) * 4];
      else if (best) { const pd = c.gun === 2 ? 22 : c.gun === 1 ? 14 : 10; c.goal = bd > pd ? [best.x, best.z] : null; }
      else { const foes = W.chars.filter((o) => o.alive && o.team !== c.team); const f = foes[(c.id + Math.floor(W.t / 6)) % Math.max(1, foes.length)]; c.goal = f ? [f.x, f.z] : null; }
    }
    c.react -= dt;
    let held = false, pressed = false;
    const T = c.target;
    if (T && T.alive && c.react <= 0) {
      const d = Math.hypot(T.x - c.x, T.z - c.z), g = GUNS[c.gun], tof = d / (g.speed * 0.6);
      const want = Math.atan2(T.z + T.vz * tof * D.lead - c.z, T.x + T.vx * tof * D.lead - c.x) + (Math.random() - 0.5) * D.aim * 0.03;
      c.aim += angDiff(c.aim, want) * Math.min(1, D.track * dt);
      if (Math.abs(angDiff(c.aim, want)) < 0.2 && d < g.range) { c.fireWin = (c.fireWin || 0) - dt; if (c.fireWin < -0.5 / D.burst) c.fireWin = 0.6 * D.burst; held = c.fireWin > 0; pressed = held; }
    } else if (Math.hypot(c.vx, c.vz) > 0.5) c.aim += angDiff(c.aim, Math.atan2(c.vz, c.vx)) * Math.min(1, 5 * dt);
    if (c.ammo[c.gun] <= 0 && c.reloadT <= 0) c.reloadT = GUNS[c.gun].reload;
    runGun(c, dt, held, pressed);
    let wx = 0, wz = 0;
    if (c.goal) { const s = stepToward(W.G, c.x, c.z, c.goal[0], c.goal[1]), l = Math.hypot(s[0], s[1]); if (l > 0.3) { wx = s[0] / l; wz = s[1] / l; } }
    if (T && T.alive) { c.strafeT -= dt; if (c.strafeT <= 0) { c.strafeT = 0.6 + Math.random(); c.strafe = -c.strafe; } wx += -Math.sin(c.aim) * c.strafe * 0.6; wz += Math.cos(c.aim) * c.strafe * 0.6; }
    move(c, wx, wz, c.boss ? 3.4 : 4.3, dt);
  }
  function move(c, wx, wz, sp, dt) {
    const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    c.vx = damp(c.vx, wx * sp, 10, dt); c.vz = damp(c.vz, wz * sp, 10, dt);
    c.x += c.vx * dt; c.z += c.vz * dt; collide(W.G, c, 0.36);
    c.x = clamp(c.x, -GN + 0.5, GN - 0.5); c.z = clamp(c.z, -GN + 0.5, GN - 0.5);
  }
  function stepBalls(dt) {
    for (let i = W.balls.length - 1; i >= 0; i--) {
      const b = W.balls[i]; let gone = false;
      const n = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vz) * dt / 0.4));
      for (let k = 0; k < n && !gone; k++) {
        b.x += b.vx * dt / n; b.z += b.vz * dt / n; b.life -= dt / n;
        for (const c of W.chars) { if (c.alive && c.team !== b.team && Math.hypot(c.x - b.x, c.z - b.z) < (c.boss ? 0.5 : 0.4)) { hit(c, b.owner, b.dmg); splat(b.x, b.z, b.col, 0.25); gone = true; break; } }
        if (!gone && stopsPaint(W.G, toCell(b.x), toCell(b.z))) { splat(b.x - b.vx * 0.006, b.z - b.vz * 0.006, b.col, 0.35); gone = true; }
        if (!gone && b.life <= 0) { splat(b.x, b.z, b.col, 0.3); gone = true; }
      }
      if (gone) W.balls.splice(i, 1);
    }
  }
  function stepFlags(dt) {
    W.flags.forEach((f) => {
      if (f.state === 'carried') {
        const c = f.carrier; if (!c || !c.alive) { f.state = 'dropped'; f.dropT = 0; return; }
        f.x = c.x; f.z = c.z;
        const home = W.flags[c.team];
        if (home.state === 'home' && Math.hypot(c.x - home.hx, c.z - home.hz) < 1.6) { W.score[c.team]++; c.caps++; c.carry = -1; f.state = 'home'; f.x = f.hx; f.z = f.hz; f.carrier = null; if (c.isPlayer) W.stats.caps++; push(c.name + ' captured the flag', TEAMS[c.team].ui); if (W.score[c.team] >= W.target) finish(c.team, 'caps'); }
        return;
      }
      if (f.state === 'dropped') { f.dropT += dt; if (f.dropT > 20) { f.state = 'home'; f.x = f.hx; f.z = f.hz; } }
      for (const c of W.chars) {
        if (!c.alive || Math.hypot(c.x - f.x, c.z - f.z) > 1.4) continue;
        if (c.team !== f.team && c.carry < 0) { f.state = 'carried'; f.carrier = c; c.carry = f.team; push(c.name + ' took the ' + TEAMS[f.team].short + ' flag', TEAMS[c.team].ui); break; }
        if (c.team === f.team && f.state === 'dropped') { f.state = 'home'; f.x = f.hx; f.z = f.hz; break; }
      }
    });
  }
  function step(dt, I) {
    W.t += dt; W.hm = Math.max(0, (W.hm || 0) - dt * 4); W.hk = Math.max(0, (W.hk || 0) - dt * 2); W.hurt = Math.max(0, (W.hurt || 0) - dt * 1.5);
    W.feed.forEach((f) => { f.t += dt; }); W.feed = W.feed.filter((f) => f.t < 5);
    if (W.over) { W.endT += dt; return; }
    const P = W.P;
    if (I && P.alive) {
      const g = GUNS[P.gun];
      if (I.aim != null) P.aim = I.aim;
      if (I.gun >= 0 && I.gun !== P.gun) { P.gun = I.gun; P.reloadT = 0; P.burst = 0; }
      if (I.reload && P.reloadT <= 0 && P.ammo[P.gun] < g.mag) P.reloadT = g.reload;
      move(P, I.mx, I.mz, I.sprint ? 6.6 : 4.8, dt);
      runGun(P, dt, I.fire, I.fireHit);
    }
    for (const c of W.chars) {
      if (c.alive) { c.shield = Math.max(0, (c.shield || 0) - dt); c.regen = (c.regen || 0) + dt; if (c.regen > 3.6) c.hp = Math.min(c.hpMax, c.hp + 34 * dt); c.hit = Math.max(0, c.hit - dt * 3); if (!c.isPlayer) stepBot(c, dt); continue; }
      c.outT += dt;
      if (c.boss || (W.mode === 'campaign' && c.team === 1)) continue;
      c.respawnT -= dt; if (c.respawnT <= 0) spawnAt(c, false);
    }
    stepBalls(dt);
    if (W.mode === 'ctf') stepFlags(dt);
    if (W.mode === 'campaign' && W.obj && !W.over) stepObj(dt);
    W.parts.forEach((p) => { p.t += dt; p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.9; p.vz *= 0.9; }); W.parts = W.parts.filter((p) => p.t < 0.5);
    if (W.limit && W.t >= W.limit && !W.over) finish(W.score[0] > W.score[1] ? 0 : W.score[1] > W.score[0] ? 1 : -1, 'time');
  }

  /* drawing */
  const PAL = { mill: ['#5d5248', '#8d4a36', '#4a5a50', '#efe6d4', '#3b2f28'], roof: ['#4a4f54', '#b9c9c4', '#c9cfd2', '#c49a6a', '#1c2a36'], fort: ['#c49a6c', '#d9a46a', '#e0bd8e', '#8a5a33', '#a8714a'] };
  function draw(ctx, a) {
    const w = a.w, h = a.h, P = W.P, pal = PAL[W.mapId];
    const k = Math.min(w, h) / 22, cx = W.attract ? 0 : P.x, cz = W.attract ? 0 : P.z, kk = W.attract ? Math.min(w, h) / 50 : k;
    const sx = (x) => w / 2 + (x - cx) * kk, sy = (z) => h / 2 + (z - cz) * kk;
    ctx.fillStyle = pal[4]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = pal[0]; ctx.fillRect(sx(-GN), sy(-GN), GN * CS * kk, GN * CS * kk);
    ctx.drawImage(W.paint, sx(-GN), sy(-GN), GN * CS * kk, GN * CS * kk);
    for (let z = 0; z < GN; z++) for (let x = 0; x < GN; x++) {
      const ch = W.G.kind[z * GN + x]; if (ch === '.') continue;
      const X = sx(cw(x)), Z = sy(cw(z)), S = CS * kk;
      if (ch === 'x') { ctx.fillStyle = '#10151b'; ctx.fillRect(X, Z, S + 1, S + 1); continue; }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X + S * 0.12, Z + S * 0.12, S, S);
      ctx.fillStyle = ch === '#' || ch === 'o' ? pal[1] : ch === 'b' ? pal[2] : pal[3];
      if (ch === 'o') { ctx.beginPath(); ctx.arc(X + S / 2, Z + S / 2, S * 0.45, 0, TAU); ctx.fill(); }
      else ctx.fillRect(X + (ch === 'c' ? S * 0.06 : 0), Z + (ch === 'c' ? S * 0.06 : 0), ch === 'c' ? S * 0.88 : S + 1, ch === 'c' ? S * 0.88 : S + 1);
    }
    if (W.mode === 'ctf') W.flags.forEach((f) => { ctx.fillStyle = TEAMS[f.team].paint; ctx.fillRect(sx(f.x), sy(f.z) - kk * 1.1, kk * 0.8, kk * 0.5); ctx.fillStyle = '#ddd'; ctx.fillRect(sx(f.x), sy(f.z) - kk * 1.1, 2, kk * 1.1); });
    if (W.mode === 'campaign' && W.obj) { const p = objPoint(); if (p) { ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx(p[0]), sy(p[1]), (W.obj.def.r || 1) * kk * 1.2, 0, TAU); ctx.stroke(); } }
    W.balls.forEach((b) => { ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(sx(b.x), sy(b.z), Math.max(2, kk * 0.12), 0, TAU); ctx.fill(); });
    W.parts.forEach((p) => { ctx.fillStyle = p.col; ctx.globalAlpha = 1 - p.t / 0.5; ctx.fillRect(sx(p.x) - 2, sy(p.z) - 2, 4, 4); ctx.globalAlpha = 1; });
    W.chars.forEach((c) => {
      if (!c.alive && c.outT > 1.2) return;
      const X = sx(c.x), Z = sy(c.z), r = kk * (c.boss ? 0.5 : 0.38), T = TEAMS[c.team];
      ctx.globalAlpha = c.alive ? 1 : 1 - c.outT / 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(X + 3, Z + 3, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1d2026'; ctx.lineWidth = Math.max(3, kk * 0.14); ctx.beginPath(); ctx.moveTo(X, Z); ctx.lineTo(X + Math.cos(c.aim) * r * 2, Z + Math.sin(c.aim) * r * 2); ctx.stroke();
      ctx.fillStyle = c.hit > 0 ? '#ffffff' : c.boss ? '#5a2a8a' : T.vest; ctx.beginPath(); ctx.arc(X, Z, r, 0, TAU); ctx.fill();
      ctx.fillStyle = T.trim; ctx.beginPath(); ctx.arc(X + Math.cos(c.aim) * r * 0.35, Z + Math.sin(c.aim) * r * 0.35, r * 0.45, 0, TAU); ctx.fill();
      if (c.isPlayer) { ctx.strokeStyle = '#fbf5ec'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Z, r + 3, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1;
      if (c.alive && c.hp < c.hpMax) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(X - r, Z - r - 8, r * 2, 4); ctx.fillStyle = T.ui; ctx.fillRect(X - r, Z - r - 8, r * 2 * c.hp / c.hpMax, 4); }
    });
    if (W.attract) return;
    // HUD
    const pad = a.hudPad();
    ctx.fillStyle = 'rgba(10,9,8,0.6)'; ctx.fillRect(w / 2 - 120, pad.top, 240, 40);
    ctx.font = '700 18px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = TEAMS[0].paint; ctx.fillText(W.mode === 'campaign' ? W.stats.objs + '/' + W.mission.objs.length : '' + W.score[0], w / 2 - 85, pad.top + 20);
    ctx.fillStyle = TEAMS[1].paint; ctx.fillText(W.mode === 'campaign' ? '' + W.stats.tags : '' + W.score[1], w / 2 + 85, pad.top + 20);
    ctx.fillStyle = '#fbf5ec'; ctx.font = '600 14px "JetBrains Mono", monospace'; ctx.fillText(W.mode === 'campaign' ? 'TICKETS ' + Math.max(0, W.tickets) : fmtClock(W.limit - W.t), w / 2, pad.top + 20);
    if (W.mode === 'campaign' && W.obj) { ctx.font = '600 13px Inter, sans-serif'; ctx.fillText(objText(), w / 2, pad.top + 56); }
    ctx.textAlign = 'left'; ctx.font = '600 12px Inter, sans-serif';
    W.feed.forEach((f, i) => { ctx.fillStyle = f.col; ctx.fillText(f.text, pad.left, pad.top + 14 + i * 18); });
    const by = h - pad.bottom - 10;
    ctx.fillStyle = 'rgba(10,9,8,0.6)'; ctx.fillRect(pad.left, by - 30, 170, 30); ctx.fillRect(w - pad.right - 170, by - 30, 170, 30);
    ctx.fillStyle = '#e9f2ff'; ctx.fillRect(pad.left + 8, by - 19, 154 * clamp(P.hp / 100, 0, 1), 8);
    ctx.fillStyle = '#fbf5ec'; ctx.textAlign = 'right'; ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillText(GUNS[P.gun].name + '  ' + (P.reloadT > 0 ? 'RELOAD' : P.ammo[P.gun] + '/' + GUNS[P.gun].mag), w - pad.right - 8, by - 15);
    if (W.hm > 0) { ctx.strokeStyle = W.hk > 0 ? TEAMS[0].paint : '#fff'; ctx.lineWidth = 2; const X = sx(P.x) + Math.cos(P.aim) * kk * 3, Z = sy(P.z) + Math.sin(P.aim) * kk * 3; ctx.beginPath(); ctx.moveTo(X - 6, Z - 6); ctx.lineTo(X + 6, Z + 6); ctx.moveTo(X + 6, Z - 6); ctx.lineTo(X - 6, Z + 6); ctx.stroke(); }
    if (!P.alive) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, h / 2 - 30, w, 60); ctx.fillStyle = '#ffd23f'; ctx.textAlign = 'center'; ctx.font = '700 18px Inter, sans-serif'; ctx.fillText('Tagged out. Back in ' + Math.max(1, Math.ceil(P.respawnT)), w / 2, h / 2); }
    if (W.hurt > 0) { ctx.fillStyle = 'rgba(80,110,255,' + W.hurt * 0.2 + ')'; ctx.fillRect(0, 0, w, h); }
  }
  function aimFromInput(a, I) {
    const P = W.P, inp = a.input;
    // mouse: aim at the pointer; controller right stick; touch and keys: the nearest rival in sight
    const gp = a.gamepad && navigator.getGamepads ? Array.from(navigator.getGamepads()).find((g) => g && g.connected) : null;
    if (gp && Math.hypot(gp.axes[2] || 0, gp.axes[3] || 0) > 0.3) { I.aim = Math.atan2(gp.axes[3], gp.axes[2]); return; }
    if (!a.touchMode && inp.pointer.seen && a.inputMode === 'mouse') { I.aim = Math.atan2(inp.pointer.y - a.h / 2, inp.pointer.x - a.w / 2); return; }
    let best = null, bd = 1e9;
    W.chars.forEach((o) => { if (o.alive && o.team !== P.team && Math.hypot(o.x - P.x, o.z - P.z) < 26 && clearLine(W.G, P.x, P.z, o.x, o.z)) { const d = Math.hypot(o.x - P.x, o.z - P.z); if (d < bd) { bd = d; best = o; } } });
    if (best) I.aim = Math.atan2(best.z - P.z, best.x - P.x);
    else if (Math.hypot(I.mx, I.mz) > 0.2) I.aim = Math.atan2(I.mz, I.mx);
    else if (inp.down('ArrowLeft')) I.aim = P.aim - 0.05; else if (inp.down('ArrowRight')) I.aim = P.aim + 0.05;
  }
  function menuProps() {
    return {
      eyebrow: 'Tactical paintball', title: 'Paint <em>Ops</em>',
      html: '<p>Squad up for a paint marker showdown, seen from above. Splat rivals until they are tagged out, steal flags and run the campaign. This is the 2D version for browsers without 3D graphics.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'splat', choices: [{ v: 'splat', label: 'Team Splat' }, { v: 'ctf', label: 'Capture the Flag' }, { v: 'campaign', label: 'Campaign' }] },
        { id: 'map', label: 'Map', value: 'mill', choices: MAP_ORDER.map((m) => ({ v: m, label: MAPS[m].name })) },
        { id: 'mission', label: 'Mission', value: '0', choices: MISSIONS.map((m, i) => ({ v: String(i), label: (i + 1) + '. ' + m.name + (i >= SAVE.unlocked ? ' (locked)' : '') })) },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
        { id: 'gun', label: 'Marker', value: '0', choices: GUNS.map((g, i) => ({ v: String(i), label: g.name })) }
      ]
    };
  }
  function results() {
    const s = W.stats, won = W.winner === 0;
    let pts = s.tags * 100 + s.caps * 600 + s.objs * 500 + (won ? 1500 : W.winner < 0 ? 500 : 0);
    pts = Math.round(pts * (W.cfg.diff === 'easy' ? 0.8 : W.cfg.diff === 'hard' ? 1.3 : 1));
    if (W.mode === 'campaign' && won) { SAVE.unlocked = Math.max(SAVE.unlocked, Math.min(MISSIONS.length, W.cfg.mission + 2)); saveGame(); }
    ARC.over({ eyebrow: W.mode === 'campaign' ? W.mission.name : W.mode === 'ctf' ? 'Capture the Flag' : 'Team Splat', title: W.mode === 'campaign' ? (won ? 'Mission <em>complete</em>' : 'Mission <em>failed</em>') : W.winner < 0 ? 'A <em>draw</em>' : TEAMS[W.winner].name + ' <em>win</em>', html: '<p>Tags ' + s.tags + ' · Tagged ' + s.outs + ' · Accuracy ' + (s.shots ? Math.round(s.hits / s.shots * 100) : 0) + '%</p>', score: pts, scoreLabel: 'Points' });
  }
  const SKIPSTATE = { shotHeld: false };
  Arcade.create({
    slug: 'paint-ops', title: 'Paint Ops', genre: 'Tactical paintball shooter',
    hint: 'WASD to move, mouse to aim, click or J to fire. R reload, Shift sprint, 1 2 3 switch markers.',
    touchHint: 'Stick to move, the sight locks on the nearest rival. Fire, Reload, Swap on the buttons.',
    keys: [['WASD / arrows', 'Move'], ['Mouse', 'Aim'], ['Click / J / Space', 'Fire'], ['R', 'Reload'], ['Shift', 'Sprint'], ['1 2 3 / Q', 'Switch marker']],
    gameKeys: ['ShiftLeft', 'ShiftRight', 'Digit1', 'Digit2', 'Digit3'],
    mouse: { steer: false, cursor: 'crosshair' },
    gamepad: { buttons: ['KeyJ', 'KeyR', 'ShiftLeft', 'KeyQ'], rt: 'KeyJ' },
    touch: { stick: true, pads: [{ label: 'Fire', key: 'KeyJ', big: true, hot: true }, { label: 'Reload', key: 'KeyR' }, { label: 'Swap', key: 'KeyQ' }] },
    formatScore: (v) => Math.round(v).toLocaleString('en-IN') + ' pts',
    init(a) {
      ARC = a;
      const orig = a.menu; a.menu = (p) => orig(Object.assign(menuProps(), p || {}));
      a.debug = () => W ? { state: a.state, phase: W.attract ? 'attract' : W.over ? 'over' : 'play', mode: W.mode, map: W.mapId, renderer: '2d', alive: !W.over, score: W.score.slice(), tags: W.stats.tags, shots: W.stats.shots, hp: Math.round(W.P.hp), x: +W.P.x.toFixed(2), z: +W.P.z.toFixed(2), aim: +W.P.aim.toFixed(2), ammo: W.P.ammo[W.P.gun], time: +W.t.toFixed(2) } : { state: a.state, renderer: '2d' };
      newWorld({ mode: 'splat', map: 'mill', diff: 'normal', attract: true });
      a.menu();
    },
    start(a, ch) {
      let mission = parseInt(ch.mission || '0', 10) || 0; if (mission >= SAVE.unlocked) mission = SAVE.unlocked - 1;
      newWorld({ mode: ch.mode || 'splat', map: ch.map || 'mill', mission, diff: ch.diff || 'normal', gun: parseInt(ch.gun || '0', 10) || 0 });
    },
    update(dt, a) {
      if (!W || W.attract) return;
      const inp = a.input, ax = inp.axis();
      const I = { mx: ax.x, mz: ax.y, fire: inp.down('KeyJ', 'Space') || inp.pointer.down, fireHit: inp.hit('KeyJ', 'Space') || inp.pointer.pressed, reload: inp.hit('KeyR'), sprint: inp.down('ShiftLeft', 'ShiftRight'), gun: inp.hit('Digit1') ? 0 : inp.hit('Digit2') ? 1 : inp.hit('Digit3') ? 2 : inp.hit('KeyQ') ? (W.P.gun + 1) % 3 : -1, aim: null };
      aimFromInput(a, I);
      step(dt, I);
      if (W.over && W.endT > 1.2 && !W.shown) { W.shown = true; results(); }
    },
    idle(dt, a) { if (a.state === 'menu') { if (!W || !W.attract) newWorld({ mode: 'splat', map: 'mill', diff: 'normal', attract: true }); step(dt, null); } },
    render(ctx, a) { if (W) draw(ctx, a); }
  });
  void SKIPSTATE; void lerp; void hash;
})();
