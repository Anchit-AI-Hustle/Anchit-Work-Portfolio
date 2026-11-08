/*
 * Tiffin Dash: a side-street delivery run. Original world, drawn in code
 * on the Arcade shell. Visual craft pass: parallax bazaar, jacketed runner,
 * readable obstacles, tiffin bounce and juice, soft vignette.
 */
(function () {
  'use strict';
  const A = window.Arcade;
  const clamp = A.clamp, lerp = A.lerp;
  const PI = Math.PI, TAU = Math.PI * 2;
  const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max;
  const rnd = Math.random, floor = Math.floor;
  const F_DISP = 'Fraunces, Times New Roman, serif';
  const F_UI = 'Inter, sans-serif';
  const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
  const BG = '#0F0D0A', INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';
  const SHOPS = ['Chai', 'Bakery', 'Books', 'Tailor', 'Florist', 'Barber', 'Jewels', 'Spices'];
  const SHOP_BODY = ['#3a2420', '#2a3038', '#3a2c1c', '#2a3226', '#322428', '#2c2a34'];
  const SHOP_AWN = ['#c45a3a', '#c9a96e', '#5a7a4a', '#3a4a6a', '#FF6940', '#7a4a2a'];
  const SIGN_BG = ['#1a120e', '#241810', '#1e1612', '#20140e'];

  let arc;
  const DIFF = {
    easy: { spd: 230, gap: 1.2 },
    normal: { spd: 270, gap: 1 },
    hard: { spd: 340, gap: 0.78 },
  };
  const G = {
    t: 0, dist: 0, speed: 260, score: 0, lives: 3, maxLives: 3, hold: 0, combo: 0,
    py: 0, pvy: 0, slide: 0, inv: 0, run: 0,
    objs: [], shops: [], roofs: [], parts: [], floats: [], dust: [],
    phase: 'run', attract: true, next: 1400, nextShop: 0,
    mode: 'street', diff: 'normal', clock: 0,
  };

  function groundY() { return arc.h * 0.78; }
  function worldX(x) { return x - G.dist + 130; }

  function reset(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'street';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    const rush = G.mode === 'rush';
    G.t = 0; G.dist = 0; G.speed = attract ? 180 : G.D.spd * (rush ? 1.16 : 1);
    G.maxLives = rush ? 1 : 3; G.lives = G.maxLives; G.score = 0; G.hold = 0; G.combo = 0;
    G.clock = G.mode === 'shift' ? 90 : 0;
    G.py = 0; G.pvy = 0; G.slide = 0; G.inv = attract ? 0 : 1.4; G.run = 0; G.jbuf = 0; G.touchActs = 0;
    G.objs = []; G.shops = []; G.roofs = []; G.parts = []; G.floats = []; G.dust = [];
    G.phase = 'run'; G.attract = !!attract; G.next = attract ? 400 : 520 * G.D.gap * (rush ? 0.82 : 1); G.nextShop = 0;
    seedWorld();
    if (!attract) {
      G.objs.push({ kind: 'tiffin', x: 420, w: 22, h: 18, item: true, bob: rnd() * TAU });
      G.objs.push({ kind: 'door', x: 760, w: 36, h: 70, door: true });
    }
  }

  function seedWorld() {
    G.shops.length = 0;
    G.roofs.length = 0;
    for (let i = 0; i < 14; i++) {
      G.shops.push({
        x: i * 210,
        w: 150 + ((i * 41) % 55),
        name: SHOPS[i % SHOPS.length],
        col: SHOP_BODY[i % SHOP_BODY.length],
        awn: SHOP_AWN[i % SHOP_AWN.length],
        sign: SIGN_BG[i % SIGN_BG.length],
        floors: 1 + (i % 3 === 0 ? 1 : 0),
        win: 2 + (i % 3),
        lamp: i % 2 === 0,
      });
    }
    for (let i = 0; i < 18; i++) {
      G.roofs.push({
        x: i * 160,
        w: 90 + ((i * 29) % 70),
        h: 28 + ((i * 17) % 36),
        tone: 0.18 + (i % 5) * 0.04,
      });
    }
  }

  function spawn() {
    const x = G.dist + arc.w + 80;
    const roll = rnd();
    if (roll < 0.34) G.objs.push({ kind: 'scooter', x, w: 54, h: 28, low: true });
    else if (roll < 0.58) G.objs.push({ kind: 'cart', x, w: 70, h: 36, low: true });
    else if (roll < 0.76) G.objs.push({ kind: 'cloth', x, w: 90, h: 46, high: true, sway: rnd() * TAU });
    else if (roll < 0.9) G.objs.push({ kind: 'tiffin', x, w: 22, h: 18, item: true, bob: rnd() * TAU });
    else G.objs.push({ kind: 'door', x, w: 36, h: 70, door: true });
    const gap = (G.D || DIFF.normal).gap * (G.mode === 'rush' ? 0.82 : 1);
    G.next = G.dist + (280 + rnd() * 220) * gap;
  }

  function pop(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 40 + rnd() * 160;
      G.parts.push({
        x, y, vx: cos(a) * sp, vy: sin(a) * sp - 50,
        life: 0.35 + rnd() * 0.4, max: 0.75, col, r: 1.6 + rnd() * 2.4,
      });
    }
  }

  function floatScore(x, y, text, col) {
    G.floats.push({ x, y, vy: -48 - rnd() * 20, life: 0.9, text: String(text), col: col || WARM });
  }

  function dustPuff(x, y, n, slide) {
    for (let i = 0; i < n; i++) {
      G.dust.push({
        x: x - 8 - rnd() * 18, y: y - rnd() * 6,
        vx: -40 - rnd() * (slide ? 90 : 40), vy: -10 - rnd() * 30,
        life: 0.25 + rnd() * 0.35, r: 2 + rnd() * (slide ? 5 : 3),
        col: slide ? 'rgba(201,169,110,.35)' : 'rgba(251,245,236,.18)',
      });
    }
  }

  function finish(why) {
    if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
    G.phase = 'over';
    arc.over({
      eyebrow: why, title: why === 'Shift over' ? 'Shift <em>done</em>' : 'Tiffin <em>down</em>',
      score: Math.round(G.score), scoreLabel: 'Score',
      html: '<p>' + Math.round(G.dist / 40) + ' metres through the bazaar.</p>',
      again: 'Run again',
    });
  }

  function hit() {
    if (G.inv > 0) return;
    G.lives--; G.inv = 1.2; G.combo = 0; G.hold = 0;
    arc.shake = 8; arc.sfx.tone(160, 0.16, { type: 'sawtooth', slide: 80, vol: 0.14 });
    pop(130, groundY() - 30, PRIM, 10);
    if (G.lives <= 0) finish('Dropped the stack');
    else arc.toast('Watch the street', G.lives + ' left', 900);
  }

  function collect(o) {
    const wx = worldX(o.x), gy = groundY();
    if (o.item) {
      G.hold = min(5, G.hold + 1); G.combo++;
      const pts = 40 * G.combo;
      G.score += pts;
      arc.sfx.tone(660, 0.08, { type: 'sine', vol: 0.12 });
      pop(wx + 10, gy - 40, WARM, 10);
      floatScore(wx + 10, gy - 56, '+' + pts, WARM);
      if (G.combo >= 3) arc.toast('Hot stack x' + G.combo, '+' + pts, 700);
    } else if (o.door) {
      // Empty doors stay put so a runner without tiffins is not blocked.
      if (G.hold <= 0) return;
      const pts = 80 * G.hold; G.score += pts; G.hold = 0; G.combo++;
      arc.sfx.tone(880, 0.12, { type: 'sine', vol: 0.14 });
      arc.toast('Delivered', '+' + pts, 800);
      pop(wx + 16, gy - 50, GOLD, 14);
      floatScore(wx + 16, gy - 78, '+' + pts, GOLD);
    }
    o.dead = true;
  }

  // One finger: tap, hold or flick up to jump; flick down to slide (held, it
  // keeps sliding; in the air it drops you fast). Acts on the live drag, so a
  // flick fires as it crosses the threshold, not when the finger lifts.
  const TG = { t0: -1, done: '' };
  function touchRead(dt, inp) {
    const gz = inp.gesture, tp = inp.tap(), sw = inp.swipe();
    const out = { jump: false, slide: false };
    const fresh = gz.t0 !== TG.t0;
    if (gz.active) {
      if (fresh) { TG.t0 = gz.t0; TG.done = ''; }
      const ady = abs(gz.dy), adx = abs(gz.dx);
      const held = (window.performance ? performance.now() : Date.now()) - gz.t0;
      if (gz.dy < -24 && ady > adx * 0.7) { if (!TG.done) { out.jump = true; TG.done = 'up'; } }
      else if (gz.dy > 24 && ady > adx * 0.7) { out.slide = true; if (TG.done !== 'down') G.touchActs++; TG.done = 'down'; }
      else if (!TG.done && adx < 14 && ady < 14 && held > 150) { out.jump = true; TG.done = 'hold'; }
      if (out.jump) G.touchActs++;
      return out;
    }
    const acted = !fresh && TG.done;
    if (tp && !acted) { out.jump = true; G.touchActs++; }
    if (sw && !acted) {
      if (sw.dir === 'up') { out.jump = true; G.touchActs++; }
      else if (sw.dir === 'down') { out.slide = true; G.touchActs++; }
    }
    if (tp || sw) { TG.t0 = gz.t0; TG.done = TG.done || 'end'; }
    return out;
  }

  function update(dt) {
    if (G.phase === 'over') return;
    G.t += dt; G.run += dt; G.inv = max(0, G.inv - dt); G.slide = max(0, G.slide - dt);
    if (G.clock) {
      G.clock -= dt;
      if (G.clock <= 0) { G.clock = 0; finish('Shift over'); return; }
    }
    const base = (G.D || DIFF.normal).spd * (G.mode === 'rush' ? 1.16 : 1);
    G.speed = min(base + 250, base + G.dist * 0.012);
    G.dist += G.speed * dt;
    G.score += dt * 8;
    const inp = arc.input;
    // Tap & swipe: a finger never reads as a mouse click, the gesture decides.
    const gest = gestStyle() && inp.pointer.type !== 'mouse';
    const low = inp.pointer.ny > 0.78;
    let jump = inp.hit('Space', 'KeyJ', 'Enter', 'ArrowUp', 'KeyW') || (!gest && inp.pointer.pressed && !low);
    let slide = inp.down('ArrowDown', 'KeyS') || inp.hit('ArrowDown', 'KeyS') || (!gest && inp.pointer.down && low);
    if (gest) {
      const tj = touchRead(dt, inp);
      if (tj.jump) G.jbuf = 0.14;
      if (tj.slide) slide = true;
    }
    if (G.jbuf > 0) { G.jbuf -= dt; if (G.py <= 0.01) { jump = true; G.jbuf = 0; } }
    if (jump && G.py <= 0.01) { G.pvy = 720; arc.sfx.tone(320, 0.06, { type: 'square', vol: 0.08 }); }
    if (slide && gest && G.py > 0.01 && G.pvy > -620) G.pvy = -620;
    if (slide && G.py <= 0.01) {
      G.slide = 0.42;
      dustPuff(118, groundY() - 4, 5, true);
    }
    G.pvy -= 2100 * dt; G.py += G.pvy * dt;
    if (G.py < 0) {
      if (G.pvy < -200) dustPuff(120, groundY() - 2, 3, false);
      G.py = 0; G.pvy = 0;
    }
    if (G.py <= 0.01 && G.slide <= 0 && ((G.run * 10) | 0) !== (((G.run - dt) * 10) | 0)) {
      dustPuff(118, groundY() - 2, 1, false);
    }
    if (G.slide > 0 && ((G.t * 18) | 0) !== (((G.t - dt) * 18) | 0)) dustPuff(110, groundY() - 4, 1, true);
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
    tickFx(dt);
  }

  function tickFx(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 280 * dt;
      if (p.life <= 0) G.parts.splice(i, 1);
    }
    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i];
      f.life -= dt; f.y += f.vy * dt; f.vy *= 0.98;
      if (f.life <= 0) G.floats.splice(i, 1);
    }
    for (let i = G.dust.length - 1; i >= 0; i--) {
      const d = G.dust[i];
      d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += 8 * dt;
      if (d.life <= 0) G.dust.splice(i, 1);
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
    if (G.py <= 0.01 && ((G.run * 8) | 0) !== (((G.run - dt) * 8) | 0)) dustPuff(118, groundY() - 2, 1, false);
    tickFx(dt);
  }

  function rr(c, x, y, w, h, r) {
    r = min(r || 6, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function plate(c, x, y, w, h, r) {
    c.fillStyle = 'rgba(15,13,10,.78)';
    rr(c, x, y, w, h, r); c.fill();
    c.strokeStyle = 'rgba(201,169,110,.22)'; c.lineWidth = 1; c.stroke();
    c.strokeStyle = 'rgba(251,245,236,.08)';
    rr(c, x + 1, y + 1, w - 2, h - 2, max(2, (r || 6) - 1)); c.stroke();
  }

  function txt(c, s, x, y, size, col, wgt, align, font) {
    c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
    c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
  }

  function wrapX(x, span) {
    return ((x % span) + span) % span;
  }

  function drawSky(c, w, h, gy) {
    const g = c.createLinearGradient(0, 0, 0, gy + 20);
    g.addColorStop(0, '#1a1428');
    g.addColorStop(0.35, '#5a2838');
    g.addColorStop(0.62, '#c45b38');
    g.addColorStop(0.82, '#e8924a');
    g.addColorStop(1, '#2a1810');
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    // Soft dusk haze bands.
    c.fillStyle = 'rgba(255,183,54,.06)';
    c.fillRect(0, gy * 0.42, w, 28);
    c.fillStyle = 'rgba(255,105,64,.05)';
    c.fillRect(0, gy * 0.55, w, 40);

    const sx = w * 0.78, sy = h * 0.13;
    const halo = c.createRadialGradient(sx, sy, 4, sx, sy, 90);
    halo.addColorStop(0, 'rgba(251,245,236,.55)');
    halo.addColorStop(0.25, 'rgba(255,183,54,.18)');
    halo.addColorStop(1, 'rgba(255,183,54,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(sx, sy, 90, 0, TAU); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(sx, sy, 16, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,183,54,.35)'; c.beginPath(); c.arc(sx - 3, sy - 2, 5, 0, TAU); c.fill();

    // Sparse stars / dust motes in the upper sky.
    c.fillStyle = 'rgba(251,245,236,.22)';
    for (let i = 0; i < 18; i++) {
      const mx = wrapX(i * 97 - G.dist * 0.02, w + 40) - 20;
      const my = 18 + (i * 37) % (gy * 0.38);
      c.fillRect(mx, my, 1.5, 1.5);
    }
  }

  function drawRoofs(c, w, gy) {
    const shift = G.dist * 0.18;
    const span = G.roofs.length * 160;
    G.roofs.forEach((r) => {
      const x = wrapX(r.x - shift, span) - 60;
      if (x > w + 40 || x + r.w < -40) return;
      const top = gy - 168 - r.h;
      c.fillStyle = 'rgba(15,13,10,' + r.tone + ')';
      c.beginPath();
      c.moveTo(x, gy - 150);
      c.lineTo(x + 8, top);
      c.lineTo(x + r.w - 8, top + 6);
      c.lineTo(x + r.w, gy - 150);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(201,169,110,.08)';
      c.fillRect(x + 18, top + 14, 10, 12);
      c.fillRect(x + r.w * 0.55, top + 18, 8, 10);
    });
    // Far scrub / fence line.
    c.strokeStyle = 'rgba(15,13,10,.35)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, gy - 148); c.lineTo(w, gy - 148); c.stroke();
  }

  function drawShop(c, s, x, gy) {
    const h = 118 + s.floors * 28;
    const y = gy - h;
    // Ground shadow.
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.beginPath(); c.ellipse(x + s.w * 0.5, gy - 2, s.w * 0.48, 7, 0, 0, TAU); c.fill();

    // Building body.
    c.fillStyle = s.col;
    c.fillRect(x, y, s.w, h);
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.fillRect(x + s.w - 10, y, 10, h);
    c.fillStyle = 'rgba(251,245,236,.04)';
    c.fillRect(x, y, 6, h);

    // Upper floor windows.
    if (s.floors) {
      for (let f = 0; f < s.floors; f++) {
        const fy = y + 14 + f * 26;
        for (let k = 0; k < s.win; k++) {
          const wx = x + 14 + k * ((s.w - 28) / s.win);
          c.fillStyle = 'rgba(255,183,54,' + (0.12 + (k % 2) * 0.1) + ')';
          c.fillRect(wx, fy, 16, 16);
          c.strokeStyle = 'rgba(15,13,10,.35)'; c.lineWidth = 1;
          c.strokeRect(wx, fy, 16, 16);
          c.beginPath(); c.moveTo(wx + 8, fy); c.lineTo(wx + 8, fy + 16); c.stroke();
        }
      }
    }

    // Awning scallops.
    c.fillStyle = s.awn;
    c.beginPath();
    c.moveTo(x - 8, y + (s.floors ? 40 : 0));
    c.lineTo(x + s.w + 8, y + (s.floors ? 40 : 0));
    c.lineTo(x + s.w + 2, y + (s.floors ? 40 : 0) + 22);
    c.lineTo(x - 2, y + (s.floors ? 40 : 0) + 22);
    c.closePath(); c.fill();
    const awnY = y + (s.floors ? 40 : 0) + 22;
    c.fillStyle = 'rgba(15,13,10,.25)';
    for (let i = 0; i < 5; i++) {
      const ax = x + 6 + i * ((s.w - 8) / 5);
      c.beginPath();
      c.moveTo(ax, awnY);
      c.quadraticCurveTo(ax + 8, awnY + 10, ax + 16, awnY);
      c.fill();
    }

    // Shop windows.
    const winY = gy - 72;
    for (let k = 0; k < min(3, s.win); k++) {
      const wx = x + 12 + k * 34;
      if (wx + 26 > x + s.w - 36) break;
      c.fillStyle = 'rgba(255,183,54,.22)';
      c.fillRect(wx, winY, 26, 36);
      c.strokeStyle = 'rgba(15,13,10,.4)'; c.lineWidth = 1.5;
      c.strokeRect(wx, winY, 26, 36);
      c.fillStyle = 'rgba(251,245,236,.08)';
      c.fillRect(wx + 2, winY + 2, 10, 14);
      // Sill.
      c.fillStyle = GOLD;
      c.fillRect(wx - 1, winY + 36, 28, 3);
    }

    // Door.
    const dx = x + s.w * 0.62;
    c.fillStyle = '#1a120e';
    c.fillRect(dx, gy - 52, 24, 52);
    c.strokeStyle = 'rgba(201,169,110,.35)'; c.lineWidth = 1;
    c.strokeRect(dx, gy - 52, 24, 52);
    c.fillStyle = WARM;
    c.beginPath(); c.arc(dx + 18, gy - 28, 2, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,183,54,.12)';
    c.fillRect(dx + 4, gy - 44, 10, 14);

    // Signboard.
    const sx = x + 10, sy = y + (s.floors ? 44 : 4) - 18;
    c.fillStyle = s.sign;
    rr(c, sx, sy, min(86, s.w - 20), 18, 3); c.fill();
    c.strokeStyle = 'rgba(201,169,110,.45)'; c.lineWidth = 1; c.stroke();
    txt(c, s.name.toUpperCase(), sx + min(86, s.w - 20) / 2, sy + 10, 10, GOLD, 700, 'center', F_MONO);

    // String lights.
    if (s.lamp) {
      const ly = sy - 8;
      c.strokeStyle = 'rgba(251,245,236,.15)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + 4, ly + 4); c.quadraticCurveTo(x + s.w * 0.5, ly - 6, x + s.w - 4, ly + 4); c.stroke();
      for (let k = 0; k < 6; k++) {
        const lx = x + 10 + k * ((s.w - 20) / 5);
        const pulse = 0.55 + 0.35 * sin(G.t * 3 + k + x * 0.01);
        c.fillStyle = 'rgba(255,183,54,' + pulse + ')';
        c.beginPath(); c.arc(lx, ly + sin(k) * 2, 2.2, 0, TAU); c.fill();
      }
    }
  }

  function drawShops(c, w, gy) {
    const shift = G.dist * 0.42;
    const span = G.shops.length * 210;
    G.shops.forEach((s) => {
      const x = wrapX(s.x - shift, span) - 50;
      if (x > w + 20 || x + s.w < -30) return;
      drawShop(c, s, x, gy);
    });
  }

  function drawRoad(c, w, h, gy) {
    // Curb / sidewalk strip.
    c.fillStyle = '#2a241c';
    c.fillRect(0, gy - 10, w, 12);
    c.fillStyle = '#3a3428';
    c.fillRect(0, gy - 10, w, 3);
    // Wear notches on curb.
    c.fillStyle = 'rgba(15,13,10,.35)';
    for (let x = -((G.dist * 0.9) % 48); x < w; x += 48) {
      c.fillRect(x, gy - 9, 10, 2);
    }

    // Road body.
    const road = c.createLinearGradient(0, gy, 0, h);
    road.addColorStop(0, '#242018');
    road.addColorStop(0.35, '#1c1814');
    road.addColorStop(1, '#14110e');
    c.fillStyle = road; c.fillRect(0, gy, w, h - gy);

    // Asphalt wear marks / patches.
    c.fillStyle = 'rgba(0,0,0,.28)';
    for (let i = 0; i < 8; i++) {
      const px = wrapX(i * 160 - G.dist * 1.05, w + 200) - 40;
      c.beginPath(); c.ellipse(px, gy + 26 + (i % 3) * 12, 40 + (i % 4) * 10, 6, 0.12, 0, TAU); c.fill();
    }
    c.fillStyle = 'rgba(201,169,110,.1)';
    for (let i = 0; i < 6; i++) {
      const px = wrapX(i * 190 - G.dist * 1.1, w + 220) - 30;
      c.fillRect(px, gy + 20, 56 + (i % 3) * 22, 2.5);
    }
    // Crack lines.
    c.strokeStyle = 'rgba(15,13,10,.35)'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const px = wrapX(i * 280 - G.dist * 1.15, w + 260) - 20;
      c.beginPath();
      c.moveTo(px, gy + 34); c.lineTo(px + 40, gy + 38); c.lineTo(px + 70, gy + 33);
      c.stroke();
    }

    // Center dashed lane with soft edges.
    const stripe = 46;
    const off = (G.dist * 1.25) % (stripe * 2);
    for (let x = -off; x < w + 20; x += stripe * 2) {
      c.fillStyle = 'rgba(255,183,54,.28)';
      c.fillRect(x, gy + 14, 26, 5);
      c.fillStyle = 'rgba(251,245,236,.08)';
      c.fillRect(x + 2, gy + 15, 22, 2);
    }

    // Near curb shadow.
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(0, gy, w, 5);

    // Foreground grit strip.
    c.fillStyle = '#1a1612';
    c.fillRect(0, h - 14, w, 14);
    c.fillStyle = 'rgba(201,169,110,.08)';
    c.fillRect(0, h - 14, w, 2);
  }

  function drawBg(c, w, h) {
    const gy = groundY();
    drawSky(c, w, h, gy);
    drawRoofs(c, w, gy);
    drawShops(c, w, gy);
    drawRoad(c, w, h, gy);
  }

  function drawScooter(c, x, gy) {
    c.save();
    c.translate(x, gy);
    // Shadow.
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(26, -2, 28, 5, 0, 0, TAU); c.fill();
    // Deck.
    c.fillStyle = '#1a1814';
    rr(c, 4, -18, 46, 12, 4); c.fill();
    c.fillStyle = PRIM;
    c.fillRect(20, -20, 18, 4);
    // Front stem + handle.
    c.strokeStyle = '#2a2420'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(42, -18); c.lineTo(46, -40); c.stroke();
    c.strokeStyle = GOLD; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(38, -40); c.lineTo(54, -38); c.stroke();
    // Seat.
    c.fillStyle = '#3a2a22';
    rr(c, 14, -28, 16, 8, 3); c.fill();
    // Rider silhouette.
    c.fillStyle = '#2a1c18';
    c.beginPath(); c.arc(22, -38, 6, 0, TAU); c.fill();
    c.fillStyle = PRIM;
    rr(c, 14, -34, 16, 12, 3); c.fill();
    // Wheels.
    c.fillStyle = '#0F0D0A';
    c.beginPath(); c.arc(12, -6, 8, 0, TAU); c.fill();
    c.beginPath(); c.arc(44, -6, 8, 0, TAU); c.fill();
    c.strokeStyle = GOLD; c.lineWidth = 1.5;
    c.beginPath(); c.arc(12, -6, 4, 0, TAU); c.stroke();
    c.beginPath(); c.arc(44, -6, 4, 0, TAU); c.stroke();
    // Headlight.
    c.fillStyle = WARM;
    c.beginPath(); c.arc(50, -28, 2.5, 0, TAU); c.fill();
    c.restore();
  }

  function drawCart(c, x, gy) {
    c.save();
    c.translate(x, gy);
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(34, -2, 34, 5, 0, 0, TAU); c.fill();
    // Bed.
    c.fillStyle = '#5a3a22';
    rr(c, 2, -30, 64, 22, 4); c.fill();
    c.fillStyle = 'rgba(0,0,0,.2)';
    c.fillRect(2, -14, 64, 6);
    // Canopy.
    c.fillStyle = '#c45a3a';
    c.beginPath();
    c.moveTo(0, -42); c.lineTo(68, -42); c.lineTo(64, -30); c.lineTo(4, -30);
    c.closePath(); c.fill();
    c.fillStyle = GOLD;
    c.fillRect(8, -40, 52, 3);
    // Goods crates.
    c.fillStyle = WARM; c.fillRect(10, -28, 14, 10);
    c.fillStyle = PRIM; c.fillRect(28, -26, 12, 8);
    c.fillStyle = '#3a4a2a'; c.fillRect(44, -28, 14, 10);
    // Wheels.
    c.fillStyle = '#0F0D0A';
    c.beginPath(); c.arc(16, -6, 9, 0, TAU); c.fill();
    c.beginPath(); c.arc(52, -6, 9, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(201,169,110,.5)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(16, -6, 4, 0, TAU); c.stroke();
    c.beginPath(); c.arc(52, -6, 4, 0, TAU); c.stroke();
    // Pull handle.
    c.strokeStyle = '#2a1c14'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(66, -24); c.lineTo(78, -36); c.stroke();
    c.restore();
  }

  function drawCloth(c, x, gy, o) {
    const sway = sin(G.t * 2.4 + (o.sway || 0)) * 6;
    c.save();
    // Line.
    c.strokeStyle = 'rgba(201,169,110,.85)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, gy - 102); c.lineTo(x + 90, gy - 100); c.stroke();
    c.fillStyle = GOLD;
    c.beginPath(); c.arc(x, gy - 102, 2.5, 0, TAU); c.fill();
    c.beginPath(); c.arc(x + 90, gy - 100, 2.5, 0, TAU); c.fill();
    // Cloth panels with readable silhouettes.
    const panels = [
      { ox: 6, col: PRIM, deep: 48 },
      { ox: 34, col: '#5a7a4a', deep: 42 },
      { ox: 58, col: WARM, deep: 50 },
    ];
    panels.forEach((p, i) => {
      const top = gy - 100;
      const mid = top + p.deep + sway * (i % 2 ? 1 : -1);
      c.fillStyle = p.col;
      c.beginPath();
      c.moveTo(x + p.ox, top);
      c.quadraticCurveTo(x + p.ox + 10, mid, x + p.ox + 22, top);
      c.lineTo(x + p.ox + 18, top);
      c.quadraticCurveTo(x + p.ox + 10, mid - 8, x + p.ox + 4, top);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(15,13,10,.15)';
      c.beginPath();
      c.moveTo(x + p.ox + 8, top);
      c.quadraticCurveTo(x + p.ox + 12, mid - 4, x + p.ox + 16, top);
      c.fill();
    });
    c.restore();
  }

  function drawTiffin(c, x, gy, o) {
    const bob = abs(sin(G.t * 4 + (o.bob || 0))) * 7;
    const y = gy - 30 - bob;
    c.save();
    c.fillStyle = 'rgba(0,0,0,.2)';
    c.beginPath(); c.ellipse(x + 10, gy - 4, 12, 3.5, 0, 0, TAU); c.fill();
    // Soft glow.
    c.fillStyle = 'rgba(255,183,54,.18)';
    c.beginPath(); c.arc(x + 10, y + 6, 16, 0, TAU); c.fill();
    // Stacked cans.
    for (let i = 0; i < 2; i++) {
      const cy = y - i * 9;
      c.fillStyle = i ? WARM : '#e09030';
      rr(c, x, cy, 20, 12, 4); c.fill();
      c.fillStyle = '#c45a20';
      c.fillRect(x + 2, cy + 3, 16, 2.5);
      c.fillStyle = 'rgba(251,245,236,.25)';
      c.fillRect(x + 3, cy + 1, 8, 2);
      c.strokeStyle = 'rgba(15,13,10,.35)'; c.lineWidth = 1;
      rr(c, x, cy, 20, 12, 4); c.stroke();
    }
    // Latch glint.
    c.fillStyle = GOLD;
    c.fillRect(x + 8, y - 2, 4, 3);
    c.restore();
  }

  function drawDoor(c, x, gy) {
    const deliver = G.hold > 0;
    const pulse = 0.35 + 0.25 * sin(G.t * 4);
    c.save();
    if (deliver) {
      const glow = c.createRadialGradient(x + 16, gy - 40, 4, x + 16, gy - 40, 50);
      glow.addColorStop(0, 'rgba(255,183,54,' + (0.28 + pulse * 0.2) + ')');
      glow.addColorStop(1, 'rgba(255,183,54,0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(x + 16, gy - 40, 50, 0, TAU); c.fill();
    }
    // Frame.
    c.fillStyle = '#2a1810';
    c.fillRect(x - 4, gy - 74, 40, 74);
    c.fillStyle = deliver ? '#3a2818' : '#1a120e';
    c.fillRect(x, gy - 70, 32, 70);
    c.strokeStyle = deliver ? WARM : 'rgba(201,169,110,.4)';
    c.lineWidth = deliver ? 2.5 : 1.5;
    c.strokeRect(x, gy - 70, 32, 70);
    // Panels.
    c.strokeStyle = 'rgba(251,245,236,.08)'; c.lineWidth = 1;
    c.strokeRect(x + 5, gy - 62, 22, 22);
    c.strokeRect(x + 5, gy - 34, 22, 24);
    c.fillStyle = deliver ? WARM : GOLD;
    c.beginPath(); c.arc(x + 24, gy - 36, 2.5, 0, TAU); c.fill();
    // Label chip.
    c.fillStyle = deliver ? 'rgba(255,183,54,.92)' : 'rgba(15,13,10,.85)';
    rr(c, x - 4, gy - 86, 40, 14, 4); c.fill();
    txt(c, deliver ? 'DROP' : 'DOOR', x + 16, gy - 78, 9, deliver ? BG : GOLD, 700, 'center', F_MONO);
    if (deliver) {
      c.fillStyle = 'rgba(255,105,64,' + pulse + ')';
      c.fillRect(x + 2, gy - 2, 28, 3);
    }
    c.restore();
  }

  function drawObj(c, o) {
    const x = worldX(o.x), gy = groundY();
    if (o.kind === 'scooter') drawScooter(c, x, gy);
    else if (o.kind === 'cart') drawCart(c, x, gy);
    else if (o.kind === 'cloth') drawCloth(c, x, gy, o);
    else if (o.kind === 'tiffin') drawTiffin(c, x, gy, o);
    else if (o.kind === 'door') drawDoor(c, x, gy);
  }

  function drawHero(c) {
    const gy = groundY();
    const x = 130, y = gy - 8 - G.py;
    const flash = G.inv > 0 && ((G.t * 16) | 0) % 2;
    if (flash) return;
    c.save();
    c.translate(x, y);
    c.scale(1.22, 1.22);
    // Contact shadow.
    c.fillStyle = 'rgba(0,0,0,' + (0.3 - min(0.18, G.py * 0.002)) + ')';
    c.beginPath(); c.ellipse(4, 2, G.slide > 0 ? 24 : 15, 4.5, 0, 0, TAU); c.fill();

    const bob = sin(G.run * 12) * (G.py < 1 && G.slide <= 0 ? 2.2 : 0);
    const leg = sin(G.run * 12);

    if (G.slide > 0) {
      // Slide pose: stretched body, jacket forward, dust reads behind.
      c.fillStyle = '#2a221c';
      rr(c, -24, -15, 40, 13, 6); c.fill();
      c.fillStyle = PRIM;
      rr(c, -4, -24, 30, 18, 6); c.fill();
      c.fillStyle = 'rgba(15,13,10,.22)';
      c.fillRect(6, -22, 4, 14);
      c.fillStyle = GOLD;
      c.fillRect(-4, -10, 28, 2);
      // Head + cap.
      c.fillStyle = '#5a4030';
      c.beginPath(); c.arc(28, -26, 7.5, 0, TAU); c.fill();
      c.fillStyle = '#1a120e';
      c.beginPath(); c.arc(29, -30, 5.5, PI, TAU); c.fill();
      c.fillStyle = GOLD; c.fillRect(23, -31, 12, 2);
      c.fillStyle = '#1a1814';
      rr(c, -30, -11, 12, 7, 2); c.fill();
    } else {
      // Legs cycle.
      c.fillStyle = '#241c18';
      c.save();
      c.translate(-5, -14 + bob);
      c.rotate(leg * 0.5);
      c.fillRect(-3.5, 0, 8, 17);
      c.fillStyle = '#0F0D0A'; c.fillRect(-4.5, 15, 10, 4);
      c.restore();
      c.save();
      c.fillStyle = '#241c18';
      c.translate(5, -14 + bob);
      c.rotate(-leg * 0.5);
      c.fillRect(-3.5, 0, 8, 17);
      c.fillStyle = '#0F0D0A'; c.fillRect(-4.5, 15, 10, 4);
      c.restore();

      // Torso / jacket (primary read).
      c.fillStyle = PRIM;
      rr(c, -12, -48 + bob, 24, 32, 6); c.fill();
      c.fillStyle = 'rgba(15,13,10,.2)';
      c.fillRect(-1, -46 + bob, 3, 28);
      c.fillStyle = GOLD;
      c.fillRect(-12, -20 + bob, 24, 3);
      // Collar.
      c.fillStyle = '#c45a3a';
      c.beginPath();
      c.moveTo(-10, -48 + bob); c.lineTo(0, -41 + bob); c.lineTo(10, -48 + bob);
      c.closePath(); c.fill();

      // Arms.
      c.strokeStyle = PRIM; c.lineWidth = 5.5; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-11, -40 + bob);
      c.quadraticCurveTo(-20, -28 + bob + leg * 3, -15, -16 + bob);
      c.stroke();
      c.beginPath();
      c.moveTo(11, -40 + bob);
      c.quadraticCurveTo(20, -30 + bob - leg * 3, 15, -18 + bob);
      c.stroke();

      // Head.
      c.fillStyle = '#5a4030';
      c.beginPath(); c.arc(0, -56 + bob, 8.5, 0, TAU); c.fill();
      c.fillStyle = '#1a120e';
      c.beginPath(); c.arc(0, -59 + bob, 7.5, PI, TAU); c.fill();
      c.fillStyle = GOLD;
      c.fillRect(-8, -60 + bob, 16, 2.5);
      c.fillStyle = 'rgba(251,245,236,.22)';
      c.beginPath(); c.arc(3, -55 + bob, 2.2, 0, TAU); c.fill();
    }

    // Carried tiffin stack.
    for (let i = 0; i < G.hold; i++) {
      const ty = (G.slide > 0 ? -28 : -40) - i * 8 + bob;
      const tx = G.slide > 0 ? 8 : 12;
      c.fillStyle = i % 2 ? WARM : '#e09030';
      rr(c, tx, ty, 15, 8, 2); c.fill();
      c.fillStyle = '#c45a20';
      c.fillRect(tx + 2, ty + 2, 11, 2);
      c.fillStyle = 'rgba(251,245,236,.2)';
      c.fillRect(tx + 2, ty + 1, 5, 1.5);
    }
    c.restore();
  }

  function drawDust(c) {
    G.dust.forEach((d) => {
      c.globalAlpha = clamp(d.life * 2.2, 0, 1);
      c.fillStyle = d.col;
      c.beginPath(); c.arc(d.x, d.y, d.r, 0, TAU); c.fill();
    });
    c.globalAlpha = 1;
  }

  function drawParts(c) {
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2.6, 0, 1);
      c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, p.r || 2.4, 0, TAU); c.fill();
    });
    c.globalAlpha = 1;
  }

  function drawFloats(c) {
    G.floats.forEach((f) => {
      c.globalAlpha = clamp(f.life * 1.4, 0, 1);
      txt(c, f.text, f.x, f.y, 14, f.col, 700, 'center', F_DISP);
    });
    c.globalAlpha = 1;
  }

  function drawSpeedLines(c, w, h) {
    const rush = G.mode === 'rush' || G.speed > 320;
    if (!rush && G.speed < 300) return;
    const n = rush ? 10 : 5;
    const gy = groundY();
    c.strokeStyle = rush ? 'rgba(255,105,64,.18)' : 'rgba(251,245,236,.08)';
    c.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const y = gy * 0.25 + (i * 37 + G.t * 80) % (gy * 0.55);
      const len = 30 + (i % 4) * 18;
      const x = w - wrapX(i * 93 + G.dist * 1.8, w + 80);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - len, y); c.stroke();
    }
  }

  function drawVignette(c, w, h) {
    const v = c.createRadialGradient(w * 0.5, h * 0.45, h * 0.25, w * 0.5, h * 0.5, h * 0.78);
    v.addColorStop(0, 'rgba(15,13,10,0)');
    v.addColorStop(0.7, 'rgba(15,13,10,0)');
    v.addColorStop(1, 'rgba(15,13,10,.55)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
    // Soft bottom fade into road grit.
    const b = c.createLinearGradient(0, h * 0.85, 0, h);
    b.addColorStop(0, 'rgba(15,13,10,0)');
    b.addColorStop(1, 'rgba(15,13,10,.35)');
    c.fillStyle = b; c.fillRect(0, h * 0.85, w, h * 0.15);
  }

  function chip(c, x, y, w, h, label, value, valueCol) {
    plate(c, x, y, w, h, 12);
    txt(c, label, x + 14, y + 15, 9, GOLD, 600, 'left', F_MONO);
    txt(c, value, x + 14, y + 38, 22, valueCol || INK, 500, 'left', F_DISP);
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    // On a phone the score chip narrows so it never runs under the centre chip.
    chip(c, pad.left, pad.top, min(148, w / 2 - 64 - pad.left - 8), 56, 'SCORE', String(Math.round(G.score)));

    const mid = G.clock
      ? (Math.max(0, G.clock | 0) + 's')
      : (Math.round(G.dist / 40) + ' m');
    plate(c, w / 2 - 64, pad.top, 128, 44, 12);
    txt(c, G.clock ? 'SHIFT' : 'RUN', w / 2, pad.top + 13, 9, GOLD, 600, 'center', F_MONO);
    txt(c, mid, w / 2, pad.top + 30, 18, G.clock && G.clock < 10 ? PRIM : INK, 500, 'center', F_DISP);

    // Lives as small tiffin pips.
    let hx = w - pad.right - 14;
    for (let i = 0; i < G.maxLives; i++) {
      const alive = i < G.lives;
      c.fillStyle = alive ? PRIM : 'rgba(251,245,236,.12)';
      rr(c, hx - 8 - i * 20, pad.top + 14, 14, 16, 3); c.fill();
      if (alive) {
        c.fillStyle = WARM;
        c.fillRect(hx - 6 - i * 20, pad.top + 18, 10, 2);
      }
    }

    // Hold stack chip.
    if (G.hold > 0) {
      plate(c, pad.left, pad.top + 64, 110, 36, 10);
      txt(c, 'STACK', pad.left + 12, pad.top + 74, 9, GOLD, 600, 'left', F_MONO);
      txt(c, 'x' + G.hold, pad.left + 12, pad.top + 90, 16, WARM, 600, 'left', F_DISP);
      if (G.combo >= 2) {
        txt(c, 'hot', pad.left + 72, pad.top + 82, 10, PRIM, 700, 'left', F_MONO);
      }
    }
  }

  // Tap & swipe (the shell's gesture touch style): one finger, no stick or pads.
  // The shell hides its own hint on touch, so the first seconds of play say it here.
  function gestStyle() { return !!(arc && arc.touchMode && arc.touchStyle === 'gesture'); }
  function drawTouchHint(c, lines, at) {
    if (!gestStyle() || arc.state !== 'play' || G.attract) return;
    const t = arc.time, life = 5;
    if (t >= life) return;
    const a = arc.reducedMotion ? 1 : clamp(min(t / 0.35, (life - t) / 0.7), 0, 1);
    const w = arc.w, bw = min(w - 32, 340), lh = 19, bh = 20 + lines.length * lh;
    const pad = arc.hudPad ? arc.hudPad() : { bottom: 64 };
    const x = (w - bw) / 2, y = at != null ? at : arc.h - pad.bottom - bh - 14;
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
    const w = arc.w, h = arc.h;
    c.clearRect(0, 0, w, h);
    drawBg(c, w, h);
    G.objs.forEach((o) => drawObj(c, o));
    drawDust(c);
    drawHero(c);
    drawParts(c);
    drawFloats(c);
    drawSpeedLines(c, w, h);
    drawVignette(c, w, h);
    if (arc.state === 'play' && !G.attract) drawHUD(c);
    drawTouchHint(c, ['Tap or swipe up to jump', 'Swipe down to slide under the cloth']);
  }

  function dbg() {
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, dist: Math.round(G.dist), speed: Math.round(G.speed), score: Math.round(G.score),
      lives: G.lives, hold: G.hold, py: +G.py.toFixed(1), slide: +G.slide.toFixed(2),
      objs: G.objs.length, combo: G.combo, attract: !!G.attract, touchActs: G.touchActs, touchStyle: arc.touchStyle,
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
    touch: { stick: false, pads: [{ label: 'Jump', key: 'Space', big: true, hot: true }, { label: 'Slide', key: 'ArrowDown' }] },
    touchKeys: [['Jump', 'Scooters and carts'], ['Slide', 'Hanging cloth']],
    gestures: {
      drag: false,
      hint: 'Tap or swipe up to jump, swipe down to slide',
      keys: [['Tap / swipe up', 'Jump the scooters and carts'], ['Swipe down', 'Slide under hanging cloth'], ['Swipe down in the air', 'Drop fast']],
    },
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Arcade runner',
      title: 'Tiffin <em>Dash</em>',
      html: '<p>A side-street dash with a stack of lunches. Jump the scooters, slide under the cloth lines, pick up tiffins and drop them at the marked doors.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'street', choices: [{ v: 'street', label: 'Street run' }, { v: 'shift', label: 'Lunch shift' }, { v: 'rush', label: 'Rush hour' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Score<b>' + Math.round(G.score) + '</b></div><div>Distance<b>' + Math.round(G.dist / 40) + ' m</b></div></div>'; },
    onMenu(a) { arc = a; reset(true); },
    init(a) { arc = a; a.debug = dbg; G.D = DIFF.normal; reset(true); a.menu(); a.showStick && a.showStick(false); },
    start(a, ch) {
      arc = a; reset(false, ch);
      const label = G.mode === 'shift' ? 'Ninety seconds' : G.mode === 'rush' ? 'Rush hour' : 'Street run';
      arc.toast(label, 'Tiffin Dash', 1400);
    },
    update, idle, render,
  });
})();
