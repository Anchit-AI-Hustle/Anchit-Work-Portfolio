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
  const G = {
    t: 0, score: 0, lives: 3, combo: 0, px: 0.5, items: [], parts: [],
    next: 0.6, phase: 'run', attract: true, caught: 0, inv: 0,
  };

  function reset(attract) {
    G.t = 0; G.score = 0; G.lives = 3; G.combo = 0; G.px = 0.5;
    G.items = []; G.parts = []; G.next = attract ? 0.4 : 0.7;
    G.phase = 'run'; G.attract = !!attract; G.caught = 0; G.inv = 0;
  }

  function spawn() {
    const spoil = rnd() < 0.22;
    G.items.push({
      x: 0.1 + rnd() * 0.8, y: -0.08, vy: 0.28 + rnd() * 0.18 + G.t * 0.012,
      kind: spoil ? 'spoil' : GOOD[(rnd() * GOOD.length) | 0], w: 0.07, spoil,
    });
    G.next = 0.55 + rnd() * 0.45 - min(0.28, G.t * 0.008);
  }

  function pop(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 40 + rnd() * 140;
      G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + rnd() * 0.25, col });
    }
  }

  function miss() {
    if (G.phase === 'over' || G.inv > 0) return;
    G.lives--; G.combo = 0; G.inv = 0.9;
    arc.shake = 6; arc.sfx.tone(140, 0.14, { type: 'sawtooth', slide: 70, vol: 0.12 });
    if (G.lives <= 0) {
      G.phase = 'over';
      arc.over({
        eyebrow: 'Dropped the load', title: 'Yard <em>closed</em>',
        score: Math.round(G.score), scoreLabel: 'Score',
        html: '<p>' + G.caught + ' sacks caught before the pile went over.</p>',
        again: 'Catch again',
      });
    } else arc.toast('Missed a sack', G.lives + ' left', 800);
  }

  function catchItem(o) {
    if (o.spoil) {
      if (G.phase === 'over' || G.inv > 0) { o.dead = true; return; }
      G.lives--; G.combo = 0; G.inv = 0.9;
      arc.toast('Spoiled', 'Skip those', 800);
      arc.sfx.tone(180, 0.12, { type: 'square', vol: 0.1 });
      if (G.lives <= 0) {
        G.phase = 'over';
        arc.over({
          eyebrow: 'Spoiled crate', title: 'Yard <em>closed</em>',
          score: Math.round(G.score), scoreLabel: 'Score',
          html: '<p>' + G.caught + ' good sacks before a spoiled one landed.</p>',
          again: 'Catch again',
        });
      }
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
    const inp = arc.input, ax = inp.axis(), p = inp.pointer;
    G.px = clamp(G.px + ax.x * dt * 1.8, 0.08, 0.92);
    if (p && p.seen && abs(ax.x) < 0.08) G.px = lerp(G.px, clamp(p.nx, 0.08, 0.92), 1 - Math.exp(-dt * 14));
    if (G.next <= 0) spawn();
    const gy = groundY();
    const hx = G.px * arc.w, hw = 56;
    G.items.forEach((o) => {
      if (o.dead) return;
      o.y += o.vy * dt;
      const x = o.x * arc.w, y = o.y * arc.h;
      if (y > gy - 18 && y < gy + 12 && abs(x - hx) < hw) catchItem(o);
      else if (y > arc.h + 20) {
        if (!o.spoil) miss();
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
    g.addColorStop(0, '#24182a'); g.addColorStop(0.55, '#c45b38'); g.addColorStop(1, '#2a1810');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = WARM; c.beginPath(); c.arc(w * 0.82, h * 0.16, 16, 0, TAU); c.fill();
    const gy = groundY();
    c.fillStyle = '#2a241c'; c.fillRect(0, gy, w, h - gy);
    c.fillStyle = '#3a3428';
    for (let x = 0; x < w; x += 36) c.fillRect(x, gy + 8, 18, 5);
    c.fillStyle = '#4a2a22';
    for (let i = 0; i < 7; i++) {
      const x = ((i * 180 - G.t * 12) % (w + 80)) - 40;
      c.fillRect(x, gy - 90, 70, 90);
      c.fillStyle = i % 2 ? '#c45a3a' : GOLD; c.fillRect(x - 4, gy - 102, 78, 14);
      c.fillStyle = '#4a2a22';
    }
  }

  function drawItem(c, o) {
    const x = o.x * arc.w, y = o.y * arc.h;
    if (o.spoil) {
      c.fillStyle = '#5a6a3a'; rr(c, x - 16, y - 18, 32, 26, 4); c.fill();
      c.fillStyle = '#8a3a2a'; c.fillRect(x - 10, y - 8, 20, 6);
    } else {
      c.fillStyle = o.kind === 'tea' ? '#4a2a18' : o.kind === 'spice' ? PRIM : '#c9a96e';
      rr(c, x - 15, y - 20, 30, 28, 5); c.fill();
      c.fillStyle = 'rgba(251,245,236,.25)'; c.fillRect(x - 8, y - 14, 16, 4);
    }
  }

  function drawHero(c) {
    const gy = groundY(), x = G.px * arc.w;
    c.fillStyle = '#1a1814'; rr(c, x - 34, gy - 18, 68, 20, 6); c.fill();
    c.fillStyle = PRIM; c.fillRect(x - 28, gy - 14, 56, 8);
    c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(x, gy - 32, 8, 0, TAU); c.fill();
    c.fillStyle = '#1a1814'; c.fillRect(x - 10, gy - 26, 20, 12);
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    plate(c, pad.left, pad.top, 150, 64, 12);
    txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 70, pad.top, 140, 44, 12);
    txt(c, 'x' + G.combo, w / 2, pad.top + 22, 18, G.combo >= 5 ? WARM : INK, 500, 'center', F_DISP);
    let hx = w - pad.right - 18;
    for (let i = 0; i < 3; i++) {
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
      phase: G.phase, score: Math.round(G.score), lives: G.lives, combo: G.combo,
      px: +G.px.toFixed(3), items: G.items.length, caught: G.caught, attract: !!G.attract, t: +G.t.toFixed(2),
    };
  }

  A.create({
    slug: 'yard-catch', title: 'Yard Catch', genre: 'Arcade catch',
    hint: 'Mouse or arrows move the crate   skip the green spoiled sacks',
    touchHint: 'Stick slides the crate, catch the brown sacks, skip the green',
    keys: [['Left / Right / A D', 'Slide the crate'], ['Mouse', 'The crate follows the pointer']],
    mouse: { steer: 'x', cursor: 'none', keys: [['Move mouse', 'The crate follows']] },
    touch: { stick: true, pads: [] },
    touchKeys: [['On-screen stick', 'Slide the crate']],
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Arcade catch',
      title: 'Yard <em>Catch</em>',
      html: '<p>Spice sacks drop from the warehouse loft. Slide the crate, catch the good ones, and let the spoiled green sacks hit the dirt. A miss or a spoiled catch costs a life.</p>',
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Caught<b>' + G.caught + '</b></div></div>'; },
    init(a) { arc = a; a.debug = dbg; reset(true); a.menu(); },
    start(a) { arc = a; reset(false); arc.toast('Catch the sacks', 'Yard Catch', 1400); },
    update, idle, render,
  });
})();
