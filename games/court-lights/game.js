/*
 * Court Lights: rooftop street basketball. An original game. No licensed
 * names, no sprite sheets. Everything is drawn in code on the Arcade shell.
 */
(function () {
  'use strict';
  const A = window.Arcade;
  const clamp = A.clamp, lerp = A.lerp;
  const PI = Math.PI, TAU = Math.PI * 2;
  const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, hypot = Math.hypot;
  const rnd = Math.random;
  const F_DISP = 'Fraunces, Times New Roman, serif';
  const F_UI = 'Inter, sans-serif';
  const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
  const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';

  const RIM = { x: 0, y: 3.05, z: 6.95, r: 0.23 };
  const GRAV = 18.4;
  const SWEET = [0.58, 0.78];

  let arc;
  const G = {
    mode: 'sixty', phase: 'aim', time: 60, score: 0, combo: 0, makes: 0, attempts: 0, streak: 0,
    aimX: 0, charge: 0, holding: false, go: 0, t: 0,
    ball: null, parts: [], net: [], buildings: [], attract: true,
  };

  function mkNet() {
    const n = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const strand = [];
      for (let k = 0; k < 6; k++) {
        const u = k / 5;
        strand.push({
          x: RIM.x + cos(a) * RIM.r * (1 - u * 0.72),
          y: RIM.y - u * 0.42,
          z: RIM.z + sin(a) * RIM.r * (1 - u * 0.72),
        });
      }
      n.push(strand);
    }
    return n;
  }
  function mkCity() {
    const rng = A.rng(42);
    const out = [];
    for (let i = 0; i < 18; i++) {
      out.push({
        x: -14 + i * 1.65 + rng() * 0.4,
        w: 0.9 + rng() * 1.2,
        h: 3.4 + rng() * 7.5,
        win: (rng() * 5) | 0,
      });
    }
    return out;
  }
  G.net = mkNet();
  G.buildings = mkCity();

  function proj(x, y, z) {
    const f = min(arc.w, arc.h) * 1.35;
    const camY = 1.7, camZ = -9.2;
    const dz = max(1.2, z - camZ);
    const u = f / dz;
    return { x: arc.w * 0.5 + x * u, y: arc.h * 0.62 - (y - camY) * u, s: u };
  }

  function resetBall() {
    G.ball = { x: 0, y: 1.55, z: 0.35, vx: 0, vy: 0, vz: 0, spin: 0, air: false, scored: false, dead: 0 };
    G.phase = 'aim'; G.charge = 0; G.holding = false;
  }

  function shoot() {
    const c = clamp(G.charge, 0.12, 1);
    const b = G.ball;
    b.air = true; b.scored = false; b.flightT = 0;
    b.vx = G.aimX * 3.6;
    b.vz = 4.05 + c * 5.35;
    b.vy = 6.15 + c * 6.4;
    b.spin = 10 + c * 8;
    G.phase = 'flight'; G.attempts++; G.holding = false;
    arc.sfx.tone(220 + c * 80, 0.09, { type: 'triangle', vol: 0.12 });
    arc.sfx.noise(0.05, { freq: 900, vol: 0.06 });
  }

  function splash(x, y, z, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 0.6 + rnd() * 2.2;
      G.parts.push({ x, y, z, vx: cos(a) * sp, vy: 1.2 + rnd() * 2.4, vz: sin(a) * sp, life: 0.45 + rnd() * 0.4, col });
    }
  }

  function scoreShot(kind) {
    const pts = 3 + G.combo;
    G.score += pts; G.makes++; G.combo++; G.streak = max(G.streak, G.combo);
    G.ball.scored = true; G.phase = 'net';
    const label = G.combo >= 3 ? 'On fire x' + G.combo : (kind === 'swish' ? 'Swish' : 'Bucket');
    arc.toast(label, '+' + pts, 1100);
    arc.sfx.tone(kind === 'swish' ? 880 : 520, 0.16, { type: 'sine', vol: 0.16 });
    if (kind === 'swish') arc.sfx.tone(1320, 0.22, { type: 'sine', vol: 0.1, delay: 0.05 });
    splash(RIM.x, RIM.y - 0.1, RIM.z, kind === 'swish' ? WARM : INK, kind === 'swish' ? 18 : 10);
    if (G.mode === 'twentyone' && G.score >= 21) finish('Twenty one');
  }

  function miss() {
    G.combo = 0; G.phase = 'miss';
    arc.sfx.tone(140, 0.18, { type: 'sawtooth', slide: 70, vol: 0.1 });
    if (G.mode === 'sudden' && G.makes > 0) finish('Missed');
  }

  function finish(why) {
    G.phase = 'over';
    arc.over({
      eyebrow: why || 'Buzzer', title: G.score >= 21 ? 'Lights <em>out</em>' : 'Buzzer',
      score: G.score, scoreLabel: 'Points',
      html: '<p>' + G.makes + ' makes from ' + G.attempts + ' shots. Best streak ' + G.streak + '.</p>',
      again: 'Shoot again',
    });
  }

  function stepBall(dt) {
    const b = G.ball; if (!b || !b.air) return;
    b.flightT = (b.flightT || 0) + dt;
    b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.spin += dt * 14;
    b.vx *= 0.999; b.vz *= 0.999;
    // backboard
    if (b.z > 7.22 && b.y > 2.7 && b.y < 4.05 && abs(b.x) < 0.95 && b.vz > 0) {
      b.z = 7.22; b.vz *= -0.38; b.vx *= 0.85; arc.sfx.tone(310, 0.05, { type: 'square', vol: 0.06 });
    }
    // rim
    const dx = b.x - RIM.x, dz = b.z - RIM.z, d = hypot(dx, dz);
    if (!b.scored && b.y < RIM.y + 0.12 && b.y > RIM.y - 0.16) {
      if (d < RIM.r - 0.05 && b.vy < 0) {
        scoreShot(d < 0.11 ? 'swish' : 'bank');
        b.vx *= 0.2; b.vz *= 0.2; b.vy = min(b.vy, -0.4);
      } else if (d < RIM.r + 0.07 && d > RIM.r - 0.05) {
        const nx = dx / (d || 1), nz = dz / (d || 1);
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vz -= 1.7 * vn * nz; b.vy *= 0.55; }
        b.x = RIM.x + nx * (RIM.r + 0.06); b.z = RIM.z + nz * (RIM.r + 0.06);
        arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.05 });
      }
    }
    if (b.y < 0.12) {
      b.y = 0.12; b.vy *= -0.38; b.vx *= 0.72; b.vz *= 0.72;
      if (abs(b.vy) < 1.2) { b.air = false; b.dead += dt; if (!b.scored && G.phase === 'flight') miss(); }
    }
    if (!b.air && !b.scored && G.phase !== 'aim') b.dead += dt;
    if ((G.phase === 'net' || G.phase === 'miss') && b.dead > 0.55) resetBall();
    if (G.phase === 'net' && b.y < RIM.y - 0.05) b.dead += dt;
    if (G.phase === 'flight' && b.flightT > 4.2) { miss(); resetBall(); }
  }

  function stepNet(dt) {
    const b = G.ball;
    for (let i = 0; i < G.net.length; i++) {
      const s = G.net[i], a = (i / G.net.length) * TAU;
      for (let k = 0; k < s.length; k++) {
        const u = k / (s.length - 1);
        const tx = RIM.x + cos(a) * RIM.r * (1 - u * 0.72);
        const ty = RIM.y - u * 0.42;
        const tz = RIM.z + sin(a) * RIM.r * (1 - u * 0.72);
        let ox = 0, oy = 0;
        if (b && b.scored && b.y < RIM.y && b.y > RIM.y - 0.5) {
          ox = (b.x - tx) * 0.35 * (1 - u); oy = -0.12 * (1 - u);
        }
        s[k].x = lerp(s[k].x, tx + ox, 1 - Math.exp(-dt * 10));
        s[k].y = lerp(s[k].y, ty + oy, 1 - Math.exp(-dt * 10));
        s[k].z = lerp(s[k].z, tz, 1 - Math.exp(-dt * 10));
      }
    }
  }

  function stepParts(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i];
      p.life -= dt; p.vy -= 8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.life <= 0) G.parts.splice(i, 1);
    }
  }

  function readAim(dt) {
    const inp = arc.input, ax = inp.axis(), p = inp.pointer;
    if (abs(ax.x) > 0.08) {
      G.aimX = clamp(G.aimX + ax.x * dt * 1.7, -0.72, 0.72);
    } else if (p && p.seen) {
      G.aimX = lerp(G.aimX, (p.nx - 0.5) * 1.44, 1 - Math.exp(-dt * 10));
    } else if (abs(ax.x) < 0.08) {
      G.aimX *= Math.exp(-dt * 1.4);
    }
    const down = inp.action();
    if (G.phase === 'aim') {
      if (down) { G.holding = true; G.charge = min(1, G.charge + dt * 0.95); }
      else if (G.holding) shoot();
    }
  }

  function newMatch(ch) {
    G.mode = (ch && ch.mode) || 'sixty';
    G.score = 0; G.combo = 0; G.makes = 0; G.attempts = 0; G.streak = 0; G.aimX = 0; G.t = 0; G.go = 0.8;
    G.time = G.mode === 'sixty' ? 60 : G.mode === 'sudden' ? 90 : 99;
    G.parts.length = 0; G.attract = false;
    resetBall();
    arc.toast(G.mode === 'twentyone' ? 'First to 21' : G.mode === 'sudden' ? 'Make or miss' : 'Sixty seconds', 'Court Lights', 1400);
  }

  function update(dt) {
    G.t += dt; G.go = max(0, G.go - dt);
    if (G.phase === 'over') return;
    if (G.mode === 'sixty' || G.mode === 'sudden') {
      G.time -= dt;
      if (G.time <= 0 && G.phase !== 'flight') { G.time = 0; finish('Buzzer'); return; }
    }
    readAim(dt);
    stepBall(dt); stepNet(dt); stepParts(dt);
  }

  function idle(dt) {
    G.t += dt; G.attract = true;
    if (!G.ball) resetBall();
    if (G.phase === 'aim') {
      G.aimX = sin(G.t * 0.7) * 0.35;
      G.charge = 0.5 + 0.22 * sin(G.t * 1.3);
      if ((G.t % 2.6) > 2.35) shoot();
    }
    stepBall(dt); stepNet(dt); stepParts(dt);
    if (G.phase === 'net' || G.phase === 'miss' || (G.ball && G.ball.dead > 0.4)) resetBall();
  }

  function rr(c, x, y, w, h, r) {
    r = min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function plate(c, x, y, w, h, r, a) {
    c.fillStyle = 'rgba(15,13,10,' + (a == null ? 0.72 : a) + ')'; rr(c, x, y, w, h, r); c.fill();
    c.strokeStyle = 'rgba(251,245,236,.12)'; c.lineWidth = 1; c.stroke();
  }
  function txt(c, s, x, y, size, col, wgt, align, font) {
    c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
    c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
  }

  function drawSky(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1630'); g.addColorStop(0.45, '#3a2450'); g.addColorStop(0.72, '#c46a3a'); g.addColorStop(1, '#1a120c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = WARM; c.beginPath(); c.arc(w * 0.78, h * 0.22, 18, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,183,54,.12)'; c.beginPath(); c.arc(w * 0.78, h * 0.22, 70, 0, TAU); c.fill();
    G.buildings.forEach((b) => {
      const p0 = proj(b.x, 0, 22), p1 = proj(b.x + b.w, min(b.h, 6.2), 22);
      const x = p0.x, ww = p1.x - p0.x, hh = p0.y - p1.y;
      if (ww < 2 || hh < 2) return;
      c.fillStyle = '#120e14'; c.fillRect(x, p1.y, ww, hh);
      c.fillStyle = 'rgba(255,183,54,.28)';
      for (let i = 0; i < b.win; i++) c.fillRect(x + 3 + (i % 3) * 6, p1.y + 6 + ((i / 3) | 0) * 8, 3, 4);
    });
  }

  function drawCourt(c) {
    const fl = [proj(-4.2, 0, -0.4), proj(4.2, 0, -0.4), proj(3.1, 0, 7.6), proj(-3.1, 0, 7.6)];
    c.beginPath(); c.moveTo(fl[0].x, fl[0].y); for (let i = 1; i < 4; i++) c.lineTo(fl[i].x, fl[i].y); c.closePath();
    c.fillStyle = '#3a2a22'; c.fill();
    c.strokeStyle = 'rgba(251,245,236,.35)'; c.lineWidth = 2; c.stroke();
    const key = [proj(-1.1, 0, 4.4), proj(1.1, 0, 4.4), proj(1.1, 0, 7.4), proj(-1.1, 0, 7.4)];
    c.beginPath(); c.moveTo(key[0].x, key[0].y); for (let i = 1; i < 4; i++) c.lineTo(key[i].x, key[i].y); c.closePath();
    c.strokeStyle = 'rgba(251,245,236,.5)'; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = PRIM; c.globalAlpha = 0.7; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = PI + (PI * i) / 16;
      const p = proj(cos(a) * 3.4, 0, 3.4 + sin(a) * 1.15);
      i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
    }
    c.stroke(); c.globalAlpha = 1;
    // cage mesh, far end
    c.strokeStyle = 'rgba(251,245,236,.12)'; c.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = proj(-3.1 + i * 0.9, 0, 7.55), b = proj(-3.1 + i * 0.9, 3.6, 7.55);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
  }

  function drawHoop(c) {
    const board = [proj(-0.9, 4.05, 7.2), proj(0.9, 4.05, 7.2), proj(0.9, 2.72, 7.2), proj(-0.9, 2.72, 7.2)];
    c.beginPath(); c.moveTo(board[0].x, board[0].y); for (let i = 1; i < 4; i++) c.lineTo(board[i].x, board[i].y); c.closePath();
    c.fillStyle = 'rgba(251,245,236,.88)'; c.fill();
    c.strokeStyle = '#c23'; c.lineWidth = 3;
    const sq = [proj(-0.28, 3.45, 7.18), proj(0.28, 3.45, 7.18), proj(0.28, 3.05, 7.18), proj(-0.28, 3.05, 7.18)];
    c.beginPath(); c.moveTo(sq[0].x, sq[0].y); for (let i = 1; i < 4; i++) c.lineTo(sq[i].x, sq[i].y); c.closePath(); c.stroke();
    const pole = proj(0, 0, 7.35), top = proj(0, 3.05, 7.35);
    c.strokeStyle = '#2a261f'; c.lineWidth = 6; c.beginPath(); c.moveTo(pole.x, pole.y); c.lineTo(top.x, top.y); c.stroke();
    const r = proj(RIM.x, RIM.y, RIM.z);
    const rx = RIM.r * r.s, ry = RIM.r * r.s * 0.32;
    c.strokeStyle = PRIM; c.lineWidth = 4; c.beginPath(); c.ellipse(r.x, r.y, rx, ry, 0, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(201,169,110,.75)'; c.lineWidth = 1;
    G.net.forEach((s) => {
      c.beginPath();
      s.forEach((p, i) => { const q = proj(p.x, p.y, p.z); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); });
      c.stroke();
    });
  }

  function drawPlayer(c) {
    const lean = G.aimX * 0.18;
    const p = proj(lean, 0, 0.2);
    const head = proj(lean, 1.8, 0.2);
    const s = max(0.7, (p.y - head.y) / 62);
    c.save(); c.translate(p.x, p.y); c.scale(s, s);
    c.fillStyle = '#1a1814'; c.fillRect(-10, -52, 20, 36);
    c.fillStyle = PRIM; c.fillRect(-10, -28, 20, 8);
    c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(0, -60, 8, 0, TAU); c.fill();
    c.fillStyle = '#1a1814'; c.fillRect(-12, -16, 8, 16); c.fillRect(4, -16, 8, 16);
    if (G.phase === 'aim') {
      c.save(); c.translate(14, -40); c.rotate(-0.6 - G.charge * 0.5);
      c.fillStyle = '#c45a20'; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill();
      c.restore();
    }
    c.restore();
  }

  function drawBall(c) {
    const b = G.ball; if (!b) return;
    if (!b.air && G.phase === 'aim') return;
    const p = proj(b.x, b.y, b.z);
    const r = max(5, 0.12 * p.s);
    c.save(); c.translate(p.x, p.y); c.rotate(b.spin);
    const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    g.addColorStop(0, '#ffb080'); g.addColorStop(1, '#c45a20');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = '#2a1810'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
    c.restore();
  }

  function drawHUD(c) {
    const w = arc.w, h = arc.h, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, bottom: 52 };
    plate(c, pad.left, pad.top, 150, 70, 12);
    txt(c, 'POINTS', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(G.score), pad.left + 14, pad.top + 42, 28, INK, 500, 'left', F_DISP);
    const clock = G.mode === 'twentyone' ? 'TO 21' : (Math.max(0, G.time) | 0) + 's';
    plate(c, w / 2 - 54, pad.top, 108, 44, 12);
    txt(c, clock, w / 2, pad.top + 22, 22, G.time < 10 && G.mode !== 'twentyone' ? PRIM : INK, 500, 'center', F_DISP);
    if (G.combo > 1) {
      plate(c, w - pad.right - 120, pad.top, 120, 44, 12);
      txt(c, 'STREAK x' + G.combo, w - pad.right - 60, pad.top + 22, 12, WARM, 600, 'center', F_MONO);
    }
    if (G.phase === 'aim') {
      const bw = min(220, w - 40), bx = w / 2 - bw / 2, by = h - pad.bottom - 28;
      plate(c, bx - 8, by - 10, bw + 16, 28, 10, 0.7);
      c.fillStyle = 'rgba(251,245,236,.12)'; rr(c, bx, by, bw, 8, 4); c.fill();
      const sweet0 = SWEET[0] * bw, sweet1 = (SWEET[1] - SWEET[0]) * bw;
      c.fillStyle = 'rgba(255,183,54,.35)'; rr(c, bx + sweet0, by, sweet1, 8, 4); c.fill();
      c.fillStyle = G.charge >= SWEET[0] && G.charge <= SWEET[1] ? WARM : PRIM;
      rr(c, bx, by, max(4, bw * G.charge), 8, 4); c.fill();
    }
  }

  function render(c) {
    const w = arc.w, h = arc.h;
    c.clearRect(0, 0, w, h);
    drawSky(c, w, h);
    drawCourt(c);
    drawHoop(c);
    drawPlayer(c);
    G.parts.forEach((p) => {
      const q = proj(p.x, p.y, p.z);
      c.globalAlpha = clamp(p.life * 2, 0, 1);
      c.fillStyle = p.col; c.beginPath(); c.arc(q.x, q.y, 2.2 * q.s, 0, TAU); c.fill();
      c.globalAlpha = 1;
    });
    drawBall(c);
    if (arc.state === 'play' && !G.attract) drawHUD(c);
  }

  function dbg() {
    const b = G.ball || {};
    return {
      phase: G.phase, mode: G.mode, score: G.score, time: +G.time.toFixed(2), aimX: +G.aimX.toFixed(3),
      charge: +G.charge.toFixed(3), combo: G.combo, makes: G.makes, attempts: G.attempts,
      ball: [+((b.x || 0).toFixed(2)), +((b.y || 0).toFixed(2)), +((b.z || 0).toFixed(2))],
      air: !!(b.air), attract: !!G.attract,
    };
  }

  A.create({
    slug: 'court-lights', title: 'Court Lights', genre: 'Street basketball',
    hint: 'Mouse or arrows aim   hold click or Space to shoot',
    touchHint: 'Stick aims, hold Shoot, release to fire',
    keys: [
      ['Left / Right / A D', 'Aim the shot'],
      ['Space / J (hold)', 'Charge, then release to shoot'],
    ],
    mouse: { steer: 'x', cursor: 'crosshair', keys: [['Move mouse', 'Aim'], ['Click / hold', 'Charge, then release']] },
    touch: { stick: true, pads: [{ label: 'Shoot', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Aim'], ['Shoot (hold)', 'Charge, then release']],
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Street basketball',
      title: 'Court <em>Lights</em>',
      html: '<p>A rooftop cage after dark. Hold shoot to charge, release in the gold band for a swish, and keep a streak going for extra points.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'sixty', choices: [{ v: 'sixty', label: 'Sixty seconds' }, { v: 'twentyone', label: 'First to 21' }, { v: 'sudden', label: 'Make or miss' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + G.score + '</b></div><div>Makes<b>' + G.makes + '/' + G.attempts + '</b></div></div>'; },
    init(a) { arc = a; a.debug = dbg; a.menu(); },
    start(a, ch) { arc = a; newMatch(ch); },
    update, idle, render,
  });
})();
