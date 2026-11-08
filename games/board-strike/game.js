/*
 * Board Strike: a carrom board drawn in code. Original world on the Arcade
 * shell. Keyboard, mouse and touch all aim and charge the same striker.
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

  let arc;
  const DIFF = {
    easy: { time: 95, slide: 1.55 },
    normal: { time: 75, slide: 1.8 },
    hard: { time: 55, slide: 2.15 },
  };
  const G = {
    t: 0, time: 75, score: 0, combo: 0, pocketed: 0, queen: false, phase: 'aim',
    pieces: [], striker: null, charge: 0, holding: false, aim: 0, sx: 0,
    parts: [], floats: [], attract: true, moving: 0, mode: 'clock', diff: 'normal',
    flash: 0, shots: 0, hintT: 0, tg: null,
  };

  function mkPiece(x, y, kind) {
    const r = kind === 'striker' ? 0.062 : (kind === 'queen' ? 0.048 : 0.044);
    return { x, y, vx: 0, vy: 0, r, kind, in: false };
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
  }

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'clock';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    const D = DIFF[G.diff] || DIFF.normal;
    G.t = 0; G.time = D.time; G.score = 0; G.combo = 0; G.pocketed = 0; G.queen = false;
    G.phase = 'aim'; G.parts.length = 0; G.floats.length = 0; G.attract = !!attract; G.flash = 0;
    G.shots = 0; G.hintT = 0;
    layout();
  }

  function boardRect() {
    const s = min(arc.w, arc.h) * 0.78;
    return { s, x: (arc.w - s) / 2, y: (arc.h - s) / 2 + 8 };
  }
  function toPx(p) {
    const b = boardRect();
    return { x: b.x + (p.x * 0.5 + 0.5) * b.s, y: b.y + (p.y * 0.5 + 0.5) * b.s, u: b.s };
  }
  function fromPx(x, y) {
    const b = boardRect();
    return { x: ((x - b.x) / b.s) * 2 - 1, y: ((y - b.y) / b.s) * 2 - 1 };
  }

  function pockets() {
    const d = 0.86;
    return [{ x: -d, y: -d }, { x: d, y: -d }, { x: -d, y: d }, { x: d, y: d }];
  }

  function pop(x, y, col, n) {
    const p = toPx({ x, y });
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 40 + rnd() * 140;
      G.parts.push({
        x: p.x, y: p.y, vx: cos(a) * sp, vy: sin(a) * sp - 20,
        life: 0.45 + rnd() * 0.35, col, r: 1.6 + rnd() * 2.4,
      });
    }
  }

  function floatAt(x, y, text, col) {
    const p = toPx({ x, y });
    G.floats.push({ x: p.x, y: p.y, text, col: col || WARM, life: 0.9 });
  }

  function pocket(p) {
    if (p.in) return;
    p.in = true; p.vx = p.vy = 0;
    if (p.kind === 'striker') {
      if (G.mode !== 'practice') { G.score = max(0, G.score - 20); G.combo = 0; }
      arc.toast(G.mode === 'practice' ? 'Try again' : 'Foul', 'Striker in', 800);
      arc.sfx.tone(160, 0.12, { type: 'sawtooth', vol: 0.1 });
      G.flash = 0.18;
      return;
    }
    const pts = p.kind === 'queen' ? 50 : 15;
    const gained = pts * (1 + G.combo);
    G.score += gained; G.pocketed++; G.combo++;
    if (p.kind === 'queen') G.queen = true;
    pop(p.x, p.y, p.kind === 'queen' ? WARM : GOLD, 16);
    floatAt(p.x, p.y, '+' + Math.round(gained), p.kind === 'queen' ? WARM : GOLD);
    G.flash = 0.12;
    arc.sfx.tone(p.kind === 'queen' ? 880 : 520, 0.12, { type: 'sine', vol: 0.14 });
    arc.toast(p.kind === 'queen' ? 'Queen' : 'Pocket', '+' + pts, 700);
    if (G.pieces.every((c) => c.kind === 'striker' || c.in)) finish('Cleared');
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

  function collide(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, d = hypot(dx, dy), minD = a.r + b.r;
    if (d < 1e-6 || d >= minD) return;
    const nx = dx / d, ny = dy / d, overlap = minD - d;
    a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
    const dv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (dv > 0) return;
    const imp = dv * 0.92;
    a.vx += imp * nx; a.vy += imp * ny;
    b.vx -= imp * nx; b.vy -= imp * ny;
  }

  function stepPhysics(dt) {
    const all = G.pieces.concat(G.striker);
    const wall = 0.88;
    let moving = 0;
    all.forEach((p) => {
      if (p.in) return;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const slide = (DIFF[G.diff] || DIFF.normal).slide;
      p.vx *= Math.exp(-dt * slide); p.vy *= Math.exp(-dt * slide);
      if (abs(p.x) > wall) { p.x = wall * Math.sign(p.x); p.vx *= -0.72; }
      if (abs(p.y) > wall) { p.y = wall * Math.sign(p.y); p.vy *= -0.72; }
      if (hypot(p.vx, p.vy) > 0.02) moving++;
      pockets().forEach((k) => { if (hypot(p.x - k.x, p.y - k.y) < 0.09) pocket(p); });
    });
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      if (all[i].in || all[j].in) continue;
      collide(all[i], all[j]);
    }
    G.moving = moving;
    if (G.phase === 'roll' && moving === 0) {
      G.phase = 'aim';
      G.striker.x = G.sx; G.striker.y = 0.72; G.striker.vx = G.striker.vy = 0; G.striker.in = false;
      G.charge = 0; G.holding = false;
    }
  }

  function shoot() {
    const pwr = 1.1 + G.charge * 3.4;
    G.striker.vx = sin(G.aim) * pwr;
    G.striker.vy = -cos(G.aim) * pwr;
    G.phase = 'roll'; G.holding = false; G.charge = 0;
    if (!G.attract) G.shots++;
    arc.sfx.tone(240 + pwr * 40, 0.08, { type: 'triangle', vol: 0.12 });
  }

  // Tap & swipe on a phone, one finger, no buttons. The first 14 px of a drag
  // decide what it is: sideways slides the striker along the baseline, down
  // is a slingshot (pull back, the further the harder, let go to strike) and
  // up points at a target (hold to charge, or flick up to strike at once).
  // A tap on the baseline places the striker there; a tap above it aims.
  function gestTouch() {
    const p = arc.input.pointer;
    return !!arc.touchMode && arc.touchStyle === 'gesture' && !!p && p.type !== 'mouse';
  }

  function aimAt(x, y) {
    const w = fromPx(x, y);
    G.aim = clamp(Math.atan2(w.x - G.sx, -(w.y - 0.72)), -1.15, 1.15);
  }

  function readTouch(dt) {
    const inp = arc.input, gz = inp.gesture, b = boardRect(), u = 2 / b.s;
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
        G.charge = clamp((hypot(ox, oy) - 10) / (b.s * 0.42), 0, 1);
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
      if (abs(w.y - 0.72) < 0.14 && abs(w.x) < 0.9) G.sx = clamp(w.x, -0.62, 0.62);
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
    if (!charging) {
      G.sx = clamp(G.sx + ax.x * dt * 1.55, -0.62, 0.62);
      if (hover && abs(ax.x) < 0.08 && !p.down) {
        const w = fromPx(p.x, p.y);
        if (w.y > 0.45) G.sx = clamp(w.x, -0.62, 0.62);
      }
    }
    if (hover) {
      const w = fromPx(p.x, p.y);
      G.aim = clamp(Math.atan2(w.x - G.sx, -(w.y - 0.72)), -1.15, 1.15);
    } else {
      G.aim = clamp(G.aim + ax.x * dt * (charging ? 1.2 : 1.8), -1.15, 1.15);
    }
    G.striker.x = G.sx; G.striker.y = 0.72;
    const down = inp.action();
    if (down) {
      G.holding = true; G.charge = min(1, G.charge + dt * 1.05);
      if (G.charge >= 1) shoot();
    } else if (G.holding) shoot();
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
    stepPhysics(dt);
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 90 * dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i]; f.life -= dt; f.y -= 36 * dt;
      if (f.life <= 0) G.floats.splice(i, 1);
    }
  }

  function idle(dt) {
    G.attract = true; G.t += dt;
    if (!G.striker || G.phase === 'over' || G.pieces.every((c) => c.kind === 'striker' || c.in)) reset(true);
    if (G.phase === 'aim' && (G.t % 2.4) > 2.15) {
      G.aim = sin(G.t) * 0.4; G.charge = 0.55 + 0.2 * sin(G.t * 2); shoot();
    }
    stepPhysics(dt);
  }

  function rr(c, x, y, w, h, r) {
    r = min(r || 6, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function plate(c, x, y, w, h, r) {
    c.fillStyle = 'rgba(15,13,10,.72)'; rr(c, x, y, w, h, r); c.fill();
    c.strokeStyle = 'rgba(251,245,236,.12)'; c.stroke();
  }
  function txt(c, s, x, y, size, col, wgt, align, font) {
    c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
    c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
  }

  function drawRoom(c, w, h) {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#12101c'); sky.addColorStop(0.45, '#2a1a18'); sky.addColorStop(1, '#0f0d0a');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    // Soft lamp glow over the table.
    const lamp = c.createRadialGradient(w * 0.5, h * 0.18, 10, w * 0.5, h * 0.42, min(w, h) * 0.55);
    lamp.addColorStop(0, 'rgba(255,183,54,.16)'); lamp.addColorStop(1, 'rgba(255,183,54,0)');
    c.fillStyle = lamp; c.fillRect(0, 0, w, h);
    // Pendant lamp.
    c.strokeStyle = 'rgba(251,245,236,.25)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(w * 0.5, 0); c.lineTo(w * 0.5, h * 0.08); c.stroke();
    c.fillStyle = '#3a2a18'; rr(c, w * 0.5 - 22, h * 0.08, 44, 16, 4); c.fill();
    c.fillStyle = 'rgba(255,183,54,.55)'; c.beginPath(); c.moveTo(w * 0.5 - 18, h * 0.095); c.lineTo(w * 0.5 + 18, h * 0.095); c.lineTo(w * 0.5 + 28, h * 0.16); c.lineTo(w * 0.5 - 28, h * 0.16); c.closePath(); c.fill();
    // Side shelves.
    for (let side = 0; side < 2; side++) {
      const sx = side ? w - 54 : 10;
      c.fillStyle = '#1a1410'; rr(c, sx, h * 0.22, 44, h * 0.46, 6); c.fill();
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 ? '#5a3420' : '#3a2418';
        c.fillRect(sx + 6, h * 0.26 + i * 42, 32, 10);
        c.fillStyle = GOLD; c.globalAlpha = 0.35; c.fillRect(sx + 10, h * 0.28 + i * 42, 8, 4); c.globalAlpha = 1;
      }
    }
  }

  function drawBoard(c) {
    const b = boardRect(), s = b.s;
    c.fillStyle = 'rgba(0,0,0,.4)';
    rr(c, b.x - 6, b.y + 18, s + 40, s + 34, 22); c.fill();
    // Outer wood with grain stripes.
    const frame = c.createLinearGradient(b.x - 26, b.y - 26, b.x + s + 26, b.y + s + 26);
    frame.addColorStop(0, '#4a2e1c'); frame.addColorStop(0.45, '#6a4024'); frame.addColorStop(1, '#2e1a10');
    c.fillStyle = frame;
    rr(c, b.x - 26, b.y - 26, s + 52, s + 52, 22); c.fill();
    c.save();
    c.beginPath(); rr(c, b.x - 26, b.y - 26, s + 52, s + 52, 22); c.clip();
    c.strokeStyle = 'rgba(15,13,10,.18)'; c.lineWidth = 1;
    for (let i = 0; i < 28; i++) {
      const y = b.y - 30 + i * ((s + 60) / 28);
      c.beginPath(); c.moveTo(b.x - 30, y + sin(i) * 2); c.lineTo(b.x + s + 30, y - sin(i * 1.3) * 2); c.stroke();
    }
    c.restore();
    c.strokeStyle = GOLD; c.lineWidth = 2; c.globalAlpha = 0.5;
    rr(c, b.x - 16, b.y - 16, s + 32, s + 32, 14); c.stroke(); c.globalAlpha = 1;
    // Brass corner plates.
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
      const cx = b.x + s * 0.5 + dx * (s * 0.5 + 8);
      const cy = b.y + s * 0.5 + dy * (s * 0.5 + 8);
      c.fillStyle = '#a87830'; c.beginPath(); c.arc(cx, cy, 7, 0, TAU); c.fill();
      c.fillStyle = WARM; c.beginPath(); c.arc(cx, cy, 2.5, 0, TAU); c.fill();
    });
    const felt = c.createRadialGradient(b.x + s * 0.42, b.y + s * 0.38, s * 0.08, b.x + s * 0.5, b.y + s * 0.5, s * 0.72);
    felt.addColorStop(0, '#edd0b0'); felt.addColorStop(0.55, '#d4a882'); felt.addColorStop(1, '#b88860');
    c.fillStyle = felt;
    rr(c, b.x, b.y, s, s, 10); c.fill();
    // Soft felt noise bands.
    c.strokeStyle = 'rgba(90,52,32,.08)'; c.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      c.beginPath(); c.arc(b.x + s * 0.5, b.y + s * 0.5, s * (0.12 + i * 0.07), 0, TAU); c.stroke();
    }
    c.fillStyle = 'rgba(42,24,16,.14)';
    c.fillRect(b.x + s * 0.12, b.y + s * 0.78, s * 0.76, s * 0.08);
    c.strokeStyle = 'rgba(42,24,16,.55)'; c.lineWidth = 2;
    c.strokeRect(b.x + s * 0.16, b.y + s * 0.16, s * 0.68, s * 0.68);
    c.beginPath(); c.arc(b.x + s / 2, b.y + s / 2, s * 0.13, 0, TAU); c.stroke();
    c.beginPath(); c.arc(b.x + s / 2, b.y + s / 2, s * 0.05, 0, TAU); c.stroke();
    // Center flower.
    c.strokeStyle = 'rgba(42,24,16,.35)'; c.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      c.beginPath();
      c.moveTo(b.x + s / 2, b.y + s / 2);
      c.lineTo(b.x + s / 2 + cos(a) * s * 0.11, b.y + s / 2 + sin(a) * s * 0.11);
      c.stroke();
    }
    c.strokeStyle = 'rgba(42,24,16,.4)'; c.lineWidth = 1.5;
    [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]].forEach(([ux, uy]) => {
      const px = b.x + s * ux, py = b.y + s * uy;
      const dx = ux < 0.5 ? 1 : -1, dy = uy < 0.5 ? 1 : -1;
      c.beginPath(); c.moveTo(px + dx * 28, py); c.lineTo(px + dx * 8, py); c.lineTo(px, py + dy * 8); c.lineTo(px, py + dy * 28); c.stroke();
    });
    pockets().forEach((k) => {
      const p = toPx(k);
      c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.arc(p.x + 1, p.y + 3, s * 0.05, 0, TAU); c.fill();
      const hole = c.createRadialGradient(p.x, p.y, 1, p.x, p.y, s * 0.048);
      hole.addColorStop(0, '#1a1008'); hole.addColorStop(1, '#050302');
      c.fillStyle = hole; c.beginPath(); c.arc(p.x, p.y, s * 0.046, 0, TAU); c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 2.5; c.stroke();
      c.strokeStyle = 'rgba(255,183,54,.3)'; c.lineWidth = 1;
      c.beginPath(); c.arc(p.x, p.y, s * 0.062, 0, TAU); c.stroke();
    });
  }

  function drawPiece(c, p) {
    if (p.in) return;
    const q = toPx(p), r = p.r * q.u * 0.5;
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.arc(q.x + 2, q.y + 3, r, 0, TAU); c.fill();
    const g = c.createRadialGradient(q.x - r * 0.35, q.y - r * 0.4, 1, q.x, q.y, r);
    if (p.kind === 'striker') { g.addColorStop(0, '#ff9a72'); g.addColorStop(0.55, '#ff6940'); g.addColorStop(1, '#a82810'); }
    else if (p.kind === 'queen') { g.addColorStop(0, '#ffe9a8'); g.addColorStop(0.5, '#f0b040'); g.addColorStop(1, '#b86818'); }
    else if (p.kind === 'dark') { g.addColorStop(0, '#6a4630'); g.addColorStop(1, '#22140c'); }
    else { g.addColorStop(0, '#fffaf2'); g.addColorStop(1, '#c8b090'); }
    c.fillStyle = g; c.beginPath(); c.arc(q.x, q.y, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(15,13,10,.5)'; c.lineWidth = 1.3; c.stroke();
    c.strokeStyle = 'rgba(251,245,236,.28)'; c.lineWidth = 1;
    c.beginPath(); c.arc(q.x - r * 0.18, q.y - r * 0.22, r * 0.55, -0.4, 1.2); c.stroke();
    if (p.kind !== 'striker') {
      c.strokeStyle = 'rgba(15,13,10,.25)'; c.beginPath(); c.arc(q.x, q.y, r * 0.62, 0, TAU); c.stroke();
    }
    if (p.kind === 'queen') {
      c.fillStyle = '#1a120c'; c.beginPath(); c.arc(q.x, q.y, r * 0.34, 0, TAU); c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 1.2; c.beginPath(); c.arc(q.x, q.y, r * 0.2, 0, TAU); c.stroke();
    }
  }

  function drawAim(c) {
    if (G.phase !== 'aim' || !G.striker) return;
    const s = toPx(G.striker);
    const len = 48 + G.charge * 110;
    // Ghost power wedges.
    for (let i = 1; i <= 3; i++) {
      const L = len * (i / 3);
      c.strokeStyle = 'rgba(255,183,54,' + (0.08 + G.charge * 0.12) + ')';
      c.lineWidth = 6 - i; c.beginPath();
      c.moveTo(s.x, s.y); c.lineTo(s.x + sin(G.aim) * L, s.y - cos(G.aim) * L); c.stroke();
    }
    c.strokeStyle = 'rgba(255,183,54,' + (0.35 + G.charge * 0.55) + ')';
    c.lineWidth = 2.5; c.setLineDash([5, 7]);
    c.beginPath(); c.moveTo(s.x, s.y);
    c.lineTo(s.x + sin(G.aim) * len, s.y - cos(G.aim) * len); c.stroke();
    c.setLineDash([]);
    c.fillStyle = WARM; c.beginPath();
    c.arc(s.x + sin(G.aim) * len, s.y - cos(G.aim) * len, 3.5, 0, TAU); c.fill();
    if (G.tg && G.tg.mode === 'sling' && G.charge > 0.02) {
      // The pulled-back band, so the slingshot reads as a slingshot.
      const back = 14 + G.charge * 46;
      c.strokeStyle = 'rgba(251,245,236,.55)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(s.x - 12, s.y); c.lineTo(s.x - sin(G.aim) * back, s.y + cos(G.aim) * back); c.lineTo(s.x + 12, s.y); c.stroke();
    }
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

  function drawVignette(c, w, h) {
    const v = c.createRadialGradient(w * 0.5, h * 0.5, min(w, h) * 0.35, w * 0.5, h * 0.5, min(w, h) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,6,4,.55)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }

  // The shell hides its own hint on touch, so the gesture reminder is drawn
  // here for the first seconds of play.
  function drawTouchHint(c) {
    if (!arc.touchMode || arc.touchStyle === 'pads' || G.attract || G.hintT > 6.5) return;
    const a = arc.reducedMotion ? 1 : clamp(6.5 - G.hintT, 0, 1);
    const w = arc.w, b = boardRect();
    const lines = ['Slide sideways to place the striker', 'Pull back and let go to strike, or flick up'];
    c.save(); c.globalAlpha = a;
    c.font = '600 13px ' + F_UI;
    const mw = min(w - 24, max(c.measureText(lines[0]).width, c.measureText(lines[1]).width) + 32);
    const y = min(arc.h - 150, b.y + b.s + 44);
    plate(c, (w - mw) / 2, y - 10, mw, 50, 12);
    txt(c, lines[0], w / 2, y + 5, 13, INK, 600, 'center');
    txt(c, lines[1], w / 2, y + 25, 13, INK, 600, 'center');
    c.restore();
  }

  function render(c) {
    const w = arc.w, h = arc.h;
    drawRoom(c, w, h);
    drawBoard(c);
    G.pieces.forEach((p) => drawPiece(c, p));
    if (G.striker) drawPiece(c, G.striker);
    drawAim(c);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.2, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, p.r || 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
    G.floats.forEach((f) => {
      c.globalAlpha = clamp(f.life * 1.4, 0, 1);
      txt(c, f.text, f.x, f.y, 16, f.col, 700, 'center', F_DISP);
      c.globalAlpha = 1;
    });
    drawVignette(c, w, h);
    if (G.flash > 0) {
      c.fillStyle = 'rgba(255,183,54,' + (G.flash * 0.35) + ')';
      c.fillRect(0, 0, w, h);
    }
    if (arc.state === 'play' && !G.attract) { drawHUD(c); drawTouchHint(c); }
  }

  function dbg() {
    const s = G.striker || { x: 0, y: 0, vx: 0 };
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), time: +G.time.toFixed(2), pocketed: G.pocketed,
      sx: +G.sx.toFixed(3), aim: +G.aim.toFixed(3), charge: +G.charge.toFixed(3),
      vx: +s.vx.toFixed(2), moving: G.moving, attract: !!G.attract, shots: G.shots,
      touch: G.tg ? G.tg.mode || 'hold' : '',
    };
  }

  A.create({
    slug: 'board-strike', title: 'Board Strike', genre: 'Carrom',
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
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Carrom',
      title: 'Board <em>Strike</em>',
      html: '<p>Nine coins and a queen on a wooden board. Aim the striker, hold to charge, release to send it. Pocket them all, and keep the striker itself out of the holes.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'clock', choices: [{ v: 'clock', label: 'Against the clock' }, { v: 'clear', label: 'Clear the board' }, { v: 'practice', label: 'Practice' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Pocketed<b>' + G.pocketed + '</b></div></div>'; },
    init(a) { arc = a; a.debug = dbg; reset(true); a.menu(); },
    start(a, ch) {
      arc = a; reset(false, ch);
      const label = G.mode === 'clear' ? 'Clear the board' : G.mode === 'practice' ? 'Practice table' : ((DIFF[G.diff] || DIFF.normal).time + ' seconds');
      arc.toast(label, 'Board Strike', 1400);
    },
    update, idle, render,
  });
})();
