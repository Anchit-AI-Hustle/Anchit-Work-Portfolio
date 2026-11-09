import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost } from '/games/shared/fx3d.js';

/*
 * Fare Run, in 3D: an auto through a dusk bazaar, three lanes, chase camera.
 * Same rules, modes, scoring and one-finger controls as the 2D game: change
 * lanes, pick up the standing fares, keep the carts and clay pots off the
 * bumper. The rules run on the 2D game's own approach axis (objects slide down
 * towards the auto), and the street is drawn from it.
 */

const A = window.Arcade;
const clamp = A.clamp, lerp = A.lerp;
const PI = Math.PI, TAU = Math.PI * 2;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max;
const rnd = Math.random;
const F_DISP = 'Fraunces, Times New Roman, serif';
const F_UI = 'Inter, sans-serif';
const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';
const SHOPS = ['Chai', 'Spices', 'Lamps', 'Cloth', 'Fruit', 'Bangles', 'Nuts', 'Flowers'];

// The 2D approach axis: objects enter at y -80 and the auto sits at PY. 16 units a metre.
const SF = 1 / 16;
const PY = 640;
const LANE = 2.4;
const RW = 4.4;          // half the road, kerb to kerb
const WALK = 6.6;        // building line
const SLOT = 6.4;
const NSLOT = 16;
const SPAN = SLOT * NSLOT;
const NEAR_Z = 16;

let arc;
const DIFF = {
  easy: { spd: 220, dens: 1.22, fare: 0.48 },
  normal: { spd: 265, dens: 1.05, fare: 0.38 },
  hard: { spd: 330, dens: 0.82, fare: 0.24 },
};
const G = {
  t: 0, dist: 0, speed: 280, score: 0, lives: 3, maxLives: 3, lane: 1, laneT: 1, cool: 0,
  objs: [], floats: [], phase: 'run', attract: true, fares: 0,
  mode: 'bazaar', diff: 'normal', clock: 0, flash: 0, touchActs: 0, laneCool: 0,
  hitT: 0, slowT: 0, riders: [0, 0], steer: 0,
};

/* ------------------------------------------------------------------ game rules (2D units) */
function reset(attract, ch) {
  G.mode = (ch && ch.mode) || G.mode || 'bazaar';
  G.diff = (ch && ch.diff) || G.diff || 'normal';
  G.D = DIFF[G.diff] || DIFF.normal;
  const rush = G.mode === 'rush';
  G.t = 0; G.dist = 0; G.speed = attract ? 180 : G.D.spd * (rush ? 1.18 : 1);
  G.maxLives = rush ? 2 : 3; G.lives = G.maxLives; G.score = 0;
  G.clock = G.mode === 'night' ? 90 : 0;
  G.lane = 1; G.laneT = 1; G.cool = attract ? 0 : 1.2;
  G.objs.forEach(releaseVis);
  G.objs = []; G.floats = []; G.touchActs = 0;
  G.phase = 'run'; G.attract = !!attract; G.fares = 0; G.next = attract ? 400 : 480 * G.D.dens * (rush ? 0.82 : 1);
  G.flash = 0; G.hitT = 0; G.slowT = 0; G.riders[0] = G.riders[1] = 0; G.laneCool = 0;
  if (FX) FX.clear();
  if (R3) applyLook(G.mode);
  if (!attract) G.objs.push({ kind: 'fare', lane: 1, y: -40, h: 36, seed: rnd() });
}

function spawn() {
  const lane = (rnd() * 3) | 0;
  const roll = rnd();
  const fare = (G.D || DIFF.normal).fare;
  const kind = roll < fare ? 'fare' : roll < fare + 0.18 ? 'pot' : 'cart';
  G.objs.push({ kind, lane, y: -80, h: kind === 'fare' ? 36 : 44, seed: rnd(), yaw: (rnd() - 0.5) * 0.3 });
  const dens = (G.D || DIFF.normal).dens * (G.mode === 'rush' ? 0.82 : 1);
  G.next = G.dist + (420 + rnd() * 260 - min(160, G.dist * 0.02)) * dens;
}

function finish(why) {
  if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
  G.phase = 'over';
  arc.haptic(why === 'Night over' ? 'success' : 'fail');
  arc.over({
    eyebrow: why, title: why === 'Night over' ? 'Shift <em>done</em>' : 'Fare <em>cut</em>',
    score: Math.round(G.score), scoreLabel: 'Score',
    html: '<p>' + G.fares + ' fares and ' + Math.round(G.dist / 40) + ' metres through the bazaar.</p>',
    again: 'Drive again',
  });
}

function laneX(l) { return (l - 1) * LANE; }
function objZ(o) { return -((PY - o.y) - 10) * SF; }

function hit(o) {
  G.lives--; G.cool = 0.9; G.flash = 0.2; G.hitT = 0.5;
  if (!arc.reducedMotion) G.slowT = 0.25;
  arc.shake = 8; arc.haptic('heavy', 0.75);
  if (POST) { POST.flash(0.3, '#ffd2b8'); POST.kick(-5); }
  arc.sfx.tone(150, 0.16, { type: 'sawtooth', slide: 80, vol: 0.12 });
  arc.sfx.noise(0.3, { freq: o.kind === 'pot' ? 2400 : 700, vol: 0.2 });
  if (FX) {
    const x = laneX(o.lane), z = objZ(o);
    FX.burst(x, 0.7, z, 26, o.kind === 'pot' ? FX.C.clay : FX.C.wood, 4.5, 'petal');
    FX.burst(x, 0.8, z, 16, FX.C.prim, 4, 'spark');
    FX.burst(x, 0.3, z, 14, FX.C.dust, 2.4, 'dust');
  }
  if (G.lives <= 0) finish('Meter stopped');
  else arc.toast('Watch the lane', G.lives + ' left', 800);
}

function pickUp(o) {
  G.fares++; G.score += 40;
  const x = laneX(o.lane), z = objZ(o);
  if (FX) { FX.burst(x, 1.1, z, 22, FX.C.gold, 3.6, 'glow'); FX.ring(x, 0.06, z, FX.C.warm); FX.burst(x, 1.6, z, 10, FX.C.gold, 2.5, 'petal'); }
  floatScore(x, 2.4, z, '+40', WARM);
  arc.sfx.tone(660, 0.08, { type: 'sine', vol: 0.12 });
  arc.sfx.tone(990, 0.1, { type: 'sine', vol: 0.07, delay: 0.06 });
  arc.toast('Fare on', '+40', 600);
  arc.haptic('tap', 0.55);
  // The fare rides along for a few seconds, then hops off with a tip of light.
  const seat = G.riders[0] <= G.riders[1] ? 0 : 1;
  G.riders[seat] = 6;
}

function floatScore(x, y, z, text, col, big) {
  G.floats.push({ x, y, z, life: 1.1, max: 1.1, text: String(text), col: col || WARM, big: !!big });
}

// One finger: tap the left, middle or right of the screen to take that lane,
// or swipe sideways. A swipe moves one lane once it passes 28 px and one more
// for each further step, so the auto turns while the finger is still moving.
const FG = { t0: -1, steps: 0 };
function touchLane(want) {
  const inp = arc.input, gz = inp.gesture, tp = inp.tap(), sw = inp.swipe();
  const fresh = gz.t0 !== FG.t0;
  if (gz.active) {
    if (fresh) { FG.t0 = gz.t0; FG.steps = 0; }
    const adx = abs(gz.dx);
    if (adx > abs(gz.dy) * 0.8) {
      const step = max(110, arc.w * 0.28);
      const steps = adx < 28 ? 0 : (gz.dx < 0 ? -1 : 1) * (Math.floor((adx - 28) / step) + 1);
      if (steps !== FG.steps) { want = G.lane + (steps - FG.steps); FG.steps = steps; G.touchActs++; }
    }
    return want;
  }
  const moved = !fresh && FG.steps !== 0;
  if (tp) { want = tp.nx < 1 / 3 ? 0 : tp.nx > 2 / 3 ? 2 : 1; G.touchActs++; }
  else if (sw && !moved && (sw.dir === 'left' || sw.dir === 'right')) { want = G.lane + (sw.dir === 'left' ? -1 : 1); G.touchActs++; }
  if (tp || sw) { FG.t0 = gz.t0; FG.steps = 0; }
  return want;
}

function update(dt) {
  if (G.phase === 'over' || G.freeze) return;
  if (G.slowT > 0) { G.slowT = max(0, G.slowT - dt); dt *= 0.4; }
  G.t += dt; G.cool = max(0, G.cool - dt); G.flash = max(0, G.flash - dt);
  if (G.clock) {
    G.clock -= dt;
    if (G.clock <= 0) { G.clock = 0; finish('Night over'); return; }
  }
  const base = (G.D || DIFF.normal).spd * (G.mode === 'rush' ? 1.18 : 1);
  G.speed = min(base + 280, base + G.dist * 0.014);
  G.dist += G.speed * dt; G.score += dt * 10;
  const inp = arc.input, ax = inp.axis(), p = inp.pointer;
  G.laneCool = max(0, (G.laneCool || 0) - dt);
  let want = G.lane;
  if (inp.hit('ArrowLeft', 'KeyA')) want = G.lane - 1;
  if (inp.hit('ArrowRight', 'KeyD')) want = G.lane + 1;
  if (G.laneCool <= 0) {
    if (ax.x < -0.65) { want = G.lane - 1; G.laneCool = 0.16; }
    if (ax.x > 0.65) { want = G.lane + 1; G.laneCool = 0.16; }
  }
  const gest = gestStyle() && p && p.type !== 'mouse';
  if (gest) want = touchLane(want);
  else if (p && p.pressed) want = p.nx < 0.38 ? 0 : p.nx > 0.62 ? 2 : 1;
  want = clamp(want | 0, 0, 2);
  if (want !== G.lane) {
    G.steer = want - G.lane; G.lane = want; arc.sfx.tone(280, 0.05, { type: 'square', vol: 0.06 }); if (!G.attract) arc.haptic('tap', 0.2);
    if (FX) FX.burst(laneX(G.laneT), 0.05, 1.0, 6, FX.C.dust, 1.6, 'dust');
  }
  G.laneT = lerp(G.laneT, G.lane, 1 - Math.exp(-dt * 12));
  if (G.dist > G.next) spawn();
  for (let i = 0; i < 2; i++) if (G.riders[i] > 0) { G.riders[i] -= dt; if (G.riders[i] <= 0 && FX) FX.burst(laneX(G.laneT) + (i ? 0.35 : -0.35), 1.3, 0.6, 12, FX.C.gold, 2, 'glow'); }
  const py = PY;
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i];
    o.y += G.speed * dt * 0.55;
    if (o.dead) continue;
    if (o.y > PY + 300) { o.dead = true; continue; }
    const laneVis = Math.round(G.laneT);
    if (abs(o.lane - laneVis) > 0.2) continue;
    if (o.y > py - 50 && o.y < py + 30 && abs(o.lane - G.laneT) < 0.38) {
      if (o.kind === 'fare') { o.dead = true; pickUp(o); }
      else if (G.cool <= 0 && abs(G.laneT - G.lane) < 0.18) { o.dead = true; hit(o); }
    }
  }
  sweepObjs();
}

function sweepObjs() {
  let j = 0;
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i];
    if (!o.dead && o.y < PY + 300) G.objs[j++] = o;
    else releaseVis(o);
  }
  G.objs.length = j;
}

// The menu's road: the auto weaves for fares and round the carts on its own.
function idle(dt) {
  G.attract = true;
  if (!G.attractReady) { reset(true); G.attractReady = true; }
  G.t += dt; G.dist += 180 * dt; G.speed = 180;
  let best = G.lane, bestD = 1e9;
  const danger = [false, false, false];
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i], d = PY - o.y;
    if (d < -20 || d > 420) continue;
    if (o.kind === 'fare') { if (d < bestD) { bestD = d; best = o.lane; } } else if (d < 260) danger[o.lane] = true;
  }
  let want = best;
  if (danger[want]) { want = [1, 0, 2].find((l) => !danger[l]); if (want == null) want = G.lane; }
  if (danger[G.lane] || bestD < 420) G.lane = want;
  G.laneT = lerp(G.laneT, G.lane, 1 - Math.exp(-dt * 5));
  if (G.dist > G.next) spawn();
  for (let i = 0; i < G.objs.length; i++) {
    const o = G.objs[i];
    o.y += 180 * 0.55 * dt;
    if (o.kind === 'fare' && !o.dead && o.y > PY - 50 && o.y < PY + 30 && abs(o.lane - G.laneT) < 0.38) {
      o.dead = true; G.riders[G.riders[0] <= G.riders[1] ? 0 : 1] = 5;
      if (FX) FX.burst(laneX(o.lane), 1.1, objZ(o), 14, FX.C.gold, 3, 'glow');
    }
  }
  for (let i = 0; i < 2; i++) if (G.riders[i] > 0) G.riders[i] -= dt;
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
    g.fillStyle = '#3f3a36'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 30000, ['#35302c', '#4a443e', '#2a2623', '#55504a', '#3c3632'], 2.2);
    const edge = g.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, 'rgba(150,120,85,.6)'); edge.addColorStop(0.08, 'rgba(150,120,85,0)');
    edge.addColorStop(0.92, 'rgba(150,120,85,0)'); edge.addColorStop(1, 'rgba(150,120,85,.6)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
    // Darker wheel tracks in each lane.
    [0.227, 0.5, 0.773].forEach((c) => { g.fillStyle = 'rgba(15,12,10,.16)'; g.fillRect(w * (c - 0.07), 0, w * 0.04, h); g.fillRect(w * (c + 0.03), 0, w * 0.04, h); });
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i % 2 ? 'rgba(25,22,20,.45)' : 'rgba(90,82,74,.35)';
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 18 + Math.random() * 40, Math.random() * 3, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(18,15,12,.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 40; y += Math.random() * 30; g.lineTo(x, y); }
      g.stroke();
    }
    // Lane dashes between the three lanes, solid edge lines, worn.
    const dash = (x, solid, col) => {
      for (let y = 0; y < h; y += solid ? h : 256) {
        g.fillStyle = col; g.fillRect(x - 5, y + (solid ? 0 : 40), 10, solid ? h : 130);
        g.fillStyle = 'rgba(50,45,40,.4)';
        for (let k = 0; k < (solid ? 300 : 50); k++) g.fillRect(x - 5 + Math.random() * 10, y + Math.random() * (solid ? h : 170), 2, 2);
      }
    };
    dash(w * 0.364, false, 'rgba(250,240,220,.75)'); dash(w * 0.636, false, 'rgba(250,240,220,.75)');
    dash(w * 0.068, true, 'rgba(255,183,54,.6)'); dash(w * 0.932, true, 'rgba(255,183,54,.6)');
    g.fillStyle = 'rgba(15,12,10,.55)'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
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

function plateTex() {
  return canvasTex(128, 48, (g, w, h) => {
    g.fillStyle = '#f6e8b0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a120e'; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
    g.font = '700 26px ' + F_MONO; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1a120e';
    g.fillText('FR 07', w / 2, h / 2 + 2);
  });
}
function coinTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(26, 24, 2, 32, 32, 32);
    gr.addColorStop(0, '#fff3c0'); gr.addColorStop(0.6, '#f0b030'); gr.addColorStop(1, '#a8701a');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 31, 0, TAU); g.fill();
    g.strokeStyle = '#8a5a12'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.stroke();
    // A rupee mark drawn with strokes, so no font is needed for it.
    g.strokeStyle = '#6a420a'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(22, 20); g.lineTo(42, 20); g.moveTo(22, 28); g.lineTo(42, 28);
    g.moveTo(24, 20); g.quadraticCurveTo(40, 21, 34, 32); g.quadraticCurveTo(30, 35, 23, 35); g.lineTo(38, 48); g.stroke();
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
let R3 = null, NO3D = false, FX = null, POST = null;
const TIERS = [
  { px: 0.5, budget: 130000, shadow: false, map: 512, cheap: true, aniso: 1, lamps: 0, sky: 0, fxScale: 0.5 },
  { px: 0.75, budget: 650000, shadow: true, map: 1024, cheap: false, aniso: 2, lamps: 1, sky: 1, fxScale: 0.75 },
  { px: 0.9, budget: 1200000, shadow: true, map: 1024, cheap: false, aniso: 4, lamps: 2, sky: 1, fxScale: 1 },
  { px: 1, budget: 2100000, shadow: true, map: 2048, cheap: false, aniso: 8, lamps: 3, sky: 1, fxScale: 1 },
];
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uClouds; uniform float uTime; uniform float uStars;',
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
  '  if (uStars > 0.5 && h > 0.0) {',
  '    vec2 sp = d.xz / (h + 0.3) * 70.0; vec2 ip = floor(sp); float st = h21(ip);',
  '    if (st > 0.982) { vec2 f = fract(sp) - 0.5; c += vec3(1.0, 0.95, 0.85) * smoothstep(0.14, 0.0, length(f)) * (st - 0.982) * 55.0 * smoothstep(0.03, 0.3, h); }',
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
      uClouds: { value: 1 }, uTime: { value: 0 }, uStars: { value: P.stars || 0 },
    },
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

const LOOKS = {
  dusk: {
    top: '#2a1f4a', mid: '#a44a5a', hor: '#ff9a52', ground: '#3a2418', sun: '#ffb070', sunDir: [-0.12, 0.08, -1], stars: 0,
    fog: '#c0705a', fogD: 0.02, hemiSky: '#ffc49a', hemiGround: '#5a3a3a', hemi: 0.75, key: '#ffb27a', keyI: 2.6, fill: '#8a7ad8', fillI: 0.55,
    keyPos: [-4, 8, -30], emis: 1.2, lamp: 26, head: 1, skyline: 1,
  },
  night: {
    top: '#03050f', mid: '#10142c', hor: '#33284a', ground: '#0c0a10', sun: '#9fb4ff', sunDir: [0.3, 0.32, -1], stars: 1,
    fog: '#1b1a2e', fogD: 0.026, hemiSky: '#43507e', hemiGround: '#14100c', hemi: 0.45, key: '#9ab0e8', keyI: 0.75, fill: '#5a4a8a', fillI: 0.25,
    keyPos: [8, 14, -26], emis: 1.45, lamp: 55, head: 2.4, skyline: 0.55,
  },
};
let PAL = LOOKS.dusk;

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
  buildAuto();
  buildPools();
  FX = createFX(scene);
  // Shared post pass: bloom on the lamps and halos, grade, grain; a swing-in establishing shot at the start.
  POST = createPost(renderer, { arc: a, soft: R3.soft, intro: { yaw: 0.8, up: 0.55 }, results: true, target: (v) => v.set(AUTO.root ? AUTO.root.position.x : 0, 1, 0), look: { vignette: 0.14, bloom: 0.45, threshold: 0.74 } });
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

function applyLook(mode) {
  const L = mode === 'night' ? LOOKS.night : LOOKS.dusk;
  if (PAL === L && R3.lookSet) return;
  PAL = L; R3.lookSet = true;
  const r = R3, u = r.skyMat.uniforms;
  u.uTop.value.set(L.top); u.uMid.value.set(L.mid); u.uHor.value.set(L.hor); u.uGround.value.set(L.ground); u.uSun.value.set(L.sun);
  u.uSunDir.value.set(L.sunDir[0], L.sunDir[1], L.sunDir[2]).normalize(); u.uStars.value = L.stars;
  r.scene.fog.color.set(L.fog); r.scene.fog.density = L.fogD; r.renderer.setClearColor(L.fog);
  r.hemi.color.set(L.hemiSky); r.hemi.groundColor.set(L.hemiGround);
  r.key.color.set(L.key); r.fill.color.set(L.fill); r.fill.intensity = L.fillI;
  const t = TIERS[max(0, r.quality)];
  r.hemi.intensity = L.hemi * (t.cheap ? 1.5 : 1); r.key.intensity = L.keyI * (t.cheap ? 0.75 : 1);
  W3.facades.forEach((m) => { m.material.emissiveIntensity = L.emis; const c = cheapCache.get(m.material); if (c) c.emissiveIntensity = L.emis; });
  W3.skyline.material.opacity = L.skyline;
  r.scene.environmentIntensity = mode === 'night' ? 0.25 : 0.55;
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
  sk.position.set(0, 18, -190); sk.renderOrder = -5; scene.add(sk); W3.skyline = sk;

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
    const y0 = 7.9 + (si % 2) * 0.6;
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

/* ------------------------------------------------------------------ the auto */
const AUTO = {};
const HALF_CYL = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false, -PI / 2, PI);
function wheelKit(r, w) {
  const k = new Kit();
  k.add(M.matte, GEO.cyl, '#121110', [0, 0, 0], [0, 0, PI / 2], [r, w, r]);
  k.add(M.metal, GEO.cyl, '#c8ccd0', [0, 0, 0], [0, 0, PI / 2], [r * 0.5, w * 1.08, r * 0.5]);
  for (let s = 0; s < 5; s++) k.add(M.paint, GEO.box, '#2a2622', [0, 0, 0], [s * PI / 5, 0, 0], [w * 1.12, r * 1.6, 0.03]);
  return k;
}
function buildAuto() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const BODY = '#1f2e26', TRIM = '#f2b81e', CANOPY = '#ee6a2c', CANOPY_D = '#b8461c', CHROME = '#cdd2d6', SEAT = '#5a2a20';
  const k = new Kit();
  // Chassis and the passenger tub.
  k.add(M.paint, GEO.box, '#1a1816', [0, 0.32, 0.2], null, [1.2, 0.1, 2.1]);
  k.add(M.paint, GEO.box, BODY, [0, 0.66, 0.62], null, [1.36, 0.6, 1.1]);
  k.add(M.paint, GEO.box, TRIM, [0, 0.72, 0.62], null, [1.375, 0.08, 1.11]);
  k.add(M.paint, GEO.box, BODY, [0, 0.46, -0.2], null, [1.1, 0.26, 0.8]);
  // The narrow front: nose, front panel and a handlebar inside.
  k.add(M.paint, GEO.sph, BODY, [0, 0.72, -0.95], null, [0.46, 0.5, 0.42]);
  k.add(M.paint, GEO.box, BODY, [0, 0.72, -0.62], null, [0.9, 0.62, 0.5]);
  k.add(M.paint, GEO.box, TRIM, [0, 0.8, -0.88], null, [0.82, 0.07, 0.62]);
  k.add(M.paint, GEO.box, BODY, [0, 0.36, -1.1], null, [0.16, 0.2, 0.34]);
  k.add(M.glow, GEO.sph, '#fff4d0', [0, 0.92, -1.33], null, [0.11, 0.11, 0.05]);
  k.add(M.metal, GEO.cyl, CHROME, [0, 0.92, -1.3], [PI / 2, 0, 0], [0.13, 0.04, 0.13]);
  k.add(M.glow, GEO.sph8, '#ffb020', [0.32, 0.86, -1.18], null, [0.05, 0.05, 0.03]);
  k.add(M.glow, GEO.sph8, '#ffb020', [-0.32, 0.86, -1.18], null, [0.05, 0.05, 0.03]);
  // Canopy: roof, rounded edges, side skirts, back panel with a small window.
  k.add(M.cloth, HALF_CYL, CANOPY, [0, 1.5, 0.22], [-PI / 2, 0, 0], [0.73, 2.0, 0.3]);
  k.add(M.cloth, GEO.box, CANOPY_D, [0, 1.5, 0.22], null, [1.47, 0.05, 2.02]);
  k.add(M.cloth, GEO.box, CANOPY_D, [0.71, 1.42, 0.45], null, [0.04, 0.42, 1.5]);
  k.add(M.cloth, GEO.box, CANOPY_D, [-0.71, 1.42, 0.45], null, [0.04, 0.42, 1.5]);
  k.add(M.cloth, GEO.box, CANOPY, [0, 1.07, 1.17], null, [1.42, 0.3, 0.06]);
  k.add(M.cloth, GEO.box, CANOPY, [0.62, 1.35, 1.17], null, [0.18, 0.3, 0.06]);
  k.add(M.cloth, GEO.box, CANOPY, [-0.62, 1.35, 1.17], null, [0.18, 0.3, 0.06]);
  k.add(M.paint, GEO.box, TRIM, [0, 0.94, 1.18], null, [1.42, 0.06, 0.06]);
  k.add(M.paint, GEO.box, TRIM, [0, 1.52, 1.19], null, [1.44, 0.05, 0.05]);
  k.add(M.metal, GEO.cyl8, CHROME, [0, 0.32, 1.22], [0, 0, PI / 2], [0.035, 1.3, 0.035]);
  k.add(M.matte, GEO.box, '#141210', [0.6, 0.18, 1.08], null, [0.2, 0.2, 0.02]);
  k.add(M.matte, GEO.box, '#141210', [-0.6, 0.18, 1.08], null, [0.2, 0.2, 0.02]);
  // Pillars and the windscreen frame.
  [[0.56, -0.62], [-0.56, -0.62], [0.68, 0.1], [-0.68, 0.1]].forEach((p) => k.add(M.metal, GEO.cyl8, '#2a2a2a', [p[0], 1.3, p[1]], null, [0.025, 0.85, 0.025]));
  k.add(M.metal, GEO.box, '#2a2a2a', [0, 1.7, -0.68], null, [1.15, 0.05, 0.05]);
  // Rear panel lights, plate and a little spare wheel.
  k.add(M.glow, GEO.box, '#ff2a1a', [0.5, 0.56, 1.18], null, [0.14, 0.09, 0.03]);
  k.add(M.glow, GEO.box, '#ff2a1a', [-0.5, 0.56, 1.18], null, [0.14, 0.09, 0.03]);
  k.add(M.glow, GEO.box, '#ffa020', [0.5, 0.44, 1.18], null, [0.1, 0.05, 0.03]);
  k.add(M.glow, GEO.box, '#ffa020', [-0.5, 0.44, 1.18], null, [0.1, 0.05, 0.03]);
  k.add(M.matte, GEO.cyl, '#121110', [0, 1.02, 1.24], [PI / 2, 0, 0], [0.2, 0.09, 0.2]);
  k.add(M.metal, GEO.cyl, CHROME, [0, 1.02, 1.29], [PI / 2, 0, 0], [0.1, 0.02, 0.1]);
  // Bench seat and the driver's seat.
  k.add(M.matte, GEO.box, SEAT, [0, 0.96, 0.72], null, [1.2, 0.12, 0.5]);
  k.add(M.matte, GEO.box, SEAT, [0, 1.2, 0.98], null, [1.2, 0.4, 0.1]);
  k.add(M.matte, GEO.box, SEAT, [0, 0.98, -0.18], null, [0.5, 0.1, 0.4]);
  // Mirrors and a meter on its stalk.
  k.add(M.metal, GEO.cyl8, CHROME, [0.5, 1.15, -0.72], [0, 0, -0.5], [0.012, 0.3, 0.012]);
  k.add(M.metal, GEO.sph8, CHROME, [0.58, 1.28, -0.72], null, [0.07, 0.05, 0.02]);
  k.add(M.metal, GEO.cyl8, CHROME, [-0.5, 1.15, -0.72], [0, 0, 0.5], [0.012, 0.3, 0.012]);
  k.add(M.metal, GEO.sph8, CHROME, [-0.58, 1.28, -0.72], null, [0.07, 0.05, 0.02]);
  k.add(M.paint, GEO.box, '#1a1a1a', [0.38, 1.08, -0.5], null, [0.16, 0.14, 0.08]);
  k.add(M.glow, GEO.box, '#ff4a2a', [0.38, 1.1, -0.455], null, [0.11, 0.05, 0.01]);
  k.add(M.metal, GEO.cyl8, CHROME, [0, 1.08, -0.55], [0, 0, PI / 2], [0.02, 0.7, 0.02]);
  body.add(k.build());
  const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.3), new THREE.MeshStandardMaterial({ color: '#2a3442', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.5, depthWrite: false }));
  rearGlass.position.set(0, 1.35, 1.2); body.add(rearGlass);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.66), new THREE.MeshStandardMaterial({ color: '#9fc4d8', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.set(0, 1.36, -0.66); glass.rotation.x = 0.18; body.add(glass);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.6 }));
  plate.position.set(0, 0.6, 1.181); body.add(plate);
  // Driver in a khaki shirt, hands on the bar.
  const d = new Kit();
  d.add(M.cloth, cap(0.16, 0.22), '#b59a5a', [0, 1.24, -0.2], null, [1.1, 1, 0.8]);
  d.add(M.skin, GEO.sph, '#7a4e34', [0, 1.55, -0.22], null, [0.11, 0.13, 0.115]);
  d.add(M.matte, GEO.sph, '#151010', [0, 1.6, -0.2], null, [0.115, 0.08, 0.12]);
  d.add(M.cloth, cap(0.05, 0.3), '#b59a5a', [0.2, 1.2, -0.4], [1.0, 0, -0.2]);
  d.add(M.cloth, cap(0.05, 0.3), '#b59a5a', [-0.2, 1.2, -0.4], [1.0, 0, 0.2]);
  d.add(M.cloth, cap(0.07, 0.3), '#3a3430', [0.12, 1.05, -0.35], [1.4, 0, 0]);
  d.add(M.cloth, cap(0.07, 0.3), '#3a3430', [-0.12, 1.05, -0.35], [1.4, 0, 0]);
  const driver = d.build(); body.add(driver);
  AUTO.riders = [];
  const shirt = ['#2a7ab8', '#c2185b'];
  for (let i = 0; i < 2; i++) {
    const pk = new Kit();
    const x = i ? 0.32 : -0.32;
    pk.add(M.cloth, cap(0.15, 0.2), shirt[i], [x, 1.2, 0.74], null, [1, 1, 0.8]);
    pk.add(M.skin, GEO.sph, '#8d5b3e', [x, 1.5, 0.74], null, [0.1, 0.12, 0.105]);
    pk.add(M.matte, GEO.sph, i ? '#2a1a12' : '#151010', [x, 1.54, 0.77], null, [0.105, 0.09, 0.1]);
    const m = pk.build(); m.visible = false; body.add(m); AUTO.riders.push(m);
  }
  // Wheels: one in front that steers, two behind.
  AUTO.front = new THREE.Group(); AUTO.front.position.set(0, 0.26, -1.12); root.add(AUTO.front);
  const fw = wheelKit(0.26, 0.14).build(); AUTO.front.add(fw); AUTO.fw = fw;
  AUTO.rear = [];
  [0.6, -0.6].forEach((x) => { const g = wheelKit(0.27, 0.16).build(); g.position.set(x, 0.27, 0.78); root.add(g); AUTO.rear.push(g); });
  // Headlight: a real spot at quality, plus a soft additive beam.
  const spot = new THREE.SpotLight('#fff0cc', 0, 30, 0.45, 0.55, 1.4);
  spot.position.set(0, 0.95, -1.35); spot.target.position.set(0, 0, -14); root.add(spot, spot.target);
  const beamGeo = new THREE.ConeGeometry(2.2, 12, 20, 1, true); beamGeo.translate(0, -6, 0); beamGeo.rotateX(-PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffe8b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
  beam.position.set(0, 0.95, -1.38); beam.rotation.x = 0.05; root.add(beam);
  AUTO.root = root; AUTO.body = body; AUTO.spot = spot; AUTO.beam = beam; AUTO.spin = 0; AUTO.roll = 0;
  R3.scene.add(root);
}

function animAuto(dt, real) {
  const x = laneX(G.laneT);
  const vel = (G.lane - G.laneT);
  AUTO.root.position.set(x, 0, 0);
  const rm = arc.reducedMotion;
  const targetRoll = clamp(-vel * 0.2, -0.12, 0.12);
  AUTO.roll = lerp(AUTO.roll, targetRoll, 1 - Math.exp(-real * 10));
  const bump = rm ? 0 : sin(G.t * 23) * 0.008 + sin(G.t * 7.3) * 0.01;
  const hitWob = G.hitT > 0 ? sin(G.hitT * 40) * 0.08 * G.hitT : 0;
  AUTO.body.position.y = bump;
  AUTO.body.rotation.set(sin(G.t * 5) * 0.006 + (rm ? 0 : hitWob), 0, AUTO.roll + hitWob * 0.6);
  AUTO.root.rotation.y = clamp(-vel * 0.18, -0.2, 0.2);
  const v = G.speed * 0.55 * SF;
  AUTO.spin -= v * dt / 0.27;
  AUTO.fw.rotation.x = AUTO.spin; AUTO.rear[0].rotation.x = AUTO.spin; AUTO.rear[1].rotation.x = AUTO.spin;
  AUTO.front.rotation.y = clamp(-vel * 0.6, -0.5, 0.5);
  const blink = G.cool > 0 && !G.attract && !rm && ((G.t * 16) | 0) % 2 === 1;
  AUTO.root.visible = !blink;
  for (let i = 0; i < 2; i++) AUTO.riders[i].visible = G.riders[i] > 0;
}

/* ------------------------------------------------------------------ obstacles and fares */
const POOLS = { fare: [], pot: [], cart: [] };
let RING_GEO = null, COIN = null;
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

function makePot() {
  const k = new Kit();
  const CLAY = '#b4532a', CLAY_D = '#8a3a1c';
  k.add(M.matte, GEO.box, '#5a3a20', [0, 0.12, 0], null, [1.1, 0.06, 0.7]);
  [[-0.3, 0], [0.3, 0], [0, 0]].forEach((p, i) => {
    const y = i === 2 ? 0.92 : 0.45, x = p[0];
    k.add(M.paint, GEO.sph, i === 2 ? CLAY_D : CLAY, [x, y, 0], null, [0.3, 0.27, 0.3]);
    k.add(M.paint, GEO.cyl, CLAY_D, [x, y + 0.27, 0], null, [0.12, 0.1, 0.12]);
    k.add(M.paint, GEO.tor, CLAY, [x, y + 0.32, 0], [PI / 2, 0, 0], [0.13, 0.13, 0.3]);
    k.add(M.paint, GEO.cyl, '#f0e2c0', [x, y + 0.05, 0], null, [0.302, 0.03, 0.302]);
    k.add(M.paint, GEO.cyl, '#2a1a10', [x, y - 0.06, 0], null, [0.29, 0.015, 0.29]);
  });
  [-0.5, 0.5].forEach((x) => k.add(M.matte, GEO.box, '#5a3a20', [x, 0.06, 0], null, [0.06, 0.12, 0.66]));
  const g = k.build(); g.userData.kind = 'pot';
  return g;
}

function makeFare(i) {
  const grp = new THREE.Group();
  const shirts = ['#2a7ab8', '#c2185b', '#2e8b57', '#ffb020', '#7b1fa2', '#e05a2a'];
  const pants = ['#2a2a3a', '#f0e2c0', '#3a2a20', '#1a2a4a', '#5a4a3a', '#2a3a2a'];
  const skin = ['#8d5b3e', '#6e4530', '#a06a48', '#7a4e34'][i % 4];
  const k = new Kit();
  const dress = i % 3 === 1;
  if (dress) {
    k.add(M.cloth, GEO.cone, shirts[i % 6], [0, 0.55, 0], null, [0.3, 1.1, 0.24]);
    k.add(M.cloth, GEO.box, '#ffd21a', [0, 0.06, 0], null, [0.5, 0.06, 0.38]);
  } else {
    k.add(M.cloth, cap(0.075, 0.55), pants[i % 6], [0.1, 0.42, 0]);
    k.add(M.cloth, cap(0.075, 0.55), pants[i % 6], [-0.1, 0.42, 0]);
  }
  k.add(M.matte, GEO.box, '#1a1210', [0.1, 0.04, -0.04], null, [0.11, 0.07, 0.24]);
  k.add(M.matte, GEO.box, '#1a1210', [-0.1, 0.04, -0.04], null, [0.11, 0.07, 0.24]);
  k.add(M.cloth, cap(0.18, 0.3), shirts[i % 6], [0, 1.12, 0], null, [1.05, 1, 0.75]);
  k.add(M.skin, GEO.cyl8, skin, [0, 1.47, 0], null, [0.05, 0.08, 0.05]);
  k.add(M.skin, GEO.sph, skin, [0, 1.62, 0], null, [0.11, 0.13, 0.115]);
  k.add(M.matte, GEO.sph, '#151010', [0, 1.67, 0.02], null, [0.118, 0.09, 0.12]);
  if (dress) k.add(M.matte, GEO.sph, '#151010', [0, 1.6, 0.11], null, [0.07, 0.07, 0.07]);
  k.add(M.cloth, cap(0.05, 0.42), shirts[i % 6], [-0.24, 1.08, 0], [0, 0, 0.1]);
  k.add(M.matte, GEO.box, ['#8a5a32', '#c49a5a', '#3a5a8a'][i % 3], [-0.32, 0.78, 0], null, [0.12, 0.3, 0.32]);
  const body = k.build(); grp.add(body);
  const arm = new THREE.Group(); arm.position.set(0.22, 1.32, 0); grp.add(arm);
  const ak = new Kit(); ak.add(M.cloth, cap(0.05, 0.42), shirts[i % 6], [0, 0.26, 0]); ak.add(M.skin, GEO.sph8, skin, [0, 0.54, 0], null, [0.055, 0.06, 0.05]);
  arm.add(ak.build());
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffb736', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(RING_GEO, ringMat); ring.rotation.x = -PI / 2; ring.position.y = 0.03; grp.add(ring);
  const coin = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ map: COIN, side: THREE.DoubleSide, toneMapped: false, transparent: true }));
  coin.position.y = 2.15; grp.add(coin);
  grp.userData = { kind: 'fare', arm, ring, coin, body };
  return grp;
}

function buildPools() {
  RING_GEO = new THREE.RingGeometry(0.55, 0.85, 36);
  COIN = coinTex();
  for (let i = 0; i < 6; i++) POOLS.fare.push(makeFare(i));
  for (let i = 0; i < 4; i++) POOLS.pot.push(makePot());
  for (let i = 0; i < 4; i++) POOLS.cart.push(makeCart());
  Object.keys(POOLS).forEach((k) => POOLS[k].forEach((g) => { g.visible = false; g.userData.free = true; R3.scene.add(g); }));
}
function takeVis(kind) {
  const pool = POOLS[kind];
  const start = (rnd() * pool.length) | 0;
  for (let n = 0; n < pool.length; n++) { const g = pool[(start + n) % pool.length]; if (g.userData.free) { g.userData.free = false; g.visible = true; return g; } }
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
    const z = objZ(o), x = laneX(o.lane);
    v.position.set(x, 0, z);
    if (o.kind === 'cart') v.rotation.set(0, o.yaw || 0, 0);
    else if (o.kind === 'pot') v.rotation.set(0, (o.seed - 0.5) * 0.8, 0);
    else if (o.kind === 'fare') {
      const u = v.userData;
      v.rotation.set(0, 0, 0);
      u.arm.rotation.set(0, 0, -2.4 + sin(t * 9 + o.seed * 10) * 0.45);
      u.body.position.y = abs(sin(t * 4.5 + o.seed * 6)) * 0.05;
      const pulse = 0.9 + 0.15 * sin(t * 5 + o.seed * 8);
      u.ring.scale.set(pulse, pulse, pulse); u.ring.material.opacity = 0.45 + 0.25 * sin(t * 5 + o.seed);
      u.coin.rotation.y = t * 3 + o.seed * 6; u.coin.position.y = 2.15 + sin(t * 3 + o.seed) * 0.08;
      if (FX && rnd() < 0.1) FX.emit(x + rnd() * 0.8 - 0.4, 0.2 + rnd() * 1.5, z + rnd() * 0.6 - 0.3, 0, 0.7, 0, FX.C.gold, 0.1, 0.8, 'glow', 0);
    }
  }
}

/* ------------------------------------------------------------------ effects */
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
    petal: new THREE.Color('#ff9a1a'), steel: new THREE.Color('#dfe4e8'), clay: new THREE.Color('#c0602e'), wood: new THREE.Color('#9a6a3a'), smoke: new THREE.Color('#c8beb2'), white: new THREE.Color('#fff4dc'),
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
        if (kind === 'petal' && c === C.petal) cc = petalCols[(rnd() * petalCols.length) | 0];
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
      h.size[n] = 0.5; h.alpha[n] = min(1, (0.42 + 0.12 * sin(t * 3 + b + k)) * PAL.head); n++;
    }
    if (s.lampPos) {
      h.pos[n * 3] = s.lampPos[0]; h.pos[n * 3 + 1] = s.lampPos[1]; h.pos[n * 3 + 2] = s.lampPos[2];
      h.col[n * 3] = 1; h.col[n * 3 + 1] = 0.75; h.col[n * 3 + 2] = 0.4; h.size[n] = 2.2; h.alpha[n] = min(1, 0.55 * PAL.head); n++;
    }
  }
  for (let i = n; i < h.n; i++) h.alpha[i] = 0;
  h.geo.attributes.position.needsUpdate = true; h.geo.attributes.aCol.needsUpdate = true; h.geo.attributes.aSize.needsUpdate = true; h.geo.attributes.aAlpha.needsUpdate = true;
}

/* ------------------------------------------------------------------ frame: camera, lights, draw */
const _look = new THREE.Vector3(), _camT = new THREE.Vector3(), _proj = new THREE.Vector3();
function renderScene(dtReal, a) {
  const r = R3, cam = r.camera, t = G.t;
  const scrollM = G.dist * 0.55 * SF;
  const scrollStep = r.lastScroll == null ? 0 : max(0, scrollM - r.lastScroll);
  r.lastScroll = scrollM;
  W3.roadT.offset.y = scrollM / (176 / 22);
  W3.walkT.offset.y = scrollM / (176 / 55);
  placeWorld(scrollM, t);
  placeObjs(t);
  animAuto(a.state === 'pause' ? 0 : dtReal * (G.slowT > 0 ? 0.4 : 1), dtReal);
  G.hitT = max(0, G.hitT - dtReal);
  const night = PAL === LOOKS.night;
  const tier = TIERS[max(0, r.quality)];
  // Exhaust puffs and wheel dust.
  if (a.state !== 'pause' && FX) {
    r.puff = (r.puff || 0) + dtReal;
    if (r.puff > 0.16) { r.puff = 0; const ax = laneX(G.laneT); FX.emit(ax - 0.5, 0.25, 1.25, -0.4 + rnd() * 0.2, 0.35, 1.4, FX.C.smoke, 0.07, 0.55, 'dust', -0.3); if (rnd() < 0.5) FX.emit(ax + (rnd() < 0.5 ? 0.6 : -0.6), 0.05, 0.9, 0, 0.3, 1.5, FX.C.dust, 0.2, 0.5, 'dust', -0.2); }
  }
  // Chase camera: higher and further back on a tall phone screen so three lanes fit.
  const aspect = a.w / max(1, a.h);
  const port = clamp((1.25 - aspect) / 0.75, 0, 1);
  const rm = a.reducedMotion;
  const spd = clamp((G.speed * 0.55 - 120) / 180, 0, 1);
  const fov = lerp(56, 70, port) + spd * 6;
  if (abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  const ax = laneX(G.laneT);
  _camT.set(ax * lerp(0.5, 0.5, port), lerp(3.5, 4.0, port), lerp(7.8, 8.0, port));
  _look.set(ax * lerp(0.7, 0.65, port), lerp(0.9, 0.7, port), lerp(-12, -11, port));
  if (!r.camInit) { r.cam.copy(_camT); r.look.copy(_look); r.camInit = true; }
  const kc = 1 - Math.exp(-dtReal * (rm ? 3.5 : 7));
  r.cam.lerp(_camT, kc); r.look.lerp(_look, kc);
  cam.position.copy(r.cam);
  if (a.state === 'menu') cam.position.x += sin(a.frame * 0.004) * 1.2;
  cam.position.x += (a.shakeX || 0) * 0.014; cam.position.y += (a.shakeY || 0) * 0.014;
  cam.lookAt(r.look);
  if (!rm) cam.rotateZ(AUTO.roll * 0.25);
  r.sky.position.copy(cam.position);
  r.skyMat.uniforms.uTime.value = t;
  r.key.position.set(PAL.keyPos[0], PAL.keyPos[1], PAL.keyPos[2]); r.key.target.position.set(0, 0, -6); r.key.target.updateMatrixWorld();
  let li = 0;
  for (let k = 0; k < W3.slots.length && li < r.lamps.length; k++) {
    const s = W3.slots[k];
    if (s.lampPos && s.zc < 8 && s.zc > -30 && li < tier.lamps) { r.lamps[li].position.set(s.lampPos[0], s.lampPos[1] - 0.2, s.lampPos[2]); r.lamps[li].intensity = PAL.lamp; li++; }
  }
  for (; li < r.lamps.length; li++) r.lamps[li].intensity = 0;
  AUTO.spot.intensity = tier.lamps > 0 ? (night ? 60 : 14) : 0;
  AUTO.beam.material.opacity = night ? 0.07 : 0.025;
  W3.heads.material.color.setScalar(1);
  if (FX) { placeHalos(t); FX.step(a.state === 'pause' ? 0 : dtReal, a.state === 'pause' ? 0 : scrollStep, t, cam, r.renderer); }
  if (POST) { POST.setQuality(r.quality, r.lockQ); POST.render(r.scene, cam); } else r.renderer.render(r.scene, cam);
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
function drawHUD(c) {
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
  plate(c, pad.left, pad.top, min(150, w / 2 - 70 - pad.left - 8), 64, 12);
  txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
  txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
  plate(c, w / 2 - 70, pad.top, 140, 44, 12);
  txt(c, G.clock ? (Math.max(0, G.clock | 0) + 's') : (Math.round(G.dist / 40) + ' m'), w / 2, pad.top + 22, 18, G.clock && G.clock < 10 ? PRIM : INK, 500, 'center', F_DISP);
  const hx = w - pad.right - 18;
  for (let i = 0; i < G.maxLives; i++) {
    c.fillStyle = i < G.lives ? PRIM : 'rgba(251,245,236,.15)';
    c.beginPath(); c.arc(hx - i * 18, pad.top + 22, 6, 0, TAU); c.fill();
  }
  plate(c, pad.left, pad.top + 74, 118, 34, 10);
  txt(c, G.fares + ' fares', pad.left + 59, pad.top + 91, 12, WARM, 600, 'center', F_MONO);
}
function drawFloats(c, dt) {
  const cam = R3.camera, w = arc.w, h = arc.h;
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.life -= dt; f.y += dt * 1.1; f.z += (G.speed * 0.55 * SF) * dt * (arc.state === 'play' ? 1 : 0);
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
const STREAKS = [];
for (let i = 0; i < 14; i++) STREAKS.push({ x: rnd(), y: rnd(), len: 40 + rnd() * 70, sp: 0.8 + rnd() * 0.8 });
function drawStreaks(c, w, h, dt) {
  const rush = G.mode === 'rush';
  if (!rush || G.attract) return;
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

// The three tap zones, shown faintly while the touch hint is up.
function drawLaneGuides(c) {
  if (!gestStyle() || arc.time >= 5) return;
  const t = arc.time, a = arc.reducedMotion ? 1 : clamp(min(t / 0.35, (5 - t) / 0.7), 0, 1);
  const pad = arc.hudPad ? arc.hudPad() : { top: 12, bottom: 64 };
  const top = max(pad.top + 120, arc.h * 0.3), bot = arc.h - pad.bottom - 90;
  if (bot <= top) return;
  c.save();
  c.globalAlpha = a * 0.5;
  c.strokeStyle = 'rgba(251,245,236,.5)'; c.lineWidth = 1.5; c.setLineDash([6, 8]);
  [1, 2].forEach((k) => { const x = arc.w * k / 3; c.beginPath(); c.moveTo(x, top); c.lineTo(x, bot); c.stroke(); });
  c.setLineDash([]);
  c.globalAlpha = a * 0.75;
  c.font = '700 11px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = WARM;
  ['TAP', 'TAP', 'TAP'].forEach((s, k) => c.fillText(s, arc.w * (k + 0.5) / 3, top + 14));
  c.restore();
}

function dbg() {
  return {
    phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), lives: G.lives, lane: G.lane,
    dist: Math.round(G.dist), fares: G.fares, objs: G.objs.length, attract: !!G.attract, t: +G.t.toFixed(2),
    touchActs: G.touchActs || 0, touchStyle: arc.touchStyle,
    gfx: R3 ? { quality: R3.quality, fps: Math.round(R3.fps), calls: R3.renderer.info.render.calls, soft: R3.soft } : null,
  };
}

function showNo3D(a) {
  a.panel({
    eyebrow: 'Fare Run', title: '3D graphics <em>unavailable</em>',
    html: '<p>This browser could not start WebGL, which the 3D version of this game needs. Try another browser or turn on hardware acceleration.</p>',
    actions: [{ label: 'All games', href: '/games', primary: true }],
  });
}

A.create({
  three: true,
  slug: 'fare-run', title: 'Fare Run', genre: 'Auto runner',
  hint: 'Left Right or A D change lane   click a lane   pick up standing fares',
  touchHint: 'Stick or tap a lane, pick up people, dodge carts',
  keys: [
    ['Left / Right / A D', 'Change lane'],
    ['Click a lane', 'Jump to that lane'],
  ],
  mouse: { cursor: 'pointer', keys: [['Click left, middle or right', 'Jump to that lane']] },
  touch: { stick: true, pads: [{ label: 'Left', key: 'ArrowLeft' }, { label: 'Right', key: 'ArrowRight', hot: true }] },
  touchKeys: [['On-screen stick', 'Change lane'], ['Left / Right pads', 'Nudge one lane']],
  // Controller: stick or d-pad change lane; X or left trigger one lane left, A or right trigger one lane right.
  gamepad: { buttons: ['KeyD', 'KeyA'], rt: 'KeyD', lt: 'KeyA' },
  gestures: {
    drag: false,
    hint: 'Tap a lane, or swipe left or right',
    keys: [['Tap left, middle or right', 'Take that lane'], ['Swipe left / right', 'Move one lane, a long swipe moves two']],
  },
  formatScore: (v) => Math.round(v) + ' pts',
  menu: {
    eyebrow: 'Auto runner',
    title: 'Fare <em>Run</em>',
    html: '<p>Three lanes through a dusk bazaar. Nudge the auto left or right, pick up the standing fares, and keep the carts and clay pots off the bumper.</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'bazaar', choices: [{ v: 'bazaar', label: 'Bazaar run' }, { v: 'night', label: 'Night shift' }, { v: 'rush', label: 'Rush hour' }] },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
    ],
  },
  pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Fares<b>' + G.fares + '</b></div></div>'; },
  graphics(level) { if (!R3) return; if (level === 'auto') { R3.lockQ = false; R3.qMax = 3; return; } R3.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  resize: (a) => resize3D(a),
  onMenu(a) {
    arc = a; G.attractReady = false; reset(true); G.attractReady = true;
    // The menu street shows the chosen mode's light: dusk or night.
    const card = document.querySelector('.arc-card');
    const seg = card && card.querySelector('.arc-seg[data-opt="mode"]');
    if (seg) seg.addEventListener('click', () => setTimeout(() => { if (R3 && a.state === 'menu') { G.mode = a.choices.mode || 'bazaar'; applyLook(G.mode); } }, 0));
    if (R3) { G.mode = a.choices.mode || G.mode; applyLook(G.mode); }
  },
  init(a) {
    arc = a; a.debug = dbg; G.D = DIFF.normal;
    if (!setup3D(a)) { NO3D = true; showNo3D(a); return; }
    a.dev = { get R3() { return R3; }, W3, get FX() { return FX; }, AUTO, G, setQuality: (q) => { if (R3) R3.lockQ = true; setQuality(q); },
      ff: (sec) => { for (let i = 0, n = Math.round(sec * 60); i < n && a.state === 'play'; i++) update(1 / 60); } };
    R3.qMax = 3;
    setQuality(R3.soft ? 0 : 3); resize3D(a);
    reset(true); G.attractReady = true;
    a.menu();
  },
  start(a, ch) {
    if (NO3D) return;
    arc = a; reset(false, ch);
    const label = G.mode === 'night' ? 'Ninety seconds' : G.mode === 'rush' ? 'Rush hour' : 'Bazaar run';
    arc.toast(label, 'Fare Run', 1400);
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
    if (a.state === 'play' && !G.attract) { drawHUD(ctx); drawLaneGuides(ctx); }
    drawTouchHint(ctx, ['Tap a lane, or swipe left or right', 'Pick up the fares, dodge the carts']);
  },
});
