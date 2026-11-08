/*
 * Sky Thread: kite fighting over an invented neighbourhood at dusk.
 * Original world, drawn in code on the Arcade shell.
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
  const BG = '#0F0D0A', DEEP = '#060503';
  const COLS = ['#FF6940', '#FFB736', '#c9a96e', '#FBF5EC', '#e07a9a', '#7ec8e3'];

  let arc;
  const DIFF = {
    easy: { rivals: 3, ai: 0.72, spawn: 5.2 },
    normal: { rivals: 4, ai: 0.95, spawn: 4 },
    hard: { rivals: 5, ai: 1.22, spawn: 2.8 },
  };
  const G = {
    t: 0, time: 90, score: 0, cuts: 0, alive: true, phase: 'fly',
    me: null, rivals: [], wind: { x: 0.4, y: 0.15 }, parts: [], pops: [],
    roofs: [], farRoofs: [], birds: [], leaves: [], attract: true,
    mode: 'dusk', diff: 'normal',
    hintT: 0, yank: 0, drag0: null, yanks: 0,
  };
  // Fingers on the canvas, counted here: the shell's gesture follows only the
  // first one, and a second finger held down is how a steering thumb pulls.
  const fingers = new Set();

  function kite(col, x, y, ai) {
    return {
      x, y, vx: 0, vy: 0, col, pull: 0, alive: true,
      tail: [], ribbons: [], cutT: 0, ai: ai || null, bob: rnd() * TAU,
      pat: (rnd() * 3) | 0,
    };
  }

  function mkRoofs(seed, dens) {
    // Positions are 0..1 across the horizon so the skyline fills any canvas width.
    const rng = A.rng(seed);
    const out = [];
    let x = -0.04;
    while (x < 1.08) {
      const w = dens + rng() * dens * 1.2;
      const floors = 1 + ((rng() * 3) | 0);
      const wins = [];
      const cols = 2 + ((rng() * 4) | 0);
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          if (rng() > 0.22) wins.push({ f, c, on: rng() > 0.3, warm: rng() > 0.5 });
        }
      }
      out.push({
        x, w, h: 0.06 + floors * 0.045 + rng() * 0.06, floors, cols,
        a: 0.32 + rng() * 0.45, tank: rng() > 0.48, dish: rng() > 0.6,
        ant: rng() > 0.38, peak: 0.018 + rng() * 0.025, wins,
        shade: rng() * 0.18,
      });
      x += w - dens * 0.18 - rng() * dens * 0.12;
    }
    return out;
  }

  function mkBirds() {
    const out = [];
    for (let i = 0; i < 7; i++) {
      out.push({
        x: rnd(), y: 0.08 + rnd() * 0.28, spd: 0.018 + rnd() * 0.03,
        bob: rnd() * TAU, sz: 2.2 + rnd() * 2.4, flip: rnd() > 0.5 ? 1 : -1,
      });
    }
    return out;
  }

  function mkLeaves() {
    const out = [];
    for (let i = 0; i < 10; i++) {
      out.push({
        x: rnd(), y: 0.2 + rnd() * 0.55, vx: 0.02 + rnd() * 0.04,
        spin: rnd() * TAU, spinV: 1.2 + rnd() * 2.4,
        sz: 3 + rnd() * 4, col: rnd() > 0.5 ? GOLD : PRIM,
      });
    }
    return out;
  }

  G.roofs = mkRoofs(11, 0.055);
  G.farRoofs = mkRoofs(29, 0.07);
  G.birds = mkBirds();
  G.leaves = mkLeaves();

  function resetWorld(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'dusk';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    G.t = 0; G.time = G.mode === 'dusk' ? 90 : 0; G.score = 0; G.cuts = 0; G.alive = true; G.phase = 'fly';
    G.parts.length = 0; G.pops.length = 0; G.attract = !!attract;
    G.me = kite(PRIM, 0.5, 0.58, null);
    G.rivals = [];
    const spots = [[0.16, 0.22], [0.84, 0.22], [0.18, 0.38], [0.82, 0.4], [0.5, 0.16]];
    const n = min(spots.length, G.D.rivals);
    for (let i = 0; i < n; i++) {
      G.rivals.push(kite(COLS[(i + 1) % COLS.length], spots[i][0], spots[i][1], {
        tx: spots[i][0], ty: spots[i][1], wait: 1.2 + rnd() * 1.4,
      }));
    }
    G.wind = { x: 0.35, y: 0.12 };
    G.grace = 2.8;
    G.cutCool = 0;
    G.spawnT = attract ? 0 : 1.2;
    G.crossSpark = 0;
    G.hintT = 0; G.yank = 0; G.drag0 = null; G.yanks = 0;
  }

  function handOf() {
    return { x: arc.w * 0.5, y: arc.h * 0.86 };
  }

  function segs(k) {
    const h = handOf();
    const kx = k.x * arc.w, ky = k.y * arc.h;
    return [
      { x: h.x, y: h.y },
      { x: lerp(h.x, kx, 0.45) + sin(G.t * 1.3 + k.bob) * 18, y: lerp(h.y, ky, 0.55) },
      { x: kx, y: ky },
    ];
  }

  function intersect(a, b, c, d) {
    const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (abs(den) < 1e-6) return null;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
    const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / den;
    if (t > 0.08 && t < 0.96 && u > 0.08 && u < 0.96) {
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
    return null;
  }

  function threadHit(a, b) {
    const sa = segs(a), sb = segs(b);
    for (let i = 0; i < sa.length - 1; i++) {
      for (let j = 0; j < sb.length - 1; j++) {
        const p = intersect(sa[i], sa[i + 1], sb[j], sb[j + 1]);
        if (p) return p;
      }
    }
    return null;
  }

  function sparkBurst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 60 + rnd() * 180;
      G.parts.push({
        kind: 'spark', x, y, vx: cos(a) * sp, vy: sin(a) * sp - 40,
        life: 0.25 + rnd() * 0.35, max: 0.6, col: rnd() > 0.4 ? WARM : GOLD, sz: 1.2 + rnd() * 2,
      });
    }
  }

  function shredBurst(x, y, col) {
    for (let i = 0; i < 14; i++) {
      const a = rnd() * TAU, sp = 30 + rnd() * 110;
      G.parts.push({
        kind: 'shred', x, y, vx: cos(a) * sp, vy: sin(a) * sp - 30,
        life: 0.7 + rnd() * 0.6, max: 1.3, col, sz: 3 + rnd() * 5,
        rot: rnd() * TAU, rv: (rnd() - 0.5) * 8, tw: 0.4 + rnd() * 0.8,
      });
    }
    sparkBurst(x, y, 10);
  }

  function floatPop(x, y, label, pts) {
    G.pops.push({ x, y, label, pts, life: 1.1, max: 1.1 });
  }

  function cutKite(k, byMe) {
    if (!k.alive) return;
    k.alive = false; k.cutT = 0;
    const px = k.x * arc.w, py = k.y * arc.h;
    shredBurst(px, py, k.col);
    arc.sfx.tone(byMe ? 740 : 180, 0.18, { type: 'sawtooth', slide: byMe ? 420 : 90, vol: 0.14 });
    if (byMe) {
      const pts = 100 + G.cuts * 20;
      G.cuts++; G.score += pts;
      floatPop(px, py - 12, 'CUT', '+' + pts);
      arc.toast('Thread cut', '+' + pts, 900);
    }
  }

  // Tap & swipe: drag anywhere and the kite follows the finger's movement
  // (relative, so the thumb never covers it), tap to yank the string for a
  // moment, or rest a second finger anywhere to keep pulling.
  // Tilt to steer: lean the phone, hold any finger down to pull.
  function touchStyle() {
    const p = arc.input.pointer;
    if (!arc.touchMode || arc.touchStyle === 'pads' || !p || p.type === 'mouse') return '';
    return arc.touchStyle;
  }

  function steerTouch(dt, style) {
    const inp = arc.input, ax = inp.axis(), gz = inp.gesture, me = G.me;
    if (inp.tap()) {
      G.yank = 0.9; G.yanks++;
      arc.sfx.tone(520, 0.06, { type: 'triangle', vol: 0.07 });
    }
    G.yank = max(0, G.yank - dt);
    const keyPull = inp.down('Space', 'KeyJ', 'ShiftLeft', 'ShiftRight');
    const n = fingers.size;
    const pull = keyPull || G.yank > 0 || n >= 2 || (style === 'tilt' && n >= 1) ? 1 : 0;
    me.pull = lerp(me.pull, pull, 1 - Math.exp(-dt * 8));
    if (style === 'gesture' && gz.active && gz.type !== 'mouse') {
      if (!G.drag0) G.drag0 = { fx: gz.x, fy: gz.y, x: me.x, y: me.y };
      const d = G.drag0;
      const tx = clamp(d.x + ((gz.x - d.fx) / arc.w) * 1.6, 0.08, 0.92);
      const ty = clamp(d.y + ((gz.y - d.fy) / arc.h) * 1.6, 0.08, 0.72);
      const k = 1 - Math.exp(-dt * 10);
      me.vx = lerp(me.vx, (tx - me.x) * 5, k);
      me.vy = lerp(me.vy, (ty - me.y) * 5, k);
    } else {
      G.drag0 = null;
    }
    me.vx += ax.x * dt * 1.6;
    me.vy += ax.y * dt * 1.6;
  }

  function steerMe(dt) {
    const inp = arc.input, ax = inp.axis(), p = inp.pointer;
    const ts = touchStyle();
    if (ts) {
      steerTouch(dt, ts);
      G.me.vx += G.wind.x * dt * 0.35;
      G.me.vy += (G.wind.y - 0.18) * dt * 0.4;
      G.me.vx *= Math.exp(-dt * 1.8); G.me.vy *= Math.exp(-dt * 1.8);
      G.me.x = clamp(G.me.x + G.me.vx * dt, 0.08, 0.92);
      G.me.y = clamp(G.me.y + G.me.vy * dt, 0.08, 0.72);
      return;
    }
    const pull = (inp.action() || inp.down('ShiftLeft', 'ShiftRight')) ? 1 : 0;
    G.me.pull = lerp(G.me.pull, pull, 1 - Math.exp(-dt * 8));
    const keyed = abs(ax.x) > 0.08 || abs(ax.y) > 0.08;
    // While holding pull, mouse only pulls. Steering stays on keys / stick so a
    // click does not yank the kite into a rival line.
    if (!keyed && !pull && p && p.seen) {
      G.me.vx += (p.nx - G.me.x) * dt * 2.6;
      G.me.vy += (clamp(p.ny, 0.06, 0.72) - G.me.y) * dt * 2.6;
    }
    G.me.vx += ax.x * dt * 1.6;
    G.me.vy += ax.y * dt * 1.6;
    G.me.vx += G.wind.x * dt * 0.35;
    G.me.vy += (G.wind.y - 0.18) * dt * 0.4;
    G.me.vx *= Math.exp(-dt * 1.8); G.me.vy *= Math.exp(-dt * 1.8);
    G.me.x = clamp(G.me.x + G.me.vx * dt, 0.08, 0.92);
    G.me.y = clamp(G.me.y + G.me.vy * dt, 0.08, 0.72);
  }

  function steerAI(k, dt) {
    const ai = k.ai;
    ai.wait -= dt;
    if (ai.wait <= 0) {
      ai.tx = 0.12 + rnd() * 0.76; ai.ty = 0.12 + rnd() * 0.55;
      ai.wait = 1.2 + rnd() * 2.2;
    }
    const aiMul = (G.D || DIFF.normal).ai;
    k.vx += (ai.tx - k.x) * dt * 0.9 * aiMul;
    k.vy += (ai.ty - k.y) * dt * 0.9 * aiMul;
    k.vx += G.wind.x * dt * 0.25; k.vy += G.wind.y * dt * 0.2;
    k.vx *= Math.exp(-dt * 1.4); k.vy *= Math.exp(-dt * 1.4);
    k.x = clamp(k.x + k.vx * dt, 0.06, 0.94);
    k.y = clamp(k.y + k.vy * dt, 0.08, 0.7);
    const near = hypot(k.x - G.me.x, k.y - G.me.y) < 0.16;
    // Rivals only yank hard after the player has had a real start.
    const want = near && G.t > 4.5 ? 0.72 : 0.22;
    k.pull = lerp(k.pull, want, dt * 1.6);
  }

  function stepKite(k, dt) {
    k.bob += dt;
    k.tail.unshift({ x: k.x, y: k.y });
    if (k.tail.length > 28) k.tail.pop();
    // Ribbon segments trail behind with wind sway.
    const need = 8;
    while (k.ribbons.length < need) {
      k.ribbons.push({ ox: 0, oy: 0, w: 4 + rnd() * 5, col: rnd() > 0.5 ? k.col : GOLD });
    }
    if (!k.alive) {
      k.cutT += dt; k.vy += dt * 0.55;
      k.y += k.vy * dt * 0.4; k.x += sin(k.cutT * 3) * dt * 0.08;
    }
  }

  function fights(dt) {
    if (!G.me.alive || G.t < (G.grace || 0) || G.cutCool > 0) return;
    G.rivals.forEach((r) => {
      if (!r.alive) return;
      const hit = threadHit(G.me, r);
      if (!hit) return;
      const mine = G.me.pull, theirs = r.pull;
      // Manja spark when lines cross, even before a cut resolves.
      if (G.crossSpark <= 0) {
        sparkBurst(hit.x, hit.y, 6);
        G.crossSpark = 0.12;
      }
      // You win any cross while pulling. You only lose if you are gliding and
      // they are clearly yanking. Crossing with both gliding does nothing.
      if (mine >= 0.45 && mine + 0.05 >= theirs) {
        cutKite(r, true); G.cutCool = 0.55;
      } else if (theirs >= 0.55 && mine < 0.35) {
        cutKite(G.me, false); G.alive = false; G.phase = 'cut';
      }
    });
  }

  function spawnRival() {
    const live = G.rivals.filter((r) => r.alive).length;
    if (live >= (G.D || DIFF.normal).rivals) return;
    G.rivals.push(kite(COLS[(rnd() * COLS.length) | 0], rnd() > 0.5 ? 0.08 : 0.92, 0.15 + rnd() * 0.4, {
      tx: 0.3 + rnd() * 0.4, ty: 0.25 + rnd() * 0.35, wait: 0.4,
    }));
  }

  function finish(why) {
    if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
    G.phase = 'over';
    arc.over({
      eyebrow: why, title: G.cuts >= 6 ? 'Sky <em>cleared</em>' : 'Thread <em>cut</em>',
      score: G.score, scoreLabel: 'Score',
      html: '<p>' + G.cuts + ' rival threads cut' + (G.alive ? ', and yours held.' : '.') + '</p>',
      again: 'Fly again',
    });
  }

  function update(dt) {
    G.t += dt; G.hintT += dt; G.cutCool = max(0, (G.cutCool || 0) - dt);
    G.crossSpark = max(0, (G.crossSpark || 0) - dt);
    if (G.mode === 'dusk') G.time -= dt;
    G.wind.x = 0.25 + 0.35 * sin(G.t * 0.35);
    G.wind.y = 0.08 + 0.12 * cos(G.t * 0.27);
    if (G.phase === 'over') return;
    if (G.alive) steerMe(dt);
    G.rivals.forEach((r) => { if (r.alive) steerAI(r, dt); });
    stepKite(G.me, dt);
    G.rivals.forEach((r) => stepKite(r, dt));
    fights(dt);
    G.spawnT = (G.spawnT || 0) + dt;
    const spawnEvery = (G.D || DIFF.normal).spawn;
    if (G.spawnT >= spawnEvery) { G.spawnT = 0; spawnRival(); }

    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += (p.kind === 'shred' ? 55 : 30) * dt;
      p.vx *= Math.exp(-dt * 0.6);
      if (p.rot != null) p.rot += (p.rv || 0) * dt;
      if (p.life <= 0) G.parts.splice(i, 1);
    }
    for (let i = G.pops.length - 1; i >= 0; i--) {
      const p = G.pops[i];
      p.life -= dt; p.y -= 28 * dt;
      if (p.life <= 0) G.pops.splice(i, 1);
    }
    G.birds.forEach((b) => {
      b.x += b.spd * b.flip * dt * (0.7 + G.wind.x);
      b.bob += dt * 4;
      if (b.x > 1.1) { b.x = -0.05; b.y = 0.08 + rnd() * 0.28; }
      if (b.x < -0.1) { b.x = 1.05; b.y = 0.08 + rnd() * 0.28; }
    });
    G.leaves.forEach((l) => {
      l.x += (l.vx + G.wind.x * 0.04) * dt;
      l.y += sin(G.t * 1.4 + l.spin) * dt * 0.04;
      l.spin += l.spinV * dt;
      if (l.x > 1.08) { l.x = -0.04; l.y = 0.2 + rnd() * 0.5; }
    });

    if (!G.alive && G.me.cutT > 2.6) finish('Your thread');
    else if (G.mode === 'dusk' && G.time <= 0) { G.time = 0; finish('Dusk'); }
    else if (G.mode === 'hunt' && G.alive && G.cuts >= 6) finish('Sky cleared');
    G.score += dt * 2;
  }

  function idle(dt, a) {
    if (a && a.state === 'pause') return;
    G.t += dt; G.attract = true;
    if (!G.me) resetWorld(true);
    G.wind.x = 0.3 + 0.2 * sin(G.t * 0.4);
    G.me.x = 0.42 + 0.12 * sin(G.t * 0.6);
    G.me.y = 0.42 + 0.08 * cos(G.t * 0.5);
    G.me.pull = 0.4;
    G.rivals.forEach((r, i) => {
      r.x = 0.25 + 0.15 * sin(G.t * 0.5 + i) + i * 0.12;
      r.y = 0.28 + 0.12 * cos(G.t * 0.4 + i);
      stepKite(r, dt);
    });
    stepKite(G.me, dt);
    G.birds.forEach((b) => { b.x += b.spd * b.flip * dt * 0.5; b.bob += dt * 3; if (b.x > 1.1) b.x = -0.05; });
    G.leaves.forEach((l) => { l.x += l.vx * dt; l.spin += l.spinV * dt; if (l.x > 1.08) l.x = -0.04; });
  }

  function rr(c, x, y, w, h, r) {
    r = min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function plate(c, x, y, w, h, r) {
    c.fillStyle = 'rgba(15,13,10,.72)'; rr(c, x, y, w, h, r); c.fill();
    c.strokeStyle = 'rgba(251,245,236,.12)'; c.stroke();
  }
  function txt(c, s, x, y, size, col, wgt, align, font) {
    c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
    c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle';
    c.fillText(s, x, y);
  }

  function drawSky(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1238');
    g.addColorStop(0.18, '#3a2048');
    g.addColorStop(0.38, '#c45b3a');
    g.addColorStop(0.58, '#e88848');
    g.addColorStop(0.78, '#f0a05a');
    g.addColorStop(1, '#2a1810');
    c.fillStyle = g; c.fillRect(0, 0, w, h);

    // Horizontal dusk bands.
    for (let i = 0; i < 5; i++) {
      const y = h * (0.28 + i * 0.08);
      const band = c.createLinearGradient(0, y - 10, 0, y + 14);
      band.addColorStop(0, 'rgba(251,245,236,0)');
      band.addColorStop(0.5, 'rgba(255,183,54,' + (0.04 + i * 0.012) + ')');
      band.addColorStop(1, 'rgba(251,245,236,0)');
      c.fillStyle = band; c.fillRect(0, y - 10, w, 24);
    }

    // Soft haze ellipses.
    for (let i = 0; i < 5; i++) {
      const hx = w * (0.18 + i * 0.16);
      const hy = h * (0.22 + i * 0.07) + sin(G.t * 0.28 + i) * 5;
      c.fillStyle = 'rgba(251,245,236,' + (0.035 + i * 0.008) + ')';
      c.beginPath(); c.ellipse(hx, hy, 70 + i * 28, 10 + i * 2, 0, 0, TAU); c.fill();
    }

    // Moon with soft glow.
    const mx = w * 0.82, my = h * 0.13;
    const glow = c.createRadialGradient(mx, my, 8, mx, my, 110);
    glow.addColorStop(0, 'rgba(251,245,236,.22)');
    glow.addColorStop(0.45, 'rgba(201,169,110,.08)');
    glow.addColorStop(1, 'rgba(251,245,236,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(mx, my, 110, 0, TAU); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(mx, my, 22, 0, TAU); c.fill();
    c.fillStyle = 'rgba(201,169,110,.35)'; c.beginPath(); c.arc(mx - 6, my - 4, 22, 0, TAU); c.fill();
    c.fillStyle = INK; c.beginPath(); c.arc(mx, my, 20, 0, TAU); c.fill();

    // Distant birds as tiny V marks.
    G.birds.forEach((b) => {
      const bx = b.x * w, by = b.y * h + sin(b.bob) * 3;
      c.strokeStyle = 'rgba(15,13,10,.35)'; c.lineWidth = 1.2; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(bx - b.sz, by + sin(b.bob * 2) * 1.5);
      c.quadraticCurveTo(bx, by - b.sz * 0.6, bx + b.sz, by + sin(b.bob * 2 + 1) * 1.5);
      c.stroke();
    });
  }

  function drawRoofRow(c, roofs, w, h, gy, scroll, alphaMul, detail) {
    const span = w * 1.15;
    roofs.forEach((r) => {
      let xn = r.x + G.t * scroll;
      xn = ((xn % 1.15) + 1.15) % 1.15;
      const rw = max(28, r.w * w);
      const rh = max(28, r.h * h * 0.5);
      const x = xn * span - w * 0.08;
      const top = gy - rh;
      const peak = max(8, r.peak * h * 0.5);
      const baseA = (0.5 + r.a * 0.45) * alphaMul;
      c.fillStyle = 'rgba(' + (18 + r.shade * 40 | 0) + ',' + (14 + r.shade * 20 | 0) + ',16,' + baseA + ')';
      c.fillRect(x, top, rw, rh);

      // Roof peak.
      c.fillStyle = 'rgba(42,32,28,' + (0.85 * alphaMul) + ')';
      c.beginPath();
      c.moveTo(x - 3, top);
      c.lineTo(x + rw * 0.5, top - peak);
      c.lineTo(x + rw + 3, top);
      c.closePath(); c.fill();

      if (detail) {
        // Glowing windows.
        const cellW = (rw - 8) / max(1, r.cols);
        const winH = max(5, rh * 0.12);
        r.wins.forEach((win) => {
          const wx = x + 4 + win.c * cellW + 1;
          const wy = top + 6 + win.f * (winH + 5);
          if (wy + winH > gy - 4) return;
          if (win.on) {
            c.fillStyle = win.warm ? 'rgba(255,183,54,.65)' : 'rgba(255,105,64,.5)';
            c.fillRect(wx, wy, max(5, cellW - 5), winH);
            c.fillStyle = win.warm ? 'rgba(255,183,54,.15)' : 'rgba(255,105,64,.12)';
            c.fillRect(wx - 1, wy - 1, max(7, cellW - 3), winH + 2);
          } else {
            c.fillStyle = 'rgba(6,5,3,.55)';
            c.fillRect(wx, wy, max(5, cellW - 5), winH);
          }
        });

        // Water tank.
        if (r.tank) {
          const tw = max(12, rw * 0.18), th = max(11, rh * 0.16);
          const tx = x + rw * 0.55, ty = top - peak - th - 2;
          c.fillStyle = '#6a4a38';
          c.fillRect(tx, ty, tw, th);
          c.fillStyle = '#8a6a50';
          c.beginPath(); c.ellipse(tx + tw * 0.5, ty, tw * 0.5, 3.5, 0, 0, TAU); c.fill();
          c.strokeStyle = 'rgba(201,169,110,.55)'; c.lineWidth = 1.2;
          c.strokeRect(tx, ty, tw, th);
          // Leg posts.
          c.strokeStyle = 'rgba(90,64,48,.8)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(tx + 2, ty + th); c.lineTo(tx + 2, top); c.stroke();
          c.beginPath(); c.moveTo(tx + tw - 2, ty + th); c.lineTo(tx + tw - 2, top); c.stroke();
        }

        // TV antenna.
        if (r.ant) {
          const ax = x + rw * 0.28, ay = top - peak;
          c.strokeStyle = 'rgba(201,169,110,.7)'; c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, ay - 20); c.stroke();
          c.beginPath(); c.moveTo(ax - 10, ay - 10); c.lineTo(ax + 10, ay - 15); c.stroke();
          c.beginPath(); c.moveTo(ax - 8, ay - 14); c.lineTo(ax + 8, ay - 18); c.stroke();
          c.fillStyle = GOLD;
          c.beginPath(); c.arc(ax, ay - 20, 1.6, 0, TAU); c.fill();
        }

        // Satellite dish.
        if (r.dish) {
          const dx = x + rw * 0.78, dy = top - 4;
          c.strokeStyle = 'rgba(201,169,110,.65)'; c.lineWidth = 1.6;
          c.beginPath(); c.arc(dx, dy, 6, -0.5, PI * 0.95); c.stroke();
          c.beginPath(); c.moveTo(dx, dy); c.lineTo(dx + 7, dy - 6); c.stroke();
        }
      }
    });
  }

  function drawNeighbourhood(c, w, h) {
    const gyFar = h * 0.72;
    const gy = h * 0.78;
    drawRoofRow(c, G.farRoofs, w, h, gyFar, 0.012, 0.55, false);
    // Mid haze strip between layers.
    c.fillStyle = 'rgba(240,160,90,.08)';
    c.fillRect(0, gyFar - 6, w, 20);
    drawRoofRow(c, G.roofs, w, h, gy, 0.022, 1, true);
    c.fillStyle = DEEP; c.fillRect(0, gy, w, h - gy);
    const rim = c.createLinearGradient(0, gy - 22, 0, gy + 4);
    rim.addColorStop(0, 'rgba(255,105,64,0)');
    rim.addColorStop(0.7, 'rgba(255,105,64,.1)');
    rim.addColorStop(1, 'rgba(15,13,10,.9)');
    c.fillStyle = rim; c.fillRect(0, gy - 22, w, 26);
  }

  function drawLeaves(c, w, h) {
    G.leaves.forEach((l) => {
      const x = l.x * w, y = l.y * h;
      c.save();
      c.translate(x, y); c.rotate(l.spin);
      c.globalAlpha = 0.55;
      c.fillStyle = l.col;
      c.beginPath();
      c.ellipse(0, 0, l.sz, l.sz * 0.45, 0, 0, TAU);
      c.fill();
      c.restore();
    });
  }

  function drawWindSock(c, w, h) {
    const sx = w * 0.1, sy = h * 0.735;
    const flap = sin(G.t * 3.2) * 0.35 + G.wind.x * 0.5;
    c.strokeStyle = 'rgba(201,169,110,.7)'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(sx, sy + 32); c.lineTo(sx, sy - 22); c.stroke();
    c.fillStyle = GOLD;
    c.beginPath(); c.arc(sx, sy - 22, 3, 0, TAU); c.fill();
    c.fillStyle = PRIM;
    c.beginPath();
    c.moveTo(sx, sy - 18);
    c.lineTo(sx + 28 + flap * 14, sy - 12 + sin(G.t * 5) * 3);
    c.lineTo(sx + 26 + flap * 14, sy + sin(G.t * 5 + 1) * 3);
    c.lineTo(sx, sy + 2);
    c.closePath(); c.fill();
    c.fillStyle = WARM;
    c.fillRect(sx + 5, sy - 16, 3.5, 14);
    c.fillRect(sx + 12, sy - 14, 3.5, 12);
    c.fillStyle = INK;
    c.fillRect(sx + 19, sy - 12, 3, 10);
  }

  function drawHand(c, w, h) {
    const hand = handOf();
    const pull = G.me ? G.me.pull : 0;
    // Forearm silhouette.
    c.fillStyle = 'rgba(26,24,20,.95)';
    c.beginPath();
    c.moveTo(hand.x - 36, h);
    c.quadraticCurveTo(hand.x - 28, hand.y + 24, hand.x - 18, hand.y + 8);
    c.lineTo(hand.x + 18, hand.y + 8);
    c.quadraticCurveTo(hand.x + 28, hand.y + 24, hand.x + 36, h);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(201,169,110,.2)'; c.lineWidth = 1;
    c.stroke();

    // Reel cylinder.
    c.save();
    c.translate(hand.x, hand.y);
    c.fillStyle = '#1A1814';
    c.beginPath(); c.ellipse(0, 4, 22, 10, 0, 0, TAU); c.fill();
    c.fillStyle = '#3D3830';
    c.fillRect(-20, -12, 40, 16);
    c.fillStyle = '#2A261F';
    c.beginPath(); c.ellipse(0, -12, 22, 9, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(201,169,110,.4)'; c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(0, -12, 22, 9, 0, 0, TAU); c.stroke();
    // Wound thread bands.
    c.strokeStyle = pull > 0.45 ? WARM : GOLD; c.lineWidth = 1.8;
    for (let i = 0; i < 5; i++) {
      c.beginPath(); c.ellipse(0, -10 + i * 3.2, 18 - i * 0.4, 6, 0, 0.15, PI - 0.15); c.stroke();
    }
    // Handle peg.
    c.fillStyle = GOLD;
    c.beginPath(); c.arc(17, -2, 4.2, 0, TAU); c.fill();
    c.fillStyle = WARM;
    c.beginPath(); c.arc(17, -2, 1.8, 0, TAU); c.fill();
    if (pull > 0.45) {
      c.strokeStyle = 'rgba(255,183,54,.5)'; c.lineWidth = 2.2;
      c.beginPath(); c.arc(0, 0, 30 + pull * 7, 0, TAU); c.stroke();
    }
    c.restore();

    // Fingers gripping.
    c.fillStyle = 'rgba(42,38,32,.98)';
    for (let i = 0; i < 4; i++) {
      const fx = hand.x - 12 + i * 8;
      c.beginPath();
      c.moveTo(fx, hand.y + 6);
      c.quadraticCurveTo(fx + 2.5, hand.y - 10 - (i === 1 || i === 2 ? 4 : 0), fx + 5, hand.y + 6);
      c.fill();
    }
  }

  function drawThread(c, k, you) {
    const s = segs(k);
    c.lineCap = 'round'; c.lineJoin = 'round';
    // Soft shadow under the string.
    c.strokeStyle = 'rgba(6,5,3,.25)'; c.lineWidth = you ? 3.2 : 2.2;
    c.beginPath(); c.moveTo(s[0].x + 1, s[0].y + 2);
    for (let i = 1; i < s.length; i++) c.lineTo(s[i].x + 1, s[i].y + 2);
    c.stroke();
    c.strokeStyle = you ? (k.pull > 0.45 ? WARM : 'rgba(255,183,54,.85)') : 'rgba(251,245,236,.38)';
    c.lineWidth = you ? 1.8 : 1.15;
    c.beginPath(); c.moveTo(s[0].x, s[0].y);
    for (let i = 1; i < s.length; i++) c.lineTo(s[i].x, s[i].y);
    c.stroke();
  }

  function drawKite(c, k, you) {
    if (!k.alive && k.cutT > 2.2) return;
    const x = k.x * arc.w, y = k.y * arc.h;
    const ang = Math.atan2(k.vy, 0.4 + k.vx);
    c.save();
    c.globalAlpha = k.alive ? 1 : clamp(1 - k.cutT / 2, 0, 1);
    drawThread(c, k, you);
    c.translate(x, y);
    c.rotate(ang * 0.4 + sin(k.bob * 2.2) * 0.06);
    const ssz = you ? 24 : 17;

    // Long dangly ribbon: segments sway with wind, not just a motion trail.
    const windSway = G.wind.x * 10;
    let rx = 0, ry = ssz;
    const ribCols = [k.col, GOLD, WARM, 'rgba(251,245,236,.85)', k.col];
    for (let i = 0; i < 12; i++) {
      const sway = sin(k.bob * 2.4 + i * 0.55) * (4 + i * 0.7) + windSway * (0.2 + i * 0.08);
      const nx = rx + sway * 0.35;
      const ny = ry + 7 + i * 0.35;
      c.globalAlpha = (k.alive ? 1 : clamp(1 - k.cutT / 2, 0, 1)) * (1 - i / 14);
      c.strokeStyle = ribCols[i % ribCols.length];
      c.lineWidth = max(1.4, 3.4 - i * 0.15);
      c.beginPath(); c.moveTo(rx, ry); c.lineTo(nx, ny); c.stroke();
      // Tissue bow every other segment.
      if (i % 2 === 0) {
        const bw = 6 + (i % 3) * 2;
        c.fillStyle = ribCols[(i + 1) % ribCols.length];
        c.beginPath();
        c.moveTo(nx, ny);
        c.lineTo(nx + bw, ny + 2);
        c.lineTo(nx, ny + 5);
        c.lineTo(nx - bw * 0.7, ny + 2);
        c.closePath(); c.fill();
      }
      rx = nx; ry = ny;
    }
    c.globalAlpha = k.alive ? 1 : clamp(1 - k.cutT / 2, 0, 1);

    // Tissue paper diamond with translucency.
    c.globalCompositeOperation = 'source-over';
    const kg = c.createLinearGradient(-ssz, -ssz, ssz, ssz);
    kg.addColorStop(0, k.col);
    kg.addColorStop(0.55, you ? '#ff8a5c' : k.col);
    kg.addColorStop(1, you ? '#c43a18' : '#4a3a50');
    c.fillStyle = kg;
    c.globalAlpha = (k.alive ? 0.82 : clamp(0.82 - k.cutT / 2, 0, 1));
    c.beginPath();
    c.moveTo(0, -ssz);
    c.lineTo(ssz * 0.78, 0);
    c.lineTo(0, ssz);
    c.lineTo(-ssz * 0.78, 0);
    c.closePath(); c.fill();

    // Second pass for tissue sheen.
    c.globalAlpha *= 0.35;
    c.fillStyle = 'rgba(251,245,236,.5)';
    c.beginPath();
    c.moveTo(0, -ssz);
    c.lineTo(ssz * 0.35, -ssz * 0.2);
    c.lineTo(0, 0);
    c.lineTo(-ssz * 0.2, -ssz * 0.4);
    c.closePath(); c.fill();
    c.globalAlpha = k.alive ? 1 : clamp(1 - k.cutT / 2, 0, 1);

    // Pattern dots / stripes on tissue.
    if (k.pat === 1) {
      c.fillStyle = 'rgba(251,245,236,.25)';
      for (let i = -2; i <= 2; i++) {
        c.beginPath(); c.arc(i * 4, i * 2, 1.6, 0, TAU); c.fill();
      }
    } else if (k.pat === 2) {
      c.strokeStyle = 'rgba(15,13,10,.2)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-ssz * 0.4, -ssz * 0.3); c.lineTo(ssz * 0.4, ssz * 0.3); c.stroke();
      c.beginPath(); c.moveTo(ssz * 0.4, -ssz * 0.3); c.lineTo(-ssz * 0.4, ssz * 0.3); c.stroke();
    }

    // Bamboo spars.
    c.strokeStyle = 'rgba(201,169,110,.85)'; c.lineWidth = you ? 2 : 1.5;
    c.beginPath(); c.moveTo(0, -ssz); c.lineTo(0, ssz); c.stroke();
    c.beginPath(); c.moveTo(-ssz * 0.78, 0); c.lineTo(ssz * 0.78, 0); c.stroke();
    // Center wrap.
    c.fillStyle = GOLD;
    c.beginPath(); c.arc(0, 0, you ? 2.8 : 2.2, 0, TAU); c.fill();

    // Outline.
    c.strokeStyle = 'rgba(15,13,10,.45)'; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, -ssz); c.lineTo(ssz * 0.78, 0); c.lineTo(0, ssz); c.lineTo(-ssz * 0.78, 0);
    c.closePath(); c.stroke();

    if (k.pull > 0.45) {
      c.strokeStyle = WARM; c.globalAlpha = 0.4 + k.pull * 0.35; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 22 + k.pull * 8, 0, TAU); c.stroke();
    }
    c.restore();
  }

  function drawParts(c) {
    G.parts.forEach((p) => {
      const a = clamp(p.life / (p.max || 0.6), 0, 1);
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      if (p.kind === 'shred') {
        c.rotate(p.rot || 0);
        c.fillStyle = p.col;
        c.fillRect(-(p.sz || 4) * 0.5, -1.2, p.sz || 4, 2.4 * (p.tw || 1));
      } else {
        c.fillStyle = p.col;
        c.shadowColor = p.col; c.shadowBlur = 6;
        c.beginPath(); c.arc(0, 0, p.sz || 2, 0, TAU); c.fill();
        c.shadowBlur = 0;
      }
      c.restore();
    });
  }

  function drawPops(c) {
    G.pops.forEach((p) => {
      const a = clamp(p.life / p.max, 0, 1);
      c.save();
      c.globalAlpha = a;
      const rise = (1 - a) * 10;
      txt(c, p.label, p.x, p.y - rise, 18, WARM, 600, 'center', F_DISP);
      txt(c, p.pts, p.x, p.y - rise + 18, 12, GOLD, 600, 'center', F_MONO);
      c.restore();
    });
  }

  function drawVignette(c, w, h) {
    const v = c.createRadialGradient(w * 0.5, h * 0.42, h * 0.2, w * 0.5, h * 0.5, h * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.65, 'rgba(6,5,3,.08)');
    v.addColorStop(1, 'rgba(6,5,3,.55)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    // Side plates shrink on a narrow phone so they never sit under the clock.
    const sw = (full) => min(full, max(96, w / 2 - 66 - 12));
    plate(c, pad.left, pad.top, sw(150), 64, 12);
    txt(c, 'CUTS', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(G.cuts), pad.left + 14, pad.top + 40, 26, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 58, pad.top, 116, 44, 12);
    const mid = G.mode === 'dusk' ? (Math.max(0, G.time | 0) + 's') : G.mode === 'hunt' ? (G.cuts + ' / 6') : 'ENDLESS';
    txt(c, mid, w / 2, pad.top + 22, G.mode === 'dusk' ? 22 : 14, G.mode === 'dusk' && G.time < 12 ? PRIM : INK, 500, 'center', G.mode === 'dusk' ? F_DISP : F_MONO);
    plate(c, w - pad.right - sw(132), pad.top, sw(132), 44, 12);
    txt(c, G.me.pull > 0.5 ? 'PULLING' : 'GLIDING', w - pad.right - sw(132) / 2, pad.top + 22, 12, G.me.pull > 0.5 ? WARM : INK, 600, 'center', F_MONO);
  }

  // The shell hides its own hint on touch, so the gesture reminder is drawn
  // here for the first seconds of play.
  function drawTouchHint(c) {
    if (!arc.touchMode || arc.touchStyle === 'pads' || G.attract || G.hintT > 6.5) return;
    const a = arc.reducedMotion ? 1 : clamp(6.5 - G.hintT, 0, 1);
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { bottom: 64 };
    const lines = arc.touchStyle === 'tilt'
      ? ['Tilt the phone to steer', 'Hold a finger down to pull and cut']
      : ['Drag anywhere to fly the kite', 'Tap to yank, or hold a second finger to pull'];
    c.save(); c.globalAlpha = a;
    c.font = '600 13px ' + F_UI;
    const mw = min(w - 24, max(c.measureText(lines[0]).width, c.measureText(lines[1]).width) + 32);
    const y = arc.h - pad.bottom - 64;
    plate(c, (w - mw) / 2, y - 10, mw, 50, 12);
    txt(c, lines[0], w / 2, y + 5, 13, INK, 600, 'center');
    txt(c, lines[1], w / 2, y + 25, 13, INK, 600, 'center');
    c.restore();
  }

  function render(c) {
    const w = arc.w, h = arc.h;
    c.clearRect(0, 0, w, h);
    drawSky(c, w, h);
    drawNeighbourhood(c, w, h);
    drawWindSock(c, w, h);
    drawLeaves(c, w, h);
    G.rivals.forEach((r) => drawKite(c, r, false));
    if (G.me) drawKite(c, G.me, true);
    drawHand(c, w, h);
    drawParts(c);
    drawPops(c);
    drawVignette(c, w, h);
    if (arc.state === 'play' && !G.attract) { drawHUD(c); drawTouchHint(c); }
  }

  function dbg() {
    const m = G.me || { x: 0, y: 0, pull: 0, alive: false };
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, time: +G.time.toFixed(2), score: Math.round(G.score), cuts: G.cuts, alive: !!G.alive,
      x: +m.x.toFixed(3), y: +m.y.toFixed(3), pull: +m.pull.toFixed(2),
      rivals: G.rivals.filter((r) => r.alive).length, wind: +G.wind.x.toFixed(2), attract: !!G.attract,
      yanks: G.yanks, fingers: fingers.size,
    };
  }

  A.create({
    slug: 'sky-thread', title: 'Sky Thread', genre: 'Kite fighting',
    hint: 'Mouse or WASD steer   hold click or Space to pull and cut',
    touchHint: 'Stick steers, hold Pull to cut',
    keys: [
      ['WASD / Arrows', 'Steer the kite'],
      ['Space / J (hold)', 'Pull the string to cut'],
    ],
    mouse: { cursor: 'crosshair', keys: [['Move mouse', 'Steer toward the pointer'], ['Click / hold', 'Pull to cut']] },
    touch: { stick: true, pads: [{ label: 'Pull', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Steer'], ['Pull (hold)', 'Cut a rival thread']],
    gestures: {
      drag: false,
      tilt: 'xy',
      hint: 'Drag to fly, tap to yank, hold a second finger to pull',
      keys: [
        ['Drag anywhere', 'Fly the kite'],
        ['Tap', 'Yank the string'],
        ['Second finger (hold)', 'Keep pulling to cut'],
        ['Tilt to steer', 'Lean to fly, hold a finger to pull'],
      ],
    },
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Kite fighting',
      title: 'Sky <em>Thread</em>',
      html: '<p>Dusk over the terraces. Steer into a rival line and hold Pull so your thread cuts theirs. Glide through a fight and a hard-pulling rival can cut you. Hold Pull to stay safe.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'dusk', choices: [{ v: 'dusk', label: 'Until dusk' }, { v: 'hunt', label: 'Cut six' }, { v: 'endless', label: 'Endless sky' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Cuts<b>' + G.cuts + '</b></div>' + (G.mode === 'dusk' ? '<div>Time<b>' + Math.max(0, G.time | 0) + 's</b></div>' : '') + '</div>'; },
    onMenu(a) { arc = a; resetWorld(true); },
    init(a) {
      arc = a; a.debug = dbg; G.D = DIFF.normal; resetWorld(true);
      const cv = a.canvas;
      cv.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') fingers.add(e.pointerId); });
      const lift = (e) => fingers.delete(e.pointerId);
      cv.addEventListener('pointerup', lift); cv.addEventListener('pointercancel', lift); cv.addEventListener('lostpointercapture', lift);
      window.addEventListener('blur', () => fingers.clear());
      a.menu();
    },
    onPause() { fingers.clear(); },
    start(a, ch) {
      arc = a; resetWorld(false, ch); fingers.clear();
      const label = G.mode === 'hunt' ? 'Cut six threads' : G.mode === 'endless' ? 'Endless sky' : 'Until dusk';
      arc.toast(label, 'Sky Thread', 1400);
    },
    update, idle, render,
  });
})();
