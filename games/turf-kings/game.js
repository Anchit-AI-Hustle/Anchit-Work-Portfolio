/*
 * Turf Kings: arcade five-a-side football on a floodlit rooftop cage pitch.
 *
 * Everything is original and drawn in code. The pitch is pre-rendered once to an
 * offscreen bitmap; players, ball, goals and effects are drawn live on top
 * through a tilted, ball-following camera. Rules live in one small simulation
 * (phases: kickoff, play, goal, foul, halftime, fulltime, penalties).
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ constants */
  const HL = 500, HW = 280;            // half length, half width of the playing area (world units)
  const GH = 70, GOAL_H = 56, GD = 38; // goal half mouth, crossbar height, net depth
  const PR = 13, BR = 6.5;             // player and ball radius
  const GRAV = 900, ROOF = 168, CORNER = 46;
  const TILT = 0.76, ZK = 0.95;        // vertical squash of the camera, height lift
  const BX0 = -620, BY0 = -390, BW = 1240, BH = 780, PPU = 2; // pitch bitmap (world rect + pixels per unit)
  const FR_C = 58, FR_K = 0.82;        // rolling friction: dv/dt = -(C + K v)
  const PI = Math.PI, TAU = PI * 2;
  const hyp = Math.hypot, abs = Math.abs;
  const F_MONO = '"JetBrains Mono", ui-monospace, monospace';
  const F_UI = 'Inter, system-ui, sans-serif';
  const F_DISP = 'Fraunces, "Times New Roman", serif';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sgn = (v) => (v < 0 ? -1 : 1);
  const rnd = Math.random;
  const pick = (a) => a[(rnd() * a.length) | 0];
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (r, g, b) => '#' + ((1 << 24) + (clamp(r | 0, 0, 255) << 16) + (clamp(g | 0, 0, 255) << 8) + clamp(b | 0, 0, 255)).toString(16).slice(1);
  const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)); };
  const colDist = (a, b) => { const x = hex2rgb(a), y = hex2rgb(b); return hyp(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const rrPath = (g, x, y, w, h, r, keep) => {
    r = Math.min(r, w / 2, h / 2);
    if (!keep) g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };

  /* ------------------------------------------------------------------ the league (all invented) */
  const TEAMS = [
    { name: 'Bandra Blazers', short: 'Blazers', abbr: 'BLZ', c1: '#ff7a1a', c2: '#fff1d6', shorts: '#1c1a1f', sock: '#ff7a1a',
      alt: { c1: '#f6f1e7', c2: '#ff7a1a', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['A. Dastur', 'K. Menon', 'R. Sethi', 'V. Kamat', 'I. Bhosale'] },
    { name: 'Salt Lake Strikers', short: 'Strikers', abbr: 'SLS', c1: '#2f6bff', c2: '#ffffff', shorts: '#14327a', sock: '#2f6bff',
      alt: { c1: '#f6f1e7', c2: '#2f6bff', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['S. Haldar', 'T. Mondal', 'P. Sarkar', 'D. Bagchi', 'N. Lahiri'] },
    { name: 'Koramangala Kites', short: 'Kites', abbr: 'KOR', c1: '#1fb36b', c2: '#ffe14a', shorts: '#0e5a38', sock: '#ffe14a',
      alt: { c1: '#f6f1e7', c2: '#1fb36b', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['M. Gowda', 'H. Shetty', 'C. Rangan', 'B. Nayak', 'J. Urs'] },
    { name: 'Powai Panthers', short: 'Panthers', abbr: 'POW', c1: '#7b3fe4', c2: '#e9dcff', shorts: '#26134d', sock: '#7b3fe4',
      alt: { c1: '#f6f1e7', c2: '#7b3fe4', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['F. Joglekar', 'Y. Parab', 'O. Gaikwad', 'L. Tendle', 'E. Salvi'] },
    { name: 'Marina Mariners', short: 'Mariners', abbr: 'MAR', c1: '#12b5c6', c2: '#ffffff', shorts: '#0b4a55', sock: '#ffffff',
      alt: { c1: '#f6f1e7', c2: '#12b5c6', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['G. Pillai', 'W. Varkey', 'Z. Nambiar', 'U. Cheriyan', 'X. Kurup'] },
    { name: 'Hauz Khas Hawks', short: 'Hawks', abbr: 'HKH', c1: '#e23a43', c2: '#1b1b1f', shorts: '#1b1b1f', sock: '#e23a43',
      alt: { c1: '#f6f1e7', c2: '#e23a43', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['B. Khanna', 'L. Anand', 'H. Bakshi', 'P. Suri', 'Q. Dhillon'] },
    { name: 'Park Street Pilots', short: 'Pilots', abbr: 'PSP', c1: '#f4c21d', c2: '#2b2b2b', shorts: '#2b2b2b', sock: '#f4c21d',
      alt: { c1: '#2b2b2b', c2: '#f4c21d', shorts: '#2b2b2b', sock: '#2b2b2b' }, names: ['O. Ghosh', 'R. Dutta', 'E. Sen', 'M. Biswas', 'C. Roy'] },
    { name: 'Charminar Chargers', short: 'Chargers', abbr: 'CHM', c1: '#9c2347', c2: '#ffd8e2', shorts: '#4d1022', sock: '#9c2347',
      alt: { c1: '#f6f1e7', c2: '#9c2347', shorts: '#f6f1e7', sock: '#f6f1e7' }, names: ['D. Reddy', 'V. Naidu', 'K. Goud', 'S. Rao', 'A. Yadav'] },
  ];
  const ROLES = ['GK', 'DEF', 'WL', 'WR', 'ATT'];
  const NUMS = [1, 4, 7, 11, 9];
  const FORM = { GK: [-0.93, 0], DEF: [-0.5, 0], WL: [-0.1, -0.5], WR: [-0.1, 0.5], ATT: [0.28, 0] };
  const SKINS = ['#f0c8a0', '#d9a073', '#b9784b', '#8d5530', '#6b3d22'];
  const HAIRS = ['#1a1410', '#2b1c12', '#3d2a1a', '#0e0e10', '#4a3322'];
  const STAGES = ['Quarter-final', 'Semi-final', 'Final'];
  const GK_COLS = ['#c8ff3a', '#ff5fa8', '#8ae6ff', '#f4f4f4', '#ffb15e'];

  /* ------------------------------------------------------------------ module state */
  let arc = null;
  let S = null;          // current match (or attract-mode demo)
  let CUP = null;        // cup run
  let BMP = null;        // pitch bitmap
  let lastRenderT = 0;
  let layoutKey = '';
  let PX = 0, PY = 0;
  const TMP = { x: 0, y: 0 };
  const AA = { x: 0, y: 0 };
  const V = { portrait: false, f: 1 };
  const CAM = { u: 0, v: 0, s: 1, base: 1, zm: 1, ox: 0, oy: 0, snap: true };

  /* ------------------------------------------------------------------ projection */
  const uOf = (x, y) => (V.portrait ? V.f * y : V.f * x);
  const vOf = (x, y) => (V.portrait ? -V.f * x : V.f * y);
  function P(x, y, z) {
    const u = V.portrait ? V.f * y : V.f * x, v = V.portrait ? -V.f * x : V.f * y;
    PX = (u - CAM.u) * CAM.s + CAM.ox;
    PY = (v - CAM.v) * CAM.s * TILT + CAM.oy - (z || 0) * CAM.s * ZK;
  }
  function uvToWorld(du, dv, out) {
    if (V.portrait) { out.x = -V.f * dv; out.y = V.f * du; } else { out.x = V.f * du; out.y = V.f * dv; }
  }

  /* ------------------------------------------------------------------ audio helpers (silent in attract mode) */
  const snd = {
    kick(p) { if (S.demo) return; arc.sfx.tone(150 + 70 * p, 0.09, { type: 'triangle', slide: 70, vol: 0.2 + 0.14 * p }); arc.sfx.noise(0.05, { freq: 2200, vol: 0.1 + 0.1 * p }); },
    pass() { if (S.demo) return; arc.sfx.tone(210, 0.07, { type: 'triangle', slide: 120, vol: 0.14 }); arc.sfx.noise(0.04, { freq: 1500, vol: 0.07 }); },
    wall(sp) { if (S.demo || S.sfxWall > 0 || sp < 110) return; S.sfxWall = 0.07; arc.sfx.noise(0.07, { freq: 900, filter: 'bandpass', vol: clamp(sp / 1400, 0.04, 0.2) }); arc.sfx.tone(260, 0.05, { type: 'square', slide: 140, vol: clamp(sp / 4000, 0.02, 0.06) }); },
    post() { if (S.demo) return; arc.sfx.tone(880, 0.5, { type: 'triangle', slide: 700, vol: 0.2 }); arc.sfx.tone(1320, 0.3, { type: 'sine', vol: 0.08 }); },
    net() { if (S.demo) return; arc.sfx.noise(0.5, { freq: 700, vol: 0.2 }); },
    whistle(long) { if (S.demo) return; const d = long ? 0.8 : 0.3; arc.sfx.tone(2250, d, { type: 'sine', vol: 0.16 }); arc.sfx.tone(2330, d, { type: 'sine', vol: 0.1, delay: 0.02 }); },
    roar(big) { if (S.demo) return; arc.sfx.noise(big ? 2.6 : 1.2, { freq: 800, filter: 'bandpass', vol: big ? 0.42 : 0.2 }); arc.sfx.noise(big ? 2 : 0.9, { freq: 420, vol: big ? 0.3 : 0.12 }); if (big) arc.sfx.tone(440, 0.9, { type: 'sawtooth', slide: 520, vol: 0.05 }); },
    ooh() { if (S.demo) return; arc.sfx.noise(0.8, { freq: 600, filter: 'bandpass', vol: 0.18 }); arc.sfx.tone(300, 0.6, { type: 'sine', slide: 520, vol: 0.05 }); },
    save() { if (S.demo) return; arc.sfx.noise(0.12, { freq: 500, vol: 0.2 }); arc.sfx.tone(180, 0.1, { type: 'square', slide: 90, vol: 0.1 }); },
    tackle() { if (S.demo) return; arc.sfx.noise(0.08, { freq: 700, vol: 0.18 }); arc.sfx.tone(120, 0.08, { type: 'triangle', vol: 0.14 }); },
    bounce(i) { if (S.demo) return; arc.sfx.tone(130, 0.05, { type: 'sine', slide: 90, vol: clamp(i / 1600, 0.03, 0.12) }); },
    beep(hi) { if (S.demo) return; arc.sfx.tone(hi ? 880 : 520, 0.12, { type: 'square', vol: 0.1 }); },
  };

  /* ------------------------------------------------------------------ commentary (original lines) */
  const LINES = {
    shot: ['Off it goes!', 'He lets fly!', 'Strike from distance!', 'Hit it first time!', 'Bold effort!'],
    save: ['Smart stop!', 'The keeper stands tall!', 'What a save!', 'Hands like a vice!', 'Denied!'],
    post: ['Off the woodwork!', 'Clang! Inches away!', 'The post shakes!'],
    wall: ['Cage ricochet!', 'Off the boards!', 'Wall pass of sorts!'],
    tackle: ['Cleanly won!', 'Great timing!', 'Ball nicked away!', 'Strong challenge!'],
    slide: ['Slides in and wins it!', 'Clean slide!'],
    goal: ['Clinical finish!', 'The net bulges!', 'Pigeons scatter on the roof!', 'Scenes under the floodlights!', 'Pure class!'],
    og: ['Oh no, that went in off him!', 'An own goal, cruel luck!'],
    kickoff: ['Floodlights on, ball rolling.', 'We are underway!', 'Kick-off on the rooftop!'],
    final: ['Thirty seconds left. Everything on the line!', 'Last half minute, the cage is roaring!'],
    out: ['Wide of the mark.', 'Over the bar!', 'Not this time.'],
  };
  function say(text, life) {
    if (!S || S.demo) return;
    S.say = { text, age: 0, life: life || 2.4 };
  }
  function sayRare(kind, force) {
    if (!S || S.demo) return;
    if (S.sayCD > 0 && !force) return;
    S.sayCD = 2.6;
    say(pick(LINES[kind]));
  }

  /* ------------------------------------------------------------------ pitch art (pre-rendered once) */
  function buildPitch() {
    const cv = document.createElement('canvas');
    cv.width = BW * PPU; cv.height = BH * PPU;
    const g = cv.getContext('2d');
    g.scale(PPU, PPU); g.translate(-BX0, -BY0);
    const R = Arcade.rng(2027);
    const rr = (a, b) => a + (b - a) * R();

    // 1. the city far below the roof
    g.fillStyle = '#17110a'; g.fillRect(BX0, BY0, BW, BH);
    const roofCols = ['#0c1320', '#111a2b', '#0a0f19', '#16223a', '#1b2a47', '#10192a', '#241a2e'];
    for (let gx = BX0 - 10; gx < BX0 + BW; gx += 66) {
      for (let gy = BY0 - 10; gy < BY0 + BH; gy += 66) {
        const w = rr(46, 58), h = rr(46, 58), ox = rr(0, 8), oy = rr(0, 8);
        g.fillStyle = roofCols[(R() * roofCols.length) | 0]; g.fillRect(gx + ox, gy + oy, w, h);
        g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(gx + ox, gy + oy, w, 2);
        if (R() < 0.5) { g.fillStyle = 'rgba(160,190,230,.13)'; g.fillRect(gx + ox + rr(4, 20), gy + oy + rr(4, 20), rr(8, 16), rr(6, 12)); }
        if (R() < 0.18) { g.fillStyle = R() < 0.5 ? 'rgba(255,170,90,.55)' : 'rgba(90,220,255,.5)'; g.fillRect(gx + ox + rr(2, 30), gy + oy + rr(2, 30), rr(6, 14), rr(3, 6)); }
      }
    }
    for (let i = 0; i < 900; i++) { // street lamps, windows, cars
      const x = rr(BX0, BX0 + BW), y = rr(BY0, BY0 + BH), k = R();
      g.fillStyle = k < 0.55 ? 'rgba(255,196,120,.85)' : k < 0.8 ? 'rgba(255,240,210,.8)' : k < 0.92 ? 'rgba(255,70,60,.8)' : 'rgba(120,220,255,.8)';
      g.fillRect(x, y, 1.6, 1.6);
    }
    for (let i = 0; i < 40; i++) {
      const x = rr(BX0, BX0 + BW), y = rr(BY0, BY0 + BH);
      const gr = g.createRadialGradient(x, y, 0, x, y, 22);
      gr.addColorStop(0, R() < 0.5 ? 'rgba(255,190,110,.35)' : 'rgba(110,210,255,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - 22, y - 22, 44, 44);
    }

    // 2. the roof slab with its parapet
    g.save();
    g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 28;
    const slab = g.createLinearGradient(0, -360, 0, 360); slab.addColorStop(0, '#3d4149'); slab.addColorStop(1, '#2c3036');
    g.fillStyle = slab; rrPath(g, -588, -362, 1176, 724, 18); g.fill();
    g.restore();
    g.save(); rrPath(g, -588, -362, 1176, 724, 18); g.clip();
    for (let i = 0; i < 3500; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)'; g.fillRect(rr(-590, 590), rr(-364, 364), rr(1, 4), rr(1, 3)); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
    for (let x = -540; x <= 540; x += 90) { g.beginPath(); g.moveTo(x, -362); g.lineTo(x, 362); g.stroke(); }
    for (let y = -330; y <= 330; y += 90) { g.beginPath(); g.moveTo(-588, y); g.lineTo(588, y); g.stroke(); }
    // stains
    for (let i = 0; i < 22; i++) { const x = rr(-580, 580), y = rr(-350, 350); const gr = g.createRadialGradient(x, y, 0, x, y, rr(14, 40)); gr.addColorStop(0, 'rgba(0,0,0,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 40, y - 40, 80, 80); }
    g.restore();
    g.strokeStyle = '#5f646e'; g.lineWidth = 10; rrPath(g, -588, -362, 1176, 724, 18); g.stroke();
    g.strokeStyle = '#8c929d'; g.lineWidth = 2; rrPath(g, -583, -357, 1166, 714, 15); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; rrPath(g, -593, -367, 1186, 734, 20); g.stroke();

    // 3. the stands on the far side: three bleacher rows with a crowd
    const palette = ['#ff7a1a', '#2f6bff', '#1fb36b', '#7b3fe4', '#12b5c6', '#e23a43', '#f4c21d', '#d9d4c8', '#9c2347', '#222'];
    const rows = [[-352, '#2a2f3a'], [-338, '#343a47'], [-324, '#2c313c']];
    rows.forEach((r) => { g.fillStyle = r[1]; g.fillRect(-440, r[0], 880, 14); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(-440, r[0], 880, 1.6); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-440, r[0] + 13, 880, 1.2); });
    rows.forEach((r) => {
      for (let x = -432; x < 436; x += 9.5) {
        if (R() < 0.16) continue;
        const cx = x + rr(-1, 1), cy = r[0] + 8 + rr(-1, 1);
        g.fillStyle = palette[(R() * palette.length) | 0]; g.beginPath(); g.ellipse(cx, cy + 1.5, 3.6, 3, 0, 0, TAU); g.fill();
        g.fillStyle = SKINS[(R() * SKINS.length) | 0]; g.beginPath(); g.arc(cx, cy - 2.4, 2.4, 0, TAU); g.fill();
      }
    });
    // flags along the stand
    for (let i = 0; i < 7; i++) { const x = -420 + i * 140; g.fillStyle = palette[i % palette.length]; g.fillRect(x, -356, 18, 7); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, -356, 18, 1.5); }

    // 4. the near side: benches, a snack stall, a banner
    [[-270, '#ff7a1a'], [250, '#2f6bff']].forEach((b) => {
      g.fillStyle = '#4b505b'; rrPath(g, b[0] - 38, 318, 76, 11, 3); g.fill();
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(b[0] - 38, 328, 76, 2);
      for (let i = 0; i < 5; i++) { g.fillStyle = b[1]; g.beginPath(); g.ellipse(b[0] - 28 + i * 14, 323.5, 4.4, 3.8, 0, 0, TAU); g.fill(); g.fillStyle = SKINS[i % 5]; g.beginPath(); g.arc(b[0] - 28 + i * 14, 320, 2.3, 0, TAU); g.fill(); }
    });
    // stall
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4efe4' : '#e23a43'; g.fillRect(370 + i * 7, 314, 7, 24); }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(370, 338, 56, 3);
    g.fillStyle = '#ffd36b'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(370 + i * 6.5, 340, 1.6, 0, TAU); g.fill(); }
    // water cooler crates
    g.fillStyle = '#26566b'; g.fillRect(-440, 322, 16, 12); g.fillStyle = '#7bd3ee'; g.fillRect(-438, 324, 12, 5);
    g.fillStyle = '#6c4a2d'; g.fillRect(-418, 326, 14, 10); g.fillRect(-412, 318, 12, 10);
    // banner on the parapet edge
    g.save(); g.font = '700 11px ' + F_MONO; g.textAlign = 'center'; g.fillStyle = 'rgba(255,207,90,.55)';
    if (g.letterSpacing !== undefined) g.letterSpacing = '4px';
    g.fillText('ROOFTOP LEAGUE  -  FIVE A SIDE  -  BANYAN CUP', 0, 352); g.restore();

    // 5. rooftop clutter on the short sides: water tanks, AC units, aerials
    [[-562, -205], [562, 205], [-562, 190], [562, -190]].forEach((t) => {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(t[0] + 4, t[1] + 5, 21, 17, 0, 0, TAU); g.fill();
      const gr = g.createRadialGradient(t[0] - 6, t[1] - 6, 2, t[0], t[1], 21); gr.addColorStop(0, '#9bb3c4'); gr.addColorStop(1, '#4b6173');
      g.fillStyle = gr; g.beginPath(); g.arc(t[0], t[1], 19, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(t[0], t[1], 12, 0, TAU); g.stroke();
    });
    [[-566, -100], [566, 100], [-566, 105], [566, -105]].forEach((t) => {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(t[0] - 11, t[1] - 8, 28, 20);
      g.fillStyle = '#7d8590'; g.fillRect(t[0] - 13, t[1] - 10, 26, 18);
      g.fillStyle = '#31363e'; g.beginPath(); g.arc(t[0], t[1] - 1, 6.5, 0, TAU); g.fill();
      g.strokeStyle = '#a7aeb9'; g.lineWidth = 1; g.beginPath(); g.moveTo(t[0] - 6, t[1] - 1); g.lineTo(t[0] + 6, t[1] - 1); g.moveTo(t[0], t[1] - 7); g.lineTo(t[0], t[1] + 5); g.stroke();
    });
    g.fillStyle = '#ff3a2e'; [[-575, -30], [575, 30]].forEach((t) => { const gr = g.createRadialGradient(t[0], t[1], 0, t[0], t[1], 11); gr.addColorStop(0, 'rgba(255,60,50,.9)'); gr.addColorStop(1, 'rgba(255,60,50,0)'); g.fillStyle = gr; g.fillRect(t[0] - 11, t[1] - 11, 22, 22); });

    // 6. the goals' floor alcoves, then the turf
    [-1, 1].forEach((sx) => {
      g.fillStyle = '#1b5f35'; g.fillRect(sx > 0 ? HL - 4 : -HL - GD - 6, -GH - 7, GD + 10, GH * 2 + 14);
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(sx > 0 ? HL : -HL - GD - 2, -GH, GD + 2, GH * 2);
    });
    g.save(); rrPath(g, -516, -296, 1032, 592, 58); g.clip();
    const stripeA = '#1d7a41', stripeB = '#268e4d';
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? stripeA : stripeB; g.fillRect(-600 + i * 100, -300, 101, 600); }
    const lg = g.createLinearGradient(0, -296, 0, 296); lg.addColorStop(0, 'rgba(0,0,0,.14)'); lg.addColorStop(.5, 'rgba(255,255,255,.05)'); lg.addColorStop(1, 'rgba(0,0,0,.12)');
    g.fillStyle = lg; g.fillRect(-520, -300, 1040, 600);
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 9000; i++) g.fillRect(rr(-516, 516), rr(-296, 296), rr(1, 2.4), rr(.5, 1.4));
    g.fillStyle = 'rgba(0,30,10,.07)'; for (let i = 0; i < 9000; i++) g.fillRect(rr(-516, 516), rr(-296, 296), rr(1, 2.4), rr(.5, 1.4));
    // painted rubber zones in the boxes
    g.fillStyle = 'rgba(14,92,104,.30)'; g.fillRect(HL - 160, -150, 170, 300); g.fillRect(-HL - 10, -150, 170, 300);
    // lines
    g.strokeStyle = 'rgba(244,250,240,.93)'; g.lineWidth = 3.2; g.lineJoin = 'round';
    rrPath(g, -HL, -HW, HL * 2, HW * 2, CORNER); g.stroke();
    g.beginPath(); g.moveTo(0, -HW); g.lineTo(0, HW); g.stroke();
    g.beginPath(); g.arc(0, 0, 68, 0, TAU); g.stroke();
    [-1, 1].forEach((sx) => {
      g.strokeRect(sx > 0 ? HL - 160 : -HL, -150, 160, 300);
      g.beginPath(); g.arc(sx * (HL - 110), 0, 3.6, 0, TAU); g.fillStyle = 'rgba(244,250,240,.95)'; g.fill();
      g.beginPath(); g.arc(sx * (HL - 110), 0, 44, sx > 0 ? PI * 0.58 : -PI * 0.42, sx > 0 ? PI * 1.42 : PI * 0.42); g.stroke();
    });
    g.beginPath(); g.arc(0, 0, 3.6, 0, TAU); g.fill();
    // centre crown emblem
    g.fillStyle = 'rgba(255,214,120,.42)';
    g.beginPath(); g.moveTo(-30, 14); g.lineTo(-32, -12); g.lineTo(-15, 1); g.lineTo(0, -20); g.lineTo(15, 1); g.lineTo(32, -12); g.lineTo(30, 14); g.closePath(); g.fill();
    g.fillRect(-30, 17, 60, 5);
    g.restore();

    // 7. the cage boards (four straight runs, four corners, two split end walls)
    const bc = '#16304a', bl = '#5a82a8';
    const board = (x, y, w, h, horiz, label) => {
      g.fillStyle = bc; g.fillRect(x, y, w, h);
      g.fillStyle = bl; if (horiz) { g.fillRect(x, y, w, 1.5); g.fillRect(x, y + h - 1.2, w, 1.2); } else { g.fillRect(x, y, 1.5, h); g.fillRect(x + w - 1.2, y, 1.2, h); }
      const n = Math.floor((horiz ? w : h) / 80);
      for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#ffb736' : '#ff6940'; if (horiz) g.fillRect(x + i * 80 + 38, y + 2, 3, h - 4); else g.fillRect(x + 2, y + i * 80 + 38, w - 4, 3); }
      if (label && horiz) { g.save(); g.fillStyle = '#ffd36b'; g.font = '800 8px ' + F_UI; g.textAlign = 'center'; for (let i = 0; i < n; i++) g.fillText(label[i % label.length], x + i * 80 + 20, y + 8.4); g.restore(); }
    };
    board(-457, -HW - 15, 914, 12, true, ['TURF KINGS', 'ROOFTOP LEAGUE', 'FIVE A SIDE', 'BANYAN CUP']);
    board(-457, HW + 3, 914, 12, true, ['CITY CAGE', 'TURF KINGS', 'BANYAN CUP', 'ROOFTOP LEAGUE']);
    [-1, 1].forEach((sx) => {
      const x0 = sx > 0 ? HL + 3 : -HL - 15;
      board(x0, -237, 12, 237 - GH - 4, false); board(x0, GH + 4, 12, 237 - GH - 4, false);
    });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((c) => { // corners: quarter annulus
      const cx = c[0] * (HL + 3 - CORNER), cy = c[1] * (HW + 3 - CORNER);
      const a0 = c[0] > 0 ? (c[1] > 0 ? 0 : -PI / 2) : (c[1] > 0 ? PI / 2 : PI);
      g.fillStyle = bc; g.beginPath(); g.arc(cx, cy, CORNER + 12, a0, a0 + PI / 2); g.arc(cx, cy, CORNER, a0 + PI / 2, a0, true); g.closePath(); g.fill();
      g.strokeStyle = bl; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, CORNER + 0.7, a0, a0 + PI / 2); g.stroke();
    });
    // mesh fence over the boards
    g.save();
    rrPath(g, -HL - 15, -HW - 15, HL * 2 + 30, HW * 2 + 30, CORNER + 12);
    rrPath(g, -HL - 3, -HW - 3, HL * 2 + 6, HW * 2 + 6, CORNER, true);
    g.clip('evenodd');
    g.strokeStyle = 'rgba(200,225,245,.2)'; g.lineWidth = 0.7;
    for (let d = -900; d < 900; d += 6) { g.beginPath(); g.moveTo(d - 400, -320); g.lineTo(d + 400, 320); g.stroke(); g.beginPath(); g.moveTo(d + 400, -320); g.lineTo(d - 400, 320); g.stroke(); }
    g.restore();
    // posts and top rail
    g.fillStyle = '#9fb6cc';
    for (let x = -HL + 20; x <= HL - 20; x += 125) { g.beginPath(); g.arc(x, -HW - 9, 2.6, 0, TAU); g.fill(); g.beginPath(); g.arc(x, HW + 9, 2.6, 0, TAU); g.fill(); }
    for (let y = -200; y <= 200; y += 100) { if (abs(y) < GH + 10) continue; g.beginPath(); g.arc(-HL - 9, y, 2.6, 0, TAU); g.fill(); g.beginPath(); g.arc(HL + 9, y, 2.6, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(190,215,235,.5)'; g.lineWidth = 1.4; rrPath(g, -HL - 9, -HW - 9, HL * 2 + 18, HW * 2 + 18, CORNER + 9); g.stroke();
    // alcove back wall
    [-1, 1].forEach((sx) => { g.fillStyle = bc; g.fillRect(sx > 0 ? HL + GD : -HL - GD - 4, -GH - 6, 4, GH * 2 + 12); });

    // 8. floodlight masts, light pools and the vignette
    const poles = [[-556, -334], [556, -334], [-556, 334], [556, 334]];
    g.globalCompositeOperation = 'lighter';
    poles.forEach((p) => {
      const cx = p[0] * 0.42, cy = p[1] * 0.42;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 470);
      gr.addColorStop(0, 'rgba(255,244,214,.075)'); gr.addColorStop(0.55, 'rgba(255,240,205,.028)'); gr.addColorStop(1, 'rgba(255,240,205,0)');
      g.fillStyle = gr; g.fillRect(BX0, BY0, BW, BH);
    });
    const ctr = g.createRadialGradient(0, 0, 0, 0, 0, 380); ctr.addColorStop(0, 'rgba(255,248,225,.05)'); ctr.addColorStop(1, 'rgba(255,248,225,0)');
    g.fillStyle = ctr; g.fillRect(BX0, BY0, BW, BH);
    g.globalCompositeOperation = 'source-over';
    poles.forEach((p) => {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(p[0] + 3, p[1] + 5, 8, 6, 0, 0, TAU); g.fill();
      g.fillStyle = '#2a2e35'; g.beginPath(); g.arc(p[0], p[1], 6, 0, TAU); g.fill();
      g.save(); g.translate(p[0], p[1]); g.rotate(Math.atan2(-p[1], -p[0]));
      g.fillStyle = '#3a3f48'; g.fillRect(2, -13, 9, 26);
      for (let i = 0; i < 3; i++) { for (let j = 0; j < 2; j++) { g.fillStyle = '#fffbe8'; g.fillRect(4 + j * 3.4, -11 + i * 8, 2.6, 6); } }
      g.restore();
      const gl = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 38); gl.addColorStop(0, 'rgba(255,250,225,.85)'); gl.addColorStop(.35, 'rgba(255,244,205,.25)'); gl.addColorStop(1, 'rgba(255,244,205,0)');
      g.fillStyle = gl; g.fillRect(p[0] - 38, p[1] - 38, 76, 76);
    });
    const vg = g.createRadialGradient(0, 0, 330, 0, 0, 760); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,4,9,.6)');
    g.fillStyle = vg; g.fillRect(BX0, BY0, BW, BH);
    return cv;
  }

  /* ------------------------------------------------------------------ match construction */
  function pickKits(th, ta) {
    const k0 = { c1: th.c1, c2: th.c2, shorts: th.shorts, sock: th.sock };
    let k1 = { c1: ta.c1, c2: ta.c2, shorts: ta.shorts, sock: ta.sock };
    if (colDist(k0.c1, k1.c1) < 135) k1 = { c1: ta.alt.c1, c2: ta.alt.c2, shorts: ta.alt.shorts, sock: ta.alt.sock };
    if (colDist(k0.c1, k1.c1) < 135) k1 = { c1: '#f6f1e7', c2: '#222', shorts: '#222', sock: '#f6f1e7' };
    [k0, k1].forEach((k, i) => {
      const other = i === 0 ? k1 : k0;
      let best = GK_COLS[0], bs = -1;
      GK_COLS.forEach((c) => { const s = Math.min(colDist(c, k0.c1), colDist(c, k1.c1), colDist(c, '#2f9a55') * 1.2); if (s > bs && !(i === 1 && c === k0.gk)) { bs = s; best = c; } });
      k.gk = best; k.gkTrim = '#1b1b22'; void other;
    });
    return [k0, k1];
  }

  function mkPlayer(team, idx, name) {
    return {
      team, idx, i: team * 5 + idx, role: ROLES[idx], num: NUMS[idx], name,
      x: 0, y: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, fx: team ? -1 : 1, fy: 0, k: 0,
      sprint: false, stam: 1, tired: false, phase: rnd() * 6, kx: 0, ky: 0,
      slideT: 0, slideCD: 0, slideDX: 1, slideDY: 0, slideTouched: false, slideHit: false,
      tackleCD: 0, tackleAnim: 0, stunT: 0, noBallT: 0, kickT: 0, cheer: 0, hold: 0,
      aiT: rnd() * 0.3, rx: 0, ry: 0, rT: 0, mark: null, holdT: 0,
      diving: false, diveE: 0, diveY0: 0, diveY1: 0, diveRec: 0, diveDelay: -1, diveTo: 0, diveDir: 0,
      skin: SKINS[(idx * 2 + team * 3) % 5], hair: HAIRS[(idx + team) % 5], lunge: 0,
    };
  }

  function newMatch(cfg) {
    const th = TEAMS[cfg.home], ta = TEAMS[cfg.away];
    S = {
      cfg, demo: !!cfg.demo, teams: [th, ta], kits: pickKits(th, ta),
      dir: [1, -1], half: 1, phase: 'kickoff', phaseT: 0, kickTeam: 0,
      matchT: 0, T: cfg.minutes * 60, score: [0, 0],
      skill: [0.64, cfg.skill], kskill: [0.62, cfg.skill],
      ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null, lastTeam: 0, spin: 0, tx: new Float32Array(8), ty: new Float32Array(8), tz: new Float32Array(8), tn: 0 },
      players: [], ents: [], ctrl: 1, switchLock: 0, charge: 0, charging: false,
      stats: { shots: [0, 0], sot: [0, 0], poss: [0, 0.001], fouls: [0, 0], saves: [0, 0] },
      scorers: [], nets: [{ amp: 0, t: 0, y: 0, z: 0 }, { amp: 0, t: 0, y: 0, z: 0 }],
      t: 0, slow: 1, say: null, sayCD: 0, sfxWall: 0, restrict: null, foul: null, goalP: null, goalTeam: -1,
      chase: [[], []], infoT: 0, markT: 0, passTarget: null, passT: 0,
      last30: false, excite: 0, crowdT: 0, flash: 0, fade: 0, htStage: 0, pen: null,
      nearWall: 0, ballEnt: { ball: true, k: 0 }, kickOffT: 0, lastKick: null,
      parts: [], matchNo: cfg.matchNo || 1, label: cfg.label || '',
    };
    for (let t = 0; t < 2; t++) for (let i = 0; i < 5; i++) { const p = mkPlayer(t, i, TEAMS[t ? cfg.away : cfg.home].names[i]); S.players.push(p); S.ents.push(p); }
    S.ents.push(S.ballEnt);
    S.ctrl = 4; // the home striker starts as the controlled player
    placeKickoff(true);
    CAM.snap = true;
  }

  const attackX = (team) => S.dir[team] * HL;

  function placeKickoff(snap) {
    const b = S.ball;
    b.x = 0; b.y = 0; b.z = 0; b.vx = b.vy = b.vz = 0; b.owner = null; b.tn = 0;
    S.players.forEach((p) => {
      const d = S.dir[p.team], f = FORM[p.role];
      let rx = f[0], ry = f[1];
      if (p.role === 'ATT') rx = S.kickTeam === p.team ? -0.04 : -0.2;
      if ((p.role === 'WL' || p.role === 'WR') && S.kickTeam !== p.team) rx = -0.16;
      p.kx = d * rx * HL; p.ky = ry * HW * 0.9;
      if (p.role === 'ATT' && S.kickTeam === p.team) { p.kx = -d * 18; p.ky = 0; }
      if (snap) { p.x = p.kx; p.y = p.ky; p.vx = p.vy = 0; p.fx = d; p.fy = 0; }
      p.slideT = 0; p.stunT = 0; p.diving = false; p.holdT = 0; p.cheer = 0; p.noBallT = 0; p.dvx = p.dvy = 0;
    });
    S.restrict = null; S.charging = false; S.charge = 0;
  }

  function beginPlay() {
    S.phase = 'play'; S.phaseT = 0;
    const kicker = S.players.find((p) => p.team === S.kickTeam && p.role === 'ATT');
    const d = S.dir[S.kickTeam];
    kicker.x = -d * (PR + BR + 2); kicker.y = 0; kicker.fx = d; kicker.fy = 0; kicker.vx = kicker.vy = 0;
    S.ball.x = 0; S.ball.y = 0;
    takeBall(kicker);
    kicker.hold = -0.35;
    if (S.kickTeam === 0 && !S.demo) S.ctrl = kicker.i;
    snd.whistle(false);
    if (S.matchT < 1) sayRare('kickoff', true);
  }

  /* ------------------------------------------------------------------ ball ownership and kicks */
  function takeBall(p, hold) {
    const b = S.ball;
    b.owner = p; b.lastTouch = p; b.lastTeam = p.team; b.vz = 0; b.z = p.role === 'GK' ? 15 : 0;
    p.hold = 0;
    if (hold) p.holdT = 0.9 + rnd() * 0.7;
    if (S.passTarget && S.passTarget.team !== p.team) S.passTarget = null;
    if (S.passTarget === p) S.passTarget = null;
    if (S.restrict && p.team !== S.restrict.team) S.restrict = null;
  }
  function releaseBall(p) {
    const b = S.ball;
    if (b.owner !== p) return;
    b.owner = null; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
  }
  function speedFor(d, vEnd) {
    const c = FR_C / FR_K; let t = d / 420, v = vEnd;
    for (let i = 0; i < 4; i++) { v = vEnd + FR_K * (d + c * t); t = Math.log((v + c) / (vEnd + c)) / FR_K; }
    return v;
  }
  function kickBall(p, dx, dy, speed, vz, kind) {
    const b = S.ball; const m = hyp(dx, dy) || 1; dx /= m; dy /= m;
    if (b.owner === p) {
      b.owner = null;
      b.x = p.x + dx * (PR + BR + 1.5); b.y = p.y + dy * (PR + BR + 1.5);
    }
    b.vx = dx * speed; b.vy = dy * speed; b.vz = vz; if (vz > 0) b.z = Math.max(b.z, 1.5);
    b.lastTouch = p; b.lastTeam = p.team; p.noBallT = 0.3; p.kickT = 0.22; p.fx = dx; p.fy = dy;
    S.lastKick = { p, kind, t: S.t };
    if (S.restrict && p.team !== S.restrict.team) S.restrict = null;
    ballConfine();
    const pw = clamp(speed / 900, 0, 1);
    for (let i = 0; i < 3; i++) spawn(0, b.x, b.y, 2, (rnd() - 0.5) * 60 - dx * 30, (rnd() - 0.5) * 60 - dy * 30, 20 + rnd() * 20, 0.35, '#e8efdc', 3);
    if (kind === 'shot') snd.kick(pw); else snd.pass();
    if (kind === 'shot') S.excite = Math.min(1, S.excite + 0.5);
  }
  function ballConfine() {
    const b = S.ball;
    if (abs(b.x) > HL - BR && abs(b.y) < GH && b.z < GOAL_H) return;
    confine(b, BR);
  }

  /* ------------------------------------------------------------------ geometry helpers */
  function confine(o, r) {
    const ix = HL - r, iy = HW - r;
    if (o.x > ix) o.x = ix; else if (o.x < -ix) o.x = -ix;
    if (o.y > iy) o.y = iy; else if (o.y < -iy) o.y = -iy;
    const cr = Math.max(2, CORNER - r), cx = ix - cr, cy = iy - cr;
    const dx = abs(o.x) - cx, dy = abs(o.y) - cy;
    if (dx > 0 && dy > 0) {
      const d = hyp(dx, dy);
      if (d > cr) { const k = cr / d; o.x = sgn(o.x) * (cx + dx * k); o.y = sgn(o.y) * (cy + dy * k); }
    }
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t - px, cy = ay + dy * t - py;
    return Math.sqrt(cx * cx + cy * cy);
  }
  function laneMin(team, ax, ay, bx, by, withGK) {
    let m = 1e9;
    for (let i = 0; i < 10; i++) {
      const o = S.players[i]; if (o.team === team) continue;
      if (o.role === 'GK' && !withGK) continue;
      const d = segDist(o.x, o.y, ax, ay, bx, by); if (d < m) m = d;
    }
    return m;
  }
  function nearestOpp(p, skipGK) {
    let best = null, bd = 1e9;
    for (let i = 0; i < 10; i++) {
      const o = S.players[i]; if (o.team === p.team || (skipGK && o.role === 'GK')) continue;
      const d = hyp(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; }
    }
    S.nearD = bd; return best;
  }

  /* ------------------------------------------------------------------ particles */
  const PT = [];
  for (let i = 0; i < 260; i++) PT.push({ a: false, kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, col: '#fff', size: 3, rot: 0, vr: 0 });
  function spawn(kind, x, y, z, vx, vy, vz, life, col, size) {
    for (let i = 0; i < PT.length; i++) {
      const q = PT[i]; if (q.a) continue;
      q.a = true; q.kind = kind; q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz; q.life = life; q.max = life; q.col = col; q.size = size; q.rot = rnd() * TAU; q.vr = (rnd() - 0.5) * 12;
      return;
    }
  }
  function confetti(x, y, team) {
    if (arc.reducedMotion) return;
    const cols = [S.kits[team].c1, S.kits[team].c2, '#ffb736', '#ff6940', '#fbf5ec'];
    for (let i = 0; i < 90; i++) spawn(1, x + (rnd() - 0.5) * 160, y + (rnd() - 0.5) * 120, 90 + rnd() * 90, (rnd() - 0.5) * 140, (rnd() - 0.5) * 140, 40 + rnd() * 120, 2.4 + rnd() * 1.6, cols[(rnd() * cols.length) | 0], 3 + rnd() * 3);
  }
  function updateParticles(dt) {
    for (let i = 0; i < PT.length; i++) {
      const q = PT[i]; if (!q.a) continue;
      q.life -= dt; if (q.life <= 0) { q.a = false; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.rot += q.vr * dt;
      if (q.kind === 1) { q.vz -= 160 * dt; q.vz = Math.max(q.vz, -60); q.vx *= 0.99; q.vy *= 0.99; if (q.z < 0) { q.z = 0; q.vz = 0; q.vx *= 0.9; q.vy *= 0.9; q.vr *= 0.8; } }
      else { q.vx *= 0.94; q.vy *= 0.94; q.vz -= 120 * dt; if (q.z < 0) { q.z = 0; q.vz = 0; } }
    }
  }

  /* ------------------------------------------------------------------ the ball */
  function updateBall(dt) {
    const b = S.ball;
    if (b.owner) { carry(dt); return; }
    const sp0 = hyp(b.vx, b.vy), n = sp0 * dt > 9 ? Math.min(6, Math.ceil(sp0 * dt / 9)) : 1, h = dt / n;
    for (let k = 0; k < n; k++) ballStep(h);
    if (hyp(b.vx, b.vy) > 320 || b.z > 8) { // trail
      b.tn = (b.tn + 1) % 8; b.tx[b.tn] = b.x; b.ty[b.tn] = b.y; b.tz[b.tn] = b.z;
    }
    b.spin += hyp(b.vx, b.vy) * dt / BR;
  }
  function carry(dt) {
    const b = S.ball, p = b.owner;
    if (p.stunT > 0 || p.slideT > 0 || p.diving) { releaseBall(p); return; }
    if (p.role === 'GK') { b.x = p.x + p.fx * 8; b.y = p.y + p.fy * 8; b.z = 15; b.vx = b.vy = b.vz = 0; return; }
    const spd = hyp(p.vx, p.vy);
    const d = PR + BR - 1 + (p.sprint ? 5 : 1.5) + Math.sin(p.phase * 2) * 3.2 * Math.min(1, spd / 120);
    const tx = p.x + p.fx * d, ty = p.y + p.fy * d;
    const k = 1 - Math.exp(-26 * dt);
    b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.z = 0; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
    confine(b, BR);
    b.spin += spd * dt / BR;
  }
  function netHit(side, y, z, sp) {
    const n = S.nets[side > 0 ? 1 : 0];
    n.amp = Math.min(1, 0.35 + sp / 700); n.t = 0; n.y = y; n.z = z;
    snd.net();
  }
  function ballStep(h) {
    const b = S.ball;
    b.vz -= GRAV * h;
    b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -70) { const imp = -b.vz; b.vz = imp * 0.58; b.vx *= 0.95; b.vy *= 0.95; if (imp > 150) snd.bounce(imp); if (imp > 260) spawn(0, b.x, b.y, 0, 0, 0, 14, 0.3, '#dfe9d4', 3); }
      else {
        b.vz = 0;
        const sp = hyp(b.vx, b.vy);
        if (sp > 0) { const ns = Math.max(0, sp - (FR_C + FR_K * sp) * h), k = ns / sp; b.vx *= k; b.vy *= k; }
      }
    } else { const k = Math.exp(-0.16 * h); b.vx *= k; b.vy *= k; }
    if (b.z > ROOF - BR) { b.z = ROOF - BR; if (b.vz > 0) b.vz = -b.vz * 0.4; }
    // posts
    for (let a = -1; a <= 1; a += 2) for (let c = -1; c <= 1; c += 2) {
      if (b.z > GOAL_H + 2) continue;
      const px = a * HL, py = c * GH, dx = b.x - px, dy = b.y - py, d = hyp(dx, dy), rr = BR + 4;
      if (d < rr && d > 0.001) {
        const nx = dx / d, ny = dy / d; b.x = px + nx * rr; b.y = py + ny * rr;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; b.vx *= 0.92; b.vy *= 0.92; if (-vn > 130) postHit(); }
      }
    }
    // crossbar
    const ax = abs(b.x);
    if (ax > HL - BR && ax < HL + BR && abs(b.y) < GH && b.z > GOAL_H - BR && b.z < GOAL_H + BR + 2) {
      const rising = b.vz > 0;
      if (abs(b.vz) > 40 || abs(b.vx) > 60) { b.z = rising ? GOAL_H - BR - 0.5 : GOAL_H + BR + 0.5; b.vz = (rising ? -1 : 1) * abs(b.vz) * 0.5; b.vx *= 0.82; postHit(); }
    }
    // end walls and goal
    if (ax > HL - BR) {
      const mouth = abs(b.y) < GH - 1 && b.z < GOAL_H - 2;
      const sx = sgn(b.x);
      if (ax > HL) {
        // inside the alcove
        if (b.y > GH - BR) { b.y = GH - BR; if (b.vy > 0) b.vy *= -0.2; } else if (b.y < -(GH - BR)) { b.y = -(GH - BR); if (b.vy < 0) b.vy *= -0.2; }
        if (b.z > GOAL_H - BR) { b.z = GOAL_H - BR; if (b.vz > 0) b.vz *= -0.2; }
        if (ax > HL + GD - BR) { const spx = abs(b.vx); b.x = sx * (HL + GD - BR); if (b.vx * sx > 0) { b.vx *= -0.14; b.vy *= 0.5; netHit(sx, b.y, b.z, spx); } }
        goalCheck(sx, mouth);
      } else if (!mouth) {
        b.x = sx * (HL - BR);
        if (b.vx * sx > 0) { wallBounce(abs(b.vx)); b.vx *= -0.72; b.vy *= 0.96; }
      }
    }
    if (ax <= HL) {
      if (b.y > HW - BR) { b.y = HW - BR; if (b.vy > 0) { wallBounce(b.vy); b.vy *= -0.76; b.vx *= 0.96; } }
      else if (b.y < -HW + BR) { b.y = -HW + BR; if (b.vy < 0) { wallBounce(-b.vy); b.vy *= -0.76; b.vx *= 0.96; } }
      // rounded cage corners
      const ix = HL - BR, iy = HW - BR, cr = CORNER - BR, cx = ix - cr, cy = iy - cr;
      const dx = ax - cx, dy = abs(b.y) - cy;
      if (dx > 0 && dy > 0) {
        const d = hyp(dx, dy);
        if (d > cr) {
          const nx = sgn(b.x) * dx / d, ny = sgn(b.y) * dy / d, k = cr / d;
          b.x = sgn(b.x) * (cx + dx * k); b.y = sgn(b.y) * (cy + dy * k);
          const vn = b.vx * nx + b.vy * ny;
          if (vn > 0) { wallBounce(vn); b.vx -= 1.74 * vn * nx; b.vy -= 1.74 * vn * ny; }
        }
      }
    }
  }
  function wallBounce(sp) {
    snd.wall(sp);
    if (sp > 380 && S.lastKick && S.t - S.lastKick.t < 1.6 && S.sayCD <= 0 && rnd() < 0.3) sayRare('wall');
  }
  function postHit() {
    snd.post(); S.excite = 1;
    if (S.phase === 'penalties') return;
    sayRare('post', true);
    const b = S.ball; for (let i = 0; i < 4; i++) spawn(2, b.x, b.y, b.z, (rnd() - 0.5) * 120, (rnd() - 0.5) * 120, 40 + rnd() * 50, 0.4, '#ffe9a8', 2);
  }
  function goalCheck(sx, mouth) {
    const b = S.ball;
    if (S.phase === 'penalties') { penBallInGoal(); return; }
    if (S.phase !== 'play') return;
    if (abs(b.y) < GH && b.z < GOAL_H) scoreGoal(sx);
    void mouth;
  }

  /* ------------------------------------------------------------------ goal, fouls, phases */
  function matchClock(t) {
    const m = (t === undefined ? S.matchT : t) / S.T * 20;
    const mm = Math.floor(m), ss = Math.floor((m - mm) * 60);
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function scoreGoal(sx) {
    const b = S.ball;
    const team = S.dir[0] === sx ? 0 : 1;
    let scorer = b.lastTouch, og = false;
    if (!scorer || scorer.team !== team) { og = !!scorer; if (!scorer) scorer = S.players.find((p) => p.team === team && p.role === 'ATT'); }
    S.score[team]++;
    S.scorers.push({ team, name: scorer.name, clock: matchClock(), og, num: scorer.num });
    S.phase = 'goal'; S.phaseT = 0; S.goalTeam = team; S.goalP = { x: scorer.x, y: scorer.y }; S.charging = false; S.charge = 0;
    S.players.forEach((p) => { if (p.team === team) p.cheer = 2.8; });
    S.excite = 1; S.flash = arc.reducedMotion ? 0 : 1;
    confetti(scorer.x, scorer.y, team);
    snd.roar(true); snd.whistle(false);
    if (!S.demo) {
      arc.toast('GOAL!', scorer.name + (og ? ' (og)' : '') + '  ' + S.teams[team].abbr + '  ' + matchClock(), 2800);
      say(og ? pick(LINES.og) : pick(LINES.goal), 3);
    }
    S.nearWall = 0;
  }
  function startHalftime() {
    S.phase = 'halftime'; S.phaseT = 0; S.htStage = 0; S.charging = false;
    S.players.forEach((p) => { p.dvx = p.dvy = 0; });
    snd.whistle(true);
    if (!S.demo) { arc.toast('Half time', S.teams[0].abbr + ' ' + S.score[0] + ' - ' + S.score[1] + ' ' + S.teams[1].abbr, 2400); say('Teams swap ends for the second half.', 3); }
  }
  function startFulltime() {
    S.phase = 'fulltime'; S.phaseT = 0; S.charging = false;
    S.players.forEach((p) => { p.dvx = p.dvy = 0; });
    snd.whistle(true); snd.roar(false);
    if (!S.demo) arc.toast('Full time', S.teams[0].abbr + ' ' + S.score[0] + ' - ' + S.score[1] + ' ' + S.teams[1].abbr, 2400);
  }
  function callFoul(fouler, victim) {
    S.phase = 'foul'; S.phaseT = 0;
    S.foul = { x: clamp(victim.x, -HL + 45, HL - 45), y: clamp(victim.y, -HW + 40, HW - 40), off: fouler.team, victim };
    S.stats.fouls[fouler.team]++;
    S.charging = false;
    const b = S.ball; b.owner = null; b.vx = b.vy = b.vz = 0; b.z = 0; b.x = S.foul.x; b.y = S.foul.y;
    snd.whistle(false);
    if (!S.demo) { arc.toast('Foul!', 'Free kick ' + S.teams[victim.team].short, 1800); say('Clumsy from behind. Free kick.', 2.6); }
  }

  /* ------------------------------------------------------------------ movement and physics of players */
  function baseSpeed(p) {
    if (p.role === 'GK') return 176;
    let s = 150;
    if (p.team === 1 || S.demo || p.i !== S.ctrl) s *= 0.86 + 0.2 * S.skill[p.team];
    if (S.ball.owner === p) s *= 0.94;
    return s;
  }
  function moveTo(p, tx, ty, spr) {
    const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy);
    p.sprint = !!(spr && p.stam > 0.08 && !p.tired);
    if (d < 3) { p.dvx = 0; p.dvy = 0; p.sprint = false; return; }
    const sp = baseSpeed(p) * (p.sprint ? 1.34 : 1) * Math.min(1, d / 26 + 0.05);
    p.dvx = dx / d * sp; p.dvy = dy / d * sp;
  }
  function integratePlayers(dt) {
    for (let i = 0; i < 10; i++) {
      const p = S.players[i];
      if (p.tackleCD > 0) p.tackleCD -= dt;
      if (p.slideCD > 0) p.slideCD -= dt;
      if (p.noBallT > 0) p.noBallT -= dt;
      if (p.kickT > 0) p.kickT -= dt;
      if (p.tackleAnim > 0) p.tackleAnim -= dt;
      if (p.cheer > 0) p.cheer -= dt;
      if (p.diveRec > 0) p.diveRec -= dt;
      if (p.lunge > 0) p.lunge -= dt;
      if (p.diving) {
        p.diveE += dt;
        const t = Math.min(1, p.diveE / 0.3), e = 1 - (1 - t) * (1 - t);
        const ny = p.diveY0 + (p.diveY1 - p.diveY0) * e;
        p.vy = (ny - p.y) / Math.max(dt, 0.001); p.vx = 0; p.y = ny;
        if (p.diveE > 0.85) { p.diving = false; p.diveRec = 0.45; p.vy = 0; }
        continue;
      }
      if (p.slideT > 0) {
        p.slideT -= dt;
        const k = Math.max(0, p.slideT / 0.5);
        p.vx = p.slideDX * 330 * k; p.vy = p.slideDY * 330 * k;
        if (p.slideT <= 0) { p.slideCD = 0.9; p.stunT = 0.25; p.vx = p.vy = 0; }
      } else if (p.stunT > 0) {
        p.stunT -= dt; p.vx *= 0.88; p.vy *= 0.88;
      } else {
        const a = (p.lunge > 0 ? 3200 : 1500) * dt;
        p.vx = approach(p.vx, p.dvx, a); p.vy = approach(p.vy, p.dvy, a);
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      confine(p, PR);
      const sp = hyp(p.vx, p.vy);
      if (sp > 22 && p.slideT <= 0 && p.stunT <= 0 && p.kickT <= 0.1) {
        const k = 1 - Math.exp(-(p.i === S.ctrl ? 18 : 12) * dt);
        p.fx += (p.vx / sp - p.fx) * k; p.fy += (p.vy / sp - p.fy) * k;
        const m = hyp(p.fx, p.fy) || 1; p.fx /= m; p.fy /= m;
      }
      p.phase += sp * dt * 0.08;
      // stamina
      if (p.sprint && sp > 60) { p.stam -= (p.i === S.ctrl ? 0.34 : 0.22) * dt; if (p.stam <= 0.02) { p.stam = 0.02; p.tired = true; } }
      else { p.stam = Math.min(1, p.stam + (sp < 30 ? 0.3 : 0.17) * dt); if (p.tired && p.stam > 0.3) p.tired = false; }
    }
    for (let i = 0; i < 10; i++) {
      const a = S.players[i];
      for (let j = i + 1; j < 10; j++) {
        const c = S.players[j];
        if (a.diving || c.diving) continue;
        const dx = c.x - a.x, dy = c.y - a.y, min = PR * 1.75;
        if (dx > min || dx < -min || dy > min || dy < -min) continue;
        const d = hyp(dx, dy);
        if (d < min && d > 0.01) {
          const push = (min - d) * 0.5, nx = dx / d, ny = dy / d;
          const wa = a.slideT > 0 ? 0.2 : 1, wc = c.slideT > 0 ? 0.2 : 1;
          a.x -= nx * push * wa; a.y -= ny * push * wa; c.x += nx * push * wc; c.y += ny * push * wc;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ interactions: pick up, saves, tackles */
  function tryPickup() {
    const b = S.ball;
    if (b.owner || b.z > 26 || S.phase !== 'play') return;
    let best = null, bd = 1e9;
    for (let i = 0; i < 10; i++) {
      const p = S.players[i];
      if (p.stunT > 0 || p.slideT > 0 || p.noBallT > 0 || p.diving) continue;
      if (S.restrict && p.team === S.restrict.team) continue;
      const d = hyp(b.x - p.x, b.y - p.y), reach = PR + BR + (p.role === 'GK' ? 7 : 2);
      if (d < reach && d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const rel = hyp(b.vx - best.vx, b.vy - best.vy);
    if (best.role === 'GK') { if (rel < 300 && b.z < 36) takeBall(best, true); return; }
    if (rel > 640) { // too hot to control: it cannons off
      const nx = (b.x - best.x) / (bd || 1), ny = (b.y - best.y) / (bd || 1), vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny; b.vx *= 0.55; b.vy *= 0.55; }
      best.noBallT = 0.15; b.lastTouch = best; b.lastTeam = best.team; snd.tackle();
      return;
    }
    takeBall(best);
  }
  function keeperSaves() {
    const b = S.ball;
    if (b.owner || (S.phase !== 'play' && S.phase !== 'penalties')) return;
    for (let i = 0; i < 10; i++) {
      const g = S.players[i]; if (g.role !== 'GK' || g.noBallT > 0) continue;
      const reach = PR + BR + (g.diving ? 22 : 8);
      const d = hyp(b.x - g.x, b.y - g.y);
      if (d < reach && b.z < (g.diving ? 62 : 42)) {
        const rel = hyp(b.vx - g.vx, b.vy - g.vy), ks = S.kskill[g.team];
        const lim = 340 + 250 * ks - (b.z > 30 ? 90 : 0) - (g.diving ? 70 : 0);
        const isShot = hyp(b.vx, b.vy) > 250;
        if (S.phase === 'penalties' && S.pen) S.pen.saved = true;
        if (rel < lim) {
          takeBall(g, true); b.lastTouch = g;
          if (isShot) { S.stats.saves[g.team]++; snd.save(); if (g.team === 1) sayRare('save', true); else sayRare('save', true); }
        } else {
          const inward = S.dir[g.team];
          b.vx = -b.vx * 0.25 + inward * 120; b.vy = b.vy * 0.3 + (sgn(b.y - g.y + (rnd() - 0.5) * 8)) * (170 + rnd() * 130); b.vz = 80 + rnd() * 90;
          b.lastTouch = g; b.lastTeam = g.team; g.noBallT = 0.4;
          S.stats.saves[g.team]++; snd.save(); sayRare('save', true);
        }
        return;
      }
    }
  }
  function startSlide(p, dx, dy) {
    if (p.slideCD > 0 || p.slideT > 0 || p.stunT > 0) return;
    const m = hyp(dx, dy); if (m < 0.1) { dx = p.fx; dy = p.fy; } else { dx /= m; dy /= m; }
    p.slideT = 0.5; p.slideDX = dx; p.slideDY = dy; p.fx = dx; p.fy = dy; p.slideTouched = false; p.slideHit = false;
    for (let i = 0; i < 3; i++) spawn(0, p.x, p.y, 1, -dx * 40 + (rnd() - 0.5) * 50, -dy * 40 + (rnd() - 0.5) * 50, 14, 0.4, '#cfe0c0', 3);
  }
  function slideContacts() {
    const b = S.ball;
    for (let i = 0; i < 10; i++) {
      const p = S.players[i]; if (p.slideT <= 0) continue;
      // the ball
      const db = hyp(b.x - p.x, b.y - p.y);
      if (db < PR + BR + 9 && b.z < 22 && !p.slideTouched) {
        p.slideTouched = true;
        const own = b.owner;
        if (own && own.team !== p.team) { own.stunT = 0.5; own.noBallT = 0.6; releaseBall(own); }
        if (!own || own.team !== p.team) {
          b.owner = null; b.vx = p.slideDX * 360 + (rnd() - 0.5) * 40; b.vy = p.slideDY * 360 + (rnd() - 0.5) * 40; b.vz = 0;
          b.lastTouch = p; b.lastTeam = p.team; p.noBallT = 0.2;
          snd.tackle(); sayRare('slide', true);
          for (let k = 0; k < 4; k++) spawn(3, b.x, b.y, 1, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, 30 + rnd() * 30, 0.5, '#2a8148', 2.4);
        }
      }
      // opponents
      if (p.slideHit) continue;
      for (let j = 0; j < 10; j++) {
        const o = S.players[j]; if (o.team === p.team || o.stunT > 0 || o.role === 'GK' && o.holdT > 0) continue;
        if (hyp(o.x - p.x, o.y - p.y) < PR * 1.9) {
          p.slideHit = true;
          if (p.slideTouched) break; // clean, ball first
          const fromBehind = (p.x - o.x) * o.fx + (p.y - o.y) * o.fy < 0;
          const hadBall = b.owner === o;
          if (S.phase === 'play' && (fromBehind || !hadBall)) {
            o.stunT = 0.8; callFoul(p, o);
          } else if (hadBall) { // clean take from the front or side
            o.stunT = 0.5; o.noBallT = 0.6; releaseBall(o); b.vx = p.slideDX * 240; b.vy = p.slideDY * 240; b.lastTouch = p; b.lastTeam = p.team; snd.tackle();
          }
          break;
        }
      }
    }
  }
  function standTackle(p, human) {
    if (p.tackleCD > 0 || p.stunT > 0 || p.slideT > 0 || S.phase !== 'play') return;
    if (S.restrict && S.restrict.team === p.team) return;
    p.tackleCD = human ? 0.6 : 0.8 - 0.3 * S.skill[p.team] + rnd() * 0.4; p.tackleAnim = 0.25;
    const b = S.ball, o = b.owner;
    // lunge toward the ball carrier or the ball
    let tx = b.x, ty = b.y; const dm = hyp(tx - p.x, ty - p.y);
    if (dm > 1) { p.lunge = 0.14; p.vx += (tx - p.x) / dm * 90; p.vy += (ty - p.y) / dm * 90; }
    if (o && o.team !== p.team) {
      const d = hyp(o.x - p.x, o.y - p.y);
      if (d < PR * 2 + 12) {
        const front = (p.x - o.x) * o.fx + (p.y - o.y) * o.fy > 0;
        const sk = S.skill[p.team];
        let chance = human ? (front ? 0.62 : 0.5) : (0.22 + 0.42 * sk) * (front ? 1.1 : 0.7);
        if (o.sprint) chance -= 0.08;
        if (S.last30 && !human) chance += 0.05;
        if (rnd() < chance) {
          const vx = (b.x - o.x), vy = (b.y - o.y), m = hyp(vx, vy) || 1;
          o.noBallT = 0.55; o.stunT = 0.12; releaseBall(o);
          b.vx = vx / m * 120 + p.fx * 60; b.vy = vy / m * 120 + p.fy * 60; b.lastTouch = p; b.lastTeam = p.team;
          snd.tackle(); if (human || rnd() < 0.4) sayRare('tackle');
          for (let k = 0; k < 3; k++) spawn(2, b.x, b.y, 4, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, 40, 0.3, '#fff2b8', 2);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ shooting and passing */
  function shootAt(p, dx, dy, power01, assist, spread) {
    const gx = attackX(p.team), sgx = sgn(gx);
    const m = hyp(dx, dy) || 1; dx /= m; dy /= m;
    if (dx * sgx > 0.12) {
      const t = (gx - p.x) / dx, yy = p.y + dy * t;
      if (abs(yy) < GH + 95) {
        const target = clamp(yy, -(GH - 11), GH - 11);
        const tx = gx - p.x, ty = target - p.y, tm = hyp(tx, ty) || 1;
        dx = lerp(dx, tx / tm, assist); dy = lerp(dy, ty / tm, assist);
        const m2 = hyp(dx, dy) || 1; dx /= m2; dy /= m2;
      }
    }
    if (spread) { const a = (rnd() - 0.5) * spread, c = Math.cos(a), s = Math.sin(a); const nx = dx * c - dy * s; dy = dx * s + dy * c; dx = nx; }
    const pw = 0.3 + 0.7 * power01;
    const speed = 430 + 470 * pw * 0.9 + (power01 > 0.5 ? 60 : 0);
    const vz = 20 + 125 * power01 * power01 * (0.4 + rnd() * 0.6);
    kickBall(p, dx, dy, speed, vz, 'shot');
    S.stats.shots[p.team]++;
    // on target? project to the goal line
    if (dx * sgx > 0.05) {
      const t = (gx - S.ball.x) / S.ball.vx, yy = S.ball.y + S.ball.vy * t, zz = S.ball.z + S.ball.vz * t - 0.5 * GRAV * t * t;
      if (abs(yy) < GH && zz < GOAL_H) S.stats.sot[p.team]++;
    }
    sayRare('shot');
  }
  function bestReceiver(p, dx, dy, hasDir, lob) {
    let best = null, bs = -1e9; const dir = S.dir[p.team];
    for (let i = 0; i < 10; i++) {
      const m = S.players[i]; if (m.team !== p.team || m === p) continue;
      const vx = m.x - p.x, vy = m.y - p.y, d = hyp(vx, vy); if (d < 45) continue;
      const cos = (vx * dx + vy * dy) / d;
      if (cos < (hasDir ? 0.3 : 0.12)) continue;
      if (m.role === 'GK' && cos < 0.85) continue;
      let sc = cos * 60 - d * 0.04 + (vx * dir) * 0.02;
      if (!lob) sc += laneMin(p.team, p.x, p.y, m.x, m.y, false) > 24 ? 16 : -26;
      if (m.role === 'GK') sc -= 20;
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  }
  function passTo(p, m, lob, err) {
    const b = S.ball;
    const d0 = hyp(m.x - p.x, m.y - p.y);
    let lead = lob ? 0.55 : 0.3;
    let tx = m.x + clamp(m.vx * lead, -45, 45), ty = m.y + clamp(m.vy * lead, -45, 45);
    tx = clamp(tx, -HL + 20, HL - 20); ty = clamp(ty, -HW + 20, HW - 20);
    let dx = tx - p.x, dy = ty - p.y; const d = hyp(dx, dy) || 1;
    if (err) { const a = (rnd() - 0.5) * err, c = Math.cos(a), s = Math.sin(a); const nx = dx * c - dy * s; dy = dx * s + dy * c; dx = nx; }
    if (lob) {
      const T = clamp(d / 560, 0.55, 1.05), vh = d / T * 1.06;
      kickBall(p, dx, dy, vh, GRAV * T / 2, 'pass');
    } else {
      kickBall(p, dx, dy, clamp(speedFor(d, 170), 300, 740), 0, 'pass');
    }
    void d0;
    S.passTarget = m; S.passT = 1.6;
    return b;
  }

  /* ------------------------------------------------------------------ human control */
  function canKick(p) {
    const b = S.ball;
    if (p.stunT > 0 || p.slideT > 0) return false;
    if (b.owner === p) return true;
    return !b.owner && hyp(b.x - p.x, b.y - p.y) < PR + BR + 10 && b.z < 30;
  }
  function humanControl(dt) {
    const p = S.players[S.ctrl]; if (!p) return;
    const IN = arc.input, ax = IN.axis(), mag = hyp(ax.x, ax.y);
    let dx = 0, dy = 0;
    if (mag > 0.12) { uvToWorld(ax.x, ax.y, TMP); dx = TMP.x; dy = TMP.y; }
    const free = S.phase === 'play' || S.phase === 'foul';
    const busy = p.slideT > 0 || p.stunT > 0 || p.diving;
    if (!free) { p.dvx = p.dvy = 0; p.sprint = false; return; }
    const wantSprint = IN.down('KeyL', 'ShiftLeft', 'ShiftRight') && mag > 0.2;
    p.sprint = wantSprint && p.stam > 0.04 && !p.tired;
    if (!busy) {
      const sp = 158 * (p.sprint ? 1.36 : 1) * (S.ball.owner === p ? 0.95 : 1) * (S.charging ? 0.6 : 1);
      p.dvx = dx * sp; p.dvy = dy * sp;
      if (mag > 0.12 && S.ball.owner === p && hyp(p.vx, p.vy) < 40) { p.fx = dx / mag; p.fy = dy / mag; }
    }
    if (busy || S.phase !== 'play') { S.charging = false; return; }
    const owns = canKick(p);
    const hasDir = mag > 0.3, ndx = hasDir ? dx / mag : p.fx, ndy = hasDir ? dy / mag : p.fy;
    if (IN.hit('KeyK')) {
      if (owns) { S.charging = true; S.charge = 0.001; }
      else if (!(S.restrict && S.restrict.team === p.team)) startSlide(p, ndx, ndy);
    }
    if (S.charging) {
      if (!owns) { S.charging = false; S.charge = 0; }
      else if (IN.down('KeyK')) S.charge = Math.min(1, S.charge + dt / 0.75);
      else { shootAt(p, ndx, ndy, S.charge, 0.62, S.charge > 0.93 ? 0.12 : 0.02); S.charging = false; S.charge = 0; }
    }
    if (IN.hit('KeyJ', 'Space') || IN.pointer.pressed) { if (owns) humanPass(p, false, hasDir, ndx, ndy); else standTackle(p, true); }
    if (IN.hit('KeyU')) { if (owns) humanPass(p, true, hasDir, ndx, ndy); }
    if (IN.hit('KeyQ')) manualSwitch();
  }
  function humanPass(p, lob, hasDir, dx, dy) {
    const m = bestReceiver(p, dx, dy, hasDir, lob);
    if (m) {
      passTo(p, m, lob, 0.03);
      if (m.role !== 'GK') { S.ctrl = m.i; S.switchLock = 0.5; }
    } else {
      kickBall(p, dx, dy, lob ? 430 : 400, lob ? 330 : 0, 'pass');
    }
  }
  function manualSwitch() {
    const b = S.ball; let best = null, bd = 1e9;
    for (let i = 1; i < 5; i++) { if (i === S.ctrl) continue; const p = S.players[i]; const d = hyp(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } }
    if (best) { S.ctrl = best.i; S.switchLock = 0.45; S.charging = false; }
  }
  function autoSwitch(dt) {
    if (S.demo) { S.ctrl = -1; return; }
    S.switchLock -= dt;
    const b = S.ball, cp = S.players[S.ctrl];
    if (b.owner && b.owner.team === 0 && b.owner.role !== 'GK') { if (b.owner !== cp && S.switchLock <= 0) { S.ctrl = b.owner.i; S.charging = false; } return; }
    if (S.switchLock > 0 || b.owner === cp || (cp && (cp.slideT > 0))) return;
    let best = null, bd = 1e9;
    for (let i = 1; i < 5; i++) { const p = S.players[i]; const d = hyp(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } }
    if (best && best !== cp && bd + 18 < hyp(cp.x - b.x, cp.y - b.y)) { S.ctrl = best.i; S.switchLock = 0.3; S.charging = false; }
  }

  /* ------------------------------------------------------------------ AI */
  function anchor(p, out) {
    const t = p.team, d = S.dir[t], f = FORM[p.role], b = S.ball;
    const att = b.owner ? b.owner.team === t : b.lastTeam === t;
    const bx = b.x * d / HL;
    const rx = f[0] + (att ? 0.16 : -0.05) + bx * 0.34;
    out.x = d * clamp(rx, -0.92, 0.8) * HL;
    out.y = clamp(f[1] * HW * 0.9 + b.y * 0.28, -HW + 40, HW - 40);
  }
  function computeInfo() {
    const b = S.ball;
    for (let t = 0; t < 2; t++) {
      const list = [];
      for (let i = 0; i < 5; i++) {
        const p = S.players[t * 5 + i]; if (p.role === 'GK') continue;
        if (!S.demo && p.i === S.ctrl) continue;
        list.push(p);
      }
      list.sort((a, c) => hyp(a.x - b.x, a.y - b.y) - hyp(c.x - b.x, c.y - b.y));
      S.chase[t] = list;
    }
  }
  function assignMarks(t) {
    const b = S.ball, o = b.owner;
    const defs = S.chase[t].slice(2), atk = [];
    for (let i = 1; i < 5; i++) { const q = S.players[(1 - t) * 5 + i]; if (q !== o) atk.push(q); }
    defs.forEach((d) => { d.mark = null; });
    const used = new Set();
    const pairs = [];
    defs.forEach((d) => atk.forEach((a) => pairs.push([hyp(d.x - a.x, d.y - a.y), d, a])));
    pairs.sort((x, y) => x[0] - y[0]);
    const done = new Set();
    pairs.forEach((pr) => { if (done.has(pr[1]) || used.has(pr[2])) return; pr[1].mark = pr[2]; done.add(pr[1]); used.add(pr[2]); });
  }
  function interceptPoint(p, out) {
    const b = S.ball;
    let tt = hyp(b.x - p.x, b.y - p.y) / (baseSpeed(p) * 1.2 + 60); tt = clamp(tt, 0, 0.9);
    const f = (1 - Math.exp(-FR_K * tt)) / FR_K;
    out.x = clamp(b.x + b.vx * f, -HL + 22, HL - 22); out.y = clamp(b.y + b.vy * f, -HW + 22, HW - 22);
  }
  function pickRun(p, o) {
    const t = p.team, d = S.dir[t];
    anchor(p, AA);
    let bx = AA.x, by = AA.y, bs = -1e9;
    for (let k = 0; k < 9; k++) {
      let cx, cy;
      if (k === 0) { cx = AA.x; cy = AA.y; }
      else { const ang = (k - 1) / 8 * TAU + p.idx, r = 110 + ((k * 37) % 90); cx = o.x + Math.cos(ang) * r + d * 50; cy = o.y + Math.sin(ang) * r; }
      cx = clamp(cx, -HL + 50, HL - 50); cy = clamp(cy, -HW + 45, HW - 45);
      const dO = hyp(cx - o.x, cy - o.y);
      let sc = (cx - o.x) * d * 0.18;
      if (dO < 70 || dO > 330) sc -= 40;
      sc += clamp(laneMin(t, o.x, o.y, cx, cy, false), 0, 60) * 0.9;
      let no = 1e9; for (let i = 0; i < 10; i++) { const q = S.players[i]; if (q.team === t) continue; const dd = hyp(q.x - cx, q.y - cy); if (dd < no) no = dd; }
      sc += clamp(no, 0, 90) * 0.6;
      for (let i = 0; i < 5; i++) { const m = S.players[t * 5 + i]; if (m === p || m === o || m.role === 'GK') continue; const mx = m.rT > 0 ? m.rx : m.x, my = m.rT > 0 ? m.ry : m.y, dm = hyp(cx - mx, cy - my); if (dm < 85) sc -= (85 - dm) * 0.8; }
      sc -= hyp(cx - AA.x, cy - AA.y) * 0.12;
      if (abs(cx - attackX(t)) < 300) sc += p.role === 'ATT' ? 38 : 20;
      if (sc > bs) { bs = sc; bx = cx; by = cy; }
    }
    p.rx = bx; p.ry = by; p.rT = 0.55 + rnd() * 0.4;
  }
  function aiPlayer(p, dt) {
    const b = S.ball, t = p.team, sk = S.skill[t] + (S.last30 ? 0.05 : 0);
    p.aiT -= dt; if (p.rT > 0) p.rT -= dt;
    if (p.role === 'GK') { keeperAI(p, dt); return; }
    if (p.stunT > 0 || p.slideT > 0) return;
    if (S.phase === 'kickoff') { moveTo(p, p.kx, p.ky, true); const d = hyp(p.kx - p.x, p.ky - p.y); if (d > 30) { p.dvx *= 2.2; p.dvy *= 2.2; } return; }
    if (S.phase === 'goal') {
      if (p.team === S.goalTeam && S.goalP) { const a = p.idx * 1.5 + 0.8; moveTo(p, S.goalP.x + Math.cos(a) * 34, S.goalP.y + Math.sin(a) * 34, false); } else { p.dvx = p.dvy = 0; }
      return;
    }
    if (S.phase === 'halftime' || S.phase === 'fulltime' || S.phase === 'penalties') { p.dvx = p.dvy = 0; return; }
    if (S.phase === 'foul' && S.foul) {
      if (p.team === S.foul.off) { // give the free kick room
        let vx = p.x - S.foul.x, vy = p.y - S.foul.y; const d = hyp(vx, vy) || 1;
        if (d < 110) moveTo(p, S.foul.x + vx / d * 115, S.foul.y + vy / d * 115, true); else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
      } else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
      return;
    }
    const o = b.owner;
    if (o === p) { carrierAI(p, dt); return; }
    if (S.restrict && S.restrict.team === t && S.restrict.t > 0 && o) {
      let vx = p.x - o.x, vy = p.y - o.y; const d = hyp(vx, vy) || 1;
      if (d < 95) moveTo(p, o.x + vx / d * 100, o.y + vy / d * 100, true); else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
      return;
    }
    const ch = S.chase[t];
    if (o && o.team === t) { // attacking support
      if (p.rT <= 0) pickRun(p, o);
      moveTo(p, p.rx, p.ry, hyp(p.rx - p.x, p.ry - p.y) > 70);
    } else if (o) { // defending
      const press = ch[0] === p, cover = ch[1] === p;
      if (press) {
        const d = hyp(o.x - p.x, o.y - p.y);
        moveTo(p, o.x + o.vx * 0.2, o.y + o.vy * 0.2, d > 60);
        if (d < PR * 2 + 10) standTackle(p, false);
      } else if (cover && S.skill[t] > 0.4) {
        const gx = -S.dir[t] * HL; let vx = gx - o.x, vy = -o.y; const m = hyp(vx, vy) || 1;
        moveTo(p, o.x + vx / m * 70, o.y + vy / m * 70, false);
      } else if (p.mark) {
        const m = p.mark, gx = -S.dir[t] * HL; let vx = gx - m.x, vy = -m.y; const dm = hyp(vx, vy) || 1;
        moveTo(p, m.x + vx / dm * 36, m.y + vy / dm * 36, false);
      } else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
    } else { // loose ball
      const pt = S.passTarget && S.passT > 0 && S.passTarget.team === t ? S.passTarget : null;
      if (pt === p || (!pt && ch[0] === p) || (!pt && ch[1] === p && hyp(b.x - p.x, b.y - p.y) < 120)) {
        interceptPoint(p, AA); moveTo(p, AA.x, AA.y, hyp(AA.x - p.x, AA.y - p.y) > 50);
      } else { anchor(p, AA); moveTo(p, AA.x, AA.y, false); }
    }
    void sk;
  }
  function carrierAI(p, dt) {
    const t = p.team, sk = S.skill[t] + (S.last30 ? 0.05 : 0), d = S.dir[t], gx = d * HL;
    p.hold += dt;
    const dg = hyp(gx - p.x, p.y);
    // steer toward the goal mouth, around defenders
    let sx = gx - d * 30 - p.x, sy = clamp(p.y, -85, 85) - p.y;
    let mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
    let nearD = 1e9;
    for (let i = 0; i < 10; i++) {
      const q = S.players[i]; if (q.team === t) continue;
      const qx = q.x - p.x, qy = q.y - p.y, qd = hyp(qx, qy); if (qd < nearD) nearD = qd;
      if (qd < 120 && qd > 1 && (qx * sx + qy * sy) / qd > 0.2) {
        const side = (sx * qy - sy * qx) > 0 ? -1 : 1, w = (1 - qd / 120) * 1.5;
        const px = -sy * side * w, py = sx * side * w;
        sx += px; sy += py;
      }
    }
    mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
    // wall avoidance
    if (abs(p.y) > HW - 50) sy -= sgn(p.y) * 0.8;
    mm = hyp(sx, sy) || 1; sx /= mm; sy /= mm;
    moveTo(p, p.x + sx * 90, p.y + sy * 90, nearD > 85 && p.stam > 0.25);
    if (p.hold < 0.28 || S.phase !== 'play') return;
    if (p.aiT > 0) return;
    p.aiT = lerp(0.42, 0.16, sk) + rnd() * 0.12;
    // shoot
    const range = 230 + 70 * sk;
    if (dg < range && (p.hold > 0.55 || dg < 170)) {
      const blocked = laneMin(t, p.x, p.y, gx, 0, false) < 24;
      const pS = (dg < 170 ? 0.62 : 0.14 + 0.2 * sk) * (blocked ? 0.25 : 1);
      if (rnd() < pS) { aiShoot(p); return; }
    }
    // pass
    const pressed = nearD < 48;
    if (pressed || p.hold > 1.3 + 1.4 * sk || rnd() < 0.08) {
      const m = bestAIReceiver(p);
      if (m && rnd() < (pressed ? 0.85 : 0.45)) { aiPass(p, m); return; }
    }
    if (dg > 380 && sk > 0.7 && rnd() < 0.05) { const m = bestAIReceiver(p); if (m) aiPass(p, m, true); }
  }
  function aiShoot(p) {
    const t = p.team, sk = S.skill[t], gx = attackX(t);
    const gk = S.players[(1 - t) * 5];
    let ty = (gk.y > 0 ? -1 : 1) * (GH - 18) * (0.45 + rnd() * 0.55);
    if (rnd() < 0.18) ty = (rnd() - 0.5) * 70;
    ty += (rnd() - 0.5) * (1.15 - sk) * 76;
    const dx = gx - p.x, dy = ty - p.y;
    shootAt(p, dx, dy, clamp(0.45 + 0.3 * sk * rnd() + 0.15 * rnd(), 0.35, 0.9), 0, (1.1 - sk) * 0.1);
  }
  function bestAIReceiver(p) {
    let best = null, bs = -1e9; const dir = S.dir[p.team];
    for (let i = 0; i < 5; i++) {
      const m = S.players[p.team * 5 + i]; if (m === p || m.role === 'GK') continue;
      const d = hyp(m.x - p.x, m.y - p.y); if (d < 70 || d > 430) continue;
      const lane = laneMin(p.team, p.x, p.y, m.x, m.y, false); if (lane < 26) continue;
      let no = 1e9; for (let j = 0; j < 10; j++) { const q = S.players[j]; if (q.team === p.team) continue; const dd = hyp(q.x - m.x, q.y - m.y); if (dd < no) no = dd; }
      const sc = (m.x - p.x) * dir * 0.25 + Math.min(no, 100) * 0.5 + lane * 0.3 - d * 0.05 + (abs(m.x - attackX(p.team)) < 260 ? 30 : 0);
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  }
  function aiPass(p, m, lob) { passTo(p, m, !!lob, (1 - S.skill[p.team]) * 0.2); }
  function keeperAI(g, dt) {
    const b = S.ball, t = g.team, d = S.dir[t], gx = -d * HL, sk = S.kskill[t];
    if (g.stunT > 0 || g.diving) return;
    if (S.phase === 'kickoff') { moveTo(g, g.kx, g.ky, false); return; }
    if (S.phase === 'goal' || S.phase === 'halftime' || S.phase === 'fulltime') { g.dvx = g.dvy = 0; return; }
    if (S.phase === 'penalties') return;
    if (b.owner === g) {
      g.dvx = g.dvy = 0;
      g.holdT -= dt;
      if (g.holdT <= 0 && S.phase === 'play') {
        let best = null, bs = -1e9;
        for (let i = 1; i < 5; i++) {
          const m = S.players[t * 5 + i]; const dd = hyp(m.x - g.x, m.y - g.y);
          const sc = laneMin(t, g.x, g.y, m.x, m.y, false) * 0.5 + (m.x - g.x) * d * 0.1 - dd * 0.05;
          if (sc > bs) { bs = sc; best = m; }
        }
        if (best) { passTo(g, best, sk > 0.7 && rnd() < 0.3, 0.1); if (t === 0 && !S.demo) { S.ctrl = best.i; S.switchLock = 0.4; } }
      }
      return;
    }
    const bd = hyp(b.x - gx, b.y);
    // incoming shot?
    const toward = (gx - b.x) * b.vx > 0 && !b.owner;
    if (toward && abs(b.vx) > 150 && g.diveRec <= 0 && g.diveDelay < 0) {
      const tc = (gx - b.x) / b.vx;
      if (tc > 0 && tc < 0.62) {
        const yc = b.y + b.vy * tc, zc = b.z + b.vz * tc - 0.5 * GRAV * tc * tc;
        if (abs(yc) < GH + 24 && zc < GOAL_H + 12 && hyp(b.vx, b.vy) > 240) {
          g.diveTo = clamp(yc, -(GH - 8), GH - 8);
          if (rnd() > 0.5 + 0.48 * sk) g.diveTo = clamp(yc + sgn(rnd() - 0.5) * (35 + rnd() * 45), -(GH - 8), GH - 8);
          g.diveDelay = (1 - sk) * 0.14 + 0.02;
        }
      }
    }
    if (g.diveDelay >= 0) { g.diveDelay -= dt; if (g.diveDelay < 0) { keeperDive(g, g.diveTo); g.diveDelay = -1; return; } }
    // positioning on an arc
    const rad = clamp(bd * 0.13 + 16, 24, 66);
    let vx = b.x - gx, vy = b.y; const m = hyp(vx, vy) || 1;
    let tx = gx + d * (vx / m * rad), ty = (vy / m * rad);
    if (b.owner && b.owner.team !== t && hyp(b.owner.x - gx, b.owner.y) < 230) { tx = gx + d * (rad + 10) * (vx / m); }
    ty = clamp(ty, -(GH - 4), GH - 4);
    tx = clamp(tx, gx + d * 14, gx + d * 90);
    // rush a loose ball in the box
    if (!b.owner && abs(b.x - gx) < 120 && abs(b.y) < 120 && hyp(b.vx, b.vy) < 160 && S.chase[t].every((q) => hyp(q.x - b.x, q.y - b.y) > hyp(g.x - b.x, g.y - b.y) + 12) && S.chase[1 - t].every((q) => hyp(q.x - b.x, q.y - b.y) > hyp(g.x - b.x, g.y - b.y) - 8)) { tx = b.x; ty = b.y; }
    moveTo(g, tx, ty, false);
    g.dvx *= 0.7 + 0.45 * sk; g.dvy *= 0.7 + 0.45 * sk;
  }
  function keeperDive(g, toY) {
    if (g.diving) return;
    g.diving = true; g.diveE = 0; g.diveY0 = g.y; g.diveY1 = clamp(toY, -(GH - 6), GH - 6); g.diveDir = g.diveY1 > g.y ? 1 : -1; if (abs(g.diveY1 - g.y) < 8) g.diveDir = 0;
    g.dvx = g.dvy = 0;
  }

  /* ------------------------------------------------------------------ penalty shootout */
  function startPenalties() {
    S.phase = 'penalties'; S.phaseT = 0; S.charging = false;
    S.pen = { kicks: [[], []], k: 0, stage: 'intro', t: 0, aimY: 0, aimH: 26, charge: 0, charging: false, taker: null, keeper: null, saved: false, scored: false, res: '', winner: -1, first: 0, humanDive: false };
    S.ball.owner = null;
    S.players.forEach((p) => { p.dvx = p.dvy = 0; p.diving = false; p.stunT = 0; p.slideT = 0; p.cheer = 0; });
    CAM.snap = true;
    if (!S.demo) arc.toast('Penalty shootout', 'Level after full time', 2200);
    snd.whistle(false);
    penSetup();
    S.pen.stage = 'intro'; S.pen.t = 0;
  }
  function penTeamOf(k) { return k % 2 === 0 ? S.pen.first : 1 - S.pen.first; }
  function penSetup() {
    const pen = S.pen, b = S.ball;
    pen.team = penTeamOf(pen.k);
    const round = Math.floor(pen.k / 2);
    pen.taker = S.players[pen.team * 5 + 1 + (round % 4)];
    pen.keeper = S.players[(1 - pen.team) * 5];
    pen.saved = false; pen.scored = false; pen.charge = 0; pen.charging = false; pen.humanDive = false; pen.aimY = 0; pen.aimH = 26; pen.res = '';
    S.players.forEach((p, i) => { // everyone else waits on the halfway line
      const slot = i % 5;
      p.x = -40 + slot * 6 + (p.team ? 60 : 0); p.y = -120 + slot * 60 + (p.team ? 20 : -20); p.vx = p.vy = 0; p.fx = 1; p.fy = 0; p.diving = false; p.diveRec = 0; p.noBallT = 0;
    });
    pen.taker.x = HL - 110 - 40; pen.taker.y = 0; pen.taker.fx = 1; pen.taker.fy = 0;
    pen.keeper.x = HL - 14; pen.keeper.y = 0; pen.keeper.fx = -1; pen.keeper.fy = 0; pen.keeper.diving = false;
    b.owner = null; b.x = HL - 110; b.y = 0; b.z = 0; b.vx = b.vy = b.vz = 0; b.tn = 0;
    pen.stage = 'aim'; pen.t = 0;
    if (pen.team === 0) S.ctrl = pen.taker.i;
  }
  function penShoot(aimY, aimH, power) {
    const pen = S.pen, b = S.ball, p = pen.taker;
    const v = 430 + 480 * power;
    const x0 = b.x, y0 = b.y, dx = HL - x0, dy = aimY - y0, dm = hyp(dx, dy);
    const hv = v, t = dm / hv;
    const vz = Math.max(0, (aimH - 4 + 0.5 * GRAV * t * t) / t);
    b.vx = dx / dm * hv; b.vy = dy / dm * hv; b.vz = vz; b.z = 4; b.lastTouch = p; b.lastTeam = p.team;
    p.kickT = 0.25; p.fx = 1; p.fy = 0; snd.kick(power);
    pen.stage = 'flight'; pen.t = 0;
    // the AI keeper guesses
    if (pen.keeper.team === 1 || S.demo) {
      const sk = S.kskill[pen.keeper.team];
      const side = abs(aimY) < 18 ? 0 : sgn(aimY);
      let guess = side;
      if (rnd() > 0.34 + 0.3 * sk) { const opts = [-1, 0, 1].filter((s) => s !== side); guess = pick(opts); }
      pen.keeper.diveDelay = 0.04 + (1 - sk) * 0.1; pen.keeper.diveTo = guess * (GH - 14);
    }
  }
  function penBallInGoal() {
    const pen = S.pen; if (!pen || pen.stage !== 'flight' || pen.scored || pen.saved) return;
    const b = S.ball; if (abs(b.y) < GH && b.z < GOAL_H) { pen.scored = true; netHit(1, b.y, b.z, hyp(b.vx, b.vy)); penResolve(true); }
  }
  function penResolve(goal) {
    const pen = S.pen; if (pen.stage === 'result') return;
    pen.kicks[pen.team].push(goal ? 1 : 0);
    pen.stage = 'result'; pen.t = 0; pen.res = goal ? 'goal' : (pen.saved ? 'saved' : 'missed');
    if (goal) { snd.roar(true); if (!S.demo) arc.toast('GOAL!', pen.taker.name, 1500); confetti(HL, 0, pen.team); }
    else { snd.ooh(); if (!S.demo) arc.toast(pen.saved ? 'Saved!' : 'Missed!', pen.taker.name, 1500); }
    pen.k++;
    // decided?
    const a = pen.kicks[0], c = pen.kicks[1], sa = a.reduce((x, y) => x + y, 0), sc = c.reduce((x, y) => x + y, 0);
    const ra = Math.max(0, 5 - a.length), rc = Math.max(0, 5 - c.length);
    if (a.length <= 5 && c.length <= 5 && !(a.length === 5 && c.length === 5)) {
      if (sa > sc + rc) pen.winner = 0; else if (sc > sa + ra) pen.winner = 1;
    } else if (a.length === c.length && a.length >= 5) {
      if (sa !== sc) pen.winner = sa > sc ? 0 : 1;
    }
    void ra;
  }
  function penUpdate(dt) {
    const pen = S.pen, b = S.ball, IN = arc.input;
    pen.t += dt;
    const k = pen.keeper, tk = pen.taker;
    if (pen.stage === 'intro') { if (pen.t > 1.2) penSetup(); return; }
    const humanTaker = pen.team === 0 && !S.demo;
    const humanKeeper = pen.team === 1 && !S.demo;
    if (pen.stage === 'aim') {
      if (humanTaker) {
        const ax = IN.axis();
        pen.aimY = clamp(pen.aimY + ax.x * 150 * dt, -(GH + 24), GH + 24);
        pen.aimH = clamp(pen.aimH - ax.y * 70 * dt, 5, GOAL_H + 20);
        if (IN.hit('KeyK') && !pen.charging) { pen.charging = true; pen.charge = 0.001; }
        if (pen.charging) {
          if (IN.down('KeyK')) pen.charge = Math.min(1, pen.charge + dt / 0.9);
          else { pen.charging = false; let ay = pen.aimY, ah = pen.aimH; const pw = pen.charge; if (pw > 0.92) { ay += (rnd() - 0.5) * 34; ah += (rnd() - 0.2) * 24; } if (pw < 0.3) ah = Math.min(ah, 30); penShoot(ay, ah, Math.max(0.25, pw)); }
        }
      } else if (pen.t > (S.demo ? 0.6 : 1.5)) {
        const sk = S.skill[pen.team];
        const side = pick([-1, 1, -1, 1, 0]);
        let ay = side * (GH - 12 - rnd() * 14) + (rnd() - 0.5) * (1 - sk) * 60;
        let ah = 10 + rnd() * 38 + (rnd() - 0.5) * (1 - sk) * 24;
        penShoot(ay, ah, clamp(0.55 + 0.35 * sk + (rnd() - 0.5) * 0.25, 0.3, 1));
      }
      if (humanKeeper && pen.t > 0.5 && !pen.humanDive) { penHumanDive(); }
    } else if (pen.stage === 'flight') {
      if (humanKeeper && !pen.humanDive) penHumanDive();
      if (k.diveDelay >= 0) { k.diveDelay -= dt; if (k.diveDelay < 0) { keeperDive(k, k.diveTo); k.diveDelay = -1; } }
      updateBall(dt); keeperSaves(); integratePlayers(dt);
      if (pen.saved && pen.t > 0.9) penResolve(false);
      else if (!pen.scored && pen.t > 1.7) penResolve(false);
      if (b.owner && pen.stage === 'flight') penResolve(false);
    } else if (pen.stage === 'result') {
      updateBall(dt); integratePlayers(dt);
      if (pen.t > 1.6) {
        if (pen.winner >= 0) { S.phase = 'fulltime'; S.phaseT = 0; S.penWinner = pen.winner; S.pen.done = true; V.f = S.dir[0]; CAM.snap = true; finishMatch(); }
        else penSetup();
      }
    }
    void tk;
  }
  function penHumanDive() {
    const ax = arc.input.axis(), pen = S.pen;
    if (ax.x < -0.5) { keeperDive(pen.keeper, -(GH - 14)); pen.humanDive = true; }
    else if (ax.x > 0.5) { keeperDive(pen.keeper, GH - 14); pen.humanDive = true; }
    else if (ax.y < -0.6) { keeperDive(pen.keeper, 0); pen.humanDive = true; }
  }

  /* ------------------------------------------------------------------ frame update */
  function stepSim(rawdt) {
    const ph = S.phase;
    S.phaseT += rawdt;
    S.sayCD -= rawdt; S.sfxWall -= rawdt; S.excite = Math.max(0, S.excite - rawdt * 0.35);
    if (S.say) { S.say.age += rawdt; if (S.say.age > S.say.life) S.say = null; }
    // slow motion on a goal
    const targetSlow = (ph === 'goal' && S.phaseT < 1.1 && !arc.reducedMotion) ? 0.42 : 1;
    S.slow = approach(S.slow, targetSlow, rawdt * 3);
    const dt = rawdt * S.slow;
    S.t += dt;
    for (let i = 0; i < 2; i++) { const n = S.nets[i]; if (n.amp > 0) { n.t += rawdt; n.amp = Math.max(0, n.amp - rawdt * 0.7); } }
    if (S.flash > 0) S.flash = Math.max(0, S.flash - rawdt * 1.8);
    if (S.restrict) { S.restrict.t -= dt; if (S.restrict.t <= 0) S.restrict = null; }
    if (S.passT > 0) S.passT -= dt;
    updateParticles(dt);
    crowdTick(rawdt);

    if (ph === 'penalties') { penUpdate(rawdt); return; }

    S.infoT -= dt; if (S.infoT <= 0) { S.infoT = 0.14; computeInfo(); }
    S.markT -= dt; if (S.markT <= 0) { S.markT = 0.45; assignMarks(0); assignMarks(1); }

    if (ph === 'kickoff') {
      for (let i = 0; i < 10; i++) { if (!S.demo && i === S.ctrl) { S.players[i].dvx = S.players[i].dvy = 0; } aiPlayer(S.players[i], dt); }
      // let the controlled player jog too
      if (!S.demo) { const c = S.players[S.ctrl]; moveTo(c, c.kx, c.ky, true); const d = hyp(c.kx - c.x, c.ky - c.y); if (d > 30) { c.dvx *= 2.2; c.dvy *= 2.2; } }
      integratePlayers(dt);
      S.ball.x = 0; S.ball.y = 0;
      if (S.phaseT > 2.1) { S.players.forEach((p) => { p.x = p.kx; p.y = p.ky; p.vx = p.vy = 0; }); beginPlay(); }
      return;
    }
    if (ph === 'halftime') { halftimeStep(rawdt); return; }
    if (ph === 'fulltime') {
      integratePlayers(dt);
      if (S.phaseT > 2.4 && !S.pen) finishMatch();
      return;
    }

    // play, goal, foul share the main loop
    if (!S.demo) { autoSwitch(dt); if (S.phase === 'play' || S.phase === 'foul') humanControl(dt); else { const c = S.players[S.ctrl]; if (c) { c.dvx = c.dvy = 0; } } }
    for (let i = 0; i < 10; i++) { const p = S.players[i]; if (!S.demo && i === S.ctrl && (S.phase === 'play' || S.phase === 'foul')) continue; aiPlayer(p, dt); }
    // keeper dive trigger from shots (delay handled inside keeperAI); human team keeper too
    integratePlayers(dt);
    updateBall(dt);
    if (S.phase === 'play') {
      tryPickup(); keeperSaves(); slideContacts();
      S.matchT += dt;
      if (S.ball.owner) S.stats.poss[S.ball.owner.team] += dt; else S.stats.poss[S.ball.lastTeam] += dt * 0.5;
      const rem = S.T - S.matchT;
      if (!S.last30 && rem <= 30 && rem > 0 && S.matchT > S.T * 0.5) { S.last30 = true; if (!S.demo) { arc.toast('Final 30 seconds', 'Everything on the line', 1800); say(pick(LINES.final), 3); snd.beep(true); } }
      if (S.half === 1 && S.matchT >= S.T / 2) startHalftime();
      else if (S.matchT >= S.T) startFulltime();
    } else if (S.phase === 'goal') {
      if (S.phaseT > 3.5) {
        const conc = 1 - S.goalTeam;
        if (S.matchT >= S.T) startFulltime();
        else if (S.half === 1 && S.matchT >= S.T / 2) startHalftime();
        else { S.kickTeam = conc; S.phase = 'kickoff'; S.phaseT = 0; placeKickoff(false); }
      }
    } else if (S.phase === 'foul') {
      if (S.phaseT > 1.6 && S.foul) {
        const v = S.foul.victim, off = S.foul.off;
        S.phase = 'play'; S.phaseT = 0;
        v.stunT = 0; v.x = S.foul.x; v.y = S.foul.y; v.noBallT = 0;
        takeBall(v); v.hold = -0.2;
        S.restrict = { team: off, t: 1.8 };
        if (v.team === 0 && !S.demo && v.role !== 'GK') S.ctrl = v.i;
        S.foul = null;
      }
    }
    if (S.last30 && !S.demo && S.phase === 'play' && ((S.T - S.matchT) | 0) < 10 && ((S.T - S.matchT) | 0) !== S.lastBeep) { S.lastBeep = (S.T - S.matchT) | 0; snd.beep(false); }
  }
  function halftimeStep(rawdt) {
    const t = S.phaseT;
    if (t < 1.5) { S.fade = 0; return; }
    if (t < 2.1) { S.fade = (t - 1.5) / 0.6; return; }
    if (S.htStage === 0) {
      S.htStage = 1; S.half = 2; S.dir = [-S.dir[0], -S.dir[1]]; S.kickTeam = 1; S.last30 = false;
      placeKickoff(true); CAM.snap = true;
      S.ball.lastTeam = 1;
    }
    if (t < 2.9) { S.fade = 1 - (t - 2.1) / 0.8; return; }
    S.fade = 0; S.phase = 'kickoff'; S.phaseT = 0;
    void rawdt;
  }
  function crowdTick(dt) {
    if (S.demo) return;
    S.crowdT -= dt;
    if (S.crowdT <= 0) {
      S.crowdT = 0.8 + rnd() * 0.6;
      const f = (S.last30 ? 1.6 : 1) + S.excite * 1.4;
      arc.sfx.noise(1.2, { freq: 480 + rnd() * 260, filter: 'bandpass', vol: 0.014 * f });
    }
  }

  function update(dt) { if (!S || S.demo) return; stepSim(dt); }
  function idle(dt) {
    if (!S) return;
    if (arc.state === 'menu' && S.demo) {
      stepSim(dt);
      if (S.matchT > S.T - 2 || S.phase === 'fulltime') startDemo();
    }
  }

  /* ------------------------------------------------------------------ results, cup flow */
  function finishMatch() {
    if (S.demo) { startDemo(); return; }
    S.say = null;
    const h = S.score[0], a = S.score[1];
    const cup = S.cfg.mode === 'cup';
    if (h === a && cup && !S.pen) { startPenalties(); return; }
    showResult();
  }
  function showResult() {
    const h = S.score[0], a = S.score[1], pw = S.penWinner;
    const tie = h === a;
    const won = h > a || (tie && pw === 0), drew = tie && pw === undefined;
    const pts = Math.max(0, h * 100 - a * 50 + (won ? (tie ? 200 : 300) : drew ? 100 : 0));
    const th = S.teams[0], ta = S.teams[1];
    const sc = S.scorers.length ? S.scorers.map((s) => '<b style="color:var(--ink)">' + arc.esc(s.name) + '</b> ' + arc.esc(S.teams[s.team].abbr) + ' ' + s.clock + (s.og ? ' (og)' : '')).join(' &middot; ') : 'No goals. A proper tactical scrap.';
    const tot = S.stats.poss[0] + S.stats.poss[1], pa = Math.round(S.stats.poss[0] / tot * 100);
    let pensLine = '';
    if (S.pen) { const k0 = S.pen.kicks[0].reduce((x, y) => x + y, 0), k1 = S.pen.kicks[1].reduce((x, y) => x + y, 0); pensLine = '<p>Penalties: ' + arc.esc(th.abbr) + ' ' + k0 + ' - ' + k1 + ' ' + arc.esc(ta.abbr) + '</p>'; }
    const html =
      '<p style="color:var(--ink);font-size:18px"><b>' + arc.esc(th.name) + ' ' + h + ' - ' + a + ' ' + arc.esc(ta.name) + '</b></p>' + pensLine +
      '<p>' + sc + '</p>' +
      '<div class="stat"><div>Shots<b>' + S.stats.shots[0] + ' - ' + S.stats.shots[1] + '</b></div><div>On target<b>' + S.stats.sot[0] + ' - ' + S.stats.sot[1] + '</b></div><div>Possession<b>' + pa + '% - ' + (100 - pa) + '%</b></div><div>Fouls<b>' + S.stats.fouls[0] + ' - ' + S.stats.fouls[1] + '</b></div></div>';
    const verdict = won ? (tie ? 'Won on penalties' : 'Victory') : drew ? 'Honours even' : 'Beaten';
    const detail = '<p>Points: goals ' + h * 100 + ' minus conceded ' + a * 50 + (won ? ' plus win bonus ' + (tie ? 200 : 300) : drew ? ' plus draw bonus 100' : '') + ' = <b style="color:var(--ink)">' + pts + '</b></p>';
    if (S.cfg.mode !== 'cup') {
      arc.over({ score: pts, scoreLabel: 'Points', eyebrow: 'Full time', title: verdict, html: html + detail, again: 'Play again' });
      return;
    }
    CUP.total += pts; CUP.results.push({ line: th.short + ' ' + h + '-' + a + ' ' + ta.short + (tie ? ' (pens)' : ''), won });
    const resHtml = '<p>' + CUP.results.map((r, i) => STAGES[i] + ': ' + arc.esc(r.line)).join('<br>') + '</p>';
    if (!won) {
      arc.over({ score: CUP.total, scoreLabel: 'Cup points', eyebrow: 'Knocked out in the ' + STAGES[CUP.idx].toLowerCase(), title: 'Cup run over', html: html + detail + resHtml, again: 'New cup run' });
    } else if (CUP.idx >= 2) {
      CUP.total += 500;
      arc.over({ score: CUP.total, scoreLabel: 'Cup points', eyebrow: 'Banyan Cup', title: 'Champions of the <em>rooftop</em>', html: html + detail + resHtml + '<p>Trophy bonus +500</p>', again: 'New cup run' });
    } else {
      CUP.pending = true;
      arc.over({ eyebrow: STAGES[CUP.idx] + ' won', title: 'Through to the ' + STAGES[CUP.idx + 1].toLowerCase(), html: html + detail + resHtml + '<p>Next: <b style="color:var(--ink)">' + arc.esc(TEAMS[CUP.opps[CUP.idx + 1]].name) + '</b>, and they are tougher.</p>', again: 'Next match' });
    }
  }
  function diffSkill(d) { return d === 'easy' ? 0.3 : d === 'hard' ? 0.82 : 0.56; }
  function startCupMatch() {
    const ch = arc.choices;
    newMatch({ home: CUP.team, away: CUP.opps[CUP.idx], minutes: ch.len || 2, skill: clamp(diffSkill(ch.diff) + CUP.idx * 0.05, 0.2, 0.94), mode: 'cup', matchNo: CUP.idx + 1, label: STAGES[CUP.idx] });
    announceMatch();
  }
  function announceMatch() {
    if (S.cfg.mode === 'cup') arc.toast(S.cfg.label, 'vs ' + S.teams[1].name, 2400);
    else arc.toast(S.teams[0].short + ' v ' + S.teams[1].short, 'Friendly', 2000);
  }
  function startDemo() {
    let a = (rnd() * TEAMS.length) | 0, b = (rnd() * TEAMS.length) | 0; if (b === a) b = (a + 3) % TEAMS.length;
    newMatch({ home: a, away: b, minutes: 2, skill: 0.6, demo: true });
    S.dir = [1, -1]; S.ctrl = -1;
  }

  /* ------------------------------------------------------------------ camera */
  function layout(w, h) {
    const pen = S && S.phase === 'penalties';
    V.portrait = pen ? true : h > w * 0.98;
    V.f = pen ? 1 : (S ? S.dir[0] : 1);
    let base;
    if (pen) base = Math.min(w / 340, h / (430 * TILT));
    else base = V.portrait ? w / 400 : w / 880;
    const Uext = V.portrait ? BH : BW, Vext = V.portrait ? BW : BH;
    const cover = Math.max(w / Uext, h / (Vext * TILT * 0.98));
    CAM.base = Math.max(base, cover); CAM.cover = cover;
    CAM.ox = w / 2; CAM.oy = pen ? h * 0.62 : (V.portrait ? h * 0.55 : h * 0.5);
    const key = w + 'x' + h + V.portrait + V.f;
    if (key !== layoutKey) { layoutKey = key; CAM.snap = true; }
  }
  function camStep(dt) {
    const b = S.ball; let tx, ty, zm = 1;
    if (S.phase === 'penalties') { tx = HL - 92; ty = 0; }
    else {
      tx = b.x + clamp(b.vx * 0.2, -90, 90); ty = b.y + clamp(b.vy * 0.2, -90, 90);
      if (S.phase === 'goal' && S.goalP) { tx = S.goalP.x * 0.6 + b.x * 0.4; ty = S.goalP.y * 0.6 + b.y * 0.4; zm = arc.reducedMotion ? 1.1 : 1.26; }
      else if (S.last30) zm = 1.06;
      if (S.demo) zm = 0.92;
    }
    const tu = uOf(tx, ty), tv = vOf(tx, ty);
    const snap = CAM.snap;
    const kf = snap ? 1 : 1 - Math.exp(-(arc.reducedMotion ? 2.4 : 4.6) * dt);
    CAM.u += (tu - CAM.u) * kf; CAM.v += (tv - CAM.v) * kf;
    CAM.zm += (zm - CAM.zm) * (snap ? 1 : 1 - Math.exp(-2.4 * dt));
    CAM.s = Math.max(CAM.base * CAM.zm, CAM.cover);
    const Uext = V.portrait ? BH : BW, Vext = V.portrait ? BW : BH;
    const s = CAM.s, w = arc.w, h = arc.h;
    const umin = -Uext / 2 + CAM.ox / s, umax = Uext / 2 - (w - CAM.ox) / s;
    const vmin = -Vext / 2 + CAM.oy / (s * TILT), vmax = Vext / 2 - (h - CAM.oy) / (s * TILT);
    CAM.u = umin > umax ? 0 : clamp(CAM.u, umin, umax);
    CAM.v = vmin > vmax ? 0 : clamp(CAM.v, vmin, vmax);
    CAM.snap = false;
  }

  /* ------------------------------------------------------------------ drawing */
  function drawNetSegments(g, side, part) {
    const n = S.nets[side > 0 ? 1 : 0];
    const bx = side * HL, ex = side * (HL + GD);
    const rip = (y, z, back) => {
      if (n.amp <= 0.01) return 0;
      const dy = y - n.y, dz = z - n.z, d2 = dy * dy + dz * dz;
      return side * n.amp * 11 * Math.exp(-d2 / 3600) * Math.sin(n.t * 26 - Math.sqrt(d2) * 0.07) * (back ? 1 : 0.6);
    };
    const k = CAM.s;
    if (part === 'net') {
      // dark interior
      g.fillStyle = 'rgba(4,10,6,.30)';
      P(ex, -GH, 0); const x0 = PX, y0 = PY; P(ex, GH, 0); const x1 = PX, y1 = PY; P(ex, GH, GOAL_H); const x2 = PX, y2 = PY; P(ex, -GH, GOAL_H);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.lineTo(PX, PY); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.42)'; g.lineWidth = Math.max(0.7, 0.55 * k);
      g.beginPath();
      for (let zi = 0; zi <= 4; zi++) { const z = zi * GOAL_H / 4; for (let yi = 0; yi <= 10; yi++) { const y = -GH + yi * GH / 5; P(ex + rip(y, z, true), y, z); if (yi) g.lineTo(PX, PY); else g.moveTo(PX, PY); } }
      for (let yi = 0; yi <= 10; yi++) { const y = -GH + yi * GH / 5; for (let zi = 0; zi <= 4; zi++) { const z = zi * GOAL_H / 4; P(ex + rip(y, z, true), y, z); if (zi) g.lineTo(PX, PY); else g.moveTo(PX, PY); } }
      // side nets
      for (let s = -1; s <= 1; s += 2) {
        const y = s * GH;
        for (let zi = 0; zi <= 4; zi++) { const z = zi * GOAL_H / 4; P(bx, y, z); g.moveTo(PX, PY); P(ex + rip(y, z, false), y, z); g.lineTo(PX, PY); }
        for (let xi = 0; xi <= 4; xi++) { const x = bx + side * xi * GD / 4; for (let zi = 0; zi <= 4; zi++) { const z = zi * GOAL_H / 4; P(x + rip(y, z, false) * xi / 4, y, z); if (zi) g.lineTo(PX, PY); else g.moveTo(PX, PY); } }
      }
      // roof
      for (let yi = 0; yi <= 5; yi++) { const y = -GH + yi * GH * 2 / 5; P(bx, y, GOAL_H); g.moveTo(PX, PY); P(ex + rip(y, GOAL_H, false), y, GOAL_H); g.lineTo(PX, PY); }
      for (let xi = 1; xi <= 4; xi++) { const x = bx + side * xi * GD / 4; P(x, -GH, GOAL_H); g.moveTo(PX, PY); P(x, GH, GOAL_H); g.lineTo(PX, PY); }
      g.stroke();
    } else {
      g.lineCap = 'round'; g.lineJoin = 'round';
      const lw = Math.max(1.6, 2.1 * k);
      const frame = (col, w) => {
        g.strokeStyle = col; g.lineWidth = w;
        g.beginPath();
        [-1, 1].forEach((s) => { P(bx, s * GH, 0); g.moveTo(PX, PY); P(bx, s * GH, GOAL_H); g.lineTo(PX, PY); });
        P(bx, -GH, GOAL_H); g.moveTo(PX, PY); P(bx, GH, GOAL_H); g.lineTo(PX, PY);
        [-1, 1].forEach((s) => { P(bx, s * GH, GOAL_H); g.moveTo(PX, PY); P(ex, s * GH, GOAL_H); g.lineTo(PX, PY); P(ex, s * GH, 0); g.lineTo(PX, PY); P(ex, s * GH, GOAL_H); g.moveTo(PX, PY); });
        P(ex, -GH, GOAL_H); g.moveTo(PX, PY); P(ex, GH, GOAL_H); g.lineTo(PX, PY);
        g.stroke();
      };
      frame('rgba(0,0,0,.45)', lw + 2);
      frame('#f4f6f1', lw);
    }
  }
  function drawGoalLayer(g, phase, side) {
    // phase: 0 = before entities, 1 = after entities
    const vg = vOf(side * HL, 0);
    let netPhase, framePhase;
    if (vg < -1) { netPhase = 0; framePhase = 0; } else if (vg > 1) { netPhase = 1; framePhase = 1; } else { netPhase = 0; framePhase = 1; }
    if (netPhase === phase) drawNetSegments(g, side, 'net');
    if (framePhase === phase) drawNetSegments(g, side, 'frame');
  }

  function playerColors(p) {
    const kit = S.kits[p.team], gk = p.role === 'GK';
    return { shirt: gk ? kit.gk : kit.c1, trim: gk ? kit.gkTrim : kit.c2, shorts: gk ? '#1b1b22' : kit.shorts, sock: gk ? kit.gk : kit.sock };
  }
  function drawShadows(g) {
    const k = CAM.s;
    g.fillStyle = 'rgba(0,0,0,.34)';
    for (let i = 0; i < 10; i++) {
      const p = S.players[i];
      if (S.phase === 'penalties' && !(S.pen && (p === S.pen.taker || p === S.pen.keeper))) continue;
      P(p.x, p.y, 0);
      const lift = p.diving ? Math.sin(Math.min(1, p.diveE / 0.5) * PI) * 10 : 0;
      g.beginPath(); g.ellipse(PX + 2 * k, PY + 1.5 * k, (12 - lift * 0.2) * k, 6 * k, 0, 0, TAU); g.fill();
    }
    const b = S.ball; P(b.x, b.y, 0);
    const sc = clamp(1 - b.z / 220, 0.4, 1);
    g.fillStyle = 'rgba(0,0,0,' + (0.38 * sc).toFixed(2) + ')';
    g.beginPath(); g.ellipse(PX + 1.5 * k, PY + 1 * k, BR * 1.1 * k * sc, BR * 0.6 * k * sc, 0, 0, TAU); g.fill();
  }
  function drawPlayer(g, p, isCtrl) {
    const k = CAM.s; P(p.x, p.y, 0);
    const sx = PX, sy = PY, col = playerColors(p);
    const spd = hyp(p.vx, p.vy), amp = Math.min(1.3, spd / 150);
    const fu = V.portrait ? V.f * p.fy : V.f * p.fx, fv = V.portrait ? -V.f * p.fx : V.f * p.fy;
    let fxs = fu, fys = fv * TILT; const fm = hyp(fxs, fys) || 1; fxs /= fm; fys /= fm;
    const prone = p.slideT > 0 || p.stunT > 0.1 || p.diving;
    if (isCtrl) { // cursor ring
      g.strokeStyle = '#ffd23d'; g.lineWidth = Math.max(1.6, 2.3 * k); g.globalAlpha = 0.9;
      g.beginPath(); g.ellipse(sx, sy + 1.5 * k, 17 * k, 8.6 * k, 0, 0, TAU); g.stroke(); g.globalAlpha = 1;
    }
    if (prone) {
      let ang;
      if (p.diving) {
        if (p.diveDir === 0) ang = -PI / 2;
        else { const du = V.portrait ? V.f * p.diveDir : 0, dv = V.portrait ? 0 : V.f * p.diveDir * TILT; ang = Math.atan2(dv - 0.25, du); }
      } else ang = Math.atan2(fys, fxs);
      const lift = p.diving ? Math.sin(Math.min(1, p.diveE / 0.5) * PI) * 9 : 0;
      g.save(); g.translate(sx, sy - (5 + lift) * k); g.rotate(ang);
      // legs
      g.fillStyle = col.shorts; g.beginPath(); g.ellipse(-8 * k, 0, 6 * k, 5 * k, 0, 0, TAU); g.fill();
      g.fillStyle = col.sock; g.fillRect(-16 * k, -4.5 * k, 8 * k, 3 * k); g.fillRect(-16 * k, 1.5 * k, 8 * k, 3 * k);
      g.fillStyle = '#16161c'; g.beginPath(); g.ellipse(-17 * k, -3 * k, 2.6 * k, 1.8 * k, 0, 0, TAU); g.ellipse(-17 * k, 3 * k, 2.6 * k, 1.8 * k, 0, 0, TAU); g.fill();
      // torso
      g.fillStyle = col.shirt; g.beginPath(); g.ellipse(2 * k, 0, 9 * k, 7.4 * k, 0, 0, TAU); g.fill();
      g.fillStyle = col.trim; g.fillRect(-1 * k, -7 * k, 3 * k, 14 * k);
      // arms forward
      g.fillStyle = p.skin; g.fillRect(8 * k, -7 * k, 8 * k, 2.8 * k); g.fillRect(8 * k, 4.2 * k, 8 * k, 2.8 * k);
      g.beginPath(); g.arc(13 * k, 0, 5.4 * k, 0, TAU); g.fill();
      g.fillStyle = p.hair; g.beginPath(); g.arc(13 * k, 0, 5.4 * k, -PI * 0.7, PI * 0.7, true); g.fill();
      g.restore();
      return;
    }
    // legs
    const lat = 4.2 * k, swing = Math.sin(p.phase) * 5.2 * k * amp, kick = p.kickT > 0 ? 7 * k : 0;
    const lx = -fys, ly = fxs; // lateral screen vector
    const legs = [[1, swing], [-1, -swing]];
    legs.forEach((L, idx) => {
      const fwd = L[1] + (idx === 0 ? kick : 0);
      const px = sx + lx * lat * L[0] + fxs * fwd, py = sy + 1.5 * k + ly * lat * 0.6 * L[0] + fys * fwd * 0.9;
      g.fillStyle = col.sock; g.beginPath(); g.ellipse(px, py - 1.5 * k, 2.5 * k, 3.4 * k, 0, 0, TAU); g.fill();
      g.fillStyle = '#17171d'; g.beginPath(); g.ellipse(px + fxs * 1.2 * k, py + 1.6 * k, 3.1 * k, 2.1 * k, 0, 0, TAU); g.fill();
    });
    // shorts and torso
    const bob = Math.abs(Math.sin(p.phase)) * 1.2 * k * amp;
    g.fillStyle = col.shorts; g.beginPath(); g.ellipse(sx, sy - 2.6 * k - bob, 8.4 * k, 5 * k, 0, 0, TAU); g.fill();
    const ty = sy - 7 * k - bob;
    g.fillStyle = col.shirt; g.beginPath(); g.ellipse(sx, ty, 10.4 * k, 8.6 * k, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(sx - 2 * k, ty - 3.2 * k, 6 * k, 3.4 * k, 0, 0, TAU); g.fill();
    g.fillStyle = col.trim; g.fillRect(sx - 10.2 * k, ty - 0.8 * k, 2.6 * k, 1.6 * k); g.fillRect(sx + 7.6 * k, ty - 0.8 * k, 2.6 * k, 1.6 * k);
    // arms
    const as = Math.sin(p.phase + PI) * 3.4 * k * amp;
    g.fillStyle = p.skin;
    if (p.cheer > 0) { g.fillRect(sx - 12.5 * k, ty - 11 * k - bob, 3 * k, 9 * k); g.fillRect(sx + 9.5 * k, ty - 11 * k - bob, 3 * k, 9 * k); }
    else { g.beginPath(); g.arc(sx - 11.2 * k, ty + as * fys * 0.6 + 1 * k, 2.7 * k, 0, TAU); g.arc(sx + 11.2 * k, ty - as * fys * 0.6 + 1 * k, 2.7 * k, 0, TAU); g.fill(); }
    // head
    const hx = sx + fxs * 1.4 * k, hy = ty - 8.6 * k + fys * 1.2 * k;
    g.fillStyle = p.skin; g.beginPath(); g.arc(hx, hy, 5.4 * k, 0, TAU); g.fill();
    g.fillStyle = p.hair; g.beginPath(); g.arc(hx, hy - 0.6 * k, 5.5 * k, PI * (fys > 0.2 ? 1.1 : 0.95), PI * (fys > 0.2 ? 1.9 : 2.05)); g.fill();
    if (p.role === 'GK') { g.fillStyle = col.trim; g.fillRect(sx - 10 * k, ty + 2 * k, 20 * k, 1.5 * k); }
    // number
    const fs = 9.4 * k;
    if (fs >= 8) {
      g.font = '700 ' + fs.toFixed(1) + 'px ' + F_MONO; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = colDist(col.shirt, '#ffffff') < 190 ? '#15151a' : '#ffffff';
      if (colDist(col.shirt, col.trim) > 200 && p.role !== 'GK') g.fillStyle = col.trim;
      g.fillText(String(p.num), sx, ty + 1.2 * k);
    }
  }
  function drawBall(g) {
    const b = S.ball, k = CAM.s;
    // trail
    if (hyp(b.vx, b.vy) > 340 && !b.owner) {
      for (let i = 1; i <= 6; i++) {
        const j = (b.tn - i + 16) % 8; if (b.tx[j] === 0 && b.ty[j] === 0) continue;
        P(b.tx[j], b.ty[j], b.tz[j] + BR * 0.6);
        g.fillStyle = 'rgba(255,255,255,' + (0.14 - i * 0.02).toFixed(3) + ')';
        g.beginPath(); g.arc(PX, PY, BR * k * (1 - i * 0.1), 0, TAU); g.fill();
      }
    }
    P(b.x, b.y, b.z + BR * 0.7);
    const r = BR * k * 1.12;
    const gr = g.createRadialGradient(PX - r * 0.35, PY - r * 0.4, r * 0.1, PX, PY, r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#cfd3d8');
    g.fillStyle = gr; g.beginPath(); g.arc(PX, PY, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(20,20,25,.7)'; g.lineWidth = Math.max(0.8, 0.6 * k); g.stroke();
    g.fillStyle = '#23252b';
    for (let i = 0; i < 3; i++) { const a = b.spin * 0.8 + i * TAU / 3; g.beginPath(); g.arc(PX + Math.cos(a) * r * 0.5, PY + Math.sin(a) * r * 0.5 * 0.9, r * 0.28, 0, TAU); g.fill(); }
  }
  function drawParticles(g) {
    const k = CAM.s;
    for (let i = 0; i < PT.length; i++) {
      const q = PT[i]; if (!q.a) continue;
      P(q.x, q.y, q.z);
      const a = clamp(q.life / q.max, 0, 1);
      if (q.kind === 1) { g.save(); g.translate(PX, PY); g.rotate(q.rot); g.globalAlpha = Math.min(1, a * 3); g.fillStyle = q.col; g.fillRect(-q.size * k * 0.5, -q.size * k * 0.3, q.size * k, q.size * k * 0.6); g.restore(); }
      else if (q.kind === 0) { g.globalAlpha = a * 0.5; g.fillStyle = q.col; g.beginPath(); g.arc(PX, PY, q.size * k * (1.6 - a), 0, TAU); g.fill(); }
      else { g.globalAlpha = a; g.fillStyle = q.col; g.fillRect(PX - q.size * k * 0.5, PY - q.size * k * 0.5, q.size * k, q.size * k); }
    }
    g.globalAlpha = 1;
  }

  function plate(g, x, y, w, h, r, fill) { rrPath(g, x, y, w, h, r); g.fillStyle = fill || 'rgba(15,13,10,.9)'; g.fill(); g.strokeStyle = 'rgba(251,245,236,.16)'; g.lineWidth = 1; g.stroke(); }
  function drawScoreboard(g, w) {
    const th = S.teams[0], ta = S.teams[1];
    const sw = Math.min(w - 120, 270), x = w / 2 - sw / 2, y = 8, hh = 42;
    plate(g, x, y, sw, hh, 12);
    // team chips
    g.fillStyle = S.kits[0].c1; rrPath(g, x + 8, y + 9, 6, 24, 3); g.fill();
    g.fillStyle = S.kits[1].c1; rrPath(g, x + sw - 14, y + 9, 6, 24, 3); g.fill();
    g.textBaseline = 'middle';
    g.font = '700 12px ' + F_MONO; g.fillStyle = '#fbf5ec'; g.textAlign = 'left'; g.fillText(th.abbr, x + 20, y + 21);
    g.textAlign = 'right'; g.fillText(ta.abbr, x + sw - 20, y + 21);
    g.font = '500 24px ' + F_DISP; g.textAlign = 'right'; g.fillText(String(S.score[0]), w / 2 - 12, y + 17);
    g.textAlign = 'left'; g.fillText(String(S.score[1]), w / 2 + 12, y + 17);
    g.textAlign = 'center'; g.fillStyle = '#a39e94'; g.fillText('-', w / 2, y + 16); g.fillStyle = '#fbf5ec';
    const rem = S.T - S.matchT, hot = S.last30 && S.phase === 'play';
    g.font = '700 11px ' + F_MONO;
    const clockCol = hot ? (arc.reducedMotion || Math.sin(S.t * 6) > -0.2 ? '#ff6940' : '#ffb736') : '#c9a96e';
    g.fillStyle = clockCol;
    const label = S.phase === 'penalties' ? 'PENALTIES' : matchClock() + '  ' + (S.half === 1 ? '1ST' : '2ND') + (S.cfg.mode === 'cup' ? '  ' + (S.cfg.matchNo === 3 ? 'FINAL' : S.cfg.matchNo === 2 ? 'SEMI' : 'QF') : '');
    g.fillText(label, w / 2, y + 34);
  }
  function drawNamePlate(g, w) {
    if (S.demo || S.ctrl < 0 || S.phase === 'penalties') return;
    const p = S.players[S.ctrl]; if (!p) return;
    const nw = 150, x = w / 2 - nw / 2, y = 56;
    plate(g, x, y, nw, 22, 8, 'rgba(15,13,10,.72)');
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = '600 11px ' + F_UI; g.fillStyle = '#ffd23d';
    g.fillText(String(p.num), x + 8, y + 11.5);
    g.fillStyle = '#fbf5ec'; g.fillText(p.name, x + 24, y + 11.5);
    // stamina
    const bw = 40, bx = x + nw - bw - 8;
    g.fillStyle = 'rgba(251,245,236,.15)'; rrPath(g, bx, y + 8, bw, 6, 3); g.fill();
    g.fillStyle = p.tired ? '#ff4d1f' : p.stam < 0.35 ? '#ff8a3d' : '#c9a96e'; rrPath(g, bx, y + 8, Math.max(2, bw * p.stam), 6, 3); g.fill();
  }
  function drawMini(g, w, h) {
    if (S.phase === 'penalties') return;
    const portrait = V.portrait, mw = portrait ? 40 : 78, mh = portrait ? 70 : 44, x = w - mw - 8, y = 8;
    plate(g, x - 3, y - 3, mw + 6, mh + 6, 7, 'rgba(15,13,10,.6)');
    g.fillStyle = 'rgba(38,128,70,.55)'; g.fillRect(x, y, mw, mh);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1);
    g.beginPath();
    if (portrait) { g.moveTo(x, y + mh / 2); g.lineTo(x + mw, y + mh / 2); } else { g.moveTo(x + mw / 2, y); g.lineTo(x + mw / 2, y + mh); }
    g.stroke();
    const mp = (wx, wy) => {
      const u = uOf(wx, wy), v = vOf(wx, wy);
      if (portrait) { TMP.x = x + (u / 295 * 0.5 + 0.5) * mw; TMP.y = y + (v / 515 * 0.5 + 0.5) * mh; } else { TMP.x = x + (u / 515 * 0.5 + 0.5) * mw; TMP.y = y + (v / 295 * 0.5 + 0.5) * mh; }
    };
    for (let i = 0; i < 10; i++) {
      const p = S.players[i]; mp(p.x, p.y);
      g.fillStyle = S.kits[p.team].c1; g.beginPath(); g.arc(TMP.x, TMP.y, p.i === S.ctrl ? 2.8 : 2, 0, TAU); g.fill();
      if (p.i === S.ctrl) { g.strokeStyle = '#ffd23d'; g.lineWidth = 1; g.stroke(); }
    }
    mp(S.ball.x, S.ball.y); g.fillStyle = '#fff'; g.beginPath(); g.arc(TMP.x, TMP.y, 1.8, 0, TAU); g.fill();
    void h;
  }
  function drawSay(g, w, h) {
    if (!S.say) return;
    const q = S.say, a = clamp(Math.min(q.age / 0.2, (q.life - q.age) / 0.4), 0, 1);
    g.save(); g.globalAlpha = a;
    g.font = 'italic 500 15px ' + F_DISP; const tw = g.measureText(q.text).width + 28;
    const y = 84;
    plate(g, w / 2 - tw / 2, y, tw, 28, 14, 'rgba(15,13,10,.78)');
    g.fillStyle = '#fbf5ec'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(q.text, w / 2, y + 14.5);
    g.restore();
  }
  function drawChargeAndNames(g) {
    if (S.demo || S.ctrl < 0 || S.phase === 'penalties') return;
    const p = S.players[S.ctrl]; if (!p) return;
    const k = CAM.s; P(p.x, p.y, 0);
    const sx = PX, sy = PY;
    // name above head
    g.font = '600 ' + Math.max(11, 10.5 * Math.min(k, 1.6)).toFixed(0) + 'px ' + F_UI; g.textAlign = 'center'; g.textBaseline = 'middle';
    const nm = p.name; const tw = g.measureText(nm).width + 12, ny = sy - 33 * k;
    plate(g, sx - tw / 2, ny - 9, tw, 18, 6, 'rgba(15,13,10,.75)');
    g.fillStyle = '#ffd23d'; g.fillText(nm, sx, ny + 0.5);
    // arrow
    g.fillStyle = '#ffd23d'; const ay = ny + 14 + Math.sin(S.t * 6) * 2;
    g.beginPath(); g.moveTo(sx - 5, ay - 3); g.lineTo(sx + 5, ay - 3); g.lineTo(sx, ay + 4); g.closePath(); g.fill();
    if (S.charging && S.charge > 0) {
      g.lineWidth = Math.max(3, 3.4 * k);
      g.strokeStyle = 'rgba(15,13,10,.6)'; g.beginPath(); g.ellipse(sx, sy + 1.5 * k, 22 * k, 11 * k, 0, 0, TAU); g.stroke();
      g.strokeStyle = S.charge > 0.93 ? '#ff4d1f' : S.charge > 0.6 ? '#ffb736' : '#c9a96e';
      g.beginPath(); g.ellipse(sx, sy + 1.5 * k, 22 * k, 11 * k, 0, -PI / 2, -PI / 2 + TAU * S.charge); g.stroke();
    }
  }
  function drawPenaltyHud(g, w, h) {
    const pen = S.pen; if (!pen) return;
    // tally
    const y = 70;
    [0, 1].forEach((t) => {
      const row = pen.kicks[t], n = Math.max(5, row.length);
      const total = n * 16, x0 = 44;
      plate(g, 6, y - 12 + t * 18 - 3, total + 46, 22, 8, 'rgba(15,13,10,.7)');
      g.font = '700 10px ' + F_MONO; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = '#a39e94';
      g.fillText(S.teams[t].abbr, x0 - 6, y + t * 18);
      for (let i = 0; i < n; i++) {
        const cx = x0 + i * 16 + 8, cy = y + t * 18;
        g.beginPath(); g.arc(cx, cy, 5.5, 0, TAU);
        if (i < row.length) { g.fillStyle = row[i] ? '#ffb736' : '#e23a43'; g.fill(); } else { g.strokeStyle = 'rgba(251,245,236,.4)'; g.lineWidth = 1.2; g.stroke(); }
      }
    });
    // aim reticle and prompts
    if (pen.stage === 'aim' && pen.team === 0) {
      P(HL, pen.aimY, pen.aimH);
      g.strokeStyle = '#ffd23d'; g.lineWidth = 2; const r = Math.max(7, 6 * CAM.s);
      g.beginPath(); g.arc(PX, PY, r, 0, TAU); g.moveTo(PX - r * 1.6, PY); g.lineTo(PX - r * 0.5, PY); g.moveTo(PX + r * 1.6, PY); g.lineTo(PX + r * 0.5, PY); g.moveTo(PX, PY - r * 1.6); g.lineTo(PX, PY - r * 0.5); g.moveTo(PX, PY + r * 1.6); g.lineTo(PX, PY + r * 0.5); g.stroke();
      const bw = 170, bx = w / 2 - bw / 2, by = h - (arc.touchMode ? (arc.hudPad ? arc.hudPad().bottom : 188) : 74);
      plate(g, bx - 6, by - 6, bw + 12, 32, 10, 'rgba(15,13,10,.78)');
      g.fillStyle = 'rgba(251,245,236,.15)'; rrPath(g, bx, by + 14, bw, 6, 3); g.fill();
      g.fillStyle = pen.charge > 0.92 ? '#ff4d1f' : '#ffb736'; rrPath(g, bx, by + 14, Math.max(2, bw * pen.charge), 6, 3); g.fill();
      g.font = '600 11px ' + F_MONO; g.fillStyle = '#fbf5ec'; g.textAlign = 'center'; g.fillText('AIM, THEN HOLD SHOOT', w / 2, by + 5);
    } else if (pen.stage === 'aim' && pen.team === 1 && !S.demo) {
      const by = h - (arc.touchMode ? (arc.hudPad ? arc.hudPad().bottom : 188) : 74);
      plate(g, w / 2 - 120, by - 6, 240, 32, 10, 'rgba(15,13,10,.78)');
      g.font = '600 11px ' + F_MONO; g.fillStyle = '#fbf5ec'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('KEEPER: LEFT, UP OR RIGHT TO DIVE', w / 2, by + 10);
    }
  }
  function drawVignette(g, w, h) {
    if (S.last30 && S.phase === 'play') {
      const pulse = arc.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(S.t * 3);
      const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
      gr.addColorStop(0, 'rgba(255,60,30,0)'); gr.addColorStop(1, 'rgba(255,60,30,' + (0.08 + 0.1 * pulse).toFixed(3) + ')');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    if (S.flash > 0) { g.fillStyle = 'rgba(255,244,214,' + (S.flash * 0.22).toFixed(3) + ')'; g.fillRect(0, 0, w, h); }
    if (S.fade > 0) { g.fillStyle = 'rgba(6,5,3,' + clamp(S.fade, 0, 1).toFixed(3) + ')'; g.fillRect(0, 0, w, h); }
  }

  function render(ctx, a) {
    const w = a.w, h = a.h;
    const now = performance.now(), dtR = Math.min(0.05, lastRenderT ? (now - lastRenderT) / 1000 : 0.016); lastRenderT = now;
    ctx.fillStyle = '#070a12'; ctx.fillRect(0, 0, w, h);
    if (!S || !BMP) return;
    layout(w, h);
    const running = a.state === 'play' || (a.state === 'menu' && S.demo);
    camStep(running ? dtR : 0);
    // ground bitmap
    const s = CAM.s, dpr = a.dpr, tl = TILT;
    let ta, tb, tc, td;
    if (V.portrait) { ta = 0; tb = -s * tl * V.f; tc = s * V.f; td = 0; } else { ta = s * V.f; tb = 0; tc = 0; td = s * tl * V.f; }
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(dpr * ta, dpr * tb, dpr * tc, dpr * td, dpr * (CAM.ox - CAM.u * s), dpr * (CAM.oy - CAM.v * s * tl));
    ctx.drawImage(BMP, BX0, BY0, BW, BH);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const g = ctx;
    drawShadows(g);
    drawGoalLayer(g, 0, 1); drawGoalLayer(g, 0, -1);
    // depth sort
    const ents = S.ents;
    for (let i = 0; i < ents.length; i++) { const e = ents[i]; e.k = e.ball ? vOf(S.ball.x, S.ball.y) + 0.5 : vOf(e.x, e.y); }
    for (let i = 1; i < ents.length; i++) { const e = ents[i]; let j = i - 1; while (j >= 0 && ents[j].k > e.k) { ents[j + 1] = ents[j]; j--; } ents[j + 1] = e; }
    const pen = S.phase === 'penalties';
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.ball) { drawBall(g); continue; }
      if (pen && S.pen && e !== S.pen.taker && e !== S.pen.keeper) continue;
      drawPlayer(g, e, !S.demo && e.i === S.ctrl && !pen);
    }
    drawGoalLayer(g, 1, 1); drawGoalLayer(g, 1, -1);
    drawParticles(g);
    // HUD
    if (!(a.state === 'menu')) {
      drawChargeAndNames(g);
      drawScoreboard(g, w);
      drawNamePlate(g, w);
      drawMini(g, w, h);
      if (pen) drawPenaltyHud(g, w, h);
      drawSay(g, w, h);
    }
    drawVignette(g, w, h);
    void tb; void tc; void td;
  }

  /* ------------------------------------------------------------------ boot */
  function debug() {
    if (!S) return {};
    const b = S.ball;
    const owner = b.owner;
    return {
      phase: S.phase, clock: matchClock(), clockSeconds: Math.round(S.matchT * 10) / 10, remaining: Math.round((S.T - S.matchT) * 10) / 10, half: S.half,
      score: { home: S.score[0], away: S.score[1] },
      ball: { x: Math.round(b.x), y: Math.round(b.y), z: Math.round(b.z), vx: Math.round(b.vx), vy: Math.round(b.vy) },
      controlled: S.ctrl, controlledName: S.ctrl >= 0 ? S.players[S.ctrl].name : null,
      possession: owner ? owner.team : b.lastTeam, owner: owner ? owner.i : -1,
      mode: S.cfg.mode || 'friendly', matchNo: S.matchNo, demo: S.demo, teams: [S.teams[0].name, S.teams[1].name],
      stats: S.stats, scorers: S.scorers.length, pen: S.pen ? { stage: S.pen.stage, k: S.pen.k, kicks: S.pen.kicks, winner: S.pen.winner } : null,
      players: S.players.map((p) => [Math.round(p.x), Math.round(p.y)]),
    };
  }

  function start(a, ch) {
    if (CUP && CUP.pending) { CUP.pending = false; CUP.idx++; startCupMatch(); return; }
    const skill = diffSkill(ch.diff);
    const mins = ch.len || 2;
    const my = clamp(ch.team | 0, 0, TEAMS.length - 1);
    if (ch.mode === 'cup') {
      const others = TEAMS.map((_, i) => i).filter((i) => i !== my);
      for (let i = others.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = others[i]; others[i] = others[j]; others[j] = t; }
      CUP = { team: my, idx: 0, opps: others.slice(0, 3), results: [], total: 0, pending: false };
      startCupMatch();
    } else {
      CUP = null;
      let opp = (rnd() * TEAMS.length) | 0; if (opp === my) opp = (opp + 1 + ((rnd() * (TEAMS.length - 1)) | 0)) % TEAMS.length;
      newMatch({ home: my, away: opp, minutes: mins, skill, mode: 'friendly', matchNo: 1 });
      announceMatch();
    }
    S.lastBeep = -1;
  }

  function showMenu() {
    const touch = !!arc.touchMode;
    arc.menu({
      eyebrow: 'Arcade football',
      title: 'Turf <em>Kings</em>',
      showKeys: !touch,
      html: '<p>Five-a-side on a floodlit rooftop cage. The walls are live, so play off the boards and finish low. Defending, K slides in and J tackles. Cup mode is three knockout ties, and a draw goes to penalties.</p>' +
        (touch ? '<p>Stick to move. Shoot (hold to charge), Pass, Sprint and Switch on the right.</p>' : ''),
      options: [
        { id: 'mode', label: 'Mode', choices: [{ v: 'friendly', label: 'Friendly' }, { v: 'cup', label: 'Cup (3 matches)' }] },
        { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
        { id: 'len', label: 'Match length', value: 2, choices: [{ v: 2, label: '2 min' }, { v: 4, label: '4 min' }, { v: 6, label: '6 min' }] },
        { id: 'team', label: 'Your club', value: 0, choices: TEAMS.map((t, i) => ({ v: i, label: t.short })) },
      ],
    });
  }

  arc = Arcade.create({
    slug: 'turf-kings', title: 'Turf Kings', genre: 'Arcade football',
    hint: 'WASD move  |  click or J pass  |  K shoot  |  L sprint',
    touchHint: 'Stick to run, Shoot / Pass / Sprint pads',
    mouse: { cursor: 'pointer', keys: [['Click', 'Pass or tackle']] },
    pauseHtml() {
      if (!S) return '';
      return '<div class="stat"><div>Score<b>' + S.score[0] + ' - ' + S.score[1] + '</b></div><div>Clock<b>' + matchClock() + '</b></div></div>';
    },
    keys: [
      ['WASD / Arrows', 'Move'],
      ['L / Shift', 'Sprint (hold)'],
      ['J / Space', 'Pass, or tackle'],
      ['U', 'Lob pass'],
      ['K', 'Shoot (hold to charge)'],
      ['Q', 'Switch player'],
    ],
    touch: {
      stick: true,
      pads: [{ label: 'Shoot', key: 'KeyK', big: true, hot: true }, { label: 'Pass', key: 'KeyJ' }, { label: 'Sprint', key: 'ShiftLeft' }, { label: 'Switch', key: 'KeyQ' }],
    },
    init(a) {
      arc = a;
      BMP = buildPitch();
      startDemo();
      a.debug = debug;
      showMenu();
    },
    onMenu() { CUP = null; if (!S || !S.demo) startDemo(); },
    start,
    update,
    idle,
    render,
    formatScore: (v) => String(v),
  });

  // test helpers (kept tiny): run the attract-mode simulation fast and read the numbers
  window.__tk = {
    get S() { return S; }, V, step: (dt) => stepSim(dt), TILT, newMatch: (c) => newMatch(c), matchClock: () => matchClock(),
    axisFor(dx, dy) { return V.portrait ? { x: V.f * dy, y: -V.f * dx } : { x: V.f * dx, y: V.f * dy }; },
    simDemo(seconds, skill) {
      newMatch({ home: 0, away: 1, minutes: 2, skill: skill == null ? 0.6 : skill, demo: true });
      S.ctrl = -1;
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) { stepSim(1 / 60); if (S.phase === 'fulltime') break; }
      const r = { score: S.score.slice(), shots: S.stats.shots.slice(), sot: S.stats.sot.slice(), saves: S.stats.saves.slice(), fouls: S.stats.fouls.slice(), phase: S.phase, clock: matchClock() };
      startDemo();
      return r;
    },
  };
})();
