/*
 * Fare Run: three lanes through a dusk bazaar in an auto. Original world on
 * the Arcade shell. Switch lanes with arrows, A D, a click or the stick.
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

  let arc;
  const DIFF = {
    easy: { spd: 220, dens: 1.22, fare: 0.48 },
    normal: { spd: 265, dens: 1.05, fare: 0.38 },
    hard: { spd: 330, dens: 0.82, fare: 0.24 },
  };
  const G = {
    t: 0, dist: 0, speed: 280, score: 0, lives: 3, maxLives: 3, lane: 1, laneT: 0, cool: 0,
    objs: [], parts: [], phase: 'run', attract: true, fares: 0,
    mode: 'bazaar', diff: 'normal', clock: 0,
  };

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'bazaar';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    const rush = G.mode === 'rush';
    G.t = 0; G.dist = 0; G.speed = attract ? 180 : G.D.spd * (rush ? 1.18 : 1);
    G.maxLives = rush ? 2 : 3; G.lives = G.maxLives; G.score = 0;
    G.clock = G.mode === 'night' ? 90 : 0;
    G.lane = 1; G.laneT = 1; G.cool = attract ? 0 : 1.2; G.objs = []; G.parts = [];
    G.phase = 'run'; G.attract = !!attract; G.fares = 0; G.next = attract ? 400 : 480 * G.D.dens * (rush ? 0.82 : 1);
    if (!attract) G.objs.push({ kind: 'fare', lane: 1, y: -40, h: 36 });
  }

  function laneX(i) { return arc.w * (0.26 + i * 0.24); }

  function spawn() {
    const lane = (rnd() * 3) | 0;
    const roll = rnd();
    const fare = (G.D || DIFF.normal).fare;
    const kind = roll < fare ? 'fare' : roll < fare + 0.18 ? 'pot' : 'cart';
    G.objs.push({ kind, lane, y: -80, h: kind === 'fare' ? 36 : 44 });
    const dens = (G.D || DIFF.normal).dens * (G.mode === 'rush' ? 0.82 : 1);
    G.next = G.dist + (420 + rnd() * 260 - min(160, G.dist * 0.02)) * dens;
  }

  function pop(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 40 + rnd() * 130;
      G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0.35 + rnd() * 0.25, col });
    }
  }

  function finish(why) {
    if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
    G.phase = 'over';
    arc.over({
      eyebrow: why, title: why === 'Night over' ? 'Shift <em>done</em>' : 'Fare <em>cut</em>',
      score: Math.round(G.score), scoreLabel: 'Score',
      html: '<p>' + G.fares + ' fares and ' + Math.round(G.dist / 40) + ' metres through the bazaar.</p>',
      again: 'Drive again',
    });
  }

  function hit() {
    G.lives--; G.cool = 0.9;
    arc.shake = 8; arc.sfx.tone(150, 0.16, { type: 'sawtooth', slide: 80, vol: 0.12 });
    if (G.lives <= 0) finish('Meter stopped');
    else arc.toast('Watch the lane', G.lives + ' left', 800);
  }

  function update(dt) {
    if (G.phase === 'over') return;
    G.t += dt; G.cool = max(0, G.cool - dt);
    if (G.clock) {
      G.clock -= dt;
      if (G.clock <= 0) { G.clock = 0; finish('Night over'); return; }
    }
    const base = (G.D || DIFF.normal).spd * (G.mode === 'rush' ? 1.18 : 1);
    G.speed = min(base + 280, base + G.dist * 0.014);
    G.dist += G.speed * dt; G.score += dt * 10;
    const inp = arc.input, ax = inp.axis(), p = inp.pointer;
    G.laneCool = max(0, (G.laneCool || 0) - dt);
    let want = G.lane;
    if (inp.hit('ArrowLeft', 'KeyA')) want = G.lane - 1;
    if (inp.hit('ArrowRight', 'KeyD')) want = G.lane + 1;
    if (G.laneCool <= 0) {
      if (ax.x < -0.65) { want = G.lane - 1; G.laneCool = 0.16; }
      if (ax.x > 0.65) { want = G.lane + 1; G.laneCool = 0.16; }
    }
    if (p && p.pressed) want = p.nx < 0.38 ? 0 : p.nx > 0.62 ? 2 : 1;
    want = clamp(want | 0, 0, 2);
    if (want !== G.lane) { G.lane = want; arc.sfx.tone(280, 0.05, { type: 'square', vol: 0.06 }); }
    G.laneT = lerp(G.laneT, G.lane, 1 - Math.exp(-dt * 12));
    if (G.dist > G.next) spawn();
    const py = arc.h * 0.72;
    G.objs.forEach((o) => {
      o.y += G.speed * dt * 0.55;
      if (o.dead) return;
      if (o.y > arc.h + 40) { o.dead = true; return; }
      const ox = laneX(o.lane), oy = o.y;
      const px = laneX(G.laneT);
      // Collide against the visible lane (lerped), not the discrete target, so a
      // mid-slide auto is not punished in a lane it has not reached yet.
      const laneVis = Math.round(G.laneT);
      if (abs(o.lane - laneVis) > 0.2) return;
      if (oy > py - 50 && oy < py + 30 && abs(ox - px) < 36) {
        if (o.kind === 'fare') {
          G.fares++; G.score += 40; o.dead = true;
          pop(ox, oy, WARM, 10);
          arc.sfx.tone(660, 0.08, { type: 'sine', vol: 0.12 });
          arc.toast('Fare on', '+40', 600);
        } else if (G.cool <= 0 && abs(G.laneT - G.lane) < 0.18) {
          o.dead = true; hit();
        }
      }
    });
    G.objs = G.objs.filter((o) => !o.dead);
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
  }

  function idle(dt) {
    G.attract = true;
    if (G.t === 0 && !G.objs.length) reset(true);
    G.t += dt; G.dist += 180 * dt;
    G.laneT = 1 + sin(G.t * 0.8) * 0.85;
    if (G.dist > G.next) spawn();
    G.objs.forEach((o) => { o.y += 90 * dt; });
    G.objs = G.objs.filter((o) => o.y < arc.h + 40);
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
    g.addColorStop(0, '#1a1430'); g.addColorStop(0.45, '#c45b38'); g.addColorStop(0.75, '#f0a05a'); g.addColorStop(1, '#2a1810');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#FBF5EC'; c.beginPath(); c.arc(w * 0.78, h * 0.12, 18, 0, TAU); c.fill();
    c.fillStyle = 'rgba(251,245,236,.12)'; c.beginPath(); c.arc(w * 0.78, h * 0.12, 64, 0, TAU); c.fill();
    // Road with perspective feel.
    c.fillStyle = '#242018';
    c.beginPath(); c.moveTo(w * 0.2, 0); c.lineTo(w * 0.8, 0); c.lineTo(w * 0.92, h); c.lineTo(w * 0.08, h); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,183,54,.4)';
    const dash = 30, off = (G.dist * 0.45) % (dash * 2);
    for (let i = 0; i < 3; i++) {
      const x = laneX(i);
      for (let y = -off; y < h; y += dash * 2) c.fillRect(x - 2, y, 4, dash * 0.55);
    }
    c.strokeStyle = 'rgba(251,245,236,.12)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(w * 0.38, 0); c.lineTo(w * 0.34, h); c.stroke();
    c.beginPath(); c.moveTo(w * 0.62, 0); c.lineTo(w * 0.66, h); c.stroke();
    for (let i = 0; i < 8; i++) {
      const y = ((i * 160 + G.dist * 0.35) % (h + 120)) - 60;
      c.fillStyle = '#2a1c18'; c.fillRect(4, y, 58, 96); c.fillRect(w - 62, y + 30, 58, 96);
      c.fillStyle = i % 2 ? '#c45a3a' : GOLD; c.fillRect(2, y - 10, 62, 12); c.fillRect(w - 64, y + 20, 62, 12);
      c.fillStyle = 'rgba(255,183,54,.2)'; c.fillRect(14, y + 24, 16, 20); c.fillRect(w - 48, y + 54, 16, 20);
    }
  }

  function drawObj(c, o) {
    const x = laneX(o.lane), y = o.y;
    if (o.kind === 'fare') {
      c.fillStyle = 'rgba(255,183,54,.2)'; c.beginPath(); c.arc(x, y - 8, 22, 0, TAU); c.fill();
      c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(x, y - 20, 8, 0, TAU); c.fill();
      c.fillStyle = WARM; rr(c, x - 10, y - 12, 20, 26, 4); c.fill();
      c.fillStyle = PRIM; c.fillRect(x - 10, y + 6, 20, 4);
      c.fillStyle = GOLD; txt(c, '₹', x, y + 2, 11, GOLD, 700, 'center', F_MONO);
    } else if (o.kind === 'pot') {
      c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.arc(x + 1, y + 4, 15, 0, TAU); c.fill();
      c.fillStyle = PRIM; c.beginPath(); c.arc(x, y, 15, 0, TAU); c.fill();
      c.fillStyle = GOLD; c.fillRect(x - 7, y - 18, 14, 7);
      c.fillStyle = 'rgba(251,245,236,.2)'; c.beginPath(); c.arc(x - 4, y - 4, 4, 0, TAU); c.fill();
    } else {
      c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, x - 20, y - 10, 46, 30, 4); c.fill();
      c.fillStyle = '#5a3a22'; rr(c, x - 24, y - 18, 48, 32, 5); c.fill();
      c.fillStyle = '#c45a3a'; c.fillRect(x - 24, y - 18, 48, 8);
      c.fillStyle = '#1a1814'; c.beginPath(); c.arc(x - 14, y + 14, 7, 0, TAU); c.arc(x + 14, y + 14, 7, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,183,54,.35)'; c.fillRect(x - 8, y - 8, 16, 8);
    }
  }

  function drawAuto(c) {
    const x = laneX(G.laneT), y = arc.h * 0.72;
    const flash = G.cool > 0 && ((G.t * 16) | 0) % 2;
    if (flash) return;
    c.fillStyle = 'rgba(0,0,0,.3)'; rr(c, x - 24, y - 20, 52, 52, 8); c.fill();
    c.fillStyle = '#1a1814'; rr(c, x - 26, y - 32, 52, 56, 10); c.fill();
    c.fillStyle = PRIM; rr(c, x - 26, y - 6, 52, 18, 5); c.fill();
    c.fillStyle = 'rgba(255,183,54,.55)'; c.fillRect(x - 16, y - 26, 32, 12);
    c.fillStyle = GOLD; c.fillRect(x - 20, y + 20, 10, 7); c.fillRect(x + 10, y + 20, 10, 7);
    c.fillStyle = '#fff8e8'; c.beginPath(); c.arc(x - 14, y + 10, 3, 0, TAU); c.arc(x + 14, y + 10, 3, 0, TAU); c.fill();
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    plate(c, pad.left, pad.top, 150, 64, 12);
    txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 70, pad.top, 140, 44, 12);
    txt(c, G.clock ? (Math.max(0, G.clock | 0) + 's') : (Math.round(G.dist / 40) + ' m'), w / 2, pad.top + 22, 18, G.clock && G.clock < 10 ? PRIM : INK, 500, 'center', F_DISP);
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
    G.objs.forEach((o) => drawObj(c, o));
    drawAuto(c);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.4, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
    if (arc.state === 'play' && !G.attract) drawHUD(c);
  }

  function dbg() {
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, score: Math.round(G.score), lives: G.lives, lane: G.lane,
      dist: Math.round(G.dist), fares: G.fares, objs: G.objs.length, attract: !!G.attract, t: +G.t.toFixed(2),
    };
  }

  A.create({
    slug: 'fare-run', title: 'Fare Run', genre: 'Auto runner',
    hint: 'Left Right or A D change lane   click a lane   pick up standing fares',
    touchHint: 'Stick or tap a lane, pick up people, dodge carts',
    keys: [
      ['Left / Right / A D', 'Change lane'],
      ['Click a lane', 'Jump to that lane'],
    ],
    mouse: { cursor: 'pointer', keys: [['Click left, middle or right', 'Jump to that lane']] },
    touch: { stick: true, pads: [{ label: 'Left', key: 'ArrowLeft' }, { label: 'Right', key: 'ArrowRight', hot: true }] },
    touchKeys: [['On-screen stick', 'Change lane'], ['Left / Right pads', 'Nudge one lane']],
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Auto runner',
      title: 'Fare <em>Run</em>',
      html: '<p>Three lanes through a dusk bazaar. Nudge the auto left or right, pick up the standing fares, and keep the carts and clay pots off the bumper.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'bazaar', choices: [{ v: 'bazaar', label: 'Bazaar run' }, { v: 'night', label: 'Night shift' }, { v: 'rush', label: 'Rush hour' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Fares<b>' + G.fares + '</b></div></div>'; },
    onMenu(a) { arc = a; reset(true); },
    init(a) { arc = a; a.debug = dbg; G.D = DIFF.normal; reset(true); a.menu(); },
    start(a, ch) {
      arc = a; reset(false, ch);
      const label = G.mode === 'night' ? 'Ninety seconds' : G.mode === 'rush' ? 'Rush hour' : 'Bazaar run';
      arc.toast(label, 'Fare Run', 1400);
    },
    update, idle, render,
  });
})();
