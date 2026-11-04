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
    parts: [], attract: true, moving: 0, mode: 'clock', diff: 'normal',
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
    G.sx = 0; G.aim = 0; G.charge = 0; G.holding = false; G.moving = 0;
  }

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'clock';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    const D = DIFF[G.diff] || DIFF.normal;
    G.t = 0; G.time = D.time; G.score = 0; G.combo = 0; G.pocketed = 0; G.queen = false;
    G.phase = 'aim'; G.parts.length = 0; G.attract = !!attract;
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
      const a = rnd() * TAU, sp = 40 + rnd() * 120;
      G.parts.push({ x: p.x, y: p.y, vx: cos(a) * sp, vy: sin(a) * sp, life: 0.4 + rnd() * 0.3, col });
    }
  }

  function pocket(p) {
    if (p.in) return;
    p.in = true; p.vx = p.vy = 0;
    if (p.kind === 'striker') {
      if (G.mode !== 'practice') { G.score = max(0, G.score - 20); G.combo = 0; }
      arc.toast(G.mode === 'practice' ? 'Try again' : 'Foul', 'Striker in', 800);
      arc.sfx.tone(160, 0.12, { type: 'sawtooth', vol: 0.1 });
      return;
    }
    const pts = p.kind === 'queen' ? 50 : 15;
    G.score += pts * (1 + G.combo); G.pocketed++; G.combo++;
    if (p.kind === 'queen') G.queen = true;
    pop(p.x, p.y, p.kind === 'queen' ? WARM : GOLD, 14);
    arc.sfx.tone(p.kind === 'queen' ? 880 : 520, 0.12, { type: 'sine', vol: 0.14 });
    arc.toast(p.kind === 'queen' ? 'Queen' : 'Pocket', '+' + pts, 700);
    if (G.pieces.every((c) => c.kind === 'striker' || c.in)) finish('Cleared');
  }

  function finish(why) {
    if (G.phase === 'over') return;
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
    arc.sfx.tone(240 + pwr * 40, 0.08, { type: 'triangle', vol: 0.12 });
  }

  function readAim(dt) {
    const inp = arc.input, p = inp.pointer, ax = inp.axis();
    G.sx = clamp(G.sx + ax.x * dt * 1.4, -0.62, 0.62);
    if (p && p.seen && abs(ax.x) < 0.08) {
      const w = fromPx(p.x, p.y);
      G.sx = clamp(w.x, -0.62, 0.62);
      G.aim = Math.atan2(w.x - G.striker.x, -(w.y - G.striker.y));
      G.aim = clamp(G.aim, -1.15, 1.15);
    } else {
      G.aim = clamp(G.aim + ax.x * dt * 1.8, -1.15, 1.15);
    }
    G.striker.x = G.sx; G.striker.y = 0.72;
    const down = inp.action();
    if (down) { G.holding = true; G.charge = min(1, G.charge + dt * 1.05); }
    else if (G.holding) shoot();
  }

  function update(dt) {
    G.t += dt;
    if (G.phase === 'over') return;
    if (G.mode === 'clock') {
      G.time -= dt;
      if (G.time <= 0) { G.time = 0; finish('Clock'); return; }
    }
    if (G.phase === 'aim') readAim(dt);
    stepPhysics(dt);
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
  }

  function idle(dt) {
    G.attract = true; G.t += dt;
    if (!G.striker) reset(true);
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

  function drawBoard(c) {
    const b = boardRect();
    c.fillStyle = '#2a1810';
    rr(c, b.x - 18, b.y - 18, b.s + 36, b.s + 36, 18); c.fill();
    c.fillStyle = '#c45a28';
    rr(c, b.x, b.y, b.s, b.s, 10); c.fill();
    c.fillStyle = '#d8b090';
    rr(c, b.x + b.s * 0.06, b.y + b.s * 0.06, b.s * 0.88, b.s * 0.88, 6); c.fill();
    c.strokeStyle = 'rgba(42,24,16,.45)'; c.lineWidth = 2;
    c.strokeRect(b.x + b.s * 0.18, b.y + b.s * 0.18, b.s * 0.64, b.s * 0.64);
    c.beginPath(); c.arc(b.x + b.s / 2, b.y + b.s / 2, b.s * 0.12, 0, TAU); c.stroke();
    pockets().forEach((k) => {
      const p = toPx(k);
      c.fillStyle = '#1a120c'; c.beginPath(); c.arc(p.x, p.y, b.s * 0.045, 0, TAU); c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 2; c.stroke();
    });
  }

  function drawPiece(c, p) {
    if (p.in) return;
    const q = toPx(p), r = p.r * q.u * 0.5;
    c.beginPath(); c.arc(q.x, q.y, r, 0, TAU);
    c.fillStyle = p.kind === 'striker' ? PRIM : p.kind === 'queen' ? WARM : p.kind === 'dark' ? '#3a2418' : INK;
    c.fill();
    c.strokeStyle = 'rgba(15,13,10,.4)'; c.lineWidth = 1; c.stroke();
    if (p.kind === 'queen') { c.fillStyle = '#1a120c'; c.beginPath(); c.arc(q.x, q.y, r * 0.35, 0, TAU); c.fill(); }
  }

  function drawAim(c) {
    if (G.phase !== 'aim' || !G.striker) return;
    const s = toPx(G.striker);
    const len = 40 + G.charge * 90;
    c.strokeStyle = 'rgba(255,183,54,' + (0.35 + G.charge * 0.5) + ')';
    c.lineWidth = 2; c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(s.x, s.y);
    c.lineTo(s.x + sin(G.aim) * len, s.y - cos(G.aim) * len); c.stroke();
    c.setLineDash([]);
    const pad = arc.hudPad ? arc.hudPad() : { bottom: 52 };
    const bw = min(220, arc.w - 40), bx = arc.w / 2 - bw / 2, by = arc.h - pad.bottom - 22;
    plate(c, bx - 8, by - 10, bw + 16, 28, 10);
    c.fillStyle = 'rgba(251,245,236,.12)'; rr(c, bx, by, bw, 8, 4); c.fill();
    c.fillStyle = G.charge > 0.7 ? PRIM : WARM;
    rr(c, bx, by, max(4, bw * G.charge), 8, 4); c.fill();
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    plate(c, pad.left, pad.top, 150, 64, 12);
    txt(c, 'POINTS', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 58, pad.top, 116, 44, 12);
    const clock = G.mode === 'clock' ? (Math.max(0, G.time | 0) + 's') : (G.mode === 'practice' ? 'PRACTICE' : 'CLEAR');
    txt(c, clock, w / 2, pad.top + 22, G.mode === 'clock' ? 20 : 12, G.mode === 'clock' && G.time < 12 ? PRIM : INK, 500, 'center', G.mode === 'clock' ? F_DISP : F_MONO);
    plate(c, w - pad.right - 132, pad.top, 132, 44, 12);
    txt(c, G.pocketed + ' pocketed', w - pad.right - 66, pad.top + 22, 12, WARM, 600, 'center', F_MONO);
  }

  function render(c) {
    const w = arc.w, h = arc.h;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1630'); g.addColorStop(1, '#1a120c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    drawBoard(c);
    G.pieces.forEach((p) => drawPiece(c, p));
    if (G.striker) drawPiece(c, G.striker);
    drawAim(c);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.4, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
    if (arc.state === 'play' && !G.attract) drawHUD(c);
  }

  function dbg() {
    const s = G.striker || { x: 0, y: 0, vx: 0 };
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), time: +G.time.toFixed(2), pocketed: G.pocketed,
      sx: +G.sx.toFixed(3), aim: +G.aim.toFixed(3), charge: +G.charge.toFixed(3),
      vx: +s.vx.toFixed(2), moving: G.moving, attract: !!G.attract,
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
    mouse: { steer: 'x', cursor: 'crosshair', keys: [['Move mouse', 'Place and aim the striker'], ['Click / hold', 'Charge, then release']] },
    touch: { stick: true, pads: [{ label: 'Strike', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Place and aim'], ['Strike (hold)', 'Charge, then release']],
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
