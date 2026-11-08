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
    ball: null, lamps: [], parts: [], floats: [], trail: [], phase: 'serve', attract: true,
    mode: 'lives', diff: 'normal', flash: 0,
  };

  function serve() {
    const dir = rnd() > 0.5 ? 1 : -1;
    const spd = (G.D || DIFF.normal).spd;
    G.ball = { x: 0.5, y: 0.55, vx: (0.22 + rnd() * 0.12) * dir * spd, vy: (-0.42 - rnd() * 0.08) * spd, r: 0.018 };
    G.phase = 'play'; G.trail = [];
  }

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'lives';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    G.t = 0; G.score = 0; G.rally = 0; G.bestRally = 0; G.px = 0.5; G.touchDrag = 0; G.touchServes = 0;
    G.maxLives = G.mode === 'survival' ? 1 : 3;
    G.lives = G.maxLives;
    G.parts = []; G.floats = []; G.trail = []; G.attract = !!attract; G.phase = 'serve'; G.flash = 0;
    G.lamps = [];
    // Lamps sit inside the green court, not in the sky strip above it.
    for (let i = 0; i < 8; i++) G.lamps.push({ x: 0.18 + (i % 4) * 0.21, y: 0.28 + ((i / 4) | 0) * 0.14, on: true });
    serve();
    if (attract) G.phase = 'play';
  }

  function pop(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 50 + rnd() * 140;
      G.parts.push({ x: x * arc.w, y: y * arc.h, vx: cos(a) * sp, vy: sin(a) * sp, life: 0.4 + rnd() * 0.25, col, r: 1.5 + rnd() * 2 });
    }
  }

  function floatTxt(x, y, text, col) {
    G.floats.push({ x: x * arc.w, y: y * arc.h, text, col: col || WARM, life: 0.8 });
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
    G.lives--; G.rally = 0; G.flash = 0.18;
    arc.shake = 7; arc.sfx.tone(140, 0.16, { type: 'sawtooth', slide: 70, vol: 0.12 });
    if (G.lives <= 0) endGame('Rally broken', 'Cage <em>quiet</em>');
    else {
      arc.toast('Let it drop', G.lives + ' left', 800);
      G.phase = 'serve';
      G.ball.x = 0.5; G.ball.y = 0.5; G.ball.vx = 0; G.ball.vy = 0;
      G.trail = [];
    }
  }

  function update(dt) {
    if (G.phase === 'over') return;
    G.t += dt; G.flash = max(0, G.flash - dt);
    const inp = arc.input, ax = inp.axis(), p = inp.pointer;
    G.px = clamp(G.px + ax.x * dt * 2.2, 0.1, 0.9);
    // Tap & swipe: the paddle sits under the finger, anywhere on the screen.
    // A finger only serves on a tap or a flick up, so dragging never serves.
    const gest = gestStyle() && p && p.type !== 'mouse';
    if (gest && inp.gesture.active) { G.touchDrag += dt; G.px = lerp(G.px, clamp(p.nx, 0.1, 0.9), 1 - Math.exp(-dt * 26)); }
    else if (p && p.seen && abs(ax.x) < 0.08) G.px = lerp(G.px, clamp(p.nx, 0.1, 0.9), 1 - Math.exp(-dt * 16));
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
    b.x += b.vx * dt; b.y += b.vy * dt;
    G.trail.push({ x: b.x, y: b.y, life: 0.25 });
    if (G.trail.length > 14) G.trail.shift();
    const pad = arc.hudPad ? arc.hudPad() : { top: 12, bottom: 52 };
    const top = (pad.top + 70) / arc.h + b.r, bot = 0.86, left = 0.06 + b.r, right = 0.94 - b.r;
    if (b.x < left) { b.x = left; b.vx = abs(b.vx); arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.06 }); }
    if (b.x > right) { b.x = right; b.vx = -abs(b.vx); arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.06 }); }
    if (b.y < top) { b.y = top; b.vy = abs(b.vy); arc.sfx.tone(480, 0.04, { type: 'square', vol: 0.06 }); }
    G.lamps.forEach((l) => {
      if (!l.on) return;
      if (hypot(b.x - l.x, b.y - l.y) < 0.045) {
        l.on = false; G.score += 30; pop(l.x, l.y, WARM, 12);
        floatTxt(l.x, l.y, '+30', WARM);
        b.vy = abs(b.vy) * 1.02; arc.sfx.tone(880, 0.1, { type: 'sine', vol: 0.12 });
        G.flash = 0.1;
      }
    });
    if (G.lamps.length && G.lamps.every((l) => !l.on)) {
      G.lamps.forEach((l) => { l.on = true; });
      G.score += 50;
      floatTxt(0.5, 0.35, '+50 lamps', GOLD);
      arc.toast('Lamps back', '+50', 700);
    }
    // Half-width matches drawPaddle (0.26 of the screen).
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
      pop(b.x, b.y, PRIM, 6);
      arc.sfx.tone(320 + G.rally * 20, 0.06, { type: 'triangle', vol: 0.1 });
      if (G.mode === 'eleven' && G.rally >= 11) endGame('Rally of 11', 'Cage <em>held</em>');
    } else if (b.y > 1.02) drop();
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i]; f.life -= dt; f.y -= 34 * dt;
      if (f.life <= 0) G.floats.splice(i, 1);
    }
    G.trail.forEach((t) => { t.life -= dt; });
    G.trail = G.trail.filter((t) => t.life > 0);
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

  function drawSkyline(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0e1020'); g.addColorStop(0.4, '#2a1a38'); g.addColorStop(0.7, '#4a2848'); g.addColorStop(1, '#1a120c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = WARM; c.beginPath(); c.arc(w * 0.82, h * 0.1, 16, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,183,54,.12)'; c.beginPath(); c.arc(w * 0.82, h * 0.1, 70, 0, TAU); c.fill();
    // City blocks behind the cage.
    for (let i = 0; i < 16; i++) {
      const bx = i * (w / 15) - 10;
      const bh = 40 + ((i * 37) % 80);
      c.fillStyle = 'rgba(12,10,16,.85)';
      c.fillRect(bx, h * 0.28 - bh * 0.35, w / 14 + 4, bh);
      if (i % 2 === 0) {
        c.fillStyle = 'rgba(255,183,54,.15)';
        for (let r = 0; r < 3; r++) for (let col = 0; col < 2; col++) {
          c.fillRect(bx + 6 + col * 10, h * 0.28 - bh * 0.35 + 8 + r * 12, 5, 6);
        }
      }
    }
  }

  function drawCourt(c) {
    const w = arc.w, h = arc.h;
    drawSkyline(c, w, h);
    const r = court();
    // Cage posts.
    c.fillStyle = '#2a2420';
    [[r.x - 6, r.y - 30], [r.x + r.w + 2, r.y - 30], [r.x - 6, r.y + r.h - 10], [r.x + r.w + 2, r.y + r.h - 10]].forEach(([px, py]) => {
      c.fillRect(px, py, 8, 40);
      c.fillStyle = GOLD; c.fillRect(px + 1, py, 6, 3); c.fillStyle = '#2a2420';
    });
    // Cage mesh.
    c.strokeStyle = 'rgba(251,245,236,.1)'; c.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      c.beginPath(); c.moveTo(r.x + i * r.w / 15, r.y - 36); c.lineTo(r.x + i * r.w / 15, r.y + r.h + 14); c.stroke();
    }
    for (let i = 0; i < 12; i++) {
      c.beginPath(); c.moveTo(r.x - 14, r.y - 20 + i * (r.h + 40) / 11); c.lineTo(r.x + r.w + 14, r.y - 20 + i * (r.h + 40) / 11); c.stroke();
    }
    // Floodlights.
    [[r.x + 20, r.y - 28], [r.x + r.w - 20, r.y - 28]].forEach(([lx, ly]) => {
      c.fillStyle = '#3a3228'; c.fillRect(lx - 10, ly - 8, 20, 8);
      c.fillStyle = 'rgba(255,248,232,.7)'; c.beginPath(); c.moveTo(lx - 8, ly); c.lineTo(lx + 8, ly); c.lineTo(lx + 22, ly + 50); c.lineTo(lx - 22, ly + 50); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,183,54,.08)'; c.beginPath(); c.moveTo(lx - 8, ly); c.lineTo(lx + 8, ly); c.lineTo(lx + 40, r.y + r.h); c.lineTo(lx - 40, r.y + r.h); c.closePath(); c.fill();
    });
    const floor = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    floor.addColorStop(0, '#3a5a3a'); floor.addColorStop(0.5, '#2a402a'); floor.addColorStop(1, '#1a281a');
    c.fillStyle = floor; rr(c, r.x, r.y, r.w, r.h, 10); c.fill();
    // Court texture.
    c.strokeStyle = 'rgba(15,13,10,.12)'; c.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      c.beginPath(); c.moveTo(r.x + 10, r.y + 12 + i * r.h / 8); c.lineTo(r.x + r.w - 10, r.y + 8 + i * r.h / 8); c.stroke();
    }
    c.strokeStyle = 'rgba(251,245,236,.45)'; c.lineWidth = 3; c.stroke();
    c.strokeStyle = GOLD; c.globalAlpha = 0.4; c.lineWidth = 1.5;
    rr(c, r.x + 8, r.y + 8, r.w - 16, r.h - 16, 6); c.stroke(); c.globalAlpha = 1;
    c.strokeStyle = 'rgba(251,245,236,.22)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(r.x, r.y + r.h * 0.5); c.lineTo(r.x + r.w, r.y + r.h * 0.5); c.stroke();
    c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h * 0.5, min(44, r.w * 0.09), 0, TAU); c.stroke();
    // Service boxes.
    c.strokeRect(r.x + r.w * 0.2, r.y + r.h * 0.35, r.w * 0.6, r.h * 0.3);
    c.fillStyle = 'rgba(42,32,28,.9)';
    c.fillRect(r.x - 12, r.y, 12, r.h); c.fillRect(r.x + r.w, r.y, 12, r.h);
    c.fillStyle = GOLD; c.globalAlpha = 0.35;
    c.fillRect(r.x - 12, r.y, 12, 4); c.fillRect(r.x + r.w, r.y, 12, 4); c.globalAlpha = 1;
  }

  function drawLamps(c) {
    G.lamps.forEach((l) => {
      const x = l.x * arc.w, y = l.y * arc.h;
      // Cord.
      c.strokeStyle = 'rgba(251,245,236,.25)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, y - 28); c.lineTo(x, y - 8); c.stroke();
      c.fillStyle = '#3a3228'; c.fillRect(x - 6, y - 10, 12, 5);
      if (!l.on) {
        c.fillStyle = 'rgba(251,245,236,.1)'; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill();
        return;
      }
      c.fillStyle = 'rgba(255,183,54,.22)'; c.beginPath(); c.arc(x, y, 20, 0, TAU); c.fill();
      const bulb = c.createRadialGradient(x - 2, y - 2, 1, x, y, 7);
      bulb.addColorStop(0, '#fff8e8'); bulb.addColorStop(1, WARM);
      c.fillStyle = bulb; c.beginPath(); c.arc(x, y, 6.5, 0, TAU); c.fill();
    });
  }

  function drawPaddle(c) {
    const r = court();
    const x = G.px * arc.w, y = r.y + r.h - 22, w = arc.w * 0.26;
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y + 16, w * 0.48, 6, 0, 0, TAU); c.fill();
    // Racket face.
    const g = c.createLinearGradient(x - w / 2, y, x + w / 2, y + 16);
    g.addColorStop(0, '#ff9a72'); g.addColorStop(0.5, PRIM); g.addColorStop(1, '#a82810');
    c.fillStyle = g; rr(c, x - w / 2, y, w, 16, 8); c.fill();
    c.strokeStyle = GOLD; c.lineWidth = 2; c.stroke();
    // Grip tape.
    c.fillStyle = '#1a120c'; rr(c, x - 10, y + 4, 20, 8, 3); c.fill();
    c.fillStyle = GOLD; c.fillRect(x - w / 2 + 10, y + 5, w - 20, 2);
    // Sweet spot mark.
    c.strokeStyle = 'rgba(251,245,236,.25)'; c.beginPath(); c.arc(x, y + 8, 5, 0, TAU); c.stroke();
  }

  function drawBall(c) {
    const b = G.ball; if (!b) return;
    G.trail.forEach((t, i) => {
      c.globalAlpha = clamp(t.life * 2, 0, 0.35);
      c.fillStyle = INK;
      c.beginPath(); c.arc(t.x * arc.w, t.y * arc.h, 3 + i * 0.15, 0, TAU); c.fill();
      c.globalAlpha = 1;
    });
    const x = b.x * arc.w, y = b.y * arc.h, r = max(7, b.r * arc.w);
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.arc(x + 2, y + 3, r, 0, TAU); c.fill();
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
    g.addColorStop(0, '#fffaf2'); g.addColorStop(0.55, '#e8d8c0'); g.addColorStop(1, '#b8a080');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(15,13,10,.4)'; c.stroke();
    c.strokeStyle = 'rgba(42,24,16,.35)'; c.beginPath(); c.arc(x, y, r * 0.55, 0.2, 2.4); c.stroke();
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
      txt(c, arc.touchMode ? 'TAP TO SERVE' : 'CLICK OR SPACE TO SERVE', w / 2, arc.h * 0.5, 14, GOLD, 600, 'center', F_MONO);
    }
  }

  // Tap & swipe (the shell's gesture touch style): one finger, no stick or pads.
  // The shell hides its own hint on touch, so the first seconds of play say it here.
  function gestStyle() { return !!(arc && arc.touchMode && arc.touchStyle === 'gesture'); }
  function drawTouchHint(c, lines) {
    if (!gestStyle() || arc.state !== 'play' || G.attract) return;
    const t = arc.time, life = 5;
    if (t >= life) return;
    const a = arc.reducedMotion ? 1 : clamp(min(t / 0.35, (life - t) / 0.7), 0, 1);
    const w = arc.w, bw = min(w - 32, 340), lh = 19, bh = 20 + lines.length * lh;
    const pad = arc.hudPad ? arc.hudPad() : { bottom: 64 };
    const x = (w - bw) / 2, y = arc.h - pad.bottom - bh - 14;
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

  function render(c) {
    drawCourt(c);
    drawLamps(c);
    drawPaddle(c);
    drawBall(c);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.4, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, p.r || 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
    G.floats.forEach((f) => {
      c.globalAlpha = clamp(f.life * 1.4, 0, 1);
      txt(c, f.text, f.x, f.y, 15, f.col, 700, 'center', F_DISP);
      c.globalAlpha = 1;
    });
    const vig = c.createRadialGradient(arc.w * 0.5, arc.h * 0.5, min(arc.w, arc.h) * 0.32, arc.w * 0.5, arc.h * 0.5, min(arc.w, arc.h) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(8,6,4,.55)');
    c.fillStyle = vig; c.fillRect(0, 0, arc.w, arc.h);
    if (G.flash > 0) {
      c.fillStyle = 'rgba(255,183,54,' + (G.flash * 0.3) + ')';
      c.fillRect(0, 0, arc.w, arc.h);
    }
    if (arc.state === 'play' && !G.attract) drawHUD(c);
    drawTouchHint(c, ['Drag anywhere, the paddle follows', 'Tap to serve after a drop']);
  }

  function dbg() {
    const b = G.ball || { x: 0, y: 0 };
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), lives: G.lives, rally: G.rally,
      px: +G.px.toFixed(3), bx: +b.x.toFixed(3), by: +b.y.toFixed(3), attract: !!G.attract, t: +G.t.toFixed(2),
      touchDrag: +(G.touchDrag || 0).toFixed(2), touchServes: G.touchServes || 0, touchStyle: arc.touchStyle,
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
