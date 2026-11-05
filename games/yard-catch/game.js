/*
 * Yard Catch: spice sacks falling in a market yard. Original world on the
 * Arcade shell. The crate follows mouse, arrows or the on-screen stick.
 */
(function () {
  'use strict';
  const A = window.Arcade;
  const clamp = A.clamp, lerp = A.lerp;
  const PI = Math.PI, TAU = Math.PI * 2;
  const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max;
  const rnd = Math.random;
  const F_DISP = 'Fraunces, Times New Roman, serif';
  const F_UI = 'Inter, sans-serif';
  const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
  const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';
  const BG = '#0F0D0A';
  const GOOD = ['spice', 'tea', 'grain'];
  const SACK_COL = {
    spice: { body: '#c45a32', shade: '#8a3018', tie: '#FBF5EC', dust: '#FF6940' },
    tea: { body: '#5a3420', shade: '#2e1a10', tie: '#c9a96e', dust: '#c9a96e' },
    grain: { body: '#c9a96e', shade: '#8a7038', tie: '#FBF5EC', dust: '#FFB736' },
    spoil: { body: '#3a4a28', shade: '#1e2814', tie: '#6a7a40', dust: '#6a8040' },
  };
  // Fixed yard dressing: seeded once, drawn every frame without realloc.
  const WH = [
    { x: 0.06, w: 0.18, h: 0.42, roof: 0 },
    { x: 0.28, w: 0.22, h: 0.52, roof: 1 },
    { x: 0.54, w: 0.16, h: 0.38, roof: 0 },
    { x: 0.74, w: 0.24, h: 0.48, roof: 1 },
  ];
  const BG_PILES = [
    { x: 0.08, n: 4, s: 0.9 }, { x: 0.22, n: 3, s: 0.75 },
    { x: 0.78, n: 5, s: 1 }, { x: 0.92, n: 3, s: 0.8 },
  ];
  const LIGHT_N = 9;

  let arc;
  const DIFF = {
    easy: { spoil: 0.12, gap: 1.28, fall: 0.78, catch: 78 },
    normal: { spoil: 0.18, gap: 1.08, fall: 0.9, catch: 70 },
    hard: { spoil: 0.28, gap: 0.84, fall: 1.12, catch: 60 },
  };
  const G = {
    t: 0, score: 0, lives: 3, maxLives: 3, combo: 0, px: 0.5, items: [], parts: [], pops: [],
    next: 0.6, phase: 'run', attract: true, caught: 0, inv: 0,
    mode: 'load', diff: 'normal', clock: 0, comboFlash: 0, nearGlow: 0,
  };

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'load';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    G.t = 0; G.score = 0; G.combo = 0; G.px = 0.5;
    G.maxLives = G.mode === 'clean' ? 1 : 3;
    G.lives = G.maxLives;
    G.clock = G.mode === 'shift' ? 75 : 0;
    G.items = []; G.parts = []; G.pops = []; G.next = attract ? 0.4 : 0.55 * G.D.gap;
    G.phase = 'run'; G.attract = !!attract; G.caught = 0; G.inv = attract ? 0 : 1.6;
    G.comboFlash = 0; G.nearGlow = 0;
    if (!attract) {
      G.items.push({
        x: G.px, y: -0.05, vy: 0.26 * G.D.fall,
        kind: 'spice', w: 0.07, spoil: false,
      });
    }
  }

  function spawn() {
    const spoil = rnd() < G.D.spoil && G.t > 8 && G.caught >= 2;
    // Early drops land near the crate so the first catches are readable.
    const near = G.t < 10 ? clamp(G.px + (rnd() - 0.5) * 0.22, 0.12, 0.88) : (0.1 + rnd() * 0.8);
    G.items.push({
      x: near, y: -0.08, vy: (0.22 + rnd() * 0.14 + G.t * 0.008) * G.D.fall,
      kind: spoil ? 'spoil' : GOOD[(rnd() * GOOD.length) | 0], w: 0.07, spoil,
    });
    G.next = (0.7 + rnd() * 0.5 - min(0.22, G.t * 0.006)) * G.D.gap;
  }

  function emit(x, y, col, n, kind, lift) {
    const lim = min(n, 18);
    for (let i = 0; i < lim; i++) {
      const a = rnd() * TAU, sp = 30 + rnd() * (kind === 'dust' ? 90 : 160);
      G.parts.push({
        x, y, vx: cos(a) * sp, vy: sin(a) * sp - (lift || 40),
        life: 0.32 + rnd() * 0.35, max: 0.55 + rnd() * 0.2,
        col, r: kind === 'dust' ? 2 + rnd() * 3.5 : 1.6 + rnd() * 2.4,
        kind: kind || 'spice',
      });
    }
  }

  function scorePop(x, y, text, col) {
    G.pops.push({ x, y, text, col: col || WARM, life: 0.9, max: 0.9 });
  }

  function finish(why, html) {
    if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
    G.phase = 'over';
    arc.over({
      eyebrow: why, title: why === 'Shift over' ? 'Shift <em>done</em>' : 'Yard <em>closed</em>',
      score: Math.round(G.score), scoreLabel: 'Score',
      html: html || ('<p>' + G.caught + ' sacks caught.</p>'),
      again: 'Catch again',
    });
  }

  function miss() {
    if (G.phase === 'over' || G.inv > 0) return;
    G.lives--; G.combo = 0; G.inv = 1.15;
    arc.shake = 6; arc.sfx.tone(140, 0.14, { type: 'sawtooth', slide: 70, vol: 0.12 });
    if (G.lives <= 0) finish('Dropped the load', '<p>' + G.caught + ' sacks caught before the pile went over.</p>');
    else arc.toast('Missed a sack', G.lives + ' left', 800);
  }

  function catchItem(o) {
    const px = o.x * arc.w, py = groundY() - 24;
    if (o.spoil) {
      if (G.phase === 'over' || G.inv > 0) { o.dead = true; return; }
      G.lives--; G.combo = 0; G.inv = 1.15;
      emit(px, py, '#6a8040', 10, 'dust', 20);
      arc.toast('Spoiled', 'Skip those', 800);
      arc.sfx.tone(180, 0.12, { type: 'square', vol: 0.1 });
      if (G.lives <= 0) finish('Spoiled crate', '<p>' + G.caught + ' good sacks before a spoiled one landed.</p>');
    } else {
      G.combo++; G.caught++;
      const add = 12 * G.combo;
      G.score += add;
      G.comboFlash = 0.45;
      const sc = SACK_COL[o.kind] || SACK_COL.spice;
      emit(px, py, sc.dust, 10, 'spice', 70);
      emit(px, py + 6, 'rgba(251,245,236,.55)', 6, 'dust', 10);
      scorePop(px, py - 18, '+' + add, G.combo >= 5 ? WARM : INK);
      arc.sfx.tone(520 + G.combo * 40, 0.07, { type: 'sine', vol: 0.12 });
      if (G.combo >= 5) arc.toast('Combo x' + G.combo, '+' + add, 700);
    }
    o.dead = true;
  }

  function groundY() { return arc.h * 0.82; }

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
    if (p && p.seen && abs(ax.x) < 0.08) G.px = lerp(G.px, clamp(p.nx, 0.08, 0.92), 1 - Math.exp(-dt * 16));
    if (G.next <= 0) spawn();
    const gy = groundY();
    const hx = G.px * arc.w, hw = G.D.catch || 70;
    let near = 0;
    G.items.forEach((o) => {
      if (o.dead) return;
      o.y += o.vy * dt;
      const x = o.x * arc.w, y = o.y * arc.h;
      const dy = gy - y;
      if (!o.spoil && dy > 0 && dy < 120 && abs(x - hx) < hw + 18) near = max(near, 1 - dy / 120);
      if (y > gy - 28 && y < gy + 18 && abs(x - hx) < hw) catchItem(o);
      else if (y > gy + 36) {
        // Only punish a miss when the sack was in reach. Far-lane drops are
        // noise, not a failure.
        if (!o.spoil && abs(o.x - G.px) < 0.32) miss();
        o.dead = true;
      }
    });
    G.nearGlow = lerp(G.nearGlow, near, 1 - Math.exp(-dt * 10));
    G.items = G.items.filter((o) => !o.dead);
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i];
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      q.vy += 180 * dt;
      if (q.kind === 'dust') { q.vx *= 0.96; q.r += dt * 4; }
      if (q.life <= 0) G.parts.splice(i, 1);
    }
    for (let i = G.pops.length - 1; i >= 0; i--) {
      const q = G.pops[i];
      q.life -= dt; q.y -= 36 * dt;
      if (q.life <= 0) G.pops.splice(i, 1);
    }
    // Soft ambient dust in attract so the yard stays alive.
    if (G.attract && G.parts.length < 14 && rnd() < dt * 4) {
      emit(rnd() * arc.w, gy - 40 - rnd() * 80, 'rgba(201,169,110,.35)', 1, 'dust', 10);
    }
  }

  function idle(dt) {
    G.attract = true;
    if (!G.items.length && G.t === 0) reset(true);
    G.t += dt; G.px = 0.5 + sin(G.t * 0.9) * 0.28;
    G.next -= dt; if (G.next <= 0) spawn();
    G.items.forEach((o) => { o.y += o.vy * dt; });
    G.items = G.items.filter((o) => o.y < 1.2);
    G.comboFlash = 0;
    G.nearGlow = 0.25 + 0.25 * sin(G.t * 2.2);
    // Keep particles ticking so string lights and dust feel alive on the menu.
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i];
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      q.vy += 120 * dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
    if (G.parts.length < 12 && rnd() < dt * 5) {
      const gy = groundY();
      emit(rnd() * arc.w, gy - 30 - rnd() * 100, 'rgba(255,183,54,.4)', 1, 'dust', 8);
    }
    for (let i = G.pops.length - 1; i >= 0; i--) {
      G.pops[i].life -= dt;
      if (G.pops[i].life <= 0) G.pops.splice(i, 1);
    }
  }

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

  function drawSky(c, w, h, gy) {
    const g = c.createLinearGradient(0, 0, 0, gy);
    g.addColorStop(0, '#1a1524');
    g.addColorStop(0.28, '#3a2438');
    g.addColorStop(0.55, '#8a3a2e');
    g.addColorStop(0.78, '#c45b38');
    g.addColorStop(1, '#d4884a');
    c.fillStyle = g; c.fillRect(0, 0, w, gy);
    // Soft dusk bands.
    c.fillStyle = 'rgba(255,183,54,.06)';
    c.fillRect(0, gy * 0.42, w, 18);
    c.fillStyle = 'rgba(255,105,64,.08)';
    c.fillRect(0, gy * 0.55, w, 28);
    // Sun disc + glow.
    const sx = w * 0.78, sy = h * 0.16;
    const halo = c.createRadialGradient(sx, sy, 8, sx, sy, 110);
    halo.addColorStop(0, 'rgba(255,183,54,.55)');
    halo.addColorStop(0.35, 'rgba(255,105,64,.18)');
    halo.addColorStop(1, 'rgba(255,105,64,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(sx, sy, 110, 0, TAU); c.fill();
    c.fillStyle = '#FBF5EC'; c.beginPath(); c.arc(sx, sy, 22, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,183,54,.55)'; c.beginPath(); c.arc(sx, sy, 28, 0, TAU); c.fill();
  }

  function drawWarehouses(c, w, gy) {
    for (let i = 0; i < WH.length; i++) {
      const b = WH[i];
      const x = b.x * w, bw = b.w * w, bh = b.h * (gy - 40);
      const y = gy - bh;
      c.fillStyle = i % 2 ? '#1c1612' : '#221a14';
      c.fillRect(x, y, bw, bh);
      // Roof plate.
      c.fillStyle = b.roof ? '#2a1c14' : '#241610';
      c.fillRect(x - 4, y - 10, bw + 8, 12);
      c.fillStyle = i % 2 ? PRIM : GOLD;
      c.globalAlpha = 0.55;
      c.fillRect(x - 4, y - 10, bw + 8, 3);
      c.globalAlpha = 1;
      // Lit windows.
      const cols = max(2, (bw / 28) | 0), rows = max(2, (bh / 36) | 0);
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          const wx = x + 10 + k * (bw - 16) / cols;
          const wy = y + 14 + r * (bh - 28) / rows;
          const lit = ((i * 7 + r * 3 + k * 5 + ((G.t * 1.7) | 0)) % 5) !== 0;
          const tw = 0.75 + 0.25 * sin(G.t * 3 + i + k);
          c.fillStyle = lit ? 'rgba(255,183,54,' + (0.22 * tw).toFixed(3) + ')' : 'rgba(15,13,10,.55)';
          c.fillRect(wx, wy, 10, 14);
          if (lit) {
            c.fillStyle = 'rgba(255,105,64,' + (0.12 * tw).toFixed(3) + ')';
            c.fillRect(wx + 1, wy + 1, 8, 5);
          }
        }
      }
      // Door cut.
      c.fillStyle = '#0F0D0A';
      c.fillRect(x + bw * 0.38, gy - 42, bw * 0.24, 42);
    }
  }

  function drawLoft(c, w, gy) {
    // Warehouse loft beam the sacks drop from.
    c.fillStyle = '#14100c'; c.fillRect(0, 10, w, 28);
    c.fillStyle = '#2a2018'; c.fillRect(0, 34, w, 8);
    c.fillStyle = 'rgba(201,169,110,.2)'; c.fillRect(0, 36, w, 2);
    for (let x = 28; x < w; x += 88) {
      // Pillar with wood grain hint.
      c.fillStyle = '#2a221a'; c.fillRect(x - 5, 42, 12, gy - 42);
      c.fillStyle = 'rgba(251,245,236,.06)'; c.fillRect(x - 3, 48, 3, gy - 56);
      c.fillStyle = 'rgba(15,13,10,.35)'; c.fillRect(x + 3, 48, 3, gy - 56);
      // Bracket lamp.
      c.fillStyle = 'rgba(255,183,54,.18)'; c.fillRect(x - 14, 52, 30, 5);
      const tw = 0.55 + 0.45 * sin(G.t * 4 + x * 0.05);
      c.fillStyle = 'rgba(255,183,54,' + (0.35 * tw).toFixed(3) + ')';
      c.beginPath(); c.arc(x + 1, 62, 5, 0, TAU); c.fill();
    }
  }

  function drawStringLights(c, w, gy) {
    c.save();
    c.strokeStyle = 'rgba(15,13,10,.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, 54);
    for (let i = 0; i <= LIGHT_N; i++) {
      const x = (i / LIGHT_N) * w;
      const y = 54 + sin(i * 0.9) * 18 + 8;
      c.lineTo(x, y);
    }
    c.stroke();
    for (let i = 0; i <= LIGHT_N; i++) {
      const x = (i / LIGHT_N) * w;
      const y = 54 + sin(i * 0.9) * 18 + 8;
      const tw = 0.55 + 0.45 * sin(G.t * 5 + i * 1.3);
      const warm = i % 3 === 0;
      c.fillStyle = warm
        ? 'rgba(255,105,64,' + (0.55 * tw).toFixed(3) + ')'
        : 'rgba(255,183,54,' + (0.65 * tw).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y + 6, 3.2, 0, TAU); c.fill();
      c.fillStyle = warm
        ? 'rgba(255,105,64,' + (0.12 * tw).toFixed(3) + ')'
        : 'rgba(255,183,54,' + (0.14 * tw).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y + 6, 10, 0, TAU); c.fill();
    }
    c.restore();
  }

  function drawSackPile(c, x, gy, n, s) {
    for (let i = 0; i < n; i++) {
      const row = (i / 3) | 0;
      const col = i % 3;
      const sx = x + (col - 1) * 18 * s + (row % 2) * 6;
      const sy = gy - 10 - row * 16 * s;
      const kind = GOOD[(i + n) % GOOD.length];
      const colr = SACK_COL[kind];
      c.fillStyle = 'rgba(0,0,0,.2)';
      c.beginPath(); c.ellipse(sx, sy + 10 * s, 14 * s, 4 * s, 0, 0, TAU); c.fill();
      c.fillStyle = colr.body;
      c.beginPath(); c.ellipse(sx, sy, 13 * s, 10 * s, 0, 0, TAU); c.fill();
      c.fillStyle = colr.shade;
      c.beginPath(); c.ellipse(sx - 3 * s, sy + 2 * s, 7 * s, 7 * s, 0, 0, TAU); c.fill();
      c.fillStyle = colr.tie;
      c.fillRect(sx - 3 * s, sy - 12 * s, 6 * s, 5 * s);
    }
  }

  function drawGround(c, w, h, gy) {
    const g = c.createLinearGradient(0, gy, 0, h);
    g.addColorStop(0, '#3a3228');
    g.addColorStop(0.35, '#2a241c');
    g.addColorStop(1, BG);
    c.fillStyle = g; c.fillRect(0, gy, w, h - gy);
    // Stone tiles.
    c.strokeStyle = 'rgba(15,13,10,.28)';
    c.lineWidth = 1;
    const tw = 48, th = 28;
    for (let row = 0; row < 5; row++) {
      const oy = gy + 8 + row * th;
      const ox = (row % 2) * (tw * 0.5);
      for (let x = -tw; x < w + tw; x += tw) {
        c.fillStyle = row % 2 ? 'rgba(251,245,236,.03)' : 'rgba(201,169,110,.04)';
        c.fillRect(x + ox, oy, tw - 2, th - 2);
        c.strokeRect(x + ox + 0.5, oy + 0.5, tw - 2, th - 2);
      }
    }
    // Wear strip under the catch lane.
    c.fillStyle = 'rgba(15,13,10,.22)';
    c.fillRect(0, gy, w, 6);
    c.fillStyle = 'rgba(255,183,54,.08)';
    c.fillRect(0, gy + 2, w, 2);
    // Far sack piles.
    for (let i = 0; i < BG_PILES.length; i++) {
      const p = BG_PILES[i];
      drawSackPile(c, p.x * w, gy, p.n, p.s);
    }
  }

  function drawBg(c, w, h) {
    const gy = groundY();
    drawSky(c, w, h, gy);
    drawWarehouses(c, w, gy);
    drawLoft(c, w, gy);
    drawStringLights(c, w, gy);
    drawGround(c, w, h, gy);
  }

  function drawSack(c, o) {
    const x = o.x * arc.w, y = o.y * arc.h;
    const sc = SACK_COL[o.spoil ? 'spoil' : o.kind] || SACK_COL.spice;
    const wob = sin(G.t * 8 + o.x * 12) * 0.08;
    c.save();
    c.translate(x, y);
    c.rotate(wob);
    // Soft contact shadow.
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.beginPath(); c.ellipse(0, 14, 16, 5, 0, 0, TAU); c.fill();
    // Cloth body (teardrop / sack silhouette).
    c.beginPath();
    c.moveTo(-4, -22);
    c.bezierCurveTo(-18, -8, -20, 8, -12, 14);
    c.quadraticCurveTo(0, 20, 12, 14);
    c.bezierCurveTo(20, 8, 18, -8, 4, -22);
    c.closePath();
    const body = c.createLinearGradient(-16, -10, 16, 14);
    body.addColorStop(0, sc.shade);
    body.addColorStop(0.45, sc.body);
    body.addColorStop(1, sc.shade);
    c.fillStyle = body; c.fill();
    // Cloth fold.
    c.strokeStyle = 'rgba(251,245,236,.18)';
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-2, -10); c.quadraticCurveTo(-8, 2, -4, 12); c.stroke();
    // Tied top.
    c.fillStyle = sc.tie;
    c.beginPath();
    c.moveTo(-6, -22); c.lineTo(-2, -30); c.lineTo(2, -30); c.lineTo(6, -22);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(15,13,10,.45)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-7, -22); c.lineTo(7, -22); c.stroke();
    c.fillStyle = GOLD; c.fillRect(-3, -24, 6, 3);
    if (o.spoil) {
      // Greenish leak drips.
      c.fillStyle = 'rgba(106,128,64,.75)';
      c.beginPath(); c.ellipse(-6, 12, 5, 3, 0.2, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(5, 10, 4, 2.5, -0.3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(140,180,70,.55)';
      c.beginPath(); c.arc(-4, 18, 2.2, 0, TAU); c.fill();
      c.beginPath(); c.arc(3, 20, 1.6, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(140,200,80,.4)'; c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-4, -22);
      c.bezierCurveTo(-18, -8, -20, 8, -12, 14);
      c.quadraticCurveTo(0, 20, 12, 14);
      c.bezierCurveTo(20, 8, 18, -8, 4, -22);
      c.closePath(); c.stroke();
    } else {
      // Label stitch.
      c.strokeStyle = 'rgba(251,245,236,.25)'; c.lineWidth = 1;
      rr(c, -8, -4, 16, 10, 2); c.stroke();
      c.fillStyle = 'rgba(15,13,10,.35)';
      txt(c, o.kind === 'tea' ? 'TEA' : o.kind === 'grain' ? 'GRN' : 'SPC', 0, 1, 7, 'rgba(251,245,236,.55)', 600, 'center', F_MONO);
    }
    c.restore();
  }

  function drawHero(c) {
    const gy = groundY(), x = G.px * arc.w;
    const flash = G.inv > 0 && ((G.t * 14) | 0) % 2;
    if (flash) return;
    const hw = G.D.catch || 70;
    // Ground shadow / crate cast.
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(x, gy + 8, 48, 10, 0, 0, TAU); c.fill();
    // Catch mouth glow when a sack is near.
    if (G.nearGlow > 0.05) {
      const a = 0.15 + G.nearGlow * 0.45;
      const glow = c.createRadialGradient(x, gy - 18, 4, x, gy - 18, hw);
      glow.addColorStop(0, 'rgba(255,105,64,' + a.toFixed(3) + ')');
      glow.addColorStop(0.55, 'rgba(255,183,54,' + (a * 0.35).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(255,183,54,0)');
      c.fillStyle = glow;
      c.beginPath(); c.ellipse(x, gy - 14, hw * 0.95, 22, 0, 0, TAU); c.fill();
    }
    // 3/4 wooden crate body.
    c.fillStyle = '#3a2a1c';
    rr(c, x - 42, gy - 28, 84, 30, 4); c.fill();
    // Top rim (open mouth).
    c.fillStyle = '#5a4028';
    c.beginPath();
    c.moveTo(x - 46, gy - 28); c.lineTo(x - 34, gy - 40); c.lineTo(x + 34, gy - 40); c.lineTo(x + 46, gy - 28);
    c.closePath(); c.fill();
    c.fillStyle = '#1a120c';
    c.beginPath();
    c.moveTo(x - 30, gy - 30); c.lineTo(x - 22, gy - 36); c.lineTo(x + 22, gy - 36); c.lineTo(x + 30, gy - 30);
    c.closePath(); c.fill();
    // Inner bed glow.
    c.fillStyle = 'rgba(255,105,64,' + (0.12 + G.nearGlow * 0.35).toFixed(3) + ')';
    c.beginPath();
    c.moveTo(x - 28, gy - 30); c.lineTo(x - 20, gy - 35); c.lineTo(x + 20, gy - 35); c.lineTo(x + 28, gy - 30);
    c.closePath(); c.fill();
    // Wood planks.
    c.strokeStyle = 'rgba(15,13,10,.35)'; c.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      c.beginPath(); c.moveTo(x + i * 22, gy - 26); c.lineTo(x + i * 22, gy); c.stroke();
    }
    c.fillStyle = 'rgba(251,245,236,.08)';
    c.fillRect(x - 40, gy - 24, 8, 22);
    // Metal straps.
    c.fillStyle = '#6a6a68';
    c.fillRect(x - 44, gy - 18, 88, 4);
    c.fillRect(x - 44, gy - 6, 88, 4);
    c.fillStyle = '#9a9a96';
    c.fillRect(x - 44, gy - 18, 88, 1);
    c.fillRect(x - 44, gy - 6, 88, 1);
    // Rivets.
    c.fillStyle = WARM;
    for (let i = -1; i <= 1; i++) {
      c.beginPath(); c.arc(x + i * 28, gy - 16, 1.6, 0, TAU); c.fill();
      c.beginPath(); c.arc(x + i * 28, gy - 4, 1.6, 0, TAU); c.fill();
    }
    // Front brand plate.
    c.fillStyle = 'rgba(15,13,10,.45)';
    rr(c, x - 18, gy - 16, 36, 12, 2); c.fill();
    c.strokeStyle = 'rgba(201,169,110,.55)'; c.lineWidth = 1;
    rr(c, x - 18, gy - 16, 36, 12, 2); c.stroke();
    txt(c, 'YARD', x, gy - 10, 8, GOLD, 600, 'center', F_MONO);
    // Wheel hints.
    c.fillStyle = '#1a1814';
    c.beginPath(); c.ellipse(x - 30, gy + 2, 8, 5, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(x + 30, gy + 2, 8, 5, 0, 0, TAU); c.fill();
    c.strokeStyle = GOLD; c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(x - 30, gy + 2, 5, 3, 0, 0, TAU); c.stroke();
    c.beginPath(); c.ellipse(x + 30, gy + 2, 5, 3, 0, 0, TAU); c.stroke();
    // Catch zone guide.
    c.strokeStyle = 'rgba(255,105,64,' + (0.25 + G.nearGlow * 0.4).toFixed(3) + ')';
    c.lineWidth = 1.5; c.setLineDash([4, 5]);
    c.strokeRect(x - hw, gy - 30, hw * 2, 36);
    c.setLineDash([]);
  }

  function drawParts(c) {
    for (let i = 0; i < G.parts.length; i++) {
      const p = G.parts[i];
      const a = clamp(p.life / (p.max || 0.5), 0, 1);
      c.globalAlpha = a;
      c.fillStyle = p.col;
      if (p.kind === 'dust') {
        c.beginPath(); c.arc(p.x, p.y, p.r * (1.2 - a * 0.3), 0, TAU); c.fill();
      } else {
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1;
    for (let i = 0; i < G.pops.length; i++) {
      const p = G.pops[i];
      const a = clamp(p.life / p.max, 0, 1);
      c.globalAlpha = a;
      c.font = '600 ' + (14 + (1 - a) * 6) + 'px ' + F_DISP;
      c.fillStyle = p.col;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(p.text, p.x, p.y);
    }
    c.globalAlpha = 1;
  }

  function drawVignette(c, w, h) {
    const v = c.createRadialGradient(w * 0.5, h * 0.45, h * 0.2, w * 0.5, h * 0.5, h * 0.78);
    v.addColorStop(0, 'rgba(15,13,10,0)');
    v.addColorStop(0.7, 'rgba(15,13,10,.18)');
    v.addColorStop(1, 'rgba(15,13,10,.55)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    const flash = G.comboFlash > 0;
    plate(c, pad.left, pad.top, 150, 64, 12);
    txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
    // Center chip: clock or combo, with combo flash ring.
    const cx = w / 2 - 70, cy = pad.top;
    if (flash) {
      c.fillStyle = 'rgba(255,105,64,' + (0.18 * (G.comboFlash / 0.45)).toFixed(3) + ')';
      rr(c, cx - 4, cy - 4, 148, 52, 14); c.fill();
      c.strokeStyle = 'rgba(255,183,54,' + (0.55 * (G.comboFlash / 0.45)).toFixed(3) + ')';
      c.lineWidth = 2; rr(c, cx - 4, cy - 4, 148, 52, 14); c.stroke();
    }
    plate(c, cx, cy, 140, 44, 12);
    const mid = G.clock ? (Math.max(0, G.clock | 0) + 's') : ('x' + G.combo);
    const hot = (G.clock && G.clock < 10) || G.combo >= 5 || flash;
    txt(c, mid, w / 2, pad.top + 22, 18, hot ? WARM : INK, 500, 'center', F_DISP);
    if (!G.clock && G.combo >= 3) {
      txt(c, 'COMBO', w / 2, pad.top + 36, 8, GOLD, 600, 'center', F_MONO);
    }
    let hx = w - pad.right - 18;
    for (let i = 0; i < G.maxLives; i++) {
      c.fillStyle = i < G.lives ? PRIM : 'rgba(251,245,236,.15)';
      c.beginPath(); c.arc(hx - i * 18, pad.top + 22, 6, 0, TAU); c.fill();
      if (i < G.lives) {
        c.fillStyle = 'rgba(255,183,54,.35)';
        c.beginPath(); c.arc(hx - i * 18, pad.top + 22, 9, 0, TAU); c.fill();
      }
    }
  }

  function render(c) {
    const w = arc.w, h = arc.h;
    c.clearRect(0, 0, w, h);
    drawBg(c, w, h);
    G.items.forEach((o) => drawSack(c, o));
    drawHero(c);
    drawParts(c);
    drawVignette(c, w, h);
    if (arc.state === 'play' && !G.attract) drawHUD(c);
  }

  function dbg() {
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), lives: G.lives, combo: G.combo,
      px: +G.px.toFixed(3), items: G.items.length, caught: G.caught, attract: !!G.attract, t: +G.t.toFixed(2),
    };
  }

  A.create({
    slug: 'yard-catch', title: 'Yard Catch', genre: 'Arcade catch',
    hint: 'Mouse or arrows move the crate   skip the green spoiled sacks',
    touchHint: 'Stick slides the crate, catch the brown sacks, skip the green',
    keys: [['Left / Right / A D', 'Slide the crate'], ['Mouse', 'The crate follows the pointer']],
    mouse: { cursor: 'none', keys: [['Move mouse', 'The crate follows']] },
    touch: { stick: true, pads: [] },
    touchKeys: [['On-screen stick', 'Slide the crate']],
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Arcade catch',
      title: 'Yard <em>Catch</em>',
      html: '<p>Spice sacks drop from the warehouse loft. Slide the crate, catch the good ones, and let the spoiled green sacks hit the dirt. A miss or a spoiled catch costs a life.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'load', choices: [{ v: 'load', label: 'Three lives' }, { v: 'shift', label: '75 seconds' }, { v: 'clean', label: 'Clean catch' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Caught<b>' + G.caught + '</b></div></div>'; },
    onMenu(a) { arc = a; reset(true); },
    init(a) { arc = a; a.debug = dbg; G.D = DIFF.normal; reset(true); a.menu(); },
    start(a, ch) {
      arc = a; reset(false, ch);
      const label = G.mode === 'shift' ? '75 seconds' : G.mode === 'clean' ? 'One life, skip the green' : 'Three lives';
      arc.toast(label, 'Yard Catch', 1400);
    },
    update, idle, render,
  });
})();
