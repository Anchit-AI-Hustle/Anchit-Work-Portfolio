/*
 * Tiffin Dash: a side-street delivery run. Original world, drawn in code
 * on the Arcade shell.
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
  const SHOPS = ['Chai', 'Bakery', 'Books', 'Tailor', 'Florist', 'Barber', 'Jewels', 'Spices'];

  let arc;
  const G = {
    t: 0, dist: 0, speed: 260, score: 0, lives: 3, hold: 0, combo: 0,
    py: 0, pvy: 0, slide: 0, inv: 0, run: 0,
    objs: [], shops: [], lights: [], parts: [],
    phase: 'run', attract: true, next: 1400, nextShop: 0,
  };

  function groundY() { return arc.h * 0.78; }
  function worldX(x) { return x - G.dist + 130; }

  function reset(attract) {
    G.t = 0; G.dist = 0; G.speed = attract ? 180 : 270; G.score = 0; G.lives = 3; G.hold = 0; G.combo = 0;
    G.py = 0; G.pvy = 0; G.slide = 0; G.inv = 0; G.run = 0;
    G.objs = []; G.shops = []; G.lights = []; G.parts = [];
    G.phase = 'run'; G.attract = !!attract; G.next = attract ? 400 : 1500; G.nextShop = 0;
    seedShops();
  }

  function seedShops() {
    G.shops.length = 0;
    for (let i = 0; i < 12; i++) {
      G.shops.push({
        x: i * 220, w: 160 + ((i * 37) % 50), name: SHOPS[i % SHOPS.length],
        col: ['#4a2a2a', '#2a3a4a', '#3a2a1a', '#2a3328'][i % 4], awn: ['#c45a3a', '#c9a96e', '#5a7a4a', '#3a4a6a'][i % 4],
      });
    }
  }

  function spawn() {
    const x = G.dist + arc.w + 80;
    const roll = rnd();
    if (roll < 0.34) G.objs.push({ kind: 'scooter', x, w: 54, h: 28, low: true });
    else if (roll < 0.58) G.objs.push({ kind: 'cart', x, w: 70, h: 36, low: true });
    else if (roll < 0.76) G.objs.push({ kind: 'cloth', x, w: 90, h: 46, high: true });
    else if (roll < 0.9) G.objs.push({ kind: 'tiffin', x, w: 22, h: 18, item: true });
    else G.objs.push({ kind: 'door', x, w: 36, h: 70, door: true });
    G.next = G.dist + 280 + rnd() * 220;
  }

  function pop(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 40 + rnd() * 140;
      G.parts.push({ x, y, vx: cos(a) * sp, vy: sin(a) * sp - 40, life: 0.4 + rnd() * 0.3, col });
    }
  }

  function hit() {
    if (G.inv > 0) return;
    G.lives--; G.inv = 1.2; G.combo = 0; G.hold = 0;
    arc.shake = 8; arc.sfx.tone(160, 0.16, { type: 'sawtooth', slide: 80, vol: 0.14 });
    if (G.lives <= 0) {
      G.phase = 'over';
      arc.over({
        eyebrow: 'Dropped the stack', title: 'Tiffin <em>down</em>',
        score: Math.round(G.score), scoreLabel: 'Score',
        html: '<p>' + Math.round(G.dist / 40) + ' metres through the bazaar.</p>',
        again: 'Run again',
      });
    } else arc.toast('Watch the street', G.lives + ' left', 900);
  }

  function collect(o) {
    if (o.item) {
      G.hold = min(5, G.hold + 1); G.combo++; G.score += 40 * G.combo;
      arc.sfx.tone(660, 0.08, { type: 'sine', vol: 0.12 });
      pop(worldX(o.x), groundY() - 40, WARM, 8);
      if (G.combo >= 3) arc.toast('Hot stack x' + G.combo, '+' + (40 * G.combo), 700);
    } else if (o.door) {
      if (G.hold > 0) {
        const pts = 80 * G.hold; G.score += pts; G.hold = 0; G.combo++;
        arc.sfx.tone(880, 0.12, { type: 'sine', vol: 0.14 });
        arc.toast('Delivered', '+' + pts, 800);
        pop(worldX(o.x), groundY() - 50, GOLD, 12);
      }
    }
    o.dead = true;
  }

  function update(dt) {
    if (G.phase === 'over') return;
    G.t += dt; G.run += dt; G.inv = max(0, G.inv - dt); G.slide = max(0, G.slide - dt);
    G.speed = min(520, 270 + G.dist * 0.012);
    G.dist += G.speed * dt;
    G.score += dt * 8;
    const inp = arc.input;
    const low = inp.pointer.ny > 0.78;
    const jump = inp.hit('Space', 'KeyJ', 'Enter', 'ArrowUp', 'KeyW') || (inp.pointer.pressed && !low);
    const slide = inp.down('ArrowDown', 'KeyS') || inp.hit('ArrowDown', 'KeyS') || (inp.pointer.down && low);
    if (jump && G.py <= 0.01) { G.pvy = 720; arc.sfx.tone(320, 0.06, { type: 'square', vol: 0.08 }); }
    if (slide && G.py <= 0.01) G.slide = 0.42;
    G.pvy -= 2100 * dt; G.py += G.pvy * dt;
    if (G.py < 0) { G.py = 0; G.pvy = 0; }
    if (G.dist > G.next) spawn();
    const gy = groundY();
    const px = 130, pw = 28;
    const ph = G.slide > 0 ? 26 : 52;
    const py = gy - 8 - G.py - (G.slide > 0 ? 26 : 52);
    G.objs.forEach((o) => {
      if (o.dead) return;
      const ox = worldX(o.x);
      if (ox < -120) { o.dead = true; return; }
      const oy = o.high ? gy - 96 : gy - 8 - o.h;
      const oh = o.high ? 46 : o.h;
      const hitbox = !(ox + o.w < px || ox > px + pw || oy + oh < py || oy > py + ph);
      if (!hitbox) return;
      if (o.item || o.door) collect(o);
      else hit();
    });
    G.objs = G.objs.filter((o) => !o.dead && worldX(o.x) > -160);
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
      if (p.life <= 0) G.parts.splice(i, 1);
    }
  }

  function idle(dt) {
    G.attract = true;
    if (!G.shops.length) reset(true);
    G.t += dt; G.dist += 180 * dt; G.run += dt;
    if (G.py <= 0 && (G.t % 1.6) < 0.05) G.pvy = 640;
    G.pvy -= 2100 * dt; G.py += G.pvy * dt; if (G.py < 0) { G.py = 0; G.pvy = 0; }
    if (G.dist > G.next) spawn();
    G.objs = G.objs.filter((o) => worldX(o.x) > -160);
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
    g.addColorStop(0, '#1c1630'); g.addColorStop(0.5, '#c45b38'); g.addColorStop(1, '#2a1810');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = WARM; c.beginPath(); c.arc(w * 0.8, h * 0.18, 16, 0, TAU); c.fill();
    const gy = groundY();
    const shift = G.dist * 0.4;
    G.shops.forEach((s, i) => {
      const x = ((s.x - shift) % (G.shops.length * 220) + G.shops.length * 220) % (G.shops.length * 220) - 40;
      c.fillStyle = s.col; c.fillRect(x, gy - 110, s.w, 110);
      c.fillStyle = s.awn; c.beginPath(); c.moveTo(x - 6, gy - 110); c.lineTo(x + s.w + 6, gy - 110); c.lineTo(x + s.w, gy - 88); c.lineTo(x, gy - 88); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,183,54,.25)'; c.fillRect(x + 16, gy - 70, 28, 36); c.fillRect(x + 56, gy - 70, 22, 36);
      txt(c, s.name.toUpperCase(), x + 12, gy - 118, 10, GOLD, 600, 'left', F_MONO);
      if (i % 2 === 0) {
        c.strokeStyle = 'rgba(255,183,54,.35)'; c.lineWidth = 1;
        for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x + 12 + k * 22, gy - 124, 2.2, 0, TAU); c.fillStyle = WARM; c.fill(); }
      }
    });
    c.fillStyle = '#2a241c'; c.fillRect(0, gy, w, h - gy);
    c.fillStyle = '#3a3428';
    const stripe = 40;
    for (let x = -((G.dist * 1.2) % stripe); x < w; x += stripe) c.fillRect(x, gy + 10, 22, 6);
  }

  function drawObj(c, o) {
    const x = worldX(o.x), gy = groundY();
    if (o.kind === 'scooter') {
      c.fillStyle = '#1a1814'; c.fillRect(x, gy - 22, 50, 14);
      c.beginPath(); c.arc(x + 10, gy - 6, 7, 0, TAU); c.arc(x + 40, gy - 6, 7, 0, TAU); c.fill();
      c.fillStyle = PRIM; c.fillRect(x + 18, gy - 36, 14, 16);
      c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(x + 25, gy - 42, 6, 0, TAU); c.fill();
    } else if (o.kind === 'cart') {
      c.fillStyle = '#5a3a22'; c.fillRect(x, gy - 32, 66, 24);
      c.fillStyle = '#c9a96e'; c.fillRect(x + 6, gy - 44, 54, 12);
      c.fillStyle = '#1a1814'; c.beginPath(); c.arc(x + 14, gy - 6, 8, 0, TAU); c.arc(x + 50, gy - 6, 8, 0, TAU); c.fill();
    } else if (o.kind === 'cloth') {
      c.strokeStyle = GOLD; c.lineWidth = 2; c.beginPath(); c.moveTo(x, gy - 100); c.lineTo(x + 90, gy - 100); c.stroke();
      c.fillStyle = PRIM; c.beginPath(); c.moveTo(x + 8, gy - 100); c.quadraticCurveTo(x + 24, gy - 54, x + 40, gy - 100); c.fill();
      c.fillStyle = '#5a7a4a'; c.beginPath(); c.moveTo(x + 44, gy - 100); c.quadraticCurveTo(x + 60, gy - 50, x + 78, gy - 100); c.fill();
    } else if (o.kind === 'tiffin') {
      c.fillStyle = WARM; rr(c, x, gy - 28 - abs(sin(G.t * 4)) * 6, 18, 16, 4); c.fill();
      c.fillStyle = '#c45a20'; c.fillRect(x + 2, gy - 24 - abs(sin(G.t * 4)) * 6, 14, 3);
    } else if (o.kind === 'door') {
      c.fillStyle = '#2a1810'; c.fillRect(x, gy - 70, 32, 70);
      c.strokeStyle = WARM; c.strokeRect(x, gy - 70, 32, 70);
      txt(c, 'DROP', x + 16, gy - 78, 9, WARM, 600, 'center', F_MONO);
    }
  }

  function drawHero(c) {
    const gy = groundY();
    const x = 130, y = gy - 8 - G.py;
    const flash = G.inv > 0 && ((G.t * 16) | 0) % 2;
    if (flash) return;
    c.save(); c.translate(x, y); c.scale(1.15, 1.15);
    const bob = sin(G.run * 12) * (G.py < 1 ? 2 : 0);
    if (G.slide > 0) {
      c.fillStyle = '#1a1814'; c.fillRect(-18, -18, 40, 16);
      c.fillStyle = PRIM; c.fillRect(8, -22, 16, 12);
      c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(22, -24, 7, 0, TAU); c.fill();
    } else {
      c.fillStyle = '#1a1814'; c.fillRect(-10, -48 + bob, 20, 28);
      c.fillStyle = PRIM; c.fillRect(-10, -24 + bob, 20, 8);
      c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(0, -56 + bob, 8, 0, TAU); c.fill();
      c.fillStyle = '#1a1814';
      c.fillRect(-8, -16 + bob, 7, 16 + sin(G.run * 12) * 4);
      c.fillRect(2, -16 + bob, 7, 16 - sin(G.run * 12) * 4);
    }
    for (let i = 0; i < G.hold; i++) {
      c.fillStyle = i % 2 ? WARM : '#c45a20';
      c.fillRect(10, -36 - i * 7 + bob, 14, 7);
    }
    c.restore();
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    plate(c, pad.left, pad.top, 160, 64, 12);
    txt(c, 'SCORE', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(Math.round(G.score)), pad.left + 14, pad.top + 40, 24, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 70, pad.top, 140, 44, 12);
    txt(c, Math.round(G.dist / 40) + ' m', w / 2, pad.top + 22, 18, INK, 500, 'center', F_DISP);
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
    G.objs.forEach((o) => drawObj(c, o));
    drawHero(c);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.4, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, 2.6, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
    if (arc.state === 'play' && !G.attract) drawHUD(c);
  }

  function dbg() {
    return {
      phase: G.phase, dist: Math.round(G.dist), speed: Math.round(G.speed), score: Math.round(G.score),
      lives: G.lives, hold: G.hold, py: +G.py.toFixed(1), slide: +G.slide.toFixed(2),
      objs: G.objs.length, combo: G.combo, attract: !!G.attract,
    };
  }

  A.create({
    slug: 'tiffin-dash', title: 'Tiffin Dash', genre: 'Arcade runner',
    hint: 'Click or Space jump   Down or click low to slide',
    touchHint: 'Jump pad for scooters, Slide pad for cloth lines',
    keys: [
      ['Space / Up / J', 'Jump the scooters and carts'],
      ['Down / S', 'Slide under hanging cloth'],
    ],
    mouse: { cursor: 'pointer', keys: [['Click', 'Jump'], ['Click the lower street', 'Slide']] },
    touch: { stick: true, pads: [{ label: 'Jump', key: 'Space', big: true, hot: true }, { label: 'Slide', key: 'ArrowDown' }] },
    touchKeys: [['Jump', 'Scooters and carts'], ['Slide', 'Hanging cloth']],
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Arcade runner',
      title: 'Tiffin <em>Dash</em>',
      html: '<p>A side-street dash with a stack of lunches. Jump the scooters, slide under the cloth lines, pick up tiffins and drop them at the marked doors.</p>',
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Distance<b>' + Math.round(G.dist / 40) + ' m</b></div></div>'; },
    init(a) { arc = a; a.debug = dbg; reset(true); a.menu(); },
    start(a) { arc = a; reset(false); arc.toast('Jump and slide', 'Tiffin Dash', 1400); },
    update, idle, render,
  });
})();
