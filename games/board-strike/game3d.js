import * as THREE from '/games/vendor/three/three.module.min.js';
/*
 * Board Strike 3D: a polished carrom board on a stand in a lamplit room.
 * Same rules, modes, scoring and controls as the 2D game.js (which stays the
 * fallback); the board, coins and room are real-time 3D on the Arcade shell.
 * Keyboard, mouse, a game controller and touch (tap & swipe, or stick and a
 * Strike pad) all aim and charge the same striker.
 */

const PI = Math.PI, TAU = Math.PI * 2;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, hypot = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rnd = Math.random;
const F_DISP = 'Fraunces, Times New Roman, serif';
const F_UI = 'Inter, sans-serif';
const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';

let arc;
const DIFF = {
  easy: { time: 95, slide: 1.55 },
  normal: { time: 75, slide: 1.8 },
  hard: { time: 55, slide: 2.15 },
};
const G = {
  t: 0, time: 75, score: 0, combo: 0, pocketed: 0, queen: false, phase: 'aim',
  pieces: [], striker: null, charge: 0, holding: false, aim: 0, sx: 0,
  floats: [], attract: true, moving: 0, mode: 'clock', diff: 'normal',
  flash: 0, shots: 0, hintT: 0, tg: null, slow: 0, focus: null, focusT: 0, clicks: 0,
};

/* ===================================================================== rules + physics
 * Board coordinates are the 2D game's: x and y in -1..1, y grows toward the
 * player, the striker sits on the baseline at y = 0.72. The 3D world maps
 * x -> X and y -> Z with the same numbers (one unit = half the board).
 */
const WALL = 0.88;
const POCKETS = [{ x: -0.86, y: -0.86 }, { x: 0.86, y: -0.86 }, { x: -0.86, y: 0.86 }, { x: 0.86, y: 0.86 }];
const MASS = { striker: 1.6, queen: 1.05, light: 1, dark: 1 };

function mkPiece(x, y, kind) {
  const r = kind === 'striker' ? 0.062 : (kind === 'queen' ? 0.048 : 0.044);
  return { x, y, vx: 0, vy: 0, r, kind, in: false, m: MASS[kind] || 1, rot: rnd() * TAU, spin: 0, drop: 0, pk: 0, slot: 0, fx: 0, fy: 0, pop: 0 };
}

function layout() {
  G.pieces = [];
  G.pieces.push(mkPiece(0, 0, 'queen'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    G.pieces.push(mkPiece(cos(a) * 0.16, sin(a) * 0.16, i % 2 ? 'dark' : 'light'));
  }
  G.striker = mkPiece(0, 0.72, 'striker');
  G.sx = 0; G.aim = 0; G.charge = 0; G.holding = false; G.moving = 0; G.tg = null;
  G.inPocket = [0, 0, 0, 0];
}

function reset(attract, ch) {
  G.mode = (ch && ch.mode) || G.mode || 'clock';
  G.diff = (ch && ch.diff) || G.diff || 'normal';
  const D = DIFF[G.diff] || DIFF.normal;
  G.t = 0; G.time = D.time; G.score = 0; G.combo = 0; G.pocketed = 0; G.queen = false;
  G.phase = 'aim'; G.floats.length = 0; G.attract = !!attract; G.flash = 0;
  G.shots = 0; G.hintT = 0; G.slow = 0; G.focus = null; G.focusT = 0;
  layout();
  if (R3.ok) clearFx();
}

function floatAt(x, y, text, col, big) {
  G.floats.push({ x, y, text, col: col || WARM, life: 1.1, max: 1.1, big: !!big });
}

function pocket(p, k) {
  if (p.in) return;
  p.in = true; p.fx = p.x; p.fy = p.y; p.pk = k; p.drop = 0;
  p.slot = G.inPocket[k]++;
  const pk = POCKETS[k];
  if (p.kind === 'striker') {
    if (G.mode !== 'practice') { G.score = max(0, G.score - 20); G.combo = 0; }
    arc.toast(G.mode === 'practice' ? 'Try again' : 'Foul', 'Striker in', 800);
    arc.sfx.tone(160, 0.12, { type: 'sawtooth', vol: 0.1 });
    G.flash = 0.18;
    if (!G.attract) { arc.shake = Math.max(arc.shake, 7); arc.buzz(40); }
    burst(pk.x, pk.y, 'foul');
    return;
  }
  const pts = p.kind === 'queen' ? 50 : 15;
  const gained = pts * (1 + G.combo);
  G.score += gained; G.pocketed++; G.combo++;
  if (p.kind === 'queen') G.queen = true;
  burst(pk.x, pk.y, p.kind === 'queen' ? 'queen' : 'coin');
  floatAt(pk.x * 0.82, pk.y * 0.82, '+' + Math.round(gained), p.kind === 'queen' ? WARM : GOLD, p.kind === 'queen' || G.combo > 2);
  G.flash = 0.12;
  arc.sfx.tone(p.kind === 'queen' ? 880 : 520, 0.12, { type: 'sine', vol: 0.14 });
  arc.sfx.tone(p.kind === 'queen' ? 1320 : 780, 0.1, { type: 'triangle', vol: 0.06, delay: 0.06 });
  arc.toast(p.kind === 'queen' ? 'Queen' : 'Pocket', '+' + pts, 700);
  if (!G.attract) arc.buzz(p.kind === 'queen' ? 30 : 14);
  if (p.kind === 'queen' && !G.attract && !arc.reducedMotion) { G.slow = 0.55; G.focus = pk; G.focusT = 1.1; }
  if (G.pieces.every((c) => c.kind === 'striker' || c.in)) {
    burst(0, 0, 'clear');
    finish('Cleared');
  }
}

function finish(why) {
  if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
  G.phase = 'over';
  const cleared = G.pieces.every((c) => c.kind === 'striker' || c.in);
  arc.over({
    eyebrow: why || 'Clock', title: cleared ? 'Board <em>clear</em>' : (G.mode === 'clock' ? 'Time' : 'Board <em>left</em>'),
    score: Math.round(G.score), scoreLabel: 'Points',
    html: '<p>' + G.pocketed + ' coins pocketed' + (G.queen ? ', queen down' : '') + '.</p>',
    again: 'Strike again',
  });
}

// Two discs meet: a real impulse with the striker heavier than the coins,
// a little energy lost, and the rub between them sets them spinning.
function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = hypot(dx, dy), minD = a.r + b.r;
  if (d < 1e-6 || d >= minD) return 0;
  const nx = dx / d, ny = dy / d, overlap = minD - d;
  const ia = 1 / a.m, ib = 1 / b.m, s = ia + ib;
  a.x -= nx * overlap * ia / s; a.y -= ny * overlap * ia / s;
  b.x += nx * overlap * ib / s; b.y += ny * overlap * ib / s;
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const dv = rvx * nx + rvy * ny;
  if (dv > 0) return 0;
  const j = -(1 + 0.84) * dv / s;
  a.vx -= j * nx * ia; a.vy -= j * ny * ia;
  b.vx += j * nx * ib; b.vy += j * ny * ib;
  const tang = rvx * -ny + rvy * nx;
  a.spin += tang * 18; b.spin -= tang * 18;
  if (-dv > 0.25) hitFx(a.x + nx * a.r, a.y + ny * a.r, -dv);
  return -dv;
}

function stepPhysics(dt) {
  const all = G.allPieces || (G.allPieces = []);
  all.length = 0;
  for (let i = 0; i < G.pieces.length; i++) all.push(G.pieces[i]);
  all.push(G.striker);
  const slide = (DIFF[G.diff] || DIFF.normal).slide;
  let vmax = 0;
  for (let i = 0; i < all.length; i++) { const p = all[i]; if (!p.in) vmax = max(vmax, hypot(p.vx, p.vy)); }
  // Small steps when things are fast, so a hard strike never tunnels through a coin.
  const n = clamp(Math.ceil(vmax * dt / 0.014), 1, 10), h = dt / n;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      if (p.in) continue;
      p.x += p.vx * h; p.y += p.vy * h;
      const f = Math.exp(-h * slide);
      p.vx *= f; p.vy *= f;
      if (abs(p.x) > WALL) { const v = abs(p.vx); p.x = WALL * Math.sign(p.x); p.vx *= -0.72; p.spin += p.vy * 10 * Math.sign(p.x); if (v > 0.35) wallFx(p.x + Math.sign(p.x) * p.r, p.y, v); }
      if (abs(p.y) > WALL) { const v = abs(p.vy); p.y = WALL * Math.sign(p.y); p.vy *= -0.72; p.spin -= p.vx * 10 * Math.sign(p.y); if (v > 0.35) wallFx(p.x, p.y + Math.sign(p.y) * p.r, v); }
      for (let k = 0; k < 4; k++) { const q = POCKETS[k]; if (hypot(p.x - q.x, p.y - q.y) < 0.09) { pocket(p, k); break; } }
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      if (all[i].in || all[j].in) continue;
      collide(all[i], all[j]);
    }
  }
  let moving = 0;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    p.spin *= Math.exp(-dt * 2.4);
    if (p.in) { p.drop += dt; continue; }
    p.rot += p.spin * dt;
    if (hypot(p.vx, p.vy) > 0.02) moving++;
  }
  G.moving = moving;
  if (G.phase === 'roll' && moving === 0) {
    G.phase = 'aim';
    const st = G.striker;
    if (st.in) st.pop = 1;
    st.x = G.sx; st.y = 0.72; st.vx = st.vy = 0; st.in = false; st.drop = 0;
    G.charge = 0; G.holding = false;
  }
}

function shoot() {
  const pwr = 1.1 + G.charge * 3.4;
  G.striker.vx = sin(G.aim) * pwr;
  G.striker.vy = -cos(G.aim) * pwr;
  G.striker.spin = (rnd() - 0.5) * 4;
  G.phase = 'roll'; G.holding = false;
  const c = G.charge; G.charge = 0;
  if (!G.attract) G.shots++;
  arc.sfx.tone(240 + pwr * 40, 0.08, { type: 'triangle', vol: 0.12 });
  arc.sfx.noise(0.06, { freq: 2400, vol: 0.05 });
  shotFx(G.striker.x, G.striker.y, c);
  if (!G.attract && c > 0.75) { arc.shake = Math.max(arc.shake, 3); arc.buzz(12); }
}

/* --------------------------------------------------------------- aiming input */
// Tap & swipe on a phone, one finger, no buttons (the 2D game's design). The
// first 14 px of a drag decide what it is: sideways slides the striker along
// the baseline, down is a slingshot (pull back, the further the harder, let
// go to strike) and up points at a target (hold to charge, or flick up to
// strike at once). A tap on the baseline places the striker there; a tap
// above it aims.
function gestTouch() {
  const p = arc.input.pointer;
  return !!arc.touchMode && arc.touchStyle === 'gesture' && !!p && p.type !== 'mouse';
}

function aimAt(x, y) {
  const w = fromPx(x, y);
  if (!w) return;
  G.aim = clamp(Math.atan2(w.x - G.sx, -(w.y - 0.72)), -1.15, 1.15);
}

function readTouch(dt) {
  const inp = arc.input, gz = inp.gesture, bs = boardPx(), u = 2 / bs;
  if (gz.active && gz.type !== 'mouse') {
    if (!G.tg) G.tg = { x: gz.x, y: gz.y, sx: G.sx, mode: '', t: 0, done: false };
    const tg = G.tg;
    if (tg.done) return;
    tg.t += dt;
    const dx = gz.x - tg.x, dy = gz.y - tg.y;
    if (!tg.mode && hypot(dx, dy) > 14) tg.mode = abs(dx) > abs(dy) * 1.2 ? 'place' : dy > 0 ? 'sling' : 'point';
    if (!tg.mode && tg.t > 0.35) tg.mode = 'point';
    if (tg.mode === 'place') {
      G.sx = clamp(tg.sx + dx * u, -0.62, 0.62);
      if (dy > 34) { tg.mode = 'sling'; tg.x = gz.x; tg.y = gz.y; }
    }
    if (tg.mode === 'sling') {
      const ox = gz.x - tg.x, oy = gz.y - tg.y;
      G.charge = clamp((hypot(ox, oy) - 10) / (bs * 0.42), 0, 1);
      G.holding = G.charge > 0.04;
      if (oy > 4) G.aim = clamp(Math.atan2(-ox, oy), -1.15, 1.15);
    } else if (tg.mode === 'point') {
      aimAt(gz.x, gz.y);
      G.holding = true; G.charge = min(1, G.charge + dt * 1.05);
      if (G.charge >= 1) { tg.done = true; shoot(); }
    }
    return;
  }
  const tg = G.tg; G.tg = null;
  const tp = inp.tap(), sw = inp.swipe();
  if (!tg) return;
  if (tg.done) return;
  if (tg.mode === 'sling' || tg.mode === 'point') {
    if (tg.mode === 'point' && sw && sw.dy < 0) {
      G.aim = clamp(Math.atan2(sw.dx, -sw.dy), -1.15, 1.15);
      G.charge = max(G.charge, 0.2 + 0.8 * sw.power);
    }
    if (G.charge >= 0.06) shoot();
    else { G.charge = 0; G.holding = false; }
    return;
  }
  G.charge = 0; G.holding = false;
  if (!tg.mode && tp) {
    const w = fromPx(tp.x, tp.y);
    if (w && abs(w.y - 0.72) < 0.14 && abs(w.x) < 0.9) G.sx = clamp(w.x, -0.62, 0.62);
    else aimAt(tp.x, tp.y);
  }
}

function readAim(dt) {
  const inp = arc.input, p = inp.pointer, ax = inp.axis();
  if (gestTouch() && (inp.gesture.active || G.tg)) {
    readTouch(dt);
    if (G.phase === 'aim') { G.striker.x = G.sx; G.striker.y = 0.72; }
    return;
  }
  // In tap & swipe a lifted finger leaves no hover, so the pointer does not aim.
  const hover = p && p.seen && !gestTouch();
  const charging = G.holding || inp.action();
  const w = hover ? fromPx(p.x, p.y) : null;
  if (!charging) {
    G.sx = clamp(G.sx + ax.x * dt * 1.55, -0.62, 0.62);
    if (w && abs(ax.x) < 0.08 && !p.down && w.y > 0.45) G.sx = clamp(w.x, -0.62, 0.62);
  }
  if (w) G.aim = clamp(Math.atan2(w.x - G.sx, -(w.y - 0.72)), -1.15, 1.15);
  else if (!hover) G.aim = clamp(G.aim + ax.x * dt * (charging ? 1.2 : 1.8), -1.15, 1.15);
  G.striker.x = G.sx; G.striker.y = 0.72;
  const down = inp.action();
  if (down) {
    G.holding = true; G.charge = min(1, G.charge + dt * 1.05);
    if (G.charge >= 1) shoot();
  } else if (G.holding) shoot();
}

function tickFloats(dt) {
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i]; f.life -= dt;
    if (f.life <= 0) G.floats.splice(i, 1);
  }
}

function update(dt) {
  G.t += dt; G.hintT += dt;
  G.flash = max(0, G.flash - dt);
  if (G.phase === 'over') return;
  if (G.mode === 'clock') {
    G.time -= dt;
    if (G.time <= 0) { G.time = 0; finish('Clock'); return; }
  }
  if (G.phase === 'aim') readAim(dt);
  // A queen going down plays out a touch slower; the clock does not slow.
  let pdt = dt;
  if (G.slow > 0) { G.slow = max(0, G.slow - dt); pdt = dt * 0.4; }
  stepPhysics(pdt);
  tickFloats(dt);
}

function idle(dt) {
  G.attract = true; G.t += dt;
  if (!G.striker || G.phase === 'over' || G.pieces.every((c) => c.kind === 'striker' || c.in)) reset(true);
  if (G.phase === 'aim') {
    // The demo lines up its next strike in view, then takes it.
    const ph = G.t % 2.4;
    G.aim = sin(G.t) * 0.4;
    G.charge = ph > 1.2 ? (ph - 1.2) / 0.95 * 0.6 : 0;
    if (ph > 2.15) { G.charge = 0.55 + 0.2 * sin(G.t * 2); shoot(); }
  }
  stepPhysics(dt);
  tickFloats(dt);
}

/* ===================================================================== 3D */
const R3 = {
  ok: false, lost: false, renderer: null, scene: null, camera: null, q: 3, lock: false, soft: false,
  aniso: 4, fps: 0, accT: 0, accN: 0, settle: 2, last: 0, realDt: 1 / 60, time: 0,
  key: null, ray: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.012),
};
const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), n: new THREE.Vector2() };
const M = {};       // meshes
const CAM = { pitch: 1.0, yaw: 0, dist: 6, ox: 0, oy: 0, fitKey: '', zoom: 1, tx: 0, tz: 0, sway: 0, look: new THREE.Vector3() };
const BOARD_Y = 0;  // top of the playing surface

function colorTex(canvas, srgb, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = R3.aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Long wood grain: wavy streaks, pores, and a soft sheen.
function woodGrain(g, w, h, base, dark, light, seed, streaks) {
  const r = window.Arcade.rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const n = streaks || 140;
  for (let i = 0; i < n; i++) {
    const y0 = r() * h, amp = 2 + r() * 10, fr = 0.002 + r() * 0.01, ph = r() * TAU;
    g.strokeStyle = r() < 0.6 ? dark : light;
    g.globalAlpha = 0.04 + r() * 0.16;
    g.lineWidth = 0.6 + r() * (r() < 0.15 ? 5 : 2);
    g.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = y0 + sin(x * fr + ph) * amp + sin(x * fr * 3.1 + ph * 2) * amp * 0.25;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  // pores
  g.fillStyle = dark;
  for (let i = 0; i < w * h / 600; i++) { g.globalAlpha = 0.05 + r() * 0.1; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1); }
  g.globalAlpha = 1;
}

function boardTexture(N) {
  const c = makeCanvas(N, N), g = c.getContext('2d');
  const S = 0.95;
  const P = (v) => (v + S) / (2 * S) * N, L = (v) => v / (2 * S) * N;
  woodGrain(g, N, N, '#e6c897', '#a8784a', '#f6dfb4', 7, 220);
  // varnish depth: warmer at the edges, a lamp-lit sheen in the middle
  const vg = g.createRadialGradient(N / 2, N / 2, N * 0.1, N / 2, N / 2, N * 0.72);
  vg.addColorStop(0, 'rgba(255,240,210,0.10)'); vg.addColorStop(0.7, 'rgba(160,100,40,0)'); vg.addColorStop(1, 'rgba(110,60,20,0.22)');
  g.fillStyle = vg; g.fillRect(0, 0, N, N);
  const red = '#a3241c', blk = '#1d120c';
  const line = (x1, y1, x2, y2, wdt, col) => { g.strokeStyle = col; g.lineWidth = L(wdt); g.beginPath(); g.moveTo(P(x1), P(y1)); g.lineTo(P(x2), P(y2)); g.stroke(); };
  const circ = (x, y, r, wdt, col, fill) => { g.beginPath(); g.arc(P(x), P(y), L(r), 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (wdt) { g.strokeStyle = col; g.lineWidth = L(wdt); g.stroke(); } };
  g.lineCap = 'round';
  // thin border just inside the frame
  g.strokeStyle = blk; g.lineWidth = L(0.006); g.strokeRect(P(-0.915), P(-0.915), L(1.83), L(1.83));
  for (let side = 0; side < 4; side++) {
    g.save(); g.translate(N / 2, N / 2); g.rotate(side * PI / 2); g.translate(-N / 2, -N / 2);
    // the baseline pair, red circles at each end
    line(-0.62, 0.66, 0.62, 0.66, 0.009, blk);
    line(-0.62, 0.78, 0.62, 0.78, 0.004, blk);
    for (const sx of [-0.62, 0.62]) {
      circ(sx, 0.72, 0.062, 0.006, blk, red);
      circ(sx, 0.72, 0.042, 0.003, '#f2d7a8');
      circ(sx, 0.72, 0.016, 0, null, '#f2d7a8');
    }
    // corner arrows toward the pocket
    g.save(); g.translate(N / 2, N / 2); g.rotate(PI / 4); g.translate(-N / 2, -N / 2);
    const d0 = 0.42 * Math.SQRT2 * 0.71, d1 = 0.74 * Math.SQRT2 * 0.71;
    line(0, d0 + 0.05, 0, d1, 0.006, blk);
    g.strokeStyle = blk; g.lineWidth = L(0.006);
    g.beginPath(); g.moveTo(P(-0.035), P(d1 - 0.05)); g.lineTo(P(0), P(d1)); g.lineTo(P(0.035), P(d1 - 0.05)); g.stroke();
    g.beginPath(); g.arc(P(0), P(d0 + 0.05 - 0.06), L(0.06), 0.15 * PI, 0.85 * PI); g.stroke();
    g.restore();
    g.restore();
  }
  // centre circles and the flower
  circ(0, 0, 0.27, 0.007, blk);
  circ(0, 0, 0.255, 0.003, red);
  g.save(); g.translate(N / 2, N / 2);
  for (let i = 0; i < 8; i++) {
    g.rotate(PI / 4);
    g.beginPath(); g.moveTo(0, 0);
    g.quadraticCurveTo(L(0.05), -L(0.11), 0, -L(0.22));
    g.quadraticCurveTo(-L(0.05), -L(0.11), 0, 0);
    g.fillStyle = i % 2 ? 'rgba(163,36,28,0.78)' : 'rgba(29,18,12,0.72)'; g.fill();
    g.strokeStyle = blk; g.lineWidth = L(0.0025); g.stroke();
  }
  g.restore();
  circ(0, 0, 0.055, 0.004, blk, red);
  circ(0, 0, 0.02, 0, null, '#f2d7a8');
  // dark wear rings around each pocket
  for (const k of POCKETS) {
    const rg = g.createRadialGradient(P(k.x), P(k.y), L(0.06), P(k.x), P(k.y), L(0.12));
    rg.addColorStop(0, 'rgba(30,18,10,0.55)'); rg.addColorStop(1, 'rgba(30,18,10,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(P(k.x), P(k.y), L(0.12), 0, TAU); g.fill();
    circ(k.x, k.y, 0.074, 0.006, blk);
  }
  // a dusting of carrom powder, heavier where hands rest
  const r = window.Arcade.rng(99);
  for (let i = 0; i < 2600; i++) {
    const ang = r() * TAU, rad = Math.sqrt(r()) * 0.95;
    const x = cos(ang) * rad, y = sin(ang) * rad;
    g.fillStyle = 'rgba(255,252,244,' + (0.08 + r() * 0.18).toFixed(3) + ')';
    g.fillRect(P(x), P(y), 1 + r() * 1.6, 1 + r() * 1.6);
  }
  return c;
}

function coinCanvas(kind) {
  const N = 256, c = makeCanvas(N, N), g = c.getContext('2d'), R = N / 2;
  const pal = {
    light: { base: '#efe0bf', ring: '#b89466', dark: '#9b7a50', grain: '#c9a876', hi: '#fff7e6' },
    dark: { base: '#2b1a12', ring: '#6e4a30', dark: '#120a06', grain: '#4a2e1e', hi: '#7a5236' },
    queen: { base: '#e9a531', ring: '#7a3a10', dark: '#5a2408', grain: '#c47a1c', hi: '#ffe39a' },
    striker: { base: '#ff6a42', ring: '#fbe9d0', dark: '#9a2410', grain: '#e04a26', hi: '#ffc1a4' },
  }[kind];
  // wood grain clipped to the disc, so a spinning coin shows it turn
  g.save(); g.beginPath(); g.arc(R, R, R, 0, TAU); g.clip();
  woodGrain(g, N, N, pal.base, pal.grain, pal.hi, kind.length * 31 + 5, 50);
  const sh = g.createRadialGradient(R * 0.7, R * 0.6, 4, R, R, R);
  sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = sh; g.fillRect(0, 0, N, N);
  g.restore();
  const ring = (r, w, col, a) => { g.globalAlpha = a == null ? 1 : a; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(R, R, r, 0, TAU); g.stroke(); g.globalAlpha = 1; };
  ring(R * 0.9, 5, pal.dark, 0.7);
  ring(R * 0.82, 3, pal.ring, 0.9);
  ring(R * 0.6, 4, pal.dark, 0.6);
  ring(R * 0.34, 3, pal.ring, 0.8);
  if (kind === 'queen') {
    g.fillStyle = '#1a120c'; g.beginPath(); g.arc(R, R, R * 0.3, 0, TAU); g.fill();
    ring(R * 0.18, 5, '#c9a96e');
  } else if (kind === 'striker') {
    // a cream star inlay
    g.fillStyle = pal.ring; g.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU - PI / 2, rr = i % 2 ? R * 0.2 : R * 0.48; g.lineTo(R + cos(a) * rr, R + sin(a) * rr); }
    g.closePath(); g.fill();
    g.fillStyle = pal.dark; g.beginPath(); g.arc(R, R, R * 0.1, 0, TAU); g.fill();
  } else {
    g.fillStyle = pal.dark; g.globalAlpha = 0.5; g.beginPath(); g.arc(R, R, R * 0.08, 0, TAU); g.fill(); g.globalAlpha = 1;
  }
  return c;
}

function coinBump() {
  const N = 256, c = makeCanvas(N, N), g = c.getContext('2d'), R = N / 2;
  g.fillStyle = '#808080'; g.fillRect(0, 0, N, N);
  const groove = (r, w) => { g.strokeStyle = '#3a3a3a'; g.lineWidth = w; g.beginPath(); g.arc(R, R, r, 0, TAU); g.stroke(); g.strokeStyle = '#b0b0b0'; g.lineWidth = w * 0.5; g.beginPath(); g.arc(R, R, r + w * 0.7, 0, TAU); g.stroke(); };
  groove(R * 0.9, 6); groove(R * 0.6, 5); groove(R * 0.34, 4);
  return c;
}

// A coin: a lathe with a rounded rim and a faintly dished face, UVs laid flat
// from above so the face texture sits square.
function coinGeometry(r, t) {
  const pts = [
    [0, 0], [r * 0.9, 0], [r * 0.985, t * 0.06], [r, t * 0.22], [r, t * 0.78], [r * 0.985, t * 0.94],
    [r * 0.93, t], [r * 0.86, t * 0.985], [r * 0.5, t * 0.95], [0, t * 0.94],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  const geo = new THREE.LatheGeometry(pts, 40);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * r) + 0.5, 0.5 - pos.getZ(i) / (2 * r));
  geo.computeVertexNormals();
  return geo;
}

function skyCanvas() {
  const W = 512, H = 512, c = makeCanvas(W, H), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a1524'); sky.addColorStop(0.35, '#3a2438'); sky.addColorStop(0.62, '#8a3a2e');
  sky.addColorStop(0.82, '#c45b38'); sky.addColorStop(1, '#e09050');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const halo = g.createRadialGradient(W * 0.7, H * 0.55, 6, W * 0.7, H * 0.55, 140);
  halo.addColorStop(0, 'rgba(255,200,120,0.9)'); halo.addColorStop(0.2, 'rgba(255,140,70,0.35)'); halo.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = halo; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff1d8'; g.beginPath(); g.arc(W * 0.7, H * 0.55, 18, 0, TAU); g.fill();
  const r = window.Arcade.rng(3);
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,240,220,' + (0.3 + r() * 0.6) + ')'; g.fillRect(r() * W, r() * H * 0.35, 1.5, 1.5); }
  // rooftops and a temple silhouette
  let x = 0;
  while (x < W) {
    const bw = 30 + r() * 60, bh = 60 + r() * 120;
    g.fillStyle = '#1a1018'; g.fillRect(x, H - bh, bw + 1, bh);
    for (let k = 0; k < 6; k++) if (r() < 0.6) { g.fillStyle = r() < 0.5 ? 'rgba(255,190,90,0.8)' : 'rgba(255,140,70,0.6)'; g.fillRect(x + 6 + r() * (bw - 14), H - bh + 10 + r() * (bh - 20), 5, 7); }
    x += bw;
  }
  g.fillStyle = '#140c14'; g.beginPath(); g.moveTo(W * 0.3, H - 150); g.lineTo(W * 0.36, H - 230); g.lineTo(W * 0.42, H - 150); g.closePath(); g.fill();
  g.fillRect(W * 0.28, H - 150, W * 0.16, 150);
  return c;
}

function rugCanvas() {
  const W = 1024, H = 768, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#7a2420'; g.fillRect(0, 0, W, H);
  const band = (i, col) => { g.fillStyle = col; g.fillRect(i, i, W - i * 2, H - i * 2); };
  band(18, '#e8d2a8'); band(34, '#24305a'); band(70, '#e8d2a8'); band(80, '#9a2c22'); band(130, '#c98a3a'); band(140, '#8a2a20');
  // diamonds along the borders and a central medallion
  g.fillStyle = '#e8d2a8';
  for (let x = 60; x < W - 40; x += 40) { g.beginPath(); g.moveTo(x, 52); g.lineTo(x + 12, 40); g.lineTo(x + 24, 52); g.lineTo(x + 12, 64); g.closePath(); g.fill(); g.beginPath(); g.moveTo(x, H - 52); g.lineTo(x + 12, H - 40); g.lineTo(x + 24, H - 52); g.lineTo(x + 12, H - 64); g.closePath(); g.fill(); }
  g.save(); g.translate(W / 2, H / 2);
  for (let k = 0; k < 4; k++) {
    const s = 220 - k * 50; g.fillStyle = ['#24305a', '#e8d2a8', '#c98a3a', '#24305a'][k];
    g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 1.4, 0); g.lineTo(0, s); g.lineTo(-s * 1.4, 0); g.closePath(); g.fill();
  }
  g.restore();
  const r = window.Arcade.rng(11);
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)'; g.fillRect(r() * W, r() * H, 2, 2); }
  return c;
}

function plankCanvas() {
  const W = 1024, H = 1024, c = makeCanvas(W, H), g = c.getContext('2d');
  const r = window.Arcade.rng(21);
  const rows = 8, rh = H / rows;
  for (let i = 0; i < rows; i++) {
    const tone = 0.75 + r() * 0.35;
    const col = 'rgb(' + Math.round(92 * tone) + ',' + Math.round(58 * tone) + ',' + Math.round(36 * tone) + ')';
    g.save(); g.beginPath(); g.rect(0, i * rh, W, rh); g.clip();
    g.translate(0, i * rh);
    woodGrain(g, W, rh, col, '#2a160c', '#a8744a', 40 + i, 22);
    g.restore();
    g.fillStyle = 'rgba(10,6,4,0.8)'; g.fillRect(0, i * rh, W, 3);
    const off = r() * W; g.fillRect(off, i * rh, 3, rh);
  }
  return c;
}

function plasterCanvas() {
  const W = 512, H = 512, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#6a3a2c'; g.fillRect(0, 0, W, H);
  const r = window.Arcade.rng(5);
  for (let i = 0; i < 14000; i++) { const v = r(); g.fillStyle = v < 0.5 ? 'rgba(30,14,10,' + (r() * 0.12) + ')' : 'rgba(255,220,180,' + (r() * 0.06) + ')'; g.fillRect(r() * W, r() * H, 2 + r() * 3, 2 + r() * 3); }
  return c;
}

function netCanvas() {
  const N = 128, c = makeCanvas(N, N), g = c.getContext('2d');
  g.clearRect(0, 0, N, N);
  g.strokeStyle = 'rgba(220,200,170,1)'; g.lineWidth = 3;
  for (let i = -N; i < N * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + N, N); g.stroke(); g.beginPath(); g.moveTo(i + N, 0); g.lineTo(i, N); g.stroke(); }
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
    this.n = n; this.head = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.a0 = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.grow = new Float32Array(n); this.floor = new Float32Array(n);
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
    this.live = 0;
  }
  add(x, y, z, vx, vy, vz, life, size, color, alpha, grav, drag, grow, floor) {
    const i = this.head; this.head = (this.head + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.a0[i] = alpha; this.alpha[i] = alpha;
    this.grav[i] = grav || 0; this.drag[i] = drag || 0; this.grow[i] = grow || 0; this.floor[i] = floor == null ? -99 : floor;
    this.live = this.n;
  }
  step(dt) {
    if (!this.live) return;
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      any++;
      const i3 = i * 3;
      this.life[i] -= dt;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 2] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < this.floor[i]) { this.pos[i3 + 1] = this.floor[i]; this.vel[i3 + 1] *= -0.35; this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6; }
      this.size[i] += this.grow[i] * dt;
      const k = clamp(this.life[i] / this.max[i], 0, 1);
      this.alpha[i] = this.life[i] > 0 ? this.a0[i] * (k < 0.7 ? k / 0.7 : 1) : 0;
    }
    if (!any) this.live = 0;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.aAlpha.needsUpdate = true; }
}
const FX = { add: null, norm: null, rings: [] };
const C = {
  gold: new THREE.Color('#ffc65c'), warm: new THREE.Color('#ffb736'), prim: new THREE.Color('#ff6940'), ink: new THREE.Color('#fbf5ec'),
  powder: new THREE.Color('#f6f1e6'), red: new THREE.Color('#ff3a24'), conf: ['#ff6940', '#ffb736', '#c9a96e', '#fbf5ec', '#e04a8a', '#4ab0c8'].map((s) => new THREE.Color(s)),
  mote: new THREE.Color('#ffd9a0'), tmp: new THREE.Color(),
};

function clearFx() { if (FX.add) { FX.add.clear(); FX.norm.clear(); FX.rings.forEach((r) => { r.life = 0; r.mesh.visible = false; }); } }

function ring(x, y, col, size, life) {
  if (!R3.ok) return;
  let best = FX.rings[0];
  for (const r of FX.rings) if (r.life <= 0) { best = r; break; }
  best.life = life || 0.6; best.max = best.life; best.size = size || 0.3;
  best.mesh.position.set(x, BOARD_Y + 0.004, y); best.mesh.material.color.copy(col); best.mesh.visible = true;
}

function burst(x, y, kind) {
  if (!R3.ok) return;
  if (kind === 'foul') {
    ring(x, y, C.red, 0.34, 0.55);
    for (let i = 0; i < 18; i++) { const a = rnd() * TAU, s = 0.3 + rnd() * 0.6; FX.norm.add(x, 0.02, y, cos(a) * s, 0.2 + rnd() * 0.5, sin(a) * s, 0.6 + rnd() * 0.4, 0.05 + rnd() * 0.05, C.powder, 0.5, 0.6, 2.5, 0.12); }
    return;
  }
  const big = kind === 'queen' || kind === 'clear';
  ring(x, y, kind === 'queen' ? C.warm : C.gold, big ? 0.55 : 0.32, big ? 0.8 : 0.55);
  const n = big ? 60 : 26;
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, s = 0.3 + rnd() * (big ? 1.4 : 0.8), up = 0.6 + rnd() * (big ? 2.2 : 1.2);
    FX.add.add(x, 0.03, y, cos(a) * s, up, sin(a) * s, 0.5 + rnd() * 0.6, 0.02 + rnd() * 0.035, rnd() < 0.5 ? C.gold : C.warm, 0.95, 2.6, 1.2, -0.02, -0.2);
  }
  if (kind === 'clear' || kind === 'queen') {
    const m = kind === 'clear' ? 140 : 60;
    for (let i = 0; i < m; i++) {
      const a = rnd() * TAU, s = 0.2 + rnd() * 1.2;
      const ox = kind === 'clear' ? (rnd() - 0.5) * 1.6 : x, oz = kind === 'clear' ? (rnd() - 0.5) * 1.6 : y;
      FX.norm.add(ox, 0.05, oz, cos(a) * s, 1.4 + rnd() * 2.2, sin(a) * s, 1.3 + rnd() * 0.9, 0.035 + rnd() * 0.03, C.conf[(rnd() * C.conf.length) | 0], 1, 2.2, 1.4, 0, 0.006);
    }
  }
}

let fxBudget = 0;
function hitFx(x, y, v) {
  if (!R3.ok) return;
  if (fxBudget-- > 0) {
    const n = Math.min(10, 2 + (v * 3) | 0);
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = 0.05 + rnd() * 0.25 * v; FX.norm.add(x, 0.02, y, cos(a) * s, 0.05 + rnd() * 0.25 * v, sin(a) * s, 0.5 + rnd() * 0.5, 0.03 + rnd() * 0.04, C.powder, 0.35, 0.3, 3, 0.1, 0.005); }
    if (v > 1.2) for (let i = 0; i < 4; i++) { const a = rnd() * TAU; FX.add.add(x, 0.03, y, cos(a) * 0.5, 0.3 + rnd() * 0.4, sin(a) * 0.5, 0.18, 0.016, C.ink, 0.9, 1.5, 2); }
  }
  if (G.clicks < 3) {
    G.clicks++;
    arc.sfx.tone(1400 + rnd() * 500, 0.035, { type: 'triangle', vol: clamp(0.03 + v * 0.03, 0.03, 0.12) });
  }
}
function wallFx(x, y, v) {
  if (!R3.ok) return;
  if (fxBudget-- > 0) for (let i = 0; i < 4; i++) { const a = rnd() * TAU, s = 0.05 + rnd() * 0.15; FX.norm.add(x, 0.02, y, cos(a) * s, 0.05 + rnd() * 0.15, sin(a) * s, 0.5, 0.035, C.powder, 0.3, 0.2, 3, 0.08, 0.005); }
  if (G.clicks < 3) { G.clicks++; arc.sfx.tone(260 + rnd() * 60, 0.05, { type: 'sine', vol: clamp(v * 0.04, 0.02, 0.1) }); }
}
function shotFx(x, y, c) {
  if (!R3.ok) return;
  for (let i = 0; i < 10 + c * 16; i++) { const a = rnd() * TAU, s = 0.1 + rnd() * 0.3; FX.norm.add(x + cos(a) * 0.06, 0.02, y + sin(a) * 0.06, cos(a) * s, 0.08 + rnd() * 0.2, sin(a) * s, 0.6 + rnd() * 0.5, 0.04 + rnd() * 0.05, C.powder, 0.4, 0.2, 2.6, 0.1, 0.005); }
  ring(x, y, C.warm, 0.18 + c * 0.2, 0.4);
}

/* --------------------------------------------------------------- build the room */
function std(o) { return new THREE.MeshStandardMaterial(o); }

function buildWorld() {
  const scene = new THREE.Scene();
  R3.scene = scene;
  scene.background = new THREE.Color('#0d0a0a');
  scene.fog = new THREE.Fog('#120d0c', 10, 26);

  // A small lamplit room baked into an environment map, so wood and coins have something to reflect.
  {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: '#2a1a14', side: THREE.BackSide }));
    room.position.y = 4; env.add(room);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.6, 3.2) }));
    lamp.position.set(0, 9, 0); lamp.rotation.x = PI / 2; env.add(lamp);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.7) }));
    win.position.set(3, 3, -9.9); env.add(win);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.4, 0.3) }));
    fill.position.set(-9.9, 2, 0); fill.rotation.y = PI / 2; env.add(fill);
    const pm = new THREE.PMREMGenerator(R3.renderer);
    R3.env = pm.fromScene(env, 0.03).texture;
    scene.environment = R3.env;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  // lights: a warm pendant pool on the board, a cool window, a soft fill
  const hemi = new THREE.HemisphereLight('#6d5a78', '#2a160c', 0.55);
  scene.add(hemi); R3.hemi = hemi;
  const key = new THREE.SpotLight('#ffd6a0', 3.3, 0, 0.5, 0.6, 0);
  key.position.set(0.4, 7.2, 0.6);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 4; key.shadow.camera.far = 10;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01; key.shadow.radius = 3;
  scene.add(key); scene.add(key.target);
  R3.key = key;
  const win = new THREE.DirectionalLight('#8aa6e0', 0.55);
  win.position.set(4, 5, -6); scene.add(win);
  const rim = new THREE.PointLight('#ff8a4a', 2.2, 9, 1.6);
  rim.position.set(-3.6, 1.2, -2.6); scene.add(rim);
  M.rim = rim;

  /* the board */
  const N = R3.soft ? 1024 : 2048;
  const surfTex = colorTex(boardTexture(N));
  surfTex.repeat.set(1 / 1.9, 1 / 1.9); surfTex.offset.set(0.5, 0.5);
  const shape = new THREE.Shape();
  shape.moveTo(-0.97, -0.97); shape.lineTo(0.97, -0.97); shape.lineTo(0.97, 0.97); shape.lineTo(-0.97, 0.97); shape.closePath();
  for (const k of POCKETS) { const h = new THREE.Path(); h.absarc(k.x, -k.y, 0.068, 0, TAU, true); shape.holes.push(h); }
  const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 28 });
  slab.rotateX(-PI / 2); slab.translate(0, BOARD_Y - 0.05, 0);
  const surfMat = new THREE.MeshPhysicalMaterial({ map: surfTex, roughness: 0.34, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22 });
  const edgeMat = std({ color: '#2a1810', roughness: 0.8 });
  const board = new THREE.Mesh(slab, [surfMat, edgeMat]);
  board.receiveShadow = true; scene.add(board);
  M.board = board;

  // the frame: four mitred rosewood rails with a bevelled edge
  const frameCanvas = makeCanvas(1024, 256);
  woodGrain(frameCanvas.getContext('2d'), 1024, 256, '#5a2c18', '#200c06', '#8a4a28', 13, 90);
  const frameTex = colorTex(frameCanvas, true, true); frameTex.repeat.set(0.5, 2.2);
  const frameMat = new THREE.MeshPhysicalMaterial({ map: frameTex, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.18, color: '#ffffff' });
  const Ro = 1.16, Ri = 0.958;
  const rail = new THREE.Shape();
  rail.moveTo(-Ro, -Ro); rail.lineTo(Ro, -Ro); rail.lineTo(Ri, -Ri); rail.lineTo(-Ri, -Ri); rail.closePath();
  const railGeo = new THREE.ExtrudeGeometry(rail, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.008, bevelSegments: 3, curveSegments: 4 });
  railGeo.rotateX(-PI / 2); railGeo.translate(0, BOARD_Y - 0.052, 0);
  // rotateX turned shape -y into +z, so this rail sits on the player's side
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(railGeo, frameMat);
    m.rotation.y = k * PI / 2; m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
  // brass corner plates and pocket rims
  const brass = std({ color: '#c8913a', metalness: 0.9, roughness: 0.28 });
  const capGeo = new THREE.CylinderGeometry(0.07, 0.074, 0.014, 28);
  const caps = new THREE.InstancedMesh(capGeo, brass, 4);
  const dm = new THREE.Object3D();
  for (let k = 0; k < 4; k++) { dm.position.set((k % 2 ? 1 : -1) * 1.06, BOARD_Y + 0.06, (k < 2 ? -1 : 1) * 1.06); dm.updateMatrix(); caps.setMatrixAt(k, dm.matrix); }
  caps.castShadow = true; scene.add(caps);
  const rimGeo = new THREE.TorusGeometry(0.071, 0.0055, 8, 36); rimGeo.rotateX(PI / 2);
  const rims = new THREE.InstancedMesh(rimGeo, brass, 4);
  POCKETS.forEach((k, i) => { dm.position.set(k.x, BOARD_Y + 0.001, k.y); dm.updateMatrix(); rims.setMatrixAt(i, dm.matrix); });
  scene.add(rims);
  // the net pouches under each pocket
  const netTex = colorTex(netCanvas(), true, true); netTex.repeat.set(4, 2);
  const bag = new THREE.LatheGeometry([[0.0, -0.3], [0.05, -0.29], [0.085, -0.24], [0.09, -0.16], [0.075, -0.07], [0.068, -0.05]].map((p) => new THREE.Vector2(p[0], p[1])), 24);
  const bagMat = std({ color: '#3a2618', map: netTex, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0 });
  const bags = new THREE.InstancedMesh(bag, bagMat, 4);
  POCKETS.forEach((k, i) => { dm.position.set(k.x, BOARD_Y, k.y); dm.updateMatrix(); bags.setMatrixAt(i, dm.matrix); });
  scene.add(bags);

  /* the stand: legs, apron and a stretcher, in the frame's wood */
  const legMat = std({ color: '#3a1e10', map: frameTex, roughness: 0.55 });
  const legGeo = new THREE.CylinderGeometry(0.075, 0.05, 1.88, 14); legGeo.translate(0, -0.94, 0);
  const legs = new THREE.InstancedMesh(legGeo, legMat, 4);
  for (let k = 0; k < 4; k++) { dm.position.set((k % 2 ? 1 : -1) * 0.74, BOARD_Y - 0.07, (k < 2 ? -1 : 1) * 0.74); dm.rotation.set((k < 2 ? -1 : 1) * 0.06, 0, (k % 2 ? -1 : 1) * 0.06); dm.updateMatrix(); legs.setMatrixAt(k, dm.matrix); }
  dm.rotation.set(0, 0, 0);
  const apronGeo = new THREE.BoxGeometry(1.7, 0.12, 0.05);
  const apron = new THREE.InstancedMesh(apronGeo, legMat, 4);
  for (let k = 0; k < 4; k++) { const a = k * PI / 2; dm.position.set(Math.sin(a) * 0.82, BOARD_Y - 0.13, Math.cos(a) * 0.82); dm.rotation.set(0, a, 0); dm.updateMatrix(); apron.setMatrixAt(k, dm.matrix); }
  dm.rotation.set(0, 0, 0);
  apron.castShadow = true; scene.add(apron);
  legs.castShadow = true; legs.receiveShadow = true; scene.add(legs);

  /* floor, rug, walls, window */
  const FLOOR = -1.95;
  const plank = colorTex(plankCanvas(), true, true); plank.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), std({ map: plank, roughness: 0.6, color: '#d8c0a8' }));
  floor.rotation.x = -PI / 2; floor.position.y = FLOOR; floor.receiveShadow = true; scene.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.6), std({ map: colorTex(rugCanvas()), roughness: 0.95 }));
  rug.rotation.x = -PI / 2; rug.position.set(0, FLOOR + 0.006, 0.1); rug.receiveShadow = true; scene.add(rug);
  const plaster = colorTex(plasterCanvas(), true, true); plaster.repeat.set(4, 2);
  const wallMat = std({ map: plaster, roughness: 0.95, color: '#c8a090' });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), wallMat);
  back.position.set(0, FLOOR + 4.5, -6.2); back.receiveShadow = true; scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(14, 9), wallMat);
  left.position.set(-7, FLOOR + 4.5, 0); left.rotation.y = PI / 2; scene.add(left);
  const right = left.clone(); right.position.x = 7; right.rotation.y = -PI / 2; scene.add(right);
  // skirting
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 0.06), std({ color: '#2a160c', roughness: 0.7 }));
  skirt.position.set(0, FLOOR + 0.15, -6.17); scene.add(skirt);
  // the window: a dusk sky over rooftops, framed in teak
  const skyTex = colorTex(skyCanvas());
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
  sky.position.set(2.4, 1.7, -6.15); scene.add(sky);
  const teak = std({ color: '#3a2214', roughness: 0.6 });
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), teak, 7);
  const bar = (i, x, y, w, h) => { dm.position.set(x, y, -6.1); dm.scale.set(w, h, 0.12); dm.updateMatrix(); bars.setMatrixAt(i, dm.matrix); };
  bar(0, 2.4, 2.85, 2.9, 0.14); bar(1, 2.4, 0.55, 2.9, 0.16); bar(2, 1.05, 1.7, 0.14, 2.4); bar(3, 3.75, 1.7, 0.14, 2.4);
  bar(4, 2.4, 1.7, 0.08, 2.2); bar(5, 2.4, 1.7, 2.6, 0.06); bar(6, 2.4, 0.42, 3.2, 0.1);
  dm.scale.set(1, 1, 1);
  scene.add(bars);
  // curtains
  const cloth = makeCanvas(256, 256); { const g = cloth.getContext('2d'); const gr = g.createLinearGradient(0, 0, 256, 0); for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? '#7a2420' : '#a83a28'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(255,200,120,0.25)'; for (let y = 20; y < 256; y += 40) g.fillRect(0, y, 256, 3); }
  const curtainMat = std({ map: colorTex(cloth), roughness: 0.9, side: THREE.DoubleSide });
  for (const cx of [0.75, 4.05]) { const cu = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.4), curtainMat); cu.position.set(cx, 1.4, -6.0); scene.add(cu); }

  /* props: a shelf of brass pots and a diya, a side table with a glass of chai, cushions */
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.5), teak);
  shelf.position.set(-2.6, 1.0, -5.9); shelf.castShadow = true; scene.add(shelf);
  const potGeo = new THREE.LatheGeometry([[0, 0], [0.16, 0.02], [0.22, 0.16], [0.18, 0.32], [0.1, 0.38], [0.12, 0.44], [0.0, 0.44]].map((p) => new THREE.Vector2(p[0], p[1])), 24);
  const pots = new THREE.InstancedMesh(potGeo, brass, 4);
  [[-3.4, 1.04, -5.9, 1], [-2.9, 1.04, -5.85, 0.8], [-2.0, 1.04, -5.9, 1.15], [5.6, FLOOR, -4.6, 2.2]].forEach((p, i) => { dm.position.set(p[0], p[1], p[2]); dm.scale.setScalar(p[3]); dm.updateMatrix(); pots.setMatrixAt(i, dm.matrix); });
  dm.scale.setScalar(1);
  pots.castShadow = true; scene.add(pots);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.8), fog: false });
  M.flames = [];
  for (const fx of [-1.5, -1.3]) {
    const diya = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 6, 0, TAU, PI / 2, PI / 2), std({ color: '#a84a20', roughness: 0.8 }));
    diya.position.set(fx, 1.12, -5.8); diya.rotation.x = PI; scene.add(diya);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 8), flameMat);
    fl.position.set(fx, 1.17, -5.8); scene.add(fl); M.flames.push(fl);
  }
  // side table, glass of chai
  const sideTop = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 32), std({ color: '#c08060', map: frameTex, roughness: 0.45 }));
  sideTop.position.set(2.7, FLOOR + 1.05, -1.2); sideTop.castShadow = true; sideTop.receiveShadow = true; scene.add(sideTop);
  const sideLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1.05, 12), teak);
  sideLeg.position.set(2.7, FLOOR + 0.52, -1.2); scene.add(sideLeg);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.2, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0, side: THREE.DoubleSide }));
  glass.position.set(2.6, FLOOR + 1.18, -1.1); scene.add(glass);
  const chai = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.15, 20), std({ color: '#b8743a', roughness: 0.3 }));
  chai.position.set(2.6, FLOOR + 1.155, -1.1); scene.add(chai);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.02, 28), brass);
  plate.position.set(2.85, FLOOR + 1.09, -1.35); scene.add(plate);
  const cushGeo = new THREE.SphereGeometry(0.5, 20, 12); cushGeo.scale(1, 0.32, 1);
  const cc = makeCanvas(256, 256); { const g = cc.getContext('2d'); g.fillStyle = '#c4572e'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 256; i += 32) { g.fillStyle = '#e8b04a'; g.fillRect(0, i, 256, 6); g.fillStyle = '#5a1e1a'; g.fillRect(0, i + 14, 256, 3); } }
  const cushTex = colorTex(cc, true, true); cushTex.repeat.set(2, 2);
  const cush = new THREE.InstancedMesh(cushGeo, std({ map: cushTex, roughness: 0.9 }), 2);
  [[-2.4, FLOOR + 0.16, 0.6], [-2.2, FLOOR + 0.16, -1.6]].forEach((p, i) => { dm.position.set(p[0], p[1], p[2]); dm.rotation.set(0, i * 0.7, 0); dm.updateMatrix(); cush.setMatrixAt(i, dm.matrix); });
  dm.rotation.set(0, 0, 0);
  cush.castShadow = true; cush.receiveShadow = true; scene.add(cush);

  /* the pendant lamp (high above, seen in tall views) */
  const shade = new THREE.Mesh(new THREE.LatheGeometry([[0.05, 0.4], [0.3, 0.2], [0.75, -0.05], [0.78, -0.08]].map((p) => new THREE.Vector2(p[0], p[1])), 32), std({ color: '#2a3a2a', roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
  shade.position.set(0.4, 7.6, 0.6); scene.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.8, 3.2) }));
  bulb.position.set(0.4, 7.5, 0.6); scene.add(bulb);

  /* coins and the striker */
  const bump = colorTex(coinBump(), false);
  const coinMat = (kind, rough, metal) => std({ map: colorTex(coinCanvas(kind)), bumpMap: bump, bumpScale: 1.2, roughness: rough, metalness: metal || 0 });
  const geoCoin = coinGeometry(0.044, 0.026), geoQueen = coinGeometry(0.048, 0.027), geoStriker = coinGeometry(0.062, 0.03);
  const mats = { light: coinMat('light', 0.42), dark: coinMat('dark', 0.36), queen: coinMat('queen', 0.3, 0.15), striker: coinMat('striker', 0.26) };
  M.coins = [];
  for (let i = 0; i < 9; i++) {
    const kind = i === 0 ? 'queen' : (i - 1) % 2 ? 'dark' : 'light';
    const m = new THREE.Mesh(kind === 'queen' ? geoQueen : geoCoin, mats[kind]);
    m.castShadow = true; m.receiveShadow = true; scene.add(m); M.coins.push(m);
  }
  M.striker = new THREE.Mesh(geoStriker, mats.striker);
  M.striker.castShadow = true; M.striker.receiveShadow = true; scene.add(M.striker);

  /* aim aids: the guide stripe, first-contact ghost, the coin's path, a power ring */
  const guideMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uLen: { value: 1 }, uT: { value: 0 }, uA: { value: 1 }, uC: { value: new THREE.Color('#ffb736') }, uP: { value: 0.3 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uLen; uniform float uT; uniform float uA; uniform vec3 uC; uniform float uP;' +
      'void main(){ float along = vUv.y * uLen; float dash = step(0.45, fract(along * 14.0 - uT * 2.0)); float edge = 1.0 - abs(vUv.x - 0.5) * 2.0; edge = smoothstep(0.0, 0.6, edge);' +
      ' float pw = step(vUv.y, uP); float a = edge * uA * mix(0.28 * dash, 0.95, pw) * (1.0 - smoothstep(0.85, 1.0, vUv.y) * (1.0 - pw));' +
      ' gl_FragColor = vec4(mix(uC, vec3(1.0, 0.95, 0.85), pw * 0.4), a);\n #include <colorspace_fragment>\n }',
  });
  const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-PI / 2); pg.translate(0, 0, -0.5);
  M.guide = new THREE.Mesh(pg, guideMat); M.guide.renderOrder = 3; scene.add(M.guide);
  M.path = new THREE.Mesh(pg, guideMat.clone()); M.path.material.uniforms.uC.value = new THREE.Color('#fbf5ec'); M.path.renderOrder = 3; scene.add(M.path);
  const ghostGeo = new THREE.RingGeometry(0.055, 0.064, 40); ghostGeo.rotateX(-PI / 2);
  M.ghost = new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ color: '#fbf5ec', transparent: true, opacity: 0.6, depthWrite: false })); M.ghost.renderOrder = 3; scene.add(M.ghost);
  const pr = new THREE.RingGeometry(0.078, 0.094, 64); pr.rotateX(-PI / 2);
  M.power = new THREE.Mesh(pr, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uF: { value: 0 }, uA: { value: 1 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform float uF; uniform float uA; void main(){ float a = atan(vP.x, -vP.z) / 6.2831853 + 0.5; float on = step(a, uF);' +
      ' vec3 c = mix(vec3(1.0, 0.72, 0.21), vec3(1.0, 0.41, 0.25), uF); gl_FragColor = vec4(mix(vec3(0.35, 0.3, 0.25), c, on), (0.25 + on * 0.75) * uA);\n #include <colorspace_fragment>\n }',
  }));
  M.power.renderOrder = 4; scene.add(M.power);
  // baseline glow while the striker is being placed
  const blg = new THREE.PlaneGeometry(1.36, 0.13); blg.rotateX(-PI / 2);
  M.baseGlow = new THREE.Mesh(blg, new THREE.MeshBasicMaterial({ color: '#ffb736', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  M.baseGlow.position.set(0, BOARD_Y + 0.002, 0.72); scene.add(M.baseGlow);

  /* effects */
  FX.add = new FxPool(700, true, 0.05); FX.norm = new FxPool(900, false, 0.2);
  scene.add(FX.add.mesh); scene.add(FX.norm.mesh);
  const rg = new THREE.RingGeometry(0.8, 1, 48); rg.rotateX(-PI / 2);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffb736', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false; m.renderOrder = 4; scene.add(m); FX.rings.push({ mesh: m, life: 0, max: 1, size: 0.3 });
  }
  // the lamp's cone of floating dust
  M.motes = [];
  for (let i = 0; i < 40; i++) M.motes.push({ x: (rnd() - 0.5) * 2.4, y: 0.4 + rnd() * 3.6, z: (rnd() - 0.5) * 2.4, s: 0.1 + rnd() * 0.25, ph: rnd() * TAU });
}

/* --------------------------------------------------------------- camera */
const FIT_PTS = [];
for (const x of [-1.18, 1.18]) for (const z of [-1.18, 1.18]) for (const y of [-0.06, 0.07]) FIT_PTS.push(new THREE.Vector3(x, y, z));

function safeArea() {
  const pad = arc.hudPad ? arc.hudPad() : { top: 12, bottom: 52 };
  const w = arc.w, h = arc.h;
  return { top: pad.top + (w < 520 ? 74 : 62), bottom: pad.bottom + 38, side: w < 520 ? 6 : 24 };
}

// Find the camera distance and screen offset that frame the whole board in the
// space between the HUD and the touch controls, at this pitch.
function fitCamera(pitch) {
  const cam = R3.camera, w = arc.w, h = arc.h, sa = safeArea();
  cam.aspect = w / h; cam.clearViewOffset(); cam.updateProjectionMatrix();
  const yTop = 1 - 2 * sa.top / h, yBot = -1 + 2 * sa.bottom / h, xm = 1 - 2 * sa.side / w;
  const dir = V.d.set(0, Math.sin(pitch), Math.cos(pitch));
  let d = 6, cy = 0, cx = 0;
  for (let it = 0; it < 7; it++) {
    cam.position.copy(dir).multiplyScalar(d); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const p of FIT_PTS) { V.a.copy(p).project(cam); x0 = min(x0, V.a.x); x1 = max(x1, V.a.x); y0 = min(y0, V.a.y); y1 = max(y1, V.a.y); }
    const s = min((2 * xm) / (x1 - x0), (yTop - yBot) / (y1 - y0));
    cy = (y0 + y1) / 2; cx = (x0 + x1) / 2;
    if (abs(s - 1) < 0.004) break;
    d /= s;
  }
  CAM.dist = d;
  CAM.oy = ((yTop + yBot) / 2 - cy) * h / 2;
  CAM.ox = -(0 - cx) * w / 2;
}

function cameraRig(dt) {
  const cam = R3.camera, w = arc.w, h = arc.h, sa = safeArea();
  const portrait = w / h < 0.8;
  const pitch = portrait ? 0.86 : 1.04;
  const key = w + 'x' + h + ':' + sa.bottom + ':' + pitch;
  if (key !== CAM.fitKey) { CAM.fitKey = key; fitCamera(pitch); CAM.pitch = pitch; }
  const rm = arc.reducedMotion;
  const menu = arc.state !== 'play' && arc.state !== 'pause';
  // the menu slowly circles the board; play sits square behind the baseline
  let yaw = 0, zoom = 1, p = CAM.pitch, tx = 0, tz = 0;
  if (menu) { yaw = rm ? 0.2 : sin(R3.time * 0.12) * 0.5; zoom = 0.9; p = CAM.pitch - 0.12; }
  else {
    if (!rm) yaw = sin(R3.time * 0.35) * 0.012;
    if (G.phase === 'roll' && !rm) {
      // drift a little toward the action
      let sx = 0, sz = 0, n = 0;
      for (const q of G.pieces) if (!q.in && hypot(q.vx, q.vy) > 0.05) { sx += q.x; sz += q.y; n++; }
      const s = G.striker; if (!s.in && hypot(s.vx, s.vy) > 0.05) { sx += s.x * 2; sz += s.y * 2; n += 2; }
      if (n) { tx = sx / n * 0.08; tz = sz / n * 0.08; zoom = 0.97; }
    }
    if (G.focusT > 0 && G.focus && !rm) { const k = clamp(G.focusT, 0, 1); tx = G.focus.x * 0.22 * k; tz = G.focus.y * 0.22 * k; zoom = 1 - 0.14 * k; }
  }
  G.focusT = max(0, G.focusT - dt);
  const k = rm ? 2 : 3;
  CAM.yaw = damp(CAM.yaw, yaw, menu ? 1.5 : k, dt); CAM.zoom = damp(CAM.zoom, zoom, k, dt);
  CAM.tx = damp(CAM.tx, tx, k, dt); CAM.tz = damp(CAM.tz, tz, k, dt); CAM.p = damp(CAM.p == null ? p : CAM.p, p, 2, dt);
  const d = CAM.dist * CAM.zoom;
  cam.position.set(CAM.tx + Math.sin(CAM.yaw) * Math.cos(CAM.p) * d, Math.sin(CAM.p) * d, CAM.tz + Math.cos(CAM.yaw) * Math.cos(CAM.p) * d);
  CAM.look.set(CAM.tx, 0, CAM.tz);
  cam.lookAt(CAM.look);
  if (arc.shakeX || arc.shakeY) { cam.translateX(arc.shakeX * 0.0025); cam.translateY(arc.shakeY * 0.0025); }
  cam.setViewOffset(w, h, CAM.ox, CAM.oy, w, h);
  cam.updateMatrixWorld(true);
}

// Screen pixels <-> board coordinates through the real camera.
function fromPx(x, y) {
  if (!R3.ok || !R3.camera) return null;
  V.n.set((x / arc.w) * 2 - 1, -(y / arc.h) * 2 + 1);
  R3.ray.setFromCamera(V.n, R3.camera);
  const hit = R3.ray.ray.intersectPlane(R3.plane, V.c);
  if (!hit) return null;
  return { x: hit.x, y: hit.z };
}
function toPx(x, y, z, out) {
  V.a.set(x, y, z).project(R3.camera);
  out.x = (V.a.x * 0.5 + 0.5) * arc.w; out.y = (-V.a.y * 0.5 + 0.5) * arc.h; out.z = V.a.z;
  return out;
}
const PX = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 } };
// Pixels across the board at the baseline (the 2D game's board size).
function boardPx() {
  if (!R3.ok) return min(arc.w, arc.h) * 0.78;
  toPx(-1, 0, 0.72, PX.a); toPx(1, 0, 0.72, PX.b);
  return max(80, hypot(PX.b.x - PX.a.x, PX.b.y - PX.a.y));
}

/* --------------------------------------------------------------- per frame */
function placePiece(m, p, dt) {
  if (!p.in) {
    let y = BOARD_Y;
    if (p.pop > 0) { p.pop = max(0, p.pop - dt * 3); y += sin(p.pop * PI) * 0.12; }
    m.position.set(p.x, y, p.y); m.rotation.set(0, p.rot, 0);
    const s = 1 - p.pop * 0.3; m.scale.setScalar(s);
    m.visible = true;
    return;
  }
  // into the pocket: slide to the hole, tip and fall, then rest in the pouch
  const k = POCKETS[p.pk], t = p.drop;
  const a = clamp(t / 0.12, 0, 1), b = clamp((t - 0.08) / 0.3, 0, 1);
  const x = lerp(p.fx, k.x, a), z = lerp(p.fy, k.y, a);
  const rest = -0.27 + p.slot * 0.022;
  const y = lerp(BOARD_Y, rest, b * b);
  m.position.set(x, y, z);
  m.rotation.set(sin(b * PI) * 0.9 * Math.sign(k.y), p.rot + t * 2, sin(b * PI) * 0.6 * Math.sign(k.x));
  m.scale.setScalar(1);
  m.visible = true;
}

function updateAim(dt) {
  const show = G.phase === 'aim' && arc.state !== 'over' && (G.attract ? G.charge > 0.02 : arc.state === 'play' || arc.state === 'pause');
  const s = G.striker;
  M.guide.visible = M.path.visible = M.ghost.visible = M.power.visible = false;
  M.baseGlow.material.opacity = damp(M.baseGlow.material.opacity, show && !G.attract && (G.charge < 0.02) ? 0.12 + 0.05 * sin(R3.time * 3) : 0, 6, dt);
  if (!show || !s) return;
  const dx = sin(G.aim), dz = -cos(G.aim);
  // first contact along the aim, or the rail
  let tHit = 9, hit = null;
  for (const c of G.pieces) {
    if (c.in) continue;
    const ox = s.x - c.x, oz = s.y - c.y, R = s.r + c.r;
    const b = ox * dx + oz * dz, cc = ox * ox + oz * oz - R * R, disc = b * b - cc;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < tHit) { tHit = t; hit = c; }
  }
  let tWall = 9;
  if (dx > 1e-4) tWall = min(tWall, (WALL - s.x) / dx); if (dx < -1e-4) tWall = min(tWall, (-WALL - s.x) / dx);
  if (dz < -1e-4) tWall = min(tWall, (-WALL - s.y) / dz);
  const hard = G.diff === 'hard';
  let len = min(tHit, tWall);
  if (hard) len = min(len, 0.42);
  len = max(0.12, len);
  const g = M.guide, u = g.material.uniforms;
  g.visible = true;
  g.position.set(s.x, BOARD_Y + 0.003, s.y); g.rotation.set(0, -G.aim, 0); g.scale.set(0.022, 1, len);
  u.uLen.value = len; u.uT.value = arc.reducedMotion ? 0 : R3.time; u.uA.value = G.attract ? 0.5 : 1;
  u.uP.value = clamp((0.16 + G.charge * 0.37) / len, 0, 1);
  const pw = M.power;
  pw.visible = true; pw.position.set(s.x, BOARD_Y + 0.004, s.y); pw.material.uniforms.uF.value = G.charge; pw.material.uniforms.uA.value = G.attract ? 0.5 : 1;
  if (hit && tHit <= len + 1e-3 && !hard) {
    const gx = s.x + dx * tHit, gz = s.y + dz * tHit;
    M.ghost.visible = true; M.ghost.position.set(gx, BOARD_Y + 0.004, gz); M.ghost.scale.setScalar(s.r / 0.06);
    M.ghost.material.opacity = (G.attract ? 0.3 : 0.6) * (0.75 + 0.25 * sin(R3.time * 6));
    // where the coin goes: along the line of centres
    const nx = hit.x - gx, nz = hit.y - gz, nl = hypot(nx, nz) || 1;
    const p = M.path; p.visible = true; p.position.set(hit.x, BOARD_Y + 0.003, hit.y);
    p.rotation.set(0, Math.atan2(nx / nl, -nz / nl) * -1, 0); p.scale.set(0.016, 1, G.diff === 'easy' ? 0.5 : 0.3);
    p.material.uniforms.uLen.value = 0.4; p.material.uniforms.uP.value = 0; p.material.uniforms.uA.value = G.attract ? 0.4 : 0.85; p.material.uniforms.uT.value = u.uT.value;
  }
}

function frame3D(dt) {
  R3.time += dt;
  fxBudget = 6; G.clicks = 0;
  // pieces
  for (let i = 0; i < M.coins.length; i++) {
    const p = G.pieces[i];
    if (!p) { M.coins[i].visible = false; continue; }
    placePiece(M.coins[i], p, dt);
  }
  if (G.striker) {
    const s = G.striker;
    placePiece(M.striker, s, dt);
    // pulled back a touch while charging, like a finger drawing it in
    if (G.phase === 'aim' && G.charge > 0 && !s.in) {
      const back = G.charge * 0.035;
      M.striker.position.x -= sin(G.aim) * back; M.striker.position.z += cos(G.aim) * back;
      if (!arc.reducedMotion && G.charge > 0.85) M.striker.position.x += sin(R3.time * 60) * 0.002;
    }
    // a trail of light behind a fast striker
    const sp = hypot(s.vx, s.vy);
    if (!s.in && sp > 1.0) FX.add.add(s.x, BOARD_Y + 0.02, s.y, 0, 0.02, 0, 0.22, 0.05 + sp * 0.012, C.prim, clamp(sp * 0.18, 0.2, 0.6), 0, 0, -0.1);
  }
  updateAim(dt);
  // rings
  for (const r of FX.rings) {
    if (r.life <= 0) continue;
    r.life -= dt;
    const k = 1 - clamp(r.life / r.max, 0, 1);
    r.mesh.scale.setScalar(r.size * (0.3 + k * 0.9));
    r.mesh.material.opacity = (1 - k) * 0.85;
    if (r.life <= 0) r.mesh.visible = false;
  }
  // lamp dust and flickering diyas
  if (!arc.reducedMotion && rnd() < dt * 8) {
    const m = M.motes[(rnd() * M.motes.length) | 0];
    FX.add.add(m.x, m.y, m.z, (rnd() - 0.5) * 0.04, 0.02 + rnd() * 0.03, (rnd() - 0.5) * 0.04, 3 + rnd() * 2, 0.012 + rnd() * 0.012, C.mote, 0.35, 0, 0);
    m.x = (rnd() - 0.5) * 2.4; m.y = 0.4 + rnd() * 3.6; m.z = (rnd() - 0.5) * 2.4;
  }
  for (let i = 0; i < M.flames.length; i++) { const f = M.flames[i]; f.scale.set(1, 0.85 + 0.25 * sin(R3.time * 13 + i * 2) * (arc.reducedMotion ? 0 : 1), 1); }
  M.rim.intensity = 2.2 + (arc.reducedMotion ? 0 : 0.25 * sin(R3.time * 9) * sin(R3.time * 3.7));
  FX.add.step(dt); FX.norm.step(dt);
  cameraRig(dt);
  // particle sizes follow the drawing buffer height
  const sc = R3.renderer.domElement.height / (2 * Math.tan(R3.camera.fov * PI / 360));
  FX.add.mat.uniforms.uScale.value = sc; FX.norm.mat.uniforms.uScale.value = sc;
  // quality auto-scale on real frame time
  if (!R3.lock && arc.state === 'play') {
    R3.accT += R3.realDt; R3.accN++;
    if (R3.accT > 1.3 && R3.accN >= 3) {
      const avg = R3.accT / R3.accN; R3.fps = Math.round(1 / avg);
      if (R3.settle > 0) R3.settle--; else if (avg > 0.03 && R3.q > 0) { R3.q--; applyQuality(); R3.settle = 1; }
      R3.accT = 0; R3.accN = 0;
    }
  } else if (arc.state !== 'play') { R3.accT += R3.realDt; R3.accN++; if (R3.accT > 1.3) { R3.fps = Math.round(R3.accN / R3.accT); R3.accT = 0; R3.accN = 0; } }
}

function applyQuality() {
  const r = R3.renderer; if (!r) return;
  const f = (R3.soft ? [0.45, 0.6, 0.8, 1] : [0.55, 0.72, 0.88, 1])[R3.q];
  r.setPixelRatio(Math.max(0.5, arc.dpr * f)); r.setSize(arc.w, arc.h, false);
  // reflections cost the most on a software renderer, so the lightest level drops them for a brighter sky light
  if (R3.scene) { R3.scene.environment = R3.q >= 1 ? R3.env : null; R3.hemi.intensity = R3.q >= 1 ? 0.55 : 1.1; }
  const key = R3.key, want = R3.q >= 3 ? 2048 : R3.q >= 1 ? 1024 : 512;
  key.castShadow = true;
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
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x0d0a0a, 1);
    R3.renderer = r; R3.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
    arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; CAM.fitKey = ''; });
    R3.q = R3.soft ? 0 : (window.matchMedia && matchMedia('(pointer: coarse)').matches ? 2 : 3);
    const q = /[?&]q=(\d)/.exec(location.search); if (q) { R3.q = clamp(+q[1], 0, 3); R3.lock = true; }
    R3.camera = new THREE.PerspectiveCamera(36, arc.w / arc.h, 0.1, 60);
    buildWorld();
    R3.scene.add(R3.camera);
    R3.ok = true;
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

function drawPowerBar(c) {
  if (G.phase !== 'aim' || !G.striker) return;
  const pad = arc.hudPad ? arc.hudPad() : { bottom: 52 };
  const bw = min(240, arc.w - 40), bx = arc.w / 2 - bw / 2, by = arc.h - pad.bottom - 22;
  plate(c, bx - 8, by - 10, bw + 16, 28, 10);
  c.fillStyle = 'rgba(251,245,236,.12)'; rr(c, bx, by, bw, 8, 4); c.fill();
  const cg = c.createLinearGradient(bx, by, bx + bw, by);
  cg.addColorStop(0, WARM); cg.addColorStop(1, PRIM);
  c.fillStyle = G.charge > 0.7 ? cg : WARM;
  rr(c, bx, by, max(4, bw * G.charge), 8, 4); c.fill();
}

function drawHUD(c) {
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
  // Side plates shrink on a narrow phone so they never sit under the clock.
  const sw = (full) => min(full, max(96, w / 2 - 66 - 12));
  plate(c, pad.left, pad.top, sw(150), 64, 12);
  txt(c, 'POINTS', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
  txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
  plate(c, w / 2 - 58, pad.top, 116, 44, 12);
  const clock = G.mode === 'clock' ? (Math.max(0, G.time | 0) + 's') : (G.mode === 'practice' ? 'PRACTICE' : 'CLEAR');
  txt(c, clock, w / 2, pad.top + 22, G.mode === 'clock' ? 20 : 12, G.mode === 'clock' && G.time < 12 ? PRIM : INK, 500, 'center', G.mode === 'clock' ? F_DISP : F_MONO);
  plate(c, w - pad.right - sw(132), pad.top, sw(132), 44, 12);
  txt(c, G.pocketed + ' pocketed', w - pad.right - sw(132) / 2, pad.top + 22, 12, WARM, 600, 'center', F_MONO);
  if (G.combo > 1) {
    plate(c, w / 2 - 48, pad.top + 52, 96, 28, 10);
    txt(c, 'x' + G.combo + ' combo', w / 2, pad.top + 66, 12, PRIM, 700, 'center', F_MONO);
  }
}

function drawFloats(c) {
  if (!R3.ok) return;
  for (const f of G.floats) {
    toPx(f.x, 0.05, f.y, PX.a);
    const k = clamp(f.life / f.max, 0, 1), age = 1 - k;
    const pop = arc.reducedMotion ? 1 : (age < 0.15 ? 0.6 + age / 0.15 * 0.6 : 1.2 - min(0.2, (age - 0.15)));
    const size = (f.big ? 26 : 18) * pop;
    c.save(); c.globalAlpha = clamp(k * 1.6, 0, 1);
    c.font = '700 ' + size.toFixed(1) + 'px ' + F_DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
    const y = PX.a.y - 18 - age * 46;
    c.lineWidth = 4; c.strokeStyle = 'rgba(15,13,10,.65)'; c.strokeText(f.text, PX.a.x, y);
    c.fillStyle = f.col; c.fillText(f.text, PX.a.x, y);
    c.restore();
  }
}

// The shell hides its own hint on touch, so the gesture reminder is drawn here
// for the first seconds of play, just under the board.
function drawTouchHint(c) {
  if (!arc.touchMode || arc.touchStyle === 'pads' || G.attract || G.hintT > 6.5) return;
  const a = arc.reducedMotion ? 1 : clamp(6.5 - G.hintT, 0, 1);
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { bottom: 64 };
  const lines = ['Slide sideways to place the striker', 'Pull back and let go to strike, or flick up'];
  c.save(); c.globalAlpha = a;
  c.font = '600 13px ' + F_UI;
  const mw = min(w - 24, max(c.measureText(lines[0]).width, c.measureText(lines[1]).width) + 32);
  let below = arc.h * 0.8;
  if (R3.ok) { toPx(0, 0.07, 1.18, PX.a); below = PX.a.y + 14; }
  const y = min(arc.h - pad.bottom - 96, below);
  plate(c, (w - mw) / 2, y - 10, mw, 50, 12);
  txt(c, lines[0], w / 2, y + 5, 13, INK, 600, 'center');
  txt(c, lines[1], w / 2, y + 25, 13, INK, 600, 'center');
  c.restore();
}

function drawFail(c) {
  const w = arc.w, h = arc.h;
  c.fillStyle = '#120d0c'; c.fillRect(0, 0, w, h);
  txt(c, '3D graphics are not available in this browser.', w / 2, h * 0.45, 15, INK, 500, 'center');
  txt(c, 'The 2D board is at /games/board-strike', w / 2, h * 0.45 + 24, 13, GOLD, 500, 'center');
}

function render(c, a) {
  arc = a;
  const now = performance.now();
  R3.realDt = R3.last ? (now - R3.last) / 1000 : 1 / 60; R3.last = now;
  const dt = Math.min(0.05, R3.realDt);
  const w = arc.w, h = arc.h;
  if (!R3.ok) drawFail(c);
  else if (!R3.lost) {
    frame3D(dt);
    R3.renderer.render(R3.scene, R3.camera);
  }
  drawFloats(c);
  if (G.flash > 0 && !arc.reducedMotion) {
    c.fillStyle = 'rgba(255,183,54,' + (G.flash * 0.22) + ')';
    c.fillRect(0, 0, w, h);
  }
  if (arc.state === 'play' && !G.attract) { drawHUD(c); drawPowerBar(c); drawTouchHint(c); }
}

function dbg() {
  const s = G.striker || { x: 0, y: 0, vx: 0 };
  return {
    phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), time: +G.time.toFixed(2), pocketed: G.pocketed,
    sx: +G.sx.toFixed(3), aim: +G.aim.toFixed(3), charge: +G.charge.toFixed(3),
    vx: +s.vx.toFixed(2), moving: G.moving, attract: !!G.attract, shots: G.shots,
    touch: G.tg ? G.tg.mode || 'hold' : '',
    touchStyle: arc ? arc.touchStyle : '', quality: R3.q, fps: R3.fps || null, webgl: R3.ok,
  };
}

function boot() {
  arc = window.Arcade.create({
    slug: 'board-strike', title: 'Board Strike', genre: 'Carrom', three: true,
    hint: 'Mouse or A D aim   hold click or Space to strike',
    touchHint: 'Stick aims, hold Strike, release to shoot',
    keys: [
      ['Left / Right / A D', 'Slide the striker and aim'],
      ['Space / J (hold)', 'Charge, then release to strike'],
    ],
    mouse: { cursor: 'crosshair', keys: [['Move mouse', 'Place on the baseline and aim'], ['Click / hold', 'Charge, then release']] },
    onMenu(a) { arc = a; reset(true); },
    touch: { stick: true, pads: [{ label: 'Strike', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Place and aim'], ['Strike (hold)', 'Charge, then release']],
    gamepad: { buttons: ['Space', 'KeyJ'], rt: 'Space' },
    gestures: {
      drag: false,
      hint: 'Slide to place, pull back and let go to strike',
      keys: [
        ['Slide sideways', 'Place the striker'],
        ['Pull back, let go', 'Strike, further is harder'],
        ['Flick up', 'Quick strike that way'],
        ['Tap', 'Place on the line, or aim'],
      ],
    },
    // Settings > Graphics: 'smooth' and 'sharp' pin a quality level, 'auto' hands it back to the frame-rate auto-scaler.
    graphics(level) { if (level === 'auto') { R3.lock = false; return; } R3.lock = true; R3.q = level === 'sharp' ? 3 : 1; applyQuality(); },
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Carrom',
      title: 'Board <em>Strike</em>',
      html: '<p>Nine coins and a queen on a polished wooden board under the lamp. Aim the striker, hold to charge, release to send it. Pocket them all, and keep the striker itself out of the holes.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'clock', choices: [{ v: 'clock', label: 'Against the clock' }, { v: 'clear', label: 'Clear the board' }, { v: 'practice', label: 'Practice' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Pocketed<b>' + G.pocketed + '</b></div></div>'; },
    resize(a) {
      arc = a;
      if (!R3.renderer) return;
      applyQuality(); R3.camera.aspect = a.w / a.h; R3.camera.updateProjectionMatrix(); CAM.fitKey = '';
    },
    init(a) { arc = a; a.debug = dbg; initRenderer(); reset(true); a.menu(); },
    start(a, ch) {
      arc = a; reset(false, ch);
      R3.accT = 0; R3.accN = 0; R3.settle = 1;
      const label = G.mode === 'clear' ? 'Clear the board' : G.mode === 'practice' ? 'Practice table' : ((DIFF[G.diff] || DIFF.normal).time + ' seconds');
      arc.toast(label, 'Board Strike', 1400);
    },
    update, idle, render,
  });
  window.__boardstrike = { G, R3, CAM, fromPx, boardPx };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
