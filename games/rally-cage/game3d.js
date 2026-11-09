import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost } from '/games/shared/fx3d.js';
/*
 * Rally Cage, in real 3D: squash in a floodlit cage on a city terrace.
 * Original world on the Arcade shell; every model and texture is made in code.
 *
 * The rules are the flat version's, in the same court numbers: x across
 * (0..1), y from the front wall (top) to the paddle line (0.86). The ball
 * bounces off the front and side walls, the paddle sends it back, the hanging
 * lamps are worth 30 when clipped and 50 more when the last one goes out.
 * Three modes and three difficulties, as before.
 *
 * World (three): X = -(x - 0.5) * 7 m, Z = (0.86 - y) * 13 m, Y up. The camera
 * sits behind the paddle looking down +Z at the front wall, so +x stays on the
 * right of the screen. The ball's height is drawn from its place in the rally
 * (rising to the wall, one bounce on the way back), so the 3D flight reads like
 * squash while the game itself plays exactly as the flat one.
 */
const A = window.Arcade;
const TAU = Math.PI * 2, PI = Math.PI;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, hypot = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();
const F_DISP = 'Fraunces, Times New Roman, serif';
const F_UI = 'Inter, sans-serif';
const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';

const WC = 7.0, DC = 13.0;
const TOP = 0.1, LEFT = 0.06, RIGHT = 0.94, BOT = 0.86;
const BALL_R = 0.13;
const PAD_H = 0.55;           // paddle height in metres
const LAMP_H = 1.45;
const WX = (x) => -(x - 0.5) * WC;
const WZ = (y) => (BOT - y) * DC;
const WALL_Z = WZ(TOP + 0.018) + BALL_R;
const SIDE_X = (0.5 - LEFT - 0.018) * WC + BALL_R;

let arc = null;
const DIFF = {
  easy: { spd: 0.82, cap: 0.68 },
  normal: { spd: 1, cap: 0.85 },
  hard: { spd: 1.22, cap: 1.08 },
};
const G = {
  t: 0, score: 0, lives: 3, maxLives: 3, rally: 0, bestRally: 0, px: 0.5,
  ball: null, lamps: [], floats: [], phase: 'serve', attract: true,
  mode: 'lives', diff: 'normal', flash: 0, slow: 0, hitT: 9, wallT: 9, dropT: 9, relit: 9,
};
let POST = null;
const R3 = { ok: false, lost: false, q: 2, lock: false, soft: false, fps: null, accT: 0, accN: 0, settle: 1, time: 0, last: 0, realDt: 1 / 60 };

/* ====================================================================== rules (the flat game's) */
function serve() {
  const dir = rnd() > 0.5 ? 1 : -1;
  const spd = (G.D || DIFF.normal).spd;
  G.ball = { x: 0.5, y: 0.55, vx: (0.22 + rnd() * 0.12) * dir * spd, vy: (-0.42 - rnd() * 0.08) * spd, r: 0.018 };
  G.phase = 'play';
  if (arc && !G.attract) arc.sfx.tone(520, 0.06, { type: 'triangle', vol: 0.1 });
}

function reset(attract, ch) {
  G.mode = (ch && ch.mode) || G.mode || 'lives';
  G.diff = (ch && ch.diff) || G.diff || 'normal';
  G.D = DIFF[G.diff] || DIFF.normal;
  G.t = 0; G.score = 0; G.rally = 0; G.bestRally = 0; G.px = 0.5; G.touchDrag = 0; G.touchServes = 0;
  G.maxLives = G.mode === 'survival' ? 1 : 3;
  G.lives = G.maxLives;
  G.floats = []; G.attract = !!attract; G.phase = 'serve'; G.flash = 0; G.slow = 0;
  G.lamps = [];
  for (let i = 0; i < 8; i++) G.lamps.push({ x: 0.18 + (i % 4) * 0.21, y: 0.28 + ((i / 4) | 0) * 0.14, on: true, swing: 0, sv: 0, outT: 9 });
  serve();
  if (attract) G.phase = 'play';
  FXK.clear();
}

function floatTxt(x, y, text, col, big) {
  G.floats.push({ x, y, h: 1.2, text, col: col || WARM, life: 0.9, t: 0, big: !!big });
}

function endGame(why, title) {
  if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
  G.phase = 'over';
  arc.haptic(/held/.test(title) ? 'success' : 'fail');
  arc.over({
    eyebrow: why, title: title,
    score: Math.round(G.score), scoreLabel: 'Score',
    html: '<p>Best rally ' + G.bestRally + '. ' + (G.lamps.filter((l) => !l.on).length) + ' lamps out.</p>',
    again: 'Serve again',
  });
}

function drop() {
  G.lives--; G.rally = 0; G.flash = 0.18; G.dropT = 0;
  arc.shake = 7; arc.sfx.tone(140, 0.16, { type: 'sawtooth', slide: 70, vol: 0.12 });
  arc.haptic('heavy', 0.65); if (POST) POST.kick(-4);
  FXK.drop(G.ball.x);
  if (G.lives <= 0) endGame('Rally broken', 'Cage <em>quiet</em>');
  else {
    arc.toast('Let it drop', G.lives + ' left', 800);
    G.phase = 'serve';
    G.ball.x = 0.5; G.ball.y = 0.5; G.ball.vx = 0; G.ball.vy = 0;
  }
}

function gestStyle() { return !!(arc && arc.touchMode && arc.touchStyle === 'gesture'); }

// Where a finger or the mouse puts the paddle: the paddle sits under it on screen.
function pxFromPointer(nx) {
  if (!R3.ok || !R3.padL) return clamp(nx, 0.1, 0.9);
  const a = R3.padL, b = R3.padR;
  if (abs(b - a) < 1e-4) return clamp(nx, 0.1, 0.9);
  return clamp(0.1 + (nx - a) / (b - a) * 0.8, 0.1, 0.9);
}

function stepWorld(dt) {
  for (let i = G.floats.length - 1; i >= 0; i--) { const f = G.floats[i]; f.t += dt; if (f.t >= f.life) G.floats.splice(i, 1); }
  G.lamps.forEach((l) => {
    l.sv += (-l.swing * 9 - l.sv * 1.2) * dt; l.swing += l.sv * dt; l.outT += dt;
  });
  G.hitT += dt; G.wallT += dt; G.dropT += dt; G.relit += dt;
  G.slow = max(0, G.slow - dt); G.flash = max(0, G.flash - dt);
}

function update(dt) {
  if (G.phase === 'over') return;
  G.t += dt;
  stepWorld(dt);
  const inp = arc.input, ax = inp.axis(), p = inp.pointer;
  G.px = clamp(G.px + ax.x * dt * 2.2, 0.1, 0.9);
  // Tap & swipe: the paddle sits under the finger, anywhere on the screen.
  // A finger only serves on a tap or a flick up, so dragging never serves.
  const gest = gestStyle() && p && p.type !== 'mouse';
  if (gest && inp.gesture.active) { G.touchDrag += dt; G.px = lerp(G.px, pxFromPointer(p.nx), 1 - Math.exp(-dt * 26)); }
  else if (p && p.seen && abs(ax.x) < 0.08) G.px = lerp(G.px, pxFromPointer(p.nx), 1 - Math.exp(-dt * 16));
  if (G.phase === 'serve') {
    let go;
    if (gest) {
      const tp = inp.tap(), sw = inp.swipe();
      go = inp.hit('Space', 'KeyJ', 'Enter', 'NumpadEnter', 'ArrowUp', 'KeyW') || !!tp || !!(sw && sw.dir === 'up');
      if (tp || (sw && sw.dir === 'up')) G.touchServes++;
    } else go = inp.actionHit() || inp.hit('ArrowUp', 'KeyW');
    if (go) serve();
    return;
  }
  const b = G.ball;
  const sdt = dt * (G.slow > 0 ? 0.4 : 1);
  b.x += b.vx * sdt; b.y += b.vy * sdt;
  const top = TOP + b.r, bot = BOT, left = LEFT + b.r, right = RIGHT - b.r;
  if (b.x < left) { b.x = left; b.vx = abs(b.vx); arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.06 }); FXK.side(b, -1); }
  if (b.x > right) { b.x = right; b.vx = -abs(b.vx); arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.06 }); FXK.side(b, 1); }
  if (b.y < top) { b.y = top; b.vy = abs(b.vy); arc.sfx.tone(480, 0.04, { type: 'square', vol: 0.06 }); FXK.wall(b); }
  G.lamps.forEach((l) => {
    if (!l.on) return;
    if (hypot(b.x - l.x, b.y - l.y) < 0.045) {
      l.on = false; l.outT = 0; l.sv += (b.vx >= 0 ? -1 : 1) * 2.4; G.score += 30;
      FXK.lamp(l);
      floatTxt(l.x, l.y, '+30', WARM);
      b.vy = abs(b.vy) * 1.02; arc.sfx.tone(880, 0.1, { type: 'sine', vol: 0.12 });
      arc.sfx.noise(0.12, { freq: 5200, filter: 'highpass', vol: 0.06 });
      G.flash = 0.1; arc.haptic('hit', 0.55);
    }
  });
  if (G.lamps.length && G.lamps.every((l) => !l.on)) {
    G.lamps.forEach((l) => { l.on = true; l.outT = 9; });
    arc.haptic('success', 0.8); if (POST) POST.flash(0.25, '#fff0c8');
    G.score += 50; G.relit = 0;
    floatTxt(0.5, 0.35, '+50 lamps', GOLD, true);
    arc.toast('Lamps back', '+50', 700);
    FXK.relight();
  }
  // Half-width 0.13 of the court, as in the flat game.
  const pw = 0.13, py = bot;
  if (b.y > py - 0.035 && b.y < py + 0.05 && abs(b.x - G.px) < pw && b.vy > 0) {
    b.y = py - 0.035;
    const off = (b.x - G.px) / pw;
    b.vx += off * 0.32;
    b.vy = -abs(b.vy) * 1.03;
    const sp = hypot(b.vx, b.vy), cap = (G.D || DIFF.normal).cap;
    if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
    G.rally++; G.bestRally = max(G.bestRally, G.rally); G.score += 5 + G.rally;
    floatTxt(b.x, b.y - 0.04, '+' + (5 + G.rally), PRIM);
    arc.sfx.tone(320 + G.rally * 20, 0.06, { type: 'triangle', vol: 0.1 });
    FXK.paddle(b, off);
    arc.haptic('tap', min(1, 0.35 + abs(off) * 0.4 + G.rally * 0.02));
    if (G.rally % 10 === 0) { arc.haptic('boost', 0.8); if (POST) POST.flash(0.16, '#ffe2a0'); if (!arc.reducedMotion) G.slow = 0.55; }
    if (G.mode === 'eleven' && G.rally >= 11) endGame('Rally of 11', 'Cage <em>held</em>');
  } else if (b.y > 1.02) drop();
}

function idle(dt) {
  G.attract = true;
  if (!G.ball) reset(true);
  G.t += dt; stepWorld(dt);
  const b = G.ball;
  // the demo rally: the paddle chases the ball and the ball plays the real walls
  G.px = lerp(G.px, clamp(b.x, 0.12, 0.88), 1 - Math.exp(-dt * 5));
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < LEFT + b.r) { b.x = LEFT + b.r; b.vx = abs(b.vx); }
  if (b.x > RIGHT - b.r) { b.x = RIGHT - b.r; b.vx = -abs(b.vx); }
  if (b.y < TOP + b.r) { b.y = TOP + b.r; b.vy = abs(b.vy); FXK.wall(b); }
  if (b.y > BOT - 0.035 && b.vy > 0) { b.y = BOT - 0.035; b.vy = -abs(b.vy); b.vx = clamp(b.vx + (rnd() - 0.5) * 0.2, -0.4, 0.4); FXK.paddle(b, (b.x - G.px) / 0.13); }
}

/* ====================================================================== 3D: textures */
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = R3.aniso || 4;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  return t;
}
function grain(g, w, h, n, a, light) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = (rnd() < 0.5 ? (light || 'rgba(255,255,255,') : 'rgba(0,0,0,') + (rnd() * a).toFixed(3) + ')';
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

// Court floor, world X -3.6..3.6, Z -3..10.5 (canvas top = near end).
const FX0 = -3.6, FX1 = 3.6, FZ0 = -3, FZ1 = 10.5;
function floorTex() {
  const W = 768, H = 1440;
  return canvasTex(W, H, (g) => {
    const px = (wx) => (wx - FX0) / (FX1 - FX0) * W;
    const pz = (wz) => (wz - FZ0) / (FZ1 - FZ0) * H;
    const s = W / (FX1 - FX0);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#1f3424'); gr.addColorStop(0.5, '#2c4a30'); gr.addColorStop(1, '#3a5c3c');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // acrylic court boards
    for (let y = 0; y < H; y += 40) { g.fillStyle = 'rgba(0,0,0,' + (0.03 + rnd() * 0.05).toFixed(3) + ')'; g.fillRect(0, y, W, 2); }
    grain(g, W, H, 24000, 0.07, 'rgba(200,255,200,');
    const lx0 = px(-SIDE_X + BALL_R), lx1 = px(SIDE_X - BALL_R);
    // outer lines
    g.strokeStyle = 'rgba(251,245,236,.62)'; g.lineWidth = 0.06 * s;
    g.strokeRect(lx0, pz(-0.4), lx1 - lx0, pz(WALL_Z) - pz(-0.4));
    // short line, service boxes, centre circle (court numbers from the flat game)
    g.strokeStyle = 'rgba(251,245,236,.32)'; g.lineWidth = 0.05 * s;
    g.beginPath(); g.moveTo(lx0, pz(WZ(0.5))); g.lineTo(lx1, pz(WZ(0.5))); g.stroke();
    g.beginPath(); g.arc(px(0), pz(WZ(0.5)), 0.9 * s, 0, TAU); g.stroke();
    g.strokeRect(px(WX(0.8)), pz(WZ(0.65)), px(WX(0.2)) - px(WX(0.8)), pz(WZ(0.35)) - pz(WZ(0.65)));
    // gold inner border, as on the flat court
    g.strokeStyle = 'rgba(201,169,110,.45)'; g.lineWidth = 0.03 * s;
    g.strokeRect(lx0 + 0.2 * s, pz(-0.2), lx1 - lx0 - 0.4 * s, pz(WALL_Z - 0.2) - pz(-0.2));
    // the paddle's lane
    g.fillStyle = 'rgba(255,105,64,.10)'; g.fillRect(lx0, pz(-0.45), lx1 - lx0, 0.9 * s);
    g.strokeStyle = 'rgba(255,105,64,.55)'; g.lineWidth = 0.035 * s;
    g.beginPath(); g.moveTo(lx0, pz(0.45)); g.lineTo(lx1, pz(0.45)); g.stroke();
    // name, upside down in the canvas so it reads from the player's side
    g.save(); g.translate(px(0), pz(2.2)); g.rotate(PI);
    g.font = 'italic 600 ' + (0.5 * s) + 'px ' + F_DISP; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(201,169,110,.32)'; g.fillText('Rally Cage', 0, 0);
    g.restore();
    // scuffs where the ball lands
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(20,30,20,' + (rnd() * 0.25).toFixed(2) + ')';
      g.beginPath(); g.ellipse(px(rr(-2.5, 2.5)), pz(rr(2, 7)), rr(2, 8), rr(1, 4), rnd() * PI, 0, TAU); g.fill();
    }
  }, { clamp: true });
}

function frontWallTex() {
  const W = 1024, H = 768;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#d9c9ae'; g.fillRect(0, 0, W, H);
    grain(g, W, H, 30000, 0.08);
    for (let i = 0; i < 30; i++) {
      const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 120;
      const gr = g.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, 'rgba(90,60,40,' + (rnd() * 0.08).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(90,60,40,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // a hand-painted rangoli medallion, marigold and rani pink
    const cx = W / 2, cy = H * 0.36;
    const ring = (r, n, col, rad) => { g.fillStyle = col; for (let i = 0; i < n; i++) { const a = i / n * TAU; g.beginPath(); g.ellipse(cx + cos(a) * r, cy + sin(a) * r, rad, rad * 0.55, a, 0, TAU); g.fill(); } };
    g.globalAlpha = 0.85;
    ring(150, 24, '#e07a2a', 26); ring(110, 16, '#c22a5a', 24); ring(70, 12, '#f2b13a', 20);
    g.fillStyle = '#1f6b5a'; g.beginPath(); g.arc(cx, cy, 44, 0, TAU); g.fill();
    g.fillStyle = '#f6e3b8'; g.beginPath(); g.arc(cx, cy, 20, 0, TAU); g.fill();
    g.strokeStyle = '#7a2a18'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 182, 0, TAU); g.stroke();
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; g.fillStyle = i % 2 ? '#c22a5a' : '#e07a2a'; g.beginPath(); g.arc(cx + cos(a) * 200, cy + sin(a) * 200, 6, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    // service line and the tin
    g.fillStyle = '#b8321e'; g.fillRect(0, H * 0.7, W, 8);
    g.fillStyle = '#2a1f1a'; g.fillRect(0, H * 0.9, W, H * 0.1);
    g.fillStyle = '#b8321e'; g.fillRect(0, H * 0.9, W, 6);
    g.font = '600 26px ' + F_MONO; g.fillStyle = 'rgba(42,31,26,.55)'; g.textAlign = 'center';
    g.fillText('TERRACE CAGE  /  NO 4', W / 2, H * 0.82);
  }, { clamp: true });
}

function concreteTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#6a625a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 90;
      const gr = g.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, 'rgba(30,24,20,' + (rnd() * 0.18).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(30,24,20,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grain(g, w, h, 30000, 0.1);
    g.strokeStyle = 'rgba(20,16,14,.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
  }, { repeat: [10, 10] });
}

function woodTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#3a2418'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(' + (rnd() < 0.5 ? '90,56,34,' : '20,10,6,') + (rnd() * 0.5).toFixed(2) + ')'; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rr(-4, 4), w * 0.6, y + rr(-4, 4), w, y + rr(-3, 3)); g.stroke(); }
    g.fillStyle = 'rgba(201,169,110,.85)'; g.fillRect(0, 0, w, 5);
  }, { repeat: [6, 1] });
}

function fenceTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(205,210,215,1)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke();
  });
}

function ballTex() {
  return canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#f6ead6'); gr.addColorStop(0.5, '#fffaf2'); gr.addColorStop(1, '#e2d0b4');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    grain(g, w, h, 4000, 0.08);
    g.fillStyle = '#FFB736'; g.beginPath(); g.arc(w * 0.25, h * 0.5, 9, 0, TAU); g.fill(); g.beginPath(); g.arc(w * 0.75, h * 0.5, 9, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120,70,40,.55)'; g.lineWidth = 3;
    g.beginPath(); for (let i = 0; i <= 64; i++) { const u = i / 64; const y = h * 0.5 + sin(u * TAU * 2) * h * 0.22; i ? g.lineTo(u * w, y) : g.moveTo(0, y); } g.stroke();
  });
}

function glowTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,240,210,.7)'); gr.addColorStop(0.5, 'rgba(255,190,110,.18)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { clamp: true });
}
function blobTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { clamp: true });
}

/* ====================================================================== 3D: particles */
class FxPool {
  constructor(maxN, additive) {
    this.max = maxN; this.n = 0;
    this.p = new Float32Array(maxN * 3); this.v = new Float32Array(maxN * 3); this.c = new Float32Array(maxN * 3);
    this.sz = new Float32Array(maxN); this.al = new Float32Array(maxN); this.life = new Float32Array(maxN); this.age = new Float32Array(maxN);
    this.grav = new Float32Array(maxN); this.drag = new Float32Array(maxN); this.fade = new Float32Array(maxN);
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.p, 3); this.aC = new THREE.BufferAttribute(this.c, 3); this.aS = new THREE.BufferAttribute(this.sz, 1); this.aA = new THREE.BufferAttribute(this.al, 1);
    [this.aP, this.aC, this.aS, this.aA].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('position', this.aP); g.setAttribute('aCol', this.aC); g.setAttribute('aSize', this.aS); g.setAttribute('aAlpha', this.aA);
    g.setDrawRange(0, 0);
    this.u = { uK: { value: 600 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec3 aCol; attribute float aSize; attribute float aAlpha; uniform float uK; varying vec3 vC; varying float vA; void main(){ vC=aCol; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.5, aSize*uK/max(0.3,-mv.z)); }',
      fragmentShader: additive
        ? 'varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0) discard; float a=vA*pow(1.0-d,1.6); gl_FragColor=vec4(vC*a,a); }'
        : 'varying vec3 vC; varying float vA; void main(){ vec2 q=abs(gl_PointCoord-0.5)*2.0; if(max(q.x,q.y*1.6)>1.0) discard; gl_FragColor=vec4(vC,vA); }',
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 8;
    R3.scene.add(this.pts);
  }
  add(x, y, z, vx, vy, vz, life, size, col, alpha, grav, drag) {
    if (this.n >= this.max) this.kill((rnd() * this.max) | 0);
    const i = this.n++, j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.c[j] = col.r; this.c[j + 1] = col.g; this.c[j + 2] = col.b;
    this.sz[i] = size; this.al[i] = alpha; this.life[i] = life; this.age[i] = 0; this.grav[i] = grav || 0; this.drag[i] = drag == null ? 1 : drag; this.fade[i] = alpha;
  }
  kill(i) {
    const l = --this.n; if (i === l) return;
    const a = i * 3, b = l * 3;
    for (let k = 0; k < 3; k++) { this.p[a + k] = this.p[b + k]; this.v[a + k] = this.v[b + k]; this.c[a + k] = this.c[b + k]; }
    this.sz[i] = this.sz[l]; this.al[i] = this.al[l]; this.life[i] = this.life[l]; this.age[i] = this.age[l]; this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.fade[i] = this.fade[l];
  }
  step(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const j = i * 3, dr = Math.pow(this.drag[i], dt * 60);
      this.v[j] *= dr; this.v[j + 2] *= dr; this.v[j + 1] = this.v[j + 1] * dr - this.grav[i] * dt;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.02 && this.grav[i] > 0) { this.p[j + 1] = 0.02; this.v[j + 1] *= -0.3; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
      const u = this.age[i] / this.life[i];
      this.al[i] = this.fade[i] * (u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92);
    }
    this.pts.geometry.setDrawRange(0, this.n);
    this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = this.aA.needsUpdate = true;
  }
  clear() { this.n = 0; this.pts.geometry.setDrawRange(0, 0); }
}
const FX = { add: null, norm: null };
const COL = {};
function colorsInit() {
  COL.gold = new THREE.Color('#FFB736'); COL.warm = new THREE.Color('#ffd28a'); COL.white = new THREE.Color('#fff6e6');
  COL.prim = new THREE.Color('#FF6940'); COL.dust = new THREE.Color('#c8b69a'); COL.glass = new THREE.Color('#e8f4ff');
  COL.spark = new THREE.Color('#ffe0a0'); COL.red = new THREE.Color('#ff4a3a');
  COL.conf = ['#FFB736', '#FF6940', '#FBF5EC', '#c9a96e', '#7fd1ff', '#ff7ab6'].map((c) => new THREE.Color(c));
}
const FXK = {
  paddle(b, off) {
    G.hitT = 0; G.hitOff = off || 0;
    if (!FX.add) return;
    const x = WX(b.x), z = WZ(b.y) + 0.1, y = PAD_H + 0.05;
    const n = arc && arc.reducedMotion ? 8 : 22 + min(20, G.rally * 2);
    for (let i = 0; i < n; i++) FX.add.add(x, y, z, rr(-2.2, 2.2), rr(0.2, 2.6), rr(0.2, 3.2), rr(0.2, 0.45), rr(0.04, 0.08), rnd() < 0.5 ? COL.gold : COL.prim, 1, 6, 0.95);
    if (arc && !G.attract) arc.shake = Math.max(arc.shake, 1.5 + min(3, G.rally * 0.2));
  },
  wall(b) {
    G.wallT = 0; G.wallX = b.x; G.wallH = BH.h;
    if (!FX.norm) return;
    const x = WX(b.x), y = BH.h;
    for (let i = 0; i < 10; i++) FX.norm.add(x + rr(-0.1, 0.1), y + rr(-0.1, 0.1), WALL_Z - 0.06, rr(-0.8, 0.8), rr(-0.4, 0.9), rr(-1.4, -0.3), rr(0.35, 0.7), rr(0.05, 0.1), COL.dust, 0.5, 2, 0.94);
  },
  side(b, s) {
    if (!FX.add) return;
    const x = WX(b.x) + (s > 0 ? -1 : 1) * BALL_R, z = WZ(b.y), y = BH.h;
    for (let i = 0; i < 6; i++) FX.add.add(x, y, z, rr(-0.5, 0.5) - s * 0.8, rr(-0.3, 0.8), rr(-0.6, 0.6), rr(0.15, 0.3), rr(0.03, 0.05), COL.white, 0.8, 3, 0.94);
    G.cageHit = 1; G.cageSide = s;
  },
  lamp(l) {
    if (!FX.add) return;
    const x = WX(l.x), z = WZ(l.y), y = LAMP_H;
    const rm = arc && arc.reducedMotion;
    for (let i = 0; i < (rm ? 10 : 30); i++) FX.add.add(x, y, z, rr(-2.5, 2.5), rr(-0.5, 2.8), rr(-2.5, 2.5), rr(0.25, 0.6), rr(0.04, 0.09), COL.gold, 1, 5, 0.95);
    for (let i = 0; i < (rm ? 8 : 22); i++) FX.norm.add(x, y, z, rr(-1.6, 1.6), rr(0, 2.2), rr(-1.6, 1.6), rr(0.5, 1.0), rr(0.025, 0.045), COL.glass, 0.9, 8, 0.98);
  },
  relight() {
    if (!FX.add) return;
    const rm = arc && arc.reducedMotion;
    G.lamps.forEach((l) => {
      const x = WX(l.x), z = WZ(l.y);
      for (let i = 0; i < (rm ? 6 : 18); i++) FX.norm.add(x, LAMP_H + 0.2, z, rr(-1.4, 1.4), rr(1, 3.2), rr(-1.4, 1.4), rr(0.9, 1.6), rr(0.03, 0.05), COL.conf[(rnd() * COL.conf.length) | 0], 1, 4, 0.97);
    });
  },
  drop(x) {
    if (!FX.add) return;
    const wx = WX(x);
    for (let i = 0; i < 20; i++) FX.add.add(wx, 0.3, -1.2, rr(-1.5, 1.5), rr(0.3, 2), rr(-2, 0.5), rr(0.3, 0.6), rr(0.04, 0.07), COL.red, 0.9, 5, 0.95);
  },
  bounce(x, z) {
    if (!FX.norm) return;
    for (let i = 0; i < 9; i++) { const a = rnd() * TAU; FX.norm.add(x, 0.04, z, cos(a) * rr(0.2, 0.8), rr(0.1, 0.5), sin(a) * rr(0.2, 0.8), rr(0.35, 0.7), rr(0.05, 0.1), COL.dust, 0.35, 0.6, 0.94); }
  },
  clear() { if (FX.add) { FX.add.clear(); FX.norm.clear(); } },
};

/* ====================================================================== 3D: the ball's height */
// Out to the wall the ball rises; back off the wall it falls, bounces once
// mid court and rises to the paddle. Lamps pull it to their height so a clip reads.
const BH = { h: 0.9, prev: 0.9, bounced: false, retU: 0 };
function ballHeight(b) {
  const span = BOT - TOP;
  let h;
  if (G.phase === 'serve') h = 0.95 + (arc && arc.reducedMotion ? 0 : sin(R3.time * 3) * 0.06);
  else if (b.vy < 0) {
    const u = clamp((BOT - b.y) / span, 0, 1);
    h = PAD_H + u * 0.95 + sin(u * PI) * 0.75;
  } else {
    const u = clamp((b.y - TOP) / span, 0, 1.4), ub = 0.55;
    if (u < ub) h = 1.5 * (1 - (u / ub) * (u / ub));
    else if (u <= 1) { const v = (u - ub) / (1 - ub); h = PAD_H * v + 1.4 * v * (1 - v); }
    else h = PAD_H * (1 - (u - 1) / 0.4);
  }
  // lamps pull the ball to their height when it passes close
  let near = 0;
  for (let i = 0; i < G.lamps.length; i++) { const l = G.lamps[i]; if (!l.on && l.outT > 0.3) continue; const d = hypot(b.x - l.x, (b.y - l.y) * 0.8); near = max(near, clamp(1 - d / 0.1, 0, 1)); }
  h = lerp(h, LAMP_H, ease(near));
  return max(BALL_R, h);
}

/* ====================================================================== 3D: world */
const W = {};
function std(o) { return new THREE.MeshStandardMaterial(o); }

function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(-0.5, 0.42, 0.75).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }',
    fragmentShader: [
      'uniform vec3 uSun; varying vec3 vD;',
      'void main(){',
      ' float h=vD.y;',
      ' vec3 zen=vec3(0.025,0.028,0.07); vec3 mid=vec3(0.13,0.07,0.2); vec3 hor=vec3(0.42,0.17,0.24); vec3 low=vec3(0.06,0.04,0.035);',
      ' vec3 c=mix(hor,mid,smoothstep(0.0,0.2,h)); c=mix(c,zen,smoothstep(0.18,0.7,h)); c=mix(c,low,smoothstep(0.0,-0.12,h));',
      ' float s=max(dot(vD,uSun),0.0);',
      ' c+=vec3(1.0,0.72,0.35)*pow(s,24.0)*0.25 + vec3(1.0,0.82,0.5)*smoothstep(0.9993,0.9996,s)*1.6;',
      ' c+=vec3(0.9,0.42,0.3)*0.12*exp(-abs(h)*12.0);',
      ' gl_FragColor=vec4(c,1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat); sky.renderOrder = -10; sky.frustumCulled = false;
  R3.scene.add(sky);
  const n = 320, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, e = 0.2 + rnd() * 1.3;
    pos[i * 3] = cos(a) * cos(e) * 380; pos[i * 3 + 1] = sin(e) * 380; pos[i * 3 + 2] = sin(a) * cos(e) * 380;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff1d8, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false }));
  stars.renderOrder = -9; R3.scene.add(stars);
}

function cityMaterial() {
  const mat = std({ color: 0x15111b, roughness: 0.85, metalness: 0.15 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vec4 wp4 = vec4(transformed, 1.0); vec3 wn3 = objectNormal;',
        '#ifdef USE_INSTANCING',
        ' wp4 = instanceMatrix * wp4; wn3 = mat3(instanceMatrix) * wn3;',
        '#endif',
        'vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn3);',
      ].join('\n'));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;\nfloat h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }')
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '{ vec3 n = normalize(vWN); float side = 1.0 - step(0.6, abs(n.y));',
        '  vec2 tg = normalize(vec2(-n.z, n.x) + 1e-5); float hc = dot(vWP.xz, tg);',
        '  vec2 cell = vec2(hc / 1.55, vWP.y / 2.9); vec2 id = floor(cell); vec2 f = fract(cell);',
        '  float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.78);',
        '  vec2 bid = id + floor(n.xz * 3.0) * 37.0 + floor(vWP.xz / 40.0) * 11.0;',
        '  float lit = step(0.62, h21(bid)); float tone = h21(bid + 7.7); float lv = 0.3 + 0.6 * h21(bid + 3.1);',
        '  vec3 wc = mix(vec3(1.0, 0.68, 0.36), vec3(0.62, 0.74, 1.0), step(0.8, tone));',
        '  float base = smoothstep(-6.0, 6.0, vWP.y);',
        '  totalEmissiveRadiance += wc * win * lit * lv * side * 1.25 * base;',
        '  diffuseColor.rgb += vec3(0.015, 0.012, 0.03) * win * (1.0 - lit) * side; }',
      ].join('\n'));
  };
  return mat;
}

function buildCity() {
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const rng = A.rng(7);
  const list = [];
  for (let i = 0; i < 130; i++) {
    const side = i % 4;
    let x, z;
    if (side < 2) { x = (rng() - 0.5) * 260; z = 36 + rng() * 170; }
    else if (side === 2) { x = 24 + rng() * 90; z = -40 + rng() * 150; }
    else { x = -24 - rng() * 90; z = -40 + rng() * 150; }
    const dist = hypot(x, z - 4);
    if (dist < 30) continue;
    const w = 8 + rng() * 16, d = 8 + rng() * 16;
    const gap = abs(x) < 30 && z > 0 ? 0.55 : 1;
    const top = clamp((dist - 40) * 0.42, -8, 70) * (0.35 + rng() * 0.65) * gap - 4 + rng() * 6;
    list.push([x, -40, z, w, top + 40, d]);
  }
  const im = new THREE.InstancedMesh(geo, cityMaterial(), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((b, i) => { p.set(b[0], b[1], b[2]); s.set(b[3], b[4], b[5]); q.setFromAxisAngle(up, (rng() - 0.5) * 0.3); m.compose(p, q, s); im.setMatrixAt(i, m); });
  R3.scene.add(im);
  const tall = list.filter((b) => b[4] > 70).slice(0, 14);
  W.redLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020, fog: false }), Math.max(1, tall.length));
  tall.forEach((b, i) => { p.set(b[0], b[1] + b[4] + 0.6, b[2]); s.set(1, 1, 1); q.identity(); m.compose(p, q, s); W.redLights.setMatrixAt(i, m); });
  W.redLights.count = tall.length;
  R3.scene.add(W.redLights);
}

function buildCourt() {
  // the terrace
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(30, 36), std({ map: concreteTex(), color: 0x8a8078, roughness: 0.95 }));
  roof.rotation.x = -PI / 2; roof.position.set(0, -0.01, 4); roof.receiveShadow = true; R3.scene.add(roof);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FX1 - FX0, FZ1 - FZ0), std({ map: floorTex(), roughness: 0.55, metalness: 0.0 }));
  floor.rotation.x = -PI / 2; floor.position.set(0, 0, (FZ0 + FZ1) / 2); floor.receiveShadow = true; R3.scene.add(floor);
  // the front wall
  const fw = new THREE.Mesh(new THREE.BoxGeometry(SIDE_X * 2 + 0.6, 5, 0.4), std({ map: frontWallTex(), roughness: 0.9 }));
  fw.position.set(0, 2.5, WALL_Z + 0.2); fw.rotation.y = PI; fw.receiveShadow = true; fw.castShadow = true; R3.scene.add(fw);
  W.frontWall = fw;
  // the impact mark the ball leaves on the wall
  const mk = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshBasicMaterial({ map: R3.glow, color: 0xffd090, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  mk.rotation.y = PI; mk.position.set(0, 1, WALL_Z - 0.005); R3.scene.add(mk); W.wallMark = mk;
  // side walls: low wooden kickboards with a gold edge, the cage above
  const wood = std({ map: woodTex(), roughness: 0.7 });
  const len = WALL_Z + 3.4;
  [-1, 1].forEach((s) => {
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, len), wood);
    kb.position.set(s * (SIDE_X + 0.08), 0.35, WALL_Z - len / 2); kb.castShadow = true; kb.receiveShadow = true; R3.scene.add(kb);
  });
  const ft = fenceTex();
  const fh = 4.4;
  W.cageMats = [];
  [-1, 1].forEach((s) => {
    const t = ft.clone(); t.needsUpdate = true; t.repeat.set(len / 0.16, (fh - 0.7) / 0.16);
    const m = std({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.7, color: 0xb8bcc2, emissive: 0xffe0b0, emissiveIntensity: 0 });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(len, fh - 0.7), m);
    pl.rotation.y = PI / 2; pl.position.set(s * (SIDE_X + 0.1), 0.7 + (fh - 0.7) / 2, WALL_Z - len / 2); R3.scene.add(pl);
    W.cageMats.push(m);
  });
  // posts with gold caps
  const posts = [];
  for (let z = WALL_Z; z > -3.6; z -= 2.6) { posts.push([-(SIDE_X + 0.1), z]); posts.push([SIDE_X + 0.1, z]); }
  const pmat = std({ color: 0x2a2420, roughness: 0.5, metalness: 0.7 });
  const pim = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, fh, 8), pmat, posts.length);
  const cim = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 10), std({ color: 0xc9a96e, roughness: 0.35, metalness: 0.9 }), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => { m.makeTranslation(p[0], fh / 2, p[1]); pim.setMatrixAt(i, m); m.makeTranslation(p[0], fh + 0.04, p[1]); cim.setMatrixAt(i, m); });
  pim.castShadow = true; R3.scene.add(pim); R3.scene.add(cim);
  // top rails
  [-1, 1].forEach((s) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), pmat); r.position.set(s * (SIDE_X + 0.1), fh, WALL_Z - len / 2); R3.scene.add(r);
  });
  // a low railing behind the player, the terrace edge beyond it
  const rail = new THREE.Mesh(new THREE.BoxGeometry(SIDE_X * 2 + 0.3, 0.06, 0.06), pmat); rail.position.set(0, 1.0, -3.4); R3.scene.add(rail);
  const parapetM = std({ color: 0xa07058, roughness: 0.92 });
  [[0, 21, 30, 0.3], [-15, 4, 0.3, 36], [15, 4, 0.3, 36]].forEach((wl) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(wl[2], 1.0, wl[3]), parapetM); p.position.set(wl[0], 0.5, wl[1]); p.receiveShadow = true; R3.scene.add(p);
  });
  // overhead wires that hold the lamps
  const wp = [];
  [0.28, 0.42].forEach((y) => { const z = WZ(y); wp.push(-(SIDE_X + 0.1), fh, z, SIDE_X + 0.1, fh, z); });
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  R3.scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3a3028 })));
  W.cageH = fh;
}

function buildFloodlights() {
  const poleG = new THREE.CylinderGeometry(0.07, 0.1, 7.5, 10);
  const pm = std({ color: 0x24221f, roughness: 0.5, metalness: 0.75 });
  const hm = std({ color: 0x1a1816, roughness: 0.4, metalness: 0.6 });
  const faceM = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
  W.lampGlows = [];
  [[-(SIDE_X + 0.9), WALL_Z + 0.4], [SIDE_X + 0.9, WALL_Z + 0.4], [-(SIDE_X + 0.9), -3], [SIDE_X + 0.9, -3]].forEach((s) => {
    const pole = new THREE.Mesh(poleG, pm); pole.position.set(s[0], 3.75, s[1]); pole.castShadow = true; R3.scene.add(pole);
    const head = new THREE.Group(); head.position.set(s[0] * 0.92, 7.5, s[1]); head.lookAt(0, 0, 4.5);
    head.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.22), hm));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.36), faceM); face.position.z = 0.115; head.add(face);
    R3.scene.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: R3.glow, color: 0xffe8c0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(3, 3, 1); glow.position.copy(head.position); R3.scene.add(glow); W.lampGlows.push(glow);
  });
}

// Eight hanging lamps on two wires: brass cap, glass bulb, a glow, a cord.
function buildLamps() {
  W.lampObjs = [];
  const capM = std({ color: 0xc9a96e, roughness: 0.35, metalness: 0.9 });
  const capG = new THREE.ConeGeometry(0.17, 0.14, 16, 1, true); capG.translate(0, 0.07, 0);
  const bulbG = new THREE.SphereGeometry(0.1, 16, 12);
  const cordM = new THREE.LineBasicMaterial({ color: 0x2a221c });
  for (let i = 0; i < 8; i++) {
    const pivot = new THREE.Group(); R3.scene.add(pivot);
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -(W.cageH - LAMP_H - 0.12), 0], 3));
    pivot.add(new THREE.Line(cg, cordM));
    const hang = new THREE.Group(); hang.position.y = -(W.cageH - LAMP_H); pivot.add(hang);
    const cap = new THREE.Mesh(capG, capM); cap.position.y = 0.04; cap.castShadow = true; hang.add(cap);
    const bm = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffc070, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.95 });
    const bulb = new THREE.Mesh(bulbG, bm); bulb.position.y = -0.04; hang.add(bulb);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: R3.glow, color: 0xffb860, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(1.3, 1.3, 1); glow.position.y = -0.04; hang.add(glow);
    W.lampObjs.push({ pivot, hang, bm, glow });
  }
  // two warm lights carry the lamps' glow onto the court, dimming as they go out
  W.lampLights = [0.28, 0.42].map((y) => { const l = new THREE.PointLight(0xffb060, 6, 9, 1.8); l.position.set(0, LAMP_H + 0.4, WZ(y)); R3.scene.add(l); return l; });
}

function buildPaddle() {
  const g = new THREE.Group(); R3.scene.add(g); W.paddle = g;
  const len = 0.26 * WC;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, len - 0.2, 6, 16), std({ color: 0xff6940, roughness: 0.3, metalness: 0.25, emissive: 0xff6940, emissiveIntensity: 0.15 }));
  body.rotation.z = PI / 2; body.scale.set(1, 1, 1.25); body.castShadow = true; g.add(body); W.padBody = body;
  const trim = new THREE.Mesh(new THREE.CapsuleGeometry(0.104, len - 0.2, 6, 16), std({ color: 0xc9a96e, roughness: 0.3, metalness: 0.9 }));
  trim.rotation.z = PI / 2; trim.scale.set(0.35, 1.01, 1.3); g.add(trim);
  const capM = std({ color: 0xe8e2d8, roughness: 0.2, metalness: 0.95 });
  [-1, 1].forEach((sd) => { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10), capM); cap.position.x = sd * (len / 2 - 0.06); cap.scale.set(0.7, 1, 1.3); g.add(cap); });
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
  spot.position.set(0, 0.0, 0.131); g.add(spot);
  // underglow strip
  const strip = new THREE.Mesh(new THREE.BoxGeometry(len - 0.25, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0xffb070 }));
  strip.position.set(0, -0.11, 0.12); g.add(strip); W.padStrip = strip;
  // the shockwave ring on a hit
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 32), new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  R3.scene.add(ring); W.padRing = ring;
  // the rail it rides on
  const rail = new THREE.Mesh(new THREE.BoxGeometry(SIDE_X * 2 - 0.2, 0.04, 0.1), std({ color: 0x2a2420, roughness: 0.5, metalness: 0.6, emissive: 0xff6940, emissiveIntensity: 0.25 }));
  rail.position.set(0, 0.02, 0); rail.receiveShadow = true; R3.scene.add(rail);
  const lightUnder = new THREE.PointLight(0xff8a50, 2.5, 3.5, 2); g.add(lightUnder); lightUnder.position.set(0, -0.2, 0.3); W.padLight = lightUnder;
}

function buildBall() {
  W.ballMat = std({ map: ballTex(), roughness: 0.45, metalness: 0, emissive: 0xffe6c0, emissiveIntensity: 0.08 });
  W.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), W.ballMat); W.ball.castShadow = true; R3.scene.add(W.ball);
  W.ballQ = new THREE.Quaternion();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }));
  blob.rotation.x = -PI / 2; blob.renderOrder = 2; R3.scene.add(blob); W.blob = blob;
  // the serve marker: a ring under the waiting ball
  const sr = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 40), new THREE.MeshBasicMaterial({ color: 0xffb736, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  sr.rotation.x = -PI / 2; sr.position.y = 0.02; R3.scene.add(sr); W.serveRing = sr;
  // the ball's streak: a short ribbon of glowing points
  W.trailN = 14; W.trailPos = new Float32Array(W.trailN * 3); W.trailHist = [];
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(W.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  W.trailAlpha = new Float32Array(W.trailN); tg.setAttribute('aA', new THREE.BufferAttribute(W.trailAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  W.trailU = { uK: { value: 600 }, uCol: { value: new THREE.Color(0xfff2d8) } };
  W.trail = new THREE.Points(tg, new THREE.ShaderMaterial({
    uniforms: W.trailU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aA; uniform float uK; varying float vA; void main(){ vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.0,(0.12+aA*0.14)*uK/max(0.3,-mv.z)); }',
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0) discard; float a=vA*pow(1.0-d,2.0)*0.6; gl_FragColor=vec4(uCol*a,a); }',
  }));
  W.trail.frustumCulled = false; R3.scene.add(W.trail);
}

// A handful of neighbours watching from the terrace, cheering on long rallies.
function buildCrowd() {
  const spots = [];
  for (let i = 0; i < 7; i++) { spots.push([-(SIDE_X + 1.3 + (i % 2) * 0.7), 1.5 + i * 1.25, 1]); spots.push([SIDE_X + 1.3 + ((i + 1) % 2) * 0.7, 2.1 + i * 1.2, -1]); }
  const n = spots.length;
  const shirt = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.34, 4, 10), std({ color: 0xffffff, roughness: 0.8 }), n);
  const legs = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.065, 0.62, 4, 8), std({ color: 0x24262c, roughness: 0.85 }), n * 2);
  const arms = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 8), std({ color: 0x8a5a3c, roughness: 0.6 }), n * 2);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 12, 10), std({ color: 0x8a5a3c, roughness: 0.6 }), n);
  const hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 12, 8, 0, TAU, 0, PI * 0.5), std({ color: 0x15100d, roughness: 0.9 }), n);
  const cols = ['#c22a5a', '#e07a2a', '#1f6b5a', '#f2b13a', '#3a4a8a', '#d9c9ae', '#7a2a18'];
  spots.forEach((s, i) => { shirt.setColorAt(i, new THREE.Color(cols[i % cols.length])); });
  [shirt, legs, arms, head].forEach((m) => { m.castShadow = true; R3.scene.add(m); });
  R3.scene.add(hair);
  W.crowd = { shirt, legs, arms, head, hair, spots, ph: spots.map(() => rnd() * TAU), m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), sc: new THREE.Vector3(1, 1, 1) };
}
function animCrowd(t) {
  const C = W.crowd; if (!C) return;
  const hype = clamp(G.rally / 10, 0, 1) + clamp(1 - G.relit / 1.5, 0, 1);
  const rm = arc.reducedMotion;
  const put = (mesh, i, x, y, z, rx, rz, ry) => { C.e.set(rx || 0, ry || 0, rz || 0); C.q.setFromEuler(C.e); C.p.set(x, y, z); C.m.compose(C.p, C.q, C.sc); mesh.setMatrixAt(i, C.m); };
  C.spots.forEach((s, i) => {
    const ph = C.ph[i];
    const jump = rm ? 0 : max(0, sin(t * (4 + hype * 4) + ph)) * 0.1 * hype;
    const sway = rm ? 0 : sin(t * 1.3 + ph) * 0.03;
    const face = s[2] > 0 ? -PI / 2 : PI / 2;
    const x = s[0] + sway, z = s[1], y = jump;
    put(C.legs, i * 2, x, 0.4 + y, z - 0.08, 0, 0, face); put(C.legs, i * 2 + 1, x, 0.4 + y, z + 0.08, 0, 0, face);
    put(C.shirt, i, x, 1.06 + y, z, 0, 0, face);
    put(C.head, i, x, 1.52 + y, z, 0, 0, face); put(C.hair, i, x, 1.535 + y, z, 0, 0, face);
    const cheer = rm ? 0.3 : clamp(hype, 0, 1) * (0.6 + 0.4 * sin(t * 6 + ph));
    put(C.arms, i * 2, x, 1.1 + y + cheer * 0.25, z - 0.21, -cheer * 2.6, 0, 0);
    put(C.arms, i * 2 + 1, x, 1.1 + y + cheer * 0.25, z + 0.21, cheer * 2.6, 0, 0);
  });
  [C.legs, C.shirt, C.head, C.hair, C.arms].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
}

function buildLights() {
  R3.scene.add(new THREE.HemisphereLight(0x5a5a9a, 0x1a2418, 0.7));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  key.position.set(-2.5, 12, 6); key.target.position.set(0, 0, 4);
  key.castShadow = true;
  const sc = key.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 9; sc.bottom = -7; sc.near = 1; sc.far = 30;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.mapSize.set(1024, 1024);
  R3.scene.add(key); R3.scene.add(key.target); R3.key = key;
  const front = new THREE.SpotLight(0xffd8a8, 22, 30, 0.8, 0.6, 1.5);
  front.position.set(0, 7.5, -3.5); front.target.position.set(0, 1.5, WALL_Z); R3.scene.add(front); R3.scene.add(front.target);
  R3.front = front;
  const fill = new THREE.DirectionalLight(0x8a70c0, 0.4); fill.position.set(6, 4, 20); R3.scene.add(fill);
}

/* ====================================================================== 3D: boot and frame */
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
    r.setClearColor(0x0e1020, 1);
    R3.renderer = r; R3.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
    arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
    R3.q = R3.soft ? 0 : (window.matchMedia && matchMedia('(pointer: coarse)').matches ? 2 : 3);
    const qm = /[?&]q=(\d)/.exec(location.search); if (qm) { R3.q = clamp(+qm[1], 0, 3); R3.lock = true; }
    R3.scene = new THREE.Scene();
    R3.scene.fog = new THREE.FogExp2(0x2a1a34, 0.0085);
    R3.camera = new THREE.PerspectiveCamera(46, arc.w / arc.h, 0.1, 900);
    R3.glow = glowTex();
    colorsInit();
    buildSky(); buildCity(); buildCourt(); buildFloodlights(); buildLamps(); buildPaddle(); buildBall(); buildCrowd(); buildLights();
    FX.add = new FxPool(800, true); FX.norm = new FxPool(600, false);
    R3.camPos = new THREE.Vector3(0, 4, -7); R3.camLook = new THREE.Vector3(0, 0.6, 5);
    R3.proj = new THREE.Vector3(); R3.v = new THREE.Vector3();
    // Shared post pass: bloom on the floodlights and lamps, grade, grain; the camera swings onto the court at the start.
    POST = createPost(r, { arc, soft: R3.soft, intro: { yaw: 0.85, up: 0.45, back: 0.4 }, results: { yaw: 0.3 }, target: (v) => v.copy(R3.camLook), look: { bloom: 0.62, threshold: 0.68 } });
    applyQuality();
    R3.ok = true;
  } catch (err) {
    R3.ok = false; R3.fail = String((err && err.message) || err);
    try { console.warn('3D unavailable: ' + R3.fail); } catch (e) { /* ignore */ }
  }
}

function applyQuality() {
  const r = R3.renderer; if (!r || !arc) return;
  const f = (R3.soft ? [0.45, 0.6, 0.8, 1] : [0.55, 0.72, 0.88, 1])[R3.q];
  // A software renderer pays for every pixel on the CPU, so at its lowest tier it gets a fixed
  // budget, as Saffron City does, instead of filling every pixel of a 1440x900 window.
  const pr = Math.max(0.5, arc.dpr * f);
  r.setPixelRatio(R3.soft && R3.q === 0 ? Math.max(0.3, Math.min(pr, Math.sqrt(160000 / Math.max(1, arc.w * arc.h)))) : pr); r.setSize(arc.w, arc.h, false);
  const key = R3.key, want = R3.q >= 3 ? 2048 : R3.q >= 1 ? 1024 : 512;
  r.shadowMap.enabled = R3.q >= 1; key.castShadow = R3.q >= 1;
  if (key.shadow.mapSize.x !== want) { key.shadow.mapSize.set(want, want); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
  if (W.lampLights) W.lampLights.forEach((l) => { l.visible = R3.q >= 1; });
  if (W.padLight) W.padLight.visible = R3.q >= 2;
}

function cameraRig(dt) {
  const cam = R3.camera, rm = arc.reducedMotion, b = G.ball;
  const asp = arc.w / arc.h, portrait = asp < 0.95;
  const padX = WX(G.px);
  // portrait: high behind the paddle looking down the court; landscape: lower and wider
  let fov, px, py, pz, lx, ly, lz;
  if (portrait) {
    fov = clamp(2 * Math.atan(Math.tan(18 * PI / 180) / asp) * 180 / PI, 40, 72);
    px = padX * 0.25; py = 9.4; pz = -4.6; lx = padX * 0.2; ly = 0; lz = 7.9;
  } else {
    fov = clamp(2 * Math.atan(Math.tan(31 * PI / 180) / asp) * 180 / PI, 34, 50);
    px = padX * 0.35; py = 6.4; pz = -6.4; lx = padX * 0.25; ly = 0.2; lz = 4.6;
  }
  // a little life: drift toward the ball's side and a breath of zoom on long rallies
  if (b && !rm) { lx += WX(b.x) * 0.08; fov *= 1 - clamp(G.rally / 30, 0, 1) * 0.05; }
  if (G.slow > 0 && !rm && b) { const s = sin(clamp(G.slow / 0.55, 0, 1) * PI) * 0.1; fov *= 1 - s; lx = lerp(lx, WX(b.x), s * 3); }
  if (G.attract) { const t = R3.time * 0.15; px = sin(t) * 2.4; py += 0.5; pz += cos(t * 0.8) * 0.6; }
  const k = R3.snap ? 1 : 1 - Math.exp(-dt * (rm ? 2.5 : 4.5)); R3.snap = false;
  R3.camPos.x = lerp(R3.camPos.x, px, k); R3.camPos.y = lerp(R3.camPos.y, py, k); R3.camPos.z = lerp(R3.camPos.z, pz, k);
  R3.camLook.x = lerp(R3.camLook.x, lx, k); R3.camLook.y = lerp(R3.camLook.y, ly, k); R3.camLook.z = lerp(R3.camLook.z, lz, k);
  cam.position.copy(R3.camPos);
  cam.position.x += (arc.shakeX || 0) * 0.008; cam.position.y += (arc.shakeY || 0) * 0.008;
  cam.lookAt(R3.camLook);
  if (abs(cam.fov - fov) > 0.01 || abs(cam.aspect - asp) > 0.0001) { cam.fov = k === 1 ? fov : lerp(cam.fov, fov, 1 - Math.exp(-dt * 6)); cam.aspect = asp; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
  // where the paddle line spans on screen, so a finger or the mouse puts the paddle under it
  R3.v.set(WX(0.1), PAD_H, 0).project(cam); R3.padL = R3.v.x * 0.5 + 0.5;
  R3.v.set(WX(0.9), PAD_H, 0).project(cam); R3.padR = R3.v.x * 0.5 + 0.5;
}

const _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
function frame3D(dt) {
  R3.time += dt;
  const t = R3.time, rm = arc.reducedMotion;
  const b = G.ball;
  // paddle
  const padX = WX(G.px), hit = clamp(1 - G.hitT / 0.25, 0, 1);
  W.paddle.position.set(padX, PAD_H, -0.02 - hit * 0.12);
  W.paddle.rotation.y = rm ? 0 : -(G.hitOff || 0) * 0.12 * hit;
  W.padBody.scale.set(1 + hit * 0.2, 1 - hit * 0.06, 1.25 + hit * 0.25);
  W.padStrip.material.color.setRGB(1, 0.69 + hit * 0.3, 0.44 + hit * 0.4);
  W.padLight.intensity = 2.5 + hit * 8;
  W.padRing.visible = hit > 0;
  if (hit > 0) { const s = 1 + (1 - hit) * 3.5; W.padRing.scale.set(s, s, s); W.padRing.material.opacity = hit * 0.7; W.padRing.position.set(padX, PAD_H, 0.15); }
  // ball
  if (b) {
    const hTarget = ballHeight(b);
    BH.h = lerp(BH.h, hTarget, 1 - Math.exp(-dt * 22));
    const x = WX(b.x), z = WZ(b.y);
    W.ball.position.set(x, BH.h, z);
    // a bounce mark where the falling ball meets the floor
    if (G.phase === 'play' && b.vy > 0) {
      const u = (b.y - TOP) / (BOT - TOP);
      if (u > 0.55 && BH.retU <= 0.55) { FXK.bounce(x, z); if (!G.attract && arc.state === 'play') arc.sfx.noise(0.05, { freq: 600, vol: 0.05 }); }
      BH.retU = u;
    } else BH.retU = 0;
    const sp = hypot(b.vx, b.vy);
    if (G.phase === 'play' && sp > 0.01) { _ax.set(b.vy / sp, 0, b.vx / sp); _q.setFromAxisAngle(_ax, sp * dt * 18 * (G.slow > 0 ? 0.4 : 1)); W.ballQ.premultiply(_q); }
    W.ball.quaternion.copy(W.ballQ);
    W.blob.position.set(x, 0.015, z); const bs = 0.5 + BH.h * 0.12; W.blob.scale.set(bs, bs, 1); W.blob.material.opacity = clamp(1.1 - BH.h * 0.35, 0.25, 0.9);
    W.serveRing.visible = G.phase === 'serve';
    if (W.serveRing.visible) { W.serveRing.position.set(x, 0.02, z); const s = 1 + (rm ? 0 : (sin(t * 4) * 0.5 + 0.5) * 0.4); W.serveRing.scale.set(s, s, s); }
    // trail
    W.trailHist.unshift(x, BH.h, z); if (W.trailHist.length > W.trailN * 3) W.trailHist.length = W.trailN * 3;
    const live = G.phase === 'play';
    for (let i = 0; i < W.trailN; i++) {
      const j = min(i * 3, W.trailHist.length - 3);
      W.trailPos[i * 3] = W.trailHist[j]; W.trailPos[i * 3 + 1] = W.trailHist[j + 1]; W.trailPos[i * 3 + 2] = W.trailHist[j + 2];
      W.trailAlpha[i] = live ? (1 - i / W.trailN) : 0;
    }
    W.trail.geometry.attributes.position.needsUpdate = true; W.trail.geometry.attributes.aA.needsUpdate = true;
    W.trailU.uCol.value.setRGB(1, lerp(0.95, 0.55, clamp(G.rally / 12, 0, 1)), lerp(0.85, 0.3, clamp(G.rally / 12, 0, 1)));
  }
  // wall mark
  const wm = clamp(1 - G.wallT / 0.6, 0, 1);
  W.wallMark.material.opacity = wm * 0.8; if (wm > 0) { W.wallMark.position.set(WX(G.wallX || 0.5), G.wallH || 1, WALL_Z - 0.005); const s = 1 + (1 - wm) * 0.8; W.wallMark.scale.set(s, s, s); }
  // cage shimmer on a side hit
  G.cageHit = max(0, (G.cageHit || 0) - dt * 4);
  W.cageMats.forEach((m, i) => { m.emissiveIntensity = (G.cageSide === (i === 0 ? 1 : -1) ? G.cageHit : 0) * 0.35; });
  // lamps
  let litA = 0, litB = 0;
  const relit = clamp(1 - G.relit / 0.8, 0, 1);
  G.lamps.forEach((l, i) => {
    const o = W.lampObjs[i]; if (!o) return;
    o.pivot.position.set(WX(l.x), W.cageH, WZ(l.y));
    o.pivot.rotation.z = rm ? 0 : l.swing * 0.35;
    o.pivot.rotation.x = rm ? 0 : sin(t * 0.9 + i) * 0.015;
    const flick = l.on ? 1 : (l.outT < 0.25 && !rm ? (sin(l.outT * 90) > 0 ? 0.6 : 0.1) : 0);
    o.bm.emissiveIntensity = l.on ? 2.2 + relit * 3 : flick * 2;
    o.bm.color.setRGB(l.on ? 1 : 0.35, l.on ? 0.95 : 0.36, l.on ? 0.85 : 0.4);
    o.glow.material.opacity = l.on ? 0.85 + relit * 0.15 : flick * 0.5;
    o.glow.scale.setScalar(l.on ? 1.3 + relit * 1.2 : 0.8);
    if (l.on) { if (i < 4) litA++; else litB++; }
  });
  W.lampLights[0].intensity = litA * 1.6 * (1 + relit); W.lampLights[1].intensity = litB * 1.6 * (1 + relit);
  W.lampGlows.forEach((g, i) => { g.material.opacity = 0.75 + (rm ? 0 : sin(t * 3 + i) * 0.03); });
  const blink = rm ? 1 : 0.4 + 0.6 * (sin(t * 2.5) > 0 ? 1 : 0.15);
  W.redLights.material.color.setRGB(blink, 0.19 * blink, 0.12 * blink);
  animCrowd(t);
  const fdt = dt * (G.slow > 0 ? 0.4 : 1);
  FX.add.step(fdt); FX.norm.step(fdt);
  cameraRig(dt);
  const uk = arc.h * R3.renderer.getPixelRatio() / (2 * Math.tan(R3.camera.fov * PI / 360));
  FX.add.u.uK.value = FX.norm.u.uK.value = uk; W.trailU.uK.value = uk;
  if (!R3.lock && arc.state === 'play') {
    R3.accT += R3.realDt; R3.accN++;
    if (R3.accT > 1.3 && R3.accN >= 3) {
      const avg = R3.accT / R3.accN; R3.fps = Math.round(1 / avg);
      if (avg > 0.05 && R3.q > 0) { R3.q = Math.max(0, R3.q - 2); applyQuality(); R3.settle = 0; } // under 20 fps: two steps now, not one every 2.6 s
      else if (R3.settle > 0) R3.settle--; else if (avg > 0.03 && R3.q > 0) { R3.q--; applyQuality(); R3.settle = 1; }
      R3.accT = 0; R3.accN = 0;
    }
  }
}

/* ====================================================================== HUD */
function rr2(c, x, y, w, h, r) {
  r = min(r || 6, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function plate(c, x, y, w, h, r) {
  c.fillStyle = 'rgba(15,13,10,.72)'; rr2(c, x, y, w, h, r); c.fill();
  c.strokeStyle = 'rgba(251,245,236,.12)'; c.stroke();
}
function txt(c, s, x, y, size, col, wgt, align, font) {
  c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
  c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
}
function toScreen(x, y, z) {
  if (!R3.ok) return { x: 0, y: 0, z: 2 };
  const v = R3.proj.set(x, y, z).project(R3.camera);
  return { x: (v.x * 0.5 + 0.5) * arc.w, y: (-v.y * 0.5 + 0.5) * arc.h, z: v.z };
}

function drawHUD(c) {
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
  plate(c, pad.left, pad.top, min(150, w / 2 - 70 - pad.left - 8), 64, 12);
  txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
  txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
  plate(c, w / 2 - 70, pad.top, 140, 44, 12);
  txt(c, G.mode === 'eleven' ? ('RALLY ' + G.rally + ' / 11') : ('RALLY ' + G.rally), w / 2, pad.top + 22, 13, G.rally >= 6 ? WARM : INK, 600, 'center', F_MONO);
  const hx = w - pad.right - 18;
  for (let i = 0; i < G.maxLives; i++) {
    c.fillStyle = i < G.lives ? PRIM : 'rgba(251,245,236,.15)';
    c.beginPath(); c.arc(hx - i * 18, pad.top + 22, 6, 0, TAU); c.fill();
  }
  // lamps left, as small bulbs under the score
  for (let i = 0; i < G.lamps.length; i++) {
    c.fillStyle = G.lamps[i].on ? WARM : 'rgba(251,245,236,.15)';
    c.beginPath(); c.arc(pad.left + 10 + i * 13, pad.top + 78, 4, 0, TAU); c.fill();
  }
  if (G.phase === 'serve' && !G.attract) {
    const b = G.ball, s = toScreen(WX(b.x), 0.95, WZ(b.y));
    const y = s.z <= 1 ? s.y - 46 : arc.h * 0.5;
    const msg = arc.touchMode ? 'TAP TO SERVE' : 'CLICK OR SPACE TO SERVE';
    c.font = '600 14px ' + F_MONO; const mw = c.measureText(msg).width + 28;
    plate(c, w / 2 - mw / 2, y - 16, mw, 32, 10);
    txt(c, msg, w / 2, y, 14, GOLD, 600, 'center', F_MONO);
  }
}

function drawFloats(c) {
  G.floats.forEach((f) => {
    const s = toScreen(WX(f.x), (f.big ? 2.2 : 1.1) + f.t * 1.1, WZ(f.y));
    if (s.z > 1) return;
    const a = clamp(min(f.t / 0.1, (f.life - f.t) / 0.35), 0, 1);
    const sc = f.big && !arc.reducedMotion ? 1 + max(0, 0.3 - f.t) * 1.5 : 1;
    c.save(); c.globalAlpha = a;
    c.font = 'italic 600 ' + Math.round((f.big ? 30 : 18) * sc) + 'px ' + F_DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = 'rgba(15,13,10,.75)'; c.strokeText(f.text, s.x, s.y);
    c.fillStyle = f.col; c.fillText(f.text, s.x, s.y);
    c.restore();
  });
}

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
  c.fillStyle = 'rgba(15,13,10,.82)'; rr2(c, x, y, bw, bh, 12); c.fill();
  c.strokeStyle = 'rgba(201,169,110,.4)'; c.lineWidth = 1; rr2(c, x, y, bw, bh, 12); c.stroke();
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
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0e1020'); g.addColorStop(0.6, '#2a1a38'); g.addColorStop(1, '#1a120c');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  txt(c, '3D graphics are not available on this device', w / 2, h * 0.45, 14, INK, 600, 'center');
}

function render(c) {
  const now = performance.now();
  const dt = R3.last ? Math.min(0.05, (now - R3.last) / 1000) : 1 / 60;
  R3.realDt = R3.last ? Math.min(0.25, (now - R3.last) / 1000) : 1 / 60;
  R3.last = now;
  if (!R3.ok) drawFail(c);
  else if (!R3.lost) {
    try { frame3D(arc.state === 'pause' ? 0 : dt); if (POST) { POST.setQuality(R3.q, R3.lock); POST.render(R3.scene, R3.camera); } else R3.renderer.render(R3.scene, R3.camera); } catch (e) { R3.ok = false; try { console.warn(e); } catch (er) { /* ignore */ } }
  }
  if (G.dropT < 0.5 && !arc.reducedMotion) {
    const a = (1 - G.dropT / 0.5) * 0.45;
    const g = c.createRadialGradient(arc.w / 2, arc.h / 2, min(arc.w, arc.h) * 0.3, arc.w / 2, arc.h / 2, max(arc.w, arc.h) * 0.75);
    g.addColorStop(0, 'rgba(180,30,20,0)'); g.addColorStop(1, 'rgba(180,30,20,' + a.toFixed(3) + ')');
    c.fillStyle = g; c.fillRect(0, 0, arc.w, arc.h);
  }
  if (G.flash > 0 && !arc.reducedMotion) { c.fillStyle = 'rgba(255,183,54,' + (G.flash * 0.25) + ')'; c.fillRect(0, 0, arc.w, arc.h); }
  if (arc.state === 'play' && !G.attract) { if (R3.ok) drawFloats(c); drawHUD(c); }
  drawTouchHint(c, ['Drag anywhere, the paddle follows', 'Tap to serve after a drop'], arc.h * 0.58);
}

function dbg() {
  const b = G.ball || { x: 0, y: 0 };
  return {
    phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), lives: G.lives, rally: G.rally,
    px: +G.px.toFixed(3), bx: +b.x.toFixed(3), by: +b.y.toFixed(3), attract: !!G.attract, t: +G.t.toFixed(2),
    touchDrag: +(G.touchDrag || 0).toFixed(2), touchServes: G.touchServes || 0, touchStyle: arc.touchStyle,
    lampsOut: G.lamps.filter((l) => !l.on).length, bestRally: G.bestRally, quality: R3.q, fps: R3.fps || null, webgl: R3.ok,
  };
}

function boot() {
  A.create({
    slug: 'rally-cage', title: 'Rally Cage', genre: 'Rooftop squash', three: true,
    hint: 'Mouse or arrows move the paddle   click or Space to serve',
    touchHint: 'Stick slides the paddle, tap Serve to start the rally',
    keys: [
      ['Left / Right / A D', 'Slide the paddle'],
      ['Space / click', 'Serve'],
    ],
    mouse: { cursor: 'none', keys: [['Move mouse', 'The paddle follows'], ['Click', 'Serve']] },
    touch: { stick: true, pads: [{ label: 'Serve', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Slide the paddle'], ['Serve', 'Start the rally']],
    gamepad: { buttons: ['Space'], rt: 'Space' },
    gestures: {
      drag: false,
      hint: 'Drag anywhere, the paddle follows, tap to serve',
      keys: [['Drag anywhere', 'The paddle follows your finger'], ['Tap / swipe up', 'Serve after a drop']],
    },
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Rooftop squash',
      title: 'Rally <em>Cage</em>',
      html: '<p>A floodlit cage on the terrace. Keep the ball off the floor, grow the rally, and clip the hanging lamps for extra points.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'lives', choices: [{ v: 'lives', label: 'Three lives' }, { v: 'eleven', label: 'Rally of 11' }, { v: 'survival', label: 'One life' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    graphics(level) { if (level === 'auto') { R3.lock = false; return; } R3.lock = true; R3.q = level === 'sharp' ? 3 : 1; applyQuality(); },
    resize(a) { arc = a; if (!R3.renderer) return; applyQuality(); R3.camera.aspect = a.w / a.h; R3.camera.updateProjectionMatrix(); },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Rally<b>' + G.rally + '</b></div></div>'; },
    onMenu(a) { arc = a; reset(true); },
    init(a) { arc = a; a.debug = dbg; G.D = DIFF.normal; initRenderer(); reset(true); a.menu(); },
    start(a, ch) {
      arc = a; reset(false, ch);
      R3.accT = 0; R3.accN = 0; R3.settle = 1; R3.snap = true;
      const label = G.mode === 'eleven' ? 'Hold a rally of 11' : G.mode === 'survival' ? 'One life' : 'Three lives';
      arc.toast(label, 'Rally Cage', 1400);
    },
    update: (dt) => update(dt), idle: (dt) => idle(dt), render: (c) => render(c),
  });
  window.__rallycage = { G, R3, W, BH };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
