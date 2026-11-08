import * as THREE from '/games/vendor/three/three.module.min.js';
/*
 * Court Lights, in real 3D: rooftop street basketball after dark.
 * An original game. No licensed names; every model and texture is made in code.
 *
 * The rules are the flat version's: hold to charge, release in the gold band,
 * three points a make plus the streak, three modes. The make window is the
 * whole gold band now (the flat version only scored from its middle): a
 * release anywhere in the band, aimed at the rim, goes down. Early drops short,
 * late flies long off the glass, off line rims out. The camera sits behind the
 * shooter on a lit rooftop cage with the city at dusk behind the hoop.
 *
 * Coordinates: game numbers are the flat game's (x across, + = screen right,
 * y up, z toward the hoop). World (three) is X = -x, Y = y, Z = z, so a camera
 * looking down +Z keeps + x on the right of the screen.
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

const RIM = { x: 0, y: 3.05, z: 6.95, r: 0.23 };
const BR = 0.12;            // ball radius
const GRAV = 14;
const SWEET = [0.58, 0.78]; // the gold band, as on the HUD
const SWEET_MID = 0.68;
const BOARD_Z = 7.2, BOARD_Y0 = 2.72, BOARD_Y1 = 4.05, BOARD_HW = 0.9;
const MAKE_R = 0.4;         // in the band, a ball crossing the rim this close goes down
const RIM_HIT = 0.37;       // outside the band, this close the rim rejects it
const HAND0 = { x: 0.02, y: 1.62, z: 0.55 };

let arc = null;
const G = {
  mode: 'sixty', phase: 'aim', time: 60, score: 0, combo: 0, makes: 0, attempts: 0, streak: 0,
  aimX: 0, charge: 0, holding: false, go: 0, t: 0, hintT: 0, tAim: null,
  ball: null, attract: true, pops: [], shotT: 9, slow: 0, flare: 0, swishT: 9, ballIn: 1, lastMiss: '',
  release: { x: HAND0.x, y: HAND0.y + 0.6, z: HAND0.z },
};
const R3 = { ok: false, lost: false, q: 2, lock: false, soft: false, fps: null, accT: 0, accN: 0, settle: 1, time: 0, last: 0, realDt: 1 / 60 };

/* ====================================================================== rules */
function resetBall() {
  G.ball = { x: HAND0.x, y: HAND0.y, z: HAND0.z, vx: 0, vy: 0, vz: 0, air: false, scored: false, resolved: false, guide: false, dead: 0, flightT: 0, shotCharge: null, bounces: 0, spin: 0 };
  G.phase = 'aim'; G.charge = 0; G.holding = false; G.ballIn = 0;
}

function shoot() {
  if (G.go > 0 && !G.attract) return;
  const c = clamp(G.charge, 0.12, 1);
  const b = G.ball;
  const rel = G.release;
  b.x = rel.x; b.y = rel.y; b.z = rel.z;
  b.air = true; b.scored = false; b.resolved = false; b.guide = false; b.flightT = 0; b.dead = 0; b.bounces = 0;
  b.shotCharge = c;
  // Early releases land short of the rim, late ones fly long; the gold band lands on it.
  const zErr = (c - SWEET_MID) * 2.3;
  const xT = G.aimX * 1.5;
  const H = 4.62 + (c - SWEET_MID) * 0.9;
  const vy = Math.sqrt(2 * GRAV * Math.max(0.3, H - b.y));
  const T = vy / GRAV + Math.sqrt(2 * Math.max(0.05, H - RIM.y) / GRAV);
  b.vx = (xT - b.x) / T; b.vz = (RIM.z + zErr - b.z) / T; b.vy = vy;
  b.spin = 7 + c * 6;
  G.phase = 'flight'; G.attempts++; G.holding = false; G.charge = 0; G.shotT = 0; G.lastMiss = '';
  if (!G.attract) {
    arc.sfx.tone(220 + c * 80, 0.09, { type: 'triangle', vol: 0.12 });
    arc.sfx.noise(0.05, { freq: 900, vol: 0.06 });
  }
}

function playing() { return !G.attract && arc && arc.state === 'play'; }

function scoreShot(kind) {
  const b = G.ball;
  b.scored = true; G.phase = 'net'; G.swishT = 0;
  FXK.make(kind);
  if (!playing()) return;
  const pts = 3 + G.combo;
  G.score += pts; G.makes++; G.combo++; G.streak = max(G.streak, G.combo);
  const label = G.combo >= 3 ? 'On fire x' + G.combo : (kind === 'swish' ? 'Swish' : 'Bucket');
  arc.toast(label, '+' + pts, 1100);
  pop(RIM.x, RIM.y + 0.5, RIM.z, '+' + pts, kind === 'swish' ? WARM : INK, true);
  arc.sfx.tone(kind === 'swish' ? 880 : 520, 0.16, { type: 'sine', vol: 0.16 });
  if (kind === 'swish') arc.sfx.tone(1320, 0.22, { type: 'sine', vol: 0.1, delay: 0.05 });
  arc.sfx.noise(0.18, { freq: 3200, filter: 'highpass', vol: 0.05 });
  arc.buzz(14);
  if (G.combo >= 3 && !arc.reducedMotion) G.slow = 0.7;
  if (G.mode === 'twentyone' && G.score >= 21) { if (!arc.reducedMotion) G.slow = 0.9; G.endIn = 1.1; }
}

function miss() {
  G.combo = 0; G.phase = 'miss';
  if (playing()) {
    arc.sfx.tone(140, 0.18, { type: 'sawtooth', slide: 70, vol: 0.1 });
    if (G.mode === 'sudden' && G.makes > 0) finish('Missed');
  }
}

function finish(why) {
  if (G.phase === 'over' || !playing()) return;
  G.phase = 'over';
  arc.over({
    eyebrow: why || 'Buzzer', title: G.score >= 21 ? 'Lights <em>out</em>' : 'Buzzer',
    score: G.score, scoreLabel: 'Points',
    html: '<p>' + G.makes + ' makes from ' + G.attempts + ' shots. Best streak ' + G.streak + '.</p>',
    again: 'Shoot again',
  });
}

function pop(x, y, z, text, col, big) { G.pops.push({ x, y, z, text, col, big: !!big, life: 1.2, t: 0 }); }

// The ball reaches rim height on the way down: in, rattled in, rimmed out or wide.
function resolveRim() {
  const b = G.ball;
  const dx = b.x - RIM.x, dz = b.z - RIM.z, d = hypot(dx, dz);
  const c = b.shotCharge == null ? SWEET_MID : b.shotCharge;
  const inBand = c >= SWEET[0] && c <= SWEET[1];
  b.resolved = true;
  if (inBand && d < MAKE_R) {
    const swish = d < 0.13;
    if (!swish) { FXK.rim(b.x, b.z, 0.5); if (!G.attract) arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.05 }); }
    b.guide = true; b.vx *= 0.15; b.vz *= 0.15; b.vy = min(b.vy, -1.4);
    scoreShot(swish ? 'swish' : 'bank');
    return;
  }
  const why = !inBand ? (c < SWEET[0] ? 'Early' : 'Late') : 'Wide';
  if (d < RIM_HIT) {
    let nx = dx / (d || 1), nz = dz / (d || 1);
    if (d < 0.02) { nx = 0; nz = -1; }
    b.x = RIM.x + nx * (RIM_HIT + 0.01); b.z = RIM.z + nz * (RIM_HIT + 0.01);
    b.vx = nx * 2.1 + b.vx * 0.2; b.vz = nz * 2.1 + b.vz * 0.2; b.vy = abs(b.vy) * 0.42 + 1.3;
    FXK.rim(b.x, b.z, 1);
    if (!G.attract) {
      arc.sfx.tone(360, 0.06, { type: 'square', vol: 0.08 }); arc.sfx.tone(190, 0.12, { type: 'triangle', vol: 0.06, delay: 0.02 });
      arc.shake = Math.max(arc.shake, 5); arc.buzz(20);
    }
    G.lastMiss = why === 'Early' ? 'Early, rimmed out' : why === 'Late' ? 'Late, rimmed out' : 'Rimmed out';
  } else {
    G.lastMiss = why === 'Early' ? 'Early, short' : why === 'Late' ? 'Late, long' : (b.x > 0 ? 'Wide right' : 'Wide left');
  }
  if (playing()) pop(RIM.x, RIM.y + 0.35, RIM.z, G.lastMiss, PRIM, false);
}

function stepBall(dtIn) {
  const b = G.ball; if (!b) return;
  if (!b.air) {
    if (G.phase === 'net' || G.phase === 'miss') { b.dead += dtIn; if (b.dead > 0.55) resetBall(); }
    return;
  }
  const dt = dtIn * (G.slow > 0 ? 0.35 : 1);
  b.flightT += dt;
  const N = 4, h = dt / N;
  for (let s = 0; s < N && b.air; s++) {
    const py = b.y;
    b.vy -= GRAV * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    if (b.guide) {
      // A make: the net takes it, the ball drops straight through the rim.
      const k = 1 - Math.exp(-h * 16);
      b.x = lerp(b.x, RIM.x, k); b.z = lerp(b.z, RIM.z, k); b.vx *= 0.9; b.vz *= 0.9;
      if (b.y < RIM.y - 0.5 && b.vy < -3.2) b.vy = -3.2;
      if (b.y < RIM.y - 0.55) { b.guide = false; b.vx = rr(-0.4, 0.4); b.vz = -rr(0.6, 1.4); }
    }
    // backboard
    if (b.vz > 0 && b.z > BOARD_Z - BR && b.z < BOARD_Z + 0.15 && b.y > BOARD_Y0 - 0.08 && b.y < BOARD_Y1 + 0.08 && abs(b.x) < BOARD_HW + 0.05) {
      b.z = BOARD_Z - BR; b.vz *= -0.42; b.vx *= 0.85;
      if (!G.attract) arc.sfx.tone(310, 0.05, { type: 'square', vol: 0.06 });
      FXK.board(b.x, b.y);
    }
    if (!b.resolved && py > RIM.y && b.y <= RIM.y && b.vy < 0) resolveRim();
    // the cage keeps the ball on the roof
    if (b.z > 8.75 - BR && b.vz > 0) { b.z = 8.75 - BR; b.vz *= -0.4; }
    if (abs(b.x) > 4.7 - BR) { b.x = Math.sign(b.x) * (4.7 - BR); b.vx *= -0.4; }
    if (b.z < -2.6) { b.z = -2.6; b.vz *= -0.4; }
    if (b.y < BR) {
      b.y = BR;
      if (abs(b.vy) > 1.4) FXK.dust(b.x, b.z, clamp(abs(b.vy) / 6, 0.2, 1));
      if (abs(b.vy) > 1 && !G.attract) arc.sfx.noise(0.06, { freq: 260, vol: clamp(abs(b.vy) / 30, 0.02, 0.12) });
      b.vy *= -0.62; b.vx *= 0.78; b.vz *= 0.78; b.bounces++;
      if (!b.scored && G.phase === 'flight') { if (!b.resolved) { b.resolved = true; G.lastMiss = 'Air ball'; if (playing()) pop(b.x, 1.2, b.z, 'Air ball', PRIM, false); } miss(); }
      if (abs(b.vy) < 1.1) { b.air = false; b.vy = 0; }
    }
  }
  if (G.phase === 'flight' && b.flightT > 4.2) { miss(); resetBall(); return; }
  if ((G.phase === 'net' || G.phase === 'miss') && b.flightT > (b.scored ? 1.7 : 2.4)) resetBall();
}

function gestTouch() {
  const p = arc.input.pointer;
  return !!arc.touchMode && arc.touchStyle === 'gesture' && !!p && p.type !== 'mouse';
}

// Same feel as the flat game: touch and hold to charge, slide to aim
// (relative, so the shot never jumps under the thumb), lift in the gold band.
function readAim(dt) {
  const inp = arc.input, ax = inp.axis(), p = inp.pointer, gz = inp.gesture;
  const gt = gestTouch();
  if (abs(ax.x) > 0.08) {
    G.aimX = clamp(G.aimX + ax.x * dt * 1.7, -0.72, 0.72);
  } else if (gt) {
    if (gz.active && gz.type !== 'mouse') {
      if (!G.tAim) G.tAim = { x: gz.x, aim: G.aimX };
      G.aimX = clamp(G.tAim.aim + ((gz.x - G.tAim.x) / max(160, arc.w * 0.45)) * 0.72, -0.72, 0.72);
    } else {
      G.tAim = null;
      G.aimX *= Math.exp(-dt * 1.4);
    }
  } else if (p && p.seen) {
    G.aimX = lerp(G.aimX, (p.nx - 0.5) * 1.44, 1 - Math.exp(-dt * 10));
  } else if (abs(ax.x) < 0.08) {
    G.aimX *= Math.exp(-dt * 1.4);
  }
  const down = inp.action();
  if (G.phase === 'aim' && G.ballIn > 0.6) {
    if (down) {
      G.holding = true; G.charge = min(1, G.charge + dt * 0.95);
      if (G.charge >= 1) shoot();
    } else if (G.holding) {
      if (gt && G.charge < 0.1) { G.holding = false; G.charge = 0; } else shoot();
    }
  }
}

function newMatch(ch) {
  G.mode = (ch && ch.mode) || 'sixty';
  G.score = 0; G.combo = 0; G.makes = 0; G.attempts = 0; G.streak = 0; G.aimX = 0; G.t = 0; G.go = 0.8;
  G.hintT = 0; G.tAim = null; G.pops.length = 0; G.slow = 0; G.flare = 0; G.endIn = 0; G.shotT = 9;
  G.time = G.mode === 'sixty' ? 60 : G.mode === 'sudden' ? 90 : 99;
  G.attract = false;
  FXK.clear();
  resetBall(); G.ballIn = 1;
  R3.accT = 0; R3.accN = 0; R3.settle = 1;
  arc.toast(G.mode === 'twentyone' ? 'First to 21' : G.mode === 'sudden' ? 'Make or miss' : 'Sixty seconds', 'Court Lights', 1400);
}

function tickCommon(dt) {
  G.ballIn = min(1, G.ballIn + dt * 3.2);
  G.shotT += dt; G.swishT += dt;
  G.slow = max(0, G.slow - dt); G.flare = max(0, G.flare - dt * 1.6);
  for (let i = G.pops.length - 1; i >= 0; i--) { const p = G.pops[i]; p.t += dt; if (p.t >= p.life) G.pops.splice(i, 1); }
}

function update(dt) {
  G.t += dt; G.go = max(0, G.go - dt); G.hintT += dt;
  tickCommon(dt);
  if (G.phase === 'over') return;
  if (G.endIn > 0) { G.endIn -= dt; if (G.endIn <= 0) { finish('Twenty one'); return; } }
  if (G.mode === 'sixty' || G.mode === 'sudden') {
    G.time -= dt;
    if (G.time <= 0 && G.phase !== 'flight') { G.time = 0; finish('Buzzer'); return; }
  }
  readAim(dt);
  stepBall(dt);
}

function attractReset() {
  G.attract = true; G.score = 0; G.combo = 0; G.makes = 0; G.attempts = 0; G.streak = 0;
  G.aimX = 0; G.charge = 0; G.holding = false; G.go = 0; G.phase = 'aim'; G.pops.length = 0; G.endIn = 0;
  resetBall(); G.ballIn = 1;
}

function idle(dt) {
  G.t += dt; G.attract = true;
  tickCommon(dt);
  if (!G.ball || G.phase === 'over') attractReset();
  if (G.phase === 'aim') {
    G.aimX = sin(G.t * 0.7) * 0.06;
    G.holding = true;
    G.charge = min(0.66 + 0.06 * sin(G.t * 1.3), G.charge + dt * 0.95);
    if ((G.t % 2.9) > 2.6 && G.ballIn >= 1) shoot();
  }
  stepBall(dt);
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

// Court bounds in world: X -4.6..4.6, Z -3..8.9. Canvas top = near (shooter) end.
const CX0 = -4.6, CX1 = 4.6, CZ0 = -3, CZ1 = 8.9;
function courtTex() {
  const W = 1024, H = 1324;
  return canvasTex(W, H, (g) => {
    const px = (wx) => (wx - CX0) / (CX1 - CX0) * W;
    const pz = (wz) => (wz - CZ0) / (CZ1 - CZ0) * H;
    const s = W / (CX1 - CX0);
    g.fillStyle = '#4a2a22'; g.fillRect(0, 0, W, H);
    // rubber tiles, worn
    for (let y = 0; y < H; y += 64) for (let x = 0; x < W; x += 64) {
      g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,180,140,' : '0,0,0,') + (rnd() * 0.05).toFixed(3) + ')';
      g.fillRect(x, y, 64, 64);
    }
    grain(g, W, H, 26000, 0.08, 'rgba(255,210,170,');
    const wear = g.createRadialGradient(px(0), pz(0.3), 10, px(0), pz(0.3), 240);
    wear.addColorStop(0, 'rgba(255,190,150,.12)'); wear.addColorStop(1, 'rgba(255,190,150,0)');
    g.fillStyle = wear; g.fillRect(0, 0, W, H);
    // the key
    g.fillStyle = 'rgba(168,58,32,.85)';
    g.fillRect(px(-1.1), pz(4.4), px(1.1) - px(-1.1), pz(8.2) - pz(4.4));
    g.strokeStyle = 'rgba(251,240,226,.88)'; g.lineWidth = 0.06 * s;
    g.strokeRect(px(-1.1), pz(4.4), px(1.1) - px(-1.1), pz(8.2) - pz(4.4));
    g.beginPath(); g.arc(px(0), pz(4.4), 1.1 * s, PI, TAU); g.stroke();
    g.setLineDash([0.3 * s, 0.25 * s]); g.beginPath(); g.arc(px(0), pz(4.4), 1.1 * s, 0, PI); g.stroke(); g.setLineDash([]);
    // three point arc around the hoop
    g.strokeStyle = 'rgba(255,105,64,.95)'; g.lineWidth = 0.07 * s;
    g.beginPath(); g.arc(px(0), pz(RIM.z), 6.0 * s, PI * 1.05, PI * 1.95); g.stroke();
    // baseline and sidelines
    g.strokeStyle = 'rgba(251,240,226,.85)'; g.lineWidth = 0.07 * s;
    g.beginPath(); g.moveTo(px(-4.3), pz(8.2)); g.lineTo(px(4.3), pz(8.2)); g.stroke();
    g.beginPath(); g.moveTo(px(-4.3), pz(-2.7)); g.lineTo(px(-4.3), pz(8.2)); g.moveTo(px(4.3), pz(-2.7)); g.lineTo(px(4.3), pz(8.2)); g.stroke();
    // shooter's spot
    g.fillStyle = 'rgba(255,183,54,.85)';
    g.beginPath(); g.arc(px(0), pz(0.2), 0.32 * s, 0, TAU); g.fill();
    g.fillStyle = '#4a2a22'; g.beginPath(); g.arc(px(0), pz(0.2), 0.24 * s, 0, TAU); g.fill();
    // name painted on the apron, upside down in the canvas so it reads from the shooter's side
    g.save(); g.translate(px(0), pz(-1.5)); g.rotate(PI);
    g.font = 'italic 600 ' + (0.42 * s) + 'px ' + F_DISP; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(201,169,110,.55)'; g.fillText('Court Lights', 0, 0);
    g.restore();
    grain(g, W, H, 9000, 0.06);
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

function plasterTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b07a5a'; g.fillRect(0, 0, w, h);
    grain(g, w, h, 9000, 0.12);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(40,24,18,' + (rnd() * 0.15).toFixed(2) + ')';
      g.fillRect(rnd() * w, rnd() * h * 0.3 + h * 0.6, 10 + rnd() * 40, 40 + rnd() * 80);
    }
    g.fillStyle = 'rgba(255,240,220,.18)'; g.fillRect(0, 0, w, 18);
  }, { repeat: [8, 1] });
}

function fenceTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(205,210,215,1)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke();
  });
}

function windowsTex() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cols = 8, rows = 22, cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const on = rnd();
      if (on < 0.42) continue;
      const warm = rnd() < 0.78;
      const a = 0.35 + rnd() * 0.65;
      g.fillStyle = warm ? 'rgba(255,' + (170 + (rnd() * 50 | 0)) + ',' + (90 + (rnd() * 50 | 0)) + ',' + a.toFixed(2) + ')' : 'rgba(170,200,255,' + (a * 0.7).toFixed(2) + ')';
      g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.5);
    }
  });
}

function ballTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#d4602a'; g.fillRect(0, 0, w, h);
    // pebbled leather
    for (let i = 0; i < 16000; i++) {
      g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,200,150,' : '70,20,0,') + (rnd() * 0.18).toFixed(2) + ')';
      g.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
    }
    const sh = g.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(0,0,0,.18)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = sh; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1c0e08'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    [0.25, 0.75].forEach((u) => { g.beginPath(); g.moveTo(u * w, 0); g.lineTo(u * w, h); g.stroke(); });
    [0, 0.5].forEach((u) => {
      g.beginPath();
      for (let i = 0; i <= 64; i++) { const v = i / 64; const x = (u + 0.25 + sin(v * PI) * 0.16) * w; i ? g.lineTo(x, v * h) : g.moveTo(x, v * h); }
      g.stroke();
      g.beginPath();
      for (let i = 0; i <= 64; i++) { const v = i / 64; const x = (u + 0.25 - sin(v * PI) * 0.16) * w; i ? g.lineTo(x, v * h) : g.moveTo(x, v * h); }
      g.stroke();
    });
  }, { clamp: false });
}

function boardTex() {
  return canvasTex(512, 380, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(220,235,245,.16)'; g.fillRect(0, 0, w, h);
    const sx = w / 1.8, sy = h / 1.33;
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 0.05 * sx;
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    g.strokeStyle = 'rgba(240,72,48,.95)'; g.lineWidth = 0.045 * sx;
    const bx = w / 2 - 0.29 * sx, by = h - (3.45 - BOARD_Y0) * sy, bw = 0.58 * sx, bh = 0.42 * sy;
    g.strokeRect(bx, by, bw, bh);
    g.font = '600 ' + (0.08 * sx) + 'px ' + F_MONO; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillText('ROOFTOP 07', w / 2, 0.16 * sy);
  }, { clamp: true });
}

function numberTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = '700 150px ' + F_UI; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = '#2a1408'; g.strokeText('11', w / 2, h * 0.6);
    g.fillStyle = '#FBF5EC'; g.fillText('11', w / 2, h * 0.6);
    g.font = '700 38px ' + F_UI; g.fillStyle = '#FBF5EC'; g.fillText('VEER', w / 2, h * 0.17);
  }, { clamp: true });
}

function glowTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,240,210,.7)'); gr.addColorStop(0.5, 'rgba(255,190,110,.18)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
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
  COL.prim = new THREE.Color('#FF6940'); COL.dust = new THREE.Color('#9c6a52'); COL.fire = new THREE.Color('#ff7a2a');
  COL.spark = new THREE.Color('#ffe0a0'); COL.conf = ['#FFB736', '#FF6940', '#FBF5EC', '#c9a96e', '#7fd1ff', '#ff7ab6'].map((c) => new THREE.Color(c));
}
// Effects take game coordinates and convert here.
const FXK = {
  make(kind) {
    if (!FX.add) return;
    G.flare = 1;
    const rm = arc && arc.reducedMotion;
    const n = rm ? 16 : kind === 'swish' ? 60 : 36;
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = rr(0.8, 3.2);
      FX.norm.add(-RIM.x + cos(a) * 0.2, RIM.y - 0.2, RIM.z + sin(a) * 0.2, cos(a) * sp, rr(1.5, 4.5), sin(a) * sp - 0.6, rr(0.9, 1.6), rr(0.03, 0.05), COL.conf[(rnd() * COL.conf.length) | 0], 1, 5.5, 0.97);
    }
    const m = rm ? 10 : 34;
    for (let i = 0; i < m; i++) {
      const a = rnd() * TAU, sp = rr(1, 3.4);
      FX.add.add(-RIM.x + cos(a) * RIM.r, RIM.y, RIM.z + sin(a) * RIM.r, cos(a) * sp, rr(-0.5, 2.5), sin(a) * sp, rr(0.35, 0.7), rr(0.05, 0.09), kind === 'swish' ? COL.gold : COL.white, 1, 4, 0.95);
    }
  },
  rim(x, z, s) {
    if (!FX.add) return;
    const n = (arc && arc.reducedMotion ? 6 : 18) * s;
    for (let i = 0; i < n; i++) FX.add.add(-x, RIM.y, z, rr(-2.5, 2.5), rr(0.5, 3.2), rr(-2.5, 1.5), rr(0.2, 0.45), rr(0.03, 0.06), COL.spark, 1, 8, 0.96);
    G.rimHit = 1;
  },
  board(x, y) {
    if (!FX.add) return;
    for (let i = 0; i < 8; i++) FX.add.add(-x, y, BOARD_Z - 0.03, rr(-1, 1), rr(-1, 1), rr(-0.6, -0.1), rr(0.15, 0.3), rr(0.04, 0.07), COL.white, 0.7, 0, 0.9);
    G.boardHit = 1;
  },
  dust(x, z, s) {
    if (!FX.norm) return;
    const n = 6 + (10 * s | 0);
    for (let i = 0; i < n; i++) { const a = rnd() * TAU; FX.norm.add(-x, 0.05, z, cos(a) * rr(0.3, 1.1) * s, rr(0.2, 0.8) * s, sin(a) * rr(0.3, 1.1) * s, rr(0.4, 0.8), rr(0.06, 0.12), COL.dust, 0.35, 0.6, 0.94); }
  },
  clear() { if (FX.add) { FX.add.clear(); FX.norm.clear(); } },
};

/* ====================================================================== 3D: world */
const W = {};
function std(o) { return new THREE.MeshStandardMaterial(o); }

function buildSky() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(-0.42, 0.22, 0.88).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }',
    fragmentShader: [
      'uniform vec3 uSun; varying vec3 vD;',
      'void main(){',
      ' float h=vD.y;',
      ' vec3 zen=vec3(0.035,0.03,0.09); vec3 mid=vec3(0.16,0.07,0.22); vec3 hor=vec3(0.78,0.32,0.15); vec3 low=vec3(0.07,0.04,0.035);',
      ' vec3 c=mix(hor,mid,smoothstep(0.0,0.22,h)); c=mix(c,zen,smoothstep(0.2,0.75,h)); c=mix(c,low,smoothstep(0.0,-0.12,h));',
      ' float s=max(dot(vD,uSun),0.0);',
      ' c+=vec3(1.0,0.6,0.25)*pow(s,10.0)*0.35 + vec3(1.0,0.75,0.4)*pow(s,400.0)*1.8;',
      ' c+=vec3(1.0,0.55,0.25)*0.18*exp(-abs(h)*14.0);',
      ' gl_FragColor=vec4(c,1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(geo, mat); sky.renderOrder = -10; sky.frustumCulled = false;
  R3.scene.add(sky);
  // stars
  const n = 260, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, e = 0.25 + rnd() * 1.2;
    pos[i * 3] = cos(a) * cos(e) * 380; pos[i * 3 + 1] = sin(e) * 380; pos[i * 3 + 2] = sin(a) * cos(e) * 380;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff1d8, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false, depthWrite: false }));
  stars.renderOrder = -9; R3.scene.add(stars);
}

// Windows are drawn by the shader from world position, so every tower gets
// floor-sized windows whatever its size, some lit warm, some cool, many dark.
function cityMaterial() {
  const mat = std({ color: 0x17121c, roughness: 0.85, metalness: 0.15 });
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
        '  float lit = step(0.56, h21(bid)); float tone = h21(bid + 7.7); float lv = 0.45 + 0.75 * h21(bid + 3.1);',
        '  vec3 wc = mix(vec3(1.0, 0.68, 0.36), vec3(0.62, 0.74, 1.0), step(0.8, tone));',
        '  float base = smoothstep(-6.0, 6.0, vWP.y);',
        '  totalEmissiveRadiance += wc * win * lit * lv * side * 1.25 * base;',
        '  diffuseColor.rgb += vec3(0.03, 0.025, 0.05) * win * (1.0 - lit) * side; }',
      ].join('\n'));
  };
  return mat;
}

function buildCity() {
  const mat = cityMaterial();
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const rng = A.rng(42);
  const list = [];
  for (let i = 0; i < 120; i++) {
    const side = i % 4;
    let x, z;
    if (side < 2) { x = (rng() - 0.5) * 220; z = 30 + rng() * 150; }
    else if (side === 2) { x = 22 + rng() * 70; z = -25 + rng() * 110; }
    else { x = -22 - rng() * 70; z = -25 + rng() * 110; }
    if (abs(x) < 16 && z < 26) continue;
    const w = 7 + rng() * 14, d = 7 + rng() * 14;
    // a gap behind the hoop so the dusk sky shows through
    const gap = abs(x) < 28 && z < 90 ? 0.35 : 1;
    const h = (6 + rng() * rng() * 60) * gap + 4;
    list.push([x, -30, z, w, h + 30 - 6, d]);
  }
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((b, i) => { p.set(b[0], b[1], b[2]); s.set(b[3], b[4], b[5]); q.setFromAxisAngle(up, (rng() - 0.5) * 0.3); m.compose(p, q, s); im.setMatrixAt(i, m); });
  R3.scene.add(im);
  // red aviation lights on the tallest tops
  const lg = new THREE.SphereGeometry(0.35, 8, 6);
  const tall = list.filter((b) => b[4] > 48).slice(0, 14);
  const lm = new THREE.MeshBasicMaterial({ color: 0xff3020, fog: false });
  W.redLights = new THREE.InstancedMesh(lg, lm, Math.max(1, tall.length));
  tall.forEach((b, i) => { p.set(b[0], b[1] + b[4] + 0.6, b[2]); s.set(1, 1, 1); q.identity(); m.compose(p, q, s); W.redLights.setMatrixAt(i, m); });
  W.redLights.count = tall.length;
  R3.scene.add(W.redLights);
  // a few neighbouring roofs with water tanks just past the parapet
  const tankM = std({ color: 0x1c1c1f, roughness: 0.55, metalness: 0.15 });
  const tankG = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 20);
  const tanks = [[-10.5, 0.75, 10], [-12, 0.75, 7.6], [11.5, 0.75, 13]];
  const tm = new THREE.InstancedMesh(tankG, tankM, tanks.length);
  tanks.forEach((t, i) => { p.set(t[0], t[1], t[2]); s.set(1, 1, 1); q.identity(); m.compose(p, q, s); tm.setMatrixAt(i, m); });
  tm.castShadow = true; R3.scene.add(tm);
}

function buildRoof() {
  const ct = courtTex();
  const court = new THREE.Mesh(new THREE.PlaneGeometry(CX1 - CX0, CZ1 - CZ0), std({ map: ct, roughness: 0.82, metalness: 0.0 }));
  court.rotation.x = -PI / 2; court.position.set(0, 0, (CZ0 + CZ1) / 2);
  court.receiveShadow = true; R3.scene.add(court);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(26, 30), std({ map: concreteTex(), color: 0x8a8078, roughness: 0.95 }));
  roof.rotation.x = -PI / 2; roof.position.set(0, -0.01, 4); roof.receiveShadow = true; R3.scene.add(roof);
  // parapet walls
  const pm = std({ map: plasterTex(), roughness: 0.92 });
  const walls = [[0, 19, 26, 0.3], [-13, 4, 0.3, 30], [13, 4, 0.3, 30]];
  walls.forEach((wl) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wl[2], 1.0, wl[3]), pm);
    m.position.set(wl[0], 0.5, wl[1]); m.receiveShadow = true; m.castShadow = false; R3.scene.add(m);
  });
}

function buildCage() {
  const ft = fenceTex();
  const fx = 4.8, fz = 9.0, fh = 4.2;
  const mk = (len, rep) => { const t = ft.clone(); t.needsUpdate = true; t.repeat.set(rep, fh / 0.16); return std({ map: t, alphaTest: 0.45, transparent: false, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.7, color: 0xb8bcc2 }); };
  const left = new THREE.Mesh(new THREE.PlaneGeometry(12, fh), mk(12, 12 / 0.16)); left.rotation.y = PI / 2; left.position.set(-fx, fh / 2, 3); R3.scene.add(left);
  const right = left.clone(); right.position.x = fx; R3.scene.add(right);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(fx * 2, fh), mk(fx * 2, fx * 2 / 0.16)); back.position.set(0, fh / 2, fz); R3.scene.add(back);
  // posts and rails
  const postG = new THREE.CylinderGeometry(0.045, 0.045, fh + 0.2, 8);
  const posts = [];
  for (let z = -3; z <= 9.01; z += 2) { posts.push([-fx, z]); posts.push([fx, z]); }
  for (let x = -fx + 2.4; x < fx - 0.5; x += 2.4) posts.push([x, fz]);
  const pmat = std({ color: 0x2b2a2c, roughness: 0.5, metalness: 0.7 });
  const pim = new THREE.InstancedMesh(postG, pmat, posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => { m.makeTranslation(p[0], (fh + 0.2) / 2, p[1]); pim.setMatrixAt(i, m); });
  pim.castShadow = true; R3.scene.add(pim);
  W.cageH = fh; W.cageX = fx; W.cageZ = fz;
}

// Festoon bulbs strung along the cage, a rooftop party touch.
function buildStrings() {
  const pts = [];
  const span = (x0, z0, x1, z1, y, sag, n) => {
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([lerp(x0, x1, u), y - sin(u * PI) * sag, lerp(z0, z1, u)]); }
  };
  for (let z = -3; z < 9; z += 2) { span(-4.75, z, -4.75, z + 2, 4.05, 0.35, 7); span(4.75, z, 4.75, z + 2, 4.05, 0.35, 7); }
  for (let x = -4.6; x < 4.6; x += 2.3) span(x, 8.95, x + 2.3, 8.95, 4.05, 0.3, 8);
  const g = new THREE.SphereGeometry(0.045, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd08a });
  const im = new THREE.InstancedMesh(g, mat, pts.length);
  const m = new THREE.Matrix4();
  pts.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, m); });
  R3.scene.add(im);
  // soft halos
  const pos = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  W.halo = new THREE.Points(hg, new THREE.PointsMaterial({ map: R3.glow, color: 0xffb46a, size: 0.55, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  R3.scene.add(W.halo);
  // the wire itself
  const lp = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (hypot(a[0] - b[0], a[2] - b[2]) > 0.6) continue;
    lp.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  R3.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.8 })));
}

function buildFloodlights() {
  const poleG = new THREE.CylinderGeometry(0.07, 0.1, 7, 10);
  const headG = new THREE.BoxGeometry(0.9, 0.5, 0.25);
  const pm = std({ color: 0x24221f, roughness: 0.5, metalness: 0.75 });
  const hm = std({ color: 0x1a1816, roughness: 0.4, metalness: 0.6, emissive: 0xfff2d8, emissiveIntensity: 0 });
  const spots = [[-5.6, -2.6], [5.6, -2.6], [-5.6, 9.6], [5.6, 9.6]];
  const lampFaceM = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
  const faceG = new THREE.PlaneGeometry(0.78, 0.38);
  W.lampGlows = [];
  spots.forEach((s) => {
    const pole = new THREE.Mesh(poleG, pm); pole.position.set(s[0], 3.5, s[1]); pole.castShadow = true; R3.scene.add(pole);
    const head = new THREE.Group(); head.position.set(s[0] * 0.93, 7.1, s[1] + (s[1] < 0 ? 0.3 : -0.3));
    head.lookAt(0, 0, 3.5);
    const box = new THREE.Mesh(headG, hm); head.add(box);
    const face = new THREE.Mesh(faceG, lampFaceM); face.position.z = 0.13; head.add(face);
    R3.scene.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: R3.glow, color: 0xffe8c0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(3.4, 3.4, 1); glow.position.copy(head.position); R3.scene.add(glow); W.lampGlows.push(glow);
  });
  // light shafts from the two lamps behind the hoop, seen against the dusk
  const coneG = new THREE.ConeGeometry(2.6, 8, 24, 1, true); coneG.translate(0, -4, 0);
  const coneM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0.07 } },
    vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY=position.y; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uA; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f=smoothstep(-8.0,0.0,vY); float e=pow(abs(dot(vN,vV)),1.5); gl_FragColor=vec4(vec3(1.0,0.86,0.62)*uA*f*e,1.0); }',
  });
  W.coneMat = coneM;
  [[-5.2, 9.3], [5.2, 9.3]].forEach((s) => {
    const cone = new THREE.Mesh(coneG, coneM); cone.position.set(s[0], 7.1, s[1]);
    cone.lookAt(s[0] * 0.25, 7.1 + 6, 4); cone.rotateX(PI / 2);
    cone.renderOrder = 5; R3.scene.add(cone);
  });
}

function buildHoop() {
  const g = new THREE.Group(); R3.scene.add(g);
  const metal = std({ color: 0x2f3236, roughness: 0.45, metalness: 0.75 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.9, 14), metal);
  pole.position.set(0, 1.95, 8.35); pole.castShadow = true; g.add(pole);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), std({ color: 0xc44a2a, roughness: 0.85 }));
  pad.position.set(0, 0.8, 8.35); pad.castShadow = true; g.add(pad);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 1.3), std({ color: 0x1e1e20, roughness: 0.7, metalness: 0.3 }));
  base.position.set(0, 0.175, 8.5); base.castShadow = true; base.receiveShadow = true; g.add(base);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.1), metal);
  arm.position.set(0, 3.55, 7.8); arm.castShadow = true; g.add(arm);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.25), metal);
  arm2.position.set(0, 3.1, 7.85); arm2.rotation.x = -0.45; g.add(arm2);
  // glass board with its frame
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_HW * 2, BOARD_Y1 - BOARD_Y0, 0.035), std({ map: boardTex(), color: 0xffffff, transparent: true, roughness: 0.08, metalness: 0.2, opacity: 1, depthWrite: false, emissive: 0xffffff, emissiveIntensity: 0 }));
  board.position.set(0, (BOARD_Y0 + BOARD_Y1) / 2, BOARD_Z + 0.02); board.rotation.y = PI; board.renderOrder = 3; g.add(board);
  W.board = board;
  const frameM = std({ color: 0x2c2d31, roughness: 0.4, metalness: 0.8 });
  const fw = 0.04, bw = BOARD_HW * 2, bh = BOARD_Y1 - BOARD_Y0;
  [[0, BOARD_Y1, bw + fw, fw], [0, BOARD_Y0, bw + fw, fw], [-BOARD_HW, (BOARD_Y0 + BOARD_Y1) / 2, fw, bh], [BOARD_HW, (BOARD_Y0 + BOARD_Y1) / 2, fw, bh]].forEach((f) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(f[2], f[3], 0.06), frameM); m.position.set(f[0], f[1], BOARD_Z + 0.03); m.castShadow = true; g.add(m);
  });
  // rim
  const rimM = std({ color: 0xff5a20, roughness: 0.32, metalness: 0.55, emissive: 0xff5a20, emissiveIntensity: 0.06 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM.r, 0.019, 10, 40), rimM);
  rim.rotation.x = PI / 2; rim.position.set(-RIM.x, RIM.y, RIM.z); rim.castShadow = true; g.add(rim);
  W.rimMat = rimM; W.rim = rim;
  const brk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), rimM);
  brk.position.set(0, RIM.y - 0.01, RIM.z + RIM.r + 0.06); g.add(brk);
  // net: twelve strands that a make really moves
  W.net = [];
  for (let i = 0; i < 12; i++) {
    const s = [];
    for (let k = 0; k < 6; k++) s.push(new THREE.Vector3());
    W.net.push(s);
  }
  netTargets(0);
  W.net.forEach((s, i) => s.forEach((p, k) => p.copy(W.netT[i][k])));
  const segs = 12 * 5 * 3;
  W.netPos = new Float32Array(segs * 6);
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(W.netPos, 3).setUsage(THREE.DynamicDrawUsage));
  W.netLines = new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: 0xf4efe6, transparent: true, opacity: 0.92 }));
  W.netLines.frustumCulled = false; g.add(W.netLines);
  writeNet();
}

// Rest shape of the net (game coordinates): strands taper from the rim.
function netTargets(stretch) {
  if (!W.netT) W.netT = W.net.map((s) => s.map(() => new THREE.Vector3()));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    for (let k = 0; k < 6; k++) {
      const u = k / 5, rad = RIM.r * (1 - u * 0.55);
      W.netT[i][k].set(RIM.x + cos(a + u * 0.25) * rad, RIM.y - u * (0.44 + stretch * 0.16), RIM.z + sin(a + u * 0.25) * rad);
    }
  }
}

function stepNet(dt) {
  const b = G.ball;
  const swish = clamp(1 - G.swishT / 0.5, 0, 1);
  netTargets(swish);
  const k = 1 - Math.exp(-dt * 11);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
    const p = W.net[i][j], t = W.netT[i][j];
    if (j === 0) { p.copy(t); continue; }
    let tx = t.x, ty = t.y, tz = t.z;
    if (b && b.y < RIM.y + 0.1 && b.y > RIM.y - 0.7) {
      const dx = t.x - b.x, dz = t.z - b.z, dy = t.y - b.y, d = hypot(dx, dy, dz);
      if (d < BR + 0.05) { const push = (BR + 0.05 - d) / (d || 1); tx += dx * push; tz += dz * push; ty += dy * push * 0.4; }
    }
    p.x = lerp(p.x, tx, k); p.y = lerp(p.y, ty, k); p.z = lerp(p.z, tz, k);
  }
  writeNet();
}

function writeNet() {
  const a = W.netPos; let o = 0;
  const put = (p) => { a[o++] = -p.x; a[o++] = p.y; a[o++] = p.z; };
  for (let i = 0; i < 12; i++) {
    const s = W.net[i], n = W.net[(i + 1) % 12];
    for (let k = 0; k < 5; k++) {
      put(s[k]); put(n[k + 1]);
      put(n[k]); put(s[k + 1]);
      put(s[k + 1]); put(n[k + 1]);
    }
  }
  W.netLines.geometry.attributes.position.needsUpdate = true;
}

/* ---------------------------------------------------------------------- the shooter */
const P = {};
function limb(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  m.position.y = -(len / 2 + r * 0.6); m.castShadow = true;
  return m;
}
function buildShooter() {
  const skin = std({ color: 0x8a5a3c, roughness: 0.62 });
  const jersey = std({ color: 0xff6940, roughness: 0.75 });
  const trim = std({ color: 0x2a1610, roughness: 0.7 });
  const shorts = std({ color: 0x1d1a18, roughness: 0.8 });
  const sock = std({ color: 0xf2ede4, roughness: 0.85 });
  const shoe = std({ color: 0xf6f2ea, roughness: 0.5 });
  const sole = std({ color: 0xff6940, roughness: 0.6 });
  const hair = std({ color: 0x15100d, roughness: 0.9 });
  const root = new THREE.Group(); root.position.set(0, 0, 0.2); R3.scene.add(root); P.root = root;
  const hip = new THREE.Group(); hip.position.y = 0.95; root.add(hip); P.hip = hip;
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.3, 14), shorts); sh.position.y = -0.06; sh.scale.z = 0.78; sh.castShadow = true; hip.add(sh);
  const torso = new THREE.Group(); hip.add(torso); P.torso = torso;
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.32, 6, 14), jersey); chest.position.y = 0.32; chest.scale.set(1.3, 1, 0.78); chest.castShadow = true; torso.add(chest);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), trim); band.position.y = 0.06; band.scale.z = 0.78; torso.add(band);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: numberTex(), transparent: true, roughness: 0.8, depthWrite: false }));
  num.position.set(0, 0.36, -0.132); num.rotation.y = PI; torso.add(num);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skin); neck.position.y = 0.64; torso.add(neck);
  const head = new THREE.Group(); head.position.y = 0.76; torso.add(head); P.head = head;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), skin); skull.scale.set(0.92, 1.08, 1); skull.castShadow = true; head.add(skull);
  const hr = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 10, 0, TAU, 0, PI * 0.55), hair); hr.position.y = 0.012; hr.rotation.x = -0.25; head.add(hr);
  const hb = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.014, 6, 20), jersey); hb.rotation.x = PI / 2 - 0.15; hb.position.y = 0.03; head.add(hb);
  P.arms = []; P.legs = [];
  [-1, 1].forEach((sd) => {
    const shoulder = new THREE.Group(); shoulder.position.set(sd * 0.25, 0.52, 0); torso.add(shoulder);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), jersey); cap.scale.set(1, 0.85, 1); shoulder.add(cap);
    shoulder.add(limb(0.05, 0.22, skin));
    const elbow = new THREE.Group(); elbow.position.y = -0.33; shoulder.add(elbow);
    elbow.add(limb(0.042, 0.22, skin));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin); hand.position.y = -0.31; hand.scale.set(0.8, 1.1, 0.6); elbow.add(hand);
    P.arms.push({ shoulder, elbow, hand, sd });
    const hipJ = new THREE.Group(); hipJ.position.set(sd * 0.095, -0.12, 0); hip.add(hipJ);
    hipJ.add(limb(0.072, 0.26, skin));
    const knee = new THREE.Group(); knee.position.y = -0.41; hipJ.add(knee);
    knee.add(limb(0.058, 0.27, skin));
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.16, 10), sock); sk.position.y = -0.33; knee.add(sk);
    const foot = new THREE.Group(); foot.position.y = -0.43; knee.add(foot);
    const sh1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.26), shoe); sh1.position.set(0, -0.0, 0.05); sh1.castShadow = true; foot.add(sh1);
    const so = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.025, 0.27), sole); so.position.set(0, -0.045, 0.05); foot.add(so);
    P.legs.push({ hipJ, knee, foot, sd });
  });
}

// One pose from three numbers: crouch, how far the ball is raised, and the jump.
function poseShooter(dt) {
  const c = G.charge;
  const t = G.shotT;
  let crouch, raise, jump = 0, follow = 0;
  if (G.phase === 'aim') {
    const breath = sin(R3.time * 2.2) * 0.02;
    crouch = clamp(c * 1.25, 0, 0.75) + (G.holding ? 0 : 0.12 + breath);
    raise = G.holding ? clamp(0.3 + c * 0.9, 0, 1) : 0.15 + G.ballIn * 0.1;
  } else {
    const up = clamp(t / 0.22, 0, 1), down = clamp((t - 0.45) / 0.3, 0, 1);
    jump = sin(clamp(t / 0.62, 0, 1) * PI) * 0.32;
    crouch = lerp(0.1, 0.35, down) * (t > 0.6 ? 1 : 0.4);
    raise = 1; follow = up * (1 - clamp((t - 1.2) / 0.5, 0, 1));
    if (t > 1.2) raise = lerp(1, 0.2, clamp((t - 1.2) / 0.5, 0, 1));
  }
  const k = 1 - Math.exp(-dt * 14);
  P.cr = lerp(P.cr || 0, crouch, k); P.ra = lerp(P.ra || 0, raise, k); P.ju = lerp(P.ju || 0, jump, 1 - Math.exp(-dt * 20)); P.fo = lerp(P.fo || 0, follow, k);
  const cr = P.cr, ra = P.ra, fo = P.fo;
  P.root.position.x = 0;
  P.root.position.y = P.ju;
  P.hip.position.y = 0.95 - cr * 0.2;
  P.torso.rotation.x = cr * 0.22 - fo * 0.08;
  P.root.rotation.y = -G.aimX * 0.35;
  P.head.rotation.x = -0.15 - ra * 0.2;
  P.legs.forEach((L) => {
    L.hipJ.rotation.x = -cr * 0.85 - (P.ju > 0.05 ? 0.1 : 0);
    L.knee.rotation.x = cr * 1.5 + (P.ju > 0.05 ? 0.25 : 0);
    L.foot.rotation.x = -cr * 0.6 + (P.ju > 0.05 ? 0.4 : 0);
    L.hipJ.rotation.z = L.sd * 0.06;
  });
  P.arms.forEach((Ar) => {
    // chest hold (shoulder -0.55, elbow -1.6) to the set point (-2.2, -1.5) to a straight release (-2.75, -0.15)
    const s = lerp(-0.55, -2.2, ra) + fo * -0.55;
    const e = lerp(-1.65, -1.45, ra) * (1 - fo) + fo * -0.12;
    Ar.shoulder.rotation.x = s;
    Ar.elbow.rotation.x = e;
    Ar.shoulder.rotation.z = -Ar.sd * (0.3 - fo * 0.12);
  });
}

function buildBall() {
  const mat = std({ map: ballTex(), roughness: 0.62, metalness: 0.0, emissive: 0xffb736, emissiveIntensity: 0 });
  W.ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 28, 20), mat);
  W.ball.castShadow = true; R3.scene.add(W.ball); W.ballMat = mat;
  W.ballQ = new THREE.Quaternion();
  // the aim marker at the rim: where this shot crosses rim height when timed right
  const rg = new THREE.RingGeometry(0.17, 0.22, 40); rg.rotateX(-PI / 2);
  W.aimRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffb736, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  W.aimRing.renderOrder = 6; R3.scene.add(W.aimRing);
  // a faint dotted arc of the timed shot
  W.arcN = 26; W.arcPos = new Float32Array(W.arcN * 3);
  const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(W.arcPos, 3).setUsage(THREE.DynamicDrawUsage));
  W.arcPts = new THREE.Points(ag, new THREE.PointsMaterial({ map: R3.glow, color: 0xffd9a0, size: 0.13, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  W.arcPts.frustumCulled = false; R3.scene.add(W.arcPts);
  W.hm = new THREE.Vector3(); W.hm2 = new THREE.Vector3();
}

function buildLights() {
  R3.scene.add(new THREE.HemisphereLight(0x6a5aa8, 0x2a1810, 0.75));
  const key = new THREE.DirectionalLight(0xffecd0, 2.4);
  key.position.set(5, 11, -4); key.target.position.set(0, 0, 3.5);
  key.castShadow = true;
  const sc = key.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 9; sc.bottom = -5; sc.near = 1; sc.far = 30;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.mapSize.set(1024, 1024);
  R3.scene.add(key); R3.scene.add(key.target); R3.key = key;
  // the floodlights behind the hoop light the board and the shooter's front
  const back = new THREE.SpotLight(0xffd8a8, 26, 26, 0.75, 0.6, 1.6);
  back.position.set(-5.2, 7.1, 9.6); back.target.position.set(0, 1.5, 3); R3.scene.add(back); R3.scene.add(back.target);
  const back2 = back.clone(); back2.position.set(5.2, 7.1, 9.6); back2.target = new THREE.Object3D(); back2.target.position.set(0, 1.5, 3); R3.scene.add(back2); R3.scene.add(back2.target);
  R3.backs = [back, back2];
  // a warm bounce from the city
  const fill = new THREE.DirectionalLight(0xff8a50, 0.55); fill.position.set(-6, 3, 20); R3.scene.add(fill);
  const rimL = new THREE.PointLight(0xffb070, 3.5, 6, 2); rimL.position.set(0, 4.4, 6.2); R3.scene.add(rimL); R3.hoopL = rimL;
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
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x120d1c, 1);
    R3.renderer = r; R3.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
    arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
    R3.q = R3.soft ? 0 : (window.matchMedia && matchMedia('(pointer: coarse)').matches ? 2 : 3);
    const qm = /[?&]q=(\d)/.exec(location.search); if (qm) { R3.q = clamp(+qm[1], 0, 3); R3.lock = true; }
    R3.scene = new THREE.Scene();
    R3.scene.fog = new THREE.FogExp2(0x3a2238, 0.0085);
    R3.camera = new THREE.PerspectiveCamera(46, arc.w / arc.h, 0.1, 900);
    R3.glow = glowTex();
    colorsInit();
    buildSky(); buildCity(); buildRoof(); buildCage(); buildStrings(); buildFloodlights(); buildHoop(); buildShooter(); buildBall(); buildLights();
    FX.add = new FxPool(900, true); FX.norm = new FxPool(700, false);
    R3.camPos = new THREE.Vector3(-0.55, 2.9, -5.5); R3.camLook = new THREE.Vector3(0, 2.4, 6.4);
    R3.tmpV = new THREE.Vector3(); R3.tmpV2 = new THREE.Vector3(); R3.proj = new THREE.Vector3();
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
  r.setPixelRatio(Math.max(0.5, arc.dpr * f)); r.setSize(arc.w, arc.h, false);
  const key = R3.key, want = R3.q >= 3 ? 2048 : R3.q >= 1 ? 1024 : 512;
  r.shadowMap.enabled = R3.q >= 1;
  key.castShadow = R3.q >= 1;
  if (key.shadow.mapSize.x !== want) { key.shadow.mapSize.set(want, want); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
  if (W.halo) W.halo.visible = R3.q >= 1;
}

function cameraRig(dt) {
  const cam = R3.camera, b = G.ball, rm = arc.reducedMotion;
  const portrait = arc.h > arc.w * 1.05;
  const asp = arc.w / arc.h;
  // over the shooter's right shoulder; about 5.4 m of width at the hoop in portrait
  let fov = portrait ? clamp(2 * Math.atan(Math.tan(12.5 * PI / 180) / asp) * 180 / PI, 38, 64) : 37;
  let px = -0.55 - G.aimX * 0.4, py = portrait ? 3.05 : 2.85, pz = portrait ? -5.6 : -5.5;
  let lx = -0.05 - G.aimX * 0.55, ly = portrait ? 2.35 : 2.4, lz = 6.4;
  const flying = b && b.air && G.phase !== 'aim';
  if (flying) {
    const u = clamp(b.flightT / 1.0, 0, 1);
    lx = lerp(lx, -b.x * 0.5, u * 0.6); ly = lerp(ly, max(2.6, b.y * 0.55 + 1.2), u * 0.5); lz = lerp(lz, 6.6, u);
    if (!rm) { pz += ease(u) * 0.9; py += ease(u) * 0.12; fov *= 1 - ease(u) * 0.06; }
  }
  if (G.slow > 0 && !rm) { const s = sin(clamp(G.slow / 0.7, 0, 1) * PI) * 0.12; fov *= 1 - s; lx = lerp(lx, -RIM.x, s * 4); ly = lerp(ly, RIM.y, s * 4); }
  if (G.phase === 'net' && !rm) { const s = clamp(1 - G.swishT / 1.2, 0, 1); pz += s * 0.4; }
  if (G.attract) { const t = R3.time * 0.12; px = sin(t) * 1.8; pz = -5.2 + cos(t * 1.3) * 0.5; py = 2.9; }
  const k = 1 - Math.exp(-dt * (rm ? 2.2 : 4));
  R3.camPos.x = lerp(R3.camPos.x, px, k); R3.camPos.y = lerp(R3.camPos.y, py, k); R3.camPos.z = lerp(R3.camPos.z, pz, k);
  R3.camLook.x = lerp(R3.camLook.x, lx, k); R3.camLook.y = lerp(R3.camLook.y, ly, k); R3.camLook.z = lerp(R3.camLook.z, lz, k);
  cam.position.copy(R3.camPos);
  cam.position.x += (arc.shakeX || 0) * 0.006; cam.position.y += (arc.shakeY || 0) * 0.006;
  cam.lookAt(R3.camLook);
  if (abs(cam.fov - fov) > 0.01 || abs(cam.aspect - asp) > 0.0001) { cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 6)); cam.aspect = asp; cam.updateProjectionMatrix(); }
}

const _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
function frame3D(dt) {
  R3.time += dt;
  const t = R3.time, rm = arc.reducedMotion;
  const sdt = dt * (G.slow > 0 ? 0.35 : 1);
  poseShooter(dt);
  P.root.updateMatrixWorld(true);
  // the ball rides in the hands until it is shot
  const b = G.ball;
  const bm = W.ball;
  if (b && !b.air && G.phase === 'aim') {
    P.arms[0].hand.getWorldPosition(W.hm); P.arms[1].hand.getWorldPosition(W.hm2);
    W.hm.add(W.hm2).multiplyScalar(0.5);
    // in front of the palms, a touch higher
    W.hm.y += 0.1; W.hm.z += 0.1;
    const inK = ease(G.ballIn);
    bm.position.set(lerp(1.6, W.hm.x, inK), lerp(1.0, W.hm.y, inK) + sin(G.ballIn * PI) * 0.4, lerp(1.2, W.hm.z, inK));
    G.release.x = -bm.position.x; G.release.y = bm.position.y; G.release.z = bm.position.z;
    b.x = G.release.x; b.y = G.release.y; b.z = G.release.z;
    _ax.set(1, 0, 0); _q.setFromAxisAngle(_ax, -dt * 0.4); W.ballQ.premultiply(_q);
  } else if (b) {
    bm.position.set(-b.x, b.y, b.z);
    if (b.air) {
      const sp = hypot(b.vx, b.vz);
      if (sp > 0.05) { _ax.set(b.vz / sp, 0, b.vx / sp); _q.setFromAxisAngle(_ax, -(b.spin + sp * 2) * sdt * 0.5); W.ballQ.premultiply(_q); }
    }
  }
  bm.quaternion.copy(W.ballQ);
  // the ball warms to gold while the charge sits in the band
  const inBand = G.phase === 'aim' && G.charge >= SWEET[0] && G.charge <= SWEET[1];
  W.ballMat.emissiveIntensity = lerp(W.ballMat.emissiveIntensity, inBand ? 0.55 + (rm ? 0 : sin(t * 18) * 0.12) : (G.combo >= 3 && b && b.air ? 0.35 : 0), 1 - Math.exp(-dt * 18));
  // trail
  if (b && b.air && FX.add) {
    const fire = G.combo >= 3 && !G.attract;
    const n = fire ? 3 : 1;
    for (let i = 0; i < n; i++) FX.add.add(-b.x + rr(-0.04, 0.04), b.y + rr(-0.04, 0.04), b.z + rr(-0.04, 0.04), rr(-0.2, 0.2), fire ? rr(0.3, 1) : 0, rr(-0.2, 0.2), fire ? rr(0.25, 0.45) : 0.32, fire ? rr(0.12, 0.2) : 0.11, fire ? COL.fire : COL.warm, fire ? 0.8 : 0.4, 0, 0.95);
  }
  // aim ring and the timed arc
  const showAim = G.phase === 'aim' && !G.attract && arc.state === 'play';
  W.aimRing.visible = showAim; W.arcPts.visible = showAim && G.holding;
  if (showAim) {
    const xT = G.aimX * 1.5;
    const on = abs(xT) < MAKE_R - 0.05;
    W.aimRing.position.set(-xT, RIM.y + 0.005, RIM.z);
    W.aimRing.material.color.set(on ? 0xffb736 : 0xff6940);
    W.aimRing.material.opacity = 0.55 + (rm ? 0 : sin(t * 6) * 0.2);
    if (W.arcPts.visible) {
      const x0 = G.release.x, y0 = G.release.y, z0 = G.release.z, H = 4.62;
      const vy = Math.sqrt(2 * GRAV * Math.max(0.3, H - y0)), T = vy / GRAV + Math.sqrt(2 * (H - RIM.y) / GRAV);
      const vx = (xT - x0) / T, vz = (RIM.z - z0) / T;
      for (let i = 0; i < W.arcN; i++) {
        const tt = (i + 1) / (W.arcN + 1) * T * 0.92;
        W.arcPos[i * 3] = -(x0 + vx * tt); W.arcPos[i * 3 + 1] = y0 + vy * tt - 0.5 * GRAV * tt * tt; W.arcPos[i * 3 + 2] = z0 + vz * tt;
      }
      W.arcPts.geometry.attributes.position.needsUpdate = true;
      W.arcPts.material.opacity = 0.18 + clamp(G.charge, 0, 1) * 0.35;
    }
  }
  stepNet(sdt);
  // the rim rings when hit, the glass flashes, the lamps flare on a make
  G.rimHit = max(0, (G.rimHit || 0) - dt * 4); G.boardHit = max(0, (G.boardHit || 0) - dt * 5);
  W.rim.position.y = RIM.y + (rm ? 0 : sin(t * 60) * 0.012 * G.rimHit);
  W.rimMat.emissiveIntensity = 0.06 + G.rimHit * 0.5 + (G.combo >= 3 && !G.attract ? 0.35 + (rm ? 0 : sin(t * 5) * 0.15) : 0);
  W.board.material.emissiveIntensity = G.boardHit * 0.25;
  const fl = rm ? 0 : G.flare;
  R3.backs.forEach((s) => { s.intensity = 26 + fl * 30; });
  R3.hoopL.intensity = 3.5 + fl * 8;
  W.lampGlows.forEach((g, i) => { g.material.opacity = 0.75 + fl * 0.25 + (rm ? 0 : sin(t * 3 + i) * 0.03); });
  W.coneMat.uniforms.uA.value = 0.07 + fl * 0.06;
  const blink = rm ? 1 : 0.4 + 0.6 * (sin(t * 2.5) > 0 ? 1 : 0.15);
  W.redLights.material.color.setRGB(blink, 0.19 * blink, 0.12 * blink);
  FX.add.step(sdt); FX.norm.step(sdt);
  FX.add.u.uK.value = FX.norm.u.uK.value = arc.h * R3.renderer.getPixelRatio() / (2 * Math.tan(R3.camera.fov * PI / 360));
  cameraRig(dt);
  // quality auto-scale on real frame time
  if (!R3.lock && arc.state === 'play') {
    R3.accT += R3.realDt; R3.accN++;
    if (R3.accT > 1.3 && R3.accN >= 3) {
      const avg = R3.accT / R3.accN; R3.fps = Math.round(1 / avg);
      if (R3.settle > 0) R3.settle--; else if (avg > 0.03 && R3.q > 0) { R3.q--; applyQuality(); R3.settle = 1; }
      R3.accT = 0; R3.accN = 0;
    }
  }
}

/* ====================================================================== HUD */
function rr2(c, x, y, w, h, r) {
  r = min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function plate(c, x, y, w, h, r, a) {
  c.fillStyle = 'rgba(15,13,10,' + (a == null ? 0.72 : a) + ')'; rr2(c, x, y, w, h, r); c.fill();
  c.strokeStyle = 'rgba(251,245,236,.12)'; c.lineWidth = 1; c.stroke();
}
function txt(c, s, x, y, size, col, wgt, align, font) {
  c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
  c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
}

function toScreen(x, y, z) {
  if (!R3.ok) return { x: 0, y: 0, z: 2 };
  const v = R3.proj.set(-x, y, z).project(R3.camera);
  return { x: (v.x * 0.5 + 0.5) * arc.w, y: (-v.y * 0.5 + 0.5) * arc.h, z: v.z };
}

function drawHUD(c) {
  const w = arc.w, h = arc.h, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12, bottom: 52 };
  const sw = (full) => min(full, max(96, w / 2 - 66 - 12));
  plate(c, pad.left, pad.top, sw(150), 70, 12);
  txt(c, 'POINTS', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
  txt(c, String(G.score), pad.left + 14, pad.top + 42, 28, INK, 500, 'left', F_DISP);
  const clock = G.mode === 'twentyone' ? 'TO 21' : (Math.max(0, G.time) | 0) + 's';
  plate(c, w / 2 - 54, pad.top, 108, 44, 12);
  txt(c, clock, w / 2, pad.top + 22, 22, G.time < 10 && G.mode !== 'twentyone' ? PRIM : INK, 500, 'center', F_DISP);
  if (G.combo > 1) {
    plate(c, w - pad.right - sw(120), pad.top, sw(120), 44, 12);
    txt(c, 'STREAK x' + G.combo, w - pad.right - sw(120) / 2, pad.top + 22, 12, G.combo >= 3 ? PRIM : WARM, 600, 'center', F_MONO);
  }
  if (G.phase === 'aim') {
    const bw = min(240, w - 40), bx = w / 2 - bw / 2, by = h - pad.bottom - 30;
    plate(c, bx - 10, by - 22, bw + 20, 42, 12, 0.72);
    txt(c, G.holding ? 'RELEASE IN THE GOLD' : 'HOLD TO CHARGE', w / 2, by - 9, 9, GOLD, 600, 'center', F_MONO);
    c.fillStyle = 'rgba(251,245,236,.12)'; rr2(c, bx, by, bw, 10, 5); c.fill();
    const s0 = SWEET[0] * bw, s1 = (SWEET[1] - SWEET[0]) * bw;
    c.fillStyle = 'rgba(255,183,54,.38)'; rr2(c, bx + s0, by, s1, 10, 5); c.fill();
    c.strokeStyle = 'rgba(255,183,54,.85)'; c.lineWidth = 1; rr2(c, bx + s0, by - 2, s1, 14, 6); c.stroke();
    const inB = G.charge >= SWEET[0] && G.charge <= SWEET[1];
    c.fillStyle = inB ? WARM : PRIM;
    rr2(c, bx, by, max(5, bw * G.charge), 10, 5); c.fill();
    if (inB && !arc.reducedMotion) { c.fillStyle = 'rgba(255,230,170,.5)'; rr2(c, bx + bw * G.charge - 6, by - 3, 8, 16, 4); c.fill(); }
  }
}

function drawPops(c) {
  G.pops.forEach((p) => {
    const s = toScreen(p.x, p.y + p.t * 0.6, p.z);
    if (s.z > 1) return;
    const a = clamp(min(p.t / 0.12, (p.life - p.t) / 0.4), 0, 1);
    const sc = p.big ? 1 + (arc.reducedMotion ? 0 : max(0, 0.4 - p.t) * 1.2) : 1;
    c.save(); c.globalAlpha = a;
    c.font = (p.big ? 'italic 600 ' + Math.round(34 * sc) + 'px ' : '600 15px ') + (p.big ? F_DISP : F_UI);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = p.big ? 5 : 4; c.strokeStyle = 'rgba(15,13,10,.75)'; c.strokeText(p.text, s.x, s.y);
    c.fillStyle = p.col; c.fillText(p.text, s.x, s.y);
    c.restore();
  });
}

function drawTouchAim(c) {
  if (!gestTouch() || G.phase !== 'aim' || !(G.holding || arc.input.gesture.active)) return;
  const xT = G.aimX * 1.5;
  const on = abs(xT) < MAKE_R - 0.05;
  const q = toScreen(xT, RIM.y, RIM.z);
  c.save();
  c.strokeStyle = on ? WARM : 'rgba(255,105,64,.85)'; c.lineWidth = 2; c.globalAlpha = 0.9;
  c.setLineDash([3, 5]); c.globalAlpha = 0.55;
  c.beginPath(); c.moveTo(q.x, q.y + 10); c.lineTo(q.x, q.y + 56); c.stroke();
  c.restore();
}

function drawTouchHint(c) {
  if (!arc.touchMode || arc.touchStyle === 'pads' || G.attract || G.hintT > 6) return;
  const a = arc.reducedMotion ? 1 : clamp(6 - G.hintT, 0, 1);
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { bottom: 64 };
  const msg = 'Hold to charge, slide to aim, lift in the gold';
  c.save(); c.globalAlpha = a;
  c.font = '600 13px ' + F_UI;
  const mw = min(w - 24, c.measureText(msg).width + 32), y = arc.h - pad.bottom - 90;
  plate(c, (w - mw) / 2, y - 16, mw, 32, 12, 0.66);
  txt(c, msg, w / 2, y, 13, INK, 600, 'center');
  c.restore();
}

function drawFail(c) {
  const w = arc.w, h = arc.h;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a1630'); g.addColorStop(0.6, '#3a2450'); g.addColorStop(1, '#1a120c');
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
    try { frame3D(arc.state === 'pause' ? 0 : dt); R3.renderer.render(R3.scene, R3.camera); } catch (e) { R3.ok = false; try { console.warn(e); } catch (er) { /* ignore */ } }
  }
  if (arc.state === 'play' && !G.attract) {
    if (R3.ok) drawPops(c); drawTouchAim(c); drawHUD(c); drawTouchHint(c);
  }
}

function dbg() {
  const b = G.ball || {};
  return {
    phase: G.phase, mode: G.mode, score: G.score, time: +G.time.toFixed(2), aimX: +G.aimX.toFixed(3),
    charge: +G.charge.toFixed(3), combo: G.combo, makes: G.makes, attempts: G.attempts,
    ball: [+((b.x || 0).toFixed(2)), +((b.y || 0).toFixed(2)), +((b.z || 0).toFixed(2))],
    air: !!(b.air), attract: !!G.attract, lastMiss: G.lastMiss, touchStyle: arc.touchStyle,
    quality: R3.q, fps: R3.fps || null, webgl: R3.ok,
  };
}

function boot() {
  A.create({
    slug: 'court-lights', title: 'Court Lights', genre: 'Street basketball', three: true,
    hint: 'Mouse or arrows aim   hold click or Space to shoot',
    touchHint: 'Stick aims, hold Shoot, release to fire',
    keys: [
      ['Left / Right / A D', 'Aim the shot'],
      ['Space / J (hold)', 'Charge, then release to shoot'],
    ],
    mouse: { cursor: 'crosshair', keys: [['Move mouse', 'Aim'], ['Click / hold', 'Charge, then release']] },
    touch: { stick: true, pads: [{ label: 'Shoot', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Aim'], ['Shoot (hold)', 'Charge, then release']],
    gamepad: { buttons: ['Space'], rt: 'Space' },
    gestures: {
      drag: false,
      hint: 'Hold to charge, slide to aim, lift in the gold',
      keys: [
        ['Touch and hold', 'Charge the shot'],
        ['Slide left / right', 'Aim'],
        ['Lift in the gold band', 'Shoot'],
      ],
    },
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Street basketball',
      title: 'Court <em>Lights</em>',
      html: '<p>A rooftop cage after dark. Hold shoot to charge, release in the gold band for a make, and keep a streak going for extra points.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'sixty', choices: [{ v: 'sixty', label: 'Sixty seconds' }, { v: 'twentyone', label: 'First to 21' }, { v: 'sudden', label: 'Make or miss' }] },
      ],
    },
    graphics(level) { if (level === 'auto') { R3.lock = false; return; } R3.lock = true; R3.q = level === 'sharp' ? 3 : 1; applyQuality(); },
    resize(a) { arc = a; if (!R3.renderer) return; applyQuality(); R3.camera.aspect = a.w / a.h; R3.camera.updateProjectionMatrix(); },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + G.score + '</b></div><div>Makes<b>' + G.makes + '/' + G.attempts + '</b></div></div>'; },
    onMenu(a) { arc = a; attractReset(); },
    init(a) { arc = a; a.debug = dbg; initRenderer(); attractReset(); a.menu(); },
    start(a, ch) { arc = a; newMatch(ch); },
    update: (dt) => update(dt), idle: (dt) => idle(dt), render: (c) => render(c),
  });
  window.__courtlights = { G, R3, W, shoot, SWEET };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
