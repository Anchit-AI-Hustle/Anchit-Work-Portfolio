import * as THREE from '/games/vendor/three/three.module.min.js';

/*
 * Tiffin Dash, in 3D: a third-person run down a bazaar lane at dusk.
 * Same rules, modes, scoring and one-finger controls as the 2D game: jump the
 * parked scooters and handcarts, slide under the cloth lines, grab steel
 * tiffins and drop the stack at the marigold gateways. The rules run in the
 * 2D game's own units (40 per metre of score), the world is drawn from them.
 */

const A = window.Arcade;
const clamp = A.clamp, lerp = A.lerp;
const PI = Math.PI, TAU = Math.PI * 2;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max;
const rnd = Math.random;
const F_DISP = 'Fraunces, Times New Roman, serif';
const F_UI = 'Inter, sans-serif';
const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
const BG = '#0F0D0A', INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';
const SHOPS = ['Chai', 'Bakery', 'Tailor', 'Florist', 'Spices', 'Jewels'];

// 2D units to metres. A runner is 52 units tall, so a metre is 32 of them.
const S = 1 / 32;
const RW = 3.4;          // half the lane, kerb to kerb
const WALK = 5.4;        // building line
const SLOT = 6.4;        // one shopfront
const NSLOT = 16;        // per side
const SPAN = SLOT * NSLOT;
const NEAR_Z = 16;       // where recycled scenery re-enters, behind the camera

let arc;
const DIFF = {
  easy: { spd: 230, gap: 1.2 },
  normal: { spd: 270, gap: 1 },
  hard: { spd: 340, gap: 0.78 },
};
const G = {
  t: 0, dist: 0, speed: 260, score: 0, lives: 3, maxLives: 3, hold: 0, combo: 0,
  py: 0, pvy: 0, slide: 0, inv: 0, run: 0,
  objs: [], floats: [],
  phase: 'run', attract: true, next: 1400,
  mode: 'street', diff: 'normal', clock: 0, touchActs: 0, jbuf: 0,
  slowT: 0, hitT: 0, deliverT: 0, landT: 0,
};

/* ------------------------------------------------------------------ game rules (2D units) */
function reset(attract, ch) {
  G.mode = (ch && ch.mode) || G.mode || 'street';
  G.diff = (ch && ch.diff) || G.diff || 'normal';
  G.D = DIFF[G.diff] || DIFF.normal;
  const rush = G.mode === 'rush';
  G.t = 0; G.dist = 0; G.speed = attract ? 180 : G.D.spd * (rush ? 1.16 : 1);
  G.maxLives = rush ? 1 : 3; G.lives = G.maxLives; G.score = 0; G.hold = 0; G.combo = 0;
  G.clock = G.mode === 'shift' ? 90 : 0;
  G.py = 0; G.pvy = 0; G.slide = 0; G.inv = attract ? 0 : 1.4; G.run = 0; G.jbuf = 0; G.touchActs = 0;
  G.objs.forEach(releaseVis);
  G.objs = []; G.floats = [];
  G.phase = 'run'; G.attract = !!attract; G.next = attract ? 400 : 520 * G.D.gap * (rush ? 0.82 : 1);
  G.slowT = 0; G.hitT = 0; G.deliverT = 0; G.landT = 0;
  if (FX) FX.clear();
  if (!attract) {
    G.objs.push({ kind: 'tiffin', x: 420, w: 22, h: 18, item: true, bob: rnd() * TAU });
    G.objs.push({ kind: 'door', x: 760, w: 36, h: 70, door: true });
  }
}

// Fixed spawn distance (about 37 m ahead), so a phone and a wide screen get the same street.
const SPAWN_AHEAD = 1200;
function spawn() {
  const x = G.dist + SPAWN_AHEAD;
  const roll = rnd();
  if (roll < 0.34) G.objs.push({ kind: 'scooter', x, w: 54, h: 28, low: true, yaw: (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.25) });
  else if (roll < 0.58) G.objs.push({ kind: 'cart', x, w: 70, h: 36, low: true, yaw: (rnd() - 0.5) * 0.25 });
  else if (roll < 0.76) G.objs.push({ kind: 'cloth', x, w: 90, h: 46, high: true, sway: rnd() * TAU });
  else if (roll < 0.9) G.objs.push({ kind: 'tiffin', x, w: 22, h: 18, item: true, bob: rnd() * TAU });
  else G.objs.push({ kind: 'door', x, w: 36, h: 70, door: true });
  const gap = (G.D || DIFF.normal).gap * (G.mode === 'rush' ? 0.82 : 1);
  G.next = G.dist + (280 + rnd() * 220) * gap;
}

function finish(why) {
  if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
  G.phase = 'over';
  arc.over({
    eyebrow: why, title: why === 'Shift over' ? 'Shift <em>done</em>' : 'Tiffin <em>down</em>',
    score: Math.round(G.score), scoreLabel: 'Score',
    html: '<p>' + Math.round(G.dist / 40) + ' metres through the bazaar.</p>',
    again: 'Run again',
  });
}

function objZ(o) { return -(o.x - G.dist + o.w / 2 - 14) * S; }

function hit(o) {
  if (G.inv > 0) return;
  G.lives--; G.inv = 1.2; G.combo = 0;
  const dropped = G.hold; G.hold = 0;
  arc.shake = 8; arc.buzz(40);
  arc.sfx.tone(160, 0.16, { type: 'sawtooth', slide: 80, vol: 0.14 });
  arc.sfx.noise(0.25, { freq: 700, vol: 0.18 });
  G.hitT = 0.45;
  if (FX) {
    const z = o ? objZ(o) + 0.6 : -0.6;
    FX.burst(0, 0.9, z, 22, FX.C.prim, 4.2, 'spark');
    FX.burst(0, 0.4, z, 14, FX.C.dust, 2.6, 'dust');
    for (let i = 0; i < dropped; i++) FX.burst(0.2, 1.1 + i * 0.12, 0, 4, FX.C.steel, 3.5, 'spark');
  }
  if (G.lives <= 0) finish('Dropped the stack');
  else arc.toast('Watch the street', G.lives + ' left', 900);
}

function collect(o) {
  const z = objZ(o);
  if (o.item) {
    G.hold = min(5, G.hold + 1); G.combo++;
    const pts = 40 * G.combo;
    G.score += pts;
    arc.sfx.tone(660, 0.08, { type: 'sine', vol: 0.12 });
    arc.sfx.tone(990, 0.1, { type: 'sine', vol: 0.07, delay: 0.05 });
    if (FX) { FX.burst(0, 0.75, z, 18, FX.C.gold, 3.2, 'glow'); FX.ring(0, 0.06, z, FX.C.warm); }
    floatScore(0, 1.9, z, '+' + pts, WARM);
    if (G.combo >= 3) arc.toast('Hot stack x' + G.combo, '+' + pts, 700);
  } else if (o.door) {
    // Empty doors stay put so a runner without tiffins is not blocked.
    if (G.hold <= 0) return;
    const pts = 80 * G.hold;
    if (G.hold >= 3) G.slowT = 0.55;
    G.score += pts; G.hold = 0; G.combo++;
    G.deliverT = 1;
    arc.sfx.tone(880, 0.12, { type: 'sine', vol: 0.14 });
    arc.sfx.tone(1320, 0.16, { type: 'triangle', vol: 0.08, delay: 0.08 });
    arc.toast('Delivered', '+' + pts, 800);
    arc.buzz(18);
    if (FX) {
      FX.burst(0, 2.2, z, 46, FX.C.petal, 5, 'petal');
      FX.burst(0, 1.2, z, 24, FX.C.gold, 4, 'glow');
      FX.ring(0, 0.06, z, FX.C.gold);
    }
    floatScore(0, 2.6, z, '+' + pts, GOLD, true);
  }
  o.dead = true;
}

function floatScore(x, y, z, text, col, big) {
  G.floats.push({ x, y, z, life: 1.1, max: 1.1, text: String(text), col: col || WARM, big: !!big });
}

// One finger: tap, hold or flick up to jump; flick down to slide (held, it
// keeps sliding; in the air it drops you fast). Acts on the live drag, so a
// flick fires as it crosses the threshold, not when the finger lifts.
const TG = { t0: -1, done: '' };
function touchRead(dt, inp) {
  const gz = inp.gesture, tp = inp.tap(), sw = inp.swipe();
  const out = { jump: false, slide: false };
  const fresh = gz.t0 !== TG.t0;
  if (gz.active) {
    if (fresh) { TG.t0 = gz.t0; TG.done = ''; }
    const ady = abs(gz.dy), adx = abs(gz.dx);
    const held = (window.performance ? performance.now() : Date.now()) - gz.t0;
    if (gz.dy < -24 && ady > adx * 0.7) { if (!TG.done) { out.jump = true; TG.done = 'up'; } }
    else if (gz.dy > 24 && ady > adx * 0.7) { out.slide = true; if (TG.done !== 'down') G.touchActs++; TG.done = 'down'; }
    else if (!TG.done && adx < 14 && ady < 14 && held > 150) { out.jump = true; TG.done = 'hold'; }
    if (out.jump) G.touchActs++;
    return out;
  }
  const acted = !fresh && TG.done;
  if (tp && !acted) { out.jump = true; G.touchActs++; }
  if (sw && !acted) {
    if (sw.dir === 'up') { out.jump = true; G.touchActs++; }
    else if (sw.dir === 'down') { out.slide = true; G.touchActs++; }
  }
  if (tp || sw) { TG.t0 = gz.t0; TG.done = TG.done || 'end'; }
  return out;
}

const PADY = { prev: 0 };
function update(dt) {
  if (G.phase === 'over' || G.freeze) return;
  // A big delivery slows the street for a beat; the clock of the world, not the shell's.
  if (G.slowT > 0) { G.slowT = max(0, G.slowT - dt); dt *= arc.reducedMotion ? 1 : 0.42; }
  G.t += dt; G.run += dt; G.inv = max(0, G.inv - dt); G.slide = max(0, G.slide - dt);
  if (G.clock) {
    G.clock -= dt;
    if (G.clock <= 0) { G.clock = 0; finish('Shift over'); return; }
  }
  const base = (G.D || DIFF.normal).spd * (G.mode === 'rush' ? 1.16 : 1);
  G.speed = min(base + 250, base + G.dist * 0.012);
  G.dist += G.speed * dt;
  G.score += dt * 8;
  const inp = arc.input;
  // Tap & swipe: a finger never reads as a mouse click, the gesture decides.
  const gest = gestStyle() && inp.pointer.type !== 'mouse';
  const low = inp.pointer.ny > 0.78;
  let jump = inp.hit('Space', 'KeyJ', 'Enter', 'ArrowUp', 'KeyW') || (!gest && inp.pointer.pressed && !low);
  let slide = inp.down('ArrowDown', 'KeyS') || inp.hit('ArrowDown', 'KeyS') || (!gest && inp.pointer.down && low);
  // A controller's stick: push up to jump, hold down to slide (its A and B press Jump and Slide).
  const pd = inp.pad;
  if (pd && pd.active) {
    if (pd.y < -0.6 && PADY.prev >= -0.6) jump = true;
    if (pd.y > 0.6) slide = true;
  }
  PADY.prev = pd && pd.active ? pd.y : 0;
  if (gest) {
    const tj = touchRead(dt, inp);
    if (tj.jump) G.jbuf = 0.14;
    if (tj.slide) slide = true;
  }
  if (G.jbuf > 0) { G.jbuf -= dt; if (G.py <= 0.01) { jump = true; G.jbuf = 0; } }
  if (jump && G.py <= 0.01) {
    G.pvy = 720; arc.sfx.tone(320, 0.06, { type: 'square', vol: 0.08 });
    if (FX) FX.burst(0, 0.05, 0.1, 8, FX.C.dust, 1.6, 'dust');
  }
  if (slide && gest && G.py > 0.01 && G.pvy > -620) G.pvy = -620;
  if (slide && G.py <= 0.01) {
    if (G.slide <= 0) arc.sfx.noise(0.22, { freq: 900, vol: 0.08 });
    G.slide = 0.42;
  }
  G.pvy -= 2100 * dt; G.py += G.pvy * dt;
  if (G.py < 0) {
    if (G.pvy < -200) { G.landT = 1; if (FX) FX.burst(0, 0.05, 0, 12, FX.C.dust, 2.2, 'dust'); }
    G.py = 0; G.pvy = 0;
  }
  if (G.dist > G.next) spawn();
  const gy = 0;
  const px = 130, pw = 28;
  const ph = G.slide > 0 ? 26 : 52;
  const py = gy - 8 - G.py - (G.slide > 0 ? 26 : 52);
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i];
    if (o.dead) continue;
    const ox = o.x - G.dist + 130;
    if (ox < -120) { o.dead = true; continue; }
    const oy = o.high ? gy - 96 : gy - 8 - o.h;
    const oh = o.high ? 46 : o.h;
    const hitbox = !(ox + o.w < px || ox > px + pw || oy + oh < py || oy > py + ph);
    if (!hitbox) continue;
    if (o.item || o.door) collect(o);
    else hit(o);
  }
  sweepObjs();
}

function sweepObjs() {
  let j = 0;
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i];
    if (!o.dead && o.x - G.dist + 130 > -160) G.objs[j++] = o;
    else releaseVis(o);
  }
  G.objs.length = j;
}

// The menu's street: the runner reads the road and clears it on its own.
function idle(dt) {
  G.attract = true;
  if (!G.attractReady) { reset(true); G.attractReady = true; }
  G.t += dt; G.dist += 200 * dt; G.run += dt; G.speed = 200; G.slide = max(0, G.slide - dt);
  let want = '';
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i], u = o.x - G.dist;
    if (u > 20 && u < 120 && !o.item && !o.door) { want = o.high ? 'slide' : 'jump'; break; }
  }
  if (want === 'jump' && G.py <= 0.01) G.pvy = 700;
  if (want === 'slide' && G.py <= 0.01) G.slide = 0.42;
  G.pvy -= 2100 * dt; G.py += G.pvy * dt; if (G.py < 0) { G.py = 0; G.pvy = 0; }
  if (G.dist > G.next) spawn();
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i], u = o.x - G.dist;
    if ((o.item || o.door) && u < 10 && !o.dead) { if (o.item) { G.hold = min(4, G.hold + 1); if (FX) FX.burst(0, 0.75, objZ(o), 10, FX.C.gold, 3, 'glow'); o.dead = true; } else if (G.hold > 0) { G.hold = 0; if (FX) FX.burst(0, 2.2, objZ(o), 24, FX.C.petal, 4, 'petal'); o.dead = true; } }
  }
  sweepObjs();
}

/* ------------------------------------------------------------------ textures */
const ALL_TEX = [];
let TEX_ANISO = 4;
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = TEX_ANISO;
  ALL_TEX.push(t);
  return t;
}
function speckle(g, w, h, n, cols, rmax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    const r = Math.random() * rmax;
    g.fillRect(Math.random() * w, Math.random() * h, r + 0.5, r + 0.5);
  }
}
function seeded(seed) { return A.rng(seed); }

function roadTex() {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#4a4038'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, ['#3c332c', '#564b41', '#2f2823', '#5e5246', '#463c34'], 2.2);
    // Packed dust towards the kerbs, darker oil down the middle of the wheel tracks.
    const edge = g.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, 'rgba(150,120,85,.55)'); edge.addColorStop(0.16, 'rgba(150,120,85,0)');
    edge.addColorStop(0.84, 'rgba(150,120,85,0)'); edge.addColorStop(1, 'rgba(150,120,85,.55)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(20,16,12,.18)';
    g.fillRect(w * 0.27, 0, w * 0.08, h); g.fillRect(w * 0.65, 0, w * 0.08, h);
    // Patches and cracks.
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i % 2 ? 'rgba(30,25,21,.45)' : 'rgba(95,82,70,.35)';
      const x = Math.random() * w, y = Math.random() * h;
      g.beginPath(); g.ellipse(x, y, 30 + Math.random() * 60, 18 + Math.random() * 40, Math.random() * 3, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(22,18,14,.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; g.lineTo(x, y); }
      g.stroke();
    }
    // Faded amber centre dashes, as the 2D street had.
    for (let y = 0; y < h; y += 256) {
      g.fillStyle = 'rgba(240,170,60,.55)'; g.fillRect(w / 2 - 7, y + 30, 14, 130);
      speckle(g, 14, 130, 0, ['#000'], 1);
      g.fillStyle = 'rgba(60,50,40,.35)';
      for (let k = 0; k < 40; k++) g.fillRect(w / 2 - 7 + Math.random() * 14, y + 30 + Math.random() * 130, 2, 2);
    }
    // Kerb-side gutters.
    g.fillStyle = 'rgba(15,12,10,.5)'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
  }, { repeat: true });
}

function walkTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a7a66'; g.fillRect(0, 0, w, h);
    const s = 64;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const v = 120 + Math.random() * 40 | 0;
      g.fillStyle = 'rgb(' + v + ',' + (v - 14) + ',' + (v - 32) + ')';
      g.fillRect(x + 2, y + 2, s - 4, s - 4);
      speckle(g, 0, 0, 0, ['#000'], 1);
    }
    speckle(g, w, h, 5000, ['rgba(60,50,40,.35)', 'rgba(200,180,150,.25)'], 1.5);
    g.fillStyle = 'rgba(40,32,26,.35)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 20, 10, 0, 0, TAU); g.fill(); }
  }, { repeat: true });
}

function drawFacade(g, W, H, v, emis) {
  const r = seeded(1000 + v * 77);
  const name = SHOPS[v % SHOPS.length];
  const boardCols = ['#b8322a', '#1f5c8a', '#2f6b3a', '#7a2a6a', '#c27a12', '#20605c'];
  const shut = ['#2f6b5a', '#3a5a8a', '#7a4a2a', '#5a3a6a', '#2a6a7a', '#8a3a2a'][v % 6];
  if (!emis) {
    g.fillStyle = '#ece4d6'; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 9000, ['rgba(120,100,80,.10)', 'rgba(255,255,255,.12)', 'rgba(90,70,55,.08)'], 2.5);
    // Rain streaks and grime.
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(70,55,45,' + (0.04 + r() * 0.07) + ')';
      g.fillRect(r() * W, r() * H * 0.5, 2 + r() * 5, 40 + r() * 140);
    }
    const gr = g.createLinearGradient(0, H * 0.55, 0, H);
    gr.addColorStop(0, 'rgba(60,45,35,0)'); gr.addColorStop(1, 'rgba(60,45,35,.35)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // Cornice bands.
    g.fillStyle = 'rgba(255,250,240,.55)'; g.fillRect(0, 6, W, 10); g.fillRect(0, H * 0.33, W, 8);
    g.fillStyle = 'rgba(60,45,35,.25)'; g.fillRect(0, 16, W, 4); g.fillRect(0, H * 0.33 + 8, W, 4);
  } else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
  // Two upper floors of windows.
  const floors = [[H * 0.06, H * 0.31], [H * 0.36, H * 0.58]];
  const nWin = 2 + (v % 2);
  floors.forEach((f, fi) => {
    const fh = f[1] - f[0];
    for (let k = 0; k < nWin; k++) {
      const cw = W / nWin, wx = k * cw + cw * 0.2, ww = cw * 0.6, wy = f[0] + fh * 0.12, wh = fh * 0.62;
      const lit = r() < 0.55;
      if (!emis) {
        g.fillStyle = 'rgba(70,55,45,.45)'; g.fillRect(wx - 6, wy - 6, ww + 12, wh + 14);
        g.fillStyle = lit ? '#f7c56a' : '#2a3442'; g.fillRect(wx, wy, ww, wh);
        if (lit) { const lg = g.createLinearGradient(0, wy, 0, wy + wh); lg.addColorStop(0, '#ffe2a0'); lg.addColorStop(1, '#d9862e'); g.fillStyle = lg; g.fillRect(wx, wy, ww, wh); }
        g.fillStyle = 'rgba(40,30,25,.55)'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh * 0.45, ww, 3);
        // Shutters, one folded back.
        g.fillStyle = shut; g.fillRect(wx - ww * 0.32, wy, ww * 0.3, wh); g.fillRect(wx + ww + 2, wy, ww * 0.3, wh);
        g.fillStyle = 'rgba(0,0,0,.2)';
        for (let s = 0; s < 8; s++) { g.fillRect(wx - ww * 0.32, wy + s * wh / 8, ww * 0.3, 2); g.fillRect(wx + ww + 2, wy + s * wh / 8, ww * 0.3, 2); }
        // Sill and arch.
        g.fillStyle = 'rgba(255,250,240,.7)'; g.fillRect(wx - 8, wy + wh, ww + 16, 6);
        g.beginPath(); g.arc(wx + ww / 2, wy, ww / 2 + 4, PI, TAU); g.fillStyle = 'rgba(80,60,48,.35)'; g.fill();
      } else if (lit) {
        g.fillStyle = '#e8a040'; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = '#000'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh * 0.45, ww, 3);
      }
    }
    // A balcony on one floor, with a railing and pots.
    if (fi === (v % 2) && !emis) {
      const by = f[1] - fh * 0.24;
      g.fillStyle = 'rgba(60,45,35,.5)'; g.fillRect(W * 0.08, by + fh * 0.2, W * 0.84, 6);
      g.strokeStyle = '#3a2c24'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(W * 0.08, by); g.lineTo(W * 0.92, by); g.stroke();
      for (let x = W * 0.1; x < W * 0.9; x += 10) { g.beginPath(); g.moveTo(x, by); g.lineTo(x, by + fh * 0.2); g.stroke(); }
      for (let p = 0; p < 3; p++) {
        const px = W * (0.18 + p * 0.3);
        g.fillStyle = '#a0522d'; g.fillRect(px - 8, by - 12, 16, 12);
        g.fillStyle = ['#3e8a3a', '#e05a7a', '#2f7a4a'][p]; g.beginPath(); g.arc(px, by - 16, 10, 0, TAU); g.fill();
      }
    }
  });
  // Shopfront: a lit opening full of goods, the shutter half up, a painted board.
  const sy = H * 0.66, sh = H - sy;
  const ox = W * 0.07, ow = W * 0.86;
  if (!emis) {
    const ig = g.createLinearGradient(0, sy, 0, H);
    ig.addColorStop(0, '#ffd690'); ig.addColorStop(1, '#a35a22');
    g.fillStyle = ig; g.fillRect(ox, sy + sh * 0.15, ow, sh * 0.85);
    // Shelves of goods.
    const goodsCols = ['#e23b2e', '#f2b021', '#2e8b57', '#2a6fb5', '#f0e0c0', '#c2185b', '#ff8f00'];
    for (let s = 0; s < 3; s++) {
      const ly = sy + sh * (0.3 + s * 0.22);
      g.fillStyle = '#5a3a22'; g.fillRect(ox + 6, ly, ow - 12, 5);
      for (let x = ox + 10; x < ox + ow - 18; x += 12 + r() * 8) {
        g.fillStyle = goodsCols[(r() * goodsCols.length) | 0];
        const gh = 10 + r() * 16;
        g.fillRect(x, ly - gh, 8 + r() * 6, gh);
      }
    }
    g.fillStyle = 'rgba(40,25,15,.35)'; g.fillRect(ox, H - sh * 0.1, ow, sh * 0.1);
    // Rolled shutter.
    g.fillStyle = '#7d8187'; g.fillRect(ox, sy, ow, sh * 0.16);
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let k = 0; k < 6; k++) g.fillRect(ox, sy + k * sh * 0.027, ow, 2);
    // Pillars.
    g.fillStyle = 'rgba(90,70,55,.55)'; g.fillRect(0, sy - 4, ox, sh + 4); g.fillRect(ox + ow, sy - 4, W - ox - ow, sh + 4);
  } else {
    const ig = g.createLinearGradient(0, sy, 0, H);
    ig.addColorStop(0, '#d89a48'); ig.addColorStop(1, '#4a2410');
    g.fillStyle = ig; g.fillRect(ox, sy + sh * 0.15, ow, sh * 0.85);
  }
  // The board, with the shop name in brass capitals.
  const by0 = H * 0.585, bh = H * 0.065;
  if (!emis) {
    g.fillStyle = boardCols[v % boardCols.length]; g.fillRect(W * 0.04, by0, W * 0.92, bh);
    g.strokeStyle = '#e8c37a'; g.lineWidth = 3; g.strokeRect(W * 0.04 + 4, by0 + 4, W * 0.92 - 8, bh - 8);
  }
  g.font = '700 ' + Math.round(bh * 0.62) + 'px ' + F_MONO;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = emis ? '#8a6a30' : '#ffe6a8';
  g.fillText(name.toUpperCase(), W / 2, by0 + bh / 2 + 1);
}

function facadeTex(v, emis) {
  return canvasTex(320, 512, (g, w, h) => drawFacade(g, w, h, v, emis));
}

function stripeTex() {
  return canvasTex(128, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4ead8' : '#d23a2a'; g.fillRect(i * w / 8, 0, w / 8, h); }
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, h - 10, w, 10);
    speckle(g, w, h, 600, ['rgba(0,0,0,.08)'], 1);
  }, { repeat: true });
}

function sariTex() {
  // Three saris side by side: border, field and pallu, each its own print.
  return canvasTex(384, 256, (g, w, h) => {
    const sets = [['#c2185b', '#ffb300', '#7b1fa2'], ['#00897b', '#ffd54f', '#d84315'], ['#3949ab', '#ff7043', '#fdd835']];
    sets.forEach((c, i) => {
      const x0 = i * 128;
      g.fillStyle = c[0]; g.fillRect(x0, 0, 128, h);
      g.fillStyle = c[1];
      for (let y = 18; y < h; y += 26) for (let x = x0 + 12; x < x0 + 120; x += 22) { g.beginPath(); g.arc(x + (y / 26 % 2) * 11, y, 3.2, 0, TAU); g.fill(); }
      g.fillStyle = c[2]; g.fillRect(x0, h - 40, 128, 40); g.fillRect(x0, 0, 10, h); g.fillRect(x0 + 118, 0, 10, h);
      g.fillStyle = c[1]; g.fillRect(x0, h - 46, 128, 5); g.fillRect(x0 + 10, 0, 3, h); g.fillRect(x0 + 115, 0, 3, h);
      for (let x = x0; x < x0 + 128; x += 12) { g.beginPath(); g.moveTo(x, h - 40); g.lineTo(x + 6, h - 28); g.lineTo(x + 12, h - 40); g.fill(); }
    });
  });
}

function signTex(word, lit) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = lit ? '#ffb736' : '#1a120e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = lit ? '#fff1c8' : '#c9a96e'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.font = '700 54px ' + F_MONO; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = lit ? '#1a0e06' : '#c9a96e'; g.fillText(word, w / 2, h / 2 + 3);
  });
}

function skylineTex() {
  return canvasTex(1024, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = seeded(77);
    // Far row: domes, a clock tower, water tanks and roofs, in violet haze.
    g.fillStyle = 'rgba(150,84,96,.55)';
    for (let x = 0; x < w; x += 30 + r() * 50) { const bh = 60 + r() * 90; g.fillRect(x, h - bh, 34 + r() * 40, bh); }
    g.beginPath(); g.arc(w * 0.36, h - 130, 40, PI, TAU); g.fill(); g.fillRect(w * 0.36 - 40, h - 130, 80, 130);
    g.fillRect(w * 0.36 - 2, h - 186, 4, 18); g.beginPath(); g.arc(w * 0.36, h - 188, 5, 0, TAU); g.fill();
    g.fillRect(w * 0.62, h - 230, 30, 230); g.beginPath(); g.moveTo(w * 0.62 - 6, h - 230); g.lineTo(w * 0.62 + 15, h - 270); g.lineTo(w * 0.62 + 36, h - 230); g.fill();
    g.fillStyle = 'rgba(255,214,140,.9)'; g.beginPath(); g.arc(w * 0.62 + 15, h - 200, 9, 0, TAU); g.fill();
    g.fillStyle = 'rgba(112,60,80,.72)';
    for (let x = 0; x < w; x += 40 + r() * 60) {
      const bh = 30 + r() * 70, bw = 40 + r() * 60;
      g.fillRect(x, h - bh, bw, bh);
      if (r() < 0.4) { g.fillRect(x + bw * 0.3, h - bh - 14, 18, 14); }
      g.fillStyle = 'rgba(255,190,100,.75)';
      for (let k = 0; k < 4; k++) if (r() < 0.5) g.fillRect(x + 6 + r() * (bw - 12), h - bh + 8 + r() * (bh - 16), 4, 5);
      g.fillStyle = 'rgba(112,60,80,.72)';
    }
  });
}

/* ------------------------------------------------------------------ geometry kit */
// Every prop is a handful of primitives baked into one vertex-coloured mesh per
// material, so a scooter is one draw call, not twelve.
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function Kit() { this.b = new Map(); }
Kit.prototype.add = function (mat, geo, col, p, r, s) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  _e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); _q.setFromEuler(_e);
  _m4.compose(_v.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0), _q, _s.set(s ? s[0] : 1, s ? s[1] : 1, s ? s[2] : 1));
  g.applyMatrix4(_m4);
  _c.set(col);
  const n = g.attributes.position.count, ca = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { ca[i * 3] = _c.r; ca[i * 3 + 1] = _c.g; ca[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  if (!this.b.has(mat)) this.b.set(mat, []);
  this.b.get(mat).push(g);
  return this;
};
function mergeGeos(list) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  list.forEach((g) => {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    col.set(g.attributes.color.array, o * 3);
    o += c; g.dispose();
  });
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere();
  return m;
}
Kit.prototype.build = function (shadow) {
  const grp = new THREE.Group();
  this.b.forEach((list, mat) => {
    const m = new THREE.Mesh(mergeGeos(list), mat);
    m.castShadow = shadow !== false && !mat.userData.noShadow; m.receiveShadow = true;
    if (m.castShadow) CASTERS.push(m);
    grp.add(m);
  });
  return grp;
};
Kit.prototype.geometry = function () {
  const all = []; this.b.forEach((list) => list.forEach((g) => all.push(g)));
  return mergeGeos(all);
};

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  sph: new THREE.SphereGeometry(1, 16, 12),
  sph8: new THREE.SphereGeometry(1, 8, 6),
  tor: new THREE.TorusGeometry(1, 0.12, 8, 24),
  cone: new THREE.ConeGeometry(1, 1, 12),
};
const CAPS = new Map();
function cap(r, len) { const k = r + ':' + len; if (!CAPS.has(k)) CAPS.set(k, new THREE.CapsuleGeometry(r, len, 4, 10)); return CAPS.get(k); }

const CASTERS = [];
let M = null;
function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, color: '#ffffff' }, o));
  M = {
    paint: std({ roughness: 0.48, metalness: 0.1 }),
    matte: std({ roughness: 0.9, metalness: 0 }),
    cloth: std({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    metal: std({ roughness: 0.22, metalness: 0.92, envMapIntensity: 1.3 }),
    skin: std({ roughness: 0.62, metalness: 0 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  M.glow.userData.noShadow = true;
}

/* ------------------------------------------------------------------ the 3D stage */
let R3 = null, NO3D = false, FX = null;
const TIERS = [
  { px: 0.5, budget: 130000, shadow: false, map: 512, cheap: true, aniso: 1, lamps: 0, sky: 0, fxScale: 0.5 },
  { px: 0.75, budget: 650000, shadow: true, map: 1024, cheap: false, aniso: 2, lamps: 1, sky: 1, fxScale: 0.75 },
  { px: 0.9, budget: 1200000, shadow: true, map: 1024, cheap: false, aniso: 4, lamps: 2, sky: 1, fxScale: 1 },
  { px: 1, budget: 2100000, shadow: true, map: 2048, cheap: false, aniso: 8, lamps: 3, sky: 1, fxScale: 1 },
];

const SKY_VS = 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uClouds; uniform float uTime;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
  'float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }',
  'void main(){',
  '  vec3 d = normalize(vDir); float h = d.y;',
  '  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, h)); c = mix(c, uTop, smoothstep(0.18, 0.75, h));',
  '  c = mix(c, uGround, smoothstep(0.0, -0.12, h));',
  '  float s = max(dot(d, uSunDir), 0.0);',
  '  c += uSun * (pow(s, 900.0) * 14.0 + pow(s, 40.0) * 0.9 + pow(s, 6.0) * 0.32);',
  '  if (uClouds > 0.5 && h > 0.01) {',
  '    vec2 q = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.01, 0.0);',
  '    float n = vn(q) * 0.55 + vn(q * 2.3) * 0.3 + vn(q * 5.1) * 0.15;',
  '    float cl = smoothstep(0.55, 0.85, n) * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.35, 0.7, h));',
  '    vec3 lit = mix(uMid * 1.4, uSun * 0.9 + uHor * 0.6, pow(s, 3.0));',
  '    c = mix(c, lit, cl * 0.75);',
  '  }',
  '  gl_FragColor = vec4(c, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');

function skyMaterial(P) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(P.top) }, uMid: { value: new THREE.Color(P.mid) }, uHor: { value: new THREE.Color(P.hor) },
      uGround: { value: new THREE.Color(P.ground) }, uSun: { value: new THREE.Color(P.sun) }, uSunDir: { value: new THREE.Vector3(P.sunDir[0], P.sunDir[1], P.sunDir[2]).normalize() },
      uClouds: { value: 1 }, uTime: { value: 0 },
    },
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

const PAL = {
  top: '#2a1f4a', mid: '#a44a5a', hor: '#ff9a52', ground: '#3a2418', sun: '#ffb070', sunDir: [0.07, 0.075, -1],
  fog: '#c0705a', fogD: 0.021, hemiSky: '#ffc49a', hemiGround: '#5a3a3a', hemi: 0.75, key: '#ffb27a', keyI: 2.6, fill: '#8a7ad8', fillI: 0.55,
};

function setup3D(a) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return false; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(PAL.fog, PAL.fogD);
  renderer.setClearColor(PAL.fog);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, PAL.hemi); scene.add(hemi);
  const key = new THREE.DirectionalLight(PAL.key, PAL.keyI);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 80;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(PAL.fill, PAL.fillI); fill.position.set(2, 6, 10); scene.add(fill);
  const lamps = [];
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight('#ffbf6a', 0, 14, 1.6); scene.add(l); lamps.push(l); }
  const deliverLight = new THREE.PointLight('#ffcc66', 0, 9, 1.5); scene.add(deliverLight);
  const skyMat = skyMaterial(PAL);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  // A small environment for the steel tiffins to reflect: the sky plus a few warm lamps.
  let env = null;
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMaterial(PAL)));
    const lm = new THREE.MeshBasicMaterial({ color: '#ffcf8a' });
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1), lm); b.position.set(Math.cos(i) * 20, 6 + (i % 3) * 3, Math.sin(i * 1.7) * 20); b.lookAt(0, 0, 0); es.add(b); }
    env = pm.fromScene(es, 0.03).texture;
    pm.dispose();
  } catch (e) { env = null; }
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  R3 = {
    renderer, scene, camera, hemi, key, fill, lamps, deliverLight, sky, skyMat, env,
    quality: -1, lockQ: false, soft: false, lost: false, fps: 60, qT: 0, qN: 0, qWarm: 0, lastNow: 0,
    cam: new THREE.Vector3(0, 3, 6), look: new THREE.Vector3(0, 1, -8), camInit: false, fov: 60, punch: 0,
  };
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R3.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R3.soft = false; }
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (R3) R3.lost = true; });
  a.canvas.addEventListener('webglcontextrestored', () => { if (R3) R3.lost = false; });
  makeMaterials();
  buildWorld();
  buildHero();
  buildPools();
  FX = createFX(scene);
  return true;
}

function resize3D(a) {
  if (!R3) return;
  const t = TIERS[max(0, R3.quality)];
  const pr = min(a.dpr * t.px, Math.sqrt(t.budget / max(1, a.w * a.h)));
  R3.renderer.setPixelRatio(max(0.35, pr));
  R3.renderer.setSize(a.w, a.h, false);
  R3.camera.aspect = a.w / max(1, a.h); R3.camera.updateProjectionMatrix();
}

const cheapCache = new Map();
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
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const full = o.material.userData.full || o.material;
    const want = t.cheap ? cheapOf(full) : full;
    if (o.material !== want) o.material = want;
  });
  r.renderer.shadowMap.enabled = t.shadow;
  r.key.castShadow = t.shadow;
  if (r.key.shadow.mapSize.x !== t.map) { r.key.shadow.mapSize.set(t.map, t.map); if (r.key.shadow.map) { r.key.shadow.map.dispose(); r.key.shadow.map = null; } }
  r.renderer.shadowMap.type = r.quality >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  r.skyMat.uniforms.uClouds.value = t.sky;
  r.hemi.intensity = PAL.hemi * (t.cheap ? 1.5 : 1);
  r.key.intensity = PAL.keyI * (t.cheap ? 0.75 : 1);
  const an = min(t.aniso, r.renderer.capabilities.getMaxAnisotropy()); TEX_ANISO = an;
  ALL_TEX.forEach((tx) => { if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; } });
  if (FX) FX.scale = t.fxScale;
  r.renderer.shadowMap.needsUpdate = true;
  r.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined && o.isMesh) o.material.needsUpdate = true; });
}
function setQuality(q) {
  if (!R3) return;
  q = clamp(q | 0, 0, 3);
  if (q === R3.quality) return;
  R3.quality = q;
  applyTier(); resize3D(arc);
}
function measureFps(dt) {
  const r = R3;
  if (r.lockQ) return;
  if (r.qWarm < 20) { r.qWarm++; return; }
  r.qT += dt; r.qN++;
  if (r.qT >= 1.5) {
    r.fps = r.qN / r.qT; r.qT = 0; r.qN = 0;
    if (r.fps < 40 && r.quality > 0) { setQuality(r.fps < 18 ? max(0, r.quality - 2) : r.quality - 1); r.qWarm = 10; }
    else if (r.fps > 58 && r.quality < r.qMax) { setQuality(r.quality + 1); r.qMax = r.quality; r.qWarm = 10; }
  }
}

/* ------------------------------------------------------------------ the street */
const W3 = {};
function instanced(geo, mat, n, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.castShadow = !!shadow; m.receiveShadow = true;
  m.frustumCulled = false;
  if (shadow) CASTERS.push(m);
  R3.scene.add(m);
  return m;
}

function buildWorld() {
  const scene = R3.scene;
  // Road, kerbs and pavements are long strips whose textures scroll with the run.
  const roadT = roadTex(); roadT.repeat.set(1, 22);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, 176), new THREE.MeshStandardMaterial({ map: roadT, roughness: 0.92, metalness: 0 }));
  road.rotation.x = -PI / 2; road.position.set(0, 0, NEAR_Z - 88); road.receiveShadow = true; scene.add(road);
  const walkT = walkTex(); walkT.repeat.set(1.2, 55);
  const walkMat = new THREE.MeshStandardMaterial({ map: walkT, roughness: 0.85 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: '#9a8c78', roughness: 0.8 });
  W3.walkT = walkT; W3.roadT = roadT;
  [-1, 1].forEach((sd) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(WALK - RW, 0.16, 176), walkMat);
    w.position.set(sd * (RW + WALK) / 2, 0.08, NEAR_Z - 88); w.receiveShadow = true; scene.add(w);
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 176), kerbMat);
    k.position.set(sd * (RW + 0.09), 0.09, NEAR_Z - 88); k.receiveShadow = true; scene.add(k);
  });
  // Far skyline at the end of the lane, beyond the fog.
  const sk = new THREE.Mesh(new THREE.PlaneGeometry(150, 56), new THREE.MeshBasicMaterial({ map: skylineTex(), transparent: true, fog: false, depthWrite: false }));
  sk.position.set(0, 18, -190); sk.renderOrder = -5; scene.add(sk);

  // Buildings: one instanced body and one instanced facade per shop sign.
  const rr = seeded(42);
  const slots = [];
  const tints = ['#f6d2c0', '#c8e8dc', '#f7e7a8', '#ddd0f2', '#f4c4cf', '#cfe2f2', '#f2dab0', '#e8e0d0', '#b8dcd0', '#f9c9a0'];
  for (let sd = -1; sd <= 1; sd += 2) {
    for (let i = 0; i < NSLOT; i++) {
      slots.push({
        side: sd, i, v: (i * 5 + (sd > 0 ? 3 : 0)) % SHOPS.length,
        h: 8.6 + rr() * 3.4, w: SLOT - 0.25 - rr() * 0.5, d: 7 + rr() * 2, setback: rr() * 0.25,
        tint: tints[(i * 3 + (sd > 0 ? 5 : 0)) % tints.length], tank: rr() < 0.55, crates: rr(), lamp: (i + (sd > 0 ? 1 : 0)) % 3 === 0,
      });
    }
  }
  W3.slots = slots;
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  W3.bodies = instanced(GEO.box, bodyMat, slots.length, true);
  const facGeo = new THREE.PlaneGeometry(1, 1);
  W3.facades = [];
  for (let v = 0; v < SHOPS.length; v++) {
    const mine = slots.filter((s) => s.v === v);
    const mat = new THREE.MeshStandardMaterial({ map: facadeTex(v, false), emissiveMap: facadeTex(v, true), emissive: '#ffffff', emissiveIntensity: 1.25, roughness: 0.85 });
    const im = instanced(facGeo, mat, max(1, mine.length), false);
    im.count = mine.length;
    mine.forEach((s, k) => { s.fIdx = k; s.fMesh = im; im.setColorAt(k, _c.set(s.tint)); });
    W3.facades.push(im);
  }
  slots.forEach((s, k) => W3.bodies.setColorAt(k, _c.set(s.tint).multiplyScalar(0.82)));
  // Awnings: striped, one per shop, in a spread of colours.
  const awnGeo = new THREE.BoxGeometry(1, 0.06, 1);
  const awnMat = new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.8, side: THREE.DoubleSide });
  W3.awnings = instanced(awnGeo, awnMat, slots.length, true);
  const awnCols = ['#ffffff', '#ffd9a0', '#bfe8ff', '#c8f0b0', '#ffc0d8', '#ffe680'];
  slots.forEach((s, k) => W3.awnings.setColorAt(k, _c.set(awnCols[(k * 7) % awnCols.length])));
  // Rooftop water tanks.
  const tank = new Kit();
  tank.add(M.matte, GEO.cyl, '#2a2a2e', [0, 0.6, 0], null, [0.65, 1.2, 0.65]);
  tank.add(M.matte, GEO.cyl, '#1c1c20', [0, 1.25, 0], null, [0.68, 0.08, 0.68]);
  tank.add(M.matte, GEO.box, '#5a4a40', [0, 0.05, 0], null, [1.4, 0.1, 1.4]);
  W3.tanks = instanced(tank.geometry(), M.matte, slots.length, true);
  // Pavement goods: crates, sacks and a basket of produce.
  const crate = new Kit();
  crate.add(M.matte, GEO.box, '#8a5a32', [0, 0.22, 0], null, [0.7, 0.44, 0.5]);
  crate.add(M.matte, GEO.box, '#a06a3a', [0.1, 0.6, 0.05], [0, 0.3, 0], [0.55, 0.32, 0.45]);
  crate.add(M.matte, GEO.sph8, '#d8c098', [-0.65, 0.3, 0.1], null, [0.3, 0.34, 0.26]);
  crate.add(M.matte, GEO.sph8, '#c8a878', [-0.62, 0.62, 0.05], null, [0.24, 0.24, 0.22]);
  crate.add(M.matte, GEO.cyl8, '#6a4a2a', [0.75, 0.2, -0.3], null, [0.28, 0.4, 0.28]);
  for (let k = 0; k < 7; k++) crate.add(M.matte, GEO.sph8, k % 2 ? '#ff8c1a' : '#e8402a', [0.75 + (k % 3 - 1) * 0.12, 0.44 + (k > 3 ? 0.1 : 0), -0.3 + ((k * 7) % 3 - 1) * 0.1], null, [0.09, 0.09, 0.09]);
  W3.crates = instanced(crate.geometry(), M.matte, slots.length, true);
  // Lamp posts, heads that glow, and a halo sprite per head.
  const post = new Kit();
  post.add(M.paint, GEO.cyl8, '#2c3a34', [0, 2.2, 0], null, [0.07, 4.4, 0.07]);
  post.add(M.paint, GEO.cyl8, '#2c3a34', [0, 0.25, 0], null, [0.14, 0.5, 0.14]);
  post.add(M.paint, GEO.box, '#2c3a34', [0.45, 4.3, 0], [0, 0, -0.15], [0.95, 0.06, 0.06]);
  post.add(M.paint, GEO.cone, '#2c3a34', [0.9, 4.2, 0], null, [0.22, 0.2, 0.22]);
  W3.posts = instanced(post.geometry(), M.paint, slots.length, true);
  W3.heads = instanced(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe3a0', toneMapped: false }), slots.length, false);
  // Bunting: triangles strung across the lane, and wires sagging between the roofs.
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.42, 0], 3));
  flagGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  flagGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
  W3.NFLAG = 17; W3.NSTR = 8;
  W3.flags = instanced(flagGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }), W3.NFLAG * W3.NSTR, false);
  const flagCols = ['#ff3d6e', '#ffc21a', '#2ec4b6', '#ff7a1a', '#8a5cff', '#3ad16a', '#ffffff'];
  for (let k = 0; k < W3.NFLAG * W3.NSTR; k++) W3.flags.setColorAt(k, _c.set(flagCols[k % flagCols.length]));
  const wireGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 4); wireGeo.rotateZ(PI / 2);
  W3.wires = instanced(wireGeo, new THREE.MeshBasicMaterial({ color: '#151214' }), W3.NSTR * 2 * 6, false);
  // String lights along the awning fronts.
  W3.NBULB = 7;
  W3.bulbs = instanced(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), slots.length * W3.NBULB, false);
  const bulbCols = ['#ffd27a', '#ff8a5a', '#ffe9b0', '#7affd6', '#ffb0e0'];
  for (let k = 0; k < slots.length * W3.NBULB; k++) W3.bulbs.setColorAt(k, _c.set(bulbCols[k % bulbCols.length]));
  // Kites over the rooftops.
  W3.kites = [];
  const kiteCols = ['#ff3d6e', '#ffc21a', '#2ec4b6', '#8a5cff'];
  for (let i = 0; i < 4; i++) {
    const kg = new THREE.BufferGeometry();
    kg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, 0.45, 0, 0, 0, -0.7, 0, 0, 0.6, 0, 0, -0.7, 0, -0.45, 0, 0], 3));
    kg.computeVertexNormals();
    const km = new THREE.Mesh(kg, new THREE.MeshBasicMaterial({ color: kiteCols[i], side: THREE.DoubleSide, fog: true }));
    km.position.set((i % 2 ? 1 : -1) * (4 + i * 3), 17 + i * 3, -40 - i * 18);
    scene.add(km); W3.kites.push(km);
  }
  W3.inst = [W3.bodies, W3.awnings, W3.tanks, W3.crates, W3.posts, W3.heads, W3.flags, W3.wires, W3.bulbs].concat(W3.facades);
}

const _o3 = new THREE.Object3D();
function placeWorld(scrollM, t) {
  const slots = W3.slots;
  for (let k = 0; k < slots.length; k++) {
    const s = slots[k];
    const along = ((s.i * SLOT - scrollM) % SPAN + SPAN) % SPAN;
    const zc = NEAR_Z - along - SLOT / 2;
    const xf = s.side * (WALK + s.setback);
    // Body
    _o3.position.set(s.side * (WALK + s.setback + s.d / 2), s.h / 2, zc); _o3.rotation.set(0, 0, 0); _o3.scale.set(s.d, s.h, s.w);
    _o3.updateMatrix(); W3.bodies.setMatrixAt(k, _o3.matrix);
    // Facade faces the lane.
    _o3.position.set(xf - s.side * 0.02, s.h / 2, zc); _o3.rotation.set(0, -s.side * PI / 2, 0); _o3.scale.set(s.w, s.h, 1);
    _o3.updateMatrix(); s.fMesh.setMatrixAt(s.fIdx, _o3.matrix);
    // Awning, sloping down towards the lane.
    _o3.position.set(xf - s.side * 0.75, s.h * 0.33, zc); _o3.rotation.set(0, 0, s.side * 0.32); _o3.scale.set(1.6, 1, s.w * 0.92);
    _o3.updateMatrix(); W3.awnings.setMatrixAt(k, _o3.matrix);
    // Water tank on the roof.
    _o3.position.set(s.side * (WALK + s.setback + 2.4), s.tank ? s.h : -20, zc + 0.8); _o3.rotation.set(0, 0, 0); _o3.scale.set(1, 1, 1);
    _o3.updateMatrix(); W3.tanks.setMatrixAt(k, _o3.matrix);
    // Goods on the pavement.
    _o3.position.set(s.side * (WALK - 0.55), 0.16, zc + (s.crates - 0.5) * 3); _o3.rotation.set(0, s.crates * 6, 0); _o3.scale.set(1, 1, 1);
    _o3.updateMatrix(); W3.crates.setMatrixAt(k, _o3.matrix);
    // Lamp post every third shop.
    const lx = s.side * (RW + 0.35);
    _o3.position.set(lx, s.lamp ? 0 : -40, zc - 2.2); _o3.rotation.set(0, s.side > 0 ? PI : 0, 0); _o3.updateMatrix(); W3.posts.setMatrixAt(k, _o3.matrix);
    _o3.position.set(lx - s.side * 0.9, s.lamp ? 4.06 : -40, zc - 2.2); _o3.rotation.set(0, 0, 0); _o3.updateMatrix(); W3.heads.setMatrixAt(k, _o3.matrix);
    s.zc = zc; s.lampPos = s.lamp ? [lx - s.side * 0.9, 4.0, zc - 2.2] : null;
    // Bulbs along the awning lip.
    const ay = s.h * 0.33 - 0.28, ax = xf - s.side * 1.5;
    for (let b = 0; b < W3.NBULB; b++) {
      const bz = zc - s.w * 0.44 + b * (s.w * 0.88 / (W3.NBULB - 1));
      const sag = -0.12 * sin((b / (W3.NBULB - 1)) * PI);
      _o3.position.set(ax, ay + sag, bz); _o3.updateMatrix(); W3.bulbs.setMatrixAt(k * W3.NBULB + b, _o3.matrix);
    }
  }
  // Bunting strings and wires.
  const sspan = SPAN, gap = sspan / W3.NSTR;
  for (let si = 0; si < W3.NSTR; si++) {
    const along = ((si * gap + 3 - scrollM * 1) % sspan + sspan) % sspan;
    const z = NEAR_Z - along;
    const y0 = 6.3 + (si % 2) * 0.6;
    for (let f = 0; f < W3.NFLAG; f++) {
      const u = f / (W3.NFLAG - 1), x = -WALK + u * WALK * 2;
      const y = y0 - 1.1 * sin(u * PI);
      _o3.position.set(x, y, z); _o3.rotation.set(sin(t * 3 + f * 0.7 + si) * 0.25, 0, 0); _o3.scale.set(1, 1, 1);
      _o3.updateMatrix(); W3.flags.setMatrixAt(si * W3.NFLAG + f, _o3.matrix);
    }
    // Two sagging wires per string, each six straight pieces.
    for (let wi = 0; wi < 2; wi++) {
      const yy = y0 + 1.2 + wi * 0.5, zz = z - 1.4 - wi * 0.9;
      for (let p = 0; p < 6; p++) {
        const u0 = p / 6, u1 = (p + 1) / 6;
        const x0 = -WALK + u0 * WALK * 2, x1 = -WALK + u1 * WALK * 2;
        const y0w = yy - 0.8 * sin(u0 * PI), y1w = yy - 0.8 * sin(u1 * PI);
        const len = Math.hypot(x1 - x0, y1w - y0w);
        _o3.position.set((x0 + x1) / 2, (y0w + y1w) / 2, zz); _o3.rotation.set(0, 0, Math.atan2(y1w - y0w, x1 - x0)); _o3.scale.set(len, 1, 1);
        _o3.updateMatrix(); W3.wires.setMatrixAt((si * 2 + wi) * 6 + p, _o3.matrix);
      }
    }
  }
  for (let i = 0; i < W3.inst.length; i++) W3.inst[i].instanceMatrix.needsUpdate = true;
  // Kites drift and bob far above.
  for (let i = 0; i < W3.kites.length; i++) {
    const k = W3.kites[i];
    k.position.y = 17 + i * 3 + sin(t * 0.7 + i * 2) * 0.8;
    k.rotation.set(0.2, sin(t * 0.5 + i) * 0.3, sin(t * 1.1 + i) * 0.35);
  }
}

/* ------------------------------------------------------------------ the runner */
const HERO = {};
function buildHero() {
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const JACKET = PRIM, JACKET_D = '#c4452a', TROUS = '#2a221e', SKIN = '#8d5b3e', SHOE = '#151210', CAP = '#1a120e';
  // Torso: jacket with a gold hem band, collar and a cross-body strap.
  const torso = new Kit();
  torso.add(M.cloth, cap(0.17, 0.32), JACKET, [0, 0.3, 0], null, [1.12, 1, 0.75]);
  torso.add(M.cloth, GEO.box, JACKET_D, [0, 0.07, 0], null, [0.36, 0.1, 0.24]);
  torso.add(M.paint, GEO.box, GOLD, [0, 0.13, 0], null, [0.37, 0.03, 0.25]);
  torso.add(M.cloth, GEO.box, JACKET_D, [0, 0.55, -0.02], [0.3, 0, 0], [0.24, 0.08, 0.2]);
  torso.add(M.matte, GEO.box, '#3a2a20', [0, 0.32, 0.01], [0, 0, 0.75], [0.05, 0.62, 0.27]);
  torso.add(M.matte, GEO.box, '#3a2a20', [0.16, 0.12, 0.08], null, [0.14, 0.16, 0.1]);
  torso.add(M.cloth, GEO.box, TROUS, [0, -0.02, 0], null, [0.32, 0.12, 0.2]);
  torso.add(M.skin, GEO.cyl8, SKIN, [0, 0.63, 0], null, [0.055, 0.08, 0.055]);
  const tMesh = torso.build(); hips.add(tMesh);
  const head = new THREE.Group(); head.position.set(0, 0.74, 0); hips.add(head);
  const hk = new Kit();
  hk.add(M.skin, GEO.sph, SKIN, [0, 0, 0], null, [0.115, 0.135, 0.12]);
  hk.add(M.skin, GEO.sph8, SKIN, [0, -0.02, -0.11], null, [0.025, 0.035, 0.03]);
  hk.add(M.cloth, GEO.sph, CAP, [0, 0.06, 0.005], null, [0.125, 0.09, 0.13]);
  hk.add(M.cloth, GEO.box, CAP, [0, 0.03, -0.13], [-0.15, 0, 0], [0.2, 0.025, 0.12]);
  hk.add(M.paint, GEO.cyl, GOLD, [0, 0.055, 0.005], null, [0.128, 0.025, 0.133]);
  hk.add(M.matte, GEO.sph8, '#1a0f0a', [0, 0.02, 0.06], null, [0.11, 0.08, 0.08]);
  head.add(hk.build());
  const mkArm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.24, 0.5, 0); hips.add(sh);
    const up = new Kit(); up.add(M.cloth, cap(0.056, 0.2), JACKET, [0, -0.14, 0]);
    up.add(M.cloth, GEO.sph8, JACKET, [0, -0.01, 0], null, [0.068, 0.06, 0.068]);
    sh.add(up.build());
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const lo = new Kit(); lo.add(M.cloth, cap(0.048, 0.16), JACKET, [0, -0.11, 0]);
    lo.add(M.paint, GEO.cyl8, GOLD, [0, -0.2, 0], null, [0.055, 0.025, 0.055]);
    lo.add(M.skin, GEO.sph8, SKIN, [0, -0.27, 0], null, [0.05, 0.06, 0.045]);
    el.add(lo.build());
    return { sh, el };
  };
  const mkLeg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.1, 0, 0); hips.add(hp);
    const th = new Kit(); th.add(M.cloth, cap(0.075, 0.3), TROUS, [0, -0.22, 0]); hp.add(th.build());
    const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
    const sk = new Kit(); sk.add(M.cloth, cap(0.062, 0.3), TROUS, [0, -0.2, 0]);
    sk.add(M.matte, GEO.box, SHOE, [0, -0.43, -0.05], null, [0.11, 0.08, 0.26]);
    sk.add(M.paint, GEO.box, GOLD, [0, -0.47, -0.05], null, [0.115, 0.02, 0.265]);
    kn.add(sk.build());
    return { hp, kn };
  };
  HERO.root = root; HERO.hips = hips; HERO.head = head;
  HERO.armL = mkArm(-1); HERO.armR = mkArm(1); HERO.legL = mkLeg(-1); HERO.legR = mkLeg(1);
  // The carried stack sits in the right hand: up to five small steel carriers.
  const stack = new THREE.Group(); stack.position.set(0.02, -0.3, 0); HERO.armR.el.add(stack); HERO.stackG = stack;
  HERO.stack = [];
  for (let i = 0; i < 5; i++) {
    const k = new Kit();
    k.add(M.metal, GEO.cyl, '#d8dde2', [0, 0, 0], null, [0.12, 0.095, 0.12]);
    k.add(M.metal, GEO.cyl, '#a9b0b8', [0, 0.052, 0], null, [0.126, 0.014, 0.126]);
    k.add(M.paint, GEO.cyl, i % 2 ? WARM : '#e09030', [0, -0.012, 0], null, [0.123, 0.022, 0.123]);
    if (i === 0) { k.add(M.metal, GEO.tor, '#a9b0b8', [0, 0.1, 0], null, [0.07, 0.07, 0.12]); }
    const m = k.build(); m.position.y = -0.1 - i * 0.105; m.visible = false; stack.add(m); HERO.stack.push(m);
  }
  HERO.pose = { lean: 0, hipY: 0.92, thL: 0, thR: 0, knL: 0, knR: 0, shL: 0, shR: 0, elL: 0, elR: 0, roll: 0 };
  HERO.phase = 0;
  R3.scene.add(root);
}

function animHero(dt, real) {
  const P = HERO.pose;
  const air = G.py > 1, sliding = G.slide > 0 && !air;
  HERO.phase += dt * (G.speed / 24);
  const ph = HERO.phase;
  let lean = -0.18, hipY = 0.92 + abs(sin(ph)) * 0.06, thL = sin(ph) * 0.95, thR = -sin(ph) * 0.95;
  let knL = -max(0, sin(ph - 1.4)) * 1.5 - 0.2, knR = -max(0, sin(ph + PI - 1.4)) * 1.5 - 0.2;
  let shL = -sin(ph) * 0.9, shR = 0.15 - sin(ph + PI) * 0.18, elL = 1.1, elR = 0.35, roll = sin(ph) * 0.06;
  if (air) {
    const up = clamp(G.pvy / 720, -1, 1);
    lean = -0.25; hipY = 0.92; thL = 1.05; thR = 0.35 + up * 0.3; knL = -1.6; knR = -0.6 - (1 - up) * 0.6;
    shL = 2.2 - up * 0.4; shR = 1.0; elL = 0.4; elR = 1.1; roll = 0;
  } else if (sliding) {
    lean = 1.08; hipY = 0.34; thL = 1.45; thR = 1.25; knL = -0.15; knR = -0.7; shL = -0.6; shR = 0.5; elL = 0.3; elR = 1.2; roll = 0;
  }
  if (G.hitT > 0) { lean += sin(G.hitT * 30) * 0.25 * G.hitT; roll += 0.3 * G.hitT; }
  const k = 1 - Math.exp(-real * 18);
  P.lean = lerp(P.lean, lean, k); P.hipY = lerp(P.hipY, hipY, k);
  P.thL = lerp(P.thL, thL, k); P.thR = lerp(P.thR, thR, k); P.knL = lerp(P.knL, knL, k); P.knR = lerp(P.knR, knR, k);
  P.shL = lerp(P.shL, shL, k); P.shR = lerp(P.shR, shR, k); P.elL = lerp(P.elL, elL, k); P.elR = lerp(P.elR, elR, k); P.roll = lerp(P.roll, roll, k);
  HERO.hips.position.y = P.hipY; HERO.hips.rotation.set(P.lean, 0, P.roll);
  HERO.head.rotation.x = -P.lean * 0.6;
  HERO.legL.hp.rotation.x = P.thL; HERO.legR.hp.rotation.x = P.thR;
  HERO.legL.kn.rotation.x = P.knL; HERO.legR.kn.rotation.x = P.knR;
  HERO.armL.sh.rotation.set(P.shL, 0, -0.12); HERO.armR.sh.rotation.set(P.shR, 0, G.hold > 0 ? 0.42 : 0.12);
  HERO.stackG.rotation.set(-P.shR - P.elR - P.lean, 0, -(G.hold > 0 ? 0.42 : 0.12) - P.roll);
  HERO.armL.el.rotation.x = P.elL; HERO.armR.el.rotation.x = P.elR;
  HERO.root.position.set(0, G.py * S, -14 * S);
  const blink = G.inv > 0 && !G.attract && !arc.reducedMotion && ((G.t * 16) | 0) % 2 === 1;
  HERO.root.visible = !blink;
  for (let i = 0; i < 5; i++) HERO.stack[i].visible = i < G.hold;
}

/* ------------------------------------------------------------------ obstacles and pickups */
const POOLS = { scooter: [], cart: [], cloth: [], tiffin: [], door: [] };
let SARI = null, SIGN_DOOR = null, SIGN_DROP = null;
const RING_GEO = new THREE.RingGeometry(0.3, 0.55, 32);

function makeScooter(col) {
  const k = new Kit();
  const BODY = col, DARK = '#1a1816', TYRE = '#121110', CHROME = '#c8ccd0';
  k.add(M.paint, GEO.box, '#2a2622', [0, 0.27, 0], null, [0.34, 0.06, 0.66]);
  k.add(M.paint, GEO.box, BODY, [0, 0.58, -0.4], [-0.22, 0, 0], [0.44, 0.62, 0.07]);
  k.add(M.paint, GEO.sph, BODY, [0, 0.5, -0.44], null, [0.23, 0.33, 0.1]);
  k.add(M.paint, GEO.sph, BODY, [0, 0.5, 0.36], null, [0.24, 0.27, 0.45]);
  k.add(M.paint, GEO.box, BODY, [0, 0.36, 0.36], null, [0.4, 0.2, 0.6]);
  k.add(M.matte, GEO.box, '#3a2620', [0, 0.78, 0.3], null, [0.3, 0.1, 0.56]);
  k.add(M.paint, GEO.cyl8, DARK, [0, 0.86, -0.5], [-0.3, 0, 0], [0.04, 0.5, 0.04]);
  k.add(M.paint, GEO.box, BODY, [0, 1.05, -0.56], null, [0.2, 0.14, 0.14]);
  k.add(M.metal, GEO.cyl8, CHROME, [0, 1.08, -0.56], [0, 0, PI / 2], [0.022, 0.66, 0.022]);
  k.add(M.matte, GEO.cyl8, DARK, [0.31, 1.08, -0.56], [0, 0, PI / 2], [0.03, 0.1, 0.03]);
  k.add(M.matte, GEO.cyl8, DARK, [-0.31, 1.08, -0.56], [0, 0, PI / 2], [0.03, 0.1, 0.03]);
  k.add(M.metal, GEO.cyl8, CHROME, [0.24, 1.22, -0.55], null, [0.012, 0.28, 0.012]);
  k.add(M.metal, GEO.sph8, CHROME, [0.24, 1.37, -0.55], null, [0.06, 0.04, 0.02]);
  k.add(M.glow, GEO.sph, '#fff2c8', [0, 1.02, -0.64], null, [0.07, 0.07, 0.03]);
  k.add(M.glow, GEO.box, '#ff3a2a', [0, 0.52, 0.8], null, [0.16, 0.06, 0.03]);
  [[-0.58], [0.5]].forEach((z) => {
    k.add(M.matte, GEO.cyl, TYRE, [0, 0.2, z[0]], [0, 0, PI / 2], [0.2, 0.11, 0.2]);
    k.add(M.metal, GEO.cyl, CHROME, [0, 0.2, z[0]], [0, 0, PI / 2], [0.1, 0.12, 0.1]);
  });
  k.add(M.paint, GEO.box, BODY, [0, 0.42, -0.58], null, [0.16, 0.05, 0.36]);
  k.add(M.metal, GEO.cyl8, CHROME, [0.12, 0.18, 0.5], [PI / 2, 0, 0], [0.03, 0.4, 0.03]);
  const g = k.build(); g.userData.kind = 'scooter';
  return g;
}

function makeCart() {
  const k = new Kit();
  const WOOD = '#8a5a30', WOOD_D = '#5a3a20';
  k.add(M.matte, GEO.box, WOOD, [0, 0.62, 0], null, [2.0, 0.08, 1.0]);
  k.add(M.matte, GEO.box, WOOD_D, [0, 0.72, 0.49], null, [2.0, 0.14, 0.04]);
  k.add(M.matte, GEO.box, WOOD_D, [0, 0.72, -0.49], null, [2.0, 0.14, 0.04]);
  k.add(M.matte, GEO.box, WOOD_D, [0.98, 0.72, 0], null, [0.04, 0.14, 1.0]);
  k.add(M.matte, GEO.box, WOOD_D, [-0.98, 0.72, 0], null, [0.04, 0.14, 1.0]);
  k.add(M.matte, GEO.cyl8, WOOD_D, [1.35, 0.68, 0.38], [0, 0, PI / 2 - 0.1], [0.03, 1.0, 0.03]);
  k.add(M.matte, GEO.cyl8, WOOD_D, [1.35, 0.68, -0.38], [0, 0, PI / 2 - 0.1], [0.03, 1.0, 0.03]);
  k.add(M.matte, GEO.cyl8, WOOD_D, [-0.85, 0.3, 0.38], null, [0.03, 0.6, 0.03]);
  k.add(M.matte, GEO.cyl8, WOOD_D, [-0.85, 0.3, -0.38], null, [0.03, 0.6, 0.03]);
  // Big spoked wheels.
  [0.56, -0.56].forEach((z) => {
    k.add(M.matte, GEO.tor, '#2a1a10', [0.25, 0.42, z], null, [0.42, 0.42, 0.35]);
    k.add(M.matte, GEO.cyl8, WOOD_D, [0.25, 0.42, z], [PI / 2, 0, 0], [0.06, 0.1, 0.06]);
    for (let s = 0; s < 6; s++) k.add(M.matte, GEO.box, WOOD, [0.25, 0.42, z], [0, 0, s * PI / 6], [0.8, 0.025, 0.02]);
  });
  // A pyramid of produce and baskets.
  const fruit = ['#ff8a1a', '#ffb020', '#e8402a', '#7ab030', '#f2d22a'];
  for (let x = 0; x < 6; x++) for (let z = 0; z < 3; z++) k.add(M.paint, GEO.sph8, fruit[(x + z) % fruit.length], [-0.75 + x * 0.3, 0.76, -0.3 + z * 0.3], null, [0.13, 0.12, 0.13]);
  for (let x = 0; x < 4; x++) for (let z = 0; z < 2; z++) k.add(M.paint, GEO.sph8, fruit[(x + z + 2) % fruit.length], [-0.45 + x * 0.3, 0.95, -0.15 + z * 0.3], null, [0.13, 0.12, 0.13]);
  k.add(M.matte, GEO.cyl, '#b8864a', [0.75, 0.86, 0.22], null, [0.2, 0.22, 0.2]);
  for (let i = 0; i < 4; i++) k.add(M.paint, cap(0.035, 0.14), '#f2d22a', [0.7 + i * 0.04, 1.02, 0.18 + i * 0.03], [0.6, i * 0.5, 1.1]);
  k.add(M.cloth, GEO.box, '#2e8a6a', [0, 0.69, 0], null, [2.02, 0.03, 1.02]);
  const g = k.build(); g.userData.kind = 'cart';
  return g;
}

function makeCloth(variant) {
  const grp = new THREE.Group();
  const k = new Kit();
  const BAMBOO = '#b89a5a';
  [-1, 1].forEach((sd) => {
    k.add(M.matte, GEO.cyl8, BAMBOO, [sd * 3.0, 1.75, 0], null, [0.06, 3.5, 0.06]);
    for (let n = 0; n < 4; n++) k.add(M.matte, GEO.cyl8, '#8a6a3a', [sd * 3.0, 0.5 + n * 0.9, 0], null, [0.068, 0.04, 0.068]);
    k.add(M.matte, GEO.cyl8, '#5a4a3a', [sd * 3.0, 0.1, 0], null, [0.2, 0.2, 0.2]);
  });
  // Rope sagging between the poles.
  for (let p = 0; p < 8; p++) {
    const x0 = -3 + p * 0.75, x1 = x0 + 0.75;
    const y0 = 3.05 - 0.18 * sin((p / 8) * PI), y1 = 3.05 - 0.18 * sin(((p + 1) / 8) * PI);
    k.add(M.matte, GEO.cyl8, '#e8d8b0', [(x0 + x1) / 2, (y0 + y1) / 2, 0], [0, 0, PI / 2 + Math.atan2(y1 - y0, x1 - x0)], [0.018, Math.hypot(x1 - x0, y1 - y0), 0.018]);
  }
  grp.add(k.build());
  const mat = new THREE.MeshStandardMaterial({ map: SARI, roughness: 0.9, side: THREE.DoubleSide });
  const panels = [];
  const xs = [-2.1, -0.75, 0.6, 1.95];
  for (let i = 0; i < 4; i++) {
    const w = 1.15, h = 1.7;
    const geo = new THREE.PlaneGeometry(w, h, 6, 8);
    geo.translate(0, -h / 2, 0);
    // Soft folds, and the panel's own sari from the atlas.
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const col = (i + variant) % 3;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v);
      pos.setZ(v, sin(x * 9 + i) * 0.05 * (0.4 - y / h));
      uv.setX(v, (col + uv.getX(v)) / 3);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    const sag = 3.05 - 0.18 * sin(((xs[i] + 3) / 6) * PI);
    m.position.set(xs[i], sag, 0); m.castShadow = true; m.receiveShadow = true; CASTERS.push(m);
    grp.add(m); panels.push(m);
  }
  grp.userData.kind = 'cloth'; grp.userData.panels = panels;
  return grp;
}

function makeTiffin() {
  const grp = new THREE.Group();
  const k = new Kit();
  const STEEL = '#dfe4e8', STEEL_D = '#9aa2aa';
  for (let i = 0; i < 3; i++) {
    k.add(M.metal, GEO.cyl, STEEL, [0, i * 0.15, 0], null, [0.17, 0.13, 0.17]);
    k.add(M.metal, GEO.cyl, STEEL_D, [0, i * 0.15 + 0.07, 0], null, [0.178, 0.018, 0.178]);
  }
  k.add(M.metal, GEO.cyl, STEEL, [0, 0.4, 0], null, [0.15, 0.04, 0.15]);
  k.add(M.metal, GEO.box, STEEL_D, [0.19, 0.2, 0], null, [0.02, 0.48, 0.05]);
  k.add(M.metal, GEO.box, STEEL_D, [-0.19, 0.2, 0], null, [0.02, 0.48, 0.05]);
  k.add(M.metal, GEO.tor, STEEL_D, [0, 0.48, 0], null, [0.19, 0.19, 0.25]);
  k.add(M.paint, GEO.cyl, '#e0602a', [0, 0.15, 0], null, [0.172, 0.025, 0.172]);
  const body = k.build(); grp.add(body);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffb736', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(RING_GEO, ringMat); ring.rotation.x = -PI / 2; grp.add(ring);
  grp.userData.kind = 'tiffin'; grp.userData.body = body; grp.userData.ring = ring;
  return grp;
}

function makeDoor() {
  const grp = new THREE.Group();
  const k = new Kit();
  const PILLAR = '#c97a3a', BASE = '#6a3a22', CREAM = '#f4e2c0';
  [-1, 1].forEach((sd) => {
    k.add(M.paint, GEO.box, PILLAR, [sd * 1.7, 1.45, 0], null, [0.32, 2.9, 0.32]);
    k.add(M.paint, GEO.box, BASE, [sd * 1.7, 0.2, 0], null, [0.44, 0.4, 0.44]);
    k.add(M.paint, GEO.box, CREAM, [sd * 1.7, 2.9, 0], null, [0.44, 0.14, 0.44]);
    k.add(M.paint, GEO.sph8, '#e8b04a', [sd * 1.7, 3.66, 0], null, [0.14, 0.18, 0.14]);
    // Marigold strings hanging down each pillar.
    for (let i = 0; i < 9; i++) k.add(M.cloth, GEO.sph8, i % 2 ? '#ff9a1a' : '#ffcc1a', [sd * 1.5, 2.85 - i * 0.2, 0.18], null, [0.07, 0.07, 0.07]);
  });
  k.add(M.paint, GEO.box, PILLAR, [0, 3.2, 0], null, [3.9, 0.4, 0.38]);
  k.add(M.paint, GEO.box, CREAM, [0, 3.45, 0], null, [4.1, 0.12, 0.44]);
  // A scalloped arch under the lintel and the toran across it.
  for (let i = 0; i < 7; i++) k.add(M.paint, GEO.cyl, CREAM, [-1.32 + i * 0.44, 2.98, 0], [PI / 2, 0, 0], [0.2, 0.36, 0.2]);
  for (let i = 0; i < 21; i++) {
    const u = i / 20, x = -1.55 + u * 3.1, y = 2.62 - 0.32 * sin(u * PI);
    k.add(M.cloth, GEO.sph8, i % 2 ? '#ff8a00' : '#ffd21a', [x, y, 0.22], null, [0.075, 0.075, 0.075]);
    if (i % 3 === 0) k.add(M.cloth, GEO.cone, '#3a8a2a', [x, y - 0.16, 0.22], [PI, 0, 0], [0.06, 0.2, 0.02]);
  }
  grp.add(k.build());
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.48), new THREE.MeshBasicMaterial({ map: SIGN_DOOR, toneMapped: false }));
  sign.position.set(0, 3.2, 0.2); grp.add(sign);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshBasicMaterial({ color: '#ffb736', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  mat.rotation.x = -PI / 2; mat.position.y = 0.03; grp.add(mat);
  grp.userData.kind = 'door'; grp.userData.sign = sign; grp.userData.mat = mat;
  return grp;
}

function buildPools() {
  SARI = sariTex(); SIGN_DOOR = signTex('DOOR', false); SIGN_DROP = signTex('DROP', true);
  const scooterCols = ['#2f8fb7', '#d64545', '#e8d9b0', '#5e9a3a', '#d98a1a'];
  for (let i = 0; i < 5; i++) POOLS.scooter.push(makeScooter(scooterCols[i]));
  for (let i = 0; i < 3; i++) POOLS.cart.push(makeCart());
  for (let i = 0; i < 3; i++) POOLS.cloth.push(makeCloth(i));
  for (let i = 0; i < 5; i++) POOLS.tiffin.push(makeTiffin());
  for (let i = 0; i < 3; i++) POOLS.door.push(makeDoor());
  Object.keys(POOLS).forEach((k) => POOLS[k].forEach((g) => { g.visible = false; g.userData.free = true; R3.scene.add(g); }));
}
function takeVis(kind) {
  const pool = POOLS[kind];
  for (let i = 0; i < pool.length; i++) if (pool[i].userData.free) { pool[i].userData.free = false; pool[i].visible = true; return pool[i]; }
  return null;
}
function releaseVis(o) {
  if (o && o.vis) { o.vis.userData.free = true; o.vis.visible = false; o.vis = null; }
}

function placeObjs(t) {
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i];
    if (o.dead) continue;
    if (!o.vis) o.vis = takeVis(o.kind);
    const v = o.vis; if (!v) continue;
    const z = objZ(o);
    v.position.set(0, 0, z);
    if (o.kind === 'scooter') v.rotation.set(0, PI / 2 + o.yaw, 0);
    else if (o.kind === 'cart') v.rotation.set(0, o.yaw, 0);
    else if (o.kind === 'cloth') {
      const p = v.userData.panels;
      for (let k = 0; k < p.length; k++) p[k].rotation.x = sin(t * 2.4 + (o.sway || 0) + k * 1.3) * 0.12;
    } else if (o.kind === 'tiffin') {
      const bob = abs(sin(t * 4 + (o.bob || 0))) * 0.22;
      v.userData.body.position.y = 0.35 + bob; v.userData.body.rotation.y = t * 2.2 + (o.bob || 0);
      const r = v.userData.ring; const pulse = 0.85 + 0.25 * sin(t * 5 + (o.bob || 0));
      r.scale.set(pulse, pulse, pulse); r.material.opacity = 0.45 + 0.2 * sin(t * 5);
      if (FX && rnd() < 0.08) FX.emit(rnd() * 0.5 - 0.25, 0.4 + rnd() * 0.6, z + rnd() * 0.4 - 0.2, 0, 0.8, 0, FX.C.gold, 0.12, 0.7, 'glow', 0);
    } else if (o.kind === 'door') {
      const on = G.hold > 0;
      const sign = v.userData.sign; const want = on ? SIGN_DROP : SIGN_DOOR;
      if (sign.material.map !== want) { sign.material.map = want; sign.material.needsUpdate = true; }
      v.userData.mat.material.opacity = on ? 0.45 + 0.25 * sin(t * 6) : 0;
      if (on && FX && rnd() < 0.2) FX.emit(rnd() * 3 - 1.5, 0.1, z + rnd() - 0.5, 0, 1.2 + rnd(), 0, FX.C.warm, 0.1, 0.9, 'glow', 0);
    }
  }
}

/* ------------------------------------------------------------------ effects */
// Three point-sprite systems: soft glow (additive), dust (normal) and marigold
// petals (hard edged, tumbling). One draw call each, nothing allocated per frame.
const PVS = [
  'attribute float aSize; attribute float aAlpha; attribute vec3 aCol; varying vec3 vCol; varying float vA; uniform float uScale; uniform float uMax;',
  'void main(){ vCol = aCol; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), uMax); gl_Position = projectionMatrix * mv; }',
].join('\n');
const PFS = [
  'varying vec3 vCol; varying float vA; uniform float uHard;',
  'void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q);',
  '  float a = uHard > 0.5 ? (1.0 - smoothstep(0.38, 0.5, d)) : pow(max(0.0, 1.0 - d * 2.0), 1.6);',
  '  if (a * vA < 0.01) discard;',
  '  gl_FragColor = vec4(vCol, a * vA);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');
function createFX(scene) {
  const mk = (n, blending, hard) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 }, uMax: { value: 64 }, uHard: { value: hard ? 1 : 0 } }, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, blending });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
    const P = [];
    for (let i = 0; i < n; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, size: 0.1, grow: 0, drag: 0, grav: 0, spin: 0 });
    return { n, geo, mat, pts, P, pos, col, size, alpha, head: 0 };
  };
  const sys = { glow: mk(260, THREE.AdditiveBlending, false), dust: mk(220, THREE.NormalBlending, false), petal: mk(200, THREE.NormalBlending, true) };
  const C = {
    gold: new THREE.Color('#ffc24a'), warm: new THREE.Color('#ff9a3a'), prim: new THREE.Color(PRIM), dust: new THREE.Color('#b89c7a'),
    petal: new THREE.Color('#ff9a1a'), steel: new THREE.Color('#dfe4e8'), white: new THREE.Color('#fff4dc'),
  };
  const petalCols = ['#ff8a00', '#ffcc1a', '#ff5a1a', '#ffe680', '#e8402a'].map((c) => new THREE.Color(c));
  // Floating dust motes in the low sun, and the bulbs' halos.
  const motes = mk(70, THREE.AdditiveBlending, false);
  for (let i = 0; i < motes.n; i++) { const p = motes.P[i]; p.x = (rnd() - 0.5) * 9; p.y = 0.5 + rnd() * 5; p.z = -rnd() * 40; p.r = 1; p.g = 0.8; p.b = 0.55; p.size = 0.04 + rnd() * 0.05; p.seed = rnd() * TAU; }
  const halos = mk(W3.slots.length * W3.NBULB + W3.slots.length, THREE.AdditiveBlending, false);
  const fx = {
    C, scale: 1, sys, motes, halos,
    emit(x, y, z, vx, vy, vz, c, size, life, kind, grav) {
      const s = sys[kind] || sys.glow;
      const p = s.P[s.head]; s.head = (s.head + 1) % s.n;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.r = c.r; p.g = c.g; p.b = c.b;
      p.size = size; p.life = life; p.max = life; p.grav = grav || 0; p.drag = kind === 'dust' ? 2.2 : kind === 'petal' ? 1.4 : 1.2; p.grow = kind === 'dust' ? 1.6 : 0;
      p.spin = kind === 'petal' ? rnd() * TAU : 0;
    },
    burst(x, y, z, n, c, spd, kind) {
      n = Math.max(1, Math.round(n * this.scale));
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, e = (rnd() - 0.3) * PI * 0.6, sp = spd * (0.3 + rnd() * 0.7);
        let cc = c;
        if (kind === 'petal') cc = petalCols[(rnd() * petalCols.length) | 0];
        this.emit(x, y, z, cos(a) * cos(e) * sp, abs(sin(e)) * sp + (kind === 'petal' ? 2 : 0.6), sin(a) * cos(e) * sp, cc,
          kind === 'dust' ? 0.25 + rnd() * 0.25 : kind === 'petal' ? 0.09 + rnd() * 0.05 : 0.08 + rnd() * 0.1,
          kind === 'petal' ? 1.4 + rnd() * 0.9 : 0.4 + rnd() * 0.5, kind, kind === 'spark' ? 9 : kind === 'petal' ? 2.6 : kind === 'dust' ? -0.4 : 1.5);
      }
    },
    ring(x, y, z, c) {
      const n = Math.round(22 * this.scale);
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.emit(x + cos(a) * 0.3, y, z + sin(a) * 0.3, cos(a) * 3.2, 0.2, sin(a) * 3.2, c, 0.12, 0.45, 'glow', 0); }
    },
    clear() { [sys.glow, sys.dust, sys.petal].forEach((s) => s.P.forEach((p) => { p.life = 0; })); },
    step(dt, scroll, t, camera, r) {
      const scale = r.domElement.height / (2 * Math.tan((camera.fov * PI / 180) / 2));
      const pr = r.getPixelRatio();
      [sys.glow, sys.dust, sys.petal, motes, halos].forEach((s) => { s.mat.uniforms.uScale.value = scale; s.mat.uniforms.uMax.value = (s === halos ? 150 : s === sys.dust ? 90 : 34) * pr; });
      [sys.glow, sys.dust, sys.petal].forEach((s) => {
        for (let i = 0; i < s.n; i++) {
          const p = s.P[i];
          if (p.life <= 0) { s.alpha[i] = 0; continue; }
          p.life -= dt;
          const dr = Math.exp(-p.drag * dt);
          p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt;
          if (s === sys.petal) { p.spin += dt * 6; p.vx += sin(p.spin) * dt * 1.5; if (p.y < 0.03) { p.y = 0.03; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; } }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt + scroll;
          p.size += p.grow * dt;
          const k = clamp(p.life / p.max, 0, 1);
          s.pos[i * 3] = p.x; s.pos[i * 3 + 1] = p.y; s.pos[i * 3 + 2] = p.z;
          s.col[i * 3] = p.r; s.col[i * 3 + 1] = p.g; s.col[i * 3 + 2] = p.b;
          s.size[i] = p.size * (s === sys.petal ? 0.8 + 0.4 * abs(sin(p.spin)) : 1);
          s.alpha[i] = s === sys.dust ? k * 0.55 : s === sys.petal ? min(1, k * 3) : k;
        }
        s.geo.attributes.position.needsUpdate = true; s.geo.attributes.aCol.needsUpdate = true; s.geo.attributes.aSize.needsUpdate = true; s.geo.attributes.aAlpha.needsUpdate = true;
      });
      for (let i = 0; i < motes.n; i++) {
        const p = motes.P[i];
        p.z += scroll * 0.6; if (p.z > 6) { p.z -= 46; p.x = (rnd() - 0.5) * 9; }
        motes.pos[i * 3] = p.x + sin(t * 0.6 + p.seed) * 0.3; motes.pos[i * 3 + 1] = p.y + sin(t * 0.9 + p.seed * 2) * 0.2; motes.pos[i * 3 + 2] = p.z;
        motes.col[i * 3] = 1; motes.col[i * 3 + 1] = 0.72; motes.col[i * 3 + 2] = 0.45;
        motes.size[i] = p.size; motes.alpha[i] = 0.35 + 0.3 * sin(t * 2 + p.seed);
      }
      motes.geo.attributes.position.needsUpdate = true; motes.geo.attributes.aCol.needsUpdate = true; motes.geo.attributes.aSize.needsUpdate = true; motes.geo.attributes.aAlpha.needsUpdate = true;
    },
  };
  return fx;
}

// Halos around every bulb and lamp head, written once a frame from the street layout.
function placeHalos(t) {
  const h = FX.halos, slots = W3.slots;
  const bc = W3.bulbs.instanceColor.array;
  let n = 0;
  for (let k = 0; k < slots.length; k++) {
    const s = slots[k];
    const ay = s.h * 0.33 - 0.28, ax = s.side * (WALK + s.setback) - s.side * 1.5;
    for (let b = 0; b < W3.NBULB; b++) {
      const bz = s.zc - s.w * 0.44 + b * (s.w * 0.88 / (W3.NBULB - 1));
      const ci = (k * W3.NBULB + b) * 3;
      h.pos[n * 3] = ax; h.pos[n * 3 + 1] = ay - 0.12 * sin((b / (W3.NBULB - 1)) * PI); h.pos[n * 3 + 2] = bz;
      h.col[n * 3] = bc[ci]; h.col[n * 3 + 1] = bc[ci + 1]; h.col[n * 3 + 2] = bc[ci + 2];
      h.size[n] = 0.5; h.alpha[n] = 0.42 + 0.12 * sin(t * 3 + b + k); n++;
    }
    if (s.lampPos) {
      h.pos[n * 3] = s.lampPos[0]; h.pos[n * 3 + 1] = s.lampPos[1]; h.pos[n * 3 + 2] = s.lampPos[2];
      h.col[n * 3] = 1; h.col[n * 3 + 1] = 0.75; h.col[n * 3 + 2] = 0.4; h.size[n] = 2.2; h.alpha[n] = 0.55; n++;
    }
  }
  for (let i = n; i < h.n; i++) h.alpha[i] = 0;
  h.geo.attributes.position.needsUpdate = true; h.geo.attributes.aCol.needsUpdate = true; h.geo.attributes.aSize.needsUpdate = true; h.geo.attributes.aAlpha.needsUpdate = true;
}

/* ------------------------------------------------------------------ frame: camera, lights, draw */
const _look = new THREE.Vector3(), _camT = new THREE.Vector3(), _proj = new THREE.Vector3();
function renderScene(dtReal, a) {
  const r = R3, cam = r.camera, t = G.t;
  const scrollM = G.dist * S;
  const scrollStep = r.lastScroll == null ? 0 : max(0, scrollM - r.lastScroll);
  r.lastScroll = scrollM;
  W3.roadT.offset.y = scrollM / (176 / 22);
  W3.walkT.offset.y = scrollM / (176 / 55);
  placeWorld(scrollM, t);
  placeObjs(t);
  animHero(a.state === 'pause' ? 0 : dtReal * (G.slowT > 0 && !a.reducedMotion ? 0.42 : 1), dtReal);
  G.hitT = max(0, G.hitT - dtReal); G.landT = max(0, G.landT - dtReal * 3); G.deliverT = max(0, G.deliverT - dtReal * 1.6);
  // Footfall dust and slide spray.
  if (a.state !== 'pause' && FX) {
    const lr = r.lastRun == null ? G.run : r.lastRun;
    if (G.py <= 0.01 && G.slide <= 0 && ((G.run * 10) | 0) !== ((lr * 10) | 0)) FX.burst(0, 0.05, -0.2, 2, FX.C.dust, 1.0, 'dust');
    r.lastRun = G.run;
    if (G.slide > 0 && G.py <= 0.01) FX.burst(0, 0.05, -0.6, 2, FX.C.dust, 2.4, 'dust');
  }
  // Camera: behind the runner, higher and wider on a tall phone screen.
  const aspect = a.w / max(1, a.h);
  const port = clamp((1.25 - aspect) / 0.75, 0, 1);
  const rm = a.reducedMotion;
  const spd = clamp((G.speed - 200) / 300, 0, 1);
  const baseFov = lerp(54, 66, port) + spd * 6;
  r.punch = max(0, r.punch - dtReal * 2.5);
  if (G.deliverT > 0.95 && !rm) r.punch = 1;
  const fov = baseFov - (rm ? 0 : r.punch * 5);
  if (abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  const bob = rm ? 0 : sin(HERO.phase * 2) * 0.03 * (G.py <= 0.01 && G.slide <= 0 ? 1 : 0);
  _camT.set(lerp(0.55, 0.3, port), lerp(2.35, 3.0, port) + G.py * S * 0.35 - (G.slide > 0 ? 0.25 : 0) + bob, lerp(4.4, 5.6, port));
  _look.set(0, lerp(1.25, 1.0, port) + G.py * S * 0.45, lerp(-8, -9, port));
  if (!r.camInit) { r.cam.copy(_camT); r.look.copy(_look); r.camInit = true; }
  const kc = 1 - Math.exp(-dtReal * (rm ? 4 : 8));
  r.cam.lerp(_camT, kc); r.look.lerp(_look, kc);
  if (a.state === 'menu') {
    // The attract camera drifts slowly round the runner.
    const s = sin(a.frame * 0.004) * 1.6;
    cam.position.set(r.cam.x + s, r.cam.y + 0.3, r.cam.z + 0.6);
  } else cam.position.copy(r.cam);
  cam.position.x += (a.shakeX || 0) * 0.012; cam.position.y += (a.shakeY || 0) * 0.012;
  cam.lookAt(r.look);
  r.sky.position.copy(cam.position);
  r.skyMat.uniforms.uTime.value = t;
  // The low sun sits at the end of the lane; the key light follows the runner for tight shadows.
  r.key.position.set(3, 8, -30); r.key.target.position.set(0, 0, -6);
  r.key.target.updateMatrixWorld();
  // Point lights borrow the nearest lamp heads ahead.
  const tier = TIERS[max(0, r.quality)];
  let li = 0;
  for (let k = 0; k < W3.slots.length && li < r.lamps.length; k++) {
    const s = W3.slots[k];
    if (s.lampPos && s.zc < 6 && s.zc > -26 && li < tier.lamps) { r.lamps[li].position.set(s.lampPos[0], s.lampPos[1] - 0.2, s.lampPos[2]); r.lamps[li].intensity = 28; li++; }
  }
  for (; li < r.lamps.length; li++) r.lamps[li].intensity = 0;
  r.deliverLight.position.set(0, 1.6, -1.5);
  r.deliverLight.intensity = G.deliverT * 14;
  if (FX) { placeHalos(t); FX.step(a.state === 'pause' ? 0 : dtReal, a.state === 'pause' ? 0 : scrollStep, t, cam, r.renderer); }
  r.renderer.render(r.scene, cam);
}

/* ------------------------------------------------------------------ HUD */
function rr(c, x, y, w, h, r) {
  r = min(r || 6, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function plate(c, x, y, w, h, r) {
  c.fillStyle = 'rgba(15,13,10,.78)'; rr(c, x, y, w, h, r); c.fill();
  c.strokeStyle = 'rgba(201,169,110,.22)'; c.lineWidth = 1; c.stroke();
  c.strokeStyle = 'rgba(251,245,236,.08)'; rr(c, x + 1, y + 1, w - 2, h - 2, max(2, (r || 6) - 1)); c.stroke();
}
function txt(c, s, x, y, size, col, wgt, align, font) {
  c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
  c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
}
function chip(c, x, y, w, h, label, value, valueCol) {
  plate(c, x, y, w, h, 12);
  txt(c, label, x + 14, y + 15, 9, GOLD, 600, 'left', F_MONO);
  txt(c, value, x + 14, y + 38, 22, valueCol || INK, 500, 'left', F_DISP);
}
function drawHUD(c) {
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
  chip(c, pad.left, pad.top, min(148, w / 2 - 64 - pad.left - 8), 56, 'SCORE', String(Math.round(G.score)));
  const mid = G.clock ? (Math.max(0, G.clock | 0) + 's') : (Math.round(G.dist / 40) + ' m');
  plate(c, w / 2 - 64, pad.top, 128, 44, 12);
  txt(c, G.clock ? 'SHIFT' : 'RUN', w / 2, pad.top + 13, 9, GOLD, 600, 'center', F_MONO);
  txt(c, mid, w / 2, pad.top + 30, 18, G.clock && G.clock < 10 ? PRIM : INK, 500, 'center', F_DISP);
  const hx = w - pad.right - 14;
  for (let i = 0; i < G.maxLives; i++) {
    const alive = i < G.lives;
    c.fillStyle = alive ? PRIM : 'rgba(251,245,236,.12)';
    rr(c, hx - 8 - i * 20, pad.top + 14, 14, 16, 3); c.fill();
    if (alive) { c.fillStyle = WARM; c.fillRect(hx - 6 - i * 20, pad.top + 18, 10, 2); }
  }
  if (G.hold > 0) {
    plate(c, pad.left, pad.top + 64, 110, 36, 10);
    txt(c, 'STACK', pad.left + 12, pad.top + 74, 9, GOLD, 600, 'left', F_MONO);
    txt(c, 'x' + G.hold, pad.left + 12, pad.top + 90, 16, WARM, 600, 'left', F_DISP);
    if (G.combo >= 2) txt(c, 'hot', pad.left + 72, pad.top + 82, 10, PRIM, 700, 'left', F_MONO);
  }
}
function drawFloats(c, dt) {
  const cam = R3.camera, w = arc.w, h = arc.h;
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.life -= dt; f.y += dt * 1.1; f.z += (G.speed * S) * dt * (arc.state === 'play' ? 1 : 0);
    if (f.life <= 0) { G.floats.splice(i, 1); continue; }
    _proj.set(f.x, f.y, f.z).project(cam);
    if (_proj.z > 1) continue;
    const sx = (_proj.x * 0.5 + 0.5) * w, sy = (-_proj.y * 0.5 + 0.5) * h;
    const age = f.max - f.life, pop = arc.reducedMotion ? 1 : min(1, age / 0.12) * (1 + 0.35 * max(0, 1 - age / 0.25));
    c.save(); c.globalAlpha = clamp(f.life * 1.6, 0, 1);
    c.translate(sx, sy); c.scale(pop, pop);
    const size = f.big ? 30 : 20;
    c.font = '600 ' + size + 'px ' + F_DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = 'rgba(15,13,10,.65)'; c.strokeText(f.text, 0, 0);
    c.fillStyle = f.col; c.fillText(f.text, 0, 0);
    c.restore();
  }
}
function drawVignette(c, w, h) {
  const v = c.createRadialGradient(w * 0.5, h * 0.45, min(w, h) * 0.35, w * 0.5, h * 0.5, max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(15,13,10,0)'); v.addColorStop(1, 'rgba(15,10,8,.5)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
  if (G.hitT > 0 && !arc.reducedMotion) {
    const k = G.hitT / 0.45;
    const r = c.createRadialGradient(w / 2, h / 2, min(w, h) * 0.2, w / 2, h / 2, max(w, h) * 0.7);
    r.addColorStop(0, 'rgba(255,105,64,0)'); r.addColorStop(1, 'rgba(255,80,40,' + (0.45 * k) + ')');
    c.fillStyle = r; c.fillRect(0, 0, w, h);
  }
  if (G.slowT > 0 && !arc.reducedMotion) {
    c.fillStyle = 'rgba(255,183,54,' + (G.slowT * 0.12) + ')'; c.fillRect(0, 0, w, h);
  }
}
// Speed streaks at the screen edges once the street gets quick (as the 2D game's speed lines).
const STREAKS = [];
for (let i = 0; i < 14; i++) STREAKS.push({ x: rnd(), y: rnd(), len: 40 + rnd() * 70, sp: 0.8 + rnd() * 0.8 });
function drawStreaks(c, w, h, dt) {
  const rush = G.mode === 'rush' || G.speed > 320;
  if ((!rush && G.speed < 300) || G.attract) return;
  const n = rush ? 14 : 7;
  c.save(); c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const s = STREAKS[i];
    s.y += dt * s.sp * (G.speed / 300);
    if (s.y > 1.1) { s.y = -0.1; s.x = rnd(); }
    const side = s.x < 0.5 ? s.x * 0.36 : 0.64 + (s.x - 0.5) * 0.72;
    const x = side * w, y = h * (0.15 + s.y * 0.8);
    const dx = (x - w / 2) * 0.12, dy = s.len;
    c.strokeStyle = rush ? 'rgba(255,150,90,.22)' : 'rgba(251,245,236,.12)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * 0.4, y + dy); c.stroke();
  }
  c.restore();
}
function gestStyle() { return !!(arc && arc.touchMode && arc.touchStyle === 'gesture'); }
function drawTouchHint(c, lines, at) {
  if (!gestStyle() || arc.state !== 'play' || G.attract) return;
  const t = arc.time, life = 5;
  if (t >= life) return;
  const a = arc.reducedMotion ? 1 : clamp(min(t / 0.35, (life - t) / 0.7), 0, 1);
  const w = arc.w, bw = min(w - 32, 340), lh = 19, bh = 20 + lines.length * lh;
  const pad = arc.hudPad ? arc.hudPad() : { bottom: 64 };
  const x = (w - bw) / 2, y = at != null ? at : arc.h - pad.bottom - bh - 14;
  c.save();
  c.globalAlpha = a;
  c.fillStyle = 'rgba(15,13,10,.82)'; rr(c, x, y, bw, bh, 12); c.fill();
  c.strokeStyle = 'rgba(201,169,110,.4)'; c.lineWidth = 1; rr(c, x, y, bw, bh, 12); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((s, i) => {
    c.font = (i ? '500 ' : '700 ') + '13px ' + F_UI;
    c.fillStyle = i ? 'rgba(251,245,236,.86)' : WARM;
    c.fillText(s, w / 2, y + 10 + lh / 2 + i * lh);
  });
  c.restore();
}

function dbg() {
  return {
    phase: G.phase, mode: G.mode, diff: G.diff, dist: Math.round(G.dist), speed: Math.round(G.speed), score: Math.round(G.score),
    lives: G.lives, hold: G.hold, py: +G.py.toFixed(1), slide: +G.slide.toFixed(2),
    objs: G.objs.length, combo: G.combo, attract: !!G.attract, touchActs: G.touchActs, touchStyle: arc.touchStyle,
    gfx: R3 ? { quality: R3.quality, fps: Math.round(R3.fps), calls: R3.renderer.info.render.calls, soft: R3.soft } : null,
  };
}

function showNo3D(a) {
  a.panel({
    eyebrow: 'Tiffin Dash', title: '3D graphics <em>unavailable</em>',
    html: '<p>This browser could not start WebGL, which the 3D version of this game needs. Try another browser or turn on hardware acceleration.</p>',
    actions: [{ label: 'All games', href: '/games', primary: true }],
  });
}

A.create({
  three: true,
  slug: 'tiffin-dash', title: 'Tiffin Dash', genre: 'Arcade runner',
  hint: 'Click or Space jump   Down or click low to slide',
  touchHint: 'Jump pad for scooters, Slide pad for cloth lines',
  keys: [
    ['Space / Up / J', 'Jump the scooters and carts'],
    ['Down / S', 'Slide under hanging cloth'],
  ],
  mouse: { cursor: 'pointer', keys: [['Click', 'Jump'], ['Click the lower street', 'Slide']] },
  touch: { stick: false, pads: [{ label: 'Jump', key: 'Space', big: true, hot: true }, { label: 'Slide', key: 'ArrowDown' }] },
  touchKeys: [['Jump', 'Scooters and carts'], ['Slide', 'Hanging cloth']],
  // Controller: A or right trigger jump, B, X or left trigger slide.
  gamepad: { buttons: ['Space', 'ArrowDown', 'ArrowDown'], rt: 'Space', lt: 'ArrowDown' },
  gestures: {
    drag: false,
    hint: 'Tap or swipe up to jump, swipe down to slide',
    keys: [['Tap / swipe up', 'Jump the scooters and carts'], ['Swipe down', 'Slide under hanging cloth'], ['Swipe down in the air', 'Drop fast']],
  },
  formatScore: (v) => Math.round(v) + ' pts',
  menu: {
    eyebrow: 'Arcade runner',
    title: 'Tiffin <em>Dash</em>',
    html: '<p>A side-street dash with a stack of lunches. Jump the scooters, slide under the cloth lines, pick up tiffins and drop them at the marked doors.</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'street', choices: [{ v: 'street', label: 'Street run' }, { v: 'shift', label: 'Lunch shift' }, { v: 'rush', label: 'Rush hour' }] },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
    ],
  },
  pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Distance<b>' + Math.round(G.dist / 40) + ' m</b></div></div>'; },
  graphics(level) { if (!R3) return; if (level === 'auto') { R3.lockQ = false; R3.qMax = 3; return; } R3.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  resize: (a) => resize3D(a),
  onMenu(a) { arc = a; G.attractReady = false; reset(true); G.attractReady = true; },
  init(a) {
    arc = a; a.debug = dbg; G.D = DIFF.normal;
    a.dev = { get R3() { return R3; }, W3, get FX() { return FX; }, HERO, setQuality: (q) => { if (R3) R3.lockQ = true; setQuality(q); },
      ff: (sec) => { for (let i = 0, n = Math.round(sec * 60); i < n && a.state === 'play'; i++) update(1 / 60); }, G };
    if (!setup3D(a)) { NO3D = true; showNo3D(a); return; }
    R3.qMax = 3;
    setQuality(R3.soft ? 0 : 3); resize3D(a);
    reset(true); G.attractReady = true;
    a.menu(); if (a.showStick) a.showStick(false);
  },
  start(a, ch) {
    if (NO3D) return;
    arc = a; reset(false, ch);
    const label = G.mode === 'shift' ? 'Ninety seconds' : G.mode === 'rush' ? 'Rush hour' : 'Street run';
    arc.toast(label, 'Tiffin Dash', 1400);
  },
  update(dt) { if (!NO3D) update(dt); },
  idle(dt) { if (!NO3D) idle(dt); },
  render(ctx, a) {
    if (NO3D || !R3) return;
    const now = performance.now(), raw = R3.lastNow ? (now - R3.lastNow) / 1000 : 1 / 60, dtReal = clamp(raw, 0.001, 0.1); R3.lastNow = now;
    if (R3.lost || R3.renderer.getContext().isContextLost()) {
      ctx.fillStyle = 'rgba(15,13,10,.9)'; ctx.fillRect(0, 0, a.w, a.h);
      txt(ctx, 'Graphics paused. Restoring...', a.w / 2, a.h / 2, 16, INK, 600, 'center');
      return;
    }
    measureFps(raw);
    renderScene(a.state === 'pause' ? 0 : dtReal, a);
    const w = a.w, h = a.h;
    drawStreaks(ctx, w, h, a.state === 'play' ? dtReal : 0);
    drawVignette(ctx, w, h);
    drawFloats(ctx, a.state === 'pause' ? 0 : dtReal);
    if (a.state === 'play' && !G.attract) drawHUD(ctx);
    drawTouchHint(ctx, ['Tap or swipe up to jump', 'Swipe down to slide under the cloth']);
  },
});
