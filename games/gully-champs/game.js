/*
 * Gully Champs: street cricket in a narrow lane, side-on.
 * An original game. No external assets, no libraries. Everything is drawn in
 * code on the shared Arcade shell (games/shared/arcade.js).
 */
(function () {
  'use strict';

  const A = window.Arcade;
  const clamp = A.clamp, lerp = A.lerp;
  const PI = Math.PI, TAU = Math.PI * 2;
  const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, sqrt = Math.sqrt, floor = Math.floor, atan2 = Math.atan2;
  const rnd = Math.random;
  const rr = (a, b) => a + (b - a) * rnd();
  const pick = (a) => a[(rnd() * a.length) | 0];
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------------ colour */
  const hexv = (c) => {
    c = c.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    return [parseInt(c.substr(0, 2), 16), parseInt(c.substr(2, 2), 16), parseInt(c.substr(4, 2), 16)];
  };
  const mixc = (a, b, t) => {
    const p = hexv(a), q = hexv(b);
    return 'rgb(' + Math.round(p[0] + (q[0] - p[0]) * t) + ',' + Math.round(p[1] + (q[1] - p[1]) * t) + ',' + Math.round(p[2] + (q[2] - p[2]) * t) + ')';
  };
  const shade = (c, t) => (t >= 0 ? mixc(c, '#ffffff', t) : mixc(c, '#000000', -t));
  const rgba = (c, a) => { const x = hexv(c); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')'; };

  /* ------------------------------------------------------------ world layout */
  // x runs along the lane (the bowler is on the right, the batter on the left),
  // h is height above the road, z is depth: +z is the far wall, -z is toward us.
  const END_X = -12, GATE_X = 30, ZW = 2.6, ZN = 2.6;
  const STOREY = 3.3;
  const CRATE_X = -0.82, BAT_X = 0, HOME_SAFE = 0.95, CHALK_X = 4.7, BOWL_X = 6.7, REL_X = 6.2;
  const BR = 0.085; // ball radius for physics
  const GRAV = 9.8;
  const X_MIN = -14.5, X_MAX = 35, RS = 60, WALL_H = 14.6, ZKR = RS * 0.28;
  const RESTIT = 0.64, BOUNCE_FR = 0.9;
  const ARR_X = 0.55; // where the bowler aims, just in front of the batter

  const WALLS = ['#d9879b', '#e2b04a', '#4f9ea0', '#d2693f', '#efe0b8', '#8fb08a', '#6f93c6'];
  const SHUT = ['#2e6b4f', '#2a5d8f', '#8f2f2f', '#c9902c', '#5a3d86', '#1f7a7a'];

  // Hand-placed houses of the far wall. wins: [floor, centre x, width, type]
  const HOUSES = [
    { x0: -12, x1: -6.5, fl: 3, wall: WALLS[0], door: [-9.2, 1.1, '#5b3a29'], wins: [[0, -11.2, 1.1, 'glass'], [0, -7.4, 1.0, 'shutter'], [1, -11.2, 1.1, 'shutter'], [2, -11.2, 1.1, 'glass'], [2, -9.0, 1.1, 'glass'], [2, -7.3, 1.0, 'shutter']], balc: [[1, -10.0, -7.8]] },
    { x0: -6.5, x1: 0.8, fl: 2, wall: WALLS[1], door: [-3.7, 1.1, '#2f4a6b'], wins: [[0, -5.6, 1.1, 'glass'], [0, -1.9, 1.1, 'shutter'], [1, -5.7, 1.1, 'shutter'], [1, -0.4, 1.0, 'glass']], balc: [[1, -4.6, -2.3]] },
    { x0: 0.8, x1: 7.6, fl: 3, wall: WALLS[2], door: null, wins: [[0, 1.45, 0.9, 'shutter'], [0, 6.4, 1.1, 'glass'], [1, 1.3, 0.9, 'shutter'], [1, 6.4, 1.1, 'glass'], [2, 1.5, 1.1, 'glass'], [2, 3.4, 1.1, 'shutter'], [2, 5.3, 1.1, 'glass'], [2, 6.9, 0.8, 'glass']], balc: [[1, 2.1, 4.9]] },
    { x0: 7.6, x1: 13.6, fl: 2, wall: WALLS[3], door: [10.4, 1.1, '#3e5c3a'], wins: [[0, 8.7, 1.0, 'shutter'], [0, 12.5, 1.1, 'glass'], [1, 8.5, 0.9, 'glass'], [1, 12.9, 1.0, 'shutter']], balc: [[1, 9.4, 11.7]] },
    { x0: 13.6, x1: 20, fl: 2, wall: WALLS[4], door: null, shop: true, wins: [[1, 14.9, 1.1, 'glass'], [1, 17.0, 1.1, 'shutter'], [1, 18.9, 1.0, 'glass']], balc: [] },
    { x0: 20, x1: 26, fl: 3, wall: WALLS[5], door: [22.9, 1.1, '#7a3f2a'], wins: [[0, 21.2, 1.1, 'glass'], [0, 24.7, 1.1, 'shutter'], [1, 24.9, 1.0, 'shutter'], [2, 21.2, 1.1, 'glass']], balc: [[1, 20.7, 23.2], [2, 23.2, 25.7]] },
    { x0: 26, x1: 30.4, fl: 2, wall: WALLS[6], door: null, wins: [[1, 27.2, 1.1, 'glass'], [1, 29.0, 1.0, 'shutter']], balc: [] },
  ];
  const roofOf = (h) => h.fl * STOREY + 0.7;
  const roofTopAt = (x) => {
    for (let i = 0; i < HOUSES.length; i++) if (x < HOUSES[i].x1) return roofOf(HOUSES[i]);
    return roofOf(HOUSES[HOUSES.length - 1]);
  };
  const WIN = []; // flattened windows, with the house for tint
  const BALC = []; // balconies
  (function indexWorld() {
    HOUSES.forEach((h, hi) => {
      h.shutC = SHUT[(hi * 2 + 1) % SHUT.length];
      h.wins.forEach((w, wi) => {
        const f = w[0];
        const h0 = f * STOREY + (f === 0 ? 1.15 : 1.0);
        WIN.push({ x0: w[1] - w[2] / 2, x1: w[1] + w[2] / 2, h0, h1: h0 + 1.4, type: w[3], broken: false, hi, col: SHUT[(hi + wi) % SHUT.length], f });
      });
      h.balc.forEach((b) => BALC.push({ f: b[0], x0: b[1], x1: b[2], hb: b[0] * STOREY, hi }));
    });
  })();
  const BAL_D = 1.15, SLAB_T = 0.22, PARA_H = 0.95;
  // Collision boxes: [x0,x1, z0,z1, h0,h1, restitution]
  const BOXES = [];
  BALC.forEach((b) => {
    BOXES.push([b.x0, b.x1, ZW - BAL_D, ZW, b.hb - SLAB_T, b.hb, 0.45]);
    BOXES.push([b.x0, b.x1, ZW - BAL_D, ZW - BAL_D + 0.14, b.hb, b.hb + PARA_H, 0.5]);
    BOXES.push([b.x0, b.x0 + 0.14, ZW - BAL_D, ZW, b.hb, b.hb + PARA_H, 0.5]);
    BOXES.push([b.x1 - 0.14, b.x1, ZW - BAL_D, ZW, b.hb, b.hb + PARA_H, 0.5]);
  });
  const SHOP = { x0: 13.9, x1: 19.5 };
  BOXES.push([SHOP.x0, SHOP.x1, ZW - 1.5, ZW, 2.5, 2.66, 0.74]); // striped awning: bouncy
  const AWN = BOXES[BOXES.length - 1];

  const FIELD_X0 = [-5.4, 11.6, 17.8, 24.2];
  const KID_STYLES = {
    bat: { tee: '#e23e57', shorts: '#2f4b7c', skin: '#c68642', hair: '#1c1410', cap: null },
    bowl: { tee: '#2f80c9', shorts: '#e9e2d0', skin: '#d19a66', hair: '#241812', cap: null },
    f0: { tee: '#f2b01e', shorts: '#3c3c46', skin: '#a8703a', hair: '#15100c', cap: '#c1272d' },
    f1: { tee: '#3f9e5a', shorts: '#2a3140', skin: '#c68642', hair: '#1c1410', cap: null },
    f2: { tee: '#8a56c9', shorts: '#e4d9c0', skin: '#d9a679', hair: '#2b1d14', cap: null },
    f3: { tee: '#ee7a33', shorts: '#31405c', skin: '#b87a45', hair: '#17110d', cap: '#2f80c9' },
  };
  const KID_NAMES = { bat: 'Bunty', bowl: 'Golu', f0: 'Raju', f1: 'Munni', f2: 'Tinku', f3: 'Pappu' };

  /* ------------------------------------------------------------ modes */
  const RIVALS = ['Neem Gali Nawabs', 'Chai Corner Cobras', 'Peepal Park Pirates', 'Mochi Mohalla Mavericks', 'Kabootar Chowk Kings', 'Jalebi Gali Jaguars'];
  const SUNDAY = [
    { name: 'Peepal Gali Pandas', speed: 0.96, add: 0 },
    { name: 'Jamun Chowk Jaguars', speed: 1.06, add: 6 },
    { name: 'Imli Mohalla Lions', speed: 1.16, add: 12 },
  ];
  const BATTERS = ['Bunty', 'Pinky', 'Chotu'];
  const DIFF = {
    chill: { label: 'Chill', speed: 0.84, swing: 0.44, perfect: 0.34, good: 0.72, fieldSpeed: 3.7, pCatch: 0.36, pStop: 0.5, target: [17, 21], patches: 3, mix: { fast: 2, slow: 4, full: 3, bouncer: 1, googly: 1 } },
    serious: { label: 'Serious', speed: 1.0, swing: 0.37, perfect: 0.30, good: 0.62, fieldSpeed: 4.8, pCatch: 0.54, pStop: 0.68, target: [26, 32], patches: 4, mix: { fast: 3, slow: 3, full: 2, bouncer: 2, googly: 2 } },
    legend: { label: 'Gully Legend', speed: 1.14, swing: 0.31, perfect: 0.26, good: 0.55, fieldSpeed: 5.9, pCatch: 0.72, pStop: 0.82, target: [36, 44], patches: 5, mix: { fast: 3, slow: 1, full: 1, bouncer: 3, googly: 3 } },
  };
  const DELIV = {
    fast: { speed: 10.6, run: 3.4, tag: 'Fast', aim: [0.4, 0.95], xp: [2.2, 4.4] },
    slow: { speed: 6.3, run: 1.2, tag: 'Slow', aim: [0.5, 1.15], xp: [1.5, 3.6] },
    full: { speed: 8.8, run: 2.2, tag: 'Full toss', aim: [0.65, 1.25] },
    bouncer: { speed: 11.8, run: 3.4, tag: 'Bouncer', aim: [1.45, 1.8], xp: [3.6, 5.2] },
    googly: { speed: 7.6, run: 1.8, tag: 'Googly', aim: [0.45, 1.0], xp: [1.8, 3.8] },
  };

  /* ------------------------------------------------------------ speech lines */
  const LINES = {
    trial: ['Trial ball hai, gina nahi jayega!', 'Pehle trial, phir match!'],
    lastMan: ['Last man bhi khelega!', 'Akela hai to kya, khelega!'],
    four: ['Chauka! Seedha gate pe!', 'Kya shot hai!', 'Gate tak gayi!'],
    two: ['Deewar se takraayi, do!', 'Pichhe deewar, do run!'],
    six: ['Chhakka! Par aap out!', 'Chhat ke upar! Out!', 'Six and out, bhaiya!'],
    out: ['Out hai, out!', 'Gaya bhai gaya!', 'Bas, ho gaya!'],
    tip: ['Ek tip, ek haath, out!', 'Ek haath, ek tip, out!'],
    bowled: ['Crate gir gaya! Out!', 'Gilli udd gayi!'],
    glass: ['Ball gaya!', 'Oho, sheesha tod diya!'],
    aunty: ['Kiska ball hai ye?!', 'Sheesha kaun bharega?!', 'Mummy ko bulaun?'],
    miss: ['Beat ho gaya!', 'Haath hi nahi aaya!'],
    dot: ['Dot ball!', 'Ek bhi run nahi!'],
    drop: ['Chhod diya!', 'Haath se phisla!'],
    run: ['Daud, daud!', 'Run lo, run lo!'],
    runout: ['Run out! Dhoka hua!', 'Kaata gaya!'],
    stuck: ['Ball chhajje pe atak gayi!', 'Upar fas gayi ball!'],
    dog: ['Bhuri ball le gayi!', 'Kutta ball le gaya!'],
    auto: ['Gaadi aa gayi!', 'Side ho jao, auto!'],
    perfect: ['Kya timing!', 'Bilkul sahi!'],
    bowl: ['Ye le!', 'Sambhal ke!', 'Aaya aaya!'],
    spare: ['Naya ball aa gaya!', 'Spare ball nikaali!'],
    pot: ['Gaddha!', 'Road kharab hai!'],
    win: ['Colony jeet gayi!', 'Hum jeete, hum jeete!'],
    lose: ['Agli baar pakka!', 'Thoda kam pad gaya!'],
    auntyChat: ['Dhoop mein khelte ho?', 'Kapde gande mat karna!', 'Awaaz kam, beta!', 'Paani peelo, bacchon!'],
  };

  /* ------------------------------------------------------------ static art */
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
  const WALL_W = (X_MAX - X_MIN) * RS;
  const YB = WALL_H * RS; // wall base line in the wall canvases
  const wx = (x) => (x - X_MIN) * RS;
  const wy = (h, dz) => YB - h * RS + (dz || 0) * ZKR;
  const FONT_UI = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
  const FONT_MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
  const FONT_SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
  const POLES = [-9, 6.5, 21, 33];
  const WIRES = [{ h: 7.5, sag: 0.45 }, { h: 7.1, sag: 0.55 }, { h: 6.7, sag: 0.4 }];
  // Height of wire k at world x (parabola between poles). Used by the birds.
  const wireH = (k, x) => {
    for (let i = 0; i < POLES.length - 1; i++) {
      if (x >= POLES[i] && x <= POLES[i + 1]) {
        const mid = (POLES[i] + POLES[i + 1]) / 2, half = (POLES[i + 1] - POLES[i]) / 2;
        const u = (x - mid) / half;
        return WIRES[k].h - WIRES[k].sag * (1 - u * u) * (half / 8);
      }
    }
    return WIRES[k].h;
  };

  function roundRect(c, x, y, w, h, r) {
    r = min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  function paintWindow(c, w, sr) {
    const X0 = wx(w.x0), X1 = wx(w.x1), Y0 = wy(w.h1), Y1 = wy(w.h0), W = X1 - X0, H = Y1 - Y0;
    // sill and lintel
    c.fillStyle = '#e8dcc2'; c.fillRect(X0 - 6, Y1, W + 12, 8);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(X0 - 6, Y1 + 8, W + 12, 5);
    c.fillStyle = '#e8dcc2'; c.fillRect(X0 - 5, Y0 - 8, W + 10, 8);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(X0 - 5, Y0, W + 10, 3);
    if (w.type === 'glass') {
      c.fillStyle = '#f3ecdc'; c.fillRect(X0 - 4, Y0 - 2, W + 8, H + 4);
      const g = c.createLinearGradient(0, Y0, 0, Y1);
      g.addColorStop(0, '#9fcfe6'); g.addColorStop(0.55, '#d8e6df'); g.addColorStop(1, '#f2c27a');
      c.fillStyle = g; c.fillRect(X0 + 3, Y0 + 3, W - 6, H - 6);
      // curtain tint on one side
      c.fillStyle = sr() < 0.5 ? 'rgba(190,60,70,.5)' : 'rgba(60,110,150,.45)';
      const cw = W * (0.28 + sr() * 0.18);
      if (sr() < 0.5) c.fillRect(X0 + 3, Y0 + 3, cw, H - 6); else c.fillRect(X1 - 3 - cw, Y0 + 3, cw, H - 6);
      // mullions
      c.fillStyle = '#f3ecdc'; c.fillRect(X0 + W / 2 - 2, Y0, 4, H); c.fillRect(X0, Y0 + H * 0.42, W, 4);
      // glare
      c.fillStyle = 'rgba(255,255,255,.28)';
      c.beginPath(); c.moveTo(X0 + 6, Y0 + H * 0.5); c.lineTo(X0 + W * 0.45, Y0 + 4); c.lineTo(X0 + W * 0.62, Y0 + 4); c.lineTo(X0 + 6, Y0 + H * 0.78); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.strokeRect(X0 + 3, Y0 + 3, W - 6, H - 6);
    } else if (w.type === 'shutter') {
      c.fillStyle = '#20150f'; c.fillRect(X0 - 2, Y0 - 1, W + 4, H + 2);
      const lw = W / 2 - 3;
      for (let k = 0; k < 2; k++) {
        const lx = X0 + (k ? W / 2 + 1 : 1);
        c.fillStyle = w.col; c.fillRect(lx, Y0 + 1, lw, H - 2);
        c.fillStyle = 'rgba(0,0,0,.28)';
        for (let y = Y0 + 7; y < Y1 - 4; y += 9) c.fillRect(lx + 2, y, lw - 4, 3);
        c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(lx, Y0 + 1, lw, 3);
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(lx + (k ? 0 : lw - 3), Y0 + 1, 3, H - 2);
      }
      c.fillStyle = '#d9c9a0'; c.fillRect(X0 + W / 2 - 3, Y0 + H * 0.45, 6, 12);
    } else {
      c.fillStyle = '#f3ecdc'; c.fillRect(X0 - 4, Y0 - 2, W + 8, H + 4);
      c.fillStyle = '#191210'; c.fillRect(X0 + 3, Y0 + 3, W - 6, H - 6);
      c.fillStyle = 'rgba(255,170,90,.2)'; c.fillRect(X0 + 3, Y0 + 3, W - 6, (H - 6) * 0.4);
      c.fillStyle = '#6a6a72';
      for (let x = X0 + 10; x < X1 - 6; x += 11) c.fillRect(x, Y0 + 3, 3, H - 6);
      c.fillRect(X0 + 3, Y0 + H * 0.5, W - 6, 3);
    }
  }

  function buildBack() {
    const cv = makeCanvas(WALL_W, YB + 44), c = cv.getContext('2d');
    const sr = A.rng(77231);
    // ---- the closed end of the lane (left) and the street beyond the gate (right)
    const ex0 = wx(X_MIN), ex1 = wx(END_X);
    let g = c.createLinearGradient(ex0, 0, ex1, 0);
    g.addColorStop(0, '#6b4a45'); g.addColorStop(1, '#8c6a5c');
    c.fillStyle = g; c.fillRect(ex0, wy(roofOf(HOUSES[0]) + 1), ex1 - ex0, YB + 44 - wy(roofOf(HOUSES[0]) + 1));
    c.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = wy(10.6); y < YB; y += 13) { c.fillRect(ex0, y, ex1 - ex0, 2); for (let x = ex0 + ((y / 13) % 2 ? 0 : 18); x < ex1; x += 36) c.fillRect(x, y, 2, 13); }
    // chalk graffiti: wicket, tally and the house rules
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 3; c.lineCap = 'round';
    const sx = wx(-13.7);
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(sx + k * 14, wy(0.05)); c.lineTo(sx + k * 14 + 1, wy(0.9)); c.stroke(); }
    c.beginPath(); c.moveTo(sx - 4, wy(0.02)); c.lineTo(sx + 36, wy(0.02)); c.stroke();
    c.font = '600 15px ' + FONT_SERIF; c.fillStyle = 'rgba(255,255,255,.82)'; c.textAlign = 'left';
    const rules = ['HOUSE RULES', '1 tip 1 hand = OUT', 'glass = OUT', 'roof = 6 + OUT', 'gate = 4', 'wall = 2'];
    rules.forEach((t, i) => { c.font = (i ? '600 13px ' : '700 15px ') + FONT_SERIF; c.fillText(t, wx(-14.35), wy(3.1 - i * 0.42)); });
    for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(wx(-14.2) + k * 8, wy(1.6)); c.lineTo(wx(-14.2) + k * 8, wy(1.9)); c.stroke(); }
    c.beginPath(); c.moveTo(wx(-14.3), wy(1.55)); c.lineTo(wx(-14.2) + 32, wy(1.95)); c.stroke();
    // rusty pipe
    c.fillStyle = '#5a4034'; c.fillRect(ex1 - 18, wy(10), 8, wy(0) - wy(10));
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(ex1 - 17, wy(10), 2, wy(0) - wy(10));
    // right side: the main road beyond the gate, bright with low sun
    const gx0 = wx(30.4), gx1 = wx(X_MAX);
    g = c.createLinearGradient(0, wy(11), 0, YB);
    g.addColorStop(0, '#fbe3b0'); g.addColorStop(0.6, '#ffd28a'); g.addColorStop(1, '#f0a45e');
    c.fillStyle = g; c.fillRect(gx0, wy(WALL_H - 0.5), gx1 - gx0, YB + 44 - wy(WALL_H - 0.5));
    // distant street silhouettes
    c.fillStyle = '#b9764f';
    [[30.9, 2.0, 5.2], [32.1, 1.4, 7.6], [33.3, 1.6, 4.4], [34.4, 1.2, 6.2]].forEach((b) => c.fillRect(wx(b[0]), wy(b[2]), b[1] * RS, wy(0) - wy(b[2])));
    // a bus
    c.fillStyle = '#c64b3a'; roundRect(c, wx(31.2), wy(2.7), 3.4 * RS, 2.3 * RS, 10); c.fill();
    c.fillStyle = '#f5e6c4'; for (let k = 0; k < 5; k++) c.fillRect(wx(31.45) + k * 0.62 * RS, wy(2.4), 0.5 * RS, 0.7 * RS);
    c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(wx(32.1), wy(0.25), 22, 0, TAU); c.arc(wx(34.0), wy(0.25), 22, 0, TAU); c.fill();
    // a tree
    c.fillStyle = '#4b3224'; c.fillRect(wx(30.75), wy(3.2), 8, wy(0) - wy(3.2));
    c.fillStyle = '#5a7a3a'; c.beginPath(); c.arc(wx(30.8), wy(4.3), 42, 0, TAU); c.arc(wx(31.3), wy(3.8), 34, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,230,160,.35)'; c.beginPath(); c.arc(wx(30.55), wy(4.6), 20, 0, TAU); c.fill();

    // ---- houses
    HOUSES.forEach((h, hi) => {
      const X0 = wx(h.x0), X1 = wx(h.x1), top = wy(roofOf(h)), bot = YB;
      g = c.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, shade(h.wall, 0.12)); g.addColorStop(0.55, h.wall); g.addColorStop(1, shade(h.wall, -0.2));
      c.fillStyle = g; c.fillRect(X0, top, X1 - X0, bot - top);
      // sun from the right, shadow on the left of each house
      g = c.createLinearGradient(X0, 0, X1, 0);
      g.addColorStop(0, 'rgba(60,25,50,.26)'); g.addColorStop(0.18, 'rgba(60,25,50,0)'); g.addColorStop(0.75, 'rgba(255,200,120,0)'); g.addColorStop(1, 'rgba(255,205,120,.2)');
      c.fillStyle = g; c.fillRect(X0, top, X1 - X0, bot - top);
      // plaster texture
      for (let k = 0; k < 160; k++) {
        c.fillStyle = sr() < 0.5 ? 'rgba(255,255,255,' + (0.04 + sr() * 0.07) + ')' : 'rgba(40,20,10,' + (0.04 + sr() * 0.08) + ')';
        c.fillRect(X0 + sr() * (X1 - X0), top + sr() * (bot - top), 2 + sr() * 14, 1 + sr() * 9);
      }
      // peeling patches
      for (let k = 0; k < 4; k++) {
        const px0 = X0 + 14 + sr() * (X1 - X0 - 60), py0 = top + 20 + sr() * (bot - top - 120);
        c.fillStyle = sr() < 0.5 ? shade(h.wall, 0.16) : shade(h.wall, -0.14);
        c.beginPath(); c.moveTo(px0, py0); c.lineTo(px0 + 20 + sr() * 30, py0 + 4); c.lineTo(px0 + 24 + sr() * 24, py0 + 18 + sr() * 14); c.lineTo(px0 + 4, py0 + 22 + sr() * 16); c.closePath(); c.fill();
      }
      // floor bands (cornices)
      for (let f = 1; f < h.fl; f++) {
        const yy = wy(f * STOREY);
        c.fillStyle = shade(h.wall, 0.2); c.fillRect(X0, yy - 5, X1 - X0, 11);
        c.fillStyle = 'rgba(0,0,0,.26)'; c.fillRect(X0, yy + 6, X1 - X0, 5);
      }
      // parapet cap
      c.fillStyle = shade(h.wall, 0.28); c.fillRect(X0 - 3, top - 7, X1 - X0 + 6, 12);
      c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(X0 - 3, top + 5, X1 - X0 + 6, 5);
      // damp at the foot of the wall
      g = c.createLinearGradient(0, bot - 70, 0, bot);
      g.addColorStop(0, 'rgba(30,18,10,0)'); g.addColorStop(1, 'rgba(30,18,10,.34)');
      c.fillStyle = g; c.fillRect(X0, bot - 70, X1 - X0, 70);
      // left edge shadow line
      c.fillStyle = 'rgba(0,0,0,.34)'; c.fillRect(X0, top - 7, 4, bot - top + 7);
      // drain pipe
      c.fillStyle = '#3d3a3a'; c.fillRect(X1 - 22, top, 7, bot - top);
      c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(X1 - 21, top, 2, bot - top);
      for (let y = top + 40; y < bot; y += 90) { c.fillStyle = '#2a2727'; c.fillRect(X1 - 25, y, 13, 5); }
      // windows
      WIN.forEach((w) => { if (w.hi === hi) paintWindow(c, w, sr); });
      // door
      if (h.door) {
        const dx = wx(h.door[0] - h.door[1] / 2), dw = h.door[1] * RS, dy = wy(2.3), dh = YB - dy;
        c.fillStyle = '#e8dcc2'; c.fillRect(dx - 6, dy - 8, dw + 12, dh + 8);
        g = c.createLinearGradient(dx, 0, dx + dw, 0);
        g.addColorStop(0, shade(h.door[2], 0.1)); g.addColorStop(1, shade(h.door[2], -0.25));
        c.fillStyle = g; c.fillRect(dx, dy, dw, dh);
        c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2;
        c.strokeRect(dx + 8, dy + 10, dw - 16, dh * 0.38); c.strokeRect(dx + 8, dy + dh * 0.5, dw - 16, dh * 0.42);
        c.fillStyle = '#d9b45a'; c.beginPath(); c.arc(dx + dw - 12, dy + dh * 0.55, 3.4, 0, TAU); c.fill();
        c.fillStyle = '#9a8a74'; c.fillRect(dx - 8, YB - 6, dw + 16, 8);
      }
    });

    // ---- balconies: the back door and the slab (the parapet is in the front layer)
    BALC.forEach((b) => {
      const X0 = wx(b.x0), X1 = wx(b.x1), dh = 2.25;
      c.fillStyle = '#e8dcc2'; c.fillRect(X0 + 0.25 * RS - 5, wy(b.hb + dh) - 6, (b.x1 - b.x0 - 0.5) * RS + 10, dh * RS + 6);
      g = c.createLinearGradient(0, wy(b.hb + dh), 0, wy(b.hb));
      g.addColorStop(0, '#28201c'); g.addColorStop(1, '#4a362c');
      c.fillStyle = g; c.fillRect(X0 + 0.25 * RS, wy(b.hb + dh), (b.x1 - b.x0 - 0.5) * RS, dh * RS);
      c.fillStyle = 'rgba(255,200,120,.2)'; c.fillRect(X0 + 0.25 * RS, wy(b.hb + dh), (b.x1 - b.x0 - 0.5) * RS, dh * RS * 0.3);
      const dxm = (X0 + X1) / 2;
      c.fillStyle = '#e8dcc2'; c.fillRect(dxm - 2, wy(b.hb + dh), 4, dh * RS);
      // slab front face (nearer the camera, so a little lower on screen)
      const yTop = wy(b.hb, BAL_D), yBot = wy(b.hb - SLAB_T, BAL_D);
      c.fillStyle = '#cdbfa6'; c.fillRect(X0 - 4, yTop, X1 - X0 + 8, yBot - yTop);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(X0 - 4, yBot - 4, X1 - X0 + 8, 6);
      // shadow the slab throws on the wall below
      g = c.createLinearGradient(0, yBot, 0, yBot + 40);
      g.addColorStop(0, 'rgba(0,0,0,.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(X0, wy(b.hb - SLAB_T), X1 - X0, 40);
    });

    // ---- shop front (ground floor of house 4)
    {
      const X0 = wx(SHOP.x0), X1 = wx(SHOP.x1), yT = wy(2.5), yB = YB;
      c.fillStyle = '#2b1f18'; c.fillRect(X0, yT, X1 - X0, yB - yT);
      g = c.createLinearGradient(0, yT, 0, yB); g.addColorStop(0, '#6d4a2e'); g.addColorStop(1, '#3a2619');
      c.fillStyle = g; c.fillRect(X0 + 6, yT + 6, X1 - X0 - 12, yB - yT - 6);
      // shelves of packets
      const cols = ['#e23e57', '#f2b01e', '#3f9e5a', '#2f80c9', '#8a56c9', '#ee7a33', '#f5e6c4'];
      for (let row = 0; row < 3; row++) {
        const sy = yT + 26 + row * 30;
        c.fillStyle = '#8d6a45'; c.fillRect(X0 + 10, sy + 20, (X1 - X0) * 0.62, 5);
        for (let x = X0 + 14; x < X0 + (X1 - X0) * 0.62 - 10; x += 14) {
          c.fillStyle = cols[(sr() * cols.length) | 0]; c.fillRect(x, sy + 4, 10, 16);
        }
      }
      // cold drinks fridge
      const fx = X0 + (X1 - X0) * 0.68, fw = (X1 - X0) * 0.27;
      c.fillStyle = '#d8e4ea'; c.fillRect(fx, yT + 16, fw, yB - yT - 16);
      g = c.createLinearGradient(0, yT + 24, 0, yB); g.addColorStop(0, '#c3e4f2'); g.addColorStop(1, '#8ec1d6');
      c.fillStyle = g; c.fillRect(fx + 6, yT + 24, fw - 12, yB - yT - 30);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
        c.fillStyle = cols[(r + k) % cols.length]; c.fillRect(fx + 12 + k * ((fw - 24) / 4), yT + 32 + r * 22, 8, 17);
      }
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(fx + 6, yT + 24, 10, yB - yT - 30);
      // counter
      c.fillStyle = '#b98a54'; c.fillRect(X0, yB - 40, X1 - X0, 8);
      c.fillStyle = '#7a5530'; c.fillRect(X0, yB - 32, X1 - X0, 32);
      // sign board above the awning
      const sx0 = X0 - 4, sw = X1 - X0 + 8, sy0 = wy(3.68), sh = 0.82 * RS;
      g = c.createLinearGradient(0, sy0, 0, sy0 + sh); g.addColorStop(0, '#f0e2b6'); g.addColorStop(1, '#d9c58e');
      c.fillStyle = g; roundRect(c, sx0, sy0, sw, sh, 6); c.fill();
      c.strokeStyle = '#9b2b2b'; c.lineWidth = 4; roundRect(c, sx0 + 4, sy0 + 4, sw - 8, sh - 8, 4); c.stroke();
      c.fillStyle = '#9b2b2b'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '800 26px ' + FONT_UI; c.fillText('CHINTU KIRANA', sx0 + sw / 2, sy0 + sh * 0.37);
      c.font = '700 16px ' + FONT_UI; c.fillStyle = '#1f5a8a'; c.fillText('& COLD DRINKS  |  CHAI  |  BISCUIT', sx0 + sw / 2, sy0 + sh * 0.74);
      c.textBaseline = 'alphabetic';
    }

    // ---- chalkboard scoreboard on the wall of house 2 (text is drawn live)
    {
      const bx0 = wx(2.0), bx1 = wx(5.25), by0 = wy(3.0), by1 = wy(1.4);
      c.fillStyle = '#c99a5b'; roundRect(c, bx0 - 8, by0 - 8, bx1 - bx0 + 16, by1 - by0 + 16, 6); c.fill();
      g = c.createLinearGradient(0, by0, 0, by1); g.addColorStop(0, '#26352f'); g.addColorStop(1, '#1b2622');
      c.fillStyle = g; c.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      for (let k = 0; k < 90; k++) { c.fillStyle = 'rgba(255,255,255,' + (0.02 + sr() * 0.05) + ')'; c.fillRect(bx0 + sr() * (bx1 - bx0), by0 + sr() * (by1 - by0), 8 + sr() * 24, 2); }
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(bx0 - 8, by1 + 8, bx1 - bx0 + 16, 6);
    }
    // chalk stumps on the wall behind the crate
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 4; c.lineCap = 'round';
    for (let k = 0; k < 3; k++) { const sx2 = wx(CRATE_X - 0.18 + k * 0.18); c.beginPath(); c.moveTo(sx2, wy(0.04)); c.lineTo(sx2 + 1, wy(0.95)); c.stroke(); }
    c.beginPath(); c.moveTo(wx(CRATE_X - 0.3), wy(0.92)); c.lineTo(wx(CRATE_X + 0.3), wy(0.95)); c.stroke();
    // tin sign: NO CRICKET
    {
      const nx = wx(8.0), ny = wy(1.75), nw = 1.25 * RS, nh = 0.62 * RS;
      c.fillStyle = '#b72f2a'; roundRect(c, nx, ny, nw, nh, 5); c.fill();
      c.fillStyle = '#f5e6c4'; c.font = '800 15px ' + FONT_UI; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('NO CRICKET', nx + nw / 2, ny + nh * 0.36); c.font = '600 11px ' + FONT_UI; c.fillText('(hehe) - Mgmt', nx + nw / 2, ny + nh * 0.72);
      c.textBaseline = 'alphabetic';
    }
    // the open gate leaf against the wall, and the gate pillar
    {
      const gx = wx(27.5), gw = 2.5 * RS, gy = wy(2.3), gh = 2.3 * RS;
      c.fillStyle = '#2f5d3c'; c.fillRect(gx, gy, gw, 8); c.fillRect(gx, gy + gh * 0.5, gw, 6); c.fillRect(gx, YB - 10, gw, 10);
      for (let x = gx + 4; x < gx + gw; x += 15) { c.fillRect(x, gy, 5, gh); c.beginPath(); c.moveTo(x + 2, gy); c.lineTo(x + 2, gy - 10); c.lineTo(x + 7, gy); c.fill(); }
      c.strokeStyle = '#2f5d3c'; c.lineWidth = 4; c.beginPath(); c.moveTo(gx, YB - 10); c.lineTo(gx + gw, gy + 8); c.stroke();
      c.fillStyle = '#c9a24a'; c.fillRect(gx + gw - 12, gy + gh * 0.44, 12, 16);
      // pillar at the gate line
      const pw = 0.45 * RS;
      c.fillStyle = '#a89883'; c.fillRect(wx(GATE_X) - pw / 2, wy(2.9), pw, 2.9 * RS);
      c.fillStyle = '#d9cbb2'; c.fillRect(wx(GATE_X) - pw / 2 - 4, wy(2.9) - 8, pw + 8, 10);
      c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(wx(GATE_X) + pw / 2 - 6, wy(2.9), 5, 2.9 * RS);
    }
    // roof furniture: water tanks and antennas
    const tank = (x, hRoof, r) => {
      const cx = wx(x), by = wy(hRoof);
      c.fillStyle = '#2b2b30'; c.fillRect(cx - r * 0.8, by - 14, 5, 14); c.fillRect(cx + r * 0.8 - 5, by - 14, 5, 14);
      c.fillStyle = '#34343a'; roundRect(c, cx - r, by - 14 - r * 1.5, r * 2, r * 1.5, r * 0.5); c.fill();
      c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(cx - r * 0.7, by - 14 - r * 1.4, 6, r * 1.3);
      c.fillStyle = '#25252a'; c.fillRect(cx - r * 0.25, by - 14 - r * 1.5 - 7, r * 0.5, 8);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(cx - r, by - 14 - r * 0.5, r * 2, 4);
    };
    tank(16.6, roofOf(HOUSES[4]), 34); tank(22.2, roofOf(HOUSES[5]), 30); tank(10.6, roofOf(HOUSES[3]), 26); tank(-3.4, roofOf(HOUSES[1]), 28);
    c.strokeStyle = '#2a2a2e'; c.lineWidth = 2.5;
    [[3.2, 2, 1.3], [27.8, 6, 1.1], [-8.8, 0, 1.2]].forEach((a) => {
      const bx = wx(a[0]), by = wy(roofOf(HOUSES[a[1]]), 0);
      c.beginPath(); c.moveTo(bx, by - 8); c.lineTo(bx, by - a[2] * RS); c.stroke();
      for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(bx - 18 + k * 2, by - a[2] * RS + k * 12); c.lineTo(bx + 18 - k * 2, by - a[2] * RS + k * 12); c.stroke(); }
    });
    return cv;
  }

  function buildFront() {
    const cv = makeCanvas(WALL_W, YB + 44), c = cv.getContext('2d');
    const sr = A.rng(4417);
    // balcony parapets with jali holes, plants and pots
    BALC.forEach((b, bi) => {
      const h = HOUSES[b.hi];
      const X0 = wx(b.x0), X1 = wx(b.x1), yT = wy(b.hb + PARA_H, BAL_D), yB = wy(b.hb, BAL_D);
      const g = c.createLinearGradient(0, yT, 0, yB);
      g.addColorStop(0, shade(h.wall, 0.3)); g.addColorStop(1, shade(h.wall, 0.0));
      c.fillStyle = g; c.fillRect(X0 - 4, yT, X1 - X0 + 8, yB - yT);
      c.fillStyle = shade(h.wall, 0.45); c.fillRect(X0 - 7, yT - 6, X1 - X0 + 14, 9);
      c.fillStyle = 'rgba(0,0,0,.26)'; c.fillRect(X0 - 7, yT + 3, X1 - X0 + 14, 4);
      c.fillStyle = 'rgba(40,18,10,.36)';
      for (let x = X0 + 10; x < X1 - 8; x += 17) { c.beginPath(); c.arc(x, (yT + yB) / 2 + 3, 5.5, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(X0 - 4, yB - 5, X1 - X0 + 8, 5);
      // plants on the parapet
      const n = 2 + ((bi + 1) % 2);
      for (let k = 0; k < n; k++) {
        const px = X0 + 18 + sr() * (X1 - X0 - 50), r = 13 + sr() * 7;
        c.fillStyle = '#b5532e'; c.beginPath(); c.moveTo(px - r * 0.7, yT - 6); c.lineTo(px + r * 0.7, yT - 6); c.lineTo(px + r * 0.5, yT - 6 - r * 0.9); c.lineTo(px - r * 0.5, yT - 6 - r * 0.9); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(px - r * 0.6, yT - 6 - r * 0.9, r * 1.2, 3);
        c.fillStyle = '#3f7a38';
        for (let l = 0; l < 7; l++) { const a = -PI / 2 + (l - 3) * 0.42; c.beginPath(); c.ellipse(px + cos(a) * r * 0.9, yT - 6 - r * 0.9 + sin(a) * r * 1.4, r * 0.34, r * 0.8, a + PI / 2, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(180,255,150,.25)'; c.beginPath(); c.ellipse(px - r * 0.2, yT - 6 - r * 1.8, r * 0.2, r * 0.6, 0.3, 0, TAU); c.fill();
      }
      // a plastic chair seen over the edge on every other balcony
      if (bi % 2 === 0) { c.fillStyle = '#d9d2c2'; c.fillRect(X1 - 52, yT - 30, 5, 30); c.fillRect(X1 - 52, yT - 30, 28, 5); }
    });
    // the shop awning: striped canvas, top surface and scalloped valance
    {
      const X0 = wx(AWN[0]), X1 = wx(AWN[1]), yBack = wy(AWN[5], 0), yFront = wy(AWN[5], 1.5);
      const stripes = Math.round((X1 - X0) / 26);
      for (let k = 0; k < stripes; k++) {
        c.fillStyle = k % 2 ? '#f5e6c4' : '#e0562f';
        const x0 = X0 + k * (X1 - X0) / stripes, x1 = X0 + (k + 1) * (X1 - X0) / stripes;
        c.beginPath(); c.moveTo(x0 + 8, yBack); c.lineTo(x1 + 8, yBack); c.lineTo(x1, yFront); c.lineTo(x0, yFront); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(x0, yFront); c.lineTo(x1, yFront); c.lineTo(x1, yFront + 0.16 * RS); c.arc((x0 + x1) / 2, yFront + 0.16 * RS, (x1 - x0) / 2, 0, PI); c.closePath(); c.fill();
      }
      const g = c.createLinearGradient(0, yBack, 0, yFront); g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(255,220,150,.18)');
      c.fillStyle = g; c.fillRect(X0, yBack, X1 - X0 + 8, yFront - yBack);
      // hanging packet strips and a hanging bulb
      const cols = ['#e23e57', '#f2b01e', '#3f9e5a', '#2f80c9', '#8a56c9'];
      for (let x = X0 + 30; x < X1 - 120; x += 34) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x, yFront + 12, 1.5, 38); for (let k = 0; k < 3; k++) { c.fillStyle = cols[(((x / 34) | 0) + k) % cols.length]; c.fillRect(x - 5, yFront + 14 + k * 11, 12, 10); } }
    }
    // a scooter parked by the shop, a crate stack, a cart
    {
      const sx = wx(15.0), sy = wy(0, 1.7);
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(sx + 4, sy + 3, 62, 8, 0, 0, TAU); c.fill();
      c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(sx - 42, sy - 14, 15, 0, TAU); c.arc(sx + 44, sy - 14, 15, 0, TAU); c.fill();
      c.fillStyle = '#b8b8bc'; c.beginPath(); c.arc(sx - 42, sy - 14, 6, 0, TAU); c.arc(sx + 44, sy - 14, 6, 0, TAU); c.fill();
      c.fillStyle = '#2f80c9'; c.beginPath(); c.moveTo(sx - 48, sy - 22); c.quadraticCurveTo(sx - 8, sy - 36, sx + 18, sy - 30); c.lineTo(sx + 40, sy - 66); c.lineTo(sx + 52, sy - 62); c.lineTo(sx + 44, sy - 24); c.lineTo(sx + 20, sy - 16); c.lineTo(sx - 38, sy - 16); c.closePath(); c.fill();
      c.fillStyle = '#1d1d22'; roundRect(c, sx - 24, sy - 46, 44, 12, 6); c.fill();
      c.fillStyle = '#d9d2c2'; c.fillRect(sx + 38, sy - 76, 12, 5);
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(sx - 40, sy - 28, 70, 3);
      const cx = wx(-3.4), cy = wy(0, 1.9);
      const cc = ['#2f80c9', '#e23e57', '#f2b01e'];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 2 - (r > 1 ? 1 : 0); k++) { c.fillStyle = cc[(r + k) % 3]; c.fillRect(cx + k * 34, cy - 24 - r * 22, 32, 20); c.fillStyle = 'rgba(0,0,0,.35)'; for (let h2 = 0; h2 < 3; h2++) c.fillRect(cx + k * 34 + 5 + h2 * 9, cy - 20 - r * 22, 5, 11); }
      const tx = wx(23.4), ty = wy(0, 1.9);
      c.fillStyle = '#6b4a2e'; c.fillRect(tx, ty - 40, 96, 8); c.fillStyle = '#4a321f'; c.fillRect(tx + 6, ty - 32, 4, 30); c.fillRect(tx + 86, ty - 32, 4, 30);
      c.fillStyle = '#242428'; c.beginPath(); c.arc(tx + 28, ty - 12, 14, 0, TAU); c.fill(); c.fillStyle = '#b8b8bc'; c.beginPath(); c.arc(tx + 28, ty - 12, 5, 0, TAU); c.fill();
      c.fillStyle = '#d9822b'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(tx + 16 + k * 16, ty - 46, 9, 0, TAU); c.fill(); }
    }
    // poles and overhead wires
    c.strokeStyle = '#1c1a1a'; c.lineCap = 'round';
    POLES.forEach((p) => {
      const px = wx(p), pb = wy(0, 1.4), pt = wy(8.4, 1.4);
      c.fillStyle = '#4b4742'; c.fillRect(px - 5, pt, 10, pb - pt); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(px - 3, pt, 3, pb - pt);
      c.fillStyle = '#322f2b'; c.fillRect(px - 30, wy(7.7, 1.4), 60, 7);
      c.fillStyle = '#8f8a80'; for (let k = -1; k <= 1; k++) c.fillRect(px + k * 22 - 3, wy(7.7, 1.4) - 8, 6, 9);
      c.fillStyle = '#322f2b'; c.fillRect(px - 8, wy(3.2, 1.4), 16, 26);
    });
    WIRES.forEach((w, k) => {
      c.lineWidth = 2; c.strokeStyle = '#161313'; c.beginPath();
      for (let x = POLES[0]; x <= POLES[POLES.length - 1] + 0.01; x += 0.25) {
        const px = wx(x), py = wy(wireH(k, x), 1.4);
        if (x === POLES[0]) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    });
    // an old banner string of flags above the lane (kites on a line)
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(30,20,20,.7)'; c.beginPath(); c.moveTo(wx(10.5), wy(8.9, 1.4)); c.quadraticCurveTo(wx(14.5), wy(7.8, 1.4), wx(19.5), wy(8.9, 1.4)); c.stroke();
    const fc = ['#e23e57', '#f2b01e', '#3f9e5a', '#2f80c9', '#ee7a33'];
    for (let k = 0; k < 14; k++) {
      const t = (k + 0.5) / 14, fx = lerp(wx(10.5), wx(19.5), t), fy = wy(8.9 - 4 * (t - t * t) * 1.1 * 0.82, 1.4);
      c.fillStyle = fc[k % 5]; c.beginPath(); c.moveTo(fx - 8, fy); c.lineTo(fx + 8, fy); c.lineTo(fx, fy + 16); c.closePath(); c.fill();
    }
    return cv;
  }

  function buildRoad() {
    const H = Math.round((ZW + ZN) * ZKR) + 2;
    const cv = makeCanvas(WALL_W, H), c = cv.getContext('2d');
    const sr = A.rng(9023);
    const yz = (z) => (ZW - z) * ZKR;
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7d6a58'); g.addColorStop(0.18, '#a58d72'); g.addColorStop(0.7, '#b9a07f'); g.addColorStop(1, '#8b7560');
    c.fillStyle = g; c.fillRect(0, 0, WALL_W, H);
    // concrete slab seams, patched tar and stains
    c.strokeStyle = 'rgba(40,25,15,.22)'; c.lineWidth = 2;
    for (let x = X_MIN + 1.3; x < X_MAX; x += 2.9 + sr() * 0.6) { c.beginPath(); c.moveTo(wx(x), 0); c.lineTo(wx(x) + (sr() - 0.5) * 6, H); c.stroke(); }
    for (let k = 0; k < 28; k++) {
      c.fillStyle = 'rgba(' + (sr() < 0.5 ? '35,28,22' : '230,205,160') + ',' + (0.06 + sr() * 0.1) + ')';
      c.beginPath(); c.ellipse(sr() * WALL_W, sr() * H, 18 + sr() * 70, 4 + sr() * 12, 0, 0, TAU); c.fill();
    }
    for (let k = 0; k < 900; k++) { c.fillStyle = 'rgba(' + (sr() < 0.5 ? '30,20,12' : '255,235,190') + ',' + (0.1 + sr() * 0.18) + ')'; c.fillRect(sr() * WALL_W, sr() * H, 1 + sr() * 2.5, 1 + sr() * 1.6); }
    // fine cracks
    c.strokeStyle = 'rgba(30,20,12,.4)'; c.lineWidth = 1.5;
    for (let k = 0; k < 22; k++) {
      let x = sr() * WALL_W, y = sr() * H; c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (sr() - 0.2) * 22; y += (sr() - 0.5) * 12; c.lineTo(x, y); }
      c.stroke();
    }
    // long afternoon light across the road, from the right
    g = c.createLinearGradient(0, 0, WALL_W, 0);
    for (let k = 0; k <= 12; k++) g.addColorStop(k / 12, k % 2 ? 'rgba(255,214,140,.14)' : 'rgba(70,30,60,.08)');
    c.fillStyle = g; c.fillRect(0, 0, WALL_W, H);
    // gutter at the near edge with a drain grate
    g = c.createLinearGradient(0, H - 16, 0, H); g.addColorStop(0, 'rgba(25,15,8,0)'); g.addColorStop(1, 'rgba(25,15,8,.5)');
    c.fillStyle = g; c.fillRect(0, H - 16, WALL_W, 16);
    c.fillStyle = '#2a2420'; c.fillRect(wx(9.4), H - 13, 56, 10); c.fillStyle = '#6b625a'; for (let x = 0; x < 52; x += 8) c.fillRect(wx(9.4) + 3 + x, H - 12, 3, 8);
    // wall-foot shadow along the far edge
    g = c.createLinearGradient(0, 0, 0, 22); g.addColorStop(0, 'rgba(20,10,5,.5)'); g.addColorStop(1, 'rgba(20,10,5,0)');
    c.fillStyle = g; c.fillRect(0, 0, WALL_W, 22);
    // chalk: the batting line, the far line the batter runs to, and the batting box
    c.strokeStyle = 'rgba(255,255,255,.88)'; c.lineWidth = 4.5; c.lineCap = 'round';
    [HOME_SAFE, CHALK_X].forEach((x) => { c.beginPath(); c.moveTo(wx(x), yz(ZW - 0.25)); c.lineTo(wx(x) + 2, yz(-ZN + 0.4)); c.stroke(); });
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.62)';
    c.strokeRect(wx(-1.35), yz(1.2), (HOME_SAFE + 1.35) * RS, 2.4 * ZKR);
    c.beginPath(); c.arc(wx(CHALK_X) + 26, yz(0), 14, 0, TAU); c.stroke();
    c.font = '700 13px ' + FONT_MONO; c.fillStyle = 'rgba(255,255,255,.7)'; c.textAlign = 'center';
    c.fillText('RUN', wx(CHALK_X) + 26, yz(0) + 4);
    return cv;
  }

  function buildSky() {
    const W = Math.round((X_MAX - X_MIN) * RS * 0.35 + 2200), H = 880;
    const cv = makeCanvas(W, H), c = cv.getContext('2d');
    const sr = A.rng(2024);
    const layers = [
      { col: '#e7b29a', hmin: 260, hmax: 640, wmin: 120, wmax: 260, step: 0.86, lit: 0.04 },
      { col: '#d68f8f', hmin: 180, hmax: 520, wmin: 90, wmax: 210, step: 0.8, lit: 0.09 },
      { col: '#b9707f', hmin: 120, hmax: 400, wmin: 80, wmax: 180, step: 0.75, lit: 0.14 },
    ];
    layers.forEach((L, li) => {
      let x = -40;
      while (x < W + 40) {
        const w = L.wmin + sr() * (L.wmax - L.wmin), h = L.hmin + sr() * (L.hmax - L.hmin);
        c.fillStyle = L.col; c.fillRect(x, H - h, w, h);
        c.fillStyle = shade(L.col, -0.12); c.fillRect(x, H - h, 6, h);
        c.fillStyle = shade(L.col, 0.12); c.fillRect(x, H - h, w, 7);
        // little lit windows
        for (let wy2 = H - h + 24; wy2 < H - 24; wy2 += 34) for (let wx2 = x + 14; wx2 < x + w - 16; wx2 += 28) {
          if (sr() < 0.55) { c.fillStyle = sr() < L.lit * 4 ? 'rgba(255,222,140,.9)' : 'rgba(80,40,60,.18)'; c.fillRect(wx2, wy2, 11, 15); }
        }
        // tanks, antennas, a dome now and then
        const r = sr();
        if (r < 0.28) { c.fillStyle = shade(L.col, -0.25); c.fillRect(x + w * 0.3, H - h - 22, 26, 22); c.fillRect(x + w * 0.3 + 4, H - h - 30, 18, 8); }
        else if (r < 0.46) { c.strokeStyle = shade(L.col, -0.3); c.lineWidth = 2; c.beginPath(); c.moveTo(x + w * 0.6, H - h); c.lineTo(x + w * 0.6, H - h - 46); c.moveTo(x + w * 0.6 - 12, H - h - 38); c.lineTo(x + w * 0.6 + 12, H - h - 38); c.stroke(); }
        else if (r < 0.52 && li === 0) { c.fillStyle = shade(L.col, 0.1); c.beginPath(); c.arc(x + w / 2, H - h, w * 0.3, PI, 0); c.fill(); c.fillRect(x + w / 2 - 3, H - h - w * 0.3 - 22, 6, 22); }
        x += w * L.step;
      }
      // haze between layers
      const g = c.createLinearGradient(0, H - 560, 0, H); g.addColorStop(0, 'rgba(255,214,160,0)'); g.addColorStop(1, 'rgba(255,214,160,' + (0.22 - li * 0.06) + ')');
      c.fillStyle = g; c.fillRect(0, H - 560, W, 560);
    });
    return cv;
  }

  const LAYERS = { back: null, front: null, road: null, sky: null, fontsDone: false, wantRebuild: false };
  function ensureLayers() {
    if (!LAYERS.back) {
      LAYERS.back = buildBack(); LAYERS.front = buildFront(); LAYERS.road = buildRoad(); LAYERS.sky = buildSky();
      if (!LAYERS.fontsDone && document.fonts && document.fonts.ready) {
        LAYERS.fontsDone = true;
        document.fonts.ready.then(() => { LAYERS.wantRebuild = true; }).catch(() => {});
      }
    } else if (LAYERS.wantRebuild) {
      LAYERS.wantRebuild = false; LAYERS.back = buildBack(); LAYERS.front = buildFront();
    }
  }

  /* ------------------------------------------------------------ game state */
  let arc = null;
  const V = { W: 1, H: 1, S: 40, ZK: 11, baseY: 0, halfW: 0, portrait: false, homeX: 3 };
  const cam = { x: 3, yo: 0, shake: 0 };
  const G = {
    mode: 'last', diff: 'serious', D: DIFF.serious, phase: 'attract', t: 0,
    runs: 0, outs: 0, balls: 0, target: 0, ballLimit: 0, maxOuts: 3, trial: true, trialRuns: 0,
    matchIx: 0, rival: '', results: [], totalScore: 0, matchWon: false, speedMul: 1, sunMul: 1,
    lastOutcome: '', lastDelivery: '', shotLabel: '', dotT: 0, deadT: 0, readyT: 0, endBanner: '', interludeT: 0,
    autoTimer: 30, dogTimer: 14, auntyTimer: 9, birdTimer: 0, time: 0, patches: [], overOutcomes: [], deliveries: 0,
    flags: { auto: false, dog: false, aunty: false }, eventLog: [], batterIx: 0, slow: 0, ended: false,
  };
  const BAT = { x: 0, z: 0, face: 1, state: 'idle', dir: 1, lastEnd: 0, speed: 6.4, phase: 0, run: 0, out: false, style: KID_STYLES.bat };
  const SW = { on: false, t: 0, dur: 0.37, cd: 0, hit: false, kind: 0, after: 0 };
  const CRATE = { x: CRATE_X, tip: 0, fall: false, vx: 0 };
  const BALL = {
    state: 'none', x: REL_X, h: 1.5, z: 0, vx: 0, vh: 0, vz: 0, bounces: 0, batted: false, spin: 0, awarded: '', wallHits: 0,
    googly: false, gf: 1, replan: false, restT: 0, thrown: null, hidden: false, trail: new Float32Array(30), trailN: 0, trailT: 0, stuckT: 0, kind: 'fast',
  };
  const mkF = (id, x, key, role) => ({
    id, role, x, x0: x, z: role === 'bowler' ? 0 : (id % 2 ? 0.25 : -0.2), face: -1, walk: 0, phase: rnd() * 6, speed: 4.5, hands: 0.8 + rnd() * 0.2,
    hasBall: false, tried: false, hold: 0, goal: x, armUp: 0, zone: [x - 5, x + 5], style: KID_STYLES[key], name: KID_NAMES[key], dive: 0, say: 0,
  });
  const FIELDERS = [mkF(0, FIELD_X0[0], 'f0', 'keeper'), mkF(1, FIELD_X0[1], 'f1', 'field'), mkF(2, FIELD_X0[2], 'f2', 'field'), mkF(3, FIELD_X0[3], 'f3', 'field'), mkF(4, BOWL_X + 3, 'bowl', 'bowler')];
  FIELDERS[0].zone = [-10.8, -1.8]; FIELDERS[0].face = 1;
  const BOWLER = FIELDERS[4];
  BOWLER.runT = 0; BOWLER.runDur = 1; BOWLER.runFrom = BOWL_X + 3; BOWLER.arm = 0;
  const AUNTY = { state: 'hidden', t: 0, up: 0, x: 3.5, h: 3.3, z: ZW - 0.55, shake: 0, cd: 0 };
  const DOG = { active: false, x: 0, z: 1.0, dir: 1, state: 'walk', t: 0, phase: 0, goal: 0, stops: 0, carry: false, barkT: 0, fetch: false };
  const AUTO = { state: 'none', x: 0, dir: -1, t: 0, wheel: 0, horned: 0, speed: 10.5, hold: 0 };
  const BIRDS = [];
  for (let i = 0; i < 7; i++) BIRDS.push({ k: i % 3, x: -7 + i * 5.7 + rnd() * 2, state: 'perch', t: 0, fx: 0, fy: 0, vx: 0, vy: 0, flap: rnd() * 6, back: 0 });
  const PARTS = [];
  for (let i = 0; i < 170; i++) PARTS.push({ on: false, x: 0, h: 0, z: 0, vx: 0, vh: 0, vz: 0, life: 0, max: 1, size: 3, kind: 0, col: '#fff', g: 1 });
  let partCursor = 0;
  const POPS = [];
  const BUBBLES = [];
  const DUST = [];
  for (let i = 0; i < 40; i++) DUST.push({ x: rnd(), y: rnd(), s: 0.6 + rnd() * 1.6, p: rnd() * 6, v: 0.02 + rnd() * 0.05 });

  const SND = {
    tone(f, d, o) { if (arc) arc.sfx.tone(f, d, o); },
    noise(d, o, delay) { if (!arc) return; if (delay) setTimeout(() => arc && arc.sfx.noise(d, o), delay * 1000); else arc.sfx.noise(d, o); },
    thock(v) { this.tone(190 + v * 5, 0.07, { type: 'sine', slide: 90, vol: 0.26 }); this.noise(0.04, { filter: 'lowpass', freq: 900, vol: 0.1 }); },
    bat(q) { this.noise(0.05, { filter: 'bandpass', freq: 2600 + q * 900, vol: 0.34 }); this.tone(1100, 0.05, { type: 'square', slide: 420, vol: 0.1 }); this.tone(160, 0.13, { type: 'triangle', slide: 70, vol: 0.3 }); },
    swish() { this.noise(0.12, { filter: 'bandpass', freq: 700, vol: 0.07 }); },
    bounce(v) { this.tone(130 + rnd() * 50, 0.05, { type: 'sine', slide: 80, vol: min(0.2, 0.04 + v * 0.016) }); this.noise(0.03, { filter: 'lowpass', freq: 700, vol: min(0.12, v * 0.012) }); },
    wall(v) { this.noise(0.08, { filter: 'lowpass', freq: 520, vol: min(0.22, 0.05 + v * 0.012) }); this.tone(85, 0.1, { type: 'sine', slide: 50, vol: min(0.22, 0.05 + v * 0.01) }); },
    tink() { this.tone(1500, 0.06, { type: 'triangle', slide: 900, vol: 0.12 }); },
    glass() {
      this.noise(0.55, { filter: 'highpass', freq: 4200, vol: 0.34 });
      for (let i = 0; i < 8; i++) this.tone(2300 + rnd() * 3300, 0.14 + rnd() * 0.22, { type: 'sine', vol: 0.07, delay: 0.03 + i * 0.045 + rnd() * 0.04 });
    },
    horn() { this.tone(430, 0.2, { type: 'square', vol: 0.13 }); this.tone(540, 0.2, { type: 'square', vol: 0.09 }); this.tone(430, 0.32, { type: 'square', vol: 0.13, delay: 0.28 }); this.tone(540, 0.32, { type: 'square', vol: 0.09, delay: 0.28 }); },
    bark() { this.tone(540, 0.1, { type: 'sawtooth', slide: 270, vol: 0.17 }); this.noise(0.08, { filter: 'bandpass', freq: 950, vol: 0.14 }); this.tone(500, 0.12, { type: 'sawtooth', slide: 240, vol: 0.15, delay: 0.17 }); },
    cheer(big) {
      this.noise(big ? 1.1 : 0.65, { filter: 'bandpass', freq: 1700, vol: big ? 0.2 : 0.14 });
      const n = big ? 5 : 3;
      for (let i = 0; i < n; i++) this.tone(520 + i * 90 + rnd() * 60, 0.22, { type: 'triangle', slide: 760 + i * 80, vol: 0.05, delay: 0.04 * i });
    },
    groan() { this.tone(300, 0.4, { type: 'sawtooth', slide: 150, vol: 0.08 }); this.noise(0.4, { filter: 'lowpass', freq: 600, vol: 0.1 }); },
    out() { this.tone(330, 0.18, { type: 'triangle', slide: 200, vol: 0.2 }); this.tone(220, 0.32, { type: 'triangle', slide: 110, vol: 0.2, delay: 0.17 }); },
    run() { this.tone(110 + rnd() * 20, 0.03, { type: 'square', vol: 0.035 }); },
    ding() { this.tone(880, 0.1, { type: 'triangle', vol: 0.12 }); this.tone(1320, 0.18, { type: 'triangle', vol: 0.1, delay: 0.09 }); },
    fan() { this.tone(520, 0.12, { type: 'triangle', vol: 0.1 }); this.tone(660, 0.12, { type: 'triangle', vol: 0.1, delay: 0.1 }); this.tone(880, 0.26, { type: 'triangle', vol: 0.12, delay: 0.2 }); },
    caught() { this.thock(10); this.tone(700, 0.08, { type: 'square', vol: 0.06 }); },
    boing() { this.tone(260, 0.2, { type: 'sine', slide: 520, vol: 0.12 }); },
  };

  /* ------------------------------------------------------------ view and camera */
  function computeView() {
    V.W = arc.w; V.H = arc.h; V.portrait = V.H > V.W * 1.05; V.halfW = V.W / 2;
    if (V.portrait) { V.S = Math.min(V.W / 9.6, V.H / 16); V.baseY = V.H * (V.W > 600 ? 0.7 : 0.66); }
    else { V.S = Math.min(V.W / 21, V.H / 13.4); V.baseY = V.H * 0.8; }
    V.ZK = V.S * 0.28;
    V.homeX = V.portrait ? (V.W / (2 * V.S) - 1.4) : 0.16 * V.W / V.S;
  }
  const sxOf = (x) => (x - cam.x) * V.S + V.halfW;
  const syOf = (h, z) => V.baseY - z * V.ZK - h * V.S + cam.yo;
  const camBounds = () => { const hw = V.W / (2 * V.S); return [END_X - 1.6 + hw, X_MAX - 1.4 - hw]; };

  /* ------------------------------------------------------------ small systems */
  function say(text, ent, life, hOff, opts) {
    if (!text) return;
    if (BUBBLES.length >= 4) BUBBLES.shift();
    const b = { text, ent: ent || null, x: ent ? ent.x : 0, h: hOff == null ? 1.75 : hOff, z: ent ? (ent.z || 0) : 0, t: 0, life: life || 1.7, w: 0, aunty: !!(opts && opts.aunty) };
    BUBBLES.push(b);
  }
  function sayAt(text, x, h, z, life) {
    say(text, null, life);
    const b = BUBBLES[BUBBLES.length - 1]; b.x = x; b.h = h; b.z = z || 0;
  }
  function pop(text, x, h, col, size, life) {
    if (POPS.length >= 7) POPS.shift();
    POPS.push({ text, x, h, z: 0, t: 0, life: life || 1.1, col: col || '#FFB736', size: size || 18 });
  }
  function emit(n, x, h, z, kind, o) {
    o = o || {};
    if (arc.reducedMotion) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const p = PARTS[partCursor]; partCursor = (partCursor + 1) % PARTS.length;
      p.on = true; p.x = x; p.h = h; p.z = z; p.kind = kind;
      const sp = o.speed || 2;
      p.vx = (rnd() - 0.5) * sp * 2 + (o.vx || 0); p.vh = rnd() * sp * (o.up == null ? 1 : o.up) + (o.vh || 0); p.vz = (rnd() - 0.5) * sp;
      p.max = p.life = (o.life || 0.6) * (0.6 + rnd() * 0.8); p.size = (o.size || 3) * (0.6 + rnd() * 0.8);
      p.col = o.cols ? o.cols[(rnd() * o.cols.length) | 0] : (o.col || '#d9c3a0'); p.g = o.g == null ? 1 : o.g;
    }
  }
  const dustPuff = (x, h, z, n, big) => emit(n || 5, x, h, z, 0, { speed: big ? 1.6 : 0.9, up: 0.9, life: 0.7, size: big ? 7 : 5, cols: ['#d9c3a0', '#c8ad88', '#e8d6b4'], g: 0.15 });
  const sparkBurst = (x, h, z, n) => emit(n || 10, x, h, z, 1, { speed: 4, up: 1, life: 0.35, size: 2.4, cols: ['#FFE08A', '#FFB736', '#ffffff'], g: 0.8 });
  const shards = (x, h, z) => emit(34, x, h, z, 2, { speed: 3.2, up: 1, vh: 1.5, life: 1.1, size: 4.5, cols: ['#bfe3f2', '#e8f6fb', '#f5d28a', '#ffffff'], g: 2.2 });

  function patchAt(x, z) {
    for (let i = 0; i < G.patches.length; i++) {
      const p = G.patches[i];
      if (x > p.x - p.w / 2 && x < p.x + p.w / 2 && abs(z - p.z) < 1.1) return p;
    }
    return null;
  }
  function newPatches() {
    G.patches.length = 0;
    const n = G.D.patches, kinds = ['pot', 'crack', 'stones', 'pot', 'crack'];
    let guard = 0;
    while (G.patches.length < n && guard++ < 40) {
      const x = rr(1.5, 5.9), w = rr(0.7, 1.1);
      if (G.patches.some((p) => abs(p.x - x) < (p.w + w) / 2 + 0.25)) continue;
      G.patches.push({ x, w, z: rr(-0.4, 0.4), kind: kinds[G.patches.length % kinds.length], seed: rnd() * 1000 });
    }
  }
  const windowAt = (x, h) => {
    for (let i = 0; i < WIN.length; i++) { const w = WIN[i]; if (x >= w.x0 - BR && x <= w.x1 + BR && h >= w.h0 - BR && h <= w.h1 + BR) return w; }
    return null;
  };
  function setPhase(p, t) { G.phase = p; G.t = 0; if (t != null) G.phaseLen = t; }

  /* ------------------------------------------------------------ ball physics */
  function boxHit(b, bx) {
    const cx = clamp(b.x, bx[0], bx[1]), cz = clamp(b.z, bx[2], bx[3]), ch = clamp(b.h, bx[4], bx[5]);
    const dx = b.x - cx, dz = b.z - cz, dh = b.h - ch, d2 = dx * dx + dz * dz + dh * dh;
    if (d2 >= BR * BR) return 0;
    let nx, nz, nh, pen;
    const d = sqrt(d2);
    if (d > 1e-6) { nx = dx / d; nz = dz / d; nh = dh / d; pen = BR - d; }
    else {
      const px = min(b.x - bx[0], bx[1] - b.x), pz = min(b.z - bx[2], bx[3] - b.z), ph = min(b.h - bx[4], bx[5] - b.h);
      nx = nz = nh = 0;
      if (ph <= px && ph <= pz) { nh = (b.h - (bx[4] + bx[5]) / 2) >= 0 ? 1 : -1; pen = ph + BR; }
      else if (pz <= px) { nz = (b.z - (bx[2] + bx[3]) / 2) >= 0 ? 1 : -1; pen = pz + BR; }
      else { nx = (b.x - (bx[0] + bx[1]) / 2) >= 0 ? 1 : -1; pen = px + BR; }
    }
    b.x += nx * pen; b.z += nz * pen; b.h += nh * pen;
    const vn = b.vx * nx + b.vz * nz + b.vh * nh;
    if (vn < 0) {
      const e = bx[6];
      b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; b.vh -= (1 + e) * vn * nh;
      b.vx *= 0.97; b.vz *= 0.97;
      return -vn;
    }
    return 0.0001;
  }

  // One physics sub-step. Returns '' or an outcome code the caller must act on.
  function stepBall(b, dt) {
    b.vh -= GRAV * dt;
    b.x += b.vx * dt; b.z += b.vz * dt; b.h += b.vh * dt;
    b.spin += (b.vx + b.vz * 0.4) * dt * 3;
    // road
    if (b.h <= BR) {
      b.h = BR;
      if (b.vh < -1.1) {
        const sp = -b.vh;
        let e = RESTIT, fr = BOUNCE_FR;
        const pt = patchAt(b.x, b.z);
        if (pt) {
          if (pt.kind === 'pot') { e = 0.22; fr = 0.78; if (!b.batted) b.potHit = true; }
          else if (pt.kind === 'crack') { e = 0.95; fr = 0.95; b.vz += (rnd() - 0.5) * 2.4; b.vx += (rnd() - 0.5) * 1.6; if (!b.batted) b.potHit = true; }
          else { e = 0.5; fr = 0.7; b.vz += (rnd() - 0.5) * 2.6; if (!b.batted) b.potHit = true; }
        }
        if (b.googly && b.bounces === 0 && !b.batted) { fr *= b.gf; b.googly = false; }
        b.vh = sp * e; b.vx *= fr; b.vz *= fr * 0.96; b.bounces++;
        if (b.vh < 0.7) b.vh = 0;
        b.evBounce = sp; b.evPatch = pt ? pt.kind : '';
      } else {
        b.vh = 0;
        const s = sqrt(b.vx * b.vx + b.vz * b.vz);
        if (s > 0) { const ns = max(0, s - 2.5 * dt); b.vx *= ns / s; b.vz *= ns / s; }
      }
    }
    // balconies, awning
    for (let i = 0; i < BOXES.length; i++) {
      const bx = BOXES[i];
      if (b.x < bx[0] - 0.2 || b.x > bx[1] + 0.2 || b.z < bx[2] - 0.2 || b.h < bx[4] - 0.2 || b.h > bx[5] + 0.2) continue;
      const imp = boxHit(b, bx);
      if (imp > 0.5) { b.evWall = imp; b.evWallKind = bx === AWN ? 'awn' : 'balc'; b.replan = true; b.wallHits++; }
      else if (imp > 0 && b.vh < 0.5 && b.h < bx[5] + BR + 0.02 && bx[5] - bx[4] < 0.3) {
        // resting on a slab: friction, and it is not going anywhere
        b.vx *= (1 - 3 * dt); b.vz *= (1 - 3 * dt);
      }
    }
    // far wall (houses): glass windows end the innings
    if (b.z > ZW - BR && b.vz > 0) {
      const w = windowAt(b.x, b.h);
      if (w && w.type === 'glass' && !w.broken) { b.hitWin = w; return 'glass'; }
      b.z = ZW - BR;
      const imp = b.vz;
      b.vz = -b.vz * 0.5; b.vx *= 0.9; b.vh *= 0.92; b.wallHits++;
      b.evWall = imp; b.evWallKind = w ? (w.type === 'glass' ? 'brokenwin' : w.type) : 'wall'; b.replan = true;
    } else if (b.z < -ZN + BR && b.vz < 0) {
      b.z = -ZN + BR; const imp = -b.vz;
      b.vz = -b.vz * 0.5; b.vx *= 0.9; b.wallHits++;
      b.evWall = imp; b.evWallKind = 'wall'; b.replan = true;
    }
    // end wall
    if (b.x < END_X + BR && b.vx < 0) {
      const imp = -b.vx;
      if (b.batted && !b.awarded && b.bounces === 0 && b.wallHits === 0 && imp > 3) { b.awarded = 'two'; b.x = END_X + BR; return 'two'; }
      b.x = END_X + BR; b.vx = -b.vx * 0.45; b.vz *= 0.9; b.wallHits++;
      b.evWall = imp; b.evWallKind = 'wall'; b.replan = true;
    }
    // over the roofs, or past the gate
    if (b.batted && !b.awarded) {
      if (b.h > roofTopAt(b.x) + 0.15) { b.awarded = 'six'; return 'six'; }
      if (b.x >= GATE_X) {
        if (b.h > 2.4) { b.awarded = 'six'; return 'sixgate'; }
        b.awarded = 'four'; return 'four';
      }
    } else if (b.x > GATE_X + 0.4 && b.vx > 0) { b.x = GATE_X + 0.4; b.vx = -b.vx * 0.3; }
    // the crate
    if (!b.batted && !CRATE.fall && b.x < CRATE_X + 0.26 && b.x > CRATE_X - 0.3 && abs(b.z) < 0.34 && b.h < 0.8 && b.vx < 0) return 'bowled';
    return '';
  }

  /* ------------------------------------------------------------ prediction for the fielders */
  const PRED = { xFull: 0, tFull: -1, xB: 0, tB: -1, xTip: 0 };
  function predict(b) {
    let x = b.x, h = b.h, z = b.z, vx = b.vx, vh = b.vh, t = 0, bounced = b.bounces;
    PRED.tFull = -1; PRED.tB = -1;
    for (let i = 0; i < 240 && t < 4; i++) {
      const dt = 1 / 60; vh -= GRAV * dt; x += vx * dt; h += vh * dt; t += dt;
      if (PRED.tFull < 0 && bounced === 0 && vh < 0 && h < 1.7 && h > 0.2) { PRED.tFull = t; PRED.xFull = x; }
      if (h <= BR) {
        h = BR;
        if (vh < -1.1) { vh = -vh * RESTIT; vx *= BOUNCE_FR; bounced++; if (PRED.tB < 0) { PRED.tB = t; PRED.xB = x; } if (bounced >= 2) break; } else break;
      }
      if (x < END_X || x > GATE_X) break;
    }
    PRED.xTip = PRED.tB >= 0 ? PRED.xB + vx * 0.2 : x;
    if (PRED.tB < 0) { PRED.tB = t; PRED.xB = x; }
  }
  function planFielding(b) {
    predict(b);
    const useFull = PRED.tFull > 0 && PRED.xFull > END_X + 0.5 && PRED.xFull < GATE_X;
    const px = useFull ? PRED.xFull : PRED.xTip, pt = useFull ? PRED.tFull : PRED.tB;
    let best = null, bt = 1e9, second = null, st = 1e9;
    FIELDERS.forEach((f) => {
      f.goal = f.x;
      if (f.hasBall) return;
      const T = abs(f.x - px) / f.speed;
      if (T < bt) { second = best; st = bt; best = f; bt = T; } else if (T < st) { second = f; st = T; }
    });
    if (best) best.goal = px;
    const dir = b.vx >= 0 ? 1 : -1;
    if (second) second.goal = clamp(px + dir * 3.5, second.zone[0] - 1, second.zone[1] + 1);
    FIELDERS.forEach((f) => { f.tried = false; });
    b.replan = false;
  }

  /* ------------------------------------------------------------ the match */
  function dispName() { return G.mode === 'sunday' ? SUNDAY[G.matchIx].name : G.rival; }
  function newMatch() {
    G.D = DIFF[G.diff] || DIFF.serious;
    G.runs = 0; G.outs = 0; G.balls = 0; G.trial = true; G.trialRuns = 0; G.matchWon = false; G.batterIx = 0; G.deliveries = 0;
    G.overOutcomes.length = 0; G.lastOutcome = ''; G.slow = 0; G.ended = false;
    G.sunMul = 1;
    if (G.mode === 'last') { G.target = 0; G.ballLimit = 0; G.sunMul = 1; G.rival = ''; }
    else {
      const T = G.D.target; let add = 0;
      if (G.mode === 'sunday') { const s = SUNDAY[G.matchIx]; add = s.add; G.sunMul = s.speed; G.rival = s.name; }
      else G.rival = RIVALS[(rnd() * RIVALS.length) | 0];
      G.target = floor(rr(T[0], T[1] + 1)) + add; G.ballLimit = 18;
    }
    WIN.forEach((w) => { w.broken = false; });
    CRATE.tip = 0; CRATE.fall = false;
    newPatches();
    BAT.x = BAT_X; BAT.state = 'idle'; BAT.lastEnd = 0; BAT.out = false; BAT.z = 0;
    SW.on = false; SW.cd = 0; SW.t = 0;
    BALL.state = 'none'; BALL.hidden = true;
    FIELDERS.forEach((f, i) => { f.x = f.x0; f.goal = f.x0; f.hasBall = false; f.tried = false; f.walk = 0; f.z = f.role === 'bowler' ? 0 : (i % 2 ? 0.25 : -0.2); });
    BOWLER.x = BOWL_X + 3;
    BUBBLES.length = 0; POPS.length = 0;
    setPhase('intro', 2.1);
    const msg = G.mode === 'last' ? 'Last Man Standing' : 'Chase ' + G.target + ' in 3 overs';
    G.endBanner = '';
    if (arc) arc.toast(msg, G.mode === 'last' ? 'Score as much as you can' : 'vs ' + dispName(), 1900);
    G.t = 0;
    say(pick(LINES.trial), BAT, 2.2, 1.9);
  }

  function chooseKind() {
    if (TEST.kind) return TEST.kind;
    const mix = Object.assign({}, G.D.mix);
    if (G.mode === 'last') {
      const over = floor(G.balls / 6);
      mix.bouncer += min(3, over * 0.4); mix.googly += min(3, over * 0.4); mix.slow = max(0.6, mix.slow - over * 0.3);
    }
    let tot = 0; for (const k in mix) tot += mix[k];
    let r = rnd() * tot;
    for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
    return 'fast';
  }
  function speedMult() {
    let m = G.D.speed * G.sunMul;
    if (G.mode === 'last') m *= 1 + min(0.22, floor(G.balls / 6) * 0.035);
    return m;
  }

  // Work out a launch that lands where we want it, with the same physics as the game.
  function planDelivery(kind) {
    const T = DELIV[kind], mult = speedMult();
    const spd = T.speed * mult * (0.95 + rnd() * 0.1);
    const hr = 1.5 + rnd() * 0.18;
    const out = { kind, vx: -spd, vh: 0, vz: 0, hr, googly: false, gf: 1 };
    const aimH = rr(T.aim[0], T.aim[1]);
    if (kind === 'full') {
      const t = (REL_X - ARR_X) / spd;
      out.vh = (aimH - hr + 0.5 * GRAV * t * t) / t;
      return out;
    }
    let gf = 1;
    if (kind === 'googly') { gf = rnd() < 0.5 ? 0.5 : 1.55; out.googly = true; out.gf = gf; }
    let bestX = 3, bestErr = 1e9, bestVy = 0;
    const shuffleStart = rnd() * 0.1;
    for (let xp = T.xp[0] + shuffleStart; xp <= T.xp[1]; xp += 0.1) {
      const t1 = (REL_X - xp) / spd;
      const vy0 = (0.5 * GRAV * t1 * t1 - (hr - BR)) / t1;
      const vyi = vy0 - GRAV * t1;
      const vyp = -vyi * RESTIT;
      const vx2 = spd * BOUNCE_FR * gf, t2 = (xp - ARR_X) / vx2;
      if (t2 <= 0.02) continue;
      const hArr = BR + vyp * t2 - 0.5 * GRAV * t2 * t2;
      const err = abs(hArr - aimH);
      if (err < bestErr) { bestErr = err; bestX = xp; bestVy = vy0; }
    }
    out.vh = bestVy; out.pitch = bestX;
    return out;
  }

  function startRunup() {
    const kind = chooseKind();
    G.plan = planDelivery(kind);
    G.lastDelivery = kind;
    const T = DELIV[kind];
    BOWLER.runFrom = BOWL_X + T.run + 0.6; BOWLER.runT = 0; BOWLER.runDur = 0.35 + T.run / 4.6; BOWLER.x = BOWLER.runFrom;
    BOWLER.running = true; BOWLER.arm = 0;
    setPhase('runup');
  }
  function release() {
    const p = G.plan, b = BALL;
    b.state = 'air'; b.hidden = false; b.x = REL_X; b.h = p.hr; b.z = 0; b.vx = p.vx; b.vh = p.vh; b.vz = 0;
    b.bounces = 0; b.batted = false; b.spin = 0; b.awarded = ''; b.wallHits = 0; b.googly = p.googly; b.gf = p.gf; b.replan = false; b.restT = 0; b.hitWin = null;
    b.kind = p.kind; b.potHit = false; b.evBounce = 0; b.evWall = 0; b.trailN = 0; b.stuckT = 0; b.evPatch = '';
    G.dotT = 0; G.shotLabel = '';
    BOWLER.running = false;
    setPhase('flight');
    SND.swish();
    if (G.D !== DIFF.legend) pop(DELIV[p.kind].tag.toUpperCase(), sxOfInv(REL_X), 2.6, '#FFE9B0', 14, 1.0);
    if (rnd() < 0.5) say(pick(LINES.bowl), BOWLER, 1.0, 1.9);
    FIELDERS.forEach((f) => { f.tried = false; f.hasBall = false; });
  }
  const sxOfInv = (x) => x;

  function addRuns(n, why) {
    if (G.trial) { G.trialRuns += n; return; }
    G.runs += n;
    G.overOutcomes.push(n);
    if (G.mode !== 'last' && G.runs >= G.target && !G.matchWon) { G.matchWon = true; }
  }
  function addOut(why) {
    if (G.trial) return;
    G.outs++; G.batterIx = min(2, G.outs);
  }

  // The ball is dead: put the result on screen and move on.
  function endBall(kind, info) {
    if (G.phase === 'dead' || G.phase === 'over' || G.phase === 'interlude') return;
    const trial = G.trial;
    let text = '', small = '', out = false, add = 0, cheer = 0, line = null, speaker = null, lowKey = false;
    switch (kind) {
      case 'four': add = 4; text = 'FOUR!'; small = 'Along the ground to the far gate'; cheer = 2; line = LINES.four; break;
      case 'two': add = 2; text = 'TWO!'; small = 'Full on the end wall'; cheer = 1; line = LINES.two; break;
      case 'six': add = 6; out = true; text = 'SIX, AND OUT!'; small = 'Over the roof: the ball is gone'; cheer = 2; line = LINES.six; break;
      case 'sixgate': add = 6; out = true; text = 'SIX, AND OUT!'; small = 'Over the gate: into the main road'; cheer = 2; line = LINES.six; break;
      case 'caught': out = true; text = 'CAUGHT!'; small = (info && info.name ? info.name : 'Fielder') + ' takes it'; line = LINES.out; break;
      case 'tip': out = true; text = 'ONE TIP, ONE HAND!'; small = 'Caught one-handed after one bounce'; line = LINES.tip; break;
      case 'bowled': out = true; text = 'BOWLED!'; small = 'The crate is down'; line = LINES.bowled; break;
      case 'glass': out = true; text = 'GLASS! BALL GAYA!'; small = 'Window broken: out, and the ball is lost'; line = LINES.glass; break;
      case 'runout': out = true; text = 'RUN OUT!'; small = 'The crate was hit before you got home'; line = LINES.runout; break;
      case 'dot': text = 'DOT BALL'; small = G.shotLabel === 'Miss' ? 'Beaten' : ''; line = LINES.dot; lowKey = true; break;
      case 'stuck': text = 'STUCK UP THERE!'; small = 'Ball on the balcony: dead ball'; line = LINES.stuck; lowKey = true; break;
      case 'dog': text = 'DOG TOOK IT!'; small = 'Bhuri has run off with the ball'; line = LINES.dog; lowKey = true; break;
      case 'stopped': { const r = G.lastBallRuns || 0; text = r > 0 ? r + (r === 1 ? ' RUN' : ' RUNS') : 'NO RUN'; lowKey = true; break; }
      case 'won': text = 'TARGET CHASED!'; small = 'Colony jeet gayi'; cheer = 2; break;
      default: break;
    }
    G.lastOutcome = kind;
    if (trial) {
      G.trial = false;
      text = 'TRIAL BALL'; small = 'Does not count: ' + (kind === 'dot' ? 'have a look' : 'no runs, no out');
      out = false; add = 0; cheer = 0; lowKey = true;
      if (kind === 'caught' || kind === 'tip' || kind === 'bowled' || kind === 'glass' || kind === 'runout') small = 'Not out: it was only the trial ball';
      G.trialRuns = 0;
      G.trialPending = false;
    } else {
      G.balls++;
      addRuns(add);
      if (out) addOut(kind);
      if (kind === 'dot' || kind === 'stopped' || kind === 'stuck' || kind === 'dog') { /* runs already counted */ }
    }
    if (arc) arc.toast(text, small, lowKey ? 1300 : 1900);
    if (line) {
      const spk = (kind === 'four' || kind === 'two' || kind === 'six' || kind === 'sixgate') ? FIELDERS[1] : (kind === 'dot' ? FIELDERS[0] : BOWLER);
      say(pick(line), spk, 1.8, 1.95);
    }
    if (cheer) SND.cheer(cheer > 1);
    if (out && !trial) SND.out();
    if (kind === 'glass') {
      AUNTY.state = 'scold'; AUNTY.t = 0;
      setTimeout(() => { if (G.phase === 'dead' || G.phase === 'ready') sayAt(pick(LINES.aunty), AUNTY.x, AUNTY.h + 2.0, ZW - 0.55, 2.4); }, 500);
    }
    if (out && !trial && G.outs === 2 && G.outs < G.maxOuts) setTimeout(() => say(pick(LINES.lastMan), BAT, 2.0, 1.9), 1200);
    G.flags.lastEnd = kind;
    setPhase('dead', kind === 'glass' ? 2.6 : 1.9);
    G.deadKind = kind;
  }

  function afterBall() {
    if (G.matchWon) return finishMatch(true);
    if (G.outs >= G.maxOuts) return finishMatch(false);
    if (G.mode !== 'last' && G.balls >= G.ballLimit) return finishMatch(false);
    if (G.deadKind === 'glass' || G.deadKind === 'six' || G.deadKind === 'sixgate' || G.deadKind === 'dog' || G.deadKind === 'stuck') {
      if (!G.trialJustSpare) say(pick(LINES.spare), FIELDERS[2], 1.6, 1.9);
    }
    prepareNextBall();
  }
  function prepareNextBall() {
    BALL.state = 'none'; BALL.hidden = true; BALL.thrown = null;
    FIELDERS.forEach((f) => { f.hasBall = false; f.tried = false; f.goal = f.x0; });
    BOWLER.x = BOWL_X + 3; BOWLER.goal = BOWL_X + 3;
    if (CRATE.fall) { CRATE.tip = 0; CRATE.fall = false; }
    BAT.state = 'idle';
    setPhase('ready');
    G.readyT = 0.85 + (G.D === DIFF.chill ? 0.3 : 0);
    if (!G.trial && G.balls % 6 === 0 && G.balls > 0 && G.mode !== 'last') arc.toast('Over ' + (G.balls / 6) + ' done', G.target - G.runs > 0 ? 'Need ' + (G.target - G.runs) + ' off ' + (G.ballLimit - G.balls) : '', 1500);
    if (G.mode === 'last' && G.balls > 0 && G.balls % 6 === 0) arc.toast('Over ' + (G.balls / 6) + ' done', 'Bowlers are getting quicker', 1400);
    if (G.balls % 6 === 0 && G.balls > 0) newPatches();
  }

  function finishMatch(won) {
    if (G.ended) return; G.ended = true;
    const D = G.D;
    let bonus = 0;
    if (G.mode !== 'last' && won) bonus = 20 + (G.maxOuts - G.outs) * 5 + max(0, G.ballLimit - G.balls) * 2;
    const rec = { name: dispName(), runs: G.runs, target: G.target, won, bonus, outs: G.outs, balls: G.balls };
    if (G.mode === 'last') {
      setPhase('over');
      arc.over({
        score: G.runs, scoreLabel: 'Runs', eyebrow: 'Three outs', title: G.runs >= 30 ? 'What an <em>innings</em>' : 'Innings <em>over</em>',
        html: '<p>You scored <b>' + G.runs + '</b> in ' + G.balls + ' ball' + (G.balls === 1 ? '' : 's') + ' (' + floor(G.balls / 6) + '.' + (G.balls % 6) + ' overs). The colony says: ' + (G.runs >= 30 ? 'sab ko pata chal gaya, tum champ ho!' : 'ek aur baari?') + '</p>',
      });
      return;
    }
    G.results.push(rec);
    G.totalScore += G.runs + bonus;
    if (G.mode === 'chase') {
      setPhase('over');
      arc.over({
        score: G.runs + bonus, scoreLabel: won ? 'Runs + win bonus' : 'Runs', eyebrow: won ? 'Colony won' : 'Colony lost',
        title: won ? 'Target <em>chased</em>' : 'Just <em>short</em>',
        html: '<p>' + (won ? 'You chased ' + G.target + ' against ' + G.rival + ' with ' + (G.ballLimit - G.balls) + ' ball' + (G.ballLimit - G.balls === 1 ? '' : 's') + ' to spare and ' + (G.maxOuts - G.outs) + ' out' + (G.maxOuts - G.outs === 1 ? '' : 's') + ' in hand. Win bonus: ' + bonus + '.' : G.rival + ' set ' + G.target + '. You made ' + G.runs + (G.outs >= G.maxOuts ? ' and ran out of batters.' : ' and ran out of balls.')) + '</p>',
      });
      return;
    }
    // Super Sunday
    if (!won) {
      setPhase('over');
      arc.over({
        score: G.totalScore, scoreLabel: 'Tournament points', eyebrow: 'Knocked out', title: 'Out of <em>Super Sunday</em>',
        html: '<p>' + sundayRecap() + '</p>',
      });
      return;
    }
    if (G.matchIx >= SUNDAY.length - 1) {
      const trophy = 50; G.totalScore += trophy;
      setPhase('over');
      arc.over({
        score: G.totalScore, scoreLabel: 'Tournament points', eyebrow: 'Trophy', title: 'Super Sunday <em>champions</em>',
        html: '<p>Three lanes beaten. Trophy bonus: ' + trophy + '. ' + sundayRecap() + '</p>',
      });
      return;
    }
    G.interludeT = 0; setPhase('interlude');
    G.interlude = { won, rec, next: SUNDAY[G.matchIx + 1], nextTarget: null };
    if (arc) { SND.cheer(true); }
  }
  function sundayRecap() {
    return G.results.map((r) => r.name + ' ' + r.runs + '/' + r.target + (r.won ? ' W' : ' L')).join(', ') + '.';
  }

  /* ------------------------------------------------------------ batting */
  function readShot() {
    const ax = arc.input.axis();
    return { loft: ax.y < -0.35, ground: ax.y > 0.35, bias: ax.x > 0.35 ? 1 : ax.x < -0.35 ? -1 : 0 };
  }
  function pressBat() {
    if (SW.cd > 0 || !(G.phase === 'flight' || G.phase === 'ready' || G.phase === 'runup' || G.phase === 'intro' || (G.phase === 'live' && !BALL.batted))) return;
    const s = readShot();
    SW.on = true; SW.t = 0; SW.hit = false; SW.kind = s.loft ? 2 : s.ground ? 0 : 1; SW.dur = G.D.swing; SW.cd = SW.dur + 0.28; SW.after = 0;
    SND.swish();
  }
  function contact(p) {
    const b = BALL, D = G.D, s = readShot();
    SW.hit = true;
    const tauRaw = (p - 0.5) / 0.4; // -1 late .. +1 early
    const at = abs(tauRaw);
    const qT = 1 - sstep(D.perfect, 1.0, at) * 0.9;
    const hc = s.loft ? 0.95 : s.ground ? 0.45 : 0.7;
    const hq = 1 - clamp(abs(b.h - hc) / 1.1, 0, 0.62);
    const q = qT * hq;
    let tau = clamp(tauRaw + s.bias * 0.4, -1.3, 1.3);
    const side = rnd() < 0.55 ? 1 : -1;
    // direction: perfect goes down the lane, early pushes to the front and wide, late goes behind
    let psi;
    if (abs(tau) <= 0.25) psi = side * (0.04 + rnd() * 0.1);
    else if (tau > 0) psi = side * (0.14 + (tau - 0.25) * 1.0);
    else psi = PI - side * (0.22 + (-tau - 0.25) * 0.95);
    let speed = 6.2 + 13.2 * q + abs(b.vx) * 0.18;
    let theta;
    if (s.loft) theta = (36 + (q - 0.5) * 8) * PI / 180;
    else if (s.ground) theta = (2 + rnd() * 3) * PI / 180;
    else theta = (15 + rnd() * 4) * PI / 180;
    if (b.h > 1.3 && s.ground) theta += 0.25;
    if (b.h < 0.2 && !s.loft) theta += 0.1;
    if (q < 0.32) { theta += 0.32; speed *= 0.62; }
    const ct = cos(theta);
    b.vx = speed * ct * cos(psi); b.vz = speed * ct * sin(psi); b.vh = speed * sin(theta);
    b.batted = true; b.bounces = 0; b.wallHits = 0; b.awarded = ''; b.googly = false; b.state = 'air';
    b.trailN = 0;
    const lab = q > 0.8 && at <= D.perfect ? 'PERFECT' : q > 0.5 ? 'Good' : tau > 0.3 ? 'Early' : tau < -0.3 ? 'Late' : 'Mistimed';
    G.shotLabel = lab;
    pop(lab, b.x, 1.7, lab === 'PERFECT' ? '#FFB736' : lab === 'Good' ? '#FBF5EC' : '#FF8A3D', lab === 'PERFECT' ? 22 : 17, 0.9);
    SND.bat(q);
    sparkBurst(b.x, b.h, 0, q > 0.7 ? 14 : 7);
    if (!arc.reducedMotion) { cam.shake = 0.26 * (0.4 + q); G.slow = q > 0.8 ? 0.14 : 0.06; }
    if (lab === 'PERFECT' && rnd() < 0.5) say(pick(LINES.perfect), FIELDERS[3], 1.3, 1.9);
    setPhase('live');
    G.liveT = 0; G.lastBallRuns = 0; BAT.ran = 0;
    planFielding(b);
    FIELDERS.forEach((f) => { f.armUp = 0; });
  }

  function updateBatter(dt) {
    BAT.phase += dt * 11;
    if (BAT.state === 'run') {
      BAT.x += BAT.dir * BAT.speed * dt; BAT.run = 1;
      if (BAT.dir > 0 && BAT.x >= CHALK_X) { BAT.x = CHALK_X; arriveEnd(1); }
      else if (BAT.dir < 0 && BAT.x <= BAT_X) { BAT.x = BAT_X; arriveEnd(0); }
      if (rnd() < dt * 7) SND.run();
    } else BAT.run = max(0, BAT.run - dt * 6);
    BAT.face = BAT.state === 'run' ? BAT.dir : 1;
  }
  function arriveEnd(e) {
    BAT.state = 'idle';
    if (e !== BAT.lastEnd) {
      BAT.lastEnd = e; G.lastBallRuns++;
      if (G.phase === 'live') {
        addRuns(1);
        pop(G.trial ? '(trial)' : '+1', BAT.x, 1.9, '#FFE9B0', 20, 0.8);
        SND.ding();
        if (G.matchWon) { endBall('won'); }
      }
    }
  }
  function startRun() {
    if (G.phase !== 'live' || !BALL.batted) return;
    if (BALL.state === 'gone') return;
    if (BAT.state === 'idle') { BAT.dir = BAT.lastEnd === 0 ? 1 : -1; BAT.state = 'run'; if (rnd() < 0.5) say(pick(LINES.run), FIELDERS[2], 1.2, 1.9); }
    else BAT.dir = -BAT.dir;
  }

  /* ------------------------------------------------------------ fielding */
  function updateFielders(dt) {
    const live = G.phase === 'live' && BALL.state !== 'none';
    const b = BALL;
    FIELDERS.forEach((f) => {
      let goal = f.x;
      if (f.role === 'bowler' && G.phase === 'runup') { f.phase += dt * 10; return; }
      if (live && b.batted && b.state === 'air') {
        const rolling = b.h <= BR + 0.02;
        if (rolling && !f.hasBall) {
          // ground ball: the nearest fielder runs to where it will be
          let nearest = null, nt = 1e9;
          FIELDERS.forEach((g) => { const T = abs(g.x - b.x) / g.speed; if (T < nt) { nt = T; nearest = g; } });
          if (f === nearest) goal = b.x + b.vx * min(0.5, abs(b.x - f.x) / (f.speed + abs(b.vx) + 0.1));
          else goal = f.goal;
        } else goal = f.goal;
      } else if (live && (b.state === 'held' || b.state === 'thrown')) goal = f.hasBall ? f.x : f.x0;
      else if (!live) goal = f.hasBall ? f.x : (f.role === 'bowler' ? (G.phase === 'ready' || G.phase === 'intro' || G.phase === 'attract' ? BOWL_X + 3 : BOWL_X) : f.x0);
      else goal = f.x0;
      const dx = goal - f.x, step = f.speed * dt;
      if (abs(dx) > 0.06) { f.x += clamp(dx, -step, step); f.face = dx > 0 ? 1 : -1; f.walk = lerp(f.walk, 1, min(1, dt * 10)); f.phase += dt * (9 + f.speed); }
      else { f.walk = lerp(f.walk, 0, min(1, dt * 9)); }
      if (f.armUp > 0) f.armUp -= dt;
      if (f.hold > 0) {
        f.hold -= dt;
        if (f.hold <= 0 && f.hasBall && b.state === 'held') throwBall(f);
      }
    });
    // idle fielders face the action
    if (!live) FIELDERS.forEach((f) => { if (f.walk < 0.1 && f.role !== 'bowler') f.face = f.role === 'keeper' ? 1 : -1; });
  }
  function throwBall(f) {
    const b = BALL;
    const tx = CRATE_X + 0.25, th = 0.55;
    const dist = abs(f.x - tx);
    b.state = 'thrown';
    b.thrown = { x0: f.x, h0: 1.15, x1: tx, h1: th, t: 0, dur: max(0.32, dist / (11.5 + (G.D === DIFF.legend ? 3 : 0))), arc: min(2.4, 0.4 + dist * 0.07) };
    f.hasBall = false; f.armUp = 0.4;
    SND.swish();
  }
  function takeBall(f, caughtKind) {
    const b = BALL;
    b.state = 'held'; f.hasBall = true; f.hold = caughtKind ? 0.5 : 0.32 + rnd() * 0.15; f.tried = true;
    b.vx = b.vz = b.vh = 0; b.x = f.x; b.h = 1.0; b.z = f.z;
    f.armUp = 0.5;
  }
  function checkFielders(b) {
    if (!b.batted || b.state !== 'air') return '';
    const D = G.D;
    for (let i = 0; i < FIELDERS.length; i++) {
      const f = FIELDERS[i];
      if (f.tried || f.hasBall) continue;
      const dx = abs(b.x - f.x), dz = abs(b.z - f.z);
      if (dx > 0.62 || dz > 1.3) continue;
      const spd = sqrt(b.vx * b.vx + b.vz * b.vz + b.vh * b.vh);
      if (b.bounces <= 1 && b.h > 0.22 && b.h < 2.4) {
        f.tried = true;
        let p = D.pCatch * f.hands * (1 - dx / 1.4 * 0.4) * (1 - clamp((spd - 12) / 30, 0, 0.45)) * (b.bounces === 1 ? 0.86 : 1);
        if (b.h > 1.9) p *= 0.8;
        if (f.walk > 0.6) p *= 0.88;
        f.armUp = 0.55;
        if (rnd() < p) { const kind = b.bounces === 0 ? 'caught' : 'tip'; takeBall(f, true); SND.caught(); G.catcher = f; return kind; }
        // dropped: it pops up and out
        SND.tink(); b.vx *= 0.35; b.vz += (rnd() - 0.5) * 2; b.vh = max(b.vh, 0) + 2.2; b.replan = true;
        if (rnd() < 0.6) say(pick(LINES.drop), f, 1.3, 1.9);
        pop('Dropped!', f.x, 2.3, '#FF8A3D', 15, 0.9);
      } else if (b.h < 0.5) {
        f.tried = true;
        const p = D.pStop * f.hands * (1 - clamp((spd - 9) / 30, 0, 0.5));
        f.dive = 0.4;
        if (rnd() < p) { takeBall(f, false); SND.thock(6); G.catcher = f; return ''; }
        else if (rnd() < 0.5) say('Arre!', f, 1.0, 1.9);
      }
    }
    return '';
  }

  /* ------------------------------------------------------------ the ball in play */
  function updateBall(dt) {
    const b = BALL;
    if (b.state === 'none' || b.state === 'gone') return;
    if (b.state === 'held') { const f = FIELDERS.find((q) => q.hasBall); if (f) { b.x = f.x + f.face * 0.2; b.h = 1.0; b.z = f.z; } return; }
    if (b.state === 'stuck') return;
    if (b.state === 'dog') { b.x = DOG.x + DOG.dir * 0.35; b.h = 0.3; b.z = DOG.z; return; }
    if (b.state === 'thrown') {
      const t = b.thrown; t.t += dt; const u = min(1, t.t / t.dur);
      b.x = lerp(t.x0, t.x1, u); b.h = lerp(t.h0, t.h1, u) + 4 * t.arc * u * (1 - u) * 0.5; b.z = 0; b.spin += dt * 20;
      if (u >= 1) {
        b.state = 'held';
        const runOut = BAT.state === 'run' && BAT.x > HOME_SAFE && BAT.x < CHALK_X - 0.25 && G.phase === 'live';
        if (runOut) { SND.wall(8); dustPuff(CRATE_X, 0.4, 0, 6, true); CRATE.fall = true; endBall('runout'); }
        else if (G.phase === 'live') endBall('stopped');
      }
      return;
    }
    // sub-stepped physics
    const n = max(1, Math.ceil(dt / 0.0055)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const code = stepBall(b, h);
      if (code) { resolveCode(code); return; }
      if (b.batted) {
        const k = checkFielders(b);
        if (k) { endBall(k, { name: G.catcher ? G.catcher.name : '' }); return; }
        if (b.state !== 'air') return;
      }
      // dog snatch
      if (DOG.active && !DOG.carry && b.batted && b.h <= BR + 0.05 && abs(b.x - DOG.x) < 0.5 && abs(b.z - DOG.z) < 0.9 && rnd() < 0.5 * h * 60) { dogFetch(); return; }
    }
    // events from the physics (sound, dust)
    if (b.evBounce) {
      const v = b.evBounce; b.evBounce = 0;
      SND.bounce(v); dustPuff(b.x, 0.05, b.z, v > 5 ? 5 : 2, v > 7);
      if (b.evPatch === 'pot' && !b.batted) { pop('Gaddha!', b.x, 0.9, '#FF8A3D', 15, 0.8); }
      if (b.evPatch === 'pot' || b.evPatch === 'crack' || b.evPatch === 'stones') { dustPuff(b.x, 0.05, b.z, 7, true); b.evPatch = ''; if (!b.batted && rnd() < 0.5) say(pick(LINES.pot), BOWLER, 1.0, 1.9); }
    }
    if (b.evWall) {
      const v = b.evWall; b.evWall = 0;
      if (b.evWallKind === 'awn') SND.boing(); else if (b.evWallKind === 'grille') SND.tink(); else SND.wall(v);
      dustPuff(b.x, b.h, min(b.z, ZW - 0.2), v > 6 ? 8 : 4, v > 7);
      if (v > 5) cam.shake = max(cam.shake, arc.reducedMotion ? 0 : 0.12);
      if (v > 7 && b.z > 1) scareBirds(b.x);
      if (v > 6 && (b.evWallKind === 'balc' || b.evWallKind === 'shutter') && AUNTY.state === 'hidden' && b.x > 0 && b.x < 8) AUNTY.cd = -1;
    }
    if (b.replan && b.batted && G.phase === 'live') planFielding(b);
    // trail
    b.trailT += dt;
    if (b.trailT > 0.016) { b.trailT = 0; const tr = b.trail; for (let i = 27; i >= 3; i--) tr[i] = tr[i - 3]; tr[0] = b.x; tr[1] = b.h; tr[2] = b.z; b.trailN = min(10, b.trailN + 1); }
    // balcony / slab resting: stuck
    if (b.batted && Math.abs(b.vh) < 0.3) {
      for (let i = 0; i < BALC.length; i++) {
        const bc = BALC[i];
        if (b.x > bc.x0 && b.x < bc.x1 && b.z > ZW - BAL_D && b.h < bc.hb + 0.3 && b.h > bc.hb && sqrt(b.vx * b.vx + b.vz * b.vz) < 0.9) {
          b.stuckT += dt;
          if (b.stuckT > 0.35 && G.phase === 'live') { b.state = 'stuck'; b.h = bc.hb + BR; b.vx = b.vz = b.vh = 0; AUNTY.state = AUNTY.state === 'hidden' ? 'rise' : AUNTY.state; endBall('stuck'); return; }
        }
      }
    }
    // the ball has stopped: a fielder will fetch it, but never let it sit for ever
    if (b.batted && b.h <= BR + 0.02 && sqrt(b.vx * b.vx + b.vz * b.vz) < 0.25) {
      b.restT += dt;
      b.vx = b.vz = 0;
      if (b.restT > 0.2 && G.phase === 'live') {
        let nearest = null, nt = 1e9;
        FIELDERS.forEach((g) => { const T = abs(g.x - b.x) / g.speed; if (T < nt) { nt = T; nearest = g; } });
        if (nearest) { nearest.goal = b.x; if (abs(nearest.x - b.x) < 0.5) { takeBall(nearest, false); SND.thock(4); } }
      }
      if (b.restT > 9 && G.phase === 'live') endBall('stopped');
    } else b.restT = 0;
    // a ball that was missed: wait a moment then call dot
    if (!b.batted && b.x < -1.1 && G.phase === 'flight') {
      G.dotT += dt;
      if (G.dotT > 0.5) { setPhaseMissed(); }
    }
    if (!b.batted && G.phase === 'flight') {
      if (b.x < END_X + 0.2 || sqrt(b.vx * b.vx + b.vz * b.vz) < 0.2 && b.h <= BR + 0.02) setPhaseMissed();
    }
  }
  function setPhaseMissed() {
    if (G.phase !== 'flight') return;
    if (SW.on || SW.after > 0) G.shotLabel = 'Miss'; else G.shotLabel = '';
    if (G.shotLabel === 'Miss') pop('Miss!', BAT.x, 1.8, '#FF8A3D', 17, 0.8);
    if (rnd() < 0.45) say(pick(LINES.miss), FIELDERS[0], 1.3, 1.9);
    endBall('dot');
  }
  function resolveCode(code) {
    const b = BALL;
    switch (code) {
      case 'bowled': {
        CRATE.fall = true; CRATE.vx = -3; SND.wall(9); SND.thock(10); dustPuff(CRATE_X, 0.4, 0, 8, true); cam.shake = arc.reducedMotion ? 0 : 0.3;
        b.vx *= 0.25; b.state = 'air'; endBall('bowled'); break;
      }
      case 'glass': {
        const w = b.hitWin; w.broken = true; b.state = 'gone'; b.hidden = true;
        SND.glass(); shards(b.x, b.h, ZW - 0.2); cam.shake = arc.reducedMotion ? 0 : 0.35; scareBirds(b.x, true);
        endBall('glass'); break;
      }
      case 'four': case 'two': {
        b.state = 'air'; SND.wall(10);
        if (code === 'four') { b.x = GATE_X; b.vx *= 0.15; SND.tink(); }
        endBall(code); break;
      }
      case 'six': case 'sixgate': {
        b.state = 'gone'; b.hidden = true; endBall(code); break;
      }
      default: break;
    }
  }
  function dogFetch() {
    DOG.carry = true; DOG.fetch = true; BALL.state = 'dog'; DOG.dir = DOG.x > cam.x ? 1 : -1; SND.bark();
    say(pick(LINES.dog), null, 1.5); BUBBLES[BUBBLES.length - 1].x = DOG.x; BUBBLES[BUBBLES.length - 1].h = 1.1;
    if (G.phase === 'live') endBall('dog');
  }

  /* ------------------------------------------------------------ neighbourhood life */
  function scareBirds(x, all) {
    for (let i = 0; i < BIRDS.length; i++) {
      const b = BIRDS[i];
      if (b.state !== 'perch') continue;
      if (all || abs(b.px - x) < 10) {
        b.state = 'fly'; b.t = 0; b.x = b.px; b.h = wireH(b.k, b.px) + 0.1; b.vx = rr(-2.8, 2.8); b.vy = rr(2.5, 4.5);
      }
    }
  }
  BIRDS.forEach((b) => { b.px = b.x; b.h = 0; });
  function updateBirds(dt) {
    for (let i = 0; i < BIRDS.length; i++) {
      const b = BIRDS[i];
      b.flap += dt * (b.state === 'perch' ? 0 : 18);
      if (b.state === 'fly') {
        b.t += dt; b.x += b.vx * dt; b.h += b.vy * dt; b.vy = lerp(b.vy, 0.4, min(1, dt * 1.2)) + sin(b.t * 5 + i) * dt * 2;
        if (b.t > 4.2) { b.state = 'back'; b.t = 0; b.sx = b.x; b.sh = b.h; }
      } else if (b.state === 'back') {
        b.t += dt; const u = min(1, b.t / 1.8), e = u * u * (3 - 2 * u);
        b.x = lerp(b.sx, b.px, e); b.h = lerp(b.sh, wireH(b.k, b.px) + 0.1, e) + sin(u * PI) * 0.6;
        if (u >= 1) { b.state = 'perch'; b.x = b.px; }
      }
    }
  }

  function updateAunty(dt) {
    const A_ = AUNTY;
    if (A_.state === 'hidden') {
      if (G.auntyTimer <= 0 || A_.cd < 0) {
        A_.state = 'rise'; A_.t = 0; A_.cd = 0; G.auntyTimer = rr(22, 38);
        if (rnd() < 0.7) setTimeout(() => { if (A_.state !== 'hidden') sayAt(pick(LINES.auntyChat), A_.x, A_.h + 2.05, ZW - 0.55, 2.3); }, 700);
      }
    } else if (A_.state === 'rise') {
      A_.up = min(1, A_.up + dt * 2.6); if (A_.up >= 1) { A_.state = 'idle'; A_.t = 0; }
    } else if (A_.state === 'idle') {
      A_.t += dt; if (A_.t > 4) A_.state = 'fall';
    } else if (A_.state === 'scold') {
      A_.up = min(1, A_.up + dt * 4); A_.t += dt; A_.shake = sin(A_.t * 22) * 0.5; if (A_.t > 3.2) A_.state = 'fall';
    } else if (A_.state === 'fall') {
      A_.up = max(0, A_.up - dt * 2.2); if (A_.up <= 0) { A_.state = 'hidden'; A_.shake = 0; }
    }
    G.flags.aunty = A_.state !== 'hidden';
  }

  function updateDog(dt) {
    const D_ = DOG, hw = V.W / (2 * V.S);
    if (!D_.active) {
      if (G.dogTimer <= 0 && AUTO.state === 'none') {
        D_.active = true; D_.dir = rnd() < 0.5 ? 1 : -1; D_.x = clamp(cam.x - D_.dir * (hw + 2), END_X + 1, GATE_X - 1);
        D_.state = 'walk'; D_.t = 0; D_.carry = false; D_.stops = 0; D_.goal = clamp(cam.x + rr(-hw * 0.5, hw * 0.5), END_X + 2, GATE_X - 2); D_.z = rr(0.9, 1.5);
        G.dogTimer = rr(24, 40);
      }
    } else {
      D_.phase += dt * 9;
      D_.t += dt;
      if (D_.carry) {
        D_.x += D_.dir * 5.5 * dt;
        if (abs(D_.x - cam.x) > hw + 6) { D_.active = false; D_.carry = false; }
      } else if (D_.state === 'walk') {
        const toGoal = D_.goal - D_.x;
        if (D_.stops < 1 && abs(toGoal) > 0.1) { D_.dir = toGoal > 0 ? 1 : -1; D_.x += D_.dir * 1.9 * dt; }
        else if (D_.stops < 1) { D_.state = rnd() < 0.5 ? 'sniff' : 'bark'; D_.t = 0; D_.stops = 1; if (D_.state === 'bark') { SND.bark(); say('Bhow bhow!', null, 1.3); const bb = BUBBLES[BUBBLES.length - 1]; bb.x = D_.x; bb.h = 1.15; bb.z = D_.z; } }
        else { D_.x += D_.dir * 2.1 * dt; if (abs(D_.x - cam.x) > hw + 5) D_.active = false; }
      } else if (D_.state === 'sniff') {
        if (D_.t > 1.8) { D_.state = 'walk'; D_.dir = D_.x < cam.x ? 1 : -1; if (rnd() < 0.5) D_.dir = -D_.dir; }
      } else if (D_.state === 'bark') {
        D_.barkT += dt; if (D_.barkT > 0.55 && D_.t < 1.7) { D_.barkT = 0; SND.bark(); scareBirds(D_.x); }
        if (D_.t > 1.9) { D_.state = 'walk'; D_.dir = rnd() < 0.5 ? 1 : -1; }
      }
    }
    G.flags.dog = D_.active;
  }

  function startAuto() {
    const hw = V.W / (2 * V.S);
    AUTO.dir = rnd() < 0.5 ? -1 : 1;
    AUTO.x = cam.x - AUTO.dir * (hw + 7); AUTO.end = cam.x + AUTO.dir * (hw + 7);
    AUTO.state = 'warn'; AUTO.t = 0; AUTO.horned = 0;
    G.autoTimer = rr(38, 58);
    G.flags.autoCount = (G.flags.autoCount || 0) + 1;
    SND.horn();
    // the nearest kid to the middle of the screen shouts
    let best = FIELDERS[2], bd = 1e9;
    FIELDERS.forEach((f) => { const d = abs(f.x - cam.x); if (d < bd) { bd = d; best = f; } });
    say(pick(LINES.auto), best, 2.0, 1.95);
    if (G.phase === 'ready') { setPhase('auto'); SW.on = false; }
  }
  function updateAuto(dt) {
    if (AUTO.state === 'none') {
      if (G.autoTimer <= 0 && (G.phase === 'ready' || G.phase === 'attract' || G.phase === 'over') && arc.state !== 'pause') startAuto();
      G.flags.auto = false; G.yield = lerp(G.yield || 0, 0, min(1, dt * 3)); return;
    }
    G.flags.auto = true;
    AUTO.t += dt;
    G.yield = lerp(G.yield || 0, 1, min(1, dt * 4));
    if (AUTO.state === 'warn') {
      if (AUTO.t > 0.9) { AUTO.state = 'pass'; AUTO.t = 0; }
    } else if (AUTO.state === 'pass') {
      AUTO.x += AUTO.dir * AUTO.speed * dt; AUTO.wheel += AUTO.speed * dt / 0.3;
      if (rnd() < dt * 8) emit(1, AUTO.x - AUTO.dir * 1.5, 0.45, -1.45, 0, { speed: 0.4, up: 0.8, life: 0.8, size: 5, col: '#8a8076', g: -0.3, vx: -AUTO.dir * 1.2 });
      if (!AUTO.horned && abs(AUTO.x - cam.x) < 6) { AUTO.horned = 1; SND.horn(); scareBirds(cam.x, true); }
      if ((AUTO.dir > 0 && AUTO.x > AUTO.end) || (AUTO.dir < 0 && AUTO.x < AUTO.end)) {
        AUTO.state = 'none'; G.flags.auto = false;
        if (G.phase === 'auto') { setPhase('ready'); G.readyT = 0.9; }
      }
    }
  }

  /* ------------------------------------------------------------ main update */
  function updateParticles(dt) {
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.vh -= GRAV * p.g * dt; p.x += p.vx * dt; p.h += p.vh * dt; p.z += p.vz * dt;
      if (p.h < 0.02 && p.kind !== 0) { p.h = 0.02; p.vh *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      if (p.kind === 0) { p.vx *= 1 - dt * 1.5; }
    }
    for (let i = POPS.length - 1; i >= 0; i--) { const p = POPS[i]; p.t += dt; if (p.t > p.life) POPS.splice(i, 1); }
    for (let i = BUBBLES.length - 1; i >= 0; i--) { const b = BUBBLES[i]; b.t += dt; if (b.ent) { b.x = b.ent.x; b.z = b.ent.z || 0; } if (b.t > b.life) BUBBLES.splice(i, 1); }
  }

  function updateCamera(dt) {
    const lo = camBounds()[0], hi = camBounds()[1];
    let tx = V.homeX, tyo = 0, k = 3.2;
    const b = BALL;
    if (G.phase === 'attract' || G.phase === 'over' || G.phase === 'auto' && false) {
      const T = G.time * 0.05;
      tx = V.homeX + sin(T) * 6 + 5;
      if (G.phase === 'over') tx = V.homeX;
      k = 1.2;
    } else if (G.phase === 'live' && b.state !== 'none') {
      tx = b.state === 'held' || b.state === 'thrown' ? lerp(cam.x, V.homeX, 0.5) : b.x + clamp(b.vx * 0.14, -3, 3);
      if (b.state === 'gone') tx = cam.x;
      tyo = clamp(b.h - 4.5, 0, 9) * V.S * 0.5; k = 5.2;
    } else if (G.phase === 'dead' && b.batted && b.state === 'air' && G.t < 0.9) {
      tx = b.x + clamp(b.vx * 0.1, -2, 2); tyo = 0; k = 3.5;
    }
    if (G.phase === 'live' && BAT.state === 'run') tx = lerp(tx, BAT.x + 2, 0.15);
    tx = lo > hi ? (lo + hi) / 2 : clamp(tx, lo, hi);
    if (arc.reducedMotion) k *= 0.55;
    cam.x += (tx - cam.x) * min(1, dt * k);
    cam.yo += (tyo - cam.yo) * min(1, dt * 3);
    cam.shake = max(0, cam.shake - dt * 1.6);
  }

  function ambient(dt) {
    G.autoTimer -= dt; G.dogTimer -= dt; G.auntyTimer -= dt;
    updateBirds(dt); updateAunty(dt); updateDog(dt); updateAuto(dt);
    updateParticles(dt);
    if (CRATE.fall) { CRATE.tip = min(1, CRATE.tip + dt * 3.2); }
    BAT.phase += dt * 3;
    SW.cd = max(0, SW.cd - dt);
    if (SW.on) { SW.t += dt; if (SW.t >= SW.dur) { SW.on = false; SW.after = 0.22; } }
    else if (SW.after > 0) SW.after -= dt;
  }

  function stepFlow(dt) {
    // returns after handling one frame of the match phases
    const ph = G.phase;
    if (ph === 'intro') {
      if (G.t >= G.phaseLen) { setPhase('ready'); G.readyT = 0.5; }
    } else if (ph === 'ready') {
      G.readyT -= dt;
      if (G.autoTimer <= 0) startAuto();
      else if (G.readyT <= 0) startRunup();
    } else if (ph === 'runup') {
      BOWLER.runT += dt;
      const u = min(1, BOWLER.runT / BOWLER.runDur);
      BOWLER.x = lerp(BOWLER.runFrom, BOWL_X, u * (2 - u) * 0.0 + u); // steady run-up
      BOWLER.arm = u; BOWLER.phase += dt * 11;
      if (u >= 1) release();
    } else if (ph === 'flight') {
      updateBall(dt);
      if (SW.on && !SW.hit && !BALL.batted && G.phase === 'flight') {
        const b = BALL, p = SW.t / SW.dur;
        if (b.state === 'air' && b.x > -0.15 && b.x < 1.25 && b.h > 0 && b.h < 1.95 && p >= 0.1 && p <= 0.9) contact(p);
      }
    } else if (ph === 'live') {
      G.liveT += dt;
      updateBall(dt);
    } else if (ph === 'dead') {
      if (BALL.state === 'air' || BALL.state === 'thrown' || BALL.state === 'held') updateBall(dt);
      if (G.t >= G.phaseLen) afterBall();
    } else if (ph === 'interlude') {
      G.interludeT += dt;
      if (G.interludeT > 0.6 && (arc.input.hit('Space', 'Enter', 'NumpadEnter') || arc.input.pointer.pressed || G.interludeT > 9)) {
        G.matchIx++; newMatch();
      }
    }
  }

  function update(dt, a) {
    arc = a;
    let gdt = dt;
    if (G.slow > 0) { G.slow -= dt; gdt = dt * 0.28; }
    G.time += gdt; G.t += gdt;
    const inp = a.input;
    if (inp.hit('Space') || inp.pointer.pressed) {
      if (G.phase !== 'interlude') pressBat();
    }
    if (inp.hit('KeyR')) startRun();
    ambient(gdt);
    stepFlow(gdt);
    updateBatter(gdt);
    updateFielders(gdt);
    // dead phase: batter heads home
    if (G.phase === 'dead' || G.phase === 'ready') {
      if (BAT.x > BAT_X + 0.02 && BAT.state === 'idle') { BAT.x = max(BAT_X, BAT.x - 4.4 * gdt); BAT.face = -1; BAT.run = 1; if (BAT.x <= BAT_X + 0.02) BAT.lastEnd = 0; }
    }
    updateCamera(dt);
  }

  function idle(dt, a) {
    arc = a;
    if (a.state === 'pause') return;
    G.time += dt; G.t += dt;
    ambient(dt);
    updateFielders(dt);
    updateBatter(dt);
    if (G.phase === 'dead') { G.phase = 'over'; }
    updateCamera(dt);
  }

  /* ------------------------------------------------------------ drawing: characters */
  // Two-bone arm. Coordinates are local metres, +x forward, +y UP (converted when drawn).
  function arm2(c, u, sx, sy, tx, ty, tee, skin, bend) {
    const L1 = 0.24, L2 = 0.23;
    let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
    if (d > L1 + L2 - 0.005) { const k = (L1 + L2 - 0.005) / d; dx *= k; dy *= k; d = L1 + L2 - 0.005; tx = sx + dx; ty = sy + dy; }
    if (d < 0.05) d = 0.05;
    const base = atan2(dy, dx);
    const ca = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const a1 = base + Math.acos(ca) * (bend || -1);
    const ex = sx + cos(a1) * L1, ey = sy + sin(a1) * L1;
    c.lineCap = 'round';
    c.strokeStyle = tee; c.lineWidth = 0.1 * u;
    c.beginPath(); c.moveTo(sx * u, -sy * u); c.lineTo((sx + (ex - sx) * 0.8) * u, -(sy + (ey - sy) * 0.8) * u); c.stroke();
    c.strokeStyle = skin; c.lineWidth = 0.075 * u;
    c.beginPath(); c.moveTo((sx + (ex - sx) * 0.8) * u, -(sy + (ey - sy) * 0.8) * u); c.lineTo(ex * u, -ey * u); c.lineTo(tx * u, -ty * u); c.stroke();
    c.fillStyle = skin; c.beginPath(); c.arc(tx * u, -ty * u, 0.05 * u, 0, TAU); c.fill();
  }
  let HANDX = 0, HANDY = 0;

  // o: {face, wk, ph, crouch, lean, style, scale, hands:[[x,y],[x,y]]|null, up:0..1, bob}
  function drawKid(c, px, py, S, o) {
    const u = S * (o.scale || 1), f = o.face, st = o.style, wk = o.wk || 0, ph = o.ph || 0, crouch = o.crouch || 0;
    c.save(); c.translate(px, py); c.scale(f, 1);
    // legs: plant the lowest foot on the ground
    const L1 = 0.31, L2 = 0.31;
    const ang = [0, 0, 0, 0];
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const a = sin(ph + i * PI) * 0.72 * wk + crouch * 0.42 * s + s * 0.07;
      const b = a - max(0, sin(ph + i * PI + 1.1)) * 0.95 * wk - crouch * (i ? 0.1 : 0.8);
      ang[i * 2] = a; ang[i * 2 + 1] = b;
    }
    const drop0 = L1 * cos(ang[0]) + L2 * cos(ang[1]), drop1 = L1 * cos(ang[2]) + L2 * cos(ang[3]);
    const hipH = max(drop0, drop1) + (o.bob || 0);
    for (let i = 1; i >= 0; i--) {
      const a = ang[i * 2], b = ang[i * 2 + 1];
      const kx = sin(a) * L1, ky = hipH - cos(a) * L1;
      const ax = kx + sin(b) * L2, ay = ky - cos(b) * L2;
      c.lineCap = 'round';
      c.strokeStyle = i ? shade(st.shorts, -0.25) : st.shorts; c.lineWidth = 0.14 * u;
      c.beginPath(); c.moveTo(0, -hipH * u); c.lineTo(kx * u, -ky * u); c.stroke();
      c.strokeStyle = i ? shade(st.skin, -0.18) : st.skin; c.lineWidth = 0.085 * u;
      c.beginPath(); c.moveTo(kx * u, -ky * u); c.lineTo(ax * u, -ay * u); c.stroke();
      c.fillStyle = i ? '#2a2420' : '#3a2f28'; c.beginPath(); c.ellipse((ax + 0.05) * u, -(ay - 0.015) * u, 0.1 * u, 0.05 * u, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect((ax - 0.02) * u, -(ay - 0.03) * u, 0.14 * u, 0.018 * u);
    }
    // torso
    const lean = (o.lean || 0) * 0.17, shY = hipH + 0.45 - crouch * 0.04;
    c.fillStyle = st.shorts; c.beginPath(); c.moveTo(-0.12 * u, -hipH * u); c.lineTo(0.12 * u, -hipH * u); c.lineTo(0.13 * u, -(hipH + 0.16) * u); c.lineTo(-0.13 * u, -(hipH + 0.16) * u); c.closePath(); c.fill();
    c.fillStyle = st.tee;
    c.beginPath();
    c.moveTo(-0.13 * u, -(hipH + 0.1) * u); c.lineTo(0.13 * u, -(hipH + 0.1) * u);
    c.quadraticCurveTo((0.17 + lean) * u, -(shY - 0.1) * u, (0.16 + lean) * u, -(shY + 0.0) * u);
    c.lineTo((-0.16 + lean) * u, -(shY + 0.0) * u);
    c.quadraticCurveTo((-0.17 + lean * 0.4) * u, -(shY - 0.1) * u, -0.13 * u, -(hipH + 0.1) * u);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect((-0.15 + lean) * u, -(shY - 0.03) * u, 0.31 * u, 0.045 * u);
    c.fillStyle = 'rgba(0,0,0,.14)'; c.beginPath(); c.moveTo(-0.15 * u, -(hipH + 0.1) * u); c.lineTo(-0.03 * u, -(hipH + 0.1) * u); c.lineTo(-0.03 * u + lean * u, -(shY) * u); c.lineTo((-0.16 + lean) * u, -shY * u); c.closePath(); c.fill();
    // head
    const hx = (0.03 + lean * 1.1) * u, hy = -(shY + 0.18) * u, hr = 0.14 * u;
    c.fillStyle = shade(st.skin, -0.12); c.fillRect(hx - 0.035 * u, hy + hr * 0.7, 0.07 * u, 0.1 * u);
    c.fillStyle = st.hair; c.beginPath(); c.arc(hx - 0.015 * u, hy - 0.012 * u, hr * 1.06, 0, TAU); c.fill();
    c.fillStyle = st.skin; c.beginPath(); c.arc(hx + 0.022 * u, hy + 0.018 * u, hr * 0.93, 0, TAU); c.fill();
    c.fillStyle = st.hair; c.beginPath(); c.arc(hx + 0.005 * u, hy - 0.04 * u, hr * 0.98, PI * 1.02, PI * 1.9); c.lineTo(hx + 0.02 * u, hy - 0.02 * u); c.closePath(); c.fill();
    if (st.cap) {
      c.fillStyle = st.cap; c.beginPath(); c.arc(hx, hy - 0.01 * u, hr * 1.08, PI, TAU); c.closePath(); c.fill();
      c.fillRect(hx + 0.02 * u, hy - 0.03 * u, hr * 1.3, 0.03 * u);
    }
    c.fillStyle = '#1b130e'; c.beginPath(); c.arc(hx + 0.085 * u, hy + 0.012 * u, 0.017 * u, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(60,20,10,.65)'; c.lineWidth = 0.014 * u; c.beginPath(); c.arc(hx + 0.07 * u, hy + 0.05 * u, 0.035 * u, 0.2, PI * 0.8); c.stroke();
    c.fillStyle = shade(st.skin, -0.18); c.beginPath(); c.arc(hx - 0.04 * u, hy + 0.03 * u, 0.03 * u, 0, TAU); c.fill();
    // arms
    const sx = lean, sy = shY - 0.06;
    for (let i = 1; i >= 0; i--) {
      let tx, ty;
      const hd = o.hands && o.hands[i];
      if (hd) { tx = hd[0]; ty = hd[1]; }
      else {
        const a = sin(ph + i * PI + PI) * 0.62 * wk;
        tx = sx + sin(a) * 0.44; ty = sy - cos(a) * 0.44;
        if (o.up) { tx = lerp(tx, sx + 0.18, o.up); ty = lerp(ty, sy + 0.5, o.up); }
      }
      arm2(c, u, sx, sy, tx, ty, i ? shade(st.tee, -0.2) : st.tee, i ? shade(st.skin, -0.18) : st.skin, -1);
      if (i === 0) { HANDX = tx; HANDY = ty; }
    }
    // bat, in the front hand
    if (o.bat) {
      const ang = o.bat.ang, len = 0.9;
      const hx2 = o.bat.hx, hy2 = o.bat.hy;
      const bx0 = hx2 - cos(ang) * 0.08, by0 = hy2 - sin(ang) * 0.08;
      const hx3 = hx2 + cos(ang) * 0.3, hy3 = hy2 + sin(ang) * 0.3, ex = hx2 + cos(ang) * len, ey = hy2 + sin(ang) * len;
      c.lineCap = 'round';
      c.strokeStyle = '#b98d52'; c.lineWidth = 0.04 * u; c.beginPath(); c.moveTo(bx0 * u, -by0 * u); c.lineTo(hx3 * u, -hy3 * u); c.stroke();
      c.strokeStyle = '#e9c88f'; c.lineWidth = 0.115 * u; c.beginPath(); c.moveTo(hx3 * u, -hy3 * u); c.lineTo(ex * u, -ey * u); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 0.025 * u; c.beginPath(); c.moveTo((hx3 + 0.0) * u, -(hy3 + 0.03) * u); c.lineTo(ex * u, -(ey + 0.035) * u); c.stroke();
      c.strokeStyle = '#d33a3a'; c.lineWidth = 0.05 * u; c.beginPath(); c.moveTo((hx2 + cos(ang) * 0.18) * u, -(hy2 + sin(ang) * 0.18) * u); c.lineTo((hx2 + cos(ang) * 0.24) * u, -(hy2 + sin(ang) * 0.24) * u); c.stroke();
    }
    c.restore();
  }

  function kidShadow(c, px, py, S, o) {
    const u = S * (o.scale || 1);
    c.save(); c.translate(px, py); c.transform(1, 0, 1.55, -0.13, 0, 0);
    c.fillStyle = 'rgba(40,12,30,.30)'; c.strokeStyle = 'rgba(40,12,30,.30)'; c.lineCap = 'round';
    c.lineWidth = 0.13 * u;
    const w = (o.wk || 0);
    c.beginPath(); c.moveTo(0, -0.62 * u); c.lineTo(sin(o.ph || 0) * 0.3 * w * u, 0); c.moveTo(0, -0.62 * u); c.lineTo(-sin(o.ph || 0) * 0.3 * w * u, 0); c.stroke();
    c.fillRect(-0.14 * u * o.face, -1.05 * u, 0.28 * u * o.face, 0.45 * u);
    c.beginPath(); c.arc(0.03 * u * o.face, -1.22 * u, 0.15 * u, 0, TAU); c.fill();
    c.restore();
  }

  /* ------------------------------------------------------------ drawing: scenery pieces */
  function drawAunty(c) {
    const A_ = AUNTY;
    if (A_.state === 'hidden' && A_.up <= 0) return;
    const u = V.S * 1.0, x = sxOf(A_.x + (A_.shake || 0) * 0.04), yb = syOf(A_.h, A_.z) + (1 - A_.up) * 1.5 * V.S;
    const scold = A_.state === 'scold';
    c.save(); c.translate(x, yb);
    // saree body
    let g = c.createLinearGradient(-0.3 * u, 0, 0.3 * u, 0); g.addColorStop(0, '#9c2457'); g.addColorStop(1, '#d94a86');
    c.fillStyle = g; c.beginPath(); c.moveTo(-0.34 * u, 0); c.lineTo(0.34 * u, 0); c.lineTo(0.22 * u, -1.0 * u); c.quadraticCurveTo(0, -1.12 * u, -0.22 * u, -1.0 * u); c.closePath(); c.fill();
    c.fillStyle = '#e8b64a'; c.beginPath(); c.moveTo(-0.34 * u, -0.05 * u); c.lineTo(0.34 * u, -0.05 * u); c.lineTo(0.33 * u, -0.12 * u); c.lineTo(-0.33 * u, -0.12 * u); c.closePath(); c.fill();
    c.fillStyle = '#f2c860'; c.beginPath(); c.moveTo(0.1 * u, -0.98 * u); c.lineTo(0.22 * u, -1.0 * u); c.lineTo(0.3 * u, -0.1 * u); c.lineTo(0.16 * u, -0.1 * u); c.closePath(); c.fill();
    // neck + head
    c.fillStyle = '#c98f63'; c.fillRect(-0.045 * u, -1.18 * u, 0.09 * u, 0.12 * u);
    c.fillStyle = '#c98f63'; c.beginPath(); c.arc(0, -1.3 * u, 0.15 * u, 0, TAU); c.fill();
    c.fillStyle = '#1d1411'; c.beginPath(); c.arc(0, -1.34 * u, 0.158 * u, PI * 1.05, PI * 1.95); c.closePath(); c.fill();
    c.beginPath(); c.arc(-0.1 * u, -1.46 * u, 0.09 * u, 0, TAU); c.fill();
    c.fillStyle = '#d33a3a'; c.beginPath(); c.arc(0.0, -1.36 * u, 0.012 * u, 0, TAU); c.fill();
    c.fillStyle = '#1b130e';
    c.beginPath(); c.arc(-0.05 * u, -1.3 * u, 0.014 * u, 0, TAU); c.arc(0.05 * u, -1.3 * u, 0.014 * u, 0, TAU); c.fill();
    c.strokeStyle = '#1b130e'; c.lineWidth = Math.max(1.5, 0.018 * u);
    if (scold) { c.beginPath(); c.moveTo(-0.09 * u, -1.36 * u); c.lineTo(-0.02 * u, -1.33 * u); c.moveTo(0.09 * u, -1.36 * u); c.lineTo(0.02 * u, -1.33 * u); c.stroke(); c.fillStyle = '#7a1a1a'; c.beginPath(); c.ellipse(0, -1.2 * u, 0.045 * u, 0.03 * u, 0, 0, TAU); c.fill(); }
    else { c.beginPath(); c.arc(0, -1.22 * u, 0.045 * u, 0.15, PI - 0.15); c.stroke(); }
    // arms: one waves a finger when scolding, otherwise holds a little watering can
    c.lineCap = 'round'; c.strokeStyle = '#c98f63'; c.lineWidth = 0.08 * u;
    if (scold) {
      const sh = (A_.shake || 0);
      c.beginPath(); c.moveTo(0.18 * u, -0.95 * u); c.lineTo((0.55 + sh * 0.12) * u, -1.25 * u); c.lineTo((0.62 + sh * 0.18) * u, -1.62 * u); c.stroke();
      c.fillStyle = '#c98f63'; c.beginPath(); c.arc((0.62 + sh * 0.18) * u, -1.64 * u, 0.055 * u, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-0.18 * u, -0.95 * u); c.lineTo(-0.35 * u, -0.7 * u); c.lineTo(-0.2 * u, -0.58 * u); c.stroke();
    } else {
      c.beginPath(); c.moveTo(0.18 * u, -0.95 * u); c.lineTo(0.4 * u, -0.78 * u); c.lineTo(0.46 * u, -0.9 * u); c.stroke();
      c.fillStyle = '#3f8f8f'; c.fillRect(0.4 * u, -1.0 * u, 0.2 * u, 0.15 * u); c.strokeStyle = '#3f8f8f'; c.lineWidth = 0.03 * u; c.beginPath(); c.moveTo(0.6 * u, -0.95 * u); c.lineTo(0.76 * u, -1.06 * u); c.stroke();
    }
    c.restore();
  }

  function drawWallDynamic(c) {
    const S = V.S;
    // broken windows
    for (let i = 0; i < WIN.length; i++) {
      const w = WIN[i];
      if (!w.broken) continue;
      const x0 = sxOf(w.x0), x1 = sxOf(w.x1), y0 = syOf(w.h1, ZW), y1 = syOf(w.h0, ZW);
      c.fillStyle = 'rgba(14,8,6,.94)'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.fillStyle = '#f3ecdc';
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.22); c.lineTo(x0 + (x1 - x0) * 0.1, y0 + (y1 - y0) * 0.55); c.lineTo(x0, y0 + (y1 - y0) * 0.48); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - (x1 - x0) * 0.35, y1 - (y1 - y0) * 0.2); c.lineTo(x1 - (x1 - x0) * 0.2, y1 - (y1 - y0) * 0.5); c.lineTo(x1, y1 - (y1 - y0) * 0.44); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x1, y0); c.lineTo(x1 - (x1 - x0) * 0.22, y0 + (y1 - y0) * 0.18); c.lineTo(x1, y0 + (y1 - y0) * 0.3); c.closePath(); c.fill();
    }
    // chalk scoreboard
    {
      const bx0 = sxOf(2.0), bx1 = sxOf(5.25), by0 = syOf(3.0, ZW), by1 = syOf(1.4, ZW), bw = bx1 - bx0, bh = by1 - by0;
      const fs = clamp(S * 0.215, 12, 22);
      c.save(); c.beginPath(); c.rect(bx0, by0, bw, bh); c.clip();
      c.fillStyle = 'rgba(250,246,236,.92)'; c.textAlign = 'left'; c.textBaseline = 'middle';
      const lines = [];
      const ovs = floor(G.balls / 6) + '.' + (G.balls % 6);
      if (G.phase === 'attract' || G.phase === 'over' && !G.balls) { lines.push('GULLY CHAMPS'); lines.push('RUNS 0  OUT 0'); }
      else {
        lines.push('RUNS ' + G.runs + '  OUT ' + G.outs + '/' + G.maxOuts);
        lines.push('BALLS ' + G.balls + '  OV ' + ovs);
        lines.push(G.mode === 'last' ? 'LAST MAN STANDING' : 'TARGET ' + G.target + ' (' + max(0, G.target - G.runs) + ' to go)');
      }
      c.font = '700 ' + fs + 'px ' + FONT_MONO;
      const lh = bh / (lines.length + 0.6);
      lines.forEach((t, i) => {
        c.save(); c.translate(bx0 + bw * 0.07 + (i === 0 ? 1 : 0), by0 + lh * (i + 0.8)); c.rotate((i % 2 ? 1 : -1) * 0.012);
        c.fillStyle = 'rgba(250,246,236,' + (i === 0 ? 0.95 : 0.82) + ')'; c.fillText(t, 0, 0);
        c.restore();
      });
      // chalk dust smudge
      c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(bx0, by1 - bh * 0.18, bw * 0.6, bh * 0.1);
      c.restore();
    }
    // clothes drying on the balconies
    for (let i = 0; i < BALC.length; i++) {
      const b = BALC[i];
      const y = syOf(b.hb + 2.0, ZW - 0.5), xa = sxOf(b.x0 + 0.25), xb = sxOf(b.x1 - 0.25);
      c.strokeStyle = 'rgba(30,20,20,.6)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(xa, y); c.lineTo(xb, y + 3); c.stroke();
      const n = max(2, Math.round((xb - xa) / (S * 0.75)));
      const cols = ['#e23e57', '#f5e6c4', '#2f80c9', '#f2b01e', '#3f9e5a'];
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, cx = lerp(xa, xb, t), sw = sin(G.time * 1.7 + i * 2 + k) * 0.05 * S, ln = (0.62 + (k % 2) * 0.18) * S, wd = 0.34 * S;
        c.fillStyle = cols[(i + k) % cols.length];
        c.beginPath(); c.moveTo(cx - wd / 2, y + 2); c.lineTo(cx + wd / 2, y + 2); c.lineTo(cx + wd / 2 + sw, y + ln); c.lineTo(cx - wd / 2 + sw, y + ln); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(cx - wd / 2, y + 2, wd * 0.3, ln * 0.9);
      }
    }
    drawAunty(c);
  }

  function drawBirds(c) {
    for (let i = 0; i < BIRDS.length; i++) {
      const b = BIRDS[i];
      const x = sxOf(b.state === 'perch' ? b.px : b.x), hh = b.state === 'perch' ? wireH(b.k, b.px) : b.h;
      if (x < -20 || x > V.W + 20) continue;
      const y = syOf(hh, 1.4), r = V.S * 0.11;
      c.fillStyle = i % 2 ? '#5b5660' : '#8b8590';
      if (b.state === 'perch') {
        c.beginPath(); c.ellipse(x, y - r * 0.9, r * 1.1, r * 0.8, -0.2, 0, TAU); c.fill();
        c.beginPath(); c.arc(x + r * 1.0, y - r * 1.5, r * 0.55, 0, TAU); c.fill();
        c.fillStyle = '#e7b350'; c.beginPath(); c.moveTo(x + r * 1.5, y - r * 1.5); c.lineTo(x + r * 2.0, y - r * 1.35); c.lineTo(x + r * 1.5, y - r * 1.25); c.fill();
        c.strokeStyle = '#3a3535'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 2, y - r * 0.3); c.lineTo(x - 2, y); c.moveTo(x + 2, y - r * 0.3); c.lineTo(x + 2, y); c.stroke();
      } else {
        const fl = sin(b.flap) * r * 1.4;
        c.beginPath(); c.ellipse(x, y, r * 1.1, r * 0.55, 0, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(x - r, y); c.lineTo(x - r * 0.2, y - fl - r * 0.4); c.lineTo(x + r * 0.7, y); c.closePath(); c.fill();
        c.beginPath(); c.arc(x + r * 1.0, y - r * 0.2, r * 0.45, 0, TAU); c.fill();
      }
    }
  }

  function drawDog(c) {
    if (!DOG.active) return;
    const D_ = DOG, S = V.S, x = sxOf(D_.x), y = syOf(0, D_.z), f = D_.dir, u = S * 0.9;
    const run = D_.carry ? 1 : (D_.state === 'walk' ? 0.6 : 0);
    c.save(); c.translate(x, y); c.scale(f, 1);
    c.fillStyle = 'rgba(40,12,30,.28)'; c.beginPath(); c.ellipse(-0.35 * u, 0.02 * u, 0.62 * u, 0.07 * u, 0, 0, TAU); c.fill();
    const body = '#b88a5a', dark = '#8d6540';
    // legs
    c.lineCap = 'round'; c.lineWidth = 0.085 * u;
    for (let i = 0; i < 4; i++) {
      const sg = i % 2 ? 1 : -1, px = (i < 2 ? 0.28 : -0.32) + (i % 2) * 0.05, a = sin(D_.phase + i * 1.6) * 0.5 * run;
      c.strokeStyle = i % 2 ? dark : body;
      c.beginPath(); c.moveTo(px * u, -0.26 * u); c.lineTo((px + sin(a) * 0.2) * u, -0.02 * u - max(0, -cos(D_.phase + i * 1.6)) * 0.05 * u * run); c.stroke();
    }
    // body
    c.fillStyle = body; c.beginPath(); c.ellipse(0, -0.36 * u, 0.46 * u, 0.2 * u, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(0.04 * u, -0.45 * u, 0.36 * u, 0.07 * u, 0, 0, TAU); c.fill();
    c.fillStyle = dark; c.beginPath(); c.ellipse(-0.1 * u, -0.34 * u, 0.12 * u, 0.09 * u, 0, 0, TAU); c.fill();
    // tail wag
    const tw = sin(D_.phase * 1.4 + (D_.state === 'bark' ? 6 : 0)) * 0.35;
    c.strokeStyle = body; c.lineWidth = 0.07 * u; c.beginPath(); c.moveTo(-0.44 * u, -0.42 * u); c.quadraticCurveTo(-0.62 * u, -0.5 * u, (-0.7 + tw * 0.2) * u, (-0.66 + tw * 0.1) * u); c.stroke();
    // head
    const sniff = D_.state === 'sniff' ? 0.22 : 0, bark = D_.state === 'bark' && sin(D_.t * 14) > 0;
    c.save(); c.translate(0.46 * u, (-0.5 + sniff) * u);
    c.fillStyle = body; c.beginPath(); c.ellipse(0, 0, 0.17 * u, 0.14 * u, 0, 0, TAU); c.fill();
    c.fillStyle = '#d9b88c'; c.beginPath(); c.ellipse(0.16 * u, 0.04 * u, 0.12 * u, 0.075 * u, 0, 0, TAU); c.fill();
    c.fillStyle = '#1b130e'; c.beginPath(); c.arc(0.27 * u, 0.0, 0.025 * u, 0, TAU); c.arc(0.06 * u, -0.04 * u, 0.018 * u, 0, TAU); c.fill();
    c.fillStyle = dark; c.beginPath(); c.ellipse(-0.08 * u, -0.1 * u, 0.06 * u, 0.12 * u, 0.5, 0, TAU); c.fill();
    if (bark) { c.fillStyle = '#7a1a1a'; c.beginPath(); c.ellipse(0.2 * u, 0.1 * u, 0.09 * u, 0.04 * u, 0.2, 0, TAU); c.fill(); }
    if (D_.carry) { c.fillStyle = '#d6e64a'; c.beginPath(); c.arc(0.3 * u, 0.1 * u, 0.065 * u, 0, TAU); c.fill(); }
    c.restore();
    c.restore();
  }

  function drawAuto(c) {
    if (AUTO.state === 'none' || AUTO.state === 'warn') return;
    const S = V.S * 1.06, x = sxOf(AUTO.x), y = syOf(0, -1.45), f = AUTO.dir;
    const u = S;
    c.save(); c.translate(x, y); c.scale(f, 1);
    // shadow
    c.fillStyle = 'rgba(40,12,30,.32)'; c.beginPath(); c.ellipse(-1.0 * u, 0.04 * u, 1.7 * u, 0.13 * u, 0, 0, TAU); c.fill();
    // body
    let g = c.createLinearGradient(0, -1.4 * u, 0, -0.3 * u); g.addColorStop(0, '#f6cf4a'); g.addColorStop(1, '#d8a423');
    c.fillStyle = g; c.beginPath(); c.moveTo(-2.1 * u, -0.34 * u); c.lineTo(-2.15 * u, -1.25 * u); c.quadraticCurveTo(-2.1 * u, -1.55 * u, -1.7 * u, -1.6 * u);
    c.lineTo(0.05 * u, -1.6 * u); c.quadraticCurveTo(0.5 * u, -1.55 * u, 0.62 * u, -1.0 * u); c.lineTo(0.78 * u, -0.78 * u); c.lineTo(0.8 * u, -0.34 * u); c.closePath(); c.fill();
    // canopy
    c.fillStyle = '#1f4a38'; c.beginPath(); c.moveTo(-2.25 * u, -1.5 * u); c.quadraticCurveTo(-1.9 * u, -1.9 * u, -1.0 * u, -1.9 * u); c.lineTo(0.0 * u, -1.9 * u); c.quadraticCurveTo(0.34 * u, -1.86 * u, 0.4 * u, -1.55 * u); c.lineTo(-2.25 * u, -1.5 * u); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(-2.1 * u, -1.86 * u, 2.2 * u, 0.04 * u);
    // pillar, window, driver
    c.fillStyle = '#2a2a2e'; c.fillRect(-0.9 * u, -1.55 * u, 0.06 * u, 1.2 * u);
    c.fillStyle = 'rgba(150,200,220,.5)'; c.fillRect(-1.95 * u, -1.5 * u, 1.0 * u, 0.55 * u);
    c.fillStyle = 'rgba(150,200,220,.55)'; c.beginPath(); c.moveTo(0.04 * u, -1.55 * u); c.lineTo(0.52 * u, -1.5 * u); c.lineTo(0.7 * u, -0.8 * u); c.lineTo(0.04 * u, -0.8 * u); c.closePath(); c.fill();
    c.fillStyle = '#7a5a3a'; c.beginPath(); c.arc(-0.45 * u, -1.28 * u, 0.15 * u, 0, TAU); c.fill();
    c.fillStyle = '#2f3a2a'; c.fillRect(-0.62 * u, -1.15 * u, 0.4 * u, 0.55 * u);
    c.fillStyle = '#1b130e'; c.fillRect(-0.57 * u, -1.36 * u, 0.28 * u, 0.06 * u);
    // text on the back
    c.fillStyle = '#7a1f1f'; c.font = '800 ' + Math.max(9, 0.13 * u) + 'px ' + FONT_UI; c.textAlign = 'left';
    c.save(); c.scale(f, 1); c.restore();
    c.fillStyle = 'rgba(122,31,31,.85)'; c.fillRect(-2.0 * u, -0.72 * u, 1.1 * u, 0.2 * u);
    c.fillStyle = '#f5e6c4'; c.fillRect(-1.98 * u, -0.7 * u, 1.06 * u, 0.16 * u);
    // headlight
    c.fillStyle = '#fff3c0'; c.beginPath(); c.arc(0.72 * u, -0.9 * u, 0.1 * u, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,240,170,.22)'; c.beginPath(); c.moveTo(0.78 * u, -0.9 * u); c.lineTo(2.6 * u, -1.15 * u); c.lineTo(2.6 * u, -0.45 * u); c.closePath(); c.fill();
    // wheels
    [-1.55, 0.35].forEach((wx2, wi) => {
      c.save(); c.translate(wx2 * u, -0.3 * u);
      c.fillStyle = '#1b1b1e'; c.beginPath(); c.arc(0, 0, 0.3 * u, 0, TAU); c.fill();
      c.fillStyle = '#b8b8bc'; c.beginPath(); c.arc(0, 0, 0.14 * u, 0, TAU); c.fill();
      c.rotate(AUTO.wheel * (wi ? 1 : 1)); c.fillStyle = '#6a6a70'; c.fillRect(-0.12 * u, -0.02 * u, 0.24 * u, 0.04 * u); c.fillRect(-0.02 * u, -0.12 * u, 0.04 * u, 0.24 * u);
      c.restore();
    });
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-2.15 * u, -0.42 * u, 2.95 * u, 0.08 * u);
    c.restore();
    // the back text, drawn upright
    c.save(); c.translate(x, y); c.fillStyle = '#7a1f1f'; c.font = '800 ' + Math.max(9, 0.115 * u) + 'px ' + FONT_UI; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('HORN PLEASE', f * -1.45 * u, -0.62 * u); c.restore();
  }

  function drawCrate(c) {
    const S = V.S, x = sxOf(CRATE.x), y = syOf(0, 0);
    const t = CRATE.tip;
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(40,12,30,.3)'; c.beginPath(); c.ellipse(-0.3 * S, 0.03 * S, 0.5 * S, 0.06 * S, 0, 0, TAU); c.fill();
    c.translate(-t * 0.3 * S, 0); c.rotate(-t * 1.45); c.translate(0, -t * 0.0);
    const w = 0.42 * S, h = 0.7 * S;
    c.fillStyle = '#e0562f'; roundRect(c, -w / 2, -h, w, h, 3); c.fill();
    c.fillStyle = 'rgba(0,0,0,.25)'; roundRect(c, -w / 2 + 3, -h + 7, w - 6, h * 0.28, 2); c.fill(); roundRect(c, -w / 2 + 3, -h * 0.55, w - 6, h * 0.28, 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(-w / 2, -h, w, 4);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(w / 2 - 5, -h, 5, h);
    // three chalk-stump lines on the crate
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = Math.max(2, 0.04 * S);
    for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * w * 0.22, -h * 0.97); c.lineTo(k * w * 0.22, -h * 0.58); c.stroke(); }
    c.restore();
  }

  function drawBallObj(c) {
    const b = BALL;
    if (b.state === 'none' || b.hidden || b.state === 'gone') return;
    const S = V.S, pr = max(5, 0.118 * S);
    const sc = 1 + max(0, -b.z) * 0.035 - max(0, b.z) * 0.012;
    const gx = sxOf(b.x), gy = syOf(0, b.z);
    // shadow on the road (it lies a little to the left, like the others)
    const sh = clamp(1 - b.h / 7, 0.25, 1);
    c.fillStyle = 'rgba(40,12,30,' + (0.34 * sh) + ')';
    c.beginPath(); c.ellipse(gx - b.h * 0.45 * S, gy + 0.01 * S, pr * (1.1 + b.h * 0.05) * 1.3, pr * 0.42, 0, 0, TAU); c.fill();
    // trail
    if (b.state === 'air') {
      const tr = b.trail;
      for (let i = 1; i < b.trailN && i < 9; i++) {
        const tx = sxOf(tr[i * 3]), ty = syOf(tr[i * 3 + 1], tr[i * 3 + 2]);
        c.fillStyle = 'rgba(255,244,190,' + (0.3 * (1 - i / 9)) + ')'; c.beginPath(); c.arc(tx, ty, pr * (1 - i / 14), 0, TAU); c.fill();
      }
    }
    const x = sxOf(b.x), y = syOf(b.h, b.z), r = pr * sc;
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(x, y, r + 2, 0, TAU); c.fill();
    c.save(); c.translate(x, y);
    const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#f1ff7a'); g.addColorStop(1, '#a9c21e');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.rotate(b.spin);
    c.strokeStyle = '#f7f4ea'; c.lineWidth = max(2, r * 0.42); c.beginPath(); c.arc(-r * 1.25, 0, r * 1.2, -0.75, 0.75); c.stroke();
    c.strokeStyle = '#2b2b2b'; c.lineWidth = 1; c.beginPath(); c.arc(-r * 1.25, 0, r * 1.2 + r * 0.2, -0.7, 0.7); c.stroke();
    c.rotate(-b.spin);
    c.strokeStyle = 'rgba(30,20,10,.75)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    c.restore();
  }

  /* ------------------------------------------------------------ the frame */
  const SKY = { h: 0, g: null };
  function drawSky(c) {
    if (!SKY.g || SKY.h !== V.H) {
      SKY.h = V.H; const g = c.createLinearGradient(0, 0, 0, V.H);
      g.addColorStop(0, '#6da1c4'); g.addColorStop(0.32, '#a9c5d2'); g.addColorStop(0.55, '#f3d29b'); g.addColorStop(1, '#f6a566');
      SKY.g = g;
    }
    c.fillStyle = SKY.g; c.fillRect(0, 0, V.W, V.H);
    const y0 = syOf(0, ZW);
    const sx = V.W * 0.8 - (cam.x - V.homeX) * V.S * 0.04, sy = y0 - 8.4 * V.S;
    let g = c.createRadialGradient(sx, sy, 0, sx, sy, V.S * 9);
    g.addColorStop(0, 'rgba(255,248,214,.95)'); g.addColorStop(0.07, 'rgba(255,226,150,.8)'); g.addColorStop(0.3, 'rgba(255,196,120,.35)'); g.addColorStop(1, 'rgba(255,170,100,0)');
    c.fillStyle = g; c.fillRect(0, 0, V.W, V.H);
    // kites
    for (let i = 0; i < 3; i++) {
      const kx = V.W * (0.15 + i * 0.32) + sin(G.time * 0.4 + i * 2) * 30 - (cam.x - V.homeX) * V.S * 0.08, ky = y0 - (9 + i * 1.2) * V.S + sin(G.time * 0.6 + i) * 10;
      if (ky < -30 && V.portrait) continue;
      const ks = V.S * 0.32, col = ['#e23e57', '#f2b01e', '#2f80c9'][i];
      c.save(); c.translate(kx, ky); c.rotate(sin(G.time * 0.8 + i) * 0.25);
      c.fillStyle = col; c.beginPath(); c.moveTo(0, -ks); c.lineTo(ks * 0.7, 0); c.lineTo(0, ks * 1.1); c.lineTo(-ks * 0.7, 0); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -ks); c.lineTo(0, ks * 1.1); c.moveTo(-ks * 0.7, 0); c.lineTo(ks * 0.7, 0); c.stroke();
      c.strokeStyle = 'rgba(40,20,20,.55)'; c.beginPath(); c.moveTo(0, ks * 1.1); c.quadraticCurveTo(-ks * 0.5, ks * 3.2, ks * 0.4, ks * 5.5); c.stroke();
      c.restore();
    }
  }
  function drawSkyline(c) {
    const k = V.S / RS, cv = LAYERS.sky;
    const uc = (cam.x - X_MIN) * RS * 0.35 + 1100;
    const u0 = max(0, uc - V.halfW / k), u1 = min(cv.width, uc + V.halfW / k);
    const yb = syOf(0, ZW) + 0.6 * V.S - cam.yo * 0.35;
    const dx = V.halfW + (u0 - uc) * k;
    c.drawImage(cv, u0, 0, u1 - u0, cv.height, dx, yb - cv.height * k, (u1 - u0) * k, cv.height * k);
  }
  function blitWall(c, cv) {
    const k = V.S / RS, y0 = syOf(0, ZW);
    const u0 = max(0, (cam.x - V.halfW / V.S - X_MIN) * RS), u1 = min(cv.width, (cam.x + V.halfW / V.S - X_MIN) * RS);
    if (u1 <= u0) return;
    const dx = (X_MIN + u0 / RS - cam.x) * V.S + V.halfW;
    // vertical crop to what is visible
    const v0 = max(0, YB + (0 - y0) / k), v1 = min(cv.height, YB + (V.H - y0) / k);
    if (v1 <= v0) return;
    c.drawImage(cv, u0, v0, u1 - u0, v1 - v0, dx, y0 + (v0 - YB) * k, (u1 - u0) * k, (v1 - v0) * k);
  }
  function drawRoad(c) {
    const cv = LAYERS.road, k = V.S / RS, y0 = syOf(0, ZW);
    const u0 = max(0, (cam.x - V.halfW / V.S - X_MIN) * RS), u1 = min(cv.width, (cam.x + V.halfW / V.S - X_MIN) * RS);
    const dx = (X_MIN + u0 / RS - cam.x) * V.S + V.halfW;
    c.drawImage(cv, u0, 0, u1 - u0, cv.height, dx, y0, (u1 - u0) * k, cv.height * k);
    // potholes, cracks and loose stones of this innings
    for (let i = 0; i < G.patches.length; i++) {
      const p = G.patches[i], px = sxOf(p.x), py = syOf(0, p.z), w = p.w * V.S;
      if (px < -w || px > V.W + w) continue;
      if (p.kind === 'pot') {
        c.fillStyle = 'rgba(25,14,8,.7)'; c.beginPath(); c.ellipse(px, py, w * 0.52, w * 0.17, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(8,4,2,.8)'; c.beginPath(); c.ellipse(px + w * 0.04, py + w * 0.01, w * 0.38, w * 0.11, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,230,180,.35)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(px, py, w * 0.52, w * 0.17, 0, PI * 0.1, PI * 0.9); c.stroke();
      } else if (p.kind === 'crack') {
        c.strokeStyle = 'rgba(20,10,5,.8)'; c.lineWidth = 2.4; c.beginPath();
        let cx = px - w * 0.5, cy = py - 2; c.moveTo(cx, cy);
        for (let s = 0; s < 7; s++) { cx += w / 7; cy += sin(p.seed + s * 2.1) * 3.5; c.lineTo(cx, cy); }
        c.stroke();
        c.strokeStyle = 'rgba(255,230,180,.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px - w * 0.5, py - 4); c.lineTo(px + w * 0.5, py - 4 + sin(p.seed) * 2); c.stroke();
      } else {
        for (let s = 0; s < 9; s++) {
          const sx2 = px + (sin(p.seed + s * 1.7) * 0.5) * w, sy2 = py + sin(p.seed * 2 + s * 2.3) * w * 0.07;
          c.fillStyle = s % 2 ? 'rgba(90,70,55,.9)' : 'rgba(150,125,100,.9)'; c.beginPath(); c.ellipse(sx2, sy2, 2 + (s % 3), 1.5 + (s % 2), 0, 0, TAU); c.fill();
        }
      }
    }
  }
  function drawForeground(c) {
    const yn = syOf(0, -ZN);
    if (yn >= V.H) return;
    // kerb and the lit footpath along the near edge
    let g = c.createLinearGradient(0, yn, 0, V.H);
    g.addColorStop(0, '#6a5645'); g.addColorStop(0.12, '#8a7358'); g.addColorStop(0.35, '#5a4636'); g.addColorStop(1, '#2a1d17');
    c.fillStyle = g; c.fillRect(0, yn, V.W, V.H - yn);
    c.fillStyle = 'rgba(255,214,150,.35)'; c.fillRect(0, yn + 1, V.W, 3);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, yn + 4, V.W, 4);
    // speckle that scrolls with the world
    const off = cam.x * V.S * 1.2;
    c.fillStyle = 'rgba(255,225,170,.09)';
    for (let i = 0; i < 26; i++) { const x = ((i * 97.3 - off) % (V.W + 80) + (V.W + 80)) % (V.W + 80) - 40; c.fillRect(x, yn + 14 + (i * 37 % 60), 18 + (i % 4) * 8, 2); }
  }

  function drawLighting(c) {
    // warm light from the right, cool shade at the left, soft shafts and dust
    let g = c.createLinearGradient(V.W, 0, 0, V.H);
    g.addColorStop(0, 'rgba(255,196,110,.20)'); g.addColorStop(0.5, 'rgba(255,170,90,.04)'); g.addColorStop(1, 'rgba(60,20,60,.18)');
    c.fillStyle = g; c.fillRect(0, 0, V.W, V.H);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const x0 = V.W * (0.55 + i * 0.22) + sin(G.time * 0.15 + i) * 10;
      const gg = c.createLinearGradient(x0, 0, x0 - V.W * 0.4, V.H * 0.9);
      gg.addColorStop(0, 'rgba(255,214,140,.10)'); gg.addColorStop(1, 'rgba(255,214,140,0)');
      c.fillStyle = gg; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + V.W * 0.14, 0); c.lineTo(x0 - V.W * 0.28, V.H); c.lineTo(x0 - V.W * 0.46, V.H); c.closePath(); c.fill();
    }
    c.restore();
    // dust motes
    if (!arc.reducedMotion || true) {
      c.fillStyle = 'rgba(255,236,190,.55)';
      const n = arc.reducedMotion ? 14 : DUST.length;
      for (let i = 0; i < n; i++) {
        const d = DUST[i];
        const x = ((d.x * V.W * 1.3 + G.time * d.v * V.W * 0.25 - cam.x * V.S * 0.3) % (V.W * 1.3) + V.W * 1.3) % (V.W * 1.3) - V.W * 0.15;
        const y = (d.y * V.H * 0.8 + sin(G.time * 0.5 + d.p) * 10 + G.time * 3 * d.v * (arc.reducedMotion ? 0 : 1)) % (V.H * 0.8) + V.H * 0.05;
        c.globalAlpha = 0.3 + 0.35 * sin(G.time * 0.9 + d.p) * 0.5 + 0.2;
        c.beginPath(); c.arc(x, y, d.s, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    // vignette
    if (!V.vg || V.vgW !== V.W || V.vgH !== V.H) {
      V.vgW = V.W; V.vgH = V.H;
      V.vg = c.createRadialGradient(V.W / 2, V.H * 0.5, min(V.W, V.H) * 0.35, V.W / 2, V.H * 0.5, max(V.W, V.H) * 0.78);
      V.vg.addColorStop(0, 'rgba(20,8,12,0)'); V.vg.addColorStop(1, 'rgba(20,8,12,.42)');
    }
    c.fillStyle = V.vg; c.fillRect(0, 0, V.W, V.H);
  }

  function drawParticles(c) {
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i];
      if (!p.on) continue;
      const a = clamp(p.life / p.max, 0, 1), x = sxOf(p.x), y = syOf(p.h, p.z);
      if (p.kind === 0) { c.globalAlpha = a * 0.55; c.fillStyle = p.col; c.beginPath(); c.arc(x, y, p.size * (1.6 - a * 0.6), 0, TAU); c.fill(); }
      else if (p.kind === 1) { c.globalAlpha = a; c.fillStyle = p.col; c.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size); }
      else { c.globalAlpha = a; c.fillStyle = p.col; c.beginPath(); c.moveTo(x, y - p.size); c.lineTo(x + p.size * 0.8, y + p.size * 0.5); c.lineTo(x - p.size * 0.6, y + p.size * 0.4); c.closePath(); c.fill(); }
    }
    c.globalAlpha = 1;
  }

  function rrect(c, x, y, w, h, r) { roundRect(c, x, y, w, h, r); }
  function drawBubbles(c) {
    const fs = V.portrait ? 12.5 : 14;
    c.font = '600 ' + fs + 'px ' + FONT_UI; c.textBaseline = 'middle'; c.textAlign = 'center';
    for (let i = 0; i < BUBBLES.length; i++) {
      const b = BUBBLES[i];
      if (!b.lines) {
        const maxW = Math.min(V.W * 0.62, 230);
        const words = b.text.split(' '); let cur = '', lines = [];
        words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
        lines.push(cur); b.lines = lines; b.w = Math.max.apply(null, lines.map((l) => c.measureText(l).width)) + 18;
      }
      const a = b.t < 0.12 ? b.t / 0.12 : b.t > b.life - 0.28 ? (b.life - b.t) / 0.28 : 1;
      const lh = fs * 1.25, bh = b.lines.length * lh + 10;
      let x = sxOf(b.x), y = syOf(b.h + b.t * 0.08, b.z) - bh - 10;
      const bx = clamp(x - b.w / 2, 6, V.W - b.w - 6), by = clamp(y, 6, V.H - bh - 6);
      c.globalAlpha = a;
      c.fillStyle = b.aunty ? '#ffe8f0' : '#FBF5EC'; c.strokeStyle = '#1A1814'; c.lineWidth = 1.6;
      rrect(c, bx, by, b.w, bh, 9); c.fill(); c.stroke();
      const tx = clamp(x, bx + 12, bx + b.w - 12);
      c.beginPath(); c.moveTo(tx - 6, by + bh - 0.5); c.lineTo(tx, by + bh + 8); c.lineTo(tx + 6, by + bh - 0.5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(tx - 6, by + bh); c.lineTo(tx, by + bh + 8); c.lineTo(tx + 6, by + bh); c.stroke();
      c.fillStyle = '#FBF5EC'; c.fillRect(tx - 5, by + bh - 2, 10, 3);
      c.fillStyle = '#1A1814';
      b.lines.forEach((l, k) => c.fillText(l, bx + b.w / 2, by + 5 + lh * (k + 0.5) + 1));
    }
    c.globalAlpha = 1;
  }
  function drawPops(c) {
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (let i = 0; i < POPS.length; i++) {
      const p = POPS[i], a = p.t < 0.1 ? p.t / 0.1 : clamp((p.life - p.t) / 0.3, 0, 1);
      const x = sxOf(p.x), y = syOf(p.h + p.t * 0.9, p.z);
      c.globalAlpha = a; c.font = '700 ' + max(12, p.size) + 'px ' + FONT_MONO;
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(15,13,10,.85)'; c.strokeText(p.text, x, y);
      c.fillStyle = p.col; c.fillText(p.text, x, y);
    }
    c.globalAlpha = 1;
  }

  function plate(c, x, y, w, h) {
    c.fillStyle = 'rgba(15,13,10,.74)'; rrect(c, x, y, w, h, 10); c.fill();
    c.strokeStyle = 'rgba(251,245,236,.16)'; c.lineWidth = 1; rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, 10); c.stroke();
  }
  function drawHUD(c) {
    if (G.phase === 'attract') return;
    const p = V.portrait, pad = 10, sm = p ? 11.5 : 12;
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    // left plate: runs / outs
    const lw = p ? 128 : 168, lh = p ? 58 : 66;
    plate(c, pad, pad, lw, lh);
    c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.fillText('RUNS / OUT', pad + 12, pad + 19);
    c.fillStyle = '#FBF5EC'; c.font = '500 ' + (p ? 32 : 38) + 'px ' + FONT_SERIF; c.fillText(G.runs + '/' + G.outs, pad + 12, pad + (p ? 50 : 56));
    // balls and overs, to the right of the score
    const ov = floor(G.balls / 6) + '.' + (G.balls % 6);
    c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.textAlign = 'right';
    c.fillText('BALLS ' + G.balls, pad + lw - 12, pad + (p ? 34 : 38));
    c.fillText('OV ' + ov, pad + lw - 12, pad + (p ? 50 : 56));
    c.textAlign = 'left';
    // outs as three little stumps
    for (let i = 0; i < G.maxOuts; i++) {
      const sx = pad + 8 + i * 15, sy = pad + lh + 8;
      c.fillStyle = i < G.outs ? 'rgba(255,77,31,.9)' : 'rgba(251,245,236,.28)';
      rrect(c, sx, sy, 11, 15, 3); c.fill();
      c.fillStyle = 'rgba(15,13,10,.8)'; c.fillRect(sx + 3, sy + 4, 1.6, 8); c.fillRect(sx + 6.4, sy + 4, 1.6, 8);
    }
    c.fillStyle = 'rgba(251,245,236,.85)'; c.font = '600 ' + sm + 'px ' + FONT_UI;
    const bn = BATTERS[min(2, G.outs)] + (G.outs >= 2 ? ' (last man)' : '');
    if (!p || V.W > 360) c.fillText(bn, pad + 8 + G.maxOuts * 15 + 4, pad + lh + 20);
    // right plate
    const rw = p ? 150 : 214;
    if (G.mode !== 'last' && G.phase !== 'over') {
      const need = G.target - G.runs, left = G.ballLimit - G.balls;
      const rh = p ? 58 : 66;
      plate(c, V.W - rw - pad, pad, rw, rh);
      c.textAlign = 'left';
      c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.fillText(G.mode === 'sunday' ? 'MATCH ' + (G.matchIx + 1) + '/3 TARGET' : 'TARGET', V.W - rw - pad + 12, pad + 19);
      c.fillStyle = '#FFB736'; c.font = '500 ' + (p ? 28 : 34) + 'px ' + FONT_SERIF; c.fillText(String(G.target), V.W - rw - pad + 12, pad + (p ? 48 : 54));
      c.textAlign = 'right'; c.fillStyle = '#FBF5EC'; c.font = '600 ' + (p ? 13 : 14) + 'px ' + FONT_UI;
      c.fillText(need > 0 ? 'Need ' + need : 'Chased!', V.W - pad - 12, pad + (p ? 38 : 42));
      c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.fillText(left + ' ball' + (left === 1 ? '' : 's') + ' left', V.W - pad - 12, pad + (p ? 53 : 58));
      c.textAlign = 'left';
      if (!p) { c.fillStyle = 'rgba(251,245,236,.8)'; c.font = '600 ' + sm + 'px ' + FONT_UI; c.textAlign = 'right'; c.fillText('vs ' + dispName(), V.W - pad - 4, pad + rh + 18); c.textAlign = 'left'; }
    } else if (G.mode === 'last') {
      const rh = p ? 46 : 52;
      plate(c, V.W - 118 - pad, pad, 118, rh);
      const best = arc.best();
      c.fillStyle = '#A39E94'; c.font = '500 ' + sm + 'px ' + FONT_MONO; c.textAlign = 'left'; c.fillText('YOUR BEST', V.W - 118 - pad + 12, pad + 19);
      c.fillStyle = '#FFB736'; c.font = '500 ' + (p ? 24 : 28) + 'px ' + FONT_SERIF; c.fillText(best == null ? '-' : String(max(best, G.runs)), V.W - 118 - pad + 12, pad + (p ? 41 : 46));
    }
    // trial chip
    if (G.trial && (G.phase === 'intro' || G.phase === 'ready' || G.phase === 'runup' || G.phase === 'flight' || G.phase === 'live')) {
      const t = 'TRIAL BALL: DOES NOT COUNT';
      c.font = '600 ' + sm + 'px ' + FONT_MONO; const w = c.measureText(t).width + 22;
      const y = p ? pad + 100 : pad + 6;
      plate(c, V.W / 2 - w / 2, p ? pad + 84 : y, w, 26);
      c.fillStyle = '#FFE9B0'; c.textAlign = 'center'; c.fillText(t, V.W / 2, (p ? pad + 84 : y) + 17); c.textAlign = 'left';
    }
  }

  function drawInterlude(c) {
    if (G.phase !== 'interlude') return;
    const w = min(V.W - 28, 420), h = 200, x = (V.W - w) / 2, y = (V.H - h) / 2 - 20;
    c.fillStyle = 'rgba(6,5,3,.66)'; c.fillRect(0, 0, V.W, V.H);
    c.fillStyle = '#1A1814'; rrect(c, x, y, w, h, 16); c.fill();
    c.strokeStyle = '#3D3830'; c.lineWidth = 1; rrect(c, x + 0.5, y + 0.5, w - 1, h - 1, 16); c.stroke();
    const I = G.interlude;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#c9a96e'; c.font = '500 12px ' + FONT_MONO; c.fillText('MATCH ' + (G.matchIx + 1) + ' WON', V.W / 2, y + 34);
    c.fillStyle = '#FBF5EC'; c.font = '400 ' + (w < 360 ? 24 : 30) + 'px ' + FONT_SERIF; c.fillText(I.rec.name + ' beaten', V.W / 2, y + 74);
    c.fillStyle = '#A39E94'; c.font = '400 15px ' + FONT_UI; c.fillText(I.rec.runs + ' chased ' + I.rec.target + ', bonus ' + I.rec.bonus, V.W / 2, y + 104);
    c.fillStyle = '#FBF5EC'; c.font = '600 15px ' + FONT_UI; c.fillText('Next: ' + I.next.name, V.W / 2, y + 134);
    const blink = floor(G.time * 2) % 2 === 0;
    c.fillStyle = blink ? '#FF6940' : '#c9a96e'; c.font = '600 13px ' + FONT_MONO; c.fillText(arc.touchMode ? 'TAP TO PLAY ON' : 'PRESS SPACE OR TAP', V.W / 2, y + 174);
    c.textAlign = 'left';
  }

  function drawEntities(c) {
    const S = V.S, y = G.yield || 0;
    // shadows first
    const list = ENTS; let n = 0;
    const zOf = (z) => z + y * (1.3 - z);
    // batter
    const batZ = zOf(BAT.z);
    list[n++] = { z: batZ, k: 0 };
    for (let i = 0; i < FIELDERS.length; i++) list[n++] = { z: zOf(FIELDERS[i].z), k: 1, f: FIELDERS[i] };
    list[n++] = { z: 0.02, k: 2 };
    if (DOG.active) list[n++] = { z: DOG.z, k: 3 };
    if (AUTO.state === 'pass') list[n++] = { z: -1.45, k: 4 };
    list.length = n;
    list.sort((a, b) => b.z - a.z);
    // batter pose
    const sw = SW, b = BALL;
    const batPose = batterPose();
    // shadows
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.k === 0) kidShadow(c, sxOf(BAT.x), syOf(0, e.z), S, { face: 1, wk: BAT.run * (BAT.state === 'run' ? 1 : 0), ph: BAT.phase, scale: 1 });
      else if (e.k === 1) kidShadow(c, sxOf(e.f.x), syOf(0, e.z), S, { face: e.f.face, wk: e.f.walk, ph: e.f.phase, scale: 0.97 });
    }
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.k === 0) {
        const run = BAT.state === 'run' || (BAT.run > 0.4 && (G.phase === 'dead' || G.phase === 'ready'));
        const o = {
          face: BAT.face, wk: run ? 1 : 0, ph: BAT.phase, crouch: run ? 0.1 : 0.2, lean: run ? 1.2 : batPose.lean, style: BAT.style, scale: 1,
          hands: [[batPose.hx, batPose.hy], [batPose.hx - 0.05, batPose.hy - 0.03]], bat: batPose, bob: sin(G.time * 2.4) * 0.006,
        };
        if (run) { o.hands = [[0.3, 0.5], [0.27, 0.46]]; o.bat = { hx: 0.3, hy: 0.5, ang: -1.0 }; }
        drawKid(c, sxOf(BAT.x), syOf(0, e.z), S, o);
      } else if (e.k === 1) {
        const f = e.f, o = { face: f.face, wk: f.walk, ph: f.phase, crouch: 0.0, lean: f.walk * 0.7, style: f.style, scale: f.role === 'bowler' ? 1.0 : 0.97, up: 0, bob: sin(G.time * 2 + f.id) * 0.005 };
        if (f.armUp > 0) { o.up = 1; o.hands = [[0.25, 1.45], [0.18, 1.38]]; if (f.id % 2) o.hands = [[0.28, 1.4], [-0.1, 0.7]]; }
        else if (f.dive > 0) { f.dive -= 0.016; o.crouch = 0.8; o.lean = 1.4; }
        if (f.role === 'bowler') {
          const run = G.phase === 'runup';
          if (run) {
            const th = PI + (BOWLER.arm - 1) * TAU * 0.95;
            o.wk = 1; o.lean = 0.6; o.ph = BOWLER.phase;
            o.hands = [[0.0 + sin(th) * 0.44, 1.0 - cos(th) * 0.44 + 0.0], [0.2, 0.9]];
            o.hands[0][1] = 1.0 - cos(th) * 0.44 + 0.1;
          } else if (G.phase === 'flight') {
            const fo = sstep(0, 0.5, G.t), th = lerp(PI, 0.5, fo);
            o.lean = 1.3 * (1 - fo) + 0.3; o.hands = [[sin(th) * 0.44, 1.0 - cos(th) * 0.44 + 0.1], [0.2, 0.7]];
          }
        }
        drawKid(c, sxOf(f.x), syOf(0, e.z), S, o);
      } else if (e.k === 2) drawCrate(c);
      else if (e.k === 3) drawDog(c);
      else if (e.k === 4) drawAuto(c);
    }
    drawBallObj(c);
  }
  const ENTS = [];

  function batterPose() {
    const sw = SW, b = BALL, kind = sw.kind;
    const stance = { hx: 0.28, hy: 0.56, ang: -1.4, lean: 0.3 };
    const back = { hx: -0.1, hy: 1.02, ang: 2.35, lean: 0.0 };
    const contactK = [{ hx: 0.55, hy: 0.55, ang: -0.95 }, { hx: 0.55, hy: 0.78, ang: -0.45 }, { hx: 0.55, hy: 0.92, ang: -0.1 }][kind];
    const followK = [{ hx: 0.62, hy: 0.55, ang: -0.2 }, { hx: 0.45, hy: 1.0, ang: 0.9 }, { hx: 0.22, hy: 1.45, ang: 1.9 }][kind];
    const mixp = (a, b2, t) => ({ hx: lerp(a.hx, b2.hx, t), hy: lerp(a.hy, b2.hy, t), ang: lerp(a.ang, b2.ang, t), lean: lerp(a.lean == null ? 0.5 : a.lean, b2.lean == null ? 0.7 : b2.lean, t) });
    if (sw.on) {
      const p = clamp(sw.t / sw.dur, 0, 1);
      if (p < 0.5) return mixp(back, contactK, sstep(0, 0.5, p));
      return mixp(contactK, followK, sstep(0.5, 1, p));
    }
    if (sw.after > 0) return mixp(stance, followK, sstep(0, 0.22, sw.after));
    // gentle backlift as the ball comes in
    if (G.phase === 'flight' && !b.batted && b.x < 5.2 && b.x > 1) return mixp(stance, back, 0.3 * (1 - (b.x - 1) / 4.2));
    if (G.phase === 'runup') return mixp(stance, back, 0.12);
    return stance;
  }

  function render(c, a) {
    arc = a;
    if (V.W !== a.w || V.H !== a.h || !V.S || V.sig !== a.w + 'x' + a.h) { computeView(); V.sig = a.w + 'x' + a.h; }
    ensureLayers();
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'medium';
    drawSky(c);
    c.save();
    const sh = arc.reducedMotion ? 0 : cam.shake;
    if (sh > 0) c.translate((rnd() - 0.5) * sh * 14, (rnd() - 0.5) * sh * 14);
    drawSkyline(c);
    blitWall(c, LAYERS.back);
    drawWallDynamic(c);
    drawRoad(c);
    blitWall(c, LAYERS.front);
    drawBirds(c);
    drawEntities(c);
    drawParticles(c);
    drawForeground(c);
    c.restore();
    drawLighting(c);
    drawBubbles(c);
    drawPops(c);
    drawHUD(c);
    drawInterlude(c);
  }

  /* ------------------------------------------------------------ shell wiring */
  const TEST = { kind: null };
  const RULES = [
    ['Trial ball', 'The first ball of every innings is a trial. It does not count.'],
    ['One tip, one hand', 'Caught one-handed after a single bounce is out.'],
    ['Glass', 'Hit a window and you are out. The ball is lost, and the aunty is not happy.'],
    ['Roof', 'Straight over the roof is six, and out.'],
    ['Gate and wall', 'Along the ground to the far gate is four. Full on the end wall is two.'],
    ['Running', 'Runs are between the crate and the chalk line. No LBW. The last man bats on.'],
  ];
  const rulesHtml = () =>
    '<ul style="margin:0 0 14px;padding:0;list-style:none;display:grid;gap:5px;font-size:13.5px;line-height:1.4;color:var(--ink-dim)">' +
    RULES.map((r) => '<li><b style="color:var(--ink);font-weight:600">' + r[0] + '.</b> ' + r[1] + '</li>').join('') + '</ul>';

  function resetScene() {
    G.D = DIFF[G.diff] || DIFF.serious;
    WIN.forEach((w) => { w.broken = false; });
    CRATE.tip = 0; CRATE.fall = false;
    BAT.x = BAT_X; BAT.state = 'idle'; BAT.lastEnd = 0;
    SW.on = false; SW.cd = 0; SW.after = 0;
    BALL.state = 'none'; BALL.hidden = true;
    FIELDERS.forEach((f, i) => { f.x = f.x0; f.goal = f.x0; f.hasBall = false; f.tried = false; f.walk = 0; f.armUp = 0; f.speed = (f.role === 'bowler' ? 3.6 : G.D.fieldSpeed) * (0.92 + (i * 0.037) % 0.16); });
    BOWLER.x = BOWL_X + 3;
    BUBBLES.length = 0; POPS.length = 0;
    if (!G.patches.length) newPatches();
  }

  function menuShow(a) {
    a.menu({
      eyebrow: 'Gully cricket',
      title: 'Gully <em>Champs</em>',
      html:
        '<p>A summer afternoon, a narrow lane, and a taped tennis ball. The bowler runs in from the right. Press <b>Bat</b> as the ball reaches you, hold <b>Up</b> to loft it or <b>Down</b> to keep it on the ground, and tap <b>Run</b> to dash between the crate and the chalk line.</p>' +
        '<div class="eyebrow" style="margin:2px 0 8px">House rules</div>' + rulesHtml() +
        '<p style="font-size:14px"><b style="color:var(--ink)">Last Man Standing</b>: three outs, score as much as you can. <b style="color:var(--ink)">Chase the Colony</b>: beat the rival lane\'s target in three overs. <b style="color:var(--ink)">Super Sunday</b>: three chases against three lanes, getting harder.</p>',
      options: [
        { id: 'mode', label: 'Mode', value: 'last', choices: [{ v: 'last', label: 'Last Man Standing' }, { v: 'chase', label: 'Chase the Colony' }, { v: 'sunday', label: 'Super Sunday' }] },
        { id: 'diff', label: 'Difficulty', value: 'serious', choices: [{ v: 'chill', label: 'Chill' }, { v: 'serious', label: 'Serious' }, { v: 'legend', label: 'Gully Legend' }] },
      ],
      showKeys: !a.touchMode,
    });
  }

  function dbg() {
    const b = BALL;
    return {
      mode: G.mode, diff: G.diff, phase: G.phase, runs: G.runs, outs: G.outs, balls: G.balls, target: G.target, ballLimit: G.ballLimit,
      lastOutcome: G.lastOutcome, delivery: G.lastDelivery, trial: G.trial, shotLabel: G.shotLabel, rival: G.rival, matchIx: G.matchIx,
      ballPos: [+b.x.toFixed(2), +b.h.toFixed(2), +b.z.toFixed(2)], ballState: b.state, ballBatted: b.batted, bounces: b.bounces,
      auto: G.flags.auto, dog: G.flags.dog, aunty: G.flags.aunty, autoCount: G.flags.autoCount || 0,
      batter: { x: +BAT.x.toFixed(2), state: BAT.state }, swing: SW.on, cam: [+cam.x.toFixed(2), +cam.yo.toFixed(1)],
      brokenWindows: WIN.filter((w) => w.broken).length, totalScore: G.totalScore, results: G.results,
    };
  }

  A.create({
    slug: 'gully-champs',
    title: 'Gully Champs',
    genre: 'Gully cricket',
    hint: 'Space = bat    Up = loft    Down = ground    R = run',
    keys: [
      ['Space / tap', 'Bat: time it as the ball reaches you'],
      ['Up / W (hold)', 'Loft the shot'],
      ['Down / S (hold)', 'Keep it on the ground'],
      ['Left, Right / A, D', 'Placement bias: behind, or to the front'],
      ['R', 'Run between the crate and the chalk line'],
    ],
    touch: { stick: true, pads: [{ label: 'Bat', key: 'Space', big: true, hot: true }, { label: 'Run', key: 'KeyR' }, { label: 'Loft', key: 'ArrowUp' }] },
    gameKeys: ['KeyR'],
    formatScore: (v) => String(v),
    resize(a) { arc = a; computeView(); V.sig = a.w + 'x' + a.h; },
    init(a) {
      arc = a; computeView(); resetScene();
      a.debug = dbg;
      window.__gully = { G, BALL, BAT, SW, FIELDERS, AUNTY, DOG, AUTO, CRATE, WIN, TEST, cam, V, startAuto, startAuntyScold: () => { AUNTY.state = 'scold'; AUNTY.t = 0; }, scareBirds };
      G.autoTimer = rr(22, 34); G.dogTimer = rr(6, 12); G.auntyTimer = rr(4, 9);
      cam.x = V.homeX + 5;
      menuShow(a);
    },
    onMenu(a) {
      G.phase = 'attract'; G.runs = 0; G.outs = 0; G.balls = 0; G.target = 0; G.mode = a.choices.mode || 'last';
      resetScene();
    },
    start(a, ch) {
      arc = a;
      G.mode = ch.mode || 'last'; G.diff = ch.diff || 'serious'; G.D = DIFF[G.diff];
      G.matchIx = 0; G.results = []; G.totalScore = 0; G.flags.autoCount = 0;
      resetScene();
      AUTO.state = 'none'; DOG.active = false; DOG.carry = false; AUNTY.state = 'hidden'; AUNTY.up = 0;
      G.autoTimer = rr(24, 36); G.dogTimer = rr(8, 16); G.auntyTimer = rr(5, 10);
      G.yield = 0;
      newMatch();
    },
    update,
    idle,
    render,
    pauseHtml() { return '<div class="eyebrow" style="margin:2px 0 8px">House rules</div>' + rulesHtml(); },
  });
})();
