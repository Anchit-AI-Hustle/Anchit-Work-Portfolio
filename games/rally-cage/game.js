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
  const G = {
    t: 0, score: 0, lives: 3, rally: 0, bestRally: 0, px: 0.5,
    ball: null, lamps: [], parts: [], phase: 'serve', attract: true,
  };

  function serve() {
    const dir = rnd() > 0.5 ? 1 : -1;
    G.ball = { x: 0.5, y: 0.55, vx: (0.22 + rnd() * 0.12) * dir, vy: -0.42 - rnd() * 0.08, r: 0.018 };
    G.phase = 'play';
  }

  function reset(attract) {
    G.t = 0; G.score = 0; G.lives = 3; G.rally = 0; G.bestRally = 0; G.px = 0.5;
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

  function drop() {
    G.lives--; G.rally = 0;
    arc.shake = 7; arc.sfx.tone(140, 0.16, { type: 'sawtooth', slide: 70, vol: 0.12 });
    if (G.lives <= 0) {
      G.phase = 'over';
      arc.over({
        eyebrow: 'Rally broken', title: 'Cage <em>quiet</em>',
        score: Math.round(G.score), scoreLabel: 'Score',
        html: '<p>Best rally ' + G.bestRally + '. ' + (G.lamps.filter((l) => !l.on).length) + ' lamps out.</p>',
        again: 'Serve again',
      });
    } else {
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
    const top = (pad.top + 70) / arc.h, bot = 0.86, left = 0.06, right = 0.94;
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
    const pw = 0.11, py = bot;
    if (b.y > py - 0.03 && b.y < py + 0.04 && abs(b.x - G.px) < pw && b.vy > 0) {
      b.y = py - 0.03;
      const off = (b.x - G.px) / pw;
      b.vx += off * 0.35;
      b.vy = -abs(b.vy) * 1.03;
      const sp = hypot(b.vx, b.vy), cap = 0.85;
      if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
      G.rally++; G.bestRally = max(G.bestRally, G.rally); G.score += 5 + G.rally;
      arc.sfx.tone(320 + G.rally * 20, 0.06, { type: 'triangle', vol: 0.1 });
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
    g.addColorStop(0, '#1a1630'); g.addColorStop(0.55, '#3a2450'); g.addColorStop(1, '#1a120c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = WARM; c.beginPath(); c.arc(w * 0.8, h * 0.18, 16, 0, TAU); c.fill();
    const r = court();
    c.fillStyle = '#2a3a2a'; rr(c, r.x, r.y, r.w, r.h, 8); c.fill();
    c.strokeStyle = 'rgba(251,245,236,.28)'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = 'rgba(251,245,236,.12)'; c.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      c.beginPath(); c.moveTo(r.x + i * r.w / 5, r.y); c.lineTo(r.x + i * r.w / 5, r.y + r.h); c.stroke();
    }
  }

  function drawLamps(c) {
    G.lamps.forEach((l) => {
      const x = l.x * arc.w, y = l.y * arc.h;
      if (!l.on) return;
      c.fillStyle = 'rgba(255,183,54,.18)'; c.beginPath(); c.arc(x, y, 16, 0, TAU); c.fill();
      c.fillStyle = WARM; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill();
    });
  }

  function drawPaddle(c) {
    const r = court();
    const x = G.px * arc.w, y = r.y + r.h - 18, w = arc.w * 0.2;
    c.fillStyle = PRIM; rr(c, x - w / 2, y, w, 12, 6); c.fill();
  }

  function drawBall(c) {
    const b = G.ball; if (!b) return;
    c.fillStyle = INK; c.beginPath(); c.arc(b.x * arc.w, b.y * arc.h, max(6, b.r * arc.w), 0, TAU); c.fill();
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    plate(c, pad.left, pad.top, 150, 64, 12);
    txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 70, pad.top, 140, 44, 12);
    txt(c, 'RALLY ' + G.rally, w / 2, pad.top + 22, 14, G.rally >= 6 ? WARM : INK, 600, 'center', F_MONO);
    let hx = w - pad.right - 18;
    for (let i = 0; i < 3; i++) {
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
      phase: G.phase, score: Math.round(G.score), lives: G.lives, rally: G.rally,
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
    mouse: { steer: 'x', cursor: 'none', keys: [['Move mouse', 'The paddle follows'], ['Click', 'Serve']] },
    touch: { stick: true, pads: [{ label: 'Serve', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Slide the paddle'], ['Serve', 'Start the rally']],
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Rooftop squash',
      title: 'Rally <em>Cage</em>',
      html: '<p>A floodlit cage on the terrace. Keep the ball off the floor, grow the rally, and clip the hanging lamps for extra points. Three lives.</p>',
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Rally<b>' + G.rally + '</b></div></div>'; },
    init(a) { arc = a; a.debug = dbg; reset(true); a.menu(); },
    start(a) { arc = a; reset(false); arc.toast('Serve when ready', 'Rally Cage', 1400); },
    update, idle, render,
  });
})();
