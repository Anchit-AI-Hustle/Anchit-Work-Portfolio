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
  const COLS = ['#FF6940', '#FFB736', '#c9a96e', '#FBF5EC', '#e07a9a', '#7ec8e3'];

  let arc;
  const DIFF = {
    easy: { rivals: 3, ai: 0.72, spawn: 5.2 },
    normal: { rivals: 4, ai: 0.95, spawn: 4 },
    hard: { rivals: 5, ai: 1.22, spawn: 2.8 },
  };
  const G = {
    t: 0, time: 90, score: 0, cuts: 0, alive: true, phase: 'fly',
    me: null, rivals: [], wind: { x: 0.4, y: 0.15 }, parts: [], roofs: [], attract: true,
    mode: 'dusk', diff: 'normal',
  };

  function kite(col, x, y, ai) {
    return { x, y, vx: 0, vy: 0, col, pull: 0, alive: true, tail: [], cutT: 0, ai: ai || null, bob: rnd() * TAU };
  }

  function mkRoofs() {
    const rng = A.rng(11);
    const out = [];
    let x = -40;
    while (x < 140) {
      const w = 18 + rng() * 28;
      out.push({ x, w, h: 28 + rng() * 46, a: 0.35 + rng() * 0.4, tank: rng() > 0.55 });
      x += w - 4;
    }
    return out;
  }
  G.roofs = mkRoofs();

  function resetWorld(attract, ch) {
    G.mode = (ch && ch.mode) || G.mode || 'dusk';
    G.diff = (ch && ch.diff) || G.diff || 'normal';
    G.D = DIFF[G.diff] || DIFF.normal;
    G.t = 0; G.time = G.mode === 'dusk' ? 90 : 0; G.score = 0; G.cuts = 0; G.alive = true; G.phase = 'fly';
    G.parts.length = 0; G.attract = !!attract;
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
    G.grace = 1.4;
  }

  function handOf() {
    return { x: arc.w * 0.5, y: arc.h * 0.86 };
  }

  function segs(k) {
    const h = handOf();
    const kx = k.x * arc.w, ky = k.y * arc.h;
    return [{ x: h.x, y: h.y }, { x: lerp(h.x, kx, 0.45) + sin(G.t * 1.3 + k.bob) * 18, y: lerp(h.y, ky, 0.55) }, { x: kx, y: ky }];
  }

  function intersect(a, b, c, d) {
    const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (abs(den) < 1e-6) return null;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
    const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / den;
    if (t > 0.08 && t < 0.96 && u > 0.08 && u < 0.96) return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    return null;
  }

  function threadHit(a, b) {
    const sa = segs(a), sb = segs(b);
    for (let i = 0; i < sa.length - 1; i++) for (let j = 0; j < sb.length - 1; j++) {
      const p = intersect(sa[i], sa[i + 1], sb[j], sb[j + 1]);
      if (p) return p;
    }
    return null;
  }

  function burst(x, y, col) {
    for (let i = 0; i < 16; i++) {
      const a = rnd() * TAU, sp = 40 + rnd() * 120;
      G.parts.push({ x, y, vx: cos(a) * sp, vy: sin(a) * sp, life: 0.5 + rnd() * 0.4, col });
    }
  }

  function cutKite(k, byMe) {
    if (!k.alive) return;
    k.alive = false; k.cutT = 0;
    burst(k.x * arc.w, k.y * arc.h, k.col);
    arc.sfx.tone(byMe ? 740 : 180, 0.18, { type: 'sawtooth', slide: byMe ? 420 : 90, vol: 0.14 });
    if (byMe) {
      G.cuts++; G.score += 100 + G.cuts * 20;
      arc.toast('Thread cut', '+' + (100 + G.cuts * 20), 900);
    }
  }

  function steerMe(dt) {
    const inp = arc.input, ax = inp.axis(), p = inp.pointer;
    const pull = (inp.action() || inp.down('ShiftLeft', 'ShiftRight')) ? 1 : 0;
    G.me.pull = lerp(G.me.pull, pull, 1 - Math.exp(-dt * 8));
    const keyed = abs(ax.x) > 0.08 || abs(ax.y) > 0.08;
    if (!keyed && p && p.seen) {
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
    if (ai.wait <= 0) { ai.tx = 0.12 + rnd() * 0.76; ai.ty = 0.12 + rnd() * 0.55; ai.wait = 1.2 + rnd() * 2.2; }
    const aiMul = (G.D || DIFF.normal).ai;
    k.vx += (ai.tx - k.x) * dt * 0.9 * aiMul; k.vy += (ai.ty - k.y) * dt * 0.9 * aiMul;
    k.vx += G.wind.x * dt * 0.25; k.vy += G.wind.y * dt * 0.2;
    k.vx *= Math.exp(-dt * 1.4); k.vy *= Math.exp(-dt * 1.4);
    k.x = clamp(k.x + k.vx * dt, 0.06, 0.94);
    k.y = clamp(k.y + k.vy * dt, 0.08, 0.7);
    k.pull = lerp(k.pull, (hypot(k.x - G.me.x, k.y - G.me.y) < 0.18 ? 0.85 : 0.25), dt * 2);
  }

  function stepKite(k, dt) {
    k.bob += dt;
    k.tail.unshift({ x: k.x, y: k.y });
    if (k.tail.length > 18) k.tail.pop();
    if (!k.alive) {
      k.cutT += dt; k.vy += dt * 0.55; k.y += k.vy * dt * 0.4; k.x += sin(k.cutT * 3) * dt * 0.08;
    }
  }

  function fights(dt) {
    if (!G.me.alive || G.t < (G.grace || 0)) return;
    G.rivals.forEach((r) => {
      if (!r.alive) return;
      const hit = threadHit(G.me, r);
      if (!hit) return;
      const mine = G.me.pull, theirs = r.pull;
      if (mine > theirs + 0.12) cutKite(r, true);
      else if (theirs > mine + 0.12) { cutKite(G.me, false); G.alive = false; G.phase = 'cut'; }
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
    G.phase = 'over';
    arc.over({
      eyebrow: why, title: G.cuts >= 6 ? 'Sky <em>cleared</em>' : 'Thread <em>cut</em>',
      score: G.score, scoreLabel: 'Score',
      html: '<p>' + G.cuts + ' rival threads cut' + (G.alive ? ', and yours held.' : '.') + '</p>',
      again: 'Fly again',
    });
  }

  function update(dt) {
    G.t += dt;
    if (G.mode === 'dusk') G.time -= dt;
    G.wind.x = 0.25 + 0.35 * sin(G.t * 0.35);
    G.wind.y = 0.08 + 0.12 * cos(G.t * 0.27);
    if (G.phase === 'over') return;
    if (G.alive) steerMe(dt);
    G.rivals.forEach((r) => { if (r.alive) steerAI(r, dt); });
    stepKite(G.me, dt);
    G.rivals.forEach((r) => stepKite(r, dt));
    fights(dt);
    const spawnEvery = (G.D || DIFF.normal).spawn;
    if (G.t % spawnEvery < dt + 0.02) spawnRival();
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt;
      if (p.life <= 0) G.parts.splice(i, 1);
    }
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
  }

  function rr(c, x, y, w, h, r) {
    r = min(r, w / 2, h / 2);
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

  function drawSky(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b1540'); g.addColorStop(0.4, '#c45b3a'); g.addColorStop(0.7, '#f0a05a'); g.addColorStop(1, '#2a1810');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#FBF5EC'; c.beginPath(); c.arc(w * 0.82, h * 0.16, 22, 0, TAU); c.fill();
    c.fillStyle = 'rgba(251,245,236,.14)'; c.beginPath(); c.arc(w * 0.82, h * 0.16, 90, 0, TAU); c.fill();
    const gy = h * 0.78;
    G.roofs.forEach((r) => {
      const x = ((r.x + G.t * 6) % 180) - 30;
      c.fillStyle = 'rgba(18,14,16,' + (0.55 + r.a * 0.4) + ')';
      c.fillRect(x, gy - r.h, r.w, r.h);
      c.fillStyle = 'rgba(42,32,28,.9)';
      c.beginPath(); c.moveTo(x - 4, gy - r.h); c.lineTo(x + r.w * 0.5, gy - r.h - 10); c.lineTo(x + r.w + 4, gy - r.h); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,183,54,.18)';
      c.fillRect(x + 6, gy - r.h + 10, 7, 9); c.fillRect(x + 18, gy - r.h + 10, 7, 9);
      if (r.tank) { c.fillStyle = '#5a4030'; c.fillRect(x + r.w * 0.62, gy - r.h - 16, 12, 12); }
    });
    c.fillStyle = '#120e10'; c.fillRect(0, gy, w, h - gy);
  }

  function drawKite(c, k, you) {
    if (!k.alive && k.cutT > 2.2) return;
    const x = k.x * arc.w, y = k.y * arc.h;
    const ang = Math.atan2(k.vy, 0.4 + k.vx);
    c.save(); c.globalAlpha = k.alive ? 1 : clamp(1 - k.cutT / 2, 0, 1);
    c.strokeStyle = you ? WARM : 'rgba(251,245,236,.35)'; c.lineWidth = you ? 1.6 : 1;
    const s = segs(k);
    c.beginPath(); c.moveTo(s[0].x, s[0].y); for (let i = 1; i < s.length; i++) c.lineTo(s[i].x, s[i].y); c.stroke();
    c.translate(x, y); c.rotate(ang * 0.4);
    const ssz = you ? 16 : 13;
    c.fillStyle = k.col;
    c.beginPath(); c.moveTo(0, -ssz); c.lineTo(ssz * 0.7, 0); c.lineTo(0, ssz); c.lineTo(-ssz * 0.7, 0); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(15,13,10,.45)'; c.stroke();
    c.strokeStyle = k.col; c.lineWidth = 2; c.beginPath();
    k.tail.forEach((p, i) => {
      const tx = (p.x - k.x) * arc.w, ty = (p.y - k.y) * arc.h + i * 3;
      i ? c.lineTo(tx, ty + ssz) : c.moveTo(0, ssz);
    });
    c.stroke();
    if (k.pull > 0.5) {
      c.strokeStyle = WARM; c.globalAlpha = 0.5; c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.stroke();
    }
    c.restore();
  }

  function drawHUD(c) {
    const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
    plate(c, pad.left, pad.top, 150, 64, 12);
    txt(c, 'CUTS', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
    txt(c, String(G.cuts), pad.left + 14, pad.top + 40, 26, INK, 500, 'left', F_DISP);
    plate(c, w / 2 - 58, pad.top, 116, 44, 12);
    const mid = G.mode === 'dusk' ? (Math.max(0, G.time | 0) + 's') : G.mode === 'hunt' ? (G.cuts + ' / 6') : 'ENDLESS';
    txt(c, mid, w / 2, pad.top + 22, G.mode === 'dusk' ? 22 : 14, G.mode === 'dusk' && G.time < 12 ? PRIM : INK, 500, 'center', G.mode === 'dusk' ? F_DISP : F_MONO);
    plate(c, w - pad.right - 132, pad.top, 132, 44, 12);
    txt(c, G.me.pull > 0.5 ? 'PULLING' : 'GLIDING', w - pad.right - 66, pad.top + 22, 12, G.me.pull > 0.5 ? WARM : INK, 600, 'center', F_MONO);
  }

  function render(c) {
    const w = arc.w, h = arc.h;
    c.clearRect(0, 0, w, h);
    drawSky(c, w, h);
    G.rivals.forEach((r) => drawKite(c, r, false));
    if (G.me) drawKite(c, G.me, true);
    G.parts.forEach((p) => {
      c.globalAlpha = clamp(p.life * 2, 0, 1); c.fillStyle = p.col;
      c.beginPath(); c.arc(p.x, p.y, 2.4, 0, TAU); c.fill(); c.globalAlpha = 1;
    });
    if (arc.state === 'play' && !G.attract) drawHUD(c);
  }

  function dbg() {
    const m = G.me || { x: 0, y: 0, pull: 0, alive: false };
    return {
      phase: G.phase, mode: G.mode, diff: G.diff, time: +G.time.toFixed(2), score: Math.round(G.score), cuts: G.cuts, alive: !!G.alive,
      x: +m.x.toFixed(3), y: +m.y.toFixed(3), pull: +m.pull.toFixed(2),
      rivals: G.rivals.filter((r) => r.alive).length, wind: +G.wind.x.toFixed(2), attract: !!G.attract,
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
    mouse: { steer: 'xy', cursor: 'crosshair', keys: [['Move mouse', 'Steer toward the pointer'], ['Click / hold', 'Pull to cut']] },
    touch: { stick: true, pads: [{ label: 'Pull', key: 'Space', big: true, hot: true }] },
    touchKeys: [['On-screen stick', 'Steer'], ['Pull (hold)', 'Cut a rival thread']],
    formatScore: (v) => Math.round(v) + ' pts',
    menu: {
      eyebrow: 'Kite fighting',
      title: 'Sky <em>Thread</em>',
      html: '<p>Dusk over the terraces. Steer into a rival line and hold Pull so your thread cuts theirs. If they are pulling harder, yours goes.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'dusk', choices: [{ v: 'dusk', label: 'Until dusk' }, { v: 'hunt', label: 'Cut six' }, { v: 'endless', label: 'Endless sky' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    },
    pauseHtml() { return '<div class="stat"><div>Cuts<b>' + G.cuts + '</b></div>' + (G.mode === 'dusk' ? '<div>Time<b>' + Math.max(0, G.time | 0) + 's</b></div>' : '') + '</div>'; },
    init(a) { arc = a; a.debug = dbg; G.D = DIFF.normal; resetWorld(true); a.menu(); },
    start(a, ch) {
      arc = a; resetWorld(false, ch);
      const label = G.mode === 'hunt' ? 'Cut six threads' : G.mode === 'endless' ? 'Endless sky' : 'Until dusk';
      arc.toast(label, 'Sky Thread', 1400);
    },
    update, idle, render,
  });
})();
