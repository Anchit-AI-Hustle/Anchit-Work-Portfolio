/*
 * Rally Cage: squash on a rooftop cage court. Original world on the Arcade
 * shell. The paddle follows mouse, arrows or the on-screen stick.
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
    easy: { spd: 0.82, cap: 0.68 },
    normal: { spd: 1, cap: 0.85 },
    hard: { spd: 1.22, cap: 1.08 },
  };
  const G = {
    t: 0, score: 0, lives: 3, maxLives: 3, rally: 0, bestRally: 0, px: 0.5,
    ball: null, lamps: [], parts: [], phase: 'serve', attract: true,
    mode: 'lives', diff: 'normal',
  };

  function serve() {
    const dir = rnd() > 0.5 ? 1 : -1;
    const spd = (G.D || DIFF.normal).spd;
    G.ball = { x: 0.5, y: 0.55, vx: (0.22 + rnd() * 0.12) * dir * spd, vy: (-0.42 - rnd() * 0.08) * spd, r: 0.018 };
    G.phase = 'play';
  }

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'lives';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    G.t = 0; G.score = 0; G.rally = 0; G.bestRally = 0; G.px = 0.5;
    G.maxLives = G.mode === 'survival' ? 1 : 3;
    G.lives = G.maxLives;
    G.parts = []; G.attract = !!attract; G.phase = 'serve';
    G.lamps = [];
    for (let i = 0; i < 8; i++) G.lamps.push({ x: 0.14 + (i % 4) * 0.24, y: 0.16 + ((i / 4) | 0) * 0.12, on: true });
    serve();
    if (attract) G.phase = 'play';
  }

  function pop(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 50 + rnd() * 140;
      G.parts.push({ x: x * arc.w, y: y * arc.h, vx: cos(a) * sp, vy: sin(a) * sp, life: 0.4 + rnd() * 0.25, col });
    }
  }

  function endGame(why, title) {
    if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
    G.phase = 'over';
    arc.over({
      eyebrow: why, title: title,
      score: Math.round(G.score), scoreLabel: 'Score',
      html: '<p>Best rally ' + G.bestRally + '. ' + (G.lamps.filter((l) => !l.on).length) + ' lamps out.</p>',
      again: 'Serve again',
    });
  }

  function drop() {
    G.lives--; G.rally = 0;
    arc.shake = 7; arc.sfx.tone(140, 0.16, { type: 'sawtooth', slide: 70, vol: 0.12 });
    if (G.lives <= 0) endGame('Rally broken', 'Cage <em>quiet</em>');
    else {
      arc.toast('Let it drop', G.lives + ' left', 800);
      G.phase = 'serve';
      G.ball.x = 0.5; G.ball.y = 0.5; G.ball.vx = 0; G.ball.vy = 0;
    }
  }

  function update(dt) {
    if (G.phase === 'over') return;
    G.t += dt;
    const inp = arc.input, ax = inp.axis(), p = inp.pointer;
    G.px = clamp(G.px + ax.x * dt * 2.2, 0.1, 0.9);
    if (p && p.seen && abs(ax.x) < 0.08) G.px = lerp(G.px, clamp(p.nx, 0.1, 0.9), 1 - Math.exp(-dt * 16));
    if (G.phase === 'serve') {
      if (inp.actionHit() || inp.hit('ArrowUp', 'KeyW')) serve();
      return;
    }
    const b = G.ball;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const pad = arc.hudPad ? arc.hudPad() : { top: 12, bottom: 52 };
    const top = (pad.top + 70) / arc.h + b.r, bot = 0.86, left = 0.06 + b.r, right = 0.94 - b.r;
    if (b.x < left) { b.x = left; b.vx = abs(b.vx); arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.06 }); }
    if (b.x > right) { b.x = right; b.vx = -abs(b.vx); arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.06 }); }
    if (b.y < top) { b.y = top; b.vy = abs(b.vy); arc.sfx.tone(480, 0.04, { type: 'square', vol: 0.06 }); }
    G.lamps.forEach((l) => {
      if (!l.on) return;
      if (hypot(b.x - l.x, b.y - l.y) < 0.045) {
        l.on = false; G.score += 30; pop(l.x, l.y, WARM, 10);
        b.vy = abs(b.vy) * 1.02; arc.sfx.tone(880, 0.1, { type: 'sine', vol: 0.12 });
      }
    });
    if (G.lamps.length && G.lamps.every((l) => !l.on)) {
      G.lamps.forEach((l) => { l.on = true; });
      G.score += 50;
      arc.toast('Lamps back', '+50', 700);
    }
    const pw = 0.14, py = bot;
    if (b.y > py - 0.035 && b.y < py + 0.05 && abs(b.x - G.px) < pw && b.vy > 0) {
      b.y = py - 0.035;
      const off = (b.x - G.px) / pw;
      b.vx += off * 0.32;
      b.vy = -abs(b.vy) * 1.03;
      const sp = hypot(b.vx, b.vy), cap = (G.D || DIFF.normal).cap;
      if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
      G.rally++; G.bestRally = max(G.bestRally, G.rally); G.score += 5 + G.rally;
      arc.sfx.tone(320 + G.rally * 20, 0.06, { type: 'triangle', vol: 0.1 });
      if (G.mode === 'eleven' && G.rally >= 11) endGame('Rally of 11', 'Cage <em>held</em>');
    } else if (b.y > 1.02) drop();
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
  }

  function idle(dt) {
    G.attract = true;
    if (!G.ball) reset(true);
    G.t += dt; G.px = 0.5 + sin(G.t * 1.1) * 0.28;
    const b = G.ball;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 0.08 || b.x > 0.92) b.vx *= -1;
    if (b.y < 0.18 || b.y > 0.82) b.vy *= -1;
    b.x = clamp(b.x, 0.08, 0.92); b.y = clamp(b.y, 0.18, 0.82);
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

  function court() {
    const pad = arc.hudPad ? arc.hudPad() : { top: 12, bottom: 52 };
    return { x: arc.w * 0.06, y: pad.top + 70, w: arc.w * 0.88, h: arc.h * 0.86 - (pad.top + 70) };
  }

  function drawCourt(c) {
    const w = arc.w, h = arc.h;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#14122a'); g.addColorStop(0.45, '#3a2450'); g.addColorStop(1, '#1a120c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = WARM; c.beginPath(); c.arc(w * 0.78, h * 0.12, 14, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,183,54,.1)'; c.beginPath(); c.arc(w * 0.78, h * 0.12, 60, 0, TAU); c.fill();
    const r = court();
    // Cage mesh behind the court.
    c.strokeStyle = 'rgba(251,245,236,.08)'; c.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      c.beginPath(); c.moveTo(r.x + i * r.w / 13, r.y - 40); c.lineTo(r.x + i * r.w / 13, r.y + r.h + 10); c.stroke();
    }
    for (let i = 0; i < 10; i++) {
      c.beginPath(); c.moveTo(r.x - 10, r.y + i * r.h / 9); c.lineTo(r.x + r.w + 10, r.y + i * r.h / 9); c.stroke();
    }
    const floor = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    floor.addColorStop(0, '#355035'); floor.addColorStop(1, '#1e2a1e');
    c.fillStyle = floor; rr(c, r.x, r.y, r.w, r.h, 10); c.fill();
    c.strokeStyle = 'rgba(251,245,236,.4)'; c.lineWidth = 3; c.stroke();
    c.strokeStyle = GOLD; c.globalAlpha = 0.35; c.lineWidth = 1.5;
    rr(c, r.x + 8, r.y + 8, r.w - 16, r.h - 16, 6); c.stroke(); c.globalAlpha = 1;
    c.strokeStyle = 'rgba(251,245,236,.18)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(r.x, r.y + r.h * 0.5); c.lineTo(r.x + r.w, r.y + r.h * 0.5); c.stroke();
    c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h * 0.5, min(40, r.w * 0.08), 0, TAU); c.stroke();
    // Side boards.
    c.fillStyle = 'rgba(42,32,28,.85)';
    c.fillRect(r.x - 10, r.y, 10, r.h); c.fillRect(r.x + r.w, r.y, 10, r.h);
  }

  function drawLamps(c) {
    G.lamps.forEach((l) => {
      const x = l.x * arc.w, y = l.y * arc.h;
      if (!l.on) {
        c.fillStyle = 'rgba(251,245,236,.08)'; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill();
        return;
      }
      c.fillStyle = 'rgba(255,183,54,.2)'; c.beginPath(); c.arc(x, y, 18, 0, TAU); c.fill();
      c.fillStyle = WARM; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill();
      c.fillStyle = '#fff8e8'; c.beginPath(); c.arc(x - 1.5, y - 1.5, 2, 0, TAU); c.fill();
    });
  }

  function drawPaddle(c) {
    const r = court();
    const x = G.px * arc.w, y = r.y + r.h - 20, w = arc.w * 0.26;
    c.fillStyle = 'rgba(0,0,0,.3)'; rr(c, x - w / 2 + 2, y + 4, w, 12, 6); c.fill();
    const g = c.createLinearGradient(x, y, x, y + 14);
    g.addColorStop(0, '#ff8a60'); g.addColorStop(1, '#c43a18');
    c.fillStyle = g; rr(c, x - w / 2, y, w, 14, 7); c.fill();
    c.fillStyle = GOLD; c.fillRect(x - w / 2 + 8, y + 4, w - 16, 3);
  }

  function drawBall(c) {
    const b = G.ball; if (!b) return;
    const x = b.x * arc.w, y = b.y * arc.h, r = max(7, b.r * arc.w);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(x + 2, y + 3, r, 0, TAU); c.fill();
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, '#fff8ee'); g.addColorStop(1, '#d8c8b0');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(15,13,10,.35)'; c.stroke();
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    plate(c, pad.left, pad.top, 150, 64, 12);
    txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 70, pad.top, 140, 44, 12);
    txt(c, G.mode === 'eleven' ? ('RALLY ' + G.rally + ' / 11') : ('RALLY ' + G.rally), w / 2, pad.top + 22, 13, G.rally >= 6 ? WARM : INK, 600, 'center', F_MONO);
    let hx = w - pad.right - 18;
    for (let i = 0; i < G.maxLives; i++) {
      c.fillStyle = i < G.lives ? PRIM : 'rgba(251,245,236,.15)';
      c.beginPath(); c.arc(hx - i * 18, pad.top + 22, 6, 0, TAU); c.fill();
    }
    if (G.phase === 'serve' && !G.attract) {
      txt(c, 'CLICK OR SPACE TO SERVE', w / 2, arc.h * 0.5, 14, GOLD, 600, 'center', F_MONO);
    }
  }

  function render(c) {
    drawCourt(c);
    drawLamps(c);
    drawPaddle(c);
    drawBall(c);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.4, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
    if (arc.state === 'play' && !G.attract) drawHUD(c);
  }

  function dbg() {
    const b = G.ball || { x: 0, y: 0 };
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), lives: G.lives, rally: G.rally,
      px: +G.px.toFixed(3), bx: +b.x.toFixed(3), by: +b.y.toFixed(3), attract: !!G.attract, t: +G.t.toFixed(2),
    };
  }

  A.create({
    slug: 'rally-cage', title: 'Rally Cage', genre: 'Rooftop squash',
    hint: 'Mouse or arrows move the paddle   click or Space to serve',
    touchHint: 'Stick slides the paddle, tap Serve to start the rally',
    keys: [
      ['Left / Right / A D', 'Slide the paddle'],
      ['Space / click', 'Serve'],
    ],
    mouse: { cursor: 'none', keys: [['Move mouse', 'The paddle follows'], ['Click', 'Serve']] },
    touch: { stick: true, pads: [{ label: 'Serve', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Slide the paddle'], ['Serve', 'Start the rally']],
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
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Rally<b>' + G.rally + '</b></div></div>'; },
    onMenu(a) { arc = a; reset(true); },
    init(a) { arc = a; a.debug = dbg; G.D = DIFF.normal; reset(true); a.menu(); },
    start(a, ch) {
      arc = a; reset(false, ch);
      const label = G.mode === 'eleven' ? 'Hold a rally of 11' : G.mode === 'survival' ? 'One life' : 'Three lives';
      arc.toast(label, 'Rally Cage', 1400);
    },
    update, idle, render,
  });
})();
