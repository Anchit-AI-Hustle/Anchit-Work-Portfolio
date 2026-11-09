import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost } from '/games/shared/fx3d.js';
/*
 * Yard Catch 3D: spice sacks tumble from a warehouse loft into a market yard
 * at dusk, and a porter wheels his crate under them. Same rules, modes,
 * scoring and controls as the 2D game.js (which stays the fallback); the yard,
 * sacks, crate and porter are real-time 3D on the Arcade shell. Mouse, arrows,
 * a game controller, a finger dragged anywhere, or the on-screen stick.
 */

const PI = Math.PI, TAU = Math.PI * 2;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rnd = Math.random;
const F_DISP = 'Fraunces, Times New Roman, serif';
const F_UI = 'Inter, sans-serif';
const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';
const GOOD = ['spice', 'tea', 'grain'];
const SACK = {
  spice: { body: '#c4552e', ink: '#5a1a0c', label: 'SPICE', dust: '#ff6940' },
  tea: { body: '#7a4a2a', ink: '#2a140a', label: 'TEA', dust: '#c9a96e' },
  grain: { body: '#d2b072', ink: '#6a4a1c', label: 'GRAIN', dust: '#ffd27a' },
  spoil: { body: '#52643a', ink: '#1e2814', label: 'SPOILT', dust: '#7a9a40' },
};

let arc;
const DIFF = {
  easy: { spoil: 0.12, gap: 1.28, fall: 0.78, catch: 78 },
  normal: { spoil: 0.18, gap: 1.08, fall: 0.9, catch: 70 },
  hard: { spoil: 0.28, gap: 0.84, fall: 1.12, catch: 60 },
};
// The 2D game measured its catch window in screen pixels; these are the same
// windows as a share of an 800 px tall yard.
const GY = 0.82, CATCH_TOP = 0.035, CATCH_BOT = 0.0225, MISS_AT = 0.045, NEAR = 0.15;
const G = {
  t: 0, score: 0, lives: 3, maxLives: 3, combo: 0, px: 0.5, items: [], pops: [],
  next: 0.6, phase: 'run', attract: true, caught: 0, inv: 0,
  mode: 'load', diff: 'normal', clock: 0, comboFlash: 0, nearGlow: 0, touchDrag: 0, D: DIFF.normal,
  squash: 0, hurt: 0, pile: [],
};

/* ===================================================================== rules */
function reset(attract, ch) {
  G.mode = (ch && ch.mode) || G.mode || 'load';
  G.diff = (ch && ch.diff) || G.diff || 'normal';
  G.D = DIFF[G.diff] || DIFF.normal;
  G.t = 0; G.score = 0; G.combo = 0; G.px = 0.5; G.touchDrag = 0;
  G.maxLives = G.mode === 'clean' ? 1 : 3;
  G.lives = G.maxLives;
  G.clock = G.mode === 'shift' ? 75 : 0;
  freeAll();
  G.items = []; G.pops = []; G.next = attract ? 0.4 : 0.55 * G.D.gap;
  G.phase = 'run'; G.attract = !!attract; G.caught = 0; G.inv = attract ? 0 : 1.6;
  G.comboFlash = 0; G.nearGlow = 0; G.pile.length = 0; G.squash = 0; G.hurt = 0;
  if (!attract) addItem({ x: G.px, y: -0.05, vy: 0.26 * G.D.fall, kind: 'spice', spoil: false });
}

function addItem(o) {
  o.w = 0.07; o.dead = false;
  o.spin = (rnd() - 0.5) * 3; o.rot = rnd() * TAU; o.tilt = (rnd() - 0.5) * 0.6;
  o.vis = takeVis(o);
  G.items.push(o);
}

function spawn() {
  const spoil = rnd() < G.D.spoil && G.t > 8 && G.caught >= 2;
  // Early drops land near the crate so the first catches are readable.
  const near = G.t < 10 ? clamp(G.px + (rnd() - 0.5) * 0.22, 0.12, 0.88) : (0.1 + rnd() * 0.8);
  addItem({
    x: near, y: -0.08, vy: (0.22 + rnd() * 0.14 + G.t * 0.008) * G.D.fall,
    kind: spoil ? 'spoil' : GOOD[(rnd() * GOOD.length) | 0], spoil,
  });
  G.next = (0.7 + rnd() * 0.5 - min(0.22, G.t * 0.006)) * G.D.gap;
}

function scorePop(X, Y, text, col, big) { G.pops.push({ X, Y, text, col: col || WARM, life: 0.95, max: 0.95, big: !!big }); }

function finish(why, html) {
  if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
  G.phase = 'over';
  arc.haptic(why === 'Shift over' ? 'success' : 'fail');
  arc.over({
    eyebrow: why, title: why === 'Shift over' ? 'Shift <em>done</em>' : 'Yard <em>closed</em>',
    score: Math.round(G.score), scoreLabel: 'Score',
    html: html || ('<p>' + G.caught + ' sacks caught.</p>'),
    again: 'Catch again',
  });
}

function miss(o) {
  if (G.phase === 'over' || G.inv > 0) return;
  G.lives--; G.combo = 0; G.inv = 1.15; G.hurt = 1;
  arc.shake = 6; arc.sfx.tone(140, 0.14, { type: 'sawtooth', slide: 70, vol: 0.12 });
  arc.haptic('heavy', 0.6);
  if (G.lives <= 0) finish('Dropped the load', '<p>' + G.caught + ' sacks caught before the pile went over.</p>');
  else arc.toast('Missed a sack', G.lives + ' left', 800);
  void o;
}

function catchItem(o) {
  const X = laneX(o.x), Y = W.catchY + 0.2;
  if (o.spoil) {
    if (G.phase === 'over' || G.inv > 0) { o.dead = true; releaseVis(o, 'gone'); return; }
    G.lives--; G.combo = 0; G.inv = 1.15; G.hurt = 1;
    spoilFx(X, Y);
    arc.toast('Spoiled', 'Skip those', 800);
    arc.sfx.tone(180, 0.12, { type: 'square', vol: 0.1 });
    arc.shake = Math.max(arc.shake, 5); arc.haptic('hit', 0.8);
    if (POST) POST.flash(0.2, '#c8ffb0');
    if (G.lives <= 0) finish('Spoiled crate', '<p>' + G.caught + ' good sacks before a spoiled one landed.</p>');
  } else {
    G.combo++; G.caught++;
    const add = 12 * G.combo;
    G.score += add;
    G.comboFlash = 0.45; G.squash = 1;
    G.pile.push(o.kind); if (G.pile.length > 7) G.pile.shift();
    catchFx(X, Y, o.kind, G.combo);
    scorePop(X, Y + 0.5, '+' + add, G.combo >= 5 ? WARM : INK, G.combo >= 5);
    arc.sfx.tone(520 + G.combo * 40, 0.07, { type: 'sine', vol: 0.12 });
    arc.sfx.noise(0.08, { freq: 900, vol: 0.06 });
    if (!G.attract) arc.haptic('tap', min(1, 0.35 + G.combo * 0.06));
    if (G.combo >= 5) arc.toast('Combo x' + G.combo, '+' + add, 700);
    if (G.combo % 5 === 0) { marigolds(X, Y + 0.4); CAM.kick = 1; if (!G.attract) { arc.haptic('success', 0.7); if (POST) POST.flash(0.14, '#ffe2a0'); } arc.sfx.tone(880, 0.12, { type: 'triangle', vol: 0.08, delay: 0.05 }); }
  }
  o.dead = true;
  releaseVis(o, 'gone');
}

function gestStyle() { return !!(arc && arc.touchMode && arc.touchStyle === 'gesture'); }

function update(dt) {
  if (G.phase === 'over') return;
  G.t += dt; G.next -= dt; G.inv = max(0, G.inv - dt);
  G.comboFlash = max(0, G.comboFlash - dt);
  if (G.clock) {
    G.clock -= dt;
    if (G.clock <= 0) { G.clock = 0; finish('Shift over', '<p>' + G.caught + ' sacks in the shift.</p>'); return; }
  }
  const inp = arc.input, ax = inp.axis(), p = inp.pointer;
  G.px = clamp(G.px + ax.x * dt * 2.1, 0.08, 0.92);
  // Tap & swipe: the crate sits under the finger, anywhere on the screen, and
  // follows it a touch faster than the mouse so a drag feels held, not towed.
  const finger = gestStyle() && p && p.type !== 'mouse' && inp.gesture.active;
  if (finger) { G.touchDrag += dt; G.px = lerp(G.px, clamp(screenToLane(p.x), 0.08, 0.92), 1 - Math.exp(-dt * 26)); }
  else if (p && p.seen && abs(ax.x) < 0.08) G.px = lerp(G.px, clamp(screenToLane(p.x), 0.08, 0.92), 1 - Math.exp(-dt * 16));
  if (G.next <= 0) spawn();
  const cw = catchW();
  let near = 0;
  for (const o of G.items) {
    if (o.dead) continue;
    o.y += o.vy * dt;
    const dxw = abs(o.x - G.px) * W.lane, dy = GY - o.y;
    if (!o.spoil && dy > 0 && dy < NEAR && dxw < cw + 0.3) near = max(near, 1 - dy / NEAR);
    if (o.y > GY - CATCH_TOP && o.y < GY + CATCH_BOT && dxw < cw) catchItem(o);
    else if (o.y > GY + MISS_AT) {
      // Only punish a miss when the sack was in reach. Far-lane drops are
      // noise, not a failure.
      if (!o.spoil && abs(o.x - G.px) < 0.32) miss(o);
      o.dead = true;
      releaseVis(o, 'fall');
    }
  }
  G.nearGlow = lerp(G.nearGlow, near, 1 - Math.exp(-dt * 10));
  G.items = G.items.filter((o) => !o.dead);
  tickPops(dt);
}

function idle(dt) {
  G.attract = true;
  if (!G.items.length && G.t === 0) reset(true);
  G.t += dt; G.px = 0.5 + sin(G.t * 0.9) * 0.28;
  G.next -= dt; if (G.next <= 0) spawn();
  for (const o of G.items) o.y += o.vy * dt;
  for (const o of G.items) if (o.y >= 1.2 || (o.y > GY + MISS_AT && !o.dead)) { o.dead = true; releaseVis(o, 'fall'); }
  // the demo crate catches what lands on it
  for (const o of G.items) if (!o.dead && o.y > GY - CATCH_TOP && o.y < GY + CATCH_BOT && abs(o.x - G.px) * W.lane < catchW() && !o.spoil) { o.dead = true; releaseVis(o, 'gone'); G.squash = 1; G.pile.push(o.kind); if (G.pile.length > 7) G.pile.shift(); catchFx(laneX(o.x), W.catchY + 0.2, o.kind, 1); }
  G.items = G.items.filter((o) => !o.dead);
  G.comboFlash = 0;
  G.nearGlow = 0.25 + 0.25 * sin(G.t * 2.2);
  tickPops(dt);
}

function tickPops(dt) {
  for (let i = G.pops.length - 1; i >= 0; i--) { const q = G.pops[i]; q.life -= dt; if (q.life <= 0) G.pops.splice(i, 1); }
}

/* ===================================================================== 3D world */
let POST = null;
const R3 = {
  ok: false, lost: false, renderer: null, scene: null, camera: null, q: 3, lock: false, soft: false,
  aniso: 4, fps: 0, accT: 0, accN: 0, settle: 2, last: 0, realDt: 1 / 60, time: 0, key: null, env: null, hemi: null,
  ray: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
};
// The yard as the camera frames it: lane width, the crate's mouth height, and
// the loft the sacks fall from. Set from the screen shape on every resize.
const W = { lane: 6, catchY: 0.9, loftY: 6, dropY: 5.6, key: '' };
const CAM = { D: 11, Y: 2.4, tilt: 0.1, ox: 0, oy: 0, kick: 0, x: 0 };
const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), n: new THREE.Vector2() };
const M = { vis: [], pile: [], pillars: null, bulbs: null };

const laneX = (x) => (x - 0.5) * W.lane;
const catchW = () => 0.6 * (G.D.catch || 70) / 70;
// height in the yard for a normalised drop position (the 2D y)
const yToY = (y) => W.catchY + (GY - y) / (GY + 0.05) * (W.dropY - W.catchY);

function screenToLane(px) {
  if (!R3.ok) return px / arc.w;
  V.n.set((px / arc.w) * 2 - 1, 0);
  R3.ray.setFromCamera(V.n, R3.camera);
  const hit = R3.ray.ray.intersectPlane(R3.plane, V.c);
  if (!hit) return px / arc.w;
  return hit.x / W.lane + 0.5;
}

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function colorTex(canvas, srgb, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = R3.aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
function std(o) { return new THREE.MeshStandardMaterial(o); }

function woodGrain(g, w, h, base, dark, light, seed, streaks) {
  const r = window.Arcade.rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < (streaks || 120); i++) {
    const y0 = r() * h, amp = 2 + r() * 8, fr = 0.003 + r() * 0.01, ph = r() * TAU;
    g.strokeStyle = r() < 0.6 ? dark : light; g.globalAlpha = 0.05 + r() * 0.16; g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) { const y = y0 + sin(x * fr + ph) * amp; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
}

// Jute: a tight weave, a stencilled mark, and for a spoiled sack, mould.
function sackCanvas(kind) {
  const W2 = 512, H = 256, c = makeCanvas(W2, H), g = c.getContext('2d'), s = SACK[kind];
  const r = window.Arcade.rng(kind.length * 17 + 3);
  g.fillStyle = s.body; g.fillRect(0, 0, W2, H);
  for (let y = 0; y < H; y += 4) { g.fillStyle = 'rgba(0,0,0,' + (0.08 + r() * 0.06) + ')'; g.fillRect(0, y, W2, 1.5); }
  for (let x = 0; x < W2; x += 4) { g.fillStyle = 'rgba(255,235,200,' + (0.05 + r() * 0.05) + ')'; g.fillRect(x, 0, 1.5, H); }
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,240,210,0.08)'; g.fillRect(r() * W2, r() * H, 2 + r() * 6, 1); }
  // stencil on the front
  g.save(); g.translate(W2 / 2, H * 0.55);
  g.strokeStyle = s.ink; g.globalAlpha = 0.75; g.lineWidth = 4; g.strokeRect(-70, -34, 140, 68);
  g.fillStyle = s.ink; g.font = '700 30px JetBrains Mono, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(s.label, 0, -4);
  g.font = '600 13px JetBrains Mono, monospace'; g.fillText(kind === 'spoil' ? 'DO NOT LOAD' : 'YARD 7  25 KG', 0, 22);
  g.restore(); g.globalAlpha = 1;
  // a stripe band near the top, as jute sacks have
  g.fillStyle = kind === 'tea' ? 'rgba(201,169,110,0.6)' : 'rgba(120,30,20,0.45)'; g.fillRect(0, H * 0.16, W2, 8);
  if (kind === 'spoil') {
    for (let i = 0; i < 40; i++) { const x = r() * W2, y = r() * H, rr = 4 + r() * 18; const rg = g.createRadialGradient(x, y, 0, x, y, rr); rg.addColorStop(0, 'rgba(150,190,70,0.8)'); rg.addColorStop(1, 'rgba(60,80,30,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); }
  }
  return c;
}
function weaveBump() {
  const N = 128, c = makeCanvas(N, N), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y += 4) for (let x = 0; x < N; x += 4) { g.fillStyle = ((x + y) / 4) % 2 ? '#a0a0a0' : '#606060'; g.fillRect(x, y, 4, 4); }
  return c;
}

// A tied jute sack: a lathe bag with a pinched neck and a tuft, pressed flatter front to back.
function sackGeometry() {
  const pts = [[0, 0], [0.13, 0.008], [0.2, 0.05], [0.235, 0.14], [0.23, 0.27], [0.19, 0.37], [0.1, 0.44], [0.05, 0.47], [0.075, 0.5], [0.09, 0.55], [0.05, 0.57], [0, 0.565]];
  const geo = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), 16);
  geo.translate(0, -0.27, 0); geo.scale(1.25, 1.15, 0.85);
  geo.computeVertexNormals();
  return geo;
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(0.55, 0.12, -0.83).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: 'varying vec3 vD; uniform vec3 uSun;' +
      'void main(){ float h = clamp(vD.y, -0.2, 1.0);' +
      ' vec3 c = mix(vec3(0.85, 0.45, 0.24), vec3(0.62, 0.22, 0.16), smoothstep(0.0, 0.12, h));' +
      ' c = mix(c, vec3(0.24, 0.12, 0.2), smoothstep(0.1, 0.35, h)); c = mix(c, vec3(0.08, 0.06, 0.12), smoothstep(0.35, 0.8, h));' +
      ' float s = max(dot(vD, uSun), 0.0); c += vec3(1.0, 0.6, 0.3) * pow(s, 18.0) * 0.6 + vec3(1.0, 0.85, 0.6) * smoothstep(0.9985, 0.9992, s) * 2.0;' +
      ' gl_FragColor = vec4(c, 1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }',
  });
}

function stoneCanvas() {
  const N = 512, c = makeCanvas(N, N), g = c.getContext('2d'), r = window.Arcade.rng(41);
  g.fillStyle = '#2a221a'; g.fillRect(0, 0, N, N);
  const tw = 128, th = 64;
  for (let row = 0; row < N / th; row++) {
    const off = (row % 2) * tw / 2;
    for (let x = -tw; x < N + tw; x += tw) {
      const t = 0.8 + r() * 0.4;
      g.fillStyle = 'rgb(' + Math.round(110 * t) + ',' + Math.round(92 * t) + ',' + Math.round(72 * t) + ')';
      g.fillRect(x + off + 3, row * th + 3, tw - 6, th - 6);
      for (let k = 0; k < 40; k++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,230,200,0.06)'; g.fillRect(x + off + 3 + r() * (tw - 8), row * th + 3 + r() * (th - 8), 2 + r() * 4, 2 + r() * 3); }
    }
  }
  // spilled spice and straw
  for (let i = 0; i < 260; i++) { g.fillStyle = ['rgba(196,85,46,0.35)', 'rgba(210,176,114,0.35)', 'rgba(255,200,90,0.25)'][i % 3]; g.fillRect(r() * N, r() * N, 1 + r() * 3, 1 + r() * 3); }
  g.strokeStyle = 'rgba(220,190,110,0.4)'; g.lineWidth = 1;
  for (let i = 0; i < 60; i++) { const x = r() * N, y = r() * N, a = r() * TAU; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cos(a) * 10, y + sin(a) * 10); g.stroke(); }
  return c;
}

function warehouseCanvas(sign, seed, tint) {
  const Wc = 512, H = 512, c = makeCanvas(Wc, H), g = c.getContext('2d'), r = window.Arcade.rng(seed);
  g.fillStyle = tint; g.fillRect(0, 0, Wc, H);
  for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,220,180,0.05)'; g.fillRect(r() * Wc, r() * H, 3, 3); }
  // brick courses
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
  for (let y = 0; y < H; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(Wc, y); g.stroke(); }
  const cols = 5, rows = 4;
  for (let rI = 0; rI < rows; rI++) for (let k = 0; k < cols; k++) {
    const x = 40 + k * (Wc - 80) / cols, y = 120 + rI * 80;
    g.fillStyle = '#1a120c'; g.fillRect(x - 4, y - 4, 48, 56);
    const lit = r() < 0.65;
    g.fillStyle = lit ? (r() < 0.5 ? '#ffb85a' : '#ff8a46') : '#2a1c16'; g.fillRect(x, y, 40, 48);
    if (lit) { g.fillStyle = 'rgba(80,40,20,0.5)'; g.fillRect(x + 19, y, 2, 48); g.fillRect(x, y + 22, 40, 2); }
  }
  // the big door and the sign
  g.fillStyle = '#140c08'; g.fillRect(Wc * 0.35, H - 140, Wc * 0.3, 140);
  g.fillStyle = 'rgba(255,170,80,0.25)'; g.fillRect(Wc * 0.35, H - 140, Wc * 0.3, 6);
  g.fillStyle = '#e8d2a8'; g.fillRect(60, 30, Wc - 120, 60);
  g.fillStyle = '#7a2420'; g.fillRect(66, 36, Wc - 132, 48);
  g.fillStyle = '#ffdca0'; g.font = '700 30px Fraunces, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sign, Wc / 2, 61);
  return c;
}

/* --------------------------------------------------------------- particles */
const FX_VS = 'attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying vec3 vC; varying float vA;' +
  'void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, aSize * uScale / -mv.z); gl_Position = projectionMatrix * mv; }';
const FX_FS = 'varying vec3 vC; varying float vA; uniform float uSoft;' +
  'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, uSoft, r) * vA; if (a < 0.004) discard; gl_FragColor = vec4(vC, a);\n' +
  ' #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }';

class FxPool {
  constructor(n, additive, soft) {
    this.n = n; this.head = 0; this.live = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.a0 = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.grow = new Float32Array(n); this.floor = new Float32Array(n); this.wob = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize); geo.setAttribute('aAlpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FX_VS, fragmentShader: FX_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft == null ? 0.1 : soft } },
    });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
  }
  add(x, y, z, vx, vy, vz, life, size, color, alpha, grav, drag, grow, floor, wob) {
    const i = this.head; this.head = (this.head + 1) % this.n; const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.a0[i] = alpha; this.alpha[i] = alpha;
    this.grav[i] = grav || 0; this.drag[i] = drag || 0; this.grow[i] = grow || 0; this.floor[i] = floor == null ? -99 : floor; this.wob[i] = wob || 0;
    this.live = 1;
  }
  step(dt, t) {
    if (!this.live) return;
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      any++;
      const i3 = i * 3;
      this.life[i] -= dt;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 2] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
      const wb = this.wob[i] ? Math.sin(t * 5 + i) * this.wob[i] : 0;
      this.pos[i3] += (this.vel[i3] + wb) * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < this.floor[i]) { this.pos[i3 + 1] = this.floor[i]; this.vel[i3 + 1] = 0; this.vel[i3] *= 0.5; this.vel[i3 + 2] *= 0.5; }
      this.size[i] += this.grow[i] * dt;
      const k = clamp(this.life[i] / this.max[i], 0, 1);
      this.alpha[i] = this.life[i] > 0 ? this.a0[i] * (k < 0.6 ? k / 0.6 : 1) : 0;
    }
    if (!any) this.live = 0;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.aAlpha.needsUpdate = true; }
}
const FX = { add: null, norm: null, rings: [] };
const C = {
  gold: new THREE.Color('#ffc65c'), warm: new THREE.Color('#ffb736'), ink: new THREE.Color('#fbf5ec'), dust: new THREE.Color('#c8a87a'),
  green: new THREE.Color('#8ab040'), mote: new THREE.Color('#ffcf8a'), red: new THREE.Color('#ff5a3a'),
  petals: ['#ff8a1c', '#ffb31a', '#ff6a10', '#ffd040', '#e8442a'].map((s) => new THREE.Color(s)),
  kind: {}, tmp: new THREE.Color(),
};
for (const k in SACK) C.kind[k] = new THREE.Color(SACK[k].dust);

function ring(X, Y, Z, col, size, life) {
  if (!R3.ok) return;
  let best = FX.rings[0];
  for (const r of FX.rings) if (r.life <= 0) { best = r; break; }
  best.life = life || 0.5; best.max = best.life; best.size = size || 0.8;
  best.mesh.position.set(X, Y, Z); best.mesh.material.color.copy(col); best.mesh.visible = true;
}
function catchFx(X, Y, kind, combo) {
  if (!R3.ok) return;
  const col = C.kind[kind] || C.dust;
  for (let i = 0; i < 26; i++) { const a = rnd() * TAU, s = 0.4 + rnd() * 1.4; FX.norm.add(X + cos(a) * 0.2, Y, sin(a) * 0.15, cos(a) * s, 0.8 + rnd() * 1.6, sin(a) * s * 0.5, 0.6 + rnd() * 0.6, 0.06 + rnd() * 0.08, col, 0.7, 1.4, 2.2, 0.25, 0.02); }
  for (let i = 0; i < 10 + min(20, combo * 2); i++) { const a = rnd() * TAU, s = 0.6 + rnd() * 2; FX.add.add(X, Y + 0.1, 0, cos(a) * s, 1 + rnd() * 2.5, sin(a) * s * 0.4, 0.4 + rnd() * 0.4, 0.04 + rnd() * 0.04, rnd() < 0.5 ? C.gold : C.warm, 0.9, 3.5, 1.5); }
  ring(X, W.catchY + 0.02, 0, combo >= 5 ? C.warm : C.gold, 1.1 + min(1, combo * 0.1), 0.45);
}
function spoilFx(X, Y) {
  if (!R3.ok) return;
  for (let i = 0; i < 30; i++) { const a = rnd() * TAU, s = 0.2 + rnd() * 0.8; FX.norm.add(X, Y, 0, cos(a) * s, 0.4 + rnd() * 1.0, sin(a) * s * 0.4, 1 + rnd() * 0.7, 0.12 + rnd() * 0.12, C.green, 0.55, -0.2, 1.6, 0.35); }
  ring(X, W.catchY + 0.02, 0, C.green, 1.2, 0.5);
}
function thudFx(X, Z, spoil) {
  if (!R3.ok) return;
  for (let i = 0; i < 22; i++) { const a = rnd() * TAU, s = 0.5 + rnd() * 1.4; FX.norm.add(X + cos(a) * 0.15, 0.08, Z + sin(a) * 0.15, cos(a) * s, 0.3 + rnd() * 0.8, sin(a) * s, 0.7 + rnd() * 0.6, 0.12 + rnd() * 0.14, spoil ? C.green : C.dust, 0.5, 0.6, 2.4, 0.4, 0.02); }
  ring(X, 0.02, Z, spoil ? C.green : C.dust, 0.9, 0.5);
  arc.sfx.noise(0.12, { freq: 380, vol: 0.12 });
}
function marigolds(X, Y) {
  if (!R3.ok) return;
  for (let i = 0; i < 70; i++) { const a = rnd() * TAU, s = 0.6 + rnd() * 2.2; FX.norm.add(X, Y, 0.2, cos(a) * s, 2.5 + rnd() * 2.5, sin(a) * s * 0.5, 1.6 + rnd() * 0.8, 0.06 + rnd() * 0.04, C.petals[(rnd() * C.petals.length) | 0], 1, 3.2, 1.6, 0, 0.03, 0.8); }
  ring(X, W.catchY + 0.05, 0, C.warm, 2.4, 0.7);
}

/* --------------------------------------------------------------- sack visuals */
// A falling sack is a mesh from a small pool; a missed one keeps falling to
// the cobbles, lies there a moment and goes.
function takeVis(o) {
  if (!R3.ok) return null;
  let v = null;
  for (const s of M.vis) if (s.state === 'free') { v = s; break; }
  if (!v) { v = M.vis[0]; for (const s of M.vis) if (s.state === 'lie' && s.t > v.t) v = s; if (v.owner) v.owner.vis = null; }
  v.state = 'drop'; v.owner = o; v.t = 0; v.kind = o.kind;
  v.mesh.material = M.sackMats[o.kind]; v.mesh.visible = true; v.mesh.scale.setScalar(1);
  return v;
}
function releaseVis(o, how) {
  const v = o.vis; if (!v) return;
  o.vis = null; v.owner = null;
  if (how === 'fall') { v.state = 'fall'; v.t = 0; v.vy = -2.5; v.x = laneX(o.x); v.y = yToY(o.y); v.spoil = o.spoil; }
  else { v.state = 'free'; v.mesh.visible = false; }
}
function freeAll() { for (const v of M.vis) { v.state = 'free'; v.owner = null; v.mesh.visible = false; } }

function buildWorld() {
  const scene = new THREE.Scene();
  R3.scene = scene;
  scene.fog = new THREE.Fog('#6a3430', 16, 60);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), skyMaterial());
  sky.renderOrder = -10; scene.add(sky);

  // a dusk yard baked into an environment map for reflections on brass and wet stone
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), skyMaterial()));
    const pm = new THREE.PMREMGenerator(R3.renderer);
    R3.env = pm.fromScene(env, 0.04).texture; pm.dispose();
    scene.environment = R3.env; scene.environmentIntensity = 0.6;
  }
  const hemi = new THREE.HemisphereLight('#e08a60', '#2a1a12', 0.75); scene.add(hemi); R3.hemi = hemi;
  // the yard floodlight, nearly overhead, so a sack's shadow marks where it will land
  const key = new THREE.DirectionalLight('#ffe0b8', 1.6);
  key.position.set(1.5, 16, 5); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target); R3.key = key;
  const sun = new THREE.DirectionalLight('#ff8a40', 1.3); sun.position.set(14, 3, -20); scene.add(sun); M.sun = sun;
  const lampL = new THREE.PointLight('#ffa050', 6, 9, 1.5); lampL.position.set(0, 3.2, -1.2); scene.add(lampL); M.lamp = lampL;

  /* ground */
  const stone = colorTex(stoneCanvas(), true, true); stone.repeat.set(26, 17);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), std({ map: stone, roughness: 0.82, color: '#e8d0b8' }));
  ground.rotation.x = -PI / 2; ground.position.z = -8; ground.receiveShadow = true; scene.add(ground);

  /* warehouses and skyline */
  const wh = [
    { x: -8.5, z: -21, w: 8, h: 6, d: 5, sign: 'MASALA MANDI', tint: '#5a2e22' },
    { x: 1, z: -25, w: 9, h: 7, d: 5, sign: 'YARD 7  GODOWN', tint: '#4a2a26' },
    { x: 10.5, z: -21, w: 8, h: 5.5, d: 5, sign: 'CHAI AND GRAIN', tint: '#5e3426' },
    { x: -18, z: -25, w: 9, h: 7, d: 5, sign: 'COLD STORE', tint: '#3e2422' },
    { x: 19.5, z: -26, w: 9, h: 7.5, d: 5, sign: 'ROPE AND JUTE', tint: '#46281e' },
  ];
  const roofMat = std({ color: '#2a1a14', roughness: 0.6, metalness: 0.3 });
  const roofShape = new THREE.Shape(); roofShape.moveTo(-0.5, 0); roofShape.lineTo(0.5, 0); roofShape.lineTo(0, 0.22); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false }); roofGeo.translate(0, 0, -0.5);
  wh.forEach((b, i) => {
    const tex = colorTex(warehouseCanvas(b.sign, 50 + i, b.tint)); tex.repeat.set(1, 1);
    const front = std({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.32, roughness: 0.9 });
    const side = std({ color: b.tint, roughness: 0.95 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [side, side, side, side, front, side]);
    m.position.set(b.x, b.h / 2, b.z); m.receiveShadow = true; scene.add(m);
    const roof = new THREE.Mesh(roofGeo, roofMat); roof.scale.set(b.w + 0.6, b.w * 0.9, b.d + 0.4); roof.position.set(b.x, b.h, b.z); scene.add(roof);
  });
  const sk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std({ color: '#1e1218', roughness: 1 }), 18);
  const dm = new THREE.Object3D();
  for (let i = 0; i < 18; i++) { const w = 3 + rnd() * 5, h = 6 + rnd() * 12; dm.position.set(-40 + i * 4.8 + rnd() * 2, h / 2, -36 - rnd() * 6); dm.scale.set(w, h, 3); dm.updateMatrix(); sk.setMatrixAt(i, dm.matrix); }
  dm.scale.set(1, 1, 1); scene.add(sk);
  // a temple spire on the skyline
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 8), std({ color: '#2a1620', roughness: 1 }));
  spire.position.set(-6, 14, -40); scene.add(spire);

  /* the loft gallery the sacks drop from: a beam on posts, bracket lamps, pulleys */
  const woodC = makeCanvas(512, 128); woodGrain(woodC.getContext('2d'), 512, 128, '#9a6a42', '#3a2214', '#c08a5a', 9, 60);
  const woodTex = colorTex(woodC, true, true);
  const wood = std({ map: woodTex, roughness: 0.75, color: '#ffffff' });
  M.beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.42, 0.5), wood); M.beam.castShadow = true; scene.add(M.beam);
  M.beam2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1.6), std({ color: '#2a1a12', roughness: 0.8 })); scene.add(M.beam2);
  M.pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 1, 0.26), wood, 14); M.pillars.castShadow = true; scene.add(M.pillars);
  M.lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, 0.7) }), 14); scene.add(M.lamps);
  M.ropes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 5), std({ color: '#c8a870', roughness: 1 }), 6); scene.add(M.ropes);
  M.pulleys = new THREE.InstancedMesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), std({ color: '#8a6a3a', metalness: 0.7, roughness: 0.35 }), 6); scene.add(M.pulleys);
  // festoon lights strung under the loft
  M.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 28);
  for (let i = 0; i < 28; i++) M.bulbs.setColorAt(i, i % 3 === 0 ? new THREE.Color(1.8, 0.6, 0.25) : new THREE.Color(1.7, 1.1, 0.4));
  scene.add(M.bulbs);
  M.wireGeo = new THREE.BufferGeometry(); M.wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(29 * 3), 3));
  M.wire = new THREE.Line(M.wireGeo, new THREE.LineBasicMaterial({ color: '#1a120c' })); M.wire.frustumCulled = false; scene.add(M.wire);

  /* sacks: materials, the pool, background piles */
  const bump = colorTex(weaveBump(), false, true); bump.repeat.set(6, 3);
  M.sackMats = {};
  for (const k in SACK) M.sackMats[k] = std({ map: colorTex(sackCanvas(k)), bumpMap: bump, bumpScale: 1.5, roughness: 0.95 });
  const sg = sackGeometry(); M.sackGeo = sg;
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(sg, M.sackMats.spice); m.castShadow = true; m.receiveShadow = true; m.visible = false; scene.add(m);
    M.vis.push({ mesh: m, state: 'free', owner: null, t: 0, x: 0, y: 0, vy: 0, kind: 'spice', spoil: false });
  }
  // a soft blob on the cobbles under every falling sack: where it will land
  const bc = makeCanvas(128, 128); { const g = bc.getContext('2d'); const rg2 = g.createRadialGradient(64, 64, 4, 64, 64, 62); rg2.addColorStop(0, 'rgba(0,0,0,0.75)'); rg2.addColorStop(0.6, 'rgba(0,0,0,0.35)'); rg2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg2; g.fillRect(0, 0, 128, 128); }
  const blobG = new THREE.PlaneGeometry(1, 1); blobG.rotateX(-PI / 2);
  M.blobs = new THREE.InstancedMesh(blobG, new THREE.MeshBasicMaterial({ map: colorTex(bc), transparent: true, depthWrite: false, opacity: 0.8 }), 14);
  M.blobs.renderOrder = 2; M.blobs.frustumCulled = false; scene.add(M.blobs);
  const piles = new THREE.InstancedMesh(sg, M.sackMats.grain, 36);
  const pileAt = [[-4.6, -3.2, 7], [-2.8, -4.4, 5], [3.4, -3.6, 8], [5.6, -4.8, 6], [-7.5, -5.5, 6], [8.4, -6, 4]];
  let n = 0; const kinds = ['spice', 'tea', 'grain'];
  pileAt.forEach((p) => {
    for (let k = 0; k < p[2] && n < 36; k++, n++) {
      // a row of upright sacks with a second row leaning on them
      const row = k < 4 ? 0 : 1, col = row === 0 ? k : k - 4;
      dm.position.set(p[0] + (col - (row === 0 ? 1.5 : 1)) * 0.6 + (rnd() - 0.5) * 0.08, 0.36 + row * 0.12, p[1] - row * 0.5);
      dm.rotation.set(row ? -0.25 : (rnd() - 0.5) * 0.15, rnd() * TAU, (rnd() - 0.5) * 0.2); dm.scale.setScalar(1.2 + rnd() * 0.15);
      dm.updateMatrix(); piles.setMatrixAt(n, dm.matrix);
      const kk = kinds[(k + n) % 3];
      piles.setColorAt(n, new THREE.Color(kk === 'tea' ? '#8a6448' : kk === 'grain' ? '#ffffff' : '#ff9a72'));
    }
  });
  piles.count = n; dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1);
  piles.castShadow = true; piles.receiveShadow = true; scene.add(piles);

  /* the crate on its handcart */
  const cart = new THREE.Group(); scene.add(cart); M.cart = cart;
  const crate = new THREE.Group(); cart.add(crate); M.crate = crate;
  const plankC = makeCanvas(256, 256); { const g = plankC.getContext('2d'); woodGrain(g, 256, 256, '#7a5232', '#2a160a', '#a87444', 15, 70); g.fillStyle = 'rgba(20,10,4,0.7)'; for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 4); }
  const plankTex = colorTex(plankC, true, true); plankTex.repeat.set(1.6, 1.6);
  const plank = std({ map: plankTex, roughness: 0.7, color: '#ffffff' });
  const hw = 0.58, hd = 0.4, wall = 0.06, ch = 0.62;
  const ringS = new THREE.Shape(); ringS.moveTo(-hw, -hd); ringS.lineTo(hw, -hd); ringS.lineTo(hw, hd); ringS.lineTo(-hw, hd); ringS.closePath();
  const hole = new THREE.Path(); hole.moveTo(-hw + wall, -hd + wall); hole.lineTo(-hw + wall, hd - wall); hole.lineTo(hw - wall, hd - wall); hole.lineTo(hw - wall, -hd + wall); hole.closePath(); ringS.holes.push(hole);
  const wallsGeo = new THREE.ExtrudeGeometry(ringS, { depth: ch, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 });
  wallsGeo.rotateX(-PI / 2);
  const walls = new THREE.Mesh(wallsGeo, plank); walls.castShadow = true; walls.receiveShadow = true; crate.add(walls);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 0.1, 0.05, hd * 2 - 0.1), std({ color: '#2a1a10', roughness: 0.9 })); bed.position.y = 0.05; crate.add(bed);
  const iron = std({ color: '#6a6a66', metalness: 0.85, roughness: 0.35 });
  const straps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), iron, 4);
  [[0, 0.16, hd + 0.015, hw * 2 + 0.04, 0.05, 0.02], [0, 0.46, hd + 0.015, hw * 2 + 0.04, 0.05, 0.02], [0, 0.16, -hd - 0.015, hw * 2 + 0.04, 0.05, 0.02], [0, 0.46, -hd - 0.015, hw * 2 + 0.04, 0.05, 0.02]].forEach((s, i) => { dm.position.set(s[0], s[1], s[2]); dm.scale.set(s[3], s[4], s[5]); dm.updateMatrix(); straps.setMatrixAt(i, dm.matrix); });
  dm.scale.set(1, 1, 1); straps.castShadow = true; crate.add(straps);
  // the brass name plate on the front
  const plateC = makeCanvas(256, 64); { const g = plateC.getContext('2d'); g.fillStyle = '#c8913a'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#6a4a1c'; g.lineWidth = 6; g.strokeRect(4, 4, 248, 56); g.fillStyle = '#3a2410'; g.font = '700 34px JetBrains Mono, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('YARD', 128, 34); }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.11), std({ map: colorTex(plateC), metalness: 0.6, roughness: 0.35 }));
  plate.position.set(0, 0.31, hd + 0.03); crate.add(plate);
  // the glowing rim that brightens as a sack comes in
  const rimG = new THREE.EdgesGeometry(new THREE.BoxGeometry(hw * 2 + 0.02, 0.001, hd * 2 + 0.02));
  M.rim = new THREE.LineSegments(rimG, new THREE.LineBasicMaterial({ color: '#ff8a40', transparent: true, opacity: 0.5 }));
  M.rim.position.y = ch + 0.015; crate.add(M.rim);
  const glowG = new THREE.PlaneGeometry(1, 1); glowG.rotateX(-PI / 2);
  M.glow = new THREE.Mesh(glowG, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uA; void main(){ vec2 d = (vUv - 0.5) * 2.0; float r = length(d * vec2(1.0, 1.4)); float a = smoothstep(1.0, 0.2, r) * uA; gl_FragColor = vec4(vec3(1.0, 0.5, 0.2) * a, a);\n #include <colorspace_fragment>\n }',
  }));
  M.glow.position.y = ch - 0.08; M.glow.scale.set(hw * 2.4, 1, hd * 2.6); crate.add(M.glow);
  // the caught sacks, heaped in the crate
  const pileSpots = [[-0.27, 0.24, 0.05, 0.3], [0.25, 0.24, -0.04, -0.4], [0.0, 0.26, 0.1, 0.1], [-0.18, 0.5, -0.06, 1.2], [0.2, 0.52, 0.08, -1.0], [0.0, 0.62, -0.02, 0.6], [-0.05, 0.78, 0.05, 2.0]];
  for (const s of pileSpots) { const m = new THREE.Mesh(sg, M.sackMats.spice); m.position.set(s[0], s[1], s[2]); m.rotation.set(-PI / 2 + 0.15, s[3], 0.2); m.scale.setScalar(0.8); m.visible = false; m.castShadow = true; crate.add(m); M.pile.push(m); }
  crate.position.y = 0.26;
  // wheels and the handles
  M.wheels = [];
  const tyre = std({ color: '#2a2420', roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const wg = new THREE.Group(); wg.position.set(sx * (hw + 0.05), 0.24, 0); cart.add(wg); M.wheels.push(wg);
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 10, 24), tyre); w.rotation.y = PI / 2; w.castShadow = true; wg.add(w);
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.38, 0.04), wood); wg.add(sp);
    const sp2 = sp.clone(); sp2.rotation.x = PI / 2; wg.add(sp2);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), iron); hub.rotation.z = PI / 2; wg.add(hub);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, hw * 2 + 0.2, 8), iron); axle.rotation.z = PI / 2; axle.position.y = 0.24; cart.add(axle);
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8), wood);
    h.rotation.x = PI / 2 - 0.35; h.position.set(sx * 0.38, 0.72, -hd - 0.32); h.castShadow = true; cart.add(h);
  }

  /* the porter: kurta, dhoti, a red turban; walks when the crate moves */
  const P = { root: new THREE.Group() };
  cart.add(P.root); P.root.position.set(0, 0, -1.05);
  const skin = std({ color: '#9a5a38', roughness: 0.6 }), kurta = std({ color: '#efe6d2', roughness: 0.85 }), dhoti = std({ color: '#c8b48a', roughness: 0.9 }), turban = std({ color: '#c42a1e', roughness: 0.7 }), vest = std({ color: '#2a4a5a', roughness: 0.8 });
  const cap = (r, l, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), mat); m.castShadow = true; return m; };
  P.hips = new THREE.Group(); P.hips.position.y = 0.92; P.root.add(P.hips);
  P.torso = cap(0.19, 0.36, kurta); P.torso.position.y = 0.3; P.torso.scale.set(1, 1, 0.75); P.hips.add(P.torso);
  const vestM = cap(0.2, 0.2, vest); vestM.position.y = 0.38; vestM.scale.set(1.02, 1, 0.78); P.hips.add(vestM);
  P.head = new THREE.Group(); P.head.position.y = 0.72; P.hips.add(P.head);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin); head.castShadow = true; P.head.add(head);
  const tb = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.06, 10, 18), turban); tb.rotation.x = PI / 2; tb.position.y = 0.07; P.head.add(tb);
  const tbt = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), turban); tbt.position.y = 0.11; tbt.scale.set(1, 0.6, 1); P.head.add(tbt);
  const mous = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.02), std({ color: '#1a0e08' })); mous.position.set(0, -0.03, 0.12); P.head.add(mous);
  P.arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.23, 0.5, 0); P.hips.add(sh);
    const up = cap(0.055, 0.22, kurta); up.position.y = -0.15; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const fo = cap(0.045, 0.2, skin); fo.position.y = -0.13; el.add(fo);
    P.arms.push({ sh, el });
  }
  P.legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.1, 0, 0); P.hips.add(hip);
    const th = cap(0.075, 0.3, dhoti); th.position.y = -0.22; hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    const sh = cap(0.055, 0.3, skin); sh.position.y = -0.2; knee.add(sh);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.2), std({ color: '#3a2214', roughness: 0.8 })); ft.position.set(0, -0.42, 0.05); knee.add(ft);
    P.legs.push({ hip, knee });
  }
  M.P = P;

  /* effects */
  FX.add = new FxPool(600, true, 0.05); FX.norm = new FxPool(900, false, 0.25);
  scene.add(FX.add.mesh); scene.add(FX.norm.mesh);
  const rg = new THREE.RingGeometry(0.8, 1, 40); rg.rotateX(-PI / 2);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffb736', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false; m.renderOrder = 4; scene.add(m); FX.rings.push({ mesh: m, life: 0, max: 1, size: 1 });
  }
}

/* --------------------------------------------------------------- camera + layout */
function safeArea() {
  const pad = arc.hudPad ? arc.hudPad() : { top: 12, bottom: 52 };
  return { top: pad.top + 66, bottom: pad.bottom + (arc.touchMode ? 18 : 30) };
}

// Frame the yard: the crate's ground line low on the screen, the loft just
// under the HUD, and the lane as wide as the screen at the crate.
function layoutYard() {
  const cam = R3.camera, w = arc.w, h = arc.h, sa = safeArea();
  const key = w + 'x' + h + ':' + sa.top + ':' + sa.bottom;
  if (key === W.key) return;
  W.key = key;
  const portrait = w / h < 0.85;
  cam.fov = portrait ? 46 : 40; cam.aspect = w / h; cam.clearViewOffset(); cam.updateProjectionMatrix();
  const D = CAM.D, Yc = CAM.Y, tf = Math.tan(cam.fov * PI / 360);
  // the ground under the crate sits a little above the touch area
  const gyPx = min(h * 0.86, h - sa.bottom - (portrait ? 30 : 20));
  const yg = 1 - 2 * gyPx / h;
  const alpha = Math.atan(Yc / D);
  CAM.tilt = alpha - Math.atan(-yg * tf);
  cam.position.set(0, Yc, D); cam.lookAt(0, Yc - D * Math.tan(CAM.tilt), 0); cam.updateMatrixWorld(true);
  // the loft at the top of the safe area
  const yt = 1 - 2 * sa.top / h;
  W.loftY = Yc - D * Math.tan(CAM.tilt - Math.atan(yt * tf)) + 0.05;
  W.dropY = W.loftY - 0.45;
  W.catchY = 0.26 + 0.62;
  // the lane: the screen's width at the crate
  V.n.set(1, yg); R3.ray.setFromCamera(V.n, cam);
  const hit = R3.ray.ray.intersectPlane(R3.plane, V.c);
  const half = hit ? abs(hit.x) : 3;
  W.lane = half * 2 * 0.94;
  // loft dressing follows the frame
  const span = half * 2 + 8;
  M.beam.scale.set(span, 1, 1); M.beam.position.set(0, W.loftY + 0.21, -0.45);
  M.beam2.scale.set(span, 1, 1); M.beam2.position.set(0, W.loftY + 0.36, -1.2);
  const dm = new THREE.Object3D(); let n = 0;
  // posts stand just outside the lane and further out; a wide yard gets two more inside it
  const xs = [half + 0.3, half + 3.4, half + 6.5];
  if (half > 4) xs.push(half * 0.5);
  for (const x0 of xs) for (const sx of [-1, 1]) {
    if (n >= 14) break;
    const x = x0 * sx;
    dm.position.set(x, W.loftY / 2, -1.6); dm.scale.set(1, W.loftY, 1); dm.updateMatrix(); M.pillars.setMatrixAt(n, dm.matrix);
    dm.scale.set(1, 1, 1); dm.position.set(x, W.loftY - 0.6, -1.4); dm.updateMatrix(); M.lamps.setMatrixAt(n, dm.matrix);
    n++;
  }
  M.pillars.count = n; M.lamps.count = n; M.pillars.instanceMatrix.needsUpdate = true; M.lamps.instanceMatrix.needsUpdate = true;
  // pulleys and a sack waiting on a rope at each
  for (let i = 0; i < 6; i++) {
    const x = -half * 0.9 + (i + 0.5) * (half * 1.8 / 6), len = 0.3 + (i % 3) * 0.15;
    dm.position.set(x, W.loftY - 0.05, -0.75); dm.rotation.set(0, 0, 0); dm.updateMatrix(); M.pulleys.setMatrixAt(i, dm.matrix);
    dm.position.set(x, W.loftY - len / 2, -0.85); dm.scale.set(1, len, 1); dm.updateMatrix(); M.ropes.setMatrixAt(i, dm.matrix); dm.scale.set(1, 1, 1);
  }
  dm.rotation.set(0, 0, 0);
  M.pulleys.instanceMatrix.needsUpdate = true; M.ropes.instanceMatrix.needsUpdate = true;
  M.lamp.position.set(0, W.loftY - 0.8, -0.9);
  // the floodlight's shadow box hugs the lane
  const sc = R3.key.shadow.camera; sc.left = -half - 1.5; sc.right = half + 1.5; sc.top = 3; sc.bottom = -3; sc.near = 4; sc.far = 30;
  R3.key.position.set(1.0, 16, 2.4); sc.updateProjectionMatrix();
  W.half = half;
}

function cameraRig(dt) {
  layoutYard();
  const cam = R3.camera, rm = arc.reducedMotion;
  const menu = arc.state !== 'play' && arc.state !== 'pause';
  // a gentle parallax toward the crate, and a small push on combo moments
  const tx = rm ? 0 : laneX(G.px) * (menu ? 0.06 : 0.1);
  CAM.x = damp(CAM.x, tx, 2.5, dt);
  CAM.kick = max(0, CAM.kick - dt * 1.6);
  const push = rm ? 0 : sin(min(1, CAM.kick) * PI) * 0.6;
  const sway = rm || menu ? 0 : sin(R3.time * 0.4) * 0.03;
  cam.position.set(CAM.x + sway, CAM.Y, CAM.D - push);
  cam.lookAt(CAM.x * 0.6, CAM.Y - CAM.D * Math.tan(CAM.tilt), 0);
  if (arc.shakeX || arc.shakeY) { cam.translateX(arc.shakeX * 0.004); cam.translateY(arc.shakeY * 0.004); }
  cam.updateMatrixWorld(true);
}

function toPx(X, Y, Z, out) {
  V.a.set(X, Y, Z).project(R3.camera);
  out.x = (V.a.x * 0.5 + 0.5) * arc.w; out.y = (-V.a.y * 0.5 + 0.5) * arc.h;
  return out;
}
const PX = { x: 0, y: 0 };

/* --------------------------------------------------------------- per frame */
function updateSacks(dt) {
  const dm = M.dm2 || (M.dm2 = new THREE.Object3D());
  let nb = 0;
  for (const v of M.vis) {
    const m = v.mesh;
    if (v.state === 'drop' || v.state === 'fall') {
      const hgt = max(0, m.position.y - 0.2), k = clamp(1 - hgt / max(1, W.dropY), 0, 1);
      dm.position.set(m.position.x, 0.012, m.position.z); dm.scale.set(0.35 + k * 0.5, 1, 0.25 + k * 0.35); dm.updateMatrix(); M.blobs.setMatrixAt(nb++, dm.matrix);
    }
    if (v.state === 'drop' && v.owner) {
      const o = v.owner;
      o.rot += o.spin * dt;
      const X = laneX(o.x), Y = yToY(o.y);
      m.position.set(X, Y, 0);
      m.rotation.set(o.tilt + sin(R3.time * 3 + o.x * 9) * 0.15, o.rot, sin(R3.time * 2.3 + o.x * 5) * 0.25);
      // a faint streak of dust behind it, and a whiff of rot from a spoiled one
      if (!arc.reducedMotion && rnd() < dt * 18) FX.norm.add(X + (rnd() - 0.5) * 0.2, Y + 0.25, (rnd() - 0.5) * 0.1, 0, 0.3, 0, 0.5, 0.05 + rnd() * 0.04, o.spoil ? C.green : C.dust, 0.25, -0.2, 1, 0.1);
      if (o.spoil && rnd() < dt * 10) FX.add.add(X + (rnd() - 0.5) * 0.3, Y - 0.2, 0.1, 0, -0.6, 0, 0.6, 0.04, C.green, 0.6, 2, 0);
    } else if (v.state === 'fall') {
      v.t += dt; v.vy -= 14 * dt; v.y += v.vy * dt;
      const rest = 0.22;
      m.position.set(v.x, max(rest, v.y), 0.15);
      m.rotation.z = damp(m.rotation.z, 1.35, 6, dt);
      if (v.y <= rest) { v.state = 'lie'; v.t = 0; thudFx(v.x, 0.15, v.spoil); }
    } else if (v.state === 'lie') {
      v.t += dt;
      const k = clamp((v.t - 1.4) / 0.5, 0, 1);
      m.scale.set(1 + (v.t < 0.15 ? (0.15 - v.t) * 2 : 0), 1 - (v.t < 0.15 ? (0.15 - v.t) * 2 : 0) - k * 0.9, 1);
      m.position.y = 0.22 * (1 - k * 0.9);
      if (k >= 1) { v.state = 'free'; m.visible = false; m.scale.setScalar(1); }
    }
  }
  M.blobs.count = nb; M.blobs.instanceMatrix.needsUpdate = true;
}

function updateCart(dt) {
  const cart = M.cart, X = laneX(G.px);
  const dx = X - cart.position.x;
  cart.position.x = X;
  const speed = dt > 0 ? dx / dt : 0;
  M.cartV = damp(M.cartV || 0, speed, 10, dt);
  for (const w of M.wheels) w.rotation.x -= dx / 0.24;
  // squash on a catch, a lean into the direction of travel
  G.squash = max(0, G.squash - dt * 4);
  const s = arc.reducedMotion ? 0 : sin(G.squash * PI) * 0.12;
  M.crate.scale.set(1 + s, 1 - s, 1 + s);
  M.crate.rotation.z = damp(M.crate.rotation.z, clamp(-M.cartV * 0.015, -0.12, 0.12), 8, dt);
  // the rim and mouth glow when a sack is close
  const g = G.nearGlow;
  // after a miss the rim pulses red while the crate is safe (no strobe under reduced motion)
  const safe = G.inv > 0 && !G.attract;
  const pulse = safe ? (arc.reducedMotion ? 0.6 : 0.5 + 0.5 * sin(R3.time * 14)) : 0;
  M.glow.material.uniforms.uA.value = 0.15 + g * 0.85 + G.comboFlash * 0.8 + pulse * 0.4;
  M.rim.material.color.set(safe ? '#ff4030' : '#ff8a40');
  M.rim.material.opacity = 0.3 + g * 0.7 + pulse * 0.5;
  // the heap inside
  for (let i = 0; i < M.pile.length; i++) {
    const k = G.pile[i];
    M.pile[i].visible = !!k;
    if (k) M.pile[i].material = M.sackMats[k];
  }
  // the porter walks with the cart and looks up at the nearest sack
  const P = M.P, v = abs(M.cartV), walk = clamp(v / 3, 0, 1);
  M.walkT = (M.walkT || 0) + dt * (4 + v * 2.2) * (walk > 0.05 ? 1 : 0);
  const ph = M.walkT;
  for (let i = 0; i < 2; i++) {
    const L = P.legs[i], s2 = i ? 1 : -1;
    L.hip.rotation.x = sin(ph + (i ? PI : 0)) * 0.6 * walk;
    L.knee.rotation.x = max(0, sin(ph + (i ? PI : 0) + 1.2)) * 0.9 * walk;
    void s2;
  }
  P.hips.position.y = 0.92 + abs(sin(ph)) * 0.04 * walk;
  // turn the body into the walk a little
  P.root.rotation.y = damp(P.root.rotation.y, clamp(M.cartV * 0.05, -0.5, 0.5), 6, dt);
  P.hips.rotation.x = 0.18 + walk * 0.1;
  // arms reach for the handles
  for (let i = 0; i < 2; i++) { const a = P.arms[i]; a.sh.rotation.x = -0.75 + sin(ph + (i ? 0 : PI)) * 0.06 * walk; a.el.rotation.x = -0.55; a.sh.rotation.z = (i ? -1 : 1) * 0.12; }
  let ny = 0;
  for (const o of G.items) if (!o.spoil && o.y < GY && o.y > ny) ny = o.y;
  P.head.rotation.x = damp(P.head.rotation.x, -0.25 - (ny ? (1 - ny) * 0.4 : 0), 4, dt);
}

function frame3D(dt) {
  R3.time += dt;
  updateCart(dt);
  updateSacks(dt);
  // festoon lights: a sagging string across under the loft, twinkling
  const half = W.half || 3, n = 28, pos = M.wireGeo.attributes.position.array;
  const dm = M.dm || (M.dm = new THREE.Object3D());
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = -half - 0.6 + u * (2 * half + 1.2);
    const seg = (u * 3) % 1, y = W.loftY - 0.15 - sin(seg * PI) * 0.45;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = -0.35;
    if (i < n) {
      const tw = arc.reducedMotion ? 1 : 0.75 + 0.25 * sin(R3.time * 5 + i * 1.3);
      dm.position.set(x, y - 0.06, -0.35); dm.scale.setScalar(tw); dm.updateMatrix(); M.bulbs.setMatrixAt(i, dm.matrix);
    }
  }
  M.wireGeo.attributes.position.needsUpdate = true; M.bulbs.instanceMatrix.needsUpdate = true;
  M.lamp.intensity = 6 + (arc.reducedMotion ? 0 : sin(R3.time * 7) * sin(R3.time * 2.9) * 0.6);
  // rings
  for (const r of FX.rings) {
    if (r.life <= 0) continue;
    r.life -= dt;
    const k = 1 - clamp(r.life / r.max, 0, 1);
    r.mesh.scale.setScalar(r.size * (0.3 + k));
    r.mesh.material.opacity = (1 - k) * 0.8;
    if (r.life <= 0) r.mesh.visible = false;
  }
  // dust motes drifting through the lamplight
  if (!arc.reducedMotion && rnd() < dt * 6) FX.add.add((rnd() - 0.5) * 2 * half, 0.5 + rnd() * (W.loftY - 1), -0.5 - rnd() * 2, 0.15 + rnd() * 0.2, 0.05, 0, 4, 0.03 + rnd() * 0.02, C.mote, 0.45, 0, 0);
  FX.add.step(dt, R3.time); FX.norm.step(dt, R3.time);
  cameraRig(dt);
  const sc = R3.renderer.domElement.height / (2 * Math.tan(R3.camera.fov * PI / 360));
  FX.add.mat.uniforms.uScale.value = sc; FX.norm.mat.uniforms.uScale.value = sc;
  if (!R3.lock && arc.state === 'play') {
    R3.accT += R3.realDt; R3.accN++;
    if (R3.accT > 1.3 && R3.accN >= 3) {
      const avg = R3.accT / R3.accN; R3.fps = Math.round(1 / avg);
      if (avg > 0.05 && R3.q > 0) { R3.q = Math.max(0, R3.q - 2); applyQuality(); R3.settle = 0; } // under 20 fps: two steps now, not one every 2.6 s
      else if (R3.settle > 0) R3.settle--; else if (avg > 0.03 && R3.q > 0) { R3.q--; applyQuality(); R3.settle = 1; }
      R3.accT = 0; R3.accN = 0;
    }
  } else if (arc.state !== 'play') { R3.accT += R3.realDt; R3.accN++; if (R3.accT > 1.3) { R3.fps = Math.round(R3.accN / R3.accT); R3.accT = 0; R3.accN = 0; } }
}

function applyQuality() {
  const r = R3.renderer; if (!r) return;
  const f = (R3.soft ? [0.4, 0.6, 0.8, 1] : [0.55, 0.72, 0.88, 1])[R3.q];
  // A software renderer pays for every pixel on the CPU, so at its lowest tier it gets a fixed
  // budget, as Saffron City does, instead of filling every pixel of a 1440x900 window.
  const pr = Math.max(0.5, arc.dpr * f);
  r.setPixelRatio(R3.soft && R3.q === 0 ? Math.max(0.3, Math.min(pr, Math.sqrt(160000 / Math.max(1, arc.w * arc.h)))) : pr); r.setSize(arc.w, arc.h, false);
  // reflections cost the most on a software renderer, so the lightest level drops them for a brighter sky light
  // the lightest level also drops real shadows (the blob under each sack stays) and the low sun
  if (R3.scene) { R3.scene.environment = R3.q >= 1 ? R3.env : null; R3.hemi.intensity = R3.q >= 1 ? 0.75 : 1.3; M.sun.visible = R3.q >= 1; R3.key.castShadow = R3.q >= 1; }
  const key = R3.key, want = R3.q >= 3 ? 2048 : R3.q >= 1 ? 1024 : 512;
  if (key.shadow.mapSize.x !== want) { key.shadow.mapSize.set(want, want); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
}

function softwareGL() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch (e) { return false; }
}

function initRenderer() {
  try {
    R3.soft = softwareGL();
    const r = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: !R3.soft, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x1a0f12, 1);
    R3.renderer = r; R3.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
    arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; W.key = ''; });
    R3.q = R3.soft ? 0 : (window.matchMedia && matchMedia('(pointer: coarse)').matches ? 2 : 3);
    const q = /[?&]q=(\d)/.exec(location.search); if (q) { R3.q = clamp(+q[1], 0, 3); R3.lock = true; }
    R3.camera = new THREE.PerspectiveCamera(40, arc.w / arc.h, 0.1, 200);
    buildWorld();
    R3.scene.add(R3.camera);
    R3.ok = true;
    // Shared post pass: bloom on the lamps and catches, grade, grain; a swing onto the yard at the start.
    POST = createPost(R3.renderer, { arc, soft: R3.soft, intro: { yaw: 0.7, up: 0.4, back: 0.45 }, results: { yaw: 0.3 }, target: (v) => v.set(CAM.x * 0.6, CAM.Y - CAM.D * Math.tan(CAM.tilt), 0), look: { bloom: 0.5, threshold: 0.72 } });
    applyQuality();
  } catch (err) {
    R3.ok = false; R3.fail = String(err && err.message || err);
    try { console.warn('3D unavailable: ' + R3.fail); } catch (e) { /* ignore */ }
  }
}

/* ===================================================================== HUD (2D overlay) */
function rr(c, x, y, w, h, r) {
  r = min(r || 6, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function plate(c, x, y, w, h, r) {
  c.fillStyle = 'rgba(15,13,10,.72)'; rr(c, x, y, w, h, r); c.fill();
  c.strokeStyle = 'rgba(251,245,236,.12)'; c.lineWidth = 1; c.stroke();
}
function txt(c, s, x, y, size, col, wgt, align, font) {
  c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
  c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
}

function drawHUD(c) {
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
  const flash = G.comboFlash > 0;
  // On a phone the score plate narrows so it never runs under the centre chip.
  plate(c, pad.left, pad.top, min(150, w / 2 - 70 - pad.left - 8), 64, 12);
  txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
  txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
  const cx = w / 2 - 70, cy = pad.top;
  if (flash && !arc.reducedMotion) {
    c.fillStyle = 'rgba(255,105,64,' + (0.18 * (G.comboFlash / 0.45)).toFixed(3) + ')';
    rr(c, cx - 4, cy - 4, 148, 52, 14); c.fill();
    c.strokeStyle = 'rgba(255,183,54,' + (0.55 * (G.comboFlash / 0.45)).toFixed(3) + ')';
    c.lineWidth = 2; rr(c, cx - 4, cy - 4, 148, 52, 14); c.stroke();
  }
  plate(c, cx, cy, 140, 44, 12);
  const mid = G.clock ? (Math.max(0, G.clock | 0) + 's') : ('x' + G.combo);
  const hot = (G.clock && G.clock < 10) || G.combo >= 5 || flash;
  txt(c, mid, w / 2, pad.top + 22, 18, hot ? WARM : INK, 500, 'center', F_DISP);
  if (!G.clock && G.combo >= 3) txt(c, 'COMBO', w / 2, pad.top + 36, 8, GOLD, 600, 'center', F_MONO);
  const hx = w - pad.right - 18;
  for (let i = 0; i < G.maxLives; i++) {
    c.fillStyle = i < G.lives ? PRIM : 'rgba(251,245,236,.15)';
    c.beginPath(); c.arc(hx - i * 18, pad.top + 22, 6, 0, TAU); c.fill();
    if (i < G.lives) { c.fillStyle = 'rgba(255,183,54,.35)'; c.beginPath(); c.arc(hx - i * 18, pad.top + 22, 9, 0, TAU); c.fill(); }
  }
}

function drawPops(c) {
  if (!R3.ok) return;
  for (const p of G.pops) {
    toPx(p.X, p.Y, 0, PX);
    const k = clamp(p.life / p.max, 0, 1), age = 1 - k;
    const pop = arc.reducedMotion ? 1 : (age < 0.15 ? 0.6 + age / 0.15 * 0.6 : 1.2 - min(0.2, age - 0.15));
    c.save(); c.globalAlpha = clamp(k * 1.6, 0, 1);
    c.font = '700 ' + ((p.big ? 26 : 19) * pop).toFixed(1) + 'px ' + F_DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
    const y = PX.y - age * 50;
    c.lineWidth = 4; c.strokeStyle = 'rgba(15,13,10,.6)'; c.strokeText(p.text, PX.x, y);
    c.fillStyle = p.col; c.fillText(p.text, PX.x, y);
    c.restore();
  }
}

// Tap & swipe (the shell's gesture touch style): one finger, no stick or pads.
// The shell hides its own hint on touch, so the first seconds of play say it here.
function drawTouchHint(c, lines) {
  if (!gestStyle() || arc.state !== 'play' || G.attract) return;
  const t = arc.time, life = 5;
  if (t >= life) return;
  const a = arc.reducedMotion ? 1 : clamp(min(t / 0.35, (life - t) / 0.7), 0, 1);
  const w = arc.w, bw = min(w - 32, 340), lh = 19, bh = 20 + lines.length * lh;
  const pad = arc.hudPad ? arc.hudPad() : { bottom: 64 };
  const x = (w - bw) / 2, y = arc.h * 0.36 - bh / 2;
  void pad;
  c.save(); c.globalAlpha = a;
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

function drawFail(c) {
  const w = arc.w, h = arc.h;
  c.fillStyle = '#1a0f12'; c.fillRect(0, 0, w, h);
  txt(c, '3D graphics are not available in this browser.', w / 2, h * 0.45, 15, INK, 500, 'center');
  txt(c, 'The 2D yard is at /games/yard-catch', w / 2, h * 0.45 + 24, 13, GOLD, 500, 'center');
}

function render(c, a) {
  arc = a;
  const now = performance.now();
  R3.realDt = R3.last ? (now - R3.last) / 1000 : 1 / 60; R3.last = now;
  const dt = Math.min(0.05, R3.realDt);
  if (!R3.ok) drawFail(c);
  else if (!R3.lost) {
    frame3D(dt);
    if (POST) { POST.setQuality(R3.q, R3.lock); POST.render(R3.scene, R3.camera); } else R3.renderer.render(R3.scene, R3.camera);
  }
  // a red edge when a life goes (a soft vignette, never a flash under reduced motion)
  G.hurt = max(0, G.hurt - dt * 1.8);
  if (G.hurt > 0 && !G.attract) {
    const w = arc.w, h = arc.h, k = arc.reducedMotion ? min(G.hurt, 0.4) : G.hurt;
    const v = c.createRadialGradient(w / 2, h / 2, min(w, h) * 0.35, w / 2, h / 2, max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(160,30,20,0)'); v.addColorStop(1, 'rgba(160,30,20,' + (0.45 * k).toFixed(3) + ')');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }
  drawPops(c);
  if (arc.state === 'play' && !G.attract) drawHUD(c);
  drawTouchHint(c, ['Drag anywhere, the crate follows', 'Catch the brown sacks, skip the green']);
}

function dbg() {
  return {
    phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), lives: G.lives, combo: G.combo,
    px: +G.px.toFixed(3), items: G.items.length, caught: G.caught, attract: !!G.attract, t: +G.t.toFixed(2),
    touchDrag: +(G.touchDrag || 0).toFixed(2), touchStyle: arc.touchStyle,
    quality: R3.q, fps: R3.fps || null, webgl: R3.ok, lane: +W.lane.toFixed(2),
  };
}

function boot() {
  arc = window.Arcade.create({
    slug: 'yard-catch', title: 'Yard Catch', genre: 'Arcade catch', three: true,
    hint: 'Mouse or arrows move the crate   skip the green spoiled sacks',
    touchHint: 'Stick slides the crate, catch the brown sacks, skip the green',
    keys: [['Left / Right / A D', 'Slide the crate'], ['Mouse', 'The crate follows the pointer']],
    mouse: { cursor: 'none', keys: [['Move mouse', 'The crate follows']] },
    touch: { stick: true, pads: [] },
    touchKeys: [['On-screen stick', 'Slide the crate']],
    gestures: {
      drag: false,
      hint: 'Drag anywhere, the crate follows your finger',
      keys: [['Drag anywhere', 'The crate follows your finger'], ['Lift', 'The crate stays put']],
    },
    // Settings > Graphics: 'smooth' and 'sharp' pin a quality level, 'auto' hands it back to the frame-rate auto-scaler.
    graphics(level) { if (level === 'auto') { R3.lock = false; return; } R3.lock = true; R3.q = level === 'sharp' ? 3 : 1; applyQuality(); },
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Arcade catch',
      title: 'Yard <em>Catch</em>',
      html: '<p>Spice sacks drop from the warehouse loft as the yard lights come on. Wheel the crate under them, catch the good ones, and let the spoiled green sacks hit the cobbles. A miss or a spoiled catch costs a life.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'load', choices: [{ v: 'load', label: 'Three lives' }, { v: 'shift', label: '75 seconds' }, { v: 'clean', label: 'Clean catch' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Caught<b>' + G.caught + '</b></div></div>'; },
    resize(a) {
      arc = a;
      if (!R3.renderer) return;
      applyQuality(); W.key = '';
    },
    onMenu(a) { arc = a; reset(true); },
    init(a) { arc = a; a.debug = dbg; G.D = DIFF.normal; initRenderer(); if (R3.ok) layoutYard(); reset(true); a.menu(); },
    start(a, ch) {
      arc = a; reset(false, ch);
      if (R3.ok) { FX.add.clear(); FX.norm.clear(); }
      R3.accT = 0; R3.accN = 0; R3.settle = 1;
      const label = G.mode === 'shift' ? '75 seconds' : G.mode === 'clean' ? 'One life, skip the green' : 'Three lives';
      arc.toast(label, 'Yard Catch', 1400);
    },
    update, idle, render,
  });
  // for test scripts: the screen x of the lowest good sack, if any
  const target = () => { let best = null; for (const o of G.items) if (!o.spoil && (!best || o.y > best.y)) best = o; if (!best || !R3.ok) return null; toPx(laneX(best.x), 1, 0, PX); return PX.x; };
  window.__yardcatch = { G, R3, W, CAM, M, target };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
