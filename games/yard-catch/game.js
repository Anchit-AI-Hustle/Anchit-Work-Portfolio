/*
 * Yard Catch: spice sacks falling in a market yard. Original world on the
 * Arcade shell. The crate follows mouse, arrows or the on-screen stick.
 */
(function () {
  'use strict';
  const A = window.Arcade;
  const clamp = A.clamp, lerp = A.lerp;
  const PI = Math.PI, TAU = Math.PI * 2;
  const abs = Math.abs, sin = Math.sin, min = Math.min, max = Math.max;
  const rnd = Math.random;
  const F_DISP = 'Fraunces, Times New Roman, serif';
  const F_UI = 'Inter, sans-serif';
  const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
  const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';
  const GOOD = ['spice', 'tea', 'grain'];

  let arc;
  const DIFF = {
    easy: { spoil: 0.12, gap: 1.28, fall: 0.78, catch: 78 },
    normal: { spoil: 0.18, gap: 1.08, fall: 0.9, catch: 70 },
    hard: { spoil: 0.28, gap: 0.84, fall: 1.12, catch: 60 },
  };
  const G = {
    t: 0, score: 0, lives: 3, maxLives: 3, combo: 0, px: 0.5, items: [], parts: [],
    next: 0.6, phase: 'run', attract: true, caught: 0, inv: 0,
    mode: 'load', diff: 'normal', clock: 0,
  };

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'load';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    G.t = 0; G.score = 0; G.combo = 0; G.px = 0.5;
    G.maxLives = G.mode === 'clean' ? 1 : 3;
    G.lives = G.maxLives;
    G.clock = G.mode === 'shift' ? 75 : 0;
    G.items = []; G.parts = []; G.next = attract ? 0.4 : 0.55 * G.D.gap;
    G.phase = 'run'; G.attract = !!attract; G.caught = 0; G.inv = attract ? 0 : 1.6;
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

  function pop(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 40 + rnd() * 140;
      G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + rnd() * 0.25, col });
    }
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
    if (o.spoil) {
      if (G.phase === 'over' || G.inv > 0) { o.dead = true; return; }
      G.lives--; G.combo = 0; G.inv = 1.15;
      arc.toast('Spoiled', 'Skip those', 800);
      arc.sfx.tone(180, 0.12, { type: 'square', vol: 0.1 });
      if (G.lives <= 0) finish('Spoiled crate', '<p>' + G.caught + ' good sacks before a spoiled one landed.</p>');
    } else {
      G.combo++; G.caught++; G.score += 12 * G.combo;
      pop(o.x * arc.w, groundY() - 24, o.kind === 'tea' ? GOLD : WARM, 8);
      arc.sfx.tone(520 + G.combo * 40, 0.07, { type: 'sine', vol: 0.12 });
      if (G.combo >= 5) arc.toast('Combo x' + G.combo, '+' + (12 * G.combo), 700);
    }
    o.dead = true;
  }

  function groundY() { return arc.h * 0.82; }

  function update(dt) {
    if (G.phase === 'over') return;
    G.t += dt; G.next -= dt; G.inv = max(0, G.inv - dt);
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
    G.items.forEach((o) => {
      if (o.dead) return;
      o.y += o.vy * dt;
      const x = o.x * arc.w, y = o.y * arc.h;
      if (y > gy - 28 && y < gy + 18 && abs(x - hx) < hw) catchItem(o);
      else if (y > gy + 36) {
        // Only punish a miss when the sack was in reach. Far-lane drops are
        // noise, not a failure.
        if (!o.spoil && abs(o.x - G.px) < 0.32) miss();
        o.dead = true;
      }
    });
    G.items = G.items.filter((o) => !o.dead);
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
  }

  function idle(dt) {
    G.attract = true;
    if (!G.items.length && G.t === 0) reset(true);
    G.t += dt; G.px = 0.5 + sin(G.t * 0.9) * 0.28;
    G.next -= dt; if (G.next <= 0) spawn();
    G.items.forEach((o) => { o.y += o.vy * dt; });
    G.items = G.items.filter((o) => o.y < 1.2);
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

  function drawBg(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1430'); g.addColorStop(0.45, '#c45b38'); g.addColorStop(0.72, '#f0a05a'); g.addColorStop(1, '#2a1810');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#FBF5EC'; c.beginPath(); c.arc(w * 0.82, h * 0.14, 20, 0, TAU); c.fill();
    c.fillStyle = 'rgba(251,245,236,.12)'; c.beginPath(); c.arc(w * 0.82, h * 0.14, 70, 0, TAU); c.fill();
    const gy = groundY();
    // Warehouse loft beam the sacks drop from.
    c.fillStyle = '#1a1410'; c.fillRect(0, 18, w, 22);
    c.fillStyle = '#3a2a22';
    for (let x = 24; x < w; x += 90) {
      c.fillRect(x, 40, 8, gy - 40);
      c.fillStyle = 'rgba(255,183,54,.2)'; c.fillRect(x - 10, 48, 28, 6);
      c.fillStyle = '#3a2a22';
    }
    for (let i = 0; i < 6; i++) {
      const x = ((i * 200 - G.t * 10) % (w + 100)) - 50;
      c.fillStyle = '#2a1c18'; c.fillRect(x, gy - 110, 88, 110);
      c.fillStyle = i % 2 ? '#c45a3a' : GOLD; c.fillRect(x - 6, gy - 122, 100, 14);
      c.fillStyle = 'rgba(255,183,54,.22)'; c.fillRect(x + 14, gy - 78, 22, 28); c.fillRect(x + 48, gy - 78, 18, 28);
      c.fillStyle = '#1a120e'; c.fillRect(x + 34, gy - 48, 18, 48);
    }
    c.fillStyle = '#2a241c'; c.fillRect(0, gy, w, h - gy);
    c.fillStyle = '#3a3428';
    for (let x = 0; x < w; x += 40) c.fillRect(x, gy + 10, 22, 6);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, gy, w, 4);
  }

  function drawItem(c, o) {
    const x = o.x * arc.w, y = o.y * arc.h;
    c.fillStyle = 'rgba(0,0,0,.2)'; rr(c, x - 14, y + 8, 28, 8, 4); c.fill();
    if (o.spoil) {
      c.fillStyle = '#4a5a30'; rr(c, x - 17, y - 20, 34, 30, 5); c.fill();
      c.fillStyle = '#6a7a40'; c.fillRect(x - 12, y - 8, 24, 8);
      c.fillStyle = '#8a3a2a'; c.fillRect(x - 8, y - 2, 16, 4);
      c.strokeStyle = 'rgba(140,200,80,.45)'; c.strokeRect(x - 17, y - 20, 34, 30);
    } else {
      const col = o.kind === 'tea' ? '#4a2a18' : o.kind === 'spice' ? PRIM : '#c9a96e';
      c.fillStyle = col; rr(c, x - 16, y - 22, 32, 32, 6); c.fill();
      c.fillStyle = 'rgba(251,245,236,.28)'; c.fillRect(x - 10, y - 16, 20, 5);
      c.fillStyle = 'rgba(15,13,10,.25)'; c.fillRect(x - 16, y + 2, 32, 8);
      c.strokeStyle = 'rgba(255,183,54,.35)'; c.lineWidth = 1; c.strokeRect(x - 16, y - 22, 32, 32);
    }
  }

  function drawHero(c) {
    const gy = groundY(), x = G.px * arc.w;
    const flash = G.inv > 0 && ((G.t * 14) | 0) % 2;
    if (flash) return;
    c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, x - 38, gy + 2, 76, 10, 4); c.fill();
    c.fillStyle = '#1a1814'; rr(c, x - 40, gy - 22, 80, 26, 8); c.fill();
    c.fillStyle = PRIM; c.fillRect(x - 32, gy - 16, 64, 10);
    c.fillStyle = GOLD; c.fillRect(x - 28, gy - 6, 56, 3);
    // Catcher silhouette.
    c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(x, gy - 40, 9, 0, TAU); c.fill();
    c.fillStyle = '#1a1814'; c.fillRect(x - 11, gy - 34, 22, 16);
    c.fillStyle = PRIM; c.fillRect(x - 11, gy - 22, 22, 5);
    // Catch zone guide.
    c.strokeStyle = 'rgba(255,105,64,.35)'; c.lineWidth = 1.5; c.setLineDash([4, 5]);
    c.strokeRect(x - (G.D.catch || 70), gy - 30, (G.D.catch || 70) * 2, 36);
    c.setLineDash([]);
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    plate(c, pad.left, pad.top, 150, 64, 12);
    txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 70, pad.top, 140, 44, 12);
    const mid = G.clock ? (Math.max(0, G.clock | 0) + 's') : ('x' + G.combo);
    txt(c, mid, w / 2, pad.top + 22, 18, (G.clock && G.clock < 10) || G.combo >= 5 ? WARM : INK, 500, 'center', F_DISP);
    let hx = w - pad.right - 18;
    for (let i = 0; i < G.maxLives; i++) {
      c.fillStyle = i < G.lives ? PRIM : 'rgba(251,245,236,.15)';
      c.beginPath(); c.arc(hx - i * 18, pad.top + 22, 6, 0, TAU); c.fill();
    }
  }

  function render(c) {
    const w = arc.w, h = arc.h;
    c.clearRect(0, 0, w, h);
    drawBg(c, w, h);
    G.items.forEach((o) => drawItem(c, o));
    drawHero(c);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.5, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
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
