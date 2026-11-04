/*
 * Fare Run: three lanes through a dusk bazaar in an auto. Original world on
 * the Arcade shell. Switch lanes with arrows, A D, a click or the stick.
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
  const STALLS = ['Chai', 'Spices', 'Lamps', 'Cloth', 'Fruit', 'Bangles', 'Nuts', 'Flowers'];

  let arc;
  const DIFF = {
    easy: { spd: 220, dens: 1.22, fare: 0.48 },
    normal: { spd: 265, dens: 1.05, fare: 0.38 },
    hard: { spd: 330, dens: 0.82, fare: 0.24 },
  };
  const G = {
    t: 0, dist: 0, speed: 280, score: 0, lives: 3, maxLives: 3, lane: 1, laneT: 0, cool: 0,
    objs: [], parts: [], floats: [], phase: 'run', attract: true, fares: 0,
    mode: 'bazaar', diff: 'normal', clock: 0, flash: 0,
  };

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'bazaar';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    const rush = G.mode === 'rush';
    G.t = 0; G.dist = 0; G.speed = attract ? 180 : G.D.spd * (rush ? 1.18 : 1);
    G.maxLives = rush ? 2 : 3; G.lives = G.maxLives; G.score = 0;
    G.clock = G.mode === 'night' ? 90 : 0;
    G.lane = 1; G.laneT = 1; G.cool = attract ? 0 : 1.2; G.objs = []; G.parts = []; G.floats = [];
    G.phase = 'run'; G.attract = !!attract; G.fares = 0; G.next = attract ? 400 : 480 * G.D.dens * (rush ? 0.82 : 1);
    G.flash = 0;
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
      const a = rnd() * TAU, sp = 40 + rnd() * 140;
      G.parts.push({ x, y, vx: cos(a) * sp, vy: sin(a) * sp - 30, life: 0.4 + rnd() * 0.3, col, r: 1.5 + rnd() * 2.5 });
    }
  }

  function floatTxt(x, y, text, col) {
    G.floats.push({ x, y, text, col: col || WARM, life: 0.85 });
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
    G.lives--; G.cool = 0.9; G.flash = 0.2;
    arc.shake = 8; arc.sfx.tone(150, 0.16, { type: 'sawtooth', slide: 80, vol: 0.12 });
    if (G.lives <= 0) finish('Meter stopped');
    else arc.toast('Watch the lane', G.lives + ' left', 800);
  }

  function update(dt) {
    if (G.phase === 'over') return;
    G.t += dt; G.cool = max(0, G.cool - dt); G.flash = max(0, G.flash - dt);
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
      const laneVis = Math.round(G.laneT);
      if (abs(o.lane - laneVis) > 0.2) return;
      if (oy > py - 50 && oy < py + 30 && abs(ox - px) < 36) {
        if (o.kind === 'fare') {
          G.fares++; G.score += 40; o.dead = true;
          pop(ox, oy, WARM, 12);
          floatTxt(ox, oy - 20, '+40', WARM);
          arc.sfx.tone(660, 0.08, { type: 'sine', vol: 0.12 });
          arc.toast('Fare on', '+40', 600);
        } else if (G.cool <= 0 && abs(G.laneT - G.lane) < 0.18) {
          o.dead = true; hit();
        }
      }
    });
    G.objs = G.objs.filter((o) => !o.dead);
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 80 * dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i]; f.life -= dt; f.y -= 40 * dt;
      if (f.life <= 0) G.floats.splice(i, 1);
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

  function drawStall(c, x, y, side, idx) {
    const w = 64, h = 110;
    const bx = side < 0 ? x : x - w;
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(bx + 4, y + 8, w, h);
    c.fillStyle = ['#2a1c18', '#1e2428', '#2a2214', '#1c2218'][idx % 4];
    c.fillRect(bx, y, w, h);
    // Awning.
    c.fillStyle = idx % 2 ? '#c45a3a' : GOLD;
    c.beginPath(); c.moveTo(bx - 4, y + 18); c.lineTo(bx + w + 4, y + 18); c.lineTo(bx + w, y + 34); c.lineTo(bx, y + 34); c.closePath(); c.fill();
    for (let i = 0; i < 5; i++) {
      c.fillStyle = i % 2 ? 'rgba(15,13,10,.25)' : 'rgba(251,245,236,.15)';
      c.fillRect(bx + i * (w / 5), y + 18, w / 5, 16);
    }
    // Window glow.
    c.fillStyle = 'rgba(255,183,54,.22)';
    c.fillRect(bx + 12, y + 48, 18, 22); c.fillRect(bx + 36, y + 48, 18, 22);
    c.fillStyle = 'rgba(255,183,54,.08)';
    c.fillRect(bx + 8, y + 78, w - 16, 18);
    // Sign.
    c.fillStyle = 'rgba(15,13,10,.7)'; rr(c, bx + 8, y + 4, w - 16, 14, 3); c.fill();
    txt(c, STALLS[idx % STALLS.length], bx + w / 2, y + 11, 8, GOLD, 600, 'center', F_MONO);
    // String lights.
    c.strokeStyle = 'rgba(251,245,236,.2)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx, y + 16); c.quadraticCurveTo(bx + w / 2, y + 8, bx + w, y + 16); c.stroke();
    for (let i = 0; i < 4; i++) {
      const lx = bx + 8 + i * ((w - 16) / 3);
      c.fillStyle = WARM; c.beginPath(); c.arc(lx, y + 14 + sin(i + G.t) * 1.5, 2, 0, TAU); c.fill();
    }
  }

  function drawBg(c, w, h) {
    const night = G.mode === 'night';
    const g = c.createLinearGradient(0, 0, 0, h);
    if (night) {
      g.addColorStop(0, '#0a0c18'); g.addColorStop(0.4, '#1a1430'); g.addColorStop(0.7, '#3a2040'); g.addColorStop(1, '#1a120c');
    } else {
      g.addColorStop(0, '#1a1430'); g.addColorStop(0.4, '#c45b38'); g.addColorStop(0.72, '#f0a05a'); g.addColorStop(1, '#2a1810');
    }
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // Sun / moon.
    c.fillStyle = night ? '#FBF5EC' : '#FFE08A';
    c.beginPath(); c.arc(w * 0.78, h * 0.12, night ? 12 : 20, 0, TAU); c.fill();
    c.fillStyle = night ? 'rgba(251,245,236,.08)' : 'rgba(255,224,138,.14)';
    c.beginPath(); c.arc(w * 0.78, h * 0.12, night ? 40 : 70, 0, TAU); c.fill();
    // Distant haze buildings.
    c.fillStyle = 'rgba(15,13,10,.35)';
    for (let i = 0; i < 12; i++) {
      const bx = (i * 90 - (G.dist * 0.04) % 90);
      c.fillRect(bx, h * 0.28, 50 + (i % 3) * 12, h * 0.22);
    }
    // Road with perspective.
    const road = c.createLinearGradient(0, 0, 0, h);
    road.addColorStop(0, '#1c1a16'); road.addColorStop(1, '#2a2620');
    c.fillStyle = road;
    c.beginPath(); c.moveTo(w * 0.22, 0); c.lineTo(w * 0.78, 0); c.lineTo(w * 0.94, h); c.lineTo(w * 0.06, h); c.closePath(); c.fill();
    // Road wear.
    c.strokeStyle = 'rgba(251,245,236,.04)'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = ((i * 140 + G.dist * 0.5) % (h + 80)) - 40;
      c.beginPath(); c.moveTo(w * 0.3, y); c.lineTo(w * 0.7, y + 40); c.stroke();
    }
    c.fillStyle = 'rgba(255,183,54,.45)';
    const dash = 30, off = (G.dist * 0.45) % (dash * 2);
    for (let i = 0; i < 3; i++) {
      const x = laneX(i);
      for (let y = -off; y < h; y += dash * 2) c.fillRect(x - 2, y, 4, dash * 0.55);
    }
    c.strokeStyle = 'rgba(251,245,236,.14)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(w * 0.38, 0); c.lineTo(w * 0.34, h); c.stroke();
    c.beginPath(); c.moveTo(w * 0.62, 0); c.lineTo(w * 0.66, h); c.stroke();
    // Side stalls scrolling.
    for (let i = 0; i < 7; i++) {
      const y = ((i * 150 + G.dist * 0.38) % (h + 140)) - 70;
      drawStall(c, 4, y, -1, i);
      drawStall(c, w - 4, y + 40, 1, i + 3);
    }
    // Dust motes.
    c.fillStyle = 'rgba(251,245,236,.12)';
    for (let i = 0; i < 18; i++) {
      const mx = ((i * 97 + G.dist * 0.2) % w);
      const my = ((i * 53 + G.t * 12) % h);
      c.beginPath(); c.arc(mx, my, 1.2, 0, TAU); c.fill();
    }
  }

  function drawObj(c, o) {
    const x = laneX(o.lane), y = o.y;
    if (o.kind === 'fare') {
      c.fillStyle = 'rgba(255,183,54,.18)'; c.beginPath(); c.arc(x, y - 10, 26, 0, TAU); c.fill();
      // Person waving.
      c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(x, y - 28, 9, 0, TAU); c.fill();
      c.fillStyle = WARM; rr(c, x - 11, y - 18, 22, 28, 5); c.fill();
      c.fillStyle = '#2a2218'; c.fillRect(x - 10, y + 8, 8, 14); c.fillRect(x + 2, y + 8, 8, 14);
      c.strokeStyle = PRIM; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x + 12, y - 8); c.lineTo(x + 22, y - 22); c.stroke();
      c.fillStyle = GOLD; txt(c, '₹', x, y - 4, 12, GOLD, 700, 'center', F_MONO);
    } else if (o.kind === 'pot') {
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x + 2, y + 12, 16, 6, 0, 0, TAU); c.fill();
      const pot = c.createLinearGradient(x - 16, y - 18, x + 16, y + 12);
      pot.addColorStop(0, '#ff8a60'); pot.addColorStop(1, '#a82818');
      c.fillStyle = pot;
      c.beginPath(); c.moveTo(x - 14, y - 4); c.quadraticCurveTo(x - 18, y + 14, x, y + 16); c.quadraticCurveTo(x + 18, y + 14, x + 14, y - 4); c.closePath(); c.fill();
      c.fillStyle = GOLD; c.fillRect(x - 9, y - 16, 18, 8);
      c.fillStyle = 'rgba(251,245,236,.25)'; c.beginPath(); c.arc(x - 5, y - 2, 4, 0, TAU); c.fill();
    } else {
      c.fillStyle = 'rgba(0,0,0,.28)'; rr(c, x - 18, y - 6, 48, 28, 4); c.fill();
      c.fillStyle = '#5a3a22'; rr(c, x - 26, y - 20, 52, 34, 6); c.fill();
      c.fillStyle = '#c45a3a'; c.fillRect(x - 26, y - 20, 52, 9);
      // Goods piled on cart.
      c.fillStyle = GOLD; c.beginPath(); c.arc(x - 8, y - 10, 6, 0, TAU); c.fill();
      c.fillStyle = WARM; c.beginPath(); c.arc(x + 6, y - 12, 5, 0, TAU); c.fill();
      c.fillStyle = PRIM; c.beginPath(); c.arc(x + 14, y - 6, 4, 0, TAU); c.fill();
      c.fillStyle = '#1a1814'; c.beginPath(); c.arc(x - 14, y + 16, 8, 0, TAU); c.arc(x + 16, y + 16, 8, 0, TAU); c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 1.5; c.beginPath(); c.arc(x - 14, y + 16, 4, 0, TAU); c.arc(x + 16, y + 16, 4, 0, TAU); c.stroke();
    }
  }

  function drawAuto(c) {
    const x = laneX(G.laneT), y = arc.h * 0.72;
    const flash = G.cool > 0 && ((G.t * 16) | 0) % 2;
    if (flash) return;
    // Shadow.
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y + 28, 34, 10, 0, 0, TAU); c.fill();
    // Cabin.
    c.fillStyle = '#1c1a16'; rr(c, x - 30, y - 36, 60, 58, 12); c.fill();
    // Canopy.
    const canopy = c.createLinearGradient(x - 34, y - 48, x + 34, y - 20);
    canopy.addColorStop(0, '#ff8a60'); canopy.addColorStop(0.5, PRIM); canopy.addColorStop(1, '#c43a18');
    c.fillStyle = canopy; rr(c, x - 34, y - 48, 68, 22, 8); c.fill();
    c.fillStyle = GOLD; c.fillRect(x - 30, y - 30, 60, 3);
    // Windshield.
    c.fillStyle = 'rgba(255,224,138,.35)'; rr(c, x - 18, y - 28, 36, 16, 4); c.fill();
    c.strokeStyle = 'rgba(251,245,236,.2)'; c.stroke();
    // Body stripe.
    c.fillStyle = PRIM; rr(c, x - 30, y - 4, 60, 16, 5); c.fill();
    // Headlights.
    c.fillStyle = '#fff8e8'; c.beginPath(); c.arc(x - 18, y + 14, 4, 0, TAU); c.arc(x + 18, y + 14, 4, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,248,232,.15)'; c.beginPath(); c.arc(x - 18, y + 14, 12, 0, TAU); c.arc(x + 18, y + 14, 12, 0, TAU); c.fill();
    // Wheels.
    c.fillStyle = '#0a0806'; c.beginPath(); c.arc(x - 22, y + 24, 9, 0, TAU); c.arc(x + 22, y + 24, 9, 0, TAU); c.fill();
    c.strokeStyle = GOLD; c.lineWidth = 1.5; c.beginPath(); c.arc(x - 22, y + 24, 5, 0, TAU); c.arc(x + 22, y + 24, 5, 0, TAU); c.stroke();
    // Exhaust puff when moving.
    if (!G.attract) {
      c.fillStyle = 'rgba(251,245,236,.12)';
      c.beginPath(); c.arc(x - 28 - (G.t * 40 % 20), y + 8, 4 + sin(G.t * 8), 0, TAU); c.fill();
    }
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
    plate(c, pad.left, pad.top + 74, 118, 34, 10);
    txt(c, G.fares + ' fares', pad.left + 59, pad.top + 91, 12, WARM, 600, 'center', F_MONO);
  }

  function render(c) {
    const w = arc.w, h = arc.h;
    c.clearRect(0, 0, w, h);
    drawBg(c, w, h);
    // Speed lines in rush.
    if (G.mode === 'rush' && !G.attract) {
      c.strokeStyle = 'rgba(251,245,236,.08)'; c.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const x = ((i * 97 + G.dist * 0.3) % w);
        c.beginPath(); c.moveTo(x, 40); c.lineTo(x, h - 40); c.stroke();
      }
    }
    G.objs.forEach((o) => drawObj(c, o));
    drawAuto(c);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.2, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, p.r || 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
    G.floats.forEach((f) => {
      c.globalAlpha = clamp(f.life * 1.4, 0, 1);
      txt(c, f.text, f.x, f.y, 16, f.col, 700, 'center', F_DISP);
      c.globalAlpha = 1;
    });
    const vig = c.createRadialGradient(w * 0.5, h * 0.5, min(w, h) * 0.3, w * 0.5, h * 0.5, min(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(8,6,4,.5)');
    c.fillStyle = vig; c.fillRect(0, 0, w, h);
    if (G.flash > 0) {
      c.fillStyle = 'rgba(255,105,64,' + (G.flash * 0.4) + ')';
      c.fillRect(0, 0, w, h);
    }
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
